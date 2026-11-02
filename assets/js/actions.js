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
  /* 单件耗用保留 4 位:0.038 kg/件 这类用量按 2 位取整会把需求抬高 5% */
  const r4 = v => Math.round((+v || 0) * 10000) / 10000;

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
    s.available = s.qty - s.reserved - LOTX.holdQty(s.product, s.warehouse);
    const p = DB.find('products', s.product) || {};
    s.status = s.qty <= 0 ? 'shortage' : (s.available < (p.safety_qty || 0) ? 'low' : 'normal');
    DB.upsert('stock', s);
    return s;
  }
  /* ---------------- 批次与库位(分配算法在 lots.js) ---------------- */
  const LOTX = LOT.engine({
    lots: () => DB.list('lot'),
    bins: () => DB.list('bins'),
    warehouses: wh => DB.find('warehouses', wh),
    product: code => DB.find('products', code),
    newLot: row => DB.insert('lot', row),
    updLot: row => DB.upsert('lot', row),
    addTx: (lotNo, row) => {
      const ls = DB.lines('lot_tx', lotNo);
      row.lineno = ls.length + 1;
      DB.setLines('lot_tx', lotNo, ls.concat([row]));
    },
    nextNo: () => DB.nextNo('lot'),
    stampMv: m => DB.upsert('stock_movements', m),
    today: () => DB.today(), addDays: (d, n) => DB.addDays(d, n), user: () => DB.currentUser()
  });
  /** 入库流水的批次档案补充信息:来源供应商、供应商批号、来源单据 */
  function lotMeta(mv) {
    if (mv.qty <= 0) return null;
    const out = { source: mv.type };
    if (mv.ref === '期初建账') out.source = 'init';
    if (mv.type === 'po_receipt') {
      const g = DB.find('gr', mv.ref);
      if (g) { out.supplier = g.supplier; out.supplier_name = g.supplier_name; out.sup_lot = g.sup_lot; out.iqc = g.iqc; }
    } else if (mv.type === 'os_receive') {
      const o = DB.find('os_order', mv.ref);
      if (o) { out.supplier_name = o.processor_name; out.note = '委外加工收回,批次责任外协厂 ' + o.processor_name; }
    } else if (mv.type === 'so_return') {
      const r = DB.find('rma', mv.ref);
      out.note = r ? `客户退货回库(${r.customer_name}),品质复检前不得再次发货` : '退货回库批次';
    } else if (mv.type === 'stocktake_plus') out.note = '盘盈入账,无源单据批次';
    else if (mv.type === 'manual') out.note = mv.note || '手工调整入账批次';
    return out;
  }
  /** 写库存流水并同步现量;qty 为带符号数量 */
  function move(prodCode, whCode, qty, unitCost, type, ref, note, toWh, preferLots) {
    assertOpen(DB.today(), '出入库');
    const p = DB.find('products', prodCode) || {};
    const no = DB.nextNo('stock_movements');
    const amount = r2(qty * unitCost);
    const mv = { no, date: DB.today(), type, product: prodCode, product_name: p.name || prodCode,
      warehouse: whCode, to_warehouse: toWh || '', qty, unit_cost: r2(unitCost), amount,
      ref: ref || '', user: DB.currentUser(), note: note || '' };
    DB.insert('stock_movements', mv);
    const meta = lotMeta(mv) || {};
    if (qty < 0 && preferLots && preferLots.length) meta.lots = preferLots;
    LOTX.apply(mv, meta);
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

  /* ================= 信用风控 ================= */
  const CREDIT_WATCH = 0.8;          // 使用率 ≥80% 触发预警
  const CREDIT_BLOCK = 1.0;          // 使用率 >100% 必须走信用特批
  /** 客户信用占用 = 未结清发票余额 + 已审核未开票订单金额 */
  function creditState(custCode) {
    const c = DB.find('customers', custCode) || { code: custCode };
    const invs = DB.where('invoice', i => i.customer === custCode && i.status !== 'cancelled');
    const ar = r2(invs.reduce((s, i) => s + Math.max(0, i.balance || 0), 0));
    const odInvs = invs.filter(i => (i.balance || 0) > 0.004 && i.due_date && i.due_date < DB.today());
    const overdue = r2(odInvs.reduce((s, i) => s + Math.max(0, i.balance || 0), 0));
    const odDays = odInvs.reduce((s, i) => Math.max(s, UI.days(i.due_date, DB.today())), 0);
    const openSOs = DB.where('sales_order', o => o.customer === custCode && ['confirmed', 'partial'].includes(o.status));
    let open = 0;
    openSOs.forEach(o => {
      const billed = invs.filter(i => i.so === o.no).reduce((s, i) => s + (i.total || 0), 0);
      open += Math.max(0, (o.total || 0) - billed);
    });
    const limit = +c.credit_limit || 0;
    const used = r2(ar + open);
    return { code: custCode, name: c.name || custCode, limit, ar, open: r2(open), used, free: r2(limit - used),
      rate: limit > 0 ? used / limit : (used > 0 ? 9.9 : 0), overdue, odDays, hold: c.credit_hold === 'hold',
      terms: c.payment_terms || '—', openCount: openSOs.length, odCount: odInvs.length };
  }
  /** 审核前的信用闸门:冻结直接拦截,超额需信用特批 */
  function checkCredit(so, extra) {
    const st = creditState(so.customer);
    const after = r2(st.used + (extra == null ? (so.total || 0) : extra));
    const rate = st.limit > 0 ? after / st.limit : (after > 0 ? 9.9 : 0);
    if (st.hold) throw new Error(`客户「${st.name}」信用已冻结(财务停售),需财务经理在客户档案中解除后才能审核。`);
    if (rate > CREDIT_BLOCK) {
      const pend = DB.where('approval', a => a.module === 'credit' && a.biz === so.no && a.status === 'pending')[0];
      if (pend) throw new Error(`本单已挂信用特批 ${pend.no},等待财务经理裁决。`);
      throw new Error(`审核将使「${st.name}」信用占用达 ¥${UI.money(after)} / 额度 ¥${UI.money(st.limit)}(${(rate * 100).toFixed(0)}%),超限部分需在订单详情发起「信用特批」。`);
    }
    return Object.assign(st, { after, rate, warn: rate >= CREDIT_WATCH });
  }
  /** 发起信用特批:财务经理裁决通过后订单自动审核 */
  function submitCreditRelease(soNo) {
    const so = DB.find('sales_order', soNo);
    if (!so) throw new Error('订单不存在');
    if (so.status !== 'draft') throw new Error('仅草稿订单需要发起信用特批');
    const pend = DB.where('approval', a => a.module === 'credit' && a.biz === soNo && a.status === 'pending')[0];
    if (pend) throw new Error(`本单已挂信用特批 ${pend.no},请勿重复发起`);
    const st = creditState(so.customer);
    const after = r2(st.used + (so.total || 0));
    const over = r2(Math.max(0, after - st.limit));
    const no = submitApproval('credit', soNo, {
      title: `信用特批 ${so.customer_name} · ${soNo}`, amount: so.total, role: '财务经理', priority: 'urgent',
      note: `额度 ¥${UI.money(st.limit)} · 已占用 ¥${UI.money(st.used)} · 本单 ¥${UI.money(so.total)} · 超额 ¥${UI.money(over)}`,
      applicant: so.salesperson || DB.currentUser()
    });
    so.credit_ap = no; so.note = (so.note ? so.note + ' / ' : '') + `信用超额待批 ${no}`;
    DB.upsert('sales_order', so);
    DB.log('销售管理', '发起信用特批', no, `${so.customer_name} 超额 ¥${UI.money(over)}`);
    return { no, over, st, after };
  }
  /** 收款释放额度后,自动放行等待中的同客户特批 */
  function releaseCredit(customerCode, reason) {
    const list = DB.where('approval', a => a.module === 'credit' && a.status === 'pending')
      .filter(a => { const so = DB.find('sales_order', a.biz); return so && so.customer === customerCode && so.status === 'draft'; });
    const st = creditState(customerCode);
    const done = [];
    list.forEach(a => {
      const so = DB.find('sales_order', a.biz);
      const after = r2(st.used + (so.total || 0));
      if (st.hold || (st.limit > 0 && after > st.limit * CREDIT_BLOCK)) return;
      const pct = st.limit > 0 ? Math.round(after / st.limit * 100) : 0;
      decideApproval(a.no, true, `${reason};额度使用率回落至 ${pct}%,系统自动放行`, { force: true });
      done.push(a.no);
    });
    return done;
  }
  /** 反审核/取消后额度即时回收,无需额外动作:占用额仅统计已确认与部分出库订单 */

  /* ================= 价格策略与取价引擎 ================= */
  const PRICE_FLOOR = 0.05;                 // 无价目表红线时的默认毛利率底线
  const KIND_WEIGHT = { customer: 1, promo: 2, channel: 3, category: 4, tier: 5, std: 6 };
  const KIND_TXT = SCHEMA.entities.price_list.fields.kind.opts;

  /** 有效期内的已生效价目表;优先级数值小者在前,同级取生效日更新者 */
  function activeLists(date) {
    return DB.list('price_list')
      .filter(pl => pl.status === 'approved'
        && (!pl.valid_from || date >= pl.valid_from)
        && (!pl.valid_to || date <= pl.valid_to))
      .sort((a, b) => (a.priority || 50) - (b.priority || 50) || String(b.valid_from).localeCompare(String(a.valid_from)));
  }
  /** 单张价目表命中物料与起订量档位:满足量的档位里取最大批量(量大有价),不满足则不参与 */
  function listQuote(pl, product, qty) {
    if (pl.category && (DB.find('products', product) || {}).category !== pl.category) return null;
    const hit = DB.lines('pl_lines', pl.no).filter(l => l.product === product && (l.tier_qty || 0) <= qty)
      .sort((a, b) => (b.tier_qty || 0) - (a.tier_qty || 0))[0];
    return hit || null;
  }
  /** 成交时点的成本基准:有该仓移动加权成本用它,否则回落到物料标准成本 */
  function priceCost(product, warehouse) {
    const s = warehouse ? DB.find('stock', product + '-' + warehouse) : null;
    const p = DB.find('products', product) || {};
    const cost = s && s.cost ? s.cost : (p.cost || 0);
    return r2(cost);
  }
  /** 毛利率红线价:成本 ×(1 + 红线毛利率),价目表自带红线优先,缺省用全局底线 */
  function priceFloor(product, warehouse, marginRate) {
    const cost = priceCost(product, warehouse);
    const rate = marginRate == null ? PRICE_FLOOR : +marginRate;
    return { cost, rate, price: r2(cost * (1 + rate)) };
  }
  /** 取价阶梯:客户专属 → 促销 → 渠道 → 类目 → 阶梯 → 标准,逐级回落到物料主数据售价 */
  function pricePick(ctx) {
    const date = ctx.date || DB.today();
    const qty = Math.max(0, +ctx.qty || 0);
    const p = DB.find('products', ctx.product) || {};
    const std = r2(p.price || 0);
    const lists = activeLists(date);
    let best = null;
    for (let i = 0; i < lists.length; i++) {
      const pl = lists[i];
      if (pl.kind === 'customer' && (!ctx.customer || pl.customer !== ctx.customer)) continue;
      if (pl.kind === 'channel' && (!ctx.channel || pl.channel !== ctx.channel)) continue;
      if (pl.customer && pl.customer !== ctx.customer) continue;
      const line = listQuote(pl, ctx.product, qty);
      if (!line) continue;
      const rank = (KIND_WEIGHT[pl.kind] || 9) * 100 + (pl.priority || 50);
      if (best && best.rank <= rank) continue;
      const gross = r2(line.price || 0);
      const taxInc = pl.tax_included === 'y';
      const tr = +p.tax_rate || 13;
      const net = r2(taxInc ? gross / (1 + tr / 100) : gross);
      best = { rank, listNo: pl.no, listName: pl.name, kind: pl.kind, gross, price: net,
        discount: +line.discount || 0, tierQty: line.tier_qty || 0, taxIncluded: taxInc, taxRate: tr,
        marginFloor: pl.margin_floor == null ? PRICE_FLOOR : +pl.margin_floor,
        source: `${KIND_TXT[pl.kind] || pl.kind} · ${pl.no}${line.tier_qty ? `(满 ${UI.num(line.tier_qty)} 件)` : ''}` };
    }
    if (!best) best = { rank: 999, listNo: '', listName: '', kind: 'std', gross: std, price: std,
      discount: 0, tierQty: 0, taxIncluded: false, taxRate: +p.tax_rate || 13, marginFloor: PRICE_FLOOR,
      source: '标准售价 · 物料主数据' };
    best.net = r2(best.price * (1 - best.discount));          // 未税成交价:价目表价扣行折让,与订单行口径一致
    const fl = priceFloor(ctx.product, ctx.warehouse, best.marginFloor);
    const net = best.net;
    best.cost = fl.cost;
    best.floor = fl.price;
    best.margin = net > 0 ? r2((net - fl.cost) / net) : 0;
    best.below = net > 0 && net < fl.price;
    return best;
  }
  /** 整单毛利体检:低于红线价的行需要改价审批,价目表内已核准的价格不重复拦截 */
  function priceGuard(so, lines) {
    const out = [];
    (lines || DB.lines('so_lines', so.no)).forEach(l => {
      if (!l.product || !l.qty) return;
      const q = pricePick({ customer: so.customer, product: l.product, qty: l.qty, date: so.date || DB.today(), channel: so.channel, warehouse: so.warehouse });
      const net = r2((l.price || 0) * (1 - (l.discount || 0)));
      if (net <= 0) { out.push({ lineno: l.lineno, product: l.product, product_name: l.product_name, qty: l.qty, price: l.price, floor: q.floor, cost: q.cost, net, gap: r2(q.floor - net), zero: true }); return; }
      if (q.listNo && Math.abs(net - q.net) < 0.005) return;      // 按价目表成交即视为已核准
      if (net < q.floor) out.push({ lineno: l.lineno, product: l.product, product_name: l.product_name, qty: l.qty, price: l.price, discount: l.discount || 0, floor: q.floor, cost: q.cost, net, gap: r2(q.floor - net), std: q.price, source: q.source });
    });
    return out;
  }
  /** 发起改价审批:按价差金额分级会签,通过后回写订单行单价 */
  function submitPriceChange(soNo, rows, reason) {
    const so = DB.find('sales_order', soNo);
    if (!so) throw new Error('订单不存在');
    if (so.status !== 'draft') throw new Error('仅草稿订单可以发起改价,已审核订单请走订单变更');
    const pend = DB.where('approval', a => a.module === 'price_change' && a.biz === soNo && a.status === 'pending')[0];
    if (pend) throw new Error(`本单已挂改价审批 ${pend.no},等待裁决`);
    const lines = DB.lines('so_lines', soNo);
    const plan = (rows || []).map(r => {
      const l = lines.find(x => x.lineno === r.lineno || x.product === r.product);
      if (!l) return null;
      const q = pricePick({ customer: so.customer, product: l.product, qty: l.qty, date: so.date || DB.today(), channel: so.channel, warehouse: so.warehouse });
      const ref = r2(q.net);                       // 价目表口径净价:改价影响一律与它对比较
      const newNet = r2(+r.price * (1 - (+r.discount || 0)));
      return { lineno: l.lineno, product: l.product, product_name: l.product_name, qty: l.qty,
        old_price: l.price, new_price: +r.price, old_discount: l.discount || 0, new_discount: +r.discount || 0,
        cost: q.cost, floor: q.floor, list_price: ref, list_src: q.source, impact: r2((newNet - ref) * l.qty) };
    }).filter(Boolean);
    if (!plan.length) throw new Error('没有需要改价的行');
    const impact = r2(plan.reduce((s, x) => s + x.impact, 0));
    const no = submitApproval('price_change', soNo, {
      title: `改价申请 ${so.customer_name} · ${soNo}`, amount: r2(Math.abs(impact)), role: '销售主管',
      priority: Math.abs(impact) >= 30000 ? 'urgent' : 'std',
      applicant: so.salesperson || DB.currentUser(),
      note: `${plan.length} 行调价,收入影响 ¥${UI.money(impact)} · 订单额 ¥${UI.money(so.total)} · ${reason || ''}`,
      payload: { rows: plan, reason: reason || '' }
    });
    so.price_ap = no;
    so.note = (so.note ? so.note + ' / ' : '') + `改价待批 ${no}`;
    DB.upsert('sales_order', so);
    DB.log('销售管理', '发起改价审批', no, `${so.customer_name} · ${plan.length} 行 · 影响 ¥${UI.money(impact)}`);
    return { no, impact, plan };
  }
  /** 改价裁决回写:通过则按审批载荷改行价并重算订单额,驳回则留痕等销售改单 */
  function applyPriceChange(biz, ok, ap) {
    const so = DB.find('sales_order', biz);
    if (!so) return;
    so.price_ap = ok ? ap.no : '';
    so.note = (so.note || '').split(' / ').filter(x => !/改价待批|改价审批/.test(x)).join(' / ');
    if (ok && ap.payload && ap.payload.rows) {
      const lines = DB.lines('so_lines', biz);
      ap.payload.rows.forEach(r => {
        const l = lines.find(x => x.lineno === r.lineno);
        if (!l) return;
        l.price = r.new_price; l.discount = r.new_discount;
        l.amount = r2(l.qty * l.price * (1 - (l.discount || 0)));
        l.price_src = `改价审批 ${ap.no}`;
      });
      DB.setLines('so_lines', biz, lines);
      so.total = docTotal(lines); so.amount = so.total;
      DB.upsert('sales_order', so);
      so.note = (so.note ? so.note + ' / ' : '') + `改价审批 ${ap.no} 已通过,单价已回写`;
    } else {
      so.note = (so.note ? so.note + ' / ' : '') + `改价审批 ${ap.no} 被驳回(${ap.approver || '销售主管'}),按价目表价重新报价`;
    }
    DB.upsert('sales_order', so);
    DB.log('销售管理', ok ? '改价审批通过' : '改价审批驳回', ap.no, `${so.customer_name} · ${biz}`);
  }
  /** 近半年实际销量:价目表让利的金额影响按它折算,客户专属价只看该客户自己的成交 */
  function soldQty(product, customer) {
    let q = 0;
    DB.list('so_lines').forEach(l => {
      if (l.product !== product) return;
      const o = DB.find('sales_order', l.doc);
      if (!o || o.status === 'draft' || o.status === 'cancelled') return;
      if (customer && o.customer !== customer) return;
      q += l.qty || 0;
    });
    return q;
  }
  /** 让利测算:每行成交价对标准售价的价差 × 实际销量,合计即价格策略的收入影响 */
  function listImpact(pl) {
    const lines = DB.lines('pl_lines', pl.no);
    let total = 0;
    const rows = lines.map(l => {
      const p = DB.find('products', l.product) || {};
      const std = r2(l.std_price || p.price || 0);
      const net = r2((l.price || 0) * (1 - (l.discount || 0)));
      const qty = soldQty(l.product, pl.kind === 'customer' ? pl.customer : '');
      const give = r2((net - std) * qty);
      total += give;
      return { lineno: l.lineno, product: l.product, product_name: l.product_name || p.name, tier_qty: l.tier_qty || 0,
        std, net, delta: r2(net - std), qty, give, margin: net > 0 ? r2((net - (l.cost || p.cost || 0)) / net) : 0 };
    });
    return { rows, total: r2(total), lines: rows.length };
  }
  /** 提交价目表核准:让利金额越大,会签层级越高;生效后取价引擎即刻引用 */
  function submitListApproval(no) {
    const pl = DB.find('price_list', no);
    if (!pl) throw new Error('价目表不存在');
    if (pl.status !== 'draft' && pl.status !== 'rejected') throw new Error('仅草稿或被驳回的价目表可以提交核准');
    if (!DB.lines('pl_lines', no).length) throw new Error('请先维护价格行再提交核准');
    const im = listImpact(pl);
    const amount = r2(Math.abs(im.total));
    const ap = submitApproval('price_list', no, {
      title: `${pl.name} 生效核准`, applicant: pl.owner || DB.currentUser(), role: '销售主管', amount,
      priority: amount >= SCHEMA.SIGN_TIERS[SCHEMA.SIGN_TIERS.length - 1].min ? 'urgent' : 'std',
      note: `${im.lines} 个价格行,相对标准售价让利 ¥${UI.money(Math.abs(im.total))}(按近半年实际销量折算)· 红线毛利率 ${(+((pl.margin_floor == null ? PRICE_FLOOR : pl.margin_floor) * 100).toFixed(1))}%`
    });
    pl.status = 'pending'; pl.ap = ap;
    pl.note = (pl.note ? pl.note + ' / ' : '') + `已提交核准 ${ap},待销售主管裁决`;
    DB.upsert('price_list', pl);
    DB.log('商品管理', '提交价目表核准', ap.no, `${pl.name} · 让利 ¥${UI.money(Math.abs(im.total))}`);
    return { no: ap, impact: im.total, rows: im.rows.length };
  }
  /** 核准裁决:通过即生效,驳回退回草稿口径等待修订 */
  function applyListDecision(biz, ok, ap) {
    const pl = DB.find('price_list', biz);
    if (!pl) return;
    pl.status = ok ? 'approved' : 'rejected';
    pl.note = (pl.note ? pl.note + ' / ' : '')
      + (ok ? `${ap.no} 已核准,${pl.valid_from} 起取价引擎引用`
            : `${ap.no} 被${ap.approver || '销售主管'}驳回:${ap.opinion || '让利幅度超出预算'}`);
    DB.upsert('price_list', pl);
    DB.log('商品管理', ok ? '价目表核准生效' : '价目表核准驳回', ap.no, `${pl.name} · ${biz}`);
  }
  /** 停用:把失效日压到今天,次日不再被取价,历史引用留痕 */
  function retireList(no, reason) {
    const pl = DB.find('price_list', no);
    if (!pl) throw new Error('价目表不存在');
    if (pl.status !== 'approved') throw new Error('仅已生效的价目表需要停用');
    pl.valid_to = DB.today();
    pl.note = (pl.note ? pl.note + ' / ' : '') + `${DB.today()} 起停用:${reason || '策略调整'}`;
    DB.upsert('price_list', pl);
    DB.log('商品管理', '价目表停用', no, `${pl.name} · ${reason || '策略调整'}`);
    return pl;
  }

  /* ================= 物料清单 BOM ================= */
  /* 单件耗用 = 用量 ×(1 + 损耗率):损耗只抬高子件需求,不改父件数量口径 */
  function bomUnitUse(l) { return r4((+l.qty || 0) * (1 + (+l.loss_rate || 0))); }
  /** 生效清单:同一父件在同一时点只认一张已核准且在有效期内的 BOM,取生效日最新、版本号最大者 */
  function bomFor(product, date) {
    date = date || DB.today();
    const cands = DB.list('bom').filter(b => b.product === product && b.status === 'approved'
      && (!b.effect_from || b.effect_from <= date) && (!b.effect_to || b.effect_to >= date));
    return cands.sort((a, b) => String(b.effect_from || '').localeCompare(String(a.effect_from || ''))
      || String(b.version || '').localeCompare(String(a.version || '')))[0] || null;
  }
  /** 成本滚算:一件父件的材料成本 = Σ 子件(单件耗用 × 子件标准成本),自下而上递归 */
  function bomMatCost(product, date, path) {
    path = path || [];
    if (path.indexOf(product) >= 0) return 0;
    const bom = bomFor(product, date);
    if (!bom) return r2(((DB.find('products', product) || {}).cost) || 0);
    const next = path.concat([product]);
    return r2(DB.lines('bom_lines', bom.no).reduce((s, l) => {
      const unit = bomFor(l.product, date) ? bomMatCost(l.product, date, next) : ((DB.find('products', l.product) || {}).cost || 0);
      return s + bomUnitUse(l) * unit;
    }, 0));
  }
  /** 多级展开:tree 供结构树渲染,rows 按物料汇总毛需求(取最小层级)供 MRP 与缺料分析
      o.bom 可指定"从这一张清单起算",草稿与改版还没生效时也要能看见自己的结构 */
  function bomExplode(product, qty, o) {
    o = o || {};
    const date = o.date || DB.today(), maxLevel = o.maxLevel || 8;
    const rows = {};
    let deepest = 1;
    function build(code, use, level, path, from) {
      const p = DB.find('products', code) || {};
      const bom = !from && level === 1 && o.bom ? o.bom : bomFor(code, date);
      const n = { code, name: p.name || code, level, qty: r2(use), uom: p.uom || 'PCS', mrp_src: p.mrp_src || 'buy',
        cost: r2(p.cost || 0), amount: r2(use * (p.cost || 0)), bom: bom ? bom.no : '', children: [], cycle: false, from: from || '' };
      if (!bom) { n.leaf = true; return n; }
      if (path.indexOf(code) >= 0 || level > maxLevel) { n.cycle = true; return n; }
      const next = path.concat([code]);
      DB.lines('bom_lines', bom.no).forEach(l => {
        const childQty = r2(n.qty * bomUnitUse(l));
        const c = build(l.product, childQty, level + 1, next, code);
        c.per_unit = r2(+l.qty || 0); c.loss = r2(+l.loss_rate || 0);
        c.key_part = l.key_part === 'y'; c.substitute = l.substitute || ''; c.position = l.position || '';
        n.children.push(c);
        deepest = Math.max(deepest, level + 1);
        const r = rows[l.product] || (rows[l.product] = { product: l.product, product_name: c.name, level: level + 1,
          gross: 0, uom: c.uom, mrp_src: c.mrp_src, cost: c.cost, parents: [], key_part: false, cycle: false });
        r.gross = r2(r.gross + childQty);
        r.level = Math.min(r.level, level + 1);
        if (r.parents.indexOf(code) < 0) r.parents.push(code);
        if (c.key_part) r.key_part = true;
        if (c.cycle) r.cycle = true;
      });
      return n;
    }
    const root = build(product, +qty || 0, 1, [], '');
    return { root: root, rows: Object.keys(rows).map(k => rows[k]).sort((a, b) => a.level - b.level || b.gross - a.gross),
      levels: deepest };
  }
  /** 层数口径与 bomExplode 一致(父件本身算第 1 层,单层清单 = 2):草稿与改版还没生效,
      bomFor 取不到自己,所以按传入的子件行下钻,而不是从父项物料起算 */
  function bomDepthOf(lines, path) {
    path = path || [];
    if (!(lines || []).length) return 1;
    let h = 0;
    (lines || []).forEach(l => {
      const sub = bomFor(l.product);
      /* 外购子件占一层;自制子件按它自己的清单继续往下数 */
      h = Math.max(h, sub && path.indexOf(sub.no) < 0 ? bomDepthOf(DB.lines('bom_lines', sub.no), path.concat([sub.no])) : 1);
    });
    return 1 + h;
  }
  function bomDepth(bom) { return bom ? bomDepthOf(DB.lines('bom_lines', bom.no)) : 1; }
  /** 本清单口径的单件材料成本(自子件行滚算,不依赖父项是否已生效) */
  function bomMatCostOf(bom, path) {
    if (!bom) return 0;
    path = path || [];
    if (path.indexOf(bom.no) >= 0) return 0;
    const next = path.concat([bom.no]);
    return r2(DB.lines('bom_lines', bom.no).reduce((s, l) => {
      const sub = bomFor(l.product);
      const unit = sub && sub.no !== bom.no ? bomMatCostOf(sub, next) : r2((DB.find('products', l.product) || {}).cost || 0);
      return s + bomUnitUse(l) * unit;
    }, 0));
  }
  /** 反查:某物料被哪些已核准清当作组件使用(工程变更影响面) */
  function bomWhereUsed(code) {
    return DB.list('bom_lines').filter(l => l.product === code)
      .map(l => ({ l: l, b: DB.find('bom', l.doc) })).filter(x => x.b && x.b.status !== 'draft')
      .map(x => ({ no: x.b.no, name: x.b.name, parent: x.b.product, parent_name: x.b.product_name,
        per_unit: r2(+x.l.qty || 0), loss: r2(+x.l.loss_rate || 0), status: x.b.status }))
      .sort((a, b) => String(a.no).localeCompare(String(b.no)));
  }
  /** 变更影响:单件材料成本 × 近半年父项销量,作为 BOM 核准的分级金额 */
  function bomImpact(bom) {
    const lines = DB.lines('bom_lines', bom.no);
    const unit = bomMatCostOf(bom);
    const since = DB.addDays(DB.today(), -182);
    const sold = DB.list('so_lines').filter(l => l.product === bom.product)
      .reduce((s, l) => s + (+l.qty || 0), 0);
    return { unit: unit, sold: sold, lines: lines.length, annual: r2(unit * sold),
      rows: lines.map(l => ({ product: l.product, product_name: l.product_name, per_unit: +l.qty || 0,
        loss: +l.loss_rate || 0, use: bomUnitUse(l), cost: r2((DB.find('products', l.product) || {}).cost || 0),
        amount: r2(bomUnitUse(l) * ((DB.find('products', l.product) || {}).cost || 0)) })) };
  }
  /** 提交核准:草稿/驳回可提;按半年滚动销量测算材料影响额,达档位自动加签 */
  function bomSubmit(no) {
    const b = DB.find('bom', no);
    if (!b) throw new Error('BOM 不存在');
    if (b.status !== 'draft' && b.status !== 'rejected') throw new Error('仅草稿或被驳回的清单可以提交核准');
    const lines = DB.lines('bom_lines', no);
    if (!lines.length) throw new Error('请先维护子件行再提交核准');
    if (lines.some(l => l.product === b.product)) throw new Error('子件不能引用父件自身(会造成展开死循环)');
    const im = bomImpact(b);
    const ap = submitApproval('bom', no, {
      title: `${b.product_name || b.product} BOM ${b.version} 发布核准`, applicant: b.owner || DB.currentUser(),
      role: '采购主管', amount: im.annual, priority: im.annual >= SCHEMA.SIGN_TIERS[1].min ? 'urgent' : 'std',
      note: `${lines.length} 项子件 · 单件材料成本 ¥${UI.money(im.unit)} · 近半年销量 ${UI.num(im.sold)} 件`
    });
    b.status = 'pending'; b.ap = ap; b.lines_cnt = lines.length;
    /* mat_cost 恒为本清单子件行的直接材料合计(与编辑器、种子口径一致),滚算成本只用于核价与影响额 */
    b.mat_cost = r2(lines.reduce((s, l) => s + bomUnitUse(l) * ((DB.find('products', l.product) || {}).cost || 0), 0));
    b.levels = bomDepth(b);
    DB.upsert('bom', b);
    DB.log('计划管理', 'BOM 提交核准', no, `${b.name} · 影响额 ¥${UI.money(im.annual)}`);
    return ap;
  }
  function applyBomDecision(no, ok, ap) {
    const b = DB.find('bom', no);
    if (!b) return;
    b.status = ok ? 'approved' : 'rejected';
    b.note = (b.note ? b.note + ' / ' : '') + (ok ? `${DB.today()} 经 ${ap.approver || '采购主管'} 核准发布`
      : `${ap.no} 被驳回(${ap.opinion || '资料不全'}),请修改后重提`);
    DB.upsert('bom', b);
    if (ok) {
      const p = DB.find('products', b.product);
      if (p) { p.bom_no = b.no; if (!p.mrp_src) p.mrp_src = b.mrp_src || 'make'; DB.upsert('products', p); }
    }
    DB.log('计划管理', ok ? 'BOM 核准发布' : 'BOM 核准驳回', no, `${b.name} · ${ok ? '进入 MRP 展开范围' : '暂不参与计划运算'}`);
  }
  /** 作废:只压失效日,历史展开与已下达的计划建议保持可追 */
  function bomObsolete(no, reason) {
    const b = DB.find('bom', no);
    if (!b) throw new Error('BOM 不存在');
    if (b.status === 'obsolete') throw new Error('该清单已作废');
    b.status = 'obsolete'; b.effect_to = DB.today();
    b.note = (b.note ? b.note + ' / ' : '') + `${DB.today()} 作废:${reason || '工程变更,改用新版清单'}`;
    DB.upsert('bom', b);
    const p = DB.find('products', b.product);
    if (p && p.bom_no === b.no) { p.bom_no = ''; DB.upsert('products', p); }
    DB.log('计划管理', 'BOM 作废', no, `${b.name} · ${reason || '工程变更'}`);
    return b;
  }

  /* ================= MRP 计划运算 ================= */
  /** 供给口径:现量 − 订单占用 + 在途(已确认采购未收) + 在制(已确认委外未收回) */
  function mrpSupply(code, warehouse) {
    const rows = DB.where('stock', s => s.product === code && (!warehouse || s.warehouse === warehouse));
    const onHand = rows.reduce((s, x) => s + (x.qty || 0), 0);
    const held = rows.reduce((s, x) => s + (x.reserved || 0), 0);
    let inflow = 0;
    DB.list('purchase_order').filter(o => o.status === 'confirmed' || o.status === 'partial').forEach(o => {
      if (warehouse && o.warehouse !== warehouse) return;
      DB.lines('po_lines', o.no).forEach(l => { if (l.product === code) inflow += Math.max(0, (l.qty || 0) - (l.received || 0)); });
    });
    DB.list('os_order').filter(o => ['confirmed', 'issued', 'received'].indexOf(o.status) >= 0).forEach(o => {
      if (warehouse && o.warehouse !== warehouse) return;
      if (o.output_product === code) inflow += Math.max(0, (o.output_qty || 0) - (o.received_qty || 0));
    });
    return { on_hand: onHand, reserved: held, on_order: inflow, avail: onHand - held + inflow };
  }
  /** 参考单价:最近一笔采购订单的实际成交价,无采购史则回落物料标准成本 */
  function mrpPrice(code) {
    const hit = DB.list('purchase_order').filter(o => o.status !== 'draft' && o.status !== 'cancelled')
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(o => DB.lines('po_lines', o.no).find(l => l.product === code)).find(Boolean);
    if (hit && hit.price) return r2(+hit.price);
    return r2((DB.find('products', code) || {}).cost || 0);
  }
  /** 批量规则:净需求向上取整;不足最小起订量时按 MOQ 下单——宁可多采也不拆单 */
  function mrpLot(net, moq) {
    const q = Math.max(1, Math.ceil(net - 1e-6));
    return (+moq || 0) > q ? (+moq || 0) : q;
  }
  /** 需求清单:未履约订单缺口 / 安全库存补货 / 人工指定,同一物料多来源合并并保留最早需求日 */
  function mrpDemand(o) {
    const today = DB.today(), horizon = +o.horizon || 60, out = {};
    const push = (code, qty, date, from) => {
      if (!code || !(qty > 0)) return;
      const r = out[code] || (out[code] = { product: code, qty: 0, need_date: date, from: [] });
      r.qty += qty;
      if (String(date) < String(r.need_date)) r.need_date = date;
      if (from && r.from.indexOf(from) < 0 && r.from.length < 4) r.from.push(from);
    };
    if (o.source === 'safety') {
      DB.list('products').filter(p => (+p.safety_qty || 0) > 0).forEach(p => {
        const s = mrpSupply(p.code, o.warehouse);
        /* 毛需求记「目标库存 = 安全库存」,运算只减可用量,安全库存不再重复计入 */
        if ((+p.safety_qty || 0) - s.avail > 0) push(p.code, Math.ceil(+p.safety_qty), DB.addDays(today, 7), '安全库存补货');
      });
    } else if (o.source === 'manual') {
      (o.demand || []).forEach(d => push(d.product, Math.round(+d.qty || 0), d.need_date || DB.addDays(today, horizon), d.from || '人工需求'));
    } else {
      DB.list('sales_order').filter(x => x.status === 'confirmed' || x.status === 'partial').forEach(x => {
        if (o.warehouse && x.warehouse !== o.warehouse) return;
        const nd = x.required_date || DB.addDays(x.date, 14);
        if (UI.days(today, nd) > horizon) return;
        DB.lines('so_lines', x.no).forEach(l => push(l.product, Math.max(0, (l.qty || 0) - (l.delivered || 0)), nd, x.no));
      });
    }
    return Object.keys(out).map(k => out[k]).sort((a, b) => String(a.need_date).localeCompare(String(b.need_date)));
  }
  /** 运算主流程:逐层下展,父件按"本轮计划下单量"引爆子件需求,库存桶顺序扣减避免重复分配 */
  function mrpRun(o) {
    o = o || {};
    const today = DB.today(), wh = o.warehouse || '';
    const source = o.source || 'so_open', horizon = +o.horizon || 60;
    const demand = mrpDemand({ source: source, horizon: horizon, warehouse: wh, demand: o.demand });
    if (!demand.length) throw new Error('该口径下没有待满足的需求:请检查订单状态、计划周期或安全库存设置');
    const bucket = {};   // code -> 逐轮扣减后的剩余可用量
    const left = code => (code in bucket ? bucket[code] : (bucket[code] = mrpSupply(code, wh).avail));
    const rows = {};
    let frontier = demand.map(d => ({ code: d.product, qty: d.qty, level: 0, need_date: d.need_date, parents: d.from }));
    let deepest = 0;
    for (let level = 0; level <= 8 && frontier.length; level++) {
      const merged = {};
      frontier.forEach(f => {
        const m = merged[f.code] || (merged[f.code] = { code: f.code, qty: 0, level: f.level, need_date: f.need_date, parents: [] });
        m.qty = r2(m.qty + f.qty);
        if (String(f.need_date) < String(m.need_date)) m.need_date = f.need_date;
        f.parents.forEach(p => { if (m.parents.indexOf(p) < 0) m.parents.push(p); });
      });
      const next = [];
      Object.keys(merged).forEach(code => {
        const f = merged[code];
        const p = DB.find('products', code) || {};
        const bom = bomFor(code, today);
        const mode = p.mrp_src || (bom ? 'make' : 'buy');
        const sup = mrpSupply(code, wh);
        const safety = level ? 0 : (source === 'safety' ? 0 : (+p.safety_qty || 0));   /* 安全库存只在补货口径计一次:日算口径的需求行已含目标库存 */
        const avail = left(code);
        const net = Math.max(0, r2(f.qty + safety - avail));
        const lead = Math.max(1, +p.lead_time || (mode === 'buy' ? 14 : 10));
        const suggest = net > 0 ? mrpLot(net, +p.moq || 0) : 0;
        const r = rows[code] || (rows[code] = { product: code, product_name: p.name || code, level: f.level,
          gross_qty: 0, on_hand: sup.on_hand, reserved: sup.reserved, on_order: sup.on_order, safety_qty: (+p.safety_qty || 0),
          net_qty: 0, moq: (+p.moq || 0), lead_time: lead, suggest_qty: 0, mrp_src: mode, bom_no: bom ? bom.no : '',
          suggest_type: (mode === 'buy' || !bom) ? 'PR' : 'OS', need_date: f.need_date, parents: [], price: mrpPrice(code), amount: 0, memo: '' });
        r.level = Math.min(r.level, f.level);
        r.gross_qty = r2(r.gross_qty + f.qty);
        r.net_qty = r2(r.net_qty + net);
        r.suggest_qty += suggest;
        f.parents.forEach(x => { if (r.parents.indexOf(x) < 0) r.parents.push(x); });
        if (String(f.need_date) < String(r.need_date)) r.need_date = f.need_date;
        if (suggest > 0) bucket[code] = avail - suggest;
        r.amount = r2(r.suggest_qty * r.price);
        deepest = Math.max(deepest, r.level);
        if (suggest > 0 && bom) {
          DB.lines('bom_lines', bom.no).forEach(l => {
            const cd = DB.addDays(f.need_date, -lead);
            next.push({ code: l.product, qty: r2(suggest * bomUnitUse(l)), level: level + 1,
              need_date: cd < today ? today : cd, parents: [code] });
          });
        }
      });
      frontier = next;
    }
    const seq = Object.keys(rows).map(k => rows[k]).sort((a, b) => a.level - b.level || String(a.need_date).localeCompare(String(b.need_date)) || b.net_qty - a.net_qty);
    seq.forEach((r, i) => {
      r.lineno = i + 1;
      r.parents = r.parents.slice(0, 4).join('、');
      const late = UI.days(r.need_date, today);
      r.memo = r.suggest_qty <= 0 ? '可用量已覆盖,本轮不补货'
        : late > 0 ? `需求日已过 ${late} 天,建议加急` : `最晚下单日 ${DB.addDays(r.need_date, -r.lead_time)}`;
    });
    const no = DB.nextNo('mrp_run');
    const shortage = seq.filter(r => r.net_qty > 0);
    const run = { no, name: o.name || `${SCHEMA.MRP_DEMAND[source] || '需求'}计划 ${DB.today().slice(0, 7)}`, date: today,
      source, horizon, warehouse: wh, levels: deepest + 1, demand_cnt: demand.length, rows_cnt: seq.length,
      shortage_cnt: shortage.length, amount: r2(shortage.reduce((s, r) => s + r.amount, 0)),
      planner: DB.currentUser(), status: 'computed',
      note: o.note || `需求 ${demand.length} 项 · 展开 ${deepest + 1} 层 · 缺料 ${shortage.length} 项` };
    DB.upsert('mrp_run', run);
    DB.setLines('mrp_lines', no, seq);
    DB.log('计划管理', 'MRP 运算', no, `${run.name} · ${seq.length} 行建议,缺料 ${shortage.length} 行 ¥${UI.money(run.amount)}`);
    return run;
  }
  /** 下达建议:外购合并成一张采购申请,自制/委外逐件生成委外加工单并自动带出 BOM 发料行 */
  function mrpRelease(no, linenos, o) {
    o = o || {};
    const run = DB.find('mrp_run', no);
    if (!run) throw new Error('运算单不存在');
    if (run.status === 'closed') throw new Error('本运算单已归档,不能再下达;请重新发起一轮运算');
    const lines = DB.lines('mrp_lines', no).filter(l => linenos.indexOf(l.lineno) >= 0 && l.suggest_qty > 0 && !l.release);
    if (!lines.length) throw new Error('请至少勾选一行有建议量且未下达的记录');
    const wh = run.warehouse || DB.list('warehouses')[0].code;
    const made = [];
    const buys = lines.filter(l => l.suggest_type === 'PR');
    if (buys.length) {
      const prNo = DB.nextNo('purchase_req');
      DB.upsert('purchase_req', { no: prNo, date: DB.today(), dept: '采购部', requester: run.planner || DB.currentUser(),
        need_date: buys.reduce((m, l) => (!m || l.need_date < m ? l.need_date : m), ''),
        reason: `MRP 建议 ${no}:${buys.length} 项外购件缺料`, approver: '', status: 'draft',
        amount: r2(buys.reduce((s, l) => s + l.amount, 0)),
        note: `运算口径 ${SCHEMA.MRP_DEMAND[run.source]} · 计划周期 ${run.horizon} 天` });
      DB.setLines('pr_lines', prNo, buys.map((l, i) => ({ lineno: i + 1, product: l.product, product_name: l.product_name,
        qty: l.suggest_qty, price: l.price, amount: r2(l.suggest_qty * l.price), memo: `MRP L${l.level} 净需求 ${l.net_qty}` })));
      buys.forEach(l => l.release = prNo);
      made.push(prNo);
    }
    const make = lines.filter(l => l.suggest_type === 'OS');
    if (make.length) {
      const pr = DB.find('processors', o.processor) || DB.list('processors').find(x => x.qualification === 'qualified' && x.status === 'enabled');
      if (!pr) throw new Error('没有已核准的服务商,无法下达委外加工单');
      make.forEach(l => {
        const osNo = DB.nextNo('os_order');
        const qty = l.suggest_qty;
        DB.upsert('os_order', { no: osNo, date: DB.today(), processor: pr.code, processor_name: pr.name,
          process_type: pr.process_type, warehouse: wh, output_product: l.product, output_name: l.product_name,
          output_qty: qty, received_qty: 0, unit_fee: r2(pr.unit_rate || 0), fee_amount: r2(qty * (pr.unit_rate || 0)),
          issued_amount: 0, consumed_amount: 0, total_cost: 0, need_date: l.need_date, bill: '', status: 'draft',
          user: run.planner || DB.currentUser(), note: `MRP ${no} 建议下达 · ${l.mrp_src === 'out' ? '委外加工' : '自制装配'}` });
        const ol = (l.bom_no ? DB.lines('bom_lines', l.bom_no) : []).map((b, i) => {
          const q = Math.ceil(bomUnitUse(b) * qty);
          const unit = r2((DB.find('products', b.product) || {}).cost || 0);
          return { lineno: i + 1, product: b.product, product_name: b.product_name, qty: q, issued: 0,
            price: unit, amount: r2(q * unit), tax_rate: 13, memo: b.position || '' };
        });
        DB.setLines('os_lines', osNo, ol);
        l.release = osNo;
        made.push(osNo);
      });
    }
    DB.setLines('mrp_lines', no, DB.lines('mrp_lines', no));
    run.status = 'dispatched';
    run.note = (run.note ? run.note + ' / ' : '') + `${DB.today()} 下达 ${made.length} 张草稿单据(${buys.length ? buys.length + ' 项外购合并为 1 张采购申请' : '无外购'}${make.length ? ' / ' + make.length + ' 张委外加工单' : ''})`;
    DB.upsert('mrp_run', run);
    DB.log('计划管理', 'MRP 建议下达', no, made.join('、'));
    return made;
  }
  /** 归档:结办一轮计划运算。仍有未下达建议时须显式强制,避免漏下计划单 */
  function mrpClose(no, force) {
    const run = DB.find('mrp_run', no);
    if (!run) throw new Error('运算单不存在');
    if (run.status === 'closed') throw new Error('该运算单已归档');
    const open = DB.lines('mrp_lines', no).filter(l => (l.suggest_qty || 0) > 0 && !l.release);
    if (open.length && !force) throw new Error(`尚有 ${open.length} 行建议未下达。确认本轮不补可强制归档。`);
    run.status = 'closed';
    run.note = (run.note ? run.note + ' / ' : '') + `${DB.today()} 由 ${DB.currentUser()} 归档${open.length ? `,${open.length} 行建议未下达即关闭` : ',建议已全部下达'}`;
    DB.upsert('mrp_run', run);
    DB.log('计划管理', 'MRP 运算归档', no, `${run.name} · ${open.length ? open.length + ' 行未下达' : '全部下达'}`);
    return run;
  }

  /* ================= 销售链路 ================= */
  /** 毛利红线拦截:低于红线价的行必须先经改价审批,批准后回写单价才放行审核 */
  function priceBlock(so, lines) {
    const ap = so.price_ap ? DB.find('approval', so.price_ap) : null;
    if (ap && ap.status === 'approved') return [];
    const bad = priceGuard(so, lines);
    if (!bad.length) return [];
    const pend = DB.where('approval', a => a.module === 'price_change' && a.biz === so.no && a.status === 'pending')[0];
    if (pend) throw new Error(`本单已挂改价审批 ${pend.no},等待销售主管裁决。`);
    const x = bad[0];
    throw new Error(`${bad.length} 行成交价低于毛利红线(如 ${x.product_name} 净价 ¥${UI.money(x.net)} < 红线 ¥${UI.money(x.floor)}),需在订单详情发起「申请改价」或按价目表改回报价。`);
  }
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
  function confirmSO(no, o) {
    o = o || {};
    const t = DB.find('sales_order', no);
    const lines = DB.lines('so_lines', no);
    if (!lines.length) throw new Error('订单行为空,无法审核');
    let cred = null;
    /* 两道闸门有先后:先把价格谈妥(跌破红线须改价核准),再看信用额度是否允许放单 */
    if (!o.skipPrice) { try { priceBlock(t, lines); } catch (e) { e.gate = 'price'; throw e; } }
    if (!o.skipCredit) { try { cred = checkCredit(t); } catch (e) { e.gate = 'credit'; throw e; } }
    // 可用量检查(仅提示,不阻断——真实系统允许缺货审核)
    const shortage = lines.filter(l => available(l.product, t.warehouse) < l.qty);
    t.status = 'confirmed';
    if (cred && cred.warn) {
      t.note = (t.note ? t.note + ' / ' : '') + `信用使用率 ${(cred.rate * 100).toFixed(0)}%(预警线 ${CREDIT_WATCH * 100}%)`;
    }
    DB.upsert('sales_order', t);
    lines.forEach(l => recomputeReserved(l.product));
    DB.log('销售管理', '审核销售订单', no, cred && cred.warn ? `信用预警:审核后占用 ¥${UI.money(cred.after)} / 额度 ¥${UI.money(cred.limit)}`
      : shortage.length ? `存在 ${shortage.length} 行缺货` : '库存充足');
    return { shortage: shortage.length, credit: cred };
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
    const rel = releaseCredit(inv.customer, `收款单 ${no} 入账 ¥${UI.money(amt)}`);
    if (rel.length) DB.log('销售管理', '信用额度释放', inv.customer_name, `${rel.join('、')} 因收款回到额度内,订单自动审核`);
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
    const sup = DB.find('suppliers', po.supplier) || {};
    /* 免检供应商直接入正式仓;其余先入待检仓隔离,质检判定后才能销售/领用 */
    const qcOn = sup.qc_policy !== 'skip';
    const inWh = qcOn ? SCHEMA.QC_WH : po.warehouse;
    const poLines = DB.lines('po_lines', poNo);
    const gNo = DB.nextNo('gr');
    let costSum = 0;
    rows.forEach((p, i) => {
      const l = poLines.find(x => x.product === p.product);
      const prod = DB.find('products', p.product) || {};
      const unit = p.price || l.price || prod.cost || 0;
      costSum += p.qty * unit;
      move(p.product, inWh, p.qty, unit, 'po_receipt', gNo, qcOn ? '采购到货,入待检仓隔离' : '采购入库(免检)', '');
      const row = DB.find('stock', p.product + '-' + inWh);
      if (row && row.cost && prod.code) { prod.cost = row.cost; DB.upsert('products', prod); }
      l.received = (l.received || 0) + p.qty;
      DB.insert('gr_lines', { doc: gNo, lineno: i + 1, product: p.product, product_name: prod.name, qty: p.qty, price: unit, amount: r2(p.qty * unit), tax_rate: prod.tax_rate || 13 });
    });
    DB.setLines('po_lines', poNo, poLines);
    DB.insert('gr', { no: gNo, date: DB.today(), po: poNo, supplier: po.supplier, supplier_name: po.supplier_name,
      warehouse: inWh, amount: r2(costSum), status: 'posted', bill: '', iqc: '', user: DB.currentUser(),
      note: qcOn ? '货到票未到,按不含税成本暂估入账;批次已入待检仓,待品质经理判定。' : '货到票未到,按不含税成本暂估入账;供应商免检,直接入正式仓。' });
    /* 收货即入账:借 库存商品 / 贷 应付暂估(GR/IR),不与供应商对账,票到再清算 */
    journal(DB.today(), 'gr_accrual', gNo, `采购入库暂估—${po.supplier_name}`, [
      { acc: '1405', debit: r2(costSum), memo: '货到票未到暂估入库' },
      { acc: '2203', credit: r2(costSum), memo: '暂估应付—' + po.supplier_name }]);
    const allDone = poLines.every(l => (l.received || 0) >= l.qty);
    po.status = allDone ? 'done' : (poLines.some(l => l.received > 0) ? 'partial' : 'confirmed');
    DB.upsert('purchase_order', po);
    DB.log('采购管理', '过账采购收货单', gNo, `来源 ${poNo},入库成本 ¥${UI.money(costSum)}`);
    if (qcOn) DB.log('品质管理', '收货自动报检', createIQC(gNo), `${po.supplier_name} 质检策略「${SCHEMA.QC_POLICY[sup.qc_policy] || '抽样检验 AQL'}」,批次入待检仓`);
    return gNo;
  }
  /** 票到清算:冲销 2203 暂估 → 确认进项税与应付,发票价与暂估的差异及资本化运费回写存货成本 */
  function createBillFromGR(grNo, plan) {
    const gr = DB.find('gr', grNo);
    if (!gr) throw new Error('收货单不存在');
    if (gr.status !== 'posted') throw new Error('该收货单已' + (gr.status === 'returned' ? '拒收退货结案' : '票到清算') + ',不能重复开票');
    const dup = DB.where('bill', b => b.gr === grNo)[0];
    if (dup) throw new Error(`收货单 ${grNo} 已生成采购账单 ${dup},不能重复清算`);
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
    const ap = t.approval ? DB.find('approval', t.approval) : null;
    if (ap && ap.status === 'pending') {
      const r = decideApproval(ap.no, ok, memo);
      return { staged: r.status === 'pending', ap: r };
    }
    t.status = ok ? 'approved' : 'rejected';
    t.approver = DB.currentUser();
    t.note = memo || t.note;
    DB.upsert('purchase_req', t);
    DB.log('采购管理', ok ? '审批通过采购申请' : '驳回采购申请', no, memo || '');
    return { staged: false };
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

  /* ================= 来料检验 IQC ================= */
  const IQC_LABEL = { to_check: '待检验', pass: '合格放行', concession: '让步接收', reject: '拒收退货' };
  /** GB/T 2828.1 一般检验水平 II · AQL=1.0 的简化抽样档位:[批量上限, 抽检数, 允收不合格数] */
  function samplePlan(qty) {
    const q = Math.max(0, Math.round(+qty || 0));
    const band = SCHEMA.AQL_PLAN.filter(b => q <= b[0])[0] || SCHEMA.AQL_PLAN[SCHEMA.AQL_PLAN.length - 1];
    return { sample: Math.min(q, band[1]) || 1, acc: band[2] };
  }
  /** 收货自动报检:按收货行生成抽检基数与允收数,批次停留在待检仓 */
  function createIQC(grNo, date) {
    const gr = DB.find('gr', grNo);
    if (!gr) throw new Error('收货单不存在');
    if (gr.iqc && DB.find('iqc', gr.iqc)) return gr.iqc;
    const gl = DB.lines('gr_lines', grNo);
    if (!gl.length) throw new Error('收货单没有明细,无法报检');
    const no = DB.nextNo('iqc');
    /* 例外报检:免检批次实物已在正式仓,先同价隔离进待检仓,数量与存货总额不变 */
    if (gr.warehouse !== SCHEMA.QC_WH) {
      const from = gr.warehouse;
      const short = gl.filter(l => { const s = DB.find('stock', l.product + '-' + from); return !s || s.qty < l.qty; });
      if (short.length) throw new Error(`${short[0].product_name} 在 ${from} 已出库,无法补报检`);
      gl.forEach(l => {
        move(l.product, from, -l.qty, l.price, 'iqc_hold', no, '例外报检,批次隔离', SCHEMA.QC_WH);
        move(l.product, SCHEMA.QC_WH, l.qty, l.price, 'iqc_hold', no, '例外报检,批次隔离', from);
      });
      gr.warehouse = SCHEMA.QC_WH;
    }
    let qtyIn = 0, sample = 0, accSum = 0, amount = 0;
    const rows = gl.map((l, i) => {
      const sp = samplePlan(l.qty);
      qtyIn += l.qty; sample += sp.sample; accSum += sp.acc; amount = r2(amount + (l.amount || 0));
      return { doc: no, lineno: i + 1, product: l.product, product_name: l.product_name, qty: l.qty,
        price: l.price, amount: l.amount, sample: sp.sample, acc: sp.acc, defect: 0, defect_code: '', verdict: '待检验' };
    });
    const po = DB.find('purchase_order', gr.po) || {};
    DB.insert('iqc', { no, date: date || DB.today(), gr: grNo, po: gr.po, supplier: gr.supplier, supplier_name: gr.supplier_name,
      warehouse: SCHEMA.QC_WH, target_wh: po.warehouse || '', qty_in: qtyIn, sample_qty: sample, defect_qty: 0, acc_qty: accSum,
      amount, status: 'to_check', discount: 0, claim: 0, penalty: 0, inspector: '', judged_at: '',
      standard: 'GB/T 2828.1 一般检验水平 II · AQL=1.0', opinion: '',
      note: '收货自动生成报检单,批次在待检仓隔离,判定前不可销售与领用。' });
    DB.setLines('iqc_lines', no, rows);
    gr.iqc = no; DB.upsert('gr', gr);
    return no;
  }
  /** 检验裁决三分支:合格放行转正品 / 让步接收折价冲减暂估 / 拒收退货冲销暂估并释放订单行 */
  function judgeIQC(no, o) {
    assertOpen(DB.today(), '来料检验判定');
    o = o || {};
    const a = DB.find('iqc', no);
    if (!a) throw new Error('检验单不存在');
    if (a.status !== 'to_check') throw new Error('该批次已判定为「' + (IQC_LABEL[a.status] || a.status) + '」,不能重复裁决');
    const gr = DB.find('gr', a.gr) || {};
    const lines = DB.lines('iqc_lines', no);
    const result = o.result;
    if (['pass', 'concession', 'reject'].indexOf(result) < 0) throw new Error('请选择检验结论');
    const target = String(o.target_wh || a.target_wh || '').trim();
    const wh = DB.find('warehouses', target);
    if (result !== 'reject' && (!wh || wh.kind === 'qc' || target === SCHEMA.QC_WH)) throw new Error('放行仓需选择待检仓以外的正式仓');
    const defects = o.defects || {};
    let defectTotal = 0, over = false;
    lines.forEach(l => {
      const d = Math.max(0, Math.round(+(defects[l.product] || 0)));
      if (d > l.qty) throw new Error(`${l.product_name} 不合格数不能大于到货数量`);
      defectTotal += d;
      if (d > (l.acc || 0)) over = true;
    });
    if (result === 'pass' && over) throw new Error('抽检不合格数已超过 AQL 允收数,整批只能让步接收或拒收');
    const discount = result === 'concession' ? r2(+o.discount || 0) : 0;
    if (result === 'concession') {
      if (!(discount > 0 && discount < 30)) throw new Error('让步接收需填写 0–30% 之间的折价率');
      if (gr.status !== 'posted') throw new Error(`收货单 ${gr.no} 已${gr.status === 'returned' ? '拒收结案' : '票到清算'},折价请改走供应商贷项通知单,不在检验单处理`);
    }
    /* 合格与让步:两腿同价互转,数量与存货总额都不变,只是脱离隔离区 */
    if (result !== 'reject') lines.forEach(l => {
      move(l.product, SCHEMA.QC_WH, -l.qty, l.price, 'iqc_pass', no, IQC_LABEL[result], target);
      move(l.product, target, l.qty, l.price, 'iqc_pass', no, IQC_LABEL[result], SCHEMA.QC_WH);
    });
    let concession = 0, claim = 0;
    if (result === 'concession') {
      concession = r2(a.amount * discount / 100);
      /* 折价按行分摊回放行仓成本,末行兜尾差;同时冲减应付暂估,库存子账与 1405 保持同源 */
      let booked = 0;
      lines.forEach((l, i) => {
        const d = i === lines.length - 1 ? r2(concession - booked) : r2((l.amount || 0) * discount / 100);
        booked = r2(booked + d);
        valueAdj(l.product, target, -d, 'bill_diff', no, `让步接收折价 ${discount}%`);
      });
      journal(DB.today(), 'gr_accrual', no, `来料让步折价冲减暂估—${a.supplier_name}`, [
        { acc: '2203', debit: concession }, { acc: '1405', credit: concession }]);
      gr.amount = r2((gr.amount || 0) - concession);
      claim = concession;
    }
    if (result === 'reject') {
      lines.forEach(l => move(l.product, SCHEMA.QC_WH, -l.qty, l.price, 'iqc_reject', no, '质检拒收,实物退回供应商', ''));
      claim = r2(o.claim || a.amount);
      const back = r2(a.amount);
      journal(DB.today(), 'gr_accrual', no, `来料拒收冲销暂估—${a.supplier_name}`, [
        { acc: '2203', debit: back }, { acc: '1405', credit: back }]);
      gr.amount = r2((gr.amount || 0) - back);
      gr.status = 'returned';
      gr.note = (gr.note ? gr.note + ' / ' : '') + `${no} 整批拒收:实物退回供应商,暂估已冲销,无需取票开票。`;
      /* 拒收后订单行未收量释放,允许补货或转其他供应商 */
      const poNo = gr.po || a.po;
      const poLines = DB.lines('po_lines', poNo);
      lines.forEach(l => poLines.forEach(pl => { if (pl.product === l.product) pl.received = Math.max(0, (pl.received || 0) - l.qty); }));
      if (poNo && poLines.length) {
        DB.setLines('po_lines', poNo, poLines);
        const po = DB.find('purchase_order', poNo);
        if (po && po.status === 'done') {
          po.status = poLines.some(l => (l.received || 0) > 0) ? 'partial' : 'confirmed';
          po.note = (po.note ? po.note + ' / ' : '') + `${no} 拒收 ${lines.length} 行,订单行已释放待补货`;
          DB.upsert('purchase_order', po);
        }
      }
    }
    if (gr.no) DB.upsert('gr', gr);
    const penalty = result === 'reject' ? 8 : result === 'concession' ? 3 : defectTotal ? 1 : 0;
    const sup = DB.find('suppliers', a.supplier);
    if (sup && penalty) {
      sup.rating = Math.max(40, (sup.rating || 80) - penalty);
      sup.note = (sup.note ? sup.note + ' / ' : '') + `${no} ${IQC_LABEL[result]},质量扣分 ${penalty},当前绩效评分 ${sup.rating}`;
      if (sup.rating < 60) sup.status = 'disabled';
      DB.upsert('suppliers', sup);
    }
    lines.forEach(l => {
      l.defect = Math.max(0, Math.round(+(defects[l.product] || 0)));
      l.defect_code = l.defect ? ((o.codes || {})[l.product] || o.defect_code || '外观/包装缺陷') : '';
      l.verdict = IQC_LABEL[result] + (l.defect > (l.acc || 0) ? '(超允收)' : '');
    });
    DB.setLines('iqc_lines', no, lines);
    Object.assign(a, {
      status: result, defect_qty: defectTotal, target_wh: result === 'reject' ? '' : target,
      discount, claim, penalty, inspector: o.inspector || DB.currentUser(), judged_at: DB.nowStr(),
      opinion: o.opinion || defaultOpinion(result, defectTotal, discount),
      note: result === 'reject' ? '整批拒收:实物退供应商,暂估已冲销,订单行释放待补货。'
        : result === 'concession' ? `缺陷不影响使用,让步接收并按 ${discount}% 折价冲减暂估。`
          : '抽检合格,批次由待检仓转入正式仓,可销售与领用。'
    });
    DB.upsert('iqc', a);
    DB.log('品质管理', '出具来料检验结论', no, `${IQC_LABEL[result]} · 不合格 ${defectTotal} 件${penalty ? ' · 供应商扣 ' + penalty + ' 分' : ''}`);
    return a;
  }
  function defaultOpinion(result, defect, discount) {
    if (result === 'reject') return `抽检不合格 ${defect} 件,超 AQL 允收数,整批拒收退货并向供应商索赔。`;
    if (result === 'concession') return `抽检不合格 ${defect} 件,缺陷限于外观且不影响使用功能,让步接收并按 ${discount}% 折价。`;
    return `抽检不合格 ${defect} 件,在 AQL 允收数内,判定整批合格。`;
  }
  /** 供应商来料质量画像:合格率、缺陷率与索赔合计(即时计算,不落库) */
  function iqcStats(supCode) {
    const list = DB.where('iqc', a => !supCode || a.supplier === supCode);
    const done = list.filter(a => a.status !== 'to_check');
    const sampled = list.reduce((s, a) => s + (a.sample_qty || 0), 0);
    const defect = list.reduce((s, a) => s + (a.defect_qty || 0), 0);
    return {
      batches: list.length, pending: list.length - done.length,
      ok: done.filter(a => a.status === 'pass').length,
      con: done.filter(a => a.status === 'concession').length,
      rej: done.filter(a => a.status === 'reject').length,
      passRate: done.length ? done.filter(a => a.status === 'pass').length / done.length : 0,
      defectRate: sampled ? defect / sampled : 0,
      claim: r2(list.reduce((s, a) => s + (a.claim || 0), 0)),
      qcQty: DB.where('stock', s => s.warehouse === SCHEMA.QC_WH && s.qty > 0).reduce((s, r) => s + r.qty, 0)
    };
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

  /* ================= 批次追溯 / 库位 / 召回 ================= */
  function recalcProduct(prodCode) {
    DB.where('stock', s => s.product === prodCode).forEach(recalc);
  }
  /** 批次全生命周期:收货 → 库位停留 → 出库流向(含发票与订单) */
  function lotTrace(no) {
    const lot = DB.find('lot', no);
    if (!lot) throw new Error('批次不存在:' + no);
    const txs = DB.lines('lot_tx', no);
    const flow = txs.filter(t => t.qty < 0).map(t => {
      const d = DB.find('delivery', t.ref) || {};
      const inv = DB.where('invoice', i => i.delivery === t.ref)[0] || {};
      const rma = DB.find('rma', t.ref) || {};
      return { date: t.date, type: t.type, qty: -t.qty, doc: t.ref, warehouse: t.warehouse, bin: t.bin,
        entity: rma.no ? 'rma' : d.no ? 'delivery' : 'stock_movements',
        customer: d.customer || inv.customer || rma.customer || '',
        customer_name: d.customer_name || inv.customer_name || rma.customer_name || '',
        so: d.so || rma.so || '', invoice: inv.no || '' };
    });
    return { lot, txs, ins: txs.filter(t => t.qty > 0), outs: txs.filter(t => t.qty < 0), flow };
  }
  /** 召回影响分析:在库可拦截量 + 已发货客户清单 + 同物料未交订单 */
  function lotRecall(no) {
    const tr = lotTrace(no), lot = tr.lot, p = DB.find('products', lot.product) || {};
    const shipped = tr.flow.filter(f => f.type === 'sales_delivery' || f.type === 'os_issue');
    const byCust = {};
    shipped.forEach(f => {
      const r = byCust[f.customer] || (byCust[f.customer] = { code: f.customer, name: f.customer_name || '委外/其他', qty: 0, docs: [], invoices: [] });
      r.qty += f.qty;
      if (f.doc) r.docs.push(f.doc);
      if (f.invoice) r.invoices.push(f.invoice);
    });
    const openSo = DB.where('sales_order', o => ['confirmed', 'partial'].indexOf(o.status) >= 0).map(o => {
      const q = DB.lines('so_lines', o.no).filter(l => l.product === lot.product).reduce((s, l) => s + Math.max(0, (l.qty || 0) - (l.delivered || 0)), 0);
      return q > 0 ? { no: o.no, date: o.date, customer: o.customer, customer_name: o.customer_name, qty: q, status: o.status } : null;
    }).filter(Boolean);
    const inOtherWh = DB.where('lot', l => l.product === lot.product && l.qty > 0 && l.no !== no && (l.status === 'normal' || l.status === 'frozen'));
    return {
      lot, product: p, shippedQty: shipped.reduce((s, f) => s + f.qty, 0),
      inStockQty: lot.qty, inStockValue: r2(lot.qty * lot.unit_cost),
      customers: Object.values(byCust).sort((a, b) => b.qty - a.qty), openSo, siblingLots: inOtherWh,
      source: (() => { const g = DB.find('gr', lot.receipt); return g ? { gr: g.no, po: g.po, supplier: g.supplier, iqc: lot.iqc } : null; })()
    };
  }
  /** 质量冻结:批次余量转为不可售可用量,账面数量与金额不变 */
  function freezeLot(no, reason) {
    const l = LOTX.setStatus(no, 'frozen', reason || '品质待判定');
    recalcProduct(l.product);
    DB.log('库存管理', '批次质量冻结', no, `${l.product_name} · ${l.qty} 件冻结 · ${reason || ''}`);
    return l;
  }
  function releaseLot(no, reason) {
    const l = LOTX.setStatus(no, 'normal', '');
    recalcProduct(l.product);
    DB.log('库存管理', '批次解冻放行', no, `${l.product_name} · ${reason || '复检合格'}`);
    return l;
  }
  /** 效期巡检:到期批次转「已过效期」并从可用量中剔除 */
  function scanLots() {
    const hit = LOTX.ageScan();
    const seen = {};
    hit.forEach(n => { const l = DB.find('lot', n); if (l) seen[l.product] = 1; });
    Object.keys(seen).forEach(recalcProduct);
    return hit;
  }
  function moveLotBin(no, bin) {
    const r = LOTX.relocate(no, bin);
    const l = DB.find('lot', no);
    recalcProduct(l.product);
    DB.log('库存管理', '批次库位移位', no, `${r.from} → ${r.to}`);
    return r;
  }
  /** 批次处置:过期/残次批次按批次身份定点出库;成本按该仓移动加权平均结转,与总账 1405 同源 */
  function scrapLot(lotNo, qty, reason) {
    const l = DB.find('lot', lotNo);
    if (!l) throw new Error('批次不存在:' + lotNo);
    if (!(qty > 0) || qty > l.qty) throw new Error(`处置数量需介于 1 与该批次余量 ${l.qty} 之间`);
    const s = DB.find('stock', l.product + '-' + l.warehouse) || { qty: 0, cost: 0 };
    if (s.qty < qty) throw new Error(`${l.product_name} 在 ${l.warehouse} 账面仅 ${s.qty} 件,不足以处置批次 ${lotNo}`);
    const p = DB.find('products', l.product) || {};
    const unit = s.cost || p.cost || l.unit_cost || 0;
    const ref = 'ADJ' + DB.today().replace(/-/g, '') + '-L' + String(Date.now()).slice(-5);
    move(l.product, l.warehouse, -qty, unit, 'manual', ref, `${reason || '批次处置'}(批次 ${lotNo})`, '', [lotNo]);
    journal(DB.today(), 'stock_adjust', ref, `批次处置—${l.product_name} ${lotNo}`,
      [{ acc: '5401', debit: r2(qty * unit), memo: reason || '批次处置' }, { acc: '1405', credit: r2(qty * unit) }]);
    recomputeReserved(l.product);
    DB.log('库存管理', '批次处置出库', lotNo, `${l.product_name} -${qty} 件 ¥${r2(qty * unit)} · ${reason || ''}`);
    return { ref: ref, amount: r2(qty * unit) };
  }
  /** 让步接收:批次入账成本随折价下调(仅批次口径,总账折价走 valueAdj) */
  function cutLotCost(refNo, product, delta) {
    DB.where('lot', l => l.receipt === refNo && l.product === product && l.qty > 0).forEach(l => {
      l.unit_cost = r2(Math.max(0, l.unit_cost - (l.qty ? delta / l.qty : 0)));
      l.value = r2(l.qty * l.unit_cost);
      l.note = (l.note ? l.note + ' / ' : '') + '让步接收折价,批次成本下调';
      DB.upsert('lot', l);
    });
  }
  /** 出库批次分配预览:FEFO 试算,不落账 */
  function allocPreview(prodCode, whCode, qty) {
    return LOTX.candidates(prodCode, whCode, false).reduce((acc, l) => {
      if (acc.used >= qty) return acc;
      const q = Math.min(l.qty, qty - acc.used);
      acc.rows.push({ lot: l.no, bin: l.bin, qty: q, expire_date: l.expire_date, receipt_date: l.receipt_date });
      acc.used += q;
      return acc;
    }, { rows: [], used: 0, short: 0 }).rows;
  }
  /** 库位实时占用:按库位汇总批次余量与金额 */
  function binMap(whCode) {
    const rows = {};
    DB.list('bins').filter(b => !whCode || b.warehouse === whCode).forEach(b => {
      rows[b.code] = { code: b.code, warehouse: b.warehouse, zone: b.zone, capacity: b.capacity || 0, lots: 0, qty: 0, value: 0, frozen: 0 };
    });
    DB.where('lot', l => l.qty > 0).forEach(l => {
      const r = rows[l.bin];
      if (!r) return;
      r.lots++; r.qty += l.qty; r.value = r2(r.value + l.qty * l.unit_cost);
      if (l.status !== 'normal') r.frozen += l.qty;
    });
    return Object.values(rows).sort((a, b) => a.code < b.code ? -1 : 1);
  }

  /* ================= 主数据 ================= */
  function save(entity, row, isNew) {
    const e = SCHEMA.entities[entity];
    const pk = e.pk;
    if (entity === 'users' || entity === 'role') assertPerm('role', 'edit');
    if (isNew && !row[pk]) row[pk] = autoCode(entity);
    if (isNew && DB.find(entity, row[pk])) throw new Error(`${row[pk]} 已存在,请更换编码`);
    if (entity === 'users') normalizeUser(row, isNew);
    if (e.nextSeqField && !row.status) row.status = 'draft';
    DB.upsert(entity, row);
    DB.log('基础数据', (isNew ? '新增' : '修改') + e.label, row[pk], row.name || '');
    return row;
  }
  /** 登录账号唯一 + 口令策略;编辑时留空口令表示沿用原口令 */
  function normalizeUser(row, isNew) {
    const acc = String(row.account || '').trim();
    if (!acc) throw new Error('请填写登录账号,否则该用户无法进入系统');
    if (!/^[A-Za-z][A-Za-z0-9._-]{2,19}$/.test(acc)) throw new Error(`登录账号「${acc}」不合规:需以字母开头,3-20 位字母、数字或 . _ -`);
    const dup = DB.where('users', u => String(u.account || '').toLowerCase() === acc.toLowerCase() && u.code !== row.code)[0];
    if (dup) throw new Error(`登录账号「${acc}」已被「${dup.name}(${dup.code})」占用`);
    row.account = acc;
    if (!row.role) throw new Error(`请为「${row.name || acc}」指定角色,否则权限矩阵无从判定`);
    if (!DB.where('role', r => r.name === row.role).length) throw new Error(`角色「${row.role}」在权限体系中不存在,请先在角色定义中创建`);
    if (['active', 'inactive'].indexOf(row.status) < 0) row.status = 'active';
    const pwd = String(row.pwd || '').trim();
    if (!pwd) {
      if (isNew) row.pwd = 'Sf@123456';
      else delete row.pwd;
      return;
    }
    if (pwd.length < 8 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) throw new Error('登录口令至少 8 位,且需同时包含字母与数字');
    row.pwd = pwd;
  }
  function autoCode(entity) {
    const map = { products: 'HM-', customers: 'CU-', suppliers: 'SU-', warehouses: 'WH-', processors: 'OS-', role: 'ROLE-', users: 'EMP-' };
    const pre = map[entity];
    if (!pre) return DB.nextNo(entity);
    const pk = SCHEMA.entities[entity].pk;
    let max = 0, pad = 0;
    DB.list(entity).forEach(r => {
      const s = String(r[pk] || '');
      if (s.indexOf(pre) !== 0) return;
      const tail = s.slice(pre.length);
      if (!/^\d+$/.test(tail)) return;
      if (tail.length > pad) pad = tail.length;
      if (+tail > max) max = +tail;
    });
    let n = (max || DB.count(entity)) + 1;
    if (!pad) pad = 3;
    let code;
    do { code = pre + String(n).padStart(pad, '0'); n++; } while (DB.find(entity, code));
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
    if (entity === 'users') {
      const u = DB.find('users', id) || {};
      if (String(id) === String((DB.session() || {}).code)) { UI.toast('不能删除当前登录账号,请先切换到其他用户', 'err'); return false; }
      if (String(u.account || '').toLowerCase() === 'admin') { UI.toast('内置管理员账号 admin 不可删除,请改用停用', 'err'); return false; }
      const PERSON_FIELDS = ['salesperson', 'buyer', 'requester', 'handler', 'manager', 'user'];
      const used = Object.keys(SCHEMA.entities).filter(k => !SCHEMA.entities[k].hidden && k !== 'users')
        .map(t => { const hit = DB.where(t, r => PERSON_FIELDS.some(f => r[f] === u.name)); return hit.length ? [SCHEMA.entities[t].label, hit.length] : null; })
        .filter(Boolean);
      if (used.length) { UI.toast(`无法删除:「${u.name}」在${used.map(x => `${x[0]} ${x[1]} 条`).join('、')}中留痕,请改用停用`, 'err'); return false; }
    }
    if (entity === 'role') {
      const r = DB.find('role', id) || {};
      const used = DB.where('users', u => u.role === r.name).length;
      if (used) { UI.toast(`无法删除:「${r.name}」下仍有 ${used} 名在册用户,请改派或停用`, 'err'); return false; }
      assertPerm('role', 'edit');
    }
    DB.remove(entity, id);
    DB.log('基础数据', '删除' + SCHEMA.entities[entity].label, id, '');
    UI.toast('已删除');
    return true;
  }

  /* ================= 审批中心 ================= */
  const WF = {};   // 审批裁决后回调业务单据:{ onDecide(bizNo, ok, approval) }
  /** 信用特批:通过则自动审核订单,驳回则留在草稿等改单或转预收 */
  WF.credit = {
    onDecide: (biz, ok, ap) => {
      const so = DB.find('sales_order', biz);
      if (!so) return;
      so.note = ((so.note || '').split(' / ').filter(x => !/信用特批|信用超额|审核将超额/.test(x)).join(' / '));
      so.note += (so.note ? ' / ' : '') + (ok ? `信用特批 ${ap.no} 已放行,超额部分单笔授信`
        : `信用特批 ${ap.no} 被驳回(${ap.approver || '财务'}),待回款后重新报价`);
      so.credit_ap = ok ? ap.no : '';
      DB.upsert('sales_order', so);
      if (ok && so.status === 'draft') confirmSO(biz, { skipCredit: true, skipPrice: true });   // 财务级超额授信同时豁免价格红线
      DB.log('销售管理', ok ? '信用特批放行' : '信用特批驳回', biz, `${so.customer_name} · ${ap.opinion || ''}`);
    }
  };
  /** 改价审批:通过回写订单行单价并重算订单额,驳回则保留原价等销售改单 */
  WF.price_change = { onDecide: (biz, ok, ap) => applyPriceChange(biz, ok, ap) };
  /** 价目表核准:通过后立即进入取价引擎引用范围 */
  WF.price_list = { onDecide: (biz, ok, ap) => applyListDecision(biz, ok, ap) };
  /** BOM 核准:通过后父件挂上默认清单并进入 MRP 展开范围 */
  WF.bom = { onDecide: (biz, ok, ap) => applyBomDecision(biz, ok, ap) };

  /* ================= 金额分级会签 ================= */
  /** 按金额档位逐级加签:基线岗位先签,每达到一个档位追加一个签批岗 */
  function buildChain(module, baseRole, amount) {
    if (SCHEMA.SIGN_MODULES.indexOf(module) < 0) return null;
    const why = {};
    const roles = [baseRole || '主管'];
    SCHEMA.SIGN_TIERS.forEach(t => { if (amount >= t.min) { roles.push(t.role); why[t.role] = t.why; } });
    return roles.filter((r, i) => roles.indexOf(r) === i)
      .map((r, i) => Object.assign({ role: r, state: i ? 'waiting' : 'current' }, why[r] ? { tier: why[r] } : {}));
  }
  /** 节点截止时刻:自发起日按紧急度顺延 */
  function nodeDue(date, priority) {
    return DB.addDays(date, SCHEMA.SIGN_DUE[priority] || 3) + ' 18:00:00';
  }
  function apNode(a) { return a && a.chain && a.chain.length ? a.chain[a.step] : null; }
  /** 当前登录人是否为该节点的签批岗;总经办(级别 ≥9)可代签任一级 */
  function canSignRole(roleName) {
    const r = currentRole();
    if (!r || r.name === roleName) return { ok: true, name: DB.currentUser() };
    if ((r.level || 0) >= 9) return { ok: true, name: DB.currentUser(), proxy: true };
    return { ok: false, why: `本节点由「${roleName}」签批,请切换到该岗位账号(当前角色:${r.name})` };
  }
  /** 会签是否已逾期:待办且当前节点过了截止时刻 */
  function apOverdue(a) {
    if (!a || a.status !== 'pending' || !a.due) return 0;
    return Math.max(0, UI.days(String(a.due).slice(0, 10), DB.today()));
  }

  /** 发起审批:所有需要岗位分离的业务动作统一在此登记 */
  function submitApproval(module, bizNo, o) {
    o = o || {};
    const no = DB.nextNo('approval');
    const amount = r2(o.amount || 0);
    const row = {
      no, date: DB.today(), module, biz: bizNo,
      title: o.title || (SCHEMA.entities[module] ? SCHEMA.entities[module].label : '') + ' ' + bizNo,
      applicant: o.applicant || DB.currentUser(), role: o.role || '主管', approver: '',
      amount, priority: o.priority || 'std', status: 'pending',
      opinion: '', time_done: '', payload: o.payload || null, note: o.note || ''
    };
    const chain = o.chain === false ? null : buildChain(module, row.role, amount);
    if (chain) {
      chain[0].due = nodeDue(row.date, row.priority);
      row.chain = chain; row.step = 0; row.due = chain[0].due;
    }
    if (o.resubmit_of) row.resubmit_of = o.resubmit_of;
    DB.insert('approval', row);
    DB.log('审批中心', chain && chain.length > 1 ? `发起会签(共 ${chain.length} 级)` : '发起审批', no,
      `${o.title || module} · ${bizNo}${chain && chain.length > 1 ? ' · ' + chain.map(n => n.role).join(' → ') : ''}`);
    return no;
  }
  function pendingApprovals() { return DB.where('approval', a => a.status === 'pending'); }
  /** 会签单节点裁决:返回 'next' 表示链路继续,'final' 表示终局 */
  function signNode(a, ok, opinion, forced) {
    const node = apNode(a);
    if (!node) return 'final';
    if (!forced) {
      const g = canSignRole(node.role);
      if (!g.ok) throw new Error(g.why);
      node.name = g.name;
      if (g.proxy) node.proxy = 1;
    } else {
      node.name = node.name || DB.currentUser();
      node.auto = 1;
    }
    node.at = DB.nowStr();
    node.opinion = opinion || (ok ? '同意,按申请内容执行。' : '不同意,请补充资料后重新提交。');
    node.state = ok ? 'signed' : 'rejected';
    a.approver = node.name + (a.chain.length > 1 ? `(${node.role})` : '');
    if (!ok) {
      a.chain.forEach((n, i) => { if (i > a.step && n.state === 'waiting') n.state = 'skipped'; });
      return 'final';
    }
    if (a.step >= a.chain.length - 1) return 'final';
    a.step++;
    const nx = a.chain[a.step];
    nx.state = 'current';
    nx.due = nodeDue(DB.today(), a.priority);   // 每级节点从上一级签完之日起重新计时
    a.role = nx.role;
    a.due = nx.due;
    DB.upsert('approval', a);
    DB.log('审批中心', `会签推进 ${a.step}/${a.chain.length}`, a.no,
      `${node.role} 已签 → 转 ${nx.role} 签批 · 截止 ${nx.due.slice(0, 10)}`);
    return 'next';
  }
  /** 审批裁决:登记审批单并回调业务模块 */
  function decideApproval(no, ok, opinion, o) {
    o = o || {};
    const a = DB.find('approval', no);
    if (!a) throw new Error('审批单不存在');
    if (a.status !== 'pending') throw new Error(`审批单 ${no} 已于 ${a.time_done || '此前'} 处理`);
    const chained = !!(a.chain && a.chain.length);
    const phase = chained ? signNode(a, ok, opinion, o.force) : 'final';
    if (phase === 'next') {
      DB.log('审批中心', '会签流转', no, `已签 ${a.step}/${a.chain.length} 级,待 ${a.role} 裁决`);
      return a;
    }
    a.status = ok ? 'approved' : 'rejected';
    a.opinion = opinion || (ok ? '同意,按流程执行' : '不同意,请补充资料');
    if (!chained) a.approver = o.force ? (a.approver || DB.currentUser()) : DB.currentUser();
    a.time_done = DB.nowStr();
    a.due = '';
    DB.upsert('approval', a);
    const cb = WF[a.module];
    if (cb && cb.onDecide) cb.onDecide(a.biz, ok, a);
    DB.log('审批中心', ok ? '审批通过' : chained ? '会签驳回(整链终止)' : '审批驳回', no,
      `${SCHEMA.entities.approval.fields.module.opts[a.module] || a.module} · ${a.biz}`);
    return a;
  }
  /* 审批类型 → 业务实体:审批中心跳转与重提回写共用 */
  const AP_ENTITY = { product_release: 'product_release', supplier_apply: 'supplier_apply', processor_audit: 'processor_audit',
    purchase_req: 'purchase_req', so_change: 'sales_order', price_change: 'sales_order', price_list: 'price_list', rma: 'rma',
    os_order: 'os_order', stock_adjust: 'products', credit: 'sales_order', bom: 'bom' };
  /* 业务单据上的审批引用字段:重提时要把指针换到新单 */
  const AP_REF_FIELD = { credit: 'credit_ap', price_change: 'price_ap', price_list: 'ap', bom: 'ap' };
  /** 驳回重提:原单留档,新单沿用申请内容并重建会签链 */
  function resubmitApproval(no, o) {
    o = o || {};
    const src = DB.find('approval', no);
    if (!src) throw new Error('审批单不存在');
    if (src.status !== 'rejected') throw new Error('仅被驳回的审批单可以修改重提');
    if (src.resubmit && DB.find('approval', src.resubmit)) throw new Error(`已重提过 ${src.resubmit},请勿重复提交`);
    const amount = r2(o.amount == null ? src.amount : o.amount);
    const baseRole = (src.chain && src.chain[0] && src.chain[0].role) || src.role;
    const newNo = submitApproval(src.module, src.biz, {
      title: o.title || src.title, applicant: o.applicant || src.applicant, role: baseRole,
      amount, priority: o.priority || src.priority, note: o.note || src.note, payload: o.payload || src.payload,
      resubmit_of: src.no
    });
    const nw = DB.find('approval', newNo);
    nw.round = (+src.round || 1) + 1;
    nw.summary = o.summary || src.summary;
    DB.upsert('approval', nw);
    src.resubmit = newNo;
    src.note = (src.note ? src.note + ' / ' : '') + `已修改重提为 ${newNo}`;
    DB.upsert('approval', src);
    const ent = AP_ENTITY[src.module];
    if (ent) {
      const biz = DB.find(ent, src.biz);
      if (biz) {
        const f = AP_REF_FIELD[src.module] || 'approval';
        if (biz[f] === src.no) biz[f] = newNo;
        biz.note = (biz.note ? biz.note + ' / ' : '') + `驳回重提 ${newNo}(承接 ${src.no})`;
        DB.upsert(ent, biz);
      }
    }
    DB.log('审批中心', '驳回重提', newNo, `承接 ${src.no} · ${src.title}${amount !== src.amount ? ` · 金额调整为 ¥${UI.money(amount)}` : ''}`);
    return newNo;
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
  /* 单据实体 → 权限模块:出库随销售、收货随采购、调拨盘点归库存 */
  const ENTITY_PERM_MOD = { delivery: 'sales_order', gr: 'purchase_order', transfer: 'stock', stocktake: 'stock', bins: 'lot' };
  /** 权限判定用的模块名;审批单按审批类型映射(信用特批归发票应收) */
  function modOf(entity, apModule) {
    if (entity === 'approval') return SCHEMA.APPROVAL_PERM[apModule] || apModule || 'approval';
    return ENTITY_PERM_MOD[entity] || entity;
  }
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
  function applyGrant(roleCode, module, action, on) {
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
  function grant(roleCode, module, action, on) {
    assertPerm('role', 'edit');
    applyGrant(roleCode, module, action, on);
  }
  function grantAll(roleCode, module, on) {
    assertPerm('role', 'edit');
    PERM_ACTIONS.forEach(a => applyGrant(roleCode, module, a, on));
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
    createIQC, judgeIQC, samplePlan, iqcStats,
    IQC: { create: createIQC, judge: judgeIQC, stats: iqcStats, plan: samplePlan,
      label: s => IQC_LABEL[s] || s, WH: SCHEMA.QC_WH, pending: () => DB.where('iqc', a => a.status === 'to_check') },
    createTransfer, postStocktake, adjustStock, save, removeRow, autoCode,
    LOT: { trace: lotTrace, recall: lotRecall, freeze: freezeLot, release: releaseLot, scan: scanLots,
      moveToBin: moveLotBin, preview: allocPreview, bins: binMap, cutCost: cutLotCost, scrap: scrapLot, eng: LOTX,
      hold: (p, w) => LOTX.holdQty(p, w), lotsOf: (p, w) => LOTX.candidates(p, w, false) },
    PRICE: { pick: pricePick, guard: priceGuard, floor: priceFloor, cost: priceCost, lists: activeLists,
      quote: listQuote, submit: submitPriceChange, block: priceBlock, soldQty,
      listImpact, submitList: submitListApproval, retire: retireList, FLOOR: PRICE_FLOOR, KIND_TXT: KIND_TXT, WEIGHT: KIND_WEIGHT },
    BOM: { unitUse: bomUnitUse, of: bomFor, matCost: bomMatCost, explode: bomExplode, whereUsed: bomWhereUsed,
      depth: bomDepth, depthOf: bomDepthOf, rollCost: bomMatCostOf,
      impact: bomImpact, submit: bomSubmit, obsolete: bomObsolete, SRC: SCHEMA.MRP_SRC, SUGGEST: SCHEMA.MRP_SUGGEST },
    MRP: { supply: mrpSupply, price: mrpPrice, demand: mrpDemand, run: mrpRun, release: mrpRelease, close: mrpClose, lot: mrpLot,
      DEMAND: SCHEMA.MRP_DEMAND, SUGGEST: SCHEMA.MRP_SUGGEST },
    submitApproval, decideApproval, pendingApprovals, decideViaApproval, WF,
    SIGN: { buildChain, node: apNode, canSign: canSignRole, overdue: apOverdue, entityOf: m => AP_ENTITY[m] || '',
      resubmit: resubmitApproval, dueDays: SCHEMA.SIGN_DUE, tiers: SCHEMA.SIGN_TIERS, modules: SCHEMA.SIGN_MODULES },
    sendRFQ, saveRFQQuotes, bestQuotes, awardRFQ, closeRFQ,
    submitRelease, decideRelease, publishRelease, offShelfRelease,
    submitApply, inspectApply, decideApply, archiveApply,
    submitAudit, inspectAudit, decideAudit, auditScore, applyAuditResult,
    confirmOS, cancelOS, issueOS, receiveOS,
    submitRMA, decideRMA, receiveRMA, creditRMA, refundRMA, repairRMA, closeRMA,
    requestSOChange, applySOChange, closeSO,
    periodRow, assertOpen, periodActivity, periodPnL, buildCloseLines, closePeriod, reopenPeriod,
    creditState, checkCredit, submitCreditRelease, releaseCredit, CREDIT_WATCH, CREDIT_BLOCK,
    PERM: { can, modOf, grant, grantAll, assertPerm, roleOfUser, currentRole, ACTIONS: PERM_ACTIONS } };
})();
