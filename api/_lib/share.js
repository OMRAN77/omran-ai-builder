// Vercel Serverless Function: public project sharing + "Explore" feed.
// Each shared project is stored as its own blob (db/shares/{id}.json). Public
// shares also get a tiny index blob (db/explore/{createdAt}_{id}.json) so the
// Explore page can list recent public apps without scanning every share.
const crypto = require('crypto');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE = 'https://blob.vercel-storage.com';
const STORE_ID = process.env.BLOB_STORE_ID || '6tfgxvttzyoiavtu';
const PUBLIC_BASE = 'https://' + STORE_ID + '.public.blob.vercel-storage.com/';

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

const MAX_CODE_SIZE = 2 * 1024 * 1024; // 2MB safety cap per shared project

function sharePath(id) {
  return 'db/shares/' + encodeURIComponent(id) + '.json';
}

async function putBlob(path, obj) {
  await fetch(BLOB_BASE + '/' + path, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + BLOB_TOKEN,
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-cache-control-max-age': '0',
    },
    body: JSON.stringify(obj),
  });
}

async function deleteBlobs(paths) {
  const urls = paths.map((p) => PUBLIC_BASE + p);
  try {
    await fetch(BLOB_BASE + '/delete', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + BLOB_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls }),
    });
  } catch (e) {
    // best-effort; ignore
  }
}

async function getBlob(path) {
  try {
    const r = await fetch(PUBLIC_BASE + path + '?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function listExplore(limit) {
  const url = new URL(BLOB_BASE + '/');
  url.searchParams.set('prefix', 'db/explore/');
  url.searchParams.set('limit', '1000');
  const r = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + BLOB_TOKEN } });
  if (!r.ok) return [];
  const data = await r.json();
  const blobs = (data.blobs || []).sort((a, b) => (a.pathname < b.pathname ? 1 : -1)); // newest first (timestamp-prefixed names)
  const top = blobs.slice(0, limit || 60);
  const items = await Promise.all(
    top.map(async (b) => {
      try {
        const rr = await fetch(b.url, { cache: 'no-store' });
        if (!rr.ok) return null;
        return await rr.json();
      } catch (e) {
        return null;
      }
    })
  );
  return items.filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!BLOB_TOKEN) {
    res.status(500).json({ error: 'Server is missing BLOB_READ_WRITE_TOKEN' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const { id, explore } = req.query || {};
      if (explore) {
        const items = await listExplore(60);
        res.status(200).json({ items });
        return;
      }
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const share = await getBlob(sharePath(id));
      if (!share) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json(share);
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
      const { title, code, username, isPublic } = body;
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: 'Missing code' });
        return;
      }
      if (code.length > MAX_CODE_SIZE) {
        res.status(413).json({ error: 'code_too_large' });
        return;
      }
      const id = crypto.randomBytes(6).toString('hex');
      const createdAt = Date.now();
      const safeTitle = (title || 'مشروع بدون اسم').toString().slice(0, 120);
      const safeUser = (username || 'زائر').toString().slice(0, 60);
      const share = { id, title: safeTitle, code, username: safeUser, createdAt, public: !!isPublic };

      await putBlob(sharePath(id), share);

      if (isPublic) {
        const indexEntry = { id, title: safeTitle, username: safeUser, createdAt };
        await putBlob('db/explore/' + createdAt + '_' + id + '.json', indexEntry);
      }

      res.status(200).json({ id, url: '/p.html?id=' + id });
      return;
    }

    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const username = verifyToken(token);
      if (!username) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const share = await getBlob(sharePath(id));
      if (!share) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      if (share.username !== username) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const pathsToDelete = [sharePath(id)];
      if (share.public) {
        pathsToDelete.push('db/explore/' + share.createdAt + '_' + id + '.json');
      }
      await deleteBlobs(pathsToDelete);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
};
