// Vercel Serverless Function: handles the redirect Google sends back after a
// user approves Gmail access for the "AI Email Assistant" feature. Separate
// from the login OAuth (auth-google-callback.js) — this one requests Gmail
// scopes (read + send) and stores an encrypted refresh token on the user.
const { getUser, putUser } = require('./auth.js');
const { takeTicket } = require('./email-link-ticket.js'); // v-oauth-bind
const { encrypt } = require('./_emailCrypto.js');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// عبر _site.js لا من البيئة مباشرة — للسبب نفسه المشروح في _site.js:
// قيمة غير صالحة كانت تُبنى منها عناوين تحويل تُبثّ إلى المتصفّح.
const { siteUrl } = require('./_site.js');
// v-email-req-origin: المبادلة تستعمل مضيف الطلب نفسه — جوجل أعادت التحويل
// إلى redirect_uri حرفيًّا، فمضيف هذا الطلب هو هو ⇒ تطابق حتمي مع خطوة البدء.
function reqOrigin(req) {
  const h = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim();
  if (/^[a-z0-9.-]+(:\d+)?$/i.test(h) && /\./.test(h)) return 'https://' + h;
  return siteUrl();
}
const emailRedirectUri = (req) => reqOrigin(req) + '/api/email-callback';
const REQUIRED_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']; // v-audit-search

module.exports = async (req, res) => {
  /* v-email-alive: العودة للتطبيق بمضيف الطلب نفسه (كما redirect_uri) — لا
     بـSITE_URL الذي قد يشير لنطاق آخر فيهبط المستخدم خارج تطبيقه. */
  const fail = (reason) => {
    res.writeHead(302, { Location: reqOrigin(req) + '/?emailerror=' + encodeURIComponent(reason) });
    res.end();
  };
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return fail('google_not_configured');
    const { code, state, error } = req.query || {};
    if (error) return fail(String(error));
    if (!code || !state) return fail('missing_params');
    // v-oauth-bind: state كانت رمز الجلسة نفسه — فمن أكمل رابطًا يحمل رمز غيره رُبطت Gmail الخاصّة به بحساب ذلك
    // الغير. الآن تذكرة تُستهلك مرّة (عشر دقائق) وتُعيد صاحبها وحده، ومن الشبكة التي سكّتها؛ وإلّا الخطأ القائم —
    // network_changed لاختلاف الشبكة وحده (قالب emLinkError نفسه، بلا نصّ جديد)، وsession_expired لغيره.
    const why = {};
    const username = await takeTicket(String(state), req, why);
    if (!username) return fail(why.reason || 'session_expired');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: emailRedirectUri(req),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return fail(tokenData.error || 'token_exchange_failed');
    if (!tokenData.refresh_token) return fail('no_refresh_token_reconnect');
    /* v-audit-search (srv-search-6): شاشة موافقة جوجل تسمح بإلغاء صلاحيّة بعينها — كان الربط يُقبل بلا قراءة أو بلا إرسال، فتفشل
       القائمة أو الإرسال بنصّ جوجل الخامّ والصندوق «مربوط» بلا زرّ ربط. القراءة والإرسال شرط، والتقويم اختياريّ (له إعادة
       ربط في email-calendar). ويُحفظ ما مُنح فعلًا. جوجل ترجع scope دائمًا؛ غيابه = لا نحكم (السلوك القديم). */
    const granted = typeof tokenData.scope === 'string' ? tokenData.scope.split(/\s+/).filter(Boolean) : null;
    if (granted && !REQUIRED_SCOPES.every((sc) => granted.includes(sc))) return fail('missing_scopes');

    const profRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const prof = await profRes.json();

    const user = await getUser(username);
    if (!user) return fail('user_not_found');
    user.emailAssist = {
      connected: true,
      gmailAddress: prof.emailAddress || null,
      refreshTokenEnc: encrypt(tokenData.refresh_token),
      ignoreList: (user.emailAssist && user.emailAssist.ignoreList) || [],
      scopes: granted || undefined,
      connectedAt: Date.now(),
    };
    await putUser(username, user);
    res.writeHead(302, { Location: reqOrigin(req) + '/?emailconnected=1' });
    res.end();
  } catch (e) {
    fail('server_error');
  }
};
