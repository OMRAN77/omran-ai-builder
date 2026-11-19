// Shared helper for "🏗️ تصاميم المقاولات والبناء". Same pattern as
// _designUsage.js but its own separate daily counter/namespace so it never
// interferes with the interior-design feature's quota.
// v-atomic-quota: العدّ في _dailyQuota.js — حجز ذرّيّ قبل التوليد يُردّ إن فشل (كان قراءة JSON ثمّ كتابة).
const quotaTally = require('./_dailyQuota.js');
// v-plan-caps: الحدّ أدناه للمجّانيّ، والمشترك بباقة سارية بنسبة سقف محادثته (_planCap.js).
const { planScaledLimit, planLimitInfo } = require('./_planCap.js');
const { isBanned } = require('./auth.js');
const { isVip } = require('./_vip.js');
// v-owner-unlimited (شكوى المالك «استهلكت المجاني كلها»): المالك وVIP بلا حدّ يومي هنا
// كما في الديكور والأزياء والبورتريه.
const __OWNERS = require('./_owner.js').ownerList();
async function __unlimitedUser(username) {
  if (!username) return false;
  if (__OWNERS.includes(String(username).toLowerCase())) return true;
  try { return await isVip(username); } catch (e) { return false; }
}

const CONSTRUCTION_DAILY_LIMIT = 6;

// v-session-dedupe: رمز الجلسة كما يصنعه auth.makeToken حرفيًّا (u نصّ، exp رقم في المستقبل) — نسخة محلّيّة كانت تقبل حمولة بلا exp
function verifyToken(token) {
  return require('./_session.js').sessionUser(token);
}

// v-atomic-quota: مع res (ردّ طلب التوليد) يحجز مقعدًا ذرّيًّا يُردّ قبل خروج الردّ ما لم يُستهلك؛ بلا res قراءة مجرّدة.
async function checkConstructionQuota(token, res) {
  const username = verifyToken(token);
  if (!username) {
    return { allowed: false, reason: 'auth', username: null };
  }
  // Suspended accounts hold a valid token for up to 30 days; the ban
  // has to bite on the paths that actually spend money, not just login.
  if (await isBanned(username)) return { allowed: false, reason: 'auth', banned: true, username };
  if (await __unlimitedUser(username)) {
    return { allowed: true, username, remaining: Infinity, unlimited: true };
  }
  // v-farm-gate: gift — حساب فوق سقف هديّة شبكته بلا دفع حدّه 0؛ free — يُعدّ في FREE_MEDIA_DAILY (free-tier.js).
  const { limit, free } = await planLimitInfo(username, CONSTRUCTION_DAILY_LIMIT, { gift: true });
  return Object.assign(await quotaTally.check('construction', username, limit, res, { free }), { limit });
}

// v-plan-consume-limit: limit = الحدّ المحسوب في الفحص (quota.limit) — لا قراءة ثانية للطبقة، والمتبقّي لا ينزل تحت الصفر.
async function consumeConstruction(username, limit) {
  if (await __unlimitedUser(username)) return Infinity;
  const lim = Number(limit) > 0 ? Number(limit) : await planScaledLimit(username, CONSTRUCTION_DAILY_LIMIT);
  return Math.max(0, await quotaTally.consume('construction', username, lim));
}

module.exports = { checkConstructionQuota, consumeConstruction, CONSTRUCTION_DAILY_LIMIT };
