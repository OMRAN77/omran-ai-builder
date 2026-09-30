// Vercel Serverless Function: generates a video with Google Gemini Omni
// (gemini-omni-1.1-flash) via the Interactions API — the "cinematic" engine
// added alongside Runway, Veo and MiniMax. Uses GEMINI_API_KEY. Unlike the
// others this call is SYNCHRONOUS: the POST blocks until the clip is generated
// (fits the api/*.js maxDuration of 300s) and returns a Google file URI, which
// the client streams through the existing veo-download proxy (same key/host).
// Points mirror the Veo path (owner bypass, per-account cooldown, refund on
// failure) at the higher omni_video cost, since Omni is priced ~$0.10/sec.
const { checkOwnerBypass } = require('./_videoUsage');

const GL = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  /* v-omni-refund: خارج try — مهلة الشبكة وأيّ رمية أخرى تسقط في الـcatch الأخير، وكان يردّ ٥٠٠
     بلا استرجاع نقاط ولا فكّ قفل، خلافًا لمسارات الفشل الثلاثة الأخرى. */
  let chargedUser = null;
  let videoLocked = null;
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    let { promptText, ratio, token, quality, imageBase64, imageMime } = body;
    /* v-video-trends: ترند بلمسة — الأمر يُبنى على الخادم من قالب الترند */
    if (body.trend) {
      const built = require('./video-trends.js').buildTrendPrompt(String(body.trend), Object.assign({}, body.params || {}, { hasImage: !!(imageBase64 && String(imageBase64).trim()) }));
      if (!built) { res.status(400).json({ error: 'unknown trend' }); return; }
      promptText = built.prompt; ratio = ratio || built.ratio;
    } else if (imageBase64 && String(imageBase64).trim() && promptText) {
      /* v-video-identity: الوصف الحرّ مع صورة — قفل الهويّة نفسه كالترندات */
      promptText = require('./video-trends.js').withIdentityLock(promptText, 1500);
    }
    if (!promptText || !String(promptText).trim()) {
      res.status(400).json({ error: 'Missing promptText' });
      return;
    }

    // 💰 النقاط: المحرّك السينمائيّ متاح للجميع — المالك بلا حدود، وغيره يدفع
    // omni_video نقطة (الأغلى). يُسترجع الرصيد تلقائيًا لو فشل الطلب.
    const pointsLib = require('./points.js');
    const gate = await checkOwnerBypass(token);
    if (!gate.allowed) {
      if (gate.reason === 'auth') { res.status(401).json({ error: 'auth_required' }); return; }
      const username = pointsLib.verifyPointsToken(token);
      if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
      const gateOm = pointsLib.requireConfirmation(body, pointsLib.COSTS.omni_video, 'فيديو المحرّك السينمائيّ');
      if (gateOm) { res.status(gateOm.status).json(gateOm.payload); return; }
      const pay = await pointsLib.spendPoints(username, pointsLib.COSTS.omni_video, 'omni_video');
      if (!pay.ok) {
        res.status(402).json({ error: 'points_insufficient', needed: pointsLib.COSTS.omni_video, points: pay.points || 0 });
        return;
      }
      chargedUser = username;
      if (!pay.owner) {
        const __vl = await require('./abuse-guard.js').videoLock(username);
        if (!__vl.ok) {
          await pointsLib.refundPoints(username, pointsLib.COSTS.omni_video);
          res.status(429).json({ error: 'video_cooldown', retryAfter: __vl.retryAfter });
          return;
        }
        videoLocked = username;
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.omni_video);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      console.error('[omni-create] missing provider key');
      res.status(500).json({ error: 'تعذّر توليد الفيديو الآن. أعد المحاولة.' });
      return;
    }

    const model = process.env.OMNI_VIDEO_MODEL || 'gemini-omni-1.1-flash';
    const resolution = quality === 'high' ? '1080p' : '720p';
    const aspect = ratio === '720:1280' ? '9:16' : '16:9';
    const prompt = String(promptText).trim().slice(0, 1500);

    // input مصفوفة: صورة (اختياريّة) ثمّ النصّ. الفيديو الكبير يُطلب كـuri لتفادي
    // حدّ حجم الحمولة، ويُقرأ الـuri من ردّ الإنشاء نفسه (مضمون هنا).
    const input = [];
    if (imageBase64 && String(imageBase64).trim()) {
      input.push({ type: 'image', data: String(imageBase64).trim(), mime_type: imageMime || 'image/png' });
    }
    input.push({ type: 'text', text: prompt });

    /* v-omni-store: النداء متزامن ويحجب دقيقة إلى ثلاث حتّى ينتهي التوليد، وحارس المهلة العامّ
       (_fetch-timeout.js) يقطع كلّ نداء بلا signal عند ٣٠ ثانية — فكان يُجهَض قبل أن يردّ المزوّد.
       من يمرّر signal خاصًّا يتركه الحارس وشأنه. ٢٧٠ث دون maxDuration المضبوط للدالّة. */
    const OMNI_TIMEOUT_MS = Number(process.env.OMNI_TIMEOUT_MS || 270000);
    const upstream = await fetch(GL + '/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input,
        response_format: { type: 'video', resolution, aspect_ratio: aspect, delivery: 'uri' },
        /* v-omni-store: طلب الفيديو كرابط (delivery:'uri') يشترط store:true — الرابط مرجع إلى
           مخرَج مخزَّن، فبلا تخزين لا شيء يُشار إليه ويُرفض الطلب كلّه («store=true is required
           when response format has video delivery set to URI»). توصية store:false في التوثيق
           تخصّ التسليم المضمَّن، وهو محجوب علينا: سقفه ٤م ومقاطعنا 720p/1080p أكبر منه. */
        background: false, store: true, stream: false,
      }),
      signal: AbortSignal.timeout(OMNI_TIMEOUT_MS),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.omni_video);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      res.status(upstream.status).json({ error: 'تعذّر توليد الفيديو — أعد المحاولة. (' + String(msg).slice(0, 200) + ')', retryable: true });
      return;
    }

    // استخرج مخرج الفيديو من steps → model_output → content[type=video].
    let uri = '', b64 = '', mime = 'video/mp4';
    for (const s of (data.steps || [])) {
      if (!s || s.type !== 'model_output') continue;
      for (const c of (s.content || [])) {
        if (c && c.type === 'video') { if (c.uri) uri = c.uri; if (c.data) b64 = c.data; if (c.mime_type) mime = c.mime_type; }
      }
    }
    if (!uri && !b64) {
      // اكتمل بلا فيديو (غالبًا حجبته فلاتر الأمان) — لا يُخصم شيء.
      if (chargedUser) await pointsLib.refundPoints(chargedUser, pointsLib.COSTS.omni_video);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
      res.status(502).json({ error: 'لم يُنتَج فيديو (قد يكون الطلب محجوبًا بفلاتر الأمان). جرّب وصفًا آخر.' });
      return;
    }

    if (uri) {
      // نمرّره عبر بروكسي veo-download (يضيف مفتاح Google لتنزيل ملفّ generativelanguage).
      res.status(200).json({ url: '/api/video?action=veo-download&uri=' + encodeURIComponent(uri) });
    } else {
      res.status(200).json({ dataUrl: 'data:' + mime + ';base64,' + b64 });
    }
  } catch (e) {
    /* v-omni-refund: الاسترجاع أفضل جهد ولا يحجب الردّ — بلا هذا تحترق نقاط المستخدم عند كلّ انقطاع */
    try {
      const pl = require('./points.js');
      if (chargedUser) await pl.refundPoints(chargedUser, pl.COSTS.omni_video);
      if (videoLocked) await require('./abuse-guard.js').releaseVideoLock(videoLocked);
    } catch (e2) { /* guard-ok — فشل الاسترجاع لا يُخفي الخطأ الأصليّ، ويُسجَّل أدناه */ }
    console.error('[omni-create] ' + (e && e.stack ? e.stack : e));
    res.status(500).json({ error: 'تعذّر توليد الفيديو الآن. أعد المحاولة.', retryable: true });
  }
};
