// Streams a finished Veo 3 video file to the browser, adding the server's
// API key on the way (the Gemini file URI requires the key to download).
const { fetchPublicUrl } = require('./safe-url.js');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const uri = (req.query && req.query.uri) || '';
    if (!uri) {
      res.status(400).json({ error: 'Bad uri' });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error('[veo-download] missing provider key'); res.status(500).json({ error: 'تعذّر تحميل الفيديو الآن. أعد المحاولة.' }); return; }

    const upstream = await fetchPublicUrl(uri, { headers: { 'x-goog-api-key': apiKey } }, {
      allowedHosts: ['generativelanguage.googleapis.com'],
    });
    if (!upstream.ok) {
      console.error('[veo-download] upstream ' + upstream.status);
      res.status(upstream.status).json({ error: 'تعذّر تحميل الفيديو الآن. أعد المحاولة.' });
      return;
    }
    /* v-video-stream: كان يحمّل المقطع كاملًا في الذاكرة (arrayBuffer ثمّ end(buf)) ويضع طوله في
       Content-Length — وحدّ جسم الردّ للدالّة ٤٫٥ ميغابايت، ومقطع ٨ ثوانٍ 720p ≈ ٧م، فيسقط التسليم
       بعد نجاح التوليد وخصم النقاط: إطار أسود في لوحة الترندات وفشل تنزيل في صانع الفيديو.
       البثّ قطعة قطعة معفى من الحدّ — نفس ما يفعله البروكسي الشقيق api/video-download.js. */
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="omran-ai-video.mp4"');
    res.status(200);
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // backpressure — لا نكدّس القطع في الذاكرة إن كان العميل أبطأ من المصدر
      if (!res.write(Buffer.from(value))) await new Promise((r) => res.once('drain', r));
    }
    res.end();
  } catch (e) {
    console.error('[veo-download] ' + (e && e.message ? e.message : e));
    if (!res.headersSent) res.status(502).json({ error: 'تعذّر تحميل الفيديو الآن. أعد المحاولة.' });
    else res.end();
  }
};
