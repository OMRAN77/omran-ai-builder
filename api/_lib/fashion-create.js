// Vercel Serverless Function: "👗 AI Fashion Design". Two modes:
//   1) Photo mode: a photo of a woman/model plus a chosen style+occasion is
//      redressed by Gemini's image-generation model into a new outfit.
//   2) Text mode: a plain-text description of a desired outfit is used to
//      generate a brand-new fashion design image from scratch (no photo).
// Uses the server-side owner API key (GEMINI_API_KEY). Returns a base64
// PNG/JPEG the client can preview and download.
const { checkFashionQuota, consumeFashion, FASHION_DAILY_LIMIT } = require('./_fashionUsage');
const { sourceStylePreservationRule } = require('./image-prompt');
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');

const STYLE_PROMPTS = {
  evening: 'an elegant evening gown style, flowing fabric, refined and glamorous',
  formal: 'a formal professional outfit style, tailored and modern',
  casual: 'a casual everyday outfit style, comfortable and stylish',
  abaya: 'a modern elegant abaya style, tasteful embroidery, flowing silhouette',
  wedding: 'a wedding/bridal dress style, luxurious fabric, intricate detail',
  traditional: 'a traditional Gulf/Khaleeji women\'s fashion style, elegant and modest',
};

// v417 — تفاصيل اختيارية. إن غابت كلها فالنصّ النهائي مطابق تمامًا لما قبلها.
const SUBJECTS = { men: 'a man', women: 'a woman', kids: 'a child' };
const WEAR = { men: 'menswear', women: 'womenswear', kids: "children's wear" };
const SEASON_HINTS = {
  summer: 'hot summer weather with lightweight breathable fabrics',
  autumn: 'cool autumn weather with layered fabrics',
  winter: 'cold winter weather with warm layers',
  spring: 'mild spring weather with fresh light fabrics',
};
const OCCASIONS = {
  wedding: 'a wedding', work: 'the workplace', casual: 'an everyday casual outing',
  sport: 'sport and exercise', travel: 'travel', formal: 'a formal event',
  graduation: 'a graduation ceremony', religious: 'a religious occasion',
};
function joinList(v) {
  if (!Array.isArray(v)) return '';
  return v.filter((x) => typeof x === 'string' && x.trim())
    .slice(0, 8).map((x) => x.trim().slice(0, 24)).join(', ');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[fashion-create] image provider is not configured');
      res.status(503).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { mode, imageBase64, mimeType, style, description, token, multiAngle,
      gender, colors, extras, season, occasion } = body;

    if (mode === 'image' && !imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }
    if (mode === 'text' && !description) {
      res.status(400).json({ error: 'Missing description' });
      return;
    }

    const quota = await checkFashionQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const styleDesc = STYLE_PROMPTS[style] || STYLE_PROMPTS.evening;
    const subject = SUBJECTS[gender] || 'a woman';
    const colorList = joinList(colors);
    const extraList = joinList(extras);
    const detailClause =
      (WEAR[gender] ? ' The outfit must be ' + WEAR[gender] + '.' : '') +
      (colorList ? ' Preferred colour palette: ' + colorList + '.' : '') +
      (extraList ? ' Add these accessories: ' + extraList + '.' : '') +
      (SEASON_HINTS[season] ? ' Dress for ' + SEASON_HINTS[season] + '.' : '') +
      (OCCASIONS[occasion] ? ' The look is intended for ' + OCCASIONS[occasion] + '.' : '');
    const parts = [];
    const multiAngleClause = multiAngle
      ? ' Output a single image laid out as a clean 3-panel collage side by side showing the SAME outfit and person from three angles: front view, side view, and back view.'
      : ' Output a single photorealistic image.';

    if (mode === 'image') {
      const promptText =
        'Redress the person in this photo into a new outfit in ' + styleDesc + '. ' +
        'Keep the same person, pose, face and background, but change only the clothing/outfit to match the requested style. ' +
        sourceStylePreservationRule() + detailClause + multiAngleClause;
      parts.push({ text: promptText });
      parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
    } else {
      const promptText =
        'Generate a photorealistic fashion design image of ' + subject + ' wearing ' + styleDesc + '. ' +
        'Specific description: ' + String(description).slice(0, 500) + '. ' +
        'Full-body studio fashion photography, elegant pose, clean background.' +
        detailClause + multiAngleClause;
      parts.push({ text: promptText });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
    const reqBody = { contents: [{ parts }], generationConfig: { imageConfig: { imageSize: '2K' } } };

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[fashion-create] upstream failed status=' + upstream.status + ' detail=' + ((data && data.error && data.error.message) || 'unknown'));
      res.status(502).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بوصف أو ستايل آخر.' });
      return;
    }

    if (mode === 'image') {
      const guard = await verifyLocalizedImageEdit({
        apiKey,
        sourceBase64: imageBase64,
        sourceMime: mimeType || 'image/jpeg',
        resultBase64: imgPart.inlineData.data,
        resultMime: imgPart.inlineData.mimeType || 'image/png',
        userPrompt: [styleDesc, description, detailClause, multiAngleClause].filter(Boolean).join(' '),
      });
      if (!guard.ok) {
        const unavailable = guard.reason === 'validation_unavailable';
        res.status(unavailable ? 502 : 422).json({ error: publicGuardError(guard), retryable: unavailable });
        return;
      }
    }

    const remaining = await consumeFashion(quota.username);
    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      remaining,
      dailyLimit: FASHION_DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[fashion-create] exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
  }
};
