// api/breaking-news.js — v525
// يجلب آخر الأخبار العاجلة والتحذيرات من Tavily ويصنّفها حسب خطورتها
// يُخزَّن السيرفر نتيجة البحث 5 دقائق حتى لا نستهلك الـ API عند كل مستخدم
'use strict';

// ذاكرة مؤقتة على مستوى الـ instance (في Vercel كل cold-start تصفير)
let _cache = null;
let _cacheTs = 0;
const CACHE_MS = 5 * 60 * 1000; // 5 دقائق

// كلمات مفتاحية لتحديد مستوى الخطورة
const EMERGENCY_RE = /طوار[ئئي]|تحذير.*عسكر|صاروخ|قصف|هجوم|كارثة|زلزال.*قوي|إخلاء|تحذير طارئ|missile|emergency alert|evacuation|explosion|attack|disaster/i;
const BREAKING_RE  = /عاجل|خبر.*عاجل|عاجلاً|بيان.*رسمي|وفاة|اغتيال|انقلاب|breaking|urgent|just in|developing/i;

// v-alerts-clean: نصّ Tavily خام يجيب معه فضلات الصفحة (قوائم روابط جانبية،
// Weather Today / Live Score...). نبني المقتطف من جُمل مكتملة فقط —
// أي شظية بدون علامة ترقيم نهائية أو قصيرة جداً تُهمل.
function cleanSnippet(raw){
  const txt = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!txt) return '';
  const parts = txt.match(/[^.!?؟…]+[.!?؟…]+/g) || [];
  const good = [];
  for (const p of parts) {
    const s = p.trim();
    if (s.length < 30) continue; // فتات
    if (/weather today|live score|horoscope|latest news|top news|also read|read more|advertisement/i.test(s)) continue;
    good.push(s);
    if (good.join(' ').length > 280) break;
  }
  return good.join(' ').slice(0, 400);
}

const NEWS_KV_KEY = 'news:breaking:v1';

// v-news-push: الجلب مشترك بين الواجهة وكرون التنبيهات، وذاكرة Redis 5 دقائق
// تمنع استدعاء Tavily عند كل نبضة (كل cold-start يصفّر ذاكرة العملية).
async function fetchBreaking() {
  if (_cache && (Date.now() - _cacheTs) < CACHE_MS) return _cache;
  try {
    const { kvGetRaw } = require('./_lib/kv.js');
    const raw = await kvGetRaw(NEWS_KV_KEY);
    if (raw) { const c = JSON.parse(raw); if (c && Array.isArray(c.items)) { _cache = c; _cacheTs = Date.now(); return c; } }
  } catch (e) { /* guard-ok: بلا Redis نجلب مباشرة */ }
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return { items: [], fetchedAt: Date.now() };

    // بحثان متوازيان: واحد عربي وواحد إنجليزي
    const [arRes, enRes] = await Promise.all([
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: 'عاجل طوارئ تحذير الإمارات خبر عاجل الآن',
          topic: 'news',
          days: 1,
          max_results: 5,
          search_depth: 'basic',
        }),
      }),
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: 'UAE breaking news emergency alert warning today',
          topic: 'news',
          days: 1,
          max_results: 5,
          search_depth: 'basic',
        }),
      }),
    ]);

    const arData = arRes.ok ? await arRes.json() : { results: [] };
    const enData = enRes.ok ? await enRes.json() : { results: [] };

    const rawResults = [
      ...(arData.results || []),
      ...(enData.results || []),
    ];

    // إزالة التكرارات وتصنيف الأخبار
    const seen = new Set();
    const items = [];
    for (const r of rawResults) {
      const id = (r.url || r.title || '').slice(0, 80);
      if (seen.has(id)) continue;
      seen.add(id);
      // v-alerts-clean: التصنيف من العنوان فقط — نصّ الصفحة الكامل يحتوي
      // غالباً كلمات مثل attack/breaking في أخبار جانبية فيطلع إنذار كاذب
      const text = (r.title || '');
      const level = EMERGENCY_RE.test(text) ? 'emergency' : BREAKING_RE.test(text) ? 'breaking' : null;
      if (!level) continue; // نتجاهل الأخبار العادية
      items.push({
        id,
        title: (r.title || '').trim().slice(0, 200),
        snippet: cleanSnippet(r.content),
        url: r.url || '',
        publishedDate: r.published_date || '',
        level, // 'emergency' | 'breaking'
      });
    }

    // الأطوارئ أولاً
    items.sort((a, b) => (a.level === 'emergency' ? -1 : 1) - (b.level === 'emergency' ? -1 : 1));

  _cache = { items, fetchedAt: Date.now() };
  _cacheTs = Date.now();
  try { const { kvSetRaw } = require('./_lib/kv.js'); await kvSetRaw(NEWS_KV_KEY, JSON.stringify(_cache), 300); } catch (e) { /* guard-ok */ }
  return _cache;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  try {
    const hit = !!(_cache && (Date.now() - _cacheTs) < CACHE_MS);
    const data = await fetchBreaking();
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    res.json(data);
  } catch (e) {
    res.status(500).json({ items: [], error: String(e && e.message || e) });
  }
};
module.exports.fetchBreaking = fetchBreaking;
