const crypto = require('crypto');
const { getUser, putUser, makeToken } = require('./auth.js');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// تنظيف رابط الموقع تلقائياً لمنع وجود شرطة مائلة زائدة //
const rawSiteUrl = process.env.SITE_URL || 'https://omran-ai-builder.vercel.app';
const SITE_URL = rawSiteUrl.replace(/\/+$/, '');
const REDIRECT_URI = `${SITE_URL}/api/auth-google-callback`;

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
    res.writeHead(302, { Location: SITE_URL + '/?gerror=' + encodeURIComponent(reason) });
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

    // 1) Exchange the authorization code for tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[Google OAuth Exchange Error]:', JSON.stringify(tokenData));
      failRedirect('token_exchange_failed');
      return;
    }

    // 2) Fetch the user's Google profile (email, name, picture).
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      failRedirect('profile_fetch_failed');
      return;
    }

    const email = String(profile.email).trim().toLowerCase();
    let key = 'g_' + email;

    try {
      const { kvGetJSON } = require('./kv.js');
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

    let user = await getUser(key);

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
    res.writeHead(302, { Location: SITE_URL + '/?' + params.toString() });
    res.end();
  } catch (e) {
    failRedirect('server_error');
  }
};
