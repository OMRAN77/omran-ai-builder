// tests/audit-fix-boot.test.cjs — v-audit-boot (تدقيق التطبيق كلّه، مجموعة «الإقلاع والدخول وخصوصيّة الخروج»):
//   cli-boot-3  زرّ #btnAuthToggle بلا معالج: «سجّل مجانًا» في شارة الردّ وتقييم الكود و«اربط Gmail» للضيف تُغلق النافذة ولا تفتح شيئًا.
//   cli-boot-4  تبويب آخر مفتوح يعيد كتابة مرآة المحادثات (وIndexedDB) عند إغلاقه بعد أن مسحها الخروج من تبويب.
//   cli-boot-5  محادثات حساب رُفضت جلسته (أو جلسة لم تُحفظ) تُدمج في حساب أوّل من يدخل بعده على الجهاز وتُرفع إليه.
//   cli-boot-6  رسائل الدخول والتسجيل والاسترجاع ورمز البريد ثنائيّة isEn: عربيّة لاثنتي عشرة لغة، وسرّ الإعداد يظهر للمستخدم.
//   srv-maha-6  الخروج لا يلغي اشتراك الدفع: تذكيرات الحساب السابق تصل من يستعمل المتصفّح بعده.
//   cli-video-1 الخروج لا يمسح صورة بطل الفيلم من الذاكرة (ولا صور لوحة الترند ولا ملفّ «كتابة وصوت»).
// الكود الحقيقيّ في vm بعناصر ومتصفّح مزيّفين (نمط reset-link وlogout-wipe)، والخادم بمخزن في الذاكرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const AR = /[؀-ۿ]/;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < (n || 12); i++) await tick(); };

/* ───────── نظام الدخول (app-01) ───────── */
const A01 = read('js/app-01-boot-auth.js');
const AUTH_START = A01.indexOf('const $ = s => document.querySelector(s);');
const AUTH_END_MARK = "}catch(e){ window.__swallow(e, 'authSystem:uncaught'); }";
const AUTH_END = A01.indexOf(AUTH_END_MARK);
const OTP_START = A01.indexOf('// ===== Email OTP Login =====');
assert.ok(AUTH_START > 0 && AUTH_END > AUTH_START && OTP_START > AUTH_END, 'نظام الدخول ورمز البريد بحدودهما');
const AUTH = A01.slice(AUTH_START, AUTH_END + AUTH_END_MARK.length);
const OTP = A01.slice(OTP_START);

const IDS = ['authOverlay', 'authTabLogin', 'authTabSignup', 'authUsername', 'authPassword', 'authError', 'authSubmitBtn',
  'authPasswordLabelText', 'authForgotLink', 'authBackToLoginLink', 'authPasswordRow', 'authInfoMsg', 'authHeading', 'authAltBlock',
  'authSwitchBtn', 'authPhoneRecover', 'authRememberRow', 'authCloseBtn', 'btnAuthToggle', 'authGoogleBtn',
  'authEmailOtpBtn', 'authEmailOtpSection', 'authOtpEmailInput', 'authOtpCodeInput', 'authOtpEmailRow', 'authOtpCodeRow',
  'authOtpError', 'authOtpInfo', 'authOtpSubmitBtn', 'authOtpBackLink', 'acctUsername', 'acctUsernameSaveBtn', 'acctUsernameMsg'];
function makeEl(id) {
  return {
    id, style: {}, textContent: '', value: '', placeholder: '', readOnly: false, autocomplete: '', type: 'text', disabled: false,
    attrs: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {}, appendChild(c) { return c; }, append() {}, remove() {}, focus() {},
    click() { if (typeof this.onclick === 'function') return this.onclick({ preventDefault() {}, stopPropagation() {} }); },
  };
}

/* القاموس: «lg:مفتاح» لكلّ مفتاح — فيُعرف أنّ النصّ جاء من قاموس لغة الواجهة؛ missing = مفاتيح axBoot لم تصل بعد. */
async function bootAuth(o) {
  const opt = o || {};
  const lang = opt.lang || 'fr';
  const els = new Map(IDS.map((id) => [id, makeEl(id)]));
  els.get('authTabLogin').parentElement = makeEl('authTabsRow');
  els.get('authOverlay').style.display = 'none';
  const store = new Map(Object.entries(opt.ls || {}));
  if (opt.token) { store.set('aiapp_auth_token', opt.token); store.set('aiapp_username', opt.user || 'sara'); }
  const timers = []; const listeners = {}; const errors = []; const calls = []; const alerts = []; const unsub = [];
  const document = {
    querySelector: (s) => (s[0] === '#' && els.get(s.slice(1))) || null,
    getElementById: (id) => els.get(id) || null,
    addEventListener() {}, createElement: (t) => makeEl(t), createTextNode: (x) => ({ x }), title: '', cookie: '', readyState: 'loading', body: makeEl('body'),
    documentElement: { lang, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
  };
  const sub = opt.push === false ? null : { endpoint: 'https://push.example/ep-1', unsubscribe: async () => { unsub.push(1); return true; } };
  const ctx = {
    document, URLSearchParams, console: { log() {}, warn() {}, error() {} }, Promise, JSON, Object, String, Array, Error, Date, Math, Number, TypeError,
    navigator: { userAgent: '', serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: opt.search || '', origin: 'https://omran.test', pathname: '/' },
    history: { replaceState: () => { ctx.location.search = ''; } },
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    AbortSignal: { timeout: () => undefined },
    alert: (m) => { alerts.push(String(m)); }, confirm: () => true, prompt: () => null,
    caches: { keys: async () => [], delete: async () => true },
    __swallow: (e, tag) => { errors.push(tag + ': ' + ((e && e.message) || e)); },
    fetch: async (url, init) => {
      let body = {}; try { body = JSON.parse((init && init.body) || '{}'); } catch (e) { body = {}; }
      const a = body.action || String(url);
      calls.push({ url: String(url), method: (init && init.method) || 'GET', headers: (init && init.headers) || {}, body, label: ctx.__labelNow ? ctx.__labelNow() : '' });
      const r = (opt.replies || {})[a] || { status: 200, body: {} };
      if (r.offline) throw new TypeError('Failed to fetch');
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() {},
  };
  ctx.window = ctx;
  ctx.__i18nDict = (lg) => new Proxy({}, { get: (_, k) => (typeof k !== 'string' ? undefined : (opt.missing && /^axBoot/.test(k)) ? undefined : lg + ':' + k) });
  const flush = () => { let n = 0; while (timers.length && n++ < 50) timers.shift()(); };
  vm.createContext(ctx);
  vm.runInContext(AUTH, ctx);
  vm.runInContext(OTP, ctx);
  // الحزمة defer: DOMContentLoaded يأتي بعد تنفيذها مباشرة، والمؤقّتات (ومنها عرض سبب فشل جوجل بعد ٧٠٠ م.ث) بعده
  if (listeners.DOMContentLoaded) for (const f of listeners.DOMContentLoaded) await f();
  flush();
  await settle();
  return { ctx, els, el: (id) => els.get(id), store, errors, calls, alerts, unsub, flush };
}

test('cli-boot-3 — «سجّل»/«اربط» للضيف تمرّ عبر #btnAuthToggle: الضغط يفتح شاشة التسجيل', async () => {
  const b = await bootAuth({ lang: 'ar' });
  assert.equal(b.el('authOverlay').style.display, 'none', 'الضيف بلا شاشة عند الإقلاع');
  assert.equal(b.el('btnAuthToggle').style.display, 'none', 'الزرّ نفسه يبقى مخفيًّا');
  b.el('btnAuthToggle').click(); // ما تفعله شارة الردّ (app-04) وتقييم الكود (app-27) ومراجعة الكود (app-24) و«اربط Gmail» (app-12)
  assert.equal(b.el('authOverlay').style.display, 'flex', 'الشاشة فُتحت');
  assert.equal(b.el('authSubmitBtn').getAttribute('data-i18n'), 'authSubmitSignup', 'في وضع «إنشاء حساب» كزرّ «سجّل مجانًا»');
  assert.deepEqual(b.errors, []);
  // المنادون الأربعة ما زالوا ينادون الزرّ نفسه (فالإصلاح في مكان واحد يغطّيهم)
  for (const f of ['js/app-04-i18n-state.js', 'js/app-12-studios.js', 'js/app-24-codefix.js', 'js/app-27-codescore.js']) assert.match(read(f), /btnAuthToggle/, f);
});

test('cli-boot-6 — نموذج الدخول بلغة الواجهة: الحقول الفارغة، الانتظار، وانقطاع الشبكة (فرنسيّ)', async () => {
  const b = await bootAuth({ lang: 'fr', replies: { login: { offline: true } } });
  await b.el('authSubmitBtn').onclick();
  assert.equal(b.el('authError').textContent, 'fr:axBootFillBoth', 'كان «الرجاء تعبئة الحقلين» بالعربيّة');
  b.el('authUsername').value = 'sara'; b.el('authPassword').value = 'pw';
  b.ctx.__labelNow = () => b.el('authSubmitBtn').textContent;
  await b.el('authSubmitBtn').onclick();
  const login = b.calls.find((c) => c.body.action === 'login');
  assert.equal(login.label, 'fr:axBootSigningIn', 'نصّ الانتظار كان «جاري الدخول…»');
  assert.equal(b.el('authError').textContent, 'fr:acctNetError', 'المفتاح الموجود بالـ١٤ لغة');
  // «نسيت كلمة المرور»: الحقل الفارغ والانتظار
  b.el('authForgotLink').onclick({ preventDefault() {} });
  b.el('authUsername').value = '';
  await b.el('authSubmitBtn').onclick();
  assert.equal(b.el('authError').textContent, 'fr:axBootEnterId');
  assert.deepEqual(b.errors, []);
});

test('cli-boot-6 — مفتاح لم يصل بعد: الاحتياط إنجليزيّ لغير العربيّة (الأرديّة لا ترى عربيًّا)، وعربيّ للعربيّة', async () => {
  const ur = await bootAuth({ lang: 'ur', missing: true });
  await ur.el('authSubmitBtn').onclick();
  assert.equal(ur.el('authError').textContent, 'Please fill in both fields');
  const ar = await bootAuth({ lang: 'ar', missing: true });
  await ar.el('authSubmitBtn').onclick();
  assert.equal(ar.el('authError').textContent, 'الرجاء تعبئة الحقلين');
});

test('cli-boot-6 — فشل جوجل بلغة الواجهة وبلا أسماء إعداد الخادم، وتنبيه «تحقّق أمني» مترجَم', async () => {
  const fr = await bootAuth({ lang: 'fr', search: '?gerror=google_not_configured' });
  fr.flush();
  assert.equal(fr.el('authOverlay').style.display, 'flex', 'الشاشة تُفتح بالسبب');
  assert.equal(fr.el('authError').textContent, 'fr:axBootGoogleFailed');
  const ur = await bootAuth({ lang: 'ur', missing: true, search: '?gerror=google_not_configured' });
  ur.flush();
  const txt = ur.el('authError').textContent;
  assert.ok(txt && !AR.test(txt), 'لا عربيّ للأرديّة: ' + txt);
  assert.doesNotMatch(txt, /GOOGLE_CLIENT|SECRET|Console/i, 'لا أسماء متغيّرات الخادم');
  assert.ok(txt.includes('google_not_configured'), 'رمز السبب يبقى للتشخيص');
  const cancel = await bootAuth({ lang: 'fr', search: '?gerror=access_denied' });
  cancel.flush();
  assert.equal(cancel.el('authError').textContent, 'fr:axBootGoogleCancelled');
  const sec = await bootAuth({ lang: 'fr', search: '?gtoken=t&guser=u&state=forged' });
  assert.deepEqual(sec.alerts, ['fr:axBootSecurityCheck'], 'كان «تعذّر إكمال تسجيل الدخول (تحقّق أمني)» بالعربيّة');
});

test('cli-boot-6 — رسالة الإدارة وإيقاف الحساب عند الإقلاع بلغة الواجهة', async () => {
  const msg = await bootAuth({ lang: 'fr', token: 'tok', replies: { verify: { status: 200, body: { ok: true, username: 'sara', adminMessage: { text: 'Bonjour' } } } } });
  msg.flush();
  assert.equal(msg.alerts.length, 1);
  assert.ok(msg.alerts[0].includes('fr:axBootAdminMsg') && msg.alerts[0].includes('Bonjour') && !AR.test(msg.alerts[0]), msg.alerts[0]);
  const ban = await bootAuth({ lang: 'fr', token: 'tok', replies: { verify: { status: 403, body: { banned: true, error: 'تم إيقاف هذا الحساب من قبل الإدارة' } } } });
  assert.equal(ban.alerts.length, 1);
  assert.ok(ban.alerts[0].includes('fr:axBootBanned') && !AR.test(ban.alerts[0]), ban.alerts[0]);
});

test('cli-boot-6 — رمز البريد (OTP): بريد غير صحيح والانتظار وانقطاع الشبكة بلغة الواجهة', async () => {
  const b = await bootAuth({ lang: 'tr', replies: { 'email-otp-request': { offline: true } } });
  b.el('authOtpEmailInput').value = 'not-an-email';
  await b.el('authOtpSubmitBtn').onclick();
  assert.equal(b.el('authOtpError').textContent, 'tr:acctInvalidEmail', 'كان «أدخل بريد إلكتروني صحيح»');
  b.el('authOtpEmailInput').value = 'sara@example.com';
  b.ctx.__labelNow = () => b.el('authOtpSubmitBtn').textContent;
  await b.el('authOtpSubmitBtn').onclick();
  assert.equal(b.calls.find((c) => c.body.action === 'email-otp-request').label, 'tr:axBootSending');
  assert.equal(b.el('authOtpError').textContent, 'tr:acctNetError', 'كان «خطأ في الاتصال»');
});

test('cli-boot-6 — لا ثنائيّة isEn باقية في مسارات الدخول والتسجيل والاسترجاع وجوجل ورمز البريد', () => {
  const live = A01.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const s = live.indexOf('function showGoogleAuthError('), e = live.indexOf("const acctAvatarBtn = $('#acctAvatarBtn');");
  assert.ok(s > 0 && e > s);
  assert.doesNotMatch(live.slice(s, e), /isEn \?|aiapp_lang'\) === 'en'\)\s*\?/, 'نموذج الدخول');
  assert.doesNotMatch(live.slice(live.indexOf('(function emailOtpSystem(){')), /isEn \?/, 'رمز البريد');
  assert.doesNotMatch(A01, /GOOGLE_CLIENT_ID أو GOOGLE_CLIENT_SECRET/, 'لا أسماء أسرار الخادم في نصّ يراه المستخدم');
});

test('srv-maha-6 — الخروج يلغي اشتراك الدفع لهذا المتصفّح ويطلب حذفه من الحساب بالرمز قبل مسحه', async () => {
  const b = await bootAuth({ lang: 'ar', token: 'tok-a', user: 'a', replies: { verify: { status: 200, body: { ok: true, username: 'a' } } } });
  b.calls.length = 0;
  await b.ctx.doLogout();
  await settle();
  const del = b.calls.find((c) => c.method === 'DELETE' && /^\/api\/push-subscribe/.test(c.url));
  assert.ok(del, 'طلب حذف الاشتراك: ' + JSON.stringify(b.calls.map((c) => c.method + ' ' + c.url)));
  assert.equal(del.headers.Authorization, 'Bearer tok-a', 'برمز الحساب الخارج');
  assert.equal(del.body.endpoint, 'https://push.example/ep-1', 'الاشتراك المحذوف هو اشتراك هذا المتصفّح وحده');
  assert.ok(del.url.includes(encodeURIComponent('https://push.example/ep-1')), 'وفي الرابط أيضًا (بعض الوسطاء يُسقط جسم DELETE)');
  assert.equal(b.unsub.length, 1, 'الاشتراك أُلغي في المتصفّح نفسه (العنوان القديم يموت عند خدمة الدفع)');
  assert.equal(b.store.get('aiapp_auth_token'), undefined, 'ثمّ خرج');
  // بلا اشتراك: لا طلب ولا خطأ
  const n = await bootAuth({ lang: 'ar', token: 'tok-a', user: 'a', push: false, replies: { verify: { status: 200, body: { ok: true, username: 'a' } } } });
  n.calls.length = 0;
  await n.ctx.doLogout();
  await settle();
  assert.ok(!n.calls.some((c) => /push-subscribe/.test(c.url)));
  assert.deepEqual(n.errors, []);
});

test('srv-maha-6 — الخادم: الحذف يخصّ عنوان المتصفّح الخارج، فلا يُطفأ اشتراك جهاز آخر للحساب نفسه', async () => {
  const rp = (f) => require.resolve(path.join(root, f));
  const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
  const kv = new Map();
  mock('api/_lib/kv.js', { kvGetJSON: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null), kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); } });
  mock('api/_lib/_session.js', { sessionUser: (t) => (t === 'tok-a' ? 'a' : null), tokenOf: () => '' });
  delete require.cache[rp('api/_lib/push-subscribe.js')];
  const h = require(rp('api/_lib/push-subscribe.js'));
  const run = async (req) => { const r = { code: 0, j: null, status(c) { this.code = c; return this; }, json(j) { this.j = j; return this; } }; await h(Object.assign({ headers: { authorization: 'Bearer tok-a' } }, req), r); return r; };
  const key = h.subPath('a');
  kv.set(key, JSON.stringify({ endpoint: 'https://push.example/phone' }));
  let r = await run({ method: 'DELETE', body: { endpoint: 'https://push.example/laptop' } });
  assert.equal(r.code, 200);
  assert.deepEqual(JSON.parse(kv.get(key)), { endpoint: 'https://push.example/phone' }, 'اشتراك الجوّال باقٍ بعد الخروج من الحاسوب');
  r = await run({ method: 'DELETE', query: { endpoint: 'https://push.example/phone' } });
  assert.equal(r.code, 200);
  assert.equal(JSON.parse(kv.get(key)), null, 'عنوان هذا المتصفّح يُحذف (من الرابط إن سقط الجسم)');
  kv.set(key, JSON.stringify({ endpoint: 'https://push.example/x' }));
  r = await run({ method: 'DELETE' });
  assert.equal(JSON.parse(kv.get(key)), null, 'بلا عنوان: كما كان (حذف)');
  assert.equal((await run({ method: 'DELETE', headers: {} })).code, 401);
  delete require.cache[rp('api/_lib/push-subscribe.js')]; delete require.cache[rp('api/_lib/kv.js')]; delete require.cache[rp('api/_lib/_session.js')];
});

test('cli-boot-5 — تغيير الاسم في «حسابي» ينقل وسم صاحب البيانات المحلّيّة (فلا يُمسح جهازه عند الدخول التالي)', async () => {
  const b = await bootAuth({ lang: 'ar', token: 'tok-b', user: 'b', ls: { aiapp_data_owner: 'b' }, replies: { verify: { status: 200, body: { ok: true, username: 'b' } }, changeUsername: { status: 200, body: { ok: true, token: 'tok-b2', username: 'Bee2' } } } });
  b.el('acctUsername').value = 'Bee2';
  await b.el('acctUsernameSaveBtn').onclick();
  assert.equal(b.store.get('aiapp_username'), 'Bee2');
  assert.equal(b.store.get('aiapp_data_owner'), 'bee2');
});

/* ───────── حال المحادثات (app-04) ───────── */
const A4 = read('js/app-04-i18n-state.js');
function chatsEnv(o) {
  const opt = o || {};
  const s = A4.indexOf('let __saveTimer = null;');
  const e = A4.indexOf('function getCurrent(){');
  assert.ok(s > 0 && e > s, 'كتلة الحفظ والمزامنة بحدودها');
  const log = [];
  const auth = Object.assign({ token: 'tok-a', user: 'a' }, opt.auth || {});
  const ls = new Map(Object.entries(Object.assign({ aiapp_projects_slim: '[]', aiapp_lang: 'ar' }, opt.ls || {})));
  const wl = {}; const dl = {};
  const server = { projects: opt.server || [], saves: [] };
  const ctx = {
    console, JSON, Object, Array, String, Number, Promise, Date, Math, Error, WeakMap,
    setTimeout: (fn, ms) => (ms >= 8000 ? 0 : setTimeout(fn, 0)), clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    document: { visibilityState: 'visible', addEventListener: (t, f) => { (dl[t] = dl[t] || []).push(f); } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); } },
    sessionStorage: { getItem: () => null },
    indexedDB: { deleteDatabase: (n) => { log.push('idb-delete:' + n); const rq = {}; setTimeout(() => rq.onsuccess && rq.onsuccess(), 0); return rq; } },
    confirm: () => true, alert: () => {},
    t: (k) => k,
    __swallow: (err, tag) => { log.push('swallow:' + tag + ':' + ((err && err.message) || err)); },
    state: { projects: opt.projects || [], currentId: null },
    fetch: async (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      if (/chats_load/.test(url)) return { ok: true, json: async () => ({ projects: JSON.parse(JSON.stringify(server.projects)), deletedIds: [] }) };
      if (/chats_save/.test(url)) { server.saves.push(body.projects); return { ok: true }; }
      return { ok: true, json: async () => ({}) };
    },
  };
  ctx.window = {
    authGet: (k) => (k === 'aiapp_auth_token' ? auth.token : k === 'aiapp_username' ? auth.user : null),
    __localChatsLoaded: true, indexedDB: true,
    addEventListener: (t, f) => { (wl[t] = wl[t] || []).push(f); },
    __pushDropDevice: (tk) => log.push('push-drop:' + (tk || '')),
    __clearFilmHero: () => log.push('hero-clear'),
    omranVideoTrends: { reset: () => log.push('trends-reset') },
    omranVideoEdit: { reset: () => log.push('ved-reset') },
  };
  vm.createContext(ctx);
  const prelude = 'let __vaultLastLen = 0; let __idbBroken = false; const IDB_NAME = "aiapp_db"; const __noViewReplacer = undefined;\n'
    + 'function __vaultSave(){ window.__vaultWrites = (window.__vaultWrites || 0) + 1; window.__vaultLast = JSON.stringify(state.projects); return Promise.resolve(); }\n'
    + 'function idbSet(){ return Promise.resolve(); } function pushCodeSnapshot(){} function purgeOldImages(){ return false; } function renderHistory(){} function renderAll(){}\n';
  vm.runInContext(prelude + A4.slice(s, e), ctx);
  const fire = (t, ev) => { for (const f of (wl[t] || [])) f(ev || {}); };
  return { ctx, log, ls, auth, server, fire, wl };
}
const SECRET_A = 'سرّ الحساب أ';
const projA = () => [{ id: 'p_1700000000001', title: 'خاصّ', messages: [{ role: 'user', content: SECRET_A }] }];

test('cli-boot-4 — تبويب ثانٍ بعد الخروج من الأوّل: الإغلاق لا يعيد كتابة المرآة ولا IndexedDB بمحادثات الحساب', async () => {
  const E = chatsEnv({ projects: projA() });
  E.ctx.window.chatsSyncOnAuth();
  await settle();
  E.fire('pagehide'); // تبويب مسجَّل: المرآة تُكتب كما كانت
  assert.ok(E.ls.get('aiapp_projects_slim').includes(SECRET_A), 'المسجَّل ما زال يكتب مرآته');
  // التبويب (أ) يخرج ويمسح الجهاز — هذا التبويب لا يعرف
  E.auth.token = ''; E.ls.set('aiapp_projects_slim', '[]'); E.ctx.window.__vaultWrites = 0;
  E.ctx.saveState(); // أيّ تغيير قبل الإغلاق
  E.fire('pagehide');
  await settle();
  assert.equal(E.ls.get('aiapp_projects_slim'), '[]', 'المرآة الممسوحة بقيت ممسوحة');
  assert.equal(E.ctx.window.__vaultWrites, 0, 'ولا كتابة IndexedDB بمحادثات الحساب');
});

test('cli-boot-4 — الحارس لا يمسّ الخروج في التبويب نفسه: بعده (حتّى بلا محادثات) يُحفظ ما يكتبه الضيف', async () => {
  const E = chatsEnv({ projects: [{ id: 'p_1700000000003', title: '', messages: [] }] });
  E.ctx.window.chatsSyncOnAuth();
  await settle();
  assert.equal(await E.ctx.window.chatsLogoutWipe(), true, 'لا محادثات: خروج بلا سؤال');
  E.auth.token = ''; // doLogout يمسح الرمز بعد المسح
  E.ctx.state.projects[0].messages.push({ role: 'user', content: 'مسوّدة ضيف بعد الخروج' });
  E.ctx.saveState();
  E.fire('pagehide');
  await settle();
  assert.ok(E.ls.get('aiapp_projects_slim').includes('مسوّدة ضيف بعد الخروج'), 'المرآة تُكتب للضيف');
  assert.ok(String(E.ctx.window.__vaultLast || '').includes('مسوّدة ضيف بعد الخروج'), 'وIndexedDB');
});

test('cli-boot-4 — حدث storage بخروج تبويب آخر يفرّغ محادثات الحساب من ذاكرة هذا التبويب (وصورة البطل وغيرها)', async () => {
  const E = chatsEnv({ projects: projA() });
  E.ctx.window.chatsSyncOnAuth();
  await settle();
  E.fire('storage', { key: 'aiapp_auth_token', oldValue: 'tok-a', newValue: 'tok-a2' }); // تجديد الجلسة في تبويب آخر: لا شيء
  assert.ok(JSON.stringify(E.ctx.state.projects).includes(SECRET_A));
  E.auth.token = '';
  E.fire('storage', { key: 'aiapp_auth_token', oldValue: 'tok-a2', newValue: null });
  const st = JSON.stringify(E.ctx.state.projects);
  assert.ok(!st.includes(SECRET_A), 'المحادثة الخاصّة لم تبقَ في الذاكرة');
  assert.equal(E.ctx.state.projects.length, 1);
  assert.equal(E.ctx.state.projects[0].messages.length, 0, 'محادثة فارغة');
  assert.ok(E.log.includes('hero-clear') && E.log.includes('trends-reset') && E.log.includes('ved-reset'), E.log.join(','));
  E.fire('pagehide');
  await settle();
  assert.ok(!E.ls.get('aiapp_projects_slim').includes(SECRET_A));
  assert.ok(!String(E.ctx.window.__vaultLast || '').includes(SECRET_A));
  assert.ok(!E.log.some((x) => x.startsWith('swallow:')), E.log.join(' | '));
});

test('cli-boot-5 — دخول حساب آخر على جهاز فيه بيانات حساب سابق: تُمسح بصمت قبل الدمج ولا تُرفع إليه', async () => {
  const E = chatsEnv({ projects: projA(), auth: { token: 'tok-b', user: 'b' }, ls: { aiapp_data_owner: 'a', omran_hero_b64: 'QUJD' },
    server: [{ id: 'p_1700000000009', title: 'ب', messages: [{ role: 'user', content: 'محادثة ب' }] }] });
  E.ctx.window.chatsSyncOnAuth();
  await settle(30);
  const ids = E.ctx.state.projects.map((p) => p.id);
  assert.ok(!JSON.stringify(E.ctx.state.projects).includes(SECRET_A), 'محادثة (أ) لا تظهر لـ(ب): ' + ids);
  assert.ok(ids.includes('p_1700000000009'), 'ومحادثات (ب) من حسابه');
  assert.ok(!E.server.saves.some((p) => JSON.stringify(p).includes(SECRET_A)), 'ولا تُرفع إلى حساب (ب)');
  assert.equal(E.ls.get('aiapp_data_owner'), 'b');
  assert.ok(!E.ls.has('omran_hero_b64'), 'صورة بطل (أ) مُسحت');
  assert.ok(E.log.includes('push-drop:'), 'واشتراك دفع (أ) على هذا المتصفّح أُلغي: ' + E.log.join(','));
  assert.ok(!E.log.some((x) => x.startsWith('swallow:')), E.log.join(' | '));
});

test('cli-boot-5 — محادثات الضيف (بلا صاحب) تُدمج وتُرفع عند الدخول كما كانت، وصاحب البيانات نفسه لا يُمسح', async () => {
  const G = chatsEnv({ projects: [{ id: 'p_1700000000002', title: 'ضيف', messages: [{ role: 'user', content: 'مسوّدة الضيف' }] }], auth: { token: 'tok-b', user: 'B' } });
  G.ctx.window.chatsSyncOnAuth();
  await settle(30);
  assert.ok(G.server.saves.some((p) => JSON.stringify(p).includes('مسوّدة الضيف')), 'دمج الضيف مقصود');
  assert.equal(G.ls.get('aiapp_data_owner'), 'b', 'الاسم بحروف صغيرة');
  const S = chatsEnv({ projects: projA(), auth: { token: 'tok-a', user: 'a' }, ls: { aiapp_data_owner: 'a' } });
  S.ctx.window.chatsSyncOnAuth();
  await settle(30);
  assert.ok(JSON.stringify(S.ctx.state.projects).includes(SECRET_A), 'صاحب البيانات يعود فيجدها (ما لم يُرفع يُرفع)');
  assert.ok(S.server.saves.some((p) => JSON.stringify(p).includes(SECRET_A)));
  assert.ok(!S.log.includes('push-drop:'));
});

test('cli-boot-5 — الخروج يزيل وسم صاحب البيانات (فالجهاز بعده للضيف)', async () => {
  const E = chatsEnv({ projects: projA(), ls: { aiapp_data_owner: 'a' } });
  assert.equal(await E.ctx.window.chatsLogoutWipe({ silent: true }), true);
  assert.ok(!E.ls.has('aiapp_data_owner'));
});

test('cli-video-1 — مسح الخروج يفرّغ ما في الذاكرة: صورة بطل الفيلم، صور لوحة الترند، ملفّ «كتابة وصوت»', async () => {
  const E = chatsEnv({ projects: projA() });
  assert.equal(await E.ctx.window.chatsLogoutWipe({ silent: true }), true);
  assert.ok(E.log.includes('hero-clear'), 'كان يحذف المفتاحين وحدهما والمتغيّر والمعاينة يبقيان');
  assert.ok(E.log.includes('trends-reset') && E.log.includes('ved-reset'), E.log.join(','));
});

test('cli-video-1 — مداخل المسح نفسها: __clearFilmHero يفرّغ المتغيّر، reset في الترندات والمحرّر', () => {
  const v = read('js/app-11-video.js');
  const hero = v.slice(v.indexOf('clr.onclick = window.__clearFilmHero = () => {'));
  assert.match(hero.slice(0, 200), /filmHeroBase64 = null;/);
  const tr = read('js/app-11-video-trends.js');
  const reset = tr.slice(tr.indexOf('reset: function(){'));
  assert.ok(tr.indexOf('reset: function(){') > 0, 'omranVideoTrends.reset');
  assert.match(reset.slice(0, 400), /photos = \[\];/, 'صور الأشخاص تُفرَّغ');
  assert.match(reset.slice(0, 400), /panel\.innerHTML = '';/, 'واللوحة المفتوحة تُغلق');
  const ve = read('js/video-edit.js');
  assert.match(ve, /window\.omranVideoEdit = \{ open: open, reset: reset \};/);
  const r = ve.slice(ve.indexOf('  function reset(){'));
  assert.ok(ve.indexOf('  function reset(){') > 0);
  assert.match(r.slice(0, 900), /URL\.revokeObjectURL/, 'روابط الفيديو تُلغى');
  assert.match(r.slice(0, 900), /st = stInit\(\);/, 'الحالة من أوّلها');
  assert.match(ve, /window\.addEventListener\('resize', function\(\)\{ if\(M && M\.classList\.contains\('open'\)\)/, 'مستمع المقاس لا يرمي بعد إزالة النافذة');
});
