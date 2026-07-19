// Vercel Serverless Function: image generation/editing for مها's voice call
// mode. Used when the caller asks Maha (by voice) to draw/create a picture,
// or to edit the picture she just made. Powered by Gemini's image-generation
// model (server-side owner key, GEMINI_API_KEY) - the only one of the 9
// providers that can actually output images.
const { checkAndConsume, DAILY_LIMIT } = require('./_usage');

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
    const { prompt, editImageBase64, editMimeType, token, guestId } = body;
    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    const usage = await checkAndConsume(token, guestId, 'maha-image');
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + DAILY_LIMIT + ') لهذي الميزة.' });
      }
      return;
    }

    const parts = [];
    const cleanPrompt = String(prompt).slice(0, 500);
    if (editImageBase64) {
      parts.push({ text: 'TASK: "' + cleanPrompt + '"\n\nApply this exact instruction to the attached image. The instruction names specific item(s) - use exactly those item(s), exactly as named, with no substitution for a different brand/model/type/color of your own choosing. Do not simplify or generalize a specific name into a generic version of it. Keep every other part of the existing image unchanged. Re-read the instruction now: "' + cleanPrompt + '". Output a single edited image.' });
      parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
    } else {
      parts.push({ text: 'Generate a single high-quality, photorealistic or artistic image (whichever fits best) of: ' + cleanPrompt + '.' });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + apiKey;
    const reqBody = JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.15 } });

    // Transient upstream errors (rate limit / overload) happen more often the
    // more edits pile up in one call. Retry a couple of times with a short
    // backoff before giving up, instead of surfacing the error to the user.
    let upstream, data;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      data = await upstream.json().catch(() => ({}));
      if (upstream.ok) break;
      const retryable = upstream.status === 429 || upstream.status === 500 || upstream.status === 503;
      console.error('[maha-image] upstream error attempt ' + attempt + '/' + maxAttempts + ' status=' + upstream.status + ' body=' + JSON.stringify(data));
      if (!retryable || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error', retryable: upstream.status === 429 || upstream.status === 500 || upstream.status === 503 });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      console.error('[maha-image] no image part in response: ' + JSON.stringify(data).slice(0, 2000));
      res.status(500).json({ error: 'لم يرجع الموديل صورة، حاول توصيف مختلف.' });
      return;
    }

    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
    });
  } catch (e) {
    console.error('[maha-image] proxy exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
