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

// v-studio-rescue: تعديل الصورة عبر gpt-image-1 عند رفض Gemini (نفس نمط
// الأزياء والبورتريه). يدعم صورتين للدمج. يرجع base64 أو null — لا يرمي.
async function openaiStudioEdit(promptText, images) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  try {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', String(promptText).slice(0, 3900));
    form.append('size', 'auto');
    /* v-strong-rescue: حفظ الملامح وجودة عالية */
    form.append('input_fidelity', 'high');
    form.append('quality', 'high');
    images.forEach(([b64, mime], i) => {
      form.append('image', new Blob([Buffer.from(b64, 'base64')], { type: mime || 'image/jpeg' }), 'photo' + i + '.jpg');
    });
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
      signal: AbortSignal.timeout(240000), /* v-image-timeout */
    });
    const d = await r.json();
    if (!r.ok) { console.warn('[studio-create] openai HTTP ' + r.status + ' ' + String((d.error && d.error.message) || '').slice(0, 120)); return null; }
    return (d && d.data && d.data[0] && d.data[0].b64_json) || null;
  } catch (e) { console.warn('[studio-create] openai ' + (e && e.message)); return null; }
}
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
    ombre: 'a stylish ombre hair color fading dark roots to light ends',
    highlights: 'natural sun-kissed highlights through the hair',
    platinum: 'icy platinum blonde hair color',
    burgundy: 'deep burgundy wine hair color',
    blue: 'bold electric blue hair color',
    rose: 'soft rose-gold pink hair color',
    curly: 'a voluminous curly hairstyle, defined bouncy curls',
    straight: 'a sleek straight glossy hairstyle',
    waves: 'soft glamorous hollywood waves hairstyle',
    bob: 'a chic short bob haircut',
    pixie: 'a modern pixie cut hairstyle',
    longlayers: 'long layered flowing hairstyle',
  },
  nails: {
    red: 'classic glossy red nail polish',
    nude: 'nude/beige nail polish',
    black: 'matte black nail polish',
    french: 'classic French manicure (white tips)',
    pink: 'soft pink nail polish',
    gold: 'metallic gold glitter nail polish',
    ombrenails: 'elegant ombre gradient nails',
    glitter: 'sparkling glitter party nails',
    mattegray: 'matte greige minimal nails',
    chrome: 'mirror chrome metallic nails',
    marble: 'white marble-effect nail art',
    artnails: 'delicate hand-painted floral nail art',
  },
  makeup: {
    natural: 'light natural everyday makeup look',
    glam: 'glamorous full evening makeup look',
    smokey: 'smokey eye makeup look',
    redlips: 'bold red lipstick makeup look',
    bridal: 'elegant bridal makeup look',
    softglam: 'a soft-glam makeup look, luminous skin, neutral shimmer',
    kohl: 'a striking Arabic kohl-lined eyes makeup look',
    dewy: 'a dewy fresh-skin makeup look, glowing highlight',
    matte: 'a full matte velvet-finish makeup look',
    editorial: 'a bold colorful editorial makeup look, artistic liner',
  },
  beard: {
    full: 'a full thick well-groomed beard',
    stubble: 'light designer stubble',
    mustache: 'a mustache only, clean shaved cheeks',
    goatee: 'a neat goatee beard style',
    clean: 'a completely clean-shaven face',
    boxed: 'a short boxed beard, sharply groomed edges',
    vandyke: 'a Van Dyke beard style, pointed goatee with detached mustache',
    faded: 'a skin-faded beard blending into the haircut',
    longbeard: 'a thick long well-groomed beard',
    anchor: 'an anchor-shaped chin beard with mustache',
  },
  skin: {
    subtle: 'subtle natural skin smoothing, keep realistic skin texture and pores',
    glow: 'a healthy natural glow and even skin tone',
    circles: 'reduced dark circles under the eyes, refreshed look',
    tan: 'a healthy sun-kissed golden tan skin tone',
    matteskin: 'shine-free matte refined skin finish',
    freckles: 'charming natural light freckles',
  },
  glasses: {
    sunglasses: 'classic black sunglasses',
    round: 'round vintage-style glasses',
    catseye: 'cat-eye shaped glasses',
    aviator: 'aviator style glasses',
    rimless: 'thin rimless glasses',
    wayfarer: 'classic wayfarer frame glasses',
    oversized: 'fashionable oversized frame glasses',
    sportglasses: 'sleek wraparound sport sunglasses',
    goldframe: 'luxury thin gold-frame glasses',
    retroglasses: 'retro 70s tinted glasses',
    hexagon: 'modern hexagonal frame glasses',
    clearframe: 'trendy clear transparent frame glasses',
  },
  tattoo: {
    sleeve: 'a detailed full arm sleeve tattoo design',
    wrist: 'a small delicate wrist tattoo',
    back: 'a large detailed back piece tattoo',
    tribal: 'a bold black tribal-style tattoo',
    geometric: 'a fine-line geometric pattern tattoo',
    minimalline: 'a tiny minimalist single-line tattoo',
    arabictattoo: 'an elegant Arabic calligraphy tattoo',
    floraltattoo: 'a detailed floral botanical tattoo',
    custom: 'a custom tattoo design as described',
  },
  anime: {
    classic: 'a classic Japanese anime art style illustration',
    chibi: 'a cute chibi cartoon style illustration',
    ghibli: 'a Studio Ghibli-inspired hand-painted anime style illustration',
    cyberpunk: 'a cyberpunk anime art style illustration with neon accents',
    manga: 'a black and white manga ink illustration style',
    shonenstudio: 'a dynamic shonen action anime style with speed lines and energy',
    kawaii: 'a cute kawaii pastel anime style',
    webtoon: 'a clean modern webtoon comic style',
    retro90s: 'a nostalgic 1990s cel anime style',
  },
  heritage: {
    kandora: 'a traditional Gulf men\'s kandora (dishdasha) with a matching ghutra headscarf and agal',
    bisht: 'a luxurious traditional Gulf bisht cloak worn over a white kandora',
    abaya: 'an elegant traditional women\'s black abaya with a matching sheila headscarf',
    embroidered: 'a richly embroidered traditional Gulf women\'s dress (thobe nashal) with gold detailing',
    saudi: 'a traditional Saudi men\'s thobe with a red-and-white shemagh headscarf',
    emirati: 'a traditional Emirati women\'s kaftan with delicate hand embroidery',
    omani: "a traditional Omani men's dishdasha with an embroidered kummah cap",
    saudimen2: "a Saudi winter bisht over thobe with red shemagh, stately look",
    moroccanher: 'a Moroccan djellaba with hood, fine stitching',
    palestinian: 'a Palestinian embroidered thobe with traditional tatreez patterns',
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
      signal: AbortSignal.timeout(240000), /* v-image-timeout */
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const detail = String((data && data.error && data.error.message) || 'unknown')
        .replace(/key=[^&\s"']+/g, 'key=***').slice(0, 200);
      console.error('[studio-create] upstream failed status=' + upstream.status + ' detail=' + detail);
      // v-studio-rescue: جرّب gpt-image-1 قبل إبلاغ الفشل — حارس التحقق على
      // Gemini نفسه فيُتجاوز في مسار الإنقاذ.
      const rescueImgs = [[imageBase64, mimeType]];
      if (feature === 'merge' && imageBase64B) rescueImgs.push([imageBase64B, mimeTypeB]);
      const rescue = await openaiStudioEdit((parts[0] && parts[0].text) || '', rescueImgs);
      if (rescue) {
        const remR = await consumeStudio(quota.username);
        res.status(200).json({ imageBase64: rescue, mimeType: 'image/png', engine: 'openai', remaining: remR, dailyLimit: STUDIO_DAILY_LIMIT });
        return;
      }
      res.status(502).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.', upstream: upstream.status, detail });
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
      /* v-guard-fail-open: تعطّل الحارس نفسه (مهلة/حصة) لا يُسقط صورةً جاهزة —
         نعرضها ونسجّل؛ الرفض فقط عند حكمٍ صريح بتغيير الهوية أو الأسلوب. */
      if (!guard.ok && guard.reason === 'validation_unavailable') console.warn('[studio-create] guard unavailable — passing result through');
      else if (!guard.ok) {
        res.status(422).json({ error: publicGuardError(guard), retryable: false });
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
