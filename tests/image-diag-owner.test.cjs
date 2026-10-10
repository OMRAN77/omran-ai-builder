// tests/image-diag-owner.test.cjs — v-img-diag-owner (٢٠ سبتمبر ٢٠٢٦):
// شكوى المالك «عندي مزوّدين نانو وGPT والنتيجة 0» بلا أيّ سبب. الفحص: __diag
// (سبب فشل كلّ مزوّد) كان يصل ردّ الخادم دائمًا، لكن العميل لا يعرضه إلا في
// «الوضع الخام» (نانو:/GPT: الصريح). التوليد والتعديل العاديّان — المساران
// اللذان يستعملهما المالك فعليًّا — كانا يعرضان رمز الخطأ العامّ فقط فيبقى
// يرى «تعذّر توليد الصورة» بلا معرفة أيّ مزوّد فشل ولماذا. كذلك فشل «بلا صورة
// راجعة» (رفض أمنيّ/finishReason بعد نجاح الاتصال) لم يكن يحمل __diag إطلاقًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mi = read('api/_lib/maha-image.js');
const attach = read('js/app-09-attach.js');

test('الخادم: فشل «بلا صورة راجعة» يحمل __diag أيضًا لا الرسالة العامّة وحدها', () => {
  const i = mi.indexOf("console.error('[maha-image] no image part in response:");
  assert.ok(i > 0, 'الموضع موجود');
  const block = mi.slice(i, mi.indexOf("return;", i) + 10);
  assert.ok(block.includes('const __diagNoImg = process.env.IMG_DIAG'), 'يبني __diag بنفس مفتاح إيقاف IMG_DIAG=off');
  assert.ok(block.includes("gErr:") && block.includes('finishReason') && block.includes('blockReason'), 'السبب الحقيقيّ (رفض أمنيّ/finishReason) لا نصّ عام');
  assert.ok(block.includes("res.status(500).json({ error: 'لم يرجع الموديل صورة، حاول توصيف مختلف.', __diag: __diagNoImg });"), 'الرسالة العامّة تبقى + __diag معها');
});

test('العميل: التوليد العاديّ يعرض __diag للمالك وحده — لا لبقيّة المستخدمين', () => {
  const i = attach.indexOf('async function omModeGenerateImage');
  const fn = attach.slice(i, attach.indexOf('async function omModeRawImage', i));
  assert.ok(fn.includes("String(authGet('aiapp_username') || '').trim().toLowerCase() === 'omran'"), 'شرط المالك موجود');
  assert.ok(fn.includes('__d.__diag'), 'يقرأ __diag من ردّ الخادم');
  assert.ok(fn.includes('__d.__diag.gErr || __d.__diag.openai || __d.__diag.nano || __d.__diag.free'), 'يجرّب كلّ أسباب الفشل بالترتيب');
});

test('العميل: مسار تعديل الصورة (الأكثر استعمالًا) يعرض __diag للمالك أيضًا — كان بلا أيّ سبب', () => {
  const i = attach.indexOf("__data.__status || '?'");
  assert.ok(i > 0, 'موضع رسالة فشل التعديل موجود');
  const around = attach.slice(i - 700, i + 400);
  assert.ok(around.includes("String(authGet('aiapp_username') || '').trim().toLowerCase() === 'omran'"), 'شرط المالك في مسار التعديل أيضًا');
  assert.ok(around.includes('__data.__diag'), 'يقرأ __diag من ردّ التعديل');
});

test('العميل: زرّ «نسخة ثانية» لتعديل الصورة يعرض __diag أيضًا', () => {
  const i = attach.indexOf('window.omranAnotherVersion = async function()');
  const fn = attach.slice(i, attach.indexOf('\n};', i));
  assert.ok(fn.includes("String(authGet('aiapp_username') || '').trim().toLowerCase() === 'omran'"), 'شرط المالك في «نسخة ثانية»');
  assert.ok(fn.includes('__data.__diag'), 'يقرأ __diag من ردّ «نسخة ثانية»');
});

test('لا اسم مزوّد يظهر لغير المالك: شرط __ownerReq يسبق كلّ قراءة لـ__diag', () => {
  const count = (attach.match(/'omran' && __d(?:ata)? && __d(?:ata)?\.__diag/g) || []).length;
  assert.equal(count, 3, 'ثلاثة مواضع محروسة بشرط المالك (توليد، تعديل، نسخة ثانية) — كانت 0');
});
