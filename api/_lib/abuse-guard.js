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
    return { ok: true, count, max, bucket };
  } catch (e) {
    console.error('[abuse-guard] image meter unavailable: ' + (e && e.message));
    return { ok: true, count: 0, max, degraded: true };
  }
}

/** v-img-hour-giveback (أمر المالك ٢١ أكتوبر: «عدّاد الصور بالساعة: ينقص لما ترجع النقاط»): ردّ نقاط صورة يردّ خانتها في عدّاد ساعتها
    (bucket من imageHourlyGuard) — محاولات فاشلة (نفاد رصيد المزوّد مع الإعادة) كانت تحرق سقف العشرين فيُرفض image_hourly_limit بلا صورة. */
async function imageHourlyGiveBack(username, bucket, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  if (!username || bucket == null || !Number.isFinite(Number(bucket))) return false;
  try { await kv.kvDecrBy('abuse:img:' + userKey(username) + ':' + Number(bucket), 1); return true; } catch (e) { return false; }
}

/* v-video-seq-cooldown: المتبقّي الفعليّ من المهلة لا طولها كلّه — سلسلة مشاهد (فيلم متكامل، ٢٠ ثانية،
   ترند بيكسار) تنتظره بدقّة بين مشهد وآخر بدل أن تموت والمشهد الأوّل مدفوع. القيمة المخزونة هي وقت القفل؛
   تعذّر قراءتها (عطب أو kv بلا kvGetRaw) = المهلة كاملة، أسوأ حالاته انتظار أطول لا أقصر. */
async function cooldownLeft(kv, key, ttl) {
  try {
    const at = Number(await kv.kvGetRaw(key));
    if (Number.isFinite(at) && at > 0) {
      const left = Math.ceil(ttl - (Date.now() - at) / 1000);
      if (left >= 1 && left <= ttl) return left;
    }
  } catch (e) { /* أفضل جهد — المهلة كاملة أدناه */ }
  return ttl;
}

/** قفل فيديو: SET NX EX ثلاث دقائق؛ موجود = فيديو سابق خلال المهلة → رفض مع المتبقّي الفعليّ. */
async function videoLock(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const ttl = opt.ttl || VIDEO_COOLDOWN_SEC;
  if (!username) return { ok: true };
  const key = 'abuse:video:' + userKey(username);
  try {
    const got = await kv.kvSetIfAbsent(key, String(Date.now()), ttl);
    if (!got) return { ok: false, reason: 'video_cooldown', retryAfter: await cooldownLeft(kv, key, ttl) };
    return { ok: true, key };
  } catch (e) {
    console.error('[abuse-guard] video lock unavailable: ' + (e && e.message));
    return { ok: true, degraded: true };
  }
}

/** v-talkchar-confirm: قراءة فقط — ثوانٍ باقية من قفل الفيديو (٠ = لا قفل). يُسأل قبل خطوة مدفوعة تسبق الفيديو (كرتنة الشخصيّة
    الناطقة) كي لا تُخصم ثمّ يرجع video_cooldown؛ الحكم عند السباق يبقى لـvideoLock. عطب القراءة = ٠ فلا يمنع. */
async function videoCooldownLeft(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  if (!username) return 0;
  const key = 'abuse:video:' + userKey(username);
  try {
    const v = await kv.kvGetRaw(key);
    if (v === null || v === undefined || String(v) === '') return 0;
  } catch (e) { return 0; } // أفضل جهد — videoLock يحكم بعدها
  return cooldownLeft(kv, key, opt.ttl || VIDEO_COOLDOWN_SEC);
}

/** فشل المزوّد بعد القفل = يُفكّ القفل مع ردّ النقاط كي لا يُعاقَب المستخدم على عطب ليس منه. */
async function releaseVideoLock(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  if (!username) return;
  try { await kv.kvDel('abuse:video:' + userKey(username)); } catch (e) { /* أفضل جهد — القفل يسقط بعد ٣ دقائق */ }
}

module.exports = { IMAGE_HOURLY_MAX, VIDEO_COOLDOWN_SEC, imageHourlyGuard, imageHourlyGiveBack, videoLock, releaseVideoLock, videoCooldownLeft };
