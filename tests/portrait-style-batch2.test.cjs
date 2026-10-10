// tests/portrait-style-batch2.test.cjs — v-pstyle-batch-2 (٢١ سبتمبر ٢٠٢٦): المالك طلب أفكارًا جديدة
// لمعرض «أنماط الصور» ثمّ «رتّبهم كلهم» — ٢١ ستايلًا جديدًا (٧ رائجة، ٨ تراث خليجي، ٣ أدوات عملية،
// ٣ مناسبات) أُضيفت فوق الـ٧٣ الأصليّة (٩٤ إجمالًا). كل ستايل يحتاج: خيارًا في القائمة، وصفًا في
// PSTYLE_SUBS، ترجمة STU_XL، ترجمة تسمية الخيار في الـ١٤ لغة (app-03-i18n-data.js + i18n/*.js)، وبرومبت
// خادم في api/_lib/portrait-style.js، ومدخلًا في scripts/portrait-thumbs.mjs لتوليد صورته المصغّرة لاحقًا.
// هذا الاختبار يقفل الحلقة كاملة لكل الـ٢١ — الاختبارات العامّة (portrait-style-i18n) تتحقّق من ٩٤ التطابق
// الديناميكيّ أصلًا؛ هذا الاختبار خاصّ بدفعة الأفكار الجديدة تحديدًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const NEW_IDS = [
  'tarot', 'stamp', 'moviePoster', 'diorama', 'emoji3d', 'y2k', 'albumCover',
  'sheikh', 'falconry', 'arabianHorse', 'saudiHeritage', 'kuwaitiHeritage',
  'omaniHeritage', 'qatariHeritage', 'bahrainiHeritage',
  'eyefix', 'glasses', 'bokeh',
  'henna', 'firstday', 'flagday',
];
const NEW_LABEL_KEYS = {
  tarot: 'portraitStyleTarot', stamp: 'portraitStyleStamp', moviePoster: 'portraitStyleMoviePoster',
  diorama: 'portraitStyleDiorama', emoji3d: 'portraitStyleEmoji3d', y2k: 'portraitStyleY2k',
  albumCover: 'portraitStyleAlbumCover', sheikh: 'portraitStyleSheikh', falconry: 'portraitStyleFalconry',
  arabianHorse: 'portraitStyleArabianHorse', saudiHeritage: 'portraitStyleSaudiHeritage',
  kuwaitiHeritage: 'portraitStyleKuwaitiHeritage', omaniHeritage: 'portraitStyleOmaniHeritage',
  qatariHeritage: 'portraitStyleQatariHeritage', bahrainiHeritage: 'portraitStyleBahrainiHeritage',
  eyefix: 'portraitStyleEyefix', glasses: 'portraitStyleGlasses', bokeh: 'portraitStyleBokeh',
  henna: 'portraitStyleHenna', firstday: 'portraitStyleFirstday', flagday: 'portraitStyleFlagday',
};

const partials = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');
const studios = fs.readFileSync(path.join(root, 'js/app-12-studios.js'), 'utf8');
const i18nData = fs.readFileSync(path.join(root, 'js/app-03-i18n-data.js'), 'utf8');
const portraitStyleSrv = fs.readFileSync(path.join(root, 'api/_lib/portrait-style.js'), 'utf8');
const thumbsScript = fs.readFileSync(path.join(root, 'scripts/portrait-thumbs.mjs'), 'utf8');

test('كل الـ٢١ ستايلًا الجديد له خيار <option> في partials-core.js', () => {
  for (const id of NEW_IDS) {
    assert.match(partials, new RegExp('option value="' + id + '"'), id + ': لا خيار في القائمة');
  }
});

test('كل الـ٢١ له مفتاح ترجمة data-i18n في app-03-i18n-data.js (ar و en)', () => {
  for (const id of NEW_IDS) {
    const key = NEW_LABEL_KEYS[id];
    const count = (i18nData.match(new RegExp(key + ':', 'g')) || []).length;
    assert.ok(count >= 2, key + ': يحتاج مدخلًا عربيًّا وإنجليزيًّا على الأقلّ (وُجد ' + count + ')');
  }
});

test('كل الـ٢١ له ترجمة في الـ١٢ ملفّ i18n/*.js', () => {
  const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
  for (const lang of LANGS) {
    const src = fs.readFileSync(path.join(root, 'i18n/' + lang + '.js'), 'utf8');
    for (const id of NEW_IDS) {
      assert.match(src, new RegExp(NEW_LABEL_KEYS[id] + ":"), 'i18n/' + lang + '.js ينقصه ' + NEW_LABEL_KEYS[id]);
    }
  }
});

test('كل الـ٢١ له برومبت فعليّ في الخادم (STYLE_PROMPTS أو EDIT_PROMPTS) لا يسقط للافتراضي', () => {
  function objKeys(src, name) {
    const s = src.indexOf('const ' + name + ' = {');
    const e = src.indexOf('\n};', s);
    return [...src.slice(s, e).matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  }
  const stylePrompts = new Set(objKeys(portraitStyleSrv, 'STYLE_PROMPTS'));
  const editPrompts = new Set(objKeys(portraitStyleSrv, 'EDIT_PROMPTS'));
  for (const id of NEW_IDS) {
    assert.ok(stylePrompts.has(id) || editPrompts.has(id), id + ': لا برومبت في STYLE_PROMPTS ولا EDIT_PROMPTS');
  }
});

test('الأدوات العملية الثلاث (eyefix/glasses/bokeh) مضافة لقائمة isLocalizedEdit — تعديل موضعيّ لا إعادة رسم', () => {
  const i = portraitStyleSrv.indexOf('const isLocalizedEdit');
  assert.ok(i > 0);
  const line = portraitStyleSrv.slice(i, portraitStyleSrv.indexOf('\n', i));
  assert.match(line, /'eyefix'/);
  assert.match(line, /'glasses'/);
  assert.match(line, /'bokeh'/);
});

test('مناسبات الدفعة الجديدة (henna/firstday/flagday) في مصفوفة فروع الإطار الاحتفاليّ', () => {
  assert.match(portraitStyleSrv, /\['eid', 'national', 'ramadan', 'hajj', 'birthday', 'newborn', 'henna', 'firstday', 'flagday'\]/);
});

test('كل الـ٢١ مسجَّل في scripts/portrait-thumbs.mjs (ART_STYLES أو UTILITY_PAYLOADS) وله مصدر وجه في STYLE_SOURCE', () => {
  function grab(name, isArr) {
    const marker = 'const ' + name + ' = ' + (isArr ? '[' : '{');
    const s = thumbsScript.indexOf(marker);
    assert.ok(s > 0, name + ' موجودة في portrait-thumbs.mjs');
    const closeChar = isArr ? '];' : '\n};';
    const e = thumbsScript.indexOf(closeChar, s);
    const code = thumbsScript.slice(s, e + (isArr ? 2 : 3));
    return new Function(code + '; return ' + name + ';')();
  }
  const art = grab('ART_STYLES', true);
  const util = Object.keys(grab('UTILITY_PAYLOADS', false));
  const srcMap = grab('STYLE_SOURCE', false);
  for (const id of NEW_IDS) {
    assert.ok(art.includes(id) || util.includes(id), id + ': غير مسجَّل في ART_STYLES ولا UTILITY_PAYLOADS');
    assert.ok(id in srcMap, id + ': بلا مصدر وجه في STYLE_SOURCE');
  }
});

test('لا تصادم: مفتاح PSTYLE_SUBS الجديد موجود فعليًّا كمفتاح في STU_XL (حرفيًّا)', () => {
  const subsStart = studios.indexOf('const PSTYLE_SUBS = {');
  const subsEnd = studios.indexOf('\n  };', subsStart) + 5;
  const subsBlock = studios.slice(subsStart, subsEnd);
  const subsPairs = new Map([...subsBlock.matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2]]));
  const stuStart = studios.indexOf('const STU_XL = {');
  const stuEnd = studios.indexOf('\n};', stuStart) + 3;
  const stuBlock = studios.slice(stuStart, stuEnd);
  const stuKeys = new Set([...stuBlock.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]));
  for (const id of NEW_IDS) {
    assert.ok(subsPairs.has(id), id + ': غائب عن PSTYLE_SUBS');
    assert.ok(stuKeys.has(subsPairs.get(id)), id + ': مفتاحه "' + subsPairs.get(id) + '" غائب عن STU_XL');
  }
});
