// Vercel Serverless Function: translates a batch of short texts (project titles)
// into a target language using the owner's server-side Mistral key. Used by the
// Explore page so project titles always match the currently selected UI language.
//
// Metered (owner's own MISTRAL_API_KEY): logged-in users and guests are
// capped per day; callers without a token/guestId (today's frontend) are
// metered by IP instead of blocked, so nothing breaks. Owner account unlimited.
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');
const TRANSLATE_DAILY_LIMIT = 100;

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
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing MISTRAL_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { texts, targetLang, token, guestId } = body;
    if (!Array.isArray(texts) || !texts.length) {
      res.status(400).json({ error: 'Missing texts' });
      return;
    }

    const usage = await checkAndConsumeCustom(token, guestId, clientIp(req), 'translate', TRANSLATE_DAILY_LIMIT);
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + TRANSLATE_DAILY_LIMIT + ') للترجمة. حاول لاحقًا.' });
      }
      return;
    }
    const safeTexts = texts.slice(0, 60).map((t) => String(t || '').slice(0, 120));

    const LANG_NAMES = {
      ar: 'Arabic', en: 'English', fr: 'French', hi: 'Hindi',
      ur: 'Urdu', bn: 'Bengali', ne: 'Nepali',
    };
    const langName = LANG_NAMES[targetLang] || 'English';

    const upstream = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You translate short app/project titles into ' + langName + '. ' +
              'Return ONLY a JSON object: {"translations": ["...", "..."]} with the ' +
              'exact same number of items, in the exact same order, as the input array. ' +
              'Keep translations short (a few words). If a title is already in ' + langName + ', return it unchanged.',
          },
          { role: 'user', content: JSON.stringify(safeTexts) },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: 'Upstream error: ' + errText.slice(0, 300) });
      return;
    }

    const data = await upstream.json();
    let translations = [];
    try {
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);
      translations = Array.isArray(parsed.translations) ? parsed.translations : [];
    } catch (e) {
      translations = [];
    }
    if (translations.length !== safeTexts.length) {
      // fallback: pad/truncate to keep client logic simple
      translations = safeTexts.map((t, i) => translations[i] || t);
    }

    res.status(200).json({ translations });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
