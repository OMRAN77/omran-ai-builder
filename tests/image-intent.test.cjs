'use strict';
/* v-nano-pro-edit — نيّات تعديل الصورة: «أقوى/أفخم/طوّرها» ترقية إبداعية، لا تعديل موضعي يعيد الصورة كما هي */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { detectEditIntent } = require('../api/_lib/image-intent');

const kind = (t) => { const r = detectEditIntent(t); return r.sameImage ? 'same' : r.restyle ? 'restyle' : r.reimagine ? 'reimagine' : r.elevate ? 'elevate' : 'edit'; };

test('stronger/fancier requests in every common wording are an elevate, not a localized edit', () => {
  for (const t of ['أقوى', 'اقوى', 'أفضل من هذي', 'سو لي نسخة أفخم', 'خلها أفخم', 'خليها فخمة', 'طورها', 'طوّرها', 'حسّنها', 'جمّلها', 'ارفع مستواها',
    'عطني الأفضل', 'حسن', 'طور الصورة', 'حسّن الكرت', 'احسنها', 'اجملها', 'اطورها', 'نسخة أقوى للكرت', 'اعطني نسخة أقوى من هذي الصورة', 'نسخة أرقى', 'خلها أحلى', 'أبدع', 'احسن شوي',
    'زخرفها', 'زخرف الكرت', 'فخّمها', 'ابهرني', 'خلها تجنن', 'خلها لايقة', 'زود الزخارف', 'زيد الفخامة', 'خل الكرت أفخم', 'سوها احترافية', 'ارفع جودتها',
    /* الاسم بعد الصفة/الفعل جانبٌ لا مفعول: الصورة كلها تُرفع */ 'طورها بالألوان', 'ممكن أقوى من فوق', 'أبيها أفخم من فوق', 'أبغاها أفخم بالألوان', 'حسّنها من ناحية الألوان', 'خلها فخمة بالألوان', 'خلها فخمة من فوق', 'خلها تجنن بالألوان', 'ابهرني بالألوان', 'فخّمها بالألوان والخط', 'زخرفها وحط اسمي فوق', 'حسنها كلها حتى الخط', 'خله أفخم بالألوان', 'لو سمحت أقوى بالألوان',
    'make it stronger but keep the text', 'make it more luxurious, keep the name', 'improve it, especially the lighting', 'a richer version with the same background', 'upgrade the design but keep the date', 'best version, keep the name', 'make this more premium with a gold frame', 'make it much nicer, keep the sky', 'make it a lot nicer',
    /* الجولة الرابعة: الصفة تتصدّر أو الضمير للصورة يغلب أي عنصر لاحق */ 'أقوى وحط إطار أفخم', 'غير الخط وخلها أقوى', 'حط إطار ذهبي وخلها أقوى', 'الصورة كلها أقوى', 'خل الصورة أقوى', 'زود زخارف', 'زيد جمال الصورة', 'فخم',
    'make it stronger', 'a cleaner, more luxurious version of this card', 'upgrade the design', 'improve it', 'best version', 'stronger', 'bolder version',
    /* «قوّمها» وصفات العامية مع «شي/نسخة/خلها» ترقية للتركيب نفسه */
    'قوّمها', 'قومها', 'قوم الصورة', 'اقوم هالصورة', 'سوّي لي شي يجنن', 'سو لي شي خرافي', 'عطني نسخة رهيبة', 'خلها تخبل']) {
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
    /* الصفة بعدها اسم عنصر = تصفه هو */ 'أفضل لونها أزرق', 'أجمل خط', 'فخم الإطار', /* زيد جمال اسم */ 'اكتب زيد جمال', 'اكتب الاسم: زيد جمال',
    /* كلمة بين الاسم والصفة، وتاء الملكية، وضمير مذكّر */ 'حط إطار ذهبي أفخم', 'خلفيتها أجمل', 'إضاءتها أقوى', 'الخلفية خلها أجمل',
    /* دوران/صيغة ليست تحويل أسلوب */ 'turn the image upside down', 'convert it to png', 'convert the image to 16:9', 'turn it around', 'rotate the image 90 degrees', 'give the title a bolder look', 'a bolder version of the logo',
    /* ألوان لا أساليب */ 'غير لون الخلفية رصاصي', 'خلها رصاصية', 'غير اللون إلى أخضر زيتي', 'لون مائي فاتح', 'keep it in the same style but change the sky',
    /* «in a … style» على عنصر واحد ليس تحويل أسلوب */ 'write the name in an elegant style', 'put the logo in the corner, keep the style', 'make the text in a bigger font, same style', 'add a border in a gold style', 'restyle the text', 'redesign the logo',
    /* «أقوم بـ» = أفعل؛ فكرة لاسم/عن = كلام لا صورة؛ الصفة العامية وحدها مجاملة؛ الصفة على عنصر */ 'أقوم بتغيير اللون', 'عطني فكرة لاسم المحل', 'عطني فكرة عن التسويق', 'يجنن', 'رهيب', 'روعة', 'فكرة', 'شيل الاسم كامل', 'حط خط يجنن', 'خل الخط يجنن', 'اكتب اسم قوم', 'الذكاء الاصطناعي ما يفهم', 'give me an idea for a name']) {
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
  for (const t of ['رسم رصاص', 'لوحة زيتية', 'ألوان مائية', 'حولها للوحة زيتية', 'حولها لرسم رصاص', 'حوّلها لرسمة رصاص', 'ارسمها بألوان مائية', 'سوها بالألوان المائية', 'خلها بأسلوب مائي', 'خلها بستايل زيتي', 'رسم بقلم رصاص', 'رسم رصاصي', 'اسكتش', 'redesign this room in a modern style', 'turn it into a cartoon', 'convert it to a watercolor painting', 'make it in a vintage style', 'vintage style', 'turn it into a vintage poster look']) assert.equal(kind(t), 'restyle', t);
  /* أوامر الديكور المهندسة (٤ أنماط) تبقى تحويل أسلوب — «Keep layout identical» ليست «نفس الصورة» */
  assert.equal(kind('Redesign this restaurant interior in a sleek MODERN FINE DINING style: dark moody palette. Keep layout identical. Photorealistic architectural render.'), 'restyle');
  assert.equal(kind('make the exact same image but sharper'), 'same');
  assert.equal(kind('فكرة ثانية'), 'reimagine');
  assert.equal(kind('عطني فكرة ثانية'), 'reimagine');
  assert.equal(kind('فكرة مختلفة أقوى'), 'reimagine');
  assert.equal(kind('different concept'), 'reimagine');
  /* لقطات المالك ٦ سبتمبر: «فكرة أقوى» و«عطني فكرة» و«زي الذكاء الاصطناعي» و«شغل فوتوشوب» = تصميم جديد للموضوع نفسه، لا ترقية تبقي التركيب */
  for (const t of ['عطني فكرة اقوى من هذي شغل فوتو شوب', 'فكرة أقوى', 'فكرة أفضل', 'وهاذي تابعة لي ستايل عطني فكرة اقوم هذي الصورة', 'وهاذي تابعة تلفزيون عطني فكرة اقوم هذي الصورة', 'عطني فكرة اقوم هذي الصورة', 'عطني فكرة', 'اقترح لي فكرة', 'عطني افكار',
    'خلها زي الذكاء الاصطناعي', 'سوها بالذكاء الاصطناعي', 'شغل ذكاء اصطناعي مو فوتوشوب', 'شغل فوتوشوب', 'مو فوتوشوب', 'give me an idea', 'any ideas', 'make it look ai generated']) assert.equal(kind(t), 'reimagine', t);
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
  const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
  assert.match(maha, /require\('\.\/image-intent'\)/);
  assert.match(maha, /const intentText = userText \|\| String\(prompt \|\| ''\)/);
  assert.match(maha, /body\.userText\.replace\(\/\\s\*\\\[\[\^\\\[\\\]\]\*\\\]\\s\*\$\/, ''\)/);
  assert.match(maha, /IMAGE_CREATIVE_MODEL \|\| 'gemini-3-pro-image'/);
  assert.match(maha, /const isCreativeEdit = !!editImageBase64 && \(isElevate \|\| isReimagine \|\| isRestyle \|\| isSceneUpgrade \|\| __pureRaw\)/);
  assert.match(maha, /\(isCreativeEdit \|\| isTextSwap\) \? creativeModel : editModel/);
  assert.match(maha, /isElevate \? 0\.85/);
  assert.match(maha, /sourceIsRealPlacePhoto/);
  assert.match(maha, /if \(__place !== true\) \{ isSceneUpgrade = false; isElevate = true; \}/);
  assert.match(maha, /if \(!nanoPrimary\) delete cfg\.temperature;/);
  assert.match(maha, /logError\('maha-image:primary-fallback'/);
  /* الحارس يعمل على كل تعديل الآن: الأسلوب/الترقية/الفكرة المختلفة لا تُرفض لتغيير الوسيط، والهوية مفروضة */
  assert.match(maha, /allowStyleChange: explicitlyRequestsStyleChange\(cleanPrompt\) \|\| isRestyle \|\| isReimagine \|\| isElevate,/);
  assert.match(maha, /allowBroadChange: isSceneUpgrade \|\| isElevate \|\| isReimagine \|\| isRestyle,/);
  /* v-letter-swap: «غير حرف م حط ع» → نانو بنانا برو بتعليمة قصيرة، وgpt-image منافس بالحكم لا خاطف */
  const { isTextEditRequest, buildLetterSwapPrompt } = require('../api/_lib/image-prompt');
  for (const t of ['غير حرف م حط ع', 'شيل حرف م وحط ع', 'بدل الاسم إلى عمران', 'اكتب كلمة مبروك', 'replace the word Sale with Open']) assert.equal(isTextEditRequest(t), true, t);
  for (const t of ['أقوى', 'خلها أفخم', 'شيل الخلفية']) assert.equal(isTextEditRequest(t), false, t);
  /* «شيل الاسم كامل» حذف صِرف لا تبديل حرف (كان يسقط في «لم أستطع تحديد الحرف») — البديل بعده يعيده تبديلًا */
  const { isPureTextRemoval } = require('../api/_lib/image-prompt');
  for (const t of ['شيل الاسم كامل', 'شيل الاسم', 'بدون أسماء', 'احذف النص', 'remove the name']) assert.equal(isPureTextRemoval(t), true, t);
  for (const t of ['شيل الاسم وحط عمران', 'شيل حرف م وحط ع', 'غير حرف م حط ع', 'بدل الاسم إلى عمران', 'replace the name with Omran', 'أقوى']) assert.equal(isPureTextRemoval(t), false, t);
  const lp = buildLetterSwapPrompt('غير حرف م حط ع');
  assert.match(lp, /Edit the attached image: "غير حرف م حط ع"/);
  assert.match(lp, /Change ONLY the letter\/word\/number named in that request, in place/);
  assert.ok(lp.split('\n').length <= 5, 'short prompt like the Gemini app');
  assert.match(maha, /const isTextRemove = !!editImageBase64 && !isSceneUpgrade && !isRestyle && !isReimagine && !isElevate && isPureTextRemoval\(intentText\);/);
  assert.match(maha, /const isTextSwap = !!editImageBase64 && !isSceneUpgrade && !isRestyle && !isReimagine && !isElevate && !isTextRemove && \(body\.textSwap === true \|\| isTextEditRequest\(intentText\)\);/);
  assert.match(maha, /\(isCreativeEdit \|\| isTextSwap\) \? creativeModel : editModel/);
  assert.match(maha, /isTextSwap \? buildLetterSwapPrompt\(cleanPrompt\)/);
  assert.match(maha, /isReimagine \? buildReimaginePrompt\(cleanPrompt, intentText\)/);
  /* v-raw-words: كلمات المستخدم تصل نموذج الصور في المسارات الإبداعية، وIMAGE_RAW_CREATIVE يرسلها وحدها */
  assert.match(maha, /isRestyle \? buildRestylePrompt\(cleanPrompt, intentText\)/);
  assert.match(maha, /isElevate \? buildElevatePrompt\(cleanPrompt, intentText\)/);
  assert.match(maha, /const __rawCreative = creativeRawEnabled\(process\.env\) && \(isElevate \|\| isReimagine \|\| isRestyle\);/);
  assert.match(maha, /__rawCreative \? rawCreativePrompt\(cleanPrompt, intentText\)/);
  /* v-intent-llm: النموذج يوسّع التعابير النمطية فقط حين لا تلتقط مسارًا إبداعيًا ولا تبديل/حذف نصّ، ولا يعمل بلا صورة مصدر */
  assert.match(maha, /if \(editImageBase64 && !\(body && body\.sceneUpgrade === true\) && !__intent\.restyle && !__intent\.reimagine && !__intent\.elevate && !__intent\.sameImage\n\s+&& intentText\.trim\(\)\.length <= 220 && !isTextEditRequest\(intentText\) && !isPureTextRemoval\(intentText\) && llmIntentEnabled\(process\.env\)\)/);
  assert.match(maha, /const __llm = await classifyEditIntentLLM\(\{ apiKey, text: intentText \}\);/);
  assert.match(maha, /if \(__llm\) \{ __intent\[__llm\.lane === 'same' \? 'sameImage' : __llm\.lane\] = true;/);
  const llm = require('../api/_lib/image-intent-llm');
  assert.deepEqual(llm.parseIntentReply('{"lane":"reimagine","confidence":0.92}'), { lane: 'reimagine', confidence: 0.92 });
  assert.deepEqual(llm.parseIntentReply('```json\n{"lane":"elevate","confidence":0.8}\n```'), { lane: 'elevate', confidence: 0.8 });
  assert.equal(llm.parseIntentReply('{"lane":"edit","confidence":0.99}'), null, 'edit = لا تغيير');
  assert.equal(llm.parseIntentReply('{"lane":"elevate","confidence":0.5}'), null, 'ثقة منخفضة = لا تغيير');
  assert.equal(llm.parseIntentReply('{"lane":"delete_everything","confidence":1}'), null, 'مسار خارج القائمة = لا تغيير');
  assert.equal(llm.parseIntentReply('not json'), null);
  assert.equal(llm.llmIntentEnabled({}), true);
  assert.equal(llm.llmIntentEnabled({ IMAGE_INTENT_LLM: 'off' }), false);
  const cp = llm.buildIntentClassifierPrompt('عطني "فكرة"\nأقوى');
  assert.match(cp, /Request: "عطني  فكرة أقوى"/, 'الاقتباسات وأسطر الطلب لا تكسر القالب');
  for (const lane of llm.INTENT_LANES) assert.match(cp, new RegExp('- ' + lane + ':'));
  /* المالك ٦ سبتمبر: لا حارس هوية/أسلوب على المسارات الإبداعية (نانو الأصلي لا يحجب)، ويبقى على التعديل الموضعي */
  assert.match(maha, /if \(editImageBase64 && !extras\.length && !rawMode && !isCreativeEdit\) \{\n\s+const guard = await verifyLocalizedImageEdit/);
  /* 4K عند الطلب الصريح فقط، وإلا 2K */
  assert.match(maha, /const imageConfig = \{ imageSize: __want4K \? '4K' : '2K' \};/);
  const want4K = new RegExp(maha.match(/const __want4K = \/(.*)\/i\.test\(/)[1], 'i');
  for (const t of ['أقوى 4K', 'للطباعة', 'دقة عالية', 'print quality version']) assert.ok(want4K.test(t), t);
  for (const t of ['أقوى', 'خلها أفخم', 'اطبع الاسم فوق']) assert.ok(!want4K.test(t), t);
  /* المصدر يُرسل بدقة 2048px لتعديل الصورة الواحدة، و1280 فقط مع قناع أو صور إضافية */
  assert.match(attach, /async function omranShrinkForEdit\(b64, mime, maxPx\)/);
  assert.match(attach, /const mx = maxPx \|\| 2048, sc = /);
  assert.match(attach, /const __tsShr = await omranShrinkForEdit\(__b64, __mime, 1280\)/);
  assert.match(attach, /__xa\.mime \|\| 'image\/png', 1280\)/);
  assert.match(maha, /&& \(!isTextSwap \|\| __duoWouldRun\)\n/);
  /* العميل: برو أولًا على الصورة كاملة، ومسار القناع احتياط */
  assert.match(attach, /textSwap: true, editImageBase64: __lsShr\.b64/);
  assert.ok(attach.indexOf('textSwap: true') < attach.indexOf("fetch('/api/tools?action=text-swap'"), 'Pro-first, masked path second');
  /* تبديل الحرف بالقناع يعمل على 1280px كأي تعديل */
  assert.match(attach, /const __sc = Math\.min\(1, 1280 \/ Math\.max\(img\.naturalWidth \|\| 1, img\.naturalHeight \|\| 1\)\);/);
  /* الترقية تذهب إلى برو دائمًا — لا تُختطف إلى gpt-image المحافظ حين يبدو المصدر «شاشة تطبيق» */
  assert.match(maha, /const __textRoute = !!process\.env\.OPENAI_API_KEY && !prayerPlan && !isReimagine && !isRestyle && !isSceneUpgrade && !isElevate && !extras\.length && \(!isTextSwap \|\| __duoWouldRun\)\n/);
  /* قرار المزدوج مرة واحدة: مسار النصّ الكثيف لا يترك نداء gpt-image معلّقًا حين تكون الترقية مستثناة من الحكم */
  assert.match(maha, /const __duoWouldRun = duoEnabled\(\) && !prayerPlan && !pipelineActive && !isReimagine && !isRestyle && !isElevate && !extras\.length;/);
  assert.match(maha, /if \(__textRoute\) \{\n      if \(__duoWouldRun\) \{/);
  assert.match(maha, /const duoOn = __duoWouldRun && \(!__textRoute \|\| !!densePromise\);/);
  assert.match(maha, /generationConfig: genConfigFor\(\{ temperature: 0\.85 \}\) \}\);/);
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
  /* بعد main (قرار المالك الأخير): أي أمر غير استفهامي مع صورة مرفقة = تعديل؛ «أقوى/أفضل من» تُلتقط بـ__IMG_ELEVATE */
  assert.match(attach, /const __SHOT_ANALYZE = !!\([^;]{0,600}!__IMG_UPGRADE && !__IMG_ELEVATE/);
  assert.match(attach, /const __ATT_DEFAULT = !!\(__srcImg && !__srcImg\._fromMemory && String\(text \|\| ''\)\.trim\(\)/);
  const creativeRe = new RegExp(attach.match(/const __IMG_CREATIVE_RE = \/(.*)\/i;/)[1], 'i');
  for (const t of ['أقوى', 'نسخة أفخم', 'خلها أرقى', 'طوّرها', 'احسنها', 'زخرفها', 'ابهرني', 'سوها احترافية', 'ارفع جودتها', 'فكرة ثانية', 'كرتون', 'make it stronger', 'improve it', 'upgrade the design', 'richer version', 'stronger']) assert.ok(creativeRe.test(t), t);
  /* صفة إنجليزية عارية في سؤال رأي ليست طلبًا إبداعيًا (لا تتجاوز قراءة اللقطة ولا تُخصم) */
  for (const t of ['is this nicer', 'which one is prettier', 'the second one is prettier', 'this looks cleaner than before']) assert.ok(!creativeRe.test(t), t);
  assert.ok(creativeRe.test('make it a lot nicer'));
  for (const t of ['عطني فكرة اقوم هذي الصورة', 'خلها زي الذكاء الاصطناعي', 'سوي لي شي يجنن', 'قوّمها', 'give me an idea', 'عطني فكرة اقوى من هذي شغل فوتو شوب', 'مو فوتوشوب']) assert.ok(creativeRe.test(t), t);
  for (const t of ['يجنن', 'أقوم بتغيير اللون', 'عطني فكرة لاسم المحل', 'give me an idea for a name']) assert.ok(!creativeRe.test(t), t);
  /* العميل: حذف الاسم/النصّ بلا بديل لا يدخل مسار تبديل الحرف */
  const __textSwapIntent = new Function(attach.match(/function __textSwapIntent\(s\)\{[\s\S]*?\n\}/)[0] + '; return __textSwapIntent;')();
  for (const t of ['شيل الاسم كامل', 'احذف النص']) assert.equal(__textSwapIntent(t), false, t);
  for (const t of ['شيل الاسم وحط عمران', 'غير حرف م حط ع', 'بدل التاريخ بدل 28 حط 12', 'شيل حرف م وحط ع']) assert.equal(__textSwapIntent(t), true, t);
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
  /* زر «نسخة ثانية» لا يُبنى فوق الصورة (كان يغطّي نصّها) — الدالة تبقى بلا زرّ */
  assert.ok(!/'نسخة ثانية' : 'Another'\)/.test(attach), 'زر «نسخة ثانية» أُزيل من فوق الصورة');
  assert.match(attach, /^const __IMG_CREATIVE_RE = \//m);
  assert.match(tools, /typeof __IMG_CREATIVE_RE !== 'undefined' && __IMG_CREATIVE_RE\.test\(gUserText\)/);
  assert.match(attach, /^const __IMG_CREATIVE_RE = \//m);
  assert.ok(chatTools.includes("replace(/\\s*\\[[^\\[\\]]*\\]\\s*$/, '')"), 'الملحق [الصور المرفقة: …] يُحذف قبل قراءة النيّة');
});
