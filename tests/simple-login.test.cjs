// tests/simple-login.test.cjs — v-simple-login (قرار المالك ٢٦ سبتمبر): شاشة دخول بسيطة
// (خانة «اسم المستخدم أو الإيميل» + كلمة المرور + زرّ + «نسيت كلمة المرور» ثمّ جوجل و«إنشاء حساب جديد»)،
// بلا الإيميل الاختياريّ في التسجيل، والخادم يقبل الإيميل مكان الاسم.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

process.env.AUTH_SECRET = 'test-secret-simple-login';
process.env.UPSTASH_REDIS_REST_URL = 'http://local-test';
const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); },
  kvList: async () => [...store.keys()],
  kvIncr: async () => 1, kvExpire: async () => {}, kvIncrBy: async () => 1,
  kvDecrBy: async () => 1, kvSetIfAbsent: async () => true,
  kvGetRaw: async (k) => store.get(k) || null, kvSetRaw: async (k, v) => store.set(k, v),
} };
const auth = require('../api/_lib/auth.js');

async function call(body) {
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await auth({ method: 'POST', headers: {}, body }, res);
  return res;
}

test('الخادم: الدخول بالإيميل أو الاسم، والخطأ واحد للحالتين', async () => {
  const su = await call({ action: 'signup', username: 'Sara', password: 'pass12345', email: 'Sara@Example.com' });
  assert.equal(su.code, 200, JSON.stringify(su.body));
  const byName = await call({ action: 'login', username: 'sara', password: 'pass12345' });
  assert.equal(byName.code, 200);
  const byEmail = await call({ action: 'login', username: '  SARA@example.com ', password: 'pass12345' });
  assert.equal(byEmail.code, 200, JSON.stringify(byEmail.body));
  assert.equal(byEmail.body.username, 'Sara');
  assert.equal(auth.verifyToken(byEmail.body.token), 'sara', 'الرمز لاسم الحساب لا للإيميل');
  const bad = await call({ action: 'login', username: 'sara@example.com', password: 'wrongpass1' });
  assert.equal(bad.code, 401);
  const none = await call({ action: 'login', username: 'nobody@example.com', password: 'pass12345' });
  assert.equal(none.code, 401);
  assert.equal(none.body.error, bad.body.error, 'لا يكشف هل الإيميل مسجَّل');
});

test('الخادم: اسم مستخدم فيه @ يُقدَّم على فهرس الإيميل', async () => {
  await call({ action: 'signup', username: 'ali@home.com', password: 'alipass123' });
  await call({ action: 'signup', username: 'other', password: 'otherpass1', email: 'ali@home.com' });
  const r = await call({ action: 'login', username: 'ali@home.com', password: 'alipass123' });
  assert.equal(r.code, 200);
  assert.equal(r.body.username, 'ali@home.com');
});

test('الخادم: نسيت كلمة المرور يقبل الإيميل أيضًا', async () => {
  const src = read('api/_lib/auth.js');
  assert.match(src, /if \(action === 'forgotPassword'\) \{[\s\S]*?const \{ key, user \} = await resolveLoginUser\(username\);/);
  assert.match(src, /if \(action === 'login'\) \{[\s\S]*?const \{ key, user \} = await resolveLoginUser\(username\);/);
  const r = await call({ action: 'forgotPassword', username: 'ghost@example.com' });
  assert.equal(r.code, 404);
});

test('الواجهة: خانة واحدة وكلمة مرور وزرّ ورابط، ثمّ جوجل و«إنشاء حساب جديد» — بلا إيميل اختياريّ ولا زرّ الإيميل', () => {
  const h = read('js/partials-core.js');
  const ov = h.slice(h.indexOf('<div id="authOverlay"'), h.indexOf('<div id="authRecoveryModal"'));
  assert.ok(!/id="authEmailRow"|id="authEmail"|authEmailLabel/.test(ov), 'الإيميل الاختياريّ محذوف');
  assert.ok(!/id="authEmailOtpBtn"/.test(ov), 'زرّ «الدخول بالإيميل» محذوف');
  assert.ok(!/data-i18n="authTitle"|data-i18n="authSubtitle"|authOrDivider/.test(ov), 'بلا عنوان ولا «أو»');
  assert.match(ov, /id="authUsername"[^>]*data-i18n-placeholder="authIdPlaceholder"/);
  assert.match(ov, /id="authPassword"[^>]*data-i18n-placeholder="authPasswordLabel"/);
  const order = ['id="authUsername"', 'id="authPassword"', 'id="authSubmitBtn"', 'id="authForgotLink"', 'id="authGoogleBtn"', 'id="authSwitchBtn"'].map((k) => ov.indexOf(k));
  assert.ok(order.every((i, j) => i > 0 && (j === 0 || i > order[j - 1])), 'الترتيب كما في لقطة المالك: ' + order);
  assert.match(ov, /id="authRememberRow" style="display:none;"><input type="checkbox" id="authRememberMe" checked>/, '«تذكّرني» مخفيّ ومفعّل');
  assert.ok(read('index.html').includes('/js/partials-core.js?v=645'));
});

test('الواجهة: setMode يبدّل بزرّ واحد، والتبويبات مخفيّة دائمًا', () => {
  const a = read('js/app-01-boot-auth.js');
  assert.ok(!/emailRow/.test(a));
  assert.match(a, /if\(authSwitchBtn\) authSwitchBtn\.onclick = \(\) => setMode\(mode === 'signup' \? 'login' : 'signup'\);/);
  assert.match(a, /if\(switchBtn\) switchBtn\.textContent = m === 'signup' \? t\.authHaveAccount : t\.authCreateAccount;/);
  assert.match(a, /if\(altBlock\) altBlock\.style\.display = \(m === 'login' \|\| m === 'signup'\) \? 'flex' : 'none';/);
  const setMode = a.slice(a.indexOf('  function setMode(m){'), a.indexOf("  tabLogin.onclick = () => setMode('login');"));
  assert.ok(setMode.length > 500 && !/tabsRow\.style\.display = 'flex'/.test(setMode), 'setMode لا يُظهر التبويبات');
  assert.match(a, /const otpBtn = \$\('#authEmailOtpBtn'\);[\s\S]{0,600}?if\(!otpBtn \|\| !otpSection\) return;/, 'نظام الرمز يسكت بغياب زرّه');
});

test('النصوص الجديدة بالـ١٤ لغة', () => {
  const ar = read('js/app-03-i18n-data.js');
  for (const k of ['authIdPlaceholder', 'authCreateAccount', 'authHaveAccount', 'authSubmitForgotEmail']) {
    assert.equal((ar.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, 'ar/en: ' + k);
  }
  assert.ok(ar.includes('authIdPlaceholder: "اسم المستخدم أو الإيميل"') && ar.includes('authCreateAccount: "Create new account"'));
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const s = read('i18n/' + l + '.js');
    for (const k of ['authIdPlaceholder', 'authCreateAccount', 'authHaveAccount', 'authSubmitForgotEmail']) assert.match(s, new RegExp('"?' + k + '"?:\\s*"[^"]+"'), l + ': ' + k);
  }
  assert.match(read('js/app-04-i18n-state.js'), /i18n\/' \+ lg \+ '\.js\?v=698'/);
});
