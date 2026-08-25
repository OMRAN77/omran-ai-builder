// عنوان الموقع القانونيّ، ومنه وحده يُشتقّ redirect_uri الخاصّ بجوجل.
//
// جوجل ترفض الدخول بـ redirect_uri_mismatch إن لم يتطابق العنوان حرفًا بحرف
// بين خطوتَي التفويض والمبادلة. وكان يختلف فعلًا: المتصفّح يبني العنوان من
// window.location.origin (فيتغيّر مع كلّ نشرة ومعاينة)، والخادم يبنيه من
// SITE_URL الثابت. فمن أيّ عنوان غير SITE_URL يستحيل الدخول.
//
// القراءة مؤجَّلة داخل دالّة لا في نطاق الوحدة، كي لا يقع أيّ شيء وقت التحميل
// قبل المعالِج — وهو العطب الذي أصلحناه في #12.
const siteUrl = () => (process.env.SITE_URL || 'https://omran-ai-builder.vercel.app').replace(/\/+$/, '');
const googleRedirectUri = () => siteUrl() + '/api/auth-google-callback';

module.exports = { siteUrl, googleRedirectUri };
