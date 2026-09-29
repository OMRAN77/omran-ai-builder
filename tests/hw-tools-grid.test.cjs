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
  /* v-tools-one-col: البوّابة صارت هواوي **أو** هاتف — الشرطان الأوّلان كما هما (الاختبار ٧ يغطّي الثالث) */
  assert.match(SRC, /if\(\(window\.OmranRender && typeof window\.OmranRender\.mode === 'function'\) \|\| document\.documentElement\.classList\.contains\('store-safe'\)\) return true;/);
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
  /* v-tools-one-col + v-tools-two-col: الهاتف عمود، والتابلت عمودان */
  assert.match(CSS, /#sectionsToolsPopup \.ptHwGrid \.ptTrack\{display:grid!important; grid-template-columns:1fr!important; width:100%;/);
  assert.doesNotMatch(CSS, /minmax\(160px,1fr\)/, 'شبكة auto-fill القديمة رجعت');
  assert.match(CSS, /@media \(min-width:601px\)\{ html\[lang\] body #sectionsToolsPopup \.ptHwGrid \.ptTrack\{grid-template-columns:repeat\(2,1fr\)!important;\} \}/, 'التابلت بلا عمودين');
  assert.ok(CSS.indexOf('@media (min-width:601px){ html[lang] body #sectionsToolsPopup .ptHwGrid') > CSS.indexOf('grid-template-columns:1fr!important'), 'قاعدة التابلت قبل قاعدة الهاتف فلا تغلبها');
  /* tokens.css يفرض minmax(190px,1fr) على .ptGrid فوق ٧٦١ — قاعدة التابلت يجب أن تغلبه تخصيصًا */
  assert.match(R('css/tokens.css'), /html\[lang\] body #sectionsToolsPopup \.ptGrid\{grid-template-columns:repeat\(auto-fill, minmax\(190px, 1fr\)\) !important;/, 'قاعدة tokens تغيّرت — راجع تخصيص قاعدة التابلت');
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
  assert.match(R('js/ui-wiring.js'), /\/css\/tool-card-images\.css\?v=21/);
  assert.match(R('index.html'), /\/js\/ui-wiring\.js\?v=659/);
});

/* v-tools-one-col (المالك بلقطة من جهازه: «رجّعلي في الأدوات نفس قبل… نفس الهواوي اللي
   الحين موجودة في الهواتف، نفس هاذي»): الشكل بطاقة واحدة بعرض كامل في الصفّ. */
test('٧. البوّابة تشمل الهواتف لا هواوي وحدها، والحاسوب خارجها', () => {
  assert.match(SRC, /window\.matchMedia\('\(max-width:1024px\)'\)\.matches/, 'الهواتف والتابلت خارج بوّابة الشبكة');
  // البوّابة الحقيقيّة في vm: هواوي، هاتف، حاسوب
  const vm = require('node:vm');
  const body = SRC.slice(SRC.indexOf('const ptHwGrid = (() => { try{'), SRC.indexOf('})();', SRC.indexOf('const ptHwGrid')) + 5);
  const run = (w) => { const ctx = { window: w, document: { documentElement: { classList: { contains: (c) => !!(w.__cls || []).includes(c) } } } };
    ctx.window.matchMedia = w.matchMedia; vm.runInNewContext(body + '\nglobalThis.__r = ptHwGrid;', ctx); return ctx.__r; };
  const mm = (px) => (q) => ({ matches: px <= Number((q.match(/(\d+)px/) || [])[1] || 0) });
  assert.equal(run({ matchMedia: mm(412) }), true, 'هاتف ٤١٢ خارج الشبكة');
  assert.equal(run({ matchMedia: mm(800) }), true, 'تابلت ٨٠٠ خارج الشبكة');
  assert.equal(run({ matchMedia: mm(1024) }), true, 'حدّ ١٠٢٤ خارج الشبكة');
  assert.equal(run({ matchMedia: mm(1280) }), false, 'الحاسوب دخل الشبكة — صفوفه يجب أن تبقى');
  assert.equal(run({ matchMedia: mm(1280), __cls: ['store-safe'] }), true, 'حزمة هواوي على الحاسوب');
  assert.equal(run({ matchMedia: mm(1280), OmranRender: { mode: () => 'cpu' } }), true, 'جسر هواوي');
  // وبلا matchMedia إطلاقًا لا ينكسر
  assert.equal(run({}), false);
});
