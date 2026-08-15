// 🖼️ v627 — رابط عامّ للصورة المولّدة (أمر عمران: «إرسال لمواقع التواصل بضغطة»).
// لماذا Upstash لا Vercel Blob: Blob موقوف في هذا المشروع (blob-client-upload.js
// يرجع 503 عن قصد)، فلا مزوّد ثانٍ ولا فوترة جديدة — نفس مخزن Redis القائم.
// التخزين: "mime:base64" تحت db/img/<id> بعمر ٣٠ يومًا (الصور لا تُحفظ للأبد).
// الجسم مضغوط من المتصفّح (JPEG ≤1600px) فيبقى دون حدّ جسم الطلب في Vercel.
const crypto = require('crypto');
const { kvSetIfAbsent, kvGetRaw } = require('./kv.js');

const MAX_B64 = 3 * 1024 * 1024; // حدّ أمان لكلّ صورة
const TTL_SEC = 60 * 60 * 24 * 30;
const KEY = (id) => 'db/img/' + id;

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
    const raw = await kvGetRaw(KEY(id));
    if (!raw) { res.status(404).json({ error: 'not_found' }); return; }
    const s = String(raw);
    // v649 — الصيغة الجديدة mime:w:h:base64 (الأبعاد تصنع بطاقة صورة كبيرة في
    // واتساب)؛ القديمة mime:base64 تبقى مقروءة.
    const seg = s.split(':');
    const isNew = seg.length >= 4 && /^\d+$/.test(seg[1]) && /^\d+$/.test(seg[2]);
    const mime = seg.length > 1 ? seg[0] : 'image/jpeg';
    const imgW = isNew ? parseInt(seg[1], 10) : 0;
    const imgH = isNew ? parseInt(seg[2], 10) : 0;
    const i = isNew ? s.indexOf(':', s.indexOf(':', s.indexOf(':') + 1) + 1) : s.indexOf(':');

    // v639 — عيب مقيس حيًّا: بلا Vary خزّن CDN صفحة الزاحف وقدّمها للبشر.
    res.setHeader('Vary', 'User-Agent');
    if (wantRaw) {
      const buf = Buffer.from(s.slice(i + 1), 'base64');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Disposition', 'inline; filename="image-' + id + '.jpg"');
      res.status(200).send(buf);
      return;
    }

    const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const abs = (host ? 'https://' + host : '') + '/i/' + id + '.raw.' + ext;
    const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>عمران AI</title><meta name="robots" content="noindex">'
      + '<meta property="og:type" content="website">'
      + '<meta property="og:title" content="عمران AI">'
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
    const mime = /^image\/(png|jpeg|webp)$/.test(String(body.mime || '')) ? String(body.mime) : 'image/jpeg';
    const id = crypto.randomBytes(6).toString('hex');
    const w = Math.max(0, parseInt(body.w, 10) || 0), h = Math.max(0, parseInt(body.h, 10) || 0);
    const stored = (w && h) ? (mime + ':' + w + ':' + h + ':' + data) : (mime + ':' + data);
    const ok = await kvSetIfAbsent(KEY(id), stored, TTL_SEC);
    if (!ok) { res.status(500).json({ error: 'store_failed' }); return; }
    // v637 — أمر عمران: «صورة خاليه أريد». الرابط المُشارَك يفتح البايتات الخام
    // مباشرةً (صورة وحدها بلا صفحة ولا زرّ)؛ صفحة /i/<id> تبقى للروابط القديمة.
    const outExt = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    res.status(200).json({ id, url: '/i/' + id + '.' + outExt, ttlDays: 30 });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
