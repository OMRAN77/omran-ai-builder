// Shared helper for the AI Video Maker feature (Runway / Veo 3), which runs on
// the site owner's own API key and costs real money per second of video
// generated. Because of that cost, video generation REQUIRES a logged-in
// account (no guest/anonymous access) and is capped to a small number of
// videos per day per account. Usage is stored as one small JSON record per
// user (db/video-usage/<username>.json), separate from chat usage in
// db/usage/, and resets automatically each day (UTC).
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';

// During the free testing phase, keep this small: each generated video
// (a few seconds at Gen-4/Veo 3 pricing) costs the owner real money.
const VIDEO_DAILY_LIMIT = 3;

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
  return 'db/video-usage/' + encodeURIComponent(username) + '.json';
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

// Verifies the session token and checks whether the user is still under the
// daily video quota, WITHOUT consuming any allowance yet. Video generation
// has no guest/anonymous mode — an account is required. Returns:
//   { allowed: true,  username, remaining }
//   { allowed: false, reason: 'auth' | 'limit', username }
async function checkVideoQuota(token) {
  const username = verifyToken(token);
  if (!username) {
    return { allowed: false, reason: 'auth', username: null };
  }
  if (isOwner(username)) {
    return { allowed: true, username, remaining: Infinity };
  }
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  if (usage.count >= VIDEO_DAILY_LIMIT) {
    return { allowed: false, reason: 'limit', username };
  }
  return { allowed: true, username, remaining: VIDEO_DAILY_LIMIT - usage.count };
}

// Actually consumes one video generation from today's allowance. Only call
// this AFTER the upstream provider (Runway/Veo 3) has confirmed the task
// actually started — a failed/rejected request (e.g. insufficient provider
// credits, bad prompt) must never burn a user's daily quota.
async function consumeVideo(username) {
  const today = todayStr();
  let usage = await getUsage(username);
  if (!usage || usage.date !== today) {
    usage = { date: today, count: 0 };
  }
  usage.count += 1;
  await putUsage(username, usage);
  return VIDEO_DAILY_LIMIT - usage.count;
}

// The one account allowed to bypass the daily quota for the "long video"
// (multi-minute, many-scene) feature, since that feature can burn a large
// number of scenes in a single run. Everyone else still goes through the
// normal small daily limit above. Set via Vercel env var; falls back to the
// owner's own username so this works even before the env var is configured.
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();

function isOwner(username) {
  return !!username && String(username).trim().toLowerCase() === OWNER_USERNAME;
}

// Verifies the session token and confirms the account is the designated
// owner account, WITHOUT touching the daily quota at all. Used only by the
// "long video" (multi-scene) feature, which is restricted to this one
// account so nobody else can rack up real charges on the owner's API keys.
function checkOwnerBypass(token) {
  const username = verifyToken(token);
  if (!username) return { allowed: false, reason: 'auth', username: null };
  if (!isOwner(username)) return { allowed: false, reason: 'forbidden', username };
  return { allowed: true, username };
}

module.exports = { checkVideoQuota, consumeVideo, VIDEO_DAILY_LIMIT, isOwner, checkOwnerBypass };
