// Vercel Serverless Function: proxies chat requests to Google Gemini using the site
// owner's own server-side API key (GEMINI_API_KEY env var), so visitors can try the
// app without entering their own key. This key is NEVER exposed to the client.
const { checkAndConsume, DAILY_LIMIT } = require('./_usage');
const { spendPoints, refundPoints, verifyPointsToken, PREMIUM_MODELS, PREMIUM_COST } = require('./points.js');

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { contents, systemInstruction, model, token, guestId } = body;
    if (!contents) {
      res.status(400).json({ error: 'Missing contents' });
      return;
    }

    let premiumRefund = null;
    const usage = await checkAndConsume(token, guestId, 'gemini');
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + DAILY_LIMIT + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.' });
      }
      return;
    }

    const useModel = model || 'gemini-flash-latest';
    const wantStream = !!body.stream;
    const endpoint = wantStream
      ? `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:streamGenerateContent?alt=sse&key=${apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`;
    const reqBody = { contents };
    if (systemInstruction) reqBody.systemInstruction = systemInstruction;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (wantStream && !upstream.ok) {
      let detail = '';
      try {
        const parsed = JSON.parse(await upstream.text());
        detail = (parsed && parsed.error && parsed.error.message) || '';
      } catch (e2) {}
      console.error('[gemini] stream ' + upstream.status + ' (' + useModel + '): ' + detail);
      res.status(upstream.status).json({
        error: 'Gemini (' + upstream.status + '): ' + (detail || 'خطأ غير معروف'),
        provider: 'gemini',
        model: useModel,
      });
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
    if (premiumRefund && !upstream.ok) { try { await refundPoints(premiumRefund.user, premiumRefund.amt); } catch (e2) { /* best-effort */ } }

    if (!upstream.ok) {
      let detail = '';
      try {
        const parsed = JSON.parse(data);
        detail = (parsed && parsed.error && parsed.error.message) || '';
      } catch (e2) {
        detail = String(data || '').slice(0, 300);
      }
      console.error('[gemini] upstream ' + upstream.status + ' (' + useModel + '): ' + detail);
      res.status(upstream.status).json({
        error: 'Gemini (' + upstream.status + '): ' + (detail || 'خطأ غير معروف'),
        provider: 'gemini',
        model: useModel,
        detail: detail,
      });
      return;
    }
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
