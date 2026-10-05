// tests/maha-server-bill.test.cjs — v-maha-server-bill (فحص الاشتراكات ٥ أكتوبر ٢٠٢٦): الخادم كان يتأكّد من الرصيد ولا
// يخصم شيئًا، والمتصفّح يخصم بعد كلّ ٦٠ ثانية — فكلّ مكالمة أقلّ من دقيقة مجّانيّة للكلّ، والتجربة لا تُعلَّم «مستخدمة» إلّا
// بعد ٦٠ ثانية (من يغلق عند ٠:٥٩ تبقى تجربته للأبد ولو رصيده صفر). الآن الدقيقة الأولى تُدفع عند فتح الجلسة، والتجربة
// بحجز ذرّيّ مرّة بالعمر، وفشل فتح الجلسة عند المزوّد يردّها؛ والمتصفّح يخصم كلّ دقيقة تبدأ بعدها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'maha-server-bill-secret';
process.env.OPENAI_API_KEY = 'sk-test';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
mock('api/_lib/kv.js', {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await new Promise((r) => setImmediate(r)); if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvExpire: async () => {},
});
const users = new Map();
mock('api/_lib/auth.js', {
  getUser: async (u) => { await new Promise((r) => setImmediate(r)); return users.has(u) ? structuredClone(users.get(u)) : null; },
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: () => null,
});
mock('api/_lib/_vip.js', { isVip: async () => false });
mock('api/_lib/_usage.js', { checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {} });
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });

const points = require(rp('api/_lib/points.js'));
const media = require(rp('api/_lib/_mediaPlans.js'));
const handler = require(rp('api/_lib/realtime-session.js'));

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const bal = async (u) => (await points.readPoints(u)).points;
// مزوّد مزيّف ثابت للملفّ كلّه — الطلبان المتزامنان لا يتبادلان fetch الحقيقيّ. الفشل مفتاح عامّ (اختباراته متتالية).
let failNow = false;
let openedAll = 0;
global.fetch = async () => {
  openedAll++;
  return failNow ? new Response('{"error":{"message":"boom"}}', { status: 500 }) : new Response(JSON.stringify({ value: 'ek_test' }), { status: 200 });
};
async function mint(user, fail) {
  failNow = !!fail;
  const before = openedAll;
  const res = { code: 200, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send(b) { res.j = b; return res; }, end() { return res; } };
  await handler({ method: 'POST', headers: {}, socket: {}, body: { token: token(user), mode: 'assistant' } }, res);
  return { code: res.code, j: res.j, opened: openedAll - before };
}

test('١. المكالمة المدفوعة: الدقيقة الأولى تُخصم عند فتح الجلسة (كانت مجّانيّة حتّى الثانية ٦٠)', async () => {
  users.set('payer', { username: 'payer', points: 70, mahaTrialUsed: true });
  const r = await mint('payer');
  assert.equal(r.code, 200);
  assert.equal(r.j.mahaBudget.prepaid, 'points');
  assert.equal(await bal('payer'), 70 - points.COSTS.maha_minute);
  assert.equal(r.j.mahaBudget.points, 70 - points.COSTS.maha_minute);
});

test('٢. التجربة مرّة بالعمر تُعلَّم فورًا — والطلبان المتزامنان لا يأخذان تجربتين', async () => {
  users.set('newbie', { username: 'newbie', points: 70 });
  const [a, b] = await Promise.all([mint('newbie'), mint('newbie')]);
  const kinds = [a.j.mahaBudget.prepaid, b.j.mahaBudget.prepaid].sort();
  assert.deepEqual(kinds, ['points', 'trial'], 'تجربة وحدة والثاني مدفوع');
  assert.equal(users.get('newbie').mahaTrialUsed, true, 'مُعلَّمة في الخادم لا بعد ٦٠ ثانية في المتصفّح');
  assert.equal(await bal('newbie'), 70 - points.COSTS.maha_minute);
  const c = await mint('newbie');
  assert.equal(c.j.mahaBudget.prepaid, 'points', 'لا تجربة ثالثة');
});

test('٣. رصيد غير كافٍ وتجربة مستخدمة ← 402 بلا فتح جلسة عند المزوّد', async () => {
  users.set('broke', { username: 'broke', points: 5, mahaTrialUsed: true });
  const r = await mint('broke');
  assert.equal(r.code, 402);
  assert.equal(r.opened, 0);
  assert.equal(await bal('broke'), 5);
});

test('٤. فشل فتح الجلسة عند المزوّد يردّ الدقيقة (أو يعيد التجربة) — لا خصم بلا مكالمة', async () => {
  users.set('unlucky', { username: 'unlucky', points: 70, mahaTrialUsed: true });
  const r = await mint('unlucky', true);
  assert.notEqual(r.code, 200);
  assert.equal(await bal('unlucky'), 70);
  users.set('trialfail', { username: 'trialfail', points: 0 });
  await mint('trialfail', true);
  assert.equal(users.get('trialfail').mahaTrialUsed, false, 'التجربة عادت');
  assert.equal((await mint('trialfail')).j.mahaBudget.prepaid, 'trial');
});

test('٥. مشترك مها: الافتتاح من رصيد دقائقه (لا النقاط)، وحدّ المكالمة يصل المتصفّح', async () => {
  users.set('reem', { username: 'reem', points: 70, mahaTrialUsed: true, media: { maha: { plan: 'maha_basic', at: Date.now() } } });
  kv.set('media:maha:reem', String(media.MEDIA_PLANS.maha_basic.budget));
  const r = await mint('reem');
  assert.equal(r.j.mahaBudget.prepaid, 'media');
  assert.equal(r.j.mahaBudget.capMin, media.MAHA_CALL_CAP_MIN);
  assert.equal(kv.get('media:maha:reem'), String(media.MEDIA_PLANS.maha_basic.budget - 55));
  assert.equal(await bal('reem'), 70);
  await mint('reem', true);
  assert.equal(kv.get('media:maha:reem'), String(media.MEDIA_PLANS.maha_basic.budget - 55), 'الفاشلة تعود لرصيد مها نفسه');
});

test('٦. المتصفّح: كلّ نبضة تخصم الدقيقة التي تبدأ، ولا «maha-trial-used» بعد ٦٠ ثانية، والحدّ قبل الخصم', () => {
  const mc = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
  const meter = mc.slice(mc.indexOf('function mahaStartPointsMeter('), mc.indexOf('// v-maha-hide-composer'));
  assert.doesNotMatch(meter, /maha-trial-used/);
  assert.match(meter, /let callMin = budget\.prepaid === 'media' \? 1 : 0;/);
  const cap = meter.indexOf("if(capMin && callMin >= capMin){ endGently(true); return; }");
  assert.ok(cap > 0 && cap < meter.indexOf("action:'consume'"), 'الحدّ قبل خصم دقيقة جديدة');
});
