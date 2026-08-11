// Vercel Serverless Function: image generation/editing for مها's voice call
// mode. Used when the caller asks Maha (by voice) to draw/create a picture,
// or to edit the picture she just made. Powered by Gemini's image-generation
// model (server-side owner key, GEMINI_API_KEY) - the only one of the 9
// providers that can actually output images.
const { checkAndConsume, DAILY_LIMIT, clientIp } = require('./_usage');
const { cleanImagePrompt, buildGenerationPrompt } = require('./image-prompt');
const { authorPrayerPlan } = require('./prayer-plan');

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
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
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
        prayerPlan = await authorPrayerPlan(apiKey, prayerRequest, { textPosition: body.textPosition });
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
    const pointsLib = require('./points.js');
    const mahaImgUser = pointsLib.verifyPointsToken(token);
    let mahaImgCharged = null;
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
      const { kvGetJSON, kvPutJSON } = require('./kv.js');
      const flagKey = 'db/points/guest-image/' + encodeURIComponent(guestId);
      const used = await kvGetJSON(flagKey);
      // 🎁 الضيف له 3 صور مجانية (العلم القديم بدون count = صورة واحدة مستهلكة)
      const usedCount = used ? (typeof used.count === 'number' ? used.count : 1) : 0;
      if (usedCount >= 3) { res.status(402).json({ error: 'guest_image_used' }); return; }
      await kvPutJSON(flagKey, { count: usedCount + 1, at: Date.now() });
    } else {
      res.status(401).json({ error: 'auth_required' });
      return;
    }

    const parts = [];
    // 500 حرفًا تكفي طلبًا عاديًا («قطة على كرسي»)، ولا تكفي وصفًا هندسيًا
    // يحمل عدد الطوابق وسعة الكراج والطراز والمواد — وهو ما يجعل الواجهة
    // تطابق المخطط. الوصف الهندسي يُسمح له بمساحة أوسع.
    const isArchitectural = !!(body && body.architectural);
    const cleanPrompt = cleanImagePrompt(prayerPlan ? prayerPlan.visualBrief : prompt).slice(0, isArchitectural ? 2400 : 1800);
    const extras = Array.isArray(extraImages) ? extraImages.filter((x) => x && x.data).slice(0, 5) : [];
    if (editImageBase64 && extras.length) {
      // 🧩 دمج عدة صور في تصميم واحد
      parts.push({ text: 'TASK: "' + cleanPrompt + '"\n\nYou are given ' + (extras.length + 1) + ' input images. COMPOSE them together into ONE single high-quality design exactly as the instruction asks. Rules:\n1. Every input image MUST appear in the final result - do not drop any of them.\n2. Keep each image\'s content recognizable and faithful (logos, faces, text stay pixel-faithful; do not redraw or distort them).\n3. Arrange them beautifully per the instruction (e.g. logo behind/above text, side by side, layered) with a premium, professional layout.\n4. Any Arabic text must remain correct and readable.\nOutput a single composed image.' });
      parts.push({ inlineData: { mimeType: editMimeType || 'image/png', data: editImageBase64 } });
      for (const x of extras) parts.push({ inlineData: { mimeType: x.mime || 'image/png', data: x.data } });
    } else if (editImageBase64) {
      parts.push({ text: 'TASK: "' + cleanPrompt + '"\n\nThis is a LOCALIZED EDIT of the attached image, not a re-creation. Rules:\n1. Change ONLY what the instruction explicitly asks. Everything else (faces, skin tone, facial features, clothing, colors, lighting, textures, proportions, composition) must be carried over from the original image pixel-accurately, as if untouched.\n2. Do NOT re-draw, re-light, re-color, smooth, beautify or stylize any region the instruction did not mention. Any person must remain 100% identical and recognizable.\n3. The instruction names specific item(s) - use exactly those item(s), exactly as named, with no substitution for a different brand/model/type/color of your own choosing. Do not simplify or generalize a specific name into a generic version of it.\n4. Preserve the original image resolution, sharpness and color fidelity.\n5. COLOR ACCURACY IS CRITICAL: keep the exact white balance, exposure, saturation and skin tones of the original. No brightening, no warming/cooling, no color grading, no filters of any kind.\n6. NEVER write, draw, translate or render the instruction text itself anywhere inside the image. Text already present in the image (signs, banners, labels, clothing, screens, packaging) must be reproduced character-for-character, in its original language and script, unless the instruction explicitly states the new wording to write.\n7. If the instruction is vague and names no specific element (e.g. \"change the image\", \"edit it\", \"make it better\"), return the image essentially unchanged and modify NO text whatsoever.\nRe-read the instruction now: "' + cleanPrompt + '". Output a single edited image.' });
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
    const reqBody = JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: editImageBase64 ? 0.15 : 0.65, imageConfig: { imageSize: '2K' } } });

    // Transient upstream errors (rate limit / overload) happen more often the
    // more edits pile up in one call. Retry a couple of times with a short
    // backoff before giving up, instead of surfacing the error to the user.
    let upstream, data;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody,
      });
      data = await upstream.json().catch(() => ({}));
      if (upstream.ok) break;
      const retryable = upstream.status === 429 || upstream.status === 500 || upstream.status === 503;
      console.error('[maha-image] upstream error attempt ' + attempt + '/' + maxAttempts + ' status=' + upstream.status + ' body=' + JSON.stringify(data));
      if (!retryable || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 700 * attempt));
    }

    if (!upstream.ok) {
      if (mahaImgCharged) await pointsLib.refundPoints(mahaImgCharged, pointsLib.COSTS.image);
      res.status(upstream.status).json({ error: (data && data.error && data.error.message) || 'Upstream error', retryable: upstream.status === 429 || upstream.status === 500 || upstream.status === 503 });
      return;
    }

    const respParts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    const imgPart = respParts.find((p) => p.inlineData && p.inlineData.data);
    if (!imgPart) {
      if (mahaImgCharged) await pointsLib.refundPoints(mahaImgCharged, pointsLib.COSTS.image);
      console.error('[maha-image] no image part in response: ' + JSON.stringify(data).slice(0, 2000));
      res.status(500).json({ error: 'لم يرجع الموديل صورة، حاول توصيف مختلف.' });
      return;
    }

    res.status(200).json({
      imageBase64: imgPart.inlineData.data,
      mimeType: imgPart.inlineData.mimeType || 'image/png',
      authoredText: prayerPlan ? prayerPlan.prayerText : undefined,
      visualPrompt: prayerPlan ? prayerPlan.visualBrief : undefined,
      prayerTopic: prayerPlan ? prayerPlan.topicLabel : undefined,
    });
  } catch (e) {
    console.error('[maha-image] proxy exception: ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
