/* ============================================================
 * ui.js — 无依赖组件库:图标 / 格式化 / 表格 / 表单 / 弹窗 / 图表
 * ============================================================ */
window.UI = (function () {

  /* ---------------- Icons ---------------- */
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    truck: '<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    swap: '<path d="M17 3l4 4-4 4"/><path d="M21 7H8a4 4 0 0 0-4 4v1"/><path d="M7 21l-4-4 4-4"/><path d="M3 17h13a4 4 0 0 0 4-4v-1"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    receipt: '<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.42.66.91.83H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevL: '<path d="M15 18l-6-6 6-6"/>',
    chevR: '<path d="M9 18l6-6-6-6"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    print: '<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="12" rx="2"/><path d="M6 14h12v6H6z"/>',
    warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3l-8.47-14.14a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    trendUp: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    trendDown: '<path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    upload: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 21h16"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 15v3"/>',
    unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    zap: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 11.5 2 2 4-4"/>',
  };
  function icon(name, cls) {
    /* 默认 16px:内联 SVG 无宽高属性时浏览器会按 300x150 固有尺寸渲染,撑爆容器 */
    return `<svg class="${cls || ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;
  }

  /* ---------------- Format ---------------- */
  const nf2 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat('zh-CN');
  function money(v) { return v === null || v === undefined || v === '' || isNaN(v) ? '—' : nf2.format(+v); }
  function cny(v) { return '¥' + money(v); }
  function compact(v) {
    v = +v || 0; const a = Math.abs(v);
    if (a >= 1e8) return (v / 1e8).toFixed(2) + ' 亿';
    if (a >= 1e4) return (v / 1e4).toFixed(a >= 1e6 ? 1 : 2) + ' 万';
    return nf2.format(v);
  }
  function num(v) { return v === null || v === undefined || v === '' || isNaN(v) ? '—' : nf0.format(+v); }
  function dateCN(d) { return d ? String(d).slice(0, 10) : '—'; }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function days(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  const round2 = v => Math.round((+v || 0) * 100) / 100;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function frag(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  /* ---------------- Status ---------------- */
  /* kind='ap' 用于应付侧:同一状态码在应收/应付语境下中文不同(未收款 / 未付款) */
  function stLabel(value, kind) {
    const s = SCHEMA.STATUS[value];
    return s ? ((kind === 'ap' && s.ap) || s.l) : String(value);
  }
  function badge(value, kind) {
    const s = SCHEMA.STATUS[value];
    return s ? `<span class="badge ${s.c}">${stLabel(value, kind)}</span>` : `<span class="badge b-plain">${esc(value)}</span>`;
  }
  function refName(entity, key) {
    if (!entity || !key) return '—';
    const e = SCHEMA.entities[entity]; if (!e) return String(key);
    const row = DB.find(entity, key);
    if (!row) return String(key);
    return row.name ? row.name + ' <span class="muted small">' + esc(row[e.pk]) + '</span>' : String(row[e.pk]);
  }
  function cellRef(entity, key) {
    if (!key) return '—';
    const e = SCHEMA.entities[entity]; if (!e) return esc(key);
    const row = DB.find(entity, key);
    const view = VIEWS_BY_ENTITY[entity];
    const label = row ? esc(row.name || row[e.pk]) : esc(key);
    if (!view) return label;
    return `<span class="cell-link" data-open="${entity}=${encodeURIComponent(key)}">${label}</span>`;
  }

  /* ---------------- Table ---------------- */
  function table(cols, rows, o) {
    o = o || {};
    const head = cols.map(c => `<th class="${c.align === 'right' ? 'right ' : ''}${c.sortable === false ? '' : 'sortable'}${o.sorted === c.k ? ' sorted' : ''}"${c.sortable === false ? '' : ` data-sort="${c.k}"`}${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.label)}${c.sortable === false ? '' : `<span class="arrow">${o.asc === false ? '▾' : '▴'}</span>`}</th>`).join('');
    const body = rows.length ? rows.map(r => `<tr data-row="${esc(r[o.pk || '_id'] || '')}">` + cols.map(c => `<td class="${c.align === 'right' ? 'right' : ''}${c.nowrap ? ' nowrap' : ''}">${c.render(r, r[o.pk || '_id'])}</td>`).join('') + '</tr>').join('')
      : `<tr><td colspan="${cols.length}">${emptyBox(o.empty || '暂无数据', o.emptySub)}</td></tr>`;
    return `<div class="table-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function emptyBox(t, s) { return `<div class="empty">${icon('box')}<b>${esc(t)}</b>${s ? esc(s) : ''}</div>`; }

  function pager(total, page, size) {
    const pages = Math.max(1, Math.ceil(total / size));
    page = Math.min(page, pages);
    let btns = '';
    const put = p => btns += `<button data-page="${p}" class="${p === page ? 'on' : ''}">${p}</button>`;
    if (pages <= 7) { for (let p = 1; p <= pages; p++) put(p); }
    else {
      put(1);
      const s = Math.max(2, page - 2), e = Math.min(pages - 1, page + 2);
      if (s > 2) btns += '<button disabled>…</button>';
      for (let p = s; p <= e; p++) put(p);
      if (e < pages - 1) btns += '<button disabled>…</button>';
      put(pages);
    }
    return `<span>共 <b>${num(total)}</b> 条</span><div class="pager"><button data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevL')}</button>${btns}<button data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>${icon('chevR')}</button></div>`;
  }

  /* ---------------- Modal / Drawer / Toast ---------------- */
  function modal(o) {
    const el = frag(`<div class="mask"><div class="modal ${o.width || ''}">
      <div class="modal-head"><h3>${esc(o.title)}</h3>${o.subtitle ? `<span class="muted small">${esc(o.subtitle)}</span>` : ''}<button class="icon-btn x" data-close>${icon('close')}</button></div>
      <div class="modal-body">${o.body || ''}</div>
      ${o.actions ? `<div class="modal-foot">${o.footLeft || ''}<div class="right">${o.actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="${i}" ${a.disabled ? 'disabled' : ''}>${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div></div>` : ''}
    </div></div>`);
    $('#modal-root').appendChild(el);
    const api = { el, body: $('.modal-body', el), close() { el.remove(); o.onClose && o.onClose(); } };
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-close]')) return api.close();
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled) { const a = o.actions[+b.dataset.act]; if (!a.onClick || a.onClick(api) !== false) api.close(); }
    });
    setTimeout(() => { const f = $('input:not([readonly]),select,textarea', el); f && f.focus(); }, 80);
    return api;
  }
  function drawer(o) {
    const el = frag(`<div class="mask left"><div class="drawer">
      <div class="drawer-head">${o.head || ''}<button class="icon-btn" style="margin-left:auto" data-close>${icon('close')}</button></div>
      <div class="drawer-body">${o.body || ''}</div>${o.foot ? `<div class="drawer-foot">${o.foot}</div>` : ''}</div></div>`);
    $('#modal-root').appendChild(el);
    const api = { el, body: $('.drawer-body', el), close() { el.remove(); } };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) api.close(); });
    return api;
  }
  function confirm(msg, o) {
    o = o || {};
    return new Promise(res => {
      modal({ title: o.title || '请确认', body: `<div class="notice ${o.danger ? 'warn' : ''}">${icon(o.danger ? 'warn' : 'info')}<div>${msg}</div></div>`,
        actions: [{ label: '取消', onClick: () => res(false) }, { label: o.ok || '确认执行', cls: 'primary', onClick: () => res(true) }] });
    });
  }
  function toast(msg, type) {
    const el = frag(`<div class="toast ${type || 'ok'}">${icon(type === 'err' || type === 'warn' ? 'warn' : 'check')}<span>${msg}</span></div>`);
    $('#toast-root').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 240); }, 2800);
  }

  /* ---------------- Form ---------------- */
  function field(f, value) {
    const req = f.required ? '<span class="req">*</span>' : '';
    const dv = typeof f.def === 'function' ? f.def() : f.def;
    const v = value === undefined || value === null ? (dv !== undefined ? dv : '') : value;
    let input;
    if (f.type === 'select' || f.type === 'ref') {
      let opts = [];
      if (f.type === 'ref') {
        const t = SCHEMA.entities[f.ref];
        opts = DB.list(f.ref).map(r => [r[t.pk], (r.name ? r.name + ' · ' : '') + r[t.pk]]);
      } else if (f.opts) {
        opts = Object.keys(f.opts).map(k => {
          const o = f.opts[k];
          const raw = o === 1 || o === true || o === undefined || typeof o === 'object';
          return [k, raw ? ((SCHEMA.STATUS[k] || {}).l || k) : o];
        });
      }
      input = `<select data-k="${f.k}" ${f.readonly ? 'disabled' : ''}>${f.placeholder !== false ? `<option value="">${esc(f.ph || '请选择')}</option>` : ''}${opts.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    } else if (f.type === 'bool') {
      input = `<label class="switch"><input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}><span class="track"></span><span class="small muted">${esc(f.on || '启用')}</span></label>`;
    } else if (f.type === 'textarea') {
      input = `<textarea data-k="${f.k}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}" ${f.readonly ? 'readonly' : ''}>${esc(v)}</textarea>`;
    } else {
      const t = f.type === 'date' ? 'date' : f.type === 'money' || f.type === 'int' || f.type === 'percent' ? 'number' : 'text';
      const step = f.type === 'money' || f.type === 'percent' ? '0.01' : f.type === 'int' ? '1' : undefined;
      input = `<input data-k="${f.k}" type="${t}"${step ? ` step="${step}"` : ''} value="${esc(v)}" placeholder="${esc(f.ph || '')}" class="${f.type === 'money' || f.type === 'int' || f.type === 'percent' ? 'num right' : ''}${f.type === 'code' ? ' mono' : ''}" ${f.readonly ? 'readonly' : ''}>`;
    }
    return `<div class="fitem ${f.full ? 'f-full' : ''}" data-f="${f.k}"><label>${esc(f.label)}${req}</label>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}<div class="err">${esc(f.msg || '此项为必填')}</div></div>`;
  }
  function form(fields, values) {
    values = values || {};
    return `<div class="form-grid${(fields || []).some(f => f.full) ? '' : ''}">${fields.map(f => field(f, values[f.k])).join('')}</div>`;
  }
  function readForm(root, fields) {
    const out = {}, errs = [];
    fields.forEach(f => {
      const el = $('[data-k="' + f.k + '"]', root);
      if (!el) return;
      let v = f.type === 'bool' ? el.checked : el.value;
      if (f.type === 'money' || f.type === 'int' || f.type === 'percent') v = v === '' ? null : +v;
      out[f.k] = v;
      const box = el.closest('.fitem');
      let bad = false;
      if (f.required && (v === '' || v === null || v === undefined)) bad = true;
      if (!bad && f.email && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) bad = true;
      if (!bad && f.pattern && v && !new RegExp(f.pattern).test(v)) { bad = true; $('.err', box).textContent = f.msg || '格式不正确'; }
      if (bad) { box.classList.add('invalid'); errs.push(f.label); } else box.classList.remove('invalid');
    });
    return { values: out, ok: !errs.length, errors: errs };
  }

  /* ---------------- Charts (纯 SVG) ---------------- */
  const PAL = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#64748B', '#EC4899'];

  function lineChart(series, labels, o) {
    o = o || {};
    const W = o.w || 820, H = o.h || 250, pl = 58, pr = 14, pt = 16, pb = 26;
    const allv = series.reduce((s, x) => s.concat(x.data), [0]);
    const max = Math.max(1, ...allv), min = Math.min(0, ...allv);
    const x = i => pl + i * (W - pl - pr) / Math.max(1, labels.length - 1);
    const y = v => pt + (H - pt - pb) * (1 - (v - min) / (max - min || 1));
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const val = min + (max - min) * g / 4, gy = y(val);
      grid += `<line class="grid-line" x1="${pl}" y1="${gy}" x2="${W - pr}" y2="${gy}"/><text class="axis-text" x="${pl - 8}" y="${gy + 4}" text-anchor="end">${compact(val)}</text>`;
    }
    let svg = '';
    series.forEach((s, si) => {
      const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      if (s.area) {
        svg += `<path d="M${pl},${y(min)} L${s.data.map((v, i) => x(i) + ',' + y(v)).join(' L')} L${x(s.data.length - 1)},${y(min)} Z" fill="${s.color}" opacity=".08"/>`;
      }
      svg += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
      svg += s.data.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.4" fill="#fff" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} ${esc(labels[i])}: ${money(v)}</title></circle>`).join('');
    });
    const xl = labels.map((l, i) => (labels.length > 9 && i % 2 ? '' : `<text class="axis-text" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(String(l).slice(-5))}</text>`)).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${grid}${svg}${xl}</svg>` + legend(series);
  }
  function legend(series) {
    return `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }
  function barChart(labels, data, o) {
    o = o || {};
    const W = o.w || 820, H = o.h || 250, pl = 58, pr = 14, pt = 16, pb = 28;
    const max = Math.max(1, ...data.map(d => (typeof d === 'object' ? Math.max(d.a || 0, d.b || 0) : d)));
    const bw = (W - pl - pr) / data.length;
    const y = v => pt + (H - pt - pb) * (1 - v / max);
    let grid = '';
    for (let g = 0; g <= 4; g++) { const val = max * g / 4, gy = y(val); grid += `<line class="grid-line" x1="${pl}" y1="${gy}" x2="${W - pr}" y2="${gy}"/><text class="axis-text" x="${pl - 8}" y="${gy + 4}" text-anchor="end">${compact(val)}</text>`; }
    let bars = '';
    data.forEach((d, i) => {
      const isObj = typeof d === 'object';
      const a = isObj ? d.a : d, b = isObj ? d.b : null;
      const gx = pl + i * bw;
      const unit = isObj ? bw * .34 : bw * .5;
      const col = isObj ? d.color : (o.color || PAL[0]);
      bars += `<rect class="bar" x="${gx + (bw - (isObj ? unit * 2 + 4 : unit)) / 2}" y="${y(a)}" width="${unit}" height="${Math.max(0, H - pb - y(a))}" rx="4" fill="${col}"><title>${esc(labels[i])}: ${money(a)}</title></rect>`;
      if (b !== null) bars += `<rect class="bar" x="${gx + (bw - (unit * 2 + 4)) / 2 + unit + 4}" y="${y(b)}" width="${unit}" height="${Math.max(0, H - pb - y(b))}" rx="4" fill="${d.color2 || PAL[1]}"><title>${esc(labels[i])}: ${money(b)}</title></rect>`;
      bars += `<text class="axis-text" x="${gx + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${grid}${bars}</svg>` + (o.legend || '');
  }
  function donut(items, o) {
    o = o || {};
    const S = o.size || 210, r = S / 2, ir = r * .62, total = items.reduce((s, i) => s + i.value, 0) || 1;
    let a0 = -Math.PI / 2, paths = '';
    items.forEach((it, i) => {
      const a1 = a0 + (it.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rr, a) => [r + rr * Math.cos(a), r + rr * Math.sin(a)];
      const [x0, y0] = p(r, a0), [x1, y1] = p(r, a1), [x2, y2] = p(ir, a1), [x3, y3] = p(ir, a0);
      paths += `<path class="bar" d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ir},${ir} 0 ${large} 0 ${x3},${y3} Z" fill="${it.color || PAL[i % PAL.length]}"><title>${esc(it.name)}: ${money(it.value)} (${(it.value / total * 100).toFixed(1)}%)</title></path>`;
      a0 = a1;
    });
    return `<div class="flex wrap" style="gap:20px;align-items:center">
      <svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" style="flex:0 0 ${S}px">${paths}
        <foreignObject x="${r - 70}" y="${r - 24}" width="140" height="48"><div xmlns="http://www.w3.org/1999/xhtml" class="donut-center" style="text-align:center"><b>${compact(total)}</b><span>${esc(o.centerLabel || '合计')}</span></div></foreignObject>
      </svg>
      <div class="grow">${items.map((it, i) => `<div class="hbar-row" style="grid-template-columns:130px 1fr 92px">
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${it.color || PAL[i % PAL.length]};margin-right:6px"></i>${esc(it.name)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${(it.value / total * 100).toFixed(1)}%;background:${it.color || PAL[i % PAL.length]}"></span></span>
        <span class="v">${money(it.value)}</span></div>`).join('')}</div></div>`;
  }
  function hbars(items, o) {
    o = o || {};
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div>${items.map((it, i) => `<div class="hbar-row">
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.links ? `<span class="cell-link" data-open="${o.links}=${encodeURIComponent(it.key)}">${esc(it.name)}</span>` : esc(it.name)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(it.value / max * 100).toFixed(1)}%;background:${it.color || PAL[i % PAL.length]}"></span></span>
      <span class="v">${o.fmt ? o.fmt(it.value) : money(it.value)}</span></div>`).join('')}</div>`;
  }

  /* ---------------- misc ---------------- */
  function descs(pairs, cls) {
    return `<dl class="descs ${cls || ''}">${pairs.filter(Boolean).map(p => `<div><dt>${esc(p[0])}</dt><dd>${p[1] === null || p[1] === undefined || p[1] === '' ? '<span class="muted">—</span>' : p[1]}</dd></div>`).join('')}</dl>`;
  }
  function kpi(o) {
    return `<div class="kpi"><div class="accent" style="background:${o.color || '#4F46E5'}"></div>
      <div class="label">${icon(o.icon || 'chart')}${esc(o.label)}</div>
      <div class="val">${o.value}${o.unit ? `<small>${esc(o.unit)}</small>` : ''}</div>
      <div class="foot">${o.trend !== undefined && o.trend !== null ? `<span class="trend ${o.trend >= 0 ? 'up' : 'down'}">${icon(o.trend >= 0 ? 'trendUp' : 'trendDown')}${Math.abs(o.trend).toFixed(1)}%</span>` : ''}<span>${o.foot || ''}</span></div></div>`;
  }
  function toolbarSearch(value) {
    return `<div class="search-field">${icon('search')}<input data-search placeholder="搜索单号 / 名称 / 编码…" value="${esc(value || '')}"></div>`;
  }
  function chips(options, active, counts) {
    return `<div class="chips">${options.map(o => `<span class="chip ${String(active) === String(o.v) ? 'on' : ''}" data-chip="${esc(o.v)}">${esc(o.l)}${counts && counts[o.v] !== undefined ? ` <span class="n">${counts[o.v]}</span>` : ''}</span>`).join('')}</div>`;
  }

  const VIEWS_BY_ENTITY = {};
  function registerEntityView(entity, view) { VIEWS_BY_ENTITY[entity] = view; }

  return { P, icon, money, cny, compact, num, dateCN, esc, days, round2, $, $$, frag, badge, stLabel, refName, cellRef,
    table, emptyBox, pager, modal, drawer, confirm, toast, form, field, readForm, lineChart, barChart, donut, hbars, legend,
    descs, kpi, toolbarSearch, chips, registerEntityView, VIEWS_BY_ENTITY, PAL };
})();
