// tests/about-no-providers.test.cjs — v-about-truth (تدقيق ١٨–١٩ أكتوبر، g13/about-info): «عن البرنامج» صادقة بالـ١٤ لغة.
// كان «المزيد عن المنصة» بالعربيّ يذكر Claude وGemini وOpenAI وGroq بين قوسين (متلخبطة في فقرة من اليمين لليسار)، والحزم
// الـ١٢ تعدّد ٩ مزوّدين بأسمائهم، والمربّع يقول «٩ مزودي ذكاء + «اسأل الكل»» وزرّها مخفيّ، والنبذة تقول إنّ مفاتيح API محفوظة
// عندك وصفحة المفاتيح للمالك وحده (v-apikeys-owner). الآن على نمط الإنجليزيّ: ٣ نماذج بأسمائها الوظيفيّة (الكينج/السريع/العميق)،
// بلا اسم مزوّد ولا عدد مزوّدين ولا «اسأل الكل» ولا جملة المفاتيح — في القواميس والنصّ الاحتياطيّ داخل partials-settings.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

// القواميس كما يقرؤها التطبيق: العربيّة والإنجليزيّة كما هما، والبقيّة فوق الإنجليزيّة (__i18nDict في app-04)
function dicts() {
  const ctx = { $: () => null, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  const out = { ar: I.ar, en: I.en };
  for (const l of LANGS) out[l] = Object.assign({}, I.en, I[l]);
  return out;
}
function aboutTemplate() {
  const src = read('js/partials-settings.js');
  const m = src.match(/var H = String\.raw`([\s\S]*?)`;/);
  assert.ok(m, 'قالب الإعدادات');
  const H = m[1];
  const start = H.indexOf('<div id="aboutSection" class="settingsPageSection"');
  assert.ok(start >= 0, 'aboutSection');
  return H.slice(start, H.indexOf('<div id="ownerSection"', start));
}
const fallback = (html, key) => {
  const m = html.match(new RegExp('data-i18n="' + key + '">([\\s\\S]*?)</div>'));
  assert.ok(m, 'احتياط ' + key);
  return m[1];
};

const PROVIDERS = /Claude|Anthropic|Gemini|OpenAI|ChatGPT|GPT|Groq|Grok|OpenRouter|Perplexity|Mistral|DeepSeek|Cohere|Kimi|كلود|جيمناي/i;
// كلمة «مزوّد» بلغات التطبيق — عدد المزوّدين لا يُذكر (كان «٩» في المربّع و«4» في العربيّ و«3 نماذج» في الإنجليزيّ)
const PROVIDER_WORD = /مزود|مزوّد|provider|proveedor|fournisseur|प्रोवाइडर|प्रदाता|প্রদানকারী|പ്രൊവൈഡർ|प्रदायक|провайдер|sağlayıcı|پرووائیڈر|فراہم کنندگان|提供商|penyedia/i;
// «اسأل الكل» مخفيّ للجميع (#btnAskAllToggle display:none) — لا يُوعَد به
const ASK_ALL = /اسأل الكل|Ask All|Pregunta a todos|Tanungin lahat|Demander à tous|सबसे पूछें|Tanya semua|എല്ലാവരോടും|सबैलाई सोध्नुहोस्|Спросить всех|Hepsine sor|سب سے پوچھیں|问所有|সবাইকে জিজ্ঞাসা/i;
// مفاتيح API: صفحتها للمالك وحده (SETTINGS_OWNER_ONLY) — المستخدم لا مفاتيح عنده
const KEYS_WORD = {
  ar: /مفاتيح|مفتاح/, en: /\bkeys?\b/i, fr: /clés?\b/i, es: /claves?\b/i, fil: /\bkeys?\b/i, id: /kunci/i, ru: /ключ/i, tr: /anahtar/i,
  zh: /密钥/, hi: /कुंजि|कुंजी/, bn: /চাবি|কাস্টম কী/, ne: /कुञ्जी/, ur: /کلید|کیز/, ml: /കീകൾ|കീ /,
};

test('١. aboutText وaboutFeat* بالـ١٤ لغة بلا اسم مزوّد ولا كلمة «مزوّد» ولا قائمة لاتينيّة بين قوسين', () => {
  const D = dicts();
  assert.equal(Object.keys(D).length, 14);
  for (const [l, d] of Object.entries(D)) {
    assert.ok(d.aboutText && d.aboutText.length > 200, l + ': aboutText');
    const feats = Object.keys(d).filter((k) => /^aboutFeat/.test(k));
    assert.ok(feats.length >= 6, l + ': aboutFeat*');
    for (const k of ['aboutText'].concat(feats)) {
      assert.doesNotMatch(String(d[k]), PROVIDERS, l + ':' + k + ' اسم مزوّد');
      assert.doesNotMatch(String(d[k]), PROVIDER_WORD, l + ':' + k + ' عدد/كلمة مزوّد');
    }
    assert.doesNotMatch(d.aboutText, /\([A-Za-z][^)]*[،,][^)]*\)/, l + ': قائمة لاتينيّة بين قوسين');
  }
});

test('٢. «خصوصيتك أولوية» بلا وعد بمفاتيح API، وaboutText بلا جملة المفاتيح — بالـ١٤ لغة', () => {
  const D = dicts();
  for (const [l, d] of Object.entries(D)) {
    for (const k of ['aboutText', 'aboutFeatPrivacy']) {
      assert.doesNotMatch(String(d[k]), /\bAPI\b/, l + ':' + k + ' API');
      assert.doesNotMatch(String(d[k]), KEYS_WORD[l], l + ':' + k + ' مفاتيح');
    }
    assert.ok(d.aboutFeatPrivacy && d.aboutFeatPrivacy.length >= 4, l + ': aboutFeatPrivacy');
  }
  assert.equal(D.ar.aboutFeatPrivacy, 'خصوصيتك أولوية');
  assert.equal(D.en.aboutFeatPrivacy, 'Privacy first');
});

test('٣. aboutFeatProviders: ٣ نماذج بأسمائها الوظيفيّة للّغة نفسها (provNick*)، بلا ٩ ولا «اسأل الكل»', () => {
  const D = dicts();
  for (const [l, d] of Object.entries(D)) {
    const v = String(d.aboutFeatProviders);
    assert.doesNotMatch(v, /[9٩৯९]/, l + ': ٩');
    assert.doesNotMatch(v, ASK_ALL, l + ': اسأل الكل');
    assert.match(v, /[3٣৩३]/, l + ': ٣');
    // «The King» بالإنجليزيّ يُكتب «King» في الجملة (كما في aboutText الإنجليزيّ)
    for (const k of ['provNickKing', 'provNickFast', 'provNickDeep']) {
      const nick = String(d[k]).replace(/^The /, '');
      assert.ok(v.includes(nick), l + ': ' + k + ' «' + nick + '» في «' + v + '»');
    }
    assert.doesNotMatch(String(d.aboutText), ASK_ALL, l + ': aboutText اسأل الكل');
  }
  assert.equal(D.ar.aboutFeatProviders, '٣ نماذج ذكاء: الكينج والسريع والعميق');
  assert.equal(D.en.aboutFeatProviders, '3 AI models: King, Fast, Deep');
});

test('٤. aboutText يذكر النماذج الثلاثة بأسمائها الوظيفيّة في كلّ لغة (كالإنجليزيّ)', () => {
  const D = dicts();
  for (const [l, d] of Object.entries(D)) {
    for (const k of ['provNickKing', 'provNickFast', 'provNickDeep']) {
      const nick = String(d[k]).replace(/^The /, '');
      assert.ok(d.aboutText.includes(nick), l + ': aboutText بلا ' + nick);
    }
    assert.match(d.aboutText, /[3٣৩३]/, l + ': عدد النماذج');
  }
});

test('٥. النصّ الاحتياطيّ في قالب «عن البرنامج» (partials-settings.js) مثل القاموس العربيّ', () => {
  const about = aboutTemplate();
  const text = fallback(about, 'aboutText');
  const prov = fallback(about, 'aboutFeatProviders');
  const priv = fallback(about, 'aboutFeatPrivacy');
  for (const [k, v] of [['aboutText', text], ['aboutFeatProviders', prov], ['aboutFeatPrivacy', priv]]) {
    assert.doesNotMatch(v, PROVIDERS, k + ' اسم مزوّد');
    assert.doesNotMatch(v, PROVIDER_WORD, k + ' كلمة مزوّد');
    assert.doesNotMatch(v, /\bAPI\b|مفاتيح/, k + ' مفاتيح');
    assert.doesNotMatch(v, ASK_ALL, k + ' اسأل الكل');
    assert.doesNotMatch(v, /[9٩]/, k + ' ٩');
  }
  assert.equal(prov, '٣ نماذج ذكاء: الكينج والسريع والعميق');
  assert.equal(priv, 'خصوصيتك أولوية');
  for (const nick of ['الكينج', 'السريع', 'العميق']) assert.ok(text.includes(nick), 'الاحتياط بلا ' + nick);
});
