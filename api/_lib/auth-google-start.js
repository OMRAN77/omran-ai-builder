// بدء تسجيل الدخول بجوجل من الخادم لا من المتصفّح.
//
// كان المتصفّح يبني رابط التفويض بنفسه:
//     redirect_uri = window.location.origin + '/api/auth-google-callback'
// بينما يبنيه الخادم عند المبادلة من SITE_URL. وجوجل تشترط تطابقهما حرفًا
// بحرف، فمن أيّ عنوان غير SITE_URL — عنوان نشرة، معاينة، نطاق آخر — يفشل
// الدخول بـ redirect_uri_mismatch. وكذلك client_id: كان مكتوبًا في شيفرة
// العميل، والخادم يقرأه من البيئة، فإن اختلفا فشل الدخول أيضًا.
//
// هنا يُبنى الرابط في مكان واحد بالقيمتين اللتين سيستعملهما الخادم نفسه عند
// المبادلة، فيستحيل الافتراق بنيويًّا لا بالانضباط.
//
// و ?show=1 يطبع القيمتين كما يراهما الخادم — وهما بالضبط ما يجب أن يكون
// مسجَّلًا في Google Cloud Console. تشخيص بلا أسرار: كلتاهما عامّة أصلًا.
const { googleRedirectUri, siteUrlIsValid, siteUrlConfigured } = require('./_site.js');

// الاحتياط هو المعرّف الذي كان مكتوبًا في العميل، كي لا يتغيّر السلوك إن كان
// المتغيّر غير مضبوط.
const clientId = () => process.env.GOOGLE_CLIENT_ID
  || '533765051685-2334rjfvu738sd2i50p7rb8gck1d00i2.apps.googleusercontent.com';

module.exports = async (req, res) => {
  const redirectUri = googleRedirectUri();
  const id = clientId();
  const q = req.query || {};

  if (q.show) {
    // لا تُعاد قيمة SITE_URL الخام أبدًا: وُجد في الإنتاج أنّها كانت سرّ عميل
    // جوجل ملصوقًا في الخانة الخطأ، وطباعتها كانت تبثّه. يُقال «صالح أو لا»
    // فقط — وهو كلّ ما يحتاجه التشخيص.
    res.status(200).json({
      redirect_uri: redirectUri,
      client_id: id,
      client_id_from_env: Boolean(process.env.GOOGLE_CLIENT_ID),
      // حضور السرّ فقط — لا قيمته. غيابه يعني أنّ المبادلة ستفشل حتمًا
      // بـ google_not_configured، وقد لُصق السرّ فعلًا في خانة SITE_URL يومًا.
      client_secret_set: Boolean((process.env.GOOGLE_CLIENT_SECRET || '').trim()),
      site_url_set: siteUrlConfigured(),
      site_url_valid: siteUrlIsValid(),
      ...(siteUrlConfigured() && !siteUrlIsValid()
        ? { warning: 'SITE_URL مضبوط بقيمة ليست عنوان https صالحًا — يُتجاهَل. صحّحه في Vercel.' }
        : {}),
      note: 'سجّل redirect_uri هذا حرفيًّا في Google Cloud Console → Authorized redirect URIs',
    });
    return;
  }

  // v-login-done: مسار غلاف الآيفون يمرّر app=1 — نلحق «-app» بالـstate
  // (جوجل تعيده كما هو) ليعرف الكولباك أن يعرض صفحة «ارجع للتطبيق»
  // بدل تحويل سفاري إلى نسخة كاملة من الموقع.
  const stateOut = (typeof q.state === 'string' ? q.state : '') + (q.app ? '-app' : '');
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: stateOut,
  });
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
  res.end();
};
