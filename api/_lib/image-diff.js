'use strict';
/* v-img-honest (المالك ٢٣ سبتمبر: «أوّل شي يقولي شي والتنفيذ صفر» — لقطة «أنماط الصور» رجعت كما هي
   وتحتها «تمّ تغيير جميع الوجوه»): قياس بالبكسل لا يكذب — هل تغيّر الناتج عن المصدر فعلًا؟
   نموذج الرؤية الذي يكتب التقرير يميل لتصديق الطلب؛ هذا القياس لا يرى الطلب أصلًا.
   يفكّ JPEG/PNG (الحزمتان في dependencies ومستعملتان في face-composite)، يصغّر المصدر والناتج
   إلى شبكة N×N بمتوسّط المساحة، ويقارن خليّةً بخليّة مع إزاحة ±١ خليّة وفرضيّات قصّ لأبعاد مختلفة
   (المحرّك قد يعيد الصورة بنسبة أقرب مدعومة). webp أو عطب فكّ = { ok:false } والمتّصل يتصرّف كأنّه لا قياس. */
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const GRID = 64;
/* مراجعة: مصدر JPEG صغير الحجم كبير الأبعاد (مسح مستند ٤٨ ميغابكسل) كان يُفكّ في ١٠ث و٢ غ.ب ذاكرة فتُقتل الدالّة بلا ردّ ولا
   ردّ نقاط. ٢٠ ميغابكسل تكفي ناتج 4K (≈١٧)؛ الأكبر = لا قياس، والمتّصل يكمل كما لو لم يُقس. */
const MAX_PIXELS = 20e6;
const BG = 128; /* خلفيّة الشفافيّة (رماديّ متوسّط) في القياس ونسخة الرؤية */
const CELL_T = 18; /* فرق متوسّط القنوات في الخليّة (من ٢٥٥) فوقه = الخليّة تغيّرت فعلًا لا ضجيج إعادة رسم */

function toBuffer(x) {
  if (!x) return null;
  if (Buffer.isBuffer(x)) return x;
  try { return Buffer.from(String(x), 'base64'); } catch (e) { return null; }
}

function decodeImage(x) {
  const buf = toBuffer(x);
  if (!buf || buf.length < 32) return null;
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      if (buf.length >= 24 && buf.readUInt32BE(16) * buf.readUInt32BE(20) > MAX_PIXELS) return null;
      const p = PNG.sync.read(buf);
      return { w: p.width, h: p.height, data: p.data };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_PIXELS / 1e6, maxMemoryUsageInMB: 512 });
      return { w: j.width, h: j.height, data: j.data };
    }
  } catch (e) { return null; } /* guard-ok — صورة لا تُفكّ = لا قياس، والمتّصل يكمل بلا حكم */
  return null;
}

/* متوسّط المساحة لمستطيل (x0,y0,cw,ch) من الصورة إلى شبكة n×n (RGB، ٠–٢٥٥). خطوة أخذ العيّنات تحفظ السرعة على 4K. */
function thumb(img, n, rect) {
  const r = rect || { x: 0, y: 0, w: img.w, h: img.h };
  const out = new Float64Array(n * n * 3);
  const cnt = new Float64Array(n * n);
  const step = Math.max(1, Math.floor(Math.min(r.w, r.h) / (n * 6)));
  const d = img.data;
  for (let y = 0; y < r.h; y += step) {
    const cy = Math.min(n - 1, Math.floor(y * n / r.h));
    const row = (r.y + y) * img.w;
    for (let x = 0; x < r.w; x += step) {
      const cx = Math.min(n - 1, Math.floor(x * n / r.w));
      const i = (row + r.x + x) * 4;
      const c = cy * n + cx;
      /* الشفافيّة تُركّب على رماديّ متوسّط (مراجعة: على الأسود صار حبر أسود على شفّاف «أسود كامل» فبدا شعاران مختلفان
         متطابقين ⇒ ٤٢٢ كاذب). على الرماديّ يظهر الحبر الأسود والأبيض معًا. */
      const a = d[i + 3] === undefined ? 1 : d[i + 3] / 255;
      out[c * 3] += d[i] * a + BG * (1 - a); out[c * 3 + 1] += d[i + 1] * a + BG * (1 - a); out[c * 3 + 2] += d[i + 2] * a + BG * (1 - a);
      cnt[c] += 1;
    }
  }
  for (let c = 0; c < n * n; c++) { const k = cnt[c] || 1; out[c * 3] /= k; out[c * 3 + 1] /= k; out[c * 3 + 2] /= k; }
  return out;
}

/* فرق شبكتين مع إزاحة (dx,dy) بالخلايا: متوسّط الفرق، ونسبة الخلايا المتغيّرة، ونسبة الخلايا المتغيّرة بشدّة */
function gridDiff(a, b, n, dx, dy) {
  let sum = 0, changed = 0, strong = 0, total = 0;
  for (let y = Math.max(0, -dy); y < Math.min(n, n - dy); y++) {
    for (let x = Math.max(0, -dx); x < Math.min(n, n - dx); x++) {
      const i = (y * n + x) * 3, j = ((y + dy) * n + (x + dx)) * 3;
      const v = (Math.abs(a[i] - b[j]) + Math.abs(a[i + 1] - b[j + 1]) + Math.abs(a[i + 2] - b[j + 2])) / 3;
      sum += v; total++;
      if (v > CELL_T) changed++;
      if (v > CELL_T * 2.5) strong++;
    }
  }
  return { mean: total ? sum / total : 0, changedFrac: total ? changed / total : 0, strongFrac: total ? strong / total : 0 };
}

/* مستطيل بنسبة `aspect` في وسط الصورة (قصّ لا تمديد) */
function centerRect(img, aspect) {
  const ar = img.w / img.h;
  if (Math.abs(ar - aspect) / aspect < 0.01) return { x: 0, y: 0, w: img.w, h: img.h };
  if (ar > aspect) { const w = Math.max(1, Math.round(img.h * aspect)); return { x: Math.floor((img.w - w) / 2), y: 0, w, h: img.h }; }
  const h = Math.max(1, Math.round(img.w / aspect));
  return { x: 0, y: Math.floor((img.h - h) / 2), w: img.w, h };
}

/* المقارنة: أقلّ فرق عبر فرضيّات (تمديد كامل · قصّ الناتج لنسبة المصدر · قصّ المصدر لنسبة الناتج) وإزاحات ±١.
   الأقلّ = الأقرب للمصدر = الحكم المحافظ على «تغيّر فعلًا» (لا نتّهم ناتجًا بالثبات بسبب قصّ أو إزاحة).
   يقبل base64 أو Buffer أو صورة مفكوكة ({w,h,data}) كي لا يُفكّ المصدر مرّتين حين يُقارن بمرشّحين. */
function asDecoded(x) { return (x && x.data && x.w && x.h) ? x : decodeImage(x); }
function compareImages(sourceB64, resultB64, opts) {
  const n = (opts && opts.grid) || GRID;
  const A = asDecoded(sourceB64);
  const B = asDecoded(resultB64);
  if (!A || !B) return { ok: false, reason: !A ? 'source_undecodable' : 'result_undecodable' };
  const arA = A.w / A.h, arB = B.w / B.h;
  const hyps = [[null, null]];
  if (Math.abs(arA - arB) / arA > 0.01) { hyps.push([null, centerRect(B, arA)]); hyps.push([centerRect(A, arB), null]); }
  let best = null;
  for (const [ra, rb] of hyps) {
    const ta = thumb(A, n, ra), tb = thumb(B, n, rb);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const g = gridDiff(ta, tb, n, dx, dy);
      if (!best || g.mean < best.mean) best = g;
    }
  }
  return {
    ok: true,
    meanDiff: Math.round(best.mean * 10) / 10,
    changedFrac: Math.round(best.changedFrac * 1000) / 1000,
    strongFrac: Math.round(best.strongFrac * 1000) / 1000,
    aspectChanged: Math.abs(arA - arB) / arA > 0.04,
    source: { w: A.w, h: A.h }, result: { w: B.w, h: B.h },
  };
}

/* الحكم: «لم يتغيّر شيء يُذكر». المعايرة (tests/image-honest.test.cjs على لقطة المالك نفسها):
   تبديل الأشخاص الحقيقيّ ٤٠٪ خلايا متغيّرة و٢٣٪ بشدّة؛ بطاقة واحدة من ثمانٍ ٤٫٦٪؛ إعادة رسم الصورة نفسها
   بدقّة 2K وإزاحة وغاما وضجيج ١٫٨٪ و٠ بشدّة؛ كلمة واحدة سُوّدت ٠٫١٪.
   - expectBig (تبديل أشخاص/تعديل واسع/أسلوب/فكرة جديدة/ترقية): أقلّ من ٣٪ وأقلّ من ٠٫٤٪ بشدّة = لم يُنفَّذ.
   - غير ذلك: البكسل لا يفرّق حرفًا مبدّلًا عن ضجيج إعادة الرسم، فلا يُحكم بالفشل إلّا على تطابق حرفيّ. */
function looksUnchanged(cmp, expectBig) {
  if (!cmp || !cmp.ok) return false;
  if (expectBig) return cmp.changedFrac < 0.03 && cmp.strongFrac < 0.004;
  return cmp.changedFrac === 0 && cmp.strongFrac === 0 && cmp.meanDiff < 1;
}

/* نسخة لنموذج الرؤية: أطول ضلع ≤ maxSide، JPEG ٨٨ — مصدر + مرشّحان بدقّة 2K/4K PNG قد يتجاوزون حدّ الطلب (٢٠ م.ب)،
   والنسخة الأصغر أسرع قراءةً ولا تضيّع حرفًا عربيًّا بحجم عنوان بطاقة. صورة لا تُفكّ = null والمتّصل يرسل الأصل. */
function visionCopy(x, maxSide) {
  const img = asDecoded(x);
  if (!img) return null;
  const m = maxSide || 1280;
  const k = Math.min(1, m / Math.max(img.w, img.h));
  const W = Math.max(1, Math.round(img.w * k)), H = Math.max(1, Math.round(img.h * k));
  const out = new Uint8Array(W * H * 4);
  const sx = img.w / W, sy = img.h / H, d = img.data;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x2 = 0; x2 < W; x2++) {
      const x0 = Math.floor(x2 * sx), x1 = Math.max(x0 + 1, Math.floor((x2 + 1) * sx));
      let r = 0, g = 0, b = 0, c = 0;
      const stepY = Math.max(1, Math.floor((y1 - y0) / 3)), stepX = Math.max(1, Math.floor((x1 - x0) / 3));
      for (let yy = y0; yy < y1; yy += stepY) for (let xx = x0; xx < x1; xx += stepX) {
        const i = (yy * img.w + xx) * 4; const a = d[i + 3] === undefined ? 1 : d[i + 3] / 255;
        r += d[i] * a + BG * (1 - a); g += d[i + 1] * a + BG * (1 - a); b += d[i + 2] * a + BG * (1 - a); c++;
      }
      const o = (y * W + x2) * 4; out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c; out[o + 3] = 255;
    }
  }
  try { return { b64: Buffer.from(jpeg.encode({ width: W, height: H, data: out }, 88).data).toString('base64'), mime: 'image/jpeg', w: W, h: H }; }
  catch (e) { return null; } /* guard-ok — الترميز اختياريّ؛ المتّصل يرسل الأصل */
}

/* القياس بكلمات بسيطة لنموذج التقرير — دليل موضوعيّ يمنعه من ادّعاء تغيير لم يحدث */
function describeChange(cmp) {
  if (!cmp || !cmp.ok) return '';
  const pct = Math.round(cmp.changedFrac * 1000) / 10;
  const strong = Math.round(cmp.strongFrac * 1000) / 10;
  return 'Objective pixel measurement between the source and this result: ' + pct + '% of the image area changed visibly (' + strong + '% strongly). Near 0% means the two pictures are practically identical, whatever the request asked.';
}

module.exports = { decodeImage, compareImages, looksUnchanged, describeChange, visionCopy, GRID, CELL_T };
