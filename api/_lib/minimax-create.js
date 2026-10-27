// Vercel Serverless Function: starts an AI video generation task on MiniMax —
// the "economy" engine added alongside Runway and Veo. Uses the site owner's
// own server-side key (MINIMAX_API_KEY env var). Async: returns a task_id that
// /api/video?action=minimax-status polls until the clip is ready.
// Points/quota mirror the Veo path (owner bypass, per-account cooldown, refund
// on upstream failure), at the cheaper minimax_video cost.
// v-minimax-h3 (قرار المالك ١٠ أكتوبر ٢٠٢٦: «رفع الاقتصاديّ لإصداره الجديد بصوت بضعف التكلفة»): واجهة v2
// (POST /v2/video_generation) بنموذج MiniMax-H3 — الجسم بصيغة content، والدقّة 768P/2K، والنسبة بصيغة 16:9.
const { checkOwnerBypass } = require('./_videoUsage');

/* v-minimax-h3: نسبة العميل (عرض:ارتفاع بالبكسل) → نسبة v2؛ مع صورة أوّل إطار 'adaptive' (تتبع الصورة). */
const RATIO_V2 = { '1280:720': '16:9', '720:1280': '9:16' };
function toV2Ratio(ratio, hasImage) {
  if (hasImage) return 'adaptive';
  return RATIO_V2[String(ratio || '').trim()] || '16:9';
}

// api.minimax.io هو مضيف المنصّة الدوليّة. اسم المضيف قابل للضبط من البيئة إن غيّروه.
const MM_BASE = (process.env.MINIMAX_API_BASE || 'https://api.minimax.io').replace(/\/+$/, '');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  /* v-video-giveback: خارج try — الرمية بعد الخصم (انقطاع أو مهلة عند نداء الإنشاء) كانت تردّ ٥٠٠ بلا ردّ نقاط ولا فكّ قفل */
  let chargedUser = null;
  let videoLocked = null;
  let chargedPay = null; // v-refund-kind: نتيجة الخصم نفسها — الردّ يعود إلى نوعه
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
    // المدّة تبقى مثبّتة على 6 أو 10 ثوانٍ (ضمن ٤–١٥ التي تقبلها v2) — نُثبّت أي قيمة أخرى على الأقرب.
    let durSec = parseInt(durationSeconds, 10);
    durSec = (durSec >= 8) ? 10 : 6;

    /* v-video-giveback: فحص المفتاح قبل أيّ خصم (كـveo-create) — كان بعد الخصم والقفل ويردّ اسم المفتاح للمستخدم */
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) { console.error('[minimax-create] missing provider key'); res.status(500).json({ error: 'تعذّر توليد الفيديو الآن. أعد المحاولة.' }); return; }

    // 💰 النقاط: المحرّك الاقتصادي متاح للجميع — المالك بلا حدود، وغيره يدفع
    // minimax_video نقطة. يُسترجع الرصيد تلقائيًا لو فشل الطلب عند المزوّد.
    const pointsLib = require('./points.js');
    const gate = await checkOwnerBypass(token);
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      if (await require('./_videoSubs.js').denyFree(res, username)) return; // v-video-subs: الفيديو للمشتركين — قبل سؤال الخصم
      quality = await require('./_qualityGate.js').gateQuality(username, quality); // v-quality-gate: الجودة العالية للمشتركين والمالك
      /* v-plan-videos: مشترك Pro/Max يصرف من صلاحيّة فيديوهات باقته أوّلًا — بلا تأكيد خصم نقاط لأنّه لا خصم. نفادها = كما كان. */
      let pay = (await require('./_planVideos.js').planVideoLeft(username)) > 0
        ? await pointsLib.spendPoints(username, pointsLib.COSTS.minimax_video, 'minimax_video', { planVideoOnly: true }) : null;
      if (!pay || !pay.ok) {
        const gateMM = pointsLib.requireConfirmation(body, pointsLib.COSTS.minimax_video, 'فيديو المحرّك الاقتصادي');
        if (gateMM) { res.status(gateMM.status).json(gateMM.payload); return; }
        pay = await pointsLib.spendPoints(username, pointsLib.COSTS.minimax_video, 'minimax_video');
      }
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.minimax_video, points: pay.points || 0 });
        return;
      }
      chargedUser = username; chargedPay = pay;
      // v-plan-routing: فيديو واحد كلّ ٣ دقائق لكلّ حساب — VIP خارجها. القفل يُفكّ لو فشل الطلب.
      if (!pay.owner) {
        const __vl = await require('./abuse-guard.js').videoLock(username);
        if (!__vl.ok) {
          await pointsLib.refundPoints(username, pointsLib.COSTS.minimax_video, pay); chargedUser = null; /* v-video-giveback: رُدّ هنا — catch لا يردّ ثانيةً */
          res.status(429).json({ error: 'video_cooldown', retryAfter: __vl.retryAfter });
          return;
        }
        videoLocked = username;
      }
    }

    /* v-video-first-frame (المالك: «كل الفيديوات»): مع صورة ووصف يُبنى أوّل إطار بوجهه في مشهد الوصف وأسلوبه، ثمّ
       قفل «الإطار جاهز — حرّكه كما هو». keepPhoto = الصورة نفسها. أيّ عطب = الصورة نفسها والأمر السابق حرفيًّا. */
    if (!body.trend && imageBase64 && String(imageBase64).trim() && !body.keepPhoto && rawDesc && String(rawDesc).trim() && tp.firstFrameOn() && process.env.GEMINI_API_KEY) {
      const solo = await tp.soloFirstFrame(process.env.GEMINI_API_KEY, { data: String(imageBase64).trim(), mime: imageMime }, String(rawDesc), ratio, { style: body.style, budgetMs: 90000 });
      if (solo && solo.b64) {
        imageBase64 = solo.b64; imageMime = solo.mime;
        promptText = require('./video-trends.js').withIdentityLock(styledDesc, 1500 - tp.FRAME_LOCK.length, undefined, solo.people) + tp.FRAME_LOCK; /* v-two-people: الجمع إن كُشف شخصان */
        console.log('[minimax-create] first frame ready' + (solo.cached ? ' (cached)' : ''));
      } else console.warn('[minimax-create] first frame skipped: ' + ((solo && solo.error) || 'none'));
    }

    const model = process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-H3';
    const resolution = quality === 'high' ? '2K' : '768P'; // v-minimax-h3: H3 بلا دقّة وسطى — العالية 2K (مشتركو الجودة العالية وحدهم)
    const prompt = String(promptText).trim().slice(0, 1500);
    const hasImage = !!(imageBase64 && String(imageBase64).trim());

    /* v-minimax-h3: جسم v2 — content[] نصّ (+ صورة أوّل إطار كرابط data مع role first_frame)، والنسبة بصيغة 16:9. */
    const content = [{ type: 'text', text: prompt }];
    // صورة مرفقة → تحريك الصورة نفسها (image-to-video) عبر first_frame.
    if (hasImage) {
      content.push({ type: 'image_url', image_url: { url: 'data:' + (imageMime || 'image/png') + ';base64,' + String(imageBase64).trim() }, role: 'first_frame' });
    }
    const payload = { model, content, duration: durSec, resolution, ratio: toV2Ratio(ratio, hasImage) };

    const upstream = await fetch(MM_BASE + '/v2/video_generation', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    // v2: النجاح ٢٠٠ مع task_id وحده؛ الخطأ بحالة HTTP غير ٢٠٠ وجسم { type:'error', error:{ message } } (لا حقل حالة داخليّ كما في v1).
    if (!upstream.ok || !data || !data.task_id) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.minimax_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      chargedUser = null; videoLocked = null; /* v-video-giveback: رُدّ هنا — catch لا يردّ ثانيةً */
      const tech = String((data && data.error && data.error.message) || ('HTTP ' + upstream.status)).slice(0, 160);
      console.error('[minimax-create] upstream ' + upstream.status + ': ' + tech);
      const fail = require('./_videoFail.js').startFail(upstream.ok ? 502 : upstream.status, tech); /* v-video-names: مؤقّت · عطب عندنا · رفض للطلب (_videoFail.js) */ /* ٢٠٠ بلا task_id = مؤقّت كما كان */
      res.status(fail.code).json(fail.body);
      return;
    }
    // v-video-refund: تذكرة المهمّة — فشلها لاحقًا عند الاستطلاع يردّ الخصم ويفكّ القفل.
    await require('./video-job.js').rememberVideoJob(data.task_id, { username: chargedUser, cost: pointsLib.COSTS.minimax_video, locked: !!videoLocked, pay: chargedPay });
    chargedUser = null; videoLocked = null; /* v-video-giveback: التذكرة تملك الردّ من هنا — catch لا يردّ مرّتين (كـactor-create) */
    res.status(200).json({ task_id: data.task_id });
  } catch (e) {
    /* v-video-giveback: أيّ رمية بعد الخصم (انقطاع أو مهلة عند نداء الإنشاء) تردّ النقاط وتفكّ القفل كـomni-create — أفضل جهد لا يحجب الردّ */
    try {
      if (chargedUser) await require('./points.js').refundPoints(chargedUser, require('./points.js').COSTS.minimax_video, chargedPay);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
    } catch (e2) { /* guard-ok — فشل الاسترجاع لا يُخفي الخطأ الأصليّ، ويُسجَّل أدناه */ }
    console.error('[minimax-create] ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات.', retryable: true });
  }
};
