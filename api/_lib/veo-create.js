// Starts a Google Veo 3 video generation via the Gemini API
// (predictLongRunning). Owner-only for now because each 8s clip costs
// real money. Uses GEMINI_API_KEY env var.
const { checkOwnerBypass } = require('./_videoUsage');

const GL = 'https://generativelanguage.googleapis.com/v1beta';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { promptText, ratio, token, quality } = body;
    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    const gate = await checkOwnerBypass(token);
    if (!gate.allowed) {
      res.status(gate.reason === 'auth' ? 401 : 403).json({ error: gate.reason === 'auth' ? 'auth_required' : 'owner_only' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' }); return; }

    const model = quality === 'high' ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
    const aspectRatio = ratio === '720:1280' ? '9:16' : '16:9';
    const prompt = String(promptText).trim().slice(0, 1500);

    const upstream = await fetch(GL + '/models/' + model + ':predictLongRunning', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { aspectRatio, personGeneration: 'allow_adult' },
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      res.status(upstream.status).json({ error: 'Veo error: ' + String(msg).slice(0, 500) });
      return;
    }
    res.status(200).json({ op: data.name });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
