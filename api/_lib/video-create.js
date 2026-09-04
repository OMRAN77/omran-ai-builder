// Vercel Serverless Function: starts an AI video generation task on Runway
// (text-to-video, Gen-4.5) using the site owner's own server-side API key
// (RUNWAY_API_KEY env var). Requires a logged-in account and enforces a
// small daily quota per account (see api/_videoUsage.js) because each
// generated video costs the owner real money.
const { checkVideoQuota, consumeVideo, checkOwnerBypass } = require('./_videoUsage');
const { pickKey, encodeTaskId, clearStuckTask, saveLastTask, RUNWAY_API_BASE } = require('./runway-keys');

const RUNWAY_VERSION = '2024-11-06';

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
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    let { promptText, ratio, duration, style, token, longMode, imageBase64, imageMime } = body;
    /* v-video-trends */
    if (body.trend) {
      const built = require('./video-trends.js').buildTrendPrompt(String(body.trend), Object.assign({}, body.params || {}, { hasImage: !!(imageBase64 && String(imageBase64).trim()) }));
      if (!built) { res.status(400).json({ error: 'unknown trend' }); return; }
      promptText = built.prompt; ratio = ratio || built.ratio;
    }

    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    // "Long video" mode (many chained scenes for a multi-minute video) is
    // restricted to the owner's own account and bypasses the small daily
    // quota entirely, since it intentionally burns many scenes in one run.
    // Everyone else still goes through the normal per-account daily limit.
    let usageResult;
    if (longMode === true) {
      usageResult = await checkOwnerBypass(token);
      if (!usageResult.allowed) {
        if (usageResult.reason === 'auth') {
          res.status(401).json({ error: 'auth_required' });
        } else {
          res.status(403).json({ error: 'owner_only' });
        }
        return;
      }
    } else {
      usageResult = await checkVideoQuota(token);
      if (!usageResult.allowed) {
        if (usageResult.reason === 'auth') {
          res.status(401).json({ error: 'auth_required' });
        } else {
          res.status(429).json({ error: 'daily_limit_reached' });
        }
        return;
      }
    }

    // 💰 نظام النقاط: فيديو Runway = 60 نقطة لغير المالك. يُخصم قبل
    // الإنشاء ويُسترجع تلقائيًا لو فشل الطلب عند Runway.
    const pointsLib = require('./points.js');
    let chargedUser = null;
    if (usageResult.username && !pointsLib.isOwnerUsername(usageResult.username)) {
      const gateRw = pointsLib.requireConfirmation(body, pointsLib.COSTS.runway_video, 'فيديو Runway');
      if (gateRw) { res.status(gateRw.status).json(gateRw.payload); return; }
      const pay = await pointsLib.spendPoints(usageResult.username, pointsLib.COSTS.runway_video, 'runway_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.runway_video, points: pay.points || 0 });
        return;
      }
      chargedUser = usageResult.username;
    }

    const picked = pickKey();
    if (!picked) {
      res.status(500).json({ error: 'Server is missing RUNWAY_API_KEY' });
      return;
    }
    const apiKey = picked.key;

    const allowedRatios = ['1280:720', '720:1280'];
    const finalRatio = allowedRatios.includes(ratio) ? ratio : '1280:720';
    let finalDuration = parseInt(duration, 10);
    if (!Number.isFinite(finalDuration)) finalDuration = 5;
    // Runway only accepts 5 or 10 seconds — snap anything else
    finalDuration = finalDuration <= 7 ? 5 : 10;

    // الأنيمي: نصّ واضح بأنه رسوم متحركة ثنائية الأبعاد لا يُشبه الواقع أبداً
    // الواقعي: نرفض صراحةً كل أشكال الرسوم والديجيتال آرت حتى يلتزم Runway
    const styleSuffix = (style === 'anime')
      ? ', 2D anime cartoon animation, illustrated characters, bold outlines, cel-shaded, Studio Ghibli style, NOT realistic, NOT photographic'
      : ', ultra-realistic live-action footage, real camera recording, natural lighting, photographic quality, shot on 4K camera, cinematic depth of field — absolutely no cartoon, no animation, no illustration, no digital art, no anime, no CGI characters';
    // Runway hard limit: promptText <= 1000 chars TOTAL (base + suffix)
    let finalPrompt = String(promptText).trim().slice(0, 1000 - styleSuffix.length) + styleSuffix;

    // Auto-cancel any previous stuck task on this key so it doesn't hog the
    // account's single concurrency slot forever (see runway-keys.js).
    await clearStuckTask(picked.index, apiKey);

    // 🎬 صورة مرفقة → image_to_video (تحريك الصورة نفسها)، بدونها → text_to_video
    const useImage = !!(imageBase64 && String(imageBase64).length > 50);
    // v-runway-host: مفاتيح الـAPI العامة تخدمها api.dev.runwayml.com حصرًا —
    // النداء على api.runwayml.com يرجع «Incorrect hostname for API key».
    const endpoint = useImage
      ? RUNWAY_API_BASE + '/v1/image_to_video'
      : RUNWAY_API_BASE + '/v1/text_to_video';
    // عندما تُرفق صورة نُضيف تعليمة الحفاظ على هوية الشخص في مقدمة الـ prompt
    // بدونها يتجاهل Runway الصورة ويولّد شخصية عشوائية مختلفة تمامًا
    if (useImage) {
      const preservePrefix = 'CRITICAL: The person in the reference image is the HERO of this video. Keep their EXACT face, identity, clothing, hair, and body UNCHANGED. Place them in the CENTER of the frame at medium shot distance — same framing and camera angle in every scene. Never change, replace, or obscure the hero. ';
      finalPrompt = (preservePrefix + finalPrompt).slice(0, 1000);
    }

    /* v-runway-model (لقطات المالك: «Validation of body failed … expected one of
       gen4.5 | kling3.0_pro | veo3.1 …»): Runway أوقف اسم gen4_turbo فصار كل
       فيديو يفشل بخطأ خام. الاسم الحالي gen4.5، ولو غيّروه مجددًا نقرأ قائمة
       الأسماء المقبولة من خطأهم نفسه ونعيد الطلب تلقائيًا بأفضل متاح — بلا
       تدخّل يدوي في كل مرة يغيّر فيها Runway نماذجه. */
    const RUNWAY_PREF = ['gen4.5', 'gen4_turbo', 'veo3.1_fast', 'veo3.1', 'kling3.0_standard', 'kling2.5_turbo_pro', 'seedance2_fast'];
    const buildBody = (model) => useImage
      ? { model, promptImage: 'data:' + (imageMime || 'image/png') + ';base64,' + imageBase64, promptText: finalPrompt, ratio: finalRatio, duration: finalDuration }
      : { model, promptText: finalPrompt, ratio: finalRatio, duration: finalDuration };
    const callRunway = (model) => fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'X-Runway-Version': RUNWAY_VERSION },
      body: JSON.stringify(buildBody(model)),
    });
    let upstream = await callRunway(process.env.RUNWAY_MODEL || RUNWAY_PREF[0]);
    let data = await upstream.json().catch(() => ({}));
    if (!upstream.ok && data && Array.isArray(data.issues)) {
      const issue = data.issues.find((i) => i && Array.isArray(i.values) && i.values.length);
      if (issue) {
        const allowed = issue.values.map(String);
        const pick = RUNWAY_PREF.find((m) => allowed.includes(m)) || allowed[0];
        console.error('[video-create] runway model rejected — retrying with ' + pick);
        upstream = await callRunway(pick);
        data = await upstream.json().catch(() => ({}));
      }
    }
    if (!upstream.ok) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.runway_video);
      // رسالة مفهومة للمستخدم + ذيل تقني قصير للتشخيص — لا JSON خام بطول شاشة.
      const tech = String((data && (data.error || (data.issues && data.issues[0] && data.issues[0].message))) || ('HTTP ' + upstream.status)).slice(0, 160);
      res.status(upstream.status).json({ error: 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات. (' + tech + ')', retryable: true });
      return;
    }

    // Only burn one of the daily allowance now that Runway has actually
    // accepted and started the task. Long-mode (owner-only) scenes never
    // touch the normal daily quota.
    const remaining = (longMode === true) ? null : await consumeVideo(usageResult.username);
    await saveLastTask(picked.index, data.id);
    res.status(200).json({ id: encodeTaskId(picked.index, data.id), remaining });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
