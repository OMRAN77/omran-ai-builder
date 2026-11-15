// v-i18n-14 (المالك ١٤ نوفمبر: «افحص التطبيق كامل عن اللغات 14»): مسح كلّ الشاشات بالأربع عشرة لغة في المتصفّح وجد نصوصًا
// إنجليزيّة في اللغات الاثنتي عشرة الأخرى (حالات صانع الفيديو، الساعة، أسماء الشعر، المعاملات، القوالب، التلفزيون، آلة الزمن…)
// ونصًّا عربيًّا في غير العربيّة («(فريق om ai)» في «عن التطبيق»، قناتان، سطر التلفزيون). هذه الاختبارات تمنع رجوعها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LANGS = ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil'];
const AR = /[\u0600-\u06FF]/;

/* القاموس كما يحمّله المتصفّح: I18N (ar/en) ثمّ ملفّات اللغات الكسولة، و__BI الذي تقرؤه __bT */
function loadDicts() {
  const ctx = { $: () => null, document: { getElementById: () => null, querySelector: () => null, documentElement: {} }, console, localStorage: { getItem: () => null } };
  ctx.window = ctx; vm.createContext(ctx);
  const src = read('js/app-03-i18n-data.js');
  const a = src.indexOf('const I18N = {'), b = src.indexOf('};window.I18N = I18N;') + 2;
  vm.runInContext('var I18N=' + src.slice(a + 'const I18N = '.length, b) + ';', ctx);
  for (const L of LANGS) vm.runInContext(read('i18n/' + L + '.js'), ctx);
  return { I: ctx.I18N, BI: ctx.__BI };
}
const { I, BI } = loadDicts();
const unesc = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

test('١. كلّ نصّ bT ثابت في الواجهة له ترجمة في __BI بكلّ اللغات الاثنتي عشرة (كان ٣٤ إنجليزيًّا في كلّها)', () => {
  const re = /\bbT\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*\)/g;
  const files = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && f !== 'app.bundle.js' && !f.startsWith('app-03-i18n-data'));
  const miss = [];
  let n = 0;
  for (const f of files) {
    const s = read('js/' + f); let m;
    while ((m = re.exec(s))) {
      const en = unesc(m[4]); if (!/[A-Za-z]/.test(en)) continue; n++;
      const gaps = LANGS.filter((L) => !(BI[L] && typeof BI[L][en] === 'string' && BI[L][en]));
      if (gaps.length) miss.push(f + ': ' + JSON.stringify(en).slice(0, 80) + ' ← ' + gaps.join(','));
    }
  }
  assert.ok(n > 100, 'وُجدت نصوص bT: ' + n);
  assert.deepEqual(miss, []);
});

test('٢. ترجمات __BI الجديدة: العناصر النائبة نفسها، ولا حرف عربيّ في غير الأرديّة', () => {
  for (const L of LANGS) {
    for (const [en, v] of Object.entries(BI[L] || {})) {
      const ph = (x) => (String(x).match(/\{[a-z]\}/g) || []).sort().join();
      assert.equal(ph(v), ph(en), L + ': ' + en);
      if (L !== 'ur' && /^(?:⏳|🎬|🚀|🎙️|Scene|The video|Lost connection)/.test(en)) assert.ok(!AR.test(v), L + ': ' + en);
    }
  }
});

test('٣. الساعة: التاريخ والوقت بلغة الواجهة، والمدن عبر __bT ولها ترجمة بكلّ اللغات (كانت إنجليزيّة)', () => {
  const s = read('js/app-06-checkout.js');
  const a = s.indexOf('const CLOCK_TIMEZONES'), b = s.indexOf('];', a);
  const labels = [...s.slice(a, b).matchAll(/en:'([^']+)'/g)].map((m) => m[1]);
  assert.equal(labels.length, 41);
  for (const L of ['ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml']) for (const e of labels) assert.ok(BI[L][e] && BI[L][e] !== e, L + ': ' + e); /* بغير اللاتينيّة لا يبقى إنجليزيًّا */
  for (const L of LANGS) assert.ok(labels.every((e) => typeof BI[L][e] === 'string'), L + ': كلّ المدن');
  assert.ok(!/new Intl\.DateTimeFormat\(lang === 'ar' \? 'ar-SA-u-nu-latn' : 'en-US'/.test(s), 'لا en-US لكلّ اللغات');
  assert.match(s, /function clockCityName\(z\)\{ return \(typeof window\.__bT === 'function'\) \? window\.__bT\(z\.ar, z\.en\)/);
  /* clockLocale: العربيّة كما كانت حرفيًّا، والصينيّة والفلبينيّة بمنطقتهما */
  const c = { lang: 'ar' }; vm.createContext(c);
  vm.runInContext(s.slice(s.indexOf('function clockLocale('), s.indexOf('function clockCityName(')), c);
  assert.equal(c.clockLocale(), 'ar-SA-u-nu-latn');
  c.lang = 'zh'; assert.equal(c.clockLocale(), 'zh-CN-u-nu-latn');
  c.lang = 'fr'; assert.equal(c.clockLocale(true), 'fr-u-ca-islamic-umalqura-nu-latn');
  assert.equal(BI.zh['Palestine - Gaza'], '巴勒斯坦 - 加沙');
});

test('٤. الاستوديو والمعاملات الحكوميّة وآلة الزمن: النصوص التي كانت إنجليزيّة لها ترجمة بكلّ اللغات', () => {
  const want = ['🌫️ Ash brown', 'Blue-black', 'Gulf braids', 'Natural silver', 'Renew residence visa', 'Renew passport',
    'Time Machine — project versions', 'No saved versions yet — every code change is saved here automatically.', '↩️ Restore'];
  for (const L of LANGS) for (const e of want) assert.ok(typeof BI[L][e] === 'string' && BI[L][e], L + ': ' + e);
  const tm = read('js/app-10-features.js');
  assert.ok(!/isAr \? 'آلة الزمن/.test(tm) && tm.includes("__tmT('آلة الزمن — إصدارات المشروع', 'Time Machine — project versions')"), 'آلة الزمن عبر __bT');
  assert.match(read('js/ui-docs.js'), /T\(c,en\)/, 'المعاملات عبر T ← __bT');
});

test('٥. القوالب بالأربع عشرة لغة، والعرض لا يحصرها في سبع', () => {
  const c = {}; vm.createContext(c); vm.runInContext(read('templates-data.js') + ';this.T=TEMPLATES;', c);
  const ALL = ['ar', 'en'].concat(LANGS);
  for (const t of c.T) for (const L of ALL) assert.ok(t.title[L] && t.desc[L], t.id + ': ' + L);
  assert.match(read('js/app-05-ui.js'), /\['ar','en','fr','es','tr','ru','zh','hi','ur','bn','ne','ml','id','fil'\]\.includes\(L\)/);
  const v = Number((read('index.html').match(/templates-data\.js\?v=(\d+)/) || [])[1]);
  assert.ok(v >= 591, 'وسم القوالب رُفع: ' + v);
});

test('٦. التلفزيون: مفاتيحه في القواميس الأربعة عشر، والقناتان وسطر التشخيص بلا عربيّة في غير العربيّة', () => {
  const s = read('js/app-25-tv.js');
  const keys = [...new Set([...s.matchAll(/tvT\('(tv[A-Za-z]+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 20);
  for (const k of keys) for (const L of ['ar', 'en'].concat(LANGS)) assert.ok(typeof I[L][k] === 'string' && I[L][k], L + ': ' + k);
  assert.ok(s.includes('"الشارقة 2": "Sharjah 2"') && s.includes('"الفجيرة": "Fujairah TV"'));
  assert.ok(!s.includes("' · روابط:' + __links"), 'كلمة «روابط» عبر tvT');
});

test('٧. «عن التطبيق» بلا «(فريق om ai)» العربيّة في اللغات الأخرى، والعربيّة كما هي', () => {
  for (const L of ['en'].concat(LANGS.filter((x) => x !== 'ur'))) assert.ok(!AR.test(I[L].aboutText), L);
  assert.ok(I.ar.aboutText.includes('من تطوير فريق om ai'));
});

test('٨. إضافات التعليم لها الأرديّة كلّها (كانت إنجليزيّة في واجهتها)، ووسمها رُفع', () => {
  const c = { window: {} }; vm.createContext(c);
  const s = read('js/edu-plus.js');
  vm.runInContext(s.slice(s.indexOf('window.__EDU_XL2 = {'), s.indexOf('/* v-i18n-14 (فحص اللغات')), c);
  const a = s.indexOf('(function(){ var X = window.__EDU_XL2, UR ='); vm.runInContext(s.slice(a, s.indexOf('})();', a) + 5), c);
  const X = c.window.__EDU_XL2, keys = Object.keys(X);
  assert.ok(keys.length >= 150);
  assert.deepEqual(keys.filter((k) => !X[k].ur), []);
  assert.equal(X['خوارزميات الألعاب'].ur, 'گیم الگورتھم');
  assert.ok(Number((read('index.html').match(/edu-plus\.js\?v=(\d+)/) || [])[1]) >= 8);
});

test('٩. نصّ التجديد في الأسعار يتبع ملفّ اللغة إن وصل بعد رسمه، والمفتاحان المفقودان صارا في كلّ اللغات', () => {
  assert.match(read('js/app-06-checkout.js'), /hint\.setAttribute\('data-i18n', on \? 'autoRenewOnHint' : 'autoRenewOffHint'\)/);
  for (const L of LANGS) assert.ok(I[L].stModelFallback && I[L].stModelFallback.includes('{model}'), L);
  assert.ok(I.tr.portraitStyleLowpoly !== I.en.portraitStyleLowpoly && I.ru.portraitStyleLowpoly !== I.en.portraitStyleLowpoly);
  /* أسماء الدول بالنيباليّة: Chromium بلا بياناتها فكانت ١٦١ دولة إنجليزيّة في الأسعار — جدول مولَّد من ICU الكامل */
  const cur = read('js/currency.js'), ne = JSON.parse(cur.match(/var NE_REGION = (\{[^\n]*\});/)[1]);
  assert.ok(Object.keys(ne).length >= 160 && ne.AE === 'संयुक्त अरब इमिराट्स' && ne.PS === 'प्यालेस्टाइन');
  assert.match(cur, /if\(Lg === 'ne' && NE_REGION\[x\.c\]\) return NE_REGION\[x\.c\];/);
  assert.match(read('js/partials-settings.js'), /currency\.js\?v=(\d+)/);
  assert.ok(read('package.json').includes('node tests/i18n-14.test.cjs'));
  assert.ok(read('knowledge/DECISIONS.md').includes('v-i18n-14'));
});
