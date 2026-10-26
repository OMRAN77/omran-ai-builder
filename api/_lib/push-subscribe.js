// Stores/removes the browser's Web Push subscription for a logged-in user,
// so /api/check-reminders can wake them up with a real system notification
// even when the app/tab is closed. One JSON record per user (db/push-subs/{username}.json).
const { kvGetJSON, kvPutJSON } = require('./kv.js');


function subPath(username) {
  return 'db/push-subs/' + encodeURIComponent(username) + '.json';
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
    const subscription = (req.body && req.body.subscription) || null;
    if (!subscription || !subscription.endpoint) { res.status(400).json({ error: 'missing subscription' }); return; }
    await kvPutJSON(subPath(username), subscription);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    // v-audit-boot (srv-maha-6): الخروج يرسل عنوان هذا المتصفّح (في الجسم والرابط — بعض الوسطاء يُسقط جسم DELETE). السجلّ واحد
    // للحساب (آخر جهاز اشترك)، فإن كان لجهاز آخر يبقى: الخروج من الحاسوب لا يُطفئ تذكيرات الجوّال. بلا عنوان: الحذف كما كان.
    const endpoint = String((req.body && req.body.endpoint) || (req.query && req.query.endpoint) || '');
    if (endpoint) {
      const cur = await kvGetJSON(subPath(username));
      if (cur && cur.endpoint && cur.endpoint !== endpoint) { res.status(200).json({ ok: true, kept: true }); return; }
    }
    await kvPutJSON(subPath(username), null);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};

module.exports.subPath = subPath;
