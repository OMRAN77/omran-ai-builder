// Vercel Serverless Function: full signup/login account system.
// Each user is stored as its OWN blob file (db/users/{username}.json) in Vercel Blob
// storage. This avoids any read-modify-write race across concurrent signups/logins
// that a single shared JSON file would have (lost updates when two requests land
// close together). Passwords are NEVER stored in plain text — scrypt hash + random
// salt per user. Sessions are signed tokens (HMAC-SHA256) — no plaintext secrets
// ever reach the client.
const crypto = require('crypto');

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

function userPath(key) {
  // key must already be the normalized (lowercased, trimmed) username.
  return 'db/users/' + encodeURIComponent(key) + '.json';
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

function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getUserOnce(key) {
  try {
    const res = await fetch(PUBLIC_BASE + userPath(key) + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Vercel Blob's public read URL is eventually consistent — a blob written a
// moment ago (e.g. right after signup/reset) can briefly 404 on read. Retry a
// few times with short backoff to smooth over that window before giving up.
async function getUser(key, attempts) {
  attempts = attempts || 4;
  for (let i = 0; i < attempts; i++) {
    const user = await getUserOnce(key);
    if (user) return user;
    if (i < attempts - 1) await sleep(300 * (i + 1));
  }
  return null;
}

async function putUser(key, user) {
  await fetch(BLOB_BASE + '/' + userPath(key), {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + BLOB_TOKEN,
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-cache-control-max-age': '0',
    },
    body: JSON.stringify(user),
  });
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SITE_URL = process.env.SITE_URL || 'https://omran-ai-builder.vercel.app';

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function sendResetEmail(toEmail, username, resetToken, isEn) {
  if (!RESEND_API_KEY) return false;
  const link = SITE_URL + '/?resetToken=' + encodeURIComponent(resetToken) + '&ru=' + encodeURIComponent(username);
  const subject = isEn ? 'Reset your password — Omran AI Builder' : 'إعادة تعيين كلمة المرور — Omran AI Builder';
  const html = isEn
    ? `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Reset your password</h2>
        <p>Hi ${username}, click the button below to set a new password. This link expires in 30 minutes.</p>
        <p><a href="${link}" style="background:#00c896;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Reset Password</a></p>
        <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
       </div>`
    : `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>إعادة تعيين كلمة المرور</h2>
        <p>مرحبًا ${username}، اضغط الزر بالأسفل لتعيين كلمة مرور جديدة. الرابط صالح لمدة 30 دقيقة.</p>
        <p><a href="${link}" style="background:#00c896;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">إعادة تعيين كلمة المرور</a></p>
        <p style="color:#888;font-size:13px">إذا لم تطلب هذا، تجاهل هذا الإيميل.</p>
       </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Omran AI Builder <onboarding@resend.dev>', to: [toEmail], subject, html }),
    });
    return r.ok;
  } catch (e) {
    return false;
  }
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

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { action, username, password, token, recoveryCode, newPassword, newUsername, currentPassword, avatarDataUrl, lang, ref, email, resetToken } = body;
    const isEn = lang === 'en';
    // Small helper to return the message matching the caller's UI language
    // (client always sends its current language along with every request).
    const m = (ar, en) => (isEn ? en : ar);

    if (action === 'signup') {
      if (!username || !password || String(username).length < 3 || String(password).length < 4) {
        res.status(400).json({ error: m('اسم المستخدم يجب أن يكون 3 أحرف على الأقل وكلمة المرور 4 أحرف على الأقل', 'Username must be at least 3 characters and password at least 4 characters') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const existing = await getUser(key);
      if (existing && !existing.deleted) {
        res.status(409).json({ error: m('اسم المستخدم مستخدم من قبل', 'Username already taken') });
        return;
      }
      if (email && !isValidEmail(email)) {
        res.status(400).json({ error: m('صيغة الإيميل غير صحيحة', 'Invalid email format') });
        return;
      }
      const { salt, hash } = hashPassword(password);
      const recCode = genRecoveryCode();
      const rec = hashPassword(recCode);
      const user = {
        username: String(username).trim(), salt, hash,
        recoverySalt: rec.salt, recoveryHash: rec.hash,
        email: email ? String(email).trim().toLowerCase() : null,
        avatar: null,
        createdAt: Date.now(),
      };
      await putUser(key, user);
      res.status(200).json({ ok: true, token: makeToken(key), username: user.username, recoveryCode: recCode, avatar: null });
      return;
    }

    if (action === 'changeUsername') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (!newUsername || String(newUsername).trim().length < 3) {
        res.status(400).json({ error: m('اسم المستخدم يجب أن يكون 3 أحرف على الأقل', 'Username must be at least 3 characters') });
        return;
      }
      const oldKey = u;
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
      const user = await getUser(oldKey);
      if (!user) {
        res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account') });
        return;
      }
      const movedUser = Object.assign({}, user, { username: String(newUsername).trim() });
      await putUser(newKey, movedUser);
      // Free up the old key so it can't be logged into or re-claimed while pointing here.
      await putUser(oldKey, { deleted: true, movedTo: newKey });
      res.status(200).json({ ok: true, token: makeToken(newKey), username: movedUser.username, avatar: movedUser.avatar || null });
      return;
    }

    if (action === 'changePassword') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (!currentPassword || !newPassword || String(newPassword).length < 4) {
        res.status(400).json({ error: m('أدخل كلمة المرور الحالية وكلمة مرور جديدة (4 أحرف على الأقل)', 'Enter your current password and a new password (at least 4 characters)') });
        return;
      }
      const user = await getUser(u);
      if (!user || user.deleted || !verifyPassword(currentPassword, user.salt, user.hash)) {
        res.status(401).json({ error: m('كلمة المرور الحالية غير صحيحة', 'Current password is incorrect') });
        return;
      }
      const { salt, hash } = hashPassword(newPassword);
      user.salt = salt;
      user.hash = hash;
      await putUser(u, user);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'setAvatar') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (!avatarDataUrl || typeof avatarDataUrl !== 'string' || avatarDataUrl.length > 300000) {
        res.status(400).json({ error: m('الصورة غير صالحة أو كبيرة جدًا', 'Image is invalid or too large') });
        return;
      }
      const user = await getUser(u);
      if (!user || user.deleted) {
        res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account') });
        return;
      }
      user.avatar = avatarDataUrl;
      await putUser(u, user);
      res.status(200).json({ ok: true, avatar: avatarDataUrl });
      return;
    }

    if (action === 'reset') {
      if (!username || !recoveryCode || !newPassword || String(newPassword).length < 4) {
        res.status(400).json({ error: m('أدخل اسم المستخدم ورمز الاسترجاع وكلمة مرور جديدة (4 أحرف على الأقل)', 'Enter your username, recovery code, and a new password (at least 4 characters)') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const user = await getUser(key);
      if (!user || user.deleted || !user.recoveryHash || !verifyPassword(String(recoveryCode).trim().toUpperCase(), user.recoverySalt, user.recoveryHash)) {
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
      await putUser(key, user);
      res.status(200).json({ ok: true, token: makeToken(key), username: user.username, recoveryCode: newRec, avatar: user.avatar || null });
      return;
    }

    if (action === 'getProfile') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      const user = await getUser(u);
      if (!user || user.deleted) {
        res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account') });
        return;
      }
      res.status(200).json({ ok: true, email: user.email || null });
      return;
    }

    if (action === 'setEmail') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (!email || !isValidEmail(email)) {
        res.status(400).json({ error: m('صيغة الإيميل غير صحيحة', 'Invalid email format') });
        return;
      }
      const user = await getUser(u);
      if (!user || user.deleted) {
        res.status(404).json({ error: m('تعذر العثور على الحساب', 'Could not find the account') });
        return;
      }
      user.email = String(email).trim().toLowerCase();
      await putUser(u, user);
      res.status(200).json({ ok: true, email: user.email });
      return;
    }

    if (action === 'forgotPassword') {
      if (!username) {
        res.status(400).json({ error: m('أدخل اسم المستخدم', 'Enter your username') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const user = await getUser(key);
      if (!user || user.deleted) {
        res.status(404).json({ error: m('اسم المستخدم غير موجود', 'Username not found') });
        return;
      }
      if (!user.email) {
        res.status(400).json({ error: m('لا يوجد إيميل مسجل لهذا الحساب، استخدم رمز الاسترجاع بدلًا من ذلك', 'No email is registered for this account — use your recovery code instead') });
        return;
      }
      const rt = crypto.randomBytes(24).toString('hex');
      const rtHash = crypto.createHash('sha256').update(rt).digest('hex');
      user.resetTokenHash = rtHash;
      user.resetTokenExpiry = Date.now() + 1000 * 60 * 30; // 30 minutes
      await putUser(key, user);
      const sent = await sendResetEmail(user.email, user.username, rt, isEn);
      if (!sent) {
        res.status(500).json({ error: m('تعذر إرسال الإيميل، حاول لاحقًا', 'Could not send the email, try again later') });
        return;
      }
      const masked = user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2');
      res.status(200).json({ ok: true, message: m('تم إرسال رابط إعادة التعيين إلى ' + masked, 'A reset link was sent to ' + masked) });
      return;
    }

    if (action === 'resetWithToken') {
      if (!username || !resetToken || !newPassword || String(newPassword).length < 4) {
        res.status(400).json({ error: m('رابط غير صالح أو كلمة مرور قصيرة (4 أحرف على الأقل)', 'Invalid link or password too short (at least 4 characters)') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const user = await getUser(key);
      const rtHash = crypto.createHash('sha256').update(String(resetToken)).digest('hex');
      if (!user || user.deleted || !user.resetTokenHash || user.resetTokenHash !== rtHash || !user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
        res.status(401).json({ error: m('الرابط غير صالح أو منتهي الصلاحية، اطلب رابطًا جديدًا', 'The link is invalid or expired, request a new one') });
        return;
      }
      const { salt, hash } = hashPassword(newPassword);
      user.salt = salt;
      user.hash = hash;
      user.resetTokenHash = null;
      user.resetTokenExpiry = null;
      await putUser(key, user);
      res.status(200).json({ ok: true, token: makeToken(key), username: user.username, avatar: user.avatar || null });
      return;
    }

    if (action === 'login') {
      if (!username || !password) {
        res.status(400).json({ error: m('أدخل اسم المستخدم وكلمة المرور', 'Enter your username and password') });
        return;
      }
      const key = String(username).trim().toLowerCase();
      const user = await getUser(key);
      // Brute-force protection: lock the account for 15 minutes after 6
      // consecutive failed attempts. Lockout resets on any successful login.
      const LOCK_AFTER = 6;
      const LOCK_MS = 15 * 60 * 1000;
      if (user && user.lockUntil && user.lockUntil > Date.now()) {
        const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
        res.status(429).json({ error: m('محاولات كثيرة فاشلة. حاول بعد ' + mins + ' دقيقة', 'Too many failed attempts. Try again in ' + mins + ' min') });
        return;
      }
      if (!user || user.deleted || !verifyPassword(password, user.salt, user.hash)) {
        if (user && !user.deleted) {
          const fails = (user.failedLoginCount || 0) + 1;
          const updated = Object.assign({}, user, {
            failedLoginCount: fails,
            lockUntil: fails >= LOCK_AFTER ? Date.now() + LOCK_MS : (user.lockUntil || null),
          });
          try { await putUser(key, updated); } catch (e) { /* best-effort */ }
        }
        res.status(401).json({ error: m('اسم المستخدم أو كلمة المرور غير صحيحة', 'Incorrect username or password') });
        return;
      }
      if (user.banned) {
        res.status(403).json({ error: m('تم إيقاف هذا الحساب من قبل الإدارة', 'This account has been suspended by admin'), banned: true });
        return;
      }
      if (user.failedLoginCount || user.lockUntil) {
        try { await putUser(key, Object.assign({}, user, { failedLoginCount: 0, lockUntil: null })); } catch (e) { /* best-effort */ }
      }
      res.status(200).json({ ok: true, token: makeToken(key), username: user.username, avatar: user.avatar || null });
      return;
    }

    if (action === 'verify') {
      const u = verifyToken(token);
      if (!u) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      // Trust a validly-signed, unexpired token even if the user record lookup
      // is momentarily unavailable (e.g. right after signup) — avoids forcing a
      // fresh login due to brief storage propagation delay.
      const user = await getUser(u);
      if (user && user.deleted) {
        res.status(401).json({ error: m('الجلسة منتهية، سجل الدخول من جديد', 'Session expired, please log in again') });
        return;
      }
      if (user && user.banned) {
        res.status(403).json({ error: m('تم إيقاف هذا الحساب من قبل الإدارة', 'This account has been suspended by admin'), banned: true });
        return;
      }
      let adminMessage = null;
      if (user && user.pendingMessage) {
        adminMessage = user.pendingMessage;
        // Deliver once, then clear so it doesn't repeat on the next verify.
        try {
          const updated = Object.assign({}, user, { pendingMessage: null });
          await putUser(u, updated);
        } catch (e) { /* best-effort; ignore */ }
      }
      res.status(200).json({ ok: true, username: user ? user.username : u, avatar: user ? (user.avatar || null) : null, adminMessage });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'Auth error: ' + (e && e.message ? e.message : String(e)) });
  }
};

module.exports.getUser = getUser;
module.exports.putUser = putUser;
module.exports.hashPassword = hashPassword;
module.exports.genRecoveryCode = genRecoveryCode;
module.exports.makeToken = makeToken;
