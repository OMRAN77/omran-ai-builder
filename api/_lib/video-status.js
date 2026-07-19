// Vercel Serverless Function: polls the status of a previously-created
// Runway video generation task using the site owner's own server-side API
// key (RUNWAY_API_KEY env var).
const RUNWAY_VERSION = '2024-11-06';
const { resolveTaskId } = require('./runway-keys');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const id = req.query && req.query.id;
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const { key: apiKey, rawId } = resolveTaskId(id);
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing RUNWAY_API_KEY' });
      return;
    }

    const upstream = await fetch('https://api.dev.runwayml.com/v1/tasks/' + encodeURIComponent(rawId), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Runway error: ' + JSON.stringify(data).slice(0, 500) });
      return;
    }

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
