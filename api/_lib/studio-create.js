// Vercel Serverless Function: "💄 AI Style Studio". One endpoint, nine
// features, all powered by Gemini's image-generation model (server-side
// owner API key, GEMINI_API_KEY):
//   hair    - dye/change hair color or style
//   nails   - change nail polish color/design
//   makeup  - apply virtual makeup look
//   beard   - change beard/mustache style
//   skin    - subtle skin smoothing / glow
//   glasses - try on a pair of glasses
//   tattoo  - preview a tattoo design on the body
//   anime   - convert the photo into an anime/cartoon style
//   merge   - merge two photos into a single combined image
// Returns a base64 PNG/JPEG the client can preview and download.
const { checkStudioQuota, consumeStudio, STUDIO_DAILY_LIMIT } = require('./_studioUsage');
const { sourceStylePreservationRule } = require('./image-prompt');
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');

const STYLE_TEXT = {
  hair: {
    black: 'jet black hair color',
    brown: 'natural chestnut brown hair color',
    blonde: 'golden blonde hair color',
    red: 'vivid auburn red hair color',
    silver: 'silver/gray hair color',
    colorful: 'vivid multicolor fantasy hair color (pink/blue/purple highlights)',
  },
  nails: {
    red: 'classic glossy red nail polish',
    nude: 'nude/beige nail polish',
    black: 'matte black nail polish',
    french: 'classic French manicure (white tips)',
    pink: 'soft pink nail polish',
    gold: 'metallic gold glitter nail polish',
  },
  makeup: {
    natural: 'light natural everyday makeup look',
    glam: 'glamorous full evening makeup look',
    smokey: 'smokey eye makeup look',
    redlips: 'bold red lipstick makeup look',
    bridal: 'elegant bridal makeup look',
  },
  beard: {
    full: 'a full thick well-groomed beard',
    stubble: 'light designer stubble',
    mustache: 'a mustache only, clean shaved cheeks',
    goatee: 'a neat goatee beard style',
    clean: 'a completely clean-shaven face',
  },
  skin: {
    subtle: 'subtle natural skin smoothing, keep realistic skin texture and pores',
    glow: 'a healthy natural glow and even skin tone',
    circles: 'reduced dark circles under the eyes, refreshed look',
  },
  glasses: {
    sunglasses: 'classic black sunglasses',
    round: 'round vintage-style glasses',
    catseye: 'cat-eye shaped glasses',
    aviator: 'aviator style glasses',
    rimless: 'thin rimless glasses',
  },
  tattoo: {
    sleeve: 'a detailed full arm sleeve tattoo design',
    wrist: 'a small delicate wrist tattoo',
    back: 'a large detailed back piece tattoo',
    tribal: 'a bold black tribal-style tattoo',
    custom: 'a custom tattoo design as described',
  },
  anime: {
    classic: 'a classic Japanese anime art style illustration',
    chibi: 'a cute chibi cartoon style illustration',
    ghibli: 'a Studio Ghibli-inspired hand-painted anime style illustration',
    cyberpunk: 'a cyberpunk anime art style illustration with neon accents',
    manga: 'a black and white manga ink illustration style',
  },
  heritage: {
    kandora: 'a traditional Gulf men\'s kandora (dishdasha) with a matching ghutra headscarf and agal',
    bisht: 'a luxurious traditional Gulf bisht cloak worn over a white kandora',
    abaya: 'an elegant traditional women\'s black abaya with a matching sheila headscarf',
    embroidered: 'a richly embroidered traditional Gulf women\'s dress (thobe nashal) with gold detailing',
    saudi: 'a traditional Saudi men\'s thobe with a red-and-white shemagh headscarf',
    emirati: 'a traditional Emirati women\'s kaftan with delicate hand embroidery',
  },
};

const FEATURE_INSTRUCTIONS = {
  hair: (style) => 'Change only the hair to ' + style + '. Keep the same person, face, pose, clothing and background exactly the same, only alter the hair color/style. Output a single photorealistic image.',
  nails: (style) => 'Apply ' + style + ' to the fingernails visible in this photo. Keep everything else in the photo exactly the same. Output a single photorealistic image.',
  makeup: (style) => 'Apply ' + style + ' to the face in this photo. Keep the same person, pose, hair and background exactly the same, only add the makeup. Output a single photorealistic image.',
  beard: (style) => 'Change the facial hair to ' + style + '. Keep the same person, pose, hair and background exactly the same, only alter the facial hair. Output a single photorealistic image.',
  skin: (style) => 'Apply ' + style + ' to the face/skin in this photo. Keep the same person, identity, pose and background exactly the same; do not change facial features or make the person look unrealistic. Output a single photorealistic image.',
  glasses: (style) => 'Add ' + style + ' onto the face in this photo, positioned naturally and realistically. Keep the same person, pose and background exactly the same. Output a single photorealistic image.',
  tattoo: (style) => 'Add ' + style + ' onto the visible skin in this photo, following the natural curves of the body. Keep the same person, pose and background exactly the same. Output a single photorealistic image.',
  anime: (style) => 'Transform this photo of a person into ' + style + ', while preserving their recognizable likeness, pose, outfit and general composition. Output a single stylized image.',
  heritage: (style) => 'Change the outfit in this photo to ' + style + ', a full traditional heritage look. Keep the same person, face, pose and background exactly the same, only change the clothing/outfit to this traditional style. Output a single photorealistic image.',
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
      console.error('[studio-create] image provider is not configured');
      res.status(503).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const {
      feature, style, description, token,
      imageBase64, mimeType,
      imageBase64B, mimeTypeB,
      multiAngle,
    } = body;

    if (!feature) {
      res.status(400).json({ error: 'Missing feature' });
      return;
    }

    if (feature === 'merge') {
      if (!imageBase64 || !imageBase64B) {
        res.status(400).json({ error: 'Missing one or both images to merge' });
        return;
      }
    } else if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }

    const quota = await checkStudioQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const parts = [];

    if (feature === 'merge') {
      const extra = description ? (' Additional instructions: ' + String(description).slice(0, 300) + '.') : '';
      const promptText =
        'Merge the two photos provided into a single combined, coherent, photorealistic image. ' +
        'Keep the people/subjects from both photos recognizable, and blend them naturally together in one consistent scene.' +
        extra + ' Output a single photorealistic image.';
      parts.push({ text: promptText });
      parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
      parts.push({ inlineData: { mimeType: mimeTypeB || 'image/jpeg', data: imageBase64B } });
    } else {
      const styleMap = STYLE_TEXT[feature] || {};
      let styleDesc = styleMap[style];
      if (!styleDesc) {
        const firstKey = Object.keys(styleMap)[0];
        styleDesc = firstKey ? styleMap[firstKey] : 'a stylish new look';
      }
      if (feature === 'tattoo' && style === 'custom' && description) {
        styleDesc = 'a tattoo design of ' + String(description).slice(0, 300);
      } else if (description) {
        styleDesc += ' (' + String(description).slice(0, 200) + ')';
      }
      const buildFn = FEATURE_INSTRUCTIONS[feature];
      if (!buildFn) {
        res.status(400).json({ error: 'Unknown feature' });
        return;
      }
      let promptText = buildFn(styleDesc);
      if (feature !== 'anime') promptText += '\n' + sourceStylePreservationRule();
      if (multiAngle && (feature === 'hair' || feature === 'heritage' || feature === 'beard')) {
        promptText += ' Output a single image laid out as a clean 3-panel collage side by side showing the SAME person and look from three angles: front view, side view, and back view.';
      }
      parts.push({ text: promptText });
      parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
    const reqBody = { contents: [{ parts }], generationConfig: { temperature: feature === 'anime' ? 0.65 : 0.15, imageConfig: { imageSize: '2K' } } };

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      console.error('[studio-create] upstream failed status=' + upstream.status + ' detail=' + ((data && data.error && data.error.message) || 'unknown'));
      res.status(502).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بصورة أو خيار آخر.' });
      return;
    }

    if (feature !== 'merge') {
      const guard = await verifyLocalizedImageEdit({
        apiKey,
        sourceBase64: imageBase64,
        sourceMime: mimeType || 'image/jpeg',
        resultBase64: imgPart.inlineData.data,
        resultMime: imgPart.inlineData.mimeType || 'image/png',
        userPrompt: [feature, style, description].filter(Boolean).join(' '),
        allowStyleChange: feature === 'anime',
      });
      if (!guard.ok) {
        const unavailable = guard.reason === 'validation_unavailable';
        res.status(unavailable ? 502 : 422).json({ error: publicGuardError(guard), retryable: unavailable });
        return;
      }
    }

    const remaining = await consumeStudio(quota.username);
    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      remaining,
      dailyLimit: STUDIO_DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[studio-create] exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
  }
};
