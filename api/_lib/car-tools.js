// Vercel Serverless Function: "🚗 قسم السيارات" (Car Tools).
// One endpoint routes 10 different car-related AI tools (text advice, vision
// diagnosis, and one image-edit tool) by a `tool` id, all on the server-side
// owner Gemini API key. The 11th tool (acceleration/performance calculator)
// is pure client-side math and never calls this endpoint.
const { checkCarQuota, consumeCar, CAR_DAILY_LIMIT } = require('./_carUsage');

const LANG_NAMES = { en: 'English', fr: 'French', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali', ne: 'Nepali' };
function targetLangName(lang) {
  return LANG_NAMES[lang] || 'Arabic';
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
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { tool, text, imageBase64, mimeType, lang, token } = body;
    if (!tool) {
      res.status(400).json({ error: 'Missing tool' });
      return;
    }

    const quota = await checkCarQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const target = targetLangName(lang);

    // ---- Tool 2: car photo edit (image-generation, returns an image) ----
    if (tool === 'photoedit') {
      if (!imageBase64) {
        res.status(400).json({ error: 'Missing imageBase64' });
        return;
      }
      const editPrompt =
        'Take this exact photo of a car and apply ONLY this requested modification: "' +
        String(text || '').slice(0, 300) +
        '". Keep everything else about the car and scene identical: same angle, same background, same lighting, ' +
        'same car model shape — only change what was requested (e.g. paint color, rims/wheels, body kit, window tint, ride height). ' +
        'Make the edit look photorealistic and natural. Output a single image only.';
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + apiKey;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: editPrompt }, { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }] }],
        }),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
        return;
      }
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
      if (!imgPart) {
        res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أو طلب آخر.' });
        return;
      }
      const remaining = await consumeCar(quota.username);
      res.status(200).json({
        imageBase64: imgPart.inlineData.data,
        mimeType: imgPart.inlineData.mimeType || 'image/png',
        remaining,
        dailyLimit: CAR_DAILY_LIMIT,
      });
      return;
    }

    // ---- All other tools: text (optionally + vision) via Gemini ----
    const TOOL_PROMPTS = {
      repair: 'You are an expert car mechanic AI assistant. The user describes a car problem: "' + String(text || '').slice(0, 500) + '". ' +
        'Give a likely diagnosis, the most probable causes ranked by likelihood, and clear step-by-step repair guidance (including whether it is DIY-safe or needs a professional garage, and a very rough cost estimate range). ' +
        'Respond in ' + target + ', using clear short sections with emojis as section markers.',
      engine: 'You are an expert car tuning/performance advisor AI. The user\'s car and goal: "' + String(text || '').slice(0, 500) + '". ' +
        'Suggest realistic engine/performance upgrade options (stages), their approximate power/torque gains, rough cost ranges, and important warnings (warranty voiding, reliability, legality). ' +
        'Respond in ' + target + ', using clear short sections with emojis as section markers.',
      compare: 'You are an expert car comparison AI. The user wants to compare these cars: "' + String(text || '').slice(0, 500) + '". ' +
        'Produce a clear structured comparison covering: price range, performance, reliability, fuel economy, maintenance cost, resale value, and a final recommendation depending on different buyer priorities (family / performance / budget). ' +
        'Respond in ' + target + ', formatted as a short readable comparison (use a simple text table or bullet sections with emojis).',
      preinspect: 'You are an expert used-car pre-purchase inspection AI. Car details from the user: "' + String(text || '').slice(0, 500) + '". ' +
        'Provide a complete pre-purchase inspection checklist tailored to this car (engine, transmission, suspension, electronics, body/frame, documents/history, common issues specific to this model). ' +
        'Respond in ' + target + ', as a clear checklist with emojis as section markers.',
      noise: 'You are an expert car diagnostic AI specialized in identifying problems from described sounds/noises. The user describes a noise: "' + String(text || '').slice(0, 500) + '". ' +
        'List the most likely causes ranked by probability, which part is likely responsible, urgency level (safe to drive vs stop immediately), and next steps. ' +
        'Respond in ' + target + ', using clear short sections with emojis as section markers.',
      resale: 'You are an expert car valuation AI. Car details from the user: "' + String(text || '').slice(0, 500) + '". ' +
        'Estimate a realistic resale price RANGE (state clearly this is an estimate, not exact, and can vary by region/condition/market), list the key factors that affect the price for this specific car, and give 2-3 tips to increase resale value. ' +
        'Respond in ' + target + ', using clear short sections with emojis as section markers.',
      tires: 'You are an expert tire advisor AI. Car/tire details from the user: "' + String(text || '').slice(0, 500) + '". ' +
        'Recommend suitable tire sizes/types for this car and use-case (daily/performance/off-road/all-season), give general price-range guidance, tire care/rotation tips, and signs of worn tires to watch for. ' +
        'Respond in ' + target + ', using clear short sections with emojis as section markers.',
    };

    if (TOOL_PROMPTS[tool]) {
      if (!text || !String(text).trim()) {
        res.status(400).json({ error: 'Missing text' });
        return;
      }
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: TOOL_PROMPTS[tool] }] }] }),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
        return;
      }
      const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const textPart = respParts.find((p) => typeof p.text === 'string');
      const remaining = await consumeCar(quota.username);
      res.status(200).json({ resultText: textPart ? textPart.text.trim() : '', remaining, dailyLimit: CAR_DAILY_LIMIT });
      return;
    }

    // ---- Vision tools: diagnose-from-photo (7) and dashboard-light (9) ----
    if (tool === 'photodiag' || tool === 'dashlight') {
      if (!imageBase64) {
        res.status(400).json({ error: 'Missing imageBase64' });
        return;
      }
      const visionPrompt = tool === 'dashlight'
        ? 'You are an expert car dashboard warning-light identification AI. Look at this photo of a dashboard warning light icon' +
          (text ? (' (the user also describes it as: "' + String(text).slice(0, 200) + '")') : '') + '. ' +
          'Identify exactly which warning light this is, what it means, its severity level (info / caution / stop driving immediately), and recommended next steps. ' +
          'Respond in ' + target + ', using clear short sections with emojis as section markers.'
        : 'You are an expert car mechanic AI. Look at this photo of a car part/issue' +
          (text ? (' (the user also describes: "' + String(text).slice(0, 300) + '")') : '') + '. ' +
          'Diagnose what problem is visible, the likely cause, severity, and recommended next steps (DIY-safe or needs a professional garage). ' +
          'Respond in ' + target + ', using clear short sections with emojis as section markers.';
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: visionPrompt }, { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }] }],
        }),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
        return;
      }
      const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const textPart = respParts.find((p) => typeof p.text === 'string');
      const remaining = await consumeCar(quota.username);
      res.status(200).json({ resultText: textPart ? textPart.text.trim() : '', remaining, dailyLimit: CAR_DAILY_LIMIT });
      return;
    }

    res.status(400).json({ error: 'Unknown tool' });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
