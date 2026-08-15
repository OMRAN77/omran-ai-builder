// Vercel Serverless Function: image generation/editing for مها's voice call
// mode. Used when the caller asks Maha (by voice) to draw/create a picture,
// or to edit the picture she just made. Powered by Gemini's image-generation
// model (server-side owner key, GEMINI_API_KEY) - the only one of the 9
// providers that can actually output images.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { cleanImagePrompt, buildGenerationPrompt, buildEditPrompt, buildSceneUpgradePrompt, explicitlyRequestsStyleChange } = require('./image-prompt');
const { verifyLocalizedImageEdit, publicGuardError } = require('./image-edit-guard');
const { authorPrayerPlan } = require('./prayer-plan');
const { fetchImageWithRetry, isImageTimeoutError } = require('./image-fetch');

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
    const isReimagine = !!editImageBase64 && !isSceneUpgrade && /فكرة\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|فكره\s*(ثانية|ثانيه|مختلفة|مختلفه|جديدة|جديده|غير)|غيّ?ر\s*الفكرة|بشكل\s*مختلف\s*تمام|مختلف\s*تمام|تصميم\s*ثاني|ستايل\s*ثاني|بدّ?ل\s*(الفكرة|التصميم|الستايل)|different\s*(idea|concept|style)|new\s*concept|another\s*(idea|take|concept)|reimagine/i.test(String(prompt || ''));
    const promptLimit = isArchitectural ? 2400 : (editImageBase64 ? 8000 : 1800);
    const cleanPrompt = cleanImagePrompt(prayerPlan ? prayerPlan.visualBrief : prompt).slice(0, promptLimit);
    const extras = Array.isArray(extraImages) ? extraImages.filter((x) => x && x.data).slice(0, 5) : [];
    if (editImageBase64 && extras.length) {
      // 🧩 دمج عدة صور في تصميم واحد
      parts.push({ text: 'TASK: "' + cleanPrompt + '"\n\nYou are given ' + (extras.length + 1) + ' input images. COMPOSE them together into ONE single high-quality design exactly as the instruction asks. Rules:\n1. Every input image MUST appear in the final result - do not drop any of them.\n2. Keep each image\'s content recognizable and faithful (logos, faces, text stay pixel-faithful; do not redraw or distort them).\n3. Arrange them beautifully per the instruction (e.g. logo behind/above text, side by side, layered) with a premium, professional layout.\n4. Any Arabic text must remain correct and readable.\nOutput a single composed image.' });
      parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
      for (const x of extras) parts.push({ inlineData: { mimeType: x.mime || 'image/png', data: x.data } });
    } else if (editImageBase64) {
      parts.push({ text: isSceneUpgrade ? buildSceneUpgradePrompt(cleanPrompt)
        : (isReimagine
          ? ('TASK: "' + cleanPrompt + '"\n\nThe attached image is ONLY inspiration for the SUBJECT. Create a COMPLETELY NEW image of the same subject with a clearly DIFFERENT concept: new composition, new viewpoint, new background, new lighting and a fresh creative idea — the result must NOT look like a copy or minor edit of the source. Keep any real faces, logos or brand marks faithful if they are the subject. Quality bar: breathtaking, award-winning, magazine-cover grade, tack-sharp, professional cinematic lighting, no toy-like or amateur rendering.')
          : buildEditPrompt(cleanPrompt)) });
      parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
    } else {
      parts.push({ text: buildGenerationPrompt(cleanPrompt, {
        architectural: isArchitectural,
        prayerArt: !!prayerPlan,
        reserveTextArea: body.reserveTextArea === true,
        textPosition: body.textPosition
      }) });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=' + apiKey;
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
    if (!editImageBase64) imageConfig.aspectRatio = isArchitectural ? '16:9' : pickAspect(cleanPrompt);
    const reqBody = JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: editImageBase64 ? (isSceneUpgrade ? 0.5 : (isReimagine ? 0.9 : 0.15)) : 0.85, imageConfig } });

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
      await refundImageCharge();
      const timedOut = isImageTimeoutError(imageResult.error);
      const retryable = timedOut || !!(upstream && (upstream.status === 429 || upstream.status >= 500));
      const errorCode = timedOut ? 'image_generation_timeout' : (retryable ? 'image_generation_busy' : 'image_generation_failed');
      console.error('[maha-image] upstream image request failed after ' + imageResult.attempts + ' attempt(s)' + (upstream ? ' status=' + upstream.status : ''));
      res.status(timedOut ? 504 : 502).json({ error: errorCode, retryable });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      await refundImageCharge();
      console.error('[maha-image] no image part in response: ' + JSON.stringify(data).slice(0, 2000));
      res.status(500).json({ error: 'لم يرجع الموديل صورة، حاول توصيف مختلف.' });
      return;
    }

    if (editImageBase64 && !extras.length) {
      const guard = await verifyLocalizedImageEdit({
        apiKey,
        sourceBase64: editImageBase64,
        sourceMime: editMimeType || 'image/png',
        resultBase64: imgPart.inlineData.data,
        resultMime: imgPart.inlineData.mimeType || 'image/png',
        userPrompt: cleanPrompt,
        allowStyleChange: explicitlyRequestsStyleChange(cleanPrompt),
        allowBroadChange: isSceneUpgrade,
      });
      if (!guard.ok) {
        await refundImageCharge();
        const unavailable = guard.reason === 'validation_unavailable';
        console.error('[maha-image] rejected edited image: ' + guard.reason);
        res.status(unavailable ? 502 : 422).json({ error: publicGuardError(guard), retryable: unavailable });
        return;
      }
    }

    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
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
