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
    const { text, voice, gender, lang, token, guestId, speed } = body;
    // v-maha-voice-speed (طلب المالك): درجات سرعة كلام مها الأربع — تُترجَم إلى معامل
    // native حقيقي لكل مزوّد (Azure SSML prosody rate% أو معامل speed الرقمي لـOpenAI
    // TTS)، لا playbackRate على العميل (ذاك يغيّر طبقة الصوت أيضًا). قيمة غير معروفة/غائبة
    // تسقط على "normal" (٪0 / 1.0) — نفس السلوك الافتراضي القديم بالضبط لكل مستدعٍ آخر
    // لـ/api/tts (صانع الفيديو، الاستوديو، "استمع" في المحادثة) لا يرسل speed أصلًا.
    // v-maha-pace (المالك: «يا بطيئة ما تفهم عليها ولا سريعة ما تفهم عليها»): ±٢٥٪ و+٥٠٪ كانت خارج الكلام الطبيعيّ.
    // مدى هادئ موحّد مع المكالمة المباشرة (realtime-session.js) وصوت الجهاز الاحتياطيّ (app-02).
    // v-voice-speed-range (المالك: «البطيء جدًّا والسريع جدًّا كأنّه عادي»): ±١٠٪ لا تُسمع — ٠٫٨/١/١٫٢/١٫٤ بين المدى الهادئ
    // والمدى الأوّل (٠٫٧٥/١٫٥ «ما تفهم عليها»)، وكلّ درجة تبعد ١٥٪ فأكثر عن جارتها.
    const TTS_SPEED_MAP = {
      slow: { azureRate: '-20%', openaiSpeed: 0.8 },
      normal: { azureRate: '0%', openaiSpeed: 1 },
      fast: { azureRate: '+20%', openaiSpeed: 1.2 },
      xfast: { azureRate: '+40%', openaiSpeed: 1.4 },
    };
    const ttsSpeed = TTS_SPEED_MAP[speed] || TTS_SPEED_MAP.normal;

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
      // v-tts-free (المالك: «أفضل صوت يقرأ لي… بالمجان»): أفضل صوت عربيّ هنا هو فاطمة/حمدان نفسه، وهو
      // مجّانيّ رسميًّا بباقة Azure المجّانيّة F0 (٥٠٠ ألف حرف شهريًّا، ٢٠ طلبًا في الدقيقة، ولا تُحاسِب أبدًا
      // — تقف عند الحدّ). AZURE_SPEECH_KEY_FREE (مفتاح F0) يُجرَّب أوّلًا، ثمّ AZURE_SPEECH_KEY المدفوع إن وُجد
      // بالصوت نفسه. المفتاح المجّانيّ وحده = مجّانيّ فقط: لا هبوط لـOpenAI المدفوع، والعميل يكمل بصوت الجهاز.
      const azRegion = process.env.AZURE_SPEECH_REGION || 'uaenorth';
      const azFreeKey = String(process.env.AZURE_SPEECH_KEY_FREE || '').trim();
      const azPaidKey = String(process.env.AZURE_SPEECH_KEY || '').trim();
      const azAccounts = [];
      if (azFreeKey) azAccounts.push({ tier: 'free', key: azFreeKey, region: String(process.env.AZURE_SPEECH_REGION_FREE || '').trim() || azRegion });
      if (azPaidKey) azAccounts.push({ tier: 'paid', key: azPaidKey, region: azRegion });
      if (!azAccounts.length) {
        res.status(500).json({ error: 'Server is missing AZURE_SPEECH_KEY' });
        return;
      }
      // Map detected/UI language code -> [xml:lang locale, femaleVoice, maleVoice]
      // Female voice (Maha persona) and male voice (Abdullah persona) both
      // use Microsoft's higher-quality multilingual neural voices, which
      // natively support Arabic and many other languages with one voice
      // name (no need for a per-language voice list).
      // ar → ar-AE (إماراتي خليجي) بأصوات Azure الإماراتية الأصيلة
      // FatimaNeural (أنثى) و HamdanNeural (ذكر) — أصوات إماراتية حقيقية
      const MAHA_VOICE_MAP = {
        ar: ['ar-AE', 'ar-AE-FatimaNeural', 'ar-AE-HamdanNeural'],
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
        '<prosody rate="' + ttsSpeed.azureRate + '" pitch="0%">' + escapeXml(String(text).slice(0, 4000)) + '</prosody>' +
        '</voice></speak>';
      let azResp = null;
      for (const acct of azAccounts) {
        try {
          azResp = await fetch('https://' + acct.region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': acct.key,
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
              'User-Agent': 'omran-ai-builder-maha',
            },
            body: ssml,
          });
        } catch (e) { azResp = null; } // تعثّر شبكة لهذا الحساب — نجرّب التالي
        if (azResp && azResp.ok) {
          const azBuffer = await azResp.arrayBuffer();
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('X-TTS-Tier', acct.tier); // للمسبار: هل خدم المجّانيّ أم المدفوع
          res.status(200).send(Buffer.from(azBuffer));
          return;
        }
      }
      // Azure hiccup (or an unavailable locale/voice) - fall back to
      // OpenAI's multilingual TTS instead of failing the whole reply, so
      // Maha still speaks something rather than going silent.
      // v-tts-free: فقط حين يوجد مفتاح Azure مدفوع (المالك قبِل الدفع) — المجّانيّ وحده لا يلمس محرّكًا مدفوعًا.
      const fallbackKey = azPaidKey ? process.env.OPENAI_API_KEY : '';
      if (fallbackKey) {
        try {
          const fbResp = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + fallbackKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'tts-1', voice: gender === 'male' ? 'onyx' : 'nova', input: String(text).slice(0, 4000), speed: ttsSpeed.openaiSpeed }),
          });
          if (fbResp.ok) {
            const fbBuffer = await fbResp.arrayBuffer();
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('X-TTS-Tier', 'fallback');
            res.status(200).send(Buffer.from(fbBuffer));
            return;
          }
        } catch (e) { /* fall through to error below */ }
      }
      const errText = azResp ? await azResp.text() : 'network';
      res.status(azResp ? azResp.status : 502).json({ error: 'Azure TTS error: ' + errText.slice(0, 500) });
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
      // v-tts-promo: نبرة موجَّهة اختياريًا — gpt-4o-mini-tts يقبل «تعليمات أداء»
      // (حماسي، إعلاني، هادئ…) فيصلح للتعليق التسويقي. الافتراضات كما هي حرفيًا.
      body: JSON.stringify({
        model: body.model === 'gpt-4o-mini-tts' ? 'gpt-4o-mini-tts' : 'tts-1',
        voice: voice || 'onyx',
        input: String(text).slice(0, 4000),
        speed: ttsSpeed.openaiSpeed,
        ...(body.model === 'gpt-4o-mini-tts' && body.instructions
          ? { instructions: String(body.instructions).slice(0, 600) } : {}),
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
