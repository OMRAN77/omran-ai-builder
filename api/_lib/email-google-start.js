// بدء ربط Gmail (مساعد الإيميل) من الخادم لا من المتصفّح — نفس علّة الدخول
// بجوجل التي أصلحها auth-google-start.js وبقيت هنا: كان المتصفّح يبني رابط
// التفويض بنفسه بـ window.location.origin ومعرّف عميل مكتوب في الشيفرة، بينما
// يبادل email-callback.js بـ SITE_URL ومعرّف البيئة. وجوجل تشترط تطابق
// redirect_uri حرفًا بحرف بين الخطوتين — فمن أيّ عنوان غير SITE_URL (www،
// نطاق معاينة…) أو مع اختلاف المعرّفين يفشل الربط، وهذه «مساعد الإيميل لا
// يعمل». هنا يُبنى الرابط بالقيمتين اللتين سيستعملهما الخادم نفسه عند المبادلة.
const { siteUrl, siteUrlIsValid, siteUrlConfigured } = require('./_site.js');

const clientId = () => process.env.GOOGLE_CLIENT_ID
  || '533765051685-2334rjfvu738sd2i50p7rb8gck1d00i2.apps.googleusercontent.com';
const emailRedirectUri = () => siteUrl() + '/api/email-callback';

module.exports = async (req, res) => {
  const q = req.query || {};

  if (q.show) {
    // تشخيص بلا أسرار — نفس نمط auth-google-start?show=1.
    res.status(200).json({
      redirect_uri: emailRedirectUri(),
      client_id: clientId(),
      client_id_from_env: Boolean(process.env.GOOGLE_CLIENT_ID),
      client_secret_set: Boolean((process.env.GOOGLE_CLIENT_SECRET || '').trim()),
      site_url_set: siteUrlConfigured(),
      site_url_valid: siteUrlIsValid(),
      note: 'سجّل redirect_uri هذا حرفيًّا في Google Cloud Console → Authorized redirect URIs',
    });
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: emailRedirectUri(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state: typeof q.state === 'string' ? q.state : '',
  });
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
  res.end();
};
