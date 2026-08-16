const crypto = require('node:crypto');

function appJwt() {
  const appId = String(process.env.GITHUB_APP_ID || '');
  const pem = String(process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!appId || !pem) throw new Error('github_app_not_configured');
  const now = Math.floor(Date.now() / 1000);
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iat: now - 60, exp: now + 540, iss: appId })}`;
  const signer = crypto.createSign('RSA-SHA256'); signer.update(input); signer.end();
  return `${input}.${signer.sign(pem).toString('base64url')}`;
}

async function installationToken() {
  const id = String(process.env.GITHUB_APP_INSTALLATION_ID || '');
  const response = await fetch(`https://api.github.com/app/installations/${id}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${appJwt()}`, Accept: 'application/vnd.github+json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'github_installation_token_failed');
  return data.token;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.APPROVAL_SECRET || req.headers['x-approval-secret'] !== process.env.APPROVAL_SECRET) {
    return res.status(403).json({ error: 'owner_approval_required' });
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const branch = String(body.branch || '').replace(/[^a-z0-9/_-]/gi, '').slice(0, 80);
  const path = String(body.path || '').replace(/^\/+/, '').slice(0, 300);
  const apiPath = path.split('/').map(encodeURIComponent).join('/');
  const content = String(body.content || '');
  const title = String(body.title || '').slice(0, 120);
  if (!branch || !path || !content || !title) return res.status(400).json({ error: 'branch_path_content_title_required' });
  try {
    const token = await installationToken();
    const repo = String(process.env.GITHUB_REPOSITORY || '');
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
    const repoData = await (await fetch(`https://api.github.com/repos/${repo}`, { headers })).json();
    const base = repoData.default_branch;
    const baseRef = await (await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${base}`, { headers })).json();
    const createRef = await fetch(`https://api.github.com/repos/${repo}/git/refs`, { method: 'POST', headers, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }) });
    if (!createRef.ok && createRef.status !== 422) throw new Error('branch_create_failed');
    const existing = await fetch(`https://api.github.com/repos/${repo}/contents/${apiPath}?ref=${encodeURIComponent(branch)}`, { headers });
    const existingData = existing.ok ? await existing.json() : null;
    const save = await fetch(`https://api.github.com/repos/${repo}/contents/${apiPath}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ message: title, content: Buffer.from(content).toString('base64'), branch, sha: existingData && existingData.sha }),
    });
    if (!save.ok) throw new Error('file_update_failed');
    const pull = await fetch(`https://api.github.com/repos/${repo}/pulls`, { method: 'POST', headers, body: JSON.stringify({ title, head: branch, base, body: 'Created by Mona with owner approval.' }) });
    const result = await pull.json();
    if (!pull.ok) throw new Error(result.message || 'pull_request_failed');
    return res.status(201).json({ ok: true, url: result.html_url, number: result.number });
  } catch (error) {
    return res.status(502).json({ error: 'github_execution_failed', message: String(error.message || error) });
  }
};
