/* ============================================================
 * views-factory.js — 通用列表视图(由 schema 驱动)
 * 每个实体:搜索 / 状态筛选 / 排序 / 分页 / 新建编辑 / 下钻明细 / 导出
 * ============================================================ */
window.LIST = (function () {

  const state = {};   // entity -> {q,status,page,sort,asc,filters}
  function st(entity) {
    return state[entity] || (state[entity] = { q: '', status: '', page: 1, sort: null, asc: false, filters: {} });
  }

  /* 列定义:根据 schema 字段自动生成,可按实体覆盖 */
  const COLUMNS = {
    products: ['code', 'name', 'category', 'brand', 'cost', 'price', 'safety_qty', 'status'],
    customers: ['code', 'name', 'type', 'region', 'credit_limit', 'salesperson', 'status'],
    suppliers: ['code', 'name', 'category', 'contact', 'phone', 'lead_time', 'rating', 'status'],
    warehouses: ['code', 'name', 'location', 'manager', 'area', 'status'],
    users: ['code', 'name', 'dept', 'role', 'email', 'last_login', 'status'],
    stock: ['product', 'product_name', 'warehouse', 'qty', 'reserved', 'available', 'cost', 'value', 'status'],
    stock_movements: ['no', 'date', 'type', 'product', 'product_name', 'warehouse', 'qty', 'amount', 'ref'],
    sales_order: ['no', 'date', 'customer_name', 'warehouse', 'required_date', 'salesperson', 'total', 'status'],
    delivery: ['no', 'date', 'so', 'customer_name', 'warehouse', 'amount', 'carrier', 'status'],
    invoice: ['no', 'date', 'customer_name', 'due_date', 'total', 'paid', 'balance', 'status'],
    purchase_req: ['no', 'date', 'dept', 'requester', 'need_date', 'amount', 'status'],
    purchase_order: ['no', 'date', 'supplier_name', 'warehouse', 'expected_date', 'buyer', 'total', 'status'],
    gr: ['no', 'date', 'po', 'supplier_name', 'warehouse', 'amount', 'status'],
    bill: ['no', 'date', 'supplier_name', 'gr', 'due_date', 'total', 'paid', 'balance', 'status'],
    transfer: ['no', 'date', 'from_wh', 'to_wh', 'status', 'user', 'note'],
    stocktake: ['no', 'date', 'warehouse', 'diff_lines', 'diff_amount', 'status', 'user'],
    payment: ['no', 'date', 'supplier_name', 'bill', 'amount', 'method', 'status'],
    receipt: ['no', 'date', 'customer_name', 'invoice', 'amount', 'method', 'status'],
    journal: ['no', 'date', 'type', 'ref', 'memo', 'debit', 'status'],
    gl_account: ['code', 'name', 'type', 'direction', 'balance'],
    activity: ['time', 'user', 'module', 'action', 'ref', 'detail'],
  };
  const PAGE_SIZE = 15;

  /* 派生行数据(库存/科目等需要即时计算) */
  function rowsOf(entity) {
    return DB.list(entity);
  }

  function filtered(entity) {
    const s = st(entity), e = SCHEMA.entities[entity];
    let rows = rowsOf(entity).slice();
    if (s.q) {
      const q = s.q.toLowerCase();
      rows = rows.filter(r => Object.keys(r).some(k => typeof r[k] === 'string' || typeof r[k] === 'number'
        ? String(r[k]).toLowerCase().indexOf(q) >= 0 : false));
    }
    if (e.statusField && s.status) rows = rows.filter(r => r[e.statusField] === s.status);
    Object.keys(s.filters).forEach(k => {
      const v = s.filters[k];
      if (v !== '' && v !== undefined && v !== null) rows = rows.filter(r => String(r[k]) === String(v));
    });
    if (s.sort) {
      rows.sort((a, b) => {
        let x = a[s.sort], y = b[s.sort];
        if (typeof x === 'number' && typeof y === 'number') return s.asc ? x - y : y - x;
        x = String(x === undefined || x === null ? '' : x); y = String(y === undefined || y === null ? '' : y);
        return s.asc ? x.localeCompare(y, 'zh') : y.localeCompare(x, 'zh');
      });
    } else if (e.nextSeqField) {
      rows.sort((a, b) => String(b[e.pk]).localeCompare(String(a[e.pk])));
    } else {
      rows.sort((a, b) => String(b[e.pk] || '').localeCompare(String(a[e.pk] || '')));
    }
    return rows;
  }

  function cell(entity, key, row) {
    const f = SCHEMA.entities[entity].fields[key];
    if (!f) return esc(row[key]);
    switch (f.t) {
      case 'money': return `<span class="money">${money(row[key])}</span>`;
      case 'int': return `<span class="money">${num(row[key])}</span>`;
      case 'percent': return pct(row[key]);
      case 'date': return `<span class="nowrap">${dateCN(row[key])}</span>`;
      case 'datetime': return `<span class="nowrap muted small">${esc(row[key])}</span>`;
      case 'code': return `<span class="mono">${esc(row[key])}</span>`;
      case 'select': return f.badge || ['draft', 'confirmed', 'partial', 'done', 'cancelled', 'open', 'paid', 'partial_paid', 'overdue', 'pending', 'approved', 'rejected', 'converted', 'posted', 'enabled', 'disabled', 'active', 'inactive', 'normal', 'low', 'shortage', 'closed', 'submitted'].indexOf(row[key]) >= 0 ? badge(row[key]) : esc(optText(f, row[key]));
      case 'ref': return cellRef(f.ref, row[key]);
      default: return esc(row[key]);
    }
  }
  function optText(f, v) {
    const opts = typeof f.opts === 'function' ? f.opts() : f.opts;
    if (!opts) return v;
    if (SCHEMA.STATUS[v]) return SCHEMA.STATUS[v].l;
    const o = opts[v];
    if (o === undefined) return v;
    return typeof o === 'object' ? v : o;
  }
  function pct(v) { return v ? (v * 100).toFixed(0) + '%' : '0%'; }
  function esc(s) { return UI.esc(s); }
  const money = UI.money, num = UI.num, dateCN = UI.dateCN, badge = UI.badge, cellRef = UI.cellRef;

  /* 名称列加粗并可点击 */
  function nameCell(entity, key, row) {
    const e = SCHEMA.entities[entity];
    const label = row[key];
    return `<span class="cell-link cell-main" data-open-doc="${entity}=${encodeURIComponent(row[e.pk])}">${esc(label)}</span>`;
  }

  /* 额外筛选器 */
  const FILTERS = {
    stock: [{ k: 'warehouse', label: '仓库', entity: 'warehouses' }, { k: 'status', label: '库存状态', opts: { normal: '正常', low: '库存偏低', shortage: '缺货' } }],
    stock_movements: [{ k: 'warehouse', label: '仓库', entity: 'warehouses' }, { k: 'type', label: '类型', opts: SCHEMA.entities.stock_movements.fields.type.opts }],
    sales_order: [{ k: 'warehouse', label: '发货仓', entity: 'warehouses' }, { k: 'salesperson', label: '销售员', opts: () => fromList('sales_order', 'salesperson') }],
    purchase_order: [{ k: 'warehouse', label: '收货仓', entity: 'warehouses' }, { k: 'buyer', label: '采购员', opts: () => fromList('purchase_order', 'buyer') }],
    invoice: [{ k: 'customer', label: '客户', entity: 'customers' }],
    bill: [{ k: 'supplier', label: '供应商', entity: 'suppliers' }],
    journal: [{ k: 'type', label: '业务类型', opts: SCHEMA.entities.journal.fields.type.opts }],
    customers: [{ k: 'region', label: '区域', opts: SCHEMA.entities.customers.fields.region.opts }, { k: 'type', label: '类型', opts: fromOpts('customers', 'type') }],
    products: [{ k: 'category', label: '类目', opts: fromOpts('products', 'category') }],
    suppliers: [{ k: 'category', label: '类目', opts: fromOpts('suppliers', 'category') }],
    activity: [{ k: 'module', label: '模块', opts: () => fromList('activity', 'module') }],
  };
  function fromList(entity, field) {
    const out = {};
    DB.list(entity).forEach(r => { if (r[field]) out[r[field]] = r[field]; });
    return out;
  }
  function fromOpts(entity, field) { return SCHEMA.entities[entity].fields[field].opts; }

  /* 汇总条 */
  function summary(entity, rows) {
    const f = SCHEMA.entities[entity].fields;
    const sumKeys = Object.keys(f).filter(k => f[k].sum && COLUMNS[entity] && COLUMNS[entity].indexOf(k) >= 0);
    if (!sumKeys.length) return '';
    return `<div class="toolbar" style="border-top:1px solid var(--border);border-bottom:0;background:var(--surface-2)">
      <span class="muted small">当前筛选结果合计:</span>
      ${sumKeys.map(k => `<span class="small">${esc(f[k].l)} <b class="money" style="color:var(--text)">${money(rows.reduce((s, r) => s + (+r[k] || 0), 0))}</b></span>`).join(' · ')}
    </div>`;
  }

  function render(entity, mount) {
    const e = SCHEMA.entities[entity], s = st(entity);
    const rows = filtered(entity);
    const page = Math.min(s.page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
    const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const cols = (COLUMNS[entity] || Object.keys(e.fields)).map(k => {
      const f = e.fields[k] || {};
      const isPK = k === e.pk;
      return {
        k, label: f.l || k, align: f.t === 'money' || f.t === 'int' ? 'right' : 'left',
        sortable: true,
        render: row => {
          if (isPK && (e.doc || ['products', 'customers', 'suppliers', 'warehouses', 'users', 'gl_account'].indexOf(entity) >= 0)) return nameCell(entity, k, row);
          if (k === 'product_name' || k === 'customer_name' || k === 'supplier_name') return `<span class="${k === 'product_name' ? '' : 'cell-main'}">${esc(row[k] || '')}</span>` + (row.product ? `<div class="cell-sub mono">${esc(row.product)}</div>` : '');
          if (k === 'qty' && entity === 'stock_movements') return `<span class="money ${row.qty < 0 ? 'neg' : ''}" style="${row.qty < 0 ? 'color:var(--danger)' : ''}">${row.qty > 0 ? '+' : ''}${num(row.qty)}</span>`;
          if (k === 'balance') return `<span class="money" style="${(+row.balance < 0) ? 'color:var(--danger)' : ''}">${money(row.balance)}</span>`;
          if (k === 'available') return availCell(row);
          if (k === 'value') return `<span class="money strong">${money(row.value)}</span>`;
          if (k === 'rating') return `<div class="flex" style="gap:8px"><div class="progress" style="width:70px"><i class="${row.rating >= 80 ? 'ok' : row.rating >= 60 ? 'warn' : 'bad'}" style="width:${row.rating}%"></i></div><span class="small muted">${row.rating}</span></div>`;
          if (k === 'ref' && row[k]) return refLink(entity, row[k]);
          if (k === 'so' || k === 'po' || k === 'invoice' || k === 'bill' || k === 'gr') return row[k] ? cellRef(k === 'so' ? 'sales_order' : k === 'po' ? 'purchase_order' : k === 'invoice' ? 'invoice' : k === 'bill' ? 'bill' : 'gr', row[k]) : '—';
          if (k === 'name' && !isPK) return `<span class="cell-main">${esc(row[k])}</span>` + (row.code ? `<div class="cell-sub mono">${esc(row.code)}</div>` : '');
          if (k === 'type' && entity === 'gl_account') return badgeAccount(row.direction);
          if (k === 'detail') return `<span class="muted">${esc(row[k] || '')}</span>`;
          return cell(entity, k, row);
        }
      };
    });

    const statusOpts = e.statusField ? Object.keys(SCHEMA.entities[e.key || entity].fields[e.statusField].opts) : [];
    const counts = {};
    if (statusOpts.length) {
      rowsOf(entity).forEach(r => counts[r[e.statusField]] = (counts[r[e.statusField]] || 0) + 1);
      counts[''] = rowsOf(entity).length;
    }

    const canNew = !e.readonly && !e.hideNew;
    return `
    <div class="page-head">
      <div><h2>${esc(e.label)}</h2><div class="desc">数据表 <span class="mono">${esc(e.table)}</span> · 共 ${num(rowsOf(entity).length)} 条记录${e.doc ? ' · 单据支持行级明细与状态流转' : ''}</div></div>
      <div class="page-actions">
        <button class="btn" data-export>${icon('download')}导出 CSV</button>
        ${canNew ? `<button class="btn primary" data-new>${icon('plus')}新建${esc(e.label)}</button>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="toolbar">
        ${UI.toolbarSearch(s.q)}
        ${statusOpts.length ? UI.chips([{ v: '', l: '全部' }].concat(statusOpts.map(v => ({ v, l: SCHEMA.STATUS[v] ? SCHEMA.STATUS[v].l : v }))), s.status, counts) : ''}
        ${(FILTERS[entity] || []).map(f => filterSelect(entity, f, s)).join('')}
        ${(FILTERS[entity] || []).length || statusOpts.length ? `<button class="btn ghost sm" data-clear style="margin-left:auto">${icon('refresh')}重置筛选</button>` : ''}
      </div>
      ${UI.table(cols, pageRows, { pk: e.pk, sorted: s.sort, asc: s.asc, empty: '没有符合条件的记录', emptySub: '试试调整搜索关键字或清除筛选条件', onMount: mount })}
      ${summary(entity, rows)}
      <div class="table-foot">${UI.pager(rows.length, page, PAGE_SIZE)}</div>
    </div>`;
  }

  function badgeAccount(dir) { return `<span class="badge ${dir === 'debit' ? 'b-info' : 'b-purple'}">${dir === 'debit' ? '借方' : '贷方'}</span>`; }
  function availCell(row) {
    const p = DB.find('products', row.product) || {};
    const ratio = Math.min(100, Math.round(row.available / Math.max(1, (p.safety_qty || 1) * 3) * 100));
    const cls = row.available <= 0 ? 'bad' : row.available < (p.safety_qty || 0) ? 'warn' : 'ok';
    return `<div class="flex" style="gap:8px"><span class="money">${num(row.available)}</span><div class="progress" style="width:60px"><i class="${cls}" style="width:${ratio}%"></i></div></div>`;
  }
  function refLink(fromEntity, ref) {
    const map = { stock_movements: [['sales_delivery', 'delivery'], ['po_receipt', 'gr'], ['delivery', 'delivery'], ['gr', 'gr']],
      journal: [['sales_invoice', 'invoice'], ['sales_delivery', 'delivery'], ['sales_receipt', 'receipt'], ['ap_bill', 'bill'], ['ap_payment', 'payment'], ['stock_adjust', 'stocktake']] };
    const hit = (map[fromEntity] || []).find(m => m[0] === ref);
    if (!hit) return esc(ref || '—');
    return UI.cellRef(hit[1], ref);
  }
  function filterSelect(entity, f, s) {
    let opts;
    if (f.entity) opts = DB.list(f.entity).map(r => { const pk = SCHEMA.entities[f.entity].pk; return [r[pk], r.name || r[pk]]; });
    else { const FO = typeof f.opts === 'function' ? f.opts() : (f.opts || {}); opts = Object.keys(FO).map(k => [k, typeof FO[k] === 'object' ? (SCHEMA.STATUS[k] ? SCHEMA.STATUS[k].l : k) : FO[k]]); }
    return `<div class="field-inline">${esc(f.label)}<select data-filter="${f.k}" style="width:auto;min-width:118px"><option value="">全部</option>${opts.map(o => `<option value="${esc(o[0])}" ${String(s.filters[f.k]) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
  }

  /* ---------------- 主数据表单 ---------------- */
  function masterForm(entity, id) {
    const e = SCHEMA.entities[entity];
    const isNew = !id;
    const row = isNew ? {} : DB.find(entity, id);
    const fields = Object.keys(e.fields).filter(k => k !== e.pk).map(k => {
      const f = e.fields[k];
      const req = ['name'].indexOf(k) >= 0 || (f.t === 'ref' && !f.hide);
      return { k, label: f.l, type: f.t === 'ref' ? 'ref' : f.t === 'select' ? 'select' : f.t === 'textarea' ? 'textarea' : f.t === 'money' ? 'money' : f.t === 'int' ? 'int' : f.t === 'date' ? 'date' : 'text',
        ref: f.ref, opts: f.opts, required: req, full: !!f.full, def: f.def, ph: f.ph,
        pattern: f.t === 'email' ? '^[^@\\s]+@[^@\\s]+$' : null,
        msg: '格式不正确', email: f.t === 'email' };
    });
    if (isNew && e.pk !== '_id') fields.unshift({ k: e.pk, label: e.fields[e.pk].l + '(留空自动生成)', type: 'text', pattern: '^[A-Za-z0-9_\\-]{0,20}$', ph: e.fields[e.pk].ph || '' });
    UI.modal({
      title: (isNew ? '新建' : '编辑') + e.label, width: 'mid',
      body: UI.form(fields, Object.assign({}, isNew ? { status: 'enabled', currency: 'CNY', uom: 'PCS', tax_rate: 13 } : row)),
      actions: [{ label: '取消' }, { label: '保存', cls: 'primary', icon: 'check', onClick: m => {
        const rd = UI.readForm(m.el, fields);
        if (!rd.ok) { UI.toast('请检查表单:' + rd.errors.join('、'), 'err'); return false; }
        try {
          const vals = rd.values;
          if (e.pk !== '_id') {
            if (isNew) { if (vals[e.pk] === '' || vals[e.pk] === undefined) vals[e.pk] = ACT.autoCode(entity); }
            else vals[e.pk] = row[e.pk];
          }
          ['cost', 'price', 'credit_limit', 'safety_qty', 'lead_time', 'min_order', 'rating', 'tax_rate', 'area'].forEach(k => { if (vals[k] !== undefined && vals[k] !== null) vals[k] = +vals[k]; });
          ACT.save(entity, vals, isNew);
        } catch (err) { UI.toast(err.message, 'err'); return false; }
        APP.refresh();
        UI.toast((isNew ? '已创建' : '已保存') + ' ' + e.label);
      } }]
    });
  }

  /* ---------------- 导出 CSV ---------------- */
  function exportCSV(entity) {
    const e = SCHEMA.entities[entity];
    const cols = COLUMNS[entity] || Object.keys(e.fields);
    const rows = filtered(entity);
    const head = cols.map(k => (e.fields[k] || {}).l || k);
    const body = rows.map(r => cols.map(k => {
      let v = r[k];
      const f = e.fields[k] || {};
      if (f.t === 'ref' && f.ref && v) { const rec = DB.find(f.ref, v); if (rec && rec.name && rec.name !== v) v = rec.name + '(' + v + ')'; }
      if (f.t === 'select') v = optText(f, v);
      if (SCHEMA.STATUS[v] && typeof (f.opts || {})[v] === 'object') v = SCHEMA.STATUS[v].l;
      return v === undefined || v === null ? '' : String(v).replace(/"/g, '""');
    }));
    const csv = '' + [head].concat(body).map(r => r.map(c => `"${c}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${e.label}_${DB.today()}.csv`; a.click();
    UI.toast(`已导出 ${rows.length} 条记录`);
  }

  function icon(n) { return UI.icon(n); }

  /* ---------------- 事件绑定 ---------------- */
  function bind(root, entity) {
    const s = st(entity);
    const rerender = () => APP.render();
    const search = UI.$('[data-search]', root);
    if (search) {
      search.addEventListener('input', debounce(() => { s.q = search.value; s.page = 1; rerender(); setTimeout(() => { const el = UI.$('[data-search]'); if (el && el !== document.activeElement) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); }, 260));
    }
    UI.$$('.chip[data-chip]', root).forEach(c => c.addEventListener('click', () => { s.status = c.dataset.chip === '' ? '' : c.dataset.chip; s.page = 1; rerender(); }));
    UI.$$('[data-filter]', root).forEach(sel => sel.addEventListener('change', () => { s.filters[sel.dataset.filter] = sel.value; s.page = 1; rerender(); }));
    const clear = UI.$('[data-clear]', root);
    if (clear) clear.addEventListener('click', () => { state[entity] = { q: '', status: '', page: 1, sort: null, asc: false, filters: {} }; rerender(); });
    UI.$$('th[data-sort]', root).forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort; if (!k) return;
      if (s.sort === k) s.asc = !s.asc; else { s.sort = k; s.asc = true; }
      rerender();
    }));
    UI.$$('[data-page]', root).forEach(b => b.addEventListener('click', () => { if (b.disabled) return; s.page = +b.dataset.page; rerender(); }));
    const nb = UI.$('[data-new]', root); if (nb) nb.addEventListener('click', () => {
      if (entity === 'sales_order' || entity === 'purchase_order' || entity === 'purchase_req' || entity === 'transfer' || entity === 'stocktake') DOC.newDoc(entity);
      else masterForm(entity);
    });
    const ex = UI.$('[data-export]', root); if (ex) ex.addEventListener('click', () => exportCSV(entity));
    UI.$$('[data-open-doc]', root).forEach(el => el.addEventListener('click', ev => {
      ev.stopPropagation();
      const [ent, id] = el.dataset.openDoc.split('=');
      openDoc(ent, decodeURIComponent(id));
    }));
    UI.$$('tbody tr[data-row]', root).forEach(tr => tr.addEventListener('click', ev => {
      if (ev.target.closest('[data-open-doc]')) return;
      const e = SCHEMA.entities[entity];
      const id = tr.dataset.row; if (!id) return;
      openDoc(entity, id);
    }));
    UI.$$('[data-open]', root).forEach(el => el.addEventListener('click', ev => {
      ev.stopPropagation();
      const [ent, id] = el.dataset.open.split('=');
      openDoc(ent, decodeURIComponent(id));
    }));
  }
  function openDoc(entity, id) {
    const e = SCHEMA.entities[entity];
    if (e.doc || ['sales_order', 'purchase_order', 'invoice', 'delivery', 'gr', 'bill', 'journal', 'purchase_req', 'transfer', 'stocktake', 'payment', 'receipt'].indexOf(entity) >= 0) {
      DOC.open(entity, id);
    } else if (['products', 'customers', 'suppliers', 'warehouses', 'users', 'gl_account'].indexOf(entity) >= 0) {
      DOC.masterDetail(entity, id);
    } else {
      masterForm(entity, id);
    }
  }
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; }

  return { render, bind, masterForm, exportCSV, st, COLUMNS, filtered, openDoc, PAGE_SIZE };
})();
