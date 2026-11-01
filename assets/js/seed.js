/* ============================================================
 * seed.js — 确定性演示数据生成器
 * 覆盖 6 个月完整业务流:销售订单→出库→开票→收款;
 * 采购申请→订单→收货→账单→付款;库存流水、调拨、盘点、总账凭证。
 * 所有数量/金额相互勾稽,可直接用于财务报表。
 * ============================================================ */
window.SEED = (function () {

  function rng(seed) {
    let a = seed >>> 0;
    function next() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    return {
      next,
      int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
      pick: arr => arr[Math.floor(next() * arr.length)],
      chance: p => next() < p,
      money: (min, max, dec = 2) => +(min + next() * (max - min)).toFixed(dec)
    };
  }

  const CAT = {
    HM: { name: '家居用品', tax: 13, items: [
      ['香薰机', 52, 3], ['乳胶枕', 48, 4], ['四件套床品', 89, 2], ['收纳箱三件套', 22, 8],
      ['LED 落地灯', 66, 3], ['记忆棉坐垫', 35, 5], ['恒温电热水壶', 78, 3]] },
    DP: { name: '数码配件', tax: 13, items: [
      ['65W 氮化镓充电器', 46, 6], ['TWS 蓝牙耳机', 72, 5], ['移动固态硬盘 1TB', 288, 2],
      ['桌面 USB-C 扩展坞', 98, 4], ['无线机械键盘', 158, 3], ['磁吸无线充电宝', 66, 5],
      ['4K 高清摄像头', 118, 3]] },
    PP: { name: '个护美妆', tax: 13, items: [
      ['氨基酸洁面乳', 18, 10], ['玻尿酸面膜', 26, 8], ['高速吹风机', 128, 3],
      ['电动牙刷套装', 68, 5], ['烟酰胺身体乳', 32, 8], ['香水调香礼盒', 145, 2]] },
    AC: { name: '户外配件', tax: 13, items: [
      ['折叠露营椅', 78, 4], ['全自动帐篷', 268, 2], ['便携卡式炉', 96, 3],
      ['户外保温壶', 42, 6], ['登山杖一对', 56, 5], ['露营氛围灯', 28, 10]] },
    OF: { name: '办公用品', tax: 13, items: [
      ['人体工学腰靠', 58, 4], ['升降桌台支架', 268, 2], ['A4 文件柜', 168, 2],
      ['白板 90×120', 88, 3], ['办公椅网布款', 218, 2]] },
    GD: { name: '通用五金', tax: 13, items: [
      ['多功能螺丝刀套装', 26, 10], ['锂电手电钻', 138, 3], ['激光测距仪', 88, 4],
      ['工具收纳包', 32, 8], ['防爆照明灯头', 22, 12]] },
  };
  const VARIANTS = ['标准版', 'Pro 升级版', '轻量版', '旗舰版', '青春版', '经典款', '尊享套装', '商务款'];
  const COLORS = ['云雾白', '深空灰', '雾霾蓝', '燕麦米', '曜石黑', '豆沙绿'];

  const CUST_PRE = ['云启', '恒晟', '麦巨', '蓝鲸', '锦鲤', '宸远', '橙子', '拓元', '汇买', '星野', '沐家', '九州', '川流', '海纳', '青禾', '磐石', '朗越', '卓辉', '宜搭', '南屿'];
  const CUST_SUF = { 'KA 重点客户': ['供应链管理有限公司', '商贸集团有限公司'], '区域经销商': ['贸易有限公司', '商贸有限公司'],
    '电商平台': ['网络科技有限公司', '电子商务有限公司'], '连锁门店': ['连锁超市有限公司', '家居连锁有限公司'],
    '外贸客户': ['进出口有限公司', 'International Trade Co.'], '直销散户': ['工作室', '生活馆'] };
  const CITY = { '华东': ['杭州', '上海', '南京', '苏州', '宁波'], '华南': ['深圳', '广州', '东莞', '厦门'], '华北': ['北京', '天津', '石家庄'],
    '华中': ['武汉', '长沙', '郑州'], '西南': ['成都', '重庆', '昆明'], '西北': ['西安', '兰州'], '东北': ['沈阳', '大连'], '海外': ['新加坡', '洛杉矶', '汉堡'] };
  const SUP_PRE = ['东莞 Jinghui', '杭州澜湾', '深圳芯源', '宁波恒泰', '佛山优家', '苏州精密达', '厦门蓝洋', '中山明辉', '青岛海丰', '金华百汇'];
  const SUP_MID = ['智能家居', '精密电子', '日用化工', '五金制品', '包装科技', '新材料', '工贸'];

  const SALES_PEOPLE = ['林墨对白', '周寒峰', '吴清越', '郑思远', '孙未蹊'];

  function build(mem, api) {
    const R = rng(20261101);
    const T = mem.tables;
    const push = (t, row) => { T[t].push(row); return row; };
    const addDays = api.addDays, today = api.today();
    const money = v => +v.toFixed(2);

    /* ---------- 组织与用户 ---------- */
    const USERS = [
      ['EMP-1001', '陈立群', '总经办', '系统管理员'], ['EMP-1002', '方静姝', '财务部', '财务经理'],
      ['EMP-1003', '林墨对白', '销售部', '销售主管'], ['EMP-1004', '周寒峰', '销售部', '销售代表'],
      ['EMP-1005', '吴清越', '销售部', '销售代表'], ['EMP-1006', '郑思远', '采购部', '采购主管'],
      ['EMP-1007', '孙未蹊', '采购部', '采购员'], ['EMP-1008', '何砚舟', '仓储物流部', '仓库管理员'],
      ['EMP-1009', '罗小满', '仓储物流部', '仓库管理员'], ['EMP-1010', '钱雅诃', '财务部', '财务会计'],
      ['EMP-1011', '苗泽宇', '信息技术部', '系统管理员'], ['EMP-1012', '章拾贰', '销售部', '销售代表'],
    ];
    USERS.forEach((u, i) => push('users', {
      code: u[0], name: u[1], dept: u[2], role: u[3],
      email: 'emp' + u[0].slice(4) + '@sailfish-erp.com', phone: '138' + String(50000000 + i * 137111).slice(0, 8),
      last_login: R.chance(.9) ? today : addDays(today, -3), status: i === 11 ? 'inactive' : 'active'
    }));

    /* ---------- 仓库 ---------- */
    const WHS = [
      ['WH-HZ01', '杭州中心仓', '浙江省杭州市萧山区宁围街道传化物流基地 12 号库', '何砚舟', 'enabled', 8600],
      ['WH-GZ02', '广州南沙仓', '广东省广州市南沙区港前大道南 4 号保税物流园 B 区', '罗小满', 'enabled', 5200],
      ['WH-TJ03', '天津华北仓', '天津市东丽区空港经济区中心大道 55 号', '罗小满', 'enabled', 3800],
      ['WH-CD04', '成都西南仓', '四川省成都市青白江区智慧产业城 D6 库', '何砚舟', 'enabled', 2400],
      ['WH-RF05', 'returns 退货残次仓', '浙江省杭州市余杭区良渚街道 Logistics 园 3 号库', '罗小满', 'enabled', 900],
    ];
    WHS.forEach(w => push('warehouses', { code: w[0], name: w[1], location: w[2], manager: w[3], phone: '0571-8' + R.int(1000000, 9999999), area: w[5], status: w[4], note: '' }));
    const MAIN_WH = 'WH-HZ01';

    /* ---------- 商品 ---------- */
    let skuIdx = 1;
    const catKeys = Object.keys(CAT);
    catKeys.forEach((ck, ci) => {
      CAT[ck].items.forEach((it, ii) => {
        const variants = ck === 'GD' ? 2 : (ii % 2 === 0 ? 3 : 2);
        for (let v = 0; v < variants; v++) {
          if (T.products.length >= 62) break;
          const base = it[0], stdCost = it[1], baseQty = it[2];
          const factor = [1, 1.35, 0.72, 1.6][v % 4];
          const cost = money(stdCost * factor * (0.94 + R.next() * 0.12));
          const margin = 1 / (0.42 + R.next() * 0.18);         // 毛利率 42%~60%
          const isDisabled = R.chance(.05);
          push('products', {
            code: ck + '-' + String(1000 + skuIdx++).slice(1),
            name: base + (v ? ' · ' + R.pick(VARIANTS) : ''),
            category: CAT[ck].name, brand: R.pick(['Sailfish', '沐野', 'Loft+', '青庭', 'NIDUS', '禾光']),
            uom: R.chance(.15) ? 'SET' : 'PCS', barcode: '69' + R.int(10000000000, 99999999999),
            cost, price: money(cost * margin), tax_rate: CAT[ck].tax, weight: R.int(120, 4800),
            safety_qty: Math.max(12, baseQty * R.int(2, 6)), lead_time: R.int(7, 35),
            status: isDisabled ? 'disabled' : 'enabled', color: R.pick(COLORS), note: '', _baseQty: baseQty, _cat: ck
          });
        }
      });
    });
    const PRODUCTS = T.products.filter(p => p.status === 'enabled');

    /* ---------- 客户 ---------- */
    const TYPES = Object.keys(CUST_SUF);
    for (let i = 0; i < 30; i++) {
      const type = i < 4 ? 'KA 重点客户' : i < 10 ? '电商平台' : i < 18 ? '区域经销商' : i < 24 ? '连锁门店' : i < 28 ? '外贸客户' : '直销散户';
      const region = type === '外贸客户' ? '海外' : R.pick(Object.keys(CITY));
      const city = R.pick(CITY[region]);
      const terms = type === '外贸客户' ? 'NET60' : type === 'KA 重点客户' ? R.pick(['NET45', 'NET60']) : type === '直销散户' ? 'COD' : R.pick(['NET30', 'NET45']);
      const credit = type === 'KA 重点客户' ? R.pick([2000000, 3000000, 5000000]) : type === '直销散户' ? 20000 : R.pick([200000, 400000, 600000, 800000, 1000000]);
      push('customers', {
        code: 'CU-' + String(1000 + i).slice(1), name: city + R.pick(CUST_PRE) + R.pick(CUST_SUF[type]),
        type, industry: R.pick(['家居零售', '3C 数码', '快消品', '综合电商', '外贸分销', '商超连锁']), region,
        contact: R.pick(['王', '李', '张', '刘', '陈', '杨', '黄', '周']) + R.pick(['经理', '总', '主管', '先生', '女士']),
        phone: '1' + R.pick(['3', '5', '7', '8', '9']) + R.pick(['0', '1', '2', '5', '6', '7', '8', '9']) + String(R.int(10000000, 99999999)),
        email: 'biz' + String(1000 + i).slice(1) + '@' + R.pick(['163.com', 'qq.com', 'sina.com', 'outlook.com']),
        address: city + '市' + R.pick(['高新区', '经开区', '保税区', '城西', '城南']) + R.pick(['科技大道', '产业园路', '商贸街', '滨江路']) + R.int(1, 999) + '号',
        tax_id: '913301' + R.int(10000000000, 99999999999) + 'X', credit_limit: credit, payment_terms: terms,
        salesperson: R.pick(SALES_PEOPLE), status: R.chance(.06) ? 'disabled' : 'enabled', note: ''
      });
    }
    const CUSTOMERS = T.customers.filter(c => c.status === 'enabled');

    /* ---------- 供应商 ---------- */
    const supCats = catKeys;
    for (let i = 0; i < 12; i++) {
      const ck = supCats[i % supCats.length];
      push('suppliers', {
        code: 'SU-' + String(1000 + i).slice(1), name: R.pick(SUP_PRE).replace(' ', '') + R.pick(SUP_MID) + R.pick(['有限公司', '股份有限公司', '实业有限公司']),
        category: CAT[ck].name, contact: R.pick(['吴', '孙', '钱', '周', '郑', '冯']) + R.pick(['经理', '厂长', '总']),
        phone: '1' + R.pick(['3', '5', '8']) + R.pick(['6', '8', '9']) + String(R.int(10000000, 99999999)),
        email: 'sales' + String(100 + i) + '@' + R.pick(['vendor.cn', 'supplier.com', 'factory.cn']),
        address: R.pick(['广东省东莞市', '浙江省宁波市', '江苏省苏州市', '广东省深圳市', '浙江省金华市', '福建省厦门市']) + R.pick(['长安镇', '北仑区', '昆山市', '龙华区', '义乌市']) + '工业路' + R.int(1, 200) + '号',
        tax_id: '9144' + R.int(10000000000, 99999999999) + 'W', lead_time: R.int(7, 30),
        payment_terms: R.pick(['NET30', 'NET45', 'NET60', 'PRE50']), currency: 'CNY', min_order: R.pick([100, 200, 300, 500]),
        rating: R.int(62, 98), status: R.chance(.08) ? 'disabled' : 'enabled', note: '', _cat: ck
      });
    }
    const SUPPLIERS = T.suppliers.filter(s => s.status === 'enabled');
    const supByCat = {};
    SUPPLIERS.forEach(s => { (supByCat[s._cat] = supByCat[s._cat] || []).push(s); });

    /* ---------- 期初库存 ---------- */
    const OPEN_DATE = addDays(today, -185);
    PRODUCTS.forEach(p => {
      const q = Math.round(p._baseQty * R.int(18, 60));
      push('stock_movements', { no: 'MV-INIT-' + p.code, date: OPEN_DATE, type: 'manual', product: p.code, product_name: p.name,
        warehouse: MAIN_WH, to_warehouse: '', qty: q, unit_cost: p.cost, amount: money(q * p.cost), ref: '期初建账', user: '何砚舟',
        note: '系统上线期初库存(2026 财年结转)' });
      if (R.chance(.55)) {
        const wh2 = R.pick(['WH-GZ02', 'WH-TJ03', 'WH-CD04']);
        const q2 = Math.round(q * (0.1 + R.next() * 0.25));
        push('stock_movements', { no: 'MV-INIT2-' + p.code + wh2.slice(-2), date: OPEN_DATE, type: 'manual', product: p.code, product_name: p.name,
          warehouse: wh2, to_warehouse: '', qty: q2, unit_cost: p.cost, amount: money(q2 * p.cost), ref: '期初建账', user: '罗小满', note: '分仓铺货期初' });
      }
    });

    /* ---------- 单据序号 & 流水号计数 ---------- */
    const seqs = {};
    function docNo(prefix, entityKey, date) {
      const y = date.slice(0, 4);
      const k = entityKey + ':' + y;
      seqs[k] = (seqs[k] || 0) + 1;
      mem.seq[k] = seqs[k];
      return prefix + y + '-' + api.pad(seqs[k], 4);
    }
    let mvIdx = 0;
    function movement(date, type, product, warehouse, qty, unitCost, ref, user, toWh, note) {
      mvIdx++;
      push('stock_movements', {
        no: 'MV' + date.slice(0, 4) + '-' + api.pad(5000 + mvIdx, 5), date, type,
        product: product.code, product_name: product.name, warehouse, to_warehouse: toWh || '',
        qty, unit_cost: money(unitCost), amount: money(qty * unitCost), ref, user: user || '何砚舟', note: note || ''
      });
    }

    /* ---------- 会计凭证 ---------- */
    const ACCOUNTS = [
      ['1001', '库存现金', 'asset', 'debit'], ['1002', '银行存款—基本户(招商银行杭州分行)', 'asset', 'debit'],
      ['1122', '应收账款', 'asset', 'debit'], ['1221', '预付账款', 'asset', 'debit'],
      ['1405', '库存商品', 'asset', 'debit'], ['1601', '固定资产', 'asset', 'debit'], ['1602', '累计折旧', 'asset', 'credit'],
      ['2202', '应付账款', 'liability', 'credit'], ['2221', '应交税费', 'liability', 'credit'], ['2211', '应付职工薪酬', 'liability', 'credit'],
      ['4001', '主营业务收入', 'revenue', 'credit'], ['4002', '其他业务收入', 'revenue', 'credit'],
      ['5001', '主营业务成本', 'cost', 'debit'], ['5401', '其他成本', 'cost', 'debit'],
      ['6601', '销售费用', 'expense', 'debit'], ['6602', '管理费用', 'expense', 'debit'], ['6711', '营业外支出', 'expense', 'debit'],
      ['3131', '本年利润', 'equity', 'credit'], ['3001', '实收资本', 'equity', 'credit'],
    ];
    const accName = {}; ACCOUNTS.forEach(a => accName[a[0]] = a[1]);
    let jeIdx = 0;
    function journal(date, type, ref, memo, lines, user) {
      jeIdx++;
      const no = 'JE' + date.slice(0, 4) + '-' + api.pad(1000 + jeIdx, 5);
      let debit = 0;
      lines.forEach((l, i) => { debit += (l.debit || 0); push('journal_lines', { doc: no, lineno: i + 1, account: l.acc, account_name: accName[l.acc] || l.acc, memo: l.memo || memo, debit: money(l.debit || 0), credit: money(l.credit || 0) }); });
      push('journal', { no, date, period: date.slice(0, 7), type, ref, memo, debit: money(debit), status: 'posted', user: user || '钱雅诃' });
    }

    /* ---------- 价格计算 ---------- */
    function lineTotal(l) {
      const net = l.qty * l.price * (1 - (l.discount || 0));
      return money(net * (1 + (l.tax_rate || 0) / 100));
    }
    function docTotal(lines) { return money(lines.reduce((s, l) => s + lineTotal(l), 0)); }

    /* ---------- 销售链路 ---------- */
    const START = addDays(today, -178);
    const DAYS = 178;
    const N_SO = 128;
    for (let i = 0; i < N_SO; i++) {
      const date = addDays(START, R.int(0, DAYS));
      const cust = R.pick(CUSTOMERS);
      const wh = R.chance(.6) ? MAIN_WH : R.pick(['WH-GZ02', 'WH-TJ03', 'WH-CD04']);
      const roll = R.next();
      let status = roll < .05 ? 'draft' : roll < .15 ? 'confirmed' : roll < .21 ? 'partial' : roll < .24 ? 'cancelled' : 'done';
      const no = docNo('SO', 'sales_order', date);
      const n = R.int(1, 5);
      const lines = [];
      const used = {};
      for (let j = 0; j < n; j++) {
        const p = R.pick(PRODUCTS);
        if (used[p.code]) continue; used[p.code] = 1;
        lines.push({ product: p.code, product_name: p.name, qty: Math.max(3, Math.round(p._baseQty * R.int(2, 14))),
          delivered: 0, price: money(p.price * (1 - R.next() * (cust.type === 'KA 重点客户' ? .14 : .06))),
          discount: R.pick([0, 0, 0, .02, .05]), tax_rate: p.tax_rate });
      }
      if (!lines.length) continue;
      const total = docTotal(lines);
      push('sales_order', { no, date, customer: cust.code, customer_name: cust.name, warehouse: wh,
        required_date: addDays(date, R.int(3, 15)), currency: 'CNY', payment_terms: cust.payment_terms,
        salesperson: cust.salesperson, status, total, note: R.chance(.25) ? R.pick(['大促备货,分批发运。', '客户指定使用顺丰到付。', '含定制彩盒包装。', '需开具增值税专用发票。', '样品单转化,注意交期。']) : '' });
      lines.forEach((l, i) => push('so_lines', Object.assign({}, l, { doc: no, lineno: i + 1 })));

      if (status === 'draft' || status === 'cancelled') continue;

      /* 出库 */
      const deliverRatio = status === 'confirmed' ? 0 : status === 'partial' ? (0.35 + R.next() * 0.4) : 1;
      if (deliverRatio > 0) {
        const dDate = addDays(date, R.int(1, 6));
        const dNo = docNo('DL', 'delivery', dDate);
        const dLines = [];
        let costSum = 0;
        lines.forEach(l => {
          const q = deliverRatio >= 1 ? l.qty : Math.max(1, Math.round(l.qty * deliverRatio));
          if (q <= 0) return;
          const p = PRODUCTS.find(x => x.code === l.product);
          costSum += q * p.cost;
          dLines.push({ product: l.product, product_name: l.product_name, qty: q, price: p.cost, amount: money(q * p.cost), tax_rate: p.tax_rate });
          movement(dDate, 'sales_delivery', p, wh, -q, p.cost, dNo, R.chance(.5) ? '何砚舟' : '罗小满');
          l.delivered = q;
        });
        if (!dLines.length) { continue; }
        push('delivery', { no: dNo, date: dDate, so: no, customer: cust.code, customer_name: cust.name, warehouse: wh,
          amount: money(costSum), status: 'posted', carrier: R.pick(['顺丰速运', '中通快递', '德邦物流', '京东物流', '安得智联']),
          tracking: 'SF' + R.int(100000000000, 999999999999), user: '何砚舟', note: '' });
        dLines.forEach(l => push('dl_lines', Object.assign({ doc: dNo }, l)));
        journal(dDate, 'sales_delivery', dNo, '销售出库结转成本—' + cust.name, [
          { acc: '5001', debit: costSum }, { acc: '1405', credit: costSum }]);
        T.so_lines.forEach(l => { if (l.doc === no) { const dl = dLines.find(x => x.product === l.product); if (dl) l.delivered = dl.qty; } });

        /* 发票(全额出库才开票) */
        if (status === 'done') {
          const iDate = addDays(dDate, R.int(0, 5));
          const iNo = docNo('IV', 'invoice', iDate);
          const termsDays = cust.payment_terms === 'NET60' ? 60 : cust.payment_terms === 'NET45' ? 45 : cust.payment_terms === 'NET30' ? 30 : 7;
          const due = addDays(iDate, termsDays);
          const ivLines = lines.map(l => ({ product: l.product, product_name: l.product_name, qty: l.delivered || l.qty, price: l.price, discount: l.discount, tax_rate: l.tax_rate, amount: 0 }));
          const amount = docTotal(ivLines);
          let st = 'open', paid = 0;
          if (due < today && R.chance(.5)) st = 'overdue';
          push('invoice', { no: iNo, date: iDate, customer: cust.code, customer_name: cust.name, so: no, delivery: dNo,
            due_date: due, currency: 'CNY', status: st, total: amount, paid, balance: amount, note: '' });
          ivLines.forEach((l, idx) => { l.amount = money(l.qty * l.price * (1 - l.discount)); push('iv_lines', Object.assign({ doc: iNo }, l)); });
          const tax = money(amount - ivLines.reduce((s, l) => s + l.amount, 0));
          journal(iDate, 'sales_invoice', iNo, '确认销售收入—' + cust.name, [
            { acc: '1122', debit: amount, memo: '应收—' + cust.name },
            { acc: '4001', credit: money(amount - tax), memo: '不含税收入' },
            { acc: '2221', credit: tax, memo: '销项税额' }]);
        }
      }
    }

    /* 销售收款 */
    T.invoice.forEach(inv => {
      if (inv.status === 'overdue' && !R.chance(.4)) return;
      if (inv.status !== 'open' && inv.status !== 'overdue') return;
      const roll = R.next();
      if (roll < .34) return;
      const ratio = roll < .62 ? 1 : (0.3 + R.next() * 0.5);
      const amt = money(Math.min(inv.balance * ratio, inv.balance));
      if (amt <= 0) return;
      const rDate = addDays(inv.date, R.int(3, 40)) > today ? today : addDays(inv.date, R.int(3, 40));
      const no = docNo('RC', 'receipt', rDate);
      const cust = CUSTOMERS.find(c => c.code === inv.customer);
      push('receipt', { no, date: rDate, customer: inv.customer, customer_name: inv.customer_name, invoice: inv.no,
        amount: amt, method: R.pick(['银行转账', '银行转账', '承兑汇票', '在线支付', '电汇 T/T']), status: 'posted', user: '钱雅诃', note: '' });
      inv.paid = money(inv.paid + amt); inv.balance = money(inv.total - inv.paid);
      inv.status = inv.balance <= 0.01 ? 'paid' : 'partial_paid';
      journal(rDate, 'sales_receipt', no, '收到客户货款—' + inv.customer_name, [
        { acc: '1002', debit: amt }, { acc: '1122', credit: amt, memo: '核销 ' + inv.no }]);
    });
    // 逾期未收款标记
    T.invoice.forEach(inv => { if ((inv.status === 'open' || inv.status === 'partial_paid') && inv.due_date < today) inv.status = 'overdue'; });

    /* ---------- 采购链路 ---------- */
    const N_PR = 22, N_PO = 96;
    const poNos = [];
    for (let i = 0; i < N_PR; i++) {
      const date = addDays(START, R.int(0, DAYS));
      const p = R.pick(PRODUCTS);
      const no = docNo('PR', 'purchase_req', date);
      const qty = Math.max(20, Math.round(p._baseQty * R.int(4, 30)));
      const amount = money(qty * p.cost);
      const roll = R.next();
      const status = roll < .12 ? 'pending' : roll < .18 ? 'draft' : roll < .3 ? 'rejected' : 'converted';
      push('purchase_req', { no, date, dept: R.pick(['仓储物流部', '销售部', '采购部']), requester: R.pick(['罗小满', '何砚舟', '周寒峰']),
        need_date: addDays(date, R.int(7, 25)), reason: R.pick(['安全库存预警补货', '618 大促备货', '新品首单采购', '客户指定型号备货', '季度补货计划']),
        approver: status === 'rejected' ? '郑思远' : status === 'converted' ? '郑思远' : '', status, amount, note: status === 'rejected' ? '预算未通过,待下季度评估。' : '' });
      push('pr_lines', { doc: no, lineno: 1, product: p.code, product_name: p.name, qty, price: p.cost, amount, memo: '参考标准成本' });
    }

    for (let i = 0; i < N_PO; i++) {
      const date = addDays(START, R.int(0, DAYS));
      const sup = R.pick(SUPPLIERS);
      const catKey = sup._cat;
      const pool = PRODUCTS.filter(p => p._cat === catKey);
      const wh = R.chance(.7) ? MAIN_WH : R.pick(['WH-GZ02', 'WH-TJ03', 'WH-CD04']);
      const roll = R.next();
      let status = roll < .05 ? 'draft' : roll < .14 ? 'confirmed' : roll < .2 ? 'partial' : roll < .23 ? 'cancelled' : 'done';
      const no = docNo('PO', 'purchase_order', date);
      poNos.push(no);
      const lines = [];
      const used = {};
      const n = R.int(1, 4);
      for (let j = 0; j < n; j++) {
        const p = pool.length ? R.pick(pool) : R.pick(PRODUCTS);
        if (used[p.code]) continue; used[p.code] = 1;
        const qty = Math.max(30, Math.round(p._baseQty * R.int(6, 40)));
        lines.push({ product: p.code, product_name: p.name, qty, received: 0, price: money(p.cost * (0.9 + R.next() * 0.16)), tax_rate: p.tax_rate, amount: 0 });
      }
      if (!lines.length) continue;
      lines.forEach(l => l.amount = money(l.qty * l.price));
      const total = money(lines.reduce((s, l) => s + l.amount * (1 + l.tax_rate / 100), 0));
      push('purchase_order', { no, date, supplier: sup.code, supplier_name: sup.name, warehouse: wh,
        expected_date: addDays(date, R.int(5, 25)), pr: '', currency: 'CNY', payment_terms: sup.payment_terms,
        buyer: R.pick(['郑思远', '孙未蹊']), status, total,
        note: R.chance(.2) ? R.pick(['要求提供 13% 增值税专用发票。', '外箱需贴唛头 SAILFISH/PO 号。', '分两批交付,首批 60%。']) : '' });
      lines.forEach(l => push('po_lines', Object.assign({ doc: no }, l)));
      if (status === 'draft' || status === 'cancelled') continue;

      const ratio = status === 'confirmed' ? 0 : status === 'partial' ? (0.3 + R.next() * 0.45) : 1;
      if (ratio > 0) {
        const gDate = addDays(date, R.int(4, 22));
        if (gDate <= today) {
          const gNo = docNo('GR', 'gr', gDate);
          let costSum = 0;
          lines.forEach(l => {
            const q = ratio >= 1 ? l.qty : Math.max(1, Math.round(l.qty * ratio));
            const p = PRODUCTS.find(x => x.code === l.product);
            costSum += q * l.price;
            movement(gDate, 'po_receipt', p, wh, q, l.price, gNo, R.chance(.5) ? '何砚舟' : '罗小满');
            l.received = q;
            // 采购入库按当批进价更新标准成本(简化移动加权)
            p.cost = money((p.cost + l.price) / 2);
          });
          T.po_lines.forEach(l => { if (l.doc === no) { const src = lines.find(x => x.product === l.product); if (src) l.received = src.received; } });
          push('gr', { no: gNo, date: gDate, po: no, supplier: sup.code, supplier_name: sup.name, warehouse: wh,
            amount: money(costSum), status: 'posted', user: '何砚舟', note: ratio < 1 ? '部分到货,余量在途。' : '' });
          lines.forEach(l => push('gr_lines', { doc: gNo, lineno: lines.indexOf(l) + 1, product: l.product, product_name: l.product_name, qty: l.received, price: l.price, amount: money(l.received * l.price), tax_rate: l.tax_rate }));
          if (status === 'done') {
            const bDate = addDays(gDate, R.int(0, 6)) > today ? today : addDays(gDate, R.int(0, 6));
            const bNo = docNo('PB', 'bill', bDate);
            const termsDays = sup.payment_terms === 'NET60' ? 60 : sup.payment_terms === 'NET45' ? 45 : sup.payment_terms === 'PRE50' ? 15 : 30;
            const due = addDays(bDate, termsDays);
            const amount = money(lines.reduce((s, l) => s + l.received * l.price * (1 + l.tax_rate / 100), 0));
            push('bill', { no: bNo, date: bDate, supplier: sup.code, supplier_name: sup.name, po: no, gr: gNo,
              due_date: due, status: due < today && R.chance(.45) ? 'overdue' : 'open', total: amount, paid: 0, balance: amount, note: '' });
            lines.forEach(l => push('bill_lines', { doc: bNo, lineno: lines.indexOf(l) + 1, product: l.product, product_name: l.product_name, qty: l.received, price: l.price, amount: money(l.received * l.price), tax_rate: l.tax_rate }));
            const net = money(lines.reduce((s, l) => s + l.received * l.price, 0));
            const vat = money(amount - net);
            journal(bDate, 'ap_bill', bNo, '采购入库暂估/账单确认—' + sup.name, [
              { acc: '1405', debit: net }, { acc: '2221', debit: vat, memo: '进项税额' }, { acc: '2202', credit: amount, memo: '应付—' + sup.name }]);
          }
        }
      }
    }

    /* 采购付款 */
    T.bill.forEach(b => {
      if (b.status === 'overdue' && !R.chance(.35)) return;
      const roll = R.next();
      if (roll < .3) return;
      const ratio = roll < .66 ? 1 : (0.35 + R.next() * 0.5);
      const amt = money(Math.min(b.balance * ratio, b.balance));
      if (amt <= 0) return;
      const pDate = addDays(b.date, R.int(5, 45)) > today ? today : addDays(b.date, R.int(5, 45));
      const no = docNo('PY', 'payment', pDate);
      push('payment', { no, date: pDate, supplier: b.supplier, supplier_name: b.supplier_name, bill: b.no, amount: amt,
        method: R.pick(['银行转账', '承兑汇票', '电汇 T/T']), account: '工商银行杭州城西支行 1201****8842', status: 'posted', user: '钱雅诃', note: '' });
      b.paid = money(b.paid + amt); b.balance = money(b.total - b.paid);
      b.status = b.balance <= 0.01 ? 'paid' : 'partial_paid';
      journal(pDate, 'ap_payment', no, '支付供应商货款—' + b.supplier_name, [
        { acc: '2202', debit: amt }, { acc: '1002', credit: amt }]);
    });
    T.bill.forEach(b => { if ((b.status === 'open' || b.status === 'partial_paid') && b.due_date < today) b.status = 'overdue'; });

    /* ---------- 调拨 & 盘点 ---------- */
    for (let i = 0; i < 12; i++) {
      const date = addDays(START, R.int(10, DAYS));
      const from = R.pick([MAIN_WH, 'WH-GZ02', 'WH-TJ03']), to = R.pick(['WH-TJ03', 'WH-CD04', 'WH-GZ02'].filter(w => w !== from));
      const no = docNo('TR', 'transfer', date);
      const n = R.int(1, 3);
      for (let j = 0; j < n; j++) {
        const p = R.pick(PRODUCTS);
        const q = Math.max(5, Math.round(p._baseQty * R.int(1, 6)));
        push('tr_lines', { doc: no, lineno: j + 1, product: p.code, product_name: p.name, qty: q });
        movement(date, 'transfer', p, from, -q, p.cost, no, '何砚舟', to, '调拨出库');
        movement(date, 'transfer', p, to, q, p.cost, no, '罗小满', from, '调拨入库');
      }
      push('transfer', { no, date, from_wh: from, to_wh: to, status: 'done', user: '何砚舟', note: '分仓均衡铺货' });
    }
    for (let i = 0; i < 6; i++) {
      const date = addDays(START, R.int(20, DAYS));
      const wh = R.pick([MAIN_WH, 'WH-GZ02', 'WH-TJ03']);
      const no = docNo('ST', 'stocktake', date);
      let diffAmount = 0, diffLines = 0;
      for (let j = 0; j < R.int(2, 4); j++) {
        const p = R.pick(PRODUCTS);
        const book = Math.max(5, Math.round(p._baseQty * R.int(3, 20)));
        const diff = R.pick([0, 0, -1, -2, -3, 2, -5, 1]);
        push('stk_lines', { doc: no, lineno: j + 1, product: p.code, product_name: p.name, book_qty: book, actual_qty: book + diff, diff, cost: p.cost, diff_amount: money(diff * p.cost) });
        if (diff !== 0) {
          diffLines++; diffAmount += diff * p.cost;
          movement(date, diff > 0 ? 'stocktake_plus' : 'stocktake_minus', p, wh, diff, p.cost, no, '罗小满');
          journal(date, 'stock_adjust', no, (diff > 0 ? '盘盈调整—' : '盘亏调整—') + p.name,
            diff > 0 ? [{ acc: '1405', debit: money(diff * p.cost) }, { acc: '4002', credit: money(diff * p.cost) }]
                      : [{ acc: '5401', debit: money(-diff * p.cost) }, { acc: '1405', credit: money(-diff * p.cost) }]);
        }
      }
      push('stocktake', { no, date, warehouse: wh, status: 'posted', diff_lines: diffLines, diff_amount: money(diffAmount), user: '罗小满', note: '月度循环盘点' });
    }

    /* ---------- 期间费用凭证 ---------- */
    const months = [];
    for (let m = 0; m < 6; m++) months.push(addDays(today, -(m * 30 + 12)).slice(0, 7));
    months.forEach((pm, i) => {
      const d = pm + '-25';
      if (d > today) return;
      journal(d, 'manual', '', '计提当月工资薪金', [
        { acc: '6602', debit: 48000, memo: '管理费用—职工薪酬' }, { acc: '2211', credit: 48000 }], '方静姝');
      journal(d, 'manual', '', '支付办公室租金及物业', [
        { acc: '6602', debit: 11000, memo: '租赁费' }, { acc: '1002', credit: 11000 }], '钱雅诃');
      journal(d, 'manual', '', '仓储及快递物流费', [
        { acc: '6601', debit: money(16000 + i * 900), memo: '仓储物流费' }, { acc: '1002', credit: money(16000 + i * 900) }], '钱雅诃');
      journal(d, 'manual', '', '平台推广及广告投放', [
        { acc: '6601', debit: money(21000 + i * 1400), memo: '市场推广费' }, { acc: '1002', credit: money(21000 + i * 1400) }], '方静姝');
    });

    /* ---------- 计算库存现量 + 移动加权平均回写 ---------- */
    const stockMap = {};
    let topup = 0;
    T.stock_movements.forEach(m => {
      const k = m.product + '|' + m.warehouse;
      if (!stockMap[k]) stockMap[k] = { product: m.product, warehouse: m.warehouse, qty: 0, amount: 0 };
      stockMap[k].qty += m.qty; stockMap[k].amount += m.amount;
    });
    Object.values(stockMap).forEach(s => {
      if (s.qty >= 0) return;
      const p = T.products.find(x => x.code === s.product) || {};
      const q = Math.ceil(-s.qty + Math.max(12, Math.round((p.safety_qty || 40) * 0.5)));
      s.qty += q; s.amount = money(s.amount + q * (p.cost || 0));
      push('stock_movements', { no: 'MV-TOPUP-' + api.pad(topup++, 3) + '-' + s.product, date: OPEN_DATE, type: 'manual',
        product: s.product, product_name: p.name || s.product, warehouse: s.warehouse, to_warehouse: '', qty: q,
        unit_cost: p.cost || 0, amount: money(q * (p.cost || 0)), ref: '期初建账', user: '何砚舟', note: '期初库存补足(分仓铺货结转差异)' });
    });
    T.stock_movements.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    Object.values(stockMap).forEach(s => {
      const p = T.products.find(x => x.code === s.product) || {};
      const reserved = 0;
      push('stock', { _id: s.product + '-' + s.warehouse, product: s.product, product_name: p.name || s.product, warehouse: s.warehouse,
        qty: s.qty, reserved, available: s.qty - reserved, cost: p.cost || 0, value: money(s.qty * (p.cost || 0)),
        status: s.qty <= 0 ? 'shortage' : (s.qty < (p.safety_qty || 0) ? 'low' : 'normal') });
    });
    // 已确认未出库订单占用量
    T.stock.forEach(s => {
      const held = T.sales_order.filter(o => o.status === 'confirmed' && o.warehouse === s.warehouse)
        .reduce((sum, o) => sum + T.so_lines.filter(l => l.doc === o.no && l.product === s.product).reduce((a, l) => a + (l.qty - (l.delivered || 0)), 0), 0);
      s.reserved = Math.min(s.qty, held); s.available = s.qty - s.reserved;
      s.value = money(s.qty * s.cost);
      s.status = s.qty <= 0 ? 'shortage' : (s.available < (T.products.find(p => p.code === s.product) || {}).safety_qty ? 'low' : s.status);
    });

    /* ---------- 期初建账 + 存货成本差异结转 ---------- */
    const openStock = money(T.stock_movements.filter(m => m.ref === '期初建账').reduce((s, m) => s + m.amount, 0));
    const openCash = money(Math.max(6800000, openStock * 1.8));
    journal(OPEN_DATE, 'manual', 'INIT-OPEN', '期初建账:股东货币出资与库存商品建账', [
      { acc: '1002', debit: openCash, memo: '实收资本货币出资到账' },
      { acc: '1405', debit: openStock, memo: '期初库存商品结转' },
      { acc: '3001', credit: money(openCash + openStock), memo: '实收资本' }], '陈立群');

    const bookValue = money(T.stock.reduce((s, r) => s + (r.value || 0), 0));
    const glValue = money(T.journal_lines.filter(l => l.account === '1405').reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0));
    const variance = money(bookValue - glValue);
    if (Math.abs(variance) > 1) journal(today, 'manual', 'ADJ-VAR', '发出存货成本差异结转(标准成本与当批实际进价)', [
      variance > 0 ? { acc: '1405', debit: variance, memo: '存货账实核对' } : { acc: '1405', credit: -variance, memo: '存货账实核对' },
      variance > 0 ? { acc: '5001', credit: variance, memo: '冲减主营业务成本' } : { acc: '5001', debit: -variance, memo: '追加主营业务成本' }], '钱雅诃');

    /* ---------- 会计科目余额 ---------- */
    T.gl_account = ACCOUNTS.map(a => ({ code: a[0], name: a[1], type: a[2], direction: a[3], balance: 0 }));
    const bal = {};
    T.journal_lines.forEach(l => { bal[l.account] = (bal[l.account] || 0) + (l.debit || 0) - (l.credit || 0); });
    T.gl_account.forEach(a => a.balance = money(bal[a.code] || 0));

    /* ---------- 操作日志 ---------- */
    const acts = [
      ['销售管理', '过账销售发票', '确认收入并挂应收账款'],
      ['库存管理', '过账采购收货单', '增加库存现量并生成凭证'],
      ['财务管理', '过账收款单', '核销应收发票余额'],
      ['采购管理', '审批采购申请', '审批通过后转采购订单'],
      ['库存管理', '库存调拨过账', '生成成对出入库流水'],
      ['销售管理', '创建销售订单', '来源:天猫旗舰店后台导入'],
      ['系统管理', '登录系统', '账号密码 + 动态口令'],
      ['基础数据', '新增商品主数据', '同步类目税率与标准成本'],
    ];
    for (let i = 0; i < 26; i++) {
      const a = acts[i % acts.length];
      T.activity.push({ id: 'L9' + (100000 + i), time: api.nowStr().slice(0, 11) + api.pad(23 - Math.floor(i / 2), 2) + ':' + api.pad(R.int(0, 59), 2) + ':' + api.pad(R.int(0, 59), 2),
        user: R.pick(['陈立群', '方静姝', '林墨对白', '何砚舟', '钱雅诃', '郑思远']), module: a[0], action: a[1],
        ref: '', detail: a[2] });
    }
    T.activity.sort((a, b) => a.time < b.time ? 1 : -1);

    /* ---------- 清理辅助字段 ---------- */
    T.products.forEach(p => { delete p._baseQty; delete p._cat; });
    T.suppliers.forEach(s => delete s._cat);

    return true;
  }

  return { build };
})();
