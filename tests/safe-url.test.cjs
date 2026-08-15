const assert = require('node:assert/strict');
const { isPrivateAddress, validatePublicUrl, fetchPublicUrl } = require('../api/_lib/safe-url.js');

(async () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('169.254.169.254'), true);
  assert.equal(isPrivateAddress('10.0.0.7'), true);
  assert.equal(isPrivateAddress('192.168.1.9'), true);
  assert.equal(isPrivateAddress('::1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);

  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  await assert.doesNotReject(() => validatePublicUrl('https://example.com/page', { lookup }));
  await assert.rejects(() => validatePublicUrl('http://127.0.0.1/admin', { lookup }), /blocked_outbound_host/);
  await assert.rejects(() => validatePublicUrl('https://example.com', { lookup, allowedHosts: ['api.example.com'] }), /unapproved_outbound_host/);
  await assert.rejects(() => validatePublicUrl('https://example.com', { lookup: async () => [{ address: '10.0.0.1', family: 4 }] }), /blocked_outbound_host/);

  let calls = 0;
  const response = await fetchPublicUrl('https://example.com/start', {}, {
    lookup,
    fetchFn: async (_url, init) => {
      calls++;
      assert.equal(init.redirect, 'manual');
      return calls === 1
        ? { status: 302, headers: new Headers({ location: 'https://example.com/final' }) }
        : { status: 200, headers: new Headers() };
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  console.log('safe outbound URL tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
