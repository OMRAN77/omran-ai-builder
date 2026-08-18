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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // هل النتيجة المخزّنة لا تزال طازجة؟
  if (_cache && (Date.now() - _cacheTs) < CACHE_MS) {
    res.setHeader('X-Cache', 'HIT');
    res.json(_cache);
    return;
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) { res.status(500).json({ items: [] }); return; }

  try {
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
      const text = (r.title || '') + ' ' + (r.content || '');
      const level = EMERGENCY_RE.test(text) ? 'emergency' : BREAKING_RE.test(text) ? 'breaking' : null;
      if (!level) continue; // نتجاهل الأخبار العادية
      items.push({
        id,
        title: (r.title || '').trim().slice(0, 200),
        snippet: (r.content || '').trim().slice(0, 400),
        url: r.url || '',
        publishedDate: r.published_date || '',
        level, // 'emergency' | 'breaking'
      });
    }

    // الأطوارئ أولاً
    items.sort((a, b) => (a.level === 'emergency' ? -1 : 1) - (b.level === 'emergency' ? -1 : 1));

    _cache = { items, fetchedAt: Date.now() };
    _cacheTs = Date.now();

    res.setHeader('X-Cache', 'MISS');
    res.json(_cache);
  } catch (e) {
    res.status(500).json({ items: [], error: String(e && e.message || e) });
  }
};
