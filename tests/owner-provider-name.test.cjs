// v-owner-real-names (١٨ سبتمبر ٢٠٢٦): للمالك وحده اسم المزوّد الحقيقيّ القصير في سطر الحالة وشارة الردّ؛
// بقيّة المستخدمين على الألقاب الوظيفيّة (الكينج/السريع/العميق) كما هي.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('js/app-05-ui.js');

// نستخرج المقطع من تعريف PROVIDER_KEY_LABELS حتّى نهاية functionalLabel ونشغّله معزولًا بمحاكاة authGet وt.
function build(username) {
  const start = src.indexOf('const PROVIDER_KEY_LABELS = {');
  const fnStart = src.indexOf('function functionalLabel(key){', start);
  const end = src.indexOf('\n}\n', fnStart) + 3;
  assert.ok(start > 0 && fnStart > start && end > fnStart, 'المقطع موجود');
  const chunk = src.slice(start, end).replace(/^const PROVIDER_LOGOS = .*$/m, '');
  const ctx = {
    authGet: (k) => (k === 'aiapp_username' ? username : ''),
    t: (k) => ({ provNickKing: 'الكينج', provNickFast: 'السريع', provNickDeep: 'العميق' }[k] || k),
  };
  vm.runInNewContext(chunk + '\nthis.fl = functionalLabel; this.owner = omranOwnerUi;', ctx);
  return ctx;
}

test('المالك: الاسم الحقيقيّ القصير للمزوّد الذي ردّ فعلًا، لا رأس مجموعته', () => {
  const c = build('omran');
  assert.equal(c.owner(), true);
  assert.equal(c.fl('claude'), 'Claude');
  assert.equal(c.fl('gemini'), 'Gemini');
  assert.equal(c.fl('openai'), 'GPT');
  assert.equal(c.fl('groq'), 'Groq', 'المخفيّ يظهر باسمه للمالك');
  assert.equal(c.fl('deepseek'), 'DeepSeek');
  assert.equal(c.fl('perplexity'), 'Perplexity');
  assert.equal(build('OMRAN ').fl('mistral'), 'Mistral', 'حالة الأحرف والفراغات لا تهمّ');
});

test('غير المالك: الألقاب الوظيفيّة كما كانت (لا اسم مزوّد)', () => {
  const c = build('sara');
  assert.equal(c.owner(), false);
  assert.equal(c.fl('claude'), 'الكينج');
  assert.equal(c.fl('gemini'), 'السريع');
  assert.equal(c.fl('groq'), 'السريع', 'المخفيّ يبقى باسم رأس مجموعته');
  assert.equal(c.fl('openai'), 'العميق');
  // deepseek ليس في FUNCTIONAL_GROUPS فيقع على الافتراضيّ (claude → الكينج) — سلوك قائم قبل التغيير، لم يُمسّ
  assert.ok(['الكينج', 'السريع', 'العميق'].includes(c.fl('deepseek')), 'لقب وظيفيّ لا اسم مزوّد');
  assert.equal(build('').fl('claude'), 'الكينج', 'ضيف بلا اسم');
});

test('الحزمة تحمل التغيير', () => {
  const b = read('js/app.bundle.js');
  assert.ok(b.includes("if(omranOwnerUi() && PROVIDER_REAL_SHORT[key]) return PROVIDER_REAL_SHORT[key];"));
});
