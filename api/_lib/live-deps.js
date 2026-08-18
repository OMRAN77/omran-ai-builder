// live-deps.js — adapter يربط live-answers بأدوات التطبيق الحالية
// يوفّر: بحث Tavily مباشر + fetchPage + LLM رخيص (Groq) + Redis cache (Upstash)

const { kvGetRaw, kvPutJSON, kvExpire } = require('./kv.js');
const { fetchPublicUrl } = require('./safe-url.js');

// ─── Search: Tavily مباشر بصيغة SearchResult[] ───

async function tavilySearch(query) {
  const key = (process.env.TAVILY_API_KEY || '').trim();
  if (!key) return [];
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, 12000);
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: String(query || '').slice(0, 380),
        max_results: 6,
        search_depth: 'basic',
        include_answer: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) { console.warn('[live-deps] tavily HTTP ' + r.status); return []; }
    const d = await r.json();
    return ((d && d.results) || []).map(function (x) {
      return {
        title: String(x.title || ''),
        url: String(x.url || ''),
        snippet: String(x.content || '').replace(/\s+/g, ' ').slice(0, 400),
      };
    });
  } catch (e) {
    clearTimeout(t);
    console.warn('[live-deps] tavily error', e && e.message);
    return [];
  }
}

// ─── Fetch Page: نفس المنطق الموجود في chat.js ───

async function fetchPage(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 12000);
    const r = await fetchPublicUrl(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OmranChat/1.0)' },
    });
    clearTimeout(t);
    if (!r.ok) return 'فشل فتح الصفحة: HTTP ' + r.status;
    const text = (await r.text())
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 6000) : 'الصفحة فارغة.';
  } catch (e) {
    return 'فشل فتح الصفحة: ' + (e && e.message);
  }
}

// ─── LLM: Groq (أرخص وأسرع) مع fallback لـ OpenRouter ───

async function cheapLLM(prompt) {
  // أوّلًا: Groq (مجاني / شبه مجاني)
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (groqKey) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + groqKey },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 500,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = (((d.choices || [])[0] || {}).message || {}).content || '';
        if (txt.trim()) return txt.trim();
      }
    } catch (e) { console.warn('[live-deps] groq error', e && e.message); }
  }

  // ثانيًا: OpenRouter بنموذج رخيص
  const orKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (orKey) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + orKey },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-maverick',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 500,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = (((d.choices || [])[0] || {}).message || {}).content || '';
        if (txt.trim()) return txt.trim();
      }
    } catch (e) { console.warn('[live-deps] openrouter error', e && e.message); }
  }

  // ثالثًا: fallback — استعلام واحد من النص
  return JSON.stringify([prompt.slice(0, 80)]);
}

// ─── Cache: Upstash Redis ───

var redisCache = {
  async get(key) {
    try {
      var raw = await kvGetRaw(key);
      return raw != null ? String(raw) : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value, ttlSeconds) {
    try {
      // kvPutJSON stores JSON.stringify — we need raw string, so use command directly
      // But kvGetRaw returns raw. Let's store as JSON string value via kvPutJSON
      await kvPutJSON(key, value);
      if (ttlSeconds > 0) await kvExpire(key, ttlSeconds);
    } catch (e) {
      // best-effort
    }
  },
};

// ─── نقطة الدخول ───

function makeDeps() {
  return {
    search: tavilySearch,
    fetchPage: fetchPage,
    llm: cheapLLM,
    cache: redisCache,
  };
}

module.exports = { makeDeps: makeDeps };
