// tests/share-landing.test.cjs — صفحة المشاركة /s: صور احترافيّة من رسومات التطبيق مع شرح مختصر،
// والضغط على أيّ صورة يدخل التطبيق مباشرة؛ وبطاقة الرابط تعرض الصورة عند المشاركة (v-share-landing).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const html = read('s.html');
const SITE = 'https://omran-ai-builder.vercel.app';

function hrefFor(search) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const enter = { href: '/', setAttribute(k, v) { this[k] = v; } };
  vm.runInNewContext(script, { location: { search }, decodeURIComponent, document: { getElementById: () => enter } });
  return enter.href;
}

// أبعاد JPEG من رأس الملفّ (أوّل مقطع SOF)
function jpegSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.readUInt16BE(0), 0xFFD8, file + ' ليس JPEG');
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1], len = b.readUInt16BE(i + 2);
    if (marker >= 0xC0 && marker <= 0xC3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), bytes: b.length };
    i += 2 + len;
  }
  throw new Error('لا أبعاد في ' + file);
}

test('١. كلّ الصور داخل رابط واحد إلى «/» — الضغط يدخل التطبيق مباشرة حتّى بلا سكربت', () => {
  const a = html.match(/<a id="enter" href="\/"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(a, 'الرابط #enter إلى / موجود');
  const imgs = a[1].match(/<img [^>]+>/g) || [];
  assert.equal(imgs.length, 4, 'أربع صور داخل الرابط');
  assert.equal((html.match(/<img /g) || []).length, 4, 'ولا صورة خارجه');
  assert.equal(hrefFor(''), '/', 'السكربت لا يغيّر الوجهة بلا رمز دعوة');
});

test('٢. الشرح المختصر مكتوب نصًّا في الصفحة باسم التطبيق OM AI', () => {
  const about = html.match(/<div class="about">([\s\S]*?)<\/div>/)[1];
  assert.match(about, /OM AI/);
  for (const w of ['محادثة', 'الصور', 'الفيديو', 'الديكور', 'الأزياء', 'الإعلانات']) assert.ok(about.includes(w), w);
  assert.doesNotMatch(html, />om ai</, 'الاسم بالحروف الكبيرة كما طلب المالك');
});

test('٣. بطاقة الرابط: صورة ١٢٠٠×٦٣٠ بعنوان مطلق على الموقع، لفيسبوك/واتساب وتويتر', () => {
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)[1];
  assert.equal(og, SITE + '/assets/promo/om-ai-card.jpg');
  assert.equal(html.match(/<meta name="twitter:image" content="([^"]+)"/)[1], og);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta property="og:title" content="OM AI[^"]+">/);
  assert.match(html, /<meta property="og:description" content="[^"]{20,}">/);
  assert.match(html, new RegExp('<meta property="og:url" content="' + SITE + '/s">'));
  const s = jpegSize('assets/promo/om-ai-card.jpg');
  assert.deepEqual([s.w, s.h], [1200, 630]);
  assert.ok(s.bytes < 600 * 1024, 'البطاقة خفيفة: ' + s.bytes);
});

test('٤. صور المنشور الأربع موجودة بمقاس ١٠٨٠×١٣٥٠ وخفيفة للجوّال', () => {
  for (let n = 1; n <= 4; n++) {
    const f = 'assets/promo/om-ai-post-' + n + '.jpg';
    assert.ok(html.includes('/' + f), 'الصفحة تعرض ' + f);
    const s = jpegSize(f);
    assert.deepEqual([s.w, s.h], [1080, 1350], f);
    assert.ok(s.bytes > 50 * 1024 && s.bytes < 500 * 1024, f + ' حجمه ' + s.bytes);
  }
});

test('٥. رمز الدعوة ?ref= يُحمل إلى التطبيق، والتالف يُهمل', () => {
  assert.equal(hrefFor('?ref=omran_77'), '/?ref=omran_77');
  for (const bad of ['?ref=a', '?ref=%3Cscript%3E', '?ref=%E0%A4%A', '?ref=a%20b%22onx']) assert.equal(hrefFor(bad), '/', bad);
});

test('٦. التوجيه /s في vercel.json، والصفحة تحت الحارس، ولا شيء يحجب الصور عن النشر', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some((r) => r.source === '/s' && r.destination === '/s.html'), 'توجيه /s موجود');
  assert.ok(read('scripts/guard.mjs').includes("'s.html'"), 's.html مسجّلة في CLIENT');
  const ignore = read('.vercelignore').split(/\r?\n/).map((l) => l.trim());
  assert.ok(!ignore.some((l) => /^assets\/promo|^assets\/\*\*|^assets\/\*\.jpg|^s\.html/.test(l)), 'لا قاعدة تحجبها');
});

test('٧. لا اسم مزوّد ولا سكربت خارجي في الصفحة', () => {
  assert.doesNotMatch(html, /\b(claude|openai|gpt|gemini|groq|anthropic|openrouter)\b/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
});
