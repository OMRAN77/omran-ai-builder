// tests/image-text-gpt.test.cjs — v-text-gpt-oneshot (٢٠ سبتمبر ٢٠٢٦): «نتيجة قويّة بضربة وحدة — حتّى الكتابة صفر»:
// أيّ طلب يمسّ نصًّا في صورة (حذف/تبديل/كتابة) أو مصدر نصوصه كثيفة → GPT نداءً واحدًا، بلا نانو وبلا حكم.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. نيّة النصّ: حذف أو تبديل أو كتابة أو كلمات النصّ على مصدر = GPT ضربة واحدة؛ الخام للمالك والإبداعيّ خارجها', () => {
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /const __textIntent = !!editImageBase64 && !__pureRaw && \(isTextRemove \|\| isTextSwap \|\| __textCueRe\.test\(cleanPrompt\) \|\| \/اكتب\|أكتب\|كتابة\|كتابه\|\\bwrite\\b\/i\.test\(cleanPrompt\)\);/);
  assert.match(mi, /&& \(__textIntent \|\| \(editImageBase64 \? __optTextFaithful : \(__optTextFaithful \|\| \(!rawMode && __textCueRe\.test\(cleanPrompt\)\)\)\)\);/, 'v-lanes: بلا مصنّف نصّ كثيف؛ التوليد بنصّ كما كان');
  assert.ok(!/sourceLooksTextDense/.test(mi));
  assert.match(mi, /!isReimagine && !isRestyle && !isSceneUpgrade && !isElevate && !isPersonSwap && !isBroadEdit && !extras\.length\n\s+&& \(__textIntent/, 'الإبداعيّ ودمج الصور خارج المسار');
  // ضربة واحدة: لا مزدوج ولا حكم على مسار النصّ
  const i = mi.indexOf('if (__textRoute) {');
  const seg = mi.slice(i, mi.indexOf('/* v-image-duo', i));
  assert.ok(seg.includes("const denseB64 = await openaiRescueImage();") && seg.includes("await sendImg(denseB64, 'image/png', 'openai');"), 'GPT ثمّ الإرسال مباشرة');
  assert.ok(!seg.includes('densePromise = openaiRescueImage'), 'لا نداء متوازٍ للحكم');
  assert.ok(mi.indexOf('const __textIntent') > mi.indexOf('const __pureRaw = rawMode'), '__pureRaw معرّف قبل الاستعمال');
  // الحذف والتبديل كما هما معرّفان
  assert.match(mi, /const isTextRemove = !!editImageBase64 && [^\n]*isPureTextRemoval\(intentText\);/);
  // GPT في التعديل بأمانة عالية إلّا في «GPT خام» للمالك
  assert.match(mi, /form\.append\('input_fidelity', 'high'\);/, 'v-lanes: أمانة عالية دائمًا في التعديل، حتّى GPT خام');
});

test('٢. فشل GPT (بلا مفتاح أو خطأ) → المسار القائم كما هو، والمزدوج لا يعمل على مسار نصّ فشل', () => {
  const mi = read('api/_lib/maha-image.js');
  assert.ok(!/densePromise|duoOn|duoP\b/.test(mi), 'v-lanes: لا مزدوج إطلاقًا — نصّ فشل عند GPT → مسار Gemini وحده');
  assert.match(mi, /if \(!okey\) \{ lastRescueErr = 'no OPENAI_API_KEY'; return null; \}/);
});

test('٣. v-remove-target: «احذف اسم عمران AI» يحذف هذا النصّ وحده أينما ظهر؛ «شيل الأسماء» تبقى إزالة شاملة', () => {
  const ip = require('../api/_lib/image-prompt.js');
  assert.equal(ip.removeTextTarget('احذف اسم عمران ai'), 'عمران ai');
  assert.equal(ip.removeTextTarget('شيل الاسم «محمد» من الصورة'), 'محمد');
  assert.equal(ip.removeTextTarget('امسح كلمة welcome'), 'welcome');
  assert.equal(ip.removeTextTarget('remove the name Omran AI from the image'), 'Omran AI');
  assert.equal(ip.removeTextTarget('احذف النص'), '', 'بلا نصّ مسمّى');
  assert.equal(ip.removeTextTarget('احذف النص من الصورة'), '', '«من الصورة» ليست هدفًا');
  assert.equal(ip.removeTextTarget('شيل الأسماء'), '');
  assert.equal(ip.removeTextTarget('بدون كتابة'), '');
  assert.equal(ip.removeTextTarget('غيّر لون القميص'), '');
  const p = ip.buildEditPrompt('احذف اسم عمران ai', 'احذف اسم عمران ai');
  assert.match(p, /8\. REMOVE ONLY THE TEXT "عمران ai": erase that exact text everywhere it appears/);
  assert.match(p, /Every OTHER word, label, letter, number, line, box, icon and layout element must stay identical/);
  assert.doesNotMatch(p, /completely erase ALL names/);
  const all = ip.buildEditPrompt('شيل الأسماء من الصورة', 'شيل الأسماء من الصورة');
  assert.match(all, /8\. REMOVE TEXT: completely erase ALL names/);
  const none = ip.buildEditPrompt('غيّر لون القميص إلى أزرق', 'غيّر لون القميص إلى أزرق');
  assert.doesNotMatch(none, /REMOVE/);
  // كلمات المستخدم الحرفيّة هي مصدر الاستخراج حتّى لو أُعيدت صياغة الطلب بالإنجليزيّة
  const re = ip.buildEditPrompt('Remove the brand name from the card', 'احذف اسم عمران ai');
  assert.match(re, /REMOVE ONLY THE TEXT "عمران ai"/);
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'api/_lib/maha-image.js'), 'utf8'), /buildEditPrompt\(cleanPrompt, intentText\)/);
});
