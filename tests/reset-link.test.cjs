// tests/reset-link.test.cjs — v-reset-link (تدقيق الإنتاج ١٨–١٩ أكتوبر: رابط «إعادة تعيين كلمة المرور» من الإيميل يفتح نموذج
// الكلمة الجديدة لحظة ثمّ يختفي، ويرجع الزائر للرئيسيّة بلا نموذج — فلا طريق لاسترجاع الحساب بالبريد).
// الجذر في js/app-01-boot-auth.js: الحزمة defer، فـcheckResetTokenUrl يفتح وضع resetToken أثناء تحميلها، ثمّ معالج
// DOMContentLoaded يفرض setMode('login') ويُخفي الشاشة لكلّ زائر بلا جلسة، ولصاحب الجلسة يُخفيها onAuthed بعد التحقّق.
// وفي اللغات الكسولة (١٢ لغة) يصل ملفّ اللغة بعد الإقلاع فيعيد applyLanguage كتابة [data-i18n] الثابتة («دخول»).
// الاختبار يشغّل نظام الدخول نفسه في vm بعناصر مزيّفة وبالترتيب الحقيقيّ:
// تحميل الحزمة (app-01) ← applyLanguage (app-09) ← DOMContentLoaded ← [وصول ملفّ اللغة الكسول ← applyLanguage].
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-01-boot-auth.js'), 'utf8');
const START = SRC.indexOf('const $ = s => document.querySelector(s);');
const END_MARK = "}catch(e){ window.__swallow(e, 'authSystem:uncaught'); }";
const END = SRC.indexOf(END_MARK);
assert.ok(START > 0 && END > START, 'نظام الدخول موجود بحدوده المعروفة');
const CHUNK = SRC.slice(START, END + END_MARK.length);

// عناصر شاشة الدخول كما في js/partials-core.js، بمفاتيح الترجمة الثابتة نفسها
const IDS = [
  ['authOverlay', {}], ['authTabLogin', {}], ['authTabSignup', {}],
  ['authUsername', { 'data-i18n-placeholder': 'authIdPlaceholder' }],
  ['authPassword', { 'data-i18n-placeholder': 'authPasswordLabel' }],
  ['authError', {}], ['authSubmitBtn', { 'data-i18n': 'authSubmitLogin' }],
  ['authPasswordLabelText', { 'data-i18n': 'authPasswordLabel' }],
  ['authForgotLink', { 'data-i18n': 'authForgotLink' }],
  ['authBackToLoginLink', { 'data-i18n': 'authBackToLogin' }],
  ['authPasswordRow', {}], ['authInfoMsg', {}], ['authHeading', {}], ['authAltBlock', {}],
  ['authSwitchBtn', { 'data-i18n': 'authCreateAccount' }], ['authPhoneRecover', {}], ['authRememberRow', {}], ['authCloseBtn', {}],
];
function makeEl(id, attrs) {
  return {
    id, style: {}, textContent: '', value: '', placeholder: '', readOnly: false, autocomplete: '', type: 'text', disabled: false,
    attrs: Object.assign({}, attrs),
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {}, appendChild(c) { return c; }, focus() {},
  };
}

async function boot({ search = '', token = null, lang = 'ar', replies = {} } = {}) {
  const els = new Map(IDS.map(([id, a]) => [id, makeEl(id, a)]));
  els.get('authTabLogin').parentElement = makeEl('authTabsRow');
  els.get('authOverlay').style.display = 'none'; // كما في partials-core
  const store = new Map();
  if (token) { store.set('aiapp_auth_token', token); store.set('aiapp_username', 'sara'); }
  const env = { dictLang: (lang === 'ar' || lang === 'en') ? lang : 'en' }; // قبل وصول ملفّ اللغة الكسول: قاموس الاحتياط
  const listeners = {}; const timers = []; const errors = []; const actions = []; const replaced = [];
  const document = {
    querySelector: (s) => (s[0] === '#' && els.get(s.slice(1))) || null,
    getElementById: (id) => els.get(id) || null,
    addEventListener() {}, createElement: (t) => makeEl(t), title: '', cookie: '', readyState: 'loading', body: makeEl('body'),
    documentElement: { lang, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
  };
  const ctx = {
    document, URLSearchParams, console,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search, origin: 'https://omran.test', pathname: '/' },
    history: { replaceState: (_s, _t, url) => { replaced.push(url); ctx.location.search = ''; } },
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    AbortSignal: { timeout: () => undefined },
    alert() {}, confirm: () => false, prompt: () => null,
    __swallow: (e, tag) => { errors.push(tag + ': ' + (e && e.message || e)); },
    fetch: async (url, opt) => {
      let body = {}; try { body = JSON.parse((opt && opt.body) || '{}'); } catch (e) { body = {}; }
      const a = body.action || String(url);
      actions.push(a);
      const r = replies[a] || { status: 200, body: {} };
      if (r.offline) throw new TypeError('Failed to fetch'); // بلا شبكة: fetch يرمي كما في المتصفّح
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() {},
  };
  ctx.window = ctx;
  ctx.__i18nDict = () => new Proxy({}, { get: (_, k) => (typeof k === 'string' ? env.dictLang + ':' + k : undefined) });
  // نموذج applyLanguage (app-04): يعيد كتابة كلّ [data-i18n] و[data-i18n-placeholder] من قاموس اللغة الحاليّ
  const applyLanguage = () => {
    for (const el of els.values()) {
      const k = el.getAttribute('data-i18n'); if (k) el.textContent = env.dictLang + ':' + k;
      const p = el.getAttribute('data-i18n-placeholder'); if (p) el.placeholder = env.dictLang + ':' + p;
    }
  };
  const flush = () => { while (timers.length) timers.shift()(); };
  vm.createContext(ctx);
  vm.runInContext(CHUNK, ctx);          // تحميل الحزمة: app-01 (ومنه checkResetTokenUrl)
  applyLanguage();                       // app-09: applyLanguage() في نطاق الحزمة الأعلى، بعد app-01
  flush();
  assert.equal((listeners.DOMContentLoaded || []).length, 1, 'معالج إقلاع واحد');
  await listeners.DOMContentLoaded[0]();
  flush();
  const langFileArrives = (lg) => { env.dictLang = lg; applyLanguage(); };
  return { els, ctx, store, errors, actions, replaced, langFileArrives, el: (id) => els.get(id) };
}

const LINK = '?resetToken=tok123&ru=sara';
const VERIFY_OK = { verify: { status: 200, body: { ok: true, username: 'sara', token: 'tok-session-2' } } };

test('١. زائر يفتح رابط الاسترجاع: نموذج الكلمة الجديدة يبقى بعد الإقلاع بنصوصه، والرابط يُمسح من العنوان', async () => {
  const b = await boot({ search: LINK });
  assert.equal(b.el('authOverlay').style.display, 'flex', 'الشاشة لا تُخفى عن صاحب الرابط');
  assert.equal(b.el('authSubmitBtn').textContent, 'ar:authSubmitReset', 'الزرّ «إعادة تعيين» لا «دخول»');
  assert.equal(b.el('authPassword').placeholder, 'ar:authNewPasswordLabel');
  assert.equal(b.el('authUsername').value, 'sara');
  assert.equal(b.el('authUsername').readOnly, true, 'اسم الحساب من الرابط للقراءة فقط');
  assert.equal(b.ctx.__pendingResetToken, 'tok123');
  assert.deepEqual(b.replaced, ['https://omran.test/'], 'الرمز لا يبقى في العنوان ولا السجلّ');
  assert.ok(!b.actions.includes('verify'), 'لا تحقّق جلسة لزائر');
  assert.deepEqual(b.errors, []);
});

test('٢. صاحب جلسة يفتح الرابط: تحقّق الإقلاع لا يُغلق النموذج', async () => {
  const b = await boot({ search: LINK, token: 'tok-session', replies: VERIFY_OK });
  assert.ok(b.actions.includes('verify'), 'الجلسة تُتحقَّق كما كانت');
  assert.equal(b.store.get('aiapp_auth_token'), 'tok-session-2', 'والجلسة المنزلقة تُحفظ');
  assert.equal(b.el('authOverlay').style.display, 'flex', 'onAuthed لا يُخفي نموذج الرابط');
  assert.equal(b.el('authSubmitBtn').textContent, 'ar:authSubmitReset');
  assert.deepEqual(b.errors, []);
});

test('٣. تعيين الكلمة ينجح: الطلب resetWithToken برمز الرابط، ثمّ تُغلق الشاشة ويُمسح الرمز', async () => {
  const b = await boot({ search: LINK, replies: { resetWithToken: { status: 200, body: { ok: true, token: 'tok-after', username: 'sara' } } } });
  b.el('authPassword').value = 'newpass123';
  await b.el('authSubmitBtn').onclick();
  assert.ok(b.actions.includes('resetWithToken'), 'الزرّ يرسل إعادة التعيين');
  assert.equal(b.el('authOverlay').style.display, 'none', 'بعد النجاح يدخل ويُغلق');
  assert.equal(b.ctx.__pendingResetToken, null);
  assert.equal(b.store.get('aiapp_auth_token'), 'tok-after');
  assert.deepEqual(b.errors, []);
});

test('٤. «رجوع لتسجيل الدخول» من نموذج الرابط ثمّ دخول عاديّ يُغلق الشاشة (الحارس يتبع الوضع لا الرمز وحده)', async () => {
  const b = await boot({ search: LINK, replies: { login: { status: 200, body: { ok: true, token: 'tok-login', username: 'sara' } } } });
  b.el('authBackToLoginLink').onclick({ preventDefault() {} });
  assert.equal(b.el('authSubmitBtn').textContent, 'ar:authSubmitLogin');
  assert.equal(b.el('authUsername').readOnly, false);
  b.el('authPassword').value = 'oldpass123';
  await b.el('authSubmitBtn').onclick();
  assert.ok(b.actions.includes('login'));
  assert.equal(b.el('authOverlay').style.display, 'none');
  assert.deepEqual(b.errors, []);
});

test('٥. زيارة عاديّة بلا رابط: الدخول اختياريّ كما كان (v-auth-optional) — الشاشة مخفيّة ووضع «دخول»', async () => {
  const guest = await boot();
  assert.equal(guest.el('authOverlay').style.display, 'none');
  assert.equal(guest.el('authSubmitBtn').textContent, 'ar:authSubmitLogin');
  assert.equal(guest.el('authUsername').readOnly, false);
  const user = await boot({ token: 'tok-session', replies: VERIFY_OK });
  assert.equal(user.el('authOverlay').style.display, 'none', 'صاحب الجلسة بلا رابط: تُغلق كما كانت');
  assert.deepEqual(guest.errors.concat(user.errors), []);
});

test('٦. اللغات الكسولة: ملفّ اللغة يصل بعد الإقلاع فيبقى النموذج بنصوص الاسترجاع بلغته، والمفاتيح ترجع مع «رجوع»', async () => {
  const b = await boot({ search: LINK, lang: 'fr' });
  b.langFileArrives('fr');
  assert.equal(b.el('authOverlay').style.display, 'flex');
  assert.equal(b.el('authSubmitBtn').textContent, 'fr:authSubmitReset', 'لا «Connexion» على زرّ الاسترجاع');
  assert.equal(b.el('authPassword').placeholder, 'fr:authNewPasswordLabel');
  assert.equal(b.el('authHeading').textContent, 'fr:authForgotLink', 'العنوان بلغته لا بلغة الاحتياط');
  b.el('authBackToLoginLink').onclick({ preventDefault() {} });
  b.langFileArrives('fr');
  assert.equal(b.el('authSubmitBtn').textContent, 'fr:authSubmitLogin', 'وضع الدخول يعيد مفتاحه');
  assert.equal(b.el('authPassword').placeholder, 'fr:authPasswordLabel');
  assert.deepEqual(b.errors, []);
});

test('٧. صاحب جلسة يفتح الرابط والخادم معطَّل (٥٠٠) أو بلا شبكة: الجلسة المخبَّأة لا تُغلق النموذج', async () => {
  const down = await boot({ search: LINK, token: 'tok-session', replies: { verify: { status: 500, body: {} } } });
  assert.equal(down.el('authOverlay').style.display, 'flex', 'مسار خلل-خادم (onAuthed بالاسم المخبَّأ)');
  assert.equal(down.el('authSubmitBtn').textContent, 'ar:authSubmitReset');
  assert.equal(down.store.get('aiapp_auth_token'), 'tok-session', 'الجلسة لا تُحذف بخلل عابر');
  const offline = await boot({ search: LINK, token: 'tok-session', replies: { verify: { offline: true } } });
  assert.ok(offline.actions.includes('verify'));
  assert.equal(offline.el('authOverlay').style.display, 'flex', 'مسار تعذّر-الاتّصال (onAuthed بالاسم المخبَّأ)');
  assert.equal(offline.el('authSubmitBtn').textContent, 'ar:authSubmitReset');
  assert.equal(offline.store.get('aiapp_auth_token'), 'tok-session');
  assert.deepEqual(down.errors.concat(offline.errors), []);
});
