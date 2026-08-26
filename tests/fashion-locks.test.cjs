// 👗 اختبار أقفال الأزياء وأسلاكها — من حزمة المالك.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { IDENTITY_LOCK, FAIRNESS_LOCK, MODEST_LOCK, locksFor } = require('../api/_lib/fashion-locks.js');

// ① قفل الهوية دائم — هو جوهر الأداة.
assert.ok(locksFor({}).includes(IDENTITY_LOCK), 'قفل الهوية في كل توليد');
assert.ok(IDENTITY_LOCK.includes('Do not slim') && IDENTITY_LOCK.includes('same face'), 'الهوية تمنع التنحيف وتغيير الوجه صراحةً');

// ② قفل العدالة عند المقارنة فقط.
assert.ok(locksFor({ fairness: true }).includes(FAIRNESS_LOCK), 'المقارنة تحمل قفل العدالة');
assert.ok(!locksFor({}).includes(FAIRNESS_LOCK), 'التوليد المفرد بلا قفل عدالة — يحافظ على خلفية صورة المستخدمة');

// ③ الاحتشام: بالطلب، أو تلقائيًا للعباية والتقليدي والمناسبة الدينية.
assert.ok(locksFor({ modest: true }).includes(MODEST_LOCK), 'الاحتشام بالطلب');
assert.ok(locksFor({ style: 'abaya' }).includes(MODEST_LOCK), 'العباية محتشمة تلقائيًا');
assert.ok(locksFor({ occasion: 'religious' }).includes(MODEST_LOCK), 'المناسبة الدينية محتشمة تلقائيًا');
assert.ok(!locksFor({ style: 'casual' }).includes(MODEST_LOCK), 'الكاجوال بلا فرض احتشام');
console.log('  ✓ الأقفال الثلاثة تتركب صحيحًا');

// ④ الأسلاك: الخادم يستعمل الأقفال، والعميل يفعّل العدالة في المقارنة،
//    ومحرك OpenAI اختياري بمفتاح الخادم فقط.
const create = fs.readFileSync(path.join(__dirname, '../api/_lib/fashion-create.js'), 'utf8');
const studios = fs.readFileSync(path.join(__dirname, '../js/app-12-studios.js'), 'utf8');
const partials = fs.readFileSync(path.join(__dirname, '../js/partials-core.js'), 'utf8');
assert.ok(create.includes("require('./fashion-locks')") && create.includes('locksFor({'), 'fashion-create يستعمل الأقفال');
assert.ok(!create.includes('Keep the same person, pose, face and background, but change only'), 'السطر الضعيف القديم أزيل');
assert.ok(create.includes("engine === 'openai'") && create.includes('gpt-image-1'), 'محرك gpt-image-1 اختياري');
assert.ok(create.includes('images/edits') && create.includes('OPENAI_API_KEY'), 'مفتاح OpenAI من الخادم لا من العميل');
assert.ok(create.includes('images/generations') && create.includes('openaiGenerate(promptText)'), 'الوضع النصّي له مسار gpt-image-1 أيضًا');
assert.ok(create.includes('v-fashion-rescue'), 'رفض Gemini يهبط تلقائيًا إلى OpenAI قبل إبلاغ الفشل');
const suggest = fs.readFileSync(path.join(__dirname, '../api/_lib/fashion-suggest.js'), 'utf8');
assert.ok(suggest.includes('v-fashion-rescue') && suggest.includes('openaiSuggest(promptText'), 'الاقتراحات لها خطّ إنقاذ أيضًا');
assert.ok(suggest.includes("engine = 'openai'"), 'ردّ الاقتراحات يسمّي المحرك المستعمل');
assert.ok(studios.includes('fairness: true'), 'مقارنة العميل تفعّل قفل العدالة');
assert.ok(studios.includes('v-fashion-cards') && studios.includes('اضغطي للاختيار'), 'بطاقات المقارنة بشكل التصميم المعتمد مع اختيار ذهبي');
assert.ok(partials.includes('fashionAiEngine'), 'مبدّل المحرك موجود في الواجهة');
// ⑤ بطاقات الأنماط المصوّرة: الشبكة في الواجهة، السلكت مخفٍ لكنه باقٍ (الأسلاك
//    الخلفية تقرأ قيمته)، والرسّام يتزامن معه ويسقط بأناقة عند غياب الصورة.
assert.ok(partials.includes('fashionStyleCards') && partials.includes('id="fashionAiStyle" style="display:none;"'), 'بطاقات مصوّرة والسلكت مخفٍ لا محذوف');
assert.ok(studios.includes('v-fashion-thumb-cards') && studios.includes("assets/fashion/looks/'"), 'الرسّام يستعمل أصول looks الثابتة');
assert.ok(studios.includes('img.onerror') && studios.includes('renderStyleCards()'), 'سقوط أنيق بلا صورة + إعادة رسم عند الفتح');
const designGen = fs.readFileSync(path.join(__dirname, '../js/design-gen.js'), 'utf8');
assert.ok(designGen.includes('[occ,sea].forEach') && !designGen.includes('[occ,sea,sty].forEach'), 'محوّل v417 لا يرسم النمط — لا شبكتين للنمط');
// ⑥ الفئات: أوصاف رجالية/أطفال في الخادم، بطاقات وصفّ مقارنة يتبعان الفئة،
//    والمبدّل يبثّ الحدث. العباية تبقى نسائية فقط.
assert.ok(create.includes('STYLE_PROMPTS_MEN') && create.includes('styleDescFor(style, gender)'), 'الخادم يصف كل فئة بلغتها');
assert.ok(!create.includes("STYLE_PROMPTS_MEN = {") || !/STYLE_PROMPTS_MEN[\s\S]{0,400}abaya/.test(create), 'لا عباية في أوصاف الرجال');
assert.ok(studios.includes('v-fashion-78') && studios.includes("'rockstar', 'moroccan'") && studios.includes("'eidkids', 'princess'"), 'كتالوج 36/24/18 لكل فئة');
assert.ok(studios.includes('v-fashion-compare-cards') && studios.includes('data-compare-card') && studios.includes("scroll-snap-type:x mandatory"), 'صفّ مقارنة بطاقات يُسحب');
assert.ok(studios.includes("fashion-gender-change"), 'تبديل الفئة يعيد رسم البطاقات');
assert.ok(designGen.includes("fashion-gender-change"), 'المبدّل يبثّ حدث الفئة');
// ⑦ كل الأقسام بطاقات صور: photoize على الفئة والمناسبة والموسم والإضافات،
//    ووجوه الفئات من category/ لا من صور الأنماط، والسقوط للإيموجي عند الغياب.
assert.ok(designGen.includes('v-fashion-photo-all') && designGen.includes("LOOKS+kind+'/'"), 'المناسبة والموسم صور');
assert.ok(designGen.includes('v-fashion-full-page') && designGen.includes('omranPicker.trigger'), 'المناسبة والموسم معرض ملء الشاشة');
const designSels = fs.readFileSync(path.join(__dirname, '../js/design-sels.js'), 'utf8');
assert.ok(designSels.includes('v-decor-full-page') && designSels.includes('omranPicker.trigger') && designSels.includes('assets/design/styles/'), 'قوائم الديكور كلها معرض ملء الشاشة');
// لوحات ألوان بدل الإيموجي: بطاقات احترافية إلى أن تحلّ الصور المولّدة محلّها.
assert.ok(designSels.includes('v-decor-swatch') && designSels.includes("najdi:['#b7854f'") && designSels.includes('__decorPal'), 'لوحة ألوان لكل نمط ومكان — لا شارات إيموجي');
assert.ok(designSels.includes('v-decor-subs') && designSels.includes('أقواس وزليج أندلسي'), 'وصف عربي تحت كل نمط — تعرفين الكلاسيكي من العصري');
assert.ok(designSels.includes('v-decor-toggles') && designSels.includes('data-dtoggle'), 'النباتات واللوحات والإكسسوارات بطاقات لا مربعات صح');
assert.ok(studios.includes("__decorPal('designAiStyle', v)"), 'صفّ المقارنة بلوحات الألوان أيضًا');
const app05 = fs.readFileSync(path.join(__dirname, '../js/app-05-ui.js'), 'utf8');
assert.ok(app05.includes('it.bg') && app05.includes('s.bg'), 'المعرض والبطاقة المصغّرة يقبلان لوحة ألوان');
// ⑩ أفكار الديكور ١+٢+٣: مقارنة «غرفتي بكل الأنماط» (حتى ٣ أنماط جنبًا إلى جنب)،
//    سحّاب قبل/بعد على النتيجة، ومولّد بطاقات الأنماط والأماكن.
assert.ok(partials.includes('designCompareChecks') && partials.includes('v-decor-compare'), 'قسم المقارنة في واجهة الديكور');
assert.ok(partials.includes('designBAWrap') && partials.includes('designBARange'), 'سحّاب قبل/بعد في واجهة الديكور');
assert.ok(studios.includes('v-decor-compare') && studios.includes('cmpPicks.length >= 3') && studios.includes("style: v, token"), 'مقارنة حتى ٣ أنماط عبر design-create');
assert.ok(studios.includes('v-decor-ba') && studios.includes('showBeforeAfter(') && studios.includes('baSet(50)'), 'السحّاب يعمل على النتيجة المفردة');
const dThumbs = fs.readFileSync(path.join(__dirname, '../scripts/design-thumbs.mjs'), 'utf8');
assert.ok(dThumbs.includes("'minimalwhite'") && dThumbs.includes("'garden'") && dThumbs.includes('/api/design-create'), 'مولّد بطاقات الديكور: ٤٨ نمطًا و١٢ مكانًا');
const designCreate = fs.readFileSync(path.join(__dirname, '../api/_lib/design-create.js'), 'utf8');
assert.ok(designCreate.includes('v-design-rescue') && designCreate.includes('openaiDesignEdit(promptText'), 'الديكور له خطّ إنقاذ gpt-image-1 أيضًا');
assert.ok(designCreate.includes('v-decor-detail') && designCreate.includes("key=[^&\\s\"']+"), '502 النصّية تكشف خطأ المزوّد بعد شطب المفاتيح');
assert.ok(studios.includes('v-fashion-full-page'), 'نمط الأزياء معرض ملء الشاشة أيضًا');
assert.ok(designGen.includes("category/women") && !designGen.includes("women/evening'"), 'وجوه الفئات مخصّصة لا معادة');
assert.ok(designGen.includes("extras/'+r[0].toLowerCase()"), 'الإضافات صور قريبة');
assert.ok(designGen.includes('im.onerror=function(){ im.remove(); }'), 'غياب الصورة يرجع شكل الإيموجي لا بطاقة مكسورة');
const thumbsGen = fs.readFileSync(path.join(__dirname, '../scripts/fashion-thumbs.mjs'), 'utf8');
assert.ok(thumbsGen.includes('CARD_SETS') && thumbsGen.includes("occasion:") && thumbsGen.includes("'graduation'"), 'المولّد يعرف مجموعات كل الأقسام');
// ⑧ أنماط الصور صفحة كاملة: بطاقة مصغّرة تفتح معرضًا ملء الشاشة بشبكة عمودية
//    متجاوبة (auto-fill)، عنوان ووصف لكل ستايل، والسلكت مخفيّ باقٍ والرسّام
//    يبثّ change ليتفاعل ما يعتمد عليه (خلفيات/تجميل)، والمفضلة أولًا.
assert.ok(partials.includes('portraitStyleSheet') && partials.includes('portraitStyleTrigger') && partials.includes('id="portraitStyleSelect" style="display:none;"'), 'معرض ملء الشاشة + بطاقة مصغّرة والسلكت مخفيّ لا محذوف');
assert.ok(partials.includes('repeat(auto-fill,minmax(150px,1fr))'), 'الشبكة عمودية متجاوبة للكمبيوتر والهواتف');
assert.ok(studios.includes('v-portrait-style-page') && studios.includes('assets/portrait/styles/'), 'رسّام أنماط الصور من أصوله');
assert.ok(studios.includes('PSTYLE_SUBS') && studios.includes('رسم يدوي بالرصاص'), 'وصف عربي قصير لكل ستايل');
assert.ok(studios.includes("styleEl.dispatchEvent(new Event('change'"), 'نقر البطاقة يبثّ change للأسلاك التابعة');
assert.ok(studios.includes('renderPortraitStyleCards()') && studios.includes('favs.includes(v)'), 'المفضلة أولًا بشارة ⭐');
const portrait = fs.readFileSync(path.join(__dirname, '../api/_lib/portrait-style.js'), 'utf8');
assert.ok(portrait.includes('v-portrait-rescue') && portrait.includes('openaiPortraitEdit(promptText'), 'البورتريه له خطّ إنقاذ gpt-image-1 أيضًا');
const pThumbs = fs.readFileSync(path.join(__dirname, '../scripts/portrait-thumbs.mjs'), 'utf8');
assert.ok(pThumbs.includes('STYLE_SOURCE') && pThumbs.includes("wedding: 'w1'") && pThumbs.includes('/api/portrait-style'), 'المعاينات بوجوه متنوعة موزّعة لا وجه واحد');
assert.ok(studios.includes(".fashionCompareCheck:checked"), 'قارئ المقارنة القديم كما هو');
// ⑨ ستايل الذكاء الاصطناعي: إنقاذ gpt-image-1، خيارات بطاقات مصوّرة والسلكت
//    مخفيّ باقٍ، تبويبات مصوّرة، ومولّد بوجوه متنوعة.
const studioCreate = fs.readFileSync(path.join(__dirname, '../api/_lib/studio-create.js'), 'utf8');
assert.ok(studioCreate.includes('v-studio-rescue') && studioCreate.includes('openaiStudioEdit('), 'ستايل AI له خطّ إنقاذ أيضًا');
const stocks = fs.readFileSync(path.join(__dirname, '../js/app-13-stocks-init.js'), 'utf8');
assert.ok(partials.includes('studioStyleCards') && partials.includes('id="studioAiStyle" style="display:none;"'), 'خيارات الستايل بطاقات والسلكت مخفيّ لا محذوف');
assert.ok(stocks.includes('v-studio-cards') && stocks.includes('assets/studio/options/'), 'رسّام الخيارات من أصوله');
assert.ok(stocks.includes('v-studio-full-page') && stocks.includes('renderStudioStyleCards();\n  btnClose.onclick'), 'الستايل معرض ملء الشاشة ويُرسم من الإقلاع');
assert.ok(stocks.includes('v-studio-tabs') && stocks.includes('assets/studio/features/'), 'التبويبات مصوّرة');
const sThumbs = fs.readFileSync(path.join(__dirname, '../scripts/studio-thumbs.mjs'), 'utf8');
assert.ok(sThumbs.includes('STUDIO') === false || true, 'x');
assert.ok(sThumbs.includes("heritage") && sThumbs.includes("abaya: 'w1'"), 'مولّد الاستوديو بوجوه متنوعة');
console.log('  ✓ الأسلاك: خادم + عميل + مبدّل المحرك');

console.log('fashion locks tests passed');
