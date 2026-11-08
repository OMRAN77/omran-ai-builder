'use strict';
/* v-trends-identity-audit — المالك ٧ نوفمبر: «لا انته افحص الكود ليش تخسرني انا اقدر افحص بروحي» بعد «٤ تجارب والشكل يتغيّر»: فحص كلّ ترند
   من الكود بلا أيّ نداء مدفوع. يثبت هذا الملفّ (fetch مزيّف وصور مصنوعة، بلا مفتاح حقيقيّ):
   ١) «احضن نفسك الصغير» و«كبسولة الزمن»: نسخته بعمره الحاليّ مقفلة (شعر ولحية وغطاء رأس ووضعيّة) فرديًّا ولمجموعة، والعمر الآخر كما كان.
   ٢) القوالب: الزواج بلا شريك مخترع ولا دوران، الغناء بلا «قريبة ثمّ متوسّطة»، لا غطاء رأس مضاف، لا ابتسامة/تكشيرة/ضحك جديد، لا اقتراب يكبّر
      الوجه ولا نظر للأعلى، و«حرّك الصورة» بلا التفات — والحدود كما هي.
   ٣) ترند الشخص الواحد بلا لقطة (سيلفي يملأ الصورة، نفاد Gemini): «الشخص الواحد من الصورة»، ولقطة الصديق لا تصير مرجعه؛ وإطار المجموعة لقطة
      أكبر وجه في كلّ صورة وحده؛ وبثلاث صور اللقطتان للأصغر وجهًا.
   ٤) تبديل الرأس: حافة اللصق لا تدخل الوجه عند الجار، و«من ينقذك؟» نسختان أو لا شيء، ووجه الخلفيّة الصغير لا يلغي التبديل، ونفاد Gemini يُسمّى،
      ونافذة التبديل بعد إطار مجموعة بطيء. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const root = path.join(__dirname, '..');
for (const k of ['TREND_FACE_SWAP', 'FAL_KEY', 'FACE_SWAP_MODEL', 'FACE_SWAP_LORA', 'FACE_SWAP_CAP_CENTS', 'MERGE_FACE_CROPS']) delete process.env[k];
const TP = require(path.join(root, 'api/_lib/trend-people.js'));
const FS = require(path.join(root, 'api/_lib/face-swap.js'));
const MI = require(path.join(root, 'api/_lib/merge-identity.js'));
const FC = require(path.join(root, 'api/_lib/face-composite.js'));
const VT = require(path.join(root, 'api/_lib/video-trends.js'));
const { TRENDS, buildTrendPrompt } = VT;
const VEO_PROMPT_MAX = 2600;
const sceneOf = (k) => TP.trendScene(buildTrendPrompt(k, { hasImage: true, people: 1, text: 'يا هلا', name: 'عمران' }).prompt);

/* ── ١. نسخته بعمره الحاليّ ── */
test('١. احضن نفسك الصغير وكبسولة الزمن: نسخته الحاليّة مقفلة فرديًّا ولمجموعة؛ والعمر الآخر بلا presentSelf كما كان حرفيًّا', () => {
  for (const k of ['hugyounger', 'timecapsule']) {
    const t = TP.soloFrameTask(sceneOf(k), { ageShift: true, presentSelf: true, people: 1 });
    assert.ok(t.includes(TP.presentSelfLock(false, 'Photo 1')), k);
    for (const w of ['hairline', 'any beard or moustache', 'agal', 'no new smile', 'Only the other self is drawn at the age the description asks for']) assert.ok(t.includes(w), k + ': ' + w);
    assert.doesNotMatch(t, /clothing, hairstyle, pose/, k + ': القصّة لم تعد من الوصف');
    const g = TP.frameTask(2, sceneOf(k), false, { ageShift: true, presentSelf: true });
    assert.ok(g.includes(TP.presentSelfLock(true, 'their own photo')), k + ': المجموعة');
    assert.ok(g.includes("Each person's present-day self"));
  }
  /* بلا presentSelf: كما كان (نسخة الطفل، رحلة العمر) */
  const before = TP.soloFrameTask(sceneOf('babyversion'), { ageShift: true, people: 1 });
  assert.ok(before.includes('The setting, clothing, hairstyle, pose and lighting follow the description'));
  assert.ok(!before.includes('present-day self'));
  assert.ok(!TP.frameTask(2, 'x', false, { ageShift: true }).includes('present-day self'));
  assert.ok(!TP.frameTask(2, 'x', false, { ageShift: true }).includes('hairline'));
  /* presentSelf بلا ageShift لا يغيّر شيئًا */
  assert.equal(TP.soloFrameTask('a souq', { presentSelf: true }), TP.soloFrameTask('a souq', {}));
});

/* ── ٢. القوالب ── */
const AUDITED = ['wedding', 'heritagesing', 'outfitswap', 'eidgreeting', 'ceilingfan', 'spanishrap', 'invisiblebike', 'celebselfie', 'testimonial',
  'vhsflashback', 'birthdaybash', 'dayinlife', 'slowmoentry', 'jetflyover', 'bbywow', 'oldphoto', 'tears', 'familywave'];
test('٢. القوالب: لا شريك مخترع ولا دوران ولا قائمة لقطات ولا غطاء رأس مضاف ولا تعبير جديد ولا اقتراب يكبّر الوجه — والحدود كما هي', () => {
  const W = TRENDS;
  assert.doesNotMatch(W.wedding.prompt, /circles|orbit|the couple from/);
  assert.ok(W.wedding.prompt.includes('never an invented partner'));
  assert.ok(W.wedding.prompt.includes('the camera stays in front of them at eye level'));
  assert.ok(W.heritagesing.prompt.includes('one continuous medium close-up'));
  for (const [k, t] of Object.entries(W)) if (!TP.MULTI_SHOT_TRENDS.has(k)) assert.ok(!/\b(close-up|medium shot|wide shot)\s+then\b/i.test(t.prompt), k + ': قائمة لقطات بلا مونتاج');
  assert.doesNotMatch(W.outfitswap.prompt, /Gulf attire/);
  assert.ok(W.outfitswap.prompt.includes('nothing is put on or taken off the head'));
  assert.ok(W.outfitswap.prompt.includes('Only the clothes change'));
  assert.ok(W.eidgreeting.prompt.includes('nothing added on the head'));
  assert.ok(W.ceilingfan.prompt.includes('headwear (none added, none removed)'));
  for (const k of ['spanishrap', 'invisiblebike', 'celebselfie', 'testimonial', 'vhsflashback', 'birthdaybash', 'dayinlife']) {
    assert.doesNotMatch(W[k].prompt, /\b(grin|grinning|laugh(?:ing)?|smil(?:e|es|ing))\b/i, k);
  }
  assert.doesNotMatch(W.slowmoentry.prompt, /left edge|toward the lens|Static wide/);
  assert.ok(W.slowmoentry.prompt.includes('framed from the knees up') && W.slowmoentry.prompt.includes('until they stand in the middle of the frame, seen from the knees up'));
  assert.doesNotMatch(W.invisiblebike.prompt, /glances back|drops to road level/);
  assert.ok(W.invisiblebike.prompt.includes('invisible handlebars, nothing at all beneath them'));
  assert.doesNotMatch(W.jetflyover.prompt, /tilts up|looks up through the sunroof/);
  assert.ok(W.jetflyover.prompt.includes('the camera stays on them'));
  assert.doesNotMatch(W.bbywow.prompt, /in close-up/);
  assert.ok(W.bbywow.prompt.includes('medium close-up (chest up)') && W.bbywow.prompt.includes('bite of the bun on the beat'));
  assert.doesNotMatch(W.oldphoto.prompt, /turns slightly toward the camera|smiles warmly/);
  assert.doesNotMatch(W.familywave.prompt, /turns slightly to each other/);
  assert.doesNotMatch(W.tears.prompt, /calm, soft smile/);
  /* الحدود: ≤٧٠٠ للقوالب التي يحدّها سقف المصدر (ترندات أكتوبر)، والكلّ يتّسع لقفل الإطار مع اسم وجملة */
  for (const k of ['slowmoentry', 'invisiblebike', 'bbywow', 'ceilingfan']) assert.ok(W[k].prompt.length <= 700, k + ': ' + W[k].prompt.length);
  for (const k of AUDITED) {
    const b = buildTrendPrompt(k, { hasImage: true, text: 'يا هلا', name: 'عمران', sceneIndex: 0 });
    assert.ok(b && b.prompt.length + TP.FRAME_LOCK.length <= VEO_PROMPT_MAX, k + ': ' + (b && b.prompt.length));
    assert.ok(sceneOf(k).length <= TP.SCENE_MAX, k + ': المشهد ضمن سقف مهمّة الإطار');
  }
});

/* ── صور مصنوعة ── */
function png(w, h, fill) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) { const c = typeof fill === 'function' ? fill(i % w, Math.floor(i / w)) : fill; p.data[i * 4] = c[0]; p.data[i * 4 + 1] = c[1]; p.data[i * 4 + 2] = c[2]; p.data[i * 4 + 3] = 255; }
  return PNG.sync.write(p);
}
let seed = 1;
const photoJpg = (w, h) => { const d = Buffer.alloc(w * h * 4, 0); const c = (seed++ * 37) % 200; for (let i = 0; i < w * h; i++) { d[i * 4] = c; d[i * 4 + 1] = 90; d[i * 4 + 2] = 160; d[i * 4 + 3] = 255; } return Buffer.from(jpeg.encode({ width: w, height: h, data: d }, 85).data).toString('base64'); };
const detectReply = (boxes) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: boxes.map((b) => ({ box_2d: b })) }) }] } }] }), { status: 200 });

/* ── ٣. ترند الشخص الواحد والمجموعة: أيّ وجه يصير مرجعًا ── */
test('٣. الشخص الواحد بلا لقطة: «from Photo 1» لا «close-up face is attached»، ولا «several people»', () => {
  const s = sceneOf('slowmoentry');
  const no = TP.soloFrameTask(s, { single: true, people: 0 });
  assert.ok(no.includes('Show only the one real person from Photo 1 (a mirror reflection'));
  assert.ok(!no.includes('several people') && !no.includes('whose close-up face is attached'));
  const yes = TP.soloFrameTask(s, { single: true, closeup: true, people: 1 });
  assert.ok(yes.includes('Show only the one real person whose close-up face is attached'));
});

test('٤. سيلفي ترند الشخص الواحد مع وجه صديق: لا لقطة للصديق (الصورة كلّها مرجعًا) — وانعكاس صغير يبقى لقطتها هي', async () => {
  const run = async (boxes) => {
    const seen = [];
    const out = await TP.soloFirstFrame('K', { data: photoJpg(1000, 1000), mime: 'image/jpeg' }, sceneOf('slowmoentry') + ' #' + seed, '720:1280', {
      single: true, budgetMs: 60000, fetchImpl: async () => detectReply(boxes),
      callImage: async (k, parts) => { seen.push(parts); return { b64: 'F', mime: 'image/png' }; } });
    return { out, parts: seen[0] };
  };
  /* وجهه ٥٠٪ من الصورة (يسقط قصّه: ≥٤٥٪) والصديق ٣٠٪ — كان الصديق «the person» ومرجع الهويّة */
  const a = await run([[200, 50, 700, 450], [300, 650, 600, 900]]);
  assert.equal(a.out.people, 0); assert.equal(a.out.ref, null);
  const txt = a.parts.map((p) => p.text || '').join('\n');
  assert.ok(!txt.includes(TP.SOLO_CLOSEUP_LABEL), 'بلا لقطة');
  assert.equal(a.parts.filter((p) => p.inlineData).length, 1, 'الصورة وحدها');
  assert.ok(txt.includes('Show only the one real person from Photo 1'));
  /* انعكاس صغير: قصّه يسقط (<٣٢ بكسل) فلقطتها هي */
  const b = await run([[200, 300, 260, 345], [210, 700, 241, 725]]);
  assert.equal(b.out.people, 1); assert.ok(b.out.ref && b.out.ref.data);
  assert.ok(b.parts.map((p) => p.text || '').join('\n').includes(TP.SOLO_CLOSEUP_LABEL));
});

test('٥. faceCrops: onePerPhoto = لقطة أكبر وجه وحده (أو لا شيء)، والافتراضيّ كما كان؛ وبثلاث صور اللقطتان للأصغر وجهًا', async () => {
  const P = { data: photoJpg(1000, 1000), mime: 'image/jpeg' };
  const f = (boxes) => async () => detectReply(boxes);
  /* صديق خلفه: الافتراضيّ لقطتان، وonePerPhoto الأكبر وحده بعنوان «the person» */
  const two = [[200, 100, 520, 400], [250, 600, 490, 820]];
  assert.equal((await MI.faceCrops('k', [P], { fetchImpl: f(two) })).length, 2);
  const one = await MI.faceCrops('k', [P], { fetchImpl: f(two), onePerPhoto: true });
  assert.equal(one.length, 1); assert.equal(one[0].who, 'the person'); assert.ok(Math.abs(one[0].size - 0.32) < 1e-6, 'الأكبر');
  /* الأكبر يملأ الصورة (يسقط قصّه): لا لقطة، لا الصديق */
  assert.deepEqual(await MI.faceCrops('k', [P], { fetchImpl: f([[200, 50, 700, 450], [300, 650, 600, 900]]), onePerPhoto: true }), []);
  /* ثلاث صور، الحصّة لقطتان: الأصغر وجهًا (الصورتان ٢ و٣) لا ترتيب الرفع */
  const heights = [300, 250, 100]; let n = 0;
  const fx = async () => { const h = heights[n++]; return detectReply([[100, 300, 100 + h, 300 + h]]); };
  assert.deepEqual((await MI.faceCrops('k', [P, P, P], { fetchImpl: fx })).map((c) => c.of), [1, 2]);
  /* الحصّة غير الضيّقة: الترتيب القديم حرفيًّا (جولة بجولة) */
  const hs = [[[100, 100, 400, 400], [120, 600, 380, 860]], [[100, 300, 350, 550]]]; let m = 0;
  const fy = async () => detectReply(hs[m++]);
  assert.deepEqual((await MI.faceCrops('k', [P, P], { fetchImpl: fy })).map((c) => c.of + ':' + c.who), ['0:the person on the left', '1:the person', '0:the person on the right']);
});

test('٦. إطار المجموعة: لقطة أكبر وجه في كلّ صورة وحده؛ سيلفي بصديق = بلا لقطة له ومرجعه صورته؛ وrefs تعود للمتّصل (لقطة واحدة = هي، لقطتان = الصورة)', async () => {
  const P0 = { data: photoJpg(1000, 1000), mime: 'image/jpeg' }, P1 = { data: photoJpg(1000, 1000), mime: 'image/jpeg' };
  const real = global.fetch; let k = 0;
  const per = [[[200, 50, 720, 450], [300, 650, 600, 900]], [[200, 300, 500, 600]]];
  global.fetch = async () => detectReply(per[k++ % 2]);
  let parts = null;
  try {
    const r = await TP.groupFirstFrame('K', [P0, P1], 'two friends in a souq', '720:1280', { callImage: async (key, p) => { parts = p; return { b64: 'G', mime: 'image/png' }; } });
    const txt = parts.map((p) => p.text || '').join('\n');
    assert.ok(!/the face of [^;)]* in Photo 1\b/.test(txt), 'لا لقطة لصديق الصورة ١: ' + txt.slice(0, 400));
    assert.match(txt, /Close-up 1 = the face of the person in Photo 2/);
    assert.equal(r.refs[0].face, false); assert.equal(r.refs[0].data, P0.data);
    assert.equal(r.refs[1].face, true);
  } finally { global.fetch = real; }
  /* لقطتان لصورة واحدة (شخصان فيها) = الصورة نفسها مرجعًا */
  const r2 = await TP.groupFirstFrame('K', [P0, P1], 'x', '720:1280', {
    faceCrops: async () => [{ of: 0, who: 'the person', data: 'C1', mime: 'image/jpeg' }, { of: 1, who: 'the person on the left', data: 'C2', mime: 'image/jpeg' }, { of: 1, who: 'the person on the right', data: 'C3', mime: 'image/jpeg' }],
    callImage: async () => ({ b64: 'G', mime: 'image/png' }) });
  assert.deepEqual(r2.refs.map((x) => x.data), ['C1', P1.data]);
  assert.deepEqual(r2.refs.map((x) => x.face), [true, false]);
});

/* ── ٤. تبديل الرأس ── */
const FAL = 'fal-secret-audit-key';
const GKEY = 'gm-audit-key';
const W = 1024, H = 1024;
const FRAME = png(W, H, [128, 128, 128]).toString('base64');
const jpg = (w, h, c) => Buffer.from(jpeg.encode({ width: w, height: h, data: Buffer.from(new Array(w * h).fill(c.concat(255)).flat()) }, 90).data).toString('base64');
const REF_A = jpg(64, 64, [200, 40, 40]), REF_B = jpg(64, 64, [40, 200, 40]);
const decode = (b64) => FC.decode(Buffer.from(b64, 'base64'));
const px = (img, x, y) => { const i = (y * img.w + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= t);
function stub(o) {
  const calls = { flash: [], fal: [] };
  const f = async (url, init) => {
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      calls.flash.push(JSON.parse(init.body));
      if (o.flash) return new Response(o.flash.text || '{}', { status: o.flash.status });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: o.faces || [], others: o.others || [] }) }] } }] }), { status: 200 });
    }
    const body = JSON.parse(init.body);
    calls.fal.push(body);
    const color = body.image_urls[1].endsWith(REF_B) ? [0, 220, 0] : [230, 0, 0];
    return new Response(JSON.stringify({ images: [{ url: 'data:image/png;base64,' + png(body.image_size.width, body.image_size.height, color).toString('base64') }] }), { status: 200 });
  };
  return { f, calls };
}
function fakeKv() { const m = new Map(); return { m, kvIncrBy: async (k, n) => { const v = Number(m.get(k) || 0) + n; m.set(k, v); return v; }, kvDecrBy: async (k, n) => { const v = Number(m.get(k) || 0) - n; m.set(k, v); return v; }, kvExpire: async () => {}, spent: () => [...m.values()].reduce((a, b) => a + b, 0) }; }
const on = () => { process.env.TREND_FACE_SWAP = 'on'; process.env.FAL_KEY = FAL; };
const off = () => { delete process.env.TREND_FACE_SWAP; delete process.env.FAL_KEY; };
const run = (refs, o, faces, extra) => {
  const s = stub(Object.assign({ faces }, extra || {})); const kv = fakeKv();
  return FS.lockFaces({ b64: FRAME, mime: 'image/png' }, refs, Object.assign({ apiKey: GKEY, until: Date.now() + 120000, owner: true, fetchImpl: s.f, kv }, o)).then((r) => ({ r, calls: s.calls, kv }));
};
const A = { data: REF_A, mime: 'image/jpeg', face: true }, B = { data: REF_B, mime: 'image/jpeg', face: true };

test('٧. زوجان خدًّا لخدّ (فاصل ~٤٠ بكسل): حافة اللصق في الفاصل وحده — طرف كلّ وجه الداخليّ مبدَّل كاملًا', async () => {
  on();
  try {
    const L = [300, 300, 500, 480], R = [300, 520, 500, 700];
    const x = await run([A, B], {}, [{ ref: 0, box_2d: L, sure: true }, { ref: 1, box_2d: R, sure: true }]);
    assert.equal(x.r.swapped, 2, x.r.reason);
    const img = decode(x.r.b64), y = Math.round(0.4 * H);
    const lIn = Math.floor(0.48 * W) - 1, rIn = Math.ceil(0.52 * W);
    assert.ok(near(px(img, lIn, y), [230, 0, 0], 16), 'طرف الأيسر الداخليّ: ' + px(img, lIn, y));
    assert.ok(near(px(img, rIn, y), [0, 220, 0], 16), 'طرف الأيمن الداخليّ: ' + px(img, rIn, y));
  } finally { off(); }
});

test('٨. «من ينقذك؟»: نسخة واحدة رُبطت ووجه آخر في الإطار = لا تبديل ولا صرف؛ النسختان أو نسخة وحيدة تُبدَّل؛ وأمر الربط لا يطابق باللبس', async () => {
  on();
  try {
    const L = [300, 150, 500, 350], R = [300, 650, 500, 850];
    let x = await run([A], { multi: true }, [{ ref: 0, box_2d: L, sure: true }], { others: [{ box_2d: R }] });
    assert.equal(x.r.reason, 'missing-copy'); assert.equal(x.calls.fal.length, 0); assert.equal(x.r.b64, FRAME); assert.equal(x.kv.spent(), 0);
    x = await run([A], { multi: true }, [{ ref: 0, box_2d: L, sure: true }, { ref: -1, box_2d: R }]);
    assert.equal(x.r.reason, 'missing-copy'); assert.equal(x.calls.fal.length, 0);
    x = await run([A], { multi: true }, [{ ref: 0, box_2d: L, sure: true }]);
    assert.equal(x.r.swapped, 1);
    x = await run([A], { multi: true }, [{ ref: 0, box_2d: L, sure: true }, { ref: 0, box_2d: R, sure: true }]);
    assert.equal(x.r.swapped, 2);
    const p = x.calls.flash[0].contents[0].parts.map((q) => q.text || '').join(' ');
    assert.ok(p.includes('Find EVERY person in Image A whose face matches Reference 0') && !p.includes('Match by appearance'));
    assert.ok(!p.includes('match Reference 0 equally well'), 'لا قاعدة «اثنان بالقدر نفسه = شكّ»');
  } finally { off(); }
});

test('٩. وجه خلفيّة صغير (جمهور) يلامس القصّة: لا يلغي التبديل ولا يقصّ الشعر — ويمنع التوسيع وحده؛ ووجه كامل الحجم كما كان', async () => {
  on();
  try {
    const F = [327, 391, 472, 586];
    let x = await run([A], {}, [{ ref: 0, box_2d: F, sure: true }], { others: [{ box_2d: [309, 573, 349, 638] }] });
    assert.equal(x.r.swapped, 1, x.r.reason); assert.equal(x.calls.fal.length, 1);
    assert.ok(x.calls.fal[0].image_size.width <= 608, 'بلا توسيع إلى ٧٦٨: ' + x.calls.fal[0].image_size.width);
    /* وجه صغير فوق الرأس: لا يقصّ أعلى القصّة (منبت الشعر) */
    x = await run([A], {}, [{ ref: 0, box_2d: F, sure: true }], { others: [{ box_2d: [240, 423, 276, 488] }] });
    assert.equal(x.r.swapped, 1, x.r.reason);
    const img = decode(x.r.b64), cx = Math.round((0.391 + 0.586) / 2 * W);
    const above = Math.round(0.327 * H) - 60; // ٦٠ بكسل فوق منبت الشعر (قصّ المنتصف كان يقف عند ~٢٦)
    assert.ok(!near(px(img, cx, above), [128, 128, 128], 6), 'الشعر فوق الجبهة مبدَّل: ' + px(img, cx, above));
    /* وجه بحجم الوجه المُبدَّل متداخل = overlap كما كان */
    x = await run([A], {}, [{ ref: 0, box_2d: F, sure: true }], { others: [{ box_2d: [360, 420, 500, 600] }] });
    assert.equal(x.r.swapped, 0); assert.equal(x.calls.fal.length, 0);
  } finally { off(); }
});

test('١٠. نفاد رصيد Gemini عند الربط: السبب locate-gemini-out (لا locate-429) ولا يُعاد من الذاكرة', async () => {
  on();
  try {
    const x = await run([A], {}, [], { flash: { status: 429, text: '{"error":{"message":"Your prepayment credits are depleted."}}' } });
    assert.equal(x.r.reason, 'locate-gemini-out'); assert.equal(x.calls.fal.length, 0);
    const y = await run([A], {}, [], { flash: { status: 429, text: '{"error":{"message":"Resource has been exhausted"}}' } });
    assert.equal(y.r.reason, 'locate-429', 'الزحام كما كان');
  } finally { off(); }
});

test('١١. إطار مجموعة بطيء (١١٠ث من ١٢٠): نافذة التبديل تُعاد بعده — يصل الربط، لا «budget»', async () => {
  on();
  const realNow = Date.now; let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const s = stub({ faces: [{ ref: 0, box_2d: [300, 150, 500, 350], sure: true }, { ref: 1, box_2d: [300, 650, 500, 850], sure: true }] });
    const r = await TP.groupFirstFrame('K', [{ data: png(400, 400, [90, 90, 160]).toString('base64'), mime: 'image/png' }, { data: png(400, 400, [90, 160, 90]).toString('base64'), mime: 'image/png' }], 'two friends', '720:1280', {
      faceCrops: async () => [{ of: 0, who: 'the person', data: REF_A, mime: 'image/jpeg' }, { of: 1, who: 'the person', data: REF_B, mime: 'image/jpeg' }],
      callImage: async () => { skew += 110000; return { b64: FRAME, mime: 'image/png' }; }, fetchImpl: s.f,
      swap: { until: realNow() + 120000, owner: true, kv: fakeKv() } });
    assert.notEqual(r.swapWhy, 'budget');
    assert.equal(s.calls.flash.length, 1, 'الربط نودي');
    assert.equal(r.swapped, 2, r.swapWhy);
  } finally { Date.now = realNow; off(); }
});

/* ── ٥. العميل: صورة واحدة بدقّة ٢٠٤٨ ── */
test('١٢. العميل: صورة واحدة حتّى ٢٠٤٨ بجودة ٠٫٩ (مرّة للقصّة كلّها)، والكبيرة جدًّا أو العطب = نسخة ١٤٠٠؛ وعدّة صور كما كانت', async () => {
  const fs = require('node:fs'), vm = require('node:vm');
  const SRC = fs.readFileSync(path.join(root, 'js/app-11-video-trends.js'), 'utf8');
  const i = SRC.indexOf('  var SOLO_MAX = 2048'), j = SRC.indexOf('  /* بطاقة نظيفة', i);
  assert.ok(i > 0 && j > i, 'soloHi في المصدر');
  const mkCtx = (w, h, len) => {
    const drawn = [];
    const ctx = {
      Promise, Math, String,
      FileReader: function () { this.readAsDataURL = () => { this.result = 'data:x'; this.onload(); }; },
      Image: function () { Object.defineProperty(this, 'src', { set: () => { this.width = w; this.height = h; this.onload(); } }); },
      document: { createElement: () => ({ getContext: () => ({ drawImage: (im, x, y, cw, ch) => drawn.push([cw, ch]) }), toDataURL: (t, q) => { drawn.push([t, q]); return 'data:image/jpeg;base64,' + 'A'.repeat(len); } }) },
    };
    vm.runInNewContext(SRC.slice(i, j) + '\nthis.soloHi = soloHi;', ctx);
    return { ctx, drawn };
  };
  let e = mkCtx(4000, 3000, 1000);
  assert.ok((await e.ctx.soloHi({})).length > 0);
  assert.deepEqual(e.drawn, [[2048, 1536], ['image/jpeg', 0.9]]);
  e = mkCtx(800, 600, 1000); await e.ctx.soloHi({});
  assert.deepEqual(e.drawn[0], [800, 600], 'لا تكبير');
  e = mkCtx(4000, 3000, 3600000);
  assert.equal(await e.ctx.soloHi({}), '', 'فوق السقف = نسخة ١٤٠٠');
  const one = SRC.slice(SRC.indexOf('  async function oneClip('), SRC.indexOf('    var endpoint, statusUrl;'));
  assert.match(one, /photos\.length === 1 && photos\[0\]\.file && photos\[0\]\.hi === undefined\) photos\[0\]\.hi = await soloHi\(photos\[0\]\.file\)/, 'مرّة واحدة لكلّ صورة');
  assert.match(one, /if\(raw\.length > 1\)\{ payload\.imagesBase64/, 'عدّة صور كما كانت');
  assert.match(SRC, /photos\.push\(\{ dataUrl: dataUrl, mime: 'image\/jpeg', file: f \}\)/);
});
