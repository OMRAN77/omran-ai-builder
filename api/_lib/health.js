// 🩺 System health check — owner dashboard endpoint.
// GET ?key=MONITOR_KEY أو ?token=<جلسة المالك> -> runs server-side checks and returns JSON summary.
const { kvPutJSON, kvGetJSON } = require('./kv.js');

const { isOwner } = require('./_owner.js');
const { envReport } = require('./env.js');

async function checkRedis() {
  try {
    const key = 'db/health/check.json';
    const marker = { at: Date.now() };
    await kvPutJSON(key, marker);
    const readBack = await kvGetJSON(key);
    return !!readBack && readBack.at === marker.at;
  } catch (e) { return false; }
}

async function readClientErrors() {
  try {
    const items = await kvGetJSON('db/client-errors/log.json');
    return Array.isArray(items) ? items.slice(0, 10) : [];
  } catch (e) { return []; }
}

// v-health-srv: أخطاء الخادم (المسجّلة عبر _errors.js/log-error.js) كانت تُكتب
// في KV بلا أي نافذة قراءة — لوحة المالك ترى أخطاء المتصفّح فقط. بلا الرسائل
// الكاملة للـstack (قد تطول)، يكفي الموضع والرسالة والعدد.
async function readServerErrors() {
  try {
    const items = await kvGetJSON('db/server-errors/log.json');
    if (!Array.isArray(items)) return [];
    return items.slice(0, 10).map((e) => ({
      at: e.at, lastAt: e.lastAt || null, route: e.route, action: e.action || null,
      message: String(e.message || '').slice(0, 200), count: e.count || 1,
    }));
  } catch (e) { return []; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  if (!isOwner(req)) { res.status(401).json({ error: 'unauthorized' }); return; }

  const envKeys = {
    OpenAI: !!process.env.OPENAI_API_KEY,
    Gemini: !!process.env.GEMINI_API_KEY,
    Groq: !!process.env.GROQ_API_KEY, // اسم واحد؛ GROQ_API_KEY_1 غير مضبوط في البيئة
    Claude: !!process.env.ANTHROPIC_API_KEY,
    OpenRouter: !!process.env.OPENROUTER_API_KEY,
    Mistral: !!process.env.MISTRAL_API_KEY,
    DeepSeek: !!process.env.DEEPSEEK_API_KEY,
    Cohere: !!process.env.COHERE_API_KEY,
    Perplexity: !!process.env.PERPLEXITY_API_KEY,
    Redis: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    Runway: !!process.env.RUNWAY_API_KEY,
    Tavily: !!process.env.TAVILY_API_KEY,
    Resend: !!process.env.RESEND_API_KEY
  };

  const [redisOk, clientErrors, serverErrors] = await Promise.all([checkRedis(), readClientErrors(), readServerErrors()]);

  res.status(200).json({
    ok: redisOk && Object.values(envKeys).every(Boolean) ? true : false,
    time: new Date().toISOString(),
    redisOk,
    envKeys,
    env: envReport(), // فهرس الـ٥٠ متغيّرًا — حضور فقط، لا قيم

    clientErrorsCount: clientErrors.length,
    clientErrors,
    serverErrorsCount: serverErrors.length,
    serverErrors
  });
};
