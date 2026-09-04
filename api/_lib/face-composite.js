'use strict';
/* v-face-composite (شكوى المالك «بعده يغيّر ملامح الوجه»): القناع يوجّه الموديل لكنه لا يضمن
   البكسل، لأن الموديل يعيد رسم الصورة كلها. الضمان الوحيد: بعد أي تعديل نُعيد لصق بكسلات
   الوجه/الرأس من الصورة الأصلية فوق الناتج بحافة ناعمة. فكّ وترميز بمكتبتين جافاسكربت خالصتين
   (jpeg-js وpngjs) — بلا ثنائيات. لا يرمي أبدًا: null = نعرض الناتج كما هو. */
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

function decode(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 60, formatAsRGBA: true });
    return { w: j.width, h: j.height, data: j.data };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const p = PNG.sync.read(buf);
    return { w: p.width, h: p.height, data: p.data };
  }
  return null;
}

function encodeJpeg(img, quality) {
  return jpeg.encode({ width: img.w, height: img.h, data: img.data }, quality || 92).data;
}

/* إعادة تحجيم ثنائية الخطية (RGBA) */
function resample(img, W, H) {
  if (img.w === W && img.h === H) return img;
  const out = Buffer.alloc(W * H * 4);
  const sx = img.w / W, sy = img.h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(img.h - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(img.h - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(img.w - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(img.w - 1, x0 + 1), wx = fx - x0;
      const p00 = (y0 * img.w + x0) * 4, p01 = (y0 * img.w + x1) * 4, p10 = (y1 * img.w + x0) * 4, p11 = (y1 * img.w + x1) * 4;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = img.data[p00 + c] * (1 - wx) + img.data[p01 + c] * wx;
        const bot = img.data[p10 + c] * (1 - wx) + img.data[p11 + c] * wx;
        out[o + c] = Math.round(top * (1 - wy) + bot * wy);
      }
    }
  }
  return { w: W, h: H, data: out };
}

/* وزن الأصل عند البكسل (1 = من الأصل تمامًا، 0 = من الناتج). المناطق:
   { kind:'rect', x0,y0,x1,y1 } مستطيل بحافة ناعمة خارجه، أو { kind:'above', y } كل ما فوق الخط
   بحافة ناعمة تحته. الإحداثيات نسبية 0..1 من أبعاد الأصل. */
function weightAt(zones, x, y, W, H, feather) {
  let a = 0;
  for (const z of zones) {
    let v = 0;
    if (z.kind === 'above') {
      const yy = z.y * H;
      v = y <= yy ? 1 : Math.max(0, 1 - (y - yy) / feather);
    } else {
      const x0 = z.x0 * W, x1 = z.x1 * W, y0 = z.y0 * H, y1 = z.y1 * H;
      const dx = x < x0 ? x0 - x : (x > x1 ? x - x1 : 0);
      const dy = y < y0 ? y0 - y : (y > y1 ? y - y1 : 0);
      const d = Math.sqrt(dx * dx + dy * dy);
      v = d <= 0 ? 1 : Math.max(0, 1 - d / feather);
    }
    if (v > a) a = v;
  }
  return a;
}

/* الواجهة: يرجع { b64, mime:'image/jpeg', w, h } أو null */
function compositeProtected(opts) {
  try {
    const orig = decode(Buffer.from(opts.origBase64, 'base64'));
    const res = decode(Buffer.from(opts.resultBase64, 'base64'));
    if (!orig || !res || !orig.w || !res.w) return null;
    /* اختلاف النسبة > 3% = الموديل غيّر التأطير؛ اللصق سيكون في غير مكانه */
    const ar = (orig.w / orig.h) / (res.w / res.h);
    if (ar < 0.97 || ar > 1.03) { console.warn('[face-composite] aspect mismatch ' + orig.w + 'x' + orig.h + ' vs ' + res.w + 'x' + res.h); return null; }
    /* نعمل في أبعاد الناتج (يبقى حادًّا)، والأصل يُحجَّم إليه */
    const W = res.w, H = res.h;
    const src = resample(orig, W, H);
    const feather = Math.max(6, Math.round(Math.min(W, H) * (opts.featherFrac || 0.03)));
    const zones = Array.isArray(opts.zones) ? opts.zones : [];
    if (!zones.length) return null;
    const out = Buffer.from(res.data);
    let touched = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = weightAt(zones, x, y, W, H, feather);
        if (a <= 0) continue;
        touched++;
        const o = (y * W + x) * 4;
        if (a >= 1) { out[o] = src.data[o]; out[o + 1] = src.data[o + 1]; out[o + 2] = src.data[o + 2]; continue; }
        out[o] = Math.round(src.data[o] * a + res.data[o] * (1 - a));
        out[o + 1] = Math.round(src.data[o + 1] * a + res.data[o + 1] * (1 - a));
        out[o + 2] = Math.round(src.data[o + 2] * a + res.data[o + 2] * (1 - a));
      }
    }
    if (!touched) return null;
    const jpg = encodeJpeg({ w: W, h: H, data: out }, 92);
    return { b64: Buffer.from(jpg).toString('base64'), mime: 'image/jpeg', w: W, h: H };
  } catch (e) {
    console.warn('[face-composite] ' + (e && e.message));
    return null;
  }
}

module.exports = { compositeProtected, decode, resample, encodeJpeg };
