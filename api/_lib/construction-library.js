// Vercel Serverless Function: browse previously-generated construction
// designs saved to the shared library (see _constructionLibrary.js), so
// users can reuse a similar existing design instead of generating a new one.
const { listDesigns } = require('./_constructionLibrary');

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
    const { buildingType, floors, area } = body;
    const items = await listDesigns({ buildingType, floors, area, limit: 12 });
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
