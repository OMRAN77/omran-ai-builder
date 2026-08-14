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
    const wantRaw = /\.(jpe?g|jpg|png|webp)$/i.test(rawId)
      || String((req.query && req.query.raw) || '') === '1';
    const id = rawId.replace(/[^a-f0-9]/g, '').slice(0, 24);
    if (!id) { res.status(400).json({ error: 'Missing id' }); return; }
    const raw = await kvGetRaw(KEY(id));
    if (!raw) { res.status(404).json({ error: 'not_found' }); return; }
    const s = String(raw);
    const i = s.indexOf(':');
    const mime = i > 0 ? s.slice(0, i) : 'image/jpeg';

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
    const abs = (host ? 'https://' + host : '') + '/i/' + id + '.' + ext;
    const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>عمران AI</title><meta name="robots" content="noindex">'
      + '<meta property="og:type" content="website">'
      + '<meta property="og:title" content="عمران AI">'
      + '<meta property="og:image" content="' + abs + '">'
      + '<meta property="og:image:secure_url" content="' + abs + '">'
      + '<meta property="og:image:type" content="' + mime + '">'
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
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=86400');
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
    const ok = await kvSetIfAbsent(KEY(id), mime + ':' + data, TTL_SEC);
    if (!ok) { res.status(500).json({ error: 'store_failed' }); return; }
    res.status(200).json({ id, url: '/i/' + id, ttlDays: 30 });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
