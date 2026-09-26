'use strict';
/* v-dialog-ring (لقطة المالك من الآيفون ٢٤ سبتمبر: «في الإعدادات احذف الخط الأزرق»).
   درج الإعدادات <dialog> يأخذ التركيز عند فتحه فيرسم المتصفّح حلقة التركيز الافتراضيّة (outline:auto،
   زرقاء في الآيفون). الدرج ملاصق لأعلى الشاشة ويمينها وأسفلها، فلا يظهر إلّا ضلع الحلقة الأيسر: خطّ
   أزرق بطول الشاشة. أُعيد إنتاجه بمسبار: الحوار مركَّز و:focus-visible وoutline "auto" قبل، و"none" بعد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('css/tokens.css', 'utf8');

test('١. حاوية الحوار بلا حلقة تركيز — وعناصر التحكّم داخلها تبقى بحلقاتها', () => {
  assert.match(css, /dialog:focus, dialog:focus-visible\{outline:none;\}/);
  // لا قاعدة تطفئ التركيز على كلّ ما في الحوار
  assert.doesNotMatch(css, /dialog \*\s*:focus[^{]*\{[^}]*outline:\s*none/);
  assert.doesNotMatch(css, /dialog :focus-visible\{[^}]*outline:\s*none/);
});

test('٢. حافة الدرج الأصليّة باقية (خطّ رماديّ خافت بـ--border)، والوسم رُفع', () => {
  assert.match(css, /html\.mobile-ui #settingsDialog\{[\s\S]*?border-left:1px solid var\(--border\);/);
  assert.match(fs.readFileSync('index.html', 'utf8'), /css\/tokens\.css\?v=723/);
});
