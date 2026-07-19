// Stores/removes the browser's Web Push subscription for a logged-in user,
// so /api/check-reminders can wake them up with a real system notification
// even when the app/tab is closed. One JSON blob per user (db/push-subs/{username}.json).
const crypto = require('crypto');

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

function subPath(username) {
  return 'db/push-subs/' + encodeURIComponent(username) + '.json';
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

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const username = verifyToken(token);
  if (!username) { res.status(401).json({ error: 'auth' }); return; }

  if (req.method === 'POST') {
    const subscription = (req.body && req.body.subscription) || null;
    if (!subscription || !subscription.endpoint) { res.status(400).json({ error: 'missing subscription' }); return; }
    await fetch(BLOB_BASE + '/' + subPath(username), {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + BLOB_TOKEN,
        'x-content-type': 'application/json',
        'x-add-random-suffix': '0',
      },
      body: JSON.stringify(subscription),
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await fetch(BLOB_BASE + '/' + subPath(username), {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + BLOB_TOKEN,
        'x-content-type': 'application/json',
        'x-add-random-suffix': '0',
      },
      body: JSON.stringify(null),
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};

module.exports.subPath = subPath;
module.exports.PUBLIC_BASE = PUBLIC_BASE;
