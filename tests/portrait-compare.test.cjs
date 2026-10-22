// tests/portrait-compare.test.cjs — v-pcompare-sides + v-pcompare-box (تدقيق ١٨ أكتوبر، g08 portrait-generate؛ أمر المالك ٢٠ أكتوبر، الدفعة ٤؛ من حزمة a11 في ten-a):
// - تسمية «قبل/بعد» معكوسة: طبقة النتيجة مثبّتة يسارًا وتغطّي pct% من اليسار، و«قبل» كانت يسارًا فوق صورة الأنمي الناتجة.
// - صورة «بعد» مزاحة عن الأصل وشريط من القديمة: layoutCompareAfter كان يقيس عرض الإطار وهو مخفيّ (مشهد الانتظار) فيرجع ٠،
//   فتأخذ النتيجة عرضها الطبيعيّ يسارًا والأصل موسَّط داخل إطار أعرض منه.
// الآن: «قبل» يمينًا و«بعد» يسارًا مع طبقتها، والطبقة بملء الإطار تُقصّ بـclip-path، والصورتان contain في الصندوق نفسه،
// والإطار بعرض الصورة (fit-content) — لا قياس بالبكسل ولا مستمع resize.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PC = read('js/partials-core.js');
const A12 = read('js/app-12-studios.js');
const cut = (s, a, b) => {
  const i = s.indexOf(a); assert.ok(i >= 0, 'مقطع مفقود: ' + a);
  const j = s.indexOf(b, i + a.length); assert.ok(j > i, 'نهاية مفقودة: ' + b);
  return s.slice(i, j);
};
const W = cut(PC, '<div id="portraitCompareWrap"', '<a id="portraitStyleDownloadLink"');
const styleOf = (re) => { const m = W.match(re); assert.ok(m, String(re)); return (m[0].match(/style="([^"]*)"/) || [, ''])[1]; };

test('١. «بعد» على جهة طبقة النتيجة (يسار) و«قبل» على الجهة الأخرى', () => {
  const after = styleOf(/<span[^>]*data-i18n="portraitCompareAfterLabel"[^>]*>|<span style="[^"]*"[^>]*data-i18n="portraitCompareAfterLabel">/);
  const before = styleOf(/<span style="[^"]*"[^>]*data-i18n="portraitCompareBeforeLabel">/);
  const wrap = styleOf(/<div id="portraitCompareAfterWrap"[^>]*>/);
  assert.match(wrap, /inset:0|left:0/, 'الطبقة من اليسار');
  assert.match(after, /(^|[;\s])left:\s*8px/, '«بعد» يسارًا مع طبقتها');
  assert.doesNotMatch(after, /right:/);
  assert.match(before, /(^|[;\s])right:\s*8px/, '«قبل» يمينًا');
  assert.doesNotMatch(before, /(^|[;\s])left:/);
});

test('٢. الصورتان في صندوق واحد contain، والطبقة بملء الإطار، والإطار بعرض الصورة', () => {
  const res = styleOf(/<img id="portraitStyleResult"[^>]*>/);
  assert.match(res, /width:100%/); assert.match(res, /height:100%/); assert.match(res, /object-fit:contain/);
  const wrap = styleOf(/<div id="portraitCompareAfterWrap"[^>]*>/);
  assert.match(wrap, /inset:0/); assert.doesNotMatch(wrap, /width:50%/, 'لا عرض يُقاس');
  const frame = styleOf(/<div id="portraitCompareWrap"[^>]*>/);
  assert.match(frame, /width:fit-content/); assert.match(frame, /max-width:100%/); assert.match(frame, /margin:14px auto 0/);
  const bef = styleOf(/<img id="portraitCompareBefore"[^>]*>/);
  assert.match(bef, /max-width:100%/); assert.match(bef, /max-height:70vh/); assert.doesNotMatch(bef, /(^|[;\s])width:100%/);
});

test('٣. setComparePct(40) يقصّ بـclip-path ولا يلمس العرض، والخطّ عند ٤٠٪', () => {
  const after = { style: {} }, divider = { style: {} };
  const ctx = { compareAfterWrap: after, $: (s) => (s === '#portraitCompareDivider' ? divider : null), Math };
  vm.createContext(ctx);
  vm.runInContext(cut(A12, '  let comparePct = 100;', '  let __compareDragging = false;'), ctx);
  ctx.setComparePct(40);
  assert.equal(after.style.clipPath, 'inset(0 60% 0 0)');
  assert.equal(after.style.width, undefined, 'العرض لم يُلمس');
  assert.equal(divider.style.left, '40%');
  ctx.setComparePct(100);
  assert.equal(after.style.clipPath, 'inset(0 0% 0 0)', 'افتراضيّ: النتيجة كاملة');
  ctx.setComparePct(-5);
  assert.equal(after.style.clipPath, 'inset(0 100% 0 0)');
});

test('٤. لا قياس عرض بالبكسل ولا مستمع resize له', () => {
  assert.doesNotMatch(A12, /layoutCompareAfter/);
  assert.doesNotMatch(cut(A12, '  let comparePct = 100;', '  if(!modal || !btnOpen) return;'), /resultEl\.style\.width/);
});
