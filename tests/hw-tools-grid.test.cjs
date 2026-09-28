'use strict';
/* v-hw-tools-grid (المالك ٢٨ سبتمبر بعد نشر v-shelf-nocomposite: «الحين أبطأ كثير، والصورة ما توقف عند آخر صورة،
   واحذف الدوائر اللي فيها الأسهم مع الأسهم في الأدوات»): تطبيق هواوي يرسم بالمعالج المركزيّ، فالصفّ الأفقيّ يا يفرغ
   (ماسح مركّب — فيديو ١٧:٤٦) يا يبطؤ (سحب JS يعيد رسم النافذة مع كلّ حركة). داخل تطبيق هواوي صار كلّ قسم شبكة
   عموديّة بلا سحب جانبيّ ولا أسهم ولا «عرض الكل»؛ الحاسوب والمتصفّحات على الصفوف كما هي. السلوك الحيّ (طبقات،
   أعمدة، نقرة، تمرير) مثبت بمسبار Playwright في DECISIONS؛ هنا ما يمنع رجوعه. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const R = (p) => fs.readFileSync(p, 'utf8');
const SRC = R('js/app-10-features.js');
const CSS = R('css/tool-card-images.css');
const SWIPE = R('js/app-05-swipe-back.js');
const BUNDLE = R('js/app.bundle.js');

test('١. البوّابة: جسر OmranRender أو علم حزمة هواوي store-safe، والعلم يُضبط قبل الحزمة', () => {
  assert.match(SRC, /const ptHwGrid = \(\(\) => \{ try\{ return !!\(\(window\.OmranRender && typeof window\.OmranRender\.mode === 'function'\) \|\| document\.documentElement\.classList\.contains\('store-safe'\)\); \}/);
  assert.match(SRC, /if\(ptHwGrid\) ptSectionsView\.classList\.add\('ptHwGrid'\);/);
  const sd = R('js/selfdiag.js'), html = R('index.html');
  assert.ok(sd.includes("classList.add('store-safe')"), 'selfdiag يضبط العلم من ?store=huawei');
  assert.ok(html.indexOf('/js/selfdiag.js?v=') < html.indexOf('/js/app.bundle.js?v=') && !/<script defer src="\/js\/selfdiag/.test(html), 'selfdiag متزامن قبل الحزمة');
});

test('٢. لا سحب JS بعد اليوم: كان يعيد رسم النافذة مع كلّ حركة إصبع («أبطأ كثير»)', () => {
  assert.doesNotMatch(SRC, /ptShelfDrag|ptDragShelves/);
  assert.doesNotMatch(CSS, /ptDragShelves|touch-action:pan-y/);
  assert.doesNotMatch(SRC, /viewport\.scrollLeft = s0 - dx/);
});

test('٣. الشبكة: القسم كلّه ظاهر بلا ماسح، بلا أسهم ودوائرها، بلا «عرض الكل»', () => {
  assert.match(CSS, /#sectionsToolsPopup \.ptHwGrid \.ptCarousel\{overflow:visible; scroll-snap-type:none;\}/, 'لا ماسح جانبيّ = لا طبقة مركّبة');
  assert.match(CSS, /#sectionsToolsPopup \.ptHwGrid \.ptTrack\{display:grid!important; grid-template-columns:repeat\(auto-fill,minmax\(160px,1fr\)\)!important; width:100%;/);
  assert.match(CSS, /#sectionsToolsPopup \.ptHwGrid \.ptTrack > \.btn\{width:100%; min-width:0; flex:none;\}/);
  assert.match(CSS, /#sectionsToolsPopup \.ptHwGrid :is\(\.ptShelfArrow,\.ptViewAll,\.ptSentinel\)\{display:none!important;\}/, 'الأسهم ودوائرها و«عرض الكل» تُحذف');
});

test('٤. الحاسوب والمتصفّحات: الصفوف والأسهم كما هي', () => {
  assert.match(CSS, /#sectionsToolsPopup \.ptCarousel\{overflow-x:auto; overflow-y:hidden; scrollbar-width:none; scroll-snap-type:x mandatory;/);
  assert.match(CSS, /#sectionsToolsPopup \.ptTrack\{display:flex!important; width:max-content;/);
  assert.match(CSS, /#sectionsToolsPopup \.ptShelfArrow\{\s*position:absolute;/);
  assert.match(SRC, /prev\.onclick = \(\) => moveShelf\(section, -1\);/);
});

test('٥. سحب الرجوع يعمل فوق شبكة هواوي، ويبقى محجوبًا فوق الصفّ الأفقيّ', () => {
  assert.match(SWIPE, /if\(e\.classList && e\.classList\.contains\('ptCarousel'\) && !\(e\.closest && e\.closest\('\.ptHwGrid'\)\)\) return true;/);
});

test('٦. الحزمة ووسوم الكاش', () => {
  assert.ok(BUNDLE.includes("if(ptHwGrid) ptSectionsView.classList.add('ptHwGrid');"), 'الحزمة تحمل الجزء');
  assert.ok(!BUNDLE.includes('ptShelfDrag'), 'لا بقايا السحب في الحزمة');
  assert.match(R('js/ui-wiring.js'), /\/css\/tool-card-images\.css\?v=19/);
  assert.match(R('index.html'), /\/js\/ui-wiring\.js\?v=656/);
});
