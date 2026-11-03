'use strict';
/* v-fal-backup — الفيديو والإطار الأوّل (أمر المالك ٣ نوفمبر ٢٠٢٦: «موجود خارجي وصله»). المعالج الحقيقيّ veo-create/veo-status
   وtrend-people.callImage الحقيقيّ، وfetch مزيّف يوجّه googleapis وfal.run وqueue.fal.run (بلا شبكة ولا صرف):
   ١) رصيد Gemini خلص (429 «prepayment credits are depleted» أو 402) عند Omni ← النموذج نفسه عند fal بالطابور: op «fal/…» وسجلّه
      بعمر مهامّ omni والتذكرة نفسها، والنقاط تبقى مخصومة؛ والاستطلاع يسلّم ويسوّي بالعقد نفسه.
   ٢) الإطار الأوّل للترند يمرّ عبر fal (nano-banana-pro/edit بالدقّة والنسبة نفسيهما)، والفيديو بعده مباشرة بلا نداء Gemini فاشل.
   ٣) الزحام العاديّ (429 «Resource has been exhausted») لا يحوّل؛ وfal الموقوف (403 «User is locked») = المسار القديم حرفيًّا.
   ٤) لا اسم مزوّد أو نموذج في نصّ يصل العميل.
   ٥) محاولة fal واحدة لكلّ نداء (العلم قائم وfal رفض): لا إنقاذ ثانٍ بعد Gemini الفاشل — لا دفع مرّتين ولا تجاوز للمهلة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = 'fal-backup-video-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
process.env.FAL_KEY = 'fal-test-key';
process.env.MERGE_FACE_CROPS = 'off'; // لقطات الوجه خارج هذا الاختبار (بلا نداء كشف)
for (const k of ['FAL_BACKUP', 'FAL_BACKUP_CAP_CENTS', 'TREND_ENGINE', 'CINEMA_ENGINE', 'OMNI_VIDEO_MODEL', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
  'VIDEO_FREE_FRAME', 'VIDEO_FIRST_FRAME', 'TREND_FACE_SWAP', 'GEMINI_API_BASE']) delete process.env[k];

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
const ttl = new Map();
const users = new Map();
const locks = new Set();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v, t) => { kv.set(k, String(v)); if (t) ttl.set(k, t); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvGetJSON: async (k) => { try { return kv.has(k) ? JSON.parse(kv.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); }, kvDel: async (k) => { kv.delete(k); }, kvExpire: async () => {},
  kvIncr: async (k) => { const v = Number(kv.get(k) || 0) + 1; kv.set(k, String(v)); return v; }, kvList: async () => [],
  kvPipeline: async (cmds) => cmds.map(([op, k, v]) => { if (op === 'INCRBY') { const x = Number(kv.get(k) || 0) + Number(v); kv.set(k, String(x)); return x; } kv.set(k, String(v)); return 'OK'; }),
});
mock('api/_lib/auth.js', {
  getUser: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  getUserOnce: async (u) => users.has(u) ? structuredClone(users.get(u)) : null,
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false, verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/abuse-guard.js', {
  videoLock: async (u) => (locks.has(u) ? { ok: false, retryAfter: 150 } : (locks.add(u), { ok: true })),
  releaseVideoLock: async (u) => { locks.delete(u); }, videoCooldownLeft: async () => 0, imageHourlyGuard: async () => ({ ok: true }),
});
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const TP = require(rp('api/_lib/trend-people.js'));
const veo = require(rp('api/_lib/veo-create.js'));
const status = require(rp('api/_lib/veo-status.js'));
const job = require(rp('api/_lib/video-job.js'));
const fb = require(rp('api/_lib/fal-fallback.js'));
const ourMedia = require(rp('api/_lib/our-media.js'));
const COST = require(rp('api/_lib/points.js')).COSTS.veo_video;
const NOW = Date.now();
const DAY = 86400000;
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
/* مشترك Max صلاحيّة فيديوهاته مستهلكة: الخصم ١٧٥ نقطة (كاختبار trend-omni ٦) */
function account(u, pts) { users.set(u, { username: u, plan: 'max', planUpdatedAt: NOW - DAY, points: pts }); kv.set('points:' + u, String(pts)); kv.set('planvid:' + encodeURIComponent(u) + ':' + Math.floor(NOW - DAY), '3'); }
const pts = (u) => Number(kv.get('points:' + u));
const ownerTok = token('omran');

const DEPLETED = 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.';
const BUSY = 'Resource has been exhausted (e.g. check quota).';
const LOCKED = '{"detail":"User is locked. Reason: Exhausted balance."}';
const FAL_PNG = Buffer.from('fal-frame-png').toString('base64');
const QUEUE = 'https://queue.fal.run/google/gemini-omni-flash/requests/';
const VIDEO_URL = (id) => 'https://v3.fal.media/files/' + id + '.mp4';
const OMNI_OK = () => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media' }] }] } });
const err = (status, message) => () => ({ status, body: { error: { code: status, message } } });

/* المزوّدون: كلّ نداء يُسجَّل؛ مهامّ الطابور في falJobs برقمها */
let calls = [];
let omniReply = OMNI_OK;
let imageReply = err(402, DEPLETED);
let veoReply = () => ({ status: 200, body: { name: 'operations/veo-1' } });
let falImage = 'ok';
let falSubmit = 'ok';
let ridN = 0;
const falJobs = new Map(); // id → { code, status, error, result }
global.fetch = async (url, init) => {
  const u = String(url);
  let body = null;
  try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
  calls.push({ url: u, method: (init && init.method) || 'GET', body, headers: (init && init.headers) || {} });
  const send = (r) => new Response(JSON.stringify(r.body), { status: r.status });
  if (/generativelanguage\.googleapis\.com\/.*\/interactions$/.test(u)) return send(omniReply());
  if (/generativelanguage\.googleapis\.com\/.*-image:generateContent/.test(u)) return send(imageReply());
  if (/predictLongRunning/.test(u)) return send(veoReply());
  if (/^https:\/\/fal\.run\//.test(u)) {
    if (falImage === 'locked') return new Response(LOCKED, { status: 403 });
    return new Response(JSON.stringify({ images: [{ url: 'data:image/png;base64,' + FAL_PNG, content_type: 'image/png' }] }), { status: 200 });
  }
  if (/^https:\/\/queue\.fal\.run\//.test(u)) {
    if (init && init.method === 'POST') {
      if (falSubmit === 'locked') return new Response(LOCKED, { status: 403 });
      const id = 'f' + (++ridN) + '-5a1e-4c2b-9d3e-0011223344aa';
      falJobs.set(id, { code: 200, status: 'IN_QUEUE' });
      return new Response(JSON.stringify({ request_id: id, status_url: QUEUE + id + '/status', response_url: QUEUE + id }), { status: 200 });
    }
    const m = /\/requests\/([\w-]+)(\/status)?$/.exec(u);
    const j = m && falJobs.get(m[1]);
    if (!j) return new Response('{"detail":"Not found"}', { status: 404 });
    if (m[2]) return j.code === 200 ? new Response(JSON.stringify({ status: j.status, error: j.error }), { status: 200 }) : new Response(j.text || '{}', { status: j.code });
    return new Response(JSON.stringify(j.result || { video: { url: VIDEO_URL(m[1]) } }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};
function res() { return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } }; }
async function create(body) { const r = res(); await veo({ method: 'POST', query: { action: 'veo-create' }, body: Object.assign({ quality: 'fast', durationSeconds: 8, confirmed: true }, body) }, r); return r; }
async function poll(op) { const r = res(); await status({ method: 'GET', query: { op } }, r); return r; }
const submits = () => calls.filter((c) => /^https:\/\/queue\.fal\.run\//.test(c.url) && c.method === 'POST');
const falImages = () => calls.filter((c) => /^https:\/\/fal\.run\//.test(c.url));
const omniCalls = () => calls.filter((c) => /\/interactions$/.test(c.url));
const idOf = (op) => String(op).slice('fal/'.length);
const spent = () => Number(kv.get(fb.spentKey(new Date().toISOString().slice(0, 10))) || 0);
const falOps = () => [...kv.keys()].filter((k) => k.indexOf('fal:op:') === 0);
/* لا اسم مزوّد ولا نموذج في ما يقرؤه العميل نصًّا (op والرابط معرّفان لا نصّ) */
const PROVIDER_RE = /fal|gemini|omni|veo|nano|banana|google/i;
function noProvider(body, where) {
  const copy = Object.assign({}, body || {});
  delete copy.op; delete copy.output;
  assert.doesNotMatch(JSON.stringify(copy), PROVIDER_RE, where + ': ' + JSON.stringify(copy));
}
function reset() {
  calls = []; omniReply = OMNI_OK; imageReply = err(402, DEPLETED); falImage = 'ok'; falSubmit = 'ok'; locks.clear();
  for (const k of [...kv.keys()]) if (k.indexOf('db/') === 0) kv.delete(k); // علم «خارج الرصيد» والعدّاد والإشعارات
}

test('١. ترند بلا صورة: Omni 429 «الرصيد» ← fal نصّ←فيديو بالأمر نفسه، op fal/ وسجلّه بعمر omni والتذكرة، والنقاط تبقى مخصومة؛ والاستطلاع يسلّم ويسوّي', async () => {
  reset(); account('u1', 1000);
  omniReply = err(429, DEPLETED);
  const r = await create({ token: token('u1'), trend: 'pixarsketch', params: { text: 'أبو سعيد يبيع القهوة', sceneIndex: 0 }, ratio: '720:1280' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.match(String(r.body.op), /^fal\/f\d+-/);
  noProvider(r.body, 'create');
  assert.equal(omniCalls().length, 1, 'Gemini نودي مرّة واحدة');
  const s = submits();
  assert.equal(s.length, 1);
  assert.equal(s[0].url, 'https://queue.fal.run/google/gemini-omni-flash', 'Omni Flash نفسه — نصّ←فيديو');
  assert.equal(s[0].headers.Authorization, 'Key fal-test-key');
  assert.equal(s[0].body.prompt, omniCalls()[0].body.input[0].text, 'الأمر نفسه الذي وصل Gemini');
  assert.equal(s[0].body.aspect_ratio, '9:16');
  assert.equal(s[0].body.duration, 8);
  assert.ok(!('image_url' in s[0].body) && !('image_urls' in s[0].body));
  const op = r.body.op;
  assert.ok(kv.has(veo.falOpKey(op)), 'سجلّ الطابور');
  assert.equal(ttl.get(veo.falOpKey(op)), 2 * 86400, 'بعمر مهامّ omni');
  assert.match(JSON.parse(kv.get(veo.falOpKey(op))).s, /^https:\/\/queue\.fal\.run\//);
  assert.ok(kv.has(job.ticketKey(op)), 'تذكرة الخصم نفسها');
  assert.equal(pts('u1'), 1000 - COST, 'الخصم باقٍ: الفيديو قادم');
  assert.ok(locks.has('u1'), 'قفل الثلاث دقائق باقٍ');
  assert.ok(kv.get(fb.OUT_KEY), 'علم «Gemini خارج الرصيد»');
  assert.equal(spent(), 100, '٨ ثوانٍ في عدّاد السقف');
  assert.ok(![...kv.keys()].some((k) => k.indexOf('omni:op:') === 0), 'لا مهمّة omni');

  /* الاستطلاع — بلا مفتاح Gemini أصلًا */
  const gk = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  try {
    calls = [];
    const p1 = await poll(op);
    assert.deepEqual(p1.body, { status: 'RUNNING' });
    assert.equal(calls[0].url, QUEUE + idOf(op) + '/status');
    falJobs.get(idOf(op)).status = 'COMPLETED';
    const p2 = await poll(op);
    assert.equal(p2.code, 200);
    assert.deepEqual(p2.body, { status: 'SUCCEEDED', output: [VIDEO_URL(idOf(op))] });
    assert.ok(!calls.some((c) => /googleapis/.test(c.url)), 'لا نداء Gemini عند الاستطلاع');
  } finally { process.env.GEMINI_API_KEY = gk; }
  assert.ok(!kv.has(job.ticketKey(op)), 'سُوّيت التذكرة نجاحًا');
  assert.equal(pts('u1'), 1000 - COST, 'لا ردّ عند النجاح');
  assert.equal(await ourMedia.isOurMedia(VIDEO_URL(idOf(op))), true, 'ناتجنا: حفظه لا يُعدّ على سقف التنزيل');
});

test('٢. 402 مع صورة: إطار الترند عبر fal (nano-banana-pro/edit، 2K، 9:16) ثمّ الفيديو image-to-video بالإطار نفسه بلا نداء Gemini فاشل؛ والسينمائيّ بمدّته المختارة', async () => {
  reset();
  imageReply = err(402, 'billing');
  omniReply = err(402, 'Payment required');
  const photo = Buffer.from('photo-heritage-' + Date.now()).toString('base64');
  const r = await create({ token: ownerTok, trend: 'heritagesing', params: { text: 'يا هلا', sceneIndex: 0 }, ratio: '720:1280', imageBase64: photo, imageMime: 'image/jpeg' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  noProvider(r.body, 'create');
  const img = falImages();
  assert.equal(img.length, 1, 'إطار واحد');
  assert.equal(img[0].url, 'https://fal.run/fal-ai/nano-banana-pro/edit', 'Pro نفسه بالتعديل');
  assert.equal(img[0].body.resolution, '2K', 'الدقّة التي طُلبت من Gemini (ترند Omni = 2K)');
  assert.equal(img[0].body.aspect_ratio, '9:16');
  assert.equal(img[0].body.image_urls[0], 'data:image/jpeg;base64,' + photo);
  assert.equal(omniCalls().length, 0, 'العلم يخطّي Omni الفاشل');
  const s = submits();
  assert.equal(s.length, 1);
  assert.equal(s[0].url, 'https://queue.fal.run/google/gemini-omni-flash/image-to-video');
  assert.equal(s[0].body.image_url, 'data:image/png;base64,' + FAL_PNG, 'الإطار المبنيّ أوّل إطار');
  assert.ok(s[0].body.prompt.endsWith(TP.FRAME_LOCK + veo.TREND_NO_CUTS), 'قفل الإطار و«بلا قطع» كما عند Omni');
  assert.doesNotMatch(s[0].body.prompt, /\[# |Image1|Image2/, 'بلا وسوم أدوار Interactions');
  assert.equal(s[0].body.duration, 8);

  /* السينمائيّ: Omni يُنادى (لا علم) ثمّ ٥ ثوانٍ عرضيًّا */
  reset();
  omniReply = err(402, 'Payment required');
  const c = await create({ token: ownerTok, promptText: 'صقر فوق الكثبان', ratio: '1280:720', durationSeconds: 5 });
  assert.equal(c.code, 200, JSON.stringify(c.body));
  assert.equal(omniCalls().length, 1);
  assert.equal(submits()[0].url, 'https://queue.fal.run/google/gemini-omni-flash');
  assert.equal(submits()[0].body.duration, 5);
  assert.equal(submits()[0].body.aspect_ratio, '16:9');
  assert.equal(submits()[0].body.prompt, 'صقر فوق الكثبان');
});

test('٣. صورة شخص بلا إطار (بيكسار): مرجع ملامح reference-to-video بوسم <IMAGE_REF_0> وإرشاده — لا أوّل إطار', async () => {
  reset();
  omniReply = err(429, DEPLETED);
  const r = await create({ token: ownerTok, trend: 'pixarstory', params: { text: 'يا هلا', name: 'سعيد', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(falImages().length, 0, 'بيكسار بلا إطار');
  const s = submits()[0];
  assert.equal(s.url, 'https://queue.fal.run/google/gemini-omni-flash/reference-to-video');
  assert.deepEqual(s.body.image_urls, ['data:image/jpeg;base64,USERPHOTO']);
  assert.ok(!('image_url' in s.body));
  const omniText = omniCalls()[0].body.input.find((x) => x.type === 'text').text;
  assert.equal('[# References <IMAGE_REF_0>@Image1] ' + s.body.prompt, omniText, 'نصّ Omni نفسه بلا سطر التصريح');
  assert.ok(s.body.prompt.endsWith(veo.TREND_REF_GUIDE));
});

test('٤. الزحام العاديّ لا يحوّل: 429 «Resource has been exhausted» ← video_busy كما كان، بلا نداء fal، والنقاط رُدّت والقفل فُكّ', async () => {
  reset(); account('u2', 1000);
  omniReply = err(429, BUSY);
  const r = await create({ token: token('u2'), promptText: 'صقر' });
  assert.equal(r.code, 429, JSON.stringify(r.body));
  assert.equal(r.body.error, 'video_busy');
  noProvider(r.body, 'busy');
  assert.equal(submits().length, 0, 'لا صرف عند fal على زحام');
  assert.equal(pts('u2'), 1000); assert.ok(!locks.has('u2'));
  assert.ok(!kv.get(fb.OUT_KEY), 'لا علم');
  /* والإطار كذلك: callImage الحقيقيّ يرجع خطأه القديم بلا fal */
  imageReply = err(429, BUSY);
  const out = await TP.callImage('K', [{ text: 'x' }], '9:16');
  assert.equal(out.upstream, 429); assert.equal(out.retryable, true); assert.ok(!out.b64);
  assert.equal(falImages().length, 0);
});

test('٥. fal موقوف (403 «User is locked»): المسار القديم حرفيًّا — 503 unavailable، النقاط رُدّت، القفل فُكّ، لا سجلّ ولا تذكرة، والحجز رُدّ', async () => {
  reset(); account('u3', 1000);
  omniReply = err(429, DEPLETED); falSubmit = 'locked';
  const tickets = () => [...kv.keys()].filter((k) => /^vidjob:[0-9a-f]{40}$/.test(k)).length;
  const t0 = tickets();
  const o0 = falOps().length;
  const r = await create({ token: token('u3'), promptText: 'صقر' });
  assert.equal(r.code, 503, JSON.stringify(r.body));
  assert.deepEqual(r.body, { error: 'unavailable', retryable: false });
  assert.equal(submits().length, 1, 'حاول مرّة واحدة');
  assert.equal(pts('u3'), 1000, 'رُدّت'); assert.ok(!locks.has('u3'), 'فُكّ');
  assert.equal(falOps().length, o0, 'لا سجلّ طابور');
  assert.equal(tickets(), t0, 'لا تذكرة جديدة');
  assert.equal(spent(), 0, 'الحجز اليوميّ رُدّ');
  assert.ok(kv.get('db/alerts/media-fal-out'), 'إشعار «الاحتياط رفض» للمالك');

  /* إطار المجموعة: fal موقوف = خطأ الإطار القديم ← unavailable والنقاط رُدّت */
  reset(); account('u3b', 1000);
  falImage = 'locked';
  const g = await create({ token: token('u3b'), trend: 'heritagesing', params: { text: 'يا هلا', people: 2, sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'P1', imageMime: 'image/png', imagesBase64: ['P1', 'P2'], imagesMime: ['image/png', 'image/png'] });
  assert.equal(g.code, 503, JSON.stringify(g.body));
  assert.equal(g.body.error, 'unavailable');
  assert.equal(falImages().length, 1);
  assert.equal(submits().length, 0, 'لا فيديو بلا إطار');
  assert.equal(pts('u3b'), 1000); assert.ok(!locks.has('u3b'));

  /* callImage الحقيقيّ: الخطأ القديم نفسه (upstream وtech) */
  reset(); falImage = 'locked';
  const out = await TP.callImage('K', [{ text: 'x' }], '9:16');
  assert.equal(out.upstream, 402); assert.equal(out.tech, DEPLETED.slice(0, 200)); assert.ok(!out.b64);
});

test('٦. الاستطلاع: رفض الرقابة safety، عطب رصيد الاحتياط unavailable، والفشل يردّ؛ السجلّ المفقود يُبنى من الرقم؛ والعثرة العابرة RUNNING', async () => {
  reset(); account('u4', 2000);
  omniReply = err(429, DEPLETED);
  const start = async () => { locks.clear(); const r = await create({ token: token('u4'), promptText: 'صقر' }); assert.equal(r.code, 200, JSON.stringify(r.body)); return r.body.op; };

  const a = await start();
  Object.assign(falJobs.get(idOf(a)), { status: 'COMPLETED', error: 'The content could not be processed because it contained material flagged by a content checker.' });
  const pa = await poll(a);
  assert.equal(pa.body.status, 'FAILED'); assert.equal(pa.body.failureCode, 'safety');
  noProvider(pa.body, 'safety');
  assert.equal(pts('u4'), 2000, 'رُدّت'); assert.ok(!locks.has('u4'));

  const b = await start();
  Object.assign(falJobs.get(idOf(b)), { code: 403, text: LOCKED });
  const pb = await poll(b);
  assert.equal(pb.code, 503); assert.deepEqual(pb.body, { error: 'unavailable', retryable: false });
  assert.equal(pts('u4'), 2000, 'رُدّت');

  const c = await start();
  falJobs.get(idOf(c)).code = 503;
  const pc = await poll(c);
  assert.deepEqual(pc.body, { status: 'RUNNING' }, 'عابر: يعيد العميل');
  assert.ok(kv.has(job.ticketKey(c)), 'لم تُسوَّ');
  falJobs.get(idOf(c)).code = 200; falJobs.get(idOf(c)).status = 'COMPLETED';
  kv.delete(veo.falOpKey(c)); // السجلّ مفقود
  calls = [];
  const pc2 = await poll(c);
  assert.equal(pc2.body.status, 'SUCCEEDED');
  assert.equal(calls[0].url, QUEUE + idOf(c) + '/status', 'الرابط من الرقم');
  assert.equal(pts('u4'), 2000 - COST, 'سُلّم: لا ردّ');

  const bad = await poll('fal/../x');
  assert.equal(bad.code, 400);
});

test('٧. المسار القديم (TREND_ENGINE=veo): 429 الرصيد ← fal بصورته أوّل إطار؛ والطلب التالي خلال ٥ دقائق مباشرة بلا نداء Gemini', async () => {
  reset();
  process.env.TREND_ENGINE = 'veo';
  try {
    veoReply = err(429, DEPLETED);
    const body = { token: ownerTok, trend: 'productad', params: { text: 'عطر', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'PRODUCT', imageMime: 'image/jpeg' };
    const r = await create(body);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    const veoCall = calls.find((c) => /predictLongRunning/.test(c.url));
    const s = submits()[0];
    assert.equal(s.url, 'https://queue.fal.run/google/gemini-omni-flash/image-to-video');
    assert.equal(s.body.image_url, 'data:image/jpeg;base64,PRODUCT');
    assert.equal(s.body.prompt, veoCall.body.instances[0].prompt, 'أمر Veo نفسه');
    calls = [];
    const r2 = await create(body);
    assert.equal(r2.code, 200);
    assert.ok(!calls.some((c) => /predictLongRunning/.test(c.url)), 'بلا نداء فاشل قبله');
    assert.equal(submits().length, 1);
  } finally { delete process.env.TREND_ENGINE; veoReply = () => ({ status: 200, body: { name: 'operations/veo-1' } }); }
});

test('٨. callImage الحقيقيّ (بورتريه الممثّل): 402 ← fal نصّ←صورة 1K بحرارته ونسبته، بالـfetch المحقون، والناتج { b64, mime } بلا اسم محرّك', async () => {
  reset();
  const seen = [];
  const inj = async (url, init) => { seen.push(String(url)); return global.fetch(url, init); };
  const out = await TP.callImage('K', [{ text: 'A portrait of a man.' }], '9:16', inj, { temperature: 0.6, imageSize: '1K', timeoutMs: 90000, tag: 'actor' });
  assert.deepEqual(out, { b64: FAL_PNG, mime: 'image/png' });
  assert.ok(seen.some((u) => u === 'https://fal.run/fal-ai/nano-banana-pro'), 'المحقون نفسه');
  const f = falImages()[0];
  assert.equal(f.body.resolution, '1K'); assert.equal(f.body.temperature, 0.6); assert.equal(f.body.aspect_ratio, '9:16');
  assert.equal(f.body.prompt, 'A portrait of a man.');
  /* العلم قائم: النداء التالي إلى fal مباشرة */
  calls = []; seen.length = 0;
  const out2 = await TP.callImage('K', [{ text: 'Another portrait.' }], '16:9', inj, { imageSize: '1K', tag: 'actor' });
  assert.equal(out2.b64, FAL_PNG);
  assert.ok(!seen.some((u) => /googleapis/.test(u)), 'بلا نداء Gemini');
});

test('١٠. محاولة fal واحدة لكلّ نداء: العلم قائم وfal موقوف ← الإطار والفيديو يجرّبانه مرّة، ولا إنقاذ ثانٍ بعد Gemini الفاشل، والنقاط رُدّت', async () => {
  reset(); account('u6', 1000);
  await fb.markGeminiOut(); falImage = 'locked'; falSubmit = 'locked'; omniReply = err(429, DEPLETED);
  /* callImage الحقيقيّ: fal (رُفض) ← Gemini (402) ← الخطأ القديم، بلا نداء fal ثانٍ يدفع مرّتين أو يتجاوز المهلة */
  const out = await TP.callImage('K', [{ text: 'x' }], '9:16', null, { timeoutMs: 30000, tag: 'solo' });
  assert.equal(out.upstream, 402); assert.ok(!out.b64);
  assert.equal(falImages().length, 1, 'fal مرّة واحدة');
  assert.equal(calls.filter((c) => /-image:generateContent/.test(c.url)).length, 1, 'Gemini مرّة واحدة');
  /* الفيديو: الإطار (fal ثمّ Gemini) ثمّ الطابور مرّة ثمّ Omni مرّة ← 503 والنقاط رُدّت */
  calls = [];
  const photo = Buffer.from('photo-once-' + Date.now()).toString('base64');
  const r = await create({ token: token('u6'), trend: 'heritagesing', params: { text: 'يا هلا', sceneIndex: 0 }, ratio: '720:1280', imageBase64: photo, imageMime: 'image/jpeg' });
  assert.equal(r.code, 503, JSON.stringify(r.body));
  assert.deepEqual(r.body, { error: 'unavailable', retryable: false });
  assert.equal(falImages().length, 1, 'إطار fal مرّة واحدة');
  assert.equal(submits().length, 1, 'طابور fal مرّة واحدة');
  assert.equal(omniCalls().length, 1, 'Omni مرّة واحدة');
  assert.equal(pts('u6'), 1000); assert.ok(!locks.has('u6'));
});

test('٩. بلا FAL_KEY: كما كان حرفيًّا — 503 unavailable بلا نداء fal، والإطار خطؤه القديم', async () => {
  reset(); account('u5', 1000);
  const k = process.env.FAL_KEY; delete process.env.FAL_KEY;
  try {
    omniReply = err(429, DEPLETED);
    const r = await create({ token: token('u5'), promptText: 'صقر' });
    assert.equal(r.code, 503); assert.equal(r.body.error, 'unavailable');
    assert.equal(pts('u5'), 1000);
    const out = await TP.callImage('K', [{ text: 'x' }], '9:16');
    assert.equal(out.upstream, 402);
    assert.equal(submits().length + falImages().length, 0);
    assert.ok(!kv.get(fb.OUT_KEY), 'لا علم بلا احتياط');
  } finally { process.env.FAL_KEY = k; }
});
