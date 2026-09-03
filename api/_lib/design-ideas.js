// v-decor-gallery (طلب المالك: «اسحب الصور… صور كثيرة وتصاميم» كما في Pinterest):
// معرض أفكار من صور حقيقية على الويب لنوع مكان أو وصف حرّ. عدّة استعلامات
// متوازية على Tavily مع include_images ثم دمج وإزالة التكرار — عشرات الصور في
// ثوانٍ، بلا استهلاك لحصّة توليد الصور.
const TAVILY = 'https://api.tavily.com/search';

const PLACE_EN = {
  restaurant: 'restaurant', cafe: 'cafe coffee shop', bedroom: 'bedroom', majlis: 'arabic majlis',
  living: 'living room', kitchen: 'kitchen', office: 'office', shop: 'retail shop', bath: 'bathroom',
  kids: 'kids room', entrance: 'home entrance foyer', garden: 'garden terrace',
};
const PLACE_AR = {
  restaurant: 'مطعم', cafe: 'كافيه', bedroom: 'غرفة نوم', majlis: 'مجلس عربي', living: 'صالة', kitchen: 'مطبخ',
  office: 'مكتب', shop: 'محل', bath: 'حمام', kids: 'غرفة أطفال', entrance: 'مدخل', garden: 'حديقة',
};

function cleanQ(s) { return String(s || '').replace(/[\r\n]+/g, ' ').replace(/["`\\<>]/g, '').trim().slice(0, 120); }
function looksLikePhoto(u) {
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.svg(\?|$)|\/logo|favicon|sprite|icon|avatar|\.gif(\?|$)|pixel|tracking|1x1/i.test(u)) return false;
  return true;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const apiKey = (process.env.TAVILY_API_KEY || '').trim();
  if (!apiKey) { res.status(500).json({ error: 'Server is missing TAVILY_API_KEY' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const place = String(body.place || '').trim();
  const text = cleanQ(body.q);
  const style = cleanQ(body.style);
  const subjectEn = text || PLACE_EN[place] || '';
  const subjectAr = text || PLACE_AR[place] || '';
  if (!subjectEn) { res.status(400).json({ error: 'Missing q or place' }); return; }

  const queries = [
    subjectEn + ' interior design ideas ' + style,
    subjectEn + ' interior design inspiration photos',
    subjectAr + ' تصميم ديكور أفكار',
    subjectEn + ' modern luxury interior',
    subjectEn + ' decor pinterest ideas',
    subjectAr + ' ديكور فخم صور',
  ].map((q) => q.replace(/\s+/g, ' ').trim());

  const runs = await Promise.all(queries.map((q) => fetch(TAVILY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query: q, search_depth: 'basic', include_images: true, include_answer: false, max_results: 8 }),
    signal: AbortSignal.timeout(15000),
  }).then((r) => (r.ok ? r.json() : { images: [] })).catch(() => ({ images: [] }))));

  const seen = new Set();
  const images = [];
  runs.forEach((d) => {
    const list = Array.isArray(d && d.images) ? d.images : [];
    list.forEach((it) => {
      const u = typeof it === 'string' ? it : (it && it.url) || '';
      if (!u || seen.has(u) || !looksLikePhoto(u)) return;
      seen.add(u);
      images.push(u);
    });
  });
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.status(200).json({ images: images.slice(0, 48), count: Math.min(images.length, 48) });
};
