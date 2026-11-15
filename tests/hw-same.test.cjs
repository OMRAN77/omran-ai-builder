// tests/hw-same.test.cjs — v-hw-same + v-hw-tools-smooth (المالك ١٥ نوفمبر: «رجعلي تطبيق هواوي نفس التطبيقات الباقية — شي من المحادثة
// الصور — وشوفه ليش ثقيل زيادة عند المرور في الأدوات»).
// ١) محادثة هواوي كانت تعرض بطاقات صور (التعليم، أنماط الصور، القبلة) وزرّ الأدوات فوق المحادثة الفارغة، وبقيّة التطبيقات لا: قاعدة الإظهار حُذفت.
// ٢) تمرير الأدوات تحت رسم هواوي البرمجيّ: انتقالات البطاقة ومصنّف الألوان الثلاثة يتغذّيان (٨ جولات لكلّ بطاقة في السحبة) — لا انتقالات
//    داخل المربّع تحت html.omCpu. المسبار .shots/hw-scroll/probe.mjs: رسم ٨٣←١٧ م‌ث، طلاء ١٨٠←٢٤، إطارات ساقطة ٢٤←١٢.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. لا قاعدة تُظهر بطاقات هواوي في المحادثة: مخفيّة في كلّ مكان كبقيّة التطبيقات', () => {
  const css = read('css/redesign.css');
  assert.ok(css.includes('#huaweiHeroWrap{display:none !important;}'), 'الإخفاء الافتراضيّ باقٍ');
  assert.doesNotMatch(css, /#huaweiHeroWrap\s*\{[^}]*display\s*:\s*(flex|block|grid)/, 'لا قاعدة إظهار في أيّ مكان');
  for (const f of ['js/app-04-i18n-state.js', 'js/ui-wiring.js', 'js/app-09-attach.js']) {
    assert.doesNotMatch(read(f), /huaweiHeroWrap[\s\S]{0,200}setProperty\('display', '(flex|block)'/, f + ': لا إظهار من الكود');
  }
});

test('٢. مربّع الأدوات عند الفتح لهاتف هواوي باقٍ (v-hw-tour-phone، طلب المالك ٦ نوفمبر)', () => {
  const sd = read('js/selfdiag.js');
  assert.ok(sd.includes("o.classList.add('show');") && sd.includes('__hwPhone'));
});

test('٣. تحت رسم هواوي البرمجيّ وحده: لا انتقالات داخل مربّع الأدوات (المربّع وعناصره وما قبلها وما بعدها)', () => {
  const css = read('css/tool-card-images.css');
  const rule = /html\.omCpu #sectionsToolsPopup,\s*html\.omCpu #sectionsToolsPopup \*,\s*html\.omCpu #sectionsToolsPopup \*::before,\s*html\.omCpu #sectionsToolsPopup \*::after\{transition:none!important;\}/;
  assert.match(css, rule);
  // البوّابة omCpu لهواوي وحده: جسر «cpu» أو هويّة هواوي بلا جسر (index.html قبل أوّل رسم)
  assert.match(read('index.html'), /if \(\(m && m !== 'gpu'\) \|\| \(!R && hw\)\) document\.documentElement\.classList\.add\('omCpu'\);/);
  // الحاسوب وبقيّة الهواتف بانتقالاتها: كلّ محدِّد في قاعدة v-hw-tools-smooth يبدأ بـhtml.omCpu
  const block = css.slice(css.indexOf('v-hw-tools-smooth'));
  const sel = block.slice(block.indexOf('*/') + 2, block.indexOf('{transition:none!important;}'));
  assert.ok(sel.split(',').every((x) => x.trim().startsWith('html.omCpu ')), sel);
});

test('٤. الوسوم رُفعت فلا يبقى هاتف على الأنماط القديمة (تُقرأ من الملفّات، لا تُثبَّت حرفيًّا)', () => {
  const html = read('index.html');
  const num = (src, re) => Number((re.exec(src) || [])[1]);
  assert.ok(num(html, /redesign\.css\?v=(\d+)/) >= 700, 'redesign');
  assert.ok(num(html, /ui-wiring\.js\?v=(\d+)/) >= 670, 'ui-wiring');
  assert.ok(num(read('js/ui-wiring.js'), /tool-card-images\.css\?v=(\d+)/) >= 26, 'tool-card-images');
});
