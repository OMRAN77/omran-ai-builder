// Vercel Serverless Function: public project sharing + "Explore" feed.
// Each shared project is stored as its own Redis record (db/shares/{id}.json).
// Public shares also get a tiny index record (db/explore/{createdAt}_{id}.json) so
// the Explore page can list recent public apps without scanning every share.
const crypto = require('crypto');
const { kvPutJSON, kvGetJSON, kvDel, kvList } = require('./kv.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

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
  await kvPutJSON(path, obj);
}

async function deleteBlobs(paths) {
  try {
    await Promise.all(paths.map((p) => kvDel(p)));
  } catch (e) {
    // best-effort; ignore
  }
}

async function getBlob(path) {
  try {
    return await kvGetJSON(path);
  } catch (e) {
    return null;
  }
}

async function listExplore(limit) {
  const keys = await kvList('db/explore/');
  const sorted = keys.slice().sort((a, b) => (a < b ? 1 : -1)); // newest first (timestamp-prefixed names)
  const top = sorted.slice(0, limit || 60);
  const items = await Promise.all(top.map((k) => getBlob(k)));
  return items.filter(Boolean);
}

// v-share-chat (طلب المالك: «مش ضروري فقط التطبيق — كل شي»): المشاركة تقبل
// المحادثة أيضًا — مشروع بلا كود يُشارك نصّ محادثته وتعرضه p.html كفقاعات.
const MAX_SHARE_MSGS = 300;
function cleanShareMessages(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const m of list.slice(-MAX_SHARE_MSGS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const txt = (typeof m.content === 'string') ? m.content.slice(0, 20000) : '';
    if (!txt.trim()) continue;
    out.push({ role: m.role, content: txt });
  }
  return out.length ? out : null;
}

// v423: إنشاء المشاركة صار دالّة واحدة يستدعيها المسار العام وأداة الوكيل معًا.
// نسختان من منطق تخزين واحد = عطبان يومًا ما، وتكرار المنطق أصل أعطاب هذا المستودع.
async function createShare(opts) {
  const o = opts || {};
  const code = (typeof o.code === 'string') ? o.code : '';
  const msgs = cleanShareMessages(o.messages);
  if (!code.trim() && !msgs) return { error: 'empty_project' };
  if (code.length > MAX_CODE_SIZE) return { error: 'code_too_large' };
  const id = crypto.randomBytes(6).toString('hex');
  const createdAt = Date.now();
  const safeTitle = (o.title || 'مشروع بدون اسم').toString().slice(0, 120);
  const safeUser = (o.username || 'زائر').toString().slice(0, 60);
  const rec = { id, title: safeTitle, code, username: safeUser, createdAt, public: !!o.isPublic };
  if (msgs) rec.messages = msgs;
  await putBlob(sharePath(id), rec);
  if (o.isPublic) await putBlob('db/explore/' + createdAt + '_' + id + '.json', { id, title: safeTitle, username: safeUser, createdAt });
  return { id, url: '/p.html?id=' + id };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL' });
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
      const { title, code, username, isPublic, messages } = body;
      // v-share-chat: الكود لم يعد شرطًا — تكفي محادثة؛ createShare يتحقق.
      const made = await createShare({ title, code, username, isPublic, messages });
      if (made.error) { res.status(made.error === 'code_too_large' ? 413 : 400).json({ error: made.error }); return; }
      res.status(200).json(made);
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
module.exports.createShare = createShare; // ليستدعيها وكيل عمران بلا نداء HTTP على نفسه
