'use strict';
/* v-shelf-nocomposite (فيديو المالك ٢٨ سبتمبر ١٧:٤٦، هواوي 1.3.12 بعد طابور v-shelf-paint-throttle):
   صفوف الأدوات تفرغ عند السحب — الصفّ المسحوب أوّلًا ثمّ الثلاثة — والعناوين والأسهم في طبقة النافذة
   مرسومة طوال الوقت. الصفوف الأفقيّة (v-tools-shelves) جديدة اليوم، وكلّ صفّ كان ماسحًا مركّبًا مستقلًّا
   داخل ماسح النافذة (مسبار LayerTree: ٦ طبقات للصفوف الثلاثة). داخل غلاف التطبيق (جسر OmranRender)
   الصفّ صار overflow-x:hidden بلا طبقة، والإصبع يحرّكه بـJS. هذا الاختبار يشغّل ptShelfDrag الحقيقيّة
   من js/app-10-features.js في vm بصفّ مزيّف يحاكي scrollLeft السالب في RTL ومواضع البطاقات. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const R = (p) => fs.readFileSync(p, 'utf8');
const SRC = R('js/app-10-features.js');
const BUNDLE = R('js/app.bundle.js');
const CSS = R('css/tool-card-images.css');
const A = SRC.indexOf('const ptShelfDrag = ');
const B = SRC.indexOf('const ptDragShelves = ');
const DRAG = SRC.slice(A, B);
const CARDS = SRC.match(/const cards = \(track\) => [^\n]+/)[0];

const CARD = 220, GAP = 12, PAD = 2, VW = 600, VL = 10;

/* صفّ مزيّف: N بطاقات، scrollLeft مقصوص على المدى الحقيقيّ (RTL: من -الحدّ إلى ٠، LTR: من ٠ إلى الحدّ) */
function makeRow(dir, n) {
  const max = Math.max(0, PAD * 2 + n * CARD + (n - 1) * GAP - VW);
  const clamp = (x) => (dir === 'rtl' ? Math.min(0, Math.max(-max, x)) : Math.max(0, Math.min(max, x)));
  const listeners = {};
  let sl = 0;
  const vr = { left: VL, right: VL + VW };
  const cards = Array.from({ length: n }, (_, i) => ({
    matches: (s) => s === 'button.btn',
    getBoundingClientRect() {
      if (dir === 'rtl') { const right = vr.right - PAD - i * (CARD + GAP) - sl; return { left: right - CARD, right }; }
      const left = vr.left + PAD + i * (CARD + GAP) - sl; return { left, right: left + CARD };
    },
  }));
  const track = { children: cards };
  const row = {
    dir, max, listeners, scrolls: [],
    get scrollLeft() { return sl; },
    set scrollLeft(x) { sl = clamp(x); },
    scrollTo(o) { this.scrolls.push(o); sl = clamp(o.left); },
    querySelector: (s) => (s === '.ptTrack' ? track : null),
    getBoundingClientRect: () => vr,
    addEventListener(t, fn, opt) { (listeners[t] = listeners[t] || []).push({ fn, opt }); },
  };
  return row;
}

function boot(dir = 'rtl', n = 5) {
  const clock = { t: 1000 };
  const ctx = {
    Date: { now: () => clock.t },
    Math, Array,
    getComputedStyle: () => ({ direction: dir }),
    matchMedia: () => ({ matches: false }),
  };
  vm.createContext(ctx);
  vm.runInContext(CARDS + '\n' + DRAG + '\nthis.ptShelfDrag = ptShelfDrag;', ctx);
  const row = makeRow(dir, n);
  ctx.ptShelfDrag(row);
  const fire = (type, e) => (row.listeners[type] || []).forEach((l) => l.fn(e));
  let ts = 0;
  const touch = (pts, gap = 16) => {
    ts += 100;
    fire('touchstart', { touches: [{ clientX: pts[0][0], clientY: pts[0][1] }], timeStamp: ts });
    for (let i = 1; i < pts.length; i++) { ts += gap; clock.t += gap; fire('touchmove', { touches: [{ clientX: pts[i][0], clientY: pts[i][1] }], timeStamp: ts }); }
    fire('touchend', { touches: [], timeStamp: ts });
  };
  const click = () => { const e = { stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } }; fire('click', e); return e; };
  return { row, touch, click, clock, fire };
}
const line = (x0, y, dx, steps) => Array.from({ length: steps + 1 }, (_, i) => [x0 + (dx * i) / steps, y]);

test('١. RTL: الإصبع إلى اليمين يكشف ما على اليسار، والإفلات يستقرّ على حافّة بطاقة', () => {
  const b = boot('rtl');
  b.touch(line(200, 100, 150, 10), 40); /* سحب هادئ ١٥٠px */
  const s = b.row.scrolls.at(-1);
  assert.ok(s, 'الإفلات يطلب استقرارًا');
  assert.equal(s.behavior, 'smooth');
  assert.ok(b.row.scrollLeft < 0, 'تحرّك نحو البطاقات المخفيّة (scrollLeft سالب في RTL)');
  assert.equal(s.left, -234, '١٥٠px هادئة ← البطاقة التالية لا أبعد');
});

test('٢. الزخم: سحب سريع قصير يقفز أبعد من سحب هادئ بالمسافة نفسها', () => {
  const slow = boot('rtl'); slow.touch(line(200, 100, 90, 6), 50);
  const fast = boot('rtl'); fast.touch(line(200, 100, 90, 6), 8);
  assert.ok(fast.row.scrollLeft < slow.row.scrollLeft, 'السريع أبعد: ' + fast.row.scrollLeft + ' مقابل ' + slow.row.scrollLeft);
});

test('٣. LTR بالصيغة نفسها: الإصبع إلى اليسار يكشف ما على اليمين', () => {
  const b = boot('ltr');
  b.touch(line(400, 100, -150, 10), 40);
  assert.ok(b.row.scrollLeft > 0);
  assert.equal(b.row.scrolls.at(-1).left, 234, 'حافّة البطاقة الثانية في LTR (الحشوة ٢ + بطاقة ٢٢٠ + فجوة ١٢)');
});

test('٤. السحب الرأسيّ للنافذة: الصفّ لا يتحرّك ولا استقرار', () => {
  const b = boot('rtl');
  b.touch([[200, 300], [205, 280], [207, 240], [210, 180]]);
  assert.equal(b.row.scrollLeft, 0);
  assert.equal(b.row.scrolls.length, 0);
});

test('٥. سحب انتهى فوق بطاقة لا يفتحها، والنقرة العاديّة تفتح', () => {
  const b = boot('rtl');
  b.touch(line(200, 100, 150, 10), 40);
  const afterDrag = b.click();
  assert.ok(afterDrag.stopped && afterDrag.prevented, 'النقرة الملاصقة لنهاية السحب تُبلع');
  b.clock.t += 500;
  const later = b.click();
  assert.ok(!later.stopped && !later.prevented, 'بعد مهلة قصيرة تعود النقرات');
  b.touch([[300, 100]]); /* لمسة بلا حركة */
  const tap = b.click();
  assert.ok(!tap.stopped, 'اللمسة بلا سحب تفتح البطاقة');
  assert.equal(b.row.scrolls.length, 1, 'اللمسة لا تطلب استقرارًا');
});

test('٦. إصبعان (تكبير) لا يحرّكان الصفّ، والمستمعون سلبيّون فالتمرير الرأسيّ لا يُحجز', () => {
  const b = boot('rtl');
  b.fire('touchstart', { touches: [{ clientX: 100, clientY: 100 }, { clientX: 300, clientY: 100 }], timeStamp: 1 });
  b.fire('touchmove', { touches: [{ clientX: 180, clientY: 100 }, { clientX: 300, clientY: 100 }], timeStamp: 20 });
  b.fire('touchend', { touches: [], timeStamp: 30 });
  assert.equal(b.row.scrollLeft, 0);
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((t) => {
    assert.ok(b.row.listeners[t] && b.row.listeners[t].every((l) => l.opt && l.opt.passive === true), t + ' سلبيّ');
  });
  assert.equal(b.row.listeners.click[0].opt, true, 'بلع النقرة في طور الالتقاط قبل معالج البطاقة');
});

test('٧. البوّابة: داخل غلاف التطبيق فقط، والمتصفّحات على الماسح الأصليّ كما كانت', () => {
  assert.match(SRC, /const ptDragShelves = \(\(\) => \{ try\{ return !!\(window\.OmranRender && typeof window\.OmranRender\.mode === 'function'\); \}/);
  assert.match(SRC, /if\(ptDragShelves\) ptSectionsView\.classList\.add\('ptDragShelves'\);/);
  assert.match(SRC, /all\.onclick = \(\) => openAll\(section, all\);\s*if\(ptDragShelves\) ptShelfDrag\(viewport\);/);
  assert.match(CSS, /#sectionsToolsPopup \.ptDragShelves \.ptCarousel\{overflow-x:hidden; scroll-snap-type:none; touch-action:pan-y;\}/);
  assert.match(CSS, /#sectionsToolsPopup \.ptCarousel\{overflow-x:auto; overflow-y:hidden; scrollbar-width:none; scroll-snap-type:x mandatory;/, 'الأصل للمتصفّحات لم يتغيّر');
  assert.match(R('js/ui-wiring.js'), /tool-card-images\.css\?v=18/);
  assert.ok(BUNDLE.includes(DRAG.trim()), 'الحزمة تحمل الجزء نفسه');
  assert.match(R('js/app-05-swipe-back.js'), /classList\.contains\('ptCarousel'\)/, 'سحب الرجوع يستثني الصفّ بالصنف لا بـoverflow');
});
