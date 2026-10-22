'use strict';
/* v-gfonts-cors — تدقيق ١٨ أكتوبر (g04/plus-img-to-pdf): تحويل Word إلى PDF يكتب خطأين في الكونسول من html-to-image
   («Error inlining remote css file» و«Error while reading CSS rules from https://fonts.googleapis.com/…»).
   الجذر: ورقة خطوط جوجل في المستند الرئيسيّ تُحمَّل بلا CORS فقراءة cssRules ترمي SecurityError، والمكتبة تكتب الخطأ ثمّ تجلب
   الورقة من جديد. الإصلاح: crossorigin="anonymous" على كلّ رابط خطوط جوجل في المستند الرئيسيّ (fonts.googleapis.com يردّ
   Access-Control-Allow-Origin:*)، فتُقرأ القواعد بلا خطأ والناتج نفسه. الروابط داخل مستندات أخرى (نافذة الطباعة، صفحة المخطّط)
   خارج نطاق html-to-image فلا تُلمس. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('١. index.html: كلّ ورقة خطوط جوجل (والاحتياط داخل noscript) بـcrossorigin="anonymous"، والاتّصال المسبق بالوضع نفسه', () => {
  const html = rd('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const links = html.match(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2[^"]*"[^>]*>/g) || [];
  assert.ok(links.length >= 2, 'الرابط غير الحاجب واحتياط noscript');
  for (const l of links) {
    assert.match(l, /\brel="stylesheet"/);
    assert.match(l, /\scrossorigin="anonymous"/, 'بلا CORS ترمي cssRules: ' + l.slice(0, 90));
  }
  /* اتّصال مسبق بلا crossorigin لا يخدم طلبًا بوضع CORS — يصير مهدورًا */
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" crossorigin>/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
});

/* منشئو روابط الخطوط في المستند الرئيسيّ: crossOrigin يُضبط قبل الإلحاق (الطلب يبدأ عند الإلحاق) */
const CREATORS = [
  ['js/app-19-fonts.js', /var link = document\.createElement\('link'\);([\s\S]*?)document\.head\.appendChild\(link\);/, 'link'],
  ['js/app-20-signature.js', /var el = document\.createElement\('link'\);([\s\S]*?)document\.head\.appendChild\(el\);/, 'el'],
  ['js/app-09-attach.js', /const l = document\.createElement\('link'\);([\s\S]*?)document\.head\.appendChild\(l\);/, 'l'],
  ['js/video-edit.js', /ex = document\.createElement\('link'\);([\s\S]*?)document\.head\.appendChild\(ex\);/, 'ex'],
];

test('٢. منشئو روابط خطوط جوجل (خطّ المحادثة، التوقيع، تصميم النصّ على الصور، محرّر الفيديو) يضبطون crossOrigin قبل الإلحاق', () => {
  for (const [file, re, v] of CREATORS) {
    const src = rd(file);
    const m = src.match(re);
    assert.ok(m, file + ': كتلة إنشاء الرابط');
    assert.match(m[1], /fonts\.googleapis\.com/, file + ': هي رابط خطوط جوجل');
    assert.ok(m[1].includes(v + ".crossOrigin = 'anonymous'"), file + ': بلا crossOrigin ترمي cssRules في html-to-image');
  }
});

test('٣. لا رابط آخر لخطوط جوجل يُلحَق بالمستند الرئيسيّ بلا crossOrigin (كلّ createElement لرابط يذكر googleapis مُغطّى)', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'app.bundle.js' && !f.startsWith('vendor'));
  for (const f of files) {
    const src = rd('js/' + f);
    if (!/createElement\(['"]link['"]\)/.test(src) || !/fonts\.googleapis\.com/.test(src)) continue;
    const blocks = src.split(/createElement\(['"]link['"]\)/).slice(1).map((s) => s.slice(0, 600)).filter((s) => /fonts\.googleapis\.com/.test(s.split(/appendChild|insertBefore/)[0]));
    for (const b of blocks) assert.match(b.split(/appendChild|insertBefore/)[0], /\.crossOrigin = 'anonymous'/, 'js/' + f + ': رابط خطوط جوجل بلا crossOrigin');
  }
});
