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

/* v-health-split (لقطة «فحص النظام» ٢٣ سبتمبر ٢٣:٤٢: «أخطاء مسجلة من المستخدمين: 3» كلّها أسطر v-mem-probe): المسبار
   يكتب أرقام ذاكرة جهاز المالك في سجلّ الأخطاء عمدًا (قناة القراءة الوحيدة من الجهاز)، فكانت تُعدّ أخطاءً وتُنذر بها.
   تُفصل هنا: clientErrors للأخطاء وحدها، وclientDiag لقياسات المسبار — تُعرض بعنوانها ولا تُحسب. */
function isDiag(e) {
  return !!e && (/^diag:/.test(String(e.source || '')) || /^v-mem-probe\b/.test(String(e.message || '')));
}
async function readClientLog() {
  try {
    const items = await kvGetJSON('db/client-errors/log.json');
    return Array.isArray(items) ? items : [];
  } catch (e) { return []; }
}

// v-health-srv: أخطاء الخادم (المسجّلة عبر _errors.js/log-error.js) كانت تُكتب
// في KV بلا أي نافذة قراءة — لوحة المالك ترى أخطاء المتصفّح فقط. بلا الرسائل
// الكاملة للـstack (قد تطول)، يكفي الموضع والرسالة والعدد.
async function readServerErrors() {
  try {
    const items = await kvGetJSON('db/server-errors/log.json');
    if (!Array.isArray(items)) return [];
    // v-err-deploy: الأحدث أوّلًا (آخر ظهور لا أوّله)، وبصمة النشر لكلّ خطأ ليفصل العميل الحاليّ عمّا قبله.
    return items.slice()
      .sort((a, b) => String(b.lastAt || b.at || '').localeCompare(String(a.lastAt || a.at || '')))
      .slice(0, 12).map((e) => ({
        at: e.at, lastAt: e.lastAt || null, route: e.route, action: e.action || null,
        message: String(e.message || '').slice(0, 200), count: e.count || 1, deploy: e.deploy || '',
      }));
  } catch (e) { return []; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  if (!isOwner(req)) { res.status(401).json({ error: 'unauthorized' }); return; }

  // v-clear-log: مسح سجلّ الأخطاء القديم بطلب المالك (مثل أخطاء ميزةٍ حُذفت).
  // للمالك فقط (محميّ بـ isOwner أعلاه). الاستعمال: ...&clear=errors
  if (req.query && (req.query.clear === 'errors' || req.query.clear === '1')) {
    try {
      await kvPutJSON('db/server-errors/log.json', []);
      await kvPutJSON('db/client-errors/log.json', []);
      res.status(200).json({ ok: true, cleared: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'clear_failed' });
    }
    return;
  }

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

  const [redisOk, clientLog, serverErrors] = await Promise.all([checkRedis(), readClientLog(), readServerErrors()]);
  const clientErrors = clientLog.filter((e) => !isDiag(e)).slice(0, 10);
  const clientDiag = clientLog.filter(isDiag).slice(0, 6);

  res.status(200).json({
    ok: redisOk && Object.values(envKeys).every(Boolean) ? true : false,
    time: new Date().toISOString(),
    redisOk,
    envKeys,
    env: envReport(), // فهرس الـ٥٠ متغيّرًا — حضور فقط، لا قيم

    clientErrorsCount: clientErrors.length,
    clientErrors,
    clientDiag,
    serverErrorsCount: serverErrors.length,
    serverErrors,
    deploy: require('./_errors.js').deployId(),
  });
};
module.exports.isDiag = isDiag;
