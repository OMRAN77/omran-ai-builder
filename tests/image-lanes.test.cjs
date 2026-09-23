// tests/image-lanes.test.cjs — v-lanes (٢٠ سبتمبر ٢٠٢٦): بعد فحص مسار الصور من الصفر — «نتيجة قويّة بضربة وحدة»:
// قرار واحد، ثلاثة مسارات، نداء واحد للمحرّك، بلا حكم ولا مرشّح ثانٍ ولا حارس رافض ولا فحص وإعادة ولا مصنّفات ذكاء.
// v-img-honest + v-img-mix (٢٣ سبتمبر، المالك: «يقولي شي والتنفيذ صفر… وخاصيّة دمج بين نانو وGPT — النتيجة ١») عدّل
// قرارين من v-lanes بطلب صريح: (أ) كلّ ناتج يُقاس (بكسل + نداء الرؤية الواحد الذي كان التفسير) ولم يُنفَّذ = المحرّك الآخر
// مرّة واحدة؛ (ب) وضع «+» للمالك يشغّل المحرّكين معًا ويختار صورة. الباقي كما هو: الوحدات المحذوفة لا تعود (الحكم القديم
// كان يفضّل الأقرب للمصدر)، نداء واحد للمحرّك في المسار العاديّ حين ينفّذ، والخام خام. الاختبار السلوكيّ: image-honest.
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
  // نداءات النماذج المتبقّية: المحرّك الأساسيّ · GPT تعديل · GPT توليد · نانو إنقاذ — والتفسير انتقل إلى image-verify
  // (v-img-honest: صار حكمًا وتقريرًا في النداء نفسه). المجموع خمسة كما كان.
  const calls = (mi.match(/generativelanguage\.googleapis\.com|api\.openai\.com/g) || []).length;
  assert.equal(calls, 4, 'أربعة مواضع نداء في maha-image (كانت ٨ قبل v-lanes)');
  assert.equal((read('api/_lib/image-verify.js').match(/generativelanguage\.googleapis\.com|api\.openai\.com/g) || []).length, 1, 'ونداء الرؤية الواحد في image-verify');
  // v-gpt-2.5 (٢٠ سبتمبر ٢٠٢٦): السقف ارتفع من 760 إلى 800 عمدًا — قوائم تدرّج موديلات GPT/نانو
  // (2.5-sunburst/flare → 2 → 1، و3.1 → 2.5 فلاش) أضافت أسطرًا حقيقية، لا تراجعًا عن v-lanes.
  // v-gpt-multi-merge (٢١ سبتمبر ٢٠٢٦): السقف ارتفع من 800 إلى 815 — إرفاق extras لخطّ إنقاذ GPT
  // (سطر شرط + حلقة + تعليق يوثّق دليلًا حيًّا فعليًّا) أضاف أسطرًا حقيقية، لا حشوًا.
  // v-img-honest + v-img-mix (٢٣ سبتمبر ٢٠٢٦): السقف من 815 إلى 875 — مرشّحا المحرّكين (proCandidate/gptCandidate)، الدمج المتسلسل
  // (خيار «أ»: برو ثمّ GPT للكتابة)، ميزانيّة النداءات الإضافيّة، وأمر الإعادة بلا تناقض. منطق القياس والحكم في image-verify
  // (settleCandidates) وأوامر التلميع في image-prompt — لا هنا.
  assert.ok(mi.split('\n').length < 875, 'الملفّ ما زال أقصر من الأصل (كان ٨٨٧) رغم القياس ووضع الدمج');
});

test('٢. المسارات الثلاثة: نصّ → GPT ضربة واحدة؛ أمين → برو 2K بحرارة 0.15؛ إبداعيّ → برو بحرارته الافتراضيّة', () => {
  // نصّ
  assert.match(mi, /const __textIntent = !!editImageBase64 && !__pureRaw && \(isTextRemove \|\| isTextSwap \|\| __textCueRe\.test\(cleanPrompt\)/);
  assert.match(mi, /const __textRoute = !!process\.env\.OPENAI_API_KEY && !prayerPlan && !isReimagine && !isRestyle && !isSceneUpgrade && !isElevate && !isPersonSwap && !isBroadEdit && !extras\.length\n\s+&& \(__textIntent \|\| \(editImageBase64 \? __optTextFaithful : /);
  assert.match(mi, /if \(__textRoute && !__engineMix\) \{\n\s+const denseB64 = await openaiRescueImage\(\);\n\s+if \(denseB64\) \{\n\s+await deliver\(\{ b64: denseB64, mime: 'image\/png', engine: 'openai' \}, function \(\) \{ return proCandidate\(__extraBudget\(\)\); \}\);[^\n]*\n\s+return;/, 'GPT أوّلًا ضربة واحدة؛ برو فقط إن لم يُنفّذ');
  // أمين
  assert.match(mi, /const editModel = \(process\.env\.IMAGE_EDIT_MODEL \|\| 'gemini-3-pro-image'\)\.trim\(\);/);
  assert.match(mi, /const __faithfulLane = !!editImageBase64 && !isCreativeEdit && !isPersonSwap && !isBroadEdit;/);
  // v-merge-faithful (لقطة المالك «ادمج الصورتين مع الأحضان» أرجعت وجهًا مختلفًا): دمج عدّة صور غير الإبداعيّ
  // يدخل المسار الأمين أيضًا الآن — لا استثناء بـextras.length يُخرجه لحرارة جوجل الافتراضية.
  assert.ok(!/__faithfulLane = !!editImageBase64 && !extras\.length/.test(mi), 'الدمج غير الإبداعي لم يعد مستثنى من المسار الأمين');
  assert.match(mi, /if \(!nanoPrimary && !__faithfulLane\) delete cfg\.temperature;/);
  assert.match(mi, /temperature: editImageBase64 \? \(isSceneUpgrade \? 0\.5 : \(isReimagine \? 0\.9 : \(isElevate \? 0\.85 : \(isRestyle \? 0\.6 : 0\.15\)\)\)\) : 0\.85/, 'الحرارة 0.15 للتعديل الموضعيّ');
  // إبداعيّ وتوليد
  assert.match(mi, /const creativeModel = \(process\.env\.IMAGE_CREATIVE_MODEL \|\| 'gemini-3-pro-image'\)\.trim\(\);/);
  assert.match(mi, /const imageConfig = \{ imageSize: __want4K \? '4K' : '2K' \};/);
  // نداء واحد للمحرّك — الإنقاذ عند الفشل فقط؛ القياس في deliver (image-verify) لا داخل نداء المحرّك
  const i = mi.indexOf('async function proCandidate(budget) {');
  const j = mi.indexOf('async function gptCandidate(', i);
  assert.ok(i > 0 && j > i, 'مرشّح برو موجود');
  const seg = mi.slice(i, j);
  assert.equal((seg.match(/fetchImageWithRetry\(/g) || []).length, 2, 'نداء أساسيّ + إعادة خطّ الأنابيب المعطّل افتراضيًّا فقط');
  assert.ok(!/judge|guard|verifyRequest/i.test(seg), 'لا حكم ولا حارس ولا فحص داخل نداء المحرّك');
  assert.match(mi, /const primary = __engineMix \? null : await proCandidate\(\);\n\s+if \(primary\) \{ await deliver\(primary, __gptAlt\); return; \}/, 'المسار العاديّ: برو ثمّ القياس، وGPT فقط إن لم يُنفّذ');
  assert.match(mi, /const mainEngine = nanoPrimary \? \(__pureRaw \? 'nano-raw' : 'nano'\) : \(__pureRaw \? 'nano-pro-raw' : 'nano-pro'\);/);
});

test('٣. الخام خام: المحرّك المختار وحده، GPT خام بأمانة عالية، وترقية المكان بلا سؤال للنموذج، والتفسير للتوليد فقط', () => {
  assert.match(mi, /form\.append\('input_fidelity', 'high'\);/);
  assert.ok(!/'low' : 'high'/.test(mi));
  assert.match(mi, /if \(__optForceEngine === 'gpt'\) \{\n\s+const __gptB64 = await openaiRescueImage\(\);/);
  assert.match(mi, /const primaryModel = \(__optForceEngine === 'nano'\) \? 'gemini-2\.5-flash-image'/);
  assert.match(mi, /if \(isSceneUpgrade && !__intent\.placeUpgradeHint && !__intent\.sameImage\) \{ isSceneUpgrade = false; isElevate = true; \}/);
  // v-img-report (المالك ٢٣ سبتمبر): التقرير للتوليد والتعديل (المصدر + الناتج) — v-img-honest: يكتبه الحاكم نفسه مع القياس
  assert.match(mi, /await sendImg\(r\.best\.b64, r\.best\.mime, r\.engine, r\.report, r\.best\.verdict\);/);
  assert.match(mi, /caption: \(!prayerPlan && report\) \|\| undefined,/);
  // الخام خام: لا محرّك آخر ولا رفض ٤٢٢ (honest=false)
  assert.match(mi, /honest: !prayerPlan && !__pureRaw && String\(process\.env\.IMAGE_VERIFY \|\| 'on'\)\.toLowerCase\(\) !== 'off'/);
  assert.match(mi, /if \(__gptB64\) \{ await deliver\(\{ b64: __gptB64, mime: 'image\/png', engine: 'openai' \}, null\); return; \}/);
  // خطّ الإنقاذ كما هو: برو → نانو ٢٫٥ → GPT → المجّانيّ (توليد فقط)
  assert.match(mi, /const nanoB64 = await geminiNanoBananaImage\(\);/);
  assert.match(mi, /const rescuedB64 = __gptTried \? null : await openaiRescueImage\(\);/); // v-img-mix: الدمج جرّب GPT وفشل = لا نداء ثانٍ
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
