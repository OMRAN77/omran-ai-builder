// Vercel Serverless Function: OWNER-ONLY dashboard stats.
// Reads the Blob store's own user/usage index and returns an aggregated
// summary. Never exposed to regular users — the caller's session token is
// verified server-side and must belong to OWNER_USERNAME, independent of
// whatever the frontend hides/shows.
const crypto = require('crypto');
const { getUserOnce } = require('./auth.js');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();

// User records are stored encrypted at rest (see auth.js). Always go through
// auth.js's getUserOnce() (which transparently decrypts) instead of fetching
// the raw blob directly - reading it here would just return ciphertext.
async function getUserRecord(key) {
  return getUserOnce(key);
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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function listAll(prefix, maxPages) {
  const out = [];
  let cursor;
  let pages = 0;
  do {
    const url = new URL(BLOB_BASE + '/');
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + BLOB_TOKEN } });
    if (!res.ok) break;
    const data = await res.json();
    out.push(...(data.blobs || []));
    cursor = data.hasMore ? data.cursor : null;
    pages++;
  } while (cursor && pages < (maxPages || 25));
  return out;
}

// Obvious internal/test accounts created while building the app, so the
// owner's real-user count isn't inflated by debugging noise.
const TEST_PATTERNS = [
  /^omran_/, /^debugtest/, /^clocktest/, /^consistency_test/, /^testuser_/,
  /^emailtest_/, /^omrantestqa/, /^gemini-/,
];
function isTestUsername(u) {
  return TEST_PATTERNS.some((re) => re.test(u));
}

module.exports = async (req, res) => {
  try {
    const token = (req.query && req.query.token) || (req.body && req.body.token) || '';
    const username = verifyToken(token);
    if (!username || String(username).trim().toLowerCase() !== OWNER_USERNAME) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }

    const [userBlobs, tallyBlobs] = await Promise.all([
      listAll('db/users/', 25),
      listAll('db/usage/tally/', 25),
    ]);

    const today = todayStr();
    const users = userBlobs
      .map((b) => {
        const raw = decodeURIComponent(String(b.pathname).replace(/^db\/users\//, '').replace(/\.json$/, ''));
        return { username: raw, lastWrite: b.uploadedAt, size: b.size };
      })
      .filter((u) => u.username);

    const realUsers = users.filter((u) => !isTestUsername(u.username));
    const testUsers = users.filter((u) => isTestUsername(u.username));

    // Signups/activity bucketed by day (based on blob's last-write date —
    // this file is (re)written on signup and on profile updates).
    const byDay = {};
    realUsers.forEach((u) => {
      const day = String(u.lastWrite || '').slice(0, 10);
      if (!day) return;
      byDay[day] = (byDay[day] || 0) + 1;
    });

    // Usage tally: key = username_YYYY-MM-DD_provider (one marker file per
    // consumed message). Parse from the right so usernames with underscores
    // still work.
    let totalMessagesAllTime = 0;
    let messagesToday = 0;
    const perProviderToday = {};
    const perUserToday = {};
    tallyBlobs.forEach((b) => {
      const raw = decodeURIComponent(String(b.pathname).replace(/^db\/usage\/tally\//, ''));
      const key = raw.split('/')[0];
      const parts = key.split('_');
      if (parts.length < 3) return;
      const provider = parts.pop();
      const date = parts.pop();
      const uname = parts.join('_');
      totalMessagesAllTime++;
      if (date === today) {
        messagesToday++;
        perProviderToday[provider] = (perProviderToday[provider] || 0) + 1;
        perUserToday[uname] = (perUserToday[uname] || 0) + 1;
      }
    });

    const topUsersToday = Object.entries(perUserToday)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([u, c]) => ({ username: u, messages: c }));

    // Full manageable-users list (real accounts only, capped) with live
    // banned/email status fetched from each user's own record — needed to
    // render ban/unban/delete/message controls in the owner's panel.
    const manageCandidates = realUsers
      .filter((u) => u.username !== OWNER_USERNAME)
      .sort((a, b) => new Date(b.lastWrite) - new Date(a.lastWrite))
      .slice(0, 60);
    const manageableUsers = (await Promise.all(manageCandidates.map(async (u) => {
      const key = u.username.trim().toLowerCase();
      const rec = await getUserRecord(key);
      return {
        username: u.username,
        lastWrite: u.lastWrite,
        email: rec ? (rec.email || null) : null,
        banned: !!(rec && rec.banned),
      };
    }))).filter(Boolean);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalAccounts: users.length,
      realAccounts: realUsers.length,
      testAccounts: testUsers.length,
      signupsByDay: byDay,
      recentUsers: realUsers
        .sort((a, b) => new Date(b.lastWrite) - new Date(a.lastWrite))
        .slice(0, 25),
      messagesToday,
      totalMessagesAllTime,
      perProviderToday,
      topUsersToday,
      manageableUsers,
    }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'server_error', message: String(e && e.message || e) }));
  }
};
