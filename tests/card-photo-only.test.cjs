'use strict';
/* v-card-photo-only (المالك ١٧ أكتوبر بلقطة صفحة الأدوات: «في الأدوات كلها … تحذف الصور التحتية وتكون الصور الي فوق فقط»، واختار «صورة البطاقة
   في صفحة الأدوات»): بطاقة الأداة صورتها وحدها — الشريط تحت الصورة (العنوان والوصف والسهم) لا يُعرض شريطًا، واسم الأداة نصّ فوق أسفل الصورة.
   الشكلان: لوحة الأدوات (#sectionsToolsPopup، ومنها «عرض الكل» الذي ينقل الشبكة نفسها) وشبكة الرئيسيّة (.hwToolCard). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const block = (css, marker) => { const i = css.indexOf(marker); assert.ok(i >= 0, 'مقطع مفقود: ' + marker); return css.slice(i); };

test('١ لوحة الأدوات: الاسم طبقة فوق أسفل الصورة، والوصف والسهم لا يظهران، والوضع الفاتح لا يعيد الشريط', () => {
  const css = block(read('css/tool-card-images.css'), 'v-card-photo-only');
  assert.match(css, /\.btn\.hasToolPhoto\.hasToolPhoto \.tcMeta,[\s\S]*?position:absolute; inset:auto 0 0 0;/, 'الشريط صار طبقة فوق أسفل الصورة');
  assert.match(css, /linear-gradient\(to top, rgba\(0,0,0,\.8\)/, 'تدرّج خفيف للقراءة لا خلفيّة مصمتة');
  assert.match(css, /\.btn\.hasToolPhoto\.hasToolPhoto \.tcSub\{display:none!important;\}/, 'الوصف لا يظهر (السهم غير موجود أصلًا في هذه البطاقات)');
  assert.match(css, /html\[data-mode="light"\]:not\(\.mobile-ui\):not\(\.bgimg\) #sectionsToolsPopup \.ptGrid \.btn\.hasToolPhoto\.hasToolPhoto \.tcMeta\{/, 'يغلب #fdf8ec في إطارات.css');
  const fr = read('css/إطارات.css');
  assert.match(fr, /html\[data-mode="light"\]:not\(\.mobile-ui\):not\(\.bgimg\) #sectionsToolsPopup \.ptGrid \.btn\.hasToolPhoto \.tcMeta\{ background:#fdf8ec !important; \}/, 'القاعدة التي يغلبها التكرار ما زالت كما هي');
  // الصورة بنسبتها بلا تشويه (قاعدة الصور في CLAUDE.md)
  assert.match(read('css/tool-card-images.css'), /img\.stp3d\.toolPhotoImage\{[^}]*object-fit:cover!important/);
});

test('٢ شبكة الرئيسيّة (.hwToolCard): الشكل نفسه', () => {
  const css = block(read('css/redesign.css'), 'v-card-photo-only');
  assert.match(css, /\.hwToolCard \.tcMeta,\s*html\[data-mode="light"\] \.hwToolCard \.tcMeta\{[\s\S]*?position:absolute; inset:auto 0 0 0;/);
  assert.match(css, /\.hwToolCard \.tcSub,\.hwToolCard \.tcArrow\{display:none !important;\}/);
});

test('٣ النصّ باقٍ في الصفحة بالـ14 لغة (الاسم لا يُحذف من الشجرة)، والأوسمة مرفوعة', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('class="tcMeta"') > 0 && html.indexOf('data-i18n="omranEduTitle"') > 0, 'الاسم نصّ مترجم كما هو');
  const tag = (s, name) => { const i = s.indexOf(name); assert.ok(i >= 0, name); return Number((/v=(\d+)/.exec(s.slice(i, i + 40)) || [])[1] || 0); };
  assert.ok(tag(html, 'css/redesign.css') >= 692, 'redesign.css');
  assert.ok(tag(html, '/js/ui-wiring.js') >= 662, 'ui-wiring.js');
  assert.ok(tag(read('js/ui-wiring.js'), '/css/tool-card-images.css') >= 23, 'tool-card-images.css');
});
