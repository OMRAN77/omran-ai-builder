module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const key = String(process.env.PERPLEXITY_API_KEY || '');
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const question = String(body.question || '').trim().slice(0, 2000);
  if (!question) return res.status(400).json({ error: 'question_required' });
  if (!key) return res.status(503).json({ error: 'research_provider_not_configured' });
  try {
    const upstream = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.RESEARCH_MODEL || 'sonar',
        messages: [
          { role: 'system', content: 'Answer accurately. Separate confirmed facts from uncertainty. Include source URLs when available. Reply in the user language.' },
          { role: 'user', content: question },
        ],
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'research_failed', detail: data.error && data.error.message });
    return res.status(200).json({
      answer: data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content,
      citations: data.citations || [],
    });
  } catch (error) {
    return res.status(502).json({ error: 'research_unreachable', message: String(error.message || error) });
  }
};
