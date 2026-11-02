/* ============================================================
 * views-reports.js — 管理报表:AR/AP 账龄、销售/采购分析、库存周转、利润表、自定义报表
 * ============================================================ */
window.REPORTS = (function () {
  const money = UI.money, num = UI.num, esc = UI.esc, icon = UI.icon, r2 = UI.round2, dateCN = UI.dateCN;

  const TITLES = {
    ar: '应收账龄分析 (AR Aging)', ap: '应付账龄分析 (AP Aging)', sales: '销售分析',
    purchase: '采购分析', inventory: '库存结构与周转', pl: '利润表 (期间损益)', close: '期末处理与结账', dashboard2: '自定义报表',
    credit: '客户信用风险 (Credit Control)', trace: '批次追溯与召回 (Traceability)',
    shortage: '缺料与长周期分析 (Shortage & Lead Time)',
    pricing: '价格策略与毛利 (Pricing & Margin)'
  };
  const DESC = {
    ar: '按发票到期日分档,口径与销售发票未结余额一致,可直接下钻至单据。',
    ap: '按账单到期日分档,反映未来现金流出的时间分布;并列出货到票未到的应付暂估(GR/IR)清算进度。',
    credit: '按客户汇总信用额度、应收与在途占用,识别预警/超限/冻结三档风险,并跟踪信用特批的裁决动线。',
    sales: '按期间/客户/商品多维度汇总开票收入、成本与毛利。',
    purchase: '按供应商与期间汇总采购下单、收货与付款,含交付准时率。',
    inventory: '库存资金占用、库龄结构与周转率(出库成本 / 平均库存)。',
    pl: '取自制凭证账簿,收入=4001/4002 贷方发生额,成本与费用取借方发生额。',
    close: '期末三步走:试算平衡 → 损益结转至本年利润 3131 → 锁定会计期间;锁定后禁止跨期过账,反结账需财务审批权限。',
    dashboard2: '选择实体与字段,按条件筛选并导出 CSV —— 简易报表引擎。',
    trace: '以批次为主线看效期结构、质量扣留与库位负载;支持双向追溯(供应商 → 客户)与召回影响分析。',
    shortage: '按未履约订单与安全库存即时重算净缺口,叠加可用天数、提前期与清单覆盖,识别需要立刻下单的物料和计划盲区。',
    pricing: '按成交日重放取价阶梯(客户专属 → 促销 → 渠道 → 类目 → 阶梯 → 标准售价),对比价目表报价、移动加权成本与毛利红线,量化让利与改价风险。'
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
      ${kind === 'ap' ? irBlock() : ''}
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
          { k: 'status', label: '状态', render: d => UI.badge(d.status, kind === 'ap' ? 'ap' : '') },
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

  /* 应付暂估(GR/IR):货到票未到的在途成本与票到清算差异 */
  function irBlock() {
    const today = DB.today();
    const open = DB.list('gr').filter(g => g.status === 'posted');
    const settled = DB.list('gr').filter(g => g.status === 'settled');
    const returned = DB.list('gr').filter(g => g.status === 'returned');
    const irBills = DB.list('bill').filter(b => b.gr && b.accrual);
    const bookIR = r2(open.reduce((s, g) => s + (g.amount || 0), 0));
    const glIR = r2(DB.list('journal_lines').filter(l => l.account === '2203').reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0));
    const diffTotal = r2(irBills.reduce((s, b) => s + ((b.net || 0) - (b.accrual || 0)), 0));
    const aged = open.filter(g => UI.days(g.date, today) > 45);
    const cols = [
      { k: 'no', label: '收货单', render: g => `<span class="mono cell-link" data-open="gr=${encodeURIComponent(g.no)}">${esc(g.no)}</span>` },
      { k: 'po', label: '来源订单', render: g => `<span class="mono small">${esc(g.po || '—')}</span>` },
      { k: 'sup', label: '供应商', render: g => esc(g.supplier_name) },
      { k: 'date', label: '收货日期', render: g => dateCN(g.date) },
      { k: 'age', label: '暂估挂账', align: 'right', render: g => { const d = Math.max(0, UI.days(g.date, today)); return `<span style="${d > 45 ? 'color:var(--danger);font-weight:600' : ''}">${d} 天</span>`; } },
      { k: 'amt', label: '暂估金额(不含税)', align: 'right', render: g => `<span class="money strong">¥${money(g.amount)}</span>` },
      { k: 'op', label: '动作', sortable: false, render: g => `<button class="btn sm" data-open="gr=${encodeURIComponent(g.no)}">${icon('receipt')}录入发票清算</button>` },
    ];
    return `<div class="card mt16"><div class="card-head"><h3>${icon('swap')}应付暂估与票到清算 (GR/IR)</h3>
      <div class="right"><span class="badge ${Math.abs(bookIR - glIR) < .05 ? 'b-success' : 'b-danger'}">子账 ${money(bookIR)} ${Math.abs(bookIR - glIR) < .05 ? '= 总账 2203' : '≠ 总账 2203 ' + money(glIR)}</span></div></div>
      <div class="card-body">
        <div class="stat-row">
          <div>未清算暂估<b>¥${money(bookIR)}</b></div>
          <div>待清算收货单<b>${num(open.length)}<small> 张</small></b></div>
          <div>已清算收货单<b>${num(settled.length)}<small> 张</small></b></div>
          <div>拒收退货结案<b>${num(returned.length)}<small> 张</small></b></div>
          <div>票差与运费调整存货<b style="color:${diffTotal < 0 ? 'var(--success)' : 'var(--danger)'}">${diffTotal >= 0 ? '+' : '−'}¥${money(Math.abs(diffTotal))}</b></div>
          <div>超 45 天未取票<b style="color:${aged.length ? 'var(--danger)' : 'var(--text)'}">${num(aged.length)}<small> 张</small></b></div>
        </div>
        <div class="notice mt12">${icon('info')}<div>收货即生成凭证 <b>借 库存商品 1405 / 贷 应付暂估 2203</b>,不确认进项税、不进入应付对账;
          采购发票录入后冲销暂估、确认进项税并转应付账款,<b>发票金额与暂估的差额及资本化运杂费回写存货成本</b>,库存子账与总账 1405 逐笔同源。
          超 45 天仍未取票的暂估建议向供应商催票,以免进项税留抵与成本口径失真。</div></div>
        <div class="mt12">${UI.table(cols, open.slice().sort((a, b) => a.date < b.date ? -1 : 1).slice(0, 10), { pk: 'no', empty: '全部到货均已票到清算,暂无挂账暂估' })}</div>
      </div></div>`;
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
    /* 损益按凭证「发生额」统计并排除结转凭证本身:这样结账前后利润表口径不变 */
    const openCodes = {}, hasPeriods = DB.count('period') > 0;
    DB.where('period', p => p.status === 'open_period').forEach(p => { openCodes[p.code] = 1; });
    const allDocs = {}, openDocs = {};
    DB.where('journal', j => j.type !== 'close').forEach(j => { allDocs[j.no] = 1; if (!hasPeriods || openCodes[j.period]) openDocs[j.no] = 1; });
    const net = occMap(allDocs), netOpen = occMap(openDocs);
    const nv = (m, code) => { const x = m[code] || { d: 0, c: 0 }; return r2(x.d - x.c); };
    const typeNet = (m, t) => r2((byType[t] || []).reduce((s, a) => s - nv(m, a.code), 0));
    const revenue = typeNet(net, 'revenue'), cogs = -typeNet(net, 'cost'), expense = -typeNet(net, 'expense');
    const gp = r2(revenue - cogs), op = r2(gp - expense);
    const unclosed = r2(typeNet(netOpen, 'revenue') + typeNet(netOpen, 'cost') + typeNet(netOpen, 'expense'));
    const closed = r2(-(DB.find('gl_account', '3131').balance || 0));
    const lockedN = DB.where('period', p => p.status === 'locked').length;
    const margin = revenue ? gp / revenue * 100 : 0, netMargin = revenue ? op / revenue * 100 : 0;
    const keys = DASH.monthKeys(6), ser = DASH.revenueByMonth(keys);
    const rows = accs.filter(a => a.balance !== 0).sort((a, b) => (a.code > b.code ? 1 : -1));
    const asset = sum('asset'), liab = sum('liability'), equity = r2(sum('equity') + unclosed);
    function occMap(docs) {
      const out = {};
      DB.list('journal_lines').forEach(l => {
        if (!docs[l.doc]) return;
        const a = out[l.account] || (out[l.account] = { d: 0, c: 0 });
        a.d = r2(a.d + (l.debit || 0)); a.c = r2(a.c + (l.credit || 0));
      });
      return out;
    }

    return head('pl', `<button class="btn" data-route="journal">${icon('book')}查看凭证</button><button class="btn" data-route="reports/close">${icon('lock')}期末处理</button><button class="btn primary" data-route="gl_account">${icon('grid')}科目余额表</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '营业收入', value: '¥' + UI.compact(revenue), icon: 'trendUp', color: '#4F46E5', foot: '科目 4001 + 4002' })}
        ${UI.kpi({ label: '营业成本', value: '¥' + UI.compact(cogs), icon: 'box', color: '#F59E0B', foot: '科目 5001 + 5401(出库结转)' })}
        ${UI.kpi({ label: '毛利 / 毛利率', value: '¥' + UI.compact(gp) + `<small> ${margin.toFixed(1)}%</small>`, icon: 'pie', color: '#047857', foot: '收入 − 成本' })}
        ${UI.kpi({ label: '营业利润', value: '¥' + UI.compact(op) + `<small> ${netMargin.toFixed(1)}%</small>`, icon: 'wallet', color: op >= 0 ? '#0E7490' : '#DC2626', foot: `期间费用 ¥${UI.compact(expense)}` })}
      </div>
      <div class="grid g-2-1 mt16">
        <div class="card"><div class="card-head"><h3>${icon('book')}利润表(本年累计,单位:元)</h3><div class="right"><span class="muted small">借贷平衡校验 ${checkBalance()}</span></div></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>项目</th><th>科目</th><th class="right">本年累计</th><th class="right">占收入比</th></tr></thead>
            <tbody>
              ${line('一、营业收入', '4001 / 4002', revenue, revenue, 'strong')}
              ${line('  减:营业成本', '5001 / 5401', -cogs, revenue)}
              ${line('二、毛利润', '', gp, revenue, 'strong')}
              ${(byType['expense'] || []).map(a => line('  减:' + a.name, a.code, -nv(net, a.code), revenue)).join('')}
              ${line('三、营业利润', '', op, revenue, 'primary')}
              ${line('四、净利润(结转至本年利润)', '3131', op, revenue, 'primary')}
            </tbody></table></div>
          <div class="table-foot"><span>本年利润 3131 已结转 ¥${money(closed)}(锁定 ${lockedN} 期) · 未结转开放期间损益 ¥${money(unclosed)}</span></div></div>
        <div class="card"><div class="card-head"><h3>${icon('layers')}资产负债简表</h3></div><div class="card-body">
          <div class="stat-row"><div>资产合计<b>¥${UI.compact(asset)}</b></div><div>负债合计<b>¥${UI.compact(liab)}</b></div><div>权益(含本年利润)<b>¥${UI.compact(equity)}</b></div></div>
          <div class="divider"></div>
          ${rows.filter(a => ['asset', 'liability', 'equity'].indexOf(a.type) >= 0).map(a => `<div class="flex" style="padding:8px 0;border-bottom:1px dashed var(--border)">
            <span class="mono muted small">${esc(a.code)}</span><span class="grow">${esc(a.name)}${a.code === '3131' ? '<span class="muted small"> · 已结转期间</span>' : ''}</span>
            <span class="money" style="color:${a.balance < 0 ? 'var(--danger)' : 'var(--text)'}">¥${money(a.balance)}</span></div>`).join('')}
          <div class="flex" style="padding:8px 0;border-bottom:1px dashed var(--border)"><span class="mono muted small">—</span><span class="grow">未结转损益(开放期间)</span><span class="money" style="color:${unclosed < 0 ? 'var(--danger)' : 'var(--text)'}">¥${money(unclosed)}</span></div>
          <div class="flex" style="padding:8px 0"><span class="mono muted small">＝</span><span class="grow strong">资产 − 负债 − 权益</span><span class="money strong">${money(r2(asset - liab - equity))}</span></div>
          <div class="notice mt12">${UI.icon('info')}<div>损益类科目按发生额列示,期末结转后余额转入「本年利润 3131」;未结账期间的损益仍在账上,故在权益侧单列,保证 资产 = 负债 + 所有者权益 恒等。已锁定 ${lockedN} 个期间。</div></div></div></div>
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

  /* ---------------- 期末处理与结账 ---------------- */
  let closeState = { period: '' };
  function periodCards() {
    const cur = DB.monthOf(DB.today());
    let periods = DB.list('period').slice().sort((a, b) => a.code < b.code ? -1 : 1);
    if (!periods.length) DB.list('journal').forEach(j => ACT.periodRow(j.period || String(j.date).slice(0, 7)));
    periods = DB.list('period').slice().sort((a, b) => a.code < b.code ? -1 : 1);
    const stats = {};
    periods.forEach(p => { stats[p.code] = ACT.periodPnL(p.code); });
    const open = periods.filter(p => p.status === 'open_period');
    const sel = closeState.period || (open[0] || periods[periods.length - 1] || {}).code || cur;
    const retained = r2(-(DB.find('gl_account', '3131').balance || 0));
    const unclosed = r2(open.reduce((s, p) => s + stats[p.code].profit, 0));
    const carry = open.filter(p => Math.abs(stats[p.code].revenue) > .005 || Math.abs(stats[p.code].totalCost) > .005).length;
    const needClose = open.filter(p => p.code < cur);
    return { periods, stats, open, sel, retained, unclosed, carry, lockedCount: periods.length - open.length, needClose, cur };
  }
  function close() {
    const ctx = periodCards();
    const { periods, stats, open, sel, retained, unclosed, carry, lockedCount, needClose } = ctx;
    const asset = sumBal('asset'), liab = sumBal('liability'), equityAll = sumBal('equity');
    /* equityAll 已含本年利润 3131(retained),再加未结转损益即为全部权益 */
    const balanced = Math.abs(asset - liab - equityAll - unclosed) < 0.05;
    const cols = [
      { k: 'code', label: '会计期间', render: p => `<span class="mono cell-link cell-main" data-tb="${p.code}">${esc(p.code)}</span><div class="cell-sub">${dateCN(p.start)} 至 ${dateCN(p.end)}</div>` },
      { k: 'v', label: '凭证数', align: 'right', render: p => num(ACT.periodActivity(p.code).vouchers) },
      { k: 'rev', label: '本期收入', align: 'right', render: p => `<span class="money">${money(stats[p.code].revenue)}</span>` },
      { k: 'exp', label: '成本与费用', align: 'right', render: p => `<span class="money">${money(stats[p.code].totalCost)}</span>` },
      { k: 'pf', label: '本期净利润', align: 'right', render: p => { const v = stats[p.code].profit; return `<span class="money strong" style="color:${v < 0 ? 'var(--danger)' : 'var(--text)'}">${money(v)}</span>`; } },
      { k: 'st', label: '结账状态', render: p => UI.badge(p.status) + (p.closed_by ? `<div class="cell-sub">${esc(p.closed_by)} · ${esc(p.closed_at)}</div>` : `<div class="cell-sub">${p.code === ctx.cur ? '当前期间' : '待结转'}</div>`) },
      { k: 'cv', label: '结转凭证', render: p => p.close_voucher ? `<span class="mono cell-link" data-open="journal=${encodeURIComponent(p.close_voucher)}">${esc(p.close_voucher)}</span>` : '<span class="muted">—</span>' },
      { k: 'op', label: '期末处理', sortable: false, render: p => p.status === 'locked'
        ? `<button class="btn sm" data-reopen="${p.code}"${p.code !== lockedTail() ? ' disabled title="请按倒序逐个反结账"' : ''}>${icon('unlock')}反结账</button>`
        : p.code >= ctx.cur
          ? `<button class="btn sm" disabled title="当前期间需月末才能结账">${icon('lock')}${p.code === ctx.cur ? '当前期间' : '未来期间'}</button>`
          : `<button class="btn sm primary" data-close-doc="${p.code}"${p.code !== firstOpen() ? ' disabled title="请先结转更早的期间"' : ''}>${icon('lock')}结转并锁定</button>` },
    ];
    function firstOpen() { return (periods.filter(p => p.status === 'open_period' && p.code < ctx.cur)[0] || {}).code; }
    function lockedTail() { const l = periods.filter(p => p.status === 'locked'); return (l[l.length - 1] || {}).code; }

    const act = ACT.periodActivity(sel).byAccount;
    const tbRows = DB.list('gl_account').filter(a => act[a.code]).map(a => ({ code: a.code, name: a.name, type: a.type,
      debit: act[a.code].debit, credit: act[a.code].credit, net: r2(act[a.code].debit - act[a.code].credit) }));
    const tbDr = r2(tbRows.reduce((s, r) => s + r.debit, 0)), tbCr = r2(tbRows.reduce((s, r) => s + r.credit, 0));
    const built = ACT.buildCloseLines(sel);
    const selP = periods.filter(p => p.code === sel)[0] || { status: 'open_period' };
    const canClose = ACT.PERM.can('period', 'approve');

    return head('close', `<button class="btn" data-route="journal">${icon('book')}记账凭证</button><button class="btn" data-route="reports/pl">${icon('grid')}利润表</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '待结账期间', value: num(needClose.length) + '<small> 个</small>', icon: 'clock', color: needClose.length ? '#DC2626' : '#0E7490', foot: `已锁定 ${lockedCount} 个 · 当前 ${esc(ctx.cur)} 月末结转` })}
        ${UI.kpi({ label: '未结转损益', value: '¥' + UI.compact(unclosed), icon: 'book', color: '#7C3AED', foot: carry ? `${carry} 个期间损益仍挂账上` : '全部已清零' })}
        ${UI.kpi({ label: '本年利润 3131', value: '¥' + UI.compact(retained), icon: 'wallet', color: '#047857', foot: '已结转期间累计' })}
        ${UI.kpi({ label: '账账核对', value: balanced ? '平衡 ✓' : '不平 ✗', icon: 'check', color: balanced ? '#047857' : '#DC2626', foot: `资产 ${UI.compact(asset)} = 负债 ${UI.compact(liab)} + 权益 ${UI.compact(r2(equityAll + unclosed))}` })}
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}会计期间与结账进度</h3>
        <div class="right"><span class="muted small">按月份顺序结转;锁定期间禁止任何过账</span></div></div>
        ${UI.table(cols, periods, { pk: 'code', empty: '暂无会计期间' })}
        <div class="table-foot"><span>合计</span><span class="money">收入 ¥${money(r2(periods.reduce((s, p) => s + stats[p.code].revenue, 0)))}</span>
          <span class="money">成本费用 ¥${money(r2(periods.reduce((s, p) => s + stats[p.code].totalCost, 0)))}</span>
          <span class="strong money">净利润 ¥${money(r2(periods.reduce((s, p) => s + stats[p.code].profit, 0)))}</span></div></div>
      <div class="grid g-2-1 mt16">
        <div class="card"><div class="card-head"><h3>${icon('book')}试算平衡表 · ${esc(sel)}</h3>
          <div class="right"><span class="badge ${Math.abs(tbDr - tbCr) < .05 ? 'b-success' : 'b-danger'}">借 ${money(tbDr)} ${Math.abs(tbDr - tbCr) < .05 ? '=' : '≠'} 贷 ${money(tbCr)}</span></div></div>
          ${UI.table([
            { k: 'code', label: '科目', render: r => `<span class="mono cell-link" data-open="gl_account=${encodeURIComponent(r.code)}">${esc(r.code)}</span>` },
            { k: 'name', label: '科目名称', render: r => `<span class="cell-main">${esc(r.name)}</span><div class="cell-sub">${typeName(r.type)}</div>` },
            { k: 'debit', label: '本期借方', align: 'right', render: r => money(r.debit) },
            { k: 'credit', label: '本期贷方', align: 'right', render: r => money(r.credit) },
            { k: 'net', label: '本期净额', align: 'right', render: r => `<span class="money strong" style="${r.net < 0 ? 'color:var(--danger)' : ''}">${money(r.net)}</span>` },
          ], tbRows, { pk: 'code', empty: '该期间没有凭证' })}
          <div class="table-foot"><span>点击左侧期间可切换试算表口径</span></div></div>
        <div class="card"><div class="card-head"><h3>${icon('check')}结转分录预览 · ${esc(sel)}</h3>
          <div class="right">${canClose ? '' : '<span class="badge b-warning">当前角色无结账权限</span>'}</div></div>
          <div class="card-body">
            ${(built.lines.length ? built.lines : []).map(l => `<div class="flex" style="padding:6px 0;border-bottom:1px dashed var(--border)">
              <span class="mono small">${esc(l.acc)}</span><span class="grow small">${esc((DB.find('gl_account', l.acc) || {}).name || l.acc)}</span>
              <span class="money small" style="min-width:82px;text-align:right">${l.debit ? '借 ' + money(l.debit) : ''}</span>
              <span class="money small" style="min-width:82px;text-align:right;color:var(--text-2)">${l.credit ? '贷 ' + money(l.credit) : ''}</span></div>`).join('') || '<div class="muted small">该期间没有损益类发生额。</div>'}
            <div class="stat-row mt12"><div>结转收入<b>¥${money(stats[sel] ? stats[sel].revenue : 0)}</b></div>
              <div>结转成本费用<b>¥${money(stats[sel] ? stats[sel].totalCost : 0)}</b></div>
              <div>净利润<b>¥${money(stats[sel] ? stats[sel].profit : 0)}</b></div></div>
            <div class="flex mt12" style="gap:8px">
              ${selP.status === 'locked'
                ? `<button class="btn" data-reopen="${esc(sel)}"${canClose && sel === lockedTail() ? '' : ' disabled title="请先反结账更晚的期间"'}>${icon('unlock')}反结账 ${esc(sel)}</button>`
                : `<button class="btn primary grow" data-close-doc="${esc(sel)}"${canClose && sel === firstOpen() ? '' : ' disabled title="请先结转更早的期间;当前期间需月末结账"'}>${icon('lock')}结转 ${esc(sel)} 并锁定期间</button>`}
            </div>
            <div class="notice mt12">${icon('info')}<div><b>结账口径</b>①试算平衡 → ②按期间损益生成结转凭证(借收入类 / 贷本年利润 3131;借本年利润 / 贷成本与费用) → ③锁定期间。
              锁定后该月不可再过账、不可改库存,反结账需财务审批权限且必须倒序逐个回退。</div></div>
          </div></div>
      </div>`;
  }
  function sumBal(type) { return r2(DB.list('gl_account').filter(a => a.type === type).reduce((s, a) => s + a.balance, 0) * (type === 'asset' ? 1 : -1)); }
  function typeName(t) { return ({ asset: '资产', liability: '负债', equity: '所有者权益', revenue: '收入', cost: '成本', expense: '费用' })[t] || t; }
  function bindClose(root) {
    UI.$$('[data-tb]', root).forEach(b => b.addEventListener('click', () => { closeState.period = b.dataset.tb; APP.render(); }));
    UI.$$('[data-close-doc]', root).forEach(b => b.addEventListener('click', () => {
      const code = b.dataset.closeDoc;
      const pnl = ACT.periodPnL(code);
      UI.confirm(`将期间 <b>${esc(code)}</b> 的损益结转至「本年利润 3131」并锁定该期间:<br>
        结转收入 ¥${money(pnl.revenue)},成本与费用 ¥${money(pnl.totalCost)},本期净利润 <b>¥${money(pnl.profit)}</b>。<br>
        <span class="muted small">锁定后该期间不可再过账;如需修改需先反结账(需财务审批权限)。</span>`,
        { title: '期末损益结转', ok: '确认结账' }).then(ok => {
        if (!ok) return;
        try { const no = ACT.closePeriod(code); UI.toast(`期间 ${code} 已结账锁定${no ? ',结转凭证 ' + no : ',本期无需结转分录'}`); APP.render(); }
        catch (e) { UI.toast(e.message, 'err'); }
      });
    }));
    UI.$$('[data-reopen]', root).forEach(b => b.addEventListener('click', () => {
      const code = b.dataset.reopen;
      UI.confirm(`反结账 <b>${esc(code)}</b>:作废该期间的结转凭证并重新开放过账?<br>
        <span class="muted small">仅允许从最近一个已锁期间往前逐个回退,回退后需重新按月结转。</span>`,
        { title: '反结账', danger: true, ok: '确认反结账' }).then(ok => {
        if (!ok) return;
        try { const n = ACT.reopenPeriod(code); UI.toast(`期间 ${code} 已回退,作废 ${n} 张结转凭证`); APP.render(); }
        catch (e) { UI.toast(e.message, 'err'); }
      });
    }));
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

  /* ---------------- 信用风险 ---------------- */
  function credit() {
    const today = DB.today();
    const rows = DB.list('customers').filter(c => c.status === 'enabled')
      .map(c => ACT.creditState(c.code))
      .filter(r => r.limit > 0 || r.used > 0);
    const sorted = rows.slice().sort((a, b) => b.rate - a.rate);
    const totalLimit = r2(rows.reduce((s, r) => s + r.limit, 0));
    const totalUsed = r2(rows.reduce((s, r) => s + r.used, 0));
    const totalAr = r2(rows.reduce((s, r) => s + r.ar, 0));
    const totalOd = r2(rows.reduce((s, r) => s + r.overdue, 0));
    const watch = rows.filter(r => !r.hold && r.rate >= ACT.CREDIT_WATCH);
    const blocked = rows.filter(r => r.rate >= ACT.CREDIT_BLOCK && !r.hold);
    const frozen = rows.filter(r => r.hold);
    const aps = DB.where('approval', a => a.module === 'credit').slice().sort((a, b) => String(a.date) < String(b.date) ? 1 : -1);
    const pendingAP = aps.filter(a => a.status === 'pending');

    const band = r => r.hold ? '信用冻结' : r.rate >= 1 ? '超限(需特批)' : r.rate >= ACT.CREDIT_WATCH ? '预警(80%+)' : '健康(<80%)';
    const BANDS = ['健康(<80%)', '预警(80%+)', '超限(需特批)', '信用冻结'];
    const bandSum = BANDS.map(b => r2(rows.filter(r => band(r) === b).reduce((s, r) => s + r.used, 0)));

    const cols = [
      { k: 'name', label: '客户', render: r => `<span class="cell-link cell-main" data-open="customers=${encodeURIComponent(r.code)}">${esc(r.name)}</span><div class="cell-sub mono">${esc(r.code)} · ${esc(r.terms)}</div>` },
      { k: 'limit', label: '信用额度', align: 'right', render: r => '¥' + money(r.limit) },
      { k: 'ar', label: '应收余额', align: 'right', render: r => '<span class="money">¥' + money(r.ar) + '</span>' + (r.open ? `<div class="cell-sub">在途 ¥${money(r.open)}</div>` : '') },
      { k: 'used', label: '信用占用', align: 'right', render: r => `<span class="money strong">¥${money(r.used)}</span>` },
      { k: 'free', label: '可用额度', align: 'right', render: r => `<span class="money" style="${r.free < 0 ? 'color:var(--danger)' : r.free < r.limit * .1 ? 'color:var(--warning)' : ''}">¥${money(r.free)}</span>` },
      { k: 'rate', label: '使用率', render: r => {
        const pct = Math.min(100, Math.round(r.rate * 100));
        const cls = r.hold || r.rate >= ACT.CREDIT_BLOCK ? 'bad' : r.rate >= ACT.CREDIT_WATCH ? 'warn' : 'ok';
        return `<div class="flex" style="gap:8px"><div class="progress" style="width:76px"><i class="${cls}" style="width:${pct}%"></i></div>` +
          `<span class="small ${r.rate >= ACT.CREDIT_WATCH ? 'strong' : 'muted'}">${Math.round(r.rate * 100)}%</span></div>`;
      } },
      { k: 'overdue', label: '逾期货款', align: 'right', render: r => r.overdue > 0
        ? `<span style="color:var(--danger);font-weight:600">¥${money(r.overdue)}</span><div class="cell-sub">最长 ${r.odDays} 天 · ${r.odCount} 张</div>` : '<span class="muted">—</span>' },
      { k: 'band', label: '信用档位', render: r => UI.badge(r.hold ? 'hold' : r.rate >= ACT.CREDIT_WATCH ? 'watch' : 'normal', '') },
    ];

    return head('credit', `<button class="btn" data-route="customers">${icon('users')}客户档案</button>
      <button class="btn ${pendingAP.length ? 'primary' : ''}" data-route="approvals">${icon('check')}信用特批${pendingAP.length ? ' ' + pendingAP.length : ''}</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '授信总额', value: '¥' + UI.compact(totalLimit), icon: 'wallet', color: '#4F46E5', foot: `${rows.length} 家在册授信客户` })}
        ${UI.kpi({ label: '信用占用', value: '¥' + UI.compact(totalUsed), icon: 'receipt', color: '#0E7490', foot: `占用率 ${totalLimit ? (totalUsed / totalLimit * 100).toFixed(1) : 0}% · 应收 ¥${UI.compact(totalAr)}` })}
        ${UI.kpi({ label: '预警与超限', value: num(watch.length) + '<small> 家</small>', icon: 'warn', color: '#F59E0B', foot: `其中超限 ${blocked.length} 家,须信用特批放行` })}
        ${UI.kpi({ label: '冻结 / 逾期待收', value: num(frozen.length) + '<small> 家</small>', icon: 'lock', color: '#DC2626', foot: `逾期总额 ¥${UI.compact(totalOd)}` })}
      </div>
      <div class="grid g2 mt16">
        <div class="card"><div class="card-head"><h3>${icon('chart')}占用结构(按信用档位)</h3></div><div class="card-body">
          ${UI.hbars(BANDS.map((b, i) => ({ name: b, value: bandSum[i], color: ['#10B981', '#F59E0B', '#DC2626', '#7C2D12'][i] })), { fmt: v => '¥' + money(v) })}
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('info')}风控口径</h3></div><div class="card-body">
          <ul style="margin:0;padding-left:18px;line-height:2;color:var(--text-2);font-size:13px">
            <li><b>信用占用</b> = 未结清销售发票余额 + 已审核未开票的在途订单金额(不含税差价按价税合计计)。</li>
            <li>使用率 ≥ <b>${Math.round(ACT.CREDIT_WATCH * 100)}%</b> 标记信用预警,销售下单前提示财务复核;审核时自动写入单据备注。</li>
            <li>使用率 &gt; <b>${Math.round(ACT.CREDIT_BLOCK * 100)}%</b> 时销售订单审核被拦截,需在订单详情发起「信用特批」由财务经理裁决。</li>
            <li><b>财务停售</b>(客户档案信用状态置为冻结)后,该客户任何订单审核直接拒绝,回款后由财务解除。</li>
            <li>收款单过账会自动核销应收并回算占用;若占用回落额度内,同客户挂起的信用特批<b>自动放行</b>并审核订单。</li>
            <li>统计基准日 ${dateCN(today)};账期由客户主数据 payment_terms 决定,逾期天数按发票到期日计算。</li>
          </ul>
        </div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}客户信用占用明细</h3>
        <div class="right"><span class="muted small">按使用率倒序 · 共 ${rows.length} 家</span></div></div>
        ${UI.table(cols, sorted, { pk: 'code', empty: '暂无授信客户' })}
        <div class="table-foot"><span>总计</span><span class="money">¥${money(totalLimit)}</span><span class="money">¥${money(totalAr)}</span>
          <span class="strong money">¥${money(totalUsed)}</span><span class="money" style="color:var(--danger)">¥${money(r2(totalLimit - totalUsed))}</span>
          <span>—</span><span>—</span><span class="muted small">预警 ${watch.length} · 超限 ${blocked.length} · 冻结 ${frozen.length}</span></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('check')}信用特批动线</h3>
        <div class="right"><span class="muted small">待裁决 ${pendingAP.length} 单 · 历史 ${aps.length} 单</span></div></div>
        ${UI.table([
          { k: 'no', label: '特批单号', render: a => `<span class="mono cell-link" data-open="approval=${encodeURIComponent(a.no)}">${esc(a.no)}</span>` },
          { k: 'biz', label: '销售订单', render: a => `<span class="mono cell-link" data-open="sales_order=${encodeURIComponent(a.biz)}">${esc(a.biz)}</span>` },
          { k: 'date', label: '发起日', render: a => dateCN(a.date) },
          { k: 'applicant', label: '发起人', render: a => esc(a.applicant) },
          { k: 'amount', label: '订单金额', align: 'right', render: a => '¥' + money(a.amount) },
          { k: 'note', label: '占用快照', render: a => `<span class="small muted">${esc(a.note || '')}</span>` },
          { k: 'status', label: '结论', render: a => UI.badge(a.status) + (a.approver ? `<div class="cell-sub">${esc(a.approver)} · ${esc(a.time_done || '')}</div>` : '<div class="cell-sub">待 ' + esc(a.role || '财务经理') + '</div>') },
        ], aps, { pk: 'no', empty: '当前没有信用特批记录;审核一张超额销售订单即可触发' })}
      </div>
      ${frozen.length ? `<div class="card mt16"><div class="card-head"><h3>${icon('lock')}财务停售客户</h3></div><div class="card-body">
        ${frozen.map(r => `<div class="flex" style="gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <span class="cell-link cell-main" data-open="customers=${encodeURIComponent(r.code)}">${esc(r.name)}</span>
          <span class="muted small mono">${esc(r.code)}</span>
          <span class="muted small">占用 ¥${money(r.used)} / 额度 ¥${money(r.limit)}</span>
          <span style="color:var(--danger);font-weight:600" class="small">逾期 ¥${money(r.overdue)} · 最长 ${r.odDays} 天</span>
        </div>`).join('')}
      </div></div>` : ''}`;
  }

  /* ---------------- 批次追溯与效期风险 ---------------- */
  const traceState = { wh: '' };
  function trace() {
    const today = DB.today();
    const lots = DB.list('lot');
    const onhand = lots.filter(l => l.qty > 0);
    const inWh = wh => wh ? onhand.filter(l => l.warehouse === wh) : onhand;
    const scope = inWh(traceState.wh);
    const dleft = l => l.expire_date ? UI.days(today, l.expire_date) : null;
    const expired = scope.filter(l => l.status === 'expired');
    const frozen = scope.filter(l => l.status === 'frozen');
    const near = scope.filter(l => l.status === 'normal' && dleft(l) !== null && dleft(l) >= 0 && dleft(l) <= 90);
    const q = a => a.reduce((s, l) => s + l.qty, 0);
    const v = a => r2(a.reduce((s, l) => s + l.qty * l.unit_cost, 0));
    const avgAge = q(scope) ? Math.round(scope.reduce((s, l) => s + l.age_days * l.qty, 0) / q(scope)) : 0;
    const mvQty = DB.list('stock_movements').filter(m => m.qty);
    const mvStamped = mvQty.filter(m => m.lot).length;

    const buckets = [
      { name: '已过效期', color: '#DC2626', rows: expired },
      { name: '30 天内到期', color: '#EF4444', rows: scope.filter(l => l.status === 'normal' && dleft(l) !== null && dleft(l) <= 30) },
      { name: '31-90 天', color: '#F59E0B', rows: scope.filter(l => l.status === 'normal' && dleft(l) > 30 && dleft(l) <= 90) },
      { name: '91-180 天', color: '#0EA5E9', rows: scope.filter(l => l.status === 'normal' && dleft(l) > 90 && dleft(l) <= 180) },
      { name: '180 天以上/长期', color: '#10B981', rows: scope.filter(l => l.status === 'normal' && (dleft(l) === null || dleft(l) > 180)) },
      { name: '质量冻结', color: '#7C3AED', rows: frozen },
    ];
    const risky = scope.filter(l => l.status !== 'normal' || (dleft(l) !== null && dleft(l) <= 90)).sort((a, b) => (a.expire_date || '9999') < (b.expire_date || '9999') ? -1 : 1);
    /* 数量与库存子账逐条相等;金额是两套口径(批次入账成本 vs 移动加权平均),差异如实披露 */
    const stockRows = traceState.wh ? DB.where('stock', s => s.warehouse === traceState.wh && s.qty > 0) : DB.list('stock').filter(s => s.qty > 0);
    const stQty = stockRows.reduce((s, x) => s + x.qty, 0);
    const stVal = r2(stockRows.reduce((s, x) => s + (x.value || 0), 0));
    const lotVal = v(scope);
    const costGap = r2(lotVal - stVal);
    const shipped = {};
    DB.list('lot_tx').forEach(t => { if (t.qty < 0) shipped[t.doc] = (shipped[t.doc] || 0) - t.qty; });
    const topShip = Object.keys(shipped).map(no => ({ no, qty: shipped[no], lot: DB.find('lot', no) }))
      .filter(x => x.lot).sort((a, b) => b.qty - a.qty).slice(0, 8);
    const whRows = DB.list('warehouses').map(w => {
      const ls = inWh(w.code);
      const bs = DB.where('bins', b => b.warehouse === w.code);
      const cap = bs.reduce((s, b) => s + (b.capacity || 0), 0);
      return { code: w.code, name: w.name, kind: w.kind, lots: ls.length, qty: q(ls), value: v(ls),
        hold: q(ls.filter(l => l.status !== 'normal')), bins: bs.length, cap,
        load: cap ? q(ls) / cap * 100 : 0 };
    }).filter(r => r.lots || r.bins).sort((a, b) => b.qty - a.qty);

    return head('trace', `<button class="btn" data-scan>${icon('shield')}效期巡检</button><button class="btn primary" data-action="exportReport">${icon('download')}导出台账</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '在库批次', value: num(scope.length) + '<small> 个</small>', icon: 'layers', color: '#4F46E5', foot: `累计建档 ${num(lots.length)} 个批次` })}
        ${UI.kpi({ label: '批次口径库存', value: num(q(scope)) + '<small> 件</small>', icon: 'box', color: '#0E7490', foot: `数量与库存子账${q(scope) === stQty ? '逐条相等' : '差异 ' + num(q(scope) - stQty) + ' 件'} · 批次金额 ¥${money(lotVal)}` })}
        ${UI.kpi({ label: '不可售扣留', value: num(q(expired) + q(frozen)) + '<small> 件</small>', icon: 'lock', color: '#DC2626', foot: `过期 ${num(q(expired))} · 冻结 ${num(q(frozen))}` })}
        ${UI.kpi({ label: '临期 90 天内', value: num(q(near)) + '<small> 件</small>', icon: 'clock', color: '#F59E0B', foot: `${near.length} 个批次需优先出库` })}
      </div>
      <div class="grid g2 mt16">
        <div class="card"><div class="card-head"><h3>${icon('clock')}效期结构(按件数)</h3>
          <div class="right"><span class="muted small">平均库龄 ${avgAge} 天 · 加权</span></div></div>
          <div class="card-body">${UI.hbars(buckets.map(b => ({ name: b.name, value: q(b.rows), color: b.color })), { fmt: val => num(val) + ' 件' })}</div></div>
        <div class="card"><div class="card-head"><h3>${icon('search')}追溯入口</h3><div class="right"><span class="muted small">输入批次号直达双向追溯卡</span></div></div>
          <div class="card-body">
            <div class="flex" style="gap:8px"><input data-lotq placeholder="批次号,如 ${esc((lots[0] || {}).no || 'LOT2026-0001')}" style="flex:1">
              <button class="btn primary" data-lotgo>${icon('eye')}追溯</button></div>
            <div class="muted small mt8">留空则打开效期风险最高的批次。</div>
            <div class="section-title mt12">发出量最多的批次(召回优先级)</div>
            ${topShip.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>批次</th><th>物料</th><th class="right">累计发出</th><th>当前余量</th></tr></thead>
              <tbody>${topShip.map(x => `<tr><td class="mono cell-link" data-open="lot=${encodeURIComponent(x.no)}">${esc(x.no)}</td>
                <td>${esc(x.lot.product_name)}</td><td class="right money">${num(x.qty)}</td><td class="right money">${num(x.lot.qty)}</td></tr>`).join('')}</tbody></table></div>`
              : '<div class="muted small">暂无批次发出记录。</div>'}
          </div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('shield')}批次健康明细</h3>
        <div class="right"><span class="muted small">仓库</span><select data-wh><option value="">全部仓库</option>
          ${DB.list('warehouses').map(w => `<option value="${esc(w.code)}"${w.code === traceState.wh ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div></div>
        ${UI.table([
          { k: 'no', label: '批次', render: l => `<span class="mono cell-link cell-main" data-open="lot=${encodeURIComponent(l.no)}">${esc(l.no)}</span>
            <div class="cell-sub">${esc(SCHEMA.LOT_SOURCE[l.source] || l.source || '')}${l.parent ? ' · 分批自 ' + esc(l.parent) : ''}</div>` },
          { k: 'product_name', label: '物料', render: l => `${esc(l.product_name)}<div class="cell-sub mono">${esc(l.product)}</div>` },
          { k: 'place', label: '仓库 / 库位', render: l => `<span class="small">${esc((DB.find('warehouses', l.warehouse) || {}).name || l.warehouse)}</span>
            <div class="cell-sub mono cell-link" data-open="bins=${encodeURIComponent(l.bin)}">${esc(l.bin || '—')}</div>` },
          { k: 'qty', label: '余量', align: 'right', render: l => `<span class="money strong">${num(l.qty)}</span><div class="cell-sub">入库 ${num(l.qty_in)}</div>` },
          { k: 'value', label: '批次金额', align: 'right', render: l => '¥' + money(r2(l.qty * l.unit_cost)) },
          { k: 'age', label: '库龄', align: 'right', render: l => num(l.age_days) + ' 天' },
          { k: 'exp', label: '到期日', render: l => l.expire_date ? `${dateCN(l.expire_date)}<div class="cell-sub" style="color:${dleft(l) < 0 ? 'var(--danger)' : dleft(l) <= 90 ? 'var(--warning)' : 'inherit'}">${dleft(l) < 0 ? '已过 ' + (-dleft(l)) + ' 天' : '剩 ' + dleft(l) + ' 天'}</div>` : '<span class="muted">长期有效</span>' },
          { k: 'status', label: '状态', render: l => UI.badge(l.status) + (l.hold_note ? `<div class="cell-sub">${esc(l.hold_note)}</div>` : '') },
        ], risky, { pk: 'no', empty: traceState.wh ? '该仓库暂无临期、过期或冻结批次' : '当前没有需要关注的效期或质量风险批次' })}
        <div class="table-foot"><span>风险批次 ${risky.length} 个</span><span class="money">${num(q(risky))} 件</span><span class="money strong">¥${money(v(risky))}</span></div></div>
      <div class="card mt16"><div class="card-head"><h3>${icon('home')}分仓批次与库位负载</h3><div class="right"><span class="muted small">占用率 = 批次件数 / 库位标准容量</span></div></div>
        ${UI.table([
          { k: 'name', label: '仓库', render: w => `<span class="cell-main cell-link" data-open="warehouses=${encodeURIComponent(w.code)}">${esc(w.name)}</span>
            <div class="cell-sub mono">${esc(w.code)} · ${esc((SCHEMA.WH_KIND[w.kind] || w.kind))}</div>` },
          { k: 'lots', label: '在库批次', align: 'right', render: w => num(w.lots) },
          { k: 'qty', label: '件数', align: 'right', render: w => `<span class="money strong">${num(w.qty)}</span>` },
          { k: 'value', label: '批次金额', align: 'right', render: w => '¥' + money(w.value) },
          { k: 'hold', label: '不可售', align: 'right', render: w => w.hold ? `<span class="badge b-danger">${num(w.hold)} 件</span>` : '<span class="muted">—</span>' },
          { k: 'bins', label: '库位数', align: 'right', render: w => num(w.bins) },
          { k: 'load', label: '容量占用', render: w => `<div class="flex" style="gap:8px"><div class="progress" style="width:120px"><i class="${w.load > 85 ? 'bad' : w.load > 65 ? 'warn' : 'ok'}" style="width:${Math.min(100, w.load).toFixed(1)}%"></i></div>
            <span class="small muted">${w.load.toFixed(1)}% / ${num(w.cap)} 件</span></div>` },
        ], whRows, { pk: 'code', empty: '暂无仓库数据' })}</div>
      <div class="card mt16"><div class="card-head"><h3>${icon('info')}追溯与召回口径</h3></div><div class="card-body">
        <ul style="margin:0;padding-left:18px;line-height:2;color:var(--text-2);font-size:13px">
          <li>批次 = 一笔入库流水建一个批次,是最小质量单元;跨仓调拨若仍有结余会拆出子批次并回指源批次。</li>
          <li>分配规则:<b>${esc(SCHEMA.ISSUE_RULES.fefo)}</b> —— 近效期先出,其次按入库时序;冻结与已过效期批次不进入可发池。</li>
          <li>金额口径:批次只承载<b>数量与流向</b>。Σ批次余量 = Σ库存现量(${num(q(scope))} 件 ${q(scope) === stQty ? '✓' : '✗ 差 ' + num(q(scope) - stQty) + ' 件'}),出库成本按该仓移动加权平均结转,总账 1405 与库存子账始终同源(¥${money(stVal)})。批次金额 ¥${money(lotVal)} 按各批次入账成本累计,与加权平均口径相差 <b>¥${money(Math.abs(costGap))}</b>( ${(stVal ? Math.abs(costGap) / stVal * 100 : 0).toFixed(2)}%),属成本口径差,仅作管理会计参考,不进总账。</li>
          <li>召回三步:①冻结批次(可用量即时剔除)→ ②按流向清单通知客户并开具红字发票 → ③同物料其他批次与未结订单改派。</li>
          <li>库区规则:正品在存储区与拣货区之间移位;待检与残次批次只能留在隔离区;跨仓移动必须走调拨单。</li>
          <li>巡检覆盖:${num(mvQty.length)} 笔带数量的出入库流水中 ${num(mvStamped)} 笔可下钻到批次(${(mvQty.length ? mvStamped / mvQty.length * 100 : 100).toFixed(1)}%)。</li>
        </ul></div></div>`;
  }

  function bindTrace(root) {
    const sel = UI.$('[data-wh]', root);
    if (sel) sel.addEventListener('change', () => { traceState.wh = sel.value; APP.render(); });
    const sc = UI.$('[data-scan]', root);
    if (sc) sc.addEventListener('click', () => {
      try {
        const hit = ACT.LOT.scan();
        DB.log('库存管理', '批次效期巡检', '', `${hit.length} 个批次转为已过效期并从可用量剔除`);
        UI.toast(hit.length ? `巡检完成:${hit.length} 个批次已过效期,可用量已同步剔除` : '巡检完成:未发现新的过期批次');
        APP.render();
      } catch (e) { UI.toast(e.message, 'err'); }
    });
    const go = () => {
      const v = (UI.$('[data-lotq]', root) || {}).value;
      const no = (v || '').trim();
      const lot = no ? DB.find('lot', no) : DB.list('lot').filter(l => l.qty > 0).sort((a, b) => (a.expire_date || '9999') < (b.expire_date || '9999') ? -1 : 1)[0];
      if (no && !lot) { UI.toast('批次不存在:' + no, 'err'); return; }
      if (!lot) { UI.toast('暂无可追溯批次', 'warn'); return; }
      DOC.open('lot', lot.no);
    };
    const gb = UI.$('[data-lotgo]', root); if (gb) gb.addEventListener('click', go);
    const gi = UI.$('[data-lotq]', root);
    if (gi) gi.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
  }

  /* ---------------- 缺料与长周期分析 ---------------- */
  const shortState = { wh: '', src: '' };

  /** 近 90 天真实出库速率(调拨不算消耗):把抽象的「可用量」翻译成「还能撑几天」 */
  function burnRate(warehouse) {
    const since = DB.addDays(DB.today(), -90);
    const out = {};
    DB.list('stock_movements').forEach(m => {
      if (!(m.qty < 0) || m.type === 'transfer' || String(m.date) < since) return;
      if (warehouse && m.warehouse !== warehouse) return;
      out[m.product] = (out[m.product] || 0) - m.qty;
    });
    return out;
  }

  /** 实时重算缺料:与 MRP 引擎同一口径(净需求 = 未履约需求 + 安全库存 − 可用量),但不落单 */
  function shortageData() {
    const today = DB.today(), burn = burnRate(shortState.wh);
    const gross = {};
    ACT.MRP.demand({ source: 'so_open', horizon: 60, warehouse: shortState.wh })
      .forEach(d => { gross[d.product] = d; });
    const runs = DB.list('mrp_run').sort((a, b) => String(b.no).localeCompare(String(a.no)));
    const last = runs[0] || null;
    const sugg = {};
    if (last) DB.lines('mrp_lines', last.no).forEach(l => { sugg[l.product] = l; });
    const rows = DB.list('products').filter(p => p.status === 'enabled' && (!shortState.src || (p.mrp_src || 'buy') === shortState.src))
      .map(p => {
        const s = ACT.MRP.supply(p.code, shortState.wh);
        const bm = ACT.BOM.of(p.code);
        const mode = p.mrp_src || (bm ? 'make' : 'buy');
        const g = gross[p.code] || { qty: 0, need_date: '', from: [] };
        const safety = +p.safety_qty || 0;
        const net = Math.max(0, r2(g.qty + safety - s.avail));
        const lead = Math.max(1, +p.lead_time || (mode === 'buy' ? 14 : 10));
        const daily = (burn[p.code] || 0) / 90;
        const m = sugg[p.code];
        return { code: p.code, name: p.name, category: p.category, mode, bm, s, safety, gross: g.qty,
          from: (g.from || []).join('、'), need_date: g.need_date, net, lead, moq: +p.moq || 0,
          lot: net > 0 ? ACT.MRP.lot(net, +p.moq || 0) : 0,
          order_by: g.need_date ? DB.addDays(g.need_date, -lead) : '',
          days: daily > 0 ? s.avail / daily : null, burn90: burn[p.code] || 0,
          price: ACT.MRP.price(p.code), fill: r2(net * ACT.MRP.price(p.code)),
          used_by: ACT.BOM.whereUsed(p.code).length, run_qty: m ? (+m.suggest_qty || 0) : 0, run_rel: m ? m.release : '' };
      });
    const short = rows.filter(r => r.net > 0)
      .sort((a, b) => String(a.order_by || '9999').localeCompare(String(b.order_by || '9999')) || b.fill - a.fill);
    return { today, rows, short, runs, last,
      blind: rows.filter(r => r.mode !== 'buy' && !r.bm),
      made: rows.filter(r => r.mode !== 'buy'),
      late: short.filter(r => r.need_date && r.need_date < today),
      longLead: short.filter(r => r.lead >= 21),
      keyShort: DB.list('bom_lines').filter(l => l.key_part === 'y' && short.some(x => x.code === l.product)) };
  }

  function shortage() {
    const d = shortageData();
    const fillAmount = r2(d.short.reduce((s, r) => s + r.fill, 0));
    const shortQty = r2(d.short.reduce((s, r) => s + r.net, 0));
    const runRows = d.last ? DB.lines('mrp_lines', d.last.no) : [];
    const runNet = r2(runRows.reduce((s, l) => s + (+l.net_qty || 0), 0));

    return head('shortage', `<button class="btn primary" data-action="exportReport">${icon('download')}导出缺料清单</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '缺料物料', value: num(d.short.length) + '<small> 项</small>', icon: 'warn', color: '#DC2626',
          foot: `净缺口 ${num(shortQty)} 件 · 补料参考 ¥${money(fillAmount)}` })}
        ${UI.kpi({ label: '需求日已过', value: num(d.late.length) + '<small> 项</small>', icon: 'clock', color: '#EA580C',
          foot: d.late.length ? '需加急下单或与客户改期' : '未履约需求均在可交付窗口内' })}
        ${UI.kpi({ label: '长周期件 ≥21 天', value: num(d.longLead.length) + '<small> 项</small>', icon: 'truck', color: '#0E7490',
          foot: '提前期越长越要提前锁定,避免评审后追单' })}
        ${UI.kpi({ label: '计划盲区', value: num(d.blind.length) + '<small> 项</small>', icon: 'layers', color: '#7C3AED',
          foot: `自制/委外 ${num(d.made.length)} 项,${d.blind.length ? '其中 ' + num(d.blind.length) + ' 项无生效清单' : '清单覆盖完整'}` })}
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('warn')}缺料明细(实时重算)</h3>
        <div class="right"><span class="muted small">仓库</span>
          <select data-swh><option value="">全部仓库</option>${DB.list('warehouses').map(w => `<option value="${esc(w.code)}"${w.code === shortState.wh ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
          <span class="muted small" style="margin-left:10px">供应方式</span>
          <select data-ssrc><option value="">全部</option>${Object.keys(SCHEMA.MRP_SRC).map(k => `<option value="${k}"${k === shortState.src ? ' selected' : ''}>${esc(SCHEMA.MRP_SRC[k])}</option>`).join('')}</select></div></div>
      <div class="card-body"><div class="notice">${icon('info')}<div>可用量 = 现量 − 销售占用 + 在途采购 + 在制委外;净缺口 = 未履约需求 + 安全库存 − 可用量,与 MRP 运算同一口径。
        本表每次打开都按当前台账<b>即时重算</b>,不落单据、不产生流水;真正下单请以 ${d.last ? `<span class="mono cell-link" data-open="mrp_run=${encodeURIComponent(d.last.no)}">${esc(d.last.no)}</span>` : '一次 MRP 运算'}的建议为准。</div></div></div>
      ${UI.table([
        { k: 'name', label: '物料', render: r => `<span class="cell-link cell-main" data-open="products=${encodeURIComponent(r.code)}">${esc(r.name)}</span>
          <div class="cell-sub mono">${esc(r.code)} · ${(SCHEMA.entities.products.fields.category.opts || {})[r.category] || r.category || ''}</div>` },
        { k: 'mode', label: '供应方式', render: r => `<span class="badge ${r.mode === 'buy' ? 'b-info' : r.mode === 'out' ? 'b-purple' : 'b-success'}">${esc(SCHEMA.MRP_SRC[r.mode])}</span>
          ${r.bm ? `<div class="cell-sub mono"><span class="cell-link" data-open="bom=${encodeURIComponent(r.bm.no)}">${esc(r.bm.no)}</span></div>` : '<div class="cell-sub muted">无生效清单</div>'}` },
        { k: 'avail', label: '可用量', align: 'right', render: r => `<span class="money strong">${num(r.s.avail)}</span>
          <div class="cell-sub">现 ${num(r.s.on_hand)} · 占 ${num(r.s.reserved)} · 途 ${num(r.s.on_order)}</div>` },
        { k: 'gross', label: '未履约需求', align: 'right', render: r => r.gross ? `<span class="money">${num(r.gross)}</span><div class="cell-sub">${esc(r.from || '销售订单')}</div>` : '<span class="muted">—</span>' },
        { k: 'safety', label: '安全库存', align: 'right', render: r => r.safety ? `<span class="money">${num(r.safety)}</span>` : '<span class="muted">—</span>' },
        { k: 'net', label: '净缺口', align: 'right', render: r => `<b style="color:var(--danger)" class="money">${num(r.net)}</b>
          <div class="cell-sub">起订 ${num(r.moq)} · 建议补 ${num(r.lot)}</div>` },
        { k: 'days', label: '可用天数', align: 'right', render: r => r.days === null ? '<span class="muted" title="近 90 天无出库记录">无消耗</span>'
          : `<span class="money">${r.days.toFixed(1)}</span><div class="cell-sub">近 90 天出 ${num(r.burn90)}</div>` },
        { k: 'order_by', label: '最晚下单日', render: r => r.order_by
          ? `<span class="mono" style="${r.order_by < d.today ? 'color:var(--danger);font-weight:600' : ''}">${esc(r.order_by)}</span><div class="cell-sub">提前期 ${num(r.lead)} 天</div>`
          : `<span class="muted">—</span>` },
        { k: 'fill', label: '补料金额', align: 'right', render: r => `<span class="money">¥${money(r.fill)}</span><div class="cell-sub">参考价 ¥${money(r.price)}</div>` },
        { k: 'used_by', label: '清单引用', align: 'right', render: r => r.used_by ? `<span class="tag">${num(r.used_by)} 张</span>` : '<span class="muted">—</span>' },
        { k: 'run_rel', label: '上次运算', render: r => !d.last ? '<span class="muted">未运算</span>'
          : r.run_qty ? `<span class="money">${num(r.run_qty)}</span>${r.run_rel ? `<div class="cell-sub mono"><span class="cell-link" data-open="${r.run_rel.indexOf('OS') === 0 ? 'os_order' : 'purchase_req'}=${encodeURIComponent(r.run_rel)}">${esc(r.run_rel)}</span></div>` : '<div class="cell-sub muted">未下达</div>'}`
          : '<span class="muted small">覆盖,未建议</span>' },
      ], d.short, { pk: 'code', empty: '当前没有缺料物料:可用量与在途已全部覆盖未履约需求和安全库存' })}
      </div>
      <div class="grid g2 mt16">
        <div class="card"><div class="card-head"><h3>${icon('clock')}长周期与关键件风险</h3>
          <div class="right"><span class="muted small">提前期降序 · 仅列缺料项</span></div></div>
          ${UI.table([
            { k: 'name', label: '物料', render: r => `<span class="cell-link cell-main" data-open="products=${encodeURIComponent(r.code)}">${esc(r.name)}</span>
              <div class="cell-sub mono">${esc(r.code)}</div>` },
            { k: 'lead', label: '提前期', align: 'right', render: r => `<span class="money strong">${num(r.lead)} 天</span>` },
            { k: 'net', label: '净缺口', align: 'right', render: r => `<span class="money" style="color:var(--danger)">${num(r.net)}</span>` },
            { k: 'key', label: '属性', render: r => {
              const tags = [];
              if (r.lead >= 21) tags.push('<span class="badge b-warning">长周期</span>');
              const kp = d.keyShort.filter(x => x.product === r.code).length;
              if (kp) tags.push(`<span class="badge b-danger">关键件 ×${kp}</span>`);
              if (!tags.length) tags.push('<span class="muted small">常规</span>');
              return tags.join('');
            } },
          ], d.longLead.concat(d.short.filter(r => r.lead < 21 && d.keyShort.some(x => x.product === r.code)))
              .filter((r, i, a) => a.findIndex(x => x.code === r.code) === i).slice(0, 10),
            { pk: 'code', empty: '缺料项中没有长周期或关键件' })}
        </div>
        <div class="card"><div class="card-head"><h3>${icon('layers')}清单覆盖与下展深度</h3>
          <div class="right"><span class="muted small">自制/委外件 ${num(d.made.length)} 项</span></div></div>
          ${UI.table([
            { k: 'name', label: '物料', render: r => `<span class="cell-link cell-main" data-open="products=${encodeURIComponent(r.code)}">${esc(r.name)}</span>
              <div class="cell-sub mono">${esc(r.code)}</div>` },
            { k: 'mode', label: '供应方式', render: r => `<span class="badge ${r.mode === 'out' ? 'b-purple' : 'b-success'}">${esc(SCHEMA.MRP_SRC[r.mode])}</span>` },
            { k: 'bm', label: '生效清单', render: r => r.bm ? `<span class="mono cell-link" data-open="bom=${encodeURIComponent(r.bm.no)}">${esc(r.bm.no)}</span>
              <div class="cell-sub">${esc(r.bm.name)} · ${num(r.bm.lines_cnt)} 行</div>` : '<span class="badge b-warning">缺清单</span>' },
            { k: 'gap', label: '计划影响', render: r => r.bm ? '<span class="muted small">子件需求随父件建议下展</span>'
              : `<span class="small" style="color:var(--danger)">MRP 当作外购件直接生成采购申请,子件用料无法展开</span>` },
          ], d.made, { pk: 'code', empty: '当前筛选范围内没有自制或委外物料' })}
        </div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('zap')}最近运算与实时口径差异</h3>
        <div class="right">${d.last ? `<button class="btn sm" data-open="mrp_run=${encodeURIComponent(d.last.no)}">${icon('eye')}查看 ${esc(d.last.no)}</button>` : ''}
          <button class="btn sm primary" data-new-doc="mrp_run">${icon('zap')}发起新一轮运算</button></div></div>
      <div class="card-body">${d.last ? `<div class="stat-row">
          <div>运算单号<b class="mono">${esc(d.last.no)}</b></div><div>运算日期<b>${dateCN(d.last.date)}</b></div>
          <div>需求口径<b>${esc(SCHEMA.MRP_DEMAND[d.last.source] || d.last.source)}</b></div><div>计划周期<b>${num(d.last.horizon)} 天</b></div>
          <div>建议行<b>${num(d.last.rows_cnt)}</b></div><div>缺料行<b>${num(d.last.shortage_cnt)}</b></div>
          <div>运算时净需求<b>${num(runNet)}</b></div><div>当前实时净缺口<b>${num(shortQty)}</b></div></div>
        <div class="muted small mt8">差异来自运算之后新审核的订单、收货入库与占用变化 —— 计划单是快照,缺料表是现值。${d.last.status === 'computed' ? '本轮建议尚有未下达行,下达后仍是草稿申请单,需采购审批才生效。' : '本轮建议已全部处理或归档。'}</div>`
        : `<div class="muted small">尚未做过计划运算。可在「计划管理 / MRP 计划运算」按未履约订单、安全库存或人工需求起算,运算只读台账、不改库存与凭证。</div>`}</div>
      </div>`;
  }

  function bindShortage(root) {
    const wh = UI.$('[data-swh]', root);
    if (wh) wh.addEventListener('change', () => { shortState.wh = wh.value; APP.render(); });
    const src = UI.$('[data-ssrc]', root);
    if (src) src.addEventListener('change', () => { shortState.src = src.value; APP.render(); });
  }

  /* ---------------- 价格策略与毛利 ---------------- */
  const priceState = { kind: '' };
  const KIND_COLOR = { customer: '#4F46E5', promo: '#DB2777', channel: '#0EA5E9', category: '#F59E0B', tier: '#10B981', std: '#94A3B8' };

  /** 近半年成交行的价格重放:每行按成交日重走取价阶梯,与价目表报价、成本红线比对 */
  function priceReplay() {
    const out = [];
    DB.list('sales_order').forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;
      DB.lines('so_lines', o.no).forEach(l => {
        if (!l.product || !l.qty) return;
        const p = DB.find('products', l.product) || {};
        const q = ACT.PRICE.pick({ customer: o.customer, product: l.product, qty: l.qty, date: o.date, channel: o.channel, warehouse: o.warehouse });
        const net = r2((l.price || 0) * (1 - (l.discount || 0)));
        out.push({ o, l, q, p, net, qty: l.qty, std: r2(p.price || 0), cost: q.cost, floor: q.floor,
          off: r2(net - (p.price || 0)), offRate: p.price ? net / p.price - 1 : 0, give: r2((net - (p.price || 0)) * l.qty),
          margin: net > 0 ? (net - q.cost) / net : 0, below: net > 0 && net < q.floor,
          matched: q.listNo ? Math.abs(net - q.net) < 0.005 : false });
      });
    });
    return out;
  }

  function pricing() {
    const today = DB.today();
    const lists = DB.list('price_list');
    const active = ACT.PRICE.lists(today);
    const cnt = st => lists.filter(pl => pl.status === st).length;
    const rows = priceReplay();
    const hit = rows.filter(x => x.q.listNo).length;
    const give = r2(rows.reduce((s, x) => s + x.give, 0));
    const sold = r2(rows.reduce((s, x) => s + x.std * x.qty, 0));
    const below = rows.filter(x => x.below);
    const apList = DB.where('approval', a => a.module === 'price_change' || a.module === 'price_list');
    /* 草稿订单的红线拦截:价格闸门尚未放行,是报表上唯一可执行的待办 */
    const blocked = [];
    DB.where('sales_order', o => o.status === 'draft').forEach(o => {
      ACT.PRICE.guard(o, DB.lines('so_lines', o.no)).forEach(v => blocked.push({ o, v }));
    });
    const bandOf = (r, bands) => bands.find(b => b.test(r)) || bands[bands.length - 1];
    const offBands = [
      { name: '原价及以上(溢价)', test: r => r >= 0, color: '#0E7490' },
      { name: '让利 0-5%', test: r => r < 0 && r >= -0.05, color: '#10B981' },
      { name: '让利 5-10%', test: r => r < -0.05 && r >= -0.10, color: '#F59E0B' },
      { name: '让利 10-20%', test: r => r < -0.10 && r >= -0.20, color: '#EF4444' },
      { name: '让利 20% 以上', test: r => r < -0.20, color: '#DC2626' }];
    const gmBands = [
      { name: '亏本成交 <0%', test: r => r < 0, color: '#DC2626' },
      { name: '0-5% 红线区内', test: r => r >= 0 && r < 0.05, color: '#EF4444' },
      { name: '5-10%', test: r => r >= 0.05 && r < 0.10, color: '#F59E0B' },
      { name: '10-20%', test: r => r >= 0.10 && r < 0.20, color: '#10B981' },
      { name: '20% 以上', test: r => r >= 0.20, color: '#0E7490' }];
    const tally = (bands, get) => {
      const m = {};
      rows.forEach(x => { const b = bandOf(get(x), bands); m[b.name] = m[b.name] || { b, n: 0, amt: 0 }; m[b.name].n++; m[b.name].amt += x.net * x.qty; });
      return bands.filter(b => m[b.name]).map(b => ({ name: `${b.name}(${m[b.name].n} 行)`, value: r2(m[b.name].amt), color: b.color }));
    };
    const srcKinds = {};
    rows.forEach(x => { const k = x.q.kind; srcKinds[k] = (srcKinds[k] || 0) + 1; });
    const srcBars = Object.keys(srcKinds).sort((a, b) => srcKinds[b] - srcKinds[a])
      .map(k => ({ name: (SCHEMA.entities.price_list.fields.kind.opts[k] || k), key: k, value: srcKinds[k], color: KIND_COLOR[k] || '#94A3B8' }));

    /* 客户价格离散度:同一客户实际净价对标准售价的偏离,以及最深让利行 */
    const byCust = {};
    rows.forEach(x => {
      const c = byCust[x.o.customer] || (byCust[x.o.customer] = { code: x.o.customer, name: x.o.customer_name, n: 0, amt: 0, std: 0, give: 0, gm: 0, hit: 0, deep: 1, low: 0 });
      c.n++; c.amt += x.net * x.qty; c.std += x.std * x.qty; c.give += x.give; c.hit += x.q.listNo ? 1 : 0;
      c.gm += (x.net - x.cost) * x.qty;
      if (x.offRate < c.deep) { c.deep = x.offRate; c.low = x.net; }
    });
    const custRows = Object.values(byCust).map(c => ({ ...c, offRate: c.std ? c.give / c.std : 0, margin: c.amt ? c.gm / c.amt : 0,
      own: (lists.find(pl => pl.customer === c.code && pl.status === 'approved') || {}).no || '' }))
      .sort((a, b) => a.offRate - b.offRate);

    const plRows = lists.slice().sort((a, b) => (a.priority || 50) - (b.priority || 50) || String(a.no).localeCompare(String(b.no)))
      .filter(pl => !priceState.kind || pl.kind === priceState.kind)
      .map(pl => ({ pl, im: ACT.PRICE.listImpact(pl), cited: DB.list('so_lines').filter(l => l.list_no === pl.no).length,
        rank: (ACT.PRICE.WEIGHT[pl.kind] || 9) * 100 + (pl.priority || 50) }));

    return head('pricing', `<button class="btn" data-route="price_list">${icon('wallet')}价目表</button><button class="btn primary" data-action="exportReport">${icon('download')}导出价格明细</button>`) + `
      <div class="grid g4">
        ${UI.kpi({ label: '生效价目表', value: num(active.length) + '<small> 张</small>', icon: 'wallet', color: '#4F46E5',
          foot: `共 ${num(lists.length)} 张 · 草稿 ${cnt('draft')} / 待核准 ${cnt('pending')} / 驳回 ${cnt('rejected')} · 价格行 ${num(lists.reduce((s, pl) => s + DB.lines('pl_lines', pl.no).length, 0))}` })}
        ${UI.kpi({ label: '价目表覆盖率', value: (rows.length ? (hit / rows.length * 100).toFixed(1) : '0.0') + '<small> %</small>', icon: 'check', color: '#047857',
          foot: `近半年 ${num(rows.length)} 行成交中 ${num(hit)} 行命中价目表,其余回落标准售价` })}
        ${UI.kpi({ label: '对标准售价让利', value: '¥' + UI.compact(Math.abs(give)), icon: 'trendDown', color: give < 0 ? '#DC2626' : '#047857',
          foot: `整体偏离 ${(sold ? give / sold * 100 : 0).toFixed(2)}% · 按未税净额 ¥${UI.compact(rows.reduce((s, x) => s + x.net * x.qty, 0))} 结算` })}
        ${UI.kpi({ label: '跌破红线成交', value: num(below.length) + '<small> 行</small>', icon: 'shield', color: below.length ? '#DC2626' : '#0E7490',
          foot: `草稿待裁决 ${num(blocked.length)} 行 · 改价与价格策略审批 ${num(apList.length)} 单` })}
      </div>
      <div class="grid g-2-1 mt16">
        <div class="card"><div class="card-head"><h3>${icon('pie')}让利与毛利结构</h3><div class="right"><span class="muted small">按未税成交额分布</span></div></div>
          <div class="card-body"><div class="section-title">相对标准售价的折让带</div>
            ${UI.hbars(tally(offBands, x => x.offRate), { fmt: v => '¥' + money(v) })}
            <div class="section-title mt16">成交毛利率带</div>
            ${UI.hbars(tally(gmBands, x => x.margin), { fmt: v => '¥' + money(v) })}
            <div class="muted small mt8">毛利率按成交时点该仓移动加权成本计算;红线价 = 成本 ×(1 + 价目表红线毛利率),跌破红线的行须经改价审批才允许审核。</div></div></div>
        <div class="card"><div class="card-head"><h3>${icon('layers')}取价阶梯命中分布</h3><div class="right"><span class="muted small">引擎重放</span></div></div>
          <div class="card-body">${UI.hbars(srcBars, { fmt: v => num(v) + ' 行', links: 'price_list' })}
            <div class="divider"></div>
            <div class="muted small">权重顺序:客户专属 → 促销 → 渠道 → 类目 → 阶梯 → 标准售价;同级冲突按价目表优先级数值小者优先。</div>
            <div class="section-title mt12">改价与价格策略审批</div>
            ${apList.length ? apList.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8).map(a => `<div class="flex" style="padding:7px 0;border-bottom:1px dashed var(--border)">
              <span class="mono cell-link" data-open="approval=${encodeURIComponent(a.no)}">${esc(a.no)}</span>
              <span class="grow small muted">${esc(a.title)}</span><span class="money small">¥${money(a.amount)}</span>${UI.badge(a.status)}</div>`).join('')
              : '<div class="muted small">暂无改价申请。</div>'}
          </div></div>
      </div>
      <div class="card mt16"><div class="card-head"><h3>${icon('users')}客户价格离散度</h3>
        <div class="right"><span class="muted small">偏离越负,该客户拿到的价格越深</span></div></div>
        ${UI.table([
          { k: 'name', label: '客户', render: c => `<span class="cell-main cell-link" data-open="customers=${encodeURIComponent(c.code)}">${esc(c.name)}</span>
            <div class="cell-sub mono">${esc(c.code)}${c.own ? ' · 专属表 ' + esc(c.own) : ''}</div>` },
          { k: 'n', label: '成交行', align: 'right', render: c => num(c.n) },
          { k: 'amt', label: '未税成交额', align: 'right', render: c => '¥' + money(c.amt) },
          { k: 'offRate', label: '对标准售价', align: 'right', render: c => `<span style="color:${c.offRate < -0.08 ? 'var(--danger)' : 'var(--text)'}">${(c.offRate * 100).toFixed(2)}%</span>` },
          { k: 'give', label: '让利额', align: 'right', render: c => '¥' + money(c.give) },
          { k: 'margin', label: '毛利率', align: 'right', render: c => `<span style="color:${c.margin < ACT.PRICE.FLOOR ? 'var(--danger)' : 'inherit'}">${(c.margin * 100).toFixed(1)}%</span>` },
          { k: 'hit', label: '价目表命中', align: 'right', render: c => `${num(c.hit)} / ${num(c.n)}` },
          { k: 'deep', label: '最深单行折让', align: 'right', render: c => `${(c.deep * 100).toFixed(1)}%<div class="cell-sub">净价 ¥${money(c.low)}</div>` },
        ], custRows.slice(0, 14), { pk: 'code', empty: '暂无成交数据' })}
        <div class="table-foot"><span>共 ${num(custRows.length)} 家客户有成交</span><span>整体偏离 ${(sold ? give / sold * 100 : 0).toFixed(2)}%</span><span class="money strong">让利 ¥${money(give)}</span></div></div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}价格策略台账</h3>
        <div class="right"><span class="muted small">类型</span><select data-pkind><option value="">全部</option>
          ${Object.keys(SCHEMA.entities.price_list.fields.kind.opts).map(k => `<option value="${k}"${priceState.kind === k ? ' selected' : ''}>${esc(SCHEMA.entities.price_list.fields.kind.opts[k])}</option>`).join('')}</select></div></div>
        ${UI.table([
          { k: 'no', label: '价目表', render: x => `<span class="cell-main mono cell-link" data-open="price_list=${encodeURIComponent(x.pl.no)}">${esc(x.pl.no)}</span>
            <div class="cell-sub">${esc(x.pl.name)}</div>` },
          { k: 'kind', label: '类型', render: x => `<span class="badge b-neutral">${esc(SCHEMA.entities.price_list.fields.kind.opts[x.pl.kind] || x.pl.kind)}</span>
            <div class="cell-sub">${x.pl.customer ? esc((DB.find('customers', x.pl.customer) || {}).name || x.pl.customer) : x.pl.channel ? esc(SCHEMA.entities.price_list.fields.channel.opts[x.pl.channel] || '') : x.pl.category ? esc(x.pl.category) : '全渠道'}</div>` },
          { k: 'rank', label: '取价权重', align: 'right', render: x => num(x.rank) + (active.indexOf(x.pl) >= 0 ? '<div class="cell-sub" style="color:var(--success)">今日参与取价</div>' : '<div class="cell-sub muted">今日不参与</div>') },
          { k: 'win', label: '有效期', render: x => `${dateCN(x.pl.valid_from)} ~ ${x.pl.valid_to ? dateCN(x.pl.valid_to) : '长期'}<div class="cell-sub muted small">${x.pl.valid_to && today > x.pl.valid_to ? '已失效 ' + UI.days(x.pl.valid_to, today) + ' 天' : x.pl.valid_to ? '剩 ' + UI.days(today, x.pl.valid_to) + ' 天' : ''}</div>` },
          { k: 'lines', label: '价格行', align: 'right', render: x => num(x.im.lines) },
          { k: 'floor', label: '红线毛利率', align: 'right', render: x => (((x.pl.margin_floor == null ? ACT.PRICE.FLOOR : x.pl.margin_floor)) * 100).toFixed(1) + '%' },
          { k: 'give', label: '让利测算', align: 'right', render: x => `<span style="color:${x.im.total < 0 ? 'var(--danger)' : 'inherit'}">¥${money(x.im.total)}</span>
            <div class="cell-sub muted small">按近半年实际销量</div>` },
          { k: 'cited', label: '引用行', align: 'right', render: x => num(x.cited) },
          { k: 'status', label: '状态', render: x => UI.badge(x.pl.status) + (x.pl.ap ? `<div class="cell-sub mono cell-link" data-open="approval=${encodeURIComponent(x.pl.ap)}">${esc(x.pl.ap)}</div>` : '') },
        ], plRows, { pk: 'no', empty: '没有该类型的价目表' })}</div>
      <div class="card mt16"><div class="card-head"><h3>${icon('shield')}价格闸门待裁决明细</h3>
        <div class="right"><span class="muted small">草稿订单跌破毛利红线,审核将被拦截</span></div></div>
        ${blocked.length ? UI.table([
          { k: 'no', label: '销售订单', render: x => `<span class="cell-main mono cell-link" data-open="sales_order=${encodeURIComponent(x.o.no)}">${esc(x.o.no)}</span>
            <div class="cell-sub">${esc(x.o.customer_name || '')}</div>` },
          { k: 'p', label: '物料', render: x => `${esc(x.v.product_name)}<div class="cell-sub mono">${esc(x.v.product)}</div>` },
          { k: 'qty', label: '数量', align: 'right', render: x => num(x.v.qty) },
          { k: 'net', label: '成交净价', align: 'right', render: x => `<span class="money" style="color:var(--danger);font-weight:650">¥${money(x.v.net)}</span>` },
          { k: 'floor', label: '红线价', align: 'right', render: x => '¥' + money(x.v.floor) },
          { k: 'gap', label: '缺口', align: 'right', render: x => '¥' + money(x.v.gap) },
          { k: 'cost', label: '成本', align: 'right', render: x => '¥' + money(x.v.cost) },
          { k: 'ap', label: '改价审批', render: x => x.o.price_ap ? `<span class="mono cell-link" data-open="approval=${encodeURIComponent(x.o.price_ap)}">${esc(x.o.price_ap)}</span>${UI.badge((DB.find('approval', x.o.price_ap) || {}).status)}` : '<span class="badge b-warning">待发起</span>' },
        ], blocked, { pk: 'no', empty: '' }) : `<div class="card-body">${UI.emptyBox('没有待裁决的低价行', '所有草稿订单的成交价均在毛利红线之上')}</div>`}</div>`;
  }

  function bindPricing(root) {
    const sel = UI.$('[data-pkind]', root);
    if (sel) sel.addEventListener('change', () => { priceState.kind = sel.value; APP.go('reports/pricing'); });
  }

  function render(key) {
    if (key === 'ar' || key === 'ap') return aging(key);
    if (key === 'credit') return credit();
    if (key === 'sales') return sales();
    if (key === 'purchase') return purchase();
    if (key === 'inventory') return inventory();
    if (key === 'pl') return pl();
    if (key === 'close') return close();
    if (key === 'dashboard2') return custom();
    if (key === 'trace') return trace();
    if (key === 'pricing') return pricing();
    if (key === 'shortage') return shortage();
    return UI.emptyBox('报表不存在');
  }
  const bind = { 'reports/dashboard2': bindCustom, 'reports/close': bindClose, 'reports/trace': bindTrace, 'reports/pricing': bindPricing,
    'reports/shortage': bindShortage };

  return { render, TITLES, DESC, aging, bind, sales, pl, close, credit, trace, pricing, shortage };
})();
