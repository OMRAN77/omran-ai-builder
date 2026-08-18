// api/video-download.js — v525
// بروكسي خادم لتحميل الفيديو من Runway/S3 وتمريره للمتصفح بدون قيود CORS
// يحل مشكلة «مايتحمل» على الجوال وهواوي حيث fetch() يفشل cross-origin
'use strict';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // Express يحلل query string بشكل تلقائي — لا نستدعي decodeURIComponent مرة ثانية
  // لأن روابط GCS/S3 الموقّعة تحتوي على %XX في الـ signature، وإعادة فكّها يكسرها
  const url = String((req.query && req.query.url) || '');
  if (!url || !url.startsWith('https://')) {
    res.status(400).json({ error: 'invalid url: ' + url.slice(0, 80) });
    return;
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OmranAI/1.0)' },
    });
    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }
    const ct = upstream.headers.get('content-type') || 'video/mp4';
    const cl = upstream.headers.get('content-length');
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-store');
    if (cl) res.setHeader('Content-Length', cl);

    // Stream chunk-by-chunk — لا نضع الفيديو كله في الذاكرة دفعة واحدة
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const written = res.write(Buffer.from(value));
      if (!written) {
        // backpressure — انتظر حتى يُفرَّغ البافر
        await new Promise(r => res.once('drain', r));
      }
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: String(e && e.message || e) });
    } else {
      res.end();
    }
  }
};
