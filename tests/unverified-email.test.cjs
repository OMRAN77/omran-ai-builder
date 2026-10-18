// tests/unverified-email.test.cjs — v-unverified-email (أمر المالك ١٨ أكتوبر): «صلّح الحسابات القديمة بدون ما تمسح شي الحين:
// ١) الدخول واسترجاع الحساب بالإيميل يشتغلون بس على إيميل متأكَّد. لو الإيميل غير متأكَّد، اكتب: «هذا الإيميل غير مؤكَّد، ادخل باسم
// المستخدم وأكّده من حسابي». ٢) أي حساب إيميله غير متأكَّد، أول ما يدخل يطلع له تنبيه «أكّد إيميلك» وزرّ يرسل الكود. ٣) بعد ٣٠ يوم،
// الإيميل اللي ما تأكّد ينشال من الحساب تلقائيًا، والحساب نفسه يبقى. ٤) اختبار: زارع عنده إيميل غير متأكَّد، وصاحب الإيميل يسوّي
// استرجاع، فما يدخل حساب الزارع». على المعالجات الحقيقيّة (auth، auth-google-callback، email-sweep)؛ Redis في الذاكرة، والبريد مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'unverified-email-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.RESEND_API_KEY = 're_test_dummy';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
process.env.OMRAN_TEST_FAST_SLEEP = '1';
delete process.env.CRON_SECRET;
delete process.env.ALLOW_EMAIL_AUTOLINK;
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const mail = []; // كلّ رسالة خرجت: {to, subject, html}
let googleProfile = null;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (/resend\.com/.test(u)) {
    const b = JSON.parse(opts.body);
    mail.push({ to: b.to[0], subject: b.subject, html: String(b.html) });
    return new Response('{"id":"m"}', { status: 200 });
  }
  if (u.includes('oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'at' }) };
  if (u.includes('googleapis.com/oauth2/v3/userinfo')) return { ok: true, json: async () => googleProfile };
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const googleCb = require(rp('api/_lib/auth-google-callback.js'));
const sweep = require(rp('api/_lib/email-sweep.js'));

const call = (body, ip) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  Promise.resolve(auth({ method: 'POST', headers: { 'x-forwarded-for': ip || '7.7.7.7' }, query: {}, body }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
const runSweep = (headers, method) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); } };
  Promise.resolve(sweep({ method: method || 'GET', headers: headers || {}, query: {} }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
const user = (name) => auth.getUser(name, 1);
const mailTo = (to) => mail.filter((m) => m.to === to);
const codeIn = (m) => (m && (m.html.match(/>(\d{6})</) || [])[1]) || null;
const DAY = 24 * 60 * 60 * 1000;
const PASS = 'pass12345';
const AR = 'هذا الإيميل غير مؤكَّد، ادخل باسم المستخدم وأكّده من حسابي';

async function signup(name) {
  const r = await call({ action: 'signup', username: name, password: PASS });
  assert.equal(r.status, 200, name + ' ' + JSON.stringify(r.body));
  return r.body.token;
}
// إيميل زُرع قبل اليوم بلا تحقّق — كما كتبه التسجيل أو setEmail القديمان: البريد في السجلّ وفهرسه، بلا ختم.
async function plant(name, email, extra) {
  const rec = await user(name);
  await auth.putUser(name, Object.assign({}, rec, { email }, extra || {}));
  store.set('db/email-index/' + email, JSON.stringify({ username: name, at: Date.now() }));
}
async function confirmFromAccount(token, email) {
  const r = await call({ action: 'email-otp-request', purpose: 'change', token, email, lang: 'ar' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const code = codeIn(mailTo(email).slice(-1)[0]);
  return call({ action: 'email-otp-verify', purpose: 'change', token, email, otp: code, lang: 'ar' });
}
const unverified = (r) => r.status === 403 && r.body.code === 'email_unverified';

test('١. (اختبار المالك) زارع بإيميل غير مؤكَّد، وصاحب الإيميل يسترجع — لا يدخل حساب الزارع من أيّ باب', async () => {
  await signup('planter');
  await plant('planter', 'owner@real.com');
  const before = await user('planter');
  mail.length = 0;
  // الاسترجاع بالإيميل: رسالة المالك، ولا رابط، ولا رسالة إلى صندوقه
  const byEmail = await call({ action: 'forgotPassword', username: 'owner@real.com', lang: 'ar' }, '9.0.0.1');
  assert.ok(unverified(byEmail), JSON.stringify(byEmail));
  assert.equal(byEmail.body.error, AR);
  // والاسترجاع باسم الزارع: الرابط كان يذهب للبريد غير المؤكَّد — أي لصاحبه
  const byName = await call({ action: 'forgotPassword', username: 'planter', lang: 'ar' }, '9.0.0.2');
  assert.ok(unverified(byName), JSON.stringify(byName));
  assert.equal(mail.length, 0, 'لا رابط استرجاع خرج');
  assert.equal((await user('planter')).resetTokenHash, before.resetTokenHash, 'لا رمز استرجاع في سجلّ الزارع');
  // الدخول برمز البريد: لا رمز يصل، ورمز صدر قبل النشر لا يفتح الحساب
  const otpReq = await call({ action: 'email-otp-request', email: 'owner@real.com', lang: 'ar' }, '9.0.0.3');
  assert.ok(unverified(otpReq), JSON.stringify(otpReq));
  assert.equal(mail.length, 0, 'لا رمز دخول خرج');
  store.set('db/otp/owner@real.com', JSON.stringify({ otp: '123456', exp: Date.now() + 60000, n: 'aaaaaaaaaaaa' }));
  const otpVer = await call({ action: 'email-otp-verify', email: 'owner@real.com', otp: '123456', lang: 'ar' }, '9.0.0.3');
  assert.ok(unverified(otpVer), JSON.stringify(otpVer));
  assert.equal(otpVer.body.token, undefined, 'لا جلسة');
  // ولا يُنشئ له حسابًا جديدًا بالبريد نفسه
  assert.equal(JSON.parse(store.get('db/email-index/owner@real.com')).username, 'planter');
  // Google بالربط التلقائيّ (إن فُعّل) يذهب لحساب g_ الخاصّ لا للزارع
  process.env.ALLOW_EMAIL_AUTOLINK = '1';
  try {
    googleProfile = { email: 'owner@real.com', email_verified: true, name: 'Owner' };
    let loc = '';
    await googleCb({ method: 'GET', headers: { 'x-forwarded-for': '9.0.0.4' }, query: { code: 'c', state: 'a'.repeat(32) } },
      { setHeader() {}, writeHead(s, h) { loc = (h && h.Location) || ''; }, end() {}, status() { return this; }, json() {} });
    const tok = new URL(loc, 'https://x.test').searchParams.get('gtoken');
    assert.equal(auth.verifyToken(tok), 'g_owner@real.com', 'حساب Google الخاصّ لا الزارع');
  } finally { delete process.env.ALLOW_EMAIL_AUTOLINK; }
  // الحساب المزروع كما هو
  const after = await user('planter');
  assert.equal(after.email, 'owner@real.com');
  assert.equal(after.verifiedEmail, undefined);
  assert.equal(after.hash, before.hash, 'كلمة مروره لم تتغيّر');
});

test('٢. الدخول بإيميل غير مؤكَّد: كلمة صحيحة = رسالة المالك بلا جلسة؛ كلمة خاطئة = «غير صحيحة» كما كانت؛ وباسم المستخدم يدخل', async () => {
  await signup('legacy2');
  await plant('legacy2', 'legacy2@mail.com');
  const right = await call({ action: 'login', username: 'legacy2@mail.com', password: PASS, lang: 'ar' }, '9.1.0.1');
  assert.ok(unverified(right), JSON.stringify(right));
  assert.equal(right.body.error, AR);
  assert.equal(right.body.token, undefined);
  const wrong = await call({ action: 'login', username: 'legacy2@mail.com', password: 'nope-nope', lang: 'ar' }, '9.1.0.1');
  assert.equal(wrong.status, 401, 'من لا يعرف الكلمة لا يعرف أنّ البريد على حساب');
  const en = await call({ action: 'login', username: 'legacy2@mail.com', password: PASS, lang: 'en' }, '9.1.0.1');
  assert.match(en.body.error, /not confirmed/);
  const byName = await call({ action: 'login', username: 'legacy2', password: PASS, lang: 'ar' }, '9.1.0.1');
  assert.equal(byName.status, 200);
  assert.equal(auth.verifyToken(byName.body.token), 'legacy2');
});

test('٣. الإيميل المؤكَّد يعمل كما كان: الدخول به، ورابط الاسترجاع، ورمز الدخول', async () => {
  const tok = await signup('good3');
  assert.equal((await confirmFromAccount(tok, 'good3@mail.com')).status, 200);
  const login = await call({ action: 'login', username: 'good3@mail.com', password: PASS, lang: 'ar' }, '9.2.0.1');
  assert.equal(login.status, 200);
  assert.equal(auth.verifyToken(login.body.token), 'good3');
  assert.equal(login.body.emailToConfirm, null, 'لا تنبيه لمؤكَّد');
  mail.length = 0;
  assert.equal((await call({ action: 'forgotPassword', username: 'good3@mail.com', lang: 'ar' }, '9.2.0.2')).status, 200);
  assert.equal(mailTo('good3@mail.com').length, 1, 'رابط الاسترجاع وصل');
  assert.ok((await user('good3')).resetTokenHash);
  assert.equal((await call({ action: 'forgotPassword', username: 'good3', lang: 'ar' }, '9.2.0.3')).status, 200, 'وباسمه');
  assert.equal((await call({ action: 'email-otp-request', email: 'good3@mail.com', lang: 'ar' }, '9.2.0.4')).status, 200);
  const otp = await call({ action: 'email-otp-verify', email: 'good3@mail.com', otp: codeIn(mailTo('good3@mail.com').slice(-1)[0]), lang: 'ar' }, '9.2.0.4');
  assert.equal(otp.status, 200);
  assert.equal(auth.verifyToken(otp.body.token), 'good3');
});

test('٤. «أكّد إيميلك»: الدخول والتحقّق عند الفتح يعيدان البريد غير المؤكَّد ويبدأ عدّاده؛ بعد التأكيد بالرمز لا تنبيه', async () => {
  const t0 = Date.now();
  await signup('alert4');
  await plant('alert4', 'alert4@mail.com');
  const login = await call({ action: 'login', username: 'alert4', password: PASS }, '9.3.0.1');
  assert.equal(login.body.emailToConfirm, 'alert4@mail.com');
  const mark = (await user('alert4')).emailUnverified;
  assert.equal(mark.email, 'alert4@mail.com');
  assert.ok(mark.since >= t0 && mark.since <= Date.now(), 'العدّاد يبدأ أوّل ما يُرى');
  const v = await call({ action: 'verify', token: login.body.token }, '9.3.0.1');
  assert.equal(v.body.emailToConfirm, 'alert4@mail.com');
  assert.equal((await user('alert4')).emailUnverified.since, mark.since, 'الفتح الثاني لا يعيد العدّاد');
  // getProfile: «حسابي» يقول غير مؤكَّد
  assert.equal((await call({ action: 'getProfile', token: login.body.token })).body.emailVerified, false);
  // زرّ «أرسل الكود» = طلب التغيير بالبريد نفسه، ثمّ الرمز
  assert.equal((await confirmFromAccount(login.body.token, 'alert4@mail.com')).status, 200);
  const after = await user('alert4');
  assert.equal(after.verifiedEmail, 'alert4@mail.com');
  assert.equal(after.emailUnverified, undefined, 'التأكيد يمسح العدّاد');
  assert.equal((await call({ action: 'verify', token: login.body.token })).body.emailToConfirm, null);
  assert.equal((await call({ action: 'login', username: 'alert4@mail.com', password: PASS }, '9.3.0.2')).status, 200, 'والدخول بالإيميل صار يعمل');
});

test('٥. ٣٠ يومًا: اليوم ٢٩ يبقى؛ بعد الثلاثين يُشال البريد وفهرسه والحساب كلّه باقٍ — ولا شيء يُشال يوم النشر', async () => {
  await signup('old5');
  await plant('old5', 'old5@mail.com', { points: 123 });
  const now = Date.now();
  // أوّل رؤية (يوم النشر): يبدأ العدّاد فقط
  let r = await auth.settleUnverifiedEmail('old5', await user('old5'), now);
  assert.equal(r.state, 'pending');
  assert.equal(r.removeAt, now + 30 * DAY);
  assert.equal((await user('old5')).email, 'old5@mail.com', 'لا شيء يُشال اليوم');
  r = await auth.settleUnverifiedEmail('old5', await user('old5'), now + 29 * DAY);
  assert.equal(r.state, 'pending');
  assert.equal((await user('old5')).email, 'old5@mail.com');
  r = await auth.settleUnverifiedEmail('old5', await user('old5'), now + 30 * DAY + 1);
  assert.equal(r.state, 'removed');
  const after = await user('old5');
  assert.equal(after.email, null, 'البريد انشال');
  assert.equal(after.emailUnverified, undefined);
  assert.equal(after.points, 123, 'الحساب نفسه باقٍ');
  assert.equal(after.username, 'old5');
  assert.equal(store.has('db/email-index/old5@mail.com'), false, 'وفهرسه');
  assert.equal((await call({ action: 'login', username: 'old5', password: PASS }, '9.4.0.1')).status, 200, 'يدخل باسمه');
  assert.equal((await call({ action: 'verify', token: auth.makeToken('old5') })).body.emailToConfirm, null, 'لا تنبيه بعدها');
});

test('٦. صاحب الإيميل يؤكّده من حسابه هو: الفهرس ينتقل له ويدخل به؛ وشيل نسخة الزارع بعد ٣٠ يومًا لا يمسّ فهرسه', async () => {
  await signup('planter6');
  await plant('planter6', 'real6@mail.com');
  const realTok = await signup('real6');
  assert.equal((await confirmFromAccount(realTok, 'real6@mail.com')).status, 200, 'نسخة الزارع غير المؤكَّدة لا تحجزه');
  assert.equal(JSON.parse(store.get('db/email-index/real6@mail.com')).username, 'real6');
  const login = await call({ action: 'login', username: 'real6@mail.com', password: PASS }, '9.5.0.1');
  assert.equal(auth.verifyToken(login.body.token), 'real6', 'الدخول بالإيميل يصل صاحبه');
  // نسخة الزارع تُشال بعد الثلاثين وفهرس صاحب البريد باقٍ
  const now = Date.now();
  await auth.settleUnverifiedEmail('planter6', await user('planter6'), now);
  assert.equal((await auth.settleUnverifiedEmail('planter6', await user('planter6'), now + 31 * DAY)).state, 'removed');
  assert.equal((await user('planter6')).email, null);
  assert.equal(JSON.parse(store.get('db/email-index/real6@mail.com')).username, 'real6', 'فهرس من أكّده لا يُمسّ');
  assert.equal((await user('real6')).email, 'real6@mail.com');
});

test('٧. سجلّات أثبتت بريدها قبل الختم لا تُعامَل كالمزروعة: حساب الرمز القديم، وحساب Google غيّر اسمه', async () => {
  // حساب أنشأه رمز البريد قبل ١٨ أكتوبر: otpOnly، اسمه من مقدّمة البريد، وفهرسه في الطلب نفسه
  const created = Date.now() - 40 * DAY;
  await auth.putUser('maryam_a1b2c3', { username: 'maryam_a1b2c3', email: 'maryam@mail.com', otpOnly: true, createdAt: created, points: 0, salt: 'x', hash: 'y' });
  store.set('db/email-index/maryam@mail.com', JSON.stringify({ username: 'maryam_a1b2c3', at: created + 40 }));
  assert.equal((await call({ action: 'email-otp-request', email: 'maryam@mail.com', lang: 'ar' }, '9.6.0.1')).status, 200, 'لا تُقفل عن نفسها');
  const otp = await call({ action: 'email-otp-verify', email: 'maryam@mail.com', otp: codeIn(mailTo('maryam@mail.com').slice(-1)[0]), lang: 'ar' }, '9.6.0.1');
  assert.equal(auth.verifyToken(otp.body.token), 'maryam_a1b2c3');
  assert.equal((await user('maryam_a1b2c3')).verifiedEmail, 'maryam@mail.com', 'خُتم مرّة');
  // otpOnly لكنّ الفهرس كُتب بعد الإنشاء بأيّام (setEmail القديم غيّر البريد) = غير مؤكَّد
  await auth.putUser('noor_d4e5f6', { username: 'noor_d4e5f6', email: 'noor@mail.com', otpOnly: true, createdAt: created, points: 0, salt: 'x', hash: 'y' });
  store.set('db/email-index/noor@mail.com', JSON.stringify({ username: 'noor_d4e5f6', at: created + 5 * DAY }));
  assert.equal(await auth.emailProven('noor_d4e5f6', await user('noor_d4e5f6')), false);
  // واسم لا يطابق مقدّمة البريد = غير مؤكَّد ولو كُتب الفهرس معه
  await auth.putUser('omar_aaaaaa', { username: 'omar_aaaaaa', email: 'victim@mail.com', otpOnly: true, createdAt: created, points: 0, salt: 'x', hash: 'y' });
  store.set('db/email-index/victim@mail.com', JSON.stringify({ username: 'omar_aaaaaa', at: created + 10 }));
  assert.equal(await auth.emailProven('omar_aaaaaa', await user('omar_aaaaaa')), false);
  // حساب Google غيّر اسمه: g_<البريد> في prevUsernames وgoogleAuth
  await auth.putUser('sara', { username: 'sara', email: 'sara@gmail.com', googleAuth: true, prevUsernames: ['g_sara@gmail.com'], createdAt: created, points: 0, salt: 'x', hash: 'y' });
  assert.equal(await auth.emailProven('sara', await user('sara')), true);
  assert.equal((await user('sara')).verifiedEmail, 'sara@gmail.com');
  // بلا googleAuth (مفتاح g_ سجّله غيره قبل حجزه) = غير مؤكَّد
  await auth.putUser('fake', { username: 'fake', email: 'x@gmail.com', prevUsernames: ['g_x@gmail.com'], createdAt: created, points: 0, salt: 'x', hash: 'y' });
  assert.equal(await auth.emailProven('fake', await user('fake')), false);
});

test('٨. الجرد اليوميّ: يختم القديم المُثبت، ويبدأ عدّاد الجديد، ويشيل ما تجاوز ٣٠ يومًا — ولا يحذف حسابًا، ومرّة كلّ ٢٠ ساعة', async () => {
  for (const k of [...store.keys()]) if (k.startsWith('db/users/') || k.startsWith('db/email-index/') || k.startsWith('db/email-sweep/')) store.delete(k);
  const now = Date.now();
  await auth.putUser('fresh8', { username: 'fresh8', email: 'fresh8@mail.com', createdAt: now, points: 5, salt: 'x', hash: 'y' });
  await auth.putUser('stale8', { username: 'stale8', email: 'stale8@mail.com', emailUnverified: { email: 'stale8@mail.com', since: now - 31 * DAY }, createdAt: now, points: 7, salt: 'x', hash: 'y' });
  store.set('db/email-index/stale8@mail.com', JSON.stringify({ username: 'stale8', at: now }));
  await auth.putUser('ok8', { username: 'ok8', email: 'ok8@mail.com', verifiedEmail: 'ok8@mail.com', createdAt: now, points: 9, salt: 'x', hash: 'y' });
  await auth.putUser('none8', { username: 'none8', email: null, createdAt: now, points: 1, salt: 'x', hash: 'y' });
  assert.equal((await runSweep({}, 'POST')).status, 405, 'غير GET لا يجرد');
  assert.equal(store.has('db/email-sweep/lock'), false);
  assert.equal((await user('fresh8')).emailUnverified, undefined);
  const r = await runSweep();
  assert.deepEqual(r, { status: 200, body: { ok: true, ran: true } }, 'لا أعداد في الردّ');
  assert.equal((await user('fresh8')).emailUnverified.email, 'fresh8@mail.com', 'بدأ عدّاده');
  assert.equal((await user('fresh8')).email, 'fresh8@mail.com');
  assert.equal((await user('stale8')).email, null, 'انشال');
  assert.equal((await user('stale8')).points, 7, 'والحساب باقٍ');
  assert.equal(store.has('db/email-index/stale8@mail.com'), false);
  assert.equal((await user('ok8')).email, 'ok8@mail.com');
  for (const n of ['fresh8', 'stale8', 'ok8', 'none8']) assert.ok(await user(n), n + ' باقٍ');
  assert.deepEqual(await runSweep(), { status: 200, body: { ok: true, ran: false } }, 'النداء الثاني خلال ٢٠ ساعة لا يجرد');
  const tally = await auth.sweepUnverifiedEmails(now);
  assert.deepEqual(tally, { users: 4, verified: 1, pending: 1, removed: 0, failed: 0, partial: false });
});

test('٩. CRON_SECRET إن ضُبط: لا يجرد إلّا من يحمله (Vercel يرسله في Authorization)', async () => {
  store.delete('db/email-sweep/lock');
  process.env.CRON_SECRET = 'cron-test-secret';
  try {
    assert.equal((await runSweep()).status, 401);
    assert.equal((await runSweep({ authorization: 'Bearer wrong' })).status, 401);
    assert.equal(store.has('db/email-sweep/lock'), false, 'المرفوض لا يأخذ القفل');
    assert.deepEqual((await runSweep({ authorization: 'Bearer cron-test-secret' })).body, { ok: true, ran: true });
  } finally { delete process.env.CRON_SECRET; }
});

test('١٠. التوصيل: الجدول اليوميّ وموجّهه، ورسالة الواجهة بالـ١٤ لغة، والتنبيه بعد الدخول وعند الفتح', () => {
  const vj = JSON.parse(read('vercel.json'));
  assert.deepEqual(vj.crons, [{ path: '/api/email-sweep', schedule: '23 3 * * *' }], 'مرّة يوميًّا (حدّ الخطّة المجّانيّة)');
  assert.equal(vj.rewrites.find((r) => r.source === '/api/email-sweep').destination, '/api/system?action=email-sweep');
  assert.ok(read('api/system.js').includes("case 'email-sweep': return require('./_lib/email-sweep.js');"));
  const boot = read('js/app-01-boot-auth.js');
  assert.ok(boot.includes("(data.code === 'email_unverified' && curT().authEmailUnverified)"), 'الدخول والاسترجاع');
  assert.equal((boot.match(/d\.code === 'email_unverified' && window\.curT && window\.curT\(\)\.authEmailUnverified/g) || []).length, 2, 'رمز الدخول: الطلب والتحقّق');
  assert.equal((boot.match(/emailConfirmAlert\(data\.emailToConfirm\)/g) || []).length, 2, 'بعد الدخول وعند الفتح');
  assert.ok(/function emailConfirmAlert\(email\)[\s\S]*?showSettingsPage\('accountSection'\)[\s\S]*?acctToggleRow\('acctRowEmail'[\s\S]*?acctEmailSaveBtn\.onclick\(\)/.test(boot), 'الزرّ يفتح «حسابي» وصفّ الإيميل ويرسل الرمز');
  assert.ok(boot.includes('emailConfirmAlert(null); // v-unverified-email'), 'الخروج يزيله');
  const data = read('js/app-03-i18n-data.js');
  assert.ok(data.includes("authEmailUnverified: '" + AR + "'"), 'نصّ المالك حرفيًّا');
  for (const k of ['authEmailUnverified', 'emailConfirmTitle', 'emailConfirmSend']) {
    assert.equal((data.match(new RegExp('\\b' + k + ': ', 'g')) || []).length, 2, k + ' عربيّ وإنجليزيّ');
    for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
      assert.ok(new RegExp('"?' + k + '"?\\s*:\\s*"[^"]+"').test(read('i18n/' + lg + '.js')), lg + ' ← ' + k);
    }
  }
  // وسم ملفّات اللغات رُفع (٧٥٦ أوّلًا) — الرقم من الملفّ لا حرفيًّا (سقّاطة البنية)
  const tag = Number((read('js/app-04-i18n-state.js').match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(tag >= 756, 'وسم ملفّات اللغات ' + tag);
  assert.ok(!/claude|gemini|groq|gpt|openai|anthropic/i.test(data.match(/emailConfirm\w+: '[^']*'/g).join(' ')), 'بلا اسم مزوّد');
});
