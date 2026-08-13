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

// مصدر محذوف بقرار المالك: لا يُطلب مباشرةً ولا يُسمح له بالمرور من مزوّد آخر.
const REMOVED_SOURCE_HOST = 'news.google.com';
function isRemovedSearchSource(item) {
  try {
    const host = new URL(item && item.url || '').hostname.toLowerCase().replace(/^www\./, '');
    return host === REMOVED_SOURCE_HOST || host.endsWith('.' + REMOVED_SOURCE_HOST);
  } catch (e) {
    return false;
  }
}
function withoutRemovedSearchSources(items) {
  return (Array.isArray(items) ? items : []).filter(item => !isRemovedSearchSource(item));
}
const REMOVED_SOURCE_TEXT_RE = /(?:https?:\/\/)?(?:www\.)?news\.google\.com(?:\/[^\s<>()\]]*)?/gi;
function withoutRemovedSourceMentions(value) {
  return String(value || '').replace(REMOVED_SOURCE_TEXT_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Reorders merged search results by actual relevance to the question.
 *
 * Without this, results from 4-5 parallel sub-queries are concatenated in
 * whatever order they arrived and then truncated — so a genuinely good hit
 * sitting at position 23 is never seen by the model. Cohere Rerank is built
 * for exactly this and it is one call.
 *
 * Two wins, not one: better answers, and fewer tokens sent downstream because
 * 5 strong results replace 20 mediocre ones.
 *
 * Falls back silently to the original order when no key is set or the call
 * fails — search must never break because reranking is unavailable.
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
    // Anything the reranker dropped is appended, so nothing is silently lost.
    const kept = new Set(ranked.map((x) => x.index));
    results.forEach((r, i) => { if (!kept.has(i)) out.push(r); });
    return out;
  } catch (e) {
    return results;
  }
}

// v536: 📱 حسابات التواصل الاجتماعي على نفس موضوع البحث.
// مُقاس حيًّا: Tavily يُرجع **صفر** نتيجة عند تقييده بـ include_domains على
// منصّات التواصل، لكنه يُرجع الحسابات بدقّة حين تُذكر المنصّات داخل نص
// الاستعلام. لذلك: استدعاء موازٍ مستقل + ترشيح بالمضيف + تفضيل صفحات
// الحسابات على المنشورات المفردة. فشله لا يؤثّر على أي مصدر آخر.
const SOCIAL_PLATFORMS = [
  { host: 'instagram.com', name: 'إنستغرام', acct: /^\/([A-Za-z0-9._]{2,40})\/?$/ },
  { host: 'tiktok.com',    name: 'تيك توك',  acct: /^\/(@[A-Za-z0-9._]{2,40})\/?$/ },
  { host: 'x.com',         name: 'إكس',      acct: /^\/([A-Za-z0-9_]{2,15})\/?$/ },
  { host: 'twitter.com',   name: 'إكس',      acct: /^\/([A-Za-z0-9_]{2,15})\/?$/ },
  { host: 'youtube.com',   name: 'يوتيوب',   acct: /^\/(@[A-Za-z0-9._-]{2,40}|c\/[^/]+|channel\/[^/]+|user\/[^/]+)\/?$/ },
  { host: 'facebook.com',  name: 'فيسبوك',   acct: /^\/([A-Za-z0-9.]{3,50})\/?$/ },
  { host: 'snapchat.com',  name: 'سناب شات', acct: /^\/add\/([A-Za-z0-9._-]{2,40})\/?$/ },
];

// يلتقط روابط المنصّات من أي قائمة نتائج ويسمّيها بالعربي.
function pickSocial(items) {
    const out = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach(it => {
      let u;
      try { u = new URL(it && it.url); } catch (e) { return; }
      const host = u.hostname.replace(/^(www|m|mobile)\./, '');
      const plat = SOCIAL_PLATFORMS.find(sp => host === sp.host || host.endsWith('.' + sp.host));
      if (!plat) return;
      const m = u.pathname.match(plat.acct);
      const handle = m ? m[1].replace(/^(c|channel|user)\//, '') : '';
      // مُقاس على الإنتاج: درجة Tavily تفصل بدقّة بين الصلة والضجيج
      // (مطعم برجر «جدة» = 0.45 · حساب رسمي @AlWaslSC = 0.40). لذلك عتبتان.
      const sc = (typeof it.score === 'number') ? it.score : null;
      if (sc !== null && sc < (handle ? 0.38 : 0.50)) return;
      // منشور لا حساب: الميزة اسمها «حسابات التواصل»، وبطاقة منشور تظهر بعنوان
      // مبتور بلا معنى («#viral #fyp…»). بلا معرّف يُرفض المنشور، ومع معرّف
      // يُقصّ الرابط إلى صفحة الحساب نفسها — وهذا يسقط ?hl=en ويوحّد الروابط.
      const isPost = /^\/(p|reel|reels|tv|status|video|watch|shorts|photo|posts|stories)(\/|$)/i.test(u.pathname);
      if (isPost && !handle) return;
      const acctUrl = m ? (u.origin + u.pathname.slice(0, m.index + m[0].length)) : it.url;
      const key = plat.name + '|' + (handle || u.pathname);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        platform: plat.name,
        isAccount: !!handle,
        url: acctUrl,
        score: (typeof it.score === 'number' ? it.score : null),
        title: plat.name + ' · ' + (
          // معرّف قناة يوتيوب الخام (UC…) ليس اسمًا يُعرض؛ نرجع لعنوان الصفحة.
          (handle && !/^UC[A-Za-z0-9_-]{16,}$/.test(handle))
            ? (handle.charAt(0) === '@' ? handle : '@' + handle)
            : (((it.title || '').replace(/\s*[|\-–—]\s*(YouTube|Instagram|TikTok|Facebook|X)\s*$/i, '').trim() || 'منشور').slice(0, 34))
        ),
      });
    });
    return out;
}

// v536b: مُقاس — إلحاق كلمات المنصّات باستعلام يذكر «حسابات/التواصل الاجتماعي»
// أصلًا يُنتج ركامًا يعيد مقالات عامّة عن السوشال ميديا بدل حسابات الموضوع.
// لذلك نجرّد السؤال إلى موضوعه أوّلًا.
function socialQuery(query) {
  const topic = String(query || '')
    .replace(/^\s*(وش|ايش|أيش|شو|ما هي|ماهي|ما|من|كيف|وين|أين|what|which|who)\s+(هو|هي)?\s*/i, '')
    .replace(/(^|\s)(ابي|أبي|ابغى|أبغى|ابغا|اريد|أريد|بدي|بغيت|عايز|ودي|اعطني|أعطني|عطني|سوي|سو|اعمل|i want|give me)(?=\s|$)/gi, ' ')
    .replace(/حساب(ات)?|صفح(ة|ات)|التواصل الاجتماعي|السوشال|سوشال ميديا|social media|accounts?|official|الرسمي(ة)?|رسمي(ة)?|[?؟]/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return (topic.length >= 3 ? topic : String(query || '')).slice(0, 160)
    + ' instagram tiktok youtube official account';
}

async function fetchSocial(apiKey, query) {
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: socialQuery(query),
        search_depth: 'basic',
        include_answer: false,
        max_results: 12,
      }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return pickSocial(j.results);
  } catch (e) { return []; }
}

// يدمج مصدرين للسوشال، يزيل التكرار، ويقدّم صفحات الحسابات على المنشورات.
function mergeSocial(a, b) {
  const out = [];
  const seen = new Set();
  [...(a || []), ...(b || [])].forEach(sc => {
    if (!sc || seen.has(sc.url)) return;
    seen.add(sc.url);
    out.push(sc);
  });
  out.sort((x, y) => (y.isAccount ? 1 : 0) - (x.isAccount ? 1 : 0));
  return out.slice(0, 4);
}

// 📍 v542: Google Places API (New) — Text Search. سؤال «وين أحسن مطعم؟» جوابه
// اسمٌ وعنوانٌ وتقييم، لا مقالة. محرّك الويب العام لا يملك هذا؛ Places يملكه.
// شرط الرخصة: إسناد ظاهر «Google Maps» + لا تخزين — لذلك تُمرَّر حيّة ولا تُحفظ.
// فشلها صامت تمامًا: البحث العادي يكمل كأنّها لم تكن.
async function fetchPlaces(key, query, lang, regionCode) {
  if (!key) return [];
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': [
          'places.displayName', 'places.formattedAddress', 'places.rating',
          'places.userRatingCount', 'places.priceLevel', 'places.googleMapsUri',
          'places.websiteUri', 'places.currentOpeningHours.openNow',
          'places.primaryTypeDisplayName',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: String(query || '').slice(0, 300),
        languageCode: (lang === 'ar' ? 'ar' : 'en'),
        maxResultCount: 20,
        ...(/^[A-Z]{2}$/.test(regionCode || '') ? { regionCode } : {}),
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j.places) ? j.places : []).map((p) => ({
      name: (p.displayName && p.displayName.text) || '',
      address: p.formattedAddress || '',
      rating: (typeof p.rating === 'number') ? p.rating : null,
      reviews: p.userRatingCount || 0,
      price: (p.priceLevel || '').replace('PRICE_LEVEL_', '').toLowerCase(),
      type: (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || '',
      openNow: !!(p.currentOpeningHours && p.currentOpeningHours.openNow),
      url: p.googleMapsUri || '',
      site: p.websiteUri || '',
    })).filter((p) => p.name).slice(0, 20);
  } catch (e) { return []; }
}

// 🏷️ v556: أسماء مواقع المجالات كما هي مكتوبة في القوائم أعلاه. تُعرض حين
// يسقط مزوّد البحث، فيرى المستخدم مواقع مجاله لا روابط أخبار لا صلة لها.
const LISTING_SITE_AR = {
  'bayut.com': 'بايوت', 'dubizzle.com': 'دوبيزل', 'propertyfinder.ae': 'بروبرتي فايندر',
  'dubicars.com': 'دوبي كارز', 'yallamotor.com': 'يالا موتور', 'cars24.ae': 'كارز 24',
  'autotraders.ae': 'أوتو تريدرز', 'oneclickdrive.com': 'ون كليك درايف', 'selfdrive.ae': 'سيلف درايف',
  'booking.com': 'بوكينج', 'agoda.com': 'أجودا', 'hotels.com': 'هوتيلز', 'airbnb.com': 'إير بي إن بي',
  'almosafer.com': 'المسافر', 'wego.ae': 'ويجو', 'bayt.com': 'بيت', 'indeed.ae': 'إنديد',
  'naukrigulf.com': 'نوكري جلف', 'gulftalent.com': 'جلف تالنت', 'skyscanner.ae': 'سكاي سكانر',
  'skyscanner.net': 'سكاي سكانر', 'kayak.ae': 'كاياك', 'cheapflights.ae': 'تشيب فلايتس',
  'xplate.com': 'إكس بليت', 's-plate.com': 'إس بليت', 'souq.ma7room.com': 'سوق محروم',
  'uaedir.ae': 'دليل الإمارات', 'ae.opensooq.com': 'السوق المفتوح', 'barbahar.com': 'بربهار',
  'mourjan.com': 'مرجان',
};

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
      try { geoNameEn = new Intl.DisplayNames(['en'], { type: 'region' }).of(geoCode) || ''; } catch (e) { /* Intl لا يعرف رمز الدولة — يبقى الاسم فارغًا وهذا مقبول */ }
      try { geoNameAr = new Intl.DisplayNames(['ar'], { type: 'region' }).of(geoCode) || ''; } catch (e) { /* كسابقه */ }
    }
    const wantImages = !!(body && body.images);
    const wantDeep = !!(body && body.deep);
    const domains = Array.isArray(body && body.domains)
      ? body.domains.filter(d => typeof d === 'string' && /^[a-z0-9.-]+$/i.test(d)).slice(0, 5)
      : null;

    // v384: 🔬 Deep Research — بحث عميق بعدة زوايا: يولّد 3-5 استعلامات فرعية
    // عبر Groq ثم يبحث بالتوازي ويدمج النتائج المكررة.
    if (wantDeep) {
      // v467b: لا نضيف geo suffix إذا الاستعلام طويل (مُثرى بالسياق) — فيه سياق كافي
      const geoSuffix = query.length > 120 ? '' : ((geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE'));
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
      const deepSocialP = fetchSocial(apiKey, query);
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
      let mergedResults = []; // reassigned after reranking
      const answers = [];
      const allImages = [];
      for (const d of deepResults) {
        if (d.answer) answers.push(withoutRemovedSourceMentions(d.answer));
        if (Array.isArray(d.results)) {
          for (const r of d.results) {
            if (r && r.url && !seenUrls.has(r.url)) {
              seenUrls.add(r.url);
              mergedResults.push({
                title: withoutRemovedSourceMentions(r.title),
                url: r.url,
                content: withoutRemovedSourceMentions((r.content || '').slice(0, 800)),
              });
            }
          }
        }
        if (wantImages && Array.isArray(d.images)) allImages.push(...d.images);
      }

      // المصدر المحذوف لا يمرّ حتى لو أعاده Tavily ضمن نتائج البحث الموسّع.
      mergedResults = withoutRemovedSearchSources(mergedResults);

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

      const deepSocial = mergeSocial(await deepSocialP, pickSocial(mergedResults));
      deepSocial.forEach(sc => { if (deepSources.length < 14) deepSources.push({ title: sc.title, url: sc.url }); });
      res.status(200).json({
        answer: answers[0] || '',
        deepAnswers: answers,
        results: mergedResults.slice(0, 15),
        sources: deepSources,
        social: deepSocial,
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
    // v467b: طلب "رابط/مصدر/الموقع الرسمي" = المستخدم يبي المصدر الرسمي، مو مواقع حجز
    const __wantsOfficialSource = /رابط|روابط|مصدر|مصادر|المصدر|الموقع الرسمي|official|source|لينك|لنك/i.test(query);
    // v467b: "طيران" لوحدها = معلوماتي (عن شركة طيران)؛ "طيران" + كلمة حجز = حجز تذاكر
    const __hasBookingIntent = /تذكرة|تذاكر|حجز|احجز|بوكنج|رحلة إلى|رحله الى|رحلات إلى|book|booking|ticket/i.test(query);
    const __flightListing = /طيران|flight|airfare/i.test(query) && __hasBookingIntent;
    // v467c: إذا السياق/الاستعلام يذكر دولة غير الإمارات → لا نقفل على مواقع إماراتية
    const __foreignCountryRe = /نيبال|nepal|فلبين|فليبين|philippin|بنجلاديش|بنغلاديش|bangladesh|هند(?!سي)|india|باكستان|pakistan|سعودي|saudi|مصر|egypt|عمان(?! (ai|builder))|oman|قطر|qatar|كويت|kuwait|بحرين|bahrain|أردن|jordan|عراق|iraq|سوري|syria|يمن|yemen|لبنان|lebanon|ليبيا|libya|تونس|tunis|جزائر|algeria|مغرب|morocco|سودان|sudan|صومال|somal|تركي|turk|إيران|iran|أفغان|afghan|إندونيسي|indonesia|ماليزي|malays|تايلاند|thai|فيتنام|vietnam|كمبودي|cambodia|ميانمار|myanmar|سريلانك|sri lanka|كوري|korea|ياباني|japan|صين|china|روسي|russ|أمريك|americ|كند|canad|بريطان|british|uk|ألمان|german|فرنس|franc|إيطالي|ital|إسبان|spain|برتغال|portug|هولند|netherl|بلجيك|belg|سويسر|swiss|أسترال|austral|نيوزيلند|new zealand|برازيل|brazil|أرجنتين|argentin|مكسيك|mexic|كولومبي|colombi|تشيلي|chile|بيرو|peru|جنوب أفريقي|south afric|كيني|kenya|نيجيري|nigeria|غان|ghana|تنزاني|tanzania|أثيوبي|ethiopi|أوغند|uganda/i;
    const __hasForeignCountry = __foreignCountryRe.test(query);
    // v556: إذا ذكر المستخدم مجالًا صريحًا في رسالته نفسها => المجال يُحسم منها وحدها،
    // لا من السياق المحقون. يمنع تسرّب فرع (لوحات/عقار/سيارات/وظائف/فنادق) إلى سؤال مجال آخر.
    const __q0 = (body && body.q0 || '').toString().trim();
    const __DOM_RE = /لوح(ة|ات|تين)|رقم\s*مميز|[\u0623\u0627]رقام\s*مميزة|بليت|بلايت|plate|عقار|شق(ة|ق|تين)|فيلا|فلل|[\u0623\u0627]رض|اراضي|apartment|villa|property|سيار|سيرات|سياير|مركب|\bcars?\b|وظيف|وظائف|توظيف|\bjobs?\b|فندق|فنادق|منتجع|شاليه|hotel|resort|طيران|تذكرة|تذاكر|flight/i;
    const qb = (__q0 && __DOM_RE.test(__q0)) ? __q0 : query;
    // 🔢 v543: أسئلة اللوحات/الأرقام المميزة → موقعان فقط: xplate + SHub (s-plate).
    const NUMBERS_RE = /لوح(ة|ات|تين)\s*([أا]رقام|سيار|مركب|مرور|مميز|رقم|للبيع|دبي|أبوظبي|ابوظبي|الشارقة|عجمان|رأس الخيمة|راس الخيمة|أم القيوين|ام القيوين|الفجيرة)|[أا]?رقام(\s+\S+)?\s*مميزة|رقم(\s+\S+)?\s*مميز|[أا]رقام\s*(سيارات|سيارة|سيارتي|مركبات|مركبة|لوحات|لوحة|هواتف|هاتف|جوالات|جوال|موبايل|شرائح|شريحة|للبيع|مميز)|رقم\s*(سيارة|مركبة)\s*(للبيع|لي البيع)|رقم\s*(هاتف|جوال|موبايل)?\s*(vip|في اي بي)|بلايت|بليت|number plate|license plate|special number|vip number|plate for sale/i;
    const isNumbers = !domains && !__wantsOfficialSource && !__hasForeignCountry && NUMBERS_RE.test(qb);
    const isListing = isNumbers || (!domains && !__wantsOfficialSource && !__hasForeignCountry && (/عقار|شق(ة|ق|تين)|فيلا|فلل|أرض للبيع|ارض للبيع|للبيع|للايجار|للإيجار|إيجار|ايجار|محل تجاري|مكتب للـ|سياره|سيارة|سيارات|سيرات|سياير|اجار|آجار|تأجير|تاجير|استئجار|rent a car|car rental|وظيفة|وظائف|توظيف|apartment|villa|property|for sale|for rent|listing|car for|job vacanc|تذكرة|تذاكر|رحلة إلى|رحله الى|رحلات|air ticket|فندق|فنادق|منتجع|منتجعات|شاليه|شاليهات|hotel|resort/i.test(qb) || __flightListing));
    const listingDomains = isNumbers
      ? ['xplate.com', 's-plate.com', 'souq.ma7room.com', 'uaedir.ae', 'ae.opensooq.com', 'barbahar.com', 'mourjan.com']
      : /طيران|تذكرة|تذاكر|رحلة|رحله|رحلات|flight|air ticket|airfare/i.test(qb)
      ? ['skyscanner.ae', 'skyscanner.net', 'wego.ae', 'wego.com', 'kayak.ae', 'cheapflights.ae']
      : /فندق|فنادق|منتجع|منتجعات|شاليه|شاليهات|hotel|resort/i.test(qb)
      ? ['booking.com', 'agoda.com', 'hotels.com', 'airbnb.com', 'almosafer.com', 'wego.ae']
      : /وظيفة|وظائف|توظيف|job/i.test(qb)
      ? ['bayt.com', 'dubizzle.com', 'indeed.ae', 'naukrigulf.com', 'gulftalent.com']
      : (/سيار|سيرات|سياير|car/i.test(qb) && /اجار|آجار|تأجير|تاجير|استئجار|rent/i.test(qb))
        ? ['oneclickdrive.com', 'selfdrive.ae', 'dubizzle.com', 'yallamotor.com']
      : /سيار|سيرات|سياير|car/i.test(qb)
        ? ['dubizzle.com', 'dubicars.com', 'yallamotor.com', 'cars24.ae', 'autotraders.ae']
        : ['bayut.com', 'propertyfinder.ae'];

    const lang = (body && body.lang || 'ar').toString().slice(0, 2);

    // 📍 v542: كاشف أسئلة الأماكن. يُستثنى ما يخدمه محرّك القوائم أصلًا (عقار ·
    // سيارات · وظائف · فنادق · طيران) وما قُيّد بنطاقات، فلا تتغيّر نتيجة قائمة.
    const PLACES_RE = /مطعم|مطاعم|مطاعمه|مقهى|مقاهي|كافيه|كافيهات|كوفي|بوفيه|مخبز|مخابز|حلويات|صيدلي(ة|ات)|مستشفى|مستشفيات|عياد(ة|ات)|طبيب|أطباء|دكتور|أسنان|صالون|حلاق|مشغل|سبا|جيم|نادي رياضي|صالة رياضية|مول|مولات|أسواق|متجر|بقالة|سوبرماركت|هايبر|محطة وقود|بنزين|حديق(ة|ات)|متحف|متاحف|شاطئ|شواطئ|ملاهي|معلم سياحي|معالم|أماكن سياحية|وين أروح|وين اروح|أماكن|مسجد|مساجد|كنيسة|مدرسة|مدارس|حضانة|مغسلة|كراج|ورشة|restaurant|cafe|coffee shop|bakery|pharmacy|hospital|clinic|dentist|salon|barber|spa|gym|mall|supermarket|grocery|gas station|park|museum|beach|attraction|things to do|near me|قريب مني|قريبة مني|بالقرب/i;
    // 🏨 v555: الفنادق تُخدَم بخرائط جوجل أيضًا (أسماء وتقييمات فنادق حقيقيّة)
    // لا بمواقع الحجز وحدها. تبقى في محرّك القوائم كما هي.
    const HOTEL_RE = /فندق|فنادق|منتجع|منتجعات|شاليه|شاليهات|hotel|resort/i;
    const isPlaces = !domains && (PLACES_RE.test(query) || HOTEL_RE.test(query)) && (!isListing || HOTEL_RE.test(query));
    const placesKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();

    const gKey = process.env.GOOGLE_SEARCH_API_KEY;
    const gCx = process.env.GOOGLE_SEARCH_CX;
    const googleUrl = (gKey && gCx)
      ? `https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&q=${encodeURIComponent(query)}&num=3`
      : null;

    const [tavilyResp, googleResp, socialItems, placeItems] = await Promise.all([
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          // v467b: geo-suffix فقط للاستعلامات القصيرة بدون سياق. الاستعلامات المُثراة (طويلة) عندها سياق كافي.
          query: (/سعود|إمارات|الامارات|دبي|أبوظبي|ابوظبي|الشارقة|عجمان|مصر|قطر|كويت|عمان|بحرين|أردن|saudi|uae|dubai|abu dhabi|sharjah|egypt|qatar|kuwait|oman|bahrain|jordan|usa|america|uk|india|pakistan|فلبين|فليبين|philippin|هند|india|صين|china|يابان|japan|كور|korea|ترك|turk|ألمان|german|فرنس|franc|بريطان|british|إندونيس|indonesia|ماليز|malays|تايلا|thai|روس|russ|أمريك|americ|كند|canad|أسترال|austral/i.test(query) ? query : (query.length > 120 ? query : query + ' ' + (geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE'))),
          country: (geoNameEn ? geoNameEn.toLowerCase() : 'united arab emirates'),
          search_depth: isListing ? 'advanced' : 'basic',
          include_answer: true,
          include_images: wantImages,
          max_results: isListing ? 10 : (domains ? 5 : 3),
          ...(isListing ? { include_domains: listingDomains } : (domains ? { include_domains: domains } : {})),
        }),
      }),
      googleUrl ? fetch(googleUrl).catch(() => null) : Promise.resolve(null),
      fetchSocial(apiKey, query),
      isPlaces ? fetchPlaces(placesKey, query, lang, geoCode) : Promise.resolve([]),
    ]);

    // 🛡️ شبكة أمان: سقوط Tavily (حصّة · مفتاح · عطل مزوّد) كان يقطع البحث كلّه
    // بشاشة 502. الآن نُكمل بما جمعته المزوّدات الأخرى بالتوازي، و502 لا تُرجع
    // إلّا لو خلا الجميع. (مزوّد مجّانيّ بديل جُرّب وسقط: DuckDuckGo محجوب من
    // خوادم Vercel بـ403، وBing RSS يردّ 200 بنتائج لا صلة لها بالسؤال.)
    let tavilyDown = false;
    let data = { results: [] };
    if (tavilyResp.ok) {
      data = await tavilyResp.json();
    } else {
      tavilyDown = true;
    }
    data.results = withoutRemovedSearchSources(data.results);
    // dep61: distinguish individual ad/detail pages from generic category/search pages
    // so the AI never labels a category page as "رابط الإعلان".
    const isDetailUrl = (u) => /bayut\.com\/(ar\/)?property\/|details-\d+\.html|propertyfinder\.ae\/(ar\/|en\/)?plp\/|dubizzle\.com\/.+\/\d{4}\/\d{1,2}\/\d{1,2}\/|---[a-zA-Z0-9]+\/?$|\/ad\/|dubizzle\.com\/.+\/j\/|dubicars\.com\/.+-\d+|yallamotor\.com\/.+\/\d{4,}|cars24\.ae\/.+-\d{4,}|bayt\.com\/.+\/jobs?\/.+\d|indeed\.(ae|com)\/.*(viewjob|jk=)|naukrigulf\.com\/.+-\d|gulftalent\.com\/.+\/\d/i.test(u || '');
    if (isListing && Array.isArray(data.results)) {
      // drop results from domains outside the listing portals (Tavily sometimes leaks others)
      const onPortal = data.results.filter(r => listingDomains.some(d => (r.url || '').includes(d)));
      // 🔢 v543c: سؤال الأرقام مقفول على الموقعين دون عتبة — لا تسرّب نتائج غريبة.
      if (isNumbers || onPortal.length >= 3) data.results = onPortal;
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
      title: withoutRemovedSourceMentions((isListing && !/^📌|^🔍/.test(r.title || '') ? (isDetailUrl(r.url) ? '📌 إعلان مباشر: ' : '🔍 صفحة بحث: ') : '') + (r.title || '')),
      url: r.url,
      content: withoutRemovedSourceMentions((r.content || '').slice(0, isListing ? 1200 : 350)),
    })) : [];
    if (isListing) results.sort((a, b) => (b.title.startsWith('📌') ? 1 : 0) - (a.title.startsWith('📌') ? 1 : 0));
    // 🔢 v543b: سؤال الأرقام لا يخرج فارغًا أبدًا — بوّابتا xplate وSHub تُضمّنان.
    if (isNumbers) {
      const gates = [
        { h: 'xplate.com', title: '🔢 إكس بليت (xplate) — لوحات سيارات وأرقام هواتف للبيع', url: 'https://xplate.com/ar/numbers', content: 'سوق إماراتي لبيع وشراء لوحات السيارات المميزة وأرقام الهواتف — مفروزة بالإمارة والسعر.' },
        { h: 's-plate.com', title: '🔢 إس بليت (SHub) — سوق اللوحات والأرقام المميزة', url: 'https://s-plate.com/ar', content: 'منصّة SHub لبيع وشراء لوحات المركبات والأرقام المميزة في الإمارات.' },
        { h: 'souq.ma7room.com', title: '🔢 سوق محروم — أرقام سيارات للبيع', url: 'https://souq.ma7room.com/%D8%A3%D8%B1%D9%82%D8%A7%D9%85-%D8%B3%D9%8A%D8%A7%D8%B1%D8%A7%D8%AA/', content: 'قسم أرقام السيارات في سوق محروم — إعلانات بيع أرقام ولوحات مميزة.' },
        { h: 'uaedir.ae', title: '🔢 دليل الإمارات — لوحات وأرقام سيارات', url: 'https://uaedir.ae/car-plates.php', content: 'صفحة لوحات وأرقام السيارات في دليل الإمارات.' },
        { h: 'ae.opensooq.com', title: '🔢 السوق المفتوح — أرقام مركبات مميزة للبيع', url: 'https://ae.opensooq.com/ar/%D8%B3%D9%8A%D8%A7%D8%B1%D8%A7%D8%AA-%D9%88%D9%85%D8%B1%D9%83%D8%A8%D8%A7%D8%AA/%D8%A3%D8%B1%D9%82%D8%A7%D9%85-%D9%85%D8%B1%D9%83%D8%A8%D8%A7%D8%AA-%D9%85%D9%85%D9%8A%D8%B2%D8%A9-%D9%84%D9%84%D8%A8%D9%8A%D8%B9', content: 'إعلانات أرقام المركبات المميزة للبيع في السوق المفتوح.' },
        { h: 'barbahar.com', title: '🔢 بربهار — أرقام سيارات مميزة للبيع', url: 'https://barbahar.com/Used-cars-for-sale/Special-Car-Plates/', content: 'أرقام سيارات مميزة للبيع في دبي وأبوظبي والشارقة وعجمان وأم القيوين ورأس الخيمة والفجيرة — ثنائي وثلاثي ورباعي وخماسي.' },
        { h: 'mourjan.com', title: '🔢 مرجان — أرقام سيارات للبيع', url: 'https://www.mourjan.com/ae/car-numbers/for-sale/', content: 'إعلانات أرقام ولوحات السيارات للبيع في الإمارات على مرجان.' },
      ];
      const have = new Set(results.map(r => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return ''; } }));
      for (const g of gates) if (!have.has(g.h)) results.push({ title: g.title, url: g.url, content: g.content });
    }
    // 📍 v542: الأماكن تتصدّر لأنّها الجواب نفسه. الإسناد «Google Maps» مكتوب
    // داخل كلّ بطاقة — شرطُ رخصةٍ لا زينة.
    if (isPlaces && placeItems.length) {
      const placeCards = placeItems.map((p) => ({
        title: '📍 ' + p.name + (p.rating ? ' · ⭐ ' + p.rating + (p.reviews ? ' (' + p.reviews + ')' : '') : ''),
        // 🏨 v558: بطاقة الفندق تفتح صفحة حجز لا دبّوس خرائط. الإسناد لجوجل
        // يبقى مكتوبًا داخل البطاقة — الرخصة محفوظة، والنقرة صارت مفيدة.
        url: HOTEL_RE.test(query)
          ? 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(p.name)
          : (p.url || p.site || ''),
        content: [
          p.type, p.address,
          p.rating ? 'التقييم ' + p.rating + '/5 من ' + p.reviews + ' مراجعة' : '',
          p.price ? 'مستوى السعر: ' + p.price : '',
          p.openNow ? 'مفتوح الآن' : '',
          p.site ? 'الموقع: ' + p.site : '',
          'المصدر: Google Maps',
        ].filter(Boolean).join(' — '),
      }));
      results = [...placeCards, ...results].slice(0, 24);
    }

    let images = wantImages && Array.isArray(data.images) ? data.images.slice(0, 4) : [];
    // v610 — صور الشريط كانت من Tavily وحده، وهو ساقط حيًّا، فيخرج الشريط فارغًا.
    // احتياطيّ: صور Google Custom Search بالمفتاح الموجود نفسه (بلا شراء جديد).
    if (wantImages && !images.length && gKey && gCx) {
      try {
        const giRes = await fetch(`https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&q=${encodeURIComponent(query)}&searchType=image&num=4&safe=active`);
        if (giRes && giRes.ok) {
          const gi = await giRes.json();
          images = (Array.isArray(gi.items) ? gi.items : [])
            .map((it) => it && it.link)
            .filter((u) => typeof u === 'string' && /^https:\/\//.test(u))
            .slice(0, 4);
        }
      } catch (e) { /* شريط الصور غير حرج — يُترك فارغًا عند الفشل */ }
    }

    let googleItems = [];
    try {
      if (googleResp && googleResp.ok) {
        const gData = await googleResp.json();
        googleItems = withoutRemovedSearchSources(Array.isArray(gData.items) ? gData.items.slice(0, 3).map(it => ({
          title: withoutRemovedSourceMentions(it.title),
          url: it.link,
          content: withoutRemovedSourceMentions((it.snippet || '').slice(0, 350)),
        })) : []);
      }
    } catch (e) { /* ignore Google Search parse errors, non-critical */ }

    // chat.js يقرأ results وحدها، فلو بقيت فارغة لما رأى المحرّك شيئًا مهما
    // جمع Google Custom Search. عند سقوط Tavily تصير حصيلته هي النتائج؛
    // وأسئلة القوائم تستخدم بوّابات المجال المكتوبة أعلاه.
    if (tavilyDown && !results.length) {
      results = isListing
        ? listingDomains.map(d => ({
            title: LISTING_SITE_AR[d] || d,
            url: 'https://' + d,
            content: 'موقع متخصّص في هذا المجال — ابحث فيه مباشرة.',
          }))
        : googleItems.slice(0, 6);
    }

    // 📚 Feature ②: unified, deduped source list (title+url) built from
    // Tavily results and Google Custom Search so the frontend can render
    // clean ChatGPT-style source badges without
    // re-implementing this merge/dedupe logic itself.
    const sources = [];
    try {
      // نطاق جذر: dubai.dubizzle.com و uae.dubizzle.com موقع واحد لا موقعان.
      // اللواحق الثنائيّة (co.uk · com.eg · gov.ae) تأخذ ثلاثة أجزاء لئلّا يندمج
      // كلّ نطاقات الدولة في مفتاح واحد.
      const rootDomain = (h) => {
        const q = String(h || '').split('.').filter(Boolean);
        if (q.length <= 2) return q.join('.');
        const two = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go'];
        return two.includes(q[q.length - 2]) ? q.slice(-3).join('.') : q.slice(-2).join('.');
      };
      const seenHosts = new Set();
      [...results, ...googleItems].forEach(r => {
        if (!r || !r.url) return;
        let host = '';
        try { host = rootDomain(new URL(r.url).hostname.replace(/^www\./, '')); } catch (e) { return; }
        if (!host || seenHosts.has(host)) return;
        seenHosts.add(host);
        sources.push({ title: (r.title || host).replace(/^📌\s*إعلان مباشر:\s*|^🔍\s*صفحة بحث:\s*/, ''), url: r.url });
      });
    } catch (e) { /* non-critical, sources stay whatever was collected so far */ }

    const socialAll = mergeSocial(socialItems, pickSocial(data.results));
    const socialHosts = new Set(socialAll.map(sc => { try { return new URL(sc.url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }));
    // المنصّة تُمثَّل ببطاقتها المسمّاة («إنستغرام · @handle») بدل عنوان خام مكرّر.
    const sourcesOut = sources.filter(x => { try { return !socialHosts.has(new URL(x.url).hostname.replace(/^www\./, '')); } catch (e) { return true; } }).slice(0, 8);
    socialAll.forEach(sc => {
      if (sourcesOut.length < 10) sourcesOut.push({ title: sc.title, url: sc.url });
    });

    if (tavilyDown && !results.length) {
      res.status(502).json({ error: 'Search provider error', detail: 'all providers unavailable' });
      return;
    }

    res.status(200).json({
      answer: withoutRemovedSourceMentions(data.answer),
      results,
      google: googleItems,
      images,
      sources: sourcesOut,
      social: socialAll,
      places: (isPlaces && placeItems.length) ? placeItems : [],
      attribution: (isPlaces && placeItems.length) ? 'Google Maps' : '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', detail: String(err && err.message || err) });
  }
};

module.exports.fetchPlaces = fetchPlaces;
