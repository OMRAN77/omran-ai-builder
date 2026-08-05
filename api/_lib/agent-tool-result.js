// نقطة استقبال ناتج أداة نفّذها متصفح المستخدم.
//
// الوكيل يعمل في دالة، والتنفيذ في المتصفح، والبث في اتجاه واحد — فيحتاج
// الطرفان ملتقى. Redis هو الملتقى لأن دوال Vercel بلا حالة: الردّ قد يصل
// نسخة غير التي تنتظر.
const { kvPutJSON, kvExpire } = require('./kv.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  try {
    let body = req.body;
    if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
    const id = String((body && body.id) || '').trim();
    const output = String((body && body.output) || '');
    // معرّف من الخادم نفسه: أحرف وأرقام فقط، فلا يُبنى منه مسار.
    if (!/^c[a-z0-9]{6,30}$/i.test(id)) { res.status(400).json({ error: 'bad id' }); return; }

    const key = 'agent/tool/' + id;
    await kvPutJSON(key, { output: output.slice(0, 6000), at: Date.now() });
    // عمر قصير: النتيجة تُستهلك خلال ثوانٍ أو لا تُستهلك أبدًا.
    try { await kvExpire(key, 60); } catch (e) { console.warn('[agent-tool] expire failed', e && e.message); }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'tool result error' });
  }
};
