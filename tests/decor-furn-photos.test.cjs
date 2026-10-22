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
// v-decor-18 (المالك ١٦ أكتوبر): الأثاث ١٧ خيارًا (الخمسة الأولى كما هي أوّلًا)، وصورة كلّ خيار من decor-opts بمقاس الإضاءة
// بدل استعارة صور الأنماط — الغرفة نفسها والأثاث وحده يتغيّر.
const FURN5 = ['modern', 'classic', 'simple', 'luxury', 'bohemian'];

test('١. القائمة ١٧ قيمة تبدأ بالخمسة القديمة كما هي', () => {
  const sel = read('js/partials-core.js').match(/<select id="designAiFurniture"[\s\S]*?<\/select>/);
  assert.ok(sel);
  const vals = [...sel[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  assert.equal(vals.length, 17);
  assert.deepEqual(vals.slice(0, 5), FURN5, 'القيم المحفوظة عند المستخدمين لا تتغيّر');
});

test('٢. كلّ خيار يُعرض بصورة موجودة فعلًا (selImg الحقيقيّ)، والإضاءة والمكان والنمط كما كانت', () => {
  const src = read('js/design-sels.js');
  const fn = src.slice(src.indexOf('  function selImg(id,v){'), src.indexOf('  function optTxt(o){'));
  const opt = src.match(/  var OPT_FILE=\{[^}]+\};/)[0];
  const sb = {};
  // الوسم يُقرأ ولا يُثبَّت (سقّاطة vPinTests): المسار بلا الوسم، والرقم ≥ الحدّ الأدنى.
  const bare = (r) => r.replace(/\?v=\d+$/, '');
  const ver = (r) => Number((/\?v=(\d+)$/.exec(r) || [])[1] || 0);
  vm.runInNewContext(opt + '\n' + fn + '\nthis.selImg = selImg;', sb);
  const sel = read('js/partials-core.js').match(/<select id="designAiFurniture"[\s\S]*?<\/select>/)[0];
  for (const v of [...sel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])) {
    const rel = sb.selImg('designAiFurniture', v);
    assert.equal(bare(rel), 'assets/design/decor-opts/furniture-' + v + '.webp'); assert.ok(ver(rel) >= 1, 'وسم كاش: ' + rel);
    assert.ok(fs.statSync(path.join(root, rel.replace(/\?.*$/, ''))).size > 2000, 'الملفّ موجود وليس فارغًا: ' + rel);
  }
  assert.equal(sb.selImg('designAiFurniture', ''), '', '«بدون تغيير» بلا صورة — علامة ⊘');
  assert.equal(sb.selImg('designAiLighting', 'warm'), 'assets/design/opts/lighting-warm.webp', 'الإضاءة من صورتها المنفصلة الواضحة');
  const place = sb.selImg('designAiPlace', 'majlis'), style = sb.selImg('designAiStyle', 'modern'), floor = sb.selImg('designAiFlooring', 'parquet');
  assert.ok(bare(place) === 'assets/design/opts/place-majlis.webp' && ver(place) >= 2, 'المكان (موضَّح — v-sharp): ' + place);
  assert.ok(bare(style) === 'assets/design/styles/modern.webp' && ver(style) >= 2, 'النمط (موضَّح — v-sharp): ' + style);
  assert.ok(bare(floor) === 'assets/design/decor-opts/flooring-parquet.webp' && ver(floor) >= 1, floor);
  const marble = sb.selImg('designAiFlooring', 'marble');
  assert.equal(bare(marble), 'assets/design/decor-opts/flooring-marble.webp');
  assert.ok(ver(marble) >= 1, 'وسم كاش لصورة الرخام: ' + marble);
  assert.ok(fs.statSync(path.join(root, 'assets/design/decor-opts/flooring-marble.webp')).size > 2000, 'صورة الرخام موجودة');
});

test('٣. وسم design-sels مرفوع فلا تبقى النسخة القديمة في الكاش، والاختبار مسجّل', () => {
  assert.ok(Number((read('index.html').match(/design-sels\.js\?v=(\d+)/) || [])[1]) > 570);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/decor-furn-photos.test.cjs'));
});
