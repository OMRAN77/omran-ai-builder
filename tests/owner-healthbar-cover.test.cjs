// v-ownerbar-cover (بلاغ المالك «شريط الأسهم غير موجود»):
// شريط تنبيه صحّة النظام للمالك كان position:fixed;top:0 بـz-index:99999 —
// أعلى من الهيدر الثابت (position:sticky;top:0;z-index:900) فيغطّيه بالكامل
// (شريط الأسهم وكل أزرار الهيدر) بصمت، والمالك لا يرى ✕ ليقفله. الحل: top
// يُحسَب من أسفل الهيدر الفعليّ بدل ٠ ثابت، فيظهر الشريط تحته لا فوقه —
// بلا مساس بشبكة body (CSS Grid) نفسها (قرار عمران ١٣ سبتمبر، خارج نطاق هذا البند).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('v-ownerbar-cover: شريط تنبيه صحّة المالك يُحسَب تحت الهيدر لا فوقه بصمت', () => {
  const js = read('js/app-11-video.js');
  const bundle = read('js/app.bundle.js');
  for (const src of [js, bundle]) {
    // لا يبقى top:0 ثابتًا يجلس فوق الهيدر (z-index أعلى من ٩٠٠) بصمت
    assert.doesNotMatch(
      src,
      /position:fixed;top:0;left:0;right:0;z-index:99999;background:#3a1010/,
      'لا top:0 ثابت يغطّي الهيدر'
    );
    // الارتفاع يُحسَب من موضع الهيدر الفعليّ
    assert.match(
      src,
      /getBoundingClientRect\(\)\.bottom.*headerBottom|headerBottom\s*=[\s\S]{0,120}getBoundingClientRect\(\)\.bottom/,
      'top يُحسَب من أسفل الهيدر'
    );
    assert.match(
      src,
      /position:fixed;top:'\s*\+\s*headerBottom\s*\+\s*'px/,
      'الشريط يستعمل الإزاحة المحسوبة لا صفرًا ثابتًا'
    );
  }
});
