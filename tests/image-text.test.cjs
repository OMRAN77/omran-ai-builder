'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseImageTextSpec, isExplicitImageEdit } = require('../js/app-08-image-text.js');

test('Arabic prayer is extracted character-for-character', () => {
  const exact = 'اللهم اجعل يومنا نورًا، وارزقنا خيره.';
  const s = parseImageTextSpec('أنشئ صورة شمس واكتب عليها «' + exact + '»');
  assert.equal(s.exactText, exact);
  assert.equal(s.visualPrompt, 'أنشئ صورة شمس');
  assert.equal(s.wantsText, true);
});

test('multiline poetry and punctuation are preserved verbatim', () => {
  const exact = 'إذا غامرتَ في شرفٍ مرومِ\nفلا تقنعْ بما دونَ النجومِ';
  const s = parseImageTextSpec('صورة ليل واكتب عليها «' + exact + '» بخط ديواني ذهبي في الوسط');
  assert.equal(s.exactText, exact);
  assert.equal(s.fontKey, 'diwani');
  assert.equal(s.color, '#f4cf65');
  assert.equal(s.position, 'center');
  assert.equal(s.visualPrompt, 'صورة ليل');
});

test('arbitrary prayer topics route to dynamic authorship without a fixed text', () => {
  const requests = ['دعاء للطمأنينة عند القلق', 'دعاء لمن يبدأ مشروعًا جديدًا', 'دعاء لمريض بعيد عن أهله'];
  const specs = requests.map(parseImageTextSpec);
  assert.equal(specs.every((s, i) => s.wantsText && !s.exactText && s.autoAuthored && s.prayerRequest === requests[i]), true);
});

test('explicit prayer wording remains character-for-character and bypasses authorship', () => {
  const exact = 'اللهم اكتب لنا الخير حيث كان.';
  const quoted = parseImageTextSpec('صورة نافذة واكتب عليها دعاء «' + exact + '»');
  assert.equal(quoted.exactText, exact);
  assert.equal(quoted.autoAuthored, undefined);
  const literal = parseImageTextSpec('صورة بطاقة واكتب عليها النص: دعاء للوالدين');
  assert.equal(literal.exactText, 'دعاء للوالدين');
});

test('putting an object in a scene is not misclassified as writing', () => {
  const s = parseImageTextSpec('ضع شمسًا في السماء فوق البحر');
  assert.equal(s.wantsText, false);
  assert.equal(s.exactText, null);
});

test('weak Arabic writing verbs are recognized only with a text object', () => {
  const s = parseImageTextSpec('صورة قمر حط عليها النص: مساء الخير');
  assert.equal(s.wantsText, true);
  assert.equal(s.exactText, 'مساء الخير');
  assert.equal(s.visualPrompt, 'صورة قمر');
});

test('unquoted chained formatting is excluded from the literal wording', () => {
  const s = parseImageTextSpec('صورة شمس واكتب عليها النص: مساء الخير بخط ديواني ذهبي في الوسط');
  assert.equal(s.exactText, 'مساء الخير');
  assert.equal(s.fontKey, 'diwani');
  assert.equal(s.color, '#f4cf65');
  assert.equal(s.position, 'center');
});

test('spaces and style-like words inside quotation marks stay literal', () => {
  const s = parseImageTextSpec('اكتب على الصورة «  نحن في الوسط صباح ذهبي  »');
  assert.equal(s.exactText, '  نحن في الوسط صباح ذهبي  ');
  assert.equal(s.color, '#ffffff');
  assert.equal(s.position, 'bottom');
});

test('placed quoted wording on a card is extracted for local drawing', () => {
  const s = parseImageTextSpec('صمّم بطاقة عليها عبارة «مبروك»');
  assert.equal(s.wantsText, true);
  assert.equal(s.exactText, 'مبروك');
  assert.equal(s.visualPrompt, 'صمّم بطاقة');
});

test('descriptive written content is not mistaken for a canvas command', () => {
  const s = parseImageTextSpec('صورة لكتاب مكتوب على غلافه «التاريخ»');
  assert.equal(s.wantsText, false);
});

test('only explicit follow-ups reuse a previous image', () => {
  assert.equal(isExplicitImageEdit('عدّل الصورة واجعلها ليلًا'), true);
  assert.equal(isExplicitImageEdit('غيّر لونها إلى الأزرق'), true);
  assert.equal(isExplicitImageEdit('نفس الصورة ولكن ليلًا'), true);
  assert.equal(isExplicitImageEdit('غيّر الخلفية إلى مكتب'), true);
  assert.equal(isExplicitImageEdit('خل الخلفية مكتب'), true);
  assert.equal(isExplicitImageEdit('غيّر رأيك في الموضوع'), false);
  assert.equal(isExplicitImageEdit('ارسم صورة جديدة فيها قمر'), false);
  assert.equal(isExplicitImageEdit('ارسم صورة صغيرة فيها قمر'), false);
  assert.equal(isExplicitImageEdit('أضف كلبًا إلى صورة ليل جديدة'), false);
  assert.equal(isExplicitImageEdit('أنشئ صورة شمس'), false);
});

test('text-only follow-ups keep wording and restyle the stored layer', () => { assert.equal(parseImageTextSpec('غير لون الكتابة للأصفر').styleEdit.color, '#ffd400'); assert.deepEqual(['أريد دعاء','أريد شعر','أريد كلام غزل'].map(x => parseImageTextSpec(x).kind), ['prayer','poetry','flirt']); });
test('all account font choices are accepted for image writing', () => { assert.deepEqual(['الافتراضي','الكوفي','النسخ','نسخ نوتو','الثلث','الفارسي','الديواني','الرقعة','المصحف'].map(x => parseImageTextSpec('اكتب على الصورة «نص» بالخط '+x).fontKey), ['default','kufi','naskh','naskh2','thuluth','farsi','diwani','ruqaa','quran']); });
