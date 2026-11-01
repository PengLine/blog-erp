/* ============================================================
 * actions.js — 业务动作层(单据流转 + 库存 + 总账联动)
 * 所有写操作都遵循真实 ERP 勾稽关系:
 *   出库过账 → 库存流水 + 结转成本凭证
 *   发票过账 → 应收 + 收入/销项税凭证
 *   收款过账 → 核销应收 + 银行存款凭证
 *   收货过账 → 库存流水(移动加权成本)+ 暂估
 *   账单过账 → 应付 + 库存/进项税凭证
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
    s.value = r2(s.qty * s.cost);
    const p = DB.find('products', s.product) || {};
    s.status = s.qty <= 0 ? 'shortage' : (s.available < (p.safety_qty || 0) ? 'low' : 'normal');
    DB.upsert('stock', s);
    return s;
  }
  /** 写库存流水并同步现量;qty 为带符号数量 */
  function move(prodCode, whCode, qty, unitCost, type, ref, note, toWh) {
    const p = DB.find('products', prodCode) || {};
    const no = DB.nextNo('stock_movements');
    DB.insert('stock_movements', { no, date: DB.today(), type, product: prodCode, product_name: p.name || prodCode,
      warehouse: whCode, to_warehouse: toWh || '', qty, unit_cost: r2(unitCost), amount: r2(qty * unitCost),
      ref: ref || '', user: DB.currentUser(), note: note || '' });
    const s = stockRow(prodCode, whCode);
    if (qty > 0 && unitCost) {
      // 移动加权平均单位成本
      const oldQty = s.qty, oldCost = s.cost;
      s.cost = oldQty + qty > 0 ? r2((oldQty * oldCost + qty * unitCost) / (oldQty + qty)) : unitCost;
    }
    s.qty += qty;
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
      warehouse: po.warehouse, amount: r2(costSum), status: 'posted', user: DB.currentUser(), note: '' });
    const allDone = poLines.every(l => (l.received || 0) >= l.qty);
    po.status = allDone ? 'done' : (poLines.some(l => l.received > 0) ? 'partial' : 'confirmed');
    DB.upsert('purchase_order', po);
    DB.log('采购管理', '过账采购收货单', gNo, `来源 ${poNo},入库成本 ¥${UI.money(costSum)}`);
    return gNo;
  }
  function createBillFromGR(grNo) {
    const gr = DB.find('gr', grNo);
    if (DB.list('bill').some(b => b.gr === grNo)) throw new Error('该收货单已生成账单');
    const bNo = DB.nextNo('bill');
    const sup = DB.find('suppliers', gr.supplier) || {};
    const terms = sup.payment_terms || 'NET30';
    const daysMap = { NET60: 60, NET45: 45, NET30: 30, PRE50: 15, PRE100: 0, COD: 0 };
    const due = DB.addDays(DB.today(), daysMap[terms] || 30);
    const lines = DB.lines('gr_lines', grNo);
    const net = r2(lines.reduce((s, l) => s + l.qty * l.price, 0));
    const vat = r2(lines.reduce((s, l) => s + l.qty * l.price * (l.tax_rate || 0) / 100, 0));
    const total = r2(net + vat);
    DB.insert('bill', { no: bNo, date: DB.today(), supplier: gr.supplier, supplier_name: gr.supplier_name, po: gr.po, gr: grNo,
      due_date: due, status: 'open', total, paid: 0, balance: total, note: '' });
    lines.forEach((l, i) => DB.insert('bill_lines', Object.assign({}, l, { doc: bNo, lineno: i + 1 })));
    journal(DB.today(), 'ap_bill', bNo, `采购账单确认—${gr.supplier_name}`, [
      { acc: '1405', debit: net, memo: '采购入库' },
      { acc: '2221', debit: vat, memo: '进项税额' }, { acc: '2202', credit: total, memo: '应付—' + gr.supplier_name }]);
    DB.log('采购管理', '生成采购账单', bNo, `价税合计 ¥${UI.money(total)}`);
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
    const map = { products: 'HM-', customers: 'CU-', suppliers: 'SU-', warehouses: 'WH-' };
    const pre = map[entity];
    if (!pre) return DB.nextNo(entity);
    let n = DB.count(entity) + 1;
    let code;
    do { code = pre + String(1000 + n).slice(1); n++; } while (DB.find(entity, code));
    return code;
  }
  /* 主数据被引用时禁止删除:[实体, 引用字段, 引用表] */
  const REF_CHECK = {
    products: [['product', 'so_lines'], ['product', 'po_lines'], ['product', 'pr_lines'], ['product', 'tr_lines'], ['product', 'stk_lines'], ['product', 'stock'], ['product', 'stock_movements']],
    customers: [['customer', 'sales_order'], ['customer', 'invoice'], ['customer', 'receipt']],
    suppliers: [['supplier', 'purchase_order'], ['supplier', 'gr'], ['supplier', 'bill'], ['supplier', 'payment']],
    warehouses: [['warehouse', 'stock'], ['warehouse', 'sales_order'], ['warehouse', 'purchase_order'], ['warehouse', 'stock_movements']],
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

  return { stockRow, recalc, move, available, recomputeReserved, journal, lineTotal, docTotal,
    saveSO, confirmSO, cancelSO, reopenSO, reopenPO, createDelivery, createInvoiceFromSO, createReceipt,
    confirmPO, cancelPO, createGR, createBillFromGR, createPayment, approvePR, prToPO,
    createTransfer, postStocktake, adjustStock, save, removeRow, autoCode };
})();
