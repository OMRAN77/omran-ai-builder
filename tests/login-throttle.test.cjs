// tests/login-throttle.test.cjs — v-auth-throttle (الدفعة A، أمان): قفل الدخول كان عدّادًا في سجلّ الحساب يُقرأ ثمّ يُكتب —
// ٢٠٠ كلمة مرور خاطئة متوازية تُقيَّم كلّها والعدّاد ١ — وكان سلاحًا: ست محاولات غريب من أيّ شبكة تقفل المالك ربع ساعة
// (كلمته الصحيحة = ٤٢٩). الآن عدّادات ذرّيّة في ١٥ دقيقة: (حساب، شبكة) ٦، والحساب كلّه حدّ ليّن ٥٠ (فوقه لا تُقيَّم كلمة
// المرور إلّا من شبكة دخل منها الحساب بنجاح)، والشبكة عبر الحسابات ١٠٠. ولا كتابة في السجلّ. وrateWait ذرّيّ أيضًا.
// على معالج auth الحقيقيّ؛ Redis وحده في الذاكرة، وكلّ عمليّة فيه تتخلّى عن الدور (setImmediate) فيظهر سباق القراءة-الكتابة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'login-throttle-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.RESEND_API_KEY = 're_test_dummy';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const tick = () => new Promise((r) => setImmediate(r));
const kvImpl = {
  kvGetJSON: async (k) => { await tick(); return store.has(k) ? JSON.parse(store.get(k)) : null; },
  kvPutJSON: async (k, v) => { await tick(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await tick(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (store.has(k)) return false; store.set(k, String(v)); return true; },
  // كـRedis: INCR على قيمة غير عدديّة (سجلّ JSON قديم) يرمي — لا يُعدّ NaN
  kvIncr: async (k) => { await tick(); if (store.has(k) && !/^-?\d+$/.test(String(store.get(k)))) throw new Error('Upstash error: ERR value is not an integer or out of range'); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { await tick(); store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
let mails = 0;
global.fetch = async (url) => {
  if (/resend\.com/.test(String(url))) { mails++; return new Response('{"id":"m"}', { status: 200 }); }
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const call = (body, ip) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  Promise.resolve(auth({ method: 'POST', headers: { 'x-forwarded-for': ip }, query: {}, body }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
const login = (username, password, ip) => call({ action: 'login', username, password }, ip);
// كلمة مرور واحدة محسوبة مرّة (scrypt مكلف) لكلّ الحسابات
const PASS = 'correct-horse-1';
const HP = auth.hashPassword(PASS);
async function account(name, extra) { await auth.putUser(name, Object.assign({ username: name, createdAt: Date.now(), points: 0 }, HP, extra || {})); }
// عدد تقييمات كلمة المرور الفعليّة (verifyPassword = scryptSync)
function countEvals() {
  const orig = crypto.scryptSync;
  let n = 0;
  crypto.scryptSync = (...a) => { n++; return orig(...a); };
  return { get n() { return n; }, stop() { crypto.scryptSync = orig; } };
}
const LOCKED = /^محاولات كثيرة فاشلة\. حاول بعد \d+ دقيقة$/;

test('١. ٢٠٠ كلمة مرور خاطئة متوازية من شبكة واحدة: ستّ تقييمات فقط والباقي ٤٢٩، والصحيحة من الشبكة نفسها مقفلة', async () => {
  await account('victim1');
  const ev = countEvals();
  let rs;
  try {
    rs = await Promise.all(Array.from({ length: 200 }, (_, i) => login('victim1', 'guess' + i, '9.9.9.9')));
  } finally { ev.stop(); }
  const by = {}; rs.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
  assert.ok(ev.n <= 6, 'تقييمات ' + ev.n + ' (كانت ٢٠٠)');
  assert.equal(by[401], 6, JSON.stringify(by));
  assert.equal(by[429], 194, JSON.stringify(by));
  assert.match(rs.find((r) => r.status === 429).body.error, LOCKED);
  assert.equal((await login('victim1', PASS, '9.9.9.9')).status, 429, 'الزوج المقفل مقفل');
  // ولا شيء يُكتب في السجلّ بعد اليوم (كان failedLoginCount/lockUntil — قراءة-كتابة تسابق كلّ كاتب آخر)
  const rec = await auth.getUser('victim1');
  assert.equal(rec.failedLoginCount, undefined);
  assert.equal(rec.lockUntil, undefined);
});

test('٢. لا قفل للمالك من الخارج: ستّ محاولات غريب من شبكة أخرى (ومن ستّ شبكات) ثمّ كلمة المالك من شبكته = 200', async () => {
  await account('omran');
  for (let i = 0; i < 6; i++) assert.equal((await login('omran', 'x' + i, '200.1.1.1')).status, 401);
  assert.equal((await login('omran', 'x', '200.1.1.1')).status, 429, 'الغريب نفسه مقفل');
  const own = await login('omran', PASS, '10.0.0.1');
  assert.equal(own.status, 200, 'كانت ٤٢٩ ربع ساعة');
  assert.equal(auth.verifyToken(own.body.token), 'omran');
  for (let i = 0; i < 6; i++) await login('omran', 'y' + i, '201.1.1.' + i); // مسبار التدقيق: ستّ شبكات
  assert.equal((await login('omran', PASS, '10.0.0.1')).status, 200);
});

test('٣. الحدّ الليّن للحساب: هجوم موزَّع من ٢٠٠ شبكة متوازية = ٥٠ تقييمًا على الأكثر؛ صاحب الحساب من شبكة دخل منها يدخل', async () => {
  await account('target');
  assert.equal((await login('target', PASS, '10.9.9.9')).status, 200, 'شبكة صاحبه المعروفة');
  const ev = countEvals();
  let rs;
  try {
    rs = await Promise.all(Array.from({ length: 200 }, (_, i) => login('target', 'z' + i, '150.0.' + i + '.1')));
  } finally { ev.stop(); }
  const by = {}; rs.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
  assert.ok(ev.n <= 50, 'تقييمات ' + ev.n + ' (كانت ٢٠٠ — مسبار التدقيق)');
  assert.equal(by[401], ev.n, JSON.stringify(by));
  assert.equal(by[429], 200 - ev.n, JSON.stringify(by));
  const ev2 = countEvals();
  try {
    assert.equal((await login('target', 'zz', '160.0.0.1')).status, 429, 'شبكة جديدة فوق الحدّ الليّن: لا تقييم');
    assert.equal(ev2.n, 0);
  } finally { ev2.stop(); }
  const own = await login('target', PASS, '10.9.9.9');
  assert.equal(own.status, 200, 'صاحب الحساب من شبكته يدخل أثناء الهجوم');
  assert.equal(auth.verifyToken(own.body.token), 'target');
});

test('٤. مكتب بعشرين موظّفًا خلف عنوان IPv4 واحد، لكلّ واحد خطآن ثمّ الصحيحة: كلّهم 200', async () => {
  const OFFICE = '81.82.83.84';
  for (let i = 0; i < 20; i++) await account('emp' + i);
  for (let i = 0; i < 20; i++) {
    assert.equal((await login('emp' + i, 'typo1', OFFICE)).status, 401);
    assert.equal((await login('emp' + i, 'typo2', OFFICE)).status, 401);
    assert.equal((await login('emp' + i, PASS, OFFICE)).status, 200, 'الموظّف ' + i);
  }
});

test('٥. سقف الشبكة عبر الحسابات (حشو بيانات الاعتماد): ١٠٠ فاشلة من شبكة ثمّ ٤٢٩ لأيّ حساب منها؛ شبكة أخرى تدخل', async () => {
  for (let i = 0; i < 101; i++) await account('cs' + i);
  for (let i = 0; i < 100; i++) assert.equal((await login('cs' + i, 'leaked-' + i, '55.55.55.55')).status, 401, 'محاولة ' + (i + 1));
  const blocked = await login('cs100', PASS, '55.55.55.55');
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, LOCKED);
  assert.equal((await login('cs100', PASS, '56.56.56.56')).status, 200);
});

test('٦. الدخول الناجح يمسح عدّاد زوجه: خمس خاطئة ثمّ صحيحة ثمّ خمس خاطئة ثمّ صحيحة = 200', async () => {
  await account('noor');
  for (let i = 0; i < 5; i++) await login('noor', 'n' + i, '33.33.33.33');
  assert.equal((await login('noor', PASS, '33.33.33.33')).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await login('noor', 'm' + i, '33.33.33.33')).status, 401);
  assert.equal((await login('noor', PASS, '33.33.33.33')).status, 200);
});

test('٧. المحظور بكلمته الصحيحة 403 كما كان، والحساب بالإيميل يتشارك عدّاد اسمه', async () => {
  await account('banned1', { banned: true });
  assert.equal((await login('banned1', PASS, '44.44.44.44')).status, 403);
  await account('mail1', { email: 'mail1@example.com' });
  store.set('db/email-index/mail1@example.com', JSON.stringify({ username: 'mail1', at: Date.now() }));
  for (let i = 0; i < 3; i++) await login('mail1', 'a' + i, '45.45.45.45');
  for (let i = 0; i < 3; i++) await login('MAIL1@example.com', 'b' + i, '45.45.45.45');
  assert.equal((await login('mail1@example.com', PASS, '45.45.45.45')).status, 429, 'ستّ على الحساب نفسه من الشبكة نفسها');
});

test('٨. rateWait ذرّيّ: ٥٠ «نسيت كلمة المرور» متوازية لبريد واحد = ثلاث رسائل على الأكثر والباقي ٤٢٩', async () => {
  await account('rana', { email: 'rana@example.com' });
  store.set('db/email-index/rana@example.com', JSON.stringify({ username: 'rana', at: Date.now() }));
  mails = 0;
  const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => call({ action: 'forgotPassword', email: 'rana@example.com' }, '70.0.' + i + '.1')));
  const ok = rs.filter((r) => r.status === 200).length;
  assert.equal(ok, 3, 'نجح ' + ok + ' (كان أكثر من ٣ بسباق القراءة-الكتابة)');
  assert.equal(mails, 3);
  assert.ok(rs.filter((r) => r.status === 429).every((r) => /^محاولات كثيرة، حاول بعد \d+ دقيقة$/.test(r.body.error)));
});

// مراجعة الدفعة A (sec-1): «الشبكة المعروفة» كانت تُكتب بعد الدخول بكلمة المرور وحده — من سجّل ثمّ بقي بالتحقّق المنزلق
// (المالك نادرًا ما يدخل بكلمته) أو دخل برمز البريد يُقفَل حتّى من بيته برشّ ٥٠ كلمة خاطئة من شبكات متفرّقة (المسبار: ٤٢٩).
test('٩. كلّ نجاح موثَّق يحفظ شبكته: تسجيل من S، تحقّق منزلق من V، رمز بريد من O — بعد رشّ ٦٠ موزَّعًا كلمته من الثلاث 200', async () => {
  const su = await call({ action: 'signup', username: 'homeowner', password: PASS }, '10.7.7.1');
  assert.equal(su.status, 200);
  // v-signup-no-email: التسجيل لا يحفظ الإيميل — أكّده من «حسابي» (السجلّ والختم والفهرس كما يكتبها التأكيد بالرمز) ليصله رمز الدخول
  const ho = await auth.getUser('homeowner');
  await auth.putUser('homeowner', Object.assign({}, ho, { email: 'homeowner@example.com', verifiedEmail: 'homeowner@example.com' }));
  store.set('db/email-index/homeowner@example.com', JSON.stringify({ username: 'homeowner', at: Date.now() }));
  assert.equal((await call({ action: 'verify', token: su.body.token }, '10.7.8.1')).status, 200, 'تحقّق منزلق من شبكة أخرى بلا دخول بكلمة');
  assert.equal((await call({ action: 'email-otp-request', email: 'homeowner@example.com' }, '10.7.9.1')).status, 200);
  const code = JSON.parse(store.get('db/otp/homeowner@example.com')).otp;
  assert.equal((await call({ action: 'email-otp-verify', email: 'homeowner@example.com', otp: code }, '10.7.9.1')).status, 200);
  const spray = await Promise.all(Array.from({ length: 60 }, (_, i) => login('homeowner', 'w' + i, '77.0.0.' + i)));
  assert.ok(spray.filter((r) => r.status === 429).length >= 10, 'الحدّ الليّن وقع');
  for (const net of ['10.7.7.1', '10.7.8.1', '10.7.9.1']) {
    assert.equal((await login('homeowner', PASS, net)).status, 200, 'كلمته من شبكته المعروفة ' + net + ' (كانت ٤٢٩)');
  }
  assert.equal((await login('homeowner', PASS, '99.0.0.1')).status, 429, 'شبكة لم يُرَ منها نجاح تبقى خلف الحدّ الليّن');
});

test('١٠. الاسترجاع برابط البريد يحفظ شبكته أيضًا، وعطب KV في الحفظ لا يُفشل الدخول', async () => {
  await account('resetter', { email: 'resetter@example.com' });
  const rt = 'reset-token-abc';
  const rec = await auth.getUser('resetter');
  rec.resetTokenHash = crypto.createHash('sha256').update(rt).digest('hex');
  rec.resetTokenExpiry = Date.now() + 60000;
  await auth.putUser('resetter', rec);
  assert.equal((await call({ action: 'resetWithToken', username: 'resetter', resetToken: rt, newPassword: PASS }, '10.6.6.1')).status, 200);
  await Promise.all(Array.from({ length: 60 }, (_, i) => login('resetter', 'w' + i, '78.0.0.' + i)));
  assert.equal((await login('resetter', PASS, '10.6.6.1')).status, 200, 'شبكة الاسترجاع معروفة');
  const orig = kvImpl.kvSetIfAbsent;
  kvImpl.kvSetIfAbsent = async (k, v, t) => { if (String(k).startsWith('db/login-ok/')) throw new Error('kv down'); return orig(k, v, t); };
  try {
    const su = await call({ action: 'signup', username: 'kvdown', password: PASS }, '10.6.6.2');
    assert.equal(su.status, 200, 'عطب حفظ الشبكة لا يُفشل التسجيل');
    assert.equal((await call({ action: 'verify', token: su.body.token }, '10.6.6.2')).status, 200, 'ولا التحقّق');
  } finally { kvImpl.kvSetIfAbsent = orig; }
});

// مراجعة الدفعة A (sec-2): العدّاد الجديد كان ‎<القاعدة القديمة>/n والبريد خامًا — سجلّ JSON قديم بلا عمر في ‎db/otp-rate/V/n
// (يكتبه كود قديم لبريد «V/n») يجعل INCR يرمي، والرمية «اسمح»: ٢٠ طلب رمز = ٢٠ رسالة للأبد.
test('١١. سجلّ JSON قديم في مفتاح العدّاد لا يُسقط الحدّ: رابع طلب رمز لبريد مسموم ٤٢٩، وعدّاد دخول مسموم يُمسح ويُعدّ', async () => {
  const legacy = JSON.stringify({ windowStart: Date.now(), count: 1 });
  store.set('db/otp-rate/victim@example.com/n', legacy); // الشكل القديم (بلا عمر)
  store.set('db/forgot-rate/victim@example.com/n', legacy);
  mails = 0;
  const rs = [];
  for (let i = 0; i < 4; i++) rs.push((await call({ action: 'email-otp-request', email: 'victim@example.com' }, '79.0.0.' + i)).status);
  assert.deepEqual(rs, [200, 200, 200, 429], 'كانت ٢٠٠ ×٤');
  assert.equal(mails, 3);
  // والقيمة البشريّة مرمَّزة: «V/n» لا يقع على عدّاد V
  assert.equal((await call({ action: 'email-otp-request', email: 'victim@example.com/n' }, '79.0.1.1')).status, 200);
  // دفاع ثانٍ: قيمة غير عدديّة في عدّاد ذرّيّ (هنا عدّاد الحساب في قفل الدخول) تُمسح ويُعاد العدّ — لا تُفهم «اسمح»
  await account('poisoned');
  store.set('db/login-fail/poisoned/n', legacy);
  const ev = countEvals();
  let by = {};
  try {
    const out = await Promise.all(Array.from({ length: 20 }, (_, i) => login('poisoned', 'p' + i, '9.8.7.6')));
    out.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
  } finally { ev.stop(); }
  assert.ok(ev.n <= 6, 'تقييمات ' + ev.n + ' (كانت ٢٠: عطب العدّاد = اسمح)');
  assert.equal(by[429], 20 - ev.n, JSON.stringify(by));
});
