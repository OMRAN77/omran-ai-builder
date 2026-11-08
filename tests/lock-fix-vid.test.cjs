'use strict';
/* tests/lock-fix-vid.test.cjs — v-lock-vid (باب المال، موافقة المالك ٢٧ أكتوبر: «صلح الخطير وابدا فيهم كلهم»).
   srv-video-1 (حرج): الكنس بعد ٣٠ دقيقة يردّ نقاط فيديو Omni/Veo/الاقتصاديّ/الممثّل بلا سؤال المزوّد، ثمّ كان الاستطلاع يسلّم الفيديو
   نفسه (settleVideoJob(…, true) يرجع null ولا يفحصه أحد) — فيديو مجّانيّ يتكرّر بسكربت. وكذلك ردّ الاستطلاع عند عطل المزوّد ثمّ نجاحه.
   الآن «لا تسليم فوق ردّ»: علامة التسوية '0' تمنع الرابط في نقاط الاستطلاع الأربع.
   srv-video-5: المحرّك السينمائيّ المباشر (omni-create) كان يخصم ١٢٠ ويرسل الرابط في ردّ متزامن بلا تذكرة — من أغلق التطبيق أثناء
   الانتظار يخسر نقاطه. الآن يحفظ الناتج بمعرّف omni/… مع تذكرة كترند Omni، ويسلّمه veo-status فيُسوّى، والكنس يردّ ما لم يُسلَّم.
   الجولة الثانية (مراجعة معاكسة): تهجئة بديلة للمعرّف («./» و«../» في op، رقم MiniMax بصفر أو مسافة، UUID الممثّل بحروف كبيرة) تصل
   المزوّد المهمّةَ نفسها ولا تجد تذكرة ولا علامة — فتسلّم بعد الردّ أو يُردّ بعد التسليم؛ وأعطال قراءة التخزين تُقرأ «لا تذكرة» فتسلّم
   والتذكرة مفتوحة؛ وعلامة «رُدّت» كانت تسقط بعد ٣٠ يومًا والمزوّد ما زال يحفظ الناتج.
   المعالجات الحقيقيّة (video-job وpoints والاستطلاعات الأربعة وveo-create وomni-create) بتخزين مزيّف في الذاكرة وfetch مزيّف — بلا شبكة.
   v-lock-port-vid (نقل الإصلاح فوق main بعد ١٢ يومًا): main أضاف مسار تسليم خامسًا — احتياط الفيديو «bk/<uuid>» (v-fal-backup) يتابعه
   veo-status عند fal ويسلّم رابط الناتج — وكان يسلّم بعد ردّ الكنس كما كانت الأربعة؛ وصار الاقتصاديّ على واجهة v2 (رابط الناتج في
   task.content.url، بلا files/retrieve)، و«سينمائي» على veo-create بمعرّف omni/… وتذكرة. كلّ ثابت من ثوابت المال أدناه يمرّ الآن على
   الاحتياط أيضًا (fal في المصفوفات)، وفي آخر الملفّ مساره الكامل من veo-create الحقيقيّ و«سينمائي» الجديد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
process.env.AUTH_SECRET = 'lock-fix-vid-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.MINIMAX_API_KEY = 'mm-test';
process.env.FAL_KEY = 'fal-test';
process.env.ACTOR_LIPSYNC_MODEL = 'fal-ai/test/lipsync';
process.env.RUNWAY_API_KEY = 'rw-test';
delete process.env.TREND_ENGINE; delete process.env.OMNI_VIDEO_MODEL; delete process.env.MINIMAX_API_BASE; delete process.env.RUNWAY_API_BASE;
delete process.env.GEMINI_API_BASE; delete process.env.MINIMAX_GROUP_ID;
/* v-lock-port-vid: الاحتياط شغّال افتراضيًّا بمفتاح FAL_KEY (fal-fallback.enabled)، و«سينمائي» على Omni افتراضيًّا، وبلا VAPID لا إشعار يُرسل */
for (const k of ['FAL_BACKUP', 'FAL_BACKUP_CAP_CENTS', 'FAL_BACKUP_TEST_UNTIL', 'CINEMA_ENGINE', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'TREND_FACE_SWAP', 'VIDEO_FREE_FRAME', 'VIDEO_FIRST_FRAME']) delete process.env[k];

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

/* ── التخزين المزيّف: Map + مدد الصلاحيّة المطلوبة + حقن أعطال وتأخير عشوائيّ (للسباق) ── */
const kv = new Map();
const ttls = new Map();
/* أعطال kv.js الحقيقيّة: ticketRead/doneRead = ردّ لا يُقرأ (المرن يرجع null، والصارم strict يرمي)، claimLost = SET NX بردّ ٢٠٠ لا يُقرأ
   (kvSetIfAbsent يرجع false ولم يُكتب شيء) */
const fail = { setIfAbsent: 0, rawPrefix: '', ticketRead: 0, doneRead: 0, claimLost: 0 };
const isTicket = (k) => /^vidjob:[0-9a-f]{40}$/.test(String(k));
const isDone = (k) => /^vidjob:[0-9a-f]{40}:done$/.test(String(k));
let jitter = null; // دالّة تأخير أو null
const pause = async () => { if (jitter) await jitter(); };
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => { await pause(); if (fail.doneRead > 0 && isDone(k)) { fail.doneRead--; return null; } return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v, ttl) => { await pause(); if (fail.rawPrefix && String(k).indexOf(fail.rawPrefix) === 0) throw new Error('redis down'); kv.set(k, String(v)); if (ttl) ttls.set(k, ttl); },
  kvSetIfAbsent: async (k, v, ttl) => { await pause(); if (fail.setIfAbsent > 0) { fail.setIfAbsent--; throw new Error('redis timeout'); } if (fail.claimLost > 0 && isDone(k)) { fail.claimLost--; return false; } if (kv.has(k)) return false; kv.set(k, String(v)); ttls.set(k, ttl); return true; },
  kvIncrBy: async (k, n) => { await pause(); const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await pause(); const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k, o) => {
    await pause();
    const strict = !!(o && o.strict);
    if ((fail.ticketRead > 0 && isTicket(k)) || (fail.doneRead > 0 && isDone(k))) {
      if (isTicket(k)) fail.ticketRead--; else fail.doneRead--;
      if (strict) throw new Error('Upstash error: unreadable reply');
      return null;
    }
    try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { if (strict) throw e; return null; }
  },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { await pause(); kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(x)); return x; } kv.set(k, String(v)); return 'OK'; }),
});
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  getUserOnce: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
const locks = new Set();
mock('api/_lib/abuse-guard.js', {
  videoLock: async (u) => (locks.has(u) ? { ok: false, retryAfter: 150 } : (locks.add(u), { ok: true })),
  releaseVideoLock: async (u) => { locks.delete(u); }, videoCooldownLeft: async () => 0, imageHourlyGuard: async () => ({ ok: true }),
});
mock('api/_lib/_videoSubs.js', { CODE: 'video_subscribers', videoAllowed: async () => true, denyFree: async () => false });
mock('api/_lib/_qualityGate.js', { gateQuality: async (u, q) => q, allowHigh: async () => false });
const media = [];
mock('api/_lib/our-media.js', { rememberOurMedia: async (urls) => { media.push(...[].concat(urls || [])); } });
mock('api/_lib/video-upscale-create.js', { rememberOutputs: async (out) => { media.push(...[].concat(out || [])); } });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} }); // v-lock-port-vid: سجلّ الاحتياط بلا شبكة

const job = require(rp('api/_lib/video-job.js'));
const points = require(rp('api/_lib/points.js'));
const veoCreate = require(rp('api/_lib/veo-create.js'));
const omniCreate = require(rp('api/_lib/omni-create.js'));
const H = {
  veo: require(rp('api/_lib/veo-status.js')),
  mm: require(rp('api/_lib/minimax-status.js')),
  actor: require(rp('api/_lib/actor-status.js')),
  rw: require(rp('api/_lib/video-status.js')),
};
const { COSTS } = points;
const NOW = Date.now();
const DAY = 86400000;
const LATE = 31 * 60000; // بعد مهلة الكنس (٣٠ دقيقة)
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
/* حساب Max استهلك صلاحيّة فيديوهات باقته — فالخصم نقاط (نمط trend-omni ٦) */
function account(u, p) { users.set(u, { username: u, plan: 'max', planUpdatedAt: NOW - DAY, points: p }); kv.set('points:' + u, String(p)); kv.set('planvid:' + encodeURIComponent(u) + ':' + Math.floor(NOW - DAY), '3'); }
const pts = (u) => Number(kv.get('points:' + u));
function reset() { kv.clear(); ttls.clear(); users.clear(); locks.clear(); media.length = 0; Object.assign(fail, { setIfAbsent: 0, rawPrefix: '', ticketRead: 0, doneRead: 0, claimLost: 0 }); jitter = null; }
/* الزمن يمضي «days» يومًا: يسقط كلّ مفتاح مدّته أقصر (كلّ الكتابات هنا عند الزمن صفر)، والمفتاح بلا مدّة يبقى */
function after(days) { for (const [k, t] of [...ttls]) if (t && t <= days * 86400) { kv.delete(k); ttls.delete(k); } }
/* معرّفات بشكل المزوّد الحقيقيّ: MiniMax رقم (v2 كـv1 — مثال التوثيق الرسميّ «424010985738629»)، والممثّل والاحتياط UUID بحروف صغيرة (request_id عند fal) */
const mmId = (n) => String(106916112212000 + n);
const uuid = (n) => '5f3c2a10-7b4e-4c1d-9e8f-' + String(n).padStart(12, '0');
const falOp = (n) => 'bk/' + uuid(n); // v-lock-port-vid: احتياط الفيديو (veo-create.viaFal) بالبادئة المحايدة

/* ── المزوّدون: كلّ واحد ينجح ما لم يُقل غير ذلك؛ كلّ نداء يُسجَّل ── */
const OMNI_URI = 'https://generativelanguage.googleapis.com/v1beta/files/omni1:download?alt=media';
const VEO_URI = 'https://generativelanguage.googleapis.com/v1beta/files/veo1:download?alt=media';
const MM_URL = 'https://cdn.minimax.test/x.mp4';
const FAL_URL = 'https://v3.fal.media/files/x/actor.mp4';
const RW_OUT = 'https://dnznrvs05pmza.cloudfront.net/rw/out.mp4';
const FAL_REQ = '764cabcf-b745-4b3e-ae38-12003040cafe'; // رقم طابور الاحتياط الذي يرجعه fal عند البدء
const FAL_Q = 'https://queue.fal.run/google/gemini-omni-flash/requests/';
let calls = [];
const P = {};
function providersOk() {
  P.omni = () => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'video', uri: OMNI_URI }] }] } });
  P.veoOp = () => ({ status: 200, body: { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: VEO_URI } }] } } } });
  /* v-lock-port-vid: MiniMax v2 (v-minimax-h3) — ردّ واحد { task } والرابط في content.url */
  P.mmQuery = () => ({ status: 200, body: { task: { status: 'succeeded', content: { url: MM_URL } } } });
  P.falSubmit = () => ({ status: 200, body: { request_id: FAL_REQ, status_url: FAL_Q + FAL_REQ + '/status', response_url: FAL_Q + FAL_REQ } });
  P.falStatus = () => ({ status: 200, body: { status: 'COMPLETED' } });
  P.falResult = () => ({ status: 200, body: { video: { url: FAL_URL } } });
  P.rw = () => ({ status: 200, body: { id: 'rwtask-1', status: 'SUCCEEDED', output: [RW_OUT] } });
}
providersOk();
global.fetch = async (url, init) => {
  const u = new URL(String(url)).href; // كـfetch الحقيقيّ (WHATWG URL): «.» و«..» في المسار تُطبَّع قبل أن يصل المزوّد
  calls.push(u);
  let r;
  if (/\/interactions$/.test(u)) r = P.omni(u);
  else if (/generativelanguage\.googleapis\.com\/v1beta\/.*operations\//.test(u)) r = P.veoOp(u);
  else if (/\/v2\/query\/video_generation\//.test(u)) r = P.mmQuery(u);
  else if (/queue\.fal\.run\//.test(u) && init && init.method === 'POST') r = P.falSubmit(u); // بدء الاحتياط
  else if (/queue\.fal\.run\/.*\/status$/.test(u)) r = P.falStatus(u);
  else if (/queue\.fal\.run\//.test(u)) r = P.falResult(u);
  else if (/\/v1\/tasks\//.test(u)) r = P.rw(u);
  else return new Response('{}', { status: 404 });
  if (r.throw) throw r.throw;
  return new Response(JSON.stringify(r.body), { status: r.status });
};
function res() { return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } }; }
const quiet = async (fn) => { const e = console.error, w = console.warn, l = console.log; console.error = () => {}; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; console.log = l; } };
/* الاستطلاعات الأربعة كما يناديها العميل */
const POLL = {
  veo: (id) => ({ h: H.veo, req: { method: 'GET', query: { op: id } } }),
  mm: (id) => ({ h: H.mm, req: { method: 'GET', query: { task_id: id } } }),
  actor: (id) => ({ h: H.actor, req: { method: 'GET', query: { id: id.replace(/^actor:/, '') } } }),
  rw: (id) => ({ h: H.rw, req: { method: 'GET', query: { id } } }),
  fal: (id) => ({ h: H.veo, req: { method: 'GET', query: { op: id } } }), // v-lock-port-vid: الاحتياط يُستطلع من veo-status بمعرّفه bk/…
};
async function poll(kind, id) { const { h, req } = POLL[kind](id); const r = res(); await quiet(() => h(req, r)); return r; }
const sweep = (u, at) => quiet(() => job.sweepStaleVideoJobs(u, { now: at || NOW + LATE }));
async function trend(u) {
  const r = res();
  await quiet(() => veoCreate({ method: 'POST', query: { action: 'veo-create' }, body: { quality: 'fast', durationSeconds: 8, confirmed: true, token: token(u), trend: 'pixarsketch', params: { text: 'أبو سعيد', sceneIndex: 0 }, ratio: '720:1280' } }, r));
  return r;
}
async function omni(u, extra) {
  const r = Object.assign(res(), extra && extra.res);
  await quiet(() => omniCreate({ method: 'POST', body: Object.assign({ promptText: 'قطّة تلعب في الحديقة', ratio: '720:1280', token: token(u), confirmed: true }, extra && extra.body) }, r));
  return r;
}
const delivered = (r) => r.body && r.body.status === 'SUCCEEDED' && Array.isArray(r.body.output) && r.body.output.length > 0;
const leaks = (r) => JSON.stringify(r.body || {}).match(/veo-download|cdn\.minimax|fal\.media|cloudfront/);

/* تذكرة مهمّة غير متزامنة كما يسجّلها مسار الإنشاء بعد الخصم: نقاط مخصومة + تذكرة بنوع الخصم */
async function charged(u, id, cost) {
  kv.set('points:' + u, String(pts(u) - cost));
  assert.equal(await job.rememberVideoJob(id, { username: u, cost, locked: true, pay: { ok: true, points: pts(u), spent: cost } }, { now: NOW }), true);
  locks.add(u);
}

// ─────────────────────────────── srv-video-1 ───────────────────────────────
test('srv-video-1 أ: ترند Omni — الكنس بعد ٣١ دقيقة يردّ ١٧٥ مرّة واحدة، ثمّ الاستطلاع لا يسلّم الرابط (كان SUCCEEDED بالرابط الموقّع)', async () => {
  reset(); account('sara', 1000);
  const c = await trend('sara');
  assert.equal(c.code, 200, JSON.stringify(c.body));
  assert.match(String(c.body.op), /^omni\//);
  assert.equal(pts('sara'), 1000 - COSTS.veo_video);
  const s = await sweep('sara');
  assert.deepEqual([s.refunded, s.points], [1, COSTS.veo_video], 'الكنس ردّ النقاط');
  assert.equal(pts('sara'), 1000);
  const p = await poll('veo', c.body.op);
  assert.equal(p.body && p.body.status, 'FAILED', 'لا تسليم فوق ردّ: ' + JSON.stringify(p.body));
  assert.ok(!leaks(p), 'لا رابط بعد الردّ');
  // التكرار: الاستطلاع مرّة ثانية وكنس آخر — لا رابط ولا ردّ ثانٍ
  assert.equal((await poll('veo', c.body.op)).body.status, 'FAILED');
  assert.equal((await sweep('sara', NOW + LATE + 60000)).refunded, 0);
  assert.equal(pts('sara'), 1000, 'ردّ واحد لا اثنان');
});

test('srv-video-1 ب: Veo والاقتصاديّ والممثّل — ردّ الكنس يمنع التسليم في نقاط الاستطلاع، والمزوّد ناجح', async () => {
  for (const [kind, id, cost] of [['veo', 'models/veo-3.1/operations/op1', COSTS.veo_video], ['mm', mmId(1), COSTS.minimax_video], ['actor', 'actor:' + uuid(1), 175], ['fal', falOp(1), COSTS.veo_video]]) {
    reset(); account('nora', 1000); providersOk();
    await charged('nora', id, cost);
    const s = await sweep('nora');
    assert.deepEqual([s.refunded, s.points], [1, cost], kind + ': الكنس ردّ');
    assert.equal(pts('nora'), 1000, kind);
    assert.ok(!locks.has('nora'), kind + ': القفل فُكّ');
    const p = await poll(kind, id);
    assert.equal(p.body && p.body.status, 'FAILED', kind + ': لا تسليم فوق ردّ — ' + JSON.stringify(p.body));
    assert.ok(!leaks(p), kind + ': لا رابط');
    assert.deepEqual(media, [], kind + ': لا يُحفظ ناتجًا مسلَّمًا');
    assert.equal(pts('nora'), 1000, kind + ': لا خصم ولا ردّ آخر');
  }
});

test('srv-video-1 ج: ردّ الاستطلاع نفسه (عطل المزوّد أو تعذّر الرابط) ثمّ نجاحه لاحقًا لا يسلّم — Runway والاقتصاديّ وVeo والممثّل', async () => {
  const cases = [
    ['rw', '0:rwtask-1', COSTS.runway_video, () => { P.rw = () => ({ status: 402, body: { error: 'You do not have enough credits to run this task.' } }); }],
    /* v-lock-port-vid: v2 — «succeeded» بلا content.url يردّ (v-video-retrieve-refund)، ونفاد رصيدنا (٤٠٢) يردّ بـunavailable */
    ['mm', mmId(2), COSTS.minimax_video, () => { P.mmQuery = () => ({ status: 200, body: { task: { status: 'succeeded', content: {} } } }); }],
    ['mm', mmId(4), COSTS.minimax_video, () => { P.mmQuery = () => ({ status: 402, body: { type: 'error', error: { type: 'insufficient_balance', message: 'insufficient balance', http_code: 402 } } }); }],
    ['veo', 'models/veo-3.1/operations/op2', COSTS.veo_video, () => { P.veoOp = () => ({ status: 402, body: { error: { message: 'billing account disabled' } } }); }],
    ['actor', 'actor:' + uuid(2), 175, () => { P.falStatus = () => ({ status: 403, body: { detail: 'User is locked. Reason: Exhausted balance.' } }); }],
    /* v-lock-port-vid: الاحتياط — رصيد fal موقوف (OUTAGE = unavailable) أو رفضٌ عنده (FAILED) يردّ، ثمّ يعود المزوّد بالناتج */
    ['fal', falOp(2), COSTS.veo_video, () => { P.falStatus = () => ({ status: 403, body: { detail: 'User is locked. Reason: Exhausted balance.' } }); }],
    ['fal', falOp(4), COSTS.veo_video, () => { P.falStatus = () => ({ status: 200, body: { status: 'COMPLETED', error: 'content_policy_violation' } }); }],
  ];
  for (const [kind, id, cost, breakIt] of cases) {
    reset(); account('omar', 1000); providersOk();
    await charged('omar', id, cost);
    breakIt();
    const a = await poll(kind, id);
    assert.ok(a.code >= 500 || (a.body && (a.body.error || a.body.status === 'FAILED')), kind + ': الاستطلاع الأوّل فشل — ' + JSON.stringify(a.body));
    assert.equal(pts('omar'), 1000, kind + ': رُدّت');
    providersOk(); // المزوّد عاد، والمهمّة ناجحة عنده
    const b = await poll(kind, id);
    assert.ok(!delivered(b), kind + ': لا تسليم بعد الردّ — ' + JSON.stringify(b.body));
    assert.ok(!leaks(b), kind + ': لا رابط');
    assert.equal(pts('omar'), 1000, kind);
  }
});

test('srv-video-1 د: المسلَّم أوّلًا لا يُردّ، والاستطلاع المكرّر يسلّم (إعادة تشغيل آمنة)، والمالك بلا تذكرة يُسلَّم كما كان', async () => {
  for (const [kind, id, cost] of [['veo', 'models/veo-3.1/operations/op3', COSTS.veo_video], ['mm', mmId(3), COSTS.minimax_video], ['actor', 'actor:' + uuid(3), 175], ['rw', '0:rwtask-3', COSTS.runway_video], ['fal', falOp(3), COSTS.veo_video]]) {
    reset(); account('lina', 1000); providersOk();
    await charged('lina', id, cost);
    assert.ok(delivered(await poll(kind, id)), kind + ': سُلِّم');
    assert.ok(delivered(await poll(kind, id)), kind + ': الاستطلاع المكرّر يسلّم');
    const s = await sweep('lina');
    assert.equal(s.refunded, 0, kind + ': المسلَّم لا يُردّ');
    assert.equal(pts('lina'), 1000 - cost, kind);
    assert.ok(delivered(await poll(kind, id)), kind + ': بعد الكنس يسلّم أيضًا');
    // المالك (أو مهمّة بلا خصم): لا تذكرة ولا علامة = يُسلَّم
    assert.ok(delivered(await poll(kind, kind === 'actor' ? 'actor:' + uuid(999) : kind === 'rw' ? '0:owner-task' : kind === 'veo' ? 'models/veo-3.1/operations/owner' : kind === 'fal' ? falOp(999) : mmId(999))), kind + ': المالك يُسلَّم');
  }
});

test('srv-video-1 هـ: السباق — كنس واستطلاع متزامنان بترتيب عشوائيّ: إمّا ردّ بلا رابط وإمّا رابط بلا ردّ، أبدًا الاثنان', async () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let refundedRuns = 0, deliveredRuns = 0;
  for (let i = 0; i < 60; i++) {
    const kind = ['veo', 'mm', 'actor', 'fal'][i % 4]; // v-lock-port-vid: والاحتياط
    const id = kind === 'veo' ? 'models/veo-3.1/operations/race' + i : kind === 'mm' ? mmId(100 + i) : kind === 'fal' ? falOp(100 + i) : 'actor:' + uuid(100 + i);
    reset(); account('race', 1000); providersOk();
    await charged('race', id, 100);
    jitter = () => new Promise((r) => setTimeout(r, Math.floor(rnd() * 3)));
    const [s, p] = await Promise.all([sweep('race'), poll(kind, id)]);
    jitter = null;
    const got = delivered(p);
    const back = pts('race') === 1000;
    assert.ok(got !== back, 'مرّة ' + i + ' (' + kind + '): سُلِّم=' + got + ' ورُدّ=' + back + ' — ' + JSON.stringify(p.body));
    assert.equal(s.refunded, back ? 1 : 0);
    if (back) { refundedRuns++; assert.equal((await poll(kind, id)).body.status, 'FAILED', 'استطلاع لاحق لا يسلّم'); }
    else { deliveredRuns++; assert.equal((await sweep('race', NOW + 2 * LATE)).refunded, 0, 'كنس لاحق لا يردّ'); }
  }
  assert.equal(refundedRuns + deliveredRuns, 60);
});

test('srv-video-1 و: عطب حجز التسوية والتذكرة مفتوحة = RUNNING لا تسليم (وإلّا ردّها الكنس بعد التسليم)، ثمّ يسلّم ولا يُردّ', async () => {
  reset(); account('huda', 1000); providersOk();
  await charged('huda', mmId(201), COSTS.minimax_video);
  fail.setIfAbsent = 1;
  const a = await poll('mm', mmId(201));
  assert.equal(a.body && a.body.status, 'RUNNING', 'لم يُحسم = يعيد العميل: ' + JSON.stringify(a.body));
  assert.ok(!leaks(a));
  const b = await poll('mm', mmId(201));
  assert.ok(delivered(b), 'التالي يسلّم');
  assert.equal((await sweep('huda')).refunded, 0, 'المسلَّم لا يُردّ');
  assert.equal(pts('huda'), 1000 - COSTS.minimax_video);
});

test('srv-video-1 ز: علامة «رُدّت» بلا انتهاء — بعد ٣ أيّام و٣١ يومًا وسنة، والمزوّد ما زال يحفظ الناتج: لا تسليم؛ وعلامة التسليم كما كانت', async () => {
  for (const [kind, id, cost] of [['mm', mmId(401), COSTS.minimax_video], ['actor', 'actor:' + uuid(401), 175], ['veo', 'models/veo-3.1/operations/ttl1', COSTS.veo_video], ['fal', falOp(401), COSTS.veo_video]]) {
    reset(); account('reem', 1000); providersOk();
    await charged('reem', id, cost);
    assert.equal((await sweep('reem')).refunded, 1, kind);
    const k = job.ticketKey(id) + ':done';
    assert.equal(kv.get(k), '0', kind + ': علامة الردّ');
    const ttl = ttls.get(k);
    for (const d of [3, 31, 400]) {
      after(d); // التذكرة (يومان) سقطت، والمزوّد ما زال يسلّم الناتج
      const p = await poll(kind, id);
      assert.ok(!delivered(p) && !leaks(p), kind + ' بعد ' + d + ' يومًا: لا تسليم فوق ردّ (مدّة العلامة ' + ttl + ' ثانية) — ' + JSON.stringify(p.body));
    }
    assert.ok(!ttl, kind + ': علامة الردّ بلا مدّة');
    assert.equal(kv.get(k), '0', kind + ': ما زالت بعد سنة');
    assert.equal(pts('reem'), 1000, kind + ': ردّ واحد');
  }
  reset(); account('reem', 1000); providersOk();
  await charged('reem', mmId(402), COSTS.minimax_video);
  assert.ok(delivered(await poll('mm', mmId(402))));
  assert.equal(ttls.get(job.ticketKey(mmId(402)) + ':done'), job.TICKET_TTL_SEC, 'علامة التسليم بمدّتها');
});

test('srv-video-1 ح: الردّ مرّة واحدة تحت التكرار — ثلاثة كنوس متزامنة واستطلاع فاشل معها', async () => {
  reset(); account('dana', 1000); providersOk();
  await charged('dana', mmId(301), COSTS.minimax_video);
  P.mmQuery = () => ({ status: 200, body: { task: { status: 'failed', error: { code: 1, message: 'x' } } } }); // v2
  const out = await Promise.all([sweep('dana'), sweep('dana'), sweep('dana'), poll('mm', mmId(301))]);
  assert.equal(out[3].body.status, 'FAILED');
  assert.equal(pts('dana'), 1000, 'ردّ واحد بالضبط');
  providersOk();
  assert.equal((await poll('mm', mmId(301))).body.status, 'FAILED', 'ولا تسليم بعده');
});

/* ── الجولة الثانية (مراجعة معاكسة): تهجئة بديلة لمعرّف المهمّة، وأعطال قراءة التخزين ── */
const VEO_OP = 'models/veo-3.1-fast-generate-preview/operations/op1';
const MM_ID = '106916112212032';
const ACT_ID = '764cabcf-b745-4b3e-ae38-1200304cf45b';
const CANON = { veo: VEO_OP, mm: MM_ID, actor: 'actor:' + ACT_ID, fal: 'bk/' + ACT_ID };
const COST_OF = { veo: COSTS.veo_video, mm: COSTS.minimax_video, actor: 175, fal: COSTS.veo_video };
/* مزوّدون متسامحون في قراءة المعرّف: كلّ تهجئة تعني المهمّة نفسها تعيدها ناجحة، وغيرها «غير موجودة» */
function lenientProviders() {
  providersOk();
  const veoOk = P.veoOp, mmOk = P.mmQuery, stOk = P.falStatus, resOk = P.falResult;
  P.veoOp = (u) => (new URL(u).pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') === '/v1beta/' + VEO_OP ? veoOk() : { status: 404, body: { error: { code: 404, message: 'Operation not found' } } });
  P.mmQuery = (u) => { // v2: المعرّف في المسار — محلّل أرقام متسامح
    let n = null;
    try { n = String(BigInt(decodeURIComponent(new URL(u).pathname.split('/').pop()).trim())); } catch (e) { n = null; }
    return n === MM_ID ? mmOk() : { status: 404, body: { type: 'error', error: { type: 'not_found', message: 'task not found', http_code: 404 } } };
  };
  const sameFal = (u) => { const m = /\/requests\/([^/]+)/.exec(u); return !!m && m[1].toLowerCase().replace(/-/g, '') === ACT_ID.replace(/-/g, ''); };
  P.falStatus = (u) => (sameFal(u) ? stOk() : { status: 404, body: { detail: 'Request not found' } });
  P.falResult = (u) => (sameFal(u) ? resOk() : { status: 404, body: { detail: 'Request not found' } });
}
const VARIANTS = {
  veo: ['models/veo-3.1-fast-generate-preview/./operations/op1', 'models/veo-3.1-fast-generate-preview/operations/x/../op1', './' + VEO_OP,
    'models/x/../veo-3.1-fast-generate-preview/operations/op1', 'models//veo-3.1-fast-generate-preview/operations/op1', VEO_OP + '/', '/' + VEO_OP, 'omni/../' + VEO_OP],
  mm: ['0' + MM_ID, '00' + MM_ID, ' ' + MM_ID, MM_ID + ' ', '+' + MM_ID, '0x' + BigInt(MM_ID).toString(16)],
  actor: [ACT_ID.toUpperCase(), ACT_ID.slice(0, 9).toUpperCase() + ACT_ID.slice(9), ACT_ID.replace(/-/g, ''), ACT_ID.replace(/-/g, '').toUpperCase()],
};
/* v-lock-port-vid: رقم طابور الاحتياط UUID عند fal كالممثّل — والسجلّ محفوظ بالتهجئة القانونيّة وحدها، فالبديلة يُعاد بناء رابطها من الرقم */
VARIANTS.fal = VARIANTS.actor.map((v) => 'bk/' + v);
const asPolled = (kind, v) => (kind === 'actor' ? 'actor:' + v : v);

test('srv-video-1 ط: تهجئة بديلة بعد ردّ الكنس («./» و«../» في op، رقم بصفر أو مسافة أو +، UUID بحروف كبيرة) لا تسلّم — كانت SUCCEEDED بالرابط الموقّع', async () => {
  for (const kind of ['veo', 'mm', 'actor', 'fal']) {
    for (const v of VARIANTS[kind]) {
      reset(); account('nora', 1000); lenientProviders();
      await charged('nora', CANON[kind], COST_OF[kind]);
      assert.equal((await sweep('nora')).refunded, 1, kind);
      assert.equal(pts('nora'), 1000, kind + ': رُدّت');
      assert.equal((await poll(kind, CANON[kind])).body.status, 'FAILED', kind + ': القانونيّ لا يسلّم بعد الردّ');
      const p = await poll(kind, asPolled(kind, v));
      assert.ok(!delivered(p) && !leaks(p), kind + ' «' + v + '»: لا تسليم فوق ردّ — ' + JSON.stringify(p.body));
      assert.deepEqual(media, [], kind + ' «' + v + '»: لا ناتج مسلَّم');
      assert.equal(pts('nora'), 1000, kind + ': لا خصم ولا ردّ آخر');
    }
  }
});

test('srv-video-1 ي: التسليم بتهجئة بديلة ثمّ الكنس — كان يسلّم الرابط ثمّ يردّ النقاط؛ الآن البديلة بلا رابط، فإمّا ردّ بلا رابط وإمّا رابط بلا ردّ', async () => {
  for (const kind of ['veo', 'mm', 'actor', 'fal']) {
    for (const v of VARIANTS[kind]) {
      reset(); account('lina', 1000); lenientProviders();
      await charged('lina', CANON[kind], COST_OF[kind]);
      const a = await poll(kind, asPolled(kind, v));
      const s = await sweep('lina');
      assert.ok(!(delivered(a) && s.refunded), kind + ' «' + v + '»: سُلِّم بالبديلة ثمّ رُدّت نقاطه — فيديو مجّانيّ');
      assert.ok(!delivered(a) && !leaks(a), kind + ' «' + v + '»: البديلة لا تسلّم — ' + JSON.stringify(a.body));
      assert.equal(s.refunded, 1, kind + ': لم يُسلَّم شيء فيُردّ');
      assert.equal((await poll(kind, CANON[kind])).body.status, 'FAILED', kind + ': ولا تسليم بعده');
      assert.equal(pts('lina'), 1000, kind);
    }
    // القانونيّ قبل الكنس يسلّم ولا يُردّ (المسار الحيّ كما هو)
    reset(); account('lina', 1000); lenientProviders();
    await charged('lina', CANON[kind], COST_OF[kind]);
    assert.ok(delivered(await poll(kind, CANON[kind])), kind + ': القانونيّ يسلّم');
    assert.equal((await sweep('lina')).refunded, 0, kind);
  }
});

/* حالات التخزين المتعطّل: كلّ نقاط الاستطلاع الأربع تمرّ بـsettleVideoJob */
const GLITCH_CASES = (n) => [['mm', mmId(n), COSTS.minimax_video], ['actor', 'actor:' + uuid(n), 175], ['veo', 'models/veo-3.1/operations/glitch' + n, COSTS.veo_video], ['rw', '0:rwtask-' + n, COSTS.runway_video], ['fal', falOp(n), COSTS.veo_video]];

test('srv-video-1 ك: قراءة التذكرة تتعطّل عند التسليم (المرنة ترجع null) = RUNNING لا تسليم — كان يسلّم والتذكرة مفتوحة فيردّها الكنس بعده', async () => {
  for (const [kind, id, cost] of GLITCH_CASES(501)) {
    reset(); account('huda', 1000); providersOk();
    await charged('huda', id, cost);
    fail.ticketRead = 1;
    const a = await poll(kind, id);
    assert.equal(a.body && a.body.status, 'RUNNING', kind + ': لم يُحسم = يعيد العميل — ' + JSON.stringify(a.body));
    assert.ok(!leaks(a), kind);
    assert.ok(delivered(await poll(kind, id)), kind + ': التالي يسلّم');
    assert.equal((await sweep('huda')).refunded, 0, kind + ': المسلَّم لا يُردّ');
    assert.equal(pts('huda'), 1000 - cost, kind + ': دفع مرّة واستلم');
  }
  // عطل عابر في القراءة (5xx) = لم يُحسم؛ والتخزين غير المهيّأ أصلًا (kv.js الحقيقيّ بلا متغيّراته: لا تذاكر ولا علامات) = يُسلَّم كما كان
  const throwing = (e) => ({ kvGetJSON: async () => { throw e; }, kvGetRaw: async () => { throw e; }, kvSetIfAbsent: async () => { throw e; }, kvDel: async () => {} });
  assert.deepEqual(await quiet(() => job.settleVideoJob(mmId(502), true, { kv: throwing(new Error('Upstash error: HTTP 503')) })), { settled: false, refunded: false, pending: true });
  const kvPath = rp('api/_lib/kv.js');
  const fake = require.cache[kvPath];
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete require.cache[kvPath];
  let realKv;
  try { realKv = require(kvPath); } finally { require.cache[kvPath] = fake; }
  assert.equal(await quiet(() => job.settleVideoJob(mmId(503), true, { kv: realKv })), null, 'بلا تخزين: يُسلَّم كما كان');
});

test('srv-video-1 ل: حجز التسوية بردّ ٢٠٠ لا يُقرأ (kvSetIfAbsent يرجع false ولم يكتب) والتذكرة مفتوحة = RUNNING لا تسليم، ثمّ يسلّم ولا يُردّ', async () => {
  for (const [kind, id, cost] of GLITCH_CASES(601)) {
    reset(); account('huda', 1000); providersOk();
    await charged('huda', id, cost);
    fail.claimLost = 1;
    const a = await poll(kind, id);
    assert.equal(a.body && a.body.status, 'RUNNING', kind + ': لم يُحسم = يعيد العميل — ' + JSON.stringify(a.body));
    assert.ok(!leaks(a), kind);
    assert.ok(delivered(await poll(kind, id)), kind + ': التالي يسلّم');
    assert.equal((await sweep('huda')).refunded, 0, kind + ': المسلَّم لا يُردّ');
    assert.equal(pts('huda'), 1000 - cost, kind);
  }
});

test('srv-video-1 م: بعد الردّ تتعطّل قراءة علامة التسوية (المرنة ترجع null) = لا تسليم — كانت تُقرأ «لا تذكرة ولا علامة» فيُسلَّم', async () => {
  for (const [kind, id, cost] of GLITCH_CASES(701)) {
    reset(); account('dana', 1000); providersOk();
    await charged('dana', id, cost);
    if (kind === 'rw') { // Runway لا يردّه الكنس ما دام المزوّد ناجحًا — الردّ من عطل المزوّد عند الاستطلاع
      P.rw = () => ({ status: 402, body: { error: 'You do not have enough credits to run this task.' } });
      await poll('rw', id);
      providersOk();
    } else assert.equal((await sweep('dana')).refunded, 1, kind);
    assert.equal(pts('dana'), 1000, kind + ': رُدّت');
    fail.doneRead = 1;
    const a = await poll(kind, id);
    assert.ok(!delivered(a) && !leaks(a), kind + ': لا تسليم فوق ردّ — ' + JSON.stringify(a.body));
    assert.equal(a.body && a.body.status, 'RUNNING', kind + ': لم يُعرف = يعيد العميل');
    assert.equal((await poll(kind, id)).body.status, 'FAILED', kind + ': التالي يرى الردّ');
    assert.equal(pts('dana'), 1000, kind);
  }
});

// ─────────────────────────────── srv-video-5 ───────────────────────────────
test('srv-video-5 أ: المحرّك السينمائيّ يرجع op بتذكرة (١٢٠ بنوع الخصم والقفل) لا رابطًا متزامنًا، وناتجه محفوظ', async () => {
  reset(); account('sara', 1000); providersOk();
  const c = await omni('sara');
  assert.equal(c.code, 200, JSON.stringify(c.body));
  assert.match(String(c.body && c.body.op), /^omni\/[0-9a-f-]{36}$/, 'معرّف مهمّة: ' + JSON.stringify(c.body));
  assert.ok(!c.body.url && !c.body.dataUrl, 'لا رابط في ردّ الإنشاء — التسليم من الاستطلاع وحده');
  assert.equal(pts('sara'), 1000 - COSTS.omni_video);
  const t = JSON.parse(kv.get(job.ticketKey(c.body.op)));
  assert.deepEqual([t.u, t.c, t.l, t.k], ['sara', COSTS.omni_video, true, 'p']);
  assert.deepEqual(JSON.parse(kv.get(veoCreate.omniOpKey(c.body.op))), { uri: OMNI_URI });
});

test('srv-video-5 ب: أغلق التطبيق قبل الاستلام — الكنس بعد ٣١ دقيقة يردّ ١٢٠ مرّة ويفكّ القفل، ولا رابط بعدها', async () => {
  reset(); account('sara', 1000); providersOk();
  const c = await omni('sara');
  assert.ok(c.body && c.body.op, JSON.stringify(c.body));
  assert.equal((await sweep('sara', NOW + 10 * 60000)).refunded, 0, 'قبل نصف ساعة ما زال يُنتظر');
  const s = await sweep('sara');
  assert.deepEqual([s.refunded, s.points], [1, COSTS.omni_video]);
  assert.equal(pts('sara'), 1000);
  assert.ok(!locks.has('sara'), 'القفل فُكّ');
  const p = await poll('veo', c.body.op);
  assert.equal(p.body.status, 'FAILED');
  assert.ok(!leaks(p));
  assert.equal((await sweep('sara', NOW + 2 * LATE)).refunded, 0);
  assert.equal(pts('sara'), 1000, 'مرّة واحدة');
});

test('srv-video-5 ج: بقي حتّى الاستلام — veo-status يسلّم الرابط الموقّع ويسوّي التذكرة بلا نداء مزوّد، والكنس لا يردّ', async () => {
  reset(); account('sara', 1000); providersOk();
  const c = await omni('sara');
  calls = [];
  const p = await poll('veo', c.body.op);
  assert.ok(delivered(p), JSON.stringify(p.body));
  assert.match(p.body.output[0], /^\/api\/video\?action=veo-download&uri=https%3A%2F%2Fgenerativelanguage\.googleapis\.com%2Fv1beta%2Ffiles%2Fomni1/);
  assert.equal(calls.length, 0, 'لا نداء مزوّد عند التسليم');
  assert.ok(!kv.has(job.ticketKey(c.body.op)), 'سُوّيت التذكرة نجاحًا');
  assert.equal((await sweep('sara')).refunded, 0);
  assert.equal(pts('sara'), 1000 - COSTS.omni_video, 'دفع مرّة واستلم');
  assert.ok(delivered(await poll('veo', c.body.op)), 'إعادة الاستطلاع تسلّم');
});

test('srv-video-5 د: تعذّر حفظ الناتج = الرابط مباشرة كما كان، بلا ردّ وبلا تذكرة (لا فيديو مجّانيّ ولا نقاط ضائعة لمن ينتظر)', async () => {
  reset(); account('sara', 1000); providersOk();
  fail.rawPrefix = 'omni:op:';
  const c = await omni('sara');
  assert.equal(c.code, 200, JSON.stringify(c.body));
  assert.match(String(c.body.url), /^\/api\/video\?action=veo-download&uri=/);
  assert.equal(pts('sara'), 1000 - COSTS.omni_video, 'سُلِّم فلا ردّ');
  assert.ok(![...kv.keys()].some((k) => k.indexOf('vidjob:') === 0 && !k.startsWith('vidjob:open:')), 'لا تذكرة');
  assert.equal((await sweep('sara')).refunded, 0, 'لا يُكنس المسلَّم');
});

test('srv-video-5 هـ: المالك — op بلا تذكرة ولا خصم، ويُسلَّم من الاستطلاع', async () => {
  reset(); providersOk();
  const c = await omni('omran');
  assert.match(String(c.body.op), /^omni\//, JSON.stringify(c.body));
  assert.ok(!kv.has(job.ticketKey(c.body.op)));
  assert.ok(delivered(await poll('veo', c.body.op)));
});

test('srv-video-5 و: الفشل قبل الناتج يردّ مرّة واحدة بلا تذكرة ولا op، ورمية بعد كتابة التذكرة لا تردّ ثانيةً (التذكرة تملك الردّ)', async () => {
  const cases = [
    [() => ({ status: 429, body: { error: { message: 'Your prepayment credits are depleted.' } } }), 503],
    [() => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'blocked' }] }] } }), 502],
    [() => ({ throw: Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) }), 500],
  ];
  for (const [reply, code] of cases) {
    reset(); account('sara', 1000); providersOk(); P.omni = reply;
    const c = await omni('sara');
    assert.equal(c.code, code, JSON.stringify(c.body));
    assert.equal(pts('sara'), 1000, 'رُدّت مرّة');
    assert.ok(![...kv.keys()].some((k) => k.indexOf('omni:op:') === 0 || (k.indexOf('vidjob:') === 0 && !k.startsWith('vidjob:open:'))), 'لا ناتج ولا تذكرة');
    assert.equal((await sweep('sara')).refunded, 0, 'ولا ردّ ثانٍ من الكنس');
    assert.equal(pts('sara'), 1000);
  }
  // الردّ نفسه يرمي بعد كتابة التذكرة: لا ردّ في catch، والكنس يردّ مرّة واحدة
  reset(); account('sara', 1000); providersOk();
  let first = true;
  const c = await omni('sara', { res: { json(v) { if (first && v && v.op) { first = false; throw new Error('socket closed'); } this.body = v; return this; } } });
  assert.equal(c.code, 500);
  assert.equal(pts('sara'), 1000 - COSTS.omni_video, 'catch لم يردّ — التذكرة تملكه');
  const s = await sweep('sara');
  assert.equal(s.refunded, 1);
  assert.equal(pts('sara'), 1000, 'ردّ واحد بالضبط');
});

// ─────────────── v-lock-port-vid: مسارات التسليم التي أضافها main أو غيّرها بعد الإصلاح ───────────────
const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.';
const geminiOut = () => { P.omni = () => ({ status: 429, body: { error: { code: 429, message: DEPLETED } } }); };
async function cinema(u) { // «سينمائي» في صانع الفيديو بعد v-cinema-omni: veo-create بلا ترند
  const r = res();
  await quiet(() => veoCreate({ method: 'POST', query: { action: 'veo-create' }, body: { promptText: 'قطّة تلعب في الحديقة', ratio: '720:1280', quality: 'fast', durationSeconds: 8, confirmed: true, token: token(u) } }, r));
  return r;
}

test('port أ (srv-video-1): احتياط الفيديو من veo-create الحقيقيّ — رصيد Gemini خلص فيبدأ عند fal بتذكرة ١٧٥؛ أغلق التطبيق: الكنس يردّ مرّة، ثمّ لا رابط ولا ناتج محفوظ', async () => {
  reset(); account('sara', 1000); providersOk(); geminiOut();
  const c = await trend('sara');
  assert.equal(c.code, 200, JSON.stringify(c.body));
  assert.equal(c.body.op, 'bk/' + FAL_REQ, 'op الاحتياط: ' + JSON.stringify(c.body));
  assert.equal(pts('sara'), 1000 - COSTS.veo_video);
  const t = JSON.parse(kv.get(job.ticketKey(c.body.op)));
  assert.deepEqual([t.u, t.c, t.l], ['sara', COSTS.veo_video, true], 'تذكرة الاحتياط بالتكلفة والقفل');
  assert.ok(kv.has(veoCreate.falOpKey(c.body.op)), 'سجلّ الطابور محفوظ');
  const s = await sweep('sara');
  assert.deepEqual([s.refunded, s.points], [1, COSTS.veo_video], 'الكنس ردّ');
  assert.equal(pts('sara'), 1000);
  assert.ok(!locks.has('sara'), 'القفل فُكّ');
  const p = await poll('fal', c.body.op); // fal أنهى الفيديو وما زال يحفظه
  assert.equal(p.body && p.body.status, 'FAILED', 'لا تسليم فوق ردّ — ' + JSON.stringify(p.body));
  assert.ok(!leaks(p), 'لا رابط بعد الردّ');
  assert.deepEqual(media, [], 'لا يُحفظ ناتجًا مسلَّمًا');
  assert.equal((await poll('fal', c.body.op)).body.status, 'FAILED', 'التكرار لا يسلّم');
  assert.equal((await sweep('sara', NOW + 2 * LATE)).refunded, 0);
  assert.equal(pts('sara'), 1000, 'ردّ واحد لا اثنان');
});

test('port ب: الاحتياط بقي حتّى الاستلام — يسلّم رابط الناتج ويسوّي ويُحفظ ناتجًا لنا، والكنس لا يردّ، وفشل متأخّر لا يردّ ما سُلِّم', async () => {
  reset(); account('lina', 1000); providersOk(); geminiOut();
  const c = await trend('lina');
  assert.equal(c.body && c.body.op, 'bk/' + FAL_REQ, JSON.stringify(c.body));
  P.falStatus = () => ({ status: 200, body: { status: 'IN_PROGRESS' } });
  assert.equal((await poll('fal', c.body.op)).body.status, 'RUNNING');
  providersOk();
  const p = await poll('fal', c.body.op);
  assert.ok(delivered(p), JSON.stringify(p.body));
  assert.equal(p.body.output[0], FAL_URL);
  assert.deepEqual(media, [FAL_URL], 'ناتج مدفوع محفوظ (v-dl-ours)');
  assert.ok(!kv.has(job.ticketKey(c.body.op)), 'سُوّيت التذكرة نجاحًا');
  assert.equal((await sweep('lina')).refunded, 0, 'المسلَّم لا يُردّ');
  assert.ok(delivered(await poll('fal', c.body.op)), 'إعادة الاستطلاع تسلّم');
  P.falStatus = () => ({ status: 200, body: { status: 'COMPLETED', error: 'late' } });
  await poll('fal', c.body.op);
  assert.equal(pts('lina'), 1000 - COSTS.veo_video, 'دفع مرّة واستلم — لا ردّ بعد التسليم');
});

test('port ج (srv-video-5 بعد v-cinema-omni): «سينمائي» الجديد على veo-create — op بتذكرة لا رابط متزامن (Omni أو الاحتياط)؛ أغلق التطبيق: ردّ مرّة ولا تسليم؛ بقي: يسلّم ولا يُردّ', async () => {
  for (const [engine, kind, opRe] of [['omni', 'veo', /^omni\/[0-9a-f-]{36}$/], ['backup', 'fal', /^bk\//]]) {
    for (const stay of [false, true]) {
      reset(); account('sara', 1000); providersOk();
      if (engine === 'backup') geminiOut();
      const c = await cinema('sara');
      assert.equal(c.code, 200, engine + ': ' + JSON.stringify(c.body));
      assert.match(String(c.body.op), opRe, engine);
      assert.ok(!c.body.url && !c.body.output, engine + ': لا رابط في ردّ الإنشاء');
      const t = JSON.parse(kv.get(job.ticketKey(c.body.op)));
      assert.deepEqual([t.u, t.c], ['sara', COSTS.veo_video], engine + ': تذكرة');
      const paid = pts('sara');
      assert.equal(paid, 1000 - COSTS.veo_video, engine + ': خُصم');
      if (stay) {
        assert.ok(delivered(await poll(kind, c.body.op)), engine + ': بقي فاستلم');
        assert.equal((await sweep('sara')).refunded, 0, engine + ': المسلَّم لا يُردّ');
        assert.equal(pts('sara'), paid, engine);
      } else {
        assert.equal((await sweep('sara')).refunded, 1, engine + ': الكنس ردّ');
        assert.equal(pts('sara'), 1000, engine);
        const p = await poll(kind, c.body.op);
        assert.ok(!delivered(p) && !leaks(p), engine + ': لا تسليم فوق ردّ — ' + JSON.stringify(p.body));
        assert.equal((await sweep('sara', NOW + 2 * LATE)).refunded, 0, engine + ': مرّة واحدة');
        assert.equal(pts('sara'), 1000, engine);
      }
    }
  }
});

test('port د: المالك على الاحتياط — op بلا تذكرة ولا خصم، ويُسلَّم كما كان', async () => {
  reset(); providersOk(); geminiOut();
  const c = await trend('omran');
  assert.equal(c.body && c.body.op, 'bk/' + FAL_REQ, JSON.stringify(c.body));
  assert.ok(!kv.has(job.ticketKey(c.body.op)), 'لا تذكرة للمالك');
  assert.ok(delivered(await poll('fal', c.body.op)));
  assert.ok(delivered(await poll('fal', c.body.op)), 'وإعادته');
});

/* العميل: فرع «فيديو سينمائيّ» في صانع الفيديو بالـvm — op ثمّ استطلاع veo-status، والرابط القديم يعمل كما كان */
const VIDEO = read('js/app-11-video.js');
function extractBlock(source, startNeedle) {
  const a = source.indexOf(startNeedle);
  assert.ok(a >= 0, 'بداية الكتلة: ' + startNeedle);
  let depth = 0, i = source.indexOf('{', a);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  return source.slice(a, i + 1);
}
async function runOmniClient(createReply, statusReplies) {
  const log = { status: [], fetches: [], create: null, saved: null };
  const ctx = {
    window: { t: (k) => ({ axAttachVidFailed: 'VIDFAILED-T' })[k] || k,
      postWithConfirm: async (url, payload) => { log.create = { url, payload }; return new Response(JSON.stringify(createReply.body), { status: createReply.code || 200 }); } },
    creationMode: 'omni', text: 'قطّة', ratio: '720:1280', token: 'tk', wantQuality: false, style: '', filmHeroBase64: null, filmHeroMime: null,
    setStatus: (s) => log.status.push(String(s)), bT: (a) => a, throwIfDeclined: () => {},
    friendlyError: (e) => 'ERR:' + (e && (e.code || e.message)),
    fetch: async (u) => { log.fetches.push(String(u)); if (/action=veo-status/.test(String(u))) { const r = statusReplies.shift() || { status: 'RUNNING' }; return new Response(JSON.stringify(r), { status: r.__code || 200 }); } return new Response('vid', { status: 200 }); },
    URL: { createObjectURL: () => 'blob:omni' },
    resultEl: { style: {} }, downloadEl: { style: {} }, btnGenerate: { disabled: true },
    autoSaveVideo: (u) => { log.saved = u; },
    setInterval: (fn) => setInterval(fn, 1), clearInterval, Response, encodeURIComponent, Error, Object, Promise, Array, String, Number, console,
  };
  vm.createContext(ctx);
  vm.runInContext(extractBlock(VIDEO, 'function makePollGuard(') + '\n' + extractBlock(VIDEO, 'function vmkT(') + '\nthis.__run = async function(){ ' + extractBlock(VIDEO, "    if(creationMode === 'omni'){") + ' };', ctx);
  await ctx.__run();
  return { ctx, log };
}

test('srv-video-5 ز: العميل — يستلم op فيستطلع veo-status حتّى SUCCEEDED ويعرض الفيديو؛ FAILED بنصّ مترجم؛ والرابط المباشر القديم كما كان', async () => {
  const OUT = '/api/video?action=veo-download&uri=x&sig=s';
  const a = await runOmniClient({ body: { op: 'omni/abc' } }, [{ status: 'RUNNING' }, { status: 'SUCCEEDED', output: [OUT] }]);
  assert.equal(a.log.create.url, '/api/video?action=omni-create');
  assert.ok(a.log.fetches.some((u) => u === '/api/video?action=veo-status&op=' + encodeURIComponent('omni/abc')), 'يستطلع بالـop: ' + a.log.fetches.join(' | '));
  assert.equal(a.ctx.resultEl.src, 'blob:omni', 'عرض الفيديو: ' + a.log.status.join(' | '));
  assert.equal(a.ctx.downloadEl.href, OUT);
  assert.ok(a.log.fetches.includes(OUT), 'نزّل الرابط المسلَّم');
  assert.equal(a.ctx.btnGenerate.disabled, false);

  const f = await runOmniClient({ body: { op: 'omni/def' } }, [{ status: 'FAILED', failure: 'x', failureCode: 'failed' }]);
  assert.equal(f.ctx.resultEl.src, undefined);
  assert.equal(f.log.status.slice(-1)[0], 'ERR:VIDFAILED-T', 'نصّ القاموس (١٤ لغة)');

  // عطل عابر عند الاستطلاع (٥xx) لا يُسقط فيديو جاهزًا مدفوعًا — يُعاد ثمّ يُسلَّم
  const tr = await runOmniClient({ body: { op: 'omni/ghi' } }, [{ __code: 500, error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' }, { status: 'SUCCEEDED', output: [OUT] }]);
  assert.equal(tr.ctx.resultEl.src, 'blob:omni', 'العابر يُعاد: ' + tr.log.status.join(' | '));
  const gone = await runOmniClient({ body: { op: 'omni/jkl' } }, [{ __code: 503, error: 'unavailable', retryable: false }]);
  assert.equal(gone.log.status.slice(-1)[0], 'ERR:unavailable', 'الخدمة متوقّفة نهائيّ لا يُعاد');

  const u = await runOmniClient({ body: { error: 'unavailable', retryable: false }, code: 503 }, []);
  assert.equal(u.log.status.slice(-1)[0], 'ERR:unavailable');

  const old = await runOmniClient({ body: { url: OUT } }, []);
  assert.ok(!old.log.fetches.some((x) => /veo-status/.test(x)), 'الرابط المباشر بلا استطلاع');
  assert.equal(old.ctx.resultEl.src, 'blob:omni');
  assert.equal(old.ctx.downloadEl.href, OUT);
});
