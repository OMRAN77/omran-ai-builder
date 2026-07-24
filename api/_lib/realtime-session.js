// Vercel Serverless Function: mints an ephemeral OpenAI Realtime API client
// secret for Maha's voice-to-voice call mode (gpt-realtime). This lets the
// browser connect directly to OpenAI via WebRTC for natural, low-latency
// speech-to-speech, using the site owner's own OPENAI_API_KEY (never exposed
// to the client - only the short-lived ephemeral token is sent to the browser).
const { checkAndConsume, DAILY_LIMIT } = require('./_usage');

const BUILDER_REALTIME_INSTRUCTIONS = "You are a fast, friendly voice assistant helping the user build a website/app by talking out loud, inside an AI app-builder tool - never call yourself Maha or any other name, and never introduce yourself. CRITICAL RULES: 1) Detect the language the user just spoke in and ALWAYS reply in that exact same language/dialect (natural Khaleeji Gulf Arabic if they speak Arabic, never Fus-ha, unless they clearly use another dialect). 2) Keep every reply EXTREMELY short - a single brief confirmation sentence, like 'تم! شوف النتيجة' or 'Done, check the preview!' - never explain code, never describe the image/app in detail, never chat casually, never ask unrelated follow-up questions. 3) Never use markdown, asterisks, emojis, or symbols - speech only. 4) You have real tools: generate_image (create a new picture from a description), edit_image (modify the picture just generated in this call), build_app (build or update the actual website/app code shown in the code+preview panels from a description), and make_video (start generating a short video from a description). Only ONE image is allowed per project: whenever the user asks - by voice - to draw/design/make a picture or logo, and NO picture exists yet in this project, call generate_image with a prompt describing that subject. But if a picture ALREADY exists in this project, ALWAYS call edit_image instead for any further image request, no matter what it asks for - even if it names a totally different subject/type/model - never call generate_image again in that case. The image only ever changes to something brand new when the user starts a new project. Whenever they ask to build, create, add a feature to, or change the app/website/page, call build_app with a clear description of exactly what they want. Whenever they ask for a video, call make_video. ALWAYS call the matching tool immediately instead of just describing what you would do, then give ONE short spoken confirmation after it finishes. 5) If the user just asks a normal question unrelated to building (general chat), answer briefly and naturally in 1-2 short sentences - but if it involves current/time-sensitive info or specific vehicle/car/motorcycle/airplane models, brands, specs, or model years (especially recent ones), ALWAYS call search_web first instead of guessing, then answer using the results.";

const MAHA_REALTIME_INSTRUCTIONS = "You are \"Maha\", a warm, smart female voice assistant on a live spoken phone call. Your name is ALWAYS Maha and your voice is ALWAYS female - never any other name. TOP PRIORITY: give ACCURATE, correct, well-informed answers - like a knowledgeable expert friend. If you are not sure of a fact, say so briefly or use search_web - never guess or invent. LANGUAGE: always reply in the exact language the user just spoke. If they speak Arabic, use natural warm Emirati (UAE) white dialect - calm, confident, like a friendly Emirati TV host (e.g. 'هلا والله', 'أبشر', 'تسلم', 'يعطيك العافية') - never Fus-ha - unless they clearly use another Arabic dialect, then match it. Never mix languages. STYLE: spoken voice only - no markdown, symbols, or emojis. Keep replies short (1-2 sentences) unless the user asks for details, steps, or a list. Be lively, warm, lightly humorous - never stiff. Answer ONLY what was asked; if unclear, ask ONE short clarifying question. Introduce yourself by name only on your very first reply of the call. TOOLS: search_web = look up anything current or uncertain (news, prices, weather, scores, specific car/vehicle models and years, facts you might not know) - say one short filler like 'لحظة أشوف لك' in the same turn, then call it, then answer from the results naturally. find_real_photo = show a REAL web photo of any specific real existing thing (named car model, landmark, product) - always prefer it over generate_image for real things. generate_image = create an imagined/artistic picture for generic or fictional subjects only. edit_image = modify the existing picture in this call whenever the user asks to add/remove/change anything on it - default to it once a picture exists; only generate_image fresh for a totally unrelated new subject. set_reminder = whenever asked to remind/wake/alert them (once, daily, or relative to a prayer time), compute from the CURRENT DATE/TIME given below, then confirm briefly. look_camera = the user's phone camera (your EYES - vital accessibility feature for blind and low-vision users): whenever they ask what is in front of them, to describe their surroundings, to read any text/label/medicine/bill/sign/menu aloud, or to identify an object/money/product they are holding, call look_camera with their question, then speak the returned description clearly, calmly and practically. build_app = whenever the user asks to build/create/make an app, website, game, or page (or add/change a feature in it), call build_app with a clear detailed English description; the result appears on their screen in the code and preview panels - say one short filler like 'أبشر، لحظة أبنيه لك' first, and after it finishes confirm in one short sentence that it is ready on the screen. Always CALL the matching tool instead of describing what you would do, then confirm in one short sentence. APP KNOWLEDGE (answer from this if asked about the app): You are the voice assistant of 'Omran AI Builder' (omran-ai-builder.vercel.app), an Arabic-first AI app builder made by فريق عمران AI. Users describe an app/site/game in chat and the AI builds it with live preview and code, downloadable as HTML or ZIP. It supports 9 AI providers (OpenAI, Claude, Gemini, Groq, Cohere, DeepSeek, Mistral, OpenRouter, Perplexity); typing 'اسأل الكل' asks all of them. 7 languages: Arabic, English, French, Hindi, Urdu, Bengali, Nepali (change from ⚙️ Settings > اللغة). Main tabs: 💬 محادثة chat, 👁️ معاينة live preview, 💻 كود code, 🎙️ الصوت voice. The ⋮ menu has sections: 📂 المشاريع projects, 🤖 وكيل عمران AI agent for Pro users, 📋 قوالب جاهزة templates, 🌍 استكشف explore public projects, 🎬 صانع الفيديو video maker, 🏗️ المقاولات construction planner with 2D plans and cost estimates, 🚗 السيارات cars, 🕌 التفسير الديني religious tafsir, 💄 ديكور AI decor, 👗 أزياء AI fashion, 🎨 ستوديو AI image studio, 📚 التعليم education, 📧 مساعد البريد Gmail assistant, 📲 تثبيت install as app (PWA on Android/iPhone), ↗️ مشاركة share. Other features: mic dictation, listen 🔊 read-aloud, image upload and editing, project export/import, referral system, community feedback, 20 animated 3D backgrounds from ⚙️ > 🎨 تخصيص. Plans: free guest 20 messages, then login; paid plans in ⚙️ > 💳. Account stuff (password, email, stats) is in ⚙️ > 👤 حسابي. If asked who made the app: فريق عمران AI. Keep app answers short and spoken-friendly; offer more details only if asked.";

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
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { token, guestId } = body;
    const mode = body.mode === 'builder' ? 'builder' : 'assistant';

    const usage = await checkAndConsume(token, guestId, 'maha-realtime');
    if (!usage.allowed) {
      if (usage.reason === 'auth') {
        res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      } else {
        res.status(402).json({ error: 'وصلت للحد اليومي المجاني (' + DAILY_LIMIT + ' مكالمة) لهذي الميزة.' });
      }
      return;
    }

    let tz = 'Asia/Dubai';
    try {
      const bodyTz = body.timezone;
      if (bodyTz && typeof bodyTz === 'string') {
        // Validate it's a real IANA timezone before trusting it
        Intl.DateTimeFormat('en-US', { timeZone: bodyTz });
        tz = bodyTz;
      }
    } catch (e) { tz = 'Asia/Dubai'; }

    // Friendly place name for common timezones so the model never has to
    // guess/hallucinate a city name from just a UTC offset (e.g. never say
    // "Baku" for a +4 offset when the user is actually in Dubai/UAE).
    const TZ_PLACE_NAMES = {
      'Asia/Dubai': 'the United Arab Emirates (UAE)',
      'Asia/Riyadh': 'Saudi Arabia',
      'Asia/Kuwait': 'Kuwait',
      'Asia/Qatar': 'Qatar',
      'Asia/Bahrain': 'Bahrain',
      'Asia/Muscat': 'Oman',
      'Africa/Cairo': 'Egypt',
      'Asia/Amman': 'Jordan',
      'Asia/Beirut': 'Lebanon',
      'Asia/Baghdad': 'Iraq',
      'Asia/Damascus': 'Syria',
      'Africa/Casablanca': 'Morocco',
      'Africa/Tunis': 'Tunisia',
      'Africa/Algiers': 'Algeria',
      'Asia/Kolkata': 'India',
      'Asia/Karachi': 'Pakistan',
      'Asia/Dhaka': 'Bangladesh',
      'Asia/Kathmandu': 'Nepal',
      'America/New_York': 'the Eastern United States',
      'America/Los_Angeles': 'the Western United States',
      'America/Chicago': 'the Central United States',
      'Europe/London': 'the United Kingdom',
      'Europe/Paris': 'France'
    };
    const placeName = TZ_PLACE_NAMES[tz] || tz.split('/').pop().replace(/_/g, ' ');

    let timeContext = '';
    try {
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }).format(now);
      const timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
      }).format(now);
      timeContext = ' CURRENT DATE/TIME: it is currently ' + dateStr + ', ' + timeStr + ', local time in the user\'s current location, which is ' + placeName + ' (timezone identifier: ' + tz + '). This is the ONLY location/timezone you know the user is in - NEVER mention, guess, or assume any other city or country as the user\'s location (for example, never say Baku, or any other city that merely shares the same UTC offset) - always refer to their location as exactly stated above, or simply state the time without naming a city if unsure. Whenever asked the current date, time, or "what time is it", ALWAYS use this exact local time above - unless the user explicitly asks for the time in a different specific country/city, in which case convert accordingly and say so clearly.';
    } catch (e) {}

    const sessionConfig = {
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        instructions: (mode === 'builder' ? BUILDER_REALTIME_INSTRUCTIONS : MAHA_REALTIME_INSTRUCTIONS) + timeContext,
        audio: {
          output: { voice: 'marin' },
          input: {
            noise_reduction: { type: 'near_field' },
            turn_detection: {
              type: 'server_vad',
              threshold: mode === 'builder' ? 0.88 : 0.55,
              prefix_padding_ms: 300,
              silence_duration_ms: mode === 'builder' ? 800 : 700,
            },
          },
        },
        tools: [
          {
            type: 'function',
            name: 'generate_image',
            description: mode === 'builder'
              ? 'Generate a brand new picture/image from a text description. ONLY call this the very first time an image is requested in this project (i.e. no picture exists yet in this call/project). If a picture already exists in this project, NEVER call this again for any reason - always call edit_image instead, no matter how different the new request sounds.'
              : 'Generate a brand new IMAGINED/artistic picture from a text description whenever the user asks you (by voice) to draw, create, design, or make a picture/photo/logo of something generic or fictional. Do NOT use this for a specific real, existing thing (a named car/motorcycle/airplane model and year, a real landmark, a real product) - call find_real_photo instead in that case, since this only creates an artistic approximation that can get real shapes/logos wrong.',
            parameters: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'A short, clear, detailed English description of exactly the image to generate. If the user wants any words/text written on the image, do NOT include those words here - describe the visuals only and explicitly say the image must contain no text or letters.' },
                text_to_write: { type: 'string', description: 'If the user asked for specific words/text (a name, phrase, greeting) to appear ON the image, put that exact text here VERBATIM in the user\'s own language (e.g. Arabic stays Arabic). It will be drawn on the image with a proper clean font. Leave empty if no text is requested.' },
                font_style: { type: 'string', enum: ['othmani', 'naskh', 'ruqaa', 'kufi', 'diwani', 'modern'], description: 'Arabic font style for the written text. othmani/naskh = classic Quranic-style, ruqaa = handwritten, kufi = geometric, diwani = ornate, modern = clean contemporary (default). When the user asks for text, SUGGEST font choices by voice (e.g. "تبينه بالخط العثماني ولا الرقعة ولا الحديث؟") if they did not specify one.' },
                text_color: { type: 'string', description: 'Hex color for the written text, e.g. #ffd700 for gold, #ff0000 red, #ffffff white (default). Ask or suggest a color if the user did not specify.' },
              },
              required: ['prompt'],
            },
          },
          {
            type: 'function',
            name: 'edit_image',
            description: mode === 'builder'
              ? 'Modify the exact same picture already shown in this project, keeping everything else unchanged. In builder mode, ALWAYS call this (never generate_image) for any image-related request once a picture already exists in this project, no matter what it asks for - even a completely different subject/type/model - since only ONE image is allowed per project. A brand new image is only ever created when the user starts a new project.'
              : 'Modify the exact same picture just shown, keeping everything else in it unchanged. Use this by DEFAULT whenever a picture already exists in this call and the user asks to add, remove, change, adjust, resize, recolor, or improve ANY detail, object, or element ON TOP OF that picture (e.g. "add a boat", "ضيف مركب", "زيد عليها كذا", "change its color", "make it bigger", "add a hat") - these all mean edit the current image, not start over. Only call generate_image instead if the user clearly asks for a completely unrelated new subject/scene that has nothing to do with the current picture.',
            parameters: {
              type: 'object',
              properties: {
                instruction: { type: 'string', description: 'A short, clear English instruction describing exactly what to change about the existing image. If the user wants words/text written on it, do NOT include those words here - put them in text_to_write instead and say the image itself must contain no generated text or letters.' },
                rewrite_text_only: { type: 'boolean', description: 'Set true when the user ONLY wants to change the written text, its font, or its color on the current image (e.g. "غيري اللون أحمر", "خليه بالخط العثماني") with no change to the picture itself. This re-writes the text instantly without regenerating the image. Always pass text_to_write (the full text), font_style and text_color again with the new values.' },
                text_to_write: { type: 'string', description: 'If the user asked for specific words/text (a name, phrase, greeting) to appear ON the image, put that exact text here VERBATIM in the user\'s own language (e.g. Arabic stays Arabic). It will be drawn on the image with a proper clean font. Leave empty if no text is requested.' },
                font_style: { type: 'string', enum: ['othmani', 'naskh', 'ruqaa', 'kufi', 'diwani', 'modern'], description: 'Arabic font style for the written text. othmani/naskh = classic Quranic-style, ruqaa = handwritten, kufi = geometric, diwani = ornate, modern = clean contemporary (default). When the user asks for text, SUGGEST font choices by voice (e.g. "تبينه بالخط العثماني ولا الرقعة ولا الحديث؟") if they did not specify one.' },
                text_color: { type: 'string', description: 'Hex color for the written text, e.g. #ffd700 for gold, #ff0000 red, #ffffff white (default). Ask or suggest a color if the user did not specify.' },
              },
              required: ['instruction'],
            },
          },
          {
            type: 'function',
            name: 'build_app',
            description: 'Build or update the actual website/app code the user is working on, from a clear description of what they want (e.g. "make a snake game", "add a dark mode button", "change the title"). Always call this whenever the user asks to build/create/add/change an app, website, game, or page.',
            parameters: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'A clear, detailed English description of exactly what app/website/feature to build or change.' },
              },
              required: ['description'],
            },
          },
          ...(mode === 'builder' ? [
            {
              type: 'function',
              name: 'make_video',
              description: 'Start generating a short video from a description whenever the user asks (by voice) for a video/clip.',
              parameters: {
                type: 'object',
                properties: {
                  description: { type: 'string', description: 'A clear English description of exactly the video to generate.' },
                },
                required: ['description'],
              },
            },
            {
              type: 'function',
              name: 'search_web',
              description: 'Search the live internet for current/real-time information (news, prices, weather, specific vehicle/car/motorcycle/airplane models, brands, specs, or model years, or any other facts you might not know accurately from memory) so you can answer the user accurately instead of guessing.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The search query, in the same language the user is speaking.' },
                },
                required: ['query'],
              },
            },
          ] : [
            {
              type: 'function',
              name: 'search_web',
              description: 'Search the live internet for current/real-time information (news, prices, weather, sports scores, recent events, facts you might not know) so you can answer the user accurately instead of guessing.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The search query, in the same language the user is speaking.' },
                },
                required: ['query'],
              },
            },
            {
              type: 'function',
              name: 'find_real_photo',
              description: 'Find and show a REAL photo from the live web of something that actually exists in real life - a specific car/motorcycle/airplane model, a real place, building, person, animal, or product. ALWAYS call this instead of generate_image whenever the user asks to see/show/draw a picture of a specific real, existing thing (e.g. a named car model and year, a named aircraft, a real landmark) - since generate_image only creates an imagined artistic approximation and can get real vehicle/product shapes and logos wrong, while this shows the true real photo. Only use generate_image for imaginative/fictional/generic content that does not need to match a real specific thing exactly.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'A precise search query in English describing exactly the real thing to find a photo of, including brand/model/year if given (e.g. "2026 Nissan Altima front view").' },
                },
                required: ['query'],
              },
            },
            {
              type: 'function',
              name: 'set_reminder',
              description: 'Set a real reminder/alarm that will notify the user later even if this call has ended and the app is closed - use this whenever the user asks to be reminded, woken up, alerted, or notified about something at a specific time, every day at a time, or relative to a prayer time (e.g. "ذكرني قبل صلاة العصر", "صحّيني الساعة 7 للدوام", "نبهني كل يوم الساعة 8 صباحاً").',
              parameters: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['once', 'daily', 'prayer'], description: 'once = a single one-time reminder at a specific date/time; daily = repeats every day at the same clock time; prayer = relative to a daily prayer time (Fajr/Sunrise/Dhuhr/Asr/Maghrib/Isha).' },
                  date: { type: 'string', description: 'Only for type "once": the local calendar date in YYYY-MM-DD, computed from the CURRENT DATE/TIME given to you in this session (e.g. "today" or "tomorrow" resolved to an actual date).' },
                  hour: { type: 'number', description: 'For type "once" or "daily": the local hour in 24-hour format (0-23), computed from what the user asked (e.g. "7pm" = 19).' },
                  minute: { type: 'number', description: 'For type "once" or "daily": the local minute (0-59), 0 if not specified.' },
                  prayer_name: { type: 'string', enum: ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'], description: 'Required only when type is "prayer": which prayer.' },
                  offset_minutes: { type: 'number', description: 'Only for type "prayer": how many minutes BEFORE that prayer to notify (0 if not specified).' },
                  message: { type: 'string', description: 'A short reminder message to show the user, in the same language/dialect the user is speaking, e.g. "قرب وقت صلاة العصر" or "وقت الدوام!".' },
                },
                required: ['type', 'message'],
              },
            },
            {
              type: 'function',
              name: 'look_camera',
              description: 'See through the user\'s phone camera (accessibility eyes for blind/low-vision users). Call this whenever the user asks: what is in front of them, to describe their surroundings or a scene, to read ANY text out loud (medicine box, bill, sign, menu, document, label, price), to identify an object, money, product or color they are holding, or to help them navigate. The camera opens automatically. You receive a detailed description/reading - then speak it back clearly, calmly and practically in the user\'s language.',
              parameters: {
                type: 'object',
                properties: {
                  question: { type: 'string', description: 'What the user wants to know about what the camera sees, in the user\'s own language (e.g. "شو قدامي؟", "اقرأ لي هذي العلبة", "كم المبلغ في الفاتورة؟").' },
                },
                required: ['question'],
              },
            },
          ]),
        ],
        tool_choice: 'auto',
      },
    };

    const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionConfig),
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      console.error('[realtime-session] OpenAI error:', upstream.status, rawText);
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(rawText);
      return;
    }

    let parsed;
    try { parsed = JSON.parse(rawText); } catch (e) { parsed = null; }
    if (!parsed || !parsed.value) {
      res.status(500).json({ error: 'Unexpected response from OpenAI Realtime API' });
      return;
    }

    res.status(200).json({ clientSecret: parsed.value, model: 'gpt-realtime' });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
