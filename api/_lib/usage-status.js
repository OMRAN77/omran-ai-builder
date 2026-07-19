// Read-only endpoint: returns today's remaining message quota for each of the
// 9 server-proxied AI providers for the current user (or guest). Never
// consumes any quota — just reports counts already tallied, so the quick
// provider picker in the sidebar can show who still has quota left today.
const { getAllRemaining } = require('./_usage');
const { getUser } = require('./auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { token, guestId } = body || {};
    const result = await getAllRemaining(token, guestId);
    res.status(200).json(result);
  } catch (e) {
    res.status(200).json({ authed: false, username: null, remaining: {} });
  }
};
