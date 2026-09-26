/* v-account-guard: الخطوة الثانية للدخول (رمز تطبيق المصادقة أو رمز احتياطيّ)، إعدادها وإيقافها من
   الإعدادات، «الخروج من كلّ الأجهزة»، وتجديد الجلسة — الرمز يعيش ٢٤ ساعة فيُجدَّد كلّ ساعتين والتطبيق
   مفتوح وعند العودة إليه بعد ساعة. جلسة أُبطلت من جهاز آخر (revoked) تُخرج هذا الجهاز. */
(function(){
  const tx = (k) => {
    const d = (typeof window.curT === 'function') ? window.curT() : {};
    return d[k] || ((window.I18N && window.I18N.en) || {})[k] || '';
  };
  const lang = () => localStorage.getItem('aiapp_lang') || 'ar';
  const token = () => (typeof window.authGet === 'function' ? window.authGet('aiapp_auth_token') : '') || '';

  async function post(body){
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ lang: lang() }, body)),
    });
    let d = {};
    try { d = await r.json(); } catch(e){ __swallow(e, 'mfa:json'); }
    return { status: r.status, ok: r.ok && !d.error, d };
  }

  function el(tag, attrs, text){
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if(k === 'style') n.style.cssText = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    if(text != null) n.textContent = text;
    return n;
  }

  const INPUT_CSS = 'width:100%; box-sizing:border-box; text-align:center; font-size:20px; letter-spacing:4px; direction:ltr; padding:10px; margin:6px 0 2px;';

  // نافذة واحدة تُبنى عند الحاجة وتُعاد تعبئتها لكلّ خطوة.
  function modal(){
    let m = document.getElementById('mfaModal');
    if(m){ m.style.display = 'flex'; return m; }
    m = el('div', { id: 'mfaModal', role: 'dialog', 'aria-modal': 'true', style: 'position:fixed; inset:0; z-index:10001; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:20px;' });
    const card = el('div', { style: 'background:var(--panel,#1b1b1f); color:var(--text,#eee); border:1px solid var(--border,#333); border-radius:16px; max-width:390px; width:100%; max-height:92vh; overflow:auto; padding:20px; text-align:center; box-sizing:border-box;' });
    card.appendChild(el('h3', { id: 'mfaModalTitle', style: 'margin:0 0 6px; font-size:17px;' }));
    card.appendChild(el('p', { id: 'mfaModalDesc', style: 'margin:0 0 10px; font-size:13px; line-height:1.7; color:var(--muted,#aaa);' }));
    card.appendChild(el('div', { id: 'mfaModalBody' }));
    card.appendChild(el('div', { id: 'mfaModalErr', style: 'color:#ef4444; font-size:12.5px; min-height:18px; margin:6px 0;' }));
    const row = el('div', { style: 'display:flex; gap:8px;' });
    row.appendChild(el('button', { type: 'button', id: 'mfaModalCancel', class: 'btn secondary', style: 'flex:1; justify-content:center; text-align:center;' }));
    row.appendChild(el('button', { type: 'button', id: 'mfaModalOk', class: 'btn', style: 'flex:1; justify-content:center; text-align:center; font-weight:700; background:rgba(212,175,55,.18); border:1px solid rgba(212,175,55,.6); color:var(--text,#eee);' }));
    card.appendChild(row);
    m.appendChild(card);
    document.body.appendChild(m);
    return m;
  }

  function screen(o){
    modal();
    const $ = (id) => document.getElementById(id);
    $('mfaModalTitle').textContent = o.title || tx('mfaTitle');
    $('mfaModalDesc').textContent = o.desc || '';
    const body = $('mfaModalBody');
    body.textContent = '';
    (o.nodes || []).forEach((n) => body.appendChild(n));
    $('mfaModalErr').textContent = '';
    const ok = $('mfaModalOk');
    const cancel = $('mfaModalCancel');
    ok.textContent = o.okLabel || tx('mfaVerifyBtn');
    ok.disabled = false;
    cancel.textContent = tx('mfaCancel');
    cancel.style.display = o.noCancel ? 'none' : '';
    cancel.onclick = () => { close(); if(o.onCancel) o.onCancel(); };
    ok.onclick = async () => {
      ok.disabled = true;
      $('mfaModalErr').textContent = '';
      try { await o.onOk((msg) => { $('mfaModalErr').textContent = msg || tx('mfaGenericError'); }); }
      catch(e){ __swallow(e, 'mfa:ok'); $('mfaModalErr').textContent = tx('mfaNetError'); }
      finally { ok.disabled = false; }
    };
    const first = body.querySelector('input');
    if(first){
      setTimeout(() => first.focus(), 30);
      body.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if(e.key === 'Enter') ok.click(); }));
    }
  }

  function close(){
    const m = document.getElementById('mfaModal');
    if(m) m.style.display = 'none';
  }

  function codeInput(){
    return el('input', { type: 'text', id: 'mfaCodeInput', inputmode: 'text', autocomplete: 'one-time-code', maxlength: '11', placeholder: '123456', style: INPUT_CSS });
  }

  // شاشة الرموز الاحتياطيّة — تظهر مرّة واحدة بعد التفعيل.
  function showBackup(codes, then){
    const pre = el('pre', { style: 'direction:ltr; text-align:center; font-size:15px; line-height:1.9; background:rgba(128,128,128,.12); border-radius:10px; padding:10px; margin:6px 0; user-select:all; white-space:pre-wrap;' }, codes.join('\n'));
    const copy = el('button', { type: 'button', class: 'btn secondary', style: 'width:100%; margin-top:4px; justify-content:center; text-align:center;' }, tx('mfaCopy'));
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(codes.join('\n')); copy.textContent = tx('mfaCopied'); }
      catch(e){ __swallow(e, 'mfa:copy'); }
    };
    screen({ title: tx('mfaBackupTitle'), desc: tx('mfaBackupDesc'), nodes: [pre, copy], okLabel: tx('mfaDone'), noCancel: true, onOk: async () => { close(); then(); } });
  }

  // الإعداد: via = { ticket } (مالك يُلزَم عند الدخول) أو { token } (من الإعدادات، بكلمة المرور).
  async function setup(via, done, opts){
    opts = opts || {};
    const begin = async (password, fail) => {
      const r = await post(Object.assign({ action: 'mfa-setup-start', currentPassword: password || undefined }, via));
      if(!r.ok){ if(fail) fail(r.d.error); return false; }
      const nodes = [];
      if(r.d.qr) nodes.push(el('img', { src: r.d.qr, alt: 'QR', width: '190', height: '190', style: 'display:block; margin:4px auto; background:#fff; padding:6px; border-radius:10px; image-rendering:pixelated;' }));
      const link = el('a', { href: r.d.uri, style: 'display:inline-block; margin:4px 0; font-size:13px; color:var(--accent,#7c6cff);' }, tx('mfaOpenApp'));
      nodes.push(link);
      nodes.push(el('div', { style: 'font-size:12px; color:var(--muted,#aaa); margin-top:6px;' }, tx('mfaManualKey')));
      nodes.push(el('code', { style: 'display:block; direction:ltr; font-size:13px; word-break:break-all; user-select:all; background:rgba(128,128,128,.12); border-radius:8px; padding:6px; margin:4px 0 8px;' }, String(r.d.secret || '').replace(/(.{4})/g, '$1 ').trim()));
      nodes.push(codeInput());
      const desc = (opts.ownerForced ? tx('mfaOwnerRequired') + ' ' : '') + tx('mfaSetupScan');
      screen({ desc, nodes, onOk: async (failConfirm) => {
        const code = (document.getElementById('mfaCodeInput').value || '').trim();
        const c = await post(Object.assign({ action: 'mfa-setup-confirm', code }, via));
        if(!c.ok){ failConfirm(c.d.error); return; }
        if(c.d.token) window.authSet('aiapp_auth_token', c.d.token);
        showBackup(c.d.backupCodes || [], () => done(c.d));
      } });
      return true;
    };
    if(via.ticket){
      if(!(await begin())) { screen({ desc: tx('mfaGenericError'), nodes: [], noCancel: false, onOk: async () => close() }); }
      return;
    }
    const pass = el('input', { type: 'password', id: 'mfaPassInput', autocomplete: 'current-password', style: 'width:100%; box-sizing:border-box; padding:10px; margin:6px 0;' });
    screen({ desc: tx('mfaPasswordPrompt'), nodes: [pass], okLabel: tx('mfaContinue'), onOk: async (fail) => { await begin(pass.value, fail); } });
  }

  // من مسارات الدخول: data = ردّ الخادم { mfa:'code'|'setup', ticket, username, avatar }.
  function start(data, done){
    if(data.mfa === 'setup'){
      setup({ ticket: data.ticket }, (d) => done(Object.assign({}, data, d)), { ownerForced: true });
      return;
    }
    screen({ desc: tx('mfaCodePrompt'), nodes: [codeInput()], onOk: async (fail) => {
      const code = (document.getElementById('mfaCodeInput').value || '').trim();
      const r = await post({ action: 'mfa-login', ticket: data.ticket, code });
      if(!r.ok){ fail(r.d.error); return; }
      window.authSet('aiapp_auth_token', r.d.token);
      close();
      done(Object.assign({}, data, r.d));
    } });
  }

  // صندوق «الأمان» في الإعدادات.
  async function refreshStatus(){
    const line = document.getElementById('mfaStatusLine');
    const btn = document.getElementById('mfaToggleBtn');
    if(!line || !btn) return;
    if(!token()){ line.textContent = ''; btn.style.display = 'none'; return; }
    try {
      const r = await post({ action: 'mfa-status', token: token() });
      if(!r.ok){ line.textContent = r.d.error || ''; return; }
      line.textContent = (r.d.on ? tx('mfaStatusOn') + ' ' + r.d.backupLeft : tx('mfaStatusOff')) + (r.d.required ? ' — ' + tx('mfaRequiredNote') : '');
      btn.dataset.on = r.d.on ? '1' : '';
      btn.textContent = r.d.on ? tx('mfaDisableBtn') : tx('mfaEnableBtn');
      btn.style.display = (r.d.on && r.d.required) ? 'none' : '';
    } catch(e){ __swallow(e, 'mfa:status'); }
  }

  function toggle(){
    const btn = document.getElementById('mfaToggleBtn');
    if(btn && btn.dataset.on){
      screen({ desc: tx('mfaCodePrompt'), nodes: [codeInput()], okLabel: tx('mfaDisableBtn'), onOk: async (fail) => {
        const r = await post({ action: 'mfa-disable', token: token(), code: (document.getElementById('mfaCodeInput').value || '').trim() });
        if(!r.ok){ fail(r.d.error); return; }
        close();
        refreshStatus();
      } });
      return;
    }
    setup({ token: token() }, () => refreshStatus());
  }

  async function logoutAll(){
    const msg = document.getElementById('acctSecurityMsg');
    if(!confirm(tx('logoutAllConfirm'))) return;
    try {
      const r = await post({ action: 'logoutAll', token: token() });
      if(!r.ok){ if(msg){ msg.textContent = r.d.error || tx('mfaGenericError'); msg.style.color = '#ef4444'; } return; }
      window.authSet('aiapp_auth_token', r.d.token);
      lastRefresh = Date.now();
      if(msg){ msg.textContent = tx('logoutAllDone'); msg.style.color = '#22c55e'; }
    } catch(e){ __swallow(e, 'mfa:logoutAll'); if(msg){ msg.textContent = tx('mfaNetError'); msg.style.color = '#ef4444'; } }
  }

  let lastRefresh = Date.now();
  async function refreshSession(){
    const t = token();
    if(!t) return;
    lastRefresh = Date.now();
    try {
      const r = await post({ action: 'verify', token: t });
      if(r.ok && r.d.token){ window.authSet('aiapp_auth_token', r.d.token); return; }
      if(r.status === 401 && r.d.revoked && typeof window.doLogout === 'function') window.doLogout();
    } catch(e){ __swallow(e, 'mfa:refresh'); }
  }
  setInterval(() => { if(Date.now() - lastRefresh > 2 * 3600 * 1000) refreshSession(); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && Date.now() - lastRefresh > 3600 * 1000) refreshSession();
  });

  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('#mfaToggleBtn, #logoutAllBtn, #acctSecurityRowBtn') : null;
    if(!t) return;
    if(t.id === 'mfaToggleBtn') toggle();
    else if(t.id === 'logoutAllBtn') logoutAll();
    else refreshStatus();
  });

  window.omranMfa = { start, setup, refreshStatus, refreshSession };
})();
