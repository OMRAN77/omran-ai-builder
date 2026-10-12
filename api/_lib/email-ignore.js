// Vercel Serverless Function: lets the user tell the AI Email Assistant to
// stop showing emails from a given sender (or pattern) in future scans.
// v-email-best: الجلسة الصارمة والحساب الحيّ (_gmail.emailAccount) كبقيّة نقاط البريد، والقائمة بسقف.
const { putUser } = require('./auth.js');
const { emailAccount } = require('./_gmail.js');

const IGNORE_MAX = 300;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { pattern } = body;
    if (!pattern || !String(pattern).trim()) { res.status(400).json({ error: 'حدد النمط المطلوب تجاهله' }); return; }

    const acct = await emailAccount(body);
    if (acct.status) { res.status(acct.status).json(acct.json); return; }
    const { username, user } = acct;
    if (!user.emailAssist) { res.status(400).json({ error: 'لم يتم ربط Gmail بعد', notConnected: true }); return; }
    const p = String(pattern).trim().toLowerCase().slice(0, 200);
    const list = (user.emailAssist.ignoreList || []).filter((x) => x !== p);
    list.push(p);
    user.emailAssist.ignoreList = list.slice(-IGNORE_MAX);
    await putUser(username, user);
    res.status(200).json({ ok: true, ignoreList: user.emailAssist.ignoreList });
  } catch (e) {
    res.status(500).json({ error: 'Email ignore error: ' + (e && e.message ? e.message : String(e)) });
  }
};
