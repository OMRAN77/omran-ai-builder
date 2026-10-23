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
    // v-ownerbar-pill (تدقيق ١٨ أكتوبر): تحت الهيدر بعرض الشاشة كان ما زال يغطّي صفّ «إبداع» و«محادثة جديدة» —
    // صار كبسولة مثبّتة أسفل الطرف، فلا top أصلًا ولا يجلس فوق الهيدر ولا تحته (tests/owner-healthbar.test.cjs يفحص سلوكها).
    assert.match(
      src,
      /bar\.style\.cssText = 'position:fixed;bottom:' \+ bottom \+ 'px;inset-inline-end:12px;z-index:99999;/,
      'الكبسولة أسفل الطرف لا أعلى الشاشة'
    );
    assert.doesNotMatch(src, /bar\.style\.cssText = 'position:fixed;top:/, 'لا top لشريط المالك');
  }
});
