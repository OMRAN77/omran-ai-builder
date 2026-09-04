// v-decor-gallery (طلب المالك: «اسحب الصور… صور كثيرة وتصاميم» كما في Pinterest):
// معرض أفكار من صور حقيقية على الويب لنوع مكان أو وصف حرّ. عدّة استعلامات
// متوازية على Tavily مع include_images ثم دمج وإزالة التكرار — عشرات الصور في
// ثوانٍ، بلا استهلاك لحصّة توليد الصور.
// v-ideas-resilient (شكوى المالك ٤ سبتمبر «الأفكار كانت شغالة والحين بطلت»): Tavily يرفض
// بـ432 عند نفاد حصّة الخطة (سبق أن حدث في v611)، وكانت النتيجة «ما حصلت صورًا» بلا سبب.
// الآن: (١) ذاكرة مؤقتة ٢٤ ساعة لكل طلب — الضغطة المكرّرة لا تستهلك شيئًا،
// (٢) بديل Google صور (CSE searchType=image) عند رفض Tavily أو قلّة الصور،
// (٣) سبب الفشل يصل للواجهة (error:'provider') فتقول الحقيقة بدل «ما حصلت صورًا».
const TAVILY = 'https://api.tavily.com/search';
const crypto = require('crypto');

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
function norm(q) { return String(q || '').replace(/\s+/g, ' ').trim(); }

/* ── الذاكرة المؤقتة (Upstash عبر kv.js؛ غيابها لا يعطّل شيئًا) ── */
const CACHE_TTL = 24 * 3600;
function cacheKey(parts) { return 'ideas:v2:' + crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex'); }
async function cacheGet(key) { try { const { kvGetRaw } = require('./kv.js'); const raw = await kvGetRaw(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
async function cacheSet(key, obj) { try { const { kvSetRaw } = require('./kv.js'); await kvSetRaw(key, JSON.stringify(obj), CACHE_TTL); } catch (e) { /* guard-ok */ } }

/* ── جمع الصور: Tavily أولًا، وGoogle صور بديلًا/تكملة ── */
async function tavilyImages(queries, apiKey, state) {
  const runs = await Promise.all(queries.map(norm).filter(Boolean).map((q) => fetch(TAVILY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query: q, search_depth: 'basic', include_images: true, include_answer: false, max_results: 10 }),
    signal: AbortSignal.timeout(15000),
  }).then(async (r) => {
    if (r.ok) return r.json();
    state.tavilyFail = r.status || 1;
    return { images: [] };
  }).catch(() => { state.tavilyErr = true; return { images: [] }; })));
  const out = [];
  runs.forEach((d) => {
    const l = Array.isArray(d && d.images) ? d.images : [];
    l.forEach((it) => { const u = typeof it === 'string' ? it : (it && it.url) || ''; if (u) out.push(u); });
  });
  return out;
}
async function googleImages(queries, state) {
  const gKey = (process.env.GOOGLE_SEARCH_API_KEY || '').trim();
  const gCx = (process.env.GOOGLE_SEARCH_CX || '').trim();
  if (!gKey || !gCx) return [];
  const runs = await Promise.all(queries.map(norm).filter(Boolean).map((q) => fetch(
    'https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(gKey) + '&cx=' + encodeURIComponent(gCx) +
    '&searchType=image&num=10&safe=active&q=' + encodeURIComponent(q),
    { signal: AbortSignal.timeout(15000) }
  ).then(async (r) => {
    if (r.ok) return r.json();
    state.googleFail = r.status || 1;
    return {};
  }).catch(() => { state.googleErr = true; return {}; })));
  const out = [];
  runs.forEach((j) => { ((j && j.items) || []).forEach((it) => { if (it && it.link) out.push(it.link); }); });
  return out;
}
function dedupe(list, seen, images) {
  list.forEach((u) => { if (!u || seen.has(u) || !looksLikePhoto(u)) return; seen.add(u); images.push(u); });
}
/* wave1/wave2: استعلامات Tavily؛ gq: استعلامات Google (أقل عددًا — حصّتها ١٠٠/يوم) */
async function gather(apiKey, wave1, wave2, gq) {
  const state = {};
  const seen = new Set();
  const images = [];
  let source = 'tavily';
  dedupe(await tavilyImages(wave1, apiKey, state), seen, images);
  if (!state.tavilyFail && images.length < 24) dedupe(await tavilyImages(wave2, apiKey, state), seen, images);
  if (state.tavilyFail || images.length < 12) {
    const g = await googleImages(gq, state);
    if (g.length) { dedupe(g, seen, images); source = images.length && state.tavilyFail ? 'google' : 'mixed'; }
  }
  const out = { images: images.slice(0, 80), count: Math.min(images.length, 80), source };
  if (!images.length) {
    out.error = (state.tavilyFail || state.googleFail || state.tavilyErr || state.googleErr) ? 'provider' : 'none';
    out.detail = { tavily: state.tavilyFail || (state.tavilyErr ? 'net' : 'ok'), google: state.googleFail || (state.googleErr ? 'net' : ((process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX) ? 'ok' : 'off')) };
    console.warn('[design-ideas] no images', JSON.stringify(out.detail));
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const apiKey = (process.env.TAVILY_API_KEY || '').trim();
  const hasGoogle = !!((process.env.GOOGLE_SEARCH_API_KEY || '').trim() && (process.env.GOOGLE_SEARCH_CX || '').trim());
  if (!apiKey && !hasGoogle) { res.status(500).json({ error: 'Server is missing TAVILY_API_KEY' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  // v-cx-ideas: وضع المقاولات — نوع المبنى + ما يريد (واجهة/مخطط/داخلي…) + عدد الأدوار + الطراز
  if (String(body.mode || '') === 'construction') { return constructionIdeas(req, res, body, apiKey); }
  const place = String(body.place || '').trim();
  const text = cleanQ(body.q);
  const style = cleanQ(body.style);
  const subjectEn = text || PLACE_EN[place] || '';
  const subjectAr = text || PLACE_AR[place] || '';
  if (!subjectEn) { res.status(400).json({ error: 'Missing q or place' }); return; }

  const key = cacheKey(['decor', subjectEn, subjectAr, style]);
  const cached = await cacheGet(key);
  if (cached && cached.images && cached.images.length) { res.setHeader('Cache-Control', 'private, max-age=600'); res.status(200).json(cached); return; }

  // v-ideas-50 (طلب المالك: ٥٠ صورة على الأقل): موجتان من الاستعلامات —
  // الأولى ثمانية استعلامات متوازية، وإن لم تبلغ الصور الحدّ تُطلق الثانية.
  const wave1 = [
    subjectEn + ' interior design ideas ' + style,
    subjectEn + ' interior design inspiration photos',
    subjectAr + ' تصميم ديكور أفكار',
    subjectEn + ' modern luxury interior',
    subjectEn + ' decor pinterest ideas',
    subjectAr + ' ديكور فخم صور',
    subjectEn + ' interior 2025 trends',
    subjectAr + ' تصاميم حديثة',
  ];
  const wave2 = [
    subjectEn + ' classic interior design photos',
    subjectEn + ' minimalist interior design',
    subjectEn + ' interior design gallery',
    subjectAr + ' ديكور عصري',
    subjectAr + ' ديكور كلاسيك',
    subjectEn + ' cozy interior ideas',
    subjectEn + ' elegant interior design',
    subjectAr + ' أفكار ديكور ' + style,
  ];
  const gq = [
    subjectEn + ' interior design ideas ' + style,
    subjectEn + ' interior design inspiration',
    subjectAr + ' ديكور تصميم',
    subjectEn + ' luxury interior photos',
  ];
  const out = await gather(apiKey, wave1, wave2, gq);
  if (out.images.length) await cacheSet(key, out);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.status(200).json(out);
};

const CX_TYPE = {
  villa: ['villa', 'فيلا'], apartment: ['residential apartment building', 'عمارة سكنية'], rest: ['rest house chalet', 'استراحة'],
  farm: ['farm house', 'مزرعة'], annexhome: ['residential annex', 'ملحق سكني'], office: ['office building', 'مبنى مكاتب'],
  shop: ['retail shop', 'محل تجاري'], mall: ['shopping mall', 'مجمع تجاري'], warehouse: ['warehouse', 'مستودع'],
  mosque: ['mosque', 'مسجد'], school: ['school building', 'مدرسة'], hall: ['wedding hall', 'صالة أفراح'],
};
const CX_FLOORS = { g: ['single storey one floor', 'دور أرضي'], g1: ['two storey double floor', 'دورين'], g2: ['three storey', 'ثلاثة أدوار'] };
const CX_VIEW = {
  exterior: ['exterior facade elevation design', 'واجهة خارجية'], plan: ['floor plan layout', 'مخطط'],
  interior: ['interior design', 'تصميم داخلي'], majlis: ['outdoor majlis design', 'مجلس خارجي'],
  garden: ['garden landscape and swimming pool design', 'حديقة ومسبح'], entrance: ['main entrance gate design', 'مدخل وبوابة'],
};
const CX_STYLE = { modern: ['modern', 'مودرن'], classic: ['classic', 'كلاسيك'], najdi: ['najdi', 'نجدي'], islamic: ['islamic', 'إسلامي'], andalusian: ['andalusian', 'أندلسي'], minimal: ['minimal', 'بسيط'] };

async function constructionIdeas(req, res, body, apiKey) {
  const t = CX_TYPE[String(body.type || '')] || CX_TYPE.villa;
  const f = CX_FLOORS[String(body.floors || '')] || ['', ''];
  const v = CX_VIEW[String(body.view || '')] || CX_VIEW.exterior;
  const st = CX_STYLE[String(body.style || '')] || ['', ''];
  const free = cleanQ(body.q);
  const en = (extra) => [st[0], f[0], t[0], v[0], free, extra].filter(Boolean).join(' ');
  const ar = (extra) => [free, 'تصميم', v[1], t[1], f[1], st[1], extra].filter(Boolean).join(' ');
  const key = cacheKey(['cx', t[0], f[0], v[0], st[0], free]);
  const cached = await cacheGet(key);
  if (cached && cached.images && cached.images.length) { res.setHeader('Cache-Control', 'private, max-age=600'); res.status(200).json(cached); return; }
  const wave1 = [en('design ideas'), en('photos'), ar(''), en('architecture'), ar('صور'), en('3d render'), ar('حديث'), en('inspiration')];
  const wave2 = [en('elevation'), en('pinterest'), ar('نماذج'), en('luxury'), ar('فخم'), en('gallery'), ar('أفكار'), en('real photo')];
  const gq = [en('design'), en('photos'), ar(''), en('architecture')];
  const out = await gather(apiKey, wave1, wave2, gq);
  if (out.images.length) await cacheSet(key, out);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.status(200).json(out);
}
