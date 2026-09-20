// 📄 تحميل الملفات العامة (فيديو، documents، إلخ)
// نفس نمط pdf-share.js و img-share.js: التخزين في Redis تحت db/file/<id>
const crypto = require('crypto');
const { kvSetIfAbsent, kvGetRaw } = require('./kv.js');

const MAX_B64 = 5 * 1024 * 1024; // ≈4MB ملف فعلي
const TTL_SEC = 60 * 60 * 24 * 7; // 7 أيام
const KEY = (id) => 'db/file/' + id;

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const rawId = String((req.query && req.query.id) || '');
    const id = String((rawId.match(/^[a-f0-9]{6,24}/i) || [''])[0]).toLowerCase();
    if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

    let raw = await kvGetRaw(KEY(id));
    if (!raw) { res.status(404).json({ error: 'not_found' }); return; }
    let s = String(raw);

    /* دعم أجزاء للملفات الكبيرة */
    if (s.indexOf('chunks:') === 0) {
      const parts = s.split(':');
      const n = parseInt(parts[1], 10) || 0;
      const meta = parts.slice(2).join(':');
      const pieces = [];
      let failed = false;
      for (let i = 0; i < n; i++) {
        let c = await kvGetRaw(KEY(id) + ':' + i);
        if (!c) {
          await new Promise(r => setTimeout(r, 100));
          c = await kvGetRaw(KEY(id) + ':' + i).catch(() => null);
        }
        if (!c) {
          failed = true;
          break;
        }
        pieces.push(String(c));
      }
      if (failed) { res.status(503).json({ error: 'chunk_missing', detail: 'جزء من الملف اختفى — حاول لاحقًا' }); return; }
      s = meta + pieces.join('');
    }

    // الصيغة: mime:name:base64
    const seg = s.split(':');
    const mime = seg[0] || 'application/octet-stream';
    const name = seg[1] || 'file';
    let buf;
    try {
      buf = Buffer.from(s.slice(s.indexOf(':') + 1 + (seg[1] || '').length + 1), 'base64');
    } catch (e) {
      res.status(400).json({ error: 'corrupt', detail: 'بيانات الملف معيوبة' });
      return;
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
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

    const mime = String(body.mime || 'application/octet-stream');
    const rawName = String(body.name || 'file');
    const name = rawName.replace(/[^A-Za-z0-9_\-./]/g, '-').slice(0, 100) || 'file';
    const id = crypto.randomBytes(6).toString('hex');
    const CHUNK = 700 * 1024;

    let ok;
    if (data.length <= CHUNK) {
      ok = await kvSetIfAbsent(KEY(id), mime + ':' + name + ':' + data, TTL_SEC);
    } else {
      const n = Math.ceil(data.length / CHUNK);
      ok = true;
      for (let i = 0; i < n && ok; i++) {
        const ok_i = await kvSetIfAbsent(KEY(id) + ':' + i, data.slice(i * CHUNK, (i + 1) * CHUNK), TTL_SEC);
        ok = ok && ok_i;
      }
      if (ok) ok = await kvSetIfAbsent(KEY(id), 'chunks:' + n + ':' + mime + ':' + name, TTL_SEC);
      if (!ok) {
        res.status(500).json({ error: 'store_failed', detail: 'فشل حفظ جزء من الملف' });
        return;
      }
    }

    if (!ok) { res.status(500).json({ error: 'store_failed' }); return; }
    res.status(200).json({ id, url: '/f/' + id, ttlDays: 7 });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
