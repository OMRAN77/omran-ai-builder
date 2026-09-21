// tests/compare-drag-all.test.cjs — v-compare-drag-all (٢١ سبتمبر ٢٠٢٦): بعد تحسين سحب «أنماط الصور»
// طلب المالك «غيّرها» — نفس التحسين على بقيّة أدوات قبل/بعد: تصميم داخليّ (designBA)، أزياء
// (fashionAi)، استوديو (studioAi). كانت الثلاثة مقفلة بالكامل منذ v-no-slider (٤ سبتمبر) — اثنان
// منها (أزياء/استوديو) بجملة `if(true) return;` ميتة كليًّا. الحل نفسه: سحب مباشر بـPointer Events
// على حاوية الصورة، مقبض دائريّ مرئيّ، بلا عنصر <input type=range> مخفيّ منفصل.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const partials = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');
const studios = fs.readFileSync(path.join(root, 'js/app-12-studios.js'), 'utf8');
const stocksInit = fs.readFileSync(path.join(root, 'js/app-13-stocks-init.js'), 'utf8');
const bundle = fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8');

test('التصميم الداخليّ (designBA): لا input مخفيّ، مقبض جديد، وسحب مباشر على designBAWrap', () => {
  assert.doesNotMatch(partials, /id="designBARange"/, 'العنصر القديم أُزيل');
  assert.match(partials, /id="designBAHandle"/, 'المقبض الجديد موجود');
  for (const src of [studios, bundle]) {
    assert.doesNotMatch(src, /\bbaRange\b/, 'لا مرجع متبقٍّ لـbaRange');
    const i = src.indexOf("baWrap.addEventListener('pointerdown'");
    assert.ok(i > 0, 'سحب pointerdown على baWrap موجود');
    assert.match(src.slice(i, i + 500), /baWrap\.addEventListener\('pointermove'/, 'pointermove موصول أيضًا');
    assert.match(src, /baWrap\.style\.touchAction = 'none';/, 'touch-action محسوم لمنع تعارض تمرير الصفحة');
  }
});

test('الأزياء (fashionAi): لا input مخفيّ، مقبض جديد، ولا كود ميت خلف if(true) return', () => {
  assert.doesNotMatch(partials, /id="fashionAiSliderRange"/, 'العنصر القديم أُزيل');
  assert.match(partials, /id="fashionAiCompareHandle"/, 'المقبض الجديد موجود');
  for (const src of [studios, bundle]) {
    assert.doesNotMatch(src, /sliderRange/, 'لا مرجع متبقٍّ لـsliderRange في نطاق الأزياء');
    const i = src.indexOf('function setupBeforeAfter(afterUrl)');
    assert.ok(i > 0, 'setupBeforeAfter(afterUrl) موجودة (الأزياء)');
    const block = src.slice(i, i + 900);
    assert.doesNotMatch(block, /if\(true\) return;/, 'لا كود ميت يقفل الميزة كليًّا بعد الآن');
    assert.match(block, /updateSliderClip\(50\);/, 'الافتراضي يبدأ منتصفًا كما كان الشريط الأصليّ');
  }
});

test('الاستوديو (studioAi): لا input مخفيّ، مقبض جديد، ولا كود ميت خلف if(true) return', () => {
  assert.doesNotMatch(partials, /id="studioAiSliderRange"/, 'العنصر القديم أُزيل');
  assert.match(partials, /id="studioAiCompareHandle"/, 'المقبض الجديد موجود');
  for (const src of [stocksInit, bundle]) {
    assert.doesNotMatch(src, /sliderRange/, 'لا مرجع متبقٍّ لـsliderRange في نطاق الاستوديو');
    const i = src.indexOf('function setupBeforeAfter()');
    assert.ok(i > 0, 'setupBeforeAfter() موجودة (الاستوديو)');
    const block = src.slice(i, i + 900);
    assert.doesNotMatch(block, /if\(true\) return;/, 'لا كود ميت يقفل الميزة كليًّا بعد الآن');
  }
});

test('لا وجود لأيّ من عناصر <input type=range> الأربعة القديمة في partials-core.js أو الحزمة', () => {
  for (const src of [partials, bundle]) {
    assert.doesNotMatch(src, /id="portraitCompareSlider"|id="designBARange"|id="fashionAiSliderRange"|id="studioAiSliderRange"/);
  }
});
