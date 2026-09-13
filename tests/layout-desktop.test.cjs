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

// الهيدر سطران والأسهم آخرًا
assert.match(block, /body > header\{ flex-wrap: wrap;/, 'الهيدر يلتفّ سطرين');
assert.match(block, /#omHeadCenter\{ order: 1; flex: 0 0 100%; width: 100%; \}/, 'الأسهم سطر كامل تحت الشعار');

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
  for (const sel of r.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (sel === ':root') continue;
    assert.ok(sel.startsWith('html:not(.mobile-ui)'), 'قاعدة كمبيوتر فقط: ' + sel);
  }
}
assert.ok(!/html\.mobile-ui/.test(block), 'لا قواعد جوال في الكتلة');
// لا نصّ للمستخدم داخل الكتلة يحمل اسم مزوّد
assert.ok(!/claude|gemini|groq|openai|mistral/i.test(block), 'بلا أسماء مزوّدين');

// كتلة v-topbar-merge في app-05-ui.js ما زالت تنقل الأسهم إلى الهيدر (سطر الأسهم يعتمد عليها)
const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');
assert.ok(ui.includes("wrap.id = 'omHeadCenter'"), 'نقل الأسهم إلى الهيدر قائم');

console.log('✓ layout-desktop: تخطيط «ج» محصور بالكمبيوتر، والمحادثة عمود موسّط');
