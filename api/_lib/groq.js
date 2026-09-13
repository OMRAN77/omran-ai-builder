// Vercel Serverless Function: proxies chat requests to Groq using the site owner's
// own server-side API key (GROQ_API_KEY env var), so visitors can try the app
// without entering their own key. This key is NEVER exposed to the client.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');

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
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing GROQ_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { messages, model, token, guestId } = body;
    if (!messages) {
      res.status(400).json({ error: 'Missing messages' });
      return;
    }

    const usage = await checkAndConsume(token, guestId, 'groq', clientIp(req));
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: usage.message || ('وصلت للحد اليومي المجاني (' + (usage.limit || DAILY_LIMIT) + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.'), subscribeOnly: !!usage.subscribeOnly }); /* v-tiers */
      }
      return;
    }

    const wantStream = !!body.stream;
    // v-free-models (لقطة المالك ١٣ سبتمبر: «The model … does not exist» على اسم llama القديم):
    // اسم النموذج لم يعد مزروعًا. الاسم الذي يرسله العميل يُجرَّب أولًا إن لم يكن
    // متقاعدًا، ثم الناجح المحفوظ، ثم المرشّحون، ثم استكشاف /models — والناجح يُحفظ.
    const fc = require('./free-chain.js');
    const spec = fc.providerSpec('groq', apiKey);
    const callGroq = (m) => fetch(spec.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: m, messages, temperature: 0.7, stream: wantStream }),
    });
    let upstream = null;
    let lastFail = null;
    const tried = fc.modelsToTry(spec, typeof model === 'string' ? model : '');
    for (const m of tried) {
      const r = await callGroq(m);
      if (r.ok) { upstream = r; fc.rememberWorking('groq', m); break; }
      const txt = await r.text().catch(() => '');
      lastFail = { status: r.status, txt };
      if (!fc.isModelErrorStatus(r.status, txt)) break; // خطأ غير النموذج (401/429/5xx) يُعاد للعميل كما هو
    }
    if (!upstream && lastFail && fc.isModelErrorStatus(lastFail.status, lastFail.txt)) {
      const found = await fc.discoverModel(spec, {});
      if (found && !tried.includes(found)) {
        const r = await callGroq(found);
        if (r.ok) { upstream = r; fc.rememberWorking('groq', found); }
        else lastFail = { status: r.status, txt: await r.text().catch(() => '') };
      }
    }
    if (!upstream) {
      res.status((lastFail && lastFail.status) || 502).setHeader('Content-Type', 'application/json').send((lastFail && lastFail.txt) || '{"error":"groq unavailable"}');
      return;
    }

    if (wantStream && upstream.ok && upstream.body) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (res.flushHeaders) res.flushHeaders();
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (e) { /* client likely disconnected */ }
      res.end();
      return;
    }

    const data = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
