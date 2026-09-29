'use strict';
/* v-perf-boot-defer (المالك ٢٩ سبتمبر: «الشاشة تتأخر وتعلّق أو مادخل ويتأخر عند الدخول اول شي… مافيها سهولة
   التنقّل والأدوات سريعة»). قياس محلّي: ٣٤٨مل ثانية مهمّة واحدة تحجز الخيط الرئيسي لحظة جهوزيّة الصفحة عند
   التحميل الأوّل. الجذر الأكبر: خمسة سكربتات (٣٢٧ك) غير مؤجَّلة تحجب تحليل HTML بالكامل قبل ظهور أيّ واجهة،
   رغم أنّ كودها مكتوب أصلًا بمسار آمن للتأجيل (readyState==='loading' ← document.write، وإلّا fragment+insertBefore).
   selfdiag.js وحده يبقى متزامنًا عمدًا: يضبط classList('store-safe') قبل أن يرسم app.bundle.js أي واجهة ماليّة
   (سوق الأسهم، المحفظة) — تأجيله يفتح نافذة فلاش لتلك الواجهة على نسخة هواوي (راجع tests/hw-tools-grid.test.cjs
   الاختبار ١ الذي يفرض العكس). ورابط خطوط جوجل كان <link rel=stylesheet> عاديًّا بلا مهلة: تعذّر الوصول لجوجل
   يعلّق الإقلاع كلّه؛ صار غير حاجب (نمط loadCSS) مع احتياط noscript. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const HTML = fs.readFileSync('index.html', 'utf8');

function tag(file) {
  const m = HTML.match(new RegExp('<script[^>]*src="/js/' + file.replace('.', '\\.') + '\\?v=[^"]*"[^>]*></script>'));
  assert.ok(m, `وسم ${file} غير موجود في index.html`);
  return m[0];
}

test('١. الأربعة الحاجبة صارت defer: partials-core وdesign-sels وdesign-gen وpartials-settings', () => {
  for (const f of ['partials-core.js', 'design-sels.js', 'design-gen.js', 'partials-settings.js']) {
    assert.match(tag(f), /^<script defer /, `${f} يجب أن يكون defer`);
  }
});

test('٢. selfdiag.js يبقى متزامنًا عمدًا (بوّابة store-safe تسبق app.bundle.js — راجع hw-tools-grid)', () => {
  assert.doesNotMatch(tag('selfdiag.js'), /^<script defer /, 'selfdiag لا يصير defer — يكسر بوّابة هواوي');
});

test('٣. ترتيب المستند: الأربعة المؤجَّلة الجديدة قبل app.bundle.js (defer ينفّذ بترتيب المستند)', () => {
  const bundlePos = HTML.indexOf('/js/app.bundle.js?v=');
  assert.ok(bundlePos > 0, 'app.bundle.js موجود');
  for (const f of ['partials-core.js', 'design-sels.js', 'design-gen.js', 'partials-settings.js']) {
    assert.ok(HTML.indexOf('/js/' + f + '?v=') < bundlePos, `${f} يجب أن يسبق app.bundle.js في المستند`);
  }
});

test('٤. خط جوجل غير حاجب (نمط loadCSS) مع احتياط noscript، وpreconnect ثانٍ لـfonts.gstatic.com', () => {
  assert.match(HTML, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]+" media="print" onload="this\.media='all'">/, 'رابط الخط media=print + onload');
  assert.match(HTML, /<noscript><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=[^"]+"><\/noscript>/, 'احتياط noscript لخط جوجل');
  assert.match(HTML, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/, 'preconnect لـfonts.gstatic.com');
});

test('٥. لا document.write حرفيّ إضافيّ ولا تغيير في محتوى الأجزاء المنقولة — دفع الوسم وحده', () => {
  // partials-core.js وpartials-settings.js ما زالا يحتويان مسار fragment+insertBefore الآمن أصلًا للتأجيل
  const core = fs.readFileSync('js/partials-core.js', 'utf8');
  const settings = fs.readFileSync('js/partials-settings.js', 'utf8');
  assert.match(core, /insertBefore\(f, S \|\| null\)/, 'partials-core.js يحمل مسار الإدراج الآمن');
  assert.match(settings, /insertBefore\(f, S \|\| null\)/, 'partials-settings.js يحمل مسار الإدراج الآمن');
});
