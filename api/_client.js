// The caller's IP address as seen by the platform. On Vercel, x-real-ip and
// x-forwarded-for are set by the edge, which overwrites any client-supplied value,
// so they can back per-IP limits there. Returns null when no address is known.
function clientIp(req) {
  const h = (req && req.headers) || {};
  const real = String(h['x-real-ip'] || '').trim();
  if (real) return real;
  const fwd = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  if (fwd) return fwd;
  return (req && req.socket && req.socket.remoteAddress) || null;
}

module.exports = { clientIp };
