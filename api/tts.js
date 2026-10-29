// Vercel Serverless Function: proxies text-to-speech requests to OpenAI's API
// using the site owner's own server-side API key (OPENAI_API_KEY env var), so
// visitors can use cloud voice without entering their own key. Falls back to
// a client-supplied apiKey only if one is explicitly sent (legacy support).
// Requests on the owner's key count against the 'tts' quota (see _usage.js).
const { checkAndConsume, rejectUsage } = require('./_usage');

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

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
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { text, voice, token } = body;
    const ownKey = typeof body.apiKey === 'string' && body.apiKey ? body.apiKey : null;
    const apiKey = ownKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
      return;
    }
    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }
    if (!ownKey) {
      const usage = await checkAndConsume(token, req, 'tts');
      if (!usage.allowed) {
        rejectUsage(res, usage);
        return;
      }
    }

    const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: VOICES.includes(voice) ? voice : 'onyx',
        input: String(text).slice(0, 4000),
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: 'OpenAI error: ' + errText.slice(0, 500) });
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
