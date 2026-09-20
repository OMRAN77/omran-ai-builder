// v-ticker-ai + v-drawer-close (طلب المالك ١٩ سبتمبر):
// (١) شريط الأسهم يبدأ مطويًّا كأيقونة ذكاء ذهبيّة تومض بخفّة؛ الضغط يفتحه (stockTickerToggle باقٍ).
// (٢) درج المحادثات على الجوّال له زرّ إغلاق ظاهر (مع السحب القائم).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('v-ticker-ai: أيقونة ذكاء داخل زرّ الشريط، ووميض عند الطيّ، وبدء مطويّ افتراضيًّا', () => {
  const html = read('index.html');
  const css = read('css/tokens.css');
  const js = read('js/app-13-stocks-init.js');
  // الأيقونة موجودة داخل الزرّ ولا display:none سطريّ (كي لا يتغلّب على CSS)
  assert.match(html, /<button id="stockTickerToggle"[\s\S]*?id="stockTickerAiIcon"[\s\S]*?<\/button>/, 'أيقونة الذكاء داخل زرّ الشريط');
  assert.doesNotMatch(html, /id="stockTickerAiIcon"[^>]*style="[^"]*display:none/, 'لا display:none سطريّ على أيقونة الذكاء');
  // CSS: مخفيّة افتراضيًّا، تظهر ذهبيّة وتومض عند الطيّ، وسهم الطيّ يُخفى
  assert.match(css, /#stockTickerAiIcon\{ display:none; \}/, 'الأيقونة مخفيّة افتراضيًّا');
  assert.match(css, /#stockTickerToggle\.tickerAiCollapsed #stockTickerAiIcon\{[\s\S]*?color:#d4af37/, 'ذهبيّة عند الطيّ');
  assert.match(css, /@keyframes tickerAiPulse/, 'حركة الوميض معرّفة');
  assert.match(css, /#stockTickerToggle\.tickerAiCollapsed #stockTickerToggleIcon\{ display:none; \}/, 'سهم الطيّ يُخفى عند الطيّ');
  // JS: يبدّل الصنف عند الطيّ، ويبدأ مطويًّا حين لا تفضيل محفوظ
  assert.match(js, /classList\.toggle\('tickerAiCollapsed', collapsed\)/, 'تبديل صنف الطيّ');
  assert.match(js, /getItem\('tickerCollapsed'\) === null\) localStorage\.setItem\('tickerCollapsed','1'\)/, 'بدء مطويّ افتراضيًّا (بلا لمس تفضيل)');
});

test('v-drawer-close: زرّ إغلاق ظاهر لدرج المحادثات على الجوّال فقط، ومربوط بالإغلاق', () => {
  const html = read('index.html');
  const css = read('css/tokens.css');
  const js = read('js/app-10-features.js');
  assert.match(html, /<button type="button" id="sidebarCloseBtn"[\s\S]*?<\/button>/, 'سهم الطيّ موجود في رأس القائمة');
  // سهم بلا دائرة (بلا border-radius دائرة ولا خلفيّة صلبة)
  assert.match(css, /#sidebarCloseBtn\{[\s\S]*?background:none; border:none; border-radius:0/, 'بلا دائرة ولا إطار');
  // يظهر على الجوّال وسطح المكتب معًا
  assert.match(css, /html\.mobile-ui #sidebarCloseBtn\{ display:inline-flex;[\s\S]*?left:8px/, 'ظاهر على الجوّال في طرف اليسار');
  assert.match(css, /html:not\(\.mobile-ui\) #sidebarCloseBtn\{ display:inline-flex;/, 'ظاهر على سطح المكتب');
  // طيّ عمود القائمة على سطح المكتب + مقبض إعادة فتح
  assert.match(css, /html:not\(\.mobile-ui\) #sidebar\.sbCollapsed[\s\S]*?display:none !important/, 'طيّ عمود القائمة على المكتب');
  assert.match(css, /body\.sbCollapsedMode #sbReopen\{[\s\S]*?display:flex/, 'مقبض إعادة الفتح');
  // السلوك: جوّال → closeDrawers، مكتب → طيّ العمود
  assert.match(js, /mobile-ui'\)\) closeDrawers\(\);\s*else __setSB\(true\)/, 'جوّال يسكر الدرج والمكتب يطوي العمود');
  assert.ok(read('index.html').includes('css/tokens.css?v=708'), 'وسم كاش tokens.css رُفع');
});

test('v2/v3/v4/v1: شرارة الأسهم بلا دائرة، مقابض الطيّ فوق بأيقونة اللوحة، الإيقاف ذهبيّ، سحب حرّ', () => {
  const css = read('css/tokens.css');
  const redesign = read('css/redesign.css');
  const js = read('js/app-10-features.js');
  const ui = read('js/app-05-ui.js');
  // #2: إزالة دائرة شرارة الأسهم
  assert.match(css, /#stockTickerToggle\.tickerAiCollapsed\{ background:none !important; border:none !important; box-shadow:none !important;/, 'الشرارة بلا دائرة');
  // #3: المقابض فوق (top:64px) بأيقونة اللوحة المقسومة (rect+line) في الجزأين
  assert.match(css, /body\.waCollapsedMode #waReopen\{[\s\S]*?top:64px/, 'مقبض اللوحة فوق');
  assert.match(css, /body\.sbCollapsedMode #sbReopen\{[\s\S]*?top:64px/, 'مقبض القائمة فوق');
  assert.match(ui, /ro\.innerHTML = '<svg[\s\S]*?<rect x="3" y="3"[\s\S]*?<line x1="9" y1="3"/, 'أيقونة اللوحة في مقبض العمل');
  assert.match(js, /__sbReopen\.innerHTML = '<svg[\s\S]*?<rect x="3" y="3"[\s\S]*?<line x1="9" y1="3"/, 'أيقونة اللوحة في مقبض القائمة');
  // #4: زرّ الإيقاف ذهبيّ لا أحمر
  assert.match(redesign, /#composerBox > #btnStop\{[\s\S]*?border:1\.5px solid #d4af37 !important; color:#d4af37/, 'الإيقاف ذهبيّ');
  // #1: سحب حرّ واسع المدى (القائمة تصل 0)
  assert.match(js, /setupResizer\(\$\('#resizer1'\), sidebarEl, \{ min: 0, max: 560/, 'سحب القائمة حرّ حتّى الطيّ');
  assert.match(js, /setupResizer\(\$\('#resizer2'\), chatcolEl, \{ min: 240, max: 1600/, 'سحب المحادثة حرّ واسع');
});

test('v5/v6: أدوات + والمايك خارج الصندوق تحته، والإرسال وحده داخله، وشريط المزوّد تحت الصندوق', () => {
  const js = read('js/app-10-features.js');
  const redesign = read('css/redesign.css');
  const modes = read('js/modes.js');
  // #5: نقل مجموعة الأدوات أسفل الصندوق (بعد composerRow) مع صنف inputbar-tools-below
  assert.match(js, /querySelector\('#composerBox > \.inputbar-tools'\)[\s\S]*?insertBefore\(__tools, __row\.nextSibling\)[\s\S]*?inputbar-tools-below/, 'نقل الأدوات أسفل الصندوق');
  assert.match(redesign, /#inputbar > \.inputbar-tools-below\{[\s\S]*?align-self:flex-start/, 'تنسيق صفّ الأدوات تحت الصندوق');
  // زرّ الإرسال يبقى داخل الصندوق (لم يُنقل)
  assert.match(read('index.html'), /<div id="composerBox">[\s\S]*?id="btnSend"[\s\S]*?<\/div>\s*<!--/, 'الإرسال داخل الصندوق');
  // #6: شريط المزوّد يُدرج بعد composerRow (تحت الصندوق، جهة الإرسال)
  assert.match(modes, /getElementById\('composerRow'\)[\s\S]*?host\.insertBefore\(bar, __row\.nextSibling\)/, 'شريط المزوّد تحت الصندوق');
  assert.ok(read('index.html').includes('css/redesign.css?v=670'), 'وسم كاش redesign رُفع');
  assert.ok(read('index.html').includes('js/modes.js?v=m150916a'), 'وسم كاش modes رُفع');
});
