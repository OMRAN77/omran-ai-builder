// v-unverified-email (أمر المالك ١٨ أكتوبر: «بعد ٣٠ يوم، الإيميل اللي ما تأكّد ينشال من الحساب تلقائيًا، والحساب نفسه يبقى»):
// الجرد اليوميّ. Vercel Cron ينادي /api/email-sweep (vercel.json) فيمرّ كلّ حساب ببريد على settleUnverifiedEmail في auth.js.
// بلا CRON_SECRET يُقبل النداء من أيّ أحد، لكنّه مرّة كلّ ٢٠ ساعة (قفل NX) ولا يفعل إلّا ما يفعله الجدول — ولا يعيد أعدادًا.
// بـCRON_SECRET (يرسله Vercel في Authorization) لا يمرّ غيره. الأسرار تُقرأ داخل المعالج لا في نطاق الوحدة (coldstart).
const { logError } = require('./log-error.js');

const LOCK_KEY = 'db/email-sweep/lock';
const LOCK_SEC = 20 * 60 * 60;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // الجدول ينادي GET وحده؛ غيره ٤٠٥ بلا جرد — فيُثبت وجود المسار على الإنتاج دون تشغيله.
  if (req.method !== 'GET') { res.status(405).json({ ok: false }); return; }
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret && String((req.headers && req.headers.authorization) || '') !== 'Bearer ' + secret) {
    res.status(401).json({ ok: false });
    return;
  }
  const { kvSetIfAbsent } = require('./kv.js');
  if (!(await kvSetIfAbsent(LOCK_KEY, String(Date.now()), LOCK_SEC))) {
    res.status(200).json({ ok: true, ran: false });
    return;
  }
  try {
    const tally = await require('./auth.js').sweepUnverifiedEmails(Date.now(), 240000);
    console.log('[email-sweep] ' + JSON.stringify(tally));
    // v-owner-inbox: الإيميل اليوميّ المجمّع لبلاغات المستخدمين — ما جدّ منذ آخر إرسال، وإلّا لا شيء
    try { console.log('[email-sweep] inbox ' + JSON.stringify(await require('./owner-inbox.js').dailyDigest())); } catch (e) { logError('email-sweep:inbox', e); }
  } catch (e) {
    logError('email-sweep', e);
    res.status(500).json({ ok: false });
    return;
  }
  res.status(200).json({ ok: true, ran: true });
};
