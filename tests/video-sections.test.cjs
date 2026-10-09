// tests/video-sections.test.cjs — v-vmk-sections: شريط أقسام (الترندات + الأوضاع)، ٣ نماذج لكلّ وضع، وشخصيّات داخل الفيديو
// (المالك: «الترندات فوق وعقبها كانفا قسم وفيديو AI قسم… بلا تقسيم الترندات» + «٣ نماذج» + «نضيف شخصيّات والمتحدّث والكتابة»)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('js/video.js');

const MODES = ['Canvas', 'Runway', 'Minimax', 'Omni', 'Hybrid', 'Veo', 'Actor'];
const KEYS = ['videoTabTrends', 'vcTitle', 'vcSub', 'vcAdd', 'vcName', 'vcLine', 'vcMale', 'vcFemale', 'vcRemove', 'vwToChars']
  .concat(MODES.reduce((a, m) => a.concat(['videoIdea' + m + '2', 'videoIdea' + m + '3']), []));
const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];

test('الأقسام: الترندات أوّلًا ثمّ كلّ وضع، والتبويب يبدّل الوضع ويخفي الاستوديو في الترندات', () => {
  assert.ok(js.includes("var TABS=['trend','canvas','runway','minimax','omni','hybrid','veo','actor']"));
  assert.ok(js.includes("var tab='trend'") && js.includes("if(open&&!wasOpen){ tab='trend'; }"));
  assert.ok(js.includes("sel.value=v; sel.dispatchEvent(new Event('change'))"));
  const css = read('css/modules.css');
  assert.ok(css.includes('.vmk-studio.vmk-tab-trend>.vmk-side'));
  assert.ok(css.includes('.vmk-studio:not(.vmk-tab-trend)>#vtRoot'));
  assert.ok(css.includes('.vmk-cards,#videoMakerModal .vmk-main label[data-i18n="videoModeLabel"]{display:none'));
});

test('النماذج: ثلاثة لكلّ وضع من مفاتيح اللغة، والفيديو يُقرأ من الجدول بلا طلب شبكة، وبلا عنوان «نماذج جاهزة»', () => {
  assert.ok(js.includes("keys=['videoIdea'+c,'videoIdea'+c+'2','videoIdea'+c+'3']"));
  assert.ok(js.includes("var VIDEOS={}") && js.includes("/media/samples/"));
  assert.ok(!/نماذج جاهزة/.test(js) && !/نماذج جاهزة/.test(read('js/app-03-i18n-data.js')));
});

test('الشخصيّات: حتّى ثلاث، تُدمَج في الوصف عند «إنشاء» بلا تكرار، والكتابة تعرف أسماءها', () => {
  assert.ok(js.includes('var MAXCH=3'));
  assert.ok(js.includes("gb.addEventListener('click',compose,true)"));
  assert.ok(js.includes('v.slice(-lastBlock.length)===lastBlock'));
  assert.ok(js.includes("characters:chars.map(function(c){return c.name.trim();})"));
  assert.ok(js.includes("L('vwToChars')"));
});

test('النصوص الجديدة بالـ١٤ لغة (ar+en في القاموس الأساسيّ، و١٢ ملفّ لغة)', () => {
  const base = read('js/app-03-i18n-data.js');
  KEYS.forEach((k) => assert.equal((base.match(new RegExp('\\b' + k + ': "', 'g')) || []).length, 2, k));
  LANGS.forEach((lg) => { const s = read('i18n/' + lg + '.js'); KEYS.forEach((k) => assert.ok(new RegExp('^\\s*' + k + ': "[^"]+",', 'm').test(s), lg + ' ← ' + k)); });
});

test('نظافة الواجهة (طلب المالك «شيل الأيقونات… شغل نضيف»): بطاقة الترند بلا إيموجي ولا سطر وصف تحتها، والنافذة تُنظَّف عند العرض', () => {
  const tr = read('js/app-11-video-trends.js');
  assert.ok(!/t\.em\b/.test(tr), 'لا إيموجي الترند في البطاقة ولا في الرأس');
  assert.ok(!/T\(t\.sub\)/.test(tr.slice(tr.indexOf('function card('), tr.indexOf('function renderGrid('))), 'لا سطر وصف تحت البطاقة');
  assert.ok(tr.includes('function noEmoji(') && tr.includes('return noEmoji(T(D.ui[k]))'));
  assert.ok(js.includes('function scrub()') && js.includes('sync(); scrub(); }'));
  assert.ok(!/'⚡ '|'🎁|⚙️/.test(js), 'شارات النقاط والخيارات المتقدّمة بلا إيموجي');
  // الدالّة نفسها: تزيل الإيموجي وتبقي النصّ والأرقام
  const re = /[\u{1F000}-\u{1FFFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  assert.equal('🎬 قصة بيكسار ٣ ⚡ 60 نقطة ✨'.replace(re, '').replace(/\s{2,}/g, ' ').trim(), 'قصة بيكسار ٣ 60 نقطة');
});
