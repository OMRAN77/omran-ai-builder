// v-share-guard (فحص الحدود ٨ أكتوبر ٢٠٢٦): بوّابة واحدة لكلّ ما يُنشئ رابطًا عامًّا يُخزَّن في Redis
// (صورة/PDF/ملفّ عبر /api/media، ونشر مشروع أو محادثة عبر /api/share). كانت كلّها بلا هويّة ولا حدّ:
// نحو ٨٦ رفعًا مجهولًا بـ٣ م.ب تملأ القاعدة (٢٥٦ م.ب) فتفشل الكتابة في التطبيق كلّه.
// رمز الجلسة إلزاميّ (لا ضيف ولا IP — ip وguestId يُمرَّران null عمدًا)، وسقف يوميّ ثابت لكلّ حساب،
// والمالك وVIP معفيّان والمحظور مرفوض — كلّه داخل checkAndConsumeCustom.
const { checkAndConsumeCustom } = require('./_usage.js');

// الرمز في الجسم (نمط الواجهة) أو في ترويسة Authorization (نمط DELETE في explore.html).
function sessionToken(req, body) {
  if (body && typeof body.token === 'string' && body.token) return body.token;
  const h = (req && req.headers) || {};
  return String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
}

// يُرجع اسم الحساب إن سُمح (وقد عُدّ الطلب)، وإلّا يكتب الردّ (401/429) ويُرجع null.
async function gateShare(req, res, body, bucket, dailyLimit) {
  const gate = await checkAndConsumeCustom(sessionToken(req, body), null, null, bucket, dailyLimit);
  if (gate && gate.allowed && gate.username) return gate.username;
  if (gate && gate.reason === 'limit') res.status(429).json({ error: 'daily_limit', limit: dailyLimit });
  else res.status(401).json({ error: 'auth_required' });
  return null;
}

module.exports = { gateShare, sessionToken };
