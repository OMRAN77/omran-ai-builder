// v-studio-14: معاينة مصوّرة لأي خيار في ستايل الذكاء الاصطناعي — تُولَّد عند أول
// طلب من نموذج حقيقي من نماذجنا (assets/fashion/looks) عبر gpt-image-1 ثم تُحفظ في
// Redis وتُقدَّم للجميع بعدها فورًا. GET /api/studio-preview?feature=..&value=..
// (value=__tab لصورة تبويب الميزة). القائمة البيضاء تمنع أي استغلال.
'use strict';
const { kvGetRaw, kvSetRaw, kvSetIfAbsent } = require('./kv.js');
const MORE = require('./studio-more.js');

const BASE_PHOTO = { m: '/assets/fashion/looks/men/casual.webp', w: '/assets/fashion/looks/women/casual.webp' };

function reqOrigin(req) {
  const h = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim();
  if (/^[a-z0-9.-]+(:\d+)?$/i.test(h) && /\./.test(h)) return 'https://' + h;
  return 'https://omran-ai-builder.vercel.app';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sendImage(res, b64) {
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).end(Buffer.from(b64, 'base64'));
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const q = req.query || {};
  const feature = String(q.feature || '').trim();
  let value = String(q.value || '').trim();
  const map = MORE.STYLE_PROMPTS[feature];
  if (!map) { res.status(404).json({ error: 'unknown feature' }); return; }
  if (value === '__tab') value = Object.keys(map)[0];
  if (!map[value]) { res.status(404).json({ error: 'unknown value' }); return; }
  const key = 'studio:preview:v1:' + feature + ':' + value;

  try {
    const cached = await kvGetRaw(key);
    if (cached) { sendImage(res, cached); return; }
  } catch (e) { /* بلا كاش نولّد مباشرة */ }

  const oaKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!oaKey) { res.status(503).json({ error: 'preview generator not configured' }); return; }

  // قفل: توليد واحد فقط لكل خيار مهما تزامنت الطلبات؛ الباقون ينتظرون الكاش
  let got = false;
  try { got = await kvSetIfAbsent(key + ':lock', String(Date.now()), 120); } catch (e) { got = true; }
  if (!got) {
    for (let i = 0; i < 12; i++) {
      await sleep(2500);
      try { const c = await kvGetRaw(key); if (c) { sendImage(res, c); return; } } catch (e) { /* نكمل الانتظار */ }
    }
    res.setHeader('Retry-After', '10');
    res.status(503).json({ error: 'preview pending' });
    return;
  }

  try {
    const gender = ((MORE.PREVIEW_SUBJECT[feature] || {})[value]) || ((MORE.PREVIEW_SUBJECT[feature] || {}).__tab) || 'w';
    const srcRes = await fetch(reqOrigin(req) + BASE_PHOTO[gender], { signal: AbortSignal.timeout(20000) });
    if (!srcRes.ok) throw new Error('base photo ' + srcRes.status);
    const srcBuf = Buffer.from(await srcRes.arrayBuffer());
    const prompt = MORE.FEATURE_INSTRUCTIONS[feature](map[value]) +
      ' Keep the same studio setting: dark warm brown backdrop with soft golden light, full-body framing, photorealistic.';
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt.slice(0, 3900));
    form.append('size', '1024x1536');
    form.append('quality', 'medium');
    form.append('input_fidelity', 'high');
    form.append('output_format', 'webp');
    form.append('output_compression', '72');
    form.append('image', new Blob([srcBuf], { type: 'image/webp' }), 'model.webp');
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + oaKey },
      body: form,
      signal: AbortSignal.timeout(240000),
    });
    const d = await r.json();
    const b64 = d && d.data && d.data[0] && d.data[0].b64_json;
    if (!r.ok || !b64) throw new Error('openai ' + r.status + ' ' + String((d && d.error && d.error.message) || '').slice(0, 120));
    try { await kvSetRaw(key, b64); } catch (e) { /* الصورة تُقدَّم الآن ولو تعذّر الحفظ */ }
    sendImage(res, b64);
  } catch (e) {
    console.error('[studio-preview] ' + feature + '/' + value + ': ' + (e && e.message));
    res.setHeader('Retry-After', '60');
    res.status(502).json({ error: 'preview failed' });
  }
};
