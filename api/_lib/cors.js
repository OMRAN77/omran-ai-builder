'use strict';

function requestOrigin(req) {
  const host = String((req.headers && req.headers.host) || '').trim();
  if (!host) return '';
  const proto = String((req.headers && req.headers['x-forwarded-proto']) || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

function isAllowedOrigin(req, origin) {
  if (!origin) return false;
  if (origin === requestOrigin(req)) return true;
  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (process.env.VERCEL_ENV !== 'production') configured.push('http://localhost:3000', 'http://localhost:5173');
  return configured.includes(origin);
}

// The legacy handlers set CORS headers individually. Installing this at each
// router prevents a downstream wildcard header from widening browser access.
function installCors(req, res) {
  const origin = String((req.headers && req.headers.origin) || '').trim();
  const allowed = isAllowedOrigin(req, origin);
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (String(name).toLowerCase() === 'access-control-allow-origin') {
      if (allowed) return setHeader(name, origin);
      return res;
    }
    return setHeader(name, value);
  };
  return allowed;
}

module.exports = { installCors, isAllowedOrigin };
