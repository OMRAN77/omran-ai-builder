// tests/panel-full.test.cjs — v-panel-full (طلب المالك: المعاينة والكود تملآن الصفحة بدل العمود الضيّق).
// الزرّ #waFullBtn بجانب زرّ الطيّ يضيف body.waFullMode؛ وفي هذا الوضع (كمبيوتر فقط) تُخفى المحادثة
// وترويستها ويمتدّ #workarea على الأعمدة 3..5 من الشبكة. الطيّ يُلغي الوضع المكبّر.
// المفتاح panelFullTitle في الأربع عشرة لغة (ar/en في app-03، والباقي في i18n/*.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('app-05-ui: زرّ التكبير يُنشأ بجانب زرّ الطيّ ويبدّل body.waFullMode', () => {
  const src = read('js/app-05-ui.js');
  assert.match(src, /fullBtn\.id = 'waFullBtn'/);
  assert.match(src, /tabs\.insertBefore\(fullBtn, btn\.nextSibling\)/);
  assert.match(src, /document\.body\.classList\.toggle\('waFullMode', on\)/);
  assert.match(src, /if\(collapsed\) setFull\(false\);/, 'الطيّ يُلغي الوضع المكبّر');
});

test('tokens.css: في الكمبيوتر تُخفى المحادثة والترويسة وتمتدّ اللوحة، والجوّال لا يرى الزرّ', () => {
  const css = read('css/tokens.css');
  assert.match(css, /#waFullBtn\{display:none;\}/, 'مخفيّ افتراضيًّا (الجوّال)');
  assert.match(css, /html:not\(\.mobile-ui\) body\.waFullMode #chatcol/);
  assert.match(css, /html:not\(\.mobile-ui\) body\.waFullMode > header/);
  assert.match(css, /body\.waFullMode #workarea\{grid-column:3 \/ 6 !important/);
});

test('panelFullTitle مترجم في الأربع عشرة لغة', () => {
  const app03 = read('js/app-03-i18n-data.js');
  const occurrences = app03.match(/panelFullTitle: '[^']+'/g) || [];
  assert.equal(occurrences.length, 2, 'عربي وإنجليزي في app-03');
  const dir = path.join(root, 'i18n');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const withKey = files.filter((f) => /panelFullTitle"?: ["'][^"'\n]+["']/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  // i18n/ad-studio.js ليس ملف لغة واجهة (لا copyMsgTitle فيه)، فالمرجع الصحيح هو ملفّات copyMsgTitle نفسها
  const langFiles = files.filter((f) => /copyMsgTitle/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.equal(withKey.length, langFiles.length, 'كلّ ملفّ لغة يحمل المفتاح');
  assert.equal(withKey.length + 2, 14, 'ملفّان في app-03 + ١٢ ملفّ = ١٤ لغة');
});
