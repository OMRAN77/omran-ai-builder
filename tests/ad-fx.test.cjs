'use strict';
/* v-ad-fx (طلب المالك ١٧ نوفمبر: «ضيفلي هذي التاثيرات لي بناء الاعلانات سموك ريفيل واكسبلودد فيو دون شوت اوربت شوت»،
   واختار «صور في الاستوديو»): أربعة تأثيرات لقطة اختياريّة لصورة الإعلان المولَّدة في ad-studio.html.
   يُبنى هنا النصّ الفعليّ الذي يصل مولّد الصور (بلا شبكة ولا مفاتيح) ويُفحص أنّ كلّ تأثير يدخله، وأنّ غيابه يترك الأمر كما كان. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('ad-studio.html', 'utf8');
const adimage = fs.readFileSync('api/_lib/adimage.js', 'utf8');

async function promptFor(body) {
  const L = '../api/_lib/';
  const stub = (exp) => ({ id: 'x', filename: 'x', loaded: true, exports: exp });
  require.cache[require.resolve(L + '_usage.js')] = stub({
    checkAndConsumeCustom: async () => ({ allowed: true, remaining: 7 }), refundCustom: async () => {} });
  require.cache[require.resolve(L + 'points.js')] = stub({ verifyPointsToken: () => 'omran' });
  delete require.cache[require.resolve(L + 'adimage.js')];
  process.env.OPENAI_API_KEY = 'test-only-not-a-key';
  process.env.GEMINI_API_KEY = '';
  const realFetch = global.fetch, realRandom = Math.random;
  let cap = null;
  global.fetch = async (url, init) => { cap = { url, init }; return { ok: false, status: 402, json: async () => ({ error: { message: 'stub' } }) }; };
  Math.random = () => 0; // المشهد العشوائيّ ثابت فتصحّ المقارنة حرفيًّا
  try {
    await require(L + 'adimage.js')({ method: 'POST', body }, { setHeader() {}, status() { return this; }, end() {} });
  } finally { global.fetch = realFetch; Math.random = realRandom; }
  assert.ok(cap, 'لم يُرسل أيّ طلب إلى المولّد');
  const b = cap.init.body;
  return typeof b === 'string' ? JSON.parse(b).prompt : b.get('prompt');
}

const BODY = { token: 't', lang: 'ar', ratio: 'tall', look: 'cinema', ac: '', cat: 'other',
  title: 'عطر العود', spec: 'زيت عود ملكيّ', price: '٢٥٠', unit: 'درهم', tel: '050 504 0108', kick: 'جديد',
  imageBase64: '', mimeType: '' };
const MARK = { smoke: /SMOKE REVEAL/, exploded: /EXPLODED VIEW/, topdown: /TOP-DOWN SHOT/, orbit: /ORBIT SHOT/ };

test('١. كلّ تأثير من الأربعة يدخل أمر التوليد بوصفه الإنجليزيّ', async () => {
  for (const k of Object.keys(MARK)) {
    const p = await promptFor({ ...BODY, fx: k });
    assert.match(p, /SHOT EFFECT \(the customer chose it/, k);
    assert.match(p, MARK[k], k);
    for (const o of Object.keys(MARK)) if (o !== k) assert.doesNotMatch(p, MARK[o], k + ' ≠ ' + o);
    assert.match(p, /never covers or distorts the text/, k);
  }
  const ex = await promptFor({ ...BODY, fx: 'exploded' });
  assert.match(ex, /never invent parts/);
  const td = await promptFor({ ...BODY, fx: 'topdown' });
  assert.match(td, /straight down from directly above/);
  const ob = await promptFor({ ...BODY, fx: 'orbit' });
  assert.match(ob, /circular rotational motion blur/);
  const sm = await promptFor({ ...BODY, fx: 'smoke' });
  assert.match(sm, /swirling, volumetric smoke/);
});

test('٢. بلا تأثير أو بمفتاح مجهول = الأمر القديم حرفيًّا', async () => {
  const base = await promptFor(BODY);
  assert.doesNotMatch(base, /SHOT EFFECT/);
  assert.match(base, /on wet reflective ground at night/);
  for (const bad of ['', 'x', '__proto__', 'constructor', 'toString', 42, null]) {
    assert.equal(await promptFor({ ...BODY, fx: bad }), base, String(bad));
  }
});

test('٣. التأثير لا يناقض نفسه: لا «أرض مبلّلة ليلًا» معه، ومع صورة الزبون لا يغيّر تصميمها', async () => {
  const td = await promptFor({ ...BODY, fx: 'topdown' });
  assert.doesNotMatch(td, /wet reflective ground at night/);
  assert.match(td, /staged exactly as the SHOT EFFECT above describes/);
  const img = 'A'.repeat(400);
  const withImg = await promptFor({ ...BODY, fx: 'smoke', imageBase64: img, mimeType: 'image/jpeg' });
  assert.match(withImg, /SMOKE REVEAL/);
  assert.match(withImg, /never its real design, colours or details/);
  assert.match(withImg, /must stay EXACTLY as photographed/);
  const noFxImg = await promptFor({ ...BODY, imageBase64: img, mimeType: 'image/jpeg' });
  assert.doesNotMatch(noFxImg, /never its real design/);
});

test('٤. الصفحة: أربعة أزرار بمفاتيح الخادم نفسها، اختيار واحد يُلغى بضغطة ثانية، ويُرسَل fx مع الطلب', () => {
  const keys = [...html.matchAll(/data-fx="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['smoke', 'exploded', 'topdown', 'orbit']);
  for (const k of keys) assert.match(adimage, new RegExp('\\n  ' + k + ": '"), 'مفتاح الخادم ' + k);
  assert.match(html, /setFx\(S\.fx===b\.dataset\.fx\?'':b\.dataset\.fx\);/);
  assert.match(html, /function setFx\(k\)\{ S\.fx=k\|\|''; \[\.\.\.fxEl\.querySelectorAll\('button\[data-fx\]'\)\]\.forEach\(n=>n\.classList\.toggle\('on',n\.dataset\.fx===S\.fx\)\); \}/);
  assert.match(html, /fetch\('\/api\/adimage'[\s\S]{0,300}fx:S\.fx\|\|''/);
  assert.match(adimage, /Object\.prototype\.hasOwnProperty\.call\(FX, b\.fx\)/);
  // الشريط داخل المعرض قبل ناتج التوليد، وأزراره على نظام الألوان الثلاثة
  assert.ok(html.indexOf('id="fxBar"') < html.indexOf('<div id="genOut">'));
  assert.match(html, /\.rtb button,\.fxbar button,/);
});

test('٥. الأسماء بالـ١٤ لغة بلا اسم مزوّد أو نموذج، ووسم القاموس مرفوع', () => {
  global.window = global.window || {};
  delete require.cache[require.resolve('../i18n/ad-studio.js')];
  require('../i18n/ad-studio.js');
  const X = global.window.ADI18N;
  assert.equal(Object.keys(X).length, 14);
  const K = ['fxTitle', 'fxHint', 'fx_smoke', 'fx_exploded', 'fx_topdown', 'fx_orbit'];
  for (const l of Object.keys(X)) {
    for (const k of K) {
      assert.ok(typeof X[l][k] === 'string' && X[l][k].trim(), l + '.' + k);
      assert.doesNotMatch(X[l][k], /claude|gemini|gpt|openai|groq|kling|veo|higgsfield|كلود|جيمناي|جيميني/i, l + '.' + k);
    }
    if (l !== 'en') assert.notEqual(X[l].fx_smoke, X.en.fx_smoke, 'مترجم: ' + l);
  }
  const v = /\/i18n\/ad-studio\.js\?v=(\d+)/.exec(html);
  assert.ok(v && Number(v[1]) >= 610, 'وسم القاموس مرفوع');
});

/* v-ad-fx-chat (المالك ١٨ نوفمبر: «حطه في المحادثة بعد»): اسم التأثير في كلام المحادثة يختاره — في محادثة التطبيق (مسار صورة الإعلان)
   وفي محادثة مساعد الإعلانات بالاستوديو. القائمة واحدة حرفيًّا في الملفّين. */
const app09 = fs.readFileSync('js/app-09-attach.js', 'utf8');
const WRE = /const AD_FX_WORDS=\[.*\];/;
const WORDS = eval('(' + WRE.exec(app09)[0].replace(/^const AD_FX_WORDS=/, '').replace(/;$/, '') + ')');
const pick = (t) => { const w = WORDS.find((x) => x[1].test(t)); return w ? w[0] : ''; };

test('٦. كلمات المحادثة: صيغ المالك نفسها وصيغ عربيّة وإنجليزيّة، وكلام إعلان عاديّ بلا تأثير', () => {
  assert.equal(WRE.exec(html)[0], WRE.exec(app09)[0], 'القائمة نفسها حرفيًّا في الاستوديو ومحادثة التطبيق');
  const YES = {
    smoke: ['سوّلي إعلان عطر سموك ريفيل', 'المنتج يطلع من بين الدخان', 'smoke reveal ad for my watch', 'the bottle rising from the smoke'],
    exploded: ['إعلان ساعة اكسبلودد فيو', 'إعلان سمّاعة بتفكيك القطع', 'exploded view of the headphones'],
    topdown: ['إعلان قهوة دون شوت', 'إعلان كيك لقطة من فوق', 'top-down shot of the burger', 'flat lay ad'],
    orbit: ['إعلان عطر اوربت شوت', 'إعلان سيارة أوربيت', 'إعلان ساعة لقطة دوّارة', 'orbit shot ad'],
  };
  for (const k of Object.keys(YES)) for (const t of YES[k]) assert.equal(pick(t), k, t);
  for (const t of ['إعلان شقة للبيع في الشارقة ٣ غرف', 'سوّلي إعلان لاندكروزر ٢٠٠٤ للبيع ٤٩ ألف', 'إعلان مطعم مشاوي توصيل', 'ad for my bakery', 'ad for my smoke shop', 'إعلان محل دخان وشيشة'])
    assert.equal(pick(t), '', t);
});

test('٧. محادثة التطبيق ترسل fx مع طلب صورة الإعلان، والاستوديو يختار الزرّ ويؤكّد بلا «ابدأ من جديد» بعد التصاميم', () => {
  assert.match(app09, /const __adBody = \{[^\n]*cat:__adCat, bg:__adBg, fx:omranAdFx\(text\), token:/);
  assert.match(app09, /\nfunction omranAdFx\(text\)\{ const w=AD_FX_WORDS\.find\(function\(x\)\{ return x\[1\]\.test\(String\(text\|\|''\)\); \}\); return w\?w\[0\]:''; \}\n/);
  assert.ok(app09.indexOf('function omranAdFx(') < app09.indexOf('async function __sendPromptCore('), 'خارج __sendPromptCore (سقّاطة البنية)');
  assert.match(html, /const fk=fxOf\(t\); if\(fk\)\{ setFx\(fk\); push\('a',esc\(T\('fxTitle'\)\)\+': <b>'\+esc\(T\('fx_'\+fk\)\)\+'<\/b>'\); if\(S\.step>=4\) return; \}/);
  // التأكيد قبل سطر «ابدأ من جديد»
  const s = html.indexOf('function send(){');
  assert.ok(html.indexOf('const fk=fxOf(t)', s) < html.indexOf("if(S.step>=4){ say(T('restartHint'))", s));
});
