/* ============================================================
 * lots.js — 批次(Batch/Lot)与库位(Bin)分配引擎
 * 纯算法层:只维护「批次余量 + 批次收发台账 + 落位」,不改任何金额,
 * 因此总账/库存子账口径与移动加权平均完全一致,批次是数量与流向维度。
 * 用法:LOT.engine(ctx) 返回一套收发分配函数;种子数据与运行时各注入自己的存取适配器。
 * ============================================================ */
window.LOT = (function () {

  const money = v => Math.round(v * 100) / 100;
  const FAR = '9999-12-31';
  const DAY_MS = 864e5;
  function daysBetween(from, to) {
    if (!from || !to) return 0;
    return Math.round((Date.parse(to + 'T00:00:00') - Date.parse(from + 'T00:00:00')) / DAY_MS);
  }
  /** 由单号派生的稳定偏移:生产日期落在到货前的合理区间,种子与运行时同源可复现 */
  function prodOffset(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 9973;
    return h;
  }

  /** ctx = {
   *    lots(): 批次数组, txs(): 台账数组,
   *    newLot(row), addTx(lotNo, row),        // 写入
   *    nextNo(): 批次号, today(), addDays(d,n), user(),
   *    bins(): 库位数组, products(code) -> 商品, mv(m) -> 回写流水行(可选)
   * } */
  function engine(ctx) {
    const pending = {};               // 调拨/转检在途:ref|product -> 分配结果,配对入库时原批回转

    function lots() { return ctx.lots(); }
    function byId(no) { return lots().find(l => l.no === no) || null; }

    /* FEFO 优先:近效期先出,其后按入库时序、批次号 */
    function orderKey(l) {
      return (l.expire_date || FAR) + '|' + (l.receipt_date || '') + '|' + l.no;
    }
    function candidates(product, wh, includeHeld) {
      return lots().filter(l => l.product === product && l.warehouse === wh && l.qty > 0
        && (includeHeld ? l.status !== 'consumed' : l.status === 'normal'))
        .sort((a, b) => orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0);
    }
    /** 该物料在该仓的可发批次余量合计(冻结/过期不算) */
    function lotAvailable(product, wh) {
      return candidates(product, wh, false).reduce((s, l) => s + l.qty, 0);
    }
    /** 质量扣留量:冻结 + 过期批次仍账面在库,但不可销售领用 */
    function holdQty(product, wh) {
      return lots().filter(l => l.product === product && l.warehouse === wh && l.qty > 0
        && (l.status === 'frozen' || l.status === 'expired')).reduce((s, l) => s + l.qty, 0);
    }

    /* ---------------- 库位 ---------------- */
    function binRows() { return ctx.bins ? ctx.bins() : []; }
    function zoneOf(wh) {
      const w = (ctx.warehouses ? ctx.warehouses(wh) : null) || {};
      return w.kind === 'qc' ? 'qcd' : w.kind === 'defect' ? 'def' : 'stg';
    }
    function binLoad(binCode) {
      return lots().filter(l => l.bin === binCode && l.qty > 0).reduce((s, l) => s + l.qty, 0);
    }
    /** 落位规则:同物料已有库位优先 → 按库区顺序找有空余的库位 → 兜底库区最后一个 */
    function pickBin(product, wh, qty) {
      const zone = zoneOf(wh);
      const inZone = binRows().filter(b => b.warehouse === wh && b.status === 'enabled'
        && (b.zone === zone || (zone === 'stg' && b.zone === 'pick')));
      if (!inZone.length) return '';
      const home = lots().filter(l => l.product === product && l.warehouse === wh && l.bin && l.qty > 0)
        .sort((a, b) => orderKey(b) < orderKey(a) ? -1 : 1)[0];
      if (home) {
        const h = inZone.find(b => b.code === home.bin);
        if (h && binLoad(h.code) + qty <= (h.capacity || 0)) return h.code;   // 原库位仍有容量才续用
      }
      const free = inZone.filter(b => binLoad(b.code) + qty <= (b.capacity || 0));
      if (free.length) return free.sort((a, b) => binLoad(a.code) / (a.capacity || 1) - binLoad(b.code) / (b.capacity || 1))[0].code;
      return inZone.slice().sort((a, b) => binLoad(a.code) - binLoad(b.code))[0].code;   // 满仓兜底:挂到最空的库位
    }

    /* ---------------- 批次收发 ---------------- */
    function newLotNo() { return ctx.nextNo(); }

    /** 收货入批:一笔入库流水建一个批次(批次=最小质量单元) */
    function receive(m, meta) {
      meta = meta || {};
      const p = ctx.product ? ctx.product(m.product) : null;
      const shelf = meta.shelf_life !== undefined ? meta.shelf_life : (p && p.shelf_life) || 0;
      const pdate = meta.prod_date || ctx.addDays(m.date, -(3 + prodOffset(m.no + m.product) % 26));
      const bin = m.bin || pickBin(m.product, m.warehouse, m.qty);
      const lot = {
        no: meta.lot || newLotNo(), product: m.product, product_name: m.product_name,
        warehouse: m.warehouse, bin, source: meta.source || m.type, receipt: m.ref || m.no,
        supplier: meta.supplier || '', supplier_name: meta.supplier_name || '', sup_lot: meta.sup_lot || '',
        iqc: meta.iqc || '', receipt_date: m.date, prod_date: pdate,
        expire_date: shelf ? ctx.addDays(pdate, shelf) : '',
        qty_in: m.qty, qty: m.qty, unit_cost: money(m.unit_cost), value: money(m.qty * m.unit_cost),
        age_days: Math.max(0, daysBetween(m.date, ctx.today())), status: 'normal', hold_note: '',
        note: meta.note || ''
      };
      ctx.newLot(lot);
      tx(lot, m, +m.qty, bin);
      stamp(m, [lot], bin, meta.quiet);
      return [lot];
    }
    /** 批次拆分落地:同一批号可在两个仓各有一条余量记录,子批次回指源批次 */
    function splitLot(src, m, qty, bin) {
      const kids = lots().filter(l => l.parent === src.no).length;
      const child = Object.assign({}, src, {
        no: src.no + '-S' + (kids + 1), warehouse: m.warehouse, bin,
        qty_in: qty, qty: qty, value: money(qty * src.unit_cost),
        parent: src.no, status: 'normal', hold_note: '',
        note: (src.note ? src.note + ' / ' : '') + '分批落地,源批次 ' + src.no
      });
      ctx.newLot(child);
      tx(child, m, +qty, bin);
      return child;
    }
    /** 转入(调拨/转检落地):整批走完沿用原批次,批次仍有结余则拆出子批次 */
    function deposit(m, alloc) {
      const bin = pickBin(m.product, m.warehouse, m.qty);
      const plan = [];
      alloc.forEach(a => {
        const src = byId(a.lot);
        if (!src) return;
        if (src.warehouse !== m.warehouse && src.qty > 0) {      // 跨仓且源批次仍有结余:拆批,不能整批搬家
          const child = splitLot(src, m, a.qty, bin);
          plan.push({ lot: child.no, qty: a.qty });
          return;
        }
        src.qty += a.qty;
        src.warehouse = m.warehouse; src.bin = bin;
        src.status = src.qty > 0 ? (src.status === 'consumed' ? 'normal' : src.status) : 'consumed';
        src.age_days = Math.max(0, daysBetween(src.receipt_date, ctx.today()));
        tx(src, m, +a.qty, bin);
        plan.push({ lot: src.no, qty: a.qty });
      });
      stamp(m, plan, bin);
      return plan;
    }
    /** 出库分配:FEFO 逐个批次扣减;账面不足时先借冻结/过期批次,再补建差异批次,保证台账断裂为零 */
    function take(m, qty, prefer) {
      const plan = [];
      let left = qty;
      let pool = candidates(m.product, m.warehouse, false);
      if (prefer) {                                   // 手工指定批次优先(处置冻结/过期批次时不受可售状态限制)
        const p = lots().filter(l => prefer.indexOf(l.no) >= 0 && l.product === m.product
          && l.warehouse === m.warehouse && l.qty > 0);
        pool = p.concat(pool.filter(l => p.indexOf(l) < 0));
      }
      for (let i = 0; i < pool.length && left > 0; i++) {
        const l = pool[i], q = Math.min(l.qty, left);
        l.qty -= q; left -= q;
        plan.push({ lot: l.no, qty: q });
        tx(l, m, -q, l.bin);
        if (l.qty === 0) { l.status = 'consumed'; l.hold_note = ''; }   // 发完即终态,质量结论留在流水与处置单里
        if (l.qty > 0) l.age_days = Math.max(0, daysBetween(l.receipt_date, ctx.today()));
      }
      if (left > 0) {                                 // 兜底:账面有货但批次台账缺量(异常数据自愈)
        const held = candidates(m.product, m.warehouse, true);
        for (let i = 0; i < held.length && left > 0; i++) {
          const l = held[i], q = Math.min(l.qty, left);
          l.qty -= q; left -= q;
          plan.push({ lot: l.no, qty: q });
          tx(l, m, -q, l.bin);
          if (l.qty === 0) l.status = 'consumed';
        }
      }
      if (left > 0) {
        const patch = Object.assign({}, m, { qty: left, note: '批次台账差异补建(账实自愈)' });
        const made = receive(patch, { source: 'manual', quiet: true, note: patch.note });
        const l = made[0];
        tx(l, m, -l.qty, l.bin);
        plan.push({ lot: l.no, qty: l.qty });
        l.qty = 0; l.status = 'consumed';
      }
      const main = plan[0] ? byId(plan[0].lot) : null;
      stamp(m, plan, main ? main.bin : '');
      return plan;
    }
    function tx(lot, m, qty, bin) {
      ctx.addTx(lot.no, { doc: lot.no, lineno: 0, date: m.date, mv: m.no, type: m.type, product: m.product,
        warehouse: m.warehouse, bin: bin || lot.bin, qty, ref: m.ref || '', user: m.user || ctx.user(),
        note: m.note || '' });
    }
    /** 流水行回写批次/库位,让出入库流水本身可下钻 */
    function stamp(m, plan, bin, quiet) {
      const nos = plan.map(p => p.lot || p.no).filter(Boolean);
      if (!nos.length) return;
      m.lot = nos.length === 1 ? nos[0] : nos[0] + ' +' + (nos.length - 1);
      m.lot_cnt = nos.length;
      if (bin) m.bin = bin;
      if (ctx.stampMv && !quiet) ctx.stampMv(m);
    }

    /** 主入口:按流水符号与去向自动分配 */
    function apply(m, meta) {
      if (!m || !m.product || !m.qty || m.qty === 0) return null;
      if (m.qty > 0) {
        const key = (m.ref || m.no) + '|' + m.product;
        const pend = pending[key];
        if (pend) { delete pending[key]; return deposit(m, pend); }
        return receive(m, meta);
      }
      const alloc = take(m, -m.qty, meta && meta.lots);
      if (m.to_warehouse) pending[(m.ref || m.no) + '|' + m.product] = alloc.map(a => ({ lot: a.lot, qty: a.qty }));
      return alloc;
    }

    /** 效期巡检:到期批次转「已过效期」,冻结批次不动 */
    function ageScan() {
      const t = ctx.today(), hit = [];
      lots().forEach(l => {
        if (l.qty <= 0 || !l.expire_date || l.status !== 'normal') return;
        if (l.expire_date < t) { l.status = 'expired'; hit.push(l.no); }
      });
      return hit;
    }
    /** 冻结/解冻:质量扣留只影响可用量,不影响账面数量与金额 */
    function setStatus(lotNo, status, reason) {
      const l = byId(lotNo);
      if (!l) throw new Error('批次不存在:' + lotNo);
      if (l.qty <= 0 && status !== 'consumed') throw new Error(`批次 ${lotNo} 已发完,无需${status === 'frozen' ? '冻结' : '变更状态'}`);
      l.status = status;
      l.hold_note = status === 'frozen' || status === 'expired' ? (reason || '') : '';
      if (ctx.updLot) ctx.updLot(l);
      return l;
    }
    /** 批次移位:同仓换库位或跨仓转库(跨仓必须由出入库流水承载,这里只做同仓整托移位) */
    function relocate(lotNo, bin) {
      const l = byId(lotNo);
      if (!l) throw new Error('批次不存在:' + lotNo);
      const b = binRows().find(x => x.code === bin);
      if (!b) throw new Error('库位不存在:' + bin);
      if (b.warehouse !== l.warehouse) throw new Error(`${bin} 属于 ${b.warehouse},跨仓移位请走库存调拨单`);
      if (b.status !== 'enabled') throw new Error(`${bin} 已停用,不能作为落位目标`);
      /* 库区管控:待检/残次隔离区不可接收正品,收货车位只作到货暂存,正品在存储与拣货区之间流转 */
      const zone = zoneOf(l.warehouse);
      const keepIsolated = l.status === 'frozen' || l.status === 'expired' || zone !== 'stg';
      const allowed = keepIsolated ? [zone] : [zone, 'pick'];
      if (allowed.indexOf(b.zone) < 0)
        throw new Error(`${bin} 属${SCHEMA.ZONES[b.zone] || b.zone},与批次所在${SCHEMA.ZONES[zone] || zone}的库区规则不符`
          + (l.status !== 'normal' ? ';质量异常批次须留在隔离区' : ''));
      if (binLoad(bin) + l.qty > (b.capacity || 0) && b.code !== l.bin)
        throw new Error(`${bin} 剩余容量 ${Math.max(0, (b.capacity || 0) - binLoad(bin))} 件,不足以容纳 ${l.qty} 件`);
      const from = l.bin;
      l.bin = bin;
      if (ctx.updLot) ctx.updLot(l);
      ctx.addTx(l.no, { doc: l.no, lineno: 0, date: ctx.today(), mv: '', type: 'relocate', product: l.product,
        warehouse: l.warehouse, bin, qty: 0, ref: from + ' → ' + bin, user: ctx.user(), note: '库位移位(数量不变)' });
      return { from, to: bin };
    }

    return { byId, candidates, lotAvailable, holdQty, pickBin, binLoad, apply, receive, take, deposit,
      ageScan, setStatus, relocate, newLotNo };
  }

  return { engine, money, FAR };
})();
