// api/_lib/upscale.js — v-img-upscale (قرار المالك ٢٠ سبتمبر: «نانو وGPT مش بذيك الدقّة — شو الحلّ؟»):
// مكبّر دقّة متخصّص (Real-ESRGAN عبر Replicate) لا يغيّر المحتوى — يضاعف الأبعاد ×٢ أو ×٤ ويحدّ الحواف.
// (١) تلقائيًّا في مخرج maha-image لكلّ ناتج دون 2K (نانو ٢٫٥ ≈ ١٠٢٤، gpt-image ≤ ١٥٣٦).
// (٢) إجراء `media?action=upscale` لزرّ «دقّة أعلى» فوق الصورة (٥ نقاط لغير المالك).
// بلا REPLICATE_API_TOKEN أو عند أيّ عطب/مهلة تُعاد الصورة كما هي — الترقية تحسين لا بوّابة.
'use strict';

const HOST = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'nightmareai/real-esrgan';
const TARGET_MIN = 2048;        // ناتج ≥ 2K على الضلع الأطول لا يُرقّى
const DATA_URI_MAX = 200000;    // فوقها نرفع الملفّ أوّلًا (Replicate يوصي بذلك للمدخلات الكبيرة)
const B64_MAX = 12 * 1024 * 1024;

/** أبعاد الصورة من ترويستها (PNG · JPEG · WebP · GIF) بلا أيّ اعتماديّة. */
function imageDims(buf) {
  try {
    if (!buf || buf.length < 24) return null;
    // PNG: بصمة ثمانية بايتات ثمّ IHDR (العرض والارتفاع عند 16..24)
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    // WebP: RIFF....WEBP ثمّ VP8 / VP8L / VP8X
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
      const chunk = buf.slice(12, 16).toString('ascii');
      if (chunk === 'VP8X' && buf.length >= 30) return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8L' && buf.length >= 25) { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
      if (chunk === 'VP8 ' && buf.length >= 30) return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    // JPEG: نمشي على المقاطع حتّى SOF0..SOF15 (عدا DHT/JPG/DAC)
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch (e) { /* ترويسة تالفة = مجهول */ }
  return null;
}

/** ٠ = لا ترقية (≥ 2K)؛ ٤ للصغيرة (≤ ٨٠٠)؛ ٢ لما بينهما. */
function pickScale(w, h) {
  const m = Math.max(Number(w) || 0, Number(h) || 0);
  if (!m || m >= TARGET_MIN) return 0;
  return m <= 800 ? 4 : 2;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ترقية صورة base64. تُرجع { ok:true, b64, mime, w, h, scale, ms } أو { ok:false, reason }.
 * o: { env, fetchImpl, maxMs, scale (اختياريّ يفرض المعامل), model }
 */
async function upscaleImage(b64, mime, o) {
  const opt = o || {};
  const env = opt.env || process.env;
  const fetchImpl = opt.fetchImpl || fetch;
  const token = String(env.REPLICATE_API_TOKEN || '').trim();
  const t0 = Date.now();
  if (!token) return { ok: false, reason: 'no_token' };
  if (String(env.IMAGE_UPSCALE || '').toLowerCase() === 'off') return { ok: false, reason: 'disabled' };
  if (typeof b64 !== 'string' || b64.length < 100 || b64.length > B64_MAX) return { ok: false, reason: 'bad_input' };
  const maxMs = Math.max(10000, Number(opt.maxMs || env.UPSCALE_MAX_MS) || 60000);
  const deadline = t0 + maxMs;
  const left = () => Math.max(1000, deadline - Date.now());
  const buf = Buffer.from(b64, 'base64');
  const dims = imageDims(buf) || { w: 0, h: 0 };
  const scale = Number(opt.scale) || pickScale(dims.w, dims.h);
  if (!scale) return { ok: false, reason: 'already_sharp', w: dims.w, h: dims.h };
  const model = String(opt.model || env.UPSCALE_MODEL || DEFAULT_MODEL).trim();
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  try {
    // المدخل: data URI للصغيرة، ورفع ملفّ للكبيرة
    let image = 'data:' + (mime || 'image/png') + ';base64,' + b64;
    if (b64.length > DATA_URI_MAX) {
      const form = new FormData();
      form.append('content', new Blob([buf], { type: mime || 'image/png' }), 'image.' + ((mime || '').includes('jpeg') ? 'jpg' : 'png'));
      const up = await fetchImpl(HOST + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form, signal: AbortSignal.timeout(left()) });
      const uj = await up.json().catch(() => ({}));
      const url = uj && uj.urls && uj.urls.get;
      if (!up.ok || !url) return { ok: false, reason: 'upload_failed', status: up.status };
      image = url;
    }
    // التنبّؤ بانتظار مزامن (Prefer: wait) ثمّ استطلاع إن بقي قيد المعالجة
    let r = await fetchImpl(HOST + '/models/' + model + '/predictions', {
      method: 'POST', headers: Object.assign({ Prefer: 'wait=60' }, headers),
      body: JSON.stringify({ input: { image, scale, face_enhance: false } }),
      signal: AbortSignal.timeout(left()),
    });
    let p = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 201) return { ok: false, reason: 'predict_failed', status: r.status, detail: String((p && (p.detail || p.error)) || '').slice(0, 160) };
    while (p && (p.status === 'starting' || p.status === 'processing') && p.urls && p.urls.get && Date.now() < deadline) {
      await sleep(1500);
      const pr = await fetchImpl(p.urls.get, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(left()) });
      p = await pr.json().catch(() => p);
    }
    if (!p || p.status !== 'succeeded') return { ok: false, reason: p && p.status === 'failed' ? 'predict_error' : 'timeout', detail: String((p && p.error) || '').slice(0, 160) };
    const out = Array.isArray(p.output) ? p.output[0] : p.output;
    if (typeof out !== 'string' || !/^https?:\/\//.test(out)) return { ok: false, reason: 'no_output' };
    const fr = await fetchImpl(out, { signal: AbortSignal.timeout(left()) });
    if (!fr.ok) return { ok: false, reason: 'output_fetch_failed', status: fr.status };
    const ob = Buffer.from(await fr.arrayBuffer());
    if (!ob.length) return { ok: false, reason: 'empty_output' };
    const od = imageDims(ob) || { w: dims.w * scale, h: dims.h * scale };
    const omime = String(fr.headers.get('content-type') || '').split(';')[0].trim() || 'image/png';
    return { ok: true, b64: ob.toString('base64'), mime: /^image\//.test(omime) ? omime : 'image/png', w: od.w, h: od.h, scale, ms: Date.now() - t0, from: dims };
  } catch (e) {
    return { ok: false, reason: /abort|timeout/i.test(String(e && e.name)) ? 'timeout' : 'exception', detail: String(e && e.message || e).slice(0, 160) };
  }
}

/** إجراء `media?action=upscale` — زرّ «دقّة أعلى»: ٥ نقاط لغير المالك، تُردّ عند الفشل. */
const handler = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const pointsLib = require('./points.js');
  let charged = null;
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { imageBase64, mime, token } = body || {};
    const username = pointsLib.verifyPointsToken(token);
    if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
    if (typeof imageBase64 !== 'string' || imageBase64.length < 100 || imageBase64.length > B64_MAX) { res.status(400).json({ error: 'bad_image' }); return; }
    if (!pointsLib.isOwnerUsername(username)) {
      const pay = await pointsLib.spendPoints(username, pointsLib.COSTS.image_upscale, 'image_upscale');
      if (!pay.ok) { res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.image_upscale, points: pay.points || 0 }); return; }
      if (!pay.owner) charged = username;
    }
    const r = await module.exports.upscaleImage(imageBase64, mime || 'image/png', { scale: 2 });
    if (!r.ok) {
      if (charged) { await pointsLib.refundPoints(charged, pointsLib.COSTS.image_upscale); charged = null; }
      res.status(r.reason === 'no_token' || r.reason === 'disabled' ? 503 : 502).json({ error: 'upscale_unavailable', reason: r.reason });
      return;
    }
    res.status(200).json({ imageBase64: r.b64, mimeType: r.mime, width: r.w, height: r.h, scale: r.scale });
  } catch (e) {
    if (charged) { try { await pointsLib.refundPoints(charged, pointsLib.COSTS.image_upscale); } catch (e2) { /* أفضل جهد */ } }
    res.status(500).json({ error: 'upscale_failed' });
  }
};

module.exports = handler;
module.exports.imageDims = imageDims;
module.exports.pickScale = pickScale;
module.exports.upscaleImage = upscaleImage;
module.exports.TARGET_MIN = TARGET_MIN;
module.exports.DEFAULT_MODEL = DEFAULT_MODEL;
