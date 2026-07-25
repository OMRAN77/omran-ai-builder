// Vercel Serverless Function: OWNER-ONLY user management actions.
// Requires a valid session token belonging to OWNER_USERNAME. Regular users
// get 403 no matter what they send. Actions: ban, unban, delete, message.
const crypto = require('crypto');
const { getUser, putUser } = require('./auth.js');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();

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

// getUser/putUser now come from auth.js, which stores/reads user records
// encrypted at rest (AES-256-GCM) instead of as raw public-blob JSON.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!BLOB_TOKEN) { res.status(500).json({ error: 'Server is missing BLOB_READ_WRITE_TOKEN' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { token, action, targetUsername, text } = body;

    const requester = verifyToken(token);
    if (!requester || String(requester).trim().toLowerCase() !== OWNER_USERNAME) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (!targetUsername || typeof targetUsername !== 'string') {
      res.status(400).json({ error: 'missing targetUsername' });
      return;
    }
    const key = targetUsername.trim().toLowerCase();
    if (key === OWNER_USERNAME) {
      res.status(400).json({ error: 'cannot act on the owner account' });
      return;
    }

    const user = await getUser(key);
    if (!user) {
      res.status(404).json({ error: 'user not found' });
      return;
    }

    if (action === 'ban') {
      user.banned = true;
      await putUser(key, user);
      res.status(200).json({ ok: true, banned: true });
      return;
    }
    if (action === 'unban') {
      user.banned = false;
      await putUser(key, user);
      res.status(200).json({ ok: true, banned: false });
      return;
    }
    if (action === 'delete') {
      user.deleted = true;
      user.pendingMessage = null;
      await putUser(key, user);
      res.status(200).json({ ok: true, deleted: true });
      return;
    }
    if (action === 'message') {
      if (!text || !String(text).trim()) {
        res.status(400).json({ error: 'empty message' });
        return;
      }
      user.pendingMessage = { text: String(text).trim(), at: Date.now() };
      await putUser(key, user);
      res.status(200).json({ ok: true, sent: true });
      return;
    }

    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String(e && e.message || e) });
  }
};
