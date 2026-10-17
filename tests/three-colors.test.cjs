// tests/three-colors.test.cjs — v-three-colors (المالك ١٦ أكتوبر بلقطتي المقاولات والقبلة: «الأسطر كلّها خلّها لون واحد… فقط ٣ ألوان»؛
// «الحدود كلّها ذهبي»، «عند التضليل عليها الحدّ يصير رماديّ أفتح»، الأزرار الذهبيّة الكبيرة باقية، واستوديو الإعلانات أسود بدل المجرّة).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const src = read('js/app-41-three-colors.js');
const pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const sb = {};
vm.runInNewContext(pick('  function rgba(s){', '  function mark(el, inTool){') + '\nthis.rgba=rgba;this.boxFill=boxFill;this.gradBox=gradBox;this.lineOf=lineOf;', sb);
const side = (w, c, st) => ({ W: w, C: c, S: st || 'solid' });
const cs = (t, r, b, l, anim) => { const o = { animationName: anim || 'none' }; [['Top', t], ['Right', r], ['Bottom', b], ['Left', l]].forEach(([k, v]) => { o['border' + k + 'Width'] = v.W + 'px'; o['border' + k + 'Color'] = v.C; o['border' + k + 'Style'] = v.S; }); return o; };

test('١. تعبئة الصندوق: الرماديّ الشفيف والداكن والمسحة الذهبيّة/البنّيّة تُسوَّد — الذهبيّ المصمت والألوان المشبعة لا', () => {
  for (const c of ['rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.04)', 'rgb(11, 11, 13)', 'rgb(32, 36, 44)', 'rgba(212, 175, 55, 0.14)', 'rgba(212, 175, 55, 0.06)']) assert.ok(sb.boxFill(sb.rgba(c)), c);
  for (const c of ['rgb(212, 175, 55)', 'rgb(233, 199, 102)', 'rgb(220, 38, 38)', 'rgb(37, 99, 235)', 'rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)']) assert.ok(!sb.boxFill(sb.rgba(c)), c);
  assert.ok(sb.gradBox('linear-gradient(135deg, rgba(212, 175, 55, 0.16), rgba(212, 175, 55, 0.04))'), 'صندوق الصلاة القادمة');
  assert.ok(!sb.gradBox('linear-gradient(160deg, rgb(233, 199, 102), rgb(184, 144, 42))'), 'زرّ ذهبيّ كبير باقٍ');
  assert.ok(!sb.gradBox('url("a.webp"), linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))'), 'الصور لا تُمسّ');
});

test('٢. الحدّ: الظاهر الموحَّد الجوانب فقط — لا الدوّارات ولا المثلّثات ولا الشفّاف', () => {
  const g = 'rgba(255, 255, 255, 0.12)';
  assert.ok(sb.lineOf(cs(side(1, g), side(1, g), side(1, g), side(1, g))));
  assert.ok(!sb.lineOf(cs(side(3, 'rgb(212, 175, 55)'), side(3, g), side(3, g), side(3, g))), 'دوّار: جانب مختلف');
  assert.ok(!sb.lineOf(cs(side(1, g), side(1, g), side(1, g), side(1, g), 'spin')), 'متحرّك');
  assert.ok(!sb.lineOf(cs(side(1, 'rgba(0, 0, 0, 0)'), side(1, 'rgba(0, 0, 0, 0)'), side(1, 'rgba(0, 0, 0, 0)'), side(1, 'rgba(0, 0, 0, 0)'))), 'شفّاف لا يصير خطًّا جديدًا');
  assert.ok(sb.lineOf(cs(side(0, g), side(0, g), side(1, g), side(0, g))), 'خطّ سفليّ وحده');
});

test('٣. الألوان الثلاثة في CSS للوضع الأسود وحده، والصلاة القادمة «مختارة»، واستوديو الإعلانات أسود', () => {
  const css = read('css/أدوات-أسود.css');
  // v-no-lines (المالك: «شيل كلّ الخطوط… الذهبي بس لما أمرّ عليها»، «الخلفيّات لونين أسود بس: #000 و#101013»)
  assert.ok(css.includes('html:not([data-mode="light"]):not(.skin) .om3-line{border-color:transparent !important;}'), 'بلا خطوط');
  assert.ok(css.includes('.om3-hot.om3-line:hover') && css.includes('[aria-checked="true"]){border-color:rgba(212,175,55,.85) !important;}'), 'ذهبيّ عند المرور والاختيار فقط');
  assert.ok(!/#c9c9c9|212,175,55,\.6\)/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'لا رماديّ ولا ذهبيّ دائم');
  const fills = [...css.matchAll(/\.om3-fill[^{]*\{background:(#[0-9a-f]+) !important;\}/gi)].map((m) => m[1]);
  assert.deepEqual(fills, ['#101013', '#000', '#101013'], 'تناوب الأسودين');
  assert.ok(Number((read('index.html').match(/css\/أدوات-أسود\.css\?v=(\d+)/) || [])[1]) >= 2, 'وسم الكاش مرفوع');
  assert.ok(read('js/app-26-qibla.js').includes("'<div' + (isNext ? ' class=\"sel\"' : '') + ' style="), 'الصلاة القادمة مختارة');
  const ad = read('ad-studio.html');
  const blk = ad.slice(ad.indexOf('v-three-colors'), ad.indexOf('</style>'));
  assert.ok(blk.includes('body{background:#000 !important}') && blk.includes('.hero{background:none !important}'), 'لا مجرّة');
  assert.ok(blk.includes('.hero .tile i{background:#000 !important;border-color:rgba(212,175,55,.6) !important'), 'حلقات الفئات ذهبيّة لا ملوّنة');
  assert.ok(read('js/app.bundle.js').includes('window.__om3Mark'), 'الحزمة مبنيّة');
});
