// 🩺 System health check — owner dashboard endpoint.
// GET ?key=MONITOR_KEY -> runs server-side checks and returns JSON summary.
const { kvPutJSON, kvGetJSON } = require('./kv.js');

const MONITOR_KEY = require('./_secrets.js').MONITOR_KEY;

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  if ((req.query.key || '') !== MONITOR_KEY) { res.status(401).json({ error: 'unauthorized' }); return; }

  const envKeys = {
    OpenAI: !!process.env.OPENAI_API_KEY,
    Gemini: !!process.env.GEMINI_API_KEY,
    Groq: !!(process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1),
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

  const [redisOk, clientErrors] = await Promise.all([checkRedis(), readClientErrors()]);

  res.status(200).json({
    ok: redisOk && Object.values(envKeys).every(Boolean) ? true : false,
    time: new Date().toISOString(),
    redisOk,
    envKeys,
    clientErrorsCount: clientErrors.length,
    clientErrors
  });
};
