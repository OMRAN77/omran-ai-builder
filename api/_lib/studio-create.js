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
/* v-studio-lock: الإنقاذ بـgpt-image-1 يمرّ بحارس الهوية أيضًا — إن تغيّر الشخص نعيد مرة بقفل أشدّ */
async function rescueGuarded(promptText, images, apiKey, feature) {
  const first = await openaiStudioEdit(promptText, images);
  if (!first || feature === 'anime' || feature === 'merge' || !apiKey) return first;
  try {
    const g = await verifyLocalizedImageEdit({ apiKey, sourceBase64: images[0][0], sourceMime: images[0][1] || 'image/jpeg', resultBase64: first, resultMime: 'image/png', userPrompt: promptText.slice(0, 600) });
    if (g.ok || g.reason === 'validation_unavailable') return first;
    const second = await openaiStudioEdit(promptText + STRONGER_LOCK, images);
    return second || first;
  } catch (e) { return first; }
}
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');
const faceLock = require('./face-lock.js');
const { judgeBest, duoEnabled } = require('./image-judge');

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

/* v-studio-14: الميزات الأربع عشرة الجديدة تُدمج هنا (أوامرها في studio-more.js) */
const __MORE = require('./studio-more.js');
Object.keys(__MORE.STYLE_PROMPTS).forEach((k) => { if (!STYLE_TEXT[k]) STYLE_TEXT[k] = __MORE.STYLE_PROMPTS[k]; });
Object.keys(__MORE.FEATURE_INSTRUCTIONS).forEach((k) => { if (!FEATURE_INSTRUCTIONS[k]) FEATURE_INSTRUCTIONS[k] = __MORE.FEATURE_INSTRUCTIONS[k]; });

/* v-studio-lock (شكوى المالك: طلب «بشت» فتغيّر الوجه والوقفة والغترة): قفل تعديل
   صارم يُلحق بكل أمر — تعديل موضعي على الصورة نفسها لا صورة جديدة. */
const EDIT_LOCK = (what) =>
  '\nSTRICT EDIT LOCK (highest priority): this is a localized edit of the provided photo, NOT a new image. ' +
  'Keep the exact same person and face (identity, features, skin, expression, beard), the same head position, gaze, body pose, hands, ' +
  'the same camera angle, framing, crop, lighting and background — pixel-for-pixel wherever not touched. ' +
  'Change ONLY ' + what + '. If the requested change does not mention headwear, keep the existing headwear exactly as it is. ' +
  'Do not beautify, restyle, re-pose or regenerate anything else.';
const STRONGER_LOCK = '\nSECOND ATTEMPT — the previous result changed the person. Preserve the reference photo exactly; apply the single requested change as a thin overlay on the original pixels only.';
const LOCK_WHAT = {
  hair: 'the hair', nails: 'the fingernails', makeup: 'the facial makeup', beard: 'the facial hair', skin: 'the skin finish',
  glasses: 'the glasses', tattoo: 'the tattoo', anime: 'the art style', heritage: 'the clothing/outfit',
  idphoto: 'the background and framing', hijab: 'the head covering and outfit', gulfmen: 'the outfit and headwear', menhair: 'the hair',
  henna: 'the henna on the skin', wedding: 'the outfit, hairstyle and makeup', accessories: 'the added accessory', eyes: 'the eyes or smile',
  body: 'the body shape', background: 'the background', palette: 'the colors of the outfit', seasons: 'the outfit and setting',
  iconic: 'the outfit, hair and setting', age: 'the apparent age',
};

/* ───── بناء أمر ميزة واحدة (كان داخل المعالج) ───── */
function buildSinglePrompt(feature, style, description, multiAngle) {
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
  if (!buildFn) return null;
  let promptText = buildFn(styleDesc);
  if (feature !== 'anime') promptText += '\n' + sourceStylePreservationRule() + EDIT_LOCK(LOCK_WHAT[feature] || 'the requested detail');
  if (multiAngle && (feature === 'hair' || feature === 'heritage' || feature === 'beard')) {
    promptText += ' Output a single image laid out as a clean 3-panel collage side by side showing the SAME person and look from three angles: front view, side view, and back view.';
  }
  return promptText;
}

/* ───── نداء Gemini واحد: { b64, mime } أو { error, status, detail, why } ───── */
async function geminiImage(apiKey, parts, feature) {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
  const reqBody = { contents: [{ parts }], generationConfig: { temperature: feature === 'anime' ? 0.65 : 0.15, imageConfig: { imageSize: '2K' } } };
  const upstream = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(240000), /* v-image-timeout */
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const detail = String((data && data.error && data.error.message) || 'unknown').replace(/key=[^&\s"']+/g, 'key=***').slice(0, 200);
    console.error('[studio-create] upstream failed status=' + upstream.status + ' detail=' + detail);
    return { error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.', status: 502, upstream: upstream.status, detail };
  }
  const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
  if (!imgPart) {
    const why = String((((data.candidates || [])[0] || {}).finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '').slice(0, 40);
    return { error: 'لم يرجع الموديل صورة. حاول بصورة أو خيار آخر.' + (why ? ' (' + why + ')' : ''), status: 500, why };
  }
  return { b64: imgPart.inlineData.data, mime: imgPart.inlineData.mimeType || 'image/png' };
}

/* ───── تعديل واحد كامل: قفل الوجه ← Gemini ← إنقاذ ← حارس. يرجع { b64, mime, engine } أو يرمي { status, payload } ───── */
async function runEdit(o) {
  /* v-face-composite: مهما كان المحرّك، بكسلات الوجه/الرأس تُعاد من الأصل في النهاية */
  const prep = (o.lockLevel && o.lockLevel !== 'none' && !o.collage)
    ? await faceLock.prepare({ geminiKey: o.apiKey, imageBase64: o.imageBase64, mimeType: o.mimeType, level: o.lockLevel })
    : null;
  const finish = async (b64, mime, engine) => {
    const fixed = await faceLock.restoreProtected(prep, o.imageBase64, b64, o.apiKey, mime);
    if (fixed && fixed.b64) return { b64: fixed.b64, mime: fixed.mime, engine: engine + '+restore' };
    return { b64, mime, engine };
  };
  const parts = [{ text: o.promptText }, { inlineData: { mimeType: o.mimeType || 'image/jpeg', data: o.imageBase64 } }];
  /* v-image-duo: مع قفل الوجه يعمل Gemini بالتوازي مع تعديل gpt-image بالقناع، والحكم يختار */
  const duo = duoEnabled() && !!o.openaiKey;
  let gemP = null;
  const guardOf = async (b64, mime) => {
    if (o.skipGuard) return true;
    const g = await verifyLocalizedImageEdit({ apiKey: o.apiKey, sourceBase64: o.imageBase64, sourceMime: o.mimeType || 'image/jpeg', resultBase64: b64, resultMime: mime, userPrompt: (o.guard && o.guard.userPrompt) || o.feature, allowStyleChange: !!(o.guard && o.guard.allowStyleChange) });
    return !!(g && (g.ok || g.reason === 'validation_unavailable'));
  };
  if (prep) {
    if (duo) gemP = geminiImage(o.apiKey, parts, o.feature).catch(function () { return {}; });
    const masked = await faceLock.maskedEdit(prep, o.openaiKey, o.promptText);
    if (masked) {
      if (gemP) {
        try {
          const g = await gemP;
          if (g && g.b64 && await guardOf(g.b64, g.mime)) {
            const pick = await judgeBest({ apiKey: o.apiKey, prompt: o.promptText, source: { b64: o.imageBase64, mime: o.mimeType || 'image/jpeg' }, a: { b64: masked, mime: 'image/png' }, b: { b64: g.b64, mime: g.mime } });
            if (pick === 'b') return finish(g.b64, g.mime, 'gemini+judge');
          }
        } catch (e) { console.warn('[studio-create] duo judge skipped: ' + (e && e.message)); }
        return finish(masked, 'image/png', 'openai-lock+judge');
      }
      return finish(masked, 'image/png', 'openai-lock');
    }
    console.warn('[studio-create] masked edit unavailable for ' + o.feature + ' — falling back to gemini');
  } else if (o.lockLevel && o.lockLevel !== 'none') {
    console.warn('[studio-create] face-lock prepare failed for ' + o.feature + ' — no pixel restore');
  }
  const out = gemP ? await gemP : await geminiImage(o.apiKey, parts, o.feature);
  if (!out.b64) {
    /* v-studio-rescue / v-studio-noimg-rescue: gpt-image-1 قبل إبلاغ الفشل */
    const rescue = await rescueGuarded(o.promptText, [[o.imageBase64, o.mimeType]], o.apiKey, o.feature);
    if (rescue) return finish(rescue, 'image/png', 'openai');
    const payload = { error: out.error };
    if (out.upstream) { payload.upstream = out.upstream; payload.detail = out.detail; }
    throw { status: out.status || 502, payload };
  }
  if (!o.skipGuard) {
    const guard = await verifyLocalizedImageEdit({
      apiKey: o.apiKey, sourceBase64: o.imageBase64, sourceMime: o.mimeType || 'image/jpeg',
      resultBase64: out.b64, resultMime: out.mime,
      userPrompt: (o.guard && o.guard.userPrompt) || o.feature,
      allowStyleChange: !!(o.guard && o.guard.allowStyleChange),
    });
    /* v-guard-fail-open: تعطّل الحارس نفسه لا يُسقط صورةً جاهزة */
    if (!guard.ok && guard.reason === 'validation_unavailable') console.warn('[studio-create] guard unavailable — passing result through');
    else if (!guard.ok) throw { status: 422, payload: { error: publicGuardError(guard), retryable: false } };
  }
  return finish(out.b64, out.mime, 'gemini');
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

    const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

    if (feature === 'merge') {
      const extra = description ? (' Additional instructions: ' + String(description).slice(0, 300) + '.') : '';
      const promptText =
        'Merge the two photos provided into a single combined, coherent, photorealistic image. ' +
        'Keep the people/subjects from both photos recognizable, and blend them naturally together in one consistent scene.' +
        extra + ' Output a single photorealistic image.';
      const parts = [
        { text: promptText },
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
        { inlineData: { mimeType: mimeTypeB || 'image/jpeg', data: imageBase64B } },
      ];
      const out = await geminiImage(apiKey, parts, 'merge');
      if (out.b64) {
        const rem = await consumeStudio(quota.username);
        res.status(200).json({ imageBase64: out.b64, mimeType: out.mime, remaining: rem, dailyLimit: STUDIO_DAILY_LIMIT });
        return;
      }
      const rescue = await rescueGuarded(promptText, [[imageBase64, mimeType], [imageBase64B, mimeTypeB]], apiKey, 'merge');
      if (rescue) {
        const remR = await consumeStudio(quota.username);
        res.status(200).json({ imageBase64: rescue, mimeType: 'image/png', engine: 'openai', remaining: remR, dailyLimit: STUDIO_DAILY_LIMIT });
        return;
      }
      res.status(out.status || 502).json({ error: out.error || 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    if (feature === 'combo') { res.status(410).json({ error: 'combo_removed' }); return; } /* v-studio-combo-removed: أمر المالك */

    const promptText = buildSinglePrompt(feature, style, description, multiAngle);
    if (!promptText) { res.status(400).json({ error: 'Unknown feature' }); return; }
    let guardOpts = null;
    if (feature !== 'merge') guardOpts = { userPrompt: [feature, style, description].filter(Boolean).join(' '), allowStyleChange: feature === 'anime' };
    try {
      const r = await runEdit({
        apiKey, openaiKey, feature, promptText, imageBase64, mimeType,
        lockLevel: faceLock.protectLevel(feature),
        collage: !!(multiAngle && (feature === 'hair' || feature === 'heritage' || feature === 'beard')),
        guard: guardOpts, skipGuard: !guardOpts,
      });
      const remaining = await consumeStudio(quota.username);
      res.status(200).json({ imageBase64: r.b64, mimeType: r.mime, engine: r.engine, remaining, dailyLimit: STUDIO_DAILY_LIMIT });
    } catch (err) {
      if (err && err.status && err.payload) { res.status(err.status).json(err.payload); return; }
      throw err;
    }
  } catch (e) {
    console.error('[studio-create] exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
  }
};
module.exports.STYLE_TEXT = STYLE_TEXT;
module.exports.FEATURE_INSTRUCTIONS = FEATURE_INSTRUCTIONS;
