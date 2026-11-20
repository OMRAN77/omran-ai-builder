'use strict';
/* v-chat-exploded (المالك ٢٠ نوفمبر: «الي اريده مش في الساعة فقط… كل الاشياء مثلا السيارات والطيارات والساعات وجسم الانسان والاكترونيات
   والخ… والي اريده يكون في المحادثة يعني الفيديو قصير مالل اكثر شي 10 ثواني يفكك المنتج الي مرفوعه صورته»):
   صورة مرفقة في المحادثة + طلب تفكيك = فيديو تفكيك قصير (≤ ١٠ث) يبدأ من صورته نفسها، بقطعه الحقيقيّة على محور واحد بفراغات متساوية.
   بلا شبكة ولا مفتاح: المحرّك ونداءات الصور كلّها بدائل تسجّل ما يصلها، ولا يُولَّد شيء حقيقيّ (الصرف باب مقفل). */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const A9 = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');

/* ── النيّة: الدالّة نفسها معزولة بثوابتها (كما في الحزمة) ── */
function loadAsk() {
  const from = A9.indexOf('const __EXPL_AR_CORE');
  const to = A9.indexOf('\n}\n', A9.indexOf('function omranExplodedAsk(')) + 3;
  assert.ok(from > 0 && to > from, 'omranExplodedAsk وثوابتها متجاورة');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(A9.slice(from, to) + '\nthis.f = omranExplodedAsk;', ctx);
  return ctx.f;
}
const ask = loadAsk();

const YES = [
  // خليجيّ وفصيح بالشدّة وبدونها
  'فككه', 'فكّكه', 'فككها', 'فكّكها', 'فككها لي', 'فككلي الجوال', 'فكها', 'فكّه', 'فك قطع الساعة', 'وفككه بعد',
  'خله يتفكك', 'وريني كيف يتفكك', 'سوّي فيديو يفكك المنتج', 'ابيها تتفكك قطع', 'تقدر تفككها؟', 'نبي نفكك السيارة',
  'تفكيك السيارة', 'تفكيك الطيارة قطعة قطعة', 'ابي تفكيكه', 'اكسبلودد فيو', 'إكسبلود', 'أكسبلوديد للساعة',
  'شرّحه', 'شرّح جسم الانسان', 'تشريح جسم الإنسان',
  'من شو يتركب؟ وريني فيديو', 'وش تتكون منه الطيارة سو فيديو', 'ايش يتكون؟ وريني',
  // صورة + «إعلان فيديو» = فيديو التفكيك نفسه في المحادثة
  'إعلان فيديو يفكك العطر',
  // إنجليزيّ
  'explode it', 'exploded view please', 'disassemble this watch', 'teardown', 'tear it down', 'take it apart',
  'take the car apart', 'break it down into parts', 'Disassembly video of my laptop',
];
const NO = [
  // نفي
  'لا تفككه', 'لا تفكّكها', 'بدون تفكيك', 'من غير تفكيك', 'بلا تفكيك', 'ما ابي تفكيك', 'ما ابيه يتفكك', 'لا تشرّحه',
  "don't take it apart", 'do not disassemble it', 'no exploded view', 'without disassembling it', 'never explode it',
  // معانٍ أخرى
  'فك الحجز', 'فكّني منه', 'فكني منه', 'فكها عني', 'فكرة حلوة', 'فكّر فيها', 'فكر معي', 'تفكير', 'فاكهة', 'فكة عشرة دراهم',
  'فك الشفرة', 'فككت الشفرة', 'هو مفكك', 'اشرحه', 'شرحه لي', 'اشرح الصورة', 'شرح جسم الانسان',
  // سؤال كيف/ليش = جواب بالكلام
  'كيف تتفكك الساعة؟', 'كيف افككها', 'ليش يتفكك؟', 'how do I take it apart?', 'why does it explode',
  // سؤال التركيب بلا طلب عرض = جواب بالكلام
  'وش يتكون؟', 'من شو يتركب هذا',
  // كود
  'فكك الكود', 'disassemble this code',
  // صورة إعلان بتأثير التفكيك (v-ad-fx-chat) تبقى كما كانت
  'إعلان صورة ساعة اكسبلودد', 'بوستر اعلان تفكيك القطع', 'ad poster exploded view',
  // كلام لا صلة له
  'حركها', 'explosion effect', 'break down this chart', 'سوّي فيديو لي وأنا أمشي', '',
];

test('١. النيّة مع صورة: صيغ التفكيك العربيّة (خليجيّ وفصيح) والإنجليزيّة تطلقه', () => {
  for (const t of YES) assert.equal(ask(t, true), true, t);
});

test('٢. النفي والمعاني الأخرى وسؤال «كيف» والكود وصورة الإعلان لا تطلقه', () => {
  for (const t of NO) assert.equal(ask(t, true), false, t);
});

test('٣. بلا صورة لا يتغيّر شيء: لا تطلقه أيّ عبارة', () => {
  for (const t of YES) assert.equal(ask(t, false), false, t);
});

/* ── الخادم: video-create بدائل كاملة لا تصل شبكة ── */
const JPEG = Buffer.from('user-photo-bytes-'.repeat(20)).toString('base64');
const FRAME = Buffer.from('drawn-frame-'.repeat(10)).toString('base64');
const realPoints = require(rp('api/_lib/points.js'));

async function run(body, opts) {
  const o = opts || {};
  const envKeys = ['GEMINI_API_KEY', 'VIDEO_FIRST_FRAME', 'VIDEO_FREE_FRAME', 'RUNWAY_MODEL'];
  const savedEnv = {};
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { GEMINI_API_KEY: 'gk' }, o.env || {});
  const user = o.user || 'omran';
  const owner = user === 'omran';
  const log = { quota: 0, spent: [], refunds: 0, locks: 0 };
  const stubs = {
    'api/_lib/_videoUsage.js': { checkOwnerBypass: async () => ({ allowed: true }), checkVideoQuota: async () => { log.quota++; return { allowed: true, username: user }; }, consumeVideo: async () => 3 },
    'api/_lib/video-job.js': { rememberVideoJob: async () => true, settleVideoJob: async () => null },
    'api/_lib/runway-keys.js': { pickKey: () => ({ key: 'rk', index: 0 }), encodeTaskId: (i, id) => i + ':' + id, clearStuckTask: async () => {}, saveLastTask: async () => {}, RUNWAY_API_BASE: 'https://runway.test' },
    'api/_lib/points.js': {
      isOwnerUsername: (u) => u === 'omran', COSTS: realPoints.COSTS, requireConfirmation: realPoints.requireConfirmation,
      spendPoints: async (u, cost, kind) => { log.spent.push({ u, cost, kind }); return { ok: true, owner: false, points: 900 }; },
      refundPoints: async () => { log.refunds++; },
    },
    'api/_lib/_videoSubs.js': { denyFree: async () => false, videoAllowed: async () => true, CODE: 'video_subscribers' },
    'api/_lib/abuse-guard.js': { videoLock: async () => { log.locks++; return { ok: true }; }, releaseVideoLock: async () => {} },
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
    if (u.includes('gemini-flash-latest')) { calls.push({ kind: 'detect' }); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: [{ box_2d: [100, 400, 300, 600] }] }) }] } }] }); }
    if (/image|imagen|nano|generateContent/i.test(u)) { calls.push({ kind: 'image', url: u }); return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: FRAME } }] } }] }); }
    calls.push({ kind: 'other', url: u });
    throw new Error('unexpected fetch: ' + u);
  };
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  try { await handler({ method: 'POST', body }, res); }
  finally {
    global.fetch = realFetch;
    delete require.cache[hp];
    for (const [p, v] of Object.entries(saved)) { if (v) require.cache[p] = v; else delete require.cache[p]; }
    for (const k of envKeys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  }
  return { res, log, kinds: calls.map((c) => c.kind), runway: calls.filter((c) => c.kind === 'runway').map((c) => c.body), owner };
}
// جسم الطلب كما يبنيه مسار المحادثة (__vp) لصورة مرفقة + «فكّك السيارة»
const CHAT = (extra) => Object.assign({ promptText: 'فكّك السيارة', duration: 5, ratio: '1280:720', token: 't', imageBase64: JPEG, imageMime: 'image/jpeg', keepPhoto: true, fx: 'exploded' }, extra || {});

test('٤. أمر التفكيك: صورته نفسها أوّل إطار، والأمر الإنجليزيّ الواحد، وتلميح الفئة، وكلامه، وحدّ ١٠٠٠ حرف', async () => {
  const r = await run(CHAT());
  assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
  assert.deepEqual(r.kinds, ['runway'], 'نداء واحد للمحرّك ولا شيء قبله');
  const rw = r.runway[0];
  assert.equal(rw.promptImage, 'data:image/jpeg;base64,' + JPEG, 'الصورة كما رفعها هي أوّل إطار');
  const p = rw.promptText;
  assert.ok(p.startsWith("The opening frame is the user's own photo of this object: start exactly from it"), p.slice(0, 90));
  for (const m of [/exploded view/, /real components separate and float outward in precise assembly order along one axis/, /evenly spaced with equal gaps/, /then hold still/, /one continuous steady shot/, /Photo held for the first half-second/, /no added text, labels, logos or watermarks/, /nothing invented/])
    assert.match(p, m);
  assert.match(p, /Vehicle parts: body panels, doors, hood, wheels and tyres, brakes, engine block, transmission, seats, chassis frame\./);
  assert.match(p, /Request: فكّك السيارة\./, 'كلامه نفسه يصل');
  assert.doesNotMatch(p, /ultra-realistic|real person|IDENTITY/, 'لا مرساة الشخص ولا لاحقة الواقعيّة');
  assert.ok(p.length <= 1000, 'حدّ المحرّك ' + p.length);
  // وصف طويل جدًّا: يُقصّ كلامه وحده ويبقى الذيل
  const long = await run(CHAT({ promptText: 'فككه '.repeat(400) }));
  const lp = long.runway[0].promptText;
  assert.ok(lp.length <= 1000, 'طويل ' + lp.length);
  assert.ok(lp.endsWith('never a different or generic object.'), 'الذيل الإلزاميّ باقٍ');
});

test('٥. تلميح الفئة من كلامه: سيّارة، طيّارة، ساعة، إلكترونيّات، جسم الإنسان (نموذج تعليميّ بلا دم)، وعامّ بلا تلميح', async () => {
  const VC = require(rp('api/_lib/video-create.js'));
  const K = {
    vehicle: ['فكك السيارة', 'فكك الموتر', 'take the car apart', 'فكك المحرك'],
    aircraft: ['فكك الطيارة', 'تفكيك الطائرة', 'explode the plane', 'فكك الدرون'],
    watch: ['فككها الساعة', 'disassemble this watch'],
    electronics: ['فككلي الجوال', 'تفكيك الايفون', 'teardown of my laptop', 'فكك السماعة'],
    body: ['شرّح جسم الانسان', 'تشريح', 'exploded human body anatomy'],
    '': ['فككه', 'فكّكها', 'explode it', 'تفكيك الكرسي', 'اشرح وفككه'],
  };
  for (const [k, list] of Object.entries(K)) for (const t of list) assert.equal(VC.explodedKind(t), k, t);
  const body = VC.buildExplodedPrompt('شرّح جسم الانسان');
  assert.match(body, /educational anatomical model \(clean museum \/ medical-model style\)/);
  assert.match(body, /Request: شرّح جسم الانسان\./, 'كلامه يتّسع مع أطول تلميح');
  assert.match(body, /skin, muscles, skeleton, organs/);
  assert.match(body, /no blood, no gore, never a real person being cut/);
  const plane = VC.buildExplodedPrompt('فكك الطيارة');
  assert.match(plane, /Aircraft parts: fuselage sections, wings, tail, engines, landing gear, cockpit\./);
  assert.match(VC.buildExplodedPrompt('فككها الساعة'), /Watch parts: case, crystal, dial, hands, movement gears and springs, crown, strap\./);
  assert.match(VC.buildExplodedPrompt('فككلي الجوال'), /Device parts: front glass, display, frame, logic board, battery, camera modules, speakers, back cover\./);
  const gen = VC.buildExplodedPrompt('فككه');
  assert.doesNotMatch(gen, /Vehicle parts|Aircraft parts|Watch parts|Device parts|anatomical/);
  assert.match(gen, /real components separate/);
  for (const t of ['فكك السيارة', 'شرّح جسم الانسان', 'x'.repeat(5000)]) assert.ok(VC.buildExplodedPrompt(t).length <= VC.RUNWAY_PROMPT_MAX, t.slice(0, 20));
});

test('٦. المدّة ≤ ١٠ث في كلّ الأحوال: ٥ ثوانٍ ولو أرسل العميل ١٥ أو ١٠ أو لا شيء، للمالك ولغيره', async () => {
  for (const user of ['omran', 'someone']) {
    for (const d of [15, 10, 8, undefined, 'x', 60]) {
      const r = await run(CHAT({ duration: d, durationSeconds: 15, confirmed: true }), { user });
      assert.equal(r.res.code, 200, JSON.stringify(r.res.body));
      assert.equal(r.runway[0].duration, 5, user + ' ' + d);
      assert.ok(r.runway[0].duration <= 10);
    }
  }
  const VC = require(rp('api/_lib/video-create.js'));
  assert.equal(VC.EXPLODED_SECONDS, 5);
  // مسار المحادثة يرسل ٥ أصلًا
  assert.match(A9, /const __vp = \{ promptText: text\.slice\(0, 900\), duration: 5, ratio: '1280:720', token: authGet\('aiapp_auth_token'\) \};\s*if\(__explodedTurn\) __vp\.fx = 'exploded';/);
});

test('٧. لا صورة وسيطة تُولَّد ولا إطار يُرسم — ولو كان رسم الإطار مفعّلًا أو الأسلوب أنمي', async () => {
  for (const extra of [{}, { style: 'anime' }, { keepPhoto: false }]) {
    const r = await run(CHAT(extra), { env: { VIDEO_FREE_FRAME: 'on' } });
    assert.deepEqual(r.kinds, ['runway'], JSON.stringify(extra));
    assert.equal(r.runway[0].promptImage, 'data:image/jpeg;base64,' + JPEG);
  }
  // الضابط: بلا تفكيك يرسم المفتاح إطاره كما كان (فالاختبار يرى الرسم لو وقع)
  const ctl = await run(CHAT({ fx: '', keepPhoto: false }), { env: { VIDEO_FREE_FRAME: 'on' } });
  assert.ok(ctl.kinds.includes('image'), 'الضابط يرسم: ' + ctl.kinds.join(','));
});

test('٨. المال: سؤال الخصم نفسه (428) ثمّ خصم فيديو عاديّ واحد بسعره القائم، لا أكثر', async () => {
  const q = await run(CHAT(), { user: 'someone' });
  assert.equal(q.res.code, 428, 'بلا موافقة لا يبدأ');
  assert.equal(q.res.body.error, 'confirm_required');
  assert.equal(q.res.body.cost, realPoints.COSTS.runway_video, 'السعر نفسه');
  assert.equal(q.runway.length, 0); assert.equal(q.log.spent.length, 0);
  const ok = await run(CHAT({ confirmed: true }), { user: 'someone' });
  assert.equal(ok.res.code, 200, JSON.stringify(ok.res.body));
  assert.deepEqual(ok.log.spent, [{ u: 'someone', cost: realPoints.COSTS.runway_video, kind: 'runway_video' }], 'خصم واحد بسعر الفيديو العاديّ');
  assert.equal(ok.runway.length, 1, 'توليدة واحدة');
  const plain = await run(CHAT({ fx: '', confirmed: true }), { user: 'someone' });
  assert.deepEqual(plain.log.spent, ok.log.spent, 'كفيديو المحادثة العاديّ تمامًا');
  // العميل يمرّ بـpostWithConfirm (سؤال الخصم) لا fetch خام
  const blk = A9.slice(A9.indexOf('    if(__wantsVideo){'), A9.indexOf('// v660 + v-img-dots-plus'));
  assert.match(blk, /const __r = await postWithConfirm\('\/api\/video-create', __vp\);/);
  assert.doesNotMatch(blk, /\/api\/(?:image|edit|nano|gpt-image|video\?action=veo-create|minimax)/, 'لا نداء صورة ولا محرّك آخر في مسار الفيديو');
});

test('٩. تفكيك بلا صورة يُرفض قبل أيّ حجز أو خصم برمز قائم، وبلا تفكيك يبقى الأمر القديم حرفيًّا', async () => {
  const r = await run(CHAT({ imageBase64: '', confirmed: true }), { user: 'someone' });
  assert.equal(r.res.code, 400);
  assert.equal(r.res.body.error, 'video_rejected');
  assert.equal(r.res.body.retryable, false);
  assert.equal(r.log.quota, 0, 'لا حجز حصّة'); assert.equal(r.log.spent.length, 0, 'لا خصم'); assert.equal(r.runway.length, 0);
  const VC = require(rp('api/_lib/video-create.js'));
  for (const fx of [undefined, '', 'smoke', '__proto__']) {
    const p = await run(CHAT({ fx, promptText: 'حرّكها وهي تلمع' }));
    assert.equal(p.runway[0].promptText, VC.buildRunwayPrompt('حرّكها وهي تلمع', undefined, true, false, 0, false, true), String(fx));
    assert.doesNotMatch(p.runway[0].promptText, /exploded/i);
    assert.equal(p.runway[0].duration, 5);
  }
  // الترند لا يتحوّل تفكيكًا
  const tr = await run(CHAT({ trend: 'oldphoto' }));
  assert.equal(tr.res.code, 200, JSON.stringify(tr.res.body));
  assert.doesNotMatch(tr.runway[0].promptText, /exploded view/);
});

test('١٠. الربط في المحادثة: النيّة قبل صانع الفيديو وإعلان الفيديو وصورة الإعلان، وللمالك، وصورته نفسها بلا إطار', () => {
  assert.ok(A9.indexOf('function omranExplodedAsk(') < A9.indexOf('async function __sendPromptCore('), 'خارج __sendPromptCore');
  assert.match(A9, /if\(pendingAttachments\.some\(a => a && a\.isImage\) && omranExplodedAsk\(text, true\)\) return false;/, 'دور المالك لا يُسلَّم للمزوّد');
  assert.match(A9, /const __explodedTurn = !__ownerUiShot && omranExplodedAsk\(text, __gateAtts\.some\(a => a && a\.isImage\)\);/);
  assert.match(A9, /const __adVideoTurn = !__ownerUiShot && !__explodedTurn && omranAdVideoAsk\(/);
  assert.match(A9, /if\(text && !__explodedTurn \/\*[^*]*\*\/ && __VID_MAKE_RE\.test\(text\)/, 'لا يفتح صانع الفيديو');
  assert.match(A9, /&& __rtAdOk \/\* v-route-ad \*\/ && !__explodedTurn \/\* v-chat-exploded \*\/ && !cur\.adMode/, 'لا صورة إعلان');
  assert.match(A9, /const __wantsVideo = __explodedTurn \/\* v-chat-exploded \*\/ \|\| !!text && /);
  // القرار الحقيقيّ بنصّه (مساعد اختبارات التوجيه): صورة + «فكّكه» = __wantsVideo، ولا سؤال «فيديو عن شو؟» (فعل التفكيك نفسه موضوع)
  const h = require('./_route-src.cjs').load(root);
  for (const t of YES) {
    assert.equal(h.wantsVideo(t, true, null), true, 'فيديو: ' + t);
    assert.equal(h.vague(t), false, 'ليس مبهمًا: ' + t);
  }
  for (const t of ['فككه', 'تفكيك السيارة', 'شرّحه', 'explode it']) assert.equal(h.wantsVideo(t, false, null), false, 'بلا صورة: ' + t);
  for (const t of ['لا تفككه', 'فك الحجز', 'اشرحه', 'كيف تتفكك الساعة؟']) assert.equal(h.wantsVideo(t, true, null), false, 'ليس تفكيكًا: ' + t);
  assert.match(A9, /\.every\(function\(w\)\{ return __ANIM_ONLY_RE\.test\(w\); \}\);\s*if\(__explodedTurn\) __vp\.keepPhoto = true;/, 'صورته نفسها أوّل إطار');
  // ترتيب البوّابات: النيّة تُحسب قبل صانع الفيديو، والفيديو قبل مسارات تعديل الصورة
  assert.ok(A9.indexOf('const __explodedTurn =') < A9.indexOf('const __VID_MAKE_RE ='));
  assert.ok(A9.indexOf('const __wantsVideo = ') < A9.indexOf('const __ATT_EDIT = '));
});

/* ── المراجعة: إيجابيّات كاذبة (صورة + كلام ليس طلب تفكيك = كان يصير فيديو مدفوعًا) وثغرتا الأمر ── */
const FALSE_POS = [
  // سؤال في وسط الكلام لا في أوّله
  'هل يمكن تفكيكه؟', 'ممكن تشرح لي كيف يتفكك المحرك؟', 'الكرسي تفكك كيف اركبه؟', 'وهل يتفكك؟',
  // واجب رياضيّات/نحو أو شيء مجرّد في الصورة
  'فكك المعادلة', 'فكك لي هالمسألة خطوة خطوة', 'فكك الجملة اعرابيا', 'فكك هالكلمة', 'فكك الرقم لعوامله', 'فكك لي هالمشكلة',
  'فكك السؤال', 'فكك الفكرة', 'فكّك الأقواس في هالمسألة', 'فكك العدد 360 إلى عوامله الأولية', 'تفكيك العدد إلى جداء عوامل أولية',
  'فكك الجملة وأعربها', 'فكك الكلمة إلى حروف', 'اكتب مقال عن تفكك الأسرة عن هذي الصورة', 'teardown the server', 'disassemble this equation',
  // انفجار لا تفكيك، وماضٍ إنجليزيّ
  'make it explode with fire', 'خله ينفجر', 'تفكيك وانفجار بالنار', 'خله يتفكك وسط النار', 'my phone battery exploded, is it safe to charge?',
  'the screen exploded after it fell, can it be fixed', 'this post will explode on instagram, write a caption', 'it exploded',
  // إعلان بيع/إيجار بلا كلمة فيديو = صورة الإعلان كما في main
  'اعلان للبيع ساعة رولكس تفكيك القطع', 'سيارة للإيجار تفكيك القطع',
  // ماضٍ وقلق وطلب مساعدة
  'الجوال تفكك بيدي وش اسوي', 'خايف يتفكك', 'اخاف تتفكك القطع',
];
const STILL_YES = [
  // لا يكسرها الإصلاح: الأشياء الحقيقيّة، و«النارية/الرقمية» كلمة لا جزء كلمة، وسؤال مع طلب عرض
  'فكك الدراجة النارية', 'فكك الساعة الرقمية', 'فككها وريني كيف تتركب', 'هل تقدر تسوي فيديو يفككها؟', 'تقدر تفككها؟',
  'explode it', 'explode this watch', 'exploded view of my phone', 'explode.', 'سوّي فيديو يفكك المنتج', 'فكك العطر',
];

test('١١. المراجعة: سؤال في أيّ موضع، وواجب مجرّد، وانفجار، وماضٍ، وإعلان بيع، وقلق — لا تطلقه؛ والأشياء الحقيقيّة تبقى', () => {
  for (const t of FALSE_POS) assert.equal(ask(t, true), false, 'ليس طلب تفكيك: ' + t);
  for (const t of STILL_YES) assert.equal(ask(t, true), true, 'تفكيك: ' + t);
  const h = require('./_route-src.cjs').load(root);
  for (const t of ['فكك المعادلة', 'هل يمكن تفكيكه؟', 'my phone battery exploded, is it safe to charge?']) assert.equal(h.wantsVideo(t, true, null), false, 'لا فيديو: ' + t);
});

test('١٢. المراجعة: صورة إنسان بلا كلمة «جسم» = نموذج تعليميّ بلا دم أيضًا، ولا تلميح فئة خاطئ يخترع قطعًا', () => {
  const VC = require(rp('api/_lib/video-create.js'));
  // الأمر العامّ (أيّ صورة، وقد تكون شخصًا) يحمل شرط السلامة؛ والفئات الأخرى كما هي
  for (const t of ['فككه', 'فكك الجسم', 'explode the body', 'تفكيك الكرسي']) {
    const p = VC.buildExplodedPrompt(t);
    assert.equal(VC.explodedKind(t), '', t);
    assert.match(p, /If it is a person or animal, show a clean educational model only: no blood, no gore, no injury\./, t);
    assert.ok(p.length <= VC.RUNWAY_PROMPT_MAX, t);
    assert.ok(p.includes('Request: ' + t + '.'), 'كلامه يتّسع: ' + t);
  }
  const gen = VC.buildExplodedPrompt('x'.repeat(5000));
  assert.ok(gen.length <= VC.RUNWAY_PROMPT_MAX, String(gen.length));
  assert.ok(/Request: (x+)\./.exec(gen)[1].length >= 100, 'يبقى لكلامه ١٠٠ حرف على الأقلّ');
  for (const t of ['فكك السيارة', 'فكك الطيارة', 'فككها الساعة', 'فككلي الجوال', 'شرّح جسم الانسان'])
    assert.doesNotMatch(VC.buildExplodedPrompt(t), /If it is a person or animal/, 'الفئات الأخرى بلا زيادة: ' + t);
  // «الطارة» (المقود) و«إطارها» ليست طيّارة، و«watch» الفعل ليس ساعة
  const K = {
    '': ['فكك الطارة', 'explode it so we can watch how it works', 'فكك الطيار'],
    vehicle: ['فكّك السيارة وإطارها'],
    electronics: ['take this phone apart, I want to watch', 'teardown of this laptop, watch it come apart'],
    watch: ['disassemble this watch', 'take the watch apart', 'explode my smart watch', 'فككها الساعة', 'watches teardown'],
    aircraft: ['فكك الطيارة', 'طيارتي فككها', 'تفكيك الطائرة', 'فكك الطيارات'],
  };
  for (const [k, list] of Object.entries(K)) for (const t of list) assert.equal(VC.explodedKind(t), k, t);
});

console.log('✓ chat-exploded: صورة + «فكّكه» = فيديو تفكيك ٥ث من صورته نفسها، بأمر واحد وتلميح فئة، وسؤال الخصم نفسه، والنفي والمعاني الأخرى لا تطلقه');
