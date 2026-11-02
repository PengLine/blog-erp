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
    products: ['code', 'name', 'category', 'brand', 'mrp_src', 'cost', 'price', 'safety_qty', 'listing', 'status'],
    customers: ['code', 'name', 'type', 'region', 'credit', 'credit_hold', 'salesperson', 'status'],
    price_list: ['no', 'name', 'kind', 'customer', 'valid_from', 'lines_cnt', 'margin_floor', 'status'],
    suppliers: ['code', 'name', 'category', 'contact', 'phone', 'lead_time', 'rating', 'status'],
    warehouses: ['code', 'name', 'kind', 'location', 'manager', 'area', 'status'],
    users: ['code', 'account', 'name', 'dept', 'role', 'email', 'last_login', 'status'],
    stock: ['product', 'product_name', 'warehouse', 'qty', 'reserved', 'available', 'cost', 'value', 'status'],
    lot: ['no', 'product_name', 'warehouse', 'bin', 'qty_in', 'qty', 'expire_date', 'unit_cost', 'value', 'status'],
    bins: ['code', 'warehouse', 'zone', 'load', 'capacity', 'manager', 'status'],
    stock_movements: ['no', 'date', 'type', 'product', 'product_name', 'warehouse', 'qty', 'amount', 'ref'],
    sales_order: ['no', 'date', 'customer_name', 'warehouse', 'required_date', 'salesperson', 'total', 'status'],
    delivery: ['no', 'date', 'so', 'customer_name', 'warehouse', 'amount', 'carrier', 'status'],
    invoice: ['no', 'date', 'customer_name', 'due_date', 'total', 'paid', 'balance', 'status'],
    purchase_req: ['no', 'date', 'dept', 'requester', 'need_date', 'amount', 'status'],
    purchase_order: ['no', 'date', 'supplier_name', 'warehouse', 'expected_date', 'buyer', 'total', 'status'],
    gr: ['no', 'date', 'po', 'supplier_name', 'warehouse', 'amount', 'iqc', 'bill', 'status'],
    iqc: ['no', 'date', 'gr', 'supplier_name', 'qty_in', 'sample_qty', 'defect_qty', 'amount', 'status', 'inspector'],
    bill: ['no', 'date', 'supplier_name', 'gr', 'due_date', 'total', 'net', 'vat', 'paid', 'balance', 'status'],
    transfer: ['no', 'date', 'from_wh', 'to_wh', 'status', 'user', 'note'],
    stocktake: ['no', 'date', 'warehouse', 'diff_lines', 'diff_amount', 'status', 'user'],
    payment: ['no', 'date', 'supplier_name', 'bill', 'amount', 'method', 'status'],
    receipt: ['no', 'date', 'customer_name', 'invoice', 'amount', 'method', 'status'],
    journal: ['no', 'date', 'type', 'ref', 'memo', 'debit', 'status'],
    period: ['code', 'start', 'end', 'status', 'revenue', 'expense', 'profit', 'retained', 'close_voucher', 'closed_by', 'closed_at'],
    gl_account: ['code', 'name', 'type', 'direction', 'balance'],
    activity: ['time', 'user', 'module', 'action', 'ref', 'detail'],
    rfq: ['no', 'date', 'title', 'buyer', 'need_date', 'quote_lines', 'amount', 'saving', 'status'],
    product_release: ['no', 'date', 'name', 'category', 'brand', 'target_cost', 'target_price', 'margin', 'listing', 'owner', 'launch_date', 'status'],
    approval: ['no', 'date', 'module', 'title', 'applicant', 'amount', 'priority', 'approver', 'status'],
    supplier_apply: ['no', 'date', 'company', 'category', 'contact', 'phone', 'annual_capacity', 'score', 'applicant', 'status'],
    processors: ['code', 'name', 'process_type', 'location', 'phone', 'capacity', 'unit_rate', 'pass_rate', 'qualification', 'status'],
    processor_audit: ['no', 'date', 'processor_name', 'process_type', 'auditor', 'sample_result', 'total_score', 'unit_rate', 'conclusion', 'status'],
    os_order: ['no', 'date', 'processor_name', 'process_type', 'output_name', 'output_qty', 'received_qty', 'unit_fee', 'fee_amount', 'need_date', 'status'],
    rma: ['no', 'date', 'customer_name', 'so', 'type', 'reason', 'qty', 'amount', 'handler', 'status'],
    role: ['code', 'name', 'dept', 'level', 'users', 'scope', 'status'],
    bom: ['no', 'name', 'product_name', 'version', 'mrp_src', 'lines_cnt', 'mat_cost', 'effect_from', 'status'],
    mrp_run: ['no', 'name', 'date', 'source', 'horizon', 'levels', 'rows_cnt', 'shortage_cnt', 'amount', 'status'],
  };
  const MASTER = ['products', 'customers', 'suppliers', 'warehouses', 'users', 'gl_account', 'processors', 'role'];
  /* 合成列(不来自 schema 字段):即时计算 */
  const SYNTH = { credit: { label: '信用占用 · 使用率', sortable: false }, load: { label: '库位占用', sortable: false } };
  const DOCLIKE = ['rfq', 'product_release', 'approval', 'supplier_apply', 'processor_audit', 'os_order', 'rma', 'iqc', 'lot', 'bins', 'price_list'];
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
      case 'select': return f.badge ? selBadge(f, row[key], entity) : esc(optText(f, row[key]));
      case 'ref': return cellRef(f.ref, row[key]);
      default: return esc(row[key]);
    }
  }
  /** 状态类枚举用彩色徽标,业务枚举(如价格类型)用中性徽标显示中文标签 */
  function selBadge(f, v, entity) {
    if (SCHEMA.STATUS[v]) return badge(v, entity === 'bill' ? 'ap' : '');
    return `<span class="badge b-neutral">${esc(optText(f, v))}</span>`;
  }
  function optText(f, v) {
    const opts = typeof f.opts === 'function' ? f.opts() : f.opts;
    if (!opts) return v;
    if (SCHEMA.STATUS[v]) return SCHEMA.STATUS[v].l;
    const o = opts[v];
    if (o === undefined || o === null || o === 1 || o === true || typeof o === 'object') return v;
    return o;
  }
  function pct(v) { const n = +v || 0; return (n <= 1 ? n * 100 : n).toFixed(1) + '%'; }
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
    purchase_order: [{ k: 'warehouse', label: '收货仓', entity: 'warehouses' }, { k: 'buyer', label: '采购员', opts: () => fromList('purchase_order', 'buyer') }],
    invoice: [{ k: 'customer', label: '客户', entity: 'customers' }],
    bill: [{ k: 'supplier', label: '供应商', entity: 'suppliers' }],
    journal: [{ k: 'type', label: '业务类型', opts: SCHEMA.entities.journal.fields.type.opts }],
    customers: [{ k: 'region', label: '区域', opts: SCHEMA.entities.customers.fields.region.opts }, { k: 'type', label: '类型', opts: fromOpts('customers', 'type') }],
    price_list: [{ k: 'kind', label: '价格类型', opts: fromOpts('price_list', 'kind') }, { k: 'customer', label: '适用客户', entity: 'customers' }, { k: 'channel', label: '适用渠道', opts: fromOpts('price_list', 'channel') }, { k: 'category', label: '适用类目', opts: fromOpts('price_list', 'category') }],
    suppliers: [{ k: 'category', label: '类目', opts: fromOpts('suppliers', 'category') }],
    activity: [{ k: 'module', label: '模块', opts: () => fromList('activity', 'module') }],
    rfq: [{ k: 'buyer', label: '采购员', opts: () => fromList('rfq', 'buyer') }, { k: 'warehouse', label: '收货仓', entity: 'warehouses' }],
    product_release: [{ k: 'category', label: '类目', opts: fromOpts('product_release', 'category') }, { k: 'listing', label: '上架渠道', opts: fromOpts('product_release', 'listing') }, { k: 'owner', label: '开发负责人', opts: () => fromList('product_release', 'owner') }],
    approval: [{ k: 'module', label: '审批类型', opts: fromOpts('approval', 'module') }, { k: 'priority', label: '紧急度', opts: fromOpts('approval', 'priority') }, { k: 'applicant', label: '发起人', opts: () => fromList('approval', 'applicant') }],
    supplier_apply: [{ k: 'category', label: '类目', opts: fromOpts('supplier_apply', 'category') }, { k: 'applicant', label: '引入人', opts: () => fromList('supplier_apply', 'applicant') }],
    processors: [{ k: 'process_type', label: '加工类型', opts: fromOpts('processors', 'process_type') }],
    processor_audit: [{ k: 'process_type', label: '加工类型', opts: fromOpts('processor_audit', 'process_type') }, { k: 'auditor', label: '审核人', opts: () => fromList('processor_audit', 'auditor') }],
    os_order: [{ k: 'processor', label: '服务商', entity: 'processors' }, { k: 'process_type', label: '加工类型', opts: fromOpts('os_order', 'process_type') }, { k: 'warehouse', label: '收发库', entity: 'warehouses' }],
    rma: [{ k: 'customer', label: '客户', entity: 'customers' }, { k: 'type', label: '售后类型', opts: fromOpts('rma', 'type') }, { k: 'reason', label: '售后原因', opts: fromOpts('rma', 'reason') }],
    role: [{ k: 'dept', label: '部门', opts: fromOpts('role', 'dept') }],
    lot: [{ k: 'warehouse', label: '仓库', entity: 'warehouses' }, { k: 'product', label: '物料', entity: 'products' },
      { k: 'source', label: '批次来源', opts: SCHEMA.LOT_SOURCE }, { k: 'supplier', label: '来源供应商', entity: 'suppliers' }],
    bins: [{ k: 'warehouse', label: '仓库', entity: 'warehouses' }, { k: 'zone', label: '库区', opts: SCHEMA.ZONES }],
    sales_order: [{ k: 'warehouse', label: '发货仓', entity: 'warehouses' }, { k: 'channel', label: '渠道', opts: fromOpts('sales_order', 'channel') }, { k: 'priority', label: '紧急度', opts: fromOpts('sales_order', 'priority') }, { k: 'salesperson', label: '销售员', opts: () => fromList('sales_order', 'salesperson') }],
    products: [{ k: 'category', label: '类目', opts: fromOpts('products', 'category') }, { k: 'mrp_src', label: '供应方式', opts: SCHEMA.MRP_SRC }],
    bom: [{ k: 'product', label: '父项物料', entity: 'products' }, { k: 'mrp_src', label: '供应方式', opts: SCHEMA.MRP_SRC }, { k: 'owner', label: '工程/计划员', opts: () => fromList('bom', 'owner') }],
    mrp_run: [{ k: 'source', label: '需求来源', opts: SCHEMA.MRP_DEMAND }, { k: 'warehouse', label: '库存口径仓', entity: 'warehouses' }, { k: 'planner', label: '计划员', opts: () => fromList('mrp_run', 'planner') }],
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

  const APPROVAL_ENTITY = { product_release: 'product_release', supplier_apply: 'supplier_apply', processor_audit: 'processor_audit',
    purchase_req: 'purchase_req', so_change: 'sales_order', price_change: 'sales_order', price_list: 'price_list', rma: 'rma', os_order: 'os_order', stock_adjust: 'products' };

  function render(entity, mount) {
    const e = SCHEMA.entities[entity], s = st(entity);
    const rows = filtered(entity);
    const page = Math.min(s.page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
    const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const cols = (COLUMNS[entity] || Object.keys(e.fields)).map(k => {
      const f = e.fields[k] || {};
      const sy = SYNTH[k] || {};
      const isPK = k === e.pk;
      return {
        k, label: sy.label || f.l || k, align: f.t === 'money' || f.t === 'int' ? 'right' : 'left',
        sortable: sy.sortable !== false,
        render: row => {
          if (isPK && (e.doc || MASTER.indexOf(entity) >= 0 || DOCLIKE.indexOf(entity) >= 0)) return nameCell(entity, k, row);
          if (k === 'credit') return creditCell(row);
          if (k === 'load') return binLoadCell(row);
          if (k === 'expire_date' && entity === 'lot') return expireCell(row);
          if (k === 'valid_from' && entity === 'price_list') return validityCell(row);
          if (k === 'effect_from' && entity === 'bom') return bomWindowCell(row);
          if (k === 'shortage_cnt' && entity === 'mrp_run') return `<span class="money" style="${row.shortage_cnt ? 'color:var(--danger);font-weight:650' : ''}">${num(row.shortage_cnt)}</span>`
            + `<div class="cell-sub muted small">建议 ${num(row.rows_cnt)} 行 / ${num(row.demand_cnt)} 需求</div>`;
          if (k === 'levels' && entity === 'mrp_run') return `<span class="tag">L${num(row.levels)}</span>`;
          if (k === 'margin_floor' && entity === 'price_list') return row.margin_floor == null || row.margin_floor === ''
            ? `<span class="muted small nowrap">默认 ${pct(ACT.PRICE.FLOOR)}</span>` : pct(row.margin_floor);
          if (k === 'qty' && entity === 'lot') return `<span class="money ${row.status === 'consumed' ? 'muted' : 'strong'}">${num(row.qty)}</span>`
            + (row.qty !== row.qty_in ? `<div class="cell-sub">入库 ${num(row.qty_in)}</div>` : '');
          if (k === 'product_name' || k === 'customer_name' || k === 'supplier_name') return `<span class="${k === 'product_name' ? '' : 'cell-main'}">${esc(row[k] || '')}</span>` + (row.product ? `<div class="cell-sub mono">${esc(row.product)}</div>` : '');
          if (k === 'qty' && entity === 'stock_movements') return `<span class="money ${row.qty < 0 ? 'neg' : ''}" style="${row.qty < 0 ? 'color:var(--danger)' : ''}">${row.qty > 0 ? '+' : ''}${num(row.qty)}</span>`;
          if (k === 'balance') return `<span class="money" style="${(+row.balance < 0) ? 'color:var(--danger)' : ''}">${money(row.balance)}</span>`;
          if (k === 'available') return availCell(row);
          if (k === 'value') return `<span class="money strong">${money(row.value)}</span>`;
          if (k === 'rating') return `<div class="flex" style="gap:8px"><div class="progress" style="width:70px"><i class="${row.rating >= 80 ? 'ok' : row.rating >= 60 ? 'warn' : 'bad'}" style="width:${row.rating}%"></i></div><span class="small muted">${row.rating}</span></div>`;
          if (k === 'ref' && row[k]) return refLink(entity, row[k]);
          if (k === 'biz' && entity === 'approval') {
            const ent = APPROVAL_ENTITY[row.module];
            return row.biz && ent ? `<span class="cell-link mono" data-open-doc="${ent}=${encodeURIComponent(row.biz)}">${esc(row.biz)}</span>` : esc(row.biz || '—');
          }
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
        ${statusOpts.length ? UI.chips([{ v: '', l: '全部' }].concat(statusOpts.map(v => ({ v, l: UI.stLabel(v, entity === 'bill' ? 'ap' : '') }))), s.status, counts) : ''}
        ${(FILTERS[entity] || []).map(f => filterSelect(entity, f, s)).join('')}
        ${(FILTERS[entity] || []).length || statusOpts.length ? `<button class="btn ghost sm" data-clear style="margin-left:auto">${icon('refresh')}重置筛选</button>` : ''}
      </div>
      ${UI.table(cols, pageRows, { pk: e.pk, sorted: s.sort, asc: s.asc, empty: '没有符合条件的记录', emptySub: '试试调整搜索关键字或清除筛选条件', onMount: mount })}
      ${summary(entity, rows)}
      <div class="table-foot">${UI.pager(rows.length, page, PAGE_SIZE)}</div>
    </div>`;
  }

  function badgeAccount(dir) { return `<span class="badge ${dir === 'debit' ? 'b-info' : 'b-purple'}">${dir === 'debit' ? '借方' : '贷方'}</span>`; }
  /** 库位占用条:实际承载件数 / 标准容量,超载显红 */
  function binQty(binCode) { return DB.where('lot', l => l.bin === binCode && l.qty > 0); }
  function binLoadCell(row) {
    const lots = binQty(row.code);
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    const cap = row.capacity || 1;
    const ratio = Math.min(100, qty / cap * 100);
    const cls = qty > cap ? 'bad' : qty > cap * .8 ? 'warn' : 'ok';
    return `<div class="flex" style="gap:8px"><div class="progress" style="width:70px"><i class="${cls}" style="width:${ratio}%"></i></div>`
      + `<span class="money ${qty > cap ? 'neg' : ''}"${qty > cap ? ' style="color:var(--danger)"' : ''}>${num(qty)}</span>`
      + `<span class="muted small">/ ${num(cap)}</span></div>`
      + `<div class="cell-sub">${lots.length ? lots.length + ' 个批次 · ' + UI.money(lots.reduce((s, l) => s + (l.value || 0), 0)) + ' 元' : '空置'}</div>`;
  }
  /** 效期列:剩余天数着色,过期批次直接标红 */
  function expireCell(row) {
    if (!row.expire_date) return `<span class="muted small">长期有效</span>`;
    const left = UI.days(DB.today(), row.expire_date);
    const d = UI.dateCN(row.expire_date);
    if (left < 0) return `<span style="color:var(--danger)" class="nowrap">${d}</span><div class="cell-sub" style="color:var(--danger)">已过期 ${-left} 天</div>`;
    if (left <= 90) return `<span style="color:var(--warning)" class="nowrap">${d}</span><div class="cell-sub" style="color:var(--warning)">临期 ${left} 天</div>`;
    return `<span class="nowrap">${d}</span><div class="cell-sub muted small">剩 ${left} 天</div>`;
  }
  /** 价目表有效期:合并生效/失效两列,并提示是否在当前窗口内 */
  function validityCell(row) {
    const today = DB.today();
    if (!row.valid_to) return `<span class="nowrap">${UI.dateCN(row.valid_from)} 起</span><div class="cell-sub muted small">长期有效</div>`;
    const win = `${UI.dateCN(row.valid_from)} ~ ${UI.dateCN(row.valid_to)}`;
    if (row.valid_to && today > row.valid_to) return `<span class="nowrap" style="color:var(--danger)">${win}</span><div class="cell-sub" style="color:var(--danger)">已失效 ${UI.days(row.valid_to, today)} 天</div>`;
    if (row.valid_from && today < row.valid_from) return `<span class="nowrap muted">${win}</span><div class="cell-sub muted small">${UI.days(today, row.valid_from)} 天后生效</div>`;
    const left = row.valid_to ? UI.days(today, row.valid_to) : 0;
    if (left <= 30) return `<span class="nowrap" style="color:var(--warning)">${win}</span><div class="cell-sub" style="color:var(--warning)">临期 ${left} 天</div>`;
    return `<span class="nowrap">${win}</span><div class="cell-sub muted small">剩 ${left} 天</div>`;
  }
  /** 清单生效窗口:只有已核准且处于生效区间内的版本会进入 MRP 展开 */
  function bomWindowCell(row) {
    const today = DB.today();
    if (row.status !== 'approved') return `<span class="nowrap muted">${UI.dateCN(row.effect_from)}</span><div class="cell-sub muted small">未生效发布</div>`;
    if (row.effect_to && today > row.effect_to) return `<span class="nowrap" style="color:var(--danger)">${UI.dateCN(row.effect_from)} 起</span><div class="cell-sub" style="color:var(--danger)">已失效 ${UI.days(row.effect_to, today)} 天</div>`;
    if (row.effect_from && today < row.effect_from) return `<span class="nowrap muted">${UI.dateCN(row.effect_from)} 起</span><div class="cell-sub muted small">${UI.days(today, row.effect_from)} 天后生效</div>`;
    return `<span class="nowrap">${UI.dateCN(row.effect_from)} 起</span><div class="cell-sub" style="color:var(--success)">${row.effect_to ? '至 ' + UI.dateCN(row.effect_to) : '长期生效'}</div>`;
  }
  function availCell(row) {
    const p = DB.find('products', row.product) || {};
    const ratio = Math.min(100, Math.round(row.available / Math.max(1, (p.safety_qty || 1) * 3) * 100));
    const cls = row.available <= 0 ? 'bad' : row.available < (p.safety_qty || 0) ? 'warn' : 'ok';
    const hold = ACT.LOT.hold(row.product, row.warehouse);
    const n = ACT.LOT.lotsOf(row.product, row.warehouse).length;
    return `<div class="flex" style="gap:8px"><span class="money">${num(row.available)}</span><div class="progress" style="width:60px"><i class="${cls}" style="width:${ratio}%"></i></div></div>`
      + `<div class="cell-sub">${n ? n + ' 个在库批次' : '无批次记录'}${hold ? `<span style="color:var(--warning)"> · 质量扣留 ${num(hold)}</span>` : ''}</div>`;
  }
  /** 客户信用占用条:应收 + 在途 / 额度 */
  function creditCell(row) {
    const st = ACT.creditState(row.code);
    const pct = Math.min(150, Math.round(st.rate * 100));
    const cls = st.hold || st.rate >= ACT.CREDIT_BLOCK ? 'bad' : st.rate >= ACT.CREDIT_WATCH ? 'warn' : 'ok';
    const bar = `<div class="flex" style="gap:8px"><div class="progress" style="width:70px"><i class="${cls}" style="width:${Math.min(100, pct)}%"></i></div>` +
      `<span class="small ${st.rate >= ACT.CREDIT_WATCH ? 'strong' : 'muted'}">${st.limit > 0 ? pct + '%' : '未授信'}</span></div>`;
    const sub = `<div class="cell-sub mono">¥${UI.compact(st.used)} / ¥${UI.compact(st.limit)}</div>` +
      (st.overdue > 0 ? `<div class="cell-sub" style="color:var(--danger)">逾期 ¥${UI.compact(st.overdue)} · ${st.odDays} 天</div>` : '');
    return bar + sub;
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
    else { const FO = typeof f.opts === 'function' ? f.opts() : (f.opts || {}); opts = Object.keys(FO).map(k => [k, typeof FO[k] === 'object' ? UI.stLabel(k, entity === 'bill' ? 'ap' : '') : FO[k]]); }
    return `<div class="field-inline">${esc(f.label)}<select data-filter="${f.k}" style="width:auto;min-width:118px"><option value="">全部</option>${opts.map(o => `<option value="${esc(o[0])}" ${String(s.filters[f.k]) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
  }

  /* ---------------- 主数据表单 ---------------- */
  /** 客户信用档案卡(编辑客户时展示实时占用) */
  function creditProfile(c) {
    const st = ACT.creditState(c.code);
    const pct = st.limit > 0 ? Math.round(st.rate * 100) : 0;
    const cls = st.hold || st.rate >= ACT.CREDIT_BLOCK ? 'bad' : st.rate >= ACT.CREDIT_WATCH ? 'warn' : 'ok';
    const pend = DB.where('approval', a => a.module === 'credit' && a.status === 'pending')
      .filter(a => { const o = DB.find('sales_order', a.biz); return o && o.customer === c.code; });
    return `<div class="card" style="margin-bottom:14px"><div class="card-head"><h3>${icon('lock')}信用档案</h3>
      <span class="muted small">占用 = 未结清应收 + 已审核未开票在途 · 预警线 ${Math.round(ACT.CREDIT_WATCH * 100)}% · 放行线 ${Math.round(ACT.CREDIT_BLOCK * 100)}%</span></div>
      <div class="card-body">
        <div class="flex" style="gap:10px;align-items:center;margin-bottom:12px">
          <div class="progress" style="flex:1"><i class="${cls}" style="width:${Math.min(100, pct)}%"></i></div>
          <b class="money" style="color:var(--${st.hold ? 'danger' : cls === 'bad' ? 'danger' : cls === 'warn' ? 'warning' : 'success'})">${st.limit > 0 ? pct + '%' : '未授信'}</b>
          ${st.hold ? UI.badge('hold', '') : ''}
        </div>
        ${UI.descs([
          ['信用额度', UI.money(st.limit)], ['已占用', UI.money(st.used)],
          ['应收余额', UI.money(st.ar) + ' <span class="muted small">(' + st.openCount + ' 单在途 ¥' + UI.money(st.open) + ')</span>'],
          ['可用额度', `<span class="money" style="${st.free < 0 ? 'color:var(--danger)' : ''}">${UI.money(st.free)}</span>`],
          ['账期', esc(st.terms)],
          ['逾期货款', st.overdue > 0 ? `<span style="color:var(--danger)">${UI.money(st.overdue)} · 最长 ${st.odDays} 天 · ${st.odCount} 张发票</span>` : '<span class="muted">无逾期</span>'],
          ['待批特批', pend.length ? pend.map(a => `<span class="badge b-warning mono">${esc(a.no)}</span>`).join(' ') : '<span class="muted">无</span>']
        ])}
      </div></div>`;
  }

  function masterForm(entity, id) {
    const e = SCHEMA.entities[entity];
    const isNew = !id;
    const row = isNew ? {} : DB.find(entity, id);
    /* 账簿派生数据(科目余额、会计期间)由凭证与结账动作维护,不提供手改入口 */
    if (e.readonly && !isNew && row) {
      const show = (f, v) => f.t === 'select' ? UI.badge(v)
        : f.t === 'money' ? UI.money(v)
        : f.t === 'date' ? (v || '—')
        : f.t === 'ref' ? (v || '—')
        : esc(String(v === undefined || v === '' ? '—' : v));
      UI.modal({ title: e.label + ' · ' + row[e.pk], width: 'mid',
        body: `<div class="notice">${UI.icon('info')}<div><b>只读</b> ${esc(e.table)} 由凭证与期末结账自动维护,不提供手工编辑。</div></div>
          ${UI.descs(Object.keys(e.fields).map(k => [e.fields[k].l, show(e.fields[k], row[k])]))}`,
        actions: [{ label: '关闭', onClick: () => { } }] });
      return;
    }
    const fields = Object.keys(e.fields).filter(k => k !== e.pk).map(k => {
      const f = e.fields[k];
      const req = ['name'].indexOf(k) >= 0 || (f.t === 'ref' && !f.hide);
      return { k, label: f.l, type: f.t === 'ref' ? 'ref' : f.t === 'select' ? 'select' : f.t === 'textarea' ? 'textarea' : f.t === 'money' ? 'money' : f.t === 'int' ? 'int' : f.t === 'date' ? 'date' : 'text',
        ref: f.ref, opts: f.opts, required: req, full: !!f.full, def: f.def, ph: f.ph,
        pattern: f.t === 'email' ? '^[^@\\s]+@[^@\\s]+$' : null,
        msg: '格式不正确', email: f.t === 'email' };
    });
    if (isNew && e.pk !== '_id') fields.unshift({ k: e.pk, label: e.fields[e.pk].l + '(留空自动生成)', type: 'text', pattern: '^[A-Za-z0-9_\\-]{0,20}$', ph: e.fields[e.pk].ph || '' });
    const init = Object.assign({}, isNew ? { status: 'enabled', currency: 'CNY', uom: 'PCS', tax_rate: 13 } : row);
    const stOpts = (e.fields.status || {}).opts;
    if (isNew && stOpts && !stOpts.enabled) init.status = Object.keys(stOpts)[0];
    Object.keys(e.fields).forEach(k => { if (e.fields[k].secret) init[k] = ''; });
    UI.modal({
      title: (isNew ? '新建' : '编辑') + e.label, width: 'mid',
      body: (entity === 'customers' && !isNew ? creditProfile(row) : '') + UI.form(fields, init) + (e.fields.pwd ? `<div class="muted small mt8">口令用于登录本站,至少 8 位且含字母与数字;新建留空默认 ${esc('Sf@123456')},编辑留空表示不修改。</div>` : ''),
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
    const head = cols.map(k => SYNTH[k] ? SYNTH[k].label : ((e.fields[k] || {}).l || k));
    const body = rows.map(r => cols.map(k => {
      if (k === 'load') { const ls = binQty(r.code); return String(ls.reduce((s, l) => s + l.qty, 0)) + '/' + (r.capacity || 0); }
      let v = r[k];
      const f = e.fields[k] || {};
      if (f.t === 'ref' && f.ref && v) { const rec = DB.find(f.ref, v); if (rec && rec.name && rec.name !== v) v = rec.name + '(' + v + ')'; }
      if (f.t === 'select') v = optText(f, v);
      if (SCHEMA.STATUS[v] && typeof (f.opts || {})[v] === 'object') v = UI.stLabel(v, entity === 'bill' ? 'ap' : '');
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
      if (DOC.NEW_CFG[entity]) DOC.newDoc(entity);
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
    if (e.doc || DOCLIKE.indexOf(entity) >= 0 || ['sales_order', 'purchase_order', 'invoice', 'delivery', 'gr', 'bill', 'journal', 'purchase_req', 'transfer', 'stocktake', 'payment', 'receipt'].indexOf(entity) >= 0) {
      DOC.open(entity, id);
    } else if (MASTER.indexOf(entity) >= 0) {
      DOC.masterDetail(entity, id);
    } else {
      masterForm(entity, id);
    }
  }
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; }

  return { render, bind, masterForm, exportCSV, st, COLUMNS, filtered, openDoc, PAGE_SIZE };
})();
