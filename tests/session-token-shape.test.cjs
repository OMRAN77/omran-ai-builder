// tests/session-token-shape.test.cjs — v-session-shape (الدفعة A، أمان): تذكرة مهمّة البناء (construction-create.signJob:
// {u,p,h,r,n,e}) كانت تُوقَّع بتوقيع رمز الجلسة نفسه وبلا exp، ونسخ التحقّق اليدويّة تقارن `exp < now` (غائب = مقبول):
// auth 'verify' سكّ منها جلسة ثلاثين يومًا، وadmin-actions قبل تذكرة المالك صلاحيّةً لا تنتهي. الآن: التذكرة في مجال توقيع
// منفصل ('cx-job|')، وauth.verifyToken والوحدات غير الماليّة (chats وmemory وreminders وpush-subscribe وshare وadmin-actions
// وadmin-stats وrealtime-session) عبر _session.sessionUser (u نصّ وexp رقم في المستقبل). والمهامّ الجارية لحظة النشر تكمل.
// التذكرة تُسكّ من معالج البناء الحقيقيّ (مرحلة المخطّط)، لا تُقلَّد؛ Redis وحده في الذاكرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'session-shape-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GEMINI_API_KEY = 'test-gemini';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
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
  kvPipeline: async (cmds) => cmds.map(([op, k]) => (op === 'GET' ? (store.has(k) ? store.get(k) : null) : 1)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });
let cxUser = 'victim';
mock('api/_lib/_constructionUsage.js', {
  checkConstructionQuota: async () => ({ allowed: true, username: cxUser, remaining: 5, limit: 6 }),
  consumeConstruction: async () => 4,
  CONSTRUCTION_DAILY_LIMIT: 6,
});
mock('api/_lib/_constructionLibrary.js', { saveDesign: async () => {} });
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('gemini-3-pro-image')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: 'aW1n', mimeType: 'image/png' } }] } }] }), { status: 200 });
  if (u.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '### خطة' }] } }] }), { status: 200 });
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const { sessionUser } = require(rp('api/_lib/_session.js'));
const cx = require(rp('api/_lib/construction-create.js'));
const run = (handler, req) => new Promise((resolve) => {
  const res = {
    _s: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this._s = c; return this; },
    json(b) { resolve({ status: this._s, body: b }); return this; },
    end(b) { resolve({ status: this.statusCode || this._s, body: b ? JSON.parse(b) : undefined }); return this; },
  };
  Promise.resolve(handler(Object.assign({ method: 'POST', headers: {}, query: {} }, req), res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
const JOB = { buildingType: 'villa', area: 300, parts: ['plan', 'photo', 'interior'], token: 'quota-mocked' };
async function mintTicket(u) {
  cxUser = u;
  const r = await run(cx, { body: Object.assign({}, JOB, { part: 'plan' }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.jobTicket, 'المرحلة الأولى تعطي تذكرة');
  return r.body.jobTicket;
}
const sign = (obj, prefix) => {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update((prefix || '') + p).digest('base64url');
};
async function user(name, extra) { await auth.putUser(name, Object.assign({ username: name, createdAt: Date.now(), points: 0 }, extra || {})); return auth.makeToken(name); }
const bearer = (t) => ({ authorization: 'Bearer ' + t });

test('١. تذكرة البناء ليست جلسة: auth verify ‏401 بلا رمز جديد، وverifyToken وsessionUser يرفضانها', async () => {
  await user('victim');
  const ticket = await mintTicket('victim');
  const v = await run(auth, { body: { action: 'verify', token: ticket } });
  assert.equal(v.status, 401, 'كان 200 وجلسة ثلاثين يومًا');
  assert.equal(v.body.token, undefined);
  assert.equal(auth.verifyToken(ticket), null);
  assert.equal(sessionUser(ticket), null);
  // ولا بلصق البادئة (‹cx-job|الحمولة›.التوقيع يطابق HMAC الجلسة على النصّ نفسه) — الحمولة لا تُقرأ JSON
  const [p, s] = ticket.split('.');
  assert.equal(auth.verifyToken('cx-job|' + p + '.' + s), null);
  assert.equal(sessionUser('cx-job|' + p + '.' + s), null);
  assert.equal((await run(auth, { body: { action: 'verify', token: 'cx-job|' + p + '.' + s } })).status, 401);
});

test('٢. الوحدات غير الماليّة ترفض التذكرة وتقبل الجلسة الحقيقيّة', async () => {
  const tok = await user('victim');
  const ticket = await mintTicket('victim');
  const cases = [
    ['chats', require(rp('api/_lib/chats.js')), (t) => ({ body: { token: t, action: 'chats_load' } }), 401],
    ['memory', require(rp('api/_lib/memory.js')), (t) => ({ body: { token: t, op: 'get' } }), 401],
    ['reminders', require(rp('api/_lib/reminders.js')), (t) => ({ method: 'GET', headers: bearer(t) }), 401],
    ['push-subscribe', require(rp('api/_lib/push-subscribe.js')), (t) => ({ method: 'DELETE', headers: bearer(t) }), 401],
    ['share', require(rp('api/_lib/share.js')), (t) => ({ method: 'DELETE', query: { id: 'nope' }, headers: bearer(t) }), 401],
  ];
  for (const [name, h, req, refused] of cases) {
    const bad = await run(h, req(ticket));
    assert.equal(bad.status, refused, name + ': التذكرة ' + JSON.stringify(bad.body));
    const good = await run(h, req(tok));
    assert.ok(good.status !== 401 && good.status !== 403 && good.status !== 'throw', name + ': الجلسة ' + good.status);
  }
});

test('٣. تذكرة المالك ليست صلاحيّة إدارة: admin-actions وadmin-stats ‏403، وجلسة المالك تمرّ', async () => {
  const own = await user('omran');
  await user('target1');
  const ticket = await mintTicket('omran');
  const actions = require(rp('api/_lib/admin-actions.js'));
  const stats = require(rp('api/_lib/admin-stats.js'));
  assert.equal((await run(actions, { body: { token: ticket, action: 'message', targetUsername: 'target1', text: 'x' } })).status, 403, 'كانت صلاحيّة لا تنتهي');
  assert.equal((await run(stats, { method: 'GET', query: { token: ticket } })).status, 403);
  assert.equal((await run(actions, { body: { token: own, action: 'message', targetUsername: 'target1', text: 'x' } })).status, 200);
  assert.equal((await run(stats, { method: 'GET', query: { token: own } })).status, 200);
});

test('٤. نسخ الوحدات الماليّة (لم تُمسّ) ترفض التذكرة الجديدة بمجال توقيعها: checkCarQuota ‏reason=auth', async () => {
  await user('victim');
  const ticket = await mintTicket('victim');
  const car = require(rp('api/_lib/_carUsage.js'));
  const q = await car.checkCarQuota(ticket);
  assert.equal(q.reason, 'auth', 'كانت التذكرة جلسة في مسار المال');
  assert.equal(q.username, null);
  assert.equal((await car.checkCarQuota(auth.makeToken('victim'))).username, 'victim', 'الجلسة الحقيقيّة كما هي');
});

test('٥. المهمّة متعدّدة المراحل تكمل بالتذكرة الجديدة، والتذكرة القديمة الشكل (سُكّت قبل النشر) تكمل أيضًا', async () => {
  await user('victim');
  const ticket = await mintTicket('victim');
  const photo = await run(cx, { body: Object.assign({}, JOB, { part: 'photo', jobTicket: ticket }) });
  assert.equal(photo.status, 200, JSON.stringify(photo.body));
  assert.equal(photo.body.photoImageBase64, 'aW1n');
  assert.equal((await run(cx, { body: Object.assign({}, JOB, { part: 'photo', jobTicket: ticket }) })).status, 409, 'المرحلة لمرّة واحدة');
  // تذكرة بالشكل القديم (HMAC على الحمولة نفسها) لمهمّة جارية لحظة النشر: تُقبل حتّى تنتهي بـe
  const [p] = ticket.split('.');
  const job = JSON.parse(Buffer.from(p, 'base64url').toString());
  const legacy = sign(Object.assign({}, job, { n: crypto.randomBytes(12).toString('hex') }));
  assert.equal((await run(cx, { body: Object.assign({}, JOB, { part: 'interior', jobTicket: legacy }) })).status, 200, 'نافذة القبول المزدوج');
  // لكنّ القديمة ليست جلسة بعد اليوم (بلا exp)
  assert.equal(auth.verifyToken(legacy), null);
  // والمنتهية تُرفض في الشكلين
  const expired = sign(Object.assign({}, job, { n: crypto.randomBytes(12).toString('hex'), e: Date.now() - 1000 }));
  assert.equal((await run(cx, { body: Object.assign({}, JOB, { part: 'interior', jobTicket: expired }) })).status, 401);
  assert.equal((await run(cx, { body: Object.assign({}, JOB, { part: 'interior', jobTicket: legacy.split('.')[0] + '.' + 'x'.repeat(43) }) })).status, 401);
});

test('٦. شكل الجلسة: auth.verifyToken وsessionUser يقبلان makeToken وحده', () => {
  const future = Date.now() + 3600e3;
  const rows = [
    [auth.makeToken('lina'), 'lina'],
    [sign({ u: 'lina', exp: future }), 'lina'],
    [sign({ u: 'lina' }), null], // بلا exp — كان يُقبل للأبد
    [sign({ u: 'lina', exp: Date.now() - 1 }), null],
    [sign({ u: 'lina', exp: String(future) }), null],
    [sign({ u: 5, exp: future }), null],
    [sign({ exp: future }), null],
    [sign({ u: '  ', exp: future }), null],
    [sign({ u: 'lina', exp: future }).slice(0, -2) + 'zz', null],
    [sign({ u: 'lina', exp: future }) + '.x', null],
    ['garbage', null], ['', null], [null, null],
  ];
  for (const [t, want] of rows) {
    assert.equal(auth.verifyToken(t), want, 'verifyToken ' + String(t).slice(0, 40));
    assert.equal(sessionUser(t), want, 'sessionUser ' + String(t).slice(0, 40));
  }
});

test('٧. لا نسخة تحقّق يدويّة في الوحدات غير الماليّة: كلّها عبر _session.js، ولا سرّ يُقرأ في نطاق الوحدة', () => {
  for (const f of ['chats', 'memory', 'reminders', 'push-subscribe', 'share', 'admin-actions', 'admin-stats', 'realtime-session']) {
    const src = fs.readFileSync(path.join(root, 'api/_lib', f + '.js'), 'utf8');
    assert.doesNotMatch(src, /createHmac/, f + ': نسخة تحقّق يدويّة');
    assert.doesNotMatch(src, /^const AUTH_SECRET = /m, f + ': السرّ في نطاق الوحدة');
    assert.match(src, /require\('\.\/_session\.js'\)/, f);
  }
  const cxSrc = fs.readFileSync(path.join(root, 'api/_lib/construction-create.js'), 'utf8');
  assert.doesNotMatch(cxSrc, /^const AUTH_SECRET = /m);
});
