// صوت التطبيق بمفاتيح الخادم وحدها:
// - voice 'maha' (مها وعبدالله، وكلّ القراءة في التطبيق): العربيّ من Gemini (v-allah-tafkhim)، وغيره وأيّ تعثّر من Azure.
// - أيّ صوت آخر (المحرّك الثاني، v-tts-gemini): Gemini بالصوت والأسلوب المطلوبين، وأيّ تعثّر من Azure.
//
// Metered (every engine bills the owner's own account): logged-in users and guests are capped per day; anyone without a
// token/guestId is metered by IP instead of blocked outright, so existing calls keep working. The owner account itself
// is never limited.
const { checkAndConsumeCustom, clientIp } = require('./_usage.js');
const TTS_DAILY_LIMIT = 60;

/* v-tts-gemini: WAV المحرّك الثاني، كفرع مها: فوق ٣٫٥ م.ب يُبثّ على دفعات، لأنّ حدّ ٤٫٥ م.ب في Vercel لا يسري على المبثوث. */
function sendWav(res, wav) {
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-TTS-Tier', 'gemini');
  res.status(200);
  if (wav.length > 3.5 * 1024 * 1024 && typeof res.write === 'function') {
    if (res.flushHeaders) res.flushHeaders();
    for (let i = 0; i < wav.length; i += 512 * 1024) res.write(wav.subarray(i, i + 512 * 1024));
    res.end();
  } else res.send(wav);
}

/* v-tts-gemini: احتياط المحرّك الثاني بلا صمت.
   - صوت Azure بمفتاحه المجّانيّ أوّلًا، ثمّ المدفوع إن وُجد، بجنس الصوت المطلوب.
   - العربيّ فاطمة أو حمدان (ar-AE)، وغيره الصوتان متعدّدا اللغات.
   - النصّ كما أُرسل، لأنّ التنظيف لصوت مها وحده (v-tts-no-markdown).
   يعيد {buf, tier} أو null. */
async function azureVoice(text, male, lang, rate) {
  const region = process.env.AZURE_SPEECH_REGION || 'uaenorth';
  const free = String(process.env.AZURE_SPEECH_KEY_FREE || '').trim();
  const paid = String(process.env.AZURE_SPEECH_KEY || '').trim();
  const accts = [];
  if (free) accts.push({ tier: 'free', key: free, region: String(process.env.AZURE_SPEECH_REGION_FREE || '').trim() || region });
  if (paid) accts.push({ tier: 'paid', key: paid, region });
  const ar = /^ar/i.test(String(lang || '')) || /[\u0600-\u06FF]/.test(text);
  const [locale, femaleName, maleName] = ar
    ? ['ar-AE', 'ar-AE-FatimaNeural', 'ar-AE-HamdanNeural']
    : ['en-US', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const ssml = '<speak version="1.0" xml:lang="' + locale + '"><voice name="' + (male ? maleName : femaleName) + '">'
    + '<prosody rate="' + rate + '" pitch="0%">' + esc(text) + '</prosody></voice></speak>';
  for (const a of accts) {
    try {
      const r = await fetch('https://' + a.region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': a.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'omran-ai-builder-voice' },
        body: ssml,
      });
      if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), tier: a.tier };
    } catch (e) { /* guard-ok — تعثّر شبكة لهذا الحساب: التالي */ }
  }
  return null;
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
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { text: rawText, voice, gender, lang, token, guestId, speed, dialect } = body;
    // v-tts-no-markdown (المالك: «يقول كل مرّة نجمة نجمة»): صوت مها وكلّ ما يمرّ به (الردود والفيديو والمكالمة) يقرأ الكلام وحده —
    // بلا علامات التنسيق والروابط والرموز التعبيريّة (api/_lib/speech-text.js). الأصوات الأخرى تُرسل كما هي.
    const text = voice === 'maha' ? require('./speech-text.js').speechText(rawText) : rawText;
    // v-maha-voice-speed (طلب المالك): درجات سرعة كلام مها الأربع — تُترجَم إلى معامل
    // native حقيقي لكل مزوّد (Azure SSML prosody rate% أو معامل speed الرقمي لـOpenAI
    // TTS)، لا playbackRate على العميل (ذاك يغيّر طبقة الصوت أيضًا). قيمة غير معروفة/غائبة
    // تسقط على "normal" (٪0 / 1.0) — نفس السلوك الافتراضي القديم بالضبط لكل مستدعٍ آخر
    // لـ/api/tts (صانع الفيديو، الاستوديو، "استمع" في المحادثة) لا يرسل speed أصلًا.
    // v-maha-pace (المالك: «يا بطيئة ما تفهم عليها ولا سريعة ما تفهم عليها»): ±٢٥٪ و+٥٠٪ كانت خارج الكلام الطبيعيّ.
    // مدى هادئ موحّد مع المكالمة المباشرة (realtime-session.js) وصوت الجهاز الاحتياطيّ (app-02).
    const TTS_SPEED_MAP = {
      slow: { azureRate: '-10%', openaiSpeed: 0.9 },
      normal: { azureRate: '0%', openaiSpeed: 1 },
      fast: { azureRate: '+10%', openaiSpeed: 1.1 },
      xfast: { azureRate: '+20%', openaiSpeed: 1.2 },
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

    // v-om-voices-chat: «استمع» على ردود المحادثة (src: 'reply') للمالك وحده بأصوات «أصوات om» بدل مها
    // (api/_lib/om-voices.js). عند حدّها اليوميّ ⇐ om-quota فيُظهر العميل رسالة الحدّ ولا يقرأ بصوت آخر.
    // مكالمة مها وبقيّة الأدوات لا ترسل src فلا تتغيّر، ولغة لا ينطقها المحرّك تبقى بمها.
    if (voice === 'maha' && body.src === 'reply') {
      const om = require('./om-voices.js');
      // v-reply-dialect (المالك ٢٩ أكتوبر «٦ من ١٠ فضيحة… التطبيقات عندهم بلهجتهم»، ثمّ «سوّيها»): الصوتان المدرَّبان بالفصحى
      // خرجا من «استمع»؛ يقرأ مها باللهجة المختارة (تحت). OM_VOICES_REPLY=1 يعيدهما (لصوت خليجيّ مدرَّب لاحقًا).
      if (String(process.env.OM_VOICES_REPLY || '').trim() === '1' && om.enabledFor(usage.username, lang)) {
        try {
          const wav = await om.speak({ text, lang, gender });
          res.setHeader('Content-Type', 'audio/wav');
          res.setHeader('Cache-Control', 'no-store');
          res.status(200).send(wav);
        } catch (e) {
          const quota = e && e.code === 'om_quota';
          // v-om-voices-piper: سيرفر الصوتين الخفيفين نائم ⇐ om-waking (العميل: «حاول مرة ثانية»، بلا صوت بديل)
          if (e && e.code === 'om_waking') { res.status(503).json({ error: 'om-waking', code: 'om_waking' }); return; }
          res.status(quota ? 429 : 502).json({ error: quota ? 'om-quota' : (e && e.message) || 'om-failed', code: quota ? 'om_quota' : 'om_failed' });
        }
        return;
      }
    }

    // Special voice "maha" -> Azure Neural TTS. Maha is multilingual: the
    // voice locale is picked based on the language actually spoken by the
    // caller (detected server-side by Whisper in api/stt.js and passed
    // through as `lang`), not the site's UI language toggle. This means a
    // caller speaking Nepali, Hindi, Urdu, Bengali, French or English gets a
    // natural native-sounding reply instead of the Arabic voice mangling
    // non-Arabic text. Falls back to Gulf Arabic when no language is known.
    if (voice === 'maha') {
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
        /* v-app-director (المالك: «بأيّ لغة أريدها»): بقيّة لغات الواجهة الأربع عشرة بالصوتين متعدّدَي اللغات أنفسهما —
           كانت تسقط على العربيّة فيُقرأ النصّ الإسبانيّ بصوت عربيّ */
        es: ['es-ES', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        tr: ['tr-TR', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        ru: ['ru-RU', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        zh: ['zh-CN', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        id: ['id-ID', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        fil: ['fil-PH', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
        ml: ['ml-IN', 'en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural'],
      };
      // Normalize possible variants Whisper may return (e.g. "urdu", "nepali").
      const rawLang = String(lang || 'ar').toLowerCase();
      const langAliases = {
        arabic: 'ar', english: 'en', french: 'fr', hindi: 'hi',
        urdu: 'ur', bengali: 'bn', bangla: 'bn', nepali: 'ne',
      };
      const langKey = langAliases[rawLang] || (MAHA_VOICE_MAP[rawLang] ? rawLang : rawLang.slice(0, 2));
      // v-allah-tafkhim (المالك: «كلمة الله وليست الاه… تكون مضخمه»، وبعد العيّنة: «ابدأ لكلّ الكلام»): الكلام العربيّ كلّه
      // بصوتَي مها وعبدالله من api/_lib/gemini-tts.js. يفخّم لفظ الجلالة في موضعه ويرقّقه بعد الكسر، وأصوات Azure الرجاليّة
      // ترقّقه في كلّ موضع. «هلا والله» تبقى كما كُتبت فيه. أيّ تعثّر (حدّ اليوم، الرصيد، المهلة، السقف) = صوت Azure
      // القديم تحت، كما كان حرفيًّا.
      if (langKey === 'ar') {
        let g = null;
        try {
          // سقف ٤٠٠٠ حرف كمسار Azure: لا يدفع طلب واحد ثمن نصّ ضخم
          g = await require('./gemini-tts.js').speakMaha({ text: require('./speech-text.js').speechText(rawText, { wallah: true }).slice(0, 4000), gender, dialect, speed });
        } catch (e) { g = null; /* guard-ok — عطل غير متوقّع في المسار الجديد = صوت Azure القديم */ }
        if (g && g.wav) {
          res.setHeader('Content-Type', 'audio/wav');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-TTS-Tier', 'gemini'); // للمسبار: أيّ صوت خدم
          res.status(200);
          // الردّ المبثوث لا يسري عليه حدّ ٤٫٥ م.ب في Vercel (تعليق فيديو طويل بـWAV)؛ القصير كما كان دفعة واحدة
          if (g.wav.length > 3.5 * 1024 * 1024 && typeof res.write === 'function') {
            if (res.flushHeaders) res.flushHeaders();
            for (let i = 0; i < g.wav.length; i += 512 * 1024) res.write(g.wav.subarray(i, i + 512 * 1024));
            res.end();
          } else res.send(g.wav);
          return;
        }
      }
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
      // v-reply-dialect: النصّ العربيّ بلهجة يختارها المستخدم في «الصوت» (العميل يرسلها لـ«استمع» وتجربة الصوت) — أصوات
      // Azure الأصيلة لكلّ بلد، رجل وامرأة، بالمفتاح والحساب نفسيهما. غير معروفة أو غائبة = الإماراتيّ كما كان.
      const AR_DIALECT_VOICES = {
        ae: ['ar-AE', 'ar-AE-FatimaNeural', 'ar-AE-HamdanNeural'],
        om: ['ar-OM', 'ar-OM-AyshaNeural', 'ar-OM-AbdullahNeural'],
        sa: ['ar-SA', 'ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'],
        kw: ['ar-KW', 'ar-KW-NouraNeural', 'ar-KW-FahedNeural'],
        qa: ['ar-QA', 'ar-QA-AmalNeural', 'ar-QA-MoazNeural'],
        bh: ['ar-BH', 'ar-BH-LailaNeural', 'ar-BH-AliNeural'],
      };
      const baseSet = MAHA_VOICE_MAP[langKey] || MAHA_VOICE_MAP.ar;
      const voiceSet = (baseSet === MAHA_VOICE_MAP.ar && Object.prototype.hasOwnProperty.call(AR_DIALECT_VOICES, dialect)
        && AR_DIALECT_VOICES[dialect]) || baseSet;
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
            body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: gender === 'male' ? 'cedar' : 'marin', input: String(text).slice(0, 4000), speed: ttsSpeed.openaiSpeed }),
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

    /* v-tts-gemini (المالك ٩ نوفمبر: «ابدأ… وحطهم في التطبيق»): المحرّك الثاني، أيّ صوت غير maha.
       - من يستعمله: راوي «قصص الأنبياء» (onyx وash بتعليمات)، وتعليق الإعلانات، وسكربتات المالك.
       - كان OpenAI ‏/v1/audio/speech. OpenAI تحذف نماذجه كلّها من الـAPI في ٦ يناير ٢٠٢٧ (صفحة deprecations الرسميّة).
       - بديلها المقترح gpt-realtime-2.1-mini نموذج محادثة على اتّصال مفتوح، لا قارئ.
       - الآن Gemini 3.8 Flash TTS من gemini-tts.js، بالحصّة والسقف اليوميّ والتبريد نفسها التي لصوت مها.
       - اسم صوت OpenAI ← صوت Gemini بالجنس نفسه، أو يُرسل اسم صوت Gemini مباشرةً، و«instructions» أسلوب الإلقاء.
       - أيّ تعثّر = صوت Azure بجنس الصوت (لا صمت)، وX-TTS-Tier يقول أيّهما خدم (gemini / free / paid).
       - لا يُقبل بعد اليوم مفتاح يرسله العميل (كان يُقبل قديمًا)، ولا اسم مزوّد في نصّ الخطأ. */
    const gem = require('./gemini-tts.js');
    const pick = gem.genericVoice(voice, gender);
    const say = String(text).slice(0, 4000);
    let g = null;
    try {
      g = await gem.speakVoice({ text: say, voiceName: pick.voice, styleText: gem.genericStyle(body.instructions, speed) });
    } catch (e) { g = null; /* guard-ok — عطل غير متوقّع في المحرّك = صوت Azure تحت */ }
    if (g && g.wav) { sendWav(res, g.wav); return; }
    const az = await azureVoice(say, pick.male, lang, ttsSpeed.azureRate);
    if (az) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('X-TTS-Tier', az.tier);
      res.status(200).send(az.buf);
      return;
    }
    res.status(502).json({ error: 'tts_unavailable' });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
