'use strict';
/* v-owner-raw — «خام لك وحدك»: المالك يجرّب المزوّد بلا طبقة التطبيق، والمستخدم
   يبقى balanced محميًّا بقواعده.
   العرض: المالك قال «قلتلي كلهم خام والحين تقول ثاني» — أعطيناه جوابين. الحقيقة:
   الاتصال أصليّ لكن balanced يضيف تعليمات فوق السؤال، فالجواب مو خام. القرار (ب):
   المالك يأخذ factory (خام) افتراضيًّا؛ غيره يبقى على الافتراضيّ العامّ.
   الاختبار يثبّت المنطق (resolveMode) والأثر الفعليّ (injectNote لا يضيف شيئًا
   للمالك، ويضيف نظام كامل لغيره). */
const assert = require('node:assert');
const ai = require('../api/ai.js');

const resolveMode = ai.__resolveMode;
const injectNote = ai.__injectNote;
assert.equal(typeof resolveMode, 'function', 'resolveMode مُصدَّرة للاختبار');
assert.equal(typeof injectNote, 'function', 'injectNote مُصدَّرة للاختبار');

// (١) منطق الوضع
assert.equal(resolveMode({}), 'balanced', 'المستخدم العاديّ: balanced افتراضيًّا');
assert.equal(resolveMode({ __ownerFactory: true }), 'factory', 'المالك: factory (خام) افتراضيًّا');
// طلبٌ صريح يتقدّم حتّى للمالك (يقدر يرجع balanced/guided لو حبّ)
assert.equal(resolveMode({ __ownerFactory: true, mode: 'guided' }), 'guided', 'طلب صريح يتقدّم على خام المالك');
assert.equal(resolveMode({ mode: 'factory' }), 'factory', 'أيّ أحد يطلب factory صراحةً يأخذه');

// (٢) الأثر الفعليّ على مزوّد نصّيّ (mistral): balanced يحقن رسالة نظام، factory لا.
function freshBody(extra) {
  return Object.assign({ messages: [{ role: 'user', content: 'مرحبا' }] }, extra || {});
}
// المستخدم العاديّ → balanced → تُحقن رسالة نظام فيها تعليمات التطبيق
const userBody = freshBody();
injectNote('mistral', userBody, 'AE');
const userSys = userBody.messages.find((m) => m && m.role === 'system');
assert.ok(userSys && userSys.content && userSys.content.length > 40, 'المستخدم: طبقة التطبيق تُحقن (رسالة نظام غير فارغة)');

// المالك → factory → لا رسالة نظام إطلاقًا، الرسائل كما هي (خام)
const ownerBody = freshBody({ __ownerFactory: true });
injectNote('mistral', ownerBody, 'AE');
const ownerSys = ownerBody.messages.find((m) => m && m.role === 'system');
assert.ok(!ownerSys, 'المالك: لا رسالة نظام — الطلب خام كما أرسله');
assert.equal(ownerBody.messages.length, 1, 'المالك: عدد الرسائل لم يتغيّر (بلا حقن)');
assert.equal(ownerBody.messages[0].content, 'مرحبا', 'المالك: نصّ السؤال كما هو');

// (٣) claude: نفس المبدأ على حقل body.system
const cUser = { messages: [{ role: 'user', content: 'مرحبا' }] };
injectNote('claude', cUser, 'AE');
assert.ok(typeof cUser.system === 'string' && cUser.system.length > 40, 'claude/مستخدم: body.system مملوء');
const cOwner = { messages: [{ role: 'user', content: 'مرحبا' }], __ownerFactory: true };
injectNote('claude', cOwner, 'AE');
assert.ok(!cOwner.system, 'claude/مالك: body.system فارغ — خام');

console.log('✓ owner-raw: المالك يأخذ factory (خام) والمستخدم يبقى balanced محميًّا — منطقًا وأثرًا');
