// Vercel Serverless Function: "🏠 AI Interior Design". Takes a photo of a
// real room plus a chosen style, and asks Gemini's image-generation model
// (server-side owner API key, GEMINI_API_KEY) to redesign the room in that
// style while keeping the room's basic layout/structure. Returns a base64
// PNG/JPEG the client can preview and download.
const { checkDesignQuota, consumeDesign, DESIGN_DAILY_LIMIT } = require('./_designUsage');

const STYLE_PROMPTS = {
  modern: 'a clean modern minimalist interior design style, neutral colors, sleek furniture',
  bohemian: 'a bohemian (boho) interior design style, warm earthy colors, woven textures, plants',
  luxury: 'a luxurious high-end interior design style, marble, gold accents, elegant furniture',
  simple: 'a simple minimalist interior design style, light colors, uncluttered, functional furniture',
  arabic: 'a traditional Arabic/Majlis interior design style, ornate patterns, rich fabrics, low seating',
  classic: 'a classic elegant interior design style, warm wood tones, traditional furniture',
};

const LIGHTING_PROMPTS = {
  warm: 'warm, cozy ambient lighting (soft yellow tones)',
  cool: 'cool, crisp lighting (white/blue tones)',
  bright: 'bright, well-lit daylight-style lighting',
  dim: 'dim, relaxing night-time mood lighting',
};

const FURNITURE_PROMPTS = {
  modern: 'modern furniture pieces',
  classic: 'classic traditional furniture pieces',
  simple: 'simple, minimal furniture pieces',
  luxury: 'luxurious, high-end furniture pieces',
  bohemian: 'bohemian-style furniture pieces',
};

const FLOORING_PROMPTS = {
  parquet: 'wooden parquet flooring',
  marble: 'polished marble flooring',
  ceramic: 'ceramic tile flooring',
  carpet: 'soft carpet flooring',
};

const FABRIC_PROMPTS = {
  light: 'light-colored fabrics for sofas/cushions/curtains',
  dark: 'dark-colored fabrics for sofas/cushions/curtains',
  neutral: 'neutral-toned fabrics for sofas/cushions/curtains',
  bold: 'bold, vibrant-colored fabrics for sofas/cushions/curtains',
};

const WALLCOLOR_PROMPTS = {
  white: 'white wall paint',
  beige: 'beige wall paint',
  gray: 'gray wall paint',
  bold: 'a bold accent wall color',
};

const CURTAIN_PROMPTS = {
  simple: 'simple curtains',
  luxury: 'luxurious, elegant curtains',
  remove: 'no curtains at all (remove existing curtains)',
};

const DECOR_PROMPTS = {
  plants: 'add decorative indoor plants',
  art: 'add wall art/paintings',
  accessories: 'add luxury decorative accessories',
};

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
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { imageBase64, mimeType, style, lighting, furniture, flooring, fabric, wallColor, curtains, rearrange, decor, token } = body;
    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }

    const quota = await checkDesignQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const styleDesc = STYLE_PROMPTS[style] || STYLE_PROMPTS.modern;
    const extras = [];
    if (LIGHTING_PROMPTS[lighting]) extras.push(LIGHTING_PROMPTS[lighting]);
    if (FURNITURE_PROMPTS[furniture]) extras.push(FURNITURE_PROMPTS[furniture]);
    if (FLOORING_PROMPTS[flooring]) extras.push(FLOORING_PROMPTS[flooring]);
    if (FABRIC_PROMPTS[fabric]) extras.push(FABRIC_PROMPTS[fabric]);
    if (WALLCOLOR_PROMPTS[wallColor]) extras.push(WALLCOLOR_PROMPTS[wallColor]);
    if (CURTAIN_PROMPTS[curtains]) extras.push(CURTAIN_PROMPTS[curtains]);
    if (rearrange) extras.push('rearrange the furniture layout for better flow while keeping the room structure');
    if (Array.isArray(decor)) {
      decor.forEach((d) => { if (DECOR_PROMPTS[d]) extras.push(DECOR_PROMPTS[d]); });
    }
    const extrasText = extras.length ? (' Additionally apply these specific changes: ' + extras.join('; ') + '.') : '';

    const promptText =
      'Redesign this room photo into ' + styleDesc + '.' + extrasText + ' ' +
      'Keep the same room layout, walls, windows and camera angle, but replace the furniture, ' +
      'colors, decor and finishes to match the requested style. Output a single photorealistic image of the redesigned room.';

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + apiKey;
    const reqBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
          ],
        },
      ],
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

    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أو ستايل آخر.' });
      return;
    }

    const remaining = await consumeDesign(quota.username);
    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      remaining,
      dailyLimit: DESIGN_DAILY_LIMIT,
    });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
