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
  assert.match(css, /html\.mobile-ui #sidebarCloseBtn\{ display:inline-flex; \}/, 'ظاهر على الجوّال');
  assert.match(css, /html:not\(\.mobile-ui\) #sidebarCloseBtn\{ display:inline-flex;/, 'ظاهر على سطح المكتب');
  // طيّ عمود القائمة على سطح المكتب + مقبض إعادة فتح
  assert.match(css, /html:not\(\.mobile-ui\) #sidebar\.sbCollapsed[\s\S]*?display:none !important/, 'طيّ عمود القائمة على المكتب');
  assert.match(css, /body\.sbCollapsedMode #sbReopen\{[\s\S]*?display:flex/, 'مقبض إعادة الفتح');
  // السلوك: جوّال → closeDrawers، مكتب → طيّ العمود
  assert.match(js, /mobile-ui'\)\) closeDrawers\(\);\s*else __setSB\(true\)/, 'جوّال يسكر الدرج والمكتب يطوي العمود');
  assert.ok(read('index.html').includes('css/tokens.css?v=706'), 'وسم كاش tokens.css رُفع');
});
