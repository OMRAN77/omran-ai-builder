// tests/qr-download-hub.test.cjs — v-qr-one: باركود واحد لكلّ الأجهزة (حلّ محلّ صفحة المتاجر الخمس v-smart-qr-hub).
// المالك (١١ أكتوبر) بلقطة صفحة المتاجر: «سوّ لي باركود واحد لكلّ التطبيقات، مش نفس هذا»، ثمّ بلقطة «حسابي»: «هذا مكانه».
// الباركود يُرسم في «حسابي» برابط /app?ref=اسمه (js/qr.js بلا شبكة)، و/app و/download و/install صفحة تحويل
// ترسل كلّ جهاز إلى تطبيقه مباشرة (متجره إن نُشر، وإلّا التطبيق نفسه بزرّ «تثبيت التطبيق»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// مصفوفات مرجعيّة من مكتبة qrcode القياسيّة (npm، وضع بايت، تصحيح H، القناع مثبَّت) — صفّ لكلّ سطر بالست عشريّ.
const REF_V6 = { version: 6, mask: 3, size: 41, rows: [
    'fe317261bf8', '826486c4a08', 'ba10af132e8', 'ba4675b2ae8', 'ba9324bb2e8', '825320cfa08',
    'feaaaaaabf8', '00cfb7b6000', '33adf22f680', 'c4162cc3bb8', '6b9f7ee0730', '8880f9b0810',
    'fa2a6baf468', 'd5b02ca4008', '5a189560318', '019e18f3b80', '97d26861090', '1ce46e76d20',
    'a20671dce80', 'd4dc6588d30', '5e4f83c36e8', '645efd4fff8', '6fc7f2ee870', 'c47b7863a18',
    'be83ccd4570', '9cb6d7bba68', 'aee38607d58', '3daf6e13ec0', '0b5578436d8', '49e018c7320',
    'bfd5c7a4e40', '05827fdeb78', '7b62845ffe8', '00d649488f8', 'fec77605a90', '8251937a898',
    'ba5268b2fa8', 'bacdae5f0b8', 'bac4260c968', '8269c6eaad0', 'fe32d163810',
  ] };
const REF_V10 = { version: 10, mask: 5, size: 57, rows: [
    'fe8ec1e7a3af3f8', '8245b5f66951208', 'baaf5fb560af2e8', 'ba76896dc4bd2e8', 'ba87a2ffecfd2e8', '82011c6355da208',
    'feaaaaaaaaaabf8', '0088dde2fe81000', '0612c2fe9a792a8', '194e595f04e2fc0', 'a66c7afbd0992d0', '102552774891ff0',
    'fbcfbb8252e8480', '9563744484f9c28', 'b22b380d335aa10', '791b73dc0e29ab0', 'ce0fbbb06c706c0', '3c07e1b03cf5ce8',
    '1a7f2dcc18e4c08', 'f4e2ac7e04b9870', '5f53cbcc9435238', '248032769673fe0', 'df5e538f9b76fd0', '513e132ae72cde0',
    'd7f5232de3ad3b8', 'ec51c94d4525810', 'efb5057f8b6ff90', '08f5cf23cbd68e0', 'cafdf5aa5051a90', '58865fe290f48a0',
    'efc7cabe01d8fa8', '20fa2a933c2b768', '2a69a1e86c14a90', '4dd7dad18f2a9f0', '7f8758944912c60', 'fc5e7cd5652e070',
    '5f8dce3c26faf58', 'e9388479c4bd528', 'cf26a5f275dd9f0', '01992f717a1c6e0', '169f6c1d0406598', 'c4283703d9f7838',
    '0362097d135e3f8', '20a4dd35f583fe8', 'bb1c7d75bc769d0', '3d995973af630a0', 'a65d20eebcde450', 'f948f03d57af6a8',
    '033969bfdcdff98', '00cd71e256f5888', 'fe25b3aa70afaa0', '829826629f348e0', 'ba17b1fe5072fb8', 'ba6917c71d6c180',
    'ba4f5602f82caf8', '8258eecbdc4cc20', 'fe395b21a293fb0',
  ] };

function loadQR() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/qr.js'), ctx);
  return ctx.window.OmranQR;
}
function hexRows(q) {
  // Array.from: مصفوفات سياق vm من عالم آخر فلا يطابقها deepStrictEqual بنموذجها
  return Array.from(q.modules, (row) => {
    let bits = Array.from(row, (d) => (d ? '1' : '0')).join('');
    bits = bits.padEnd(Math.ceil(bits.length / 4) * 4, '0');
    let h = '';
    for (let i = 0; i < bits.length; i += 4) h += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return h;
  });
}

function goDestFn() {
  const html = read('download.html');
  const m = /function goDest\(ua, touch, search, stores\)\{[\s\S]*?\n  \}/.exec(html);
  assert.ok(m, 'goDest موجودة في download.html');
  const ctx = {};
  vm.runInNewContext(m[0] + '; this.f = goDest;', ctx);
  return ctx.f;
}

const UA = {
  iphone: ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5],
  ipad: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5],
  android: ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 5],
  huawei: ['Mozilla/5.0 (Linux; Android 12; HarmonyOS; ELS-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36', 5],
  windows: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 0],
  mac: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0],
};

test('١. مولّد الباركود يطابق المكتبة القياسيّة بتًّا ببت (إصدار ٦ برابط المالك، وإصدار ١٠ بعدّ ١٦ بتًّا ومعلومات الإصدار)', () => {
  const Q = loadQR();
  const cases = [
    ['https://omran-ai-builder.vercel.app/app?ref=omran', REF_V6],
    ['https://omran-ai-builder.vercel.app/app?ref=abcdefghijklmnopqrstuvwxyz_0123456789-ABCDEFGHIJKLMNOPQRSTUVWX', REF_V10],
  ];
  for (const [text, ref] of cases) {
    const q = Q.matrix(text, { mask: ref.mask });
    assert.equal(q.version, ref.version, 'الإصدار');
    assert.equal(q.size, ref.size, 'المقاس');
    assert.deepEqual(hexRows(q), ref.rows, 'المصفوفة كاملة — ' + text.length + ' حرفًا');
  }
});

test('٢. اختيار القناع والإصدار تلقائيًّا، والنصّ الأطول من السعة يُرفض صراحةً', () => {
  const Q = loadQR();
  const q = Q.matrix('https://omran-ai-builder.vercel.app/app?ref=omran');
  assert.equal(q.version, 6);
  assert.ok(q.mask >= 0 && q.mask <= 7);
  assert.equal(Q.matrix('https://omran-ai-builder.vercel.app/app').version, 5);
  assert.equal(Q.matrix('x'.repeat(220)).version, 15, '٢٢٠ بايتًا آخر ما يدخل');
  assert.throws(() => Q.matrix('x'.repeat(221)), /أطول من سعة/);
});

test('٣. صفحة التحويل: لا متاجر ولا باركود فيها — كلّ جهاز يذهب إلى تطبيقه مباشرة', () => {
  const html = read('download.html');
  for (const gone of ['cardApple', 'cardAndroid', 'cardHuawei', 'cardWindows', 'cardExtension', 'storesGrid', 'omran-qr-code.png', 'btnDownloadQr']) {
    assert.ok(!html.includes(gone), 'صفحة المتاجر أُزيلت: ' + gone);
  }
  assert.match(html, /location\.replace\(dest\)/);
  assert.match(html, /<noscript><meta http-equiv="refresh" content="0;url=\/"><\/noscript>/, 'بلا سكربت يفتح التطبيق');
  assert.match(html, /var STORES = \{ ios: '', android: '', huawei: '', windows: '' \};/, 'لا متجر منشور بعد');
});

test('٤. التوجيه: بلا متجر منشور كلّ جهاز يفتح التطبيق بزرّ التثبيت، ودعوة المالك تمرّ معه', () => {
  const f = goDestFn();
  const none = { ios: '', android: '', huawei: '', windows: '' };
  for (const k of Object.keys(UA)) {
    assert.equal(f(UA[k][0], UA[k][1], '?ref=omran', none), '/?ref=omran&install=1', k);
    assert.equal(f(UA[k][0], UA[k][1], '', none), '/?install=1', k + ' بلا دعوة');
  }
  // الدعوة بقاعدة app-01 نفسها: ٣–٦٤ من [a-zA-Z0-9_-] وإلّا تُترك
  for (const bad of ['?ref=ab', '?ref=%3Cscript%3E', '?ref=a%26install%3D0', '?ref=' + 'x'.repeat(65)]) {
    assert.equal(f(UA.android[0], 5, bad, none), '/?install=1', bad);
  }
  assert.equal(f(UA.android[0], 5, '?x=1&ref=Omran_77', none), '/?ref=Omran_77&install=1');
});

test('٥. حين يُنشر متجر يُملأ رابطه في STORES وحده فيذهب جهازه إليه — والباركود المطبوع لا يتغيّر', () => {
  const f = goDestFn();
  const st = { ios: 'https://apps.example/ios', android: 'https://apps.example/android', huawei: 'https://apps.example/huawei', windows: 'https://apps.example/win' };
  assert.equal(f(UA.iphone[0], UA.iphone[1], '', st), st.ios);
  assert.equal(f(UA.ipad[0], UA.ipad[1], '', st), st.ios, 'آيباد يعرّف نفسه «Macintosh» فيُميَّز باللمس');
  assert.equal(f(UA.android[0], 5, '', st), st.android);
  assert.equal(f(UA.huawei[0], 5, '', st), st.huawei, 'هواوي قبل أندرويد');
  assert.equal(f(UA.windows[0], 0, '', st), st.windows);
  assert.equal(f(UA.mac[0], 0, '?ref=omran', st), '/?ref=omran&install=1', 'ماك بلا متجر: التطبيق نفسه');
  assert.equal(f(UA.huawei[0], 5, '', { ios: '', android: st.android, huawei: '', windows: '' }), '/?install=1', 'متجر هواوي غير منشور لا يرسل هواوي إلى متجر جوجل');
});

test('٦. التوجيه في vercel: /app و/download و/install كلّها صفحة التحويل', () => {
  const rw = JSON.parse(read('vercel.json')).rewrites || [];
  for (const src of ['/app', '/download', '/install']) {
    assert.ok(rw.some((r) => r.source === src && r.destination === '/download.html'), src);
  }
});

test('٧. النقاء: لا اسم مزوّد، لا سكربت خارجيّ، والحارس يفحص الصفحة', () => {
  const FORBIDDEN = /\b(claude|openai|gpt|gemini|groq|anthropic|openrouter)\b/i;
  for (const f of ['download.html', 'js/qr.js']) {
    const src = read(f);
    assert.doesNotMatch(src, FORBIDDEN, f);
    assert.doesNotMatch(src, /<script[^>]+src=["']https?:/i, f);
  }
  assert.ok(read('scripts/guard.mjs').includes("'download.html'"));
  assert.ok(fs.statSync(path.join(ROOT, 'icons/ai-hub-mark-256.png')).size > 10000, 'شعار الوسط موجود');
});

test('٨. «حسابي»: باركود واحد يُرسم برابط دعوة صاحب الحساب، بلا «صفحة المتاجر» ولا الصورة الثابتة', () => {
  const p = read('js/partials-settings.js');
  assert.ok(p.includes('id="acctQrCanvas"') && p.includes('id="acctQrDl"'), 'لوحة الباركود وزرّ تحميله');
  assert.ok(!p.includes('صفحة المتاجر') && !p.includes('href="/download"'), 'زرّ صفحة المتاجر أُزيل');
  assert.ok(!p.includes('omran-qr-code.png'), 'الصورة الثابتة (رابط /download بلا دعوة) لم تعد تُعرض');
  assert.match(p, /sc\.src = '\/js\/qr\.js\?v=\d+'/, 'المولّد يُحمَّل عند فتح الباركود فقط');
  assert.ok(p.includes("logo: '/icons/ai-hub-mark-256.png'"), 'الشعار في الوسط');
  // نسختا acctToggleQr (الجزء والحزمة — الحزمة تُحمَّل بعده فتغلب) ترسمان عند الفتح
  for (const f of ['js/partials-settings.js', 'js/app-05-ui.js']) {
    assert.match(read(f), /if \(q && q\.style\.display === 'block' && window\.acctPaintQr\) window\.acctPaintQr\(\);/, f);
  }
});

test('٩. رابط باركود «حسابي» من رابط الدعوة: /app?ref=الاسم، والضيف /app، والقيمة الغريبة تُترك', () => {
  const src = read('js/partials-settings.js');
  const m = /window\.acctQrLink = function\(refLink\) \{[\s\S]*?\n  \};/.exec(src);
  assert.ok(m, 'acctQrLink موجودة');
  const ctx = { window: {}, location: { origin: 'https://omran-ai-builder.vercel.app' } };
  vm.runInNewContext(m[0], ctx);
  const f = ctx.window.acctQrLink;
  assert.equal(f('https://omran-ai-builder.vercel.app/?ref=omran'), 'https://omran-ai-builder.vercel.app/app?ref=omran');
  assert.equal(f(''), 'https://omran-ai-builder.vercel.app/app');
  assert.equal(f(undefined), 'https://omran-ai-builder.vercel.app/app');
  assert.equal(f('https://x/?ref=%22%3E%3Cimg'), 'https://omran-ai-builder.vercel.app/app');
});

function runPill({ href, standalone }) {
  const src = read('js/app-10-features.js');
  const m = /\/\* v-qr-one:[\s\S]*?\n\(function\(\)\{[\s\S]*?\n\}\)\(\);/.exec(src);
  assert.ok(m, 'كتلة زرّ التثبيت موجودة');
  const block = m[0].slice(m[0].indexOf('(function(){'));
  const els = {};
  function el(tag) {
    const e = { tag, style: {}, children: [], attrs: {}, removed: false, textContent: '', innerHTML: '' };
    e.setAttribute = (k, v) => { e.attrs[k] = v; };
    e.appendChild = (c) => { e.children.push(c); };
    e.remove = () => { e.removed = true; if (e.id) delete els[e.id]; };
    return e;
  }
  const calls = { install: 0, replaced: null };
  const ctx = {
    URL, I18N: { en: { install: 'Install app' } },
    location: { href },
    history: { state: null, replaceState: (s, t, u) => { calls.replaced = u; } },
    isStandalone: () => standalone,
    onInstallBtnClick: () => { calls.install++; },
    __swallow: (e) => { throw e; },
    setTimeout: (fn) => fn(),
    window: { curT: () => ({ install: 'تثبيت التطبيق' }) },
    document: {
      readyState: 'complete',
      getElementById: (id) => els[id] || null,
      createElement: el,
      body: { appendChild: (c) => { if (c.id) els[c.id] = c; } },
    },
  };
  vm.runInNewContext(block, ctx);
  return { els, calls };
}

test('١٠. الوصول من الباركود (?install=1): زرّ «تثبيت التطبيق» بنصّ لغة الواجهة، ونقره = زرّ التثبيت نفسه', () => {
  const r = runPill({ href: 'https://omran-ai-builder.vercel.app/?ref=omran&install=1', standalone: false });
  assert.equal(r.calls.replaced, '/?ref=omran', 'install يُحذف من الرابط وref يبقى');
  const pill = r.els.installPill;
  assert.ok(pill, 'الزرّ ظهر');
  const [go, x] = pill.children;
  const label = go.children[0];
  assert.equal(label.attrs['data-i18n'], 'install');
  assert.equal(label.textContent, 'تثبيت التطبيق');
  go.onclick();
  assert.equal(r.calls.install, 1, 'onInstallBtnClick');
  assert.ok(pill.removed);
  const r2 = runPill({ href: 'https://omran-ai-builder.vercel.app/?install=1', standalone: false });
  r2.els.installPill.children[1].onclick();
  assert.equal(r2.calls.install, 0, '× يغلق بلا تثبيت');
});

test('١١. لا زرّ داخل التطبيق المثبّت ولا بلا ?install=1', () => {
  const a = runPill({ href: 'https://omran-ai-builder.vercel.app/?install=1', standalone: true });
  assert.equal(a.els.installPill, undefined);
  assert.equal(a.calls.replaced, '/', 'الرابط يُنظَّف حتى في المثبّت');
  const b = runPill({ href: 'https://omran-ai-builder.vercel.app/?ref=omran', standalone: false });
  assert.equal(b.els.installPill, undefined);
  assert.equal(b.calls.replaced, null, 'لا لمس للرابط');
  // النصّ موجود في الـ١٤ لغة (لا نصّ جديد)
  const data = read('js/app-03-i18n-data.js');
  assert.equal((data.match(/\binstall:/g) || []).length, 2);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.match(read('i18n/' + lg + '.js'), /\binstall:/, lg);
});
