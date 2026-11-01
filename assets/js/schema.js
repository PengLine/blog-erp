/* ============================================================
 * schema.js — 数据字典(单一事实来源)
 * 每个实体:label 中文名 / table 表名 / pk 主键 / prefix 单据前缀 / fields 字段
 * field: {t 类型, l 标签, ref 引用实体, opts 选项, hide 列表隐藏, sum 合计, ro 只读, dec 小数位}
 * 类型: text money int date datetime select ref bool textarea code email tel url percent
 * ============================================================ */
window.SCHEMA = (function () {

  const STATUS = {
    draft: { l: '草稿', c: 'b-neutral' },
    confirmed: { l: '已确认', c: 'b-primary' },
    partial: { l: '部分完成', c: 'b-warning' },
    done: { l: '已完成', c: 'b-success' },
    cancelled: { l: '已取消', c: 'b-danger' },
    closed: { l: '已关闭', c: 'b-neutral' },
    submitted: { l: '已提交', c: 'b-info' },
    pending: { l: '待审批', c: 'b-warning' },
    approved: { l: '已批准', c: 'b-success' },
    rejected: { l: '已驳回', c: 'b-danger' },
    converted: { l: '已转采购', c: 'b-purple' },
    posted: { l: '已过账', c: 'b-success' },
    open: { l: '未收款', c: 'b-danger' },
    partial_paid: { l: '部分收款', c: 'b-warning' },
    paid: { l: '已结清', c: 'b-success' },
    overdue: { l: '逾期', c: 'b-danger' },
    shortage: { l: '缺货', c: 'b-danger' },
    normal: { l: '正常', c: 'b-success' },
    low: { l: '低于安全库存', c: 'b-warning' },
    enabled: { l: '启用', c: 'b-success' },
    disabled: { l: '停用', c: 'b-neutral' },
    active: { l: '在职', c: 'b-success' },
    inactive: { l: '离职', c: 'b-neutral' },
  };

  const YESNO = { y: '是', n: '否' };
  const CURRENCY = { CNY: '人民币 CNY', USD: '美元 USD', EUR: '欧元 EUR' };
  const PAYTERM = {
    COD: '货到付款', NET30: '月结 30 天', NET45: '月结 45 天', NET60: '月结 60 天',
    PRE100: '100% 预付', PRE50: '50% 预付 + 尾款到货付'
  };

  const E = {
    /* ---------------- 基础数据 ---------------- */
    products: {
      label: '商品 / 物料主数据', table: '商品主档 (md_material)', pk: 'code', icon: 'box',
      fields: {
        code: { t: 'code', l: '物料编码', ph: 'SKU-' },
        name: { t: 'text', l: '商品名称' },
        category: { t: 'select', l: '类目', opts: { 'HM': '家居用品', 'DP': '数码配件', 'PP': '个护美妆', 'AC': '户外配件', 'OF': '办公用品', 'GD': '通用五金' } },
        brand: { t: 'text', l: '品牌' },
        uom: { t: 'select', l: '单位', opts: { PCS: '件', SET: '套', BOX: '盒', KG: '千克' }, hide: true },
        barcode: { t: 'text', l: '条码', hide: true },
        cost: { t: 'money', l: '标准成本', sum: true },
        price: { t: 'money', l: '标准售价', sum: true },
        tax_rate: { t: 'select', l: '税率', opts: { 13: '13%', 9: '9%', 6: '6%', 0: '免税' }, hide: true, dec: 0 },
        weight: { t: 'int', l: '毛重(g)', hide: true },
        safety_qty: { t: 'int', l: '安全库存' },
        lead_time: { t: 'int', l: '采购提前期(天)', hide: true },
        status: { t: 'select', l: '状态', opts: { enabled: 1, disabled: 1 }, badge: 1 },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    customers: {
      label: '客户档案', table: '客户主档 (md_customer)', pk: 'code', icon: 'users',
      fields: {
        code: { t: 'code', l: '客户编号', ph: 'CU-' },
        name: { t: 'text', l: '客户名称' },
        type: { t: 'select', l: '客户类型', opts: { 'KA 重点客户': 1, '区域经销商': 1, '电商平台': 1, '连锁门店': 1, '外贸客户': 1, '直销散户': 1 }, hide: true },
        industry: { t: 'text', l: '所属行业', hide: true },
        region: { t: 'select', l: '区域', opts: { '华东': 1, '华南': 1, '华北': 1, '华中': 1, '西南': 1, '西北': 1, '东北': 1, '海外': 1 } },
        contact: { t: 'text', l: '联系人', hide: true },
        phone: { t: 'tel', l: '联系电话' },
        email: { t: 'email', l: '邮箱', hide: true },
        address: { t: 'text', l: '地址', hide: true, full: 1 },
        tax_id: { t: 'text', l: '纳税人识别号', hide: true },
        credit_limit: { t: 'money', l: '信用额度', sum: true },
        payment_terms: { t: 'select', l: '结算方式', opts: PAYTERM, hide: true },
        salesperson: { t: 'text', l: '负责销售', hide: true },
        status: { t: 'select', l: '状态', opts: { enabled: 1, disabled: 1 }, badge: 1 },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    suppliers: {
      label: '供应商档案', table: '供应商主档 (md_vendor)', pk: 'code', icon: 'truck',
      fields: {
        code: { t: 'code', l: '供应商编号', ph: 'SU-' },
        name: { t: 'text', l: '供应商名称' },
        category: { t: 'select', l: '主营类目', opts: { 'HM': '家居用品', 'DP': '数码配件', 'PP': '个护美妆', 'AC': '户外配件', 'OF': '办公用品', 'GD': '通用五金' } },
        contact: { t: 'text', l: '业务联系人', hide: true },
        phone: { t: 'tel', l: '联系电话' },
        email: { t: 'email', l: '邮箱', hide: true },
        address: { t: 'text', l: '地址', hide: true, full: 1 },
        tax_id: { t: 'text', l: '纳税人识别号', hide: true },
        lead_time: { t: 'int', l: '交付周期(天)', hide: true },
        payment_terms: { t: 'select', l: '结算方式', opts: PAYTERM, hide: true },
        currency: { t: 'select', l: '结算币种', opts: CURRENCY, hide: true },
        min_order: { t: 'int', l: '最小起订量', hide: true },
        rating: { t: 'int', l: '绩效评分', hide: true },
        status: { t: 'select', l: '状态', opts: { enabled: 1, disabled: 1 }, badge: 1 },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    warehouses: {
      label: '仓库 / 库位', table: '仓库主档 (md_warehouse)', pk: 'code', icon: 'home',
      fields: {
        code: { t: 'code', l: '仓库编码', ph: 'WH-' },
        name: { t: 'text', l: '仓库名称' },
        location: { t: 'text', l: '所在地' },
        manager: { t: 'text', l: '负责人' },
        phone: { t: 'tel', l: '联系电话', hide: true },
        area: { t: 'int', l: '面积(㎡)', hide: true },
        status: { t: 'select', l: '状态', opts: { enabled: 1, disabled: 1 }, badge: 1 },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    stock: {
      label: '库存现量', table: '库存现量表 (inv_stock)', pk: '_id', icon: 'layers', readonly: true,
      fields: {
        product: { t: 'ref', l: '物料编码', ref: 'products', key: 'code' },
        product_name: { t: 'text', l: '商品名称' },
        warehouse: { t: 'ref', l: '仓库', ref: 'warehouses', key: 'code' },
        qty: { t: 'int', l: '现量' },
        reserved: { t: 'int', l: '已占用' },
        available: { t: 'int', l: '可用量' },
        cost: { t: 'money', l: '单位成本' },
        value: { t: 'money', l: '库存金额', sum: true },
        status: { t: 'select', l: '库存状态', opts: { normal: 1, low: 1, shortage: 1 }, badge: 1 },
      }
    },
    stock_movements: {
      label: '出入库流水', table: '出入库流水 (inv_movement)', pk: 'no', prefix: 'MV', icon: 'swap', readonly: true,
      fields: {
        no: { t: 'code', l: '流水号' },
        date: { t: 'date', l: '业务日期' },
        type: { t: 'select', l: '类型', opts: {
          po_receipt: '采购入库', sales_delivery: '销售出库', so_return: '销售退货', po_return: '采购退货',
          transfer: '库存调拨', stocktake_plus: '盘盈', stocktake_minus: '盘亏', manual: '手工调整'
        }, badge: 0 },
        product: { t: 'ref', l: '物料', ref: 'products', key: 'code' },
        product_name: { t: 'text', l: '商品名称' },
        warehouse: { t: 'ref', l: '仓库', ref: 'warehouses', key: 'code' },
        to_warehouse: { t: 'ref', l: '调入仓', ref: 'warehouses', key: 'code', hide: true },
        qty: { t: 'int', l: '数量(±)' },
        unit_cost: { t: 'money', l: '单位成本', hide: true },
        amount: { t: 'money', l: '金额', sum: true },
        ref: { t: 'text', l: '关联单据' },
        user: { t: 'text', l: '操作人', hide: true },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    users: {
      label: '用户与权限', table: '系统用户 (sys_user)', pk: 'code', icon: 'user',
      fields: {
        code: { t: 'code', l: '工号', ph: 'EMP-' },
        name: { t: 'text', l: '姓名' },
        dept: { t: 'select', l: '部门', opts: { '总经办': 1, '销售部': 1, '采购部': 1, '仓储物流部': 1, '财务部': 1, '信息技术部': 1 } },
        role: { t: 'select', l: '角色', opts: { '系统管理员': 1, '销售主管': 1, '销售代表': 1, '采购主管': 1, '采购员': 1, '仓库管理员': 1, '财务会计': 1, '财务经理': 1 } },
        email: { t: 'email', l: '邮箱' },
        phone: { t: 'tel', l: '手机号', hide: true },
        last_login: { t: 'text', l: '最近登录', hide: true },
        status: { t: 'select', l: '状态', opts: { active: 1, inactive: 1 }, badge: 1 },
      }
    },
    activity: {
      label: '操作日志', table: '审计日志 (sys_audit_log)', pk: 'id', icon: 'clock', readonly: true, hideNew: true,
      fields: {
        time: { t: 'datetime', l: '时间' },
        user: { t: 'text', l: '操作人' },
        module: { t: 'text', l: '模块' },
        action: { t: 'text', l: '动作' },
        ref: { t: 'text', l: '关联单据' },
        detail: { t: 'text', l: '说明', full: 1 },
      }
    },

    /* ---------------- 销售 ---------------- */
    sales_order: {
      label: '销售订单', table: '销售订单 (sd_sales_order)', pk: 'no', prefix: 'SO', icon: 'file', doc: 'so_lines',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '订单号' },
        date: { t: 'date', l: '订单日期' },
        customer: { t: 'ref', l: '客户', ref: 'customers', key: 'code', name: 'name' },
        customer_name: { t: 'text', l: '客户名称' },
        warehouse: { t: 'ref', l: '发货仓', ref: 'warehouses', key: 'code' },
        required_date: { t: 'date', l: '需求到货日' },
        currency: { t: 'select', l: '币种', opts: CURRENCY, hide: true, def: 'CNY' },
        payment_terms: { t: 'select', l: '结算方式', opts: PAYTERM, hide: true },
        salesperson: { t: 'text', l: '销售员', hide: true },
        status: { t: 'select', l: '状态', opts: { draft: 1, confirmed: 1, partial: 1, done: 1, cancelled: 1 }, badge: 1, ro: 1 },
        total: { t: 'money', l: '订单金额(含税)', sum: true, ro: 1 },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    so_lines: {
      label: '销售订单行', hidden: true, parent: 'sales_order',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' }, delivered: { t: 'int' }, price: { t: 'money' }, discount: { t: 'percent' }, amount: { t: 'money' }, tax_rate: { t: 'int' } }
    },
    pr_lines: {
      label: '采购申请行', hidden: true, parent: 'purchase_req',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' }, price: { t: 'money' }, amount: { t: 'money' }, memo: { t: 'text' } }
    },
    tr_lines: {
      label: '调拨行', hidden: true, parent: 'transfer',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' } }
    },
    stk_lines: {
      label: '盘点行', hidden: true, parent: 'stocktake',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, book_qty: { t: 'int' }, actual_qty: { t: 'int' }, diff: { t: 'int' }, cost: { t: 'money' }, diff_amount: { t: 'money' } }
    },
    delivery: {
      label: '销售出库单', table: '销售出库单 (sd_delivery)', pk: 'no', prefix: 'DL', icon: 'send', readonly: true,
      fields: {
        no: { t: 'code', l: '出库单号' },
        date: { t: 'date', l: '出库日期' },
        so: { t: 'ref', l: '来源销售订单', ref: 'sales_order', key: 'no' },
        customer: { t: 'ref', l: '客户', ref: 'customers', key: 'code' },
        customer_name: { t: 'text', l: '客户名称' },
        warehouse: { t: 'ref', l: '发货仓', ref: 'warehouses', key: 'code' },
        amount: { t: 'money', l: '出库金额(成本)', sum: true },
        status: { t: 'select', l: '状态', opts: { posted: 1 }, badge: 1 },
        carrier: { t: 'text', l: '承运商', hide: true },
        tracking: { t: 'text', l: '运单号', hide: true },
        user: { t: 'text', l: '操作人', hide: true },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    invoice: {
      label: '销售发票', table: '应收发票 (ar_invoice)', pk: 'no', prefix: 'IV', icon: 'receipt', doc: 'iv_lines',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '发票号' },
        date: { t: 'date', l: '开票日期' },
        customer: { t: 'ref', l: '客户', ref: 'customers', key: 'code', name: 'name' },
        customer_name: { t: 'text', l: '客户名称' },
        so: { t: 'ref', l: '来源订单', ref: 'sales_order', key: 'no', hide: true },
        delivery: { t: 'ref', l: '来源出库单', ref: 'delivery', key: 'no', hide: true },
        due_date: { t: 'date', l: '付款到期日' },
        currency: { t: 'select', l: '币种', opts: CURRENCY, hide: true, def: 'CNY' },
        status: { t: 'select', l: '状态', opts: { draft: 1, open: 1, partial_paid: 1, paid: 1, overdue: 1, cancelled: 1 }, badge: 1, ro: 1 },
        total: { t: 'money', l: '价税合计', sum: true, ro: 1 },
        paid: { t: 'money', l: '已收金额', sum: true, ro: 1 },
        balance: { t: 'money', l: '未收余额', sum: true, ro: 1 },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    iv_lines: {
      label: '发票行', hidden: true, parent: 'invoice',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' }, price: { t: 'money' }, discount: { t: 'percent' }, amount: { t: 'money' }, tax_rate: { t: 'int' } }
    },
    dl_lines: {
      label: '出库单行', hidden: true, parent: 'delivery',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' }, price: { t: 'money' }, amount: { t: 'money' }, tax_rate: { t: 'int' } }
    },
    gr_lines: {
      label: '收货单行', hidden: true, parent: 'gr',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' }, price: { t: 'money' }, amount: { t: 'money' }, tax_rate: { t: 'int' } }
    },
    bill_lines: {
      label: '账单行', hidden: true, parent: 'bill',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' }, price: { t: 'money' }, amount: { t: 'money' }, tax_rate: { t: 'int' } }
    },

    /* ---------------- 采购 ---------------- */
    purchase_req: {
      label: '采购申请', table: '采购申请 (pm_requisition)', pk: 'no', prefix: 'PR', icon: 'clipboard',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '申请单号' },
        date: { t: 'date', l: '申请日期' },
        dept: { t: 'select', l: '申请部门', opts: { '销售部': 1, '仓储物流部': 1, '采购部': 1, '总经办': 1, '信息技术部': 1 } },
        requester: { t: 'text', l: '申请人' },
        need_date: { t: 'date', l: '期望到货日' },
        reason: { t: 'text', l: '申请事由', full: 1 },
        approver: { t: 'text', l: '审批人', hide: true },
        status: { t: 'select', l: '状态', opts: { draft: 1, pending: 1, approved: 1, rejected: 1, converted: 1 }, badge: 1, ro: 1 },
        amount: { t: 'money', l: '预估金额', sum: true },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    purchase_order: {
      label: '采购订单', table: '采购订单 (pm_purchase_order)', pk: 'no', prefix: 'PO', icon: 'file', doc: 'po_lines',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '采购订单号' },
        date: { t: 'date', l: '下单日期' },
        supplier: { t: 'ref', l: '供应商', ref: 'suppliers', key: 'code', name: 'name' },
        supplier_name: { t: 'text', l: '供应商名称' },
        warehouse: { t: 'ref', l: '收货仓', ref: 'warehouses', key: 'code' },
        expected_date: { t: 'date', l: '预计到货日' },
        pr: { t: 'ref', l: '来源申请', ref: 'purchase_req', key: 'no', hide: true },
        currency: { t: 'select', l: '币种', opts: CURRENCY, hide: true, def: 'CNY' },
        payment_terms: { t: 'select', l: '结算方式', opts: PAYTERM, hide: true },
        buyer: { t: 'text', l: '采购员', hide: true },
        status: { t: 'select', l: '状态', opts: { draft: 1, confirmed: 1, partial: 1, done: 1, cancelled: 1 }, badge: 1, ro: 1 },
        total: { t: 'money', l: '订单金额(含税)', sum: true, ro: 1 },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    po_lines: {
      label: '采购订单行', hidden: true, parent: 'purchase_order',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, product: { t: 'ref', ref: 'products' }, product_name: { t: 'text' }, qty: { t: 'int' }, received: { t: 'int' }, price: { t: 'money' }, tax_rate: { t: 'int' }, amount: { t: 'money' } }
    },
    gr: {
      label: '采购收货单', table: '采购收货单 (pm_goods_receipt)', pk: 'no', prefix: 'GR', icon: 'download', readonly: true,
      fields: {
        no: { t: 'code', l: '收货单号' },
        date: { t: 'date', l: '收货日期' },
        po: { t: 'ref', l: '来源采购订单', ref: 'purchase_order', key: 'no' },
        supplier: { t: 'ref', l: '供应商', ref: 'suppliers', key: 'code' },
        supplier_name: { t: 'text', l: '供应商名称' },
        warehouse: { t: 'ref', l: '收货仓', ref: 'warehouses', key: 'code' },
        amount: { t: 'money', l: '入库金额(成本)', sum: true },
        status: { t: 'select', l: '状态', opts: { posted: 1 }, badge: 1 },
        user: { t: 'text', l: '仓管员', hide: true },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    bill: {
      label: '采购发票(应付)', table: '应付账单 (ap_bill)', pk: 'no', prefix: 'PB', icon: 'receipt', readonly: true,
      fields: {
        no: { t: 'code', l: '账单号' },
        date: { t: 'date', l: '账单日期' },
        supplier: { t: 'ref', l: '供应商', ref: 'suppliers', key: 'code', name: 'name' },
        supplier_name: { t: 'text', l: '供应商名称' },
        po: { t: 'ref', l: '来源订单', ref: 'purchase_order', key: 'no', hide: true },
        gr: { t: 'ref', l: '来源收货单', ref: 'gr', key: 'no' },
        due_date: { t: 'date', l: '付款到期日' },
        status: { t: 'select', l: '状态', opts: { open: 1, partial_paid: 1, paid: 1, overdue: 1 }, badge: 1, ro: 1 },
        total: { t: 'money', l: '价税合计', sum: true },
        paid: { t: 'money', l: '已付金额', sum: true },
        balance: { t: 'money', l: '未付余额', sum: true },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },

    /* ---------------- 库存 ---------------- */
    transfer: {
      label: '库存调拨单', table: '调拨单 (inv_transfer)', pk: 'no', prefix: 'TR', icon: 'swap',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '调拨单号' },
        date: { t: 'date', l: '调拨日期' },
        from_wh: { t: 'ref', l: '调出仓', ref: 'warehouses', key: 'code' },
        to_wh: { t: 'ref', l: '调入仓', ref: 'warehouses', key: 'code' },
        status: { t: 'select', l: '状态', opts: { draft: 1, done: 1, cancelled: 1 }, badge: 1, ro: 1 },
        user: { t: 'text', l: '操作人', hide: true },
        note: { t: 'textarea', l: '备注', full: 1 },
      }
    },
    stocktake: {
      label: '库存盘点单', table: '盘点单 (inv_stocktake)', pk: 'no', prefix: 'ST', icon: 'clipboard',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '盘点单号' },
        date: { t: 'date', l: '盘点日期' },
        warehouse: { t: 'ref', l: '盘点仓库', ref: 'warehouses', key: 'code' },
        status: { t: 'select', l: '状态', opts: { draft: 1, posted: 1, cancelled: 1 }, badge: 1, ro: 1 },
        diff_lines: { t: 'int', l: '差异行数', hide: true },
        diff_amount: { t: 'money', l: '差异金额', hide: true },
        user: { t: 'text', l: '盘点人', hide: true },
        note: { t: 'textarea', l: '备注', full: 1 },
      }
    },

    /* ---------------- 财务 ---------------- */
    gl_account: {
      label: '会计科目', table: '会计科目表 (fa_account)', pk: 'code', icon: 'book', readonly: true,
      fields: {
        code: { t: 'code', l: '科目编码' },
        name: { t: 'text', l: '科目名称' },
        type: { t: 'select', l: '科目类别', opts: { asset: '资产', liability: '负债', equity: '所有者权益', revenue: '收入', cost: '成本', expense: '费用' }, badge: 0 },
        direction: { t: 'select', l: '借贷方向', opts: { debit: '借', credit: '贷' } },
        balance: { t: 'money', l: '本期余额(借正贷负)', sum: true, ro: 1 },
      }
    },
    journal: {
      label: '记账凭证', table: '记账凭证 (fa_journal)', pk: 'no', prefix: 'JE', icon: 'book', readonly: true,
      fields: {
        no: { t: 'code', l: '凭证号' },
        date: { t: 'date', l: '凭证日期' },
        period: { t: 'text', l: '会计期间', hide: true },
        type: { t: 'select', l: '业务类型', opts: { sales_invoice: '销售开票', sales_delivery: '销售出库(结转成本)', sales_receipt: '销售收款',
          po_receipt: '采购入库', ap_bill: '应付挂账', ap_payment: '付款', stock_adjust: '库存调整', manual: '手工凭证' }, badge: 0 },
        ref: { t: 'text', l: '关联单据' },
        memo: { t: 'text', l: '摘要', full: 1 },
        debit: { t: 'money', l: '借方合计', sum: true },
        status: { t: 'select', l: '状态', opts: { posted: 1 }, badge: 1, hide: true },
        user: { t: 'text', l: '制单人', hide: true },
      }
    },
    journal_lines: {
      label: '凭证分录', hidden: true, parent: 'journal',
      fields: { doc: { t: 'text' }, lineno: { t: 'int' }, account: { t: 'text' }, account_name: { t: 'text' }, memo: { t: 'text' }, debit: { t: 'money' }, credit: { t: 'money' } }
    },
    payment: {
      label: '付款单', table: '付款单 (ap_payment)', pk: 'no', prefix: 'PY', icon: 'card',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '付款单号' },
        date: { t: 'date', l: '付款日期' },
        supplier: { t: 'ref', l: '供应商', ref: 'suppliers', key: 'code', name: 'name' },
        supplier_name: { t: 'text', l: '供应商名称' },
        bill: { t: 'ref', l: '冲抵账单', ref: 'bill', key: 'no' },
        amount: { t: 'money', l: '付款金额', sum: true },
        method: { t: 'select', l: '付款方式', opts: { '银行转账': 1, '电汇 T/T': 1, '承兑汇票': 1, '信用证 L/C': 1 } },
        account: { t: 'text', l: '收款账户', hide: true },
        status: { t: 'select', l: '状态', opts: { draft: 1, posted: 1 }, badge: 1, ro: 1 },
        user: { t: 'text', l: '付款人', hide: true },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
    receipt: {
      label: '收款单', table: '收款单 (ar_receipt)', pk: 'no', prefix: 'RC', icon: 'wallet',
      statusField: 'status', nextSeqField: 'date',
      fields: {
        no: { t: 'code', l: '收款单号' },
        date: { t: 'date', l: '收款日期' },
        customer: { t: 'ref', l: '客户', ref: 'customers', key: 'code', name: 'name' },
        customer_name: { t: 'text', l: '客户名称' },
        invoice: { t: 'ref', l: '冲抵发票', ref: 'invoice', key: 'no' },
        amount: { t: 'money', l: '收款金额', sum: true },
        method: { t: 'select', l: '收款方式', opts: { '银行转账': 1, '电汇 T/T': 1, '承兑汇票': 1, '在线支付': 1, '现金': 1 } },
        status: { t: 'select', l: '状态', opts: { draft: 1, posted: 1 }, badge: 1, ro: 1 },
        user: { t: 'text', l: '收款人', hide: true },
        note: { t: 'textarea', l: '备注', hide: true, full: 1 },
      }
    },
  };

  return {
    entities: E,
    STATUS, PAYTERM, CURRENCY,
    visible() {
      return Object.keys(E).filter(k => !E[k].hidden);
    },
    fieldList(key) {
      const e = E[key];
      return e ? Object.keys(e.fields).filter(f => !e.fields[f].hidden) : [];
    }
  };
})();
