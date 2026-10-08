// Shared helper for the "🚗 قسم السيارات" (Car Tools) feature, which runs
// on the site owner's own Gemini API key. Same pattern as _portraitUsage.js
// but with its own completely separate daily counter (db/car-usage/).
const crypto = require('crypto');
// v-atomic-quota: العدّ في _dailyQuota.js — حجز ذرّيّ قبل التوليد يُردّ إن فشل (كان قراءة JSON ثمّ كتابة).
const quotaTally = require('./_dailyQuota.js');
const { isBanned } = require('./auth.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

const CAR_DAILY_LIMIT = 8;
// v-owner-core: قائمة المالك الموحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
const { isOwnerName } = require('./_owner.js');

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
async function checkCarQuota(token, res) {
  const username = verifyToken(token);
  if (!username) {
    return { allowed: false, reason: 'auth', username: null };
  }
  // Suspended accounts hold a valid token for up to 30 days; the ban
  // has to bite on the paths that actually spend money, not just login.
  if (await isBanned(username)) return { allowed: false, reason: 'auth', banned: true, username };
  if (isOwnerName(username)) {
    return { allowed: true, username, remaining: Infinity };
  }
  return quotaTally.check('car', username, CAR_DAILY_LIMIT, res);
}

async function consumeCar(username) {
  if (isOwnerName(username)) {
    return Infinity;
  }
  return quotaTally.consume('car', username, CAR_DAILY_LIMIT);
}

module.exports = { checkCarQuota, consumeCar, CAR_DAILY_LIMIT };
