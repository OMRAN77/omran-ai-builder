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
const swipe = read('js/app-05-swipe-back.js');

test('١. كل قسم صف أفقي مراقب بطرفين، وأسهمه في منتصف جانبي الصف', () => {
  assert.match(features, /className = 'ptSection'/);
  assert.match(features, /className = 'ptGrid ptTrack'/);
  assert.match(features, /className = 'ptCarouselShell'/);
  assert.match(features, /carouselShell\.appendChild\(viewport\);\s*carouselShell\.appendChild\(prev\);\s*carouselShell\.appendChild\(next\)/);
  assert.match(features, /className = 'ptSentinel ptSentinelStart'/);
  assert.match(features, /className = 'ptSentinel ptSentinelEnd'/);
  assert.match(features, /new IntersectionObserver\([\s\S]*?\{ root:viewport, threshold:\[0, \.9, 1\] \}/);
  assert.match(features, /const noOverflow = edge\.start && edge\.end;/);
  assert.match(features, /prev\.hidden = noOverflow \|\| edge\.start; next\.hidden = noOverflow \|\| edge\.end; all\.hidden = noOverflow;/);
  assert.match(css, /\.ptTrack\{display:flex!important;/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.doesNotMatch(css, /scroll-snap-stop/);
  assert.match(css, /\.ptShelfArrow\{[\s\S]*?position:absolute;[\s\S]*?inset-block-start:50%; transform:translateY\(-50%\)/);
  assert.match(css, /\.ptShelfPrev\{inset-inline-start:8px;\}/);
  assert.match(css, /\.ptShelfNext\{inset-inline-end:8px;\}/);
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

test('٣. السحب من «عرض الكل» يرجع إلى الصفوف، وسحب الصف لا يغلق شاشة الأدوات', () => {
  assert.match(features, /ptOverlay\.__omranSwipeBackStep = \(\) => \{[\s\S]*?if\(!allState\) return false;[\s\S]*?history\.back\(\);[\s\S]*?closeAll\(true\);[\s\S]*?return true;/);
  assert.match(swipe, /typeof el\.__omranSwipeBackStep === 'function'/);
  assert.match(swipe, /if\(el\.__omranSwipeBackStep\(\)\) return true/);
  assert.match(swipe, /classList\.contains\('ptCarousel'\)/);
});

test('٤. البطاقة موحّدة 16:10 وبلا سهم دائري، والبيانات الحية شارة على الصورة', () => {
  assert.doesNotMatch(cards, /tcArrow/);
  assert.doesNotMatch(css, /tcArrow/);
  assert.match(cards, /media\.className = 'tcMedia'/);
  assert.match(cards, /oldImage\.width = 600;\s*oldImage\.height = 360;/);
  assert.match(css, /\.tcMedia\{[\s\S]*?aspect-ratio:16\/10/);
  assert.match(css, /\.tcLive\{[\s\S]*?position:absolute/);
  assert.match(css, /-webkit-line-clamp:2/);
  assert.match(css, /\.ptTrack > \.btn\):focus-visible/);
});

test('٥. الجوال يسحب بلا أسهم، والحركة تحترم تقليل الحركة', () => {
  assert.match(css, /@media \(max-width:600px\)[\s\S]*?\.ptShelfArrow\{display:none!important;\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(features, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});

test('٦. X الإعدادات مخفي في الهواتف وحدها، ونسخ الأصول مرفوعة', () => {
  assert.match(tokens, /html\.mobile-ui #setHomeClose\{display:none!important;\}/);
  assert.match(tokens, /@media \(max-width:860px\)\{ #setHomeClose\{display:none!important;\} \}/);
  assert.doesNotMatch(tokens, /(?:^|\n)\s*#setHomeClose\{display:none!important;\}/);
  assert.match(read('index.html'), /css\/tokens\.css\?v=727/);
  assert.match(wiring, /tool-card-images\.css\?v=17/);
  assert.match(wiring, /tool-card-images\.js\?v=17/);
});

test('٧. v-shelf-scroll-smooth: تمرير الصفّ بالماوس/التراك باد بلا snap قسري (مسبار Playwright أثبت أنّ mandatory وproximity كليهما يبتلعان تمرير العجلة الصغير ثم يقفزان دفعة واحدة)، والمسّ يبقى محاذًى', () => {
  assert.match(css, /#sectionsToolsPopup \.ptCarousel\{overflow-x:auto; overflow-y:hidden; scrollbar-width:none; scroll-snap-type:x mandatory; overscroll-behavior-inline:contain;\}/, 'المسّ (بلا hover:hover/pointer:fine) يبقى على mandatory — محاذاة أنيقة عند سحب الجوال');
  assert.match(css, /@media \(hover:hover\) and \(pointer:fine\)\{\s*#sectionsToolsPopup \.ptCarousel\{scroll-snap-type:none;\}\s*\}/, 'مؤشّر دقيق (ماوس/تراك باد) يُلغي الـsnap فلا يقاوم تمرير سطح المكتب');
  /* moveShelf تعتمد على scrollIntoView البرمجيّة لا على CSS snap، فإلغاء snap لا يكسر أزرار السهم */
  assert.match(features, /target\.scrollIntoView\(\{ behavior:/);
});
