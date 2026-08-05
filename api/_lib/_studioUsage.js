// Shared helper for the "💄 AI Style Studio" feature (hair dye, nails, makeup,
// beard, skin smoothing, glasses try-on, tattoo preview, anime style, photo
// merge). Runs on the site owner's own Gemini API key. Has its own small
// daily counter, completely separate from chat usage, design usage, and
// fashion usage. Resets automatically each day (UTC).
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

const STUDIO_DAILY_LIMIT = 3;

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
  return 'db/studio-usage/' + encodeURIComponent(username) + '.json';
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
async function checkStudioQuota(token) {
  const username = verifyToken(token);
  if (!username) {
    return { allowed: false, reason: 'auth', username: null };
  }
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  if (usage.count >= STUDIO_DAILY_LIMIT) {
    return { allowed: false, reason: 'limit', username };
  }
  return { allowed: true, username, remaining: STUDIO_DAILY_LIMIT - usage.count };
}

// Consumes one generation from today's allowance. Only call this AFTER
// Gemini has actually returned a successful image — a failed request must
// never burn a user's daily quota.
async function consumeStudio(username) {
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  usage.count += 1;
  await putUsage(username, usage);
  return STUDIO_DAILY_LIMIT - usage.count;
}

module.exports = { checkStudioQuota, consumeStudio, STUDIO_DAILY_LIMIT };
