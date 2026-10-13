'use strict';
/* v-no-center-glow (المالك ١٣ أكتوبر، لقطة الشاشة الفارغة على الحاسوب: «شيل الوهج الي في الوسط فقط»): هالة الترحيب
   (#omranHero::before، تدرّج دائريّ رماديّ في وسط المحادثة) أُزيلت؛ وما سواها من الشاشة كما هو. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('هالة وسط الترحيب أُزيلت من الحاسوب، والوسم مرفوع، والإطارات وتوهّج أسفل اللوحة باقية', () => {
  const css = read('css/redesign.css');
  assert.ok(!/#omranHero::before\{[^}]*radial-gradient/.test(css), 'لا تدرّج دائريّ خلف الترحيب');
  assert.ok(css.includes('html:not(.mobile-ui) body.omranWelcome #omranHero{position:relative;}'), 'الترحيب نفسه كما هو');
  assert.ok(Number((read('index.html').match(/css\/redesign\.css\?v=(\d+)/) || [])[1]) >= 691, 'وسم redesign.css مرفوع');
  assert.ok(/#workarea\{ background:radial-gradient\(120% 38% at 50% 100%, rgba\(206,181,98,\.10\)/.test(read('css/إطارات.css')), 'توهّج أسفل لوحة العمل لم يُطلب حذفه');
});
