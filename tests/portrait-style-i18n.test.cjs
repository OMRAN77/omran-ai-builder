// tests/portrait-style-i18n.test.cjs — v-pstyle-i18n-fix (٢١ سبتمبر ٢٠٢٦): المالك شكّ أنّ «أكثر من ١٠
// أدوات» في معرض «أنماط الصور» لا تشتغل. تدقيق حيّ (نقر كلّ الـ٧٣ بطاقة عبر متصفّح فعليّ) أثبت أنّ التوصيل
// (الاختيار، إظهار الحقول الإضافية، خرائط الخادم) سليم ١٠٠٪ — لا ١٠ أدوات معطّلة. لكن الفحص كشف عطبين
// حقيقيّين محدودين في STU_XL (قاموس ترجمة أوصاف الأنماط): مفتاح «جرافيتي» كان نصًّا بنغاليًّا تالفًا بدل
// عربيّته الفعليّة (فيفقد ترجمته في ١٢ لغة)، وحقل الهندي لِـ«رعب هالوين» فيه حرف صينيّ دخيل. هذا الاختبار
// يقفل الاثنين ويمنع تكرار نمط العطب (تلوّث سكربت بين حقول اللغات).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-12-studios.js'), 'utf8');

function block(varName, endMarker) {
  const start = src.indexOf('const ' + varName + ' = {');
  assert.ok(start > 0, varName + ' موجود');
  const end = src.indexOf(endMarker, start) + endMarker.length;
  return src.slice(start, end);
}

const stuBlock = block('STU_XL', '\n};');
const subsBlock = block('PSTYLE_SUBS', '\n  };');

test('١. كل مفتاح عربيّ في PSTYLE_SUBS له ترجمة مطابقة في STU_XL (بلا مفاتيح تالفة)', () => {
  const stuKeys = new Set([...stuBlock.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]));
  const subsPairs = [...subsBlock.matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => ({ id: m[1], ar: m[2] }));
  const missing = subsPairs.filter((p) => !stuKeys.has(p.ar));
  assert.deepEqual(missing, [], 'كل نمط في PSTYLE_SUBS يجب أن يجد مفتاحه حرفيًّا في STU_XL');
});

test('٢. مفتاح الجرافيتي عربيّ سليم يطابق خيار الواجهة، لا نصّ بنغاليّ تالف', () => {
  assert.match(stuBlock, /'جرافيتي شارع جريء': \{en:'Bold Street Graffiti'/, 'المفتاح صار عربيًّا مطابقًا لـPSTYLE_SUBS.graffiti');
  assert.doesNotMatch(stuBlock, /[ঀ-৿][^']*جريء':/, 'لا بقايا نصّ بنغاليّ في مفتاح عربيّ');
});

test('٣. حقل الهندي لِـ«رعب هالوين» عربيّ الأصل خالٍ من حروف صينيّة دخيلة', () => {
  const line = stuBlock.match(/'أجواء رعب هالوين':[^\n]*/)[0];
  const hi = line.match(/hi:'((?:[^'\\]|\\.)*)'/)[1];
  assert.ok(!/[一-鿿]/.test(hi), 'حقل hi يجب ألّا يحوي حروفًا من نطاق الصينيّة: ' + hi);
});

test('٤. كل خيار في select#portraitStyleSelect (partials-core.js) له نظير في PSTYLE_SUBS، والعكس', () => {
  const partials = fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8');
  const selStart = partials.indexOf('id="portraitStyleSelect"');
  const selEnd = partials.indexOf('</select>', selStart);
  const selBlock = partials.slice(selStart, selEnd);
  const selectIds = new Set([...selBlock.matchAll(/option value="(\w+)"/g)].map((m) => m[1]));
  const subsIds = new Set([...subsBlock.matchAll(/(\w+):\s*'/g)].map((m) => m[1]));
  assert.deepEqual([...selectIds].filter((v) => !subsIds.has(v)).sort(), [], 'كل خيار بالقائمة له وصف في PSTYLE_SUBS');
  assert.deepEqual([...subsIds].filter((v) => !selectIds.has(v)).sort(), [], 'كل مفتاح بـPSTYLE_SUBS له خيار فعليّ بالقائمة');
});
