const assert = require('node:assert/strict');
const { isPrivateAddress, validatePublicUrl, fetchPublicUrl } = require('../api/_lib/safe-url.js');

(async () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('169.254.169.254'), true);
  assert.equal(isPrivateAddress('10.0.0.7'), true);
  assert.equal(isPrivateAddress('192.168.1.9'), true);
  assert.equal(isPrivateAddress('::1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);

  // v-sec-ssrf: صيغ كانت تفوت الحارس (مسبار التدقيق: ١٨ عنوانًا خاصًّا مسموحًا) — كلّها مغلقة الآن
  for (const priv of [
    '::ffff:127.0.0.1', '::ffff:7f00:1', '[::ffff:a9fe:a9fe]', '::ffff:10.0.0.1', '::127.0.0.1', '::', '::1',
    '100.64.0.1', '100.100.100.200', '100.127.255.254', '198.18.0.1', '198.19.255.255', '0.1.2.3',
    '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
    'fec0::1', 'feff::1', 'fe80::1%eth0', 'fd00::1', 'ff02::1', '64:ff9b::a9fe:a9fe', '64:ff9b::10.0.0.1', '2002:7f00:1::',
  ]) assert.equal(isPrivateAddress(priv), true, priv + ' يجب أن يُغلق');
  // والعامّة كما كانت — لا حظر زائد
  for (const pub of [
    '1.1.1.1', '100.63.255.255', '100.128.0.1', '198.17.255.255', '198.20.0.1', '223.255.255.255', '172.32.0.1',
    '::ffff:8.8.8.8', '64:ff9b::808:808', '2606:4700:4700::1111', '2001:4860:4860::8888', '2002:808:808::1', 'fbff::1',
  ]) assert.equal(isPrivateAddress(pub), false, pub + ' عامّ ويجب أن يبقى مسموحًا');
  const { parsePublicUrl } = require('../api/_lib/safe-url.js');
  // URL يعيد كتابة [::ffff:127.0.0.1] إلى [::ffff:7f00:1] — هذا ما يصل الحارس فعلًا
  for (const u of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/latest/meta-data/', 'http://100.100.100.200/', 'http://[64:ff9b::a9fe:a9fe]/', 'http://[fec0::1]/', 'http://224.0.0.1/']) {
    assert.throws(() => parsePublicUrl(u), /blocked_outbound_host/, u);
  }
  assert.equal(parsePublicUrl('http://[::ffff:8.8.8.8]/').hostname, '[::ffff:808:808]');
  // جواب DNS بعنوان mapped أو CGNAT يُغلق أيضًا
  await assert.rejects(() => validatePublicUrl('https://evil.example/', { lookup: async () => [{ address: '::ffff:127.0.0.1', family: 6 }] }), /blocked_outbound_host/);
  await assert.rejects(() => validatePublicUrl('https://evil.example/', { lookup: async () => [{ address: '100.64.1.1', family: 4 }] }), /blocked_outbound_host/);

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
