// tests/monitor-readonly.test.cjs — v-monitor-readonly (فحص Desloppify ٩ نوفمبر ٢٠٢٦، بند الصلاحيّات): MONITOR_KEY تحمله ورك فلوهات مستودع
// علنيّ ويمرّ في الرابط، وكان يفتح في health.js مسح سجلّ الأخطاء وحذف روابط مشاركة المستخدمين وتقرير تكلفة كلّ حساب وأكبر مفاتيح القاعدة.
// الآن المفتاح للفحص وحده؛ الباقي لجلسة المالك (لوحته ترسل ?token= أصلًا). على _owner.js الحقيقيّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'monitor-readonly-secret';
process.env.MONITOR_KEY = 'monitor-readonly-key-0123456789';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const touched = [];
const kvImpl = {
  kvGetJSON: async () => null,
  kvPutJSON: async (k) => { touched.push('PUT ' + k); },
  kvDel: async (k) => { touched.push('DEL ' + k); },
  kvList: async () => [],
  kvPipeline: async (c) => { touched.push('PIPE ' + c.length); return c.map(() => null); },
};
stub('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
stub('api/_lib/media-purge.js', { purgeOldShares: async () => { touched.push('PURGE'); return { deleted: 3 }; } });
stub('api/_lib/redis-usage.js', { redisUsage: async () => { touched.push('USAGE'); return { groups: [] }; } });
stub('api/_lib/cost-meter.js', { monthReport: async () => { touched.push('COSTS'); return {}; }, tokenReport: async () => ({}) });

const health = require(rp('api/_lib/health.js'));
const call = (query) => new Promise((resolve) => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); }, end() { resolve({ code: this.code }); } };
  health({ method: 'GET', query, headers: {} }, res);
});
const tokenFor = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 3600e3 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
const KEY = process.env.MONITOR_KEY;

test('١. MONITOR_KEY وحده: لا مسح ولا حذف ولا تقارير (٤٠٣) ولا لمسة للقاعدة', async () => {
  for (const q of [{ clear: 'errors' }, { clear: '1' }, { purge: 'media' }, { usage: '1' }, { costs: '1' }]) {
    touched.length = 0;
    const r = await call(Object.assign({ key: KEY }, q));
    assert.equal(r.code, 403, JSON.stringify(q) + ' ' + JSON.stringify(r.j));
    assert.equal(r.j.error, 'owner_session_required');
    assert.deepEqual(touched, [], JSON.stringify(q));
  }
});

test('٢. جلسة المالك: المسح والحذف والتقارير كما كانت', async () => {
  const token = tokenFor('omran');
  touched.length = 0;
  assert.deepEqual((await call({ token, clear: 'errors' })).j, { ok: true, cleared: true });
  assert.ok(touched.includes('PUT db/server-errors/log.json') && touched.includes('PUT db/client-errors/log.json'));
  assert.equal((await call({ token, purge: 'media' })).code, 200);
  assert.equal((await call({ token, usage: '1' })).code, 200);
  assert.equal((await call({ token, costs: '1' })).code, 200);
  assert.ok(['PURGE', 'USAGE', 'COSTS'].every((x) => touched.includes(x)), touched.join(','));
});

test('٣. جلسة غير المالك ولا شيء: ٤٠١ كما كان', async () => {
  assert.equal((await call({ token: tokenFor('sara'), clear: 'errors' })).code, 401);
  assert.equal((await call({ clear: 'errors' })).code, 401);
});

test('٤. الفحص نفسه بالمفتاح ما زال يمرّ البوّابة (smoke.mjs وclient-errors-report)', async () => {
  const r = await call({ key: KEY });
  assert.notEqual(r.code, 401);
  assert.notEqual(r.code, 403);
});
