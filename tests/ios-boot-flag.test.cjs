'use strict';
/* v-ios-boot-flag (فحص ١١ أكتوبر، أمر المالك «الآيفون: سطر واحد يرجّع العلامة»): حارس إقلاع الآيفون (js/selfdiag.js) يعدّ
   الإقلاع مكتملًا بعلامتين: __omranBootOk (ui-wiring) و__omranBundleOk. ضابط الثانية حُذف مع app-24-visual-guide (٢ سبتمبر)
   فصار كلّ فتح على الآيفون يُسجَّل «إقلاع ناقص bundle=false» ويُعاد تحميله قسرًا بعد ٥ ثوانٍ — ويخفي الإقلاع المعطوب حقًّا.
   الآن آخر شريحة في الحزمة (app-99-boot-ok) تضبطها: وصولها = الحزمة نُفّذت كاملة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. app-99-boot-ok آخر الأجزاء ترتيبًا، والحزمة تنتهي بضبط العلامة', () => {
  const parts = fs.readdirSync(path.join(root, 'js')).filter((f) => /^app-\d\d-.+\.js$/.test(f)).sort();
  assert.equal(parts[parts.length - 1], 'app-99-boot-ok.js');
  const lines = read('js/app.bundle.js').trim().split('\n');
  assert.equal(lines[lines.length - 1].trim(), 'window.__omranBundleOk = true;');
  const w = {}; vm.runInNewContext(read('js/app-99-boot-ok.js'), { window: w });
  assert.equal(w.__omranBundleOk, true);
});

test('٢. الحارس يشترط العلامتين معًا، والعلامة لا تُضبط في غير الشريحة الأخيرة', () => {
  assert.ok(read('js/selfdiag.js').includes('var bootDone = window.__omranBootOk === true && window.__omranBundleOk === true;'));
  const setters = fs.readdirSync(path.join(root, 'js')).filter((f) => /^app-\d\d-.+\.js$/.test(f) && /__omranBundleOk\s*=\s*true/.test(read('js/' + f)));
  assert.deepEqual(setters, ['app-99-boot-ok.js'], 'ضابط واحد في آخر الحزمة — وإلّا صار الإقلاع الناقص «مكتملًا»');
});
