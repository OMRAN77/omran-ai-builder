// Vercel Serverless Function: live internet search via Tavily's API, using the
// site owner's own server-side API key (TAVILY_API_KEY env var). Used by Maha
// (mها) to answer questions that need real-time information (weather, news,
// sports scores, prices, current events, etc.) instead of relying only on the
// model's static training knowledge.
//
// Metered (owner's own TAVILY_API_KEY / Google Search key): logged-in users
// and guests are capped per day; callers without a token/guestId (today's
// frontend) are metered by IP instead of blocked, so nothing breaks. Owner
// account unlimited.
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');
const SEARCH_DAILY_LIMIT = 40;

/**
 * Reorders merged search results by actual relevance to the question.
 * Falls back silently to the original order when no key is set or the call fails.
 */
async function rerankResults(query, results, topN) {
  const key = (process.env.COHERE_API_KEY || '').trim();
  if (!key || !Array.isArray(results) || results.length < 4) return results;

  const docs = results.map((r) =>
    [r.title || '', (r.content || '').slice(0, 1200)].filter(Boolean).join(' — ').slice(0, 1500)
  );

  try {
    const res = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.COHERE_RERANK_MODEL || 'rerank-v3.5',
        query: String(query || '').slice(0, 1000),
        documents: docs,
        top_n: Math.min(topN || 15, docs.length),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return results;
    const data = await res.json();
    const ranked = Array.isArray(data && data.results) ? data.results : [];
    if (!ranked.length) return results;

    const out = [];
    for (const item of ranked) {
      const src = results[item.index];
      if (src) out.push(Object.assign({}, src, { relevance: item.relevance_score }));
    }
    const kept = new Set(ranked.map((x) => x.index));
    results.forEach((r, i) => { if (!kept.has(i)) out.push(r); });
    return out;
  } catch (e) {
    return results;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing TAVILY_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
    }
    const query = (body && body.query || '').toString().trim();
    if (!query) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }

    // 🧭 Smart search router: when body.classify is true, don't search -
    // just decide (via a tiny fast Groq/Mistral call) whether this question
    // actually needs live internet info. Returns {search:true|false}.
    // Meaning-based like ChatGPT: people, companies, products, social
    // accounts, phone numbers, listings, prices, news, anything real-world
    // specific => YES. Chit-chat, coding, writing, math, translations => NO.
    // Questions about "عمران/Omran" (this app) => always NO (identity rule).
    // On any error: {search:false} so behavior degrades to the old keyword
    // heuristic handled client-side. Free: doesn't consume the daily limit.
    if (body && body.classify) {
      if (/عمران|omran/i.test(query)) { res.status(200).json({ search: false }); return; }
      const clsPrompt = 'You are a web-search router. Decide if answering the user message requires a LIVE internet search for real-world/current facts.\nAnswer YES if it asks about: a person, company, shop, brand, product, app (other than this one), social media account/profile, phone number or contact info, an ad/listing (car, house, item for sale), place, event, price, news, weather, sports, or anything the answer could be wrong without checking the web.\nAnswer NO if it is: greetings/chit-chat, opinions, coding/building apps, writing/translation/summarization, math/logic, general timeless knowledge (science, history, definitions), or questions about this app itself.\nReply with exactly one word: YES or NO.\nUser message: ' + query.slice(0, 500);
      const callCls = async (url, key, model) => {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: clsPrompt }], max_tokens: 3, temperature: 0 }),
        });
        if (!r.ok) throw new Error('cls ' + r.status);
        const j = await r.json();
        return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim().toUpperCase();
      };
      let verdict = '';
      try {
        verdict = await callCls('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, 'llama-3.1-8b-instant');
      } catch (e1) {
        try {
          verdict = await callCls('https://api.mistral.ai/v1/chat/completions', process.env.MISTRAL_API_KEY, 'mistral-small-latest');
        } catch (e2) { verdict = ''; }
      }
      res.status(200).json({ search: verdict.indexOf('YES') === 0 });
      return;
    }

    const usage = await checkAndConsumeCustom(body && body.token, body && body.guestId, clientIp(req), 'search', SEARCH_DAILY_LIMIT);
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
        return;
      }
      res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + SEARCH_DAILY_LIMIT + ') للبحث. حاول لاحقًا.' });
      return;
    }
    // v360 — 🌍 كشف دولة المستخدم من الشبكة لتوجيه البحث الحي عالميًا.
    const geoCode = (req.headers && (req.headers['x-vercel-ip-country'] || req.headers['x-country']) || '').toString().trim().toUpperCase();
    let geoNameEn = '', geoNameAr = '';
    if (/^[A-Z]{2}$/.test(geoCode)) {
      try { geoNameEn = new Intl.DisplayNames(['en'], { type: 'region' }).of(geoCode) || ''; } catch (e) {}
      try { geoNameAr = new Intl.DisplayNames(['ar'], { type: 'region' }).of(geoCode) || ''; } catch (e) {}
    }
    const wantImages = !!(body && body.images);
    const wantDeep = !!(body && body.deep);
    const domains = Array.isArray(body && body.domains)
      ? body.domains.filter(d => typeof d === 'string' && /^[a-z0-9.-]+$/i.test(d)).slice(0, 5)
      : null;

    // v384: 🔬 Deep Research — بحث عميق بعدة زوايا: يولّد 3-5 استعلامات فرعية
    // عبر Groq ثم يبحث بالتوازي ويدمج النتائج المكررة.
    if (wantDeep) {
      const geoSuffix = (geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE');
      // 1) توليد استعلامات فرعية بـ Groq
      let subQueries = [query];
      try {
        const sqPrompt = 'Given this user question, generate 4 different search queries that explore different angles of the topic to build a comprehensive answer. Return ONLY a JSON array of strings in the same language as the question, nothing else.\nQuestion: ' + query.slice(0, 500);
        const sqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
          body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: sqPrompt }], max_tokens: 300, temperature: 0.3 }),
        });
        if (sqResp.ok) {
          const sqJ = await sqResp.json();
          const sqContent = (sqJ.choices && sqJ.choices[0] && sqJ.choices[0].message && sqJ.choices[0].message.content || '').trim();
          // Extract JSON array from response (may have markdown wrapping)
          const sqMatch = sqContent.match(/\[[\s\S]*\]/);
          if (sqMatch) {
            const parsed = JSON.parse(sqMatch[0]);
            if (Array.isArray(parsed) && parsed.length) subQueries = [query, ...parsed.filter(q => typeof q === 'string').slice(0, 4)];
          }
        }
      } catch (e) { /* fallback: just original query */ }

      // 2) بحث بالتوازي
      const deepResults = await Promise.all(subQueries.map(q =>
        fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query: q + ' ' + geoSuffix,
            search_depth: 'advanced',
            include_answer: true,
            include_images: wantImages,
            max_results: 5,
          }),
        }).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
      ));

      // 3) دمج وإزالة التكرار
      const seenUrls = new Set();
      let mergedResults = [];
      const answers = [];
      const allImages = [];
      for (const d of deepResults) {
        if (d.answer) answers.push(d.answer);
        if (Array.isArray(d.results)) {
          for (const r of d.results) {
            if (r && r.url && !seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              mergedResults.push({ title: r.title || '', url: r.url, content: (r.content || '').slice(0, 800) });
            }
          }
        }
        if (wantImages && Array.isArray(d.images)) allImages.push(...d.images);
      }

      // 3.5) ترتيب النتائج بالأهمية الحقيقية قبل قصّها (Cohere Rerank)
      mergedResults = await rerankResults(query, mergedResults, 15);

      // 4) مصادر مُنقّحة
      const deepSources = [];
      const seenHosts = new Set();
      mergedResults.forEach(r => {
        if (deepSources.length >= 10) return;
        let host = '';
        try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch (e) { return; }
        if (!host || seenHosts.has(host)) return;
        seenHosts.add(host);
        deepSources.push({ title: r.title || host, url: r.url });
      });

      res.status(200).json({
        answer: answers[0] || '',
        deepAnswers: answers,
        results: mergedResults.slice(0, 15),
        sources: deepSources,
        images: wantImages ? [...new Set(allImages)].slice(0, 6) : [],
        deep: true,
      });
      return;
    }

    // 🏠 dep59: deep listings search — real-estate / car / job queries get an
    // "advanced" Tavily search restricted to UAE listing portals, pulling more
    // results with longer content so the AI can present ACTUAL current listings
    // (title, price, area, direct link) instead of telling the user to go
    // browse the sites himself.
    const isListing = !domains && /عقار|شق(ة|ق|تين)|فيلا|فلل|أرض للبيع|ارض للبيع|للبيع|للايجار|للإيجار|إيجار|ايجار|محل تجاري|مكتب للـ|سياره|سيارة|سيارات|سيرات|سياير|اجار|آجار|تأجير|تاجير|استئجار|rent a car|car rental|وظيفة|وظائف|توظيف|apartment|villa|property|for sale|for rent|listing|car for|job vacanc|طيران|تذكرة|تذاكر|رحلة إلى|رحله الى|رحلات|flight|air ticket|airfare|فندق|فنادق|منتجع|منتجعات|شاليه|شاليهات|hotel|resort/i.test(query);
    const listingDomains = /طيران|تذكرة|تذاكر|رحلة|رحله|رحلات|flight|air ticket|airfare/i.test(query)
      ? ['skyscanner.ae', 'skyscanner.net', 'wego.ae', 'wego.com', 'kayak.ae', 'cheapflights.ae']
      : /فندق|فنادق|منتجع|منتجعات|شاليه|شاليهات|hotel|resort/i.test(query)
      ? ['booking.com', 'agoda.com', 'hotels.com', 'airbnb.com', 'almosafer.com', 'wego.ae']
      : /وظيفة|وظائف|توظيف|job/i.test(query)
      ? ['bayt.com', 'dubizzle.com', 'indeed.ae', 'naukrigulf.com', 'gulftalent.com']
      : (/سيار|سيرات|سياير|car/i.test(query) && /اجار|آجار|تأجير|تاجير|استئجار|rent/i.test(query))
        ? ['oneclickdrive.com', 'selfdrive.ae', 'dubizzle.com', 'yallamotor.com']
      : /سيار|سيرات|سياير|car/i.test(query)
        ? ['dubizzle.com', 'dubicars.com', 'yallamotor.com', 'cars24.ae', 'autotraders.ae']
        : ['bayut.com', 'dubizzle.com', 'propertyfinder.ae'];

    const lang = (body && body.lang || 'ar').toString().slice(0, 2);
    const gnHl = lang === 'ar' ? 'ar' : 'en-US';
    const gnGl = /^[A-Z]{2}$/.test(geoCode) ? geoCode : (lang === 'ar' ? 'AE' : 'US');
    const gnCeid = gnGl + ':' + (lang === 'ar' ? 'ar' : 'en');
    const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${gnHl}&gl=${gnGl}&ceid=${gnCeid}`;

    const gKey = process.env.GOOGLE_SEARCH_API_KEY;
    const gCx = process.env.GOOGLE_SEARCH_CX;
    const googleUrl = (gKey && gCx)
      ? `https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&q=${encodeURIComponent(query)}&num=3`
      : null;

    const [tavilyResp, newsResp, googleResp] = await Promise.all([
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: (/سعود|إمارات|الامارات|دبي|أبوظبي|ابوظبي|الشارقة|عجمان|مصر|قطر|كويت|عمان|بحرين|أردن|saudi|uae|dubai|abu dhabi|sharjah|egypt|qatar|kuwait|oman|bahrain|jordan|usa|america|uk|india|pakistan/i.test(query) ? query : query + ' ' + (geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE')),
          country: (geoNameEn ? geoNameEn.toLowerCase() : 'united arab emirates'),
          search_depth: isListing ? 'advanced' : 'basic',
          include_answer: true,
          include_images: wantImages,
          max_results: isListing ? 10 : (domains ? 5 : 3),
          ...(isListing ? { include_domains: listingDomains } : (domains ? { include_domains: domains } : {})),
        }),
      }),
      fetch(newsUrl).catch(() => null),
      googleUrl ? fetch(googleUrl).catch(() => null) : Promise.resolve(null),
    ]);

    if (!tavilyResp.ok) {
      const errText = await tavilyResp.text().catch(() => '');
      res.status(502).json({ error: 'Search provider error', detail: errText });
      return;
    }

    const data = await tavilyResp.json();
    // dep61: distinguish individual ad/detail pages from generic category/search pages
    // so the AI never labels a category page as "رابط الإعلان".
    const isDetailUrl = (u) => /bayut\.com\/(ar\/)?property\/|details-\d+\.html|propertyfinder\.ae\/(ar\/|en\/)?plp\/|dubizzle\.com\/.+\/\d{4}\/\d{1,2}\/\d{1,2}\/|---[a-zA-Z0-9]+\/?$|\/ad\/|dubizzle\.com\/.+\/j\/|dubicars\.com\/.+-\d+|yallamotor\.com\/.+\/\d{4,}|cars24\.ae\/.+-\d{4,}|bayt\.com\/.+\/jobs?\/.+\d|indeed\.(ae|com)\/.*(viewjob|jk=)|naukrigulf\.com\/.+-\d|gulftalent\.com\/.+\/\d/i.test(u || '');
    if (isListing && Array.isArray(data.results)) {
      // drop results from domains outside the listing portals (Tavily sometimes leaks others)
      const onPortal = data.results.filter(r => listingDomains.some(d => (r.url || '').includes(d)));
      if (onPortal.length >= 3) data.results = onPortal;
    }
    const isFlight = /طيران|تذكرة|تذاكر|رحلة إلى|رحله الى|رحلات|flight|air ticket|airfare/i.test(query);
    if (isFlight && Array.isArray(data.results)) {
      // Google Flights has no public API, but its ?q= deep link parses natural
      // language and opens directly on live prices for the requested route.
      data.results.unshift({
        title: '📌 قارن الأسعار الحية لرحلتك على Google Flights (أدق مصدر للأسعار)',
        url: 'https://www.google.com/travel/flights?q=' + encodeURIComponent(query) + '&hl=ar&curr=AED',
        content: 'رابط مباشر يفتح نتائج رحلتك على Google Flights بالأسعار الحية المحدثة لحظة بلحظة، مرتبة من الأرخص.'
      });
    }
    let results = Array.isArray(data.results) ? data.results.slice(0, isListing ? 8 : 3).map(r => ({
      title: (isListing && !/^📌|^🔍/.test(r.title || '') ? (isDetailUrl(r.url) ? '📌 إعلان مباشر: ' : '🔍 صفحة بحث: ') : '') + (r.title || ''),
      url: r.url,
      content: (r.content || '').slice(0, isListing ? 1200 : 350),
    })) : [];
    if (isListing) results.sort((a, b) => (b.title.startsWith('📌') ? 1 : 0) - (a.title.startsWith('📌') ? 1 : 0));

    let newsItems = [];
    try {
      if (newsResp && newsResp.ok) {
        const xml = await newsResp.text();
        const itemBlocks = xml.split('<item>').slice(1, 4);
        newsItems = itemBlocks.map(block => {
          const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
          const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
          const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
          const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
          return title ? {
            title,
            url: linkMatch ? linkMatch[1].trim() : '',
            content: pubMatch ? `Google News - ${pubMatch[1].trim()}` : 'Google News',
          } : null;
        }).filter(Boolean);
      }
    } catch (e) { /* ignore Google News parse errors, non-critical */ }

    const images = wantImages && Array.isArray(data.images) ? data.images.slice(0, 4) : [];

    let googleItems = [];
    try {
      if (googleResp && googleResp.ok) {
        const gData = await googleResp.json();
        googleItems = Array.isArray(gData.items) ? gData.items.slice(0, 3).map(it => ({
          title: it.title,
          url: it.link,
          content: (it.snippet || '').slice(0, 350),
        })) : [];
      }
    } catch (e) { /* ignore Google Search parse errors, non-critical */ }

    // 📚 Feature ②: unified, deduped source list (title+url) built from all
    // three providers (Tavily results, Google Custom Search, Google News) so
    // the frontend can render clean ChatGPT-style source badges without
    // re-implementing this merge/dedupe logic itself. Backward-compatible:
    // purely additive field, existing consumers (results/google/news/images)
    // are untouched.
    const sources = [];
    try {
      const seenHosts = new Set();
      [...results, ...googleItems, ...newsItems].forEach(r => {
        if (!r || !r.url) return;
        let host = '';
        try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch (e) { return; }
        if (!host || seenHosts.has(host)) return;
        seenHosts.add(host);
        sources.push({ title: (r.title || host).replace(/^📌\s*إعلان مباشر:\s*|^🔍\s*صفحة بحث:\s*/, ''), url: r.url });
      });
    } catch (e) { /* non-critical, sources stay whatever was collected so far */ }

    res.status(200).json({
      answer: data.answer || '',
      results,
      google: googleItems,
      news: newsItems,
      images,
      sources: sources.slice(0, 6),
    });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', detail: String(err && err.message || err) });
  }
};
