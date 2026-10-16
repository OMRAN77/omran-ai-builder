// Polls a Google Veo 3 long-running operation. When done, returns a
// same-origin download URL (proxied through veo-download so the API key
// never reaches the browser).
const GL = 'https://generativelanguage.googleapis.com/v1beta';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const op = (req.query && req.query.op) || '';
    if (!op || !/^[\w./-]+$/.test(op)) { res.status(400).json({ error: 'Missing op' }); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error('[veo-status] missing provider key'); res.status(500).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' }); return; }

    const upstream = await fetch(GL + '/' + op, { headers: { 'x-goog-api-key': apiKey } });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : JSON.stringify(data);
      console.error('[veo-status] upstream ' + upstream.status + ': ' + String(msg).slice(0, 300));
      res.status(upstream.status).json({ error: 'تعذّر متابعة الفيديو الآن. أعد المحاولة.' });
      return;
    }
    if (!data.done) { res.status(200).json({ status: 'RUNNING' }); return; }
    // v-video-refund: انتهت المهمّة — نسوّي تذكرتها قبل الردّ (الفشل يردّ الخصم ويفكّ القفل).
    const settle = (ok) => require('./video-job.js').settleVideoJob(op, ok);
    if (data.error) {
      await settle(false);
      res.status(200).json({ status: 'FAILED', failure: String(data.error.message || '').slice(0, 300) });
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
      await settle(false);
      let why = 'no video in response';
      const rai = gvr.raiMediaFilteredReasons || r.raiMediaFilteredReasons;
      if (rai && rai.length) why = 'filtered: ' + String(rai.join(' | ')).slice(0, 400);
      else console.error('[veo-status] no video, raw: ' + JSON.stringify(r).slice(0, 300)); // v-video-names: الخامّ (@type googleapis…) للسجلّ لا للمستخدم
      res.status(200).json({ status: 'FAILED', failure: why });
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
