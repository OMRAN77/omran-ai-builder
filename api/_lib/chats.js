// v381: server-side MERGE — no device can overwrite another's data.
// chats_save merges incoming projects with existing server data by id (newest wins).
// chats_delete removes specific chat ids without touching others.
// chats_wipe explicitly clears all.
const crypto = require('crypto');
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;
const MAX_BYTES = 900 * 1024;

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

function chatsKey(username) {
  return 'chats:' + encodeURIComponent(String(username).trim().toLowerCase());
}

function deletedKey(username) {
  return 'chats_deleted:' + encodeURIComponent(String(username).trim().toLowerCase());
}

function slimProjects(projects) {
  if (!Array.isArray(projects)) return [];
  let list = projects
    .map((p) => ({
      id: p && p.id,
      title: (p && p.title) || '',
      provider: (p && p.provider) || '',
      messages: p && Array.isArray(p.messages) ? p.messages : [],
      code: p && typeof p.code === 'string' ? p.code : '',
      updatedAt: (p && p.updatedAt) || 0,
    }))
    .filter((p) => p.id);
  const size = (l) => {
    try { return Buffer.byteLength(JSON.stringify(l), 'utf8'); } catch (e) { return Infinity; }
  };
  let i = 0;
  while (size(list) > MAX_BYTES && i < list.length) {
    if (list[i].code) list[i] = Object.assign({}, list[i], { code: '' });
    i++;
  }
  while (size(list) > MAX_BYTES && list.length > 0) list.shift();
  return list;
}

// Merge incoming projects with existing server projects.
// For each id: keep whichever has more messages (= more recent activity).
// New ids from client get added; server-only ids stay unless in deleted set.
function mergeProjects(serverList, clientList, deletedSet) {
  const map = new Map();
  // Server projects first
  for (const p of serverList) {
    if (deletedSet.has(p.id)) continue;
    map.set(p.id, p);
  }
  // Client projects: keep if more messages or newer
  for (const p of clientList) {
    if (deletedSet.has(p.id)) continue;
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
    } else {
      // Keep whichever has more messages; if equal, keep client (fresher)
      const eMsgs = Array.isArray(existing.messages) ? existing.messages.length : 0;
      const cMsgs = Array.isArray(p.messages) ? p.messages.length : 0;
      if (cMsgs >= eMsgs) {
        map.set(p.id, p);
      }
    }
  }
  return Array.from(map.values());
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const action = (req.query && req.query.action) || (body && body.action) || '';
    const username = verifyToken(body && body.token);
    if (!username) { res.status(401).json({ error: 'invalid token' }); return; }

    if (action === 'chats_save') {
      const incoming = slimProjects(body.projects);
      // Get existing server data
      const rec = await kvGetJSON(chatsKey(username));
      const serverProjects = (rec && Array.isArray(rec.projects)) ? rec.projects : [];
      // Get deleted set
      const delRec = await kvGetJSON(deletedKey(username));
      const deletedSet = new Set((delRec && Array.isArray(delRec.ids)) ? delRec.ids : []);
      // Merge: server + client, respecting deletions
      const merged = slimProjects(mergeProjects(serverProjects, incoming, deletedSet));
      await kvPutJSON(chatsKey(username), { projects: merged, updatedAt: Date.now() });
      res.status(200).json({ ok: true, count: merged.length, merged: true });
      return;
    }

    if (action === 'chats_delete') {
      // Delete specific chat ids — add to tombstone set + remove from projects
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      if (ids.length === 0) { res.status(400).json({ error: 'no ids' }); return; }
      // Add to deleted set (keep last 500 tombstones)
      const delRec = await kvGetJSON(deletedKey(username));
      const deletedIds = (delRec && Array.isArray(delRec.ids)) ? delRec.ids : [];
      const newDeleted = Array.from(new Set([...deletedIds, ...ids])).slice(-500);
      await kvPutJSON(deletedKey(username), { ids: newDeleted, updatedAt: Date.now() });
      // Remove from projects
      const rec = await kvGetJSON(chatsKey(username));
      if (rec && Array.isArray(rec.projects)) {
        const filtered = rec.projects.filter(p => !ids.includes(p.id));
        await kvPutJSON(chatsKey(username), { projects: filtered, updatedAt: Date.now() });
      }
      res.status(200).json({ ok: true, deleted: ids.length });
      return;
    }

    if (action === 'chats_wipe') {
      await kvPutJSON(chatsKey(username), { projects: [], updatedAt: Date.now(), wiped: true });
      // Clear tombstones too
      await kvPutJSON(deletedKey(username), { ids: [], updatedAt: Date.now() });
      res.status(200).json({ ok: true, wiped: true });
      return;
    }

    if (action === 'chats_load') {
      const rec = await kvGetJSON(chatsKey(username));
      const delRec = await kvGetJSON(deletedKey(username));
      const deletedIds = (delRec && Array.isArray(delRec.ids)) ? delRec.ids : [];
      const deletedSet = new Set(deletedIds);
      let projects = (rec && Array.isArray(rec.projects)) ? rec.projects : [];
      // Filter out deleted
      projects = projects.filter(p => !deletedSet.has(p.id));
      res.status(200).json({ ok: true, projects, deletedIds });
      return;
    }

    res.status(400).json({ error: 'unknown chats action: ' + action });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || 'chats error' });
  }
};
