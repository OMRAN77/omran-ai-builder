// tests/strict-rmw.test.cjs — v-strict-rmw (فحص Desloppify ٩ نوفمبر ٢٠٢٦): kvGetJSON بلا strict يبتلع عطل القاعدة ويرجع null، فمسارات
// «اقرأ ثمّ اكتب كاملًا» في المحادثات والذاكرة والذاكرة الحيّة كانت تقرأ «فارغ» وتكتب فوق بيانات المستخدم الحقيقيّة. الآن تقرأ صارمًا:
// العطل = ٥٠٠ بلا كتابة. القراءة وحدها (تحميل المحادثات، سياق الذاكرة للردّ) كما كانت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'strict-rmw-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
let down = false; // عطل لحظيّ: القراءة تفشل، والكتابة (لو وصلت) تنجح — أسوأ الحالات
const writes = [];
const kvImpl = {
  // كما في kv.js الحقيقيّ: بلا strict يبتلع العطل ويرجع null، ومع strict يرمي
  kvGetJSON: async (k, opts) => {
    if (down) { if (opts && opts.strict) throw new Error('Upstash error: HTTP 503'); return null; }
    return store.has(k) ? JSON.parse(store.get(k)) : null;
  },
  kvPutJSON: async (k, v) => { writes.push(k); store.set(k, JSON.stringify(v)); },
  kvSetIfAbsent: async () => true,
  kvDel: async (k) => { store.delete(k); },
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const crypto = require('node:crypto');
const tokenFor = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600e3 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
const chats = require(rp('api/_lib/chats.js'));
const memory = require(rp('api/_lib/memory.js'));
const living = require(rp('api/_lib/living-memory.js'));

const call = (h, action, body) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  h({ method: 'POST', headers: {}, query: action ? { action } : {}, body }, res);
});
const tok = tokenFor('huda');

test('١. حفظ المحادثات أثناء عطل القراءة: ٥٠٠ ولا كتابة — محادثات الأجهزة الأخرى والمحذوفات تبقى', async () => {
  store.clear(); writes.length = 0; down = false;
  const pr = (id, t) => ({ id, name: t, chats: [{ id: id + 'c', title: t, messages: [{ role: 'user', content: t }] }] });
  assert.equal((await call(chats, 'chats_save', { token: tok, projects: [pr('p1', 'من الحاسوب'), pr('p2', 'من الجوّال')] })).status, 200);
  assert.equal((await call(chats, 'chats_delete', { token: tok, ids: ['old1'] })).status, 200);
  const snap = new Map(store);
  writes.length = 0; down = true;
  const r = await call(chats, 'chats_save', { token: tok, projects: [pr('p3', 'جهاز ثالث')] });
  assert.equal(r.status, 500, JSON.stringify(r.body));
  assert.equal((await call(chats, 'chats_delete', { token: tok, ids: ['p1'] })).status, 500);
  assert.equal((await call(chats, 'chats_wipe', { token: tok })).status, 500);
  assert.deepEqual(writes, [], 'لا كتابة فوق ما لم يُقرأ');
  assert.deepEqual(new Map(store), snap);
  down = false;
  const load = await call(chats, 'chats_load', { token: tok });
  assert.deepEqual(load.body.projects.map((p) => p.id).sort(), ['p1', 'p2']);
  assert.ok(load.body.deletedIds.includes('old1'));
});

test('٢. التحميل وحده كما كان أثناء العطل (لا ٥٠٠ في فتح التطبيق)', async () => {
  down = true;
  try { assert.equal((await call(chats, 'chats_load', { token: tok })).status, 200); } finally { down = false; }
});

test('٣. الذاكرة: إضافة حقيقة أو موضوع أثناء العطل = ٥٠٠ والذاكرة كاملة؛ وسياق الردّ يقرأ بلا رمي', async () => {
  store.clear(); writes.length = 0; down = false;
  const fact = (f) => call(memory, null, { token: tok, op: 'append', fact: f });
  assert.equal((await fact('اسمي هدى')).status, 200);
  assert.equal((await fact('أحب الردود المختصرة')).status, 200);
  const before = (await memory.readMemory('huda')).memory;
  assert.match(before, /هدى/);
  writes.length = 0; down = true;
  assert.equal((await fact('عندي مشروع مطعم')).status, 500);
  assert.equal((await call(memory, null, { token: tok, op: 'topic', id: 't1', title: 'مطعم' })).status, 500);
  assert.equal((await call(memory, null, { token: tok, op: 'set', memory: 'نصّ جديد' })).status, 500, 'set يقرأ المواضيع قبل الكتابة');
  assert.deepEqual(writes, []);
  assert.deepEqual(await memory.readMemory('huda'), { memory: '', updatedAt: 0, topics: [], pending: [] }, 'قراءة السياق لا ترمي');
  down = false;
  assert.equal((await memory.readMemory('huda')).memory, before, 'الذاكرة لم تُمسّ');
  assert.equal((await call(memory, null, { token: tok, op: 'clear' })).status, 200, 'المسح الصريح لا يحتاج قراءة');
});

test('٤. الذاكرة الحيّة: حذف حقيقة أثناء العطل يرمي ولا يكتب', async () => {
  store.clear(); writes.length = 0; down = false;
  store.set('db/living/huda.json', JSON.stringify({ facts: [{ id: 'f1', text: 'تحبّ القهوة', kind: 'pref', at: 1 }, { id: 'f2', text: 'تسكن الشارقة', kind: 'fact', at: 1 }], updatedAt: 1 }));
  const snap = store.get('db/living/huda.json');
  down = true;
  await assert.rejects(living.removeFact('huda', 'f1'));
  assert.deepEqual(writes, []);
  assert.equal(store.get('db/living/huda.json'), snap);
  down = false;
});

test('٥. كلّ قراءة تسبق كتابة في الملفّات الثلاثة صارمة (تثبيت المصدر)', () => {
  const fs = require('node:fs');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const c = read('api/_lib/chats.js');
  for (const a of ['chats_save', 'chats_delete', 'chats_wipe']) {
    const seg = c.slice(c.indexOf("action === '" + a + "'"), c.indexOf('return;', c.indexOf("action === '" + a + "'")));
    assert.doesNotMatch(seg, /kvGetJSON\((?:chatsKey|deletedKey)\(username\)\);/, a + ': قراءة غير صارمة قبل الكتابة');
  }
  const m = read('api/_lib/memory.js');
  assert.equal((m.match(/readMemory\(username, \{ strict: true \}\)/g) || []).length, 5, 'writeMemory + topic + append + update + القراءة الثانية');
  const l = read('api/_lib/living-memory.js');
  assert.equal((l.match(/readRecord\(user, \{ strict: true \}\)/g) || []).length, 2, 'removeFact + الدمج');
});
