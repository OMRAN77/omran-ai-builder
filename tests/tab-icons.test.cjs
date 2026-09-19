// v-tab-icons (طلب المالك): تبويبا لوحة العمل «المعاينة»/«الكود» صارا أيقونتين خطّيّتين
// (شاشة للمعاينة، أقواس كود </> للكود) بدل الكلمتين، وشريطهما بلون صندوق الكتابة #101013.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('index.html: تبويبا المعاينة/الكود أيقونتان (SVG) بلا نصّ، والنصّ في title + aria-label بمفتاح الترجمة', () => {
  const html = read('index.html');
  // المعاينة: لا نصّ عربيّ داخل الوسم، بل SVG؛ والترجمة على العنوان لا على المحتوى (كي لا تُمسح الأيقونة)
  const prev = /<div class="tab active" data-tab="preview" data-i18n-title="preview" data-i18n="\[aria-label\]preview" title="المعاينة" aria-label="المعاينة"><svg[\s\S]*?<\/svg><\/div>/;
  const code = /<div class="tab" data-tab="code" data-i18n-title="code" data-i18n="\[aria-label\]code" title="الكود" aria-label="الكود"><svg[\s\S]*?<\/svg><\/div>/;
  assert.match(html, prev, 'تبويب المعاينة أيقونة مع title/aria مترجمين');
  assert.match(html, code, 'تبويب الكود أيقونة مع title/aria مترجمين');
  // لا نصّ حرفيّ للتبويبين (المحتوى صار أيقونة فقط)
  assert.doesNotMatch(html, /data-i18n="preview">المعاينة</, 'لم يبقَ نصّ «المعاينة» داخل التبويب');
  assert.doesNotMatch(html, /data-i18n="code">الكود</, 'لم يبقَ نصّ «الكود» داخل التبويب');
});

test('css/tokens.css: شريط #tabs بلون صندوق الكتابة #101013، والحزمة رفعت وسم الكاش', () => {
  const css = read('css/tokens.css');
  assert.match(css, /#tabs\{display:flex; background:#101013;\}/, 'خلفية الشريط = #101013');
  // نفس لون صندوق الكتابة في redesign.css
  const redesign = read('css/redesign.css');
  assert.match(redesign, /html #composerBox\{\s*background:#101013 !important;/, 'صندوق الكتابة لونه #101013 (المرجع)');
  assert.ok(read('index.html').includes('css/tokens.css?v=701'), 'وسم كاش tokens.css رُفع');
});

test('js/app-05-ui.js: تبديل التبويب يعتمد data-tab لا نصّ التبويب', () => {
  const js = read('js/app-05-ui.js');
  assert.match(js, /\$\('#panel-' \+ tab\.dataset\.tab\)\.classList\.add\('active'\)/, 'التفعيل عبر dataset.tab');
});
