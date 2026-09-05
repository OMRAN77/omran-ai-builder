'use strict';
/* v-nano-pro-edit — نيّات تعديل الصورة: «أقوى/أفخم/طوّرها» ترقية إبداعية، لا تعديل موضعي يعيد الصورة كما هي */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { detectEditIntent } = require('../api/_lib/image-intent');

const kind = (t) => { const r = detectEditIntent(t); return r.sameImage ? 'same' : r.restyle ? 'restyle' : r.reimagine ? 'reimagine' : r.elevate ? 'elevate' : 'edit'; };

test('stronger/fancier requests in every common wording are an elevate, not a localized edit', () => {
  for (const t of ['أقوى', 'اقوى', 'أفضل من هذي', 'سو لي نسخة أفخم', 'خلها أفخم', 'خليها فخمة', 'طورها', 'طوّرها', 'حسّنها', 'جمّلها', 'ارفع مستواها',
    'عطني الأفضل', 'حسن', 'طور الصورة', 'حسّن الكرت', 'نسخة أقوى للكرت', 'اعطني نسخة أقوى من هذي الصورة', 'نسخة أرقى', 'خلها أحلى', 'أبدع', 'فكرة أقوى', 'احسن شوي',
    'make it stronger', 'a cleaner, more luxurious version of this card', 'upgrade the design', 'improve it', 'best version']) {
    assert.equal(kind(t), 'elevate', t);
  }
});

test('localized edits stay localized — the elevate detector must not swallow them', () => {
  for (const t of ['غيّر لون القميص إلى أزرق', 'شيل الخلفية', 'اكتب اسم عمران فوق', 'بدل التاريخ بدل 28 حط 12', 'حط قبة أكبر', 'خل الكتابة أوضح', 'عدل الخط',
    'حسن الإضاءة فقط', 'طور الخط', 'حسّن جودة النص', 'change the shirt color to blue', 'improve the lighting only', 'remove the watermark']) {
    assert.equal(kind(t), 'edit', t);
  }
});

test('same-image, restyle and reimagine keep their own lanes and beat elevate', () => {
  assert.equal(kind('نفس الصورة بس أقوى'), 'same');
  assert.equal(kind('زيها بالضبط'), 'same');
  assert.equal(kind('حوّلها كرتون'), 'restyle');
  assert.equal(kind('عدل 3d'), 'restyle');
  assert.equal(kind('anime style'), 'restyle');
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
});

test('server reads the intent from the user\'s own words and sends creative edits to Nano Banana Pro', () => {
  const maha = fs.readFileSync('api/_lib/maha-image.js', 'utf8');
  assert.match(maha, /require\('\.\/image-intent'\)/);
  assert.match(maha, /const intentText = userText \|\| String\(prompt \|\| ''\)/);
  assert.match(maha, /IMAGE_CREATIVE_MODEL \|\| 'gemini-3-pro-image'/);
  assert.match(maha, /const isCreativeEdit = !!editImageBase64 && !extras\.length && \(isElevate \|\| isReimagine \|\| isRestyle \|\| isSceneUpgrade \|\| __pureRaw\)/);
  assert.match(maha, /isCreativeEdit \? creativeModel : editModel/);
  assert.match(maha, /isElevate \? 0\.85/);
  assert.match(maha, /sourceIsRealPlacePhoto/);
  assert.match(maha, /if \(__place === false\) \{ isSceneUpgrade = false; isElevate = true; \}/);
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
  const creativeRe = new RegExp(attach.match(/const __IMG_CREATIVE_RE = \/(.*)\/i;/)[1], 'i');
  for (const t of ['أقوى', 'نسخة أفخم', 'خلها أرقى', 'طوّرها', 'فكرة ثانية', 'كرتون', 'make it stronger']) assert.ok(creativeRe.test(t), t);
  for (const t of ['كيف أطبع هذي الشاشة', 'وش هذا الخطأ', 'ترجم الصورة']) assert.ok(!creativeRe.test(t), t);
  assert.match(chatTools, /window\.__chatLastUserText = String\(ut \|\| ''\)\.slice\(0, 600\)/);
  assert.match(tools, /userText: String\(window\.__chatLastUserText \|\| ''\)\.slice\(0, 600\)/);
  assert.match(tools, /cur\.lastEditedImage\.b64\) \{ srcB64 = cur\.lastEditedImage\.b64/);
  assert.match(chat, /engine:\\s\*nano-pro/);
});
