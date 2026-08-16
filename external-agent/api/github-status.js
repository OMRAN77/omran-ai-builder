const crypto = require('node:crypto');

function appJwt() {
  const appId = String(process.env.GITHUB_APP_ID || '');
  const pem = String(process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!appId || !pem) throw new Error('github_app_not_configured');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: appId })}`;
  const sign = crypto.createSign('RSA-SHA256'); sign.update(input); sign.end();
  return `${input}.${sign.sign(pem).toString('base64url')}`;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const installationId = String(process.env.GITHUB_APP_INSTALLATION_ID || '');
  if (!installationId) return res.status(503).json({ error: 'github_installation_not_configured' });
  try {
    const tokenResponse = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${appJwt()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) return res.status(tokenResponse.status).json({ error: 'github_app_error', detail: token.message });
    const repo = String(process.env.GITHUB_REPOSITORY || '');
    const repoResponse = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Authorization: `Bearer ${token.token}`, Accept: 'application/vnd.github+json' },
    });
    const data = await repoResponse.json();
    if (!repoResponse.ok) return res.status(repoResponse.status).json({ error: 'github_repository_error', detail: data.message });
    return res.status(200).json({ ok: true, repository: data.full_name, defaultBranch: data.default_branch, private: data.private });
  } catch (error) {
    return res.status(502).json({ error: 'github_unreachable', message: String(error.message || error) });
  }
};
