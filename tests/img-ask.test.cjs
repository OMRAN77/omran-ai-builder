'use strict';
/* v-img-ask (المالك ١ أكتوبر): سؤال «في الصوره نفسها قصدك» على ردّ يشرح بدأ «جارٍ إنشاء الصورة».
   الاستيضاح بلا فعل طلب = دور كلام بلا أدوات الصورة والفيديو؛ والوثيقة الرسميّة لا تُعدَّل. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'img-ask-secret';
const root = path.join(__dirname, '..');
const { isClarifyTurn, TOOLS, TOOLS_NO_MEDIA } = require(path.join(root, 'api/_lib/chat.js')).__imgAsk;

test('١. الاستيضاح بلا طلب = كلام', () => {
  for (const t of ['في الصوره نفسها قصدك', 'قصدك في التطبيق؟', 'تقصد أرجع لأدوبي سكان؟', 'do you mean the photo itself?', 'قصدج الملف الأصلي']) {
    assert.equal(isClarifyTurn(t), true, t);
  }
});

test('٢. طلب صريح يبقي الأدوات — ومع «قصدك» أيضًا', () => {
  for (const t of ['في الصوره نفسها قصدك؟ سوها ملونة', 'قصدك؟ طيب عدّل الختم', 'خل الصورة 3D', 'ارسم لي قطة', 'you mean? ok make it colorful', 'شو رايك بالصورة', '']) {
    assert.equal(isClarifyTurn(t), false, t);
  }
  assert.equal(isClarifyTurn('مقصدكم'), false, 'كلمة أخرى لا تُلتقط');
});

test('٣. قائمة الأدوات في دور الكلام بلا صورة ولا فيديو، والباقي كما هو', () => {
  const names = (l) => l.map((t) => t.name);
  assert.ok(names(TOOLS).includes('edit_image') && names(TOOLS).includes('generate_image'));
  assert.deepEqual(names(TOOLS_NO_MEDIA), names(TOOLS).filter((n) => !['generate_image', 'edit_image', 'generate_video'].includes(n)));
  assert.ok(TOOLS_NO_MEDIA.length >= 3);
  const src = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
  assert.ok(src.includes('tools: toolTurn ? toolsFor(__ownerReq, isClarifyTurn(lastUserText) || __analyzeDoc) : undefined')); // v-providers-like-agent: الاستيضاح بلا أدوات الصورة (وأدوات المالك له) // دمج v-provider-errors: غير الاستيضاح = أدوات المستخدم (وأداة المالك له وحده)
});

test('٤. وصف edit_image: الاستيضاح ليس طلبًا، والوثيقة الرسميّة لا تُعدَّل', () => {
  const d = TOOLS.find((t) => t.name === 'edit_image').description;
  assert.ok(d.includes('السؤال أو الاستيضاح عن ردّك'));
  assert.ok(d.includes('ممنوع تعديل وثيقة رسميّة'));
  assert.ok(d.includes('لا تغيّر ختمها ولا توقيعها ولا ألوانها ولا أرقامها ولا نصّها'));
});

test('٥. v-img-question: سؤال عامّ بعد صورة = كلام («بخصوص الشخير ماهي الاسباب» كُتب على لقطة الشاشة)', () => {
  for (const t of ['بخصوص الشخير ماهي الاسباب', 'كم عدد سكان الإمارات', 'ليش يصير الشخير', 'what causes snoring?', 'هل الشخير خطير؟']) {
    assert.equal(isClarifyTurn(t), true, t);
  }
  for (const t of ['هل تقدر ترسم قطة؟', 'كيف تصير الصورة 3D', 'شو رايك بالصورة', 'كم سعر الصورة؟ عدلها', 'ممكن تسوي فيديو؟', 'حلو', 'خل الخلفية زرقاء']) {
    assert.equal(isClarifyTurn(t), false, t);
  }
});
