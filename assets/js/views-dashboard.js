/* ============================================================
 * views-dashboard.js — 经营看板 + 待办工作台
 * ============================================================ */
window.DASH = (function () {
  const money = UI.money, num = UI.num, esc = UI.esc, icon = UI.icon, r2 = UI.round2;

  function periodDays() { return APP.period ? APP.period() : 30; }
  function since(days) { return DB.addDays(DB.today(), -days); }
  function inPeriod(dateStr, days) { return dateStr >= since(days); }

  function monthKeys(n) {
    const out = [], d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push(x.toISOString().slice(0, 7));
    }
    return out;
  }

  /* 收入口径:已开票销售发票(不含税);成本:出库结转成本 */
  function revenueByMonth(keys) {
    const rev = keys.map(() => 0), cogs = keys.map(() => 0), pur = keys.map(() => 0), cash = keys.map(() => 0);
    DB.list('invoice').forEach(i => { const p = keys.indexOf(i.period || i.date.slice(0, 7)); if (p >= 0) rev[p] += (i.total || 0) / 1.13; });
    DB.list('journal').forEach(j => {
      const k = j.period || j.date.slice(0, 7), p = keys.indexOf(k); if (p < 0) return;
      if (j.type === 'sales_delivery') cogs[p] += j.debit;
      if (j.type === 'ap_bill') pur[p] += j.debit;
      if (j.type === 'sales_receipt') cash[p] += j.debit;
    });
    return { rev: rev.map(r2), cogs: cogs.map(r2), pur: pur.map(r2), cash: cash.map(r2) };
  }

  function board() {
    const D = periodDays();
    const keys = monthKeys(6);
    const series = revenueByMonth(keys);
    const cur = series.rev[5] || 0, prev = series.rev[4] || 0;
    const trend = prev ? (cur - prev) / prev * 100 : 0;
    const gM = cur && series.cogs[5] ? (cur - series.cogs[5]) / cur * 100 : 0;

    const ar = r2(DB.list('invoice').reduce((s, i) => s + (i.balance || 0), 0));
    const ap = r2(DB.list('bill').reduce((s, b) => s + (b.balance || 0), 0));
    const invValue = r2(DB.list('stock').reduce((s, x) => s + (x.value || 0), 0));
    const cash = (DB.find('gl_account', '1002') || { balance: 0 }).balance;
    const lowStock = DB.where('stock', s => s.status !== 'normal');
    const openSO = DB.where('sales_order', o => ['confirmed', 'partial'].indexOf(o.status) >= 0);
    const overdueInv = DB.where('invoice', i => i.status === 'overdue');
    const periodSales = r2(DB.where('sales_order', o => inPeriod(o.date, D)).reduce((s, o) => s + o.total, 0));

    const kpis = `
      <div class="grid g4">
        ${UI.kpi({ label: `近 ${D} 天销售额`, value: '¥' + UI.compact(periodSales), icon: 'trendUp', color: '#4F46E5', foot: `订单 ${DB.where('sales_order', o => inPeriod(o.date, D)).length} 张`, trend: trend })}
        ${UI.kpi({ label: '本月毛利率', value: gM.toFixed(1) + '%', icon: 'pie', color: '#047857', foot: `收入 ¥${UI.compact(cur)} · 成本 ¥${UI.compact(series.cogs[5])}`, trend: gM - (series.rev[4] && series.cogs[4] ? (series.rev[4] - series.cogs[4]) / series.rev[4] * 100 : gM) })}
        ${UI.kpi({ label: '应收账款余额', value: '¥' + UI.compact(ar), icon: 'receipt', color: '#B45309', foot: `逾期 ${overdueInv.length} 张 ¥${UI.compact(r2(overdueInv.reduce((s, i) => s + i.balance, 0)))}` })}
        ${UI.kpi({ label: '应付账款余额', value: '¥' + UI.compact(ap), icon: 'card', color: '#DC2626', foot: `供应商 ${DB.count('suppliers')} 家 · 未清账单 ${DB.where('bill', b => b.balance > 0).length} 张` })}
      </div>
      <div class="grid g4 mt16">
        ${UI.kpi({ label: '库存资金占用', value: '¥' + UI.compact(invValue), icon: 'layers', color: '#0E7490', foot: `SKU ${DB.count('products')} · 预警 ${lowStock.length} 条` })}
        ${UI.kpi({ label: '银行存款', value: '¥' + UI.compact(cash), icon: 'wallet', color: '#7C3AED', foot: '科目 1002 · 招行杭州分行' })}
        ${UI.kpi({ label: '未清销售订单', value: num(openSO.length) + '<small> 张</small>', icon: 'file', color: '#F59E0B', foot: `待发货 ${openSO.filter(o => o.status === 'confirmed').length} · 部分出库 ${openSO.filter(o => o.status === 'partial').length}` })}
        ${UI.kpi({ label: '本期回款', value: '¥' + UI.compact(r2(DB.where('receipt', r => inPeriod(r.date, D)).reduce((s, r) => s + r.amount, 0))), icon: 'check', color: '#10B981', foot: `收款单 ${DB.where('receipt', r => inPeriod(r.date, D)).length} 张` })}
      </div>`;

    /* 趋势图 */
    const trendChart = UI.lineChart([
      { name: '销售收入(不含税)', color: '#4F46E5', data: series.rev, area: true },
      { name: '销售成本', color: '#F59E0B', data: series.cogs },
      { name: '采购入库', color: '#0EA5E9', data: series.pur },
      { name: '销售回款', color: '#10B981', data: series.cash },
    ], keys.map(k => k.slice(2)));

    /* 类目占比 */
    const catAgg = {};
    DB.list('iv_lines').forEach(l => {
      const p = DB.find('products', l.product); if (!p) return;
      catAgg[p.category] = (catAgg[p.category] || 0) + l.amount;
    });
    const catItems = Object.keys(catAgg).sort((a, b) => catAgg[b] - catAgg[a]).map((k, i) => ({ name: k, value: r2(catAgg[k]), color: UI.PAL[i % UI.PAL.length] }));

    /* Top 客户 */
    const custAgg = {};
    DB.list('iv_lines').forEach(l => {
      const inv = DB.find('invoice', l.doc); if (!inv) return;
      custAgg[inv.customer] = (custAgg[inv.customer] || 0) + l.amount;
    });
    const topCust = Object.keys(custAgg).sort((a, b) => custAgg[b] - custAgg[a]).slice(0, 6)
      .map(c => ({ name: (DB.find('customers', c) || {}).name || c, value: r2(custAgg[c]), key: c }));

    /* 待办卡片:清单按业务动线排列,卡片只放最要紧的 8 项,因此按紧急度重排而不是按声明顺序截断 */
    const TODORANK = { 'b-danger': 0, 'b-warning': 1, 'b-primary': 2, 'b-purple': 3, 'b-info': 4, 'b-success': 5, 'b-neutral': 6 };
    const todos = todoItems();
    const todoTasks = todos.reduce((s, t) => s + t.count, 0);
    const todoHTML = todos.slice().sort((a, b) => (TODORANK[a.cls] - TODORANK[b.cls]) || (b.count - a.count)).slice(0, 8)
      .map(t => `<div class="flex" style="padding:11px 0;border-bottom:1px solid #EEF1F6">
      <span class="badge ${t.cls}">${t.count}</span><div class="grow"><div style="font-weight:550">${esc(t.label)}</div>
      <div class="muted small">${esc(t.desc)}</div></div><button class="btn sm" data-route="${t.route}">${esc(t.action)}</button></div>`).join('');

    /* 库存预警 */
    const alertRows = lowStock.slice(0, 8);
    const alertHTML = alertRows.length ? UI.table([
      { k: 'product', label: '物料', render: r => `<span class="mono cell-link" data-open="products=${encodeURIComponent(r.product)}">${esc(r.product)}</span>` },
      { k: 'name', label: '商品名称', render: r => `<span class="cell-main">${esc(r.product_name)}</span><div class="cell-sub">${esc((DB.find('warehouses', r.warehouse) || {}).name || r.warehouse)}</div>` },
      { k: 'available', label: '可用', align: 'right', render: r => `<span class="money" style="color:${r.available <= 0 ? 'var(--danger)' : 'var(--warning)'}">${num(r.available)}</span>` },
      { k: 'safety', label: '安全库存', align: 'right', render: r => `<span class="money muted">${num((DB.find('products', r.product) || {}).safety_qty)}</span>` },
      { k: 'st', label: '状态', render: r => UI.badge(r.status) },
    ], alertRows, { pk: '_id', empty: '库存水位健康,暂无预警' }) : '';

    const acts = DB.list('activity').slice(0, 9);
    const actHTML = `<div class="timeline">${acts.map(a => `<div class="tl-item done"><b>${esc(a.action)}</b><span class="when">${esc((a.time || '').slice(5, 16))}</span>
      <p>${esc(a.user)} · ${esc(a.module)}${a.ref ? ' <span class="mono">' + esc(a.ref) + '</span>' : ''} ${esc(a.detail || '')}</p></div>`).join('')}</div>`;

    const recentOrders = DB.where('sales_order', o => o.status !== 'cancelled').sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 8);

    return `
    <div class="page-head"><div><h2>经营看板</h2><div class="desc">统计区间随顶栏时间切换联动 · 数据口径:收入取已开票销售发票(不含税),成本取销售出库结转成本,库存取移动加权平均成本。当前账套 <span class="mono">${esc(DB.all().meta.company)}</span>。</div></div>
      <div class="page-actions"><button class="btn" data-new-doc="purchase_req">${icon('clipboard')}发起采购申请</button><button class="btn primary" data-new-doc="sales_order">${icon('plus')}新建销售订单</button></div></div>
    ${kpis}
    <div class="grid g-2-1 mt16">
      <div class="card"><div class="card-head"><h3>${icon('chart')}近 6 个会计期间经营趋势</h3><div class="right"><span class="muted small">单位:元</span></div></div><div class="card-body">${trendChart}</div></div>
      <div class="card"><div class="card-head"><h3>${icon('pie')}销售类目结构</h3></div><div class="card-body">${UI.donut(catItems, { centerLabel: '开票额' })}</div></div>
    </div>
    <div class="grid g2 mt16">
      <div class="card"><div class="card-head"><h3>${icon('users')}Top 6 客户(按开票额)</h3><div class="right"><button class="btn sm ghost" data-route="customers">查看全部</button></div></div>
        <div class="card-body">${UI.hbars(topCust, { links: 'customers' })}</div></div>
      <div class="card"><div class="card-head"><h3>${icon('warn')}库存预警</h3><div class="right"><span class="badge b-warning">${lowStock.length} 条</span>
        <button class="btn sm ghost" data-route="reports/shortage">缺料分析</button></div></div>${alertHTML || `<div class="card-body">${UI.emptyBox('库存水位健康') }</div>`}
        <div class="table-foot">${UI.cellRef('warehouses', 'WH-HZ01')} 等 ${DB.count('warehouses')} 个仓库 · 缺口按 MRP 口径可用量 = 现量 − 占用 + 在途计算</div></div>
    </div>
    <div class="grid g-2-1 mt16">
      <div class="card"><div class="card-head"><h3>${icon('file')}最近销售订单</h3><div class="right"><button class="btn sm" data-route="sales_order">进入模块</button></div></div>
        ${UI.table([
          { k: 'no', label: '订单号', render: r => `<span class="mono cell-link" data-open="sales_order=${encodeURIComponent(r.no)}">${esc(r.no)}</span>` },
          { k: 'customer', label: '客户', render: r => `<span class="cell-main">${esc(r.customer_name)}</span><div class="cell-sub">${dateCN(r.date)}</div>` },
          { k: 'warehouse', label: '发货仓', render: r => esc((DB.find('warehouses', r.warehouse) || {}).name || r.warehouse) },
          { k: 'total', label: '金额', align: 'right', render: r => `<span class="money strong">¥${money(r.total)}</span>` },
          { k: 'status', label: '状态', render: r => UI.badge(r.status) },
        ], recentOrders, { pk: 'no' })}</div>
      <div class="card"><div class="card-head"><h3>${icon('clock')}实时业务动态</h3></div><div class="card-body">${actHTML}</div></div>
    </div>
    <div class="grid g2 mt16">
      <div class="card"><div class="card-head"><h3>${icon('clipboard')}我的待办</h3><div class="right"><span class="badge b-danger" title="${todos.length} 类事项合计 ${todoTasks} 项,卡片仅列最紧急的 8 类">${todoTasks} 项待处理</span><button class="btn sm" data-route="todo">全部 ${todos.length} 类</button></div></div><div class="card-body">${todoHTML}</div></div>
      <div class="card"><div class="card-head"><h3>${icon('layers')}模块数据量</h3></div><div class="card-body">
        <div class="grid g3">${Object.entries({ 商品: 'products', 客户: 'customers', 供应商: 'suppliers', 销售订单: 'sales_order', 'PO': 'purchase_order', 库存行: 'stock', 流水: 'stock_movements', 凭证: 'journal', 询价单: 'rfq', 委外加工: 'os_order', 售后工单: 'rma', 审批单: 'approval', 日志: 'activity' })
          .map(([l, k]) => `<div style="padding:10px;border:1px solid var(--border);border-radius:10px;cursor:pointer" data-route="${k}">
            <div class="muted small">${l}</div><div style="font-size:18px;font-weight:650" class="money">${num(DB.count(k))}</div></div>`).join('')}</div></div></div>
    </div>`;
  }
  const dateCN = UI.dateCN;

  function todoItems() {
    const out = [];
    const add = (label, count, desc, route, action, cls) => { if (count > 0) out.push({ label, count, desc, route, action, cls }); };
    const drafts = DB.where('sales_order', o => o.status === 'draft').length;
    const wait = DB.where('sales_order', o => o.status === 'confirmed').length;
    const part = DB.where('sales_order', o => o.status === 'partial').length;
    const poDraft = DB.where('purchase_order', o => o.status === 'draft').length;
    const poWait = DB.where('purchase_order', o => ['confirmed', 'partial'].indexOf(o.status) >= 0).length;
    const prPend = DB.where('purchase_req', p => p.status === 'pending').length;
    const overdue = DB.where('invoice', i => i.status === 'overdue').length;
    const openInv = DB.where('invoice', i => i.status === 'open').length;
    const overdueBill = DB.where('bill', b => b.status === 'overdue').length;
    const openBill = DB.where('bill', b => b.status === 'open').length;
    const grNoBill = DB.where('gr', g => g.status === 'posted' && !DB.where('bill', b => b.gr === g.no).length).length;
    const qcWait = DB.where('iqc', a => a.status === 'to_check').length;
    const qcQty = DB.where('stock', s => s.warehouse === SCHEMA.QC_WH && s.qty > 0).reduce((s, r) => s + r.qty, 0);
    const qcNg = DB.where('iqc', a => a.status === 'reject' || a.status === 'concession').length;
    const low = DB.where('stock', s => s.status !== 'normal').length;
    const trDraft = DB.where('transfer', t => t.status === 'draft').length;
    const stDraft = DB.where('stocktake', t => t.status === 'draft').length;
    /* 新增模块:审批中心 / 产品管理 / 服务商管理 / 售后管理 */
    const apPend = DB.where('approval', a => a.status === 'pending' && a.module !== 'so_change').length;
    const chgPend = DB.where('approval', a => a.status === 'pending' && a.module === 'so_change').length;
    const rfqDraft = DB.where('rfq', r => r.status === 'draft').length;
    const rfqSent = DB.where('rfq', r => r.status === 'sent').length;
    const rfqQuote = DB.where('rfq', r => r.status === 'quoted').length;
    const relPend = DB.where('product_release', r => r.status === 'pending').length;
    const relAppr = DB.where('product_release', r => r.status === 'approved').length;
    const supPend = DB.where('supplier_apply', a => ['pending', 'inspecting'].indexOf(a.status) >= 0).length;
    const auditPend = DB.where('processor_audit', a => ['pending', 'inspecting'].indexOf(a.status) >= 0).length;
    const osIssue = DB.where('os_order', o => o.status === 'confirmed').length;
    const osRecv = DB.where('os_order', o => o.status === 'issued' || o.status === 'received').length;
    const rmaPend = DB.where('rma', r => r.status === 'pending').length;
    const rmaDo = DB.where('rma', r => ['approved', 'received', 'repairing'].indexOf(r.status) >= 0).length;
    const rmaRed = DB.where('rma', r => r.status === 'received' && !r.credit_invoice).length;
    add('待办审批', apPend, '跨模块审批队列,岗位分离后回写业务单据状态', 'approvals', '去审批', 'b-danger');
    const signOd = DB.where('approval', a => a.status === 'pending' && ACT.SIGN.overdue(a) > 0).length;
    const signRun = DB.where('approval', a => a.status === 'pending' && (a.chain || []).length > 1).length;
    const apBack = DB.where('approval', a => a.status === 'rejected' && !a.resubmit && ACT.SIGN.entityOf(a.module)).length;
    add('会签节点逾期', signOd, '签批超过时限,逾期节点在审批中心置顶标红,建议催办或改派岗位', 'approvals', '去催办', 'b-danger');
    add('分级会签在途', signRun, '按金额逐级签批,仅当前节点岗位可裁决,任一级驳回即整链终止', 'approvals', '去签批', 'b-purple');
    add('驳回待重提', apBack, '被驳回的申请补充资料后在审批单详情「修改重提」,原单留档可追溯', 'approvals', '去重提', 'b-warning');
    add('待审核销售订单', drafts, '草稿订单需审核后才会占用库存并允许发货', 'sales_order', '去审核', 'b-neutral');
    add('订单变更申请', chgPend, '交期与优先级变更需销售主管确认,通过后回写订单', 'approvals', '去裁决', 'b-warning');
    add('待发货销售订单', wait, '已审核订单需创建出库单完成发货', 'sales_order', '去发货', 'b-primary');
    add('部分出库订单', part, '仍有未发完的行,需跟进剩余数量', 'sales_order', '跟进', 'b-warning');
    add('待审批采购申请', prPend, '等待采购主管审批,可一键转采购订单', 'purchase_req', '去审批', 'b-warning');
    add('待审核采购订单', poDraft, '草稿采购订单需下发供应商', 'purchase_order', '去审核', 'b-neutral');
    add('待收货采购订单', poWait, '到货后需录入采购收货单', 'purchase_order', '去收货', 'b-info');
    add('货到票未到待清算', grNoBill, '收货已按不含税成本暂估入账 贷2203,需录入采购发票冲销暂估', 'gr', '录入发票', 'b-purple');
    add('来料待检验批次', qcWait, `待检仓在隔离 ${num(qcQty)} 件,品质经理判定前不可销售与领用`, 'iqc', '去判定', 'b-warning');
    add('来料不合格待处置', qcNg, '让步接收已折价冲减暂估并扣供应商评分,拒收批次退货结案', 'suppliers', '跟进', 'b-danger');
    add('逾期未收发票', overdue, '已超出信用到期日,建议立即催收', 'invoice', '催收', 'b-danger');
    add('待收款发票', openInv, '到期未过 30 天的正常应收', 'invoice', '登记收款', 'b-warning');
    add('逾期未付账单', overdueBill, '可能影响供应商信用,请安排付款', 'bill', '去付款', 'b-danger');
    add('待付账单', openBill, '正常账期内的应付', 'bill', '安排付款', 'b-info');
    add('待发出询价', rfqDraft, '草稿询价单需邀请供应商报价', 'rfq', '去发单', 'b-neutral');
    add('待回收报价', rfqSent, '已发出的询价单还没有回填最低价', 'rfq', '录报价', 'b-info');
    add('待定标询价', rfqQuote, '比价完成,定标后按供应商拆分生成采购订单', 'rfq', '去定标', 'b-purple');
    add('待审核新品', relPend, '新品发布单需销售主管裁决毛利与渠道', 'product_release', '去审核', 'b-warning');
    add('待上架新品', relAppr, '已核准的新品需建档并生成商品主档', 'product_release', '去上架', 'b-success');
    add('待审批供应商准入', supPend, '准入申请与现场审核结论需采购主管核准', 'supplier_apply', '去审批', 'b-warning');
    add('待裁决外协商审核', auditPend, '品质经理已录入评分,等待采购主管核准入池', 'processor_audit', '去审核', 'b-info');
    add('委外待发料', osIssue, '加工单需发出材料,借委托加工物资 1408', 'os_order', '去发料', 'b-primary');
    add('委外在制待收回', osRecv, '已发料加工单需收回成品并结算加工费', 'os_order', '去收回', 'b-warning');
    add('待裁决售后工单', rmaPend, '退货/换货/维修需销售主管审批后才能处理', 'rma', '去审批', 'b-warning');
    add('售后待处理', rmaDo, '通过审批的工单需入库、红冲或退款', 'rma', '去处理', 'b-info');
    add('售后待红冲', rmaRed, '退货已入库但未开红字发票,应收无法冲减', 'invoice', '开红字', 'b-purple');
    add('库存预警 SKU', low, '低于安全库存或缺货,建议补货', 'stock', '查看', 'b-warning');
    /* 计划维度:安全库存预警之后,由 MRP 给出可下达的建议 */
    const mrpOpen = DB.where('mrp_run', r => r.status !== 'closed')
      .reduce((s, r) => s + DB.lines('mrp_lines', r.no).filter(l => (l.suggest_qty || 0) > 0 && !l.release).length, 0);
    add('MRP 建议待下达', mrpOpen, '运算给出的采购/委外建议下达后仍是草稿单,需采购与生产各自审批才生效', 'mrp_run', '去下达', 'b-warning');
    const bomPend = DB.where('bom', b => b.status === 'pending').length;
    add('待核准物料清单', bomPend, '清单核准发布后才进入 MRP 展开,拖一天子件备料就晚一天', 'bom', '去审批', 'b-info');
    /* 批次维度:效期与质量扣留不影响账面金额,但直接压缩可售可用量 */
    const lotHold = l => l.qty > 0 && UI.days(DB.today(), l.expire_date);
    const lotExp = DB.where('lot', l => l.qty > 0 && l.status === 'expired');
    const lotFrz = DB.where('lot', l => l.qty > 0 && l.status === 'frozen');
    const lotNear = DB.where('lot', l => l.qty > 0 && l.status === 'normal' && l.expire_date && lotHold(l) >= 0 && lotHold(l) <= 90);
    add('已过效期批次', lotExp.length, `${num(lotExp.reduce((s, l) => s + l.qty, 0))} 件仍在账面,已从可售可用量剔除,需做处置出库`, 'lot', '去处置', 'b-danger');
    add('质量冻结批次', lotFrz.length, '复检放行需品质岗权限;批次处置按移动加权平均结转至 5401', 'lot', '复检放行', 'b-purple');
    add('临期批次(90 天内)', lotNear.length, `涉及 ${num(lotNear.reduce((s, l) => s + l.qty, 0))} 件,FEFO 分配会自动优先出掉`, 'reports/trace', '看效期', 'b-warning');
    add('草稿调拨单', trDraft, '调拨单需过账才会产生库存流水', 'transfer', '去过账', 'b-neutral');
    add('未过账盘点单', stDraft, '录入实盘数量后过账生成盘盈盘亏', 'stocktake', '去盘点', 'b-info');
    const curMonth = DB.monthOf(DB.today());
    const openPeriod = DB.where('period', p => p.status === 'open_period' && p.code < curMonth && ACT.periodActivity(p.code).vouchers > 0).length;
    add('未结账会计期间', openPeriod, '损益需结转至本年利润 3131 并锁定期间;锁定后该月禁止再过账', 'reports/close', '去结账', 'b-purple');
    return out;
  }

  /* 待办计数统一口径:侧栏角标与顶栏铃铛取「事项数」而不是分类数,和待办页的合计同源 */
  function todoStats() {
    const items = todoItems();
    return { groups: items.length, tasks: items.reduce((s, t) => s + t.count, 0) };
  }

  function todo() {
    const items = todoItems();
    const total = items.reduce((s, i) => s + i.count, 0);
    const aging = arAging();
    const blocked = DB.where('sales_order', o => o.status === 'confirmed').slice(0, 10);
    return `
    <div class="page-head"><div><h2>待办任务</h2><div class="desc">按岗位工作流聚合的待处理事项,直接跳转到对应模块并携带筛选条件。共 <b>${total}</b> 项待办。</div></div>
      <div class="page-actions"><button class="btn" data-route="dashboard">${icon('chart')}返回看板</button><button class="btn primary" data-new-doc="sales_order">${icon('plus')}新建销售订单</button></div></div>
    <div class="grid g-2-1">
      <div class="card"><div class="card-head"><h3>${icon('clipboard')}全部待办</h3><div class="right"><span class="muted small">按紧急度排序</span></div></div>
        <div class="card-body">${items.length ? items.map(t => `<div class="flex" style="padding:13px 0;border-bottom:1px solid #EEF1F6">
          <span class="badge ${t.cls}" style="min-width:44px;justify-content:center">${t.count}</span>
          <div class="grow"><div style="font-weight:580">${esc(t.label)}</div><div class="muted small">${esc(t.desc)}</div></div>
          <button class="btn sm" data-route="${t.route}">${esc(t.action)} ${icon('chevR')}</button></div>`).join('') : UI.emptyBox('全部处理完毕', '当前没有待办事项')}</div></div>
      <div class="card"><div class="card-head"><h3>${icon('warn')}应收账龄速览</h3></div><div class="card-body">
        ${UI.hbars(aging.buckets.map((b, i) => ({ name: b.name, value: b.amount, color: UI.PAL[[1, 2, 3, 4, 5][i]] })), { fmt: v => '¥' + money(v) })}
        <div class="notice mt12">${icon('info')}<div>逾期金额 <b>¥${money(aging.overdue)}</b>,占应收总额 <b>${aging.total ? (aging.overdue / aging.total * 100).toFixed(1) : '0.0'}%</b>。</div></div></div></div>
    </div>
    <div class="card mt16"><div class="card-head"><h3>${icon('send')}待发货订单(已审核未出库)</h3><div class="right"><button class="btn sm" data-route="sales_order">查看全部</button></div></div>
      ${blocked.length ? UI.table([
        { k: 'no', label: '订单号', render: r => `<span class="mono cell-link" data-open="sales_order=${encodeURIComponent(r.no)}">${esc(r.no)}</span>` },
        { k: 'c', label: '客户', render: r => esc(r.customer_name) },
        { k: 'req', label: '需求到货日', render: r => `<span class="${r.required_date < DB.today() ? 'money' : ''}" style="${r.required_date < DB.today() ? 'color:var(--danger);font-weight:600' : ''}">${dateCN(r.required_date)}${r.required_date < DB.today() ? ' · 已逾期' : ''}</span>` },
        { k: 'lines', label: '行数', align: 'right', render: r => num(DB.lines('so_lines', r.no).length) },
        { k: 'total', label: '金额', align: 'right', render: r => '¥' + money(r.total) },
        { k: 'op', label: '快捷操作', render: r => `<button class="btn sm primary" data-quick="${encodeURIComponent('deliver|' + r.no)}">${icon('send')}创建出库单</button>` },
      ], blocked, { pk: 'no' }) : `<div class="card-body">${UI.emptyBox('没有待发货订单')}</div>`}</div>`;
  }

  function arAging() {
    const names = ['未到期', '逾期 1-30 天', '逾期 31-60 天', '逾期 61-90 天', '逾期 90 天以上'];
    const buckets = names.map(n => ({ name: n, amount: 0 }));
    let overdue = 0, total = 0;
    const today = DB.today();
    DB.where('invoice', i => i.balance > 0.01).forEach(i => {
      const d = UI.days(i.due_date, today);
      const idx = d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4;
      buckets[idx].amount = r2(buckets[idx].amount + i.balance);
      total += i.balance; if (d > 0) overdue += i.balance;
    });
    return { buckets, overdue: r2(overdue), total: r2(total) };
  }

  /* 待办页快捷动作 */
  function bind(route) {
    const root = document.getElementById('view');
    UI.$$('[data-quick]', root).forEach(b => b.addEventListener('click', () => {
      const [kind, no] = decodeURIComponent(b.dataset.quick).split('|');
      DOC.open('sales_order', no);
      setTimeout(() => { const d = UI.$$('.drawer').pop(); if (d) { const btn = UI.$$('[data-doc-act]', d).find(x => /创建出库单/.test(x.textContent)); btn && btn.click(); } }, 260);
    }));
  }

  return { board, todo, bind: { todo, dashboard: () => { } }, todoItems, todoStats, arAging, monthKeys, revenueByMonth, inPeriod, since };
})();
