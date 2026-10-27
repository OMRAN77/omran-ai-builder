const { stripPrivateKeys } = require('./_msgs.js'); // v-static-leak
// Vercel Serverless Function: proxies chat requests to DeepSeek using the site
// owner's own server-side API key (DEEPSEEK_API_KEY env var), so visitors can try
// the app without entering their own key. This key is NEVER exposed to the client.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { logError } = require('./log-error.js');

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
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing DEEPSEEK_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { model, system, token, guestId, thinking, reasoning_effort } = body;
    let messages = stripPrivateKeys(body.messages); // v-static-leak: لا مفاتيح __ داخليّة إلى المزوّد
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Missing messages' });
      return;
    }

    // v-model-lock: المشترك في سلّة الباقة الواحدة (plan) لا سلّة لكلّ مزوّد.
    const usage = await checkAndConsume(token, guestId, 'deepseek', clientIp(req), { chatBucket: true });
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: usage.message || ('وصلت للحد اليومي المجاني (' + (usage.limit || DAILY_LIMIT) + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.'), subscribeOnly: !!usage.subscribeOnly }); /* v-tiers */
      }
      return;
    }

    // 🛠️ تغذية النموذج بتعليمات النظام (System Prompt) كما يفعل Claude:
    //    شخصيّة الموقع + قواعد المالك + معرفة المشروع — تمرّ من العميل في body.system.
    if (system && typeof system === 'string' && system.trim()) {
      const __sys0 = messages.find(m => m && m.role === 'system');
      if (__sys0) {
        if (!__sys0.content.includes(system.trim())) {
          __sys0.content = system.trim() + '\n\n' + __sys0.content;
        }
      } else {
        messages.unshift({ role: 'system', content: system.trim() });
      }
    }

    // 🛠️ قاعدة الكود الكامل: DeepSeek يدّعي "بنيت" بدون كود → إلزام صريح
    try {
      const __sys = messages.find(m => m && m.role === 'system');
      const __codeRule = '\n[قاعدة الكود — مطلقة]: إذا قلت إنك بنيت أو عدّلت أو أضفت شيئًا في تطبيق/موقع/لعبة فيجب أن يحتوي ردك نفسه على الكود الكامل داخل كتلة ```html واحدة من <!DOCTYPE html> إلى </html>. ممنوع منعًا باتًا الادعاء بالتنفيذ بدون إرجاع الكود كاملًا في نفس الرد.';
      if (__sys && typeof __sys.content === 'string' && !__sys.content.includes('[قاعدة الكود — مطلقة]')) __sys.content += __codeRule;
    } catch (e) { logError('deepseek/code-rule-inject', e); }

    // 🛠️ اختيار النموذج الرسمي: معرّف OpenRouter (deepseek/deepseek-…) ← الاسم المباشر.
    //    deepseek-flash = V4.1-Flash (الأسرع والأرخص والأحدث، يدعم التفكير والرؤية).
    //    deepseek-v4-pro = V4-Pro (أعمق للمهام المعقّدة، بلا رؤية).
    const m = String(model || '').toLowerCase();
    const useModel = /v4[-_.]?pro|reasoner|\br1\b/.test(m) ? 'deepseek-v4-pro' : 'deepseek-flash';

    // 🛠️ التفكير (Thinking): مفعّل افتراضيًّا وبجهد high عند DeepSeek — يجعله يحلّل
    //    خطوة بخطوة قبل الإجابة (وهو ما يجعله ينافس Claude). يُعطَّل صراحةً بـ thinking=false.
    const wantStream = !!body.stream;
    const enableThinking = body.thinking !== false;
    const reqPayload = {
      model: useModel,
      messages,
      thinking: { type: enableThinking ? 'enabled' : 'disabled' },
      stream: wantStream,
    };
    if (enableThinking && reasoning_effort) reqPayload.reasoning_effort = String(reasoning_effort);
    // temperature يُتجاهَل في وضع التفكير (بلا خطأ)؛ نرسله دائمًا للتوافق.
    reqPayload.temperature = Number(body.temperature !== undefined ? body.temperature : 0.7);
    if (body.max_tokens) reqPayload.max_tokens = Number(body.max_tokens);

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify(reqPayload),
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
    if (!upstream.ok) { require('./_videoFail.js').chatFail(res, 'deepseek', upstream.status, data, usage.tier === 'owner'); return; } // v-audit-prov (srv-providers-5): خطأ المزوّد لغير المالك رمز بلا اسم مزوّد ولا موديل (_videoFail.chatFail)
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
