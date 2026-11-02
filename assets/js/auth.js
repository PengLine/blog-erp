/* ============================================================
 * auth.js — 身份认证:登录页 / 会话 / 口令管理 / 登录审计
 * 演示系统为纯静态应用,账号与口令保存在浏览器本地,不具备真实鉴权强度。
 * ============================================================ */
window.AUTH = (function () {
  const esc = UI.esc, icon = UI.icon;
  const MAX_FAIL = 5;            // 连续失败次数上限
  const LOCK_MS = 60 * 1000;     // 触发上限后的锁定时长
  const REMEMBER_KEY = 'sailfish_erp_remember_account';
  const fails = {};              // account -> { n, until }

  /* ---------------- 账号解析 ---------------- */
  function findUser(input) {
    const q = String(input || '').trim();
    if (!q) return null;
    const k = q.toLowerCase();
    return DB.list('users').filter(u => (u.account || '').toLowerCase() === k || String(u.code).toLowerCase() === k
      || (u.email || '').split('@')[0].toLowerCase() === k).find(Boolean)
      || DB.list('users').find(u => u.name === q) || null;
  }
  function lockOf(account) {
    const f = fails[String(account || '').toLowerCase()];
    if (!f) return 0;
    if (f.until && Date.now() < f.until) return Math.ceil((f.until - Date.now()) / 1000);
    if (f.until && Date.now() >= f.until) delete fails[String(account).toLowerCase()];
    return 0;
  }
  function bumpFail(account, msg) {
    const k = String(account).toLowerCase();
    const f = fails[k] || (fails[k] = { n: 0, until: 0 });
    const who = String(account).slice(0, 40) || '-';
    f.n++;
    if (f.n >= MAX_FAIL) {
      f.until = Date.now() + LOCK_MS; f.n = 0;
      DB.log('系统安全', '登录失败', who, `连续 ${MAX_FAIL} 次口令校验不通过,账号临时锁定 ${Math.round(LOCK_MS / 1000)} 秒`);
      return esc(`账号已临时锁定,请 ${Math.round(LOCK_MS / 1000)} 秒后再试。`);
    }
    DB.log('系统安全', '登录失败', who, `${msg}(第 ${f.n} 次尝试)`);
    return `${msg}(再失败 ${MAX_FAIL - f.n} 次将锁定 60 秒)`;
  }

  /* ---------------- 登录 / 退出 ---------------- */
  function attempt(account, pwd) {
    const lock = lockOf(account);
    if (lock) return { ok: false, msg: `账号已锁定,请 ${lock} 秒后重试。` };
    const u = findUser(account);
    if (!u) return { ok: false, msg: bumpFail(account || '-', '账号或口令不正确') };
    if (u.status === 'inactive') { DB.log('系统安全', '登录失败', u.account || u.code, '账号已停用,拒绝登录'); return { ok: false, msg: `账号「${u.account || u.code}」已停用,请联系系统管理员。` }; }
    if (!pwd) return { ok: false, msg: '请输入登录口令。' };
    if (String(u.pwd || '') !== String(pwd)) return { ok: false, msg: bumpFail(u.account, '账号或口令不正确') };
    delete fails[String(u.account).toLowerCase()];
    const role = DB.where('role', r => r.name === u.role)[0];
    if (role && role.status === 'disabled') { DB.log('系统安全', '登录失败', u.account || u.code, `角色「${role.name}」已停用`); return { ok: false, msg: `角色「${role.name}」已停用,无法登录。` }; }
    const s = DB.setSession(u, role ? role.code : '');
    DB.update('users', u.code, { last_login: DB.nowStr().slice(0, 16) });
    DB.log('系统安全', '登录成功', u.account || u.code,
      `${u.name}(${u.role})口令校验通过,会话有效期至 ${new Date(s.expires).toLocaleString('zh-CN')}`);
    try { localStorage.setItem(REMEMBER_KEY, u.account); } catch (e) { }
    return { ok: true, user: u, session: s };
  }
  function logout(reason) {
    const s = DB.session();
    if (s) DB.log('系统安全', '退出登录', s.account || '', reason || '用户主动退出');
    DB.clearSession();
    APP.showLogin();
  }
  /** 权限矩阵演示:登出并预填目标账号,仍需输入口令 */
  function switchTo(account, reason) {
    const s = DB.session();
    if (s) DB.log('系统安全', '退出登录', s.account || '', reason || '切换演示账号');
    DB.clearSession();
    try { localStorage.setItem(REMEMBER_KEY, account); } catch (e) { }
    APP.showLogin('已登出,请输入 ' + account + ' 的口令继续');
  }
  function check() {
    const raw = DB.all().meta.session;
    if (raw && (!raw.expires || Date.now() > raw.expires)) {
      DB.log('系统安全', '会话过期', raw.account || raw.code || '-', `超过 ${DB.SESSION_HOURS} 小时未操作,需重新验证口令`);
    }
    return DB.session();
  }
  /** 业务操作时续期,避免长时间填写单据后被踢出 */
  function keepAlive() { DB.touchSession(); }

  /* ---------------- 口令管理 ---------------- */
  function changePwd(oldPwd, newPwd, confirmPwd) {
    const s = DB.session();
    if (!s) return { ok: false, msg: '会话已过期,请重新登录。' };
    const u = DB.find('users', s.code);
    if (!u) return { ok: false, msg: '账号不存在。' };
    if (String(u.pwd || '') !== String(oldPwd || '')) return { ok: false, msg: '原口令不正确。' };
    if (!newPwd || String(newPwd).length < 8) return { ok: false, msg: '新口令至少 8 位,且需包含字母与数字。' };
    if (!/[0-9]/.test(newPwd) || !/[A-Za-z]/.test(newPwd)) return { ok: false, msg: '新口令需同时包含字母与数字。' };
    if (newPwd === oldPwd) return { ok: false, msg: '新口令不能与原口令相同。' };
    if (newPwd !== confirmPwd) return { ok: false, msg: '两次输入的新口令不一致。' };
    DB.update('users', u.code, { pwd: newPwd });
    DB.log('系统安全', '修改口令', u.account || u.code, `${u.name} 更新登录口令`);
    return { ok: true };
  }
  /** 管理员重置他人口令 */
  function resetPwd(code, newPwd) {
    ACT.PERM.assertPerm('role', 'edit');
    const u = DB.find('users', code);
    if (!u) throw new Error('用户不存在。');
    if (!newPwd || String(newPwd).length < 8) throw new Error('口令至少 8 位,且需包含字母与数字。');
    DB.update('users', u.code, { pwd: newPwd });
    DB.log('系统安全', '重置口令', u.account || u.code, `为 ${u.name}(${u.role})重置登录口令`);
    return u;
  }

  /* ---------------- 登录页 ---------------- */
  const QUICK = [
    ['admin', '系统管理员', '陈立群 · 全模块'],
    ['emp1002', '财务经理', '方静姝 · 财务与结账'],
    ['emp1003', '销售主管', '林墨对白 · 销售与售后'],
    ['emp1006', '采购主管', '郑思远 · 采购与委外'],
    ['emp1008', '仓库管理员', '何砚舟 · 库存执行'],
    ['emp1010', '财务会计', '钱雅诃 · 开票与凭证'],
  ];
  function featureList() {
    const F = [
      ['book', '业财一体化', '销售、采购、库存单据自动生成凭证,总账与明细账严格同源。'],
      ['lock', '期末结转与锁期', '损益结转至本年利润 3131 后锁定会计期间,禁止跨期过账。'],
      ['check', '角色分权与审批', '十类岗位权限矩阵,单据流转按角色裁决,操作全程留痕。'],
      ['chart', '全流程可点击', '从询价、订单到收款核销,6 个月真实业务流可逐单追溯。'],
    ];
    return F.map(f => `<div class="login-feat"><i>${icon(f[0])}</i><div><b>${f[1]}</b><br>${f[2]}</div></div>`).join('');
  }
  function brandPanel() {
    const meta = DB.all().meta || {};
    const docs = ['sales_order', 'purchase_order', 'delivery', 'gr', 'invoice', 'receipt', 'bill', 'payment'].reduce((s, k) => s + DB.count(k), 0);
    return `<div class="login-brand">
      <div class="logo">${APP.logoSVG()}<div class="logo-text"><b>Sailfish ERP</b><i>Enterprise Resource Planning</i></div></div>
      <h1>一套跑得通的电商企业资源计划</h1>
      <div class="tagline">${esc(meta.company)} · 账套 2026。销售、采购、库存、财务四条主线贯通,单据、凭证、账簿可逐笔追溯到源头业务。</div>
      <div class="login-feats">${featureList()}</div>
      <div class="login-stats">
        <div><span>在册用户</span><b>${DB.count('users')}</b></div>
        <div><span>角色权限</span><b>${DB.count('role')}</b></div>
        <div><span>业务单据</span><b>${docs.toLocaleString('en-US')}</b></div>
        <div><span>记账凭证</span><b>${DB.count('journal').toLocaleString('en-US')}</b></div>
      </div></div>`;
  }
  function remembered() {
    try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch (e) { return ''; }
  }
  function page() {
    const acc = remembered();
    return `<div class="login">${brandPanel()}
      <div class="login-form"><div class="login-box">
        <h2>登录系统</h2>
        <div class="sub">请使用工号账号与口令登录。连续 ${MAX_FAIL} 次失败将锁定 60 秒,登录与退出都会写入审计日志。</div>
        <div id="login-err"></div>
        <div class="login-field"><label for="lg-acc">登录账号</label>
          <input id="lg-acc" autocomplete="username" spellcheck="false" placeholder="admin / emp1002 / 邮箱前缀" value="${esc(acc)}"></div>
        <div class="login-field"><label for="lg-pwd">登录口令</label>
          <input id="lg-pwd" type="password" autocomplete="current-password" placeholder="请输入口令"></div>
        <div class="login-row">
          <label><input type="checkbox" id="lg-rem" ${acc ? 'checked' : ''}>记住账号</label>
          <span class="muted">闲置 ${DB.SESSION_HOURS} 小时后自动登出</span></div>
        <button class="btn primary login-submit" id="lg-go">${icon('user')}登 录</button>
        <div class="login-quick">
          <div class="t">${icon('zap')}演示账号 · 点击自动填充(业务岗口令 <span class="mono">Sf@123456</span>,管理员 <span class="mono">Sf@admin2026</span>)</div>
          <div class="quick-grid">${QUICK.map(q => `<button type="button" class="quick-item" data-acc="${esc(q[0])}" data-pwd="${esc(q[0] === 'admin' ? 'Sf@admin2026' : 'Sf@123456')}">
            <b>${esc(q[1])}</b><span>${esc(q[0])}</span></button>`).join('')}</div>
        </div>
      </div></div></div>`;
  }
  function showError(msg) {
    const box = document.getElementById('login-err');
    if (!box) return;
    box.innerHTML = msg ? `<div class="login-err">${icon('warn')}<div>${msg}</div></div>` : '';
  }
  function bind(root) {
    const acc = document.getElementById('lg-acc'), pwd = document.getElementById('lg-pwd'), go = document.getElementById('lg-go');
    if (!go) return;
    const doLogin = () => {
      const r = attempt(acc.value, pwd.value);
      if (!r.ok) { showError(r.msg); pwd.select(); return; }
      APP.enter(APP.state.route || 'dashboard');
    };
    go.addEventListener('click', doLogin);
    [acc, pwd].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
    acc.addEventListener('input', () => showError(''));
    pwd.addEventListener('input', () => showError(''));
    UI.$$('.quick-item', root).forEach(b => b.addEventListener('click', () => {
      acc.value = b.dataset.acc; pwd.value = b.dataset.pwd; showError(''); pwd.focus();
    }));
    setTimeout(() => (acc.value ? pwd : acc).focus(), 60);
  }

  /* ---------------- 会话菜单(顶栏右上角) ---------------- */
  function menu() {
    const s = DB.session() || {};
    const u = DB.find('users', s.code) || {};
    const role = DB.where('role', r => r.name === u.role)[0] || {};
    const left = Math.max(0, Math.round(((s.expires || 0) - Date.now()) / 60000));
    UI.modal({ title: '当前登录会话', subtitle: u.name + ' · ' + (u.role || '未分配角色'), width: 'mid',
      body: `${UI.descs([
        ['登录账号', `<span class="mono">${esc(u.account || s.account || '—')}</span>`],
        ['工号 / 部门', `${esc(u.code || '—')} · ${esc(u.dept || '—')}`],
        ['角色', `${esc(u.role || '—')}${role.level ? ` · 审批级别 ${role.level}` : ''}${(role.level || 0) >= 9 ? ' · 超级权限' : ''}`],
        ['数据范围', esc(role.scope === 'all' ? '全公司' : role.scope === 'dept' ? '本部门' : role.scope === 'self' ? '仅本人' : '—')],
        ['本次登录', esc(new Date(s.at || Date.now()).toLocaleString('zh-CN'))],
        ['会话剩余', `${left} 分钟(闲置 ${DB.SESSION_HOURS} 小时过期)`],
        ['授权点数', num(role.level >= 9 ? '全部模块' : (role.perms || []).length)],
      ])}
      <div class="notice mt16">${icon('info')}<div>纯静态演示:口令与会话保存在浏览器本地,不经过服务端。角色决定菜单可见性与单据审批权限,可在「权限矩阵」中调整。</div></div>`,
      actions: [
        { label: '修改口令', icon: 'edit', onClick: () => { pwdModal(); return false; } },
        { label: '切换用户', icon: 'swap', onClick: () => { logout('切换用户,重新登录'); } },
        { label: '退出登录', cls: 'danger-ghost', icon: 'logout', onClick: () => logout('') },
      ] });
  }
  function pwdModal() {
    const fields = [
      { k: 'old', label: '原口令', type: 'text', required: true, full: true, ph: '当前登录口令' },
      { k: 'p1', label: '新口令', type: 'text', required: true, full: true, ph: '至少 8 位,含字母与数字' },
      { k: 'p2', label: '确认新口令', type: 'text', required: true, full: true },
    ];
    UI.modal({ title: '修改登录口令', width: 'sm', body: UI.form(fields, {}) + `<div class="muted small mt8">修改后当前会话继续有效。</div>`,
      actions: [{ label: '取消' }, { label: '保存', cls: 'primary', onClick: api => {
        const rd = UI.readForm(api.el, fields);
        if (!rd.ok) { UI.toast('请完整填写三项口令。', 'err'); return false; }
        const v = rd.values;
        const r = changePwd(v.old, v.p1, v.p2);
        if (!r.ok) { UI.toast(r.msg, 'err'); return false; }
        UI.toast('口令已更新');
      } }] });
  }
  function num(v) { return typeof v === 'number' ? UI.num(v) : String(v); }

  return { page, bind, attempt, logout, switchTo, check, keepAlive, changePwd, resetPwd, menu, pwdModal, findUser, QUICK };
})();
