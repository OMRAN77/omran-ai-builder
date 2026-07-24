// Shared helper for "🏗️ تصاميم المقاولات والبناء". Same pattern as
// _designUsage.js but its own separate daily counter/namespace so it never
// interferes with the interior-design feature's quota.
const crypto = require('crypto');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

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
  try {
    const res = await fetch(PUBLIC_BASE + usagePath(username) + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function putUsage(username, usage) {
  try {
    await fetch(BLOB_BASE + '/' + usagePath(username), {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + BLOB_TOKEN,
        'x-content-type': 'application/json',
        'x-add-random-suffix': '0',
        'x-cache-control-max-age': '0',
      },
      body: JSON.stringify(usage),
    });
  } catch (e) {
    // Best-effort bookkeeping; never block on a write failure here.
  }
}

async function checkConstructionQuota(token) {
  const username = verifyToken(token);
  if (!username) {
    return { allowed: false, reason: 'auth', username: null };
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
