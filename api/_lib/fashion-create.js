// Vercel Serverless Function: "👗 AI Fashion Design". Two modes:
//   1) Photo mode: a photo of a woman/model plus a chosen style+occasion is
//      redressed by Gemini's image-generation model into a new outfit.
//   2) Text mode: a plain-text description of a desired outfit is used to
//      generate a brand-new fashion design image from scratch (no photo).
// Uses the server-side owner API key (GEMINI_API_KEY). Returns a base64
// PNG/JPEG the client can preview and download.
const { checkFashionQuota, consumeFashion, FASHION_DAILY_LIMIT } = require('./_fashionUsage');
const { sourceStylePreservationRule } = require('./image-prompt');
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');
const { judgeBest, duoEnabled } = require('./image-judge');
const { locksFor } = require('./fashion-locks');

// 🎨 محرك بديل اختياري: gpt-image-1 (نفس محرك صور ChatGPT) بمفتاح OPENAI_API_KEY.
// وضع الصورة فقط (تعديل صورة المستخدمة). فشله يهبط صامتًا إلى Gemini.
async function openaiRedress(promptText, imageBase64, mimeType) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  try {
    const bytes = Buffer.from(imageBase64, 'base64');
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', promptText.slice(0, 3900));
    form.append('size', 'auto');
    /* v-strong-rescue: حفظ الملامح وجودة عالية */
    form.append('input_fidelity', 'high');
    form.append('quality', 'high');
    form.append('image', new Blob([bytes], { type: mimeType || 'image/jpeg' }), 'photo.jpg');
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
      signal: AbortSignal.timeout(240000), /* v-image-timeout */
    });
    const d = await r.json();
    if (!r.ok) { console.warn('[fashion-create] openai HTTP ' + r.status + ' ' + String((d.error && d.error.message) || '').slice(0, 120)); return null; }
    const b64 = d && d.data && d.data[0] && d.data[0].b64_json;
    return b64 ? { imageBase64: b64, mimeType: 'image/png' } : null;
  } catch (e) { console.warn('[fashion-create] openai ' + (e && e.message)); return null; }
}

// 🎨 الوضع النصّي عبر gpt-image-1 (توليد من الصفر بلا صورة مصدر). يُستعمل
// عند engine=openai أو كخطّ إنقاذ تلقائي حين يرفض Gemini (مثلًا نفاد الرصيد).
async function openaiGenerate(promptText) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt: promptText.slice(0, 3900), size: '1024x1536', quality: 'high' }),
      signal: AbortSignal.timeout(240000), /* v-image-timeout */
    });
    const d = await r.json();
    if (!r.ok) { console.warn('[fashion-create] openai gen HTTP ' + r.status + ' ' + String((d.error && d.error.message) || '').slice(0, 120)); return null; }
    const b64 = d && d.data && d.data[0] && d.data[0].b64_json;
    return b64 ? { imageBase64: b64, mimeType: 'image/png' } : null;
  } catch (e) { console.warn('[fashion-create] openai gen ' + (e && e.message)); return null; }
}

// v-fashion-78: كتالوج موسّع — «٢-٣ خيارات تُملّ؛ ٣٠-٥٠ كلام آخر».
const STYLE_PROMPTS = {
  evening: 'an elegant evening gown style, flowing fabric, refined and glamorous',
  formal: 'a formal professional outfit style, tailored and modern',
  casual: 'a casual everyday outfit style, comfortable and stylish',
  abaya: 'a modern elegant abaya style, tasteful embroidery, flowing silhouette',
  wedding: 'a wedding/bridal dress style, luxurious fabric, intricate detail',
  traditional: 'a traditional Gulf/Khaleeji women\'s fashion style, elegant and modest',
  kaftan: 'a luxurious Moroccan kaftan style, rich embroidery, flowing regal silhouette',
  jalabiya: 'an elegant Gulf jalabiya style, soft fabric, delicate embellishment',
  hijabchic: 'a chic modern modest outfit with a stylish hijab, coordinated colors',
  oldmoney: 'an old-money quiet-luxury style, tailored neutral pieces, timeless elegance',
  streetwear: 'a trendy streetwear style, oversized layers, sneakers, urban attitude',
  sporty: 'a modest sporty athleisure style, sleek activewear, dynamic look',
  winterlux: 'a luxurious winter style, long wool coat, cashmere layers, rich textures',
  summer: 'a breezy summer linen style, light colors, airy comfortable fit',
  office: 'a polished office-chic style, tailored blazer and trousers, refined',
  cocktail: 'a chic knee-length cocktail dress style, playful and elegant',
  ballgown: 'a dramatic princess ballgown style, voluminous skirt, grand elegance',
  boho: 'a bohemian style, flowing prints, layered jewelry, free-spirited',
  vintage: 'a vintage 1950s-inspired style, cinched waist, retro patterns',
  y2k: 'a Y2K 2000s revival style, playful colors, bold accessories',
  minimal: 'a minimalist capsule style, clean lines, monochrome neutrals',
  glam: 'a high-glam style, sequins and shimmer, red-carpet energy',
  leather: 'an edgy style with a leather jacket, modern rock touch',
  denim: 'a denim-on-denim style, contemporary casual cool',
  pastel: 'a soft pastel palette style, romantic light tones',
  monochrome: 'an all-one-color monochrome style, sculpted modern lines',
  floral: 'a floral print style, fresh feminine patterns',
  velvet: 'a rich velvet style, deep jewel tones, luxurious texture',
  silk: 'a silk satin style, fluid drape, understated luxury',
  suitf: 'a sharply tailored power-suit style, confident and modern',
  turkish: 'a Turkish-inspired elegant style, refined embroidery, modern Ottoman touch',
  indian: 'an Indian-inspired style, embellished fabrics, vibrant jewel colors',
  princess: 'a fairytale princess style, delicate tulle, sparkling accents',
  safari: 'a safari utility style, khaki tones, structured pockets',
  preppy: 'a preppy collegiate style, pleated skirt, knit over shirt',
  artgown: 'an avant-garde sculptural gown style, artistic statement silhouette',
};
// v-fashion-genders: الأوصاف كانت نسائية الصياغة حتى لرجل أو طفل («فستان سهرة»
// لرجل!). لكل فئة أوصافها؛ وما غاب يسقط لوصف النساء كما كان.
const STYLE_PROMPTS_MEN = {
  evening: 'an elegant evening menswear look — tailored tuxedo or refined dark suit',
  formal: 'a formal professional menswear outfit, tailored and modern',
  casual: 'a casual everyday menswear outfit, comfortable and stylish',
  wedding: 'an elegant groom wedding outfit, refined tailoring and detail',
  traditional: "a traditional Gulf/Khaleeji men's kandura attire, elegant and dignified",
  bisht: 'a majestic Gulf bisht cloak over a kandura, gold trim, ceremonial dignity',
  oldmoney: 'an old-money quiet-luxury menswear style, tailored neutrals, timeless',
  streetwear: 'a trendy menswear streetwear style, oversized layers, sneakers',
  sporty: 'a sleek athleisure menswear style, modern activewear',
  winterlux: 'a luxurious winter menswear style, long wool overcoat, layered knits',
  summer: 'a breezy summer linen menswear style, light shirt and trousers',
  office: 'a smart business-casual menswear style, blazer and chinos',
  leather: 'an edgy menswear style with a leather jacket, modern rock touch',
  denim: 'a denim menswear style, contemporary casual cool',
  minimal: 'a minimalist menswear capsule style, clean monochrome lines',
  monochrome: 'an all-one-color monochrome menswear style, sharp modern lines',
  vintage: 'a vintage 1960s-inspired menswear style, retro tailoring',
  smartcasual: 'a smart-casual menswear style, polo and tailored trousers',
  threepiece: 'a classic three-piece suit style, waistcoat, refined detailing',
  safari: 'a safari utility menswear style, khaki field jacket',
  preppy: 'a preppy collegiate menswear style, knit over shirt, loafers',
  athleisure: 'a premium athleisure menswear style, technical fabrics',
  rockstar: 'a rockstar stage style, statement jacket, bold confidence',
  moroccan: 'a Moroccan djellaba-inspired menswear style, elegant hooded robe',
};
const STYLE_PROMPTS_KIDS = {
  evening: "an elegant children's party outfit, festive and charming",
  formal: "a smart formal children's outfit, neat and modern",
  casual: "a comfortable casual children's outfit, playful and stylish",
  wedding: "a festive children's wedding-guest outfit, elegant detail",
  traditional: "a traditional Gulf/Khaleeji children's attire, elegant",
  sporty: "a sporty children's activewear outfit, energetic and fun",
  winterlux: "a cozy stylish children's winter outfit, warm layers",
  summer: "a light summer children's outfit, cheerful colors",
  school: "a neat smart school-uniform style outfit for a child",
  denim: "a cute denim children's outfit, playful modern",
  pastel: "a soft pastel children's outfit, sweet light tones",
  floral: "a floral print children's outfit, fresh and cheerful",
  streetwear: "a mini streetwear children's outfit, trendy and fun",
  minimal: "a minimalist clean-lined children's outfit, modern neutrals",
  vintage: "a vintage-inspired children's outfit, charming retro",
  preppy: "a preppy children's outfit, collared shirt and knit",
  eidkids: "a festive Eid celebration children's outfit, joyful elegance",
  princess: "a fairytale princess children's dress, tulle and sparkle",
};
function styleDescFor(style, gender) {
  const byGender = gender === 'men' ? STYLE_PROMPTS_MEN : gender === 'kids' ? STYLE_PROMPTS_KIDS : null;
  return (byGender && byGender[style]) || STYLE_PROMPTS[style] || STYLE_PROMPTS.evening;
}

// v417 — تفاصيل اختيارية. إن غابت كلها فالنصّ النهائي مطابق تمامًا لما قبلها.
const SUBJECTS = { men: 'a man', women: 'a woman', kids: 'a child' };
const WEAR = { men: 'menswear', women: 'womenswear', kids: "children's wear" };
const SEASON_HINTS = {
  summer: 'hot summer weather with lightweight breathable fabrics',
  autumn: 'cool autumn weather with layered fabrics',
  winter: 'cold winter weather with warm layers',
  spring: 'mild spring weather with fresh light fabrics',
};
const OCCASIONS = {
  wedding: 'a wedding', work: 'the workplace', casual: 'an everyday casual outing',
  sport: 'sport and exercise', travel: 'travel', formal: 'a formal event',
  graduation: 'a graduation ceremony', religious: 'a religious occasion',
};
function joinList(v) {
  if (!Array.isArray(v)) return '';
  return v.filter((x) => typeof x === 'string' && x.trim())
    .slice(0, 8).map((x) => x.trim().slice(0, 24)).join(', ');
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
      console.error('[fashion-create] image provider is not configured');
      res.status(503).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { mode, imageBase64, mimeType, style, description, token, multiAngle,
      gender, colors, extras, season, occasion, fairness, modest, engine, editRequest } = body;

    if (mode === 'image' && !imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }
    // v-fashion-refine (شكوى المالك ٢٩ أغسطس: «أطلب تغيير شيء معيّن فيغيّر
    // الشكل كامل»): وضع تعديل موضعي — النتيجة السابقة هي المصدر، والطلب
    // نص حر، وقفل صارم يمنع تغيير أي شيء غير المطلوب.
    if (mode === 'refine' && (!imageBase64 || !editRequest || !String(editRequest).trim())) {
      res.status(400).json({ error: 'Missing imageBase64 or editRequest' });
      return;
    }
    if (mode === 'text' && !description) {
      res.status(400).json({ error: 'Missing description' });
      return;
    }

    const quota = await checkFashionQuota(token);
    if (!quota.allowed) {
      if (quota.reason === 'auth') {
        res.status(401).json({ error: 'auth_required' });
      } else {
        res.status(402).json({ error: 'daily_limit_reached' });
      }
      return;
    }

    const styleDesc = styleDescFor(style, gender);
    const subject = SUBJECTS[gender] || 'a woman';
    const colorList = joinList(colors);
    const extraList = joinList(extras);
    const detailClause =
      (WEAR[gender] ? ' The outfit must be ' + WEAR[gender] + '.' : '') +
      (colorList ? ' Preferred colour palette: ' + colorList + '.' : '') +
      (extraList ? ' Add these accessories: ' + extraList + '.' : '') +
      (SEASON_HINTS[season] ? ' Dress for ' + SEASON_HINTS[season] + '.' : '') +
      (OCCASIONS[occasion] ? ' The look is intended for ' + OCCASIONS[occasion] + '.' : '');
    const parts = [];
    const multiAngleClause = multiAngle
      ? ' Output a single image laid out as a clean 3-panel collage side by side showing the SAME outfit and person from three angles: front view, side view, and back view.'
      : ' Output a single photorealistic image.';

    // v-fashion-locks: قفل الهوية بدل السطر الضعيف القديم، وقفل العدالة عند
    // المقارنة (نفس الاستوديو في كل الخيارات)، وقفل الاحتشام حيث يلزم.
    const locks = locksFor({ fairness: !!fairness, modest: !!modest, style, occasion });
    let promptText = '';
    if (mode === 'refine') {
      /* v-fashion-refine: تعديل نقطة واحدة فقط — كل ما عداها يبقى مطابقًا
         للمصدر حرفيًا (نفس الشخص والوجه والوقفة والخلفية وبقية اللبس). */
      const editReq = String(editRequest).trim().slice(0, 300);
      promptText =
        'Make ONLY this specific change to the image: "' + editReq + '". ' +
        'STRICT EDIT LOCK (highest priority): everything else must remain EXACTLY identical to the source image — the same person with the same face and identity, the same pose, the same background and lighting, and every other part of the outfit completely unchanged. ' +
        'Do NOT redesign, restyle, regenerate or alter anything that was not explicitly requested. This is a local edit, not a new look.' +
        locks;
      if (engine === 'openai') {
        const oa = await openaiRedress(promptText, imageBase64, mimeType);
        if (oa) {
          const remOa = await consumeFashion(quota.username);
          res.status(200).json({ imageBase64: oa.imageBase64, mimeType: oa.mimeType, engine: 'openai', remaining: remOa, dailyLimit: FASHION_DAILY_LIMIT });
          return;
        }
      }
      parts.push({ text: promptText });
      parts.push({ inlineData: { mimeType: mimeType || 'image/png', data: imageBase64 } });
    } else if (mode === 'image') {
      promptText =
        'Redress the person in this photo into a new outfit in ' + styleDesc + '.' +
        locks + ' ' +
        (fairness ? '' : 'Keep the same pose and background as the source photo. ') +
        // v-keep-framing: النتيجة كانت ترجع مقصوصة فتضيع أطراف صورة المستخدم.
        'FRAMING (mandatory): keep the exact same aspect ratio and full framing as the source photo — everything visible in the source must remain visible from edge to edge; do NOT crop, zoom in, or cut off any part of the person. ' +
        sourceStylePreservationRule() + detailClause + multiAngleClause;
      // 🎨 المحرك الاختياري: engine=openai مع مفتاح مضبوط → gpt-image-1؛
      // فشله أو غيابه → Gemini كما كان، بلا أي تغيير للمستخدم.
      if (engine === 'openai') {
        const oa = await openaiRedress(promptText, imageBase64, mimeType);
        if (oa) {
          const remOa = await consumeFashion(quota.username);
          res.status(200).json({ imageBase64: oa.imageBase64, mimeType: oa.mimeType, engine: 'openai', remaining: remOa, dailyLimit: FASHION_DAILY_LIMIT });
          return;
        }
      }
      parts.push({ text: promptText });
      parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
    } else {
      promptText =
        'Generate a photorealistic fashion design image of ' + subject + ' wearing ' + styleDesc + '. ' +
        'Specific description: ' + String(description).slice(0, 500) + '. ' +
        'Full-body studio fashion photography, elegant pose, clean background.' +
        (fairness ? require('./fashion-locks').FAIRNESS_LOCK + ' Use the same model appearance across this comparison set.' : '') +
        detailClause + multiAngleClause;
      // 🎨 المحرك الاختياري في الوضع النصّي أيضًا: gpt-image-1 من الصفر.
      if (engine === 'openai') {
        const oa = await openaiGenerate(promptText);
        if (oa) {
          const remOa = await consumeFashion(quota.username);
          res.status(200).json({ imageBase64: oa.imageBase64, mimeType: oa.mimeType, engine: 'openai', remaining: remOa, dailyLimit: FASHION_DAILY_LIMIT });
          return;
        }
      }
      parts.push({ text: promptText });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
    const reqBody = { contents: [{ parts }], generationConfig: { imageConfig: { imageSize: '2K' } } };
    /* v-image-duo: gpt-image بالتوازي مع Gemini، والحكم يختار الأدقّ في النهاية */
    const duoP = duoEnabled() ? (mode === 'image' ? openaiRedress(promptText, imageBase64, mimeType) : openaiGenerate(promptText)).catch(function () { return null; }) : null;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(240000), /* v-image-timeout */
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      // v-fashion-diag: سبب رفض Gemini يظهر في الردّ منقّحًا (بلا مفتاح) —
      // بدونه يبقى العطل «تعذّر إنشاء الصورة» بلا اسم، ولا سبيل لسجلّات الخادم.
      const detail = String((data && data.error && data.error.message) || 'unknown')
        .replace(/key=[^&\s"']+/g, 'key=***').slice(0, 200);
      console.error('[fashion-create] upstream failed status=' + upstream.status + ' detail=' + detail);
      // v-fashion-rescue: رفضُ Gemini (نفاد رصيد/تعطّل) لا يعني تعطّل الميزة —
      // إن وُجد مفتاح OpenAI فجرّب gpt-image-1 قبل إبلاغ المستخدم بالفشل.
      const rescue = duoP ? await duoP : (mode === 'image'
        ? await openaiRedress(promptText, imageBase64, mimeType)
        : await openaiGenerate(promptText));
      if (rescue) {
        const remR = await consumeFashion(quota.username);
        res.status(200).json({ imageBase64: rescue.imageBase64, mimeType: rescue.mimeType, engine: 'openai', remaining: remR, dailyLimit: FASHION_DAILY_LIMIT });
        return;
      }
      res.status(502).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.', upstream: upstream.status, detail });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      res.status(500).json({ error: 'لم يرجع الموديل صورة. حاول بوصف أو ستايل آخر.' });
      return;
    }

    if (mode === 'image') {
      const guard = await verifyLocalizedImageEdit({
        apiKey,
        sourceBase64: imageBase64,
        sourceMime: mimeType || 'image/jpeg',
        resultBase64: imgPart.inlineData.data,
        resultMime: imgPart.inlineData.mimeType || 'image/png',
        userPrompt: [styleDesc, description, detailClause, multiAngleClause].filter(Boolean).join(' '),
      });
      /* v-guard-fail-open: تعطّل الحارس نفسه (مهلة/حصة) لا يُسقط صورةً جاهزة —
         نعرضها ونسجّل؛ الرفض فقط عند حكمٍ صريح بتغيير الهوية أو الأسلوب. */
      if (!guard.ok && guard.reason === 'validation_unavailable') console.warn('[fashion-create] guard unavailable — passing result through');
      else if (!guard.ok) {
        res.status(422).json({ error: publicGuardError(guard), retryable: false });
        return;
      }
    }

    let outB64 = imgPart.inlineData.data, outMime = imgPart.inlineData.mimeType || 'image/png', outEngine = 'gemini';
    if (duoP) {
      try {
        const alt = await duoP;
        if (alt && alt.imageBase64) {
          let altOk = true;
          if (mode === 'image') {
            const g2 = await verifyLocalizedImageEdit({ apiKey, sourceBase64: imageBase64, sourceMime: mimeType || 'image/jpeg', resultBase64: alt.imageBase64, resultMime: alt.mimeType || 'image/png', userPrompt: [styleDesc, description, detailClause, multiAngleClause].filter(Boolean).join(' ') });
            altOk = !!(g2 && (g2.ok || g2.reason === 'validation_unavailable'));
          }
          if (altOk) {
            const pick = await judgeBest({ apiKey, prompt: promptText, source: mode === 'image' ? { b64: imageBase64, mime: mimeType || 'image/jpeg' } : null, a: { b64: outB64, mime: outMime }, b: { b64: alt.imageBase64, mime: alt.mimeType || 'image/png' } });
            if (pick === 'b') { outB64 = alt.imageBase64; outMime = alt.mimeType || 'image/png'; outEngine = 'openai+judge'; } else outEngine = 'gemini+judge';
          }
        }
      } catch (e) { console.warn('[fashion-create] duo skipped: ' + (e && e.message)); }
    }
    const remaining = await consumeFashion(quota.username);
    res.status(200).json({
      imageBase64: outB64,
      mimeType: outMime,
      engine: outEngine,
      remaining,
      dailyLimit: FASHION_DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[fashion-create] exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر إنشاء الصورة الآن. جرّب مرة أخرى.' });
  }
};
