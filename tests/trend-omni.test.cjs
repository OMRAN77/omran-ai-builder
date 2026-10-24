'use strict';
/* v-trend-omni — المالك ٢٤ أكتوبر: «ننقل الترندات لمحرّك Gemini Omni Flash»، «السعر يبقى ١٧٥». أوقفت جوجل Veo 3.1 Preview في ٢٢ أكتوبر
   (فحص الموديلات #1225)، فكانت الترندات الـ٥٥ كلّها «الخدمة متوقّفة». الترند يمرّ في veo-create كما كان والمحرّك وحده Omni.
   ١) التكافؤ: الأمر والصور اللذان كانا يصلان Veo يصلان Omni حرفيًّا، بأدوار الصور (مرجع · إطار أوّل · إطار + لقطة وجه)، وبلا صورة كما هو.
   ٢) المال: ١٧٥ (veo_video) وصلاحيّة الباقة أوّلًا، تذكرة تُسوّى عند التسليم، والفشل يردّ ويفكّ القفل.
   ٣) العقد: op «omni/…» يقرؤه veo-status من التخزين — العملاء كما هم. ٤) TREND_ENGINE=veo يعيد القديم، والسينمائيّ بلا ترند لم يُمسّ.
   المعالج الحقيقيّ (kv وسجلّات الحسابات مزيّفة، والإطار الأوّل مبدَّل بقيم ثابتة). */
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
TP.soloFirstFrame = async () => ({ b64: 'SOLOFRAME', mime: 'image/png', ref: { data: 'FACEREF', mime: 'image/jpeg' }, people: 1 });
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

test('١. التكافؤ: صورة بلا إطار (صورة المستخدم نفسها مرجعًا) — الأمر نفسه حرفيًّا مسبوقًا بدورها، والصورة نفسها', async () => {
  const { inst, omni } = await both({ trend: 'oldphoto', params: { sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  assert.equal(text(omni), '[# References <IMAGE_REF_0>@Image1] ' + inst.prompt);
  assert.deepEqual(images(omni), ['USERPHOTO']);
  assert.equal(inst.image.bytesBase64Encoded, 'USERPHOTO');
});

test('٢. التكافؤ: ترند الشخص الواحد بإطار أوّل — الإطار Image1 ولقطة الوجه Image2 بأدوار omni-create، والأمر نفسه بينهما', async () => {
  assert.ok(TP.SOLO_FRAME_TRENDS.has('heritagesing'));
  const { inst, omni } = await both({ trend: 'heritagesing', params: { text: 'يا هلا', sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'USERPHOTO', imageMime: 'image/jpeg' });
  assert.equal(inst.image.bytesBase64Encoded, 'SOLOFRAME', 'Veo: الإطار أوّلًا');
  assert.deepEqual(images(omni), ['SOLOFRAME', 'FACEREF']);
  assert.equal(text(omni), OMNI.FRAME_DECL + inst.prompt + OMNI.FRAME_GUIDE);
});

test('٣. التكافؤ: شخصان — إطار المجموعة Image1 «الإطار الأوّل»، ومهلته ١٢٠ث قبل Omni (Veo بلا تغيير)', async () => {
  const body = { trend: 'heritagesing', params: { text: 'يا هلا', people: 2, sceneIndex: 0 }, ratio: '720:1280', imageBase64: 'P1', imageMime: 'image/png', imagesBase64: ['P1', 'P2'], imagesMime: ['image/png', 'image/png'] };
  calls = []; process.env.TREND_ENGINE = 'veo'; groupOpts = 'unset';
  const a = await create(Object.assign({ token: ownerTok }, body));
  assert.equal(groupOpts, undefined, 'Veo: مهلة الإطار الافتراضيّة كما كانت');
  const inst = calls.find((c) => /predictLongRunning/.test(c.url)).body.instances[0];
  calls = []; delete process.env.TREND_ENGINE;
  const b = await create(Object.assign({ token: ownerTok }, body));
  assert.deepEqual(groupOpts, { timeoutMs: 120000 });
  const omni = calls.find((c) => /\/interactions$/.test(c.url));
  assert.equal(a.code, 200); assert.equal(b.code, 200);
  assert.deepEqual(images(omni), ['GROUPFRAME']);
  assert.equal(text(omni), '[# Sources <FIRST_FRAME>@Image1] ' + inst.prompt + ' Use Image1 as the starting frame.');
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
