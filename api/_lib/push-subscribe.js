// Stores/removes the browser's Web Push subscription for a logged-in user,
// so /api/check-reminders can wake them up with a real system notification
// even when the app/tab is closed. One JSON record per user (db/push-subs/{username}.json).
const { kvPutJSON } = require('./kv.js');


function subPath(username) {
  return 'db/push-subs/' + encodeURIComponent(username) + '.json';
}

/* v-audit-mahakv (srv-maha-3): الاشتراك كان يُخزَّن بأيّ endpoint، فيرسل الكرون HTTPS POST إلى أيّ مضيف ومنفذ يختاره
   المستخدم (SSRF أعمى)، ومضيف يمسك الاتّصال يعلّق الدورة لكلّ من بعده. الآن: https على المنفذ الافتراضيّ ومن خدمات
   الدفع المعروفة وحدها (Chrome/Edge القديم/Opera/Samsung = FCM، Firefox = Mozilla، Safari = Apple، Edge = WNS)،
   ومفاتيح بطول ما يقبله web-push، والحقول المعروفة وحدها تُخزَّن. */
const PUSH_HOST_RE = /^(?:fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/i;
function isPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  return u.protocol === 'https:' && !u.port && !u.username && !u.password && PUSH_HOST_RE.test(u.hostname);
}
function b64urlBytes(v) {
  return typeof v === 'string' && v.length <= 256 && /^[A-Za-z0-9_-]+={0,2}$/.test(v) ? Buffer.from(v, 'base64url').length : -1;
}
/** الاشتراك المنقّى إن كان صالحًا للإرسال، وإلّا null. */
function cleanSubscription(sub) {
  if (!sub || typeof sub !== 'object' || !isPushEndpoint(sub.endpoint)) return null;
  const keys = sub.keys || {};
  const auth = b64urlBytes(keys.auth);
  if (b64urlBytes(keys.p256dh) !== 65 || auth < 16 || auth > 64) return null;
  return {
    endpoint: sub.endpoint,
    expirationTime: Number.isFinite(sub.expirationTime) ? sub.expirationTime : null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

// v-session-shape (الدفعة A، أمان): نسخة verifyToken اليدويّة هنا كانت تقبل حمولة موقّعة بلا exp (تذكرة مهمّة البناء) جلسةً
// لا تنتهي، وتقرأ السرّ في نطاق الوحدة. الآن _session.sessionUser: u نصّ وexp رقم في المستقبل، والسرّ عند النداء.
const { sessionUser } = require('./_session.js');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const username = sessionUser(token);
  if (!username) { res.status(401).json({ error: 'auth' }); return; }

  if (req.method === 'POST') {
    const subscription = cleanSubscription((req.body && req.body.subscription) || null);
    if (!subscription) { res.status(400).json({ error: 'missing subscription' }); return; }
    await kvPutJSON(subPath(username), subscription);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await kvPutJSON(subPath(username), null);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};

module.exports.subPath = subPath;
module.exports.cleanSubscription = cleanSubscription;
