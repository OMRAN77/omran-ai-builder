'use strict';
/* v-decor-hover-flash (المالك ٢٤ أكتوبر بلقطة الديكور: «هذي الاربعه تؤميض عند الحركه مع تفحص الديكورات من الصفر»):
   (١) بطاقات «لمسات ديكوريّة إضافيّة» الأربع (proToggle في design-sels.js) تومض عند المرور كبطاقات صفحة الأدوات، بلا حركة، وللفأرة وحدها.
   (٢) الفحص من الصفر وجد سطر اسم الملفّ أسفل لوحة رفع الديكور رماديًّا بظلّ أسود على رخام أبيض — صار بنّيًّا داكنًا يُقرأ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const block = (css, marker) => { const i = css.indexOf(marker); assert.ok(i >= 0, 'مقطع مفقود: ' + marker); return css.slice(i); };
const rule = (css, sel) => { const i = css.indexOf(sel + '{'); assert.ok(i >= 0, 'قاعدة مفقودة: ' + sel); return css.slice(i, css.indexOf('}', i) + 1); };
const C = '#designAiModal [data-dtoggle]';

test('١ الومضة في ::after للبطاقات الأربع، للفأرة وحدها، بلا حركة ولا animation على البطاقة نفسها', () => {
  const b = block(read('css/modules.css'), 'v-decor-hover-flash');
  const mq = b.indexOf('@media (hover:hover) and (pointer:fine){');
  assert.ok(mq >= 0 && mq < b.indexOf(C + '::after{'), 'القواعد داخل بوّابة الفأرة: على اللمس يعلق المرور بعد النقر');
  const after = rule(b, C + '::after');
  assert.match(after, /content:""; position:absolute; inset:0; z-index:2; border-radius:inherit; pointer-events:none; opacity:0;/);
  assert.match(after, /box-shadow:inset 0 0 0 1px rgba\(var\(--dtFlashRgb\),\.9\), inset 0 0 26px rgba\(var\(--dtFlashRgb\),\.5\);/);
  assert.match(rule(b, C + ':hover::after'), /animation:dtFlash \.7s ease-out both;/);
  assert.match(b, /@keyframes dtFlash\{0%\{opacity:0;\} 40%\{opacity:1;\} 100%\{opacity:\.55;\}\}/);
  const hover = rule(b, C + ':hover');
  assert.match(hover, /box-shadow:0 4px 18px rgba\(var\(--dtFlashRgb\),\.35\) !important;/, 'يغلب الظلّ المضمَّن من paint()');
  assert.doesNotMatch(hover, /animation|transform/, 'لا حركة ولا animation على البطاقة');
});

test('٢ الأسود أبيض والفاتح ذهبيّ، وتقليل الحركة توهّج ثابت', () => {
  const b = block(read('css/modules.css'), 'v-decor-hover-flash');
  assert.match(rule(b, C), /--dtFlashRgb:255,255,255;/);
  assert.match(b, /html\[data-mode="light"\] #designAiModal \[data-dtoggle\]\{--dtFlashRgb:212,175,55;\}/);
  assert.match(b, /@media \(prefers-reduced-motion:reduce\)\{\s*#designAiModal \[data-dtoggle\]:hover::after\{animation:none; opacity:\.55;\}/);
});

test('٣ البطاقة نفسها كما تبنيها design-sels: data-dtoggle وموضع نسبيّ وقصّ (::after يعتمد عليهما)', () => {
  const js = read('js/design-sels.js');
  assert.match(js, /var CBS=\['designAiRearrange','designAiDecorPlants','designAiDecorArt','designAiDecorAccessories'\];/, 'الأربع');
  assert.match(js, /d\.setAttribute\('data-dtoggle',cb\.id\);/);
  assert.match(js, /d\.style\.cssText='position:relative;border-radius:12px;overflow:hidden;/);
});

test('٤ سطر اسم الملفّ في لوحة الديكور يُقرأ: بنّيّ داكن يغلب --muted المضمَّن، بظلّ فاتح', () => {
  assert.match(read('js/partials-core.js'), /id="designAiFileName" style="[^"]*color:var\(--muted\)/, 'سبب !important: اللون مضمَّن في العنصر');
  const b = block(read('css/رفع-الصور.css'), 'v-decor-file-name');
  assert.match(b, /\.omUpDecor \.omUpN\{text-shadow:0 1px 2px rgba\(255,255,255,\.85\) !important;\}/);
  assert.match(b, /\.omUpDecor \.omUpN > \*\{color:#3d2f14 !important;\}/);
});

test('٥ وسوم الكاش مرفوعة', () => {
  const html = read('index.html');
  const tag = (name) => Number((new RegExp(name.replace(/[.?]/g, '\\$&') + '\\?v=(\\d+)').exec(html) || [])[1] || 0);
  assert.ok(tag('css/modules.css') >= 692, 'modules.css');
  assert.ok(tag('css/رفع-الصور.css') >= 6, 'رفع-الصور.css');
});
