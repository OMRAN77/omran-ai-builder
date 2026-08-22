// Vercel Serverless Function: full signup/login account system.
// Each user is stored as its OWN JSON record (db/users/{username}.json) in
// Upstash Redis. This avoids any read-modify-write race across concurrent
// signups/logins that a single shared JSON file would have (lost updates
// when two requests land close together). Passwords are NEVER stored in
// plain text — scrypt hash + random salt per user. Sessions are signed
// tokens (HMAC-SHA256) — no plaintext secrets ever reach the client.
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

function userPath(key) {
  // key must already be the normalized (lowercased, trimmed) username.
  return 'db/users/' + encodeURIComponent(key) + '.json';
}

// ---------------------------------------------------------------------------
// At-rest encryption for user records.
// db/users/{username}.json is stored in Redis, reachable by any server
// function that knows the key derivation — to keep the same defense in
// depth as before (in case of any future public-read exposure), every
// record is still encrypted with AES-256-GCM using a key derived from
// AUTH_SECRET before it's written, and decrypted on read. Legacy plaintext
// records (written before this change) are still readable for backward
// compatibility and get transparently re-encrypted the next time
// putUser() is called on them.
const ENC_KEY = crypto.createHash('sha256').update(AUTH_SECRET).digest(); // 32 bytes -> aes-256-gcm

function encryptUserBlob(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { enc: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') };
}

function decryptUserBlob(encObj) {
  const iv = Buffer.from(encObj.iv, 'base64');
  const tag = Buffer.from(encObj.tag, 'base64');
  const data = Buffer.from(encObj.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
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
    const parsed = await kvGetJSON(userPath(key));
    if (!parsed) return null;
    if (parsed && parsed.enc === 1) {
      try {
        return decryptUserBlob(parsed);
      } catch (e) {
        return null; // corrupt/undecryptable record - treat as missing
      }
    }
    // Legacy plaintext record (written before at-rest encryption was added).
    // Still readable for backward compatibility; putUser() below will
    // transparently re-encrypt it the next time it's saved.
    return parsed;
  } catch (e) {
    return null;
  }
}

// Redis reads are strongly consistent, but keep the retry loop (now a no-op
// in practice) so callers relying on getUser()'s multi-attempt signature
// keep working unchanged.
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
  await kvPutJSON(userPath(key), encryptUserBlob(user));
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

function genNumericOtp() {
  // crypto.randomInt is rejection-free and avoids modulo bias.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// ---------------------------------------------------------------------------
// Helper: send the OTP code by email via Resend.
// Add near sendResetEmail() — same fetch pattern, same failure handling
// (returns false instead of throwing so the caller can report a clean error).
// ---------------------------------------------------------------------------
async function sendOtpEmail(toEmail, otp, isEn) {
  if (!RESEND_API_KEY) return false;
  const subject = isEn ? 'Verification Code — Omran AI Builder' : 'رمز التحقق — Omran AI Builder';
  const html = isEn
    ? `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center">
        <h2 style="margin-bottom:4px">Your verification code</h2>
        <p style="color:#888;font-size:13px;margin-top:0">Enter this code to sign in. It expires in 5 minutes.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;background:#f4f4f5;color:#111;padding:18px 10px;border-radius:12px;margin:20px 0">${otp}</div>
        <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
       </div>`
    : `<div dir="rtl" style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center">
        <h2 style="margin-bottom:4px">رمز التحقق الخاص بك</h2>
        <p style="color:#888;font-size:13px;margin-top:0">أدخل هذا الرمز لتسجيل الدخول. صالح لمدة 5 دقائق.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;background:#f4f4f5;color:#111;padding:18px 10px;border-radius:12px;margin:20px 0">${otp}</div>
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

// ---------------------------------------------------------------------------

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
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL' });
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

    // Hardening: cap input lengths to block scrypt CPU-exhaustion and junk-data attacks.
    const tooLong = [username, newUsername].some(v => v && String(v).length > 64) ||
      [password, newPassword, currentPassword, recoveryCode].some(v => v && String(v).length > 128) ||
      (email && String(email).length > 254);
    if (tooLong) {
      res.status(400).json({ error: m('المدخلات طويلة جدًا', 'Input too long') });
      return;
    }

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
        // 🎁 هدية الترحيب: 70 نقطة عند التسجيل = فيديو واحد (60) + صورة واحدة (10).
        points: 70,
        welcomeGift: true,
      };
      await putUser(key, user);
      // v380: فهرس الإيميل → الدخول بجوجل بنفس الإيميل يفتح هذا الحساب نفسه
      // الفهرس يُكتب مرة واحدة فقط (أول من يدّعي البريد)، ولا يُستخدم للدخول
      // إلا بموافقة صريحة عبر ALLOW_EMAIL_AUTOLINK. الكتابة فوق مدخل قائم كانت
      // هي الخطوة التي تسمح بانتحال بريد شخص آخر.
      if (user.email) {
        try {
          const { kvGetJSON, kvPutJSON } = require('./kv.js');
          const existing = await kvGetJSON('db/email-index/' + user.email);
          if (!existing || !existing.username) {
            await kvPutJSON('db/email-index/' + user.email, { username: key, at: Date.now() });
          }
        } catch (e) { console.warn('[auth] email index write skipped:', e && e.message); }
      }
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
      const nextEmail = String(email).trim().toLowerCase();
      // بريد مرتبط بحساب آخر لا يُدّعى. هذا هو الباب الذي كان يسمح بالاستيلاء
      // على مدخل الفهرس ثم توجيه دخول جوجل الخاص بالضحية.
      try {
        const { kvGetJSON } = require('./kv.js');
        const claimed = await kvGetJSON('db/email-index/' + nextEmail);
        if (claimed && claimed.username && String(claimed.username) !== u) {
          res.status(409).json({
            error: m('هذا الإيميل مرتبط بحساب آخر.', 'This email is already linked to another account.'),
          });
          return;
        }
      } catch (e) { console.warn('[auth] email claim check failed:', e && e.message); }
      user.email = nextEmail;
      await putUser(u, user);
      try {
        const { kvGetJSON, kvPutJSON } = require('./kv.js');
        const existing = await kvGetJSON('db/email-index/' + nextEmail);
        if (!existing || !existing.username) await kvPutJSON('db/email-index/' + nextEmail, { username: u, at: Date.now() });
      } catch (e) { console.warn('[auth] email index write skipped:', e && e.message); }
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

    if (action === 'email-otp-request') {
      if (!email || !isValidEmail(email)) {
        res.status(400).json({ error: m('صيغة الإيميل غير صحيحة', 'Invalid email format') });
        return;
      }
      const key = String(email).trim().toLowerCase();

      // Rate limit: max 3 OTP requests per email per 5 minutes.
      const RATE_LIMIT = 3;
      const RATE_WINDOW_MS = 5 * 60 * 1000;
      const rateKey = 'db/otp-rate/' + key;
      const now = Date.now();
      let rate = null;
      try { rate = await kvGetJSON(rateKey); } catch (e) { rate = null; }
      if (rate && rate.windowStart && (now - rate.windowStart) < RATE_WINDOW_MS) {
        if ((rate.count || 0) >= RATE_LIMIT) {
          const mins = Math.ceil((rate.windowStart + RATE_WINDOW_MS - now) / 60000);
          res.status(429).json({ error: m('محاولات كثيرة، حاول بعد ' + mins + ' دقيقة', 'Too many attempts, try again in ' + mins + ' min') });
          return;
        }
        rate = { windowStart: rate.windowStart, count: (rate.count || 0) + 1 };
      } else {
        rate = { windowStart: now, count: 1 };
      }
      await kvPutJSON(rateKey, rate);

      const otpCode = genNumericOtp();
      await kvPutJSON('db/otp/' + key, { otp: otpCode, exp: now + 300000 });

      const sent = await sendOtpEmail(key, otpCode, isEn);
      if (!sent) {
        res.status(500).json({ error: m('تعذر إرسال الإيميل، حاول لاحقًا', 'Could not send the email, try again later') });
        return;
      }
      res.status(200).json({ ok: true, message: m('تم إرسال رمز التحقق', 'Verification code sent') });
      return;
    }

    if (action === 'email-otp-verify') {
      if (!email || !isValidEmail(email) || !otp) {
        res.status(400).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code') });
        return;
      }
      const key = String(email).trim().toLowerCase();
      let record = null;
      try { record = await kvGetJSON('db/otp/' + key); } catch (e) { record = null; }
      const submitted = String(otp).trim();
      if (!record || typeof record.otp !== 'string' || !record.exp || record.exp < Date.now()) {
        res.status(401).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code') });
        return;
      }
      // 6 numeric digits — a plain, constant-length string compare is fine here;
      // timingSafeEqual is used elsewhere only because those secrets vary in
      // encoded length. Both sides here are always padded to 6 bytes.
      const known = Buffer.from(record.otp);
      const given = Buffer.from(submitted.padEnd(known.length, '\0'));
      const matches = submitted.length === record.otp.length && given.length === known.length && crypto.timingSafeEqual(given, known);
      if (!matches) {
        res.status(401).json({ error: m('رمز غير صحيح أو منتهي', 'Invalid or expired code') });
        return;
      }
      // Invalidate immediately so the same code can't be replayed — there's no
      // del() in kv.js, so overwrite with an already-expired record.
      try { await kvPutJSON('db/otp/' + key, { otp: null, exp: 0 }); } catch (e) { /* best-effort */ }

      // Find an existing account linked to this email via the email index.
      let userKey = null;
      let user = null;
      try {
        const idx = await kvGetJSON('db/email-index/' + key);
        if (idx && idx.username) {
          const candidate = await getUser(idx.username);
          if (candidate && !candidate.deleted && candidate.email === key) {
            userKey = idx.username;
            user = candidate;
          }
        }
      } catch (e) { /* fall through to auto-create */ }

      let isNew = false;
      if (!user) {
        // Auto-create an account: random username derived from the email
        // prefix, an unusable random password (this account only ever logs in
        // via OTP), the email set, and the standard welcome gift.
        const prefix = key.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'user';
        let candidateKey = '';
        for (let i = 0; i < 8; i++) {
          const suffix = crypto.randomBytes(3).toString('hex');
          candidateKey = (prefix + '_' + suffix).slice(0, 40);
          const clash = await getUser(candidateKey);
          if (!clash || clash.deleted) break;
          candidateKey = '';
        }
        if (!candidateKey) candidateKey = 'user_' + crypto.randomBytes(6).toString('hex');
        const { salt, hash } = hashPassword(crypto.randomBytes(32).toString('hex'));
        const recCode = genRecoveryCode();
        const rec = hashPassword(recCode);
        user = {
          username: candidateKey, salt, hash,
          recoverySalt: rec.salt, recoveryHash: rec.hash,
          email: key,
          avatar: null,
          createdAt: Date.now(),
          points: 70,
          welcomeGift: true,
          otpOnly: true,
        };
        userKey = candidateKey;
        await putUser(userKey, user);
        try {
          const existingIdx = await kvGetJSON('db/email-index/' + key);
          if (!existingIdx || !existingIdx.username) {
            await kvPutJSON('db/email-index/' + key, { username: userKey, at: Date.now() });
          }
        } catch (e) { console.warn('[auth] email index write skipped:', e && e.message); }
        isNew = true;
      }

      if (user.banned) {
        res.status(403).json({ error: m('تم إيقاف هذا الحساب من قبل الإدارة', 'This account has been suspended by admin'), banned: true });
        return;
      }

      res.status(200).json({ ok: true, token: makeToken(userKey), username: user.username, avatar: user.avatar || null, isNew });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'Auth error: ' + (e && e.message ? e.message : String(e)) });
  }
};

module.exports.getUser = getUser;
module.exports.getUserOnce = getUserOnce;
module.exports.putUser = putUser;
module.exports.hashPassword = hashPassword;
module.exports.genRecoveryCode = genRecoveryCode;
module.exports.makeToken = makeToken;
module.exports.verifyToken = verifyToken;
module.exports.encryptUserBlob = encryptUserBlob;
module.exports.decryptUserBlob = decryptUserBlob;

// A ban set from the admin panel only ever guarded the *login* endpoint.
// Any session token minted before the ban stayed valid for its full 30 days,
// so a banned account kept spending the server's AI keys, points, minutes and
// video quota untouched. Every metered path now asks here first.
//
// Two deliberate choices:
//   * fails OPEN — a Redis hiccup must never lock out the whole user base;
//     a handful of banned accounts slipping through beats a total outage.
//   * 5s memo — one request can hit several gates (quota then points), and
//     re-reading the same record each time would double Redis traffic on the
//     hot path. A banned user waits at most 5 seconds longer.
const _banMemo = new Map();
async function isBanned(username) {
  if (!username) return false;
  const now = Date.now();
  const hit = _banMemo.get(username);
  if (hit && hit.exp > now) return hit.v;
  let v = false;
  try {
    // getUserOnce, NOT getUser: the latter retries 4x with a growing sleep
    // (~1.8s total) when a record is missing. That is fine on a login form and
    // ruinous on a path every single chat message walks through.
    const user = await getUserOnce(username);
    v = !!(user && user.banned);
  } catch (e) {
    v = false; // fail open — see note above
  }
  if (_banMemo.size > 500) _banMemo.clear();
  _banMemo.set(username, { v, exp: now + 5000 });
  return v;
}
module.exports.isBanned = isBanned;
