// api/video-download.js — v525
// بروكسي خادم لتحميل الفيديو من Runway/S3 وتمريره للمتصفح بدون قيود CORS
// يحل مشكلة «مايتحمل» على الجوال وهواوي حيث fetch() يفشل cross-origin
//
// v-dl-lock (أمر المالك ٢ أكتوبر «سكّره»): كان يجلب **أيّ** رابط https ويمرّره بنوعه كما هو تحت نطاقنا — فيُقرأ به
// الداخل (localhost، 169.254.169.254، الشبكات الخاصّة) ويُستضاف عبره أيّ ملفّ (صفحة، سكربت، برنامج) باسم موقعنا.
// الآن: (١) العنوان وكلّ تحويلة تُفحص (fetchPublicUrl: لا مضيف خاصّ ولا اسم يُحلّ إلى عنوان خاصّ)؛ (٢) فيديو وصور
// فقط — غير ذلك يُرفض (و«octet-stream» يُقبل بامتداد وسائط ويُرسَل بنوع الامتداد لا بنوعه)، وSVG مرفوض؛ (٣) سقف
// حجم. المضيف لا يُقيَّد بقائمة: حفظ الصور على الجوّال يمرّ هنا لصور من أيّ موقع (صور البحث).
'use strict';
const { fetchPublicUrl } = require('./_lib/safe-url.js');

const MAX_BYTES = 400 * 1024 * 1024; // أطول فيلم دقائق يبقى دونه بكثير
const EXT_TYPE = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const TYPE_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

/** نوع ما يُرسَل للمتصفّح: فيديو أو صورة فقط؛ null = مرفوض. */
function mediaType(upstreamType, url) {
  const t = String(upstreamType || '').split(';')[0].trim().toLowerCase();
  if (/^(video|image)\/[\w.+-]+$/.test(t)) return t === 'image/svg+xml' ? null : t;
  if (!t || t === 'application/octet-stream' || t === 'binary/octet-stream') {
    let ext = '';
    try { ext = (new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || ''; } catch (e) { ext = ''; } // رابط مشوّه — لا امتداد
    return EXT_TYPE[ext.toLowerCase()] || null;
  }
  return null;
}

const deps = { lookup: undefined, fetchFn: undefined }; // للاختبار وحده: حلّ الأسماء والجلب بلا شبكة

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // Express يحلل query string بشكل تلقائي — لا نستدعي decodeURIComponent مرة ثانية
  // لأن روابط GCS/S3 الموقّعة تحتوي على %XX في الـ signature، وإعادة فكّها يكسرها
  const url = String((req.query && req.query.url) || '');
  if (!url || !url.startsWith('https://')) {
    res.status(400).json({ error: 'invalid url' });
    return;
  }

  let upstream;
  try {
    upstream = await fetchPublicUrl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OmranAI/1.0)' } }, { lookup: deps.lookup, fetchFn: deps.fetchFn });
  } catch (e) {
    const msg = String((e && e.message) || e);
    res.status(/blocked|invalid|redirect/.test(msg) ? 403 : 502).json({ error: /blocked|invalid|redirect/.test(msg) ? 'blocked url' : msg.slice(0, 120) });
    return;
  }
  try {
    if (!upstream.ok) {
      try { await upstream.body?.cancel(); } catch (e) { /* guard-ok — تحرير المجرى فقط */ }
      res.status(upstream.status).end();
      return;
    }
    const ct = mediaType(upstream.headers.get('content-type'), url);
    const cl = Number(upstream.headers.get('content-length')) || 0;
    if (!ct || cl > MAX_BYTES) {
      try { await upstream.body?.cancel(); } catch (e) { /* guard-ok — تحرير المجرى فقط */ }
      res.status(ct ? 413 : 415).json({ error: ct ? 'too large' : 'not a video or image' });
      return;
    }
    res.setHeader('Content-Type', ct);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    // Content-Disposition: attachment يجبر المتصفح على التحميل بدل الفتح
    // ضروري على هواوي وأندرويد حيث blob URL لا يُحمَّل بضغطة واحدة
    res.setHeader('Content-Disposition', 'attachment; filename="omran-ai-' + (ct.startsWith('video/') ? 'video' : 'image') + '.' + (TYPE_EXT[ct] || (ct.startsWith('video/') ? 'mp4' : 'png')) + '"');
    if (cl) res.setHeader('Content-Length', String(cl));

    // Stream chunk-by-chunk — لا نضع الفيديو كله في الذاكرة دفعة واحدة
    const reader = upstream.body.getReader();
    let sent = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sent += value.length;
      if (sent > MAX_BYTES) { try { await reader.cancel(); } catch (e) { /* guard-ok — قطع الزائد */ } break; }
      const written = res.write(Buffer.from(value));
      if (!written) {
        // backpressure — انتظر حتى يُفرَّغ البافر
        await new Promise(r => res.once('drain', r));
      }
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: String(e && e.message || e).slice(0, 120) });
    } else {
      res.end();
    }
  }
};
module.exports.mediaType = mediaType;
module.exports.MAX_BYTES = MAX_BYTES;
module.exports.__deps = deps;
