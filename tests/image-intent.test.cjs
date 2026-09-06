'use strict';
/* v-nano-pro-edit — نيّات تعديل الصورة: «أقوى/أفخم/طوّرها» ترقية إبداعية، لا تعديل موضعي يعيد الصورة كما هي */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { detectEditIntent } = require('../api/_lib/image-intent');

const kind = (t) => { const r = detectEditIntent(t); return r.sameImage ? 'same' : r.restyle ? 'restyle' : r.reimagine ? 'reimagine' : r.elevate ? 'elevate' : 'edit'; };

test('stronger/fancier requests in every common wording are an elevate, not a localized edit', () => {
  for (const t of ['أقوى', 'اقوى', 'أفضل من هذي', 'سو لي نسخة أفخم', 'خلها أفخم', 'خليها فخمة', 'طورها', 'طوّرها', 'حسّنها', 'جمّلها', 'ارفع مستواها',
    'عطني الأفضل', 'حسن', 'طور الصورة', 'حسّن الكرت', 'احسنها', 'اجملها', 'اطورها', 'نسخة أقوى للكرت', 'اعطني نسخة أقوى من هذي الصورة', 'نسخة أرقى', 'خلها أحلى', 'أبدع', 'فكرة أقوى', 'احسن شوي',
    'زخرفها', 'زخرف الكرت', 'فخّمها', 'ابهرني', 'خلها تجنن', 'خلها لايقة', 'زود الزخارف', 'خل الكرت أفخم', 'سوها احترافية', 'ارفع جودتها',
    'make it stronger', 'a cleaner, more luxurious version of this card', 'upgrade the design', 'improve it', 'best version', 'stronger', 'bolder version']) {
    assert.equal(kind(t), 'elevate', t);
  }
});

test('localized edits stay localized — the elevate detector must not swallow them', () => {
  for (const t of ['غيّر لون القميص إلى أزرق', 'شيل الخلفية', 'اكتب اسم عمران فوق', 'بدل التاريخ بدل 28 حط 12', 'حط قبة أكبر', 'خل الكتابة أوضح', 'عدل الخط',
    'حسن الإضاءة فقط', 'طور الخط', 'حسّن جودة النص', 'أفضل اللون الأزرق', 'change the shirt color to blue', 'improve the lighting only', 'remove the watermark',
    /* الصفة الإنجليزية لعنصر واحد ليست ترقية للصورة كلها */ 'make the text bolder', 'add a premium badge', 'make the neon sign brighter', 'turn the pixels sharper', 'change the shirt to gray',
    /* «أفضّل لو/أن…» = أُفضّل لا أفضل؛ \b لا يعمل بعد حرف عربي */ 'أفضل لو تخلي الخلفية بيضاء', 'أحسن لو تغير اللون', 'أفضل أن تغير الخلفية', 'احسن لو تشيل الخلفية',
    /* حسن وزين أسماء لا أفعال حين تأتي مفعولًا */ 'اكتب اسم حسن', 'غير الاسم إلى زين', 'اكتب اسمي حسن!', 'الاسم حسن', 'اسم زين.',
    /* الصفة تصف عنصرًا واحدًا لا الصورة */ 'حط إطار أفخم', 'اجعل الخلفية أجمل', 'ضيف لمسة فخمة', 'عدل الخط وخله أجمل', 'اكتب اسم عمران فوق بخط احترافي', 'غيّر الخلفية لخلفية فخمة', 'خل الإضاءة أقوى',
    /* ألوان لا أساليب */ 'غير لون الخلفية رصاصي', 'خلها رصاصية', 'غير اللون إلى أخضر زيتي', 'لون مائي فاتح', 'keep it in the same style but change the sky']) {
    assert.equal(kind(t), 'edit', t);
  }
});

test('same-image, restyle and reimagine keep their own lanes and beat elevate', () => {
  assert.equal(kind('نفس الصورة بس أقوى'), 'same');
  assert.equal(kind('زيها بالضبط'), 'same');
  assert.equal(kind('حوّلها كرتون'), 'restyle');
  assert.equal(kind('عدل 3d'), 'restyle');
  assert.equal(kind('anime style'), 'restyle');
  assert.equal(kind('كرتونية'), 'restyle');
  assert.equal(kind('pixel art'), 'restyle');
  /* اسم ملف في ملحق المرفقات لا يخدع القارئ — الخادم يحذفه قبل القراءة، والحدود تمنع «renders/neon sign» */
  assert.equal(kind('make the neon sign brighter'), 'edit');
  /* الأسلوب الحقيقي بألفاظه الكاملة */
  for (const t of ['رسم رصاص', 'لوحة زيتية', 'ألوان مائية']) assert.equal(kind(t), 'restyle', t);
  /* أوامر الديكور المهندسة (٤ أنماط) تبقى تحويل أسلوب — «Keep layout identical» ليست «نفس الصورة» */
  assert.equal(kind('Redesign this restaurant interior in a sleek MODERN FINE DINING style: dark moody palette. Keep layout identical. Photorealistic architectural render.'), 'restyle');
  assert.equal(kind('make the exact same image but sharper'), 'same');
  assert.equal(kind('فكرة ثانية'), 'reimagine');
  assert.equal(kind('فكرة مختلفة أقوى'), 'reimagine');
  assert.equal(kind('different concept'), 'reimagine');
});

test('place hints keep the photographic scene-upgrade lane for rooms', () => {
  assert.equal(detectEditIntent('حسّن الغرفة').placeUpgradeHint, true);
  assert.equal(detectEditIntent('طبّق التوصيات').placeUpgradeHint, true);
  assert.equal(detectEditIntent('apply the recommendations').placeUpgradeHint, true);
  assert.equal(detectEditIntent('خلها أفخم').placeUpgradeHint, false);
  assert.equal(detectEditIntent('عطني الأفضل').placeUpgradeHint, false);
  /* كلمات المكان بحدودها: «replace/photoshop/decorate/بيتزا» ليست أماكن */
  for (const t of ['replace the background with sky', 'photoshop it', 'decorate the cake', 'بيتزا على الطاولة']) assert.equal(detectEditIntent(t).placeUpgradeHint, false, t);
  for (const t of ['بيتي', 'في المطبخ', 'upgrade the living room', 'حسّن الصالة']) assert.equal(detectEditIntent(t).placeUpgradeHint, true, t);
});

test('server reads the intent from the user\'s own words and sends creative edits to Nano Banana Pro', () => {
  const maha = fs.readFileSync('api/_lib/maha-image.js', 'utf8');
  assert.match(maha, /require\('\.\/image-intent'\)/);
  assert.match(maha, /const intentText = userText \|\| String\(prompt \|\| ''\)/);
  assert.match(maha, /body\.userText\.replace\(\/\\s\*\\\[\[\^\\\[\\\]\]\*\\\]\\s\*\$\/, ''\)/);
  assert.match(maha, /IMAGE_CREATIVE_MODEL \|\| 'gemini-3-pro-image'/);
  assert.match(maha, /const isCreativeEdit = !!editImageBase64 && \(isElevate \|\| isReimagine \|\| isRestyle \|\| isSceneUpgrade \|\| __pureRaw\)/);
  assert.match(maha, /isCreativeEdit \? creativeModel : editModel/);
  assert.match(maha, /isElevate \? 0\.85/);
  assert.match(maha, /sourceIsRealPlacePhoto/);
  assert.match(maha, /if \(__place !== true\) \{ isSceneUpgrade = false; isElevate = true; \}/);
  assert.match(maha, /if \(!nanoPrimary\) delete cfg\.temperature;/);
  assert.match(maha, /logError\('maha-image:primary-fallback'/);
  /* لقطة نصّية كثيفة + «حسّن» تبقى على gpt-image عالي الدقة — الترقية لا تُستثنى من مسار النصّ */
  assert.match(maha, /const __textRoute = !!process\.env\.OPENAI_API_KEY && !prayerPlan && !isReimagine && !isRestyle && !isSceneUpgrade\n/);
  /* خط الإنقاذ لم يُمسّ: برو يفشل → نانو 2.5 → gpt-image */
  assert.match(maha, /geminiNanoBananaImage\(\)/);
  assert.match(maha, /openaiRescueImage\(\)/);
});

test('both chat clients forward the user\'s words and the tool path never loses the source image', () => {
  const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
  const tools = fs.readFileSync('js/app-17-agent-tools.js', 'utf8');
  const chatTools = fs.readFileSync('js/app-18-chat-tools.js', 'utf8');
  const chat = fs.readFileSync('api/_lib/chat.js', 'utf8');
  assert.match(attach, /prompt: __editPrompt, userText: String\(text \|\| ''\)\.slice\(0, 600\)/);
  assert.match(attach, /نانو بنانا برو/);
  /* بطاقة ملصوقة/عريضة تُعلَّم «لقطة شاشة» — الطلب الإبداعي القصير عليها يبقى تعديل صورة لا تحليل لقطة */
  assert.match(attach, /__srcImg\._screenshot && !__SHOT_CREATIVE && !__imgEditRe/);
  /* بعد #504 (المساعد يقرأ ويرشد افتراضيًا): الطلب الإبداعي الصريح هو الاستثناء الوحيد فوق زرّ «تعديل» */
  assert.match(attach, /const __ATT_DEFAULT = !!\(\(__cameFromEditBtn \|\| __SHOT_CREATIVE\) && !__SHOT_ANALYZE/);
  const creativeRe = new RegExp(attach.match(/const __IMG_CREATIVE_RE = \/(.*)\/i;/)[1], 'i');
  for (const t of ['أقوى', 'نسخة أفخم', 'خلها أرقى', 'طوّرها', 'احسنها', 'زخرفها', 'ابهرني', 'سوها احترافية', 'ارفع جودتها', 'فكرة ثانية', 'كرتون', 'make it stronger', 'improve it', 'upgrade the design', 'richer version']) assert.ok(creativeRe.test(t), t);
  for (const t of ['كيف أطبع هذي الشاشة', 'وش هذا الخطأ', 'ترجم الصورة']) assert.ok(!creativeRe.test(t), t);
  assert.match(chatTools, /window\.__chatLastUserText = String\(ut \|\| ''\)\.replace\(.*\)\.trim\(\)\.slice\(0, 600\)/);
  assert.match(tools, /userText: String\(\(args && args\.userText\) \|\| window\.__chatLastUserText \|\| ''\)\.replace\(.*\)\.slice\(0, 600\)/);
  assert.match(tools, /cur\.lastEditedImage\.b64\) \{ srcB64 = cur\.lastEditedImage\.b64/);
  assert.match(chat, /engine:\\s\*nano-pro/);
  /* الخادم يمرّر كلمات المستخدم مع أمر الأداة (يعمل حتى مع حزمة عميل قديمة)، ويعرّف النموذج بـedit_image في دور فيه صورة */
  assert.match(chat, /if \(cb\.name === 'generate_image'\) \{ input\.userText = String\(lastUserText \|\| ''\)\.replace\(.*\)\.slice\(0, 600\)/);
  assert.match(chat, /if \(cb\.name === 'edit_image'\) \{ input\.userText = String\(lastUserText \|\| ''\)\.replace\(.*\)\.slice\(0, 600\)/);
  assert.match(chat, /const IMAGE_TURN_NOTE = lastUserHasImage/);
  assert.match(chat, /ownerKnowledge \+ IMAGE_TURN_NOTE/);
  assert.match(chat, /edit_image لأي تغيير أو ترقية أو نسخة أقوى/);
  /* generate_image على صورة مرفوعة + طلب إبداعي من كلمات المستخدم = يبني على المصدر لا من الوصف وحده */
  assert.match(tools, /if \(gCreative\) return await window\.omranAgentTools\.run\('edit_image', \{ instruction: prompt, userText: gUserText \}\)/);
  assert.match(tools, /var gCreative = !!\(gFirst && gRefB64 && gUserText && gUserText\.length <= 120 && !gNewImage && !gNotEdit/);
  assert.match(chat, /runInClient\(send, 'generate_image', input, lastUserHasImage \? 150000 : 75000\)/);
  /* زر «نسخة ثانية» يسمّي المحرّك بالمنطق نفسه */
  assert.match(attach, /'نانو بنانا برو' : 'نانو بنانا'\)\)\); \}catch\(e\)\{ __swallow\(e, 'ui:img-engine-again'\)/);
  assert.match(attach, /__IMG_CREATIVE_RE\.test\(text\) && !\/\[؟\?\]\\s\*\$\/\.test\(text\) && !__codeWordRe\.test\(text\) && !__supIssueRe\.test\(text\) && !__ATT_VISION_RE\.test\(text\)/);
  assert.match(tools, /typeof __IMG_CREATIVE_RE !== 'undefined' && __IMG_CREATIVE_RE\.test\(gUserText\)/);
  assert.match(attach, /^const __IMG_CREATIVE_RE = \//m);
  assert.ok(chatTools.includes("replace(/\\s*\\[[^\\[\\]]*\\]\\s*$/, '')"), 'الملحق [الصور المرفقة: …] يُحذف قبل قراءة النيّة');
});
