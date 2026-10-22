// tests/decor-compare-address.test.cjs — v-decor-compare-masc (تدقيق ١٨–١٩ أكتوبر، g09/decor-compare):
// ١) «غرفتي بكل الأنماط» كانت تخاطب بالمؤنّث (ارفعي/اختاري/اعتمدي/اسحبي) وباقي الديكور بالمذكّر — لا قرار مالك بتأنيث الديكور
//    (التأنيث للأزياء النسائيّة وحدها). الطرف العربيّ مذكّر، والطرف الإنجليزيّ لـbT كما هو فقاموس __BI للّغات الأخرى سليم.
// ٢) سطر الحالة (#designCompareStatus) تحت زرّ «صمّمها» آخر النافذة: «الحد ٣ أنماط» و«ارفع صورة غرفتك أولًا» ظهرتا على حافّة
//    الشاشة أو تحتها. cmpStatus يمرّر السطر إلى المرئيّ (block:'nearest') ويترك تحته مسافة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const FEM = /ارفعي|اختاري|اعتمدي|اسحبي|قارني|تختارين|صمّمي|جرّبي/;

function block() {
  const s = read('js/app-12-studios.js');
  const a = s.indexOf('/* ---- v-decor-compare:');
  assert.ok(a > 0, 'كتلة v-decor-compare');
  const b = s.indexOf('\n})();', a);
  assert.ok(b > a, 'نهاية الكتلة');
  return s.slice(a, b);
}

test('١. كتلة المقارنة بلا خطاب مؤنّث، والأطراف الإنجليزيّة لـbT كما هي', () => {
  const B = block();
  assert.doesNotMatch(B, FEM);
  for (const [ar, en] of [
    ['ارفع صورة غرفتك أولًا', 'Upload your room photo first'],
    ['اختر نمطين أو ثلاثة', 'Pick 2-3 styles'],
    ['👍 اعتمد هذا', '👍 Pick this'],
    ['✓ تم — اسحب وقارن واختر', '✓ Done — swipe and pick'],
    ['الحد ٣ أنماط', 'Max 3 styles'],
  ]) assert.ok(B.includes("bT('" + ar + "','" + en + "')"), ar + ' / ' + en);
});

test('٢. designCompareHint العربيّ مذكّر كاحتياط partials-core، والإنجليزيّ كما هو', () => {
  const data = read('js/app-03-i18n-data.js');
  const ar = [...data.matchAll(/^\s*designCompareHint: '([^']*)'/gm)].map((m) => m[1]);
  assert.equal(ar.length, 2, 'العربيّ والإنجليزيّ');
  assert.doesNotMatch(ar[0], FEM);
  assert.equal(ar[0], 'ارفع صورة غرفتك واختر ٢-٣ أنماط — نولّدها جنبًا إلى جنب وتختار الأجمل');
  assert.equal(ar[1], 'Upload your room photo, pick 2-3 styles — we design them side by side');
  assert.ok(read('js/partials-core.js').includes('data-i18n="designCompareHint">' + ar[0] + '</div>'), 'مطابق لاحتياط القالب');
});

test('٣. cmpStatus الحقيقيّ: نصّ = ظاهر ومُمرَّر إلى المرئيّ مرّة وبهامش سفليّ؛ فارغ = مخفيّ بلا تمرير', () => {
  const B = block();
  const m = B.match(/ {2}function cmpStatus\(txt\)\{[\s\S]*?\n {2}\}\n/);
  assert.ok(m, 'cmpStatus');
  const calls = [];
  const el = { style: {}, textContent: '', scrollIntoView: (o) => calls.push(o) };
  const ctx = { cmpStatusEl: el, __swallow: () => {} };
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.cmpStatus = cmpStatus;', ctx);
  ctx.cmpStatus('الحد ٣ أنماط');
  assert.equal(el.style.display, 'block');
  assert.equal(el.textContent, 'الحد ٣ أنماط');
  assert.equal(calls.length, 1, 'تمرير واحد');
  assert.equal(calls[0].block, 'nearest');
  assert.ok(parseInt(el.style.marginBottom, 10) > 0, 'هامش سفليّ: ' + el.style.marginBottom);
  ctx.cmpStatus('');
  assert.equal(el.style.display, 'none');
  assert.equal(el.textContent, '');
  assert.equal(calls.length, 1, 'المسح لا يمرّر');
  // عنصر بلا scrollIntoView (متصفّح قديم) لا يكسر السطر
  const old = { style: {}, textContent: '' };
  const ctx2 = { cmpStatusEl: old, __swallow: () => {} };
  vm.createContext(ctx2);
  vm.runInContext(m[0] + '\nthis.cmpStatus = cmpStatus;', ctx2);
  ctx2.cmpStatus('نص');
  assert.equal(old.textContent, 'نص');
});
