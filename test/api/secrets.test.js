const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadApi, callApi, createBlobFake, installFetch, STRONG_SECRET, API_DIR } = require('../helpers/harness');

const OLD_FALLBACK = 'fallback-dev-secret-change-me';

function signWith(secret, data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

test('token round-trip with a configured secret', () => {
  const s = loadApi('_secrets', { AUTH_SECRET: STRONG_SECRET });
  const t = s.makeToken('alice', 3);
  assert.deepStrictEqual(s.verifyToken(t), { u: 'alice', tv: 3 });
});

test('no AUTH_SECRET: nothing verifies and nothing can be signed', () => {
  const s = loadApi('_secrets', { AUTH_SECRET: undefined });
  assert.strictEqual(s.getAuthSecret(), null);
  assert.throws(() => s.makeToken('alice'));
  assert.strictEqual(s.verifyToken(signWith(OLD_FALLBACK, { u: 'alice', exp: Date.now() + 60000 })), null);
  assert.strictEqual(s.deriveKey('x'), null);
});

test('AUTH_SECRET shorter than 32 characters is treated as missing', () => {
  const s = loadApi('_secrets', { AUTH_SECRET: 'short-secret' });
  assert.strictEqual(s.getAuthSecret(), null);
  assert.strictEqual(s.verifyToken(signWith('short-secret', { u: 'alice', exp: Date.now() + 60000 })), null);
});

test('tampered, expired, foreign and exp-less tokens are rejected', () => {
  const s = loadApi('_secrets', { AUTH_SECRET: STRONG_SECRET });
  const good = s.makeToken('alice');
  const [payload, sig] = good.split('.');
  const otherPayload = Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 60000 })).toString('base64url');
  assert.strictEqual(s.verifyToken(otherPayload + '.' + sig), null);
  assert.strictEqual(s.verifyToken(payload + '.' + sig.slice(0, -2) + 'AA'), null);
  assert.strictEqual(s.verifyToken(signWith(STRONG_SECRET, { u: 'alice', exp: Date.now() - 1 })), null);
  assert.strictEqual(s.verifyToken(signWith('another-secret-of-sufficient-length-000000', { u: 'alice', exp: Date.now() + 60000 })), null);
  assert.strictEqual(s.verifyToken(signWith(STRONG_SECRET, { u: 'alice' })), null);
  assert.strictEqual(s.verifyToken('garbage'), null);
  assert.strictEqual(s.verifyToken(undefined), null);
});

test('tokens issued before this change (no tv field) still verify with the same secret', () => {
  const s = loadApi('_secrets', { AUTH_SECRET: STRONG_SECRET });
  assert.deepStrictEqual(s.verifyToken(signWith(STRONG_SECRET, { u: 'alice', exp: Date.now() + 60000 })), { u: 'alice', tv: 0 });
});

test('auth endpoint refuses to work without AUTH_SECRET and writes nothing', async () => {
  const blob = createBlobFake();
  const restore = installFetch(blob.fetchImpl());
  try {
    const auth = loadApi('auth', { AUTH_SECRET: undefined, BLOB_READ_WRITE_TOKEN: blob.token });
    for (const body of [
      { action: 'signup', username: 'alice', password: 'long-enough-pw' },
      { action: 'login', username: 'alice', password: 'long-enough-pw' },
      { action: 'verify', token: signWith(OLD_FALLBACK, { u: 'alice', exp: Date.now() + 60000 }) },
    ]) {
      const r = await callApi(auth, { body });
      assert.strictEqual(r.status, 503, JSON.stringify(r));
    }
    assert.strictEqual(blob.log.length, 0);
  } finally { restore(); }
});

test('quota helper does not accept a token forged with the old fallback secret', async () => {
  const blob = createBlobFake();
  const restore = installFetch(blob.fetchImpl());
  try {
    const usage = loadApi('_usage', { AUTH_SECRET: undefined, BLOB_READ_WRITE_TOKEN: blob.token });
    const forged = signWith(OLD_FALLBACK, { u: 'victim', exp: Date.now() + 60000 });
    const r = await usage.checkAndConsume(forged, undefined, { headers: { 'x-forwarded-for': '198.51.100.7' } });
    assert.notStrictEqual(r.username, 'victim');
  } finally { restore(); }
});

test('the old fallback secret no longer appears anywhere under api/', () => {
  for (const f of fs.readdirSync(API_DIR)) {
    const src = fs.readFileSync(path.join(API_DIR, f), 'utf8');
    assert.ok(!src.includes(OLD_FALLBACK), f + ' still contains the fallback secret');
  }
});
