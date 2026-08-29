// Vercel Serverless Function: OWNER-ONLY dashboard stats.
// Reads the Redis-backed user/usage index and returns an aggregated
// summary. Never exposed to regular users — the caller's session token is
// verified server-side and must belong to OWNER_USERNAME, independent of
// whatever the frontend hides/shows.
const crypto = require('crypto');
const { getUserOnce } = require('./auth.js');
const { kvList, kvGetJSON } = require('./kv.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;
// v-owner-core: قائمة المالك الموحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
const { isOwnerName, ownerList } = require('./_owner.js');

// User records are stored encrypted at rest (see auth.js). Always go through
// auth.js's getUserOnce() (which transparently decrypts) instead of reading
// the raw key directly - reading it here would just return ciphertext.
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
    if (!isOwnerName(username)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }

    const [userKeys, tallyKeys] = await Promise.all([
      kvList('db/users/'),
      kvList('db/usage/tally/'),
    ]);

    const today = todayStr();

    // Note: Redis has no built-in "last write" metadata like Blob did, so
    // signup/activity date now comes from each user record's own createdAt
    // field (recorded at signup) instead of the storage layer's upload
    // timestamp. This means "lastWrite" below reflects signup time, not the
    // most recent profile update.
    const userRecords = await Promise.all(userKeys.map(async (k) => {
      const raw = decodeURIComponent(String(k).replace(/^db\/users\//, '').replace(/\.json$/, ''));
      if (!raw) return null;
      const rec = await getUserRecord(raw).catch(() => null);
      return {
        username: raw,
        lastWrite: rec && rec.createdAt ? new Date(rec.createdAt).toISOString() : null,
        rec,
      };
    }));
    const users = userRecords.filter(Boolean);

    const realUsers = users.filter((u) => !isTestUsername(u.username));
    const testUsers = users.filter((u) => isTestUsername(u.username));

    // Signups/activity bucketed by day (based on the user record's own
    // createdAt field).
    const byDay = {};
    realUsers.forEach((u) => {
      const day = String(u.lastWrite || '').slice(0, 10);
      if (!day) return;
      byDay[day] = (byDay[day] || 0) + 1;
    });

    // Usage tally keys look like: db/usage/tally/<username_YYYY-MM-DD_provider>/<YYYY-MM-DD>
    // (one Redis counter per user+day+provider, see _usage.js). Each key's
    // VALUE is the message count for that day (not one entry per message
    // anymore), so totals are summed from the counter values.
    let totalMessagesAllTime = 0;
    let messagesToday = 0;
    const perProviderToday = {};
    const perUserToday = {};
    await Promise.all(tallyKeys.map(async (k) => {
      const raw = decodeURIComponent(String(k).replace(/^db\/usage\/tally\//, ''));
      const compositeKey = raw.split('/')[0];
      const parts = compositeKey.split('_');
      if (parts.length < 3) return;
      const provider = parts.pop();
      const date = parts.pop();
      const uname = parts.join('_');
      const rawVal = await kvGetJSON(k).catch(() => null);
      const count = typeof rawVal === 'number' ? rawVal : (parseInt(rawVal, 10) || 0);
      totalMessagesAllTime += count;
      if (date === today) {
        messagesToday += count;
        perProviderToday[provider] = (perProviderToday[provider] || 0) + count;
        perUserToday[uname] = (perUserToday[uname] || 0) + count;
      }
    }));

    const topUsersToday = Object.entries(perUserToday)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([u, c]) => ({ username: u, messages: c }));

    // Full manageable-users list (real accounts only, capped) with live
    // banned/email status from the already-fetched record — needed to
    // render ban/unban/delete/message controls in the owner's panel.
    const manageableUsers = realUsers
      .filter((u) => !ownerList().includes(u.username))
      .sort((a, b) => new Date(b.lastWrite || 0) - new Date(a.lastWrite || 0))
      .slice(0, 60)
      .map((u) => ({
        username: u.username,
        lastWrite: u.lastWrite,
        email: u.rec ? (u.rec.email || null) : null,
        banned: !!(u.rec && u.rec.banned),
      }));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalAccounts: users.length,
      realAccounts: realUsers.length,
      testAccounts: testUsers.length,
      signupsByDay: byDay,
      recentUsers: realUsers
        .map((u) => ({ username: u.username, lastWrite: u.lastWrite }))
        .sort((a, b) => new Date(b.lastWrite || 0) - new Date(a.lastWrite || 0))
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
