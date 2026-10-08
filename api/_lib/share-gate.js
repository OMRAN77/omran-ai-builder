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

// v-share-bytes (المراجعة الثالثة): عدد الطلبات وحده لا يحمي القاعدة — ١٠٠ صورة حفظ بـ٣ م.ب = ٣٠٠ م.ب دفعة واحدة على
// Redis بـ٢٥٦ م.ب. فوق سقف كلّ سلّة ميزانيّة بايت يوميّة واحدة لكلّ حساب عبر كلّ الرفع (صورة/PDF/ملفّ/مشروع)، بطول
// النصّ المرسَل (base64 كما يُخزَّن). المالك وVIP معفيّان (remaining: Infinity من checkAndConsumeCustom).
const SHARE_BYTES_DAILY = () => Math.max(1, Number(process.env.SHARE_BYTES_DAILY) || 40 * 1024 * 1024);
async function takeBytes(username, bytes) {
  const { kvIncrBy, kvExpire, kvDecrBy } = require('./kv.js');
  const n = Math.max(0, Math.floor(Number(bytes) || 0));
  if (!n) return true;
  const key = 'db/usage/share-bytes/' + encodeURIComponent(username) + '/' + new Date().toISOString().slice(0, 10);
  let total;
  try { total = Number(await kvIncrBy(key, n)); } catch (e) { return true; } // عطل KV = مفتوح كبقيّة العدّادات
  if (total === n) { try { await kvExpire(key, 172800); } catch (e) { /* أفضل جهد: المفتاح مؤرَّخ أصلًا */ } }
  if (total > SHARE_BYTES_DAILY()) {
    try { await kvDecrBy(key, n); } catch (e) { /* زيادة باقية تجعل الميزانيّة تبدو ممتلئة حتّى الغد فقط */ }
    return false;
  }
  return true;
}

// يُرجع اسم الحساب إن سُمح (وقد عُدّ الطلب)، وإلّا يكتب الردّ (401/429) ويُرجع null.
// bytes (اختياريّ): حجم ما سيُخزَّن، يُخصم من ميزانيّة اليوم بعد قبول السلّة — وتجاوزها يردّ عدّ السلّة ويرفض.
async function gateShare(req, res, body, bucket, dailyLimit, bytes) {
  const gate = await checkAndConsumeCustom(sessionToken(req, body), null, null, bucket, dailyLimit);
  if (gate && gate.allowed && gate.username) {
    if (gate.remaining === Infinity || await takeBytes(gate.username, bytes)) return gate.username;
    await refundShare(req, body, bucket);
    res.status(429).json({ error: 'daily_bytes', limit: dailyLimit });
    return null;
  }
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
