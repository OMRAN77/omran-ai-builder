// Client-side error reporting: the app reports its own JS errors here.
// POST { message, source, line, col, stack, url, ua } -> stored in Redis (deduped, capped)
// GET ?key=OWNER_MONITOR_KEY -> list of recent errors (for health monitor)
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const LOG_PATH = 'db/client-errors/log.json';
const MAX_ITEMS = 60;
const MONITOR_KEY = process.env.MONITOR_KEY || 'omran-monitor-2026';

async function readLog() {
  try {
    const items = await kvGetJSON(LOG_PATH);
    return Array.isArray(items) ? items : [];
  } catch (e) { return []; }
}

async function writeLog(items) {
  await kvPutJSON(LOG_PATH, items);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (req.method === 'GET') {
    if ((req.query.key || '') !== MONITOR_KEY) { res.status(401).json({ error: 'unauthorized' }); return; }
    const items = await readLog();
    res.status(200).json({ errors: items });
    return;
  }

  if (req.method === 'DELETE') {
    if ((req.query.key || '') !== MONITOR_KEY) { res.status(401).json({ error: 'unauthorized' }); return; }
    await writeLog([]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    body = body || {};
    const msg = String(body.message || '').slice(0, 500);
    if (!msg) { res.status(400).json({ error: 'no message' }); return; }
    // Ignore noise: network errors, extension errors, script-error from cross-origin
    const noise = /Failed to fetch|NetworkError|Load failed|Script error\.?$|ResizeObserver|extension/i;
    if (noise.test(msg)) { res.status(200).json({ ok: true, skipped: true }); return; }

    const items = await readLog();
    const sig = msg + '|' + String(body.source || '').slice(0, 200) + '|' + (body.line || 0);
    const existing = items.find(it => it.sig === sig);
    const now = new Date().toISOString();
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = now;
    } else {
      items.unshift({
        sig,
        message: msg,
        source: String(body.source || '').slice(0, 300),
        line: body.line || 0,
        col: body.col || 0,
        stack: String(body.stack || '').slice(0, 1500),
        url: String(body.url || '').slice(0, 300),
        ua: String(body.ua || '').slice(0, 200),
        count: 1,
        firstSeen: now,
        lastSeen: now
      });
    }
    await writeLog(items.slice(0, MAX_ITEMS));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e).slice(0, 200) });
  }
};
