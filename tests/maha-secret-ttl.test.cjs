// tests/maha-secret-ttl.test.cjs — v-maha-secret-ttl (فحص ثغرات المال ١١ أكتوبر ٢٠٢٦): المفتاح المؤقّت الذي يذهب للمتصفّح
// كان يُطلب بلا عمر، فيبقى صالحًا ٦٠٠ث (افتراضيّ المزوّد) ويفتح جلسات كثيرة — والخادم يخصم دقيقة الافتتاح مرّة واحدة،
// فمفتاح مدفوع واحد يفتح جلسات موازية بلا خصم. الآن العمر ٣٠ث (MAHA_SECRET_TTL_SEC بين ١٠ و٦٠٠)، ورفض الواجهة للحقل
// لا يكسر مها: يُحذف ويُعاد الطلب. تخفيف لا إغلاق — الجلسة الواحدة ما زالت تستمرّ بدقيقة مدفوعة واحدة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'maha-secret-ttl-secret';
process.env.OPENAI_API_KEY = 'sk-test';
delete process.env.MAHA_SECRET_TTL_SEC;
delete process.env.MAHA_TURN;
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
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
const handler = require(rp('api/_lib/realtime-session.js'));

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const bal = async (u) => (await points.readPoints(u)).points;

// مزوّد مزيّف ثابت للملفّ كلّه (PITFALLS: تبديل fetch لكلّ نداء يتسرّب) — كلّ اختبار يضع ردّه وتُلتقط الأجسام كاملة.
let reply = null;
let bodies = [];
global.fetch = async (url, init) => {
  assert.equal(url, 'https://api.openai.com/v1/realtime/client_secrets');
  const b = JSON.parse(init.body);
  bodies.push(b);
  const r = reply ? reply(b) : { status: 200, body: { value: 'ek_test' } };
  return new Response(JSON.stringify(r.body), { status: r.status });
};
async function mint(user, replyFn, extra) {
  reply = replyFn || null;
  bodies = [];
  const res = { code: 200, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send(b) { res.j = b; return res; }, end() { return res; } };
  await handler({ method: 'POST', headers: {}, socket: {}, body: Object.assign({ token: token(user), mode: 'assistant' }, extra || {}) }, res);
  return { code: res.code, j: res.j, bodies };
}

test('١. الافتراضيّ: المفتاح بعمر ٣٠ث في أعلى الجسم بجوار session، والجلسة نفسها كما كانت', async () => {
  users.set('a', { username: 'a', points: 70, mahaTrialUsed: true });
  const r = await mint('a');
  assert.equal(r.code, 200);
  assert.equal(r.j.clientSecret, 'ek_test');
  assert.equal(r.bodies.length, 1, 'نداء واحد للمزوّد — لا إعادة بلا سبب');
  assert.deepEqual(r.bodies[0].expires_after, { anchor: 'created_at', seconds: 30 });
  assert.deepEqual(Object.keys(r.bodies[0]).sort(), ['expires_after', 'session']);
  assert.equal(r.bodies[0].session.model, 'gpt-realtime-2.1');
  assert.equal(r.bodies[0].session.audio.input.turn_detection.type, 'semantic_vad');
  assert.equal(r.bodies[0].session.audio.output.speed, 1.0);
  assert.equal(r.j.turn, 'natural');
  const b = await mint('a', null, { mode: 'builder' });
  assert.equal(b.code, 200);
  assert.equal(b.bodies[0].expires_after.seconds, 30, 'وضع البناء يأخذ العمر نفسه');
});

test('٢. MAHA_SECRET_TTL_SEC يُقرأ داخل المعالج ويُحصر بين ١٠ و٦٠٠ (الفارغ وغير الرقميّ = ٣٠)', async () => {
  users.set('b', { username: 'b', points: 700, mahaTrialUsed: true });
  try {
    for (const [v, want] of [['15', 15], ['5', 10], ['600', 600], ['99999', 600], ['abc', 30], ['', 30]]) {
      process.env.MAHA_SECRET_TTL_SEC = v;
      const r = await mint('b');
      assert.equal(r.code, 200, v);
      assert.equal(r.bodies[0].expires_after.seconds, want, v);
    }
  } finally {
    delete process.env.MAHA_SECRET_TTL_SEC;
  }
});

test('٣. رفض يسمّي expires_after لا يكسر مها: يُحذف الحقل وحده، والسرعة والدور الطبيعيّ يبقيان، والخصم مرّة', async () => {
  users.set('c', { username: 'c', points: 70, mahaTrialUsed: true });
  const r = await mint('c', (b) => (b.expires_after
    ? { status: 400, body: { error: { message: "Unknown parameter: 'expires_after'.", param: 'expires_after' } } }
    : { status: 200, body: { value: 'ek_test' } }));
  assert.equal(r.code, 200);
  assert.equal(r.bodies.length, 2);
  assert.ok(r.bodies[0].expires_after && !('expires_after' in r.bodies[1]));
  assert.equal(r.j.turn, 'natural');
  assert.equal(r.bodies[1].session.audio.input.turn_detection.type, 'semantic_vad');
  assert.equal(r.bodies[1].session.audio.output.speed, 1.0);
  assert.equal(await bal('c'), 70 - points.COSTS.maha_minute, 'دقيقة الافتتاح تُخصم مرّة واحدة');

  // رفض يسمّي حقلًا آخر (كشف المعنى): يُعالَج بخطّافه، والعمر لا يُحذف بلا داعٍ.
  const t = await mint('c', (b) => (b.session.audio.input.turn_detection.type === 'semantic_vad'
    ? { status: 400, body: { error: { message: "Invalid value: 'semantic_vad'.", param: 'session.audio.input.turn_detection' } } }
    : { status: 200, body: { value: 'ek_test' } }));
  assert.equal(t.code, 200);
  assert.equal(t.bodies.length, 2);
  assert.ok(t.bodies.every((b) => b.expires_after && b.expires_after.seconds === 30), 'العمر باقٍ في كلّ المحاولات');
  assert.equal(t.j.turn, 'classic');
});

test('٤. رفض ٤٠٠ بلا تسمية لا يزول إلّا بحذف العمر: يتّصل أخيرًا؛ وخطأ المفتاح (٤٠١) لا يحذفه ويُردّ الخصم', async () => {
  users.set('d', { username: 'd', points: 70, mahaTrialUsed: true });
  const r = await mint('d', (b) => (b.expires_after
    ? { status: 400, body: { error: { message: 'Invalid request.' } } }
    : { status: 200, body: { value: 'ek_test' } }));
  assert.equal(r.code, 200);
  assert.equal(r.j.clientSecret, 'ek_test');
  assert.ok(r.bodies.length <= 5, 'ضمن سباق الإعداد: ' + r.bodies.length + ' نداءات');
  assert.ok(!('expires_after' in r.bodies[r.bodies.length - 1]), 'المحاولة الأخيرة بلا عمر');
  assert.ok(r.bodies.slice(0, -1).every((b) => b.expires_after), 'الحذف آخر خطوة — بقيّة الخطّافات تُجرَّب قبله كما كانت');
  assert.equal(await bal('d'), 70 - points.COSTS.maha_minute);

  const k = await mint('d', () => ({ status: 401, body: { error: { message: 'Incorrect API key provided.' } } }));
  assert.equal(k.code, 503); // v-maha-paused: خطأ مفتاح المزوّد رمز unavailable لا حالته
  assert.ok(k.bodies.every((b) => b.expires_after), 'لا حذف للعمر على خطأ المفتاح');
  assert.equal(await bal('d'), 70 - points.COSTS.maha_minute, 'الجلسة لم تُفتح ⇒ دقيقة الافتتاح رُدّت');
});

test('٥. العمر الافتراضيّ أطول من سباق إعداد العميل — المكالمة الأمينة لا تصطدم بانتهاء المفتاح', async () => {
  users.set('e', { username: 'e', points: 70, mahaTrialUsed: true });
  const r = await mint('e');
  const ttlMs = r.bodies[0].expires_after.seconds * 1000;
  const mc = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
  const race = Number((mc.match(/reject\(new Error\('Realtime setup timed out'\)\), (\d+)\)/) || [])[1]);
  assert.ok(race > 0, 'سباق الإعداد في app-08-maha.js لم يُعثر عليه');
  assert.ok(ttlMs > race, 'العمر ' + ttlMs + 'م.ث يجب أن يتجاوز السباق ' + race + 'م.ث');
});
