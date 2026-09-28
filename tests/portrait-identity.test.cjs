// tests/portrait-identity.test.cjs — v-pstyle-identity (٢٨ سبتمبر ٢٠٢٦).
// المالك: «في أنماط الصور تغيّر الشخصيّة» — يرفع صورته ويختار نمطًا فنّيًّا فيخرج شخص آخر.
// هنا يُشغَّل معالج api/_lib/portrait-style.js الحقيقيّ بـfetch مزيّف، ويُفحص ما يصل النموذج فعلًا:
// نصّ الأمر (ترتيب فقرة الهويّة، ورخصة إعادة رسم الوجه) والحرارة لكلّ صنف نمط.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));

function photo(w, h) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    data[o] = (x * 7) % 256; data[o + 1] = (y * 5) % 256; data[o + 2] = 120; data[o + 3] = 255;
  }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
const PHOTO = photo(320, 420);

process.env.GEMINI_API_KEY = 'test-gemini';
for (const k of ['IMAGE_VERIFY', 'IMAGE_CAPTION', 'MERGE_FACE_CROPS']) delete process.env[k];
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/_portraitUsage.js', {
  PORTRAIT_DAILY_LIMIT: 3,
  checkPortraitQuota: async () => ({ allowed: true, username: 'omran' }),
  consumePortrait: async () => 2,
});
const handler = require(rp('api/_lib/portrait-style.js'));

/* يشغّل المعالج الحقيقيّ ويعيد نداء التوليد (الأمر والأجزاء والإعدادات).
   faces: صناديق الوجوه التي يرجعها كاشف الوجوه المزيّف (أو 'http503' لمحاكاة تعطّله). الافتراضيّ: لا وجوه. */
async function run(style, extra, faces) {
  const calls = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    /* الكشف والحارس كلاهما على gemini-flash-latest — التفريق بمخطّط الردّ (box_2d) لا بالرابط */
    if (u.includes('gemini-flash-latest') && /box_2d/.test(init.body)) {
      calls.push({ kind: 'detect' });
      if (faces === 'http503') return new Response('{}', { status: 503 });
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ faces: (faces || []).map((box_2d) => ({ box_2d })) }) }] } }] });
    }
    const b = JSON.parse(init.body);
    const parts = b.contents[b.contents.length - 1].parts;
    if (u.includes('image')) {
      calls.push({ kind: 'gen', parts, cfg: b.generationConfig, text: parts.filter((p) => p.text).map((p) => p.text).join('\n') });
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'UkVTVUxU' } }] } }] });
    }
    /* الحارس (gemini-flash-latest): حكم يمرّ في كلّ الأحوال — موضوع هذا الملفّ ما يصل النموذج لا بوّابة الخروج.
       (حكم «ليس صورة فوتوغرافيّة» يرفض removebg بحقّ لأنّ allowStyleChange له false.) */
    calls.push({ kind: 'guard' });
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sourceIsPhotograph: true, resultIsPhotograph: true, sameVisualMedium: true, identityPreserved: true, onlyRequestedChange: true }) }] } }] });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  try {
    await handler({ method: 'POST', body: Object.assign({ imageBase64: PHOTO, mimeType: 'image/jpeg', style, token: 't' }, extra || {}) }, res);
  } finally { global.fetch = save; }
  const gen = calls.find((c) => c.kind === 'gen');
  return { status, json, gen, temp: gen && gen.cfg && gen.cfg.temperature, calls };
}

const ART = ['anime', 'disney', 'oil', 'sheikh', 'lego'];
const OCCASIONS = ['eid', 'national', 'ramadan', 'hajj', 'birthday', 'newborn', 'henna', 'firstday', 'flagday'];

test('١. النمط الفنّيّ: فقرة الهويّة أوّلًا، ولا رخصة لإعادة رسم الوجه، والأسلوب ما زال مطلوبًا', async () => {
  for (const style of ART) {
    const r = await run(style);
    assert.equal(r.status, 200, style);
    const p = r.gen.text;
    // الجذر (أ): الأمر كان يقول «fully re-render the entire image (face, clothes, and background)» فيأذن صراحةً بوجه جديد
    assert.doesNotMatch(p, /re-render the entire image \(face/, style + ': رخصة إعادة رسم الوجه ما زالت في الأمر');
    // صياغة الهويّة الصارمة المنقولة من قالب الدمج المثبَت (merge-identity.js)
    assert.match(p, /MUST be reproduced with full fidelity/, style + ': لا فقرة هويّة صارمة');
    assert.match(p, /never invented/, style);
    assert.match(p, /never averaged/, style);
    // الترتيب: الهويّة قبل المهمّة (v-merge-identity-lock-v2: نقلها للأوّل أوقف انقلاب الشخص)
    assert.ok(p.indexOf('MUST be reproduced') < p.indexOf('TASK:'), style + ': فقرة الهويّة بعد المهمّة');
    // وتذكير أخير بعد جملة الإطار — آخر ما يقرؤه النموذج
    assert.ok(/IDENTITY \(mandatory\)/.test(p), style + ': لا تذكير هويّة في آخر الأمر');
    assert.ok(p.lastIndexOf('IDENTITY (mandatory)') > p.lastIndexOf('FRAMING (mandatory)'), style + ': الإطار آخر ما يُقرأ لا الهويّة');
    // الأسلوب نفسه لم يضعف: وصف النمط ما زال في الأمر، والحرارة كما كانت
    assert.match(p, /TASK: redraw/, style);
    assert.equal(r.temp, 0.65, style + ': حرارة الأسلوب الفنّيّ تغيّرت');
    // الصورة الكاملة تُرسل، والإطار محفوظ (v-keep-framing)
    assert.equal(r.gen.parts.filter((x) => x.inlineData).length, 1, style);
    assert.match(p, /FRAMING \(mandatory\)/, style);
  }
});

test('٢. إطارات المناسبات وإزالة الخلفيّة: أمرها يقول «لا تغيّر الشخص» فحرارتها ٠٫١٥ لا ٠٫٦٥', async () => {
  for (const style of OCCASIONS.concat(['removebg'])) {
    const r = await run(style, style === 'removebg' ? { backdrop: 'studio_white' } : null);
    assert.equal(r.status, 200, style);
    assert.equal(r.temp, 0.15, style + ': ما زالت بحرارة الأسلوب الفنّيّ رغم أنّها لا تغيّر الشخص');
    // وتكتسب قاعدة حفظ وسيط المصدر: تبقى صورة فوتوغرافيّة، الزخرفة في الإطار وحده
    assert.match(r.gen.text, /Preserve the source image medium and visual style exactly/, style);
  }
});

test('٣. التعديل الموضعيّ والدمج كما كانا: ٠٫١٥، والدمج وحده يأخذ لقطات الوجوه', async () => {
  for (const style of ['bokeh', 'hairstyle', 'beautify', 'outfit']) {
    const r = await run(style, { hairStyle: 'short_black', outfit: 'suit' });
    assert.equal(r.temp, 0.15, style);
    assert.match(r.gen.text, /Preserve the source image medium/, style);
    assert.doesNotMatch(r.gen.text, /TASK: redraw/, style + ': أخذ أمر الأسلوب الفنّيّ بالخطأ');
  }
  // الدمج: القالب الآخر (مسار mergeParts) — لا يتأثّر بهذا التغيير
  const m = await run('merge2', { extraImages: [PHOTO] });
  assert.equal(m.temp, 0.15);
  assert.match(m.gen.text, /You are given \d+ separate reference images/);
});

test('٤. تثبيت: أصناف الأنماط الثلاثة لها حرارتان اثنتان لا أكثر، والقائمة سطر واحد', () => {
  const src = require('node:fs').readFileSync(path.join(root, 'api/_lib/portrait-style.js'), 'utf8');
  assert.match(src, /temperature: \(isLocalizedEdit \|\| isMultiSourceComposition\) \? 0\.15 : 0\.65/, 'سطر الحرارة لم يُمسّ');
  const at = src.indexOf('const isLocalizedEdit');
  const line = src.slice(at, src.indexOf('\n', at));
  assert.match(line, /\['hairstyle',/, 'القائمة تبدأ بـhairstyle (تثبيت image-prompt)');
  for (const s of OCCASIONS.concat(['removebg', 'outfit', 'eyefix', 'glasses', 'bokeh'])) {
    assert.ok(line.includes("'" + s + "'"), s + ' خارج قائمة isLocalizedEdit');
  }
});

/* ── v-pstyle-closeup: لقطة وجه مرجعيّة للأسلوب الفنّيّ المفرد ──
   PHOTO = ٣٢٠×٤٢٠؛ الصندوق [60,448,180,552] بمقياس جيميناي (٠–١٠٠٠) = وجه ارتفاعه ١٢٪ (٥٠٫٤ بكسل):
   فوق حدّ ٣٢، ودون عتبة الإسقاط ٤٥٪ (١٨٩) — أي صورة «واقف كامل» تمامًا كصورة المالك. */
const FULL_BODY_FACE = [[60, 448, 180, 552]];

test('٥. واقف كامل: لقطة الوجه تُرسل مرجعًا ثانيًا بعنوان يمنع «شخصًا ثانيًا»، والإطار والحرارة كما هما', async () => {
  const r = await run('anime', null, FULL_BODY_FACE);
  assert.equal(r.status, 200);
  assert.ok(r.calls.some((c) => c.kind === 'detect'), 'لم يُستدعَ كاشف الوجوه');
  const parts = r.gen.parts;
  assert.equal(parts.filter((x) => x.inlineData).length, 2, 'المرجع الثاني (اللقطة) لم يُرسل');
  assert.deepEqual(parts.map((x) => (x.text ? 'text' : 'img')), ['text', 'img', 'text', 'img', 'text'], 'ترتيب الأجزاء');
  // اللقطة قصّة مربّعة من الصورة لا الصورة نفسها
  assert.notEqual(parts[3].inlineData.data, PHOTO);
  assert.equal(parts[3].inlineData.mimeType, 'image/jpeg');
  const crop = jpeg.decode(Buffer.from(parts[3].inlineData.data, 'base64'));
  assert.equal(crop.width, crop.height, 'اللقطة ليست مربّعة');
  assert.ok(crop.width >= 48 && crop.width < 320, 'مقاس اللقطة ' + crop.width);
  // عنوانها يمنع «شخصًا ثانيًا»، وقواعدها تمنع الانجرار للواقعيّة
  assert.match(parts[2].text, /NOT a second person/);
  assert.match(parts[2].text, /identity reference only/);
  assert.match(parts[4].text, /do NOT copy its photographic realism/);
  assert.match(parts[4].text, /exactly one person/);
  // لا إعادة استعمال لقالب الدمج
  assert.doesNotMatch(r.gen.text, /photorealistic/i);
  assert.doesNotMatch(r.gen.text, /You are given \d+ separate reference images/);
  // الهويّة آخر ما يُقرأ، ومرّة واحدة لا مرّتين
  assert.ok(parts[parts.length - 1].text.trimEnd().endsWith('their real features win.'));
  assert.ok(r.gen.text.lastIndexOf('IDENTITY (mandatory)') > r.gen.text.lastIndexOf('FRAMING (mandatory)'));
  assert.equal(r.gen.text.split('IDENTITY (mandatory)').length, 2, 'تذكير الهويّة مكرّر');
  // v-keep-framing: النسبة مفروضة من الصورة الأصليّة لا من مربّع اللقطة
  assert.equal(r.gen.cfg.imageConfig.aspectRatio, '3:4');
  assert.equal(r.gen.cfg.imageConfig.imageSize, '2K');
  assert.equal(r.temp, 0.65, 'الحرارة لم تُمسّ');
});

test('٦. الإطفاء والفشل الآمن وحدود المسار: كلّ حالة ترجع للسلوك السابق حرفيًّا', async () => {
  const base = (await run('anime')).gen;
  const same = (g, why) => {
    assert.equal(g.parts.filter((x) => x.inlineData).length, 1, why + ': أُرسلت لقطة');
    assert.equal(g.cfg.imageConfig.aspectRatio, undefined, why + ': فُرضت نسبة');
    assert.equal(g.text, base.text, why + ': النصّ تغيّر');
  };
  // مفتاح الإطفاء: صفر نداء كشف وصفر كلفة
  process.env.PSTYLE_FACE_CROP = 'off';
  const off = await run('anime', null, FULL_BODY_FACE);
  delete process.env.PSTYLE_FACE_CROP;
  same(off.gen, 'الإطفاء');
  assert.ok(off.calls.every((c) => c.kind !== 'detect'), 'الإطفاء: نودي الكاشف');
  // تعطّل الكشف (٥٠٣) أو لا وجه: السلوك السابق حرفيًّا
  same((await run('anime', null, 'http503')).gen, 'تعطّل الكشف');
  same((await run('anime', null, [])).gen, 'لا وجه');
  // صورة جماعيّة (٣ وجوه متقاربة) — بوّابة faceCrops
  same((await run('anime', null, [[60, 200, 180, 304], [60, 448, 180, 552], [60, 700, 180, 804]])).gen, 'جماعيّة');
  // وجهان: لقطة أحدهما تسحب ملامحه إلى الآخر — لا لقطة
  same((await run('anime', null, [[60, 300, 180, 404], [60, 600, 180, 704]])).gen, 'وجهان');
  // وجه يملأ الصورة (≥٤٥٪): الموديل يراه أصلًا
  same((await run('anime', null, [[100, 200, 900, 800]])).gen, 'وجه قريب');
  // المسارات الأخرى لا تدفع كلفة كشف إطلاقًا
  for (const style of ['bokeh', 'eid', 'removebg']) {
    const r = await run(style, { backdrop: 'studio_white' }, FULL_BODY_FACE);
    assert.ok(r.calls.every((c) => c.kind !== 'detect'), style + ': نودي الكاشف بلا داعٍ');
  }
  // الدمج على مساره القديم بنصّه المثبَّت
  const m = await run('merge2', { extraImages: [PHOTO] }, FULL_BODY_FACE);
  assert.match(m.gen.text, /You are given \d+ separate reference images/);
});
