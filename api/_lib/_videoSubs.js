'use strict';
/* api/_lib/_videoSubs.js — v-video-subs (قرار المالك ٢٤ أكتوبر: «المجاني ما يحصل على الفيديوهات، المشتركين فقط»، وعلى أسئلتي:
   «أي باقة سارية + VIP»، «القوالب المتحرّكة وتحسين الفيديو تبقى للمجاني»، «يشوف كل شي ويطلع له للمشتركين»).
   الفيديو بالذكاء الاصطناعي (Veo والترندات والشخصيّة الناطقة، وفيديو AI، والممثّل، والاقتصاديّ، والسينمائيّ) للمالك وVIP ومن عنده
   باقة سارية تشمل الفيديو: باقة المحادثة (Plus · Pro · Max — tier.planActive) أو «صور وفيديو» (mix) أو باقة الفيديو القديمة.
   باقة مها وحدها وباقة الصور القديمة وحدها ليستا باقة فيديو، وحزم النقاط بلا باقة ليست اشتراكًا (نقاطها للصور وغيرها كما كانت).
   يُفحص قبل سؤال الخصم وقبل أيّ حجز، فالمجّانيّ لا يرى «تخصم ١٧٥ نقطة؟» ثمّ يُرفض. عطل القراءة = لا (لا فتح للتكلفة، كـ_qualityGate).
   الرمز video_subscribers بـ٤٠٣ يلتقطه js/app-33-plans-gate.js فيفتح «الباقات» على «صور وفيديو» بسطر السبب. */
const CODE = 'video_subscribers';

async function videoAllowed(username, opts) {
  if (!username) return false;
  const o = opts || {};
  try {
    if (require('./points.js').isOwnerUsername(username)) return true;
    if (await (o.isVip || require('./_vip.js').isVip)(username)) return true;
    const user = await (o.getUser || ((u) => require('./auth.js').getUserOnce(u)))(username);
    if (require('./tier.js').planActive(user, o.now)) return true;
    const media = require('./_mediaPlans.js');
    return media.mediaActive(user, 'mix', o.now) || media.mediaActive(user, 'video', o.now);
  } catch (e) {
    console.warn('[video-subs] plan read failed, video denied: ' + (e && e.message));
    return false;
  }
}

/** يردّ ٤٠٣ ويرجع true إن لم يكن مشتركًا — المتّصل يعود فورًا. */
async function denyFree(res, username, opts) {
  if (await videoAllowed(username, opts)) return false;
  res.status(403).json({ error: CODE });
  return true;
}

module.exports = { CODE, videoAllowed, denyFree };
