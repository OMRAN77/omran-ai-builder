'use strict';
/* v-intro-keys (تدقيق ١٨–١٩ أكتوبر، g01 intro-splash): Enter وSpace وEsc لا تُغلق شاشة الافتتاح إلّا بعد Tab.
   مستمع المفاتيح كان على #omranIntro وحده (tabindex=0) ولا شيء يركّزه، فالمفتاح يذهب إلى BODY ولا يصله.
   الآن مستمع على document بمرحلة الالتقاط ما دامت الشاشة ظاهرة: Enter و' ' وSpacebar وEscape تغلقها وتوقف
   الانتشار (فلا يصل Esc نفسه إلى معالج الأدوات في app-05-swipe-back)، ويُزال المستمع عند الإغلاق. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/app-00-intro.js'), 'utf8');

function boot(opts = {}) {
  const docL = { capture: {}, bubble: {} };
  const elL = {};
  const classes = new Set();
  const el = {
    id: 'omranIntro', parentNode: null,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    addEventListener: (t, fn) => { (elL[t] = elL[t] || []).push(fn); },
    querySelector: () => null,
  };
  const document = {
    readyState: 'complete',
    documentElement: { classList: { remove() {}, add() {} } },
    getElementById: (id) => (id === 'omranIntro' && opts.present !== false ? el : null),
    addEventListener: (t, fn, o) => {
      const cap = o === true || (o && o.capture);
      ((cap ? docL.capture : docL.bubble)[t] = (cap ? docL.capture : docL.bubble)[t] || []).push(fn);
    },
    removeEventListener: (t, fn, o) => {
      const cap = o === true || (o && o.capture);
      const bag = cap ? docL.capture : docL.bubble;
      bag[t] = (bag[t] || []).filter((f) => f !== fn);
    },
  };
  const ctx = {
    document, window: {}, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0, __swallow() {},
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { el, classes, docL, elL };
}
function key(k) {
  const ev = { key: k, prevented: false, stopped: false };
  ev.preventDefault = () => { ev.prevented = true; };
  ev.stopPropagation = () => { ev.stopped = true; };
  ev.stopImmediatePropagation = () => { ev.stopped = true; };
  return ev;
}
const fire = (bag, ev) => (bag.keydown || []).slice().forEach((f) => f(ev));

test('١. Enter وSpace وSpacebar وEscape على document (التركيز على BODY) تُغلق الشاشة وتوقف الانتشار', () => {
  for (const k of ['Enter', ' ', 'Spacebar', 'Escape']) {
    const w = boot();
    assert.ok((w.docL.capture.keydown || []).length >= 1, 'مستمع keydown على document بمرحلة الالتقاط');
    const ev = key(k);
    fire(w.docL.capture, ev);
    assert.ok(w.classes.has('oiOut'), JSON.stringify(k) + ' أغلق الشاشة');
    assert.ok(ev.prevented, JSON.stringify(k) + ': preventDefault (لا تمرير بالمسافة ولا وصول لمعالج Esc العامّ)');
    assert.ok(ev.stopped, JSON.stringify(k) + ': stopPropagation (Esc لا يُغلق أداة تحت الافتتاح)');
  }
});

test('٢. مفتاح آخر لا يُغلق من document، والمستمع يُزال بعد الإغلاق', () => {
  const w = boot();
  const ev = key('a');
  fire(w.docL.capture, ev);
  assert.ok(!w.classes.has('oiOut'), 'حرف عاديّ لا يغلق الشاشة من مستوى المستند');
  assert.ok(!ev.prevented && !ev.stopped, 'لا يُمسّ المفتاح الذي لا يخصّنا');
  fire(w.docL.capture, key('Enter'));
  assert.ok(w.classes.has('oiOut'));
  assert.equal((w.docL.capture.keydown || []).length, 0, 'مستمع المستند أُزيل داخل out()');
});

test('٣. السلوك القديم باقٍ: النقر واللمس ومفتاح على الشاشة المركّزة، وبلا شاشة لا مستمع على المستند', () => {
  const w = boot();
  assert.ok((w.elL.click || []).length && (w.elL.touchend || []).length && (w.elL.keydown || []).length);
  w.elL.click[0]();
  assert.ok(w.classes.has('oiOut'));
  const none = boot({ present: false });
  assert.equal((none.docL.capture.keydown || []).length, 0, 'لا شاشة ← لا مستمع');
});
