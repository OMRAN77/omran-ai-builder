// tests/session-dedupe.test.cjs — v-session-dedupe (فحص Desloppify ٨ نوفمبر ٢٠٢٦: «Exact dupe cluster — verifyToken ×8»).
// ثماني عدّادات استخدام (_usage و_car و_construction و_design و_fashion و_portrait و_studio و_video) حملت كلٌّ نسخة
// verifyToken تقارن `data.exp < Date.now()` — حمولة موقّعة بلا exp تمرّ منها للأبد (الثغرة التي سدّها v-session-shape في
// auth.js وحده). الآن كلّها عبر _session.sessionUser، مثل auth.verifyToken.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'session-dedupe-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
mock('api/_lib/kv.js', new Proxy({}, { get: () => async () => null }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const FILES = ['_usage', '_carUsage', '_constructionUsage', '_designUsage', '_fashionUsage', '_portraitUsage', '_studioUsage', '_videoUsage'];
const sign = (body) => {
  const p = Buffer.from(JSON.stringify(body)).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};

test('١. لا نسخة محلّيّة: كلّ عدّاد يمرّ بـ_session.sessionUser، ولا مقارنة `exp < now` ولا سرّ في نطاق الوحدة', () => {
  for (const n of FILES) {
    const s = read('api/_lib/' + n + '.js');
    assert.match(s, /function verifyToken\(token\) \{\n  return require\('\.\/_session\.js'\)\.sessionUser\(token\);\n\}/, n);
    assert.doesNotMatch(s, /exp < Date\.now\(\)|createHmac|AUTH_SECRET/, n + ': لا تحقّق يدويّ ولا سرّ');
  }
  // ولا نسخة باقية في أيّ وحدة خادم — points.js أُصلح بموافقة المالك (v-points-session، «صلّح النقاط» ٨ نوفمبر)
  const lib = fs.readdirSync(path.join(root, 'api/_lib')).filter((f) => f.endsWith('.js'));
  const left = lib.filter((f) => /if \(data\.exp < Date\.now\(\)\)/.test(read('api/_lib/' + f)));
  assert.deepEqual(left, [], 'مقارنة exp المتساهلة');
  const pts = read('api/_lib/points.js');
  assert.match(pts, /function verifyToken\(token\) \{\n  return require\('\.\/_session\.js'\)\.sessionUser\(token\);\n\}/, 'points.js');
  assert.doesNotMatch(pts, /createHmac|AUTH_SECRET/, 'points.js: لا تحقّق يدويّ ولا سرّ في نطاق الوحدة');
});

test('٢. تذكرة موقّعة بلا exp تُرفض في عدّاد الأدوات، والجلسة الحقيقيّة تمرّ', async () => {
  const car = require(path.join(root, 'api/_lib/_carUsage.js'));
  mock('api/_lib/auth.js', require(path.join(root, 'api/_lib/auth.js')));
  const noExp = sign({ u: 'victim', p: 1, h: 'x' });
  const expired = sign({ u: 'victim', exp: Date.now() - 1000 });
  const forged = noExp.slice(0, -2) + 'xx';
  for (const [name, tok] of [['بلا exp', noExp], ['منتهية', expired], ['توقيع مزوّر', forged], ['فارغة', ''], ['مشوّهة', 'a.b.c']]) {
    const r = await car.checkCarQuota(tok);
    assert.equal(r.allowed, false, name);
    assert.equal(r.reason, 'auth', name);
  }
  // جلسة صالحة: الاسم يُقرأ (المالك لا يُعدّ عليه — لا يحتاج KV)
  const ok = await car.checkCarQuota(sign({ u: 'omran', exp: Date.now() + 60000 }));
  assert.equal(ok.username, 'omran');
  assert.equal(ok.allowed, true);
});

test('٣. v-points-session: verifyPointsToken (مسارات الخصم كلّها) ترفض التذكرة بلا exp والمنتهية والمزوّرة، والجلسة الصالحة تمرّ', () => {
  mock('api/_lib/_vip.js', { isVip: async () => false });
  const { verifyPointsToken } = require(path.join(root, 'api/_lib/points.js'));
  const noExp = sign({ u: 'victim', p: 1, h: 'x' });
  for (const [name, tok] of [['بلا exp', noExp], ['منتهية', sign({ u: 'victim', exp: Date.now() - 1000 })], ['مزوّرة', noExp.slice(0, -2) + 'xx'], ['بلا اسم', sign({ exp: Date.now() + 60000 })], ['فارغة', '']]) {
    assert.equal(verifyPointsToken(tok), null, name);
  }
  assert.equal(verifyPointsToken(sign({ u: 'sara', exp: Date.now() + 60000 })), 'sara');
});
