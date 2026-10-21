'use strict';
/* v-back-layers (تدقيق ١٨–١٩ أكتوبر، g07 video-trends وvideo-samples-tutorial وg09 decor-ideas-gallery):
   Esc يغلق طبقة واحدة فقط.
   - معالج Esc العامّ (js/app-05-swipe-back.js) كان يغلق الأداة تحت نافذة dialog مشروطة (ورقة الباقات فوق صانع
     الفيديو) ثمّ يلغي إغلاقها الأصليّ بـpreventDefault — الآن يتركها لـEsc الأصليّ، ويحترم defaultPrevented.
   - عارض الصور omranLightbox (js/app-15-cx-ideas.js) ومشغّل الأمثلة (openPlayer في js/video.js) كانا يستمعان في
     مرحلة الفقاعة بعد المعالج العامّ فتُغلق الأداة تحتهما معهما — الآن مستمع التقاط يغلقهما وحدهما ويوقف الانتشار. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SWIPE = fs.readFileSync('js/app-05-swipe-back.js', 'utf8');
const CX = fs.readFileSync('js/app-15-cx-ideas.js', 'utf8');
const VIDEO = fs.readFileSync('js/video.js', 'utf8');

function world(opts = {}) {
  let order = 0;
  const els = {};
  function makeEl(id, tag) {
    const listeners = {};
    const style = {};
    const el = {
      id, tagName: (tag || 'div').toUpperCase(), __order: order++, clicks: 0, onclick: null, children: [], parentElement: null, isConnected: true,
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      style: new Proxy(style, {
        set(t, k, v) {
          if (k === 'cssText') { const m = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(v); if (m) t.display = m[1].trim(); return true; }
          t[k] = v; return true;
        },
      }),
      setAttribute() {}, hasAttribute() { return false; }, removeAttribute() {},
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      removeEventListener(t, fn) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
      appendChild(c) { el.children.push(c); c.parentElement = el; if (c.id) els[c.id] = c; return c; },
      remove() { el.isConnected = false; if (el.id && els[el.id] === el) delete els[el.id]; if (el.parentElement) el.parentElement.children = el.parentElement.children.filter((x) => x !== el); },
      click() { el.clicks++; if (typeof el.onclick === 'function') el.onclick({ target: el }); (listeners.click || []).forEach((f) => f({ target: el })); },
      compareDocumentPosition(o) { return o.__order > el.__order ? 4 : 2; },
      getBoundingClientRect() { return { width: 600, height: 600, left: 0, top: 0, right: 600, bottom: 600 }; },
      pause() {},
    };
    Object.defineProperty(el, 'innerHTML', {
      set(html) { const re = /id="([^"]+)"/g; let m; while ((m = re.exec(html))) el.appendChild(makeEl(m[1])); },
      get() { return ''; },
    });
    return el;
  }
  const add = (id) => (els[id] = makeEl(id));
  add('videoMakerModal'); add('videoMakerCloseBtn');
  add('designAiModal'); add('designAiCloseBtn');
  els.videoMakerModal.style.display = opts.video === false ? 'none' : 'flex';
  els.designAiModal.style.display = opts.design ? 'flex' : 'none';
  els.videoMakerCloseBtn.onclick = () => { els.videoMakerModal.style.display = 'none'; };
  els.designAiCloseBtn.onclick = () => { els.designAiModal.style.display = 'none'; };
  const cap = {}, bub = {};
  const body = makeEl('body');
  const document = {
    readyState: 'complete',
    head: { appendChild() {} },
    body,
    documentElement: { lang: 'ar', dir: 'rtl', classList: { add() {}, remove() {}, contains() { return false; } } },
    activeElement: null,
    createElement: (tag) => makeEl('', tag),
    getElementById: (id) => els[id] || null,
    querySelector: opts.querySelector || (() => null),
    addEventListener(t, fn, o) { const m = (o === true || (o && o.capture)) ? cap : bub; (m[t] = m[t] || []).push(fn); },
    removeEventListener(t, fn, o) { const m = (o === true || (o && o.capture)) ? cap : bub; m[t] = (m[t] || []).filter((f) => f !== fn); },
  };
  const ctx = {
    document, console,
    location: { search: '', pathname: '/', hash: '', href: 'http://x/' },
    history: { state: null, length: 1, pushState() {}, replaceState() {}, back() {} },
    getComputedStyle: (el) => ({ display: el.style.display || 'none', visibility: 'visible', zIndex: '9000', overflowX: 'visible' }),
    localStorage: { getItem() { return null; } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, queueMicrotask,
    Date, Math, JSON, parseInt, Object, Array, String,
    innerWidth: 1280,
  };
  ctx.window = ctx;
  ctx.window.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(SWIPE, ctx, { filename: 'app-05-swipe-back.js' });
  if (opts.cx) vm.runInContext(CX, ctx, { filename: 'app-15-cx-ideas.js' });
  /* إرسال keydown على body: التقاط على document ← الهدف ← فقاعة على document، بإيقاف الانتشار كالمتصفّح */
  const press = (pre) => {
    const e = {
      key: 'Escape', defaultPrevented: !!pre, stopped: false, stoppedNow: false, prevents: 0,
      preventDefault() { this.defaultPrevented = true; this.prevents++; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; this.stoppedNow = true; },
    };
    for (const f of (cap.keydown || []).slice()) { f(e); if (e.stoppedNow) break; }
    if (!e.stopped) for (const f of (bub.keydown || []).slice()) { f(e); if (e.stoppedNow) break; }
    return e;
  };
  return { ctx, els, press, document };
}

test('١. نافذة dialog مشروطة مفتوحة (الباقات فوق الصانع): Esc لا يغلق الصانع ولا يلغي إغلاق النافذة', () => {
  const w = world({ querySelector: (s) => (s === 'dialog:modal' ? { id: 'settingsDialog' } : null) });
  const e = w.press();
  assert.equal(w.els.videoMakerCloseBtn.clicks, 0, 'الصانع تحت الورقة لا يُغلق');
  assert.equal(e.prevents, 0, 'لا preventDefault — Esc الأصليّ يغلق الورقة');
});

test('٢. محرّك بلا :modal: احتياط dialog[open]', () => {
  const w = world({ querySelector: (s) => { if (s === 'dialog:modal') throw new Error('SyntaxError'); return s === 'dialog[open]' ? { id: 'settingsDialog' } : null; } });
  w.press();
  assert.equal(w.els.videoMakerCloseBtn.clicks, 0);
});

test('٣. بلا نافذة: Esc يغلق أعلى أداة مرّة؛ وحدث سبق إليه مستمع آخر (defaultPrevented) لا يُمسّ', () => {
  const w = world();
  const e = w.press();
  assert.equal(w.els.videoMakerCloseBtn.clicks, 1);
  assert.equal(e.defaultPrevented, true);
  const w2 = world();
  w2.press(true);
  assert.equal(w2.els.videoMakerCloseBtn.clicks, 0);
});

test('٤. عارض الصور فوق الديكور: Esc يغلق العارض وحده، وEsc الثانية تغلق النافذة', () => {
  const w = world({ video: false, design: true, cx: true });
  w.ctx.window.omranLightbox('/x.webp');
  const box = w.els.omranLightbox;
  assert.ok(box, 'العارض أُنشئ');
  assert.equal(box.style.display, 'flex');
  const e = w.press();
  assert.equal(w.els.designAiCloseBtn.clicks, 0, 'الديكور تحت العارض لا يُغلق');
  assert.equal(box.style.display, 'none', 'العارض أُغلق');
  assert.ok(e.stopped && e.defaultPrevented);
  w.press();
  assert.equal(w.els.designAiCloseBtn.clicks, 1, 'Esc الثانية للنافذة');
  /* العارض مغلق: مستمعه لا يبتلع Esc */
  assert.equal(box.style.display, 'none');
});

function openPlayerSrc() {
  const i = VIDEO.indexOf('function openPlayer(src){');
  assert.ok(i >= 0, 'openPlayer موجودة');
  let depth = 0, j = VIDEO.indexOf('{', i);
  for (; j < VIDEO.length; j++) { if (VIDEO[j] === '{') depth++; else if (VIDEO[j] === '}') { depth--; if (!depth) break; } }
  return VIDEO.slice(i, j + 1);
}

test('٥. مشغّل فيديو المثال فوق الصانع: Esc يغلق المشغّل وحده (التقاط + إيقاف الانتشار)، ويُزال مستمعه', () => {
  const src = openPlayerSrc();
  assert.match(src, /document\.addEventListener\('keydown',esc,true\)/, 'مستمع التقاط');
  assert.match(src, /document\.removeEventListener\('keydown',esc,true\)/, 'يُزال بالعلم نفسه');
  assert.match(src, /stopImmediatePropagation\(\)/);
  const w = world();
  w.ctx.L = () => 'x';
  vm.runInContext(src + ';window.__openPlayer=openPlayer;', w.ctx);
  w.ctx.__openPlayer('/media/samples/tutorial-ar.mp4');
  const lb = w.document.body.children.find((c) => c.className === 'vmk-lb');
  assert.ok(lb && lb.isConnected, 'المشغّل مفتوح');
  w.press();
  assert.equal(lb.isConnected, false, 'المشغّل أُغلق');
  assert.equal(w.els.videoMakerCloseBtn.clicks, 0, 'الصانع باقٍ');
  w.press();
  assert.equal(w.els.videoMakerCloseBtn.clicks, 1, 'Esc الثانية تغلق الصانع (المستمع أُزيل)');
});
