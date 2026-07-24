// Small helper: encrypts/decrypts Gmail refresh tokens before they are stored
// in the (publicly-URL-readable) per-user blob file. Never store raw OAuth
// tokens — this AES-256-GCM wrapping keeps them useless without AUTH_SECRET.
const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const KEY = crypto.createHash('sha256').update(SECRET).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('base64') + '.' + enc.toString('base64') + '.' + tag.toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  try {
    const [ivB64, encB64, tagB64] = String(payload).split('.');
    const iv = Buffer.from(ivB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
