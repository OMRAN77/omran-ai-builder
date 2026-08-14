// Vercel Serverless Function: "🎨 Portrait Styles". Takes a personal photo
// plus a chosen art style, and asks Gemini's image-generation model
// (server-side owner API key, GEMINI_API_KEY) to redraw the person in that
// style while keeping their identity/likeness recognizable. Returns a
// base64 PNG/JPEG the client can preview and download.
const { checkPortraitQuota, consumePortrait, PORTRAIT_DAILY_LIMIT } = require('./_portraitUsage');
const { sourceStylePreservationRule } = require('./image-prompt');
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');

const STYLE_PROMPTS = {
  anime: 'a Japanese anime illustration style, clean cel-shaded colors, expressive anime eyes',
  cartoon: 'a semi-realistic digital cartoon illustration style, soft shading, clean lines',
  oil: 'a classical oil painting style, visible brush strokes, rich textured colors',
  sketch: 'a hand-drawn pencil sketch style, black and white, cross-hatching shading',
  pixel: 'an 8-bit pixel art style, limited color palette, retro video game look',
  comic: 'a comic book / manga style, bold black outlines, sharp dramatic shading, halftone dots',
  pop: 'a pop art style like Andy Warhol, bold flat colors, high contrast, screen-print look',
  gulf: 'a traditional Gulf/Emirati heritage art style, warm desert tones, traditional patterns and attire accents',
  caricature: 'a fun exaggerated caricature style, slightly enlarged facial features, playful and humorous',
  cinematic: 'a dramatic cinematic style, moody film lighting, dark tones, high contrast shadows',
  disney: 'a 3D Disney/Pixar animated movie character style, big expressive eyes, smooth rendered shading',
  flat: 'a flat vector illustration style, simple solid color shapes, no gradients, minimalist geometric look',
  fantasy: 'an epic fantasy RPG video game art style, mystical lighting, ornate armor or magical elements',
  western: 'an old western sepia-toned vintage photograph style, dusty warm tones, film grain',
  cyberpunk: 'a futuristic cyberpunk style, neon lighting, glowing colors, high-tech city backdrop',
  abstract: 'an abstract art style, unconventional shapes and colors, expressive non-literal interpretation',
  watercolor: 'a soft watercolor painting style, translucent flowing colors, gentle blended edges',
  ottoman: 'an Islamic/Ottoman miniature art style, ornate gold-leaf decorative patterns, flat traditional composition',
  gameposter: 'a video game character poster style, dynamic heroic pose lighting, bold poster typography feel',
  newspaper: 'a vintage black-and-white newspaper comic strip style, halftone print dots, old-timey inking',
  horror: 'a spooky horror/Halloween style, eerie dark lighting, gothic dramatic shadows',
  shonen: 'a shonen anime action style, dynamic speed lines, glowing energy effects, intense expression',
  royal: 'a classical 18th-19th century royal portrait painting style, ornate clothing, museum oil-painting finish',
  calligraphy: 'a decorative Arabic calligraphy art style, the portrait blended with flowing Arabic script strokes',
  wedding: 'an elegant wedding portrait style, the person dressed in an elegant formal wedding outfit (bridal gown or groom tuxedo/kandura as appropriate), soft romantic studio or venue lighting, flowers and soft bokeh in the background, joyful elegant celebratory atmosphere',
  graduation: 'a proud graduation portrait style, the person wearing a graduation cap and gown, holding a rolled diploma, university campus or stage background softly blurred, confident joyful accomplished expression, warm celebratory lighting',
  sportshero: 'an epic sports champion/hero poster style, the person wearing a bold athletic jersey or sports gear, dynamic heroic action pose, dramatic stadium lighting with crowd and confetti or light rays in the background, muscular confident energy, professional sports-poster photography look',
  linkedin: 'a professional corporate headshot style, wearing smart formal business attire (suit or blazer), neutral soft-gray studio background, confident approachable expression, soft even professional studio lighting, sharp DSLR-quality focus on the face',
  eid: 'a joyful Eid al-Fitr/Eid al-Adha festive portrait, keep the person and their real clothing exactly as-is but add a beautiful decorative Eid-themed frame/border around the photo with crescent moons, stars, lanterns (fanoos) and elegant gold Islamic geometric patterns, festive warm golden lighting glow, an "Eid Mubarak" feel',
  national: 'a UAE National Day celebratory portrait, keep the person exactly the same but add a patriotic decorative frame/border themed around the UAE flag colors (red, green, white, black), subtle falcon and Sheikh Zayed-era heritage motifs, small UAE flags, festive fireworks glow in the background corners',
  ramadan: 'a peaceful Ramadan-themed portrait, keep the person exactly the same but add an elegant decorative Ramadan frame/border with crescent moon and star motifs, ornate mosque lantern (fanoos) illustrations, warm soft nighttime glow, gentle Islamic geometric patterns along the edges',
  figurine: 'a collectible action-figure toy style, the person as a highly detailed vinyl figurine standing inside a clear plastic blister pack with printed cardboard backing, glossy toy finish, studio product photography',
  ghibli: 'a hand-painted Japanese animated-film style inspired by classic Studio Ghibli films, soft watercolor backgrounds, gentle warm light, simple expressive features',
  lego: 'a LEGO minifigure style, the person rebuilt entirely from plastic building bricks with a blocky minifigure head, cylindrical hands and glossy toy plastic finish',
  chibi: 'a cute chibi style, oversized head with big sparkling eyes, tiny rounded body, soft pastel colors, adorable kawaii look',
  statue: 'a classical white marble sculpture style, the person carved as a museum marble bust with realistic stone texture and chisel marks, neutral gallery lighting',
  polaroid: 'a vintage Polaroid instant photo style, slightly faded washed-out colors, soft focus, gentle light leaks and a thick white instant-film border',
  superhero: 'an epic superhero style, the person wearing an original heroic superhero suit with a flowing cape, dynamic action pose, glowing energy effects and a city skyline behind them',
  astronaut: 'a realistic astronaut style, the person wearing a detailed white space suit with the helmet visor open showing their face, stars, planets and a space station in the background',
  hajj: 'a blessed Hajj and Umrah congratulation portrait, keep the person exactly the same but add an elegant decorative frame/border with a Kaaba silhouette, ornate gold Islamic geometric patterns, soft green and gold tones and a gentle sacred glow, a "Hajj Mabrour" feel',
  birthday: 'a joyful birthday portrait, keep the person exactly the same but add a festive decorative frame/border with colorful balloons, falling confetti, a birthday cake with lit candles, party streamers and a warm celebratory glow',
  newborn: 'a gentle newborn-congratulation portrait, keep the person exactly the same but add a soft decorative frame/border with pastel clouds, tiny twinkling stars, a crescent moon, small baby footprints and a delicate soft-focus glow',
  claymation: 'a handmade claymation stop-motion style, the person sculpted from soft modeling clay with visible fingerprints and tool marks, slightly imperfect charming clay texture, warm miniature-set lighting like a stop-motion film',
  lowpoly: 'a low-poly 3D art style, the person built from flat triangular geometric facets, modern minimal color palette, soft gradient studio background, stylish digital-art render',
  graffiti: 'a bold urban graffiti street-art style, the person spray-painted on a textured brick wall with vibrant drips, stencil edges and dynamic paint splatter, energetic hip-hop mural feel',
  mosaic: 'an ancient mosaic art style, the portrait assembled from small colorful ceramic and glass tiles with visible grout lines, rich Byzantine-inspired colors and a timeless handcrafted feel',
  stainedglass: 'a stained-glass window art style, the portrait divided into luminous colored glass panels with bold dark lead outlines, light glowing through the glass like a cathedral window',
  papercraft: 'a layered paper-cut craft style, the person built from multiple layers of colored cardstock paper with soft drop shadows between layers, clean handcrafted 3D paper-art depth',
  crochet: 'a cute handmade crochet amigurumi doll style, the person knitted from soft colorful yarn with visible stitches, button-like eyes, cozy handcrafted plush-toy charm',
  inflatable: 'a glossy inflatable balloon sculpture style, the person as a shiny 3D inflated vinyl balloon figure with smooth reflective surfaces and seams, playful pop-art studio lighting',
  ukiyoe: 'a traditional Japanese ukiyo-e woodblock print style, flat elegant colors, flowing ink outlines, decorative wave and cloud patterns, aged paper texture like a classic Edo-period print',
  sandart: 'a Gulf desert sand-art style, the portrait drawn in flowing layers of natural colored sand with warm golden desert tones, delicate grainy texture, heritage bottle-sand-art feel',
  neonsign: 'a glowing neon sign style, the person outlined in bright neon light tubes against a dark brick wall at night, vivid electric colors with a soft neon glow and reflections',
  doubleexposure: 'an artistic double-exposure style, the person\'s silhouette elegantly blended with a second scene inside it (city skyline, forest or desert dunes), dreamy cinematic tones',
};

const EDIT_PROMPTS = {
  passport: 'reframe it into a formal official ID / passport photograph: head and shoulders centered and facing straight at the camera, neutral closed-mouth expression, plain pure-white background, even shadow-free lighting, no glare on glasses, natural true-to-life skin tones, sharp and print-ready.',
  restore: 'restore this damaged old photograph: repair scratches, tears, creases, stains, dust and missing areas, remove fading and yellowing, rebuild lost detail in the face, hair and clothing, and sharpen it so it looks like a well-preserved original print. Keep it black-and-white if the original is black-and-white.',
  colorize: 'colorize this black-and-white photograph with natural, historically believable colors: realistic skin tones, period-appropriate clothing colors and natural background colors. Do not change the composition, content or expression in any way.',
  upscale: 'enhance its technical quality only: increase sharpness and fine detail, remove noise, grain and compression artifacts, recover crisp texture in the face, hair and fabric, and correct the exposure and white balance. Do NOT restyle it and do NOT change the content.',
  productshot: 'turn it into a professional commercial product photograph: place the main subject on a clean seamless studio background with soft even lighting, a subtle natural reflection and a soft shadow beneath it, crisp focus and rich accurate colors, like a premium e-commerce catalogue shot.',
  stickerpack: 'turn it into a sticker sheet: a 2x3 grid of six cute cartoon-style stickers of the same person showing six different expressions (happy, laughing, sad, surprised, angry, winking), each sticker with a thick white die-cut outline, arranged on a plain light background.',
};

const BACKDROP_PROMPTS = {
  studio_white: 'a clean professional photo studio with a plain seamless white backdrop, soft even studio lighting',
  studio_gray: 'a professional photo studio with a plain seamless neutral gray backdrop, soft studio lighting',
  studio_black: 'a professional photo studio with a plain seamless black backdrop, dramatic rim lighting',
  gradient_blue: 'a smooth blue gradient studio backdrop, soft glowing light',
  gradient_sunset: 'a warm orange-to-purple sunset gradient studio backdrop',
  nature_park: 'a beautiful sunny green park with trees softly blurred in the background (bokeh)',
  beach: 'a sunny beach with ocean waves and blue sky softly blurred in the background',
  city_night: 'a modern city skyline at night with glowing lights softly blurred in the background',
  office: 'a bright modern office interior softly blurred in the background',
  marble: 'a luxurious polished marble wall backdrop',
};

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[portrait-style] image provider is not configured');
      res.status(503).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { imageBase64, mimeType, style, backdrop, beautify, ageTarget, hairStyle, adText, era, extraImages, token, charName, removeText, outfit, profession } = body;
    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }

    const quota = await checkPortraitQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    if (style === 'avatargif') {
      const FRAME_PROMPTS = [
        'Take this exact photo and redraw it as a simple, clean animated-avatar illustration style frame. Keep the person facing forward with a calm neutral expression, eyes open, subtle friendly smile. Keep facial identity recognizable. Output a single square-ish portrait image only.',
        'Take this exact photo and redraw it as the SAME simple animated-avatar illustration style as before, same person, same outfit, same background, but this time with their eyes gently closed (mid-blink) and the head tilted very slightly. Keep facial identity recognizable. Output a single square-ish portrait image only.',
        'Take this exact photo and redraw it as the SAME simple animated-avatar illustration style as before, same person, same outfit, same background, but this time with a bigger warm open smile and eyes open. Keep facial identity recognizable. Output a single square-ish portrait image only.',
      ];
      const endpointGif = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
      const frames = [];
      for (let i = 0; i < FRAME_PROMPTS.length; i++) {
        const frameReqBody = {
          contents: [
            {
              parts: [
                { text: FRAME_PROMPTS[i] },
                { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
              ],
            },
          ],
          generationConfig: { imageConfig: { imageSize: '2K' } },
        };
        const frameUpstream = await fetch(endpointGif, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(frameReqBody),
        });
        const frameData = await frameUpstream.json();
        if (!frameUpstream.ok) {
          console.error('[portrait-style] avatar frame failed status=' + frameUpstream.status + ' detail=' + ((frameData && frameData.error && frameData.error.message) || 'unknown'));
          res.status(502).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
          return;
        }
        const frameParts = (((frameData.candidates || [])[0] || {}).content || {}).parts || [];
        const frameImgPart = frameParts.find((p) => p.inlineData && p.inlineData.data);
        if (!frameImgPart) {
          res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أخرى.' });
          return;
        }
        const frameGuard = await verifyLocalizedImageEdit({
          apiKey,
          sourceBase64: imageBase64,
          sourceMime: mimeType || 'image/jpeg',
          resultBase64: frameImgPart.inlineData.data,
          resultMime: frameImgPart.inlineData.mimeType || 'image/png',
          userPrompt: FRAME_PROMPTS[i],
          allowStyleChange: true,
        });
        if (!frameGuard.ok) {
          const unavailable = frameGuard.reason === 'validation_unavailable';
          res.status(unavailable ? 502 : 422).json({ error: publicGuardError(frameGuard), retryable: unavailable });
          return;
        }
        frames.push(frameImgPart.inlineData.data);
      }
      const remainingGif = await consumePortrait(quota.username);
      res.status(200).json({
        frames,
        remaining: remainingGif,
        dailyLimit: PORTRAIT_DAILY_LIMIT,
      });
      return;
    }

    let promptText;
    if (style === 'removebg') {
      const backdropDesc = BACKDROP_PROMPTS[backdrop] || BACKDROP_PROMPTS.studio_white;
      promptText =
        'Take this photo and replace ONLY the background with ' + backdropDesc + '. ' +
        'Keep the person exactly the same: same face, same identity, same clothes, same pose, same body, ' +
        'same lighting on the person, unchanged. Do not alter the person at all. ' +
        'Cleanly cut out the person and place them naturally onto the new background with realistic edges ' +
        'and matching perspective. Output a single image only.';
    } else if (style === 'timeshift') {
      const ERA_MAP = {
        '1920s': 'the 1920s era, with vintage sepia-toned or black-and-white photography, period-accurate 1920s clothing and hairstyle',
        '1950s': 'the 1950s era, with classic film-photo look, period-accurate 1950s clothing and hairstyle',
        '1980s': 'the 1980s era, with retro VHS/film-grain look, period-accurate 1980s clothing, big hair and colors',
        '1990s': 'the 1990s era, with disposable-camera photo look, period-accurate 1990s clothing and hairstyle',
        medieval: 'medieval times, with period-accurate medieval clothing, armor or robes, and a castle/rustic village backdrop',
        future: 'a futuristic sci-fi era, with sleek high-tech clothing, glowing neon city or space-station backdrop',
      };
      const eraDesc = ERA_MAP[era] || ERA_MAP['1990s'];
      promptText =
        'Take this exact photo and transform the scene to look like it was taken in ' + eraDesc + '. ' +
        'Keep the person\'s facial identity recognizable, but restyle their clothing, hair, photo style, and background to authentically match that time period. Output a single image only.';
    } else if (style === 'adposter') {
      const adLine = (adText && String(adText).trim()) ? String(adText).trim() : '';
      promptText =
        'Take this photo of a person and turn it into a bold, professional personal advertisement/promo poster design. ' +
        'Keep the person\'s face and identity clearly recognizable, but restyle them with confident professional poster-photography lighting and framing. ' +
        'Add modern graphic-design elements: bold typography, clean layout, a complementary color accent background, subtle geometric shapes. ' +
        (adLine ? ('Include this exact text prominently and legibly in the poster design: "' + adLine + '". ') : 'Leave space for a short headline text area in the design. ') +
        'The result should look like a polished personal branding/promotional poster. Output a single image only.';
    } else if (style === 'hairstyle') {
      const HAIR_MAP = {
        short_black: 'a short, neat black hairstyle',
        long_wavy: 'long wavy flowing hair',
        curly_afro: 'a thick curly afro hairstyle',
        blonde: 'blonde/golden colored hair, keeping the same hairstyle length',
        red: 'a vivid fiery red hair color, keeping the same hairstyle length',
        silver: 'a silver/gray hair color, keeping the same hairstyle length',
        bald: 'a completely bald, clean-shaven head',
        mohawk: 'a bold mohawk hairstyle',
        beard_full: 'a full, well-groomed beard (in addition to their existing hair)',
      };
      const hairDesc = HAIR_MAP[hairStyle] || HAIR_MAP.short_black;
      promptText =
        'Take this exact photo and change ONLY the person\'s hair to ' + hairDesc + '. ' +
        'Keep everything else identical: same face, identity, skin, clothes, pose, and background, completely unchanged. ' +
        'Make the new hair look natural and realistic, matching the lighting of the photo. Output a single image only.';
    } else if (style === 'beautify') {
      const wants = [];
      if (!beautify || beautify.skin) wants.push('very subtly smooth and even out the skin texture (reduce blemishes and shine slightly, keep visible real skin texture and pores, do not look plastic or fake)');
      if (!beautify || beautify.light) wants.push('gently improve the lighting to look brighter, warmer and more flattering, like natural soft studio light');
      if (!beautify || beautify.teeth) wants.push('slightly whiten the teeth naturally if teeth are visible');
      if (wants.length === 0) wants.push('make only extremely subtle natural retouching improvements');
      promptText =
        'Take this exact photo and apply only very light, natural, realistic beauty retouching: ' +
        wants.join('; ') + '. ' +
        'Do NOT change the person\'s facial identity, face shape, features, pose, clothes, background, or framing. ' +
        'The result must still look like a real unedited photo of the same real person, just slightly more polished. ' +
        'Avoid any heavy filter, plastic skin, or face-altering effect. Output a single image only.';
    } else if (style === 'familystyle') {
      promptText =
        'You are given several separate photos of different family members. ' +
        'Create ONE single combined family portrait image that places all of these people together naturally in the same scene, ' +
        'standing or sitting together as a family, with consistent matching lighting, color grading, and photo style across everyone. ' +
        'Keep each person\'s facial identity, clothing, and features recognizable and unchanged. Compose them nicely into a warm, natural family portrait with a simple pleasant background. ' +
        'Output a single combined image only.';
    } else if (style === 'merge2') {
      promptText =
        'You are given two separate photos, each showing one different person. ' +
        'Create ONE single combined photo showing BOTH people together naturally in the same scene, standing next to each other, ' +
        'with consistent matching lighting, perspective, and photo style. ' +
        'Keep each person\'s facial identity, clothing, and features exactly recognizable and unchanged. Output a single combined image only.';
    } else if (style === 'ageshift') {
      const AGE_MAP = {
        younger_child: 'a young child of about 6 years old',
        younger_teen: 'a teenager of about 15 years old',
        younger_20s: 'about twenty years younger than they are now',
        older_middle: 'middle-aged, about 50 years old',
        older_senior: 'an elderly person of about 75 years old',
      };
      const ageDesc = AGE_MAP[ageTarget] || AGE_MAP.younger_20s;
      promptText =
        'Take this exact photo and realistically change ONLY the apparent age of the person so that they look like ' + ageDesc + '. ' +
        'Adjust facial structure, skin texture, wrinkles, hair color and hair density naturally and believably for that age, while keeping it clearly the SAME person with the same recognizable identity and features. ' +
        'Keep the pose, framing, clothing, lighting and background unchanged. The result must stay a realistic photograph, not a cartoon or illustration. Output a single image only.';
    } else if (style === 'objectremove') {
      const target = (removeText && String(removeText).trim()) ? String(removeText).trim() : 'any distracting person or object in the background';
      promptText =
        'Take this exact photo and cleanly remove the following from the image: ' + target + '. ' +
        'Realistically reconstruct whatever was hidden behind it so the result looks natural and untouched, matching the surrounding texture, colors, lighting and perspective seamlessly. ' +
        'Keep everything else in the photo completely identical and unchanged. Output a single image only.';
    } else if (style === 'outfit') {
      const OUTFIT_MAP = {
        kandura: 'a crisp white Emirati kandura with a white ghutra and a black agal',
        abaya: 'an elegant black abaya with a matching shayla headscarf',
        suit: 'a sharp well-tailored business suit with a dress shirt and tie',
        dress: 'an elegant formal evening dress',
        casual: 'smart casual clothing: a clean shirt with a light jacket',
        sport: 'modern athletic sportswear',
        thobe: 'a traditional Gulf thobe with a red-and-white shemagh',
        winter: 'a warm winter coat with a scarf',
      };
      const outfitDesc = OUTFIT_MAP[outfit] || OUTFIT_MAP.suit;
      promptText =
        'Take this exact photo and change ONLY the clothing of the person to ' + outfitDesc + '. ' +
        'Keep everything else identical: same face, identity, hair, pose, body proportions, lighting and background, completely unchanged. ' +
        'Render the new clothing naturally and realistically with correct fit, folds and shadows that match the photo. Output a single image only.';
    } else if (style === 'profession') {
      const PROF_MAP = {
        doctor: 'a doctor wearing a white medical coat over scrubs with a stethoscope around the neck, in a bright modern clinic',
        pilot: 'an airline captain wearing a dark pilot uniform with gold sleeve stripes and a captain cap, inside an aircraft cockpit',
        police: 'a police officer wearing a smart police uniform with a cap and badge, standing in front of a police vehicle',
        chef: 'a professional chef wearing a white chef jacket and toque, in a busy restaurant kitchen',
        engineer: 'a site engineer wearing a hard hat, a high-visibility safety vest and work clothes, at a construction site',
        teacher: 'a teacher in smart professional clothing, standing in front of a classroom whiteboard',
        firefighter: 'a firefighter in full turnout gear with a helmet, standing in front of a fire engine',
        scientist: 'a scientist wearing a white lab coat and safety glasses, in a modern research laboratory',
      };
      const profDesc = PROF_MAP[profession] || PROF_MAP.doctor;
      promptText =
        'Take this photo and restyle the person as ' + profDesc + '. ' +
        'Keep the face and identity of the person clearly recognizable and unchanged, but replace their clothing and background so they realistically match that profession, with consistent natural lighting. Output a single image only.';
    } else if (EDIT_PROMPTS[style]) {
      promptText =
        'Take this exact photo and ' + EDIT_PROMPTS[style] + ' ' +
        'Keep the facial identity and likeness of the person clearly recognizable and unchanged. Output a single image only.';
    } else if (style === 'celebtoon') {
      const charDesc = (charName && String(charName).trim()) ? String(charName).trim() : 'a generic friendly famous-style cartoon hero';
      promptText =
        'Take this exact photo and redraw the person as an original, generic cartoon-hero illustration INSPIRED BY the general vibe/theme the user described as: "' + charDesc + '". ' +
        'IMPORTANT: Do NOT copy any specific copyrighted character design, costume, logo, or exact likeness — create an ORIGINAL character design that only captures the general mood/energy/color-palette described, blended with the person\'s own recognizable facial identity. ' +
        'Keep the person\'s face and identity clearly recognizable. Make it a fun, high-quality cartoon-style illustration. Output a single image only.';
    } else if (['eid', 'national', 'ramadan', 'hajj', 'birthday', 'newborn'].indexOf(style) !== -1) {
      const occasionDesc = STYLE_PROMPTS[style];
      promptText =
        'Take this exact photo and keep the person completely unchanged (same face, identity, clothes, pose, background). ' +
        'Only ADD a beautiful decorative photo frame/border effect around the image for ' + occasionDesc + '. ' +
        'The person and original background must remain fully visible and untouched in the center; the decoration should ' +
        'only affect the border/frame area and a subtle festive lighting glow. Output a single image only.';
    } else {
      const styleDesc = STYLE_PROMPTS[style] || STYLE_PROMPTS.cartoon;
      promptText =
        'Redraw the person in this photo into ' + styleDesc + '. ' +
        'Keep the same facial identity, pose and general framing recognizable, but fully re-render the ' +
        'entire image (face, clothes, and background) in the requested art style. Output a single image only.';
    }

    const isLocalizedEdit = ['hairstyle', 'beautify', 'ageshift', 'objectremove', 'outfit', 'passport', 'restore', 'colorize', 'upscale'].includes(style);
    if (isLocalizedEdit) promptText += '\n' + sourceStylePreservationRule();

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
    const genParts = [
      { text: promptText },
      { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
    ];
    if ((style === 'familystyle' || style === 'merge2') && Array.isArray(extraImages)) {
      const maxExtra = style === 'merge2' ? 1 : 3;
      extraImages.slice(0, maxExtra).forEach((imgB64) => {
        if (imgB64) genParts.push({ inlineData: { mimeType: 'image/jpeg', data: imgB64 } });
      });
    }
    const reqBody = {
      contents: [
        {
          parts: genParts,
        },
      ],
      generationConfig: { temperature: isLocalizedEdit ? 0.15 : 0.65, imageConfig: { imageSize: '2K' } },
    };

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[portrait-style] upstream failed status=' + upstream.status + ' detail=' + ((data && data.error && data.error.message) || 'unknown'));
      res.status(502).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أو ستايل آخر.' });
      return;
    }

    const isMultiSourceComposition = style === 'familystyle' || style === 'merge2';
    if (!isMultiSourceComposition) {
      const guard = await verifyLocalizedImageEdit({
        apiKey,
        sourceBase64: imageBase64,
        sourceMime: mimeType || 'image/jpeg',
        resultBase64: imgPart.inlineData.data,
        resultMime: imgPart.inlineData.mimeType || 'image/png',
        userPrompt: promptText,
        allowStyleChange: !!STYLE_PROMPTS[style] || ['timeshift', 'adposter', 'celebtoon'].includes(style) || style === 'stickerpack',
      });
      if (!guard.ok) {
        const unavailable = guard.reason === 'validation_unavailable';
        res.status(unavailable ? 502 : 422).json({ error: publicGuardError(guard), retryable: unavailable });
        return;
      }
    }

    const remaining = await consumePortrait(quota.username);
    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      remaining,
      dailyLimit: PORTRAIT_DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[portrait-style] exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
  }
};
