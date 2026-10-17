// tests/tools-black.test.cjs — v-tools-black (المالك ١٦ أكتوبر: «تغيّر الخلفيّات داخل الأدوات فقط — إذا مختار اللون الأسود
// يكونون كلّهم نفس درجة لون المحادثة… كلّها لون واحد»). قبلها: أنماط الصور رماديّ #0B0B0D، وصانع الفيديو والأسهم والمصاريف
// والتعليم والسيرة والمستندات والقوالب نوافذ شبه شفّافة تُظهر المحادثة خلفها، وصناديق داخليّة رماديّة أو بمسحة ذهبيّة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CSS = 'css/أدوات-أسود.css';

test('١. الملفّ محمّل بعد الثيمات بوسم كاش', () => {
  const html = read('index.html');
  const at = html.indexOf('href="' + CSS + '?v=');
  assert.ok(at > 0, 'غير محمّل');
  assert.ok(at > html.indexOf('href="css/ثيمات.css?v='), 'بعد الثيمات فيغلب ما قبله');
});

test('٢. كلّ قاعدة للوضع الأسود وحده: لا الفاتح ولا الثيمات (html.skin)', () => {
  const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = css.split('}').map((b) => b.split('{')[0]).filter((s) => s.trim()).flatMap((s) => s.split(/,(?![^()]*\))/)).map((s) => s.trim());
  assert.ok(sels.length >= 30);
  for (const s of sels) assert.ok(s.startsWith('html:not([data-mode="light"]):not(.skin) '), s);
  // v-no-lines: خلفيّتان فقط (#000 و#101013)، الحدود شفّافة، والذهبيّ عند المرور أو التركيز أو الاختيار فقط.
  for (const b of css.split('}').filter((x) => x.includes('{'))) assert.match(b.split('{')[1], /^(background:(#000|#101013|transparent)|border-color:(transparent|rgba\(212,175,55,\.85\))|border-bottom:0) !important;$/, 'لونان أسودان وذهبيّ المرور فقط: ' + b);
});

test('٣. النوافذ التي كانت رماديّة أو شفّافة سوداء، وصناديقها شفّافة فوقها — واستوديو الإعلانات (المجرّة) لا يُمسّ', () => {
  const css = read(CSS);
  const black = css.slice(0, css.indexOf('{background:#000'));
  for (const id of ['#portraitStyleSheet', '#inspireScreen', '#videoMakerModal', '#stocksModal', '#expModal', '#eduHubModal', '#cvModal', '#docModal', '#fbOverlay']) assert.ok(black.includes(id), id);
  for (const id of ['#vmkTabs', '#vtRoot', '#designAiIdeas', '#cxStart', '#cxIdeas', '#expDrop', '#docDrop']) assert.ok(css.includes(id + ',') || css.includes(id + '{'), id);
  assert.ok(!/ad-studio|\.hero|body\{/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'صفحة الإعلانات مستقلّة');
});
