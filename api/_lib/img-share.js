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
    const id = String((req.query && req.query.id) || '').replace(/[^a-f0-9]/g, '').slice(0, 24);
    if (!id) { res.status(400).json({ error: 'Missing id' }); return; }
    const raw = await kvGetRaw(KEY(id));
    if (!raw) { res.status(404).json({ error: 'not_found' }); return; }
    const s = String(raw);
    const i = s.indexOf(':');
    const mime = i > 0 ? s.slice(0, i) : 'image/jpeg';
    const buf = Buffer.from(s.slice(i + 1), 'base64');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', 'inline; filename="omran-' + id + '.jpg"');
    res.status(200).send(buf);
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
