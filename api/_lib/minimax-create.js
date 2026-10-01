// Vercel Serverless Function: starts an AI video generation task on MiniMax
// (Hailuo) — the "economy" engine added alongside Runway and Veo. Uses the
// site owner's own server-side key (MINIMAX_API_KEY env var). Async: returns a
// task_id that /api/video?action=minimax-status polls until the clip is ready.
// Points/quota mirror the Veo path (owner bypass, per-account cooldown, refund
// on upstream failure), at the cheaper minimax_video cost.
const { checkOwnerBypass } = require('./_videoUsage');

// api.minimax.io هو مضيف المنصّة الدوليّة. اسم المضيف قابل للضبط من البيئة إن غيّروه.
const MM_BASE = (process.env.MINIMAX_API_BASE || 'https://api.minimax.io').replace(/\/+$/, '');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    let { promptText, ratio, token, quality, imageBase64, imageMime, durationSeconds } = body;
    const rawDesc = promptText; /* v-video-first-frame: وصف المستخدم قبل الأسلوب والقفل — مشهد أوّل الإطار */
    const tp = require('./trend-people.js');
    /* v-video-first-frame: أنمي/كرتون الواجهة — سطر الأسلوب أوّل الوصف (كان لا يصل هذا المحرّك أصلًا) */
    if (!body.trend && body.style === 'anime' && promptText && String(promptText).trim()) promptText = tp.STYLE_ANIME_VIDEO + String(promptText).trim();
    const styledDesc = promptText;
    /* v-video-trends: ترند بلمسة — الأمر يُبنى على الخادم من قالب الترند */
    if (body.trend) {
      const built = require('./video-trends.js').buildTrendPrompt(String(body.trend), Object.assign({}, body.params || {}, { hasImage: !!(imageBase64 && String(imageBase64).trim()) }));
      if (!built) { res.status(400).json({ error: 'unknown trend' }); return; }
      promptText = built.prompt; ratio = ratio || built.ratio;
    } else if (imageBase64 && String(imageBase64).trim() && promptText) {
      /* v-video-photo-identity: الإطار الأوّل يثبّت الوجه في اللحظة الأولى وحدها — وبلا أيّ أمر نصّيّ
         يعيد المحرّك رسمه مع الحركة. نفس قفل Omni وVeo (مرساة أوّلًا وقفل أخيرًا). */
      promptText = require('./video-trends.js').withIdentityLock(promptText, 1500);
    }
    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }
    // Hailuo تقبل 6 أو 10 ثوانٍ — نُثبّت أي قيمة أخرى على الأقرب.
    let durSec = parseInt(durationSeconds, 10);
    durSec = (durSec >= 8) ? 10 : 6;

    // 💰 النقاط: المحرّك الاقتصادي متاح للجميع — المالك بلا حدود، وغيره يدفع
    // minimax_video نقطة. يُسترجع الرصيد تلقائيًا لو فشل الطلب عند المزوّد.
    const pointsLib = require('./points.js');
    const gate = await checkOwnerBypass(token);
    let chargedUser = null;
    let videoLocked = null;
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      const gateMM = pointsLib.requireConfirmation(body, pointsLib.COSTS.minimax_video, 'فيديو المحرّك الاقتصادي');
      if (gateMM) { res.status(gateMM.status).json(gateMM.payload); return; }
      const pay = await pointsLib.spendPoints(username, pointsLib.COSTS.minimax_video, 'minimax_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.minimax_video, points: pay.points || 0 });
        return;
      }
      chargedUser = username;
      // v-plan-routing: فيديو واحد كلّ ٣ دقائق لكلّ حساب — VIP خارجها. القفل يُفكّ لو فشل الطلب.
      if (!pay.owner) {
        const __vl = await require('./abuse-guard.js').videoLock(username);
        if (!__vl.ok) {
          await pointsLib.refundPoints(username, pointsLib.COSTS.minimax_video);
          res.status(429).json({ error: 'video_cooldown', retryAfter: __vl.retryAfter });
          return;
        }
        videoLocked = username;
      }
    }

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.minimax_video);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      res.status(500).json({ error: 'Server is missing MINIMAX_API_KEY' });
      return;
    }

    /* v-video-first-frame (المالك: «كل الفيديوات»): مع صورة ووصف يُبنى أوّل إطار بوجهه في مشهد الوصف وأسلوبه، ثمّ
       قفل «الإطار جاهز — حرّكه كما هو». keepPhoto = الصورة نفسها. أيّ عطب = الصورة نفسها والأمر السابق حرفيًّا. */
    if (!body.trend && imageBase64 && String(imageBase64).trim() && !body.keepPhoto && rawDesc && String(rawDesc).trim() && tp.firstFrameOn() && process.env.GEMINI_API_KEY) {
      const solo = await tp.soloFirstFrame(process.env.GEMINI_API_KEY, { data: String(imageBase64).trim(), mime: imageMime }, String(rawDesc), ratio, { style: body.style, budgetMs: 90000 });
      if (solo && solo.b64) {
        imageBase64 = solo.b64; imageMime = solo.mime;
        promptText = require('./video-trends.js').withIdentityLock(styledDesc, 1500 - tp.FRAME_LOCK.length) + tp.FRAME_LOCK;
        console.log('[minimax-create] first frame ready' + (solo.cached ? ' (cached)' : ''));
      } else console.warn('[minimax-create] first frame skipped: ' + ((solo && solo.error) || 'none'));
    }

    const model = process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-Hailuo-02';
    const resolution = quality === 'high' ? '1080P' : '768P';
    const prompt = String(promptText).trim().slice(0, 1500);

    const payload = { model, prompt, duration: durSec, resolution };
    // صورة مرفقة → تحريك الصورة نفسها (image-to-video) عبر first_frame_image.
    if (imageBase64 && String(imageBase64).trim()) {
      payload.first_frame_image = 'data:' + (imageMime || 'image/png') + ';base64,' + String(imageBase64).trim();
    }

    const upstream = await fetch(MM_BASE + '/v1/video_generation', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    // MiniMax يعيد 200 مع base_resp.status_code≠0 عند الرفض المنطقيّ — نعامله كفشل.
    const okCode = data && data.base_resp && Number(data.base_resp.status_code) === 0;
    if (!upstream.ok || !data.task_id || !okCode) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.minimax_video);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      const tech = String((data && data.base_resp && data.base_resp.status_msg) || ('HTTP ' + upstream.status)).slice(0, 160);
      res.status(upstream.ok ? 502 : upstream.status).json({ error: 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات. (' + tech + ')', retryable: true });
      return;
    }
    // v-video-refund: تذكرة المهمّة — فشلها لاحقًا عند الاستطلاع يردّ الخصم ويفكّ القفل.
    await require('./video-job.js').rememberVideoJob(data.task_id, { username: chargedUser, cost: pointsLib.COSTS.minimax_video, locked: !!videoLocked });
    res.status(200).json({ task_id: data.task_id });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
