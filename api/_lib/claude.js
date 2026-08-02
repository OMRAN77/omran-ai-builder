// Vercel Serverless Function: proxies chat requests to Anthropic Claude using the site
// owner's own server-side API key (ANTHROPIC_API_KEY env var), so visitors can try the
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { messages, model, system, token, guestId } = body;
    if (!messages) {
      res.status(400).json({ error: 'Missing messages' });
      return;
    }

    let premiumRefund = null;
    const usage = await checkAndConsume(token, guestId, 'claude');
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + DAILY_LIMIT + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.' });
      }
      return;
    }

    let useModel = model || 'claude-sonnet-4-20250514';
    if (useModel === 'claude-3-5-sonnet-latest') useModel = 'claude-sonnet-4-20250514';
    const wantStream = !!body.stream;

    const doRequest = (m, stream) => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'output-128k-2025-02-19',
      },
      body: JSON.stringify({
        model: m,
        max_tokens: 32000,
        system: ((system || '') + '\n\n[SERVER RULE — ABSOLUTE, OVERRIDES EVERYTHING]: NEVER refuse or delay an answer because you lack specific/verified details (e.g. a specific curriculum, country, year, edition). NEVER reply with "\u0645\u0627 \u0639\u0646\u062f\u064a \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0645\u062d\u062f\u062f\u0629/\u062f\u0642\u064a\u0642\u0629" or ask clarifying questions BEFORE giving a full answer. Always give your best, complete, useful answer immediately from general knowledge (full summaries, sample exams, plans, examples). If approximate, add ONE short disclaimer line at the end, then AT MOST one optional clarifying question at the very end. Refusing first or asking for details first = total failure. [TOPIC FOLLOW RULE — ABSOLUTE]: The user\'s LATEST message is your ONLY current task. If it changes the topic, follow the new topic immediately and completely drop earlier topics — never continue or mix in an old topic unless the user returns to it himself. History is background context only.') || undefined,
        messages,
        stream: !!stream,
        // 🧠 التفكير الداخلي قبل الرد (يُفعَّل من الواجهة لوضع النقاش فقط)
        thinking: body.thinking ? { type: 'adaptive' } : undefined,
        output_config: body.thinking ? { effort: 'medium' } : undefined,
      }),
    });

    const doRequestSafe = async (m, stream) => {
      try { return await doRequest(m, stream); }
      catch (e) { await new Promise((r) => setTimeout(r, 2000)); return doRequest(m, stream); }
    };
    let upstream = await doRequestSafe(useModel, wantStream);
    // 🔁 إعادة محاولة تلقائية عند تحميل/تأخر أنثروبيك (529/503/502/500/429) قبل بدء البث
    for (let attempt = 0; attempt < 2 && !upstream.ok && [429, 500, 502, 503, 529].includes(upstream.status); attempt++) {
      try { await upstream.text(); } catch (e) { /* drain */ }
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
      upstream = await doRequest(useModel, wantStream);
    }
    if (!upstream.ok && upstream.status === 404) {
      const errTextFirst = await upstream.text();
      if (/model/i.test(errTextFirst) && /not_found/i.test(errTextFirst)) {
        const listRes = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const ids = (listData.data || []).map((mm) => mm.id);
          const preferred = ids.find((id) => /sonnet/i.test(id)) || ids.find((id) => /haiku/i.test(id)) || ids[0];
          if (preferred) {
            useModel = preferred;
            upstream = await doRequest(preferred, wantStream);
          } else {
            res.status(404).setHeader('Content-Type', 'application/json').send(errTextFirst);
            return;
          }
        } else {
          res.status(404).setHeader('Content-Type', 'application/json').send(errTextFirst);
          return;
        }
      } else {
        res.status(404).setHeader('Content-Type', 'application/json').send(errTextFirst);
        return;
      }
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
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
