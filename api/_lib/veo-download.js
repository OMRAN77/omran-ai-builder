// Streams a finished Veo 3 video file to the browser, adding the server's
// API key on the way (the Gemini file URI requires the key to download).
//
// v-video-open-lock: كان بلا ربط بمهمّة ولا مستخدم، ويشغّل مفتاح المالك على **أيّ** مسار GET في المضيف ويبثّ ردّه
// (قائمة الملفّات، العمليّات، النماذج…). الآن:
//   (١) المسار ملفّ مولَّد وحده: /v1beta/files/<id> يُعاد بناؤه رابط تنزيل قانونيًّا (:download?alt=media) — لا مسار آخر
//       ولا استعلام آخر يصل المزوّد بمفتاحنا؛
//   (٢) الإذن: رمز جلسة حقيقيّ (?token= أو Authorization)، أو توقيع الخادم على الملفّ نفسه (&sig=) الذي يضعه
//       veo-status.js وomni-create.js في الرابط حين يسلّمان فيديو مهمّة انتهت. التوقيع لأنّ الرابط يُعرض في <video> ويُحفظ
//       في سجلّ المحادثة، ولا يجوز أن يحمل رمز الجلسة (يُسرَّب بحفظه أو مشاركته)، ولا يستطيع <video> إرسال ترويسة.
const crypto = require('crypto');
const { fetchPublicUrl } = require('./safe-url.js');

const HOST = 'generativelanguage.googleapis.com';
const FILE_PATH = /^\/(v1(?:alpha|beta)?)\/files\/([A-Za-z0-9_-]{1,128})(?::download)?$/;
const ERR = 'تعذّر تحميل الفيديو الآن. أعد المحاولة.';

/** الملفّ المولَّد من الرابط، أو null لأيّ شيء آخر (مضيف، مسار، استعلام، منفذ، هويّة). */
function fileOf(uri) {
  let u;
  try { u = new URL(String(uri || '')); } catch (e) { return null; } // رابط مشوّه — ليس ملفًّا
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== HOST || u.port || u.username || u.password || u.hash) return null;
  const m = u.pathname.match(FILE_PATH);
  if (!m) return null;
  for (const [k, v] of u.searchParams) if (k !== 'alt' || v !== 'media') return null;
  return { ref: m[1] + '/' + m[2], url: 'https://' + HOST + '/' + m[1] + '/files/' + m[2] + ':download?alt=media' };
}

/** توقيع الخادم على ملفّ بعينه (لا ينتهي: ملفّات المزوّد نفسها تُمحى خلال يومين). '' إن تعذّر. */
function sigFor(ref) {
  try {
    return crypto.createHmac('sha256', require('./_secrets.js').AUTH_SECRET).update('veo-dl|' + ref).digest('base64url').slice(0, 32);
  } catch (e) {
    return ''; // بلا سرّ لا توقيع — والتنزيل يطلب جلسة حينها
  }
}

function sigOk(ref, sig) {
  const want = sigFor(ref);
  const got = String(sig || '');
  return !!want && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** الرابط الذي يُسلَّم للعميل: عبر هذا البروكسي، موقّعًا على الملفّ. */
function downloadUrl(uri) {
  const f = fileOf(uri);
  const sig = f ? sigFor(f.ref) : '';
  return '/api/video?action=veo-download&uri=' + encodeURIComponent(uri) + (sig ? '&sig=' + sig : '');
}

const deps = { lookup: undefined, fetchFn: undefined }; // للاختبار وحده: حلّ الأسماء والجلب بلا شبكة

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const q = req.query || {};
    const file = fileOf(q.uri);
    if (!file) {
      res.status(400).json({ error: 'Bad uri' });
      return;
    }
    const session = require('./_session.js');
    if (!sigOk(file.ref, q.sig) && !session.sessionUser(session.tokenOf(req))) {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { console.error('[veo-download] missing provider key'); res.status(500).json({ error: ERR }); return; }

    const upstream = await fetchPublicUrl(file.url, { headers: { 'x-goog-api-key': apiKey } }, {
      allowedHosts: [HOST], lookup: deps.lookup, fetchFn: deps.fetchFn,
    });
    if (!upstream.ok) {
      console.error('[veo-download] upstream ' + upstream.status);
      res.status(upstream.status).json({ error: ERR });
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
    if (!res.headersSent) res.status(502).json({ error: ERR });
    else res.end();
  }
};
module.exports.fileOf = fileOf;
module.exports.downloadUrl = downloadUrl;
module.exports.__deps = deps;
