// Router: consolidates auth/admin/billing/share/feedback endpoints.
function load(action) {
  switch (action) {
    case 'auth': return require('./_lib/auth.js');
    case 'auth-google-callback': return require('./_lib/auth-google-callback.js');
    case 'admin-actions': return require('./_lib/admin-actions.js');
    case 'admin-stats': return require('./_lib/admin-stats.js');
    case 'usage-status': return require('./_lib/usage-status.js');
    case 'points': return require('./_lib/points.js');
    case 'create-checkout-session': return require('./_lib/create-checkout-session.js');
    case 'verify-checkout': return require('./_lib/create-checkout-session.js');
    case 'paypal-client-id': return require('./_lib/paypal-client-id.js');
    case 'paypal-order': return require('./_lib/paypal-order.js');
    case 'share': return require('./_lib/share.js');
    case 'feedback': return require('./_lib/feedback.js');
    case 'chats_save': return require('./_lib/chats.js');
    case 'chats_wipe': return require('./_lib/chats.js');
    case 'chats_load': return require('./_lib/chats.js');
    case 'chats_delete': return require('./_lib/chats.js');
    default: return null;
  }
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const handler = load(action);
  if (!handler) {
    res.status(404).json({ error: 'unknown account route: ' + action });
    return;
  }
  return handler(req, res);
};
