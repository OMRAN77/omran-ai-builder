// Vercel Serverless Function: proxies chat requests to Google Gemini using the site
// owner's own server-side API key (GEMINI_API_KEY env var). Key is NEVER exposed.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { spendPoints, refundPoints, verifyPointsToken, PREMIUM_MODELS, PREMIUM_COST } = require('./points.js');

// ————— إعدادات السجل —————
const MAX_TURNS       = 24;        // أقصى عدد رسائل ترسل للنموذج
const MAX_CHARS       = 120000;    // سقف حجم النص الكلي
const KEEP_IMAGES_IN  = 2;         // الصور تبقى في آخر رسالتين فقط، وتُحذف من الأقدم

/**
 * ينظّف مصفوفة contents لتوافق شروط جيميناي:
 * - يحذف الرسائل الفارغة
 * - يوحّد الأدوار (user / model فقط)
 * - يدمج الرسائل المتتالية بنفس الدور
 * - يضمن أن تبدأ بـ user وتنتهي بـ user
 */
function sanitizeContents(input) {
  if (!Array.isArray(input)) return [];

  let out = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;

    const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
    const parts = (Array.isArray(item.parts) ? item.parts : [])
      .filter((p) => p && (
        (typeof p.text === 'string' && p.text.trim() !== '') ||
        (p.inlineData && p.inlineData.data) ||
        p.fileData
      ));

    if (!parts.length) continue;

    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.parts = prev.parts.concat(parts);   // دمج بدل الرفض
    } else {
      out.push({ role, parts });
    }
  }

  while (out.length && out[0].role !== 'user') out.shift();   // لازم تبدأ بـ user
  while (out.length && out[out.length - 1].role !== 'user') out.pop(); // ولازم تنتهي بـ user

  return out;
}

/**
 * يقلّص السجل: يحذف الصور القديمة (السبب الأول لانهيار المحادثة)،
 * ثم يقص من البداية حتى يدخل ضمن الحدود، مع الحفاظ على البداية بـ user.
 */
function trimContents(contents) {
  const c = contents.map((m) => ({ role: m.role, parts: m.parts.slice() }));
  const cutoff = c.length - KEEP_IMAGES_IN;

  // 1) استبدل الصور القديمة بنص بديل بدل حملها بالكامل
  for (let i = 0; i < cutoff; i++) {
    c[i].parts = c[i].parts.map((p) =>
      p.inlineData || p.fileData ? { text: '[صورة مرفقة سابقًا]' } : p
    );
  }

  // 2) قص حسب عدد الرسائل
  let trimmed = c.length > MAX_TURNS ? c.slice(-MAX_TURNS) : c;

  // 3) قص حسب الحجم
  const size = (arr) => JSON.stringify(arr).length;
  while (trimmed.length > 2 && size(trimmed) > MAX_CHARS) {
    trimmed = trimmed.slice(2); // رسالتين معًا للحفاظ على التناوب
  }

  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();
  return trimmed;
}

/** يستخرج النص من رد جيميناي ويشرح سبب الفراغ إن وُجد */
function readReply(parsed) {
  const cand = parsed && parsed.candidates && parsed.candidates[0];
  const blocked = parsed && parsed.promptFeedback && parsed.promptFeedback.blockReason;

  if (blocked) {
    return { text: '', error: 'تم حجب الطلب من مرشّح الأمان (' + blocked + ').' };
  }
  if (!cand) {
    return { text: '', error: 'لم يرجع النموذج أي رد.' };
  }

  const text = (cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [])
    .map((p) => p.text || '')
    .join('');

  if (!text.trim()) {
    const why = cand.finishReason || 'UNKNOWN';
    const msg = why === 'MAX_TOKENS' ? 'انقطع الرد لتجاوز الحد الأقصى للطول.'
              : why === 'SAFETY'     ? 'تم إيقاف الرد من مرشّح الأمان.'
              : why === 'RECITATION' ? 'تم إيقاف الرد بسبب تطابق مع محتوى محمي.'
              : 'رد فارغ من النموذج (' + why + ').';
    return { text: '', error: msg };
  }

  return { text, error: null };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');

    const { contents, systemInstruction, model, token, guestId } = body;
    if (!contents) { res.status(400).json({ error: 'Missing contents' }); return; }

    // ————— التنظيف والتقليص قبل أي شيء —————
    const clean = trimContents(sanitizeContents(contents));
    if (!clean.length) {
      res.status(400).json({ error: 'المحادثة فارغة أو غير صالحة. ابدأ برسالة جديدة.' });
      return;
    }

    let premiumRefund = null;
    const usage = await checkAndConsume(token, guestId, 'gemini', clientIp(req));
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

    const reqBody = {
      contents: clean,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.8,
      },
    };
    if (systemInstruction) reqBody.systemInstruction = systemInstruction;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(55000),
    });

    // فشل الستريم لا يصل للكتلة أدناه، فنعالجه هنا بدل بثّ فارغ
    if (wantStream && !upstream.ok) {
      let detail = '';
      try {
        const parsed = JSON.parse(await upstream.text());
        detail = (parsed && parsed.error && parsed.error.message) || '';
      } catch (e2) { /* non-JSON error body */ }
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
      res.setHeader('X-Accel-Buffering', 'no');   // يمنع تجميع البث ووقوفه فجأة
      if (res.flushHeaders) res.flushHeaders();

      const reader = upstream.body.getReader();
      let got = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          got = true;
          res.write(value);
        }
      } catch (e) { /* client likely disconnected */ }

      // بث انتهى بلا أي محتوى = المستخدم يشوف فراغ. أخبره بدل الصمت.
      if (!got) {
        res.write('data: ' + JSON.stringify({
          error: 'لم يصل أي رد من النموذج. حاول مرة أخرى أو ابدأ محادثة جديدة.',
        }) + '\n\n');
      }
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

    // 200 لا يعني وجود رد. افحص المحتوى فعليًا قبل تمريره.
    let parsed = null;
    try { parsed = JSON.parse(data); } catch (e2) { /* ignore */ }

    if (parsed) {
      const { text, error } = readReply(parsed);
      if (error) {
        console.warn('[gemini] empty reply (' + useModel + '): ' + error);
        res.status(502).json({ error, provider: 'gemini', model: useModel });
        return;
      }
      void text;
    }

    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (e) {
    const msg = e && e.name === 'TimeoutError'
      ? 'انتهت مهلة الاتصال بالنموذج. حاول مرة أخرى.'
      : 'Proxy error: ' + (e && e.message ? e.message : String(e));
    res.status(500).json({ error: msg });
  }
};
