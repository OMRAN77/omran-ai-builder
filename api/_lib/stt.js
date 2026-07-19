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
    const { audioBase64, mimeType, lang, token, guestId } = body;
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

    res.status(200).json({ text: parsed.text || '', lowConfidence, language: detectedLanguage });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
