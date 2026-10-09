'use strict';
/* api/_lib/osm.js — v-city-life: شوارع وأرصفة حول نقطة من الخرائط المفتوحة (Overpass)، للزحمة والمشاة في المدينة المصوَّرة.
   عبر الخادم لا المتصفّح: مرايا احتياطيّة بالترتيب، ورد مختصر (نوع الطريق + معرّفات العقد + الإحداثيّات)، ومخبّأ في
   شبكة التوزيع أسبوعًا بالرابط نفسه (s-maxage) — بلا تخزين في قاعدة البيانات (امتلأت مرّتين).
   GET ?lat&lon&r  (r بين ٢٠٠ و٩٠٠ م؛ الإحداثيّات تُقرَّب لثلاث خانات فتشترك الزيارات في المخبّأ) */

const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const TYPES = 'motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian|footway|path|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';

function query(lat, lon, r) {
  return '[out:json][timeout:25];way(around:' + r + ',' + lat + ',' + lon + ')[highway~"^(' + TYPES + ')$"];out geom;';
}

/** رد Overpass ← { ways: [{ t, n: [ids], p: [[lat,lon],...] }] } بأرقام مقرّبة (٦ خانات ≈ ١١ سم). */
function compact(j) {
  const ways = [];
  for (const e of (j && j.elements) || []) {
    if (e.type !== 'way' || !Array.isArray(e.geometry) || e.geometry.length < 2) continue;
    ways.push({
      t: String((e.tags && e.tags.highway) || ''),
      o: e.tags && e.tags.oneway === 'yes' ? 1 : 0,
      n: Array.isArray(e.nodes) ? e.nodes : [],
      p: e.geometry.map((g) => [Math.round(g.lat * 1e6) / 1e6, Math.round(g.lon * 1e6) / 1e6]),
    });
  }
  return { ways };
}

module.exports = async (req, res, deps) => {
  const f = (deps && deps.fetch) || fetch;
  const q = req.query || {};
  const lat = Math.round(Number(q.lat) * 1000) / 1000, lon = Math.round(Number(q.lon) * 1000) / 1000;
  const r = Math.max(200, Math.min(900, Math.round(Number(q.r) || 600)));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180 || (!lat && !lon)) { res.status(400).json({ error: 'bad lat/lon' }); return; }
  let last = '';
  for (const url of MIRRORS) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 28000);
      const rr = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query(lat, lon, r)), signal: ctl.signal });
      clearTimeout(tm);
      if (!rr.ok) { last = 'HTTP ' + rr.status; continue; }
      const j = await rr.json();
      if (!j || !Array.isArray(j.elements) || (j.remark && /error|timed out|out of memory|runtime/i.test(String(j.remark)))) { last = 'bad reply'; continue; }
      const out = compact(j);
      // منطقة فارغة لا تُخبَّأ طويلًا (قد يكون ردًّا ناقصًا)
      res.setHeader('Cache-Control', out.ways.length ? 'public, s-maxage=604800, stale-while-revalidate=86400' : 'public, s-maxage=300');
      res.status(200).json(out);
      return;
    } catch (e) { last = (e && e.message) || 'fetch'; } // المرآة التالية
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(502).json({ error: 'overpass_unavailable', detail: String(last).slice(0, 120) });
};
module.exports.query = query;
module.exports.compact = compact;
module.exports.MIRRORS = MIRRORS;
