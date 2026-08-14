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
// v611 — مغذٍّ حيّ بديل. قياس حيّ ١٤ أغسطس ٢٠٢٦: Tavily ردّ 432 «تجاوز حصّة
// الخطّة» وGoogle CSE ردّ 403 «Custom Search JSON API غير مفعّل للمشروع»، فبقي
// البحث كلّه بلا مصدر وشريط الصور فارغًا. Perplexity (مفتاح المشروع نفسه،
// مدفوع مسبقًا) يعيد الجواب والنتائج والصور في نداء واحد.
// v612 — لاحقة الدولة كانت محبوسة داخل استعلام Tavily وحده، فشريط الصور
// يُطلب بالاستعلام الخام («أرقام سيارات» → لوحات اليمن وعُمان وكاليفورنيا).
// نفس التعبير يُرفع هنا ليُشارَك مع استعلام الصور — بلا تغيير في سلوك Tavily.
const GEO_IN_QUERY_RE = /سعود|إمارات|الامارات|دبي|أبوظبي|ابوظبي|الشارقة|عجمان|مصر|قطر|كويت|عمان|بحرين|أردن|saudi|uae|dubai|abu dhabi|sharjah|egypt|qatar|kuwait|oman|bahrain|jordan|usa|america|uk|india|pakistan|فلبين|فليبين|philippin|هند|india|صين|china|يابان|japan|كور|korea|ترك|turk|ألمان|german|فرنس|franc|بريطان|british|إندونيس|indonesia|ماليز|malays|تايلا|thai|روس|russ|أمريك|americ|كند|canad|أسترال|austral/i;

/* v621 — بوّابة النيّة المحلّيّة.
   العيب المُقاس: كلّ استعلام قصير بلا كلمة جغرافيّة كان يُحقن بـ«الإمارات UAE»،
   فسؤال «صورة أوّل هاتف» صار «أوّل هاتف الإمارات UAE» → خرائط وأعلام بدل الهاتف.
   العلاج: الدولة تُضاف عند النيّة المحلّيّة وحدها؛ الافتراض عالميّ.
   كلّ الأنماط أدناه مكتوبة بصيغة مُطبَّعة (بلا همزات ولا تاء مربوطة ولا تشكيل). */
function normAr(t){
  return String(t || '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')   // تشكيل + تطويل
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // أإآٱ → ا
    .replace(/\u0649/g, '\u064A')                  // ى → ي
    .replace(/\u0626/g, '\u064A')                  // ئ → ي
    .replace(/\u0624/g, '\u0648')                  // ؤ → و
    .replace(/\u0629/g, '\u0647')                  // ة → ه
    .replace(/\s+/g, ' ');
}
const LOCAL_INTENT_RE = /مطعم|مطاعم|مقهي|مقاهي|كافي|كوفي|فندق|فنادق|قرب|قريب|قريبه|حولي|وين|فين|اقرب|عنوان|موقع|فرع|فروع|دوام|اوقات العمل|يفتح|يسكر|سعر|اسعار|تكلفه|كلفه|رسوم|ايجار|للبيع|للايجار|اشتري|عقار|عقارات|شقه|فيلا|توصيل|حجز|احجز|مكتب|مكاتب|عياده|عيادات|مستشفي|مستشفيات|صيدليه|محل|محلات|سوق|اسواق|مول|صالون|ورشه|جراج|بنزين|جامعه|جامعات|معهد|مدرسه|مدارس|حضانه|وظيفه|وظايف|راتب|رواتب|طقس|الجو|درجه الحراره|امطار|مواصلات|مترو|تاكسي|طيران|رحلات|تاشيره|فيزا|اقامه|بلديه|هييه|دايره|وزاره|خدمه|خدمات|رخصه|مخالفه|مخالفات|شرطه|محامي|محاسب|طبيب|حلاق|عروض|عروضات|عرض|تخفيض|تخفيضات|خصم|خصومات|تنزيلات|سيل|اوفر|اوفرات|near me|nearby|around me|restaurant|cafe|hotel|price|cost|rent|for sale|clinic|hospital|pharmacy|salary|jobs?|weather|visa|licen[cs]e|delivery|booking|open now|deals?|offers?|discounts?|sale|promo/i;
const GLOBAL_KNOWLEDGE_RE = /من اخترع|من ابتكر|من اكتشف|من اسس|من صنع|من بني|من الف|اول من|اول هاتف|اول جهاز|تاريخ|تاريخي|تاريخيه|قديم|قديمه|قرن|حضاره|عصر|حرب|معركه|سنه [\u0660-\u06690-9]{3,4}|عام [\u0660-\u06690-9]{3,4}|1[5-9][0-9][0-9]|كيف يعمل|كيف تعمل|كيف صنع|كيف كان|ما هو|ما هي|شنو هو|من هو|من هي|مين هو|شرح|اشرح|تعريف|معني|فرق بين|مقارنه بين|فوايد|اضرار|اعراض|علاج|كوكب|فضاء|نجم|مجره|نظريه|فيزياء|كيمياء|احياء|رياضيات|who invented|who discovered|who founded|first (telephone|phone|car|computer)|history of|how does|how do|how was|what is|what are|definition|explain|difference between|symptoms|treatment/i;
/* مدن العالم: «فنادق في اسطنبول» لا تُحقن بالإمارات. */
const GEO_CITY_RE = /دبي|ابوظبي|الشارقه|عجمان|راس الخيمه|الفجيره|ام القيوين|العين|الرياض|جده|مكه|المدينه|الدمام|الخبر|الطايف|ابها|الدوحه|الكويت|المنامه|مسقط|صلاله|القاهره|الاسكندريه|بيروت|عمان|دمشق|بغداد|اربيل|الخرطوم|طهران|اسطنبول|استانبول|انطاليا|انقره|باريس|لندن|مانشستر|نيويورك|لوس انجلوس|شيكاغو|واشنطن|ميامي|تورنتو|فانكوفر|طوكيو|اوساكا|سيول|بكين|شنغهاي|هونغ كونغ|سنغافوره|بانكوك|كوالالمبور|جاكرتا|بالي|مانيلا|مومباي|دلهي|بنغالور|كراتشي|لاهور|اسلام اباد|روما|ميلان|البندقيه|برشلونه|مدريد|لشبونه|اثينا|برلين|ميونخ|فرانكفورت|فيينا|زيورخ|جنيف|امستردام|بروكسل|براغ|بودابست|وارسو|موسكو|كييف|ستوكهولم|اوسلو|كوبنهاغن|هلسنكي|دبلن|سيدني|ملبورن|اوكلاند|مراكش|الدار البيضاء|تونس|الجزاير|طرابلس|نيروبي|كيب تاون|ساو باولو|ريو|مكسيكو|paris|london|new ?york|tokyo|seoul|bangkok|singapore|istanbul|rome|barcelona|madrid|berlin|vienna|amsterdam|moscow|sydney|toronto/i;
/* صفات النسبة = مطبخ أو جنسيّة لا مكان: «مطعم هندي» في مدينة المستخدم. */
const NAT_ADJ_RE = /هندي|هنديه|صيني|صينيه|ياباني|يابانيه|ايطالي|ايطاليه|تركي|تركيه|كوري|كوريه|تايلاندي|تايلندي|فيتنامي|امريكي|امريكيه|فرنسي|فرنسيه|مكسيكي|لبناني|لبنانيه|سوري|سوريه|مصري|مصريه|يمني|يمنيه|سعودي|سعوديه|اماراتي|خليجي|فلبيني|باكستاني|اثيوبي|مغربي|ايراني|افغاني|indian|chinese|japanese|italian|turkish|korean|thai|american|french|mexican|lebanese|syrian|egyptian|filipino|pakistani|persian/i;
function wantsLocalGeo(q){
  const raw = String(q || '');
  const s = normAr(raw);
  const local = LOCAL_INTENT_RE.test(s);
  const geo   = GEO_IN_QUERY_RE.test(raw) || GEO_IN_QUERY_RE.test(s) || GEO_CITY_RE.test(s);
  // نيّة محلّيّة + صفة نسبة بلا مدينة ولا «في <دولة>» = مطبخ محلّيّ، فتُضاف الدولة
  if (local && geo && NAT_ADJ_RE.test(s) && !GEO_CITY_RE.test(s)
      && !/(في|من|الي|ب) ?(ال)?(هند|صين|يابان|ترك|امريك|فرنس|ايطال|كور|تايلا|فيتنام|مكسيك|مصر|سعود|قطر|كويت|بحرين|اردن|لبنان|سوري|مغرب|ايران)/i.test(s)
      && !/in (india|china|japan|turkey|usa|france|italy|korea|thailand)/i.test(s)) return true;
  if (geo)   return false;                        // جغرافيا صريحة — لا حقن
  if (local) return true;                         // نيّة محلّيّة فعليّة
  if (GLOBAL_KNOWLEDGE_RE.test(s)) return false;  // سؤال معرفيّ/تاريخيّ — عالميّ
  return false;                                   // الافتراض: عالميّ
}

async function pplxLive(query, wantImages) {
  const key = (process.env.PERPLEXITY_API_KEY || '').trim();
  if (!key) return null;
  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: String(query || '').slice(0, 500) }],
        return_images: !!wantImages,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) { console.warn('[search] perplexity HTTP ' + r.status); return null; }
    const d = await r.json();
    const answer = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
    const raw = Array.isArray(d.search_results) ? d.search_results : [];
    const results = withoutRemovedSearchSources(raw.map(s => ({
      title: withoutRemovedSourceMentions((s && s.title) || ''),
      url: (s && s.url) || '',
      content: withoutRemovedSourceMentions(String((s && s.snippet) || '').slice(0, 350)),
    })).filter(x => /^https?:\/\//.test(x.url)));
    const images = wantImages && Array.isArray(d.images)
      ? d.images.map(im => (im && (im.image_url || im.url)) || '')
          .filter(u => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4)
      : [];
    return { answer: withoutRemovedSourceMentions(answer), results, images };
  } catch (e) { console.warn('[search] perplexity ' + (e && e.message)); return null; }
}

function pickSocial(items, trusted) {
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
      if (!trusted && sc !== null && sc < (handle ? 0.38 : 0.50)) return;
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
        include_domains: ['instagram.com', 'tiktok.com', 'snapchat.com', 'youtube.com', 'x.com', 'twitter.com'],
        search_depth: 'basic',
        include_answer: false,
        max_results: 12,
      }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return pickSocial(j.results, true);
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

// 📍 v617 — كاشف أسئلة الأماكن ورمز الدولة: رُفِعا إلى مستوى الوحدة لتستعملهما
// الدردشة أيضًا. قبلها كان سؤال أماكن خارج الإمارات لا يستدعي الخرائط أصلًا.
const PLACES_RE = /مطعم|مطاعم|مطاعمه|مقهى|مقاهي|كافيه|كافيهات|كوفي|بوفيه|مخبز|مخابز|حلويات|صيدلي(ة|ات)|مستشفى|مستشفيات|عياد(ة|ات)|طبيب|أطباء|دكتور|أسنان|صالون|حلاق|مشغل|سبا|جيم|نادي رياضي|صالة رياضية|مول|مولات|أسواق|متجر|بقالة|سوبرماركت|هايبر|محطة وقود|بنزين|حديق(ة|ات)|متحف|متاحف|شاطئ|شواطئ|ملاهي|معلم سياحي|معالم|أماكن سياحية|وين أروح|وين اروح|أماكن|مسجد|مساجد|كنيسة|مدرسة|مدارس|حضانة|مغسلة|كراج|ورشة|restaurant|cafe|coffee shop|bakery|pharmacy|hospital|clinic|dentist|salon|barber|spa|gym|mall|supermarket|grocery|gas station|park|museum|beach|attraction|things to do|near me|قريب مني|قريبة مني|بالقرب/i;
const HOTEL_RE = /فندق|فنادق|منتجع|منتجعات|شاليه|شاليهات|hotel|resort/i;
function isPlacesAsk(q) { const t = String(q || ''); return !!t && (PLACES_RE.test(t) || HOTEL_RE.test(t)); }

// 🌍 v617 — رمز الدولة من نصّ السؤال لا من موقع المستخدم. «مطاعم باريس» من جهاز
// إماراتيّ كان يُبحث بـregionCode=AE فتنحاز النتيجة. الدولة المذكورة تغلب دائمًا.
const REGION_RE = {
  AE: /الإمارات|الامارات|\buae\b|دبي|dubai|أبوظبي|ابوظبي|أبو ظبي|ابو ظبي|abu ?dhabi|الشارقة|sharjah|عجمان|ajman|رأس الخيمة|راس الخيمة|ras al ?khaim|أم القيوين|ام القيوين|umm al ?quwain|الفجيرة|fujairah|العين|al ?ain|خورفكان/i,
  SA: /السعود|سعودي|saudi|الرياض|riyadh|جدة|jeddah|الدمام|dammam|الخبر|khobar|مكة|makkah|mecca|المدينة المنورة|أبها|abha|الطائف|taif|تبوك|tabuk|العلا|alula/i,
  QA: /قطر|qatar|الدوحة|\bdoha\b/i,
  KW: /الكويت|كويت|kuwait/i,
  BH: /البحرين|بحرين|bahrain|المنامة|manama/i,
  JO: /الأردن|أردن|jordan|عمّان|amman|العقبة|aqaba|البترا|petra/i,
  OM: /سلطنة عمان|\boman\b|مسقط|muscat|صلالة|salalah|نزوى|nizwa/i,
  EG: /مصر|egypt|القاهرة|cairo|الإسكندرية|alexandria|شرم الشيخ|sharm|الغردقة|hurghada|الأقصر|luxor|أسوان|aswan/i,
  LB: /لبنان|lebanon|بيروت|beirut/i,
  IQ: /العراق|iraq|بغداد|baghdad|أربيل|erbil|البصرة|basra/i,
  MA: /المغرب|morocco|الدار البيضاء|casablanca|مراكش|marrakech|طنجة|tangier|الرباط|rabat/i,
  TN: /تونس|tunis/i,
  TR: /تركي|تركيا|turk|إسطنبول|اسطنبول|استنبول|istanbul|أنطاليا|antalya|طرابزون|trabzon|بودروم|bodrum|أنقرة|ankara|إزمير|izmir/i,
  FR: /فرنس|franc|باريس|paris|ليون|\blyon\b|مارسيل|marseille|نيس،|نيس |بوردو|bordeaux|كان الفرنس|cannes|ستراسبورغ|strasbourg/i,
  GB: /بريطان|إنجلترا|انجلترا|إنكلترا|\buk\b|england|scotland|اسكتلندا|لندن|london|مانشستر|manchester|برمنغهام|birmingham|إدنبرة|edinburgh|ليفربول|liverpool/i,
  DE: /ألمان|المان|german|برلين|berlin|ميونخ|munich|فرانكفورت|frankfurt|هامبورغ|hamburg|كولونيا|cologne|دوسلدورف|dusseldorf/i,
  IT: /إيطال|ايطال|\bital|روما|\brome\b|ميلان|milan|فينيسيا|البندقية|venice|فلورنس|florence|نابولي|naples|أمالفي|amalfi/i,
  ES: /إسبان|اسبان|spain|spanish|مدريد|madrid|برشلون|barcelon|فالنسيا|valencia|ملقا|malaga|إشبيل|seville/i,
  PT: /البرتغال|برتغال|portug|لشبونة|lisbon|بورتو|\bporto\b/i,
  NL: /هولند|netherl|holland|أمستردام|amsterdam|روتردام|rotterdam/i,
  BE: /بلجيك|belgi|بروكسل|brussel/i,
  CH: /سويسر|swiss|switzerland|زيورخ|zurich|جنيف|geneva|انترلاكن|interlaken/i,
  AT: /النمسا|austria|فيينا|vienna|سالزبورغ|salzburg/i,
  GR: /اليونان|يونان|greece|أثينا|athens|سانتوريني|santorini|ميكونوس|mykonos/i,
  CZ: /تشيك|czech|براغ|prague/i,
  PL: /بولند|poland|وارسو|warsaw/i,
  HU: /المجر|hungar|بودابست|budapest/i,
  SE: /السويد|sweden|ستوكهولم|stockholm/i,
  NO: /النرويج|norway|أوسلو|\boslo\b/i,
  DK: /الدنمارك|denmark|كوبنهاغن|copenhagen/i,
  IE: /أيرلند|ايرلند|ireland|دبلن|dublin/i,
  RU: /روسي|russia|موسكو|moscow|سان بطرسبرغ|petersburg/i,
  US: /أمريك|امريك|americ|\busa\b|نيويورك|new york|لوس أنجل|لوس انجل|los angeles|شيكاغو|chicago|ميامي|miami|لاس فيغاس|las vegas|سان فرانسيسكو|san francisco|واشنطن|washington|بوسطن|بوستن|boston|سياتل|seattle|هيوستن|houston|أورلاندو|orlando/i,
  CA: /كندا|كندي|canad|تورونتو|toronto|فانكوفر|vancouver|مونتريال|montreal/i,
  JP: /اليابان|ياباني|japan|طوكيو|tokyo|أوساكا|osaka|كيوتو|kyoto/i,
  KR: /كوريا الجنوب|كوري|korea|سيول|seoul|بوسان|busan/i,
  CN: /الصين|صيني|china|بكين|beijing|شنغهاي|shanghai|قوانزو|guangzhou/i,
  HK: /هونغ كونغ|هونج كونج|hong kong/i,
  SG: /سنغافور|سنجافور|singapor/i,
  TH: /تايلاند|thai|بانكوك|bangkok|بوكيت|phuket|شيانغ ماي|chiang mai/i,
  MY: /ماليزي|malays|كوالالمبور|kuala lumpur|لنكاوي|langkawi/i,
  ID: /إندونيس|اندونيس|indonesia|جاكرت|jakarta|بالي|\bbali\b/i,
  PH: /الفلبين|فلبين|فليبين|philippin|مانيلا|manila/i,
  VN: /فيتنام|vietnam|هانوي|hanoi/i,
  IN: /الهند\b|هندية|india|دلهي|delhi|مومباي|mumbai|بنغالور|bangalore|غوا|\bgoa\b|كشمير|kashmir/i,
  PK: /باكستان|pakistan|كراتشي|karachi|لاهور|lahore|إسلام أباد|islamabad/i,
  LK: /سريلانك|sri lanka|كولومبو|colombo/i,
  MV: /المالديف|مالديف|maldive/i,
  NP: /نيبال|nepal|كاتماندو|kathmandu/i,
  AZ: /أذربيجان|اذربيجان|azerbaijan|باكو|\bbaku\b/i,
  GE: /جورجيا|georgia|تبليسي|tbilisi|باتومي|batumi/i,
  AU: /أسترال|استرال|austral|سيدني|sydney|ملبورن|melbourne/i,
  NZ: /نيوزيلند|new zealand|أوكلاند|auckland/i,
  ZA: /جنوب أفريق|south afric|كيب تاون|cape town|جوهانسبرغ|johannesburg/i,
  KE: /كينيا|kenya|نيروبي|nairobi|مومباسا|mombasa/i,
  BR: /البرازيل|brazil|ساو باولو|sao paulo|ريو دي |rio de janeiro/i,
};
// صفة المطبخ ليست موقعًا: «مطاعم إيطاليّة في باريس» موقعها فرنسا.
const CUISINE_ADJ_RE = /(?:إيطالي|ايطالي|فرنسي|صيني|ياباني|هندي|تركي|لبناني|مكسيكي|تايلندي|تايلاندي|كوري|إسباني|اسباني|يوناني|مغربي|أمريكي|امريكي|إيراني|ايراني|فيتنامي|إندونيسي)(?:ّ?ة|ه|ة)?/g;
function regionOf(text) {
  const t = String(text || '');
  if (!t) return '';
  const keys = Object.keys(REGION_RE);
  const t2 = t.replace(CUISINE_ADJ_RE, ' ');
  for (let i = 0; i < keys.length; i++) if (REGION_RE[keys[i]].test(t2)) return keys[i];
  for (let i = 0; i < keys.length; i++) if (REGION_RE[keys[i]].test(t)) return keys[i];
  return '';
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
    let geoCity = '';
    try { geoCity = decodeURIComponent((req.headers && req.headers['x-vercel-ip-city'] || '').toString()).trim(); } catch (e) { geoCity = ''; }
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
      const geoSuffix = (query.length > 120 || !wantsLocalGeo(query)) ? '' : ((geoCity ? geoCity + ' ' : '') + (geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE'));
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
      const deepSocialP = fetchSocial(apiKey, geoSuffix ? (query + ' ' + geoSuffix) : query);
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

      // v611 — البحث العميق كان على Tavily وحده؛ عند سقوطه يخرج فارغًا.
      if (!mergedResults.length) {
        const dp = await pplxLive(query, wantImages);
        if (dp) {
          if (dp.results.length) mergedResults = dp.results;
          if (dp.answer) answers.push(dp.answer);
          if (wantImages && dp.images.length) allImages.push(...dp.images);
          dp.results.forEach(r => {
            if (deepSources.length >= 10 || !r.url) return;
            let h = '';
            try { h = new URL(r.url).hostname.replace(/^www\./, ''); } catch (e) { return; }
            if (!h || seenHosts.has(h)) return;
            seenHosts.add(h);
            deepSources.push({ title: r.title || h, url: r.url });
          });
        }
      }

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
    // 🏨 v555: الفنادق تُخدَم بخرائط جوجل أيضًا (أسماء وتقييمات فنادق حقيقيّة)
    // لا بمواقع الحجز وحدها. تبقى في محرّك القوائم كما هي.
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
          query: ((query.length > 120 || !wantsLocalGeo(query)) ? query : (query + ' ' + (geoCity ? geoCity + ' ' : '') + (geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE'))),
          ...(wantsLocalGeo(query) ? { country: (geoNameEn ? geoNameEn.toLowerCase() : 'united arab emirates') } : {}),
          search_depth: isListing ? 'advanced' : 'basic',
          include_answer: true,
          include_images: wantImages,
          max_results: isListing ? 10 : (domains ? 5 : 3),
          ...(isListing ? { include_domains: listingDomains } : (domains ? { include_domains: domains } : {})),
        }),
      }),
      googleUrl ? fetch(googleUrl).catch(() => null) : Promise.resolve(null),
      fetchSocial(apiKey, (wantsLocalGeo(query) ? (query + ' ' + (geoCity ? geoCity + ' ' : '') + (geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE')) : query)),
      isPlaces ? fetchPlaces(placesKey, query, lang, (regionOf(query) || geoCode)) : Promise.resolve([]),
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
    // v628 عيب [أ]: بطاقة الرحلات لنيّة سفر/حجز فعليّة فقط — كانت «رحلات» أو «طيران» وحدها
    // تكفي، فظهرت في سؤال تاريخيّ («أوّل طائرة ركاب») ولا علاقة لها بالجواب.
    const isFlight = /تذكرة|تذاكر|احجز|حجز\s*(طيران|رحل|تذكر)|طيران\s*(رخيص|ارخص|أرخص)|(اسعار|أسعار)\s*(الطيران|التذاكر|الرحلات)|(ارخص|أرخص)\s*(رحلة|رحله|تذكرة|طيران)|(رحلة|رحله|طيران|سفر)\s*(من|إلى|الى)\s*\S|flights?\s*(from|to|price|deal|book)|air ticket|airfare|book\s*(a\s*)?flight/i.test(query);
    // سؤال معلوماتيّ/تاريخيّ عن الطائرات = لا بطاقة رحلات مهما ورد فيه من ألفاظ السفر.
    const isPlaneInfo = /من\s*(صنع|اخترع|ابتكر|بنى)|(اول|أوّل|أول)\s*(طائرة|طائره|رحلة|رحله)|تاريخ\s*(الطيران|الطائر)|كيف\s*(تطير|يطير|تعمل)|كم\s*(عدد|تحمل|يحمل|راكب)|حوادث|تحطم|(انواع|أنواع)\s*(الطائرات|الطياره)|who\s*(invented|made|built)|first\s*(airplane|plane|flight|passenger)|history\s*of\s*(aviation|flight)/i.test(query);
    if (isFlight && !isPlaneInfo && Array.isArray(data.results)) {
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

    // v612 — استعلام الصور وحده يحمل الدولة؛ النصّ والمصادر لا تُمسّ.
    const imgQuery = (query.length > 120 || !wantsLocalGeo(query))
      ? query : (query + ' ' + (geoCity ? geoCity + ' ' : '') + (geoNameAr || 'الإمارات') + ' ' + (geoNameEn || 'UAE'));
    let images = wantImages && Array.isArray(data.images) ? data.images.slice(0, 4) : [];
    // v610 — صور الشريط كانت من Tavily وحده، وهو ساقط حيًّا، فيخرج الشريط فارغًا.
    // احتياطيّ: صور Google Custom Search بالمفتاح الموجود نفسه (بلا شراء جديد).
    if (wantImages && !images.length && gKey && gCx) {
      try {
        const giRes = await fetch(`https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&q=${encodeURIComponent(imgQuery)}&searchType=image&num=4&safe=active`);
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

    // v611 — نداء واحد للمغذّي البديل يسدّ ثلاث فجوات معًا: نتائج عند سقوط
    // Tavily، وصور عند خلوّ الشريط، وجوابًا عند غياب جواب Tavily.
    if (tavilyDown || (wantImages && !images.length)) {
      const pplx = await pplxLive(wantImages ? imgQuery : query, wantImages);
      if (pplx) {
        if (!images.length && pplx.images.length) images = pplx.images;
        if (!data.answer && pplx.answer) data.answer = pplx.answer;
        // القوائم (عقار/سيارات/وظائف) لها بوّابات مجالها أدناه — لا تُخلط.
        if (!isListing && pplx.results.length) {
          const seenPplx = new Set(results.map(r => r && r.url));
          for (const r of pplx.results) {
            if (results.length >= 8) break;
            if (r.url && !seenPplx.has(r.url)) { seenPplx.add(r.url); results.push(r); }
          }
        }
      }
    }

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
    // 🌍 فلتر بلد المصادر: للاستعلامات المحلية، أسقط النطاقات المنتمية صراحةً لبلد آخر
      // (بادئة sa. أو لاحقة .sa عندما المستخدم في الإمارات مثلاً). النطاقات المحايدة تبقى.
      const CC_LIST = ['ae','sa','eg','kw','qa','bh','om','jo','lb','ma','tn','dz','iq','ye','ps','sd','ly','tr','in','pk','us','uk','fr','de'];
      const userCc = (geoCode || 'AE').toLowerCase();
      const foreignCcOf = (host) => {
        const parts = String(host||'').toLowerCase().split('.');
        const first = parts[0];
        const lastTwo = parts.slice(-2).join('.');
        if (CC_LIST.includes(first) && first !== userCc) return first;                       // sa.arabiccoupon.com
        const tld = parts[parts.length-1];
        if (CC_LIST.includes(tld) && tld !== userCc && tld.length === 2) return tld;         // example.sa / example.eg
        if (/^(co|com|net|org|gov)$/.test(parts[parts.length-2]||'') && CC_LIST.includes(tld) && tld !== userCc) return tld; // example.com.sa
        return '';
      };
      const localQ = wantsLocalGeo(query);
      const sourcesOut = sources.filter(x => {
        try {
          const host = new URL(x.url).hostname.replace(/^www\./, '');
          if (socialHosts.has(host)) return false;
          if (localQ && foreignCcOf(host)) return false;
          if (localQ) {
            const mPath = String(new URL(x.url).pathname||'').toLowerCase().match(/^\/([a-z]{2})(?:\/|$)/);
            if (mPath && CC_LIST.includes(mPath[1]) && mPath[1] !== userCc) return false; // tsawq.net/sa
          }
          return true;
        } catch (e) { return true; }
      }).slice(0, 8);
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
module.exports.isPlacesAsk = isPlacesAsk;
module.exports.regionOf = regionOf;
