// v-ios-bridge: استلام جلسة دخول جوجل التي أودعها auth-google-callback تحت
// state. التطبيق المثبَّت (آيفون) يستدعيه عند العودة من ورقة المتصفح المنفصلة.
// استلام واحد فقط ثم تُحذف، وتنتهي صلاحيتها بعد ١٠ دقائق.
// v-oauth-bind (استيلاء على الحساب): state يختارها من يبدأ الدخول — فمهاجم يرسل للضحيّة رابط بدء بـstate من عنده،
// الضحيّة تكمل في جوجل، والكولباك يودع جلستها (٣٠ يومًا) تحت تلك state، والمهاجم يستلمها من جهازه. الآن الإيداع
// يحمل شبكة من أكمل الدخول (net: IPv4 كما هو، IPv6 بـ/64 — giftNet نفسه)، والاستلام لا يسلّم الجلسة إلّا لطلب من
// الشبكة نفسها؛ غير ذلك (أو إيداع قديم بلا net) = 404 pending القائم. لا يمنع من يشارك الضحيّة الشبكة نفسها (NAT مكتب
// واحد): الإغلاق الكامل تسليم بمخطّط التطبيق (رابط عالميّ) يحتاج بناءً أصليًّا.
// مفتاح الطوارئ يُقرأ عند النداء: OAUTH_CLAIM_NET_BIND=off يوقف فحص الشبكة (الافتراضيّ مفعَّل؛ تغييره يحتاج إعادة نشر).
const { kvGetJSON, kvDel } = require('./kv.js');
const { giftNet, clientIp } = require('./welcome-gift.js');

/** شبكة صاحب الطلب كما يحسبها سقف الهديّة (Vercel يكتب x-forwarded-for ولا يقبله من العميل). */
const netOf = (req) => giftNet(clientIp(req));
const netBindOn = () => String(process.env.OAUTH_CLAIM_NET_BIND || '').trim().toLowerCase() !== 'off';
/** هل يُسلَّم سجلّ مربوط بالشبكة recNet لهذا الطلب؟ بلا net مسجّل = لا (fail-closed). */
const sameNet = (recNet, req) => !netBindOn() || (!!recNet && recNet === netOf(req));

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const state = String(body.state || '').toLowerCase();
    if (!/^[0-9a-f]{16,64}$/.test(state)) { res.status(400).json({ error: 'bad state' }); return; }
    const key = 'db/oauth-claim/' + state;
    const rec = await kvGetJSON(key);
    // v-google-app-fail: فشل مودع من الكولباك — يُسلَّم مرّة ليعرض التطبيق سببه.
    if (rec && rec.error && !rec.token && (Date.now() - (rec.ts || 0)) <= 10 * 60 * 1000) {
      await kvDel(key);
      res.status(200).json({ error: String(rec.error) });
      return;
    }
    if (!rec || !rec.token || (Date.now() - (rec.ts || 0)) > 10 * 60 * 1000 || !sameNet(rec.net, req)) {
      res.status(404).json({ error: 'pending' });
      return;
    }
    await kvDel(key); // استلام واحد — لا يُعاد تسليم الجلسة مرتين
    res.status(200).json({ token: rec.token, user: rec.user, avatar: rec.avatar || '' });
  } catch (e) {
    res.status(500).json({ error: 'server' });
  }
};
module.exports.netOf = netOf;
module.exports.sameNet = sameNet;
