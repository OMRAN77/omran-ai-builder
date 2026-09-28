// tests/image-gpt-2.5.test.cjs — v-gpt-2.5 (٢٠ سبتمبر ٢٠٢٦): طلب المالك «رقّهم كلهم للأعلى
// مستوى» بعد معرفة أنّ OpenAI أصدرت GPT Image 2.5 (Sunburst للتعديل الدقيق، Flare للتوليد
// السريع) قبل هذا القرار بـ١٢ يومًا، وأنّ gpt-image-1 (المثبَّت وحده سابقًا في كل مسارات
// الإنقاذ) يُوقَف نهائيًّا ٢٣ أكتوبر ٢٠٢٦. كلود يبقى بعيدًا كليًّا عن توليد/تحرير الصور
// وكتابة النصّ عليها بطلب صريح من المالك — الصور فقط بين نانو (Gemini) وGPT.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mi = read('api/_lib/maha-image.js');
const pipeline = read('api/_lib/image-pipeline.js');

test('التعديل عبر GPT: يجرّب Sunburst الأحدث ثمّ gpt-image-2 فقط بلا الموديل الموقوف', () => {
  const i = mi.indexOf("const editModels = ['gpt-image-2.5-sunburst', 'gpt-image-2'];");
  assert.ok(i > 0, 'قائمة تدرّج موديلات التعديل موجودة بالترتيب الصحيح');
  const block = mi.slice(i, i + 3000); // v-safety-model-fallback: شرط رفض السلامة الجديد وسّع المسافة أكثر قبل continue
  assert.ok(!block.includes("form.append('input_fidelity'"), 'الموديلات الحديثة تفرض الأمانة وترفض input_fidelity');
  assert.ok(block.includes('modelUnavailable') && block.includes('continue'), 'ينتقل للموديل التالي عند 400/404 يذكر الموديل فقط');
});

test('التوليد عبر GPT: يجرّب Flare الأحدث ثمّ gpt-image-2 فقط بلا الموديل الموقوف', () => {
  assert.ok(mi.includes("const genModels = ['gpt-image-2.5-flare', 'gpt-image-2'];"), 'قائمة تدرّج موديلات التوليد بالترتيب الصحيح');
  assert.ok(!mi.includes("'gpt-image-1'"), 'الموديل الموقوف خرج من المسار الحيّ نهائيًّا');
});

test('نانو الاحتياطيّ (بعد فشل المحرّك الأساسيّ): Nano Banana 2 (gemini-3.1-flash-image) قبل ٢٫٥', () => {
  assert.ok(mi.includes("const models = ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'].filter("), 'الأحدث أوّلًا و٢٫٥ يبقى خط إنقاذ');
});

test('gpt-image-1 لم يعد المصدر الوحيد — لا يظهر مثبَّتًا بمفرده في أيّ نداء GPT حيّ', () => {
  assert.doesNotMatch(mi, /form\.append\('model', 'gpt-image-1'\);/, 'التعديل لم يعد يبدأ مباشرة بـgpt-image-1');
  assert.doesNotMatch(mi, /genOnce\('gpt-image-2'\);(?!.*gpt-image-2\.5)/s, 'التوليد لا يبدأ بـgpt-image-2 مباشرة بلا 2.5 قبله');
});

test('الخطّ الأساسيّ (برو) يبقى الأعلى مستوى من جوجل — بلا تغيير', () => {
  assert.match(mi, /const editModel = \(process\.env\.IMAGE_EDIT_MODEL \|\| 'gemini-3-pro-image'\)\.trim\(\);/);
  assert.match(mi, /const creativeModel = \(process\.env\.IMAGE_CREATIVE_MODEL \|\| 'gemini-3-pro-image'\)\.trim\(\);/);
});

test('image-pipeline.js (التجريبيّ خلف IMAGE_PIPELINE=1) محدَّث لنفس الموديل الأحدث', () => {
  assert.match(pipeline, /name: "gpt-image-2\.5-flare"/);
  assert.match(pipeline, /model: "gpt-image-2\.5-flare"/);
});

test('كلّ استوديوهات OpenAI المتخصّصة على 2.5: Sunburst للتعديل وFlare للتوليد', () => {
  const expected = {
    'api/_lib/studio-preview.js': ['gpt-image-2.5-flare'],
    'api/_lib/construction-view.js': ['gpt-image-2.5-flare'],
    'api/_lib/face-lock.js': ['gpt-image-2.5-sunburst'],
    'api/_lib/fashion-create.js': ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'],
    'api/_lib/image-merge.js': ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'],
    'api/_lib/design-create.js': ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'],
    'api/_lib/construction-create.js': ['gpt-image-2.5-flare'],
    'api/_lib/stamps.js': ['gpt-image-2.5-sunburst'],
    'api/_lib/studio-create.js': ['gpt-image-2.5-sunburst'],
    'api/_lib/adimage.js': ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'],
    'api/_lib/portrait-style.js': ['gpt-image-2.5-sunburst'],
  };
  for (const [file, models] of Object.entries(expected)) {
    const src = read(file);
    for (const model of models) assert.ok(src.includes(model), file + ': ' + model);
  }
});

test('لا كلود في مسار توليد/تحرير الصور الحيّ: لا anthropic ولا claude في maha-image.js', () => {
  assert.doesNotMatch(mi, /anthropic\.com|claudeClient|ANTHROPIC_API_KEY/, 'طلب المالك الصريح: الصور بين نانو وGPT فقط، كلود قوي بالكود لا بالصور');
});
