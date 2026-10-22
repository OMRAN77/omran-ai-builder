// tests/favicon-gold.test.cjs — أيقونة الموقع ذهبيّة لكلّ زاحف ومتصفّح (v-favicon-gold).
// العرض (المالك ٢٢ أكتوبر): Google Search Console يعرض أيقونة التطبيق البنفسجيّة القديمة. index.html بلا rel="icon" منذ v468،
// و/favicon.ico كان 404، فيبقى الزاحف على ما خزّنه قديمًا؛ وصفحة «التعليم» (edu-old/) تشير إلى أيقوناتها البنفسجيّة.
// القرار: favicon.ico ذهبيّ في الجذر (١٦/٣٢/٤٨ من icons/icon-512-v2.png بـscripts/make-favicon.mjs) ورابطان في <head>،
// وكلّ صفحة وملفّ manifest وكود يشير إلى المجموعة الذهبيّة وحدها، ولا كود يعيد كتابة link[rel=icon].
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const GOLD = 'icon=gold-20260819';

function parseIco(buf) {
  assert.equal(buf.readUInt16LE(0), 0, 'محجوز = 0');
  assert.equal(buf.readUInt16LE(2), 1, 'النوع 1 = أيقونة');
  const n = buf.readUInt16LE(4), out = [];
  for (let i = 0; i < n; i++) {
    const d = 6 + i * 16;
    const w = buf[d] || 256, h = buf[d + 1] || 256, size = buf.readUInt32LE(d + 8), off = buf.readUInt32LE(d + 12);
    assert.ok(off + size <= buf.length, `المدخل ${w} خارج الملفّ`);
    out.push({ w, h, body: buf.subarray(off, off + size) });
  }
  return out;
}

// لون متوسّط البكسلات المضيئة (ما فوق الخلفيّة الداكنة) في مدخل BMP بعمق ٣٢ بت → الصبغة بالدرجات.
function brightHue({ w, body }) {
  let r = 0, g = 0, b = 0, k = 0;
  for (let i = 0; i < w * w; i++) {
    const p = 40 + i * 4, B = body[p], G = body[p + 1], R = body[p + 2], A = body[p + 3];
    if (A > 0 && Math.max(R, G, B) > 90) { r += R; g += G; b += B; k++; }
  }
  r /= k; g /= k; b /= k;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, sat: d / mx, k };
}

test('١. favicon.ico في الجذر بثلاثة مقاسات ١٦ و٣٢ و٤٨، كلّ مدخل BMP بعمق ٣٢ بت سليم الأبعاد', () => {
  const entries = parseIco(fs.readFileSync(path.join(root, 'favicon.ico')));
  assert.deepEqual(entries.map((e) => e.w).sort((a, b) => a - b), [16, 32, 48]);
  for (const e of entries) {
    assert.equal(e.w, e.h);
    assert.equal(e.body.readUInt32LE(0), 40, 'BITMAPINFOHEADER');
    assert.equal(e.body.readInt32LE(4), e.w);
    assert.equal(e.body.readInt32LE(8), e.w * 2, 'الارتفاع مضاعف (الصورة + قناع AND)');
    assert.equal(e.body.readUInt16LE(14), 32);
    assert.equal(e.body.length, 40 + e.w * e.w * 4 + Math.ceil(e.w / 32) * 4 * e.w);
  }
});

test('٢. الأيقونة ذهبيّة لا بنفسجيّة: صبغة الأجزاء المضيئة بين البرتقاليّ والأصفر في كلّ مقاس', () => {
  for (const e of parseIco(fs.readFileSync(path.join(root, 'favicon.ico')))) {
    const { hue, sat, k } = brightHue(e);
    assert.ok(k >= e.w, `بكسلات مضيئة قليلة في ${e.w}: ${k}`);
    assert.ok(hue >= 20 && hue <= 60, `صبغة ${e.w}px = ${hue.toFixed(1)}° (الذهبيّ ٢٠–٦٠، البنفسجيّ ~٢٧٠)`);
    assert.ok(sat > 0.3, `تشبّع ${e.w}px = ${sat.toFixed(2)}`);
  }
});

test('٣. رابطا الأيقونة في <head> في index.html بالنصّ الذي طلبه المالك', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('<link rel="icon" href="/favicon.ico" sizes="48x48">'));
  assert.ok(head.includes(`<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192-v2.png?${GOLD}">`));
  assert.ok(fs.existsSync(path.join(root, 'icons/icon-192-v2.png')));
});

test('٤. الملفّان يُنشران ويُخدمان كما هما: لا .vercelignore يستثنيهما ولا rewrite/redirect يحوّلهما', () => {
  const globRe = (pat) => {
    const dir = pat.endsWith('/'); let p = pat.replace(/^\//, '').replace(/\/$/, '');
    const body = p.split('**').map((s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('.*');
    const anchored = p.includes('/') ? '^' + body : '(^|/)' + body;
    return new RegExp(anchored + (dir ? '/' : '(/|$)'));
  };
  const pats = read('.vercelignore').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  const v = JSON.parse(read('vercel.json'));
  const srcRe = (s) => new RegExp('^' + s.replace(/:\w+\*/g, '.*').replace(/:\w+/g, '[^/]+') + '$');
  for (const f of ['favicon.ico', 'icons/icon-192-v2.png']) {
    assert.deepEqual(pats.filter((p) => globRe(p).test(f)), [], `.vercelignore يستثني ${f}`);
    for (const r of [...(v.rewrites || []), ...(v.redirects || []), ...(v.routes || [])]) {
      const src = r.source || r.src;
      assert.ok(!srcRe(src).test('/' + f), `${src} يحوّل /${f}`);
    }
  }
});

test('٥. لا صفحة ولا manifest ولا كود يشير إلى أيقونة غير ذهبيّة أو يعيد كتابة link[rel=icon]', () => {
  const jsFiles = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
  const pages = ['index.html', 'download.html', 'edu-old/index.html'];
  const manifests = ['manifest.json', 'manifest-huawei.json', 'edu-old/manifest.json'];
  // أيقونات بلا -v2 في icons/ (والمسار النسبيّ في edu-old يصل إلى edu-old/icons البنفسجيّة) — لا يشير إليها شيء منشور.
  const oldIcon = /(^|[^\w-])icons\/(icon-192|icon-512|favicon-32|apple-touch-icon)\.png/;
  const rewrite = /link\[rel[~*^|$]?=?\\?["']?(shortcut )?(apple-touch-)?icon|\.rel\s*=\s*["'](shortcut )?(apple-touch-)?icon|setAttribute\(\s*["']rel["']\s*,\s*["'](shortcut )?(apple-touch-)?icon/i;
  const bad = [];
  for (const f of [...jsFiles, 'sw.js', ...pages, ...manifests]) {
    const s = read(f);
    if (oldIcon.test(s)) bad.push(`${f}: أيقونة قديمة ${s.match(oldIcon)[0].trim()}`);
    if (f.endsWith('.js') && rewrite.test(s)) bad.push(`${f}: يعيد كتابة الأيقونة ${s.match(rewrite)[0]}`);
  }
  assert.deepEqual(bad, []);
  for (const m of manifests) {
    for (const ic of JSON.parse(read(m)).icons) assert.ok(/icons\/icon-(192|512)-v2\.png\?icon=gold-20260819$/.test(ic.src), `${m}: ${ic.src}`);
  }
  const edu = read('edu-old/index.html');
  assert.ok(edu.includes('<link rel="icon" href="/favicon.ico"'), 'صفحة التعليم بأيقونة الموقع الذهبيّة');
});
