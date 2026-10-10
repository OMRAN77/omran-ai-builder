// tests/chat-analysis-rigor.test.cjs — v-analysis-rigor (٢١ سبتمبر ٢٠٢٦): طلب المالك «أريد
// [كلود] يوصل مستواك — شوف الناقص، وإذا قرى الملف يعطيني بالتحليل بالضبط المشكلة». لقطة
// حيّة: تحليل جاهز اقترح رفع MIN_TALK_MS في app-08-maha.js متجاهلًا تعليقًا مجاورًا يوثّق
// أنّ القيمة الأعلى المقترَحة كانت تُفقد كلمات قصيرة («نعم»/«هلا») سابقًا — تعديل كان سيرجّع
// عطلًا محلولًا. هذا الاختبار يقفل إضافة تعليمة صريحة في TOOLS_NOTE تُلزم القراءة الكاملة
// وفحص التعليقات الملاصقة قبل اقتراح أيّ تعديل على كود مقروء عبر read_github.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const s = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');

test('التعليمة موجودة داخل TOOLS_NOTE مباشرة بعد بند read_github', () => {
  const tools = s.slice(s.indexOf('\nconst TOOLS = ['), s.indexOf('\nconst TOOLS_NOTE'));
  const i = tools.indexOf("name: 'read_github'");
  assert.ok(i > 0, 'الأداة معرَّفة');
  // ملاحظة التحليل الدقيق نفسها تعيش في TOOLS_NOTE (نصّ الشرح) لا في TOOLS (تعريف الأداة)
  const noteIdx = s.indexOf('تحليل الأعطال بدقّة — إلزاميّ عند اقتراح أيّ تعديل');
  assert.ok(noteIdx > 0, 'التعليمة موجودة');
  const readGithubBullet = s.indexOf("'• read_github —");
  assert.ok(readGithubBullet > 0 && noteIdx > readGithubBullet && noteIdx - readGithubBullet < 900, 'التعليمة تلي بند read_github مباشرة');
});

test('التعليمة تُلزم: ذكر السطر/القيمة بالضبط، فحص التعليقات الملاصقة، وعدم تجاهل قرار موثَّق سابق', () => {
  const i = s.indexOf('تحليل الأعطال بدقّة');
  const block = s.slice(i, i + 1000);
  assert.match(block, /اذكر السطر أو القيمة بالضبط/, 'دقّة التشخيص');
  assert.match(block, /افحص التعليقات الملاصقة له في الملفّ نفسه/, 'فحص السياق التاريخيّ قبل الاقتراح');
  assert.match(block, /تعديل يرجع قيمة قديمة أو يناقض تعليقًا موثَّقًا بلا ذكره والتعامل معه اقتراحٌ غير مقبول/, 'رفض صريح لتجاهل قرار موثَّق');
  assert.match(block, /اقرأه كاملًا/, 'قراءة كاملة لا مقطع واحد');
});

test('لا تغيير على بقيّة بند read_github (الشجرة/الملفّ المقطَّع/الرابط الافتراضيّ)', () => {
  assert.ok(s.includes("'• read_github — أي رابط github.com أو ذكر مستودع أو ملفّ على GitHub"), 'بداية البند كما كانت');
  assert.ok(s.includes('فأعد الاستدعاء مع from حتّى تقرأه كلّه قبل أن تحكم عليه'), 'التقطيع كما كان');
  assert.ok(s.includes('تقرأ مستودع التطبيق لمالكه، وتطلب الرابط لغيره'), 'المستودع الافتراضيّ كما كان');
});

console.log('✓ chat-analysis-rigor: تحليل الكود عبر read_github يفحص التعليقات قبل اقتراح تعديل، لا يتجاهل قرارًا موثَّقًا');
