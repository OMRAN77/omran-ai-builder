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
  const el = { scrollWidth: sw, clientWidth: cw, scrollLeft: 0, addEventListener: (t, f, o) => { (on[t] = on[t] || []).push({ f, cap: o === true }); } };
  const ctx = {
    Math, Date,
    document: { documentElement: { classList: { contains: (c) => c === 'mobile-ui' && phone } } },
    window: { addEventListener: (t, f) => { (win[t] = win[t] || []).push(f); } },
    getComputedStyle: () => ({ direction: dir }),
  };
  vm.createContext(ctx);
  vm.runInContext(FN + '\nthis.stripDesktopScroll = stripDesktopScroll;', ctx);
  ctx.stripDesktopScroll(el);
  const ev = (o) => Object.assign({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, o);
  const fire = (t, o) => { const e = ev(o); for (const h of on[t] || []) h.f(e); return e; };
  const fireWin = (t, o) => { const e = ev(o); for (const f of win[t] || []) f(e); return e; };
  return { el, fire, fireWin };
}

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
