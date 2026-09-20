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
  assert.match(mi, /&& \(__textIntent \|\| \(editImageBase64 \? \(__optTextFaithful \|\| await sourceLooksTextDense\(\)\) : \(__optTextFaithful \|\| \(!rawMode && __textCueRe\.test\(cleanPrompt\)\)\)\)\);/, 'المصدر الكثيف والتوليد بنصّ كما كانا');
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
  assert.match(mi, /form\.append\('input_fidelity', __optForceEngine === 'gpt' \? 'low' : 'high'\);/);
});

test('٢. فشل GPT (بلا مفتاح أو خطأ) → المسار القائم كما هو، والمزدوج لا يعمل على مسار نصّ فشل', () => {
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /let densePromise = null; \/\* لم يعد يُملأ/);
  assert.match(mi, /const duoOn = __duoWouldRun && \(!__textRoute \|\| !!densePromise\);/, 'نصّ فشل عند GPT → Gemini وحده بلا مزدوج (كما كان)');
  assert.match(mi, /if \(!okey\) \{ lastRescueErr = 'no OPENAI_API_KEY'; return null; \}/);
});
