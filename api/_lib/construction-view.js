// Vercel Serverless Function: on-demand single-image generator for the
// "🏗️ تصاميم المقاولات والبناء" section. Generates ONE image per request
// (either an exterior angle view, or an interior room view with a chosen
// color scheme) so the user only pays the API cost for views they actually
// ask for. Shares the same daily quota counter as construction-create.js.
const { checkConstructionQuota, consumeConstruction, CONSTRUCTION_DAILY_LIMIT } = require('./_constructionUsage');

const BUILDING_LABELS = {
  villa: 'a residential villa',
  apartment: 'an apartment building',
  office: 'an office building',
  warehouse: 'an industrial warehouse',
  mosque: 'a mosque',
  shop: 'a retail shop/storefront',
};

const STYLE_LABELS = {
  modern: 'modern minimalist architectural style, clean lines, large glass windows',
  classic: 'classic elegant architectural style, columns, warm stone finishes',
  gulf: 'traditional Gulf/Emirati architectural style, mashrabiya patterns, sand-tone facade',
  luxury: 'luxurious high-end architectural style, premium materials, dramatic lighting',
  industrial: 'industrial architectural style, exposed steel and concrete',
};

const ANGLE_LABELS_EN = {
  front: 'front facade view, eye level',
  side: 'side facade view, eye level',
  back: 'rear facade view, eye level',
  aerial: 'aerial drone top-down view of the whole building and plot',
};

const ROOM_LABELS_EN = {
  living: 'main living room',
  majlis: 'majlis / formal sitting room',
  bedroom: 'master bedroom',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  dining: 'dining room',
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
    const { mode, buildingType, floors, area, style, notes, token, angle, room, color } = body;
    if (!buildingType || !area || (mode !== 'angle' && mode !== 'room')) {
      res.status(400).json({ error: 'Missing/invalid parameters' });
      return;
    }

    const quota = await checkConstructionQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const buildingDesc = BUILDING_LABELS[buildingType] || 'a building';
    const styleDesc = STYLE_LABELS[style] || STYLE_LABELS.modern;
    const floorsText = floors ? (floors + '-floor ') : '';
    const notesText = notes ? (' Additional requirements: ' + notes + '.') : '';

    let prompt;
    if (mode === 'angle') {
      const angleDesc = ANGLE_LABELS_EN[angle] || ANGLE_LABELS_EN.front;
      prompt =
        'A photorealistic architectural exterior render of ' + floorsText + buildingDesc +
        ', approximately ' + area + ' square meters, in ' + styleDesc + '.' + notesText +
        ' Camera angle: ' + angleDesc + '.' +
        ' Daytime, clear sky, professional architectural visualization, high detail, no people, no text overlays.';
    } else {
      const roomDesc = ROOM_LABELS_EN[room] || ROOM_LABELS_EN.living;
      const colorText = color ? (' Main color scheme/palette: ' + color + '.') : '';
      prompt =
        'A photorealistic interior design render of the ' + roomDesc + ' inside ' + floorsText + buildingDesc +
        ', in ' + styleDesc + '.' + colorText + notesText +
        ' Show room proportions and furniture layout clearly, warm lighting, high-end interior design magazine quality, no people, no text overlays.';
    }

    const imgEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + apiKey;
    const imgReqBody = { contents: [{ parts: [{ text: prompt }] }] };

    const upstream = await fetch(imgEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imgReqBody) });
    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream image error' });
      return;
    }

    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول مرة أخرى.' });
      return;
    }

    const remaining = await consumeConstruction(quota.username);
    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      remaining,
      dailyLimit: CONSTRUCTION_DAILY_LIMIT,
    });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
