// Vercel Serverless Function: "💄 AI Style Studio — Suggest a Style".
// Text-only (with optional vision) call to Gemini that analyzes an uploaded
// photo plus the active feature tab (hair/makeup/beard/nails/skin/glasses/
// tattoo/anime/heritage) and an optional occasion + saved face profile, and
// returns exactly 3 concrete style suggestions with a color-coordination tip
// and a rough match-score percentage. Does NOT generate an image and does
// NOT consume the daily image-generation quota — only requires a logged-in
// session.
const { checkStudioQuota } = require('./_studioUsage');

const FEATURE_NAMES = {
  hair: 'hairstyle and hair color', nails: 'nail polish color/design',
  makeup: 'makeup look', beard: 'facial hair/beard style',
  skin: 'skincare/glow look', glasses: 'glasses style',
  tattoo: 'tattoo design', anime: 'anime/cartoon art style',
  heritage: 'traditional/heritage full outfit look',
};
const OCCASION_NAMES = {
  daily: 'everyday casual life', work: 'work/office', evening: 'an evening out',
  wedding: 'a wedding', sport: 'sport/exercise',
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
    const { imageBase64, mimeType, feature, occasion, profile, lang, token } = body;

    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }

    const quota = await checkStudioQuota(token);
    if (!quota.allowed && quota.reason === 'auth') {
      res.status(401).json({ error: 'auth_required' });
      return;
    }

    const isArabic = lang !== 'en' && lang !== 'fr' && lang !== 'hi' && lang !== 'ur' && lang !== 'bn' && lang !== 'ne';
    const langNames = { en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali' };
    const targetLang = langNames[lang] || 'Arabic';

    const featureName = FEATURE_NAMES[feature] || 'overall style';

    let contextText = 'Focus area: ' + featureName + '. ' +
      'Occasion: ' + (OCCASION_NAMES[occasion] || 'everyday casual life') + '. ';
    if (profile && (profile.faceShape || profile.skin || profile.hair)) {
      contextText += 'Saved profile — ' +
        (profile.faceShape ? 'face shape: ' + profile.faceShape + ', ' : '') +
        (profile.skin ? 'skin tone: ' + profile.skin + ', ' : '') +
        (profile.hair ? 'hair color: ' + profile.hair + '. ' : '');
    }

    const promptText =
      'You are a professional hair/makeup/beauty stylist. ' + contextText +
      'Look at the attached photo of the person and analyze their face shape, skin tone, and hair color/type. ' +
      'Suggest exactly 3 concrete ' + featureName + ' options suited to this person and the occasion above. ' +
      'For each option include: a short catchy title, a 1-2 sentence description of the look, ' +
      'a "colors" field naming 2-3 specific color/shade recommendations that best coordinate with this person\'s ' +
      'skin tone and eye color, and a "matchPercent" integer 70-99 representing how well this option suits this ' +
      'person\'s face/features. Respond in ' + targetLang + '. ' +
      'Respond ONLY with a valid JSON array of exactly 3 objects, nothing else, no markdown, in this exact shape: ' +
      '[{"title":"...","description":"...","colors":"...","matchPercent":92}, ...]';

    const parts = [
      { text: promptText },
      { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
    ];

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const textPart = respParts.find((p) => typeof p.text === 'string');
    let suggestions = [];
    if (textPart) {
      let raw = textPart.text.trim();
      raw = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          suggestions = parsed.slice(0, 3).map((s) => ({
            title: String(s.title || ''),
            description: String(s.description || ''),
            colors: String(s.colors || ''),
            matchPercent: Math.max(70, Math.min(99, parseInt(s.matchPercent, 10) || 85)),
          }));
        }
      } catch (e) {
        // leave suggestions empty; client will show a generic error
      }
    }

    res.status(200).json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
