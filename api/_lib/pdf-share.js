// 📄 v-pdf-link — رابط تنزيل حقيقي لملفات PDF المولّدة في المتصفح.
// السبب (شكوى ٢٩ أغسطس: «في التطبيق ما يشتغل وفي جوجل يشتغل»): أغلفة
// التطبيقات (TWA/WebView) لا تنفّذ تنزيل الملفات المولّدة محليًّا
// (<a download> على blob) ولا مشاركة الملفات — بينما فتح رابط HTTPS عادي
// بترويسة Content-Disposition يعمل في كل غلاف عبر منزّل النظام نفسه.
// نفس نمط img-share.js: التخزين في Redis (Upstash) تحت db/pdf/<id>
// بعمر ٧ أيام (الملف يُنزَّل فورًا — لا حاجة لعمر أطول).
const crypto = require('crypto');
const { kvSetIfAbsent, kvGetRaw } = require('./kv.js');

const MAX_B64 = 4 * 1024 * 1024; // ≈3MB ملف فعلي — تحت حدّ جسم الطلب في Vercel
const TTL_SEC = 60 * 60 * 24 * 7;
const KEY = (id) => 'db/pdf/' + id;

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const rawId = String((req.query && req.query.id) || '');
    const id = String((rawId.match(/^[a-f0-9]{6,24}/i) || [''])[0]).toLowerCase();
    if (!id) { res.status(400).json({ error: 'Missing id' }); return; }
    const raw = await kvGetRaw(KEY(id));
    if (!raw) { res.status(404).json({ error: 'not_found' }); return; }
    const s = String(raw);
    // الصيغة: name:base64 — الاسم بلا نقطتين (يُعقَّم عند الحفظ)
    const i = s.indexOf(':');
    const name = i > 0 ? s.slice(0, i) : 'omran-ai.pdf';
    const buf = Buffer.from(s.slice(i + 1), 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    // اسم عربي في الترويسة يحتاج ترميز RFC 5987 — وإلا كسر بعض الوسطاء
    const ascii = name.replace(/[^\x20-\x7E]/g, '-').replace(/["\\]/g, '-') || 'omran-ai.pdf';
    res.setHeader('Content-Disposition', 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name));
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
    // فحص أن المحتوى PDF فعلًا (يبدأ بـ %PDF)
    if (data.slice(0, 6) !== 'JVBERi') { res.status(400).json({ error: 'not_pdf' }); return; }
    // الاسم: أحرف/أرقام/شرطات فقط + لاحقة pdf ثابتة — لا نقطتين (فاصل التخزين)
    const rawName = String(body.name || 'omran-ai.pdf');
    const name = (rawName.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9_\-؀-ۿ]/g, '-').slice(0, 60) || 'omran-ai') + '.pdf';
    const id = crypto.randomBytes(6).toString('hex');
    const ok = await kvSetIfAbsent(KEY(id), name + ':' + data, TTL_SEC);
    if (!ok) { res.status(500).json({ error: 'store_failed' }); return; }
    res.status(200).json({ id, url: '/p/' + id, ttlDays: 7 });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
