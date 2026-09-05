// Vercel Serverless Function: image generation/editing for مها's voice call
// mode. Used when the caller asks Maha (by voice) to draw/create a picture,
// or to edit the picture she just made. Powered by Gemini's image-generation
// model (server-side owner key, GEMINI_API_KEY) - the only one of the 9
// providers that can actually output images.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { cleanImagePrompt, buildGenerationPrompt, buildEditPrompt, buildElevatePrompt, buildSceneUpgradePrompt, buildRestylePrompt, explicitlyRequestsStyleChange } = require('./image-prompt');
/* v-restyle-bold: «عدل 3d» / «حوّلها كرتون» / «ستايل أنيمي» = تحويل أسلوب كامل
   لا تعديل موضعي — explicitlyRequestsStyleChange لا يلتقط «3d» وحدها. */
const RESTYLE_RE = /(^|[\s،,])(3d|ثلاثي|مجسم|مجسّم|كرتون|كارتون|أنيمي|انمي|بيكسار|ديزني|زيتي|مائي|رصاص|بكسل|بيكسل|سايبر|نيون|كوميك|كومكس|مانجا|فانتازيا|واقعي|anime|cartoon|pixar|disney|pixel|cyberpunk|neon|comic|manga|fantasy|watercolor|oil\s*paint|sketch|realistic|render)/i;
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');
const { judgeBest, duoEnabled } = require('./image-judge');
/* v-nano-chat (المالك: «نفس فكرة نانو»): مع كل صورة جملة قصيرة تشرح ما فُعل واقتراح للخطوة التالية، بلغة الطلب */
async function imageCaption(apiKey, prompt, b64, mime, sourceB64, sourceMime) {
  try {
    if (!apiKey || String(process.env.IMAGE_CAPTION || 'on').toLowerCase() === 'off') return '';
    const parts = [{ text: 'The user asked: "' + String(prompt || '').slice(0, 500) + '".\n' + (sourceB64 ? 'The first image is what they sent; the second is the result you produced.' : 'The image is the result you produced.') + '\nReply in the SAME language as the user\'s request. Write exactly two short sentences: (1) what you did in the result, (2) one concrete follow-up suggestion phrased as a question. No markdown, no emojis, max 35 words total.' }];
    if (sourceB64) parts.push({ inlineData: { mimeType: sourceMime || 'image/jpeg', data: sourceB64 } });
    parts.push({ inlineData: { mimeType: mime || 'image/png', data: b64 } });
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.4, maxOutputTokens: 90 } }),
    });
    if (!r.ok) return '';
    const d = await r.json().catch(() => null);
    return String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join(' ')).trim().slice(0, 300);
  } catch (e) { return ''; }
}
const { authorPrayerPlan } = require('./prayer-plan');
const { fetchImageWithRetry, isImageTimeoutError } = require('./image-fetch');
const pipeline = require('./image-pipeline');

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

  let pointsLib = null;
  let mahaImgCharged = null;
  let guestImageCharge = null;
  async function refundImageCharge() {
    if (mahaImgCharged && pointsLib) {
      const user = mahaImgCharged;
      mahaImgCharged = null;
      try { await pointsLib.refundPoints(user, pointsLib.COSTS.image); } catch (error) { console.error('[maha-image] user refund failed'); }
    }
    if (guestImageCharge) {
      const charge = guestImageCharge;
      guestImageCharge = null;
      try {
        const { kvDecrBy } = require('./kv.js');
        await kvDecrBy(charge.counterKey, 1);
      } catch (error) { console.error('[maha-image] guest refund failed'); }
    }
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[maha-image] image provider is not configured');
      res.status(503).json({ error: 'image_generation_failed', retryable: false });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { prompt, editImageBase64, editMimeType, extraImages, token, guestId } = body;
    const prayerRequest = typeof body.prayerRequest === 'string' ? body.prayerRequest.trim().slice(0, 800) : '';
    if (!prompt && !prayerRequest) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }

    // تأليف أي دعاء ووضع فكرته البصرية يتمان ديناميكيًا من معنى الطلب، لا من
    // قائمة أسماء محفوظة. نعدّ التخطيط كطلب نصي مستقل قبل خصم نقاط الصورة.
    let prayerPlan = null;
    if (prayerRequest) {
      const planUsage = await checkAndConsume(token, guestId, 'prayer-plan', clientIp(req));
      if (!planUsage.allowed) {
        res.status(planUsage.reason === 'auth' ? 401 : 402).json({ error: planUsage.reason === 'auth' ? 'auth_required' : 'prayer_plan_limit' });
        return;
      }
      try {
        prayerPlan = await authorPrayerPlan(apiKey, prayerRequest, { textPosition: body.textPosition, kind: body.textKind });
      } catch (error) {
        console.error('[maha-image] prayer planner failed: ' + (error && error.message ? error.message : error));
        res.status(502).json({ error: 'تعذّر تأليف الدعاء وفكرته البصرية بدقة الآن. جرّب مرة أخرى.' });
        return;
      }
      if (body.planPrayerOnly === true) {
        res.status(200).json({ authoredText: prayerPlan.prayerText, visualPrompt: prayerPlan.visualBrief, prayerTopic: prayerPlan.topicLabel });
        return;
      }
    }

    // 💰 نظام النقاط: توليد/تعديل صورة = 10 نقاط لغير المالك.
    // الضيف (بدون حساب) له صورة واحدة مجانية مدى الحياة كتجربة.
    pointsLib = require('./points.js');
    const mahaImgUser = pointsLib.verifyPointsToken(token);
    if (mahaImgUser) {
      if (!pointsLib.isOwnerUsername(mahaImgUser)) {
        const pay = await pointsLib.spendPoints(mahaImgUser, pointsLib.COSTS.image, 'image');
        if (!pay.ok) {
          res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.image, points: pay.points || 0 });
          return;
        }
        mahaImgCharged = mahaImgUser;
      }
    } else if (typeof guestId === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(guestId)) {
      const { kvGetJSON, kvSetIfAbsent, kvIncr, kvDecrBy } = require('./kv.js');
      const flagKey = 'db/points/guest-image/' + encodeURIComponent(guestId);
      const counterKey = flagKey + '/count';
      const legacy = await kvGetJSON(flagKey);
      const legacyCount = legacy ? (typeof legacy.count === 'number' ? legacy.count : 1) : 0;
      await kvSetIfAbsent(counterKey, legacyCount);
      const usedCount = await kvIncr(counterKey);
      // الحجز والاسترداد ذريّان؛ الطلبات المتزامنة لا تضيع محاولة مجانية.
      if (usedCount > 3) {
        await kvDecrBy(counterKey, 1);
        res.status(402).json({ error: 'guest_image_used' });
        return;
      }
      guestImageCharge = { counterKey };
    } else {
      res.status(401).json({ error: 'auth_required' });
      return;
    }

    const parts = [];
    // 500 حرفًا تكفي طلبًا عاديًا («قطة على كرسي»)، ولا تكفي وصفًا هندسيًا
    // يحمل عدد الطوابق وسعة الكراج والطراز والمواد — وهو ما يجعل الواجهة
    // تطابق المخطط. الوصف الهندسي يُسمح له بمساحة أوسع.
    const isArchitectural = !!(body && body.architectural);
    // v605: ترقية مشهد كاملة يطلبها المستخدم صراحةً («أعطني الأفضل»).
    const isSceneUpgrade = !!(body && body.sceneUpgrade === true && editImageBase64);
    // v656: «فكرة ثانية/مختلفة» على صورة موجودة = إعادة تصور كاملة لا تعديل حرفي.
    const isRestyle = !!editImageBase64 && !isSceneUpgrade && RESTYLE_RE.test(String(prompt || ''));
    /* v-stronger (المالك: «أطلب صورة أقوى من الي عندي — يعطيني نفس الصورة»):
       «أقوى/اقوى/فكرة أقوى/سوّها أقوى» = المستخدم يريد فكرة أبدع لا نسخةً حرفية،
       فيُعامل كإعادة تصوّر جريئة تبني على الموضوع نفسه. يُستثنى صراحةً طلب «نفس
       الصورة/زيها بالضبط» كي لا نغيّر عندما يريد الحرفية فعلًا. */
    const __sameImageRe = /نفس\s*الصور[ةه]|زيها\s*بالضبط|طبق\s*الأصل|بالضبط\s*نفس|كما\s*هي|same\s*image|exact(?:ly)?\s*same|identical/i;
    /* v-elevate (المالك: «أقوى = نفس الفكرة مرفوعة لا فكرة جديدة»): نفصل نيّتين
       كانتا مدموجتين خطأً:
       - isReimagine = «فكرة مختلفة/جديدة» → مشهد جديد كليًا (buildReimagine).
       - isElevate  = «أقوى/أفضل من هذي» → نفس الموضوع والتركيب لكن أرقى بكثير
         (buildElevatePrompt). دمجهما كان يحوّل كرتًا بسيطًا إلى لوحة بلا علاقة. */
    const __strongerRe = /(?:^|[\s،,])(?:أقوى|اقوى|فكرة\s*أقوى|فكره\s*اقوى|أبدع|ابدع|أروع|اروع|خيالي[ةه]?|جبار[ةه]?|احترافي[ةه]\s*أكثر)(?=$|[\s،,.!؟?])|(?:أفضل|افضل|أحسن|احسن)\s*من(?=$|[\s،,.!؟?])|خلّ?ها\s*أقوى|خليها\s*اقوى|سوّ?ها\s*أقوى|سويها\s*اقوى|\b(?:stronger|more\s*powerful|bolder|epic|level\s*up|glow\s*up|next\s*level|better\s*than)\b/i;
    const isReimagine = !!editImageBase64 && !isSceneUpgrade && !isRestyle && !__sameImageRe.test(String(prompt || '')) && /فكرة\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|فكره\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|غيّ?ر\s*الفكرة|بشكل\s*مختلف\s*تمام|مختلف\s*تمام|تصميم\s*ثاني|ستايل\s*ثاني|بدّ?ل\s*(الفكرة|التصميم|الستايل)|different\s*(idea|concept|style)|new\s*concept|another\s*(idea|take|concept)|reimagine/i.test(String(prompt || ''));
    const isElevate = !!editImageBase64 && !isSceneUpgrade && !isRestyle && !isReimagine && !__sameImageRe.test(String(prompt || '')) && __strongerRe.test(String(prompt || ''));
    const promptLimit = isArchitectural ? 2400 : (editImageBase64 ? 8000 : 1800);
    /* v-nano-raw (المالك ٥ سبتمبر: «ليش الفرق بينهم»): تطبيق Gemini يرسل نصّ المستخدم كما هو، ونحن نلفّه
       بقواعد وحرّاس وحكم. من يبدأ طلبه بـ«نانو:» أو «nano:» يصل نصّه إلى نانو بنانا برو حرفيًا:
       بلا صياغة، بلا حارس، بلا محرّك ثانٍ، بلا لصق وجه — نفس ما يعطيه تطبيق Gemini. */
    const RAW_RE = /^\s*(?:نانو|نانو\s*بنانا|nano(?:\s*banana)?)\s*[:：\-–—]?\s*/i;
    /* v-nano-default (المالك: «أريد نانو بنانا عندي في التطبيق نفس الفكرة»): الوضع الخام هو الافتراضي لكل صور
       الدردشة — نصّ المستخدم كما هو مع صورته، بلا صياغة ولا حارس، كتطبيق Gemini تمامًا. IMAGE_RAW_DEFAULT=off يعيد الصياغة. */
    const rawMode = !prayerPlan && (RAW_RE.test(String(prompt || '')) || String(process.env.IMAGE_RAW_DEFAULT || 'on').toLowerCase() !== 'off');
    const cleanPrompt = rawMode
      ? String(prompt || '').replace(RAW_RE, '').trim().slice(0, 4000)
      : cleanImagePrompt(prayerPlan ? prayerPlan.visualBrief : prompt).slice(0, promptLimit);
    const extras = Array.isArray(extraImages) ? extraImages.filter((x) => x && x.data).slice(0, 5) : [];

    // 🧪 خط أنابيب الصور الجديد: يعمل فقط لتوليد جديد (لا تعديل، لا دعاء،
    // لا إعادة تصور، لا ترقية مشهد)، ومحمي خلف علم بيئة صريح كي لا يمسّ أي
    // مسار قائم قبل التحقّق منه.
    let pipelineActive = process.env.IMAGE_PIPELINE === '1' && !editImageBase64 && !prayerPlan && !rawMode;
    let pipelineRewrite = null;
    if (pipelineActive) {
      try {
        pipelineRewrite = await pipeline.rewritePrompt(cleanPrompt);
        if (!pipelineRewrite || !pipelineRewrite.prompt) {
          pipelineActive = false;
        }
      } catch (error) {
        console.error('[maha-image] pipeline rewrite failed: ' + (error && error.stack ? error.stack : error));
        pipelineActive = false;
        pipelineRewrite = null;
      }
    }

    if (editImageBase64 && extras.length) {
      // 🧩 دمج عدة صور في تصميم واحد
      parts.push({ text: 'TASK: "' + cleanPrompt + '"\n\nYou are given ' + (extras.length + 1) + ' input images. COMPOSE them together into ONE single high-quality design exactly as the instruction asks. Rules:\n1. Every input image MUST appear in the final result - do not drop any of them.\n2. Keep each image\'s content recognizable and faithful (logos, faces, text stay pixel-faithful; do not redraw or distort them).\n3. Arrange them beautifully per the instruction (e.g. logo behind/above text, side by side, layered) with a premium, professional layout.\n4. Any Arabic text must remain correct and readable.\nOutput a single composed image.' });
      parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
      for (const x of extras) parts.push({ inlineData: { mimeType: x.mime || 'image/png', data: x.data } });
    } else if (editImageBase64) {
      parts.push({ text: isSceneUpgrade ? buildSceneUpgradePrompt(cleanPrompt)
        : (isRestyle ? buildRestylePrompt(cleanPrompt)
        : (isElevate ? buildElevatePrompt(cleanPrompt)
        : (isReimagine
          ? ('TASK: "' + cleanPrompt + '"\n\nThe attached image is ONLY inspiration for the SUBJECT. Create a COMPLETELY NEW image of the same subject with a clearly DIFFERENT concept: new composition, new viewpoint, new background, new lighting and a fresh creative idea — the result must NOT look like a copy or minor edit of the source. Keep any real faces, logos or brand marks faithful if they are the subject. Quality bar: breathtaking, award-winning, magazine-cover grade, tack-sharp, professional cinematic lighting, no toy-like or amateur rendering.')
          : buildEditPrompt(cleanPrompt)))) });
      parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
    } else if (pipelineActive && pipelineRewrite) {
      // Pipeline prompt includes negative in separate field — combine for Gemini
      const pipePrompt = pipelineRewrite.negative
        ? pipelineRewrite.prompt + '\n\nDo not include: ' + pipelineRewrite.negative
        : pipelineRewrite.prompt;
      parts.push({ text: pipePrompt });
    } else {
      parts.push({ text: buildGenerationPrompt(cleanPrompt, {
        architectural: isArchitectural,
        prayerArt: !!prayerPlan,
        reserveTextArea: body.reserveTextArea === true,
        textPosition: body.textPosition
      }) });
    }

    /* v-raw-smart-edit (المالك: «المفاتيح عندي ودفعت لكن النتيجة منك»): الوضع
       الخام كان يمسح كل الأوامر المهندسة (تطوير/إعادة تصوّر/إزالة أسماء) ويرسل
       نصّ المستخدم الخام فقط — فتضيع كل الهندسة في التعديلات وتتذبذب النتيجة.
       الآن: الوضع الخام يبقى للتوليد الجديد (إحساس تطبيق Gemini كما أراد المالك)
       أو حين يبدأ الطلب بـ«نانو:» صراحةً؛ أمّا تعديل صورة مصدر فيستخدم الأمر
       المهندس دائمًا لأنه هو ما يرفع الجودة فوق التمرير الخام. */
    const __explicitRaw = RAW_RE.test(String(prompt || ''));
    const __pureRaw = rawMode && (!editImageBase64 || __explicitRaw);
    if (__pureRaw) {
      parts.length = 0;
      parts.push({ text: cleanPrompt });
      if (editImageBase64) parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
      for (const x of extras) parts.push({ inlineData: { mimeType: x.mime || 'image/png', data: x.data } });
    }
    /* v-nano-edit (مقارنة المالك: «نانو الأصلي» يعيد التخيّل بجرأة، وتطبيقنا
       كان يعدّل تعديلًا خجولًا كفوتوشوب): محرّك التعديل الأساسي = نانو بنانا
       (gemini-2.5-flash-image) لأنه هو من ينتج النتائج الإبداعية التي أراها
       المالك. التوليد الجديد يبقى على gemini-3-pro-image بدقّة 2K. قابل للضبط
       بمتغيّر IMAGE_EDIT_MODEL للرجوع فورًا بلا نشر. */
    const editModel = (process.env.IMAGE_EDIT_MODEL || 'gemini-2.5-flash-image').trim();
    const primaryModel = editImageBase64 ? editModel : 'gemini-3-pro-image';
    const nanoPrimary = /2\.5-flash-image/.test(primaryModel);
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + primaryModel + ':generateContent?key=' + apiKey;
    // v656: نسبة أبعاد ذكية — الافتراضي طولي (3:4) لأن المستخدمين على الجوال،
    // مع احترام أي طلب صريح (عرضي/مربع/ستوري...). التعديل يحافظ على أبعاد المصدر.
    const pickAspect = function (p) {
      const s2 = String(p || '');
      if (/عرضي|عرضيه|عرضية|بانر|بنر|غلاف\s*(يوتيوب|قناة|فيس)|لاندسكيب|landscape|banner|widescreen|16\s*[:x]\s*9|thumbnail|ثمبنيل/i.test(s2)) return '16:9';
      if (/مربع|مربعه|مربعة|square|1\s*[:x]\s*1|لوجو|شعار|\blogo\b|بوست\s*انستقرام|instagram\s*post|بروفايل|profile\s*(pic|photo)/i.test(s2)) return '1:1';
      if (/ستوري|استوري|خلفية\s*(جوال|هاتف|موبايل)|خلفيه\s*(جوال|هاتف|موبايل)|story|wallpaper|9\s*[:x]\s*16|ريلز|reels|تيك\s*توك|tiktok|شورتس|shorts/i.test(s2)) return '9:16';
      return '3:4';
    };
    const imageConfig = { imageSize: '2K' };
    if (!editImageBase64) imageConfig.aspectRatio = (pipelineActive && pipelineRewrite && pipelineRewrite.aspect) ? pipelineRewrite.aspect : (isArchitectural ? '16:9' : pickAspect(cleanPrompt));
    /* نانو بنانا (2.5-flash-image) لا يدعم imageSize:'2K' — نرسل له صيغة نظيفة
       بلا imageConfig كي لا يرفض الطلب (400). */
    const genConfigFor = function (extra) {
      const cfg = Object.assign({}, extra);
      if (!nanoPrimary) cfg.imageConfig = imageConfig;
      return cfg;
    };
    const reqBody = JSON.stringify(__pureRaw
      ? { contents: [{ parts }], generationConfig: genConfigFor({}) }
      : { contents: [{ parts }], generationConfig: genConfigFor({ temperature: editImageBase64 ? (isSceneUpgrade ? 0.5 : (isReimagine ? 0.9 : (isElevate ? 0.5 : (isRestyle ? 0.6 : 0.15)))) : 0.85 }) });

    /* v-img-textwise (شكوى المالك: «توليد الصور زفت» — لقطة شاشة التطبيق
       رجعت بعناوين عربية مشوهة): مصدرٌ مليء بالنصوص (لقطة واجهة، مستند،
       بوستر، قائمة) يُعاد رسمه كاملًا عند Gemini فتنكسر الحروف مهما شددت
       التعليمات. gpt-image-1 عبر images/edits بـinput_fidelity=high ينقل
       الحروف من المصدر كما هي — فيصير هو الخط الأول لهذه الفئة تحديدًا،
       وGemini يبقى أساس المشاهد المصورة وخط إنقاذ للكل. الكشف بنداء
       flash خاطف (نعم/لا) قبل التوليد. */
    async function sourceLooksTextDense() {
      if (!editImageBase64) return false;
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            contents: [{ parts: [
              { text: 'Answer with exactly one word, YES or NO. YES only if this image is text-dense: a UI screenshot, app screen, document, menu, form, chart with many labels, or a poster whose main content is many words. NO for photos, people, places, products and scenes.' },
              { inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } },
            ] }],
            generationConfig: { temperature: 0, maxOutputTokens: 4 },
          }),
        });
        const d = await r.json().catch(function () { return null; });
        const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join(' '));
        return /\bYES\b/i.test(txt);
      } catch (e) { return false; }
    }

    // v-maha-image-rescue (خط الإنقاذ التاسع — لقطات عمران ٢٧ أغسطس «الخدمة
    // مشغولة»): زحام أو رفض Gemini في التوليد النصي يهبط لـgpt-image-1 بنفس
    // الوصف بدل الفشل. التحرير بصورة مصدر يبقى على Gemini (مساره مختلف).
    const rescuePromptText = (parts.find(function (p) { return p && p.text; }) || {}).text || cleanPrompt;
    const rescueAspect = imageConfig.aspectRatio || '3:4';
    // v-img-visible: نلتقط سبب فشل خط الإنقاذ (OpenAI) ليظهر مع سبب Gemini في
    // لوحة المالك — كان كل ذلك يذهب لـconsole.error فقط، فيرى المالك «0» بلا سبب.
    let lastRescueErr = '';
    async function openaiRescueImage() {
      const okey = process.env.OPENAI_API_KEY;
      if (!okey) { lastRescueErr = 'no OPENAI_API_KEY'; return null; }
      /* v-edit-rescue (لقطة بطاقة التجنيد «غش»): التعديل كان بلا خط إنقاذ —
         إذا انشغل Gemini فشل كل تعديل صورة في المحادثة وسقط العميل على شريط
         الكانفس. gpt-image-1 يعدل عبر images/edits بنفس الصورة والتعليمة. */
      if (editImageBase64) {
        try {
          const bytes = Buffer.from(editImageBase64, 'base64');
          const form = new FormData();
          form.append('model', 'gpt-image-1');
          form.append('prompt', String(rescuePromptText).slice(0, 3800));
          form.append('size', 'auto');
          /* v-hifi-edit (مقارنة عمران مع ChatGPT): input_fidelity=high يحفظ
             نصوص وشعارات الصورة الأصلية — بدونه يعاد رسمها مخربشة. */
          form.append('input_fidelity', 'high');
          form.append('quality', 'high');
          form.append('image', new Blob([bytes], { type: editMimeType || 'image/jpeg' }), 'photo.jpg');
          const r = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + okey },
            signal: AbortSignal.timeout(120000),
            body: form,
          });
          const d = await r.json().catch(function () { return null; });
          if (!r.ok) { lastRescueErr = 'openai edit ' + r.status + ' ' + String((d && d.error && d.error.message) || '').slice(0, 120); console.error('[maha-image] edit-rescue ' + lastRescueErr); return null; }
          const b64 = d && d.data && d.data[0] && d.data[0].b64_json;
          return b64 || null;
        } catch (e) { lastRescueErr = 'openai edit ' + (e && e.message); console.error('[maha-image] edit-rescue error: ' + (e && e.message)); return null; }
      }
      try {
        const size = rescueAspect === '16:9' ? '1536x1024' : (rescueAspect === '1:1' ? '1024x1024' : '1024x1536');
        const genOnce = (model) => fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + okey },
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({ model, prompt: String(rescuePromptText).slice(0, 3800), size, quality: 'high', n: 1 }),
        });
        let r = await genOnce('gpt-image-2');
        // v-img-model-fallback: لو النموذج الأحدث غير متاح لهذا المفتاح (400/404)
        // نرجع لـgpt-image-1 المضمون بدل الفشل الصامت.
        if (!r.ok && (r.status === 400 || r.status === 404)) {
          const t1 = await r.text().catch(function () { return ''; });
          if (/model/i.test(t1)) r = await genOnce('gpt-image-1');
          else { lastRescueErr = 'openai gen status=' + r.status + ' ' + t1.slice(0, 120); console.error('[maha-image] rescue failed ' + lastRescueErr); return null; }
        }
        if (!r.ok) { lastRescueErr = 'openai gen status=' + r.status + ' ' + String(await r.text().catch(function(){return '';})).slice(0, 120); console.error('[maha-image] rescue failed ' + lastRescueErr); return null; }
        const d = await r.json().catch(function () { return null; });
        const b64 = d && d.data && d.data[0] && d.data[0].b64_json;
        return b64 || null;
      } catch (e) { lastRescueErr = 'openai gen ' + (e && e.message); console.error('[maha-image] rescue error: ' + (e && e.message)); return null; }
    }

    // v-nano-banana (طلب عمران): إذا فشل موديل الصور الأساسي، نجرّب موديل Google
    // «Nano Banana» (gemini-2.5-flash-image) بصيغة طلب نظيفة قبل خط إنقاذ OpenAI —
    // كثيرًا ما يكون متاحًا لمفاتيح لا يتاح لها gemini-3-pro-image، فيُنقذ التوليد.
    let lastNanoErr = '';
    async function geminiNanoBananaImage() {
      const models = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview'];
      for (let i = 0; i < models.length; i++) {
        try {
          const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + apiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(90000),
            body: JSON.stringify({ contents: [{ parts: parts }] }),
          });
          if (!r.ok) { lastNanoErr = models[i] + ' status=' + r.status; continue; }
          const d = await r.json().catch(function () { return null; });
          const p = (((d && d.candidates || [])[0] || {}).content || {}).parts || [];
          const img = p.find(function (x) { return x.inlineData && x.inlineData.data; });
          if (img && img.inlineData.data) return img.inlineData.data;
          lastNanoErr = models[i] + ' no-image-part';
        } catch (e) { lastNanoErr = models[i] + ' ' + (e && e.message); }
      }
      return null;
    }

    // v-img-textwise: مصدر نصّي كثيف → gpt-image-1 عالي الدقة أولًا؛
    // فشله أو غيابه يُكمل مسار Gemini المعتاد بلا أي خسارة.
    /* v-img-textwise-gen (صورة ChatGPT عند المالك: واجهة أدوات كاملة بعناوين
       عربية سليمة — gpt-image ينفّذها وGemini يكسر الحروف): طلب توليد جديد
       يذكر نصوصًا/عناوين/أيقونات/واجهة/شاشة يبدأ أيضًا بـgpt-image. */
    const __textCueRe = /نص|كتاب|مكتوب|عنوان|عناوين|أيقون|ايقون|واجهة|شاشة|تطبيق|قائمة|كلمات|حروف|خط\s*عرب|\btext\b|label|icon|\bui\b|screen|interface|\bapp\b|menu|typograph|lettering|caption/i;
    /* v-textedit-raw (لقطة المالك «شيل حرف م واكتب ع» رجعت مشوّهة «٤/تعديل»):
       تعديل مصدرٍ نصّيٍّ كثيف (لقطة شاشة/شعار) هو بالضبط ما يكسر فيه Gemini
       الحروف العربية، وgpt-image-1 بـinput_fidelity=high ينقلها كما هي. كان
       هذا المسار معطّلًا افتراضيًا لأن الوضع الخام (نانو) هو الافتراضي (!rawMode).
       الآن: للتعديل على مصدر نصّي كثيف يعمل المسار حتى في الوضع الخام؛ ويبقى
       الوضع الخام نقيًّا للتوليد الجديد. */
    /* v-bold-wins (المالك: «أقوى/أفضل من هذي — يرجّع نفس الصورة»): طلبات الإبداع
       (إعادة تصوّر/تحويل أسلوب) يجب ألّا يتدخّل فيها محرّك «حفظ النص» لأنه يثبّت
       الصورة كما هي؛ نتركها لنانو ليعطي نتيجة جريئة فعلًا. */
    const __textRoute = !!process.env.OPENAI_API_KEY && !prayerPlan && !isReimagine && !isRestyle && !isSceneUpgrade && !isElevate
      && (editImageBase64 ? await sourceLooksTextDense() : (!rawMode && __textCueRe.test(cleanPrompt)));
    /* v-duo-textroute (لقطة المالك: لقطة واجهة + «عطني أفضل ونفس الفكرة» → فنجان قهوة): مسار النصّ الكثيف كان
       يرجع ناتج gpt-image وحده بلا Gemini ولا حكم. الآن يعمل المحرّكان معًا هنا أيضًا والحكم يختار. */
    let densePromise = null;
    if (__textRoute) {
      if (duoEnabled() && !pipelineActive) {
        densePromise = openaiRescueImage().catch(function () { return null; });
      } else {
        const denseB64 = await openaiRescueImage();
        if (denseB64) {
          res.status(200).json({ imageBase64: denseB64, mimeType: 'image/png', engine: 'openai', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined });
          return;
        }
      }
    }

    /* v-image-duo: gpt-image يعمل بالتوازي مع Gemini على الطلب نفسه؛ الحكم يختار الأدقّ في النهاية.
       يُستثنى الدعاء المؤلَّف وخط الأنابيب (لهما تحقّق خاص) وما سلك مسار النصّ الكثيف. */
    /* المحرّك الثاني يبقى بالتوازي في الوضع الخام أيضًا بالنصّ الخام نفسه، والحكم يختار */
    /* v-bold-wins: في طلبات الإبداع (إعادة تصوّر/تحويل أسلوب) لا نُشغّل المنافس
       gpt-image (input_fidelity=high يحافظ على المصدر فيفوز الحكم بالنسخة الحرفية)
       — نعتمد نتيجة نانو الجريئة مباشرة؛ خطوط الإنقاذ تبقى عند الفشل فقط. */
    const duoOn = duoEnabled() && !prayerPlan && !pipelineActive && !isReimagine && !isRestyle && !isElevate && (!__textRoute || !!densePromise);
    const duoP = duoOn ? (densePromise || openaiRescueImage().catch(function () { return null; })) : null;
    let duoEngine = '';
    // Image generation normally takes 35–50 seconds, so it must bypass the
    // shared 30-second fetch guard. Retry transient failures inside this one
    // request; the user should not have to resend the same prompt.
    const imageResult = await fetchImageWithRetry({
      url: endpoint,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      },
      onRetry: ({ attempt, response, error }) => {
        const detail = response ? ('status=' + response.status) : ('error=' + String(error && error.name || 'fetch'));
        console.error('[maha-image] retrying upstream image request after attempt ' + attempt + ' ' + detail);
      },
    });
    const upstream = imageResult.response;
    const data = imageResult.data || {};


    if (!upstream || !upstream.ok) {
      const nanoB64 = await geminiNanoBananaImage();
      if (nanoB64) { res.status(200).json({ imageBase64: nanoB64, mimeType: 'image/png', engine: 'gemini-nano-banana', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined }); return; }
      const rescuedB64 = duoP ? await duoP : await openaiRescueImage();
      /* v-prayer-carry: الإنقاذ كان يفقد الدعاء المؤلَّف فيرفضه العميل
         (missing_authored_prayer — لقطة المالك). يُمرَّر مع الصورة المنقذة. */
      if (rescuedB64) { res.status(200).json({ imageBase64: rescuedB64, mimeType: 'image/png', engine: 'openai', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined }); return; }
      await refundImageCharge();
      const timedOut = isImageTimeoutError(imageResult.error);
      const retryable = timedOut || !!(upstream && (upstream.status === 429 || upstream.status >= 500));
      const errorCode = timedOut ? 'image_generation_timeout' : (retryable ? 'image_generation_busy' : 'image_generation_failed');
      console.error('[maha-image] upstream image request failed after ' + imageResult.attempts + ' attempt(s)' + (upstream ? ' status=' + upstream.status : ''));
      // v-img-visible: يظهر السبب الحقيقي (رصيد/حصة/موديل) في لوحة المالك.
      try { require('./log-error.js').logError('maha-image:both-failed', new Error(errorCode), { gemini: upstream ? ('status=' + upstream.status) : 'no-response', nano: lastNanoErr || 'no-nano', openai: lastRescueErr || 'no-rescue', attempts: imageResult.attempts }); } catch (e) { /* التسجيل لا يعطّل الرد */ }
      res.status(timedOut ? 504 : 502).json({ error: errorCode, retryable });
      return;
    }

    let respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    let imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      const nanoB64b = await geminiNanoBananaImage();
      if (nanoB64b) { res.status(200).json({ imageBase64: nanoB64b, mimeType: 'image/png', engine: 'gemini-nano-banana', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined }); return; }
      const rescuedB64b = duoP ? await duoP : await openaiRescueImage();
      if (rescuedB64b) { res.status(200).json({ imageBase64: rescuedB64b, mimeType: 'image/png', engine: 'openai', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined }); return; }
      await refundImageCharge();
      console.error('[maha-image] no image part in response: ' + JSON.stringify(data).slice(0, 2000));
      try { require('./log-error.js').logError('maha-image:no-image-part', new Error('gemini_no_image_part'), { nano: lastNanoErr || 'no-nano', openai: lastRescueErr || 'no-rescue' }); } catch (e) { /* التسجيل لا يعطّل الرد */ }
      res.status(500).json({ error: 'لم يرجع الموديل صورة، حاول توصيف مختلف.' });
      return;
    }

    if (editImageBase64 && !extras.length && !rawMode) {
      const guard = await verifyLocalizedImageEdit({
        apiKey,
        sourceBase64: editImageBase64,
        sourceMime: editMimeType || 'image/png',
        resultBase64: imgPart.inlineData.data,
        resultMime: imgPart.inlineData.mimeType || 'image/png',
        userPrompt: cleanPrompt,
        allowStyleChange: explicitlyRequestsStyleChange(cleanPrompt),
        allowBroadChange: isSceneUpgrade || isElevate || isReimagine,
      });
      if (!guard.ok && guard.reason === 'validation_unavailable') console.warn('[maha-image] guard unavailable — passing result through'); /* v-guard-fail-open */
      else if (!guard.ok) {
        await refundImageCharge();
        console.error('[maha-image] rejected edited image: ' + guard.reason);
        res.status(422).json({ error: publicGuardError(guard), retryable: false });
        return;
      }
    }

    // 🔁 تحقّق + إعادة محاولة واحدة: فقط عندما خط الأنابيب فعّال ولديه قيود
    // قابلة للفحص. فشل التحقّق لا يمنع الإرجاع — نستخدم نتيجة إعادة المحاولة
    // كما هي حتى لو فشلت أيضًا، حتى لا نعطّل المستخدم.
    if (pipelineActive && pipelineRewrite) {
      try {
        const check = await pipeline.verifyImage(
          imgPart.inlineData.data,
          imgPart.inlineData.mimeType || 'image/png',
          pipelineRewrite.constraints
        );
        if (check && check.pass === false) {
          console.error('[maha-image] pipeline verification failed, retrying once: ' + (check.fix || '') + ' issues: ' + JSON.stringify(check.issues || []));
          const retryPrompt = (check.fix ? check.fix + ' ' : '') + (pipelineRewrite.negative
            ? pipelineRewrite.prompt + '\n\nDo not include: ' + pipelineRewrite.negative
            : pipelineRewrite.prompt);
          const retryParts = [{ text: retryPrompt }];
          const retryReqBody = JSON.stringify({ contents: [{ parts: retryParts }], generationConfig: { temperature: 0.85, imageConfig } });
          try {
            const retryResult = await fetchImageWithRetry({
              url: endpoint,
              init: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: retryReqBody,
              },
              onRetry: ({ attempt, response, error }) => {
                const detail = response ? ('status=' + response.status) : ('error=' + String(error && error.name || 'fetch'));
                console.error('[maha-image] pipeline retry: retrying upstream image request after attempt ' + attempt + ' ' + detail);
              },
            });
            const retryUpstream = retryResult.response;
            const retryData = retryResult.data || {};
            if (retryUpstream && retryUpstream.ok) {
              const retryRespParts = (((retryData.candidates || [])[0] || {}).content || {}).parts || [];
              const retryImgPart = retryRespParts.find((p) => p.inlineData && p.inlineData.data);
              if (retryImgPart) {
                imgPart = retryImgPart;
                respParts = retryRespParts;
              } else {
                console.error('[maha-image] pipeline retry: no image part in retry response, keeping original');
              }
            } else {
              console.error('[maha-image] pipeline retry: upstream request failed, keeping original image');
            }
          } catch (retryError) {
            console.error('[maha-image] pipeline retry failed: ' + (retryError && retryError.stack ? retryError.stack : retryError));
          }
        }
      } catch (verifyError) {
        console.error('[maha-image] pipeline verify failed: ' + (verifyError && verifyError.stack ? verifyError.stack : verifyError));
      }
    }

    /* v-image-duo: المرشّح الثاني (gpt-image) يمرّ بحارس الهوية نفسه إن كان تعديلًا، ثم الحكم */
    if (duoP) {
      try {
        const alt = await duoP;
        if (alt) {
          let altOk = true;
          if (editImageBase64 && !extras.length) {
            const g2 = await verifyLocalizedImageEdit({ apiKey, sourceBase64: editImageBase64, sourceMime: editMimeType || 'image/png', resultBase64: alt, resultMime: 'image/png', userPrompt: cleanPrompt, allowStyleChange: explicitlyRequestsStyleChange(cleanPrompt), allowBroadChange: isSceneUpgrade });
            altOk = !!(g2 && (g2.ok || g2.reason === 'validation_unavailable'));
          }
          if (altOk) {
            const pick = await judgeBest({ apiKey, prompt: cleanPrompt, source: editImageBase64 ? { b64: editImageBase64, mime: editMimeType || 'image/png' } : null, a: { b64: imgPart.inlineData.data, mime: imgPart.inlineData.mimeType || 'image/png' }, b: { b64: alt, mime: 'image/png' } });
            if (pick === 'b') { imgPart = { inlineData: { data: alt, mimeType: 'image/png' } }; duoEngine = 'openai+judge'; }
            else duoEngine = 'gemini+judge';
          } else duoEngine = 'gemini';
        }
      } catch (e) { console.warn('[maha-image] duo skipped: ' + (e && e.message)); }
    }
    const caption = prayerPlan ? '' : await imageCaption(apiKey, cleanPrompt, imgPart.inlineData.data, imgPart.inlineData.mimeType || 'image/png', editImageBase64 || null, editMimeType || 'image/png');
    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      caption: caption || undefined,
      engine: rawMode ? 'nano-raw' : (duoEngine || 'gemini'),
      authoredText: prayerPlan ? prayerPlan.prayerText : undefined,
      visualPrompt: prayerPlan ? prayerPlan.visualBrief : undefined,
      prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined,
    });
  } catch (e) {
    await refundImageCharge();
    console.error('[maha-image] proxy exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'image_generation_failed', retryable: true });
  }
};
