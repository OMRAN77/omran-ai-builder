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
