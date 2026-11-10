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
    const second = await openaiStudioEdit(promptText + (g.reason === 'no_change' ? NO_CHANGE_RETRY : strongerLockFor(feature)), images);
    if (!second) return { rejected: g };
    const g2 = await judge(second, 'image/png');
    return passed(g2) ? second : { rejected: g2 };
  } catch (e) { return first; /* الحارس لا يرمي؛ عطب غير متوقّع لا يُسقط صورة مدفوعة (v-guard-fail-open) */ }
}
const { verifyLocalizedImageEdit, publicGuardError, extractJsonObject } = require('./image-edit-guard'); /* v-body-card-match: extractJsonObject لجواب فحص الجنس */
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
/* v-studio-age (لقطة المالك ٩ نوفمبر: «مافي تغير الشكل في الاعمار» — النتيجة نسخة الأصل): EDIT_LOCK يقول بأعلى أولويّة
   «Keep the exact same person and face (identity, features, skin…) pixel-for-pixel… Do not regenerate anything else»، والعمر هو الوجه والجلد
   والشعر نفسها — فيطيع الموديل القفل ولا يغيّر شيئًا. وSTRONGER_LOCK («طبقة رقيقة فوق البكسل الأصليّ») يمحو العمر في المحاولة الثانية.
   للعمر قفله: ملامح الشخص (هويّته) تبقى، والوجه والجلد والشعر هي التعديل. */
const AGE_LOCK =
  '\nAGE EDIT LOCK (highest priority): the face, skin and hair ARE the edit — age or de-age them clearly and believably (skin texture, wrinkles or smoothness, facial fullness and structure, hair colour and density). ' +
  'Keep this exact person recognizable as themselves at that age: the same eye shape and colour, eyebrows, nose, lips, skin tone and overall face proportions, ' +
  'and the same head position, gaze direction, body pose, hands, clothing, camera angle, framing, crop, lighting and background. ' +
  'If the person wears a head covering, keep it exactly as it is. Change nothing else, and never return the photo unchanged.';
const AGE_RETRY = '\nSECOND ATTEMPT — the previous result did not look like the same person. Keep their own eye shape, eyebrows, nose, lips, skin tone and face proportions so they are instantly recognizable, and still show the requested age clearly — do not undo the age change.';
function strongerLockFor(feature) { return feature === 'age' ? AGE_RETRY : STRONGER_LOCK; }
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
  if (feature !== 'anime') promptText += '\n' + sourceStylePreservationRule() + (feature === 'age' ? AGE_LOCK : EDIT_LOCK(lockWhatOf(feature, baseDesc)));
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
    const retryNote = guard.reason === 'no_change' ? NO_CHANGE_RETRY : strongerLockFor(o.feature);
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

/* ───── v-merge-face-lock (لقطة المالك ٧ نوفمبر: صورتان لرجلين ونتيجة الدمج في مجلس — «شوف الملامح فرق بين السماء والارض»، ثمّ
   «ابدأ الاثنين»): (١) الإطار — كان الدمج بنسبة الصورة الأولى (طوليّة) بلا ذكر للقطة، فرسم برو الشخصين بالجسم كاملًا في مشهد واسع
   والوجه صغير يُعاد رسمه من عنده. الآن لقطة من الخصر وفوق بوجوه كبيرة ما لم يطلب المستخدم غيرها، و٤:٣ ما لم يسمِّ نسبة.
   (٢) قفل الوجه — بعد الدمج يُبدَّل وجه كلّ شخص من صورته (face-swap.lockFaces: نفس أداة الترندات، ~٥ سنتات للوجه، سقف
   FACE_SWAP_CAP_CENTS اليوميّ المشترك). MERGE_FACE_SWAP = on (الافتراضيّ، بموافقة المالك على الكلفة) · owner · off. أيّ عطب أو
   لبس = صورة الدمج نفسها بلا تغيير، والطلب لا يفشل بسببه. ───── */
const MERGE_ASPECT = '4:3';
/* v-merge-face-angle (المالك بعد التجربة: «الصورة الحقيقية غيّرت الملامح» — صورته أماميّة والناتج أداره برو ثلاثة أرباع نحو الآخر،
   ولحيته الكثيفة صارت مشذّبة): زاوية الرأس والنظرة والتعبير وكثافة اللحية وطولها كما في صورة كلّ شخص — نفس قاعدة إطار الترندات
   (frameTask: «each head angle, gaze and expression stay as in their own photo»)؛ والتبديل بعده يضيع مع الوجه المدار، واللحية تحت
   بيضاويّ اللصق من رسم برو. */
const MERGE_FRAMING = '\nFraming: when the photos show people, frame them from the waist up (a medium shot) unless the task above asks for a full-body or wide view; keep any scene the task describes around them, but never shrink the people so far that their faces become small — every face stays large, sharp and clearly visible with its own features.'
  + ' Unless the task above asks for a different pose, each person keeps the head angle, gaze and expression of their own photo (facing the camera when their photo does — never turned to the side toward the other person), and keeps the exact beard or facial hair of their photo: the same fullness, length, density and outline, never trimmed, thinned or restyled.';
/* بوّابة الإنفاق: غير مضبوط/on = الجميع (موافقة المالك)، owner = المالك، وأيّ قيمة أخرى (off، false، 0…) = مطفأ.
   gate: اسم المتغيّر (MERGE_FACE_SWAP للدمج، BODY_FACE_SWAP لجسم الصورة المقرّبة — v-body-reframe) */
function mergeSwapOn(username, gate) {
  const m = String(process.env[gate || 'MERGE_FACE_SWAP'] || 'on').trim().toLowerCase();
  if (m === 'on') return true;
  if (m === 'owner') return require('./_owner.js').isOwnerName(username);
  return false;
}
/* المراجعة: المستخدم طلب في وصفه شكلًا جديدًا (لحية، عمر، نظّارة، مكياج، غطاء وجه، أسلوب فنّيّ) = لا قفل — القفل يعيد الوجه كما صُوّر فيمحو ما طلبه */
const MERGE_NEW_LOOK_RE = /لحي[ةه]|بلحي|ذقن|شنب|شوارب|سكسوك|نظار|عوينات|شيّاب|شياب|شيبان|عجوز|عجايز|كبار\s*(?:في|بال)\s*(?:العمر|السن)|(?:أكبر|اكبر|أصغر|اصغر)\s*(?:سن|بالعمر|في\s*العمر)|صغار|أطفال|اطفال|مكياج|ميك\s*اب|وشم|تاتو|حليق|أصلع|اصلع|صلع|صبغ|حجاب|نقاب|برقع|لثام|قناع|\b(?:beard(?:ed)?|moustache|mustache|goatee|glasses|sunglasses|spectacles|older|younger|aged|elderly|kids?|child(?:ren)?|makeup|make-up|tattoo|bald|shaved|dyed|hijab|niqab|burqa|veil|mask)\b/i;
function mergeWantsNewLook(text) {
  const s = String(text || '');
  if (!s.trim()) return false;
  try { if (require('./image-intent.js').detectEditIntent(s).restyle) return true; } catch (e) { typeof require === 'function' && require('./_swallow.js').swallow(e, '_lib/studio-create:343'); /* guard-ok — بلا كاشف الأسلوب: الكلمات أدناه تكفي */ }
  return MERGE_NEW_LOOK_RE.test(s);
}
/* m: { photos, crops (faceCrops)، counts (عدد الأشخاص الرئيسيّين لكلّ صورة)، userTask، apiKey، username، t0 }.
   المراجعة: صورة فيها شخص واحد بالضبط تُقفل (بلقطة وجهها إن وُجدت، وإلّا الصورة كاملة)؛ صورة فيها اثنان فأكثر تبقى مرجعًا يُتجنَّب
   (خارج only) كي لا يُلصق وجه أحدهما على الآخر؛ تعذّر العدّ أو لا وجه = لا قفل لها، ولا شيء يُقفل = لا نداء أصلًا. */
async function lockMergeFaces(frame, m) {
  if (!mergeSwapOn(m.username, m.gate)) return frame;
  if (mergeWantsNewLook(m.userTask)) { console.warn('[studio-create] merge face-lock skipped: new-look'); return frame; }
  const only = m.photos.map((_, k) => k).filter((k) => m.counts[k] === 1);
  if (!only.length) { console.warn('[studio-create] merge face-lock skipped: no single-person photo'); return frame; }
  const refs = m.photos.map((p, k) => {
    const own = (m.crops || []).filter((c) => c.of === k);
    return (m.counts[k] === 1 && own.length === 1) ? { data: own[0].data, mime: own[0].mime, face: true } : { data: p.data, mime: p.mime };
  });
  try {
    const r = await require('./face-swap.js').lockFaces(frame, refs, { apiKey: m.apiKey, enabled: true, only, until: m.t0 + 280000, faceOnly: !!m.faceOnly, beard: m.beard });
    if (r && r.swapped > 0 && r.b64) return { b64: r.b64, mime: r.mime || 'image/jpeg' };
    console.warn('[studio-create] merge face-lock skipped: ' + String((r && r.reason) || 'none').slice(0, 60));
  } catch (e) { console.warn('[studio-create] merge face-lock ' + (e && e.message)); } /* lockFaces لا يرمي — حارس احتياطيّ */
  return frame;
}

/* ───── v-body-reframe (لقطة المالك ٧ نوفمبر: صورة وجه وكتفين بكندورة + «ملاكم — قوي» ← الصورة نفسها تقريبًا: «شوف شو طالب وشو عطاني»،
   ثمّ اختار «يرسم جسمي كامل»): ميزة الجسم تعدّل الصورة نفسها بقفل الإطار (EDIT_LOCK)، وفي صورة الوجه لا جسم يتغيّر، والبطاقة جسم كامل.
   الآن: صورة فيها شخص واحد مقرّب (أكبر وجه أطول من BODY_CLOSEUP من ارتفاع الصورة، ولا وجه رئيسيّ غيره) = صورة كاملة من الرأس إلى
   القدمين بالبنية المختارة (وصف الخيار نفسه) في لبس رياضيّ ساتر يناسب صاحب الصورة، بأجزاء هويّة خاصّة (الوجه ولون البشرة وشعر الوجه
   وغطاء الرأس كما هي؛ اللبس والبنية وحدهما جديدان)، ثمّ قفل الوجه من صورته (lockMergeFaces، بوّابة BODY_FACE_SWAP). بلا قفل بكسل
   ولا حارس موضعيّ — الإطار جديد؛ وإن لم يُقفل الوجه ففحص هويّة مقابل الصورة قبل الخصم. تعذّر الكشف أو أكثر من شخص = المسار القديم.
   BODY_REFRAME=off يعيد السلوك القديم كلّه.
   المراجعة العدائيّة (٧ عيوب مؤكّدة، مصلحة): تأطير البطاقة كان يُرسل بلبسها وغطاء رأسها (حجاب رياضيّ للرجل، قبعة سباحة للمحجّبة) ← لا لبس
   ولا غطاء رأس من البطاقة؛ قالب الدمج يأمر بإبقاء اللبس فيناقض المهمّة ← أجزاء خاصّة؛ القفل الصامت كان يُخصم بلا فحص هويّة ← فحص؛ صورة
   شخصين مقرّبة ← المسار القديم؛ كشف مرّتين ← مرّة؛ رفض برو ← إنقاذ؛ وبوّابة إنفاق خاصّة. ───── */
const BODY_CLOSEUP = 0.22;
function bodyReframeOn() { return String(process.env.BODY_REFRAME || 'on').trim().toLowerCase() === 'on'; }
/* ← { faces, crop } حين تصلح الصورة لإعادة التأطير (شخص رئيسيّ واحد ووجهه مقرّب)، وإلّا null (المسار القديم).
   v-body-upright: الكشف نفسه يعيد مركزي العينين والفم، وcrop لقطة وجهه المستقيمة (uprightCrop) أيًّا كان ميله وحجمه في الصورة — مرجع الرسم
   والقفل وفحص الجنس وفحص البطاقة؛ تعذّرت = null وfaceCrops كما كان */
async function bodyCloseUp(apiKey, b64) {
  try {
    const img = mergeIdentity.decodeWork(b64);
    if (!img) return null;
    const faces = await mergeIdentity.detectFaces(apiKey, img, { points: true });
    const biggest = Math.max(0, ...faces.map((f) => f.box[3] - f.box[1]));
    const main = faces.filter((f) => f.box[3] - f.box[1] >= biggest * 0.5);
    if (!(biggest > BODY_CLOSEUP && main.length === 1)) return null;
    let crop = null;
    /* المراجعة: MERGE_FACE_CROPS=off يوقف هذه اللقطة أيضًا (كانت تتخطّاه) — فيعود faceCrops ويرجع [] كما كان */
    if (mergeIdentity.cropsOn()) {
      try {
        const u = mergeIdentity.uprightCrop(img, main[0]);
        if (u) crop = { of: 0, who: 'the person', size: main[0].box[3] - main[0].box[1], data: u.data, mime: u.mime, upright: true, roll: u.roll };
      } catch (e) { console.warn('[studio-create] body upright crop ' + (e && e.message)); } /* اللقطة تعذّرت = faceCrops كما كان */
    }
    /* v-body-hair-keep: «الشعر مغطّى؟» من الكشف نفسه (قائمة صريحة فيها الغترة والطاقيّة) — true/false أو null إن لم يُجب */
    return { faces, crop, covered: typeof main[0].covered === 'boolean' ? main[0].covered : null, beard: typeof main[0].beard === 'boolean' ? main[0].beard : null }; /* v-body-beard */
  } catch (e) { console.warn('[studio-create] body close-up check ' + (e && e.message)); return null; } /* الكشف تعذّر = المسار القديم */
}
/* v-body-sport (المالك بعد التجربة، صورته بقميص رماديّ فضفاض طويل الأكمام وغترة: «كأنه صياد رايح البحر… في الجسم واللياقة مش صيد بحر
   شوف الملابس كيف»، ثمّ «مش ضروري كاب، عادي بدون أي شي فوق راسه»): اللبس رياضيّ كبطاقات الميزة (قميص رياضيّ قصير الأكمام يُظهر البنية
   وشورت للركبة أو بنطال رياضيّ)، والرجل بلا غترة ولا عقال ولا طاقيّة — رأس مكشوف بشعر قصير مرتّب؛ المرأة بحجابها حجابًا رياضيًّا، ولا يُضاف
   غطاء رأس لمن لا يلبسه؛ والخلفيّة خلفيّة البطاقات (بنّيّة دافئة بضوء ذهبيّ). */
/* v-body-eyes-colors (المالك بعد v-body-bare-head: «مشكّر العيون، وثاني شي الملابس خلها في كل مرّه الوان مختلفه»): الابتسامة العريضة في
   صورته تضيّق العينين، وتعبير الصورة كان يُنسخ كما هو — الآن عينان مفتوحتان تنظران إلى الكاميرا بابتسامة هادئة (وفي أمر قفل الوجه أيضًا)؛
   واللبس كان رماديًّا وأسود في كلّ مرّة — ألوانه الآن من BODY_COLORWAYS برقم الشكل نفسه الذي يرسله العميل في كلّ ضغطة (variant). */
const BODY_COLORWAYS = [
  ['navy blue', 'black'], ['heather grey', 'charcoal'], ['olive green', 'black'], ['white', 'navy blue'], ['burgundy', 'dark grey'],
  ['royal blue', 'black'], ['sand beige', 'olive green'], ['teal', 'charcoal'], ['black', 'grey'], ['light blue', 'navy blue'],
  ['forest green', 'khaki'], ['mustard yellow', 'black'], ['slate blue', 'grey'], ['deep red', 'black'], ['white', 'black'], ['coral', 'navy blue'],
];
function bodyColorway(variant) {
  const n = Number.isFinite(variant) ? Math.abs(Math.floor(variant)) : Math.floor(Math.random() * BODY_COLORWAYS.length);
  return BODY_COLORWAYS[n % BODY_COLORWAYS.length];
}
/* v-body-upright (لقطة المالك: بنت شعرها مكشوف بغرّة وكعكة ← غطاء رأس أسود ورقبة سوداء لم تلبسهما): سطر الرأس العامّ يذكر «حجابًا رياضيًّا»
   والموديل أضافه؛ فحص الصورة (photoLook) قال «شعر مكشوف» = سطر صريح: شعرها كما في الصورة ولا شيء على الرأس أو الرقبة. الرجل كما كان.
   وفي السطر العامّ (الفحص لم يحسم): الشعر المكشوف يبقى مكشوفًا بتسريحته، لا قلنسوة ولا لثام ولا غطاء رقبة.
   المراجعة: السطر الصريح لا يأمر بنزع شيء أبدًا — «مكشوف» جواب Flash قد يخطئ (شيلة رخوة تُظهر الغرّة)، فكان «no hijab, headscarf» ينزع غطاءها؛
   الآن: لا يُضاف ما لا تُظهره الصورة، وما تُظهره على الرأس يبقى كما هو.
   v-body-hair-keep (المالك بعد v-body-upright، الصورة نفسها و«وضعيّة»: حجاب أسود كامل لم تلبسه، والوجه ليس وجهها — «ولا تحسين»): فحص الجنس
   (photoLook) لم يُجب عن صورتها مرّتين (`photo ?[no answer]`) فبقي السطر العامّ، و«A woman's hijab or headscarf stays… sports hijab» قرأه الموديل
   «المرأة بحجاب». الآن «الشعر مغطّى؟» من الكشف أوّلًا (look.covered يُملأ منه في bodyReframe)، والسطر العامّ يقول «حجاب تُظهره Photo 1» لا «حجاب المرأة». */
function bodyHeadLine(look) {
  const l = look || {};
  if (l.covered === false && l.g !== 'm') return 'Head: the hair is uncovered in Photo 1 — keep their own hair exactly as in Photo 1 (the same hairstyle, fringe, length and colour), fully visible, and add nothing on the head or around the neck that Photo 1 does not show: no hood, cap, balaclava or neck gaiter. A hijab, headscarf or shayla that Photo 1 does show stays exactly as worn.';
  return 'Head: a man\'s ghutra, shemagh, agal, kufi or cap is removed — his head is bare, with short neat hair whose colour matches his beard and age, and nothing on his head. A hijab or headscarf that Photo 1 shows stays, fully covering, worn as a fitted sports hijab. Never add a head covering to anyone who wears none — uncovered hair stays uncovered, in its own hairstyle, never under a hood, balaclava or neck gaiter.';
}
function bodyReframeTask(style, description, variant, look) {
  const cw = bodyColorway(variant);
  return 'Photo 1 shows the user as a close-up. Create a new full-body standing photo of this same person, the whole figure visible from the top of the head down to the feet, standing naturally and facing the camera, with ' + styleTextOf('body', style) + '.\n' +
    'Keep from Photo 1, exactly and with full fidelity: their face and every facial feature, skin tone, ' + (look && look.beard === false ? '' : 'facial hair ') + 'and apparent age. Copy the face from the close-up when one is given. Expression: both eyes fully open, clear and looking straight at the camera — never closed, squinting or half-closed — with a natural, relaxed smile.\n' +
    'New in this photo, and only these: the body build described above, the sportswear and the head. Dress them like a fitness reference photo: a man wears a fitted short-sleeved athletic t-shirt that clearly shows the build, knee-length athletic shorts or slim athletic joggers, and sneakers; a woman wears a modest fitted long-sleeved athletic top with a hip-length tunic over full-length leggings, and sneakers. Never a bare chest or midriff, never swimwear, never loose everyday clothes that hide the build. ' +
    'Sportswear colours for this photo: a ' + cw[0] + ' top with ' + cw[1] + ' shorts, joggers or leggings, and sneakers that go with them.\n' +
    bodyHeadLine(look) + '\n' +
    'Dark warm brown studio backdrop with soft golden light, sharp focus on the face. No text, logos or watermarks. Output a single photorealistic image.' +
    (description ? '\nExtra request: ' + String(description).slice(0, 200) : '');
}
/* أجزاء Gemini: الصورة بعنوانها، ثمّ اللقطة المقرّبة (إن وُجدت) بعنوانها، ثمّ (في وضع البطاقة) بطاقة الخيار، ثمّ الأمر — لا قالب الدمج (يأمر بإبقاء اللبس) */
function bodyReframeParts(photo, crops, task, card) {
  const parts = [{ text: card ? 'Photo 1 of 2 — the user (identity reference):' : 'Photo 1 of 1:' }, { inlineData: { mimeType: photo.mime || 'image/jpeg', data: photo.data } }];
  (crops || []).forEach((c, k) => parts.push({ text: 'Close-up ' + (k + 1) + ' — the face of the person in Photo 1 (the same person, zoomed in' + (c.roll ? ' and turned upright' : '') + '; identity reference only, not an extra person):' }, { inlineData: { mimeType: c.mime, data: c.data } }));
  if (card) parts.push({ text: 'Photo 2 of 2 — the chosen look (the option card the user picked: an example photo of a different, generic model — never the user, and never a second person in the result):' }, { inlineData: { mimeType: card.mime, data: card.data } });
  parts.push({ text: task });
  return parts;
}

/* ───── v-body-card-match (المالك بعد v-body-eyes-colors، صورته بقميص زيتيّ وشورت لخيار «راكب أمواج — قوي»: «الصور ماتتطابق الشكل الي
   اطلبه، هذي ١٠ صور في التعديلات، عدّل مرّة وحدة»): الوصف النصّيّ لأغلب خيارات الجسم عامّ («a strongly surfer's build, realistic and natural»)،
   والبطاقة التي اختارها رسمها برو من هذا الوصف نفسه بلا قيد هويّة — فكلّ الخيارات تعطيه البنية «الواقعيّة» نفسها. الآن البطاقة نفسها (المخزّنة،
   لا توليد جديد) ترافق صورته مرجعًا للبنية والوقفة وقطع اللبس والإطار والخلفيّة والأدوات، وصورته مرجع الوجه ولون البشرة واللحية والعمر —
   حين يطابق جنسه جنس نموذج البطاقة (فحص Flash صغير، ومعه: هل شعره مغطّى). ألوان اللبس تبقى تتغيّر كلّ ضغطة، وقواعد الرأس والعينين
   والحشمة كما هي. بلا بطاقة مخزّنة، أو بجنس مختلف، أو غير واضح، أو تعذّر الفحص = الوصف النصّيّ كما كان.
   المراجعة العدائيّة (٩ مؤكّدة، مصلحة): غطاء رأس البطاقة (حجاب رياضيّ، قبّعة سباحة ونظّارتها، واقيات أذن) لا يُنقل أبدًا، وبطاقة الحجاب لا
   تُستعمل لامرأة شعرها مكشوف (لا يُضاف حجاب)؛ لبس السباحة وركوب الأمواج يُبدَّل لبسًا رياضيًّا بالقصّة نفسها؛ الحذاء (أو الحفاء) والإطار كالبطاقة
   لا «حذاء رياضيّ من الرأس إلى القدمين» ثابتًا؛ بطاقات الجانب (profile) تبقى بالوصف النصّيّ (الوجه للكاميرا)؛ فحص بعد الرسم (شخص واحد، الوجه
   نفسه، لون جلد الجسم كالوجه) يعيد الرسم بالوصف النصّيّ مرّة إن رُفض والوقت يسمح؛ الإنقاذ بالوصف النصّيّ وصوره؛ وفحص الجنس بعد وجود بطاقة. ───── */
const LOOK_SCHEMA = { type: 'OBJECT', properties: { gender: { type: 'STRING', enum: ['man', 'woman', 'unknown'] }, covered: { type: 'BOOLEAN' } }, required: ['gender', 'covered'] };
/* الشخص الرئيسيّ في الصورة ← { g: 'm' | 'w' | '' (تعذّر/غير واضح), covered: true | false | null (شعره مغطّى بحجاب/طرحة), why (سبب «؟» للسجلّ) }.
   v-body-upright: ومعها لقطة وجهه المستقيمة إن وُجدت (صورة مائلة جانبًا كانت تعطي «؟») */
async function photoLook(apiKey, b64, mime, crop) {
  const none = (why) => ({ g: '', covered: null, why });
  try {
    const parts = [{ inlineData: { mimeType: mime || 'image/jpeg', data: b64 } }];
    if (crop) parts.push({ inlineData: { mimeType: crop.mime, data: crop.data } });
    parts.push({ text: 'Look at the main person in this photo' + (crop ? ' (the second image is a close-up of that same person\'s face, turned upright)' : '') + '. Is it a man or a woman, and is their hair covered by a hijab, headscarf or veil? Reply with JSON only: {"gender":"man"|"woman"|"unknown","covered":true|false}.' });
    const r = await fetch(mergeIdentity.DETECT_URL + apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: 'application/json', responseSchema: LOOK_SCHEMA, thinkingConfig: { thinkingBudget: 0 } }, /* v-flash-nothink */
      }),
    });
    if (!r.ok) return none('http ' + r.status);
    const d = await r.json().catch(() => null);
    const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join(' '));
    const j = extractJsonObject(txt) || {};
    const g = String(j.gender || '');
    return { g: g === 'man' ? 'm' : (g === 'woman' ? 'w' : ''), covered: typeof j.covered === 'boolean' ? j.covered : null, why: g === 'man' || g === 'woman' ? '' : (g || 'no answer') };
  } catch (e) { console.warn('[studio-create] body look check ' + (e && e.message)); return none('error'); } /* تعذّر = الوصف النصّيّ */
}
/* جنس نموذج البطاقة كما رسمها studio-preview نفسه */
function bodyCardGender(style) {
  const fk = 'body:' + style;
  const CARD = require('./studio-card-fix.js');
  const subj = (__MORE.PREVIEW_SUBJECT && __MORE.PREVIEW_SUBJECT.body) || {};
  return (Object.prototype.hasOwnProperty.call(CARD.SUBJECT, fk) && CARD.SUBJECT[fk]) || subj[style] || subj.__tab || 'w';
}
/* ما في البطاقة ممّا لا يُنقل أو يُبدَّل — من تأطيرها نفسه (FRAME) الذي رُسمت به */
function bodyCardTraits(style) {
  const f = String((require('./studio-card-fix.js').FRAME || {})['body:' + style] || '');
  return {
    hijab: /hijab|headscarf/i.test(f),
    headgear: /swim cap|goggles|ear guards?|helmet|headband/i.test(f),
    swimwear: /swim shirt|swim shorts|rash guard|board shorts|swimsuit|wetsuit/i.test(f),
    profile: /side-profile|in profile|profile view/i.test(f),
  };
}
/* البطاقة المخزّنة (مفتاح studio-preview نفسه: المراجعة الحاليّة ثمّ الأقدم) ← { data, mime } أو null — لا توليد بطاقة هنا أبدًا */
async function bodyCardRef(style) {
  const fk = 'body:' + style;
  const CARD = require('./studio-card-fix.js');
  const rev = Object.prototype.hasOwnProperty.call(CARD.REV, fk) ? Number(CARD.REV[fk]) || 0 : 0;
  const base = 'studio:preview:v2:body:' + style;
  try {
    const kv = require('./kv.js');
    for (let i = rev; i >= 0; i--) {
      const b64 = await kv.kvGetRaw(i ? base + ':r' + i : base);
      if (b64) return { data: String(b64), mime: 'image/webp' };
    }
  } catch (e) { console.warn('[studio-create] body card read ' + (e && e.message)); } /* تعذّرت القراءة = الوصف النصّيّ */
  return null;
}
function bodyCardTask(style, description, variant, traits, look) {
  const cw = bodyColorway(variant);
  const t = traits || {};
  return 'Create ONE new photorealistic photo of the user from Photo 1 that recreates the chosen look in Photo 2: the same body build, muscularity and proportions, the same pose and stance, the same camera angle, framing, lighting, backdrop and props, and the same top and bottoms (pieces and cut) as Photo 2. The chosen look is ' + styleTextOf('body', style) + '. Exactly one person in the result.\n' +
    'Photo 2 is a reference for the body, pose, framing, setting and clothes only: the model\'s face, skin tone and hair, and anything on or around the model\'s head (a sports hijab, swim cap, goggles, ear guards or headband), are not part of the look — ignore them.\n' +
    'From Photo 1, exactly and with full fidelity: the face and every facial feature, the skin tone (on the face and on all visible skin — neck, arms, hands and legs), ' + (look && look.beard === false ? '' : 'facial hair and ') + 'apparent age. Copy the face from the close-up when one is given. Expression: both eyes fully open, clear and looking at the camera — never closed, squinting or half-closed — with a natural, relaxed smile.\n' +
    'Clothes: the same pieces as Photo 2 recoloured — a ' + cw[0] + ' top with ' + cw[1] + ' bottoms; footwear (or bare feet) exactly as in Photo 2.' +
    (t.swimwear ? ' Photo 2 shows swimwear: dress the user instead in a fitted athletic t-shirt with the same sleeves and knee-length athletic shorts of the same cut — never swimwear.' : '') +
    ' Never a bare chest or midriff.\n' +
    'Head: a man\'s ghutra, shemagh, agal, kufi or cap from Photo 1 is removed — his head is bare, with short neat hair whose colour matches his beard and age, and nothing on his head' +
    (t.headgear ? ' (no swim cap, goggles, ear guards or other headgear, even though Photo 2 shows them)' : '') +
    '. A woman\'s hijab or headscarf from Photo 1 stays, fully covering, worn as a fitted sports hijab; a woman whose hair is uncovered in Photo 1 keeps her own hair, uncovered. Never add a head covering to anyone who wears none.\n' +
    'No text, logos or watermarks. Output a single photorealistic image.' +
    (description ? '\nExtra request: ' + String(description).slice(0, 200) : '');
}
/* فحص ما بعد الرسم بالبطاقة (Flash): شخص واحد، الوجه نفسه، جلد الجسم كالوجه — false عند رفض صريح وحده (الشكّ أو العطل = قبول) */
const CARD_CHECK_SCHEMA = { type: 'OBJECT', properties: { onePerson: { type: 'BOOLEAN' }, samePerson: { type: 'BOOLEAN' }, skinMatches: { type: 'BOOLEAN' } }, required: ['onePerson', 'samePerson', 'skinMatches'] };
async function bodyCardCheck(apiKey, photo, result) {
  try {
    const r = await fetch(mergeIdentity.DETECT_URL + apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        contents: [{ parts: [
          { text: 'Image A — a photo of a real person:' }, { inlineData: { mimeType: photo.mime || 'image/jpeg', data: photo.data } },
          { text: 'Image B — a generated full-body photo that should show that same person with a new body build, clothes and setting (their headwear may have been removed on purpose):' }, { inlineData: { mimeType: result.mime || 'image/jpeg', data: result.b64 } },
          { text: 'Reply with JSON only: {"onePerson": exactly one person is visible in Image B, "samePerson": the face in Image B is the same person as in Image A, "skinMatches": the skin on the neck, arms and legs in Image B matches the skin tone of the face in Image B}. When unsure, answer true.' },
        ] }],
        generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: 'application/json', responseSchema: CARD_CHECK_SCHEMA, thinkingConfig: { thinkingBudget: 0 } }, /* v-flash-nothink */
      }),
    });
    if (!r.ok) return true;
    const d = await r.json().catch(() => null);
    const j = extractJsonObject(String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join(' '))) || {};
    return !(j.onePerson === false || j.samePerson === false || j.skinMatches === false);
  } catch (e) { console.warn('[studio-create] body card check ' + (e && e.message)); return true; } /* الفحص تعذّر = لا يُسقط صورة جاهزة */
}
const CARD_REDO_MS = 120000; /* إعادة الرسم بالوصف النصّيّ مرّة إن رُفض الناتج قبل هذه المدّة من بدء الطلب (مهلة الدالّة ٣٠٠ ث) */

/* { apiKey, imageBase64, mimeType, style, description, variant, faces, crop (v-body-upright)، username, t0 } ← { b64, mime, engine?, swapped, card } أو { error, status } */
async function bodyReframe(o) {
  const photos = [{ data: o.imageBase64, mime: o.mimeType || 'image/jpeg' }];
  /* الكشف نفسه (بلا نداء ثانٍ) — وبالتوازي البطاقة المخزّنة، وفحص صاحب الصورة بعدها وحدها (لا نداء بلا بطاقة).
     v-body-upright: لقطة الوجه المستقيمة (o.crop) هي لقطة الرسم ومرجع القفل؛ بلاها faceCrops كما كان (لا لقطة لوجه يملأ الصورة) */
  const [crops, cl] = await Promise.all([
    o.crop ? Promise.resolve([o.crop]) : mergeIdentity.faceCrops(o.apiKey, photos, { faces: [o.faces] }),
    bodyCardRef(o.style).then(async (c) => (c ? { card: c, look: await photoLook(o.apiKey, o.imageBase64, o.mimeType, o.crop) } : { card: null, look: { g: '', covered: null } })),
  ]);
  const card = cl.card;
  /* v-body-hair-keep: «الشعر مغطّى؟» من الكشف (o.covered — قائمته صريحة: حجاب، شيلة، غترة، طاقيّة) أوّلًا، ثمّ من فحص الجنس؛ فحص الجنس
     لا يجيب عن بعض الصور (صورة المالك: `photo ?[no answer]` مرّتين) فكان السطر العامّ يُضيف حجابًا */
  const hair = typeof o.covered === 'boolean' ? o.covered : null;
  /* v-body-beard: «لحية؟» من الكشف وحده (فحص الجنس لا يسألها) — false = لا «facial hair» في أمر الرسم ولا في أمر القفل (كان يضع لحية على وجه امرأة) */
  const beard = typeof o.beard === 'boolean' ? o.beard : null;
  const look = Object.assign({}, cl.look, { covered: hair !== null ? hair : cl.look.covered, beard });
  const traits = bodyCardTraits(o.style);
  const cardG = bodyCardGender(o.style);
  const useCard = !!(card && look.g && look.g === cardG && !traits.profile && (!traits.hijab || look.covered === true));
  const face = crops[0] ? (crops[0].upright ? 'face upright ' + crops[0].roll + '°' : 'face crop') : 'no face crop';
  console.log('[studio-create] body reframe ' + o.style + ': ' + (useCard ? 'card' : 'text') + ' (card ' + (card ? 'cached' : 'missing') + ', photo ' + (cl.look.g || '?' + (cl.look.why ? '[' + cl.look.why + ']' : '')) + (cl.look.covered ? ' covered' : (cl.look.covered === false ? ' uncovered' : '')) + ', hair ' + (hair === true ? 'covered' : (hair === false ? 'uncovered' : '?')) + ', beard ' + (beard === true ? 'yes' : (beard === false ? 'no' : '?')) + ', card model ' + cardG + (traits.profile ? ', profile' : '') + (traits.hijab ? ', hijab card' : '') + ', ' + face + ')');
  const textTask = bodyReframeTask(o.style, o.description, o.variant, look);
  const textParts = () => bodyReframeParts(photos[0], crops, textTask);
  /* v-body-bare-head: الوجه وحده (faceOnly) — الغترة أُزيلت عمدًا فلا يُنقل الرأس بغطائه. v-body-hair-keep: شعر مكشوف بشهادة الكشف = الرأس كلّه
     بشعره من صورته (أمر الـLoRA الرسميّ ولصق القصّة كلّها كالترندات v-trend-hair-lock) — غرّتها وتسريحتها جزء من شكلها؛ مغطّى أو غير معروف = الوجه وحده */
  const lockOf = (img) => lockMergeFaces({ b64: img.b64, mime: img.mime }, { photos, crops, counts: [1], userTask: '', apiKey: o.apiKey, username: o.username, t0: o.t0, gate: 'BODY_FACE_SWAP', faceOnly: hair !== false, beard });
  let out = await geminiImage(o.apiKey, useCard ? bodyReframeParts(photos[0], crops, bodyCardTask(o.style, o.description, o.variant, traits, look), card) : textParts(), 'body', '2:3');
  let engine;
  let fromCard = useCard;
  if (!out.b64) {
    /* رفض برو أو عطبه (لا نفاد الرصيد): الإنقاذ نفسه كالدمج — 'merge' يتخطّى حارس التعديل الموضعيّ (الإطار جديد)؛ بالوصف النصّيّ وصوره
       (أمر البطاقة يسمّي «Photo 2» وترتيب صور الإنقاذ غير ترتيبه) */
    const rescue = out.status === 503 ? null : await rescueGuarded(textTask, photos.concat(crops).map((p) => [p.data, p.mime]), o.apiKey, 'merge');
    if (!rescue || rescue.rejected) return { error: out.error || 'image_generation_failed', status: out.status || 502 };
    out = { b64: rescue, mime: 'image/png' };
    engine = 'openai';
    fromCard = false;
  }
  let locked = await lockOf(out);
  /* v-body-upright: الفحص يقارن بوجهه المستقيم إن وُجد (الصورة المائلة جانبًا تُربك «الشخص نفسه») */
  if (fromCard && !(await bodyCardCheck(o.apiKey, o.crop ? { data: o.crop.data, mime: o.crop.mime } : photos[0], locked))) {
    /* الناتج حمل من نموذج البطاقة (شخص ثانٍ، وجه آخر، جلد بلون آخر): مرّة بالوصف النصّيّ إن سمح الوقت، وإلّا رفض بلا خصم */
    const late = Date.now() - o.t0 >= CARD_REDO_MS;
    console.warn('[studio-create] body card result rejected — ' + (late ? 'no time to redo' : 'redo with the text task'));
    if (late) return { error: 'image_edit_identity_mismatch', status: 422 };
    out = await geminiImage(o.apiKey, textParts(), 'body', '2:3');
    if (!out.b64) return { error: out.error || 'image_generation_failed', status: out.status || 502 };
    locked = await lockOf(out);
    fromCard = false;
  }
  return { b64: locked.b64, mime: locked.mime, engine, swapped: locked.b64 !== out.b64, card: fromCard };
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
      const tMerge = Date.now(); /* v-merge-face-lock: مهلة قفل الوجه من بداية الدمج */
      const userTask = description ? String(description).slice(0, 300) : '';
      const task = (userTask || 'Place the people/subjects from both photos together naturally in one consistent, photorealistic scene.') + MERGE_FRAMING;
      const photos = [{ data: imageBase64, mime: mimeType || 'image/jpeg' }, { data: imageBase64B, mime: mimeTypeB || 'image/jpeg' }];
      const counts = []; /* v-merge-face-lock: عدد الأشخاص في كلّ صورة من كشف faceCrops نفسه (بلا نداء زائد) */
      const crops = await mergeIdentity.faceCrops(apiKey, photos, { perPhoto: counts });
      const parts = mergeIdentity.mergeParts(photos, crops, task);
      const promptText = parts[parts.length - 1].text;
      const out = await geminiImage(apiKey, parts, 'merge', mergeIdentity.explicitAspect(userTask) || MERGE_ASPECT);
      const lockOpts = { photos, crops, counts, userTask, apiKey, username: quota.username, t0: tMerge };
      if (out.b64) {
        const locked = await lockMergeFaces({ b64: out.b64, mime: out.mime }, lockOpts);
        const rem = await consumeStudio(quota.username, quota.limit);
        res.status(200).json({ imageBase64: locked.b64, mimeType: locked.mime, remaining: rem, dailyLimit: quota.limit || STUDIO_DAILY_LIMIT });
        return;
      }
      const rescue = await rescueGuarded(promptText, photos.concat(crops).map((p) => [p.data, p.mime]), apiKey, 'merge');
      if (rescue) {
        const lockedR = await lockMergeFaces({ b64: rescue, mime: 'image/png' }, lockOpts);
        const remR = await consumeStudio(quota.username, quota.limit);
        res.status(200).json({ imageBase64: lockedR.b64, mimeType: lockedR.mime, engine: 'openai', remaining: remR, dailyLimit: quota.limit || STUDIO_DAILY_LIMIT });
        return;
      }
      res.status(out.status || 502).json({ error: out.error || 'image_generation_failed' }); /* v-audit-studeng: رمز لا نصّ */
      return;
    }

    if (feature === 'combo') { res.status(410).json({ error: 'combo_removed' }); return; } /* v-studio-combo-removed: أمر المالك */

    /* v-body-reframe: صورة وجه في ميزة الجسم = صورة كاملة بالبنية المختارة. الخصم عند النجاح وحده (الحجز يُردّ غير ذلك)؛ وإن لم يُقفل
       الوجه (البوّابة، المفتاح، السقف، لبس الربط) ففحص هويّة مقابل الصورة قبل الخصم — وجه غريب = ٤٢٢ كحارس التعديل */
    const closeUp = (feature === 'body' && bodyReframeOn()) ? await bodyCloseUp(apiKey, imageBase64) : null;
    if (closeUp) {
      const rb = await bodyReframe({ apiKey, imageBase64, mimeType, style, description, variant: Number(variant), faces: closeUp.faces, crop: closeUp.crop, covered: closeUp.covered, beard: closeUp.beard, username: quota.username, t0: Date.now() });
      if (!rb.b64) { res.status(rb.status).json({ error: rb.error }); return; }
      if (!rb.swapped) {
        const idg = await verifyLocalizedImageEdit({
          apiKey, sourceBase64: imageBase64, sourceMime: mimeType || 'image/jpeg', resultBase64: rb.b64, resultMime: rb.mime,
          userPrompt: 'Identity check only: the close-up person was intentionally redrawn as a full-body photo with a new body build and clothing. Judge only whether the face is still the same person.',
          allowBroadChange: true,
        });
        if (!idg.ok && idg.reason === 'identity_or_scope_mismatch') {
          await keepGuardCharge('studio', quota, consumeStudio);
          res.status(422).json({ error: 'image_edit_identity_mismatch', retryable: false });
          return;
        }
      }
      const remB = await consumeStudio(quota.username, quota.limit);
      res.status(200).json(Object.assign({ imageBase64: rb.b64, mimeType: rb.mime, reframed: true, remaining: remB, dailyLimit: quota.limit || STUDIO_DAILY_LIMIT }, rb.engine ? { engine: rb.engine } : {}));
      return;
    }

    const promptText = buildSinglePrompt(feature, style, description, multiAngle, Number(variant));
    if (!promptText) { res.status(400).json({ error: 'Unknown feature' }); return; }
    let guardOpts = null;
    /* v-edit-no-change: الميزات الخفيّة (بشرة، عيون، جسم، عمر) تغييرها دقيق فلا يُفرض عليها */
    /* v-visible-change: العيون والجسم والعمر تغييرها ظاهر — «ما تغيّر» يُكشف ويُعاد؛ البشرة وحدها دقيقة بطبعها */
    const SUBTLE = ['skin'];
    const collage = !!(multiAngle && COLLAGE_FEATURES.indexOf(feature) !== -1);
    /* v-guard-cap: المجمّع قبل الوصف — الحارس يقصّ الطلب عند ٨٠٠ حرف، والوصف نصّ حرّ من المستخدم */
    /* v-studio-age: «age elder» وحدها لا تخبر الحارس أنّ الوجه نفسه هو المطلوب تغييره — العمر المطلوب بكلماته */
    const guardAsk = feature === 'age' ? ['change the apparent age of the same person to ' + styleTextOf(feature, style)] : [feature, style];
    if (feature !== 'merge') guardOpts = { userPrompt: guardAsk.concat([collage ? COLLAGE_CLAUSE : '', description]).filter(Boolean).join(' '), allowStyleChange: feature === 'anime', requireChange: SUBTLE.indexOf(feature) === -1 };
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
module.exports.__MERGE_FRAMING = MERGE_FRAMING; /* v-merge-face-lock: للاختبار */
module.exports.__mergeWantsNewLook = mergeWantsNewLook; /* v-merge-face-lock: للاختبار */
