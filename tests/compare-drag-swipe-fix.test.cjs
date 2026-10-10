// tests/compare-drag-swipe-fix.test.cjs — v-compare-drag-swipe-fix (٢١ سبتمبر ٢٠٢٦): المالك «السحب
// يسحب الشاشة كاملة إلى الخارج» عند سحب شريط قبل/بعد. الجذر: app-05-swipe-back.js يستمع لأيّ سحب أفقيّ
// (يمين) من أيّ مكان داخل الأداة ليغلقها كاملة — كان يستثني <input type=range> صراحةً، لكن v-compare-drag/
// v-compare-drag-all استبدلا ذاك الـinput بسحب مباشر على <div> عاديّ غير مستثنى، فيتنازع الاثنان وتغلب
// إشارة الإغلاق. تحقّق حيّ فعليّ (محاكاة سحب فأرة/مؤشّر حقيقيّة) أثبت أنّ السحب كان يُغلق الورقة فعليًّا
// قبل هذا الإصلاح. هذا الاختبار يقفل استثناء حاويات المقارنة الأربع من بوابة الإغلاق.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

for (const file of ['js/app-05-swipe-back.js', 'js/app.bundle.js']) {
  test(file + ': حاويات المقارنة الأربع مستثناة من بوابة سحب-للإغلاق (blocked)', () => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const i = src.indexOf('function blocked(t)');
    assert.ok(i > 0, 'الدالّة blocked موجودة');
    const block = src.slice(Math.max(0, i - 400), i + 900);
    assert.match(block, /portraitCompareWrap:\s*1/, 'أنماط الصور مستثناة');
    assert.match(block, /designBAWrap:\s*1/, 'التصميم الداخليّ مستثنى');
    assert.match(block, /fashionAiResultWrap:\s*1/, 'الأزياء مستثناة');
    assert.match(block, /studioAiResultWrap:\s*1/, 'الاستوديو مستثنى');
    assert.match(src.slice(i, i + 700), /COMPARE_DRAG_IDS\[e\.id\]/, 'blocked() يتحقّق فعليًّا من هذه الحاويات');
  });
}
