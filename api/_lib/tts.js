// Vercel Serverless Function: proxies text-to-speech requests to OpenAI's API
// using the site owner's own server-side API key (OPENAI_API_KEY env var), so
// visitors can use cloud voice without entering their own key. Falls back to
// a client-supplied apiKey only if one is explicitly sent (legacy support).
//
// Metered (Azure Speech / OpenAI TTS both bill the owner's own account): logged
// -in users and guests are capped per day; anyone without a token/guestId
// (today's frontend calls) is metered by IP instead of blocked outright, so
// existing calls keep working. The owner account itself is never limited.
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');
const TTS_DAILY_LIMIT = 60;

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
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { text, voice, gender, lang, token, guestId } = body;

    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }

    const usage = await checkAndConsumeCustom(token, guestId, clientIp(req), 'tts', TTS_DAILY_LIMIT);
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + TTS_DAILY_LIMIT + ') لتحويل النص إلى صوت. حاول لاحقًا.' });
      }
      return;
    }

    // Special voice "maha" -> Azure Neural TTS. Maha is multilingual: the
    // voice locale is picked based on the language actually spoken by the
    // caller (detected server-side by Whisper in api/stt.js and passed
    // through as `lang`), not the site's UI language toggle. This means a
    // caller speaking Nepali, Hindi, Urdu, Bengali, French or English gets a
    // natural native-sounding reply instead of the Arabic voice mangling
    // non-Arabic text. Falls back to Gulf Arabic when no language is known.
    if (voice === 'maha') {
      const azKey = process.env.AZURE_SPEECH_KEY;
      const azRegion = process.env.AZURE_SPEECH_REGION || 'uaenorth';
      if (!azKey) {
        res.status(500).json({ error: 'Server is missing AZURE_SPEECH_KEY' });
        return;
      }
      // Map detected/UI language code -> [xml:lang locale, femaleVoice, maleVoice]
      // Female voice (Maha persona) and male voice (Abdullah persona) both
      // use Microsoft's higher-quality multilingual neural voices, which
      // natively support Arabic and many other languages with one voice
      // name (no need for a per-language voice list).
      const MAHA_VOICE_MAP = {
        ar: ['ar-SA', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        en: ['en-US', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        fr: ['fr-FR', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        hi: ['hi-IN', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        ur: ['ur-PK', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        bn: ['bn-BD', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        ne: ['ne-NP', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
      };
      // Normalize possible variants Whisper may return (e.g. "urdu", "nepali").
      const rawLang = String(lang || 'ar').toLowerCase();
      const langAliases = {
        arabic: 'ar', english: 'en', french: 'fr', hindi: 'hi',
        urdu: 'ur', bengali: 'bn', bangla: 'bn', nepali: 'ne',
      };
      const langKey = langAliases[rawLang] || rawLang.slice(0, 2);
      const voiceSet = MAHA_VOICE_MAP[langKey] || MAHA_VOICE_MAP.ar;
      // The multilingual neural voices read xml:lang to pick which
      // language/accent to speak the text in, so we still pass the actual
      // detected locale (e.g. ar-SA) even though the voice name itself is
      // shared across all languages.
      const locale = voiceSet[0];
      const voiceName = gender === 'male' ? voiceSet[2] : voiceSet[1];
      const escapeXml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      const ssml = '<speak version="1.0" xml:lang="' + locale + '">' +
        '<voice name="' + voiceName + '">' +
        '<prosody rate="0%" pitch="0%">' + escapeXml(String(text).slice(0, 4000)) + '</prosody>' +
        '</voice></speak>';
      const azResp = await fetch('https://' + azRegion + '.tts.speech.microsoft.com/cognitiveservices/v1', {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': azKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'omran-ai-builder-maha',
        },
        body: ssml,
      });
      if (!azResp.ok) {
        // Azure hiccup (or an unavailable locale/voice) - fall back to
        // OpenAI's multilingual TTS instead of failing the whole reply, so
        // Maha still speaks something rather than going silent.
        const fallbackKey = process.env.OPENAI_API_KEY;
        if (fallbackKey) {
          try {
            const fbResp = await fetch('https://api.openai.com/v1/audio/speech', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + fallbackKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: 'tts-1', voice: gender === 'male' ? 'onyx' : 'nova', input: String(text).slice(0, 4000) }),
            });
            if (fbResp.ok) {
              const fbBuffer = await fbResp.arrayBuffer();
              res.setHeader('Content-Type', 'audio/mpeg');
              res.status(200).send(Buffer.from(fbBuffer));
              return;
            }
          } catch (e) { /* fall through to error below */ }
        }
        const errText = await azResp.text();
        res.status(azResp.status).json({ error: 'Azure TTS error: ' + errText.slice(0, 500) });
        return;
      }
      const azBuffer = await azResp.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.status(200).send(Buffer.from(azBuffer));
      return;
    }

    const apiKey = body.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
      return;
    }

    const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: voice || 'onyx',
        input: String(text).slice(0, 4000),
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: 'OpenAI error: ' + errText.slice(0, 500) });
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
