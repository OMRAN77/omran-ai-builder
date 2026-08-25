// Vercel Serverless Function: "🏠 ديكور AI" — النسخة المحسّنة.
// نفس عقد الطلب القديم حرفيًا (الواجهة الحالية تشتغل بلا أي تعديل)،
// مع قدرات الحزمة الجديدة مدموجة:
//   · مكتبة ٢٤ نمطًا و١٥ مكانًا (omran-decor-prompts.js) بدل ٩ أنماط.
//   · GEOMETRY_LOCK: قفل هندسة الغرفة — أهم سطر في الحزمة كلها.
//   · CONSISTENCY_LOCK + حقل referenceBase64 الاختياري: زوايا متعددة
//     لنفس الغرفة بنفس الأثاث والألوان (الزاوية الأولى تصير مرجعًا).
//   · temperature 0.4: التزام أعلى بهندسة الغرفة.
//   · كاش أسبوع: نفس الغرفة + نفس النمط + نفس الخيارات = نفس النتيجة
//     فورًا وبلا استهلاك حصة.
// أبقينا الأفضل من نسختنا القديمة: نموذج gemini-3-pro-image بدقة 2K
// (أقوى من gemini-2.5-flash-image المقترح)، واستهلاك الحصة بعد النجاح
// فقط (أنظف من خصمٍ ثم استرجاع)، ووضع «بلا صورة» بأربع لقطات gpt-image-2.
const { checkDesignQuota, consumeDesign, DESIGN_DAILY_LIMIT } = require('./_designUsage');
const { kvGetJSON, kvPutJSON, kvExpire } = require('./kv.js');
const P = require('./omran-decor-prompts.js');
const crypto = require('crypto');

const CACHE_TTL_S = 60 * 60 * 24 * 7;
const sig = (s) => crypto.createHash('sha1').update(String(s).slice(0, 4096)).digest('hex');

// حقول الواجهة القديمة → خيارات مكتبة البرومبتات.
function legacyOptions({ lighting, furniture, flooring, fabric, wallColor, curtains, rearrange, decor }) {
  const options = {};
  if (lighting) options.light = lighting;
  if (furniture) options.furn = furniture;
  if (flooring) options.floor = flooring;
  if (fabric) options.fabric = fabric;
  if (wallColor) options.wall = wallColor;
  if (curtains) options.curt = curtains;
  const extras = [];
  if (rearrange) extras.push('rearrange');
  if (Array.isArray(decor)) decor.forEach((d) => { if (P.OPTIONS.extra[d]) extras.push(d); });
  return { options, extras };
}
function extrasText(extras) {
  return extras.map((e) => P.OPTIONS.extra[e]).filter(Boolean);
}

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
    const {
      imageBase64, mimeType, style, token, place, count, notes, variantOf,
      // جديدة (اختيارية كلها — الواجهة القديمة لا ترسلها فيبقى سلوكها كما هو):
      referenceBase64, referenceMime, description,
    } = body;
    const notesText = String(notes || '').replace(/[\r\n]+/g, ' ').replace(/["`\\]/g, '').trim().slice(0, 400);
    if (!imageBase64 && !place && !description) {
      res.status(400).json({ error: 'Missing imageBase64 or place' });
      return;
    }

    const quota = await checkDesignQuota(token);
    if (!quota.allowed) {
      res.status(quota.reason === 'auth' ? 401 : 402).json({ error: quota.reason === 'auth' ? 'auth_required' : 'daily_limit_reached' });
      return;
    }

    const { options, extras } = legacyOptions(body);

    // ── كاش أسبوع: نفس المدخلات = نفس النتيجة فورًا بلا استهلاك حصة ──
    const cacheKey = 'decor/img/' + crypto.createHash('sha256').update([
      imageBase64 ? 'photo' : 'text', style || '', place || '', String(description || '').slice(0, 300),
      JSON.stringify(options), extras.join(','), notesText,
      imageBase64 ? sig(imageBase64) : '', referenceBase64 ? sig(referenceBase64) : '', String(count || ''),
    ].join('|')).digest('hex').slice(0, 40);
    if (!variantOf) {
      const hit = await kvGetJSON(cacheKey);
      if (hit && (hit.imageBase64 || hit.images)) {
        res.status(200).json({ ...hit, cached: true, dailyLimit: DESIGN_DAILY_LIMIT });
        return;
      }
    }

    // ── مسار «بلا صورة»: أشكال جاهزة. يعمل على OpenAI لا على نموذج جوجل. ──
    if (!imageBase64) {
      const oaKey = process.env.OPENAI_API_KEY;
      if (!oaKey) { res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' }); return; }
      if (place && !P.placeOf(place)) { res.status(400).json({ error: 'Unknown place' }); return; }
      const n = Math.min(Math.max(parseInt(count, 10) || 4, 1), 4);
      const VIEWS = [
        'wide establishing shot taken from the doorway',
        'view from the opposite corner of the space',
        'closer shot focused on the main seating or feature area',
        'elevated three-quarter angle showing the whole layout',
      ];
      const base = P.buildFromText({ styleId: style, placeId: place, description, options, note: notesText })
        + (extras.length ? ' Also: ' + extrasText(extras).join(', ') + '.' : '');
      const vSrc = String(variantOf || '');
      if (vSrc && vSrc.length > 64) {
        try {
          const fd = new FormData();
          fd.append('model', 'gpt-image-2');
          fd.append('prompt', 'Create a new variation of this interior photograph. Keep the same overall design style, colour palette, materials and camera angle, but vary the furniture arrangement and the decorative details.' + (notesText ? ' Client note: ' + notesText + '.' : '') + ' Photorealistic architectural photography. No people, no text, no watermark, no logo.');
          fd.append('size', '1536x1024');
          fd.append('quality', 'medium');
          fd.append('n', String(n));
          fd.append('output_format', 'webp');
          fd.append('output_compression', '82');
          fd.append('image', new Blob([Buffer.from(vSrc, 'base64')], { type: 'image/webp' }), 'ref.webp');
          const vr = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + oaKey },
            body: fd,
            signal: AbortSignal.timeout(240000),
          });
          const vd = await vr.json();
          const vimgs = (((vd && vd.data) || []).map((x) => x && x.b64_json).filter(Boolean))
            .map((b64) => ({ imageBase64: b64, mimeType: 'image/webp' }));
          if (vimgs.length) {
            const vrem = await consumeDesign(quota.username);
            res.status(200).json({ images: vimgs, remaining: vrem, dailyLimit: DESIGN_DAILY_LIMIT });
            return;
          }
        } catch (e) { /* fallback to normal generation below */ }
      }
      const shots = await Promise.all(Array.from({ length: n }, (_, i) => fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + oaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: base + ' Camera: ' + VIEWS[i % VIEWS.length] + '.',
          size: '1536x1024',
          quality: 'medium',
          n: 1,
          output_format: 'webp',
          output_compression: 82,
        }),
        signal: AbortSignal.timeout(240000),
      }).then((r) => r.json()).then((d) => (((d && d.data) || [])[0] || {}).b64_json || null).catch(() => null)));
      const images = shots.filter(Boolean).map((b64) => ({ imageBase64: b64, mimeType: 'image/webp' }));
      if (!images.length) {
        res.status(502).json({ error: 'لم يرجع النموذج أي شكل. جرّب نمطًا أو نوع مكان آخر.' });
        return;
      }
      const rem = await consumeDesign(quota.username);
      const payload = { images, remaining: rem };
      await kvPutJSON(cacheKey, { images });
      try { await kvExpire(cacheKey, CACHE_TTL_S); } catch (e) { /* best-effort */ }
      res.status(200).json({ ...payload, dailyLimit: DESIGN_DAILY_LIMIT });
      return;
    }

    // ── مسار الصورة: إعادة تصميم غرفة المستخدم الحقيقية ──
    const hasReference = !!(referenceBase64 && String(referenceBase64).length > 64);
    const promptText = P.buildFromPhoto({
      styleId: style, placeId: place, options, isReference: hasReference, note: notesText,
    }) + (extras.length ? ' Also: ' + extrasText(extras).join(', ') + '.' : '');

    // الترتيب مهم: صورة الغرفة أولًا، ثم المرجع (إن وجد)، ثم النص.
    const parts = [{ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }];
    if (hasReference) parts.push({ inlineData: { mimeType: referenceMime || 'image/jpeg', data: referenceBase64 } });
    parts.push({ text: promptText });

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
    const reqBody = {
      contents: [{ parts }],
      // temperature منخفضة عمدًا: الالتزام بهندسة الغرفة أهم من الإبداع هنا.
      generationConfig: { temperature: 0.4, imageConfig: { imageSize: '2K' } },
    };

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
      return;
    }

    const outParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = outParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أو ستايل آخر.' });
      return;
    }

    const remaining = await consumeDesign(quota.username);
    const result = {
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
    };
    await kvPutJSON(cacheKey, result);
    try { await kvExpire(cacheKey, CACHE_TTL_S); } catch (e) { /* best-effort */ }
    res.status(200).json({ ...result, remaining, dailyLimit: DESIGN_DAILY_LIMIT });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
