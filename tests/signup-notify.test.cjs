// tests/signup-notify.test.cjs — v-signup-notify (المالك ١٨ أكتوبر): إيميل للمالك عند كلّ حساب جديد، من المسارات الثلاثة التي تنشئ
// حسابًا (اسم وكلمة مرور، Google، رمز البريد)، مرّة واحدة لكلّ حساب؛ الدخول والتسجيل المرفوض لا يرسلان شيئًا؛ فشل الإيميل أو تعليقه
// لا يوقف التسجيل ولا يؤخّره؛ ولا كلمة مرور ولا رمز في الرسالة. على معالج auth الحقيقيّ وكولباك Google الحقيقيّ وsendMail الحقيقيّ
// (Resend مزيّف بـfetch)؛ Redis وحده في الذاكرة. العنوان هنا وهميّ — عنوان المالك الحقيقيّ في Vercel وحده (المستودع عامّ).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'signup-notify-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
process.env.RESEND_API_KEY = 're_test_key';
process.env.OMRAN_TEST_FAST_SLEEP = '1';
const OWNER = 'owner@example.test';
process.env.OWNER_NOTIFY_EMAIL = OWNER;
delete process.env.MAIL_FROM;

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
let scans = 0;
const tick = () => new Promise((r) => setImmediate(r));
// حاجز الكتابة (الاختبار ٥): كتابة المفتاح المحجوز تنتظر حتّى يصلها n كاتب — أي مرّوا كلّهم فحص «غير موجود» قبل أن يكتب
// أحدهم — أو حتّى يُفتح يدويًّا (انتهى طلب بلا كتابة: يفشل التأكيد بدل أن يعلق الاختبار).
let writeGate = null;
function barrier(key, n) {
  const waiting = [];
  const g = { key, arrived: 0, open: false };
  g.release = () => { g.open = true; waiting.splice(0).forEach((r) => r()); };
  g.arrive = () => { g.arrived++; if (g.open || g.arrived >= n) { g.release(); return Promise.resolve(); } return new Promise((r) => waiting.push(r)); };
  return g;
}
const kvImpl = {
  kvGetJSON: async (k) => { await tick(); return store.has(k) ? JSON.parse(store.get(k)) : null; },
  kvPutJSON: async (k, v) => { await tick(); if (writeGate && k === writeGate.key) await writeGate.arrive(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await tick(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { await tick(); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async () => { await tick(); },
  kvDel: async (k) => { await tick(); store.delete(k); },
  kvList: async (p) => { await tick(); if (p === 'db/users/') scans++; return [...store.keys()].filter((k) => k.startsWith(p)); },
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
const logged = [];
mock('api/_lib/log-error.js', { logError: (scope) => { logged.push(scope); }, logErrorAndFlush: (scope) => { logged.push(scope); } });
mock('api/_lib/_vip.js', { isVip: async () => false });

let mails = [];
let resendMode = 'ok'; // ok | 500 | throw | hang
let profile = { email: 'a@gmail.com', name: 'G' };
global.fetch = async (url, init) => {
  const u = String(url);
  if (u === 'https://api.resend.com/emails') {
    mails.push(JSON.parse(init.body));
    if (resendMode === 'throw') throw new Error('network down');
    if (resendMode === 'hang') return new Promise(() => {});
    return new Response('{"id":"e1"}', { status: resendMode === '500' ? 500 : 200 });
  }
  if (/oauth2\.googleapis\.com\/token/.test(u)) return new Response(JSON.stringify({ access_token: 'AT-SECRET-XYZ' }), { status: 200 });
  if (/oauth2\/v3\/userinfo/.test(u)) return new Response(JSON.stringify(Object.assign({ email_verified: true }, profile)), { status: 200 });
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const googleCb = require(rp('api/_lib/auth-google-callback.js'));
const notify = require(rp('api/_lib/signup-notify.js'));
let pending = [];
notify._seam.waitUntil = (p) => { pending.push(p); };
const drain = async () => { const p = pending; pending = []; await Promise.all(p); };

function reset(env) {
  store.clear(); mails = []; pending = []; logged.length = 0; resendMode = 'ok'; scans = 0;
  process.env.OWNER_NOTIFY_EMAIL = OWNER;
  Object.assign(process.env, env || {});
}
function fakeRes() {
  const r = { code: 0, body: null, headers: null, setHeader() {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.writeHead = (c, h) => { r.code = c; r.headers = h; };
  return r;
}
const HDR = { 'x-forwarded-for': '94.200.1.1', 'x-vercel-ip-country': 'AE' };
async function call(body, headers) { const res = fakeRes(); await auth({ method: 'POST', headers: headers || HDR, body }, res); return res; }
const signup = (username, password, extra) => call(Object.assign({ action: 'signup', username, password: password || 'pass12345' }, extra || {}));
async function otpVerify(email) {
  store.set('db/otp/' + email, JSON.stringify({ otp: '123456', exp: Date.now() + 60000 }));
  return call({ action: 'email-otp-verify', email, otp: '123456' });
}
async function google(p) {
  profile = p;
  const res = fakeRes();
  await googleCb({ query: { code: 'CODE-SECRET-XYZ', state: 'abcdef0123456789' }, headers: HDR }, res);
  return res;
}
const html = (m) => String(m.html);
const users = () => [...store.keys()].filter((k) => k.startsWith('db/users/')).length;

test('١. حساب جديد باسم وكلمة مرور = إيميل واحد للمالك فيه الاسم والطريقة والإيميل والدولة ووقت الإمارات والعدد — بلا كلمة مرور ولا رمز', async () => {
  reset();
  await signup('seed1'); await signup('seed2'); await drain();
  mails = [];
  const r = await signup('Noura_77', 'Secret-Pass-9');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  await drain();
  assert.equal(mails.length, 1, 'إيميل واحد');
  const m = mails[0];
  assert.deepEqual(m.to, [OWNER]);
  assert.match(m.subject, /حساب جديد في عمران AI: Noura_77/);
  const h = html(m);
  for (const s of ['Noura_77', 'اسم مستخدم وكلمة مرور', 'لا يوجد', 'الإمارات العربية المتحدة (AE)', 'وقت التسجيل (الإمارات)', 'إجمالي الحسابات بعد التسجيل']) assert.ok(h.includes(s), 'فيه: ' + s);
  assert.ok(h.includes('<b>' + String(users()) + '</b>'), 'العدد بعد التسجيل = عدد السجلّات (' + users() + ')');
  assert.equal(users(), 3);
  const dubai = new Intl.DateTimeFormat('ar-AE', { timeZone: 'Asia/Dubai', dateStyle: 'full' }).format(new Date());
  assert.ok(h.includes(dubai.split('،')[0]), 'اليوم بتوقيت الإمارات');
  const rec = await auth.getUser('noura_77', 1);
  for (const secret of ['Secret-Pass-9', rec.hash, rec.salt, r.body.token, '94.200.1.1']) assert.ok(!h.includes(secret) && !m.subject.includes(secret), 'لا سرّ في الرسالة');
  assert.ok(store.has('db/notify/new-account/noura_77'), 'علامة «أُبلغ» للحساب');
});

test('٢. تسجيل الدخول لا يرسل، والتسجيل المرفوض لا يرسل (اسم مأخوذ، @ في الاسم، كلمة مرور قصيرة، اسم محجوز، إيميل لغيره)', async () => {
  reset();
  await signup('sara1', 'pass12345', { email: 'sara@example.com' }); await drain();
  assert.equal(mails.length, 1);
  mails = [];
  const li = await call({ action: 'login', username: 'sara1', password: 'pass12345' });
  assert.equal(li.code, 200, JSON.stringify(li.body));
  const rejected = [await signup('sara1'), await signup('sara@x'), await signup('shortpw', 'abc'), await signup('admin'), await signup('other1', 'pass12345', { email: 'sara@example.com' })];
  for (const r of rejected) assert.notEqual(r.code, 200, JSON.stringify(r.body));
  await drain();
  assert.equal(mails.length, 0, 'لا إيميل للدخول ولا للمرفوض');
});

test('٣. Google: حساب جديد = إيميل بالبريد وطريقة Google؛ الدخول ثانيةً لا يرسل؛ فوق حساب محذوف إيميل بملاحظة؛ استعادة سجلّ مقفل لا ترسل', async () => {
  reset();
  const r = await google({ email: 'ali@gmail.com', name: 'Ali <b>X</b>' });
  assert.equal(r.code, 302);
  await drain();
  assert.equal(mails.length, 1);
  const h = html(mails[0]);
  assert.ok(h.includes('ali@gmail.com') && h.includes('<b>Google</b>'), 'البريد والطريقة');
  assert.ok(h.includes('Ali &lt;b&gt;X&lt;/b&gt;') && !h.includes('Ali <b>X</b>'), 'اسم Google يُهرَّب (HTML)');
  assert.ok(h.includes('المفتاح: g_ali@gmail.com'));
  for (const s of ['AT-SECRET-XYZ', 'CODE-SECRET-XYZ', 'abcdef0123456789', 'csec']) assert.ok(!h.includes(s) && !mails[0].subject.includes(s), 'لا رمز Google ولا state ولا السرّ: ' + s);
  mails = [];
  await google({ email: 'ali@gmail.com', name: 'Ali' }); await drain();
  assert.equal(mails.length, 0, 'دخول Google لحساب قائم');
  // فوق حساب محذوف بالمفتاح نفسه: سجلّ جديد بهديّة جديدة = حساب جديد
  await auth.putUser('g_old@gmail.com', { deleted: true, deletedAt: 1 });
  await google({ email: 'old@gmail.com', name: 'Old' }); await drain();
  assert.equal(mails.length, 1);
  assert.ok(html(mails[0]).includes('فوق حساب محذوف بالمفتاح نفسه'));
  // سجلّ لا يُفكّ (سرّ ضاع): صاحب البريد يستعيده — ليس حسابًا جديدًا
  mails = [];
  await google({ email: 'sealed@gmail.com', name: 'S' }); await drain();
  assert.equal(mails.length, 1);
  mails = [];
  for (const k of [...store.keys()]) if (k.startsWith('db/notify/')) store.delete(k);
  const prev = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'another-secret-after-loss';
  try {
    const rr = await google({ email: 'sealed@gmail.com', name: 'S' });
    assert.equal(rr.code, 302);
    assert.match(rr.headers.Location, /gtoken=/, 'استُعيد فعلًا (لا تحويل خطأ)');
    assert.doesNotMatch(rr.headers.Location, /gerror=|error=/);
    await drain();
    assert.equal(mails.length, 0, 'الاستعادة لا ترسل ولو غابت علامة «أُبلغ»');
  } finally { process.env.AUTH_SECRET = prev; }
});

test('٤. رمز البريد: حساب جديد = إيميل بالبريد؛ الدخول برمز لحساب قائم لا يرسل؛ تغيير الاسم لا يرسل', async () => {
  reset();
  const r = await otpVerify('mona@example.com');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.isNew, true);
  await drain();
  assert.equal(mails.length, 1);
  assert.ok(html(mails[0]).includes('mona@example.com') && html(mails[0]).includes('رمز البريد (بدون كلمة مرور)'));
  assert.ok(!html(mails[0]).includes('123456'), 'لا الرمز');
  mails = [];
  const again = await otpVerify('mona@example.com');
  assert.equal(again.body.isNew, false);
  await signup('renamer1'); await drain(); mails = [];
  const tok = (await call({ action: 'login', username: 'renamer1', password: 'pass12345' })).body.token;
  const rn = await call({ action: 'changeUsername', token: tok, newUsername: 'renamer2' });
  assert.equal(rn.code, 200, JSON.stringify(rn.body));
  assert.ok(await auth.getUser('renamer2', 1), 'الاسم الجديد كُتب (مفتاح جديد) — ومع ذلك ليس حسابًا جديدًا');
  await drain();
  assert.equal(mails.length, 0, 'دخول برمز وتغيير اسم = لا إيميل');
});

test('٥. تسجيلان متزامنان بالاسم نفسه = إيميل واحد (الكتابة ليست SET NX — العلامة هي التي تمنع الثاني)', async () => {
  reset();
  // السباق مفروض لا متروك للتوقيت: كان الأوّل يسبق أحيانًا إلى الكتابة قبل فحص الثاني فيُردّ الثاني ٤٠٩ (CI على #1163).
  // الحاجز يمسك كتابة السجلّ حتّى يصلها التسجيلان، فيمرّ كلاهما فحص «غير موجود» قبل أيّ كتابة في كلّ تشغيل.
  const gate = writeGate = barrier(auth.userPath('twin1'), 2);
  let a, b;
  try {
    const one = () => signup('twin1').finally(() => gate.release());
    [a, b] = await Promise.all([one(), one()]);
  } finally { writeGate = null; }
  assert.deepEqual([a.code, b.code], [200, 200], 'السباق حقيقيّ: كلاهما مرّ فحص «غير موجود» وكتب');
  await drain();
  assert.equal(mails.length, 1, 'العلامة تمنع الإيميل الثاني');
});

test('٦. فشل الإيميل لا يوقف التسجيل ولا يؤخّره: ٥٠٠ ورمي وتعليق بلا ردّ — الحساب يُنشأ والردّ ٢٠٠ فورًا', async () => {
  for (const mode of ['500', 'throw', 'hang']) {
    reset();
    resendMode = mode;
    const t0 = Date.now();
    const r = await signup('fail_' + mode);
    assert.equal(r.code, 200, mode + ': ' + JSON.stringify(r.body));
    assert.ok(r.body.token, 'جلسة صالحة');
    assert.ok(Date.now() - t0 < 1000, mode + ': لا ينتظر الإيميل');
    assert.ok(await auth.getUser('fail_' + mode, 1), 'الحساب موجود');
    if (mode !== 'hang') { await drain(); assert.ok(logged.includes('signup-notify:send') || logged.includes('auth:mail'), mode + ': الفشل يُسجَّل'); }
  }
  // بلا waitUntil (خارج Vercel): انتظار محدود ثمّ يكمل الردّ ولو علّق Resend
  const seam = notify._seam.waitUntil;
  notify._seam.waitUntil = null;
  try {
    reset();
    resendMode = 'hang';
    const t0 = Date.now();
    const r = await signup('nowait1');
    assert.equal(r.code, 200);
    assert.ok(Date.now() - t0 < 3000, 'الحدّ ١٫٢ ث لا أكثر');
  } finally { notify._seam.waitUntil = seam; }
});

test('٧. بلا OWNER_NOTIFY_EMAIL (أو بلا مفتاح Resend): لا نداء لـResend ولا علامة — والتسجيل كما هو', async () => {
  reset({ OWNER_NOTIFY_EMAIL: '' });
  const r = await signup('quiet1');
  assert.equal(r.code, 200);
  await drain();
  assert.equal(mails.length, 0);
  assert.ok(![...store.keys()].some((k) => k.startsWith('db/notify/')));
  assert.equal(await notify.notifyNewAccount({ key: 'x', user: { username: 'x' } }), 'off');
});

test('٨. المسارات الثلاثة وحدها تنادي المُبلِّغ، بعد putUser، وعنوان المالك لا يُكتب في الكود', () => {
  const fs = require('node:fs');
  const a = fs.readFileSync(rp('api/_lib/auth.js'), 'utf8');
  const g = fs.readFileSync(rp('api/_lib/auth-google-callback.js'), 'utf8');
  const calls = (s) => (s.match(/await notifyNewAccount\(/g) || []).length;
  assert.equal(calls(a), 2, 'auth.js: كلمة المرور ورمز البريد');
  assert.equal(calls(g), 1, 'Google');
  assert.ok(a.indexOf("method: 'password'") > a.indexOf('await putUser(key, user);'));
  assert.ok(a.indexOf("method: 'email-otp'") > a.indexOf('await putUser(userKey, user);'));
  assert.ok(g.indexOf("method: 'google'") > g.indexOf('await putUser(key, user);'));
  const lib = fs.readFileSync(rp('api/_lib/signup-notify.js'), 'utf8');
  assert.match(lib, /process\.env\.OWNER_NOTIFY_EMAIL/);
  assert.doesNotMatch(lib + a + g, /@gmail\.com['"]/, 'لا عنوان حقيقيّ في الكود');
});

test('٩. Google: حساب أُنشئ ثمّ حُذف ثمّ أُعيد إنشاؤه بعد دقائق = إيميل ثانٍ بالملاحظة (العلامة لا تبتلعه)، والسطر الجديد في العنوان لا يكسر الموضوع', async () => {
  reset();
  await google({ email: 'zed@gmail.com', name: 'Zed' }); await drain();
  assert.equal(mails.length, 1);
  const mark = 'db/notify/new-account/' + encodeURIComponent('g_zed@gmail.com');
  store.set(mark, String(Date.now() - 5 * 60000)); // الإنشاء الأوّل قبل خمس دقائق (العلامة ما زالت حيّة ساعة)
  const u = await auth.getUser('g_zed@gmail.com', 1);
  u.deleted = true; await auth.putUser('g_zed@gmail.com', u); // كما يحذف المالك (admin-actions)
  mails = [];
  await google({ email: 'zed@gmail.com', name: 'Zed' }); await drain();
  assert.equal(mails.length, 1, 'إعادة الإنشاء حساب جديد');
  assert.ok(html(mails[0]).includes('فوق حساب محذوف بالمفتاح نفسه'));
  mails = [];
  await google({ email: 'crlf@gmail.com', name: 'A\r\nBcc: x@y.test' }); await drain();
  assert.equal(mails.length, 1);
  assert.doesNotMatch(mails[0].subject, /[\r\n]/, 'لا حقن ترويسة في الموضوع');
});

test('١٠. العدد عدّاد: عشرة تسجيلات = مسح واحد لـRedis (البذرة) لا عشرة، والعدد صحيح بعد كلّ واحد', async () => {
  reset();
  for (let i = 0; i < 10; i++) { await signup('cnt' + i); await drain(); }
  assert.equal(scans, 1, 'مسح واحد للبذرة');
  assert.equal(mails.length, 10);
  for (let i = 0; i < 10; i++) assert.ok(html(mails[i]).includes('<b>' + (i + 1) + '</b>'), 'العدد بعد التسجيل ' + (i + 1));
});

test('١١. على Vercel: waitUntil المنصّة يستلم الإرسال فيرجع التسجيل فورًا ولو علّق Resend (بلا بذرة الاختبار)', async () => {
  reset();
  resendMode = 'hang';
  const seam = notify._seam.waitUntil, sym = Symbol.for('@vercel/request-context');
  const got = [];
  const ctx = { waitUntil(p) { assert.equal(this, ctx, 'this محفوظ'); got.push(p); } };
  notify._seam.waitUntil = null;
  globalThis[sym] = { get: () => ctx };
  try {
    const t0 = Date.now();
    const r = await signup('vercel1');
    assert.equal(r.code, 200);
    assert.ok(Date.now() - t0 < 600, 'لا انتظار الحدّ ١٫٢ ث');
    assert.equal(got.length, 1);
    assert.equal(typeof got[0].then, 'function');
  } finally { delete globalThis[sym]; notify._seam.waitUntil = seam; }
});
