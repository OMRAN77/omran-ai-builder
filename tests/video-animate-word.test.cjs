'use strict';
/* v-animate-word: «انته اي محرك» بعد تعديل صورة كان يطلق فيديو مدفوعًا من آخر صورة،
   لأنّ تعبير «حرّك» كان يطابق «حرك» داخل «محرك». لا `\b` للعربيّة في JS، فالكلمة
   تُشترط قائمة (بداية النصّ أو حرف غير عربيّ قبلها، مع و/ف اختياريّة). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

const attach = fs.readFileSync('js/app-09-attach.js', 'utf8');
const m = attach.match(/const __animateRe = (\/.*?\/i);\n/);
assert.ok(m, '__animateRe موجود في app-09');
const animateRe = eval(m[1]); // eslint-disable-line no-eval — التعبير نفسه من المصدر

test('«حرك» داخل كلمة أخرى لا يُعدّ طلب تحريك', () => {
  for (const t of ['انته اي محرك', 'شو المحرك', 'الحركة', 'متحرك', 'يتحرك', 'المحرك الي تستخدمه', 'reanimate']) {
    assert.equal(animateRe.test(t), false, t);
  }
});

test('«حرّك» كلمةً قائمة (ولو بواو/فاء) يُعدّ طلب تحريك', () => {
  for (const t of ['حركها', 'حرّك الصورة', 'وحركها', 'فحركها', 'خلها تتكلم و حركها', 'animate it', 'Animate this']) {
    assert.equal(animateRe.test(t), true, t);
  }
});

test('مسار الفيديو من الصورة ما زال مشروطًا بالتعبير نفسه، والحزمة تحمله', () => {
  assert.match(attach, /\(!!__vidSrc && \(__srcImg \|\| cur\.lastMsgWasImageEdit\) && __animateRe\.test\(text\)\)/);
  assert.match(attach, /const __videoHasConcreteSubject = !!\(__vidSrc && \(__srcImg \|\| cur\.lastMsgWasImageEdit\) && __animateRe\.test\(text \|\| ''\)\);/);
  const bundle = fs.readFileSync('js/app.bundle.js', 'utf8');
  assert.ok(bundle.includes(m[0]), 'الحزمة مبنيّة بالتعبير الجديد');
});
