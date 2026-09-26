// Shared helper for the "🚗 قسم السيارات" (Car Tools) feature, which runs
// on the site owner's own Gemini API key. Same pattern as _portraitUsage.js
// but with its own completely separate daily counter (db/car-usage/).
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');
const { isBanned } = require('./auth.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

const CAR_DAILY_LIMIT = 8;
// v-owner-core: قائمة المالك الموحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
const { isOwnerName } = require('./_owner.js');

// v-account-guard: الفحص الموحّد (رمز ٢٤ ساعة، وجلسة المالك تحتاج الخطوة الثانية).
function verifyToken(token) { return require('./session.js').verifySession(token); }

function usagePath(username) {
  return 'db/car-usage/' + encodeURIComponent(username) + '.json';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function getUsage(username) {
  return kvGetJSON(usagePath(username));
}

async function putUsage(username, usage) {
  try {
    await kvPutJSON(usagePath(username), usage);
  } catch (e) {
    // Best-effort bookkeeping; never block on a write failure here.
  }
}

async function checkCarQuota(token) {
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
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  if (usage.count >= CAR_DAILY_LIMIT) {
    return { allowed: false, reason: 'limit', username };
  }
  return { allowed: true, username, remaining: CAR_DAILY_LIMIT - usage.count };
}

async function consumeCar(username) {
  if (isOwnerName(username)) {
    return Infinity;
  }
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  usage.count += 1;
  await putUsage(username, usage);
  return CAR_DAILY_LIMIT - usage.count;
}

module.exports = { checkCarQuota, consumeCar, CAR_DAILY_LIMIT };
