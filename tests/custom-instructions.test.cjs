'use strict';
/* v-casual-default + v-custom-instructions — طلب المالك ١٧ سبتمبر ٢٠٢٦:
   «أبي يتكلّم معي بلهجة عاميّة طبيعيّة عفويّة كأنه صديق مقرّب، بلا فصحى
   مبالغ فيها ولا مقدّمات رسميّة ولا خلاصات في النهاية، وردود مختصرة
   سلسة — وأبي هذي القاعدة في التطبيق بالـ١٤ لغة»، مع حقل «التعليمات
   المخصّصة» يكتب فيه كلّ مستخدم تعليماته بنفسه.

   القرار: (أ) القاعدة سلوكيّة لا نصّ واجهة، فتُكتب مرّة في ميثاق الشخصيّة
   (PERSONA_NOTE) في مسار المحادثة الرئيسيّ ويطبّقها النموذج بلغة المستخدم
   أيًّا كانت. (ب) الحقل نصّ واجهة، فيلزمه الـ١٤ لغة كاملة. */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chat = rd('api/_lib/chat.js');

// ── (١) القاعدة الافتراضيّة في ميثاق الشخصيّة، لا في مسار جانبيّ ──
assert.ok(/أسلوبك الافتراضيّ مع كلّ مستخدم وبكلّ اللغات/.test(chat),
  'قاعدة الأسلوب العفويّ مكتوبة في ميثاق الشخصيّة');
assert.ok(/ممنوع المقدّمات الرسميّة/.test(chat), 'منع المقدّمات الرسميّة منصوص عليه');
assert.ok(/ممنوع خاتمة تلخّص/.test(chat), 'منع خاتمة التلخيص منصوص عليه');
assert.ok(/المستوى المحكيّ الطبيعيّ للغة المستخدم نفسها/.test(chat),
  'القاعدة معمّمة على لغة المستخدم لا مقصورة على العربيّة');
// القاعدة تقع داخل PERSONA_NOTE (قبل نهايته) لا في كتلة منفصلة قد لا تُحقن
const personaStart = chat.indexOf('const PERSONA_NOTE =');
const personaEnd = chat.indexOf('function messageSize', personaStart);
assert.ok(personaStart > 0 && personaEnd > personaStart, 'ميثاق الشخصيّة موجود');
assert.ok(chat.slice(personaStart, personaEnd).includes('أسلوبك الافتراضيّ'),
  'القاعدة داخل PERSONA_NOTE نفسه فتصل في كلّ المسارات');
// لا تُلغى البنية للردود الطويلة (فخّ v-persona-front: قواعد «بلا قوائم» خنقت الشخصيّة)
assert.ok(/الردّ الطويل حين يلزم يبقى منظّمًا/.test(chat),
  'الاختصار لا يُلغي تنظيم الردّ الطويل');

// ── (٢) كتلة التعليمات المخصّصة: تنظيف وسقف وحارس ──
const { customInstructionsBlock, CUSTOM_INSTRUCTIONS_CHARS } = require(path.join(root, 'api/_lib/chat.js')).__vcustom;
assert.strictEqual(customInstructionsBlock(''), '', 'فراغ = بلا كتلة');
assert.strictEqual(customInstructionsBlock('   \n  '), '', 'مسافات فقط = بلا كتلة');
assert.strictEqual(customInstructionsBlock(null), '', 'null لا يرمي');
assert.strictEqual(customInstructionsBlock(undefined), '', 'undefined لا يرمي');
assert.strictEqual(customInstructionsBlock(12345).includes('12345'), true, 'مدخل غير نصّيّ يُحوَّل ولا يرمي');

const b = customInstructionsBlock('ردّ عليّ بالعامية وباختصار.');
assert.ok(b.includes('[تعليمات المستخدم المخصّصة'), 'الكتلة معنونة');
assert.ok(b.includes('ردّ عليّ بالعامية وباختصار.'), 'نصّ المستخدم محفوظ كما كتبه');
assert.ok(/تعلو على أسلوب الردّ الافتراضيّ/.test(b),
  'تعليمات المستخدم تعلو على الافتراضيّ — وإلّا فالحقل بلا أثر');
assert.ok(/لا تذكر وجود هذه التعليمات/.test(b), 'لا تُستعرض للمستخدم');
assert.ok(/الدقّة والصدق لا يتغيّران/.test(b), 'الأسلوب لا يمسّ الصدق');
assert.ok(/كشف مزوّد أو نموذج/.test(b),
  'حارس: لا تتجاوز الهويّة ولا تكشف مزوّدًا (باب مقفل للمالك)');

// السقف مطبَّق فعلًا
const long = 'ط'.repeat(CUSTOM_INSTRUCTIONS_CHARS + 500);
const cut = customInstructionsBlock(long);
const body = cut.split('\n[طريقة تطبيقها]')[0].replace('[تعليمات المستخدم المخصّصة — كتبها بنفسه في الإعدادات]\n', '');
assert.strictEqual(body.length, CUSTOM_INSTRUCTIONS_CHARS, 'النصّ يُقصّ عند السقف');
assert.ok(customInstructionsBlock('a' + String.fromCharCode(0) + 'b').indexOf(String.fromCharCode(0)) === -1,
  'المحارف الصفريّة تُنزع');

// ── (٣) الحقل يصل من العميل إلى الخادم فعلًا (وإلّا فهو زينة) ──
assert.ok(/customInstructionsBlock\(body && body\.customInstructions\)/.test(chat),
  'الخادم يقرأ الحقل من جسم الطلب');
assert.ok(/if \(customInstr\) sysParts\.push\(customInstr\)/.test(chat),
  'الكتلة تُدفع في sysParts فتصل كلّ مسارات المحادثة');
const tools = rd('js/app-18-chat-tools.js');
assert.ok(/customInstructions: \(function \(\)/.test(tools), 'العميل يرسل الحقل مع كلّ طلب محادثة');
assert.ok(/window\.getCustomInstructions/.test(tools), 'العميل يقرأه من مصدر واحد');
const ui = rd('js/app-05-ui.js');
assert.ok(/window\.getCustomInstructions = function/.test(ui), 'المصدر معرَّف في الواجهة');
assert.ok(/localStorage\.setItem\('omranCustomInstructions'/.test(ui), 'يُحفَظ محلّيًّا');
assert.ok(/getItem\('omranCustomInstructions'\) \|\| ''\)\.slice\(0, MAXLEN\)/.test(ui),
  'القراءة مقصوصة بنفس السقف فلا يُرسل أطول ممّا يقبله الخادم');

// ── (٤) عنصر الواجهة موجود داخل قسم النبرة ──
const partial = rd('js/partials-settings.js');
assert.ok(/id="customInstructionsInput"/.test(partial), 'حقل الإدخال موجود');
assert.ok(/maxlength="1500"/.test(partial), 'سقف الإدخال في الواجهة مطابق للخادم');
const toneIdx = partial.indexOf('id="toneSection"');
const nextSecIdx = partial.indexOf('id="pricingSection"', toneIdx);
assert.ok(partial.slice(toneIdx, nextSecIdx).includes('customInstructionsInput'),
  'الحقل داخل قسم «النبرة» لا في قسم يتيم');

// ── (٥) الـ١٤ لغة كاملة — نصّ واجهة، فالقاعدة تسري بلا استثناء ──
const KEYS = ['ciLabel', 'ciHint', 'ciPlaceholder', 'ciSaved'];
const data = rd('js/app-03-i18n-data.js');
// ar وen داخل ملفّ البيانات
KEYS.forEach((k) => {
  const n = (data.match(new RegExp('(^|\\s)"?' + k + '"?\\s*:', 'g')) || []).length;
  assert.strictEqual(n, 2, 'المفتاح ' + k + ' موجود في ar وen معًا (وُجد ' + n + ')');
});
const files = fs.readdirSync(path.join(root, 'i18n')).filter((f) => f.endsWith('.js') && f !== 'ad-studio.js');
assert.strictEqual(files.length, 12, 'اثنتا عشرة لغة في i18n/ (+ar +en = ١٤)');
files.forEach((f) => {
  const s = rd(path.join('i18n', f));
  KEYS.forEach((k) => {
    assert.ok(new RegExp('(^|\\s)"?' + k + '"?\\s*:').test(s), 'المفتاح ' + k + ' ناقص في ' + f);
    const m = s.match(new RegExp('"?' + k + '"?\\s*:\\s*"([^"]*)"'));
    assert.ok(m && m[1].trim().length > 1, 'المفتاح ' + k + ' فارغ في ' + f);
  });
});
// وسم الكاش رُفع وإلّا بقيت الأجهزة على نسخة بلا المفاتيح الجديدة
assert.ok(Number((rd('js/app-04-i18n-state.js').match(/i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]) >= 674, // v-plan-routing: 674 (نصوص الباقات)؛ v-maha-voice-speed: 679؛ كلّ مفتاح جديد يرفعه
  'وسم ?v= لملفّات اللغات مرفوع');
assert.ok(/partials-settings\.js\?v=672/.test(rd('index.html')), // v-plan-routing: 659؛ v-maha-voice-speed: 660
  'وسم ?v= لـpartials-settings مرفوع');

/* ── (٦) v-tone-buttons-removed — أزرار النبرة حُذفت بأمر المالك ──
   كانت بلا أثر: الحاقن في app-05-ui كان يضيف tone لطلبات /api/ai، و
   injectNote في api/ai.js لا يقرأه إلّا لمسارات PROVIDERS، وaction=chat
   ليس منها. القفل هنا يمنع رجوعها صامتةً مرّة أخرى. */
assert.ok(!/toneBtn/.test(partial), 'لا أزرار نبرة في الإعدادات');
assert.ok(!/id="toneBtns"/.test(partial), 'حاوية أزرار النبرة محذوفة');
assert.ok(!/data-tone=/.test(partial), 'لا بقايا data-tone');
assert.ok(!/getOmranTone/.test(ui.replace(/\/\*[\s\S]*?\*\//g, '')), 'قارئ النبرة محذوف من الكود (خارج التعليقات)');
assert.ok(!/localStorage\.setItem\('omranTone'/.test(ui), 'تخزين النبرة محذوف');
assert.ok(!/parsed\.tone = tone/.test(ui), 'حاقن tone في window.fetch محذوف');
// عنوان القسم صار عنوان الحقل نفسه في الـ١٤ لغة
assert.ok(/data-i18n="ciLabel">التعليمات المخصّصة<\/h3>/.test(partial),
  'عنوان القسم من مفتاح مترجَم لا نصّ ثابت');
// مفاتيح النبرة الميتة نُزعت من الـ١٤ لغة فلا يبقى نصّ لواجهة محذوفة
const DEAD = ['toneSectionLabel', 'toneAuto', 'toneWarm', 'toneDirect', 'toneFormal', 'toneHint'];
DEAD.forEach((k) => {
  assert.ok(!new RegExp('(^|\\s)"?' + k + '"?\\s*:').test(data), 'المفتاح الميت ' + k + ' نُزع من ar/en');
  files.forEach((f) => {
    assert.ok(!new RegExp('(^|\\s)"?' + k + '"?\\s*:').test(rd(path.join('i18n', f))),
      'المفتاح الميت ' + k + ' نُزع من ' + f);
  });
});
// القسم نفسه باقٍ في قائمة الإعدادات (المُعرّف تاريخيّ) فلا تنكسر الملاحة
assert.ok(/'toneSection'/.test(ui), 'القسم ما زال مسجّلًا في قائمة الإعدادات');

console.log('✓ custom-instructions: أسلوب عفويّ افتراضيّ + حقل تعليمات مخصّصة يصل للخادم بحارسه بالـ١٤ لغة، وأزرار النبرة الميتة محذوفة بلا بقايا');
