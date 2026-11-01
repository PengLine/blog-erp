/* ============================================================
 * actions.js — 业务动作层(单据流转 + 库存 + 总账联动)
 * 所有写操作都遵循真实 ERP 勾稽关系:
 *   出库过账 → 库存流水 + 结转成本凭证
 *   发票过账 → 应收 + 收入/销项税凭证
 *   收款过账 → 核销应收 + 银行存款凭证
 *   收货过账 → 库存流水(移动加权成本)+ 暂估凭证 借1405/贷2203
 *   票到清算 → 冲销暂估 + 进项税 + 应付,发票与暂估差异回写存货成本
 * ============================================================ */
window.ACT = (function () {

  const r2 = UI.round2;

  /* ---------------- 库存 ---------------- */
  function stockRow(prodCode, whCode) {
    let s = DB.find('stock', prodCode + '-' + whCode);
    if (!s) {
      s = DB.upsert('stock', { _id: prodCode + '-' + whCode, product: prodCode, product_name: (DB.find('products', prodCode) || {}).name || prodCode,
        warehouse: whCode, qty: 0, reserved: 0, available: 0, cost: (DB.find('products', prodCode) || {}).cost || 0, value: 0, status: 'shortage' });
    }
    return s;
  }
  function recalc(s) {
    s.available = s.qty - s.reserved;
    const p = DB.find('products', s.product) || {};
    s.status = s.qty <= 0 ? 'shortage' : (s.available < (p.safety_qty || 0) ? 'low' : 'normal');
    DB.upsert('stock', s);
    return s;
  }
  /** 写库存流水并同步现量;qty 为带符号数量 */
  function move(prodCode, whCode, qty, unitCost, type, ref, note, toWh) {
    assertOpen(DB.today(), '出入库');
    const p = DB.find('products', prodCode) || {};
    const no = DB.nextNo('stock_movements');
    const amount = r2(qty * unitCost);
    DB.insert('stock_movements', { no, date: DB.today(), type, product: prodCode, product_name: p.name || prodCode,
      warehouse: whCode, to_warehouse: toWh || '', qty, unit_cost: r2(unitCost), amount,
      ref: ref || '', user: DB.currentUser(), note: note || '' });
    const s = stockRow(prodCode, whCode);
    s.qty += qty;
    /* 金额按流水发生额逐笔累计(与总账 1405 同源),单位成本再由金额反推,避免二次四舍五入产生账实差 */
    s.value = r2(s.value + amount);
    if (s.qty > 0) s.cost = r2(s.value / s.qty);
    recalc(s);
    return no;
  }
  /** 只调金额不调数量的库存调整(发票与暂估差异、运费资本化),保证库存子账与总账 1405 同源 */
  function valueAdj(prodCode, whCode, delta, type, ref, note) {
    if (!delta) return '';
    assertOpen(DB.today(), '调整库存成本');
    const p = DB.find('products', prodCode) || {};
    const no = DB.nextNo('stock_movements');
    DB.insert('stock_movements', { no, date: DB.today(), type, product: prodCode, product_name: p.name || prodCode,
      warehouse: whCode, to_warehouse: '', qty: 0, unit_cost: 0, amount: r2(delta), ref: ref || '',
      user: DB.currentUser(), note: note || '' });
    const s = stockRow(prodCode, whCode);
    s.value = r2(s.value + delta);
    if (s.qty > 0) s.cost = r2(s.value / s.qty);
    recalc(s);
    return no;
  }
  function available(prodCode, whCode) {
    const s = DB.find('stock', prodCode + '-' + whCode);
    return s ? s.available : 0;
  }
  /** 重算某物料的已占用量(已确认/部分出库且未发完的销售订单) */
  function recomputeReserved(prodCode) {
    DB.where('stock', s => s.product === prodCode).forEach(s => {
      const soDocs = DB.where('sales_order', o => o.warehouse === s.warehouse && (o.status === 'confirmed' || o.status === 'partial'));
      let held = 0;
      soDocs.forEach(o => DB.lines('so_lines', o.no).forEach(l => {
        if (l.product === prodCode) held += Math.max(0, (l.qty || 0) - (l.delivered || 0));
      }));
      s.reserved = Math.min(Math.max(0, s.qty), held);
      recalc(s);
    });
  }

  /* ---------------- 凭证 ---------------- */
  function journal(date, type, ref, memo, lines) {
    assertOpen(date);
    periodRow(DB.monthOf(date));
    const no = DB.nextNo('journal', date);
    let debit = 0;
    lines.forEach((l, i) => {
      debit += (l.debit || 0);
      DB.insert('journal_lines', { doc: no, lineno: i + 1, account: l.acc,
        account_name: (DB.find('gl_account', l.acc) || {}).name || l.acc, memo: l.memo || memo, debit: r2(l.debit || 0), credit: r2(l.credit || 0) });
    });
    DB.insert('journal', { no, date, period: date.slice(0, 7), type, ref, memo, debit: r2(debit), status: 'posted', user: DB.currentUser() });
    updateAccountBalances(lines.map(l => l.acc));
    return no;
  }
  function updateAccountBalances(codes) {
    [...new Set(codes)].forEach(code => {
      const acc = DB.find('gl_account', code); if (!acc) return;
      let bal = 0;
      DB.list('journal_lines').filter(l => l.account === code).forEach(l => bal += (l.debit || 0) - (l.credit || 0));
      acc.balance = r2(bal);
      DB.upsert('gl_account', acc);
    });
  }

  /* ================= 会计期间 · 期末结转与锁期 ================= */

  /** 取(或按需新建)某月的会计期间:跨月过账时自动开新期间,与真实财务系统一致 */
  function periodRow(code) {
    let p = DB.find('period', code);
    if (p) return p;
    const [y, m] = String(code).split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    p = DB.insert('period', { code, start: `${code}-01`, end: `${code}-${String(lastDay).padStart(2, '0')}`,
      status: 'open_period', revenue: 0, expense: 0, profit: 0, retained: 0,
      close_voucher: '', closed_by: '', closed_at: '', note: '' });
    return p;
  }
  /** 期间锁:锁定期间的任何过账都会被拦截(反结账是唯一解锁入口,需财务审批权限) */
  function assertOpen(date, what) {
    const p = DB.find('period', DB.monthOf(date || DB.today()));
    if (p && p.status === 'locked') {
      throw new Error(`会计期间 ${p.code} 已结账锁定(${p.closed_by} 于 ${p.closed_at} 结转),不能在该期间${what || '过账'}。如需修正请先在「期末处理」反结账。`);
    }
    return true;
  }
  /** 某期间的科目发生额(不含结转凭证本身) */
  function periodActivity(code) {
    const docs = {};
    DB.where('journal', j => j.period === code && j.type !== 'close').forEach(j => { docs[j.no] = 1; });
    const out = {};
    DB.list('journal_lines').forEach(l => {
      if (!docs[l.doc]) return;
      const a = out[l.account] || (out[l.account] = { debit: 0, credit: 0, name: l.account_name });
      a.debit = r2(a.debit + (l.debit || 0));
      a.credit = r2(a.credit + (l.credit || 0));
    });
    return { byAccount: out, vouchers: Object.keys(docs).length };
  }
  /** 期间损益汇总:收入取贷方净额,成本费用取借方净额 */
  function periodPnL(code) {
    const act = periodActivity(code);
    let revenue = 0, cost = 0, expense = 0;
    DB.list('gl_account').forEach(a => {
      const x = act.byAccount[a.code]; if (!x) return;
      const net = r2(x.credit - x.debit);
      if (a.type === 'revenue') revenue += net;
      else if (a.type === 'cost') cost += -net;
      else if (a.type === 'expense') expense += -net;
    });
    return { revenue: r2(revenue), cost: r2(cost), expense: r2(expense), totalCost: r2(cost + expense), profit: r2(revenue - cost - expense), act };
  }
  /** 生成结转分录:逐笔对冲损益类科目的本期净额,差额全部进 3131 本年利润 */
  function buildCloseLines(code) {
    const pnl = periodPnL(code);
    const lines = [];
    pnl.act && DB.list('gl_account').forEach(a => {
      if (['revenue', 'cost', 'expense'].indexOf(a.type) < 0) return;
      const x = pnl.act.byAccount[a.code]; if (!x) return;
      const net = r2(x.debit - x.credit);
      if (Math.abs(net) < .005) return;
      lines.push(net > 0
        ? { acc: a.code, credit: net, memo: `结转${a.name}` }
        : { acc: a.code, debit: -net, memo: `结转${a.name}` });
    });
    const toProfit = r2(lines.reduce((s, l) => s + (l.credit || 0), 0));
    const fromRevenue = r2(lines.reduce((s, l) => s + (l.debit || 0), 0));
    if (fromRevenue > .004) lines.push({ acc: '3131', credit: fromRevenue, memo: '本年利润—结转收入类' });
    if (toProfit > .004) lines.push({ acc: '3131', debit: toProfit, memo: '本年利润—结转成本类' });
    return { lines, pnl };
  }
  /** 期末结账:顺序结转 → 生成结转凭证 → 锁定期间 */
  function closePeriod(code) {
    const cur = DB.monthOf(DB.today());
    code = code || cur;
    assertPerm('period', 'approve');
    const p = periodRow(code);
    if (p.status === 'locked') throw new Error(`期间 ${code} 已经结账锁定,无需重复结转。`);
    if (code >= cur) throw new Error(`${code} 是当前会计期间,月末才可结转结账;请先在新月份继续业务。`);
    const earlier = DB.list('period')
      .filter(x => x.code < code && x.status === 'open_period' && periodActivity(x.code).vouchers > 0)
      .map(x => x.code).sort();
    if (earlier.length) throw new Error(`更早的期间 ${earlier[0]} 仍有未结转损益,请按月份顺序结账。`);
    const built = buildCloseLines(code);
    let no = '';
    if (built.lines.length) no = journal(p.end, 'close', code, `期末损益结转—${code}(收入 ¥${UI.money(built.pnl.revenue)} / 成本费用 ¥${UI.money(built.pnl.totalCost)})`, built.lines);
    Object.assign(p, {
      status: 'locked', revenue: built.pnl.revenue, expense: built.pnl.totalCost, profit: built.pnl.profit,
      retained: r2(-(DB.find('gl_account', '3131').balance || 0)), close_voucher: no,
      closed_by: DB.currentUser(), closed_at: DB.today(),
      note: no ? `本期结转净利润 ¥${UI.money(built.pnl.profit)} 转入本年利润 3131;损益类科目本期余额已清零。`
        : '本期无损益类发生额,仅锁定期间。'
    });
    DB.upsert('period', p);
    DB.log('财务管理', '期末结账', code, `${no ? '生成结转凭证 ' + no + ',' : ''}本期净利润 ¥${UI.money(built.pnl.profit)},期间锁定`);
    return no;
  }
  /** 反结账:仅允许从最近一个已锁期间往前逐个回退,删掉结转凭证并回补科目余额 */
  function reopenPeriod(code) {
    assertPerm('period', 'approve');
    const p = DB.find('period', code);
    if (!p) throw new Error(`会计期间 ${code} 不存在。`);
    if (p.status !== 'locked') throw new Error(`期间 ${code} 尚未结账,无需反结账。`);
    const later = DB.list('period').filter(x => x.code > code && x.status === 'locked').map(x => x.code).sort();
    if (later.length) throw new Error(`期间 ${later[later.length - 1]} 晚于 ${code} 且仍处锁定状态,请先反结账较晚的期间。`);
    const vouchers = DB.where('journal', j => j.period === code && j.type === 'close');
    const accs = [...new Set(DB.list('journal_lines').filter(l => vouchers.some(v => v.no === l.doc)).map(l => l.account))];
    vouchers.forEach(v => { DB.setLines('journal_lines', v.no, []); DB.remove('journal', v.no); });
    updateAccountBalances(accs);
    Object.assign(p, { status: 'open_period', close_voucher: '', closed_by: '', closed_at: '',
      revenue: 0, expense: 0, profit: 0, retained: 0, note: '反结账回退,期间重新开放过账。' });
    DB.upsert('period', p);
    DB.log('财务管理', '反结账', code, `作废 ${vouchers.length} 张结转凭证,期间 ${code} 重新开放`);
    return vouchers.length;
  }

  /* ---------------- 通用单据工具 ---------------- */
  function lineTotal(l, withTax) {
    const net = (l.qty || 0) * (l.price || 0) * (1 - (l.discount || 0));
    return r2(withTax === false ? net : net * (1 + (l.tax_rate || 0) / 100));
  }
  function docTotal(lines, withTax) { return r2(lines.reduce((s, l) => s + lineTotal(l, withTax), 0)); }

  /* ================= 销售链路 ================= */
  function saveSO(no, header, lines) {
    const t = DB.find('sales_order', no);
    if (!t) throw new Error('订单不存在');
    if (t.status !== 'draft') throw new Error('仅草稿状态可编辑,请先反审核');
    const total = docTotal(lines);
    Object.assign(t, header, { total: total, amount: total });
    lines.forEach(l => { l.delivered = l.delivered || 0; if (l.amount == null) l.amount = r2(l.qty * l.price * (1 - (l.discount || 0))); });
    DB.setLines('so_lines', no, lines);
    DB.upsert('sales_order', t);
    DB.log('销售管理', '修改销售订单', no, `共 ${lines.length} 行,金额 ¥${UI.money(t.total)}`);
    return t;
  }
  function confirmSO(no) {
    const t = DB.find('sales_order', no);
    const lines = DB.lines('so_lines', no);
    if (!lines.length) throw new Error('订单行为空,无法审核');
    // 可用量检查(仅提示,不阻断——真实系统允许缺货审核)
    const shortage = lines.filter(l => available(l.product, t.warehouse) < l.qty);
    t.status = 'confirmed';
    DB.upsert('sales_order', t);
    lines.forEach(l => recomputeReserved(l.product));
    DB.log('销售管理', '审核销售订单', no, shortage.length ? `存在 ${shortage.length} 行缺货` : '库存充足');
    return { shortage: shortage.length };
  }
  function cancelSO(no) {
    const t = DB.find('sales_order', no);
    if (t.status === 'done') throw new Error('已完成的订单不可取消,请通过销售退货处理');
    const wasConfirmed = t.status === 'confirmed' || t.status === 'partial';
    t.status = 'cancelled'; DB.upsert('sales_order', t);
    if (wasConfirmed) DB.lines('so_lines', no).forEach(l => recomputeReserved(l.product));
    DB.log('销售管理', '取消销售订单', no, '');
  }
  function reopenSO(no) {
    const t = DB.find('sales_order', no);
    if (DB.list('delivery').some(d => d.so === no)) throw new Error('已存在关联出库单,不能反审核');
    t.status = 'draft'; DB.upsert('sales_order', t);
    DB.lines('so_lines', no).forEach(l => recomputeReserved(l.product));
    DB.log('销售管理', '反审核销售订单', no, '');
  }
  /** 创建并过账销售出库单 */
  function createDelivery(soNo, plan) {
    const so = DB.find('sales_order', soNo);
    if (!so) throw new Error('订单不存在');
    if (!['confirmed', 'partial'].includes(so.status)) throw new Error('仅已确认/部分出库的订单可以发货');
    const rows = plan.filter(p => p.qty > 0);
    if (!rows.length) throw new Error('请至少填写一行出库数量');
    const soLines = DB.lines('so_lines', soNo);
    const dNo = DB.nextNo('delivery');
    let costSum = 0;
    rows.forEach((p, i) => {
      const l = soLines.find(x => x.product === p.product);
      const prod = DB.find('products', p.product) || {};
      costSum += p.qty * (prod.cost || 0);
      move(p.product, so.warehouse, -p.qty, prod.cost || 0, 'sales_delivery', dNo, '销售出库', '');
      l.delivered = (l.delivered || 0) + p.qty;
      DB.insert('dl_lines', { doc: dNo, lineno: i + 1, product: p.product, product_name: prod.name, qty: p.qty, price: prod.cost || 0, amount: r2(p.qty * (prod.cost || 0)), tax_rate: prod.tax_rate || 13 });
      recomputeReserved(p.product);
    });
    DB.setLines('so_lines', soNo, soLines);
    DB.insert('delivery', { no: dNo, date: DB.today(), so: soNo, customer: so.customer, customer_name: so.customer_name,
      warehouse: so.warehouse, amount: r2(costSum), status: 'posted', carrier: plan._carrier || '顺丰速运', tracking: plan._tracking || '', user: DB.currentUser(), note: plan._note || '' });
    const allDone = soLines.every(l => (l.delivered || 0) >= l.qty);
    const noneDone = soLines.every(l => !(l.delivered > 0));
    so.status = allDone ? 'done' : (noneDone ? 'confirmed' : 'partial');
    DB.upsert('sales_order', so);
    journal(DB.today(), 'sales_delivery', dNo, `销售出库结转成本—${so.customer_name}`, [
      { acc: '5001', debit: costSum }, { acc: '1405', credit: costSum }]);
    DB.log('销售管理', '过账销售出库单', dNo, `来源 ${soNo},出库成本 ¥${UI.money(costSum)}`);
    return dNo;
  }
  /** 由销售订单开票 */
  function createInvoiceFromSO(soNo, plan) {
    const so = DB.find('sales_order', soNo);
    const rows = plan.filter(p => p.qty > 0);
    if (!rows.length) throw new Error('请至少填写一行开票数量');
    const iNo = DB.nextNo('invoice');
    const cust = DB.find('customers', so.customer) || {};
    const custName = so.customer_name || cust.name || so.customer;
    const terms = cust.payment_terms || 'NET30';
    const daysMap = { NET60: 60, NET45: 45, NET30: 30, COD: 7, PRE50: 7, PRE100: 0 };
    const due = DB.addDays(DB.today(), daysMap[terms] || 30);
    let gross = 0, net = 0;
    rows.forEach((p, i) => {
      const l = DB.lines('so_lines', soNo).find(x => x.product === p.product) || {};
      const amount = r2(p.qty * (p.price || l.price || 0) * (1 - (l.discount || 0)));
      const tax = r2(amount * ((l.tax_rate || 13) / 100));
      gross += amount + tax; net += amount;
      DB.insert('iv_lines', { doc: iNo, lineno: i + 1, product: p.product, product_name: (DB.find('products', p.product) || {}).name,
        qty: p.qty, price: p.price || l.price || 0, discount: l.discount || 0, amount, tax_rate: l.tax_rate || 13 });
    });
    gross = r2(gross); net = r2(net);
    const relatedDl = DB.where('delivery', d => d.so === soNo);
    DB.insert('invoice', { no: iNo, date: DB.today(), customer: so.customer, customer_name: so.customer_name, so: soNo,
      delivery: relatedDl.length ? relatedDl[relatedDl.length - 1].no : '', due_date: due, currency: 'CNY',
      status: 'open', total: gross, paid: 0, balance: gross, note: '' });
    journal(DB.today(), 'sales_invoice', iNo, `确认销售收入—${so.customer_name}`, [
      { acc: '1122', debit: gross, memo: '应收—' + so.customer_name },
      { acc: '4001', credit: net, memo: '不含税收入' },
      { acc: '2221', credit: r2(gross - net), memo: '销项税额' }]);
    DB.log('销售管理', '开具销售发票', iNo, `来源 ${soNo},价税合计 ¥${UI.money(gross)}`);
    return iNo;
  }
  /** 收款:创建并过账收款单 */
  function createReceipt(invNo, amount, method, note) {
    const inv = DB.find('invoice', invNo);
    if (!inv) throw new Error('发票不存在');
    if (inv.balance <= 0.01) throw new Error('该发票已结清');
    const amt = r2(Math.min(+amount, inv.balance));
    if (!(amt > 0)) throw new Error('收款金额必须大于 0');
    const no = DB.nextNo('receipt');
    DB.insert('receipt', { no, date: DB.today(), customer: inv.customer, customer_name: inv.customer_name, invoice: invNo,
      amount: amt, method: method || '银行转账', status: 'posted', user: DB.currentUser(), note: note || '' });
    inv.paid = r2(inv.paid + amt); inv.balance = r2(inv.total - inv.paid);
    inv.status = inv.balance <= 0.01 ? 'paid' : 'partial_paid';
    DB.upsert('invoice', inv);
    journal(DB.today(), 'sales_receipt', no, `收到客户货款—${inv.customer_name}`, [
      { acc: '1002', debit: amt }, { acc: '1122', credit: amt, memo: '核销 ' + invNo }]);
    DB.log('财务管理', '过账收款单', no, `核销发票 ${invNo} ¥${UI.money(amt)}`);
    return no;
  }

  /* ================= 采购链路 ================= */
  function confirmPO(no) {
    const t = DB.find('purchase_order', no);
    if (!DB.lines('po_lines', no).length) throw new Error('采购订单行为空');
    t.status = 'confirmed'; DB.upsert('purchase_order', t);
    DB.log('采购管理', '审核采购订单', no, '订单已下发供应商');
  }
  function cancelPO(no) {
    const t = DB.find('purchase_order', no);
    if (DB.list('gr').some(g => g.po === no)) throw new Error('已存在收货记录,不能取消');
    t.status = 'cancelled'; DB.upsert('purchase_order', t);
    DB.log('采购管理', '取消采购订单', no, '');
  }
  function reopenPO(no) {
    const t = DB.find('purchase_order', no);
    if (DB.list('gr').some(g => g.po === no)) throw new Error('已存在收货记录,不能反审核');
    t.status = 'draft'; DB.upsert('purchase_order', t);
    DB.log('采购管理', '反审核采购订单', no, '');
  }
  function createGR(poNo, plan) {
    const po = DB.find('purchase_order', poNo);
    if (!['confirmed', 'partial'].includes(po.status)) throw new Error('仅已确认/部分收货的订单可以收货');
    const rows = plan.filter(p => p.qty > 0);
    if (!rows.length) throw new Error('请填写入库数量');
    const poLines = DB.lines('po_lines', poNo);
    const gNo = DB.nextNo('gr');
    let costSum = 0;
    rows.forEach((p, i) => {
      const l = poLines.find(x => x.product === p.product);
      const prod = DB.find('products', p.product) || {};
      const unit = p.price || l.price || prod.cost || 0;
      costSum += p.qty * unit;
      move(p.product, po.warehouse, p.qty, unit, 'po_receipt', gNo, '采购入库', '');
      const row = DB.find('stock', p.product + '-' + po.warehouse);
      if (row && row.cost && prod.code) { prod.cost = row.cost; DB.upsert('products', prod); }
      l.received = (l.received || 0) + p.qty;
      DB.insert('gr_lines', { doc: gNo, lineno: i + 1, product: p.product, product_name: prod.name, qty: p.qty, price: unit, amount: r2(p.qty * unit), tax_rate: prod.tax_rate || 13 });
    });
    DB.setLines('po_lines', poNo, poLines);
    DB.insert('gr', { no: gNo, date: DB.today(), po: poNo, supplier: po.supplier, supplier_name: po.supplier_name,
      warehouse: po.warehouse, amount: r2(costSum), status: 'posted', bill: '', user: DB.currentUser(),
      note: '货到票未到,按不含税采购成本暂估入账。' });
    /* 收货即入账:借 库存商品 / 贷 应付暂估(GR/IR),不与供应商对账,票到再清算 */
    journal(DB.today(), 'gr_accrual', gNo, `采购入库暂估—${po.supplier_name}`, [
      { acc: '1405', debit: r2(costSum), memo: '货到票未到暂估入库' },
      { acc: '2203', credit: r2(costSum), memo: '暂估应付—' + po.supplier_name }]);
    const allDone = poLines.every(l => (l.received || 0) >= l.qty);
    po.status = allDone ? 'done' : (poLines.some(l => l.received > 0) ? 'partial' : 'confirmed');
    DB.upsert('purchase_order', po);
    DB.log('采购管理', '过账采购收货单', gNo, `来源 ${poNo},入库成本 ¥${UI.money(costSum)}`);
    return gNo;
  }
  /** 票到清算:冲销 2203 暂估 → 确认进项税与应付,发票价与暂估的差异及资本化运费回写存货成本 */
  function createBillFromGR(grNo, plan) {
    const gr = DB.find('gr', grNo);
    if (!gr) throw new Error('收货单不存在');
    if (gr.status === 'settled' || DB.list('bill').some(b => b.gr === grNo)) throw new Error('该收货单已清算,不能重复开票');
    plan = plan || {};
    const grLines = DB.lines('gr_lines', grNo);
    /* 发票数量必须与收货一致:数量差异应走采购退货或补货单,不允许在账单里改 */
    const lines = grLines.map(l => {
      const o = (plan.lines || []).find(x => x.product === l.product) || {};
      const price = o.price === undefined || o.price === null || o.price === '' ? l.price : +o.price;
      const rate = o.tax_rate === undefined || o.tax_rate === null || o.tax_rate === '' ? (l.tax_rate || 0) : +o.tax_rate;
      return { product: l.product, product_name: l.product_name, qty: l.qty, price: r2(price), tax_rate: rate,
        accrue: r2(l.qty * l.price), amount: r2(l.qty * price) };
    });
    const goodsNet = r2(lines.reduce((s, l) => s + l.amount, 0));
    const goodsVat = r2(lines.reduce((s, l) => s + l.amount * l.tax_rate / 100, 0));
    /* 采购运费按准则资本化计入存货成本 */
    const freight = r2(+plan.freight || 0);
    const freightRate = plan.freight_rate === undefined || plan.freight_rate === null || plan.freight_rate === '' ? 9 : +plan.freight_rate;
    const freightVat = r2(freight * freightRate / 100);
    const net = r2(goodsNet + freight), vat = r2(goodsVat + freightVat), total = r2(net + vat);
    const accrual = r2(gr.amount || 0), diff = r2(net - accrual);
    const sup = DB.find('suppliers', gr.supplier) || {};
    const daysMap = { NET60: 60, NET45: 45, NET30: 30, PRE50: 15, PRE100: 0, COD: 0 };
    const bNo = DB.nextNo('bill');
    const due = DB.addDays(DB.today(), daysMap[sup.payment_terms || 'NET30'] || 30);

    DB.insert('bill', { no: bNo, date: DB.today(), supplier: gr.supplier, supplier_name: gr.supplier_name, po: gr.po, gr: grNo,
      kind: 'goods', due_date: due, status: 'open', total, net, vat, accrual, paid: 0, balance: total,
      note: diff ? `冲销暂估 ¥${UI.money(accrual)};发票价与运费差异 ¥${UI.money(diff)} 已调整存货成本` : `冲销暂估 ¥${UI.money(accrual)}` });
    lines.forEach((l, i) => DB.insert('bill_lines', { doc: bNo, lineno: i + 1, product: l.product, product_name: l.product_name,
      qty: l.qty, price: l.price, amount: l.amount, tax_rate: l.tax_rate, memo: l.accrue !== l.amount ? '暂估 ¥' + UI.money(l.accrue) : '' }));
    if (freight) DB.insert('bill_lines', { doc: bNo, lineno: lines.length + 1, product: '', product_name: '运输装卸费(计入存货成本)',
      qty: 1, price: freight, amount: freight, tax_rate: freightRate, memo: plan.freight_memo || '供应商代垫运费' });

    /* 差异 + 运费按行价值分摊回库存子账,末行兜住尾差,保证 库存子账 = 总账 1405 */
    const base = goodsNet || 1;
    let booked = 0;
    lines.forEach((l, i) => {
      const d = i === lines.length - 1 ? r2(diff - booked) : r2(l.amount - l.accrue + freight * (l.amount / base));
      booked = r2(booked + d);
      valueAdj(l.product, gr.warehouse, d, 'bill_diff', bNo, d >= 0 ? '发票差异/运费资本化调增存货' : '发票差异调减存货');
    });

    const jl = [{ acc: '2203', debit: accrual, memo: '冲销到货暂估' }, { acc: '2221', debit: vat, memo: '进项税额' }];
    jl.push(diff >= 0 ? { acc: '1405', debit: diff, memo: '发票差异与运费调整存货成本' }
                      : { acc: '1405', credit: -diff, memo: '发票差异与运费调整存货成本' });
    jl.push({ acc: '2202', credit: total, memo: '应付—' + gr.supplier_name });
    journal(DB.today(), 'ap_bill', bNo, '票到清算—' + gr.supplier_name, jl);

    gr.status = 'settled'; gr.bill = bNo; DB.upsert('gr', gr);
    DB.log('采购管理', '票到清算生成采购账单', bNo, `价税合计 ¥${UI.money(total)},冲销暂估 ¥${UI.money(accrual)},差异 ¥${UI.money(diff)}`);
    return bNo;
  }
  function createPayment(billNo, amount, method, note) {
    const b = DB.find('bill', billNo);
    if (!b) throw new Error('账单不存在');
    if (b.balance <= 0.01) throw new Error('该账单已付清');
    const amt = r2(Math.min(+amount, b.balance));
    if (!(amt > 0)) throw new Error('付款金额必须大于 0');
    const no = DB.nextNo('payment');
    DB.insert('payment', { no, date: DB.today(), supplier: b.supplier, supplier_name: b.supplier_name, bill: billNo, amount: amt,
      method: method || '银行转账', account: '招商银行杭州分行 5719****8842', status: 'posted', user: DB.currentUser(), note: note || '' });
    b.paid = r2(b.paid + amt); b.balance = r2(b.total - b.paid);
    b.status = b.balance <= 0.01 ? 'paid' : 'partial_paid';
    DB.upsert('bill', b);
    journal(DB.today(), 'ap_payment', no, `支付供应商货款—${b.supplier_name}`, [
      { acc: '2202', debit: amt }, { acc: '1002', credit: amt }]);
    DB.log('财务管理', '过账付款单', no, `核销账单 ${billNo} ¥${UI.money(amt)}`);
    return no;
  }
  function approvePR(no, ok, memo) {
    const t = DB.find('purchase_req', no);
    if (!['pending', 'draft'].includes(t.status)) throw new Error('仅待审批的申请可以审批');
    t.status = ok ? 'approved' : 'rejected';
    t.approver = DB.currentUser();
    t.note = memo || t.note;
    DB.upsert('purchase_req', t);
    DB.log('采购管理', ok ? '审批通过采购申请' : '驳回采购申请', no, memo || '');
  }
  function prToPO(no) {
    const pr = DB.find('purchase_req', no);
    if (!['approved', 'converted'].includes(pr.status)) throw new Error('申请需先审批通过');
    const lines = DB.lines('pr_lines', no);
    const sup = DB.list('suppliers').filter(s => s.status === 'enabled').find(s => s.category === (DB.find('products', lines[0] && lines[0].product) || {}).category) || DB.find('suppliers', 'SU-001');
    const poNo = DB.nextNo('purchase_order');
    const poLines = lines.map(l => ({ product: l.product, product_name: l.product_name, qty: l.qty, received: 0, price: l.price, tax_rate: (DB.find('products', l.product) || {}).tax_rate || 13, amount: r2(l.qty * l.price) }));
    DB.insert('purchase_order', { no: poNo, date: DB.today(), supplier: sup ? sup.code : '', supplier_name: sup ? sup.name : '',
      warehouse: 'WH-HZ01', expected_date: pr.need_date || DB.addDays(DB.today(), 14), pr: no, currency: 'CNY',
      payment_terms: sup ? sup.payment_terms : 'NET30', buyer: DB.currentUser(), status: 'draft',
      total: docTotal(poLines), note: '由采购申请 ' + no + ' 转化' });
    DB.setLines('po_lines', poNo, poLines);
    pr.status = 'converted'; DB.upsert('purchase_req', pr);
    DB.log('采购管理', '采购申请转订单', poNo, '来源申请 ' + no);
    return poNo;
  }

  /* ================= 库存动作 ================= */
  function createTransfer(from, to, lines, note) {
    const rows = lines.filter(l => l.qty > 0);
    if (!rows.length) throw new Error('请填写调拨数量');
    if (from === to) throw new Error('调出仓与调入仓不能相同');
    const no = DB.nextNo('transfer');
    DB.insert('transfer', { no, date: DB.today(), from_wh: from, to_wh: to, status: 'done', user: DB.currentUser(), note: note || '' });
    rows.forEach((l, i) => {
      const p = DB.find('products', l.product) || {};
      if (available(l.product, from) < l.qty) throw new Error(`${p.name} 在调出仓可用量不足`);
      DB.insert('tr_lines', { doc: no, lineno: i + 1, product: l.product, product_name: p.name, qty: l.qty });
      move(l.product, from, -l.qty, p.cost, 'transfer', no, '调拨出库', to);
      move(l.product, to, l.qty, p.cost, 'transfer', no, '调拨入库', from);
      recomputeReserved(l.product);
    });
    DB.log('库存管理', '过账库存调拨单', no, `${rows.length} 行,${from} → ${to}`);
    return no;
  }
  function postStocktake(no, lines, note) {
    const st = DB.find('stocktake', no);
    const rows = lines.filter(l => (l.actual_qty !== null && l.actual_qty !== undefined && l.actual_qty !== '') );
    let diffAmount = 0, diffLines = 0;
    DB.setLines('stk_lines', no, rows.map((l, i) => {
      const book = available(l.product, st.warehouse) + 0;
      const diff = (+l.actual_qty) - book;
      if (diff !== 0) { diffLines++; diffAmount += diff * ((DB.find('products', l.product) || {}).cost || 0); }
      return Object.assign({}, l, { lineno: i + 1, book_qty: book, diff, product_name: (DB.find('products', l.product) || {}).name,
        cost: (DB.find('products', l.product) || {}).cost || 0, diff_amount: r2(diff * ((DB.find('products', l.product) || {}).cost || 0)) });
    }));
    rows.forEach(l => {
      const p = DB.find('products', l.product) || {};
      const diff = (+l.actual_qty) - (DB.find('stock', l.product + '-' + st.warehouse) || { qty: 0 }).qty;
      if (diff !== 0) {
        move(l.product, st.warehouse, diff, p.cost, diff > 0 ? 'stocktake_plus' : 'stocktake_minus', no, '盘点差异调整');
        journal(DB.today(), 'stock_adjust', no, (diff > 0 ? '盘盈调整—' : '盘亏调整—') + p.name,
          diff > 0 ? [{ acc: '1405', debit: r2(diff * p.cost) }, { acc: '4002', credit: r2(diff * p.cost) }]
                  : [{ acc: '5401', debit: r2(-diff * p.cost) }, { acc: '1405', credit: r2(-diff * p.cost) }]);
      }
    });
    st.status = 'posted'; st.diff_lines = diffLines; st.diff_amount = r2(diffAmount); st.user = DB.currentUser(); st.note = note || st.note;
    DB.upsert('stocktake', st);
    DB.log('库存管理', '过账盘点单', no, `差异 ${diffLines} 行,金额 ¥${UI.money(diffAmount)}`);
    return { diffLines, diffAmount };
  }
  function adjustStock(prodCode, whCode, delta, reason) {
    if (!(delta !== 0)) throw new Error('调整数量不能为 0');
    const p = DB.find('products', prodCode) || {};
    const s = DB.find('stock', prodCode + '-' + whCode) || { qty: 0, cost: p.cost };
    if (s.qty + delta < 0) throw new Error('调整后库存不能为负');
    const unit = s.cost || p.cost || 0;
    const ref = 'ADJ' + DB.today().replace(/-/g, '') + '-' + String(Date.now()).slice(-5);
    move(prodCode, whCode, delta, unit, 'manual', ref, reason || '手工库存调整');
    journal(DB.today(), 'stock_adjust', ref, (delta > 0 ? '手工调增库存—' : '手工调减库存—') + (p.name || prodCode),
      delta > 0 ? [{ acc: '1405', debit: r2(delta * unit) }, { acc: '4002', credit: r2(delta * unit), memo: reason || '手工调整' }]
              : [{ acc: '5401', debit: r2(-delta * unit), memo: reason || '手工调整' }, { acc: '1405', credit: r2(-delta * unit) }]);
    recomputeReserved(prodCode);
    DB.log('库存管理', '手工调整库存', prodCode, `${whCode} ${delta > 0 ? '+' : ''}${delta} ${reason || ''}`);
    return ref;
  }

  /* ================= 主数据 ================= */
  function save(entity, row, isNew) {
    const e = SCHEMA.entities[entity];
    const pk = e.pk;
    if (isNew && !row[pk]) row[pk] = autoCode(entity);
    if (isNew && DB.find(entity, row[pk])) throw new Error(`${row[pk]} 已存在,请更换编码`);
    if (e.nextSeqField && !row.status) row.status = 'draft';
    DB.upsert(entity, row);
    DB.log('基础数据', (isNew ? '新增' : '修改') + e.label, row[pk], row.name || '');
    return row;
  }
  function autoCode(entity) {
    const map = { products: 'HM-', customers: 'CU-', suppliers: 'SU-', warehouses: 'WH-', processors: 'OS-', role: 'ROLE-' };
    const pre = map[entity];
    if (!pre) return DB.nextNo(entity);
    let n = DB.count(entity) + 1;
    let code;
    do { code = pre + String(1000 + n).slice(1); n++; } while (DB.find(entity, code));
    return code;
  }
  /* 主数据被引用时禁止删除:[实体, 引用字段, 引用表] */
  const REF_CHECK = {
    products: [['product', 'so_lines'], ['product', 'po_lines'], ['product', 'pr_lines'], ['product', 'tr_lines'], ['product', 'stk_lines'], ['product', 'stock'], ['product', 'stock_movements'],
      ['product', 'rfq_lines'], ['product', 'os_lines'], ['product', 'rma_lines'], ['output_product', 'os_order'], ['product', 'product_release']],
    customers: [['customer', 'sales_order'], ['customer', 'invoice'], ['customer', 'receipt'], ['customer', 'rma']],
    suppliers: [['supplier', 'purchase_order'], ['supplier', 'gr'], ['supplier', 'bill'], ['supplier', 'payment'], ['supplier', 'rfq_lines']],
    warehouses: [['warehouse', 'stock'], ['warehouse', 'sales_order'], ['warehouse', 'purchase_order'], ['warehouse', 'stock_movements'], ['warehouse', 'os_order'], ['warehouse', 'rma']],
    processors: [['processor', 'os_order'], ['processor', 'processor_audit']],
  };
  function removeRow(entity, id) {
    for (const [field, table] of (REF_CHECK[entity] || [])) {
      const hit = DB.where(table, r => String(r[field]) === String(id));
      if (hit.length) {
        UI.toast(`无法删除:被「${SCHEMA.entities[table].label}」引用(${hit.length} 条),请改用停用`, 'err');
        return false;
      }
    }
    DB.remove(entity, id);
    DB.log('基础数据', '删除' + SCHEMA.entities[entity].label, id, '');
    UI.toast('已删除');
    return true;
  }

  /* ================= 审批中心 ================= */
  const WF = {};   // 审批裁决后回调业务单据:{ onDecide(bizNo, ok, approval) }

  /** 发起审批:所有需要岗位分离的业务动作统一在此登记 */
  function submitApproval(module, bizNo, o) {
    o = o || {};
    const no = DB.nextNo('approval');
    DB.insert('approval', {
      no, date: DB.today(), module, biz: bizNo,
      title: o.title || (SCHEMA.entities[module] ? SCHEMA.entities[module].label : '') + ' ' + bizNo,
      applicant: o.applicant || DB.currentUser(), role: o.role || '主管', approver: '',
      amount: r2(o.amount || 0), priority: o.priority || 'std', status: 'pending',
      opinion: '', time_done: '', payload: o.payload || null, note: o.note || ''
    });
    DB.log('审批中心', '发起审批', no, `${o.title || module} · ${bizNo}`);
    return no;
  }
  function pendingApprovals() { return DB.where('approval', a => a.status === 'pending'); }
  /** 审批裁决:登记审批单并回调业务模块 */
  function decideApproval(no, ok, opinion) {
    const a = DB.find('approval', no);
    if (!a) throw new Error('审批单不存在');
    if (a.status !== 'pending') throw new Error(`审批单 ${no} 已于 ${a.time_done || '此前'} 处理`);
    a.status = ok ? 'approved' : 'rejected';
    a.opinion = opinion || (ok ? '同意,按流程执行' : '不同意,请补充资料');
    a.approver = DB.currentUser();
    a.time_done = DB.nowStr();
    DB.upsert('approval', a);
    const cb = WF[a.module];
    if (cb && cb.onDecide) cb.onDecide(a.biz, ok, a);
    DB.log('审批中心', ok ? '审批通过' : '审批驳回', no, `${SCHEMA.entities.approval.fields.module.opts[a.module] || a.module} · ${a.biz}`);
    return a;
  }
  /** 若单据挂着待办审批,先走审批中心;否则直接落状态 */
  function decideViaApproval(entity, no, field, ok, opinion, direct) {
    const t = DB.find(entity, no);
    const ap = t && t[field] ? DB.find('approval', t[field]) : null;
    if (ap && ap.status === 'pending') { decideApproval(ap.no, ok, opinion); return DB.find(entity, no); }
    direct(ok, opinion);
    DB.log('单据管理', (ok ? '审批通过:' : '审批驳回:') + SCHEMA.entities[entity].label, no, opinion || '');
    return DB.find(entity, no);
  }

  /* ================= 产品管理:询价比价 ================= */
  /** 发出询价:按物料类目自动邀请供应商,生成待报价行 */
  function sendRFQ(no) {
    const t = DB.find('rfq', no);
    if (!t) throw new Error('询价单不存在');
    if (t.status !== 'draft') throw new Error('仅草稿状态可以发出询价');
    const base = DB.lines('rfq_lines', no).filter(l => l.product);
    if (!base.length) throw new Error('请先添加询价物料');
    const rows = [];
    base.forEach(l => {
      const p = DB.find('products', l.product) || {};
      const pool = DB.where('suppliers', s => s.status === 'enabled' && (!p.category || s.category === p.category))
        .sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3);
      if (!pool.length) throw new Error(`${p.name || l.product} 没有匹配的在册供应商,请先做供应商准入`);
      pool.forEach(s => rows.push({
        product: l.product, product_name: p.name, supplier: s.code, supplier_name: s.name,
        qty: l.qty, price: 0, base_price: r2(l.price || p.cost || 0), amount: 0,
        tax_rate: p.tax_rate || 13, lead_time: s.lead_time || 14, awarded: 'n', memo: ''
      }));
    });
    DB.setLines('rfq_lines', no, rows);
    t.quote_lines = rows.length;
    t.base_amount = r2(base.reduce((s, l) => s + l.qty * (l.price || 0), 0));
    t.status = 'sent'; DB.upsert('rfq', t);
    DB.log('产品管理', '发出询价单', no, `邀请报价 ${rows.length} 行`);
    return rows.length;
  }
  /** 回填供应商报价 */
  function saveRFQQuotes(no, quotes) {
    const t = DB.find('rfq', no);
    if (t.status !== 'sent' && t.status !== 'quoted') throw new Error('当前状态不可录入报价');
    const lines = DB.lines('rfq_lines', no);
    quotes.forEach(q => {
      const l = lines.find(x => String(x.lineno) === String(q.lineno));
      if (!l) return;
      l.price = r2(+q.price || 0);
      l.amount = r2(l.qty * l.price);
      if (q.lead_time) l.lead_time = +q.lead_time;
      if (q.memo !== undefined) l.memo = q.memo;
    });
    if (!lines.some(l => l.price > 0)) throw new Error('至少需要一家供应商给出有效报价');
    DB.setLines('rfq_lines', no, lines);
    t.amount = r2(bestQuotes(lines).reduce((s, l) => s + l.amount, 0));
    t.saving = r2((t.base_amount || 0) - t.amount);
    t.status = 'quoted'; DB.upsert('rfq', t);
    DB.log('产品管理', '登记询价报价', no, `最低报价合计 ¥${UI.money(t.amount)}`);
    return t.amount;
  }
  /** 每个物料取最低报价行 */
  function bestQuotes(lines) {
    const out = [];
    [...new Set(lines.map(l => l.product))].forEach(code => {
      const cand = lines.filter(l => l.product === code && l.price > 0).sort((a, b) => a.price - b.price);
      if (cand.length) out.push(cand[0]);
    });
    return out;
  }
  /** 定标:最低价中标,按供应商拆分生成草稿采购订单 */
  function awardRFQ(no) {
    const t = DB.find('rfq', no);
    if (t.status !== 'quoted') throw new Error('仅已收到报价的询价单可以定标');
    const lines = DB.lines('rfq_lines', no);
    const best = bestQuotes(lines);
    if (!best.length) throw new Error('没有有效报价');
    lines.forEach(l => { l.awarded = best.indexOf(l) >= 0 ? 'y' : 'n'; });
    DB.setLines('rfq_lines', no, lines);
    const bySup = {};
    best.forEach(l => { (bySup[l.supplier] = bySup[l.supplier] || []).push(l); });
    const created = [];
    Object.keys(bySup).forEach(sup => {
      const rows = bySup[sup];
      const poNo = DB.nextNo('purchase_order');
      const s = DB.find('suppliers', sup) || {};
      const total = r2(rows.reduce((a, l) => a + l.qty * l.price * (1 + (l.tax_rate || 13) / 100), 0));
      DB.insert('purchase_order', {
        no: poNo, date: DB.today(), supplier: sup, supplier_name: s.name || '', warehouse: t.warehouse || 'WH-HZ01',
        expected_date: t.need_date || DB.addDays(DB.today(), Math.max(7, s.lead_time || 14)), rfq: no,
        currency: 'CNY', payment_terms: s.payment_terms || 'NET30', buyer: t.buyer || DB.currentUser(),
        status: 'draft', total, amount: total, note: `由询价单 ${no} 定标生成`
      });
      DB.setLines('po_lines', poNo, rows.map((l, i) => ({
        lineno: i + 1, product: l.product, product_name: l.product_name, qty: l.qty, price: l.price,
        discount: 0, tax_rate: l.tax_rate || 13, amount: r2(l.qty * l.price), received: 0, delivered: 0, memo: `询价 ${no} 定标`
      })));
      created.push(poNo);
    });
    t.ref_po = created.join(' / ');
    t.status = 'awarded'; DB.upsert('rfq', t);
    DB.log('采购管理', '询价定标', no, `生成采购订单 ${created.join('、')}`);
    return created;
  }
  function closeRFQ(no) {
    const t = DB.find('rfq', no);
    if (t.status === 'awarded') throw new Error('已定标的询价单无需关闭');
    t.status = 'closed'; DB.upsert('rfq', t);
    DB.log('采购管理', '关闭询价单', no, '');
  }

  /* ================= 产品管理:新品发布 ================= */
  function submitRelease(no) {
    const t = DB.find('product_release', no);
    if (t.status !== 'draft') throw new Error('仅草稿可提交审核');
    if (!t.name) throw new Error('请填写商品名称');
    if (!(t.target_price > 0)) throw new Error('请填写拟售价');
    t.status = 'pending';
    t.approval = submitApproval('product_release', no, {
      title: `新品发布:${t.name}`, amount: r2((t.target_price || 0) * (t.safety_qty || 0)), role: '销售主管'
    });
    DB.upsert('product_release', t);
    DB.log('产品管理', '提交新品发布', no, t.name);
  }
  function decideRelease(no, ok, opinion) {
    return decideViaApproval('product_release', no, 'approval', ok, opinion, (y) => {
      const t = DB.find('product_release', no);
      if (t.status !== 'pending') throw new Error('当前状态不可审批');
      t.status = y ? 'approved' : 'rejected';
      DB.upsert('product_release', t);
    });
  }
  /** 上架:写入商品主档并启用 */
  function publishRelease(no) {
    const t = DB.find('product_release', no);
    if (t.status !== 'approved') throw new Error('审批通过后才能上架');
    const code = t.product || autoCode('products');
    const p = DB.find('products', code) || {
      code, barcode: '69' + String(Date.now()).slice(-11), tax_rate: 13, weight: 300, lead_time: 14, status: 'enabled'
    };
    Object.assign(p, {
      code, name: t.name, category: t.category, brand: t.brand || '赛福优选', spec: t.spec || '',
      uom: t.uom || 'PCS', cost: r2(t.target_cost || 0), price: r2(t.target_price || 0),
      safety_qty: t.safety_qty || 20, moq: t.moq || 50, listing: t.listing || 'offline',
      release_no: t.no, launch_date: DB.today(), status: 'enabled'
    });
    DB.upsert('products', p);
    DB.where('stock', s => s.product === code).forEach(s => ACT_recalc(s));
    t.product = code; t.status = 'published'; t.margin = t.target_price ? r2((t.target_price - t.target_cost) / t.target_price * 100) : 0;
    DB.upsert('product_release', t);
    DB.log('产品管理', '新品上架', t.no, `${code} · ${t.name} 售价 ¥${UI.money(t.target_price)}`);
    return code;
  }
  function ACT_recalc(s) { s.product_name = (DB.find('products', s.product) || {}).name || s.product_name; recalc(s); }
  function offShelfRelease(no) {
    const t = DB.find('product_release', no);
    if (t.status !== 'published') throw new Error('仅已上架的商品可以下架');
    const p = DB.find('products', t.product);
    if (p) { p.status = 'disabled'; DB.upsert('products', p); }
    t.status = 'off_shelf'; DB.upsert('product_release', t);
    DB.log('产品管理', '商品下架', no, t.product || '');
  }

  /* ================= 服务商管理:供应商准入 ================= */
  function submitApply(no) {
    const t = DB.find('supplier_apply', no);
    if (t.status !== 'draft') throw new Error('仅草稿可提交准入评审');
    if (!t.company) throw new Error('请填写企业全称');
    t.status = 'pending';
    t.approval = submitApproval('supplier_apply', no, { title: `供应商准入:${t.company}`, amount: t.registered_capital || 0, role: '采购主管' });
    DB.upsert('supplier_apply', t);
    DB.log('服务商管理', '提交供应商准入', no, t.company);
  }
  function inspectApply(no, score, opinion) {
    const t = DB.find('supplier_apply', no);
    if (!['pending', 'inspecting'].includes(t.status)) throw new Error('当前状态不可登记评审');
    t.score = +score || 0;
    t.opinion = opinion || '';
    t.status = 'inspecting'; DB.upsert('supplier_apply', t);
    DB.log('服务商管理', '现场审核登记', no, `得分 ${t.score}`);
  }
  function decideApply(no, ok, opinion) {
    const cur = DB.find('supplier_apply', no);
    if (!['pending', 'inspecting'].includes(cur.status)) throw new Error('当前状态不可审批');
    if (ok && (cur.score || 0) < 60) throw new Error('评审得分低于 60,不能核准');
    return decideViaApproval('supplier_apply', no, 'approval', ok, opinion, (y) => {
      cur.status = y ? 'approved' : 'rejected';
      if (opinion) cur.opinion = opinion;
      DB.upsert('supplier_apply', cur);
    });
  }
  /** 建档:生成供应商主档 */
  function archiveApply(no) {
    const t = DB.find('supplier_apply', no);
    if (t.status !== 'approved') throw new Error('评审通过后才能建档');
    const code = autoCode('suppliers');
    DB.insert('suppliers', {
      code, name: t.company, category: t.category, contact: t.contact, phone: t.phone, email: t.email,
      address: t.address, tax_id: t.credit_code, lead_time: 14, payment_terms: 'NET30', currency: 'CNY',
      min_order: 100, rating: t.score || 70, status: 'enabled', note: `准入申请 ${t.no} 建档`
    });
    t.supplier = code; t.status = 'archived'; DB.upsert('supplier_apply', t);
    DB.log('服务商管理', '供应商建档', t.no, `${code} · ${t.company}`);
    return code;
  }

  /* ================= 服务商管理:外协商审核 ================= */
  function submitAudit(no) {
    const t = DB.find('processor_audit', no);
    if (t.status !== 'draft') throw new Error('仅草稿可提交审核');
    if (!t.processor) throw new Error('请选择外协商');
    t.total_score = auditScore(t);
    t.status = 'pending';
    t.approval = submitApproval('processor_audit', no, { title: `外协商审核:${t.processor_name}`, amount: 0, role: '采购主管' });
    DB.upsert('processor_audit', t);
    DB.log('服务商管理', '提交外协商审核', no, t.processor_name);
  }
  function auditScore(t) {
    return Math.round(((+t.quality_score || 0) * 0.4 + (+t.delivery_score || 0) * 0.25 + (+t.price_score || 0) * 0.2 + (+t.manage_score || 0) * 0.15));
  }
  function inspectAudit(no, scores) {
    const t = DB.find('processor_audit', no);
    if (!['pending', 'inspecting', 'draft'].includes(t.status)) throw new Error('当前状态不可录入评分');
    Object.assign(t, scores);
    t.total_score = auditScore(t);
    t.sample_result = scores.sample_result || t.sample_result;
    t.status = 'inspecting'; DB.upsert('processor_audit', t);
    DB.log('服务商管理', '录入外协商评分', no, `综合 ${t.total_score} 分`);
    return t.total_score;
  }
  function decideAudit(no, ok, opinion) {
    return decideViaApproval('processor_audit', no, 'approval', ok, opinion, (y) => {
      const t = DB.find('processor_audit', no);
      if (!['pending', 'inspecting'].includes(t.status)) throw new Error('当前状态不可审批');
      t.status = y ? 'approved' : 'rejected';
      t.conclusion = y ? (t.sample_result === 'fail' || t.total_score < 60 ? 'blacklist' : 'qualified') : 'blacklist';
      if (opinion) t.opinion = opinion;
      DB.upsert('processor_audit', t);
      applyAuditResult(t);
    });
  }
  function applyAuditResult(t) {
    const pr = DB.find('processors', t.processor);
    if (!pr) return;
    pr.qualification = t.conclusion === 'blacklist' ? 'blacklist' : 'qualified';
    pr.audit = t.no;
    pr.rating = t.total_score || pr.rating;
    if (t.unit_rate) pr.unit_rate = r2(t.unit_rate);
    if (t.capacity) pr.capacity = +t.capacity;
    if (pr.qualification === 'blacklist') pr.status = 'disabled';
    DB.upsert('processors', pr);
  }

  /* ================= 服务商管理:委外加工 ================= */
  function confirmOS(no) {
    const t = DB.find('os_order', no);
    if (t.status !== 'draft') throw new Error('仅草稿可审核');
    if (!DB.lines('os_lines', no).length) throw new Error('请填写发料明细');
    if (!t.output_product) throw new Error('请选择加工成品');
    const pr = DB.find('processors', t.processor) || {};
    if (pr.qualification && pr.qualification !== 'qualified') throw new Error(`${pr.name} 未通过外协商核准,不能下发加工单`);
    t.fee_amount = r2((t.output_qty || 0) * (t.unit_fee || 0));
    t.status = 'confirmed'; DB.upsert('os_order', t);
    DB.log('服务商管理', '审核委外加工单', no, `${t.processor_name} · ${t.output_qty} 件`);
  }
  function cancelOS(no) {
    const t = DB.find('os_order', no);
    if (t.status === 'issued' || t.status === 'received' || t.status === 'done') throw new Error('已发料/已收回的加工单不能取消');
    t.status = 'cancelled'; DB.upsert('os_order', t);
    DB.log('服务商管理', '取消委外加工单', no, '');
  }
  /** 发料:材料出库 → 借 委托加工物资 / 贷 库存商品 */
  function issueOS(no, plan) {
    const t = DB.find('os_order', no);
    if (!['confirmed', 'issued'].includes(t.status)) throw new Error('加工单需先审核才能发料');
    const lines = DB.lines('os_lines', no);
    let cost = 0, qty = 0;
    plan.forEach(p => {
      const l = lines.find(x => x.product === p.product);
      if (!l) return;
      const q = Math.min(+p.qty || 0, (l.qty || 0) - (l.issued || 0));
      if (q <= 0) return;
      const prod = DB.find('products', l.product) || {};
      const unit = prod.cost || l.price || 0;
      if (available(l.product, t.warehouse) < q) throw new Error(`${l.product_name} 在 ${t.warehouse} 可用库存不足`);
      move(l.product, t.warehouse, -q, unit, 'os_issue', no, '委外发料—' + t.processor_name, '');
      l.issued = (l.issued || 0) + q;
      cost += r2(q * unit); qty += q;
    });
    if (!qty) throw new Error('请填写发料数量');
    cost = r2(cost);
    DB.setLines('os_lines', no, lines);
    t.issued_amount = r2((t.issued_amount || 0) + cost);
    t.status = 'issued'; DB.upsert('os_order', t);
    journal(DB.today(), 'os_issue', no, `委外发料—${t.processor_name}`, [
      { acc: '1408', debit: cost, memo: '委托加工材料' },
      { acc: '1405', credit: cost, memo: '材料出库 ' + qty + ' 件' }]);
    DB.log('服务商管理', '委外发料过账', no, `${qty} 件材料,成本 ¥${UI.money(cost)}`);
    return cost;
  }
  /** 收回成品:核销委托加工物资 + 加工费挂账,成品按加权成本入库 */
  function receiveOS(no, qty) {
    const t = DB.find('os_order', no);
    if (!['issued', 'received'].includes(t.status)) throw new Error('请先完成发料过账');
    qty = +qty || 0;
    const rest = (t.output_qty || 0) - (t.received_qty || 0);
    if (qty <= 0) throw new Error('请填写收回数量');
    if (qty > rest) throw new Error(`超出计划数量,最多可收回 ${rest} 件`);
    if (!(t.issued_amount > 0)) throw new Error('尚未发料,无法计算成品成本');
    const perUnitMat = r2((t.issued_amount || 0) / (t.output_qty || 1));
    let mat = r2(qty * perUnitMat);
    const last = (t.received_qty + qty) >= (t.output_qty || 0);
    if (last) mat = r2((t.issued_amount || 0) - (t.consumed_amount || 0));   // 尾差全部结转
    const feeNet = r2(qty * (t.unit_fee || 0));
    const taxRate = (DB.find('products', t.output_product) || {}).tax_rate || 13;
    const vat = r2(feeNet * taxRate / 100);
    const inCost = r2(mat + feeNet);
    move(t.output_product, t.warehouse, qty, inCost / qty, 'os_receive', no, '委外收回—' + t.processor_name, '');
    const row = DB.find('stock', t.output_product + '-' + t.warehouse);
    const prod = DB.find('products', t.output_product) || {};
    if (row && row.cost && prod.code) { prod.cost = row.cost; DB.upsert('products', prod); }
    t.received_qty = (t.received_qty || 0) + qty;
    t.consumed_amount = r2((t.consumed_amount || 0) + mat);
    t.total_cost = r2((t.total_cost || 0) + inCost);
    t.status = last ? 'done' : 'received';
    DB.upsert('os_order', t);
    /* 加工费应付账单 */
    const bNo = DB.nextNo('bill');
    const sup = DB.find('suppliers', t.processor) || {};
    const terms = sup.payment_terms || 'NET30';
    const daysMap = { NET60: 60, NET45: 45, NET30: 30, PRE50: 15, PRE100: 0, COD: 0 };
    const total = r2(feeNet + vat);
    DB.insert('bill', {
      no: bNo, date: DB.today(), supplier: t.processor, supplier_name: t.processor_name,
      po: '', gr: '', os: no, kind: 'fee', due_date: DB.addDays(DB.today(), daysMap[terms] || 30),
      status: 'open', total, net: feeNet, vat: vat, accrual: 0, paid: 0, balance: total, note: `委外加工费—${t.process_type || '通用'} ${qty} 件`
    });
    DB.insert('bill_lines', { doc: bNo, lineno: 1, product: t.output_product, product_name: prod.name || t.output_product,
      qty, price: t.unit_fee, amount: feeNet, tax_rate: taxRate, memo: '加工费' });
    t.bill = bNo; DB.upsert('os_order', t);
    journal(DB.today(), 'os_receive', no, `委外加工收回—${t.processor_name}`, [
      { acc: '1405', debit: inCost, memo: '成品入库成本(材料+加工费)' },
      { acc: '2221', debit: vat, memo: '加工费进项税' },
      { acc: '1408', credit: mat, memo: '核销委托加工物资' },
      { acc: '2202', credit: total, memo: '应付加工费—' + t.processor_name }]);
    DB.log('服务商管理', '委外收回过账', no, `收回 ${qty} 件,入库成本 ¥${UI.money(inCost)},加工费账单 ${bNo}`);
    return bNo;
  }

  /* ================= 售后管理 ================= */
  function submitRMA(no) {
    const t = DB.find('rma', no);
    if (t.status !== 'draft') throw new Error('仅草稿可提交审批');
    if (!DB.lines('rma_lines', no).length) throw new Error('请填写售后明细');
    t.qty = DB.lines('rma_lines', no).reduce((s, l) => s + (l.qty || 0), 0);
    t.amount = r2(DB.lines('rma_lines', no).reduce((s, l) => s + (l.qty || 0) * (l.price || 0) * (1 + (l.tax_rate || 13) / 100), 0));
    if (!t.warehouse) { const so = DB.find('sales_order', t.so); t.warehouse = (so || {}).warehouse || 'WH-HZ01'; }
    t.status = 'pending';
    t.approval = submitApproval('rma', no, { title: `售后${SCHEMA.entities.rma.fields.type.opts[t.type] || ''}:${t.customer_name}`, amount: t.amount, role: '销售主管' });
    DB.upsert('rma', t);
    DB.log('售后管理', '提交售后工单', no, `${t.customer_name} · ¥${UI.money(t.amount)}`);
  }
  function decideRMA(no, ok, opinion) {
    return decideViaApproval('rma', no, 'approval', ok, opinion, (y) => {
      const t = DB.find('rma', no);
      if (t.status !== 'pending') throw new Error('当前状态不可审批');
      t.status = y ? 'approved' : 'rejected';
      DB.upsert('rma', t);
    });
  }
  /** 退货/换货入库:借 库存商品 / 贷 主营业务成本(冲回已结转成本) */
  function receiveRMA(no) {
    const t = DB.find('rma', no);
    if (t.status !== 'approved') throw new Error('审批通过后才能收货入库');
    if (!['return', 'exchange'].includes(t.type)) throw new Error('维修工单无需入库');
    const lines = DB.lines('rma_lines', no);
    let cost = 0, qty = 0;
    lines.forEach(l => {
      const prod = DB.find('products', l.product) || {};
      const unit = prod.cost || 0;
      move(l.product, t.warehouse || 'WH-HZ01', +l.qty, unit, 'so_return', no, '售后退货入库', '');
      cost += r2(l.qty * unit); qty += l.qty;
    });
    cost = r2(cost);
    journal(DB.today(), 'rma_return', no, `售后退货入库—${t.customer_name}`, [
      { acc: '1405', debit: cost, memo: '退货入库 ' + qty + ' 件' },
      { acc: '5001', credit: cost, memo: '冲回主营业务成本' }]);
    t.qty = qty; t.status = 'received'; t.received_cost = cost; DB.upsert('rma', t);
    DB.log('售后管理', '售后退货入库', no, `${qty} 件,成本 ¥${UI.money(cost)}`);
    return cost;
  }
  /** 红字发票:负数发票冲减收入与应收 */
  function creditRMA(no) {
    const t = DB.find('rma', no);
    if (t.status !== 'received') throw new Error('请先完成退货入库');
    if (t.credit_invoice) throw new Error('该工单已开具红字发票');
    const lines0 = DB.lines('rma_lines', no);
    if (t.type === 'exchange') lines0.forEach(l => {
      if (available(l.product, t.warehouse) < l.qty) throw new Error(`${l.product_name} 换货库存不足,请先补货`);
    });
    const so = DB.find('sales_order', t.so) || {};
    const lines = DB.lines('rma_lines', no);
    const iNo = DB.nextNo('invoice');
    let net = 0, gross = 0;
    lines.forEach((l, i) => {
      const amount = r2(-(l.qty || 0) * (l.price || 0) * (1 - (l.discount || 0)));
      const tax = r2(amount * ((l.tax_rate || 13) / 100));
      net += amount; gross += amount + tax;
      DB.insert('iv_lines', { doc: iNo, lineno: i + 1, product: l.product, product_name: l.product_name,
        qty: -l.qty, price: l.price, discount: l.discount || 0, amount, tax_rate: l.tax_rate || 13, memo: '售后红冲' });
    });
    net = r2(net); gross = r2(gross);
    DB.insert('invoice', {
      no: iNo, date: DB.today(), customer: t.customer, customer_name: t.customer_name, so: t.so, delivery: '', rma: no,
      kind: 'red', due_date: DB.today(), currency: 'CNY', status: 'open', total: gross, paid: 0, balance: gross,
      note: `售后红字发票—${no}`
    });
    journal(DB.today(), 'rma_credit', iNo, `售后红冲收入—${t.customer_name}`, [
      { acc: '4001', debit: r2(-net), memo: '冲减主营业务收入' },
      { acc: '2221', debit: r2(-(gross - net)), memo: '冲减销项税额' },
      { acc: '1122', credit: r2(-gross), memo: '冲减应收账款' }]);
    t.credit_invoice = iNo;
    if (t.type !== 'return') t.status = t.type === 'exchange' ? 'exchanged' : t.status;
    DB.upsert('rma', t);
    /* 换货:同一物料按现价重新出库,收入不变,成本对冲 */
    if (t.type === 'exchange') reShipExchange(t, lines);
    DB.log('售后管理', '开具红字发票', iNo, `来源 ${no},冲减应收 ¥${UI.money(-gross)}`);
    return iNo;
  }
  function reShipExchange(t, lines) {
    let cost = 0, qty = 0;
    lines.forEach(l => {
      const prod = DB.find('products', l.product) || {};
      const unit = prod.cost || 0;
      if (available(l.product, t.warehouse) < l.qty) throw new Error(`${l.product_name} 换货库存不足,请先补货`);
      move(l.product, t.warehouse, -l.qty, unit, 'sales_delivery', t.no, '售后换货重新发出', '');
      cost += r2(l.qty * unit); qty += l.qty;
      recomputeReserved(l.product);
    });
    cost = r2(cost);
    journal(DB.today(), 'sales_delivery', t.no, `售后换货出库—${t.customer_name}`, [
      { acc: '5001', debit: cost, memo: '换货发出成本' }, { acc: '1405', credit: cost }]);
    DB.log('售后管理', '换货重新发出', t.no, `${qty} 件,成本 ¥${UI.money(cost)}`);
  }
  /** 退款:负数收款单冲减应收 */
  function refundRMA(no, amount, method) {
    const t = DB.find('rma', no);
    if (!['received', 'refunded'].includes(t.status)) throw new Error('请先完成入库与红字发票');
    const inv = DB.find('invoice', t.credit_invoice);
    if (!inv) throw new Error('请先开具红字发票');
    if (inv.balance >= -0.01) throw new Error('该红字发票已退清');
    const amt = r2(Math.min(+amount, -inv.balance));
    if (!(amt > 0)) throw new Error('退款金额必须大于 0');
    const rcNo = DB.nextNo('receipt');
    DB.insert('receipt', { no: rcNo, date: DB.today(), customer: inv.customer, customer_name: inv.customer_name,
      invoice: inv.no, amount: -amt, method: method || '银行转账', status: 'posted', user: DB.currentUser(), note: '售后退款—' + no });
    inv.paid = r2(inv.paid - amt); inv.balance = r2(inv.total - inv.paid);
    if (inv.balance >= -0.01) inv.status = 'paid';
    DB.upsert('invoice', inv);
    journal(DB.today(), 'rma_refund', rcNo, `售后退款—${inv.customer_name}`, [
      { acc: '1122', debit: amt, memo: '核销红字发票 ' + inv.no }, { acc: '1002', credit: amt }]);
    t.amount = amt; t.status = 'refunded'; DB.upsert('rma', t);
    DB.log('售后管理', '登记售后退款', rcNo, `退款 ¥${UI.money(amt)} · 工单 ${no}`);
    return rcNo;
  }
  /** 维修:费用化处理 */
  function repairRMA(no, cost, method) {
    const t = DB.find('rma', no);
    if (t.status !== 'approved') throw new Error('审批通过后才能登记维修');
    cost = r2(+cost || 0);
    if (!(cost > 0)) throw new Error('请填写维修费用');
    const vendorPay = t.liability === 'supplier';
    if (vendorPay) {
      /* 供应商担责:先计提费用并挂一笔应付账单,保证应付子账与总账 2202 勾稽 */
      const l0 = DB.lines('rma_lines', no)[0] || {};
      const p = DB.find('products', l0.product) || {};
      const sup = DB.where('suppliers', s => s.status === 'enabled' && s.category === p.category)[0]
        || DB.where('suppliers', s => s.status === 'enabled')[0];
      if (!sup) throw new Error('没有可用的供应商档案,无法挂账维修费');
      const bNo = DB.nextNo('bill');
      DB.insert('bill', { no: bNo, date: DB.today(), supplier: sup.code, supplier_name: sup.name, po: '', gr: '', os: '',
        kind: 'fee', due_date: DB.addDays(DB.today(), 30), status: 'open', total: cost, net: cost, vat: 0, accrual: 0, paid: 0, balance: cost,
        note: `售后维修费暂挂应付,应追偿—${no}` });
      DB.insert('bill_lines', { doc: bNo, lineno: 1, product: p.code || '', product_name: p.name || '维修工时',
        qty: 1, price: cost, amount: cost, tax_rate: 0, memo: '维修工时费' });
      journal(DB.today(), 'rma_repair', no, `售后维修费—${t.customer_name}`,
        [{ acc: '6601', debit: cost, memo: '先行承担维修费' }, { acc: '2202', credit: cost, memo: '应追偿服务商,暂挂应付 ' + bNo }]);
      DB.log('售后管理', '维修费挂账', bNo, `价税合计 ¥${UI.money(cost)} · 来源工单 ${no}`);
    } else {
      journal(DB.today(), 'rma_repair', no, `售后维修费—${t.customer_name}`,
        [{ acc: '6601', debit: cost, memo: t.liability === 'customer' ? '客户付费维修' : '公司承担维修费' }, { acc: '1002', credit: cost }]);
    }
    t.repair_cost = cost;
    t.status = t.liability === 'customer' ? 'closed' : 'repairing';
    DB.upsert('rma', t);
    DB.log('售后管理', '登记维修费用', no, `¥${UI.money(cost)} · 责任:${t.liability || 'company'}`);
    return cost;
  }
  function closeRMA(no) {
    const t = DB.find('rma', no);
    if (['draft', 'pending'].includes(t.status)) throw new Error('未处理完的工单不能关闭');
    if (t.type === 'return' && !t.credit_invoice) throw new Error('退货工单需先开红字发票再关闭');
    t.status = 'closed'; DB.upsert('rma', t);
    DB.log('售后管理', '关闭售后工单', no, '');
  }

  /* ================= 订单管理 ================= */
  /** 订单变更申请:已确认订单需走审批才能改头信息 */
  function requestSOChange(no, changes, reason) {
    const so = DB.find('sales_order', no);
    if (!so) throw new Error('订单不存在');
    if (so.status === 'draft') throw new Error('草稿订单直接编辑即可');
    if (['cancelled', 'closed'].includes(so.status)) throw new Error('该订单已结束,不能变更');
    const keys = Object.keys(changes).filter(k => String(so[k]) !== String(changes[k]));
    if (!keys.length) throw new Error('没有实质变更内容');
    const ef = SCHEMA.entities.sales_order.fields;
    const summary = keys.map(k => `${ef[k] ? ef[k].l : k}: ${so[k] || '—'} → ${changes[k] || '—'}`).join(';');
    const apNo = submitApproval('so_change', no, { title: `销售订单变更 ${no}`, amount: so.total, role: '销售主管', note: reason || summary, payload: changes });
    const ap = DB.find('approval', apNo);
    ap.summary = summary; DB.upsert('approval', ap);
    DB.log('订单管理', '发起订单变更', no, summary);
    return apNo;
  }
  function applySOChange(approvalNo) {
    const ap = DB.find('approval', approvalNo);
    const so = DB.find('sales_order', ap.biz);
    if (!so || !ap.payload) return;
    Object.assign(so, ap.payload);
    so.note = (so.note ? so.note + ' / ' : '') + `变更 ${ap.no}`;
    DB.upsert('sales_order', so);
    DB.log('订单管理', '执行订单变更', so.no, ap.summary || '');
  }
  function closeSO(no) {
    const so = DB.find('sales_order', no);
    if (['draft', 'cancelled', 'closed'].includes(so.status)) throw new Error('当前状态不能关闭');
    const unpaid = DB.where('invoice', i => i.so === no && Math.abs(i.balance) > 0.01);
    if (unpaid.length) throw new Error(`存在 ${unpaid.length} 张未结清发票,不能强制关闭`);
    const openDl = DB.lines('so_lines', no).filter(l => (l.delivered || 0) < l.qty);
    so.status = 'closed'; DB.upsert('sales_order', so);
    DB.where('stock', s => s.warehouse === so.warehouse).forEach(s => recomputeReserved(s.product));
    DB.log('订单管理', '强制关闭订单', no, openDl.length ? `释放 ${openDl.length} 行未交量` : '剩余未交量释放');
  }

  /* ================= 权限管理 ================= */
  const PERM_ACTIONS = ['view', 'edit', 'approve'];
  function roleOfUser(name) {
    const u = DB.where('users', x => x.name === name)[0] || {};
    const roleName = u.role || '';
    return DB.where('role', r => r.name === roleName)[0] || null;
  }
  function currentRole() { return roleOfUser(DB.currentUser()); }
  /** 权限判定:角色 perms 形如 ['products:view','products:edit'] ; level>=9 视为超级权限 */
  function can(module, action) {
    const r = currentRole();
    if (!r) return true;
    if ((r.level || 0) >= 9) return true;
    if (r.status === 'disabled') return false;
    const perms = r.perms || [];
    action = action || 'view';
    return perms.indexOf(module + ':' + action) >= 0 || perms.indexOf(module + ':*') >= 0;
  }
  function grant(roleCode, module, action, on) {
    const r = DB.find('role', roleCode);
    if (!r) return;
    r.perms = r.perms || [];
    const k = module + ':' + action;
    const i = r.perms.indexOf(k);
    if (on && i < 0) r.perms.push(k);
    if (!on && i >= 0) r.perms.splice(i, 1);
    r.perms.sort();
    DB.upsert('role', r);
    DB.persist();
    DB.log('权限管理', on ? '授予权限' : '回收权限', roleCode, k);
  }
  function grantAll(roleCode, module, on) {
    PERM_ACTIONS.forEach(a => grant(roleCode, module, a, on));
  }
  function assertPerm(module, action) {
    if (!can(module, action)) throw new Error(`当前用户「${DB.currentUser()}」无${SCHEMA.entities[module] ? SCHEMA.entities[module].label : module}的${action === 'approve' ? '审批' : action === 'edit' ? '编辑' : '查看'}权限`);
  }

  /* ---------- 审批通过后的业务回调 ---------- */
  WF.product_release = { onDecide: (biz, ok) => { const t = DB.find('product_release', biz); t.status = ok ? 'approved' : 'rejected'; DB.upsert('product_release', t); } };
  WF.supplier_apply = {
    onDecide: (biz, ok) => {
      const t = DB.find('supplier_apply', biz);
      if (!['pending', 'inspecting'].includes(t.status)) return;
      if (ok && (t.score || 0) < 60) { t.status = 'rejected'; t.opinion = (t.opinion || '') + ' 评审得分不足 60,自动驳回'; }
      else t.status = ok ? 'approved' : 'rejected';
      DB.upsert('supplier_apply', t);
    }
  };
  WF.processor_audit = {
    onDecide: (biz, ok) => {
      const t = DB.find('processor_audit', biz);
      t.status = ok ? 'approved' : 'rejected';
      t.conclusion = ok ? (t.sample_result === 'fail' || (t.total_score || 0) < 60 ? 'blacklist' : 'qualified') : 'blacklist';
      DB.upsert('processor_audit', t);
      applyAuditResult(t);
    }
  };
  WF.rma = { onDecide: (biz, ok) => { const t = DB.find('rma', biz); t.status = ok ? 'approved' : 'rejected'; DB.upsert('rma', t); } };
  WF.so_change = { onDecide: (biz, ok, ap) => { if (ok) applySOChange(ap.no); } };
  WF.purchase_req = { onDecide: (biz, ok, ap) => { approvePR(biz, ok, ap.opinion); } };

  return { stockRow, recalc, move, available, recomputeReserved, journal, lineTotal, docTotal,
    saveSO, confirmSO, cancelSO, reopenSO, reopenPO, createDelivery, createInvoiceFromSO, createReceipt,
    confirmPO, cancelPO, createGR, createBillFromGR, createPayment, approvePR, prToPO,
    createTransfer, postStocktake, adjustStock, save, removeRow, autoCode,
    submitApproval, decideApproval, pendingApprovals, decideViaApproval, WF,
    sendRFQ, saveRFQQuotes, bestQuotes, awardRFQ, closeRFQ,
    submitRelease, decideRelease, publishRelease, offShelfRelease,
    submitApply, inspectApply, decideApply, archiveApply,
    submitAudit, inspectAudit, decideAudit, auditScore, applyAuditResult,
    confirmOS, cancelOS, issueOS, receiveOS,
    submitRMA, decideRMA, receiveRMA, creditRMA, refundRMA, repairRMA, closeRMA,
    requestSOChange, applySOChange, closeSO,
    periodRow, assertOpen, periodActivity, periodPnL, buildCloseLines, closePeriod, reopenPeriod,
    PERM: { can, grant, grantAll, assertPerm, roleOfUser, currentRole, ACTIONS: PERM_ACTIONS } };
})();
