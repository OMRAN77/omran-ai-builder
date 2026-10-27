'use strict';
/* tests/lock-fix-vid.test.cjs — v-lock-vid (باب المال، موافقة المالك ٢٧ أكتوبر: «صلح الخطير وابدا فيهم كلهم»).
   srv-video-1 (حرج): الكنس بعد ٣٠ دقيقة يردّ نقاط فيديو Omni/Veo/الاقتصاديّ/الممثّل بلا سؤال المزوّد، ثمّ كان الاستطلاع يسلّم الفيديو
   نفسه (settleVideoJob(…, true) يرجع null ولا يفحصه أحد) — فيديو مجّانيّ يتكرّر بسكربت. وكذلك ردّ الاستطلاع عند عطل المزوّد ثمّ نجاحه.
   الآن «لا تسليم فوق ردّ»: علامة التسوية '0' تمنع الرابط في نقاط الاستطلاع الأربع.
   srv-video-5: المحرّك السينمائيّ المباشر (omni-create) كان يخصم ١٢٠ ويرسل الرابط في ردّ متزامن بلا تذكرة — من أغلق التطبيق أثناء
   الانتظار يخسر نقاطه. الآن يحفظ الناتج بمعرّف omni/… مع تذكرة كترند Omni، ويسلّمه veo-status فيُسوّى، والكنس يردّ ما لم يُسلَّم.
   المعالجات الحقيقيّة (video-job وpoints والاستطلاعات الأربعة وveo-create وomni-create) بتخزين مزيّف في الذاكرة وfetch مزيّف — بلا شبكة. */
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

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

/* ── التخزين المزيّف: Map + مدد الصلاحيّة المطلوبة + حقن أعطال وتأخير عشوائيّ (للسباق) ── */
const kv = new Map();
const ttls = new Map();
const fail = { setIfAbsent: 0, rawPrefix: '' };
let jitter = null; // دالّة تأخير أو null
const pause = async () => { if (jitter) await jitter(); };
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => { await pause(); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v, ttl) => { await pause(); if (fail.rawPrefix && String(k).indexOf(fail.rawPrefix) === 0) throw new Error('redis down'); kv.set(k, String(v)); if (ttl) ttls.set(k, ttl); },
  kvSetIfAbsent: async (k, v, ttl) => { await pause(); if (fail.setIfAbsent > 0) { fail.setIfAbsent--; throw new Error('redis timeout'); } if (kv.has(k)) return false; kv.set(k, String(v)); ttls.set(k, ttl); return true; },
  kvIncrBy: async (k, n) => { await pause(); const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await pause(); const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { await pause(); try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
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
function reset() { kv.clear(); ttls.clear(); users.clear(); locks.clear(); media.length = 0; fail.setIfAbsent = 0; fail.rawPrefix = ''; jitter = null; }

/* ── المزوّدون: كلّ واحد ينجح ما لم يُقل غير ذلك؛ كلّ نداء يُسجَّل ── */
const OMNI_URI = 'https://generativelanguage.googleapis.com/v1beta/files/omni1:download?alt=media';
const VEO_URI = 'https://generativelanguage.googleapis.com/v1beta/files/veo1:download?alt=media';
const MM_URL = 'https://cdn.minimax.test/x.mp4';
const FAL_URL = 'https://v3.fal.media/files/x/actor.mp4';
const RW_OUT = 'https://dnznrvs05pmza.cloudfront.net/rw/out.mp4';
let calls = [];
const P = {};
function providersOk() {
  P.omni = () => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'video', uri: OMNI_URI }] }] } });
  P.veoOp = () => ({ status: 200, body: { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: VEO_URI } }] } } } });
  P.mmQuery = () => ({ status: 200, body: { status: 'Success', file_id: 'F1', base_resp: { status_code: 0 } } });
  P.mmFile = () => ({ status: 200, body: { file: { download_url: MM_URL } } });
  P.falStatus = () => ({ status: 200, body: { status: 'COMPLETED' } });
  P.falResult = () => ({ status: 200, body: { video: { url: FAL_URL } } });
  P.rw = () => ({ status: 200, body: { id: 'rwtask-1', status: 'SUCCEEDED', output: [RW_OUT] } });
}
providersOk();
global.fetch = async (url, init) => {
  const u = String(url);
  calls.push(u);
  let r;
  if (/\/interactions$/.test(u)) r = P.omni();
  else if (/generativelanguage\.googleapis\.com\/v1beta\/.*operations\//.test(u)) r = P.veoOp();
  else if (/\/v1\/query\/video_generation/.test(u)) r = P.mmQuery();
  else if (/\/v1\/files\/retrieve/.test(u)) r = P.mmFile();
  else if (/queue\.fal\.run\/.*\/status$/.test(u)) r = P.falStatus();
  else if (/queue\.fal\.run\//.test(u)) r = P.falResult();
  else if (/\/v1\/tasks\//.test(u)) r = P.rw();
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
  for (const [kind, id, cost] of [['veo', 'models/veo-3.1/operations/op1', COSTS.veo_video], ['mm', 'mm-task-1', COSTS.minimax_video], ['actor', 'actor:req-actor-001', 175]]) {
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
    ['mm', 'mm-task-2', COSTS.minimax_video, () => { P.mmFile = () => ({ status: 500, body: {} }); }],
    ['veo', 'models/veo-3.1/operations/op2', COSTS.veo_video, () => { P.veoOp = () => ({ status: 402, body: { error: { message: 'billing account disabled' } } }); }],
    ['actor', 'actor:req-actor-002', 175, () => { P.falStatus = () => ({ status: 403, body: { detail: 'User is locked. Reason: Exhausted balance.' } }); }],
  ];
  for (const [kind, id, cost, breakIt] of cases) {
    reset(); account('omar', 1000); providersOk();
    await charged('omar', id, cost);
    breakIt();
    const a = await poll(kind, id);
    assert.ok(a.code >= 500 || (a.body && a.body.error), kind + ': الاستطلاع الأوّل فشل');
    assert.equal(pts('omar'), 1000, kind + ': رُدّت');
    providersOk(); // المزوّد عاد، والمهمّة ناجحة عنده
    const b = await poll(kind, id);
    assert.ok(!delivered(b), kind + ': لا تسليم بعد الردّ — ' + JSON.stringify(b.body));
    assert.ok(!leaks(b), kind + ': لا رابط');
    assert.equal(pts('omar'), 1000, kind);
  }
});

test('srv-video-1 د: المسلَّم أوّلًا لا يُردّ، والاستطلاع المكرّر يسلّم (إعادة تشغيل آمنة)، والمالك بلا تذكرة يُسلَّم كما كان', async () => {
  for (const [kind, id, cost] of [['veo', 'models/veo-3.1/operations/op3', COSTS.veo_video], ['mm', 'mm-task-3', COSTS.minimax_video], ['actor', 'actor:req-actor-003', 175], ['rw', '0:rwtask-3', COSTS.runway_video]]) {
    reset(); account('lina', 1000); providersOk();
    await charged('lina', id, cost);
    assert.ok(delivered(await poll(kind, id)), kind + ': سُلِّم');
    assert.ok(delivered(await poll(kind, id)), kind + ': الاستطلاع المكرّر يسلّم');
    const s = await sweep('lina');
    assert.equal(s.refunded, 0, kind + ': المسلَّم لا يُردّ');
    assert.equal(pts('lina'), 1000 - cost, kind);
    assert.ok(delivered(await poll(kind, id)), kind + ': بعد الكنس يسلّم أيضًا');
    // المالك (أو مهمّة بلا خصم): لا تذكرة ولا علامة = يُسلَّم
    assert.ok(delivered(await poll(kind, kind === 'actor' ? 'actor:req-owner-0001' : kind === 'rw' ? '0:owner-task' : kind === 'veo' ? 'models/veo-3.1/operations/owner' : 'mm-owner')), kind + ': المالك يُسلَّم');
  }
});

test('srv-video-1 هـ: السباق — كنس واستطلاع متزامنان بترتيب عشوائيّ: إمّا ردّ بلا رابط وإمّا رابط بلا ردّ، أبدًا الاثنان', async () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let refundedRuns = 0, deliveredRuns = 0;
  for (let i = 0; i < 60; i++) {
    const kind = ['veo', 'mm', 'actor'][i % 3];
    const id = kind === 'veo' ? 'models/veo-3.1/operations/race' + i : kind === 'mm' ? 'mm-race-' + i : 'actor:req-race-' + String(i).padStart(4, '0');
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
  await charged('huda', 'mm-claim-1', COSTS.minimax_video);
  fail.setIfAbsent = 1;
  const a = await poll('mm', 'mm-claim-1');
  assert.equal(a.body && a.body.status, 'RUNNING', 'لم يُحسم = يعيد العميل: ' + JSON.stringify(a.body));
  assert.ok(!leaks(a));
  const b = await poll('mm', 'mm-claim-1');
  assert.ok(delivered(b), 'التالي يسلّم');
  assert.equal((await sweep('huda')).refunded, 0, 'المسلَّم لا يُردّ');
  assert.equal(pts('huda'), 1000 - COSTS.minimax_video);
});

test('srv-video-1 ز: علامة «رُدّت» تعيش أطول من التذكرة ومن ناتج المزوّد المحفوظ (يومان)، وعلامة التسليم كما كانت', async () => {
  reset(); account('reem', 1000);
  await charged('reem', 'mm-ttl-1', COSTS.minimax_video);
  await sweep('reem');
  const refundedTtl = ttls.get(job.ticketKey('mm-ttl-1') + ':done');
  assert.ok(refundedTtl > job.TICKET_TTL_SEC, 'علامة الردّ ' + refundedTtl + ' ثانية — كانت بمدّة التذكرة فيسلّم الاستطلاع بعد سقوطها');
  assert.ok(refundedTtl >= 30 * 86400);
  await charged('reem', 'mm-ttl-2', COSTS.minimax_video);
  await poll('mm', 'mm-ttl-2');
  assert.equal(ttls.get(job.ticketKey('mm-ttl-2') + ':done'), job.TICKET_TTL_SEC, 'علامة التسليم بمدّتها');
});

test('srv-video-1 ح: الردّ مرّة واحدة تحت التكرار — ثلاثة كنوس متزامنة واستطلاع فاشل معها', async () => {
  reset(); account('dana', 1000); providersOk();
  await charged('dana', 'mm-many-1', COSTS.minimax_video);
  P.mmQuery = () => ({ status: 200, body: { status: 'Fail', base_resp: { status_code: 0 } } });
  const out = await Promise.all([sweep('dana'), sweep('dana'), sweep('dana'), poll('mm', 'mm-many-1')]);
  assert.equal(out[3].body.status, 'FAILED');
  assert.equal(pts('dana'), 1000, 'ردّ واحد بالضبط');
  providersOk();
  assert.equal((await poll('mm', 'mm-many-1')).body.status, 'FAILED', 'ولا تسليم بعده');
});
