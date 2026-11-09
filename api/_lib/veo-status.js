// Polls a Google Veo 3 long-running operation. When done, returns a
// same-origin download URL (proxied through veo-download so the API key
// never reaches the browser).
const GL = 'https://generativelanguage.googleapis.com/v1beta';
/* v-video-names (مراجعة باب المال): سبب الفشل كان يصل المستخدم بنصّ المزوّد نفسه (اسم النموذج والمنصّة) في الترند وأداة الوكيل
   والشخصيّة الناطقة. النصّ للسجلّ، وللمستخدم سبب عربيّ ثابت مع failureCode: safety = الرقابة (العميل يترجمه)، failed = غيرها. */
const SAFETY_RE = /safety|moderat|filter|responsible ai|\brai\b|guideline|content policy|prohibited|sensitive/i;
const FAIL_SAFETY = 'الرقابة رفضت المحتوى — جرّب صورة أو وصفًا آخر.';
const FAIL_OTHER = 'أعد المحاولة، وإن تكرّر فجرّب صورة أو وصفًا آخر.'; // كلّ متّصل يسبقه بـ«فشل إنشاء الفيديو» فلا يتكرّر — v-rest-fixes: كان «جرّب صورة أو وصفًا آخر» لكلّ فشل غير الرقابة، ولو كان عطلًا عند المزوّد
function failed(res, why) {
  const safety = SAFETY_RE.test(String(why || ''));
  res.status(200).json({ status: 'FAILED', failure: safety ? FAIL_SAFETY : FAIL_OTHER, failureCode: safety ? 'safety' : 'failed' });
}

/* v-fal-backup (أمر المالك ٣ نوفمبر ٢٠٢٦: «موجود خارجي وصله»): مهمّة الاحتياط «fal/<id>» (رصيد Gemini خلص عند الإنشاء، veo-create) —
   تُتابَع بالعقد نفسه: RUNNING، وSUCCEEDED برابط الناتج (يُسوّى نجاحًا ويُحفظ ناتجًا لنا كـactor-status)، وFAILED بسبب عربيّ ورمز
   (رفض الرقابة عنده «content_policy_violation… flagged by a content checker» = safety)، وعطب رصيده أو مفتاحه unavailable بـ503 —
   والفشل يردّ الخصم ويفكّ القفل (video-job). العثرة العابرة (429/5xx/شبكة) RUNNING فيعيد العميل، والكنس يردّ ما لم يُسلَّم. */
const FAL_SAFETY_RE = /content[_ ]policy|flagged|nsfw|content checker/i;
async function falStatus(op, res) {
  const id = op.slice(require('./veo-create.js').FAL_OP_PREFIX.length);
  if (!/^[\w-]{1,100}$/.test(id)) { res.status(400).json({ error: 'Missing op' }); return; }
  const falBackup = require('./fal-fallback.js');
  let rec = null;
  try { rec = JSON.parse((await require('./kv.js').kvGetRaw(require('./veo-create.js').falOpKey(op))) || 'null'); }
  catch (e) { console.error('[veo-status] backup record read failed: ' + (e && e.message)); rec = null; }
  if (!rec || !rec.s || !rec.r) { // مفقود أو تعذّرت قراءته: رابطا الطابور من الرقم (عائلة النموذج واحدة لكلّ أدوار الفيديو)
    const base = 'https://queue.fal.run/' + falBackup.VIDEO_MODELS.text.split('/').slice(0, 2).join('/') + '/requests/' + id;
    rec = { s: base + '/status', r: base };
  }
  const p = await falBackup.pollVideo(rec);
  const settleFal = (ok, why) => require('./video-job.js').settleVideoJob(op, ok, { why }); // v-owner-problems: السبب لبلاغ المالك
  if (p.state === 'SUCCEEDED') {
    await settleFal(true);
    await require('./our-media.js').rememberOurMedia([p.url]); // v-dl-ours: ناتج مدفوع — حفظه لا يُعدّ على سقف التنزيل
    res.status(200).json({ status: 'SUCCEEDED', output: [p.url] });
    return;
  }
  if (p.state === 'OUTAGE' || p.state === 'FAILED') {
    const why = String(p.why || '');
    console.error('[veo-status] backup ' + p.state.toLowerCase() + ': ' + why.slice(0, 300));
    await settleFal(false, 'backup ' + p.state.toLowerCase() + ': ' + why.slice(0, 300));
    if (p.state === 'OUTAGE') res.status(503).json({ error: 'unavailable', retryable: false });
    else failed(res, FAL_SAFETY_RE.test(why) ? 'safety: ' + why : why);
    return;
  }
  res.status(200).json({ status: 'RUNNING' });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const op = (req.query && req.query.op) || '';
    if (!op || !/^[\w./-]+$/.test(op)) { res.status(400).json({ error: 'Missing op' }); return; }
    /* v-fal-backup: مهمّة الاحتياط قبل فحص مفتاح Gemini — تُتابَع ولو أُزيل مفتاحه */
    if (op.indexOf(require('./veo-create.js').FAL_OP_PREFIX) === 0) { await falStatus(op, res); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error('[veo-status] missing provider key'); res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' }); return; }

    /* v-trend-omni: مهمّة الترند على Omni اكتملت عند الإنشاء (نداء متزامن) — ناتجها في التخزين، والتذكرة تُسوّى هنا عند التسليم كـVeo.
       عطل القراءة = RUNNING (يعيد العميل) لا فشلًا: الفيديو مدفوع وموجود. */
    const vc = require('./veo-create.js');
    if (op.indexOf(vc.OMNI_OP_PREFIX) === 0) {
      let rec;
      try { rec = JSON.parse((await require('./kv.js').kvGetRaw(vc.omniOpKey(op))) || 'null'); }
      catch (e) { console.error('[veo-status] omni result read failed: ' + (e && e.message)); res.status(200).json({ status: 'RUNNING' }); return; }
      if (!rec || !rec.uri) { await require('./video-job.js').settleVideoJob(op, false, { why: 'omni result missing' }); failed(res, 'omni result missing'); return; }
      await require('./video-job.js').settleVideoJob(op, true);
      res.status(200).json({ status: 'SUCCEEDED', output: [require('./veo-download.js').downloadUrl(rec.uri)] });
      return;
    }
    const upstream = await fetch(GL + '/' + op, { headers: { 'x-goog-api-key': apiKey } });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      console.error('[veo-status] upstream ' + upstream.status + ': ' + String(msg).slice(0, 300));
      /* v-credit-out (أمر المالك ٢١ أكتوبر «ما تنخصم منه ولا نقطة»): المزوّد يرفض الاستطلاع نفسه لعطب عندنا (رصيده نفد، المفتاح، الصلاحيّة) — المهمّة لن
         تُتابَع أبدًا، وكانت تذكرتها تنتهي بعد ساعتين بلا ردّ. تُسوّى فشلًا الآن (مرّة واحدة) وunavailable يعرضه العميل «الخدمة متوقّفة مؤقّتًا». */
      if (require('./_videoFail.js').isOutage(upstream.status, msg)) {
        await require('./video-job.js').settleVideoJob(op, false, { why: 'outage ' + upstream.status + ': ' + String(msg).slice(0, 250) });
        res.status(503).json({ error: 'unavailable', retryable: false });
        return;
      }
      res.status(upstream.status).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
      return;
    }
    if (!data.done) { res.status(200).json({ status: 'RUNNING' }); return; }
    // v-video-refund: انتهت المهمّة — نسوّي تذكرتها قبل الردّ (الفشل يردّ الخصم ويفكّ القفل).
    const settle = (ok, why) => require('./video-job.js').settleVideoJob(op, ok, { why }); // v-owner-problems: السبب لبلاغ المالك
    if (data.error) {
      const why = String(data.error.message || '');
      await settle(false, why.slice(0, 300) || 'provider error');
      console.error('[veo-status] failed: ' + why.slice(0, 300));
      failed(res, why);
      return;
    }
    const r = data.response || {};
    const gvr = r.generateVideoResponse || r;
    let uri = null;
    const samples = gvr.generatedSamples || gvr.generatedVideos || [];
    if (samples.length) {
      const v = samples[0].video || samples[0];
      uri = v.uri || v.videoUri || null;
    }
    if (!uri) {
      // أشيع فشل صامت عند Veo: اكتملت العمليّة وحجب فلتر الأمان الناتج. لا ناتج = لا محاسبة.
      let why = 'no video in response';
      const rai = gvr.raiMediaFilteredReasons || r.raiMediaFilteredReasons;
      if (rai && rai.length) { why = 'filtered: ' + String(rai.join(' | ')).slice(0, 400); console.warn('[veo-status] ' + why); }
      else console.error('[veo-status] no video, raw: ' + JSON.stringify(r).slice(0, 300)); // v-video-names: الخامّ (@type googleapis…) للسجلّ لا للمستخدم
      await settle(false, why);
      failed(res, why);
      return;
    }
    await settle(true);
    res.status(200).json({
      status: 'SUCCEEDED',
      output: [require('./veo-download.js').downloadUrl(uri)], // v-video-open-lock: موقّع على الملفّ — التنزيل لا يقبل غيره بلا جلسة
    });
  } catch (e) {
    console.error('[veo-status] ' + (e && e.stack ? e.stack : e)); res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
  }
};
