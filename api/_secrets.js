// Server-side secret handling shared by the auth, quota and storage helpers.
// AUTH_SECRET must be set in the deployment (at least 32 characters). Without it,
// everything that signs, verifies or derives a key fails closed instead of
// falling back to a value that is published in this repository.
const crypto = require('crypto');

const MIN_SECRET_LENGTH = 32;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function getAuthSecret() {
  const s = process.env.AUTH_SECRET;
  return typeof s === 'string' && s.length >= MIN_SECRET_LENGTH ? s : null;
}

// Separate 32-byte keys per purpose, so the token-signing secret is never used
// directly as an encryption or path key.
function deriveKey(purpose) {
  const secret = getAuthSecret();
  if (!secret) return null;
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.alloc(0), 'taryam:' + purpose, 32));
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

// tv = token version kept on the user record; bumping it revokes older tokens.
function makeToken(username, tv) {
  const secret = getAuthSecret();
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  const payload = Buffer.from(JSON.stringify({ u: username, tv: tv || 0, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return payload + '.' + sign(payload, secret);
}

// Returns { u, tv } for a validly signed, unexpired token, otherwise null.
// Tokens issued before tv existed verify with tv = 0.
function verifyToken(token) {
  const secret = getAuthSecret();
  if (!secret) return null;
  try {
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(payload, secret));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.u !== 'string' || !(data.exp > Date.now())) return null;
    return { u: data.u, tv: data.tv || 0 };
  } catch (e) {
    return null;
  }
}

module.exports = { getAuthSecret, deriveKey, makeToken, verifyToken, MIN_SECRET_LENGTH };
