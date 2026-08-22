// Returns the PayPal client ID so the frontend can load the PayPal JS SDK.
// Uses PAYPAL_CLIENT_ID env var.
module.exports = async (req, res) => {
  const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
  if (!clientId) {
    res.status(200).json({ configured: false });
    return;
  }
  res.status(200).json({ configured: true, clientId });
};
