'use strict';
/* tests/audit-fix-mahakv.test.cjs — v-audit-mahakv (فحص التطبيق كاملًا، عنقود «مها والتذكيرات + قراءة KV الصارمة»).
   المعالجات الحقيقيّة (check-reminders وreminders وpush-subscribe وclient-errors وapi/edu.js) مع kv.js الحقيقيّ فوق خادم
   Upstash مزيّف في fetch (يحقن أعطالًا: 503 أو ردّ 200 لا يُقرأ)، وAladhan مزيّف بمنطقته الزمنيّة، وweb-push مسجِّل،
   وساعة مزيّفة للمحاكاة دقيقةً دقيقة. كلّ اختبار يبدأ بمعرّف البند ويفشل على ما قبل الإصلاح. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'mahakv-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://kv.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'kv-test-token';
process.env.VAPID_PUBLIC_KEY = 'test-vapid-public';
process.env.VAPID_PRIVATE_KEY = 'test-vapid-private';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.CRON_SECRET;
delete process.env.MONITOR_KEY;
delete process.env.OPENROUTER_API_KEY;

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

/* ---------- ساعة مزيّفة ---------- */
const RealDate = Date;
let clock = null;
const nowMs = () => (clock != null ? clock : RealDate.now());
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(nowMs()); }
  static now() { return nowMs(); }
}
async function withClock(at, fn) {
  clock = at; global.Date = FakeDate;
  try { return await fn(); } finally { global.Date = RealDate; clock = null; }
}

/* ---------- Upstash مزيّف (أوامر JSON كما يرسلها kv.js) ---------- */
const store = new Map(); // key -> { v, exp }
let failRules = []; // { pred, mode, left }
function kget(k) { const e = store.get(k); if (!e) return null; if (e.exp && e.exp <= nowMs()) { store.delete(k); return null; } return e.v; }
function runCmd(c) {
  const op = String(c[0]).toUpperCase(); const a = c.slice(1);
  if (op === 'GET') return kget(a[0]);
  if (op === 'SET') {
    let nx = false, ex = 0;
    for (let i = 2; i < a.length; i++) { const t = String(a[i]).toUpperCase(); if (t === 'NX') nx = true; else if (t === 'EX') ex = Number(a[++i]); }
    if (nx && kget(a[0]) != null) return null;
    store.set(a[0], { v: String(a[1]), exp: ex ? nowMs() + ex * 1000 : 0 });
    return 'OK';
  }
  if (op === 'DEL') return store.delete(a[0]) ? 1 : 0;
  if (op === 'SCAN') { const pre = String(a[2]).replace(/\*$/, '').replace(/\\(.)/g, '$1'); return ['0', [...store.keys()].filter((k) => k.startsWith(pre) && kget(k) != null)]; }
  if (op === 'INCR' || op === 'INCRBY' || op === 'DECRBY') {
    const d = op === 'INCR' ? 1 : (op === 'INCRBY' ? Number(a[1]) : -Number(a[1]));
    const e = store.get(a[0]); const n = Number(kget(a[0]) || 0) + d;
    store.set(a[0], { v: String(n), exp: e ? e.exp : 0 }); return n;
  }
  if (op === 'EXPIRE') { const e = store.get(a[0]); if (!e) return 0; e.exp = nowMs() + Number(a[1]) * 1000; return 1; }
  throw new Error('fake upstash: ' + op);
}
const failNext = (pred, mode = '503', times = 1) => failRules.push({ pred, mode, left: times });

const aladhan = { calls: [], handler: null };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
global.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://kv.test')) {
    await new Promise((r) => setImmediate(r)); // ذهاب وإياب شبكة: الطلبات المتزامنة تتداخل كما في الحقيقة
    const cmd = JSON.parse(init.body);
    const rule = failRules.find((f) => f.left > 0 && f.pred(cmd));
    if (rule) {
      rule.left--;
      if (rule.mode === 'html200') return new Response('<html>proxy</html>', { status: 200 });
      return json({ error: 'upstream 503' }, 503);
    }
    return json({ result: runCmd(cmd) });
  }
  if (u.includes('api.aladhan.com')) { aladhan.calls.push(u); return aladhan.handler(u); }
  throw new Error('unexpected fetch ' + u);
};

/* ---------- web-push مسجِّل ---------- */
const pushes = [];
let pushImpl = null;
const wpPath = require.resolve('web-push', { paths: [path.join(root, 'api/_lib')] });
require.cache[wpPath] = { id: wpPath, filename: wpPath, loaded: true, exports: {
  setVapidDetails() {},
  async sendNotification(sub, payload, opts) {
    pushes.push({ endpoint: sub.endpoint, body: JSON.parse(payload).body, opts, at: nowMs() });
    if (pushImpl) return pushImpl(sub, payload, opts);
    return { statusCode: 201 };
  },
} };

/* ---------- جلسات ---------- */
const sign = (p) => crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
const makeToken = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: RealDate.now() + 3600e3 })).toString('base64url'); return p + '.' + sign(p); };
const bearer = (u) => ({ authorization: 'Bearer ' + makeToken(u) });

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = {
      code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader() { return undefined; },
      status(c) { this.code = c; return this; },
      json(j) { resolve({ code: this.code, j }); return this; },
      end() { resolve({ code: this.code }); return this; },
    };
    Promise.resolve(handler(Object.assign({ method: 'GET', headers: {}, query: {} }, req), res)).catch(reject);
  });
}

const kvMod = require(rp('api/_lib/kv.js'));
const reminders = require(rp('api/_lib/reminders.js'));
const pushSub = require(rp('api/_lib/push-subscribe.js'));
const cron = require(rp('api/_lib/check-reminders.js'));
const prayerPlan = require(rp('api/_lib/prayer-plan.js'));
const clientErrors = require(rp('api/_lib/client-errors.js'));

const P256 = Buffer.alloc(65, 4).toString('base64url');
const AUTHK = Buffer.alloc(16, 7).toString('base64url');
const subFor = (u) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/' + u, expirationTime: null, keys: { p256dh: P256, auth: AUTHK } });
const remKey = (u) => 'db/reminders/' + encodeURIComponent(u) + '.json';
const subKey = (u) => 'db/push-subs/' + encodeURIComponent(u) + '.json';
const seedUser = (u, list, sub) => { store.set(remKey(u), { v: JSON.stringify(list), exp: 0 }); store.set(subKey(u), { v: JSON.stringify(sub === undefined ? subFor(u) : sub), exp: 0 }); };
const listOf = (u) => JSON.parse(kget(remKey(u)) || 'null');
function resetAll() { store.clear(); failRules = []; pushes.length = 0; pushImpl = null; aladhan.calls.length = 0; aladhan.handler = null; }
const tick = () => call(cron, { method: 'GET', query: { tick: '1' } });
const TIMINGS = { Fajr: '04:15', Sunrise: '05:40', Dhuhr: '12:00', Asr: '15:20', Maghrib: '18:10', Isha: '21:40' };

/* ================= srv-maha-1 ================= */
test('srv-maha-1: ترويسة User-Agent أو x-vercel-cron المزوّرة لا تفتح الدورة ولا تتخطّى القفل؛ Vercel Cron بـCRON_SECRET وحده، والقفل للجميع', async () => {
  resetAll();
  const due = () => [{ id: 'o1', type: 'once', message: 'تذكير', timeISO: new RealDate(RealDate.now() - 20000).toISOString(), active: true }];
  seedUser('cronu', due());
  const forged = await Promise.all(Array.from({ length: 10 }, (_, i) => call(cron, { headers: i % 2 ? { 'user-agent': 'vercel-cron/1.0' } : { 'x-vercel-cron': '1' } })));
  assert.deepEqual(forged.map((r) => r.code), Array(10).fill(401), 'ترويسة يرسلها العميل ليست مصادقة');
  assert.equal(pushes.length, 0, 'لا دورة بلا مصادقة');

  const ticks = await Promise.all(Array.from({ length: 10 }, () => call(cron, { headers: { 'user-agent': 'vercel-cron/1.0' }, query: { tick: '1' } })));
  assert.equal(pushes.length, 1, 'عشر نبضات متوازية = دورة واحدة = إشعار واحد');
  assert.equal(ticks.filter((r) => r.j && r.j.skipped === 'locked').length, 9);

  process.env.CRON_SECRET = 'cron-secret';
  try {
    seedUser('cronu', due());
    const held = await call(cron, { headers: { authorization: 'Bearer cron-secret' } });
    assert.equal(held.j.skipped, 'locked', 'الكرون الموثَّق يأخذ القفل نفسه فلا تتزامن دورتان');
    store.delete('reminders:tick-lock');
    const ok = await call(cron, { headers: { authorization: 'Bearer cron-secret' } });
    assert.equal(ok.code, 200); assert.equal(ok.j.ok, true); assert.equal(ok.j.sent, 1);
    store.delete('reminders:tick-lock');
    assert.equal((await call(cron, { headers: { authorization: 'Bearer wrong', 'user-agent': 'vercel-cron/1.0' } })).code, 401);
  } finally { delete process.env.CRON_SECRET; }
  process.env.MONITOR_KEY = 'mon-key';
  try {
    store.delete('reminders:tick-lock');
    assert.equal((await call(cron, { query: { key: 'mon-key' } })).j.ok, true);
    assert.equal((await call(cron, { query: { key: 'mon-key' } })).j.skipped, 'locked', 'مفتاح المراقبة يأخذ القفل أيضًا');
  } finally { delete process.env.MONITOR_KEY; }
});

/* ================= srv-maha-2 ================= */
test('srv-maha-2: تنبيه الصلاة يصل مرّة كلّ يوم في موعده الحقيقيّ — فجر جاكرتا (قبل منتصف ليل UTC) وعشاء نيويورك (بعده) وفجر دبي', async () => {
  resetAll();
  const ZONES = { '-6.2,106.8': 'Asia/Jakarta', '40.7,-74': 'America/New_York', '25.2,55.27': 'Asia/Dubai' };
  aladhan.handler = (u) => {
    const m = u.match(/latitude=([-\d.]+)&longitude=([-\d.]+)/);
    return json({ code: 200, data: { timings: TIMINGS, meta: { timezone: ZONES[m[1] + ',' + m[2]] } } });
  };
  const pr = (id, name, lat, lng) => [{ id, type: 'prayer', prayerName: name, offsetMinutes: 0, lat, lng, method: 4, active: true, message: name }];
  seedUser('jkt', pr('pj', 'Fajr', -6.2, 106.8));
  seedUser('nyc', pr('pn', 'Isha', 40.7, -74));
  seedUser('dxb', pr('pd', 'Fajr', 25.2, 55.27));
  const start = RealDate.UTC(2026, 6, 10, 0, 0);
  for (let i = 0; i < 3 * 1440; i++) await withClock(start + i * 60000, tick);
  const at = (u) => pushes.filter((p) => p.endpoint.endsWith('/' + u)).map((p) => new RealDate(p.at).toISOString().slice(0, 16));
  assert.deepEqual(at('jkt'), ['2026-07-10T21:15', '2026-07-11T21:15', '2026-07-12T21:15'], 'فجر جاكرتا ٠٤:١٥ = ٢١:١٥ UTC من اليوم السابق');
  assert.deepEqual(at('nyc'), ['2026-07-10T01:40', '2026-07-11T01:40', '2026-07-12T01:40'], 'عشاء نيويورك ٢١:٤٠ = ٠١:٤٠ UTC من اليوم التالي');
  assert.deepEqual(at('dxb'), ['2026-07-10T00:15', '2026-07-11T00:15', '2026-07-12T00:15'], 'العيّنة الضابطة كما كانت');
  assert.ok(aladhan.calls.length <= 3 * 3 * 3, 'جلب محدود: ' + aladhan.calls.length);
});

/* ================= srv-maha-3 ================= */
test('srv-maha-3: اشتراك الدفع يُقبل من خدمات الدفع المعروفة وحدها (https، المنفذ الافتراضيّ، مفاتيح صحيحة) ويُخزَّن منقًّى', async () => {
  resetAll();
  const hdr = bearer('subu');
  const post = (subscription) => call(pushSub, { method: 'POST', headers: hdr, body: { subscription } });
  const KEYS = { p256dh: P256, auth: AUTHK };
  for (const endpoint of ['https://10.255.255.1/x', 'https://169.254.169.254:8443/x', 'https://127.0.0.1/x', 'http://fcm.googleapis.com/fcm/send/a',
    'https://fcm.googleapis.com.evil.example/x', 'https://evil.example/fcm.googleapis.com', 'https://fcm.googleapis.com:8443/x', 'https://user@fcm.googleapis.com/x', 'not a url']) {
    assert.equal((await post({ endpoint, keys: KEYS })).code, 400, endpoint);
  }
  assert.equal((await post({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: { p256dh: 'abc', auth: AUTHK } })).code, 400, 'p256dh ليس ٦٥ بايت');
  assert.equal((await post({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: { p256dh: P256 } })).code, 400, 'بلا auth');
  assert.equal((await post({ endpoint: 'https://fcm.googleapis.com/' + 'a'.repeat(5000), keys: KEYS })).code, 400, 'رابط بلا سقف');
  assert.equal(kget(subKey('subu')), null, 'لا شيء خُزّن');
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/QAbc', 'https://wns2-par02p.notify.windows.com/w/?token=abc']) {
    const r = await post({ endpoint, keys: KEYS, expirationTime: null, junk: 'x'.repeat(20000) });
    assert.equal(r.code, 200, endpoint);
    assert.deepEqual(JSON.parse(kget(subKey('subu'))), { endpoint, expirationTime: null, keys: KEYS }, 'الحقول المعروفة وحدها');
  }
});

test('srv-maha-3: الكرون يرسل بمهلة، ويتخطّى اشتراكًا قديمًا لمضيف غير معروف، ويحذف الاشتراك الميّت (410) فلا تعلق الدورة', async () => {
  resetAll();
  const due = (id) => [{ id, type: 'once', message: 'ت', timeISO: new RealDate(RealDate.now() - 10000).toISOString(), active: true }];
  seedUser('legacy', due('l1'), { endpoint: 'https://10.255.255.1:8443/x', keys: { p256dh: P256, auth: AUTHK } });
  seedUser('gone', due('g1'));
  seedUser('fine', due('f1'));
  pushImpl = async (sub) => { if (sub.endpoint.endsWith('/gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; } return { statusCode: 201 }; };
  const r = await tick();
  assert.equal(r.code, 200);
  assert.ok(!pushes.some((p) => p.endpoint.includes('10.255.255.1')), 'لا طلب إلى مضيف يختاره المستخدم');
  assert.deepEqual(pushes.map((p) => p.endpoint.split('/').pop()).sort(), ['fine', 'gone']);
  for (const p of pushes) assert.ok(p.opts && Number.isFinite(p.opts.timeout) && p.opts.timeout > 0 && p.opts.timeout <= 10000, 'مهلة ≤ ١٠ث');
  assert.equal(kget(subKey('gone')), null, 'اشتراك 410 حُذف');
  assert.ok(kget(subKey('fine')), 'السليم باقٍ');
});

/* ================= srv-maha-4 ================= */
test('srv-maha-4: عطل قراءة KV عابر عند الإضافة أو الحذف يعيد 503 بلا كتابة — والتذكيرات الثلاثة باقية', async () => {
  resetAll();
  const three = [
    { id: 'a', type: 'prayer', prayerName: 'Fajr', lat: 25.2, lng: 55.27, active: true },
    { id: 'b', type: 'prayer', prayerName: 'Asr', lat: 25.2, lng: 55.27, active: true },
    { id: 'c', type: 'daily', hour: 5, minute: 0, active: true },
  ];
  seedUser('wipe', three);
  const isListGet = (c) => c[0] === 'GET' && c[1] === remKey('wipe');
  failNext(isListGet, '503');
  const add = await call(reminders, { method: 'POST', headers: bearer('wipe'), body: { type: 'daily', hour: 6, minute: 30, message: 'جديد' } });
  assert.equal(add.code, 503, JSON.stringify(add.j));
  assert.deepEqual(listOf('wipe').map((r) => r.id), ['a', 'b', 'c']);
  failNext(isListGet, 'html200');
  const add2 = await call(reminders, { method: 'POST', headers: bearer('wipe'), body: { type: 'daily', hour: 6, minute: 30 } });
  assert.equal(add2.code, 503, 'ردّ 200 لا يُقرأ ليس «لا تذكيرات»');
  failNext(isListGet, '503');
  const del = await call(reminders, { method: 'DELETE', headers: bearer('wipe'), query: { id: 'zzz' } });
  assert.equal(del.code, 503);
  assert.deepEqual(listOf('wipe').map((r) => r.id), ['a', 'b', 'c']);
  // بلا عطل يعمل كما كان
  const ok = await call(reminders, { method: 'POST', headers: bearer('wipe'), body: { type: 'daily', hour: 6, minute: 30, message: 'جديد' } });
  assert.equal(ok.code, 200);
  assert.equal(listOf('wipe').length, 4);
  // القراءة المتسامحة باقية للقراءة وحدها، والصارمة ترمي
  failNext((c) => c[0] === 'GET', '503');
  assert.equal(await kvMod.kvGetJSON(remKey('wipe')), null);
  failNext((c) => c[0] === 'GET', '503');
  await assert.rejects(kvMod.kvGetJSON(remKey('wipe'), { strict: true }));
  assert.equal(await kvMod.kvGetJSON('db/none', { strict: true }), null, 'المفتاح غير الموجود = null');
});

/* ================= srv-maha-5 ================= */
test('srv-maha-5: حقول التذكير تُتحقَّق (اسم الصلاة، الوقت، الإحداثيّات) وسقف ٣٠ تذكيرًا للحساب', async () => {
  resetAll();
  const post = (body) => call(reminders, { method: 'POST', headers: bearer('cap'), body });
  assert.equal((await post({ type: 'prayer', prayerName: 'X', lat: 25.2, lng: 55.27 })).code, 400, 'اسم صلاة غير معروف');
  assert.equal((await post({ type: 'once', timeISO: 'not-a-date' })).code, 400, 'وقت ليس تاريخًا');
  assert.equal((await post({ type: 'once', timeISO: new RealDate(RealDate.now() - 3 * 3600e3).toISOString() })).code, 400, 'وقت مضى');
  assert.equal((await post({ type: 'once', timeISO: new RealDate(RealDate.now() + 5 * 365 * 86400e3).toISOString() })).code, 400, 'بعد خمس سنين');
  assert.equal((await post({ type: 'prayer', prayerName: 'Asr', lat: 999, lng: 55 })).code, 400, 'خطّ عرض خارج المدى');
  const okOnce = await post({ type: 'once', timeISO: new RealDate(RealDate.now() + 3600e3).toISOString() });
  assert.equal(okOnce.code, 200);
  const big = await post({ type: 'prayer', prayerName: 'Asr', lat: 25.2, lng: 55.27, offsetMinutes: 1e9 });
  assert.equal(big.code, 200);
  assert.ok(Math.abs(big.j.reminder.offsetMinutes) <= 180, 'الدقائق قبل الصلاة محدودة');
  for (let i = listOf('cap').length; i < 30; i++) assert.equal((await post({ type: 'daily', hour: 1, minute: i })).code, 200);
  const over = await post({ type: 'daily', hour: 2, minute: 0 });
  assert.equal(over.code, 400);
  assert.equal(over.j.error, 'reminders_limit');
  assert.equal(listOf('cap').length, 30);
});

test('srv-maha-5: الكرون: مواقيت الموقع تُجلب مرّة للدورة لا لكلّ تذكير، والاسم غير المعروف لا يجلب، وعطل Aladhan يؤجَّل ١٠ دقائق', async () => {
  resetAll();
  aladhan.handler = () => json({ data: { timings: TIMINGS, meta: { timezone: 'Asia/Dubai' } } });
  const names = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, type: 'prayer', prayerName: names[i % 6], offsetMinutes: 0, lat: 25.2, lng: 55.27, method: 4, active: true }));
  for (let i = 0; i < 10; i++) many.push({ id: 'x' + i, type: 'prayer', prayerName: 'X', offsetMinutes: 0, lat: 25.2, lng: 55.27, method: 4, active: true });
  seedUser('many', many);
  const t0 = RealDate.UTC(2026, 9, 26, 6, 0);
  for (let i = 0; i < 3; i++) await withClock(t0 + i * 60000, tick);
  assert.ok(aladhan.calls.length <= 4, 'جلبات اليوم لموقع واحد: ' + aladhan.calls.length);

  resetAll();
  aladhan.handler = () => json({ code: 500 }, 500);
  seedUser('down', names.map((n, i) => ({ id: 'd' + i, type: 'prayer', prayerName: n, offsetMinutes: 0, lat: 21.4, lng: 39.8, method: 4, active: true })));
  for (let i = 0; i < 10; i++) await withClock(t0 + i * 60000, tick);
  assert.ok(aladhan.calls.length <= 1, 'عشر دقائق من عطل Aladhan = محاولة واحدة لا ٦٠: ' + aladhan.calls.length);
  await withClock(t0 + 11 * 60000, tick);
  assert.ok(aladhan.calls.length >= 2 && aladhan.calls.length <= 2, 'يعيد بعد عشر دقائق: ' + aladhan.calls.length);
});

/* ================= srv-maha-7 ================= */
test('srv-maha-7: نصّ الاستخارة المأثور بأيّ صيغة للكلمة، وللدعاء وحده لا للشعر — ودعاء السفر المأثور بالآليّة نفسها', () => {
  const plan = {
    prayerText: 'اللهم يسّر لي أمري واكتب لي الخير حيث كان ثم رضني به يا كريم',
    visualBrief: 'A quiet stone courtyard at first light, a single folded prayer shawl resting on a carved cedar bench, long cool shadows across warm limestone. Eye-level view, sage and sand palette, calm empty lower band.',
    topicLabel: 'الاستخارة',
  };
  for (const req of ['دعاء الاستخارة', 'صورة دعاء استخارة', 'ابي دعاء استخاره للزواج', 'دعاء الأستخارة', 'دعاء إستخارة لوظيفة', 'istikhara dua']) {
    assert.match(prayerPlan.validatePrayerPlan(plan, req).prayerText, /فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ/, req);
  }
  const poem = { ...plan, prayerText: 'إذا ضاقت بك الدروب فاستخر ربك\nفالخير فيما اختاره الله لا فيما تريد' };
  assert.equal(prayerPlan.validatePrayerPlan(poem, 'قصيدة عن الاستخارة', 'poetry').prayerText, poem.prayerText, 'الشعر يبقى شعرًا');
  assert.equal(prayerPlan.validatePrayerPlan(poem, 'عبارة عن الاستخارة', 'phrase').prayerText, poem.prayerText);
  const travel = prayerPlan.validatePrayerPlan(plan, 'صورة دعاء السفر');
  assert.match(travel.prayerText, /سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا/);
  assert.match(travel.prayerText, /وَعْثَاءِ السَّفَرِ/);
  assert.equal(prayerPlan.validatePrayerPlan(plan, 'دعاء لابني المسافر').prayerText, plan.prayerText, 'دعاء لمسافر ليس دعاء السفر المأثور');
  const prompt = prayerPlan.buildPlannerPrompt('دعاء الكرب المأثور');
  assert.match(prompt, /For supplications only[^\n]*transmitted wording[^\n]*the word limit does not apply to it/i, 'المأثور خارج قيد ١٠–٢٢ كلمة');
});

test('srv-maha-7: authorPrayerPlan يمرّر نوع النصّ إلى التدقيق (قصيدة عن الاستخارة لا تُستبدل بالدعاء)', async () => {
  const poem = { prayerText: 'إذا ضاقت بك الدروب فاستخر ربك\nفالخير فيما اختاره الله لا فيما تريد', visualBrief: 'A quiet stone courtyard at first light, a single folded shawl resting on a carved cedar bench, long cool shadows across warm limestone. Eye-level view, sage and sand palette.', topicLabel: 'الاستخارة' };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(poem) }] } }] }) });
  const r = await prayerPlan.authorPrayerPlan('k', 'قصيدة عن الاستخارة', { fetchImpl, kind: 'poetry', directionIndex: 0 });
  assert.equal(r.prayerText, poem.prayerText);
});

/* ================= srv-maha-9 ================= */
test('srv-maha-9: خمسة POST متوازية (moveAlertsTo لكلّ جرس) تبقى خمسة، وحذف متزامن لا يعيد شيئًا', async () => {
  resetAll();
  const ps = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const rs = await Promise.all(ps.map((p) => call(reminders, { method: 'POST', headers: bearer('race'), body: { type: 'prayer', prayerName: p, lat: 25.2, lng: 55.27, offsetMinutes: 10 } })));
  assert.deepEqual(rs.map((r) => r.code), [200, 200, 200, 200, 200]);
  assert.deepEqual(listOf('race').map((r) => r.prayerName).sort(), [...ps].sort(), 'لا يكتب طلب فوق آخر');
  const ids = rs.map((r) => r.j.reminder.id);
  const dels = await Promise.all(ids.slice(0, 3).map((id) => call(reminders, { method: 'DELETE', headers: bearer('race'), query: { id } })));
  assert.deepEqual(dels.map((r) => r.code), [200, 200, 200]);
  assert.deepEqual(listOf('race').map((r) => r.id).sort(), ids.slice(3).sort());
  assert.equal(kget('reminders:lock:race'), null, 'القفل يُفكّ');
});

test('srv-maha-9: الكرون لا يمحو تذكيرًا أُضيف أثناء انتظاره Aladhan ولا يعيد تذكيرًا حُذف', async () => {
  resetAll();
  let release; const gate = new Promise((r) => { release = r; });
  aladhan.handler = async () => { await gate; return json({ data: { timings: TIMINGS, meta: { timezone: 'Asia/Dubai' } } }); };
  seedUser('mid', [
    { id: 'p1', type: 'prayer', prayerName: 'Asr', offsetMinutes: 0, lat: 25.2, lng: 55.27, method: 4, active: true },
    { id: 'd1', type: 'daily', hour: 3, minute: 3, active: true },
  ]);
  const running = tick();
  while (!aladhan.calls.length) await new Promise((r) => setImmediate(r));
  const add = await call(reminders, { method: 'POST', headers: bearer('mid'), body: { type: 'daily', hour: 4, minute: 4, message: 'أُضيف أثناء الدورة' } });
  assert.equal(add.code, 200);
  assert.equal((await call(reminders, { method: 'DELETE', headers: bearer('mid'), query: { id: 'd1' } })).code, 200);
  release();
  assert.equal((await running).code, 200);
  const after = listOf('mid');
  assert.deepEqual(after.map((r) => r.id).sort(), ['p1', add.j.reminder.id].sort(), 'الجديد باقٍ والمحذوف لم يعد');
  assert.ok(after.find((r) => r.id === 'p1').cachedTargetMs > 0, 'وتحديث الكرون نفسه محفوظ');
});

/* ================= srv-core-4 ================= */
test('srv-core-4: سجلّ أخطاء المتصفّح: line وcol أعداد محدودة والتوقيع منها، الجسم الكبير يُرفض، وحدّ معدّل لكلّ IP', async () => {
  resetAll();
  const LOG = 'db/client-errors/log.json';
  const post = (body, ip = '1.2.3.4') => call(clientErrors, { method: 'POST', headers: { 'x-forwarded-for': ip }, body });
  await withClock(RealDate.UTC(2026, 9, 26, 10, 0, 5), async () => {
    assert.equal((await post({ message: 'TypeError: a', line: 'L'.repeat(6000), col: { x: 'y'.repeat(3000) } })).code, 200);
    assert.equal((await post({ message: 'TypeError: b', line: '9'.repeat(400), col: -5 })).code, 200);
    const log = JSON.parse(kget(LOG));
    for (const it of log) {
      assert.equal(typeof it.line, 'number'); assert.equal(typeof it.col, 'number');
      assert.ok(it.line >= 0 && it.line <= 1e7 && it.col >= 0 && it.col <= 1e7, JSON.stringify([it.line, it.col]));
      assert.ok(it.sig.length < 1200, 'التوقيع من القيم المقصوصة');
    }
    assert.ok(JSON.stringify(log).length < 5000, 'حجم السجلّ: ' + JSON.stringify(log).length);
    const huge = await post({ message: 'x', line: 'L'.repeat(400000) });
    assert.equal(huge.code, 413);
    assert.equal(JSON.parse(kget(LOG)).length, 2, 'لم يُكتب شيء');
    let limited = 0;
    for (let i = 0; i < 70; i++) { const r = await post({ message: 'E' + i, line: i }, '9.9.9.9'); if (r.code === 429) limited++; }
    assert.equal(limited, 10, 'سقف ٦٠ بلاغًا في الدقيقة لكلّ IP');
    assert.equal((await post({ message: 'other ip' }, '8.8.8.8')).code, 200, 'IP آخر لا يتأثّر');
  });
});

/* ================= srv-edu-bots-2 ================= */
test('srv-edu-bots-2: عطل قراءة KV عابر عند حفظ درس أو حذفه أو تقدّمه = 503 بلا كتابة — الدروس والسلسلة كما هي', async () => {
  resetAll();
  stub('api/_lib/auth.js', {
    verifyToken: (t) => { try { const [p, s] = String(t).split('.'); if (s !== sign(p)) return null; const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.exp < RealDate.now() ? null : d.u; } catch (e) { return null; } },
    getUser: async (u) => ({ username: u, createdAt: RealDate.now() - 86400e3 * 3, points: 0 }),
    getUserOnce: async (u) => ({ username: u, createdAt: RealDate.now() - 86400e3 * 3, points: 0 }),
    putUser: async () => {}, isBanned: async () => false,
  });
  const edu = require(rp('api/edu.js'));
  const TOKEN = makeToken('sara');
  const eduCall = (body) => call(edu, { method: 'POST', headers: { 'x-forwarded-for': '10.1.1.1' }, body: Object.assign({ token: TOKEN }, body) });
  const KEY = 'edu:lessons:sara', SKEY = 'edu:streak:sara';
  const L = (id) => ({ id, title: 'درس ' + id, summary: 'ملخّص ' + id, subject: 'عام' });
  store.set(KEY, { v: JSON.stringify([L('L1'), L('L2'), L('L3')]), exp: 0 });
  const y = new RealDate(RealDate.now() - 86400e3).toISOString().slice(0, 10);
  store.set(SKEY, { v: JSON.stringify({ streak: 9, lastActive: y }), exp: 0 });
  const ids = () => JSON.parse(kget(KEY)).map((l) => l.id);
  const isGet = (k) => (c) => c[0] === 'GET' && c[1] === k;

  failNext(isGet(KEY), '503');
  const save = await eduCall({ action: 'save', lesson: L('L4') });
  assert.equal(save.code, 503, JSON.stringify(save.j));
  assert.equal(save.j.error, undefined, 'لا نصّ خادم خام يُعرض — العميل يعرض رسالته المترجمة');
  assert.deepEqual(ids(), ['L1', 'L2', 'L3']);
  failNext(isGet(KEY), 'html200');
  assert.equal((await eduCall({ action: 'delete', id: 'L9' })).code, 503);
  assert.deepEqual(ids(), ['L1', 'L2', 'L3']);
  failNext(isGet(KEY), '503');
  assert.equal((await eduCall({ action: 'progress', id: 'L1', bestScore: 80 })).code, 503, 'لا «الدرس غير موجود» على عطل');

  failNext(isGet(SKEY), '503');
  const ok = await eduCall({ action: 'save', lesson: L('L4') });
  assert.equal(ok.code, 200);
  assert.deepEqual(ids(), ['L4', 'L1', 'L2', 'L3']);
  assert.equal(JSON.parse(kget(SKEY)).streak, 9, 'عطل قراءة السلسلة لا يصفّرها');
  const list = await eduCall({ action: 'list' });
  assert.equal(list.code, 200);
  assert.equal(list.j.lessons.length, 4);
});
