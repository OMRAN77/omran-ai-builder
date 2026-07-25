// Vercel Serverless Function: "🏠 AI Interior Design — Suggest Ideas".
// Takes a photo of a real room and asks Gemini (text+vision, server-side
// owner API key, GEMINI_API_KEY) to look at it and propose 2-3 short,
// concrete redesign ideas (lighting/furniture/flooring/colors/decor).
// Text-only response — does NOT generate an image and does NOT consume the
// user's daily image-generation quota (only requires a logged-in account).
const { checkDesignQuota } = require('./_designUsage');

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
    const { imageBase64, mimeType, lang, token } = body;
    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }

    // Only requires a valid logged-in session; this is a cheap text-only
    // call and does not touch the daily image-generation counter.
    const quota = await checkDesignQuota(token);
    if (!quota.allowed && quota.reason === 'auth') {
      res.status(401).json({ error: 'auth_required' });
      return;
    }

    const isArabic = lang !== 'en' && lang !== 'fr' && lang !== 'hi' && lang !== 'ur' && lang !== 'bn' && lang !== 'ne';
    const langNames = { en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali' };
    const targetLang = langNames[lang] || 'Arabic';

    const promptText =
      'Look at this photo of a real room. Suggest exactly 3 short, specific, practical interior design ' +
      'improvement ideas for this exact room (things like lighting changes, furniture style, flooring, ' +
      'wall colors, fabric colors, furniture arrangement, or decorative touches). ' +
      'Each idea must be ONE short sentence (max ~18 words), concrete and directly based on what you see in the photo. ' +
      'Respond in ' + targetLang + '. ' +
      'Respond ONLY with a valid JSON array of exactly 3 strings, nothing else, no markdown, e.g. ["idea 1", "idea 2", "idea 3"].';

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey;
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
    const textPart = parts.find((p) => typeof p.text === 'string');
    let suggestions = [];
    if (textPart) {
      let raw = textPart.text.trim();
      raw = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) suggestions = parsed.map((s) => String(s)).slice(0, 3);
      } catch (e) {
        // Fallback: split into lines if the model didn't return clean JSON.
        suggestions = raw.split('\n').map((l) => l.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3);
      }
    }

    res.status(200).json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
