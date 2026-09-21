// tests/image-merge-identity.test.cjs — v-merge-identity-lock-v3 (٢١ سبتمبر ٢٠٢٦): تحقّق حيّ فعليّ من المالك
// (لقطتان متتاليتان بترتيب رفع معكوس) أثبت أنّ صيغة v2 حلّت الكارثة (شخص بجنس مختلف) لكن المرأة تحديدًا كانت
// تكتسب حجابًا وتبرّجًا أثقل غير موجودين بالمصدر، بغضّ النظر عن ترتيب الرفع — لأنّ أمر الدمج نفسه كان يصرّح
// صراحة بتغيير «clothing detail» طالما الوجه ثابت. هذا الاختبار يثبت أنّ الصياغة الجديدة تقفل المظهر كامله
// (شعر/حجاب/تبرّج/إكسسوارات/ملابس) لا الوجه فقط، وأنّ الرخصة القديمة لتغيير الملابس حُذفت.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mi = fs.readFileSync(path.join(root, 'api/_lib/maha-image.js'), 'utf8');

test('١. أمر الدمج يقفل المظهر كامله (شعر/حجاب/تبرّج/إكسسوارات/ملابس) لا الوجه فقط', () => {
  assert.match(mi, /hair \(loose or covered by a hijab\/headscarf exactly as photographed; never add, remove, or restyle a head covering\), makeup, jewelry, and clothing/);
  assert.match(mi, /never restyled to a different look/);
});

test('٢. الرخصة القديمة بتغيير «clothing detail» حُذفت من قائمة المسموح تغييره', () => {
  assert.ok(!/changes their pose, camera angle, clothing detail/.test(mi), 'clothing detail ما زالت ضمن المسموح تغييره');
  assert.match(mi, /changes their pose, camera angle, or places them together in a brand-new shared scene/);
});

test('٣. أمر الدمج ما زال يشير لكل صورة بترتيبها الحرفيّ ويطلب صورة واحدة نهائيّة', () => {
  assert.match(mi, /separate reference images, attached in this exact order/);
  assert.match(mi, /Output a single finished image only\./);
});
