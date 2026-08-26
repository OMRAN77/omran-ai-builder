// v-ios-bridge: استلام جلسة دخول جوجل التي أودعها auth-google-callback تحت
// state. التطبيق المثبَّت (آيفون) يستدعيه عند العودة من ورقة المتصفح المنفصلة.
// استلام واحد فقط ثم تُحذف، وتنتهي صلاحيتها بعد ١٠ دقائق.
const { kvGetJSON, kvDel } = require('./kv.js');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const state = String(body.state || '').toLowerCase();
    if (!/^[0-9a-f]{16,64}$/.test(state)) { res.status(400).json({ error: 'bad state' }); return; }
    const key = 'db/oauth-claim/' + state;
    const rec = await kvGetJSON(key);
    if (!rec || !rec.token || (Date.now() - (rec.ts || 0)) > 10 * 60 * 1000) {
      res.status(404).json({ error: 'pending' });
      return;
    }
    await kvDel(key); // استلام واحد — لا يُعاد تسليم الجلسة مرتين
    res.status(200).json({ token: rec.token, user: rec.user, avatar: rec.avatar || '' });
  } catch (e) {
    res.status(500).json({ error: 'server' });
  }
};
