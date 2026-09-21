// v-maha-hide-composer (بلاغ المالك: "احذف صندوق الكتابة الي في مها") — مكالمة مها
// العائمة كانت تُفتح وصندوق كتابة المحادثة الرئيسي (#inputbar) يبقى ظاهرًا وقابلًا
// للاستخدام خلفها (تأكّد حيًّا عبر ui-shot: display:flex وoffsetParent!==null أثناء
// المكالمة). الإصلاح: mahaHideComposer()/mahaShowComposer() تُخفيانه وتُعيدانه، تُستدعيان
// من mahaStartCallInner (وضع "assistant" فقط — لا "builder" لأنّ تبويب الصوت مستقل
// أصلًا ولا يتراكب مع الصندوق) وmahaEndCall على التوالي.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');

test('الاستدعاء: يُخفى في بدء المكالمة (assistant فقط) ويُعاد إظهاره عند الإنهاء', () => {
  assert.match(src, /if\(mahaCallMode !== 'builder'\) mahaHideComposer\(\);/, 'يُستدعى بعد فتح شاشة المكالمة، ولا يمسّ وضع البنّاء');
  const endCallStart = src.indexOf('function mahaEndCall(){');
  const endCallBody = src.slice(endCallStart, endCallStart + 400);
  assert.match(endCallBody, /mahaShowComposer\(\);/, 'أوّل ما تنتهي المكالمة يرجع الصندوق');
});

function buildIsolated() {
  const start = src.indexOf('let mahaComposerHidden = false;');
  const end = src.indexOf('\n}\n', src.indexOf('function mahaShowComposer(){')) + 3;
  assert.ok(start > 0 && end > start, 'مقطع الدالتين موجود');
  const chunk = src.slice(start, end);
  const bar = { style: { display: 'flex' }, dataset: {} };
  const ctx = {
    document: { getElementById: (id) => (id === 'inputbar' ? bar : null) },
    __swallow: () => {},
  };
  vm.runInNewContext(chunk + '\nthis.hide = mahaHideComposer; this.show = mahaShowComposer;', ctx);
  return { ctx, bar };
}

test('الإخفاء: يحفظ العرض السابق ويضبط none، ولا يكرّر الحفظ لو نُودي مرّتين', () => {
  const { ctx, bar } = buildIsolated();
  ctx.hide();
  assert.equal(bar.style.display, 'none');
  assert.equal(bar.dataset.mahaPrevDisplay, 'flex');
  bar.style.display = 'none'; // لو تغيّر شيء خارجيًا أثناء الإخفاء
  ctx.hide(); // نداء ثانٍ لا يفعل شيئًا (mahaComposerHidden = true أصلًا)
  assert.equal(bar.dataset.mahaPrevDisplay, 'flex');
});

test('الإظهار: يعيد العرض المحفوظ ويمسح العلامة، وبلا إخفاء سابق لا يفعل شيئًا', () => {
  const { ctx, bar } = buildIsolated();
  ctx.show(); // بلا إخفاء سابق
  assert.equal(bar.style.display, 'flex', 'لم يتغيّر شيء');
  ctx.hide();
  ctx.show();
  assert.equal(bar.style.display, 'flex', 'رجع كما كان قبل الإخفاء');
  assert.equal(bar.dataset.mahaPrevDisplay, undefined, 'العلامة مُسحت');
});

console.log('✓ maha-hide-composer: صندوق الكتابة يختفي أثناء مكالمة مها ويرجع عند إنهائها');
