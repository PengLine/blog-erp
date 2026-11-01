/* ============================================================
 * store.js — 持久化数据层(localStorage,带内存兜底)
 * ============================================================ */
window.DB = (function () {
  const KEY = 'sailfish_erp_db_v1';
  const SEED_VERSION = 'sfe-2026.11-D';

  let mem = null;               // { tables:{...}, seq:{...}, seedVersion, meta }
  let storageOK = true;

  function blank() {
    const tables = {};
    Object.keys(SCHEMA.entities).forEach(k => { tables[k] = []; });
    return { tables, seq: {}, seedVersion: '', meta: { company: '赛福数字科技(杭州)有限公司', taxNo: '91330108MA2GTX8C4H' } };
  }
  function persist() {
    if (!storageOK) return;
    try { localStorage.setItem(KEY, JSON.stringify(mem)); }
    catch (e) { storageOK = false; console.warn('[DB] localStorage 不可用,本次会话使用内存存储', e); }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.tables) {
          mem = parsed;
          Object.keys(SCHEMA.entities).forEach(k => { if (!mem.tables[k]) mem.tables[k] = []; });
          mem.seq = mem.seq || {};
          return;
        }
      }
    } catch (e) { storageOK = false; }
    mem = blank();
  }

  /* ---------- 基础读写 ---------- */
  function list(t) { return mem.tables[t] || (mem.tables[t] = []); }
  function all() { return mem; }
  function pkOf(t) { return SCHEMA.entities[t].pk; }

  function find(t, id) {
    const pk = pkOf(t);
    return list(t).find(r => String(r[pk]) === String(id)) || null;
  }
  function where(t, fn) { return list(t).filter(fn); }
  function count(t) { return list(t).length; }

  function insert(t, row) {
    list(t).push(row); persist(); return row;
  }
  /** upsert by primary key; returns the stored row */
  function upsert(t, row) {
    const pk = pkOf(t);
    if (!pk) throw new Error(`${t} 是明细表,请用 setLines 整单写入`);
    const arr = list(t);
    const i = arr.findIndex(r => String(r[pk]) === String(row[pk]));
    if (i >= 0) arr[i] = Object.assign({}, arr[i], row); else arr.push(row);
    persist();
    return i >= 0 ? arr[i] : row;
  }
  function update(t, id, patch) {
    const r = find(t, id);
    if (!r) return null;
    Object.assign(r, patch); persist(); return r;
  }
  function remove(t, id) {
    const pk = pkOf(t), arr = list(t);
    const i = arr.findIndex(r => String(r[pk]) === String(id));
    if (i < 0) return false;
    arr.splice(i, 1);
    const s = SCHEMA.entities[t];
    if (s.doc) removeLines(s.doc, id);
    persist(); return true;
  }

  /* ---------- 单据明细行(子表) ---------- */
  function lines(docTable, docNo) {
    return list(docTable).filter(l => String(l.doc) === String(docNo))
      .sort((a, b) => (a.lineno || 0) - (b.lineno || 0));
  }
  function setLines(docTable, docNo, rows) {
    const keep = list(docTable).filter(l => String(l.doc) !== String(docNo));
    rows.forEach((l, i) => { l.doc = docNo; l.lineno = i + 1; });
    mem.tables[docTable] = keep.concat(rows);
    persist();
    return rows;
  }
  function removeLines(docTable, docNo) {
    mem.tables[docTable] = list(docTable).filter(l => String(l.doc) !== String(docNo));
  }

  /* ---------- 单据编号 SO2026-0042 ---------- */
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function yearOf(d) { return String(d || today()).slice(0, 4); }
  function nextNo(entityKey, dateStr) {
    const e = SCHEMA.entities[entityKey];
    const year = yearOf(dateStr);
    const k = entityKey + ':' + year;
    const n = (mem.seq[k] || 0) + 1;
    mem.seq[k] = n;
    persist();
    return e.prefix + year + '-' + pad(n, 4);
  }
  function peekSeq(entityKey, dateStr) {
    const year = yearOf(dateStr);
    return mem.seq[entityKey + ':' + year] || 0;
  }
  function bumpSeq(entityKey, dateStr, to) {
    const year = yearOf(dateStr), k = entityKey + ':' + year;
    if ((mem.seq[k] || 0) < to) { mem.seq[k] = to; persist(); }
  }

  /* ---------- 日期 ---------- */
  function today() { return new Date().toISOString().slice(0, 10); }
  function nowStr() {
    const d = new Date(), p = n => pad(n, 2);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T09:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function monthOf(dateStr) { return String(dateStr).slice(0, 7); }

  /* ---------- 审计日志 ---------- */
  function log(module, action, ref, detail) {
    const user = (mem.meta && mem.meta.currentUser) || '系统';
    list('activity').unshift({ id: 'L' + Date.now() + Math.floor(Math.random() * 1000), time: nowStr(), user, module, action, ref: ref || '', detail: detail || '' });
    if (list('activity').length > 800) mem.tables.activity.length = 800;
    persist();
  }
  function currentUser() {
    if (!mem.meta.currentUser) mem.meta.currentUser = '陈立群';
    return mem.meta.currentUser;
  }

  /* ---------- 生命周期 ---------- */
  function init() {
    load();
    if (mem.seedVersion !== SEED_VERSION) {
      mem = blank();
      SEED.build(mem, API);
      mem.seedVersion = SEED_VERSION;
      mem.meta.currentUser = '陈立群';
      persist();
      console.info('[DB] 已生成演示数据 v' + SEED_VERSION);
    }
  }
  function reset() {
    mem = blank();
    try { localStorage.removeItem(KEY); } catch (e) { }
    SEED.build(mem, API);
    mem.seedVersion = SEED_VERSION;
    mem.meta.currentUser = '陈立群';
    persist();
  }
  function exportJSON() { return JSON.stringify(mem, null, 2); }
  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !parsed.tables) throw new Error('备份文件格式不正确');
    mem = parsed;
    Object.keys(SCHEMA.entities).forEach(k => { if (!mem.tables[k]) mem.tables[k] = []; });
    persist();
  }
  function stats() {
    const out = {};
    Object.keys(mem.tables).forEach(k => out[k] = mem.tables[k].length);
    return out;
  }

  const API = {
    list, find, where, count, insert, upsert, update, remove,
    lines, setLines, nextNo, peekSeq, bumpSeq, all, stats, persist,
    today, nowStr, addDays, monthOf, log, currentUser, init, reset, exportJSON, importJSON, pad
  };
  return API;
})();
