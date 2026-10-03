// tests/plan-videos.test.cjs — v-plan-videos (شكوى المشتركين ٣ أكتوبر ٢٠٢٦: «صلاحيته ٣ فيديوات المشتركين 375، و2 لي
// المشتركين، لكن ولا واحد حصل الفيديو» — «❌ تعذّر: points_insufficient» على ترند؛ قرار المالك: «خلّها نفس ما هي، فقط
// صلاحيّة الفيديوات: ٣ للـ375 الاقتصاديّ أو الترند، و75 نفس الشي»).
// على المعالجين الحقيقيّين (الاقتصاديّ وVeo) بلا شبكة: مشترك نقاطه صفر يأخذ فيديوهات باقته بلا تأكيد خصم، ثمّ يرجع
// السلوك القديم حرفيًّا؛ النقاط لا تُمسّ؛ فشل المزوّد الآن أو عند الاستطلاع يعيد الفيديو إلى الصلاحيّة لا نقاطًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'plan-videos-test-secret';
process.env.MINIMAX_API_KEY = 'mm-test';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.VIDEO_FIRST_FRAME = 'off';

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const users = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
});
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/abuse-guard.js', { videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {}, imageHourlyGuard: async () => ({ ok: true }) });

const pv = require(rp('api/_lib/_planVideos.js'));
const points = require(rp('api/_lib/points.js'));
const minimax = require(rp('api/_lib/minimax-create.js'));
const veo = require(rp('api/_lib/veo-create.js'));
const job = require(rp('api/_lib/video-job.js'));

const DAY = 86400000;
function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + DAY })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
function sub(u, plan, pts, at) {
  users.set(u, { username: u, plan, planUpdatedAt: at || Date.now() - 3 * DAY, points: pts });
  kv.set('points:' + u, String(pts));
}
const bal = (u) => Number(kv.get('points:' + u));

let upstream = [];
let failNext = false;
global.fetch = async (url, init) => {
  upstream.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
  if (failNext) { failNext = false; return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 }); }
  if (/minimax/.test(url)) return new Response(JSON.stringify({ task_id: 'mm-' + upstream.length, base_resp: { status_code: 0 } }), { status: 200 });
  if (/predictLongRunning/.test(url)) return new Response(JSON.stringify({ name: 'operations/veo-' + upstream.length }), { status: 200 });
  return new Response('{}', { status: 404 });
};

async function call(handler, body) {
  const res = { code: 200, json: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; } };
  res.json = function (v) { this.jsonBody = v; return this; };
  await handler({ method: 'POST', body }, res);
  return { code: res.code, body: res.jsonBody };
}
const econ = (u, extra) => call(minimax, Object.assign({ token: token(u), promptText: 'قطّة ترقص على الشاطئ', durationSeconds: 6 }, extra || {}));
const trend = (u, extra) => call(veo, Object.assign({ token: token(u), trend: 'pixarstory', params: { name: 'سلمى' } }, extra || {}));

test('١. الصلاحيّة: Max ٣ · Pro ٢ · Plus والمنتهي وغير المشترك صفر، والتجديد يفتح فترة جديدة', async () => {
  assert.deepEqual(pv.PLAN_VIDEOS, { pro: 2, max: 3 });
  const now = Date.now();
  assert.equal(pv.allowanceOf({ plan: 'max', planUpdatedAt: now - DAY }, now), 3);
  assert.equal(pv.allowanceOf({ plan: 'pro', planUpdatedAt: now - DAY }, now), 2);
  assert.equal(pv.allowanceOf({ plan: 'basic', planUpdatedAt: now - DAY }, now), 0);
  assert.equal(pv.allowanceOf({ plan: 'max', planUpdatedAt: now - 40 * DAY }, now), 0, 'منتهٍ');
  assert.equal(pv.allowanceOf({ points: 5000 }, now), 0, 'نقاط بلا باقة');
  sub('renew', 'pro', 0);
  assert.ok(await pv.trySpendPlanVideo('renew', 40)); assert.ok(await pv.trySpendPlanVideo('renew', 40));
  assert.equal(await pv.trySpendPlanVideo('renew', 40), null, 'نفدت');
  users.get('renew').planUpdatedAt = Date.now(); // تجديد
  assert.equal((await pv.planVideoStatus('renew')).left, 2);
});

test('٢. اللقطة نفسها: مشترك Pro نقاطه صفر (أكلتها الصور) — فيديوهان اقتصاديّان بلا تأكيد ولا نقاط، ثمّ السلوك القديم', async () => {
  sub('sara', 'pro', 0); upstream = [];
  for (let i = 0; i < 2; i++) {
    const r = await econ('sara');
    assert.equal(r.code, 200, 'الفيديو ' + (i + 1) + ': ' + JSON.stringify(r.body)); assert.ok(r.body.task_id);
  }
  assert.equal(upstream.filter((x) => /minimax/.test(x.url)).length, 2);
  assert.equal(bal('sara'), 0, 'النقاط لم تُمسّ');
  const third = await econ('sara');
  assert.equal(third.code, 428, 'بعد الصلاحيّة: تأكيد الخصم كما كان'); assert.equal(third.body.error, 'confirm_required');
  const paid = await econ('sara', { confirmed: true });
  assert.equal(paid.code, 402); assert.equal(paid.body.error, 'points_insufficient');
});

test('٣. Max: ثلاث ترندات بلا نقاط، والنقاط الموجودة لا تُخصم؛ والوصف الحرّ على Veo ليس من الصلاحيّة', async () => {
  sub('omar', 'max', 500); upstream = [];
  const free = await call(veo, { token: token('omar'), promptText: 'غروب فوق البحر' });
  assert.equal(free.code, 428, 'الوصف الحرّ على المحرّك الغالي يطلب تأكيد النقاط كما كان');
  for (let i = 0; i < 3; i++) {
    const r = await trend('omar');
    assert.equal(r.code, 200, 'الترند ' + (i + 1) + ': ' + JSON.stringify(r.body)); assert.match(r.body.op, /^operations\//);
  }
  assert.equal(bal('omar'), 500, 'رصيد النقاط كما هو');
  assert.equal((await trend('omar')).code, 428, 'الرابع: تأكيد النقاط كما كان');
  const fourth = await trend('omar', { confirmed: true });
  assert.equal(fourth.code, 200); assert.equal(bal('omar'), 500 - points.COSTS.veo_video, 'الرابع من النقاط');
});

test('٤. الفشل يعيد الفيديو إلى الصلاحيّة لا نقاطًا: رفض المزوّد الآن، وفشل المهمّة عند الاستطلاع', async () => {
  sub('huda', 'pro', 0); upstream = [];
  failNext = true;
  const r = await econ('huda');
  assert.notEqual(r.code, 200, 'المزوّد رفض');
  assert.equal((await pv.planVideoStatus('huda')).left, 2, 'رجع فوريًّا');
  const ok = await econ('huda');
  assert.equal(ok.code, 200);
  assert.equal((await pv.planVideoStatus('huda')).left, 1);
  const s = await job.settleVideoJob(ok.body.task_id, false);
  assert.ok(s && s.refunded, 'تسوية الفشل');
  assert.equal((await pv.planVideoStatus('huda')).left, 2, 'الفيديو الفاشل رجع إلى الصلاحيّة');
  assert.equal(bal('huda'), 0, 'لا نقاط من العدم');
});

test('٥. غير المشترك وPlus بلا تغيير: التأكيد ثمّ النقاط كما كانت', async () => {
  sub('ali', 'basic', 100);
  assert.equal((await econ('ali')).code, 428);
  const r = await econ('ali', { confirmed: true });
  assert.equal(r.code, 200); assert.equal(bal('ali'), 100 - points.COSTS.minimax_video);
  users.set('guest1', { username: 'guest1', points: 0 }); kv.set('points:guest1', '0');
  assert.equal((await econ('guest1', { confirmed: true })).body.error, 'points_insufficient');
});
