'use strict';
/* v-img-cards (المالك ٢٤ سبتمبر، خمس لقطات من «أنماط الصور»: «مافي دمج بين الاثنين ولا شي جديد — الناتج صفر»):
   طلب «غيّر وجوه كلّ الأشخاص بدون تكرار» على لوحة بطاقات (٨ صور في صورة واحدة) فوق طاقة نموذج الصور في ضربة واحدة:
   يغيّر بعضها ويُبقي الباقي (partial في المحرّكين)، ويكرّر الوجه نفسه في بطاقتين، و«صور ثانية» أفقدت بطاقة «الحجّ والعمرة»
   موضوعها. و«الدمج» كان تسلسلًا يختار صورة أحد المحرّكين كاملة — لا دمجًا.
   هنا دمج حقيقيّ: ١) نموذج رؤية يحدّد مربّع صورة كلّ بطاقة وعنوانها ونوع الشخص وموضوعها، والبكسل يضبط الحدود.
   ٢) كلّ صورة تُعدَّل وحدها (شخص واحد = مهمّة سهلة للمحرّك) بشخص جديد مختلف عن كلّ البطاقات الأخرى، بموضوع بطاقتها نفسه.
   ٣) في وضع الدمج يعمل المحرّكان على كلّ بطاقة، والحكم يختار الأفضل بطاقةً بطاقة. ٤) الصور تعود لمكانها والكتابة لا تُمسّ
   (بكسلاتها من المصدر نفسه). الناتج صورة واحدة فيها أفضل ما أخرجه المحرّكان. */
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const { decodeImage, compareImages } = require('./image-diff');

const DETECT_MODEL = 'gemini-flash-latest';
const SUBJECTS = ['man', 'woman', 'boy', 'girl', 'baby', 'couple', 'group'];

/* ---------------- الكشف ---------------- */

function detectPrompt() {
  return 'This picture may be a screen or design made of several CARDS, each card showing a PHOTO (usually of a person) with a title or caption next to it.\n' +
    'Return JSON only: {"cards":[{"box":[ymin,xmin,ymax,xmax],"title":"<the card title exactly as written, any language>","subject":"man|woman|boy|girl|baby|couple|group|none","scene":"<short English description of the photo: setting, occasion, clothing incl. any head covering, pose, props>"}]}.\n' +
    'Rules: "box" is the PHOTO area only (never the text, icons or card border), normalized 0-1000 to the whole picture. Include every card that has a photo, even one partly cut by the picture edge. ' +
    'If the picture is a single photo or not made of separate photo cards, return {"cards":[]}.';
}

/* ردّ النموذج → بطاقات بمربّعات بكسل صالحة (أو [] ) */
function parseCards(txt, w, h) {
  const s = String(txt || '');
  const m = s.match(/\{[\s\S]*\}/);
  let j = null;
  try { j = JSON.parse(m ? m[0] : s); } catch (e) { j = null; } /* guard-ok — ردّ غير JSON = لا بطاقات */
  const raw = j && Array.isArray(j.cards) ? j.cards : [];
  const out = [];
  raw.forEach(function (c) {
    if (!c || !Array.isArray(c.box) || c.box.length !== 4) return;
    const b = c.box.map(Number);
    if (b.some(function (v) { return !Number.isFinite(v); })) return;
    const y0 = Math.max(0, Math.min(1000, Math.min(b[0], b[2]))), y1 = Math.max(0, Math.min(1000, Math.max(b[0], b[2])));
    const x0 = Math.max(0, Math.min(1000, Math.min(b[1], b[3]))), x1 = Math.max(0, Math.min(1000, Math.max(b[1], b[3])));
    const box = { x0: Math.round(x0 * w / 1000), y0: Math.round(y0 * h / 1000), x1: Math.round(x1 * w / 1000), y1: Math.round(y1 * h / 1000) };
    const subject = SUBJECTS.indexOf(String(c.subject || '').toLowerCase()) >= 0 ? String(c.subject).toLowerCase() : 'none';
    out.push({ box: box, title: String(c.title || '').slice(0, 120), subject: subject, scene: String(c.scene || '').slice(0, 300) });
  });
  return validCards(out, w, h);
}

function area(b) { return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0); }
function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  return inter / Math.max(1, area(a) + area(b) - inter);
}
/* لوحة بطاقات = صورتان على الأقلّ، كلّ مربّع معقول الحجم ولا يتراكب مع غيره؛ وإلّا فليست لوحة ويكمل المسار العاديّ */
function validCards(cards, w, h) {
  const minSide = Math.max(24, Math.round(Math.min(w, h) * 0.06));
  const keep = cards.filter(function (c) {
    const bw = c.box.x1 - c.box.x0, bh = c.box.y1 - c.box.y0;
    return bw >= minSide && bh >= minSide && area(c.box) <= w * h * 0.6 && c.subject !== 'none';
  });
  for (let i = 0; i < keep.length; i++) for (let k = i + 1; k < keep.length; k++) if (iou(keep[i].box, keep[k].box) > 0.15) return [];
  return keep.length >= 2 && keep.length <= 16 ? keep : [];
}

async function detectCards(o) {
  const img = o.img;
  try {
    const r = await (o.fetchFn || fetch)('https://generativelanguage.googleapis.com/v1beta/models/' + DETECT_MODEL + ':generateContent?key=' + o.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs || 25000),
      body: JSON.stringify({ contents: [{ parts: [{ text: detectPrompt() }, { inlineData: { mimeType: o.vis.mime, data: o.vis.b64 } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4000, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 512 } } }),
    });
    if (!r.ok) return { cards: [], reason: 'http_' + r.status };
    const d = await r.json().catch(function () { return null; });
    const txt = (((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('');
    return { cards: parseCards(txt, img.w, img.h) };
  } catch (e) { return { cards: [], reason: String(e && e.name || 'error') }; }
}

/* ---------------- ضبط الحدود بالبكسل ---------------- */

function lum(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }
/* قوّة الحافّة بين الصفّ y-1 والصفّ y (أو العمود) على امتداد الضلع — الحدّ بين الصورة وخلفيّة البطاقة حادّ */
function rowEdge(img, y, xa, xb) {
  if (y <= 0 || y >= img.h) return 0;
  let s = 0, n = 0;
  const step = Math.max(1, Math.floor((xb - xa) / 120));
  for (let x = xa; x < xb; x += step) { s += Math.abs(lum(img.data, (y * img.w + x) * 4) - lum(img.data, ((y - 1) * img.w + x) * 4)); n++; }
  return n ? s / n : 0;
}
function colEdge(img, x, ya, yb) {
  if (x <= 0 || x >= img.w) return 0;
  let s = 0, n = 0;
  const step = Math.max(1, Math.floor((yb - ya) / 120));
  for (let y = ya; y < yb; y += step) { s += Math.abs(lum(img.data, (y * img.w + x) * 4) - lum(img.data, (y * img.w + x - 1) * 4)); n++; }
  return n ? s / n : 0;
}
const EDGE_MIN = 14;
/* لون خلفيّة اللوحة: اللون الأكثر تكرارًا بين بكسلات الصورة المسطّحة (بلا نسيج) — الفراغ بين البطاقات وجسمها. لا يعتمد على
   مربّعات النموذج (حلقة حولها تقع داخل الصورة إن صغّرها). */
function backgroundColor(img) {
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.sqrt(img.w * img.h / 60000)));
  const d = img.data;
  for (let y = 1; y < img.h - 1; y += step) {
    for (let x = 1; x < img.w - 1; x += step) {
      const i = (y * img.w + x) * 4;
      const g = Math.abs(lum(d, i) - lum(d, i + 4)) + Math.abs(lum(d, i) - lum(d, i + img.w * 4));
      if (g > 4) continue;
      const k = (d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4);
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      bins.set(k, b);
    }
  }
  let top = null;
  bins.forEach(function (b) { if (!top || b.n > top.n) top = b; });
  return top && top.n >= 20 ? [Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)] : null;
}
/* متوسّط بُعد لون صفّ/عمود (على امتداد الضلع) عن لون الخلفيّة */
function rowBgDist(img, y, xa, xb, bg) {
  if (y < 0 || y >= img.h) return 999;
  let s = 0, n = 0;
  const step = Math.max(1, Math.floor((xb - xa) / 80));
  for (let x = xa; x < xb; x += step) { const i = (y * img.w + x) * 4; s += Math.abs(img.data[i] - bg[0]) + Math.abs(img.data[i + 1] - bg[1]) + Math.abs(img.data[i + 2] - bg[2]); n++; }
  return n ? s / n : 999;
}
function colBgDist(img, x, ya, yb, bg) {
  if (x < 0 || x >= img.w) return 999;
  let s = 0, n = 0;
  const step = Math.max(1, Math.floor((yb - ya) / 80));
  for (let y = ya; y < yb; y += step) { const i = (y * img.w + x) * 4; s += Math.abs(img.data[i] - bg[0]) + Math.abs(img.data[i + 1] - bg[1]) + Math.abs(img.data[i + 2] - bg[2]); n++; }
  return n ? s / n : 999;
}
const BG_NEAR = 40;
/* كلّ ضلع يُزاح لأفضل حافّة في نافذة صغيرة حوله: حافّة قويّة خارجها مباشرةً (٣ صفوف/أعمدة) بلون خلفيّة اللوحة — لا صورة
   البطاقة المجاورة ولا سطر العنوان تحتها. بلا حافّة كهذه = أقرب حافّة قويّة، وإلّا كما قاله النموذج. ضلع قريب من طرف الصورة =
   بطاقة مقصوصة بطرفها فيلتصق به. */
function snapBox(img, box, bg) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const wy = Math.max(4, Math.round(img.h * 0.025)), wx = Math.max(4, Math.round(img.w * 0.025));
  const xa = Math.max(0, box.x0 + Math.round(bw * 0.15)), xb = Math.min(img.w, box.x1 - Math.round(bw * 0.15));
  const ya = Math.max(0, box.y0 + Math.round(bh * 0.15)), yb = Math.min(img.h, box.y1 - Math.round(bh * 0.15));
  /* side: -1 = حدّ البداية (الخارج قبله)، +1 = حدّ النهاية (الخارج بعده، والقيمة حصريّة) */
  const best = function (v0, win, max, edge, dist, side) {
    let good = null, near = null;
    for (let v = Math.max(1, v0 - win); v <= Math.min(max - 1, v0 + win); v++) {
      const e = edge(v);
      if (e < EDGE_MIN) continue;
      if (bg) {
        const out = side < 0 ? [v - 2, v - 3, v - 4] : [v + 1, v + 2, v + 3]; /* بعد صفّ الانتقال (ضباب JPEG) */
        if (out.every(function (o) { return dist(o) <= BG_NEAR; }) && (!good || e > good.e)) good = { v: v, e: e };
      }
      if (!near || Math.abs(v - v0) < Math.abs(near.v - v0)) near = { v: v, e: e };
    }
    return good ? good.v : (near ? near.v : v0);
  };
  const rE = function (y) { return rowEdge(img, y, xa, xb); }, rD = function (y) { return rowBgDist(img, y, xa, xb, bg); };
  const cE = function (x) { return colEdge(img, x, ya, yb); }, cD = function (x) { return colBgDist(img, x, ya, yb, bg); };
  const y0 = box.y0 <= wy ? 0 : best(box.y0, wy, img.h, rE, rD, -1);
  const y1 = box.y1 >= img.h - wy ? img.h : best(box.y1, wy, img.h, rE, rD, 1);
  const x0 = box.x0 <= wx ? 0 : best(box.x0, wx, img.w, cE, cD, -1);
  const x1 = box.x1 >= img.w - wx ? img.w : best(box.x1, wx, img.w, cE, cD, 1);
  if (x1 - x0 < bw * 0.7 || y1 - y0 < bh * 0.7) return Object.assign({}, box); /* ضبط شاذّ = نثق بالنموذج */
  return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

/* لوحة منتظمة: صور الصفّ الواحد تتشارك الأعلى والأسفل، وصور العمود الواحد اليمين واليسار. القيمة التي يتّفق عليها أكثر
   البطاقات (±٢) تصحّح ضلعًا شذّ (صورة بثوب أسود على خلفيّة سوداء بلا حافّة واضحة) — لا الوسيط الذي يغلبه خطآن. */
function consensus(vals) {
  let best = null;
  vals.forEach(function (v) {
    const n = vals.filter(function (w) { return Math.abs(w - v) <= 2; }).length;
    if (!best || n > best.n) best = { v: v, n: n };
  });
  return best;
}
function alignGrid(boxes) {
  const out = boxes.map(function (b) { return Object.assign({}, b); });
  const group = function (key, span) {
    const groups = [];
    out.forEach(function (b) {
      const c = key(b), tol = span(b) * 0.25;
      const g = groups.find(function (gg) { return Math.abs(gg.c - c) <= tol; });
      if (g) g.items.push(b); else groups.push({ c: c, items: [b] });
    });
    return groups.filter(function (g) { return g.items.length >= 2; });
  };
  const fix = function (items, keys, spanOf) {
    keys.forEach(function (k) {
      const c = consensus(items.map(function (b) { return b[k]; }));
      if (!c || c.n < 2 || c.n * 2 < items.length) return; /* لا اتّفاق كافٍ = لا تصحيح */
      const tol = Math.max(3, Math.round(spanOf(items[0]) * 0.12));
      items.forEach(function (b) { if (Math.abs(b[k] - c.v) > 2 && Math.abs(b[k] - c.v) <= tol) b[k] = c.v; });
    });
  };
  group(function (b) { return (b.y0 + b.y1) / 2; }, function (b) { return b.y1 - b.y0; }).forEach(function (g) { fix(g.items, ['y0', 'y1'], function (b) { return b.y1 - b.y0; }); });
  group(function (b) { return (b.x0 + b.x1) / 2; }, function (b) { return b.x1 - b.x0; }).forEach(function (g) { fix(g.items, ['x0', 'x1'], function (b) { return b.x1 - b.x0; }); });
  return out;
}

/* زوايا البطاقة المستديرة: داخل مثلّث كلّ زاوية (خارج ربع الدائرة) يبقى بكسل المصدر إن كان بلون خلفيّة البطاقة التي خارج
   الزاوية — فيتبع الاستدارة الحقيقيّة أيًّا كان نصف قطرها، وزاوية مربّعة (بكسلها صورة لا خلفيّة) تُلصق كاملة. زاوية على طرف
   الصورة (بطاقة مقصوصة) بلا خلفيّة خارجها = بلا حماية. */
function cornerGuard(img, b) {
  const d = img.data;
  const r = Math.max(2, Math.min(28, Math.round(Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.1)));
  const corners = [[b.x0, b.y0, -1, -1], [b.x1 - 1, b.y0, 1, -1], [b.x0, b.y1 - 1, -1, 1], [b.x1 - 1, b.y1 - 1, 1, 1]];
  return { r: r, bg: corners.map(function (c) {
    const ox = c[0] + 2 * c[2], oy = c[1] + 2 * c[3];
    if (ox < 0 || oy < 0 || ox >= img.w || oy >= img.h) return null;
    const i = (oy * img.w + ox) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  }) };
}

/* ---------------- قصّ، تحجيم، تركيب ---------------- */

function cropRGBA(img, b) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((b.y0 + y) * img.w + b.x0) * 4, ((b.y0 + y) * img.w + b.x1) * 4), y * w * 4);
  return { w: w, h: h, data: out };
}
function encodePng(im) { return PNG.sync.write({ width: im.w, height: im.h, data: Buffer.from(im.data.buffer, im.data.byteOffset, im.data.length) }).toString('base64'); }
function encodeJpeg(im, q) { return Buffer.from(jpeg.encode({ width: im.w, height: im.h, data: im.data }, q || 92).data).toString('base64'); }

/* تحجيم بمتوسّط المساحة (للتصغير، وهو الغالب: ناتج 1–2K إلى مربّع البطاقة) وثنائيّ الخطّ للتكبير */
function resizeRGBA(src, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const sx = src.w / dw, sy = src.h / dh, d = src.data;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < dh; y++) {
      const ya = y * sy, yb = ya + sy;
      for (let x = 0; x < dw; x++) {
        const xa = x * sx, xb = xa + sx;
        let r = 0, g = 0, bl = 0, a = 0, wsum = 0;
        for (let yy = Math.floor(ya); yy < Math.ceil(yb) && yy < src.h; yy++) {
          const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
          for (let xx = Math.floor(xa); xx < Math.ceil(xb) && xx < src.w; xx++) {
            const wgt = wy * (Math.min(xb, xx + 1) - Math.max(xa, xx));
            const i = (yy * src.w + xx) * 4;
            r += d[i] * wgt; g += d[i + 1] * wgt; bl += d[i + 2] * wgt; a += d[i + 3] * wgt; wsum += wgt;
          }
        }
        const o = (y * dw + x) * 4;
        out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = bl / wsum; out[o + 3] = a / wsum;
      }
    }
    return { w: dw, h: dh, data: out };
  }
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, Math.min(src.h - 1, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(src.h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, Math.min(src.w - 1, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(src.w - 1, x0 + 1), tx = fx - x0;
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = d[(y0 * src.w + x0) * 4 + c], p01 = d[(y0 * src.w + x1) * 4 + c], p10 = d[(y1 * src.w + x0) * 4 + c], p11 = d[(y1 * src.w + x1) * 4 + c];
        out[o + c] = (p00 * (1 - tx) + p01 * tx) * (1 - ty) + (p10 * (1 - tx) + p11 * tx) * ty;
      }
    }
  }
  return { w: dw, h: dh, data: out };
}
/* الناتج قد يعود بنسبة أبعاد أخرى (GPT: 1024×1536…) — قصّ من الوسط لنسبة المربّع ثمّ تحجيم، بلا مطّ للوجوه */
function fitCover(src, dw, dh) {
  const want = dw / dh, have = src.w / src.h;
  let b = { x0: 0, y0: 0, x1: src.w, y1: src.h };
  if (have > want * 1.01) { const nw = Math.round(src.h * want); const x0 = Math.floor((src.w - nw) / 2); b = { x0: x0, y0: 0, x1: x0 + nw, y1: src.h }; }
  else if (have < want / 1.01) { const nh = Math.round(src.w / want); const y0 = Math.floor((src.h - nh) / 2); b = { x0: 0, y0: y0, x1: src.w, y1: y0 + nh }; }
  const c = (b.x0 || b.y0 || b.x1 !== src.w || b.y1 !== src.h) ? cropRGBA(src, b) : src;
  return resizeRGBA(c, dw, dh);
}

/* نسخة من المصدر تُلصق فيها الصور الجديدة؛ الزوايا المستديرة تبقى من المصدر، وما خارج المربّعات (الكتابة) لا يُمسّ */
function composite(img, placements) {
  const out = { w: img.w, h: img.h, data: Buffer.from(img.data) };
  const src = img.data;
  placements.forEach(function (p) {
    const b = p.box, w = b.x1 - b.x0, h = b.y1 - b.y0, g = p.guard || { r: 0, bg: [] };
    const tile = (p.img.w === w && p.img.h === h) ? p.img : fitCover(p.img, w, h);
    const r = g.r;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const di = ((b.y0 + y) * img.w + b.x0 + x) * 4;
        if (r) {
          const cx = x < r ? r - x : (x >= w - r ? x - (w - r - 1) : 0), cy = y < r ? r - y : (y >= h - r ? y - (h - r - 1) : 0);
          const bg = cx && cy && cx * cx + cy * cy > r * r ? g.bg[(y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1)] : null;
          if (bg && Math.abs(src[di] - bg[0]) + Math.abs(src[di + 1] - bg[1]) + Math.abs(src[di + 2] - bg[2]) <= 40) continue; /* خلفيّة البطاقة في الزاوية المستديرة */
        }
        const si = (y * w + x) * 4;
        const a = tile.data[si + 3] / 255;
        out.data[di] = tile.data[si] * a + out.data[di] * (1 - a);
        out.data[di + 1] = tile.data[si + 1] * a + out.data[di + 1] * (1 - a);
        out.data[di + 2] = tile.data[si + 2] * a + out.data[di + 2] * (1 - a);
      }
    }
  });
  return out;
}

/* ---------------- أشخاص جدد لا يتكرّرون ---------------- */

const PERSONAS = {
  man: ['a Gulf Arab man in his late 20s with a short trimmed black beard and deep brown eyes', 'a Levantine man in his early 30s with light stubble and wavy dark-brown hair', 'a North African man in his mid 20s, clean-shaven, with short curly black hair', 'a South Asian man in his early 30s with a neat full beard and side-parted hair', 'a Turkish man in his late 20s with light-brown hair and green eyes', 'an East African man in his mid 20s with a short fade haircut and a warm smile', 'a Persian man in his mid 30s with thick eyebrows and salt-and-pepper stubble', 'a European man in his late 20s with blond hair and blue eyes'],
  woman: ['a Gulf Arab woman in her late 20s with dark almond eyes and a soft oval face', 'a Levantine woman in her early 30s with hazel eyes and a bright smile', 'a North African woman in her mid 20s with high cheekbones and warm brown skin', 'a South Asian woman in her late 20s with large dark eyes and a gentle smile', 'a Turkish woman in her early 30s with light-brown eyes and a heart-shaped face', 'an East African woman in her mid 20s with deep brown skin and expressive eyes', 'a Persian woman in her early 30s with arched eyebrows and green eyes', 'a European woman in her late 20s with freckles and grey-blue eyes'],
  boy: ['a Gulf Arab boy about 8 years old with short black hair', 'a Levantine boy about 10 with light-brown wavy hair', 'a North African boy about 7 with curly dark hair and a gap-toothed grin', 'a South Asian boy about 9 with a neat side parting', 'a Turkish boy about 11 with freckles and chestnut hair', 'an East African boy about 8 with a short buzz cut'],
  girl: ['a Gulf Arab girl about 8 years old with long straight black hair', 'a Levantine girl about 10 with light-brown curls', 'a North African girl about 7 with dark braided hair', 'a South Asian girl about 9 with a long dark ponytail', 'a Turkish girl about 11 with chestnut hair and freckles', 'an East African girl about 8 with short natural curls'],
  baby: ['a newborn baby with a round face and dark wispy hair', 'a sleeping newborn with rosy cheeks and light fuzz of hair', 'a newborn with a tiny button nose and darker olive skin', 'a newborn with full cheeks and a little dimple'],
  couple: ['a young Gulf Arab couple', 'a Levantine couple in their thirties', 'a North African couple in their late twenties', 'a South Asian couple in their early thirties'],
  group: ['a different family of the same size and ages', 'a different group of the same size and ages, clearly new people', 'new people of the same number and ages'],
};
/* بذرة ثابتة من العناوين: الطلب نفسه يعطي التوزيع نفسه (اختبار)، ولوحة أخرى توزيعًا آخر */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function assignPersonas(cards, seedText) {
  const used = {};
  const seed = hash(String(seedText || '') + cards.map(function (c) { return c.title; }).join('|'));
  return cards.map(function (c) {
    const pool = PERSONAS[c.subject] || PERSONAS.group;
    const k = used[c.subject] || 0; used[c.subject] = k + 1;
    return pool[((seed % pool.length) + k) % pool.length]; /* متتالية من نقطة البذرة = لا تكرار حتّى يفرغ المخزون */
  });
}

/* ---------------- أوامر البطاقة والحكم ---------------- */

function cardPrompt(kind, card, persona) {
  const where = card.title ? ' from a card titled "' + card.title + '"' : '';
  const theme = card.scene ? ' (' + card.scene + ')' : '';
  if (kind === 'renew') {
    return 'Create a brand-new photo' + where + theme + '. Show ' + persona + ' in a fresh composition that clearly fits the SAME theme: keep the theme\'s key elements exactly (place, occasion, outfit type and any head covering) — only the person, pose and scene details are new. ' +
      'It must look clearly different from the attached photo. Photorealistic, natural light, same aspect ratio as the attached photo. No text, letters, logos, borders or frames. Return the photo only.';
  }
  return 'This is one photo' + where + theme + '. Replace the person in it with a completely different, new person: ' + persona + '. ' +
    'Keep everything else as it is: the same setting and theme, framing, pose type, clothing style (including any head covering), props, lighting, colours and photographic style. ' +
    'The new person must clearly be someone else — different face, features and hair — natural and photorealistic, with the same age group. No text, letters, logos, borders or frames. Return the photo only, same aspect ratio.';
}

function judgeParts(kind, card, orig, cands) {
  const letters = ['A', 'B'];
  const parts = [{ text: 'Card: "' + (card.title || '') + '" — ' + (card.scene || '') + '. The task was: ' + (kind === 'renew' ? 'a NEW photo for the same theme, with a new person.' : 'replace the person with a clearly DIFFERENT new person, keeping the scene.') + '\nORIGINAL photo:' },
    { inlineData: { mimeType: orig.mime, data: orig.b64 } }];
  cands.forEach(function (c, i) { parts.push({ text: 'CANDIDATE ' + letters[i] + ':' }); parts.push({ inlineData: { mimeType: c.mime, data: c.b64 } }); });
  parts.push({ text: 'For each candidate answer honestly from what you SEE: "new_person" (true only if it is clearly a different person from the ORIGINAL — not the same face), "theme" (true if it keeps the card theme' + (kind === 'renew' ? '' : ' and scene') + '), "quality" 0-10 (photorealistic, natural face and hands, no artifacts, no text). ' +
    'Then "pick" the better candidate — a new person with the theme kept always beats one without; among equals the higher quality. "none" if no candidate has a new person with the theme kept.\n' +
    'JSON only: {"c":[' + cands.map(function () { return '{"new_person":true|false,"theme":true|false,"quality":0}'; }).join(',') + '],"pick":"' + letters.slice(0, cands.length).join('|') + '|none"}' });
  return parts;
}
function parseJudge(txt, n) {
  const m = String(txt || '').match(/\{[\s\S]*\}/);
  let j = null;
  try { j = JSON.parse(m ? m[0] : String(txt || '')); } catch (e) { j = null; } /* guard-ok — ردّ غير JSON = لا حكم */
  if (!j || !Array.isArray(j.c)) return null;
  const c = [];
  for (let i = 0; i < n; i++) { const x = j.c[i] || {}; c.push({ newPerson: x.new_person === true, theme: x.theme !== false, quality: Math.max(0, Math.min(10, Number(x.quality) || 0)) }); }
  const p = String(j.pick || '').trim().toUpperCase();
  const pick = p === 'A' ? 0 : (p === 'B' && n > 1 ? 1 : -1);
  return { c: c, pick: pick };
}
async function judgeCard(o) {
  try {
    const r = await (o.fetchFn || fetch)('https://generativelanguage.googleapis.com/v1beta/models/' + DETECT_MODEL + ':generateContent?key=' + o.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs || 20000),
      body: JSON.stringify({ contents: [{ parts: judgeParts(o.kind, o.card, o.orig, o.cands) }], generationConfig: { temperature: 0.1, maxOutputTokens: 1500, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 256 } } }),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(function () { return null; });
    const txt = (((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('');
    return parseJudge(txt, o.cands.length);
  } catch (e) { return null; }
}

/* ---------------- هل الطلب لتبديل كلّ الأشخاص أو صور جديدة للبطاقات؟ ---------------- */
const RENEW_RE = /(?:غي[ّ]?ر|بد[ّ]?ل|استبدل|حط|ابي|أبي|ابغى|أبغى)\s*(?:لي\s*)?(?:ال)?صور(?![ةه])|صور\s*(?:ثاني[ةه]|جديد[ةه]|مختلف[ةه]|غير(?:ها)?)|بصور\s*(?:ثاني[ةه]|جديد[ةه]|مختلف[ةه]|غيرها)|\b(?:different|new|other)\s+(?:photos|pictures|images)\b/i;
/* «غيّرهم كلّهم / الباقي / كمّلهم» متابعةً لطلب تبديل = تبديل (لقطة المالك: «غيرهم كلهم» بعد «تمّ تغيير ثلاث شخصيات») */
const ALL_FOLLOW_RE = /^\s*(?:(?:غي[ّ]?ر|بد[ّ]?ل)(?:هم|هن)?\s*)?(?:كل(?:هم|هن)|الباقي|البقي[ةه]|باقي\s*(?:الوجوه|الأشخاص|الناس|البطاقات)|الكل|كمل(?:هم|هن)?)\s*[.!]?\s*$/;
/* f: { personSwap (تبديل للكلّ لا لشخص بعينه), reimagine, history:[{text}] } → 'swap' | 'renew' | '' */
function cardsKind(text, f) {
  const o = f || {};
  const { isPersonSwapRequest } = require('./image-prompt');
  const prevSwap = (o.history || []).some(function (h) { return h && isPersonSwapRequest(String(h.text || '')); });
  if (o.personSwap || (prevSwap && ALL_FOLLOW_RE.test(String(text || '')))) return 'swap';
  return (o.reimagine || RENEW_RE.test(String(text || ''))) ? 'renew' : '';
}

/* ---------------- المسار كاملًا ---------------- */

function withTimeout(p, ms) {
  let t = null;
  return Promise.race([Promise.resolve(p).finally(function () { clearTimeout(t); }), new Promise(function (res) { t = setTimeout(function () { res(null); }, Math.max(0, ms)); })]);
}

/* نسخة رؤية مصغّرة (≤ max) بصيغة JPEG — للكشف والحكم (أسرع وأرخص من الأصل) */
function visCopy(im, max) {
  const k = Math.min(1, (max || 1024) / Math.max(im.w, im.h));
  const s = k < 1 ? resizeRGBA(im, Math.max(1, Math.round(im.w * k)), Math.max(1, Math.round(im.h * k))) : im;
  return { b64: encodeJpeg(s, 85), mime: 'image/jpeg' };
}

/* o: { apiKey, source:{b64,mime}, kind:'swap'|'renew', mix, request, engines:{ pro(prompt,{b64,mime},budget), gpt(prompt,{b64,mime},budget) },
        deadline (ms epoch), fetchFn, detect?(stub), judge?(stub), now?() }
   → { ok:true, b64, mime, engine, cards:[…] } | { ok:false, reason } */
async function runCards(o) {
  const now = o.now || Date.now;
  const img = decodeImage(o.source && o.source.b64);
  if (!img) return { ok: false, reason: 'undecodable' };
  const vis = visCopy(img, 1280);
  const det = o.detect ? await o.detect(img, vis) : await detectCards({ apiKey: o.apiKey, img: img, vis: vis, fetchFn: o.fetchFn });
  const cards0 = (det && det.cards) || [];
  if (cards0.length < 2) return { ok: false, reason: 'not_cards' + (det && det.reason ? ':' + det.reason : '') };
  const bg = backgroundColor(img);
  const boxes = alignGrid(cards0.map(function (c) { return snapBox(img, c.box, bg); }));
  const personas = assignPersonas(cards0, o.request);
  const cards = cards0.map(function (c, i) { return Object.assign({}, c, { box: boxes[i], persona: personas[i] }); });
  const left = function () { return o.deadline - now(); };
  const judge = o.judge || function (args) { return judgeCard(Object.assign({ apiKey: o.apiKey, fetchFn: o.fetchFn }, args)); };

  const results = await Promise.all(cards.map(async function (c) {
    const tile = cropRGBA(img, c.box);
    const crop = { b64: encodePng(tile), mime: 'image/png' };
    const prompt = cardPrompt(o.kind, c, c.persona);
    const reserve = o.reserveMs == null ? 30000 : o.reserveMs, minCall = o.minCallMs == null ? 15000 : o.minCallMs, grace = o.graceMs == null ? 3000 : o.graceMs;
    const budget = function () { return Math.max(0, left() - reserve); }; /* يبقى بعده وقت للحكم والتركيب */
    const tried = [];
    const call = async function (name) {
      const fn = o.engines[name];
      if (!fn || budget() < minCall) return null;
      tried.push(name);
      try {
        const b = budget();
        const r = await withTimeout(fn(prompt, crop, b), b + grace); /* المحرّك لا يتجاوز موعد اللوحة مهما أعاد المحاولة */
        const dec = r && r.b64 ? decodeImage(r.b64) : null;
        if (!dec) return null;
        const small = fitCover(dec, tile.w, tile.h); /* بمقاس البطاقة فورًا: الأصل 2K لا يبقى في الذاكرة */
        const cmp = compareImages(tile, small);
        return { engine: name, img: small, changed: !!(cmp && cmp.ok && cmp.changedFrac >= 0.08) };
      } catch (e) { return null; } /* guard-ok — فشل محرّك على بطاقة = المحرّك الآخر أو تبقى كما هي */
    };
    /* الحكم: شخص جديد بموضوع البطاقة؛ بلا حكم (عطب/مهلة) = أوّل متغيّر بالبكسل */
    const choose = async function (cands) {
      cands = cands.filter(function (x) { return x && x.changed; });
      if (!cands.length) return null;
      if (left() < 20000) return cands[0];
      const v = await judge({ kind: o.kind, card: c, orig: visCopy(tile, 512), cands: cands.map(function (x) { return visCopy(x.img, 512); }), timeoutMs: Math.min(20000, left() - 10000) });
      if (!v) return cands[0];
      const ok = cands.map(function (x, i) { return !!(v.c[i] && v.c[i].newPerson && v.c[i].theme); });
      if (v.pick >= 0 && ok[v.pick]) return cands[v.pick];
      return ok.indexOf(true) >= 0 ? cands[ok.indexOf(true)] : null; /* لا شخص جديد بموضوعه = لا يُعدّ تنفيذًا */
    };
    /* الدمج: المحرّكان معًا على كلّ بطاقة ويُختار الأفضل. العاديّ: برو، وإن رفضه القياس أو الحكم فـGPT لهذه البطاقة وحدها. */
    let pick = await choose(o.mix ? await Promise.all([call('pro'), call('gpt')]) : [await call('pro')]);
    if (!pick && !o.mix) pick = await choose([await call('gpt')]);
    return { card: c, pick: pick, tried: tried.join('+') || 'none' };
  }));

  const done = results.filter(function (r) { return r.pick; });
  if (!done.length) return { ok: false, reason: 'no_card_changed' };
  const out = composite(img, done.map(function (r) { return { box: r.card.box, img: r.pick.img, guard: cornerGuard(img, r.card.box) }; }));
  const count = { pro: 0, gpt: 0 };
  done.forEach(function (r) { count[r.pick.engine] = (count[r.pick.engine] || 0) + 1; });
  return {
    ok: true, b64: encodeJpeg(out, 92), mime: 'image/jpeg',
    engine: 'cards[' + done.length + '/' + cards.length + ' pro:' + count.pro + ',gpt:' + count.gpt + ']',
    cards: results.map(function (r) { return { title: r.card.title, subject: r.card.subject, box: r.card.box, engine: r.pick ? r.pick.engine : 'kept', tried: r.tried }; }),
  };
}

module.exports = { runCards, cardsKind, detectPrompt, parseCards, validCards, snapBox, backgroundColor, alignGrid, cornerGuard, consensus, cropRGBA, resizeRGBA, fitCover, composite, assignPersonas, cardPrompt, judgeParts, parseJudge, visCopy, encodeJpeg, encodePng, PERSONAS };
