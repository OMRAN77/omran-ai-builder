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
  const cls = new Set();
  const bar = { style: { display: 'flex' }, dataset: {}, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) } };
  const ctx = {
    document: { getElementById: (id) => (id === 'inputbar' ? bar : null) },
    __swallow: () => {},
  };
  vm.runInNewContext(chunk + '\nthis.hide = mahaHideComposer; this.show = mahaShowComposer;', ctx);
  return { ctx, bar };
}

/* v-maha-band (أمر المالك: «ولا تضغط مرّة ثانية م»): الصندوق يُخفى بفئة maha-calling (visibility) لا display:none —
   مخفيّ كما كان، وزرّ «م» داخله وحده يبقى ظاهرًا في مكانه لإنهاء المكالمة. */
test('الإخفاء: فئة maha-calling (الصندوق مخفيّ و«م» ظاهر)، بلا لمس display، ونداء ثانٍ لا يكرّر', () => {
  const { ctx, bar } = buildIsolated();
  ctx.hide();
  assert.equal(bar.classList.contains('maha-calling'), true);
  assert.equal(bar.style.display, 'flex', 'التخطيط لا يتغيّر');
  ctx.hide();
  assert.equal(bar.classList.contains('maha-calling'), true);
  const css = fs.readFileSync(path.join(root, 'css/modules.css'), 'utf8');
  assert.ok(css.includes('#inputbar.maha-calling{visibility:hidden;}') && css.includes('#inputbar.maha-calling #btnMahaDock{visibility:visible;}'));
});

test('الإظهار: يزيل الفئة، وبلا إخفاء سابق لا يفعل شيئًا', () => {
  const { ctx, bar } = buildIsolated();
  ctx.show();
  assert.equal(bar.classList.contains('maha-calling'), false, 'لم يتغيّر شيء');
  ctx.hide();
  ctx.show();
  assert.equal(bar.classList.contains('maha-calling'), false, 'رجع كما كان');
});

console.log('✓ maha-hide-composer: صندوق الكتابة يختفي أثناء مكالمة مها (إلّا «م») ويرجع عند إنهائها');
