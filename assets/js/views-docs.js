/* ============================================================
 * views-docs.js — 单据明细(工作流 + 行编辑器)+ 主数据画像
 * ============================================================ */
window.DOC = (function () {

  const r2 = UI.round2, esc = UI.esc, money = UI.money, num = UI.num, icon = UI.icon, dateCN = UI.dateCN;
  const $ = UI.$, $$ = UI.$$;

  /* ---------------- 单据配置 ---------------- */
  const CFG = {
    sales_order: {
      table: '销售订单', pk: 'no', docTable: 'so_lines',
      head: o => `${o.no}<span class="badge b-neutral" style="margin-left:8px">${esc((DB.find('customers', o.customer) || {}).name || o.customer_name || '')}</span>`,
      steps: ['draft', 'confirmed', 'delivery', 'invoice', 'receipt'],
      stepLabels: { draft: '创建订单', confirmed: '订单审核', delivery: '销售出库', invoice: '开具发票', receipt: '货款回收' },
      stepState(o) {
        const dl = DB.where('delivery', d => d.so === o.no).length;
        const iv = DB.where('invoice', i => i.so === o.no);
        const paid = iv.some(i => i.status === 'paid');
        return { draft: 1, confirmed: o.status !== 'draft' && o.status !== 'cancelled' ? 1 : 0, delivery: dl ? 1 : 0, invoice: iv.length ? 1 : 0, receipt: paid ? 1 : 0 };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') { a.push({ l: '审核订单', cls: 'primary', icon: 'check', run: 'confirm' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' }); }
        if (['confirmed', 'partial'].includes(o.status)) { a.push({ l: '创建出库单', cls: 'primary', icon: 'send', run: 'deliver' }, { l: '转开票', icon: 'receipt', run: 'invoice' }); }
        if (['confirmed', 'partial', 'draft'].includes(o.status)) a.push({ l: '取消订单', cls: 'danger-ghost', icon: 'close', run: 'cancel' });
        if (o.status === 'confirmed') a.push({ l: '反审核', icon: 'refresh', run: 'reopen' });
        if (o.status === 'cancelled' && !DB.where('delivery', d => d.so === o.no).length) a.push({ l: '反取消', icon: 'refresh', run: 'reopen' });
        if (o.status === 'done' && !DB.where('invoice', i => i.so === o.no).length) a.push({ l: '转开票', icon: 'receipt', run: 'invoice' });
        a.push({ l: '打印', icon: 'print', run: 'print' });
        return a;
      }
    },
    purchase_order: {
      table: '采购订单', pk: 'no', docTable: 'po_lines',
      steps: ['draft', 'confirmed', 'gr', 'bill', 'payment'],
      stepLabels: { draft: '创建订单', confirmed: '订单审核', gr: '采购收货', bill: '收到账单', payment: '支付货款' },
      stepState(o) {
        const gr = DB.where('gr', g => g.po === o.no);
        const bill = DB.where('bill', b => b.po === o.no);
        return { draft: 1, confirmed: o.status !== 'draft' && o.status !== 'cancelled' ? 1 : 0, gr: gr.length ? 1 : 0, bill: bill.length ? 1 : 0, payment: bill.some(b => b.status === 'paid') ? 1 : 0 };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '审核订单', cls: 'primary', icon: 'check', run: 'confirm' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (['confirmed', 'partial'].includes(o.status)) a.push({ l: '创建收货单', cls: 'success', icon: 'download', run: 'receive' });
        if (o.status === 'confirmed') a.push({ l: '反审核', icon: 'refresh', run: 'reopen' });
        if (o.status === 'cancelled') a.push({ l: '反取消', icon: 'refresh', run: 'reopen' });
        if (['confirmed', 'partial', 'draft'].includes(o.status)) a.push({ l: '取消订单', cls: 'danger-ghost', icon: 'close', run: 'cancel' });
        a.push({ l: '打印', icon: 'print', run: 'print' });
        return a;
      }
    },
    invoice: {
      table: '销售发票', pk: 'no', docTable: 'iv_lines',
      steps: ['issued', 'receipt'], stepLabels: { issued: '开票确认收入', receipt: '客户回款' },
      stepState(o) { return { issued: 1, receipt: o.status === 'paid' ? 1 : 0 }; },
      actions(o) {
        const a = [];
        if (o.balance > 0.01) a.push({ l: '登记收款', cls: 'primary', icon: 'wallet', run: 'receipt' });
        a.push({ l: '打印', icon: 'print', run: 'print' });
        return a;
      }
    },
    bill: {
      table: '采购账单', pk: 'no', docTable: 'bill_lines',
      steps: ['issued', 'payment'], stepLabels: { issued: '账单挂账', payment: '付款完成' },
      stepState(o) { return { issued: 1, payment: o.status === 'paid' ? 1 : 0 }; },
      actions(o) {
        const a = [];
        if (o.balance > 0.01) a.push({ l: '登记付款', cls: 'primary', icon: 'card', run: 'pay' });
        a.push({ l: '打印', icon: 'print', run: 'print' });
        return a;
      }
    },
    purchase_req: {
      table: '采购申请', pk: 'no', docTable: 'pr_lines',
      steps: ['draft', 'pending', 'approved', 'converted'], stepLabels: { draft: '提交申请', pending: '部门审核', approved: '审批通过', converted: '转采购订单' },
      stepState(o) { return { draft: 1, pending: o.status !== 'draft' ? 1 : 0, approved: ['approved', 'converted'].includes(o.status) ? 1 : 0, converted: o.status === 'converted' ? 1 : 0 }; },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '提交审批', cls: 'primary', icon: 'send', run: 'submit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (o.status === 'pending') a.push({ l: '审批通过', cls: 'success', icon: 'check', run: 'approve' }, { l: '驳回', cls: 'danger-ghost', icon: 'close', run: 'reject' });
        if (o.status === 'approved') a.push({ l: '转采购订单', cls: 'primary', icon: 'file', run: 'toPO' });
        return a;
      }
    },
    transfer: {
      table: '库存调拨单', pk: 'no', docTable: 'tr_lines', steps: ['draft', 'done'], stepLabels: { draft: '创建调拨', done: '过账完成' },
      stepState(o) { return { draft: 1, done: o.status === 'done' ? 1 : 0 }; },
      actions(o) { const a = []; if (o.status === 'draft') a.push({ l: '过账', cls: 'primary', icon: 'check', run: 'postTransfer' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' }); return a; }
    },
    stocktake: {
      table: '库存盘点单', pk: 'no', docTable: 'stk_lines', steps: ['draft', 'posted'], stepLabels: { draft: '录入盘点', posted: '差异过账' },
      stepState(o) { return { draft: 1, posted: o.status === 'posted' ? 1 : 0 }; },
      actions(o) { const a = []; if (o.status === 'draft') a.push({ l: '录入实盘数量', cls: 'primary', icon: 'edit', run: 'count' }); a.push({ l: '打印', icon: 'print', run: 'print' }); return a; }
    },
    delivery: {
      table: '销售出库单', pk: 'no', docTable: 'dl_lines', steps: ['posted'], stepLabels: { posted: '已过账' },
      stepState() { return { posted: 1 }; }, actions() { return [{ l: '打印拣货单', icon: 'print', run: 'print' }]; }
    },
    gr: { table: '采购收货单', pk: 'no', docTable: 'gr_lines', steps: ['posted', 'bill'], stepLabels: { posted: '收货暂估入账', bill: '票到清算' },
      stepState(o) { return { posted: 1, bill: DB.where('bill', b => b.gr === o.no).length ? 1 : 0 }; },
      actions(o) { const a = []; if (!DB.where('bill', b => b.gr === o.no).length) a.push({ l: '录入发票并清算', cls: 'primary', icon: 'receipt', run: 'toBill' }); a.push({ l: '打印', icon: 'print', run: 'print' }); return a; } },
    payment: { table: '付款单', pk: 'no', docTable: null, steps: ['posted'], stepLabels: { posted: '已过账' }, stepState() { return { posted: 1 }; }, actions() { return []; } },
    receipt: { table: '收款单', pk: 'no', docTable: null, steps: ['posted'], stepLabels: { posted: '已过账' }, stepState() { return { posted: 1 }; }, actions() { return []; } },
    journal: { table: '记账凭证', pk: 'no', docTable: 'journal_lines', isJournal: true, steps: ['posted'], stepLabels: { posted: '已过账' }, stepState() { return { posted: 1 }; }, actions() { return [{ l: '打印凭证', icon: 'print', run: 'print' }]; } },
    stock_movements: { table: '出入库流水', pk: 'no', docTable: null, steps: [], stepLabels: {}, stepState() { return {}; }, actions() { return []; } },

    /* ---------------- 产品管理:询价 / 发布 / 审批 ---------------- */
    rfq: {
      table: '询价单', pk: 'no', docTable: 'rfq_lines',
      steps: ['draft', 'sent', 'quoted', 'awarded'],
      stepLabels: { draft: '编制询价', sent: '发出邀请', quoted: '回收报价', awarded: '定标转采购' },
      stepState(o) {
        const lvl = { draft: 0, sent: 1, quoted: 2, awarded: 3, closed: 3 }[o.status] || 0;
        return { draft: 1, sent: lvl >= 1 ? 1 : 0, quoted: lvl >= 2 ? 1 : 0, awarded: lvl >= 3 ? 1 : 0 };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '发出询价', cls: 'primary', icon: 'send', run: 'rfqSend' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (o.status === 'sent') a.push({ l: '录入供应商报价', cls: 'primary', icon: 'edit', run: 'rfqQuote' }, { l: '关闭', cls: 'danger-ghost', icon: 'close', run: 'rfqClose' });
        if (o.status === 'quoted') a.push({ l: '定标生成采购订单', cls: 'primary', icon: 'check', run: 'rfqAward' }, { l: '修改报价', icon: 'edit', run: 'rfqQuote' }, { l: '关闭', cls: 'danger-ghost', icon: 'close', run: 'rfqClose' });
        if (o.status === 'awarded') a.push({ l: '查看成交采购单', icon: 'file', run: 'rfqPO' });
        a.push({ l: '打印比价表', icon: 'print', run: 'print' });
        return a;
      }
    },
    product_release: {
      table: '新品发布单', pk: 'no', docTable: null,
      steps: ['draft', 'pending', 'approved', 'published'],
      stepLabels: { draft: '立项编制', pending: '产品评审', approved: '审批通过', published: '建档上架' },
      stepState(o) {
        const lvl = { draft: 0, pending: 1, rejected: 1, approved: 2, published: 3, off_shelf: 3 }[o.status] || 0;
        return { draft: 1, pending: lvl >= 1 ? 1 : 0, approved: lvl >= 2 ? 1 : 0, published: lvl >= 3 ? 1 : 0 };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '提交评审', cls: 'primary', icon: 'send', run: 'relSubmit' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (o.status === 'pending') a.push({ l: '评审通过', cls: 'success', icon: 'check', run: 'relApprove' }, { l: '驳回', cls: 'danger-ghost', icon: 'close', run: 'relReject' });
        if (o.status === 'approved') a.push({ l: '建档并上架', cls: 'primary', icon: 'upload', run: 'relPublish' });
        if (o.status === 'published') a.push({ l: '查看商品主档', icon: 'eye', run: 'relProduct' }, { l: '下架', cls: 'danger-ghost', icon: 'close', run: 'relOff' });
        if (o.status === 'rejected') a.push({ l: '修改后重报', icon: 'edit', run: 'edit' });
        return a;
      }
    },
    approval: {
      table: '审批单', pk: 'no', docTable: null, steps: ['pending', 'done'],
      stepLabels: { pending: '待办审批', done: '已裁决' },
      stepState(o) { return { pending: o.status === 'pending' ? 1 : 0, done: o.status === 'pending' ? 0 : 1 }; },
      actions(o) {
        const a = [];
        if (o.status === 'pending') a.push({ l: '同意', cls: 'success', icon: 'check', run: 'apApprove' }, { l: '驳回', cls: 'danger-ghost', icon: 'close', run: 'apReject' });
        if (o.biz) a.push({ l: '查看业务单据', icon: 'eye', run: 'apJump' });
        return a;
      }
    },

    /* ---------------- 服务商管理:准入 / 外协商审核 / 委外 ---------------- */
    supplier_apply: {
      table: '供应商准入申请', pk: 'no', docTable: null,
      steps: ['draft', 'pending', 'inspecting', 'approved', 'archived'],
      stepLabels: { draft: '提交申请', pending: '资格初审', inspecting: '现场审核', approved: '评审核准', archived: '生成档案' },
      stepState(o) {
        const lvl = { draft: 0, rejected: 1, pending: 1, inspecting: 2, approved: 3, archived: 4 }[o.status] || 0;
        return { draft: 1, pending: lvl >= 1 ? 1 : 0, inspecting: lvl >= 2 ? 1 : 0, approved: lvl >= 3 ? 1 : 0, archived: lvl >= 4 ? 1 : 0 };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '提交准入评审', cls: 'primary', icon: 'send', run: 'saSubmit' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (o.status === 'pending') a.push({ l: '登记现场审核', cls: 'primary', icon: 'edit', run: 'saInspect' });
        if (['pending', 'inspecting'].includes(o.status)) a.push({ l: '评审通过', cls: 'success', icon: 'check', run: 'saApprove' }, { l: '否决', cls: 'danger-ghost', icon: 'close', run: 'saReject' });
        if (o.status === 'approved') a.push({ l: '生成供应商档案', cls: 'primary', icon: 'truck', run: 'saArchive' });
        if (o.status === 'archived') a.push({ l: '查看供应商', icon: 'eye', run: 'saSupplier' });
        return a;
      }
    },
    processor_audit: {
      table: '外协商审核单', pk: 'no', docTable: null,
      steps: ['draft', 'pending', 'inspecting', 'approved'],
      stepLabels: { draft: '编制审核', pending: '提交审核', inspecting: '打样与评分', approved: '核准发布' },
      stepState(o) {
        const lvl = { draft: 0, rejected: 1, pending: 1, inspecting: 2, approved: 3 }[o.status] || 0;
        return { draft: 1, pending: lvl >= 1 ? 1 : 0, inspecting: lvl >= 2 ? 1 : 0, approved: lvl >= 3 ? 1 : 0 };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '提交审核', cls: 'primary', icon: 'send', run: 'paSubmit' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (['pending', 'inspecting'].includes(o.status)) a.push({ l: '打样评分', cls: 'primary', icon: 'edit', run: 'paScore' });
        if (['pending', 'inspecting'].includes(o.status)) a.push({ l: '核准合作', cls: 'success', icon: 'check', run: 'paApprove' }, { l: '淘汰', cls: 'danger-ghost', icon: 'close', run: 'paReject' });
        if (o.status === 'approved') a.push({ l: '查看服务商', icon: 'eye', run: 'paProcessor' }, { l: '发起委外', icon: 'swap', run: 'paToOS' });
        a.push({ l: '打印审核表', icon: 'print', run: 'print' });
        return a;
      }
    },
    os_order: {
      table: '委外加工单', pk: 'no', docTable: 'os_lines',
      steps: ['draft', 'confirmed', 'issued', 'received', 'done'],
      stepLabels: { draft: '编制加工单', confirmed: '下发服务商', issued: '发料过账', received: '收回成品', done: '加工完成' },
      stepState(o) {
        return {
          draft: 1,
          confirmed: o.status !== 'draft' && o.status !== 'cancelled' ? 1 : 0,
          issued: (o.issued_amount || 0) > 0 ? 1 : 0,
          received: (o.received_qty || 0) > 0 ? 1 : 0,
          done: o.status === 'done' ? 1 : 0
        };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '审核下发', cls: 'primary', icon: 'check', run: 'osConfirm' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (['confirmed', 'issued', 'received'].includes(o.status) && (o.output_qty || 0) > (o.received_qty || 0)) a.push({ l: '委外发料', cls: 'primary', icon: 'send', run: 'osIssue' });
        if ((o.issued_amount || 0) > 0 && (o.output_qty || 0) > (o.received_qty || 0)) a.push({ l: '收回成品', cls: 'success', icon: 'download', run: 'osReceive' });
        if (['draft', 'confirmed'].includes(o.status)) a.push({ l: '取消', cls: 'danger-ghost', icon: 'close', run: 'osCancel' });
        if (o.status === 'done') a.push({ l: '查看加工费账单', icon: 'receipt', run: 'osBill' });
        a.push({ l: '打印加工单', icon: 'print', run: 'print' });
        return a;
      }
    },

    /* ---------------- 售后管理 ---------------- */
    rma: {
      table: '售后工单', pk: 'no', docTable: 'rma_lines',
      steps: ['draft', 'pending', 'approved', 'received', 'settled'],
      stepLabels: { draft: '受理客诉', pending: '售后审批', approved: '审批通过', received: '退货入库', settled: '退款/换货' },
      stepState(o) {
        return {
          draft: 1,
          pending: o.status !== 'draft' ? 1 : 0,
          approved: ['approved', 'received', 'refunded', 'exchanged', 'repairing', 'closed'].includes(o.status) ? 1 : 0,
          received: ['received', 'refunded', 'exchanged', 'closed', 'repairing'].includes(o.status) ? 1 : 0,
          settled: ['refunded', 'exchanged', 'closed'].includes(o.status) ? 1 : 0
        };
      },
      actions(o) {
        const a = [];
        if (o.status === 'draft') a.push({ l: '提交审批', cls: 'primary', icon: 'send', run: 'rmaSubmit' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (o.status === 'pending') a.push({ l: '同意处理', cls: 'success', icon: 'check', run: 'rmaApprove' }, { l: '驳回', cls: 'danger-ghost', icon: 'close', run: 'rmaReject' });
        if (o.status === 'approved') {
          if (o.type === 'repair') a.push({ l: '登记维修费用', cls: 'primary', icon: 'wallet', run: 'rmaRepair' });
          else a.push({ l: '退货入库', cls: 'primary', icon: 'download', run: 'rmaReceive' });
        }
        if (o.status === 'received' && !o.credit_invoice) a.push({ l: '开红字发票', cls: 'primary', icon: 'receipt', run: 'rmaCredit' });
        if (o.status === 'received' && o.credit_invoice) a.push({ l: '登记退款', cls: 'primary', icon: 'wallet', run: 'rmaRefund' });
        if (['refunded', 'exchanged', 'repairing'].includes(o.status)) a.push({ l: '关闭工单', cls: 'success', icon: 'check', run: 'rmaClose' });
        if (o.credit_invoice) a.push({ l: '查看红字发票', icon: 'eye', run: 'rmaInvoice' });
        a.push({ l: '打印工单', icon: 'print', run: 'print' });
        return a;
      }
    },
  };

  /* ---------------- 打开单据 ---------------- */
  function open(entity, no) {
    const row = DB.find(entity, no);
    if (!row) { UI.toast('记录不存在: ' + no, 'err'); return; }
    const cfg = CFG[entity];
    if (!cfg) { LIST.masterForm(entity, no); return; }
    const e = SCHEMA.entities[entity];
    const d = UI.drawer({
      head: `<div><div class="flex" style="gap:10px"><h3 style="font-size:17px" class="mono">${esc(no)}</h3>${badge(row.status, entity === 'bill' ? 'ap' : '')}</div>
             <div class="muted small" style="margin-top:3px">${esc(cfg.table)} · ${esc(e.table)}</div></div>`,
      body: `<div id="doc-body">${docBody(entity, row)}</div>`,
      foot: cfg.actions(row).map((a, i) => {
        const need = ACT_PERM[a.run] || 'view';
        const allow = need === 'view' || ACT.PERM.can(entity, need);
        return `<button class="btn ${a.cls || ''}" data-doc-act="${i}"${allow ? '' : ` disabled title="当前角色无${SCHEMA.entities[entity].label}的${need === 'approve' ? '审批' : '执行'}权限"`}>${icon(a.icon || 'eye')}${esc(a.l)}</button>`;
      }).join('') + `<div class="right"><button class="btn" data-close>关闭</button></div>`
    });
    bindDoc(d, entity, no, cfg);
  }
  function badge(v, kind) { return UI.badge(v, kind); }

  function docBody(entity, row) {
    const cfg = CFG[entity], e = SCHEMA.entities[entity];
    const parts = [];

    if (cfg.steps && cfg.steps.length > 1) parts.push(workflowHTML(row, cfg));

    /* 基本信息 */
    const showKeys = Object.keys(e.fields).filter(k => !['status', 'total', 'paid', 'balance', 'note'].includes(k) && !e.fields[k].hidden);
    const amounts = Object.keys(e.fields).filter(k => e.fields[k].sum);
    parts.push(`<div class="card"><div class="card-head"><h3>${icon('file')}单据信息</h3></div><div class="card-body">
      ${UI.descs(showKeys.map(k => [e.fields[k].l, fieldText(entity, k, row, e.fields[k])]))}
      ${row.note ? `<div class="notice" style="margin-top:14px">${icon('info')}<div><b>备注</b> ${esc(row.note)}</div></div>` : ''}
    </div></div>`);

    /* 金额区 */
    if (amounts.length) {
      const statMap = { total: '价税合计', amount: '单据金额', paid: '已结算', balance: '未结余额', debit: '借方合计', qty: '数量', value: '金额', diff_amount: '差异金额' };
      parts.push(`<div class="card"><div class="card-head"><h3>${icon('wallet')}金额信息</h3>${entity === 'invoice' || entity === 'bill' ? `<div class="right"><span class="muted small">到期日 ${dateCN(row.due_date)}</span>${row.due_date < DB.today() && row.balance > 0 ? `<span class="badge b-danger">逾期 ${Math.max(0, UI.days(row.due_date, DB.today()))} 天</span>` : ''}</div>` : ''}</div>
        <div class="card-body"><div class="stat-row">${amounts.map(k => `<div>${esc(statMap[k] || e.fields[k].l)}<b>¥${money(row[k])}</b></div>`).join('')}
        ${entity === 'bill' || entity === 'invoice' ? `<div>结算进度<b>${(row.total ? (row.paid / row.total * 100) : 0).toFixed(1)}%</b></div>` : ''}</div>
        ${entity === 'bill' || entity === 'invoice' ? `<div class="progress mt12" style="height:8px"><i class="${row.balance <= 0 ? 'ok' : row.due_date < DB.today() ? 'bad' : ''}" style="width:${(row.total ? row.paid / row.total * 100 : 0).toFixed(1)}%"></i></div>` : ''}</div></div>`);
    }

    /* 明细行 */
    if (cfg.docTable) parts.push(linesCard(entity, row, cfg));

    /* 关联单据 */
    const rel = related(entity, row);
    if (rel.length) parts.push(`<div class="card"><div class="card-head"><h3>${icon('link')}关联单据</h3><span class="sub">上下游单据追踪(End-to-End Traceability)</span></div>
      <div class="card-body"><div class="grid g2">${rel.map(g => `<div><div class="section-title">${esc(g.title)}</div>
        ${g.rows.length ? g.rows.map(r => {
          const ent = SCHEMA.entities[g.entity]; const key = ent ? ent.pk : 'no';
          const val = r[key] !== undefined && r[key] !== null && r[key] !== '' ? r[key] : (r.no || r.id || '');
          return `<div class="flex" style="padding:7px 0;border-bottom:1px dashed var(--border)">
          <span class="cell-link mono" data-jump="${g.entity}=${encodeURIComponent(val)}">${esc(val)}</span>
          <span class="grow muted small">${esc(g.label(r))}</span>${badge(r.status, g.entity === 'bill' ? 'ap' : '')}</div>`;
        }).join('') : `<div class="muted small">暂无</div>`}
      </div>`).join('')}</div></div></div>`);

    /* 凭证 */
    const jes = DB.where('journal', j => j.ref === row[SCHEMA.entities[entity].pk]);
    if (jes.length && !cfg.isJournal) parts.push(`<div class="card"><div class="card-head"><h3>${icon('book')}自动生成凭证</h3></div>
      ${jes.map(j => `<div class="toolbar" style="border-bottom:1px solid var(--border)">
        <span class="mono cell-link" data-jump="journal=${encodeURIComponent(j.no)}">${esc(j.no)}</span>
        <span class="small muted">${dateCN(j.date)} · ${esc(SCHEMA.entities.journal.fields.type.opts[j.type] || j.type)}</span>
        <span class="grow small">${esc(j.memo)}</span><span class="money strong">¥${money(j.debit)}</span></div>`).join('')}</div>`);

    return parts.join('');
  }

  function fieldText(entity, key, row, f) {
    if (f.t === 'ref') return UI.cellRef(f.ref, row[key]);
    if (f.t === 'money') return `<span class="money">¥${money(row[key])}</span>`;
    if (f.t === 'int') return num(row[key]);
    if (f.t === 'percent') { const v = +row[key] || 0; return (v <= 1 ? v * 100 : v).toFixed(1) + '%'; }
    if (f.t === 'date') return dateCN(row[key]);
    if (f.t === 'datetime') return esc(row[key] || '');
    if (f.t === 'select') {
      const v = row[key];
      if (f.badge) return UI.badge(v, entity === 'bill' ? 'ap' : '');
      const o = f.opts && (typeof f.opts === 'function' ? f.opts() : f.opts)[v];
      if (o === undefined || o === null || o === 1 || o === true || typeof o === 'object') return esc((SCHEMA.STATUS[v] || {}).l || v || '');
      return esc(o);
    }
    return esc(row[key] || '');
  }

  function workflowHTML(row, cfg) {
    const state = cfg.stepState(row);
    let idx = 0; cfg.steps.forEach(s => { if (state[s]) idx++; });
    return `<div class="card"><div class="card-head"><h3>${icon('layers')}单据流转进度</h3><span class="sub">${idx}/${cfg.steps.length} 环节完成</span></div>
      <div class="card-body"><div class="grid" style="grid-template-columns:repeat(${cfg.steps.length},minmax(0,1fr));gap:8px">
      ${cfg.steps.map((s, i) => `<div style="text-align:center;padding:10px 6px;border-radius:10px;background:${state[s] ? 'var(--primary-50)' : 'var(--surface-2)'};border:1px solid ${state[s] ? 'var(--primary-100)' : 'var(--border)'}">
        <div style="width:24px;height:24px;border-radius:50%;margin:0 auto 7px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:${state[s] ? 'var(--primary)' : '#CBD2DF'}">${state[s] ? '✓' : i + 1}</div>
        <div style="font-size:12px;font-weight:600;color:${state[s] ? 'var(--primary-600)' : 'var(--text-3)'}">${esc(cfg.stepLabels[s])}</div></div>`).join('')}
      </div></div></div>`;
  }

  /* 各明细子表的列定义(缺省走通用物料行) */
  const DOC_COLS = {
    rfq_lines: [{ k: 'lineno', label: '#' }, { k: 'product', label: '物料编码' }, { k: 'product_name', label: '商品名称' },
      { k: 'supplier', label: '报价供应商', ref: 'suppliers' }, { k: 'qty', label: '询价数量', right: 1 },
      { k: 'base_price', label: '目标成本', right: 1 }, { k: 'price', label: '报价单价', right: 1 },
      { k: 'amount', label: '报价金额', right: 1 }, { k: 'lead_time', label: '交付(天)', right: 1 },
      { k: 'awarded', label: '定标', render: v => v === 'y' ? '<span class="badge b-purple">中标</span>' : '<span class="muted small">—</span>' }],
    os_lines: [{ k: 'lineno', label: '#' }, { k: 'product', label: '发料物料' }, { k: 'product_name', label: '物料名称' },
      { k: 'qty', label: '计划发料', right: 1 }, { k: 'issued', label: '已发料', right: 1 },
      { k: 'price', label: '单位成本', right: 1 }, { k: 'amount', label: '材料金额', right: 1 }, { k: 'memo', label: '用途' }],
    rma_lines: [{ k: 'lineno', label: '#' }, { k: 'product', label: '物料编码' }, { k: 'product_name', label: '商品名称' },
      { k: 'qty', label: '数量', right: 1 }, { k: 'price', label: '原单价', right: 1 }, { k: 'tax_rate', label: '税率', right: 1 },
      { k: 'amount', label: '金额', right: 1 }, { k: 'memo', label: '问题描述' }],
  };
  const NUM_KEYS = ['qty', 'lineno', 'book_qty', 'actual_qty', 'diff', 'delivered', 'received', 'issued', 'returned', 'lead_time'];

  function linesCard(entity, row, cfg) {
    const lines = cfg.isJournal ? DB.list('journal_lines').filter(l => l.doc === row.no) : DB.lines(cfg.docTable, row.no);
    if (!lines.length) return '';
    const cols = cfg.isJournal
      ? [{ k: 'account', label: '科目' }, { k: 'account_name', label: '科目名称' }, { k: 'memo', label: '摘要' }, { k: 'debit', label: '借方', right: 1 }, { k: 'credit', label: '贷方', right: 1 }]
      : DOC_COLS[cfg.docTable] || (cfg.docTable === 'stk_lines'
        ? [{ k: 'product', label: '编码' }, { k: 'product_name', label: '商品' }, { k: 'book_qty', label: '账面', right: 1 }, { k: 'actual_qty', label: '实盘', right: 1 }, { k: 'diff', label: '差异', right: 1 }, { k: 'cost', label: '单位成本', right: 1 }, { k: 'diff_amount', label: '差异金额', right: 1 }]
        : [{ k: 'lineno', label: '#' }, { k: 'product', label: '物料编码' }, { k: 'product_name', label: '商品名称' }, { k: 'qty', label: '数量', right: 1 }]
          .concat(cfg.docTable === 'so_lines' ? [{ k: 'delivered', label: '已出库', right: 1 }] : [])
          .concat(cfg.docTable === 'po_lines' || cfg.docTable === 'gr_lines' ? [{ k: 'received', label: '已收货', right: 1 }] : [])
          .concat([{ k: 'price', label: '单价', right: 1 }, { k: 'discount', label: '折扣', right: 1 }, { k: 'tax_rate', label: '税率', right: 1 }, { k: 'amount', label: '金额', right: 1 }]));
    const total = cols.filter(c => c.right).reduce((m, c) => m + lines.reduce((s, l) => s + (+l[c.k] || 0), 0), 0);
    const sumKeys = cols.filter(c => c.right && ['amount', 'debit', 'credit', 'diff_amount'].indexOf(c.k) >= 0);
    return `<div class="card"><div class="card-head"><h3>${icon('grid')}明细行</h3><span class="sub">${lines.length} 行</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c.right ? 'right' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${lines.map(l => `<tr>${cols.map(c => {
        const v = l[c.k];
        if (c.render) return `<td class="${c.right ? 'right' : ''}">${c.render(v, l)}</td>`;
        if (c.right) return `<td class="right money">${c.k === 'tax_rate' ? (v || 0) + '%' : c.k === 'discount' ? (v ? (v * 100).toFixed(0) + '%' : '—') : NUM_KEYS.indexOf(c.k) >= 0 ? num(v) : money(v)}</td>`;
        if (c.ref) return `<td>${UI.cellRef(c.ref, v)}</td>`;
        if (c.k === 'product') return `<td class="mono">${UI.cellRef('products', v)}</td>`;
        return `<td>${esc(v === undefined || v === null ? '' : v)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
      ${sumKeys.length ? `<div class="lines-sum">${sumKeys.map(c => { const s = lines.reduce((x, l) => x + (+l[c.k] || 0), 0); return `<span>${esc(c.label)} <b>¥${money(s)}</b></span>`; }).join('')}</div>` : ''}</div>`;
  }

  /* 审批单 module → 业务实体 */
  const BIZ_ENTITY = {
    product_release: 'product_release', supplier_apply: 'supplier_apply', processor_audit: 'processor_audit',
    purchase_req: 'purchase_req', rma: 'rma', os_order: 'os_order', so_change: 'sales_order',
    price_change: 'products', stock_adjust: 'stocktake'
  };

  function related(entity, row) {
    const out = [];
    const pk = SCHEMA.entities[entity].pk;
    const map = {
      sales_order: [
        { title: '销售出库单', entity: 'delivery', rows: DB.where('delivery', d => d.so === row[pk]), label: d => `出库成本 ¥${money(d.amount)} · ${d.carrier}` },
        { title: '销售发票', entity: 'invoice', rows: DB.where('invoice', i => i.so === row[pk]), label: i => `应收 ¥${money(i.total)} · 已收 ¥${money(i.paid)}` },
      ],
      purchase_order: [
        { title: '采购收货单', entity: 'gr', rows: DB.where('gr', g => g.po === row[pk]), label: g => `入库 ¥${money(g.amount)}` },
        { title: '采购账单', entity: 'bill', rows: DB.where('bill', b => b.po === row[pk]), label: b => `应付 ¥${money(b.total)} · 未付 ¥${money(b.balance)}` },
        { title: '来源申请', entity: 'purchase_req', rows: row.pr ? [DB.find('purchase_req', row.pr)].filter(Boolean) : [], label: p => p.reason },
      ],
      invoice: [{ title: '收款记录', entity: 'receipt', rows: DB.where('receipt', r => r.invoice === row[pk]), label: r => `${r.method} ¥${money(r.amount)}` },
        { title: '来源订单', entity: 'sales_order', rows: row.so ? [DB.find('sales_order', row.so)].filter(Boolean) : [], label: o => `订单金额 ¥${money(o.total)}` }],
      bill: [{ title: '付款记录', entity: 'payment', rows: DB.where('payment', p => p.bill === row[pk]), label: p => `${p.method} ¥${money(p.amount)}` },
        { title: '来源收货单', entity: 'gr', rows: row.gr ? [DB.find('gr', row.gr)].filter(Boolean) : [], label: g => `入库 ¥${money(g.amount)}` }],
      delivery: [{ title: '来源订单', entity: 'sales_order', rows: row.so ? [DB.find('sales_order', row.so)].filter(Boolean) : [], label: o => `订单 ¥${money(o.total)}` },
        { title: '出库流水', entity: 'stock_movements', rows: DB.where('stock_movements', m => m.ref === row[pk]), label: m => `${m.product_name} ${m.qty}` }],
      gr: [{ title: '来源订单', entity: 'purchase_order', rows: row.po ? [DB.find('purchase_order', row.po)].filter(Boolean) : [], label: o => `订单 ¥${money(o.total)}` },
        { title: '采购账单', entity: 'bill', rows: DB.where('bill', b => b.gr === row[pk]), label: b => `应付 ¥${money(b.total)}` }],
      purchase_req: [{ title: '转化采购订单', entity: 'purchase_order', rows: DB.where('purchase_order', p => p.pr === row[pk]), label: p => `订单 ¥${money(p.total)}` }],
      receipt: [{ title: '核销发票', entity: 'invoice', rows: row.invoice ? [DB.find('invoice', row.invoice)].filter(Boolean) : [], label: i => `余额 ¥${money(i.balance)}` }],
      payment: [{ title: '核销账单', entity: 'bill', rows: row.bill ? [DB.find('bill', row.bill)].filter(Boolean) : [], label: b => `余额 ¥${money(b.balance)}` }],
      stock_movements: [],
      rfq: [
        { title: '定标生成的采购订单', entity: 'purchase_order', rows: DB.where('purchase_order', p => p.rfq === row[pk]), label: p => `${p.supplier_name} · ¥${money(p.total)}` },
      ],
      product_release: [
        { title: '审批单', entity: 'approval', rows: row.approval ? [DB.find('approval', row.approval)].filter(Boolean) : [], label: a => `${a.title} · ${a.approver || '待审批'}` },
        { title: '生成的商品主档', entity: 'products', rows: row.product ? [DB.find('products', row.product)].filter(Boolean) : [], label: p => `售价 ¥${money(p.price)} · 状态 ${p.status}` },
      ],
      approval: [
        { title: '业务单据', entity: BIZ_ENTITY[row.module] || '', rows: row.biz && BIZ_ENTITY[row.module] ? [DB.find(BIZ_ENTITY[row.module], row.biz)].filter(Boolean) : [], label: r => r.title || r.reason || r.name || r.memo || row.title },
      ],
      supplier_apply: [
        { title: '准入审批单', entity: 'approval', rows: row.approval ? [DB.find('approval', row.approval)].filter(Boolean) : [], label: a => `${a.approver || '待审批'} · ${a.opinion || ''}` },
        { title: '生成的供应商档案', entity: 'suppliers', rows: row.supplier ? [DB.find('suppliers', row.supplier)].filter(Boolean) : [], label: s => `评分 ${s.rating} · ${s.payment_terms}` },
      ],
      processor_audit: [
        { title: '审批单', entity: 'approval', rows: row.approval ? [DB.find('approval', row.approval)].filter(Boolean) : [], label: a => `${a.approver || '待审批'} · ${a.opinion || ''}` },
        { title: '关联委外单', entity: 'os_order', rows: DB.where('os_order', o => o.processor === row.processor), label: o => `${o.processor_name} · ${o.received_qty || 0}/${o.output_qty} 件` },
      ],
      os_order: [
        { title: '加工费账单', entity: 'bill', rows: DB.where('bill', b => b.os === row[pk]), label: b => `应付 ¥${money(b.total)} · 未付 ¥${money(b.balance)}` },
        { title: '付款记录', entity: 'payment', rows: DB.where('payment', p => DB.where('bill', b => b.os === row[pk]).some(b => b.no === p.bill)), label: p => `${p.method} ¥${money(p.amount)}` },
        { title: '委外出入库流水', entity: 'stock_movements', rows: DB.where('stock_movements', m => m.ref === row[pk]), label: m => `${SCHEMA.entities.stock_movements.fields.type.opts[m.type] || m.type} ${m.product_name} ${m.qty}` },
      ],
      rma: [
        { title: '审批单', entity: 'approval', rows: row.approval ? [DB.find('approval', row.approval)].filter(Boolean) : [], label: a => `${a.approver || '待审批'} · ${a.opinion || ''}` },
        { title: '红字发票', entity: 'invoice', rows: row.credit_invoice ? [DB.find('invoice', row.credit_invoice)].filter(Boolean) : [], label: i => `冲减应收 ¥${money(-i.balance)}` },
        { title: '退款单', entity: 'receipt', rows: DB.where('receipt', r => r.invoice === row.credit_invoice), label: r => `${r.method} ¥${money(-r.amount)}` },
        { title: '来源订单', entity: 'sales_order', rows: row.so ? [DB.find('sales_order', row.so)].filter(Boolean) : [], label: o => `订单 ¥${money(o.total)}` },
        { title: '售后出入库流水', entity: 'stock_movements', rows: DB.where('stock_movements', m => m.ref === row[pk]), label: m => `${SCHEMA.entities.stock_movements.fields.type.opts[m.type] || m.type} ${m.product_name} ${m.qty}` },
      ],
    };
    (map[entity] || []).forEach(g => { if (g.rows && g.rows.length) out.push({ title: g.title, entity: g.entity, rows: g.rows, label: g.label }); });
    if (entity === 'journal') {
      const j = DB.find('journal', row.no);
      if (j && j.ref) {
        const tgt = [['sales_invoice', 'invoice'], ['sales_receipt', 'receipt'], ['sales_delivery', 'delivery'], ['ap_bill', 'bill'], ['ap_payment', 'payment'], ['stock_adjust', 'stocktake'],
          ['os_issue', 'os_order'], ['os_receive', 'os_order'], ['rma_return', 'rma'], ['rma_credit', 'invoice'], ['rma_refund', 'receipt'], ['rma_repair', 'rma']]
          .find(t => t[0] === j.type);
        if (tgt && DB.find(tgt[1], j.ref)) out.push({ title: '原始单据', entity: tgt[1], rows: [DB.find(tgt[1], j.ref)], label: () => '点击查看原始业务单据' });
      }
    }
    return out;
  }

  /* ---------------- 动作分发 ---------------- */
  function bindDoc(d, entity, no, cfg) {
    const rerender = () => {
      const row = DB.find(entity, no);
      if (!row) { d.close(); APP.refresh(); return; }
      d.body.innerHTML = docBody(entity, row);
      d.el.querySelector('.drawer-foot').innerHTML = cfg.actions(row).map((a, i) => `<button class="btn ${a.cls || ''}" data-doc-act="${i}">${icon(a.icon || 'eye')}${esc(a.l)}</button>`).join('') + '<div class="right"><button class="btn" data-close>关闭</button></div>';
      bindDoc(d, entity, no, cfg);
      APP.refresh(null, true);
    };
    UI.$('[data-jump]', d.body);
    d.el.querySelectorAll('[data-jump]').forEach(el => el.addEventListener('click', () => {
      const [ent, id] = el.dataset.jump.split('=');
      d.close(); open(ent, decodeURIComponent(id));
    }));
    d.el.querySelectorAll('[data-doc-act]').forEach(b => b.addEventListener('click', () => {
      const a = cfg.actions(DB.find(entity, no))[+b.dataset.docAct];
      run(a.run, entity, no, rerender, d);
    }));
    d.el.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); const [e2, id] = el.dataset.open.split('='); open(e2, decodeURIComponent(id)); }));
  }

  /* 动作所需权限(缺省 view;审批类=approve,写操作类=edit) */
  const ACT_PERM = {
    confirm: 'approve', reopen: 'approve', approve: 'approve', reject: 'approve', toPO: 'approve', delete: 'edit', edit: 'edit',
    deliver: 'edit', receive: 'edit', invoice: 'edit', pay: 'edit', receipt: 'edit', toBill: 'edit', submit: 'edit',
    postTransfer: 'edit', count: 'edit', cancel: 'edit',
    rfqSend: 'edit', rfqQuote: 'edit', rfqAward: 'approve', rfqClose: 'edit',
    relSubmit: 'edit', relApprove: 'approve', relReject: 'approve', relPublish: 'edit', relOff: 'edit',
    apApprove: 'approve', apReject: 'approve',
    saSubmit: 'edit', saInspect: 'edit', saApprove: 'approve', saReject: 'approve', saArchive: 'edit',
    paSubmit: 'edit', paScore: 'edit', paApprove: 'approve', paReject: 'approve', paToOS: 'edit',
    osConfirm: 'approve', osIssue: 'edit', osReceive: 'edit', osCancel: 'edit',
    rmaSubmit: 'edit', rmaApprove: 'approve', rmaReject: 'approve', rmaReceive: 'edit', rmaCredit: 'edit', rmaRefund: 'edit', rmaRepair: 'edit', rmaClose: 'edit',
  };

  function run(action, entity, no, rerender, d) {
    const wrap = fn => { try { fn(); } catch (e) { UI.toast(e.message || '操作失败', 'err'); return; } };
    const row = DB.find(entity, no);
    const need = ACT_PERM[action] || 'view';
    if (need !== 'view' && !ACT.PERM.can(entity, need)) {
      UI.toast(`当前用户「${DB.currentUser()}」的角色无${SCHEMA.entities[entity].label}的${need === 'approve' ? '审批' : '执行'}权限`, 'err');
      return;
    }
    switch (action) {
      case 'confirm': wrap(() => { const r = entity === 'sales_order' ? ACT.confirmSO(no) : ACT.confirmPO(no); if (r && r.shortage) UI.toast(`已审核,但 ${r.shortage} 行库存不足`, 'warn'); else UI.toast('审核通过,单据已生效'); }); rerender(); break;
      case 'cancel': UI.confirm(`确认取消单据 <b class="mono">${esc(no)}</b>?取消后库存占用将被释放。`, { danger: true, ok: '确认取消' }).then(yes => { if (!yes) return; wrap(() => entity === 'sales_order' ? ACT.cancelSO(no) : ACT.cancelPO(no)); UI.toast('单据已取消'); rerender(); }); break;
      case 'delete': UI.confirm(`删除草稿单据 <b class="mono">${esc(no)}</b>?该操作不可恢复。`, { danger: true, ok: '删除' }).then(yes => { if (!yes) return; DB.remove(entity, no); UI.toast('已删除'); d.close(); APP.refresh(); }); break;
      case 'reopen': wrap(() => entity === 'purchase_order' ? ACT.reopenPO(no) : ACT.reopenSO(no)); UI.toast('已反审核,单据回到草稿'); rerender(); break;
      case 'edit': openEditor(entity, no, rerender); break;
      case 'deliver': openQtyModal(entity, no, 'deliver', rerender); break;
      case 'receive': openQtyModal(entity, no, 'receive', rerender); break;
      case 'invoice': openQtyModal(entity, no, 'invoice', rerender); break;
      case 'toBill': openIRModal(no, rerender); break;
      case 'pay': openMoneyModal('bill', no, rerender); break;
      case 'receipt': openMoneyModal('invoice', no, rerender); break;
      case 'submit': wrap(() => { row.status = 'pending'; DB.upsert('purchase_req', row); DB.log('采购管理', '提交采购申请', no, ''); UI.toast('已提交审批'); }); rerender(); break;
      case 'approve': openApprove(no, true, rerender); break;
      case 'reject': openApprove(no, false, rerender); break;
      case 'toPO': wrap(() => { const po = ACT.prToPO(no); UI.toast('已生成采购订单 ' + po); d.close(); open('purchase_order', po); }); break;
      case 'postTransfer': wrap(() => {
        const lines = DB.lines('tr_lines', no);
        if (!lines.length) throw new Error('调拨行为空');
        lines.forEach(l => { if (ACT.available(l.product, row.from_wh) < l.qty) throw new Error(`${l.product_name} 调出仓可用量不足`); });
        lines.forEach((l, i) => { const p = DB.find('products', l.product) || {}; ACT.move(l.product, row.from_wh, -l.qty, p.cost, 'transfer', no, '调拨出库', row.to_wh); ACT.move(l.product, row.to_wh, l.qty, p.cost, 'transfer', no, '调拨入库', row.from_wh); recomputeAll([l.product]); });
        row.status = 'done'; row.user = DB.currentUser(); DB.upsert('transfer', row); DB.log('库存管理', '过账库存调拨单', no, `${lines.length} 行`); UI.toast('调拨已过账');
      }); rerender(); break;
      case 'count': openStocktake(no, rerender, d); break;

      /* ---------------- 询价比价 ---------------- */
      case 'rfqSend': wrap(() => { const n = ACT.sendRFQ(no); UI.toast(`已发出询价,生成 ${n} 行待报价`); }); rerender(); break;
      case 'rfqQuote': openRFQQuote(no, rerender); break;
      case 'rfqAward': UI.confirm(`确认按 <b>最低报价</b> 定标并生成采购订单?<br><span class="muted small">同一供应商的物料会合并为一张草稿采购单,需再次审核后下发。</span>`, { ok: '确认定标' }).then(yes => {
        if (!yes) return;
        wrap(() => { const list = ACT.awardRFQ(no); UI.toast('已生成采购订单 ' + list.join('、')); d.close(); open('purchase_order', list[0]); });
      }); break;
      case 'rfqClose': wrap(() => { ACT.closeRFQ(no); UI.toast('询价单已关闭'); }); rerender(); break;
      case 'rfqPO': { const first = (row.ref_po || '').split(' / ')[0]; if (first) { d.close(); open('purchase_order', first); } break; }

      /* ---------------- 新品发布 ---------------- */
      case 'relSubmit': wrap(() => { ACT.submitRelease(no); UI.toast('已提交产品评审,进入审批中心'); }); rerender(); break;
      case 'relApprove': openOpinion('新品评审 · ' + no, true, txt => { wrap(() => { ACT.decideRelease(no, true, txt); UI.toast('评审通过,可建档上架'); }); rerender(); }); break;
      case 'relReject': openOpinion('新品评审 · ' + no, false, txt => { wrap(() => { ACT.decideRelease(no, false, txt); UI.toast('已驳回'); }); rerender(); }); break;
      case 'relPublish': wrap(() => { const code = ACT.publishRelease(no); UI.toast('商品建档并上架:' + code); d.close(); APP.refresh(); open('products', code); }); break;
      case 'relOff': wrap(() => { ACT.offShelfRelease(no); UI.toast('商品已下架'); }); rerender(); break;
      case 'relProduct': if (row.product) { d.close(); open('products', row.product); } break;

      /* ---------------- 审批中心 ---------------- */
      case 'apApprove': openOpinion('审批 · ' + no, true, txt => { wrap(() => { ACT.decideApproval(no, true, txt); UI.toast('审批通过,业务单据已联动'); }); rerender(); }); break;
      case 'apReject': openOpinion('审批 · ' + no, false, txt => { wrap(() => { ACT.decideApproval(no, false, txt); UI.toast('已驳回'); }); rerender(); }); break;
      case 'apJump': { const ent = BIZ_ENTITY[row.module]; if (ent) { d.close(); open(ent, row.biz); } break; }

      /* ---------------- 供应商准入 ---------------- */
      case 'saSubmit': wrap(() => { ACT.submitApply(no); UI.toast('已提交准入评审'); }); rerender(); break;
      case 'saInspect': openScoreModal('supplier_apply', no, rerender); break;
      case 'saApprove': openOpinion('准入评审 · ' + no, true, txt => { wrap(() => { ACT.decideApply(no, true, txt); UI.toast('评审通过,可生成供应商档案'); }); rerender(); }); break;
      case 'saReject': openOpinion('准入评审 · ' + no, false, txt => { wrap(() => { ACT.decideApply(no, false, txt); UI.toast('已否决'); }); rerender(); }); break;
      case 'saArchive': wrap(() => { const code = ACT.archiveApply(no); UI.toast('供应商建档完成:' + code); d.close(); APP.refresh(); open('suppliers', code); }); break;
      case 'saSupplier': if (row.supplier) { d.close(); open('suppliers', row.supplier); } break;

      /* ---------------- 外协商审核 ---------------- */
      case 'paSubmit': wrap(() => { ACT.submitAudit(no); UI.toast('已提交外协商审核'); }); rerender(); break;
      case 'paScore': openScoreModal('processor_audit', no, rerender); break;
      case 'paApprove': openOpinion('外协商核准 · ' + no, true, txt => { wrap(() => { ACT.decideAudit(no, true, txt); UI.toast('已核准,服务商资质与费率已更新'); }); rerender(); }); break;
      case 'paReject': openOpinion('外协商核准 · ' + no, false, txt => { wrap(() => { ACT.decideAudit(no, false, txt); UI.toast('已淘汰'); }); rerender(); }); break;
      case 'paProcessor': if (row.processor) { d.close(); open('processors', row.processor); } break;
      case 'paToOS': d.close(); newDoc('os_order', { processor: row.processor, processor_name: row.processor_name, process_type: row.process_type, unit_fee: row.unit_rate }); break;

      /* ---------------- 委外加工 ---------------- */
      case 'osConfirm': wrap(() => { ACT.confirmOS(no); UI.toast('加工单已下发服务商'); }); rerender(); break;
      case 'osIssue': openIssueModal(no, rerender); break;
      case 'osReceive': openReceiveModal(no, rerender); break;
      case 'osCancel': UI.confirm(`确认取消委外加工单 <b class="mono">${esc(no)}</b>?`, { danger: true, ok: '确认取消' }).then(yes => { if (!yes) return; wrap(() => ACT.cancelOS(no)); UI.toast('加工单已取消'); rerender(); }); break;
      case 'osBill': if (row.bill) { d.close(); open('bill', row.bill); } break;

      /* ---------------- 售后管理 ---------------- */
      case 'rmaSubmit': wrap(() => { ACT.submitRMA(no); UI.toast('已提交售后审批'); }); rerender(); break;
      case 'rmaApprove': openOpinion('售后审批 · ' + no, true, txt => { wrap(() => { ACT.decideRMA(no, true, txt); UI.toast('已同意处理'); }); rerender(); }); break;
      case 'rmaReject': openOpinion('售后审批 · ' + no, false, txt => { wrap(() => { ACT.decideRMA(no, false, txt); UI.toast('工单已驳回'); }); rerender(); }); break;
      case 'rmaReceive': wrap(() => { const c = ACT.receiveRMA(no); UI.toast(`退货入库过账,冲回成本 ¥${money(c)}`); }); rerender(); break;
      case 'rmaCredit': UI.confirm(`确认开具红字发票并冲减收入与应收?`, { ok: '确认开票' }).then(yes => { if (!yes) return; wrap(() => { const iv = ACT.creditRMA(no); UI.toast('红字发票 ' + iv); d.close(); open('invoice', iv); }); }); break;
      case 'rmaRefund': openRefundModal(no, rerender); break;
      case 'rmaRepair': openRepairModal(no, rerender); break;
      case 'rmaClose': wrap(() => { ACT.closeRMA(no); UI.toast('售后工单已关闭'); }); rerender(); break;
      case 'rmaInvoice': if (row.credit_invoice) { d.close(); open('invoice', row.credit_invoice); } break;

      case 'print': printDoc(entity, no); break;
      default: UI.toast('暂不支持的操作: ' + action, 'warn');
    }
  }
  function recomputeAll(products) { products.forEach(p => ACT.recomputeReserved(p)); }

  /* ---------------- 数量录入弹窗(出库/收货/开票) ---------------- */
  function openQtyModal(entity, no, kind, rerender) {
    const srcLines = DB.lines(entity === 'sales_order' ? 'so_lines' : 'po_lines', no);
    const row = DB.find(entity, no);
    const isInvoice = kind === 'invoice';
    const meta = { deliver: { title: '创建销售出库单', ok: '过账出库', doc: 'delivery', table: '销售出库单' },
      receive: { title: '创建采购收货单', ok: '过账收货', doc: 'gr', table: '采购收货单' },
      invoice: { title: '按订单开具销售发票', ok: '开票并确认收入', doc: 'invoice', table: '销售发票' } }[kind];
    const rowsData = srcLines.map(l => {
      const remain = isInvoice ? (l.delivered || l.qty) : (l.qty - (kind === 'deliver' ? (l.delivered || 0) : (l.received || 0)));
      const p = DB.find('products', l.product) || {};
      const stock = kind === 'deliver' ? ACT.available(l.product, row.warehouse) : null;
      return { product: l.product, product_name: p.name || l.product_name, code: l.product, remain: Math.max(0, remain), qty: Math.max(0, remain), price: l.price, stock, tax: p.tax_rate };
    });
    const extra = kind === 'deliver' ? `<div class="form-grid mt16" style="grid-template-columns:repeat(3,1fr)">
        <div class="fitem"><label>承运商</label><select data-x="carrier">${['顺丰速运', '中通快递', '德邦物流', '京东物流', '安得智联', '自提'].map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="fitem"><label>运单号</label><input data-x="tracking" placeholder="留空自动生成"></div>
        <div class="fitem"><label>发货备注</label><input data-x="note"></div></div>`
      : kind === 'invoice' ? `<div class="notice mt16">${icon('info')}<div>开票将按所选数量确认收入并生成凭证:<b>借 应收账款 / 贷 主营业务收入 + 应交税费(销项)</b>。</div></div>`
      : `<div class="notice mt16">${icon('info')}<div>收货过账将增加库存并采用移动加权平均更新单位成本。</div></div>`;
    const m = UI.modal({
      title: meta.title, width: 'mid', subtitle: '来源 ' + no,
      body: `<div class="table-wrap"><table class="lines-tbl"><thead><tr><th>物料</th><th style="width:110px" class="right">未结数量</th><th style="width:120px" class="right">本次${kind === 'deliver' ? '出库' : kind === 'receive' ? '收货' : '开票'}</th><th style="width:110px" class="right">${kind === 'invoice' ? '单价' : '单价/成本'}</th><th>可用库存</th></tr></thead>
        <tbody>${rowsData.map((r, i) => `<tr data-i="${i}"><td><b>${esc(r.product_name)}</b><div class="cell-sub mono">${esc(r.code)}</div></td>
          <td class="right money">${num(r.remain)}</td>
          <td class="right"><input type="number" data-q="${i}" value="${r.qty}" min="0" max="${r.remain}" class="num right"></td>
          <td class="right">${kind === 'invoice' ? `<input type="number" step="0.01" data-p="${i}" value="${r.price}" class="num right">` : `<span class="money">¥${money(kind === 'deliver' ? r.price : r.price)}</span>`}</td>
          <td>${r.stock === null ? '<span class="muted">—</span>' : `<span class="money ${r.stock < r.qty ? 'neg' : ''}" ${r.stock < r.qty ? 'style="color:var(--danger)"' : ''}>${num(r.stock)}</span>`}</td></tr>`).join('')}</tbody></table></div>${extra}`,
      actions: [{ label: '取消' }, { label: meta.ok, cls: 'primary', icon: 'check', onClick: mm => {
        const plan = rowsData.map((r, i) => ({ product: r.product, qty: +($(`[data-q="${i}"]`, mm.el) || { value: 0 }).value || 0, price: r2(+($(`[data-p="${i}"]`, mm.el) || { value: r.price }).value || r.price) }));
        plan._carrier = ($('[data-x="carrier"]', mm.el) || {}).value;
        plan._tracking = ($('[data-x="tracking"]', mm.el) || {}).value || ('SF' + Math.floor(Math.random() * 1e12));
        plan._note = ($('[data-x="note"]', mm.el) || {}).value;
        try {
          let created;
          if (kind === 'deliver') created = ACT.createDelivery(no, plan);
          else if (kind === 'receive') created = ACT.createGR(no, plan);
          else created = ACT.createInvoiceFromSO(no, plan);
          UI.toast('已生成 ' + meta.table + ' ' + created);
          setTimeout(() => { rerender(); }, 60);
          setTimeout(() => open(meta.doc, created), 120);
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    return m;
  }

  /** 票到清算:登记采购发票,允许发票价 ≠ 暂估价,差异与资本化运费回写存货成本 */
  function openIRModal(no, rerender) {
    const gr = DB.find('gr', no);
    const grLines = DB.lines('gr_lines', no);
    const accrual = r2(gr.amount || 0);
    const RATES = [13, 9, 6, 5, 3, 0];
    const m = UI.modal({
      title: '票到清算 · 登记采购发票', width: 'wide', subtitle: `${no} · ${gr.supplier_name} · 暂估在账 ¥${money(accrual)}`,
      body: `<div class="table-wrap"><table class="lines-tbl"><thead><tr><th>物料</th><th class="right" style="width:80px">收货数量</th>
          <th class="right" style="width:100px">暂估单价</th><th class="right" style="width:118px">发票单价</th>
          <th style="width:96px">税率</th><th class="right" style="width:112px">发票金额</th></tr></thead>
        <tbody>${grLines.map((l, i) => `<tr data-i="${i}"><td><b>${esc(l.product_name)}</b><div class="cell-sub mono">${esc(l.product)}</div></td>
          <td class="right money">${num(l.qty)}</td><td class="right muted">¥${money(l.price)}</td>
          <td class="right"><input type="number" step="0.01" data-p="${i}" value="${l.price}" class="num right"></td>
          <td><select data-r="${i}">${RATES.map(r => `<option value="${r}"${(l.tax_rate || 13) === r ? ' selected' : ''}>${r}%</option>`).join('')}</select></td>
          <td class="right"><b class="money" data-a="${i}">¥${money(l.qty * l.price)}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="form-grid mt16" style="grid-template-columns:repeat(3,1fr)">
          <div class="fitem"><label>运杂费(不含税,计入存货成本)</label><input type="number" step="0.01" data-x="freight" value="0" class="num"></div>
          <div class="fitem"><label>运费税率</label><select data-x="frate">${[9, 13, 6, 3, 0].map(r => `<option value="${r}"${r === 9 ? ' selected' : ''}>${r}%</option>`).join('')}</select></div>
          <div class="fitem"><label>发票备注</label><input data-x="fmemo" placeholder="如:增值税专用发票 已认证"></div></div>
        <div class="stat-row mt16" id="ir-sum"></div>
        <div class="notice mt12">${icon('info')}<div>清算凭证:<b>借 应付暂估(GR/IR) ${money(accrual)}</b> 冲销到货暂估,<b>借 应交税费—进项税额</b>,<b>贷 应付账款</b> 价税合计;<br>
          发票金额与暂估的差额(含资本化运费)按行分摊<b>调整库存商品成本</b>,库存子账与总账 1405 始终同源。<br>
          收货数量差异请在账单外处理:<b>少收</b>走采购退货,<b>多收</b>补开收货单。</div></div>`,
      actions: [{ label: '取消' }, { label: '确认清算并过账', cls: 'primary', icon: 'check', onClick: mm => {
        const plan = { lines: grLines.map((l, i) => ({ product: l.product,
          price: +(($(`[data-p="${i}"]`, mm.el) || {}).value || l.price),
          tax_rate: +(($(`[data-r="${i}"]`, mm.el) || {}).value || 0) })),
          freight: +(($('[data-x="freight"]', mm.el) || {}).value || 0),
          freight_rate: +(($('[data-x="frate"]', mm.el) || {}).value || 9),
          freight_memo: ($('[data-x="fmemo"]', mm.el) || {}).value || '' };
        try {
          const b = ACT.createBillFromGR(no, plan);
          UI.toast('已冲销暂估并生成采购账单 ' + b);
          rerender();
          setTimeout(() => open('bill', b), 120);
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    function repaint() {
      let goodsNet = 0, goodsVat = 0;
      grLines.forEach((l, i) => {
        const price = +(($(`[data-p="${i}"]`, m.el) || {}).value || 0);
        const rate = +(($(`[data-r="${i}"]`, m.el) || {}).value || 0);
        const amt = r2(l.qty * price);
        goodsNet = r2(goodsNet + amt); goodsVat = r2(goodsVat + amt * rate / 100);
        const cell = $(`[data-a="${i}"]`, m.el); if (cell) cell.textContent = '¥' + money(amt);
      });
      const fr = r2(+(($('[data-x="freight"]', m.el) || {}).value || 0));
      const frate = +(($('[data-x="frate"]', m.el) || {}).value || 9);
      const net = r2(goodsNet + fr), vat = r2(goodsVat + fr * frate / 100), total = r2(net + vat);
      const diff = r2(net - accrual);
      const box = $('#ir-sum', m.el);
      if (box) box.innerHTML = `<div>不含税金额<b>¥${money(net)}</b></div><div>进项税额<b>¥${money(vat)}</b></div>
        <div>价税合计<b class="money">¥${money(total)}</b></div><div>冲销暂估<b>¥${money(accrual)}</b></div>
        <div>存货成本调整<b style="color:${Math.abs(diff) < 0.005 ? 'var(--text-2)' : diff > 0 ? 'var(--danger)' : 'var(--success)'}">${diff >= 0 ? '+' : '−'}¥${money(Math.abs(diff))}</b></div>`;
    }
    UI.$$('input,select', m.el).forEach(i => i.addEventListener('input', repaint));
    repaint();
    return m;
  }

  function openMoneyModal(entity, no, rerender) {
    const row = DB.find(entity, no);
    const isInv = entity === 'invoice';
    const fields = [
      { k: 'amount', label: isInv ? '收款金额' : '付款金额', type: 'money', required: true, def: row.balance, hint: '未结余额 ¥' + money(row.balance) },
      { k: 'method', label: isInv ? '收款方式' : '付款方式', type: 'select', opts: SCHEMA.entities[isInv ? 'receipt' : 'payment'].fields.method.opts, def: '银行转账' },
      { k: 'note', label: '备注', type: 'text', full: true, ph: '如:银行回单号 / 汇票号' }];
    UI.modal({
      title: isInv ? '登记客户收款' : '登记供应商付款', subtitle: no,
      body: UI.form(fields, {}) + `<div class="notice mt12">${icon('info')}<div>过账后自动生成凭证:<b>${isInv ? '借 银行存款 / 贷 应收账款' : '借 应付账款 / 贷 银行存款'}</b>,并回写${isInv ? '发票' : '账单'}已结算金额。</div></div>`,
      actions: [{ label: '取消' }, { label: '过账', cls: 'primary', icon: 'check', onClick: m => {
        const rd = UI.readForm(m.el, fields); if (!rd.ok) { UI.toast('请填写完整', 'err'); return false; }
        try {
          const docNo = isInv ? ACT.createReceipt(no, rd.values.amount, rd.values.method, rd.values.note) : ACT.createPayment(no, rd.values.amount, rd.values.method, rd.values.note);
          UI.toast('已生成' + (isInv ? '收款单 ' : '付款单 ') + docNo);
          rerender();
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
  }

  function openApprove(no, ok, rerender) {
    const fields = [{ k: 'memo', label: ok ? '审批意见' : '驳回原因', type: 'textarea', required: !ok, full: true, rows: 3 }];
    UI.modal({ title: ok ? '审批通过采购申请' : '驳回采购申请', subtitle: no, body: UI.form(fields, {}),
      actions: [{ label: '取消' }, { label: ok ? '确认通过' : '确认驳回', cls: ok ? 'primary' : 'danger-ghost', onClick: m => {
        const rd = UI.readForm(m.el, fields);
        try { ACT.approvePR(no, ok, rd.values.memo); UI.toast(ok ? '已审批通过' : '已驳回'); rerender(); } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }] });
  }

  /* ---------------- 新品/准入/审核:意见弹窗 ---------------- */
  function openOpinion(title, ok, done) {
    const fields = [{ k: 'opinion', label: ok ? '审批意见' : '驳回原因', type: 'textarea', required: !ok, full: true, def: ok ? '同意,按流程执行' : '', ph: ok ? '' : '请说明驳回原因,便于发起人补充资料' }];
    UI.modal({
      title: ok ? '审批通过' : '审批驳回', subtitle: title, body: UI.form(fields, {}),
      actions: [{ label: '取消' }, { label: ok ? '确认通过' : '确认驳回', cls: ok ? 'primary' : 'danger-ghost', icon: ok ? 'check' : 'close',
        onClick: m => { const rd = UI.readForm(m.el, fields); if (!rd.ok) { UI.toast('请填写' + fields[0].label, 'err'); return false; } done(rd.values.opinion); } }]
    });
  }

  /* ---------------- 询价:供应商报价录入 ---------------- */
  function openRFQQuote(no, rerender) {
    const lines = DB.lines('rfq_lines', no);
    const groups = {};
    lines.forEach(l => { (groups[l.product] = groups[l.product] || []).push(l); });
    const body = Object.keys(groups).map(code => {
      const p = DB.find('products', code) || {};
      const rows = groups[code];
      return `<div class="section-title">${icon('box')} ${esc(p.name || code)} <span class="muted small mono"> ${esc(code)} · 询价数量 ${num(rows[0].qty)}</span></div>
        <div class="table-wrap"><table class="lines-tbl"><thead><tr><th>报价供应商</th><th style="width:120px" class="right">目标成本</th><th style="width:140px" class="right">报价单价(未税)</th><th style="width:110px" class="right">交付(天)</th><th style="width:130px" class="right">报价金额</th></tr></thead><tbody>
        ${rows.map(l => `<tr data-l="${l.lineno}" data-g="${esc(code)}"><td>${esc(l.supplier_name)}<div class="cell-sub mono">${esc(l.supplier)}</div></td>
          <td class="right money">¥${money(l.base_price)}</td>
          <td class="right"><input type="number" step="0.01" min="0" data-f="price" value="${l.price || ''}" placeholder="0.00" class="num right"></td>
          <td class="right"><input type="number" min="1" data-f="lead_time" value="${l.lead_time || 14}" class="num right"></td>
          <td class="right money" data-amt>¥${money(l.amount)}</td></tr>`).join('')}</tbody></table></div>`;
    }).join('');
    const m = UI.modal({
      title: '录入供应商报价', subtitle: `${no} · 每个物料至少一家有效报价`, width: 'wide',
      body: body + `<div class="notice mt12">${icon('info')}<div>报价为<b>未税单价</b>。定标时同一物料自动取<b>最低报价</b>供应商,并按供应商合并生成草稿采购订单。</div></div>`,
      actions: [{ label: '取消' }, { label: '保存报价', cls: 'primary', icon: 'check', onClick: mm => {
        const quotes = UI.$$('[data-l]', mm.el).map(tr => ({
          lineno: tr.dataset.l, price: +($('[data-f="price"]', tr) || { value: 0 }).value || 0,
          lead_time: +($('[data-f="lead_time"]', tr) || { value: 0 }).value || 0
        }));
        try { const amt = ACT.saveRFQQuotes(no, quotes); UI.toast(`报价已登记,最低报价合计 ¥${money(amt)}`); rerender(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    function repaint() {
      const byGroup = {};
      UI.$$('[data-l]', m.el).forEach(tr => {
        const price = +($('[data-f="price"]', tr) || { value: 0 }).value || 0;
        const qty = +(DB.lines('rfq_lines', no).find(l => String(l.lineno) === tr.dataset.l) || { qty: 0 }).qty;
        $('[data-amt]', tr).textContent = '¥' + money(price * qty);
        (byGroup[tr.dataset.g] = byGroup[tr.dataset.g] || []).push({ tr, price });
      });
      Object.keys(byGroup).forEach(g => {
        const valid = byGroup[g].filter(x => x.price > 0);
        const min = valid.length ? Math.min.apply(null, valid.map(x => x.price)) : null;
        byGroup[g].forEach(x => {
          const best = min !== null && x.price === min && x.price > 0;
          x.tr.style.background = best ? 'var(--primary-50)' : '';
          x.tr.dataset.best = best ? '1' : '';
        });
      });
    }
    UI.$$('input', m.el).forEach(i => i.addEventListener('input', repaint));
    repaint();
  }

  /* ---------------- 准入/外协商:评分录入 ---------------- */
  const SCORE_FIELDS = {
    supplier_apply: [
      { k: 'score', label: '现场评审得分(0-100)', type: 'int', required: true, def: 75 },
      { k: 'legal_person', label: '法人代表', type: 'text' },
      { k: 'registered_capital', label: '注册资本', type: 'money', def: 0 },
      { k: 'opinion', label: '现场审核记录', type: 'textarea', full: true, ph: '产能、质量体系、财务与合规核查结论' }],
    processor_audit: [
      { k: 'sample_result', label: '打样结论', type: 'select', required: true, def: 'pass', opts: { pass: '打样合格', cond: '条件合格(限批量试单)', fail: '打样不合格' } },
      { k: 'quality_score', label: '质量评分', type: 'int', required: true, def: 80 },
      { k: 'delivery_score', label: '交付评分', type: 'int', required: true, def: 75 },
      { k: 'price_score', label: '价格评分', type: 'int', def: 70 },
      { k: 'manage_score', label: '管理评分', type: 'int', def: 70 },
      { k: 'capacity', label: '核定月产能(件)', type: 'int', def: 20000 },
      { k: 'unit_rate', label: '核定加工单价', type: 'money', required: true, def: 3.5 },
      { k: 'opinion', label: '审核意见', type: 'textarea', full: true, ph: '设备/人员/品控/环保与安全核查记录' }],
  };
  function openScoreModal(entity, no, rerender) {
    const fields = SCORE_FIELDS[entity];
    const row = DB.find(entity, no);
    const isApply = entity === 'supplier_apply';
    const m = UI.modal({
      title: isApply ? '登记现场审核' : '打样与评分', subtitle: `${row[isApply ? 'company' : 'processor_name'] || ''} · ${no}`, width: 'mid',
      body: UI.form(fields, row) + (isApply
        ? `<div class="notice mt12">${icon('info')}<div>得分低于 <b>60</b> 的申请不能核准建档。</div></div>`
        : `<div class="notice mt12">${icon('info')}<div>综合得分 = 质量×40% + 交付×25% + 价格×20% + 管理×15%;打样不合格或得分低于 60 自动判定为<b>淘汰</b>。</div></div>`),
      actions: [{ label: '取消' }, { label: '保存评分', cls: 'primary', icon: 'check', onClick: mm => {
        const rd = UI.readForm(mm.el, fields);
        if (!rd.ok) { UI.toast('请完善:' + rd.errors.join('、'), 'err'); return false; }
        try {
          if (isApply) { ACT.inspectApply(no, rd.values.score, rd.values.opinion); }
          else { const sc = ACT.inspectAudit(no, rd.values); UI.toast('评分已录入,综合得分 ' + sc); }
          rerender();
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    return m;
  }

  /* ---------------- 委外:发料 / 收回 ---------------- */
  function openIssueModal(no, rerender) {
    const t = DB.find('os_order', no);
    const lines = DB.lines('os_lines', no);
    const rowsData = lines.map(l => {
      const p = DB.find('products', l.product) || {};
      const remain = (l.qty || 0) - (l.issued || 0);
      return { product: l.product, product_name: p.name || l.product_name, remain, qty: Math.max(0, remain), cost: p.cost || 0, avail: ACT.available(l.product, t.warehouse) };
    });
    UI.modal({
      title: '委外发料过账', subtitle: `${no} · ${t.processor_name} · 发料仓 ${t.warehouse}`, width: 'mid',
      body: `<div class="table-wrap"><table class="lines-tbl"><thead><tr><th>材料</th><th class="right" style="width:100px">待发料</th><th class="right" style="width:120px">本次发料</th><th class="right" style="width:110px">单位成本</th><th class="right" style="width:120px">仓库可用</th></tr></thead>
        <tbody>${rowsData.map((r, i) => `<tr><td><b>${esc(r.product_name)}</b><div class="cell-sub mono">${esc(r.product)}</div></td>
          <td class="right money">${num(r.remain)}</td>
          <td class="right"><input type="number" data-q="${i}" value="${Math.max(0, Math.min(r.qty, r.avail))}" min="0" class="num right"></td>
          <td class="right money">¥${money(r.cost)}</td>
          <td class="right money" style="${r.avail < r.remain && r.remain > 0 ? 'color:var(--danger)' : ''}">${num(r.avail)}</td></tr>`).join('')}</tbody></table></div>
        <div class="notice mt12">${icon('info')}<div>发料过账生成流水「委外发料」并记凭证:<b>借 委托加工物资(1408) / 贷 库存商品(1405)</b>。</div></div>`,
      actions: [{ label: '取消' }, { label: '发料过账', cls: 'primary', icon: 'send', onClick: mm => {
        const plan = rowsData.map((r, i) => ({ product: r.product, qty: +($(`[data-q="${i}"]`, mm.el) || { value: 0 }).value || 0 }));
        try { const cost = ACT.issueOS(no, plan); UI.toast(`发料过账完成,材料成本 ¥${money(cost)}`); rerender(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
  }
  function openReceiveModal(no, rerender) {
    const t = DB.find('os_order', no);
    const remain = (t.output_qty || 0) - (t.received_qty || 0);
    const perMat = r2((t.issued_amount || 0) / (t.output_qty || 1));
    const fields = [{ k: 'qty', label: '本次收回数量', type: 'int', required: true, def: Math.max(1, remain) },
      { k: 'note', label: '收检说明', type: 'text', full: true, ph: '抽检比例、良品率、异常批次' }];
    const preview = (q) => {
      const last = (t.received_qty || 0) + q >= (t.output_qty || 0);
      const mat = last ? r2((t.issued_amount || 0) - (t.consumed_amount || 0)) : r2(q * perMat);
      const fee = r2(q * (t.unit_fee || 0));
      const vat = r2(fee * ((DB.find('products', t.output_product) || {}).tax_rate || 13) / 100);
      return `<div class="stat-row mt16"><div>核销材料<b>¥${money(mat)}</b></div><div>加工费(未税)<b>¥${money(fee)}</b></div><div>进项税<b>¥${money(vat)}</b></div><div style="color:var(--primary)">成品入库成本<b>¥${money(r2(mat + fee))}</b></div></div>
        <div class="notice mt12">${icon('info')}<div>过账后:成品按加权成本入库,<b>借 库存商品 + 应交税费(进项) / 贷 委托加工物资 + 应付账款(加工费)</b>,并自动生成加工费应付账单${last ? ';这是最后一批,尾差材料已全部核销' : ''}。</div></div>`;
    };
    const m = UI.modal({
      title: '委外收回成品', subtitle: `${no} · ${t.processor_name} · 待收回 ${remain} 件`,
      body: UI.form(fields, {}) + `<div id="os-pv">${preview(Math.max(1, remain))}</div>`,
      actions: [{ label: '取消' }, { label: '收回并挂账', cls: 'success', icon: 'download', onClick: mm => {
        const rd = UI.readForm(mm.el, fields);
        if (!rd.ok) { UI.toast('请填写收回数量', 'err'); return false; }
        try { const b = ACT.receiveOS(no, rd.values.qty); UI.toast('已入库并生成加工费账单 ' + b); rerender(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    const inp = $('[data-k="qty"]', m.el) || $('input[type="number"]', m.el);
    if (inp) inp.addEventListener('input', () => { $('#os-pv', m.el).innerHTML = preview(+inp.value || 0); });
  }

  /* ---------------- 售后:退款 / 维修 ---------------- */
  function openRefundModal(no, rerender) {
    const t = DB.find('rma', no);
    const inv = DB.find('invoice', t.credit_invoice) || {};
    const max = r2(-inv.balance || 0);
    if (max <= 0) { UI.toast('红字发票已退清,无需退款', 'warn'); return; }
    const fields = [{ k: 'amount', label: '退款金额', type: 'money', required: true, def: max },
      { k: 'method', label: '退款方式', type: 'select', required: true, def: '原路退回', opts: { '原路退回': 1, '银行转账': 1, '电汇 T/T': 1, '余额抵扣': 1 } },
      { k: 'note', label: '退款说明', type: 'text', full: true }];
    UI.modal({
      title: '登记售后退款', subtitle: `${no} · ${t.customer_name} · 红字发票 ${inv.no}`,
      body: UI.form(fields, {}) + `<div class="notice mt12">${icon('info')}<div>退款生成<b>负数收款单</b>冲减应收:<b>借 应收账款(1122) / 贷 银行存款(1002)</b>,应收明细账与总账保持勾稽。</div></div>`,
      actions: [{ label: '取消' }, { label: '确认退款', cls: 'primary', icon: 'wallet', onClick: mm => {
        const rd = UI.readForm(mm.el, fields);
        if (!rd.ok) { UI.toast('请填写退款金额', 'err'); return false; }
        try { const rc = ACT.refundRMA(no, rd.values.amount, rd.values.method); UI.toast('退款单 ' + rc + ' 已过账'); rerender(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
  }
  function openRepairModal(no, rerender) {
    const t = DB.find('rma', no);
    const fields = [{ k: 'cost', label: '维修费用', type: 'money', required: true, def: r2((t.amount || 0) * 0.15) },
      { k: 'liability', label: '责任归属', type: 'select', required: true, def: t.liability || 'company', opts: { company: '我司承担', supplier: '供应商承担', customer: '客户付费' } },
      { k: 'note', label: '维修工单', type: 'text', full: true, ph: '故障现象、维修方案、更换配件' }];
    UI.modal({
      title: '登记维修费用', subtitle: `${no} · ${t.customer_name}`,
      body: UI.form(fields, {}) + `<div class="notice mt12">${icon('info')}<div>维修费按<b>销售费用(6601)</b>费用化处理;客户付费维修则直接冲减银行存款并计入当期收入。</div></div>`,
      actions: [{ label: '取消' }, { label: '确认登记', cls: 'primary', icon: 'check', onClick: mm => {
        const rd = UI.readForm(mm.el, fields);
        if (!rd.ok) { UI.toast('请填写维修费用', 'err'); return false; }
        try {
          const cur = DB.find('rma', no); cur.liability = rd.values.liability; DB.upsert('rma', cur);
          const c = ACT.repairRMA(no, rd.values.cost); UI.toast(`维修费 ¥${money(c)} 已过账`); rerender();
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
  }

  /* ---------------- 单据编辑器(新建/修改) ---------------- */
  const NEW_CFG = {
    sales_order: { entity: 'sales_order', title: '销售订单', lines: 'so_lines', priceKey: 'price',
      head: [
        { k: 'customer', label: '客户', type: 'ref', ref: 'customers', required: true },
        { k: 'warehouse', label: '发货仓', type: 'ref', ref: 'warehouses', required: true, def: 'WH-HZ01' },
        { k: 'date', label: '订单日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'required_date', label: '需求到货日', type: 'date', def: () => DB.addDays(DB.today(), 7) },
        { k: 'payment_terms', label: '结算方式', type: 'select', opts: SCHEMA.PAYTERM, def: 'NET30' },
        { k: 'channel', label: '订单渠道', type: 'select', opts: SCHEMA.entities.sales_order.fields.channel.opts, def: 'offline' },
        { k: 'priority', label: '紧急度', type: 'select', opts: SCHEMA.entities.sales_order.fields.priority.opts, def: 'std' },
        { k: 'salesperson', label: '销售员', type: 'text', def: () => DB.currentUser() },
        { k: 'note', label: '备注', type: 'textarea', full: true }],
      cols: ['qty', 'price', 'discount', 'tax'] },
    purchase_order: { entity: 'purchase_order', title: '采购订单', lines: 'po_lines',
      head: [
        { k: 'supplier', label: '供应商', type: 'ref', ref: 'suppliers', required: true },
        { k: 'warehouse', label: '收货仓', type: 'ref', ref: 'warehouses', required: true, def: 'WH-HZ01' },
        { k: 'date', label: '下单日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'expected_date', label: '预计到货日', type: 'date', def: () => DB.addDays(DB.today(), 14) },
        { k: 'payment_terms', label: '结算方式', type: 'select', opts: SCHEMA.PAYTERM, def: 'NET30' },
        { k: 'buyer', label: '采购员', type: 'text', def: () => DB.currentUser() },
        { k: 'note', label: '备注', type: 'textarea', full: true }],
      cols: ['qty', 'price', 'tax'] },
    purchase_req: { entity: 'purchase_req', title: '采购申请', lines: 'pr_lines',
      head: [
        { k: 'dept', label: '申请部门', type: 'select', opts: SCHEMA.entities.purchase_req.fields.dept.opts, required: true, def: '仓储物流部' },
        { k: 'requester', label: '申请人', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'date', label: '申请日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'need_date', label: '期望到货日', type: 'date', def: () => DB.addDays(DB.today(), 14) },
        { k: 'reason', label: '申请事由', type: 'text', required: true, full: true, ph: '如:安全库存预警补货' },
        { k: 'note', label: '备注', type: 'textarea', full: true }],
      cols: ['qty', 'price'] },
    transfer: { entity: 'transfer', title: '库存调拨单', lines: 'tr_lines',
      head: [
        { k: 'from_wh', label: '调出仓', type: 'ref', ref: 'warehouses', required: true, def: 'WH-HZ01' },
        { k: 'to_wh', label: '调入仓', type: 'ref', ref: 'warehouses', required: true, def: 'WH-GZ02' },
        { k: 'date', label: '调拨日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'note', label: '备注', type: 'text', full: true }],
      cols: ['qty'] },
    stocktake: { entity: 'stocktake', title: '库存盘点单', lines: 'stk_lines',
      head: [
        { k: 'warehouse', label: '盘点仓库', type: 'ref', ref: 'warehouses', required: true, def: 'WH-HZ01' },
        { k: 'date', label: '盘点日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'note', label: '盘点说明', type: 'text', full: true }],
      cols: ['count'] },

    /* ---------------- 询价比价 ---------------- */
    rfq: { entity: 'rfq', title: '询价单', lines: 'rfq_lines',
      head: [
        { k: 'title', label: '询价主题', type: 'text', required: true, full: true, ph: '如:Q4 家居类新品面料三家比价' },
        { k: 'buyer', label: '采购员', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'date', label: '询价日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'need_date', label: '需求到货日', type: 'date', def: () => DB.addDays(DB.today(), 21) },
        { k: 'warehouse', label: '收货仓库', type: 'ref', ref: 'warehouses', required: true, def: 'WH-HZ01' },
        { k: 'note', label: '技术与商务要求', type: 'textarea', full: true }],
      cols: ['qty', 'price'] },

    /* ---------------- 新品发布 ---------------- */
    product_release: { entity: 'product_release', title: '新品发布单', lines: null, cols: [],
      head: [
        { k: 'name', label: '商品名称', type: 'text', required: true, full: true, ph: '如:北欧简约棉麻抱枕套(45×45)' },
        { k: 'category', label: '类目', type: 'select', required: true, def: '家居用品', opts: SCHEMA.entities.products.fields.category.opts },
        { k: 'brand', label: '品牌', type: 'text', def: '赛福优选' },
        { k: 'spec', label: '规格型号', type: 'text', ph: '尺寸/材质/颜色' },
        { k: 'uom', label: '计量单位', type: 'select', def: 'PCS', opts: SCHEMA.entities.products.fields.uom.opts },
        { k: 'target_cost', label: '目标成本', type: 'money', required: true, def: 0 },
        { k: 'target_price', label: '拟售价(未税)', type: 'money', required: true, def: 0 },
        { k: 'listing', label: '首发渠道', type: 'select', required: true, def: 'tmall', opts: SCHEMA.entities.products.fields.listing.opts },
        { k: 'safety_qty', label: '首单备货量', type: 'int', def: 200 },
        { k: 'moq', label: '最小起订量', type: 'int', def: 50 },
        { k: 'supplier', label: '首发供应商', type: 'ref', ref: 'suppliers' },
        { k: 'owner', label: '产品开发', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'launch_date', label: '计划上架日', type: 'date', required: true, def: () => DB.addDays(DB.today(), 30) },
        { k: 'note', label: '立项说明', type: 'textarea', full: true, ph: '市场容量、竞品对比、毛利预期、上市节奏' }],
      notice: '保存草稿后提交产品评审;审批通过点击「建档并上架」,系统会自动生成商品主档并启用。' },

    /* ---------------- 供应商准入 ---------------- */
    supplier_apply: { entity: 'supplier_apply', title: '供应商准入申请', lines: null, cols: [],
      head: [
        { k: 'company', label: '企业全称', type: 'text', required: true, full: true },
        { k: 'credit_code', label: '统一社会信用代码', type: 'text', required: true },
        { k: 'category', label: '主营类目', type: 'select', required: true, def: '家居用品', opts: SCHEMA.entities.products.fields.category.opts },
        { k: 'contact', label: '业务联系人', type: 'text', required: true },
        { k: 'phone', label: '联系电话', type: 'text', required: true },
        { k: 'email', label: '邮箱', type: 'text' },
        { k: 'legal_person', label: '法人代表', type: 'text' },
        { k: 'registered_capital', label: '注册资本', type: 'money', def: 0 },
        { k: 'annual_capacity', label: '年产能(件)', type: 'int', def: 0 },
        { k: 'main_products', label: '主打产品', type: 'text' },
        { k: 'address', label: '注册地址', type: 'text', full: true },
        { k: 'applicant', label: '引入采购员', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'note', label: '引入理由', type: 'textarea', full: true }],
      notice: '流程:提交准入评审 → 资格初审 → 现场审核评分 → 核准 → 自动生成供应商档案。' },

    /* ---------------- 外协商审核 ---------------- */
    processor_audit: { entity: 'processor_audit', title: '外协商审核单', lines: null, cols: [],
      head: [
        { k: 'processor', label: '外协商', type: 'ref', ref: 'processors', required: true },
        { k: 'process_type', label: '加工类型', type: 'select', required: true, def: 'sew', opts: SCHEMA.entities.processors.fields.process_type.opts },
        { k: 'date', label: '审核日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'auditor', label: '审核人', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'unit_rate', label: '报价加工单价', type: 'money', def: 3.5 },
        { k: 'capacity', label: '申报月产能', type: 'int', def: 20000 },
        { k: 'note', label: '审核范围', type: 'textarea', full: true, ph: '打样品类、验厂重点、样品单号' }],
      notice: '打样与四项评分录入后,综合得分 ≥60 且打样合格才会核准;核准结果自动回写服务商档案。' },

    /* ---------------- 委外加工 ---------------- */
    os_order: { entity: 'os_order', title: '委外加工单', lines: 'os_lines',
      head: [
        { k: 'processor', label: '服务商', type: 'ref', ref: 'processors', required: true },
        { k: 'process_type', label: '加工类型', type: 'select', required: true, def: 'sew', opts: SCHEMA.entities.processors.fields.process_type.opts },
        { k: 'warehouse', label: '收发库', type: 'ref', ref: 'warehouses', required: true, def: 'WH-HZ01' },
        { k: 'date', label: '下单日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'output_product', label: '加工成品', type: 'ref', ref: 'products', required: true },
        { k: 'output_qty', label: '计划加工数', type: 'int', required: true, def: 500 },
        { k: 'unit_fee', label: '加工费单价(未税)', type: 'money', required: true, def: 3.5 },
        { k: 'need_date', label: '预计完工日', type: 'date', def: () => DB.addDays(DB.today(), 15) },
        { k: 'note', label: '工艺要求', type: 'textarea', full: true }],
      cols: ['qty', 'price'],
      notice: '明细行填写发往服务商的材料(计划发料与单位成本);发料过账后材料转入「委托加工物资」。' },

    /* ---------------- 售后工单 ---------------- */
    rma: { entity: 'rma', title: '售后工单', lines: 'rma_lines',
      head: [
        { k: 'so', label: '原销售订单', type: 'ref', ref: 'sales_order', required: true },
        { k: 'customer', label: '客户', type: 'ref', ref: 'customers', required: true },
        { k: 'type', label: '售后类型', type: 'select', required: true, def: 'return', opts: SCHEMA.entities.rma.fields.type.opts },
        { k: 'reason', label: '售后原因', type: 'select', required: true, def: 'quality', opts: SCHEMA.entities.rma.fields.reason.opts },
        { k: 'liability', label: '责任归属', type: 'select', required: true, def: 'company', opts: SCHEMA.entities.rma.fields.liability.opts },
        { k: 'warehouse', label: '退货入库仓', type: 'ref', ref: 'warehouses', def: 'WH-HZ01' },
        { k: 'date', label: '受理日期', type: 'date', required: true, def: () => DB.today() },
        { k: 'handler', label: '处理人', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'note', label: '客诉描述', type: 'textarea', full: true, ph: '客户反馈、批次、图片证据编号' }],
      cols: ['qty', 'price', 'tax'],
      notice: '退货入库冲回成本;红字发票冲减收入与应收;退款以负数收款单核销应收,明细账与总账保持勾稽。' },
  };

  function newDoc(entity, pre) { editDoc(entity, null, null, pre); }
  function openEditor(entity, no, rerender) { editDoc(entity, no, rerender); }

  function editDoc(entity, no, rerender, pre) {
    const cfg = NEW_CFG[entity]; if (!cfg) return;
    const isNew = !no;
    const hasLines = !!cfg.lines;
    const headVals = isNew ? Object.assign(defVals(cfg.head), pre || {}) : DB.find(entity, no);
    let lines = !hasLines ? [] : (isNew ? [] : DB.lines(cfg.lines, no).map(l => Object.assign({}, l)));
    if (hasLines && cfg.cols.indexOf('count') >= 0 && !isNew) lines = [];

    const m = UI.modal({
      title: (isNew ? '新建' : '编辑') + cfg.title, width: hasLines ? 'wide' : 'mid', subtitle: isNew ? (cfg.notice || '保存为草稿,审核后方可执行后续动作') : no,
      body: `<div id="ed-head">${UI.form(cfg.head, headVals)}</div>
        ${hasLines ? `<div class="section-title mt20">明细行</div><div id="ed-lines"></div>` : ''}`,
      actions: [{ label: '取消' },
        isNew ? { label: '保存草稿', icon: 'file', onClick: mm => submit(mm, false) } : null,
        isNew ? { label: '保存并提交', cls: 'primary', icon: 'check', onClick: mm => submit(mm, true) }
               : { label: '保存修改', cls: 'primary', icon: 'check', onClick: mm => submit(mm, false) }].filter(Boolean)
    });
    let ed = null;
    if (hasLines) { ed = new LineEditor($('#ed-lines', m.el), cfg, lines, m); ed.add(); }
    const SUBMIT_HOOK = {
      product_release: ACT.submitRelease, supplier_apply: ACT.submitApply,
      processor_audit: ACT.submitAudit, rma: ACT.submitRMA,
    };
    function submit(mm, andConfirm) {
      const rd = UI.readForm(mm.el, cfg.head);
      if (!rd.ok) { UI.toast('请完善表头信息:' + rd.errors.join('、'), 'err'); return false; }
      const lns = ed ? ed.values() : [];
      if (hasLines && !lns.length) { UI.toast('请至少添加一行有效明细', 'err'); return false; }
      try {
        const target = isNew ? ACT.autoCode(entity) : no;
        const header = rd.values;
        header[SCHEMA.entities[entity].pk] = target;
        const ef = SCHEMA.entities[entity].fields;
        Object.keys(ef).forEach(k => {
          const f = ef[k];
          if (f.t === 'ref' && f.name && header[k]) header[k + '_name'] = (DB.find(f.ref, header[k]) || {})[f.name] || header[k];
          if (isNew && header[k] === undefined && f.def !== undefined) header[k] = typeof f.def === 'function' ? f.def() : f.def;
        });
        if (hasLines) {
          let total = 0;
          if (cfg.cols.indexOf('count') >= 0) total = 0;
          else total = ACT.docTotal(lns);
          header.total = total; header.amount = total;
          if (entity === 'purchase_req') header.amount = r2(lns.reduce((s, l) => s + l.qty * l.price, 0));
        }
        if (isNew) {
          header.status = 'draft';
          if (entity === 'transfer' || entity === 'stocktake' || !hasLines) delete header.total;
          DB.insert(entity, header);
          if (hasLines) DB.setLines(cfg.lines, target, lns.map(l => Object.assign({}, l, { doc: target })));
          DB.log('单据管理', '新建' + cfg.title, target, hasLines ? `${lns.length} 行` : '表头信息');
        } else if (entity === 'sales_order') {
          ACT.saveSO(no, header, lns);
        } else {
          const cur = DB.find(entity, no);
          if (['sales_order', 'purchase_order'].includes(entity) && cur.status !== 'draft') throw new Error('仅草稿状态可编辑');
          if (SUBMIT_HOOK[entity] && cur.status !== 'draft') throw new Error('仅草稿状态可编辑');
          Object.assign(cur, header); DB.upsert(entity, cur);
          if (hasLines) DB.setLines(cfg.lines, no, lns.map(l => Object.assign({}, l, { doc: no })));
        }
        if (andConfirm) {
          if (entity === 'sales_order') ACT.confirmSO(target);
          else if (entity === 'purchase_order') ACT.confirmPO(target);
          else if (entity === 'os_order') ACT.confirmOS(target);
          else if (SUBMIT_HOOK[entity]) SUBMIT_HOOK[entity](target);
          else { const t = DB.find(entity, target); t.status = 'pending'; DB.upsert(entity, t); }
        }
        UI.toast((isNew ? '已创建' : '已保存') + ' ' + cfg.title + ' ' + target);
        if (rerender) rerender(); else APP.refresh();
        if (isNew) setTimeout(() => open(entity, target), 120);
      } catch (e) { UI.toast(e.message, 'err'); return false; }
    }
    return m;
  }
  function defVals(fields) {
    const o = {};
    fields.forEach(f => {
      const dv = typeof f.def === 'function' ? f.def() : f.def;
      if (dv !== undefined) o[f.k] = dv;
    });
    return o;
  }

  /* 行编辑器 */
  function LineEditor(host, cfg, initial, modal) {
    let rows = initial || [];
    const self = this;
    this.add = function (pre) {
      rows.push({ product: pre || '', product_name: '', qty: pre ? suggested(pre, cfg) : 10, price: pre ? priceOf(pre, cfg) : 0, discount: 0, tax: pre ? (DB.find('products', pre) || {}).tax_rate || 13 : 13, actual_qty: '', lineno: rows.length + 1 });
      paint();
    };
    function priceOf(code, cfg) {
      const p = DB.find('products', code) || {};
      return cfg.entity === 'sales_order' ? (p.price || 0) : (p.cost || 0);
    }
    function suggested(code, cfg) {
      const p = DB.find('products', code) || {};
      if (cfg.entity === 'purchase_order' || cfg.entity === 'purchase_req') return Math.max(p.min_order || 20, (p.safety_qty || 20) * 2);
      return 10;
    }
    function paint() {
      const showPrice = cfg.cols.indexOf('price') >= 0;
      const showDiscount = cfg.cols.indexOf('discount') >= 0;
      const showTax = cfg.cols.indexOf('tax') >= 0;
      const isCount = cfg.cols.indexOf('count') >= 0;
      host.innerHTML = `<div class="table-wrap"><table class="lines-tbl"><thead><tr>
        <th style="width:38px">#</th><th style="width:230px">物料 / 商品</th>
        ${isCount ? '<th style="width:100px" class="right">账面数量</th><th style="width:120px" class="right">实盘数量</th>' : '<th style="width:110px" class="right">数量</th>'}
        ${showPrice ? '<th style="width:120px" class="right">单价</th>' : ''}${showDiscount ? '<th style="width:90px" class="right">折扣</th>' : ''}${showTax ? '<th style="width:90px" class="right">税率</th>' : ''}
        <th style="width:130px" class="right">金额</th><th style="width:120px">备注</th><th class="rm"></th></tr></thead>
        <tbody id="ed-body">${rows.map((r, i) => rowHTML(r, i, { showPrice, showDiscount, showTax, isCount })).join('')}</tbody></table></div>
        <div class="flex mt12"><button class="btn sm" id="ed-add">${icon('plus')}添加明细行</button>
        <select id="ed-pick" style="width:250px"><option value="">从商品库快速添加…</option>${DB.list('products').filter(p => p.status === 'enabled').map(p => `<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
        <div class="lines-sum grow" style="justify-content:flex-end;border:0;padding:0" id="ed-sum"></div></div>`;
      $('#ed-add', host).addEventListener('click', () => self.add());
      $('#ed-pick', host).addEventListener('change', ev => { if (ev.target.value) { self.add(ev.target.value); ev.target.value = ''; } });
      UI.$$('input,select', host).forEach(el => el.addEventListener('input', () => { harvest(); paintSum(); }));
      UI.$$('.del', host).forEach(b => b.addEventListener('click', () => { harvest(); rows.splice(+b.dataset.i, 1); paint(); paintSum(); }));
      paintSum();
    }
    function rowHTML(r, i, f) {
      const p = DB.find('products', r.product) || {};
      const stock = ACT.stockRow(r.product, 'WH-HZ01');
      return `<tr data-i="${i}"><td class="muted">${i + 1}</td>
        <td><select data-f="product" style="width:100%">${['<option value="">请选择物料</option>'].concat(DB.list('products').filter(x => x.status === 'enabled').map(x => `<option value="${esc(x.code)}" ${x.code === r.product ? 'selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`)).join('')}</select></td>
        ${f.isCount ? `<td class="right money">${r.product ? num(ACT.available(r.product, (DB.find('stock', r.product + '-WH-HZ01') || {}).warehouse || 'WH-HZ01')) : '—'}<div class="cell-sub">${p.name ? esc(p.name) : ''}</div></td>
            <td class="right"><input type="number" data-f="actual_qty" value="${r.actual_qty}" placeholder="实盘" class="num right"></td>`
        : `<td class="right"><input type="number" data-f="qty" value="${r.qty}" min="0" class="num right"></td>`}
        ${f.showPrice ? `<td class="right"><input type="number" step="0.01" data-f="price" value="${r.price}" class="num right"></td>` : ''}
        ${f.showDiscount ? `<td class="right"><input type="number" step="0.01" data-f="discount" value="${r.discount || 0}" class="num right" title="0-1 之间,如 0.05"></td>` : ''}
        ${f.showTax ? `<td class="right"><select data-f="tax">${[13, 9, 6, 0].map(t => `<option value="${t}" ${t === (r.tax || p.tax_rate) ? 'selected' : ''}>${t}%</option>`).join('')}</select></td>` : ''}
        <td class="right money strong">¥${money(amount(r, f))}</td>
        <td><input data-f="memo" value="${esc(r.memo || '')}" placeholder="选填"></td>
        <td class="rm"><button class="del" data-i="${i}" title="删除该行">${icon('close')}</button></td></tr>`;
    }
    function amount(r, f) {
      if (f && f.isCount) { const p = DB.find('products', r.product) || {}; return r.actual_qty === '' ? 0 : (+r.actual_qty - ACT.available(r.product, 'WH-HZ01')) * (p.cost || 0); }
      return r.qty * r.price * (1 - (r.discount || 0)) * (1 + (r.tax || 0) / 100);
    }
    function harvest() {
      UI.$$('#ed-body tr', host).forEach(tr => {
        const i = +tr.dataset.i, r = rows[i]; if (!r) return;
        UI.$$('[data-f]', tr).forEach(el => {
          const k = el.dataset.f;
          r[k] = ['qty', 'price', 'discount', 'tax', 'actual_qty'].indexOf(k) >= 0 ? (el.value === '' ? '' : +el.value) : el.value;
        });
        const p = DB.find('products', r.product) || {};
        r.product_name = p.name || '';
        if (!r.tax) r.tax = p.tax_rate || 13;
      });
    }
    function paintSum() {
      const f = { isCount: cfg.cols.indexOf('count') >= 0 };
      const total = rows.reduce((s, r) => s + amount(r, f), 0);
      const net = rows.reduce((s, r) => s + r.qty * r.price * (1 - (r.discount || 0)), 0);
      $('#ed-sum', host).innerHTML = f.isCount ? `<span>预计差异金额 <b>¥${money(total)}</b></span>` :
        `<span>不含税 <b>¥${money(net)}</b></span><span>税额 <b>¥${money(total - net)}</b></span><span style="font-size:13px">价税合计 <b style="color:var(--primary)">¥${money(total)}</b></span>`;
    }
    this.values = function () {
      harvest();
      const isCount = cfg.cols.indexOf('count') >= 0;
      return rows.filter(r => r.product && (isCount ? true : r.qty > 0)).map((r, i) => ({
        lineno: i + 1, product: r.product, product_name: r.product_name, qty: r.qty, price: r.price,
        discount: r.discount || 0, tax_rate: r.tax || 13, amount: r2(r.qty * r.price * (1 - (r.discount || 0))),
        delivered: r.delivered || 0, received: r.received || 0, actual_qty: r.actual_qty === '' ? null : r.actual_qty,
        book_qty: r.book_qty, diff: r.diff, cost: r.cost, diff_amount: r.diff_amount, memo: r.memo || ''
      }));
    };
    paint();
  }

  /* ---------------- 盘点录入 ---------------- */
  function openStocktake(no, rerender, d) {
    const st = DB.find('stocktake', no);
    const stocks = DB.where('stock', s => s.warehouse === st.warehouse);
    const rows = stocks.map(s => ({ product: s.product, product_name: s.product_name, book_qty: s.qty, actual_qty: s.qty }));
    const m = UI.modal({
      title: '录入实盘数量', subtitle: st.warehouse + ' · ' + st.no, width: 'wide',
      body: `<div class="table-wrap" style="max-height:52vh;overflow:auto"><table class="lines-tbl"><thead><tr><th>物料</th><th>商品名称</th><th class="right" style="width:100px">账面数量</th><th class="right" style="width:120px">实盘数量</th><th class="right" style="width:100px">差异</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-i="${i}"><td class="mono">${esc(r.product)}</td><td>${esc(r.product_name)}</td><td class="right money">${num(r.book_qty)}</td>
          <td class="right"><input type="number" data-a="${i}" value="${r.actual_qty}" class="num right"></td><td class="right" data-d="${i}">0</td></tr>`).join('')}</tbody></table></div>
        <div class="notice mt12">${icon('info')}<div>过账后仅对存在差异的行生成盘盈/盘亏流水与调整凭证(借 主营业务成本/其他成本,贷 库存商品)。</div></div>`,
      actions: [{ label: '取消' }, { label: '盘点过账', cls: 'primary', icon: 'check', onClick: mm => {
        const plan = rows.map((r, i) => ({ product: r.product, actual_qty: +($(`[data-a="${i}"]`, mm.el) || { value: r.book_qty }).value }));
        try { const res = ACT.postStocktake(no, plan, '实盘录入过账'); UI.toast(`盘点完成:${res.diffLines} 行差异,金额 ¥${money(res.diffAmount)}`); rerender(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    UI.$$('[data-a]', m.el).forEach(inp => inp.addEventListener('input', () => {
      const i = +inp.dataset.a, box = $(`[data-d="${i}"]`, m.el);
      const dv = (+inp.value) - rows[i].book_qty;
      box.innerHTML = `<span class="money" style="color:${dv === 0 ? 'var(--text-3)' : dv > 0 ? 'var(--success)' : 'var(--danger)'}">${dv > 0 ? '+' : ''}${dv}</span>`;
    }));
  }

  /* ---------------- 主数据画像 ---------------- */
  function masterDetail(entity, id) {
    const e = SCHEMA.entities[entity], row = DB.find(entity, id);
    if (!row) return;
    let extra = '', foot = '';
    const pk = e.pk;
    if (entity === 'customers') {
      const invs = DB.where('invoice', i => i.customer === id);
      const ar = r2(invs.reduce((s, i) => s + i.balance, 0));
      const credit = row.credit_limit || 0;
      const ratio = credit ? Math.min(100, ar / credit * 100) : 0;
      const orders = DB.where('sales_order', o => o.customer === id);
      extra = `<div class="card"><div class="card-head"><h3>${icon('wallet')}应收与信用</h3><div class="right">${UI.badge(ratio > 85 ? 'shortage' : ratio > 60 ? 'low' : 'normal')}</div></div>
        <div class="card-body"><div class="stat-row"><div>累计订单<b>¥${money(r2(orders.reduce((s, o) => s + o.total, 0)))}</b></div><div>订单数<b>${orders.length}</b></div><div>应收余额<b>¥${money(ar)}</b></div><div>信用额度<b>¥${money(credit)}</b></div></div>
        <div class="mt12">信用占用率 <b class="mono">${ratio.toFixed(1)}%</b><div class="progress mt8" style="height:9px"><i class="${ratio > 85 ? 'bad' : ratio > 60 ? 'warn' : 'ok'}" style="width:${ratio}%"></i></div></div></div></div>
        <div class="card"><div class="card-head"><h3>${icon('receipt')}最近发票</h3></div>${invsTable(invs)}</div>`;
      foot = `<button class="btn" data-md="so">${icon('plus')}新建销售订单</button>`;
    } else if (entity === 'suppliers') {
      const bills = DB.where('bill', b => b.supplier === id);
      const ap = r2(bills.reduce((s, b) => s + b.balance, 0));
      const pos = DB.where('purchase_order', p => p.supplier === id);
      extra = `<div class="card"><div class="card-head"><h3>${icon('card')}应付与合作</h3></div><div class="card-body">
        <div class="stat-row"><div>采购订单<b>${pos.length} 单</b></div><div>采购金额<b>¥${money(r2(pos.reduce((s, p) => s + p.total, 0)))}</b></div><div>应付余额<b>¥${money(ap)}</b></div><div>交付周期<b>${row.lead_time} 天</b></div><div>绩效评分<b>${row.rating}</b></div></div></div></div>
        <div class="card"><div class="card-head"><h3>${icon('receipt')}最近账单</h3></div>${billsTable(bills)}</div>`;
      foot = `<button class="btn" data-md="po">${icon('plus')}新建采购订单</button>`;
    } else if (entity === 'products') {
      const ss = DB.where('stock', s => s.product === id);
      const totalQty = ss.reduce((s, x) => s + x.qty, 0), value = r2(ss.reduce((s, x) => s + x.value, 0));
      const mv = DB.where('stock_movements', m => m.product === id).slice(-12).reverse();
      const margin = row.price ? ((row.price - row.cost) / row.price * 100) : 0;
      extra = `<div class="card"><div class="card-head"><h3>${icon('layers')}库存分布</h3><div class="right"><span class="muted small">毛利率</span><span class="badge ${margin > 45 ? 'b-success' : margin > 25 ? 'b-warning' : 'b-danger'}">${margin.toFixed(1)}%</span></div></div>
        <div class="card-body"><div class="stat-row"><div>总库存<b>${num(totalQty)}</b></div><div>可用<b>${num(ss.reduce((s, x) => s + x.available, 0))}</b></div><div>库存金额<b>¥${money(value)}</b></div><div>安全库存<b>${num(row.safety_qty)}</b></div></div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>仓库</th><th class="right">现量</th><th class="right">占用</th><th class="right">可用</th><th class="right">单位成本</th><th class="right">库存金额</th><th>状态</th></tr></thead>
        <tbody>${ss.length ? ss.map(s => `<tr><td>${esc((DB.find('warehouses', s.warehouse) || {}).name || s.warehouse)}</td><td class="right money">${num(s.qty)}</td><td class="right money">${num(s.reserved)}</td><td class="right money strong">${num(s.available)}</td><td class="right money">¥${money(s.cost)}</td><td class="right money">¥${money(s.value)}</td><td>${UI.badge(s.status)}</td></tr>`).join('') : `<tr><td colspan="7">${UI.emptyBox('该物料暂无库存记录')}</td></tr>`}</tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>${icon('swap')}最近出入库流水</h3><div class="right"><button class="btn sm" data-md="adjust">${icon('edit')}库存调整</button></div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>流水号</th><th>日期</th><th>类型</th><th>仓库</th><th class="right">数量</th><th class="right">金额</th><th>关联单据</th></tr></thead>
        <tbody>${mv.length ? mv.map(m => `<tr><td class="mono">${esc(m.no)}</td><td>${dateCN(m.date)}</td><td>${UI.badge(m.qty > 0 ? 'normal' : 'partial')}<span class="small muted"> ${esc(SCHEMA.entities.stock_movements.fields.type.opts[m.type] || m.type)}</span></td>
        <td>${esc((DB.find('warehouses', m.warehouse) || {}).name || m.warehouse)}</td><td class="right money" style="${m.qty < 0 ? 'color:var(--danger)' : ''}">${m.qty > 0 ? '+' : ''}${num(m.qty)}</td><td class="right money">¥${money(m.amount)}</td>
        <td>${m.ref ? `<span class="cell-link mono" data-jump="${refJump(m.ref)}">${esc(m.ref)}</span>` : '—'}</td></tr>`).join('') : `<tr><td colspan="7">${UI.emptyBox('暂无流水')}</td></tr>`}</tbody></table></div></div>`;
      foot = `<button class="btn" data-md="adjust">${icon('edit')}库存调整</button><button class="btn" data-md="tr">${icon('swap')}发起调拨</button>`;
    } else if (entity === 'warehouses') {
      const ss = DB.where('stock', s => s.warehouse === id);
      extra = `<div class="card"><div class="card-head"><h3>${icon('layers')}库存概况</h3></div><div class="card-body"><div class="stat-row">
        <div>SKU 数<b>${ss.length}</b></div><div>库存件数<b>${num(ss.reduce((s, x) => s + x.qty, 0))}</b></div><div>库存金额<b>¥${money(r2(ss.reduce((s, x) => s + x.value, 0)))}</b></div><div>低库存 SKU<b>${ss.filter(s => s.status !== 'normal').length}</b></div></div></div></div>`;
    } else if (entity === 'users') {
      const acts = DB.where('activity', a => a.user === row.name).slice(0, 20);
      extra = `<div class="card"><div class="card-head"><h3>${icon('clock')}该用户操作记录</h3></div><div class="card-body">${acts.length ? `<div class="timeline">${acts.map(a => `<div class="tl-item done"><b>${esc(a.action)}</b><span class="when">${esc(a.time)}</span><p>${esc(a.module)}${a.ref ? ' · ' + esc(a.ref) : ''} ${esc(a.detail || '')}</p></div>`).join('')}</div>` : UI.emptyBox('暂无操作记录')}</div></div>`;
    } else if (entity === 'processors') {
      const os = DB.where('os_order', o => o.processor === id).slice(-8).reverse();
      const aud = DB.where('processor_audit', a => a.processor === id).slice(-6).reverse();
      const done = os.filter(o => o.status === 'done');
      const fee = r2(done.reduce((s, o) => s + (o.fee_amount || 0), 0));
      extra = `<div class="card"><div class="card-head"><h3>${icon('swap')}加工绩效</h3><div class="right">${UI.badge(row.qualification)}</div></div>
        <div class="card-body"><div class="stat-row"><div>委外工单<b>${os.length} 单</b></div><div>完工批次<b>${done.length}</b></div><div>累计加工费<b>¥${money(fee)}</b></div><div>月产能<b>${num(row.capacity)} 件</b></div><div>核定单价<b>¥${money(row.unit_rate)}</b></div><div>一次合格率<b>${((+row.pass_rate || 0) <= 1 ? (+row.pass_rate || 0) * 100 : +row.pass_rate || 0).toFixed(1)}%</b></div></div>
        <div class="mt12">综合评分 <b class="mono">${row.rating || 0}</b><div class="progress mt8" style="height:9px"><i class="${(row.rating || 0) >= 80 ? 'ok' : (row.rating || 0) >= 60 ? 'warn' : 'bad'}" style="width:${row.rating || 0}%"></i></div></div></div></div>
        <div class="card"><div class="card-head"><h3>${icon('clipboard')}审核记录</h3></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>审核单</th><th>日期</th><th>审核人</th><th>打样</th><th class="right">综合得分</th><th class="right">核定单价</th><th>结论</th></tr></thead><tbody>
        ${aud.length ? aud.map(a => `<tr><td class="mono cell-link" data-jump="processor_audit=${encodeURIComponent(a.no)}">${esc(a.no)}</td><td>${dateCN(a.date)}</td><td>${esc(a.auditor)}</td><td>${esc(SCHEMA.entities.processor_audit.fields.sample_result.opts[a.sample_result] || a.sample_result || '—')}</td><td class="right money">${num(a.total_score)}</td><td class="right money">¥${money(a.unit_rate)}</td><td>${UI.badge(a.conclusion || a.status)}</td></tr>`).join('') : `<tr><td colspan="7">${UI.emptyBox('暂无审核记录')}</td></tr>`}</tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>${icon('file')}最近委外加工单</h3></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>加工单</th><th>日期</th><th>成品</th><th class="right">计划数</th><th class="right">已收数</th><th class="right">加工费</th><th>状态</th></tr></thead><tbody>
        ${os.length ? os.map(o => `<tr><td class="mono cell-link" data-jump="os_order=${encodeURIComponent(o.no)}">${esc(o.no)}</td><td>${dateCN(o.date)}</td><td>${esc(o.output_name || o.output_product)}</td><td class="right money">${num(o.output_qty)}</td><td class="right money">${num(o.received_qty)}</td><td class="right money">¥${money(o.fee_amount)}</td><td>${UI.badge(o.status)}</td></tr>`).join('') : `<tr><td colspan="7">${UI.emptyBox('暂无委外工单')}</td></tr>`}</tbody></table></div></div>`;
      foot = `<button class="btn" data-md="pa">${icon('clipboard')}发起外协商审核</button><button class="btn" data-md="os">${icon('swap')}新建委外加工单</button>`;
    } else if (entity === 'role') {
      const users = DB.where('users', u => u.role === row.name);
      const perms = row.perms || [];
      extra = `<div class="card"><div class="card-head"><h3>${icon('settings')}权限矩阵</h3><div class="right"><span class="muted small">级别 ${row.level} · 已授权 ${perms.length} 项</span></div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>功能模块</th><th>查看</th><th>编辑</th><th>审批</th></tr></thead><tbody>
        ${SCHEMA.PERM_MODULES.map(m => `<tr><td>${esc(m.label)}</td>${['view', 'edit', 'approve'].map(a => `<td>${perms.indexOf(m.key + ':' + a) >= 0 ? '<span class="badge b-success">允许</span>' : '<span class="badge b-plain">—</span>'}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>${icon('user')}该角色用户</h3></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>工号</th><th>姓名</th><th>部门</th><th>邮箱</th><th>最近登录</th><th>状态</th></tr></thead><tbody>
        ${users.length ? users.map(u => `<tr><td class="mono">${esc(u.code)}</td><td class="cell-main">${esc(u.name)}</td><td>${esc(u.dept)}</td><td class="muted">${esc(u.email || '')}</td><td class="small muted">${esc(u.last_login || '')}</td><td>${UI.badge(u.status)}</td></tr>`).join('') : `<tr><td colspan="6">${UI.emptyBox('暂无用户挂在该角色下')}</td></tr>`}</tbody></table></div></div>`;
      foot = `<button class="btn" data-md="perm">${icon('settings')}编辑权限</button>`;
    } else if (entity === 'gl_account') {
      const ls = DB.list('journal_lines').filter(l => l.account === id).slice(-30).reverse();
      extra = `<div class="card"><div class="card-head"><h3>${icon('book')}明细账</h3><div class="right"><span class="muted small">余额(借正贷负)</span><span class="badge ${row.balance >= 0 ? 'b-info' : 'b-purple'}">¥${money(row.balance)}</span></div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>凭证号</th><th>日期</th><th>摘要</th><th class="right">借方</th><th class="right">贷方</th></tr></thead>
        <tbody>${ls.map(l => `<tr><td class="mono cell-link" data-jump="journal=${encodeURIComponent(l.doc)}">${esc(l.doc)}</td><td>${dateCN((DB.find('journal', l.doc) || {}).date)}</td><td>${esc(l.memo)}</td><td class="right money">${l.debit ? money(l.debit) : '—'}</td><td class="right money">${l.credit ? money(l.credit) : '—'}</td></tr>`).join('')}</tbody></table></div></div>`;
    }

    const d = UI.drawer({
      head: `<div><div class="flex" style="gap:10px"><h3 style="font-size:16.5px">${esc(row.name || row[pk])}</h3>${UI.badge(row.status || row.type || 'posted')}</div>
             <div class="muted small" style="margin-top:3px"><span class="mono">${esc(row[pk])}</span> · ${esc(e.label)} · ${esc(e.table)}</div></div>`,
      body: `<div class="card"><div class="card-head"><h3>${icon('info')}档案信息</h3></div><div class="card-body">
        ${UI.descs(Object.keys(e.fields).filter(k => k !== 'note' && !e.fields[k].hidden).map(k => [e.fields[k].l, fieldText(entity, k, row, e.fields[k])]))}
        ${row.note ? `<div class="notice mt12">${icon('info')}<div>${esc(row.note)}</div></div>` : ''}</div></div>${extra}`,
      foot: `<button class="btn" data-md="edit">${icon('edit')}编辑档案</button>${foot}<div class="right"><button class="btn" data-close>关闭</button></div>`
    });
    d.el.querySelectorAll('[data-md]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.md;
      if (a === 'edit') { d.close(); LIST.masterForm(entity, id); }
      else if (a === 'so') { d.close(); DOC.newDoc('sales_order'); }
      else if (a === 'po') { d.close(); DOC.newDoc('purchase_order'); }
      else if (a === 'tr') { d.close(); DOC.newDoc('transfer'); }
      else if (a === 'pa') { d.close(); DOC.newDoc('processor_audit', { processor: id }); }
      else if (a === 'os') { d.close(); DOC.newDoc('os_order', { processor: id }); }
      else if (a === 'perm') { d.close(); FLOW.permsFor(id); }
      else if (a === 'adjust') adjustDialog(entity, id, row);
    }));
    d.el.querySelectorAll('[data-jump]').forEach(el => el.addEventListener('click', () => { const [ent, id2] = el.dataset.jump.split('='); d.close(); open(ent, decodeURIComponent(id2)); }));
    d.el.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); const [ent, id2] = el.dataset.open.split('='); d.close(); open(ent, decodeURIComponent(id2)); }));
  }
  function refJump(ref) {
    if (/^SO\d/.test(ref)) return 'sales_order=' + ref;
    if (/^PO\d/.test(ref)) return 'purchase_order=' + ref;
    if (/^DL/.test(ref)) return 'delivery=' + ref;
    if (/^GR/.test(ref)) return 'gr=' + ref;
    if (/^TR/.test(ref)) return 'transfer=' + ref;
    if (/^ST/.test(ref)) return 'stocktake=' + ref;
    return 'sales_order=' + ref;
  }
  function invsTable(invs) {
    return settleTable(invs.slice(-8).reverse(), '发票号', '未收', 'invoice');
  }
  function billsTable(bills) {
    return settleTable(bills.slice(-8).reverse(), '账单号', '未付', 'bill');
  }
  function settleTable(rows, noLabel, balLabel, target) {
    const head = `<tr><th>${noLabel}</th><th>单据日</th><th>到期日</th><th class="right">价税合计</th><th class="right">${balLabel}</th><th>状态</th></tr>`;
    const body = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const red = r.balance > 0 ? ' style="color:var(--danger)"' : '';
      body.push(['<tr>',
        '<td class="mono cell-link" data-jump="', target, '=', encodeURIComponent(r.no), '">', esc(r.no), '</td>',
        '<td>', dateCN(r.date), '</td>',
        '<td>', dateCN(r.due_date), '</td>',
        '<td class="right money">', '¥', money(r.total), '</td>',
        '<td class="right money"', red, '>', '¥', money(r.balance), '</td>',
        '<td>', UI.badge(r.status, target === 'bill' ? 'ap' : ''), '</td>',
        '</tr>'].join(''));
    }
    return '<div class="table-wrap"><table class="tbl"><thead>' + head + '</thead><tbody>' + body.join('') + '</tbody></table></div>';
  }
  function adjustDialog(entity, id, row) {
    const whs = DB.list('warehouses');
    const fields = [
      { k: 'warehouse', label: '仓库', type: 'ref', ref: 'warehouses', required: true, def: whs[0].code },
      { k: 'delta', label: '调整数量(±)', type: 'int', required: true, ph: '负数表示减少' },
      { k: 'reason', label: '调整原因', type: 'text', required: true, full: true, ph: '如:报损 / 样机领用 / 系统纠错' }];
    UI.modal({ title: '库存调整 · ' + row.name, width: '', body: UI.form(fields, {}) + `<div class="notice mt12">${icon('warn')}<div>手工调整会生成出入库流水并同步库存金额,请确保已获仓储主管审批。</div></div>`,
      actions: [{ label: '取消' }, { label: '确认调整', cls: 'primary', icon: 'check', onClick: m => {
        const rd = UI.readForm(m.el, fields); if (!rd.ok) { UI.toast('请填写完整', 'err'); return false; }
        try { ACT.adjustStock(id, rd.values.warehouse, rd.values.delta, rd.values.reason); UI.toast('库存已调整'); APP.refresh(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }] });
  }

  /* ---------------- 打印 ---------------- */
  function printDoc(entity, no) {
    const cfg = CFG[entity]; if (!cfg) return;
    const row = DB.find(entity, no), e = SCHEMA.entities[entity];
    const lines = cfg.docTable ? (cfg.isJournal ? DB.list('journal_lines').filter(l => l.doc === no) : DB.lines(cfg.docTable, no)) : [];
    const head = Object.keys(e.fields).filter(k => !e.fields[k].hidden && k !== 'status').slice(0, 8);
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { UI.toast('浏览器拦截了打印窗口,请允许弹出窗口', 'warn'); return; }
    const meta = DB.all().meta;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${cfg.table} ${no}</title><style>
      *{box-sizing:border-box}body{font:13px/1.6 "Microsoft YaHei",system-ui;margin:0;padding:38px;color:#111}
      h1{font-size:19px;text-align:center;margin:0 0 4px} .co{text-align:center;color:#666;font-size:12px;margin-bottom:22px}
      .meta{display:flex;justify-content:space-between;margin-bottom:14px;font-size:12.5px}
      table{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #bbb;padding:7px 9px;font-size:12px}
      th{background:#f2f3f7}.r{text-align:right} .sign{display:flex;justify-content:space-between;margin-top:44px;font-size:12px;color:#556}
      .tot{margin-top:10px;text-align:right;font-size:14px;font-weight:600}</style></head><body>
      <h1>${meta.company}</h1><div class="co">${cfg.table} · ${e.table} &nbsp;|&nbsp; 纳税人识别号 ${meta.taxNo}</div>
      <div class="meta"><div>${head.slice(0, 4).map(k => `${e.fields[k].l}: <b>${fmt(row[k], e.fields[k])}</b>`).join(' &nbsp; ')}</div><div>单据号: <b class="mono">${no}</b></div></div>
      <div class="meta"><div>${head.slice(4).map(k => `${e.fields[k].l}: <b>${fmt(row[k], e.fields[k])}</b>`).join(' &nbsp; ')}</div><div>打印时间: ${DB.nowStr()}</div></div>
      <table><thead><tr>${cfg.isJournal ? '<th>科目</th><th>摘要</th><th class="r">借方</th><th class="r">贷方</th>' : entity === 'stocktake' ? '<th>#</th><th>物料</th><th>名称</th><th class="r">账面</th><th class="r">实盘</th><th class="r">差异</th>' : '<th>#</th><th>物料编码</th><th>商品名称</th><th class="r">数量</th><th class="r">单价</th><th class="r">折扣</th><th class="r">税率</th><th class="r">金额</th>'}</tr></thead>
      <tbody>${lines.map((l, i) => cfg.isJournal ? `<tr><td>${l.account}</td><td>${l.account_name} ${l.memo || ''}</td><td class="r">${l.debit ? money(l.debit) : ''}</td><td class="r">${l.credit ? money(l.credit) : ''}</td></tr>`
        : entity === 'stocktake' ? `<tr><td>${i + 1}</td><td>${l.product}</td><td>${l.product_name}</td><td class="r">${l.book_qty}</td><td class="r">${l.actual_qty}</td><td class="r">${l.diff}</td></tr>`
        : `<tr><td>${i + 1}</td><td>${l.product}</td><td>${l.product_name}</td><td class="r">${num(l.qty)}</td><td class="r">${money(l.price)}</td><td class="r">${l.discount ? (l.discount * 100) + '%' : '—'}</td><td class="r">${(l.tax_rate || 0)}%</td><td class="r">${money(l.amount)}</td></tr>`).join('')}</tbody></table>
      <div class="tot">价税合计:<span>${money(row.total || row.amount || row.fee_amount || row.debit || 0)}</span> &nbsp; 币种:${row.currency || 'CNY'}</div>
      <div class="sign"><div>制单: ${row.user || DB.currentUser()}</div><div>审核: __________</div><div>客户/供应商签收: __________</div><div>财务: __________</div></div>
      </body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { } }, 320);
    function fmt(v, f) {
      if (!v) return '—';
      if (f.t === 'money') return '¥' + money(v);
      if (f.t === 'ref') { const r = DB.find(f.ref, v); return r ? (r.name ? r.name + '(' + v + ')' : v) : v; }
      if (f.t === 'select' && SCHEMA.STATUS[v]) return SCHEMA.STATUS[v].l;
      return v;
    }
  }

  return { open, newDoc, masterDetail, CFG, NEW_CFG, printDoc, editDoc };
})();
