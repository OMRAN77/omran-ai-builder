const MAX_TASK_CHARS = 4000;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const task = String(body.task || '').trim().slice(0, MAX_TASK_CHARS);
  const key = String(process.env.AI_PROVIDER_API_KEY || process.env.OPENAI_API_KEY || '');
  if (!task) return res.status(400).json({ error: 'task_required' });
  if (!key) return res.status(503).json({ error: 'ai_provider_not_configured' });
  const prompt = `You are the planning component of an approval-gated software operations agent. Return JSON only with keys summary, risk, steps, verification, and requiresApproval. Plan this task: ${task}`;
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_PROVIDER_MODEL || 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'planning_failed', detail: data.error && data.error.message });
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return res.status(200).json({ plan: JSON.parse(content || '{}') });
  } catch (error) {
    return res.status(502).json({ error: 'planning_unreachable', message: String(error.message || error) });
  }
};
