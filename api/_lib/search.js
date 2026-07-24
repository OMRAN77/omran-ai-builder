// Vercel Serverless Function: live internet search via Tavily's API, using the
// site owner's own server-side API key (TAVILY_API_KEY env var). Used by Maha
// (mها) to answer questions that need real-time information (weather, news,
// sports scores, prices, current events, etc.) instead of relying only on the
// model's static training knowledge.
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
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing TAVILY_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
    }
    const query = (body && body.query || '').toString().trim();
    if (!query) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }
    const wantImages = !!(body && body.images);
    const domains = Array.isArray(body && body.domains)
      ? body.domains.filter(d => typeof d === 'string' && /^[a-z0-9.-]+$/i.test(d)).slice(0, 5)
      : null;

    const lang = (body && body.lang || 'ar').toString().slice(0, 2);
    const gnHl = lang === 'ar' ? 'ar' : 'en-US';
    const gnGl = lang === 'ar' ? 'AE' : 'US';
    const gnCeid = lang === 'ar' ? 'AE:ar' : 'US:en';
    const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${gnHl}&gl=${gnGl}&ceid=${gnCeid}`;

    const gKey = process.env.GOOGLE_SEARCH_API_KEY;
    const gCx = process.env.GOOGLE_SEARCH_CX;
    const googleUrl = (gKey && gCx)
      ? `https://www.googleapis.com/customsearch/v1?key=${gKey}&cx=${gCx}&q=${encodeURIComponent(query)}&num=3`
      : null;

    const [tavilyResp, newsResp, googleResp] = await Promise.all([
      fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'basic',
          include_answer: true,
          include_images: wantImages,
          max_results: domains ? 5 : 3,
          ...(domains ? { include_domains: domains } : {}),
        }),
      }),
      fetch(newsUrl).catch(() => null),
      googleUrl ? fetch(googleUrl).catch(() => null) : Promise.resolve(null),
    ]);

    if (!tavilyResp.ok) {
      const errText = await tavilyResp.text().catch(() => '');
      res.status(502).json({ error: 'Search provider error', detail: errText });
      return;
    }

    const data = await tavilyResp.json();
    const results = Array.isArray(data.results) ? data.results.slice(0, 3).map(r => ({
      title: r.title,
      url: r.url,
      content: (r.content || '').slice(0, 350),
    })) : [];

    let newsItems = [];
    try {
      if (newsResp && newsResp.ok) {
        const xml = await newsResp.text();
        const itemBlocks = xml.split('<item>').slice(1, 4);
        newsItems = itemBlocks.map(block => {
          const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
          const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
          const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
          const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
          return title ? {
            title,
            url: linkMatch ? linkMatch[1].trim() : '',
            content: pubMatch ? `Google News - ${pubMatch[1].trim()}` : 'Google News',
          } : null;
        }).filter(Boolean);
      }
    } catch (e) { /* ignore Google News parse errors, non-critical */ }

    const images = wantImages && Array.isArray(data.images) ? data.images.slice(0, 4) : [];

    let googleItems = [];
    try {
      if (googleResp && googleResp.ok) {
        const gData = await googleResp.json();
        googleItems = Array.isArray(gData.items) ? gData.items.slice(0, 3).map(it => ({
          title: it.title,
          url: it.link,
          content: (it.snippet || '').slice(0, 350),
        })) : [];
      }
    } catch (e) { /* ignore Google Search parse errors, non-critical */ }

    res.status(200).json({
      answer: data.answer || '',
      results,
      google: googleItems,
      news: newsItems,
      images,
    });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', detail: String(err && err.message || err) });
  }
};
