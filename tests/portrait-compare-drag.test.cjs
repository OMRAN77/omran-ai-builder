// tests/portrait-compare-drag.test.cjs — v-compare-drag (٢١ سبتمبر ٢٠٢٦): المالك أكّد أنّ شريط قبل/بعد
// في «أنماط الصور» «كان ما يشتغل قبل» (v-slider-touch سابقًا: يتحوّل لتمرير الصفحة على الجوال) قبل أن
// يُطفأ كليًّا بـv-no-slider، وطلب استعادته «بطريقة سحب محسّنة». الحلّ: مقبض دائريّ فوق الصورة نفسها،
// سحب مباشر بـPointer Events على حاوية المقارنة (لا عنصر <input type=range> منفصل تحتها كان يتصادم مع
// تمرير الصفحة باللمس). هذا الاختبار يقفل أنّ العنصر القديم زال فعلًا وأنّ آليّة السحب الجديدة موصولة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

for (const file of ['js/app-12-studios.js', 'js/app.bundle.js']) {
  test(file + ': لا وجود متبقٍّ لعنصر compareSlider القديم (المُستبدَل بالسحب المباشر)', () => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(src, /compareSlider/, 'لا مرجع متبقٍّ لـcompareSlider في ' + file);
  });
}

test('js/partials-core.js: عنصر <input type=range id=portraitCompareSlider> أُزيل من الصفحة، ومقبض السحب موجود بدله', () => {
  const src = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');
  assert.doesNotMatch(src, /id="portraitCompareSlider"/, 'العنصر القديم غير موجود في partials-core.js');
  assert.match(src, /id="portraitCompareHandle"/, 'مقبض السحب الجديد فوق الصورة موجود');
});

test('js/app-12-studios.js: السحب المباشر (pointerdown/move/up) موصول بحاوية المقارنة نفسها، وtouch-action محسوم', () => {
  const src = fs.readFileSync(path.join(root, 'js/app-12-studios.js'), 'utf8');
  const i = src.indexOf('function setComparePct');
  assert.ok(i > 0, 'setComparePct موجودة');
  const block = src.slice(i, i + 1600);
  assert.match(block, /compareWrap\.style\.touchAction = 'none';/, 'يمنع تحويل السحب الأفقي إلى تمرير صفحة على الجوال');
  assert.match(block, /compareWrap\.addEventListener\('pointerdown'/, 'يبدأ السحب من أيّ نقطة على الصورة');
  assert.match(block, /compareWrap\.addEventListener\('pointermove'/, 'يتابع السحب أثناء التحريك');
  assert.match(block, /setPointerCapture/, 'يبقي السحب متصلًا حتى خارج حدود الصورة');
});

test('js/app-12-studios.js: نتيجة التوليد تستدعي setComparePct(100) لا كودًا يعتمد على compareSlider', () => {
  const src = fs.readFileSync(path.join(root, 'js/app-12-studios.js'), 'utf8');
  assert.match(src, /compareWrap\.style\.display = 'block';\s*\n\s*setComparePct\(100\);/, 'الناتج الجديد يُظهر «بعد» كاملًا افتراضيًّا عبر setComparePct لا compareSlider.value');
});

test('css/tokens.css: قاعدة إخفاء الأشرطة المشتركة (v-no-slider) أُزيلت بالكامل — v-compare-drag-all طبّقت السحب على الأربعة كلّها', () => {
  const src = fs.readFileSync(path.join(root, 'css/tokens.css'), 'utf8');
  assert.doesNotMatch(src, /#portraitCompareSlider|#designBARange|#fashionAiSliderRange|#studioAiSliderRange/, 'لا مرجع لأيّ من عناصر input المُزالة الأربعة');
});
