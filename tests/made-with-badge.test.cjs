// v-made-with-badge: كل مشروع منشور (/p.html?id=…) يحمل شارة «صُنع بـ OM Ai» ترجع للمنصّة، ومعاينة الرابط تعرّف بها.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'p.html'), 'utf8');

test('١) الشارة موجودة وترجع للمنصّة بوسم مصدر', () => {
  const m = /<div id="omMadeWith"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  assert.ok(m, 'عنصر الشارة');
  assert.match(m[1], /href="\/\?ref=badge"/);
  assert.match(m[1], /target="_top"/);
  assert.match(m[1], /OM Ai/);
  assert.match(m[1], /<button[^>]*aria-label="إخفاء"/, 'زرّ إخفاء');
});

test('٢) الشارة خارج إطار المشروع ولا تُحقن في كود المستخدم', () => {
  const badgeAt = html.indexOf('<div id="omMadeWith"');
  const wrapAt = html.indexOf('<div id="frameWrap">');
  const wrapEnd = html.indexOf('</div>', html.indexOf('<div id="chatWrap">') + 30);
  assert.ok(wrapAt > 0 && badgeAt > wrapEnd, 'بعد إغلاق frameWrap');
  // v-audit-pages: الكود يُعرض كما هو مع طبقة التخزين وحدها (كالمعاينة) — الشارة لا تدخله
  assert.match(html, /frame\.srcdoc = pInject\(data\.code\);/, 'كود المستخدم يُعرض كما هو');
  assert.doesNotMatch(html.slice(html.indexOf('const P_SHIM'), html.indexOf('const pInject')), /omMadeWith|OM Ai/, 'الشارة دخلت كود المستخدم');
  assert.match(html, /#omMadeWith\{position:fixed;[^}]*z-index:50/);
});

test('٣) معاينة الرابط (واتساب وغيره) تعرّف بالمنصّة', () => {
  assert.match(html, /<meta property="og:title" content="[^"]*OM Ai[^"]*">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/omran-ai-builder\.vercel\.app\/icons\/og-omran\.jpg">/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'icons', 'og-omran.jpg')), 'الصورة موجودة');
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
});
