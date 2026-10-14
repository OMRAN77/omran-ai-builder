'use strict';
/* v-decor-furn-photos (المالك ١٤ أكتوبر: «بعدّل صور خيارات الأثاث داخل الديكور» · «ما عندي رصيد»):
   الخمس مربوطة بصور أنماطها الموجودة، والملفّ موجود، بلا مسار furniture-* ناقص. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const FURN = ['modern', 'classic', 'simple', 'luxury', 'bohemian'];

test('١. القائمة خمس قيم كما كانت، والأسماء لم تُمسّ', () => {
  const html = read('js/partials-core.js');
  const sel = html.match(/<select id="designAiFurniture"[\s\S]*?<\/select>/);
  assert.ok(sel, 'designAiFurniture مفقود');
  const vals = [...sel[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  assert.deepEqual(vals, FURN, 'خيارات الأثاث');
  for (const [v, k] of [['modern', 'FurnitureModern'], ['classic', 'FurnitureClassic'], ['simple', 'FurnitureSimple'], ['luxury', 'FurnitureLuxury'], ['bohemian', 'FurnitureBohemian']]) {
    assert.ok(sel[0].includes('data-i18n="designAi' + k + '"'), 'اسم ' + v);
  }
});

test('٢. كل خيار مربوط بملفّ نمط موجود — لا furniture-* ناقص', () => {
  const src = read('js/design-sels.js');
  assert.match(src, /if\(id==='designAiStyle' \|\| id==='designAiFurniture'\) return 'assets\/design\/styles\/'\+v\+'\.webp'/);
  assert.doesNotMatch(src, /furniture-'\+v/);
  for (const v of FURN) {
    const rel = 'assets/design/styles/' + v + '.webp';
    assert.ok(fs.existsSync(path.join(root, rel)), 'مفقود: ' + rel);
    const st = fs.statSync(path.join(root, rel));
    assert.ok(st.size > 2000, 'فارغ: ' + rel);
    assert.ok(!fs.existsSync(path.join(root, 'assets/design/opts/furniture-' + v + '.webp')), 'لا تعتمد ملفّ أثاث ناقص: ' + v);
  }
});

test('٣. الإضاءة كما هي، والوسم مرفوع', () => {
  const src = read('js/design-sels.js');
  assert.ok(src.includes("if(id==='designAiLighting'&&LIGHT_POS[v]) return '';"), 'selImg للإضاءة فارغ كما كان');
  assert.ok(src.includes("if(id==='designAiLighting'&&LIGHT_POS[v]) return lightBg(v);"), 'roomBg للإضاءة من اللوحة');
  const v = Number((read('index.html').match(/design-sels\.js\?v=(\d+)/) || [])[1]);
  assert.ok(v > 567, 'وسم design-sels مرفوع فوق 567: ' + v);
});
