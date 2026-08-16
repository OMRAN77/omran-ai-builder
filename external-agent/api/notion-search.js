const NOTION_VERSION = '2022-06-28';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const token = String(process.env.NOTION_TOKEN || '').trim();
  if (!token) return res.status(503).json({ error: 'notion_not_configured' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const query = String(body.query || '').trim().slice(0, 500);
  if (!query) return res.status(400).json({ error: 'query_required' });
  try {
    const upstream = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, page_size: 10 }),
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'notion_error', detail: data });
    const results = (data.results || []).map((item) => ({
      id: item.id,
      type: item.object,
      url: item.url,
      title: (((item.properties || {}).title || {}).title || []).map((part) => part.plain_text).join('') ||
        ((item.title || []).map((part) => part.plain_text).join('')) || 'Untitled',
    }));
    return res.status(200).json({ results });
  } catch (error) {
    return res.status(502).json({ error: 'notion_unreachable', message: String(error.message || error) });
  }
};
