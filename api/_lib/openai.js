// Vercel Serverless Function: proxies chat requests to OpenAI using the site owner's
// own server-side API key (OPENAI_API_KEY env var), so visitors can try the app
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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
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

    let useModel = (!model || model === 'gpt-4.1-mini' || model === 'gpt-4o-mini') ? 'gpt-4.1' : model;
    // 👑 الرد الاحترافي: موديل بريميوم مقابل نقاط (المالك بلا حدود).
    let premiumRefund = null;
    let isPremium = false;
    if (body.premium) {
      const pUser = verifyPointsToken(token);
      if (!pUser) { res.status(401).json({ error: 'سجّل الدخول لاستخدام الرد الاحترافي 👑' }); return; }
      const spend = await spendPoints(pUser, PREMIUM_COST.openai, 'premium_openai');
      if (!spend.ok) { res.status(402).json({ error: 'insufficient_points', reason: 'points', needed: PREMIUM_COST.openai, points: spend.points || 0 }); return; }
      if (!spend.owner) premiumRefund = { user: pUser, amt: PREMIUM_COST.openai };
      useModel = PREMIUM_MODELS.openai;
      isPremium = true;
    } else {
      const usage = await checkAndConsume(token, guestId, 'openai', clientIp(req));
      if (!usage.allowed) {
        if (usage.reason === 'auth') {
          res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
        } else {
          res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + DAILY_LIMIT + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.' });
        }
        return;
      }
    }

    const wantStream = !!body.stream;
    const payload = { model: useModel, messages, stream: wantStream, store: false }; // v544: لا تُخزَّن عند المزوّد
    if (!isPremium) payload.temperature = 0.7; // موديلات gpt-5.x قد ترفض temperature مخصص
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(payload),
    });

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
    if (premiumRefund && !upstream.ok) { try { await refundPoints(premiumRefund.user, premiumRefund.amt); } catch (e2) { /* best-effort */ } }
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
