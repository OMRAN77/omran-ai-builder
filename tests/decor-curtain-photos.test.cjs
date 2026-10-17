'use strict';
/* v-decor-curtain-photos (طلب المالك ١٥ أكتوبر ٢٠٢٦: «شوف في الديكور قسم الستاير مافي صور حط صور على نفس الاسامي»):
   خيارات الستائر الثلاثة كانت تطلب assets/design/opts/curtains-*.webp وهي غير موجودة فيختفي وجه الصورة.
   الآن تُربط بصور غرف موجودة فعلًا في المستودع بالأسماء نفسها والأسماء لا تتغيّر. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CURTAINS = ['simple', 'luxury', 'remove'];

test('١. القائمة ثلاث قيم والأسماء كما هي', () => {
  const sel = read('js/partials-core.js').match(/<select id="designAiCurtains"[\s\S]*?<\/select>/);
  assert.ok(sel, 'قائمة الستائر موجودة');
  assert.deepEqual([...sel[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean), CURTAINS);
});

test('٢. كلّ خيار ستائر يُعرض بصورة موجودة فعلًا (selImg الحقيقيّ)، والإضاءة والمكان كما كانا', () => {
  const src = read('js/design-sels.js');
  const map = src.slice(src.indexOf('  var CURTAIN_IMG='), src.indexOf('  function selImg('));
  assert.ok(map.includes('CURTAIN_IMG'), 'خريطة صور الستائر موجودة');
  const fn = src.slice(src.indexOf('  function selImg(id,v){'), src.indexOf('  function selTrigger(s){'));
  const sb = { LIGHT_POS: { warm: 1, natural: 1 } };
  vm.runInNewContext(map + fn + '\nthis.selImg = selImg;', sb);
  for (const v of CURTAINS) {
    const rel = sb.selImg('designAiCurtains', v);
    assert.ok(/\.webp$/.test(rel), 'مسار صورة صالح: ' + rel);
    assert.ok(fs.statSync(path.join(root, rel)).size > 2000, 'الملفّ موجود وليس فارغًا: ' + rel);
  }
  assert.equal(sb.selImg('designAiCurtains', ''), '', '«بدون تغيير» بلا صورة كما كان');
  assert.equal(sb.selImg('designAiLighting', 'warm'), '', 'الإضاءة من لوحتها كما كانت');
  assert.equal(sb.selImg('designAiPlace', 'majlis'), 'assets/design/opts/place-majlis.webp', 'المكان كما كان');
});

test('٣. وسم design-sels مرفوع فلا تبقى النسخة القديمة في الكاش، والاختبار مسجّل', () => {
  assert.ok(Number((read('index.html').match(/design-sels\.js\?v=(\d+)/) || [])[1]) > 568);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/decor-curtain-photos.test.cjs'));
});
