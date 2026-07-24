// Vercel Serverless Function: handles the redirect Google sends back after a
// user approves Gmail access for the "AI Email Assistant" feature. Separate
// from the login OAuth (auth-google-callback.js) — this one requests Gmail
// scopes (read + send) and stores an encrypted refresh token on the user.
const { getUser, putUser, verifyToken } = require('./auth.js');
const { encrypt } = require('./_emailCrypto.js');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SITE_URL = process.env.SITE_URL || 'https://omran-ai-builder.vercel.app';
const REDIRECT_URI = SITE_URL + '/api/email-callback';

module.exports = async (req, res) => {
  const fail = (reason) => {
    res.writeHead(302, { Location: SITE_URL + '/?emailerror=' + encodeURIComponent(reason) });
    res.end();
  };
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return fail('google_not_configured');
    const { code, state, error } = req.query || {};
    if (error) return fail(String(error));
    if (!code || !state) return fail('missing_params');
    const username = verifyToken(state);
    if (!username) return fail('session_expired');

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
    if (!tokenRes.ok) return fail(tokenData.error || 'token_exchange_failed');
    if (!tokenData.refresh_token) return fail('no_refresh_token_reconnect');

    const profRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const prof = await profRes.json();

    const user = await getUser(username);
    if (!user) return fail('user_not_found');
    user.emailAssist = {
      connected: true,
      gmailAddress: prof.emailAddress || null,
      refreshTokenEnc: encrypt(tokenData.refresh_token),
      ignoreList: (user.emailAssist && user.emailAssist.ignoreList) || [],
      connectedAt: Date.now(),
    };
    await putUser(username, user);
    res.writeHead(302, { Location: SITE_URL + '/?emailconnected=1' });
    res.end();
  } catch (e) {
    fail('server_error');
  }
};
