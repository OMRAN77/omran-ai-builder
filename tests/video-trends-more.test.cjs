'use strict';
/* v-trends-more (طلب المالك ٢٤ سبتمبر: «أريد أفكار الفيديوهات — في الفيديوهات تزيد عليها»).
   بطاقات الترندات في العميل (js/app-11-video-trends-data.js) وقوالب الأوامر في الخادم
   (api/_lib/video-trends.js) ملفّان منفصلان: بطاقة بلا قالب = زرّ يفتح ثمّ يفشل، وقالب بلا
   بطاقة = عمل ميّت. هذا الاختبار يشدّهما معًا، ويحرس اكتمال الـ14 لغة. */
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../js/app-11-video-trends-data.js');
const D = global.window.__VIDEO_TRENDS;
const { TRENDS, buildTrendPrompt } = require('../api/_lib/video-trends.js');
const LANGS = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ml', 'ne', 'fil', 'id', 'zh', 'ru', 'tr', 'es'];

test('١. كلّ بطاقة ترند لها قالب على الخادم، والعكس', () => {
  const cards = D.trends.map((t) => t.key);
  assert.equal(new Set(cards).size, cards.length, 'مفتاح ترند مكرَّر');
  const server = Object.keys(TRENDS);
  assert.deepEqual(cards.filter((k) => !TRENDS[k]), [], 'بطاقة بلا قالب');
  assert.deepEqual(server.filter((k) => !cards.includes(k)), [], 'قالب بلا بطاقة');
  assert.ok(cards.length >= 45, 'عدد الترندات نقص: ' + cards.length);
});

test('٢. البطاقة والقالب متّفقان على النسبة وحاجة الصورة ونوع المدخل', () => {
  for (const t of D.trends) {
    const s = TRENDS[t.key];
    assert.equal(s.ratio, t.ratio, 'نسبة مختلفة في ' + t.key);
    assert.equal(s.photo, t.photo, 'حاجة الصورة مختلفة في ' + t.key);
    assert.equal(s.kind, t.kind, 'نوع المدخل مختلف في ' + t.key);
    assert.ok(['req', 'opt', 'none'].includes(t.photo), 'قيمة photo غريبة في ' + t.key);
    assert.ok(['none', 'name', 'sentence', 'scene', 'product', 'change', 'setting'].includes(t.kind),
      'نوع مدخل بلا عنوان في الواجهة: ' + t.key + ' → ' + t.kind);
    assert.ok(D.ui['k_' + t.kind] || t.kind === 'none', 'لا عنوان واجهة لنوع ' + t.kind);
  }
});

test('٣. كلّ ترند بعنوان ووصف في الـ١٤ لغة', () => {
  for (const t of D.trends) for (const l of LANGS) {
    assert.ok(t.title && t.title[l], 'عنوان ناقص: ' + t.key + '/' + l);
    assert.ok(t.sub && t.sub[l], 'وصف ناقص: ' + t.key + '/' + l);
  }
});

test('٤. كلّ قالب يبني أمرًا فعليًّا، ولكلّ ترند إطار معاينة', () => {
  for (const [k, s] of Object.entries(TRENDS)) {
    assert.ok(s.preview && s.preview.frame && s.preview.frame.length > 20, 'إطار معاينة ناقص: ' + k);
    const out = buildTrendPrompt(k, { name: 'سالم', text: 'أهلًا بكم', hasImage: true, sceneIndex: 0 });
    assert.ok(out && out.prompt && out.prompt.length > 40, 'أمر فارغ: ' + k);
    assert.doesNotMatch(out.prompt, /\{(name|text|scene|i|look)\}/, 'رمز لم يُستبدل في ' + k);
    assert.ok(/^\d+:\d+$/.test(out.ratio), 'نسبة غير صالحة في ' + k);
  }
});

test('٥. ترندات الأعمال الجديدة موجودة — عقار وسيّارات ومطاعم ومناسبات', () => {
  const keys = D.trends.map((t) => t.key);
  ['realtour', 'carreveal', 'agentpitch', 'foodsizzle', 'buildprogress', 'testimonial', 'offercountdown',
    'graduation', 'newborn', 'wedding', 'ramadan', 'nationalday', 'familywave',
    'actionhero', 'paintingalive', 'miniature', 'underwater', 'weathershift', 'neonnight', 'calligraphy']
    .forEach((k) => assert.ok(keys.includes(k), 'ترند ناقص: ' + k));
});

/* v-trends-more-2 (المالك: «أريد أزيد في الفيديوهات — الترندات»): +١٠. */
test('٦. الدفعة الثانية من الترندات موجودة — ٤٥ ← ٥٥', () => {
  const keys = D.trends.map((t) => t.key);
  assert.ok(keys.length >= 55, 'عدد الترندات نقص: ' + keys.length);
  ['actionfigure', 'superhero', 'catwalk', 'animeaction', 'claymation', 'legofy', 'vhsflashback',
    'podcastclip', 'dayinlife', 'birthdaybash'].forEach((k) => assert.ok(keys.includes(k), 'ترند ناقص: ' + k));
});

/* v-trends-oct-12 (المالك ٢٥ أكتوبر بعد بحث الترندات الرائجة سبتمبر–أكتوبر ٢٠٢٦: «ضيف كلهم»): +١٢ — ٥٥ ← ٦٧. */
const OCT12 = ['tears', 'saveyourself', 'flyingcar', 'jetflyover', 'lostfilm', 'zombielove', 'standstill', 'sorryreveal',
  'streetfreestyle', 'orangebooth', 'petclap', 'gamechar'];
test('٧. الدفعة الثالثة (ترندات أكتوبر) موجودة — ٥٥ ← ٦٧، بلا أسماء أعمال أو فنّانين أو ألعاب حقيقيّة، والزومبي بلا دم', () => {
  const keys = D.trends.map((t) => t.key);
  assert.ok(keys.length >= 67, 'عدد الترندات نقص: ' + keys.length);
  OCT12.forEach((k) => assert.ok(keys.includes(k) && TRENDS[k], 'ترند ناقص: ' + k));
  assert.deepEqual(keys.slice(-12), OCT12, 'آخر القائمة بالترتيب');
  /* أسماء حقيقيّة تحرّكت عليها هذه الموجات — لا تُكتب في قالب ولا بطاقة */
  const BANNED = /\b(GTA|Grand Theft|Rockstar|Bulin|Kevin Wai|Quavo|Takeoff|Roadster|Tesla|Rumpelstiltskin|CapCut|Higgsfield|Pika|Kling|Hailuo|TikTok)\b/i;
  for (const k of OCT12) {
    const card = D.trends.find((t) => t.key === k);
    assert.equal(card.engine, 'veo'); assert.equal(card.scenes, 1);
    assert.doesNotMatch(TRENDS[k].prompt + ' ' + TRENDS[k].preview.frame, BANNED, k + ': اسم حقيقيّ في القالب');
    for (const l of LANGS) assert.doesNotMatch(card.title[l] + ' ' + card.sub[l], BANNED, k + '/' + l);
    for (const l of LANGS) assert.doesNotMatch(card.title[l] + card.sub[l], /[‌‍]/, k + '/' + l + ': حرف رابط خفيّ (PITFALLS)');
  }
  assert.match(TRENDS.zombielove.prompt, /no blood or gore/);
  assert.match(TRENDS.flyingcar.prompt, /no readable licence plate/);
  assert.match(TRENDS.gamechar.prompt, /no game name, no logos, no text/);
  /* مراجعة الدفعة: الزومبي لقطة واحدة بلا قطع للذكرى (قفل الإطار متّسق)، والاستوديو من الركبة (الوجه كبير في الإطار) */
  assert.doesNotMatch(TRENDS.zombielove.prompt, /\bcuts to\b|memory/);
  assert.match(TRENDS.orangebooth.prompt, /framed from the knees up/);
  assert.doesNotMatch(TRENDS.orangebooth.prompt, /full-body/);
  /* ترندا الشخص الواحد: خانة صورة واحدة بنصّ «اختر صورة» القائم (١٤ لغة) */
  for (const k of ['sorryreveal', 'saveyourself']) assert.equal(D.trends.find((t) => t.key === k).maxPeople, 1, k);
  const C = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app-11-video-trends.js'), 'utf8');
  assert.match(C, /var cap = t\.maxPeople \|\| MAX_PEOPLE;[^\n]*\n\s+if\(photos\.length >= cap\) return;/);
  assert.match(C, /fi\.multiple = cap > 1;/);
  assert.match(C, /\.slice\(0, cap - photos\.length\)/);
  assert.match(C, /plab\.textContent = \(t\.maxPeople === 1 \? ui\('photo'\) : ui\('people'\)\)/);
  /* صيغة المخاطبة في الهنديّة والأرديّة والبنغاليّة والنيباليّة والمليالميّة كبقيّة التطبيق (لا تُمْ/تمہ/তুমি/तिमी/നീ) */
  for (const k of OCT12) {
    const c = D.trends.find((t) => t.key === k);
    assert.doesNotMatch(c.title.hi + c.sub.hi, /तुम/, k + '/hi'); assert.doesNotMatch(c.title.ur + c.sub.ur, /تم(?:ہیں|ہارا|ہاری)?(?=\s|$)/, k + '/ur');
    assert.doesNotMatch(c.title.bn + c.sub.bn, /তুমি|তোমা/, k + '/bn'); assert.doesNotMatch(c.title.ne + c.sub.ne, /तिमी|तिम्रो/, k + '/ne');
    assert.doesNotMatch(c.title.ml + c.sub.ml, /(^|\s)നീ(\s|$)|നിന്റെ|നിന്നെ/, k + '/ml');
  }
});
