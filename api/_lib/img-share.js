// 🖼️ v627 — رابط عامّ للصورة المولّدة (أمر عمران: «إرسال لمواقع التواصل بضغطة»).
// لماذا Upstash لا Vercel Blob: Blob موقوف في هذا المشروع (blob-client-upload.js
// يرجع 503 عن قصد)، فلا مزوّد ثانٍ ولا فوترة جديدة — نفس مخزن Redis القائم.
// التخزين: "mime:base64" تحت db/img/<id> بعمر ٣٠ يومًا (الصور لا تُحفظ للأبد).
// الجسم مضغوط من المتصفّح (JPEG ≤1600px) فيبقى دون حدّ جسم الطلب في Vercel.
const crypto = require('crypto');
const { kvSetIfAbsent, kvGetRaw } = require('./kv.js');
const KV = require('./kv.js');
const { setIfAbsentWithRoom } = require('./media-purge.js'); // v-media-autopurge: القاعدة ممتلئة → تنظيف المشاركات القديمة ثمّ إعادة
const { gateShare, refundShare, uploadPlan } = require('./share-gate.js'); // v-share-guard: الرفع برمز جلسة وسقف يوميّ — العرض العامّ (GET) بلا رمز كما كان

const MAX_B64 = 3 * 1024 * 1024; // حدّ أمان لكلّ صورة
const TTL_SEC = 60 * 60 * 24 * 7; // v-media-purge: كان ٣٠ يومًا فامتلأت القاعدة المجانيّة — ٧ كالفيديو والـPDF
const DAILY_UPLOADS = 30; // v-share-guard: روابط صور يوميًّا لكلّ حساب
const KEY = (id) => 'db/img/' + id;
const AGENT_TTL_SEC = 60 * 60 * 24; // v-agent-img: صور المزوّد للمالك يومًا واحدًا — تكفي للرفع، وRedis قرب الامتلاء
/** بصمة المحتوى (١٦ خانة) — معرّف ثابت للصورة نفسها */
function contentId(b64) { return crypto.createHash('sha256').update(String(b64 || '')).digest('hex').slice(0, 16); }
const CHUNK = 700 * 1024;

/* v-gen-image (أمر المالك ١٣ أكتوبر «اذا شفت الصورة عند مزوّد اقوله عمّم… كل شي موجود في التطبيق نفسه»): الحفظ والقراءة
   دالّتان يستعملهما «عمّم» على صورة (prov-self) ورفع الصورة إلى المستودع (github-write)، بالمخزن والصيغة نفسيهما. */
// ما خُزّن تحت db/img/<id> (مع أجزائه) نصًّا «mime[:w:h]:base64» — { s } أو { error: 'not_found' | 'chunk_missing' }.
async function readStored(id) {
  const raw = await kvGetRaw(KEY(id));
  if (!raw) return { error: 'not_found' };
  let s = String(raw);
  /* دعم أجزاء للصور الكبيرة (مثل PDF) */
  if (s.indexOf('chunks:') === 0) {
    const parts = s.split(':');
    const n = parseInt(parts[1], 10) || 0;
    const prefix = parts.slice(2).join(':');
    const pieces = [];
    for (let i = 0; i < n; i++) {
      let c = await kvGetRaw(KEY(id) + ':' + i);
      if (!c) {
        await new Promise(r => setTimeout(r, 100));
        c = await kvGetRaw(KEY(id) + ':' + i).catch(() => null);
      }
      if (!c) return { error: 'chunk_missing' };
      pieces.push(String(c));
    }
    s = prefix + pieces.join('');
  }
  return { s };
}
// v649 — الصيغة الجديدة mime:w:h:base64 (الأبعاد تصنع بطاقة صورة كبيرة في واتساب)؛ القديمة mime:base64 تبقى مقروءة.
function parseStored(s) {
  const seg = s.split(':');
  const isNew = seg.length >= 4 && /^\d+$/.test(seg[1]) && /^\d+$/.test(seg[2]);
  const i = isNew ? s.indexOf(':', s.indexOf(':', s.indexOf(':') + 1) + 1) : s.indexOf(':');
  return { mime: seg.length > 1 ? seg[0] : 'image/jpeg', w: isNew ? parseInt(seg[1], 10) : 0, h: isNew ? parseInt(seg[2], 10) : 0, b64: s.slice(i + 1) };
}
async function getImage(id) {
  const st = await readStored(String(id || ''));
  return st.error ? null : parseStored(st.s);
}
// يحفظ base64 بعمر ttlSec ويرجع المعرّف، أو '' إن فشل الحفظ (القاعدة ممتلئة رغم التنظيف أو عطل).
// v-agent-img: fixedId (بصمة المحتوى) = الصورة نفسها مفتاح واحد — موجودة تُرجَع بلا كتابة ثانية.
async function putImage(data, mime, w, h, ttlSec, fixedId) {
  const id = /^[a-f0-9]{12,24}$/.test(String(fixedId || '')) ? String(fixedId) : crypto.randomBytes(6).toString('hex');
  if (fixedId && id === fixedId) { try { if (await kvGetRaw(KEY(id))) return id; } catch (e) { /* guard-ok — القراءة تحسين؛ الكتابة بعدها تحسم */ } }
  const W = Math.max(0, parseInt(w, 10) || 0), H = Math.max(0, parseInt(h, 10) || 0);
  const prefix = (W && H) ? (mime + ':' + W + ':' + H + ':') : (mime + ':');
  let ok;
  try {
    if (data.length <= CHUNK) {
      ok = await setIfAbsentWithRoom(KV, KEY(id), prefix + data, ttlSec);
    } else {
      const n = Math.ceil(data.length / CHUNK);
      ok = true;
      for (let i = 0; i < n && ok; i++) {
        const ok_i = await setIfAbsentWithRoom(KV, KEY(id) + ':' + i, data.slice(i * CHUNK, (i + 1) * CHUNK), ttlSec);
        ok = ok && ok_i;
      }
      if (ok) ok = await setIfAbsentWithRoom(KV, KEY(id), 'chunks:' + n + ':' + prefix, ttlSec);
    }
  } catch (e) {
    console.error('[img-share] store failed:', e && e.message); // القاعدة ممتلئة رغم التنظيف أو عطل — يُردّ كـstore_failed
    ok = false;
  }
  if (!ok && fixedId && id === fixedId) return putImage(data, mime, w, h, ttlSec); // v-agent-img: أجزاء ناقصة من محاولة سابقة تحجز البصمة يومًا — معرّف عشوائيّ بدلها
  return ok ? id : '';
}
async function delImage(id) {
  const k = KEY(String(id || ''));
  const raw = await kvGetRaw(k);
  const n = raw && String(raw).indexOf('chunks:') === 0 ? (parseInt(String(raw).split(':')[1], 10) || 0) : 0;
  for (let i = 0; i < n; i++) await KV.kvDel(k + ':' + i);
  await KV.kvDel(k);
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // v632 — أمر عمران: الرابط المُرسَل يفتح الصورة، لا يبقى نصًّا.
    // /i/<id>        → صفحة تعرض الصورة + وسوم معاينة (واتساب/تلغرام/تويتر).
    // /i/<id>.jpg    → البايتات الخام (وهي مصدر og:image ورابط التنزيل).
    const rawId = String((req.query && req.query.id) || '');
    // v638 — أمر عمران «الحينه رابط فقط»: زاحف المعاينة (واتساب/تلغرام/فيسبوك) لا
    // يقرأ وسوم og من بايتات صورة، فظهر الرابط نصًّا بلا صورة. الحلّ: نفس الرابط
    // يخدم البايتات للبشر (صورة خاليه كما أمر) ووسوم og للزاحف وحده، وog:image
    // يشير إلى /i/<id>.raw.jpg الي يعيد البايتات لأيّ طالب بلا استثناء.
    const ua = String(req.headers['user-agent'] || '');
    const isCrawler = /facebookexternalhit|WhatsApp|Twitterbot|TelegramBot|Discordbot|Slackbot|LinkedInBot|SkypeUriPreview|Pinterest|vkShare|redditbot|Iframely|embedly|Applebot|Viber|Line\/|Googlebot|bingbot|Snapchat|Instagram/i.test(ua);
    const forceRaw = /\.raw\./i.test(rawId) || String((req.query && req.query.raw) || '') === '1';
    const wantRaw = (forceRaw || /\.(jpe?g|png|webp)$/i.test(rawId)) && !(isCrawler && !forceRaw);
    // v639 — عيب مقيس: النزع الأعمى للأحرف يخلط لاحقة المسار بالمعرّف
    // (`<id>.raw.jpg` → المعرّف + `a` من «raw» ⇒ 404). نأخذ أوّل مقطع ستّ عشريّ فقط.
    const id = String((rawId.match(/^[a-f0-9]{6,24}/i) || [''])[0]).toLowerCase();
    if (!id) { res.status(400).json({ error: 'Missing id' }); return; }
    const st = await readStored(id);
    if (st.error === 'not_found') { res.status(404).json({ error: 'not_found' }); return; }
    if (st.error) { res.status(503).json({ error: 'chunk_missing', detail: 'جزء من الصورة اختفى — حاول لاحقًا' }); return; }
    const { mime, w: imgW, h: imgH, b64 } = parseStored(st.s);

    // v639 — عيب مقيس حيًّا: بلا Vary خزّن CDN صفحة الزاحف وقدّمها للبشر.
    res.setHeader('Vary', 'User-Agent');
    if (wantRaw) {
      let buf;
      try {
        buf = Buffer.from(b64, 'base64');
      } catch (e) {
        res.status(400).json({ error: 'corrupt', detail: 'بيانات الصورة معيوبة' });
        return;
      }
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Accept-Ranges', 'bytes');
      /* v-media-dl (شكوى المالك «ما تتحمل الصور»): ?dl=1 يجعل الرابط تنزيلًا حقيقيًا عبر منزّل النظام */
      const wantDl = String((req.query && req.query.dl) || '') === '1';
      const dlName = String((req.query && req.query.name) || '').replace(/[^A-Za-z0-9_\-.]/g, '-').slice(0, 60) || ('omran-' + id + '.' + (mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg')));
      res.setHeader('Content-Disposition', (wantDl ? 'attachment' : 'inline') + '; filename="' + (wantDl ? dlName : 'image-' + id + '.jpg') + '"');
      res.setHeader('Content-Length', String(buf.length));
      res.status(200).send(buf);
      return;
    }

    const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const abs = (host ? 'https://' + host : '') + '/i/' + id + '.raw.' + ext;
    const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>om ai</title><meta name="robots" content="noindex">'
      + '<meta property="og:type" content="website">'
      + '<meta property="og:title" content="om ai">'
      + '<meta property="og:image" content="' + abs + '">'
      + '<meta property="og:image:secure_url" content="' + abs + '">'
      + '<meta property="og:image:type" content="' + mime + '">'
      + (imgW && imgH ? '<meta property="og:image:width" content="' + imgW + '"><meta property="og:image:height" content="' + imgH + '">' : '')
      + '<meta name="twitter:card" content="summary_large_image">'
      + '<meta name="twitter:image" content="' + abs + '">'
      + '<link rel="preload" as="image" href="' + abs + '">'
      + '<style>*{box-sizing:border-box}html,body{margin:0;height:100%}'
      + 'body{background:#0c0e11;color:#e9edf2;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:18px}'
      + 'img{max-width:100%;max-height:78vh;width:auto;height:auto;border-radius:14px;display:block;'
      + 'box-shadow:0 18px 50px rgba(0,0,0,.5)}'
      + 'a{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:#0c0e11;background:#e9edf2;'
      + 'font-weight:600;font-size:15px;padding:11px 22px;border-radius:999px}a:active{transform:scale(.98)}</style>'
      + '</head><body>'
      + '<img src="' + abs + '" alt="صورة">'
      + '<a href="' + abs + '" download="image-' + id + '.' + ext + '">تنزيل الصورة</a>'
      + '</body></html>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(html);
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
    let data = typeof body.data === 'string' ? body.data : '';
    if (data.slice(0, 5) === 'data:') data = data.slice(data.indexOf(',') + 1);
    data = data.replace(/\s+/g, '');
    if (!data) { res.status(400).json({ error: 'Missing data' }); return; }
    if (data.length > MAX_B64) { res.status(413).json({ error: 'too_large' }); return; }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) { res.status(400).json({ error: 'bad_data' }); return; }
    const plan = uploadPlan(body, 'share-img', DAILY_UPLOADS, TTL_SEC); // v-media-save: التنزيل في سلّته وبعمر ساعة
    const __user = await gateShare(req, res, body, plan.bucket, plan.limit, data.length); // v-share-bytes
    if (!__user) return;
    /* v-agent-img: صورة رسمها المزوّد للمالك (purpose:'agent') — للمالك وحده، ٢٤ ساعة لا أسبوع (Redis قرب الامتلاء)،
       وبصمة المحتوى معرّفها فالصورة نفسها لا تُكتب مرّتين. */
    const __agent = body.purpose === 'agent';
    if (__agent && !require('./_owner.js').isOwnerName(__user)) { await refundShare(req, body, plan.bucket); res.status(403).json({ error: 'owner_only' }); return; }
    const mime = /^image\/(png|jpeg|webp)$/.test(String(body.mime || '')) ? String(body.mime) : 'image/jpeg';
    const id = await putImage(data, mime, body.w, body.h, __agent ? AGENT_TTL_SEC : plan.ttlSec, __agent ? contentId(data) : ''); // دعم أجزاء للصور الكبيرة داخلها

    if (!id) { await refundShare(req, body, plan.bucket); res.status(500).json({ error: 'store_failed' }); return; } // v-refund-custom
    // v637 — أمر عمران: «صورة خاليه أريد». الرابط المُشارَك يفتح البايتات الخام
    // مباشرةً (صورة وحدها بلا صفحة ولا زرّ)؛ صفحة /i/<id> تبقى للروابط القديمة.
    const outExt = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    if (__agent) { res.status(200).json({ id, url: '/i/' + id + '.' + outExt, ttlDays: 1 }); return; } // v-agent-img: يوم واحد
    res.status(200).json({ id, url: '/i/' + id + '.' + outExt, ttlDays: 7 });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
module.exports.putImage = putImage;
module.exports.contentId = contentId;
module.exports.AGENT_TTL_SEC = AGENT_TTL_SEC;
module.exports.getImage = getImage;
module.exports.delImage = delImage;
