// tests/favicon-gold.test.cjs — أيقونة الموقع ذهبيّة لكلّ زاحف ومتصفّح (v-favicon-gold).
// العرض (المالك ٢٢ أكتوبر): Google Search Console يعرض أيقونة التطبيق البنفسجيّة القديمة. index.html بلا rel="icon" منذ v468،
// و/favicon.ico كان 404، فيبقى الزاحف على ما خزّنه قديمًا؛ وصفحة «التعليم» (edu-old/) تشير إلى أيقوناتها البنفسجيّة.
// القرار: favicon.ico ذهبيّ في الجذر ورابطان في <head>، وكلّ صفحة وملفّ manifest وكود يشير إلى المجموعة الذهبيّة وحدها، ولا كود
// يعيد كتابة link[rel=icon]. ثمّ بأمره: المصدر icons/ai-hub-mark.png معدّلًا في التطبيق (نفس الشكل وAi، خلفيّة #000000 كالدردشة)،
// ومنه بـscripts/make-favicon.mjs الـico وكلّ مقاسات الأيقونة، ووسم الكاش black-20261022 بدل gold-20260819.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const TAG = 'icon=black-20261022';

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

test('٢ب. مقاس ١٦ الحلقة الذهبيّة وحدها (زواياه شفّافة ووسطه معتم)، و٣٢ و٤٨ الأيقونة كاملة على أسود خلفيّة الدردشة', () => {
  for (const e of parseIco(fs.readFileSync(path.join(root, 'favicon.ico')))) {
    const px = (x, y) => { const p = 40 + ((e.w - 1 - y) * e.w + x) * 4; return { r: e.body[p + 2], g: e.body[p + 1], b: e.body[p], a: e.body[p + 3] }; };
    const corners = [px(0, 0), px(e.w - 1, 0), px(0, e.w - 1), px(e.w - 1, e.w - 1)];
    const mid = e.w >> 1;
    assert.equal(px(mid, mid).a, 255, `وسط ${e.w}px معتم`);
    if (e.w === 16) assert.deepEqual(corners.map((c) => c.a), [0, 0, 0, 0], 'زوايا ١٦ شفّافة: لا خلفيّة ولا كتابة Ai');
    else for (const c of corners) {
      // المالك: «مش كحلي — أسود غامق نفس درجة لون الخلفيّة في الدردشة» (#000000، لا زرقة).
      assert.equal(c.a, 255, `${e.w}px الأيقونة كاملة`);
      assert.ok(c.r <= 3 && c.g <= 3 && c.b <= 3, `${e.w}px زاوية ${c.r},${c.g},${c.b} ليست أسود الدردشة`);
    }
  }
});

test('٢ج. «خلّ الأيقونات كلها لون الأسود الجديد»: كلّ مقاس للأيقونة بمقاسه وزواياه أسود الدردشة وذهبه ذهب', () => {
  const { PNG } = require('pngjs');
  const icons = { 'icons/ai-hub-mark.png': 1254, 'icons/icon-512-v2.png': 512, 'icons/icon-192-v2.png': 192, 'icons/apple-touch-icon-v2.png': 180,
    'icons/favicon-32-v2.png': 32, 'icons/ai-hub-mark-256.png': 256, 'icons/omran-mark-64.png': 64 };
  for (const [f, n] of Object.entries(icons)) {
    const p = PNG.sync.read(fs.readFileSync(path.join(root, f)));
    assert.equal(p.width, n, f); assert.equal(p.height, n, f);
    const at = (x, y) => p.data.subarray((y * n + x) * 4, (y * n + x) * 4 + 4);
    for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [0, n >> 1]]) {
      const [r, g, b, a] = at(x, y);
      assert.ok(a === 255 && r <= 3 && g <= 3 && b <= 3, `${f} (${x},${y}) = ${r},${g},${b},${a} — ليس أسود الدردشة`);
    }
    let R = 0, G = 0, B = 0, k = 0;
    for (let i = 0; i < n * n; i++) { const r = p.data[i * 4], g = p.data[i * 4 + 1], b = p.data[i * 4 + 2]; if (Math.max(r, g, b) > 90) { R += r; G += g; B += b; k++; } }
    assert.ok(k > 0 && R / k > (B / k) * 1.5 && G / k > B / k, `${f}: المضيء ليس ذهبيًّا`);
  }
});

test('٣. رابطا الأيقونة في <head> في index.html بالنصّ الذي طلبه المالك', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('<link rel="icon" href="/favicon.ico" sizes="48x48">'));
  assert.ok(head.includes(`<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192-v2.png?${TAG}">`));
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
    // وسم الكاش القديم يبقي الكحليّة في كاش المتصفّح والعامل والتطبيق المثبّت.
    if (s.includes('icon=gold-20260819')) bad.push(`${f}: وسم الأيقونة الكحليّة القديم gold-20260819`);
    if (f.endsWith('.js') && rewrite.test(s)) bad.push(`${f}: يعيد كتابة الأيقونة ${s.match(rewrite)[0]}`);
  }
  assert.deepEqual(bad, []);
  for (const m of manifests) {
    for (const ic of JSON.parse(read(m)).icons) assert.ok(/icons\/icon-(192|512)-v2\.png\?icon=black-20261022$/.test(ic.src), `${m}: ${ic.src}`);
  }
  const edu = read('edu-old/index.html');
  assert.ok(edu.includes('<link rel="icon" href="/favicon.ico"'), 'صفحة التعليم بأيقونة الموقع الذهبيّة');
});
