// tests/account-email.test.cjs — v-account-email (أمر المالك ٤ أكتوبر «الاثنين»، بعد فحص #792): إيميل واحد لكلّ حساب، و«نسيت
// كلمة المرور» بالإيميل يردّ ردًّا واحدًا وُجد الحساب أم لا (كان «الحساب غير موجود» يكشف أيّ بريد مسجَّل) بثلاث محاولات لكلّ
// بريد في ربع ساعة. على معالج auth الحقيقيّ بـKV في الذاكرة وبريد مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTH_SECRET = 'test-secret-account-email';
process.env.UPSTASH_REDIS_REST_URL = 'http://local-test';
process.env.RESEND_API_KEY = 'test-resend';
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
global.fetch = async (url, init) => {
  if (/resend/.test(String(url))) { mails.push(JSON.parse(init.body)); return new Response('{"id":"m1"}', { status: 200 }); }
  return new Response('{}', { status: 404 });
};
const auth = require('../api/_lib/auth.js');

async function call(body) {
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await auth({ method: 'POST', headers: {}, body }, res);
  return res;
}

test('١. إيميل واحد لكلّ حساب: الثاني بنفس البريد يُرفض، وبريد حساب محذوف يُقبل', async () => {
  assert.equal((await call({ action: 'signup', username: 'nora', password: 'pass12345', email: 'Nora@Example.com' })).code, 200);
  const dup = await call({ action: 'signup', username: 'nora2', password: 'pass12345', email: ' nora@example.com ' });
  assert.equal(dup.code, 409, JSON.stringify(dup.body));
  assert.match(dup.body.error, /مرتبط بحساب آخر/);
  assert.equal(await auth.getUser('nora2'), null, 'لم يُنشأ الحساب الثاني');
  // حساب حُذف: بريده يعود حرًّا
  const u = await auth.getUser('nora'); u.deleted = true; store.set('db/users/nora.json', JSON.stringify(u));
  assert.equal((await call({ action: 'signup', username: 'nora3', password: 'pass12345', email: 'nora@example.com' })).code, 200);
  const li = await call({ action: 'login', username: 'nora@example.com', password: 'pass12345' });
  assert.equal(li.code, 200, 'الفهرس صار للحساب الحيّ الجديد');
  assert.equal(auth.verifyToken(li.body.token), 'nora3');
});

test('٢. نسيت كلمة المرور بالإيميل: ردّ واحد للموجود وغير الموجود، والرابط يصل الموجود وحده', async () => {
  await call({ action: 'signup', username: 'huda', password: 'pass12345', email: 'huda@example.com' });
  mails.length = 0;
  const yes = await call({ action: 'forgotPassword', username: 'HUDA@example.com' });
  const no = await call({ action: 'forgotPassword', username: 'ghost@example.com' });
  assert.equal(yes.code, 200); assert.equal(no.code, 200);
  assert.deepEqual(yes.body, no.body, 'لا فرق يكشف البريد المسجَّل');
  assert.equal(mails.length, 1, 'رابط واحد للموجود');
  assert.ok((await auth.getUser('huda')).resetTokenHash, 'رمز الإعادة حُفظ');
  // الاسم كما كان (يكشف أصلًا عند التسجيل)
  assert.equal((await call({ action: 'forgotPassword', username: 'nobody' })).code, 404);
});

test('٣. ثلاث محاولات لكلّ بريد في ربع ساعة ثمّ ٤٢٩', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await call({ action: 'forgotPassword', username: 'spam@example.com' })).code, 200);
  const r = await call({ action: 'forgotPassword', username: 'spam@example.com' });
  assert.equal(r.code, 429);
  assert.match(r.body.error, /محاولات كثيرة/);
});
