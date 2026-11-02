/* ============================================================
 * app.js — 应用外壳:导航 / 路由(hash) / 顶栏 / 全局搜索 / 初始化
 * ============================================================ */
(function () {
  const NAV = [
    { group: '工作台', items: [
      { id: 'dashboard', label: '经营看板', icon: 'dashboard' },
      { id: 'approvals', label: '审批中心', icon: 'check' },
      { id: 'orders', label: '订单中心', icon: 'truck' },
      { id: 'todo', label: '待办任务', icon: 'clipboard' },
    ] },
    { group: '产品管理', items: [
      { id: 'rfq', label: '询价 / 比价', icon: 'search' },
      { id: 'product_release', label: '新品发布', icon: 'trendUp' },
      { id: 'approval', label: '审核单据', icon: 'check' },
    ] },
    { group: '商品管理', items: [
      { id: 'products', label: '商品 / 物料', icon: 'box' },
      { id: 'customers', label: '客户档案', icon: 'users' },
      { id: 'price_list', label: '价目表 / 价格策略', icon: 'wallet' },
    ] },
    { group: '订单管理', items: [
      { id: 'sales_order', label: '销售订单', icon: 'file' },
      { id: 'delivery', label: '销售出库单', icon: 'send' },
      { id: 'invoice', label: '销售发票 / 应收', icon: 'receipt' },
      { id: 'receipt', label: '收款单', icon: 'wallet' },
    ] },
    { group: '售后管理', items: [
      { id: 'rma', label: '售后工单', icon: 'refresh' },
    ] },
    { group: '计划管理', items: [
      { id: 'bom', label: '物料清单 BOM', icon: 'layers' },
      { id: 'mrp_run', label: 'MRP 计划运算', icon: 'zap' },
      { id: 'reports/shortage', label: '缺料与长周期分析', icon: 'warn' },
    ] },
    { group: '采购管理', items: [
      { id: 'purchase_req', label: '采购申请', icon: 'clipboard' },
      { id: 'supplier_apply', label: '供应商准入申请', icon: 'user' },
      { id: 'suppliers', label: '供应商档案', icon: 'truck' },
      { id: 'purchase_order', label: '采购订单', icon: 'file' },
      { id: 'gr', label: '采购收货单', icon: 'download' },
      { id: 'iqc', label: '来料检验 IQC', icon: 'shield' },
      { id: 'bill', label: '采购账单 / 应付', icon: 'receipt' },
      { id: 'payment', label: '付款单', icon: 'card' },
    ] },
    { group: '服务商管理', items: [
      { id: 'processors', label: '服务商 / 外协厂', icon: 'copy' },
      { id: 'processor_audit', label: '外协商审核', icon: 'clipboard' },
      { id: 'os_order', label: '委外加工单', icon: 'swap' },
    ] },
    { group: '库存管理', items: [
      { id: 'warehouses', label: '仓库与库位', icon: 'home' },
      { id: 'bins', label: '库位主档', icon: 'grid' },
      { id: 'lot', label: '批次台账', icon: 'shield' },
      { id: 'stock', label: '库存现量', icon: 'layers' },
      { id: 'stock_movements', label: '出入库流水', icon: 'swap' },
      { id: 'transfer', label: '库存调拨', icon: 'swap' },
      { id: 'stocktake', label: '库存盘点', icon: 'grid' },
    ] },
    { group: '财务管理', items: [
      { id: 'gl_account', label: '会计科目余额', icon: 'book' },
      { id: 'journal', label: '记账凭证', icon: 'book' },
      { id: 'reports/close', label: '期末处理与结账', icon: 'lock' },
      { id: 'reports/ar', label: '应收账龄分析', icon: 'chart' },
      { id: 'reports/credit', label: '客户信用风险', icon: 'warn' },
      { id: 'reports/ap', label: '应付账龄分析', icon: 'chart' },
    ] },
    { group: '报表分析', items: [
      { id: 'reports/sales', label: '销售分析', icon: 'trendUp' },
      { id: 'reports/purchase', label: '采购分析', icon: 'trendDown' },
      { id: 'reports/inventory', label: '库存与周转', icon: 'pie' },
      { id: 'reports/trace', label: '批次追溯与召回', icon: 'search' },
      { id: 'reports/pricing', label: '价格策略与毛利', icon: 'wallet' },
      { id: 'reports/pl', label: '利润表', icon: 'grid' },
    ] },
    { group: '权限管理', items: [
      { id: 'perms', label: '权限矩阵', icon: 'grid' },
      { id: 'role', label: '角色定义', icon: 'settings' },
      { id: 'users', label: '用户档案', icon: 'user' },
    ] },
    { group: '系统', items: [
      { id: 'activity', label: '操作日志', icon: 'clock' },
      { id: 'reports/dashboard2', label: '自定义报表', icon: 'filter' },
      { id: 'settings', label: '系统设置', icon: 'settings' },
      { id: 'guide', label: '关于与数据字典', icon: 'info' },
    ] },
  ];

  const state = { route: 'dashboard', collapsed: false, period: 30 };
  let navRoute = '';            // 上一次侧栏渲染的路由,用来区分「重绘」与「跳转」两种滚动场景
  /* 顶栏统计区间:高亮必须由 state 反推,否则每次重绘都会退回近 30 天 */
  const PERIODS = [{ d: 30, label: '近 30 天' }, { d: 90, label: '近 90 天' }, { d: 180, label: '半年' }];

  /* 路由 → 权限模块(导航按角色可见性过滤) */
  const PERM_ROUTE = { orders: 'sales_order', approvals: '', perms: 'role', users: 'role', gl_account: 'journal', approval: 'product_release',
    delivery: 'sales_order', gr: 'purchase_order', warehouses: 'stock', stock_movements: 'stock', transfer: 'stock', stocktake: 'stock', bins: 'lot' };
  SCHEMA.PERM_MODULES.forEach(m => { if (m.entity && !PERM_ROUTE[m.entity]) PERM_ROUTE[m.entity] = m.key; });
  function canSee(route) {
    const mod = route.indexOf('reports/') === 0 ? 'reports' : PERM_ROUTE[route];
    if (!mod) return true;
    try { return ACT.PERM.can(mod, 'view'); } catch (e) { return true; }
  }
  function isFlow(route) { return FLOW.routes.indexOf(route) >= 0; }

  /* ---------------- 渲染 ---------------- */
  /** 路由归一:侧边栏与全局搜索使用裸实体名,深链兼容 entity: 前缀 */
  function entityOf(route) {
    if (route.indexOf('entity:') === 0) return route.slice(7);
    return SCHEMA.entities[route] ? route : '';
  }
  function render() {
    if (!AUTH.check()) return showLogin();
    document.getElementById('app').classList.remove('auth-out');
    if (!canSee(state.route)) {
      UI.toast(`当前角色「${(DB.session() || {}).role || '未分配'}」无权访问该页面,已返回经营看板`, 'warn');
      state.route = 'dashboard';
      location.hash = '#/dashboard';
    }
    const { view, title } = resolve(state.route);
    const html = view(state.route);
    document.getElementById('view').innerHTML = html;
    document.title = title + ' · Sailfish ERP';
    paintNav();
    paintTopbar(title);
    paintFoot();
    AUTH.keepAlive();
    bindCommon();
    const ent = entityOf(state.route);
    if (ent) {
      LIST.bind(document.getElementById('view'), ent);
    } else if (isFlow(state.route)) {
      FLOW.bind[state.route] && FLOW.bind[state.route](document.getElementById('view'));
    } else if (REPORTS.bind[state.route]) {
      REPORTS.bind[state.route](document.getElementById('view'));
    } else if (state.route === 'dashboard' || state.route === 'todo') {
      DASH.bind[state.route] && DASH.bind[state.route](document.getElementById('view'));
    } else if (state.route === 'settings' || state.route === 'guide') {
      EXTRAS.bind[state.route] && EXTRAS.bind[state.route](document.getElementById('view'));
    }
    document.getElementById('view').scrollTop = 0;
  }
  function resolve(route) {
    if (route.indexOf('reports/') === 0) {
      const key = route.slice(8);
      return { view: () => REPORTS.render(key), title: (REPORTS.TITLES[key] || '报表') };
    }
    if (isFlow(route)) return { view: () => FLOW[route](), title: FLOW.titles[route] };
    if (route === 'dashboard') return { view: () => DASH.board(), title: '经营看板' };
    if (route === 'todo') return { view: () => DASH.todo(), title: '待办任务' };
    if (route === 'settings') return { view: () => EXTRAS.settings(), title: '系统设置' };
    if (route === 'guide') return { view: () => EXTRAS.guide(), title: '关于与数据字典' };
    const ent = entityOf(route);
    if (ent) return { view: () => LIST.render(ent), title: SCHEMA.entities[ent].label };
    return { view: () => DASH.board(), title: '经营看板' };
  }

  function refresh(_, keepDrawer) {
    if (!keepDrawer) render(); else paintNav();
  }

  /* ---------------- 登录态 / 页脚 ---------------- */
  function showLogin(msg) {
    document.getElementById('app').classList.add('auth-out');
    document.getElementById('sidebar').innerHTML = '';
    document.getElementById('topbar').innerHTML = '';
    document.getElementById('view').innerHTML = AUTH.page();
    document.title = '登录 · Sailfish ERP';
    AUTH.bind(document.getElementById('view'));
    paintFoot();
    if (msg) UI.toast(msg, 'warn');
  }
  function enter(route) {
    document.getElementById('app').classList.remove('auth-out');
    state.route = route || 'dashboard';
    location.hash = '#/' + state.route;
    render();
  }
  function paintFoot() {
    const el = document.getElementById('app-foot');
    if (!el) return;
    el.innerHTML = `© 2026 <a href="https://pengline.cn/" target="_blank" rel="noopener">余一叶知秋尽</a>` +
      `<span class="sep">|</span>Sailfish ERP 演示环境 · 数据仅保存在本机浏览器` +
      `<span class="sep">|</span>种子版本 ${esc(DB.all().seedVersion || '—')}`;
  }

  function paintNav() {
    const ent = entityOf(state.route);
    const pendAp = DB.where('approval', a => a.status === 'pending').length;
    /* 待办角标与待办页合计同源:按事项数,不是分类数;订单中心角标 = 执行中订单数 */
    const todoCnt = DASH.todoStats().tasks;
    const ordCnt = { approvals: pendAp, todo: todoCnt, orders: FLOW.ordersStats().open.length };
    /* 整栏 innerHTML 重绘会把 .nav 的滚动位置打回顶部:同一路由内的重绘(切时间范围、动作后刷新)
       沿用原位置,只有跨路由跳转才把选中项滚进视野,避免每次点菜单都从头开始 */
    const oldNav = document.querySelector('#sidebar .nav');
    const keepTop = oldNav && state.route === navRoute ? oldNav.scrollTop : null;
    document.getElementById('sidebar').innerHTML = `
      <div class="logo">${logoSVG()}<div class="logo-text"><b>Sailfish ERP</b><i>Enterprise Resource Planning</i></div></div>
      <nav class="nav">${NAV.map(g => {
        const items = g.items.filter(it => canSee(routeOf(it)));
        if (!items.length) return '';
        return `<div class="nav-group-title">${g.group}</div>
        ${items.map(it => {
          const route = routeOf(it);
          const isEnt = SCHEMA.entities[route];
          const active = state.route === route || (isEnt && ent === route);
          const cnt = isEnt ? countBadge(route) : (ordCnt[route] || null);
          return `<div class="nav-item ${active ? 'active' : ''}" data-route="${route}" title="${it.label}">${UI.icon(it.icon)}<span class="nav-label">${it.label}</span>${cnt ? `<span class="cnt">${cnt}</span>` : ''}</div>`;
        }).join('')}`;
      }).join('')}
      </nav>
      <div class="side-foot">${UI.icon('database')}
        <div class="side-user-name">${esc(DB.all().meta.company.slice(0, 6))}…<span>账套 2026 · 本地存储</span></div></div>`;
    UI.$$('#sidebar [data-route]').forEach(el => el.addEventListener('click', () => go(el.dataset.route)));
    locateNav(keepTop);
    navRoute = state.route;
  }
  /* 只滚 .nav 自身,不用 scrollIntoView,免得连带把外层容器一起滚走 */
  function locateNav(keepTop) {
    const nav = UI.$('#sidebar .nav');
    if (!nav) return;
    if (keepTop != null) { nav.scrollTop = keepTop; return; }
    const active = UI.$('#sidebar .nav-item.active');
    if (!active) return;
    const a = active.getBoundingClientRect(), n = nav.getBoundingClientRect();
    /* 已在视野内就不动,只在被顶出/沉底时把选中项居中,避免点击后菜单乱跳 */
    if (a.top < n.top || a.bottom > n.bottom) nav.scrollTop += (a.top - n.top) - (nav.clientHeight - a.height) / 2;
  }
  function routeOf(it) { return it.id.indexOf('/') > 0 ? 'reports/' + it.id.split('/')[1] : it.id; }
  function countBadge(route) {
    if (route === 'activity') return null;
    const e = SCHEMA.entities[route];
    if (!e) return null;
    if (e.statusField) {
      const open = DB.where(route, r => ['draft', 'confirmed', 'pending', 'open', 'partial', 'overdue', 'sent', 'quoted', 'inspecting', 'issued', 'received', 'approved', 'repairing'].indexOf(r[e.statusField]) >= 0).length;
      return open || null;
    }
    if (route === 'stock') { const low = DB.where('stock', s => s.status !== 'normal').length; return low || null; }
    return null;
  }
  function esc(s) { return UI.esc(s); }

  function paintTopbar(title) {
    const td = DASH.todoStats();
    const crumb = NAV.reduce((acc, g) => {
      const it = g.items.find(i => routeOf(i) === state.route);
      return it ? `<span class="crumb">${g.group} / <b>${it.label}</b></span>` : acc;
    }, `<span class="crumb"><b>${esc(title)}</b></span>`);
    const role = ACT.PERM.currentRole();
    const me = DB.where('users', u => u.name === DB.currentUser())[0] || {};
    document.getElementById('topbar').innerHTML = `${crumb}
      <div class="topbar-right">
        <div class="searchbox" data-cmdk>${UI.icon('search')}<span>搜索单据、客户、商品…</span><kbd>Ctrl K</kbd></div>
        <div class="btn-group" data-period">${PERIODS.map(p => `<button data-p="${p.d}" class="${state.period === p.d ? 'on' : ''}">${p.label}</button>`).join('')}</div>
        <button class="icon-btn" data-alerts title="待办与预警:共 ${td.tasks} 项待办,分布在 ${td.groups} 个业务环节">${UI.icon('bell')}${td.tasks ? `<span class="cnt">${td.tasks > 99 ? '99+' : td.tasks}</span>` : ''}</button>
        <button class="icon-btn" data-refresh title="刷新数据">${UI.icon('refresh')}</button>
        <div class="flex" style="gap:9px;padding-left:6px;border-left:1px solid var(--border);cursor:pointer" data-user>
          <div class="avatar">${esc(initials(DB.currentUser()))}</div>
          <div style="line-height:1.25" class="hide-sm"><b style="font-size:12.5px">${esc(DB.currentUser())}</b><div class="muted" style="font-size:11px">${esc((role || {}).name || me.role || '未分配角色')}${role ? ' · 级别 ' + role.level : ''}</div></div>
        </div>
      </div>`;
    UI.$('[data-cmdk]').addEventListener('click', openCmdk);
    UI.$('[data-refresh]').addEventListener('click', () => { render(); UI.toast('数据已刷新'); });
    UI.$('[data-alerts]').addEventListener('click', () => { state.period = 30; go('todo'); });
    UI.$('[data-user]').addEventListener('click', () => AUTH.menu());
    UI.$$('#topbar [data-p]').forEach(b => b.addEventListener('click', () => {
      UI.$$('#topbar [data-p]').forEach(x => x.classList.remove('on')); b.classList.add('on');
      state.period = +b.dataset.p; render();
    }));
  }
  function initials(n) { return n ? n.slice(0, 2) : 'ER'; }

  function bindCommon() {
    UI.$$('#view [data-open]').forEach(el => el.addEventListener('click', ev => {
      ev.stopPropagation();
      const [ent, id] = el.dataset.open.split('=');
      DOC.open(ent, decodeURIComponent(id));
    }));
    UI.$$('#view [data-route]').forEach(el => el.addEventListener('click', () => go(el.dataset.route)));
    UI.$$('#view [data-new-doc]').forEach(el => el.addEventListener('click', () => DOC.newDoc(el.dataset.newDoc)));
    UI.$$('#view [data-action]').forEach(el => el.addEventListener('click', () => EXTRAS.action(el.dataset.action, el)));
  }

  function go(route) {
    state.route = route;
    location.hash = '#/' + route;
    render();
  }

  /* ---------------- 全局搜索 (Ctrl+K) ---------------- */
  let cmdkEl = null;
  function openCmdk() {
    if (cmdkEl) return;
    cmdkEl = UI.frag(`<div class="cmdk"><div class="cmdk-box">
      <input placeholder="搜索单据号 / 客户 / 供应商 / 商品 / 菜单…" spellcheck="false">
      <div class="cmd-list" id="cmd-list"></div></div></div>`);
    document.getElementById('overlay-root').appendChild(cmdkEl);
    const input = UI.$('input', cmdkEl), list = UI.$('#cmd-list', cmdkEl);
    let items = [], cursor = 0;
    function paint() {
      list.innerHTML = items.map((it, i) => `<div class="cmd-item ${i === cursor ? 'on' : ''}" data-i="${i}">
        <span class="ico">${UI.icon(it.icon)}</span><div><div>${esc(it.title)}</div><div class="muted small">${esc(it.sub)}</div></div><span class="kind">${esc(it.kind)}</span></div>`).join('') || `<div class="empty" style="padding:28px">无匹配结果</div>`;
      UI.$$('.cmd-item', list).forEach(el => el.addEventListener('click', () => pick(+el.dataset.i)));
    }
    function search(q) {
      q = q.trim().toLowerCase();
      items = [];
      NAV.forEach(g => g.items.forEach(it => {
        const route = it.id.indexOf('/') > 0 ? 'reports/' + it.id.split('/')[1] : it.id;
        if (!canSee(route)) return;
        if (!q || it.label.toLowerCase().indexOf(q) >= 0) items.push({ kind: '菜单', icon: it.icon, title: it.label, sub: g.group, go: () => go(route) });
      }));
      if (q) {
        const add = (entity, rows, pickField, subFn, icon) => canSee(entity) && rows.slice(0, 5).forEach(r => items.push({
          kind: SCHEMA.entities[entity].label, icon, title: r[pickField], sub: subFn(r), go: () => LIST.openDoc(entity, r[SCHEMA.entities[entity].pk]) }));
        add('sales_order', DB.where('sales_order', o => (o.no + o.customer_name).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.customer_name} · ¥${UI.money(o.total)}`, 'file');
        add('purchase_order', DB.where('purchase_order', o => (o.no + o.supplier_name).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.supplier_name} · ¥${UI.money(o.total)}`, 'file');
        add('rfq', DB.where('rfq', o => (o.no + o.title + o.buyer).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.title} · 最低报价 ¥${UI.money(o.amount)}`, 'search');
        add('product_release', DB.where('product_release', o => (o.no + o.name + o.owner).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.name} · 拟售价 ¥${UI.money(o.target_price)}`, 'trendUp');
        add('os_order', DB.where('os_order', o => (o.no + o.processor_name + o.output_name).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.processor_name} · ${o.output_name}`, 'swap');
        add('rma', DB.where('rma', o => (o.no + o.customer_name + o.so).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.customer_name} · ${SCHEMA.entities.rma.fields.type.opts[o.type] || o.type}`, 'refresh');
        add('approval', DB.where('approval', o => (o.no + o.title + o.biz).toLowerCase().indexOf(q) >= 0), 'no', o => `${SCHEMA.entities.approval.fields.module.opts[o.module] || o.module} · ${o.biz}`, 'check');
        add('supplier_apply', DB.where('supplier_apply', o => (o.no + o.company).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.company} · ${o.status}`, 'user');
        add('processors', DB.where('processors', o => (o.code + o.name).toLowerCase().indexOf(q) >= 0), 'name', o => `${o.code} · ${SCHEMA.entities.processors.fields.process_type.opts[o.process_type] || ''}`, 'copy');
        add('invoice', DB.where('invoice', o => (o.no + o.customer_name).toLowerCase().indexOf(q) >= 0), 'no', o => `未收 ¥${UI.money(o.balance)}`, 'receipt');
        add('bill', DB.where('bill', o => (o.no + o.supplier_name).toLowerCase().indexOf(q) >= 0), 'no', o => `未付 ¥${UI.money(o.balance)}`, 'receipt');
        add('customers', DB.where('customers', c => (c.code + c.name).toLowerCase().indexOf(q) >= 0), 'name', c => c.code + ' · ' + c.region, 'users');
        add('suppliers', DB.where('suppliers', s => (s.code + s.name).toLowerCase().indexOf(q) >= 0), 'name', s => s.code + ' · ' + s.category, 'truck');
        add('products', DB.where('products', p => (p.code + p.name).toLowerCase().indexOf(q) >= 0), 'name', p => `${p.code} · 售价 ¥${UI.money(p.price)} · 库存 ${DB.where('stock', x => x.product === p.code).reduce((a, x) => a + x.qty, 0)}`, 'box');
        add('journal', DB.where('journal', j => (j.no + j.memo).toLowerCase().indexOf(q) >= 0), 'no', j => j.memo, 'book');
        add('bom', DB.where('bom', b => (b.no + b.name + b.product + b.product_name).toLowerCase().indexOf(q) >= 0), 'no', b => `${b.name} · ${b.product_name} · ${(SCHEMA.STATUS[b.status] || {}).l || b.status}`, 'layers');
        add('mrp_run', DB.where('mrp_run', r => (r.no + r.name + (r.note || '')).toLowerCase().indexOf(q) >= 0), 'no', r => `${r.name} · ${r.rows_cnt || 0} 行建议 · 缺料 ${r.shortage_cnt || 0}`, 'zap');
      }
      items = items.slice(0, 24); cursor = 0; paint();
    }
    input.addEventListener('input', () => search(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { cursor = Math.min(items.length - 1, cursor + 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cursor = Math.max(0, cursor - 1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter') { pick(cursor); }
      else if (e.key === 'Escape') close();
    });
    cmdkEl.addEventListener('click', e => { if (e.target === cmdkEl) close(); });
    function pick(i) { const it = items[i]; if (!it) return; close(); it.go(); }
    function close() { cmdkEl.remove(); cmdkEl = null; }
    search('');
    setTimeout(() => input.focus(), 50);
  }

  function logoSVG() {
    return `<svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="9" fill="url(#lg)"/><path d="M8 20.5c3.4 2.2 5.2-4.6 8.2-2.4 3 2.2 3.4-6 6.4-4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M8 12.5c2.6 1.4 4.2-2 6.6-.6" stroke="#C7D2FE" stroke-width="1.8" stroke-linecap="round"/><defs><linearGradient id="lg" x1="0" y1="0" x2="32" y2="32"><stop stop-color="#4F46E5"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs></svg>`;
  }

  /* ---------------- 启动 ---------------- */
  window.APP = { render, refresh, go, NAV, state, bindCommon, openCmdk, logoSVG, showLogin, enter, paintFoot, period: () => state.period || 30 };

  /** 计划夜跑:重置演示库后自动补一轮安全库存运算,计划台账不留空白(只读运算,不落账) */
  function nightlyPlan() {
    const meta = DB.all().meta;
    if (meta.mrpBootAt) return;
    meta.mrpBootAt = DB.today();
    if (!DB.list('mrp_run').length) {
      try {
        ACT.MRP.run({ source: 'safety', horizon: 30, name: `${DB.today().slice(0, 7)} 安全库存日算`,
          note: '系统夜跑按「补至安全库存」口径生成的当日快照,供计划员复核后下达' });
      } catch (e) { console.info('计划夜跑跳过:', e.message); }
    }
    DB.persist();
  }

  function boot() {
    try { DB.init(); } catch (e) { console.error(e); alert('数据初始化失败:' + e.message); return; }
    nightlyPlan();
    const h = decodeURIComponent(location.hash || '').replace(/^#\//, '');
    state.route = (h && (SCHEMA.entities[h] || ['dashboard', 'todo', 'settings', 'guide'].includes(h) || isFlow(h) || h.indexOf('reports/') === 0)) ? h : 'dashboard';
    if (!AUTH.check()) { showLogin(); paintFoot(); } else render();
    window.addEventListener('hashchange', () => {
      if (!AUTH.check()) return showLogin();
      const r = decodeURIComponent(location.hash || '').replace(/^#\//, '');
      if (r && r !== state.route) { state.route = r; render(); }
    });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdk(); }
      if (e.key === 'Escape') { const m = UI.$$('.mask'); if (m.length) m[m.length - 1].remove(); }
    });
    console.info('%c Sailfish ERP 已启动 ', 'background:#4F46E5;color:#fff;border-radius:4px;padding:2px 6px', DB.stats());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
