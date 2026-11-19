// tests/portrait-variety.test.cjs — v-pstyle-variety (المالك ٧ نوفمبر ٢٠٢٦):
// «في انماط الصور اذا اخترت صوره معينه شكل واحد… مثال ليلة الحناء او رياضي… حتى لو اخترت 1 او 2 مافي تنوع.
//  اريد في كل شخصيه على الاقل 100 شكل في الصوره على نفس النمط».
// الجذر: كلّ نمط جملة ثابتة في STYLE_PROMPTS، فالأمر نفسه حرفيًّا في كلّ ضغطة. هنا يُشغَّل المعالج الحقيقيّ
// (api/_lib/portrait-style.js) بـfetch مزيّف ويُفحص ما يصل النموذج فعلًا بين ضغطتين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jpeg = require('jpeg-js');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function photo(w, h) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = (i / 4) % 251; data[i + 1] = 90; data[i + 2] = 140; data[i + 3] = 255; }
  return jpeg.encode({ width: w, height: h, data }, 90).data.toString('base64');
}
const PHOTO = photo(320, 420);

process.env.GEMINI_API_KEY = 'test-gemini';
process.env.PSTYLE_FACE_CROP = 'off'; // لقطة الوجه خارج موضوع الملفّ — نداء الكشف لا يغيّر نصّ الأمر المفحوص هنا
for (const k of ['IMAGE_VERIFY', 'IMAGE_CAPTION', 'MERGE_FACE_CROPS']) delete process.env[k];
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/_portraitUsage.js', {
  PORTRAIT_DAILY_LIMIT: 3,
  checkPortraitQuota: async () => ({ allowed: true, username: 'omran' }),
  consumePortrait: async () => 2,
});
const handler = require(rp('api/_lib/portrait-style.js'));
const V = require(rp('api/_lib/portrait-variety.js'));

async function run(style, extra) {
  let gen = null;
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    const b = JSON.parse(init.body);
    const parts = b.contents[b.contents.length - 1].parts;
    if (u.includes('image')) {
      gen = { cfg: b.generationConfig, text: parts.filter((p) => p.text).map((p) => p.text).join('\n') };
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'UkVTVUxU' } }] } }] });
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sourceIsPhotograph: true, resultIsPhotograph: true, sameVisualMedium: true, identityPreserved: true, onlyRequestedChange: true }) }] } }] });
  };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
  try {
    await handler({ method: 'POST', body: Object.assign({ imageBase64: PHOTO, mimeType: 'image/jpeg', style, token: 't' }, extra || {}) }, res);
  } finally { global.fetch = save; }
  return { status, json, gen };
}

const STYLES = Object.keys(handler.STYLE_PROMPTS);
const OCCASIONS = ['eid', 'national', 'ramadan', 'hajj', 'birthday', 'newborn', 'henna', 'firstday', 'flagday'];
const ERAS = ['1920s', '1950s', '1980s', '1990s', 'medieval', 'future'];
const PROFS = ['doctor', 'pilot', 'police', 'chef', 'engineer', 'teacher', 'firefighter', 'scientist'];
// التعديلات الأمينة: ما يحدّده المستخدم أو يُصلَح بأمانة لا يُنوَّع
const FAITHFUL = Object.keys(handler.EDIT_PROMPTS).concat(['removebg', 'hairstyle', 'outfit', 'ageshift', 'beautify', 'objectremove', 'familystyle', 'merge2', 'avatargif', 'adposter', 'celebtoon']);

test('١. كلّ نمط «شكل» (الـ٧٢، وكلّ حقبة ومهنة) له ≥١٠٠ شكل، والتعديلات الأمينة بلا كتالوج', () => {
  assert.equal(STYLES.length, 72);
  for (const s of STYLES) assert.ok(V.totalFor(s) >= 100, s + ': ' + V.totalFor(s));
  for (const era of ERAS) assert.ok(V.totalFor('timeshift', { era }) >= 100, era);
  for (const profession of PROFS) assert.ok(V.totalFor('profession', { profession }) >= 100, profession);
  for (const s of FAITHFUL) assert.equal(V.lookFor({ style: s, variant: 5 }), null, s + ' تعديل أمين — لا تنويع');
  // الحقبة والمهنة في الكتالوج هي نفسها في الخادم (ERA_MAP وPROF_MAP)
  const src = read('api/_lib/portrait-style.js');
  for (const era of ERAS) assert.ok(src.includes((/^\d/.test(era) ? "'" + era + "'" : era) + ':'), 'ERA_MAP: ' + era);
  for (const p of PROFS) assert.ok(src.includes('        ' + p + ': '), 'PROF_MAP: ' + p);
});

test('٢. العدّاد يمرّ على كلّ أشكال النمط قبل أن يتكرّر، والمحور الأوّل يتغيّر في كلّ ضغطة', () => {
  for (const s of ['henna', 'sportshero', 'anime', 'cyberpunk', 'gulf']) {
    const total = V.totalFor(s);
    const seen = new Set();
    let prev = null;
    for (let n = 0; n < total; n++) {
      const l = V.lookFor({ style: s, variant: n });
      seen.add(l.index);
      if (prev) assert.notEqual(l.parts[0], prev.parts[0], s + ' n=' + n + ': المحور الأوّل لم يتغيّر');
      prev = l;
    }
    assert.equal(seen.size, total, s + ': شكل تكرّر قبل نفاد الأشكال');
  }
  // عميل قديم بلا عدّاد: رقم عشوائيّ لا الشكل الأوّل دائمًا
  const firsts = new Set(Array.from({ length: 20 }, () => V.lookFor({ style: 'henna' }).index));
  assert.ok(firsts.size > 1, 'بلا عدّاد يجب أن يتنوّع');
});

test('٣. ضغطتان على «ليلة الحنّاء» و«رياضي/بطل» و«أنيمي» = أمران مختلفان يصلان النموذج، والهويّة والإطار كما هما', async () => {
  for (const s of ['henna', 'sportshero', 'anime']) {
    const a = await run(s, { variant: 1000 }), b = await run(s, { variant: 1001 });
    assert.equal(a.status, 200, s); assert.equal(b.status, 200, s);
    assert.notEqual(a.gen.text, b.gen.text, s + ': الأمر نفسه حرفيًّا في ضغطتين');
    const la = V.lookFor({ style: s, variant: 1000 });
    assert.ok(a.gen.text.includes(la.text), s + ': سطر الشكل لم يصل النموذج');
    assert.deepEqual(a.json.look, { n: la.index + 1, total: la.total }, s + ': رقم الشكل في الردّ');
    // قفل الإطار في الأمرين
    assert.match(a.gen.text, /FRAMING \(mandatory\)/);
  }
  // الفنّيّ: فقرة الهويّة أوّلًا، وسطر الشكل داخل المهمّة بعد وصف النمط، وتذكير الهويّة آخرًا
  const art = (await run('anime', { variant: 7 })).gen.text;
  assert.ok(art.startsWith('This photo shows one real person.'), 'فقرة الهويّة أوّلًا');
  assert.ok(art.indexOf("This image's specific look") > art.indexOf('TASK: redraw this same person in'), 'الشكل بعد المهمّة');
  assert.ok(art.indexOf("This image's specific look") < art.indexOf('IDENTITY (mandatory)'), 'تذكير الهويّة يبقى بعد الشكل');
  // الإطار: الشخص والخلفيّة لا يُمسّان، والزخرفة بلا كتابة، والحرارة المنخفضة كما هي
  const h = await run('henna', { variant: 3 });
  assert.match(h.gen.text, /keep the person completely unchanged/);
  assert.match(h.gen.text, /Frame design for this image: [^\n]*decorated with [^\n]*, with no text or lettering\./);
  assert.equal(h.gen.cfg.temperature, 0.15);
});

test('٤. الزمن والمهنة: مشهد محدّد لكلّ حقبة/مهنة، والتعديلات الأمينة أمرها لم يتغيّر حرفًا', async () => {
  const ts = await run('timeshift', { era: '1920s', variant: 4 });
  assert.match(ts.gen.text, /taken in the 1920s era[^\n]*Scene for this image: scene: /);
  const pr = await run('profession', { profession: 'chef', variant: 4 });
  assert.match(pr.gen.text, /restyle the person as a professional chef[^\n]*Scene for this image: setting: /);
  for (const s of ['passport', 'restore', 'colorize', 'upscale', 'bokeh']) {
    const x = await run(s, { variant: 1 }), y = await run(s, { variant: 999 }), z = await run(s);
    assert.equal(x.gen.text, y.gen.text, s + ': العدّاد غيّر أمر تعديل أمين');
    assert.equal(x.gen.text, z.gen.text, s);
    assert.doesNotMatch(x.gen.text, /specific look|Scene for this image|Frame design/, s);
    assert.equal(x.json.look, undefined, s);
  }
});

test('٥. الكتالوج لا يمسّ الوجه ولا الشعر ولا غطاء الرأس، ولا ماركات ولا كتابة بلا منع', () => {
  const all = [];
  for (const group of [V.ART, V.THEMED, V.OCCASION, V.ERA, V.PROFESSION]) {
    for (const k of Object.keys(group)) for (const ax of group[k]) for (const o of ax[1]) all.push([k, o]);
  }
  assert.ok(all.length > 1000);
  for (const [k, o] of all) {
    assert.doesNotMatch(o, /\b(face|faces|facial|hair|hijab|headscarf|crown|hat|helmet|turban|makeup|skin|eyes?|gaze|smile|beard)\b/i, k + ': «' + o + '» يمسّ الشخص');
    assert.doesNotMatch(o, /disney|pixar|ghibli|lego|nasa|nike|adidas|marvel|warhol|van gogh|monet|hokusai/i, k + ': اسم ماركة/فنّان');
    // ما قد يستدعي كتابة (ملصق، عبوة، لافتة، بطاقة) يُختم بمنعها
    if (/\b(posters?|backing|box|sign|banner|card)\b/i.test(o)) assert.match(o, /no text|no letters|no logos/i, k + ': «' + o + '» قد يُكتب عليه');
  }
});

test('٦. العميل: عدّاد لكلّ نمط (وحقبة/مهنة) يُرسَل ويتقدّم، وسطر «التصميم رقم» من النصّ القائم بالـ١٤ لغة، والحزمة مبنيّة', () => {
  const src = read('js/app-12-studios.js');
  assert.match(src, /variant: psNextVariant\(psVariantKey\(\)\), token \}\),/);
  assert.match(src, /map\[k\] = n \+ 1;/);
  assert.match(src, /if\(v === 'timeshift' && \$\('#portraitEraSelect'\)\) return v \+ ':' \+ \$\('#portraitEraSelect'\)\.value;/);
  assert.match(src, /const lookLine = psLookLine\(data\.look\);/);
  assert.match(src, /const tpl = t\('fxDesignNo'\);/);
  // المفتاح القائم بالـ١٤ لغة بعنصريه النائبين — لا نصّ جديد
  const i18n03 = read('js/app-03-i18n-data.js');
  assert.equal((i18n03.match(/\bfxDesignNo: "/g) || []).length, 2);
  for (const lg of ['fr', 'es', 'tr', 'ru', 'id', 'fil', 'hi', 'ur', 'bn', 'ne', 'ml', 'zh']) {
    const m = read('i18n/' + lg + '.js').match(/fxDesignNo: "([^"]*)"/);
    assert.ok(m && m[1].includes('{n}') && m[1].includes('{total}'), lg); // الترتيب يتبع اللغة (التركيّة: {total} قبل {n})
  }
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("const PS_VARIANT_KEY = 'aiapp_portrait_variant';"), 'الحزمة قديمة — npm run bundle');
});
