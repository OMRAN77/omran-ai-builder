// tests/hist-menu-pos.test.cjs — v-hist-menu-rtl (تدقيق ١٨ أكتوبر: g02 history-item-menu — الموضع؛ التعبئة في حزمة أخرى).
// فرعا الموضع كانا متساويين: في RTL «r.left − mw + r.width» = «r.right − mw»، فتمتدّ القائمة يسارًا من ⋮ (طرف الصفّ
// الأيسر) وتخرج من الشريط إلى المحادثة (حاسوب: القائمة ٩١٧–١٠٦٨ والشريط يبدأ ١٠١٧؛ جوّال: ٦–١٥٧ والدرج يبدأ ٨٠).
// الإصلاح: في RTL تبدأ القائمة من حافّة ⋮ اليسرى وتمتدّ فوق الصفّ داخل الشريط؛ الحصر القائم باقٍ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');

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

function place(dir, rect) {
  let menu = null;
  const mkEl = () => {
    const e = { style: {}, children: [], innerHTML: '', offsetWidth: 130, offsetHeight: 90, className: '' };
    e.classList = { add() {}, remove() {} };
    e.appendChild = (c) => { e.children.push(c); return c; };
    return e;
  };
  const ctx = {
    lang: 'ar',
    document: {
      documentElement: { dir },
      getElementById: (id) => (id === 'histItemMenu' ? menu : null),
      createElement: () => mkEl(),
      body: { appendChild: (e) => { menu = e; return e; } },
      addEventListener() {},
    },
    window: { innerWidth: 400, innerHeight: 800, addEventListener() {} },
    t: (k) => k,
  };
  vm.createContext(ctx);
  vm.runInContext(sliceBlock(SRC, SRC.indexOf('function ensureHistItemMenu(')) + '\n' + sliceBlock(SRC, SRC.indexOf('function openHistItemMenu(')), ctx);
  ctx.anchor = { getBoundingClientRect: () => Object.assign({ top: 200, bottom: 221 }, rect) };
  vm.runInContext("openHistItemMenu(anchor, { id: 'p1', title: 't' }, 'openai')", ctx);
  return menu.style.left;
}

test('١. RTL: القائمة تبدأ من حافّة ⋮ اليسرى (داخل الشريط) لا تمتدّ خارجه', () => {
  assert.equal(place('rtl', { left: 100, right: 120, width: 20 }), '100px', 'كانت −10 تُحصر إلى 6 خارج الدرج');
  assert.equal(place('rtl', { left: 350, right: 373, width: 23 }), '264px', 'الحصر بحافّة الشاشة باقٍ (400 − 130 − 6)');
});

test('٢. LTR كما كان: القائمة تنتهي عند حافّة ⋮ اليمنى', () => {
  assert.equal(place('ltr', { left: 300, right: 320, width: 20 }), '190px');
  assert.equal(place('ltr', { left: 20, right: 40, width: 20 }), '6px', 'الحصر بحافّة الشاشة اليسرى');
});
