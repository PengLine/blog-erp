/* ============================================================
 * views-workflow.js — 审批中心 / 订单中心 / 权限矩阵
 * 跨模块的「流程视角」页面:待办聚合、订单履约、角色授权
 * ============================================================ */
window.FLOW = (function () {

  const r2 = UI.round2, esc = UI.esc, money = UI.money, num = UI.num, icon = UI.icon, dateCN = UI.dateCN;
  const $ = UI.$, $$ = UI.$$;
  const MOD_LABEL = SCHEMA.entities.approval.fields.module.opts;
  const apEntity = m => ACT.SIGN.entityOf(m);
  const st = {
    ap: { status: 'pending', module: '', q: '', sort: null, asc: true, sel: {} },
    ord: { status: '', q: '', bucket: 'open', sort: 'required_date', asc: true },
    perm: { role: '' },
  };

  /* ============================================================
   * 一、审批中心
   * ============================================================ */
  function apFiltered() {
    const s = st.ap;
    let rows = DB.list('approval').slice();
    if (s.status) rows = rows.filter(a => a.status === s.status);
    if (s.module) rows = rows.filter(a => a.module === s.module);
    if (s.q) {
      const q = s.q.toLowerCase();
      rows = rows.filter(a => [a.no, a.title, a.biz, a.applicant, a.approver].some(v => String(v || '').toLowerCase().indexOf(q) >= 0));
    }
    if (s.sort) rows = sortBy(rows, s.sort, s.asc);
    else rows.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
      || String(b.date).localeCompare(String(a.date)));
    return rows;
  }

  function approvals() {
    const all = DB.list('approval');
    const period = DB.today().slice(0, 7);
    const pend = all.filter(a => a.status === 'pending');
    const overdue = pend.filter(a => ACT.SIGN.overdue(a) > 0);
    const mine = pend.filter(a => a.applicant === DB.currentUser());
    const decided = all.filter(a => a.status !== 'pending' && String(a.time_done || '').slice(0, 7) === period);
    const rows = apFiltered();
    const selCount = Object.keys(st.ap.sel).filter(k => st.ap.sel[k]).length;
    const counts = { pending: pend.length, approved: all.filter(a => a.status === 'approved').length,
      rejected: all.filter(a => a.status === 'rejected').length, cancelled: all.filter(a => a.status === 'cancelled').length, '': all.length };
    const buckets = Object.keys(MOD_LABEL).map((k, i) => ({
      name: MOD_LABEL[k], value: r2(pend.filter(a => a.module === k).reduce((s, a) => s + (a.amount || 0), 0)), color: UI.PAL[i % UI.PAL.length]
    })).filter(x => x.value > 0);

    return `
    <div class="page-head">
      <div><h2>审批中心</h2><div class="desc">统一待办队列:资金承诺类单据按金额自动<b>分级会签</b>(≥ ¥${money(SCHEMA.SIGN_TIERS[0].min)} 加签财务经理,≥ ¥${money(SCHEMA.SIGN_TIERS[1].min)} 加签总经办),仅当前节点岗位可裁决,任一级驳回即整链终止;驳回单可<b>修改重提</b>并保留原审批留痕。</div></div>
      <div class="page-actions">
        <button class="btn" data-route="todo">${icon('clipboard')}返回待办</button>
        <button class="btn" data-route="purchase_req">${icon('file')}采购申请</button>
        <button class="btn primary" data-ap-bulk="1" ${selCount ? '' : 'disabled'}>${icon('check')}批量通过${selCount ? ` (${selCount})` : ''}</button>
      </div>
    </div>
    <div class="grid g4">
      ${UI.kpi({ label: '待办审批', value: num(pend.length), unit: ' 单', icon: 'clock', foot: '涉及金额 ¥' + UI.compact(pend.reduce((s, a) => s + (a.amount || 0), 0)) })}
      ${UI.kpi({ label: '会签在途', value: num(pend.filter(a => (a.chain || []).length > 1).length), unit: ' 单', icon: 'layers', color: '#0EA5E9',
        foot: `节点逾期 <b style="color:${overdue.length ? 'var(--danger)' : 'inherit'}">${num(overdue.length)}</b> 单 · 时限 ${SCHEMA.SIGN_DUE.std}/${SCHEMA.SIGN_DUE.urgent}/${SCHEMA.SIGN_DUE.critical} 天` })}
      ${UI.kpi({ label: '我发起的待办', value: num(mine.length), unit: ' 单', icon: 'user', color: '#10B981', foot: esc(DB.currentUser()) })}
      ${UI.kpi({ label: '本月已裁决', value: num(decided.length), unit: ' 单', icon: 'check', color: '#F59E0B',
        foot: `批准 ${decided.filter(a => a.status === 'approved').length} · 驳回 ${decided.filter(a => a.status === 'rejected').length} · 平均 ${avgHours(decided).toFixed(1)} 小时` })}
    </div>
    <div class="grid g-2-1 mt16">
      <div class="card">
        <div class="card-head"><h3>${icon('clipboard')}审批队列</h3><div class="right"><span class="muted small">勾选待办可批量裁决</span></div></div>
        <div class="toolbar">
          ${UI.toolbarSearch(st.ap.q)}
          ${UI.chips([{ v: 'pending', l: '待办' }, { v: 'approved', l: '已批准' }, { v: 'rejected', l: '已驳回' }, { v: '', l: '全部' }], st.ap.status, counts)}
          <div class="field-inline">类型<select data-ap-mod style="width:auto;min-width:132px"><option value="">全部类型</option>
            ${Object.keys(MOD_LABEL).map(k => { const n = pend.filter(a => a.module === k).length; return `<option value="${k}" ${st.ap.module === k ? 'selected' : ''}>${esc(MOD_LABEL[k])}${n ? ` (${n})` : ''}</option>`; }).join('')}</select></div>
          <button class="btn ghost sm" data-ap-clear style="margin-left:auto">${icon('refresh')}重置筛选</button>
        </div>
        ${apTable(rows)}
        <div class="table-foot"><span>共 <b>${num(rows.length)}</b> 条 · 显示前 ${Math.min(40, rows.length)} 行</span></div>
      </div>
      <div>
        <div class="card"><div class="card-head"><h3>${icon('pie')}待办金额分布</h3></div><div class="card-body">
          ${buckets.length ? UI.donut(buckets, { centerLabel: '待办金额' }) : UI.emptyBox('没有待办审批')}</div></div>
        <div class="card mt16"><div class="card-head"><h3>${icon('layers')}会签在途</h3><span class="sub">逐级签批链路</span></div><div class="card-body">
          ${signingBoard()}</div></div>
        <div class="card mt16"><div class="card-head"><h3>${icon('clock')}最近裁决</h3></div><div class="card-body">
          ${recentDecided()}</div></div>
      </div>
    </div>`;
  }

  /** 会签看板:在途链路 + 节点状态 + 逾期提醒 */
  function signingBoard() {
    const list = DB.where('approval', a => a.status === 'pending' && (a.chain || []).length > 1)
      .sort((x, y) => ACT.SIGN.overdue(y) - ACT.SIGN.overdue(x) || String(x.due).localeCompare(String(y.due))).slice(0, 6);
    if (!list.length) return UI.emptyBox('没有在途的分级会签单', '资金承诺类单据金额达到档位后会自动加签');
    return `<div class="timeline">${list.map(a => {
      const od = ACT.SIGN.overdue(a);
      return `<div class="tl-item ${od ? '' : 'done'}">
        <b>${esc(MOD_LABEL[a.module] || a.module)}</b>
        <span class="when">已签 ${a.step}/${a.chain.length} 级${od ? ` · <b style="color:var(--danger)">逾期 ${od} 天</b>` : ''}</span>
        <p><span class="mono cell-link" data-open="approval=${encodeURIComponent(a.no)}">${esc(a.no)}</span> ¥${money(a.amount)} · 待「${esc(a.role)}」签批</p>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${a.chain.map((n, i) =>
          `<span class="tag" style="opacity:${n.state === 'signed' || n.state === 'rejected' ? 1 : i === +a.step ? 1 : .45}">${n.state === 'signed' ? '✓' : n.state === 'rejected' ? '×' : i === +a.step ? '●' : '○'} ${esc(n.role)}</span>`).join('')}</div>
      </div>`; }).join('')}</div>`;
  }

  function apTable(rows) {
    const cols = [
      { k: '_sel', label: '', sortable: false, width: '34px', render: r => r.status === 'pending'
        ? `<input type="checkbox" data-ap-sel="${esc(r.no)}" ${st.ap.sel[r.no] ? 'checked' : ''}>` : '<span class="muted">·</span>' },
      { k: 'no', label: '审批单号', sortable: false, render: r => `<span class="mono cell-link" data-open="approval=${encodeURIComponent(r.no)}">${esc(r.no)}</span>` },
      { k: 'module', label: '审批类型', render: r => `<span class="tag">${esc(MOD_LABEL[r.module] || r.module)}</span>` },
      { k: 'title', label: '审批事由', render: r => `<div style="font-weight:550">${esc(r.title)}</div><div class="cell-sub">${esc(r.biz || '')}${r.resubmit_of ? ` · 承接 <span class="mono cell-link" data-open="approval=${encodeURIComponent(r.resubmit_of)}">${esc(r.resubmit_of)}</span>` : ''}</div>` },
      { k: '_sign', label: '会签进度', sortable: false, render: signCell },
      { k: 'applicant', label: '发起人', sortable: false, render: r => esc(r.applicant || '—') },
      { k: 'amount', label: '涉及金额', align: 'right', render: r => `<span class="money">¥${money(r.amount)}</span>` },
      { k: 'priority', label: '紧急度', sortable: false, render: r => r.priority === 'std' ? '<span class="muted small">普通</span>'
        : `<span class="badge ${r.priority === 'critical' ? 'b-danger' : 'b-warning'}">${r.priority === 'critical' ? '特急' : '加急'}</span>` },
      { k: 'date', label: '提交日', nowrap: true, sortable: false, render: r => `<span class="small">${dateCN(r.date)}</span>` },
      { k: 'status', label: '状态', sortable: false, render: r => UI.badge(r.status) + (r.approver && r.status !== 'pending' ? `<div class="cell-sub">${esc(r.approver)}</div>` : '') + (r.resubmit ? `<div class="cell-sub">已重提 ${esc(r.resubmit)}</div>` : '') },
      { k: '_op', label: '操作', sortable: false, render: r => r.status === 'pending'
        ? (canDecide(r).ok
          ? `<button class="btn sm primary" data-ap="${encodeURIComponent(r.no)}|1">${icon('check')}通过</button> <button class="btn sm danger-ghost" data-ap="${encodeURIComponent(r.no)}|0">${icon('close')}驳回</button>`
          : `<span class="muted small" title="${esc(canDecide(r).why)}">需 ${esc(nodeRole(r) || r.role || '上级岗位')}</span>`)
        : (r.biz && apEntity(r.module) ? `<button class="btn sm ghost" data-ap-jump="${esc(apEntity(r.module))}=${encodeURIComponent(r.biz)}">${icon('eye')}业务单据</button>` : '<span class="muted small">已归档</span>') },
    ];
    return UI.table(cols, rows.slice(0, 40), { pk: 'no', sorted: st.ap.sort, asc: st.ap.asc, empty: '没有符合条件的审批单', emptySub: '切换状态或清空筛选试试' });
  }

  function recentDecided() {
    const done = DB.where('approval', a => a.status !== 'pending').slice()
      .sort((a, b) => String(b.time_done || b.date).localeCompare(String(a.time_done || a.date))).slice(0, 7);
    if (!done.length) return UI.emptyBox('暂无已裁决记录');
    return `<div class="timeline">${done.map(a => `<div class="tl-item ${a.status === 'approved' ? 'done' : 'muted'}">
      <b>${esc(MOD_LABEL[a.module] || a.module)}</b><span class="when">${esc(a.time_done || a.date)}</span>
      <p>${esc(a.title)} · ${a.status === 'approved' ? '同意' : a.status === 'rejected' ? '驳回' : '撤回'}${a.opinion ? ' — ' + esc(a.opinion) : ''}</p></div>`).join('')}</div>`;
  }

  function avgHours(rows) {
    if (!rows.length) return 0;
    let sum = 0, n = 0;
    rows.forEach(a => {
      if (!a.time_done) return;
      const d = UI.days(a.date, String(a.time_done).slice(0, 10));
      if (d >= 0) { sum += d; n++; }
    });
    return n ? r2(sum / n * 24) : 0;
  }

  function askOpinion(title, sub, preset, done) {
    const fields = [{ k: 'opinion', label: '审批意见', type: 'textarea', full: true, rows: 3, required: true, def: preset }];
    UI.modal({ title, subtitle: sub, width: 'mid',
      body: UI.form(fields, {}) + `<div class="notice mt12">${icon('info')}<div>裁决人 <b>${esc(DB.currentUser())}</b>;会签单需逐级签批,<b>末级通过后</b>系统自动执行业务回调:新品建档上架、供应商建档、服务商核准、申请转采购、订单变更落地、售后放行;任一级驳回则整链终止。</div></div>`,
      actions: [{ label: '取消' }, { label: '确认裁决', cls: 'primary', icon: 'check', onClick: m => {
        const rd = UI.readForm(m.el, fields);
        if (!rd.ok) { UI.toast('请填写审批意见', 'err'); return false; }
        done(rd.values.opinion);
      } }] });
  }

  /** 当前签批岗(非会签单返回空) */
  function nodeRole(r) { const n = r.status === 'pending' ? ACT.SIGN.node(r) : null; return n ? n.role : ''; }
  /** 裁决闸门:会签单看当前节点岗位,单级审批沿用模块审批权 */
  function canDecide(r) {
    const role = nodeRole(r);
    if (role) return ACT.SIGN.canSign(role);
    return { ok: ACT.PERM.can(SCHEMA.APPROVAL_PERM[r.module] || r.module, 'approve'),
      why: `当前角色无「${MOD_LABEL[r.module] || r.module}」的审批权限` };
  }
  /** 会签进度单元格:级次进度条 + 当前岗位 + 截止/逾期;未达加签档位只出单级时限 */
  function signCell(r) {
    const chain = r.chain || [];
    if (chain.length < 2) {
      const od = ACT.SIGN.overdue(r);
      return `<span class="muted small">单级 · ${esc((chain[0] && chain[0].role) || r.role || '—')}</span>`
        + (r.status === 'pending' && r.due ? `<div class="cell-sub">${od ? `<b style="color:var(--danger)">逾期 ${od} 天</b> · ` : ''}截止 ${esc(String(r.due).slice(0, 10))}</div>` : '');
    }
    const done = r.status === 'approved' ? chain.length : chain.filter(n => n.state === 'signed').length;
    const bad = chain.some(n => n.state === 'rejected');
    const od = ACT.SIGN.overdue(r);
    const cur = nodeRole(r);
    return `<div class="flex" style="gap:6px;align-items:center">
      <span class="mono small">${done}/${chain.length}</span>
      <span class="progress" style="flex:1;min-width:56px;height:6px"><i class="${bad ? 'bad' : od ? 'bad' : done === chain.length ? 'ok' : ''}" style="width:${Math.round(done / chain.length * 100)}%"></i></span>
      <span class="small">${esc(cur || (bad ? '整链终止' : '已完成'))}</span></div>
      ${r.status === 'pending' ? `<div class="cell-sub">${od ? `<b style="color:var(--danger)">逾期 ${od} 天</b> · ` : ''}截止 ${esc(String(r.due || '—').slice(0, 10))}</div>` : ''}`;
  }

  function decideOne(no, ok) {
    const a = DB.find('approval', no);
    if (!a) return UI.toast('审批单不存在', 'err');
    const g = canDecide(a);
    if (!g.ok) return UI.toast(g.why, 'err');
    const node = nodeRole(a);
    askOpinion((ok ? '通过' : '驳回') + ' · ' + (MOD_LABEL[a.module] || a.module),
      `${no} · ${a.biz || '—'} · ${a.applicant || ''}${a.chain && a.chain.length > 1 ? ` · 第 ${+a.step + 1}/${a.chain.length} 级(${node})` : ''}`,
      ok ? '同意,按申请内容执行。' : '不同意,请补充资料后重新提交。', opinion => {
        try {
          const r = ACT.decideApproval(no, ok, opinion);
          UI.toast(r.status === 'pending' ? `已签 ${r.step}/${r.chain.length} 级,转「${r.role}」签批(截止 ${String(r.due).slice(0, 10)})`
            : ok ? `${no} 已终审通过,业务单据已联动` : `${no} 已终审驳回,整链终止,请补充资料后修改重提`);
          delete st.ap.sel[no];
          APP.refresh();
        } catch (e) { UI.toast(e.message, 'err'); }
      });
  }

  function decideBulk(ok) {
    const all = Object.keys(st.ap.sel).filter(k => st.ap.sel[k] && (DB.find('approval', k) || {}).status === 'pending');
    const list = all.filter(no => canDecide(DB.find('approval', no) || {}).ok);
    if (!all.length) return UI.toast('请先勾选待办审批单', 'warn');
    if (!list.length) return UI.toast('勾选的审批单均不在当前岗位的签批节点上', 'err');
    askOpinion(`批量${ok ? '通过' : '驳回'} ${list.length} 单`, list.join(' · ') + (all.length > list.length ? ` (跳过 ${all.length - list.length} 单无权)` : ''),
      ok ? `批量同意 ${list.length} 笔申请。` : `批量驳回 ${list.length} 笔申请。`, opinion => {
        let done = 0, staged = 0, fail = 0, last = '';
        list.forEach(no => {
          try {
            const r = ACT.decideApproval(no, ok, opinion);
            if (r.status === 'pending') staged++; else done++;
            delete st.ap.sel[no];
          }
          catch (e) { fail++; last = e.message; }
        });
        UI.toast(`已终审 ${done} 单${staged ? ` · ${staged} 单转入下一级` : ''}${fail ? ` · ${fail} 单失败:${last}` : ''}`, fail ? 'warn' : 'ok');
        APP.refresh();
      });
  }

  /** 勾选状态实时反映到「批量通过」按钮,避免整页重绘丢选择 */
  function syncBulk() {
    const bulk = document.querySelector('[data-ap-bulk]');
    if (!bulk) return;
    const n = Object.keys(st.ap.sel).filter(k => st.ap.sel[k]).length;
    bulk.disabled = !n;
    bulk.innerHTML = icon('check') + `批量通过${n ? ' (' + n + ')' : ''}`;
  }

  function bindApprovals(root) {
    bindSearch(root, () => st.ap, 'ap');
    $$('.chip[data-chip]', root).forEach(c => c.addEventListener('click', () => { st.ap.status = c.dataset.chip; st.ap.sel = {}; APP.render(); }));
    const mod = $('[data-ap-mod]', root); if (mod) mod.addEventListener('change', () => { st.ap.module = mod.value; APP.render(); });
    const clear = $('[data-ap-clear]', root); if (clear) clear.addEventListener('click', () => { st.ap = { status: '', module: '', q: '', sort: null, asc: true, sel: {} }; APP.render(); });
    $$('[data-ap-sel]', root).forEach(cb => cb.addEventListener('change', () => { st.ap.sel[cb.dataset.apSel] = cb.checked; syncBulk(); }));
    $$('[data-ap]', root).forEach(b => b.addEventListener('click', () => { const p = decodeURIComponent(b.dataset.ap).split('|'); decideOne(p[0], p[1] === '1'); }));
    $$('[data-ap-jump]', root).forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.apJump.split('=');
      if (p[0]) DOC.open(p[0], decodeURIComponent(p[1] || ''));
    }));
    const bulk = $('[data-ap-bulk]', root); if (bulk) bulk.addEventListener('click', () => decideBulk(true));
  }

  /* ============================================================
   * 二、订单中心
   * ============================================================ */
  function soProgress(so) {
    const lines = DB.lines('so_lines', so.no);
    const qty = lines.reduce((s, l) => s + (+l.qty || 0), 0);
    const ship = lines.reduce((s, l) => s + (+l.delivered || 0), 0);
    const inv = DB.where('invoice', i => i.so === so.no);
    const billed = r2(inv.reduce((s, i) => s + i.total, 0));
    const paid = r2(inv.reduce((s, i) => s + i.paid, 0));
    return { lines: lines.length, qty, ship, billed, paid, total: so.total || 0 };
  }

  /* 订单中心口径:页面 KPI、筛选计数、侧栏角标共用一份,三处各自数一遍迟早对不上 */
  function ordersStats() {
    const today = DB.today();
    const all = DB.list('sales_order');
    const running = all.filter(o => ['draft', 'confirmed', 'partial'].indexOf(o.status) >= 0);
    const due = running.filter(o => ['confirmed', 'partial'].indexOf(o.status) >= 0 && o.required_date);
    const billedSo = {};
    DB.list('invoice').forEach(i => { if (i.so) billedSo[i.so] = 1; });
    return {
      today, all,
      open: running,
      openAmount: running.reduce((a, o) => a + (o.total || 0), 0),
      late: due.filter(o => o.required_date < today),
      week: due.filter(o => o.required_date >= today && UI.days(today, o.required_date) <= 7),
      unbilled: all.filter(o => ['done', 'partial'].indexOf(o.status) >= 0 && !billedSo[o.no]),
      pendChange: DB.where('approval', a => a.module === 'so_change' && a.status === 'pending'),
      shortQty: running.reduce((a, o) => { const p = soProgress(o); return a + Math.max(0, p.qty - p.ship); }, 0),
    };
  }

  function orders() {
    const st0 = ordersStats(), today = st0.today, s = st.ord;
    const all = st0.all;
    let rows = all.slice();
    /* 分桶直接取 ordersStats 的同一批对象,角标数字与点开以后的列表必然一致 */
    if (s.bucket === 'open') rows = st0.open.slice();
    else if (s.bucket === 'late') rows = st0.late.slice();
    else if (s.bucket === 'unbilled') rows = st0.unbilled.slice();
    if (s.status) rows = rows.filter(o => o.status === s.status);
    if (s.q) {
      const q = s.q.toLowerCase();
      rows = rows.filter(o => [o.no, o.customer_name, o.salesperson, o.channel].some(v => String(v || '').toLowerCase().indexOf(q) >= 0));
    }
    rows = sortBy(rows, s.sort, s.asc);

    const openSo = st0.open, late = st0.late, week = st0.week, pendChange = st0.pendChange;
    const statusCount = {};
    all.forEach(o => statusCount[o.status] = (statusCount[o.status] || 0) + 1);
    const CO = SCHEMA.entities.sales_order.fields.channel.opts;
    const chan = Object.keys(CO).map((k, i) => ({ name: CO[k], value: r2(all.filter(o => (o.channel || 'offline') === k).reduce((a, o) => a + (o.total || 0), 0)), color: UI.PAL[i % UI.PAL.length] })).filter(x => x.value > 0);
    const shortQty = st0.shortQty;

    return `
    <div class="page-head">
      <div><h2>订单中心</h2><div class="desc">按交期与履约进度聚合的销售订单:发货缺口、开票覆盖、回款进度与变更申请集中在一屏。数据源 <span class="mono">sales_order + so_lines + delivery + invoice</span>。</div></div>
      <div class="page-actions">
        <button class="btn" data-route="sales_order">${icon('file')}订单台账</button>
        <button class="btn" data-route="rma">${icon('refresh')}售后工单</button>
        <button class="btn primary" data-new-doc="sales_order">${icon('plus')}新建销售订单</button>
      </div>
    </div>
    <div class="grid g4">
      ${UI.kpi({ label: '执行中订单', value: num(openSo.length), unit: ' 单', icon: 'file', foot: '在手金额 ¥' + UI.compact(st0.openAmount) })}
      ${UI.kpi({ label: '交期已逾期', value: num(late.length), unit: ' 单', icon: 'warn', color: '#EF4444', foot: '未交数量 ' + num(shortQty) + ' 件' })}
      ${UI.kpi({ label: '7 天内到期', value: num(week.length), unit: ' 单', icon: 'calendar', color: '#F59E0B', foot: '建议今日生成拣货单' })}
      ${UI.kpi({ label: '变更待审批', value: num(pendChange.length), unit: ' 单', icon: 'edit', color: '#8B5CF6', foot: '批准后自动写回订单' })}
    </div>
    <div class="card mt16">
      <div class="card-head"><h3>${icon('truck')}交期与履约</h3><div class="right">${UI.chips([{ v: 'open', l: '执行中' }, { v: 'late', l: '逾期' }, { v: 'unbilled', l: '完工未开票' }, { v: 'all', l: '全部' }], s.bucket, { open: openSo.length, late: late.length, unbilled: st0.unbilled.length, all: all.length })}</div></div>
      <div class="toolbar">
        ${UI.toolbarSearch(s.q)}
        <div class="field-inline">状态<select data-ord-status style="width:auto;min-width:126px"><option value="">全部状态</option>
          ${Object.keys(SCHEMA.entities.sales_order.fields.status.opts).map(k => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${esc((SCHEMA.STATUS[k] || {}).l || k)} (${statusCount[k] || 0})</option>`).join('')}</select></div>
        <button class="btn ghost sm" data-ord-clear style="margin-left:auto">${icon('refresh')}重置</button>
      </div>
      ${ordTable(rows, today)}
      <div class="table-foot"><span>共 <b>${num(rows.length)}</b> 单 · 显示前 ${Math.min(30, rows.length)} 行</span></div>
    </div>
    <div class="grid g2 mt16">
      <div class="card"><div class="card-head"><h3>${icon('pie')}渠道销售构成</h3></div><div class="card-body">
        ${chan.length ? UI.donut(chan, { centerLabel: '订单总额' }) : UI.emptyBox('暂无订单')}</div></div>
      <div class="card"><div class="card-head"><h3>${icon('edit')}进行中的变更申请</h3><div class="right"><button class="btn sm" data-route="approvals">审批中心</button></div></div>
        <div class="card-body">${pendChange.length ? pendChange.map(a => `<div class="flex" style="padding:10px 0;border-bottom:1px dashed var(--border)">
          <span class="mono cell-link" data-open="approval=${encodeURIComponent(a.no)}">${esc(a.no)}</span>
          <div class="grow"><div style="font-weight:550">${esc(a.biz)} · ${esc((DB.find('sales_order', a.biz) || {}).customer_name || '')}</div>
          <div class="muted small">${esc(a.summary || a.note || a.title)}</div></div>
          <span class="muted small nowrap">${dateCN(a.date)}</span>
          <button class="btn sm primary" data-ap="${encodeURIComponent(a.no)}|1">${icon('check')}通过</button>
          <button class="btn sm danger-ghost" data-ap="${encodeURIComponent(a.no)}|0">${icon('close')}驳回</button></div>`).join('')
          : UI.emptyBox('没有待审批的订单变更', '点击下方订单行的「发起变更」提交申请')}</div></div>
    </div>`;
  }

  function ordTable(rows, today) {
    const cols = [
      { k: 'no', label: '订单号', render: r => `<span class="mono cell-link" data-open="sales_order=${encodeURIComponent(r.no)}">${esc(r.no)}</span>
        <div class="cell-sub">${dateCN(r.date)} · ${esc(r.salesperson || '')}</div>` },
      { k: 'customer_name', label: '客户 / 渠道', render: r => `<div style="font-weight:550">${esc(r.customer_name)}</div>
        <div class="cell-sub">${esc(SCHEMA.entities.sales_order.fields.channel.opts[r.channel || 'offline'] || '线下直销')}</div>` },
      { k: 'status', label: '状态', sortable: false, render: r => UI.badge(r.status) + (r.priority && r.priority !== 'std'
        ? `<div class="cell-sub"><span class="badge ${r.priority === 'critical' ? 'b-danger' : 'b-warning'}">${r.priority === 'critical' ? '特急' : '加急'}</span></div>` : '') },
      { k: 'required_date', label: '需求到货日', nowrap: true, render: r => {
        if (!r.required_date) return '—';
        const d = UI.days(today, r.required_date), live = ['confirmed', 'partial'].indexOf(r.status) >= 0;
        return `<span ${live && d < 0 ? 'style="color:var(--danger);font-weight:600"' : ''}>${dateCN(r.required_date)}<span class="muted small"> (${d < 0 ? '逾期 ' + (-d) : '剩 ' + d} 天)</span></span>`;
      } },
      { k: '_ship', label: '发货履约', sortable: false, render: r => {
        const p = soProgress(r), ratio = p.qty ? p.ship / p.qty * 100 : 0;
        return `<div class="flex" style="gap:8px"><span class="money small">${num(p.ship)}/${num(p.qty)}</span>
          <div class="progress" style="width:74px"><i class="${ratio >= 100 ? 'ok' : ratio > 0 ? 'warn' : 'bad'}" style="width:${Math.min(100, ratio)}%"></i></div></div>
          <div class="cell-sub">${p.lines} 行 · 缺口 ${num(Math.max(0, p.qty - p.ship))}</div>`; } },
      { k: '_settle', label: '开票 / 回款', sortable: false, render: r => {
        const p = soProgress(r);
        return `<span class="money">¥${money(p.billed)}</span><div class="cell-sub">已回 ¥${money(p.paid)}${p.billed && p.billed < p.total - 0.01 ? ' · 未开票 ¥' + money(r2(p.total - p.billed)) : ''}</div>`; } },
      { k: 'total', label: '订单金额', align: 'right', render: r => `<span class="money strong">¥${money(r.total)}</span>` },
      { k: '_op', label: '操作', sortable: false, render: r => {
        if (['cancelled', 'closed'].indexOf(r.status) >= 0) return '<span class="muted small">已结束</span>';
        if (r.status === 'draft') return `<button class="btn sm ghost" data-open="sales_order=${encodeURIComponent(r.no)}">${icon('eye')}去审核</button>`;
        return `<button class="btn sm" data-so-change="${encodeURIComponent(r.no)}">${icon('edit')}发起变更</button>`
          + (r.status !== 'done' ? ` <button class="btn sm danger-ghost" data-so-close="${encodeURIComponent(r.no)}">${icon('close')}关闭</button>` : '');
      } },
    ];
    return UI.table(cols, rows.slice(0, 30), { pk: 'no', sorted: st.ord.sort, asc: st.ord.asc, empty: '没有符合条件的订单', emptySub: '切换上方分组或清空筛选' });
  }

  function openChangeModal(no) {
    const so = DB.find('sales_order', no);
    const fields = [
      { k: 'required_date', label: '新需求到货日', type: 'date', def: so.required_date },
      { k: 'priority', label: '紧急度', type: 'select', opts: SCHEMA.entities.sales_order.fields.priority.opts, def: so.priority || 'std' },
      { k: 'warehouse', label: '发货仓', type: 'ref', ref: 'warehouses', def: so.warehouse },
      { k: 'payment_terms', label: '结算方式', type: 'select', opts: SCHEMA.PAYTERM, def: so.payment_terms || 'NET30' },
      { k: 'carrier', label: '承运商', type: 'text', def: so.carrier || '顺丰速运' },
      { k: 'note', label: '订单备注', type: 'textarea', full: true, rows: 2, def: so.note || '' },
      { k: 'reason', label: '变更原因', type: 'text', full: true, required: true, ph: '如:客户追加数量,交期顺延 5 天' }];
    UI.modal({ title: '发起订单变更申请', subtitle: `${no} · ${so.customer_name} · 当前 ¥${money(so.total)}`, width: 'mid',
      body: UI.form(fields, {}) + `<div class="notice mt12">${icon('info')}<div>已确认订单不允许直接修改:变更内容提交销售主管审批,通过后系统写回订单并在备注中保留变更轨迹。</div></div>`,
      actions: [{ label: '取消' }, { label: '提交审批', cls: 'primary', icon: 'send', onClick: m => {
        const rd = UI.readForm(m.el, fields);
        if (!rd.ok) { UI.toast('请完善变更内容', 'err'); return false; }
        const changes = {};
        ['required_date', 'priority', 'warehouse', 'payment_terms', 'carrier', 'note'].forEach(k => { if (rd.values[k]) changes[k] = rd.values[k]; });
        try {
          const ap = ACT.requestSOChange(no, changes, rd.values.reason);
          UI.toast('变更申请已提交:' + ap);
          APP.refresh();
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }] });
  }

  function closeOrder(no) {
    const so = DB.find('sales_order', no), p = soProgress(so);
    UI.modal({ title: '强制关闭订单', subtitle: no,
      body: `<div class="notice warn">${icon('warn')}<div>关闭后订单不再允许发货与开票,<b>${num(Math.max(0, p.qty - p.ship))}</b> 件未交量将被释放,占用库存自动解锁;存在未结清发票的订单不允许关闭。</div></div>
        <dl class="descs c4 mt12">${[['客户', esc(so.customer_name)], ['状态', UI.badge(so.status)], ['发货进度', `${num(p.ship)}/${num(p.qty)}`], ['未结应收', '¥' + money(r2(p.billed - p.paid))]]
          .map(d => `<div><dt>${d[0]}</dt><dd>${d[1]}</dd></div>`).join('')}</dl>`,
      actions: [{ label: '取消' }, { label: '确认关闭', cls: 'danger-ghost', icon: 'close', onClick: () => {
        try { ACT.closeSO(no); UI.toast(`订单 ${no} 已关闭`); APP.refresh(); } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }] });
  }

  function bindOrders(root) {
    bindSearch(root, () => st.ord, 'ord');
    $$('.chip[data-chip]', root).forEach(c => c.addEventListener('click', () => { st.ord.bucket = c.dataset.chip; APP.render(); }));
    const sel = $('[data-ord-status]', root); if (sel) sel.addEventListener('change', () => { st.ord.status = sel.value; APP.render(); });
    const clear = $('[data-ord-clear]', root); if (clear) clear.addEventListener('click', () => { st.ord = { status: '', q: '', bucket: 'open', sort: 'required_date', asc: true }; APP.render(); });
    $$('[data-so-change]', root).forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); openChangeModal(decodeURIComponent(b.dataset.soChange)); }));
    $$('[data-so-close]', root).forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); closeOrder(decodeURIComponent(b.dataset.soClose)); }));
    $$('[data-ap]', root).forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); const p = decodeURIComponent(b.dataset.ap).split('|'); decideOne(p[0], p[1] === '1'); }));
  }

  /* ============================================================
   * 三、权限矩阵
   * ============================================================ */
  const PERM_HINT = {
    dashboard: '看板与经营指标只读', products: '物料主档与库存属性维护', product_release: '新品立项、评审与上架',
    rfq: '询价编制、报价录入与定标', customers: '客户档案与信用额度', sales_order: '订单创建、审核与发货',
    invoice: '开票与红字冲销', receipt: '收款登记', supplier_apply: '供应商准入与建档',
    purchase_order: '采购下单与审核', purchase_req: '部门申请与审批转采购', bill: '应付账单确认与暂估清算',
    payment: '付款登记', processors: '外协商档案维护', processor_audit: '验厂评分与核准',
    os_order: '委外发料与成品收回', stock: '库存现量、调拨与盘点', rma: '售后受理、退款与换货',
    journal: '凭证与科目余额', period: '期末损益结转、关账与反结账', reports: '经营分析与账龄报表', role: '角色与授权管理', activity: '操作日志追溯',
  };

  function currentRoleCode() {
    const roles = DB.list('role');
    let code = st.perm.role || (ACT.PERM.currentRole() || {}).code || (roles[0] || {}).code;
    if (!DB.find('role', code)) code = (roles[0] || {}).code;
    return code;
  }

  function perms() {
    const roles = DB.list('role');
    if (!roles.length) return `<div class="page-head"><div><h2>权限矩阵</h2><div class="desc">系统尚未初始化角色数据,请先在「系统设置」中重建演示数据。</div></div></div>`;
    const code = currentRoleCode();
    const role = DB.find('role', code) || roles[0];
    const granted = role.perms || [];
    const cur = ACT.PERM.currentRole();
    const users = DB.where('users', u => u.role === role.name);
    const superAdmin = (role.level || 0) >= 9;
    const canEdit = ACT.PERM.can('role', 'edit');
    const totalPoints = SCHEMA.PERM_MODULES.length * 3;

    return `
    <div class="page-head">
      <div><h2>权限矩阵</h2><div class="desc">角色 × 功能模块 × 动作(查看 / 编辑 / 审批)。授权即时生效,列表动作、单据按钮与左侧导航都会读取这里。</div></div>
      <div class="page-actions">
        <button class="btn" data-route="users">${icon('users')}用户档案</button>
        ${canEdit ? `<button class="btn" data-perm-all="${esc(role.code)}|0">${icon('trash')}全部收回</button>
        <button class="btn primary" data-perm-all="${esc(role.code)}|1">${icon('check')}全部授予</button>` : `<span class="badge b-plain">只读视图</span>`}
      </div>
    </div>
    <div class="card"><div class="card-body">
      <div class="section-title">选择角色</div>
      ${UI.chips(roles.map(r => ({ v: r.code, l: esc(r.name) + (r.level >= 9 ? ' · 超管' : '') })), role.code)}
      <div class="grid g-2-1 mt16">
        ${UI.descs([
          ['角色编码', `<span class="mono">${esc(role.code)}</span>`], ['归属部门', esc(role.dept || '—')],
          ['审批级别', `<b>${num(role.level)}</b>${superAdmin ? ' <span class="badge b-purple">绕过权限校验</span>' : ''}`],
          ['数据范围', esc(SCHEMA.entities.role.fields.scope.opts[role.scope] || role.scope || '—')],
          ['单笔审批限额', '¥' + money(role.max_amount)], ['在册用户', num(users.length) + ' 人'],
        ])}
        <div>
          <div class="notice">${icon('settings')}<div>当前登录 <b>${esc(DB.currentUser())}</b> · 角色 <b>${esc((cur || {}).name || '未配置')}</b>,
          已授权 <b>${granted.length}</b> / ${totalPoints} 个权限点${superAdmin ? ',超管默认全放行' : ''}。</div></div>
          <button class="btn sm mt12" data-perm-sim="${esc(role.code)}">${icon('user')}以该角色用户登录演示</button>
        </div>
      </div>
      ${role.note ? `<div class="muted small mt12">${esc(role.note)}</div>` : ''}
    </div></div>
    <div class="card mt16">
      <div class="card-head"><h3>${icon('grid')}${esc(role.name)} · 功能权限</h3><div class="right"><span class="muted small">点击单元格授予 / 回收</span></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th style="width:180px">功能模块</th><th style="width:88px">查看</th><th style="width:88px">编辑</th><th style="width:88px">审批</th>
        <th style="width:104px">整行</th><th>控制范围</th></tr></thead><tbody>
        ${SCHEMA.PERM_MODULES.map(m => {
          const has = a => superAdmin || (granted.indexOf(m.key + ':' + a) >= 0);
          const n = ['view', 'edit', 'approve'].filter(has).length;
          return `<tr><td><span style="font-weight:550">${esc(m.label)}</span><div class="cell-sub mono">${esc(m.entity)}</div></td>
            ${['view', 'edit', 'approve'].map(a => `<td>${permCell(m.key, a, has(a), superAdmin, !canEdit)}</td>`).join('')}
            <td>${superAdmin || !canEdit ? '<span class="muted small">—</span>' : `<button class="btn sm ghost" data-perm-row="${esc(m.key)}|${n === 3 ? 0 : 1}">${n === 3 ? '全收回' : '全授予'}</button>`}</td>
            <td class="muted small">${esc(PERM_HINT[m.key] || '')}</td></tr>`;
        }).join('')}
      </tbody></table></div>
      <div class="table-foot"><span>${superAdmin ? '超级管理员角色默认拥有全部权限,单元格只读展示。' : canEdit ? `已授权 ${granted.length} 个权限点 · 修改后立即生效并写入操作日志` : `已授权 ${granted.length} 个权限点 · 当前角色只有查看权,如需调整请授予「权限管理 · 编辑」。`}</span></div>
    </div>
    <div class="grid g2 mt16">
      <div class="card"><div class="card-head"><h3>${icon('users')}${esc(role.name)} 成员</h3></div>
        ${users.length ? UI.table([
          { k: 'code', label: '工号', sortable: false, render: r => `<span class="mono">${esc(r.code)}</span>` },
          { k: 'name', label: '姓名', sortable: false, render: r => `<span style="font-weight:550">${esc(r.name)}</span>${r.name === DB.currentUser() ? ' <span class="badge b-primary">当前</span>' : ''}` },
          { k: 'dept', label: '部门', sortable: false, render: r => esc(r.dept || '—') },
          { k: 'email', label: '邮箱', sortable: false, render: r => `<span class="muted small">${esc(r.email || '—')}</span>` },
          { k: '_op', label: '', sortable: false, render: r => `<button class="btn sm ghost" data-perm-user="${esc(r.name)}" title="以 ${esc(r.account || r.code)} 登录演示">${icon('logout')}登录演示</button>` },
        ], users, { pk: 'code', empty: '该角色暂无用户' }) : `<div class="card-body">${UI.emptyBox('该角色暂无用户', '在用户档案里把角色名改为「' + esc(role.name) + '」即可')}</div>`}</div>
      <div class="card"><div class="card-head"><h3>${icon('clock')}最近授权变更</h3></div><div class="card-body">${permAudit()}</div></div>
    </div>`;
  }

  function permCell(module, action, on, ro, locked) {
    if (ro) return `<span class="badge b-success">默认允许</span>`;
    if (locked) return `<span class="badge ${on ? 'b-success' : 'b-plain'}">${on ? '允许' : '禁止'}</span>`;
    return `<span class="chip ${on ? 'on' : ''}" style="height:26px;padding:0 10px;cursor:pointer" data-perm="${esc(module)}|${action}|${on ? 0 : 1}">${on ? '允许' : '禁止'}</span>`;
  }

  function permAudit() {
    const logs = DB.where('activity', a => a.module === '权限管理').slice(0, 8);
    if (!logs.length) return UI.emptyBox('暂无授权变更记录', '点击矩阵单元格即可产生记录');
    return `<div class="timeline">${logs.map(a => `<div class="tl-item done"><b>${esc(a.action)}</b><span class="when">${esc(a.time)}</span>
      <p>${esc(a.ref)} · ${esc(a.detail || '')} · ${esc(a.user)}</p></div>`).join('')}</div>`;
  }

  function permsFor(roleCode) { st.perm.role = roleCode; APP.go('perms'); }

  function bindPerms(root) {
    $$('.chip[data-chip]', root).forEach(c => c.addEventListener('click', () => { st.perm.role = c.dataset.chip; APP.render(); }));
    $$('[data-perm]', root).forEach(c => c.addEventListener('click', () => {
      const p = c.dataset.perm.split('|');
      try { ACT.PERM.grant(currentRoleCode(), p[0], p[1], p[2] === '1'); } catch (e) { return UI.toast(e.message, 'err'); }
      APP.render();
    }));
    $$('[data-perm-row]', root).forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.permRow.split('|');
      try { ACT.PERM.grantAll(currentRoleCode(), p[0], p[1] === '1'); } catch (e) { return UI.toast(e.message, 'err'); }
      APP.render();
    }));
    $$('[data-perm-all]', root).forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.permAll.split('|');
      const on = p[1] === '1';
      if (!on) return UI.modal({ title: '收回全部权限', body: `<div class="notice warn">${icon('warn')}<div>收回后该角色用户在系统中将无法查看与操作业务模块,仅适合演示权限隔离。</div></div>`,
        actions: [{ label: '取消' }, { label: '确认收回', cls: 'danger-ghost', icon: 'trash', onClick: () => {
          try { SCHEMA.PERM_MODULES.forEach(m => ACT.PERM.grantAll(p[0], m.key, false)); } catch (e) { UI.toast(e.message, 'err'); return; }
          UI.toast('已收回全部功能权限'); APP.refresh();
        } }] });
      try { SCHEMA.PERM_MODULES.forEach(m => ACT.PERM.grantAll(p[0], m.key, true)); } catch (e) { return UI.toast(e.message, 'err'); }
      UI.toast('已授予全部功能权限'); APP.refresh();
    }));
    const sim = $('[data-perm-sim]', root);
    if (sim) sim.addEventListener('click', () => {
      const r = DB.find('role', sim.dataset.permSim);
      const u = DB.where('users', x => x.role === (r || {}).name)[0];
      if (!u) return UI.toast('该角色下暂无用户,请先在用户档案中指派', 'warn');
      AUTH.switchTo(u.account || u.code, `演示角色「${u.role}」需要重新登录`);
    });
    $$('[data-perm-user]', root).forEach(b => b.addEventListener('click', () => {
      const u = DB.find('users', b.dataset.permUser) || DB.where('users', x => x.name === b.dataset.permUser)[0] || {};
      AUTH.switchTo(u.account || b.dataset.permUser, `切换用户「${b.dataset.permUser}」需要重新登录`);
    }));
  }

  /* ---------------- 公共:排序与搜索 ---------------- */
  function sortBy(rows, key, asc) {
    if (!key) return rows;
    return rows.slice().sort((a, b) => {
      let x = a[key], y = b[key];
      if (typeof x === 'number' && typeof y === 'number') return asc ? x - y : y - x;
      x = String(x === undefined || x === null ? '' : x); y = String(y === undefined || y === null ? '' : y);
      return asc ? x.localeCompare(y, 'zh') : y.localeCompare(x, 'zh');
    });
  }
  function bindSort(root, state) {
    $$('th[data-sort]', root).forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort; if (!k) return;
      if (state.sort === k) state.asc = !state.asc; else { state.sort = k; state.asc = true; }
      APP.render();
    }));
  }
  function bindSearch(root, get, prefix) {
    const search = $('[data-search]', root);
    if (!search) return;
    search.addEventListener('input', debounce(() => { get().q = search.value; APP.render(); setTimeout(() => {
      const el = $('[data-search]'); if (el && el !== document.activeElement) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0); }));
  }
  function debounce(fn) { let t; return function () { clearTimeout(t); t = setTimeout(fn, 260); }; }

  function bind(route) {
    const root = document.getElementById('view');
    if (route === 'approvals') { bindSort(root, st.ap); bindApprovals(root); }
    else if (route === 'orders') { bindSort(root, st.ord); bindOrders(root); }
    else if (route === 'perms') bindPerms(root);
  }

  return {
    approvals, orders, perms, permsFor, ordersStats,
    bind: { approvals: () => bind('approvals'), orders: () => bind('orders'), perms: () => bind('perms') },
    routes: ['approvals', 'orders', 'perms'],
    titles: { approvals: '审批中心', orders: '订单中心', perms: '权限矩阵' },
  };
})();
