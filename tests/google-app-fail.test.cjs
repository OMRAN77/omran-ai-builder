'use strict';
/* v-google-app-fail (المالك ٢ أكتوبر: «طلعت من الحساب وارجع مره ثانيه مايدخلني» + فيديو آيفون):
   ١) نبضة جسر الآيفون كانت تتوقّف بعد ٣ث من الإقلاع إن لم يكن دخول معلّق، فمن خرج ثمّ ضغط جوجل
      بلا إعادة فتح التطبيق بقي معلّقًا على أحداث تركيز لا يطلقها الغلاف دائمًا — الآن يعيدها الزرّ.
   ٢) فشل الدخول في سفاري كان يهبط على نسخة الموقع كضيف بشاشة دخول فارغة (الزرّ #headerLoginBtn
      غير موجود) — الآن صفحة «تعذّر… ارجع وحاول»، والسبب يصل للتطبيق عبر الجسر. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'gaf-secret';

const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
} };
global.fetch = async () => ({ ok: false, json: async () => ({ error: 'invalid_grant' }) });

const cb = require('../api/_lib/auth-google-callback.js');
const claim = require('../api/_lib/oauth-claim.js');
const mkRes = () => { const r = { code: 0, headers: null, j: null }; r.writeHead = (c, h) => { r.code = c; r.headers = h; }; r.end = () => {}; r.status = (c) => { r.code = c; return r; }; r.json = (j) => { r.j = j; return r; }; return r; };
const ST = 'ab'.repeat(16);

test('١. فشل مسار الآيفون: سفاري على صفحة «تعذّر» والسبب مودع للتطبيق — يُسلَّم مرّة', async () => {
  store.clear();
  const r = mkRes();
  await cb({ query: { code: 'c', state: ST + '-app' } }, r);
  assert.equal(r.code, 302);
  assert.equal(r.headers.Location, 'https://example.test/login-done.html?gerror=token_exchange_failed');
  const c1 = mkRes();
  await claim({ method: 'POST', body: { state: ST } }, c1);
  assert.equal(c1.code, 200);
  assert.deepEqual(c1.j, { error: 'token_exchange_failed' });
  const c2 = mkRes();
  await claim({ method: 'POST', body: { state: ST } }, c2);
  assert.equal(c2.code, 404, 'استلام واحد');
});

test('٢. عودة مكرّرة بعد نجاح مودع لا تكتب فوقه، وسفاري يبقى على «تم»', async () => {
  store.clear();
  store.set('db/oauth-claim/' + ST, JSON.stringify({ token: 'tok', user: 'u', ts: Date.now() }));
  const r = mkRes();
  await cb({ query: { error: 'access_denied', state: ST + '-app' } }, r);
  assert.equal(r.headers.Location, 'https://example.test/login-done.html');
  const c = mkRes();
  await claim({ method: 'POST', body: { state: ST } }, c);
  assert.equal(c.j.token, 'tok');
});

test('٣. المسار العاديّ (متصفّح) كما هو: ?gerror على الموقع ولا إيداع', async () => {
  store.clear();
  const r = mkRes();
  await cb({ query: { error: 'access_denied', state: ST } }, r);
  assert.equal(r.headers.Location, 'https://example.test/?gerror=access_denied');
  assert.equal(store.size, 0);
});

test('٤. العميل: الزرّ يعيد تشغيل النبضة، والجسر يعرض الفشل، والخطأ يفتح شاشة الدخول فعلًا — والحزمة محدَّثة', () => {
  for (const f of ['js/app-01-boot-auth.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(!s.includes("$('#headerLoginBtn')"), f + ': لا زرّ وهميّ');
    const click = s.indexOf("localStorage.setItem('aiapp_oauth_pending'");
    assert.ok(s.indexOf('window.__armOauthClaim()', click) - click < 200, f + ': الزرّ يعيد النبضة');
    assert.ok(s.includes('window.__armOauthClaim = arm;'), f);
    assert.ok(s.includes("document.addEventListener('resume', claim);"), f);
    assert.ok(s.includes('else if(d && d.error) claimFail(d.error);') && s.includes('showGoogleAuthError(String(err));'), f + ': الجسر يعرض السبب');
    const fn = s.slice(s.indexOf('function showGoogleAuthError('));
    assert.ok(fn.slice(0, 2500).includes("setMode('login'); showOverlay();"), f + ': يفتح الشاشة');
  }
  const ld = read('login-done.html');
  assert.ok(ld.includes("get('gerror')") && ld.includes('تعذّر إكمال الدخول بجوجل'));
});
