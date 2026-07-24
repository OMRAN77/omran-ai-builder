// 🩺 System health check — owner dashboard endpoint.
// GET ?key=MONITOR_KEY -> runs server-side checks and returns JSON summary.
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const MONITOR_KEY = process.env.MONITOR_KEY || 'omran-monitor-2026';

async function checkBlob() {
  try {
    const r = await fetch(BLOB_BASE + '?limit=1', {
      headers: { Authorization: 'Bearer ' + BLOB_TOKEN }
    });
    return r.ok;
  } catch (e) { return false; }
}

async function readClientErrors() {
  try {
    const listRes = await fetch(BLOB_BASE + '?prefix=' + encodeURIComponent('db/client-errors/log.json') + '&limit=1', {
      headers: { Authorization: 'Bearer ' + BLOB_TOKEN }
    });
    const listData = await listRes.json();
    const blob = (listData.blobs || [])[0];
    if (!blob) return [];
    const r = await fetch(blob.url + '?ts=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return [];
    const items = await r.json();
    return Array.isArray(items) ? items.slice(-10).reverse() : [];
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
    Blob: !!BLOB_TOKEN,
    Runway: !!process.env.RUNWAY_API_KEY,
    Tavily: !!process.env.TAVILY_API_KEY,
    Resend: !!process.env.RESEND_API_KEY
  };

  const [blobOk, clientErrors] = await Promise.all([checkBlob(), readClientErrors()]);

  res.status(200).json({
    ok: blobOk && Object.values(envKeys).every(Boolean) ? true : false,
    time: new Date().toISOString(),
    blobOk,
    envKeys,
    clientErrorsCount: clientErrors.length,
    clientErrors
  });
};
