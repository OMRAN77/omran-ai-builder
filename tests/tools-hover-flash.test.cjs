'use strict';
/* v-tools-hover-flash (المالك ٢٤ أكتوبر بلقطة صفحة الأدوات: «عندما احرك الماوس عليها تتحرك… اريدها توميض بدون حركة»): بطاقة الأداة
   لا تتحرّك عند المرور (كان translateY(-2px))، والمرور ومضة على حوافّها في ::after. الومضة ليست على البطاقة نفسها: app-41 يعيد تصنيفها
   عند transitionend، وعنصر عليه animation ليس «خطًّا» عنده، فكانت تفقد om3-line ويعود حدّها الذهبيّ (قِيس بمسبار Playwright). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CSS = read('css/tool-card-images.css');
const block = () => { const i = CSS.indexOf('v-tools-hover-flash'); assert.ok(i >= 0, 'مقطع v-tools-hover-flash مفقود'); return CSS.slice(i); };
const SEL = 'html #sectionsToolsPopup .ptGrid .btn.hasToolPhoto.hasToolPhoto';
const rule = (css, sel) => { const i = css.indexOf(sel + '{'); assert.ok(i >= 0, 'قاعدة مفقودة: ' + sel); return css.slice(i, css.indexOf('}', i) + 1); };

test('١ المرور بلا حركة: transform:none!important يغلب translateY في القاعدة القديمة وفي tokens.css', () => {
  const b = block();
  assert.match(rule(b, SEL + ':hover'), /transform:none!important/);
  // التكرار .hasToolPhoto.hasToolPhoto أعلى تحديدًا من قاعدة الرفع القديمة (#… .ptGrid .btn.hasToolPhoto:hover)
  assert.match(CSS, /#sectionsToolsPopup \.ptGrid \.btn\.hasToolPhoto:hover\{[^}]*translateY\(-2px\)/, 'القاعدة القديمة ما زالت تُغلب لا تُحذف');
});

test('٢ الومضة في ::after تشتدّ ثمّ تستقرّ، والبطاقة نفسها بلا animation (وإلّا يُسقط app-41 صنف om3-line)', () => {
  const b = block();
  const after = rule(b, SEL + '::after');
  assert.match(after, /content:""; position:absolute; inset:0;[^}]*pointer-events:none; opacity:0;/);
  assert.match(after, /box-shadow:inset 0 0 0 1px rgba\(var\(--tcFlashRgb\),\.9\), inset 0 0 26px rgba\(var\(--tcFlashRgb\),\.5\)/);
  assert.match(rule(b, SEL + ':hover::after'), /animation:tcFlash \.7s ease-out both/);
  assert.match(b, /@keyframes tcFlash\{0%\{opacity:0;\} 40%\{opacity:1;\} 100%\{opacity:\.55;\}\}/);
  assert.doesNotMatch(rule(b, SEL + ':hover'), /animation/, 'لا animation على البطاقة');
  assert.match(read('js/app-41-three-colors.js'), /if\(cs\.animationName && cs\.animationName !== 'none'\) return false;/, 'سبب نقلها إلى ::after ما زال قائمًا');
});

test('٣ الأسود أبيض، والفاتح ذهبيّ، وتقليل الحركة توهّج ثابت', () => {
  const b = block();
  assert.match(rule(b, SEL + '::after'), /--tcFlashRgb:255,255,255;/);
  assert.match(b, /html\[data-mode="light"\] #sectionsToolsPopup \.ptGrid \.btn\.hasToolPhoto\.hasToolPhoto::after\{--tcFlashRgb:212,175,55;\}/);
  assert.match(b, /@media \(prefers-reduced-motion:reduce\)\{\s*html #sectionsToolsPopup \.ptGrid \.btn\.hasToolPhoto\.hasToolPhoto:hover::after\{animation:none; opacity:\.55;\}/);
});

test('٤ وسوم الكاش مرفوعة', () => {
  const tag = (s, name) => { const i = s.indexOf(name); assert.ok(i >= 0, name); return Number((/v=(\d+)/.exec(s.slice(i, i + 40)) || [])[1] || 0); };
  assert.ok(tag(read('js/ui-wiring.js'), '/css/tool-card-images.css') >= 25, 'tool-card-images.css');
  assert.ok(tag(read('index.html'), '/js/ui-wiring.js') >= 667, 'ui-wiring.js');
});
