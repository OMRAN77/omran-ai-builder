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
/* v-trends-faithful: streetfreestyle ← spanishrap، وlostfilm ← lostfilm80s (معاينة جديدة للمشهد الأصليّ) */
const OCT12 = ['tears', 'saveyourself', 'flyingcar', 'jetflyover', 'lostfilm80s', 'zombielove', 'standstill', 'sorryreveal',
  'spanishrap', 'orangebooth', 'petclap', 'gamechar'];
test('٧. الدفعة الثالثة (ترندات أكتوبر) موجودة — ٥٥ ← ٦٧، بلا أسماء أعمال أو فنّانين أو ألعاب حقيقيّة، والزومبي بلا دم', () => {
  const keys = D.trends.map((t) => t.key);
  assert.ok(keys.length >= 67, 'عدد الترندات نقص: ' + keys.length);
  OCT12.forEach((k) => assert.ok(keys.includes(k) && TRENDS[k], 'ترند ناقص: ' + k));
  assert.deepEqual(keys.slice(keys.indexOf(OCT12[0]), keys.indexOf(OCT12[0]) + 12), OCT12, 'متتالية بالترتيب'); // v-trends-oct-4: دفعة بعدها
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
  for (const k of ['sorryreveal', 'saveyourself', 'spanishrap']) assert.equal(D.trends.find((t) => t.key === k).maxPeople, 1, k);
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

/* v-trends-faithful (المالك: «مش الترند… مش الأغنية ولا نفس الحركات، هذي اختراع من عندك ولا التيسلا» ثمّ لقطة المقطع الأصليّ
   «Spain having an epic rap battle»): أربعة قوالب كانت مشهدًا مخترعًا يشبه الموجة لا الموجة نفسها — تُعاد على المقطع الأصليّ
   (بلا أسماء ولا كلمات ولا لحن حقيقيّ): الراب الإسبانيّ بتسلسله وحركة الكتف وراب إسبانيّ لا أصوات بلا كلمات؛ السيّارة بحركات عرض
   السيّارة الطائرة (نفّاثات غاز بارد، دحرجة في الهواء فوق شاحنة، نزول على العجلات)؛ فيلم الثمانينات برقصة أطراف الأصابع في الحظيرة
   قدّام أميرة خائفة؛ والاستوديو البرتقاليّ يتبادلان مقاطع راب. */
test('٨. ترندات أكتوبر على مقاطعها الأصليّة: الراب الإسبانيّ، السيّارة الطائرة، فيلم الثمانينات، الاستوديو البرتقاليّ', () => {
  const R = TRENDS.spanishrap.prompt;
  for (const re of [/red-lit restaurant entrance/, /portable speaker/, /film on their phones/, /freestyler raps a playful line at them first/,
    /improvised Spanish-language rap freestyle/, /lips synced/, /right shoulder up, then left, on every beat/, /point straight at the lens/, /pale-pink mesh/]) assert.match(R, re);
  assert.doesNotMatch(R, /wordless|sunglasses/, 'راب لا أصوات بلا كلمات، وبلا نظّارة تخفي العينين');
  const sr = D.trends.find((t) => t.key === 'spanishrap');
  assert.equal(sr.title.ar, 'الراب الإسباني'); assert.equal(sr.maxPeople, 1);
  assert.ok(require('../api/_lib/trend-people.js').SINGLE_SUBJECT_TRENDS.has('spanishrap'));
  const C = TRENDS.flyingcar.prompt;
  for (const re of [/cold-gas thruster jets/, /barrel turn in mid-air/, /semi-truck/, /lands smoothly back on its wheels/]) assert.match(C, re);
  assert.doesNotMatch(C, /flames/);
  const F = TRENDS.lostfilm80s.prompt;
  for (const re of [/1980s fantasy film/, /straw/, /spinning wheel/, /tiptoe dance/, /frightened young princess/]) assert.match(F, re);
  assert.doesNotMatch(F, /Arabian Nights|palace/);
  assert.match(TRENDS.orangebooth.prompt, /trade short rap verses/); assert.doesNotMatch(TRENDS.orangebooth.prompt, /wordless/);
  for (const k of ['spanishrap', 'lostfilm80s']) assert.ok(!TRENDS[k.replace('spanishrap', 'streetfreestyle').replace('lostfilm80s', 'lostfilm')], k + ': المفتاح القديم أُزيل');
});

/* v-trends-oct-4 (المالك بقائمة ترندات آخر أكتوبر: «حطهم في الترندات»، ثمّ «لا تغير أي شي، فقط اشتغل على الترندات»): +٤ بالمحرّك
   نفسه، كلّ قالب من وصف مصادره (بحث بأربعة باحثين) لا مشهد مخترع؛ بلا اسم أغنية أو فنّان أو شخصيّة تجاريّة في القالب. «جاوب بكلمة»
   و«الأكل» ليسا تأثيرًا من صورة، وRamalama قال المالك إنّه لا يناسب الجمهور — لم تُضف. */
const OCT4 = ['bbywow', 'invisiblebike', 'ceilingfan', 'slowmoentry'];
test('٩. ترندات آخر أكتوبر الأربعة: آخر القائمة، ١٤ لغة، صورة واحدة، تصنيفها على Omni، وبلا أسماء حقيقيّة', () => {
  const keys = D.trends.map((t) => t.key);
  assert.ok(keys.length >= 71, 'عدد الترندات: ' + keys.length);
  assert.deepEqual(keys.slice(-4), OCT4, 'آخر القائمة بالترتيب');
  const TP = require('../api/_lib/trend-people.js');
  const BANNED = /\b(Crazy Frog|Axel|Weeknd|Kendrick|Pray For Me|ChatGPT|TikTok|CapCut|Viggle|Shaba|LOS MENOR3S|STAFF)\b/i;
  for (const k of OCT4) {
    const c = D.trends.find((t) => t.key === k);
    assert.ok(TRENDS[k], k + ': قالب الخادم');
    assert.equal(c.engine, 'veo'); assert.equal(c.scenes, 1); assert.equal(c.photo, 'req'); assert.equal(c.maxPeople, 1, k + ': صورة واحدة');
    assert.ok(TP.SINGLE_SUBJECT_TRENDS.has(k), k + ': شخص واحد على الخادم');
    assert.doesNotMatch(TRENDS[k].prompt + ' ' + TRENDS[k].preview.frame, BANNED, k);
    assert.ok(TRENDS[k].prompt.length <= 700, k + ': طول القالب ' + TRENDS[k].prompt.length);
    for (const l of LANGS) {
      assert.ok(c.title[l] && c.sub[l], k + '/' + l + ': نصّ ناقص');
      assert.doesNotMatch(c.title[l] + ' ' + c.sub[l], BANNED, k + '/' + l);
      assert.doesNotMatch(c.title[l] + c.sub[l], /[\u200c\u200d]/, k + '/' + l + ': حرف رابط خفيّ');
    }
    assert.doesNotMatch(c.title.hi + c.sub.hi, /तुम/); assert.doesNotMatch(c.title.bn + c.sub.bn, /তুমি|তোমা/); assert.doesNotMatch(c.title.ne + c.sub.ne, /तिमी|तिम्रो/);
    assert.doesNotMatch(c.title.ml + c.sub.ml, /(^|\s)നീ(\s|$)|നിന്റെ|നിന്നെ/);
  }
  /* الراقص والدرّاجة والدخلة = إطار شخص في المشهد؛ المروحة = اللبس يتبدّل أثناء الفيديو (إطاره قبل التبديل، بلا قفل الإطار) */
  for (const k of ['bbywow', 'invisiblebike', 'slowmoentry']) assert.ok(TP.SOLO_FRAME_TRENDS.has(k), k);
  assert.ok(TP.OMNI_MORPH_TRENDS.has('ceilingfan') && !TP.SOLO_FRAME_TRENDS.has('ceilingfan'));
  assert.match(TRENDS.ceilingfan.prompt, /blade sweeps fully across the lens their outfit changes/);
  assert.match(TRENDS.bbywow.prompt, /bite of the bun on the beat/); assert.match(TRENDS.bbywow.prompt, /deadpan stare/);
  assert.match(TRENDS.invisiblebike.prompt, /invisible handlebars, nothing at all beneath them/);
  assert.match(TRENDS.slowmoentry.prompt, /slow-motion entrance/);
});
