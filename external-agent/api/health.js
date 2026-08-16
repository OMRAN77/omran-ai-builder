module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    ok: true,
    service: 'mona-external-agent',
    integrations: {
      notion: Boolean(process.env.NOTION_TOKEN),
      github: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
      vercel: Boolean(process.env.VERCEL_TOKEN),
      ai: Boolean(process.env.AI_PROVIDER_API_KEY),
    },
    approvalRequired: true,
  });
};
