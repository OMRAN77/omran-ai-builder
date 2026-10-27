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

/* v-decor-floor-full (#1088، المالك ١٥ أكتوبر: صورة الأرضيّة كاملة وحادّة في بطاقتها لا شريطًا مكبَّرًا مقتطعًا؛ أُعيد دمجه فوق main ٢٢ أكتوبر):
   إصلاحه الأصليّ (contain على خلفيّة opts/flooring-*.webp في بطاقة 3:4) تجاوزه v-decor-18 (#1107): لكلّ أرضيّة صورة 16:9 في بطاقة معرض 16:9،
   فـcover يعرضها كاملة بلا قصّ ولا تكبير. هذا الفحص يثبّت هدف الطلب نفسه بالآليّة الحاليّة. */
test('٤. v-decor-floor-full: صورة الأرضيّة كاملة وحادّة في بطاقة المعرض — نسبة الصورة = نسبة البطاقة (16:9) وبلا تكبير، ولا شريط مقتطع من الصور العموديّة القديمة', () => {
  const src = read('js/design-sels.js'), ui = read('js/app-05-ui.js');
  // الأرضيّات من الأقسام الستّة، ومعرضها أفقيّ: openCfg يمرّر landscape للستّة، والمعرض يرسم بطاقته 16/9 حين landscape.
  assert.match(src, /var OPT6=\[[^\]]*'designAiFlooring'[^\]]*\];/, 'الأرضيّات في OPT6');
  assert.ok(src.includes('var six=OPT6.indexOf(s.id)!==-1;') && src.includes('landscape: six, overlay: six,'), 'معرض الأقسام الستّة أفقيّ');
  assert.ok(ui.includes("aspect-ratio:'+(cfg.landscape ? '16/9' : '3/4')+'"), 'بطاقة المعرض 16:9 حين landscape');
  // كلّ صورة أرضيّة (المسار الحقيقيّ من selImg) بنسبة 16:9 تمامًا وعرضها ≥ 1280 — أعرض من أيّ بطاقة — فـobject-fit:cover يعرضها كاملة بلا قصّ ولا تكبير.
  const fn = src.slice(src.indexOf('  function selImg(id,v){'), src.indexOf('  function optTxt(o){'));
  const sb = {};
  vm.runInNewContext(src.match(/  var OPT_FILE=\{[^}]+\};/)[0] + '\n' + fn + '\nthis.selImg = selImg;', sb);
  const sel = read('js/partials-core.js').match(/<select id="designAiFlooring"[\s\S]*?<\/select>/)[0];
  const vals = [...sel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(vals.length >= 17, 'خيارات الأرضيّات: ' + vals.length);
  const dims = (b) => { const t = b.toString('ascii', 12, 16); return t === 'VP8X' ? [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1] : t === 'VP8 ' ? [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff] : [0, 0]; };
  for (const v of vals) {
    const rel = sb.selImg('designAiFlooring', v);
    const [w, h] = dims(fs.readFileSync(path.join(root, rel.replace(/\?.*$/, ''))));
    assert.equal(w * 9, h * 16, 'صورة ' + v + ' ليست 16:9: ' + w + '×' + h);
    assert.ok(w >= 1280, 'صورة ' + v + ' أضيق من البطاقة فتُكبَّر: ' + w);
  }
  // الصور القديمة opts/flooring-*.webp (عموديّة 1195×1600) التي كان cover يقتطع منها شريطًا لم تعد وجه البطاقة.
  assert.ok(!/design\/opts\/flooring-/.test(src), 'لا رجوع إلى صور الأرضيّات القديمة المقتطعة');
});
