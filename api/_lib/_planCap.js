'use strict';
/* api/_lib/_planCap.js — v-plan-caps (قرار المالك: «نفس نسبة المحادثة»): حدود الأدوات الثابتة تتبع الباقة.

   الحدّ المكتوب في كلّ أداة (الديكور ٣، المقاولات ٦، البحث ٤٠…) هو حدّ المجّانيّ (والضيف حيث يُعدّ بالـIP).
   المشترك بباقة سارية يأخذ floor(الأساس × سقف باقته اليوميّ للمحادثة ÷ سقف المجّانيّ) — السقوف من tier.caps()
   نفسها (FREE_DAILY · SUB_DAILY_BASIC/PRO/MAX) فتتبع البيئة بلا نشر: افتراضيًّا ×٢٫٥ و×٥ و×١٢٫٥.
   • الباقة السارية من tier.resolveTier (planActive: خطّة معروفة ودفعة خلال ٣٥ يومًا) بقراءة طازجة واحدة لا من ذاكرة
     الستّين ثانية: عطل قراءة عابر هنا لا يُكتب في الذاكرة المشتركة فيُنزل محادثة المشترك إلى المجّانيّ دقيقة كاملة.
   • يوم التسجيل (FREE_FIRST_DAY) لا يغيّر الأساس: المجّانيّ يبقى على الأساس دائمًا.
   • المالك وVIP معفيّان حيث كانا (قبل هذا الحساب في كلّ مستدعٍ) — هنا لا يُحسب لهما شيء.
   • عطل قراءة الطبقة = الأساس (لا فتح)، ومشترك لا يأخذ أقلّ من المجّانيّ ولو ضُبطت البيئة خطأً.
   العدّ نفسه لم يتغيّر: _dailyQuota.js (حجز ذرّيّ) وcheckAndConsumeCustom (takeTally) يستقبلان الرقم المحسوب. */
const tierLib = require('./tier.js');
const { sessionUser } = require('./_session.js');

/** الحدّ اليوميّ لهذا الحساب في أداة حدّها الأساس `base` — رقم صحيح، والأساس لغير المشترك. لا يرمي. */
async function planScaledLimit(username, base) {
  if (!username) return base;
  try {
    // getUserOnce لا getUser: الأخيرة تعيد المحاولة ٤ مرّات بنوم متزايد (~١٫٨ث) حين يغيب السجلّ — على مسار كلّ
    // توليد (كما في isBanned). سجلّ غائب أو قراءة فاشلة = ليس مشتركًا = الأساس. noCache: انظر رأس الملفّ.
    const tier = await tierLib.resolveTier(username, { noCache: true, getUser: (u) => require('./auth.js').getUserOnce(u) });
    if (!tier || tier.tier !== 'sub') return base;
    const c = tierLib.caps();
    const planCap = Number(c[tier.plan]);
    const freeCap = Number(c.free);
    if (!(freeCap > 0) || !(planCap > 0)) return base;
    return Math.max(base, Math.floor((base * planCap) / freeCap));
  } catch (e) {
    console.warn('[plan-cap] tier read failed, base limit: ' + (e && e.message));
    return base;
  }
}

/** checkAndConsumeCustom بالحدّ المحسوب للباقة؛ الردّ نفسه ومعه `limit` (الحدّ الذي طُبّق) لرسائل الواجهة. */
async function checkAndConsumePlanCustom(token, guestId, ip, bucket, base) {
  const limit = await planScaledLimit(sessionUser(token), base);
  const gate = await require('./_usage.js').checkAndConsumeCustom(token, guestId, ip, bucket, limit);
  return Object.assign({}, gate, { limit });
}

module.exports = { planScaledLimit, checkAndConsumePlanCustom };
