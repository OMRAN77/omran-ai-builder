'use strict';
/* v-cinema-omni: «سينمائي» بلا ترند على Omni كالترندات — الطلب والأدوار والمدّة والمال. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = 'cinema-omni-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
delete process.env.TREND_ENGINE; delete process.env.CINEMA_ENGINE;
delete process.env.OMNI_VIDEO_MODEL;

const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const kv = new Map();
const users = new Map();
const locks = new Set();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => kv.has(k) ? String(kv.get(k)) : null,
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
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

/* الإطار الأوّل بقيم ثابتة — بناؤه نفسه مختبَر في video-first-frame وtrend-people-server */
const TP = require(rp('api/_lib/trend-people.js'));
let groupOpts = 'unset';
let soloCalls = [];
const realSolo = TP.soloFirstFrame;
const realGroup = TP.groupFirstFrame; // v-trend-frame-look ٢١ب
TP.soloFirstFrame = async (k, photo, scene, ratio, o) => { soloCalls.push({ scene, o }); return { b64: 'SOLOFRAME', mime: 'image/png', ref: { data: 'FACEREF', mime: 'image/jpeg' }, people: 1 }; };
TP.groupFirstFrame = async (k, photos, scene, ratio, o) => { groupOpts = o; return { b64: 'GROUPFRAME', mime: 'image/png' }; };

const veo = require(rp('api/_lib/veo-create.js'));
const status = require(rp('api/_lib/veo-status.js'));
const OMNI = require(rp('api/_lib/omni-create.js'));
const job = require(rp('api/_lib/video-job.js'));
const COST = require(rp('api/_lib/points.js')).COSTS.veo_video;
const NOW = Date.now();
const DAY = 86400000;
const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: NOW + DAY })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
function account(u, plan, pts) { users.set(u, { username: u, plan, planUpdatedAt: NOW - DAY, points: pts }); kv.set('points:' + u, String(pts)); }
const pts = (u) => Number(kv.get('points:' + u));

/* المزوّد: Omni يردّ بما في omniReply، وVeo باسم مهمّة؛ كلّ نداء يُسجَّل */
let calls = [];
let omniReply = () => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media' }] }] } });
global.fetch = async (url, init) => {
  const u = String(url);
  const body = init && init.body ? JSON.parse(init.body) : null;
  calls.push({ url: u, body, key: init && init.headers && init.headers['x-goog-api-key'], signal: !!(init && init.signal) });
  if (/\/interactions$/.test(u)) { const r = omniReply(); if (r.throw) throw r.throw; return new Response(JSON.stringify(r.body), { status: r.status }); }
  if (/predictLongRunning/.test(u)) return new Response(JSON.stringify({ name: 'operations/veo-1' }), { status: 200 });
  return new Response('{}', { status: 404 });
};
function res() { return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, end() { return this; }, json(v) { this.body = v; return this; } }; }
async function create(body) { const r = res(); await veo({ method: 'POST', query: { action: 'veo-create' }, body: Object.assign({ quality: 'fast', durationSeconds: 8, confirmed: true }, body) }, r); return r; }
async function poll(op) { const r = res(); await status({ method: 'GET', query: { op } }, r); return r; }
const ownerTok = token('omran');
async function both(body) {
  calls = []; process.env.TREND_ENGINE = 'veo'; const a = await create(Object.assign({ token: ownerTok }, body)); const veoCall = calls.find((c) => /predictLongRunning/.test(c.url));
  calls = []; delete process.env.TREND_ENGINE; const b = await create(Object.assign({ token: ownerTok }, body)); const omniCall = calls.find((c) => /\/interactions$/.test(c.url));
  assert.equal(a.code, 200, JSON.stringify(a.body)); assert.equal(b.code, 200, JSON.stringify(b.body));
  assert.ok(veoCall && omniCall, 'نداء كلّ محرّك');
  return { inst: veoCall.body.instances[0], omni: omniCall, op: b.body.op };
}
const text = (c) => c.body.input.filter((x) => x.type === 'text').map((x) => x.text).join('');
const images = (c) => c.body.input.filter((x) => x.type === 'image').map((x) => x.data);
const NO_CUTS = veo.TREND_NO_CUTS;
const VT = require(rp('api/_lib/video-trends.js'));
const omniCall = () => calls.find((c) => /\/interactions$/.test(c.url));
const veoCalled = () => calls.some((c) => /predictLongRunning/.test(c.url));
const DESC = 'مذيع إماراتي بكندورة بيضاء يقدّم نشرة الأخبار في استوديو حديث';
async function cine(body) { calls = []; soloCalls = []; const r = await create(Object.assign({ token: ownerTok, durationSeconds: undefined }, body)); return r; }

test('١. صورة شخص: إطار 2K بوجه كبير ثمّ Omni بالإطار Image1 ولقطة الوجه Image2، والقفل بوسم <IMAGE_REF_0> وقفل الإطار ولقطة واحدة', async () => {
  process.env.VIDEO_FREE_FRAME = 'on'; /* v-photo-as-is: مسار الإطار المرسوم خلف مفتاحه */
  try {
  const r = await cine({ promptText: DESC, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.match(String(r.body.op), /^omni\/[0-9a-f-]{36}$/);
  assert.ok(!veoCalled(), 'لا نداء للنموذج الموقوف');
  assert.equal(soloCalls.length, 1); assert.equal(soloCalls[0].scene, DESC);
  assert.equal(soloCalls[0].o.detail, true); assert.equal(soloCalls[0].o.hiRes, true);
  const o = omniCall();
  assert.deepEqual(images(o), ['SOLOFRAME', 'FACEREF']);
  assert.equal(text(o), OMNI.FRAME_DECL + VT.withIdentityLock(DESC, veo.VEO_FREE_IMAGE_MAX, 'the reference image <IMAGE_REF_0>') + TP.FRAME_LOCK + NO_CUTS + OMNI.FRAME_GUIDE);
  assert.deepEqual(o.body.response_format, { type: 'video', resolution: '720p', aspect_ratio: '9:16', delivery: 'uri', duration: '8s' });
  } finally { delete process.env.VIDEO_FREE_FRAME; }
});

test('٢. المدّة: ٣–١٠ كما اختارها، وغيرها (أو بلاها) ٨ كافتراضيّ Veo؛ والجودة العالية 1080p', async () => {
  for (const [d, want] of [[5, '5s'], [10, '10s'], [4, '4s'], [6, '6s'], [8, '8s'], [3, '3s'], [20, '8s'], ['long20', '8s'], [undefined, '8s']]) {
    await cine({ promptText: 'صقر فوق الكثبان', ratio: '1280:720', durationSeconds: d });
    assert.equal(omniCall().body.response_format.duration, want, String(d));
  }
  await cine({ promptText: 'صقر', quality: 'high' });
  assert.equal(omniCall().body.response_format.resolution, '1080p');
});

test('٣. الشخصيّة الكرتونيّة الجاهزة (keepPhoto): بلا إطار، وصورتها «الإطار الأوّل» كما عند Veo، والمدّة ٦', async () => {
  const r = await cine({ promptText: 'A cute chibi 3D cartoon character talking.', ratio: '720:1280', durationSeconds: 6, imageBase64: 'CARTOON', imageMime: 'image/png', keepPhoto: true });
  assert.equal(r.code, 200);
  assert.equal(soloCalls.length, 0);
  const o = omniCall();
  assert.deepEqual(images(o), ['CARTOON']);
  /* v-photo-as-is: الكرتون يبقى كرتونًا — قفل محايد لا «الشخص الحقيقيّ» */
  assert.ok(text(o).startsWith('[# Sources <FIRST_FRAME>@Image1] MAIN SUBJECT: whoever or whatever is in the attached image'), text(o).slice(0, 120));
  assert.doesNotMatch(text(o), /real person/);
  assert.ok(text(o).endsWith(NO_CUTS + ' Use Image1 as the starting frame.'));
  assert.equal(o.body.response_format.duration, '6s');
});

test('٤. تعذّر الإطار: صورته نفسها «الإطار الأوّل» (كـVeo instance.image) بقفله القديم — لا فشل بسبب الإطار', async () => {
  process.env.VIDEO_FREE_FRAME = 'on'; /* v-photo-as-is: مسار الإطار المرسوم خلف مفتاحه */
  try {
  const real = TP.soloFirstFrame; TP.soloFirstFrame = async () => ({ error: 'timeout' });
  try { await cine({ promptText: DESC, imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' }); } finally { TP.soloFirstFrame = real; }
  const o = omniCall();
  assert.deepEqual(images(o), ['USERPHOTO']);
  assert.equal(text(o), '[# Sources <FIRST_FRAME>@Image1] ' + VT.withIdentityLock(DESC, veo.VEO_FREE_IMAGE_MAX) + NO_CUTS + ' Use Image1 as the starting frame.');
  } finally { delete process.env.VIDEO_FREE_FRAME; }
});

test('٥. بلا صورة: الوصف وحده (والأنمي بسطر أسلوبه)، بلا قفل ولا «بلا قطع»، وحدّ ١٥٠٠ كما كان', async () => {
  await cine({ promptText: 'قطّة تلعب', style: 'anime' });
  assert.deepEqual(omniCall().body.input, [{ type: 'text', text: TP.STYLE_ANIME_VIDEO + 'قطّة تلعب' }]);
  await cine({ promptText: 'س'.repeat(3000) });
  assert.equal(text(omniCall()).length, veo.VEO_FREE_MAX);
});

test('٦. الممثّل (احتياط) مع صورة: كلامه و«بلا ترجمة» سالمان داخل القفل؛ وشخصان في الصورة = القفل والإرشاد بالجمع', async () => {
  process.env.VIDEO_FREE_FRAME = 'on'; /* v-photo-as-is: مسار الإطار المرسوم خلف مفتاحه */
  try {
  const speech = 'مرحبا '.repeat(50).trim();
  const p = 'رجل إماراتي بكندورة بيضاء يقف في مجلس تراثي '.repeat(16) + '. saying exactly these Arabic words: "' + speech + '". No subtitles, no captions, no text on screen.';
  await cine({ promptText: p, imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  const t = text(omniCall());
  assert.ok(t.includes('"' + speech + '"') && t.includes('No subtitles, no captions, no text on screen.'));
  const real = TP.soloFirstFrame; TP.soloFirstFrame = async () => ({ b64: 'SOLOFRAME', mime: 'image/png', ref: null, people: 2 });
  try { await cine({ promptText: DESC, imageBase64: 'COUPLE', imageMime: 'image/jpeg' }); } finally { TP.soloFirstFrame = real; }
  const o = omniCall();
  assert.deepEqual(images(o), ['SOLOFRAME', 'COUPLE'], 'بلا لقطة وجه: الصورة نفسها مرجعًا');
  assert.match(text(o), /MAIN CHARACTERS: the 2 real people in the reference image <IMAGE_REF_0>/);
  assert.ok(text(o).endsWith(veo.TREND_FRAME_GUIDE_MANY));
  } finally { delete process.env.VIDEO_FREE_FRAME; }
});

test('٧. المال كما كان: ١٧٥ بتأكيد «فيديو سينمائي بالصوت» وتذكرة تُسوّى عند التسليم؛ والفشل يردّ ويفكّ القفل', async () => {
  account('cine1', 'max', 1000);
  const ask = await create({ token: token('cine1'), promptText: 'صقر', confirmed: false });
  assert.equal(ask.code, 428); assert.match(ask.body.message_ar, /فيديو سينمائي بالصوت/);
  const r = await create({ token: token('cine1'), promptText: 'صقر' });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(pts('cine1'), 1000 - COST);
  assert.ok(kv.has(job.ticketKey(r.body.op)));
  const s = await poll(r.body.op);
  assert.equal(s.body.status, 'SUCCEEDED'); assert.ok(!kv.has(job.ticketKey(r.body.op)));
  for (const [reply, code, err] of [
    [() => ({ status: 429, body: { error: { message: 'Your prepayment credits are depleted.' } } }), 503, 'unavailable'],
    [() => ({ status: 503, body: { error: { message: 'The model is overloaded.' } } }), 503, 'video_busy'],
    [() => ({ status: 200, body: { steps: [] } }), 502, 'video_rejected'],
    [() => ({ throw: new Error('socket hang up') }), 500, null],
  ]) {
    omniReply = reply; locks.clear(); const before = pts('cine1');
    const f = await create({ token: token('cine1'), promptText: 'صقر' });
    assert.equal(f.code, code); if (err) assert.equal(f.body.error, err);
    assert.equal(pts('cine1'), before); assert.ok(!locks.has('cine1'));
  }
  omniReply = () => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media' }] }] } });
});

test('٨. CINEMA_ENGINE=veo يعيد المسار القديم بلا نشر', async () => {
  process.env.CINEMA_ENGINE = 'veo';
  try { const r = await cine({ promptText: 'صقر' }); assert.equal(r.body.op, 'operations/veo-1'); assert.ok(veoCalled() && !omniCall()); }
  finally { delete process.env.CINEMA_ENGINE; }
});
