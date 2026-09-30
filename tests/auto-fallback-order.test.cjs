'use strict';
/* v-fallback-nine (طلب المالك ٣٠ سبتمبر: «أريد ٩ مزودين كلهم، إذا فشل الأول للثاني»).
   AUTO_FALLBACK_ORDER في app-06-checkout.js كانت أربعة مزوّدين فقط بحجّة أنّ الباقين يحتاجون
   مفتاحًا شخصيًّا — كلّ دوالّ الاستدعاء الخمس الباقية (callOpenRouter/callPerplexity/callMistral/
   callDeepSeek/callCohere) تسقط فعليًّا لوكيل خادم بمفتاح المالك حين لا يوجد مفتاح شخصيّ، فلا مانع
   تقنيّ يبقى. هذا الاختبار يقفل: التسعة كاملة، مطابقة لـPROVIDERS في api/ai.js عنصرًا عنصرًا (نفس
   القائمة الحاسمة التي يقفلها tests/routing-anchors.test.cjs)، وكلّ واحد له مسار استدعاء فعليّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const checkout = fs.readFileSync(path.join(root, 'js/app-06-checkout.js'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'api/ai.js'), 'utf8');

function listOf(src, decl) {
  const i = src.indexOf(decl);
  assert.ok(i > 0, 'التعريف موجود: ' + decl);
  const seg = src.slice(i, src.indexOf(']', i) + 1);
  return (seg.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
}

test('AUTO_FALLBACK_ORDER: تسعة مزوّدين، مطابقون لـPROVIDERS في api/ai.js عنصرًا عنصرًا (كمجموعة)', () => {
  const order = listOf(checkout, "const AUTO_FALLBACK_ORDER = [");
  const providers = listOf(ai, "const PROVIDERS = [");
  assert.strictEqual(order.length, 9, 'تسعة مزوّدين بالضبط');
  assert.deepStrictEqual([...order].sort(), [...providers].sort(), 'نفس مجموعة PROVIDERS بلا نقص ولا زيادة');
});

test('كلّ مزوّد في القائمة له مسار استدعاء فعليّ في callProviderAI (لا مزوّد وهميّ)', () => {
  const fn = checkout.slice(checkout.indexOf('async function callProviderAI('), checkout.indexOf('async function callAI('));
  const order = listOf(checkout, "const AUTO_FALLBACK_ORDER = [");
  order.forEach((p) => {
    if (p === 'openai') { assert.match(fn, /return await callOpenAILike\(/, 'openai: المسار الافتراضيّ'); return; }
    assert.match(fn, new RegExp("effective === '" + p + "'"), p + ': مذكور صراحة في callProviderAI');
  });
});

test('التعليق الجديد لا يدّعي استثناء مزوّد بسبب مفتاح شخصيّ (الاستثناء القديم لم يعد صحيحًا)', () => {
  const note = checkout.slice(checkout.indexOf('v-fallback-nine'), checkout.indexOf('const AUTO_FALLBACK_ORDER'));
  assert.match(note, /تسقط تلقائيًّا لوكيل الخادم[\s\S]{0,20}بمفتاح المالك/);
  assert.doesNotMatch(checkout.slice(checkout.indexOf('const AUTO_FALLBACK_ORDER'), checkout.indexOf('const AUTO_FALLBACK_ORDER') + 400),
    /skipping ones that need a personal API key/, 'التعليق القديم المضلِّل أُزيل');
});
