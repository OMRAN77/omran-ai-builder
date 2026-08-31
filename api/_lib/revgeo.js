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
// v-geo-fix (بلاغ عمران): مزوّدو الترميز يكتبون بعض الأسماء الإماراتية خطأً —
// قرية «ثوبان» بالفجيرة تصلهم «شوبان». جدول تصحيح يُطبَّق على كل جزء.
const NAME_FIX = {
  'شوبان': 'ثوبان',
  'Thoban': 'ثوبان',
  'Thawban': 'ثوبان',
};
function fixName(v) { const p = part(v); return NAME_FIX[p] || p; }
function joinLabel(parts) {
  const seen = new Set();
  return parts.map(fixName).filter((p) => {
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
  return label ? { label, city: fixName(d.city || d.locality), region: fixName(d.principalSubdivision), country: part(d.countryName), src: 'bigdatacloud' } : null;
}

async function viaNominatim(lat, lon) {
  // zoom=16: مستوى الحيّ لا المدينة — «النعيمية» لا «عجمان» وحدها.
  const d = await timed('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon
    + '&format=jsonv2&accept-language=ar&zoom=16', {
    headers: { 'User-Agent': 'omran-ai-builder/1.0 (reverse-geocode)' },
  }, 6000);
  const a = d && d.address;
  if (!a) return null;
  const city = a.city || a.town || a.village || a.municipality || '';
  const label = joinLabel([a.suburb || a.neighbourhood || a.quarter, city, a.state || a.region, a.country]);
  return label ? { label, city: fixName(city), region: fixName(a.state || a.region), country: part(a.country), src: 'nominatim' } : null;
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
  // v-geo-osm-first: مقيس — BigDataCloud «يلصق» النقطة بأقرب مدينة في بياناته
  // فأعطى «أم القيوين» لمن هو قربها في عجمان. OSM أدق حدودًا فصار أولًا.
  const out = (await viaNominatim(lat, lon)) || (await viaBigDataCloud(lat, lon));
  if (!out) { res.status(502).json({ error: 'revgeo_unavailable' }); return; }
  res.status(200).json(out);
};

module.exports.__test = { viaBigDataCloud, viaNominatim, joinLabel }; // للاختبار
