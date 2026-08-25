// 📍 ترميز جغرافي عكسي: إحداثيات من متصفّح المستخدم ← عنوان مقروء بالعربية
// (المنطقة، المدينة، الإمارة، الدولة). يُستهلك في أداة get_location للمحادثة.
//
// خصوصية: لا تُحفظ الإحداثيات في أي سجل — تدخل الطلب وتخرج في الردّ فقط.
// سلسلة صمود بلا مفاتيح: BigDataCloud (مجاني، يدعم العربية) ← Nominatim (OSM).
// لو أُضيف مزوّد بمفتاح لاحقًا فمكانه هنا في الخادم — لا في كود الواجهة أبدًا.

async function timed(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 6000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}));
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally { clearTimeout(t); }
}

function part(v) { return String(v || '').trim(); }
function joinLabel(parts) {
  const seen = new Set();
  return parts.map(part).filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  }).join('، ');
}

async function viaBigDataCloud(lat, lon) {
  const d = await timed('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat
    + '&longitude=' + lon + '&localityLanguage=ar', {}, 6000);
  if (!d) return null;
  const label = joinLabel([d.locality, d.city, d.principalSubdivision, d.countryName]);
  return label ? { label, city: part(d.city || d.locality), region: part(d.principalSubdivision), country: part(d.countryName), src: 'bigdatacloud' } : null;
}

async function viaNominatim(lat, lon) {
  const d = await timed('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon
    + '&format=jsonv2&accept-language=ar&zoom=14', {
    headers: { 'User-Agent': 'omran-ai-builder/1.0 (reverse-geocode)' },
  }, 6000);
  const a = d && d.address;
  if (!a) return null;
  const city = a.city || a.town || a.village || a.municipality || '';
  const label = joinLabel([a.suburb || a.neighbourhood || a.quarter, city, a.state || a.region, a.country]);
  return label ? { label, city: part(city), region: part(a.state || a.region), country: part(a.country), src: 'nominatim' } : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const lat = Number(body && body.lat);
  const lon = Number(body && body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'bad_coordinates' });
    return;
  }
  const out = (await viaBigDataCloud(lat, lon)) || (await viaNominatim(lat, lon));
  if (!out) { res.status(502).json({ error: 'revgeo_unavailable' }); return; }
  res.status(200).json(out);
};

module.exports.__test = { viaBigDataCloud, viaNominatim, joinLabel }; // للاختبار
