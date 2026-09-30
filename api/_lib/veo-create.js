// Starts a Google Veo 3 video generation via the Gemini API
// (predictLongRunning). Owner-only for now because each 8s clip costs
// real money. Uses GEMINI_API_KEY env var.
const { checkOwnerBypass } = require('./_videoUsage');

const GL = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_PROMPT_MAX = 2600;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    let { promptText, ratio, token, quality, imageBase64, imageMime, durationSeconds } = body;
    /* v-trend-people: شخصيّتان أو ثلاث — الصور الزائدة تصل في imagesBase64 ويُبنى منها أوّل إطار واحد. */
    const trendPeople = Array.isArray(body.imagesBase64)
      ? body.imagesBase64.map((d, i) => ({ data: d, mime: (body.imagesMime || [])[i] })).filter((x) => x && x.data)
      : [];
    /* v-video-trends: ترند بلمسة — الأمر يُبنى على الخادم من قالب الترند ومدخلات المستخدم */
    if (body.trend) {
      const built = require('./video-trends.js').buildTrendPrompt(String(body.trend), Object.assign({}, body.params || {}, { hasImage: !!(imageBase64 && String(imageBase64).trim()) }));
      if (!built) { res.status(400).json({ error: 'unknown trend' }); return; }
      promptText = built.prompt; ratio = ratio || built.ratio; if (!durationSeconds) durationSeconds = 8;
    } else if (imageBase64 && String(imageBase64).trim() && promptText) {
      /* v-video-identity: الوصف الحرّ مع صورة — قفل الهويّة نفسه كالترندات */
      promptText = require('./video-trends.js').withIdentityLock(promptText, 1500);
    }
    let durSec = parseInt(durationSeconds, 10);
    if (![4, 6, 8].includes(durSec)) durSec = 0; // 0 = default (leave to Veo)
    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    /* v-video-stream: فحص المفتاح قبل أيّ خصم — كان بعد spendPoints وvideoLock ويردّ ٥٠٠ بلا
       استرجاع ولا فكّ قفل، فغياب المفتاح يحرق نقاط المستخدم في كلّ محاولة. */
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error('[veo-create] missing provider key'); res.status(500).json({ error: 'تعذّر توليد الفيديو الآن. أعد المحاولة.' }); return; }

    // 💰 نظام النقاط: Veo 3 متاح للجميع — المالك بلا حدود، وغيره يدفع
    // 400 نقطة للفيديو الواحد. يُسترجع الرصيد تلقائيًا لو فشل الطلب.
    const pointsLib = require('./points.js');
    const gate = await checkOwnerBypass(token);
    let chargedUser = null;
    let videoLocked = null;
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      const gateVeo = pointsLib.requireConfirmation(body, pointsLib.COSTS.veo_video, 'فيديو Veo 3');
      if (gateVeo) { res.status(gateVeo.status).json(gateVeo.payload); return; }
      const pay = await pointsLib.spendPoints(username, pointsLib.COSTS.veo_video, 'veo_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.veo_video, points: pay.points || 0 });
        return;
      }
      chargedUser = username;
      // v-plan-routing: فيديو واحد كلّ ٣ دقائق لكلّ حساب — VIP خارجها (pay.owner). القفل يُفكّ لو فشل Veo.
      if (!pay.owner) {
        const __vl = await require('./abuse-guard.js').videoLock(username);
        if (!__vl.ok) {
          await pointsLib.refundPoints(username, pointsLib.COSTS.veo_video);
          res.status(429).json({ error: 'video_cooldown', retryAfter: __vl.retryAfter });
          return;
        }
        videoLocked = username;
      }
    }


    /* v-trend-people: أوّل إطار فيه كلّ الأشخاص معًا في مشهد الترند، ثمّ يحرّكه المحرّك. بعد القفل
       عمدًا: مهلة الثلاث دقائق هي ما يحدّ نداءات الدمج. فشله = لا خصم ولا قفل (يُردّان هنا). */
    if (body.trend && trendPeople.length > 1) {
      const frame = await require('./trend-people.js').groupFirstFrame(apiKey, trendPeople, promptText, ratio);
      if (frame && frame.b64) {
        imageBase64 = frame.b64; imageMime = frame.mime;
        /* v-trend-identity: الإطار الأوّل بُني للتوّ بوجوه الأشخاص الحقيقيّة داخل مشهد الترند، لكنّ أمر
           الترند نفسه يبقى «Transform the person … into …» — فيعيد المحرّك تنفيذ التحويل فوق إطار
           نُفِّذ فيه أصلًا، ويرسم وجوهًا جديدة. هذا السطر يُلحق أخيرًا فيغلب: التحويل انتهى، والمطلوب
           تحريك ما في الإطار كما هو. */
        promptText += ' The attached first frame ALREADY shows every person exactly as they must look in this'
          + ' video: animate that frame. Keep each face, hairstyle, skin tone and outfit exactly as they appear'
          + ' in it — do not re-age, restyle, redraw or replace anyone, and do not apply the transformation again.';
      }
      else if (frame && frame.error) {
        if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.veo_video);
        if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
        res.status(frame.status || 502).json({ error: frame.error, retryable: !!frame.retryable });
        return;
      }
    }

    const model = quality === 'high' ? 'veo-3.1-generate-preview' : 'veo-3.1-fast-generate-preview';
    const aspectRatio = ratio === '720:1280' ? '9:16' : '16:9';
    /* v-video-photo-identity: حدّ ١٥٠٠ كان يقصّ قفل «الإطار الأوّل يُظهر كلّ شخص… لا تحوّل مرّة ثانية»
       في كلّ ترند متعدّد الأشخاص (٣٣٠ من ٣٣٠ قياسًا، أطولها ٢٤٦٩) لأنّه يُلحق بعد بناء الأمر. الحدّ حدّنا
       لا حدّ المحرّك (١٠٢٤ رمزًا ≈ ٤ آلاف حرف إنجليزيّ) — ٢٦٠٠ تتّسع لأطول أمر بلا قصّ. */
    const prompt = String(promptText).trim().slice(0, VEO_PROMPT_MAX);

    // Veo 3.1 image-to-video: attach a starting image when provided so the
    // generated clip animates that exact character (with native audio/speech).
    const instance = { prompt };
    if (imageBase64 && String(imageBase64).trim()) {
      instance.image = {
        bytesBase64Encoded: String(imageBase64).trim(),
        mimeType: imageMime || 'image/png',
      };
    }

    const upstream = await fetch(GL + '/models/' + model + ':predictLongRunning', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [instance],
        parameters: durSec ? { aspectRatio, durationSeconds: durSec } : { aspectRatio },
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.veo_video);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      res.status(upstream.status).json({ error: 'Veo error: ' + String(msg).slice(0, 500) });
      return;
    }
    // v-video-refund: تذكرة المهمّة — فشلها لاحقًا عند الاستطلاع يردّ الخصم ويفكّ القفل.
    await require('./video-job.js').rememberVideoJob(data.name, { username: chargedUser, cost: pointsLib.COSTS.veo_video, locked: !!videoLocked });
    res.status(200).json({ op: data.name });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.VEO_PROMPT_MAX = VEO_PROMPT_MAX;
