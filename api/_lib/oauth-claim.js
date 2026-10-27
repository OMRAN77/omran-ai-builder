// v-ios-bridge: استلام جلسة دخول جوجل التي أودعها auth-google-callback تحت
// state. التطبيق المثبَّت (آيفون) يستدعيه عند العودة من ورقة المتصفح المنفصلة.
// استلام واحد فقط ثم تُحذف، وتنتهي صلاحيتها بعد ١٠ دقائق.
// v-oauth-bind (استيلاء على الحساب): state يختارها من يبدأ الدخول — فمهاجم يرسل للضحيّة رابط بدء بـstate من عنده،
// الضحيّة تكمل في جوجل، والكولباك يودع جلستها (٣٠ يومًا) تحت تلك state، والمهاجم يستلمها من جهازه. الآن الإيداع
// يحمل شبكة من أكمل الدخول (net: IPv4 كما هو، IPv6 بـ/64 — giftNet نفسه)، والاستلام لا يسلّم الجلسة إلّا لطلب من
// الشبكة نفسها؛ غير ذلك (أو إيداع قديم بلا net) = network_changed أدناه. لا يمنع من يشارك الضحيّة الشبكة نفسها (NAT مكتب
// واحد): الإغلاق الكامل تسليم بمخطّط التطبيق (رابط عالميّ) يحتاج بناءً أصليًّا.
// مفتاح الطوارئ يُقرأ عند النداء: OAUTH_CLAIM_NET_BIND=off (أو 0/false/no) يوقف فحص الشبكة هنا وحده (الافتراضيّ مفعَّل؛ تغييره
// يحتاج إعادة نشر). فحص تذكرة Gmail (email-link-ticket.js) لا يتبعه أبدًا: طوارئ الدخول لا تعيد ثغرة ربط Gmail (المراجعة: oauth-4).
// المراجعة (oauth-1): عدم التطابق كان 404 pending صامتًا — الغلاف يستطلع عشر دقائق بلا رسالة (Private Relay في سفاري وحده، VPN
// المتصفّح، تبدّل الشبكة، وإيداعات ما قبل النشر بلا net). الآن يُحذف الإيداع ويُردّ 200 {error:'network_changed'}، فيعرض العميل
// خطأ جوجل القائم (claimFail ← showGoogleAuthError: «تعذر تسجيل الدخول بجوجل (network_changed)»)، ولا رمز للمهاجم البعيد.
const { kvGetJSON, kvDel } = require('./kv.js');
const { giftNet, clientIp } = require('./welcome-gift.js');

/** شبكة صاحب الطلب كما يحسبها سقف الهديّة (Vercel يكتب x-forwarded-for ولا يقبله من العميل). */
const netOf = (req) => giftNet(clientIp(req));
const OFF = ['off', '0', 'false', 'no'];
const netBindOn = () => !OFF.includes(String(process.env.OAUTH_CLAIM_NET_BIND || '').trim().toLowerCase());
/** شبكة السجلّ هي شبكة الطلب؟ بلا net مسجّل = لا (fail-closed). بلا مفتاح — تذكرة Gmail تستعمله دائمًا. */
const netMatches = (recNet, req) => !!recNet && recNet === netOf(req);
/** هل يُسلَّم إيداع الدخول المربوط بـrecNet لهذا الطلب؟ مفتاح الطوارئ يوقفه. */
const sameNet = (recNet, req) => !netBindOn() || netMatches(recNet, req);
/** رمز استلام الويب (gclaim) يطابق مجزوءه المودع؟ بلا مجزوء أو بلا رمز = لا. */
function claimMatches(recHash, claim) {
  if (typeof recHash !== 'string' || !/^[0-9a-f]{64}$/.test(recHash) || typeof claim !== 'string' || !/^[0-9a-f]{32}$/.test(claim)) return false;
  const a = Buffer.from(require('crypto').createHash('sha256').update(claim).digest('hex'));
  return require('crypto').timingSafeEqual(a, Buffer.from(recHash));
}

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
    if (!rec || !rec.token || (Date.now() - (rec.ts || 0)) > 10 * 60 * 1000) {
      res.status(404).json({ error: 'pending' });
      return;
    }
    // v-audit-auth (srv-auth-10): الويب يحمل رمز الاستلام الذي وصل متصفّحه في رابط العودة وحده — يثبت الطالب فلا يُشترط تطابق الشبكة.
    // رمز خاطئ أو غائب = الطريق القديم كما هو (الشبكة نفسها).
    if (!claimMatches(rec.claim, body.claim) && !sameNet(rec.net, req)) {
      await kvDel(key); // الجلسة لا تبقى في KV لمن يسأل من شبكة أخرى، والاستطلاع التالي 404
      res.status(200).json({ error: 'network_changed' });
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
module.exports.netMatches = netMatches;
