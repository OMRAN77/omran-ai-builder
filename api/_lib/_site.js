// عنوان الموقع القانونيّ، ومنه وحده يُشتقّ redirect_uri الخاصّ بجوجل.
//
// جوجل ترفض الدخول بـ redirect_uri_mismatch إن لم يتطابق العنوان حرفًا بحرف
// بين خطوتَي التفويض والمبادلة. وكان يختلف فعلًا: المتصفّح يبنيه من
// window.location.origin، والخادم من SITE_URL. أُزيل المصدر الثاني في #18.
//
// ثمّ كشف القياس الحيّ ما هو أخطر: SITE_URL في الإنتاج لم يكن عنوانًا أصلًا،
// بل سرّ عميل جوجل (GOCSPX-…) لُصق في الخانة الخطأ. فكان الخادم يبني
//     "GOCSPX-…/api/auth-google-callback"
// ويرسله إلى جوجل، فترفضه. والأسوأ أنّ كلّ تحويل بعد الدخول كان يذهب إلى
// ذلك النصّ، فيتسرّب السرّ في شريط العنوان وفي السجلّات.
//
// لذلك لم يعد يُقبل من البيئة إلا عنوان https صحيح. وما عداه يُتجاهَل صامتًا
// إلى العنوان الافتراضيّ — لأنّ الرجوع إلى عنوان يعمل أسلم من بثّ نصّ لا
// يُعرف ما هو. ولا تُعاد قيمة البيئة الخام في أيّ ردّ أو سجلّ أبدًا.
//
// القراءة مؤجَّلة داخل دالّة لا في نطاق الوحدة، كي لا يقع شيء وقت التحميل
// قبل المعالِج — وهو العطب الذي أُصلح في #12.
const DEFAULT_SITE = 'https://omran-ai-builder.vercel.app';

// عنوان صالح = https، ومضيف فيه نقطة (أو localhost)، وبلا مسار ولا استعلام.
function validOrigin(raw) {
  if (!raw) return null;
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  if (!/\./.test(u.hostname) && u.hostname !== 'localhost') return null;
  if (u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  return u.origin;
}

const siteUrlIsValid = () => validOrigin(process.env.SITE_URL) !== null;
const siteUrlConfigured = () => Boolean((process.env.SITE_URL || '').trim());
const siteUrl = () => validOrigin(process.env.SITE_URL) || DEFAULT_SITE;
const googleRedirectUri = () => siteUrl() + '/api/auth-google-callback';

module.exports = { siteUrl, googleRedirectUri, siteUrlIsValid, siteUrlConfigured };
