const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const maha = fs.readFileSync('js/app-08-maha.js', 'utf8');
const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
const checkout = fs.readFileSync('js/app-06-checkout.js', 'utf8');
const i18n = fs.readFileSync('js/app-03-i18n-data.js', 'utf8');
const bundle = fs.readFileSync('js/app.bundle.js', 'utf8');
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
