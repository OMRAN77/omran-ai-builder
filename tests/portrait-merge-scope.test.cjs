// tests/portrait-merge-scope.test.cjs — v-merge-scope-fix (٢١ سبتمبر ٢٠٢٦): لقطة المالك — رفع صورة
// الشخص الثاني لِـ«دمج صورتين» (merge2) ثم الضغط «حوّلها» رجع «❌ خطأ: extraImagesB64 is not defined».
// الجذر: كتلة رفع الصور الإضافية (extraImagesB64 + #portraitMultiFileInput) كانت ملصقة بالخطأ داخل
// دالّة «AI Interior Design» المغلقة، فـextraImagesB64 محلّي هناك ولا يراه btnGenerate.onclick في
// دالّة «Portrait Styles» المغلقة المنفصلة — ReferenceError عند التوليد فعليًّا (حُقّق حيًّا بمتصفّح
// حقيقيّ قبل الإصلاح وبعده: راجع knowledge/DECISIONS.md). هذا الاختبار يقفل مكان الكتلة الصحيح.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function section(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  assert.ok(s > 0, startMarker + ' موجود');
  const e = src.indexOf(endMarker, s);
  assert.ok(e > s, endMarker + ' بعد ' + startMarker);
  return src.slice(s, e);
}

for (const file of ['js/app-12-studios.js', 'js/app.bundle.js']) {
  test(file + ': extraImagesB64 (صور الدمج الإضافية) في نطاق «Portrait Styles» لا «AI Interior Design»', () => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const designAi = section(src, '🏠 AI Interior Design', '🎨 Portrait Styles');
    const portraitStyles = section(src, '🎨 Portrait Styles', '👗 AI Fashion Design');

    assert.doesNotMatch(designAi, /extraImagesB64/, 'نطاق «AI Interior Design» يجب ألّا يحوي extraImagesB64 (سبب الخطأ الحيّ)');
    assert.match(portraitStyles, /let extraImagesB64 = \[\];/, 'extraImagesB64 معرَّف داخل نطاق «Portrait Styles» نفسه');
    assert.match(portraitStyles, /const multiFileInput = \$\('#portraitMultiFileInput'\);/, 'وصل multiFileInput داخل نفس النطاق');
    assert.match(portraitStyles, /const maxCount = \(styleEl\.value === 'merge2'\) \? 1 : 3;/, 'styleEl هنا هو portraitStyleSelect الصحيح');
  });
}
