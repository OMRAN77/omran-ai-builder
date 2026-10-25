// tests/fx-look-match.test.cjs — طلب المالك (٢٥ أكتوبر): «افحص لي الازياء… الصور لي ماتطابق الشي الي اخترته… واحد واحد».
// فُحصت الصور الـ١٢٠ واحدةً واحدة، وكلّ معرض في الأداة بمسبار Chromium (الاسم ← الصورة المعروضة فعلًا، بالـ١٤ لغة). ما لم يطابق:
// (١) v-fx-acc-ratio: صور الإضافات النسائيّة الستّ صارت 1024×1371 (٣:٤) في ١٧ أكتوبر، ونقاط تقريبها بقيت لصور ٣٦٠×٥٤٠ (٢:٣):
//     الصورة تُمطّ طوليًّا ١٢٪، و«حقيبة» تُظهر العباية والحقيبة تحت الاسم، و«مكياج» أعلى الحجاب والعينان مقطوعتان.
// (٢) v-fx-occ-look: بطاقة المناسبة للرجال والأطفال تعرض نمطًا وما يُولَّد نمط آخر (تخرّج رجل: ثلاث قطع ← رسمي،
//     سفر طفل: دنيم ← كاجوال، تخرّج طفل: بريبي ← رسمي). الآن المناسبة تولّد النمط الذي في صورتها.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const DG = read('js/design-gen.js');
const STUDIOS = read('js/app-12-studios.js');

function block(src, start, end, keepEnd) {
  const i = src.indexOf(start);
  let j = src.indexOf(end, i);
  assert.ok(i >= 0 && j > i, 'كتلة غير موجودة: ' + start);
  if (keepEnd) j += end.length;
  return src.slice(i, j);
}
// أبعاد WebP من ترويسته (VP8 / VP8L / VP8X) — بلا مكتبة
function webpSize(file) {
  const b = fs.readFileSync(path.join(root, file));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  throw new Error('صيغة WebP غير معروفة: ' + kind);
}
function dg() {
  const ctx = {};
  vm.runInNewContext("var LOOKS='assets/fashion/looks/';\n" +
    block(DG, '  var EXT=[', '\n', false) + '\n' +
    block(DG, '  var R34=', '\n  var EXT_ICON=', false) + '\n' +
    block(DG, '  var EXT_FOCUS=', '\n', false) + '\n' +
    block(DG, '  function focusCss(f){', '\n  function paintAcc(', false) + '\n' +
    block(DG, '  var KIND_LOOK={', '\n  };', true) + '\n' +
    'this.EXT=EXT; this.PIC=EXT_PIC; this.F=EXT_FOCUS; this.css=focusCss; this.K=KIND_LOOK;', ctx);
  return ctx;
}
// ما يرسمه focusCss داخل المربّع: الصورة بعرض z×المربّع، ونسبتها من aspect-ratio
function crop(css) {
  const num = (k) => Number(css.match(new RegExp('(?:^|;)' + k + ':(-?[\\d.]+)%'))[1]) / 100;
  const ar = css.match(/aspect-ratio:([\d.]+)\/([\d.]+)/);
  const w = num('width'), l = num('left'), t = num('top'), ratio = Number(ar[2]) / Number(ar[1]);
  return { w, l, t, ratio, h: w * ratio,
    at: (x, y) => [l + x * w, t + y * w * ratio] }; // نقطة من الصورة (نسب) ← موضعها في المربّع (نسب)
}

// موضع القطعة في كلّ صورة نسائيّة، مقيس بالبكسل على شبكة عُشريّة فوق 1024×1371 ثمّ نسبًا: [x1, y1, x2, y2]
const WOMEN_ITEM = {
  Glasses: [0.45, 0.19, 0.77, 0.30],   // العدستان
  Watch: [0.40, 0.43, 0.51, 0.53],     // الميناء والسوار
  Handbag: [0.40, 0.535, 0.635, 0.795], // الحقيبة من أعلى المقبض إلى قاعدتها
  Shoes: [0.50, 0.46, 0.95, 0.62],     // الحذاء الأماميّ كاملًا (الكعب إلى المقدّمة)
  Scarf: [0.38, 0.08, 0.60, 0.40],     // الوشاح على الرأس وعقدته
  Makeup: [0.45, 0.25, 0.75, 0.40],    // من العينين إلى الشفتين
};
// الاسم فوق أسفل المربّع بتدرّج؛ نصّه في الخُمس الأخير — القطعة فوقه
const LABEL_TOP = 0.8;

test('١. صور الإضافات تُرسم بنسبة أبعادها الحقيقيّة (لا مطّ) في الفئات الثلاث', () => {
  const c = dg();
  for (const r of c.EXT) {
    const k = r[0];
    const women = 'assets/fashion/looks/extras/' + k.toLowerCase() + '.webp';
    const [w, h] = webpSize(women);
    const got = crop(c.css(c.F[k])).ratio;
    assert.ok(Math.abs(got - h / w) < 0.002, 'نسائي/' + k + ': مرسومة ' + got.toFixed(3) + ' والصورة ' + (h / w).toFixed(3) + ' — مطّ');
    for (const g of ['men', 'kids']) {
      const [src, f] = c.PIC[g][k];
      const [gw, gh] = webpSize(src.replace(/\?v=\d+$/, ''));
      assert.ok(Math.abs(crop(c.css(f)).ratio - gh / gw) < 0.002, g + '/' + k + ': مطّ');
    }
  }
});

test('٢. كلّ إضافة نسائيّة تُظهر القطعة نفسها كاملةً داخل المربّع وفوق الاسم (القصّ يطابق الاسم)', () => {
  const c = dg();
  for (const [k, box] of Object.entries(WOMEN_ITEM)) {
    const q = crop(c.css(c.F[k]));
    // الصورة تغطّي المربّع بلا فراغ
    assert.ok(q.l <= 0 && q.l + q.w >= 1 - 1e-3, k + ': فراغ أفقيّ');
    assert.ok(q.t <= 0 && q.t + q.h >= 1 - 1e-3, k + ': فراغ عموديّ');
    const [x1, y1] = q.at(box[0], box[1]), [x2, y2] = q.at(box[2], box[3]);
    assert.ok(x1 >= 0 && x2 <= 1, k + ': القطعة خارج المربّع أفقيًّا [' + x1.toFixed(2) + '، ' + x2.toFixed(2) + ']');
    assert.ok(y1 >= 0, k + ': أعلى القطعة مقصوص (' + y1.toFixed(2) + ')');
    assert.ok(y2 <= LABEL_TOP, k + ': القطعة تحت الاسم أو خارج المربّع (أسفلها عند ' + y2.toFixed(2) + ')');
    // القطعة ظاهرة بحجم يُقرأ: ربع عرض المربّع على الأقلّ
    assert.ok(x2 - x1 >= 0.25, k + ': القطعة صغيرة في المربّع');
  }
});

test('٣. بطاقة المناسبة للرجال والأطفال تولّد النمط الذي في صورتها', () => {
  const c = dg();
  const ctx = {};
  vm.runInNewContext(block(STUDIOS, 'const GENDER_STYLES = {', '\n  };', true) + '\n' +
    block(STUDIOS, 'const FX_OCC_STYLE = {', '\n  };', true) + '\nthis.G = GENDER_STYLES; this.M = FX_OCC_STYLE;', ctx);
  for (const g of ['men', 'kids']) {
    for (const [occ, look] of Object.entries(c.K[g].occasion)) {
      assert.equal(ctx.M[occ][g], look, g + '/' + occ + ': الصورة ' + look + ' والمولَّد ' + ctx.M[occ][g]);
      assert.ok(ctx.G[g].includes(look), look + ' في قائمة ' + g);
    }
  }
  // الحزمة مبنيّة من الجزء، ووسم design-gen المنفصل رُفع
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("graduation: { women:'formal',  men:'threepiece',  kids:'preppy' },"), 'الحزمة قديمة — npm run bundle');
  assert.ok(Number((/\/js\/design-gen\.js\?v=(\d+)/.exec(read('index.html')) || [])[1]) >= 618, 'وسم design-gen');
});
