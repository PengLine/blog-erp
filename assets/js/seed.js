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
      ['EMP-1013', '温叙白', '产品部', '产品经理'], ['EMP-1014', '邵聿宁', '品质部', '品质经理'],
    ];
    USERS.forEach((u, i) => push('users', {
      code: u[0], name: u[1], dept: u[2], role: u[3],
      email: 'emp' + u[0].slice(4) + '@sailfish-erp.com', phone: '138' + String(50000000 + i * 137111).slice(0, 8),
      last_login: R.chance(.9) ? today : addDays(today, -3), status: i === 11 ? 'inactive' : 'active'
    }));

    /* ---------- 角色权限矩阵(sys_role.perms = 模块:动作) ---------- */
    const perm = (mods, acts) => { const out = []; mods.forEach(m => acts.forEach(a => out.push(m + ':' + a))); return out; };
    const ROLES = [
      ['ROLE-01', '系统管理员', '总经办', 9, 'all', 0, [],
        '系统内置最高权限(级别 ≥9 直接放行),负责角色矩阵维护与系统参数。'],
      ['ROLE-02', '财务经理', '财务部', 8, 'all', 2000000,
        perm(['dashboard', 'invoice', 'receipt', 'bill', 'payment', 'journal', 'gl_account', 'reports'], ['view', 'edit', 'approve'])
          .concat(perm(['sales_order', 'purchase_order', 'purchase_req', 'rfq', 'product_release', 'supplier_apply', 'processors', 'processor_audit', 'os_order', 'rma', 'stock', 'products', 'customers', 'suppliers', 'activity', 'role'], ['view'])),
        '全盘财务口径:开票/收付款/凭证可审可改,业务模块只读监督。'],
      ['ROLE-03', '销售主管', '销售部', 6, 'dept', 500000,
        perm(['sales_order', 'customers', 'rma', 'delivery'], ['view', 'edit', 'approve'])
          .concat(perm(['product_release'], ['view', 'edit', 'approve']))
          .concat(perm(['invoice', 'receipt', 'rfq', 'stock', 'products', 'dashboard', 'reports', 'activity'], ['view'])),
        '订单全流程负责人,有信用超卖与售后工单裁决权。'],
      ['ROLE-04', '销售代表', '销售部', 2, 'self', 0,
        perm(['sales_order', 'customers'], ['view', 'edit'])
          .concat(perm(['invoice', 'receipt', 'delivery', 'stock', 'products', 'dashboard', 'reports', 'rma'], ['view'])),
        '仅能维护本人订单与客户,报价折扣超限需主管审核。'],
      ['ROLE-05', '采购主管', '采购部', 6, 'dept', 800000,
        perm(['purchase_req', 'purchase_order', 'rfq', 'supplier_apply', 'processors', 'processor_audit', 'os_order', 'gr'], ['view', 'edit', 'approve'])
          .concat(perm(['bill', 'products', 'suppliers', 'stock', 'dashboard', 'reports', 'activity'], ['view'])),
        '供应商准入、定标与委外加工的最终裁决岗,付款审批归财务。'],
      ['ROLE-06', '采购员', '采购部', 3, 'self', 50000,
        perm(['rfq', 'purchase_req', 'purchase_order', 'supplier_apply', 'gr'], ['view', 'edit'])
          .concat(perm(['products', 'suppliers', 'processors', 'os_order', 'stock', 'dashboard'], ['view'])),
        '负责询价、比价与订单执行跟进,超限额需上级审批。'],
      ['ROLE-07', '仓库管理员', '仓储物流部', 3, 'dept', 0,
        perm(['stock', 'transfer', 'stocktake', 'stock_movements', 'gr', 'delivery', 'warehouses', 'os_order'], ['view', 'edit'])
          .concat(perm(['sales_order', 'purchase_order', 'products', 'dashboard'], ['view'])),
        '收发货、调拨与盘点执行岗,不触碰金额与成本。'],
      ['ROLE-08', '财务会计', '财务部', 4, 'dept', 100000,
        perm(['invoice', 'receipt', 'bill', 'payment', 'journal'], ['view', 'edit'])
          .concat(perm(['gl_account', 'reports', 'dashboard', 'sales_order', 'purchase_order', 'customers', 'suppliers'], ['view'])),
        '日常开票、核销与凭证录入,月末结账权限归财务经理。'],
      ['ROLE-09', '产品经理', '产品部', 5, 'dept', 300000,
        perm(['product_release', 'rfq', 'products'], ['view', 'edit'])
          .concat(perm(['supplier_apply', 'stock', 'sales_order', 'customers', 'dashboard', 'reports'], ['view'])),
        '新品立项与定价提案,发布审批由销售主管裁决。'],
      ['ROLE-10', '品质经理', '品质部', 5, 'dept', 0,
        perm(['processor_audit', 'processors', 'rma', 'supplier_apply', 'os_order'], ['view', 'edit'])
          .concat(perm(['products', 'stock', 'dashboard', 'reports'], ['view'])),
        '外协商打样评分与售后质量责任判定的录入岗,准入结论由采购主管裁决。'],
    ];
    ROLES.forEach(r => push('role', {
      code: r[0], name: r[1], dept: r[2], level: r[3], scope: r[4], max_amount: r[5],
      perms: r[6].slice().sort(), users: T.users.filter(u => u.role === r[1]).length,
      status: 'enabled', note: r[7]
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
      ['1405', '库存商品', 'asset', 'debit'], ['1408', '委托加工物资', 'asset', 'debit'],
      ['1601', '固定资产', 'asset', 'debit'], ['1602', '累计折旧', 'asset', 'credit'],
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
      const chan = cust.type === '电商平台' ? R.pick(['tmall', 'jd', 'douyin']) : cust.type === '外贸客户' ? 'amazon'
        : cust.type === '区域经销商' ? R.pick(['b2b', 'b2b', 'offline']) : cust.type === '直销散户' ? R.pick(['douyin', 'offline'])
        : R.pick(['offline', 'b2b']);
      const pr = R.next();
      push('sales_order', { no, date, customer: cust.code, customer_name: cust.name, warehouse: wh,
        required_date: addDays(date, R.int(3, 15)), currency: 'CNY', payment_terms: cust.payment_terms,
        channel: chan, priority: pr < .06 ? 'critical' : pr < .2 ? 'urgent' : 'std',
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

    /* ============================================================
     * 产品管理(询价 / 发布 / 审批)· 服务商管理(准入 / 外协商 / 委外)
     * 售后管理 · 订单变更。动线与 actions.js 严格一致:
     * 同步生成库存流水与总账凭证,保证有借必有贷、1408 净额、子账与总账勾稽。
     * ============================================================ */
    const pad2 = n => api.pad(n, 2);
    const CATKEY = { '家居用品': 'HM', '数码配件': 'DP', '个护美妆': 'PP', '户外配件': 'AC', '办公用品': 'OF', '通用五金': 'GD' };
    const prodOf = code => T.products.find(p => p.code === code) || {};
    const supOf = code => T.suppliers.find(s => s.code === code) || {};
    const supsOf = cat => T.suppliers.filter(s => s.status === 'enabled' && s.category === cat).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const notFuture = d => d > today ? today : d;

    /** 发起审批(镜像 ACT.submitApproval) */
    function apStart(module, biz, o) {
      const no = docNo('AP', 'approval', o.date);
      return push('approval', {
        no, date: o.date, module, biz, title: o.title, applicant: o.applicant, role: o.role, approver: '',
        amount: money(o.amount || 0), priority: o.priority || 'std', status: 'pending',
        opinion: '', time_done: '', payload: o.payload || null, note: o.note || ''
      });
    }
    /** 裁决审批(镜像 ACT.decideApproval) */
    function apDecide(a, ok, approver, opinion, after) {
      const d = notFuture(addDays(a.date, after === undefined ? R.int(1, 5) : after));
      a.status = ok ? 'approved' : 'rejected';
      a.approver = approver;
      a.opinion = opinion;
      a.time_done = d + ' ' + pad2(R.int(9, 20)) + ':' + pad2(R.int(0, 59)) + ':' + pad2(R.int(0, 59));
      return a;
    }
    /** 采购链路(镜像 采购订单→收货→账单→凭证),用于新品首单与询价定标 */
    function purchaseFlow(sup, wh, date, rows, o) {
      o = o || {};
      const lines = rows.map(r => {
        const p = prodOf(r[0]);
        return { product: p.code, product_name: p.name, qty: r[1], received: r[3] === undefined ? r[1] : r[3], price: r[2], tax_rate: p.tax_rate || 13, amount: money(r[1] * r[2]) };
      });
      const net = money(lines.reduce((s, l) => s + l.received * l.price, 0));
      const total = money(lines.reduce((s, l) => s + l.received * l.price * (1 + l.tax_rate / 100), 0));
      const no = docNo('PO', 'purchase_order', date);
      push('purchase_order', {
        no, date, supplier: sup.code, supplier_name: sup.name, warehouse: wh,
        expected_date: addDays(date, Math.max(5, sup.lead_time || 14)), pr: o.pr || '', rfq: o.rfq || '',
        currency: 'CNY', payment_terms: sup.payment_terms, buyer: o.buyer || '郑思远', status: 'done', total, amount: total,
        note: o.note || ''
      });
      lines.forEach(l => push('po_lines', Object.assign({ doc: no }, l)));
      const gDate = notFuture(addDays(date, R.int(4, 12)));
      const gNo = docNo('GR', 'gr', gDate);
      lines.forEach(l => {
        const p = prodOf(l.product);
        movement(gDate, 'po_receipt', p, wh, l.received, l.price, gNo, '何砚舟', '', '采购到货入库');
        p.cost = money((p.cost + l.price) / 2);
      });
      push('gr', { no: gNo, date: gDate, po: no, supplier: sup.code, supplier_name: sup.name, warehouse: wh, amount: net, status: 'posted', user: '何砚舟', note: '' });
      lines.forEach((l, i) => push('gr_lines', { doc: gNo, lineno: i + 1, product: l.product, product_name: l.product_name, qty: l.received, price: l.price, amount: money(l.received * l.price), tax_rate: l.tax_rate }));
      const bDate = notFuture(addDays(gDate, R.int(0, 5)));
      const bNo = docNo('PB', 'bill', bDate);
      const td = sup.payment_terms === 'NET60' ? 60 : sup.payment_terms === 'NET45' ? 45 : sup.payment_terms === 'PRE50' ? 15 : 30;
      const due = addDays(bDate, td);
      push('bill', { no: bNo, date: bDate, supplier: sup.code, supplier_name: sup.name, po: no, gr: gNo, os: '', kind: 'goods',
        due_date: due, status: due < today && R.chance(.4) ? 'overdue' : 'open', total, paid: 0, balance: total, note: '' });
      lines.forEach((l, i) => push('bill_lines', { doc: bNo, lineno: i + 1, product: l.product, product_name: l.product_name, qty: l.received, price: l.price, amount: money(l.received * l.price), tax_rate: l.tax_rate }));
      journal(bDate, 'ap_bill', bNo, '采购入库账单确认—' + sup.name, [
        { acc: '1405', debit: net }, { acc: '2221', debit: money(total - net), memo: '进项税额' }, { acc: '2202', credit: total, memo: '应付—' + sup.name }]);
      return { po: no, gr: gNo, bill: bNo, total: total };
    }
    /** 付款(镜像 ACT.createPayment) */
    function payBill(bNo, amount, date, user) {
      const b = T.bill.find(x => x.no === bNo);
      if (!b) return '';
      const amt = money(Math.min(amount === undefined ? b.balance : amount, b.balance));
      if (amt <= 0) return '';
      const no = docNo('PY', 'payment', date);
      push('payment', { no, date, supplier: b.supplier, supplier_name: b.supplier_name, bill: bNo, amount: amt,
        method: R.pick(['银行转账', '承兑汇票', '电汇 T/T']), account: '工商银行杭州城西支行 1201****8842', status: 'posted', user: user || '钱雅诃', note: '' });
      b.paid = money(b.paid + amt); b.balance = money(b.total - b.paid);
      b.status = b.balance <= 0.01 ? 'paid' : 'partial_paid';
      journal(date, 'ap_payment', no, '支付货款—' + b.supplier_name, [{ acc: '2202', debit: amt }, { acc: '1002', credit: amt }]);
      return no;
    }

    /* ---------- 原料 / 辅料:委外发料与询价比价的物料基础 ---------- */
    const MATERIALS = [
      ['涤纶仿棉面料 220g', '家居用品', 'KG', 18.4, 3200, '1.6m 幅宽 · 缩水率 ≤3%'],
      ['高回弹乳胶粒子', '家居用品', 'KG', 42.0, 900, '含胶量 60% · 桶装 25kg'],
      ['PC 阻燃颗粒 V-0', '数码配件', 'KG', 33.5, 860, 'UL94 V-0 · 白色'],
      ['液态硅胶按键原料', '数码配件', 'KG', 28.6, 420, '硬度 40A'],
      ['24/410 按压泵头组件', '个护美妆', 'PCS', 3.2, 9000, '电镀银 · 铝塑件'],
      ['6061 铝合金管料', '户外配件', 'KG', 21.6, 760, 'φ22×1.2 · 银白氧化'],
      ['三聚氰胺白板基材', '办公用品', 'PCS', 42.5, 480, '900×1200 · 含边框'],
      ['五金紧固件混装包', '通用五金', 'SET', 8.6, 1500, 'M3-M6 · 碳钢镀镍'],
    ];
    const RM = [];
    MATERIALS.forEach((m, i) => {
      const code = 'RM-' + String(101 + i);
      RM.push(code);
      push('products', {
        code, name: m[0], category: m[1], brand: '赛福工业', spec: m[5], listing: 'offline', moq: Math.round(m[4] * .1),
        uom: m[2], barcode: '69' + R.int(10000000000, 99999999999), cost: money(m[3]), price: money(m[3] * 1.12),
        tax_rate: 13, weight: R.int(200, 3000), safety_qty: Math.round(m[4] * .25), lead_time: R.int(7, 20),
        status: 'enabled', note: '生产用原料/辅料,不参与零售销售'
      });
      push('stock_movements', { no: 'MV-INIT-RM' + (101 + i), date: OPEN_DATE, type: 'manual', product: code, product_name: m[0],
        warehouse: MAIN_WH, to_warehouse: '', qty: m[4], unit_cost: money(m[3]), amount: money(m[4] * m[3]),
        ref: '期初建账', user: '何砚舟', note: '期初原料与辅料建账' });
    });
    /* 存量成品补齐上架渠道 / 规格 / 起订量,列表与表单取值一致 */
    T.products.forEach(p => {
      if (!p.listing) p.listing = R.pick(['offline', 'tmall', 'tmall', 'jd', 'douyin', 'b2b', 'amazon']);
      if (!p.spec) p.spec = (p.color || '标准色') + ' · 毛重 ' + (p.weight || 0) + 'g';
      if (!p.moq) p.moq = R.pick([50, 100, 200, 300]);
      delete p.color;
    });

    /* ---------- 服务商管理:供应商准入申请 ---------- */
    let supSeq = 111;
    const APPLY = [
      ['绍兴锦源纺织有限公司', '家居用品', 'archived', 88, '孙未蹊', '家纺面料与四件套代工,年产能 320 万件'],
      ['东莞捷硕电子配件厂', '数码配件', 'archived', 82, '郑思远', '扩展坞/充电器结构件,拥有 SMT 贴片线 4 条'],
      ['广州悦颜日化有限公司', '个护美妆', 'approved', 91, '孙未蹊', '妆字号备案齐全,支持小批量柔性生产'],
      ['青岛澜庭家纺有限公司', '家居用品', 'approved', 86, '郑思远', '浴帘/收纳类主营,可提供 GSM 检测报告'],
      ['宁波山行户外用品厂', '户外配件', 'inspecting', 76, '郑思远', '铝管焊接与缝制一体,打样周期 9 天'],
      ['台州优客文具制造厂', '办公用品', 'pending', 0, '孙未蹊', '白板与文件柜,报价低于现价 8%'],
      ['常州锐拓五金工业有限公司', '通用五金', 'pending', 0, '郑思远', '电动工具 OEM,具备 3C 认证'],
      ['佛山市南海雅居家居厂', '家居用品', 'rejected', 54, '孙未蹊', '现场审核发现环保与消防整改项未闭环'],
      ['深圳市微源电子有限公司', '数码配件', 'draft', 0, '郑思远', '氮化镓方案商,待补充型式试验报告'],
      ['杭州禾风包装科技有限公司', '通用五金', 'draft', 0, '孙未蹊', '彩盒与说明书印刷,拟纳入包材供应池'],
    ];
    APPLY.forEach((a, i) => {
      const date = notFuture(addDays(START, R.int(20, 170)));
      const no = docNo('SA', 'supplier_apply', date);
      const catKey = CATKEY[a[1]];
      const t = push('supplier_apply', {
        no, date, company: a[0], credit_code: '9133' + R.int(100000000000000, 999999999999999) + 'X', category: a[1],
        contact: R.pick(['吴', '孙', '钱', '周', '郑', '冯']) + R.pick(['经理', '厂长', '总']),
        phone: '1' + R.pick(['3', '5', '8']) + R.pick(['6', '8', '9']) + String(R.int(10000000, 99999999)),
        email: 'bd' + String(200 + i) + '@vendor.cn',
        address: R.pick(['浙江省绍兴市', '广东省东莞市', '广东省广州市', '山东省青岛市', '浙江省宁波市', '江苏省常州市']) + '工业园区' + R.int(1, 180) + '号',
        legal_person: R.pick(['王', '李', '张', '刘']) + R.pick(['建国', '海涛', '丽娟', '志强']),
        registered_capital: R.pick([1000000, 2000000, 3000000, 5000000, 8000000]), founded: addDays(date, -R.int(900, 4200)),
        main_products: a[5], annual_capacity: R.int(200000, 3000000), score: a[3], applicant: a[4],
        approval: '', supplier: '', status: a[2], opinion: '', note: ''
      });
      if (t.status !== 'draft') {
        const ap = apStart('supplier_apply', no, { date, title: '供应商准入:' + t.company, applicant: t.applicant, role: '采购主管', amount: t.registered_capital, priority: t.category === '数码配件' ? 'urgent' : 'std' });
        t.approval = ap.no;
        if (['pending', 'inspecting'].indexOf(t.status) < 0) {
          if (t.status === 'rejected') apDecide(ap, false, '郑思远', '现场审核存在环保与消防整改项,暂不引入,半年后可复评。', R.int(4, 12));
          else { apDecide(ap, true, '郑思远', '资质与产能满足要求,评分合格,同意准入并建档。', R.int(3, 10)); t.opinion = '质量/交付/价格三维评分合格,首单建议小批量试产。'; }
        }
      }
      if (t.status === 'inspecting') { t.score = a[3]; t.opinion = '现场审核已完成,待评审核准。'; }
      if (t.status === 'archived') {
        supSeq++;
        const code = 'SU-' + supSeq;
        push('suppliers', {
          code, name: t.company, category: t.category, contact: t.contact, phone: t.phone, email: t.email,
          address: t.address, tax_id: t.credit_code, lead_time: R.int(9, 20), payment_terms: R.pick(['NET30', 'NET45']),
          currency: 'CNY', min_order: R.pick([100, 200, 300]), rating: t.score, status: 'enabled', note: '准入申请 ' + no + ' 建档', _cat: catKey
        });
        t.supplier = code;
      }
    });

    /* ---------- 服务商管理:外协商档案与审核 ---------- */
    const PROC = [
      ['OS-001', '海宁织锦缝纫加工厂', 'sew', '浙江省嘉兴市海宁市长安路 88 号', 45000, 3.6, 96.5, 12, 'approved'],
      ['OS-002', '常州精密裁剪工坊', 'cut', '江苏省常州市武进区高新园 12 号', 38000, 2.1, 94.2, 9, 'approved'],
      ['OS-003', '佛山澜石印花有限公司', 'print', '广东省佛山市禅城区澜石街道 3 号', 52000, 4.8, 91.8, 14, 'approved'],
      ['OS-004', '义乌捷包装潢包装厂', 'pack', '浙江省金华市义乌市北苑街道 66 号', 90000, 1.2, 98.1, 7, 'approved'],
      ['OS-005', '绍兴清水水洗整理厂', 'wash', '浙江省绍兴市柯桥区滨海工业区 9 号', 30000, 2.9, 92.4, 11, 'approved'],
      ['OS-006', '深圳铭检品质检测服务', 'qc', '广东省深圳市宝安区西乡大道 188 号', 120000, 0.6, 99.2, 5, 'approved'],
      ['OS-007', '惠州宏达缝制加工厂', 'sew', '广东省惠州市惠阳区淡水镇 5 号', 26000, 3.9, 84.5, 16, 'inspecting'],
      ['OS-008', '安庆顺发裁剪有限公司', 'cut', '安徽省安庆市宜秀区开发路 20 号', 20000, 2.6, 71.3, 18, 'rejected'],
      ['OS-009', '台州恒丰缝制有限公司', 'sew', '浙江省台州市椒江区黄海路 77 号', 22000, 3.4, 0, 15, 'draft'],
    ];
    PROC.forEach((p, i) => push('processors', {
      code: p[0], name: p[1], process_type: p[2], location: p[3],
      contact: R.pick(['陈', '林', '黄', '徐', '谢']) + R.pick(['厂长', '经理', '主管']),
      phone: '1' + R.pick(['3', '5', '8']) + R.pick(['0', '2', '6']) + String(R.int(10000000, 99999999)),
      capacity: p[4], unit_rate: money(p[5]), pass_rate: p[6], lead_time: p[7], rating: 0,
      qualification: p[8] === 'approved' ? 'qualified' : p[8] === 'rejected' ? 'blacklist' : 'pending',
      audit: '', status: p[8] === 'rejected' ? 'disabled' : 'enabled',
      note: p[8] === 'blacklist' ? '打样与现场评审未达标,已淘汰。' : ''
    }));
    PROC.forEach((p, i) => {
      const date = notFuture(addDays(START, R.int(10, 160)));
      const no = docNo('PA', 'processor_audit', date);
      const proc = T.processors[i];
      const good = p[8] === 'approved';
      const q = good ? R.int(84, 96) : p[8] === 'rejected' ? R.int(52, 64) : R.int(70, 82);
      const d = good ? R.int(80, 95) : p[8] === 'rejected' ? R.int(55, 68) : R.int(72, 85);
      const pc = good ? R.int(75, 92) : R.int(60, 80);
      const mg = good ? R.int(78, 94) : R.int(58, 76);
      const total = Math.round(q * .4 + d * .25 + pc * .2 + mg * .15);
      const t = push('processor_audit', {
        no, date, processor: proc.code, processor_name: proc.name, process_type: proc.process_type,
        auditor: p[8] === 'draft' ? '' : '邵聿宁',
        sample_result: p[8] === 'draft' ? '' : good ? 'pass' : p[8] === 'rejected' ? 'fail' : 'cond',
        quality_score: p[8] === 'draft' ? 0 : q, delivery_score: p[8] === 'draft' ? 0 : d,
        price_score: p[8] === 'draft' ? 0 : pc, manage_score: p[8] === 'draft' ? 0 : mg,
        total_score: p[8] === 'draft' ? 0 : total, capacity: proc.capacity, unit_rate: money(proc.unit_rate),
        conclusion: good ? 'qualified' : p[8] === 'rejected' ? 'blacklist' : '',
        approval: '', status: p[8], opinion: '', user: '邵聿宁', note: ''
      });
      if (p[8] === 'draft') return;
      const ap = apStart('processor_audit', no, { date, title: '外协商审核:' + proc.name, applicant: '邵聿宁', role: '采购主管', amount: 0, priority: p[8] === 'rejected' ? 'std' : 'urgent' });
      t.approval = ap.no;
      if (p[8] === 'inspecting') { /* 品质经理已录入评分,等待采购主管核准,留在待办队列 */ }
      else if (p[8] === 'rejected') {
        apDecide(ap, false, '郑思远', '综合得分偏低且打样不合格,不予核准。', R.int(5, 12));
        t.opinion = '线迹密度与缩水率两项不达标,建议整改后重新送样。';
      } else {
        apDecide(ap, true, '郑思远', '评分合格,核准纳入外协供应商池,按核定单价结算。', R.int(2, 8));
        t.opinion = '现场 5S 与制程管控良好,首批建议 800 件试单。';
        proc.qualification = 'qualified'; proc.audit = no; proc.rating = total;
        proc.unit_rate = money(t.unit_rate); proc.capacity = t.capacity;
      }
    });

    /* ---------- 产品管理:新品发布 ---------- */
    const RELEASE = [
      ['北欧简约棉麻抱枕套(45×45)', '家居用品', '赛福优选', '45×45cm · 棉麻 32 支', 9.8, 26, 'tmall', '温叙白', 'published', 800],
      ['三重防泼水加厚浴帘', '家居用品', '沐野', '180×200cm · 涤纶提花', 22.4, 59, 'jd', '温叙白', 'published', 600],
      ['车载磁吸手机支架 Pro', '数码配件', 'NIDUS', '铝合金 · 17N 磁吸', 18.6, 49, 'douyin', '温叙白', 'published', 1200],
      ['Type-C 一线通 8K 扩展坞', '数码配件', 'NIDUS', '12 合 1 · 100W PD', 96.5, 229, 'amazon', '林墨对白', 'approved', 300],
      ['便携折叠洗衣袋三件套', '家居用品', '青庭', '40×50cm ×3 · 网纱', 12.3, 33, 'offline', '温叙白', 'published', 1500],
      ['无火香薰藤条礼盒 100ml', '个护美妆', '禾光', '100ml · 雪松木质调', 21.8, 68, 'tmall', '吴清越', 'pending', 500],
      ['氨基酸温和洁面慕斯 150ml', '个护美妆', '禾光', '150ml · 泵头', 14.6, 45, 'douyin', '吴清越', 'published', 2000],
      ['轻量化自动充气床垫', '户外配件', '沐野', '单人 190×65cm · TPU', 118, 289, 'amazon', '林墨对白', 'approved', 200],
      ['户外便携分格调料盒套装', '户外配件', '沐野', '8 格 · PP 食品级', 22.5, 59, 'offline', '温叙白', 'draft', 400],
      ['站立式文件收纳架', '办公用品', 'Loft+', 'A4 · 钢制喷塑', 46, 118, 'b2b', '周寒峰', 'draft', 150],
      ['人体工学键盘腕托(记忆棉)', '办公用品', 'Loft+', '36×20×2cm', 19.5, 52, 'tmall', '温叙白', 'published', 900],
      ['多功能棘轮扳手套装', '通用五金', '赛福工业', '8-22mm · 铬钒钢', 34, 82, 'b2b', '郑思远', 'rejected', 300],
      ['锂电无刷电动螺丝刀', '通用五金', '赛福工业', '4V · 35N·m', 52, 129, 'jd', '温叙白', 'off_shelf', 400],
      ['恒湿助眠蒸汽眼罩 10 片', '个护美妆', '禾光', '10 片/盒 · 艾草', 16.8, 46, 'douyin', '吴清越', 'pending', 1000],
    ];
    const NEWSKUS = [];
    RELEASE.forEach((r, i) => {
      const date = notFuture(addDays(START, R.int(0, 165)));
      const no = docNo('RS', 'product_release', date);
      const cost = money(r[4]), price = money(r[5]);
      const t = push('product_release', {
        no, date, name: r[0], category: r[1], brand: r[2], spec: r[3], uom: 'PCS', supplier: '',
        target_cost: cost, target_price: price, margin: money((price - cost) / price * 100),
        safety_qty: Math.round(r[9] * .15), moq: R.pick([50, 100, 200]), listing: r[6], owner: r[7],
        launch_date: notFuture(addDays(date, R.int(15, 45))), product: '', approval: '', status: r[8],
        user: r[7], note: r[8] === 'rejected' ? '毛利率低于品类基线,需重新核算模具摊销。' : ''
      });
      if (t.status !== 'draft') {
        const ap = apStart('product_release', no, {
          date, title: '新品发布:' + t.name, applicant: t.owner, role: '销售主管',
          amount: money(price * r[9]), priority: t.listing === 'amazon' ? 'urgent' : 'std'
        });
        t.approval = ap.no;
        if (t.status === 'pending') { /* 保持待办 */ }
        else if (t.status === 'rejected') apDecide(ap, false, '林墨对白', '目标成本偏高,毛利率未达品类基线,补充报价后再报。', R.int(3, 9));
        else apDecide(ap, true, '林墨对白', '定价与毛利符合渠道策略,同意立项建档。', R.int(2, 7));
      }
      if (['published', 'off_shelf'].indexOf(t.status) >= 0) {
        const code = CATKEY[t.category] + '-2' + pad2(i + 1);
        push('products', {
          code, name: t.name, category: t.category, brand: t.brand, spec: t.spec, listing: t.listing,
          release_no: no, launch_date: t.launch_date, moq: t.moq, uom: 'PCS',
          barcode: '69' + R.int(10000000000, 99999999999), cost: money(t.target_cost), price: money(t.target_price),
          tax_rate: 13, weight: R.int(120, 2600), safety_qty: t.safety_qty, lead_time: R.int(10, 24),
          status: t.status === 'off_shelf' ? 'disabled' : 'enabled', note: '来源新品发布单 ' + no
        });
        t.product = code;
        NEWSKUS.push({ code: code, cat: t.category, qty: t.safety_qty * 3, cost: money(t.target_cost * .94), rel: no });
      }
    });
    /* 新品首单采购:3 个已上架新品走完整采购链路,其余靠外协加工投产 */
    NEWSKUS.slice(0, 3).forEach((n, i) => {
      const pool = supsOf(n.cat);
      const sup = pool[i % pool.length];
      if (!sup) return;
      purchaseFlow(sup, MAIN_WH, addDays(today, -R.int(20, 60)), [[n.code, n.qty, n.cost]],
        { note: '新品首单备货 · 来源 ' + n.rel, buyer: '郑思远' });
    });

    /* ---------- 产品管理:询价比价 ---------- */
    const RFQ = [
      ['秋冬四件套面料首轮比价', '家居用品', [[RM[0], 1200], [RM[1], 260]], 'awarded', 'full'],
      ['数码外壳阻燃颗粒年度询价', '数码配件', [[RM[2], 620]], 'awarded', 'draft'],
      ['泵头与紧固件季度比价', '个护美妆', [[RM[4], 6000]], 'quoted'],
      ['露营椅铝管框架比价', '户外配件', [[RM[5], 520]], 'quoted'],
      ['白板基材补货询价', '办公用品', [[RM[6], 300]], 'sent'],
      ['新品浴帘面料打样询价', '家居用品', [[RM[0], 800], [RM[1], 120]], 'sent'],
      ['紧固件混装包备选询价', '通用五金', [[RM[7], 1200]], 'draft'],
      ['硅胶按键原料二次询价', '数码配件', [[RM[3], 260]], 'draft'],
    ];
    RFQ.forEach((f, i) => {
      const date = notFuture(addDays(START, R.int(40, 172)));
      const no = docNo('RFQ', 'rfq', date);
      const buyer = R.pick(['孙未蹊', '郑思远']);
      const baseCost = f[2].reduce((s, m) => s + m[1] * prodOf(m[0]).cost, 0);
      const rows = [];
      f[2].forEach(m => {
        const p = prodOf(m[0]);
        if (f[3] === 'draft') {
          rows.push({ product: p.code, product_name: p.name, supplier: '', supplier_name: '', qty: m[1],
            price: money(p.cost), base_price: money(p.cost), amount: money(m[1] * p.cost), tax_rate: 13,
            lead_time: p.lead_time, awarded: 'n', memo: '参考标准成本' });
        } else {
          supsOf(p.category).slice(0, 3).forEach(s => rows.push({
            product: p.code, product_name: p.name, supplier: s.code, supplier_name: s.name, qty: m[1],
            price: 0, base_price: money(p.cost), amount: 0, tax_rate: 13, lead_time: s.lead_time, awarded: 'n', memo: ''
          }));
        }
      });
      const t = push('rfq', {
        no, date, title: f[0], buyer, need_date: addDays(date, R.int(12, 30)), warehouse: MAIN_WH,
        quote_lines: f[3] === 'draft' ? 0 : rows.length, base_amount: money(baseCost), amount: 0, saving: 0,
        ref_po: '', status: f[3], user: buyer, note: f[3] === 'draft' ? '待补充目标成本与交期要求。' : ''
      });
      rows.forEach((l, k) => push('rfq_lines', Object.assign({ doc: no, lineno: k + 1 }, l)));
      if (f[3] === 'draft' || f[3] === 'sent') return;

      /* 回收报价:按目标成本上下浮动,最低价即定标行 */
      const lines = T.rfq_lines.filter(l => l.doc === no);
      lines.forEach(l => {
        l.price = money(l.base_price * (0.84 + R.next() * 0.24));
        l.amount = money(l.qty * l.price);
        if (R.chance(.3)) l.memo = R.pick(['含税含运费', '需 50% 预付', '可分两批交付', '账期可谈 45 天']);
      });
      const best = [];
      [...new Set(lines.map(l => l.product))].forEach(code => {
        const cand = lines.filter(l => l.product === code && l.price > 0).sort((a, b) => a.price - b.price);
        if (cand.length) best.push(cand[0]);
      });
      t.amount = money(best.reduce((s, l) => s + l.amount, 0));
      t.saving = money(t.base_amount - t.amount);
      t.status = 'quoted';
      if (f[3] !== 'awarded') return;

      /* 定标:按供应商拆分生成采购订单 */
      lines.forEach(l => { l.awarded = best.indexOf(l) >= 0 ? 'y' : 'n'; });
      const bySup = {};
      best.forEach(l => { (bySup[l.supplier] = bySup[l.supplier] || []).push(l); });
      const created = [];
      Object.keys(bySup).forEach(sup => {
        const rws = bySup[sup], s = supOf(sup);
        if (f[4] === 'full') {
          const res = purchaseFlow(s, MAIN_WH, notFuture(addDays(date, R.int(3, 8))),
            rws.map(l => [l.product, l.qty, l.price]), { rfq: no, buyer: t.buyer, note: '询价单 ' + no + ' 定标' });
          created.push(res.po);
        } else {
          const poNo = docNo('PO', 'purchase_order', date);
          const total = money(rws.reduce((a, l) => a + l.qty * l.price * (1 + l.tax_rate / 100), 0));
          push('purchase_order', {
            no: poNo, date: notFuture(addDays(date, 2)), supplier: sup, supplier_name: s.name, warehouse: MAIN_WH,
            expected_date: addDays(date, Math.max(7, s.lead_time || 14)), pr: '', rfq: no, currency: 'CNY',
            payment_terms: s.payment_terms, buyer: t.buyer, status: 'draft', total, amount: total,
            note: '由询价单 ' + no + ' 定标生成'
          });
          rws.forEach((l, k) => push('po_lines', {
            doc: poNo, lineno: k + 1, product: l.product, product_name: l.product_name, qty: l.qty, received: 0,
            price: l.price, tax_rate: l.tax_rate, amount: money(l.qty * l.price)
          }));
          created.push(poNo);
        }
      });
      t.ref_po = created.join(' / ');
      t.status = 'awarded';
    });

    /* ---------- 服务商管理:委外加工 ---------- */
    function stockBefore(code, wh) {
      return T.stock_movements.filter(m => m.product === code && m.warehouse === wh).reduce((s, m) => s + m.qty, 0);
    }
    const OS = [
      { proc: 'OS-002', out: 0, qty: 800, mats: [[RM[0], 110]], fee: 2.1, stage: 'draft', wh: MAIN_WH },
      { proc: 'OS-005', out: 1, qty: 600, mats: [[RM[0], 96]], fee: 2.9, stage: 'confirmed', wh: MAIN_WH },
      { proc: 'OS-001', out: 3, qty: 700, mats: [[RM[0], 84]], fee: 3.6, stage: 'issued', wh: MAIN_WH },
      { proc: 'OS-001', out: 5, qty: 900, mats: [[RM[1], 90], [RM[0], 27]], fee: 4.6, stage: 'received', wh: 'WH-GZ02' },
      { proc: 'OS-004', out: 4, qty: 1000, mats: [[RM[4], 1000]], fee: 1.2, stage: 'done', wh: MAIN_WH, pay: true },
      { proc: 'OS-003', out: 2, qty: 1000, mats: [[RM[5], 38]], fee: 4.8, stage: 'done', wh: MAIN_WH },
      { proc: 'OS-008', out: 1, qty: 400, mats: [[RM[0], 60]], fee: 2.6, stage: 'cancelled', wh: 'WH-TJ03' },
    ];
    OS.forEach(o => {
      const proc = T.processors.find(p => p.code === o.proc) || {};
      const out = prodOf((NEWSKUS[o.out] || {}).code);
      if (!out.code) return;
      const date = notFuture(addDays(START, R.int(60, 168)));
      const no = docNo('OS', 'os_order', date);
      const lines = o.mats.map((m, k) => {
        const p = prodOf(m[0]);
        return push('os_lines', { doc: no, lineno: k + 1, product: p.code, product_name: p.name, qty: m[1], issued: 0,
          price: money(p.cost), amount: money(m[1] * p.cost), tax_rate: 13, memo: '单件耗用 ' + (m[1] / o.qty).toFixed(3) });
      });
      const t = push('os_order', {
        no, date, processor: proc.code, processor_name: proc.name, process_type: proc.process_type,
        warehouse: o.wh, output_product: out.code, output_name: out.name, output_qty: o.qty, received_qty: 0,
        unit_fee: money(o.fee), fee_amount: money(o.qty * o.fee), issued_amount: 0, consumed_amount: 0, total_cost: 0,
        need_date: addDays(date, R.int(15, 35)), bill: '',
        status: o.stage === 'cancelled' ? 'cancelled' : 'draft', user: '孙未蹊',
        note: o.stage === 'cancelled' ? '服务商已被淘汰,加工单终止。' : ''
      });
      if (['draft', 'cancelled'].indexOf(o.stage) >= 0) return;
      t.status = 'confirmed';

      /* 发料:借 委托加工物资 / 贷 库存商品 */
      const iDate = notFuture(addDays(date, R.int(2, 6)));
      let cost = 0, issuedQty = 0;
      lines.forEach(l => {
        const p = prodOf(l.product);
        const q = l.qty;
        movement(iDate, 'os_issue', p, o.wh, -q, p.cost, no, '何砚舟', '', '委外发料—' + proc.name);
        l.issued = q; cost += money(q * p.cost); issuedQty += q;
      });
      cost = money(cost);
      t.issued_amount = cost; t.status = 'issued';
      journal(iDate, 'os_issue', no, '委外发料—' + proc.name, [
        { acc: '1408', debit: cost, memo: '委托加工材料' }, { acc: '1405', credit: cost, memo: '材料出库 ' + issuedQty + ' 件' }]);
      if (o.stage === 'issued') return;

      /* 收回成品:核销 1408 + 加工费挂账,成品按加权成本入库 */
      const rDate = notFuture(addDays(date, R.int(12, 26)));
      const rq = o.stage === 'received' ? Math.round(o.qty * .6) : o.qty;
      const last = rq >= o.qty;
      let mat = money(rq * (cost / o.qty));
      if (last) mat = money(cost - t.consumed_amount);
      const feeNet = money(rq * o.fee);
      const vat = money(feeNet * (out.tax_rate || 13) / 100);
      const inCost = money(mat + feeNet);
      const before = Math.max(0, stockBefore(out.code, o.wh));
      movement(rDate, 'os_receive', out, o.wh, rq, inCost / rq, no, '罗小满', '', '委外收回—' + proc.name);
      out.cost = money((before * out.cost + inCost) / (before + rq));
      t.received_qty = rq; t.consumed_amount = money(t.consumed_amount + mat); t.total_cost = money(t.total_cost + inCost);
      t.status = last ? 'done' : 'received';
      const bNo = docNo('PB', 'bill', rDate);
      push('bill', {
        no: bNo, date: rDate, supplier: proc.code, supplier_name: proc.name, po: '', gr: '', os: no, kind: 'fee',
        due_date: addDays(rDate, 30), status: addDays(rDate, 30) < today ? 'overdue' : 'open',
        total: money(feeNet + vat), paid: 0, balance: money(feeNet + vat),
        note: '委外加工费—' + (SCHEMA.entities.processors.fields.process_type.opts[proc.process_type] || '通用') + ' ' + rq + ' 件'
      });
      push('bill_lines', { doc: bNo, lineno: 1, product: out.code, product_name: out.name, qty: rq, price: money(o.fee), amount: feeNet, tax_rate: out.tax_rate || 13, memo: '加工费' });
      t.bill = bNo;
      journal(rDate, 'os_receive', no, '委外加工收回—' + proc.name, [
        { acc: '1405', debit: inCost, memo: '成品入库成本(材料+加工费)' },
        { acc: '2221', debit: vat, memo: '加工费进项税' },
        { acc: '1408', credit: mat, memo: '核销委托加工物资' },
        { acc: '2202', credit: money(feeNet + vat), memo: '应付加工费—' + proc.name }]);
      if (o.pay) payBill(bNo, undefined, notFuture(addDays(rDate, R.int(5, 20))), '钱雅诃');
    });

    /* ---------- 售后管理:退货 / 换货 / 维修 ---------- */
    const doneSO = T.sales_order.filter(o => o.status === 'done' && T.invoice.some(i => i.so === o.no));
    const RMA = [
      { type: 'return', reason: 'quality', stage: 'refunded', so: 2, ratio: .3 },
      { type: 'return', reason: 'damage', stage: 'closed', so: 7, ratio: .25 },
      { type: 'exchange', reason: 'wrong', stage: 'exchanged', so: 12, ratio: .4 },
      { type: 'repair', reason: 'quality', stage: 'repairing', so: 4, liability: 'supplier' },
      { type: 'repair', reason: 'other', stage: 'closed', so: 9, liability: 'customer' },
      { type: 'return', reason: 'cancel', stage: 'received', so: 15, ratio: .2 },
      { type: 'return', reason: 'quality', stage: 'approved', so: 18, ratio: .3 },
      { type: 'exchange', reason: 'quality', stage: 'pending', so: 21, ratio: .35 },
      { type: 'repair', reason: 'quality', stage: 'pending', so: 6, liability: 'company' },
      { type: 'return', reason: 'damage', stage: 'draft', so: 24, ratio: .3 },
      { type: 'return', reason: 'quality', stage: 'rejected', so: 27, ratio: .5 },
    ];
    RMA.forEach((c, i) => {
      const so = doneSO[c.so % doneSO.length];
      if (!so) return;
      const soLines = T.so_lines.filter(l => l.doc === so.no && (l.delivered || 0) > 2);
      if (!soLines.length) return;
      const date = notFuture(addDays(START, R.int(90, 176)));
      const no = docNo('RM', 'rma', date);
      const pick = soLines.slice(0, Math.min(2, soLines.length));
      const lines = pick.map((l, k) => {
        const qty = Math.max(1, Math.round((l.delivered || 3) * (c.ratio || .3)));
        const p = prodOf(l.product);
        return push('rma_lines', { doc: no, lineno: k + 1, product: l.product, product_name: l.product_name,
          qty, price: money(l.price), amount: money(qty * l.price), tax_rate: p.tax_rate || 13, memo: c.reason === 'damage' ? '外箱挤压,内件破损' : '客户反馈使用异常' });
      });
      const amount = money(lines.reduce((s, l) => s + l.qty * l.price * (1 + l.tax_rate / 100), 0));
      const t = push('rma', {
        no, date, customer: so.customer, customer_name: so.customer_name, so: so.no, invoice: '',
        warehouse: so.warehouse, type: c.type, reason: c.reason, liability: c.liability || (c.type === 'return' ? 'company' : 'customer'),
        qty: lines.reduce((s, l) => s + l.qty, 0), amount, repair_cost: 0, handler: '林墨对白',
        approval: '', credit_invoice: '', status: c.stage, user: so.salesperson || '周寒峰',
        note: R.pick(['客户开箱视频已留存。', '同批次另有 2 位客户反馈。', '快递外包装完好,内件破损。', '客户要求 7 日内处理完毕。'])
      });
      if (c.stage === 'draft') return;
      const ap = apStart('rma', no, {
        date, title: '售后' + SCHEMA.entities.rma.fields.type.opts[c.type] + ':' + so.customer_name,
        applicant: t.user, role: '销售主管', amount, priority: c.type === 'return' ? 'urgent' : 'std'
      });
      t.approval = ap.no;
      if (c.stage === 'pending') return;
      if (c.stage === 'rejected') { apDecide(ap, false, '林墨对白', '超出售后时限且责任无法判定,建议转商务协商。', R.int(2, 6)); return; }
      apDecide(ap, true, '林墨对白', c.type === 'return' ? '同意退货退款,红冲后按原路退款。' : c.type === 'exchange' ? '同意换货,收回问题品后重发。' : '同意维修处理,费用计入销售费用。', R.int(1, 4));

      if (c.type === 'repair') {
        const cost = money(R.int(60, 480) * (1 + R.next() * .3));
        t.repair_cost = cost;
        const rDate = notFuture(addDays(date, R.int(3, 12)));
        if (c.liability === 'supplier') {
          /* 供应商责任:费用先行计提,并挂一笔应付账单,保证应付子账 = 总账 2202 */
          const p0 = prodOf(pick[0].product);
          const sup = (supsOf(p0.category).concat(T.suppliers.filter(s => s.status === 'enabled')))[0];
          const bNo = docNo('PB', 'bill', rDate);
          push('bill', { no: bNo, date: rDate, supplier: sup.code, supplier_name: sup.name, po: '', gr: '', os: '', kind: 'fee',
            due_date: addDays(rDate, 30), status: addDays(rDate, 30) < today ? 'overdue' : 'open',
            total: cost, paid: 0, balance: cost, note: '售后维修费暂挂应付,应向服务商追偿—' + no });
          push('bill_lines', { doc: bNo, lineno: 1, product: p0.code, product_name: p0.name, qty: 1, price: cost, amount: cost, tax_rate: 0, memo: '维修工时费' });
          journal(rDate, 'rma_repair', no, '售后维修费—' + so.customer_name,
            [{ acc: '6601', debit: cost, memo: '先行承担维修费' }, { acc: '2202', credit: cost, memo: '应追偿服务商,暂挂应付 ' + bNo }]);
        } else {
          journal(rDate, 'rma_repair', no, '售后维修费—' + so.customer_name,
            [{ acc: '6601', debit: cost, memo: c.liability === 'customer' ? '客户付费维修' : '公司承担维修费' }, { acc: '1002', credit: cost }]);
        }
        t.status = c.liability === 'customer' ? 'closed' : 'repairing';
        return;
      }

      /* 退货/换货入库:借 库存商品 / 贷 主营业务成本(冲回已结转成本) */
      const recDate = notFuture(addDays(date, R.int(3, 10)));
      let cost = 0, qty = 0;
      lines.forEach(l => {
        const p = prodOf(l.product);
        movement(recDate, 'so_return', p, t.warehouse, l.qty, p.cost, no, '罗小满', '', '售后退货入库');
        cost += money(l.qty * p.cost); qty += l.qty;
      });
      cost = money(cost);
      journal(recDate, 'rma_return', no, '售后退货入库—' + so.customer_name, [
        { acc: '1405', debit: cost, memo: '退货入库 ' + qty + ' 件' }, { acc: '5001', credit: cost, memo: '冲回主营业务成本' }]);
      t.received_cost = cost; t.status = 'received';

      /* 红字发票:负数发票冲减收入与应收 */
      const cDate = notFuture(addDays(recDate, R.int(1, 5)));
      const iNo = docNo('IV', 'invoice', cDate);
      let net = 0, gross = 0;
      lines.forEach((l, k) => {
        const amt = money(-l.qty * l.price);
        const tax = money(amt * l.tax_rate / 100);
        net += amt; gross += amt + tax;
        push('iv_lines', { doc: iNo, lineno: k + 1, product: l.product, product_name: l.product_name, qty: -l.qty,
          price: l.price, discount: 0, amount: amt, tax_rate: l.tax_rate, memo: '售后红冲' });
      });
      net = money(net); gross = money(gross);
      push('invoice', { no: iNo, date: cDate, customer: so.customer, customer_name: so.customer_name, so: so.no,
        delivery: '', rma: no, kind: 'red', due_date: cDate, currency: 'CNY', status: 'open', total: gross, paid: 0, balance: gross, note: '售后红字发票—' + no });
      journal(cDate, 'rma_credit', iNo, '售后红冲收入—' + so.customer_name, [
        { acc: '4001', debit: money(-net), memo: '冲减主营业务收入' },
        { acc: '2221', debit: money(-(gross - net)), memo: '冲减销项税额' },
        { acc: '1122', credit: money(-gross), memo: '冲减应收账款' }]);
      t.credit_invoice = iNo;

      if (c.type === 'exchange') {
        const shipDate = notFuture(addDays(cDate, R.int(1, 4)));
        let ecost = 0;
        lines.forEach(l => {
          const p = prodOf(l.product);
          movement(shipDate, 'sales_delivery', p, t.warehouse, -l.qty, p.cost, no, '何砚舟', '', '售后换货重新发出');
          ecost += money(l.qty * p.cost);
        });
        journal(shipDate, 'sales_delivery', no, '售后换货出库—' + so.customer_name, [
          { acc: '5001', debit: money(ecost), memo: '换货发出成本' }, { acc: '1405', credit: money(ecost) }]);
        t.status = 'exchanged';
        return;
      }
      if (c.stage === 'refunded') {
        const rcDate = notFuture(addDays(cDate, R.int(2, 9)));
        const rcNo = docNo('RC', 'receipt', rcDate);
        const amt = money(-gross);
        push('receipt', { no: rcNo, date: rcDate, customer: so.customer, customer_name: so.customer_name, invoice: iNo,
          amount: money(-amt), method: '银行转账', status: 'posted', user: '钱雅诃', note: '售后退款—' + no });
        const inv = T.invoice.find(x => x.no === iNo);
        inv.paid = money(-amt); inv.balance = 0; inv.status = 'paid';
        journal(rcDate, 'rma_refund', rcNo, '售后退款—' + so.customer_name, [
          { acc: '1122', debit: amt, memo: '核销红字发票 ' + iNo }, { acc: '1002', credit: amt }]);
        t.amount = amt; t.status = 'refunded';
      } else if (c.stage === 'closed') {
        t.status = 'closed';
      }
    });

    /* ---------- 订单管理:销售订单变更审批 ---------- */
    const changeable = T.sales_order.filter(o => ['confirmed', 'partial'].indexOf(o.status) >= 0);
    const CHG = [
      { ok: 'wait', days: 6, pr: 'urgent', why: '客户门店活动提前,需压缩交期。' },
      { ok: 'wait', days: 10, pr: 'std', why: '客户资金计划调整,申请顺延到货日。' },
      { ok: true, days: -3, pr: 'critical', why: '大促档期锁定,交期提前并已协商加急运费。' },
      { ok: false, days: 25, pr: 'std', why: '客户要求顺延 25 天,仓储排期冲突。' },
      { ok: 'wait', days: 4, pr: 'urgent', why: '海运舱位取消,需改走陆运并顺延。' },
    ];
    CHG.forEach((c, i) => {
      const so = changeable[(i * 7 + 3) % changeable.length];
      if (!so) return;
      const date = notFuture(addDays(today, -R.int(1, 12)));
      const payload = { required_date: addDays(so.required_date, c.days), priority: c.pr };
      const ap = apStart('so_change', so.no, {
        date, title: '销售订单变更 ' + so.no, applicant: so.salesperson || '周寒峰', role: '销售主管',
        amount: so.total, priority: c.pr === 'critical' ? 'critical' : c.pr, payload, note: c.why
      });
      ap.summary = '需求到货日: ' + so.required_date + ' → ' + payload.required_date + ';紧急度: ' + (so.priority || 'std') + ' → ' + payload.priority;
      if (c.ok === 'wait') return;
      const ok = c.ok === true;
      apDecide(ap, ok, '林墨对白', ok ? '同意变更,已同步仓库排期。' : '顺延将影响大促备货,请维持原交期。', R.int(1, 3));
      if (ok) { Object.assign(so, payload); so.note = (so.note ? so.note + ' / ' : '') + '变更 ' + ap.no; }
    });

    /* ---------- 新模块操作日志 ---------- */
    const newLogs = [
      ['产品管理', '发出询价单', '按物料类目自动邀请 3 家在册供应商报价'],
      ['产品管理', '询价定标', '最低价中标并拆分生成采购订单'],
      ['产品管理', '新品上架', '写入商品主档并同步渠道与毛利基线'],
      ['服务商管理', '供应商建档', '准入评审通过后生成供应商主档'],
      ['服务商管理', '外协商核准', '打样评分合格后纳入外协供应商池'],
      ['服务商管理', '委外发料过账', '借委托加工物资、贷库存商品'],
      ['服务商管理', '委外收回过账', '核销 1408 并挂加工费应付'],
      ['售后管理', '开具红字发票', '负数发票冲减收入与应收账款'],
      ['售后管理', '登记售后退款', '负数收款单核销红字发票'],
      ['订单管理', '发起订单变更', '交期与紧急度变更需上级审批'],
      ['审批中心', '审批通过', '裁决结果回调业务单据状态'],
      ['权限管理', '授予权限', '调整角色可执行的功能模块与动作'],
    ];
    newLogs.forEach((l, i) => {
      T.activity.push({ id: 'NW' + (200000 + i), time: api.nowStr().slice(0, 11) + pad2(20 - i) + ':' + pad2(R.int(0, 59)) + ':' + pad2(R.int(0, 59)),
        user: R.pick(['温叙白', '邵聿宁', '孙未蹊', '郑思远', '林墨对白', '钱雅诃', '陈立群']),
        module: l[0], action: l[1], ref: '', detail: l[2] });
    });


    /* ---------- 期间费用凭证 ---------- */
    const months = [];
    for (let m = 0; m < 6; m++) months.push(addDays(today, -(m * 30 + 12)).slice(0, 7));
    months.forEach((pm, i) => {
      const d = pm + '-25';
      if (d > today) return;
      journal(d, 'manual', '', '计提当月工资薪金', [
        { acc: '6602', debit: 38000, memo: '管理费用—职工薪酬' }, { acc: '2211', credit: 38000 }], '方静姝');
      journal(d, 'manual', '', '支付办公室租金及物业', [
        { acc: '6602', debit: 9000, memo: '租赁费' }, { acc: '1002', credit: 9000 }], '钱雅诃');
      journal(d, 'manual', '', '仓储及快递物流费', [
        { acc: '6601', debit: money(12000 + i * 700), memo: '仓储物流费' }, { acc: '1002', credit: money(12000 + i * 700) }], '钱雅诃');
      journal(d, 'manual', '', '平台推广及广告投放', [
        { acc: '6601', debit: money(15000 + i * 1100), memo: '市场推广费' }, { acc: '1002', credit: money(15000 + i * 1100) }], '方静姝');
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
