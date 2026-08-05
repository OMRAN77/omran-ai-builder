// Telegram bot webhook: @OmranAIBuilder_bot
// Receives Telegram updates, replies via Claude (owner's key).
// Free tier: 10 messages/day per user, then promotes the app.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');

const { kvGetJSON, kvPutJSON, kvIncr, kvExpire } = require('./_lib/kv');

const APP_URL = 'https://omran-ai-builder.vercel.app';
const DAILY_LIMIT = 10;

const SYSTEM = 'أنت «Omran AI» — المساعد الذكي الرسمي لتطبيق «Omran AI Builder» من فريق عمران AI. '
  + 'شخصيتك — فنان خفيف الدم: '
  + '① أسلوبك مرح وجذاب وفيه روح، بعربية طبيعية بلمسة إماراتية (أو بلغة المستخدم إذا كتب بلغة أخرى). '
  + '② تمزح مزحة خفيفة بمكانها بدون مبالغة، وتستخدم تشبيهات حلوة تخلي الشرح ممتع. '
  + '③ مع المرح أنت دقيق ومفيد — المعلومة صحيحة وكاملة، والمزح ما يأكل من الفايدة. '
  + '④ ردودك قصيرة وحيوية، بلا حشو ولا تكرار. تحية واحدة فقط في بداية المحادثة. '
  + '⑤ صادق دائمًا: ممنوع تدّعي إنك سويت شي ما سويته، وممنوع اختراع معلومات. '
  + '⑥ إذا الطلب غامض تسأل سؤال توضيح واحد كحد أقصى بأسلوب لطيف. '
  + 'أنت داخل بوت تيليغرام، فلا تستخدم تنسيق Markdown معقد — نص عادي وأسطر قصيرة فقط. '
  + 'إذا طلب المستخدم صورًا أو فيديو أو بناء موقع/تطبيق، اشرح له باختصار أن هذي الميزات متوفرة كاملة في التطبيق: ' + APP_URL + ' '
  + 'الدولة الافتراضية للمستخدم هي الإمارات. ممنوع اختراع معلومات أو أرقام هواتف.';

async function tg(token, method, payload) {
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await r.json().catch(() => null);
  } catch (e) { return null; }
}

module.exports = withErrorCapture('telegram', async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TG_WEBHOOK_SECRET;
  if (!token) { res.status(500).json({ ok: false }); return; }
  // Fail closed. The old `if (secret && …)` skipped the whole check whenever
  // TG_WEBHOOK_SECRET was unset, so anyone who found the URL could post forged
  // Telegram updates. A missing secret is a misconfiguration, not permission.
  if (!secret) {
    console.error('[telegram] TG_WEBHOOK_SECRET is not set — refusing every webhook call.');
    res.status(503).json({ error: 'webhook not configured' });
    return;
  }
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).json({ ok: false }); return;
  }

  // Always ACK Telegram quickly so it doesn't retry.
  const ack = () => { try { res.status(200).json({ ok: true }); } catch (e) {} };

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const msg = body.message || body.edited_message;
    if (!msg || !msg.chat) { ack(); return; }

    const chatId = msg.chat.id;
    const text = (msg.text || msg.caption || '').trim();

    // /start welcome
    if (text === '/start' || text.indexOf('/start ') === 0) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'حياك الله في Omran AI 🤖\n\nأنا المساعد الذكي الرسمي لتطبيق Omran AI Builder.\nاسألني أي شي: معلومات، ترجمة، أفكار، نصائح — وأرد عليك فورًا.\n\nعندك ' + DAILY_LIMIT + ' رسائل مجانية يوميًا.\nللمميزات الكاملة (صور، فيديو، بناء مواقع، مساعد صوتي):\n' + APP_URL,
      });
      ack(); return;
    }

    if (!text) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: 'أرسل لي رسالة نصية وأساعدك 👍' });
      ack(); return;
    }
    if (text.length > 4000) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: 'الرسالة طويلة جدًا — اختصرها شوي 🙏' });
      ack(); return;
    }

    // Daily quota per chat
    const day = new Date().toISOString().slice(0, 10);
    const qKey = 'tg/quota/' + chatId + '/' + day;
    const used = await kvIncr(qKey);
    if (used === 1) await kvExpire(qKey, 90000);
    if (used > DAILY_LIMIT) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'خلصت رسائلك المجانية لليوم (' + DAILY_LIMIT + ' رسائل) ⏳\n\nكمّل بلا حدود مع مميزات أقوى — صور، فيديو، بناء مواقع، مساعد صوتي:\n' + APP_URL + '\n\nوترجع رسائلك المجانية هنا بكرة إن شاء الله 🌟',
      });
      ack(); return;
    }

    // Typing indicator (best-effort)
    tg(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });

    // Short conversation history
    const hKey = 'tg/hist/' + chatId;
    let hist = (await kvGetJSON(hKey)) || [];
    if (!Array.isArray(hist)) hist = [];
    hist.push({ role: 'user', content: text });
    if (hist.length > 12) hist = hist.slice(-12);

    // Claude reply
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let reply = '';
    const callClaude = async (model) => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: 1500, system: SYSTEM, messages: hist }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data && data.content && data.content[0]) {
        return data.content.map(c => c.text || '').join('').trim();
      }
      return { failed: true, status: r.status };
    };
    try {
      let out = await callClaude('claude-sonnet-5');
      if (out && out.failed && out.status === 404) {
        // Model retired → pick current sonnet from live list
        const lr = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        });
        const ld = lr.ok ? await lr.json().catch(() => null) : null;
        const ids = ((ld && ld.data) || []).map(m => m.id);
        const pick = ids.find(id => /sonnet/i.test(id)) || ids.find(id => /haiku/i.test(id)) || ids[0];
        if (pick) out = await callClaude(pick);
      }
      if (typeof out === 'string') reply = out;
    } catch (e) {}

    if (!reply) reply = 'صار خلل بسيط — عيد إرسال رسالتك بعد لحظات 🙏';

    hist.push({ role: 'assistant', content: reply });
    await kvPutJSON(hKey, hist.slice(-12));
    await kvExpire(hKey, 60 * 60 * 24 * 7);

    // Telegram max message length = 4096
    for (let i = 0; i < reply.length; i += 4000) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: reply.slice(i, i + 4000) });
    }
    ack();
  } catch (e) {
    ack();
  }
});
