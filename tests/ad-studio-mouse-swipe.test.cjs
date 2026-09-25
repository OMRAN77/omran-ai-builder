'use strict';
/* v-adst-mouse-swipe (شكوى المالك ٢٥ سبتمبر: «في الإعلانات مافي سحب إلى الصفحة التي قبلها، رجوع»).
   استوديو الإعلانات صفحة مستقلّة بنسختها الخاصّة من السحب، وكانت باللمس وحده — بينما التطبيق
   يسحب بالفأرة أيضًا (js/app-05-swipe-back.js، بعد سؤال المالك ٤ سبتمبر «في الكمبيوتر ما فيها سحب»).
   وزرّ «رجوع إلى التطبيق» مخفيّ بأمر المالك، فلم يبقَ على الحاسوب إلّا Esc. مسار الفأرة أُضيف هنا،
   وثلاثة أشياء تُحرَس: أن يوجد أصلًا، وألّا يتنازع مع سحب عناصر اللوحة، وألّا تُحتسب نقرةُ ما بعد السحب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('ad-studio.html', 'utf8');
const swipe = html.slice(html.indexOf('v-swipe-back'));
assert.ok(swipe.length > 500, 'كتلة السحب غير موجودة في الصفحة');

test('١. للحاسوب مسار سحب بالفأرة يرجع إلى الأدوات', () => {
  ['mousedown', 'mousemove', 'mouseup'].forEach((ev) =>
    assert.match(swipe, new RegExp("addEventListener\\('" + ev + "'"), 'ينقص مستمع ' + ev));
  const mouseup = swipe.slice(swipe.indexOf("addEventListener('mouseup'"));
  assert.match(mouseup.slice(0, 600), /location\.href='\/\?tools=1'/, 'سحب الفأرة لا يعود إلى الأدوات');
});

test('٢. سحب الفأرة يوافق سحب اللمس: لليمين فقط، وثلث العرض أو نفضة سريعة', () => {
  const mouse = swipe.slice(swipe.indexOf('v-adst-mouse-swipe'));
  assert.match(mouse, /if\(dx<=0\)\{m0=null;return;\}/, 'السحب لليسار ليس رجوعًا');
  assert.match(mouse, /dx>w\*0\.35\|\|\(dt<300&&dx>70\)/, 'عتبة الخروج تخالف عتبة اللمس');
  assert.match(mouse, /Math\.abs\(dx\)<14\|\|Math\.abs\(dx\)<Math\.abs\(dy\)\*1\.4/, 'لا حارس للتمرير الرأسيّ');
});

test('٣. عناصر اللوحة المسحوبة والمربّع الحرّ مستثناة من سحب الصفحة', () => {
  const mb = swipe.slice(swipe.indexOf('function mBlocked'), swipe.indexOf('function mBlocked') + 700);
  assert.match(mb, /contains\('drg'\)/, 'سحب عنصر اللوحة سيجرّ الصفحة معه');
  assert.match(mb, /contains\('fbx'\)/, 'سحب المربّع الحرّ سيجرّ الصفحة معه');
  assert.match(mb, /isContentEditable/, 'الكتابة داخل النصّ تبدأ سحبًا');
  /* هذان الصنفان موجودان فعلًا في مولّد اللوحة — استثناء اسم ميت لا يحمي شيئًا */
  assert.match(html, /class="fbx"/, 'صنف المربّع الحرّ تغيّر ولم يتبعه الاستثناء');
  assert.match(html, /\.closest\('\.drg'\)/, 'صنف عنصر السحب تغيّر ولم يتبعه الاستثناء');
});

test('٤. النقرة التي تلي سحبًا بالفأرة لا تُحتسب', () => {
  const mouse = swipe.slice(swipe.indexOf('v-adst-mouse-swipe'));
  assert.match(mouse, /mGuard=Date\.now\(\)\+\d+/, 'لا حارس بعد السحب');
  assert.match(mouse, /addEventListener\('click',function\(e\)\{if\(Date\.now\(\)<mGuard\)/, 'الحارس غير مربوط بالنقر');
  assert.match(mouse, /\},true\);/, 'حارس النقر ليس في طور الالتقاط فيسبقه محرّر النصّ');
});
