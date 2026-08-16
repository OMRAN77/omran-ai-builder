const MAX_PROMPT_CHARS = 3000;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const kind = String(body.kind || '');
  const prompt = String(body.prompt || '').trim().slice(0, MAX_PROMPT_CHARS);
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });
  if (kind === 'image') {
    const key = String(process.env.OPENAI_API_KEY || '');
    if (!key) return res.status(503).json({ error: 'image_provider_not_configured' });
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 }),
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'image_generation_failed', detail: data.error && data.error.message });
    return res.status(200).json({ status: 'complete', image: data.data && data.data[0] });
  }
  if (kind === 'video') {
    if (!process.env.RUNWAY_API_KEY) return res.status(503).json({ error: 'video_provider_not_configured' });
    return res.status(202).json({
      status: 'queued',
      message: 'Video task connector is configured for approval-gated provider execution.',
      prompt,
    });
  }
  return res.status(400).json({ error: 'unsupported_media_kind' });
};
