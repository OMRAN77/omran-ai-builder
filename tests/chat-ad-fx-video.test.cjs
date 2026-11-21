'use strict';
/* v-chat-ad-fx (المالك ٢١ نوفمبر بعد صور التأثيرات: «الي اريده فيديو مش صور فقط… فيديو في الدردشه يعني مال ثواني… فيديوهات متنوعه مش
   نوع واحد»): فيديو المنتج في المحادثة بصورته = أسلوب لقطة من مجموعة (دخان، من فوق، دوّارة، تفكيك + شعاع ضوء، رذاذ، يطفو، تفاصيل قريبة).
   بالاسم إن ذكره، وفيديو الإعلان بلا اسم يتبدّل أسلوبه فلا يتكرّر، والفيديو العاديّ بلا اسم صريح كما كان.
   ١ الخادم: الأمر لكلّ أسلوب، وصورته أوّل إطار بلا إطار مرسوم، والمدّة كما طلب، وحدّ ١٠٠٠
   ٢ الخادم: بلا صورة رفض قبل أيّ خصم، والمفتاح المجهول والترند = المسار القديم
   ٣ العميل: الاسم يغلب، والتبدّل بلا تكرار، والفيديو العاديّ لا يتغيّر بكلمات عامّة
   ٤ الربط: generate_video يرسل fx على runway ويذكر الأسلوب */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const rp = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(rp(p), 'utf8');

const JPEG = Buffer.from('user-photo-bytes-'.repeat(20)).toString('base64');
const realPoints = require(rp('api/_lib/points.js'));

async function run(body, opts) {
  const o = opts || {};
  const envKeys = ['GEMINI_API_KEY', 'VIDEO_FIRST_FRAME', 'VIDEO_FREE_FRAME', 'RUNWAY_MODEL'];
  const savedEnv = {};
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { GEMINI_API_KEY: 'gk' }, o.env || {});
  const user = o.user || 'someone';
  const log = { quota: 0, spent: [], refunds: 0 };
  const stubs = {
    'api/_lib/_videoUsage.js': { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => { log.quota++; return { allowed: true, username: user }; }, consumeVideo: async () => 3 },
    'api/_lib/video-job.js': { rememberVideoJob: async () => true, settleVideoJob: async () => null },
    'api/_lib/runway-keys.js': { pickKey: () => ({ key: 'rk', index: 0 }), encodeTaskId: (i, id) => i + ':' + id, clearStuckTask: async () => {}, saveLastTask: async () => {}, RUNWAY_API_BASE: 'https://runway.test' },
    'api/_lib/points.js': {
      isOwnerUsername: (u) => u === 'omran', COSTS: realPoints.COSTS, requireConfirmation: () => null,
      spendPoints: async (u, cost, kind) => { log.spent.push({ u, cost, kind }); return { ok: true, owner: false, points: 900 }; },
      refundPoints: async () => { log.refunds++; },
    },
    'api/_lib/_videoSubs.js': { denyFree: async () => false, videoAllowed: async () => true, CODE: 'video_subscribers' },
    'api/_lib/abuse-guard.js': { videoLock: async () => ({ ok: true }), releaseVideoLock: async () => {} },
  };
  const saved = {};
  for (const [rel, exp] of Object.entries(stubs)) { const p = rp(rel); saved[p] = require.cache[p]; require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
  const hp = rp('api/_lib/video-create.js'); delete require.cache[hp];
  const handler = require(hp);
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    const b = init && init.body ? JSON.parse(init.body) : null;
    if (u.startsWith('https://runway.test/')) { calls.push({ kind: 'runway', url: u, body: b }); return Response.json({ id: 'task1' }); }
    calls.push({ kind: 'other', url: u });
    return Response.json({});
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', body }, res); }
  finally {
    global.fetch = realFetch;
    delete require.cache[hp];
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
    for (const k of envKeys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  }
  return { res, log, kinds: calls.map((c) => c.kind), runway: calls.filter((c) => c.kind === 'runway') };
}
const BODY = (extra) => Object.assign({ promptText: 'Luxury ad for a gold watch, slow camera move around it, studio light', duration: 10, ratio: '720:1280', token: 't', imageBase64: JPEG, imageMime: 'image/jpeg' }, extra || {});
const MOVE = { smoke: /SMOKE REVEAL: .*smoke swirls around the product and slowly drifts away to reveal it/, topdown: /TOP-DOWN SHOT: the camera looks straight down from directly above/, orbit: /ORBIT SHOT: the camera makes one smooth continuous orbit around the product/, lightsweep: /LIGHT SWEEP: .*beam of light sweeps slowly across the product/, splash: /SPLASH: in slow motion a burst of clear liquid splashes around the product/, float: /FLOAT: the product lifts off and floats in mid-air/, macro: /MACRO: extreme macro close-ups/ };

test('١ الخادم: كلّ أسلوب = صورته أوّل إطار، أمره وحده، كلامه بعده، المدّة كما طلب، وحدّ ١٠٠٠', async () => {
  for (const k of Object.keys(MOVE)) {
    const r = await run(BODY({ fx: k }), { env: { VIDEO_FREE_FRAME: 'on', VIDEO_FIRST_FRAME: 'on' } }); // الإطار المرسوم مفعّل — ويُتخطّى للأسلوب
    assert.equal(r.res.code, 200, k + ' ' + JSON.stringify(r.res.body));
    assert.deepEqual(r.kinds, ['runway'], k + ': نداء المحرّك وحده — لا إطار مرسوم قبله');
    const rw = r.runway[0];
    assert.match(rw.url, /image_to_video$/);
    assert.equal(rw.body.promptImage, 'data:image/jpeg;base64,' + JPEG, k + ': صورته كما هي أوّل إطار');
    assert.equal(rw.body.duration, 10, k + ': المدّة كما طلب');
    const p = rw.body.promptText;
    assert.ok(p.startsWith("The opening frame is the user's own photo of this product: start exactly from it"), k);
    assert.match(p, MOVE[k], k);
    for (const o of Object.keys(MOVE)) if (o !== k) assert.doesNotMatch(p, MOVE[o], k + ' ≠ ' + o);
    assert.match(p, /Request: Luxury ad for a gold watch/, k + ': كلام النموذج يصل');
    assert.ok(p.endsWith('the same product from the photo throughout, unchanged.'), k + ': الذيل الإلزاميّ');
    assert.doesNotMatch(p, /ultra-realistic|real person|IDENTITY/, k + ': لا مرساة الشخص');
    assert.ok(p.length <= 1000, k + ' ' + p.length);
    assert.equal(r.log.spent.length, 1, k + ': خصم واحد بسعر الفيديو نفسه');
    assert.equal(r.log.spent[0].cost, realPoints.COSTS.runway_video);
  }
  const long = await run(BODY({ fx: 'orbit', promptText: 'ساعة ذهبية فاخرة '.repeat(200) }));
  const lp = long.runway[0].body.promptText;
  assert.ok(lp.length <= 1000 && lp.endsWith('unchanged.'), 'الوصف الطويل يُقصّ وحده ' + lp.length);
  // التفكيك واحد منها وبقي كما كان: ٥ث وأمره الخاصّ
  const ex = await run(BODY({ fx: 'exploded' }));
  assert.equal(ex.runway[0].body.duration, 5);
  assert.match(ex.runway[0].body.promptText, /clean exploded view/);
});

test('٢ الخادم: بلا صورة رفض قبل أيّ خصم، والمفتاح المجهول والترند = المسار القديم', async () => {
  const no = await run(BODY({ fx: 'smoke', imageBase64: '' }));
  assert.equal(no.res.code, 400);
  assert.deepEqual(no.res.body, { error: 'video_rejected', reason: 'fx_needs_photo', retryable: false });
  assert.equal(no.log.spent.length + no.log.quota, 0, 'لا حجز ولا خصم');
  assert.deepEqual(no.kinds, []);
  const noEx = await run(BODY({ fx: 'exploded', imageBase64: '' }));
  assert.equal(noEx.res.body.reason, 'exploded_needs_photo', 'رمز التفكيك القديم كما هو');
  const VC = require(rp('api/_lib/video-create.js'));
  for (const bad of ['', 'x', '__proto__', 'constructor', 'toString', 42, null]) assert.equal(VC.videoFxKind({ fx: bad }), '', String(bad));
  assert.equal(VC.videoFxKind({ fx: 'orbit', trend: 'productad' }), '', 'الترند يبني أمره بنفسه');
  const plain = await run(BODY({ fx: 'bogus', keepPhoto: true }));
  assert.doesNotMatch(plain.runway[0].body.promptText, /SHOT \(mandatory\)|SMOKE REVEAL|ORBIT SHOT/, 'مجهول = الأمر القديم');
});

/* ── العميل: الدوالّ نفسها معزولة ── */
const A9 = read('js/app-09-attach.js');
function client(store) {
  const from = A9.indexOf('const AD_FX_WORDS='), to = A9.indexOf('\n', A9.indexOf('const AD_VID_FX_AR=')) + 1;
  assert.ok(from > 0 && to > from, 'المصدر');
  const ls = { get: store || {}, getItem(k) { return Object.prototype.hasOwnProperty.call(this.get, k) ? this.get[k] : null; }, setItem(k, v) { this.get[k] = String(v); } };
  const ctx = { localStorage: ls, Math, JSON, String, Array }; vm.createContext(ctx);
  vm.runInContext(A9.slice(from, to) + '\nthis.f = omranAdVideoFx; this.AR = AD_VID_FX_AR; this.POOL = AD_VID_FX_POOL;', ctx);
  return { f: ctx.f, AR: ctx.AR, POOL: ctx.POOL, ls };
}

test('٣ العميل: الاسم يغلب، وفيديو الإعلان بلا اسم يتبدّل بلا تكرار، والعاديّ لا يتغيّر بكلمات عامّة', () => {
  const { f, AR, POOL, ls } = client();
  const VC = require(rp('api/_lib/video-create.js'));
  for (const k of POOL) { assert.ok(k === 'exploded' || Object.prototype.hasOwnProperty.call(VC.FX_VIDEO, k), 'مفتاح الخادم ' + k); assert.ok(AR[k], 'اسم عربيّ ' + k); }
  assert.equal(POOL.length, 8);
  // بالاسم — إعلانًا كان أو فيديو عاديًّا
  for (const [t, k] of [['سوّ فيديو سموك ريفيل لهالساعة', 'smoke'], ['دعاية فيديو اوربت شوت', 'orbit'], ['فيديو دون شوت للقهوة', 'topdown'], ['فيديو اكسبلودد فيو', 'exploded'], ['top-down video of my perfume', 'topdown'], ['orbit shot video', 'orbit']]) {
    assert.equal(f(t, true), k, 'إعلان: ' + t); assert.equal(f(t, false), k, 'عاديّ: ' + t);
  }
  // أسماء التنويع: في الإعلان وحده
  for (const [t, k] of [['دعاية مع رذاذ', 'splash'], ['إعلان والمنتج يطفو', 'float'], ['إعلان ماكرو للتفاصيل', 'macro'], ['إعلان وشعاع ضوء', 'lightsweep']]) assert.equal(f(t, true), k, t);
  for (const t of ['فيديو لي وأنا طاير في الهوا', 'حرّك الصورة close-up', 'فيديو والكاميرا تدور حولي', 'فيديو لي من فوق البرج', 'حرّكها']) assert.equal(f(t, false), '', 'عاديّ بلا اسم صريح: ' + t);
  assert.equal(ls.getItem('omranAdVidFx'), null, 'الاسم والعاديّ لا يلمسان التبدّل');
  // التبدّل (كيس): كلّ ٨ متتالية من البداية = الثمانية كلّها، ولا أسلوب يعقب نفسه أبدًا — ٢٠٠ مرّة بعشوائيّة حقيقيّة
  for (let run = 0; run < 25; run++) {
    const s2 = client(), seen = [];
    for (let i = 0; i < 40; i++) seen.push(s2.f('سوّ دعاية فيديو لهذي الساعة', true));
    for (let i = 0; i < 40; i += 8) assert.equal(new Set(seen.slice(i, i + 8)).size, 8, 'دورة ناقصة: ' + seen.slice(i, i + 8));
    for (let i = 1; i < 40; i++) assert.notEqual(seen[i], seen[i - 1], 'تكرار متتالٍ عند ' + i);
  }
  // تخزين تالف أو محظور لا يكسر شيئًا
  const bad = client({ omranAdVidFx: '{not json' });
  assert.ok(POOL.includes(bad.f('دعاية', true)));
  const blocked = client(); blocked.ls.getItem = () => { throw new Error('blocked'); }; blocked.ls.setItem = () => { throw new Error('blocked'); };
  assert.ok(POOL.includes(blocked.f('دعاية', true)));
});

test('٤ الربط: generate_video بصورته يرسل fx على runway، ويذكر الأسلوب، والترند والفيديو بلا صورة كما كانا', () => {
  const A17 = read('js/app-17-agent-tools.js');
  assert.match(A17, /var adFx = \(ref && ref\.dataUrl && !trendMeta && typeof omranAdVideoFx === 'function'\) \? omranAdVideoFx\(UTXT, !!\(va\.ad_title \|\| va\.ad_text \|\| va\.ad_voice\)\) : '';\n\s*if \(adFx\) engine = 'runway';\n\s*var token =/);
  assert.match(A17, /if \(adFx\) payload\.fx = adFx; \/\/ v-chat-ad-fx\n\s*if \(trendMeta\) \{ payload\.trend = va\.trend;/);
  assert.ok(A17.indexOf("if (adFx) engine = 'runway';") < A17.indexOf("if (engine === 'veo') {\n            endpoint = '/api/video?action=veo-create';"), 'المحرّك قبل بناء الطلب');
  assert.match(A17, /ولا تقل إنّها جاهزة الآن\.' \+ fxNote;/);
  assert.match(A17, /سيظهر الآن داخل المحادثة مع زر التنزيل\.' \+ fxNote;/);
  assert.ok(A9.indexOf('function omranAdVideoFx(') < A9.indexOf('async function __sendPromptCore('), 'خارج __sendPromptCore');
});
