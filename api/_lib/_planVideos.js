'use strict';
// v-plan-videos (شكوى المشتركين ٣ أكتوبر ٢٠٢٦: «صلاحيته ٣ فيديوات المشتركين 375، و2 لي المشتركين، لكن ولا واحد حصل
// الفيديو» — لقطة «❌ تعذّر: points_insufficient» على ترند. ثمّ قرار المالك: «لا تسوّي أيّ شي، خلّها نفس ما هي، فقط
// صلاحيّة الفيديوات: ٣ للـ375 الاقتصاديّ أو الترند، و75 نفس الشي»).
//
// الجذر: بطاقة الباقة تعد بـ«٢ فيديو» و«٣ فيديو»، لكنّ الفيديو كان يُدفع من رصيد النقاط الواحد نفسه الذي تأكله الصور
// والصوت (٤٠ صورة = ٨٠٠ من ٩٢٠؛ ٦١ دقيقة = ٩١٥). من استعمل الصور أو مها قبله لم يبقَ له فيديو.
//
// الحلّ: صلاحيّة بالعدد لكلّ فترة اشتراك (planUpdatedAt — التجديد يفتح فترة جديدة)، **فوق** النقاط لا منها:
// Pro ٢ · Max ٣، للفيديو الاقتصاديّ أو للترند فقط. تُصرف قبل رصيد الاشتراك والنقاط، والنقاط والباقات لا تُمسّ.
// الاسترجاع (فشل المزوّد الآن أو عند الاستطلاع) يمرّ بالمبلغ كبقيّة الخصومات، فيطابق تذكرة الصلاحيّة بالمبلغ نفسه
// بالضبط ويعيدها، لا نقاطًا.
const { kvGetRaw, kvSetRaw, kvIncrBy, kvDecrBy, kvExpire } = require('./kv.js');

// v-fair-video (قرار المالك ٥ أكتوبر): Plus فيديو واحد كما تعد بطاقته (تكلفته ١٠٣ فلسات) — كانت الشكوى نفسها ستتكرّر معه.
const PLAN_VIDEOS = { basic: 1, pro: 2, max: 3 };
const PERIOD_TTL_SEC = 40 * 86400;   // أطول من نافذة الاشتراك (٣٥ يومًا)
const TICKET_TTL_SEC = 7200;         // كتذاكر مهامّ الفيديو: أطول مهمّة تنتهي قبلها

const norm = (u) => encodeURIComponent(String(u || '').trim().toLowerCase());
const usedKey = (username, at) => 'planvid:' + norm(username) + ':' + Math.floor(Number(at) || 0);
const ticketsKey = (username) => 'planvid:tix:' + norm(username);

async function readUser(username, o) {
  try { return await (o.getUser || require('./auth.js').getUser)(username); } catch (e) { return null; }
}

/** عدد فيديوهات الفترة الحاليّة لهذا الحساب: ٠ لغير المشترك أو المنتهي. */
function allowanceOf(user, now) {
  if (!require('./tier.js').planActive(user, now)) return 0;
  return PLAN_VIDEOS[String(user.plan || '').toLowerCase()] || 0;
}

/** { total, used, left } للفترة الحاليّة، أو null إن لا صلاحيّة. */
async function planVideoStatus(username, opts) {
  const o = opts || {};
  if (!username) return null;
  const user = await readUser(username, o);
  const total = allowanceOf(user, o.now);
  if (!total) return null;
  let used = 0;
  try { used = Math.max(0, Number(await kvGetRaw(usedKey(username, user.planUpdatedAt))) || 0); } catch (e) { used = 0; }
  return { total, used: Math.min(used, total), left: Math.max(0, total - used) };
}

async function planVideoLeft(username, opts) {
  const s = await planVideoStatus(username, opts);
  return s ? s.left : 0;
}

async function readTickets(username) {
  try {
    const raw = await kvGetRaw(ticketsKey(username));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

async function writeTickets(username, list) {
  try { await kvSetRaw(ticketsKey(username), JSON.stringify(list.slice(-10)), TICKET_TTL_SEC); } catch (e) { console.warn('[plan-videos] tickets write failed:', e && e.message); }
}

/**
 * يصرف فيديو واحدًا من صلاحيّة الفترة إن بقي. null = لا صلاحيّة أو نفدت، فيكمل المتّصل كما كان.
 * pts = ما كان سيُخصم نقاطًا، يُحفظ في التذكرة ليطابقه الاسترجاع.
 */
async function trySpendPlanVideo(username, pts, opts) {
  const o = opts || {};
  if (!username) return null;
  const user = await readUser(username, o);
  const total = allowanceOf(user, o.now);
  if (!total) return null;
  const key = usedKey(username, user.planUpdatedAt);
  let used;
  try { used = Number(await kvIncrBy(key, 1)); } catch (e) { return null; }
  if (!(used >= 1 && used <= total)) {
    try { await kvDecrBy(key, 1); } catch (e) { console.error('[plan-videos] rollback failed:', e && e.message); }
    return null;
  }
  try { await kvExpire(key, PERIOD_TTL_SEC); } catch (e) { /* أفضل جهد — المفتاح بالفترة نفسها فلا يتداخل */ }
  const list = await readTickets(username);
  list.push({ p: Math.floor(Number(pts) || 0), k: key });
  await writeTickets(username, list);
  return { left: total - used, total };
}

/** يعيد فيديو الصلاحيّة إن طابق المبلغ تذكرة بالضبط. يرجع ما بقي ليُردّ بالطرق الأخرى (٠ = رُدّ هنا). */
async function refundPlanVideo(username, pts) {
  const amt = Math.floor(Number(pts) || 0);
  if (!username || amt <= 0) return amt;
  const list = await readTickets(username);
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (t && t.p === amt && t.k) {
      try { await kvDecrBy(t.k, 1); } catch (e) { console.error('[plan-videos] refund failed:', e && e.message); return amt; }
      list.splice(i, 1);
      await writeTickets(username, list);
      return 0;
    }
  }
  return amt;
}

module.exports = { PLAN_VIDEOS, allowanceOf, planVideoStatus, planVideoLeft, trySpendPlanVideo, refundPlanVideo };
