// tests/picker-cols.test.cjs — v-picker-cols (المالك ١٦ أكتوبر: «فيه صور مغبّشة أكثرها»): بعد v-lighting-3d كان فتح أيّ معرض غير
// الإضاءة يكتب gridTemplateColumns = '' فيمحو أعمدة الشبكة المكتوبة في وسمها (partials-core)، فيصير المعرض بطاقة واحدة بعرض
// الشاشة وصورة النمط ٣٦٠ بكسل ممطوطة إلى ١٤٠٠ — «مغبّشة». يشغّل فاتح المعرض الحقيقيّ من الحزمة على DOM مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bundle = fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8');
const a = bundle.indexOf('/* v-omran-picker:');
const b = bundle.indexOf('})();', bundle.indexOf('window.omranPicker.trigger = function')) + 5;
const src = bundle.slice(a, b);

function el(id) {
  return { id, style: {}, children: [], textContent: '', set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },
    appendChild(c) { this.children.push(c); return c; }, classList: { add() {} }, querySelector() { return null; } };
}
function boot() {
  const els = { pickerSheet: el('pickerSheet'), pickerSheetGrid: el('pickerSheetGrid'), pickerSheetTitle: el('t'), pickerSheetCount: el('c'), pickerSheetClose: el('x') };
  // العمود الافتراضيّ كما يكتبه الوسم نفسه — style.gridTemplateColumns يقرأ ما في الوسم حتّى يُكتب فوقه.
  els.pickerSheetGrid.style.gridTemplateColumns = (fs.readFileSync(path.join(root, 'js/partials-core.js'), 'utf8').match(/id="pickerSheetGrid" style="[^"]*grid-template-columns:([^;]+);/) || [])[1];
  const window = {};
  const document = { getElementById: (id) => els[id] || null, createElement: () => el('x') };
  vm.runInNewContext(src, { window, document, localStorage: { getItem: () => null } });
  return { window, grid: els.pickerSheetGrid };
}
const items = [{ v: 'a', title: 'A', img: 'a.webp' }, { v: 'b', title: 'B', img: 'b.webp' }];

test('١. معرض عاديّ بعد معرض الإضاءة الأفقيّ يعود لشبكة الأعمدة، لا عمود واحد بعرض الشاشة', () => {
  const { window, grid } = boot();
  const def = grid.style.gridTemplateColumns;
  assert.equal(def, 'repeat(auto-fill,minmax(150px,1fr))', 'افتراضيّ الوسم');
  window.omranPicker.open({ title: 'الإضاءة', items, landscape: true });
  assert.match(grid.style.gridTemplateColumns, /minmax\(min\(45%,230px\),1fr\)/, 'الأفقيّ عمودان على الجوّال (v-decor-18)');
  window.omranPicker.open({ title: 'نمط الديكور', items });
  assert.equal(grid.style.gridTemplateColumns, def, 'الأعمدة رجعت — لا ""');
});

test('٢. أوّل فتح لمعرض عاديّ (أزياء/ستايل/نمط) لا يمحو الأعمدة', () => {
  const { window, grid } = boot();
  window.omranPicker.open({ title: 'المناسبة', items });
  assert.ok(grid.style.gridTemplateColumns && /minmax\(150px,1fr\)/.test(grid.style.gridTemplateColumns));
  assert.equal(grid.children.length, 2);
});
