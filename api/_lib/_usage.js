// Shared helper for the free server-proxied providers (Groq / OpenAI / Claude),
// which run on the site owner's own API keys. Enforces a daily message cap per
// logged-in account so a single account can't run up the owner's bill. Usage is
// tracked as one Redis counter per user+day+provider (db/usage/tally/<key>/<date>),
// separate from the account record in db/users/, and resets automatically each
// day (UTC) via a 2-day TTL on the counter key.
const crypto = require('crypto');
const { getUser, putUser, isBanned } = require('./auth.js');
const { kvIncr, kvExpire, kvGetJSON } = require('./kv.js');
const { isVip } = require('./_vip.js');

// ⏳ مؤجَّلة: قراءة السرّ في نطاق الوحدة تحوّل متغيّرًا مفقودًا إلى انهيار
// عند الإقلاع البارد بلا سجلّ (حدث في /api/edu). انظر api/_lib/auth.js.
const __secrets = require('./_secrets.js');
const authSecret = () => __secrets.AUTH_SECRET;

// Combined daily limit shared across all three free server-proxied providers
// (Groq + OpenAI + Claude), per logged-in account.
const DAILY_LIMIT = 20;

// The site owner's own account never counts against any daily quota (across
// every provider and STT) — it's their own API keys and their own bill, and
// getting silently blocked mid-testing (e.g. inside the مها voice loop) was
// indistinguishable from a real bug. Case-insensitive match against the
// account username.
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();
function isOwnerUsername(username) {
  return !!username && String(username).trim().toLowerCase() === OWNER_USERNAME;
}

// قائمة VIP (see _vip.js): أسماء يمنحها المالك نفس الإعفاء من الحدّ اليوميّ.
// تُفحص بعد فحص المالك دائمًا، فحساب المالك لا يمسّ Redis أصلًا، وفحص
// الباقين يمرّ من ذاكرة ٣٠ ثانية داخل العملية لا من نداء لكل رسالة.
// isVip لا ترمي أبدًا: عطبٌ في القائمة = «ليس VIP» = الحدّ كما كان.

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

function tallyKey(key) {
  return 'db/usage/tally/' + encodeURIComponent(key) + '/' + todayStr();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Reads today's message count for this key via a single Redis counter
// (INCR-based). GET on the counter key returns its value as a string;
// missing key -> 0.
async function countTally(key) {
  try {
    const raw = await kvGetJSON(tallyKey(key));
    // kvGetJSON attempts JSON.parse; a bare integer string like "3" parses
    // fine to the number 3. Anything unparsable/missing comes back as null.
    const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

// Increments today's counter for this key by one message. Sets a 2-day
// expiry on first increment so stale counters never accumulate forever
// (the daily limit naturally resets at UTC midnight since the key itself
// is date-scoped).
async function addTally(key) {
  try {
    const k = tallyKey(key);
    const newVal = await kvIncr(k);
    if (newVal === 1) {
      await kvExpire(k, 172800); // 2 days
    }
  } catch (e) {
    // Best-effort: if this fails, worst case is one extra free message slips
    // through today — never block the actual AI request over a bookkeeping write.
  }
}

// Lifetime cap (not daily) for anonymous guests trying the app before creating
// an account. Tracked by a random client-generated id stored in localStorage
// (see aiapp_guest_id / getGuestId() in index.html), never used for anything
// sensitive — it only limits how many free trial messages one browser gets.
const GUEST_LIMIT = 20;

function isValidGuestId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{6,64}$/.test(id);
}

// Verifies the session token and, if valid and under quota, atomically-ish
// consumes one message from today's allowance. Returns:
//   { allowed: true,  username, remaining }
//   { allowed: false, reason: 'auth' | 'limit', username }
// If there is no valid login token but a guestId is supplied, falls back to a
// lifetime free-trial allowance for that anonymous browser instead of hard
// requiring an account (guest mode UX promise: N free messages, no login).
async function checkAndConsume(token, guestId, provider, ip) {
  // Each AI provider (mistral / deepseek / cohere / openai / claude / gemini /
  // groq / openrouter / perplexity) gets its own fully independent daily
  // allowance, so "Ask All" only spends 1 message per provider instead of
  // draining a single shared pool. Callers that don't pass a provider name
  // fall back to a generic bucket ("general") to stay backward compatible.
  const providerKey = provider ? String(provider).toLowerCase() : 'general';

  const username = verifyToken(token);
  if (username) {
    // Owner account: unlimited, always allowed, never tallied. VIP accounts
    // get the exact same treatment (المالك أوّلًا: قصر الدائرة بلا نداء Redis).
    if (isOwnerUsername(username) || await isVip(username)) {
      return { allowed: true, username, remaining: Infinity };
    }
    // Suspended accounts keep a valid token until it expires; refuse here so
    // the ban actually costs them access instead of only the login screen.
    if (await isBanned(username)) return { allowed: false, reason: 'auth', banned: true, username };
    // Tally key includes today's date, so yesterday's marks simply stop
    // counting (no cleanup needed) and the limit naturally resets at UTC
    // midnight.
    const key = username + '_' + todayStr() + '_' + providerKey;
    const count = await countTally(key);
    if (count >= DAILY_LIMIT) {
      // Daily free quota for this provider is used up — fall back to the
      // user's referral bonus balance (a one-time reward pool, not tied to
      // any single provider or day) before finally blocking the request.
      try {
        const user = await getUser(username);
        if (user && !user.deleted && (user.bonusMessages || 0) > 0) {
          user.bonusMessages -= 1;
          await putUser(username, user);
          return { allowed: true, username, remaining: 0, usedBonus: true };
        }
      } catch (e) { /* if the bonus check fails, just fall through to blocking */ }
      return { allowed: false, reason: 'limit', username };
    }
    await addTally(key);
    return { allowed: true, username, remaining: DAILY_LIMIT - (count + 1) };
  }

  // Guests are counted by network address, not by the id their own browser
  // generated. `guestId` lives in localStorage: one line of script produced a
  // fresh one per request, so the "lifetime" allowance was no allowance at all
  // and the owner's nine API keys were effectively open to anyone.
  // api/edu.js already limits by IP — this is the same approach, applied to the
  // path that actually spends money.
  const addr = ip && String(ip).trim() ? String(ip).trim() : null;
  if (addr) {
    const key = 'guestip_' + addr + '_' + providerKey;
    const count = await countTally(key);
    if (count >= GUEST_LIMIT) {
      return { allowed: false, reason: 'limit', username: null };
    }
    await addTally(key);
    return { allowed: true, username: null, remaining: GUEST_LIMIT - (count + 1) };
  }

  // No address and no session: refuse rather than fall back to a
  // client-controlled identifier.
  return { allowed: false, reason: 'auth', username: null };
}

// All 9 server-proxied provider keys, used to report per-provider remaining
// quota to the client (read-only — does NOT consume anything) so the UI can
// show a quick "who still has quota today" picker without trial-and-error.
const ALL_PROVIDERS = ['mistral', 'deepseek', 'cohere', 'openai', 'claude', 'gemini', 'groq', 'openrouter', 'perplexity'];

async function getAllRemaining(token, guestId) {
  const username = verifyToken(token);
  const isGuest = !username && isValidGuestId(guestId);
  if (!username && !isGuest) {
    return { authed: false, username: null, remaining: {} };
  }
  if (username && (isOwnerUsername(username) || await isVip(username))) {
    const remaining = {};
    ALL_PROVIDERS.forEach((p) => { remaining[p] = Infinity; });
    return { authed: true, username, remaining, limit: Infinity };
  }
  const limit = username ? DAILY_LIMIT : GUEST_LIMIT;
  const remaining = {};
  await Promise.all(ALL_PROVIDERS.map(async (p) => {
    const key = username
      ? username + '_' + todayStr() + '_' + p
      : 'guest_' + guestId + '_' + p;
    const count = await countTally(key);
    remaining[p] = Math.max(0, limit - count);
  }));
  return { authed: true, username: username || null, remaining, limit };
}

// Generic metering for endpoints that (a) have their own custom daily cap
// different from the shared text-provider DAILY_LIMIT/GUEST_LIMIT above, and
// (b) may currently be called by the frontend WITHOUT a token/guestId at all
// (e.g. tts.js / translate.js / search.js today). Behaves like
// checkAndConsume() for logged-in users and guests, but additionally falls
// back to metering by client IP when neither a token nor a guestId is
// present, instead of hard-rejecting the request — this keeps today's
// frontend working unmodified while still capping the owner's per-endpoint
// API bill. Only returns { allowed:false, reason:'auth' } if the caller has
// no token, no guestId, AND no discoverable IP (should not normally happen
// on Vercel).
async function checkAndConsumeCustom(token, guestId, ip, provider, dailyLimit) {
  const providerKey = provider ? String(provider).toLowerCase() : 'general';

  const username = verifyToken(token);
  if (username) {
    if (isOwnerUsername(username) || await isVip(username)) {
      return { allowed: true, username, remaining: Infinity };
    }
    if (await isBanned(username)) return { allowed: false, reason: 'auth', banned: true, username };
    const key = username + '_' + todayStr() + '_' + providerKey;
    const count = await countTally(key);
    if (count >= dailyLimit) {
      return { allowed: false, reason: 'limit', username };
    }
    await addTally(key);
    return { allowed: true, username, remaining: dailyLimit - (count + 1) };
  }

  // Guests: meter by network address first, so rotating the client-supplied
  // guestId (trivially reset from localStorage) can no longer mint fresh
  // per-endpoint quota. This mirrors checkAndConsume()'s guestip_ approach.
  const cleanIp = (typeof ip === 'string' && ip.trim()) ? ip.trim().slice(0, 64) : null;
  if (cleanIp) {
    const key = 'ip_' + cleanIp + '_' + todayStr() + '_' + providerKey;
    const count = await countTally(key);
    if (count >= dailyLimit) {
      return { allowed: false, reason: 'limit', username: null };
    }
    await addTally(key);
    return { allowed: true, username: null, remaining: dailyLimit - (count + 1) };
  }

  // Only when no IP is discoverable at all (rare on Vercel) do we fall back to
  // the client-supplied guestId — better than nothing, and no longer the
  // primary gate. Bucketed by day to match dailyLimit semantics.
  if (isValidGuestId(guestId)) {
    const key = 'guest_' + guestId + '_' + todayStr() + '_' + providerKey;
    const count = await countTally(key);
    if (count >= dailyLimit) {
      return { allowed: false, reason: 'limit', username: null };
    }
    await addTally(key);
    return { allowed: true, username: null, remaining: dailyLimit - (count + 1) };
  }

  return { allowed: false, reason: 'auth', username: null };
}

// Best-effort extraction of the caller's IP from Vercel's forwarded headers.
function clientIp(req) {
  try {
    const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
    if (fwd) return String(fwd).split(',')[0].trim();
    if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  } catch (e) { /* ignore */ }
  return null;
}

module.exports = { checkAndConsume, DAILY_LIMIT, GUEST_LIMIT, getAllRemaining, checkAndConsumeCustom, clientIp };
