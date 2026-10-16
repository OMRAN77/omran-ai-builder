'use strict';
/* v-decor-furn-photos (المالك ١٤ أكتوبر: «الديكور قسم الأثاث مافي صور، حط صور على نفس الأسامي»): الخيارات الخمسة كانت تطلب
   assets/design/opts/furniture-*.webp وهي غير موجودة، فتختفي الصورة. الآن تُربط بصور الأنماط الموجودة بالأسماء نفسها. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const FURN = ['modern', 'classic', 'simple', 'luxury', 'bohemian'];

test('١. القائمة خمس قيم والأسماء كما هي', () => {
  const sel = read('js/partials-core.js').match(/<select id="designAiFurniture"[\s\S]*?<\/select>/);
  assert.ok(sel);
  assert.deepEqual([...sel[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean), FURN);
});

test('٢. كلّ خيار يُعرض بصورة موجودة فعلًا (selImg الحقيقيّ)، والإضاءة والمكان كما كانا', () => {
  const src = read('js/design-sels.js');
  const fn = src.slice(src.indexOf('  function selImg(id,v){'), src.indexOf('  function selTrigger(s){'));
  const sb = { LIGHT_POS: { warm: 1 } };
  vm.runInNewContext(fn + '\nthis.selImg = selImg;', sb);
  for (const v of FURN) {
    const rel = sb.selImg('designAiFurniture', v);
    assert.equal(rel, 'assets/design/styles/' + v + '.webp');
    assert.ok(fs.statSync(path.join(root, rel)).size > 2000, 'الملفّ موجود وليس فارغًا: ' + rel);
  }
  assert.equal(sb.selImg('designAiFurniture', ''), '', '«بدون تغيير» بلا صورة كما كان');
  assert.equal(sb.selImg('designAiLighting', 'warm'), 'assets/design/opts/lighting-warm.webp', 'الإضاءة من صورتها المنفصلة الواضحة');
  assert.equal(sb.selImg('designAiPlace', 'majlis'), 'assets/design/opts/place-majlis.webp', 'المكان كما كان');
  for (const f of ['parquet', 'marble', 'ceramic', 'carpet']) {
    assert.equal(sb.selImg('designAiFlooring', f), 'assets/design/opts/flooring-' + f + '.webp?v=' + 2);
    assert.ok(fs.statSync(path.join(root, 'assets/design/opts/flooring-' + f + '.webp')).size > 2000);
  }
});

test('٣. وسم design-sels مرفوع فلا تبقى النسخة القديمة في الكاش، والاختبار مسجّل', () => {
  assert.ok(Number((read('index.html').match(/design-sels\.js\?v=(\d+)/) || [])[1]) > 567);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/decor-furn-photos.test.cjs'));
});
