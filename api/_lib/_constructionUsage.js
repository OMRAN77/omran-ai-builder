// Shared helper for "🏗️ تصاميم المقاولات والبناء". Same pattern as
// _designUsage.js but its own separate daily counter/namespace so it never
// interferes with the interior-design feature's quota.
const crypto = require('crypto');
// v-atomic-quota: العدّ في _dailyQuota.js — حجز ذرّيّ قبل التوليد يُردّ إن فشل (كان قراءة JSON ثمّ كتابة).
const quotaTally = require('./_dailyQuota.js');
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

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

const CONSTRUCTION_DAILY_LIMIT = 6;

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
  return quotaTally.check('construction', username, CONSTRUCTION_DAILY_LIMIT, res);
}

async function consumeConstruction(username) {
  if (await __unlimitedUser(username)) return Infinity;
  return quotaTally.consume('construction', username, CONSTRUCTION_DAILY_LIMIT);
}

module.exports = { checkConstructionQuota, consumeConstruction, CONSTRUCTION_DAILY_LIMIT };
