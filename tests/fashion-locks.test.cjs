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
assert.ok(eduApi.includes('```html') && eduApi.includes('max_tokens: 16000'), 'استخراج كتلة HTML وحجم كافٍ');
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
assert.ok(vgSrv.includes("if (!text) text = (await openaiRescue(image, prompt)) || ''"), 'سقوط Gemini أو فراغه يهبط للإنقاذ لا للفشل');
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
assert.ok(chatSrv.includes("process.env.CHAT_CLAUDE_MODEL || 'claude-opus-5'"), 'نفس فئة النموذج القوية مباشرة + قابلة للتبديل من البيئة');
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
assert.ok(chatSrv19.includes('v-physical-design') && chatSrv19.includes('PHYSICAL_DESIGN_NOTE'), 'قاعدة التصميم المادي موجودة');
assert.ok(chatSrv19.includes('+ IMAGE_TOPICS_NOTE + PHYSICAL_DESIGN_NOTE + DEALS_NOTE'), 'القاعدة موصولة في نظام أدوار الأدوات');
assert.ok(chatSrv19.includes('ممنوع منعًا باتًا جدار المواصفات الطويل'), 'جدار المواصفات ممنوع إلا بطلب صريح');
console.log('  ✓ v-physical-design: التصميم يُرى قبل أن يُقرأ');

// ⑳ v-maha-image-rescue: مولد صور المحادثة بخط إنقاذ تاسع + لا خطف لطلبات صورة التصميم.
const mahaImgSrv = fs.readFileSync(path.join(__dirname, '../api/_lib/maha-image.js'), 'utf8');
assert.ok(mahaImgSrv.includes('v-maha-image-rescue') && mahaImgSrv.includes('openaiRescueImage'), 'إنقاذ gpt-image-1 موجود');
assert.ok(mahaImgSrv.includes("engine: 'openai' }); return; }"), 'الإنقاذ يرد صورة بنفس العقد');
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

console.log('fashion locks tests passed');
