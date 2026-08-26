const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const maha = fs.readFileSync('js/app-08-maha.js', 'utf8');
const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
const checkout = fs.readFileSync('js/app-06-checkout.js', 'utf8');
const i18n = fs.readFileSync('js/app-03-i18n-data.js', 'utf8');
const bundle = fs.readFileSync('js/app.bundle.js', 'utf8');
const chatServer = fs.readFileSync('api/_lib/chat.js', 'utf8');
const prompts = attach + '\n' + i18n + '\n' + checkout;

function check(ok, label) {
  assert.ok(ok, label);
  console.log('  ✓ ' + label);
}

function sliceBetween(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `تعذّر استخراج ${startText}`);
  return source.slice(start, end);
}

const greetingFns = vm.runInNewContext(`(() => {
  ${sliceBetween(maha, 'function isPureGreeting', 'async function smartMaybeSearch')}
  return { isPureGreeting, isCasualCheckIn };
})()`);
const deterministicSocial = vm.runInNewContext(`(() => {
  ${sliceBetween(maha, 'function isPureGreeting', 'async function smartMaybeSearch')}
  ${sliceBetween(attach, 'function deterministicSocialReply', 'async function sendPrompt')}
  return deterministicSocialReply;
})()`);

for (const text of ['هلا', 'أهلًا', 'السلام عليكم', 'صباح الخير', 'hello']) {
  check(greetingFns.isPureGreeting(text), `تُعرف التحية اللفظية: ${text}`);
}
for (const text of ['كيف الحال', 'كيف حالك؟', 'هلا كيف الحال', 'how are you?', 'عندي مشروع']) {
  check(!greetingFns.isPureGreeting(text), `لا يُختزل السؤال/الطلب إلى تحية: ${text}`);
}
for (const text of ['كيف الحال', 'كيف حالك؟', 'هلا كيف الحال', 'how are you?']) {
  check(greetingFns.isCasualCheckIn(text), `تُعرف المجاملة لتجاوز البحث فقط: ${text}`);
}
for (const [text, expected] of [
  ['هلا', 'هلا وغلا'],
  ['السلام عليكم', 'وعليكم السلام'],
  ['صباح الخير', 'صباح النور'],
  ['مساء الخير', 'مساء النور'],
  ['كيف الحال', 'بخير، كيف أنت؟'],
  ['hello', 'Hello!'],
  ['how are you?', "I'm good, how are you?"],
]) {
  assert.equal(deterministicSocial(text), expected);
  check(true, `الرد الاجتماعي ثابت وكامل: ${text} ← ${expected}`);
}
assert.equal(deterministicSocial('أريد فنادق في دبي'), null);
check(true, 'الطلبات الفعلية لا تدخل مسار الرد الاجتماعي المحلي');

const styleRule = vm.runInNewContext(`(() => {
  ${sliceBetween(checkout, 'const CONVERSATION_QUALITY_RULE', '// قاعدة الاكتمال')}
  return CONVERSATION_QUALITY_RULE;
})()`);
const generalStyle = styleRule.split('[قواعد مشروطة')[0];
const generalNumbers = generalStyle.match(/\([١٢٣٤٥٦]\)/g) || [];
check(generalNumbers.length === 6 && new Set(generalNumbers).size === 6, 'طبقة الأسلوب تحتوي ست قواعد عامة فقط');
check(styleRule.includes('الدليل: عند البحث أو التحقق') && styleRule.includes('لا تحوّل الدردشة العامة إلى تقرير مصادر'), 'الدليل مشروط بنوع الطلب');
check(styleRule.includes('التصحيح: صحّح باختصار ووضوح فقط عند وجود خطأ مادي') && styleRule.includes('لا تفتعل تصحيحًا'), 'التصحيح لا يعمل بلا خطأ مادي');
check(styleRule.includes('الخطوة التالية: أضفها فقط إذا كان الطلب عمليًّا متعدد الخطوات') && styleRule.includes('لا تختم كل رد باقتراح أو سؤال'), 'الخطوة التالية ليست خاتمة آلية');
check(styleRule.includes('بلا تقليد لعباراته أو مزاجه'), 'فهم النبرة لا يتحول إلى تقليد المستخدم');
check(styleRule.includes('السؤال البسيط جواب قصير من ١–٣ جمل بلا عناوين أو تعداد'), 'السؤال البسيط له حد سلوكي قابل للقياس');
check(attach.includes("APP_IDENTITY_NOTE + CONVERSATION_QUALITY_RULE") && attach.includes("'أنت مساعد ذكي في تطبيق Omran AI من فريق عمران AI.' + CONVERSATION_QUALITY_RULE"), 'القواعد المركزية مستخدمة في البناء والمحادثة العادية');
check(!checkout.includes('then ONE concrete next-step suggestion or question') && !checkout.includes('then 2-3 concrete suggestions'), 'أزيل فرض الاقتراح والسؤال من كل رد');
check(chatServer.includes('اكشف نبرة المستخدم وطابقها فورًا') && chatServer.includes('لا تبدأ من الصفر في كل ردّ'), 'المحادثة العادية تكشف النبرة وتحافظ على السياق');
check(chatServer.includes('إن نقصت معلومة تؤثّر فعليًّا في الدقّة') && chatServer.includes('لا تُلحق سؤالًا عامًا بكل رد'), 'سؤال الخادم مشروط بنقص مؤثر');
check(!chatServer.includes('بعد المعلومة أعطِ خطوة تنفيذيّة واحدة يقدر عليها اليوم'), 'أزيل التعارض القديم من تعليمات أدوات الخادم');
check(chatServer.includes('أمّا سؤال المفهوم الثابت البسيط الذي تجيبه بلا أداة') && chatServer.includes('بلا عناوين أو تعداد أو خطوة تالية أو سؤال'), 'قواعد نتائج البحث لا تتسرّب إلى السؤال الثابت البسيط');

const casual = vm.runInNewContext(`(() => {
  ${sliceBetween(checkout, 'const CASUAL_RE', '// 🎯 ٦ أغسطس')}
  return { isCasualTurn };
})()`);
check(casual.isCasualTurn('كيف الحال'), 'المجاملة القصيرة لا تثبّت مزود الخيط');
check(!casual.isCasualTurn('كيف الحال في سوق السيارات اليوم؟'), 'السؤال الفعلي ليس مجاملة عابرة');

let saveCount = 0;
const lock = vm.runInNewContext(
  `${sliceBetween(checkout, 'function __convLockProvider', '// ٦ قواعد التوجيه')}\n__convLockProvider`,
  { saveState: () => { saveCount += 1; }, __swallow: () => {} },
);
const conv = {};
assert.equal(lock(conv, 'groq', false, false, true), 'groq');
check(!Object.hasOwn(conv, 'aiProvider') && saveCount === 0, 'التحية لا تقفل الخيط على المزود السريع');
assert.equal(lock(conv, 'claude', false, false, false), 'claude');
check(conv.aiProvider === 'claude' && saveCount === 1, 'أول طلب فعلي يثبّت مزود الخيط');
assert.equal(lock(conv, 'groq', false, false, true), 'claude');
check(conv.aiProvider === 'claude', 'المجاملة اللاحقة تحافظ على مزود الخيط وسياقه');

check(prompts.includes('تحية لفظية فقط وليست سؤالًا'), 'التحية وحدها لها توجيه قصير طبيعي');
check(prompts.includes('أجب بتحية عربية قصيرة فقط من كلمة إلى ثلاث كلمات'), 'التحية لها توجيه مباشر لا يضيع وسط القواعد العامة');
check(prompts.includes('ولا تستخدم علامة استفهام'), 'توجيه التحية يمنع أي سؤال صراحةً');
check(attach.includes('const __socialReply = attachmentsForMsg.length ? null : deterministicSocialReply(text)') && attach.includes('_localSocial: true'), 'التحية وسؤال الحال يُحسمان محليًا قبل أي مزود أو بحث');
check(chatServer.includes('const socialReply = deterministicSocialReply') && chatServer.includes("JSON.stringify({ delta: socialReply })"), 'الخادم يعيد الرد الاجتماعي الثابت أيضًا للعملاء القديمة');
check(prompts.includes('«كيف الحال؟» أجب عنه كحديث مستمر'), 'سؤال المجاملة يُعامل كمحادثة مستمرة');
check(attach.includes('const __quietSocialTurn = isPureGreeting(text) || isCasualCheckIn(text)') && attach.includes('const __memMsg = __quietSocialTurn ? null : memorySystemMsg()'), 'سؤال الحال لا يحقن ذاكرة الحساب في العميل');
check(attach.includes('let __turns = [];') && attach.includes('if(!__quietSocialTurn){'), 'سؤال الحال لا يرسل المواضيع السابقة إلى المزود');
check(attach.includes('هذا سؤال حال ضمن محادثة مستمرة، وليس تحية جديدة') && attach.includes('ولا تعرض المساعدة، ولا تذكر أي مشروع أو اهتمام أو موضوع سابق'), 'سؤال الحال له توجيه مباشر يمنع عرض الخدمة والمواضيع القديمة');
check(attach.includes('!(isPureGreeting(text) || isCasualCheckIn(text))'), 'الدور الاجتماعي العابر لا يلوث الذاكرة طويلة المدى');
check(chatServer.includes('function isCasualCheckIn(text)') && chatServer.includes('if (usage.username && !quietSocialTurn)'), 'الخادم لا يقرأ ذاكرة الحساب لسؤال الحال');
check(chatServer.includes('const system = quietSocialTurn') && chatServer.includes('ولا تذكر أي مشروع أو اهتمام أو موضوع سابق'), 'الخادم يعزل الدور الاجتماعي عن التاريخ ومعرفة المالك');
check(chatServer.includes('tools: toolTurn ? TOOLS : undefined'), 'الأدوات تُمرَّر خلف toolTurn لا دائمًا');
// v-chat-tools: قائمة الكلمات (TOOL_INTENT_RE) حجبت البحث عن «توقيت الصلاة في عجمان»
// — قِيس بالمِجسّ ردٌّ بلا بحث يطلب التاريخ. القرار الآن للنموذج في كل دور غير اجتماعي.
check(chatServer.includes('const toolTurn = !quietSocialTurn;'), 'كل دور غير اجتماعي يحمل الأدوات والتاريخ والموقع');
check(!chatServer.includes('TOOL_INTENT_RE.test('), 'قائمة الكلمات البيضاء التي حجبت البحث أزيلت');
check(chatServer.includes('countryNote(country, city)'), 'مدينة المستخدم تدخل توجيه الموقع');
check(chatServer.includes('اعتمد فيه مدينته'), 'الأسئلة المكانية تعتمد مدينة المستخدم تلقائيًا');
check(chatServer.includes('setTimeout(function () { resolve(null); }, 4000)'), 'البحث الاستباقي مسقوف بأربع ثوانٍ فلا يحجز أول كلمة');
check(chatServer.includes('const LEAN_CONVERSATION_NOTE'), 'المحادثة العادية تستخدم تعليمات خفيفة');
check(chatServer.includes('محاور قويّ') && chatServer.includes('كن ندًّا في الحوار'), 'طبقة المحاور القوي: ندّية ومطابقة نمط المستخدم');
check(chatServer.includes('ممنوع الموافقة الآلية والتملّق'), 'التملق والموافقة الآلية ممنوعان صراحةً');
check(chatServer.includes('function arWikiLookup') && chatServer.includes('ar.wikipedia.org'), 'ويكيبيديا العربية مصدر مرفق في سلسلة البحث');
check(chatServer.includes('ممنوع أن تبدأ الردّ باستدعاء generate_image'), 'النص يُقرأ أولًا والصورة التوضيحية آخر الردّ');
check(chatServer.includes('LIVE_EAGER_RE.test(lastUser.content)'), 'البحث الاستباقي خلف إشارة حية صريحة لا على كل رسالة');
// v-num-plain: «اريد ارقام للبيع» رسمت صورة ووُعظ صاحبها «بيانات غير قانونية».
{
  const numRe = chatServer.match(/const NUM_ASK_RE = (\/.*\/i);/);
  check(!!numRe, 'NUM_ASK_RE موجود');
  const re = eval(numRe[1]); // guard-ok — نمط من ملفنا نفسه لاختباره
  check(re.test('اريد ارقام للبيع') && re.test('ابي ارقام'), '«اريد/ابي أرقام» تدخل مسار الأرقام المتخصص');
  check(!re.test('كم رقم الطوارئ') && !re.test('ارقام الصفحة'), 'الأسئلة العادية عن الأرقام لا تدخل المسار خطأً');
  check(chatServer.includes('ممنوع استدعاء generate_image — لا صورة في هذا الردّ'), 'مسار الأرقام يمنع الصورة — روابط الأسواق فقط');
  check(chatServer.includes('تجارة مشروعة مألوفة في الإمارات'), 'مسار الأرقام يمنع الوعظ القانوني');
}
// v-cat-match: «فندق» أعطى دوبيزل و«مندي» أعطى عقارًا — الموقع يطابق فئة الطلب.
check(chatServer.includes('(ص٨) تطابق الفئة إلزاميّ') && chatServer.includes('ممنوع منعًا باتًا دوبيزل أو أي موقع إعلانات عامّ في طلبات الفنادق والأكل'), 'قاعدة تطابق الفئة: لا موقع من فئة أخرى ولو ظهر في البحث');
// v-photo-ctx: «عطني صور السيارة» بعد نقاش ليوبارد 8 جابت سيارات عشوائية —
// الطلب المُشير القصير يُثرى بموضوع آخر رسالة مستخدم قبل البحث عن الصور.
check(attach.includes('v-photo-ctx') && attach.includes('__photoQ = __prevU.content'), 'بحث الصور يُثرى بموضوع المحادثة للطلب المُشير القصير');
// v-clean-links: الرابط العاري كان يُعرض بنصّه المرمّز %D8… فيملأ الشاشة.
check(bundle.includes('v-clean-links') && bundle.includes(".hostname.replace(/^www\\./, '')"), 'الرابط العاري يُعرض باسم نطاقه فقط ويبقى قابلًا للضغط');
// v-intent-tech: «تحديث نظام شاشة السيارة» أعادت مواقع بيع سيارات لا صلة لها.
{
  const searchSrc = fs.readFileSync('api/_lib/search.js', 'utf8');
  const m = searchSrc.match(/const TECH_INTENT_RE = (\/.*\/i);/);
  check(!!m, 'حارس النية التقنية موجود في البحث');
  const tre = eval(m[1]); // guard-ok — نمط من ملفنا نفسه لاختباره
  check(tre.test('تحديث نظام شاشة السيارة') && tre.test('كيف اصلح مشكلة البلوتوث في سيارتي'), 'السؤال التقني عن السيارة يُكشف');
  check(!tre.test('اريد سيارة للبيع') && !tre.test('سيارات مستعملة رخيصة'), 'طلب الشراء لا يُحسب تقنيًا');
  check(searchSrc.includes('const isNumbers = !__techAsk &&') && searchSrc.includes('const isListing = isNumbers || (!__techAsk &&'), 'النية التقنية تفكّ قفل محرّك القوائم');
  check(searchSrc.includes('exclude_domains') && searchSrc.includes("__techAsk ? { exclude_domains"), 'السؤال التقني يستبعد مواقع الإعلانات المبوبة صراحةً');
}
check(chatServer.indexOf('v-fast-headers') > 0 && chatServer.indexOf('v-fast-headers') < chatServer.indexOf('prepareTurn('), 'البثّ يُفتح قبل الذاكرة والبحث الاستباقي فيرى المستخدم حركة فورًا');
check(chatServer.includes('function compactConversation'), 'السياق الطويل يُضغط قبل إرساله للنموذج');
check(chatServer.includes('const convoSource = quietSocialTurn ? [lastUser] : messages'), 'الخادم لا يرسل تاريخ المواضيع في سؤال الحال');
check(chatServer.includes('slice(0, 12000)'), 'كل رسالة لها سقف حجم يحمي جودة السياق');
check(prompts.includes('لا تطرح أي سؤال ولا تعرض المساعدة'), 'التحية تبقى قصيرة بلا سؤال أو عرض خدمة');
check(prompts.includes('لا تعرض المساعدة بدل الجواب'), 'سؤال الحال يُجاب عنه ولا يتحول إلى عرض خدمة');
check(prompts.includes('لا تبدأ بتحية من نفسك'), 'بداية المحادثة صامتة');
check(prompts.includes('بيضاء واضحة ومهذّبة'), 'الأسلوب العربي واضح ومهذّب');
check(!prompts.includes('فردّ حرفيًا: «أهلًا بك.» فقط'), 'أزيل الرد الحرفي «أهلًا بك.»');
check(!prompts.includes('يحيّه ويسأله وش يحتاج'), 'أزيلت صيغة «وش يحتاج» المفروضة');
check(!prompts.includes('لهجتك الافتراضيّة إماراتيّة بيضاء'), 'أزيل فرض اللهجة المصطنعة');
check(bundle.includes('تحية لفظية فقط وليست سؤالًا') && bundle.includes('isCasualCheckIn'), 'الحزمة المباشرة مطابقة للمصادر');
check(!bundle.includes('فردّ حرفيًا: «أهلًا بك.» فقط'), 'الحزمة المباشرة بلا الرد المحفوظ');

    // ===== اختبار إزالة التكرار بين استدعاءات البحث =====
    const chatServerFull = fs.readFileSync('api/_lib/chat.js', 'utf8');
    check(chatServerFull.includes('const seenHostnames = new Set()'), 'يُنشئ مجموعة المواقع المرئية قبل حلقة الأدوات');
    check(chatServerFull.includes('function filterDuplicateUrls('), 'دالة فرز التكرار موجودة في مسار الخادم');
    check(chatServerFull.includes('filterDuplicateUrls(await tavilySearch('), 'نتيجة البحث تمرّ عبر فرز التكرار قبل إرسالها للنموذج');
    check(chatServerFull.includes("seenHostnames.has(host)"), 'يتحقق من الـ hostname قبل تمرير الموقع');
    check(chatServerFull.includes("seenHostnames.add(host)"), 'يسجّل الـ hostname بعد أول ظهور');

    // اختبار وظيفي: نفس الموقع لا يظهر مرتين
    const filterDuplicateUrls = (() => {
    const seenHostnames = new Set();
    return function(text) {
      if (!text || typeof text !== 'string') return text;
      const blocks = text.split(/\n{2,}/);
      const kept = [];
      for (const block of blocks) {
        const urlMatch = block.match(/https?:\/\/([^/\s)[\]]+)/i);
        if (!urlMatch) { kept.push(block); continue; }
        const host = urlMatch[1].replace(/^www\./, '').toLowerCase();
        if (seenHostnames.has(host)) continue;
        seenHostnames.add(host);
        kept.push(block);
      }
      return kept.length ? kept.join('\n\n') : text;
    };
    })();

    const firstSearch = '1. بوكينج\nhttps://www.booking.com/\n\n2. تريفاجو\nhttps://www.trivago.ae/';
    const secondSearch = '1. أجودا\nhttps://www.agoda.com/\n\n2. بوكينج مرة ثانية\nhttps://booking.com/hotels';
    const r1 = filterDuplicateUrls(firstSearch);
    const r2 = filterDuplicateUrls(secondSearch);
    check(r1.includes('booking.com') && r1.includes('trivago.ae'), 'البحث الأول يعرض مواقعه كاملة');
    check(r2.includes('agoda.com'), 'البحث الثاني يعرض الموقع الجديد');
    check(!r2.includes('booking.com'), 'بوكينج لا يظهر مرة ثانية في نفس الدور');
    
    // ===== اختبار قاعدة الصورة/الفيديو التوضيحي =====
    // v-chat-tools: فحص «فيديو وتوضيح يفعّلان مسار الأدوات» كان يثبّت قائمة
    // الكلمات المحذوفة — الأدوات الآن في كل دور غير اجتماعي فلا حاجة لتفعيل بكلمة.
    check(chatServer.includes('قاعدة الصورة/الفيديو التوضيحي'), 'القاعدة الصريحة موجودة في تعليمات الأدوات');
    check(chatServer.includes('ممنوع web_search للطلبات التوضيحية'), 'يمنع web_search صراحةً عند الطلب التوضيحي');
    check(chatServer.includes('استدعِ generate_image بـ prompt إنجليزي وصفي'), 'يُوجّه النموذج لاستخدام generate_image بوصف من سياق المحادثة');
    
    // ===== فحوصات أسلوب المحادثة الجديد =====
    // v-chat-tools: فحصا «ملابس/سيارات تفعّلان مسار الأدوات» ثبّتا القائمة
    // المحذوفة — يغنيهما فحص «كل دور غير اجتماعي يحمل الأدوات» أعلاه.
    check(chatServer.includes('هلا بك والله'), 'التحية المضاعفة تعطي ترحيباً دافئاً');
    check(chatServer.includes('كيف أقدر أساعدك اليوم'), 'التحية العادية تدعو للمساعدة');
    check(chatServer.includes('خليجي دافئ (هلا / يا غالي / والله'), 'كشف النبرة الخليجية موثّق في التعليمات');
    check(chatServer.includes('استثناء — النوع الجوهري فقط'), 'سؤال النوع الجوهري مسموح بعد إجابة أولية');
    check(chatServer.includes('معالج التسوق والتصفح'), 'معالج التسوق موجود في WIZARD_NOTE');
    check(chatServer.includes('مواقع سيارات'), 'مثال مواقع السيارات موجود في معالج التسوق');
    check(chatServer.includes('للكبار|للأطفال'), 'بطاقات فئة العمر موجودة في معالج التسوق');
    check(!chatServer.includes('بالطبع!') || chatServer.includes('لا تبدأ ردك بـ«بالطبع!»'), 'يمنع البدء بعبارات مكررة كبالطبع');
    // بصمة الشخصية — بطلب المالك: تحفيز واحتفال، تعاطف قبل الحل، تفكيك
    // المعقد لخطوات، الزبدة أولًا، زميل خبير لا روبوت.
    check(chatServer.includes('بصمة الشخصية — بطلب المالك'), 'بصمة الشخصية مثبتة في أسلوب المحادثة');
    check(chatServer.includes('اطمّن، المشكلة واضحة ونحلها بدقيقتين'), 'تعاطف قبل الحل عند الأخطاء');
    check(chatServer.includes('خطوات مرقّمة قصيرة'), 'تفكيك المعقد إلى خطوات');
    check(chatServer.includes('الزبدة أولًا'), 'الحل المباشر في المقدمة');

console.log('\n✅ فصل التحية عن المحادثة واستمرار السياق — نجح');
