'use strict';
/* v-redis-why (تنبيه المالك ٤ أكتوبر: «قاعدة البيانات (Redis) لا تستجيب» بلا سبب): فحص Redis كان يبتلع الخطأ ويعيد false.
   هنا على المعالج الحقيقيّ (kv مزيّف يرمي أخطاء Upstash الحقيقيّة الشكل): السبب يصل في redisWhy بعربيّة قصيرة ونصّ Upstash
   بلا رمز ولا عنوان، والسليم بلا سبب؛ والتنبيه ولوحة «فحص النظام» يعرضانه. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
let fail = null;
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null),
  kvPutJSON: async (k, v) => { if (fail) throw new Error(fail); db.set(k, structuredClone(v)); },
  kvIncr: async () => 1, kvExpire: async () => {},
} };
require.cache[rp('api/_lib/_owner.js')] = { id: rp('api/_lib/_owner.js'), filename: rp('api/_lib/_owner.js'), loaded: true, exports: {
  isOwner: () => true, isOwnerName: (u) => u === 'omran', ownerList: () => ['omran'],
} };
const health = require(rp('api/_lib/health.js'));
const call = () => new Promise((resolve) => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); }, end() { resolve({ code: this.code }); } };
  health({ method: 'GET', query: {}, headers: {} }, res);
});

test('١. السليم: redisOk بلا سبب', async () => {
  fail = null;
  const { j } = await call();
  assert.equal(j.redisOk, true);
  assert.equal(j.redisWhy, '');
});

test('٢. كلّ عطل بسببه: حدّ الطلبات، رمز مرفوض، متغيّر ناقص، انقطاع — بلا عنوان ولا رمز', async () => {
  const cases = [
    ['Upstash error: ERR max requests limit exceeded. Limit: 500000, Usage: 500000', /حدّ الطلبات/],
    ['Upstash error: HTTP 401 Unauthorized', /رمز Upstash مرفوض/],
    ['Server is missing UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN', /ناقصان في Vercel/],
    ['fetch failed https://eu1-secret-host.upstash.io', /لا اتّصال/],
  ];
  for (const [msg, re] of cases) {
    fail = msg;
    const { j } = await call();
    assert.equal(j.redisOk, false, msg);
    assert.match(j.redisWhy, re, msg);
    assert.ok(!/https?:\/\//.test(j.redisWhy), 'لا عنوان في السبب: ' + j.redisWhy);
  }
  fail = null;
});

test('٢ب. امتلاء السعة ليس «حدّ الطلبات» (تنبيه المالك ٤ أكتوبر): رسالة Upstash الحقيقيّة تُسمّى باسمها وتدلّ على العلاج', async () => {
  fail = 'Upstash error: ERR DB capacity quota exceeded. Threshold: 268435456 bytes, Usage: 274604636 bytes. See https://upstash.com/docs for details';
  const { j } = await call();
  assert.equal(j.redisOk, false);
  assert.match(j.redisWhy, /سعة قاعدة Upstash امتلأت/);
  assert.match(j.redisWhy, /تنظيف التطبيق/);
  assert.match(j.redisWhy, /Threshold: 268435456 bytes, Usage: 274604636 bytes/, 'نصّ Upstash نفسه باقٍ');
  assert.doesNotMatch(j.redisWhy, /حدّ الطلبات/, 'لا تسمية خاطئة');
  assert.ok(!/https?:\/\//.test(j.redisWhy));
  fail = 'Upstash error: ERR max requests limit exceeded. Limit: 500000, Usage: 500000';
  assert.match((await call()).j.redisWhy, /حدّ الطلبات/, 'حدّ الطلبات الحقيقيّ يبقى كما هو');
  fail = null;
});

test('٣. التنبيه ولوحة «فحص النظام» يعرضان السبب للمالك', () => {
  const v = fs.readFileSync(path.join(root, 'js/app-11-video.js'), 'utf8');
  assert.match(v, /problems\.push\('قاعدة البيانات \(Redis\) لا تستجيب' \+ \(d\.redisWhy \? ' — السبب: '/);
  assert.match(v, /lines\.push\(mark\(d\.redisOk\) \+ ' قاعدة البيانات \(Redis\)' \+ \(!d\.redisOk && d\.redisWhy/);
});
