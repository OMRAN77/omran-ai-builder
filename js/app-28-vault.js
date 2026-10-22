/* ===== app-28-vault — خزنة الأسرار (v-secret-vault) =====
   طلب المالك ١٣ سبتمبر: «حقل خاصّ مشفّر لحفظ الأسرار بدل كتابته نصًّا خامًا بالمحادثة».
   قسم في الإعدادات للمالك وحده: حفظ توكن GitHub مشفّرًا في الخادم (AES-256-GCM)،
   عرض حالته (آخر ٤ حروف فقط)، حذفه، وفحصه (هل يقرأ المستودع؟ هل يرفع؟) بلا كشفه.
   الواجهة لا ترى القيمة بعد الحفظ أبدًا. والملصوق في المحادثة يُعترض في app-09
   ويُعرض على المالك حفظه هنا بدل إرساله. */
(function () {
  'use strict';

  var API = '/api/system?action=secrets';
  // v-owner-i18n: العربيّة للعربيّة وحدها، وباقي اللغات الإنجليزيّة (أساس الاحتياط في التطبيق، v424) — كانت الفرنسيّة وغيرها تُعرض عربيّة.
  function isAr() { return (localStorage.getItem('aiapp_lang') || 'ar') === 'ar'; }
  function t(ar, en) { return isAr() ? ar : en; }
  /* v-owner-i18n (تدقيق ١٨ أكتوبر): نتيجة «فحص المفتاح» كانت تُطبع من الخادم عربيّة خامًا في كلّ لغة. الخادم يرجع الآن
     رمزًا (error) والعربيّ في message، والرمز يُترجَم هنا من قاموس لغة الواجهة؛ وخطأ الشبكة = acctNetError. */
  function gk(k) { try { if (typeof window.t === 'function') { var v = window.t(k); if (v && v !== k) return String(v); } } catch (e) { /* guard-ok — المترجم لم يجهز فيُعرض الاحتياط */ } return ''; }
  var ERR_KEYS = { no_github_token: 'ownerVaultNoToken', bad_repo: 'ownerVaultBadRepo', token_rejected: 'ownerVaultRejected' };
  function netMsg(e) { var m = String((e && e.message) || e || ''); return (/Failed to fetch|NetworkError|Load failed|ERR_NETWORK|Network request failed/i.test(m) && gk('acctNetError')) || m; }
  function tok() { try { return (window.authGet && window.authGet('aiapp_auth_token')) || ''; } catch (e) { return ''; } }
  function el(id) { return document.getElementById(id); }
  function toast(msg) { try { if (typeof window.settingsToast === 'function') window.settingsToast(msg); else alert(msg); } catch (e) { /* guard-ok — التنبيه ترف */ } }

  async function call(op, extra) {
    try {
      var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ op: op, token: tok() }, extra || {})) });
      var j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      if (!r.ok) return { ok: false, error: (j && (j.error || j.message)) || ('HTTP ' + r.status) };
      return j || { ok: true };
    } catch (e) { return { ok: false, error: netMsg(e) }; }
  }

  function fmtDate(ms) {
    try { return new Date(ms).toLocaleString(isAr() ? 'ar-AE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; }
  }
  function render(st) {
    var box = el('vaultGhStatus'); if (!box) return;
    if (!st || st.ok === false) { box.textContent = '⚠️ ' + ((st && st.error) || t('تعذّر قراءة الحالة', 'Could not read status')); return; }
    if (st.configured === false) { box.textContent = t('⚠️ الخزنة معطّلة: أضف SECRETS_KEY أو AUTH_SECRET في بيئة Vercel', '⚠️ Vault disabled: set SECRETS_KEY or AUTH_SECRET in Vercel'); return; }
    var it = st.items && st.items.github_token;
    if (it && it.set) box.textContent = t('✅ محفوظ · ينتهي بـ ••••' + it.hint + (it.updatedAt ? ' · ' + fmtDate(it.updatedAt) : ''), '✅ Saved · ends with ••••' + it.hint + (it.updatedAt ? ' · ' + fmtDate(it.updatedAt) : ''));
    else box.textContent = t('— غير محفوظ (الوكيل يعمل بلا مفتاح: ٦٠ طلبًا/ساعة ولا رفع)', '— not saved (agent runs without a key: 60 req/h, no push)');
  }

  window.vaultRefresh = async function () {
    var box = el('vaultGhStatus'); if (!box) return;
    box.textContent = '⏳';
    render(await call('status'));
  };
  /** يُستدعى من اعتراض المحادثة (app-09) — يعيد {ok, error?} ولا يعرض شيئًا. */
  window.omranVaultStore = function (name, value) { return call('set', { name: name, value: value }); };

  window.vaultSave = async function (name) {
    var inp = el('vaultGhInput');
    var v = ((inp && inp.value) || '').trim();
    if (!v) { toast(t('الصق التوكن أوّلًا', 'Paste the token first')); return; }
    var r = await call('set', { name: name || 'github_token', value: v });
    if (inp) inp.value = '';
    if (r.ok) { toast(t('🔐 حُفظ مشفّرًا — لن يظهر مرّة أخرى', '🔐 Saved encrypted — it will not be shown again')); render(r); }
    else toast('⚠️ ' + (r.error === 'bad_value' ? t('صيغة التوكن غير صالحة', 'Invalid token format') : r.error === 'vault_not_configured' ? t('الخزنة معطّلة: أضف SECRETS_KEY في البيئة', 'Vault disabled: set SECRETS_KEY') : r.error));
  };
  window.vaultClear = async function (name) {
    if (!confirm(t('حذف توكن GitHub من الخزنة؟', 'Delete the GitHub token from the vault?'))) return;
    var r = await call('clear', { name: name || 'github_token' });
    toast(r.ok ? t('🗑️ حُذف', '🗑️ Deleted') : '⚠️ ' + r.error);
    if (r.ok) render(r);
  };
  window.vaultTest = async function () {
    var box = el('vaultTestBox'); if (!box) return;
    box.style.display = '';
    box.textContent = t('⏳ يفحص المفتاح مع GitHub…', '⏳ Checking the key with GitHub…');
    var repo = ((el('vaultRepoInput') && el('vaultRepoInput').value) || '').trim();
    var r = await call('test', { repo: repo });
    if (!r.ok) { box.textContent = '❌ ' + ((ERR_KEYS[r.error] && gk(ERR_KEYS[r.error])) || r.message || r.error || ''); return; }
    box.textContent = (r.login ? ('👤 ' + r.login + '\n') : '')
      + '📦 ' + r.repo + ': ' + (r.readable ? t('قراءة ✅', 'read ✅') : t('قراءة ❌ (المفتاح لا يرى المستودع)', 'read ❌ (key cannot see the repo)'))
      + ' · ' + (r.writable ? t('رفع ✅', 'push ✅') : t('رفع ❌ — الرفع يحتاج Contents: write + Pull requests: write', 'push ❌ — pushing needs Contents: write + Pull requests: write'))
      + (r.rateLimit ? '\n⏱️ ' + (gk('ownerVaultRate') || t('حدّ الطلبات: {n}/ساعة', 'Rate limit: {n}/hour')).split('{n}').join('\u2066' + r.rateLimit + '\u2069') : '');
  };
})();
