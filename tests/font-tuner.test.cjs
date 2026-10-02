'use strict';
/* v-font-tuner (المالك ٢ أكتوبر، لقطة إعدادات الهاتف: «مكان الخطوط حطّ لي نفس الفكرة»): شريطا حجم وسماكة بمعاينة محادثة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('js/app-05-ui.js');
const block = src.slice(src.indexOf('const FT_SIZES = '), src.indexOf('})();', src.indexOf('window.omranApplyFontTuner = apply;')) + 5);

function run(store) {
  const attrs = {}, props = {}, classes = new Set(['fs-large']);
  const els = { ftSize: { value: '', ev: null, addEventListener(n, f) { this.ev = f; } }, ftWeight: { value: '', ev: null, addEventListener(n, f) { this.ev = f; } }, ftSizeName: {}, ftWeightName: {} };
  const root = { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } }, classList: { remove: (...c) => c.forEach((x) => classes.delete(x)) } };
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { documentElement: root, head: { appendChild() {} }, createElement: () => ({}), getElementById: (id) => els[id] || null },
    window: {}, t: (k) => k, __swallow() {},
  };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return { attrs, props, classes, els, store };
}

test('١. الافتراضيّ = حجم المحادثة وسماكتها كما هما (لا شيء يُفرض)، والاسم «عاديّ»', () => {
  const r = run({});
  assert.deepEqual(r.attrs, {});
  assert.equal(r.els.ftSize.value, '2');
  assert.equal(r.els.ftWeight.value, '1');
  assert.equal(r.els.ftSizeName.textContent, 'fontSizeNormal');
});

test('٢. السحب يطبّق فورًا ويحفظ: أكبر حجم ٢٠ بكسل وسميك ٧٠٠', () => {
  const r = run({});
  r.els.ftSize.value = '6'; r.els.ftSize.ev();
  r.els.ftWeight.value = '3'; r.els.ftWeight.ev();
  assert.equal(r.props['--omran-chat-fs'], '20px');
  assert.equal(r.props['--omran-chat-fw'], '700');
  assert.equal(r.store.chatFontStep, '6');
  assert.equal(r.els.ftWeightName.textContent, 'fontWeightBold');
});

test('٣. الاختيار القديم يُنقل: «كبير جدًّا» ← الدرجة ٥ (١٨٫٥)، والصنف القديم يُزال', () => {
  const r = run({ chatFontSize: 'xlarge' });
  assert.equal(r.store.chatFontStep, '5');
  assert.equal(r.props['--omran-chat-fs'], '18.5px');
  assert.ok(!r.classes.has('fs-large'));
});

test('٤. الواجهة: المعاينة والشريطان في قسم «حجم الخط»، والنصوص بالـ١٤ لغة، والحزمة', () => {
  const part = read('js/partials-settings.js');
  const sec = part.indexOf('id="fontSizeSection"');
  for (const id of ['fontTuner', 'ftSize', 'ftWeight']) assert.ok(part.indexOf('id="' + id + '"', sec) > sec, id);
  assert.ok(!part.includes('class="fontSizeBtn"'), 'الأزرار القديمة حُذفت');
  const keys = ['fontSizeTiny', 'fontSizeMedium', 'fontSizeHuge', 'fontWeightLabel', 'fontWeightThin', 'fontWeightBold', 'fontPreviewQ', 'fontPreviewA'];
  const core = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.equal((core.match(new RegExp('\\b' + k + ': ', 'g')) || []).length, 2, k);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const s = read('i18n/' + lg + '.js');
    for (const k of keys) assert.ok(new RegExp('"?' + k + '"?: "').test(s), lg + ':' + k);
  }
  assert.ok(read('js/app.bundle.js').includes("const FT_SIZES = [12, 13, 0, 15.5, 17, 18.5, 20];"));
});
