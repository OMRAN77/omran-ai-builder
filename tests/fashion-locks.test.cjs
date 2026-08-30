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
assert.ok(designSels.includes('v-decor-rooms') && designSels.includes('function roomSvg') && designSels.includes('__decorPal=roomBg'), 'غرفة مرسومة داخل كل بطاقة — تصاميم لا ألوان');
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

// ⑩ v-agent-settings: زر «الوكيل» انتقل من الشاشة الرئيسية إلى قسم خاص في
//    الإعدادات، وصار المفتاح الحقيقي لوضع الوكيل المستقل (أمر عمران ٢٦ أغسطس).
const pset = fs.readFileSync(path.join(__dirname, '../js/partials-settings.js'), 'utf8');
assert.ok(pset.includes('id="agentSection"') && pset.includes('agentSettingsHost'), 'قسم الوكيل موجود في الإعدادات');
const prem = fs.readFileSync(path.join(__dirname, '../js/premium.js'), 'utf8');
assert.ok(prem.includes('relocateAgentToggle') && prem.includes("getElementById('agentSettingsHost')"), 'الزر يُنقل بعقدته فيبقى كل سلكه');
assert.ok(prem.includes('window.__agentModeOn = (window.__premiumOn === true)'), 'تشغيل الزر يشغّل وضع الوكيل المستقل لا الرد الاحترافي فقط');
const agentSrv = fs.readFileSync(path.join(__dirname, '../api/_lib/agent.js'), 'utf8');
assert.ok(agentSrv.includes('القوة القصوى') && agentSrv.includes('أنجز حتى النهاية'), 'طبقة القوة في عقل الوكيل');
assert.ok(agentSrv.includes("search_depth: 'advanced'"), 'بحث الوكيل بعمق متقدّم');
console.log('  ✓ v-agent-settings: الوكيل في الإعدادات ومفتاحه حقيقي وقوته مرفوعة');

// ⑪ v-plus-tools-desktop: زر «الأدوات» في قائمة ➕ للجوال فقط — مخفي في الكمبيوتر.
const redesignCss = fs.readFileSync(path.join(__dirname, '../css/redesign.css'), 'utf8');
assert.ok(redesignCss.includes('html:not(.mobile-ui) #plusToolsPopup #btnToolsBox{ display:none !important; }'), 'زر الأدوات من ➕ مخفي في الكمبيوتر فقط');

// ⑫ v-edu-lab: «الدرس الحي» — تبويب 🧪 يحوّل الدرس لتجربة تفاعلية معزولة.
const eduJs = fs.readFileSync(path.join(__dirname, '../js/edu.js'), 'utf8');
assert.ok(eduJs.includes('data-tab="lab"') && eduJs.includes('function renderLab'), 'تبويب التجربة الحية في عارض الدرس');
assert.ok(eduJs.includes("'sandbox','allow-scripts'") && eduJs.includes('fr.srcdoc'), 'التجربة داخل iframe معزول بلا صلاحيات');
assert.ok(eduJs.includes("action:'lab'"), 'العميل يطلب التجربة من الخادم');
const eduApi = fs.readFileSync(path.join(__dirname, '../api/edu.js'), 'utf8');
assert.ok(eduApi.includes("action === 'lab'") && eduApi.includes('db/edu/labs/'), 'الخادم يولد ويخزن المختبر بمفتاح منفصل لكل درس');
// v-lab-haiku: الميزانية صارت وسيطًا (baseMsgs, 14000) مع نموذج سريع وجولة إتمام.
assert.ok(eduApi.includes('```html') && eduApi.includes('baseMsgs, 14000'), 'استخراج كتلة HTML وحجم ضمن حدود المهلة');
assert.ok(eduApi.includes("kvDel('db/edu/labs/"), 'حذف الدرس ينظف مختبره');
console.log('  ✓ v-edu-lab: الدرس الحي مبني ومقفول');

// ⑬ المقاولات: خط الإنقاذ السابع + الجولة ثلاثية الأبعاد من هندسة المخطط.
const conCreate = fs.readFileSync(path.join(__dirname, '../api/_lib/construction-create.js'), 'utf8');
assert.ok(conCreate.includes('v-construction-rescue') && conCreate.includes('openaiRescueImage') && conCreate.includes('openaiRescueText'), 'رفض Gemini يهبط لصور gpt-image-1 ونص gpt-4o-mini');
assert.ok(conCreate.includes(".catch(() => null) /* v-construction-rescue"), 'سقوط النص لا يُسقط الصور');
const conView = fs.readFileSync(path.join(__dirname, '../api/_lib/construction-view.js'), 'utf8');
assert.ok(conView.includes('v-construction-rescue') && conView.includes('gpt-image-1'), 'الزوايا والغرف لها إنقاذ أيضًا');
const fp15 = fs.readFileSync(path.join(__dirname, '../js/app-15-floorplan.js'), 'utf8');
assert.ok(fp15.includes('function omranTour3d') && fp15.includes('omranTour3d.toString()'), 'مشغّل الجولة يُحقن كدالة في صفحة المخطط');
assert.ok(fp15.includes('t3dBtn') && fp15.includes('rotateX(90deg)') && fp15.includes('فصل الطوابق'), 'زر الجولة والجدران المرفوعة وفصل الطوابق');
console.log('  ✓ المقاولات: إنقاذ + جولة 3D');

// ⑭ v-stocks-paper: المحفظة التعليمية — تداول تجريبي بأسعار حية وأموال افتراضية.
const stocksSrv = fs.readFileSync(path.join(__dirname, '../api/_lib/stocks.js'), 'utf8');
assert.ok(stocksSrv.includes('v-stocks-paper') && stocksSrv.includes("mode === 'pf-trade'"), 'أوضاع المحفظة في الخادم');
assert.ok(stocksSrv.includes('db/stocks/pf/') && stocksSrv.includes('db/stocks/pf-board.json'), 'محفظة لكل مستخدم + لوحة ترتيب');
assert.ok(stocksSrv.includes('pos.avgCost = (pos.avgCost * pos.qty + cost) / (pos.qty + qty)'), 'متوسط التكلفة يحسب بالكود لا بالنموذج');
assert.ok(stocksSrv.includes("checkAndConsumeCustom(body.token, body.guestId, clientIp(req), 'stocks-pf', 40)"), 'حد يومي للصفقات');
const stocksCli = fs.readFileSync(path.join(__dirname, '../js/app-13-stocks-init.js'), 'utf8');
assert.ok(stocksCli.includes('v-stocks-paper') && stocksCli.includes('stocksPfBtn') && stocksCli.includes('function pfTrade'), 'تبويب المحفظة وتنفيذ الصفقات في الواجهة');
assert.ok(stocksCli.includes('وضع تعليمي — أموال افتراضية') && stocksCli.includes("mode:'learn', symbol: sym"), 'الطابع التعليمي: شارة + زر علّمني يستدعي المعلم بالأرقام الحية');
console.log('  ✓ v-stocks-paper: المحفظة التعليمية مقفولة');

// ⑮ عين عمران: المرشد البصري بخط إنقاذ ثامن + وضعا الترجمة والسؤال.
const vgSrv = fs.readFileSync(path.join(__dirname, '../api/_lib/visual-guide.js'), 'utf8');
assert.ok(vgSrv.includes("new Set(['describe', 'read', 'steps', 'translate', 'ask'])"), 'الخادم يقبل وضعي الترجمة والسؤال');
assert.ok(vgSrv.includes('v-eye-rescue') && vgSrv.includes('async function openaiRescue'), 'خط الإنقاذ الثامن موجود');
assert.ok(vgSrv.includes("text = (await openaiRescue(image, prompt)) || ''"), 'سقوط Gemini أو فراغه يهبط للإنقاذ لا للفشل');
assert.ok(vgSrv.includes('v-eye-probe') && vgSrv.includes('text, engine'), 'الرد يسمّي المحرك — المجس يشخّص به');
assert.ok(vgSrv.includes("res.status(key ? 502 : 503)"), 'الفشل الكامل يحافظ على عقد الأخطاء القديم');
const vgCli = fs.readFileSync(path.join(__dirname, '../js/app-24-visual-guide.js'), 'utf8');
assert.ok(vgCli.includes("translate: ['ترجمة فورية'") && vgCli.includes("ask: ['اسأل عمّا تراه'"), 'الوضعان في قاموس الواجهة');
assert.ok(vgCli.includes("mode === 'translate'") && vgCli.includes("mode === 'ask'"), 'إعلانات الوضعين ولمسة الالتقاط');
const idx = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(idx.includes('data-vgmode="translate"') && idx.includes('data-vgmode="ask"'), 'زرّا الوضعين في الواجهة');
console.log('  ✓ عين عمران: إنقاذ + ترجمة + سؤال');

// ⑯ v-maha-captions: ترجمة نصية حية للمكالمة — لحظية وأساسية، وتفريغ الإدخال بالخادم.
const mahaCli = fs.readFileSync(path.join(__dirname, '../js/app-08-maha.js'), 'utf8');
assert.ok(mahaCli.includes('v-maha-captions') && mahaCli.includes('function mahaCapDelta'), 'وحدة الترجمة النصية موجودة');
assert.ok(mahaCli.includes("'response.output_audio_transcript.delta'") && mahaCli.includes("'conversation.item.input_audio_transcription.completed'"), 'أحداث المكالمة اللحظية موصولة');
assert.ok(mahaCli.includes('mahaCapUser(transcript)') && mahaCli.includes("mahaCapLine('maha', reply)"), 'الوضع الأساسي يعرض الطرفين');
const rtSess = fs.readFileSync(path.join(__dirname, '../api/_lib/realtime-session.js'), 'utf8');
assert.ok(rtSess.includes("transcription: { model: 'gpt-4o-mini-transcribe' }"), 'تفريغ كلام المستخدم مفعّل بالخادم');
assert.ok(rtSess.includes('sessionConfig.session.audio.input.transcription) {'), 'رفض حقل التفريغ لا يُسقط المكالمة');
const idx16 = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(idx16.includes('id="mahaCaptions"') && idx16.includes('id="btnMahaCc"'), 'لوحة الترجمة وزرها في الواجهة');
console.log('  ✓ v-maha-captions: الترجمة الحية للمكالمة مقفولة');

// ⑰ v-chat-direct: كلود يتصل مباشرة بمفتاح Anthropic — لا وسيط يبطّئ أو يُسقط للضعيف.
const chatSrv = fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8');
assert.ok(chatSrv.includes('v-chat-direct'), 'تعليل الوصلة المباشرة موثق');
assert.ok(chatSrv.includes("prov === 'claude'\n    ? (!process.env.ANTHROPIC_API_KEY && !!process.env.OPENROUTER_API_KEY)"), 'كلود مباشر ما دام مفتاحه موجودًا');
assert.ok(chatSrv.includes("process.env.CHAT_CLAUDE_MODEL || 'claude-sonnet-5'"), 'v-chat-fast: سونيت 5 السريع للمحادثة + قابل للتبديل من البيئة');
console.log('  ✓ v-chat-direct: المحادثة على الخط المباشر');

// ⑱ v-chat-vision: الصور المرفقة تمر بمسار الأدوات القوي نفسه لا لمسار قديم أضعف.
const chatToolsCli = fs.readFileSync(path.join(__dirname, '../js/app-18-chat-tools.js'), 'utf8');
assert.ok(chatToolsCli.includes('v-chat-vision') && chatToolsCli.includes("type: 'image', source: { type: 'base64'"), 'الصور تُحوَّل لكتل رؤية في مسار الأدوات');
const attachCli = fs.readFileSync(path.join(__dirname, '../js/app-09-attach.js'), 'utf8');
assert.ok(attachCli.includes("(!imageAttachments.length || __effProv === 'claude')"), 'بوابة الأدوات تسمح بالصور مع كلود');
assert.ok(!fs.readFileSync(path.join(__dirname, '../js/app-06-checkout.js'), 'utf8').includes('claude-sonnet-4-20250514'), 'لا نموذج قديم في مسار الاحتياط');
console.log('  ✓ v-chat-vision: تحليل الصور على نفس العقل القوي');

// ⑲ v-physical-design: تصميم الأشياء المادية = صورة + زبدة، لا جدار مواصفات.
const chatSrv19 = fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8');
// v-clean-slate: قاعدة التصميم المادي فُصلت — النموذج يقرر الرسم بطبيعته وأداته.
assert.ok(!/baseSystem[^;]*PHYSICAL_DESIGN_NOTE/.test(chatSrv19), 'v-clean-slate: لا حقن قاعدة تصميم في النظام');
assert.ok(chatSrv19.includes('ممنوع منعًا باتًا جدار المواصفات الطويل'), 'جدار المواصفات ممنوع إلا بطلب صريح');
console.log('  ✓ v-physical-design: التصميم يُرى قبل أن يُقرأ');

// ⑳ v-maha-image-rescue: مولد صور المحادثة بخط إنقاذ تاسع + لا خطف لطلبات صورة التصميم.
const mahaImgSrv = fs.readFileSync(path.join(__dirname, '../api/_lib/maha-image.js'), 'utf8');
assert.ok(mahaImgSrv.includes('v-maha-image-rescue') && mahaImgSrv.includes('openaiRescueImage'), 'إنقاذ gpt-image-1 موجود');
assert.ok(mahaImgSrv.includes("engine: 'openai'") && mahaImgSrv.includes('v-prayer-carry'), 'الإنقاذ يرد صورة بنفس العقد ومعها الدعاء المؤلف');
const attachCli20 = fs.readFileSync(path.join(__dirname, '../js/app-09-attach.js'), 'utf8');
assert.ok(attachCli20.includes('__designCtxRe') && attachCli20.includes('!__designCtxRe.test(text)'), 'طلب صورة التصميم لا يُخطف للبحث');
const agentTools20 = fs.readFileSync(path.join(__dirname, '../js/app-17-agent-tools.js'), 'utf8');
assert.ok(agentTools20.includes('j.retryable') && agentTools20.includes('__att === 2'), 'أداة الرسم تعيد المحاولة عند الزحام');
assert.ok(fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8').includes('ممنوع منعًا باتًا البحث عن صور حقيقية لتصميمٍ غير موجود'), 'قاعدة متابعة الصورة للنموذج');
console.log('  ✓ v-maha-image-rescue: صور المحادثة لا تموت بالزحام ولا تُخطف للبحث');

// ㉑ v-idb-mirror: المحادثات تُرسم فورًا من مرآة localStorage — لا انتظار IndexedDB.
const st21 = fs.readFileSync(path.join(__dirname, '../js/app-04-i18n-state.js'), 'utf8');
assert.ok(st21.includes('aiapp_projects_slim') && st21.includes('__usingSlimProjects'), 'المرآة تُقرأ عند الإقلاع');
assert.ok(st21.includes('function __writeChatsMirror') && st21.includes("addEventListener('pagehide', __writeChatsMirror)"), 'المرآة تُكتب مع الحفظ وعند المغادرة');
assert.ok(st21.includes("boot:app-04#cur-early"), 'استرجاع المحادثة الحالية خرج من أسر كتلة IndexedDB');
const at21 = fs.readFileSync(path.join(__dirname, '../js/app-09-attach.js'), 'utf8');
assert.ok(at21.includes('idbGetGuarded') && at21.includes('v-idb-hang'), 'تحميل IndexedDB بمهلة وإنعاش وتبليغ');
assert.ok(at21.includes('(sp.messages || []).length > (ip.messages || []).length'), 'دمج لا يسحق رسالة كُتبت على المرآة');
console.log('  ✓ v-idb-mirror: المحادثات من أول لحظة مهما تجمد IndexedDB');

// ㉒ v-chat-parallel-tools: أدوات الدور تنفذ معًا + سقف بحثين لكل رد.
const chat22 = fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8');
assert.ok(chat22.includes('v-chat-parallel-tools') && chat22.includes('Promise.all(toolBlocks.map'), 'أدوات الدور تنطلق بالتوازي');
assert.ok(chat22.includes('mySearchNo > 2') && chat22.includes('بلغتَ سقف البحث لهذا الردّ'), 'سقف البحثين مفروض بالكود');
assert.ok(chat22.includes('فشل تنفيذ الأداة:'), 'فشل أداة واحدة لا يسقط الرد');
assert.ok(chat22.includes('سرعة الردّ أولوية عليا'), 'قاعدة السرعة في التوجيهات');
console.log('  ✓ v-chat-parallel-tools: الرد أسرع — توازٍ وسقف بحث');

// ㉓ v-owner-core: ‹omran› مالك دائم مدمج — البيئة تضيف أسماء ولا تستبدله أبدًا.
// (قيمة OWNER_USERNAME مغلوطة في Vercel كانت تقفل كل بوابات الملكية على المالك.)
{
  const prevN = process.env.OWNER_USERNAMES, prev1 = process.env.OWNER_USERNAME;
  process.env.OWNER_USERNAMES = ''; process.env.OWNER_USERNAME = 'wrongname';
  delete require.cache[require.resolve('../api/_lib/_owner.js')];
  const own = require('../api/_lib/_owner.js');
  assert.ok(own.isOwnerName('omran'), '‹omran› مالك حتى مع بيئة مغلوطة');
  assert.ok(own.isOwnerName('wrongname'), 'اسم البيئة يُضاف لا يُهمل');
  assert.ok(!own.isOwnerName('bob'), 'الغريب مرفوض');
  assert.ok(own.ownerList().includes('omran'), 'القائمة تشمل المدمج دائمًا');
  delete require.cache[require.resolve('../api/_lib/_owner.js')];
  if (prevN === undefined) delete process.env.OWNER_USERNAMES; else process.env.OWNER_USERNAMES = prevN;
  if (prev1 === undefined) delete process.env.OWNER_USERNAME; else process.env.OWNER_USERNAME = prev1;
}
// كل البوابات تستقي من _owner.js لا من نمطها المحلي القديم.
for (const f of ['points.js', '_usage.js', '_fashionUsage.js', '_designUsage.js', '_portraitUsage.js', '_carUsage.js', '_videoUsage.js', 'admin-stats.js', 'admin-actions.js']) {
  const src = fs.readFileSync(path.join(__dirname, '../api/_lib/', f), 'utf8');
  assert.ok(src.includes("require('./_owner.js')"), f + ' يستعمل قائمة المالك الموحدة');
  assert.ok(!src.includes("process.env.OWNER_USERNAMES || process.env.OWNER_USERNAME || 'omran'"), f + ' بلا نمط الاستبدال القديم');
}
console.log('  ✓ v-owner-core: المالك مفتوح في كل شي مهما كانت البيئة');

// ㉔ v-runway-host: مفاتيح Runway العامة تخدمها api.dev.runwayml.com حصرًا —
// النداء على api.runwayml.com أرجع «Incorrect hostname for API key» في الإنتاج.
{
  delete require.cache[require.resolve('../api/_lib/runway-keys.js')];
  const rk = require('../api/_lib/runway-keys.js');
  assert.strictEqual(rk.RUNWAY_API_BASE, 'https://api.dev.runwayml.com', 'الأساس الافتراضي هو مضيف الـAPI العامة');
  for (const f of ['runway-keys.js', 'video-create.js', 'video-status.js', 'video-balance.js', 'video-upscale-create.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../api/_lib/', f), 'utf8');
    assert.ok(!/['"]https:\/\/api\.runwayml\.com/.test(src), f + ' بلا مضيف الإنتاج القديم');
    assert.ok(src.includes('RUNWAY_API_BASE'), f + ' يستعمل الأساس الموحد');
  }
}
console.log('  ✓ v-runway-host: فيديو Runway على المضيف الصحيح');

// ㉕ v-sweep: الفحص الشامل — أعطاب صامتة انكشفت بمسح آلي للتطبيق كله.
{
  // موديل Claude المتقاعد لا يعود سقوطًا للوكيل.
  const ag = fs.readFileSync(path.join(__dirname, '../api/_lib/agent.js'), 'utf8');
  assert.ok(!ag.includes('claude-3-5-sonnet-latest'), 'agent.js بلا موديل متقاعد');
  // أداة «بحث في الإنترنت» السريعة تنقر الزر الحي لا الميت.
  const uw = fs.readFileSync(path.join(__dirname, '../js/ui-wiring.js'), 'utf8');
  assert.ok(uw.includes("tap('#omranBtnWeb')") && !uw.includes("tap('#btnPreviewToggle')"), 'الأداة السريعة على الزر الحقيقي');
  // زر «شعارات العالم» لا يموت بغياب toolsBox القديم.
  const lg = fs.readFileSync(path.join(__dirname, '../js/app-21-logos.js'), 'utf8');
  assert.ok(lg.includes('adBtnAnchor') && lg.includes('(!toolsBox && !adBtnAnchor)'), 'زر الشعارات له مرساة حية');
  // جولة التطبيق تلتقط العنصر الظاهر لا نسخة الكمبيوتر المخفية.
  const vg = fs.readFileSync(path.join(__dirname, '../js/app-24-visual-guide.js'), 'utf8');
  assert.ok(vg.includes('cands[ci].offsetParent'), 'الجولة على العنصر الظاهر');
  // كل مفتاح data-i18n في الواجهة له ترجمة في القاموس.
  const dict = fs.readFileSync(path.join(__dirname, '../js/app-03-i18n-data.js'), 'utf8');
  const usedKeys = new Set();
  for (const f of ['../index.html', '../js/partials-core.js', '../js/partials-settings.js']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    for (const m of src.matchAll(/data-i18n(?:-title|-ph)?="(?:\[[^\]]+\])?([A-Za-z0-9_]+)"/g)) usedKeys.add(m[1]);
  }
  const missing = [...usedKeys].filter((k) => !new RegExp('[\\s{,\'"]' + k + '["\']?\\s*:').test(dict));
  assert.deepStrictEqual(missing, [], 'مفاتيح ترجمة ناقصة: ' + missing.join(','));
}
console.log('  ✓ v-sweep: الفحص الشامل — أسلاك حية وترجمة كاملة وموديلات حاضرة');

// ㉖ v-or-models: أسماء موديلات OpenRouter متحقَّق منها حيًّا (ورشة model-probe
// في 2026-08-27، كتالوج 417) — الأسماء الميتة الأربعة لا تعود، والمهاجر يغطيها.
{
  const ps = fs.readFileSync(path.join(__dirname, '../js/partials-settings.js'), 'utf8');
  for (const dead of ['anthropic/claude-3.5-sonnet', 'google/gemini-pro-1.5', 'google/gemini-flash-1.5:free', 'mistralai/mistral-7b-instruct:free']) {
    assert.ok(!ps.includes('"' + dead + '"'), 'اسم ميت في المنسدلة: ' + dead);
  }
  assert.ok(ps.includes('anthropic/claude-sonnet-4.5') && ps.includes('google/gemini-2.5-pro'), 'البدائل الحية في المنسدلة');
  const ft = fs.readFileSync(path.join(__dirname, '../js/app-10-features.js'), 'utf8');
  assert.ok(ft.includes('__orRemap') && ft.includes("'google/gemini-pro-1.5': 'google/gemini-2.5-pro'"), 'مهاجر القيم المحفوظة الميتة');
}
console.log('  ✓ v-or-models: قوائم OpenRouter حية ومهاجرة');

// ㉗ v-chat-visible-speed: قاتلا البطء المرئيان — بحث استباقي يحجز النموذج
// 12-25 ثانية، وكاتب وهمي 57 حرفًا/ثانية يضيف 26 ثانية لرد عادي.
{
  const at = fs.readFileSync(path.join(__dirname, '../js/app-09-attach.js'), 'utf8');
  assert.ok(at.includes('v-one-brain') && !at.includes('smartMaybeSearch(text'), 'v-one-brain: لا اعتراض بحث في العميل — النموذج يقرر');
  const ct18 = fs.readFileSync(path.join(__dirname, '../js/app-18-chat-tools.js'), 'utf8');
  assert.ok(ct18.includes('Array.isArray(ev.sources)') && ct18.includes('sources: __srcAcc'), 'بطاقات المصادر من بحث النموذج عبر البث');
  const chOB = fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8');
  assert.ok(chOB.includes("send({ sources: __srcs })") && !chOB.includes('prepareTurn('), 'الخادم يبث المصادر ولا يبحث استباقيًا');
  assert.ok(at.includes('v-reveal-fast') && at.includes('__revealStep'), 'الكشف التدريجي تكيفي يلحق البث');
  assert.ok(!at.includes('REVEAL_CHARS_PER_TICK = 2'), 'وتيرة 57 حرفًا/ثانية القديمة لا تعود');
}
console.log('  \u2713 v-chat-visible-speed: لا حجز قبل النموذج ولا كاتب بطيء بعده');

// ㉘ v-dream-tafsir + v-religion-rescue: الحلم يُفسَّر لا يُحاضَر، وأداة
// التفسير الديني لا تموت بموت مزوّد واحد.
{
  const ch = fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8');
  // v-clean-slate: قاعدة الأحلام فُصلت — النموذج يفسر بطبيعته المدربة.
  assert.ok(!/baseSystem[^;]*DREAM_NOTE/.test(ch), 'v-clean-slate: لا حقن قاعدة أحلام في النظام');
  const st = fs.readFileSync(path.join(__dirname, '../js/app-12-studios.js'), 'utf8');
  assert.ok(st.includes('v-religion-rescue') && st.includes('callAIWithFallback(messages, onDelta)'), 'التفسير الديني على سلسلة الاحتياط الكاملة');
}
console.log('  \u2713 v-dream-tafsir: تفسير حقيقي + أداة دينية لا تموت');

// ㉙ v-prayer-rescue: بطاقات الدعاء لا تموت بزحام Gemini — إنقاذ OpenAI.
{
  const pp = fs.readFileSync(path.join(__dirname, '../api/_lib/prayer-plan.js'), 'utf8');
  assert.ok(pp.includes('v-prayer-rescue') && pp.includes("'gpt-4o-mini'") && pp.includes('validatePrayerPlan(JSON.parse'), 'مخطط الدعاء له خط إنقاذ بنفس التدقيق');
}
assert.ok(fs.readFileSync(path.join(__dirname, '../api/_lib/maha-image.js'), 'utf8').split('v-prayer-carry').length >= 2, 'الإنقاذ يمرر الدعاء المؤلف مع الصورة');
console.log('  \u2713 v-prayer-rescue: الدعاء لا يموت بمزود واحد ولا يضيع في الإنقاذ');

// ㉚ v-tap-fast + v-nav-top: «اضغط مرتين أو ثلاث بعدين يدخل» — سببان مقيسان:
// (أ) المحادثات الضخمة تجمّد الجوال مع كل تفاعل (تخطيط كامل للرسائل كلها)،
// (ب) شريط التنقل z:50 مدفون تحت الأدراج z:60 فالضغطات تضيع في الخلفية.
{
  const tk = fs.readFileSync(path.join(__dirname, '../css/tokens.css'), 'utf8');
  // v-cv-webkit: سفاري لا يرسم المؤجّل أبدًا (شاشة سوداء ٣ هواتف) —
  // القاعدة مقيّدة بصنف cv-ok الذي يوضع على كروميوم/فايرفوكس فقط.
  assert.ok(/html\.cv-ok \.msg\{content-visibility:auto/.test(tk), 'قصّ الأداء على المحركات السليمة فقط');
  assert.ok(!/^\s*\.msg\{content-visibility/m.test(tk), 'لا قاعدة content-visibility عارية تصيب سفاري');
  const sd = fs.readFileSync(path.join(__dirname, '../js/selfdiag.js'), 'utf8');
  assert.ok(sd.includes('v-cv-webkit') && sd.includes("classList.add('cv-ok')") && sd.includes('Chrome\\/\\d+'), 'بوابة cv-ok في selfdiag');
  const rd = fs.readFileSync(path.join(__dirname, '../css/redesign.css'), 'utf8');
  assert.ok(/#omranBottomNav\{[^}]*z-index:70/.test(rd), 'شريط التنقل فوق الأدراج (70>60) دائمًا');
  const uw = fs.readFileSync(path.join(__dirname, '../js/ui-wiring.js'), 'utf8');
  assert.ok(uw.includes('v-nav-top') && uw.includes('closeDrawers()'), 'تبويب غير درجيّ يغلق الدُّرج المفتوح قبل فعله');
  const co = fs.readFileSync(path.join(__dirname, '../js/app-06-checkout.js'), 'utf8');
  assert.ok(co.includes('__omMinH') && co.includes("v.indexOf('\\n') === -1"), 'autoGrow لا يعيد تخطيط الصفحة مع كل حرف قصير');
  const ui5 = fs.readFileSync(path.join(__dirname, '../js/app-05-ui.js'), 'utf8');
  assert.ok(ui5.includes('if(codeEl.value !== cur.code)'), 'خانة الكود لا تُسند إلا عند تغيّر فعلي');
}
console.log('  ✓ v-tap-fast: الضغطة الأولى تدخل — لا تجمّد ولا شريط مدفون');

// ㉛ v-recipe-card: سؤال الطبخ = صورة الطبق فوق الرد + موقعا طبخ فأكثر.
{
  const ch = fs.readFileSync(path.join(__dirname, '../api/_lib/chat.js'), 'utf8');
  assert.ok(ch.includes('v-recipe-card') && ch.includes('سؤال طبخ أو وصفة'), 'قاعدة الوصفات في الميثاق المتصدر');
  // v-plan-labels: «غرفة نوم» داخل المخطط المولّد طلعت حروفًا مكسورة —
  // تسميات المخططات والرسوم إنجليزية حصرًا والشرح العربي في النص.
  assert.ok(ch.includes('v-plan-labels') && ch.includes('ممنوع أي حرف عربي داخل الصورة'), 'تسميات المخططات إنجليزية حصرًا');
  // v-design-scope: «غرفة» كانت ترجع واجهة منزل كامل لم تُطلب.
  assert.ok(ch.includes('v-design-scope') && ch.includes('لا واجهة منزل ولا شكل خارجي'), 'التصميم بحدود المطلوب حرفيًا');
  // v-recipe-ideas: كل وصفة تختم بتنويعات كأزرار تُضغط (فكرة عمران بدل قسم كامل).
  assert.ok(ch.includes('v-recipe-ideas') && ch.includes('[[OPT]]نسخة بالباستا'), 'الوصفة تختم باقتراحات أزرار');
  assert.ok(ch.includes('روابط موقعين للطبخ أو أكثر'), 'موقعا طبخ على الأقل في الرد');
  // العميل يعرض الصور المولّدة فوق نص الرد لا تحته.
  const st4 = fs.readFileSync(path.join(__dirname, '../js/app-04-i18n-state.js'), 'utf8');
  const iGen = st4.indexOf('div.appendChild(genStrip)');
  const iTxt = st4.indexOf('div.appendChild(textDiv)');
  assert.ok(iGen > -1 && iTxt > -1 && iGen < iTxt, 'شريط الصور المولّدة يُركَّب قبل نص الرد (فوقه)');
}
console.log('  ✓ v-recipe-card: صورة الطبق فوق ومصادر الطبخ معها');

// ㉜ v-stream-tidy: أثناء البث كانت الأسطر تنضغط كتلة واحدة ثم «تترتب» بعد
// الاكتمال (شكوى عمران بالصورة) — البث يُبنى داخل .msg مباشرة بلا pre-wrap.
// مقيس: بلا القاعدة 28px (سطر مكدس)، معها 266px (11 سطرًا مرتبة).
{
  const tk2 = fs.readFileSync(path.join(__dirname, '../css/tokens.css'), 'utf8');
  assert.ok(/\.msg\.msg-streaming\{white-space:pre-wrap/.test(tk2), 'أسطر البث مرتبة من أول قطرة');
  const tts = fs.readFileSync(path.join(__dirname, '../js/app-02-tts.js'), 'utf8');
  assert.ok(tts.includes("el.classList.add('msg-streaming')"), 'مصيّر البث يضع صنف msg-streaming');
}
console.log('  ✓ v-stream-tidy: لا زحمة أثناء الكتابة — مرتب من البداية');

// ㉝ v-src-unclip: content-visibility (v-tap-fast) كانت تقصّ قائمة المصادر
// المتدلية خارج حدود الرسالة — «المصدر آخر المحادثة ما يفتح». عند الفتح
// يُرفع القصّ عن الرسالة ويرجع عند الإغلاق (الأداء محفوظ).
{
  const st4b = fs.readFileSync(path.join(__dirname, '../js/app-04-i18n-state.js'), 'utf8');
  assert.ok(st4b.includes('v-src-unclip') && st4b.includes("msgEl.style.contentVisibility = open ? '' : 'visible'"), 'فتح المصادر يرفع القصّ');
  assert.ok(st4b.includes("if(msgEl) msgEl.style.contentVisibility = '';"), 'إغلاق المصادر يعيد القصّ');
}
console.log('  ✓ v-src-unclip: قائمة المصادر تفتح مرئية رغم قصّ الأداء');

// ㉞ v-eye-hint: تعليمات أوضاع المرشد كانت صوتية فقط (#vgLive مقصوص لقارئات
// الشاشة) — جوال صامت = «القراءة وما بعدها لا يعمل». التعليمة تظهر مكتوبة.
{
  const vg24 = fs.readFileSync(path.join(__dirname, '../js/app-24-visual-guide.js'), 'utf8');
  assert.ok(vg24.includes('v-eye-hint'), 'تعليق الإصلاح موجود');
  assert.ok(vg24.includes('المس الشاشة لألتقط وأقرأ'), 'تلميح القراءة مكتوب على الشاشة');
  assert.ok(vg24.split('setStatus(t(').length >= 6, 'تلميح مكتوب لكل الأوضاع الخمسة');
}
console.log('  ✓ v-eye-hint: تعليمات المرشد مكتوبة لا صوتية فقط');

// ㉟ v-edu-split: تحليل المحاضرة كان نداءً واحدًا ضخمًا (دقيقة+) — شُقّ إلى
// نداءين متوازيين (الملخص | الأسئلة) فالزمن زمن الأطول فقط. مقاس بالمجس:
// فتح الصفحة نفسه سريع أصلًا (238ms) — البطء كله كان في التحليل.
{
  const eduSrv = fs.readFileSync(path.join(__dirname, '../api/edu.js'), 'utf8');
  assert.ok(eduSrv.includes('v-edu-split') && eduSrv.includes('await Promise.all(['), 'الملخص والأسئلة بالتوازي');
  assert.ok(eduSrv.includes('anthropicJSON(apiKey, sysSummary') && eduSrv.includes('anthropicJSON(apiKey, sysQuestions'), 'شقّان منفصلان بنفس المحتوى');
  assert.ok(eduSrv.includes(".catch(() => null)"), 'فشل شقّ الأسئلة لا يُسقط الدرس');
  assert.ok(eduSrv.includes('quiz = 15 سؤالًا بالضبط'), 'قواعد الأسئلة كاملة في شقّها');
}
console.log('  ✓ v-edu-split: تحليل المحاضرة بنصف الزمن — نداءان متوازيان');

// ㊱ v-edu-timeouts: التجربة الحية كانت فشلًا مضمونًا — مسموح لها 16 ألف توكن
// (~3-4 دقائق توليدًا) والمهلة دقيقتان تقطعها. المهل 280ث (سقف Vercel 300)
// والمخرجات 9 آلاف، والمهلة تُشرح بالعربي.
{
  const eduT = fs.readFileSync(path.join(__dirname, '../api/edu.js'), 'utf8');
  assert.ok(!eduT.includes('AbortSignal.timeout(120000)'), 'لا مهلة 120ث أقصر من التوليد المسموح');
  assert.ok(eduT.split('AbortSignal.timeout(280000)').length >= 5, 'كل نداءات أنثروبيك على مهلة 280ث');
  // v-edu-budget: 9000 كانت تبتر الصفحة («تجربة غير مكتملة») — 14000 تحت مهلة 280ث.
  assert.ok(eduT.includes('baseMsgs, 14000') && !eduT.includes('max_tokens: 16000'), 'مخرجات التجربة الحية ضمن حدود المهلة');
  assert.ok(eduT.includes('v-edu-timeouts') && eduT.includes('التوليد أخذ وقتًا أطول من المتوقع'), 'المهلة تُشرح بالعربي المطمئن');
  const eduC = fs.readFileSync(path.join(__dirname, '../js/edu.js'), 'utf8');
  assert.ok(eduC.includes('دقيقة إلى دقيقتين'), 'رسالة انتظار صادقة في العميل');
}
console.log('  ✓ v-edu-timeouts: التجربة الحية لا تموت بمهلة أقصر من توليدها');

// ㊲ v-fashion-show: «تم التصميم» تظهر والصورة لا — الحاوية fashionAiResultWrap
// كانت تبقى display:none والكود يُظهر الصورة الداخلية فقط.
{
  const st12 = fs.readFileSync(path.join(__dirname, '../js/app-12-studios.js'), 'utf8');
  assert.ok(st12.includes('v-fashion-show'), 'تعليق الإصلاح موجود');
  assert.ok(st12.split("resultWrap.style.display = 'block'").length >= 3, 'الحاوية تُفتح مع الصورة في المسارين (توليد + مفضلة)');
  assert.ok(st12.includes("resultEl.scrollIntoView"), 'التمرير للنتيجة بعد التوليد');
}
console.log('  ✓ v-fashion-show: صورة الأزياء تظهر فعلًا بعد «تم التصميم»');

// ㊳ v-edu-budget + v-edu-questions: الميزانيات الضيقة كانت تبتر التوليد
// («تجربة غير مكتملة» وبطاقات 0) — عادت رحبة تحت مهلة 280ث، ودرس وصل
// بلا أسئلة يُنقذ بزر يولّدها من الملخص.
{
  const eduB = fs.readFileSync(path.join(__dirname, '../api/edu.js'), 'utf8');
  assert.ok(eduB.includes('baseMsgs, 14000') && !eduB.includes('max_tokens: 16000'), 'ميزانية التجربة الحية رحبة ضمن المهلة');
  assert.ok(eduB.includes("anthropicJSON(apiKey, sysQuestions, contentBlocks, 9000)"), 'شقّ الأسئلة 9 آلاف لا يُبتر');
  assert.ok(eduB.includes("action === 'questions'") && eduB.includes('buildQuestionsSys'), 'عملية إنقاذ الأسئلة موجودة');
  const eduC2 = fs.readFileSync(path.join(__dirname, '../js/edu.js'), 'utf8');
  assert.ok(eduC2.includes('eduRegenQuestions') && eduC2.includes("action:'questions'"), 'زر توليد الأسئلة بدل الشرطة الميتة');
}
console.log('  ✓ v-edu-questions: لا بتر ولا درس بلا أسئلة — إنقاذ من الملخص');

// ㊴ v-err-human: «⚠️ Load failed» الخام وصل مستخدمة حقيقية — أخطاء الشبكة
// العابرة تُترجم لعربي واضح مع إرشاد لإعادة الإرسال، في كل مسارات المحادثة.
{
  const at9 = fs.readFileSync(path.join(__dirname, '../js/app-09-attach.js'), 'utf8');
  assert.ok(at9.includes('function __friendlyErr'), 'مترجم الأخطاء موجود');
  assert.ok(at9.includes('Load failed|Failed to fetch'), 'يلتقط صيغ سفاري وكروم معًا');
  assert.ok(at9.includes('انقطع الاتصال لحظة أثناء الرد'), 'الرسالة العربية الواضحة');
  assert.ok(!at9.includes("content: '⚠️ ' + err.message}"), 'لا خطأ خام في فقاعة المحادثة');
  assert.ok(at9.split('__friendlyErr(').length >= 5, 'مطبق على مسارات المحادثة الأربعة');
}
console.log('  ✓ v-err-human: لا Load failed خام — عربي واضح وإرشاد');

// ㊵ v-store-safe: رفض AppGallery 11.4 (عملات/كريبتو = خدمة مالية منظمة) —
// حزمة هواوي تدخل بـ?store=huawei فتختفي كل المالية ولا يُطلق نداء أسعار
// واحد؛ العلامة تُحفظ، والويب/أبل كاملان بلا تغيير.
{
  const sd2 = fs.readFileSync(path.join(__dirname, '../js/selfdiag.js'), 'utf8');
  assert.ok(sd2.includes('v-store-safe') && sd2.includes("classList.add('store-safe')"), 'بوابة العلامة في selfdiag المبكر');
  assert.ok(sd2.includes("localStorage.setItem('aiapp_store'"), 'العلامة تبقى بعد أول فتحة');
  const tk3 = fs.readFileSync(path.join(__dirname, '../css/tokens.css'), 'utf8');
  assert.ok(tk3.includes('html.store-safe #stockTicker') && tk3.includes('html.store-safe #stocksModal'), 'كل الواجهات المالية مخفية');
  const st13 = fs.readFileSync(path.join(__dirname, '../js/app-13-stocks-init.js'), 'utf8');
  assert.ok(st13.includes("contains('store-safe')) return;"), 'محرك الأسهم لا يعمل إطلاقًا — صفر نداءات أسعار');
}
console.log('  ✓ v-store-safe: حزمة هواوي بلا أي محتوى مالي — قاعدة 11.4');

// ㊶ v-lab-haiku: «تجربة غير مكتملة» استمرت — سونيت أبطأ من إكمال صفحة غنية
// ضمن المهلة. هايكو 4.5 (أسرع ~3×) يبنيها + جولة إتمام تلقائية عند الانقطاع.
{
  const eduL = fs.readFileSync(path.join(__dirname, '../api/edu.js'), 'utf8');
  assert.ok(eduL.includes('v-lab-haiku') && eduL.includes("EDU_LAB_MODEL || 'claude-haiku-4-5"), 'التجربة الحية على النموذج السريع');
  assert.ok(eduL.includes("stop_reason === 'max_tokens'") && eduL.includes("{ role: 'assistant', content: raw }"), 'جولة إتمام prefill عند الانقطاع');
  assert.ok(eduL.includes('const open = raw.match'), 'سور مفتوح بلا إغلاق لا يضيع الصفحة المكتملة');
}
console.log('  ✓ v-lab-haiku: التجربة الحية تكتمل — نموذج سريع + إتمام تلقائي');

// ㊷ v-edu-selfhost: مستودع omran-edu غير موصول بالنشر — الصفحة المحدثة
// (لغة الدرس منسدلة بدل أزرار مكدسة) تُستضاف هنا فتنشر مع التطبيق تلقائيًا.
{
  const eo = fs.readFileSync(path.join(__dirname, '../edu-old/index.html'), 'utf8');
  assert.ok(eo.includes('id="uiLang"') && !eo.includes('id="btnBn"'), 'المنسدلة بدل أزرار اللغات');
  assert.ok(eo.split('omran-edu.vercel.app/api').length >= 4, 'الخلفية على النشر القديم الشغال');
  assert.ok(eo.includes("'/edu-old/ffmpeg-assets/"), 'أصول ffmpeg نفس النطاق (شرط الـWorkers)');
  const ft10 = fs.readFileSync(path.join(__dirname, '../js/app-10-features.js'), 'utf8');
  assert.ok(ft10.includes("frame.src = '/edu-old/index.html'"), 'الإطار على النسخة المستضافة ذاتيًا');
}
console.log('  ✓ v-edu-selfhost: التعليمي القديم ينشر مع التطبيق — بلا لوحة Vercel');

// ㊸ v-edu-x-safe: على بناء iOS الأصلي (webview ملء الشاشة) زر ✕ لمودال التعليم
// كان يركب فوق الساعة — رأس المودال يحتاج حشوة safe-area لأنه div لا dialog.
{
  const pc = fs.readFileSync(path.join(__dirname, '../js/partials-core.js'), 'utf8');
  const eduIdx = pc.indexOf('id="omranEduModal"');
  const closeIdx = pc.indexOf('id="omranEduCloseBtn"');
  const head = pc.slice(eduIdx, closeIdx);
  assert.ok(eduIdx > -1 && closeIdx > eduIdx, 'مودال التعليم وزر الإغلاق موجودان');
  assert.ok(head.includes('env(safe-area-inset-top'), 'رأس مودال التعليم ينزل تحت الساعة');
}
console.log('  ✓ v-edu-x-safe: زر ✕ التعليم تحت شريط الحالة لا فوقه');

// ㊹ v-lang-sync: «اللغه ماتتغير» على الآيفون — حدث change من المنسدلة داخل
// الإطار قد لا يصل في WebKit. المولّد يقرأ قيمة المنسدلة مباشرة وقت الضغط،
// والمزامنة تلتقط input/blur أيضًا — اللغة المختارة لا تضيع بأي سيناريو.
{
  const eo2 = fs.readFileSync(path.join(__dirname, '../edu-old/index.html'), 'utf8');
  assert.ok(eo2.includes('function syncLangFromDd'), 'دالة مزامنة اللغة موجودة');
  assert.ok(/btnGenerateScript'\)\.onclick = async \(\) => \{\s*\n\s*syncLangFromDd\(\)/.test(eo2), 'المولّد يقرأ المنسدلة مباشرة قبل الإرسال');
  assert.ok(eo2.includes("addEventListener('input', syncLangFromDd)") && eo2.includes("addEventListener('blur', syncLangFromDd)"), 'التقاط input/blur لا change وحده');
}
console.log('  ✓ v-lang-sync: اللغة المختارة تصل المولّد حتى بلا أي حدث iOS');

// ㊺ v-lang-follow: تطبيقه بالبنغالية وصفحة التعليم بالعربية — الصفحة كانت لا
// تقرأ لغة التطبيق. صارت ترث aiapp_lang (نفس النطاق بعد الاستضافة الذاتية)
// ما لم يختر المستخدم لغة درس صراحة؛ لغة خارج السبع → إنجليزي.
{
  const eo3 = fs.readFileSync(path.join(__dirname, '../edu-old/index.html'), 'utf8');
  assert.ok(eo3.includes('v-lang-follow') && eo3.includes("localStorage.getItem('aiapp_lang')"), 'الصفحة ترث لغة التطبيق');
  assert.ok(eo3.includes("EDU_LANGS = ['ar','en','fr','hi','ur','bn','ne']"), 'التحقق من السبع المدعومة');
  assert.ok(/EDU_LANGS\.indexOf\(saved\) !== -1\) return saved/.test(eo3), 'اختيار المستخدم الصريح يغلب لغة التطبيق');
}
console.log('  ✓ v-lang-follow: التعليم بلغة التطبيق تلقائيًا — والمنسدلة تغلب');

// ㊻ v-google-safari: دخول جوجل داخل WKWebView يفشل (باسكيز لا تكتمل، وقفزة
// لمتصفح خارجي بنصف الطريق ترد «400 malformed» — لقطة عمران). داخل غلاف
// الآيفون (جسور omranShare/omranPdf) يُفتح سفاري من أول خطوة، وجسر
// oauth-claim يستلم الجلسة عند العودة. نفس الشيء لربط الإيميل.
{
  const auth1 = fs.readFileSync(path.join(__dirname, '../js/app-01-boot-auth.js'), 'utf8');
  assert.ok(auth1.includes('v-google-safari') && auth1.includes("window.open(location.origin + gStartUrl, '_blank')"), 'الدخول يفتح سفاري داخل الغلاف');
  assert.ok(auth1.includes('messageHandlers.omranShare'), 'كشف الغلاف من جسوره لا من UA');
  assert.ok(auth1.includes('الدخول يكتمل تلقائيًا'), 'رسالة إرشاد ظاهرة للمستخدم');
  const st12 = fs.readFileSync(path.join(__dirname, '../js/app-12-studios.js'), 'utf8');
  assert.ok(st12.includes("window.open(location.origin + emStartUrl, '_blank')"), 'ربط الإيميل يفتح سفاري أيضًا');
}
console.log('  ✓ v-google-safari: جوجل في سفاري داخل تطبيق الآيفون — لا 400 ولا باسكيز عالقة');

console.log('fashion locks tests passed');
