'use strict';
/* api/_lib/_qualityGate.js — v-quality-gate (قرار المالك: «جودة أعلى» للمشتركين والمالك فقط).
   الجودة العالية ترفع تكلفة المزوّد على المالك (Veo الكامل، 1080، ترقية 2K) والنقاط المخصومة كما هي، فلا تُعطى
   إلّا للمالك وVIP ومشترك بباقة سارية (tier.resolveTier). غير ذلك يُنزَّل إلى الجودة السريعة بصمت — الواجهة تُخفي
   المفتاح عنه أصلًا، فهذا خطّ الدفاع لمن يرسل quality:'high' بيده. عطل قراءة الطبقة = لا (لا فتح للتكلفة). */
async function allowHigh(username) {
  if (!username) return false;
  try {
    if (require('./points.js').isOwnerUsername(username)) return true;
    if (await require('./_vip.js').isVip(username)) return true;
    const tier = await require('./tier.js').resolveTier(username, { noCache: true, getUser: (u) => require('./auth.js').getUserOnce(u) });
    return !!(tier && tier.tier === 'sub');
  } catch (e) {
    console.warn('[quality-gate] tier read failed, high quality denied: ' + (e && e.message));
    return false;
  }
}

/** quality كما طُلبت إن سُمح بها، وإلّا 'fast'. لا تمسّ غير 'high'. */
async function gateQuality(username, quality) {
  if (quality !== 'high') return quality;
  return (await allowHigh(username)) ? 'high' : 'fast';
}

module.exports = { allowHigh, gateQuality };
