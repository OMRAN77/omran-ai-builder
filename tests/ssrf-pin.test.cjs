// tests/ssrf-pin.test.cjs — v-ssrf-pin (الدفعة A، أمان): fetchPublicUrl كان يفحص جواب DNS ثمّ يترك fetch يحلّ الاسم من جديد عند
// الاتصال — فاسمٌ يجيب عنوانًا عامًّا للفحص ثمّ 127.0.0.1 للاتصال (DNS rebinding) يصل الداخل. الآن الاتصال يمرّ بموزّع undici
// المدمج بـconnect.lookup يرفض أيّ عنوان خاصّ لكلّ اتصال. ومعه نطاقات محجوزة كانت تمرّ: 192.0.0.0/24 وTEST-NET الثلاث
// و64:ff9b:1::/48 و2001:db8::/32 و2001:2::/48 و100::/64، والأسماء ‎*.localhost و‎*.internal.
// حتميّ بلا شبكة: خادم محلّيّ على 127.0.0.1 ودالّة lookup محقونة (الحارس نفسه يستعمل المحقونة للفحص والاتصال).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const S = require(path.join(__dirname, '..', 'api/_lib/safe-url.js'));

function localServer() {
  return new Promise((resolve) => {
    let hits = 0;
    const srv = http.createServer((req, res) => { hits++; res.end('internal-secret'); });
    srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, get hits() { return hits; }, close: () => new Promise((r) => srv.close(r)) }));
  });
}

test('١. DNS rebinding: الفحص يرى عنوانًا عامًّا والاتصال يرى 127.0.0.1 — يُرفض عند الاتصال ولا يصل الخادم الداخليّ', async () => {
  const srv = await localServer();
  let calls = 0;
  const lookup = async () => (++calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);
  try {
    await assert.rejects(() => S.fetchPublicUrl('http://rebind.test:' + srv.port + '/latest/meta-data/', {}, { lookup }), (e) => {
      assert.equal(e.message, 'blocked_outbound_host', 'كان fetch يحلّ الاسم من جديد بلا فحص: ' + e.message);
      return true;
    });
    assert.ok(calls >= 2, 'الاتصال يحلّ الاسم عبر الحارس (نداءات lookup: ' + calls + ')');
    assert.equal(srv.hits, 0, 'لا طلب وصل الخادم الداخليّ');
  } finally { await srv.close(); }
});

test('٢. الموزّع المثبَّت يُمرَّر إلى fetch مع redirect اليدويّ، وكلّ تحويل يُفحص من جديد', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const seen = [];
  const r = await S.fetchPublicUrl('https://example.com/a', { headers: { a: '1' } }, {
    lookup,
    fetchFn: async (u, init) => {
      seen.push(init);
      return seen.length === 1 ? { status: 302, headers: new Headers({ location: 'http://192.0.2.10/x' }) } : { status: 200, headers: new Headers() };
    },
  }).catch((e) => e);
  assert.equal(r.message, 'blocked_outbound_host', 'التحويل إلى TEST-NET-1 مرفوض');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].redirect, 'manual');
  assert.equal(seen[0].headers.a, '1');
  assert.ok(seen[0].dispatcher && typeof seen[0].dispatcher.dispatch === 'function', 'موزّع undici بـconnect.lookup');
});

test('٣. pinnedLookup: يعيد العامّ بصيغتي all والفرديّة ويصفّي العائلة، ويرفض أيّ خاصّ في الجواب', async () => {
  const ask = (records, opts) => new Promise((resolve) => {
    S.pinnedLookup(async () => records)('h.example', opts, (err, a, f) => resolve({ err, a, f }));
  });
  let r = await ask([{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1111', family: 6 }], { all: true });
  assert.equal(r.err, null);
  assert.deepEqual(r.a, [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700::1111', family: 6 }]);
  r = await ask([{ address: '2606:4700::1111', family: 6 }, { address: '93.184.216.34', family: 4 }], { family: 4 });
  assert.deepEqual([r.err, r.a, r.f], [null, '93.184.216.34', 4]);
  for (const bad of [[{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }], [{ address: '::ffff:127.0.0.1', family: 6 }], [{ address: '203.0.113.7', family: 4 }], []]) {
    r = await ask(bad, { all: true });
    assert.equal(r.err && r.err.message, 'blocked_outbound_host', JSON.stringify(bad));
  }
});

test('٤. النطاقات المحجوزة الناقصة مغلقة، والعامّة المجاورة لها مفتوحة', () => {
  for (const priv of ['192.0.0.1', '192.0.0.170', '192.0.2.1', '198.51.100.7', '203.0.113.254', '64:ff9b:1::a9fe:a9fe', '64:ff9b:1:ffff::1', '2001:db8::1', '2001:db8:ffff::1', '2001:2::1', '100::1']) {
    assert.equal(S.isPrivateAddress(priv), true, priv + ' محجوز');
  }
  for (const pub of ['192.0.1.1', '192.0.3.1', '198.51.99.1', '198.51.101.1', '203.0.112.1', '203.0.114.1', '64:ff9b::808:808', '64:ff9b:2::1', '2001:db9::1', '2001:3::1', '2001:4860:4860::8888', '101::1']) {
    assert.equal(S.isPrivateAddress(pub), false, pub + ' عامّ');
  }
  for (const u of ['http://192.0.0.1/', 'http://198.51.100.1/', 'http://[64:ff9b:1::a9fe:a9fe]/', 'http://[2001:db8::1]/', 'http://foo.localhost/', 'http://a.b.localhost./', 'http://metadata.google.internal./', 'http://vault.corp.internal/']) {
    assert.throws(() => S.parsePublicUrl(u), /blocked_outbound_host/, u);
  }
  for (const u of ['https://example.com/', 'https://internal.example.com/', 'https://localhost-tools.dev/', 'https://my.internalx.com/']) {
    assert.equal(S.parsePublicUrl(u).href, u, u + ' عامّ');
  }
});
