// 📺 حلّ معرّف قناة يوتيوب الرقمي (UC...) من معرّفها النصي (@handle) —
// تضمين live_stream يحتاج المعرّف الرقمي، والعميل يخزّنه محليًا 30 يومًا.
// كاش سيرفر إضافي في KV حتى لا نطرق يوتيوب لكل مستخدم.
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const HANDLE_RE = /^[A-Za-z0-9_.\-]{2,40}$/;
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }

  const handle = String((req.query && req.query.handle) || '').trim();
  if (!HANDLE_RE.test(handle)) { res.status(400).json({ error: 'bad_handle' }); return; }

  const key = 'db/tv/handle/' + handle.toLowerCase();
  try {
    const cached = await kvGetJSON(key);
    if (cached && cached.id && (Date.now() - (cached.ts || 0)) < CACHE_MS) {
      res.setHeader('X-Cache', 'HIT');
      res.status(200).json({ channelId: cached.id });
      return;
    }
  } catch (e) { /* كاش معطّل — نحل مباشرة */ }

  try {
    const r = await fetch('https://www.youtube.com/@' + encodeURIComponent(handle), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!r.ok) { res.status(404).json({ error: 'not_found' }); return; }
    const html = await r.text();
    const m = html.match(/"channelId":"(UC[\w-]{22})"/)
      || html.match(/channel_id=(UC[\w-]{22})/)
      || html.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
    if (!m) { res.status(404).json({ error: 'no_channel_id' }); return; }
    const id = m[1];
    try { await kvPutJSON(key, { id, ts: Date.now() }); } catch (e) { /* الكاش رفاهية */ }
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json({ channelId: id });
  } catch (e) {
    res.status(502).json({ error: 'resolve_failed' });
  }
};
