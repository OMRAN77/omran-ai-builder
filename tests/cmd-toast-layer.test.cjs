// tests/cmd-toast-layer.test.cjs — v-toast-layer (تدقيق ١٨ أكتوبر: g03 chat-copy، g04 paste-attach، g05 share/stamps، g14 agent).
// #settingsCmdToast (settingsToast) و#provPickToast (providerPickToast) يُخفيان بالشفافية وحدها ويبقيان في الصفحة
// بطبقة 100000 فوق الصندوق وبلا pointer-events:none، فيأكلان كلّ لمسة على وسط الصندوق و«إلغاء» الطوابع و✕ الشريحة.
// والظاهر منهما على bottom:90px ثابت يغطّي الصندوق نفسه على الجوّال (الصندوق ٧٢٩–٧٧٩ والتوست ٧٢٧–٧٧٠ في اللقطة).
// الإصلاح: pointer-events:none، وvisibility:hidden بعد التلاشي (visible عند الإظهار)، وbottom فوق #composerBox إن ظهر.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');

// يقصّ من بداية التوقيع حتّى القوس المغلق المطابق (يتجاوز النصوص والتعليقات).
function sliceBlock(src, start) {
  assert.ok(start >= 0, 'التوقيع موجود');
  let depth = 0, q = null;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('كتلة غير متوازنة');
}
const fnSrc = (name) => sliceBlock(SRC, SRC.indexOf('function ' + name + '('));
// المساعد المشترك (إن وُجد) يُحمَّل مع التوستين — غيابه اليوم يعني bottom ثابتًا
function helperSrc() {
  const i = SRC.indexOf('function __toastBottomPx(');
  return i >= 0 ? sliceBlock(SRC, i) : '';
}

function fakeStyle() {
  const st = {};
  Object.defineProperty(st, 'cssText', {
    get() { return st.__css || ''; },
    set(v) {
      st.__css = String(v);
      String(v).split(';').forEach((d) => {
        const k = d.slice(0, d.indexOf(':')).trim(); const val = d.slice(d.indexOf(':') + 1).trim();
        if (k) st[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
      });
    },
  });
  return st;
}

function ctxWith({ composerRect, above } = {}) {
  const els = {};
  const timers = [];
  const doc = {
    body: { appendChild: (e) => { if (e.id) els[e.id] = e; return e; } },
    createElement: () => ({ style: fakeStyle(), textContent: '', id: '' }),
    getElementById: (id) => {
      if (id === 'composerBox') return composerRect ? { getBoundingClientRect: () => composerRect } : null;
      return els[id] || null;
    },
  };
  const ls = new Map([['aiapp_lang', 'ar']]);
  const ctx = {
    document: doc, els, timers,
    window: { innerHeight: 844, innerWidth: 390 },
    innerHeight: 844,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimeout: () => {},
    __swallow: () => {},
    getCurrent: () => ({ continueProviders: [] }),
    functionalLabel: (k) => k,
  };
  if (above) ctx.window.__omranAboveComposer = above;
  vm.createContext(ctx);
  vm.runInContext(helperSrc() + '\n' + fnSrc('settingsToast') + '\n' + fnSrc('providerPickToast'), ctx);
  return ctx;
}
// يشغّل المؤقّتات المعلّقة (ومنها ما تجدوله المؤقّتات نفسها)
function flush(ctx) { for (let n = 0; n < 20 && ctx.timers.length; n++) { const t = ctx.timers.shift(); t.f(); } }

for (const [name, id] of [['settingsToast', 'settingsCmdToast'], ['providerPickToast', 'provPickToast']]) {
  test(name + ': لا يلتقط اللمس أبدًا، ويُخفى بـvisibility بعد التلاشي ويعود ظاهرًا عند الإظهار', () => {
    const ctx = ctxWith();
    vm.runInContext(name + "('✅ تم النسخ')", ctx);
    const el = ctx.els[id];
    assert.ok(el, 'العنصر أُنشئ');
    assert.equal(el.style.pointerEvents, 'none', 'التوست إخباريّ — لا يأكل لمسة الصندوق تحته');
    assert.equal(el.style.opacity, '1');
    assert.notEqual(el.style.visibility, 'hidden', 'ظاهر وقت العرض');
    flush(ctx);
    assert.equal(el.style.opacity, '0', 'يتلاشى');
    assert.equal(el.style.visibility, 'hidden', 'بعد التلاشي يخرج من الطبقة تمامًا');
    vm.runInContext(name + "('مرّة ثانية')", ctx);
    assert.equal(el.style.visibility, 'visible', 'الإظهار التالي يعيده ظاهرًا');
    assert.equal(el.style.opacity, '1');
  });

  test(name + ': فوق #composerBox الظاهر، و90px بلا صندوق', () => {
    let ctx = ctxWith({ composerRect: { top: 700, height: 60, left: 10, width: 370, bottom: 760 } });
    vm.runInContext(name + "('x')", ctx);
    assert.equal(ctx.els[id].style.bottom, '154px', '844 − 700 + 10: حافّته السفلى فوق حافّة الصندوق العليا');
    ctx = ctxWith();
    vm.runInContext(name + "('x')", ctx);
    assert.equal(ctx.els[id].style.bottom, '90px', 'بلا صندوق يبقى كما كان');
    ctx = ctxWith({ composerRect: { top: 0, height: 0, left: 0, width: 0, bottom: 0 } });
    vm.runInContext(name + "('x')", ctx);
    assert.equal(ctx.els[id].style.bottom, '90px', 'صندوق مخفيّ (ارتفاع صفر) = 90px');
    ctx = ctxWith({ composerRect: { top: 820, height: 40, left: 0, width: 300, bottom: 860 } });
    vm.runInContext(name + "('x')", ctx);
    assert.equal(ctx.els[id].style.bottom, '90px', 'لا ينزل تحت 90px أبدًا');
  });

  test(name + ': المساعد المشترك window.__omranAboveComposer يُقدَّم إن وُجد', () => {
    const ctx = ctxWith({ composerRect: { top: 700, height: 60, left: 10, width: 370, bottom: 760 }, above: () => 200 });
    vm.runInContext(name + "('x')", ctx);
    assert.equal(ctx.els[id].style.bottom, '200px');
  });
}
