// Shared helper: Upstash Redis REST client (replaces Vercel Blob, which was
// suspended). Uses the global fetch available in Node 18+ — no npm package
// required. Auth via a bearer token against the project's REST URL.
//
// Env vars:
//   UPSTASH_REDIS_REST_URL   e.g. https://xxxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN
//
// Every "path" used across this app as a Vercel Blob pathname (e.g.
// 'db/users/omran.json') is reused unchanged as the Redis key string, so
// callers don't need to change how they build keys.
const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Sends a single Redis command as a JSON array, per Upstash's REST API
// (POST body = ["CMD", "arg1", "arg2", ...]). This form is used everywhere
// (rather than the path-style shortcuts) so keys/values with special
// characters never need extra escaping.
async function command(args) {
  if (!REST_URL || !REST_TOKEN) {
    throw new Error('Server is missing UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN');
  }
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REST_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error || JSON.stringify(data))) || ('HTTP ' + res.status);
    throw new Error('Upstash error: ' + msg);
  }
  return data ? data.result : null;
}

// GET key -> parsed JSON, or null if missing/invalid.
async function kvGetJSON(key) {
  try {
    const raw = await command(['GET', key]);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  } catch (e) {
    return null;
  }
}

// SET key JSON.stringify(obj)
async function kvPutJSON(key, obj) {
  await command(['SET', key, JSON.stringify(obj)]);
}

// DEL key
async function kvDel(key) {
  try {
    await command(['DEL', key]);
  } catch (e) {
    // best-effort
  }
}

// SCAN-based prefix listing: returns every key matching `${prefix}*`.
async function kvList(prefix) {
  const match = prefix + '*';
  const keys = [];
  let cursor = '0';
  do {
    const result = await command(['SCAN', cursor, 'MATCH', match, 'COUNT', '1000']);
    if (!Array.isArray(result) || result.length < 2) break;
    cursor = String(result[0]);
    const batch = result[1] || [];
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

// INCR key -> new integer value
async function kvIncr(key) {
  const val = await command(['INCR', key]);
  return Number(val);
}

// EXPIRE key seconds
async function kvExpire(key, seconds) {
  try {
    await command(['EXPIRE', key, String(seconds)]);
  } catch (e) {
    // best-effort
  }
}

module.exports = { kvGetJSON, kvPutJSON, kvDel, kvList, kvIncr, kvExpire };
