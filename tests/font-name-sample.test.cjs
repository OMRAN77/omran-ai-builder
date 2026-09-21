// v-font-name-sample (طلب المالك): بطاقات «نوع الخط» تعرض اسم الخطّ مكتوبًا بخطّه فقط —
// بلا عيّنة «عمران AI» وبلا الليبل الرماديّ الصغير (.ofp-name).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

for (const f of ['js/app-19-fonts.js', 'js/app.bundle.js']) {
  test(`${f}: العيّنة = اسم الخطّ بخطّه، بلا «عمران AI» وبلا .ofp-name`, () => {
    const s = read(f);
    // لم يعد يُكتب «عمران AI» كعيّنة ثابتة
    assert.doesNotMatch(s, /preview\.textContent = 'عمران AI'/, 'أُزيلت عيّنة «عمران AI» الثابتة');
    // العيّنة الآن اسم الخطّ (ar/en) في render وفي sync
    assert.match(s, /preview\.textContent = isArabic\(\) \? font\.ar : font\.en;/, 'render يعرض الاسم بخطّه');
    assert.match(s, /var preview = card\.querySelector\('\.ofp-preview'\);\s*if\(preview\) preview\.textContent = ar \? font\.ar : font\.en;/, 'sync يحدّث الاسم حسب اللغة');
    // لم يعد يُنشأ عنصر الليبل الرماديّ .ofp-name
    assert.doesNotMatch(s, /className = 'ofp-name'/, 'أُزيل الليبل الرماديّ .ofp-name');
  });
}
