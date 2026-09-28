'use strict';
/* v-tools-shelves: صفوف اكتشاف بلا بطاقة يتيمة، وصفحة «عرض الكل» داخل شاشة
   الأدوات نفسها، وبطاقات موحّدة بلا السهم الدائري الداخلي. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');

const features = read('js/app-10-features.js');
const cards = read('js/tool-card-images.js');
const css = read('css/tool-card-images.css');
const tokens = read('css/tokens.css');
const wiring = read('js/ui-wiring.js');

test('١. كل قسم صف أفقي مراقب بطرفين، وغياب overflow يخفي الأسهم وعرض الكل', () => {
  assert.match(features, /className = 'ptSection'/);
  assert.match(features, /className = 'ptGrid ptTrack'/);
  assert.match(features, /className = 'ptSentinel ptSentinelStart'/);
  assert.match(features, /className = 'ptSentinel ptSentinelEnd'/);
  assert.match(features, /new IntersectionObserver\([\s\S]*?\{ root:viewport, threshold:\[0, \.9, 1\] \}/);
  assert.match(features, /const noOverflow = edge\.start && edge\.end;/);
  assert.match(features, /prev\.hidden = noOverflow \|\| edge\.start; next\.hidden = noOverflow \|\| edge\.end; all\.hidden = noOverflow;/);
  assert.match(css, /\.ptTrack\{display:flex!important;/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.doesNotMatch(css, /scroll-snap-stop/);
});

test('٢. «عرض الكل» يستبدل المحتوى، يحفظ الموضع، ويرتبط برجوع المتصفح', () => {
  assert.match(features, /ptAllView\.hidden = true/);
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(220px,1fr\)\)/);
  assert.match(features, /top:ptPopup\.scrollTop, left:viewport\.scrollLeft/);
  assert.match(features, /history\.pushState\(\{ omranToolsAll:historyToken \}/);
  assert.match(features, /addEventListener\('popstate', \(\) => \{ if\(allState\) closeAll\(true\); \}\)/);
  assert.match(features, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(features, /target\.scrollIntoView\(\{ behavior:[\s\S]*?inline:'start'/);
});

test('٣. البطاقة موحّدة 16:10 وبلا سهم دائري، والبيانات الحية شارة على الصورة', () => {
  assert.doesNotMatch(cards, /tcArrow/);
  assert.doesNotMatch(css, /tcArrow/);
  assert.match(cards, /media\.className = 'tcMedia'/);
  assert.match(cards, /oldImage\.width = 600;\s*oldImage\.height = 360;/);
  assert.match(css, /\.tcMedia\{[\s\S]*?aspect-ratio:16\/10/);
  assert.match(css, /\.tcLive\{[\s\S]*?position:absolute/);
  assert.match(css, /-webkit-line-clamp:2/);
  assert.match(css, /\.ptTrack > \.btn\):focus-visible/);
});

test('٤. الجوال يسحب بلا أسهم، والحركة تحترم تقليل الحركة', () => {
  assert.match(css, /@media \(max-width:600px\)[\s\S]*?\.ptShelfArrow\{display:none!important;\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(features, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});

test('٥. X الإعدادات مخفي في الهواتف وحدها، ونسخ الأصول مرفوعة', () => {
  assert.match(tokens, /html\.mobile-ui #setHomeClose\{display:none!important;\}/);
  assert.match(tokens, /@media \(max-width:860px\)\{ #setHomeClose\{display:none!important;\} \}/);
  assert.doesNotMatch(tokens, /(?:^|\n)\s*#setHomeClose\{display:none!important;\}/);
  assert.match(read('index.html'), /css\/tokens\.css\?v=726/);
  assert.match(wiring, /tool-card-images\.css\?v=16/);
  assert.match(wiring, /tool-card-images\.js\?v=16/);
});
