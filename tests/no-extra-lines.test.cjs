'use strict';
/* v-no-extra-lines (لقطات المالك ١٧ أكتوبر): «المربّعات الزايدة والخطوط الزايدة ما أريدها في التطبيق» —
   مربّعات سوداء بحدّ ذهبيّ فوق نقاط بوستر الديكور، خطّ تحت رأس معرض أنماط الصور، وحدّ متقطّع لتبويب «مخرج التطبيق». */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('١. بوستر الديكور: الغلاف om3-skip فلا يصنّف المصنّف أزراره الشفّافة، ويُعاد الوسم بعد انتهاء الانتقال', () => {
  const studios = read('js/app-12-studios.js');
  assert.ok(/wrap\.className = 'om3-skip'/.test(studios), 'غلاف البوستر يُستثنى من الألوان الثلاثة');
  const three = read('js/app-41-three-colors.js');
  assert.ok(/addEventListener\('transitionend'/.test(three), 'إعادة الوسم بعد transitionend (الحدّ الشفّاف أثناء الانتقال كان يُقرأ ذهبيًّا)');
});

test('٢. رأس معرض أنماط الصور بلا خطّ سفليّ في الوضع الأسود', () => {
  const css = read('css/أدوات-أسود.css');
  const block = css.split('}').find((b) => b.includes('#portraitStyleSheetHeader'));
  assert.ok(block && /border-bottom:0 !important;$/.test(block.trim()), 'border-bottom:0');
});

test('٣. تبويب «مخرج التطبيق» بلا حدّ متقطّع، والوسم مرفوع', () => {
  const css = read('css/modules.css');
  const rule = css.match(/#videoMakerModal \.vmk-tab\.vmk-tab-noimg\{[^}]*\}/);
  assert.ok(rule && !/dashed/.test(rule[0]), 'لا dashed');
  const tag = read('index.html').match(/css\/modules\.css\?v=(\d+)/);
  assert.ok(tag && Number(tag[1]) >= 683, 'الوسم مرفوع فوق 682 الذي شحن القاعدة المتقطّعة');
});

test('٤. صور الديكور الـ٨٥ المعاد توليدها بوسم أعلى من 2 (وسم main) فلا تبقى القديمة في الذاكرة', () => {
  const m = read('js/design-sels.js').match(/decor-opts\/'\+OPT_FILE\[id\]\+'-'\+v\+'\.webp\?v=(\d+)'/);
  assert.ok(m && Number(m[1]) >= 3, 'وسم decor-opts مرفوع');
});
