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
  // v-sig-bytes (المراجعة المعاكسة): طول النصّ ليس طول البايتات — حرف متعدّد البايتات بالطول نفسه كان يرمي في timingSafeEqual (502 بدل 401)
  const want = Buffer.from(sigFor(ref));
  const got = Buffer.from(String(sig || ''));
  return want.length > 0 && got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** الرابط الذي يُسلَّم للعميل: عبر هذا البروكسي، موقّعًا على الملفّ. */
function downloadUrl(uri) {
  const f = fileOf(uri);
  const sig = f ? sigFor(f.ref) : '';
  return '/api/video?action=veo-download&uri=' + encodeURIComponent(uri) + (sig ? '&sig=' + sig : '');
}

const deps = { lookup: undefined, fetchFn: undefined }; // للاختبار وحده: حلّ الأسماء والجلب بلا شبكة

/* v-audit-video (srv-video-3): بثّ المصدر إلى الردّ قطعةً قطعة بضغط عكسيّ يعرف رحيل العميل. كان انتظار 'drain' وحده — وبعد قطع
   العميل يرجع write قيمة false ولا يأتي drain أبدًا، فتبقى الدالّة معلّقة حتّى مهلتها (٣٠٠ث) ولا يُحسب ما بُثّ. الآن drain أو close
   أيّهما أسبق، ثمّ يُلغى المصدر. m.sent = ما كُتب فعلًا (يبقى صحيحًا لو رمى المصدر)، وonStep(sent) كلّ step بايت ليُعدّ المبثوث أثناء
   البثّ لا بعده (false منه = توقّف). يشاركه api/video-download.js. */
async function pipeBody(body, res, opt) {
  const o = opt || {};
  const m = o.meter || { sent: 0 };
  const max = o.max || Infinity, step = o.step || 4 * 1024 * 1024;
  const reader = body.getReader();
  let gone = false, mark = 0;
  const onClose = () => { gone = true; };
  if (typeof res.on === 'function') res.on('close', onClose);
  const left = () => gone || res.destroyed === true;
  try {
    while (!left()) {
      const { done, value } = await reader.read();
      if (done) break;
      if (m.sent + value.length > max) break; // قطع الزائد
      m.sent += value.length;
      if (!res.write(Buffer.from(value)) && !left()) {
        await new Promise((r) => {
          const fin = () => { if (typeof res.removeListener === 'function') { res.removeListener('drain', fin); res.removeListener('close', fin); } r(); };
          res.once('drain', fin); res.once('close', fin);
        });
      }
      if (o.onStep && m.sent - mark >= step) { mark = m.sent; if ((await o.onStep(m.sent)) === false) break; }
    }
  } finally {
    if (typeof res.removeListener === 'function') res.removeListener('close', onClose);
    try { await reader.cancel(); } catch (e) { /* guard-ok — المصدر انتهى أو انقطع */ }
  }
  return m.sent;
}

/* v-audit-video (srv-video-3): الرابط الموقّع على الملفّ كان يعيد البثّ بلا أيّ حدّ. سقف بايت يوميّ لكلّ ملفّ (١ غ.ب افتراضيًّا ≈
   مئات المشاهدات الكاملة لمقطع ثوانٍ؛ VEO_DL_BYTES_DAILY في البيئة)، يُحجز ذرّيًّا قبل البثّ (content-length) ويُسوّى بالمبثوث فعلًا. */
const VEO_DL_BYTES_DAILY = () => Math.max(1, Number(process.env.VEO_DL_BYTES_DAILY) || 1024 * 1024 * 1024);
const VEO_DL_STEP = 4 * 1024 * 1024;
function veoBytesKey(ref) { return 'veo:dl:bytes:' + ref + ':' + new Date().toISOString().slice(0, 10); }
/** يضيف n (أو يطرح إن كان سالبًا) ويرجع المجموع بعده، أو null إن تعذّر KV — أفضل جهد لا يوقف البثّ. */
async function veoBytesAdd(ref, n) {
  const amt = Math.trunc(Number(n) || 0);
  if (!amt) return null;
  try {
    const kv = require('./kv.js');
    const total = Number(await kv.kvIncrBy(veoBytesKey(ref), amt));
    if (total === amt) { try { await kv.kvExpire(veoBytesKey(ref), 2 * 86400); } catch (e) { /* guard-ok — المفتاح مؤرَّخ أصلًا */ } }
    return Number.isFinite(total) ? total : null;
  } catch (e) { return null; } // أفضل جهد — عطب KV لا يوقف البثّ
}

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
    // v-audit-video (srv-video-3): سقف الملفّ لليوم قبل أيّ جلب
    const capB = VEO_DL_BYTES_DAILY();
    let used = 0;
    try { used = Number(await require('./kv.js').kvGetRaw(veoBytesKey(file.ref))) || 0; } catch (e) { used = 0; } // تعذّر القراءة = لا يُمنع
    if (used >= capB) { res.status(429).json({ error: 'daily_limit_reached' }); return; }

    const upstream = await fetchPublicUrl(file.url, { headers: { 'x-goog-api-key': apiKey } }, {
      allowedHosts: [HOST], lookup: deps.lookup, fetchFn: deps.fetchFn,
    });
    if (!upstream.ok) {
      console.error('[veo-download] upstream ' + upstream.status);
      res.status(upstream.status).json({ error: ERR });
      return;
    }
    // حجز ذرّيّ قبل البثّ: الطلبات المتوازية ترى حجوز بعضها (كانت كلّها تمرّ والعدّاد صفر)
    const est = Number(upstream.headers.get('content-length')) || VEO_DL_STEP;
    const after = await veoBytesAdd(file.ref, est);
    let counted = est;
    if (after !== null && after - est >= capB) {
      await veoBytesAdd(file.ref, -est);
      try { await upstream.body?.cancel(); } catch (e) { /* guard-ok — تحرير المجرى فقط */ }
      res.status(429).json({ error: 'daily_limit_reached' });
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
    // backpressure يعرف رحيل العميل (pipeBody)؛ المبثوث يُعدّ أثناء البثّ ويُسوّى الحجز به في النهاية
    const meter = { sent: 0 };
    try {
      await pipeBody(upstream.body, res, { meter, step: VEO_DL_STEP, onStep: async (n) => {
        if (n <= counted) return true;
        const total = await veoBytesAdd(file.ref, n - counted); counted = n;
        return !(total !== null && total > capB + 512 * 1024 * 1024); // مجرى بلا طول معلن: يُكمل ملفًّا واحدًا ولا يتجاوز بلا حدّ
      } });
    } finally {
      if (meter.sent !== counted) await veoBytesAdd(file.ref, meter.sent - counted);
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
module.exports.pipeBody = pipeBody;
module.exports.__deps = deps;
