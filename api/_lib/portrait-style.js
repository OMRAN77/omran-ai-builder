// Vercel Serverless Function: "🎨 Portrait Styles". Takes a personal photo
// plus a chosen art style, and asks Gemini's image-generation model
// (server-side owner API key, GEMINI_API_KEY) to redraw the person in that
// style while keeping their identity/likeness recognizable. Returns a
// base64 PNG/JPEG the client can preview and download.
const { checkPortraitQuota, consumePortrait, PORTRAIT_DAILY_LIMIT } = require('./_portraitUsage');

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
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { imageBase64, mimeType, style, backdrop, beautify, ageTarget, hairStyle, adText, era, extraImages, token } = body;
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
          res.status(frameUpstream.status).json({ error: (frameData && frameData.error && frameData.error.message) || 'Upstream error' });
          return;
        }
        const frameParts = (((frameData.candidates || [])[0] || {}).content || {}).parts || [];
        const frameImgPart = frameParts.find((p) => p.inlineData && p.inlineData.data);
        if (!frameImgPart) {
          res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أخرى.' });
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
    } else if (style === 'celebtoon') {
      const charDesc = (charName && String(charName).trim()) ? String(charName).trim() : 'a generic friendly famous-style cartoon hero';
      promptText =
        'Take this exact photo and redraw the person as an original, generic cartoon-hero illustration INSPIRED BY the general vibe/theme the user described as: "' + charDesc + '". ' +
        'IMPORTANT: Do NOT copy any specific copyrighted character design, costume, logo, or exact likeness — create an ORIGINAL character design that only captures the general mood/energy/color-palette described, blended with the person\'s own recognizable facial identity. ' +
        'Keep the person\'s face and identity clearly recognizable. Make it a fun, high-quality cartoon-style illustration. Output a single image only.';
    } else if (style === 'eid' || style === 'national' || style === 'ramadan') {
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
      generationConfig: { imageConfig: { imageSize: '2K' } },
    };

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error' });
      return;
    }

    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أو ستايل آخر.' });
      return;
    }

    const remaining = await consumePortrait(quota.username);
    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      remaining,
      dailyLimit: PORTRAIT_DAILY_LIMIT,
    });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
