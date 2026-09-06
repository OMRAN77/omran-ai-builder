'use strict';
/* v-arch-topic — «نعم» بعد ردّ عن موضوع آخر (شاحن BYD) لا يرسم مخططًا وواجهة، ولا يُكتب نصّ الردّ داخل الصورة */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const attach = fs.readFileSync(__dirname + '/../js/app-09-attach.js', 'utf8');
const __archStrongRe = new Function('return ' + attach.match(/const __archStrongRe = (\/[^\n]*\/i);/)[1])();
const __lastAskedOffTopic = new Function('__archStrongRe', 'return ' + attach.match(/const __lastAskedOffTopic = (\(m\) => \{[\s\S]*?\n    \});/)[1])(__archStrongRe);

const chargerReply = [
  'بما إنك تحدد المواصفات بدقة، خلّني ألخص لك المنتج الذي تبحث عنه ثم أنبهك لنقطة مهمة بخصوص التوافق مع BYD:',
  '## مواصفات الشاحن المطلوب',
  '| **النوع** | Wallbox (وول بوكس) — تيار متردد AC |',
  '| **التركيب** | تثبيت على الحائط (Wall-mounted) |',
  '| **الاتصال/التفعيل** | بطاقة RFID/NFC قريبة المدى لتفعيل الشحن |',
  'الشواحن بمعيار GB/T تُصنَّع أساسًا من مزوّدين صينيين مثل EVDream، Star Charge.',
  'هل سيارتك مستوردة من الصين مباشرة، أو من وكيل محلي؟ أقدر أوجهك بدقة أكثر بناءً على الإجابة.'
].join('\n');
const archReply = 'تمام، هذا التصور: فيلا دور أرضي بمساحة 250 م² — مجلس ومطبخ وثلاث غرف نوم، والمخطط يوضّح التوزيع الداخلي. تبيني أبدأ بالمخطط والواجهة؟';

test('a charger-spec reply is not an architectural context: «تثبيت» is not «بيت» and «مواصفات» alone is not a plan', () => {
  assert.equal(__archStrongRe.test(chargerReply), false);
  for (const t of ['التركيب تثبيت على الحائط', 'مواصفات الشاحن المطلوب', 'ثبّت التطبيق', 'واجهة المستخدم', 'كتبيت']) assert.equal(__archStrongRe.test(t), false, t);
  for (const t of ['فيلا دور أرضي', 'مخطط البيت', 'بيتك الجديد', 'الواجهة الخارجية', 'مساحة 250 م²', 'الشكل الخارجي', 'floor plan for a villa', 'شقة بغرفتين']) assert.equal(__archStrongRe.test(t), true, t);
});

test('«نعم» answers the last question when that question is about another topic', () => {
  assert.equal(__lastAskedOffTopic({ content: chargerReply }), true);
  assert.equal(__lastAskedOffTopic({ content: archReply }), false);
  assert.equal(__lastAskedOffTopic({ content: 'هذا مخطط الدور الأرضي بالمقاسات. هل أبدأ؟' }), false);
  assert.equal(__lastAskedOffTopic({ content: 'هذا مخطط الدور الأرضي بالمقاسات.' }), false);
  assert.equal(__lastAskedOffTopic({ content: 'وش نوع سيارتك؟ ' + 'x'.repeat(300) }), false, 'سؤال قديم في وسط الرد لا يُحتسب');
  assert.equal(__lastAskedOffTopic(null), false);
});

test('the pipeline gates read the shared detector, and the facade prompt forbids printing the request', () => {
  assert.match(attach, /const __archAffirm = !!\(__archCtxText && text && __archAffirmRe\.test\(text\) && !__lastAskedOffTopic\(__lastAsst\)\);/);
  assert.match(attach, /if\(!__laChk \|\| !__archStrongRe\.test\(__laChk\.content\)/);
  assert.match(attach, /__la\.content\.length > 250 && __archStrongRe\.test\(__la\.content\)/);
  assert.match(attach, /__la\.content\.replace\(\/\[#\*\|_`>\]\+\|-\{3,\}\/g, ' '\)/);
  assert.match(attach, /Request \(a written description only — never print, write or render any of its words, headings, tables or numbers as text inside the photo; the photo must contain no text at all\): "' \+ __archText \+ '"/);
});
