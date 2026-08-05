// رأيك يهمنا — user feedback storage (Upstash Redis)
// POST { rating, chips, note, user, lang } -> saved (capped list)
// GET ?key=MONITOR_KEY -> { feedback: [...] } (owner only)
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const LOG_PATH = 'db/feedback/list.json';
const REPORTS_PATH = 'db/reports/list.json';
const MAX_ITEMS = 200;
const MONITOR_KEY = require('./_secrets.js').MONITOR_KEY;

async function readList() {
  try {
    const items = await kvGetJSON(LOG_PATH);
    return Array.isArray(items) ? items : [];
  } catch (e) { return []; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    if ((req.query.key || '') !== MONITOR_KEY) { res.status(401).json({ error: 'unauthorized' }); return; }
    const items = await readList();
    let reports = [];
    try { const r = await kvGetJSON(REPORTS_PATH); if (Array.isArray(r)) reports = r; } catch (e) {}
    res.status(200).json({ feedback: items, reports });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    body = body || {};

    // 11.16 — report inappropriate AI-generated content
    if (body.type === 'report') {
      const content = String(body.content || '').slice(0, 2000);
      if (!content) { res.status(400).json({ error: 'no content' }); return; }
      let reports = [];
      try { const r = await kvGetJSON(REPORTS_PATH); if (Array.isArray(r)) reports = r; } catch (e) {}
      reports.unshift({
        content,
        provider: String(body.provider || '').slice(0, 30),
        user: String(body.user || 'guest').slice(0, 40),
        lang: String(body.lang || '').slice(0, 8),
        ts: new Date().toISOString()
      });
      await kvPutJSON(REPORTS_PATH, reports.slice(0, MAX_ITEMS));
      res.status(200).json({ ok: true });
      return;
    }

    const rating = Math.max(1, Math.min(5, parseInt(body.rating, 10) || 0));
    if (!rating) { res.status(400).json({ error: 'no rating' }); return; }
    const chips = Array.isArray(body.chips) ? body.chips.slice(0, 6).map(c => String(c).slice(0, 40)) : [];
    const note = String(body.note || '').slice(0, 1000);
    const items = await readList();
    items.unshift({
      rating,
      chips,
      note,
      user: String(body.user || 'guest').slice(0, 40),
      lang: String(body.lang || '').slice(0, 8),
      ts: new Date().toISOString()
    });
    await kvPutJSON(LOG_PATH, items.slice(0, MAX_ITEMS));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
