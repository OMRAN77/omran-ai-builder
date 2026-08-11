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

for (const text of ['هلا', 'أهلًا', 'السلام عليكم', 'صباح الخير', 'hello']) {
  check(greetingFns.isPureGreeting(text), `تُعرف التحية اللفظية: ${text}`);
}
for (const text of ['كيف الحال', 'كيف حالك؟', 'هلا كيف الحال', 'how are you?', 'عندي مشروع']) {
  check(!greetingFns.isPureGreeting(text), `لا يُختزل السؤال/الطلب إلى تحية: ${text}`);
}
for (const text of ['كيف الحال', 'كيف حالك؟', 'هلا كيف الحال', 'how are you?']) {
  check(greetingFns.isCasualCheckIn(text), `تُعرف المجاملة لتجاوز البحث فقط: ${text}`);
}

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
check(chatServer.includes('أضف خطوة تنفيذيّة واحدة فقط إذا كان الطلب عمليًّا متعدد الخطوات') && chatServer.includes('وإلّا اختم بعد المعلومة بلا اقتراح آلي'), 'الخادم لا يعيد فرض خطوة تالية على كل جواب');
check(chatServer.includes('اسأل سؤالًا واحدًا فقط عندما تنقص معلومة تؤثّر فعليًّا') && chatServer.includes('لا تُلحق سؤالًا عامًا بكل رد'), 'سؤال الخادم مشروط بنقص مؤثر');
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
check(prompts.includes('من دون صيغة ثابتة'), 'لا توجد إجابة تحية محفوظة');
check(prompts.includes('«كيف الحال؟» أجب عنه كحديث مستمر'), 'سؤال المجاملة يُعامل كمحادثة مستمرة');
check(attach.includes('const __quietSocialTurn = isPureGreeting(text) || isCasualCheckIn(text)') && attach.includes('const __memMsg = __quietSocialTurn ? null : memorySystemMsg()'), 'سؤال الحال لا يحقن ذاكرة الحساب في العميل');
check(attach.includes('const __prev = __quietSocialTurn ? [] :'), 'سؤال الحال لا يرسل المواضيع السابقة إلى المزود');
check(attach.includes('هذا سؤال حال ضمن محادثة مستمرة، وليس تحية جديدة') && attach.includes('ولا تعرض المساعدة، ولا تذكر أي مشروع أو اهتمام أو موضوع سابق'), 'سؤال الحال له توجيه مباشر يمنع عرض الخدمة والمواضيع القديمة');
check(attach.includes('!(isPureGreeting(text) || isCasualCheckIn(text))'), 'الدور الاجتماعي العابر لا يلوث الذاكرة طويلة المدى');
check(chatServer.includes('function isCasualCheckIn(text)') && chatServer.includes('if (usage.username && !quietSocialTurn)'), 'الخادم لا يقرأ ذاكرة الحساب لسؤال الحال');
check(chatServer.includes('const system = quietSocialTurn') && chatServer.includes('ولا تذكر أي مشروع أو اهتمام أو موضوع سابق'), 'الخادم يعزل الدور الاجتماعي عن التاريخ ومعرفة المالك');
check(chatServer.includes('tools: quietSocialTurn ? undefined : TOOLS'), 'الخادم لا يتيح أدوات البحث للدور الاجتماعي');
check(chatServer.includes('const convoSource = quietSocialTurn ? [lastUser] : messages'), 'الخادم لا يرسل تاريخ المواضيع في سؤال الحال');
check(prompts.includes('لا تطرح أي سؤال ولا تعرض المساعدة'), 'التحية تبقى قصيرة بلا سؤال أو عرض خدمة');
check(prompts.includes('لا تعرض المساعدة بدل الجواب'), 'سؤال الحال يُجاب عنه ولا يتحول إلى عرض خدمة');
check(prompts.includes('لا تبدأ بتحية من نفسك'), 'بداية المحادثة صامتة');
check(prompts.includes('بيضاء واضحة ومهذّبة'), 'الأسلوب العربي واضح ومهذّب');
check(!prompts.includes('فردّ حرفيًا: «أهلًا بك.» فقط'), 'أزيل الرد الحرفي «أهلًا بك.»');
check(!prompts.includes('يحيّه ويسأله وش يحتاج'), 'أزيلت صيغة «وش يحتاج» المفروضة');
check(!prompts.includes('لهجتك الافتراضيّة إماراتيّة بيضاء'), 'أزيل فرض اللهجة المصطنعة');
check(bundle.includes('تحية لفظية فقط وليست سؤالًا') && bundle.includes('isCasualCheckIn'), 'الحزمة المباشرة مطابقة للمصادر');
check(!bundle.includes('فردّ حرفيًا: «أهلًا بك.» فقط'), 'الحزمة المباشرة بلا الرد المحفوظ');

console.log('\n✅ فصل التحية عن المحادثة واستمرار السياق — نجح');
