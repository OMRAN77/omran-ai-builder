'use strict';
/* v-trend-omni — المالك ٢٤ أكتوبر: «ننقل الترندات لمحرّك Gemini Omni Flash»، «السعر يبقى ١٧٥». أوقفت جوجل Veo 3.1 Preview في ٢٢ أكتوبر
   (فحص الموديلات #1225)، فكانت الترندات الـ٥٥ كلّها «الخدمة متوقّفة». الترند يمرّ في veo-create كما كان والمحرّك وحده Omni.
   ١) التكافؤ: الأمر والصور اللذان كانا يصلان Veo يصلان Omni حرفيًّا، بأدوار الصور (مرجع · إطار أوّل · إطار + لقطة وجه)، وبلا صورة كما هو.
   ٢) المال: ١٧٥ (veo_video) وصلاحيّة الباقة أوّلًا، تذكرة تُسوّى عند التسليم، والفشل يردّ ويفكّ القفل.
   ٣) العقد: op «omni/…» يقرؤه veo-status من التخزين — العملاء كما هم. ٤) TREND_ENGINE=veo يعيد القديم، والسينمائيّ بلا ترند لم يُمسّ.
   v-trend-omni-face — المالك بعد أوّل ترند: «يغيّر شكل الشخصيّة الملامح، والصورة اللي أحطها موجودة في أوّل الفيديو». على Omni وحده:
   ٩) ترند الشخص المنقول إلى مشهد أو عمر = إطار مبنيّ، ١٠) المتحوّل أثناء الفيديو = إطار لحظته الأولى بلا قفل، ١١) بيكسار ورمضان وتعذّر
   الإطار = الصورة مرجع لا لقطة أولى، ١٢) كلّ ترند بصورة مصنَّف، والباقي (منتج، مكان، حيوان، «حرّك الصورة») صورته أوّل إطار؛ وكلّها
   «لقطة واحدة متّصلة بلا قطع». المعالج الحقيقيّ (kv وسجلّات الحسابات مزيّفة، والإطار الأوّل مبدَّل بقيم ثابتة). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
process.env.AUTH_SECRET = 'trend-omni-test-secret';
process.env.GEMINI_API_KEY = 'gm-test';
delete process.env.TREND_ENGINE;
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
const cutsOf = (t) => (t && TP.MULTI_SHOT_TRENDS.has(t) ? '' : NO_CUTS); // قالب مونتاج بنصّه يبقى بلقطاته
const FIRST = (p, t) => '[# Sources <FIRST_FRAME>@Image1] ' + p + cutsOf(t) + ' Use Image1 as the starting frame.';
const bind = veo.bindTrendRef; // v-trend-omni-refs: «the reference image» ← «the reference image <IMAGE_REF_0>» (حرفيًّا في ١٦)
const REF = (p, t) => '[# References <IMAGE_REF_0>@Image1] ' + bind(p) + cutsOf(t) + veo.TREND_REF_GUIDE;
const DECL = (p, t) => OMNI.FRAME_DECL + bind(p) + cutsOf(t) + OMNI.FRAME_GUIDE;
const GROUP = (p, n, t) => veo.groupRefDecl(n) + veo.bindGroupRefs(p, n) + cutsOf(t) + veo.groupRefGuide(n);
const { TRENDS } = require(rp('api/_lib/video-trends.js'));
const PHOTO_TRENDS = Object.keys(TRENDS).filter((id) => TRENDS[id].photo !== 'none');
/* ما يبقى صورته أوّل إطار: منتجات وأماكن وحيوانات و«حرّك الصورة كما هي» — مثبَّت حرفيًّا: ترند جديد بصورة يُصنَّف عمدًا (اختبار ١٢) */
const ANIMATE_PHOTO = ['oldphoto', 'productad', 'beforeafter', 'talkingpet', 'productfly', 'asmr', 'drone', 'orbit360', 'bullettime', 'materialize',
  'parallaxpop', 'realtour', 'carreveal', 'foodsizzle', 'buildprogress', 'offercountdown', 'newborn', 'familywave', 'paintingalive', 'miniature', 'weathershift'];

test('١. التكافؤ: ترند «حرّك الصورة» (منتج، مكان، حيوان، صورة قديمة) — صورة المستخدم نفسها «الإطار الأوّل» كما عند Veo، بلقطة واحدة بلا قطع', async () => {
  for (const trend of ANIMATE_PHOTO) {
    const { inst, omni } = await both({ trend, params: { text: 'يا هلا', name: 'سعيد', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
    assert.equal(inst.image.bytesBase64Encoded, 'USERPHOTO', trend + ': Veo يبدأ من الصورة');
    assert.deepEqual(images(omni), ['USERPHOTO'], trend);
    assert.equal(text(omni), FIRST(inst.prompt, trend), trend + ': دور «الإطار الأوّل»');
  }
});

test('٢. التكافؤ: ترند الشخص الواحد بإطار أوّل — الإطار Image1 ولقطة الوجه Image2 بأدوار omni-create، والأمر نفسه بينهما', async () => {
  assert.ok(TP.SOLO_FRAME_TRENDS.has('heritagesing'));
  const { inst, omni } = await both({ trend: 'heritagesing', params: { text: 'يا هلا', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  assert.equal(inst.image.bytesBase64Encoded, 'SOLOFRAME', 'Veo: الإطار أوّلًا');
  assert.deepEqual(images(omni), ['SOLOFRAME', 'FACEREF']);
  assert.equal(text(omni), DECL(inst.prompt));
  assert.ok(inst.prompt.endsWith(TP.FRAME_LOCK.trim()), 'قفل الإطار كما كان');
});

test('٣. التكافؤ: شخصان — إطار المجموعة Image1 «الإطار الأوّل»، ومهلته ١٢٠ث قبل Omni (Veo بلا تغيير)', async () => {
  const body = { trend: 'heritagesing', params: { text: 'يا هلا', people: 2, sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'P1', imageMime: 'image/png', imagesBase64: ['P1', 'P2'], imagesMime: ['image/png', 'image/png'] };
  calls = []; process.env.TREND_ENGINE = 'veo'; groupOpts = 'unset';
  const a = await create(Object.assign({ token: ownerTok }, body));
  assert.equal(groupOpts, undefined, 'Veo: مهلة الإطار الافتراضيّة كما كانت');
  const inst = calls.find((c) => /predictLongRunning/.test(c.url)).body.instances[0];
  calls = []; delete process.env.TREND_ENGINE;
  /* الميزانيّة: الوقت يُجمَّد ويقفز ٢٠٠ث أثناء بناء الإطار — مهلة Omni الباقي من حدّ الدالّة لا ٢٧٠ث كاملة */
  const realNow = Date.now, realTimeout = AbortSignal.timeout, realGroup = TP.groupFirstFrame;
  let clock = realNow(); const timeouts = [];
  Date.now = () => clock;
  AbortSignal.timeout = (ms) => { timeouts.push(ms); return realTimeout.call(AbortSignal, ms); };
  TP.groupFirstFrame = async (...a) => { clock += 200000; return realGroup(...a); };
  let b;
  try { b = await create(Object.assign({ token: ownerTok }, body)); } finally { Date.now = realNow; AbortSignal.timeout = realTimeout; TP.groupFirstFrame = realGroup; }
  const budget = OMNI.omniTimeoutFor(200000, 270000);
  assert.ok(budget < 270000, 'الميزانيّة أقصر من المهلة الافتراضيّة');
  assert.deepEqual(timeouts, [budget], 'نداء Omni بمهلة الباقي بعد الإطار');
  assert.deepEqual(groupOpts, { timeoutMs: 120000 });
  const omni = calls.find((c) => /\/interactions$/.test(c.url));
  assert.equal(a.code, 200); assert.equal(b.code, 200);
  /* v-trend-omni-refs: صورة كلّ شخص مرجعًا لوجهه مع إطار المجموعة (كان الإطار وحده) */
  assert.deepEqual(images(omni), ['GROUPFRAME', 'P1', 'P2']);
  assert.equal(text(omni), GROUP(inst.prompt, 2));
});

test('٤. التكافؤ: بلا صورة (اسكتش بيكسار) — الأمر وحده حرفيًّا؛ والطلب: النموذج والنسبة والدقّة والرابط والتخزين والمفتاح والمهلة', async () => {
  const { inst, omni, op } = await both({ trend: 'pixarsketch', params: { text: 'أبو سعيد يبيع القهوة', sceneIndex: 0 }, ratio: '1280:720' });
  assert.deepEqual(omni.body.input, [{ type: 'text', text: inst.prompt }]);
  assert.equal(omni.body.model, 'gemini-omni-1.1-flash');
  assert.deepEqual(omni.body.response_format, { type: 'video', resolution: '720p', aspect_ratio: '16:9', delivery: 'uri' });
  assert.equal(omni.body.store, true); assert.equal(omni.body.background, false);
  assert.equal(omni.key, 'gm-test'); assert.ok(omni.signal, 'مهلة داخل حدّ الدالّة');
  assert.match(String(op), /^omni\/[0-9a-f-]{36}$/);
  /* الطوليّ 9:16 */
  calls = [];
  await create({ token: ownerTok, trend: 'pixarsketch', params: { text: 'x', sceneIndex: 0 }, ratio: '720:1280' });
  assert.equal(calls.find((c) => /\/interactions$/.test(c.url)).body.response_format.aspect_ratio, '9:16');
});

test('٥. المال والتسليم: مشترك Plus — الأوّل من فيديو باقته والثاني ١٧٥ نقطة، تذكرة لكلّ منهما، وveo-status يسلّم من التخزين ويسوّي التذكرة بلا ردّ ولا نداء مزوّد', async () => {
  account('plus1', 'basic', 1000);
  const r1 = await create({ token: token('plus1'), trend: 'pixarsketch', params: { text: 'x', sceneIndex: 0 }, ratio: '720:1280' });
  assert.equal(r1.code, 200, JSON.stringify(r1.body));
  assert.equal(pts('plus1'), 1000, 'من صلاحيّة الباقة');
  assert.ok(kv.has(job.ticketKey(r1.body.op)), 'تذكرة');
  locks.delete('plus1');
  const r2 = await create({ token: token('plus1'), trend: 'pixarsketch', params: { text: 'y', sceneIndex: 1 }, ratio: '720:1280' });
  assert.equal(r2.code, 200, JSON.stringify(r2.body));
  assert.equal(pts('plus1'), 1000 - COST, '١٧٥ كما كان');
  calls = [];
  const s = await poll(r2.body.op);
  assert.equal(s.code, 200);
  assert.equal(s.body.status, 'SUCCEEDED');
  assert.match(s.body.output[0], /^\/api\/video\?action=veo-download&uri=https%3A%2F%2Fgenerativelanguage\.googleapis\.com%2Fv1beta%2Ffiles%2Fabc/);
  assert.equal(calls.length, 0, 'لا نداء مزوّد عند الاستطلاع');
  assert.ok(!kv.has(job.ticketKey(r2.body.op)), 'سُوّيت التذكرة نجاحًا');
  assert.equal(pts('plus1'), 1000 - COST, 'لا ردّ عند النجاح');
});

test('٦. الفشل يردّ ويفكّ القفل: نفاد رصيد المزوّد unavailable، زحام video_busy، بلا فيديو video_rejected، والمهلة ٥٠٠ يُعاد — بلا مهمّة محفوظة', async () => {
  const cases = [
    [() => ({ status: 429, body: { error: { message: 'Your prepayment credits are depleted.' } } }), 503, 'unavailable'],
    [() => ({ status: 503, body: { error: { message: 'The model is overloaded.' } } }), 503, 'video_busy'],
    [() => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'text', text: 'blocked' }] }] } }), 502, 'video_rejected'],
    [() => ({ throw: Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) }), 500, null],
  ];
  account('none1', 'max', 1000);
  kv.set('planvid:' + encodeURIComponent('none1') + ':' + Math.floor(NOW - DAY), '3'); // صلاحيّة Max مستهلكة: الخصم نقاط
  for (const [reply, code, err] of cases) {
    omniReply = reply; locks.clear();
    const before = pts('none1'), keys = [...kv.keys()].filter((k) => k.indexOf('omni:op:') === 0).length;
    const r = await create({ token: token('none1'), trend: 'pixarsketch', params: { text: 'x', sceneIndex: 0 }, ratio: '720:1280' });
    assert.equal(r.code, code, JSON.stringify(r.body));
    if (err) assert.equal(r.body.error, err);
    assert.equal(pts('none1'), before, 'رُدّت النقاط: ' + code);
    assert.ok(!locks.has('none1'), 'فُكّ القفل: ' + code);
    assert.equal([...kv.keys()].filter((k) => k.indexOf('omni:op:') === 0).length, keys, 'لا مهمّة محفوظة');
  }
  omniReply = () => ({ status: 200, body: { steps: [{ type: 'model_output', content: [{ type: 'video', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media' }] }] } });
});

test('٧. ناتج مفقود من التخزين: FAILED ويُردّ الخصم؛ وعطل قراءة التخزين RUNNING (الفيديو مدفوع وموجود — لا فشل)', async () => {
  account('lost1', 'free', 1000);
  users.get('lost1').plan = 'pro'; // مشترك Pro وصلاحيّته (٢) مستهلكة أدناه — فالخصم ١٧٥ نقطة
  kv.set('planvid:' + encodeURIComponent('lost1') + ':' + Math.floor(NOW - DAY), '2');
  const r = await create({ token: token('lost1'), trend: 'pixarsketch', params: { text: 'x', sceneIndex: 0 }, ratio: '720:1280' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(pts('lost1'), 1000 - COST);
  const key = require(rp('api/_lib/veo-create.js')).omniOpKey(r.body.op);
  const saved = kv.get(key);
  /* عطل القراءة */
  const kvMod = require.cache[rp('api/_lib/kv.js')].exports; const real = kvMod.kvGetRaw;
  kvMod.kvGetRaw = async (k) => { if (k === key) throw new Error('redis down'); return real(k); };
  assert.equal((await poll(r.body.op)).body.status, 'RUNNING');
  kvMod.kvGetRaw = real;
  /* المفقود */
  kv.delete(key);
  const s = await poll(r.body.op);
  assert.equal(s.body.status, 'FAILED');
  assert.equal(pts('lost1'), 1000, 'رُدّت');
  kv.set(key, saved);
});

test('٨. TREND_ENGINE=veo يعيد المسار القديم، والسينمائيّ بلا ترند لم يُمسّ (Veo) — قراره منفصل', async () => {
  process.env.TREND_ENGINE = 'veo';
  calls = [];
  const a = await create({ token: ownerTok, trend: 'pixarsketch', params: { text: 'x', sceneIndex: 0 }, ratio: '720:1280' });
  assert.equal(a.body.op, 'operations/veo-1');
  assert.ok(calls.some((c) => /predictLongRunning/.test(c.url)) && !calls.some((c) => /\/interactions$/.test(c.url)));
  delete process.env.TREND_ENGINE;
  calls = [];
  const b = await create({ token: ownerTok, promptText: 'صقر فوق الكثبان', ratio: '1280:720' });
  assert.equal(b.body.op, 'operations/veo-1');
  assert.ok(!calls.some((c) => /\/interactions$/.test(c.url)), 'السينمائيّ على مساره');
});

/* ── v-trend-omni-face ── */
async function pair(body) {
  soloCalls = [];
  calls = []; process.env.TREND_ENGINE = 'veo'; const a = await create(Object.assign({ token: ownerTok }, body));
  const veoCall = calls.find((c) => /predictLongRunning/.test(c.url)); const veoSolo = soloCalls.length;
  calls = []; delete process.env.TREND_ENGINE; const b = await create(Object.assign({ token: ownerTok }, body));
  const omniCall = calls.find((c) => /\/interactions$/.test(c.url));
  assert.equal(a.code, 200, JSON.stringify(a.body)); assert.equal(b.code, 200, JSON.stringify(b.body));
  return { veoPrompt: veoCall.body.instances[0].prompt, veoImage: veoCall.body.instances[0].image.bytesBase64Encoded, veoSolo, omniSolo: soloCalls.slice(veoSolo), omni: omniCall };
}
const photoBody = (trend) => ({ trend, params: { text: 'يا هلا', name: 'سعيد', sceneIndex: 0 }, ratio: TRENDS[trend].ratio, imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });

test('٩. شخص يُنقل إلى مشهد أو أسلوب أو عمر (تحت الماء، جيبلي، نسخة طفل…): على Omni إطار مبنيّ بمشهد القالب وقفله — لا صورته الخام أوّلًا؛ Veo كما كان', async () => {
  for (const trend of TP.OMNI_FRAME_TRENDS) {
    const r = await pair(photoBody(trend));
    assert.equal(r.veoSolo, 0, trend + ': Veo بلا إطار كما كان'); assert.equal(r.veoImage, 'USERPHOTO', trend);
    assert.equal(r.omniSolo.length, 1, trend + ': إطار واحد');
    assert.equal(r.omniSolo[0].scene, TP.trendScene(r.veoPrompt), trend + ': مشهد القالب وحده');
    assert.equal(r.omniSolo[0].o.start, false, trend);
    const age = TP.AGE_SHIFT_TRENDS.has(trend);
    assert.equal(r.omniSolo[0].o.ageShift, age, trend);
    const p = r.veoPrompt + TP.FRAME_LOCK;
    if (age) { /* بعمر آخر: الإطار وحده — لقطة وجه البالغ تشدّ الطفل إلى عمره */
      assert.deepEqual(images(r.omni), ['SOLOFRAME'], trend);
      assert.equal(text(r.omni), FIRST(p), trend);
    } else {
      assert.deepEqual(images(r.omni), ['SOLOFRAME', 'FACEREF'], trend);
      assert.equal(text(r.omni), DECL(p), trend);
    }
    assert.ok(!images(r.omni).includes('USERPHOTO'), trend + ': الصورة الخام لا تصل أوّل إطار');
  }
});

test('١٠. المتحوّل أثناء الفيديو (بطل خارق، تبديل اللبس، رحلة العمر): إطار لحظته الأولى قبل التحوّل، بلا قفل الإطار (يمنع التحوّل)', async () => {
  for (const trend of TP.OMNI_MORPH_TRENDS) {
    const r = await pair(photoBody(trend));
    assert.equal(r.veoSolo, 0, trend + ': Veo كما كان');
    assert.equal(r.omniSolo.length, 1, trend);
    assert.equal(r.omniSolo[0].o.start, true, trend + ': اللحظة الأولى');
    assert.ok(!text(r.omni).includes(TP.FRAME_LOCK.trim()), trend + ': لا قفل');
    assert.equal(r.omniSolo[0].o.ageShift, TP.AGE_SHIFT_TRENDS.has(trend), trend);
    /* رحلة العمر أيضًا: الإطار طفل، ولقطة وجهه بعمره الحقيقيّ مرجع لما بعده (كانت لا تصل المحرّك أبدًا) */
    assert.deepEqual(images(r.omni), ['SOLOFRAME', 'FACEREF'], trend);
    assert.equal(text(r.omni), DECL(r.veoPrompt), trend);
  }
  assert.ok(TP.OMNI_MORPH_TRENDS.has('superhero'), 'الترند الذي جرّبه المالك');
  /* صورتان: إطار المجموعة بلحظته الأولى وبلا قفل على Omni؛ Veo كما كان (بالقفل) */
  const body = { trend: 'superhero', params: { people: 2, sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'P1', imageMime: 'image/png', imagesBase64: ['P1', 'P2'], imagesMime: ['image/png', 'image/png'] };
  calls = []; process.env.TREND_ENGINE = 'veo'; groupOpts = 'unset';
  const a = await create(Object.assign({ token: ownerTok }, body));
  assert.equal(groupOpts, undefined);
  const vp = calls.find((c) => /predictLongRunning/.test(c.url)).body.instances[0].prompt;
  assert.ok(vp.endsWith(TP.FRAME_LOCK.trim()), 'Veo: القفل كما كان');
  calls = []; delete process.env.TREND_ENGINE;
  const b = await create(Object.assign({ token: ownerTok }, body));
  assert.equal(a.code, 200); assert.equal(b.code, 200);
  assert.deepEqual(groupOpts, { timeoutMs: 120000, start: true });
  const om = calls.find((c) => /\/interactions$/.test(c.url));
  assert.deepEqual(images(om), ['GROUPFRAME', 'P1', 'P2']);
  assert.equal(text(om), GROUP(vp.slice(0, vp.length - TP.FRAME_LOCK.length), 2), 'Omni: بلا قفل، وصورتاهما مرجعان');
});

test('١١. الصورة مرجع لا لقطة أولى: بيكسار ورمضان، وتعذّر الإطار في كلّ ترند شخص، وإطفاء الإطار — لا تظهر الصورة الخام في أوّل الفيديو', async () => {
  for (const trend of TP.OMNI_REF_TRENDS) {
    const r = await pair(photoBody(trend));
    assert.equal(r.omniSolo.length, 0, trend + ': لا إطار');
    assert.deepEqual(images(r.omni), ['USERPHOTO'], trend);
    assert.equal(text(r.omni), REF(r.veoPrompt), trend);
  }
  const real = TP.soloFirstFrame;
  TP.soloFirstFrame = async (k, photo, scene, ratio, o) => { soloCalls.push({ scene, o }); return { error: 'frame down' }; };
  try {
    for (const trend of ['heritagesing', 'underwater', 'babyversion', 'superhero']) {
      const r = await pair(photoBody(trend));
      assert.equal(r.omniSolo.length, 1, trend + ': حاول');
      assert.deepEqual(images(r.omni), ['USERPHOTO'], trend);
      assert.equal(text(r.omni), REF(r.veoPrompt), trend + ': مرجع بلا قفل الإطار');
    }
  } finally { TP.soloFirstFrame = real; }
  process.env.VIDEO_FIRST_FRAME = 'off';
  try {
    const r = await pair(photoBody('underwater'));
    assert.equal(r.omniSolo.length, 0);
    assert.equal(text(r.omni), REF(r.veoPrompt), 'الإطفاء: مرجع');
  } finally { delete process.env.VIDEO_FIRST_FRAME; }
});

test('١٢. التصنيف: كلّ ترند بصورة في فئة واحدة، والقوائم موجودة ومنفصلة، ومهمّة الإطار للحظة الأولى وللعمر الآخر', () => {
  const sets = { SOLO: TP.SOLO_FRAME_TRENDS, FRAME: TP.OMNI_FRAME_TRENDS, MORPH: TP.OMNI_MORPH_TRENDS, REF: TP.OMNI_REF_TRENDS };
  const seen = new Map();
  for (const [name, set] of Object.entries(sets)) for (const id of set) {
    assert.ok(TRENDS[id] && TRENDS[id].photo !== 'none', name + ': ' + id + ' ترند بصورة');
    assert.ok(!seen.has(id), id + ' في ' + seen.get(id) + ' و' + name);
    seen.set(id, name);
    assert.equal(TP.omniPersonTrend(id), true, id);
  }
  for (const id of TP.AGE_SHIFT_TRENDS) assert.ok(TP.OMNI_FRAME_TRENDS.has(id) || TP.OMNI_MORPH_TRENDS.has(id), id);
  assert.deepEqual(PHOTO_TRENDS.filter((id) => !seen.has(id)).sort(), ANIMATE_PHOTO.slice().sort(), 'ترند جديد بصورة يُصنَّف عمدًا');
  for (const id of ANIMATE_PHOTO) assert.equal(TP.omniPersonTrend(id), false, id);
  const sc = (id) => TP.trendScene(require(rp('api/_lib/video-trends.js')).buildTrendPrompt(id, { hasImage: true, text: 'س', name: 'س' }).prompt);
  for (const id of TP.OMNI_FRAME_TRENDS) assert.match(sc(id), /person|adult|subject/i, id + ': شخص');
  for (const id of TP.OMNI_MORPH_TRENDS) assert.match(sc(id), /transforms|changes|aging/i, id + ': تحوّل داخل الفيديو');
  for (const id of TP.AGE_SHIFT_TRENDS) assert.match(sc(id), /toddler|younger|future self|aging/i, id + ': عمر آخر');
  /* مهمّة الإطار: الافتراضيّ كما كان، و«قبل التحوّل»، و«بعمره في القالب» بلا «نفس العمر/لا أصغر» */
  const base = TP.soloFrameTask('a scene', { closeup: true });
  assert.match(base, /Never a different, younger, slimmer/);
  assert.doesNotMatch(base, /BEFORE the change/);
  const st = TP.soloFrameTask('a scene', { closeup: true, start: true });
  assert.match(st, /very start of the video — BEFORE the change the description makes during the video begins\. The setting, pose and lighting follow the description; their clothing, hairstyle and look stay exactly as in Photo 1/);
  assert.doesNotMatch(st, /The setting, clothing, hairstyle/, 'لا أمرين متناقضين في اللبس');
  const age = TP.soloFrameTask('a scene', { closeup: true, ageShift: true });
  assert.doesNotMatch(age, /younger, slimmer|apparent age/);
  assert.match(age, /drawn at the age the description asks for/);
  assert.match(age, /close-up of their face/);
  const journey = TP.soloFrameTask('a scene', { ageShift: true, start: true });
  assert.match(journey, /very start of the video — its very first moment, before the change the description makes during the video begins\. The setting, clothing, hairstyle, pose and lighting follow the description/, 'رحلة العمر: لحظتها الأولى طفل — اللبس من الوصف');
  assert.doesNotMatch(journey, /stay exactly as in Photo 1/);
  const age2 = TP.soloFrameTask('a scene', { closeup: true, ageShift: true, people: 2 });
  assert.match(age2, /Photo 1 shows 2 different real people\. Every figure the description makes of each one/);
  assert.match(age2, /drawn at the age the description asks for\. Never swap faces/);
  assert.doesNotMatch(age2, /younger, slimmer|apparent age/, 'شخصان في صورة: العمر الآخر لا يُمنع');
  assert.match(TP.frameTask(2, 's', true), /BEFORE the change this scene describes happens: everyone still wears their own clothing/);
  assert.doesNotMatch(TP.frameTask(2, 's'), /BEFORE the change/);
  /* المونتاج بنصّه وحده بلا «بلا قطع» */
  const all = Object.keys(TRENDS);
  const multi = (id) => /montage|\bshots\b/i.test(String(TRENDS[id].prompt));
  assert.deepEqual(all.filter(multi).sort(), [...TP.MULTI_SHOT_TRENDS].sort());
});

test('١٣. soloFirstFrame الحقيقيّ يمرّر «اللحظة الأولى» و«العمر الآخر» إلى مهمّة الإطار، والذاكرة تفرّقهما (لا إطار بلا تحوّل لترند متحوّل)', async () => {
  const tasks = [];
  const o = {
    faceCrops: async () => [{ who: 'the person', data: 'CROP', mime: 'image/jpeg' }],
    callImage: async (k, parts) => { tasks.push(parts[parts.length - 1].text); return { b64: 'F' + tasks.length, mime: 'image/png' }; },
  };
  const photo = { data: 'P-' + Date.now(), mime: 'image/jpeg' };
  const plain = await realSolo('K', photo, 'a city skyline', '720:1280', o);
  const start = await realSolo('K', photo, 'a city skyline', '720:1280', Object.assign({ start: true }, o));
  const age = await realSolo('K', photo, 'a city skyline', '720:1280', Object.assign({ ageShift: true }, o));
  assert.deepEqual([plain.b64, start.b64, age.b64], ['F1', 'F2', 'F3'], 'ثلاثة إطارات لا نسخة مخزَّنة');
  assert.equal(start.ref.data, 'CROP', 'لقطة الوجه مرجعًا');
  assert.doesNotMatch(tasks[0], /BEFORE the change/);
  assert.match(tasks[1], /BEFORE the change the description makes during the video begins\. The setting, pose and lighting follow the description/);
  assert.match(tasks[2], /drawn at the age the description asks for/);
  assert.match(tasks[2], /close-up of their face/);
  const again = await realSolo('K', photo, 'a city skyline', '720:1280', Object.assign({ start: true }, o));
  assert.equal(again.cached, true, 'إعادة المحاولة نفسها من الذاكرة');
});

test('١٤. المونتاج بنصّه بلا «بلا قطع» (عشر دول، إعلان المنتج)، وصورة مرفقة بترند بلا خانة صورة (المحادثة) مرجع لا لقطة أولى', async () => {
  let r = await pair(photoBody('tencountries'));
  assert.equal(text(r.omni), DECL(r.veoPrompt, 'tencountries'), 'عشر دول: الإطار ولقطة الوجه، ولقطاته كما هي');
  r = await pair(photoBody('productad'));
  assert.equal(text(r.omni), '[# Sources <FIRST_FRAME>@Image1] ' + r.veoPrompt + ' Use Image1 as the starting frame.');
  for (const trend of ['pixarsketch', 'calligraphy']) {
    assert.equal(TRENDS[trend].photo, 'none');
    r = await pair({ trend, params: { text: 'أبو سعيد', sceneIndex: 0 }, ratio: TRENDS[trend].ratio, imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
    assert.equal(r.veoImage, 'USERPHOTO', trend + ': Veo كما كان');
    assert.deepEqual(images(r.omni), ['USERPHOTO'], trend);
    assert.equal(text(r.omni), REF(r.veoPrompt, trend), trend + ': مرجع');
  }
});

test('١٥. النصوص نفسها حرفيًّا (لا ثابت يُفرَّغ فيبقى الاختبار أخضر)، وقصّة المحادثة بعدّة لقطات في مقطع واحد بلا «بلا قطع»، وسطرا الحجاب والأسلوب في مهمّة العمر', async () => {
  assert.equal(veo.TREND_NO_CUTS, ' In a single continuous shot, no scene cuts.');
  assert.match(veo.TREND_REF_GUIDE, /^ Use the given image as a reference for video generation\b/);
  assert.match(veo.TREND_REF_GUIDE, /The image should not be used as a literal initial frame\.$/);
  const story = (scenes) => pair({ trend: 'pixarstory', params: { name: 'سعيد', oneClip: true, scenes, sceneIndex: 0 }, ratio: '1280:720', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  let r = await story(['يسبح في البحر', 'يبني قلعة رمل']);
  assert.match(r.veoPrompt, /consecutive shots within this single clip/);
  assert.equal(text(r.omni), '[# References <IMAGE_REF_0>@Image1] ' + bind(r.veoPrompt) + veo.TREND_REF_GUIDE, 'لقطاتها كما هي');
  r = await story(['يسبح في البحر']);
  assert.equal(text(r.omni), REF(r.veoPrompt), 'مشهد واحد: لقطة واحدة');
  const age = TP.soloFrameTask('a scene', { closeup: true, ageShift: true });
  assert.match(age, /Never remove a hijab or headscarf that Photo 1 shows\./);
  assert.match(age, /Photorealistic, like a real film still\./);
  assert.match(TP.soloFrameTask('a scene', { ageShift: true, art: true }), /Use the art style the description asks for/);
  assert.match(TP.soloFrameTask('a scene', { ageShift: true, styleText: 'ANIME-X' }), /ANIME-X Their face is clearly visible/);
});

test('١٦. مرجع الملامح مع كلّ إطار مبنيّ: السيلفي (لا لقطة وجه) صورته نفسها Image2، وثلاثة أشخاص صورهم الثلاث، وترند العمر الآخر بلا مرجع؛ والوسم مربوط في النصّ', async () => {
  /* البلاغ: «بعده يغيّر شكل الشخصيّة في الملامح» — وجه يملأ الصورة لا تُقصّ له لقطة (merge-identity)، فكان الإطار يصل Omni وحده */
  const real = TP.soloFirstFrame;
  TP.soloFirstFrame = async (k, photo, scene, ratio, o) => { soloCalls.push({ scene, o }); return { b64: 'SOLOFRAME', mime: 'image/png', ref: null, people: 0 }; };
  try {
    for (const trend of ['heritagesing', 'underwater', 'superhero', 'agejourney']) {
      const r = await pair(photoBody(trend));
      assert.deepEqual(images(r.omni), ['SOLOFRAME', 'USERPHOTO'], trend + ': صورته مرجعًا');
      assert.deepEqual(r.omni.body.input.filter((x) => x.type === 'image').map((x) => x.mime_type), ['image/png', 'image/jpeg'], trend + ': نوع كلّ صورة');
      const p = TP.OMNI_FRAME_TRENDS.has(trend) ? r.veoPrompt + TP.FRAME_LOCK : r.veoPrompt;
      assert.equal(text(r.omni), DECL(p, trend), trend);
    }
    const age = await pair(photoBody('babyversion'));
    assert.deepEqual(images(age.omni), ['SOLOFRAME'], 'نسخة طفل: مرجع البالغ يشدّ الطفل إلى عمره');
    assert.equal(text(age.omni), FIRST(age.veoPrompt + TP.FRAME_LOCK));
  } finally { TP.soloFirstFrame = real; }
  /* ثلاثة أشخاص */
  const body = { trend: 'heritagesing', params: { text: 'يا هلا', people: 3, sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'P1', imageMime: 'image/png', imagesBase64: ['P1', 'P2', 'P3'], imagesMime: ['image/png', 'image/jpeg', 'image/png'] };
  calls = []; delete process.env.TREND_ENGINE;
  const g = await create(Object.assign({ token: ownerTok }, body));
  assert.equal(g.code, 200);
  const om = calls.find((c) => /\/interactions$/.test(c.url));
  assert.deepEqual(images(om), ['GROUPFRAME', 'P1', 'P2', 'P3']);
  assert.match(text(om), /the reference photos <IMAGE_REF_0>, <IMAGE_REF_1> and <IMAGE_REF_2> show 3 different people/);
  assert.deepEqual(om.body.input.filter((x) => x.type === 'image').map((x) => x.mime_type), ['image/png', 'image/png', 'image/jpeg', 'image/png']);
  assert.ok(text(om).startsWith('[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2 <IMAGE_REF_1>@Image3 <IMAGE_REF_2>@Image4] '));
  assert.ok(text(om).endsWith(' Use Image1 as the starting frame. Use Image2, Image3 and Image4 as references for the video generation: each one shows one of the real people already in Image1 — use them only to keep each person\'s own face and identity, never as extra people; the clothing and setting come from Image1 and the description.'));
  /* نسخة طفل لشخصين: بلا مراجع البالغين */
  calls = [];
  await create(Object.assign({ token: ownerTok }, body, { trend: 'babyversion', imagesBase64: ['P1', 'P2'], imagesMime: ['image/png', 'image/png'], params: { people: 2, sceneIndex: 0 } }));
  assert.deepEqual(images(calls.find((c) => /\/interactions$/.test(c.url))), ['GROUPFRAME']);
  /* الوسم حرفيًّا */
  assert.equal(bind('the person from the reference image stands; same as in the reference image <IMAGE_REF_0>.'),
    'the person from the reference image <IMAGE_REF_0> stands; same as in the reference image <IMAGE_REF_0>.');
  const r = await pair(photoBody('heritagesing'));
  assert.ok((r.veoPrompt.match(/the reference image/g) || []).length >= 2, 'أمر Veo كما كان بلا وسم');
  assert.ok(!/the reference image(?! <IMAGE_REF_0>)/.test(text(r.omni)), 'Omni: كلّ «the reference image» مربوطة بمرجعها');
});

test('١٧. صورة واحدة فيها شخصان: مرجعها الصورة والإرشاد بالجمع؛ أمر المجموعة يسمّي صور المراجع لا «صورة فيها N»؛ ومنتج بعدّة صور بلا مراجع «أشخاص»', async () => {
  const real = TP.soloFirstFrame;
  TP.soloFirstFrame = async () => ({ b64: 'SOLOFRAME', mime: 'image/png', ref: null, people: 2 });
  try {
    const r = await pair(photoBody('heritagesing'));
    assert.deepEqual(images(r.omni), ['SOLOFRAME', 'USERPHOTO']);
    assert.ok(text(r.omni).startsWith('[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2] '), 'الأدوار حرفيًّا');
    assert.ok(!/the reference image(?! <IMAGE_REF_0>)/.test(text(r.omni)), 'الوسم مربوط');
    assert.ok(text(r.omni).endsWith(veo.TREND_FRAME_GUIDE_MANY), 'الإرشاد بالجمع');
    assert.match(veo.TREND_FRAME_GUIDE_MANY, /it shows the same real people as Image1 — use it only to keep each person's own face and identity/);
  } finally { TP.soloFirstFrame = real; }
  assert.equal(veo.bindGroupRefs('WHO: the reference image shows 2 real people. IMPORTANT — the reference image contains 2 different people, each from the reference image.', 2),
    'WHO: the reference photos <IMAGE_REF_0> and <IMAGE_REF_1> show 2 real people. IMPORTANT — the reference photos <IMAGE_REF_0> and <IMAGE_REF_1> show 2 different people, each from the reference photos <IMAGE_REF_0> and <IMAGE_REF_1>.');
  const body = { trend: 'heritagesing', params: { text: 'يا هلا', people: 2, sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'P1', imageMime: 'image/png', imagesBase64: ['P1', 'P2'], imagesMime: ['image/png', 'image/png'] };
  calls = []; delete process.env.TREND_ENGINE;
  await create(Object.assign({ token: ownerTok }, body));
  const t = text(calls.find((c) => /\/interactions$/.test(c.url)));
  assert.ok(!/the reference image\b/.test(t), 'لا «the reference image» في أمر المجموعة');
  assert.ok(t.startsWith('[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2 <IMAGE_REF_1>@Image3] '), 'الأدوار حرفيًّا');
  assert.ok(t.endsWith(' Use Image1 as the starting frame. Use Image2 and Image3 as references for the video generation: each one shows one of the real people already in Image1 — use them only to keep each person\'s own face and identity, never as extra people; the clothing and setting come from Image1 and the description.'));
  assert.match(t, /the reference photos <IMAGE_REF_0> and <IMAGE_REF_1> show 2 different people/);
  calls = [];
  await create(Object.assign({ token: ownerTok }, body, { trend: 'productad', params: { text: 'عطر', people: 2, sceneIndex: 0 }, ratio: '1280:720' }));
  const pc = calls.find((c) => /\/interactions$/.test(c.url));
  assert.deepEqual(images(pc), ['GROUPFRAME'], 'منتج: الإطار وحده كما كان');
  assert.ok(text(pc).startsWith('[# Sources <FIRST_FRAME>@Image1] '));
});
