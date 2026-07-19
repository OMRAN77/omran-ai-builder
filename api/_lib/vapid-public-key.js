// Serves the (public, non-secret) VAPID public key so the browser can
// subscribe to Web Push. The matching private key stays server-side only,
// in the VAPID_PRIVATE_KEY Vercel env var, used by /api/check-reminders.
module.exports = async (req, res) => {
  res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
};
