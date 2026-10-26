// tests/maha-paused.test.cjs — أمر المالك ٢١ أكتوبر (إصلاحات، مسموحة في التجميد):
// ١) «مكالمة مها: إذا رصيد المزوّد خلصان تطلع «الخدمة متوقفة مؤقتاً»، مو «نقاطك خلصت». وممنوع يطلع [object Object] أبداً.» (v-maha-paused)
// ٢) «تغيير الخلفية قبل كتابة النص: الطلب لازم ينرسل مع تسجيل الدخول.» (v-vis-edit-auth)
// ٣) «دقيقة مكالمة مها الأولى: النقاط ترجع لنفس المحفظة اللي انخصمت منها.» (v-maha-refund-kind)
// العرض قبل الإصلاح: realtime-session وstt يمرّران ردّ المزوّد بحالته ونصّه — 402 رصيده يقرؤه العميل «نقاطك خلصت» فيفتح الباقات،
// وكائن خطأه يصير نصًّا «[object Object]»؛ طلب تغيير الخلفية بلا token فيُرفض 401 دائمًا؛ ردّ دقيقة الافتتاح بلا نوع الخصم.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'maha-paused-secret';
process.env.OPENAI_API_KEY = 'sk-test';
process.env.GROQ_API_KEY = 'gsk-test';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvExpire: async () => {},
});
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => (users.has(u) ? structuredClone(users.get(u)) : null),
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/_usage.js', { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {} });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });

const points = require(rp('api/_lib/points.js'));
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const bal = async (u) => (await points.readPoints(u)).points;
function resObj() {
  const res = { code: 200, j: null, raw: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send(b) { res.raw = b; return res; }, end() { return res; } };
  return res;
}
const QUOTA = JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } });

async function mint(user, upstream) {
  const realFetch = global.fetch, realErr = console.error;
  global.fetch = upstream; console.error = () => {};
  const res = resObj();
  try {
    delete require.cache[rp('api/_lib/realtime-session.js')];
    await require(rp('api/_lib/realtime-session.js'))({ method: 'POST', headers: {}, socket: {}, body: { token: token(user), mode: 'assistant' } }, res);
  } finally { global.fetch = realFetch; console.error = realErr; }
  return res;
}

test('١. مكالمة مها: رصيد مزوّد الصوت نفد (402 أو 429 insufficient_quota) = 503 unavailable نصًّا — لا 402 يفتح «نقاطك خلصت» ولا كائن خطأ', async () => {
  for (const [st, body] of [[402, '{"error":{"message":"Payment required","type":"billing"}}'], [429, QUOTA]]) {
    users.set('caller', { username: 'caller', points: 70, mahaTrialUsed: true });
    const r = await mint('caller', async () => new Response(body, { status: st }));
    assert.equal(r.code, 503, st + ': كانت حالة المزوّد نفسها (' + r.code + ')');
    assert.ok(r.j && r.j.error === 'unavailable', st + ': رمز نصّيّ — كان ردّ المزوّد الخامّ ' + String(r.raw).slice(0, 60));
    assert.equal(r.raw, null, 'لا يُمرَّر نصّ المزوّد');
    assert.equal(await bal('caller'), 70, st + ': دقيقة الافتتاح رُدّت');
  }
  // عطل المزوّد الآخر (طلب مرفوض) رمز نصّيّ كذلك — العميل يكمل بالوضع الأساسيّ كما كان
  users.set('caller2', { username: 'caller2', points: 70, mahaTrialUsed: true });
  const bad = await mint('caller2', async () => new Response('{"error":{"message":"Invalid value for session.voice"}}', { status: 400 }));
  assert.equal(typeof (bad.j && bad.j.error), 'string');
  assert.notEqual(bad.code, 402);
});

test('١ب. التفريغ الصوتيّ (مها الأساسيّة وتبويب الصوت): رفض المزوّد رمز نصّيّ — unavailable لرصيده — لا كائن خطأ', async () => {
  const realFetch = global.fetch, realErr = console.error;
  global.fetch = async () => new Response(QUOTA, { status: 429 }); console.error = () => {};
  const res = resObj();
  try {
    delete require.cache[rp('api/_lib/stt.js')];
    await require(rp('api/_lib/stt.js'))({ method: 'POST', headers: {}, socket: {}, body: { audioBase64: Buffer.from('x'.repeat(2000)).toString('base64'), mimeType: 'audio/webm', token: token('caller') } }, res);
  } finally { global.fetch = realFetch; console.error = realErr; }
  assert.equal(res.code, 503);
  assert.deepEqual(res.j, { error: 'unavailable' }, 'كان ردّ المزوّد الخامّ: ' + String(res.raw).slice(0, 60));
});

test('١ج. الواجهة: لا تحوّل كائن خطأ نصًّا أبدًا، وunavailable = «الخدمة متوقّفة مؤقّتًا» (svcPaused القائم بالـ14 لغة)', () => {
  const m = read('js/app-08-maha.js');
  assert.match(m, /throw new Error\(\(tokenData && typeof tokenData\.error === 'string'\) \? tokenData\.error : /, 'جلسة مها');
  assert.doesNotMatch(m, /throw new Error\(\(tokenData && tokenData\.error\) \? tokenData\.error/, 'الصيغة القديمة');
  // v-audit-voice (cli-voice-8): نصّ الفشل من الحالة والرمز (voiceSttErrorText في app-07) — لا نصّ الخادم الخامّ ولا بين قوسين
  assert.match(m, /mahaSetState\('error', voiceSttErrorText\(res\.status, data\)\);/, 'تفريغ مها');
  assert.doesNotMatch(m, /String\(data\.error\)/, 'String(كائن) = [object Object]');
  const v = read('js/app-07-voice.js');
  assert.match(v, /if\(code === 'unavailable'\) return t\('svcPaused'\);/, 'unavailable = svcPaused');
  assert.equal((v.match(/alert\(voiceSttErrorText\(res\.status, data\)\);/g) || []).length, 2, 'تبويب الصوت');
  assert.doesNotMatch(v, /alert\(data && data\.error \? data\.error : /);
});

test('٢. تغيير الخلفية قبل كتابة النصّ يُرسل الجلسة (كان بلا token فيرفضه maha-image بـ401 دائمًا)', () => {
  const a = read('js/app-09-attach.js');
  const i = a.indexOf('body: JSON.stringify({ prompt:__visEdit,');
  assert.ok(i > 0, 'طلب تغيير الخلفية');
  const body = a.slice(i, a.indexOf('\n', i));
  assert.match(body, /token: authGet\('aiapp_auth_token'\)/, 'الجلسة');
  assert.match(body, /guestId: window\.getGuestId\(\)/, 'الضيف كبقيّة طلبات الصور');
  // الخادم يرفض بلا جلسة ولا ضيف — هذا ما كان يُسقط الخطوة
  assert.match(read('api/_lib/maha-image.js'), /auth_required/);
});

test('٣. دقيقة الافتتاح تُردّ إلى المحفظة التي خُصمت منها (نوع الخصم مع الردّ)', async () => {
  const orig = points.refundPoints;
  const seen = [];
  points.refundPoints = async (u, n, how) => { seen.push([u, n, how]); return orig(u, n, how); };
  try {
    users.set('payer', { username: 'payer', points: 70, mahaTrialUsed: true });
    const r = await mint('payer', async () => new Response('{"error":{"message":"boom"}}', { status: 500 }));
    assert.notEqual(r.code, 200);
    assert.equal(seen.length, 1, 'ردّ واحد');
    assert.equal(seen[0][1], points.COSTS.maha_minute);
    assert.ok(seen[0][2] && seen[0][2].ok === true, 'الردّ يحمل نتيجة الخصم نفسها (نوعه) — كان بلا نوع فيطابق points.js تذكرة اشتراك بالجشع');
    assert.equal(await bal('payer'), 70);
  } finally { points.refundPoints = orig; }
});
