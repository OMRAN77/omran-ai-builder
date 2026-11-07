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
const { keepGuardCharge } = require('./image-giveback.js'); /* v-guard-cap */

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
/* v-audit-studeng (srv-studios-1-2): المحاولة الثانية تُفحص كالأولى، ورفض المحاولتين { rejected } يصير ٤٢٢ عند المتّصل —
   كان `second || first` يسلّم الثانية بلا فحص أو الأولى المرفوضة نفسها (وجه شخص آخر) ويُخصم. verdictOf = حارس runEdit نفسه
   (طلبه بسطر المجمّع وrequireChange)؛ بدونه (الدمج) الحارس القديم. */
async function rescueGuarded(promptText, images, apiKey, feature, verdictOf) {
  const first = await openaiStudioEdit(promptText, images);
  if (!first || feature === 'anime' || feature === 'merge' || !apiKey) return first;
  const judge = verdictOf || ((b64) => verifyLocalizedImageEdit({ apiKey, sourceBase64: images[0][0], sourceMime: images[0][1] || 'image/jpeg', resultBase64: b64, resultMime: 'image/png', userPrompt: promptText.slice(0, 600) }));
  const passed = (g) => !!(g && (g.ok || g.reason === 'validation_unavailable'));
  try {
    const g = await judge(first, 'image/png');
    if (passed(g)) return first;
    const second = await openaiStudioEdit(promptText + (g.reason === 'no_change' ? NO_CHANGE_RETRY : STRONGER_LOCK), images);
    if (!second) return { rejected: g };
    const g2 = await judge(second, 'image/png');
    return passed(g2) ? second : { rejected: g2 };
  } catch (e) { return first; /* الحارس لا يرمي؛ عطب غير متوقّع لا يُسقط صورة مدفوعة (v-guard-fail-open) */ }
}
const { verifyLocalizedImageEdit, publicGuardError, extractJsonObject } = require('./image-edit-guard'); /* v-celeb-style: extractJsonObject لجواب فحص الاسم */
const faceLock = require('./face-lock.js');
const mergeIdentity = require('./merge-identity');
const { judgeBest, duoEnabled } = require('./image-judge');
const variants = require('./studio-variants.js'); /* v-studio-variants */
const falBackup = require('./fal-fallback.js'); /* v-fal-backup */

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
  /* v-style-match: «same nail shape and length» كان يمنع خيارات الشكل نفسها (ستيليتو، كوفن، طويلة…) — الشكل المطلوب يغلب */
  'same nail shape and length unless the requested style itself names a nail shape or length, same size, same pose and same background. ' +
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
/* v-style-match: وصف الخيار يصل المحاور — ما سمّاه الخيار (لونه، طوله، مكانه، خامته…) لا يُنوَّع */
function varietyLine(feature, variant, style, text) {
  if (!variants.hasVariation(feature, style, text)) return '';
  const total = variants.variantCount(feature, style, text);
  const n = Number.isFinite(variant) ? Math.abs(Math.floor(variant)) : Math.floor(Math.random() * total);
  const directive = variants.variantDirective(feature, n, style, text);
  const note = VARIETY_NOTE[feature] || 'Produce a fresh original execution of this exact style; do not repeat an earlier one.';
  return '\nVARIATION #' + (n % total) + ' — a fresh execution of the chosen style. The chosen style described above is the authority: ' +
    'keep every colour, finish, shape, size and placement it names exactly. Use the following ideas only for details the style leaves open, ' +
    'and skip any idea that contradicts it: ' + directive + '.\n' + note +
    '\nThe requested change must be clearly and unmistakably visible in the result.';
}

/* v-guard-cap: سطر «المجمّع من ثلاث زوايا» نفسه يصل المولّد والحارس — بدونه يرى الحارس ثلاث لوحات لم يطلبها أحد
   فيحكم «تغيّر النطاق»، ورفض الحارس صار يُحتسب بعد اثنين في اليوم: لا يدفع الأمين ثمن تناقض أمرنا. */
const COLLAGE_FEATURES = ['hair', 'heritage', 'beard'];
const COLLAGE_CLAUSE = 'Output a single image laid out as a clean 3-panel collage side by side showing the SAME person and look from three angles: front view, side view, and back view.';

/* وصف الخيار كما هو في البيانات (الأوّل احتياطًا لمفتاح مجهول) — يقرؤه الأمر وقفل الوجه وسطر التنويع */
function styleTextOf(feature, style) {
  const styleMap = STYLE_TEXT[feature] || {};
  if (styleMap[style]) return styleMap[style];
  const firstKey = Object.keys(styleMap)[0];
  return firstKey ? styleMap[firstKey] : 'a stylish new look';
}
/* v-style-match: الصورة الرسميّة — القفل كان يقول «غيّر الخلفية والتأطير فقط» و١٠٣ من ١٠٤ خيارات تغيّر اللبس أيضًا */
const IDPHOTO_OUTFIT = /suit|shirt|\btie\b|blazer|kandora|kandura|thobe|abaya|uniform|coat|scrubs|polo|sweater|gown|dress|jacket|hijab|ghutra|shemagh|sheila|shayla|outfit|clothing|robe/;
function lockWhatOf(feature, text) {
  if (feature === 'idphoto' && IDPHOTO_OUTFIT.test(String(text || '').toLowerCase())) return 'the background, framing and the outfit named in the request';
  return LOCK_WHAT[feature] || 'the requested detail';
}

/* ───── بناء أمر ميزة واحدة (كان داخل المعالج) ───── */
function buildSinglePrompt(feature, style, description, multiAngle, variant) {
  const baseDesc = styleTextOf(feature, style);
  let styleDesc = baseDesc;
  if (feature === 'tattoo' && style === 'custom' && description) {
    styleDesc = 'a tattoo design of ' + String(description).slice(0, 300);
  } else if (description) {
    styleDesc += ' (' + String(description).slice(0, 200) + ')';
  }
  const buildFn = FEATURE_INSTRUCTIONS[feature];
  if (!buildFn) return null;
  let promptText = buildFn(styleDesc);
  if (feature !== 'anime') promptText += '\n' + sourceStylePreservationRule() + EDIT_LOCK(lockWhatOf(feature, baseDesc));
  if (multiAngle && COLLAGE_FEATURES.indexOf(feature) !== -1) {
    promptText += ' ' + COLLAGE_CLAUSE;
  }
  if (DESIGN_FEATURES.indexOf(feature) !== -1) promptText += SKIN_LOCK;
  promptText += varietyLine(feature, variant, style, baseDesc);
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
  /* v-fal-backup: رصيد Gemini خلص قبل دقائق ← النموذج نفسه عند fal مباشرة بلا نداء فاشل قبله. محاولة fal واحدة لكلّ نداء:
     إن رفض هنا لا يُعاد بعد فشل Gemini (المهلة المقطوعة قد تُحاسَب عنده) */
  let falTried = false;
  if (await falBackup.geminiOutRecently()) {
    falTried = true;
    const fb = await falBackup.imageFromGemini('gemini-3-pro-image', reqBody, { where: 'studio-create' });
    if (fb.b64) return { b64: fb.b64, mime: fb.mime };
    /* v-celeb-style: رفض الاحتياط صورةَ شخص مسمّى (٤٢٢ أو بلا صورة) — يصل رفضًا (celeb_refused) لا «متوقّفة مؤقّتًا» بعد نداء Gemini المنفد */
    if (feature === 'celeb' && (fb.error === 'fal_empty' || fb.status === 422)) return { error: 'image_generation_failed', status: 500, why: 'fallback_refused' };
  }
  const upstream = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(240000), /* v-image-timeout */
  });
  const data = await upstream.json();
  if (!upstream.ok) {
    const tech = String((data && data.error && data.error.message) || 'unknown');
    const detail = tech.replace(/key=[^&\s"']+/g, 'key=***').slice(0, 200);
    console.error('[studio-create] upstream failed status=' + upstream.status + ' detail=' + detail);
    /* v-fal-backup: نفاد الرصيد ← fal بالنموذج نفسه قبل أيّ رمز خطأ (والباقي كما كان) */
    const fb = falTried ? null : await falBackup.rescueImage(upstream.status, tech, 'gemini-3-pro-image', reqBody, { where: 'studio-create' });
    if (fb) return { b64: fb.b64, mime: fb.mime };
    /* v-audit-studeng (srv-studios-1-3): رمز لا نصّ — كان «تعذّر إنشاء الصورة الآن…» عربيًّا لكلّ اللغات ومعه نصّ المزوّد الخامّ (detail).
       نفاد الرصيد أو عطب المفتاح = unavailable بـ503 («الخدمة متوقّفة مؤقّتًا»، v-credit-out)؛ الزحام busy؛ والباقي failed. السبب في السجلّ وحده. */
    if (require('./_videoFail.js').isOutage(upstream.status, tech)) return { error: 'unavailable', status: 503 };
    const busy = upstream.status === 429 || upstream.status >= 500;
    return { error: busy ? 'image_generation_busy' : 'image_generation_failed', status: 502 };
  }
  const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
  if (!imgPart) {
    const why = String((((data.candidates || [])[0] || {}).finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '').slice(0, 40);
    console.warn('[studio-create] no image from upstream (' + (why || 'none') + ')'); /* v-audit-studeng: رمز المزوّد (IMAGE_SAFETY…) للسجلّ لا للمستخدم */
    return { error: 'image_generation_failed', status: 500, why };
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
  /* v-audit-studeng: الحكم نفسه (لا نعم/لا فقط) — سبب الرفض يختار سطر المحاولة الثانية ورمز ٤٢٢ في مسارَي القناع والإنقاذ أيضًا */
  const verdictOf = async (b64, mime) => {
    if (o.skipGuard) return { ok: true, reason: 'skipped' };
    return verifyLocalizedImageEdit({ apiKey: o.apiKey, sourceBase64: o.imageBase64, sourceMime: o.mimeType || 'image/jpeg', resultBase64: b64, resultMime: mime, userPrompt: (o.guard && o.guard.userPrompt) || o.feature, allowStyleChange: !!(o.guard && o.guard.allowStyleChange), requireChange: !!(o.guard && o.guard.requireChange) });
  };
  const passes = (g) => !!(g && (g.ok || g.reason === 'validation_unavailable'));
  const guardOf = async (b64, mime) => passes(await verdictOf(b64, mime));
  /* v-studio-guard-retry (شكوى المالك: «image_edit_identity_mismatch» على صورة كفّ):
     رسمةٌ واحدة شاردة كانت تُسقط الطلب كلّه بخطأ أحمر. محاولة ثانية واحدة بقفل
     أشدّ وحرارة ٠٫١٥ قبل الإبلاغ — الفشل يبقى فشلًا إن تكرّر (٤٢٢ ← keepGuardCharge في المعالج). */
  const retryOrReject = async (guard) => {
    console.warn('[studio-create] guard rejected ' + o.feature + ' (' + guard.reason + ') — second attempt with a stronger lock');
    const retryNote = guard.reason === 'no_change' ? NO_CHANGE_RETRY : STRONGER_LOCK;
    const retryParts = [{ text: o.promptText + retryNote }, { inlineData: { mimeType: o.mimeType || 'image/jpeg', data: o.imageBase64 } }];
    const again = await geminiImage(o.apiKey, retryParts, o.feature, null, 0.15);
    if (again.b64 && await guardOf(again.b64, again.mime)) return finish(again.b64, again.mime, 'gemini+retry');
    throw { status: 422, payload: { error: publicGuardError(guard), retryable: false } };
  };
  if (prep) {
    if (duo) gemP = geminiImage(o.apiKey, parts, o.feature).catch(function () { return {}; });
    const masked = await faceLock.maskedEdit(prep, o.openaiKey, o.promptText);
    if (masked) {
      /* v-audit-studeng (srv-studios-1-1): نتيجة القناع تمرّ على الحارس نفسه (requireChange) — كانت تُسلَّم بلا سؤال في ١٦ ميزة،
         فصورة «لم يتغيّر فيها شيء» تُخصم (v-edit-no-change لا يعمل). يُرفض القناع ومرشّح Gemini معًا ⇒ المحاولة الثانية ثمّ ٤٢٢. */
      const g = gemP ? await gemP : null;
      const [mv, gv] = await Promise.all([verdictOf(masked, 'image/png'), (g && g.b64) ? verdictOf(g.b64, g.mime) : null]);
      const maskOk = passes(mv), gemOk = !!(g && g.b64) && passes(gv);
      if (maskOk && gemOk) {
        try {
          const pick = await judgeBest({ apiKey: o.apiKey, prompt: o.promptText, source: { b64: o.imageBase64, mime: o.mimeType || 'image/jpeg' }, a: { b64: masked, mime: 'image/png' }, b: { b64: g.b64, mime: g.mime } });
          if (pick === 'b') return finish(g.b64, g.mime, 'gemini+judge');
        } catch (e) { console.warn('[studio-create] duo judge skipped: ' + (e && e.message)); }
      }
      if (maskOk) return finish(masked, 'image/png', gemP ? 'openai-lock+judge' : 'openai-lock');
      if (gemOk) return finish(g.b64, g.mime, 'gemini+judge');
      return retryOrReject(mv);
    }
    console.warn('[studio-create] masked edit unavailable for ' + o.feature + ' — falling back to gemini');
  } else if (o.lockLevel && o.lockLevel !== 'none') {
    console.warn('[studio-create] face-lock prepare failed for ' + o.feature + ' — no pixel restore');
  }
  const out = gemP ? await gemP : await geminiImage(o.apiKey, parts, o.feature);
  if (!out.b64) {
    /* v-studio-rescue / v-studio-noimg-rescue: gpt-image-1 قبل إبلاغ الفشل */
    const rescue = await rescueGuarded(o.promptText, [[o.imageBase64, o.mimeType]], o.apiKey, o.feature, verdictOf);
    /* v-audit-studeng (srv-studios-1-2): رفض الحارس للمحاولتين = ٤٢٢ كمسار Gemini (لا تسليم صورة مرفوضة) */
    if (rescue && rescue.rejected) throw { status: 422, payload: { error: publicGuardError(rescue.rejected), retryable: false } };
    if (rescue) return finish(rescue, 'image/png', 'openai');
    /* v-audit-studeng (srv-studios-1-3): الرمز وحده — upstream/detail (نصّ المزوّد) بقيا في السجلّ */
    throw { status: out.status || 502, payload: { error: out.error || 'image_generation_failed' } };
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
    else if (!guard.ok) return retryOrReject(guard);
  }
  return finish(out.b64, out.mime, 'gemini');
}

/* ───── v-celeb-style (طلب المالك ٧ نوفمبر ٢٠٢٦: «خاصية تصور مع مشاهير العالم كلهم، المشاهير القدماء
   والجدد، وتكون في الاستايل»، ثمّ «الحينه فقط لي المالك فقط لا تنشره» و«شيلها عنّي»).

   المستخدم يرفع صورته ويكتب اسم أيّ مشهور نصًّا حرًّا ويختار مشهدًا من ثمانية؛ المولّد يضعهما معًا في صورة واحدة.
   شبه المشهور من معرفة النموذج وحدها — لا صورة مرجعيّة تُجلب له (صور الصحافة محفوظة الحقوق، وصورة حقيقيّة تجعلها تركيب وجه).

   قبل أيّ توليد يُفحص الاسم بنداء نصّيّ قصير (JSON بمخطّط): هل النصّ اسم شخص واحد فقط، من هو (اسمه الشائع ونوع شهرته)، هل هو
   حقيقيّ معروف الوجه، هل هو من الأنبياء والصحابة وآل البيت، هل هو قاصر. والاسم المكتوب لا يدخل أمر الصورة أبدًا — الأمر يأخذ
   الاسم الشائع الذي أرجعه الفحص (المراجعة العدائيّة: «رونالدو وولده» و«… يبوسني» كانت تصل المولّد بنصّها).
     ممنوع على الجميع دائمًا: الأنبياء والصحابة وآل البيت، والقُصّر، والنصّ الذي فيه غير الاسم، والخياليّ وغير المعروف (لا وجه
     يُخترع ويُنسب لاسم حقيقيّ)، واللقطات الرومانسيّة (المشاهد ثابتة والأمر يمنع التلامس — لا وصف حرّ في هذه الميزة).
     ممنوع على غير المالك (حين تُفتح للجميع): السياسيّون والحكّام والأسر الحاكمة والعلماء والقرّاء والدعاة — المالك اختار رفعها عنه.
   تعذّر الفحص أو جواب خارج المخطّط = لا توليد (يُغلق الباب ولا يُفتح). ───── */
const CHECK_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=';

/* المشاهد الثمانية — مفاتيحها نفسها في STUDIO_OPTIONS.celeb (app-13). كلّها لقطة ودّيّة جنبًا إلى جنب. */
const SCENES = {
  selfie: 'a casual close-up selfie of the two of them taken at arm\'s length, both smiling at the camera, with a bright, pleasant city street softly blurred behind them',
  polaroid: 'an instant-film Polaroid photo of the two of them standing side by side and smiling, lit by an on-camera flash against a plain curtain backdrop, shown as a real Polaroid print with its classic white border',
  redcarpet: 'the two of them posing side by side on the red carpet at a film premiere, with press photographers\' flashes and the event backdrop softly blurred behind them, in evening event lighting',
  backstage: 'the two of them backstage after a big concert, posing side by side near the stage entrance, with stage lights and equipment softly blurred behind them',
  stadium: 'the two of them standing side by side pitch-side in a packed football stadium in daylight, with the green pitch and the crowded stands behind them',
  photoshoot: 'a professional photoshoot of the two of them standing side by side against a seamless neutral studio backdrop, under soft, even studio lighting, with no lighting equipment visible',
  talkshow: 'the two of them sitting side by side on a stylish sofa on a bright television talk-show set under studio lights, turned slightly toward each other and smiling',
  vintage: 'an authentic old black-and-white photograph of the two of them standing side by side, with soft film grain, gentle vignetting and the tones of a decades-old print',
};

const KINDS = ['athlete', 'actor', 'singer', 'musician', 'creator', 'presenter', 'business', 'scientist', 'writer', 'artist',
  'historical', 'politician', 'head_of_state', 'royal', 'religious_scholar', 'sacred', 'other'];
const KIND_WORD = {
  athlete: 'athlete', actor: 'actor', singer: 'singer', musician: 'musician', creator: 'content creator', presenter: 'TV presenter',
  business: 'business figure', scientist: 'scientist', writer: 'writer', artist: 'artist', historical: 'historical figure',
  politician: 'politician', head_of_state: 'head of state', royal: 'royal', religious_scholar: 'religious scholar', other: 'public figure',
};
/* لغير المالك وحده (الميزة اليوم للمالك؛ هذا هو الاتّفاق حين تُفتح) */
const PUBLIC_BLOCK = ['politician', 'head_of_state', 'royal', 'religious_scholar'];

/* الاسم كما كتبه المستخدم: سطر واحد قصير بلا روابط ولا علامات ولا أقواس. '' = لا اسم صالح. يدخل الفحص وحده لا أمر الصورة. */
function sanitizeName(raw) {
  let s = String(raw == null ? '' : raw).normalize('NFC')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff"“”«»<>{}\[\]()\\`|]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (s.length > 60) s = s.slice(0, 60).replace(/\s+\S*$/, '').trim() || s.slice(0, 60);
  if ((s.match(/\p{L}/gu) || []).length < 2) return '';
  if (s.split(' ').length > 8) return '';
  return s;
}

/* حجب محلّيّ قبل الفحص (لا يُترك للنموذج وحده): ألقاب الأنبياء والصحابة وآل البيت الصريحة، على نسخة مطويّة بلا تشكيل ولا
   تطويل ولا محارف خفيّة وبهمزات موحّدة (المراجعة: «النّبيّ» و«رضيَ الله عنه» و«عليهِ السلام» كانت تمرّ). لا يحجب الأسماء
   المجرّدة — «محمد صلاح» و«عمر الشريف» و«حسين الجسمي» و«رسول خان» و«Allah Rakha» تمرّ، والفحص يحسم «محمد» أو «علي» وحده. */
function foldName(s) {
  return String(s || '').normalize('NFC')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
}
const SACRED_AR = new RegExp([
  '(?:^|[^\\p{L}])[وبلف]?ال(?:نبي|رسول|صحابي|صحابيه|صحابية|صحابه|صحابة)(?:[^\\p{L}]|$)',
  'رسول\\s*الله', 'نبي\\s*الله', '(?:^|[^\\p{L}])سيد(?:نا|تنا)(?:[^\\p{L}]|$)', 'ام\\s*المومنين', 'ال\\s*البيت',
  'صلي\\s*الله\\s*عليه', 'عليه(?:ما)?\\s*(?:الصلا[ةه]\\s*و)?السلام', 'عليها\\s*السلام', 'رضي\\s*الله\\s*عن', 'ﷺ', '\\((?:ص|ع|رض|عج)\\)', '(?:^|[^\\p{L}])(?:رض|عج)(?:[^\\p{L}]|$)',
  '(?:^|[^\\p{L}])الامام\\s+(?:علي|الحسن|الحسين|زين\\s*العابدين|الباقر|جعفر\\s*الصادق|الكاظم|الرضا|الجواد|الهادي|العسكري|المهدي)(?:[^\\p{L}]|$)',
  'يسوع', '(?:^|[^\\p{L}])المسيح(?:[^\\p{L}]|$)', 'العذراء',
].join('|'), 'u');
const SACRED_EN = /\b(?:prophet|messenger\s+of\s+(?:god|allah)|rasul(?:ullah|\s+allah)|nabiyy?ullah|nabi\s+allah|pbuh|p\.b\.u\.h|peace\s+be\s+upon\s+(?:him|her|them)|sall?all?ahu|alayhi[\s-]*(?:s[\s-]*)?salam|radiy?all?ahu|virgin\s+mary|sahaba|sahabi|sayyid[iu]na|hazrat|hazreti|christ)\b|\bhz\.|\((?:saw|s\.a\.w\.?|as|a\.s\.?|ra|r\.a\.?)\)/i;
function sacredName(name) {
  const s = foldName(name);
  return SACRED_AR.test(s) || SACRED_EN.test(s);
}

function checkPrompt(name) {
  return [
    'You check text that a user typed into the "celebrity name" box of a "photo of me with a celebrity" feature. Reply with JSON only.',
    '- only_name: true only if the text is just ONE person\'s name (any language or spelling, optionally with a common title such as Dr. or Sheikh); false if it also contains anything else — another person, a relation (e.g. "and his son", "with his wife"), an action, a pose, clothing, a place, an age, a scene or any request.',
    '- real: true only for a real person who exists or existed — false for fictional, animated, game, mascot or brand characters.',
    '- known: true only if this person is famous enough that their face is widely recognisable from public photos or well-known portraits. If unsure, false.',
    '- name: the person\'s full name as commonly written in English (Latin letters) — the name only, nothing else; "" if you do not know who this is.',
    '- sacred: true if the person is a prophet or messenger of any religion (including Jesus, Moses, Abraham and Muhammad), a Companion (Sahabi or Sahabiyya) of the Prophet Muhammad, a wife, family member or descendant of the Prophet Muhammad counted among Ahl al-Bayt (including Fatima, Ali, Hasan, Husayn, Zaynab and the Twelve Imams), Mary the mother of Jesus, an angel or a deity — true even if they were also a caliph, ruler, commander, imam or scholar.',
    '- kind: exactly one of ' + KINDS.join(', ') + '. Use sacred whenever sacred is true. religious_scholar = a religious scholar, Quran reciter, preacher or clergy member who is not sacred.',
    '- minor: true if the person is under 18 years old today, died before turning 18, or is known mainly from photos taken when they were under 18.',
    '- photographed: true if real photographs of this person exist (roughly anyone alive after 1850); false if they are known only from paintings, statues or descriptions.',
    'Arabic and dialect spellings are common — judge who is meant. If the name is ambiguous, choose the most famous person with that name.',
    'Text: "' + String(name || '').replace(/["\n]+/g, ' ').slice(0, 80) + '"',
  ].join('\n');
}
/* مخطّط الجواب: النوع من القائمة والحقول كلّها إلزاميّة — لا «نوع آخر» يفلت من الحجب */
const CHECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    only_name: { type: 'BOOLEAN' }, real: { type: 'BOOLEAN' }, known: { type: 'BOOLEAN' }, name: { type: 'STRING' },
    sacred: { type: 'BOOLEAN' }, kind: { type: 'STRING', enum: KINDS }, minor: { type: 'BOOLEAN' }, photographed: { type: 'BOOLEAN' },
  },
  required: ['only_name', 'real', 'known', 'name', 'sacred', 'kind', 'minor', 'photographed'],
};

/* جواب الفحص بحزم: كلّ حقل بنوعه والنوع من القائمة، وإلّا null (= تعذّر الفحص ← لا توليد) */
function parseCheck(raw) {
  const o = (raw && typeof raw === 'object') ? raw : extractJsonObject(raw);
  if (!o || typeof o !== 'object') return null;
  if (!['only_name', 'real', 'known', 'sacred', 'minor'].every((k) => typeof o[k] === 'boolean')) return null;
  const kind = String(o.kind || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!KINDS.includes(kind)) return null;
  const name = String(o.name || '').replace(/[\u0000-\u001f\u007f"“”«»<>{}\[\]()\\`|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return { only_name: o.only_name, real: o.real, known: o.known, sacred: o.sacred, minor: o.minor, kind, name, photographed: o.photographed !== false };
}

/* نداء الفحص — الحكم أو null. لا يرمي. */
async function checkName(apiKey, name, fetchImpl) {
  if (!apiKey || !name) return null;
  const f = fetchImpl || fetch;
  try {
    const r = await f(CHECK_URL + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: checkPrompt(name) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: 'application/json', responseSchema: CHECK_SCHEMA, thinkingConfig: { thinkingBudget: 0 } }, /* v-flash-nothink */
      }),
    });
    if (!r.ok) { console.warn('[studio-celeb] name check HTTP ' + r.status); return null; }
    const d = await r.json().catch(function () { return null; });
    const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join(' '));
    return parseCheck(txt);
  } catch (e) { console.warn('[studio-celeb] name check ' + (e && e.message)); return null; }
}

/* سبب المنع أو '' — owner: صاحب الطلب هو المالك */
function blockReason(v, o) {
  if (!v) return 'unavailable';
  if (v.sacred || v.kind === 'sacred' || v.minor) return 'celeb_blocked';
  if (!v.only_name) return 'celeb_name_only';
  if (!v.real || !v.known || !v.name) return 'celeb_unknown';
  if (!(o && o.owner) && PUBLIC_BLOCK.includes(v.kind)) return 'celeb_blocked';
  return '';
}

/* مهمّة الدمج (تدخل قالب هويّة الدمج: الصورة ١ هي المستخدم بوجهه ولباسه كما صُوّر) — بالاسم الشائع من الفحص وحده */
function celebTask(v, scene) {
  return 'Photo 1 is the user. Make a photo of the user together with ' + v.name + ', the real, famous ' + (KIND_WORD[v.kind] || 'public figure') +
    ', shown with their true, widely recognised face and appearance ' +
    (v.photographed === false ? 'as depicted in their best-known portraits, rendered as a realistic photograph' : 'as seen in their well-known public photos') +
    ', as an adult at the height of their fame. ' +
    'Scene: ' + (SCENES[scene] || SCENES.selfie) + '. ' +
    'The two of them appear side by side like a friendly photo with a fan: a natural, respectful pose with no hugging, no kissing, no holding hands and no romantic or intimate contact. ' +
    'The famous person is fully and modestly dressed in their typical style. ' +
    'The user keeps their own face, hair, head covering and clothing exactly as in Photo 1. Never give the user any of the famous person\'s features, and never give the famous person any of the user\'s features. ' +
    'No text, captions, names, logos, brand marks or watermarks anywhere in the image. The two of them are the only people in focus; anyone else is only a blurred background figure.';
}
const celeb = { SCENES, KINDS, PUBLIC_BLOCK, CHECK_SCHEMA, sanitizeName, foldName, sacredName, checkPrompt, parseCheck, checkName, blockReason, celebTask, CHECK_URL };

/* ───── v-celeb-style: «صورة مع مشهور» — للمالك وحده الآن (أمره ٧ نوفمبر «الحينه فقط لي المالك فقط لا تنشره»).
   الترتيب: بوّابة المالك ← الاسم ← حجب الألقاب ← الحجز ← فحص الاسم ← قالب هويّة الدمج بصورة المستخدم وحدها.
   لا قفل وجه ولا حارس موضعيّ (المشهد جديد وفيه شخص مضاف — الحارس يرفضه حتمًا، وقفل الوجه قد يختار المشهور «الشخص الرئيسيّ»).
   ولا إنقاذ بمحرّك آخر: رفض المولّد صورةً لشخص مسمّى قرار سلامة لا عطب، وتمريره لمحرّك ثانٍ التفاف عليه. ───── */
async function celebCreate(res, o) {
  const owner = require('./_owner.js');
  if (!owner.isOwnerSession({ query: o.query || {}, body: o.body })) { res.status(400).json({ error: 'Unknown feature' }); return; }
  const typed = String(o.body.celebName == null ? '' : o.body.celebName).trim();
  const name = celeb.sanitizeName(typed);
  /* مكتوب لكن غير صالح (رابط وحده، أكثر من ثماني كلمات…) ≠ فارغ — رسالتان مختلفتان */
  if (!name) { res.status(400).json({ error: typed ? 'celeb_name_only' : 'celeb_name_required' }); return; }
  if (!Object.prototype.hasOwnProperty.call(celeb.SCENES, o.body.style)) { res.status(400).json({ error: 'Unknown style' }); return; }
  if (celeb.sacredName(typed) || celeb.sacredName(name)) { res.status(422).json({ error: 'celeb_blocked' }); return; } /* المكتوب قبل التنظيف أيضًا: «(رض)» تفقد أقواسها فيه */
  const quota = await checkStudioQuota(o.body.token, res); /* v-atomic-quota: الحجز يُردّ ما لم تُستهلك صورة */
  if (!quota.allowed) { res.status(quota.reason === 'auth' ? 401 : 402).json({ error: quota.reason === 'auth' ? 'auth_required' : 'daily_limit_reached' }); return; }
  const verdict = await celeb.checkName(o.apiKey, name);
  const why = celeb.blockReason(verdict, { owner: owner.isOwnerName(quota.username) });
  if (why) {
    console.warn('[studio-celeb] stopped: ' + why + (verdict ? ' kind=' + verdict.kind : ''));
    res.status(why === 'unavailable' ? 503 : 422).json({ error: why });
    return;
  }
  const photos = [{ data: o.body.imageBase64, mime: o.body.mimeType || 'image/jpeg' }];
  const crops = await mergeIdentity.faceCrops(o.apiKey, photos);
  const parts = mergeIdentity.mergeParts(photos, crops, celeb.celebTask(verdict, o.body.style));
  const out = await geminiImage(o.apiKey, parts, 'celeb', mergeIdentity.mergeAspect(photos[0], ''));
  if (out.b64) {
    const remaining = await consumeStudio(quota.username, quota.limit);
    res.status(200).json({ imageBase64: out.b64, mimeType: out.mime, remaining, dailyLimit: quota.limit || STUDIO_DAILY_LIMIT });
    return;
  }
  /* ردّ بلا صورة (why موجود) = المولّد رفض هذا الاسم أو المشهد؛ ما سواه عطب أو زحام كبقيّة الميزات. لا خصم في الحالين. */
  if (out.why !== undefined) { res.status(422).json({ error: 'celeb_refused' }); return; }
  res.status(out.status || 502).json({ error: out.error || 'image_generation_failed' });
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
      res.status(503).json({ error: 'unavailable' }); /* v-audit-studeng (srv-studios-1-3): رمز «الخدمة متوقّفة مؤقّتًا» بلغة الواجهة */
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

    if (feature === 'celeb') { await celebCreate(res, { apiKey, body, query: req.query }); return; } /* v-celeb-style */

    const quota = await checkStudioQuota(token, res); /* v-atomic-quota: حجز ذرّيّ يُردّ إن فشل */
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
        const rem = await consumeStudio(quota.username, quota.limit);
        res.status(200).json({ imageBase64: out.b64, mimeType: out.mime, remaining: rem, dailyLimit: quota.limit || STUDIO_DAILY_LIMIT });
        return;
      }
      const rescue = await rescueGuarded(promptText, photos.concat(crops).map((p) => [p.data, p.mime]), apiKey, 'merge');
      if (rescue) {
        const remR = await consumeStudio(quota.username, quota.limit);
        res.status(200).json({ imageBase64: rescue, mimeType: 'image/png', engine: 'openai', remaining: remR, dailyLimit: quota.limit || STUDIO_DAILY_LIMIT });
        return;
      }
      res.status(out.status || 502).json({ error: out.error || 'image_generation_failed' }); /* v-audit-studeng: رمز لا نصّ */
      return;
    }

    if (feature === 'combo') { res.status(410).json({ error: 'combo_removed' }); return; } /* v-studio-combo-removed: أمر المالك */

    const promptText = buildSinglePrompt(feature, style, description, multiAngle, Number(variant));
    if (!promptText) { res.status(400).json({ error: 'Unknown feature' }); return; }
    let guardOpts = null;
    /* v-edit-no-change: الميزات الخفيّة (بشرة، عيون، جسم، عمر) تغييرها دقيق فلا يُفرض عليها */
    /* v-visible-change: العيون والجسم والعمر تغييرها ظاهر — «ما تغيّر» يُكشف ويُعاد؛ البشرة وحدها دقيقة بطبعها */
    const SUBTLE = ['skin'];
    const collage = !!(multiAngle && COLLAGE_FEATURES.indexOf(feature) !== -1);
    /* v-guard-cap: المجمّع قبل الوصف — الحارس يقصّ الطلب عند ٨٠٠ حرف، والوصف نصّ حرّ من المستخدم */
    if (feature !== 'merge') guardOpts = { userPrompt: [feature, style, collage ? COLLAGE_CLAUSE : '', description].filter(Boolean).join(' '), allowStyleChange: feature === 'anime', requireChange: SUBTLE.indexOf(feature) === -1 };
    try {
      const r = await runEdit({
        apiKey, openaiKey, feature, promptText, imageBase64, mimeType,
        lockLevel: faceLock.protectLevel(feature, null, styleTextOf(feature, style)), /* v-style-match: غطاء الرأس المسمّى في الخيار لا يُقفل */
        collage,
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
          await keepGuardCharge('studio', quota, consumeStudio); /* v-guard-cap: بصورة شخص آخر يفشل حتميًّا — كان بلا حدّ والعدّاد صفر */
          res.status(422).json({ error: 'image_edit_identity_mismatch', retryable: false, chainStep: true });
          return;
        }
      }
      const remaining = await consumeStudio(quota.username, quota.limit);
      res.status(200).json({ imageBase64: r.b64, mimeType: r.mime, engine: r.engine, remaining, dailyLimit: quota.limit || STUDIO_DAILY_LIMIT });
    } catch (err) {
      if (err && err.status && err.payload) {
        /* v-guard-cap: ٤٢٢ المرميّ من runEdit = رفض الحارس بعد محاولتين مدفوعتين؛ ٥٠٢/٥٠٠ (لا صورة مدفوعة) تُردّ كما كانت */
        if (err.status === 422) await keepGuardCharge('studio', quota, consumeStudio);
        res.status(err.status).json(err.payload);
        return;
      }
      throw err;
    }
  } catch (e) {
    console.error('[studio-create] exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'image_generation_failed' }); /* v-audit-studeng: رمز يترجمه imgErrFriendly */
  }
};
module.exports.STYLE_TEXT = STYLE_TEXT;
module.exports.FEATURE_INSTRUCTIONS = FEATURE_INSTRUCTIONS;
module.exports.buildSinglePrompt = buildSinglePrompt; /* v-studio-variety: للاختبار */
module.exports.styleTextOf = styleTextOf; /* v-style-match: للاختبار */
module.exports.DESIGN_FEATURES = DESIGN_FEATURES;
module.exports.__geminiImage = geminiImage; /* v-fal-backup: للاختبار */
module.exports.celeb = celeb; /* v-celeb-style: للاختبار */
