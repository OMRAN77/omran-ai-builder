const { stripPrivateKeys } = require('./_msgs.js'); // v-static-leak
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
    const { model, token, guestId } = body;
    const messages = stripPrivateKeys(body.messages); // v-static-leak: لا مفاتيح __ داخليّة إلى المزوّد
    if (!messages) {
      res.status(400).json({ error: 'Missing messages' });
      return;
    }

    // v-free-20-daily: سلّة 'chat' المشتركة لغير المشترك — لا يضاعف سقفه بتبديل المزوّد.
    const usage = await checkAndConsume(token, guestId, 'groq', clientIp(req), { chatBucket: true });
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: usage.message || ('وصلت للحد اليومي المجاني (' + (usage.limit || DAILY_LIMIT) + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.'), subscribeOnly: !!usage.subscribeOnly, tier: usage.tier }); /* v-tiers · v-limit-chain-stop: الطبقة تميّز حدّ المجّانيّ عن حدّ الباقة في العميل */
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
    // v-groq-image-turn (لقطة المالك ٤ أكتوبر: «messages[3].content must be a string»): دور فيه صورة (content مصفوفة) يُرسَل إلى
    // نموذج الرؤية الذي طلبه العميل وحده. المرشّحون نصّيّون فيرفضون المصفوفة بـ400 يدفن خطأ الرؤية الحقيقيّ (404 النموذج
    // أُوقف) — فلا يهبط العميل إلى «وصف الصورة ثمّ النصّيّ» ويسقط الاحتياط كلّه.
    const imageTurn = Array.isArray(messages) && messages.some((x) => x && Array.isArray(x.content));
    const mg = require('./_model-guard.js'); // v-model-lock: لغير المالك وVIP نموذج من قائمة Groq المعروفة وحدها
    const reqModel = mg.guardModel('groq', typeof model === 'string' ? model : '', mg.isPrivileged(usage));
    /* v-audit-prov (srv-providers-1): نموذج الرؤية الحيّ (qwen/qwen3.8-27b) في المرشّحين أصلًا فلا يتقدّمهم — كان tried[0] نصّيًّا
       يستلم الصورة فيردّ 400 لا يُعدّ خطأ نموذج، فلا تُقرأ الصورة أبدًا. دور الصورة = النموذج المطلوب وحده أيًّا كان موضعه،
       وبلا نموذج مسموح لا نصّيّ يستلم المصفوفة: خطأ نموذج (404) فيهبط العميل إلى «الوصف ثمّ النصّ» (رفض النصّيّ صار رمزًا بلا نصّه). */
    const tried = fc.modelsToTry(spec, reqModel);
    if (imageTurn) tried.splice(0, tried.length, ...(reqModel ? [reqModel] : []));
    if (imageTurn && !reqModel) lastFail = { status: 404, txt: '{"error":{"message":"no vision model","code":"model_not_found"}}' };
    /* v-audit-prov: ذاكرة 'groq' مشتركة مع السلسلة المجّانيّة (chat.js) — لا يُحفظ فيها إلّا مرشّح تجرّبه السلسلة نفسها في دور نصّيّ؛
       نموذج الرؤية أو موديل يختاره العميل (kimi-k2…) كان يصير أوّل المجّانيّ لكلّ المستخدمين ستّ ساعات (قرار «المجّانيّ على 20b»). */
    const chainOwn = imageTurn ? [] : fc.modelsToTry(spec, '');
    for (const m of tried) {
      const r = await callGroq(m);
      if (r.ok) { upstream = r; if (chainOwn.includes(m)) fc.rememberWorking('groq', m); break; }
      const txt = await r.text().catch(() => '');
      lastFail = { status: r.status, txt };
      if (!fc.isModelErrorStatus(r.status, txt)) break; // خطأ غير النموذج (401/429/5xx) يُعاد للعميل كما هو
    }
    if (!upstream && !imageTurn && lastFail && fc.isModelErrorStatus(lastFail.status, lastFail.txt)) {
      const found = await fc.discoverModel(spec, {});
      if (found && !tried.includes(found)) {
        const r = await callGroq(found);
        if (r.ok) { upstream = r; fc.rememberWorking('groq', found); }
        else lastFail = { status: r.status, txt: await r.text().catch(() => '') };
      }
    }
    if (!upstream) {
      require('./_videoFail.js').chatFail(res, 'groq', (lastFail && lastFail.status) || 502, (lastFail && lastFail.txt) || '{"error":"groq unavailable"}', usage.tier === 'owner'); // v-audit-prov (srv-providers-5): خطأ المزوّد لغير المالك رمز بلا اسم مزوّد ولا موديل (_videoFail.chatFail)
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
