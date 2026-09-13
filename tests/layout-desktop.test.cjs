'use strict';
/* v-frame-c — تخطيط الكمبيوتر «ج»: الجانبي واللوحة بطول النافذة، الهيدر
   والأسهم فوق المحادثة وحدها، والمحادثة عمود موسّط محدود العرض.
   الاختبار يثبّت أنّ الكتلة موجودة، محصورة بالكمبيوتر (min-width:861px
   و:not(.mobile-ui) على كل قاعدة)، وبعد كتلة v-topbar-merge التي تعلوها
   في الترتيب (فوز #omHeadCenter بالترتيب لا بالوزن)، وأنّ الجوال لم يُمسّ. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const start = html.indexOf('<style>\n/* v-frame-c');
assert.ok(start > 0, 'كتلة v-frame-c موجودة في index.html');
const end = html.indexOf('</style>', start);
const block = html.slice(start, end);

// ترتيبها بعد v-topbar-merge (تعتمد على الفوز بالترتيب عند تساوي الوزن)
assert.ok(html.indexOf('/* v-topbar-merge') < start, 'v-frame-c بعد v-topbar-merge');
// وبعد v-chat-fill (تُعيد ضبط margin-inline التي تكتبها تلك الكتلة بـ!important)
assert.ok(html.indexOf('/* v-chat-fill') < start, 'v-frame-c بعد v-chat-fill');

// الشبكة: الجسم شبكة و<main> يذوب
assert.match(block, /html:not\(\.mobile-ui\) body\{\s*display: grid;/, 'body شبكة على الكمبيوتر');
assert.match(block, /grid-template-columns: auto auto minmax\(300px, 1fr\) auto minmax\(240px, auto\);/, 'أعمدة الشبكة الخمسة');
assert.match(block, /grid-template-rows: auto auto minmax\(0, 1fr\);/, 'صفوف الشبكة الثلاثة');
assert.match(block, /body > main\{ display: contents; \}/, 'main يذوب');
assert.match(block, /body > header\{ grid-column: 3; grid-row: 1;/, 'الهيدر فوق عمود المحادثة');
assert.match(block, /#chatcol\{ grid-column: 3; grid-row: 3;/, 'المحادثة في العمود الأوسط');
for (const id of ['#sidebar', '#resizer1', '#resizer2', '#workarea']) {
  assert.match(block, new RegExp(id.replace('#', '#') + '\\{ grid-column: \\d; grid-row: 1 / -1;'), id + ' بطول النافذة');
}
assert.match(block, /#workarea\{[^}]*max-width: 100%;/, 'اللوحة تنكمش مع عمودها');
assert.match(block, /body\.waCollapsedMode\{\s*grid-template-columns: auto auto minmax\(300px, 1fr\) auto auto;/, 'طيّ اللوحة يُسقط حدّ عمودها');

// الهيدر سطر واحد: الأسهم على سطر الشعار وتذوب قبله على مسافة أطول (٩٦px) حسب الاتجاه
assert.ok(!/flex-wrap: wrap/.test(block), 'لا التفاف في الهيدر');
assert.match(block, /#omHeadCenter\{ flex: 1 1 auto; min-width: 0;/, 'الأسهم تملأ سطر الشعار');
assert.match(block, /html\[dir="rtl"\]:not\(\.mobile-ui\) #omHeadCenter #stockTicker\{\s*-webkit-mask-image: linear-gradient\(90deg, transparent, #000 96px, #000 calc\(100% - 16px\), transparent\);/, 'الذوبان الطويل جهة الشعار (يسار بالعربية)');
assert.match(block, /html\[dir="ltr"\]:not\(\.mobile-ui\) #omHeadCenter #stockTicker\{\s*-webkit-mask-image: linear-gradient\(90deg, transparent, #000 16px, #000 calc\(100% - 96px\), transparent\);/, 'الذوبان الطويل جهة الشعار (يمين بالإنجليزية)');

// زرّ الوضع الفاتح: مخفيّ في الهيدر ومرآته في شريط التنقّل (كتلة v-mode-nav عامّة للسطحين)
const modeStart = html.indexOf('<style>\n/* v-mode-nav');
assert.ok(modeStart > 0, 'كتلة v-mode-nav موجودة');
const modeBlock = html.slice(modeStart, html.indexOf('</style>', modeStart));
assert.match(modeBlock, /^body #btnMode\{ display: none !important; \}/m, 'زرّ الهيدر مخفيّ على السطحين');
assert.match(modeBlock, /^#omNavMode\{\s*flex: 1 1 0; display: flex; flex-direction: column;/m, 'زرّ التنقّل بشكل تبويبات الشريط');
assert.match(block, /#omNavMode\{ padding: 6px 0; \}/, 'حشوة الكمبيوتر تساوي تبويبات أسفل الجانبي');
const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');
assert.ok(ui.includes("b.id = 'omNavMode'"), 'v-mode-nav يبني الزرّ');
assert.ok(ui.includes("b.className = 'omModeNav'") && !ui.includes("omNavMode'; b.className = 'omNavBtn"), 'ليس .omNavBtn كي لا يلوّنه سلك التبويبات نشطًا');
assert.ok(/new MutationObserver\(mirror\)\.observe\(src, \{ childList: true, attributes: true, attributeFilter: \['title'\] \}\)/.test(ui), 'المرآة تتبع الأيقونة والعنوان');
assert.ok(ui.includes("getElementById(isMobile() ? 'omranBottomNav' : 'omranSidebarFoot')"), 'الجوال: الشريط السفلي؛ الكمبيوتر: أسفل الجانبي');

// الجوال (أمر عمران «طبّقها على الهواتف»): الأسهم على سطر الشعار في الجوال أيضًا
const mobStart = html.indexOf('/* v-topbar-merge-mobile');
assert.ok(mobStart > 0, 'كتلة v-topbar-merge-mobile موجودة');
const mobBlock = html.slice(mobStart, html.indexOf('</style>', mobStart));
assert.ok(!/html\.mobile-ui #omHeadCenter\{ display: none/.test(html), 'إخفاء #omHeadCenter على الجوال أُلغي');
assert.match(mobBlock, /html\.mobile-ui header:has\(#omHeadCenter\) h1\{ flex: 0 0 auto !important; \}/, 'الشعار يثبت على عرضه');
assert.match(mobBlock, /html\[dir="rtl"\]\.mobile-ui #omHeadCenter #stockTicker\{\s*-webkit-mask-image: linear-gradient\(90deg, transparent, #000 64px, #000 calc\(100% - 12px\), transparent\);/, 'ذوبان الجوال جهة الشعار (عربي)');
assert.match(mobBlock, /html\[dir="ltr"\]\.mobile-ui #omHeadCenter #stockTicker\{\s*-webkit-mask-image: linear-gradient\(90deg, transparent, #000 12px, #000 calc\(100% - 64px\), transparent\);/, 'ذوبان الجوال جهة الشعار (إنجليزي)');
assert.match(mobBlock, /html\.mobile-ui #omHeadCenter #stockTickerToggle\{\s*position: static !important;/, 'سهم الطيّ داخل السطر');
const mobRules = [...mobBlock.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
for (const r of mobRules) for (const sel of r.split(',').map((x) => x.trim()).filter(Boolean)) {
  assert.ok(/^html(\[dir="(rtl|ltr)"\])?\.mobile-ui/.test(sel), 'قاعدة جوال فقط: ' + sel);
}
assert.ok(!/if\(isMobile\(\)\) return true;\s*\/\* الجوال يبقى/.test(ui), 'نقل الأسهم لم يعد يستثني الجوال');

// ١٤ لغة (أمر عمران): عنوان الوضع الداكن/الفاتح من القاموس، والمفتاح موجود في كل اللغات
const i18nMain = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-03-i18n-data.js'), 'utf8');
assert.strictEqual((i18nMain.match(/darkModeTitle: '/g) || []).length, 2, 'darkModeTitle في العربية والإنجليزية');
assert.strictEqual((i18nMain.match(/lightModeTitle: '/g) || []).length, 2, 'lightModeTitle في العربية والإنجليزية');
const lazy = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
for (const lg of lazy) {
  const f = fs.readFileSync(path.join(__dirname, '..', 'i18n', lg + '.js'), 'utf8');
  assert.ok(/darkModeTitle: '[^']+'/.test(f) && /lightModeTitle: '[^']+'/.test(f), 'مفتاحا الوضع في ' + lg);
}
assert.ok(html.includes("var key=L?'darkModeTitle':'lightModeTitle';") && html.includes("b.setAttribute('data-i18n-title',key);"), 'v434 يقرأ العنوان من القاموس ويحدّث المفتاح');
const state = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');
assert.ok(state.includes("'.js?v=672'"), 'كاسر كاش ملفات اللغة الكسولة رُفع بعد إضافة المفتاح');

// العمود الموسّط
assert.match(block, /--om-chat-max: 800px;/, 'حدّ عرض المحادثة');
assert.match(block, /--om-chat-inset: max\(var\(--om-chat-pad\), calc\(\(100% - var\(--om-chat-max\)\) \/ 2\)\);/, 'هامش التوسيط');
for (const sel of ['#omranHero', '#messages > *', '#askAllHintTip', '#composerRow', '#omranBelowComposer']) {
  assert.ok(block.includes('html:not(.mobile-ui) body ' + sel + ',') || block.includes('html:not(.mobile-ui) body ' + sel + '{'), sel + ' ضمن العمود الموسّط');
}
assert.match(block, /margin-inline: var\(--om-chat-inset\) !important;/, 'التوسيط بـ!important فوق v-chat-fill');
assert.match(block, /#messages\{ padding-inline: 0 !important; scrollbar-gutter: stable both-edges; \}/, 'حاشية التمرير متناظرة');
assert.match(block, /#chatQuickChipsWrap\{\s*inset-inline-end: calc\(var\(--om-chat-inset\) \+ 14px\);/, 'الرقائق تتبع العمود');

// الجوال محميّ: كل قاعدة داخل min-width:861px ومقيّدة بـ:not(.mobile-ui)
const mediaOpen = block.indexOf('@media (min-width: 861px){');
assert.ok(mediaOpen > 0, 'استعلام الكمبيوتر موجود');
const inner = block.slice(mediaOpen + '@media (min-width: 861px){'.length).replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...inner.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
assert.ok(rules.length >= 20, 'عدد القواعد معقول: ' + rules.length);
for (const r of rules) {
  if (r.startsWith('@')) continue; // @container داخل الاستعلام — قواعده تُفحص بدورها
  for (const sel of r.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (sel === ':root') continue;
    assert.ok(/^html(\[dir="(rtl|ltr)"\])?:not\(\.mobile-ui\)/.test(sel), 'قاعدة كمبيوتر فقط: ' + sel);
  }
}
assert.ok(!/html\.mobile-ui/.test(block), 'لا قواعد جوال في الكتلة');
// لا نصّ للمستخدم داخل الكتلة يحمل اسم مزوّد
assert.ok(!/claude|gemini|groq|openai|mistral/i.test(block), 'بلا أسماء مزوّدين');

// كتلة v-topbar-merge في app-05-ui.js ما زالت تنقل الأسهم إلى الهيدر (سطر الأسهم يعتمد عليها)
assert.ok(ui.includes("wrap.id = 'omHeadCenter'"), 'نقل الأسهم إلى الهيدر قائم');

console.log('✓ layout-desktop: تخطيط «ج» محصور بالكمبيوتر، والمحادثة عمود موسّط');
