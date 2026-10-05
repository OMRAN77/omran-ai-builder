// Vercel Serverless Function: proxies chat requests to Anthropic Claude using the site
// owner's own server-side API key (ANTHROPIC_API_KEY env var), so visitors can try the
// app without entering their own key. This key is NEVER exposed to the client.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { spendPoints, refundPoints, verifyPointsToken, PREMIUM_MODELS, PREMIUM_COST } = require('./points.js');

/* v-claude-shape (شكوى المالك: «الكينج لم يستجب HTTP 400» بلا صورة أصلًا):
 * أنثروبيك يرفض المحادثة كلها إذا خالفت شكله — أول رسالة يجب أن تكون user،
 * الأدوار تتناوب، ولا محتوى فارغ. العميل يضع كود المشروع كرسالة assistant
 * في المقدمة، فأي محادثة فيها كود كانت تموت 400 على كلود وحده (البقية
 * يقبلونها) ويتحوّل كل رد للاحتياط. هنا نصلّح الشكل بدل رفض الطلب. */
function sanitizeClaudeMessages(list) {
  const src = (Array.isArray(list) ? list : []).filter((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return false;
    if (typeof m.content === 'string') return m.content.trim().length > 0;
    return Array.isArray(m.content) && m.content.length > 0;
  });
  const out = [];
  for (const m of src) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      if (typeof prev.content === 'string' && typeof m.content === 'string') {
        prev.content += '\n\n' + m.content;
      } else {
        const a = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: String(prev.content) }];
        const b = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }];
        prev.content = a.concat(b);
      }
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', content: 'هذا مشروعي الحالي — اعتمد عليه فيما يلي:' });
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

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
    const { model, system, token, guestId } = body;
    const messages = sanitizeClaudeMessages(body.messages);
    if (!messages.length) {
      res.status(400).json({ error: 'Missing messages' });
      return;
    }

    let premiumRefund = null;
    // v-model-lock: المشترك في سلّة الباقة الواحدة (plan) لا سلّة لكلّ مزوّد.
    const usage = await checkAndConsume(token, guestId, 'claude', clientIp(req), { chatBucket: true });
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: usage.message || ('وصلت للحد اليومي المجاني (' + (usage.limit || DAILY_LIMIT) + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.'), subscribeOnly: !!usage.subscribeOnly }); /* v-tiers */
      }
      return;
    }

    let useModel = model || 'claude-sonnet-5';
    if (useModel === 'claude-3-5-sonnet-latest' || useModel === 'claude-sonnet-4-20250514') useModel = 'claude-sonnet-5';
    /* v-model-lock (فحص الاشتراكات ٥ أكتوبر): لغير المالك وVIP كان اسم النموذج من العميل (Opus مثلًا) بلا خصم نقاط، و«ابني»
       يرسل لهذا الرابط دائمًا بـSonnet خارج حدود الباقة. الآن نموذج الباقة للكود وحدوده اليوميّة نفسها (tier.js PLAN_ROUTING):
       Plus/Pro ‏Haiku، وMax ‏Sonnet ثمّ Haiku؛ بعد الحدّ لا كلود اليوم (402) — المزوّدون الآخرون في «ابني» يكملون. */
    const privileged = require('./_model-guard.js').isPrivileged(usage);
    const meterUser = (!privileged && usage.username) ? usage.username : null; // v-cost-meter
    if (!privileged) {
      const tierLib = require('./tier.js');
      const meters = require('./_usage');
      const used = { haiku: await meters.todayCount(usage.username, 'plan-haiku'), sonnet: await meters.todayCount(usage.username, 'plan-sonnet') };
      const route = tierLib.planRoute({ tier: 'sub', plan: usage.plan, subscriber: true }, 'claude', 'اكتب كود', used, process.env);
      if (!route || route.prov !== 'claude' || !route.model) {
        res.status(402).json({ error: tierLib.FREE_TEXT.engineLimit, reason: 'engine_limit' });
        return;
      }
      useModel = route.model;
      if (route.meter) await meters.bumpCount(usage.username, 'plan-' + route.meter);
    }
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
        max_tokens: privileged ? 32000 : 16000, // v-model-lock: سقف الخرج نفسه في مسار الباقة (chat.js)
        // v465: removed duplicate server-side rules — client already sends comprehensive system prompt
        system: (system || '') || undefined,
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
      // v-cost-meter: توكنات المزوّد من البثّ نفسه (يمرّ كما هو) — تكلفة الطلب في عدّاد شهر الحساب، غير المالك وVIP.
      const tap = meterUser ? require('./cost-meter.js').anthropicUsageTap() : null;
      const dec = tap ? new TextDecoder() : null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
          if (tap) tap.push(dec.decode(value, { stream: true }));
        }
      } catch (e) { /* client likely disconnected */ }
      if (tap) { try { const cm = require('./cost-meter.js'); await cm.addCost(meterUser, cm.tokenCostUsd(useModel, tap.usage()), 'chat'); } catch (e) { /* guard-ok — القياس لا يوقف خدمة */ } }
      res.end();
      return;
    }

    const data = await upstream.text();
    if (meterUser && upstream.ok) { // v-cost-meter: الردّ غير المتدفّق يحمل usage كاملًا
      try {
        const u = (JSON.parse(data) || {}).usage || {};
        const cm = require('./cost-meter.js');
        await cm.addCost(meterUser, cm.tokenCostUsd(useModel, { input: u.input_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens, output: u.output_tokens }), 'chat');
      } catch (e) { /* guard-ok — القياس لا يوقف خدمة */ }
    }
    if (premiumRefund && !upstream.ok) { try { await refundPoints(premiumRefund.user, premiumRefund.amt); } catch (e2) { /* best-effort */ } }
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
