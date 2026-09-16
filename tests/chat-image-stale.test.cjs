// tests/chat-image-stale.test.cjs — v-image-stale: صورة أُرفقت في دور سابق كانت
// تتسرّب لسؤال لاحق لا علاقة له بها (بلاغ المالك: «شو موضوع المدينة المنورة» فردّ
// النموذج بوصف لقطة خطأ قديمة). الإصلاح: كتل الصور تبقى على آخر رسالة مستخدم فقط.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'synthetic-test-secret-' + 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert/strict');
const { __vstale } = require('../api/_lib/chat.js');
const strip = __vstale.stripStaleImagesFromHistory;

const img = () => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } });
const txt = (t) => ({ type: 'text', text: t });

test('١. صورة دور سابق تُستبدل بملحوظة، وسؤال نصّيّ جديد يبقى كما هو', () => {
  const out = strip([
    { role: 'user', content: [txt('شوف هالخطأ'), img()] },
    { role: 'assistant', content: 'الخطأ هو AbortSignal.any' },
    { role: 'user', content: 'شو موضوع المدينة المنورة' },
  ]);
  // الرسالة الأولى: لا صورة بعد الآن، وفيها ملحوظة نصّيّة
  assert.ok(!out[0].content.some((b) => b.type === 'image'), 'الصورة القديمة أُزيلت');
  assert.ok(out[0].content.some((b) => b.type === 'text' && /رسالة سابقة/.test(b.text)), 'ملحوظة بدل الصورة');
  assert.ok(out[0].content.some((b) => b.type === 'text' && b.text === 'شوف هالخطأ'), 'نصّ الرسالة الأصليّ محفوظ');
  // السؤال الجديد نصّيّ كما هو
  assert.equal(out[2].content, 'شو موضوع المدينة المنورة');
});

test('٢. صورة الدور الحاليّ (آخر رسالة مستخدم) تبقى — لا تُمَسّ', () => {
  const out = strip([
    { role: 'user', content: [txt('صورة قديمة'), img()] },
    { role: 'assistant', content: 'تمام' },
    { role: 'user', content: [txt('حلّل هذي'), img()] },
  ]);
  assert.ok(!out[0].content.some((b) => b.type === 'image'), 'القديمة أُزيلت');
  assert.ok(out[2].content.some((b) => b.type === 'image'), 'صورة الدور الحاليّ محفوظة');
});

test('٣. الرسائل النصّيّة الصِّرفة لا تتغيّر، والدالّة لا ترمي على مدخل غريب', () => {
  const msgs = [{ role: 'user', content: 'مرحبا' }, { role: 'assistant', content: 'أهلًا' }, { role: 'user', content: 'كيفك' }];
  assert.deepEqual(strip(msgs), msgs);
  assert.equal(strip(null), null);
  assert.deepEqual(strip([]), []);
});

test('٤. رسالة صورة فقط بلا نصّ (دور سابق) تصير ملحوظة نصّيّة واحدة', () => {
  const out = strip([
    { role: 'user', content: [img()] },
    { role: 'user', content: 'سؤال جديد' },
  ]);
  assert.ok(Array.isArray(out[0].content) && out[0].content.length === 1, 'كتلة واحدة');
  assert.equal(out[0].content[0].type, 'text');
});

console.log('✓ chat-image-stale: الصور القديمة لا تتسرّب لأسئلة لاحقة، وصورة الدور الحاليّ محفوظة');
