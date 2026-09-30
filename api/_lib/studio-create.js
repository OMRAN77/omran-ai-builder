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
    form.append('model', 'gpt-image-2.5-sunburst');
    form.append('prompt', String(promptText).slice(0, 3900));
    form.append('size', 'auto');
    form.append('quality', 'high');
    const imgField = images.length > 1 ? 'image[]' : 'image'; // أكثر من صورة على gpt-image-2 = image[] (كما في maha-image)
    images.forEach(([b64, mime], i) => {
      form.append(imgField, new Blob([Buffer.from(b64, 'base64')], { type: mime || 'image/jpeg' }), 'photo' + i + '.jpg');
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
const mergeIdentity = require('./merge-identity');
const { judgeBest, duoEnabled } = require('./image-judge');
const variants = require('./studio-variants.js'); /* v-studio-variants */

/* v-studio-more-looks: أوصاف الخيارات انتقلت إلى ملفّ بيانات صرف يقرأه مولّد المعاينات أيضًا */
/* نسخة سطحيّة: دمج الميزات الـ١٤ أدناه يجب ألّا يلوّث بيانات الملفّ المشتركة (يقرأها مولّد المعاينات) */
const STYLE_TEXT = Object.assign({}, require('./studio-styles.js').STYLE_TEXT);

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
/* v-edit-no-change: الناتج جاء مطابقًا للأصل — المحاولة الثانية تطلب التنفيذ صراحةً */
const NO_CHANGE_RETRY = '\nSECOND ATTEMPT — the previous result came back identical to the source photo: the requested change was not applied at all. You MUST visibly apply it this time, clearly and unmistakably, while still keeping the same person, pose, framing and background.';
const STRONGER_LOCK = '\nSECOND ATTEMPT — the previous result changed the person. Preserve the reference photo exactly; apply the single requested change as a thin overlay on the original pixels only.';
const LOCK_WHAT = {
  hair: 'the hair', nails: 'the fingernails', makeup: 'the facial makeup', beard: 'the facial hair', skin: 'the skin finish',
  glasses: 'the glasses', tattoo: 'the tattoo', anime: 'the art style', heritage: 'the clothing/outfit',
  idphoto: 'the background and framing', hijab: 'the head covering and outfit', gulfmen: 'the outfit and headwear', menhair: 'the hair',
  henna: 'the henna on the skin', wedding: 'the outfit, hairstyle and makeup', accessories: 'the added accessory', eyes: 'the eyes or smile',
  body: 'the body shape', background: 'the background', palette: 'the colors of the outfit', seasons: 'the outfit and setting',
  iconic: 'the outfit, hair and setting', age: 'the apparent age',
};

/* v-studio-variety: ميزات «الرسم» — النقش يُرسم من جديد كلّ مرّة، فالخيار نفسه كان
   يعطي التصميم نفسه بالضبط (حرارة ٠٫١٥ وأمر ثابت). بذرة تنويع + حرارة أعلى قليلًا:
   الطلب لا يغيّر الستايل المختار، بل ترتيب النقش وتوزيعه. الوجه/الرأس محميّ بالبكسل
   في الحنّاء والأظافر والتاتو (face-lock: body)، والمكياج يبقى على حرارته لأنّه على الوجه. */
const DESIGN_FEATURES = ['henna', 'nails', 'tattoo'];
const VARIETY_NOTE = {
  henna: 'Draw a brand-new original henna layout inside this exact style: vary the motifs, their sizes, their spacing and the overall composition so it does not repeat an earlier drawing. Keep the described colour, pattern family and placement exactly as asked.',
  nails: 'Paint a brand-new original nail design inside this exact style: vary the detailing, the accent nails and the finish placement so it does not repeat an earlier design. Keep the described colour and style exactly as asked.',
  tattoo: 'Draw a brand-new original tattoo artwork inside this exact style: vary the composition, the line work and the shading so it does not repeat an earlier design. Keep the described style, size and placement exactly as asked.',
};
/* v-studio-skin-lock (شكوى المالك ٢٨ سبتمبر: صورة كفّ رجل + «حناء خليجية» ⇒ خطأ
   image_edit_identity_mismatch): وصف الحنّاء «على اليدين» يجرّ الموديل إلى **يد أخرى**
   ناعمة بلا شعر (يد عروس)، فيحكم الحارس بتغيّر الهويّة ويسقط الطلب كلّه. النقش يُضاف
   فوق الجلد نفسه لا على يد بديلة. */
const SKIN_LOCK = '\nSKIN LOCK (highest priority): the pigment is added ON TOP of the exact skin already in the photo. ' +
  'Keep the same hands/limbs pixel-for-pixel apart from the added design: same skin tone and shade, same body hair, same veins, knuckles and wrinkles, ' +
  'same nail shape and length, same size, same pose and same background. ' +
  'Never replace them with someone else\'s hands or feet, never make them look younger, smoother, slimmer, lighter or more feminine, ' +
  'and never add jewellery, rings, bracelets, sleeves or clothing that is not already there.';

/* v-studio-variants: التنويع صار **داخل الخيار نفسه** لكلّ الميزات لا للرسم وحده —
   توجيه محسوس من محاور studio-variants (آلاف الأشكال لكلّ خيار) بدل جملة «نوّع» عامّة
   يتجاهلها الموديل. الرقم يصل من العميل (عدّاد لكلّ ميزة+خيار) فلا يتكرّر شكلٌ للمستخدم. */
/* v-visible-change (شكوى المالك ٣٠ سبتمبر: «في الاستايل إذا اختار شيئًا — العين مثلًا — الشيء اللي
   اختاره ما يتغيّر»): سطر التنويع كان يُضعف التعديل أو يناقضه — «أخفّ مستوى»، «التركيز على الجهة
   اليسرى» للعيون، «عدسة شفّافة» لنظّارة شمسيّة، «مطفي» لخيار لامع. الآن: الخيار المختار هو المرجع،
   والتنويع لا يمسّ إلّا ما تركه الخيار مفتوحًا، والتغيير يجب أن يكون ظاهرًا. والتعديلات الدقيقة
   المطلوبة بعينها (العمر، الجسم، تبييض الأسنان…) بلا تنويع أصلًا. */
function varietyLine(feature, variant, style) {
  if (!variants.hasVariation(feature, style)) return '';
  const total = variants.variantCount(feature, style);
  const n = Number.isFinite(variant) ? Math.abs(Math.floor(variant)) : Math.floor(Math.random() * total);
  const directive = variants.variantDirective(feature, n, style);
  const note = VARIETY_NOTE[feature] || 'Produce a fresh original execution of this exact style; do not repeat an earlier one.';
  return '\nVARIATION #' + (n % total) + ' — a fresh execution of the chosen style. The chosen style described above is the authority: ' +
    'keep every colour, finish, shape, size and placement it names exactly. Use the following ideas only for details the style leaves open, ' +
    'and skip any idea that contradicts it: ' + directive + '.\n' + note +
    '\nThe requested change must be clearly and unmistakably visible in the result.';
}

/* ───── بناء أمر ميزة واحدة (كان داخل المعالج) ───── */
function buildSinglePrompt(feature, style, description, multiAngle, variant) {
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
  if (DESIGN_FEATURES.indexOf(feature) !== -1) promptText += SKIN_LOCK;
  promptText += varietyLine(feature, variant, style);
  return promptText;
}

/* ───── نداء Gemini واحد: { b64, mime } أو { error, status, detail, why } ───── */
async function geminiImage(apiKey, parts, feature, aspectRatio, tempOverride) {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
  /* v-studio-variety: ميزات الرسم بحرارة ٠٫٤٥ — ٠٫١٥ كانت تعيد النقش نفسه حرفيًّا.
     v-studio-guard-retry: المحاولة الثانية بحرارة منخفضة مفروضة (أمانة قبل تنويع). */
  const temperature = Number.isFinite(tempOverride) ? tempOverride
    : (feature === 'anime' ? 0.65 : (DESIGN_FEATURES.indexOf(feature) !== -1 ? 0.45 : 0.15));
  const reqBody = { contents: [{ parts }], generationConfig: { temperature, imageConfig: aspectRatio ? { imageSize: '2K', aspectRatio } : { imageSize: '2K' } } };
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
    const g = await verifyLocalizedImageEdit({ apiKey: o.apiKey, sourceBase64: o.imageBase64, sourceMime: o.mimeType || 'image/jpeg', resultBase64: b64, resultMime: mime, userPrompt: (o.guard && o.guard.userPrompt) || o.feature, allowStyleChange: !!(o.guard && o.guard.allowStyleChange), requireChange: !!(o.guard && o.guard.requireChange) });
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
      requireChange: !!(o.guard && o.guard.requireChange), /* v-edit-no-change */
    });
    /* v-guard-fail-open: تعطّل الحارس نفسه لا يُسقط صورةً جاهزة */
    if (!guard.ok && guard.reason === 'validation_unavailable') console.warn('[studio-create] guard unavailable — passing result through');
    else if (!guard.ok) {
      /* v-studio-guard-retry (شكوى المالك: «image_edit_identity_mismatch» على صورة كفّ):
         رسمةٌ واحدة شاردة كانت تُسقط الطلب كلّه بخطأ أحمر. محاولة ثانية واحدة بقفل
         أشدّ وحرارة ٠٫١٥ قبل الإبلاغ — الفشل يبقى فشلًا إن تكرّر. */
      console.warn('[studio-create] guard rejected ' + o.feature + ' (' + guard.reason + ') — second attempt with a stronger lock');
      const retryNote = guard.reason === 'no_change' ? NO_CHANGE_RETRY : STRONGER_LOCK;
      const retryParts = [{ text: o.promptText + retryNote }, { inlineData: { mimeType: o.mimeType || 'image/jpeg', data: o.imageBase64 } }];
      const again = await geminiImage(o.apiKey, retryParts, o.feature, null, 0.15);
      if (again.b64 && await guardOf(again.b64, again.mime)) return finish(again.b64, again.mime, 'gemini+retry');
      throw { status: 422, payload: { error: publicGuardError(guard), retryable: false } };
    }
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
      multiAngle, variant, /* v-studio-variants: رقم الشكل داخل الخيار (عدّاد العميل) */
      originalBase64, originalMime, /* v-studio-chain: الصورة الأصليّة حين يكون هذا تعديلًا تاليًا في سلسلة */
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
      /* v-merge-faces: قالب هويّة الدمج نفسه (maha-image) — كان الأمر يطلب «مزج» الناس معًا (blend) — دعوة صريحة لخلط الوجوه،
         والناس «recognizable» فقط. كلّ صورة بعنوانها، ولقطة مقرّبة لكلّ وجه، والأمر الكامل آخرًا ويستلمه GPT نفسه. */
      const task = description ? String(description).slice(0, 300) : 'Place the people/subjects from both photos together naturally in one consistent, photorealistic scene.';
      const photos = [{ data: imageBase64, mime: mimeType || 'image/jpeg' }, { data: imageBase64B, mime: mimeTypeB || 'image/jpeg' }];
      const crops = await mergeIdentity.faceCrops(apiKey, photos);
      const parts = mergeIdentity.mergeParts(photos, crops, task);
      const promptText = parts[parts.length - 1].text;
      const out = await geminiImage(apiKey, parts, 'merge', mergeIdentity.mergeAspect(photos[0], task));
      if (out.b64) {
        const rem = await consumeStudio(quota.username);
        res.status(200).json({ imageBase64: out.b64, mimeType: out.mime, remaining: rem, dailyLimit: STUDIO_DAILY_LIMIT });
        return;
      }
      const rescue = await rescueGuarded(promptText, photos.concat(crops).map((p) => [p.data, p.mime]), apiKey, 'merge');
      if (rescue) {
        const remR = await consumeStudio(quota.username);
        res.status(200).json({ imageBase64: rescue, mimeType: 'image/png', engine: 'openai', remaining: remR, dailyLimit: STUDIO_DAILY_LIMIT });
        return;
      }
      res.status(out.status || 502).json({ error: out.error || 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    if (feature === 'combo') { res.status(410).json({ error: 'combo_removed' }); return; } /* v-studio-combo-removed: أمر المالك */

    const promptText = buildSinglePrompt(feature, style, description, multiAngle, Number(variant));
    if (!promptText) { res.status(400).json({ error: 'Unknown feature' }); return; }
    let guardOpts = null;
    /* v-edit-no-change: الميزات الخفيّة (بشرة، عيون، جسم، عمر) تغييرها دقيق فلا يُفرض عليها */
    /* v-visible-change: العيون والجسم والعمر تغييرها ظاهر — «ما تغيّر» يُكشف ويُعاد؛ البشرة وحدها دقيقة بطبعها */
    const SUBTLE = ['skin'];
    if (feature !== 'merge') guardOpts = { userPrompt: [feature, style, description].filter(Boolean).join(' '), allowStyleChange: feature === 'anime', requireChange: SUBTLE.indexOf(feature) === -1 };
    try {
      const r = await runEdit({
        apiKey, openaiKey, feature, promptText, imageBase64, mimeType,
        lockLevel: faceLock.protectLevel(feature),
        collage: !!(multiAngle && (feature === 'hair' || feature === 'heritage' || feature === 'beard')),
        guard: guardOpts, skipGuard: !guardOpts,
      });
      /* v-studio-chain (طلب المالك ٣٠ سبتمبر: «يختار كذا شي… وشوف يغيّر شكل الشخصيّة»): في السلسلة كلّ
         خطوة تُعدِّل ناتج السابقة، فحارس الخطوة يقارن بالناتج السابق لا بصورة المستخدم — والانزياح في
         الهويّة يتراكم خطوة بعد خطوة. هنا فحص هويّة إضافيّ مقابل **الأصل** نفسه قبل الخصم: التعديلات
         المطلوبة كلّها مسموحة (allowBroadChange)، والمرفوض وحده أن يصير شخصًا آخر. */
      if (originalBase64 && originalBase64 !== imageBase64) {
        const idg = await verifyLocalizedImageEdit({
          apiKey, sourceBase64: originalBase64, sourceMime: originalMime || 'image/jpeg',
          resultBase64: r.b64, resultMime: r.mime,
          userPrompt: 'Identity check only: several intended style edits (hair, makeup, eyes, outfit, accessories, background) were applied on purpose. Judge only whether it is still the same person.',
          allowBroadChange: true, allowStyleChange: feature === 'anime',
        });
        if (!idg.ok && idg.reason === 'identity_or_scope_mismatch') {
          res.status(422).json({ error: 'image_edit_identity_mismatch', retryable: false, chainStep: true });
          return;
        }
      }
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
module.exports.buildSinglePrompt = buildSinglePrompt; /* v-studio-variety: للاختبار */
module.exports.DESIGN_FEATURES = DESIGN_FEATURES;
