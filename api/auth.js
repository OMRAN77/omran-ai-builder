// Vercel Serverless Function: full signup/login account system.
// Each user is stored as its OWN encrypted blob at an unguessable path (see
// _store.js). This avoids any read-modify-write race across concurrent signups/logins
// that a single shared JSON file would have (lost updates when two requests land
// close together). Passwords are NEVER stored in plain text — scrypt hash + random
// salt per user. Sessions are signed tokens (HMAC-SHA256) — no plaintext secrets
// ever reach the client.
const crypto = require('crypto');
const { getAuthSecret, makeToken, verifyToken } = require('./_secrets');
const store = require('./_store');
const { clientIp } = require('./_client');

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// Applies to new passwords only; existing shorter passwords still log in.
const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const SIGNUPS_PER_IP_PER_DAY = 5;

// Records written before encryption sat at this public, guessable path.
function legacyUserPath(key) {
  return 'taryam/db/users/' + encodeURIComponent(key) + '.json';
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

function genRecoveryCode() {
  const bytes = crypto.randomBytes(10).toString('hex').toUpperCase(); // 20 hex chars
  return bytes.match(/.{1,4}/g).join('-'); // XXXX-XXXX-XXXX-XXXX-XXXX
}

// key must already be the normalized (lowercased, trimmed) username.
// Reads retry a few times because a record written a moment ago (e.g. right after
// signup/reset) can briefly 404. A record still at the legacy path is moved to the
// encrypted path on first read and its public copy overwritten, so its hashes stop
// being downloadable.
async function getUser(key) {
  const path = store.secretPath('users', key);
  const user = await store.readSecret(path, 4);
  if (user) return user;
  const legacy = await store.readPublicJson(legacyUserPath(key));
  if (!legacy || legacy.migrated) return null;
  await store.writeSecret(path, legacy);
  await store.writePublicJson(legacyUserPath(key), { migrated: true });
  return legacy;
}

async function putUser(key, user) {
  await store.writeSecret(store.secretPath('users', key), user);
}

// Resolves a session token to its account. Tokens carry the account's token
// version (tv); changing or resetting the password bumps it, revoking older tokens.
async function sessionUser(token) {
  const session = verifyToken(token);
  if (!session) return null;
  const user = await getUser(session.u);
  if (!user || user.deleted || (user.tv || 0) !== session.tv) return null;
  return { key: session.u, user };
}

// Failed login/reset attempts per username. After MAX_FAILED_ATTEMPTS the name is
// locked for LOCK_MS. Blob reads are eventually consistent, so a burst of parallel
// guesses can slip a few past the counter; sequential guessing is capped.
function guardPath(key) { return store.secretPath('login-guard', key); }

async function readGuard(key) {
  const g = (await store.readSecret(guardPath(key))) || { failures: 0, lockedUntil: 0 };
  if (g.lockedUntil && g.lockedUntil <= Date.now()) return { failures: 0, lockedUntil: 0 };
  return g;
}

async function recordFailure(key, guard) {
  const failures = guard.failures + 1;
  const lockedUntil = failures >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCK_MS : 0;
  await store.writeSecret(guardPath(key), { failures, lockedUntil });
}

async function clearFailures(key, guard) {
  if (guard.failures) await store.writeSecret(guardPath(key), { failures: 0, lockedUntil: 0 });
}

function signupCounterPath(ip) { return store.secretPath('signup-ip', ip); }

async function readSignupCount(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const c = ip ? await store.readSecret(signupCounterPath(ip)) : null;
  return c && c.date === today ? c : { date: today, count: 0 };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!BLOB_TOKEN) {
    res.status(500).json({ error: 'Server is missing BLOB_READ_WRITE_TOKEN' });
    return;
  }
  if (!getAuthSecret()) {
    res.status(503).json({ error: 'Server is missing AUTH_SECRET (at least 32 characters)' });
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { action, username, password, token, recoveryCode, newPassword, newUsername, currentPassword, avatarDataUrl, lang } = body;
    const isEn = lang === 'en';
    // Small helper to return the message matching the caller's UI language
    // (client always sends its current language along with every request).
    const m = (ar, en) => (isEn ? en : ar);
    const lockedMsg = (guard) => {
      const mins = Math.ceil((guard.lockedUntil - Date.now()) / 60000);
      return m('محاولات خاطئة كثيرة. حاول مرة أخرى بعد ' + mins + ' دقيقة', 'Too many failed attempts. Try again in ' + mins + ' minute(s)');
    };

    if (action === 'signup') {
      if (!username || !password || String(username).length < 3 || String(password).length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: m('اسم المستخدم يجب أن يكون 3 أحرف على الأقل وكلمة المرور ' + MIN_PASSWORD_LENGTH + ' أحرف على الأقل', 'Username must be at least 3 characters and password at least ' + MIN_PASSWORD_LENGTH + ' characters') });
        return;
      }
      const ip = clientIp(req);
      const signups = await readSignupCount(ip);
      if (signups.count >= SIGNUPS_PER_IP_PER_DAY) {
        res.status(429).json({ error: m('تم إنشاء حسابات كثيرة من هذا الاتصال اليوم. حاول غدًا.', 'Too many accounts were created from this connection today. Try again tomorrow.') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const existing = await getUser(key);
      if (existing && !existing.deleted) {
        res.status(409).json({ error: m('اسم المستخدم مستخدم من قبل', 'Username already taken') });
        return;
      }
      const { salt, hash } = hashPassword(password);
      const recCode = genRecoveryCode();
      const rec = hashPassword(recCode);
      const user = {
        username: String(username).trim(), salt, hash,
        recoverySalt: rec.salt, recoveryHash: rec.hash,
        avatar: null,
        tv: 0,
        createdAt: Date.now(),
      };
      await putUser(key, user);
      if (ip) await store.writeSecret(signupCounterPath(ip), { date: signups.date, count: signups.count + 1 });
      res.status(200).json({ ok: true, token: makeToken(key, 0), username: user.username, recoveryCode: recCode, avatar: null });
      return;
    }

    if (action === 'changeUsername') {
      const session = await sessionUser(token);
      if (!session) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (!newUsername || String(newUsername).trim().length < 3) {
        res.status(400).json({ error: m('اسم المستخدم يجب أن يكون 3 أحرف على الأقل', 'Username must be at least 3 characters') });
        return;
      }
      const oldKey = session.key;
      const newKey = String(newUsername).trim().toLowerCase();
      if (newKey === oldKey) {
        res.status(200).json({ ok: true, token, username: newUsername.trim() });
        return;
      }
      const clash = await getUser(newKey);
      if (clash && !clash.deleted) {
        res.status(409).json({ error: m('اسم المستخدم مستخدم من قبل', 'Username already taken') });
        return;
      }
      const movedUser = Object.assign({}, session.user, { username: String(newUsername).trim() });
      await putUser(newKey, movedUser);
      // Free up the old key so it can't be logged into or re-claimed while pointing here.
      await putUser(oldKey, { deleted: true, movedTo: newKey });
      res.status(200).json({ ok: true, token: makeToken(newKey, movedUser.tv || 0), username: movedUser.username, avatar: movedUser.avatar || null });
      return;
    }

    if (action === 'changePassword') {
      const session = await sessionUser(token);
      if (!session) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (!currentPassword || !newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: m('أدخل كلمة المرور الحالية وكلمة مرور جديدة (' + MIN_PASSWORD_LENGTH + ' أحرف على الأقل)', 'Enter your current password and a new password (at least ' + MIN_PASSWORD_LENGTH + ' characters)') });
        return;
      }
      const { key: u, user } = session;
      if (!verifyPassword(currentPassword, user.salt, user.hash)) {
        res.status(401).json({ error: m('كلمة المرور الحالية غير صحيحة', 'Current password is incorrect') });
        return;
      }
      const { salt, hash } = hashPassword(newPassword);
      user.salt = salt;
      user.hash = hash;
      user.tv = (user.tv || 0) + 1;
      await putUser(u, user);
      // Older tokens (e.g. on another device) stop working; this session gets a fresh one.
      res.status(200).json({ ok: true, token: makeToken(u, user.tv) });
      return;
    }

    if (action === 'setAvatar') {
      const session = await sessionUser(token);
      if (!session) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (!avatarDataUrl || typeof avatarDataUrl !== 'string' || avatarDataUrl.length > 300000) {
        res.status(400).json({ error: m('الصورة غير صالحة أو كبيرة جدًا', 'Image is invalid or too large') });
        return;
      }
      const { key: u, user } = session;
      user.avatar = avatarDataUrl;
      await putUser(u, user);
      res.status(200).json({ ok: true, avatar: avatarDataUrl });
      return;
    }

    if (action === 'reset') {
      if (!username || !recoveryCode || !newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: m('أدخل اسم المستخدم ورمز الاسترجاع وكلمة مرور جديدة (' + MIN_PASSWORD_LENGTH + ' أحرف على الأقل)', 'Enter your username, recovery code, and a new password (at least ' + MIN_PASSWORD_LENGTH + ' characters)') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const guard = await readGuard(key);
      if (guard.lockedUntil) {
        res.status(429).json({ error: lockedMsg(guard) });
        return;
      }
      const user = await getUser(key);
      if (!user || user.deleted || !user.recoveryHash || !verifyPassword(String(recoveryCode).trim().toUpperCase(), user.recoverySalt, user.recoveryHash)) {
        await recordFailure(key, guard);
        res.status(401).json({ error: m('اسم المستخدم أو رمز الاسترجاع غير صحيح', 'Incorrect username or recovery code') });
        return;
      }
      const { salt, hash } = hashPassword(newPassword);
      const newRec = genRecoveryCode();
      const rec = hashPassword(newRec);
      user.salt = salt;
      user.hash = hash;
      user.recoverySalt = rec.salt;
      user.recoveryHash = rec.hash;
      user.tv = (user.tv || 0) + 1;
      await putUser(key, user);
      await clearFailures(key, guard);
      res.status(200).json({ ok: true, token: makeToken(key, user.tv), username: user.username, recoveryCode: newRec, avatar: user.avatar || null });
      return;
    }

    if (action === 'login') {
      if (!username || !password) {
        res.status(400).json({ error: m('أدخل اسم المستخدم وكلمة المرور', 'Enter your username and password') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const guard = await readGuard(key);
      if (guard.lockedUntil) {
        res.status(429).json({ error: lockedMsg(guard) });
        return;
      }
      const user = await getUser(key);
      if (!user || user.deleted || !verifyPassword(password, user.salt, user.hash)) {
        await recordFailure(key, guard);
        res.status(401).json({ error: m('اسم المستخدم أو كلمة المرور غير صحيحة', 'Incorrect username or password') });
        return;
      }
      await clearFailures(key, guard);
      res.status(200).json({ ok: true, token: makeToken(key, user.tv || 0), username: user.username, avatar: user.avatar || null });
      return;
    }

    if (action === 'verify') {
      const session = verifyToken(token);
      if (!session) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      // Trust a validly-signed, unexpired token even if the user record lookup
      // is momentarily unavailable (e.g. right after signup) — avoids forcing a
      // fresh login due to brief storage propagation delay.
      const user = await getUser(session.u);
      if (user && (user.deleted || (user.tv || 0) !== session.tv)) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      res.status(200).json({ ok: true, username: user ? user.username : session.u, avatar: user ? (user.avatar || null) : null });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'Auth error: ' + (e && e.message ? e.message : String(e)) });
  }
};
