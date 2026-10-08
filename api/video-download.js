// api/video-download.js — v525
// بروكسي خادم لتحميل الفيديو من Runway/S3 وتمريره للمتصفح بدون قيود CORS
// يحل مشكلة «مايتحمل» على الجوال وهواوي حيث fetch() يفشل cross-origin
//
// v-dl-lock (أمر المالك ٢ أكتوبر «سكّره»): كان يجلب **أيّ** رابط https ويمرّره بنوعه كما هو تحت نطاقنا — فيُقرأ به
// الداخل (localhost، 169.254.169.254، الشبكات الخاصّة) ويُستضاف عبره أيّ ملفّ (صفحة، سكربت، برنامج) باسم موقعنا.
// الآن: (١) العنوان وكلّ تحويلة تُفحص (fetchPublicUrl: لا مضيف خاصّ ولا اسم يُحلّ إلى عنوان خاصّ)؛ (٢) فيديو وصور
// فقط — غير ذلك يُرفض (و«octet-stream» يُقبل بامتداد وسائط ويُرسَل بنوع الامتداد لا بنوعه)، وSVG مرفوض؛ (٣) سقف
// حجم. المضيف لا يُقيَّد بقائمة: حفظ الصور على الجوّال يمرّ هنا لصور من أيّ موقع (صور البحث).
//
// v-video-open-lock: وبقي بلا أيّ ربط — أيّ زائر يمرّر عبره حتّى ٤٠٠م وخمس دقائق دالّة لكلّ طلب على حساب المالك. الآن رمز
// جلسة حقيقيّ (?token= — رابط التحميل يُفتح بلمسة أو في متصفّح خارجيّ فلا ترويسة) وسقف ثابت ٢٠ وسيطًا يوميًّا للحساب
// (checkAndConsumeCustom: المالك وVIP معفيّان، والمحظور مرفوض). يُعدّ الرابط الواحد مرّة في يومه: الواجهة تجلب الفيديو
// ثمّ يضغط المستخدم «تحميل» للرابط نفسه، ومنزّل النظام قد يعيد الطلب — كلّ ذلك وسيط واحد لا ثلاثة.
//
// المراجعة المعاكسة على v-video-open-lock:
//   v-dl-ours: نواتج خادمنا (our-media.js) تمرّ بلا عدّ — كانت فيديوهات المستخدم المدفوعة تُعدّ مع أيّ صورة خارجيّة فتردّ 429.
//   v-dl-ticket: رمز الجلسة (٣٠ يومًا) كان في الرابط فيتسرّب من سجلّات الطلبات وزرّ «فتح» والمشاركة. الآن الجلب بترويسة
//     Authorization: Bearer، والرابط الذي يُنقر أو يُفتح خارج التطبيق يحمل تذكرة تنزيل (?dt=) لرابط واحد وساعة واحدة يصدرها
//     ?action=ticket بعد الإذن نفسه (فالعدّ عند الإصدار، مرّة).
//   v-refund-custom: ما عُدّ ثمّ فشل جلبه قبل أوّل بايت (مضيف محجوب، 404، نوع غير وسائط) يُردّ إلى العدّاد.
'use strict';
const crypto = require('crypto');
const { fetchPublicUrl } = require('./_lib/safe-url.js');

const MAX_BYTES = 400 * 1024 * 1024; // أطول فيلم دقائق يبقى دونه بكثير
const DOWNLOAD_DAILY = 20;
const TICKET_TTL_MS = 60 * 60 * 1000; // v-dl-ticket: ساعة — ورقة الجوّال تُغلق بعد دقيقتين، ومنزّل النظام يعيد خلال ثوانٍ
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

/* v-dl-ticket: AES-256-GCM بمفتاح مشتقّ من AUTH_SECRET بوسم خاصّ — فلا تصلح رمز جلسة في أيّ نقطة، ولا يُقرأ ما فيها:
   الحساب لا يظهر في الرابط (مفتاح حساب Google بريده). مربوطة بالحساب والرابط ومدّتها ساعة. السرّ يُقرأ عند النداء. */
function ticketKey() { return crypto.createHmac('sha256', require('./_lib/_secrets.js').AUTH_SECRET).update('video-download-ticket/v1').digest(); }
const urlTag = (url) => crypto.createHash('sha256').update(String(url)).digest('base64url').slice(0, 22);
function mintTicket(username, url) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ticketKey(), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ u: username, h: urlTag(url), e: Date.now() + TICKET_TTL_MS }), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
/** الحساب من تذكرة صالحة لهذا الرابط بعينه، وإلّا null — لا يرمي. */
function ticketUser(ticket, url) {
  try {
    const raw = Buffer.from(String(ticket || ''), 'base64url');
    if (raw.length < 29 || raw.length > 512) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', ticketKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const data = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
    if (!data || typeof data.u !== 'string' || !data.u || data.h !== urlTag(url) || !(Number(data.e) > Date.now())) return null;
    return data.u;
  } catch (e) {
    return null; // تذكرة مشوّهة أو مزوّرة أو منتهية أو لرابط آخر
  }
}

/** الإذن قبل أيّ جلب: { status, error } = رفض؛ وإلّا { username, refund } — refund دالّة تردّ العدّ إن عُدّ هذا الطلب. */
async function admit(req, url) {
  const session = require('./_lib/_session.js');
  const token = session.tokenOf(req);
  const username = session.sessionUser(token);
  if (!username) return { status: 401, error: 'auth_required' };
  const banned = async () => require('./_lib/auth.js').isBanned(username);
  // v-dl-ours: ناتج سلّمه خادمنا — مدفوع، فحفظه لا يُعدّ على سقف الوسائط الخارجيّة
  if (await require('./_lib/our-media.js').isOurMedia(url)) return (await banned()) ? { status: 403, error: 'banned' } : { username, refund: null };
  const day = new Date().toISOString().slice(0, 10);
  const seenKey = 'dl:seen:' + crypto.createHash('sha256').update(username.toLowerCase() + '|' + day + '|' + url).digest('hex').slice(0, 40);
  const kv = require('./_lib/kv.js');
  let seen = false;
  try { seen = !!(await kv.kvGetRaw(seenKey)); } catch (e) { seen = false; } // تعذّر القراءة = يُعدّ كأنّه جديد
  if (seen) return (await banned()) ? { status: 403, error: 'banned' } : { username, refund: null };
  const usage = require('./_lib/_usage.js');
  const gate = await usage.checkAndConsumeCustom(token, null, usage.clientIp(req), 'video-download', DOWNLOAD_DAILY);
  if (!gate.allowed) {
    if (gate.banned) return { status: 403, error: 'banned' };
    if (gate.reason === 'auth') return { status: 401, error: 'auth_required' };
    return { status: 429, error: 'daily_limit_reached' };
  }
  try { await kv.kvSetRaw(seenKey, '1', 2 * 86400); } catch (e) { console.warn('[video-download] seen mark failed:', e && e.message); }
  // v-refund-custom: الردّ يمحو علامة «عُدّ اليوم» أيضًا — وإلّا صار رابط فشل مرّة مجّانيًّا حين ينجح لاحقًا
  const refund = async () => {
    await usage.refundCustom(token, null, usage.clientIp(req), 'video-download');
    try { await kv.kvDel(seenKey); } catch (e) { console.warn('[video-download] seen unmark failed:', e && e.message); }
  };
  return { username, refund: gate.remaining === Infinity ? null : refund }; // المالك وVIP لا يُعدّون فلا يُردّ لهم شيء
}

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
  const action = String((req.query && req.query.action) || '');
  let admitted;
  try {
    // v-dl-ticket: رابط يحمل تذكرة صالحة لهذا الرابط بعينه — عُدّ عند إصدارها، فلا عدّ ولا ردّ هنا
    const viaTicket = action !== 'ticket' && req.query && req.query.dt ? ticketUser(req.query.dt, url) : null;
    if (viaTicket) admitted = (await require('./_lib/auth.js').isBanned(viaTicket)) ? { status: 403, error: 'banned' } : { username: viaTicket, refund: null };
    else admitted = await admit(req, url);
  } catch (e) {
    console.error('[video-download] admit failed:', e && e.message);
    res.status(500).json({ error: 'unavailable' });
    return;
  }
  if (admitted.status) { res.status(admitted.status).json({ error: admitted.error }); return; }
  if (action === 'ticket') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ticket: mintTicket(admitted.username, url), ttl: TICKET_TTL_MS / 1000 });
    return;
  }
  const refund = async () => { if (admitted.refund) await admitted.refund(); };

  let upstream;
  try {
    upstream = await fetchPublicUrl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OmranAI/1.0)' } }, { lookup: deps.lookup, fetchFn: deps.fetchFn });
  } catch (e) {
    await refund();
    const msg = String((e && e.message) || e);
    res.status(/blocked|invalid|redirect/.test(msg) ? 403 : 502).json({ error: /blocked|invalid|redirect/.test(msg) ? 'blocked url' : msg.slice(0, 120) });
    return;
  }
  try {
    if (!upstream.ok) {
      try { await upstream.body?.cancel(); } catch (e) { /* guard-ok — تحرير المجرى فقط */ }
      await refund();
      res.status(upstream.status).end();
      return;
    }
    const ct = mediaType(upstream.headers.get('content-type'), url);
    const cl = Number(upstream.headers.get('content-length')) || 0;
    if (!ct || cl > MAX_BYTES) {
      try { await upstream.body?.cancel(); } catch (e) { /* guard-ok — تحرير المجرى فقط */ }
      await refund();
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
      await refund();
      res.status(502).json({ error: String(e && e.message || e).slice(0, 120) });
    } else {
      res.end();
    }
  }
};
module.exports.mediaType = mediaType;
module.exports.ticketUser = ticketUser;
module.exports.MAX_BYTES = MAX_BYTES;
module.exports.DOWNLOAD_DAILY = DOWNLOAD_DAILY;
module.exports.__deps = deps;
