// Vercel Serverless Function: lets the user tell the AI Email Assistant to
// stop showing emails from a given sender (or pattern) in future scans.
const { getUser, putUser, verifyToken } = require('./auth.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { token, pattern } = body;
    const username = verifyToken(token);
    if (!username) { res.status(401).json({ error: 'الجلسة منتهية، سجل الدخول من جديد' }); return; }
    if (!pattern || !String(pattern).trim()) { res.status(400).json({ error: 'حدد النمط المطلوب تجاهله' }); return; }

    const user = await getUser(username);
    if (!user || !user.emailAssist) { res.status(400).json({ error: 'لم يتم ربط Gmail بعد', notConnected: true }); return; }
    const p = String(pattern).trim().toLowerCase();
    const list = user.emailAssist.ignoreList || [];
    if (!list.includes(p)) list.push(p);
    user.emailAssist.ignoreList = list;
    await putUser(username, user);
    res.status(200).json({ ok: true, ignoreList: list });
  } catch (e) {
    res.status(500).json({ error: 'Email ignore error: ' + (e && e.message ? e.message : String(e)) });
  }
};
