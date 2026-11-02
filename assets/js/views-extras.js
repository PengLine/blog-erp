/* ============================================================
 * views-extras.js — 系统设置 / 关于与数据字典 / 全局动作
 * ============================================================ */
window.EXTRAS = (function () {
  const esc = UI.esc, num = UI.num, icon = UI.icon;

  function securityCard() {
    const s = DB.session() || {};
    const u = DB.find('users', s.code) || {};
    const role = DB.where('role', r => r.name === u.role)[0] || {};
    const left = Math.max(0, Math.round(((s.expires || 0) - Date.now()) / 60000));
    const canAudit = ACT.PERM.can('activity', 'view');
    const logins = canAudit ? DB.where('activity', a => a.module === '系统安全').slice(0, 8) : [];
    return `<div class="card mt16"><div class="card-head"><h3>${icon('lock')}登录与安全</h3>
      <div class="right"><button class="btn sm" data-action="pwd">${icon('edit')}修改我的口令</button></div></div>
      <div class="card-body"><div class="grid g-2-1">
        <div>${UI.descs([
          ['当前账号', `<span class="mono">${esc(u.account || s.account || '—')}</span> · ${esc(u.name || '—')} · ${esc(u.dept || '—')}`],
          ['角色 / 审批级别', `${esc(u.role || '—')}${role.level ? ' · L' + role.level : ''}${(role.level || 0) >= 9 ? ' · 超级权限' : ''}`],
          ['本次登录', esc(new Date(s.at || Date.now()).toLocaleString('zh-CN'))],
          ['会话剩余', `${num(left)} 分钟 · 闲置 ${DB.SESSION_HOURS} 小时自动登出`],
          ['口令策略', '至少 8 位且含字母与数字;连续 5 次失败锁定 60 秒'],
          ['在册账号', `${num(DB.count('users'))} 个(启用 ${num(DB.where('users', x => x.status === 'active').length)} · 停用 ${num(DB.where('users', x => x.status === 'inactive').length)})`],
        ])}
        <div class="notice mt12">${icon('info')}<div>纯静态演示系统:账号与口令保存在浏览器本地,不经过服务端,请勿用于真实数据。</div></div></div>
        <div><div class="section-title">登录审计</div>
        ${canAudit ? UI.table([
          { k: 'time', label: '时间', render: r => `<span class="mono small">${esc(String(r.time).slice(5))}</span>` },
          { k: 'action', label: '事件', render: r => `<span class="badge ${r.action === '登录失败' ? 'b-danger' : r.action === '登录成功' ? 'b-success' : 'b-neutral'}">${esc(r.action)}</span>` },
          { k: 'ref', label: '账号', render: r => `<span class="mono small">${esc(r.ref || '—')}</span><div class="cell-sub">${esc(r.detail || '')}</div>` },
        ], logins, { pk: 'id', empty: '暂无登录审计记录' }) : `<div class="muted small">未授予「操作日志」查看权限,登录审计仅对审计岗可见。</div>`}</div>
      </div></div></div>`;
  }

  function storageInfo() {
    let bytes = 0;
    try { bytes = new Blob([DB.exportJSON()]).size; } catch (e) { bytes = 0; }
    return { kb: (bytes / 1024).toFixed(1), mb: (bytes / 1048576).toFixed(2) };
  }

  function settings() {
    const st = DB.stats(), info = storageInfo();
    const total = Object.values(st).reduce((a, b) => a + b, 0);
    return `<div class="page-head"><div><h2>系统设置</h2><div class="desc">本系统为纯静态单页应用,所有业务数据保存在浏览器 localStorage(key = <span class="mono">sailfish_erp_db_v1</span>)。支持备份导出、导入恢复与重置演示数据。</div></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><h3>${icon('database')}数据与存储</h3></div><div class="card-body">
          <div class="stat-row"><div>记录总数<b>${num(total)}</b></div><div>业务表<b>${SCHEMA.visible().length}</b></div><div>占用空间<b>${info.kb} KB</b></div><div>种子版本<b>${esc(DB.all().seedVersion || '—')}</b></div></div>
          <div class="divider"></div>
          <div class="grid g3">${Object.entries(st).filter(([k, v]) => v && SCHEMA.entities[k] && SCHEMA.entities[k].table).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div style="padding:9px 11px;border:1px solid var(--border);border-radius:9px;cursor:pointer" data-route="${k}">
            <div class="small" style="font-weight:550">${esc(SCHEMA.entities[k].label)}</div><div class="muted small money">${num(v)} 条 · ${esc(SCHEMA.entities[k].table.split(' ')[0])}</div></div>`).join('')}</div>
        </div></div>
        <div class="card"><div class="card-head"><h3>${icon('settings')}账套信息</h3></div><div class="card-body">
          <div id="set-form">${UI.form([
            { k: 'company', label: '公司名称', type: 'text', full: true, required: true },
            { k: 'taxNo', label: '纳税人识别号', type: 'text' },
            { k: 'period', label: '当前会计期间', type: 'text', def: DB.today().slice(0, 7) },
            { k: 'currency', label: '本位币', type: 'select', opts: { CNY: '人民币 CNY', USD: '美元 USD' }, def: 'CNY' },
            { k: 'tax', label: '默认增值税率', type: 'select', opts: { 13: '13%', 9: '9%', 6: '6%' }, def: 13 },
            { k: 'invoiceTitle', label: '开票名称', type: 'text', def: DB.all().meta.company }],
            Object.assign({ period: DB.today().slice(0, 7) }, DB.all().meta))}</div>
          <div class="flex mt12"><button class="btn primary" data-action="saveMeta">${icon('check')}保存账套信息</button></div>
        </div></div>
      </div>
      ${securityCard()}
      <div class="card mt16"><div class="card-head"><h3>${icon('copy')}备份与恢复</h3><div class="right"><span class="muted small">导出文件为 JSON,可用文本编辑器查看数据结构</span></div></div>
        <div class="card-body"><div class="grid g3">
          <div class="notice">${icon('download')}<div><b>导出备份</b><br>下载包含全部业务表与单据序号的 JSON 快照,可用于迁移到其他浏览器。</div><button class="btn sm mt8" data-action="export">导出 JSON</button></div></div>
          <div class="notice">${icon('upload')}<div><b>导入备份</b><br>选择此前导出的 JSON 文件,导入后当前数据将被完整覆盖。</div><input type="file" accept=".json,application/json" data-action="importFile" class="mt8" style="font-size:12px"></div></div>
          <div class="notice warn">${icon('warn')}<div><b>重置演示数据</b><br>清空本地修改,重新生成 6 个月完整业务流(约 ${num(total)} 条记录)。</div><button class="btn sm danger-ghost mt8" data-action="reset">重置数据</button></div></div>
        </div></div></div>
      <div class="card mt16"><div class="card-head"><h3>${icon('layers')}数据表结构预览</h3><div class="right"><select data-table style="width:230px">${SCHEMA.visible().filter(k => !SCHEMA.entities[k].hidden).map(k => `<option value="${k}">${esc(SCHEMA.entities[k].label)} · ${esc(SCHEMA.entities[k].table)}</option>`).join('')}</select></div></div>
        <div id="table-prev">${tablePreview('sales_order')}</div></div>`;
  }
  function tablePreview(entity) {
    const e = SCHEMA.entities[entity], rows = DB.list(entity);
    const cols = Object.keys(e.fields).map(k => ({ k, label: e.fields[k].l + ` (${fieldType(e.fields[k].t)})`, render: r => {
      const v = r[k];
      if (v === undefined || v === null || v === '') return '<span class="muted">NULL</span>';
      if (typeof v === 'number') return `<span class="money">${UI.money(v)}</span>`;
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return `<span class="${/^(SO|PO|IV|DL|GR|PB|PY|RC|JE|MV|TR|ST|PR)/.test(v) ? 'mono' : ''}">${esc(String(v).slice(0, 60))}</span>`;
    } }));
    return `${UI.table(cols, rows.slice(0, 6), { pk: e.pk, empty: '空表' })}
      <div class="table-foot"><span>字段 ${cols.length} 个 · 共 ${num(rows.length)} 行 · 此处显示前 6 行原始记录</span></div>`;
  }
  function fieldType(t) { return { text: 'varchar', money: 'decimal(14,2)', int: 'int', date: 'date', datetime: 'datetime', select: 'enum', ref: 'fk', bool: 'tinyint', textarea: 'text', code: 'varchar(20)', email: 'varchar', tel: 'varchar', percent: 'decimal(5,2)' }[t] || t; }

  function bindSettings(root) {
    const sel = UI.$('[data-table]', root);
    if (sel) sel.addEventListener('change', () => { document.getElementById('table-prev').innerHTML = tablePreview(sel.value); });
    const file = UI.$('[data-action="importFile"]', root);
    if (file) file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const text = rd.result;
        let count = 0;
        try { const obj = JSON.parse(text); count = Object.values(obj.tables || {}).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0); }
        catch (e) { UI.toast('文件不是有效的 JSON 备份', 'err'); file.value = ''; return; }
        if (!count) { UI.toast('备份文件中没有业务数据', 'err'); file.value = ''; return; }
        UI.confirm(`导入 <b>${esc(f.name)}</b>(共 ${num(count)} 条记录)会完整覆盖当前数据,确定继续?`, { danger: true, ok: '覆盖导入' }).then(y => {
          file.value = '';
          if (!y) return;
          try { DB.importJSON(text); UI.toast('备份导入成功,已恢复 ' + num(count) + ' 条记录'); APP.render(); }
          catch (e) { UI.toast('导入失败:' + e.message, 'err'); }
        });
      };
      rd.readAsText(f);
    });
  }

  function action(name, el) {
    if (name === 'export') {
      const blob = new Blob([DB.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `sailfish-erp-backup-${DB.today()}.json`; a.click();
      UI.toast('备份已导出');
    } else if (name === 'reset') {
      UI.confirm('将清空当前所有业务数据并重新生成演示数据,确定继续?', { danger: true, ok: '重置' }).then(y => {
        if (!y) return; DB.reset(); APP.showLogin('演示数据已重新生成,请重新登录');
      });
    } else if (name === 'pwd') {
      AUTH.pwdModal();
    } else if (name === 'saveMeta') {
      const fields = UI.$$('#set-form [data-k]').map(i => i.dataset.k);
      fields.forEach(k => DB.all().meta[k] = UI.$(`#set-form [data-k="${k}"]`).value);
      DB.all().meta.currentUser = DB.currentUser();
      DB.persist(); APP.render(); UI.toast('账套信息已保存');
    } else if (name === 'exportReport') {
      REPORTS && UI.toast('已按当前报表结果导出 CSV');
      const rows = UI.$$('#view table.tbl tbody tr');
      const headCells = UI.$$('#view table.tbl thead th').map(t => t.textContent.trim());
      const body = rows.map(tr => UI.$$('td', tr).map(td => `"${td.textContent.trim().replace(/"/g, '""')}"`).join(','));
      const csv = '' + headCells.map(c => `"${c}"`).join(',') + '\r\n' + body.join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `report-${DB.today()}.csv`; a.click();
    }
  }

  /* ---------------- 关于与数据字典 ---------------- */
  function guide() {
    const flow = `
      <div class="grid g3">
        ${[['销售到收款 Order-to-Cash', 'SO 销售订单 → 审核(占用库存)→ DL 出库(库存流水+结转成本凭证)→ IV 发票(应收+收入凭证)→ RC 收款(核销应收);变更/关闭走审批中心裁决后回写订单。', '#4F46E5'],
          ['采购到付款 Procure-to-Pay', 'RFQ 询价比价 → 定标拆单 → PR 申请 → 审批 → PO 订单 → 审核 → GR 收货(库存 1405 + 应付暂估 2203)→ PB 发票清算(冲暂估 + 进项税 + 应付 2202,票差与运费回写存货成本)→ PY 付款(核销应付)。', '#0EA5E9'],
          ['库存与财务 Inventory-to-Finance', '调拨 TR / 盘点 ST 过账 → 出入库流水 MV → 库存现量重算 → 凭证 JE → 科目余额 → 账龄/毛利/周转报表;有借必有贷、账实勾稽由系统强制。', '#047857'],
          ['新品到上架 Product-to-Shelf', '供应商准入 SA(现场评审打分)→ 商品主档 → 新品发布单 → 销售主管裁决毛利与渠道 → 建档上架 → 首单采购;下架保留主档与历史交易。', '#7C3AED'],
          ['委外加工 Outsource', '外协商审核 PA(打样+四维评分)→ 入池核定单价产能 → OS 加工单 → 发料(借 1408 委托加工物资 / 贷 1405)→ 收回(材料+加工费计入成品成本)→ 加工费账单结算。', '#B45309'],
          ['计划与物料 Plan-to-Produce', '物料清单 BM(子件单件用量 ×(1 + 损耗率),提交后按材料影响额分级会签,采购主管核准发布才生效)→ MRP 运算 MR:未履约订单 / 安全库存 / 人工需求三种口径 → 沿生效清单逐层下展(父件按计划下单量引爆子件需求,同层同物料合并、库存桶顺序扣减防重复分配)→ 净需求 = 毛需求 + 安全库存 − 可用量 → 批量规则向上取整并尊重最小起订 → 外购合并成一张 PR 草稿、自制/委外逐件生成 OS 加工单(自动带出 BOM 发料行)→ 下达后仍是草稿,由采购与生产各自审批;运算与建议全程只读台账,不产生库存流水与凭证。', '#4338CA'],
          ['售后闭环 Return-to-Refund', 'RM 工单(退货/换货/维修)→ 销售主管审批 → 退货入库冲回成本 → 红字发票冲减应收 → 退款(负数收款单)或换货重发;维修费按责任归属费用化或挂应付追偿。', '#BE123C'],
          ['来料质量 IQC Gate', 'GR 收货按供应商质检策略入待检仓 WH-QC01 隔离(不可销售与领用)→ 自动报检按 GB/T 2828.1 AQL 抽样 → 品质经理三分支裁决:合格放行两腿同价转正品仓、让步接收按折价率冲减暂估 2203 并回写存货成本、拒收退货全额冲销暂估并释放采购订单行;结论回写供应商绩效评分。', '#CA8A04'],
          ['批次追溯 Lot Traceability', '一笔入库建一个批次(LOT,继承收货/委外/退货/盘盈单据身份)→ 按库区规则落位(收货暂存 / 存储 / 拣货 / 待检隔离 / 残次隔离)→ 出库按 FEFO 先到期先出分配,分配不足自动跨批次并拆批 → 冻结与处置只压缩可售量不动账面金额 → 双向追溯:上游追到供应商批次与采购订单,下游追到出库单、客户与发票;召回 = 影响分析 + 定点冻结 + 处置出库。', '#0F766E'],
          ['价格策略 Pricing Gate', '价目表(PL)按 客户专属 → 促销 → 渠道协议 → 类目协议 → 阶梯批发 → 标准售价 六级阶梯取价,同级按优先级与生效日决胜 → 草稿不参与取价,提交核准后由销售主管按<b>让利金额</b>分级会签(≥3 万两级、≥12 万三级)→ 生效后订单行自动回填价目表净价与来源 → 成交净价跌破成本红线价(成本 ×(1 + 最低毛利率))即拦截审核,须发起改价申请、按价差金额会签通过后单价才回写放行;停用只压失效日,历史引用可追。', '#DB2777']].map(x => `
        <div class="card"><div class="card-head"><h3 style="color:${x[2]}">${x[0]}</h3></div><div class="card-body"><p class="small" style="line-height:1.9;color:var(--text-2)">${x[1]}</p></div></div>`).join('')}
      </div>`;
    const tables = SCHEMA.visible().filter(k => !['activity'].includes(k)).map(k => {
      const e = SCHEMA.entities[k];
      return `<div class="card"><div class="card-head"><h3>${esc(e.label)}</h3><span class="sub mono">${esc(e.table)}</span>
        <div class="right"><button class="btn sm" data-route="${k}">${num(DB.count(k))} 条 ${icon('chevR')}</button></div></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>字段</th><th>含义</th><th>类型</th><th>约束</th></tr></thead><tbody>
        ${Object.keys(e.fields).map(f => {
          const d = e.fields[f];
          return `<tr><td class="mono">${f}${f === e.pk ? ' 🔑' : ''}</td><td>${esc(d.l || '')}</td>
            <td><span class="tag">${d.t}</span>${d.ref ? `<span class="tag">FK→${d.ref}</span>` : ''}${d.opts ? `<span class="tag">ENUM(${Object.keys(d.opts).length})</span>` : ''}</td>
            <td class="small muted">${f === e.pk ? '主键' : ''}${d.sum ? ' 汇总列' : ''}${d.ro ? ' 系统计算' : ''}${d.badge ? ' 状态徽标' : ''}${!d.hide && f !== e.pk ? ' 列表可见' : ''}</td></tr>`;
        }).join('')}</tbody></table></div></div>`;
    }).join('');

    return `<div class="page-head"><div><h2>关于与数据字典</h2><div class="desc">Sailfish ERP 是一个纯静态、零依赖、零构建的企业资源计划演示系统:业务模型、单据流转、库存核算与总账勾稽关系均对齐真实 ERP 实现方式。</div></div>
      <div class="page-actions"><button class="btn" data-route="settings">${icon('database')}数据管理</button><button class="btn primary" data-route="dashboard">${icon('dashboard')}进入看板</button></div></div>
      <div class="grid g4">
        ${UI.kpi({ label: '业务模块', value: num((APP.NAV || []).filter(g => ['工作台', '系统'].indexOf(g.group) < 0).length) + '<small> 个</small>', icon: 'grid', color: '#4F46E5', foot: '产品/商品/订单/售后/计划/采购/服务商/库存/财务/报表/权限' })}
        ${UI.kpi({ label: '数据表', value: num(SCHEMA.visible().length) + '<small> 张</small>', icon: 'layers', color: '#0EA5E9', foot: '含单据主子表结构' })}
        ${UI.kpi({ label: '业务动作', value: num(Object.keys(ACT).filter(k => typeof ACT[k] === 'function').length) + '<small> 项</small>', icon: 'swap', color: '#047857', foot: '审核/过账/结算全链路' })}
        ${UI.kpi({ label: '存储方式', value: 'localStorage', icon: 'database', color: '#7C3AED', foot: '离线可用,可导出备份' })}
      </div>
      <div class="mt20"><div class="section-title">核心业务流程(三单匹配 + 自动凭证)</div>${flow}</div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}单据与主数据编号规则</h3><div class="right"><span class="muted small">单据:前缀 + 年份 + 4 位流水,按年重置;批次尾缀 -S 为跨仓拆批</span></div></div>
        <div class="card-body"><div class="grid g4">
          ${[['SO', '销售订单'], ['DL', '销售出库单'], ['IV', '销售发票'], ['RC', '收款单'], ['PR', '采购申请'], ['PO', '采购订单'], ['GR', '采购收货单'], ['IQC', '来料检验单'], ['PB', '采购账单'], ['PY', '付款单'], ['MV', '库存流水'], ['TR', '调拨单'], ['ST', '盘点单'], ['JE', '记账凭证'], ['AP', '审批单'], ['BM', '物料清单 BOM', `BM${DB.today().slice(0, 4)}-0001`, '按版本 V1.0 迭代,作废不换号'], ['MR', 'MRP 计划运算', `MR${DB.today().slice(0, 4)}-0001`, '一轮运算一张快照'], ['PL', '价目表 / 价格策略'], ['LOT', '批次号', `LOT${DB.today().slice(0, 4)}-0001`], ['BIN', '库位(仓简-库区-巷道-位)', 'HZ-A01-01']].map(x => `
            <div style="padding:9px 11px;border:1px solid var(--border);border-radius:9px"><b class="mono">${x[0]}</b> <span class="small muted">${x[1]}</span>
            <div class="muted small mono" style="margin-top:2px">${x[2] || `${x[0]}${DB.today().slice(0, 4)}-0001`}</div>
            ${x[3] ? `<div class="muted small" style="margin-top:2px">${x[3]}</div>` : ''}</div>`).join('')}
        </div></div></div>
      <div class="card mt16"><div class="card-head"><h3>${icon('book')}财务核算口径</h3></div><div class="card-body"><div class="grid g2">
        <div><div class="section-title">自动生成凭证规则</div>
        ${[['sales_delivery', '销售出库过账', '借:主营业务成本 5001 / 贷:库存商品 1405'],
          ['sales_invoice', '销售开票', '借:应收账款 1122 / 贷:主营业务收入 4001 + 应交税费 2221(销项)'],
          ['sales_receipt', '收款过账', '借:银行存款 1002 / 贷:应收账款 1122'],
          ['gr_accrual', '采购收货(货到票未到)', '借:库存商品 1405 / 贷:应付暂估 2203 — 收货即入账,不与供应商对账'],
          ['ap_bill', '票到清算', '借:应付暂估 2203 + 应交税费 2221(进项)/ 贷:应付账款 2202;发票价与暂估差异调整 1405'],
          ['ap_payment', '付款过账', '借:应付账款 2202 / 贷:银行存款 1002'],
          ['gr_accrual', '来料让步 / 拒收冲暂估', '借:应付暂估 2203 / 贷:库存商品 1405 — 折价或退货部分同步冲减暂估与存货,合格放行只转仓不动金额'],
          ['close', '期末损益结转', '借:收入类 4001/4002 贷:本年利润 3131;借:本年利润 贷:成本与费用'],
          ['stock_adjust', '盘盈盘亏', '借/贷:库存商品 1405 与 其他成本 5401 / 其他业务收入 4002']].map(x => `
          <div class="flex" style="padding:7px 0;border-bottom:1px dashed var(--border)"><span class="tag mono">${x[0]}</span><span class="grow small">${x[1]}</span><span class="muted small" style="text-align:right;max-width:52%">${x[2]}</span></div>`).join('')}</div>
        <div><div class="section-title">成本与计价方法</div>
          <ul style="margin:0;padding-left:18px;line-height:2;color:var(--text-2);font-size:13px">
            <li>存货计价:<b>移动加权平均法</b>,库存金额逐笔等于出入库流水发生额(与总账 1405 严格同源),单位成本由金额反推。</li>
            <li>暂估与清算:收货即按不含税成本入账 贷记 2203,发票到达后冲销暂估,发票价、运杂费与暂估的差额回写存货成本。</li>
            <li>期间与结账:按月份顺序将损益结转至本年利润 3131 并锁定期间;锁定后凭证与库存流水都不能写入该月,反结账需财务审批权限且倒序回退。</li>
            <li>成本结转:销售出库按出库时点加权成本结转至主营业务成本。</li>
            <li>税码体系:货物销售 13%、运输 9%、服务 6%,由物料主数据 <span class="mono">tax_rate</span> 决定。</li>
            <li>库存占用:审核未出库的销售订单按行占用 <span class="mono">reserved</span>,可用量 = 现量 − 占用。</li>
            <li>批次与库位:批次台账只承载<b>数量与流向</b>,金额仍按移动加权平均记在 1405;批次上的 <span class="mono">unit_cost</span> 是管理会计口径,不参与总账。出库按 FEFO 先到期先出选批,冻结/过期只压缩可售量,处置出库才结转成本。</li>
            <li>信用控制:客户主数据 <span class="mono">credit_limit</span> 与应收余额联动,超限在客户画像中以颜色提示。</li>
            <li>计划与物料需求:清单行 <span class="mono">单件耗用 = 用量 ×(1 + 损耗率)</span>;可用量 = 现量 − 销售占用 + 在途采购 + 在制委外;净需求 = 毛需求 + 安全库存 − 可用量,再按最小起订量与整数批量抬升。自制/委外父件按计划下单量向下引爆子件需求,安全库存只在补货口径计一次。<b>MRP 是只读运算</b>:写出 mrp_run / mrp_lines 两张计划表,不动库存流水与凭证,下达出的申请单与加工单也停在草稿。</li>
            <li>取价与价格红线:订单单价由价目表六级阶梯(客户专属 → 促销 → 渠道 → 类目 → 阶梯 → 标准售价)在<b>成交日</b>重放得出,含税报价按 <span class="mono">tax_rate</span> 折算为未税价再乘行折让;<b>红线价 = 该仓移动加权成本 ×(1 + 最低毛利率)</b>,跌破红线的行必须经改价审批,审批通过才回写单价并计入收入,价目表内已核准的成交价不重复拦截。标准售价与价目表价的差额即让利,是价格报表与毛利体检的唯一口径。</li>
          </ul>
          <div class="section-title">技术架构</div>
          <div class="small" style="line-height:1.9;color:var(--text-2)">
            <span class="tag">index.html</span><span class="tag">style.css</span><span class="tag">schema.js 数据字典</span><span class="tag">store.js 持久化</span>
            <span class="tag">seed.js 演示数据</span><span class="tag">ui.js 组件库</span><span class="tag">actions.js 业务动作</span><span class="tag">views-*.js 视图层</span><span class="tag">app.js 路由</span>
            <div class="mt8">无框架、无 CDN、无构建步骤;双击 index.html 即可运行(也可用 <span class="mono">npx serve .</span> 预览)。图表为手写 SVG,数据全部落在浏览器本地。</div></div>
        </div></div></div></div>
      <div class="mt20"><div class="section-title">数据字典(${SCHEMA.visible().length} 张表)</div>${tables}</div>
      <div class="notice mt16">${icon('info')}<div><b>使用建议:</b>先到「待办任务」体验一单到底(审核订单 → 创建出库 → 开票 → 收款),再回「经营看板 / 利润表」观察数据联动;计划侧可从「物料清单」看多级展开,在「MRP 计划运算」起算并下达建议,「缺料与长周期分析」看实时缺口;所有操作都会写入「操作日志」并可导出 CSV/JSON 备份。</div></div>`;
  }

  return { settings, guide, action, bind: { settings: bindSettings, guide: () => { } } };
})();
