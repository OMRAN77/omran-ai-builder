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
  assert.ok(Number((read('index.html').match(/css\/tokens\.css\?v=(\d+)/) || [])[1]) >= 715, 'وسم كاش tokens.css رُفع (٧١٥ فأعلى — كلّ تعديل لاحق يرفعه)');
});

test('v2/v3/v4/v1: شرارة الأسهم بلا دائرة، مقابض الطيّ فوق بأيقونة اللوحة، الإيقاف ذهبيّ، سحب حرّ', () => {
  const css = read('css/tokens.css');
  const redesign = read('css/redesign.css');
  const js = read('js/app-10-features.js');
  const ui = read('js/app-05-ui.js');
  // #2: إزالة دائرة شرارة الأسهم
  assert.match(css, /#stockTickerToggle\.tickerAiCollapsed\{ background:none !important; border:none !important; box-shadow:none !important;/, 'الشرارة بلا دائرة');
  // #3: المقابض فوق (top:64px) بأيقونة اللوحة المقسومة (rect+line) في الجزأين
  assert.match(css, /body\.waCollapsedMode #waReopen\{[\s\S]*?top:54px/, "مقبض اللوحة فوق");
  assert.match(css, /body\.sbCollapsedMode #sbReopen\{[\s\S]*?top:54px/, "مقبض القائمة فوق");
  assert.match(ui, /ro\.innerHTML = '<svg[\s\S]*?<rect x="3" y="3"[\s\S]*?<line x1="9" y1="3"/, 'أيقونة اللوحة في مقبض العمل');
  assert.match(js, /__sbReopen\.innerHTML = '<svg[\s\S]*?<rect x="3" y="3"[\s\S]*?<line x1="9" y1="3"/, 'أيقونة اللوحة في مقبض القائمة');
  // #4: زرّ الإيقاف ذهبيّ لا أحمر
  assert.match(redesign, /#composerBox > #btnStop\{[\s\S]*?border:1\.5px solid #d4af37 !important; color:#d4af37/, 'الإيقاف ذهبيّ');
  // #1: سحب حرّ واسع المدى (القائمة تصل 0)
  assert.match(js, /setupResizer\(\$\('#resizer1'\), sidebarEl, \{ min: 0, max: 560/, 'سحب القائمة حرّ حتّى الطيّ');
  // v-resizer2-work: مقبض لوحة العمل صار يضبط عرض #workarea (لا #chatcol) باتّجاه معكوس
  assert.match(js, /setupResizer\(\$\('#resizer2'\), workareaEl, \{ min: 240, max: 1600, storeKey: 'panelWidthWork', invert: true \}\)/, 'سحب اللوحة يضبط workarea');
  assert.match(js, /const \{ min = 180, max = 560, storeKey, invert = false \} = opts;/, 'خيار invert في setupResizer');
  assert.match(js, /if\(invert\) delta = -delta;/, 'عكس الاتّجاه عند invert');
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
  assert.ok(+((read('index.html').match(/css\/redesign\.css\?v=(\d+)/) || [])[1] || 0) >= 681, 'وسم كاش redesign رُفع (681 فما فوق)');
  assert.ok(read('index.html').includes('js/modes.js?v=m230923a'), 'وسم كاش modes رُفع');
});

test('v-wa-handle-bare: مقبض سحب لوحة المعاينة/الكود أيقونة وحدها بلا أيّ إطار/صندوق', () => {
  const css = read('css/tokens.css');
  const modules = read('css/modules.css');
  // بلا خلفيّة ولا إطار ولا استدارة — أيقونة فقط (tokens)
  assert.match(css, /body\.waCollapsedMode #waReopen\{[^}]*background:none !important;/, 'بلا خلفيّة');
  assert.match(css, /body\.waCollapsedMode #waReopen\{[^}]*border:none !important;/, 'بلا إطار');
  assert.match(css, /body\.waCollapsedMode #waReopen\{[^}]*border-radius:0 !important;/, 'بلا استدارة');
  assert.match(css, /body\.waCollapsedMode #waReopen svg\{width:16px; height:16px;\}/, 'الأيقونة باقية');
  // modules.css كان يغلب tokens (يُحمَّل بعده) بصندوق ذهبيّ — أُزيل نهائيًّا
  assert.match(modules, /body\.waCollapsedMode #waReopen\{background:none!important;border:none!important;[^}]*box-shadow:none!important\}/, 'modules بلا صندوق');
  assert.match(modules, /body\.waCollapsedMode #waReopen:hover\{background:none!important;/, 'modules بلا صندوق عند المرور');
  assert.ok(read('index.html').includes('css/modules.css?v=662'), 'وسم كاش modules رُفع');
});

test('v-sb-handle-bare: مقبض جهة «المحادثة الجديدة» أيقونة وحدها بلا صندوق (نفس مقبض اللوحة)', () => {
  const css = read('css/tokens.css');
  assert.match(css, /body\.sbCollapsedMode #sbReopen\{[\s\S]*?background:none !important; border:none !important; border-radius:0 !important; box-shadow:none !important;/, 'بلا صندوق');
  assert.match(css, /body\.sbCollapsedMode #sbReopen svg\{width:16px; height:16px;\}/, 'الأيقونة باقية');
  assert.match(css, /body\.sbCollapsedMode #sbReopen:hover\{ color:var\(--text\); background:none !important; \}/, 'بلا صندوق عند المرور');
});

test('v-mic-gold: مايك التسجيل ذهبيّ بوميض بدل الأحمر، وبلا أحمر باقٍ', () => {
  const css = read('css/tokens.css');
  const redesign = read('css/redesign.css');
  // حالة التسجيل ذهبيّة (لا حمراء) في المرجع والعميل
  assert.match(css, /#btnMic\.recording\{background:#0c0c0f; color:#d4af37; border:1\.5px solid #d4af37; animation: micPulse/, 'المايك ذهبيّ');
  assert.match(redesign, /#inputbar \.inputbar-tools-left > #btnMic\.recording\{background:#0c0c0f !important; color:#d4af37 !important; border:1\.5px solid #d4af37 !important;\}/, 'مايك الصندوق ذهبيّ');
  // الوميض ذهبيّ لا أحمر
  assert.match(css, /@keyframes micPulse\{[^}]*rgba\(212,175,55,\.55\)/, 'الوميض ذهبيّ');
  // لا أحمر باقٍ على أيّ حالة تسجيل للمايك
  assert.doesNotMatch(css, /(#btnMic|mini-mic-btn)\.recording\{[^}]*#ff4d4d/, 'لا أحمر على المايك');
  assert.doesNotMatch(redesign, /#btnMic\.recording\{[^}]*#ff4d4d/, 'لا أحمر على مايك الصندوق');
});

test('v-below-onerow: «+/المايك» وشريط المزوّد على سطر واحد تحت الصندوق ضمن نطاقه', () => {
  const redesign = read('css/redesign.css');
  // #inputbar يلتفّ صفوفًا، والصندوق سطر كامل
  assert.match(redesign, /html:not\(\.mobile-ui\) #inputbar\{flex-flow:row wrap;/, 'inputbar يلتفّ صفوفًا');
  assert.match(redesign, /html:not\(\.mobile-ui\) #inputbar > #composerRow\{flex:1 1 100% !important; order:0;\}/, 'الصندوق سطر كامل');
  assert.match(redesign, /html:not\(\.mobile-ui\) #inputbar > #omranBelowComposer\{flex:1 1 100% !important; order:3;\}/, 'الترحيب آخر سطر');
  // الأدوات جهة البداية (order:1) تحت حافّة الصندوق (inset)، والمزوّد جهة النهاية (order:2) تحت الحافّة الأخرى
  assert.match(redesign, /#inputbar > \.inputbar-tools-below\{\s*order:1 !important;[\s\S]*?margin-inline-start:var\(--om-chat-inset\) !important;/, 'الأدوات جهة البداية ضمن النطاق');
  assert.match(redesign, /#inputbar > #omBottomBar\{\s*order:2 !important;[\s\S]*?margin-inline-start:auto !important; margin-inline-end:var\(--om-chat-inset\) !important;/, 'المزوّد جهة النهاية ضمن النطاق');
  // على الجوّال أيضًا: نفس السطر الواحد (بلا نطاق inset)
  assert.match(redesign, /html\.mobile-ui #inputbar\{flex-flow:row wrap;/, 'inputbar يلتفّ صفوفًا على الجوّال');
  assert.match(redesign, /html\.mobile-ui #inputbar > \.inputbar-tools-below\{\s*order:1 !important;/, 'الأدوات جهة البداية على الجوّال');
  assert.match(redesign, /html\.mobile-ui #inputbar > #omBottomBar\{\s*order:2 !important;[\s\S]*?margin-inline-start:auto !important;/, 'المزوّد جهة النهاية على الجوّال');
});

test('v-mic-noline: إزالة الخطّ الفاصل جنب المايك', () => {
  const redesign = read('css/redesign.css');
  assert.match(redesign, /#inputbar \.inputbar-tools-left > #btnMic::before\{display:none !important;\}/, 'الخطّ الفاصل مخفيّ');
});

test('v-mobile-brand-once: على الجوّال يبقى شعار الدرج فقط ويُخفى شعار الهيدر + شارة الموديل للمالك بيضاء', () => {
  const redesign = read('css/redesign.css');
  const app04 = read('js/app-04-i18n-state.js');
  // شعار الهيدر مخفيّ على الجوّال (كي لا يتكرّر الاسم)
  assert.match(redesign, /html\.mobile-ui header h1 #brandTitle\{display:none !important;\}/, 'شعار الهيدر مخفيّ على الجوّال');
  // شعار الدرج باقٍ على الجوّال
  assert.match(redesign, /html\.mobile-ui #sidebarBrand\{order:-3; display:flex;/, 'شعار الدرج باقٍ على الجوّال');
  // شارة الموديل للمالك (لا اسأل الكل) بالأبيض
  assert.match(app04, /__ownerBadge && !isAskAllReply\)\{ label\.style\.color = 'var\(--text\)'; \}/, 'شارة الموديل بيضاء للمالك');
});

test('v-light-visibility: في الوضع الفاتح شريط السحب واضح، وشرارة الذكاء بلا صندوق مقصوص', () => {
  const css = read('css/tokens.css');
  // شريط السحب (الفاصل) بخطّ رماديّ واضح على الأبيض
  assert.match(css, /html\[data-mode="light"\] \.resizer::after\{background:rgba\(0,0,0,\.30\) !important;\}/, 'شريط السحب واضح في الفاتح');
  // شرارة الذكاء المطويّة بلا صندوق في الفاتح (كان صندوقًا مقصوصًا)
  assert.match(css, /html\[data-mode="light"\] #stockTickerToggle\.tickerAiCollapsed\{background:none !important; box-shadow:none !important; border:none !important;\}/, 'الشرارة بلا صندوق ولا ظلّ في الفاتح');
  // v-ticker-toggle-light: زرّ الشريط (بحالتيه: الشرارة والسهم ^) بلا ظلّ في الفاتح — كان الظلّ يُقصّ فيبان مأكولًا
  const modules = read('css/modules.css');
  assert.match(modules, /html\[data-mode="light"\] #stockTickerToggle\{background:none!important;border:none!important;box-shadow:none!important\}/, 'زرّ الشريط بلا دائرة ولا إطار ولا ظلّ في الفاتح');
});

test('v-foldable-composer: على التابلت/القابل للطيّ (mobile-ui ≥700px) الأدوات/المزوّد تحت حافّتَي الصندوق بنفس هامشه (١٢٪) لا في الزوايا', () => {
  const redesign = read('css/redesign.css');
  // العتبة 700px (تغطّي عرض الجهاز المطويّ 700–860 الذي فوّتته العتبة القديمة 861)، والهامش ١٢٪ يطابق الصندوق/الرسائل
  assert.match(redesign, /@media \(min-width:700px\)\{\s*html\.mobile-ui #inputbar\{ --fold-inset: max\(var\(--om-chat-pad,32px\), 12%\); \}/, 'العتبة 700 والهامش ١٢٪');
  assert.match(redesign, /html\.mobile-ui #inputbar > #composerRow\{ margin-inline: var\(--fold-inset\) !important;/, 'توسيط الصندوق');
  assert.match(redesign, /html\.mobile-ui #inputbar > \.inputbar-tools-below\{ margin-inline-start: var\(--fold-inset\) !important; \}/, 'الأدوات تحت حافّة الصندوق');
  assert.match(redesign, /html\.mobile-ui #inputbar > #omBottomBar\{ margin-inline-end: var\(--fold-inset\) !important; \}/, 'المزوّد تحت حافّة الصندوق');
});

test('v-maha-in-tools: «مها» زرّ دائريّ صغير ضمن صفّ الأدوات (بدل الصندوق الطويل الممتدّ)', () => {
  const js = read('js/app-10-features.js');
  const redesign = read('css/redesign.css');
  // نقل DOM: btnMahaDock يُلحق بـ.inputbar-tools-left مع صنف maha-in-tools
  assert.match(js, /const __maha = document\.getElementById\('btnMahaDock'\);[\s\S]*?__toolsLeft\.appendChild\(__maha\); __maha\.classList\.add\('maha-in-tools'\);/, 'نقل مها إلى صفّ الأدوات');
  // زرّ دائريّ صغير بلا امتداد ولا صندوق زجاجيّ
  assert.match(redesign, /#inputbar > \.inputbar-tools-below #btnMahaDock\{[\s\S]*?width:24px !important; height:24px !important;[\s\S]*?background:none !important;[\s\S]*?border-radius:999px !important;/, 'مها دائريّة صغيرة بلا صندوق');
  // الحرف يبقى بذهب الشعار
  assert.match(redesign, /#inputbar > \.inputbar-tools-below #btnMahaDock \.mahaGlyph\{[\s\S]*?font-size:19px !important;/, 'حرف مها بحجم مناسب للصفّ');
});
