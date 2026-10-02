'use strict';
/* v-nails-previews (المالك ٢ أكتوبر): بطاقات الأظافر الاثنتا عشرة (الألوان والفنون) كانت صورًا جاهزة خاطئة (فساتين).
   الآن المعاينة المولّدة أوّلًا بالأسماء نفسها، ولكلّ واحدة وصفها في المولّد وتأطير اليد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-13-stocks-init.js'), 'utf8');
const B = require('../api/_lib/studio-styles.js');
const TWELVE = ['red', 'nude', 'black', 'french', 'pink', 'gold', 'ombrenails', 'glitter', 'mattegray', 'chrome', 'marble', 'artnails'];

test('١. صورة كلّ بطاقة أظافر من المولّد أوّلًا (والجاهزة احتياط)، والمكياج كما هو', () => {
  const a = src.indexOf('const PREVIEW_API = ');
  const b = src.indexOf('const IS_MORE = ', a);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.f = optionImgs;', ctx);
  for (const v of TWELVE) {
    const r = ctx.f('nails', v);
    assert.equal(r.img, '/api/studio-preview?feature=nails&value=' + v, v);
    assert.equal(r.img2, 'assets/studio/options/nails-' + v + '.webp');
  }
  assert.match(ctx.f('makeup', 'x').img, /^\/api\/studio-preview/);
  assert.match(ctx.f('hair', 'x').img, /^assets\//, 'غيرها كما هو');
});

test('٢. لكلّ واحدة من الاثنتي عشرة وصف في المولّد، والتأطير يد قريبة بالأظافر', () => {
  for (const v of TWELVE) assert.ok(B.STYLE_TEXT.nails[v] && B.STYLE_TEXT.nails[v].length > 30, v);
  assert.match(B.PREVIEW_FRAME.nails, /hand/);
  assert.match(B.PREVIEW_FRAME.nails, /fingernails/);
  assert.ok(fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8').includes("const PREVIEW_FIRST = ['makeup', 'nails'];"));
});
