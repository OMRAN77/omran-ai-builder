// tests/otp-lockout.test.cjs — v-otp-cap (الدفعة A، أمان): «الدخول برمز البريد» كان بلا أيّ عدّاد للتخمين — ٣٠٠٠ رمز خاطئ
// من ٢٥٠ عنوانًا ثمّ الرمز الصحيح = 200 ورمز جلسة، والرمز حيّ خمس دقائق؛ وعدّاد طلب الرموز قراءة ثمّ كتابة يتجاوزه التوازي.
// الآن: خمس محاولات لكلّ رمز صادر (ذرّيًّا قبل المقارنة) والخامسة الخاطئة تحرقه، و٣٠ محاولة فاشلة لكلّ شبكة في ربع ساعة
// (الناجحة تُردّ — مكتب بعشرين موظّفًا خلف عنوان واحد لا يُقفل بأخطاء الكتابة)، وثلاثة رموز لكلّ بريد في خمس دقائق ذرّيًّا.
// على معالج auth الحقيقيّ؛ Redis وحده في الذاكرة، وكلّ عمليّة فيه تتخلّى عن الدور (setImmediate) فيظهر سباق القراءة-الكتابة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'otp-lockout-test-secret';
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
  kvIncr: async (k) => { await tick(); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await tick(); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { await tick(); store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const lastCode = {};
let mails = 0;
global.fetch = async (url, opts) => {
  if (/resend\.com/.test(String(url))) {
    mails++;
    const b = JSON.parse(opts.body);
    const mm = String(b.html).match(/>(\d{6})</);
    if (mm) lastCode[b.to[0]] = mm[1];
    return new Response('{"id":"m"}', { status: 200 });
  }
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const call = (body, ip) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  Promise.resolve(auth({ method: 'POST', headers: { 'x-forwarded-for': ip || '6.6.6.6' }, query: {}, body }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
// حساب قائم مربوط ببريده (بلا كلمة مرور تُقيَّم) — الدخول برمز البريد يجده من الفهرس.
async function account(name, email) {
  // v-unverified-email: الدخول بالرمز لبريد مؤكَّد على حسابه وحده — البذرة بختمها كما يكتبه التأكيد بالرمز
  await auth.putUser(name, { username: name, email, verifiedEmail: email, createdAt: Date.now(), points: 0, salt: 'x', hash: 'y' });
  store.set('db/email-index/' + email, JSON.stringify({ username: name, at: Date.now() }));
}
const wrong = (code, i) => String((Number(code) + 1 + i) % 1000000).padStart(6, '0');
// عدد مقارنات الرمز الفعليّة: المقارنة الوحيدة بطول ستّة بايتات في المسار هي timingSafeEqual على الرمز.
function countCompares() {
  const orig = crypto.timingSafeEqual;
  let n = 0;
  crypto.timingSafeEqual = (a, b) => { if (a && a.length === 6) n++; return orig(a, b); };
  return { get n() { return n; }, stop() { crypto.timingSafeEqual = orig; } };
}

test('١. خمسة رموز خاطئة تحرق الرمز: الصحيح بعدها ٤٠١ بالرسالة العامّة نفسها، والرمز الجديد يعمل', async () => {
  await account('reem', 'reem@example.com');
  assert.equal((await call({ action: 'email-otp-request', email: 'reem@example.com' }, '1.1.1.1')).status, 200);
  const code = lastCode['reem@example.com'];
  for (let i = 0; i < 5; i++) {
    const r = await call({ action: 'email-otp-verify', email: 'reem@example.com', otp: wrong(code, i) }, '2.2.2.' + i);
    assert.equal(r.status, 401, 'خاطئ ' + (i + 1));
    assert.equal(r.body.error, 'رمز غير صحيح أو منتهي');
  }
  const after = await call({ action: 'email-otp-verify', email: 'reem@example.com', otp: code }, '1.1.1.1');
  assert.equal(after.status, 401, 'الرمز المحروق لا يفتح الحساب');
  assert.equal(after.body.error, 'رمز غير صحيح أو منتهي');
  assert.equal(after.body.token, undefined);
  // المستخدم يطلب رمزًا جديدًا من المسار القائم، والجديد يبدأ من صفر
  assert.equal((await call({ action: 'email-otp-request', email: 'reem@example.com' }, '1.1.1.1')).status, 200);
  const fresh = lastCode['reem@example.com'];
  const ok = await call({ action: 'email-otp-verify', email: 'reem@example.com', otp: fresh }, '1.1.1.1');
  assert.equal(ok.status, 200);
  assert.equal(auth.verifyToken(ok.body.token), 'reem');
});

test('٢. الأمين: خطأ واحد ثمّ الصحيح = 200، وأربعة أخطاء ثمّ الصحيح = 200', async () => {
  await account('huda', 'huda@example.com');
  await call({ action: 'email-otp-request', email: 'huda@example.com' }, '3.3.3.3');
  let code = lastCode['huda@example.com'];
  assert.equal((await call({ action: 'email-otp-verify', email: 'huda@example.com', otp: wrong(code, 0) }, '3.3.3.3')).status, 401);
  assert.equal((await call({ action: 'email-otp-verify', email: 'huda@example.com', otp: code }, '3.3.3.3')).status, 200);
  await call({ action: 'email-otp-request', email: 'huda@example.com' }, '3.3.3.3');
  code = lastCode['huda@example.com'];
  for (let i = 0; i < 4; i++) await call({ action: 'email-otp-verify', email: 'huda@example.com', otp: wrong(code, i) }, '3.3.3.3');
  assert.equal((await call({ action: 'email-otp-verify', email: 'huda@example.com', otp: code }, '3.3.3.3')).status, 200, 'الخامسة صحيحة');
});

test('٣. ٣٠٠٠ تخمين من ٣٠٠٠ شبكة (المسبار) ثمّ الصحيح = ٤٠١، وخمس مقارنات فقط للرمز كلّه', async () => {
  await account('victim', 'victim@example.com');
  await call({ action: 'email-otp-request', email: 'victim@example.com' }, '4.4.4.4');
  const code = lastCode['victim@example.com'];
  const cmp = countCompares();
  try {
    for (let i = 0; i < 3000; i++) {
      const r = await call({ action: 'email-otp-verify', email: 'victim@example.com', otp: wrong(code, i) }, '7.' + (i >> 8 & 255) + '.' + (i & 255) + '.9');
      assert.equal(r.status, 401);
    }
    const after = await call({ action: 'email-otp-verify', email: 'victim@example.com', otp: code }, '4.4.4.4');
    assert.equal(after.status, 401, 'كان 200 ورمز جلسة');
    assert.ok(cmp.n <= 5, 'مقارنات الرمز ' + cmp.n + ' (كانت ٣٠٠١)');
  } finally { cmp.stop(); }
});

test('٤. ٢٠٠ تخمين متوازٍ من شبكات مختلفة: خمس مقارنات على الأكثر، والصحيح بعدها مرفوض', async () => {
  await account('sara', 'sara@example.com');
  await call({ action: 'email-otp-request', email: 'sara@example.com' }, '5.5.5.5');
  const code = lastCode['sara@example.com'];
  const cmp = countCompares();
  try {
    const rs = await Promise.all(Array.from({ length: 200 }, (_, i) => call({ action: 'email-otp-verify', email: 'sara@example.com', otp: wrong(code, i) }, '8.8.' + i + '.1')));
    assert.ok(rs.every((r) => r.status === 401));
    assert.ok(cmp.n <= 5, 'مقارنات متوازية ' + cmp.n);
  } finally { cmp.stop(); }
  assert.equal((await call({ action: 'email-otp-verify', email: 'sara@example.com', otp: code }, '5.5.5.5')).status, 401);
});

test('٥. سقف الشبكة: ٣٠ محاولة فاشلة من عنوان واحد ثمّ ٤٢٩ «محاولات كثيرة» حتّى بالرمز الصحيح؛ وشبكة أخرى تدخل', async () => {
  await account('nada', 'nada@example.com');
  await call({ action: 'email-otp-request', email: 'nada@example.com' }, '9.9.9.1');
  const code = lastCode['nada@example.com'];
  for (let i = 0; i < 30; i++) {
    const r = await call({ action: 'email-otp-verify', email: 'ghost' + i + '@example.com', otp: '123456' }, '66.66.66.66');
    assert.equal(r.status, 401, 'فاشلة ' + (i + 1));
  }
  const blocked = await call({ action: 'email-otp-verify', email: 'nada@example.com', otp: code }, '66.66.66.66');
  assert.equal(blocked.status, 429, 'كانت 401 بلا حدّ');
  assert.match(blocked.body.error, /^محاولات كثيرة، حاول بعد \d+ دقيقة$/);
  // IPv6 من الـ/64 نفسها شبكة واحدة كذلك (العميل يملك 2^64 عنوانًا فيها)
  for (let i = 0; i < 30; i++) await call({ action: 'email-otp-verify', email: 'ghost' + i + '@example.com', otp: '123456' }, '2a02:1:2:3::' + (i + 1).toString(16));
  assert.equal((await call({ action: 'email-otp-verify', email: 'nada@example.com', otp: code }, '2a02:1:2:3:ffff::9')).status, 429);
  const ok = await call({ action: 'email-otp-verify', email: 'nada@example.com', otp: code }, '9.9.9.1');
  assert.equal(ok.status, 200, 'الرمز لم يُحرق بالمحجوبين، وشبكة صاحبه تدخل');
});

test('٦. مكتب بعشرين موظّفًا خلف عنوان IPv4 واحد، لكلّ واحد خطأ كتابة ثمّ الصحيح: كلّهم 200', async () => {
  const OFFICE = '81.82.83.84';
  for (let i = 0; i < 20; i++) {
    const email = 'staff' + i + '@office.example';
    await account('staff' + i, email);
    assert.equal((await call({ action: 'email-otp-request', email }, OFFICE)).status, 200);
    const code = lastCode[email];
    assert.equal((await call({ action: 'email-otp-verify', email, otp: wrong(code, 0) }, OFFICE)).status, 401);
    const ok = await call({ action: 'email-otp-verify', email, otp: code }, OFFICE);
    assert.equal(ok.status, 200, 'الموظّف ' + i);
  }
});

test('٧. طلب الرموز ذرّيّ: ٥٠ طلبًا متوازيًا لبريد واحد = ثلاث رسائل على الأكثر والباقي ٤٢٩', async () => {
  mails = 0;
  const rs = await Promise.all(Array.from({ length: 50 }, (_, i) => call({ action: 'email-otp-request', email: 'burst@example.com' }, '10.20.' + i + '.1')));
  const ok = rs.filter((r) => r.status === 200).length;
  assert.equal(ok, 3, 'نجح ' + ok + ' (كان أكثر من ٣ بسباق القراءة-الكتابة)');
  assert.equal(mails, 3);
  assert.ok(rs.filter((r) => r.status === 429).every((r) => /^محاولات كثيرة، حاول بعد \d+ دقيقة$/.test(r.body.error)));
});
