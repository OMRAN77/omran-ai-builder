// Shared helper for the "🎨 Portrait Styles" feature, which runs on the
// site owner's own Gemini API key. Costs are small per image but this still
// runs on the owner's key, so it requires a logged-in account and has its
// own small daily counter, completely separate from chat usage (db/usage/)
// and other image tools (db/design-usage/, db/fashion-usage/, db/studio-usage/).
// Resets automatically each day (UTC).
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');
const { isBanned } = require('./auth.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

const PORTRAIT_DAILY_LIMIT = 3;
// v-owner-open: عدة أسماء للمالك (OWNER_USERNAMES بفواصل) + قائمة VIP بلا حدود.
const { isVip } = require('./_vip.js');
const __OWNERS = String(process.env.OWNER_USERNAMES || process.env.OWNER_USERNAME || 'omran')
  .toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
async function __unlimitedUser(username) {
  if (!username) return false;
  if (__OWNERS.includes(String(username).toLowerCase())) return true;
  try { return await isVip(username); } catch (e) { return false; }
}

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
  return 'db/portrait-usage/' + encodeURIComponent(username) + '.json';
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

// Verifies the session token and checks the daily quota WITHOUT consuming it.
async function checkPortraitQuota(token) {
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
  if (usage.count >= PORTRAIT_DAILY_LIMIT) {
    return { allowed: false, reason: 'limit', username };
  }
  return { allowed: true, username, remaining: PORTRAIT_DAILY_LIMIT - usage.count };
}

// Consumes one portrait-style generation from today's allowance. Only call
// this AFTER Gemini has actually returned a successful image — a failed
// request must never burn a user's daily quota.
async function consumePortrait(username) {
  if (await __unlimitedUser(username)) {
    return Infinity;
  }
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  usage.count += 1;
  await putUsage(username, usage);
  return PORTRAIT_DAILY_LIMIT - usage.count;
}

module.exports = { checkPortraitQuota, consumePortrait, PORTRAIT_DAILY_LIMIT };
