// Vercel Serverless Function: polls a MiniMax (Hailuo) video task and, once it
// succeeds, resolves the temporary download URL. Normalizes MiniMax's shape to
// the same {status, output:[url]} the client already handles for Runway, so the
// client's poll loop stays uniform. Uses MINIMAX_API_KEY (and optional
// MINIMAX_GROUP_ID, required by the files/retrieve endpoint on some accounts).
const MM_BASE = (process.env.MINIMAX_API_BASE || 'https://api.minimax.io').replace(/\/+$/, '');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const taskId = req.query && (req.query.task_id || req.query.id);
    if (!taskId) { res.status(400).json({ error: 'Missing task_id' }); return; }
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'Server is missing MINIMAX_API_KEY' }); return; }
    const auth = { 'Authorization': 'Bearer ' + apiKey };
    const groupId = process.env.MINIMAX_GROUP_ID || '';

    const q = await fetch(MM_BASE + '/v1/query/video_generation?task_id=' + encodeURIComponent(taskId), { headers: auth });
    const qd = await q.json().catch(() => ({}));
    if (!q.ok) { res.status(q.status).json({ error: 'MiniMax error: ' + JSON.stringify(qd).slice(0, 400) }); return; }

    const raw = String(qd.status || '').toLowerCase();
    if (raw === 'fail' || raw === 'failed') { res.status(200).json({ status: 'FAILED' }); return; }
    if (raw !== 'success' && raw !== 'succeeded') {
      // Preparing / Queueing / Processing — لسّا شغّال.
      res.status(200).json({ status: 'RUNNING' });
      return;
    }

    const fileId = qd.file_id;
    if (!fileId) { res.status(200).json({ status: 'RUNNING' }); return; }
    let retrieveUrl = MM_BASE + '/v1/files/retrieve?file_id=' + encodeURIComponent(fileId);
    if (groupId) retrieveUrl += '&GroupId=' + encodeURIComponent(groupId);
    const f = await fetch(retrieveUrl, { headers: auth });
    const fd = await f.json().catch(() => ({}));
    const url = fd && fd.file && (fd.file.download_url || fd.file.backup_download_url);
    if (!f.ok || !url) { res.status(f.ok ? 502 : f.status).json({ error: 'MiniMax file retrieve failed: ' + JSON.stringify(fd).slice(0, 300) }); return; }

    res.status(200).json({ status: 'SUCCEEDED', output: [url] });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
