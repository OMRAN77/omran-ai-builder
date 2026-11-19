'use strict';
/* tests/paid-ungranted.test.cjs — v-paid-ungranted (فحص Desloppify ٩ نوفمبر ٢٠٢٦، بند المال؛ موافقة المالك «ايه، ابدأ» ١٠ نوفمبر).
   دفعة Stripe وصلت ولم تُمنح (حساب محذوف أو غير موجود، جلسة مدفوعة بلا اسم، باقة لا نعرفها، تجديد بلا اسم) كانت سطرًا في سجلّ Vercel
   وردّ 200 — لا يراها أحد. الآن تنبيه للمالك. على الويب هوك الحقيقيّ موقَّعًا وgrantPlanToUser وpay-refund الحقيقيّة، وKV في الذاكرة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'paid-ungranted-secret';
process.env.UPSTASH_REDIS_REST_URL = 'http://فحص-محلّيّ';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_paid_ungranted';
delete process.env.STRIPE_SECRET_KEY; // لا شبكة Stripe: التجديد بلا اسم يبقى بلا اسم

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const kvApi = {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvIncr: async (k) => kvApi.kvIncrBy(k, 1),
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null),
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvExpire: async () => {},
  kvList: async (prefix) => [...kv.keys()].filter((k) => !prefix || k.startsWith(prefix)),
  kvPipeline: async (cmds) => { const out = []; for (const c of cmds) { if (c[0] === 'INCRBY') out.push(await kvApi.kvIncrBy(c[1], c[2])); else if (c[0] === 'SET') { kv.set(c[1], String(c[2])); out.push('OK'); } else out.push(null); } return out; },
};
mock('api/_lib/kv.js', kvApi);
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
const alerts = [];
mock('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { alerts.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });
global.fetch = async (url) => { throw new Error('لا شبكة في هذا الاختبار: ' + url); };

const auth = require(rp('api/_lib/auth.js'));
const webhook = require(rp('api/webhook.js'));
const points = require(rp('api/_lib/points.js'));

const mkRes = () => { const r = { code: 200, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (o) => { r.body = o; return r; }; r.end = () => r; r.setHeader = () => r; return r; };
async function hook(event) {
  const raw = Buffer.from(JSON.stringify(event));
  const req = Readable.from([raw]);
  req.method = 'POST';
  req.query = {};
  const t = Math.floor(Date.now() / 1000);
  req.headers = { 'stripe-signature': 't=' + t + ',v1=' + crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(t + '.' + raw.toString('utf8')).digest('hex') };
  const res = mkRes();
  await webhook(req, res);
  return res;
}
let seq = 0;
const evt = (type, object) => ({ id: 'evt_pu_' + (++seq), type, data: { object } });
const session = (o) => Object.assign({ id: 'cs_pu_' + (++seq), payment_status: 'paid', amount_total: 1000, currency: 'usd', payment_intent: 'pi_pu_' + seq }, o);

test('١. جلسة مدفوعة لحساب محذوف: تنبيه للمالك فيه الاسم والباقة والمبلغ ورقم الجلسة، والردّ 200 كما كان', async () => {
  kv.clear(); alerts.length = 0;
  await auth.putUser('gone', { username: 'gone', deleted: true });
  const s = session({ metadata: { username: 'gone', plan: 'basic' } });
  const r = await hook(evt('checkout.session.completed', s));
  assert.equal(r.code, 200);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /دفعة وصلت ولم تُمنح/);
  for (const part of ['gone', 'basic', '10.00 USD', s.id]) assert.ok(alerts[0].body.includes(part), part + ' في: ' + alerts[0].body);
});

test('٢. جلسة مدفوعة بلا اسم (رابط دفع بلا دخول) أو بباقة لا نعرفها: تنبيه بالسبب', async () => {
  kv.clear(); alerts.length = 0;
  await hook(evt('checkout.session.completed', session({ metadata: {} })));
  await auth.putUser('sara', { username: 'sara', hash: 'h', salt: 's', points: 0 });
  await hook(evt('checkout.session.completed', session({ metadata: { username: 'sara', plan: 'mega' } })));
  assert.equal(alerts.length, 2);
  assert.match(alerts[0].body, /بلا اسم/);
  assert.match(alerts[1].body, /باقة غير معروفة/);
});

test('٣. تجديد مدفوع بلا اسم يُنبَّه؛ تجديد بصفر ولا جلسة غير مدفوعة لا تنبيه', async () => {
  kv.clear(); alerts.length = 0;
  const inv = (o) => Object.assign({ id: 'in_pu_' + (++seq), billing_reason: 'subscription_cycle', amount_paid: 2000, currency: 'usd', lines: { data: [{ metadata: {} }] } }, o);
  await hook(evt('invoice.paid', inv({})));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /تجديد · بلا اسم/);
  assert.ok(alerts[0].body.includes('20.00 USD'));
  await hook(evt('invoice.paid', inv({ amount_paid: 0 })));
  await hook(evt('checkout.session.completed', session({ payment_status: 'unpaid', metadata: {} })));
  await hook(evt('invoice.paid', inv({ billing_reason: 'subscription_create' })));
  assert.equal(alerts.length, 1, 'لا إزعاج لما ليس دفعة ضائعة');
});

test('٤. المنح الناجح والمكرَّر بلا تنبيه، والنقاط تُضاف مرّة واحدة كما كانت', async () => {
  kv.clear(); alerts.length = 0;
  await auth.putUser('huda', { username: 'huda', hash: 'h', salt: 's', points: 0 });
  const s = session({ metadata: { username: 'huda', plan: 'basic' } });
  assert.equal((await hook(evt('checkout.session.completed', s))).code, 200);
  assert.equal((await hook(evt('checkout.session.completed', s))).code, 200);
  assert.equal((await points.readPoints('huda')).points, 360);
  assert.deepEqual(alerts, []);
});

test('٥. عطل قناة التنبيه لا يُسقط الويب هوك', async () => {
  kv.clear(); alerts.length = 0;
  const m = require.cache[rp('api/_lib/_owner-alert.js')].exports;
  const orig = m.pushToOwners;
  m.pushToOwners = async () => { throw new Error('VAPID down'); };
  try { assert.equal((await hook(evt('checkout.session.completed', session({ metadata: {} })))).code, 200); }
  finally { m.pushToOwners = orig; }
});
