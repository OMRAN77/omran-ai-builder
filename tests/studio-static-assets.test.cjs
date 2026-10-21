// tests/studio-static-assets.test.cjs — v-studio-static-set + v-picker-shimmer + v-studio-tab-wrap (تدقيق ١٨ أكتوبر، g08 style-features/style-open):
// - مئات أخطاء 404: الصور الجاهزة ٩٦ خيارًا و١٠ تبويبات، وكلّ خيار غيرها (~٩٠٪، وكلّ الميزات الأربع عشرة الإضافيّة) يطلب ملفًّا غائبًا
//   أوّلًا ثمّ المعاينة المولّدة. الآن قائمتان تطابقان المجلّدين، وما ليس فيهما يذهب إلى المعاينة مباشرة.
// - صور الخيارات مربّعات فارغة نحو ٨ ث بلا مؤشّر: بطاقة المعرض الموحّد عليها لمعة تحميل حتّى تصل الصورة أو يفشل احتياطها.
// - تبويب «Heritage/Traditional» مقصوص «eritage/Tradition»: نصّ التبويب يلتفّ سطرين بدل nowrap مقصوص من الطرفين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const A13 = read('js/app-13-stocks-init.js');
const UI = read('js/app-05-ui.js');
const cut = (s, a, b) => {
  const i = s.indexOf(a); assert.ok(i >= 0, 'مقطع مفقود: ' + a);
  const j = s.indexOf(b, i + a.length); assert.ok(j > i, 'نهاية مفقودة: ' + b);
  return s.slice(i, j);
};
function loadImgs() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(cut(A13, 'const PREVIEW_API = ', 'const IS_MORE = ')
    + '\nthis.O = typeof STUDIO_STATIC_OPTS !== "undefined" ? STUDIO_STATIC_OPTS : null; this.F = typeof STUDIO_STATIC_FEATS !== "undefined" ? STUDIO_STATIC_FEATS : null; this.f = optionImgs; this.P = PREVIEW_API;', ctx);
  return ctx;
}
const names = (dir) => fs.readdirSync(path.join(root, dir)).filter((n) => n.endsWith('.webp')).map((n) => n.slice(0, -5)).sort();

test('١. القائمتان تطابقان assets/studio/options وfeatures بالضبط — صورة جديدة لا تُنسى', () => {
  const ctx = loadImgs();
  assert.ok(ctx.O && ctx.F, 'STUDIO_STATIC_OPTS وSTUDIO_STATIC_FEATS معرّفتان');
  assert.deepEqual([...ctx.O].sort(), names('assets/studio/options'));
  assert.deepEqual([...ctx.F].sort(), names('assets/studio/features'));
  assert.equal(ctx.O.size, 96);
  assert.equal(ctx.F.size, 10);
});

test('٢. optionImgs: الغائب يذهب إلى المعاينة مباشرة بلا ملفّ ثابت، والموجود كما كان', () => {
  const { f } = loadImgs();
  const hijab = f('hijab', 'gulf');
  assert.match(hijab.img, /^\/api\/studio-preview\?feature=hijab&value=gulf$/);
  assert.ok(!hijab.img2, 'لا احتياط ثابت غائب');
  const esp = f('hair', 'espresso');
  assert.match(esp.img, /^\/api\/studio-preview/, 'خيار شعر بلا صورة جاهزة');
  assert.ok(!esp.img2);
  const black = f('hair', 'black');
  assert.match(black.img, /^assets\/studio\/options\/hair-black\.webp\?v=\d+$/, 'الجاهزة أوّلًا');
  assert.match(black.img2, /^\/api\/studio-preview/, 'والمعاينة احتياطها');
  const red = f('nails', 'red');
  assert.match(red.img, /^\/api\/studio-preview/, 'الأظافر معاينة-أوّلًا كما هي');
  assert.match(red.img2, /^assets\/studio\/options\/nails-red\.webp/);
  for (const s of [hijab, esp, black, red]) for (const u of [s.img, s.img2]) {
    if (!u || !u.startsWith('assets/')) continue;
    const file = u.replace(/\?.*$/, '');
    assert.ok(fs.existsSync(path.join(root, file)), 'كلّ مسار ثابت موجود: ' + file);
  }
});

function fakeTab(feature, text) {
  const txt = { nodeType: 3, textContent: text };
  const b = {
    dataset: { feature }, style: { cssText: 'white-space:nowrap;' }, childNodes: [txt], kids: [txt],
    get firstChild() { return this.kids[0]; },
    querySelector(s) { return s === 'img' ? (this.kids.find((k) => k.tag === 'IMG') || null) : null; },
    insertBefore(n, ref) { const i = this.kids.indexOf(ref); this.kids.splice(i < 0 ? 0 : i, 0, n); this.childNodes = this.kids; },
    replaceChild(n, old) { this.kids[this.kids.indexOf(old)] = n; this.childNodes = this.kids; },
  };
  return b;
}
test('٣. التبويبات: الميزة بلا صورة جاهزة تطلب المعاينة مباشرة، والنصّ يلتفّ سطرين لا يُقصّ', () => {
  const base = loadImgs();
  const tabs = [fakeTab('hair', '💇 الشعر'), fakeTab('hijab', '🧕 لفّات الحجاب'), fakeTab('heritage', '🏛️ Heritage/Traditional')];
  const ctx = Object.assign(base, {
    IS_MORE: (f) => f === 'hijab',
    tabsWrap: { querySelectorAll: () => tabs },
    document: { createElement: (t) => ({ tag: String(t).toUpperCase(), style: {}, remove() {} }) },
    Array,
  });
  vm.runInContext(cut(A13, '  function photoizeStudioTabs(){', '  photoizeStudioTabs();\n') + '\nphotoizeStudioTabs();', ctx);
  const img = (b) => b.kids.find((k) => k.tag === 'IMG');
  assert.equal(img(tabs[0]).src, 'assets/studio/features/hair.webp');
  assert.equal(img(tabs[1]).src, base.P('hijab', '__tab'), 'لا طلب لـassets/studio/features/hijab.webp الغائب');
  img(tabs[1]).onerror();
  for (const b of tabs) {
    const css = b.style.cssText;
    assert.ok(css.lastIndexOf('white-space:normal') > css.lastIndexOf('white-space:nowrap'), 'white-space:normal يغلب nowrap: ' + css);
    const sp = b.kids.find((k) => k.tag === 'SPAN');
    assert.ok(sp, 'النصّ في span');
    assert.match(sp.style.cssText, /-webkit-line-clamp:2/, 'سطران كحدّ');
    assert.match(sp.style.cssText, /max-width:100%/);
  }
  assert.equal(tabs[2].kids.find((k) => k.tag === 'SPAN').textContent, '🏛️ Heritage/Traditional');
});

function pickerBoot() {
  const made = [];
  const mk = (tag) => {
    const e = { tag, style: {}, children: [], textContent: '', cls: new Set(),
      appendChild(c) { this.children.push(c); return c; }, remove() { this.removed = true; } };
    e.classList = { add: (c) => e.cls.add(c), remove: (c) => e.cls.delete(c), contains: (c) => e.cls.has(c) };
    made.push(e); return e;
  };
  const grid = mk('grid'); grid.style.gridTemplateColumns = ''; Object.defineProperty(grid, 'innerHTML', { set() { grid.children = []; }, get() { return ''; } });
  const els = { pickerSheet: mk('sheet'), pickerSheetGrid: grid, pickerSheetTitle: mk('t'), pickerSheetCount: mk('c'), pickerSheetClose: mk('x') };
  const head = mk('head');
  const window = {};
  const document = { head, getElementById: (id) => els[id] || head.children.find((c) => c.id === id) || null, createElement: (t) => mk(t) };
  vm.runInNewContext(cut(UI, '/* v-omran-picker:', '/* v-mob-compact:'), { window, document, localStorage: { getItem: () => null } });
  return { window, grid, head };
}
test('٤. المعرض الموحّد: لمعة pkLoading حتّى تصل الصورة، وتزول عند التحميل أو بعد فشل الاحتياط', () => {
  const { window, grid, head } = pickerBoot();
  window.omranPicker.open({ title: 'x', items: [
    { v: 'a', title: 'A', img: 'a.webp' },
    { v: 'b', title: 'B', img: 'b.webp', img2: 'b2.webp' },
    { v: 'c', title: 'C', img: 'c.webp' },
    { v: 'd', title: 'D' },
  ] });
  const wraps = grid.children.map((card) => card.children[0]);
  const im = (w) => w.children.find((c) => c.tag === 'img');
  assert.ok(wraps.slice(0, 3).every((w) => w.classList.contains('pkLoading')), 'البطاقات المصوّرة عليها اللمعة');
  assert.ok(!wraps[3].classList.contains('pkLoading'), 'بطاقة بلا صورة بلا لمعة');
  im(wraps[0]).onload();
  assert.ok(!wraps[0].classList.contains('pkLoading'), 'تزول عند التحميل');
  im(wraps[1]).onerror();
  assert.ok(wraps[1].classList.contains('pkLoading'), 'الاحتياط ما زال يُحمَّل');
  assert.equal(im(wraps[1]).src, 'b2.webp');
  im(wraps[1]).onerror();
  assert.ok(!wraps[1].classList.contains('pkLoading'), 'تزول بعد فشل الاحتياط');
  im(wraps[2]).onerror();
  assert.ok(!wraps[2].classList.contains('pkLoading'), 'بلا احتياط تزول من أوّل فشل');
  const css = head.children.map((c) => c.textContent).join('\n');
  assert.match(css, /\.pkLoading\{/, 'قاعدة اللمعة محقونة');
  assert.match(css, /@media \(prefers-reduced-motion: ?reduce\)\{[^}]*\.pkLoading\{animation:none/, 'تحترم تقليل الحركة');
});

test('٥. المتّصلون الآخرون بلا احتياط فارغ: بطاقة المقارنة والمصغّرة لا تضعان src=""', () => {
  const b = cut(A13, '  function buildCompareChecks(){', '  const studioCardsEl');
  assert.match(b, /if\(!img\.__alt && srcs\.img2\)/);
  const r = cut(A13, '  function renderStudioStyleCards(){', '  /* v-studio-combo-removed');
  assert.match(r, /if\(!img\.__alt && __srcs\.img2\)/);
});
