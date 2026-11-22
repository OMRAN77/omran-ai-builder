// tests/app-intro.test.cjs — v-app-intro: تعريف قصير قبل التطبيق لجوّال بلا متجر منشور.
// المالك (٢١ نوفمبر ٢٠٢٦) بعد مراجعة رابط البايو: زائر أندرويد من تيك توك وإنستغرام كان يُرمى على نافذة الموافقة مباشرة
// بلا أيّ شرح. /app ما زالت صفحة التحويل نفسها (v-qr-one): من له متجر يذهب إليه مباشرة، ومن لا متجر له يرى التعريف أوّلًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 trill_350003 BytedanceWebview/d8a21c6',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  huawei: 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; ELS-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

const INTRO_IDS = ['intro', 'introTitle', 'introSub', 'introTry', 'introEx1', 'introEx2', 'introEx3', 'introShot', 'introGo'];

// يشغّل سكربت download.html الحقيقيّ كاملًا على هويّة جهاز، ويرجع ما فعله: حوّل أم عرض التعريف.
function run({ ua, search = '', lang = 'ar', touch = 5, standalone = false, ack = null, storageThrows = false, noStores = false }) {
  const html = read('download.html');
  const m = /<script>\n([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'سكربت الصفحة موجود');
  let src = m[1];
  if (noStores) src = src.replace(/var STORES = \{[^}]*\};/, "var STORES = { ios: '', android: '', huawei: '', windows: '' };");
  const els = {};
  for (const id of INTRO_IDS) {
    assert.ok(html.includes('id="' + id + '"'), 'العنصر في الصفحة: ' + id);
    els[id] = { id, hidden: id === 'intro', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  }
  const out = { replaced: null };
  const root = { lang: 'ar', dir: 'rtl', className: '' };
  const ctx = {
    navigator: { userAgent: ua, maxTouchPoints: touch, language: lang },
    location: { search, replace: (u) => { out.replaced = u; } },
    window: { matchMedia: () => ({ matches: standalone }) },
    localStorage: { getItem: (k) => { if (storageThrows) throw new Error('SecurityError'); return k === 'aiapp_privacy_ack' ? ack : null; } },
    document: { documentElement: root, getElementById: (id) => els[id] || null },
  };
  vm.runInNewContext(src, ctx);
  return { out, els, root };
}

test('١. أندرويد بلا متجر (ومتصفّح تيك توك الداخليّ): يظهر التعريف ولا تحويل، والزرّ يحمل الوجهة نفسها مع الدعوة', () => {
  for (const k of ['android', 'tiktokAndroid']) {
    const r = run({ ua: UA[k], search: '?ref=omran' });
    assert.equal(r.out.replaced, null, k + ': لا تحويل تلقائيّ');
    assert.equal(r.els.intro.hidden, false, k + ': التعريف ظاهر');
    assert.equal(r.els.introGo.attrs.href, '/?ref=omran&install=1', k + ': الزرّ = وجهة goDest');
    assert.match(r.root.className, /\bintroOn\b/, k + ': علامة التحميل تختفي');
  }
  assert.equal(run({ ua: UA.android }).els.introGo.attrs.href, '/?install=1', 'بلا دعوة');
});

test('٢. من له متجر منشور لا يرى التعريف: آيفون وهواوي وويندوز يذهبون إلى متاجرهم كما كانوا', () => {
  const want = { iphone: /^https:\/\/apps\.apple\.com\//, huawei: /^https:\/\/appgallery\.huawei\.com\//, windows: /^https:\/\/apps\.microsoft\.com\// };
  for (const k of Object.keys(want)) {
    const r = run({ ua: UA[k], touch: k === 'windows' ? 0 : 5 });
    assert.match(String(r.out.replaced), want[k], k);
    assert.equal(r.els.intro.hidden, true, k + ': التعريف مخفيّ');
  }
});

test('٣. الحاسوب بلا متجر (ماك) يبقى كما كان: التطبيق مباشرة — التعريف للجوّال وحده', () => {
  const r = run({ ua: UA.mac, touch: 0, search: '?ref=omran' });
  assert.equal(r.out.replaced, '/?ref=omran&install=1');
  assert.equal(r.els.intro.hidden, true);
});

test('٤. لا تعريف داخل التطبيق المثبّت ولا للزائر العائد الذي وافق على الخصوصيّة', () => {
  const a = run({ ua: UA.android, standalone: true });
  assert.equal(a.out.replaced, '/?install=1', 'المثبّت');
  assert.equal(a.els.intro.hidden, true);
  const b = run({ ua: UA.android, ack: '1' });
  assert.equal(b.out.replaced, '/?install=1', 'العائد');
  assert.equal(b.els.intro.hidden, true);
});

test('٥. تخزين محجوب (تصفّح خاصّ) لا يحبس الزائر: يكمل إلى وجهته', () => {
  const r = run({ ua: UA.android, storageThrows: true });
  assert.equal(r.out.replaced, '/?install=1');
  assert.equal(r.els.intro.hidden, true);
});

test('٦. آيفون لو فرغ متجره يرى التعريف مثل أندرويد (القاعدة: جوّال بلا متجر)', () => {
  const r = run({ ua: UA.iphone, noStores: true });
  assert.equal(r.out.replaced, null);
  assert.equal(r.els.intro.hidden, false);
  assert.equal(r.els.introGo.attrs.href, '/?install=1');
});

test('٧. اللغة: عربيّ يبقى نصّ الصفحة كما هو، وغير العربيّ يتحوّل إنجليزيًّا باتّجاه يسار-يمين', () => {
  const ar = run({ ua: UA.android, lang: 'ar-AE' });
  assert.equal(ar.root.lang, 'ar');
  assert.equal(ar.els.introTitle.textContent, '', 'النصّ العربيّ في الصفحة نفسها لا يُستبدل');
  const en = run({ ua: UA.android, lang: 'en-US' });
  assert.equal(en.root.lang, 'en');
  assert.equal(en.root.dir, 'ltr');
  for (const id of ['introTitle', 'introSub', 'introTry', 'introEx1', 'introEx2', 'introEx3', 'introGo']) {
    assert.ok(en.els[id].textContent.length > 3, id + ' مترجم');
    assert.doesNotMatch(en.els[id].textContent, /[؀-ۿ]/, id + ' بلا عربيّ');
  }
});

test('٨. نصّ التعريف: بلا وعود مال أو مجّانيّة، بلا اسم مزوّد، والاسم «om ai» لا القديم', () => {
  const html = read('download.html');
  const intro = /<main class="intro"[\s\S]*?<\/main>/.exec(html);
  assert.ok(intro, 'قسم التعريف موجود');
  const en = /var INTRO_EN = \{[\s\S]*?\};/.exec(html);
  assert.ok(en, 'النصّ الإنجليزيّ موجود');
  const text = intro[0] + en[0];
  assert.doesNotMatch(text, /مجّان|مجان|ببلاش|بلاش|ربح|اربح|دولار|\bfree\b|\bearn\b|\$/i, 'لا مال ولا مجّانيّة');
  assert.doesNotMatch(text, /\b(claude|openai|gpt|gemini|groq|anthropic|openrouter)\b/i, 'لا اسم مزوّد');
  assert.doesNotMatch(text, /عمران|Omran/i, 'الاسم om ai وحده');
  assert.ok(intro[0].includes('<p class="introName">om ai</p>'));
  assert.match(intro[0], /<main class="intro" id="intro" hidden>/, 'مخفيّ حتى يقرّر السكربت — بقيّة الأجهزة لا تراه لحظة');
});

test('٩. الصورة موجودة وخفيفة، وبلا سكربت يبقى التحويل إلى التطبيق', () => {
  const html = read('download.html');
  const m = /<img class="introShot"[^>]+src="\/([^"]+)"/.exec(html);
  assert.ok(m, 'صورة من داخل التطبيق');
  const size = fs.statSync(path.join(ROOT, m[1])).size;
  assert.ok(size > 10000 && size < 200000, 'الصورة ' + size + ' بايت — خفيفة على بيانات الجوّال');
  assert.match(html, /<img class="introShot"[^>]+loading="lazy"/, 'تحت الطيّة: تحميل كسول');
  assert.match(html, /<noscript><meta http-equiv="refresh" content="0;url=\/"><\/noscript>/);
});
