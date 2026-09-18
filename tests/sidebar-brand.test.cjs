// v-sidebar-brand (١٨ سبتمبر ٢٠٢٦): الشعار الذهبيّ في رأس القائمة الجانبيّة وزرّ «محادثة جديدة» تحته —
// سطح المكتب فقط، والجوّال يبقي شعار الرأس كما هو، والشعار يتبع اللغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('index.html: الشعار أوّل عنصر في القائمة الجانبيّة قبل زرّ المحادثة الجديدة، مع مرآة شعار الرأس', () => {
  const html = read('index.html');
  const sb = html.indexOf('<div id="sidebar" style="background:#000;">');
  const brand = html.indexOf('<div id="sidebarBrand" class="sidebarBrand"', sb);
  const mirror = html.indexOf("s.innerHTML=b.innerHTML", sb);
  const btn = html.indexOf('<button type="button" id="omranNewChatBtn">', sb);
  assert.ok(sb > 0 && brand > sb && mirror > brand && btn > mirror, 'الترتيب: sidebar → sidebarBrand → مرآة → omranNewChatBtn');
  assert.match(html, /<div id="sidebarBrand" class="sidebarBrand" title="عمران AI"><img src="icons\/brand-ar\.png" alt="عمران Ai" class="brandImg" width="126" height="42"><\/div>/);
  assert.ok(html.includes('<span id="brandTitle" class="brandTitle brand-ar">'), 'شعار الرأس باقٍ للجوّال');
  assert.ok(html.includes('css/redesign.css?v=667'), 'وسم الكاش رُفع');
});

test('redesign.css: يظهر على سطح المكتب فوق الزرّ (order:-3) ويخفي شعار الرأس هناك، ومخفيّ على الجوّال', () => {
  const css = read('css/redesign.css');
  assert.match(css, /#sidebarBrand\{display:none;\}/);
  assert.match(css, /html:not\(\.mobile-ui\) #sidebarBrand\{order:-3; display:flex;/);
  assert.match(css, /html:not\(\.mobile-ui\) header h1 #brandTitle\{display:none;\}/);
  assert.doesNotMatch(css, /html\.mobile-ui #sidebarBrand\{[^}]*display:(?:flex|block)/, 'لا إظهار على الجوّال');
  assert.match(css, /#omranNewChatBtn\{order:-2;/, 'الزرّ يبقى بعد الشعار مباشرة');
  // شريط الأسهم: الفراغ يُحجز فوق الشعار لا فوق الزرّ
  assert.match(css, /html:not\(\.mobile-ui\) body:has\(#stockTicker[^)]*\) #sidebarBrand\{margin-top:28px;\}/);
});

test('app-10 + الحزمة: تبديل اللغة يعكس الشعار في القائمة ويعطيه نقرة الرأس', () => {
  for (const f of ['js/app-10-features.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.match(s, /const sb = document\.getElementById\('sidebarBrand'\);\n\s+if\(sb\)\{ sb\.innerHTML = bt\.innerHTML; if\(h1 && !sb\.onclick\) sb\.onclick = h1\.onclick; \}/, f);
  }
});
