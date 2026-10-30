const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const { loadApi, callApi, installFetch, STRONG_SECRET } = require('../helpers/harness');

test('port scan is disabled and opens no connection, whatever the target', async () => {
  const realConnect = net.Socket.prototype.connect;
  let connects = 0;
  net.Socket.prototype.connect = function () { connects++; return realConnect.apply(this, arguments); };
  try {
    const scan = loadApi('portscan');
    for (const host of ['example.com', '2130706433', '169.254.169.254', '127.0.0.1']) {
      const r = await callApi(scan, { body: { host } });
      assert.strictEqual(r.status, 503);
      assert.strictEqual(r.body.disabled, true);
      assert.match(r.body.error, /معطّلة مؤقتًا/);
    }
    assert.strictEqual(connects, 0);
  } finally { net.Socket.prototype.connect = realConnect; }
});

test('DeHashed search is disabled and calls nothing, even with a key and a valid login', async () => {
  let calls = 0;
  const restore = installFetch(async () => { calls++; return new Response('{}'); });
  try {
    const dh = loadApi('dehashed', { DEHASHED_API_KEY: 'configured-key', AUTH_SECRET: STRONG_SECRET, BLOB_READ_WRITE_TOKEN: 'x' });
    const token = require('../../api/_secrets').makeToken('alice', 0);
    const r = await callApi(dh, { body: { token, field: 'email', value: 'someone@example.com' } });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.body.disabled, true);
    assert.match(r.body.message, /معطّلة مؤقتًا/);
    assert.strictEqual(calls, 0);
  } finally { restore(); }
});
