const fs = require('node:fs');

const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
const i18n = fs.readFileSync('js/app-03-i18n-data.js', 'utf8');
const prompts = attach + '\n' + i18n;

function check(ok, label) {
  if (!ok) throw new Error(label);
  console.log('  ✓ ' + label);
}

check(attach.includes('إذا كانت بالعربية، فردّ حرفيًا: «أهلًا بك.» فقط'), 'التحية العربية راقية ومحدّدة');
check(attach.includes('لا تسأل سؤالًا لاحقًا'), 'لا سؤال محفوظ بعد التحية');
check(prompts.includes('لا تبدأ بتحية من نفسك'), 'بداية المحادثة صامتة');
check(prompts.includes('بيضاء واضحة ومهذّبة'), 'الأسلوب العربي واضح ومهذّب');
check(!prompts.includes('يحيّه ويسأله وش يحتاج'), 'أزيلت صيغة «وش يحتاج» المفروضة');
check(!prompts.includes('لهجتك الافتراضيّة إماراتيّة بيضاء'), 'أزيل فرض اللهجة المصطنعة');

console.log('\n✅ أسلوب المحادثة الراقي — نجح');
