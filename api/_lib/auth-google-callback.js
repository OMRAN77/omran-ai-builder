const crypto = require('crypto');
const { getUser, putUser, makeToken } = require('./auth.js'); // داخل _lib

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// موضع واحد للعنوان القانونيّ يتشاركه هذا المعالِج ومعالِج البدء، فلا يمكن
// أن يفترق ما يرسله المتصفّح عمّا يرسله الخادم. (انظر _site.js)
const { siteUrl, googleRedirectUri } = require('./_site.js');

function randomPasswordHash() {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(crypto.randomBytes(32).toString('hex'), salt, 64).toString('hex');
  return { salt, hash };
}

function genRecoveryCode() {
  const bytes = crypto.randomBytes(10).toString('hex').toUpperCase();
  return bytes.match(/.{1,4}/g).join('-');
}

module.exports = async (req, res) => {
  const failRedirect = (reason) => {
    res.writeHead(302, { Location: siteUrl() + '/?gerror=' + encodeURIComponent(reason) });
    res.end();
  };

  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      failRedirect('google_not_configured');
      return;
    }
    const { code, error, state } = req.query || {};
    if (error) {
      failRedirect(String(error));
      return;
    }
    if (!code) {
      failRedirect('missing_code');
      return;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[Google OAuth]', tokenData && tokenData.error, tokenData && tokenData.error_description);
      failRedirect('token_exchange_failed');
      return;
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
      signal: AbortSignal.timeout(10000),
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      failRedirect('profile_fetch_failed');
      return;
    }

    if (profile.email_verified !== true) {
      failRedirect('email_not_verified');
      return;
    }

    const email = String(profile.email).trim().toLowerCase();
    let key = 'g_' + email;

    try {
      const { kvGetJSON } = require('./kv.js'); // داخل _lib
      const alias = await kvGetJSON('db/alias/' + key);
      if (alias && alias.primary) {
        key = String(alias.primary);
      } else if ((process.env.ALLOW_EMAIL_AUTOLINK || '').trim() === '1') {
        const idx = await kvGetJSON('db/email-index/' + email);
        if (idx && idx.username) {
          const candidate = await getUser(String(idx.username));
          if (candidate && !candidate.deleted && String(candidate.email || '').toLowerCase() === email) {
            key = String(idx.username);
          } else {
            console.warn('[auth] stale email-index entry ignored for ' + email);
          }
        }
      }
    } catch (e) {
      console.warn('[auth] account unification lookup failed:', e && e.message);
    }

    let user = null;
    try { user = await getUser(key); }
    catch (e) {
      if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') {
        // السجلّ القديم مقفل بسرّ ضاع — وجوجل أثبتت للتوّ ملكيّة البريد نفسه.
        // فالاسترداد هنا مشروع: يُنشأ السجلّ من جديد فوق المقفل، ويعود صاحب
        // البريد إلى حسابه بدل server_error أبديّة. (بخلاف signup بالاسم وحده،
        // حيث يبقى الرمي قائمًا: لا إثبات ملكيّة هناك، والكتابة فوقه استيلاء.)
        console.warn('[auth] sealed record reclaimed via verified Google email: ' + key);
        user = null;
      } else { throw e; }
    }

    if (!user || user.deleted) {
      const { salt, hash } = randomPasswordHash();
      const recCode = genRecoveryCode();
      const rec = randomPasswordHash();
      user = {
        username: profile.name || email.split('@')[0],
        salt, hash,
        recoverySalt: rec.salt, recoveryHash: rec.hash,
        email,
        avatar: profile.picture || null,
        googleAuth: true,
        createdAt: Date.now(),
      };
      await putUser(key, user);
    }

    const token = makeToken(key);
    const params = new URLSearchParams({
      gtoken: token,
      guser: user.username,
      gavatar: user.avatar || '',
      state: typeof state === 'string' ? state : '',
    });
    res.writeHead(302, { Location: siteUrl() + '/?' + params.toString() });
    res.end();
  } catch (e) {
    failRedirect('server_error');
  }
};
