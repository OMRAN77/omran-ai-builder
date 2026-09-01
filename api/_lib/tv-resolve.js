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
      // v659: الكاش يحفظ المعرّف الرقمي فقط — لكن طلب live=1 يريد رقم البثّ
      // الجاري أيضًا. بدونه يظنّ العميل أن القناة صامتة فيقذف المستخدم خارج
      // التطبيق. نُكمل الرد بفحص البثّ (له كاشه القصير المستقل).
      if (String(req.query && req.query.live) === '1') {
        const live = await liveInfo(cached.id);
        res.status(200).json(Object.assign({ channelId: cached.id }, live));
        return;
      }
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
    if (String(req.query && req.query.live) === '1') {
      const live = await liveInfo(id);
      res.status(200).json(Object.assign({ channelId: id }, live));
      return;
    }
    res.status(200).json({ channelId: id });
  } catch (e) {
    res.status(502).json({ error: 'resolve_failed' });
  }
};

/* v-tv-live: تضمين live_stream القديم لا يعمل لأغلب القنوات، وبعضها يمنع
 * التضمين كليًا. الحل: صفحة /live للقناة تكشف لحظيًا — هل تبث؟ ما رقم
 * فيديو البث؟ وهل التضمين مسموح (playableInEmbed)؟ كاش ٢٠ دقيقة. */
const LIVE_CACHE_MS = 20 * 60 * 1000;
async function liveInfo(id) {
  const lkey = 'db/tv/live/' + id;
  try {
    const c = await kvGetJSON(lkey);
    if (c && (Date.now() - (c.ts || 0)) < LIVE_CACHE_MS) return { isLive: !!c.isLive, videoId: c.videoId || null, embeddable: c.embeddable !== false };
  } catch (e) { /* كاش معطل */ }
  let out = { isLive: false, videoId: null, embeddable: true };
  try {
    const r = await fetch('https://www.youtube.com/channel/' + id + '/live', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en',
        Cookie: 'CONSENT=YES+1; SOCS=CAI',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (r.ok) {
      const html = await r.text();
      const isLive = (/"isLive"\s*:\s*true|"isLiveNow"\s*:\s*true/.test(html))
        && !/"status"\s*:\s*"LIVE_STREAM_OFFLINE"/.test(html);
      if (isLive) {
        const vm = html.match(/"videoId"\s*:\s*"([\w-]{11})"/);
        out = {
          isLive: true,
          videoId: vm ? vm[1] : null,
          embeddable: !/"playableInEmbed"\s*:\s*false/.test(html),
        };
      }
    }
  } catch (e) { /* فشل الفحص اللحظي — يُبلغ العميل بغير حي */ }
  try { await kvPutJSON(lkey, Object.assign({ ts: Date.now() }, out)); } catch (e) { /* الكاش رفاهية */ }
  return out;
}
