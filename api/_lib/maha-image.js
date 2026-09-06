// Vercel Serverless Function: image generation/editing for مها's voice call
// mode. Used when the caller asks Maha (by voice) to draw/create a picture,
// or to edit the picture she just made. Powered by Gemini's image-generation
// model (server-side owner key, GEMINI_API_KEY) - the only one of the 9
// providers that can actually output images.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { cleanImagePrompt, isExplicitRawImagePrompt, stripRawImagePrefix, shouldUseRawImagePrompt, buildGenerationPrompt, buildEditPrompt, buildElevatePrompt, buildReimaginePrompt, creativeRawEnabled, rawCreativePrompt, buildLetterSwapPrompt, isTextEditRequest, isPureTextRemoval, buildSceneUpgradePrompt, buildRestylePrompt, explicitlyRequestsStyleChange } = require('./image-prompt');
/* v-nano-pro-edit: نيّات التعديل (أسلوب/فكرة مختلفة/أقوى/نفس الصورة) في وحدة واحدة قابلة للاختبار،
   تُقرأ من نصّ المستخدم نفسه (body.userText) لا من أمر أعاد النموذج صياغته بالإنجليزية. */
const { detectEditIntent } = require('./image-intent');
const { classifyEditIntentLLM, llmIntentEnabled } = require('./image-intent-llm');
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');
const { judgeBest, duoEnabled, bestOfCount } = require('./image-judge');
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
    const { prompt, editImageBase64, editMimeType, editMaskBase64, extraImages, token, guestId } = body;
    /* v-nano-pro-edit: كلمات المستخدم الأصلية (العميل يرسلها مع الأمر) — عليها تُقرأ النيّة */
    const userText = typeof body.userText === 'string' ? body.userText.replace(/\s*\[[^\[\]]*\]\s*$/, '').trim().slice(0, 1200) : '';
    /* v-image-memory (خطة المالك ٦ سبتمبر، البند ٣: «ذاكرة محادثة للصور»): العميل يرسل آخر أدوار سلسلة التعديل (نصّ الطلب +
       مصغّر النتيجة، ومصغّر المصدر الأصلي في أول دور) فيرى نموذج الصور ما طُلب وما أخرجه قبل هذا الدور — «أفضل من هذي»،
       «لا، رجّع الخلفية»، «خلها أهدأ» تصير محادثة متصلة كتطبيق Gemini. أربعة أدوار كحد أقصى، كل صورة ≤ 420KB. */
    const __okMime = function (m) { return /^image\/(?:jpeg|png|webp)$/.test(String(m || '')) ? m : 'image/jpeg'; };
    const history = Array.isArray(body.history) ? body.history
      .filter(function (h) { return h && typeof h.text === 'string' && typeof h.resultBase64 === 'string' && h.resultBase64.length > 100 && h.resultBase64.length <= 420000; })
      .slice(-4)
      .map(function (h) { return { text: h.text.replace(/\s*\[[^\[\]]*\]\s*$/, '').trim().slice(0, 400), resultBase64: h.resultBase64, resultMime: __okMime(h.resultMime), sourceBase64: (typeof h.sourceBase64 === 'string' && h.sourceBase64.length > 100 && h.sourceBase64.length <= 420000) ? h.sourceBase64 : '', sourceMime: __okMime(h.sourceMime) }; }) : [];
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
    const exactTextEdit = !!(body && body.exactTextEdit === true && editImageBase64 && editMaskBase64);
    // v605: ترقية مشهد كاملة يطلبها المستخدم صراحةً («أعطني الأفضل»).
    /* v-nano-pro-edit (المالك ٥ سبتمبر: «عندي نانو وجيمي وكل المفاتيح وآخر شي النتيجة صفر —
       الصورة المزخرفة من نانو والثانية من التطبيق»): النيّة تُقرأ من كلمات المستخدم نفسه
       (userText) حين يرسلها العميل، وإلا من الأمر. القاموس كله في image-intent.js:
       - restyle   = «كرتون/3d/أنيمي…» تحويل أسلوب كامل.
       - reimagine = «فكرة ثانية/مختلفة» مشهد جديد كليًّا.
       - elevate   = «أقوى/أفخم/أرقى/أجمل/طوّرها/حسّنها/نسخة أفضل…» الفكرة نفسها مرفوعة بقوة.
       - sameImage = «نفس الصورة/زيها بالضبط» يوقف الإبداع ويبقي الحرفية.
       «خلها أفخم/عطني الأفضل» يصل من العميل بعلم sceneUpgrade المصمَّم لغرفة/مكان حقيقي
       (نفس المكان ونفس الزاوية، صورة فوتوغرافية) — على كرت/تصميم/لوحة كان يحوّل الكرت إلى
       صورة فوتوغرافية باهتة، وهو ما رآه المالك. لذلك يُحسم أدناه بسؤال خاطف: مكان حقيقي أم لا. */
    const intentText = userText || String(prompt || '');
    const __intent = detectEditIntent(intentText);
    /* v-intent-llm: التعابير النمطية مرساة والنموذج يوسّع — طلب قصير على صورة مصدر لم تلتقط النية له مسارًا إبداعيًا
       ولا تبديل/حذف نصّ يُسأل عنه flash (مهلة ٦ ثوانٍ)؛ جواب واثق فقط يرفعه إلى ترقية/فكرة/أسلوب/نفس الصورة. */
    if (editImageBase64 && !(body && body.sceneUpgrade === true) && !__intent.restyle && !__intent.reimagine && !__intent.elevate && !__intent.sameImage
        && intentText.trim().length <= 220 && !isTextEditRequest(intentText) && !isPureTextRemoval(intentText) && llmIntentEnabled(process.env)) {
      const __llm = await classifyEditIntentLLM({ apiKey, text: intentText });
      if (__llm) { __intent[__llm.lane === 'same' ? 'sameImage' : __llm.lane] = true; console.log('[maha-image] intent-llm: ' + __llm.lane + ' (' + __llm.confidence + ')'); }
    }
    let isSceneUpgrade = !!(body && body.sceneUpgrade === true && editImageBase64);
    const isRestyle = !!editImageBase64 && !isSceneUpgrade && __intent.restyle;
    const isReimagine = !!editImageBase64 && !isSceneUpgrade && !isRestyle && __intent.reimagine;
    let isElevate = !!editImageBase64 && !isSceneUpgrade && !isRestyle && !isReimagine && __intent.elevate;
    /* v-letter-swap: «غير حرف م حط ع» / «بدل الاسم» / «اكتب كلمة…» على صورة مصدر = تبديل نصّي في مكانه.
       يذهب إلى نانو بنانا برو (الأقوى في الحروف العربية) بتعليمة قصيرة كتطبيق Gemini، وgpt-image منافسًا بالحكم. */
    /* «شيل الاسم كامل» / «بدون أسماء» = حذف نصّ صِرف: تعديل عادي بقاعدة REMOVE TEXT، لا تبديل حرف (كان يفشل بـ«لم أستطع تحديد الحرف») */
    const isTextRemove = !!editImageBase64 && !isSceneUpgrade && !isRestyle && !isReimagine && !isElevate && isPureTextRemoval(intentText);
    const isTextSwap = !!editImageBase64 && !isSceneUpgrade && !isRestyle && !isReimagine && !isElevate && !isTextRemove && (body.textSwap === true || isTextEditRequest(intentText));
    async function sourceIsRealPlacePhoto() {
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            contents: [{ parts: [
              { text: 'Answer with exactly one word, PLACE or OTHER. PLACE only if this image is a real camera photograph of a physical place: a room, interior, house or building exterior, garden, street, shop or venue. OTHER for designed graphics, cards, posters, banners, icons, illustrations, artwork, 3D renders, logos, screenshots, product shots and portraits of people.' },
              { inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } },
            ] }],
            generationConfig: { temperature: 0, maxOutputTokens: 4 },
          }),
        });
        const d = await r.json().catch(function () { return null; });
        const txt = String((((((d || {}).candidates || [])[0] || {}).content || {}).parts || []).map(function (p) { return p.text || ''; }).join(' '));
        if (/\bPLACE\b/i.test(txt)) return true;
        if (/\bOTHER\b/i.test(txt)) return false;
        return null;
      } catch (e) { return null; }
    }
    if (isSceneUpgrade && !__intent.placeUpgradeHint && !__intent.sameImage) {
      const __place = await sourceIsRealPlacePhoto();
      /* تعذّر السؤال (مهلة/عطل) بلا أي تلميح مكان = نعامل المصدر كتصميم لا كغرفة — السلوك الأقرب لطلب المالك */
      if (__place !== true) { isSceneUpgrade = false; isElevate = true; }
    }
    const promptLimit = isArchitectural ? 2400 : (editImageBase64 ? 8000 : 1800);
    /* الوضع المحسّن هو الافتراضي. «نانو:» يظل مخرجًا صريحًا لإرسال النص الخام،
       ويمكن إعادة السلوك القديم مؤقتًا عبر IMAGE_RAW_DEFAULT=on. */
    const rawMode = shouldUseRawImagePrompt(prompt, {
      prayerPlan,
      envDefault: process.env.IMAGE_RAW_DEFAULT,
    });
    const cleanPrompt = rawMode
      ? stripRawImagePrefix(prompt).slice(0, 4000)
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
      /* v-raw-words: كلمات المستخدم الحرفية (intentText) أولًا في المسارات الإبداعية؛ IMAGE_RAW_CREATIVE=on يرسلها وحدها كتطبيق Gemini */
      const __rawCreative = creativeRawEnabled(process.env) && (isElevate || isReimagine || isRestyle);
      parts.push({ text: __rawCreative ? rawCreativePrompt(cleanPrompt, intentText)
        : isSceneUpgrade ? buildSceneUpgradePrompt(cleanPrompt)
        : (isRestyle ? buildRestylePrompt(cleanPrompt, intentText)
        : (isElevate ? buildElevatePrompt(cleanPrompt, intentText)
        : (isTextSwap ? buildLetterSwapPrompt(cleanPrompt)
        : (isReimagine ? buildReimaginePrompt(cleanPrompt, intentText)
          : buildEditPrompt(cleanPrompt))))) });
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
    const __explicitRaw = isExplicitRawImagePrompt(prompt);
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
    /* v-nano-pro-edit: الإبداع (أقوى/فكرة مختلفة/تحويل أسلوب/ترقية مشهد/الوضع الخام) على نانو بنانا
       برو (gemini-3-pro-image بدقّة 2K) — وهو المحرّك الذي أخرج للمالك صورته المزخرفة في تطبيق
       Gemini؛ نانو 2.5 كان يرجّع صورة باهتة لموضوع الكرت. التعديل الموضعي (غيّر اللون/شيل الخلفية)
       يبقى على نانو 2.5 السريع الأمين. IMAGE_CREATIVE_MODEL يبدّل بلا نشر، والإنقاذ (نانو 2.5 ثم
       gpt-image) يبقى كما هو عند فشل برو. */
    const creativeModel = (process.env.IMAGE_CREATIVE_MODEL || 'gemini-3-pro-image').trim();
    /* دمج عدة صور (extras) يصل برو أيضًا حين تكون النيّة إبداعية — برو يتعامل مع مراجع متعددة أفضل بكثير */
    const isCreativeEdit = !!editImageBase64 && (isElevate || isReimagine || isRestyle || isSceneUpgrade || __pureRaw);
    /* تبديل الحروف على برو أيضًا: نانو 2.5 يكسر الحروف العربية وبرو يبدّلها في مكانها (لقطة المالك من Gemini) */
    const primaryModel = editImageBase64 ? ((isCreativeEdit || isTextSwap) ? creativeModel : editModel) : creativeModel;
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
    /* v-4k (المالك: «الجودة قبل التكلفة»): طلب صريح 4K/للطباعة/دقة عالية يرفع إخراج برو إلى 4K (≈ ضعف سعر 2K) */
    const __want4K = /(?:^|[\s،,])(?:4k|٤k|للطباعة|طباعة|دقة\s*عالية|عالية\s*الدقة|أعلى\s*دقة|اعلى\s*دقة)(?=$|[\s،,.!؟?])|\b(?:4k|high[-\s]?res(?:olution)?|print[-\s]?(?:ready|quality))\b/i.test(intentText + ' ' + String(prompt || ''));
    const imageConfig = { imageSize: __want4K ? '4K' : '2K' };
    if (!editImageBase64) imageConfig.aspectRatio = (pipelineActive && pipelineRewrite && pipelineRewrite.aspect) ? pipelineRewrite.aspect : (isArchitectural ? '16:9' : pickAspect(cleanPrompt));
    /* نانو بنانا (2.5-flash-image) لا يدعم imageSize:'2K' — نرسل له صيغة نظيفة
       بلا imageConfig كي لا يرفض الطلب (400). لكنه يحتاج responseModalities:['IMAGE']
       كي يرجّع صورة دائمًا لا نصًّا (سبب gemini_no_image_part) — وهذا ما يفعله
       تطبيق Gemini الأصلي، فهو مفتاح تطابق الجودة/الموثوقية. */
    const genConfigFor = function (extra) {
      const cfg = Object.assign({}, extra);
      if (nanoPrimary) cfg.responseModalities = ['IMAGE'];
      else cfg.imageConfig = imageConfig;
      /* v-nano-pro-edit: توصية Google لجيل Gemini 3 — الحرارة الافتراضية (1.0)؛ خفضها يضعف النتيجة ويكرّرها.
         نانو 2.5 يبقى بحرارته المنخفضة للتعديل الموضعي الأمين. */
      if (!nanoPrimary) delete cfg.temperature;
      return cfg;
    };
    /* v-image-memory: الأدوار السابقة كسياق حواري فعلي (user → model) قبل الدور الحالي — للتعديل على صورة واحدة فقط */
    const __historyTurns = (editImageBase64 && !extras.length && history.length) ? history.reduce(function (acc, h) {
      const up = [{ text: h.text || '(image)' }];
      if (h.sourceBase64) up.push({ inlineData: { mimeType: h.sourceMime, data: h.sourceBase64 } });
      acc.push({ role: 'user', parts: up });
      acc.push({ role: 'model', parts: [{ inlineData: { mimeType: h.resultMime, data: h.resultBase64 } }] });
      return acc;
    }, []) : [];
    if (__historyTurns.length) parts.unshift({ text: 'Conversation context: the earlier turns show what the user asked before and the images you produced. The image attached to THIS turn is the current source — apply the current request to it, building on that history (e.g. "better than this", "bring the old background back"). Never return an earlier result unchanged.' });
    const __contents = __historyTurns.length ? __historyTurns.concat([{ role: 'user', parts }]) : [{ parts }];
    const reqBody = JSON.stringify(__pureRaw
      ? { contents: __contents, generationConfig: genConfigFor({}) }
      : { contents: __contents, generationConfig: genConfigFor({ temperature: editImageBase64 ? (isSceneUpgrade ? 0.5 : (isReimagine ? 0.9 : (isElevate ? 0.85 : (isRestyle ? 0.6 : 0.15)))) : 0.85 }) });

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
          form.append('image', new Blob([bytes], { type: editMimeType || 'image/jpeg' }), exactTextEdit ? 'photo.png' : 'photo.jpg');
          if (exactTextEdit) {
            const maskBytes = Buffer.from(editMaskBase64, 'base64');
            form.append('mask', new Blob([maskBytes], { type: 'image/png' }), 'mask.png');
          }
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
            /* responseModalities:['IMAGE'] كي يرجّع صورة دائمًا لا نصًّا (سبب gemini_no_image_part) */
            body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseModalities: ['IMAGE'] } }),
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

    // Never let an exact text replacement fall through to an unmasked renderer.
    // The client also composites only the selected region over the source.
    if (exactTextEdit) {
      const exactB64 = await openaiRescueImage();
      if (exactB64) {
        res.status(200).json({ imageBase64: exactB64, mimeType: 'image/png', engine: 'openai-masked' });
        return;
      }
      await refundImageCharge();
      res.status(502).json({ error: 'image_generation_busy', retryable: true });
      return;
    }

    // v-img-textwise: مصدر نصّي كثيف → gpt-image-1 عالي الدقة أولًا؛
    // فشله أو غيابه يُكمل مسار Gemini المعتاد بلا أي خسارة.
    /* v-img-textwise-gen (صورة ChatGPT عند المالك: واجهة أدوات كاملة بعناوين
       عربية سليمة — gpt-image ينفّذها وGemini يكسر الحروف): طلب توليد جديد
       يذكر نصوصًا/عناوين/أيقونات/واجهة/شاشة يبدأ أيضًا بـgpt-image. */
    const __textCueRe = /نص|كتاب|مكتوب|عنوان|عناوين|أيقون|ايقون|واجهة|شاشة|تطبيق|قائمة|كلمات|حروف|خط\s*عرب|\btext\b|label|icon|\bui\b|screen|interface|\bapp\b|menu|typograph|lettering|caption/i;
    /* v-textedit-raw: تعديل مصدرٍ نصّيٍّ كثيف (لقطة شاشة/شعار) هو بالضبط ما
       يكسر فيه Gemini الحروف العربية، وgpt-image-1 بـinput_fidelity=high ينقلها
       كما هي. يعمل المسار أيضًا عند تفعيل الوضع الخام من البيئة؛ أمّا طلب
       «نانو:» الصريح فيبقى خامًا بالكامل كما طلب المستخدم. */
    /* v-bold-wins (المالك: «أقوى/أفضل من هذي — يرجّع نفس الصورة»): طلبات الإبداع
       (إعادة تصوّر/تحويل أسلوب) يجب ألّا يتدخّل فيها محرّك «حفظ النص» لأنه يثبّت
       الصورة كما هي؛ نتركها لنانو ليعطي نتيجة جريئة فعلًا. */
    /* v-elevate-pro-always (لقطة المالك: شبكة أيقونات + «عطني أفضل من هذي» ×٣ = الصورة نفسها): لو صنّف الفاحص
       المصدر «شاشة تطبيق» تحوّلت الترقية إلى gpt-image المحافظ (input_fidelity=high) فعادت الصورة كما هي.
       الترقية تذهب إلى نانو بنانا برو دائمًا — وهو يحفظ الحروف العربية (بدّل حرفًا في لقطة واجهة بدقّة اليوم)؛
       مسار النصّ الكثيف يبقى للتعديل الموضعي وتبديل الحروف حيث الحرفية هي المطلوب. */
    /* دمج عدة صور لا يمرّ بمسار gpt-image الأحادي (يُسقط الصور الإضافية) */
    /* v-nano-pro-edit: قرار المزدوج يُحسم هنا مرة واحدة — الترقية مستثناة منه، فلا يُترك نداء gpt-image معلّقًا بلا حكم */
    const __duoWouldRun = duoEnabled() && !prayerPlan && !pipelineActive && !isReimagine && !isRestyle && !isElevate && !extras.length; /* دمج عدة صور: المنافس الأحادي يُسقط الصور الإضافية */
    /* v-letter-swap: تبديل حرف على لقطة نصّية لا يُختطف إلى gpt-image وحده — برو يقوده، وgpt-image ينافس بالحكم فقط عند تفعيل المزدوج */
    const __textRoute = !!process.env.OPENAI_API_KEY && !prayerPlan && !isReimagine && !isRestyle && !isSceneUpgrade && !isElevate && !extras.length && (!isTextSwap || __duoWouldRun)
      && (editImageBase64 ? await sourceLooksTextDense() : (!rawMode && __textCueRe.test(cleanPrompt)));
    /* v-duo-textroute (لقطة المالك: لقطة واجهة + «عطني أفضل ونفس الفكرة» → فنجان قهوة): مسار النصّ الكثيف كان
       يرجع ناتج gpt-image وحده بلا Gemini ولا حكم. الآن يعمل المحرّكان معًا هنا أيضًا والحكم يختار. */
    let densePromise = null;
    if (__textRoute) {
      if (__duoWouldRun) {
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
    const duoOn = __duoWouldRun && (!__textRoute || !!densePromise);
    const duoP = duoOn ? (densePromise || openaiRescueImage().catch(function () { return null; })) : null;
    let duoEngine = '';
    // Image generation normally takes 35–50 seconds, so it must bypass the
    // shared 30-second fetch guard. Retry transient failures inside this one
    // request; the user should not have to resend the same prompt.
    /* v-best-of (خطة المالك ٦ سبتمبر: «نسختان بالتوازي واختيار الأفضل» — الجودة قبل التكلفة): في المسارات الإبداعية يُطلب مرشّح
       ثانٍ من المحرّك نفسه بالتوازي مع الأول، والحكم الإبداعي يختار الأجرأ والأكمل مع الوفاء بالموضوع. IMAGE_BEST_OF=1 يوقفه. */
    const __altP = (isCreativeEdit && !pipelineActive && !prayerPlan && bestOfCount(process.env) >= 2)
      ? fetchImageWithRetry({ url: endpoint, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody }, onRetry: function () {} }).catch(function () { return null; })
      : null;
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
      if (nanoB64) {
        /* v-nano-pro-edit: فشل المحرّك الأساسي (برو غالبًا) ونجح نانو 2.5 — يُسجَّل في لوحة المالك بدل أن يختفي وراء نتيجة باهتة
           تشبه الشكوى الأصلية (مفتاح بلا برو، اسم موديل، 400 على الإعدادات…). */
        try { require('./log-error.js').logError('maha-image:primary-fallback', new Error(primaryModel + ' failed'), { model: primaryModel, status: upstream ? ('status=' + upstream.status) : 'no-response', creative: isCreativeEdit, detail: String((data && data.error && data.error.message) || '').slice(0, 160) }); } catch (e) { /* التسجيل لا يعطّل الرد */ }
        res.status(200).json({ imageBase64: nanoB64, mimeType: 'image/png', engine: 'gemini-nano-banana', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined }); return;
      }
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
      if (nanoB64b) {
        try { require('./log-error.js').logError('maha-image:primary-fallback', new Error(primaryModel + ' returned no image part'), { model: primaryModel, status: 'no-image-part', creative: isCreativeEdit }); } catch (e) { /* التسجيل لا يعطّل الرد */ }
        res.status(200).json({ imageBase64: nanoB64b, mimeType: 'image/png', engine: 'gemini-nano-banana', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined }); return; }
      const rescuedB64b = duoP ? await duoP : await openaiRescueImage();
      if (rescuedB64b) { res.status(200).json({ imageBase64: rescuedB64b, mimeType: 'image/png', engine: 'openai', authoredText: prayerPlan ? prayerPlan.prayerText : undefined, prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined }); return; }
      await refundImageCharge();
      console.error('[maha-image] no image part in response: ' + JSON.stringify(data).slice(0, 2000));
      try { require('./log-error.js').logError('maha-image:no-image-part', new Error('gemini_no_image_part'), { nano: lastNanoErr || 'no-nano', openai: lastRescueErr || 'no-rescue' }); } catch (e) { /* التسجيل لا يعطّل الرد */ }
      res.status(500).json({ error: 'لم يرجع الموديل صورة، حاول توصيف مختلف.' });
      return;
    }

    /* v-guard-off-creative (المالك ٦ سبتمبر: «أوقفت النتيجة لأنها غيّرت هوية الشخص» على طلب إبداعي — وهو يقارن بنانو الأصلي
       الذي لا يحجب شيئًا): الترقية والفكرة الجديدة وتحويل الأسلوب وترقية المكان تعيد الرسم بطبيعتها، فلا حارس عليها.
       التعديل الموضعي (اسم/حرف/لون) يبقى محروسًا: الوجه لا يتبدّل عند تغيير الاسم. */
    if (editImageBase64 && !extras.length && !rawMode && !isCreativeEdit) {
      const guard = await verifyLocalizedImageEdit({
        apiKey,
        sourceBase64: editImageBase64,
        sourceMime: editMimeType || 'image/png',
        resultBase64: imgPart.inlineData.data,
        resultMime: imgPart.inlineData.mimeType || 'image/png',
        userPrompt: cleanPrompt,
        /* v-guard-creative: بعد أن صار الأمر المهندس هو الافتراضي يعمل الحارس على كل تعديل — تحويل الأسلوب («عدل 3d»)
           والترقية والفكرة المختلفة تغيّر الوسيط بطبيعتها فلا تُرفض لأجله؛ الهوية (نفس الشخص) تبقى مفروضة على الجميع. */
        allowStyleChange: explicitlyRequestsStyleChange(cleanPrompt) || isRestyle || isReimagine || isElevate,
        allowBroadChange: isSceneUpgrade || isElevate || isReimagine || isRestyle,
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
          const retryReqBody = JSON.stringify({ contents: [{ parts: retryParts }], generationConfig: genConfigFor({ temperature: 0.85 }) });
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

    /* v-best-of: دمج المرشّح الثاني (المحرّك نفسه) بالحكم الإبداعي — أي تعثّر يُبقي الأول */
    if (__altP) {
      try {
        const altRes = await __altP;
        const altParts = (((((altRes && altRes.data) || {}).candidates || [])[0] || {}).content || {}).parts || [];
        const altImg = (altRes && altRes.response && altRes.response.ok) ? altParts.find(function (p) { return p.inlineData && p.inlineData.data; }) : null;
        if (altImg) {
          const pick = await judgeBest({ apiKey, prompt: cleanPrompt, creative: true, source: { b64: editImageBase64, mime: editMimeType || 'image/png' }, a: { b64: imgPart.inlineData.data, mime: imgPart.inlineData.mimeType || 'image/png' }, b: { b64: altImg.inlineData.data, mime: altImg.inlineData.mimeType || 'image/png' } });
          if (pick === 'b') imgPart = altImg;
          duoEngine = 'gemini x2+judge';
        }
      } catch (e) { console.warn('[maha-image] best-of skipped: ' + (e && e.message)); }
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
      /* v-nano-pro-edit: اسم المحرّك الحقيقي — برو أم 2.5 — ليراه المالك في شريط الحالة */
      engine: duoEngine ? (nanoPrimary ? duoEngine : duoEngine.replace(/^gemini/, 'nano-pro')) : (nanoPrimary ? (__pureRaw ? 'nano-raw' : 'nano') : (__pureRaw ? 'nano-pro-raw' : 'nano-pro')),
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
