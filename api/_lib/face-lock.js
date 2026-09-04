'use strict';
/* v-face-lock (شكوى المالك المتكررة «الستايل يغيّر شكل الشخص»): القفل بالنص وحده لا يكفي.
   هنا قفل بالبكسل: نكشف صندوق الوجه/الرأس (Gemini)، نبني قناع PNG يحمي هذه المنطقة
   (معتم = محفوظ، شفاف = قابل للتعديل)، ونطلب التعديل من gpt-image-1 بالقناع —
   فالوجه يُنسخ كما هو ولا يُعاد رسمه. لا يرمي أبدًا: يرجع null فيسقط المسار للمحرّك القديم. */
const zlib = require('zlib');

/* ───── أبعاد الصورة من الترويسة (PNG/JPEG/WebP) ───── */
function imageSize(buf) {
  try {
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' };
    }
    if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const m = buf[i + 1];
        if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), type: 'jpeg' };
        }
        i += 2 + len;
      }
      return null;
    }
    if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), type: 'webp' };
      if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3FFF), h: 1 + ((b >> 14) & 0x3FFF), type: 'webp' }; }
      if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3FFF, h: buf.readUInt16LE(28) & 0x3FFF, type: 'webp' };
    }
  } catch (e) { /* guard-ok */ }
  return null;
}

/* ───── اتجاه EXIF في JPEG (1 = طبيعي). أي دوران = لا قناع (الإحداثيات لن تطابق) ───── */
function jpegOrientation(buf) {
  try {
    if (!(buf[0] === 0xFF && buf[1] === 0xD8)) return 1;
    let i = 2;
    while (i + 4 < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (m === 0xE1 && buf.toString('ascii', i + 4, i + 10) === 'Exif\0\0') {
        const t = i + 10;
        const le = buf.toString('ascii', t, t + 2) === 'II';
        const rd16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const rd32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const ifd = t + rd32(t + 4);
        const n = rd16(ifd);
        for (let k = 0; k < n; k++) {
          const e = ifd + 2 + k * 12;
          if (e + 12 > buf.length) break;
          if (rd16(e) === 0x0112) return rd16(e + 8) || 1;
        }
        return 1;
      }
      if (m === 0xDA) break;
      i += 2 + len;
    }
  } catch (e) { /* guard-ok */ }
  return 1;
}

/* ───── مُرمِّز PNG صغير (RGBA) — بلا مكتبات ───── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
/* rects: مستطيلات بالبكسل تُحفظ (معتمة)؛ الباقي شفاف = قابل للتعديل */
function maskPng(w, h, rects) {
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(stride * h, 0);
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(w, Math.ceil(r.x1));
    const y0 = Math.max(0, Math.floor(r.y0)), y1 = Math.min(h, Math.ceil(r.y1));
    for (let y = y0; y < y1; y++) {
      const row = y * stride + 1;
      for (let x = x0; x < x1; x++) { const p = row + x * 4; raw[p] = 255; raw[p + 1] = 255; raw[p + 2] = 255; raw[p + 3] = 255; }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ───── ما الذي يُحمى لكل ميزة: face = الوجه فقط (الشعر/الغطاء قابل للتغيير)،
   head = الرأس كله بالشعر والغطاء، none = الميزة تمسّ الوجه نفسه ───── */
const PROTECT = {
  hair: 'face', menhair: 'face', hijab: 'face', gulfmen: 'face', iconic: 'face', accessories: 'face', wedding: 'face',
  idphoto: 'head', background: 'head',
  /* body: القابل للتعديل هو ما تحت الرأس فقط (الملابس/الجسم/اليدان) — الرأس والخلفية فوقه محفوظان بالبكسل */
  nails: 'body', tattoo: 'body', heritage: 'body', henna: 'body', body: 'body', palette: 'body', seasons: 'body',
};
const RANK = { none: 0, face: 1, head: 2, body: 3 };
function protectLevel(feature, comboItems) {
  if (feature === 'combo') {
    const items = Array.isArray(comboItems) ? comboItems : [];
    if (!items.length) return 'none';
    let lvl = 'head';
    for (const it of items) {
      const l = PROTECT[(it && it.feature) || ''] || 'none';
      if (RANK[l] < RANK[lvl]) lvl = l;
    }
    return lvl;
  }
  return PROTECT[feature] || 'none';
}

/* ───── كشف صندوق الوجه والرأس (إحداثيات 0..1000: [ymin,xmin,ymax,xmax]) ───── */
async function detectBoxes(apiKey, b64, mime) {
  if (!apiKey) return null;
  try {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: mime || 'image/jpeg', data: b64 } },
          { text: 'Locate the main person. Return JSON only: {"face":[ymin,xmin,ymax,xmax],"head":[ymin,xmin,ymax,xmax]} with integers normalized to 0-1000 of the image height/width. face = from the top of the forehead/eyebrows to the bottom of the chin, ear to ear (skin of the face only). head = the whole head including all hair, any headwear (ghutra, hijab, cap, crown) and the beard, down to the base of the neck. If no person, return {"face":null,"head":null}.' },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const txt = ((((d.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
    const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
    const j = JSON.parse(txt.slice(s, e + 1));
    const ok = (b) => Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(n)) && b[2] > b[0] && b[3] > b[1];
    return { face: ok(j.face) ? j.face : null, head: ok(j.head) ? j.head : null };
  } catch (e) { return null; }
}

function boxToRect(box, w, h, pad) {
  const [ymin, xmin, ymax, xmax] = box;
  const bw = (xmax - xmin) / 1000 * w, bh = (ymax - ymin) / 1000 * h;
  return { x0: xmin / 1000 * w - bw * pad, x1: xmax / 1000 * w + bw * pad, y0: ymin / 1000 * h - bh * pad, y1: ymax / 1000 * h + bh * pad };
}

/* ───── التعديل بالقناع عبر gpt-image-1 ───── */
async function openaiMaskedEdit(openaiKey, promptText, imgBuf, mime, maskBuf) {
  const attempt = async (withFidelity) => {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', String(promptText).slice(0, 3900));
    form.append('size', 'auto');
    form.append('quality', 'high');
    if (withFidelity) form.append('input_fidelity', 'high');
    form.append('image', new Blob([imgBuf], { type: mime || 'image/jpeg' }), 'photo.jpg');
    form.append('mask', new Blob([maskBuf], { type: 'image/png' }), 'mask.png');
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: 'Bearer ' + openaiKey }, body: form, signal: AbortSignal.timeout(240000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String((d.error && d.error.message) || '');
      console.warn('[face-lock] openai HTTP ' + r.status + ' ' + msg.slice(0, 140));
      if (withFidelity && r.status === 400 && /fidelity|mask/i.test(msg)) return attempt(false);
      return null;
    }
    return (d && d.data && d.data[0] && d.data[0].b64_json) || null;
  };
  try { return await attempt(true); } catch (e) { console.warn('[face-lock] ' + (e && e.message)); return null; }
}

/* ───── التحضير: أبعاد + صناديق + مناطق الحماية (نسبية 0..1) — يُحسب مرة لكل تعديل ───── */
async function prepare(opts) {
  const { geminiKey, imageBase64, mimeType, level } = opts || {};
  if (!imageBase64 || !level || level === 'none') return null;
  let buf;
  try { buf = Buffer.from(imageBase64, 'base64'); } catch (e) { return null; }
  if (buf.length > 45 * 1024 * 1024) return null;
  const size = imageSize(buf);
  if (!size || !size.w || !size.h) return null;
  if (size.type === 'jpeg' && jpegOrientation(buf) !== 1) { console.warn('[face-lock] rotated EXIF — no lock'); return null; }
  const boxes = await detectBoxes(geminiKey, imageBase64, mimeType);
  const box = boxes && (level === 'face' ? (boxes.face || null) : (boxes.head || boxes.face));
  if (!box) return null;
  const rects = [];
  const zones = [];
  let lockNote;
  if (level === 'body') {
    const headRect = boxToRect(box, size.w, size.h, 0.06);
    const neckY = Math.min(size.h, headRect.y1 - (headRect.y1 - headRect.y0) * 0.06);
    rects.push({ x0: 0, y0: 0, x1: size.w, y1: neckY });
    zones.push({ kind: 'above', y: neckY / size.h });
    lockNote = '\nPIXEL LOCK: everything above the neck line (the person\'s face, hair, headwear and the upper background) is locked and must remain exactly as in the photo. Edit only the unmasked area below it: the body and clothing. Match the lighting, skin tone, proportions and the neck line seamlessly.';
  } else {
    const r = boxToRect(box, size.w, size.h, level === 'head' ? 0.08 : 0.06);
    rects.push(r);
    zones.push({ kind: 'rect', x0: r.x0 / size.w, y0: r.y0 / size.h, x1: r.x1 / size.w, y1: r.y1 / size.h });
    lockNote = '\nPIXEL LOCK: the masked area (the person\'s ' + (level === 'head' ? 'head, hair and headwear' : 'face') + ') is locked and must remain exactly as in the photo; blend the edit seamlessly around it with matching lighting, skin tone and proportions.';
  }
  return { buf, size, box, rects, zones, level, lockNote, mimeType: mimeType || 'image/jpeg' };
}

/* ───── التعديل بالقناع (يحتاج prepare) — يرجع base64 أو null ───── */
async function maskedEdit(prep, openaiKey, promptText) {
  if (!prep || !openaiKey) return null;
  const mask = maskPng(prep.size.w, prep.size.h, prep.rects);
  return openaiMaskedEdit(openaiKey, promptText + prep.lockNote, prep.buf, prep.mimeType, mask);
}

/* ───── الضمان النهائي: لصق بكسلات المنطقة المحمية من الأصل فوق الناتج ───── */
function restoreProtected(prep, origBase64, resultBase64) {
  if (!prep) return null;
  try {
    return require('./face-composite.js').compositeProtected({ origBase64, resultBase64, zones: prep.zones });
  } catch (e) { return null; }
}

/* ───── المسار القديم بخطوة واحدة (يبقى للتوافق) ───── */
async function lockedEdit(opts) {
  const prep = await prepare(opts);
  if (!prep) return null;
  const b64 = await maskedEdit(prep, opts.openaiKey, opts.promptText);
  return b64 ? { b64, level: prep.level, box: prep.box } : null;
}

module.exports = { imageSize, jpegOrientation, maskPng, protectLevel, detectBoxes, boxToRect, prepare, maskedEdit, restoreProtected, lockedEdit, PROTECT };
