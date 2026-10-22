'use strict';
/* v-back-layers (تدقيق ١٨–١٩ أكتوبر، g01 close-swipe-esc وg08 tools-overlay وg03 chat-plans-gate):
   رجوع المتصفّح وزرّ أندرويد كانا يغادران التطبيق والأدوات أو الإعدادات مفتوحة — فتح الأداة لم يكن يضيف
   مدخلًا في التاريخ (الوحيد «عرض الكل» في app-10)، وغلاف أندرويد يرجع فقط إن canGoBack().
   الآن js/app-05-swipe-back.js يدفع مدخلًا لكلّ طبقة تُفتح (أدوات MAP و#settingsDialog)، والرجوع يغلق
   أعلاها، وإغلاقها بالسحب/Esc/الكود وهي المدخل الحاليّ يسحب مدخلها بـhistory.back() مرّة بلا إغلاق مزدوج.
   الملفّ الحقيقيّ يُنفَّذ في vm بمستند وتاريخ وMutationObserver مزيّفة (back() غير متزامن كالمتصفّح). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SRC = fs.readFileSync('js/app-05-swipe-back.js', 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await tick(); };

function world(opts = {}) {
  let order = 0;
  const observers = [];
  function notify(el, attr) {
    observers.forEach((o) => o.targets.forEach((t) => {
      if (t.el === el && (!t.filter || t.filter.indexOf(attr) >= 0)) o.queue(el, attr);
    }));
  }
  class FakeMO {
    constructor(cb) { this.cb = cb; this.targets = []; this.pending = []; observers.push(this); }
    observe(el, o) { this.targets.push({ el, filter: o && o.attributeFilter, childList: !!(o && o.childList) }); }
    queue(el, attr) {
      this.pending.push({ target: el, attributeName: attr });
      if (this.pending.length === 1) queueMicrotask(() => { const r = this.pending; this.pending = []; this.cb(r, this); });
    }
    disconnect() { this.targets = []; }
  }
  function makeEl(id, kind) {
    const listeners = {};
    const attrs = {};
    const cls = new Set();
    const styleStore = {};
    const el = {
      id, tagName: kind === 'dialog' ? 'DIALOG' : 'DIV', __order: order++, children: [], parentElement: null, clicks: 0, onclick: null,
      classList: {
        add(c) { if (!cls.has(c)) { cls.add(c); notify(el, 'class'); } },
        remove(c) { if (cls.delete(c)) notify(el, 'class'); },
        contains(c) { return cls.has(c); },
        toggle(c, on) { const want = on === undefined ? !cls.has(c) : !!on; if (want) this.add(c); else this.remove(c); return want; },
      },
      style: new Proxy(styleStore, { set(t, k, v) { t[k] = v; if (k === 'display') notify(el, 'style'); return true; } }),
      setAttribute(k, v) { attrs[k] = String(v); notify(el, k); },
      removeAttribute(k) { if (k in attrs) { delete attrs[k]; notify(el, k); } },
      hasAttribute(k) { return k in attrs; },
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      click() { el.clicks++; if (typeof el.onclick === 'function') el.onclick({}); (listeners.click || []).forEach((f) => f({})); },
      compareDocumentPosition(o) { return o.__order > el.__order ? 4 : 2; },
      getBoundingClientRect() { return { width: 600, height: 600, left: 0, top: 0, right: 600, bottom: 600 }; },
      kind,
    };
    return el;
  }
  const els = {};
  const add = (id, kind) => (els[id] = makeEl(id, kind));
  /* الأدوات: شاشة الأدوات تظهر بالصنف show، والنوافذ بـstyle.display، والإعدادات بسمة open */
  add('sectionsToolsOverlay', 'class'); add('stpCloseBtn', 'btn');
  add('videoMakerModal', 'style'); add('videoMakerCloseBtn', 'btn');
  add('designAiModal', 'style'); add('designAiCloseBtn', 'btn');
  add('settingsDialog', 'dialog');
  els.stpCloseBtn.onclick = () => els.sectionsToolsOverlay.classList.remove('show');
  els.videoMakerCloseBtn.onclick = () => { els.videoMakerModal.style.display = 'none'; };
  els.designAiCloseBtn.onclick = () => { els.designAiModal.style.display = 'none'; };
  const shown = (el) => {
    if (el.kind === 'class') return el.classList.contains('show');
    if (el.kind === 'style') return el.style.display === 'flex';
    if (el.kind === 'dialog') return el.hasAttribute('open');
    return true;
  };
  const docListeners = { capture: {}, bubble: {} };
  const winListeners = {};
  const body = makeEl('body', 'body');
  const document = {
    readyState: 'complete',
    head: { appendChild() {} },
    body,
    documentElement: { classList: { add() {}, remove() {}, contains() { return false; } } },
    activeElement: null,
    createElement() { return { style: {}, textContent: '' }; },
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    addEventListener(t, fn, o) { const ph = (o === true || (o && o.capture)) ? 'capture' : 'bubble'; (docListeners[ph][t] = docListeners[ph][t] || []).push(fn); },
  };
  /* التاريخ: مكدّس مدخلات، وback() غير متزامن يطلق popstate كالمتصفّح */
  const entries = [{ state: opts.initialState === undefined ? null : opts.initialState }];
  let index = 0;
  const log = { push: [], back: 0, replace: 0 };
  const history = {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState(s) { entries.splice(index + 1); entries.push({ state: JSON.parse(JSON.stringify(s)) }); index++; log.push.push(JSON.parse(JSON.stringify(s))); },
    replaceState(s) { entries[index] = { state: s }; log.replace++; },
    back() { log.back++; setTimeout(() => { if (index > 0) { index--; (winListeners.popstate || []).forEach((f) => f({ state: entries[index].state })); } }, 1); },
  };
  const closed = [];
  const ctx = {
    document, history, console,
    location: { search: '', pathname: '/', hash: '', href: 'http://x/' },
    getComputedStyle: (el) => ({ display: shown(el) ? 'flex' : 'none', visibility: 'visible', zIndex: el.id === 'sectionsToolsOverlay' ? '2000' : '9000', overflowX: 'visible' }),
    MutationObserver: FakeMO,
    setTimeout, clearTimeout, setInterval: () => 0, queueMicrotask,
    closeDialogSafe: (d) => { closed.push(d.id); d.removeAttribute('open'); },
    Date, Math, JSON, parseInt, Object, Array, String,
    innerWidth: 1280,
  };
  ctx.window = ctx;
  ctx.window.addEventListener = (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'app-05-swipe-back.js' });
  const esc = () => {
    const e = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} };
    (docListeners.capture.keydown || []).forEach((f) => f(e));
    (docListeners.bubble.keydown || []).forEach((f) => f(e));
    return e;
  };
  /* رجوع المستخدم (زرّ المتصفّح/أندرويد): مثل back() لكنّه لا يُحسب نداءً من التطبيق */
  const userBack = () => { if (index > 0) { index--; (winListeners.popstate || []).forEach((f) => f({ state: entries[index].state })); } };
  return { els, history, log, closed, esc, userBack, get index() { return index; }, entries };
}

test('١. فتح شاشة الأدوات يدفع مدخلًا واحدًا، والرجوع يغلقها بزرّها مرّة ولا يغادر', async () => {
  const w = world();
  await settle();
  assert.equal(w.log.push.length, 0, 'لا مدخل والتطبيق بلا أداة مفتوحة');
  w.els.sectionsToolsOverlay.classList.add('show');
  await settle();
  assert.equal(w.log.push.length, 1, 'مدخل واحد عند الفتح');
  assert.equal(w.log.push[0].omranTool, 'sectionsToolsOverlay');
  w.userBack();
  await settle();
  assert.equal(w.els.stpCloseBtn.clicks, 1, 'الرجوع ينقر زرّ الإغلاق المخفيّ مرّة');
  assert.equal(w.els.sectionsToolsOverlay.classList.contains('show'), false);
  assert.equal(w.log.back, 0, 'لا رجوع إضافيّ من التطبيق بعد رجوع المستخدم');
  assert.equal(w.log.push.length, 1, 'ولا مدخل جديد');
  assert.equal(w.index, 0);
});

test('٢. الإغلاق بـEsc (أو السحب/✕) يسحب مدخله بـhistory.back() مرّة، بلا إغلاق مزدوج', async () => {
  const w = world();
  w.els.sectionsToolsOverlay.classList.add('show');
  await settle();
  const e = w.esc();
  assert.equal(e.defaultPrevented, true);
  await settle();
  assert.equal(w.els.stpCloseBtn.clicks, 1, 'نقرة واحدة فقط');
  assert.equal(w.log.back, 1, 'history.back() مرّة واحدة');
  assert.equal(w.index, 0, 'المكدّس رجع إلى أوّله');
  /* فتح ثانٍ بعدها يدفع مدخلًا جديدًا (العلم لا يبتلعه) */
  w.els.sectionsToolsOverlay.classList.add('show');
  await settle();
  assert.equal(w.log.push.length, 2);
  assert.equal(w.index, 1);
});

test('٣. مدخل «عرض الكل» (app-10) فوق شاشة الأدوات: الرجوع منه لا يغلق الشاشة، وما فُتح فوقه يُغلق وحده', async () => {
  const w = world();
  w.els.sectionsToolsOverlay.classList.add('show');
  await settle();
  w.history.pushState({ omranToolsAll: 1 }, '', 'http://x/'); /* openAll في app-10 */
  w.userBack();
  await settle();
  assert.equal(w.els.stpCloseBtn.clicks, 0, 'حالة omranToolsAll لـapp-10: الشاشة تبقى');
  assert.equal(w.els.sectionsToolsOverlay.classList.contains('show'), true);
  /* أداة فُتحت من «عرض الكل» ثمّ رجوع: تُغلق الأداة وتبقى الشاشة ومستواها */
  w.history.pushState({ omranToolsAll: 2 }, '', 'http://x/');
  w.els.videoMakerModal.style.display = 'flex';
  await settle();
  assert.equal(w.log.push.filter((s) => s.omranTool === 'videoMakerModal').length, 1);
  w.userBack();
  await settle();
  assert.equal(w.els.videoMakerCloseBtn.clicks, 1);
  assert.equal(w.els.stpCloseBtn.clicks, 0);
  assert.equal(w.history.state.omranToolsAll, 2, 'المدخل الحاليّ «عرض الكل» نفسه');
});

test('٤. الإعدادات/الباقات: سمة open تدفع مدخلًا، والرجوع يغلقها بـcloseDialogSafe', async () => {
  const w = world();
  w.els.settingsDialog.setAttribute('open', '');
  await settle();
  assert.equal(w.log.push.length, 1);
  assert.equal(w.log.push[0].omranTool, 'settingsDialog');
  w.userBack();
  await settle();
  assert.deepEqual(w.closed, ['settingsDialog']);
  assert.equal(w.els.settingsDialog.hasAttribute('open'), false);
  assert.equal(w.log.back, 0);
});

test('٥. طبقتان: الباقات فوق صانع الفيديو — إغلاق الباقات بنفسها يرجع خطوة واحدة والصانع باقٍ بمدخله', async () => {
  const w = world();
  w.els.videoMakerModal.style.display = 'flex';
  await settle();
  w.els.settingsDialog.setAttribute('open', '');
  await settle();
  assert.equal(w.log.push.length, 2);
  w.els.settingsDialog.removeAttribute('open'); /* Esc الأصليّ للنافذة أو سهمها */
  await settle();
  assert.equal(w.log.back, 1);
  assert.equal(w.history.state.omranTool, 'videoMakerModal');
  assert.equal(w.els.videoMakerModal.style.display, 'flex');
  w.userBack();
  await settle();
  assert.equal(w.els.videoMakerCloseBtn.clicks, 1);
  assert.equal(w.index, 0);
});

test('٦. مدخل أداة أغلقها الكود تحت أخرى يُتخطّى: ضغطة رجوع واحدة تغلق العليا وتصل للمحادثة', async () => {
  const w = world();
  w.els.sectionsToolsOverlay.classList.add('show');
  await settle();
  w.els.videoMakerModal.style.display = 'flex';
  await settle();
  w.els.sectionsToolsOverlay.classList.remove('show'); /* syncWelcome مثلًا */
  await settle();
  assert.equal(w.log.back, 0, 'ليس المدخل الحاليّ: لا رجوع');
  w.userBack();
  await settle(10);
  assert.equal(w.els.videoMakerCloseBtn.clicks, 1);
  assert.equal(w.index, 0, 'المدخل الميّت تُخطّي');
});

test('٧. حالة قديمة بعد إعادة التحميل لا تُسحب ولا تُغادر بها الصفحة', async () => {
  const w = world({ initialState: { omranTool: 'videoMakerModal', omranSeq: 3, omranSid: 'old' } });
  await settle();
  assert.equal(w.log.back, 0);
  w.els.videoMakerModal.style.display = 'flex';
  await settle();
  w.userBack();
  await settle();
  assert.equal(w.els.videoMakerCloseBtn.clicks, 1, 'الرجوع إلى مدخل جلسة سابقة يغلق الأداة');
  assert.equal(w.log.back, 0, 'ولا يتخطّاه (قد يكون أوّل مدخل للمستند)');
  assert.equal(w.index, 0);
});

test('٨. app-10: popstate لا يغلق «عرض الكل» ومدخله هو الحاليّ (رجوع من أداة فوقه)', () => {
  const f = fs.readFileSync('js/app-10-features.js', 'utf8');
  assert.ok(/addEventListener\('popstate', \(\) => \{ if\(allState && !\(history\.state && history\.state\.omranToolsAll === allState\.token\)\) closeAll\(true\); \}\)/.test(f),
    'مستمع popstate في app-10 يفحص أنّ مدخله لم يعد الحاليّ قبل closeAll');
});
