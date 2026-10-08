// Shared helper for the "🏠 AI Interior Design" feature, which runs on the
// site owner's own Gemini API key. Costs are small per image but this still
// runs on the owner's key, so it requires a logged-in account and has its
// own small daily counter, completely separate from chat usage (db/usage/)
// and video usage (db/video-usage/). Resets automatically each day (UTC).
const crypto = require('crypto');
// v-atomic-quota: العدّ في _dailyQuota.js — حجز ذرّيّ قبل التوليد يُردّ إن فشل (كان قراءة JSON ثمّ كتابة).
const quotaTally = require('./_dailyQuota.js');
// v-plan-caps: الحدّ أدناه للمجّانيّ، والمشترك بباقة سارية بنسبة سقف محادثته (_planCap.js).
const { planScaledLimit } = require('./_planCap.js');
const { isBanned } = require('./auth.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

// v-owner-open: المالك (بأي من أسمائه في OWNER_USERNAMES أو OWNER_USERNAME)
// وقائمة VIP بلا حدود — كان المالك نفسه محدودًا هنا.
const { isVip } = require('./_vip.js');
// v-owner-core: قائمة موحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
const __OWNERS = require('./_owner.js').ownerList();
async function __unlimitedUser(username) {
  if (!username) return false;
  if (__OWNERS.includes(String(username).toLowerCase())) return true;
  try { return await isVip(username); } catch (e) { return false; }
}

const DESIGN_DAILY_LIMIT = 3;

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

// Verifies the session token and checks the daily quota.
// v-atomic-quota: مع res (ردّ طلب التوليد) يحجز مقعدًا ذرّيًّا يُردّ قبل خروج الردّ ما لم يُستهلك؛ بلا res قراءة مجرّدة.
async function checkDesignQuota(token, res) {
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
  const limit = await planScaledLimit(username, DESIGN_DAILY_LIMIT);
  return Object.assign(await quotaTally.check('design', username, limit, res), { limit });
}

// Consumes one design generation from today's allowance. Only call this
// AFTER Gemini has actually returned a successful image — a failed request
// must never burn a user's daily quota.
async function consumeDesign(username) {
  if (await __unlimitedUser(username)) return Infinity;
  return quotaTally.consume('design', username, await planScaledLimit(username, DESIGN_DAILY_LIMIT));
}

module.exports = { checkDesignQuota, consumeDesign, DESIGN_DAILY_LIMIT };
