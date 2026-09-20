'use strict';
/* v-ultra — «أعلى جودة للصور» (طلب المالك ٢٠ سبتمبر ٢٠٢٦).
   المهمّة وصلت مكتوبةً من نموذج خارجيّ لا يرى المستودع، وكان نصفُ بنودها مبنيًّا
   على ملفّات وطبقات غير موجودة (راجع مدخل DECISIONS). هذا الاختبار يقفل ما
   نُفِّذ فعلًا، ويقفل معه الأسباب التي منعت ما لم يُنفَّذ حتّى لا يُعاد فتحها
   بالخطأ لاحقًا. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const maha = rd('api/_lib/maha-image.js');
const attach = rd('js/app-09-attach.js');

// ── (١) مسجّل الموديلات: كلّ اسم قابل للضبط من البيئة بلا نشر ──
assert.match(maha, /const IMG_MODELS = \{/, 'مسجّل الموديلات معرَّف');
[
  ['edit', 'IMAGE_EDIT_MODEL'],
  ['creative', 'IMAGE_CREATIVE_MODEL'],
  ['nanoRaw', 'IMAGE_NANO_MODEL'],
  ['gptGen', 'IMAGE_GPT_GEN_MODEL'],
  ['gptGenFallback', 'IMAGE_GPT_GEN_FALLBACK_MODEL'],
  ['gptEdit', 'IMAGE_GPT_EDIT_MODEL'],
].forEach(([key, env]) => {
  assert.ok(new RegExp(key + ": __envModel\\('" + env + "'").test(maha),
    'الدور «' + key + '» يُضبَط بمتغيّر ' + env);
});
assert.match(maha, /rescueGemini: __envList\('IMAGE_RESCUE_GEMINI_MODELS'/, 'سلسلة إنقاذ Gemini من البيئة');

// كلّ نداء يستعمل المسجّل، ولا اسم موديل مثبّت في الكود التنفيذيّ
assert.match(maha, /const creativeModel = IMG_MODELS\.creative;/);
assert.match(maha, /const editModel = IMG_MODELS\.edit;/);
assert.match(maha, /\? IMG_MODELS\.nanoRaw/, 'وضع «نانو خام» للمالك من المسجّل');
assert.match(maha, /genOnce\(IMG_MODELS\.gptGen\)/);
assert.match(maha, /genOnce\(IMG_MODELS\.gptGenFallback\)/);
assert.match(maha, /form\.append\('model', IMG_MODELS\.gptEdit\)/);
assert.match(maha, /const models = IMG_MODELS\.rescueGemini;/);
// لا أسماء موديلات مثبّتة خارج الافتراضيّات داخل المسجّل نفسه
const __mahaLines = maha.split('\n');
const execLines = __mahaLines.filter((l, i) => {
  if (!/'(?:gemini-[0-9]|gpt-image-[0-9])/.test(l)) return false;
  // قيمة افتراضيّة داخل المسجّل — ولو انسدلت على سطر تالٍ.
  const win = (__mahaLines[i - 1] || '') + '\n' + l;
  return !/__envModel\(|__envList\(/.test(win);
});
assert.deepStrictEqual(execLines, [], 'لا اسم موديل مثبّت خارج المسجّل: ' + execLines.join(' | '));

// ── (٢) القدرة تُعلَن لا تُستنتج من شكل الاسم ──
/* عطل كامن: كانت nanoPrimary = /2\.5-flash-image/.test(primaryModel) وهي تقرّر
   شكل الطلب نفسه (responseModalities وحذف temperature). فأيّ تبديل موديل عبر
   IMAGE_EDIT_MODEL — وهو متغيّر قائم يستعمله المالك — كان يقلبها بصمت. */
assert.ok(!/nanoPrimary = \/2\\\.5-flash-image\/\.test/.test(maha),
  'استنتاج القدرة من نمط الاسم أُزيل');
assert.match(maha, /const nanoPrimary = isNanoStyleModel\(primaryModel\);/);
assert.match(maha, /const isNanoStyleModel = function \(m\) \{ return __nanoStyleModels\.indexOf/);
assert.match(maha, /__envList\('IMAGE_NANO_STYLE_MODELS'/, 'قائمة القدرة قابلة للتوسيع من البيئة');
// القدرة ما زالت تقود شكل الطلب — وإلّا فالإصلاح بلا أثر
assert.match(maha, /if \(nanoPrimary\) cfg\.responseModalities = \['IMAGE'\];/);
assert.match(maha, /if \(!nanoPrimary\) delete cfg\.temperature;/);

// ── (٣) صفر ضغط: PNG من البداية للنهاية في مسار الصور ──
assert.match(maha, /\? m : 'image\/png'; \};/, 'النوع المجهول يصير PNG لا JPEG');
assert.match(maha, /form\.append\('image', new Blob\(\[bytes\], \{ type: 'image\/png' \}\), 'photo\.png'\);/,
  'مصدر تعديل GPT يُرسَل PNG دائمًا — كان photo.jpg بوسم jpeg');
assert.match(maha, /output_format: 'png'/, 'توليد GPT يطلب PNG صراحةً');
// الاستثناء الوحيد المشروع: نوع محتوى صورة مجلوبة فعليًّا من الشبكة
const jpegLines = maha.split('\n')
  .filter((l) => /'image\/jpeg'/.test(l) && !/^\s*(?:\/\/|\*|\/\*)/.test(l));
assert.strictEqual(jpegLines.length, 1,
  'بقي موضع jpeg واحد فقط (نوع المحتوى الحقيقيّ لصورة مجلوبة): ' + jpegLines.join(' | '));
assert.match(jpegLines[0], /ct\.split\(';'\)\[0\]/, 'والموضع الباقي هو قراءة content-type الحقيقيّ');

// ── (٤) المصدر لا يُعاد ترميزه افتراضيًّا قبل التعديل ──
assert.match(attach, /const OMRAN_EDIT_SRC_BUDGET = 2600000;/);
assert.match(attach, /if\(!force && b64\.length <= OMRAN_EDIT_SRC_BUDGET\) return \{ b64: b64, mime: mime \};/,
  'الأصل يمرّ كما هو داخل الميزانيّة — بلا تصغير ولا إعادة ترميز');
assert.match(attach, /const mx = maxPx \|\| 3072;/, 'سقف الأبعاد ارتفع 2048 → 3072');
// الترتيب إلزاميّ: بلا فقد أوّلًا، والتصغير آخرًا
const order = attach.slice(attach.indexOf('const OMRAN_EDIT_SRC_BUDGET'));
const iPng = order.indexOf("type: 'image/png'");
const iJpg = order.indexOf("type: 'image/jpeg', q: 0.95");
const iScale = order.indexOf('scale: fit * 0.8');
assert.ok(iPng > 0 && iJpg > iPng && iScale > iJpg,
  'الترتيب: PNG بلا فقد ← JPEG عالي ← تصغير تدريجيّ');
// مسار مصغّرات الذاكرة (force) لم يُمسّ: سقفه على الخادم 420ك.ب
assert.match(attach, /if\(force\)\{/, 'مسار force منفصل ومحفوظ');
assert.match(attach, /const __tsShr = await omranShrinkForEdit\(__b64, __mime, 1280\)/,
  'القناع يبقى 1280 — صورتان في طلب واحد');

// ── (٥) ما لم يُنفَّذ، وسببه — مقفول حتّى لا يُعاد فتحه بالخطأ ──
/* (أ) «ارفع المصدر إلى Blob بدل تصغيره»: مستحيل — نقطة الرفع معطّلة عمدًا. */
const blobUp = rd('api/_lib/blob-client-upload.js');
assert.match(blobUp, /status\(503\)/, 'رفع Blob من المتصفّح معطّل عمدًا — فمسار الرابط غير متاح');
assert.match(blobUp, /Upstash Redis/, 'والسبب موثّق: التخزين انتقل ولا يدعم الرفع المباشر');
/* (ب) «ألغِ الترقية الصناعية Real-ESRGAN/Replicate»: لا وجود لها أصلًا. */
['esrgan', 'replicate'].forEach((w) => {
  const hits = fs.readdirSync(path.join(root, 'api/_lib'))
    .filter((f) => f.endsWith('.js') && new RegExp(w, 'i').test(rd(path.join('api/_lib', f))));
  assert.deepStrictEqual(hits, [], 'لا ترقية صناعية في مسار الصور (' + w + ')');
});
/* (ج) «الطبقات المحذوفة»: ليست محذوفة — ما زالت موصولة، وتُركت كما هي. */
['image-judge', 'image-edit-guard', 'image-intent-llm', 'request-check'].forEach((m) => {
  assert.ok(new RegExp("require\\('\\./" + m + "").test(maha),
    'الطبقة ' + m + ' ما زالت موصولة بمسار الصور (لم تكن محذوفة كما افترضت المهمّة)');
});

/* ── (٦) v-ultra-duo: المسار «الخارق» — نداءان بالتسلسل ──
   الفكرة مبنيّة على ما سجّله الملفّ نفسه: GPT ينشئ النصّ العربيّ الجديد (وGemini
   يكسره)، ونانو برو هو «الأقوى في الحروف العربية» في **الحفظ والنقل**. فالتسلسل
   يعطي كلّاً ما يتفوّق فيه. هذه الفحوص تقفل الخصائص التي بدونها ينقلب المسار
   إلى نتيجة أسوأ من GPT وحده. */
const ultra = maha.slice(maha.indexOf('v-ultra-duo'));
assert.ok(ultra.length > 500, 'كتلة المسار الخارق موجودة');

// (أ) المرحلة الثانية تستلم ناتج الأولى **صورةً مصدرًا** لا وصفًا لتوليد جديد.
assert.match(ultra, /inlineData: \{ mimeType: 'image\/png', data: srcB64 \}/,
  'برو يستلم ناتج GPT كمصدر — لا يعيد الرسم من وصف');
assert.match(ultra, /parts: \[\{ text: ULTRA_ENRICH \}, \{ inlineData:/,
  'التعليمة أوّلًا ثمّ الصورة المصدر — ترتيب مسار التعديل');

// (ب) التعليمة مقيّدة: تحفظ ولا تعيد الرسم.
assert.match(ultra, /pixel-identical/, 'النصّ يُحفظ حرفيًّا');
assert.match(ultra, /Do NOT redraw, retype, translate or re-letter any text/,
  'منع إعادة رسم النصّ صراحةً — وإلّا كسر برو ما أتقنه GPT');
assert.match(ultra, /Improve ONLY the physical rendering quality/,
  'الإثراء محصور في الإخراج لا المحتوى');

// (ج) فشل المرحلة الثانية لا يخسر المستخدم شيئًا.
assert.match(ultra, /await sendImg\(__e \|\| __g, 'image\/png', __e \? 'ultra-duo' : 'ultra-gpt-only'\);/,
  'فشل الإثراء يسلّم ناتج GPT كما هو — الخارق لا يكون أسوأ من مرحلته الأولى');

// (د) لا تشغيل بكلمات مفتاحيّة (فخّ v-news-intent) — علم صريح فقط.
assert.match(ultra, /body\.ultra !== true\) return false;/, 'علم صريح لا تخمين من النصّ');
assert.ok(!/ultra[\s\S]{0,400}?test\(intentText/.test(ultra), 'لا مطابقة نصّ لتشغيل المسار');

// (هـ) توليد جديد فقط — لا تعديل ولا صور إضافية ولا خطّة دعاء.
assert.match(ultra, /if \(editImageBase64 \|\| extras\.length \|\| prayerPlan\) return false;/);

// (و) **البوّابتان متطابقتان** — خادم وواجهة معًا. بوّابة خادم أوسع من الواجهة
//     تصنع سلكًا مقطوعًا: ميزة يقبلها الخادم ولا يصل إليها أحد (نفس علّة أزرار النبرة).
assert.match(ultra, /return __isOwnerReq;/, 'الخادم: المالك وحده');
const modes = rd('js/modes.js');
const __ultraRow = modes.split('\n').find((l) => /id:'image_ultra'/.test(l)) || '';
assert.ok(/owner:true/.test(__ultraRow), 'الواجهة: المالك وحده — نفس بوّابة الخادم');
assert.match(rd('js/app-09-attach.js'), /__o === 'image_ultra'\) __x\.ultra = true;/,
  'الواجهة ترسل العلم الذي يقرأه الخادم — لا اسم مختلف');
assert.match(rd('index.html'), /modes\.js\?v=m200920a/, 'وسم كاش modes.js مرفوع بعد إضافة الوضع');

// (ز) المسار يستعمل المسجّل لا أسماء مثبّتة.
assert.match(ultra, /model: IMG_MODELS\.gptGen/);
assert.match(ultra, /model: IMG_MODELS\.gptGenFallback/);
assert.match(ultra, /models\/' \+ IMG_MODELS\.creative \+ '/, 'المرحلة الثانية على موديل الإبداع من المسجّل');
// وقابل للإطفاء من البيئة بلا نشر
assert.match(ultra, /IMAGE_ULTRA_LANE \|\| 'on'/);

console.log('✓ image-lanes: مسجّل موديلات · قدرة معلَنة · PNG بلا ضغط · مصدر بلا إعادة ترميز · مسار خارق ببوّابتين متطابقتين');
