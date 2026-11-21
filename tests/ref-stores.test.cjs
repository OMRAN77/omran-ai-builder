// tests/ref-stores.test.cjs — v-ref-stores (المالك ٢١ نوفمبر بلقطة بوستره: «https://omran-ai-builder.vercel.app/?ref=omran هذا الرابط
// سو اياها اي واحد يضغط على الصور يحوله الي المتاجر»، ثمّ اختار: «رابطك نفسه ← المتاجر» ومعاينته البوستر، ودعوات غيره كما هي).
// كان ‎/?ref=omran‎ يفتح التطبيق؛ صفحة المتاجر (download.html: آيفون ← App Store، هواوي ← AppGallery، ويندوز ← Microsoft Store،
// أندرويد وماك ← التطبيق) على ‎/app‎ وحده. الآن تحويل في vercel.json لرابط المالك وحده، والمعاينة بوستره.
// ثمّ رفض التحويل التلقائيّ: «الي اريده فقط تضغط علة الصوره ونحولك الي الرابط» — رابطه يعرض البوستر، والضغطة عليه تحوّل.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { execFile } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const VJ = JSON.parse(read('vercel.json'));

// شروط has/missing كما يقيّمها Vercel على الاستعلام: المفتاح موجود، والقيمة (إن وُجدت) تعبير يطابق القيمة كلّها
function cond(c, q) {
  if (c.type !== 'query' || !q.has(c.key)) return false;
  return c.value === undefined || new RegExp('^(?:' + c.value + ')$').test(q.get(c.key));
}
function redirectFor(url) {
  const u = new URL(url, 'https://x.test');
  for (const r of VJ.redirects || []) {
    if (r.source !== u.pathname) continue;
    if ((r.has || []).every((c) => cond(c, u.searchParams)) && !(r.missing || []).some((c) => u.searchParams.has(c.key))) return r;
  }
  return null;
}

function goDestFn() {
  const m = /function goDest\(ua, touch, search, stores\)\{[\s\S]*?\n  \}/.exec(read('download.html'));
  assert.ok(m, 'goDest موجودة في download.html');
  const ctx = {};
  vm.runInNewContext(m[0] + '; this.f = goDest;', ctx);
  return ctx.f;
}

test('١. تحويل واحد مؤقّت: ‎/?ref=omran‎ ← صفحة البوستر ‎/app?ref=omran&poster=1‎، إلّا ومعه install', () => {
  const rs = (VJ.redirects || []).filter((r) => r.source === '/');
  assert.equal(rs.length, 1, 'قاعدة واحدة على الجذر');
  assert.deepEqual(rs[0], {
    source: '/',
    has: [{ type: 'query', key: 'ref', value: '^omran$' }],
    missing: [{ type: 'query', key: 'install' }],
    destination: '/app?ref=omran&poster=1',
    permanent: false, // ٣٠٧ لا ٣٠٨: المتصفّح لا يحفظه، فإلغاؤه يعيد الرابط للتطبيق فورًا
  });
  assert.ok(VJ.rewrites.some((r) => r.source === '/app' && r.destination === '/download.html'), '/app صفحة المتاجر');
});

test('٢. رابط المالك وحده: دعوات غيره والجذر والقيم القريبة تفتح التطبيق كما كانت', () => {
  for (const u of ['/?ref=omran', '/?x=1&ref=omran', '/?ref=omran&utm_source=tiktok']) {
    assert.equal((redirectFor(u) || {}).destination, '/app?ref=omran&poster=1', u);
  }
  for (const u of ['/', '/?ref=ali', '/?ref=omran2', '/?ref=xomran', '/?ref=Omran', '/?ref=omran&install=1', '/?install=1&ref=omran', '/app?ref=omran', '/index.html?ref=omran']) {
    assert.equal(redirectFor(u), null, u);
  }
});

test('٣. لا حلقة: كلّ جهاز بلا متجر ترجعه صفحة المتاجر إلى رابط فيه install فلا يُحوَّل مرّة ثانية', () => {
  const f = goDestFn();
  const m = /var STORES = (\{[^}]*\});/.exec(read('download.html'));
  const stores = JSON.parse(m[1].replace(/([{,]\s*)(\w+):/g, '$1"$2":').replace(/'/g, '"'));
  const UAS = [
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 5],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 0],
  ];
  const none = { ios: '', android: '', huawei: '', windows: '' };
  for (const [ua, touch] of UAS) {
    for (const st of [stores, none]) {
      const dest = f(ua, touch, '?ref=omran', st);
      if (dest.charAt(0) !== '/') continue; // متجر خارجيّ: لا رجوع
      assert.match(dest, /[?&]install=1/, ua);
      assert.equal(redirectFor(dest), null, 'لا يُحوَّل مرّة ثانية: ' + dest);
    }
  }
  // زرّ «جرّب الآن» في تعريف أندرويد يحمل الوجهة نفسها
  assert.match(read('download.html'), /el\('introGo'\)\.setAttribute\('href', to\);/);
});

// رابط التطبيق بعد أن ينظّفه app-10 (الكتلة الحقيقيّة: ‎?install=1‎ يُحذف ومعه ref)
function afterAppStrip(dest) {
  const src = read('js/app-10-features.js');
  const m = /\/\* v-qr-one:[\s\S]*?\n\(function\(\)\{[\s\S]*?\n\}\)\(\);/.exec(src);
  assert.ok(m, 'كتلة زرّ التثبيت موجودة');
  const out = { replaced: null };
  vm.runInNewContext(m[0].slice(m[0].indexOf('(function(){')), {
    URL, location: { href: 'https://omran-ai-builder.vercel.app' + dest },
    history: { state: null, replaceState: (st, t, u) => { out.replaced = u; } },
    isStandalone: () => true, window: {}, document: { documentElement: null }, __swallow: (e) => { throw e; },
  });
  return out.replaced;
}

test('٣ب. ولا حلقة مع التحديث: التطبيق يحذف install وref من الرابط فلا يبقى ‎/?ref=omran‎ يعيد التحويل (سحب الصفحة، إعادة التحميل بعد النشر)', () => {
  const f = goDestFn();
  const dest = f('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 5, '?ref=omran', { ios: '', android: '', huawei: '', windows: '' });
  assert.equal(dest, '/?ref=omran&install=1');
  const left = afterAppStrip(dest);
  assert.equal(left, '/', 'ما يبقى في شريط العنوان');
  assert.equal(redirectFor(left), null, 'تحديث الصفحة يبقى في التطبيق');
  assert.equal(afterAppStrip('/?ref=omran&install=1&tools=1'), '/?tools=1', 'غير ref وinstall يبقى');
  // الدعوة محفوظة قبل الحذف: app-01 (يسبق app-10 في الحزمة) يكتبها في aiapp_pending_ref
  assert.match(read('js/app-01-boot-auth.js'), /localStorage\.setItem\('aiapp_pending_ref', ref\);/);
});

// سكربت download.html الحقيقيّ على هويّة جهاز، داخل تطبيقنا أو خارجه
function runHub({ ua, search, bridge = false, standalone = false, touch = 5, ack = '1' }) {
  const m = /<script>\n([\s\S]*?)<\/script>/.exec(read('download.html'));
  const out = { replaced: null };
  const els = {};
  const root = { lang: 'ar', dir: 'rtl', className: '' };
  const el = (id) => els[id] || (els[id] = { id, hidden: true, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  vm.runInNewContext(m[1], {
    navigator: { userAgent: ua, maxTouchPoints: touch, language: 'ar' },
    location: { search, replace: (u) => { out.replaced = u; } },
    window: Object.assign({ matchMedia: () => ({ matches: standalone }) }, bridge ? { OmranRender: { mode: () => 'cpu' } } : {}),
    localStorage: { getItem: (k) => (k === 'aiapp_privacy_ack' ? ack : null) },
    document: { documentElement: root, getElementById: el },
  });
  return { replaced: out.replaced, poster: els.poster || null, intro: els.intro || null, root };
}

test('٣ج. داخل تطبيق هواوي المثبّت (رابط الموقع يفتح فيه بـautoVerify) أو تطبيق الويب المثبّت: التطبيق نفسه لا صفحة المتجر', () => {
  const HW_WV = 'Mozilla/5.0 (Linux; Android 12; ALT-L29 Build/HUAWEIALT-L29; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.196 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assert.match(String(runHub({ ua: HW_WV, search: '?ref=omran' }).replaced), /^https:\/\/appgallery\.huawei\.com\//, 'متصفّح هواوي عاديّ ← AppGallery كما كان');
  for (const search of ['?ref=omran', '?ref=omran&poster=1']) {
    const inside = runHub({ ua: HW_WV, search, bridge: true });
    assert.equal(inside.replaced, '/?ref=omran&install=1', 'داخل التطبيق ← التطبيق: ' + search);
    assert.equal(redirectFor(inside.replaced), null);
    assert.ok(!inside.poster || inside.poster.hidden, 'لا بوستر داخل التطبيق');
    assert.equal(runHub({ ua: IPHONE, search, standalone: true }).replaced, '/?ref=omran&install=1', 'تطبيق الويب المثبّت ← التطبيق: ' + search);
  }
  assert.match(String(runHub({ ua: IPHONE, search: '?ref=omran' }).replaced), /^https:\/\/apps\.apple\.com\//, 'آيفون في المتصفّح ← App Store');
});

const DEV = {
  iphone: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5, 'https://apps.apple.com/app/id6795795451'],
  huawei: ['Mozilla/5.0 (Linux; Android 12; HarmonyOS; ELS-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36', 5, 'https://appgallery.huawei.com/app/C118703501'],
  windows: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 0, 'https://apps.microsoft.com/detail/9NZLQM4G1X3D'],
  android: ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 5, '/?ref=omran&install=1'],
  mac: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0, '/?ref=omran&install=1'],
};

test('٣د. رابط المالك يعرض البوستر ولا يحوّل وحده: الصورة كلّها رابط إلى متجر الجهاز، والضغطة هي التي تحوّل', () => {
  const html = read('download.html');
  // الصورة داخل الرابط نفسه، وهي الأصل بلا إعادة ضغط وبمقاسها المعلن
  assert.match(html, /<a class="poster" id="poster" href="\/\?install=1" hidden><img src="\/icons\/om-ai-poster\.webp" alt="[^"]+" width="1424" height="752" loading="lazy"><\/a>/, 'lazy: المخفيّة لا تُحمَّل لزائر الباركود (٣٠٣ ك.ب)');
  assert.match(html, /html\.posterOn \.poster \{ max-width: min\(712px, calc\(100vh \* 1424 \/ 752\)\); max-width: min\(712px, calc\(100dvh \* 1424 \/ 752\)\); \}/, 'جوّال بالعرض: البوستر كامل بلا قصّ');
  assert.match(html, /\.poster \{[^}]*max-width: 712px;/, 'تُعرض بنصف عرض الأصل على الأكثر (2x بلا تكبير)');
  const webp = fs.readFileSync(path.join(ROOT, 'icons/om-ai-poster.webp'));
  assert.equal(webp.toString('latin1', 0, 4) + webp.toString('latin1', 8, 12), 'RIFFWEBP');
  for (const k of Object.keys(DEV)) {
    const [ua, touch, want] = DEV[k];
    // زائر جديد (لم يوافق على الخصوصيّة): على أندرويد كان يظهر التعريف — رابط المالك يعرض البوستر بدله
    const r = runHub({ ua, touch, search: '?ref=omran&poster=1', ack: null });
    assert.equal(r.replaced, null, k + ': لا تحويل تلقائيّ');
    assert.equal(r.poster.hidden, false, k + ': البوستر ظاهر');
    assert.equal(r.poster.attrs.href, want, k + ': الضغطة ← ' + want);
    assert.match(r.root.className, /\bposterOn\b/, k + ': علامة التحميل تختفي');
    assert.ok(!r.intro || r.intro.hidden, k + ': لا تعريف فوق البوستر');
    if (want.charAt(0) === '/') assert.equal(redirectFor(want), null, k + ': الضغطة لا ترجع إلى البوستر');
  }
});

test('٣هـ. بلا poster=1 لا بوستر: باركود «حسابي» والمطبوع (‎/app?ref=omran‎) ودعوة غيره يحوّلان مباشرة كما كانا', () => {
  for (const search of ['?ref=omran', '', '?ref=ali', '?ref=omran&poster=0', '?ref=omran&xposter=1', '?ref=omran&poster=11']) {
    const r = runHub({ ua: DEV.iphone[0], touch: 5, search });
    assert.equal(r.replaced, DEV.iphone[2], 'تحويل مباشر: ' + search);
    assert.ok(!r.poster || r.poster.hidden, 'لا بوستر: ' + search);
  }
  // الباركود في «حسابي» وبوت التسويق بلا poster
  assert.ok(!/poster=/.test(read('js/partials-settings.js')) && !/poster=/.test(read('scripts/social-bot.mjs')));
});

function jpegSize(buf) {
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'JPEG');
  let i = 2;
  while (i < buf.length) {
    const marker = buf.readUInt16BE(i);
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

test('٤. المعاينة بوستر المالك بمقاسه الأصليّ: og وtwitter، والملفّ JPEG دون ٣٠٠ ك.ب (واتساب)، وبلا og:url', () => {
  const html = read('download.html');
  const meta = (p) => ((new RegExp('<meta (?:property|name)="' + p + '" content="([^"]+)">').exec(html)) || [])[1];
  const IMG = 'https://omran-ai-builder.vercel.app/icons/om-ai-poster.jpg';
  assert.equal(meta('og:image'), IMG);
  assert.equal(meta('twitter:image'), IMG);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('og:image:type'), 'image/jpeg');
  assert.ok(meta('og:title') && meta('og:description'), 'عنوان ووصف');
  assert.ok(!/property="og:url"/.test(html), 'كلّ رابط يبقى بدعوته');
  const buf = fs.readFileSync(path.join(ROOT, 'icons/om-ai-poster.jpg'));
  const d = jpegSize(buf);
  assert.deepEqual(d, { w: Number(meta('og:image:width')), h: Number(meta('og:image:height')) }, 'المقاس المعلن = الملفّ');
  assert.deepEqual(d, { w: 1424, h: 752 }, 'مقاس البوستر الأصليّ بلا تكبير');
  assert.ok(buf.length > 100000 && buf.length < 300 * 1024, 'الحجم ' + buf.length);
  assert.doesNotMatch(html, /\b(claude|openai|gpt|gemini|groq|anthropic|openrouter)\b/i);
});

// ٥. الدخان على خادم يحاكي vercel.json (التحويلات ثمّ /app ← download.html ثمّ الملفّات): قسم ⑧ أخضر، وبلا التحويل أحمر
function serve(withRedirect) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      const r = withRedirect ? redirectFor(req.url) : null;
      if (r) { res.writeHead(307, { location: r.destination }); res.end(); return; }
      if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html>'); return; }
      if (u.pathname === '/app') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(read('download.html')); return; }
      if (u.pathname === '/icons/om-ai-poster.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(fs.readFileSync(path.join(ROOT, 'icons/om-ai-poster.jpg'))); return; }
      if (u.pathname === '/icons/om-ai-poster.webp') { res.writeHead(200, { 'content-type': 'image/webp' }); res.end(fs.readFileSync(path.join(ROOT, 'icons/om-ai-poster.webp'))); return; }
      res.writeHead(404); res.end('');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
function smokeSection(base) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, { MONITOR_KEY: '', SMOKE_FETCH: '0', EXPECT_COMMIT: 'not-a-sha' });
    execFile(process.execPath, [path.join(ROOT, 'scripts', 'smoke.mjs'), base], { env, cwd: ROOT, timeout: 60000 }, (err, stdout) => {
      const lines = String(stdout).split('\n');
      const i = lines.findIndex((l) => l.includes('⑧ رابط المالك'));
      const out = [];
      for (let j = i + 1; i !== -1 && j < lines.length && /^\s+[✓✗·]/.test(lines[j]); j++) out.push(lines[j].trim());
      resolve(out);
    });
  });
}

test('٥. الدخان بعد كلّ نشر يثبته على الموقع نفسه: التحويل، ولا حلقة، ودعوة غيره، والبوستر في الصفحة، والمعاينة', async () => {
  const good = await serve(true);
  const ok = await smokeSection('http://127.0.0.1:' + good.address().port);
  good.close();
  assert.equal(ok.length, 5, ok.join(' | '));
  assert.ok(ok.every((l) => l.startsWith('✓')), ok.join(' | '));
  assert.match(ok[0], /\/\?ref=omran → 307 \/app\?ref=omran&poster=1/);
  assert.match(ok[3], /البوستر في الصفحة.*\/icons\/om-ai-poster\.webp → 200 image\/webp/);
  const bad = await serve(false);
  const no = await smokeSection('http://127.0.0.1:' + bad.address().port);
  bad.close();
  assert.match(no[0], /^✗ \/\?ref=omran → 200/, 'بلا التحويل يحمرّ: ' + no[0]);
});
