/* ============================================================
 * views-extras.js — 系统设置 / 关于与数据字典 / 全局动作
 * ============================================================ */
window.EXTRAS = (function () {
  const esc = UI.esc, num = UI.num, icon = UI.icon;

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
        if (!y) return; DB.reset(); APP.render(); UI.toast('演示数据已重新生成');
      });
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
          ['售后闭环 Return-to-Refund', 'RM 工单(退货/换货/维修)→ 销售主管审批 → 退货入库冲回成本 → 红字发票冲减应收 → 退款(负数收款单)或换货重发;维修费按责任归属费用化或挂应付追偿。', '#BE123C']].map(x => `
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
        ${UI.kpi({ label: '业务模块', value: num(12) + '<small> 个</small>', icon: 'grid', color: '#4F46E5', foot: '销售/采购/库存/财务/产品/服务商/售后/权限' })}
        ${UI.kpi({ label: '数据表', value: num(SCHEMA.visible().length) + '<small> 张</small>', icon: 'layers', color: '#0EA5E9', foot: '含单据主子表结构' })}
        ${UI.kpi({ label: '业务动作', value: num(Object.keys(ACT).filter(k => typeof ACT[k] === 'function').length) + '<small> 项</small>', icon: 'swap', color: '#047857', foot: '审核/过账/结算全链路' })}
        ${UI.kpi({ label: '存储方式', value: 'localStorage', icon: 'database', color: '#7C3AED', foot: '离线可用,可导出备份' })}
      </div>
      <div class="mt20"><div class="section-title">核心业务流程(三单匹配 + 自动凭证)</div>${flow}</div>
      <div class="card mt16"><div class="card-head"><h3>${icon('grid')}单据编号规则</h3><div class="right"><span class="muted small">前缀 + 年份 + 4 位流水,按年重置</span></div></div>
        <div class="card-body"><div class="grid g4">
          ${[['SO', '销售订单'], ['DL', '销售出库单'], ['IV', '销售发票'], ['RC', '收款单'], ['PR', '采购申请'], ['PO', '采购订单'], ['GR', '采购收货单'], ['PB', '采购账单'], ['PY', '付款单'], ['MV', '库存流水'], ['TR', '调拨单'], ['ST', '盘点单'], ['JE', '记账凭证']].map(x => `
            <div style="padding:9px 11px;border:1px solid var(--border);border-radius:9px"><b class="mono">${x[0]}</b> <span class="small muted">${x[1]}</span>
            <div class="muted small mono" style="margin-top:2px">${x[0]}${DB.today().slice(0, 4)}-0001</div></div>`).join('')}
        </div></div></div>
      <div class="card mt16"><div class="card-head"><h3>${icon('book')}财务核算口径</h3></div><div class="card-body"><div class="grid g2">
        <div><div class="section-title">自动生成凭证规则</div>
        ${[['sales_delivery', '销售出库过账', '借:主营业务成本 5001 / 贷:库存商品 1405'],
          ['sales_invoice', '销售开票', '借:应收账款 1122 / 贷:主营业务收入 4001 + 应交税费 2221(销项)'],
          ['sales_receipt', '收款过账', '借:银行存款 1002 / 贷:应收账款 1122'],
          ['gr_accrual', '采购收货(货到票未到)', '借:库存商品 1405 / 贷:应付暂估 2203 — 收货即入账,不与供应商对账'],
          ['ap_bill', '票到清算', '借:应付暂估 2203 + 应交税费 2221(进项)/ 贷:应付账款 2202;发票价与暂估差异调整 1405'],
          ['ap_payment', '付款过账', '借:应付账款 2202 / 贷:银行存款 1002'],
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
            <li>信用控制:客户主数据 <span class="mono">credit_limit</span> 与应收余额联动,超限在客户画像中以颜色提示。</li>
          </ul>
          <div class="section-title">技术架构</div>
          <div class="small" style="line-height:1.9;color:var(--text-2)">
            <span class="tag">index.html</span><span class="tag">style.css</span><span class="tag">schema.js 数据字典</span><span class="tag">store.js 持久化</span>
            <span class="tag">seed.js 演示数据</span><span class="tag">ui.js 组件库</span><span class="tag">actions.js 业务动作</span><span class="tag">views-*.js 视图层</span><span class="tag">app.js 路由</span>
            <div class="mt8">无框架、无 CDN、无构建步骤;双击 index.html 即可运行(也可用 <span class="mono">npx serve .</span> 预览)。图表为手写 SVG,数据全部落在浏览器本地。</div></div>
        </div></div></div></div>
      <div class="mt20"><div class="section-title">数据字典(${SCHEMA.visible().length} 张表)</div>${tables}</div>
      <div class="notice mt16">${icon('info')}<div><b>使用建议:</b>先到「待办任务」体验一单到底(审核订单 → 创建出库 → 开票 → 收款),再回「经营看板 / 利润表」观察数据联动;所有操作都会写入「操作日志」并可导出 CSV/JSON 备份。</div></div>`;
  }

  return { settings, guide, action, bind: { settings: bindSettings, guide: () => { } } };
})();
