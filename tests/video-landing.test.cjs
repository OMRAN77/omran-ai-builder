// tests/video-landing.test.cjs — صفحة الفيديو الترويجي /v: الضغط على الفيديو يحوّل الزائر
// إلى /download الذي يوصله متجر جهازه (v-video-landing).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// يشغّل سكربت الصفحة الحقيقي في متصفّح وهميّ صغير ويرجّع ما آلت إليه العناصر
function runPage(opts) {
  opts = opts || {};
  const script = read('v.html').match(/<script>([\s\S]*?)<\/script>/)[1];
  const mk = (extra) => Object.assign({
    attrs: {}, textContent: '', listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(n, fn) { this.listeners[n] = fn; },
  }, extra || {});
  const els = {
    tapArea: mk({ attrs: { href: '/download' } }),
    txtCta: mk(),
    soundBtn: mk(),
    promo: mk({ muted: true, paused: false, play() { return Promise.resolve(); } }),
  };
  const sandbox = {
    navigator: { language: opts.language || 'ar' },
    location: { search: opts.search || '' },
    decodeURIComponent,
    document: { title: '', documentElement: { lang: 'ar', dir: 'rtl' }, getElementById: (id) => els[id] },
  };
  vm.runInNewContext(script, sandbox);
  return { els, doc: sandbox.document };
}

// دالّة التحويل الحقيقيّة من download.html مع جدول متاجرها — هي التي تحدّد وجهة كلّ جهاز
function downloadDest(ua, touch) {
  const html = read('download.html');
  const stores = html.match(/var STORES = (\{[^\n]*\});/)[1];
  const fn = html.match(/function goDest\([\s\S]*?\n  \}/)[0];
  return vm.runInNewContext('(' + fn + ')(ua, touch, "", ' + stores + ')', { ua, touch, decodeURIComponent });
}

test('١. الفيديو كلّه داخل رابط واحد إلى /download يعمل حتّى بلا سكربت', () => {
  const html = read('v.html');
  assert.ok(html.includes('<!DOCTYPE html>'), 'صيغة HTML صالحة');
  assert.match(html, /<a id="tapArea" href="\/download"[^>]*>\s*<video id="promo"/, 'الفيديو داخل رابط /download');
  assert.match(html, /<video[^>]+autoplay[^>]+muted[^>]+loop[^>]+playsinline/, 'تشغيل تلقائي مكتوم داخل الصفحة (شرط الجوّال)');
  assert.equal(runPage().els.tapArea.attrs.href, '/download', 'السكربت لا يغيّر الوجهة بلا رمز دعوة');
});

test('٢. /download يوصل كلّ جهاز متجره — فالضغط على الفيديو ينزّل «حسب الموجود عنده»', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const huawei = 'Mozilla/5.0 (Linux; Android 12; HUAWEI P50) AppleWebKit/537.36 Chrome/114.0 Mobile Safari/537.36';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
  const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';
  assert.match(downloadDest(iphone, 5), /^https:\/\/apps\.apple\.com\//, 'آيفون ← App Store');
  assert.match(downloadDest(huawei, 5), /^https:\/\/appgallery\.huawei\.com\//, 'هواوي ← AppGallery لا أندرويد');
  assert.match(downloadDest(windows, 0), /^https:\/\/apps\.microsoft\.com\//, 'ويندوز ← Microsoft Store');
  const a = downloadDest(android, 5);
  assert.ok(/^https:\/\/play\.google\.com\//.test(a) || a === '/?install=1', 'أندرويد ← متجره إن نُشر، وإلّا تثبيت التطبيق: ' + a);
});

test('٣. رمز الدعوة ?ref= يُحمل إلى /download، والتالف يُهمل', () => {
  assert.equal(runPage({ search: '?ref=omran_77' }).els.tapArea.attrs.href, '/download?ref=omran_77');
  assert.equal(runPage({ search: '?x=1&ref=abc-123' }).els.tapArea.attrs.href, '/download?ref=abc-123');
  for (const bad of ['?ref=a', '?ref=%3Cscript%3E', '?ref=%E0%A4%A', '?ref=a%20b%22onx']) {
    assert.equal(runPage({ search: bad }).els.tapArea.attrs.href, '/download', bad);
  }
});

test('٤. زرّ الصوت يفتح الكتم ولا يُفعّل التحويل', () => {
  const { els } = runPage();
  assert.equal(els.soundBtn.textContent, '🔇');
  let prevented = false, stopped = false;
  els.soundBtn.listeners.click({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(els.promo.muted, false, 'الصوت انفتح');
  assert.equal(els.soundBtn.textContent, '🔊');
  assert.ok(prevented && stopped, 'الضغطة على زرّ الصوت لا تصل الرابط');
});

test('٥. متصفّح غير عربي يرى النصّ بالإنجليزيّة واتّجاه LTR', () => {
  const { els, doc } = runPage({ language: 'en-US' });
  assert.equal(doc.documentElement.dir, 'ltr');
  assert.match(els.txtCta.textContent, /Tap to download/);
  assert.match(runPage({ language: 'ar-AE' }).els.txtCta.textContent, /اضغط للتنزيل/);
});

test('٦. الفيديو والملصق موجودان بحجم خفيف يناسب الجوّال ويُنشران', () => {
  const mp4 = path.join(ROOT, 'assets/promo/om-ai-promo.mp4');
  const poster = path.join(ROOT, 'assets/promo/om-ai-promo-poster.jpg');
  assert.ok(fs.existsSync(mp4) && fs.existsSync(poster), 'الملفّان موجودان');
  const size = fs.statSync(mp4).size;
  assert.ok(size > 200000 && size < 4 * 1024 * 1024, 'الفيديو أقلّ من ٤ ميجا: ' + size);
  assert.ok(read('v.html').includes('/assets/promo/om-ai-promo.mp4'), 'الصفحة تشير إليه');
  const ignore = read('.vercelignore').split(/\r?\n/).map((l) => l.trim());
  assert.ok(!ignore.some((l) => /^assets\/promo|^assets\/\*\*|^v\.html/.test(l)), 'لا قاعدة في .vercelignore تحجبهما');
});

test('٧. التوجيه /v في vercel.json والصفحة تحت حراسة guard.mjs', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(vercel.rewrites.some((r) => r.source === '/v' && r.destination === '/v.html'), 'توجيه /v موجود');
  assert.ok(read('scripts/guard.mjs').includes("'v.html'"), 'v.html مسجّلة في CLIENT');
});

test('٨. لا اسم مزوّد ولا سكربت خارجي في الصفحة', () => {
  const html = read('v.html');
  assert.doesNotMatch(html, /\b(claude|openai|gpt|gemini|groq|anthropic|openrouter)\b/i);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
});
