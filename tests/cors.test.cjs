const assert = require('node:assert/strict');
const { installCors } = require('../api/_lib/cors.js');

function response() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); return this; },
  };
}

const originalEnv = process.env.VERCEL_ENV;
process.env.VERCEL_ENV = 'production';
process.env.ALLOWED_ORIGINS = 'https://app.example.com';

const sameOrigin = response();
installCors({ headers: { host: 'app.example.com', origin: 'https://app.example.com', 'x-forwarded-proto': 'https' } }, sameOrigin);
sameOrigin.setHeader('Access-Control-Allow-Origin', '*');
assert.equal(sameOrigin.headers.get('access-control-allow-origin'), 'https://app.example.com');

const configured = response();
installCors({ headers: { host: 'api.example.com', origin: 'https://app.example.com', 'x-forwarded-proto': 'https' } }, configured);
configured.setHeader('Access-Control-Allow-Origin', '*');
assert.equal(configured.headers.get('access-control-allow-origin'), 'https://app.example.com');

const blocked = response();
installCors({ headers: { host: 'api.example.com', origin: 'https://evil.example', 'x-forwarded-proto': 'https' } }, blocked);
blocked.setHeader('Access-Control-Allow-Origin', '*');
assert.equal(blocked.headers.has('access-control-allow-origin'), false);

if (originalEnv == null) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = originalEnv;
console.log('CORS origin tests passed');
