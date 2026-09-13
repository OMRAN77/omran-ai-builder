const fs = require('node:fs');
const vm = require('node:vm');

// ─────────────────────────────────────────────────────────────────────
// ملاحظة على طبيعة هذا الملف:
// معظم فحوصاته "حراسة نصّية" — تتأكد أن جملة معيّنة ما زالت في المصدر.
// هذه تنكسر عند إعادة صياغة عربية سليمة (حدث فعلًا في v-tv-hls)، فهي
// حارس تنظيمي لا اختبار سلوك. الفحوصات التي تشغّل الدوال فعلًا هي وحدها
// التي تثبت أن الشيء يعمل — وهي المعلّمة بـ behavior().
// ─────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(p, 'utf8');

const maha       = read('js/app-08-maha.js');
const attach     = read('js/app-09-attach.js');
const checkout   = read('js/app-06-checkout.js');
const i18n       = read('js/app-03-i18n-data.js');
const bundle     = read('js/app.bundle.js');
const chatServer = read('api/_lib/chat.js');
const searchSrc  = read('api/_lib/search.js');
const prompts    = attach + '\n' + i18n + '\n' + checkout;

// ── عدّاد النتائج: لا نتوقف عند أول فشل، بل نجمع كل شيء ونطبعه مرتّبًا ──
const failures = [];
let passed = 0;
let section = 'عام';

function group(name) { section = name; console.log('\n▸ ' + name); }

function check(ok, label) {
  if (ok) { passed++; console.log('  ✓ ' + label); }
  else { failures.push({ section, label }); console.log('  ✗ ' + label); }
}

// فحص سلوكي: يشغّل كودًا حقيقيًا. هذه لا تنكسر بإعادة الصياغة.
function behavior(ok, label) { check(ok, '[سلوك] ' + label); }

// ملاحظة تُطبع بلا ادّعاء نجاح — بديل check(true, …) الذي كان يكذب دائمًا.
function note(text) { console.log('  · ' + text); }

function sliceBetween(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  if (!(start >= 0 && end > start)) {
    throw new Error(`تعذّر استخراج ${startText} — تغيّر المصدر؟`);
  }
  return source.slice(start, end);
}

// استخراج نمط RegExp من المصدر بلا eval: vm أنظف ولا ينكسر عند «/» داخل النمط.
function extractRegex(source, declLine, label) {
  const m = source.match(new RegExp('const\\s+' + declLine + '\\s*=\\s*(\\/[\\s\\S]*?\\/[gimsuy]*)\\s*;'));
  check(!!m, label + ' موجود');
  if (!m) return null;
  try { return vm.runInNewContext(m[1]); }
  catch (e) { check(false, label + ' نمط صالح'); return null; }
}

// ═══ التحية والمجاملة ═══
group('التحية والمجاملة');

const greetingFns = vm.runInNewContext(`(() => {
  ${sliceBetween(maha, 'function isPureGreeting', 'async function smartMaybeSearch')}
  return { isPureGreeting, isCasualCheckIn };
})()`);
// v-social-alive: الرد الاجتماعي المخزّن حُذف — التحية تمر للنموذج ببصمته.

for (const text of ['هلا', 'أهلًا', 'السلام عليكم', 'صباح الخير', 'hello']) {
  behavior(greetingFns.isPureGreeting(text), `تُعرف التحية اللفظية: ${text}`);
}
for (const text of ['كيف الحال', 'كيف حالك؟', 'هلا كيف الحال', 'how are you?', 'عندي مشروع']) {
  behavior(!greetingFns.isPureGreeting(text), `لا يُختزل السؤال/الطلب إلى تحية: ${text}`);
}
for (const text of ['كيف الحال', 'كيف حالك؟', 'هلا كيف الحال', 'how are you?']) {
  behavior(greetingFns.isCasualCheckIn(text), `تُعرف المجاملة لتجاوز البحث فقط: ${text}`);
}
check(!attach.includes('هلا وغلا') && !chatServer.includes("'هلا وغلا! كيف أقدر أساعدك اليوم؟'"),
  'v-social-alive: لا ردود تحية مخزنة في العميل أو الخادم');

// ═══ طبقة الأسلوب ═══
group('طبقة الأسلوب');

const styleRule = vm.runInNewContext(`(() => {
  ${sliceBetween(checkout, 'const CONVERSATION_QUALITY_RULE', '// قاعدة الاكتمال')}
  return CONVERSATION_QUALITY_RULE;
})()`);
const generalStyle = styleRule.split('[قواعد مشروطة')[0];
const generalNumbers = generalStyle.match(/\([١٢٣٤٥٦]\)/g) || [];
behavior(generalNumbers.length === 6 && new Set(generalNumbers).size === 6,
  'طبقة الأسلوب تحتوي ست قواعد عامة فقط');
check(styleRule.includes('الدليل: عند البحث أو التحقق') && styleRule.includes('لا تحوّل الدردشة العامة إلى تقرير مصادر'), 'الدليل مشروط بنوع الطلب');
check(styleRule.includes('التصحيح: صحّح باختصار ووضوح فقط عند وجود خطأ مادي') && styleRule.includes('لا تفتعل تصحيحًا'), 'التصحيح لا يعمل بلا خطأ مادي');
check(styleRule.includes('الخطوة التالية: أضفها فقط إذا كان الطلب عمليًّا متعدد الخطوات') && styleRule.includes('لا تختم كل رد باقتراح أو سؤال'), 'الخطوة التالية ليست خاتمة آلية');
check(styleRule.includes('بلا تقليد لعباراته أو مزاجه'), 'فهم النبرة لا يتحول إلى تقليد المستخدم');
check(styleRule.includes('السؤال البسيط جواب قصير من ١–٣ جمل بلا عناوين أو تعداد'), 'السؤال البسيط له حد سلوكي قابل للقياس');
check(attach.includes('APP_IDENTITY_NOTE + CONVERSATION_QUALITY_RULE') && attach.includes("'أنت مساعد ذكي في تطبيق Omran AI من فريق عمران AI.' + CONVERSATION_QUALITY_RULE"), 'القواعد المركزية مستخدمة في البناء والمحادثة العادية');
check(!checkout.includes('then ONE concrete next-step suggestion or question') && !checkout.includes('then 2-3 concrete suggestions'), 'أزيل فرض الاقتراح والسؤال من كل رد');
check(chatServer.includes('تجاري لهجة المستخدم وروحه بروح المجلس'), 'v-clean-slate: مجاراة اللهجة في النظام القصير');
check(chatServer.includes('إن نقصت معلومة تؤثّر فعليًّا في الدقّة') && chatServer.includes('لا تُلحق سؤالًا عامًا بكل رد'), 'سؤال الخادم مشروط بنقص مؤثر');
check(!chatServer.includes('بعد المعلومة أعطِ خطوة تنفيذيّة واحدة يقدر عليها اليوم'), 'أزيل التعارض القديم من تعليمات أدوات الخادم');
check(chatServer.includes('أمّا سؤال المفهوم الثابت البسيط الذي تجيبه بلا أداة') && chatServer.includes('بلا عناوين أو تعداد أو خطوة تالية أو سؤال'), 'قواعد نتائج البحث لا تتسرّب إلى السؤال الثابت البسيط');

// ═══ قفل مزوّد الخيط ═══
group('قفل مزوّد الخيط');

const casual = vm.runInNewContext(`(() => {
  ${sliceBetween(checkout, 'const CASUAL_RE', '// 🎯 ٦ أغسطس')}
  return { isCasualTurn };
})()`);
behavior(casual.isCasualTurn('كيف الحال'), 'المجاملة القصيرة لا تثبّت مزود الخيط');
behavior(!casual.isCasualTurn('كيف الحال في سوق السيارات اليوم؟'), 'السؤال الفعلي ليس مجاملة عابرة');

let saveCount = 0;
const lock = vm.runInNewContext(
  `${sliceBetween(checkout, 'function __convLockProvider', '// ٦ قواعد التوجيه')}\n__convLockProvider`,
  { saveState: () => { saveCount += 1; }, __swallow: () => {} },
);
const conv = {};
behavior(lock(conv, 'groq', false, false, true) === 'groq', 'التحية تُخدَم بالمزود السريع');
behavior(!Object.hasOwn(conv, 'aiProvider') && saveCount === 0, 'التحية لا تقفل الخيط على المزود السريع');
behavior(lock(conv, 'claude', false, false, false) === 'claude', 'أول طلب فعلي يُخدَم بمزوده');
behavior(conv.aiProvider === 'claude' && saveCount === 1, 'أول طلب فعلي يثبّت مزود الخيط');
behavior(lock(conv, 'groq', false, false, true) === 'claude', 'المجاملة اللاحقة لا تبدّل المزود');
behavior(conv.aiProvider === 'claude', 'المجاملة اللاحقة تحافظ على مزود الخيط وسياقه');

// ═══ توجيه التحية وعزل الدور الاجتماعي ═══
group('توجيه التحية وعزل الدور الاجتماعي');

check(prompts.includes('تحية لفظية فقط وليست سؤالًا'), 'التحية وحدها لها توجيه قصير طبيعي');
check(prompts.includes('رحّب به ترحيبًا حارًّا راقيًا بروح المجلس'), 'v-style-rebirth: توجيه التحية المباشر حارّ لا جاف');
check(prompts.includes('واسأله سؤالًا واحدًا طبيعيًّا عن حاله أو يومه'), 'v-style-rebirth: التحية تفتح الحديث بسؤال واحد');
check(attach.includes('v-social-alive') && !attach.includes('_localSocial: true'), 'العميل لا يعترض التحية — تمر للنموذج');
check(chatServer.includes('v-social-alive') && !chatServer.includes('JSON.stringify({ delta: socialReply })'), 'الخادم لا يعيد ردًا مخزنًا — النموذج يجيب التحية');
check(prompts.includes('«كيف الحال؟» أجب عنه بدفء كحديث مستمر'), 'سؤال المجاملة يُعامل كمحادثة مستمرة');
check(attach.includes('const __quietSocialTurn = isPureGreeting(text) || isCasualCheckIn(text)') && attach.includes('const __memMsg = __quietSocialTurn ? null : memorySystemMsg()'), 'سؤال الحال لا يحقن ذاكرة الحساب في العميل');
check(attach.includes('let __turns = [];') && attach.includes('if(!__quietSocialTurn){'), 'سؤال الحال لا يرسل المواضيع السابقة إلى المزود');
check(attach.includes('هذا سؤال حال ضمن محادثة مستمرة، وليس تحية جديدة') && attach.includes('ولا تعرض المساعدة، ولا تذكر أي مشروع أو اهتمام أو موضوع سابق'), 'سؤال الحال له توجيه مباشر يمنع عرض الخدمة والمواضيع القديمة');
check(attach.includes('!(isPureGreeting(text) || isCasualCheckIn(text))'), 'الدور الاجتماعي العابر لا يلوث الذاكرة طويلة المدى');
check(chatServer.includes('function isCasualCheckIn(text)') && chatServer.includes('if (usage.username && !quietSocialTurn)'), 'الخادم لا يقرأ ذاكرة الحساب لسؤال الحال');
check(chatServer.includes('const system = quietSocialTurn') && chatServer.includes('وممنوع سرد مشاريع أو مواضيع قديمة'), 'الخادم يعزل الدور الاجتماعي عن التاريخ ومعرفة المالك');
check(chatServer.includes('const convoSource = quietSocialTurn ? [lastUser] : messages'), 'الخادم لا يرسل تاريخ المواضيع في سؤال الحال');

// ═══ الأدوات والبحث ═══
group('الأدوات والبحث');

check(chatServer.includes('tools: toolTurn ? TOOLS : undefined'), 'الأدوات تُمرَّر خلف toolTurn لا دائمًا');
// v-chat-tools: قائمة الكلمات (TOOL_INTENT_RE) حجبت البحث عن «توقيت الصلاة في عجمان»
// — قِيس بالمِجسّ ردٌّ بلا بحث يطلب التاريخ. القرار الآن للنموذج في كل دور غير اجتماعي.
check(chatServer.includes('const toolTurn = !quietSocialTurn && !__analyzeDoc;'), 'كل دور غير اجتماعي (عدا تحليل مستند) يحمل الأدوات والتاريخ والموقع');
check(!chatServer.includes('TOOL_INTENT_RE.test('), 'قائمة الكلمات البيضاء التي حجبت البحث أزيلت');
check(chatServer.includes('countryNote(country, city)'), 'مدينة المستخدم تدخل توجيه الموقع');
// v-no-region-assume (قرار المالك «يذكر المنطقة وأنا لست فيها»): مدينة الشبكة تلميح
// غير مؤكّد — لا تُذكر بالاسم ولا تُقترح بها خدمات، والسؤال المكاني يسأل المستخدم.
check(chatServer.includes('v-no-region-assume') && chatServer.includes('فاسأل المستخدم عن مدينته') && !chatServer.includes('اعتمد فيه مدينته'), 'الأسئلة المكانية لا تفترض مدينة الشبكة — تسأل المستخدم');
check(chatServer.includes('function nowNote(tz)') && !chatServer.includes('توقيت الإمارات]'), 'الوقت بمنطقة جهاز المستخدم لا بتوقيت الإمارات');
check(!chatServer.includes('prepareTurn(') && chatServer.includes('v-one-brain'), 'v-one-brain: لا بحث استباقي في الخادم — النموذج يقرر بنفسه');
// v-chat-speed: الذاكرة تُقرأ بالتوازي مع فحص الحصة، والمحفزات العامة خارج البحث الاستباقي.
check(chatServer.includes('earlyMemoryP'), 'قراءة الذاكرة بالتوازي مع فحص الحصة');
check(!/LIVE_EAGER_RE = [^\n]*اليوم/.test(chatServer), 'كلمة «اليوم» لا تشعل البحث الاستباقي');
check(!chatServer.includes('LIVE_EAGER_RE'), 'v-one-brain: محفزات البحث الاستباقي أزيلت كليًا');
// v-fresh-news: سؤال الأخبار يقيّد المحركات بالحديث ويذكر تاريخ النشر.
check(chatServer.includes("topic: 'news', days: 7"), 'تافيلي: أخبار آخر أسبوع فقط');
check(chatServer.includes("search_recency_filter: 'week'"), 'بيربلكسيتي: حداثة أسبوع للأخبار');
check(chatServer.includes('dateRestrict=m1&sort=date'), 'جوجل: آخر شهر مرتب بالأحدث');
check(chatServer.includes('حداثة الأخبار — إلزامي'), 'النموذج ملزم بذكر تاريخ الخبر ورفض القديم');
check(chatServer.includes('const LEAN_CONVERSATION_NOTE'), 'المحادثة العادية تستخدم تعليمات خفيفة');
check(chatServer.includes('function arWikiLookup') && chatServer.includes('ar.wikipedia.org'), 'ويكيبيديا العربية مصدر مرفق في سلسلة البحث');
check(chatServer.includes('ممنوع أن تبدأ الردّ باستدعاء generate_image'), 'النص يُقرأ أولًا والصورة التوضيحية آخر الردّ');
check(chatServer.indexOf('v-fast-headers') > 0, 'البثّ يُفتح قبل الذاكرة فيرى المستخدم حركة فورًا');
check(chatServer.includes('function compactConversation'), 'السياق الطويل يُضغط قبل إرساله للنموذج');
check(chatServer.includes('slice(0, 12000)'), 'كل رسالة لها سقف حجم يحمي جودة السياق');

// ═══ البصمة والشخصية ═══
group('البصمة والشخصية');

// v-persona-front: المحاور القوي اندمج في بصمة الشخصية المتصدّرة.
// v-clean-slate: الأقفال أدناه كانت تثبّت كتاب القواعد المحذوف — صارت تثبّت الصفحة البيضاء.
check(chatServer.includes('لست روبوتًا ولا موظف استقبال'), 'v-clean-slate: الندّية في السطر القصير');
check(chatServer.includes('v-clean-slate'), 'v-clean-slate: النظام القصير معلن');
check(/PERSONA_NOTE \+ '\\n' \+ baseSystem/.test(chatServer), 'البصمة تتصدر النظام في كل المسارات');
check(!/baseSystem[^;]*SHAPE_TAIL/.test(chatServer), 'v-clean-slate: ذيل التنسيق فُصل من النظام');
check(chatServer.includes('بفقرات وعناوين وقوائم مرتبة'), 'v-clean-slate: التنسيق جملة واحدة في الشخصية');
check(chatServer.includes('شخصيتك: زميل خبير دافئ'), 'v-clean-slate: الشخصية بثلاث جمل');
check(chatServer.includes('يطمئنه قبل حل مشكلته'), 'التعاطف قبل الحل في السطر القصير');
check(chatServer.includes('الزبدة أولًا'), 'الحل المباشر في المقدمة');
check(chatServer.includes('بروح المجلس'), 'v-clean-slate: روح المجلس في النظام القصير');
check(chatServer.includes('تجاري لهجة المستخدم'), 'v-clean-slate: مجاراة اللهجة حاضرة');
check(chatServer.includes('استثناء — النوع الجوهري فقط'), 'سؤال النوع الجوهري مسموح بعد إجابة أولية');
// كانت check(true, …) — تطبع ✓ مهما حدث، فحوّلت إلى ملاحظات لا تدّعي نجاحًا:
note('v-clean-slate: الندية والتفكيك ولا-قواعد-العبارات من طبيعة النموذج — لا فحص لها');

// ═══ التسوّق والنية ═══
group('التسوّق والنية');

check(chatServer.includes('معالج التسوق والتصفح'), 'معالج التسوق موجود في WIZARD_NOTE');
check(chatServer.includes('مواقع سيارات'), 'مثال مواقع السيارات موجود في معالج التسوق');
check(chatServer.includes('للكبار|للأطفال'), 'بطاقات فئة العمر موجودة في معالج التسوق');
// v-cat-match: «فندق» أعطى دوبيزل و«مندي» أعطى عقارًا — الموقع يطابق فئة الطلب.
check(chatServer.includes('(ص٨) تطابق الفئة إلزاميّ') && chatServer.includes('ممنوع منعًا باتًا دوبيزل أو أي موقع إعلانات عامّ في طلبات الفنادق والأكل'), 'قاعدة تطابق الفئة: لا موقع من فئة أخرى ولو ظهر في البحث');

// v-num-plain: «اريد ارقام للبيع» رسمت صورة ووُعظ صاحبها «بيانات غير قانونية».
{
  const re = extractRegex(chatServer, 'NUM_ASK_RE', 'NUM_ASK_RE');
  if (re) {
    behavior(re.test('اريد ارقام للبيع') && re.test('ابي ارقام'), '«اريد/ابي أرقام» تدخل مسار الأرقام المتخصص');
    behavior(!re.test('كم رقم الطوارئ') && !re.test('ارقام الصفحة'), 'الأسئلة العادية عن الأرقام لا تدخل المسار خطأً');
  }
  check(chatServer.includes('ممنوع استدعاء generate_image — لا صورة في هذا الردّ'), 'مسار الأرقام يمنع الصورة — روابط الأسواق فقط');
  check(chatServer.includes('تجارة مشروعة مألوفة في الإمارات'), 'مسار الأرقام يمنع الوعظ القانوني');
}

// v-intent-tech: «تحديث نظام شاشة السيارة» أعادت مواقع بيع سيارات لا صلة لها.
{
  const tre = extractRegex(searchSrc, 'TECH_INTENT_RE', 'حارس النية التقنية');
  if (tre) {
    behavior(tre.test('تحديث نظام شاشة السيارة') && tre.test('كيف اصلح مشكلة البلوتوث في سيارتي'), 'السؤال التقني عن السيارة يُكشف');
    behavior(!tre.test('اريد سيارة للبيع') && !tre.test('سيارات مستعملة رخيصة'), 'طلب الشراء لا يُحسب تقنيًا');
  }
  check(searchSrc.includes('const isNumbers = !__techAsk &&') && searchSrc.includes('const isListing = isNumbers || (!__techAsk &&'), 'النية التقنية تفكّ قفل محرّك القوائم');
  check(searchSrc.includes('exclude_domains') && searchSrc.includes('__techAsk ? { exclude_domains'), 'السؤال التقني يستبعد مواقع الإعلانات المبوبة صراحةً');
}

// v-photo-ctx: «عطني صور السيارة» بعد نقاش ليوبارد 8 جابت سيارات عشوائية.
check(attach.includes('v-photo-ctx') && attach.includes('__photoQ = __prevU.content'), 'بحث الصور يُثرى بموضوع المحادثة للطلب المُشير القصير');
// v-clean-links: الرابط العاري كان يُعرض بنصّه المرمّز %D8… فيملأ الشاشة.
check(bundle.includes('v-clean-links') && bundle.includes(".hostname.replace(/^www\\./, '')"), 'الرابط العاري يُعرض باسم نطاقه فقط ويبقى قابلًا للضغط');

// ═══ الصورة والفيديو التوضيحي ═══
group('الصورة والفيديو التوضيحي');

// v-chat-tools: فحص «فيديو وتوضيح يفعّلان مسار الأدوات» كان يثبّت قائمة
// الكلمات المحذوفة — الأدوات الآن في كل دور غير اجتماعي فلا حاجة لتفعيل بكلمة.
check(chatServer.includes('قاعدة الصورة/الفيديو التوضيحي'), 'القاعدة الصريحة موجودة في تعليمات الأدوات');
check(chatServer.includes('ممنوع web_search للطلبات التوضيحية'), 'يمنع web_search صراحةً عند الطلب التوضيحي');
/* v-tv-hls: صياغة chat.js تغيّرت على main («بوصف إنجليزي احترافي») والفحص
   بقي على النص القديم فاحمرّ — الفحص الآن على الجوهر لا الحرف. */
check(chatServer.includes('استدعِ generate_image') && chatServer.includes('بوصف إنجليزي'), 'يُوجّه النموذج لاستخدام generate_image بوصف إنجليزي من سياق المحادثة');

// ═══ إزالة التكرار بين استدعاءات البحث ═══
group('إزالة التكرار بين استدعاءات البحث');

check(chatServer.includes('const seenHostnames = new Set()'), 'يُنشئ مجموعة المواقع المرئية قبل حلقة الأدوات');
check(chatServer.includes('function filterDuplicateUrls('), 'دالة فرز التكرار موجودة في مسار الخادم');
check(chatServer.includes('filterDuplicateUrls(await tavilySearch('), 'نتيجة البحث تمرّ عبر فرز التكرار قبل إرسالها للنموذج');
check(chatServer.includes('seenHostnames.has(host)'), 'يتحقق من الـ hostname قبل تمرير الموقع');
check(chatServer.includes('seenHostnames.add(host)'), 'يسجّل الـ hostname بعد أول ظهور');

// اختبار وظيفي: نفس الموقع لا يظهر مرتين.
// ملاحظة: هذه نسخة موازية للدالة الأصلية — إن عُدّلت في chat.js ولم تُعدّل هنا
// يبقى الاختبار أخضر على منطق قديم. الأفضل مستقبلًا تصديرها واستيرادها.
const filterDuplicateUrls = (() => {
  const seenHostnames = new Set();
  return function (text) {
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

const firstSearch  = '1. بوكينج\nhttps://www.booking.com/\n\n2. تريفاجو\nhttps://www.trivago.ae/';
const secondSearch = '1. أجودا\nhttps://www.agoda.com/\n\n2. بوكينج مرة ثانية\nhttps://booking.com/hotels';
const r1 = filterDuplicateUrls(firstSearch);
const r2 = filterDuplicateUrls(secondSearch);
behavior(r1.includes('booking.com') && r1.includes('trivago.ae'), 'البحث الأول يعرض مواقعه كاملة');
behavior(r2.includes('agoda.com'), 'البحث الثاني يعرض الموقع الجديد');
behavior(!r2.includes('booking.com'), 'بوكينج لا يظهر مرة ثانية في نفس الدور');

// ═══ أسلوب العميل والحزمة ═══
group('أسلوب العميل والحزمة');

// v-warm-social: «هلا وغلا» الجافة وحدها رفضها المالك — التحية حارة راقية
// بسؤال واحد يفتح الحديث، والممنوع الوحيد عرض الخدمات وسرد القديم.
check(prompts.includes('ترحيبًا حارًّا راقيًا بروح المجلس'), 'التحية حارة راقية لا جافة');
check(prompts.includes('كيف أقدر أساعدك؟') && prompts.includes('سرد المواضيع القديمة'), 'الممنوع الوحيد: عرض الخدمات وسرد القديم');
check(prompts.includes('لا تبدأ بتحية من نفسك'), 'بداية المحادثة صامتة');
check(prompts.includes('ممنوع «كيف أقدر أساعدك؟» الرسمية وعرض الخدمات'), 'توجيه التحية في العميل يمنع الرسمية');
// v-persona-front: «العربية البيضاء الهادئة» كانت تناقض بصمة المالك وتطمسها.
check(prompts.includes('بصمة المالك') && prompts.includes('احتفل بإنجاز المستخدم'), 'أسلوب العميل هو بصمة المالك');
check(!prompts.includes('لا تقلّد شخصية المستخدم'), 'أزيل التناقض: مجاراة لهجة المستخدم مطلوبة لا ممنوعة');
check(!prompts.includes('فردّ حرفيًا: «أهلًا بك.» فقط'), 'أزيل الرد الحرفي «أهلًا بك.»');
check(!prompts.includes('يحيّه ويسأله وش يحتاج'), 'أزيلت صيغة «وش يحتاج» المفروضة');
check(!prompts.includes('لهجتك الافتراضيّة إماراتيّة بيضاء'), 'أزيل فرض اللهجة المصطنعة');

// الحزمة مطابقة للمصادر — هذا الفحص هو حارس bundle=false الحقيقي:
// حزمة قديمة تعني أن الإصلاحات لم تصل للمستخدم أصلًا.
check(bundle.includes('تحية لفظية فقط وليست سؤالًا') && bundle.includes('isCasualCheckIn'), 'الحزمة المباشرة مطابقة للمصادر');
check(!bundle.includes('فردّ حرفيًا: «أهلًا بك.» فقط'), 'الحزمة المباشرة بلا الرد المحفوظ');

// ═══ الخلاصة ═══
console.log('\n' + '─'.repeat(60));
if (failures.length === 0) {
  console.log(`✅ نجحت كل الفحوصات (${passed})`);
  console.log('   فصل التحية عن المحادثة واستمرار السياق — نجح');
  process.exit(0);
}
console.log(`❌ ${failures.length} فحصًا فشل من أصل ${passed + failures.length}:\n`);
let last = '';
for (const f of failures) {
  if (f.section !== last) { console.log('  ▸ ' + f.section); last = f.section; }
  console.log('    ✗ ' + f.label);
}
console.log('\nملاحظة: الفحوصات غير المعلّمة بـ[سلوك] تبحث عن نصّ في المصدر —');
console.log('قد تفشل بسبب إعادة صياغة سليمة لا بسبب عطل حقيقي. راجع قبل الإصلاح.');
process.exit(1);
