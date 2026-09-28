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

/* يشغّل المعالج الحقيقيّ ويعيد نداء التوليد (الأمر والأجزاء والإعدادات) */
async function run(style, extra) {
  const calls = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
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
