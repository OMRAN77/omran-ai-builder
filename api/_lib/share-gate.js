// v-share-guard (فحص الحدود ٨ أكتوبر ٢٠٢٦): بوّابة واحدة لكلّ ما يُنشئ رابطًا عامًّا يُخزَّن في Redis
// (صورة/PDF/ملفّ عبر /api/media، ونشر مشروع أو محادثة عبر /api/share). كانت كلّها بلا هويّة ولا حدّ:
// نحو ٨٦ رفعًا مجهولًا بـ٣ م.ب تملأ القاعدة (٢٥٦ م.ب) فتفشل الكتابة في التطبيق كلّه.
// رمز الجلسة إلزاميّ (لا ضيف ولا IP — ip وguestId يُمرَّران null عمدًا)، وسقف يوميّ ثابت لكلّ حساب،
// والمالك وVIP معفيّان والمحظور مرفوض — كلّه داخل checkAndConsumeCustom.
const { checkAndConsumeCustom, refundCustom } = require('./_usage.js');

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

// v-refund-custom (المراجعة المعاكسة): تخزين فشل بعد العدّ (store_failed) يردّ الحصّة إلى سلّتها — المدخلات نفسها التي عدّت.
async function refundShare(req, body, bucket) {
  await refundCustom(sessionToken(req, body), null, null, bucket);
}

// v-media-save (المراجعة المعاكسة): «الحفظ والتنزيل» على الجوّال (omranSaveMedia/omranSaveImage/omranSaveBlob) يرفع الملفّ
// إلى نقطة المشاركة نفسها ليصير رابط HTTPS برأس attachment — فكان كلّ تنزيل يُعدّ من سقف المشاركة (٣٠/٢٠/١٠).
// علامة purpose:'download' تُعدّ في سلّة مستقلّة وتُخزَّن ساعة واحدة (التنزيل فوريّ، لا رابط يُتداوَل أسبوعًا).
// v-media-save-split (المراجعة الثانية): كانت سلّة واحدة بـ١٠٠ للصورة والـPDF والملفّ معًا — والملفّ يقبل ≈٥ م.ب، فحساب واحد
// يخزّن ٥٠٠ م.ب دفعة واحدة في Redis بـ٢٥٦ م.ب (العطل الذي جاء v-share-guard لمنعه؛ وعمر الساعة لا يفيد في الدفعة).
// الآن لكلّ نقطة سلّتها وسقفها بحجم ما تقبله: الصور ١٠٠ (الحافظ يضغطها JPEG دون ٦٤٠ ك.ب)، والـPDF ٢٠، والملفّ ١٠.
const SAVE_TTL_SEC = 3600;
const SAVE_PLANS = {
  'share-img': { bucket: 'media-save-img', limit: 100, ttlSec: SAVE_TTL_SEC },
  'share-pdf': { bucket: 'media-save-pdf', limit: 20, ttlSec: SAVE_TTL_SEC },
  'share-file': { bucket: 'media-save-file', limit: 10, ttlSec: SAVE_TTL_SEC },
};
function uploadPlan(body, bucket, limit, ttlSec) {
  const save = (body && body.purpose === 'download') ? SAVE_PLANS[bucket] : null;
  return save || { bucket, limit, ttlSec };
}

module.exports = { gateShare, sessionToken, refundShare, uploadPlan, SAVE_PLANS };
