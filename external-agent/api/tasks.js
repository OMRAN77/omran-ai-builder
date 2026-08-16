const MAX_TASK_CHARS = 4000;
const SAFE_ACTIONS = new Set(['research', 'analyze', 'plan', 'fix', 'test', 'pull_request', 'preview_deploy']);
const APPROVAL_ACTIONS = new Set(['production_deploy', 'payment']);

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'GET') {
    res.status(200).json({
      actions: [...SAFE_ACTIONS, ...APPROVAL_ACTIONS],
      workflow: ['analyze', 'plan', 'execute', 'verify', 'report'],
      approvalRequired: [...APPROVAL_ACTIONS],
    });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = String(body.action || '');
  const task = String(body.task || '').trim().slice(0, MAX_TASK_CHARS);
  if (!SAFE_ACTIONS.has(action) && !APPROVAL_ACTIONS.has(action)) {
    res.status(400).json({ error: 'invalid_action' });
    return;
  }
  if (!task) {
    res.status(400).json({ error: 'task_required' });
    return;
  }
  if (APPROVAL_ACTIONS.has(action)) {
    res.status(202).json({
      status: 'awaiting_approval',
      action,
      task,
      message: 'This action cannot run until the owner approves it.',
    });
    return;
  }
  res.status(202).json({
    status: 'queued',
    action,
    task,
    phases: ['analyze', 'plan', 'execute', 'verify', 'report'],
    message: 'Worker execution will be enabled after the GitHub, Notion, and AI integrations are configured.',
  });
};
