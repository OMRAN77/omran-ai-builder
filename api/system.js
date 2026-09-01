// Router: consolidates reminders/push/search/realtime-session endpoints.
// Installs a time-to-first-byte timeout on every outbound fetch (see _lib/_fetch-timeout.js).
require('./_lib/_fetch-timeout.js');
// Nothing thrown in this router escapes unrecorded (see _lib/_errors.js).
const { withErrorCapture } = require('./_lib/_errors.js');
const { installCors } = require('./_lib/cors.js');

function load(action) {
  switch (action) {
    case 'check-reminders': return require('./_lib/check-reminders.js');
    case 'push-subscribe': return require('./_lib/push-subscribe.js');
    case 'reminders': return require('./_lib/reminders.js');
    case 'vapid-public-key': return require('./_lib/vapid-public-key.js');
    case 'agent-tool-result': return require('./_lib/agent-tool-result.js');
    case 'search': return require('./_lib/search.js');
    case 'realtime-session': return require('./_lib/realtime-session.js');
    case 'google-start': return require('./_lib/auth-google-start.js');
    case 'email-google-start': return require('./_lib/email-google-start.js');
    case 'email-callback': return require('./_lib/email-callback.js');
    case 'email-list': return require('./_lib/email-list.js');
    case 'email-send': return require('./_lib/email-send.js');
    case 'email-ignore': return require('./_lib/email-ignore.js');
    case 'email-calendar': return require('./_lib/email-calendar.js');
    case 'memory': return require('./_lib/memory.js');
    case 'client-errors': return require('./_lib/client-errors.js');
    case 'tv-resolve': return require('./_lib/tv-resolve.js');
    case 'health': return require('./_lib/health.js');
    case 'feedback': return require('./_lib/feedback.js');
    case 'revgeo': return require('./_lib/revgeo.js');
    default: return null;
  }
}

module.exports = withErrorCapture('system', async (req, res) => {
  installCors(req, res);
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown system route: ' + action });
    return;
  }
  return handler(req, res);
});
