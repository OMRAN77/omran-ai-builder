// tests/session-revoke.test.cjs — v-session-revoke (فحص Desloppify ٩ نوفمبر ٢٠٢٦): بعد تغيير كلمة المرور أو استعادتها كان الرمز
// القديم يُرفض في auth.js وحده (srv-auth-8)، ويبقى صالحًا في المحادثة والذاكرة والنقاط والبريد والنشر حتّى انتهائه.
// الآن حاجز في withErrorCapture (كلّ موجّهات api/*.js) وفي النقطتين خارجه يرفضه، بقراءة واحدة لجدول صغير في الدقيقة لا لكلّ طلب.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'session-revoke-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const hashes = new Map();
let pipelineCalls = 0;
let pipelineDown = false;
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  // Upstash يردّ HGETALL مصفوفة مسطّحة [حقل، قيمة، …]
  kvPipeline: async (cmds) => {
    pipelineCalls++;
    if (pipelineDown) throw new Error('Upstash pipeline error: HTTP 503');
    return cmds.map(([op, key, f, v]) => {
      const h = hashes.get(key) || new Map();
      if (op === 'HSET') { h.set(f, v); hashes.set(key, h); return 1; }
      if (op === 'HGETALL') return [...h.entries()].flat();
      return null;
    });
  },
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });
global.fetch = async () => new Response('{}', { status: 404 });

const auth = require(rp('api/_lib/auth.js'));
const session = require(rp('api/_lib/_session.js'));
const { withErrorCapture } = require(rp('api/_lib/_errors.js'));

let ipSeq = 0;
const freshIp = () => '10.9.' + (++ipSeq % 250) + '.7';
const resOf = (resolve) => ({ _s: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; }, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } });
const call = (body) => new Promise((resolve) => auth({ method: 'POST', headers: { 'x-forwarded-for': freshIp() }, query: {}, body }, resOf(resolve)));
// موجّه حقيقيّ الشكل: withErrorCapture حول معالج يسجّل أنّه وصل
let reached = 0;
const routed = (route, action, req) => new Promise((resolve) => {
  const h = withErrorCapture(route, async (rq, rs) => { reached++; rs.status(200).json({ ok: true }); });
  h(Object.assign({ method: 'POST', headers: { origin: 'https://omran-ai-builder.vercel.app' }, query: { action } }, req), resOf(resolve));
});

async function userWithLeakedToken(name) {
  const s = await call({ action: 'signup', username: name, password: name + '-pass-1' });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const leaked = (await call({ action: 'login', username: name, password: name + '-pass-1' })).body.token;
  assert.ok(leaked);
  return { t0: s.body.token, leaked };
}

test('١. بعد تغيير كلمة المرور: الرمز القديم يُرفض في كلّ الموجّهات (جسم، ?token=، Bearer)، والجديد يمرّ', async () => {
  store.clear(); hashes.clear(); session.__resetSessionVersionsForTest();
  const { t0, leaked } = await userWithLeakedToken('rana1');
  // قبل التغيير: الرمز صالح في كلّ مكان
  reached = 0;
  assert.equal((await routed('ai', 'chat', { body: { token: leaked } })).status, 200);
  const cp = await call({ action: 'changePassword', token: t0, currentPassword: 'rana1-pass-1', newPassword: 'rana1-pass-2' });
  assert.equal(cp.status, 200);
  reached = 0;
  for (const [route, action, req] of [
    ['ai', 'chat', { body: { token: leaked } }],
    ['account', 'points', { body: { token: leaked } }],
    ['account', 'chats_load', { body: { token: leaked } }],
    ['tools', 'memory', { body: {}, query: { action: 'memory', token: leaked } }],
    ['system', 'email-list', { body: {}, headers: { authorization: 'Bearer ' + leaked } }],
  ]) {
    const r = await routed(route, action, req);
    assert.equal(r.status, 401, route + '/' + action + ': ' + JSON.stringify(r.body));
    assert.equal(r.body.code, 'session');
  }
  assert.equal(reached, 0, 'لا معالج يصله رمز قديم');
  assert.equal((await routed('ai', 'chat', { body: { token: cp.body.token } })).status, 200, 'رمز الجهاز الذي غيّر كلمته يمرّ');
  assert.equal((await routed('ai', 'chat', { body: {} })).status, 200, 'طلب بلا رمز لا يمسّه الحاجز');
  assert.equal((await routed('ai', 'chat', { body: { token: 'not.a-token' } })).status, 200, 'رمز مشوّه يبقى لحكم المعالج');
});

test('٢. الاستعادة برابط البريد تُبطل كذلك، وإجراءات الدخول نفسها لا يمسّها الحاجز', async () => {
  store.clear(); hashes.clear(); session.__resetSessionVersionsForTest();
  const { leaked } = await userWithLeakedToken('rana2');
  // ما يفعله resetWithToken بعد زيادة sv (المسار الكامل بالبريد مثبت في audit-fix-auth srv-auth-8؛ النداء مثبت في ٦)
  await session.recordSessionVersion('rana2', 1);
  assert.equal((await routed('media', 'tts', { body: { token: leaked } })).status, 401);
  reached = 0;
  assert.equal((await routed('account', 'auth', { body: { token: leaked } })).status, 200, 'auth يحكم بنفسه (verify يردّ 401 من سجلّ الحساب)');
  assert.equal(reached, 1);
});

test('٣. من غيّر كلمته قبل هذا القرار: verify (أوّل فتح) ينسخ إصداره إلى الجدول، فيُرفض رمزه القديم بعدها', async () => {
  store.clear(); hashes.clear(); session.__resetSessionVersionsForTest();
  const { t0, leaked } = await userWithLeakedToken('rana3');
  await call({ action: 'changePassword', token: t0, currentPassword: 'rana3-pass-1', newPassword: 'rana3-pass-2' });
  const fresh = (await call({ action: 'login', username: 'rana3', password: 'rana3-pass-2' })).body.token;
  hashes.clear(); session.__resetSessionVersionsForTest(); // الجدول فارغ كما في الإنتاج قبل النشر
  assert.equal((await routed('ai', 'chat', { body: { token: leaked } })).status, 200, 'قبل أوّل verify: لا علم بالتغيير');
  session.__resetSessionVersionsForTest();
  assert.equal((await call({ action: 'verify', token: fresh })).status, 200);
  assert.equal(hashes.get('db/session-versions').get('rana3'), '1', 'الإصدار نُسخ');
  assert.equal((await routed('ai', 'chat', { body: { token: leaked } })).status, 401);
});

test('٤. الكلفة: قراءة واحدة للجدول في الدقيقة لكلّ نسخة — لا لكلّ طلب؛ ولا كتابة إذا كان الجدول محدَّثًا', async () => {
  store.clear(); hashes.clear(); session.__resetSessionVersionsForTest();
  const { t0 } = await userWithLeakedToken('rana4');
  pipelineCalls = 0;
  for (let i = 0; i < 25; i++) await routed('ai', 'chat', { body: { token: t0 } });
  assert.equal(pipelineCalls, 1, 'خمسة وعشرون طلبًا = قراءة واحدة');
  await session.recordSessionVersion('rana4', 2);
  await session.recordSessionVersion('rana4', 2);
  await session.recordSessionVersion('rana4', 1);
  assert.equal(pipelineCalls, 2, 'كتابة واحدة، والمكرَّر والأقدم لا يُكتبان');
});

test('٥. عطل القاعدة لا يطرد أحدًا: يُقبل الرمز كما كان قبل القرار، ولا تُعاد القراءة الفاشلة في كلّ طلب', async () => {
  store.clear(); hashes.clear(); session.__resetSessionVersionsForTest();
  const { t0 } = await userWithLeakedToken('rana5');
  pipelineDown = true; pipelineCalls = 0;
  try {
    for (let i = 0; i < 5; i++) assert.equal((await routed('ai', 'chat', { body: { token: t0 } })).status, 200);
    assert.equal(pipelineCalls, 1);
  } finally { pipelineDown = false; }
});

test('٦. النقطتان خارج withErrorCapture (video-prompt، video-download) تفحصان الإصدار كذلك، وكلّ موجّه مغلَّف', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  assert.match(read('api/video-prompt.js'), /!session\.sessionUser\(token\) \|\| await session\.sessionRevoked\(token\)/);
  assert.match(read('api/video-download.js'), /!username \|\| await session\.sessionRevoked\(token\)/);
  for (const f of ['account', 'ai', 'edu', 'media', 'system', 'tools', 'video']) {
    assert.ok(read('api/' + f + '.js').includes("withErrorCapture('" + f + "'"), f + ' مغلَّف بالحاجز');
  }
  const a = read('api/_lib/auth.js');
  assert.equal((a.match(/recordSessionVersion\(/g) || []).length, 3, 'تغيير الكلمة، الاستعادة، verify');
});
