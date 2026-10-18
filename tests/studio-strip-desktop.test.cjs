'use strict';
/* v-studio-strip-desktop — المالك ١٧ أكتوبر: «شريط اختر التعديل مايتحرك» على الكمبيوتر، ثمّ «يتحرّك بعجلة الماوس والسحب، بدون أيّ
   تغيير ثاني، والجوّال ما ينلمس». يشغّل الدالّة الحقيقيّة من js/app-13-stocks-init.js على عنصر مصغّر: العجلة أفقيًّا ما دام فيه مكان،
   والسحب بالماوس، ولا اختيار تبويب بضغطة تنهي سحبًا، والجوّال واللمس ولوحة اللمس الأفقيّة بلا تغيير. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '../js/app-13-stocks-init.js'), 'utf8');
const A = SRC.indexOf('function stripDesktopScroll(el){');
const B = SRC.indexOf('stripDesktopScroll(tabsWrap);', A);
assert.ok(A > 0 && B > A, 'الدالّة ونداؤها على شريط «اختر التعديل» موجودان');
const FN = SRC.slice(A, B);

function setup({ dir = 'rtl', phone = false, sw = 2238, cw = 1136 } = {}) {
  const on = {}, win = {};
  const clock = { t: 1e12 }; // ساعة مضبوطة لاختبار الفجوات الزمنيّة
  const box = { scrollTop: 0, scrollHeight: 1234, clientHeight: 900, parentElement: null }; // جسم النافذة الذي يُمرَّر
  const el = { scrollWidth: sw, clientWidth: cw, scrollLeft: 0, parentElement: box, offsetParent: box, contains: (n) => n === 'inside', addEventListener: (t, f, o) => { (on[t] = on[t] || []).push({ f, cap: o === true }); } };
  const ctx = {
    Math, Date: { now: () => clock.t },
    document: { scrollingElement: { scrollTop: 0, scrollHeight: 900, clientHeight: 900 }, documentElement: { classList: { contains: (c) => c === 'mobile-ui' && phone } } },
    window: { addEventListener: (t, f) => { (win[t] = win[t] || []).push(f); } },
    getComputedStyle: (n) => ({ direction: dir, overflowY: n === box ? 'auto' : 'visible' }),
  };
  vm.createContext(ctx);
  vm.runInContext(FN + '\nthis.stripDesktopScroll = stripDesktopScroll;', ctx);
  ctx.stripDesktopScroll(el);
  const ev = (o) => Object.assign({ cancelable: true, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, o);
  const fire = (t, o) => { const e = ev(o); for (const h of on[t] || []) h.f(e); return e; };
  const fireWin = (t, o) => { const e = ev(o); for (const f of win[t] || []) f(e); return e; };
  return { el, box, fire, fireWin, clock };
}

test('٥. v-strip-wheel-latch: بعد تمرير الصفحة تكمل الصفحة فوق الشريط ولو توقّف، حتّى يتحرّك الماوس فوقه أو يُضغط', () => {
  const W = { deltaY: 100, deltaX: 0, deltaMode: 0 };
  const s = setup();
  s.fireWin('wheel', { target: 'outside', deltaY: 100, deltaX: 0 }); // الصفحة تُمرَّر
  for (let i = 0; i < 3; i++) { s.clock.t += 120; assert.equal(s.fire('wheel', W).prevented, false, 'متّصلة: الصفحة تكمل'); }
  s.clock.t += 5000;
  assert.equal(s.fire('wheel', W).prevented, false, 'بعد توقّف طويل والماوس ساكن: الصفحة تكمل (Chrome يبدأ تسلسلًا جديدًا على الشريط)');
  s.clock.t += 600;
  s.fire('pointermove', { pointerType: 'mouse', movementX: 0, movementY: 0 }); // حركة مصطنعة بعد التمرير
  s.fire('pointermove', { pointerType: 'mouse', movementX: 4, movementY: 0 }); // رجفة
  assert.equal(s.fire('wheel', W).prevented, false, 'رجفة دون ١٠px لا تكفي');
  s.fire('pointermove', { pointerType: 'mouse', movementX: 30, movementY: 0 });
  assert.equal(s.fire('wheel', W).prevented, false, 'حركة أثناء التمرير المتّصل لا تُحسب');
  assert.equal(s.el.scrollLeft, 0, 'الشريط لم يتحرّك أثناء تمرير الصفحة');
  s.clock.t += 600;
  s.fire('pointermove', { pointerType: 'mouse', movementX: 8, movementY: 5 });
  assert.equal(s.fire('wheel', W).prevented, true, 'حرّك الماوس فوق الشريط بعد التوقّف: العجلة للشريط');
  assert.equal(s.el.scrollLeft, -100);
  const p = setup(); p.fireWin('wheel', { target: 'outside', deltaY: 100, deltaX: 0 }); p.clock.t += 600;
  p.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 500 }); p.fireWin('pointerup', {}); p.clock.t += 400;
  assert.equal(p.fire('wheel', W).prevented, true, 'الضغط على الشريط يعيد العجلة له');
  const end = setup(); end.fireWin('wheel', { target: 'outside', deltaY: 100, deltaX: 0 }); end.box.scrollTop = 334;
  end.clock.t += 100;
  assert.equal(end.fire('wheel', W).prevented, false, 'الدوران المتّصل يبقى للصفحة ولو بلغت آخرها (كقفل المتصفّح)');
  end.clock.t += 600;
  assert.equal(end.fire('wheel', W).prevented, true, 'بعد توقّف والصفحة في آخرها: الشريط يتحرّك كما كان');
  const idle = setup(); idle.box.scrollTop = 334; idle.fireWin('wheel', { target: 'outside', deltaY: 100, deltaX: 0 });
  assert.equal(idle.fire('wheel', W).prevented, true, 'عجلة خارج الشريط لم تمرّر شيئًا لا تجمّده');
  const ins = setup(); ins.fireWin('wheel', { target: 'inside', deltaY: 100, deltaX: 0 });
  assert.equal(ins.fire('wheel', W).prevented, true, 'عجلة داخل الشريط لا تُحسب تمرير صفحة');
  const nc = setup(); nc.fire('wheel', Object.assign({ cancelable: false }, W));
  assert.equal(nc.el.scrollLeft, 0, 'حدث غير قابل للإلغاء (المتصفّح مرّر الصفحة): الشريط لا يتحرّك معها');
  const rev = setup(); rev.el.scrollLeft = -(2238 - 1136);
  assert.equal(rev.fire('wheel', W).prevented, false, 'الطرف: الصفحة');
  assert.equal(rev.fire('wheel', { deltaY: -100, deltaX: 0, deltaMode: 0 }).prevented, true, 'الرجوع بعد الطرف يحرّك الشريط كما في #1154');
});

test('١. العجلة تحرّك الشريط أفقيًّا (العربيّة RTL: نحو السالب)، وتمنع تمرير الصفحة فقط ما دام فيه مكان', () => {
  const s = setup();
  const e = s.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
  assert.equal(s.el.scrollLeft, -100);
  assert.equal(e.prevented, true);
  s.fire('wheel', { deltaY: -40, deltaX: 0, deltaMode: 0 });
  assert.equal(s.el.scrollLeft, -60, 'العجلة للأعلى ترجع');
  s.el.scrollLeft = -(2238 - 1136);
  const atEnd = s.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 });
  assert.equal(atEnd.prevented, false, 'عند الطرف تكمل الصفحة');
  assert.equal(s.el.scrollLeft, -(2238 - 1136));
  s.el.scrollLeft = 0;
  assert.equal(s.fire('wheel', { deltaY: -100, deltaX: 0, deltaMode: 0 }).prevented, false, 'في البداية والعجلة للأعلى: الصفحة');
  const lines = s.fire('wheel', { deltaY: 3, deltaX: 0, deltaMode: 1 });
  assert.equal(lines.prevented, true);
  assert.equal(s.el.scrollLeft, -48, 'وضع الأسطر = ١٦px للسطر');
});

test('٢. الواجهات الإنجليزيّة (LTR) نحو الموجب، ولوحة اللمس الأفقيّة وCtrl+عجلة كما هي', () => {
  const s = setup({ dir: 'ltr' });
  s.fire('wheel', { deltaY: 120, deltaX: 0, deltaMode: 0 });
  assert.equal(s.el.scrollLeft, 120);
  const tp = s.fire('wheel', { deltaY: 10, deltaX: 60, deltaMode: 0 });
  assert.equal(tp.prevented, false, 'التمرير الأفقيّ الأصليّ للوحة اللمس لا يُمسّ');
  assert.equal(s.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0, ctrlKey: true }).prevented, false, 'تكبير الصفحة');
  assert.equal(s.el.scrollLeft, 120);
  const fits = setup({ sw: 900, cw: 1136 });
  assert.equal(fits.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 }).prevented, false, 'شريط يتّسع كلّه: الصفحة');
});

test('٣. السحب بالماوس يحرّك الشريط، والضغطة التي تنهيه لا تختار تبويبًا، والضغطة العاديّة تختار', () => {
  const s = setup();
  s.el.scrollLeft = -300;
  const down = s.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 500 });
  assert.equal(down.prevented, true, 'لا تحديد نصّ أثناء السحب');
  s.fireWin('pointermove', { clientX: 520 });
  assert.equal(s.el.scrollLeft, -320, 'المحتوى يتبع الماوس');
  s.fireWin('pointermove', { clientX: 300 });
  assert.equal(s.el.scrollLeft, -100);
  s.fireWin('pointerup', {});
  const clickAfterDrag = s.fire('click', {});
  assert.equal(clickAfterDrag.stopped, true, 'نهاية السحب ليست اختيارًا');
  assert.equal(clickAfterDrag.prevented, true);
  const plain = setup();
  plain.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 500 });
  plain.fireWin('pointermove', { clientX: 503 });
  plain.fireWin('pointerup', {});
  assert.equal(plain.el.scrollLeft, 0, 'حركة دون ٥px ليست سحبًا');
  assert.equal(plain.fire('click', {}).stopped, false, 'الضغطة العاديّة تختار التبويب');
});

test('٤. الجوّال واللمس كما هما: لا عجلة ولا سحب ولا منع', () => {
  const ph = setup({ phone: true });
  assert.equal(ph.fire('wheel', { deltaY: 100, deltaX: 0, deltaMode: 0 }).prevented, false);
  assert.equal(ph.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 500 }).prevented, false);
  ph.fireWin('pointermove', { clientX: 300 });
  assert.equal(ph.el.scrollLeft, 0);
  assert.equal(ph.fire('dragstart', {}).prevented, false);
  const touch = setup();
  assert.equal(touch.fire('pointerdown', { pointerType: 'touch', button: 0, clientX: 500 }).prevented, false, 'اللمس على الحاسوب يمرّر أصليًّا');
  touch.fireWin('pointermove', { clientX: 300 });
  assert.equal(touch.el.scrollLeft, 0);
  assert.equal(setup().fire('pointerdown', { pointerType: 'mouse', button: 2, clientX: 500 }).prevented, false, 'الزرّ الأيمن كما هو');
});
