module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const target = body.target === 'production' ? 'production' : 'preview';
  if (target === 'production' && (!process.env.APPROVAL_SECRET || req.headers['x-approval-secret'] !== process.env.APPROVAL_SECRET)) {
    return res.status(403).json({ error: 'owner_approval_required' });
  }
  const hook = String(target === 'production' ? process.env.VERCEL_PRODUCTION_DEPLOY_HOOK : process.env.VERCEL_PREVIEW_DEPLOY_HOOK || '');
  if (!hook.startsWith('https://api.vercel.com/')) return res.status(503).json({ error: 'vercel_deploy_hook_not_configured' });
  try {
    const upstream = await fetch(hook, { method: 'POST' });
    const text = await upstream.text();
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'vercel_deploy_failed', detail: text.slice(0, 500) });
    return res.status(202).json({ status: 'triggered', target, detail: text.slice(0, 500) });
  } catch (error) {
    return res.status(502).json({ error: 'vercel_unreachable', message: String(error.message || error) });
  }
};
