/* ============================================================
 * app.js — 应用外壳:导航 / 路由(hash) / 顶栏 / 全局搜索 / 初始化
 * ============================================================ */
(function () {
  const NAV = [
    { group: '工作台', items: [
      { id: 'dashboard', label: '经营看板', icon: 'dashboard' },
      { id: 'todo', label: '待办任务', icon: 'clipboard' },
    ] },
    { group: '基础数据', items: [
      { id: 'products', label: '商品 / 物料', icon: 'box' },
      { id: 'customers', label: '客户档案', icon: 'users' },
      { id: 'suppliers', label: '供应商档案', icon: 'truck' },
      { id: 'warehouses', label: '仓库与库位', icon: 'home' },
      { id: 'users', label: '用户与权限', icon: 'user' },
    ] },
    { group: '销售管理', items: [
      { id: 'sales_order', label: '销售订单', icon: 'file' },
      { id: 'delivery', label: '销售出库单', icon: 'send' },
      { id: 'invoice', label: '销售发票 / 应收', icon: 'receipt' },
      { id: 'receipt', label: '收款单', icon: 'wallet' },
    ] },
    { group: '采购管理', items: [
      { id: 'purchase_req', label: '采购申请', icon: 'clipboard' },
      { id: 'purchase_order', label: '采购订单', icon: 'file' },
      { id: 'gr', label: '采购收货单', icon: 'download' },
      { id: 'bill', label: '采购账单 / 应付', icon: 'receipt' },
      { id: 'payment', label: '付款单', icon: 'card' },
    ] },
    { group: '库存管理', items: [
      { id: 'stock', label: '库存现量', icon: 'layers' },
      { id: 'stock_movements', label: '出入库流水', icon: 'swap' },
      { id: 'transfer', label: '库存调拨', icon: 'swap' },
      { id: 'stocktake', label: '库存盘点', icon: 'grid' },
    ] },
    { group: '财务管理', items: [
      { id: 'gl_account', label: '会计科目余额', icon: 'book' },
      { id: 'journal', label: '记账凭证', icon: 'book' },
      { id: 'reports/ar', label: '应收账龄分析', icon: 'chart' },
      { id: 'reports/ap', label: '应付账龄分析', icon: 'chart' },
    ] },
    { group: '报表分析', items: [
      { id: 'reports/sales', label: '销售分析', icon: 'trendUp' },
      { id: 'reports/purchase', label: '采购分析', icon: 'trendDown' },
      { id: 'reports/inventory', label: '库存与周转', icon: 'pie' },
      { id: 'reports/pl', label: '利润表', icon: 'grid' },
    ] },
    { group: '系统', items: [
      { id: 'activity', label: '操作日志', icon: 'clock' },
      { id: 'reports/dashboard2', label: '自定义报表', icon: 'filter' },
      { id: 'settings', label: '系统设置', icon: 'settings' },
      { id: 'guide', label: '关于与数据字典', icon: 'info' },
    ] },
  ];

  const state = { route: 'dashboard', collapsed: false };

  /* ---------------- 渲染 ---------------- */
  /** 路由归一:侧边栏与全局搜索使用裸实体名,深链兼容 entity: 前缀 */
  function entityOf(route) {
    if (route.indexOf('entity:') === 0) return route.slice(7);
    return SCHEMA.entities[route] ? route : '';
  }
  function render() {
    const { view, title } = resolve(state.route);
    const html = view(state.route);
    document.getElementById('view').innerHTML = html;
    document.title = title + ' · Sailfish ERP';
    paintNav();
    paintTopbar(title);
    bindCommon();
    const ent = entityOf(state.route);
    if (ent) {
      LIST.bind(document.getElementById('view'), ent);
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

  function paintNav() {
    const ent = entityOf(state.route);
    document.getElementById('sidebar').innerHTML = `
      <div class="logo">${logoSVG()}<div class="logo-text"><b>Sailfish ERP</b><i>Enterprise Resource Planning</i></div></div>
      <nav class="nav">${NAV.map(g => `<div class="nav-group-title">${g.group}</div>
        ${g.items.map(it => {
          const route = it.id.indexOf('/') > 0 ? 'reports/' + it.id.split('/')[1] : it.id;
          const isEnt = SCHEMA.entities[route];
          const active = state.route === route || (isEnt && ent === route);
          const cnt = isEnt ? countBadge(route) : null;
          return `<div class="nav-item ${active ? 'active' : ''}" data-route="${route}" title="${it.label}">${UI.icon(it.icon)}<span class="nav-label">${it.label}</span>${cnt ? `<span class="cnt">${cnt}</span>` : ''}</div>`;
        }).join('')}`).join('')}
      </nav>
      <div class="side-foot">${UI.icon('database')}
        <div class="side-user-name">${esc(DB.all().meta.company.slice(0, 6))}…<span>账套 2026 · 本地存储</span></div></div>`;
    UI.$$('#sidebar [data-route]').forEach(el => el.addEventListener('click', () => go(el.dataset.route)));
  }
  function countBadge(route) {
    if (route === 'activity') return null;
    const e = SCHEMA.entities[route];
    if (!e) return null;
    if (e.statusField) {
      const open = DB.where(route, r => ['draft', 'confirmed', 'pending', 'open', 'partial', 'overdue'].indexOf(r[e.statusField]) >= 0).length;
      return open || null;
    }
    if (route === 'stock') { const low = DB.where('stock', s => s.status !== 'normal').length; return low || null; }
    return null;
  }
  function esc(s) { return UI.esc(s); }

  function paintTopbar(title) {
    const alerts = alertCount();
    const crumb = NAV.map(g => ({ group: g.group, items: g.items })).reduce((acc, g) => {
      const it = g.items.find(i => (i.id.indexOf('/') > 0 ? 'reports/' + i.id.split('/')[1] : i.id) === state.route);
      return it ? `<span class="crumb">${g.group} / <b>${it.label}</b></span>` : acc;
    }, `<span class="crumb"><b>${esc(title)}</b></span>`);
    document.getElementById('topbar').innerHTML = `${crumb}
      <div class="topbar-right">
        <div class="searchbox" data-cmdk>${UI.icon('search')}<span>搜索单据、客户、商品…</span><kbd>Ctrl K</kbd></div>
        <div class="btn-group" data-period><button data-p="30" class="on">近 30 天</button><button data-p="90">近 90 天</button><button data-p="180">半年</button></div>
        <button class="icon-btn" data-alerts title="待办与预警">${UI.icon('bell')}${alerts ? `<span class="dot"></span>` : ''}</button>
        <button class="icon-btn" data-refresh title="刷新数据">${UI.icon('refresh')}</button>
        <div class="flex" style="gap:9px;padding-left:6px;border-left:1px solid var(--border);cursor:pointer" data-user>
          <div class="avatar">${esc(initials(DB.currentUser()))}</div>
          <div style="line-height:1.25" class="hide-sm"><b style="font-size:12.5px">${esc(DB.currentUser())}</b><div class="muted" style="font-size:11px">系统管理员 · 陈立群团队</div></div>
        </div>
      </div>`;
    UI.$('[data-cmdk]').addEventListener('click', openCmdk);
    UI.$('[data-refresh]').addEventListener('click', () => { render(); UI.toast('数据已刷新'); });
    UI.$('[data-alerts]').addEventListener('click', () => { state.period = 30; go('todo'); });
    UI.$('[data-user]').addEventListener('click', switchUser);
    UI.$$('#topbar [data-p]').forEach(b => b.addEventListener('click', () => {
      UI.$$('#topbar [data-p]').forEach(x => x.classList.remove('on')); b.classList.add('on');
      state.period = +b.dataset.p; render();
    }));
  }
  function initials(n) { return n ? n.slice(0, 2) : 'ER'; }
  function alertCount() {
    return DB.where('sales_order', o => o.status === 'confirmed').length +
      DB.where('purchase_req', p => p.status === 'pending').length +
      DB.where('invoice', i => i.status === 'overdue').length +
      DB.where('stock', s => s.status !== 'normal').length;
  }

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
        if (!q || it.label.toLowerCase().indexOf(q) >= 0) items.push({ kind: '菜单', icon: it.icon, title: it.label, sub: g.group, go: () => go(route) });
      }));
      if (q) {
        const add = (entity, rows, pickField, subFn, icon) => rows.slice(0, 5).forEach(r => items.push({
          kind: SCHEMA.entities[entity].label, icon, title: r[pickField], sub: subFn(r), go: () => DOC.open(entity, r[SCHEMA.entities[entity].pk]) }));
        add('sales_order', DB.where('sales_order', o => (o.no + o.customer_name).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.customer_name} · ¥${UI.money(o.total)}`, 'file');
        add('purchase_order', DB.where('purchase_order', o => (o.no + o.supplier_name).toLowerCase().indexOf(q) >= 0), 'no', o => `${o.supplier_name} · ¥${UI.money(o.total)}`, 'file');
        add('invoice', DB.where('invoice', o => (o.no + o.customer_name).toLowerCase().indexOf(q) >= 0), 'no', o => `未收 ¥${UI.money(o.balance)}`, 'receipt');
        add('bill', DB.where('bill', o => (o.no + o.supplier_name).toLowerCase().indexOf(q) >= 0), 'no', o => `未付 ¥${UI.money(o.balance)}`, 'receipt');
        add('customers', DB.where('customers', c => (c.code + c.name).toLowerCase().indexOf(q) >= 0), 'name', c => c.code + ' · ' + c.region, 'users');
        add('suppliers', DB.where('suppliers', s => (s.code + s.name).toLowerCase().indexOf(q) >= 0), 'name', s => s.code + ' · ' + s.category, 'truck');
        add('products', DB.where('products', p => (p.code + p.name).toLowerCase().indexOf(q) >= 0), 'name', p => `${p.code} · 售价 ¥${UI.money(p.price)} · 库存 ${DB.where('stock', x => x.product === p.code).reduce((a, x) => a + x.qty, 0)}`, 'box');
        add('journal', DB.where('journal', j => (j.no + j.memo).toLowerCase().indexOf(q) >= 0), 'no', j => j.memo, 'book');
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

  function switchUser() {
    const users = DB.list('users');
    UI.modal({ title: '切换当前登录用户', subtitle: '演示系统:角色影响待办视图与单据制单人',
      body: `<div class="chips">${users.map(u => `<span class="chip ${u.name === DB.currentUser() ? 'on' : ''}" data-u="${esc(u.name)}">${esc(u.name)}<span class="n">${esc(u.role)}</span></span>`).join('')}</div>
        <div class="notice mt16">${UI.icon('info')}<div>切换后新建单据的制单人/审核人记录会同步变更,用于演示岗位分离与审批流转。</div></div>`,
      actions: [{ label: '关闭' }], width: 'mid' });
    setTimeout(() => {
      const box = UI.$$('.modal .chip');
      box.forEach(c => c.addEventListener('click', () => {
        DB.all().meta.currentUser = c.dataset.u; DB.persist();
        UI.toast('已切换为 ' + c.dataset.u); UI.$('.mask').remove(); render();
      }));
    }, 30);
  }

  function logoSVG() {
    return `<svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="9" fill="url(#lg)"/><path d="M8 20.5c3.4 2.2 5.2-4.6 8.2-2.4 3 2.2 3.4-6 6.4-4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M8 12.5c2.6 1.4 4.2-2 6.6-.6" stroke="#C7D2FE" stroke-width="1.8" stroke-linecap="round"/><defs><linearGradient id="lg" x1="0" y1="0" x2="32" y2="32"><stop stop-color="#4F46E5"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs></svg>`;
  }

  /* ---------------- 启动 ---------------- */
  window.APP = { render, refresh, go, NAV, state, bindCommon, openCmdk, period: () => state.period || 30 };

  function boot() {
    try { DB.init(); } catch (e) { console.error(e); alert('数据初始化失败:' + e.message); return; }
    const h = decodeURIComponent(location.hash || '').replace(/^#\//, '');
    state.route = (h && (SCHEMA.entities[h] || ['dashboard', 'todo', 'settings', 'guide'].includes(h) || h.indexOf('reports/') === 0)) ? h : 'dashboard';
    render();
    window.addEventListener('hashchange', () => {
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
