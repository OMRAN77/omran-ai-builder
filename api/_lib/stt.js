// Vercel Serverless Function: speech-to-text via Groq's Whisper model, using the
// site owner's own server-side API key (GROQ_API_KEY env var). This lets the mic
// button work reliably on ALL devices (Android + iPhone + desktop), since it just
// records audio (getUserMedia, supported everywhere) instead of relying on the
// inconsistent/unsupported browser SpeechRecognition API.
const { checkAndConsume, DAILY_LIMIT } = require('./_usage');

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
    const { audioBase64, mimeType, lang, langHint, token, guestId } = body;
    if (!audioBase64) {
      res.status(400).json({ error: 'Missing audioBase64' });
      return;
    }

    const usage = await checkAndConsume(token, guestId, 'stt');
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + DAILY_LIMIT + ' رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.' });
      }
      return;
    }

    const buf = Buffer.from(audioBase64, 'base64');
    const ext = (mimeType && mimeType.includes('mp4')) ? 'mp4'
      : (mimeType && mimeType.includes('ogg')) ? 'ogg'
      : (mimeType && mimeType.includes('wav')) ? 'wav'
      : 'webm';

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType || 'audio/webm' }), 'audio.' + ext);
    form.append('model', 'whisper-large-v3');
    // Deliberately do NOT force a language hint here. `lang` reflects the
    // site's current UI language toggle, not necessarily the language the
    // caller is actually speaking (Maha must understand any of the 7
    // supported languages regardless of the UI setting). Forcing the wrong
    // hint materially hurts Whisper's transcription accuracy, so we always
    // let it auto-detect the spoken language from the audio itself.
    // Ask Whisper for segment-level confidence data (avg_logprob / no_speech_prob),
    // the same signal real voice assistants (Siri, Google Assistant) use to decide
    // whether a transcript is trustworthy enough to act on, or whether to ask the
    // user to repeat themselves instead of guessing.
    form.append('response_format', 'verbose_json');
    // Optional explicit language hint: sent ONLY by the typed-chat mic buttons
    // (where the user is almost certainly speaking the UI language). Maha and
    // the voice tab do NOT send langHint, so they keep full auto-detection.
    const okHints = ['ar', 'en', 'fr', 'hi', 'ur', 'bn', 'ne'];
    if (langHint && okHints.indexOf(langHint) !== -1) form.append('language', langHint);

    const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: form,
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(rawText);
      return;
    }

    let parsed;
    try { parsed = JSON.parse(rawText); } catch (e) { parsed = null; }

    if (!parsed) {
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(rawText);
      return;
    }

    // Compute a simple confidence score from Whisper's own segment stats.
    let lowConfidence = false;
    const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
    if (segments.length) {
      let noSpeechSum = 0, logprobSum = 0;
      for (const s of segments) {
        noSpeechSum += (typeof s.no_speech_prob === 'number') ? s.no_speech_prob : 0;
        logprobSum += (typeof s.avg_logprob === 'number') ? s.avg_logprob : 0;
      }
      const avgNoSpeech = noSpeechSum / segments.length;
      const avgLogprob = logprobSum / segments.length;
      // High no_speech_prob = Whisper itself thinks it may not be real speech.
      // Very negative avg_logprob = Whisper was not confident about the words it picked.
      if (avgNoSpeech > 0.5 || avgLogprob < -1.0) lowConfidence = true;
    }
    // Also flag extremely short transcripts (1-2 words) as low-confidence, since a
    // single garbled word is a common Whisper failure mode on quick/overlapping speech.
    const wordCount = (parsed.text || '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount <= 1) lowConfidence = true;

    // Whisper's own detected spoken language (ISO-639-1-ish code, e.g. "ar",
    // "en", "fr", "hi", "ur", "bn", "ne"). Used downstream to pick a matching
    // TTS voice so Maha replies out loud in the same language the caller
    // actually spoke, regardless of the site's current UI language.
    const detectedLanguage = parsed.language || null;

    // ---- Whisper hallucination filter -------------------------------------
    // On silence/background noise Whisper famously hallucinates YouTube-style
    // filler phrases (it was trained on captioned videos). Strip any known
    // hallucination phrase; if nothing real remains, return empty text.
    let cleanText = (parsed.text || '').trim();
    const HALLUCINATIONS = [
      /اشترك[وا]*\s*(في|بي|بال|ب|فى)?\s*(ال)?قنا[ةه]?[^.،!؟]*/g,
      /(لايك|اعجاب|إعجاب)\s*(و|واشتراك)[^.،!؟]*/g,
      /لا\s*تنس[وىي]*\s*(الاشتراك|الإشتراك|لايك)[^.،!؟]*/g,
      /فع?ل[وا]*\s*(زر\s*)?(الجرس|التنبيهات)[^.،!؟]*/g,
      /ترجمة\s+نانسي\s+قنقر/g,
      /شكرا?ً?\s*(جزيلاً)?\s*(على|ل)?\s*(المشاهدة|المتابعة)[^.،!؟]*/g,
      /سبحان(ك)?\s*اللهم?\s*وبحمد[كه][^.،!؟]*/g,
      /thanks?\s*for\s*watching[^.!?]*/gi,
      /please\s*(like\s*(and)?\s*)?subscribe[^.!?]*/gi,
      /don'?t\s*forget\s*to\s*subscribe[^.!?]*/gi,
      /subscribe\s*to\s*(my|the|our)\s*channel[^.!?]*/gi,
      /see\s*you\s*in\s*the\s*next\s*video[^.!?]*/gi,
      /سأراكم\s*في\s*الفيديو\s*القادم[^.،!؟]*/g,
      /إلى\s*اللقاء\s*في\s*الفيديو\s*القادم[^.،!؟]*/g,
    ];
    for (const rx of HALLUCINATIONS) cleanText = cleanText.replace(rx, ' ');
    // Extra safety net: a short transcript that still mentions subscribing /
    // the channel / likes in any spelling is pure hallucination — drop it all.
    const noSpace = cleanText.replace(/[\s\u064B-\u0652]/g, '');
    if (cleanText.length < 60 && (
      (noSpace.includes('اشترك') || noSpace.includes('إشترك')) ||
      (noSpace.includes('قناه') || noSpace.includes('قناة')) && noSpace.includes('لايك')
    )) {
      cleanText = '';
    }
    cleanText = cleanText.replace(/\s{2,}/g, ' ').trim();
    // If the filter removed everything (or nearly everything), the audio was
    // silence/noise — return empty so the UI simply ignores it.
    if (!cleanText || cleanText.length <= 2) {
      res.status(200).json({ text: '', lowConfidence: true, language: detectedLanguage });
      return;
    }

    // ---- Smart context-based correction (v277) -----------------------------
    // Whisper often garbles dialectal Arabic ("همارة" بدل "إمارة"، "وغيرت" بدل
    // "أبغي"...). Run the transcript through a fast Groq LLM that ONLY fixes
    // mis-heard words using sentence context, without adding or changing meaning.
    if (cleanText.length >= 8) {
      try {
        const fixCtrl = new AbortController();
        const fixTimer = setTimeout(() => fixCtrl.abort(), 8000);
        const fixResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            temperature: 0,
            max_tokens: 1024,
            messages: [
              {
                role: 'system',
                content: 'أنت مصحح نصوص ناتجة عن تحويل الصوت إلى كتابة (speech-to-text). النص قد يحتوي كلمات سُمعت غلط. مهمتك الوحيدة: تصحيح الكلمات المسموعة غلط اعتمادًا على سياق الجملة، مع الحفاظ الكامل على معنى المتكلم ولهجته الخليجية وأسلوبه. أمثلة شائعة: "همارة"→"إمارة"، "وغيرت"→"أبغي"، "اقدد"→"أقصد". قواعد صارمة: لا تضف كلمات جديدة، لا تحذف معنى، لا تغير اللهجة إلى فصحى، لا تجب على النص ولا تعلق عليه. إذا كان النص سليمًا أعده كما هو حرفيًا. أعد النص المصحح فقط بدون أي مقدمات أو علامات اقتباس.',
              },
              { role: 'user', content: cleanText },
            ],
          }),
          signal: fixCtrl.signal,
        });
        clearTimeout(fixTimer);
        if (fixResp.ok) {
          const fixJson = await fixResp.json();
          let fixed = (fixJson && fixJson.choices && fixJson.choices[0] && fixJson.choices[0].message && fixJson.choices[0].message.content || '').trim();
          // Strip accidental wrapping quotes.
          fixed = fixed.replace(/^["'«»\u201C\u201D]+|["'«»\u201C\u201D]+$/g, '').trim();
          // Sanity check: accept only if non-empty and not wildly longer/shorter
          // than the original (guards against the model chatting instead of fixing).
          if (fixed && fixed.length >= cleanText.length * 0.4 && fixed.length <= cleanText.length * 1.8) {
            cleanText = fixed;
          }
        }
      } catch (e) { /* correction is best-effort; keep original text on any failure */ }
    }

    res.status(200).json({ text: cleanText, lowConfidence, language: detectedLanguage });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
