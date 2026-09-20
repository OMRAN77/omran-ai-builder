// tests/image-lanes.test.cjs — v-lanes (٢٠ سبتمبر ٢٠٢٦): بعد فحص مسار الصور من الصفر — «نتيجة قويّة بضربة وحدة»:
// قرار واحد، ثلاثة مسارات، نداء واحد للمحرّك، بلا حكم ولا مرشّح ثانٍ ولا حارس رافض ولا فحص وإعادة ولا مصنّفات ذكاء.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mi = read('api/_lib/maha-image.js');

test('١. الطبقات المحذوفة لا أثر لها في maha-image: حكم · مرشّح ثانٍ · محرّك موازٍ · حارس رافض · فحص تطبيق · مصنّفات الذكاء', () => {
  for (const sym of ['judgeBest', 'bestOfCount', 'duoEnabled', '__altP', 'duoP', 'duoEngine', 'densePromise', '__duoWouldRun', 'verifyLocalizedImageEdit', 'publicGuardError', '__guardLane', 'verifyRequestApplied', 'requestCheckEnabled', 'classifyEditIntentLLM', 'llmIntentEnabled', 'sourceLooksTextDense', 'sourceIsRealPlacePhoto']) {
    assert.ok(!new RegExp('\\b' + sym + '\\b').test(mi), sym + ' ما زال في maha-image');
  }
  for (const mod of ['./image-judge', './image-edit-guard', './request-check', './image-intent-llm']) assert.ok(!mi.includes("require('" + mod + "')"), mod + ' ما زال يُستدعى');
  // نداءات النماذج المتبقّية: التفسير · المحرّك الأساسيّ · GPT تعديل · GPT توليد · نانو إنقاذ
  const calls = (mi.match(/generativelanguage\.googleapis\.com|api\.openai\.com/g) || []).length;
  assert.equal(calls, 5, 'خمسة مواضع نداء فقط (كانت ٨) — وكلّ طلب يمرّ بواحد منها للصورة');
  // v-gpt-2.5 (٢٠ سبتمبر ٢٠٢٦): السقف ارتفع من 760 إلى 800 عمدًا — قوائم تدرّج موديلات GPT/نانو
  // (2.5-sunburst/flare → 2 → 1، و3.1 → 2.5 فلاش) أضافت أسطرًا حقيقية، لا تراجعًا عن v-lanes.
  assert.ok(mi.split('\n').length < 800, 'الملفّ ما زال أقصر بكثير من الأصل (كان ٨٨٧) رغم تدرّج الموديلات الجديد');
});

test('٢. المسارات الثلاثة: نصّ → GPT ضربة واحدة؛ أمين → برو 2K بحرارة 0.15؛ إبداعيّ → برو بحرارته الافتراضيّة', () => {
  // نصّ
  assert.match(mi, /const __textIntent = !!editImageBase64 && !__pureRaw && \(isTextRemove \|\| isTextSwap \|\| __textCueRe\.test\(cleanPrompt\)/);
  assert.match(mi, /const __textRoute = !!process\.env\.OPENAI_API_KEY && !prayerPlan && !isReimagine && !isRestyle && !isSceneUpgrade && !isElevate && !isPersonSwap && !isBroadEdit && !extras\.length\n\s+&& \(__textIntent \|\| \(editImageBase64 \? __optTextFaithful : /);
  assert.match(mi, /if \(__textRoute\) \{\n\s+const denseB64 = await openaiRescueImage\(\);\n\s+if \(denseB64\) \{\n\s+await sendImg\(denseB64, 'image\/png', 'openai'\);\n\s+return;/);
  // أمين
  assert.match(mi, /const editModel = \(process\.env\.IMAGE_EDIT_MODEL \|\| 'gemini-3-pro-image'\)\.trim\(\);/);
  assert.match(mi, /const __faithfulLane = !!editImageBase64 && !extras\.length && !isCreativeEdit && !isPersonSwap && !isBroadEdit;/);
  assert.match(mi, /if \(!nanoPrimary && !__faithfulLane\) delete cfg\.temperature;/);
  assert.match(mi, /temperature: editImageBase64 \? \(isSceneUpgrade \? 0\.5 : \(isReimagine \? 0\.9 : \(isElevate \? 0\.85 : \(isRestyle \? 0\.6 : 0\.15\)\)\)\) : 0\.85/, 'الحرارة 0.15 للتعديل الموضعيّ');
  // إبداعيّ وتوليد
  assert.match(mi, /const creativeModel = \(process\.env\.IMAGE_CREATIVE_MODEL \|\| 'gemini-3-pro-image'\)\.trim\(\);/);
  assert.match(mi, /const imageConfig = \{ imageSize: __want4K \? '4K' : '2K' \};/);
  // نداء واحد ثمّ الإرسال — الإنقاذ عند الفشل فقط
  const i = mi.indexOf('const imageResult = await fetchImageWithRetry({');
  const j = mi.indexOf('await sendImg(imgPart.inlineData.data', i);
  const seg = mi.slice(i, j);
  assert.equal((seg.match(/fetchImageWithRetry\(/g) || []).length, 2, 'نداء أساسيّ + إعادة خطّ الأنابيب المعطّل افتراضيًّا فقط');
  assert.ok(!/judge|guard|verifyRequest/i.test(seg), 'لا حكم ولا حارس ولا فحص بين المحرّك والإرسال');
  assert.match(mi, /const mainEngine = nanoPrimary \? \(__pureRaw \? 'nano-raw' : 'nano'\) : \(__pureRaw \? 'nano-pro-raw' : 'nano-pro'\);/);
});

test('٣. الخام خام: المحرّك المختار وحده، GPT خام بأمانة عالية، وترقية المكان بلا سؤال للنموذج، والتفسير للتوليد فقط', () => {
  assert.match(mi, /form\.append\('input_fidelity', 'high'\);/);
  assert.ok(!/'low' : 'high'/.test(mi));
  assert.match(mi, /if \(__optForceEngine === 'gpt'\) \{\n\s+const __gptB64 = await openaiRescueImage\(\);/);
  assert.match(mi, /const primaryModel = \(__optForceEngine === 'nano'\) \? 'gemini-2\.5-flash-image'/);
  assert.match(mi, /if \(isSceneUpgrade && !__intent\.placeUpgradeHint && !__intent\.sameImage\) \{ isSceneUpgrade = false; isElevate = true; \}/);
  assert.match(mi, /const cap = \(prayerPlan \|\| editImageBase64\) \? '' : await imageCaption\(/);
  // خطّ الإنقاذ كما هو: برو → نانو ٢٫٥ → GPT → المجّانيّ (توليد فقط)
  assert.match(mi, /const nanoB64 = await geminiNanoBananaImage\(\);/);
  assert.match(mi, /const rescuedB64 = await openaiRescueImage\(\);/);
  assert.match(mi, /const freeImg = await freeFallbackImage\(\);/);
});

test('٤. العميل: تبديل الحرف طلب واحد للخادم بلا مرحلتَي الرؤية والقناع؛ آخر طلب فقط على آخر صورة', () => {
  const a9 = read('js/app-09-attach.js');
  assert.match(a9, /textSwap: true, editImageBase64: __lsShr\.b64/);
  assert.ok(!a9.includes("fetch('/api/tools?action=text-swap'"), 'مرحلة الرؤية أُزيلت');
  assert.ok(!a9.includes('exactTextEdit:true, token:authGet'), 'مرحلة القناع أُزيلت');
  assert.match(a9, /const __combinedEdit = cumulativeImageEditPrompt\(cur, text, true\);/, 'reset=true: آخر طلب فقط');
  assert.ok(read('js/app.bundle.js').includes('v-lanes (قرار المالك ٢٠ سبتمبر «التعديل مرّة وحدة»)'), 'الحزمة مبنيّة');
});
