// Router: consolidates reminders/push/search/realtime-session endpoints.
function load(action) {
  switch (action) {
    case 'check-reminders': return require('./_lib/check-reminders.js');
    case 'push-subscribe': return require('./_lib/push-subscribe.js');
    case 'reminders': return require('./_lib/reminders.js');
    case 'vapid-public-key': return require('./_lib/vapid-public-key.js');
    case 'search': return require('./_lib/search.js');
    case 'realtime-session': return require('./_lib/realtime-session.js');
    default: return null;
  }
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown system route: ' + action });
    return;
  }
  return handler(req, res);
};
