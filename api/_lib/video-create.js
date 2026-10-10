// Vercel Serverless Function: starts an AI video generation task on Runway
// (text-to-video, Gen-4.5) using the site owner's own server-side API key
// (RUNWAY_API_KEY env var). Requires a logged-in account and enforces a
// small daily quota per account (see api/_videoUsage.js) because each
// generated video costs the owner real money.
const { checkVideoQuota, consumeVideo, checkOwnerBypass } = require('./_videoUsage');
const { pickKey, encodeTaskId, clearStuckTask, saveLastTask, RUNWAY_API_BASE } = require('./runway-keys');

const RUNWAY_VERSION = '2024-11-06';

/* v-video-photo-identity (المالك: «الفيديوات عامّة تغيّر الأشكال… مش ترندات، في الفيديوات العاديّة»):
   أمر Runway مع صورة كان: بادئة «ضعه في وسط الإطار بلقطة متوسّطة، نفس التأطير في كلّ مشهد» — أمر إعادة
   تأطير يعاكس الإطار الأوّل (الصورة نفسها) فيعيد المحرّك رسم الوجه بمقاس آخر؛ ولاحقة الأسلوب تُلحق قبل
   البادئة ثمّ يُقصّ الكلّ على ١٠٠٠ فتضيع اللاحقة كلّها بعد ~٤٦١ حرفًا؛ ولا قفل في الذيل؛ والأنمي يطلب
   «EXACT … UNCHANGED» و«NOT photographic» معًا. الآن: مرساة هويّة أوّلًا بلا أمر تأطير (أسلوبيّة مع
   الأنمي)، والوصف يُقصّ هو وحده، ثمّ لاحقة الأسلوب، ثمّ قفل الهويّة أخيرًا — الكلّ داخل ١٠٠٠. */
const RUNWAY_PROMPT_MAX = 1000;
const RW_STYLE_ANIME = ', 2D anime cartoon animation, illustrated characters, bold outlines, cel-shaded, Studio Ghibli style, NOT realistic, NOT photographic';
const RW_STYLE_REAL = ', ultra-realistic live-action footage, real camera recording, natural lighting, photographic quality, shot on 4K camera, cinematic depth of field — absolutely no cartoon, no animation, no illustration, no digital art, no anime, no CGI characters';
const RW_ID_PRE_REAL = 'The opening frame is a real photo of a real person. Keep this exact person — same face shape, eyes, nose, lips, jawline, beard, skin tone and hair — in every frame, whatever they do. ';
const RW_ID_PRE_ANIME = 'The opening frame is a photo of a real person. Keep them clearly recognizable — same face shape, eyes, nose, lips, beard, skin tone and hair — while the scene is drawn in the style below. ';
const RW_ID_TAIL = '. IDENTITY (mandatory): it is this same person from the photo throughout, never a different or generic face.';
/* v-video-first-frame: الإطار الأوّل صار مرسومًا بوجهه في مشهد الوصف (وبالأنمي إن اختير) — المرساة تقول ذلك: حرّكه كما هو. */
const RW_ID_PRE_FRAME_REAL = 'The opening frame already shows the real person from the user\'s photo in this scene. Keep this exact person — same face shape, eyes, nose, lips, jawline, beard, skin tone, hair and body — in every frame; animate that frame as it is, never redraw or replace them. ';
const RW_ID_PRE_FRAME_ANIME = 'The opening frame already shows the real person from the user\'s photo, drawn in the style below. Keep them exactly as drawn there — same face and features — in every frame; animate that frame as it is, never redraw or replace them. ';

/* v-two-people: الإطار المرسوم فيه شخصان (من صورة واحدة) — المرساة والقفل بصيغة الجمع، كلّ واحد بوجهه */
const RW_ID_PRE_FRAME_TWO = 'The opening frame already shows the real people from the user\'s photo in this scene. Keep each of them exactly — their own face shape, eyes, nose, lips, jawline, beard, skin tone, hair and body — in every frame; animate that frame as it is, never redraw, swap or replace anyone. ';
const RW_ID_TAIL_TWO = '. IDENTITY (mandatory): they are these same people from the photo throughout, each with their own face, never different or generic faces.';

function buildRunwayPrompt(promptText, style, useImage, framed, people) {
  const anime = style === 'anime';
  const suffix = anime ? RW_STYLE_ANIME : RW_STYLE_REAL;
  const two = !!(useImage && framed && people > 1);
  const pre = useImage ? (two ? RW_ID_PRE_FRAME_TWO : framed ? (anime ? RW_ID_PRE_FRAME_ANIME : RW_ID_PRE_FRAME_REAL) : (anime ? RW_ID_PRE_ANIME : RW_ID_PRE_REAL)) : '';
  const tail = useImage ? (two ? RW_ID_TAIL_TWO : RW_ID_TAIL) : '';
  const room = Math.max(0, RUNWAY_PROMPT_MAX - pre.length - suffix.length - tail.length);
  return pre + String(promptText || '').trim().slice(0, room) + suffix + tail;
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
      usageResult = await checkVideoQuota(token, res); /* v-atomic-quota: حجز ذرّيّ يُردّ إن فشل */
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
    let videoLocked = null;
    if (usageResult.username && !pointsLib.isOwnerUsername(usageResult.username)) {
      const gateRw = pointsLib.requireConfirmation(body, pointsLib.COSTS.runway_video, 'فيديو Runway');
      if (gateRw) { res.status(gateRw.status).json(gateRw.payload); return; }
      const pay = await pointsLib.spendPoints(usageResult.username, pointsLib.COSTS.runway_video, 'runway_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.runway_video, points: pay.points || 0 });
        return;
      }
      chargedUser = usageResult.username;
      // v-plan-routing: فيديو واحد كلّ ٣ دقائق لكلّ حساب — المالك وVIP خارجها (pay.owner). القفل يُفكّ لو فشل Runway.
      if (!pay.owner) {
        const __vl = await require('./abuse-guard.js').videoLock(chargedUser);
        if (!__vl.ok) {
          await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.runway_video);
          res.status(429).json({ error: 'video_cooldown', retryAfter: __vl.retryAfter });
          return;
        }
        videoLocked = chargedUser;
      }
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

    // Auto-cancel any previous stuck task on this key so it doesn't hog the
    // account's single concurrency slot forever (see runway-keys.js).
    await clearStuckTask(picked.index, apiKey);

    // 🎬 صورة مرفقة → image_to_video (تحريك الصورة نفسها)، بدونها → text_to_video
    const useImage = !!(imageBase64 && String(imageBase64).length > 50);
    /* v-video-first-frame (المالك: «كل الفيديوات»): مع صورة ووصف يُبنى أوّل إطار بوجهه في مشهد الوصف وأسلوبه
       (الأنمي يُرسم أنمي — صورة حقيقيّة كإطار أوّل لا تصير أنمي)، بالنسبة نفسها فلا قصّ. keepPhoto («حرّكها» وحدها
       من المحادثة) = الصورة نفسها كما كانت. أيّ عطب = الصورة نفسها، فلا يفشل فيديو بسبب الإطار. */
    let framed = false, framePeople = 0;
    const tp = require('./trend-people.js');
    if (useImage && !body.trend && !body.keepPhoto && tp.firstFrameOn() && process.env.GEMINI_API_KEY) {
      const solo = await tp.soloFirstFrame(process.env.GEMINI_API_KEY, { data: String(imageBase64), mime: imageMime }, String(promptText), finalRatio, { style, budgetMs: 90000 });
      if (solo && solo.b64) {
        imageBase64 = solo.b64; imageMime = solo.mime; framed = true; framePeople = solo.people || 0;
        console.log('[video-create] first frame ready' + (solo.cached ? ' (cached)' : ''));
      } else console.warn('[video-create] first frame skipped: ' + ((solo && solo.error) || 'none'));
    }
    // v-runway-host: مفاتيح الـAPI العامة تخدمها api.dev.runwayml.com حصرًا —
    // النداء على api.runwayml.com يرجع «Incorrect hostname for API key».
    const endpoint = useImage
      ? RUNWAY_API_BASE + '/v1/image_to_video'
      : RUNWAY_API_BASE + '/v1/text_to_video';
    // Runway hard limit: promptText <= 1000 chars TOTAL — مع صورة: مرساة هويّة أوّلًا وقفل أخيرًا (v-video-photo-identity)
    const finalPrompt = buildRunwayPrompt(promptText, style, useImage, framed, framePeople);

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
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
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
    const clientTaskId = encodeTaskId(picked.index, data.id);
    // v-video-refund: تذكرة المهمّة — فشلها لاحقًا عند الاستطلاع يردّ الخصم والقفل وحصّة اليوم.
    await require('./video-job.js').rememberVideoJob(clientTaskId, { username: chargedUser, cost: pointsLib.COSTS.runway_video, locked: !!videoLocked, quota: longMode !== true });
    res.status(200).json({ id: clientTaskId, remaining });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.buildRunwayPrompt = buildRunwayPrompt;
module.exports.RUNWAY_PROMPT_MAX = RUNWAY_PROMPT_MAX;
