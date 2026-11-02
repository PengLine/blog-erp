/* ============================================================
 * views-docs.js — 单据明细(工作流 + 行编辑器)+ 主数据画像
 * ============================================================ */
window.DOC = (function () {

  const r2 = UI.round2, esc = UI.esc, money = UI.money, num = UI.num, icon = UI.icon, dateCN = UI.dateCN;
  const r4 = v => Math.round((+v || 0) * 10000) / 10000;   /* 清单单件用量可到 4 位小数 */
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
        if (o.status === 'draft') a.push({ l: '申请改价', icon: 'wallet', run: 'priceAsk' });
        a.push({ l: '打印', icon: 'print', run: 'print' });
        return a;
      },
      extra(o) { return priceCheckCard(o); }
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
    gr: { table: '采购收货单', pk: 'no', docTable: 'gr_lines',
      steps: ['posted', 'iqc', 'bill'], stepLabels: { posted: '收货暂估入账', iqc: '来料检验放行', bill: '票到清算' },
      stepState(o) {
        const iq = DB.where('iqc', a => a.gr === o.no);
        const cleared = o.status === 'returned' || !iq.length || iq.some(a => a.status !== 'to_check');
        return { posted: 1, iqc: cleared ? 1 : 0, bill: DB.where('bill', b => b.gr === o.no).length ? 1 : 0 };
      },
      actions(o) {
        const a = [];
        const sup = DB.find('suppliers', o.supplier) || {};
        const iq = DB.where('iqc', x => x.gr === o.no)[0];
        if (o.status === 'returned') a.push({ l: '查看检验结论', cls: 'danger-ghost', icon: 'shield', run: 'grIqc' });
        else if (o.status === 'posted') {
          if (!DB.where('bill', b => b.gr === o.no).length) a.push({ l: '录入发票并清算', cls: 'primary', icon: 'receipt', run: 'toBill' });
          if (iq) a.push({ l: iq.status === 'to_check' ? '填写抽检结论' : '查看检验单', cls: iq.status === 'to_check' ? 'success' : '', icon: 'shield', run: 'grIqc' });
          else a.push({ l: sup.qc_policy === 'skip' ? '例外抽送检' : '补报来料检验', cls: 'success', icon: 'shield', run: 'grReport' });
        }
        a.push({ l: '打印', icon: 'print', run: 'print' });
        return a;
      } },
    iqc: {
      table: '来料检验单', pk: 'no', docTable: 'iqc_lines',
      steps: ['reported', 'judged'], stepLabels: { reported: '收货自动报检', judged: '抽样检验判定' },
      stepState(o) { return { reported: 1, judged: o.status !== 'to_check' ? 1 : 0 }; },
      actions(o) {
        const a = [];
        if (o.status === 'to_check') a.push({ l: '录入抽检结果', cls: 'primary', icon: 'shield', run: 'iqcJudge' });
        if (o.gr) a.push({ l: '查看来源收货单', icon: 'download', run: 'iqcGr' });
        if (o.status !== 'to_check' && o.supplier) a.push({ l: '供应商质量画像', icon: 'user', run: 'iqcSup' });
        a.push({ l: '打印检验报告', icon: 'print', run: 'print' });
        return a;
      }
    },
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
        const node = o.status === 'pending' ? ACT.SIGN.node(o) : null;
        const lv = node && o.chain.length > 1 ? `第 ${o.step + 1}/${o.chain.length} 级 · ` : '';
        if (o.status === 'pending') a.push({ l: lv + '同意', cls: 'success', icon: 'check', run: 'apApprove' }, { l: lv + '驳回', cls: 'danger-ghost', icon: 'close', run: 'apReject' });
        if (o.status === 'rejected' && !o.resubmit) a.push({ l: '修改重提', cls: 'primary', icon: 'refresh', run: 'apResubmit' });
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

    /* ---------------- 追溯:批次台账 / 库位主档 ---------------- */
    lot: {
      table: '批次台账', pk: 'no', docTable: 'lot_tx',
      steps: ['receipt', 'release', 'onhand', 'issue'],
      stepLabels: { receipt: '收货建批', release: '质检放行', onhand: '在库管控', issue: '出库分配' },
      stepState(l) {
        const inQC = l.warehouse === SCHEMA.QC_WH;
        const held = l.status === 'frozen' || l.status === 'expired';
        return { receipt: 1, release: inQC || held ? 0 : 1, onhand: l.qty > 0 ? 1 : 0, issue: l.qty > 0 ? 0 : 1 };
      },
      actions(l) {
        const a = [];
        if (l.qty > 0) {
          if (l.status === 'normal') a.push({ l: '质量冻结', cls: 'danger-ghost', icon: 'lock', run: 'lotFreeze' });
          if (l.status === 'frozen') a.push({ l: '复检放行', cls: 'success', icon: 'unlock', run: 'lotRelease' });
          if (l.status !== 'normal') a.push({ l: '批次处置', cls: 'danger-ghost', icon: 'trash', run: 'lotScrap' });
          a.push({ l: '库位移位', icon: 'grid', run: 'lotMove' });
          a.push({ l: '召回影响分析', cls: 'primary', icon: 'search', run: 'lotRecall' });
        }
        a.push({ l: '打印追溯卡', icon: 'print', run: 'print' });
        return a;
      },
      extra(l) { return traceCard(l); }
    },
    bins: {
      table: '库位主档', pk: 'code', docTable: null, steps: [], stepLabels: {}, stepState() { return {}; },
      actions() { return [{ l: '打印库位标签', icon: 'print', run: 'binLabel' }]; },
      extra(b) { return binCard(b); }
    },

    /* ---------------- 价格策略:价目表生命周期 ---------------- */
    price_list: {
      table: '价目表 / 价格策略', pk: 'no', docTable: 'pl_lines',
      steps: ['draft', 'pending', 'approved'], stepLabels: { draft: '编制价目表', pending: '分级核准', approved: '生效取价' },
      stepState(o) { const ok = o.status === 'approved' ? 1 : 0; return { draft: 1, pending: ok, approved: ok }; },
      actions(o) {
        const a = [];
        if (['draft', 'rejected'].includes(o.status)) a.push({ l: '提交核准', cls: 'primary', icon: 'send', run: 'plSubmit' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (o.status === 'pending') a.push({ l: '查看核准审批', cls: 'success', icon: 'check', run: 'plAp' });
        if (o.status === 'approved') a.push({ l: '停用策略', cls: 'danger-ghost', icon: 'close', run: 'plRetire' });
        a.push({ l: '打印价目表', icon: 'print', run: 'print' });
        return a;
      },
      extra(o) { return priceListCard(o); }
    },

    /* ---------------- 计划:物料清单 / MRP 运算 ---------------- */
    bom: {
      table: '物料清单 BOM', pk: 'no', docTable: 'bom_lines',
      steps: ['draft', 'pending', 'approved', 'running'],
      stepLabels: { draft: '编制工程清单', pending: '变更分级核准', approved: '核准生效', running: '进入计划运算' },
      stepState(o) {
        const ok = o.status === 'approved' ? 1 : 0;
        const live = ok && (!o.effect_to || o.effect_to >= DB.today()) && (!o.effect_from || o.effect_from <= DB.today());
        return { draft: 1, pending: o.status === 'draft' ? 0 : 1, approved: ok, running: live };
      },
      actions(o) {
        const a = [];
        if (['draft', 'rejected'].includes(o.status)) a.push({ l: '提交核准', cls: 'primary', icon: 'send', run: 'bomSubmit' }, { l: '编辑', icon: 'edit', run: 'edit' }, { l: '删除', cls: 'danger-ghost', icon: 'trash', run: 'delete' });
        if (o.status === 'pending') a.push({ l: '查看核准审批', cls: 'success', icon: 'check', run: 'bomAp' });
        if (o.status === 'approved') a.push({ l: '工程变更作废', cls: 'danger-ghost', icon: 'close', run: 'bomVoid' });
        a.push({ l: '打印工程清单', icon: 'print', run: 'print' });
        return a;
      },
      extra(o) { return bomTreeCard(o); }
    },
    mrp_run: {
      table: 'MRP 计划运算', pk: 'no', docTable: 'mrp_lines',
      steps: ['computed', 'dispatched', 'closed'],
      stepLabels: { computed: '逐层净需求运算', dispatched: '建议单下达', closed: '运算归档' },
      stepState(o) { return { computed: 1, dispatched: o.status !== 'computed' ? 1 : 0, closed: o.status === 'closed' ? 1 : 0 }; },
      actions(o) {
        const a = [];
        const open = DB.lines('mrp_lines', o.no).filter(l => (l.suggest_qty || 0) > 0 && !l.release).length;
        if (o.status === 'computed' && open) a.push({ l: `下达计划建议(${open})`, cls: 'primary', icon: 'send', run: 'mrpRelease' });
        if (o.status === 'dispatched' && open) a.push({ l: `继续下达(${open})`, cls: 'primary', icon: 'send', run: 'mrpRelease' });
        if (o.status !== 'closed') a.push({ l: '归档运算', cls: 'danger-ghost', icon: 'lock', run: 'mrpClose' });
        a.push({ l: '重新运算', icon: 'refresh', run: 'mrpAgain' });
        a.push({ l: '打印缺口清单', icon: 'print', run: 'print' });
        return a;
      },
      extra(o) { return mrpCard(o); }
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
        const g = permCheck(entity, row, need);
        return `<button class="btn ${a.cls || ''}" data-doc-act="${i}"${g.ok ? '' : ` disabled title="${esc(g.why)}"`}>${icon(a.icon || 'eye')}${esc(a.l)}</button>`;
      }).join('') + `<div class="right"><button class="btn" data-close>关闭</button></div>`
    });
    bindDoc(d, entity, no, cfg);
  }
  function badge(v, kind) { return UI.badge(v, kind); }

  /** 权限闸门:会签单看当前节点签批岗,其余看角色模块矩阵 */
  function permCheck(entity, row, need) {
    if (need === 'view') return { ok: true, why: '' };
    if (entity === 'approval') {
      const node = row.status === 'pending' ? ACT.SIGN.node(row) : null;
      if (node) {
        const g = ACT.SIGN.canSign(node.role);
        return { ok: g.ok, why: g.why || '' };
      }
      if (need === 'edit' && row.status === 'rejected') {
        return { ok: ACT.PERM.can(ACT.PERM.modOf('approval', row.module), 'edit'), why: '仅申请侧岗位可修改重提' };
      }
    }
    return { ok: ACT.PERM.can(ACT.PERM.modOf(entity, row && row.module), need),
      why: `当前用户「${DB.currentUser()}」的角色无${SCHEMA.entities[entity].label}的${need === 'approve' ? '审批' : '执行'}权限` };
  }

  function docBody(entity, row) {
    const cfg = CFG[entity], e = SCHEMA.entities[entity];
    const parts = [];

    if (cfg.steps && cfg.steps.length > 1) parts.push(workflowHTML(row, cfg));
    if (entity === 'approval' && row.chain && row.chain.length) parts.push(chainCard(row));

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

    /* 实体专属扩展区(批次追溯卡、库位占用卡) */
    if (cfg.extra) parts.push(cfg.extra(row));

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
      const opt = f.opts && (typeof f.opts === 'function' ? f.opts() : f.opts)[v];
      if (f.badge) return SCHEMA.STATUS[v] ? UI.badge(v, entity === 'bill' ? 'ap' : '')
        : `<span class="badge b-neutral">${esc(typeof opt === 'string' ? opt : (v || ''))}</span>`;
      if (opt === undefined || opt === null || opt === 1 || opt === true || typeof opt === 'object') return esc((SCHEMA.STATUS[v] || {}).l || v || '');
      return esc(opt);
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

  /* 金额分级会签:节点链视图(岗位、结论、意见、截止与逾期) */
  const NODE_UI = { signed: ['b-success', '已签批'], rejected: ['b-danger', '已驳回'], current: ['b-warning', '待签批'],
    waiting: ['', '未开始'], skipped: ['', '整链终止'] };
  function chainCard(a) {
    const od = ACT.SIGN.overdue(a);
    const roleName = r => { const x = DB.where('role', y => y.name === r)[0]; return x ? `${x.dept} · ${x.name}` : r; };
    return `<div class="card"><div class="card-head"><h3>${icon('layers')}金额分级会签</h3>
      <span class="sub">共 ${a.chain.length} 级 · 申请金额 ¥${money(a.amount)}${od ? ` · <b style="color:var(--danger)">当前节点逾期 ${od} 天</b>` : ''}</span></div>
      <div class="card-body"><div class="grid" style="grid-template-columns:repeat(${a.chain.length},minmax(0,1fr));gap:8px">
      ${a.chain.map((n, i) => {
        const u = NODE_UI[n.state] || NODE_UI.waiting;
        const cur = i === a.step && a.status === 'pending';
        return `<div style="padding:10px;border-radius:10px;background:${cur ? 'var(--primary-50)' : 'var(--surface-2)'};border:1px solid ${cur ? 'var(--primary-100)' : 'var(--border)'}">
          <div class="flex" style="gap:6px"><span style="width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;background:${n.state === 'signed' ? 'var(--success)' : n.state === 'rejected' ? 'var(--danger)' : cur ? 'var(--primary)' : '#CBD2DF'}">${n.state === 'signed' ? '✓' : n.state === 'rejected' ? '×' : i + 1}</span>
            <span class="badge ${u[0]}" style="margin-left:auto">${u[1]}</span></div>
          <div style="font-size:12px;font-weight:650;margin-top:8px">${esc(roleName(n.role))}</div>
          ${n.tier ? `<div class="cell-sub">${esc(n.tier)}</div>` : ''}
          <div class="small" style="margin-top:6px">${esc(n.name || (cur ? '等待签批' : '—'))}${n.proxy ? ' <span class="tag">代签</span>' : ''}${n.auto ? ' <span class="tag">系统</span>' : ''}</div>
          <div class="cell-sub">${n.at ? esc(n.at) : `截止 ${esc(n.due || '—')}`}</div>
          ${n.opinion ? `<div class="small" style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border)">${esc(n.opinion)}</div>` : ''}
        </div>`; }).join('')}
      </div>
      <div class="notice mt12">${icon('info')}<div>档位口径:申请金额 ≥ ¥${money(SCHEMA.SIGN_TIERS[0].min)} 加签财务经理,≥ ¥${money(SCHEMA.SIGN_TIERS[1].min)} 加签总经办;任一级驳回即整链终止,已通过节点的留痕保留。单节点时限:普通 ${SCHEMA.SIGN_DUE.std} 天 / 加急 ${SCHEMA.SIGN_DUE.urgent} 天 / 特急 ${SCHEMA.SIGN_DUE.critical} 天。</div></div>
      ${a.resubmit_of ? `<div class="notice mt12" style="background:var(--surface-2)">${icon('link')}<div>本单为 <span class="mono cell-link" data-jump="approval=${encodeURIComponent(a.resubmit_of)}">${esc(a.resubmit_of)}</span> 的第 ${a.round || 2} 次重提。</div></div>` : ''}
      ${a.resubmit ? `<div class="notice mt12" style="background:var(--surface-2)">${icon('refresh')}<div>已修改重提为 <span class="mono cell-link" data-jump="approval=${encodeURIComponent(a.resubmit)}">${esc(a.resubmit)}</span>。</div></div>` : ''}
      ${a.payload ? `<div class="section-title">申请变更内容</div><div class="small">${esc(JSON.stringify(a.payload))}</div>` : ''}
      </div></div>`;
  }

  /* 各明细子表的列定义(缺省走通用物料行;函数形态可按单头口径调整列) */
  const DOC_COLS = {
    so_lines: [{ k: 'lineno', label: '#' }, { k: 'product', label: '物料编码' }, { k: 'product_name', label: '商品名称' },
      { k: 'qty', label: '数量', right: 1 }, { k: 'delivered', label: '已出库', right: 1 },
      { k: 'price', label: '未税单价', right: 1 }, { k: 'discount', label: '折扣', right: 1 },
      { k: 'tax_rate', label: '税率', right: 1 }, { k: 'amount', label: '不含税金额', right: 1 },
      { k: 'price_src', label: '取价来源', render: (v, l) => priceSrcCell(l) }],
    pl_lines: row => {
      const taxInc = row.tax_included === 'y';
      return [{ k: 'lineno', label: '#' }, { k: 'product', label: '物料编码' }, { k: 'product_name', label: '商品名称' },
        { k: 'tier_qty', label: '起订量', right: 1 }, { k: 'price', label: taxInc ? '含税报价' : '未税报价', right: 1 },
        { k: 'discount', label: '行折让', right: 1 },
        { k: 'std_price', label: '标准售价', right: 1 }, { k: 'cost', label: '单位成本', right: 1 },
        { k: 'net_price', label: '成交净价', right: 1, render: (v, l) => `<span class="money strong">¥${money(plNet(l, taxInc, (+((DB.find('products', l.product) || {}).tax_rate) || 13)))}</span>` },
        { k: 'margin', label: '毛利率', right: 1, render: (v, l) => marginCell(plNet(l, taxInc, (+((DB.find('products', l.product) || {}).tax_rate) || 13)), l.cost, row.margin_floor) },
        { k: 'memo', label: '适用说明' }];
    },
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
    iqc_lines: [{ k: 'lineno', label: '#' }, { k: 'product', label: '物料编码' }, { k: 'product_name', label: '商品名称' },
      { k: 'qty', label: '到货数量', right: 1 }, { k: 'sample', label: '抽检数', right: 1 }, { k: 'acc', label: 'AQL 允收', right: 1 },
      { k: 'defect', label: '不合格', right: 1 }, { k: 'defect_code', label: '缺陷描述' },
      { k: 'price', label: '暂估单价', right: 1 }, { k: 'amount', label: '批次金额', right: 1 },
      { k: 'verdict', label: '判定', render: (v, l) => {
          if (!v || v === '待检验') return '<span class="badge b-warning">待检验</span>';
          const cls = v.indexOf('合格') === 0 ? 'b-success' : v.indexOf('让步') === 0 ? 'b-warning' : 'b-danger';
          return `<span class="badge ${cls}">${esc(v)}</span>${(l.defect || 0) > (l.acc || 0) ? '<div class="cell-sub" style="color:var(--danger)">超允收</div>' : ''}`;
        } }],
    lot_tx: [{ k: 'lineno', label: '#' }, { k: 'date', label: '日期' },
      { k: 'type', label: '收发动作', render: v => `<span class="small">${esc(mvType(v))}</span>` },
      { k: 'warehouse', label: '仓库', render: (v, l) => `${esc(whName(v))}${l.bin ? `<div class="cell-sub mono">${esc(l.bin)}</div>` : ''}` },
      { k: 'qty', label: '数量', right: 1, render: v => v ? `<span class="money" style="color:${v < 0 ? 'var(--danger)' : 'var(--success)'};font-weight:650">${v > 0 ? '+' : ''}${num(v)}</span>` : '<span class="muted small">0</span>' },
      { k: 'mv', label: '出入库流水', render: v => v ? `<span class="mono small">${esc(v)}</span>` : '<span class="muted small">—</span>' },
      { k: 'ref', label: '关联单据', render: v => jumpHTML(v) },
      { k: 'user', label: '操作人', render: v => `<span class="small">${esc(v || '')}</span>` }],

    /* 工程清单:单件耗用是 4 位小数的小数用量,与订单行数量的整数口径分开显示 */
    bom_lines: [{ k: 'lineno', label: '#' }, { k: 'product', label: '子件物料' },
      { k: 'uom', label: '单位', render: v => `<span class="small muted">${esc(v || 'PCS')}</span>` },
      { k: 'qty', label: '单件用量', right: 1, render: v => `<span class="money">${use4(v)}</span>` },
      { k: 'loss_rate', label: '损耗率', right: 1, render: v => +v ? `<span style="color:var(--warning)">${(+v * 100).toFixed(1)}%</span>` : '<span class="muted small">—</span>' },
      { k: 'use', label: '1 件耗用', right: 1, render: (v, l) => `<span class="money strong">${use4(ACT.BOM.unitUse(l))}</span>` },
      { k: 'cost', label: '标准成本', right: 1 },
      { k: 'amount', label: '单件材料成本', right: 1 },
      { k: 'key_part', label: '关键件', render: (v, l) => v === 'y' ? '<span class="badge b-purple">关键件</span>'
        : l.substitute ? `<span class="muted small">可代: ${esc(l.substitute)}</span>` : '<span class="muted small">—</span>' },
      { k: 'position', label: '工位 / 用途' }, { k: 'memo', label: '备注' }],

    /* MRP 结果:毛需求 − 供给(现存/占用/在途) − 安全库存 = 净需求,再按 MOQ 与提前期给计划建议 */
    mrp_lines: [{ k: 'lineno', label: '#' },
      { k: 'level', label: '层级', render: (v, l) => `<span class="tag">L${v}</span>${l.bom_no ? `<div class="cell-sub mono">${esc(l.bom_no)}</div>` : ''}` },
      { k: 'product', label: '物料', render: (v, l) => `<span class="mono cell-link" data-jump="products=${encodeURIComponent(v)}">${esc(v)}</span>`
        + `<div class="cell-sub">${esc(l.product_name || '')}${l.parents ? ' · 引爆自 ' + esc(l.parents) : ''}</div>` },
      { k: 'mrp_src', label: '供应方式', render: v => `<span class="badge b-neutral">${esc(SCHEMA.MRP_SRC[v] || v)}</span>` },
      { k: 'gross_qty', label: '毛需求', right: 1, render: v => `<span class="money">${use4(v)}</span>` },
      { k: 'on_hand', label: '供给(现/占/途)', render: (v, l) => `<span class="small">${num(v)} / ${num(l.reserved)} / ${num(l.on_order)}</span>` },
      { k: 'safety_qty', label: '安全库存', right: 1, render: v => v ? num(v) : '<span class="muted small">—</span>' },
      { k: 'net_qty', label: '净需求', right: 1, render: v => +v > 0 ? `<span class="money strong" style="color:var(--danger)">${use4(v)}</span>` : '<span class="muted small">0</span>' },
      { k: 'suggest_qty', label: '计划建议', right: 1, render: (v, l) => +v > 0
        ? `<span class="money strong">${num(v)}</span><div class="cell-sub muted">MOQ ${num(l.moq)} · ${num(l.lead_time)} 天</div>` : '<span class="muted small">—</span>' },
      { k: 'suggest_type', label: '建议单 / 下达', render: (v, l) => +l.suggest_qty > 0
        ? `<span class="badge ${v === 'OS' ? 'b-purple' : 'b-info'}">${esc(SCHEMA.MRP_SUGGEST[v] || v)}</span>`
        + (l.release ? `<div class="cell-sub">${jumpHTML(l.release)}</div>` : '<div class="cell-sub muted small">未下达</div>')
        : '<span class="muted small">库存足够</span>' },
      { k: 'need_date', label: '需求日', render: v => `<span class="nowrap small">${esc(v || '—')}</span>` },
      { k: 'amount', label: '预计金额', right: 1 },
      { k: 'memo', label: '运算说明' }],
  };
  const NUM_KEYS = ['qty', 'lineno', 'book_qty', 'actual_qty', 'diff', 'delivered', 'received', 'issued', 'returned', 'lead_time', 'sample', 'acc', 'defect', 'tier_qty'];

  /** 小数用量显示:单件耗用与毛需求可以是 0.034 这类 4 位小数,整数件数仍用千分位 */
  function use4(v) {
    const n = +v || 0;
    if (!n) return '0';
    return n >= 1000 ? num(n) : String(Math.round(n * 10000) / 10000);
  }
  /** 价目表行的成交净价:与取价引擎同口径(含税报价先按类目税率反算,再扣行折让) */
  function plNet(l, taxInc, taxRate) {
    const untaxed = taxInc ? (+l.price || 0) / (1 + taxRate / 100) : (+l.price || 0);
    return r2(untaxed * (1 - (l.discount || 0)));
  }
  /** 毛利率徽标:跌破所在价目表的红线毛利率时高亮,用于快速定位深亏价行 */
  function marginCell(net, cost, floor) {
    if (!(net > 0)) return '<span class="muted small">—</span>';
    const m = (net - (cost || 0)) / net;
    const fl = floor == null ? ACT.PRICE.FLOOR : +floor;
    const bad = m < fl;
    return `<span class="nowrap" style="color:${bad ? 'var(--danger)' : 'var(--text-1)'};font-weight:${bad ? 650 : 500}">${(m * 100).toFixed(1)}%</span>`
      + (bad ? `<div class="cell-sub small" style="color:var(--danger)">低于红线 ${(fl * 100).toFixed(1)}%</div>` : '');
  }
  /** 销售行的取价来源:命中价目表给下钻链接,未命中则说明是标准价/手工改价 */
  function priceSrcCell(l) {
    const src = l.price_src || '';
    const danger = /低于毛利红线/.test(src);
    if (!l.list_no) {
      return `<span class="small"${danger ? ' style="color:var(--danger);font-weight:650"' : ''}>${esc(src || '标准售价 · 物料主数据')}${l.engine ? '<span class="muted"> · 引擎实时解析</span>' : ''}</span>`;
    }
    return `<span class="mono cell-link" data-jump="price_list=${encodeURIComponent(l.list_no)}">${esc(l.list_no)}</span>`
      + `<div class="cell-sub muted small"${danger ? ' style="color:var(--danger);font-weight:650"' : ''}>${esc(src)}${l.engine ? ' · 引擎实时解析' : ''}</div>`;
  }

  function linesCard(entity, row, cfg) {
    const raw = cfg.isJournal ? DB.list('journal_lines').filter(l => l.doc === row.no) : DB.lines(cfg.docTable, row.no);
    const lines = raw.map(l => {
      if (cfg.docTable !== 'so_lines') return Object.assign({}, l);
      const c = Object.assign({}, l);
      if (c.amount == null) c.amount = r2(c.qty * (c.price || 0) * (1 - (c.discount || 0)));
      if (!c.list_no && !c.price_src) {
        const q = ACT.PRICE.pick({ customer: row.customer, product: c.product, qty: c.qty, date: row.date, channel: row.channel, warehouse: row.warehouse });
        c.list_no = q.listNo; c.price_src = q.source; c.engine = true;
      }
      return c;
    });
    if (!lines.length) return '';
    const preset = typeof DOC_COLS[cfg.docTable] === 'function' ? DOC_COLS[cfg.docTable](row) : DOC_COLS[cfg.docTable];
    const cols = cfg.isJournal
      ? [{ k: 'account', label: '科目' }, { k: 'account_name', label: '科目名称' }, { k: 'memo', label: '摘要' }, { k: 'debit', label: '借方', right: 1 }, { k: 'credit', label: '贷方', right: 1 }]
      : preset || (cfg.docTable === 'stk_lines'
        ? [{ k: 'product', label: '编码' }, { k: 'product_name', label: '商品' }, { k: 'book_qty', label: '账面', right: 1 }, { k: 'actual_qty', label: '实盘', right: 1 }, { k: 'diff', label: '差异', right: 1 }, { k: 'cost', label: '单位成本', right: 1 }, { k: 'diff_amount', label: '差异金额', right: 1 }]
        : [{ k: 'lineno', label: '#' }, { k: 'product', label: '物料编码' }, { k: 'product_name', label: '商品名称' }, { k: 'qty', label: '数量', right: 1 }]
          .concat(cfg.docTable === 'po_lines' || cfg.docTable === 'gr_lines' ? [{ k: 'received', label: '已收货', right: 1 }] : [])
          .concat([{ k: 'price', label: '单价', right: 1 }, { k: 'discount', label: '折扣', right: 1 }, { k: 'tax_rate', label: '税率', right: 1 }, { k: 'amount', label: '金额', right: 1 }]));
    const sumKeys = cols.filter(c => c.right && ['amount', 'debit', 'credit', 'diff_amount'].indexOf(c.k) >= 0);
    return `<div class="card"><div class="card-head"><h3>${icon('grid')}明细行</h3><span class="sub">${lines.length} 行</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c.right ? 'right' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${lines.map(l => `<tr>${cols.map(c => {
        const v = l[c.k];
        if (c.render) return `<td class="${c.right ? 'right' : ''}">${c.render(v, l)}</td>`;
        if (c.right) return `<td class="right money">${c.k === 'tax_rate' ? (v || 0) + '%' : c.k === 'discount' ? (v ? (v * 100).toFixed(0) + '%' : '—') : NUM_KEYS.indexOf(c.k) >= 0 ? num(v) : money(v)}</td>`;
        if (c.ref) return `<td>${UI.cellRef(c.ref, v)}</td>`;
        if (c.k === 'product') return `<td class="mono"><span class="cell-link" data-jump="products=${encodeURIComponent(v)}">${esc(v)}</span></td>`;
        return `<td>${esc(v === undefined || v === null ? '' : v)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
      ${sumKeys.length ? `<div class="lines-sum">${sumKeys.map(c => { const s = lines.reduce((x, l) => x + (+l[c.k] || 0), 0); return `<span>${esc(c.label)} <b>¥${money(s)}</b></span>`; }).join('')}</div>` : ''}</div>`;
  }

  /* ---------------- 追溯辅助:单号下钻、类型名、库位/批次标签 ---------------- */
  const REF_PREFIX = [['IQC', 'iqc'], ['LOT', 'lot'], ['RFQ', 'rfq'], ['MV-', 'stock_movements'], ['SO', 'sales_order'],
    ['PO', 'purchase_order'], ['PR', 'purchase_req'], ['GR', 'gr'], ['PB', 'bill'], ['PY', 'payment'], ['IV', 'invoice'],
    ['RC', 'receipt'], ['DL', 'delivery'], ['TR', 'transfer'], ['ST', 'stocktake'], ['OS', 'os_order'], ['RM', 'rma'],
    ['JE', 'journal'], ['AP', 'approval'], ['SA', 'supplier_apply'], ['PA', 'processor_audit'], ['RS', 'product_release'],
    ['PL', 'price_list'], ['BM', 'bom'], ['MR', 'mrp_run']];
  function refEntity(no) {
    const s = String(no || '');
    const hit = REF_PREFIX.find(p => s.indexOf(p[0]) === 0);
    return hit ? hit[1] : '';
  }
  /** 关联单据:能识别前缀就给下钻链接,识别不了(如「期初建账」「A → B」)只显示文本 */
  function jumpHTML(ref, label) {
    const s = String(ref || '');
    if (!s) return '<span class="muted small">—</span>';
    const ent = refEntity(s);
    return ent ? `<span class="mono cell-link" data-jump="${ent}=${encodeURIComponent(s)}">${esc(label || s)}</span>`
      : `<span class="small">${esc(s)}</span>`;
  }
  function whName(code) { return (DB.find('warehouses', code) || {}).name || code || ''; }
  /** 运算单下达出的建议单:按单号前缀从 mrp_lines.release 回收(PR 合并一张、OS 逐件) */
  function relDocs(runNo, prefix) {
    const seen = {};
    DB.lines('mrp_lines', runNo).forEach(l => {
      const r = String(l.release || '');
      if (r.indexOf(prefix) === 0) seen[r] = 1;
    });
    const ent = prefix === 'PR' ? 'purchase_req' : 'os_order';
    return Object.keys(seen).sort().map(no => DB.find(ent, no)).filter(Boolean);
  }
  function mvType(v) { return SCHEMA.entities.stock_movements.fields.type.opts[v] || (v === 'relocate' ? '库位移位' : v || ''); }
  /** 批次徽标:多批次时展示首个 + 数量 */
  function lotChip(lotNo, qty) {
    if (!lotNo) return '<span class="muted small">未分配</span>';
    const l = DB.find('lot', lotNo);
    if (!l) return `<span class="mono small">${esc(lotNo)}</span>`;
    return `<span class="mono cell-link" data-jump="lot=${encodeURIComponent(lotNo)}">${esc(lotNo)}</span>`
      + `<div class="cell-sub">${esc(l.bin || '')}${qty ? ' · ' + num(qty) + ' 件' : ''}</div>`;
  }

  /* 审批单 module → 业务实体 */
  const BIZ_ENTITY = {    product_release: 'product_release', supplier_apply: 'supplier_apply', processor_audit: 'processor_audit',
    purchase_req: 'purchase_req', rma: 'rma', os_order: 'os_order', so_change: 'sales_order',
    price_change: 'sales_order', price_list: 'price_list', stock_adjust: 'stocktake'
  };

  function related(entity, row) {
    const out = [];
    const pk = SCHEMA.entities[entity].pk;
    /* 批次分配索引:一张单据 → 涉及的批次与收发数量(反向追溯入口) */
    const byLot = {};
    if (['delivery', 'gr', 'transfer', 'stocktake', 'os_order', 'rma', 'stock_movements', 'iqc'].indexOf(entity) >= 0) {
      const key = entity === 'stock_movements' ? 'mv' : 'ref';
      DB.list('lot_tx').forEach(t => { if (t[key] === row[pk]) byLot[t.doc] = (byLot[t.doc] || 0) + t.qty; });
    }
    const allocRows = Object.keys(byLot).map(no => DB.find('lot', no)).filter(Boolean);
    const allocGroup = { title: '批次分配', entity: 'lot', rows: allocRows,
      label: l => `${l.product_name} · ${byLot[l.no] > 0 ? '入库' : '出库'} ${num(Math.abs(byLot[l.no]))} 件 · 库位 ${l.bin || '—'}` };
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
      invoice: [{ title: '收款记录', entity: 'receipt', rows: DB.where('receipt', r => r.invoice === row[pk]), label: r => `${r.method} ¥${money(r.amount)}` },        { title: '来源订单', entity: 'sales_order', rows: row.so ? [DB.find('sales_order', row.so)].filter(Boolean) : [], label: o => `订单金额 ¥${money(o.total)}` }],
      bill: [{ title: '付款记录', entity: 'payment', rows: DB.where('payment', p => p.bill === row[pk]), label: p => `${p.method} ¥${money(p.amount)}` },
        { title: '来源收货单', entity: 'gr', rows: row.gr ? [DB.find('gr', row.gr)].filter(Boolean) : [], label: g => `入库 ¥${money(g.amount)}` }],
      delivery: [{ title: '来源订单', entity: 'sales_order', rows: row.so ? [DB.find('sales_order', row.so)].filter(Boolean) : [], label: o => `订单 ¥${money(o.total)}` },
        { title: '出库流水', entity: 'stock_movements', rows: DB.where('stock_movements', m => m.ref === row[pk]), label: m => `${m.product_name} ${m.qty}` }],
      gr: [{ title: '来源订单', entity: 'purchase_order', rows: row.po ? [DB.find('purchase_order', row.po)].filter(Boolean) : [], label: o => `订单 ¥${money(o.total)}` },
        { title: '来料检验单', entity: 'iqc', rows: DB.where('iqc', a => a.gr === row[pk]), label: a => `${SCHEMA.STATUS[a.status] ? SCHEMA.STATUS[a.status].l : a.status} · 抽检 ${num(a.sample_qty)} 件 / 不合格 ${num(a.defect_qty)} 件` },
        { title: '采购账单', entity: 'bill', rows: DB.where('bill', b => b.gr === row[pk]), label: b => `应付 ¥${money(b.total)}` }],
      iqc: [
        { title: '来源收货单', entity: 'gr', rows: row.gr ? [DB.find('gr', row.gr)].filter(Boolean) : [], label: g => `${g.status === 'returned' ? '拒收结案' : '暂估在账'} ¥${money(g.amount)}` },
        { title: '来源采购订单', entity: 'purchase_order', rows: row.po ? [DB.find('purchase_order', row.po)].filter(Boolean) : [], label: o => `${o.supplier_name} · ¥${money(o.total)}` },
        { title: '同供应商历史检验', entity: 'iqc', rows: DB.where('iqc', a => a.supplier === row.supplier && a.no !== row[pk]).slice(-5).reverse(), label: a => `${SCHEMA.STATUS[a.status] ? SCHEMA.STATUS[a.status].l : a.status} · ${dateCN(a.date)}` },
      ],
      purchase_req: [{ title: '转化采购订单', entity: 'purchase_order', rows: DB.where('purchase_order', p => p.pr === row[pk]), label: p => `订单 ¥${money(p.total)}` }],
      bom: [
        { title: '父项物料', entity: 'products', rows: row.product ? [DB.find('products', row.product)].filter(Boolean) : [],
          label: p => `${SCHEMA.MRP_SRC[p.mrp_src] || '外购'} · 标准成本 ¥${money(p.cost)} · 售价 ¥${money(p.price)}` },
        { title: '同一父项的其他版本', entity: 'bom', rows: DB.where('bom', b => b.product === row.product && b.no !== row[pk]),
          label: b => `${b.name} · ${b.version} · 单件材料成本 ¥${money(b.mat_cost)}` },
        { title: '投产与加工记录', entity: 'os_order', rows: DB.where('os_order', o => o.output_product === row.product).slice(-6),
          label: o => `${o.processor_name} · ${num(o.output_qty)} 件 · 已收 ${num(o.received_qty || 0)}` },
        { title: '引用本清单的计划运算', entity: 'mrp_run', rows: (() => {
          const docs = {};
          DB.list('mrp_lines').forEach(l => { if (l.bom_no === row[pk]) docs[l.doc] = 1; });
          return Object.keys(docs).map(no => DB.find('mrp_run', no)).filter(Boolean);
        })(), label: m => `${SCHEMA.MRP_DEMAND[m.source] || m.source} · ${m.date} · 建议 ¥${money(m.amount)}` },
      ],
      mrp_run: [
        { title: '需求父项(未履约订单)', entity: 'sales_order', rows: (() => {
          const seen = {};
          DB.lines('mrp_lines', row[pk]).forEach(l => String(l.parents || '').replace(/SO\d{4}-\d{4}/g, s => { seen[s] = 1; return s; }));
          return Object.keys(seen).map(no => DB.find('sales_order', no)).filter(Boolean);
        })(), label: o => `${o.customer_name} · ¥${money(o.total)} · 需求日 ${o.required_date || '—'}` },
        { title: '下达的采购申请', entity: 'purchase_req', rows: relDocs(row[pk], 'PR'), label: p => `${p.reason} · ¥${money(p.amount)}` },
        { title: '下达的委外加工单', entity: 'os_order', rows: relDocs(row[pk], 'OS'), label: o => `${o.processor_name} · ${o.output_name} ${num(o.output_qty)} 件` },
      ],
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
    if (allocRows.length) (map[entity] || (map[entity] = [])).push(allocGroup);
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

  /* ---------------- 批次双向追溯卡 ---------------- */
  function traceCard(l) {
    const tr = ACT.LOT.trace(l.no);
    const gr = DB.find('gr', l.receipt) || {};
    const po = gr.po ? DB.find('purchase_order', gr.po) : null;
    const iqc = l.iqc ? DB.find('iqc', l.iqc) : null;
    const os = /^OS\d/.test(l.receipt || '') ? DB.find('os_order', l.receipt) : null;
    const rma = /^RM\d/.test(l.receipt || '') ? DB.find('rma', l.receipt) : null;
    const src = l.parent ? DB.find('lot', l.parent) : null;
    const kids = DB.where('lot', x => x.parent === l.no);
    const issued = tr.outs.reduce((s, t) => s - t.qty, 0);
    const left = Math.max(0, UI.days(DB.today(), l.expire_date));
    const sib = DB.where('lot', x => x.product === l.product && x.no !== l.no && x.qty > 0);
    return `<div class="card"><div class="card-head"><h3>${icon('layers')}批次流水账</h3>
        <span class="sub">入库 ${num(l.qty_in)} · 已收发 ${num(issued)} · 当前余量 ${num(l.qty)}</span></div>
      <div class="card-body"><div class="stat-row">
        <div>入库数量<b>${num(l.qty_in)}</b></div><div>累计发出<b>${num(issued)}</b></div><div>当前余量<b>${num(l.qty)}</b></div>
        <div>批次金额<b>¥${money(l.value)}</b></div><div>库龄<b>${num(l.age_days)} 天</b></div>
        <div>剩余效期<b>${l.expire_date ? (l.expire_date < DB.today() ? `<span style="color:var(--danger)">过期 ${left} 天</span>` : num(left) + ' 天') : '长期'}</b></div></div></div></div>
      <div class="card"><div class="card-head"><h3>${icon('download')}上游来源(正向追溯)</h3>
        <div class="right"><span class="muted small">批次 = 最小质量单元</span></div></div>
      <div class="card-body">${UI.descs([
        ['批次来源', esc(SCHEMA.LOT_SOURCE[l.source] || l.source || '—')],
        ['来源单据', jumpHTML(l.receipt)],
        po ? ['采购订单', jumpHTML(po.no, `${po.no}(${po.supplier_name || ''})`)] : false,
        gr.no ? ['收货单', jumpHTML(gr.no, `${gr.no}(¥${money(gr.amount)})`)] : false,
        ['来源供应商', l.supplier_name ? `${esc(l.supplier_name)}${l.supplier ? ` <span class="mono cell-link" data-jump="suppliers=${encodeURIComponent(l.supplier)}">${esc(l.supplier)}</span>` : ''}` : (os ? esc(os.processor_name || '') : (rma ? esc(rma.customer_name || '客户退货') : '—'))],
        ['供应商批号', l.sup_lot ? `<span class="mono">${esc(l.sup_lot)}</span>` : '—'],
        iqc ? ['来料检验单', jumpHTML(iqc.no, `${iqc.no}(${(SCHEMA.STATUS[iqc.status] || {}).l || iqc.status})`)] : false,
        os ? ['委外加工单', jumpHTML(os.no, `${os.no}(${os.processor_name || ''})`)] : false,
        rma ? ['售后工单', jumpHTML(rma.no, `${rma.no}(${rma.customer_name || ''})`)] : false,
        src ? ['源批次', `<span class="mono cell-link" data-jump="lot=${encodeURIComponent(src.no)}">${esc(src.no)}</span> <span class="muted small">分批落地</span>`] : false,
        ['生产日期', dateCN(l.prod_date)], ['入库日期', dateCN(l.receipt_date)], ['到期日', l.expire_date ? dateCN(l.expire_date) : '长期有效'],
        ['当前库位', `<span class="mono cell-link" data-jump="bins=${encodeURIComponent(l.bin)}">${esc(l.bin || '—')}</span> ${esc(whName(l.warehouse))}`],
      ].filter(Boolean))}
        ${kids.length ? `<div class="notice mt12">${icon('swap')}<div>本批次共拆出 <b>${kids.length}</b> 个子批次(跨仓调拨或分批落地后余量仍在):${kids.map(k => `<span class="mono cell-link" data-jump="lot=${encodeURIComponent(k.no)}">${esc(k.no)}</span>`).join(' ')}</div></div>` : ''}
        ${l.hold_note ? `<div class="notice warn mt12">${icon('lock')}<div><b>质量扣留</b> ${esc(l.hold_note)};该批次已从可销售可用量中剔除 ${num(l.qty)} 件。</div></div>` : ''}</div></div>
      <div class="card"><div class="card-head"><h3>${icon('trendUp')}下游流向(反向追溯)</h3>
        <div class="right"><span class="muted small">${tr.flow.length} 笔发出记录</span></div></div>
      ${tr.flow.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>日期</th><th>动作</th><th class="right">数量</th><th>仓库/库位</th><th>去向单据</th><th>客户</th><th>销售订单</th><th>发票</th></tr></thead>
        <tbody>${tr.flow.map(f => `<tr><td>${dateCN(f.date)}</td><td><span class="small">${esc(mvType(f.type))}</span></td>
          <td class="right money" style="color:var(--danger);font-weight:650">-${num(f.qty)}</td>
          <td><span class="small">${esc(whName(f.warehouse))}</span><div class="cell-sub mono">${esc(f.bin || '')}</div></td>
          <td>${jumpHTML(f.doc)}</td>
          <td>${f.customer ? `<span class="cell-link" data-jump="customers=${encodeURIComponent(f.customer)}">${esc(f.customer_name || f.customer)}</span>` : '<span class="muted small">委外/内部</span>'}</td>
          <td>${f.so ? jumpHTML(f.so) : '—'}</td><td>${f.invoice ? jumpHTML(f.invoice) : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="card-body">${UI.emptyBox('该批次尚未发出,全部余量在库')}</div>`}</div>
      ${l.qty > 0 || sib.length ? `<div class="card"><div class="card-head"><h3>${icon('shield')}同物料在库批次(召回面)</h3>
        <div class="right"><span class="muted small">本批次可拦截 ${num(l.qty)} 件 · 其他在库 ${num(sib.reduce((s, x) => s + x.qty, 0))} 件</span></div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>批次</th><th>仓库/库位</th><th class="right">余量</th><th>到期日</th><th>状态</th></tr></thead>
        <tbody>${[l].concat(sib).sort((a, b) => (a.expire_date || '9999') < (b.expire_date || '9999') ? -1 : 1).slice(0, 12).map(x => `<tr>
          <td class="mono cell-link" data-jump="lot=${encodeURIComponent(x.no)}">${esc(x.no)}</td>
          <td><span class="small">${esc(whName(x.warehouse))}</span><div class="cell-sub mono">${esc(x.bin || '')}</div></td>
          <td class="right money">${num(x.qty)}</td><td>${x.expire_date ? dateCN(x.expire_date) : '长期'}</td><td>${UI.badge(x.status)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  }

  /* ---------------- 库位占用卡 ---------------- */
  function binCard(b) {
    const lots = DB.where('lot', x => x.bin === b.code && x.qty > 0).sort((x, y) => x.product < y.product ? -1 : 1);
    const qty = lots.reduce((s, x) => s + x.qty, 0);
    const value = r2(lots.reduce((s, x) => s + x.qty * x.unit_cost, 0));
    const pct = b.capacity ? Math.min(100, qty / b.capacity * 100) : 0;
    const txs = DB.list('lot_tx').filter(t => t.bin === b.code).slice(-10).reverse();
    return `<div class="card"><div class="card-head"><h3>${icon('grid')}库位占用</h3>
        <div class="right"><span class="muted small">${esc(SCHEMA.ZONES[b.zone] || b.zone)} · 标准容量 ${num(b.capacity)} 件</span></div></div>
      <div class="card-body"><div class="stat-row"><div>在位批次<b>${lots.length}</b></div><div>在库件数<b>${num(qty)}</b></div>
        <div>库存金额<b>¥${money(value)}</b></div><div>冻结/过期<b>${num(lots.filter(x => x.status !== 'normal').reduce((s, x) => s + x.qty, 0))}</b></div></div>
      <div class="progress mt12" style="height:9px"><i class="${pct > 85 ? 'bad' : pct > 65 ? 'warn' : 'ok'}" style="width:${pct.toFixed(1)}%"></i></div>
      <div class="muted small mt8">占用率 ${pct.toFixed(1)}%;超出 85% 时新批次落位会自动改派同库区最空的库位。</div></div></div>
      <div class="card"><div class="card-head"><h3>${icon('layers')}在位批次</h3></div>
        ${lots.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>批次</th><th>物料</th><th class="right">余量</th><th>到期日</th><th>状态</th></tr></thead>
        <tbody>${lots.map(x => `<tr><td class="mono cell-link" data-jump="lot=${encodeURIComponent(x.no)}">${esc(x.no)}</td>
          <td>${esc(x.product_name)}<div class="cell-sub mono">${esc(x.product)}</div></td>
          <td class="right money">${num(x.qty)}</td><td>${x.expire_date ? dateCN(x.expire_date) : '长期'}</td><td>${UI.badge(x.status)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="card-body">${UI.emptyBox('该库位当前空置')}</div>`}</div>
      <div class="card"><div class="card-head"><h3>${icon('clock')}最近收发</h3></div>
        ${txs.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>日期</th><th>批次</th><th>动作</th><th class="right">数量</th><th>关联单据</th><th>操作人</th></tr></thead>
        <tbody>${txs.map(t => `<tr><td>${dateCN(t.date)}</td><td class="mono cell-link" data-jump="lot=${encodeURIComponent(t.doc)}">${esc(t.doc)}</td>
          <td><span class="small">${esc(mvType(t.type))}</span></td>
          <td class="right money" style="color:${t.qty < 0 ? 'var(--danger)' : t.qty > 0 ? 'var(--success)' : 'var(--text-3)'}">${t.qty > 0 ? '+' : ''}${num(t.qty)}</td>
          <td>${jumpHTML(t.ref)}</td><td class="small">${esc(t.user || '')}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="card-body">${UI.emptyBox('暂无收发记录')}</div>`}</div>`;
  }

  /* ---------------- 价格策略:取价体检 / 让利测算 ---------------- */
  /** 销售订单取价体检:逐行还原取价阶梯命中,与价目表净价、成本、红线价并排比对 */
  function priceCheckCard(so) {
    const lines = DB.lines('so_lines', so.no);
    if (!lines.length) return '';
    let hit = 0, give = 0;
    const rows = lines.map(l => {
      const q = ACT.PRICE.pick({ customer: so.customer, product: l.product, qty: l.qty, date: so.date, channel: so.channel, warehouse: so.warehouse });
      const net = r2((l.price || 0) * (1 - (l.discount || 0)));
      if (q.listNo) hit++;
      give += (net - q.net) * (l.qty || 0);
      return { l, q, net, off: r2(net - q.net), matched: !!q.listNo && Math.abs(net - q.net) < 0.005, below: net > 0 && net < q.floor };
    });
    const bad = rows.filter(x => x.below);
    const ap = so.price_ap ? DB.find('approval', so.price_ap) : null;
    const netAll = r2(rows.reduce((s, x) => s + x.net * (x.l.qty || 0), 0));
    const costAll = r2(rows.reduce((s, x) => s + x.q.cost * (x.l.qty || 0), 0));
    const gm = netAll > 0 ? ((netAll - costAll) / netAll * 100).toFixed(1) : '0.0';
    return `<div class="card"><div class="card-head"><h3>${icon('wallet')}取价与毛利体检</h3>
      <div class="right"><span class="muted small">取价基准日 ${dateCN(so.date)} · ${esc(whName(so.warehouse))}</span></div></div>
      <div class="card-body"><div class="stat-row">
        <div>价目表命中<b>${hit} / ${lines.length} 行</b></div>
        <div>未税净额<b>¥${money(netAll)}</b></div>
        <div>预估毛利率<b style="color:${+gm < 5 ? 'var(--danger)' : 'var(--text-1)'}">${gm}%</b></div>
        <div>相对价目表<b style="color:${give < -0.005 ? 'var(--danger)' : 'var(--success)'}">¥${money(r2(give))}</b></div></div>
      ${so.price_note ? `<div class="notice mt12">${icon('info')}<div>${esc(so.price_note)}</div></div>` : ''}
      ${ap ? `<div class="notice ${ap.status === 'approved' ? '' : 'warn'} mt12">${icon('check')}<div><b>改价审批 </b><span class="mono cell-link" data-jump="approval=${encodeURIComponent(ap.no)}">${esc(ap.no)}</span> ${UI.badge(ap.status)} ${esc(ap.approver || '')}${ap.opinion ? ':' + esc(ap.opinion) : ''}</div></div>` : ''}
      ${bad.length ? `<div class="notice warn mt12">${icon('warn')}<div><b>${bad.length} 行成交价跌破毛利红线</b>,审核时会被拦截。请在单据底部发起「申请改价」(按价差金额分级会签),或由销售按价目表净价改回报价。</div></div>` : ''}
      <div class="table-wrap mt12"><table class="tbl"><thead><tr><th>#</th><th>物料</th><th class="right">数量</th><th class="right">成交净价</th><th class="right">价目表净价</th><th class="right">价差</th><th class="right">成本</th><th class="right">红线价</th><th class="right">毛利率</th><th>取价阶梯命中</th></tr></thead>
      <tbody>${rows.map((x, i) => `<tr>
        <td class="muted">${i + 1}</td>
        <td>${esc(x.l.product_name)}<div class="cell-sub mono">${esc(x.l.product)}</div></td>
        <td class="right money">${num(x.l.qty)}</td>
        <td class="right money strong">¥${money(x.net)}</td>
        <td class="right money">¥${money(x.q.net)}</td>
        <td class="right money" style="color:${x.off < -0.005 ? 'var(--danger)' : x.off > 0.005 ? 'var(--success)' : 'var(--text-3)'}">${x.off > 0 ? '+' : ''}${money(x.off)}</td>
        <td class="right money">¥${money(x.q.cost)}</td>
        <td class="right money">¥${money(x.q.floor)}</td>
        <td class="right">${marginCell(x.net, x.q.cost, x.q.marginFloor)}</td>
        <td><span class="small">${esc(x.q.source)}</span>${x.matched ? '<div class="cell-sub" style="color:var(--success)">价目表价,免审批</div>' : x.below ? '<div class="cell-sub" style="color:var(--danger);font-weight:650">跌破红线,需改价审批</div>' : '<div class="cell-sub muted small">红线之上,可直接审核</div>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="muted small mt8">口径:成交净价 = 未税单价 ×(1 − 折扣);红线价 = 该仓移动加权成本 ×(1 + 价目表红线毛利率)。含税报价的价目表按物料类目税率反算为未税后参与比较。</div>
      </div></div>`;
  }

  /** 价目表扩展区:让利测算、取价阶梯中的位置、被引用的销售订单 */
  function priceListCard(pl) {
    const im = ACT.PRICE.listImpact(pl);
    const taxInc = pl.tax_included === 'y';
    const rankOf = x => (ACT.PRICE.WEIGHT[x.kind] || 9) * 100 + (x.priority || 50);
    const ladder = ACT.PRICE.lists(DB.today()).slice().sort((a, b) => rankOf(a) - rankOf(b));
    const pos = ladder.findIndex(x => x.no === pl.no);
    const cited = {};
    DB.list('so_lines').forEach(l => { if (l.list_no === pl.no) cited[l.doc] = (cited[l.doc] || 0) + 1; });
    const orders = Object.keys(cited).map(no => DB.find('sales_order', no)).filter(Boolean);
    const products = {};
    DB.lines('pl_lines', pl.no).forEach(l => { products[l.product] = 1; });
    return `<div class="card"><div class="card-head"><h3>${icon('trendDown')}让利测算</h3>
      <div class="right"><span class="muted small">价差 × 近半年实际销量,作为核准会签的分级金额</span></div></div>
      <div class="card-body"><div class="stat-row">
        <div>价格行 / 覆盖物料<b>${im.lines} / ${Object.keys(products).length}</b></div>
        <div>相对标准售价<b style="color:${im.total < 0 ? 'var(--danger)' : 'var(--success)'}">¥${money(im.total)}</b></div>
        <div>让利价格行<b>${im.rows.filter(r => r.delta < -0.005).length} / ${im.lines}</b></div>
        <div>红线毛利率<b>${((pl.margin_floor == null ? ACT.PRICE.FLOOR : +pl.margin_floor) * 100).toFixed(1)}%</b></div></div>
      ${pos >= 0 ? `<div class="notice mt12">${icon('info')}<div>本表当前<b>参与取价</b>,在 ${ladder.length} 张生效价目表中排第 <b>${pos + 1}</b> 位(取价权重 = 类型权重 × 100 + 优先级)。同物料同档位冲突时,排名靠前者成交。</div></div>`
        : `<div class="notice warn mt12">${icon('info')}<div>本表今日<b>不参与取价</b>(未核准或在有效期外);已成交的历史单据仍按落库单价结算,不受影响。</div></div>`}
      <div class="table-wrap mt12"><table class="tbl"><thead><tr><th>#</th><th>物料</th><th class="right">起订量</th><th class="right">标准售价</th><th class="right">成交净价</th><th class="right">价差</th><th class="right">近半年销量</th><th class="right">让利额</th><th class="right">毛利率</th></tr></thead>
      <tbody>${im.rows.slice().sort((a, b) => a.give - b.give).slice(0, 14).map(r => `<tr>
        <td class="muted">${r.lineno}</td><td>${esc(r.product_name)}<div class="cell-sub mono">${esc(r.product)}</div></td>
        <td class="right money">${r.tier_qty ? num(r.tier_qty) + ' 件起' : '—'}</td>
        <td class="right money">¥${money(r.std)}</td><td class="right money strong">¥${money(r.net)}</td>
        <td class="right money" style="color:${r.delta < 0 ? 'var(--danger)' : 'var(--success)'}">${r.delta > 0 ? '+' : ''}${money(r.delta)}</td>
        <td class="right money">${num(r.qty)}</td>
        <td class="right money" style="color:${r.give < 0 ? 'var(--danger)' : 'var(--text-1)'}">¥${money(r.give)}</td>
        <td class="right">${marginCell(r.net, (DB.find('products', r.product) || {}).cost, pl.margin_floor)}</td></tr>`).join('')}</tbody></table></div>
      ${im.lines > 14 ? `<div class="muted small mt8">仅列出让利最大的 14 行,合计 ${im.lines} 行。</div>` : ''}
      <div class="muted small mt8">成交净价 = ${taxInc ? '含税报价按类目税率反算未税' : '未税报价'} ×(1 − 行折让)。</div></div></div>
      <div class="card"><div class="card-head"><h3>${icon('layers')}今日取价阶梯</h3><span class="sub">${ladder.length} 张生效</span></div>
      <div class="card-body"><div class="flex" style="flex-wrap:wrap;gap:8px">${ladder.map((x, i) => `<span class="tag${x.no === pl.no ? ' on' : ''}" ${x.no === pl.no ? '' : `data-jump="price_list=${encodeURIComponent(x.no)}" style="cursor:pointer"`}>${i + 1}. ${esc(x.name)} · <span class="mono">${esc(x.no)}</span></span>`).join('')}</div>
        <div class="muted small mt8">同一物料被多张价目表命中时,按客户专属 → 促销 → 渠道 → 类目 → 阶梯的顺序取第一个有效报价;未命中任何价目表则回落物料主数据标准售价。</div></div></div>
      <div class="card"><div class="card-head"><h3>${icon('file')}按本表成交的订单</h3><span class="sub">${orders.length} 张</span></div>
        ${orders.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>销售订单</th><th>客户</th><th>日期</th><th class="right">价税合计</th><th class="right">命中行</th><th>状态</th></tr></thead>
          <tbody>${orders.slice(0, 12).map(o => `<tr><td><span class="mono cell-link" data-jump="sales_order=${encodeURIComponent(o.no)}">${esc(o.no)}</span></td>
            <td>${esc(o.customer_name || '')}</td><td>${dateCN(o.date)}</td><td class="right money">¥${money(o.total)}</td>
            <td class="right money">${cited[o.no]} 行</td><td>${UI.badge(o.status)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="card-body">${UI.emptyBox('尚无销售订单行引用本价目表(新建/编辑销售订单时由取价引擎自动写入)')}</div>`}</div>`;
  }


  /* ---------------- 计划:BOM 结构树 / MRP 运算概览 ---------------- */
  /** 结构树缩进渲染:一件父件的逐级耗用,含单件用量、损耗率与滚算金额 */
  function bomTreeRows(node, out) {
    out = out || [];
    out.push(node);
    (node.children || []).forEach(c => bomTreeRows(c, out));
    return out;
  }
  function bomTreeCard(bom) {
    const im = ACT.BOM.impact(bom);
    const ex = ACT.BOM.explode(bom.product, 1, { bom: bom });
    const kids = DB.lines('bom_lines', bom.no);
    /* 两个口径必须分开说:直接材料 = 本子件行相加;多级滚算 = 子件若有生效清单则继续下展 */
    const direct = r2(kids.reduce((s, l) => s + ACT.BOM.unitUse(l) * ((DB.find('products', l.product) || {}).cost || 0), 0));
    const rolled = ACT.BOM.rollCost(bom);
    const flat = bomTreeRows(ex.root);
    const parents = ACT.BOM.whereUsed(bom.product);
    const live = bom.status === 'approved' && (!bom.effect_to || bom.effect_to >= DB.today())
      && (!bom.effect_from || bom.effect_from <= DB.today());
    const asChild = kids.filter(l => ACT.BOM.of(l.product));
    return `<div class="card"><div class="card-head"><h3>${icon('layers')}结构展开(1 件父件)</h3>
      <div class="right"><span class="muted small">层级 ${ex.levels} · 节点 ${flat.length} · 汇总物料 ${ex.rows.length}</span></div></div>
      <div class="card-body"><div class="stat-row">
        <div>直接材料成本<b>¥${money(direct)}</b></div>
        <div>多级滚算成本<b>¥${money(rolled)}</b></div>
        <div>近半年父件销量<b>${num(im.sold)} 件</b></div>
        <div>变更影响额<b>¥${money(im.annual)}</b></div></div>
        <div class="notice mt12">${icon('info')}<div>${asChild.length
          ? `<b>¥${money(direct)}</b> 是本清单子件行的直接材料合计(单件耗用 × 子件标准成本);<b>¥${money(rolled)}</b> 是把 ${asChild.length} 项自制子件按各自生效清单继续下展到原料后的滚算成本。滚算口径用于核价与毛利分析,直接口径用于领料与成本结转。`
          : `本清单 ${kids.length} 项子件全部为外购件,直接材料合计 <b>¥${money(direct)}</b> 与多级滚算成本一致,无需继续下展;滚算口径用于核价与毛利分析,直接口径用于领料与成本结转。`}</div></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>物料</th><th>供应方式</th><th class="right">单件用量</th><th class="right">损耗</th><th class="right">1 件耗用</th><th class="right">单位成本</th><th class="right">材料金额</th><th>关键件/工位</th></tr></thead>
      <tbody>${flat.map(n => `<tr${n.level === 1 ? ' style="background:var(--surface-2)"' : ''}>
        <td style="padding-left:${8 + (n.level - 1) * 18}px">
          ${n.level > 1 ? '<span class="muted">└ </span>' : ''}<span class="mono cell-link" data-jump="products=${encodeURIComponent(n.code)}">${esc(n.code)}</span>
          <div class="cell-sub">${esc(n.name)}</div></td>
        <td><span class="badge ${n.mrp_src === 'buy' ? 'b-info' : n.mrp_src === 'out' ? 'b-purple' : 'b-success'}">${esc(SCHEMA.MRP_SRC[n.mrp_src] || n.mrp_src)}</span>
          ${n.bom ? `<div class="cell-sub">${jumpHTML(n.bom)}</div>` : ''}</td>
        <td class="right money">${n.level === 1 ? use4(n.per_unit == null ? n.qty : n.per_unit) : use4(n.per_unit)}</td>
        <td class="right money">${n.loss ? (n.loss * 100).toFixed(1) + '%' : '<span class="muted small">—</span>'}</td>
        <td class="right money strong">${use4(n.qty)}</td>
        <td class="right money">¥${money(n.level === 1 ? rolled : n.cost)}
          ${n.level === 1 && Math.abs(rolled - n.cost) > 0.005 ? `<div class="cell-sub muted">主数据 ¥${money(n.cost)}</div>` : ''}</td>
        <td class="right money">${n.level === 1 ? '¥' + money(n.amount) : '<span class="muted small">含上级</span>'}</td>
        <td>${n.key_part ? '<span class="badge b-warning">关键件</span>' : ''}${n.position ? `<div class="cell-sub muted small">${esc(n.position)}</div>` : ''}${n.cycle ? '<div class="cell-sub" style="color:var(--danger)">循环引用,已截断</div>' : ''}${n.substitute ? `<div class="cell-sub small">替代 ${esc(n.substitute)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="muted small mt8">单件耗用 = 用量 ×(1 + 损耗率);损耗只抬高子件需求,不改变父件数量。自制子件若已生效自己的清单,展开时按该清单继续下钻。</div></div>
    <div class="card"><div class="card-head"><h3>${icon('search')}反查:本父件作为子件被谁使用</h3><span class="sub">${parents.length} 处</span></div>
      ${parents.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>上层清单</th><th>上层父件</th><th class="right">单件用量</th><th class="right">损耗</th><th>状态</th></tr></thead>
        <tbody>${parents.map(p => `<tr><td>${jumpHTML(p.no)}<div class="cell-sub muted small">${esc(p.name)}</div></td>
          <td><span class="mono cell-link" data-jump="products=${encodeURIComponent(p.parent)}">${esc(p.parent)}</span> ${esc(p.parent_name || '')}</td>
          <td class="right money">${use4(p.per_unit)}</td><td class="right money">${p.loss ? (p.loss * 100).toFixed(1) + '%' : '—'}</td><td>${UI.badge(p.status)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card-body">${UI.emptyBox('该物料未被其他清单引用,属于最上层成品(变更影响面见「相关记录」)')}</div>`}
    ${live ? `<div class="notice">${icon('check')}<div>本清单当前<b>生效中</b>,是 ${esc(bom.product)} 在计划运算里的唯一展开依据;同父件多版本时取生效日最新、版本号最大者。</div></div>`
      : `<div class="notice warn">${icon('warn')}<div>本清单当前<b>不参与计划运算</b>(${esc(SCHEMA.STATUS[bom.status] ? SCHEMA.STATUS[bom.status].l : bom.status)}${bom.effect_from > DB.today() ? ' · 生效日 ' + esc(bom.effect_from) : ''}${bom.effect_to && bom.effect_to < DB.today() ? ' · 已于 ' + esc(bom.effect_to) + ' 失效' : ''});MRP 会把该物料当作外购件直接生成采购建议。</div></div>`}</div>`;
  }
  /** 运算概览:需求口径、逐层缺口、供给扣减与下达进度 */
  function mrpCard(run) {
    const lines = DB.lines('mrp_lines', run.no);
    const lvl = {};
    lines.forEach(l => { const r = lvl[l.level] || (lvl[l.level] = { level: l.level, cnt: 0, net: 0, amount: 0, suggest: 0 });
      r.cnt++; r.net = r2(r.net + (l.net_qty || 0)); r.amount = r2(r.amount + (l.amount || 0)); r.suggest = r2(r.suggest + (l.suggest_qty || 0)); });
    const lvlRows = Object.keys(lvl).map(k => lvl[k]).sort((a, b) => a.level - b.level);
    const buy = lines.filter(l => l.suggest_type === 'PR'), make = lines.filter(l => l.suggest_type === 'OS');
    const open = lines.filter(l => (l.suggest_qty || 0) > 0 && !l.release);
    const urgent = lines.filter(l => /加急/.test(l.memo || ''));
    const worst = lines.filter(l => (l.net_qty || 0) > 0).sort((a, b) => b.amount - a.amount).slice(0, 10);
    const cover = lines.filter(l => (l.suggest_qty || 0) <= 0).length;
    const lvlNote = { so_open: '未履约销售订单的到期缺口 + 安全库存', safety: '补至安全库存的目标量,不看订单缺口', manual: '人工录入的需求行 + 安全库存' };
    return `<div class="card"><div class="card-head"><h3>${icon('zap')}运算口径与结果</h3>
      <div class="right"><span class="muted small">${esc(SCHEMA.MRP_DEMAND[run.source] || run.source)} · 计划周期 ${num(run.horizon)} 天 · ${esc(whName(run.warehouse) || '全仓合计')}</span></div></div>
      <div class="card-body"><div class="stat-row">
        <div>需求父项<b>${num(run.demand_cnt)}</b></div><div>展开层数<b>${num(run.levels)}</b></div>
        <div>建议行<b>${num(run.rows_cnt)}</b></div><div>缺料行<b style="color:var(--danger)">${num(run.shortage_cnt)}</b></div>
        <div>库存覆盖<b>${num(cover)}</b></div><div>建议金额<b>¥${money(run.amount)}</b></div></div>
      <div class="notice mt12">${icon('info')}<div>可用量 = 现有库存 − 销售占用 + 已确认采购未收 + 已确认委外未回。逐层下展时同一物料用一个库存桶顺序扣减,父件按<b>本轮计划下单量</b>引爆子件需求,不重复分配;安全库存只在顶层补一次。</div></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>层级</th><th class="right">物料数</th><th class="right">净需求合计</th><th class="right">计划下单</th><th class="right">建议金额</th><th>说明</th></tr></thead>
      <tbody>${lvlRows.map(r => `<tr><td><span class="tag">L${r.level}</span></td><td class="right money">${num(r.cnt)}</td>
        <td class="right money" style="${r.net > 0 ? 'color:var(--danger)' : ''}">${use4(r.net)}</td><td class="right money strong">${num(r.suggest)}</td>
        <td class="right money">¥${money(r.amount)}</td><td class="muted small">${r.level === 0 ? esc(lvlNote[run.source] || '顶层需求 + 安全库存') : '上层计划下单量 × 清单单件耗用'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>${icon('send')}建议单构成与下达进度</h3>
      <div class="right"><span class="muted small">${open.length ? `尚有 ${open.length} 行未下达` : '本次建议已全部下达'}</span></div></div>
      <div class="card-body"><div class="grid g2">
        <div><div class="section-title">外购 → 采购申请(PR)</div>
          <div class="stat-row"><div>建议行<b>${buy.filter(l => l.suggest_qty > 0).length}</b></div><div>数量<b>${num(buy.reduce((s, l) => s + (l.suggest_qty || 0), 0))}</b></div><div>金额<b>¥${money(r2(buy.reduce((s, l) => s + (l.amount || 0), 0)))}</b></div><div>已下达<b>${buy.filter(l => l.release).length}</b></div></div>
          <div class="muted small mt8">同类外购件合并为一张采购申请草稿,仍走采购申请审批;取参考单价为最近成交价。</div></div>
        <div><div class="section-title">自制/委外 → 加工单(OS)</div>
          <div class="stat-row"><div>建议行<b>${make.filter(l => l.suggest_qty > 0).length}</b></div><div>数量<b>${num(make.reduce((s, l) => s + (l.suggest_qty || 0), 0))}</b></div><div>成品参考金额<b>¥${money(r2(make.reduce((s, l) => s + l.suggest_qty * (l.price || 0), 0)))}</b></div><div>已下达<b>${make.filter(l => l.release).length}</b></div></div>
          <div class="muted small mt8">逐件生成委外加工单并自动带出清单发料行;下达需要至少一家已核准服务商。</div></div></div>
      <div class="divider"></div>
      <div class="flex" style="flex-wrap:wrap;gap:8px">${relDocs(run.no, 'PR').map(x => `<span class="tag" data-jump="purchase_req=${encodeURIComponent(x.no)}" style="cursor:pointer">PR ${esc(x.no)} · ¥${money(x.amount)}</span>`).join('')}
        ${relDocs(run.no, 'OS').map(x => `<span class="tag" data-jump="os_order=${encodeURIComponent(x.no)}" style="cursor:pointer">OS ${esc(x.no)} · ${esc(x.output_name)} ${num(x.output_qty)}</span>`).join('')}</div></div></div>
    ${urgent.length ? `<div class="card"><div class="card-head"><h3>${icon('bell')}加急件(需求日已过)</h3><span class="sub">${urgent.length} 行</span></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>物料</th><th>层级</th><th class="right">净需求</th><th class="right">建议</th><th>需求日</th><th>运算说明</th></tr></thead>
      <tbody>${urgent.slice(0, 8).map(l => `<tr><td><span class="mono cell-link" data-jump="products=${encodeURIComponent(l.product)}">${esc(l.product)}</span><div class="cell-sub">${esc(l.product_name)}</div></td>
        <td><span class="tag">L${l.level}</span></td><td class="right money" style="color:var(--danger)">${use4(l.net_qty)}</td><td class="right money strong">${num(l.suggest_qty)}</td>
        <td class="small">${esc(l.need_date)}</td><td class="muted small">${esc(l.memo || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="card"><div class="card-head"><h3>${icon('clipboard')}缺口 TOP ${worst.length}</h3><span class="sub">按建议金额排序</span></div>
      ${worst.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>物料</th><th>来源</th><th class="right">现有/占用/在途</th><th class="right">净需求</th><th class="right">建议</th><th>最晚下单日</th></tr></thead>
        <tbody>${worst.map(l => `<tr><td><span class="mono cell-link" data-jump="products=${encodeURIComponent(l.product)}">${esc(l.product)}</span><div class="cell-sub">${esc(l.product_name)}</div></td>
          <td class="small">${esc(l.parents || '—')}</td>
          <td class="small">${num(l.on_hand)} / ${num(l.reserved)} / ${num(l.on_order)}</td>
          <td class="right money" style="color:var(--danger)">${use4(l.net_qty)}</td>
          <td class="right money strong">${num(l.suggest_qty)} <span class="muted small">${esc(SCHEMA.MRP_SUGGEST[l.suggest_type] || '')}</span></td>
          <td class="small mono">${esc(DB.addDays(l.need_date, -(+l.lead_time || 0)))}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card-body">${UI.emptyBox('本次运算没有净需求:可用量与在途已覆盖全部缺口')}</div>`}</div>`;
  }

  /* ---------------- 改价申请:跌破红线的行按价差金额分级会签 ---------------- */
  function openPriceAsk(no, rerender) {
    const so = DB.find('sales_order', no);
    if (so.status !== 'draft') { UI.toast('仅草稿订单可以发起改价,已审核订单请走订单变更', 'err'); return; }
    const pend = DB.where('approval', a => a.module === 'price_change' && a.biz === no && a.status === 'pending')[0];
    if (pend) { UI.toast(`本单已挂改价审批 ${pend.no},等待销售主管裁决`, 'warn'); setTimeout(() => open('approval', pend.no), 260); return; }
    const data = DB.lines('so_lines', no).map(l => {
      const q = ACT.PRICE.pick({ customer: so.customer, product: l.product, qty: l.qty, date: so.date, channel: so.channel, warehouse: so.warehouse });
      const net = r2((l.price || 0) * (1 - (l.discount || 0)));
      return { l, q, net, below: net > 0 && net < q.floor };
    });
    if (!data.length) { UI.toast('订单没有明细行', 'err'); return; }

    function read(mm) {
      return data.map((d, i) => {
        const pv = ($(`[data-p="${i}"]`, mm.el) || {}).value;
        const dv = ($(`[data-d="${i}"]`, mm.el) || {}).value;
        return { i, price: r2(pv === '' ? 0 : +pv), discount: r2(dv === '' ? 0 : +dv),
          on: !!($(`[data-c="${i}"]`, mm.el) || {}).checked, net: r2((pv === '' ? 0 : +pv) * (1 - (dv === '' ? 0 : +dv))) };
      });
    }
    function paint(mm) {
      let imp = 0, net = 0, cost = 0, cnt = 0;
      read(mm).forEach(x => {
        const d = data[x.i], q = d.q, qty = d.l.qty || 0;
        const one = r2((x.net - q.net) * qty);
        if (x.on) { imp += one; cnt++; }
        net += x.net * qty; cost += q.cost * qty;
        const box = $(`[data-i="${x.i}"]`, mm.el);
        if (box) box.innerHTML = `<span class="money" style="color:${one < -0.005 ? 'var(--danger)' : one > 0.005 ? 'var(--success)' : 'var(--text-3)'}">${one > 0 ? '+' : ''}¥${money(one)}</span>`;
        const mb = $(`[data-m="${x.i}"]`, mm.el); if (mb) mb.innerHTML = marginCell(x.net, q.cost, q.marginFloor);
        const tr = $(`tr[data-r="${x.i}"]`, mm.el); if (tr) tr.style.opacity = x.on ? '1' : '.45';
      });
      const tiers = 1 + SCHEMA.SIGN_TIERS.filter(t => Math.abs(imp) >= t.min).length;
      $('#pa-sum', mm.el).innerHTML = `<span>提交 <b>${cnt}</b> 行</span><span>收入影响 <b style="color:${imp < -0.005 ? 'var(--danger)' : 'var(--success)'}">¥${money(r2(imp))}</b></span>
        <span>调后毛利率 <b>${net > 0 ? ((net - cost) / net * 100).toFixed(1) : '0.0'}%</b></span>
        <span class="muted small">${cnt ? `按金额分级需 ${tiers} 级会签(${['销售主管'].concat(SCHEMA.SIGN_TIERS.filter(t => Math.abs(imp) >= t.min).map(t => t.role)).join(' → ')})` : '未勾选明细'}</span>`;
    }
    const m = UI.modal({
      title: '发起改价申请', width: 'wide', subtitle: `${so.no} · ${so.customer_name || so.customer}`,
      body: `<div class="notice">${icon('info')}<div>改价金额按<b>成交净价与价目表净价的差额 × 数量</b>累计,分级会签:¥${money(SCHEMA.SIGN_TIERS[0].min)} 起加签${SCHEMA.SIGN_TIERS.map(t => t.role).join('、')};核准后单价自动回写本单并放行审核。勾选的行才会提交。</div></div>
        <div class="table-wrap mt12"><table class="lines-tbl"><thead><tr><th style="width:34px"></th><th>物料 / 取价来源</th>
          <th class="right" style="width:70px">数量</th><th class="right" style="width:104px">未税单价</th><th class="right" style="width:82px">折扣</th>
          <th class="right" style="width:96px">价目表净价</th><th class="right" style="width:92px">红线价</th>
          <th class="right" style="width:104px">收入影响</th><th class="right" style="width:92px">毛利率</th></tr></thead>
          <tbody>${data.map((d, i) => `<tr data-r="${i}">
            <td><input type="checkbox" data-c="${i}" ${d.below ? 'checked' : ''}></td>
            <td>${esc(d.l.product_name)}${d.below ? '<div class="cell-sub" style="color:var(--danger);font-weight:650">跌破毛利红线</div>' : '<div class="cell-sub muted small">红线之上</div>'}
              <div class="cell-sub mono">${esc(d.l.product)} · ${esc(d.q.source)}</div></td>
            <td class="right money">${num(d.l.qty)}</td>
            <td class="right"><input type="number" step="0.01" data-p="${i}" value="${d.l.price}" class="num right"></td>
            <td class="right"><input type="number" step="0.01" data-d="${i}" value="${d.l.discount || 0}" class="num right" title="0-1 之间,如 0.05"></td>
            <td class="right money">¥${money(d.q.net)}${d.q.taxIncluded ? '<div class="cell-sub muted small">含税报价已反算</div>' : ''}</td>
            <td class="right money">¥${money(d.q.floor)}</td>
            <td class="right" data-i="${i}">—</td><td class="right" data-m="${i}">—</td></tr>`).join('')}</tbody></table></div>
        <div class="form-grid mt16"><div class="fitem" style="grid-column:1/-1"><label>改价理由(会签意见引用,必填)</label>
          <input data-x="reason" placeholder="例:竞对同规格到岸价更低,KA 年度框架协议内保份额" style="width:100%"></div></div>
        <div class="lines-sum mt12" id="pa-sum"></div>`,
      actions: [{ label: '取消' },
        { label: '勾选行回填价目表净价', icon: 'refresh', onClick: mm => {
          const on = read(mm).filter(x => x.on);
          if (!on.length) { UI.toast('没有勾选的行', 'warn'); return false; }
          on.forEach(x => { const p = $(`[data-p="${x.i}"]`, mm.el), dc = $(`[data-d="${x.i}"]`, mm.el), c = $(`[data-c="${x.i}"]`, mm.el);
            if (p) p.value = data[x.i].q.net; if (dc) dc.value = 0; if (c) c.checked = false; });
          paint(mm); UI.toast(`已按价目表净价回填 ${on.length} 行并取消勾选,可直接审核`); return false;
        } },
        { label: '提交改价审批', cls: 'primary', icon: 'check', onClick: mm => {
          const rows = read(mm).filter(x => x.on).map(x => ({ lineno: data[x.i].l.lineno, product: data[x.i].l.product, price: x.price, discount: x.discount }));
          const reason = String(($('[data-x="reason"]', mm.el) || {}).value || '').trim();
          if (!rows.length) { UI.toast('请至少勾选一行需要改价的明细', 'err'); return false; }
          if (reason.length < 4) { UI.toast('请填写改价理由(不少于 4 字),会签需要业务上下文', 'err'); return false; }
          try {
            const r = ACT.PRICE.submit(no, rows, reason);
            const ap = DB.find('approval', r.no) || {};
            UI.toast(`已发起 ${r.no},收入影响 ¥${money(r.impact)}${(ap.chain || []).length > 1 ? `,需 ${(ap.chain || []).map(c => c.role).join(' → ')} 会签` : ',待销售主管裁决'}`);
            rerender();
          } catch (e) { UI.toast(e.message, 'err'); return false; }
        } }]
    });
    UI.$$('input', m.el).forEach(el => el.addEventListener('input', () => paint(m)));
    UI.$$('input', m.el).forEach(el => el.addEventListener('change', () => paint(m)));
    paint(m);
  }

  /* ---------------- 价目表停用 ---------------- */
  const RETIRE_REASONS = ['策略到期,改用新版价目表', '让利幅度过大,收入不达预算', '渠道协议终止', '客户要求重新议价', '深亏价清仓结束,回收报价'];
  function openRetire(no, rerender) {
    const pl = DB.find('price_list', no);
    const im = ACT.PRICE.listImpact(pl);
    const m = UI.modal({
      title: '停用价格策略', width: 'mid', subtitle: `${pl.no} · ${pl.name}`,
      body: `<div class="notice warn">${icon('warn')}<div>停用即把<b>失效日压到今天</b>:次日起取价引擎不再命中本表,新建订单自动回落到下一级阶梯;已成交订单、凭证与账簿<b>不受影响</b>。</div></div>
        <div class="stat-row mt12"><div>价格行<b>${im.lines}</b></div><div>相对标准售价<b>¥${money(im.total)}</b></div>
          <div>失效日<b>${dateCN(DB.today())}</b></div><div>当前状态<b>${esc(SCHEMA.STATUS[pl.status] ? SCHEMA.STATUS[pl.status].l : pl.status)}</b></div></div>
        <div class="form-grid mt16"><div class="fitem" style="grid-column:1/-1"><label>停用原因</label>
          <input data-x="reason" placeholder="${esc(RETIRE_REASONS[0])}" style="width:100%"></div></div>
        <div class="muted small mt8">常用事由:${RETIRE_REASONS.map(r => `<span class="tag" data-rs="${esc(r)}" style="cursor:pointer">${esc(r)}</span>`).join(' ')}</div>`,
      actions: [{ label: '取消' }, { label: '确认停用', cls: 'danger-ghost', icon: 'close', onClick: mm => {
        const reason = String(($('[data-x="reason"]', mm.el) || {}).value || '').trim() || RETIRE_REASONS[0];
        try { ACT.PRICE.retire(no, reason); UI.toast(`${pl.no} 已停用,次日起不再参与取价`); rerender(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    UI.$$('[data-rs]', m.el).forEach(t => t.addEventListener('click', () => { $('[data-x="reason"]', m.el).value = t.dataset.rs; }));
  }

  /* ---------------- 计划:清单作废 / 建议下达 / 重新运算 ---------------- */
  const BOM_VOID_REASONS = ['工程变更,改用新版清单', '父项物料停产下架', '子件供应方式调整', '配方验证不通过,重新编制'];

  function openBomVoid(no, rerender) {
    const b = DB.find('bom', no);
    const im = ACT.BOM.impact(b);
    const cited = DB.where('mrp_lines', l => l.bom_no === no).length;
    const m = UI.modal({
      title: '工程变更作废', width: 'mid', subtitle: `${b.no} · ${b.name}`,
      body: `<div class="notice warn">${icon('warn')}<div>作废只把<b>失效日压到今天</b>并把清单退出取用范围:此后 MRP 不再按本清单下展,父件会被当作外购件直接生成采购建议;历史展开行、已下达的申请单与加工单<b>保持可追且不改金额</b>。</div></div>
        <div class="stat-row mt12"><div>子件行<b>${im.lines}</b></div><div>单件滚算成本<b>¥${money(im.unit)}</b></div>
          <div>引用本清单的运算行<b>${cited}</b></div><div>失效日<b>${dateCN(DB.today())}</b></div></div>
        <div class="form-grid mt16"><div class="fitem" style="grid-column:1/-1"><label>作废原因</label>
          <input data-x="reason" placeholder="${esc(BOM_VOID_REASONS[0])}" style="width:100%"></div></div>
        <div class="muted small mt8">常用事由:${BOM_VOID_REASONS.map(r => `<span class="tag" data-rs="${esc(r)}" style="cursor:pointer">${esc(r)}</span>`).join(' ')}</div>`,
      actions: [{ label: '取消' }, { label: '确认作废', cls: 'danger-ghost', icon: 'close', onClick: mm => {
        const reason = String(($('[data-x="reason"]', mm.el) || {}).value || '').trim() || BOM_VOID_REASONS[0];
        try { ACT.BOM.obsolete(no, reason); UI.toast(`${b.no} 已作废,父件 ${b.product} 改用新版或按外购处理`); rerender(); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    UI.$$('[data-rs]', m.el).forEach(t => t.addEventListener('click', () => { $('[data-x="reason"]', m.el).value = t.dataset.rs; }));
  }

  /** 下达计划建议:勾选行 → 外购合并一张采购申请、自制/委外逐件生成委外加工单 */
  function openMrpRelease(no, rerender) {
    const run = DB.find('mrp_run', no);
    const rows = DB.lines('mrp_lines', no).filter(l => (l.suggest_qty || 0) > 0 && !l.release);
    if (!rows.length) { UI.toast('本运算单没有待下达的建议行(已下达或库存足够)', 'warn'); return; }
    const procs = DB.list('processors').filter(p => p.qualification === 'qualified' && p.status === 'enabled');
    const hasOS = rows.some(l => l.suggest_type === 'OS');
    const on = {};
    rows.forEach(l => { on[l.lineno] = true; });

    function read(mm) {
      rows.forEach(l => { const c = $(`[data-c="${l.lineno}"]`, mm.el); if (c) on[l.lineno] = !!c.checked; });
      return rows.filter(l => on[l.lineno]);
    }
    function paint(mm) {
      const sel = read(mm);
      const buys = sel.filter(l => l.suggest_type === 'PR'), makes = sel.filter(l => l.suggest_type === 'OS');
      const pid = (($('[data-x="processor"]', mm.el) || {}).value || '');
      const pr = DB.find('processors', pid) || {};
      const fee = r2(makes.reduce((s, l) => s + l.suggest_qty * (+pr.unit_rate || 0), 0));
      $('#mr-sum', mm.el).innerHTML = `<span>勾选 <b>${sel.length} / ${rows.length}</b> 行</span>
        <span>采购申请 <b>¥${money(r2(buys.reduce((s, l) => s + l.amount, 0)))}</b>(${buys.length} 项外购)</span>
        <span>委外加工单 <b>${makes.length}</b> 张 · 加工费 <b>¥${money(fee)}</b></span>
        <span class="muted small">下达后为草稿单据,仍分别走采购申请审批与加工单下发</span>`;
      UI.$$('tr[data-r]', mm.el).forEach(tr => { tr.style.opacity = on[tr.dataset.r] ? '1' : '.45'; });
    }
    const m = UI.modal({
      title: '下达 MRP 计划建议', width: 'wide', subtitle: `${run.no} · ${run.name}`,
      body: `<div class="notice">${icon('info')}<div>外购件<b>合并成一张采购申请</b>(取最早需求日、最近成交价,后续仍需审批与转订单);自制/委外件<b>逐件生成委外加工单</b>,并按各自 BOM 自动带出发料行。系统只建单据,<b>不产生任何凭证</b>——库存与总账在收货、发料环节才动。</div></div>
        ${hasOS ? `<div class="form-grid mt12"><div class="fitem"><label>承接服务商(已核准)</label>
          <select data-x="processor">${procs.length ? procs.map(p => `<option value="${esc(p.code)}">${esc(p.name)} · ${esc(SCHEMA.entities.processors.fields.process_type.opts[p.process_type] || p.process_type)} · ¥${money(p.unit_rate)}/件</option>`).join('') : '<option value="">无已核准服务商</option>'}</select></div>
          <div class="fitem"><label>发料/收货仓库</label><input value="${esc(whName(run.warehouse) || '默认主仓')}" disabled style="width:100%"></div></div>` : ''}
        <div class="table-wrap mt12"><table class="lines-tbl"><thead><tr><th style="width:34px"></th><th>物料</th><th>层级</th>
          <th class="right" style="width:80px">净需求</th><th class="right" style="width:80px">建议下单</th><th class="right" style="width:76px">参考单价</th>
          <th class="right" style="width:100px">预计金额</th><th style="width:96px">需求日</th><th>建议单</th></tr></thead>
        <tbody>${rows.map(l => `<tr data-r="${l.lineno}">
          <td><input type="checkbox" data-c="${l.lineno}" checked></td>
          <td>${esc(l.product_name)}<div class="cell-sub mono">${esc(l.product)}</div></td>
          <td><span class="tag">L${l.level}</span>${l.bom_no ? `<div class="cell-sub mono small">${esc(l.bom_no)}</div>` : ''}</td>
          <td class="right money" style="color:var(--danger)">${use4(l.net_qty)}</td>
          <td class="right money strong">${num(l.suggest_qty)}<div class="cell-sub muted small">MOQ ${num(l.moq)}</div></td>
          <td class="right money">¥${money(l.price)}</td><td class="right money">¥${money(l.amount)}</td>
          <td class="small">${esc(l.need_date)}</td>
          <td><span class="badge ${l.suggest_type === 'OS' ? 'b-purple' : 'b-info'}">${esc(SCHEMA.MRP_SUGGEST[l.suggest_type] || l.suggest_type)}</span></td></tr>`).join('')}</tbody></table></div>
        <div class="lines-sum mt12" id="mr-sum"></div>`,
      actions: [{ label: '取消' },
        { label: '全选 / 反选', icon: 'refresh', onClick: mm => {
          const all = rows.every(l => on[l.lineno]);
          rows.forEach(l => { on[l.lineno] = !all; const c = $(`[data-c="${l.lineno}"]`, mm.el); if (c) c.checked = !all; });
          paint(mm); return false;
        } },
        { label: '下达建议单', cls: 'primary', icon: 'send', onClick: mm => {
          const sel = read(mm);
          if (!sel.length) { UI.toast('请至少勾选一行建议', 'err'); return false; }
          if (sel.some(l => l.suggest_type === 'OS') && !(($('[data-x="processor"]', mm.el) || {}).value || '')) {
            UI.toast('没有已核准的服务商,无法下达委外加工单', 'err'); return false;
          }
          try {
            const made = ACT.MRP.release(no, sel.map(l => l.lineno), { processor: (($('[data-x="processor"]', mm.el) || {}).value || '') });
            UI.toast(`已下达 ${made.length} 张单据:${made.join('、')}`);
            rerender();
            APP.refresh();
          } catch (e) { UI.toast(e.message, 'err'); return false; }
        } }]
    });
    UI.$$('input[type=checkbox]', m.el).forEach(el => { el.addEventListener('change', () => paint(m)); });
    const ps = UI.$('[data-x="processor"]', m.el); if (ps) ps.addEventListener('change', () => paint(m));
    paint(m);
    return m;
  }

  /** 重新运算:沿用本单口径(需求来源/周期/仓库)再跑一轮,生成新运算单 */
  function openMrpAgain(no, rerender, d) {
    const run = DB.find('mrp_run', no);
    UI.confirm(`按 <b>${esc(SCHEMA.MRP_DEMAND[run.source] || run.source)}</b> · 计划周期 <b>${num(run.horizon)} 天</b> · 库存口径 <b>${esc(whName(run.warehouse) || '全仓合计')}</b> 重新运算?<br><span class="muted small">运算只读库存、订单与清单,按当前时点重算净需求并新建一张计划运算单;原单及其下达记录保持不变。</span>`,
      { title: '重新执行 MRP 运算', ok: '开始运算' }).then(yes => {
        if (!yes) return;
        try {
          const r = ACT.MRP.run({ source: run.source, horizon: run.horizon, warehouse: run.warehouse,
            name: `${run.name}(重跑)`, note: `沿用 ${run.no} 口径重算` });
          UI.toast(`运算完成:${r.no} · ${r.rows_cnt} 行建议,缺料 ${r.shortage_cnt} 行`);
          if (d) d.close();
          open('mrp_run', r.no);
          APP.refresh();
        } catch (e) { UI.toast(e.message, 'err'); rerender(); }
      });
  }

  /** 新建计划运算:选口径即时起算,人工指定需求可在此直接录入要货行 */
  function openMrpWizard(pre) {
    pre = pre || {};
    let demand = [];
    const kinds = SCHEMA.MRP_DEMAND;
    function demandTable() {
      return `<div class="section-title mt16">人工需求行</div>
        <div class="table-wrap"><table class="lines-tbl"><thead><tr><th style="width:38px">#</th><th style="width:250px">物料</th>
        <th style="width:120px" class="right">需求数量</th><th style="width:150px">需求日期</th><th>来源说明</th><th class="rm"></th></tr></thead>
        <tbody id="wq-body">${demand.map((r, i) => `<tr data-i="${i}"><td class="muted">${i + 1}</td>
          <td><select data-f="product" style="width:100%">${['<option value="">请选择物料</option>'].concat(DB.list('products').filter(x => x.status === 'enabled').map(x => `<option value="${esc(x.code)}" ${x.code === r.product ? 'selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`)).join('')}</select></td>
          <td class="right"><input type="number" data-f="qty" value="${r.qty}" min="1" class="num right"></td>
          <td><input type="date" data-f="need_date" value="${esc(r.need_date)}"></td>
          <td><input data-f="from" value="${esc(r.from || '')}" placeholder="如:年度框架协议 / 门店调拨"></td>
          <td class="rm"><button class="del" data-i="${i}" title="删除该行">${icon('close')}</button></td></tr>`).join('')}</tbody></table></div>
        <div class="flex mt12"><button class="btn sm" id="wq-add">${icon('plus')}添加需求行</button>
          <span class="muted small">每行按「物料 + 数量 + 需求日」起算,同样会沿清单逐级引爆子件需求。</span></div>`;
    }
    function syncDemand() {
      UI.$$('#wq-body tr', m.el).forEach(tr => {
        const r = demand[+tr.dataset.i]; if (!r) return;
        UI.$$('[data-f]', tr).forEach(el => { r[el.dataset.f] = el.dataset.f === 'qty' ? (+el.value || 0) : el.value; });
      });
    }
    function paintDemand() { const box = $('#wq-dem', m.el); if (!box) return; box.innerHTML = demandTable(); bindDemand(); }
    function bindDemand() {
      const add = $('#wq-add', m.el);
      if (add) add.addEventListener('click', () => { syncDemand(); demand.push({ product: '', qty: 100, need_date: DB.addDays(DB.today(), 21), from: '人工需求' }); paintDemand(); });
      UI.$$('.del', m.el).forEach(b => b.addEventListener('click', () => { syncDemand(); demand.splice(+b.dataset.i, 1); paintDemand(); }));
      UI.$$('#wq-body [data-f]', m.el).forEach(el => el.addEventListener('change', syncDemand));
    }
    const m = UI.modal({
      title: '新建 MRP 计划运算', width: 'wide', subtitle: '需求 → 清单逐级展开 → 扣可用量 → 净需求 → 建议单',
      body: `<div id="wq-head">${UI.form([
        { k: 'name', label: '运算主题', type: 'text', required: true, full: true, def: pre.name || `${kinds[pre.source || 'so_open']}计划 ${DB.today().slice(0, 7)}` },
        { k: 'source', label: '需求来源', type: 'select', required: true, def: pre.source || 'so_open', opts: kinds, placeholder: false, hint: '决定缺口从哪里起算' },
        { k: 'horizon', label: '计划周期(天)', type: 'int', required: true, def: pre.horizon || 60, hint: '仅「未履约销售订单」口径按需求日筛选' },
        { k: 'warehouse', label: '库存口径仓', type: 'ref', ref: 'warehouses', def: pre.warehouse || '', ph: '留空 = 全仓合计' },
        { k: 'note', label: '运算说明', type: 'textarea', full: true, def: pre.note || '' }],
        { source: pre.source || 'so_open', horizon: pre.horizon || 60, warehouse: pre.warehouse || '' })}</div>
        <div id="wq-dem"></div>
        <div class="notice mt16">${icon('info')}<div>运算<b>只读</b>:读取库存、未履约订单、在途采购与在制委外,写出计划运算单与建议行,<b>不产生任何库存流水或凭证</b>。下达建议后仍是草稿申请单/加工单,由采购与生产环节分别审批执行。</div></div>`,
      actions: [{ label: '取消' }, { label: '开始运算', cls: 'primary', icon: 'zap', onClick: mm => {
        const src = ($('[data-k="source"]', mm.el) || {}).value || 'so_open';
        const hz = +((($('[data-k="horizon"]', mm.el) || {}).value || 60));
        const wh = (($('[data-k="warehouse"]', mm.el) || {}).value || '');
        const nm = String((($('[data-k="name"]', mm.el) || {}).value || '')).trim();
        if (!nm) { UI.toast('请填写运算主题', 'err'); return false; }
        let req = [];
        if (src === 'manual') {
          syncDemand();
          req = demand.filter(r => r.product && (+r.qty || 0) > 0).map(r => ({ product: r.product, qty: +r.qty, need_date: r.need_date || DB.addDays(DB.today(), 14), from: r.from || '人工需求' }));
          if (!req.length) { UI.toast('请按「人工指定需求」口径至少录入一行有效需求', 'err'); return false; }
        }
        try {
          const run = ACT.MRP.run({ name: nm, source: src, horizon: hz, warehouse: wh, demand: req,
            note: String((($('[data-k="note"]', mm.el) || {}).value || '')).trim() });
          UI.toast(`运算完成 ${run.no}:${run.rows_cnt} 行建议,缺料 ${run.shortage_cnt} 行,展开 ${run.levels} 层`);
          APP.refresh();
          setTimeout(() => open('mrp_run', run.no), 120);
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    const sw = $('[data-k="source"]', m.el);
    function toggleDem() {
      const box = $('#wq-dem', m.el);
      if ((sw || {}).value === 'manual') {
        if (!demand.length) demand.push({ product: pre.product || '', qty: pre.qty || 100, need_date: pre.need_date || DB.addDays(DB.today(), 21), from: pre.from || '人工需求' });
        box.innerHTML = demandTable(); bindDemand();
      } else box.innerHTML = '';
    }
    if (sw) sw.addEventListener('change', toggleDem);
    toggleDem();
    return m;
  }

  /** 物料画像里的计划卡片:供应方式、生效清单、滚算成本与可用量口径 */
  function planCard(code, row) {
    const bm = ACT.BOM.of(code);
    const used = ACT.BOM.whereUsed(code);
    const sup = ACT.MRP.supply(code, '');
    const rolled = ACT.BOM.matCost(code);
    const kids = bm ? DB.lines('bom_lines', bm.no) : [];
    const src = row.mrp_src || (bm ? bm.mrp_src : 'buy');
    return `<div class="card"><div class="card-head"><h3>${icon('zap')}计划与工程口径</h3>
      <div class="right"><span class="badge ${src === 'buy' ? 'b-info' : src === 'out' ? 'b-purple' : 'b-success'}">${esc(SCHEMA.MRP_SRC[src] || src)}</span>
        ${bm ? `<span class="muted small">生效清单 </span>${jumpHTML(bm.no)}` : '<span class="muted small">无生效清单</span>'}</div></div>
      <div class="card-body"><div class="stat-row">
        <div>多级滚算成本<b>¥${money(rolled)}</b></div><div>物料主数据成本<b>¥${money(row.cost)}</b></div>
        <div>可用量<b>${num(sup.avail)}</b></div><div>在途/在制<b>${num(sup.on_order)}</b></div>
        <div>最小起订<b>${num(row.moq)}</b></div><div>提前期<b>${num(row.lead_time)} 天</b></div></div>
      <div class="muted small mt8">可用量 = 现量 ${num(sup.on_hand)} − 订单占用 ${num(sup.reserved)} + 在途与在制 ${num(sup.on_order)};MRP 按该口径判定是否缺料。参考单价取最近一笔采购成交价,无采购史回落标准成本。</div></div>
      ${bm ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>子件</th><th class="right">单件用量</th><th class="right">损耗</th><th class="right">单件耗用</th><th class="right">标准成本</th><th class="right">单件金额</th><th>属性</th></tr></thead>
        <tbody>${kids.slice(0, 8).map(l => { const p = DB.find('products', l.product) || {}; return `<tr><td class="muted">${l.lineno}</td>
          <td><span class="mono cell-link" data-jump="products=${encodeURIComponent(l.product)}">${esc(l.product)}</span><div class="cell-sub">${esc(l.product_name)}</div></td>
          <td class="right money">${use4(l.qty)}</td><td class="right money">${l.loss_rate ? (+l.loss_rate * 100).toFixed(1) + '%' : '—'}</td>
          <td class="right money strong">${use4(ACT.BOM.unitUse(l))}</td><td class="right money">¥${money(p.cost || 0)}</td>
          <td class="right money">¥${money(ACT.BOM.unitUse(l) * (p.cost || 0))}</td>
          <td>${l.key_part === 'y' ? '<span class="badge b-warning">关键件</span>' : ''}${ACT.BOM.of(l.product) ? '<span class="badge b-neutral">自制/委外</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>
        ${kids.length > 8 ? `<div class="muted small mt8">共 ${kids.length} 项子件,仅显示前 8 行,完整清单请点开 ${esc(bm.no)}。</div>` : ''}` : ''}
      ${used.length ? `<div class="card-body"><div class="section-title">被 ${used.length} 张清单作为子件引用</div>
        <div class="flex" style="flex-wrap:wrap;gap:8px">${used.map(u => `<span class="tag" data-jump="bom=${encodeURIComponent(u.no)}" style="cursor:pointer">${esc(u.no)} · ${esc(u.parent_name || u.parent)} · 用量 ${use4(u.per_unit)}</span>`).join('')}</div>
        <div class="muted small mt8">工程变更需评估这些上层成品的在制与在途影响;清单作废只压失效日,历史展开保持可追。</div></div>` : ''}
      ${bm ? '' : `<div class="card-body"><div class="notice ${src === 'buy' ? '' : 'warn'}">${icon(src === 'buy' ? 'info' : 'warn')}<div>${src === 'buy'
        ? '该物料按<b>外购采购</b>处理:MRP 直接为其净需求生成采购申请建议,无需工程清单。'
        : '该物料标记为 <b>' + esc(SCHEMA.MRP_SRC[src] || src) + '</b> 但当前没有生效清单:MRP 会把它当作外购件直接出采购建议,建议补录工程清单后重算。'}
        <div class="mt8"><button class="btn sm${src === 'buy' ? '' : ' primary'}" data-md="bomNew">${icon('plus')}编制物料清单</button></div></div></div></div>`}</div>`;
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
    apApprove: 'approve', apReject: 'approve', apResubmit: 'edit',
    saSubmit: 'edit', saInspect: 'edit', saApprove: 'approve', saReject: 'approve', saArchive: 'edit',
    paSubmit: 'edit', paScore: 'edit', paApprove: 'approve', paReject: 'approve', paToOS: 'edit',
    osConfirm: 'approve', osIssue: 'edit', osReceive: 'edit', osCancel: 'edit',
    grReport: 'edit', iqcJudge: 'approve',
    rmaSubmit: 'edit', rmaApprove: 'approve', rmaReject: 'approve', rmaReceive: 'edit', rmaCredit: 'edit', rmaRefund: 'edit', rmaRepair: 'edit', rmaClose: 'edit',
    lotFreeze: 'edit', lotRelease: 'approve', lotScrap: 'approve', lotMove: 'edit',
    plSubmit: 'edit', plRetire: 'approve', priceAsk: 'edit',
    bomSubmit: 'edit', bomAp: 'view', bomVoid: 'approve',
    mrpRelease: 'edit', mrpClose: 'edit', mrpAgain: 'edit',
  };

  /** 销售订单审核:毛利红线拦截引导发起改价申请,信用超限引导发起信用特批 */
  function confirmSOFlow(no, wrap, rerender) {
    let r = null, err = null;
    try { r = ACT.confirmSO(no); } catch (e) { err = e; }
    if (!err) {
      if (r.shortage) UI.toast(`已审核,但 ${r.shortage} 行库存不足`, 'warn'); else UI.toast('审核通过,单据已生效');
      rerender(); return;
    }
    const so = DB.find('sales_order', no);
    /* 与 priceBlock 同口径判断:已核准的改价审批放行后不再重复拦截 */
    const apOK = so.price_ap && (DB.find('approval', so.price_ap) || {}).status === 'approved';
    const bad = apOK ? [] : ACT.PRICE.guard(so, DB.lines('so_lines', no));
    if (err.gate === 'price') {
      if (!bad.length || so.price_ap) { UI.toast(err.message, 'err'); return; }
      UI.confirm(`${esc(err.message)}<br><br>发起后由销售主管按<b>价差金额</b>分级裁决,核准即自动回写单价并放行审核;坚持低价成交也可在此改回价目表报价。`,
        { title: '成交价跌破毛利红线,需改价核准', ok: '发起改价申请' }).then(yes => { if (yes) openPriceAsk(no, rerender); });
      return;
    }
    if (err.gate !== 'credit') { UI.toast(err.message, 'err'); return; }
    const st = ACT.creditState(so.customer);
    const over = st.limit > 0 ? (st.used + (so.total || 0)) / st.limit > ACT.CREDIT_BLOCK : (st.used + (so.total || 0)) > 0;
    if (st.hold || !over) { UI.toast(err.message, 'err'); return; }
    UI.confirm(`${esc(err.message)}<br><br>发起后由财务经理在审批中心裁决,通过则本单自动审核生效。`,
      { title: '信用超限,需特批放行', ok: '发起信用特批' }).then(yes => {
        if (!yes) return;
        wrap(() => { const x = ACT.submitCreditRelease(no); UI.toast(`已发起 ${x.no},待财务经理裁决`); });
        rerender();
      });
  }

  function run(action, entity, no, rerender, d) {
    const wrap = fn => { try { fn(); } catch (e) { UI.toast(e.message || '操作失败', 'err'); return; } };
    const row = DB.find(entity, no);
    const need = ACT_PERM[action] || 'view';
    const gate = permCheck(entity, row, need);
    if (need !== 'view' && !gate.ok) { UI.toast(gate.why, 'err'); return; }
    switch (action) {
      case 'confirm': if (entity === 'sales_order') { confirmSOFlow(no, wrap, rerender); break; } wrap(() => ACT.confirmPO(no)); UI.toast('审核通过,单据已生效'); rerender(); break;
      case 'cancel': UI.confirm(`确认取消单据 <b class="mono">${esc(no)}</b>?取消后库存占用将被释放。`, { danger: true, ok: '确认取消' }).then(yes => { if (!yes) return; wrap(() => entity === 'sales_order' ? ACT.cancelSO(no) : ACT.cancelPO(no)); UI.toast('单据已取消'); rerender(); }); break;
      case 'delete': UI.confirm(`删除草稿单据 <b class="mono">${esc(no)}</b>?该操作不可恢复。`, { danger: true, ok: '删除' }).then(yes => { if (!yes) return;
        const apNo = row.approval || row.ap;
        const ap = apNo ? DB.find('approval', apNo) : null;
        if (ap && ap.status === 'pending') { ap.status = 'cancelled'; ap.opinion = '来源单据已删除,审批自动撤回'; ap.time_done = DB.nowStr(); DB.upsert('approval', ap); }
        DB.remove(entity, no); UI.toast('已删除'); d.close(); APP.refresh(); }); break;
      case 'reopen': wrap(() => entity === 'purchase_order' ? ACT.reopenPO(no) : ACT.reopenSO(no)); UI.toast('已反审核,单据回到草稿'); rerender(); break;
      case 'edit': openEditor(entity, no, rerender); break;
      case 'deliver': openQtyModal(entity, no, 'deliver', rerender); break;
      case 'receive': openQtyModal(entity, no, 'receive', rerender); break;
      case 'invoice': openQtyModal(entity, no, 'invoice', rerender); break;
      case 'toBill': openIRModal(no, rerender); break;
      case 'pay': openMoneyModal('bill', no, rerender); break;
      case 'receipt': openMoneyModal('invoice', no, rerender); break;
      case 'submit': wrap(() => {
        row.approval = ACT.submitApproval('purchase_req', no, {
          title: `采购申请 ${no} · ${row.dept || ''}`, applicant: row.requester || DB.currentUser(),
          role: '采购主管', amount: row.amount || 0, note: row.reason || ''
        });
        row.status = 'pending'; DB.upsert('purchase_req', row);
        const ap = DB.find('approval', row.approval);
        DB.log('采购管理', '提交采购申请', no, ap && ap.chain && ap.chain.length > 1 ? `金额分级会签:${ap.chain.map(n => n.role).join(' → ')}` : '');
        UI.toast(ap && ap.chain && ap.chain.length > 1
          ? `已发起 ${ap.no},金额 ¥${UI.money(row.amount)} 需 ${ap.chain.length} 级会签`
          : `已提交审批,待采购主管裁决`);
      }); rerender(); break;
      case 'apResubmit': openResubmit(no, rerender, d); break;
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
      case 'apApprove': openOpinion('审批 · ' + no, true, txt => { wrap(() => { UI.toast(signMsg(ACT.decideApproval(no, true, txt), true)); }); rerender(); }); break;
      case 'apReject': openOpinion('审批 · ' + no, false, txt => { wrap(() => { UI.toast(signMsg(ACT.decideApproval(no, false, txt), false)); }); rerender(); }); break;
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

      /* ---------------- 来料检验 IQC ---------------- */
      case 'iqcJudge': openIQCJudge(no, rerender); break;
      case 'iqcGr': if (row.gr) { d.close(); open('gr', row.gr); } break;
      case 'iqcSup': if (row.supplier) { d.close(); masterDetail('suppliers', row.supplier); } break;
      case 'grIqc': { const q = DB.where('iqc', x => x.gr === no)[0]; if (!q) { UI.toast('该收货单尚未报检', 'warn'); break; } d.close(); open('iqc', q.no); break; }
      case 'grReport': wrap(() => { const x = ACT.IQC.create(no); UI.toast('已生成报检单 ' + x + ',批次隔离在待检仓'); d.close(); open('iqc', x); }); break;

      /* ---------------- 批次追溯与库位 ---------------- */
      case 'lotFreeze': openLotHold(no, 'frozen', rerender); break;
      case 'lotRelease': openLotHold(no, 'normal', rerender); break;
      case 'lotScrap': openLotScrap(no, rerender); break;
      case 'lotMove': openLotMove(no, rerender); break;
      case 'lotRecall': openLotRecall(no, rerender); break;
      case 'binLabel': printBinLabel(no); break;

      /* ---------------- 价格策略 ---------------- */
      case 'plSubmit': wrap(() => {
        const x = ACT.PRICE.submitList(no);
        const chain = (DB.find('approval', x.no) || {}).chain || [];
        UI.toast(`已发起 ${x.no}${chain.length > 1 ? `,让利 ¥${money(Math.abs(x.impact))} 需 ${chain.length} 级会签(${chain.map(c => c.role).join(' → ')})` : ',待销售主管裁决'}`);
      }); rerender(); break;
      case 'plAp': if (row.ap) { d.close(); open('approval', row.ap); } break;
      case 'plRetire': openRetire(no, rerender); break;
      case 'priceAsk': openPriceAsk(no, rerender); break;

      /* ---------------- 计划:BOM / MRP ---------------- */
      case 'bomSubmit': wrap(() => {
        const apNo = ACT.BOM.submit(no);
        const chain = (DB.find('approval', apNo) || {}).chain || [];
        UI.toast(`已发起 ${apNo}${chain.length > 1 ? `,按材料影响额需 ${chain.length} 级会签(${chain.map(c => c.role).join(' → ')})` : ',待采购主管核准'}`);
      }); rerender(); break;
      case 'bomAp': if (row.ap) { d.close(); open('approval', row.ap); } else UI.toast('本清单尚未提交核准', 'warn'); break;
      case 'bomVoid': openBomVoid(no, rerender); break;
      case 'mrpRelease': openMrpRelease(no, rerender); break;
      case 'mrpAgain': openMrpAgain(no, rerender, d); break;
      case 'mrpClose': {
        const openCnt = DB.lines('mrp_lines', no).filter(l => (l.suggest_qty || 0) > 0 && !l.release).length;
        UI.confirm(`归档运算单 <b class="mono">${esc(no)}</b>?${openCnt
          ? `<br><br>尚有 <b>${openCnt}</b> 行建议未下达,归档后本批缺口不再补下计划单,需重新运算。<br><span class="muted small">已下达的采购申请与委外加工单不受影响,仍在各自列表中继续执行。</span>`
          : '<br><span class="muted small">建议已全部下达,归档后本单只读,不可再下达或修改。</span>'}`,
          { danger: !!openCnt, ok: openCnt ? '强制归档' : '确认归档' }).then(yes => {
            if (!yes) return;
            wrap(() => { ACT.MRP.close(no, !!openCnt); UI.toast(openCnt ? '运算单已强制归档' : '运算单已归档'); });
            rerender();
          });
        break;
      }

      case 'print': printDoc(entity, no); break;
      default: UI.toast('暂不支持的操作: ' + action, 'warn');
    }
  }
  function recomputeAll(products) { products.forEach(p => ACT.recomputeReserved(p)); }

  /* ---------------- 批次冻结 / 放行 / 处置 / 移位 / 召回 ---------------- */
  const HOLD_REASONS = ['来料抽检不合格待复检', '客户投诉疑似缺陷', '包装破损待整批返工', '超过效期待销毁', '法规抽检破坏性检测'];

  function openLotHold(no, to, rerender) {
    const l = DB.find('lot', no);
    const freeze = to === 'frozen';
    const av = ACT.available(l.product, l.warehouse);
    const after = Math.max(0, freeze ? av - l.qty : av + l.qty);
    const m = UI.modal({
      title: freeze ? '批次质量冻结' : '批次复检放行',
      subtitle: `${l.no} · ${l.product_name} · 余量 ${num(l.qty)} 件`, width: 'mid',
      body: `<div class="stat-row"><div>批次余量<b>${num(l.qty)}</b></div><div>该仓可售可用<b>${num(av)}</b></div>
        <div>操作后可用<b>${num(after)}</b></div><div>批次金额<b>¥${money(l.value)}</b></div></div>
        <div class="notice ${freeze ? 'warn' : ''} mt12">${icon(freeze ? 'lock' : 'unlock')}<div>${freeze
          ? '冻结只改变<b>可售状态</b>:账面数量、库存金额与总账 1405 全部不变;该批次从<b>可用量</b>中剔除,FEFO 分配自动跳过。'
          : '放行后该批次重新进入 FEFO 可发池,可用量如数回补;质量放行需审批岗权限。'}
          <br>当前落位:${esc(whName(l.warehouse))} · <span class="mono">${esc(l.bin || '未落位')}</span>。</div></div>
        <div class="form-grid mt16"><div class="fitem" style="grid-column:1/-1"><label>处置说明${freeze ? '(必填,作为追溯留痕)' : '(选填)'}</label>
          <input data-x="reason" placeholder="${esc(freeze ? HOLD_REASONS[0] : '复检合格,恢复销售')}" style="width:100%"></div></div>
        <div class="muted small mt8">常用事由:${HOLD_REASONS.map(r => `<span class="tag" data-rs="${esc(r)}" style="cursor:pointer">${esc(r)}</span>`).join(' ')}</div>`,
      actions: [{ label: '取消' }, { label: freeze ? '确认冻结' : '确认放行', cls: freeze ? 'danger-ghost' : 'primary', icon: freeze ? 'lock' : 'unlock',
        onClick: mm => {
          const el = $('[data-x="reason"]', mm.el) || {};
          const reason = String(el.value || '').trim();
          if (freeze && reason.length < 4) { UI.toast('请填写不少于 4 字的冻结事由,追溯需要可查的留痕', 'err'); return false; }
          try {
            if (freeze) ACT.LOT.freeze(l.no, reason); else ACT.LOT.release(l.no, reason);
            UI.toast(freeze ? `已冻结 ${num(l.qty)} 件,可用量降至 ${num(Math.max(0, ACT.available(l.product, l.warehouse)))}`
              : '批次已放行,重新进入可发池');
            setTimeout(rerender, 30);
          } catch (e) { UI.toast(e.message, 'err'); return false; }
        } }]
    });
    m.el.querySelectorAll('[data-rs]').forEach(t => t.addEventListener('click', () => {
      const i = $('[data-x="reason"]', m.el); if (i) i.value = t.dataset.rs;
    }));
    return m;
  }

  /** 批次处置:冻结/过期批次最终出口,按批次身份定点出库并结转到主营业务成本 */
  function openLotScrap(no, rerender) {
    const l = DB.find('lot', no);
    const s = DB.find('stock', l.product + '-' + l.warehouse) || {};
    const unit = s.cost || l.unit_cost || 0;
    const od = l.expire_date ? UI.days(DB.today(), l.expire_date) : null;
    const REASONS = ['超效期报废销毁', '质量不合格报废', '退回供应商', '转残次折价处理', '研发/内部领用'];
    return UI.modal({
      title: '批次处置出库', subtitle: `${l.no} · ${l.product_name} · ${(SCHEMA.STATUS[l.status] || {}).l || l.status}`, width: 'mid',
      body: `<div class="stat-row"><div>批次余量<b>${num(l.qty)}</b></div><div>账面成本(移动加权)<b>¥${money(unit)}</b></div>
        <div>批次入账成本<b>¥${money(l.unit_cost)}</b></div>
        <div>效期<b>${l.expire_date ? (od < 0 ? `<span style="color:var(--danger)">已过 ${-od} 天</span>` : '剩 ' + od + ' 天') : '长期有效'}</b></div></div>
        <div class="form-grid mt16" style="grid-template-columns:repeat(2,1fr)">
          <div class="fitem"><label>处置数量(件)</label><input type="number" data-x="qty" value="${l.qty}" min="1" max="${l.qty}" class="num"></div>
          <div class="fitem"><label>处置方式</label><select data-x="reason">${REASONS.map(r => `<option>${r}</option>`).join('')}</select></div></div>
        <div class="notice mt12">${icon('info')}<div>凭证:<b>借 5401 主营业务成本 / 贷 1405 库存商品</b>,按该仓移动加权平均成本结转,库存子账与总账保持同源;
          台账会记一笔指定该批次的出库流水,处置后批次流向在追溯卡上永久留痕。</div></div>`,
      actions: [{ label: '取消' }, { label: '确认处置', cls: 'danger-ghost', icon: 'trash', onClick: mm => {
        const qty = +(($('[data-x="qty"]', mm.el) || {}).value || 0);
        const reason = (($('[data-x="reason"]', mm.el) || {}).value || REASONS[0]);
        try {
          const r = ACT.LOT.scrap(l.no, qty, reason);
          UI.toast(`已处置 ${num(qty)} 件,结转成本 ¥${money(r.amount)} · 单据 ${r.ref}`);
          setTimeout(rerender, 30);
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
  }

  /** 库位移位:同仓换库位,库区与容量规则由分配引擎校验 */
  function openLotMove(no, rerender) {
    const l = DB.find('lot', no);
    const wh = DB.find('warehouses', l.warehouse) || {};
    const zone = wh.kind === 'qc' ? 'qcd' : wh.kind === 'defect' ? 'def' : 'stg';
    const allowed = l.status === 'normal' && zone === 'stg' ? [zone, 'pick'] : [zone];
    const cands = DB.where('bins', b => b.warehouse === l.warehouse && b.status === 'enabled' && b.code !== l.bin
      && allowed.indexOf(b.zone) >= 0 && ACT.LOT.eng.binLoad(b.code) + l.qty <= (b.capacity || 0));
    if (!cands.length) { UI.toast(`${wh.name || l.warehouse} 内没有满足库区与容量规则的可用库位;跨仓请改用库存调拨单`, 'warn'); return; }
    return UI.modal({
      title: '批次库位移位', subtitle: `${l.no} · 现落位 ${l.bin || '—'} · ${num(l.qty)} 件`, width: 'mid',
      body: `<div class="muted small">只在同仓库内换货位,数量与金额不变;跨仓移动必须走调拨单,否则会破坏批次与库存的对应关系。</div>
        <div class="table-wrap mt12"><table class="tbl"><thead><tr><th></th><th>库位</th><th>库区</th><th class="right">现有占用</th><th class="right">容量</th><th class="right">移位后</th></tr></thead>
        <tbody>${cands.map((b, i) => {
          const load = ACT.LOT.eng.binLoad(b.code);
          return `<tr><td><input type="radio" name="tgt-bin" value="${esc(b.code)}"${i === 0 ? ' checked' : ''}></td>
            <td class="mono">${esc(b.code)}</td><td>${esc(SCHEMA.ZONES[b.zone] || b.zone)}</td>
            <td class="right money">${num(load)}</td><td class="right money">${num(b.capacity)}</td>
            <td class="right money">${num(load + l.qty)}</td></tr>`; }).join('')}</tbody></table></div>`,
      actions: [{ label: '取消' }, { label: '确认移位', cls: 'primary', icon: 'grid', onClick: mm => {
        const c = mm.el.querySelector('input[name="tgt-bin"]:checked');
        if (!c) { UI.toast('请选择目标库位', 'err'); return false; }
        try { const r = ACT.LOT.moveToBin(l.no, c.value); UI.toast(`批次已移至 ${r.to}`); setTimeout(rerender, 30); }
        catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
  }

  /** 召回影响分析:在库可拦截 + 已发货客户 + 未结订单 + 同物料其他批次 */
  function openLotRecall(no, rerender) {
    const r = ACT.LOT.recall(no);
    const l = r.lot, p = r.product || {};
    const canFreeze = ACT.PERM.can('lot', 'edit') && l.qty > 0 && l.status === 'normal';
    return UI.modal({
      title: '召回影响分析', subtitle: `${l.no} · ${l.product_name} · 来源 ${SCHEMA.LOT_SOURCE[l.source] || l.source || '—'}`, width: 'wide',
      body: `<div class="stat-row"><div>在库可拦截<b>${num(r.inStockQty)} 件</b></div><div>在库金额<b>¥${money(r.inStockValue)}</b></div>
        <div>已发货<b>${num(r.shippedQty)} 件</b></div><div>涉及客户<b>${r.customers.length}</b></div>
        <div>未结订单<b>${r.openSo.length}</b></div><div>同物料其他批次<b>${r.siblingLots.length}</b></div></div>
        ${l.qty > 0 ? `<div class="notice warn mt12">${icon('warn')}<div><b>在库拦截</b>:该批次仍占 ${num(l.qty)} 件账面库存,冻结后立即从可售可用量剔除,后续 FEFO 分配不再命中。</div></div>`
        : `<div class="notice mt12">${icon('info')}<div>该批次余量已全部发出,召回面为下游客户与在途单据。</div></div>`}
        <div class="section-title">已发货流向(${r.customers.length} 个客户 / ${num(r.shippedQty)} 件)</div>
        ${r.customers.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>客户</th><th class="right">数量</th><th>出库/发料单</th><th>发票</th></tr></thead>
          <tbody>${r.customers.map(c => `<tr><td>${esc(c.name)}<div class="cell-sub mono">${esc(c.code)}</div></td>
            <td class="right money">${num(c.qty)}</td><td class="small mono">${esc(c.docs.join('、') || '—')}</td>
            <td class="small mono">${esc(c.invoices.join('、') || '—')}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="muted small">该批次尚无对外发货记录。</div>`}
        <div class="section-title mt12">未结销售订单(同物料,需改派其他批次)</div>
        ${r.openSo.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>订单号</th><th>日期</th><th>客户</th><th class="right">未交数量</th><th>状态</th></tr></thead>
          <tbody>${r.openSo.map(o => `<tr><td class="mono">${esc(o.no)}</td><td>${dateCN(o.date)}</td><td>${esc(o.customer_name || o.customer)}</td>
            <td class="right money">${num(o.qty)}</td><td>${UI.badge(o.status)}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="muted small">没有未交货订单使用该物料。</div>`}
        ${r.siblingLots.length ? `<div class="section-title mt12">同物料其他在库批次</div><div class="muted small">
          ${r.siblingLots.map(x => `${x.no}(${x.warehouse}/${x.bin || '—'},${num(x.qty)} 件)`).join(' · ')}</div>` : ''}
        ${r.source ? `<div class="notice mt12">${icon('link')}<div>上游:<span class="mono">${esc(r.source.gr)}</span> ← 采购订单 <span class="mono">${esc(r.source.po || '—')}</span> · 供应商 <span class="mono">${esc(r.source.supplier || '—')}</span>${r.source.iqc ? ` · 检验单 <span class="mono">${esc(r.source.iqc)}</span>` : ''}</div></div>` : ''}`,
      actions: [{ label: '关闭' }].concat(canFreeze ? [{ label: '冻结该批次', cls: 'danger-ghost', icon: 'lock', onClick: () => {
        try {
          ACT.LOT.freeze(l.no, '召回预案:疑似缺陷批次在库拦截');
          UI.toast(`已冻结 ${num(l.qty)} 件,该批次从可售可用量中剔除`);
          if (rerender) rerender();
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }] : [])
    });
  }

  /** 库位标签:仓内可视化与扫码寻位 */
  function printBinLabel(code) {
    const b = DB.find('bins', code); if (!b) return;
    const lots = DB.where('lot', x => x.bin === code && x.qty > 0);
    const qty = lots.reduce((s, x) => s + x.qty, 0);
    const w = window.open('', '_blank', 'width=460,height=520');
    if (!w) { UI.toast('浏览器拦截了打印窗口,请允许弹出窗口', 'warn'); return; }
    const meta = DB.all().meta;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>库位标签 ${code}</title><style>
      body{font:13px/1.5 "Microsoft YaHei",system-ui;margin:0;padding:22px;color:#111}
      .lb{border:2px solid #111;border-radius:10px;padding:16px 18px}
      .code{font-size:30px;font-weight:800;letter-spacing:2px;font-family:ui-monospace,Consolas,monospace}
      .h{font-size:11px;color:#667;letter-spacing:1px} hr{border:0;border-top:1px dashed #bbb;margin:12px 0}
      table{width:100%;border-collapse:collapse;font-size:11.5px} td{padding:3px 0} .r{text-align:right}
      .ft{color:#778;font-size:11px;margin-top:12px}</style></head><body><div class="lb">
      <div class="h">${meta.company} · 库位标签</div><div class="code">${code}</div>
      <div>${esc(whName(b.warehouse))} · ${esc(SCHEMA.ZONES[b.zone] || b.zone)}</div><hr>
      <div class="h">容量 / 占用</div><div style="font-size:17px;font-weight:700">${num(qty)} / ${num(b.capacity)} 件</div><hr>
      <table><tbody>${lots.length ? lots.map(x => `<tr><td>${esc(x.product_name)}<div style="color:#778;font-family:monospace">${esc(x.no)}</div></td>
        <td class="r">${num(x.qty)} 件</td></tr>`).join('') : '<tr><td style="color:#778">空置库位</td></tr>'}</tbody></table>
      <div class="ft">责任人:${esc(b.manager || '—')} · 打印 ${DB.nowStr()} · 盘点与移位后请重新打印</div>
      </div></body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { } }, 300);
  }

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
        <div class="fitem"><label>发货备注</label><input data-x="note"></div></div>
      <div data-fefo>${fefoHTML(rowsData, row.warehouse)}</div>`
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
    if (kind === 'deliver') bindFEFO(m, rowsData, row.warehouse);
    return m;
  }

  /** FEFO 预分配:过账前看清将扣哪些批次,分配只决定发出哪个批次,成本仍按移动加权平均结转 */
  function fefoHTML(rows, wh) {
    const plan = rows.map(r => ({ name: r.product_name, product: r.code, qty: r.qty,
      alloc: r.qty > 0 ? ACT.LOT.preview(r.product, wh, r.qty) : [] })).filter(x => x.qty > 0);
    if (!plan.length) return '<div class="muted small mt12">本次未选择出库数量,批次分配将在录入数量后计算。</div>';
    const short = plan.filter(x => x.alloc.reduce((s, a) => s + a.qty, 0) < x.qty);
    return `<div class="section-title mt16">FEFO 批次预分配(先到期先出)</div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>物料</th><th>分配批次</th><th>库位</th><th class="right">数量</th><th>到期日</th></tr></thead>
      <tbody>${plan.map(x => x.alloc.length
        ? x.alloc.map((a, j) => `<tr>${j === 0 ? `<td rowspan="${x.alloc.length}">${esc(x.name)}<div class="cell-sub mono">${esc(x.product)}</div></td>` : ''}
            <td class="mono">${esc(a.lot)}</td><td class="mono small">${esc(a.bin || '—')}</td><td class="right money">${num(a.qty)}</td>
            <td>${a.expire_date ? dateCN(a.expire_date) : '长期'}</td></tr>`).join('')
        : `<tr><td>${esc(x.name)}<div class="cell-sub mono">${esc(x.product)}</div></td>
            <td colspan="4" style="color:var(--danger)">可发批次不足,缺口 ${num(x.qty)} 件</td></tr>`).join('')}</tbody></table></div>
      ${short.length ? `<div class="notice warn mt12">${icon('warn')}<div>存在批次缺口。过账时引擎会先借用冻结/已过效期批次,仍不足则按差异补建批次以保证台账断裂为零,并在流水留下「账实自愈」标记。</div></div>`
        : `<div class="notice mt12">${icon('info')}<div>预分配仅决定<b>发出哪个批次</b>;出库成本按该仓移动加权平均结转,与总账 1405 同源。冻结与已过效期批次不参与分配。</div></div>`}
      <div class="muted small mt8">出库仓库:${esc(whName(wh))} · 分配规则:${esc(SCHEMA.ISSUE_RULES.fefo)}</div>`;
  }
  function bindFEFO(m, rowsData, wh) {
    const box = UI.$('[data-fefo]', m.el);
    if (!box) return;
    const refresh = () => {
      const live = rowsData.map((r, i) => Object.assign({}, r, { qty: +(UI.$(`[data-q="${i}"]`, m.el) || { value: 0 }).value || 0 }));
      box.innerHTML = fefoHTML(live, wh);
    };
    UI.$$('[data-q]', m.el).forEach(inp => inp.addEventListener('input', refresh));
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

  const DEFECT_CODES = ['外观/包装缺陷', '丝印偏移 / 色差', '外箱破损', '尺寸超差', '功能失效', '材质不符', '配件缺失'];

  /** 抽检裁决:逐行录入不合格数,实时比对 AQL 允收数,三分支结论决定库存与暂估去向 */
  function openIQCJudge(no, rerender) {
    const a = DB.find('iqc', no);
    const lines = DB.lines('iqc_lines', no);
    const gr = DB.find('gr', a.gr) || {};
    const sup = DB.find('suppliers', a.supplier) || {};
    const WHS = DB.where('warehouses', w => w.kind !== 'qc' && w.status !== 'disabled');
    const defTarget = a.target_wh || gr.warehouse || SCHEMA.QC_WH;
    const m = UI.modal({
      title: '来料检验判定', width: 'wide',
      subtitle: `${no} · ${esc(a.supplier_name)} · ${esc(SCHEMA.QC_POLICY[sup.qc_policy] || '抽样检验 AQL')}`,
      body: `<div class="notice">${icon('shield')}<div>抽样依据 <b>${esc(a.standard)}</b>:本批到货 <b>${num(a.qty_in)}</b> 件,抽检 <b>${num(a.sample_qty)}</b> 件,AQL 允收不合格 <b>${num(a.acc_qty)}</b> 件。批次现隔离在 <b>${esc(SCHEMA.QC_WH)}</b>,判定前不可销售与领用。</div></div>
        <div class="table-wrap mt12"><table class="lines-tbl"><thead><tr><th>物料</th><th class="right" style="width:88px">到货</th>
          <th class="right" style="width:78px">抽检</th><th class="right" style="width:88px">允收数</th>
          <th class="right" style="width:104px">不合格数</th><th style="width:150px">缺陷描述</th><th style="width:96px">AQL 判定</th></tr></thead>
        <tbody>${lines.map((l, i) => `<tr data-i="${i}"><td><b>${esc(l.product_name)}</b><div class="cell-sub mono">${esc(l.product)}</div></td>
          <td class="right money">${num(l.qty)}</td><td class="right money">${num(l.sample)}</td><td class="right money">${num(l.acc)}</td>
          <td class="right"><input type="number" data-d="${i}" value="0" min="0" max="${l.qty}" class="num right"></td>
          <td><select data-c="${i}" ${DEFECT_CODES.map(x => `<option>${x}</option>`).join('')}></select></td>
          <td><span class="badge b-plain" data-v="${i}">待录入</span></td></tr>`).join('')}</tbody></table></div>
        <div class="form-grid mt16" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <div class="fitem"><label>检验结论</label><select data-x="result">
            <option value="pass">合格放行 · 转正品仓</option><option value="concession">让步接收 · 折价冲减暂估</option><option value="reject">拒收退货 · 冲销暂估并退货</option></select></div>
          <div class="fitem"><label>放行至正式仓</label><select data-x="target">${WHS.map(w => `<option value="${esc(w.code)}"${w.code === defTarget ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
          <div class="fitem"><label>让步折价率(%)</label><input type="number" step="0.5" data-x="discount" value="5" class="num"></div>
          <div class="fitem"><label>拒收索赔额(留空=全额)</label><input type="number" step="0.01" data-x="claim" value="0" class="num"></div>
          <div class="fitem"><label>检验员</label><input data-x="inspector" value="${esc(DB.currentUser())}"></div>
          <div class="fitem" style="grid-column:span 3"><label>检验意见(留空按结论自动生成)</label><input data-x="opinion" placeholder="如:仅外观缺陷,不影响使用功能"></div>
        </div>
        <div class="stat-row mt16" id="iqc-sum"></div>
        <div class="notice mt12">${icon('info')}<div>
          <b>合格放行</b>:两腿同价调拨 <b>${esc(SCHEMA.QC_WH)} → 正式仓</b>,数量与存货金额不变,仅脱离隔离区;<br>
          <b>让步接收</b>:按折价率冲减应付暂估 <b>借 应付暂估 2203 / 贷 库存商品 1405</b>,差额按行回写放行仓成本,供应商质量扣 3 分;<br>
          <b>拒收退货</b>:实物退回供应商并全额冲销暂估,采购订单行收货量释放待补货,供应商质量扣 8 分。</div></div>`,
      actions: [{ label: '取消' }, { label: '出具检验结论', cls: 'primary', icon: 'check', onClick: mm => {
        const defects = {}, codes = {};
        lines.forEach((l, i) => {
          const d = Math.round(+(($(`[data-d="${i}"]`, mm.el) || {}).value || 0));
          defects[l.product] = d;
          if (d > 0) codes[l.product] = ($(`[data-c="${i}"]`, mm.el) || {}).value || '外观/包装缺陷';
        });
        const plan = {
          result: ($('[data-x="result"]', mm.el) || {}).value,
          target_wh: ($('[data-x="target"]', mm.el) || {}).value,
          discount: +(($('[data-x="discount"]', mm.el) || {}).value || 0),
          claim: +(($('[data-x="claim"]', mm.el) || {}).value || 0),
          inspector: ($('[data-x="inspector"]', mm.el) || {}).value,
          opinion: ($('[data-x="opinion"]', mm.el) || {}).value,
          defects, codes };
        try {
          const r = ACT.IQC.judge(no, plan);
          UI.toast(`判定完成:${SCHEMA.STATUS[r.status].l} · 不合格 ${num(r.defect_qty)} 件`);
          rerender();
        } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }]
    });
    function repaint() {
      let defect = 0, over = 0;
      lines.forEach((l, i) => {
        const d = Math.max(0, Math.round(+(($(`[data-d="${i}"]`, m.el) || {}).value || 0)));
        defect += d;
        const bad = d > (l.acc || 0);
        if (bad) over++;
        const cell = $(`[data-v="${i}"]`, m.el);
        if (cell) {
          cell.className = 'badge ' + (d === 0 ? 'b-success' : bad ? 'b-danger' : 'b-warning');
          cell.textContent = d === 0 ? '无缺陷' : bad ? '超允收' : '允收内';
        }
      });
      const result = ($('[data-x="result"]', m.el) || {}).value || 'pass';
      const disc = +(($('[data-x="discount"]', m.el) || {}).value || 0);
      const claim = r2(+(($('[data-x="claim"]', m.el) || {}).value || 0));
      const concession = r2(a.amount * disc / 100);
      const penalty = result === 'reject' ? 8 : result === 'concession' ? 3 : defect ? 1 : 0;
      const tgt = ($('[data-x="target"]', m.el) || {}).value || '';
      $('[data-x="target"]', m.el).disabled = result === 'reject';
      $('[data-x="discount"]', m.el).disabled = result !== 'concession';
      $('[data-x="claim"]', m.el).disabled = result !== 'reject';
      const box = $('#iqc-sum', m.el);
      if (box) box.innerHTML = `<div>抽检不合格<b style="color:${defect ? 'var(--danger)' : 'var(--text)'}">${num(defect)}<small> 件</small></b></div>
        <div>AQL 允收<b>${num(a.acc_qty)}<small> 件</small></b></div>
        <div>结论<b style="color:${result === 'reject' ? 'var(--danger)' : result === 'concession' ? 'var(--warning)' : 'var(--success)'}">${esc(SCHEMA.STATUS[result] ? SCHEMA.STATUS[result].l : result)}</b></div>
        <div>放行仓<b>${result === 'reject' ? '退回供应商' : esc((DB.find('warehouses', tgt) || {}).name || tgt)}</b></div>
        <div>${result === 'reject' ? '索赔挂账' : '折价冲减暂估'}<b style="color:var(--danger)">${result === 'reject' ? '¥' + money(claim || a.amount) : result === 'concession' ? '−¥' + money(concession) : '¥0.00'}</b></div>
        <div>供应商评分<b>${num(sup.rating || 0)} → <span style="color:${penalty ? 'var(--danger)' : 'var(--text)'}">${num(Math.max(40, (sup.rating || 80) - penalty))}</span></b></div>`;
      if (box) box.innerHTML += over ? `<div style="grid-column:1/-1;color:var(--danger);font-weight:600">${over} 行抽检不合格数超 AQL 允收,整批只能让步接收或拒收</div>`
        : (result === 'pass' && defect ? `<div style="grid-column:1/-1;color:var(--success)">全部缺陷在允收范围内,可判定合格放行</div>` : '');
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
        try { UI.toast(signMsg(ACT.approvePR(no, ok, rd.values.memo).ap, ok)); rerender(); } catch (e) { UI.toast(e.message, 'err'); return false; }
      } }] });
  }

  /** 裁决回执:会签链路未走完时,提示下一级签批岗与截止日 */
  function signMsg(a, ok) {
    if (!a) return ok ? '已审批通过,申请可转采购订单' : '已驳回';
    if (a.status === 'pending' && a.chain && a.chain.length > 1)
      return `第 ${a.step}/${a.chain.length} 级已签,转「${a.role}」签批 · 截止 ${String(a.due).slice(0, 10)}`;
    return a.status === 'approved' ? '终审通过,业务单据已联动' : '终审驳回,整链终止,业务单据已回退';
  }

  /** 驳回重提:可调金额与事由,系统按新金额重建会签链并接续原审批 */
  function openResubmit(no, rerender, d) {
    const src = DB.find('approval', no);
    if (!src) return UI.toast('审批单不存在', 'err');
    const baseRole = (src.chain && src.chain[0] && src.chain[0].role) || src.role;
    const chain = ACT.SIGN.buildChain(src.module, baseRole, src.amount);
    const fields = [
      { k: 'amount', label: '重提金额', type: 'money', required: true, def: src.amount,
        hint: `调整后按档位重算会签链:¥${UI.money(src.amount)} → ${(chain || []).map(n => n.role).join(' → ') || '单级审批'}` },
      { k: 'priority', label: '紧急度', type: 'select', opts: SCHEMA.entities.approval.fields.priority.opts, def: src.priority },
      { k: 'note', label: '补充说明', type: 'textarea', full: true, rows: 3, required: true, ph: '针对驳回意见补充的资料、调整点' }];
    UI.modal({ title: '修改重提', subtitle: `${no} · ${src.title}`, width: 'mid',
      body: UI.form(fields, {}) + `<div class="notice mt12">${icon('info')}<div>原驳回意见:<b>${esc((src.chain || []).filter(n => n.state === 'rejected').map(n => `${n.role} ${n.name}: ${n.opinion}`)[0] || src.opinion || '—')}</b><br>重提生成新审批单,原审批留档并可追溯;会签链按新金额重新计算。</div></div>`,
      actions: [{ label: '取消' }, { label: '确认重提', cls: 'primary', icon: 'refresh', onClick: m => {
        const rd = UI.readForm(m.el, fields);
        if (!rd.ok) { UI.toast('请填写补充说明', 'err'); return false; }
        try {
          const n = ACT.SIGN.resubmit(no, { amount: +rd.values.amount, priority: rd.values.priority, note: rd.values.note });
          const ap = DB.find('approval', n);
          UI.toast(`已重提为 ${n}${ap.chain && ap.chain.length > 1 ? `,需 ${ap.chain.length} 级会签,首节点 ${ap.role}` : ''}`);
          d.close(); APP.refresh();
          open('approval', n);
        } catch (e) { UI.toast(e.message, 'err'); return false; }
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
    price_list: { entity: 'price_list', title: '价目表', lines: 'pl_lines',
      head: [
        { k: 'name', label: '价目表名称', type: 'text', required: true, full: true, ph: '如:2026 家居类阶梯批发价' },
        { k: 'kind', label: '价格类型', type: 'select', required: true, def: 'tier', placeholder: false, opts: SCHEMA.entities.price_list.fields.kind.opts, hint: '决定取价阶梯中的类型权重' },
        { k: 'customer', label: '适用客户', type: 'ref', ref: 'customers', ph: '仅「客户专属价」填写' },
        { k: 'channel', label: '适用渠道', type: 'select', opts: SCHEMA.entities.price_list.fields.channel.opts, ph: '仅「渠道协议价」填写' },
        { k: 'category', label: '适用类目', type: 'select', opts: SCHEMA.entities.price_list.fields.category.opts, ph: '仅「类目协议价」填写' },
        { k: 'tax_included', label: '报价口径', type: 'select', required: true, def: 'n', placeholder: false, opts: SCHEMA.entities.price_list.fields.tax_included.opts, hint: '含税报价在取价时按物料税率自动反算未税' },
        { k: 'priority', label: '取价优先级', type: 'int', required: true, def: 40, hint: '同类型内数值小者优先,1-99' },
        { k: 'margin_floor', label: '红线毛利率', type: 'percent', required: true, def: 0.10, hint: '0-1 小数,0.10 即 10%;低于此价需改价审批' },
        { k: 'valid_from', label: '生效日', type: 'date', required: true, def: () => DB.today() },
        { k: 'valid_to', label: '失效日', type: 'date', def: () => DB.addDays(DB.today(), 180) },
        { k: 'owner', label: '维护人', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'note', label: '策略说明', type: 'textarea', full: true, ph: '适用范围、返利口径、与哪些价目表并行' }],
      cols: ['tier', 'price', 'discount'],
      notice: '草稿状态不参与取价;提交核准后由销售主管按让利金额分级会签,生效即刻进入取价阶梯。' },

    /* ---------------- 计划:物料清单 / 计划运算 ---------------- */
    bom: { entity: 'bom', title: '物料清单 BOM', lines: 'bom_lines', cols: ['bom'],
      head: [
        { k: 'name', label: '清单名称', type: 'text', required: true, full: true, ph: '如:折叠收纳箱 上盖组件 工程清单' },
        { k: 'product', label: '父项物料', type: 'ref', ref: 'products', required: true, hint: '清单描述的"做一件要耗多少料"' },
        { k: 'version', label: '版本', type: 'text', required: true, def: 'V1.0' },
        { k: 'mrp_src', label: '供应方式', type: 'select', required: true, def: 'out', placeholder: false, opts: SCHEMA.MRP_SRC, hint: '委外/自制按清单引爆子件,外购直接出采购建议' },
        { k: 'warehouse', label: '投产仓库', type: 'ref', ref: 'warehouses', required: true, def: 'WH-HZ01' },
        { k: 'effect_from', label: '生效日', type: 'date', required: true, def: () => DB.today() },
        { k: 'effect_to', label: '失效日', type: 'date', ph: '留空 = 长期有效' },
        { k: 'owner', label: '工程/计划员', type: 'text', required: true, def: () => DB.currentUser() },
        { k: 'note', label: '编制说明', type: 'textarea', full: true, ph: '工艺依据、损耗来源、与上版差异' }],
      notice: '子件行填「单件用量 + 损耗率」,单件耗用 = 用量 ×(1 + 损耗率)。草稿保存后可提交核准,由采购主管按材料影响额分级会签,核准发布后才进入 MRP 展开。' },
    mrp_run: { entity: 'mrp_run', title: 'MRP 计划运算', lines: null, cols: [], wizard: true,
      head: [
        { k: 'name', label: '运算主题', type: 'text', required: true, full: true },
        { k: 'source', label: '需求来源', type: 'select', required: true, def: 'so_open', placeholder: false, opts: SCHEMA.MRP_DEMAND },
        { k: 'horizon', label: '计划周期(天)', type: 'int', required: true, def: 60 },
        { k: 'warehouse', label: '库存口径仓', type: 'ref', ref: 'warehouses', ph: '留空 = 全仓合计' },
        { k: 'note', label: '运算说明', type: 'textarea', full: true }],
      notice: '选择口径后一键起算,运算只读库存/订单/清单,不产生流水与凭证。' },
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
    /* 运算单按口径起算,不走普通草稿表单 */
    if (cfg.wizard && isNew) { openMrpWizard(pre || defVals(cfg.head)); return; }
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
      price_list: ACT.PRICE.submitList, bom: ACT.BOM.submit,
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
        if (entity === 'price_list') {
          header.lines_cnt = lns.length;
          if (header.margin_floor != null && header.margin_floor > 1) header.margin_floor = r2(header.margin_floor / 100);
          if (!header.valid_to) header.valid_to = '';
        }
        if (entity === 'bom') {
          header.lines_cnt = lns.length;
          header.mat_cost = r2(lns.reduce((s, l) => s + l.amount, 0));
          header.levels = ACT.BOM.depthOf(lns);
          header.base_qty = 1;
          if (!header.effect_to) header.effect_to = '';
        }
        if (hasLines) {
          let total = 0;
          if (cfg.cols.indexOf('count') >= 0 || cfg.cols.indexOf('tier') >= 0) total = 0;
          else total = ACT.docTotal(lns);
          header.total = total; header.amount = total;
          if (entity === 'purchase_req') header.amount = r2(lns.reduce((s, l) => s + l.qty * l.price, 0));
          if (entity === 'price_list' || entity === 'bom') { delete header.total; delete header.amount; }
        }
        if (isNew) {
          header.status = 'draft';
          if (entity === 'transfer' || entity === 'stocktake' || entity === 'price_list' || !hasLines) delete header.total;
          DB.insert(entity, header);
          if (hasLines) DB.setLines(cfg.lines, target, lns.map(l => Object.assign({}, l, { doc: target })));
          DB.log('单据管理', '新建' + cfg.title, target, hasLines ? `${lns.length} 行` : '表头信息');
        } else if (entity === 'sales_order') {
          ACT.saveSO(no, header, lns);
        } else {
          const cur = DB.find(entity, no);
          if (['sales_order', 'purchase_order'].includes(entity) && cur.status !== 'draft') throw new Error('仅草稿状态可编辑');
          if (SUBMIT_HOOK[entity] && !['draft', 'rejected'].includes(cur.status)) throw new Error('仅草稿或被驳回的单据可以编辑');
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
    const isTier = cfg.cols.indexOf('tier') >= 0;
    const isBom = cfg.cols.indexOf('bom') >= 0;
    const isSO = cfg.entity === 'sales_order';
    function headVal(k) { const el = modal && $('[data-k="' + k + '"]', modal.el); return el ? el.value : ''; }
    this.add = function (pre) {
      const r = { product: pre || '', product_name: '', qty: pre ? suggested(pre, cfg) : (isBom ? 1 : isTier ? 0 : 10), price: pre ? priceOf(pre, cfg) : 0, discount: 0, tax: pre && !isTier ? (DB.find('products', pre) || {}).tax_rate || 13 : (isTier ? 0 : 13), actual_qty: '', loss_rate: 0, key_part: 'n', position: '', lineno: rows.length + 1 };
      if (pre && isSO) attribute(r, pre);
      rows.push(r);
      paint();
    };
    /** 按取价引擎给行打价:命中价目表的净价 + 来源留痕 */
    function attribute(r, code) {
      const qty = +r.qty || 0;
      const q = ACT.PRICE.pick({ customer: headVal('customer'), product: code, qty: qty, date: headVal('date') || DB.today(), channel: headVal('channel'), warehouse: headVal('warehouse') || 'WH-HZ01' });
      r.price = q.net || (DB.find('products', code) || {}).price || 0;
      r.list_no = q.listNo; r.price_src = q.source; r.cost = q.cost;
      r._net = q.net; r._floor = q.floor; r._src = q.source; r._list = q.listNo;
      if (!q.listNo) r.price_src = q.source;
    }
    function priceOf(code, cfg) {
      const p = DB.find('products', code) || {};
      if (isTier) return r2(p.price || 0);
      if (cfg.entity === 'sales_order') {
        const q = ACT.PRICE.pick({ customer: headVal('customer'), product: code, qty: suggested(code, cfg), date: headVal('date') || DB.today(), channel: headVal('channel'), warehouse: headVal('warehouse') || 'WH-HZ01' });
        return q.net || p.price || 0;
      }
      return (p.cost || 0);
    }
    function suggested(code, cfg) {
      const p = DB.find('products', code) || {};
      if (isBom) return 1;
      if (isTier) return 0;
      if (cfg.entity === 'purchase_order' || cfg.entity === 'purchase_req') return Math.max(p.min_order || 20, (p.safety_qty || 20) * 2);
      return 10;
    }
    function paint() {
      const f = { showPrice: cfg.cols.indexOf('price') >= 0, showDiscount: cfg.cols.indexOf('discount') >= 0,
        showTax: cfg.cols.indexOf('tax') >= 0 && !isTier, isCount: cfg.cols.indexOf('count') >= 0, isBom: isBom };
      const showPrice = f.showPrice, showDiscount = f.showDiscount, showTax = f.showTax, isCount = f.isCount;
      host.innerHTML = `<div class="table-wrap"><table class="lines-tbl"><thead><tr>${isBom
        ? '<th style="width:38px">#</th><th style="width:250px">子件物料 / 标准成本</th><th style="width:112px" class="right">单件用量</th><th style="width:96px" class="right">损耗率</th><th style="width:88px">关键件</th><th style="width:124px" class="right">单件材料金额</th><th style="width:160px">位号 / 备注</th><th class="rm"></th>'
        : `<th style="width:38px">#</th><th style="width:230px">${isTier ? '物料 / 标准售价' : '物料 / 商品'}</th>
        ${isCount ? '<th style="width:100px" class="right">账面数量</th><th style="width:120px" class="right">实盘数量</th>' : `<th style="width:110px" class="right">${isTier ? '起订量' : '数量'}</th>`}
        ${showPrice ? `<th style="width:120px" class="right">${isTier ? '报价' : '单价'}</th>` : ''}${showDiscount ? '<th style="width:90px" class="right">折扣</th>' : ''}${showTax ? '<th style="width:90px" class="right">税率</th>' : ''}
        <th style="width:130px" class="right">${isTier ? '成交净价' : '金额'}</th><th style="width:120px">备注</th><th class="rm"></th>`
      }</tr></thead>
        <tbody id="ed-body">${rows.map((r, i) => rowHTML(r, i, f)).join('')}</tbody></table></div>
        <div class="flex mt12"><button class="btn sm" id="ed-add">${icon('plus')}添加明细行</button>
        <select id="ed-pick" style="width:250px"><option value="">从商品库快速添加…</option>${DB.list('products').filter(p => p.status === 'enabled').map(p => `<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select>
        <div class="lines-sum grow" style="justify-content:flex-end;border:0;padding:0" id="ed-sum"></div></div>`;
      $('#ed-add', host).addEventListener('click', () => self.add());
      $('#ed-pick', host).addEventListener('change', ev => { if (ev.target.value) { self.add(ev.target.value); ev.target.value = ''; } });
      UI.$$('input,select', host).forEach(el => el.addEventListener('input', () => {
        harvest(); paintSum();
        const tr = el.closest('tr');
        const r = tr ? rows[+tr.dataset.i] : null;
        if (!r) return;
        const c = $('.amt', tr); if (c) c.textContent = '¥' + money(amount(r, f));
        const chip = $('.psrc', tr);
        if (chip) { chip.textContent = r.price_src || ''; chip.className = 'cell-sub psrc' + (r._net != null && r2((+r.price || 0) * (1 - (+r.discount || 0))) < r._floor ? ' low' : ' muted small'); }
      }));
      UI.$$('#ed-body select[data-f="product"]', host).forEach(sel => sel.addEventListener('change', () => {
        harvest();
        const r = rows[+sel.closest('tr').dataset.i];
        if (r && r.product && (isSO || isTier)) { if (isSO) attribute(r, r.product); else r.price = r2((DB.find('products', r.product) || {}).price || 0); }
        paint();
      }));
      UI.$$('.del', host).forEach(b => b.addEventListener('click', () => { harvest(); rows.splice(+b.dataset.i, 1); paint(); paintSum(); }));
      paintSum();
    }
    function rowHTML(r, i, f) {
      const p = DB.find('products', r.product) || {};
      if (f.isBom) return `<tr data-i="${i}"><td class="muted">${i + 1}</td>
        <td><select data-f="product" style="width:100%">${['<option value="">请选择子件</option>'].concat(DB.list('products').filter(x => x.status === 'enabled').map(x => `<option value="${esc(x.code)}" ${x.code === r.product ? 'selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`)).join('')}</select>
        <div class="cell-sub muted small">${p.name ? esc(p.name) + ' · ' : ''}成本 ¥${money(p.cost || 0)}${p.mrp_src ? ' · ' + esc(SCHEMA.MRP_SRC[p.mrp_src] || p.mrp_src) : ''}</div></td>
        <td class="right"><input type="number" step="0.001" data-f="qty" value="${r.qty}" min="0" class="num right" placeholder="1"></td>
        <td class="right"><input type="number" step="0.01" data-f="loss_rate" value="${r.loss_rate || 0}" min="0" class="num right" title="0-1 小数,0.03 即 3% 损耗"></td>
        <td><select data-f="key_part"><option value="n"${r.key_part !== 'y' ? ' selected' : ''}>否</option><option value="y"${r.key_part === 'y' ? ' selected' : ''}>是</option></select></td>
        <td class="right money strong amt">¥${money(amount(r, f))}</td>
        <td><input data-f="position" value="${esc(r.position || '')}" placeholder="位号/工位" style="margin-bottom:5px">
          <input data-f="memo" value="${esc(r.memo || '')}" placeholder="备注(选填)"></td>
        <td class="rm"><button class="del" data-i="${i}" title="删除该行">${icon('close')}</button></td></tr>`;
      const low = r._net != null && r2((+r.price || 0) * (1 - (+r.discount || 0))) < r._floor;
      return `<tr data-i="${i}"><td class="muted">${i + 1}</td>
        <td><select data-f="product" style="width:100%">${['<option value="">请选择物料</option>'].concat(DB.list('products').filter(x => x.status === 'enabled').map(x => `<option value="${esc(x.code)}" ${x.code === r.product ? 'selected' : ''}>${esc(x.code)} · ${esc(x.name)}</option>`)).join('')}</select>
        ${isTier ? `<div class="cell-sub muted small">标 ¥${money(p.price || 0)} · 成本 ¥${money(p.cost || 0)}</div>` : ''}
        ${isSO && r.price_src ? `<div class="cell-sub psrc${low ? ' low' : ' muted small'}">${esc(r.price_src)}</div>` : ''}</td>
        ${f.isCount ? `<td class="right money">${r.product ? num(ACT.available(r.product, (DB.find('stock', r.product + '-WH-HZ01') || {}).warehouse || 'WH-HZ01')) : '—'}<div class="cell-sub">${p.name ? esc(p.name) : ''}</div></td>
            <td class="right"><input type="number" data-f="actual_qty" value="${r.actual_qty}" placeholder="实盘" class="num right"></td>`
        : `<td class="right"><input type="number" data-f="qty" value="${r.qty}" min="0" class="num right" placeholder="${isTier ? '0=基础档' : ''}"></td>`}
        ${f.showPrice ? `<td class="right"><input type="number" step="0.01" data-f="price" value="${r.price}" class="num right"></td>` : ''}
        ${f.showDiscount ? `<td class="right"><input type="number" step="0.01" data-f="discount" value="${r.discount || 0}" class="num right" title="0-1 之间,如 0.05"></td>` : ''}
        ${f.showTax ? `<td class="right"><select data-f="tax">${[13, 9, 6, 0].map(t => `<option value="${t}" ${t === (r.tax || p.tax_rate) ? 'selected' : ''}>${t}%</option>`).join('')}</select></td>` : ''}
        <td class="right money strong amt">¥${money(amount(r, f))}</td>
        <td><input data-f="memo" value="${esc(r.memo || '')}" placeholder="${isTier ? '如:满 300 件,需季度返利协议' : '选填'}"></td>
        <td class="rm"><button class="del" data-i="${i}" title="删除该行">${icon('close')}</button></td></tr>`;
    }
    function amount(r, f) {
      if (isBom) { const p = DB.find('products', r.product) || {}; return r2((+r.qty || 0) * (1 + (+r.loss_rate || 0)) * (p.cost || 0)); }
      if (isTier) return r2((+r.price || 0) * (1 - (+r.discount || 0)));
      if (f && f.isCount) { const p = DB.find('products', r.product) || {}; return r.actual_qty === '' ? 0 : (+r.actual_qty - ACT.available(r.product, 'WH-HZ01')) * (p.cost || 0); }
      return r.qty * r.price * (1 - (r.discount || 0)) * (1 + (r.tax || 0) / 100);
    }
    function harvest() {
      UI.$$('#ed-body tr', host).forEach(tr => {
        const i = +tr.dataset.i, r = rows[i]; if (!r) return;
        UI.$$('[data-f]', tr).forEach(el => {
          const k = el.dataset.f;
          r[k] = ['qty', 'price', 'discount', 'tax', 'actual_qty', 'loss_rate'].indexOf(k) >= 0 ? (el.value === '' ? '' : +el.value) : el.value;
        });
        const p = DB.find('products', r.product) || {};
        r.product_name = p.name || '';
        if (!r.tax && !isTier) r.tax = p.tax_rate || 13;
        /* 手工偏离取价引擎的报价:来源改为手工改价并按红线判定,给审批留痕;改回报价则恢复阶梯来源 */
        if (isSO && r._net != null) {
          const net = r2((+r.price || 0) * (1 - (+r.discount || 0)));
          if (Math.abs(net - r._net) > 0.005) { r.list_no = ''; r.price_src = net > 0 && net < r._floor ? '销售员手工改价(低于毛利红线)' : '销售员手工改价'; }
          else if (r._src) { r.list_no = r._list || ''; r.price_src = r._src; }
        }
      });
    }
    function paintSum() {
      const f = { isCount: cfg.cols.indexOf('count') >= 0 };
      if (isBom) {
        const live = rows.filter(r => r.product && (+r.qty || 0) > 0);
        const mat = r2(live.reduce((s, r) => s + amount(r, f), 0));
        const deep = live.filter(r => ACT.BOM.of(r.product)).length;
        $('#ed-sum', host).innerHTML = `<span>子件 <b>${live.length}</b> 行</span><span>单件材料成本(直接)<b>¥${money(mat)}</b></span>
          <span>关键件 <b>${live.filter(r => r.key_part === 'y').length}</b></span>
          <span>${deep ? `<b style="color:var(--primary)">${deep} 项自制子件将继续下展</b>` : '<span class="muted">全部为原料/外购件,单层清单</span>'}</span>`;
        return;
      }
      if (isTier) {
        const live = rows.filter(r => r.product);
        const deep = live.filter(r => { const p = DB.find('products', r.product) || {}; const net = (+r.price || 0) * (1 - (+r.discount || 0)); return net > 0 && net < (p.cost || 0) * 1.05; }).length;
        const give = live.reduce((s, r) => { const p = DB.find('products', r.product) || {}; return s + ((+r.price || 0) * (1 - (+r.discount || 0)) - (p.price || 0)); }, 0);
        $('#ed-sum', host).innerHTML = `<span>价格行 <b>${live.length}</b></span><span>相对标准售价 <b style="color:${give < 0 ? 'var(--danger)' : 'var(--success)'}">均 ¥${money(r2(live.length ? give / live.length : 0))}</b></span><span>${deep ? `<b style="color:var(--danger)">${deep} 行跌破 5% 毛利红线</b>` : '<span class="muted">无深亏行</span>'}</span>`;
        return;
      }
      const total = rows.reduce((s, r) => s + amount(r, f), 0);
      const net = rows.reduce((s, r) => s + r.qty * r.price * (1 - (r.discount || 0)), 0);
      $('#ed-sum', host).innerHTML = f.isCount ? `<span>预计差异金额 <b>¥${money(total)}</b></span>` :
        `<span>不含税 <b>¥${money(net)}</b></span><span>税额 <b>¥${money(total - net)}</b></span><span style="font-size:13px">价税合计 <b style="color:var(--primary)">¥${money(total)}</b></span>`;
    }
    this.values = function () {
      harvest();
      const isCount = cfg.cols.indexOf('count') >= 0;
      if (isBom) return rows.filter(r => r.product && (+r.qty || 0) > 0).map((r, i) => {
        const p = DB.find('products', r.product) || {};
        const loss = Math.max(0, +r.loss_rate || 0);
        const unit = r4((+r.qty || 0) * (1 + loss));
        return { lineno: i + 1, product: r.product, product_name: p.name || r.product_name, uom: p.uom || 'PCS',
          qty: r4(+r.qty || 0), loss_rate: r4(loss), cost: r2(p.cost || 0), amount: r2(unit * (p.cost || 0)),
          key_part: r.key_part || 'n', substitute: '', position: r.position || '', memo: r.memo || '' };
      });
      if (isTier) return rows.filter(r => r.product).map((r, i) => {
        const p = DB.find('products', r.product) || {};
        return { lineno: i + 1, product: r.product, product_name: r.product_name, tier_qty: +r.qty || 0,
          price: r2(+r.price || 0), discount: r.discount || 0, cost: r2(p.cost || 0), std_price: r2(p.price || 0), memo: r.memo || '' };
      });
      return rows.filter(r => r.product && (isCount ? true : r.qty > 0)).map((r, i) => ({
        lineno: i + 1, product: r.product, product_name: r.product_name, qty: r.qty, price: r.price,
        discount: r.discount || 0, tax_rate: r.tax || 13, amount: r2(r.qty * r.price * (1 - (r.discount || 0))),
        delivered: r.delivered || 0, received: r.received || 0, actual_qty: r.actual_qty === '' ? null : r.actual_qty,
        book_qty: r.book_qty, diff: r.diff, cost: r.cost, diff_amount: r.diff_amount, memo: r.memo || '',
        list_no: r.list_no || '', price_src: r.price_src || ''
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
      const q = ACT.IQC.stats(id);
      const qcList = DB.where('iqc', x => x.supplier === id).slice(-8).reverse();
      extra = `<div class="card"><div class="card-head"><h3>${icon('card')}应付与合作</h3></div><div class="card-body">
        <div class="stat-row"><div>采购订单<b>${pos.length} 单</b></div><div>采购金额<b>¥${money(r2(pos.reduce((s, p) => s + p.total, 0)))}</b></div><div>应付余额<b>¥${money(ap)}</b></div><div>交付周期<b>${row.lead_time} 天</b></div><div>绩效评分<b>${row.rating}</b></div></div></div></div>
        <div class="card"><div class="card-head"><h3>${icon('shield')}来料质量 (IQC)</h3>
          <div class="right"><span class="badge ${row.qc_policy === 'skip' ? 'b-success' : row.qc_policy === 'strict' ? 'b-danger' : 'b-warning'}">${esc(SCHEMA.QC_POLICY[row.qc_policy] || '抽样检验 AQL')}</span></div></div>
        <div class="card-body"><div class="stat-row">
          <div>报检批次<b>${num(q.batches)}<small> 批</small></b></div><div>待检验<b style="color:${q.pending ? 'var(--warning)' : 'var(--text)'}">${num(q.pending)}</b></div>
          <div>一次合格率<b style="color:${q.passRate >= .9 ? 'var(--success)' : q.passRate >= .7 ? 'var(--warning)' : 'var(--danger)'}">${(q.passRate * 100).toFixed(1)}%</b></div>
          <div>抽检缺陷率<b>${(q.defectRate * 100).toFixed(2)}%</b></div>
          <div>让步 / 拒收<b>${num(q.con)} / <span style="color:${q.rej ? 'var(--danger)' : 'var(--text)'}">${num(q.rej)}</span></b></div>
          <div>累计索赔折价<b>¥${money(q.claim)}</b></div></div>
        <div class="table-wrap mt12"><table class="tbl"><thead><tr><th>检验单</th><th>日期</th><th>收货单</th><th class="right">到货</th><th class="right">抽检</th><th class="right">不合格</th><th class="right">扣损</th><th>结论</th></tr></thead>
        <tbody>${qcList.length ? qcList.map(x => `<tr><td class="mono cell-link" data-jump="iqc=${encodeURIComponent(x.no)}">${esc(x.no)}</td>
          <td>${dateCN(x.date)}</td><td class="mono small">${esc(x.gr)}</td><td class="right money">${num(x.qty_in)}</td>
          <td class="right money">${num(x.sample_qty)}</td><td class="right money" style="${x.defect_qty ? 'color:var(--danger)' : ''}">${num(x.defect_qty)}</td>
          <td class="right money">${x.claim ? '¥' + money(x.claim) : '—'}</td><td>${UI.badge(x.status)}</td></tr>`).join('')
          : `<tr><td colspan="8">${UI.emptyBox('该供应商暂无来料检验记录')}</td></tr>`}</tbody></table></div>
        ${q.qcQty ? `<div class="notice mt12">${icon('info')}<div>当前有待检批次 <b>${num(q.qcQty)}</b> 件隔离在 ${esc(SCHEMA.QC_WH)},判定放行前不参与销售与领用。</div></div>` : ''}</div></div>
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
        <td>${m.ref ? `<span class="cell-link mono" data-jump="${refJump(m.ref)}">${esc(m.ref)}</span>` : '—'}</td></tr>`).join('') : `<tr><td colspan="7">${UI.emptyBox('暂无流水')}</td></tr>`}</tbody></table></div></div>
        ${planCard(id, row)}`;
      foot = `<button class="btn" data-md="adjust">${icon('edit')}库存调整</button><button class="btn" data-md="tr">${icon('swap')}发起调拨</button><button class="btn" data-md="bom">${icon('layers')}物料清单</button><button class="btn primary" data-md="mrp">${icon('zap')}发起计划运算</button>`;
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
        ${UI.descs(Object.keys(e.fields).filter(k => k !== 'note' && !e.fields[k].hidden && !e.fields[k].secret).map(k => [e.fields[k].l, fieldText(entity, k, row, e.fields[k])]))}
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
      else if (a === 'bom') { const b = entity === 'products' ? ACT.BOM.of(id) : null; if (!b) { d.close(); DOC.newDoc('bom', { product: id }); return; } d.close(); open('bom', b.no); }
      else if (a === 'bomNew') { d.close(); DOC.newDoc('bom', { product: id }); }
      else if (a === 'mrp') { d.close(); DOC.newDoc('mrp_run', { source: 'manual', product: id,
        qty: Math.max(1, +row.moq || (+row.safety_qty || 0) * 2 || 100), need_date: DB.addDays(DB.today(), 14), from: `${row.name} 补料` }); }
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
    const head = entity === 'lot' ? ['no', 'product', 'warehouse', 'bin', 'receipt', 'prod_date', 'receipt_date', 'expire_date']
      : Object.keys(e.fields).filter(k => !e.fields[k].hidden && k !== 'status').slice(0, 8);
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
      <table><thead><tr>${cfg.isJournal ? '<th>科目</th><th>摘要</th><th class="r">借方</th><th class="r">贷方</th>' : entity === 'lot' ? '<th>#</th><th>日期</th><th>收发动作</th><th>仓库</th><th>库位</th><th class="r">数量</th><th>出入库流水</th><th>关联单据</th><th>操作人</th>' : entity === 'stocktake' ? '<th>#</th><th>物料</th><th>名称</th><th class="r">账面</th><th class="r">实盘</th><th class="r">差异</th>' : entity === 'iqc' ? '<th>#</th><th>物料编码</th><th>商品名称</th><th class="r">到货数量</th><th class="r">抽检数</th><th class="r">AQL 允收</th><th class="r">不合格</th><th>缺陷描述</th><th>单项判定</th>' : entity === 'price_list' ? '<th>#</th><th>物料编码</th><th>商品名称</th><th class="r">起订量</th><th class="r">报价</th><th class="r">行折让</th><th class="r">标准售价</th><th class="r">单位成本</th><th class="r">成交净价</th><th class="r">毛利率</th><th>适用说明</th>' : entity === 'bom' ? '<th>#</th><th>子件编码</th><th>子件名称</th><th class="r">单件用量</th><th class="r">损耗率</th><th class="r">单件耗用</th><th class="r">标准成本</th><th class="r">单件材料金额</th><th>关键件</th><th>位号 / 备注</th>' : entity === 'mrp_run' ? '<th>层</th><th>物料编码</th><th>物料名称</th><th>供应</th><th class="r">毛需求</th><th class="r">现/占/途</th><th class="r">净需求</th><th class="r">建议下单</th><th>建议单</th><th>需求日</th><th class="r">参考单价</th><th class="r">建议金额</th><th>运算说明</th>' : '<th>#</th><th>物料编码</th><th>商品名称</th><th class="r">数量</th><th class="r">单价</th><th class="r">折扣</th><th class="r">税率</th><th class="r">金额</th>'}</tr></thead>
      <tbody>${lines.map((l, i) => cfg.isJournal ? `<tr><td>${l.account}</td><td>${l.account_name} ${l.memo || ''}</td><td class="r">${l.debit ? money(l.debit) : ''}</td><td class="r">${l.credit ? money(l.credit) : ''}</td></tr>`
        : entity === 'lot' ? `<tr><td>${l.lineno}</td><td>${l.date}</td><td>${esc(mvType(l.type))}</td><td>${esc(whName(l.warehouse))}</td><td>${esc(l.bin || '')}</td>
          <td class="r">${l.qty > 0 ? '+' : ''}${num(l.qty)}</td><td>${esc(l.mv || '—')}</td><td>${esc(l.ref || '—')}</td><td>${esc(l.user || '')}</td></tr>`
        : entity === 'stocktake' ? `<tr><td>${i + 1}</td><td>${l.product}</td><td>${l.product_name}</td><td class="r">${l.book_qty}</td><td class="r">${l.actual_qty}</td><td class="r">${l.diff}</td></tr>`
        : entity === 'iqc' ? `<tr><td>${i + 1}</td><td>${l.product}</td><td>${l.product_name}</td><td class="r">${num(l.qty)}</td><td class="r">${num(l.sample)}</td><td class="r">${num(l.acc)}</td><td class="r">${num(l.defect)}</td><td>${l.defect_code || '—'}</td><td>${l.verdict || '待检验'}</td></tr>`
        : entity === 'price_list' ? plPrintRow(l, row)
        : entity === 'bom' ? `<tr><td>${l.lineno}</td><td>${esc(l.product)}</td><td>${esc(l.product_name)}</td>
          <td class="r">${use4(l.qty)}</td><td class="r">${l.loss_rate ? (+l.loss_rate * 100).toFixed(1) + '%' : '—'}</td>
          <td class="r">${use4(ACT.BOM.unitUse(l))}</td><td class="r">${money(l.cost)}</td><td class="r">${money(l.amount)}</td>
          <td>${l.key_part === 'y' ? '★' : ''}</td><td>${esc([l.position, l.memo].filter(Boolean).join(' · '))}</td></tr>`
        : entity === 'mrp_run' ? `<tr${(l.suggest_qty || 0) > 0 ? '' : ' style="color:#888"'}><td>${l.level}</td><td>${esc(l.product)}</td><td>${esc(l.product_name)}</td>
          <td>${esc(SCHEMA.MRP_SRC[l.mrp_src] || l.mrp_src)}</td><td class="r">${use4(l.gross_qty)}</td>
          <td class="r">${num(l.on_hand)}/${num(l.reserved)}/${num(l.on_order)}</td><td class="r">${use4(l.net_qty)}</td>
          <td class="r"><b>${num(l.suggest_qty)}</b></td><td>${esc(SCHEMA.MRP_SUGGEST[l.suggest_type] || '')}${l.release ? ' ' + esc(l.release) : ''}</td>
          <td>${esc(l.need_date)}</td><td class="r">${money(l.price)}</td><td class="r">${money(l.amount)}</td><td>${esc(l.memo || '')}</td></tr>`
        : `<tr><td>${i + 1}</td><td>${l.product}</td><td>${l.product_name}</td><td class="r">${num(l.qty)}</td><td class="r">${money(l.price)}</td><td class="r">${l.discount ? (l.discount * 100) + '%' : '—'}</td><td class="r">${(l.tax_rate || 0)}%</td><td class="r">${money(l.amount)}</td></tr>`).join('')}</tbody></table>
      ${entity === 'iqc' ? `<div class="tot" style="text-align:left;font-weight:400;margin-top:14px">检验依据:${row.standard || ''}<br>批次金额:<b>${money(row.amount || 0)}</b> &nbsp; 检验结论:<b>${(SCHEMA.STATUS[row.status] || {}).l || row.status || ''}</b>${row.discount ? ` &nbsp; 让步折价:${row.discount}%` : ''}${row.claim ? ` &nbsp; 索赔/扣损:${money(row.claim)}` : ''}<br>检验意见:${row.opinion || ''}</div>` : ''}
      ${entity === 'lot' ? `<div class="tot" style="text-align:left;font-weight:400;margin-top:16px">
        批次状态:<b>${esc((SCHEMA.STATUS[row.status] || {}).l || row.status || '')}</b> &nbsp; 入库 ${num(row.qty_in)} 件 · 当前余量 ${num(row.qty)} 件 · 累计发出 ${num((row.qty_in || 0) - (row.qty || 0))} 件<br>
        批次入账成本:<b>¥${money(row.unit_cost)}</b> &nbsp; 批次金额:<b>¥${money(row.value)}</b> &nbsp; 生产 ${row.prod_date || '—'} / 到期 ${row.expire_date || '长期有效'}<br>
        追溯声明:来源单据 ${esc(row.receipt || '—')}${row.sup_lot ? `,供应商批号 ${esc(row.sup_lot)}` : ''}${row.supplier ? `,供应商 ${esc((DB.find('suppliers', row.supplier) || {}).name || row.supplier)}` : ''};正向可追至供应商与检验单,反向可追至出库单、客户与发票。</div>`
        : entity === 'price_list' ? `<div class="tot" style="text-align:left;font-weight:400;margin-top:16px">
        报价口径:${row.tax_included === 'y' ? '含税单价(取价时按物料税率反算未税)' : '未税单价'} &nbsp; 取价优先级 ${row.priority} &nbsp; 红线毛利率 <b>${((row.margin_floor == null ? ACT.PRICE.FLOOR : row.margin_floor) * 100).toFixed(1)}%</b><br>
        有效期:${dateCN(row.valid_from)} ~ ${row.valid_to ? dateCN(row.valid_to) : '长期有效'} &nbsp; 价格行 ${lines.length} 行 &nbsp; 相对标准售价累计价差 <b>¥${money(ACT.PRICE.listImpact(row).total)}</b><br>
        状态:${esc((SCHEMA.STATUS[row.status] || {}).l || row.status)}${row.ap ? ',核准单 ' + esc(row.ap) : ''}。本表仅在核准且处于有效期内时参与取价;成交净价跌破红线的订单须另附改价审批单。</div>`
        : entity === 'bom' ? `<div class="tot" style="text-align:left;font-weight:400;margin-top:16px">
        父项物料:${esc(row.product_name || '')}(${esc(row.product)}) &nbsp; 版本 ${esc(row.version)} &nbsp; 供应方式:${esc(SCHEMA.MRP_SRC[row.mrp_src] || row.mrp_src)} &nbsp; 展开 ${num(row.levels || 1)} 层 ${num(lines.length)} 项子件<br>
        单件材料成本(直接口径):<b>¥${money(r2(lines.reduce((s, l) => s + ACT.BOM.unitUse(l) * ((DB.find('products', l.product) || {}).cost || 0), 0)))}</b> &nbsp; 多级滚算(含自制子件下展):<b>¥${money(ACT.BOM.matCost(row.product))}</b><br>
        生效:${dateCN(row.effect_from)} ~ ${row.effect_to ? dateCN(row.effect_to) : '长期有效'} &nbsp; 状态:${esc((SCHEMA.STATUS[row.status] || {}).l || row.status)}${row.ap ? ',核准单 ' + esc(row.ap) : ''}。损耗率只抬高子件需求,不改变父件数量口径;本清单核准后方进入 MRP 展开范围。</div>`
        : entity === 'mrp_run' ? `<div class="tot" style="text-align:left;font-weight:400;margin-top:16px">
        运算主题:${esc(row.name)} &nbsp; 需求来源:${esc(SCHEMA.MRP_DEMAND[row.source] || row.source)} &nbsp; 计划周期 ${num(row.horizon)} 天 &nbsp; 库存口径:${esc(whName(row.warehouse) || '全仓合计')}<br>
        需求父项 ${num(row.demand_cnt)} · 展开 ${num(row.levels)} 层 · 建议 ${num(row.rows_cnt)} 行 · 缺料 ${num(row.shortage_cnt)} 行 &nbsp; 建议金额合计 <b>¥${money(row.amount)}</b><br>
        状态:${esc((SCHEMA.STATUS[row.status] || {}).l || row.status)}。可用量 = 现量 − 销售占用 + 在途采购 + 在制委外;本表仅为计划建议,不产生库存流水与凭证,已下达建议单号见「下达单据」列。</div>`
        : `<div class="tot">价税合计:<span>${money(row.total || row.amount || row.fee_amount || row.debit || 0)}</span> &nbsp; 币种:${row.currency || 'CNY'}</div>`}
      <div class="sign"><div>制单: ${row.user || (lines[0] && lines[0].user) || DB.currentUser()}</div><div>审核: __________</div><div>客户/供应商签收: __________</div><div>财务: __________</div></div>
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

  /** 打印用价目表行:成交净价与毛利率按取价引擎同口径还原 */
  function plPrintRow(l, row) {
    const net = plNet(l, row.tax_included === 'y', (+((DB.find('products', l.product) || {}).tax_rate) || 13));
    return `<tr><td>${l.lineno}</td><td>${esc(l.product)}</td><td>${esc(l.product_name)}</td>
      <td class="r">${l.tier_qty ? num(l.tier_qty) + ' 件起' : '基础档'}</td><td class="r">${money(l.price)}</td>
      <td class="r">${l.discount ? (l.discount * 100).toFixed(0) + '%' : '—'}</td><td class="r">${money(l.std_price)}</td>
      <td class="r">${money(l.cost)}</td><td class="r">${money(net)}</td>
      <td class="r">${net > 0 ? (((net - (l.cost || 0)) / net) * 100).toFixed(1) + '%' : '—'}</td>
      <td>${esc(l.memo || '')}</td></tr>`;
  }

  return { open, newDoc, masterDetail, CFG, NEW_CFG, printDoc, editDoc, recall: openLotRecall, hold: openLotHold };
})();
