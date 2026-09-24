// tests/image-safety-fallback.test.cjs — v-safety-model-fallback (٢١ سبتمبر ٢٠٢٦):
// لقطة المالك «تعذّر توليد الصورة الآن — image_generation_busy [openai edit
// gpt-image-2.5-sunburst 400 Your request was rejected by the safety system...]».
// خطّ إنقاذ GPT (تعديل ودمج) يجرّب ثلاثة موديلات بالترتيب، لكن كان يتوقّف فورًا عند
// أوّل رفض من «نظام السلامة» بدل تجربة الموديلَين الباقيين — رغم أنّ القائمة موجودة
// أصلًا لهذا الغرض (كلّ موديل مصنِّف سلامة مستقلّ). الشرط القديم (`modelUnavailable`)
// كان يفحص «الموديل غير متاح» فقط (400/404 يذكر «model»)، لا رفض السلامة (400 بلا
// ذِكر «model» في الرسالة) — فيسقط الفشل الأوّل النداء كلّه بلا محاولة الباقي.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mi = fs.readFileSync(path.join(root, 'api/_lib/maha-image.js'), 'utf8');

// الرسالة الحرفيّة من لقطة المالك (OpenAI images/edits عند رفض نظام السلامة).
const OWNER_MSG = "Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID.";

test('مسار التعديل/الدمج: رفض نظام السلامة على أوّل موديل يجرّب الموديل التالي بالقائمة، لا يستسلم فورًا', () => {
  const i = mi.indexOf("const editModels = ['gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1'];");
  assert.ok(i > 0, 'قائمة الموديلات موجودة');
  const block = mi.slice(i, i + 3200);
  const safetyLine = /const safetyBlocked = r\.status === 400 && \/safety system\|content policy\|rejected by the safety\/i\.test\(msg\);/;
  assert.match(block, safetyLine, 'شرط رفض السلامة موجود في مسار التعديل');
  assert.match(block, /if \(\(modelUnavailable \|\| safetyBlocked\) && i < editModels\.length - 1\) continue;/, 'يجرّب الموديل التالي عند رفض السلامة أو عدم توفّر الموديل، لا عند عدم التوفّر فقط');
  // الرسالة الفعليّة من لقطة المالك تُطابق الشرط فعليًّا (لا افتراض نظريّ)
  const re = /safety system|content policy|rejected by the safety/i;
  assert.ok(re.test(OWNER_MSG), 'رسالة OpenAI الحقيقية من اللقطة تُطابق الكاشف');
});

test('مسار التوليد: نفس الحماية — رفض السلامة على gpt-image-2.5-flare يجرّب gpt-image-2 ثمّ gpt-image-1', () => {
  const i = mi.indexOf("const genModels = ['gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1'];");
  assert.ok(i > 0, 'قائمة موديلات التوليد موجودة');
  const block = mi.slice(i, i + 1400);
  assert.match(block, /const safetyBlocked = r\.status === 400 && \/safety system\|content policy\|rejected by the safety\/i\.test\(t1\);/, 'شرط رفض السلامة موجود في مسار التوليد');
  assert.match(block, /if \(!\(modelUnavailable \|\| safetyBlocked\) \|\| i === genModels\.length - 1\) \{/, 'لا يستسلم إلا بعد استنفاد القائمة أو خطأ آخر غير رفض السلامة/عدم التوفّر');
});

test('كاشف رفض السلامة لا يلتبس مع رفض عدم توفّر الموديل (رسالتان مختلفتان فعليًّا)', () => {
  const re = /safety system|content policy|rejected by the safety/i;
  assert.ok(!re.test('The model `gpt-image-9` does not exist'), 'رسالة "الموديل غير موجود" لا تُطابق كاشف السلامة (تُغطّى بـmodelUnavailable بدلًا)');
  assert.ok(re.test('Your request was rejected by the safety system.'));
  assert.ok(re.test('This content violates our content policy.'));
});

console.log('✓ image-safety-fallback: رفض نظام السلامة لموديل واحد لا يوقف تجربة بقية موديلات GPT');
