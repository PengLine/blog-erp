/* ============================================================
 * views-reports.js — 管理报表:AR/AP 账龄、销售/采购分析、库存周转、利润表、自定义报表
 * ============================================================ */
window.REPORTS = (function () {
  const money = UI.money, num = UI.num, esc = UI.esc, icon = UI.icon, r2 = UI.round2, dateCN = UI.dateCN;

  const TITLES = {
    ar: '应收账龄分析 (AR Aging)', ap: '应付账龄分析 (AP Aging)', sales: '销售分析',
    purchase: '采购分析', inventory: '库存结构与周转', pl: '利润表 (期间损益)', dashboard2: '自定义报表'
  };
  const DESC = {
    ar: '按发票到期日分档,口径与销售发票未结余额一致,可直接下钻至单据。',
    ap: '按账单到期日分档,反映未来现金流出的时间分布。',
    sales: '按期间/客户/商品多维度汇总开票收入、成本与毛利。',
    purchase: '按供应商与期间汇总采购下单、收货与付款,含交付准时率。',
    inventory: '库存资金占用、库龄结构与周转率(出库成本 / 平均库存)。',
    pl: '取自制凭证账簿,收入=4001/4002 贷方发生额,成本与费用取借方发生额。',
    dashboard2: '选择实体与字段,按条件筛选并导出 CSV —— 简易报表引擎。'
  };

  function head(key, extraActions) {
    return `<div class="page-head"><div><h2>${esc(TITLES[key] || key)}</h2><div class="desc">${esc(DESC[key] || '')}</div></div>
      <div class="page-actions"><button class="btn" data-route="dashboard">${icon('chart')}返回看板</button>${extraActions || ''}</div></div>`;
  }

  /* ---------------- 账龄 ---------------- */
  function aging(kind) {
    const docs = kind === 'ar' ? DB.list('invoice').filter(i => i.balance > 0.01) : DB.list('bill').filter(b => b.balance > 0.01);
    const partner = kind === 'ar' ? 'customer' : 'supplier';
    const buckets = ['未到期', '逾期 1-30 天', '逾期 31-60 天', '逾期 61-90 天', '逾期 90 天以上'];
    const today = DB.today();
    const idxOf = due => { const d = UI.days(due, today); return d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4; };
    const byPartner = {};
    const totals = buckets.map(() => 0);
    docs.forEach(d => {
      const p = d[partner], i = idxOf(d.due_date);
      const row = byPartner[p] || (byPartner[p] = { code: p, name: d[partner + '_name'], cells: buckets.map(() => 0), total: 0, max: 0, docs: [] });
      row.cells[i] = r2(row.cells[i] + d.balance); row.total = r2(row.total + d.balance);
      row.docs.push(d); row.max = Math.max(row.max, i);
      totals[i] = r2(totals[i] + d.balance);
    });
    const rows = Object.values(byPartner).sort((a, b) => b.total - a.total);
    const grand = r2(totals.reduce((a, b) => a + b, 0));
    const overdue = r2(totals.slice(1).reduce((a, b) => a + b, 0));
    const dso = kind === 'ar' ? daysSalesOutstanding(docs) : daysPayable(docs);

    const cols = [
      { k: 'name', label: kind === 'ar' ? '客户' : '供应商', render: r => `<span class="cell-link cell-main" data-open="${partner}s=${encodeURIComponent(r.code)}">${esc(r.name)}</span><div class="cell-sub mono">${esc(r.code)}</div>` },
    ].concat(buckets.map((b, i) => ({ k: 'b' + i, label: b, align: 'right', render: r => r.cells[i] ? `<span class="money" style="${i && r.cells[i] ? 'color:var(--danger)' : ''}">${money(r.cells[i])}</span>` : '<span class="muted">—</span>' }))
    ).concat([
      { k: 'total', label: '合计', align: 'right', render: r => `<span class="money strong">¥${money(r.total)}</span>` },
      { k: 'worst', label: '风险档', render: r => `<span class="badge ${r.max === 0 ? 'b-success' : r.max <= 1 ? 'b-warning' : r.max <= 2 ? 'b-danger' : 'b-danger'}">${buckets[r.max]}</span>` },
      { k: 'cnt', label: '单据数', align: 'right', render: r => num(r.docs.length) },
    ]);

    return head(kind === 'ar' ? 'ar' : 'ap', `<button class="btn primary" data-route="${kind === 'ar' ? 'invoice' : 'bill'}">${icon('eye')}查看${kind === 'ar' ? '发票' : '账单'}明细</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: (kind === 'ar' ? '应收' : '应付') + '总额', value: '¥' + UI.compact(grand), icon: 'receipt', color: '#4F46E5', foot: `${docs.length} 张未清单据` })}
        ${UI.kpi({ label: '逾期金额', value: '¥' + UI.compact(overdue), icon: 'warn', color: '#DC2626', foot: `占比 ${grand ? (overdue / grand * 100).toFixed(1) : 0}%` })}
        ${UI.kpi({ label: kind === 'ar' ? 'DSO 应收周转天数' : 'DPO 应付周转天数', value: dso.toFixed(1) + '<small> 天</small>', icon: 'clock', color: '#0E7490', foot: kind === 'ar' ? '平均收款周期' : '平均付款周期' })}
        ${UI.kpi({ label: '涉及' + (kind === 'ar' ? '客户' : '供应商'), value: num(rows.length) + '<small> 家</small>', icon: 'users', color: '#7C3AED', foot: `${DB.count(kind === 'ar' ? 'customers' : 'suppliers')} 家往来单位` })}
      </div>
      <div class="grid g2 mt16">
        <div class="card"><div class="card-head"><h3>${icon('chart')}账龄分布</h3></div><div class="card-body">
          ${UI.hbars(buckets.map((b, i) => ({ name: b, value: totals[i], color: ['#10B981', '#F59E0B', '#EF4444', '#DC2626', '#991B1B'][i] })), { fmt: v => '¥' + money(v) })}</div></div>
        <div class="card"><div class="card-head"><h3>${icon('info')}账龄口径说明</h3></div><div class="card-body">
          <ul style="margin:0;padding-left:18px;line-height:2;color:var(--text-2);font-size:13px">
            <li>分档基准:单据 <b>到期日(due_date)</b> 与当前系统日期 ${dateCN(today)} 的差值。</li>
            <li>余额口径:<b>未结金额 = 价税合计 − 已收/已付金额</b>,已含部分结算单据的剩余部分。</li>
            <li>结算方式影响账期:货到付款 7 天、月结 30/45/60 天由往来单位主数据决定。</li>
            <li>点击${kind === 'ar' ? '客户' : '供应商'}名称可查看其往来画像与全部${kind === 'ar' ? '发票' : '账单'}。</li>
          </ul></div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}按${kind === 'ar' ? '客户' : '供应商'}汇总</h3><div class="right"><span class="muted small">合计 ¥${money(grand)}</span></div></div>
        ${UI.table(cols, rows, { pk: 'code', empty: '当前没有未结单据' })}
        <div class="table-foot"><span>总计</span>${totals.map((t, i) => `<span class="money">¥${money(t)}</span>`).join('<span style="opacity:.35">|</span>')}<span class="strong money">¥${money(grand)}</span></div></div>
      <div class="card mt16"><div class="card-head"><h3>${icon('file')}未清单据明细</h3><div class="right"><span class="muted small">按逾期天数倒序</span></div></div>
        ${UI.table([
          { k: 'no', label: '单据号', render: d => `<span class="mono cell-link" data-open="${kind === 'ar' ? 'invoice' : 'bill'}=${encodeURIComponent(d.no)}">${esc(d.no)}</span>` },
          { k: 'p', label: kind === 'ar' ? '客户' : '供应商', render: d => esc(d[partner + '_name']) },
          { k: 'date', label: '制单日期', render: d => dateCN(d.date) },
          { k: 'due', label: '到期日', render: d => dateCN(d.due_date) },
          { k: 'od', label: '逾期天数', align: 'right', render: d => { const x = Math.max(0, UI.days(d.due_date, today)); return x ? `<span style="color:var(--danger);font-weight:600">${x} 天</span>` : '<span class="muted">未到期</span>'; } },
          { k: 'total', label: '价税合计', align: 'right', render: d => '¥' + money(d.total) },
          { k: 'balance', label: '未结余额', align: 'right', render: d => `<span class="money strong">¥${money(d.balance)}</span>` },
          { k: 'status', label: '状态', render: d => UI.badge(d.status) },
        ], docs.slice().sort((a, b) => (UI.days(b.due_date, today)) - (UI.days(a.due_date, today))).slice(0, 40), { pk: 'no' })}</div>`;
  }
  function daysSalesOutstanding(unpaid) {
    const rev = DB.list('invoice').reduce((s, i) => s + i.total, 0) || 1;
    const ar = unpaid.reduce((s, i) => s + i.balance, 0);
    return ar / rev * 180;
  }
  function daysPayable(unpaid) {
    const pur = DB.list('bill').reduce((s, b) => s + b.total, 0) || 1;
    return unpaid.reduce((s, b) => s + b.balance, 0) / pur * 180;
  }

  /* ---------------- 销售分析 ---------------- */
  function sales() {
    const keys = DASH.monthKeys(6);
    const s = DASH.revenueByMonth(keys);
    const byProd = {}, byCust = {}, byRegion = {};
    DB.list('iv_lines').forEach(l => {
      const inv = DB.find('invoice', l.doc); if (!inv) return;
      const p = DB.find('products', l.product) || {};
      byProd[l.product] = byProd[l.product] || { code: l.product, name: l.product_name, qty: 0, amount: 0, cost: 0, docs: 0 };
      byProd[l.product].qty += l.qty; byProd[l.product].amount = r2(byProd[l.product].amount + l.amount); byProd[l.product].cost += (p.cost || 0) * l.qty; byProd[l.product].docs++;
      byCust[inv.customer] = (byCust[inv.customer] || 0) + l.amount;
      const c = DB.find('customers', inv.customer) || {};
      byRegion[c.region || '其他'] = r2((byRegion[c.region || '其他'] || 0) + l.amount);
    });
    const prods = Object.values(byProd).sort((a, b) => b.amount - a.amount);
    const totalAmt = r2(prods.reduce((x, p) => x + p.amount, 0));
    const totalCost = r2(prods.reduce((x, p) => x + p.cost, 0));
    const custTop = Object.keys(byCust).sort((a, b) => byCust[b] - byCust[a]).slice(0, 8)
      .map(c => ({ name: (DB.find('customers', c) || {}).name || c, value: r2(byCust[c]), key: c }));
    const soStat = ['draft', 'confirmed', 'partial', 'done', 'cancelled'].map(st => ({ st, n: DB.where('sales_order', o => o.status === st).length, v: r2(DB.where('sales_order', o => o.status === st).reduce((a, o) => a + o.total, 0)) }));

    return head('sales', `<button class="btn primary" data-new-doc="sales_order">${icon('plus')}新建销售订单</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '累计开票收入(不含税)', value: '¥' + UI.compact(totalAmt), icon: 'trendUp', color: '#4F46E5', foot: `${DB.count('invoice')} 张发票` })}
        ${UI.kpi({ label: '累计销售成本', value: '¥' + UI.compact(totalCost), icon: 'box', color: '#F59E0B', foot: `毛利 ¥${UI.compact(r2(totalAmt - totalCost))}` })}
        ${UI.kpi({ label: '综合毛利率', value: (totalAmt ? (totalAmt - totalCost) / totalAmt * 100 : 0).toFixed(1) + '%', icon: 'pie', color: '#047857', foot: '标准成本口径' })}
        ${UI.kpi({ label: '客单平均金额', value: '¥' + money(DB.count('invoice') ? totalAmt / DB.count('invoice') : 0), icon: 'users', color: '#0E7490', foot: `${DB.count('customers')} 家客户` })}
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('chart')}月度收入 / 成本 / 回款趋势</h3></div><div class="card-body">
        ${UI.lineChart([{ name: '收入', color: '#4F46E5', data: s.rev, area: true }, { name: '成本', color: '#F59E0B', data: s.cogs }, { name: '回款', color: '#10B981', data: s.cash }], keys.map(k => k.slice(2)))}</div></div>
      <div class="grid g2 mt16">
        <div class="card"><div class="card-head"><h3>${icon('users')}客户集中度 Top 8</h3><div class="right"><span class="muted small">CR8 ${totalAmt ? (custTop.reduce((a, c) => a + c.value, 0) / totalAmt * 100).toFixed(0) : 0}%</span></div></div>
          <div class="card-body">${UI.hbars(custTop, { links: 'customers' })}</div></div>
        <div class="card"><div class="card-head"><h3>${icon('pie')}区域销售分布</h3></div><div class="card-body">
          ${UI.donut(Object.keys(byRegion).sort((a, b) => byRegion[b] - byRegion[a]).map((k, i) => ({ name: k, value: byRegion[k], color: UI.PAL[i] })), { centerLabel: '销售额' })}</div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('box')}商品销售排行</h3><div class="right"><span class="muted small">共 ${prods.length} 个动销 SKU</span></div></div>
        ${UI.table([
          { k: 'code', label: '物料编码', render: r => `<span class="mono cell-link" data-open="products=${encodeURIComponent(r.code)}">${esc(r.code)}</span>` },
          { k: 'name', label: '商品名称', render: r => esc(r.name) },
          { k: 'cat', label: '类目', render: r => `<span class="tag">${esc((DB.find('products', r.code) || {}).category || '')}</span>` },
          { k: 'qty', label: '销量', align: 'right', render: r => num(r.qty) },
          { k: 'amount', label: '收入', align: 'right', render: r => '¥' + money(r.amount) },
          { k: 'gp', label: '毛利', align: 'right', render: r => `<span class="money">${money(r2(r.amount - r.cost))}</span>` },
          { k: 'gpr', label: '毛利率', align: 'right', render: r => { const g = r.amount ? (r.amount - r.cost) / r.amount * 100 : 0; return `<span class="badge ${g > 45 ? 'b-success' : g > 25 ? 'b-warning' : 'b-danger'}">${g.toFixed(1)}%</span>`; } },
          { k: 'share', label: '占比', render: r => `<div class="flex" style="gap:8px"><div class="progress" style="width:80px"><i style="width:${(r.amount / totalAmt * 100).toFixed(1)}%"></i></div><span class="small muted">${(r.amount / totalAmt * 100).toFixed(1)}%</span></div>` },
        ], prods.slice(0, 20), { pk: 'code' })}</div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}订单状态漏斗</h3></div>
        <div class="card-body"><div class="grid g5">${soStat.map(x => `<div style="padding:14px;border:1px solid var(--border);border-radius:10px">
          <div>${UI.badge(x.st)}</div><div style="font-size:20px;font-weight:650;margin-top:8px">${num(x.n)}</div><div class="muted small">¥${money(x.v)}</div></div>`).join('')}</div></div></div>`;
  }

  /* ---------------- 采购分析 ---------------- */
  function purchase() {
    const pos = DB.list('purchase_order');
    const bySup = {};
    pos.forEach(p => {
      const g = DB.where('gr', x => x.po === p.no);
      const rec = r2(g.reduce((s, x) => s + x.amount, 0));
      const onTime = g.length && g.every(x => x.date <= p.expected_date);
      const r = bySup[p.supplier] || (bySup[p.supplier] = { code: p.supplier, name: p.supplier_name, orders: 0, amount: 0, received: 0, late: 0, delivered: 0 });
      r.orders++; r.amount = r2(r.amount + p.total); r.received = r2(r.received + rec);
      if (g.length) { r.delivered++; if (!onTime) r.late++; }
    });
    const rows = Object.values(bySup).sort((a, b) => b.amount - a.amount);
    const totalAmount = r2(rows.reduce((s, r) => s + r.amount, 0));
    const totalRecv = r2(rows.reduce((s, r) => s + r.received, 0));
    const catAgg = {};
    DB.list('gr_lines').forEach(l => { const p = DB.find('products', l.product) || {}; catAgg[p.category || '其他'] = r2((catAgg[p.category || '其他'] || 0) + l.amount); });

    return head('purchase', `<button class="btn primary" data-new-doc="purchase_order">${icon('plus')}新建采购订单</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '累计采购金额', value: '¥' + UI.compact(totalAmount), icon: 'trendDown', color: '#4F46E5', foot: `${pos.length} 张采购订单` })}
        ${UI.kpi({ label: '已入库成本', value: '¥' + UI.compact(totalRecv), icon: 'download', color: '#047857', foot: `入库率 ${totalAmount ? (totalRecv / totalAmount * 100).toFixed(1) : 0}%` })}
        ${UI.kpi({ label: '交付准时率', value: (rows.reduce((s, r) => s + r.delivered, 0) ? (1 - rows.reduce((s, r) => s + r.late, 0) / rows.reduce((s, r) => s + r.delivered, 0)) * 100 : 100).toFixed(1) + '%', icon: 'clock', color: '#B45309', foot: `${rows.reduce((s, r) => s + r.late, 0)} 次延迟交付` })}
        ${UI.kpi({ label: '待审批申请', value: num(DB.where('purchase_req', p => p.status === 'pending').length), icon: 'clipboard', color: '#7C3AED', foot: `采购员 ${[...new Set(pos.map(p => p.buyer))].length} 人` })}
      </div>
      <div class="grid g-2-1 mt16">
        <div class="card"><div class="card-head"><h3>${icon('truck')}供应商采购汇总(按金额)</h3><div class="right"><span class="muted small">含交付及时率</span></div></div>
          ${UI.table([
            { k: 'code', label: '供应商', render: r => `<span class="cell-link cell-main" data-open="suppliers=${encodeURIComponent(r.code)}">${esc(r.name)}</span><div class="cell-sub mono">${esc(r.code)}</div>` },
            { k: 'orders', label: '订单数', align: 'right', render: r => num(r.orders) },
            { k: 'amount', label: '采购额', align: 'right', render: r => '¥' + money(r.amount) },
            { k: 'recv', label: '已入库', align: 'right', render: r => '¥' + money(r.received) },
            { k: 'otd', label: '准时交付', render: r => { const v = r.delivered ? (1 - r.late / r.delivered) * 100 : 100; return `<div class="flex" style="gap:8px"><div class="progress" style="width:66px"><i class="${v > 90 ? 'ok' : v > 70 ? 'warn' : 'bad'}" style="width:${v}%"></i></div><span class="small">${v.toFixed(0)}%</span></div>`; } },
            { k: 'rating', label: '绩效', align: 'right', render: r => { const s = DB.find('suppliers', r.code) || {}; return `<span class="badge ${s.rating > 80 ? 'b-success' : s.rating > 60 ? 'b-warning' : 'b-danger'}">${s.rating || '—'}</span>`; } },
            { k: 'share', label: '份额', render: r => `<span class="small money">${(r.amount / totalAmount * 100).toFixed(1)}%</span>` },
          ], rows, { pk: 'code' })}</div>
        <div class="card"><div class="card-head"><h3>${icon('pie')}采购类目结构</h3></div><div class="card-body">
          ${UI.donut(Object.keys(catAgg).sort((a, b) => catAgg[b] - catAgg[a]).map((k, i) => ({ name: k, value: catAgg[k], color: UI.PAL[i] })), { centerLabel: '入库额' })}</div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('clipboard')}采购申请执行情况</h3></div>
        ${UI.table([
          { k: 'no', label: '申请单号', render: r => `<span class="mono cell-link" data-open="purchase_req=${encodeURIComponent(r.no)}">${esc(r.no)}</span>` },
          { k: 'd', label: '申请部门', render: r => esc(r.dept) },
          { k: 'reason', label: '事由', render: r => `<span>${esc(r.reason)}</span><div class="cell-sub">${dateCN(r.date)} · 期望 ${dateCN(r.need_date)}</div>` },
          { k: 'amount', label: '预估金额', align: 'right', render: r => '¥' + money(r.amount) },
          { k: 'approver', label: '审批人', render: r => esc(r.approver || '—') },
          { k: 'status', label: '状态', render: r => UI.badge(r.status) },
        ], DB.list('purchase_req').slice().reverse(), { pk: 'no' })}</div>`;
  }

  /* ---------------- 库存 ---------------- */
  function inventory() {
    const stocks = DB.list('stock');
    const byWh = {}, byCat = {}, byAge = { '0-30 天': 0, '31-90 天': 0, '91-180 天': 0, '180 天以上': 0 };
    const lastMove = {}, lastOut = {};
    DB.list('stock_movements').forEach(m => { const k = m.product + '|' + m.warehouse; if (!lastMove[k] || m.date > lastMove[k]) lastMove[k] = m.date; if (m.qty < 0 && (!lastOut[k] || m.date > lastOut[k])) lastOut[k] = m.date; });
    stocks.forEach(s => {
      const p = DB.find('products', s.product) || {};
      byWh[s.warehouse] = r2((byWh[s.warehouse] || 0) + s.value);
      byCat[p.category || '其他'] = r2((byCat[p.category || '其他'] || 0) + s.value);
      const last = lastMove[s.product + '|' + s.warehouse];
      const age = last ? UI.days(last, DB.today()) : 200;
      const bucket = age <= 30 ? '0-30 天' : age <= 90 ? '31-90 天' : age <= 180 ? '91-180 天' : '180 天以上';
      byAge[bucket] = r2(byAge[bucket] + s.value);
    });
    const totalValue = r2(stocks.reduce((s, x) => s + x.value, 0));
    const cogs6 = r2(DB.where('journal', j => j.type === 'sales_delivery').reduce((s, j) => s + j.debit, 0));
    const turnover = totalValue ? cogs6 / totalValue : 0;
    const slowAll = stocks.filter(s => s.value > 0 && (!lastOut[s.product + '|' + s.warehouse] || UI.days(lastOut[s.product + '|' + s.warehouse], DB.today()) > 120)).sort((a, b) => b.value - a.value);
    const slow = slowAll.slice(0, 12);
    const abc = (() => {
      const rows = {};
      stocks.forEach(s => { const p = DB.find('products', s.product) || {}; rows[s.product] = rows[s.product] || { code: s.product, name: p.name, qty: 0, value: 0 }; rows[s.product].qty += s.qty; rows[s.product].value = r2(rows[s.product].value + s.value); });
      const list = Object.values(rows).sort((a, b) => b.value - a.value);
      let acc = 0; const out = list.map(r => { acc += r.value; r.cum = acc; r.cls = acc / (totalValue || 1) <= .8 ? 'A' : acc / (totalValue || 1) <= .95 ? 'B' : 'C'; return r; });
      return out;
    })();

    return head('inventory', `<button class="btn" data-new-doc="stocktake">${icon('grid')}发起盘点</button><button class="btn primary" data-new-doc="transfer">${icon('swap')}库存调拨</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '库存总金额', value: '¥' + UI.compact(totalValue), icon: 'layers', color: '#4F46E5', foot: `${stocks.length} 条库存记录` })}
        ${UI.kpi({ label: '库存周转率(半年)', value: turnover.toFixed(2) + '<small> 次</small>', icon: 'refresh', color: '#047857', foot: `累计出库成本 ¥${UI.compact(cogs6)}` })}
        ${UI.kpi({ label: '呆滞库存(>120天无出库)', value: '¥' + UI.compact(r2(slowAll.reduce((s, x) => s + x.value, 0))), icon: 'warn', color: '#B45309', foot: `${slowAll.length} 条库存记录 · 明细展示前 12` })}
        ${UI.kpi({ label: '预警 SKU', value: num(stocks.filter(s => s.status !== 'normal').length), icon: 'box', color: '#DC2626', foot: `缺货 ${stocks.filter(s => s.status === 'shortage').length} · 偏低 ${stocks.filter(s => s.status === 'low').length}` })}
      </div>
      <div class="grid g3 mt16">
        <div class="card"><div class="card-head"><h3>${icon('home')}分仓库存金额</h3></div><div class="card-body">${UI.hbars(Object.keys(byWh).map((k, i) => ({ name: (DB.find('warehouses', k) || {}).name || k, value: byWh[k], key: k, color: UI.PAL[i] })), { links: 'warehouses' })}</div></div>
        <div class="card"><div class="card-head"><h3>${icon('pie')}分类目库存</h3></div><div class="card-body">${UI.donut(Object.keys(byCat).map((k, i) => ({ name: k, value: byCat[k], color: UI.PAL[i] })), { centerLabel: '库存额' })}</div></div>
        <div class="card"><div class="card-head"><h3>${icon('clock')}库龄结构</h3></div><div class="card-body">${UI.hbars(Object.keys(byAge).map((k, i) => ({ name: k, value: byAge[k], color: ['#10B981', '#0EA5E9', '#F59E0B', '#EF4444'][i] })), { fmt: v => '¥' + money(v) })}
          <div class="muted small mt8">库龄以最近一次出入库日期为基准;呆滞口径为超过 120 天无出库。</div></div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('chart')}ABC 分类分析</h3><div class="right"><span class="muted small">按库存金额累计占比 80% / 95% 分档</span></div></div>
        <div class="card-body"><div class="grid g3">
          ${['A', 'B', 'C'].map(c => { const n = abc.filter(x => x.cls === c); const v = r2(n.reduce((s, x) => s + x.value, 0));
            return `<div style="padding:14px;border:1px solid var(--border);border-radius:10px"><div class="flex"><span class="badge ${c === 'A' ? 'b-danger' : c === 'B' ? 'b-warning' : 'b-neutral'}">${c} 类</span><span class="muted small">${n.length} 个 SKU</span></div>
            <div style="font-size:19px;font-weight:650;margin-top:8px">¥${UI.compact(v)}</div>
            <div class="small muted">占比 ${(v / totalValue * 100).toFixed(1)}% · ${c === 'A' ? '重点管控,按周补货' : c === 'B' ? '常规管控,按月复盘' : '考虑清仓或降库存'}</div></div>`; }).join('')}
        </div></div>
        ${UI.table([
          { k: 'code', label: '物料', render: r => `<span class="mono cell-link" data-open="products=${encodeURIComponent(r.code)}">${esc(r.code)}</span>` },
          { k: 'name', label: '商品名称', render: r => esc(r.name) },
          { k: 'qty', label: '库存量', align: 'right', render: r => num(r.qty) },
          { k: 'value', label: '库存金额', align: 'right', render: r => '¥' + money(r.value) },
          { k: 'cum', label: '累计占比', render: r => `<div class="flex" style="gap:8px"><div class="progress" style="width:90px"><i style="width:${(r.cum / totalValue * 100).toFixed(1)}%"></i></div><span class="small muted">${(r.cum / totalValue * 100).toFixed(1)}%</span></div>` },
          { k: 'cls', label: 'ABC', render: r => `<span class="badge ${r.cls === 'A' ? 'b-danger' : r.cls === 'B' ? 'b-warning' : 'b-neutral'}">${r.cls}</span>` },
        ], abc.slice(0, 18), { pk: 'code' })}</div>
      <div class="card mt16"><div class="card-head"><h3>${icon('warn')}呆滞库存明细</h3><div class="right"><span class="muted small">超过 120 天无出库</span></div></div>
        ${UI.table([
          { k: 'product', label: '物料', render: r => `<span class="mono">${esc(r.product)}</span>` },
          { k: 'name', label: '商品', render: r => `${esc(r.product_name)}<div class="cell-sub">${esc((DB.find('warehouses', r.warehouse) || {}).name || r.warehouse)}</div>` },
          { k: 'qty', label: '现量', align: 'right', render: r => num(r.qty) },
          { k: 'value', label: '占用资金', align: 'right', render: r => '¥' + money(r.value) },
          { k: 'last', label: '最近出库', render: r => { const d = lastOut[r.product + '|' + r.warehouse]; return d ? `${dateCN(d)} · ${UI.days(d, DB.today())} 天前` : '<span class="muted">从未出库</span>'; } },
        ], slow, { pk: '_id', empty: '没有呆滞库存,库存流动性良好' })}</div>`;
  }

  /* ---------------- 利润表 ---------------- */
  function pl() {
    const accs = DB.list('gl_account');
    const byType = {};
    accs.forEach(a => { (byType[a.type] = byType[a.type] || []).push(a); });
    const sum = t => r2((byType[t] || []).reduce((s, a) => s + (['revenue', 'liability', 'equity'].indexOf(t) >= 0 ? -a.balance : a.balance), 0));
    const revenue = sum('revenue'), cogs = sum('cost'), expense = sum('expense');
    const gp = r2(revenue - cogs), op = r2(gp - expense);
    const margin = revenue ? gp / revenue * 100 : 0, netMargin = revenue ? op / revenue * 100 : 0;
    const keys = DASH.monthKeys(6), ser = DASH.revenueByMonth(keys);
    const rows = accs.filter(a => a.balance !== 0).sort((a, b) => (a.code > b.code ? 1 : -1));
    const asset = sum('asset'), liab = sum('liability'), equity = r2(sum('equity') + op);

    return head('pl', `<button class="btn" data-route="journal">${icon('book')}查看凭证</button><button class="btn primary" data-route="gl_account">${icon('grid')}科目余额表</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '营业收入', value: '¥' + UI.compact(revenue), icon: 'trendUp', color: '#4F46E5', foot: '科目 4001 + 4002' })}
        ${UI.kpi({ label: '营业成本', value: '¥' + UI.compact(cogs), icon: 'box', color: '#F59E0B', foot: '科目 5001 + 5401(出库结转)' })}
        ${UI.kpi({ label: '毛利 / 毛利率', value: '¥' + UI.compact(gp) + `<small> ${margin.toFixed(1)}%</small>`, icon: 'pie', color: '#047857', foot: '收入 − 成本' })}
        ${UI.kpi({ label: '营业利润', value: '¥' + UI.compact(op) + `<small> ${netMargin.toFixed(1)}%</small>`, icon: 'wallet', color: op >= 0 ? '#0E7490' : '#DC2626', foot: `期间费用 ¥${UI.compact(expense)}` })}
      </div>
      <div class="grid g-2-1 mt16">
        <div class="card"><div class="card-head"><h3>${icon('book')}利润表(自制凭证账簿,单位:元)</h3><div class="right"><span class="muted small">借贷平衡校验 ${checkBalance()}</span></div></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>项目</th><th>科目</th><th class="right">本期金额</th><th class="right">占收入比</th></tr></thead>
            <tbody>
              ${line('一、营业收入', '4001 / 4002', revenue, revenue, 'strong')}
              ${line('  减:营业成本', '5001 / 5401', -cogs, revenue)}
              ${line('二、毛利润', '', gp, revenue, 'strong')}
              ${(byType['expense'] || []).map(a => line('  减:' + a.name, a.code, -Math.abs(a.balance), revenue)).join('')}
              ${line('三、营业利润', '', op, revenue, 'primary')}
              ${line('  加:营业外收入(盘盈)', '4002 部分', 0, revenue)}
            </tbody></table></div>
          <div class="table-foot"><span>提示:本报表由业务单据自动生成的记账凭证汇总而来,任何过账动作都会实时刷新损益。</span></div></div>
        <div class="card"><div class="card-head"><h3>${icon('layers')}资产负债简表</h3></div><div class="card-body">
          <div class="stat-row"><div>资产合计<b>¥${UI.compact(asset)}</b></div><div>负债合计<b>¥${UI.compact(liab)}</b></div><div>权益(含本年利润)<b>¥${UI.compact(equity)}</b></div></div>
          <div class="divider"></div>
          ${rows.filter(a => ['asset', 'liability', 'equity'].indexOf(a.type) >= 0).map(a => `<div class="flex" style="padding:8px 0;border-bottom:1px dashed var(--border)">
            <span class="mono muted small">${esc(a.code)}</span><span class="grow">${esc(a.name)}</span>
            <span class="money" style="color:${a.balance < 0 ? 'var(--danger)' : 'var(--text)'}">¥${money(a.balance)}</span></div>`).join('')}
          <div class="flex" style="padding:8px 0;border-bottom:1px dashed var(--border)"><span class="mono muted small">—</span><span class="grow">本年利润(收入−成本−费用)</span><span class="money" style="color:${op < 0 ? 'var(--danger)' : 'var(--text)'}">¥${money(op)}</span></div>
          <div class="notice mt12">${UI.icon('info')}<div>资产类科目借方为正,负债与权益类科目贷方为负;本年利润尚未结转分录,故在权益侧单独列示,使 资产 = 负债 + 权益 恒等。试算平衡即借方合计 = 贷方合计。</div></div></div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('chart')}月度收入与成本对比</h3></div><div class="card-body">
        ${UI.barChart(keys.map(k => k.slice(2)), keys.map((k, i) => ({ a: ser.rev[i], b: ser.cogs[i], color: '#4F46E5', color2: '#F59E0B' })))}
        ${UI.legend([{ name: '收入', color: '#4F46E5' }, { name: '成本', color: '#F59E0B' }])}</div></div>`;
    function line(name, code, v, base, cls) {
      return `<tr><td class="${cls === 'strong' || cls === 'primary' ? 'strong' : ''}">${esc(name)}</td><td class="mono muted small">${esc(code)}</td>
        <td class="right money" style="${cls === 'primary' ? 'color:var(--primary);font-weight:650' : v < 0 ? 'color:var(--danger)' : ''}">${money(v)}</td>
        <td class="right money muted">${base ? (v / base * 100).toFixed(1) + '%' : '—'}</td></tr>`;
    }
    function checkBalance() {
      let d = 0, c = 0;
      DB.list('journal_lines').forEach(l => { d += l.debit; c += l.credit; });
      return Math.abs(d - c) < 1 ? '通过 ✓' : '不平衡 ✗';
    }
  }

  /* ---------------- 自定义报表引擎 ---------------- */
  let cfgState = { entity: 'sales_order', group: 'customer_name', metrics: ['total'], filters: {}, limit: 60 };
  function custom() {
    const entities = ['sales_order', 'purchase_order', 'invoice', 'bill', 'stock', 'stock_movements', 'journal', 'receipt', 'payment', 'delivery', 'gr', 'customers', 'suppliers', 'products'];
    const e = SCHEMA.entities[cfgState.entity];
    const dims = Object.keys(e.fields).filter(k => ['text', 'select', 'code', 'date', 'ref'].indexOf(e.fields[k].t) >= 0 && !e.fields[k].hidden);
    const metrics = Object.keys(e.fields).filter(k => ['money', 'int'].indexOf(e.fields[k].t) >= 0);
    const rows = DB.list(cfgState.entity);
    const agg = {};
    rows.forEach(r => {
      const key = fmtDim(r[cfgState.group], e.fields[cfgState.group]);
      const a = agg[key] || (agg[key] = { key, n: 0 });
      a.n++;
      cfgState.metrics.forEach(m => a[m] = r2((a[m] || 0) + (+r[m] || 0)));
    });
    const out = Object.values(agg).sort((a, b) => (b[cfgState.metrics[0]] || 0) - (a[cfgState.metrics[0]] || 0)).slice(0, cfgState.limit);
    const totalAll = {};
    cfgState.metrics.forEach(m => totalAll[m] = r2(rows.reduce((s, r) => s + (+r[m] || 0), 0)));

    return head('dashboard2', `<button class="btn primary" data-action="exportReport">${icon('download')}导出当前结果</button>`) + `
      <div class="card"><div class="card-head"><h3>${icon('filter')}报表配置</h3><div class="right"><span class="muted small">实体 × 维度 × 度量 的即席分组汇总</span></div></div>
      <div class="card-body"><div class="form-grid g3">
        ${sel('entity', '数据实体', entities.map(x => [x, SCHEMA.entities[x].label]), cfgState.entity)}
        ${sel('group', '分组维度', dims.map(k => [k, e.fields[k].l]), cfgState.group)}
        ${sel('metric', '汇总度量', metrics.map(k => [k, e.fields[k].l + '(求和)']), cfgState.metrics[0])}
      </div>
      <div class="flex mt12 wrap"><span class="muted small">追加度量:</span>${metrics.map(m => `<span class="chip ${cfgState.metrics.indexOf(m) >= 0 ? 'on' : ''}" data-metric="${m}">${esc(e.fields[m].l)}</span>`).join('')}
        <span class="muted small" style="margin-left:auto">最大行数</span><select data-limit style="width:96px">${[20, 60, 200, 1000].map(n => `<option value="${n}" ${n === cfgState.limit ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div></div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}分组汇总结果</h3><div class="right"><span class="muted small">${out.length} 组 / 共 ${num(rows.length)} 行明细</span></div></div>
        ${UI.table([{ k: 'key', label: e.fields[cfgState.group].l, render: r => `<span class="cell-main">${esc(r.key)}</span>` },
          { k: 'n', label: '记录数', align: 'right', render: r => num(r.n) }]
          .concat(cfgState.metrics.map(m => ({ k: m, label: e.fields[m].l, align: 'right', render: r => `<span class="money strong">${money(r[m] || 0)}</span>` })))
          .concat([{ k: 'bar', label: '占比', render: r => { const t = totalAll[cfgState.metrics[0]] || 1; return `<div class="flex" style="gap:8px"><div class="progress" style="width:110px"><i style="width:${Math.min(100, (r[cfgState.metrics[0]] || 0) / t * 100).toFixed(1)}%"></i></div><span class="small muted">${((r[cfgState.metrics[0]] || 0) / t * 100).toFixed(1)}%</span></div>`; } }]),
          out, { pk: 'key', empty: '没有可汇总的数据' })}
        <div class="table-foot"><span>总计</span>${cfgState.metrics.map(m => `<span class="money strong">${esc(e.fields[m].l)} ¥${money(totalAll[m])}</span>`).join('<span style="opacity:.4">|</span>')}</div></div>`;
    function sel(key, label, opts, val) {
      return `<div class="fitem"><label>${esc(label)}</label><select data-rp="${key}">${opts.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(val) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
    }
    function fmtDim(v, f) {
      if (!f) return String(v);
      if (f.t === 'ref') { const r = DB.find(f.ref, v); return r ? String(r.name || r[SCHEMA.entities[f.ref].pk]) : String(v); }
      if (f.t === 'date') return String(v).slice(0, 7);
      if (f.t === 'select') return SCHEMA.STATUS[v] ? SCHEMA.STATUS[v].l : (typeof f.opts[v] === 'object' ? v : f.opts[v] || v);
      return String(v);
    }
  }
  function bindCustom(root) {
    UI.$$('[data-rp]', root).forEach(s => s.addEventListener('change', () => {
      const k = s.dataset.rp;
      cfgState[k] = s.value;
      if (k === 'entity') { cfgState.group = 'customer_name'; cfgState.metrics = ['total']; }
      APP.render();
    }));
    UI.$$('[data-metric]', root).forEach(c => c.addEventListener('click', () => {
      const m = c.dataset.metric, i = cfgState.metrics.indexOf(m);
      if (i >= 0) { if (cfgState.metrics.length > 1) cfgState.metrics.splice(i, 1); } else cfgState.metrics.push(m);
      APP.render();
    }));
    const lim = UI.$('[data-limit]', root);
    if (lim) lim.addEventListener('change', () => { cfgState.limit = +lim.value; APP.render(); });
  }

  function render(key) {
    if (key === 'ar' || key === 'ap') return aging(key);
    if (key === 'sales') return sales();
    if (key === 'purchase') return purchase();
    if (key === 'inventory') return inventory();
    if (key === 'pl') return pl();
    if (key === 'dashboard2') return custom();
    return UI.emptyBox('报表不存在');
  }
  const bind = { 'reports/dashboard2': bindCustom };

  return { render, TITLES, DESC, aging, bind, sales, pl };
})();
