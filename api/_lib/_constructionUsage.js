// Shared helper for "🏗️ تصاميم المقاولات والبناء". Same pattern as
// _designUsage.js but its own separate daily counter/namespace so it never
// interferes with the interior-design feature's quota.
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');
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

function usagePath(username) {
  return 'db/construction-usage/' + encodeURIComponent(username) + '.json';
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

async function checkConstructionQuota(token) {
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
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  if (usage.count >= CONSTRUCTION_DAILY_LIMIT) {
    return { allowed: false, reason: 'limit', username };
  }
  return { allowed: true, username, remaining: CONSTRUCTION_DAILY_LIMIT - usage.count };
}

async function consumeConstruction(username) {
  if (await __unlimitedUser(username)) return Infinity;
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  usage.count += 1;
  await putUsage(username, usage);
  return CONSTRUCTION_DAILY_LIMIT - usage.count;
}

module.exports = { checkConstructionQuota, consumeConstruction, CONSTRUCTION_DAILY_LIMIT };
