const REQUIRED = [
  'NOTION_TOKEN',
  'NOTION_DATABASE_ID',
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_INSTALLATION_ID',
  'GITHUB_REPOSITORY',
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'AI_PROVIDER_API_KEY',
  'APPROVAL_SECRET',
];

module.exports = (req, res) => {
  const missing = REQUIRED.filter((key) => !String(process.env[key] || '').trim());
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    ready: missing.length === 0,
    missing,
    next: missing.length ? 'Add only the listed values in Vercel Environment Variables.' : 'Integrations are configured.',
  });
};
