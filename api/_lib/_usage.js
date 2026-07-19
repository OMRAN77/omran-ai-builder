// Shared helper for the free server-proxied providers (Groq / OpenAI / Claude),
// which run on the site owner's own API keys. Enforces a daily message cap per
// logged-in account so a single account can't run up the owner's bill. Usage is
// stored as one small JSON blob per user (db/usage/<username>.json), separate
// from the account record in db/users/, and resets automatically each day (UTC).
const crypto = require('crypto');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

// Combined daily limit shared across all three free server-proxied providers
// (Groq + OpenAI + Claude), per logged-in account.
const DAILY_LIMIT = 20;

// The site owner's own account never counts against any daily quota (across
// every provider and STT) — it's their own API keys and their own bill, and
// getting silently blocked mid-testing (e.g. inside the مها voice loop) was
// indistinguishable from a real bug. Case-insensitive match against the
// account username.
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'taryam').trim().toLowerCase();
function isOwnerUsername(username) {
  return !!username && String(username).trim().toLowerCase() === OWNER_USERNAME;
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

function tallyPrefix(key) {
  return 'db/usage/tally/' + encodeURIComponent(key) + '/';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Counts how many "tally" marker files exist for this key (one file gets
// written per consumed message; see addTally below). Uses the blob store's
// own list API (queried against the store directly) instead of reading a
// single counter file through the public CDN — reading+overwriting one file
// was prone to occasionally serving a few-seconds-stale cached count under
// quick repeated requests, letting more messages through than the limit
// allows. Listing distinct per-message files sidesteps that entirely: each
// message is its own new object, so there is nothing to overwrite and
// nothing stale to read.
async function countTally(key) {
  try {
    let count = 0;
    let cursor;
    do {
      const url = new URL(BLOB_BASE + '/');
      url.searchParams.set('prefix', tallyPrefix(key));
      url.searchParams.set('limit', '1000');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString(), {
        headers: { Authorization: 'Bearer ' + BLOB_TOKEN },
      });
      if (!res.ok) break;
      const data = await res.json();
      count += (data.blobs || []).length;
      cursor = data.hasMore ? data.cursor : null;
    } while (cursor);
    return count;
  } catch (e) {
    return 0;
  }
}

async function addTally(key) {
  try {
    const marker = tallyPrefix(key) + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.json';
    await fetch(BLOB_BASE + '/' + marker, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + BLOB_TOKEN,
        'x-content-type': 'application/json',
        'x-add-random-suffix': '0',
      },
      body: '1',
    });
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
async function checkAndConsume(token, guestId, provider) {
  // Each AI provider (mistral / deepseek / cohere / openai / claude / gemini /
  // groq / openrouter / perplexity) gets its own fully independent daily
  // allowance, so "Ask All" only spends 1 message per provider instead of
  // draining a single shared pool. Callers that don't pass a provider name
  // fall back to a generic bucket ("general") to stay backward compatible.
  const providerKey = provider ? String(provider).toLowerCase() : 'general';

  const username = verifyToken(token);
  if (username) {
    // Owner account: unlimited, always allowed, never tallied.
    if (isOwnerUsername(username)) {
      return { allowed: true, username, remaining: Infinity };
    }
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

  if (isValidGuestId(guestId)) {
    const key = 'guest_' + guestId + '_' + providerKey;
    const count = await countTally(key);
    if (count >= GUEST_LIMIT) {
      return { allowed: false, reason: 'limit', username: null };
    }
    await addTally(key);
    return { allowed: true, username: null, remaining: GUEST_LIMIT - (count + 1) };
  }

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
  if (username && isOwnerUsername(username)) {
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

module.exports = { checkAndConsume, DAILY_LIMIT, GUEST_LIMIT, getAllRemaining };
