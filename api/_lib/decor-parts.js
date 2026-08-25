// Vercel Serverless Function: حصر قطع الأثاث من صورة التصميم الناتجة —
// نداء نصي رخيص على gemini-2.5-flash يرجع قائمة تسوق تقريبية بالعربي
// (الاسم، المواصفات، سعر تقريبي بالدرهم). أهم إضافة تجارية لديكور AI:
// تحوّل النتيجة من صورة حلوة إلى بداية قرار شراء.
// الكاش ٣٠ يومًا: نفس الصورة ما تُحلَّل مرتين.
const { checkDesignQuota } = require('./_designUsage');
const { kvGetJSON, kvPutJSON, kvExpire } = require('./kv.js');
const P = require('./omran-decor-prompts.js');
const crypto = require('crypto');

const CACHE_TTL_S = 60 * 60 * 24 * 30;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' }); return; }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { imageBase64, mimeType, token } = body;
    if (!imageBase64) { res.status(400).json({ error: 'Missing imageBase64' }); return; }

    // نفس بوابة الديكور (بلا استهلاك حصة — النداء النصي رخيص، والبوابة
    // تمنع فقط الاستدعاء المجهول الجماعي).
    const quota = await checkDesignQuota(token);
    if (!quota.allowed) {
      res.status(quota.reason === 'auth' ? 401 : 402).json({ error: quota.reason === 'auth' ? 'auth_required' : 'daily_limit_reached' });
      return;
    }

    const b64 = String(imageBase64).replace(/^data:[^,]+,/, '');
    const cacheKey = 'decor/parts/' + crypto.createHash('sha1').update(b64.slice(0, 8192)).digest('hex');
    const hit = await kvGetJSON(cacheKey);
    if (hit && Array.isArray(hit.parts)) { res.status(200).json({ parts: hit.parts, cached: true }); return; }

    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: b64 } },
            { text: P.PARTS_PROMPT },
          ] }],
        }),
        signal: AbortSignal.timeout(45000),
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
      return;
    }
    const txt = ((((data.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
    let parts = [];
    try { parts = JSON.parse(String(txt).replace(/```json|```/g, '').trim()); } catch (e) { parts = []; }
    if (!Array.isArray(parts)) parts = [];
    // تعقيم بسيط: نبقي الحقول المتوقعة فقط وحد أقصى ٨ قطع.
    parts = parts.slice(0, 8).map((p) => ({
      emoji: String((p && p.emoji) || '').slice(0, 8),
      name_ar: String((p && p.name_ar) || '').slice(0, 80),
      spec_ar: String((p && p.spec_ar) || '').slice(0, 160),
      price_aed: Number((p && p.price_aed) || 0) || 0,
    }));

    await kvPutJSON(cacheKey, { parts, at: Date.now() });
    try { await kvExpire(cacheKey, CACHE_TTL_S); } catch (e) { /* best-effort */ }
    res.status(200).json({ parts });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
