// tests/chats-keep-conversations.test.cjs — v-keep-conversations (٢١ سبتمبر ٢٠٢٦):
// بلاغ المالك «نفس الحساب، بالكمبيوتر والهاتف، أوقات المحادثة موجودة وأوقات غير
// موجودة». السبب: chats_save يعيد ضغط قائمة المشاريع المدموجة (سيرفر + عميل) إلى
// MAX_BYTES=900KB بحذف أقدم مشروع كاملًا (list.shift()) كلما تجاوز الحجم — فمحادثة
// قديمة بصور تختفي نهائيًا من نسخة السيرفر، وأيّ جهاز لم يفتحها محليًّا من قبل
// (كالهاتف) لا يراها أبدًا رغم بقائها في IndexedDB على الجهاز الأصليّ (الكمبيوتر).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const { slimProjects, stripAttachmentImages, MAX_BYTES } = require('../api/_lib/chats.js').__vkeep;

const bigImg = () => 'data:image/jpeg;base64,' + 'A'.repeat(40000);

function projectWithImages(id, n) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: 'user', content: '', attachments: [{ name: 'p.jpg', isImage: true, dataUrl: bigImg() }] });
    messages.push({ role: 'assistant', content: 'تمام' });
  }
  return { id, title: 'محادثة ' + id, provider: 'x', messages, code: '' };
}

test('محادثة قديمة تتعرّض لضغط حجم كبير: قبل الإصلاح تُحذف كاملة؛ بعده تبقى بلا صور فقط', () => {
  // مشروع قديم (طابع زمني أصغر) بصور كثيرة، ومشاريع أحدث تملأ الباقي حتى تتجاوز MAX_BYTES.
  const old = projectWithImages('p_1000000000000', 15);
  const projects = [old];
  let t = 1000000001000;
  while (Buffer.byteLength(JSON.stringify(projects), 'utf8') <= MAX_BYTES) {
    projects.push(projectWithImages('p_' + (t++), 15));
  }
  const totalBefore = Buffer.byteLength(JSON.stringify(projects), 'utf8');
  assert.ok(totalBefore > MAX_BYTES, 'إعداد الاختبار: القائمة فعلًا أكبر من الحدّ');

  const result = slimProjects(projects);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') <= MAX_BYTES, 'الناتج ضمن الحدّ');
  const survivor = result.find((p) => p.id === 'p_1000000000000');
  assert.ok(survivor, 'المحادثة الأقدم لم تُحذف كاملة — بقيت موجودة (العنوان والرسائل)');
  assert.equal(survivor.title, 'محادثة p_1000000000000', 'العنوان محفوظ');
  assert.equal(survivor.messages.length, 30, 'كل الرسائل النصّية باقية، لا حذف لعدد الرسائل');
  const stillHasRealImage = survivor.messages.some((m) =>
    Array.isArray(m.attachments) && m.attachments.some((a) => a.dataUrl && a.dataUrl !== '[media]'));
  assert.ok(!stillHasRealImage, 'صور هذا المشروع الأقدم نُزعت (تحوّلت لـ[media]) بدل حذف المحادثة');
});

test('stripAttachmentImages: يستبدل صور المرفقات وapiImages بـ[media]، ولا يمسّ الرسائل النصّية أو المرفقات غير الصورية', () => {
  const messages = [
    { role: 'user', content: 'مرحبا' },
    { role: 'user', attachments: [{ name: 'a.png', isImage: true, dataUrl: bigImg() }, { name: 'f.txt', isImage: false, text: 'نص' }] },
    { role: 'assistant', apiImages: [{ dataUrl: bigImg() }] },
  ];
  const out = stripAttachmentImages(messages);
  assert.equal(out[0].content, 'مرحبا', 'الرسالة النصّية الصرفة لم تتغيّر');
  assert.equal(out[1].attachments[0].dataUrl, '[media]', 'صورة المرفق نُزعت');
  assert.equal(out[1].attachments[1].text, 'نص', 'المرفق غير الصوريّ سليم');
  assert.equal(out[2].apiImages[0].dataUrl, '[media]', 'apiImages نُزعت أيضًا');
  // مدخل بلا صور فعلًا لا يُستنسخ (نفس المرجع) — لا تكلفة إضافية.
  const plain = [{ role: 'user', content: 'سؤال' }];
  assert.equal(stripAttachmentImages(plain), plain);
});

test('لو نزع كل الصور من كل المشاريع لم يكفِ، يبقى حذف المشروع كاملًا آخر ملاذ (كما كان)', () => {
  // نصوص وحدها ضخمة جدًا (لا صور) تتجاوز MAX_BYTES — لا شيء لنزعه، فيضطر للحذف.
  const huge = 'ن'.repeat(MAX_BYTES + 5000);
  const projects = [
    { id: 'p_1', title: 'قديم', provider: '', messages: [{ role: 'user', content: huge }], code: '' },
    { id: 'p_2', title: 'جديد', provider: '', messages: [{ role: 'user', content: 'سؤال قصير' }], code: '' },
  ];
  const result = slimProjects(projects);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') <= MAX_BYTES);
  assert.ok(!result.some((p) => p.id === 'p_1'), 'المشروع الضخم بلا صور للنزع يُحذف كملاذ أخير كما في السلوك القديم');
  assert.ok(result.some((p) => p.id === 'p_2'), 'الأحدث يبقى');
});

console.log('✓ chats-keep-conversations: محادثة أقدم تفقد صورها لا وجودها عند ضغط حجم السيرفر');
