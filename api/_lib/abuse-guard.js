// api/_lib/abuse-guard.js — v-plan-routing (قرار المالك ٢٠ سبتمبر): حدود ضدّ الإساءة للوسائط.
// (١) ٢٠ صورة في الساعة لكلّ حساب — لا سقف يوميّ للصور (المالك: «مفتوح يقدر يخلّصهم في يوم»)،
//     لكن دفعة سكربت في دقيقة تُوقَف. (٢) فيديو واحد كلّ ٣ دقائق لكلّ حساب.
// المالك وVIP خارج الحدّين — المنادي يتخطّى حين لا يُخصم منه (pay.owner).
// عطب KV = سماح مع تسجيل: الحدّ حماية من الإساءة، لا بوّابة دفع، فلا يوقف مشتركًا يدفع.
const IMAGE_HOURLY_MAX = 20;
const VIDEO_COOLDOWN_SEC = 180;
const HOUR_MS = 3600000;

function userKey(username) { return encodeURIComponent(String(username || '').trim().toLowerCase()); }

/** عدّاد الساعة الجارية: يزيد ثمّ يقارن؛ فوق الحدّ يُنقص ما زاده ويرفض مع ثوانٍ حتّى الساعة التالية. */
async function imageHourlyGuard(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const now = typeof opt.now === 'number' ? opt.now : Date.now();
  const max = opt.max || IMAGE_HOURLY_MAX;
  if (!username) return { ok: true, count: 0, max };
  const bucket = Math.floor(now / HOUR_MS);
  const key = 'abuse:img:' + userKey(username) + ':' + bucket;
  try {
    const count = await kv.kvIncr(key);
    if (count === 1) await kv.kvExpire(key, 7200);
    if (count > max) {
      try { await kv.kvDecrBy(key, 1); } catch (e) { /* أفضل جهد — العدّاد يسقط مع الساعة */ }
      return { ok: false, reason: 'image_hourly_limit', retryAfter: Math.max(1, Math.ceil(((bucket + 1) * HOUR_MS - now) / 1000)), max };
    }
    return { ok: true, count, max };
  } catch (e) {
    console.error('[abuse-guard] image meter unavailable: ' + (e && e.message));
    return { ok: true, count: 0, max, degraded: true };
  }
}

/** قفل فيديو: SET NX EX ثلاث دقائق؛ موجود = فيديو سابق خلال المهلة → رفض. */
async function videoLock(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const ttl = opt.ttl || VIDEO_COOLDOWN_SEC;
  if (!username) return { ok: true };
  const key = 'abuse:video:' + userKey(username);
  try {
    const got = await kv.kvSetIfAbsent(key, String(Date.now()), ttl);
    if (!got) return { ok: false, reason: 'video_cooldown', retryAfter: ttl };
    return { ok: true, key };
  } catch (e) {
    console.error('[abuse-guard] video lock unavailable: ' + (e && e.message));
    return { ok: true, degraded: true };
  }
}

/** فشل المزوّد بعد القفل = يُفكّ القفل مع ردّ النقاط كي لا يُعاقَب المستخدم على عطب ليس منه. */
async function releaseVideoLock(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  if (!username) return;
  try { await kv.kvDel('abuse:video:' + userKey(username)); } catch (e) { /* أفضل جهد — القفل يسقط بعد ٣ دقائق */ }
}

module.exports = { IMAGE_HOURLY_MAX, VIDEO_COOLDOWN_SEC, imageHourlyGuard, videoLock, releaseVideoLock };
