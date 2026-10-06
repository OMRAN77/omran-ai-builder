// tests/google-login-help.test.cjs — v-google-login-help (لقطة المالك ٦ أكتوبر: بريد Gmail + كلمة مرور ← «اسم المستخدم أو
// الإيميل أو كلمة المرور غير صحيحة»، ثمّ «ابد ٣»): حساب «المتابعة عبر Google» بلا كلمة مرور عندنا ولا فهرس بريد، فدخوله
// بالإيميل يفشل دائمًا و«نسيت كلمة المرور» كان يعِد برابط لا يصل. (١) سطر تحت الخطأ يدلّ على زرّ Google (١٤ لغة، بلا كشف
// البريد)، (٢) «نسيت كلمة المرور» يرسل لبريد حساب Google إرشاد الدخول، (٣) غلاف أندرويد الخام ينهي دخول Google بصفحة
// «ارجع للتطبيق». على معالج auth الحقيقيّ بـKV في الذاكرة وبريد مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

process.env.AUTH_SECRET = 'test-secret-google-login-help';
process.env.UPSTASH_REDIS_REST_URL = 'http://local-test';
process.env.RESEND_API_KEY = 'test-resend';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); }, kvList: async () => [...store.keys()],
  kvIncr: async () => 1, kvExpire: async () => {}, kvIncrBy: async () => 1, kvDecrBy: async () => 1, kvSetIfAbsent: async () => true,
  kvGetRaw: async (k) => store.get(k) || null, kvSetRaw: async (k, v) => store.set(k, v),
} };
const mails = [];
let profileEmail = 'person@gmail.com';
global.fetch = async (url, init) => {
  const u = String(url);
  if (/resend/.test(u)) { mails.push(JSON.parse(init.body)); return new Response('{"id":"m1"}', { status: 200 }); }
  if (/oauth2\.googleapis\.com\/token/.test(u)) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
  if (/oauth2\/v3\/userinfo/.test(u)) return new Response(JSON.stringify({ email: profileEmail, email_verified: true, name: 'Person' }), { status: 200 });
  return new Response('{}', { status: 404 });
};
const auth = require('../api/_lib/auth.js');
const cb = require('../api/_lib/auth-google-callback.js');

async function call(body) {
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await auth({ method: 'POST', headers: {}, body }, res);
  return res;
}
async function googleSignup(email) {
  profileEmail = email;
  const r = { writeHead(c, h) { this.c = c; this.h = h; }, end() {} };
  await cb({ query: { code: 'c', state: 'ab'.repeat(16) } }, r);
  assert.equal(r.c, 302);
  assert.match(r.h.Location, /gtoken=/, 'حساب Google أُنشئ بالكولباك الحقيقيّ');
}

test('١. الجذر كما في اللقطة: حساب Google يفشل دخوله بالإيميل بالرسالة العامّة نفسها', async () => {
  await googleSignup('person@gmail.com');
  const li = await call({ action: 'login', username: 'person@gmail.com', password: 'MyGmailPass1' });
  assert.equal(li.code, 401);
  assert.equal(li.body.error, 'اسم المستخدم أو الإيميل أو كلمة المرور غير صحيحة');
});

test('٢. «نسيت كلمة المرور» لحساب Google: بريد إرشاد لصاحبه، والردّ على الشاشة مطابق للبريد غير المسجَّل', async () => {
  mails.length = 0;
  const g = await call({ action: 'forgotPassword', username: 'Person@Gmail.com' });
  const none = await call({ action: 'forgotPassword', username: 'ghost@example.com' });
  assert.equal(g.code, 200); assert.equal(none.code, 200);
  assert.deepEqual(g.body, none.body, 'لا فرق يكشف البريد المسجَّل (v-account-email)');
  assert.equal(mails.length, 1, 'بريد واحد — لصاحب حساب Google وحده');
  assert.deepEqual(mails[0].to, ['person@gmail.com']);
  assert.match(mails[0].subject, /طريقة دخولك/);
  assert.match(mails[0].html, /المتابعة عبر Google/);
  assert.doesNotMatch(mails[0].html, /resetToken/, 'لا رابط إعادة تعيين لحساب بلا كلمة مرور');
  const gu = await auth.getUser('g_person@gmail.com');
  assert.ok(!gu.resetTokenHash, 'لا رمز إعادة يُحفظ على حساب Google');
});

test('٣. حساب بكلمة مرور يبقى كما كان (رابط إعادة)، وحساب Google المدموج (alias) أو المحذوف', async () => {
  mails.length = 0;
  assert.equal((await call({ action: 'signup', username: 'huda', password: 'pass12345', email: 'huda@example.com' })).code, 200);
  await call({ action: 'forgotPassword', username: 'huda@example.com' });
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /إعادة تعيين كلمة المرور/);
  assert.match(mails[0].html, /resetToken=/);
  // هويّة Google دُمجت في حساب آخر (db/alias كما يقرؤه الكولباك): الدخول بالزرّ يصل الحساب الأساسيّ — فالإرشاد يُرسل
  mails.length = 0;
  await call({ action: 'signup', username: 'sara', password: 'pass12345' });
  store.set('db/alias/g_sara.g@gmail.com', JSON.stringify({ primary: 'sara' }));
  await call({ action: 'forgotPassword', username: 'sara.g@gmail.com', lang: 'en' });
  assert.equal(mails.length, 1);
  assert.deepEqual(mails[0].to, ['sara.g@gmail.com']);
  assert.match(mails[0].subject, /How to sign in/);
  // حساب Google محذوف: لا بريد
  mails.length = 0;
  await googleSignup('gone@gmail.com');
  const gone = await auth.getUser('g_gone@gmail.com'); gone.deleted = true;
  await auth.putUser('g_gone@gmail.com', gone);
  await call({ action: 'forgotPassword', username: 'gone@gmail.com' });
  assert.equal(mails.length, 0);
});

test('٤. الواجهة: سطر Google تحت فشل الدخول بإيميل — بلا نداء خادم إضافيّ، ونبضة على الزرّ', () => {
  const a = read('js/app-01-boot-auth.js');
  assert.ok(a.includes("if(mode === 'login' && res.status === 401 && username.indexOf('@') !== -1) googleLoginHint(); // v-google-login-help"));
  const fn = a.slice(a.indexOf('function googleLoginHint(){'), a.indexOf("const googleBtnEl = $('#authGoogleBtn');"));
  assert.ok(fn.includes("t.authGoogleHint.split('{btn}')") && fn.includes("btnName.textContent = t.authGoogleBtn || 'Google';"), 'اسم الزرّ بلغة الواجهة نفسها');
  assert.ok(fn.includes("document.createElement('bdi')") && fn.includes("btnName.style.whiteSpace = 'nowrap';"), 'معزول الاتّجاه في سطر واحد');
  assert.ok(fn.includes('errBox.appendChild(hint)') && fn.includes('boxShadow'), 'تحت الخطأ ونبضة على الزرّ');
  assert.ok(!/fetch\(/.test(fn), 'لا سؤال للخادم — لا كشف للبريد');
});

test('٥. النصّ بالـ١٤ لغة باسم الزرّ نفسه، ووسم ملفّات اللغات ارتفع', () => {
  const d = read('js/app-03-i18n-data.js');
  const ar = d.match(/authGoogleHint: '([^']+)'/g) || [];
  assert.equal(ar.length, 2, 'العربيّة والإنجليزيّة');
  ar.forEach((x) => assert.ok(x.includes('{btn}')));
  const langs = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
  for (const lg of langs) {
    const s = read('i18n/' + lg + '.js');
    const m = s.match(/\/\* v-google-login-help \*\/ Object\.assign\(I18N\['([a-z]+)'\], (\{.*\})\);/);
    assert.ok(m, lg + ': السطر موجود');
    assert.equal(m[1], lg);
    const o = JSON.parse(m[2]);
    assert.ok(o.authGoogleHint && o.authGoogleHint.includes('{btn}') && /Gmail/.test(o.authGoogleHint), lg);
  }
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=724'"));
});

test('٦. أندرويد الخام (; wv) وحده يأخذ مسار «ارجع للتطبيق» — Chrome والآيفون كما كانا', () => {
  const a = read('js/app-01-boot-auth.js');
  assert.ok(a.includes("androidWrap = /Android/i.test(ua) && /;\\s*wv\\)/.test(ua);"));
  assert.ok(a.includes("window.location.href = gStartUrl + '&app=1';"), 'يبقى في الويب-فيو؛ تحويل جوجل يفتح التبويب الخارجيّ');
  assert.ok(a.includes("window.open(location.origin + gStartUrl + '&app=1', '_blank');"), 'مسار الآيفون كما هو');
  const isWrap = (ua) => /Android/i.test(ua) && /;\s*wv\)/.test(ua);
  assert.equal(isWrap('Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36'), true);
  assert.equal(isWrap('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'), false, 'Chrome/TWA');
  assert.equal(isWrap('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false);
  const ld = read('login-done.html');
  assert.ok(ld.includes('ارجع إلى تطبيق «عمران AI» — اضغط ✕ أعلى هذه الصفحة أو زرّ الرجوع'), 'أندرويد: ✕ أو زرّ الرجوع');
  assert.ok(ld.includes('اسمه أعلى الشاشة بجانب الساعة'), 'الآيفون كما كان');
});
