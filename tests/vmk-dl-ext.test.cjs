// tests/vmk-dl-ext.test.cjs — v-vmk-dl-ext (تدقيق ١٨ أكتوبر: «الفيديو ينزل باسم mp4 وهو فعليًا webm، وبعض الأجهزة ما تشغّله»،
// وأمر المالك ٢٠ أكتوبر، الدفعة ١: «الامتداد لازم يطابق النوع»). القوالب (المسجِّل) والدمج والصوت السريع WebM؛ الاسم كان
// download="omran-ai-video.mp4" ثابتًا. الآن الامتداد من نوع الـBlob نفسه حيث هو في اليد، والافتراضيّ يُعاد قبل كلّ توليد.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const A11 = fs.readFileSync(path.join(root, 'js/app-11-video.js'), 'utf8');

test('١. dlName: الامتداد من نوع الملفّ — WebM ← ‎.webm، وMP4 أو مجهول ← ‎.mp4', () => {
  const m = /function dlName\(base, type\)\{[^\n]*\}/.exec(A11);
  assert.ok(m, 'dlName موجودة');
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  assert.equal(ctx.dlName('omran-ai-video', 'video/webm'), 'omran-ai-video.webm');
  assert.equal(ctx.dlName('omran-ai-video', 'video/webm;codecs=vp9,opus'), 'omran-ai-video.webm');
  assert.equal(ctx.dlName('omran-film', 'video/mp4'), 'omran-film.mp4');
  assert.equal(ctx.dlName('omran-ai-video', ''), 'omran-ai-video.mp4');
  assert.equal(ctx.dlName('omran-ai-video', undefined), 'omran-ai-video.mp4');
});

test('٢. كلّ رابط تنزيل من Blob يأخذ اسمه من نوعه، ورابط المزوّد بالاسم الافتراضيّ الذي يُعاد قبل كلّ توليد', () => {
  // القوالب والدمج (مساران بالـBlob نفسه finalBlob)
  assert.equal((A11.match(/downloadEl\.href = finalUrl;\n\s*downloadEl\.download = dlName\('omran-ai-video', finalBlob\.type\);/g) || []).length, 3);
  assert.match(A11, /downloadEl\.download = dlName\('omran-film', finalType\);/);
  assert.match(A11, /finalUrl = URL\.createObjectURL\(finalBlob\); finalType = finalBlob\.type;/);
  assert.match(A11, /finalUrl = URL\.createObjectURL\(blob\); finalType = blob\.type;/);
  assert.match(A11, /downloadEl\.download = finalIsBlob \? dlName\('omran-ai-video', finalSrc && finalSrc\.type\) : 'omran-ai-video\.mp4';/);
  assert.match(A11, /downloadEl\.style\.display = 'none';\n\s*downloadEl\.download = 'omran-ai-video\.mp4'; \/\/ v-vmk-dl-ext/);
  assert.doesNotMatch(A11, /downloadEl\.download = 'omran-film\.mp4'/, 'لا اسم ثابت للفيلم المدموج');
});
