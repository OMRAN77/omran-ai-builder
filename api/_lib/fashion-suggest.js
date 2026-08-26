// Vercel Serverless Function: "👗 AI Fashion Design — Suggest a Look".
// Text-only (with optional vision) call to Gemini that analyzes an uploaded
// photo (or a text description) plus the chosen occasion/season and an
// optional saved body-profile (height/weight/skin/hair) and returns exactly
// 3 concrete outfit suggestions (clothing + colors + accessories + a rough
// match-score percentage). Does NOT generate an image and does NOT consume
// the daily image-generation quota — only requires a logged-in session.
const { checkFashionQuota } = require('./_fashionUsage');

// v-fashion-rescue: رفضُ Gemini (نفاد رصيد/تعطّل) لا يُسقط الاقتراحات —
// gpt-4o-mini بمفتاح OPENAI_API_KEY يجيب بنفس المطلوب (مع رؤية الصورة إن وُجدت).
async function openaiSuggest(promptText, imageBase64, mimeType) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return '';
  try {
    const content = imageBase64
      ? [{ type: 'text', text: promptText },
         { type: 'image_url', image_url: { url: 'data:' + (mimeType || 'image/jpeg') + ';base64,' + imageBase64 } }]
      : promptText;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content }], max_tokens: 900, temperature: 0.8 }),
    });
    const d = await r.json();
    if (!r.ok) { console.warn('[fashion-suggest] openai HTTP ' + r.status + ' ' + String((d.error && d.error.message) || '').slice(0, 120)); return ''; }
    return String((((d.choices || [])[0] || {}).message || {}).content || '');
  } catch (e) { console.warn('[fashion-suggest] openai ' + (e && e.message)); return ''; }
}

const OCCASION_NAMES = {
  wedding: 'a wedding', work: 'work/office', casual: 'a casual day out',
  sport: 'sport/exercise', travel: 'travel', formal: 'a formal event',
  graduation: 'a graduation ceremony', religious: 'a religious occasion',
};
const SEASON_NAMES = {
  summer: 'summer/hot weather', autumn: 'autumn/cool weather',
  winter: 'winter/cold weather', spring: 'spring/mild weather',
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
    const { imageBase64, mimeType, description, occasion, season, profile, lang, token } = body;

    if (!imageBase64 && !description) {
      res.status(400).json({ error: 'Missing imageBase64 or description' });
      return;
    }

    const quota = await checkFashionQuota(token);
    if (!quota.allowed && quota.reason === 'auth') {
      res.status(401).json({ error: 'auth_required' });
      return;
    }

    const isArabic = lang !== 'en' && lang !== 'fr' && lang !== 'hi' && lang !== 'ur' && lang !== 'bn' && lang !== 'ne';
    const langNames = { en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali' };
    const targetLang = langNames[lang] || 'Arabic';

    let contextText = 'Occasion: ' + (OCCASION_NAMES[occasion] || 'a casual day out') + '. ' +
      'Season: ' + (SEASON_NAMES[season] || 'summer/hot weather') + '. ';
    if (profile && (profile.height || profile.weight || profile.skin || profile.hair)) {
      contextText += 'Person profile — ' +
        (profile.height ? 'height: ' + profile.height + 'cm, ' : '') +
        (profile.weight ? 'weight: ' + profile.weight + 'kg, ' : '') +
        (profile.skin ? 'skin tone: ' + profile.skin + ', ' : '') +
        (profile.hair ? 'hair color: ' + profile.hair + '. ' : '');
    }
    if (description) contextText += 'User description/preference: ' + String(description).slice(0, 300) + '. ';

    const promptText =
      'You are a professional fashion stylist. ' + contextText +
      (imageBase64
        ? 'Look at the attached photo of the person and analyze their skin tone, hair color, and body type. '
        : '') +
      'Suggest exactly 3 complete outfit looks suited to the occasion and season above. ' +
      'For each look include: a short catchy title, the clothing pieces, 2-3 recommended colors that suit ' +
      (imageBase64 ? 'this specific person' : 'the described preference') +
      ', 1-2 accessory suggestions (bag/shoes/jewelry), and a "matchPercent" integer 70-99 representing how well ' +
      'this look matches the person/occasion. Respond in ' + targetLang + '. ' +
      'Respond ONLY with a valid JSON array of exactly 3 objects, nothing else, no markdown, in this exact shape: ' +
      '[{"title":"...","clothing":"...","colors":"...","accessories":"...","matchPercent":92}, ...]';

    const parts = [{ text: promptText }];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    const data = await upstream.json();
    let rawText = '';
    let engine = 'gemini';
    if (upstream.ok) {
      const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const textPart = respParts.find((p) => typeof p.text === 'string');
      if (textPart) rawText = textPart.text;
    } else {
      rawText = await openaiSuggest(promptText, imageBase64, mimeType);
      if (!rawText) {
        res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
        return;
      }
      engine = 'openai';
    }

    let suggestions = [];
    if (rawText) {
      let raw = rawText.trim();
      raw = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          suggestions = parsed.slice(0, 3).map((s) => ({
            title: String(s.title || ''),
            clothing: String(s.clothing || ''),
            colors: String(s.colors || ''),
            accessories: String(s.accessories || ''),
            matchPercent: Math.max(70, Math.min(99, parseInt(s.matchPercent, 10) || 85)),
          }));
        }
      } catch (e) {
        // leave suggestions empty; client will show a generic error
      }
    }

    res.status(200).json({ suggestions, engine });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
