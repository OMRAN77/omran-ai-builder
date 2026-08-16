// Returns the PayPal Client ID (public, safe to expose) so the frontend can
// dynamically load the PayPal SDK script without hardcoding the key in source.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  // Temporary, non-sensitive diagnostics: only presence, length, and a
  // 2-char prefix of the secret — never the secret itself.
  const s = process.env.PAYPAL_SECRET || '';
  res.status(200).json({
    clientId,
    configured: !!clientId,
    secretSet: !!s,
    secretLen: s.length,
    secretPrefix: s.slice(0, 2),
    mode: process.env.PAYPAL_MODE || '(unset)',
  });
};
