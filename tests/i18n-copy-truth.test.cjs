// tests/i18n-copy-truth.test.cjs — v-copy-truth (تدقيق ١٨–١٩ أكتوبر): نصوص قواميس تجاوزها الواقع، بالـ١٤ لغة.
// ١) plansWhyPoints كان «نقاطك خلصت» والرصيد ظاهر فوقه ١٠ نقاط (الردّ 402 points_insufficient = «ما يكفي» لا «صفر»):
//    صار «نقاطك ما تكفي لهذه العمليّة» — صياغة فقط، بلا رقم ولا سعر (باب المال لا يُلمس).
// ٢) بطاقة الأداة «Portrait styles» وورقتها «Photo styles» (العربيّ «أنماط الصور» للاثنين): البطاقة = عنوان الورقة بلا رمزه.
// ٣) «ستايل AI» على البطاقة و«ستوديو AI / Studio AI» في رسالتي الحدّ والدخول، والإنجليزيّ بثلاثة أسماء: الاسم واحد في كلّ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

function dicts() {
  const ctx = { $: () => null, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  const out = { ar: I.ar, en: I.en, own: {} };
  for (const l of LANGS) { out[l] = Object.assign({}, I.en, I[l]); out.own[l] = I[l]; }
  return out;
}
// الرموز في أوّل النصّ (🎨 💄) — كما ينزعها pstyleEn في app-12
const strip = (s) => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

test('١. plansWhyPoints بالـ١٤ لغة: مترجم، ولا يزعم أنّ الرصيد صفر', () => {
  const D = dicts();
  // عبارة «خلصت/نفدت» كما كانت في كلّ لغة
  const ZERO = {
    ar: /خلصت|نفدت|انتهت/, en: /out of points|no points left|ran out/i, es: /sin puntos/i, fil: /Ubos na/i, fr: /n’avez plus de points|n'avez plus de points/i,
    hi: /खत्म हो गए/, id: /habis/i, ml: /തീർന്നു/, ne: /सकिए/, ru: /закончились/i, tr: /bitti/i, ur: /ختم ہو گئے/, zh: /用完/, bn: /শেষ/,
  };
  for (const l of ['ar', 'en'].concat(LANGS)) {
    const v = String(D[l].plansWhyPoints || '');
    assert.ok(v.length > 10, l + ': plansWhyPoints');
    assert.doesNotMatch(v, ZERO[l], l + ': «خلصت» والرصيد قد يكون ١٠');
    assert.doesNotMatch(v, /\d|[٠-٩]/, l + ': بلا رقم');
    if (LANGS.includes(l)) assert.ok(D.own[l].plansWhyPoints && D.own[l].plansWhyPoints !== D.en.plansWhyPoints, l + ': مترجم لا الإنجليزيّ');
  }
  assert.equal(D.ar.plansWhyPoints, 'نقاطك ما تكفي لهذه العمليّة — اشحن من الباقات وكمّل مباشرة.');
  assert.equal(D.en.plansWhyPoints, 'You don’t have enough points for this — top up from Plans and continue right away.');
});

test('٢. اسم بطاقة «أنماط الصور» = عنوان ورقتها بلا الرمز، بالـ١٤ لغة', () => {
  const D = dicts();
  for (const l of ['ar', 'en'].concat(LANGS)) {
    assert.ok(D[l].portraitStyleSheetTitle, l);
    assert.equal(D[l].portraitBtnTitle, strip(D[l].portraitStyleSheetTitle), l + ': البطاقة والورقة باسمين');
  }
  assert.equal(D.en.portraitBtnTitle, 'Photo styles');
});

test('٣. «ستايل AI» اسم واحد: رسالتا الحدّ والدخول تحملان عنوان الأداة نفسه في كلّ لغة، ولا «ستوديو/Studio AI»', () => {
  const D = dicts();
  const STUDIO = /ستوديو|Studio|स्टूडियो|স্টুডিও|Stüdyo|स्टुडियो|اسٹوڈیو|സ്റ്റുഡിയോ/;
  for (const l of ['ar', 'en'].concat(LANGS)) {
    const title = strip(D[l].studioAiTitle);
    assert.ok(title.length >= 4, l + ': studioAiTitle');
    assert.doesNotMatch(title, STUDIO, l + ': العنوان «ستوديو»');
    for (const k of ['studioAiLimitReached', 'studioAiNeedLogin']) {
      const v = String(D[l][k] || '');
      assert.ok(v.includes(title), l + ':' + k + ' بلا «' + title + '»: ' + v);
      assert.doesNotMatch(v.split(title).join(''), /ستوديو AI|Studio AI|Studio IA|स्टूडियो AI|স্টুডিও AI|Stüdyo AI|स्टुडियो AI|اسٹوڈیو AI/, l + ':' + k);
    }
  }
  assert.equal(D.en.studioAiModalTitle, '💄 Style AI');
  assert.equal(D.ar.studioAiLimitReached, '⏳ لقد استهلكت حد ستايل AI المجاني لليوم. حاول مرة أخرى غدًا.');
});

test('٤. زرّ الأداة في index.html: النصّ الاحتياطيّ والتلميح «ستايل AI»', () => {
  const html = read('index.html');
  const m = html.match(/<button class="btn" id="btnStudioAI" title="([^"]*)" data-i18n-title="studioAiTitle">[\s\S]*?<span class="btnLabel" data-i18n="studioAiTitle">([^<]*)<\/span><\/button>/);
  assert.ok(m, 'زرّ btnStudioAI');
  assert.equal(m[1], 'ستايل AI');
  assert.equal(m[2], 'ستايل AI');
});
