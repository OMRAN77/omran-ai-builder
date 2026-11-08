'use strict';
/* tests/owner-link-sub.test.cjs — v-owner-link-sub (٨ نوفمبر ٢٠٢٦).
   العرض: مشتركة دفعت ١٠$ في ٢٥ سبتمبر و٢٥ أكتوبر بلا دخول (قبل v-checkout-login) — اشتراكها في Stripe بلا metadata.username،
   فتجاهل الويب هوك الدفعتين وسيتجاهل كلّ تجديد. دخلت بحساب Google ولا اشتراك عليه.
   على المعالجات الحقيقيّة: admin-actions ← sub-link ← grantPlanToUser ← pay-refund، والويب هوك موقَّعًا (التجديد بعد الربط والاسترداد)،
   بـKV في الذاكرة بحجز ذرّيّ حقيقيّ (SET NX) وشبكة Stripe مزيّفة واحدة للملفّ بشكلَي الكائنات (قبل basil وbasil). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'link-sub-test-secret';
process.env.OWNER_USERNAME = 'boss';
process.env.UPSTASH_REDIS_REST_URL = 'http://فحص-محلّيّ';
process.env.STRIPE_SECRET_KEY = 'sk_test_link_sub';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_link_sub_test';

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV في الذاكرة: نصوص في خريطة واحدة، وSET NX حقيقيّ (حجز الدفعات وقفل الحساب) ──
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

// ── Stripe مزيّف: الاشتراكات والعملاء والجلسات والفواتير والشحنات والنيّات وinvoice_payments، وكلّ نداء مسجَّل ──
const net = { subs: {}, customers: {}, sessions: [], invoices: [], charges: {}, pis: {}, invoicePayments: {}, calls: [], failGet: null, failPost: 0 };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
global.fetch = async (url, init) => {
  const u = new URL(String(url));
  const method = (init && init.method) || 'GET';
  net.calls.push({ path: u.pathname.replace(/^\/v1\//, ''), search: u.search, method, body: init && init.body ? String(init.body) : '', auth: init && init.headers && init.headers.Authorization });
  if (u.hostname !== 'api.stripe.com') throw new Error('نداء غير Stripe: ' + url);
  const p = u.pathname.replace(/^\/v1\//, '');
  const q = (k) => u.searchParams.get(k);
  let m;
  if (method === 'POST') {
    if (net.failPost > 0) { net.failPost--; return reply(500, { error: { type: 'api_error' } }); }
    if ((m = p.match(/^subscriptions\/([^/]+)$/)) && net.subs[m[1]]) {
      const body = new URLSearchParams(String(init.body || ''));
      for (const [k, v] of body) { const mm = k.match(/^metadata\[(.+)\]$/); if (mm) net.subs[m[1]].metadata[mm[1]] = v; }
      return reply(200, net.subs[m[1]]);
    }
    return reply(404, { error: { message: 'No such subscription' } });
  }
  if (net.failGet && net.failGet.test(p)) return reply(500, { error: { type: 'api_error', message: 'An unknown error occurred' } });
  if ((m = p.match(/^subscriptions\/([^/]+)$/))) return net.subs[m[1]] ? reply(200, net.subs[m[1]]) : reply(404, { error: { message: 'No such subscription' } });
  if ((m = p.match(/^customers\/([^/]+)$/))) return net.customers[m[1]] ? reply(200, net.customers[m[1]]) : reply(404, {});
  if (p === 'checkout/sessions') return reply(200, { data: net.sessions.filter((s) => s.subscription === q('subscription')), has_more: false });
  if (p === 'invoices') {
    const sub = q('subscription');
    return reply(200, { data: net.invoices.filter((i) => (i.subscription || (i.parent && i.parent.subscription_details.subscription)) === sub && (!q('status') || i.status === q('status'))), has_more: false });
  }
  if (p === 'invoice_payments') return reply(200, { data: net.invoicePayments[q('invoice')] || [] });
  if ((m = p.match(/^charges\/([^/]+)$/))) return net.charges[m[1]] ? reply(200, net.charges[m[1]]) : reply(404, {});
  if ((m = p.match(/^payment_intents\/([^/]+)$/))) {
    const pi = net.pis[m[1]];
    if (!pi) return reply(404, {});
    const out = Object.assign({}, pi);
    if (q('expand[]') === 'latest_charge' && typeof pi.latest_charge === 'string') out.latest_charge = net.charges[pi.latest_charge] || pi.latest_charge;
    return reply(200, out);
  }
  return reply(404, { error: { message: 'unknown ' + p } });
};

const auth = require(rp('api/_lib/auth.js'));
const admin = require(rp('api/_lib/admin-actions.js'));
const webhook = require(rp('api/webhook.js'));
const points = require(rp('api/_lib/points.js'));
const tier = require(rp('api/_lib/tier.js'));
const { claimKey } = require(rp('api/_lib/create-checkout-session.js'));

const mkRes = () => { const r = { code: 0, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (o) => { r.body = o; return r; }; r.end = () => r; r.setHeader = () => r; return r; };
const callAdmin = async (body) => { const r = mkRes(); await admin({ method: 'POST', body }, r); return r; };
const owner = () => auth.makeToken('boss');
const link = (target, sub, extra) => callAdmin(Object.assign({ token: owner(), action: 'link-sub', targetUsername: target, subscriptionId: sub }, extra || {}));
const bal = async (u) => (await points.readPoints(u)).points;
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;
const posts = () => net.calls.filter((c) => c.method === 'POST');

async function hook(event) {
  const raw = Buffer.from(JSON.stringify(event));
  const req = Readable.from([raw]);
  req.method = 'POST';
  req.query = {};
  const t = nowSec();
  req.headers = { 'stripe-signature': 't=' + t + ',v1=' + crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(t + '.' + raw.toString('utf8')).digest('hex') };
  const res = mkRes();
  res.code = 200;
  await webhook(req, res);
  return res;
}
let seq = 0;
const evt = (type, object) => ({ id: 'evt_ls_' + (++seq), type, data: { object } });

/* اشتراك علياء كما في لوحة Stripe: بدأ قبل ٤٤ يومًا بجلسة دفع بلا اسم، وتجديد قبل ١٤ يومًا — الشكل قبل basil (payment_intent/charge على الفاتورة) */
const ALYA = 'aliya.alshamsi181@icloud.com';
const GKEY = 'g_' + ALYA;
function seedAlya(subId, opts) {
  const o = opts || {};
  const t1 = nowSec() - 44 * DAY, t2 = nowSec() - 14 * DAY;
  net.subs[subId] = { id: subId, object: 'subscription', status: o.status || 'active', customer: 'cus_' + subId, metadata: Object.assign({ plan: 'basic' }, o.md || {}) };
  net.customers['cus_' + subId] = { id: 'cus_' + subId, email: o.customerEmail || ALYA };
  net.sessions.push({ id: 'cs_' + subId, object: 'checkout.session', status: 'complete', payment_status: 'paid', subscription: subId, invoice: 'in_' + subId + '_1', payment_intent: null, amount_total: 1000, currency: 'usd', created: t1, metadata: { plan: 'basic' }, customer_details: { email: ALYA } });
  net.invoices.push({ id: 'in_' + subId + '_1', status: 'paid', subscription: subId, billing_reason: 'subscription_create', amount_paid: 1000, currency: 'usd', created: t1, payment_intent: 'pi_' + subId + '_1', charge: 'ch_' + subId + '_1' });
  net.invoices.push({ id: 'in_' + subId + '_2', status: 'paid', subscription: subId, billing_reason: 'subscription_cycle', amount_paid: 1000, currency: 'usd', created: t2, payment_intent: 'pi_' + subId + '_2', charge: 'ch_' + subId + '_2' });
  for (const n of [1, 2]) net.charges['ch_' + subId + '_' + n] = Object.assign({ id: 'ch_' + subId + '_' + n, object: 'charge', amount: 1000, amount_refunded: 0, refunded: false, disputed: false, payment_intent: 'pi_' + subId + '_' + n }, (o.charge && o.charge[n]) || {});
}
async function googleUser(key, email, pts) {
  await auth.putUser(key, { username: key, email, googleAuth: true, points: pts === undefined ? 0 : pts, createdAt: Date.now() });
}

test('١. الفحص بلا تأكيد: الحساب من إيميل Google، والدفعتان ستُضافان (٧٢٠ نقطة)، ولا كتابة في Stripe ولا في الحساب ولا حجز', async () => {
  seedAlya('sub_ALYA0001');
  await googleUser(GKEY, ALYA, 0);
  const before = JSON.stringify([...kv.entries()].filter(([k]) => !k.startsWith('db/users/')));
  net.calls.length = 0;
  const r = await link(' Aliya.Alshamsi181@iCloud.com ', 'sub_ALYA0001');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.dryRun, true);
  assert.equal(r.body.username, GKEY);
  assert.equal(r.body.accountEmail, ALYA);
  assert.equal(r.body.customerEmail, ALYA);
  assert.equal(r.body.plan, 'basic');
  assert.match(r.body.planLabel, /^Plus/);
  assert.equal(r.body.toGrant, 2);
  assert.equal(r.body.points, 720);
  assert.deepEqual(r.body.payments.map((p) => [p.kind, p.id, p.state]), [['first', 'cs_sub_ALYA0001', 'grant'], ['renewal', 'in_sub_ALYA0001_2', 'grant']]);
  assert.equal(posts().length, 0, 'لا POST في الفحص');
  assert.ok(net.calls.every((c) => c.auth === 'Bearer sk_test_link_sub'));
  assert.equal(JSON.stringify([...kv.entries()].filter(([k]) => !k.startsWith('db/users/'))), before, 'لا حجز ولا نقاط ولا سجلّ منح');
  assert.equal((await auth.getUser(GKEY)).plan, undefined);
});

test('٢. التأكيد: الاسم على الاشتراك أوّلًا، ثمّ الدفعتان بمفتاحي الويب هوك وأرقامهما — +٧٢٠ والباقة سارية؛ والضغط ثانيةً لا يضيف شيئًا', async () => {
  net.calls.length = 0;
  const r = await link(ALYA, 'sub_ALYA0001', { confirm: true });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.granted, 2);
  assert.equal(r.body.pointsAdded, 720);
  const p = posts();
  assert.equal(p.length, 1);
  assert.equal(p[0].path, 'subscriptions/sub_ALYA0001');
  assert.equal(new URLSearchParams(p[0].body).get('metadata[username]'), GKEY);
  assert.ok(net.calls.indexOf(p[0]) < net.calls.length, 'POST قبل المنح');
  assert.equal(net.subs.sub_ALYA0001.metadata.username, GKEY);
  assert.equal(net.subs.sub_ALYA0001.metadata.plan, 'basic', 'الخطّة باقية');
  const u = await auth.getUser(GKEY);
  assert.equal(u.plan, 'basic');
  assert.ok(tier.planActive(u), 'الباقة سارية الآن');
  assert.equal(u.lastStripeSessionId, 'cs_sub_ALYA0001');
  assert.equal(u.lastStripeInvoiceId, 'in_sub_ALYA0001_2');
  assert.equal(await bal(GKEY), 720);
  assert.equal(kv.get(claimKey('lastStripeSessionId', 'cs_sub_ALYA0001')), GKEY);
  assert.equal(kv.get(claimKey('lastStripeInvoiceId', 'in_sub_ALYA0001_2')), GKEY);
  const rec = JSON.parse(kv.get('payrec:cs_sub_ALYA0001'));
  for (const ref of ['in_sub_ALYA0001_1', 'pi_sub_ALYA0001_1', 'ch_sub_ALYA0001_1']) assert.ok(rec.refs.includes(ref), 'سجلّ المنح يحمل ' + ref);
  assert.equal(rec.amount, 1000);
  const rec2 = JSON.parse(kv.get('payrec:in_sub_ALYA0001_2')); // التجديد: استرداده يصل برقم شحنته أو نيّته
  assert.ok(rec2.refs.includes('pi_sub_ALYA0001_2') && rec2.refs.includes('ch_sub_ALYA0001_2'));
  assert.equal(kv.get('payref:ch_sub_ALYA0001_2'), 'in_sub_ALYA0001_2');

  net.calls.length = 0;
  const again = await link(ALYA, 'sub_ALYA0001');
  assert.equal(again.body.toGrant, 0);
  assert.equal(again.body.linkedTo, GKEY);
  assert.deepEqual(again.body.payments.map((x) => x.state), ['already', 'already']);
  const twice = await link(ALYA, 'sub_ALYA0001', { confirm: true });
  assert.equal(twice.code, 200);
  assert.equal(twice.body.pointsAdded, 0);
  assert.equal(posts().length, 0, 'مربوط من قبل: لا POST ثانٍ');
  assert.equal(await bal(GKEY), 720, 'لا شحن مرّتين');
});

test('٣. بعد الربط: التجديد القادم يُشحن وحده بالويب هوك (الاسم صار على الاشتراك)، واسترداد الدفعة الأولى يجد سجلّها ويسحب نقاطها', async () => {
  const md = Object.assign({}, net.subs.sub_ALYA0001.metadata); // ما سينسخه Stripe إلى فاتورة التجديد
  const renew = await hook(evt('invoice.paid', { id: 'in_sub_ALYA0001_3', billing_reason: 'subscription_cycle', payment_intent: 'pi_sub_ALYA0001_3', charge: 'ch_sub_ALYA0001_3', amount_paid: 1000, currency: 'usd', subscription_details: { metadata: md } }));
  assert.equal(renew.code, 200);
  assert.equal(await bal(GKEY), 1080, 'التجديد شُحن تلقائيًّا');
  const refund = await hook(evt('charge.refunded', { id: 'ch_sub_ALYA0001_1', object: 'charge', payment_intent: 'pi_sub_ALYA0001_1', amount: 1000, amount_refunded: 1000, refunded: true, currency: 'usd', created: nowSec() }));
  assert.equal(refund.code, 200);
  assert.equal(await bal(GKEY), 720, 'نقاط الدفعة المستردّة سُحبت بسجلّ المنح الذي كتبه الربط');
});

test('٤. دفعة مستردّة أو عليها اعتراض قبل الربط لا تُضاف، والباقي يُضاف', async () => {
  seedAlya('sub_REFUND01', { charge: { 2: { refunded: true, amount_refunded: 1000 } } });
  seedAlya('sub_DISPUTE1', { charge: { 1: { disputed: true } } });
  await googleUser('g_r@x.com', 'r@x.com', 0);
  const a = await link('r@x.com', 'sub_REFUND01');
  assert.deepEqual(a.body.payments.map((p) => p.state), ['grant', 'refunded']);
  const b = await link('r@x.com', 'sub_DISPUTE1');
  assert.deepEqual(b.body.payments.map((p) => p.state), ['refunded', 'grant']);
  seedAlya('sub_PARTIAL1', { charge: { 2: { refunded: false, amount_refunded: 500 } } }); // استرداد جزئيّ قبل الربط: يُترك للمالك كما يفعل pay-refund
  const part = await link('r@x.com', 'sub_PARTIAL1');
  assert.deepEqual(part.body.payments.map((p) => p.state), ['grant', 'refunded']);
  const c = await link('r@x.com', 'sub_REFUND01', { confirm: true });
  assert.equal(c.body.pointsAdded, 360);
  assert.equal(await bal('g_r@x.com'), 360);
  assert.equal(kv.get(claimKey('lastStripeInvoiceId', 'in_sub_REFUND01_2')), undefined, 'المستردّة بلا حجز');
});

test('٥. مربوط بحساب حيّ آخر ٤٠٩ بلا أيّ كتابة؛ واسم على الاشتراك لا حساب له يُربط ويُظهَر للمالك', async () => {
  seedAlya('sub_TAKEN001', { md: { username: 'sara' } });
  await auth.putUser('sara', { username: 'sara', hash: 'h', salt: 's', points: 5 });
  await googleUser('g_t@x.com', 't@x.com', 0);
  net.calls.length = 0;
  const r = await link('t@x.com', 'sub_TAKEN001', { confirm: true });
  assert.equal(r.code, 409);
  assert.deepEqual(r.body, { error: 'linked_other', username: 'sara' });
  assert.equal(posts().length, 0);
  assert.equal(await bal('g_t@x.com'), 0);

  seedAlya('sub_GHOST001', { md: { username: 'nobody_here' } });
  const g = await link('t@x.com', 'sub_GHOST001');
  assert.equal(g.code, 200);
  assert.equal(g.body.previous, 'nobody_here');
  assert.equal(g.body.linkedTo, null);
});

test('٦. المالك وحده، ورقم اشتراك بصيغة sub_ وحدها، والغائب ٤٠٤، وبلا خطّة ٤٢٢ — كلّها بلا POST', async () => {
  seedAlya('sub_OWNONLY1');
  await googleUser('g_o@x.com', 'o@x.com', 0);
  net.calls.length = 0;
  for (const token of [auth.makeToken('g_o@x.com'), undefined, 'مزوّر.لا.يفكّ']) {
    const r = await callAdmin({ token, action: 'link-sub', targetUsername: 'o@x.com', subscriptionId: 'sub_OWNONLY1', confirm: true });
    assert.equal(r.code, 403);
  }
  assert.equal(net.calls.length, 0, 'غير المالك: لا نداء Stripe');
  for (const bad of ['', 'cus_123456', 'sub_', 'sub_12', 'sub_abc/../x', 'https://dashboard.stripe.com/subscriptions/sub_ALYA0001']) {
    assert.equal((await link('o@x.com', bad)).code, 400, bad);
  }
  assert.equal(net.calls.length, 0);
  assert.equal((await link('o@x.com', 'sub_MISSING01')).code, 404);
  net.subs.sub_NOPLAN01 = { id: 'sub_NOPLAN01', object: 'subscription', status: 'active', customer: null, metadata: {} };
  assert.equal((await link('o@x.com', 'sub_NOPLAN01')).code, 422);
  assert.equal((await link('nobody@x.com', 'sub_OWNONLY1')).code, 404, 'إيميل بلا حساب');
  await auth.putUser('boss', { username: 'boss', hash: 'h', salt: 's' });
  assert.equal((await link('boss', 'sub_OWNONLY1')).code, 400, 'لا على حساب المالك');
  assert.equal(posts().length, 0);
});

test('٧. عطب قراءة Stripe ٥٠٢ قبل أيّ أثر؛ وفشل كتابة الاسم ٥٠٢ بلا منح، ثمّ الضغط ثانيةً يكمل', async () => {
  seedAlya('sub_FAIL0001');
  await googleUser('g_f@x.com', 'f@x.com', 0);
  net.failGet = /^invoices$/;
  const r = await link('f@x.com', 'sub_FAIL0001', { confirm: true });
  net.failGet = null;
  assert.equal(r.code, 502);
  assert.equal(r.body.error, 'stripe_error');
  assert.equal(net.subs.sub_FAIL0001.metadata.username, undefined);
  assert.equal(await bal('g_f@x.com'), 0);

  net.failPost = 1;
  const w = await link('f@x.com', 'sub_FAIL0001', { confirm: true });
  assert.equal(w.code, 502);
  assert.equal(w.body.error, 'stripe_write_failed');
  assert.equal(await bal('g_f@x.com'), 0, 'لا منح قبل الاسم');
  assert.equal(kv.get(claimKey('lastStripeSessionId', 'cs_sub_FAIL0001')), undefined);
  const ok = await link('f@x.com', 'sub_FAIL0001', { confirm: true });
  assert.equal(ok.code, 200);
  assert.equal(await bal('g_f@x.com'), 720);
});

test('٨. شكل basil: فاتورة بلا subscription/payment_intent/charge (parent وinvoice_payments)، واشتراك بلا جلسة دفع — Pro بـ٩٢٠ لكلّ دفعة', async () => {
  const t1 = nowSec() - 40 * DAY, t2 = nowSec() - 10 * DAY;
  net.subs.sub_BASIL001 = { id: 'sub_BASIL001', object: 'subscription', status: 'active', customer: 'cus_B', metadata: { plan: 'pro' } };
  net.customers.cus_B = { id: 'cus_B', email: 'b@x.com' };
  const par = { subscription_details: { subscription: 'sub_BASIL001', metadata: { plan: 'pro' } } };
  net.invoices.push({ id: 'in_B1', status: 'paid', parent: par, billing_reason: 'subscription_create', amount_paid: 2000, currency: 'aed', created: t1 });
  net.invoices.push({ id: 'in_B2', status: 'paid', parent: par, billing_reason: 'subscription_cycle', amount_paid: 2000, currency: 'aed', created: t2 });
  net.invoices.push({ id: 'in_B3', status: 'paid', parent: par, billing_reason: 'subscription_update', amount_paid: 300, currency: 'aed', created: t2 + 5 });
  net.invoicePayments.in_B1 = [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_B1' } }];
  net.invoicePayments.in_B2 = [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_B2' } }];
  net.pis.pi_B1 = { id: 'pi_B1', latest_charge: 'ch_B1' };
  net.pis.pi_B2 = { id: 'pi_B2', latest_charge: 'ch_B2' };
  net.charges.ch_B1 = { id: 'ch_B1', refunded: false, amount_refunded: 0, disputed: false, payment_intent: 'pi_B1' };
  net.charges.ch_B2 = { id: 'ch_B2', refunded: false, amount_refunded: 0, disputed: false, payment_intent: 'pi_B2' };
  await auth.putUser('basil_user', { username: 'basil_user', hash: 'h', salt: 's', points: 70 });
  const d = await link('Basil_User', 'sub_BASIL001');
  assert.deepEqual(d.body.payments.map((p) => [p.kind, p.id, p.state]), [['first', 'in_B1', 'grant'], ['renewal', 'in_B2', 'grant']], 'فاتورة تعديل الخطّة لا تُحسب (الويب هوك لا يشحنها)');
  const c = await link('basil_user', 'sub_BASIL001', { confirm: true });
  assert.equal(c.body.pointsAdded, 1840);
  assert.equal(await bal('basil_user'), 70 + 1840);
  const rec = JSON.parse(kv.get('payrec:in_B1'));
  assert.ok(rec.refs.includes('pi_B1') && rec.refs.includes('ch_B1'));
  assert.equal(rec.currency, 'aed');
});

test('٩. ملغى: لا كتابة اسم (لا تجديد بعده) والدفعات المدفوعة تُضاف؛ ودفعة لا تُعرف شحنتها لا تُضاف؛ والاسم المغيَّر يُتبع', async () => {
  seedAlya('sub_CANCEL01', { status: 'canceled' });
  await auth.putUser('old_name', { username: 'old_name', deleted: true, movedTo: 'new_name' });
  await auth.putUser('new_name', { username: 'new_name', hash: 'h', salt: 's', points: 0 });
  net.calls.length = 0;
  const r = await link('old_name', 'sub_CANCEL01', { confirm: true });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.username, 'new_name');
  assert.equal(posts().length, 0, 'ملغى: لا POST');
  assert.equal(await bal('new_name'), 720);

  seedAlya('sub_NOCHG001');
  delete net.charges.ch_sub_NOCHG001_2;
  net.invoices.find((i) => i.id === 'in_sub_NOCHG001_2').charge = null;
  net.invoices.find((i) => i.id === 'in_sub_NOCHG001_2').payment_intent = null;
  const u = await link('new_name', 'sub_NOCHG001');
  assert.deepEqual(u.body.payments.map((p) => p.state), ['grant', 'unverified']);
});

/* ---------- الواجهة: الخانتان والزرّ ودالّته الحقيقيّة من app-01 في vm ---------- */
const { dictFor, clientSlice } = require('./_owner-vm.cjs');
const { makeDom } = require('./_mini-dom.cjs');
function uiEnv(lang, answers, replies) {
  const { document } = makeDom();
  ['adminStatsBox', 'adminUsersTable', 'adminClaudeDiagBox', 'vipListBox'].forEach((id) => { const e = document.createElement('div'); e.id = id; document.body.appendChild(e); });
  const said = [], sent = [];
  const queue = replies.slice();
  const ctx = {
    document, curT: () => dictFor(lang), authGet: () => 'tok', __swallow() {},
    confirm: (m) => { said.push(['confirm', m]); return answers.shift(); }, alert: (m) => said.push(['alert', m]), prompt: () => null,
    fetch: async (url, init) => { sent.push(JSON.parse(init.body)); const [status, body] = queue.shift(); return { ok: status < 400, status, json: async () => body }; },
  };
  ctx.window = ctx;
  clientSlice('js/app-01-boot-auth.js', '  /* v-owner-i18n', '  function setAuthToggleUI(loggedIn){', ctx);
  const field = (id, v) => { const e = document.createElement('input'); e.id = id; e.value = v; document.body.appendChild(e); };
  return { ctx, said, sent, field };
}
const DRY = { ok: true, dryRun: true, username: GKEY, accountEmail: ALYA, customerEmail: ALYA, subscription: 'sub_ALYA0001', status: 'active', plan: 'basic', planLabel: 'Plus — 360 pts', linkedTo: null, previous: null, payments: [{ state: 'grant' }, { state: 'grant' }], toGrant: 2, points: 720 };

test('١٠. الواجهة: الخانتان قبل جدول المستخدمين، والفحص ثمّ التأكيد بالإيميلين والنقاط، والرفض لا ينفّذ، والموافقة ترسل confirm:true', async () => {
  const partial = require('fs').readFileSync(path.join(root, 'js/partials-settings.js'), 'utf8');
  const a = partial.indexOf('id="adminLinkUserInput"'), b = partial.indexOf('id="adminLinkSubInput"'), t = partial.indexOf('id="adminUsersTable"');
  assert.ok(a > 0 && b > a && b < t, 'الخانتان قبل الجدول');
  assert.match(partial, /onclick="adminLinkSubscription\(\)"[^>]*>🔗 <span data-i18n="ownerLinkSubBtn">/);

  const no = uiEnv('ar', [false], [[200, DRY]]);
  no.field('adminLinkUserInput', '  ' + ALYA + ' '); no.field('adminLinkSubInput', ' sub_ALYA0001 ');
  await no.ctx.adminLinkSubscription();
  assert.equal(no.sent.length, 1);
  assert.deepEqual(no.sent[0], { token: 'tok', action: 'link-sub', targetUsername: ALYA, subscriptionId: 'sub_ALYA0001', confirm: false });
  const msg = no.said.find((x) => x[0] === 'confirm')[1];
  for (const part of [ALYA, 'sub_ALYA0001', '720', 'Plus']) assert.ok(msg.includes(part), 'التأكيد يذكر ' + part);
  assert.ok(!/⚠️/.test(msg), 'الإيميلان متطابقان: لا تحذير');

  const yes = uiEnv('en', [true], [[200, DRY], [200, Object.assign({}, DRY, { dryRun: undefined, granted: 2, pointsAdded: 720, linked: true })]]);
  yes.field('adminLinkUserInput', ALYA); yes.field('adminLinkSubInput', 'sub_ALYA0001');
  await yes.ctx.adminLinkSubscription();
  assert.equal(yes.sent.length, 2);
  assert.equal(yes.sent[1].confirm, true);
  const done = yes.said.find((x) => x[0] === 'alert');
  assert.ok(done && /720/.test(done[1]) && done[1].includes(GKEY), done && done[1]);
});

test('١١. الواجهة: رقم بلا sub_ لا يُرسل، والإيميلان المختلفان تحذير، والمربوط بغيره والغائب والجزئيّ برسائل مترجمة', async () => {
  const bad = uiEnv('ar', [], []);
  bad.field('adminLinkUserInput', ALYA); bad.field('adminLinkSubInput', 'cus_123');
  await bad.ctx.adminLinkSubscription();
  assert.equal(bad.sent.length, 0);
  assert.ok(bad.said.some((x) => x[0] === 'alert' && x[1].includes('sub_')));

  const mm = uiEnv('ar', [false], [[200, Object.assign({}, DRY, { customerEmail: 'other@x.com', previous: 'ghost', payments: [{ state: 'grant' }, { state: 'refunded' }], toGrant: 1, points: 360 })]]);
  mm.field('adminLinkUserInput', ALYA); mm.field('adminLinkSubInput', 'sub_ALYA0001');
  await mm.ctx.adminLinkSubscription();
  const m2 = mm.said.find((x) => x[0] === 'confirm')[1];
  assert.match(m2, /⚠️/);
  assert.ok(m2.includes('ghost') && m2.includes('other@x.com'));

  const taken = uiEnv('ar', [], [[409, { error: 'linked_other', username: 'sara' }]]);
  taken.field('adminLinkUserInput', ALYA); taken.field('adminLinkSubInput', 'sub_ALYA0001');
  await taken.ctx.adminLinkSubscription();
  assert.ok(taken.said.some((x) => x[0] === 'alert' && x[1].includes('sara')));
  assert.equal(taken.said.filter((x) => x[0] === 'confirm').length, 0);

  const nosub = uiEnv('ar', [], [[404, { error: 'subscription not found' }]]);
  nosub.field('adminLinkUserInput', ALYA); nosub.field('adminLinkSubInput', 'sub_ALYA0001');
  await nosub.ctx.adminLinkSubscription();
  assert.ok(nosub.said.some((x) => x[0] === 'alert' && x[1].includes('Stripe')));

  const nothing = uiEnv('ar', [], [[200, Object.assign({}, DRY, { linkedTo: GKEY, toGrant: 0, points: 0, payments: [{ state: 'already' }] })]]);
  nothing.field('adminLinkUserInput', ALYA); nothing.field('adminLinkSubInput', 'sub_ALYA0001');
  await nothing.ctx.adminLinkSubscription();
  assert.equal(nothing.said.filter((x) => x[0] === 'confirm').length, 0, 'لا شيء يُضاف: لا تأكيد');
  assert.ok(nothing.said.some((x) => x[0] === 'alert' && x[1].startsWith('✅')));

  const part = uiEnv('ar', [true], [[200, DRY], [500, Object.assign({}, DRY, { ok: false, error: 'partial', detail: 'busy', granted: 1, pointsAdded: 360 })]]);
  part.field('adminLinkUserInput', ALYA); part.field('adminLinkSubInput', 'sub_ALYA0001');
  await part.ctx.adminLinkSubscription();
  const pa = part.said.filter((x) => x[0] === 'alert').pop()[1];
  assert.ok(pa.includes('360') && pa.includes('busy'), pa);
});

/* ---------- المراجعة العدائيّة (مؤكَّدة بتجارب): كلّ إصلاح باختبار يحمرّ لو عاد الخطأ ---------- */
test('١٢. لا شحن مرّتين لما شحنه الويب هوك قبل v-pay-once (بلا حجز): نسخة Stripe تحمل الاسم ← «مضافة من قبل»؛ اسم ميّت ← «تُراجع»؛ أقدم من ٣٩٥ يومًا ← «قديمة»؛ ودفعة شُحنت لحساب حيّ آخر ← ٤٠٩', async () => {
  // bob اشترك مسجَّلًا قبل ٥ أكتوبر: الويب هوك شحن الجلسة والتجديد بلا حجز، ونسختاهما تحملان اسمه
  seedAlya('sub_PRE00001', { md: { username: 'bob' } });
  net.sessions.find((x) => x.id === 'cs_sub_PRE00001').metadata.username = 'bob';
  for (const i of net.invoices.filter((x) => x.subscription === 'sub_PRE00001')) i.subscription_details = { metadata: { plan: 'basic', username: 'bob' } };
  await auth.putUser('bob', { username: 'bob', hash: 'h', salt: 's', points: 720, lastStripeInvoiceId: 'in_sub_PRE00001_2' });
  const pre = await link('bob', 'sub_PRE00001');
  assert.equal(pre.code, 200);
  assert.deepEqual(pre.body.payments.map((p) => p.state), ['already', 'already'], 'كانت grant وتُشحن ثانيةً');
  assert.equal(pre.body.toGrant, 0);
  const preC = await link('bob', 'sub_PRE00001', { confirm: true });
  assert.equal(preC.body.pointsAdded, 0);
  assert.equal(await bal('bob'), 720);

  // جلسة باسم حساب لا وجود له (حاول الويب هوك ورجع ٤٠٤): لا تُضاف تلقائيًّا
  seedAlya('sub_DEADSN01');
  net.sessions.find((x) => x.id === 'cs_sub_DEADSN01').metadata.username = 'ghost_user';
  await googleUser('g_d@x.com', 'd@x.com', 0);
  const dead = await link('d@x.com', 'sub_DEADSN01');
  assert.deepEqual(dead.body.payments.map((p) => p.state), ['review', 'grant']);

  // أثرها على الحساب نفسه (lastStripeInvoiceId) بلا حجز ولا سجلّ ولا اسم في النسخة: شُحنت له — لا تُشحن ثانيةً
  seedAlya('sub_TRACE001');
  await auth.putUser('traced', { username: 'traced', hash: 'h', salt: 's', points: 0, lastStripeInvoiceId: 'in_sub_TRACE001_2' });
  const tr = await link('traced', 'sub_TRACE001');
  assert.deepEqual(tr.body.payments.map((p) => p.state), ['grant', 'already']);

  // أقدم من عمر الحجز: لا يُثبت أنّه لم يُشحن
  seedAlya('sub_OLD00001');
  net.invoices.find((x) => x.id === 'in_sub_OLD00001_2').created = nowSec() - 400 * DAY;
  const old = await link('d@x.com', 'sub_OLD00001');
  assert.equal(old.body.payments.find((p) => p.id === 'in_sub_OLD00001_2').state, 'old');

  // شُحنت جلسته لحساب حيّ آخر (حجز باسمه): لا يُقسَم الاشتراك بين حسابين
  seedAlya('sub_SPLIT001');
  await auth.putUser('other_acct', { username: 'other_acct', hash: 'h', salt: 's', points: 0 });
  kv.set(claimKey('lastStripeSessionId', 'cs_sub_SPLIT001'), 'other_acct');
  net.calls.length = 0;
  const split = await link('d@x.com', 'sub_SPLIT001', { confirm: true });
  assert.equal(split.code, 409);
  assert.equal(split.body.username, 'other_acct');
  assert.equal(posts().length, 0);
  assert.equal(await bal('g_d@x.com'), 0);
});

test('١٣. باقة سارية أعلى (Pro اشتُريت أمس) تبقى: النقاط وحدها تُضاف، واسترداد الدفعة المضافة يسحب نقاطها ولا يُسقط Pro', async () => {
  seedAlya('sub_KEEP0001');
  const yesterday = Date.now() - DAY * 1000;
  await auth.putUser('prouser', { username: 'prouser', hash: 'h', salt: 's', points: 920, plan: 'pro', planUpdatedAt: yesterday, planPayId: 'cs_pro_yesterday' });
  const d = await link('prouser', 'sub_KEEP0001');
  assert.equal(d.body.accountPlan, 'pro');
  assert.equal(d.body.keepPlan, true);
  const c = await link('prouser', 'sub_KEEP0001', { confirm: true });
  assert.equal(c.body.pointsAdded, 720);
  let u = await auth.getUser('prouser');
  assert.equal(u.plan, 'pro', 'Pro باقية (كانت تصير basic)');
  assert.equal(u.planUpdatedAt, yesterday);
  assert.equal(u.planPayId, 'cs_pro_yesterday');
  assert.equal(await bal('prouser'), 1640);
  const r = await hook(evt('charge.refunded', { id: 'ch_sub_KEEP0001_1', object: 'charge', payment_intent: 'pi_sub_KEEP0001_1', amount: 1000, amount_refunded: 1000, refunded: true, currency: 'usd', created: nowSec() }));
  assert.equal(r.code, 200);
  u = await auth.getUser('prouser');
  assert.equal(u.plan, 'pro');
  assert.ok(tier.planActive(u), 'Pro سارية بعد الاسترداد');
  assert.equal(await bal('prouser'), 1280, 'نقاط الدفعة المستردّة وحدها سُحبت');

  // باقة أدنى سارية (basic) وربط Pro: الدفعة المتأخّرة ترقّي — دفع ثمن Pro
  seedAlya('sub_UPGR0001', { md: { plan: 'pro' } });
  await auth.putUser('basicuser', { username: 'basicuser', hash: 'h', salt: 's', points: 0, plan: 'basic', planUpdatedAt: yesterday, planPayId: 'cs_b' });
  const up = await link('basicuser', 'sub_UPGR0001');
  assert.equal(up.body.keepPlan, false);
  await link('basicuser', 'sub_UPGR0001', { confirm: true });
  assert.equal((await auth.getUser('basicuser')).plan, 'pro');
});

test('١٤. البريد ← من أثبته أوّلًا: حساب Google قبل فهرس غير مؤكَّد؛ وغير المؤكَّد وحده يُعلَّم فيُحذَّر المالك', async () => {
  seedAlya('sub_RESOLV01');
  await auth.putUser('mallory', { username: 'mallory', hash: 'h', salt: 's', email: 'm@x.com', points: 0 });
  kv.set('db/email-index/m@x.com', JSON.stringify({ username: 'mallory' }));
  await googleUser('g_m@x.com', 'm@x.com', 0);
  const g = await link('m@x.com', 'sub_RESOLV01');
  assert.equal(g.body.username, 'g_m@x.com', 'كانت mallory (فهرس بلا تأكيد) قبل حساب Google');
  assert.equal(g.body.accountEmailVerified, true);
  await auth.putUser('mallory2', { username: 'mallory2', hash: 'h', salt: 's', email: 'u@x.com', points: 0 });
  kv.set('db/email-index/u@x.com', JSON.stringify({ username: 'mallory2' }));
  const u = await link('u@x.com', 'sub_RESOLV01');
  assert.equal(u.body.username, 'mallory2');
  assert.equal(u.body.accountEmailVerified, false);
});

test('١٥. الويب هوك بعد الربط بكلّ الأشكال: basil (parent)، ونسخة مجمَّدة بلا اسم والسطر يحمله، وبلا اسم في الفاتورة ← الاشتراك الآن؛ وبلا اسم أبدًا لا شحن؛ وعطب Stripe ٥٠٠ فيُعاد', async () => {
  let before = await bal(GKEY);
  const inv = (id, extra) => evt('invoice.paid', Object.assign({ id, billing_reason: 'subscription_cycle', amount_paid: 1000, currency: 'usd', payments: { data: [{ payment: { payment_intent: 'pi_' + id, charge: 'ch_' + id } }] } }, extra));
  const basil = await hook(inv('in_w_basil', { parent: { subscription_details: { subscription: 'sub_ALYA0001', metadata: { plan: 'basic', username: GKEY } } }, lines: { data: [{ metadata: {} }] } }));
  assert.equal(basil.code, 200);
  assert.equal(await bal(GKEY), before + 360, 'basil: الاسم في parent.subscription_details');
  before += 360;
  const frozen = await hook(inv('in_w_frozen', { subscription: 'sub_ALYA0001', subscription_details: { metadata: { plan: 'basic' } }, lines: { data: [{ metadata: { plan: 'basic', username: GKEY } }] } }));
  assert.equal(frozen.code, 200);
  assert.equal(await bal(GKEY), before + 360, 'نسخة أُصدرت قبل الربط بلا اسم: الاسم من السطر');
  before += 360;
  net.calls.length = 0;
  const live = await hook(inv('in_w_live', { subscription: 'sub_ALYA0001', subscription_details: { metadata: { plan: 'basic' } }, lines: { data: [{ metadata: {} }] } }));
  assert.equal(live.code, 200);
  assert.equal(await bal(GKEY), before + 360, 'لا اسم في الفاتورة: من الاشتراك الآن');
  assert.ok(net.calls.some((c) => c.path === 'subscriptions/sub_ALYA0001' && c.method === 'GET'));
  before += 360;
  const none = await hook(inv('in_w_none', { subscription: 'sub_NOCHG001', subscription_details: { metadata: { plan: 'basic' } } }));
  assert.equal(none.code, 200);
  assert.equal(await bal(GKEY), before, 'اشتراك لم يُربط: لا شحن لأحد');
  net.failGet = /^subscriptions\//;
  const down = await hook(inv('in_w_down', { subscription: 'sub_ALYA0001', subscription_details: { metadata: { plan: 'basic' } } }));
  net.failGet = null;
  assert.equal(down.code, 500, 'عطب عابر: يُعاد الحدث لا يُبتلع');
  const retry = await hook(inv('in_w_down', { subscription: 'sub_ALYA0001', subscription_details: { metadata: { plan: 'basic' } } }));
  assert.equal(retry.code, 200);
  assert.equal(await bal(GKEY), before + 360);
});

test('١٦. التأكيد على حساب غير الذي وافق عليه المالك ٤٠٩ بلا أيّ كتابة', async () => {
  seedAlya('sub_EXPECT01');
  await googleUser('g_e@x.com', 'e@x.com', 0);
  net.calls.length = 0;
  const r = await link('e@x.com', 'sub_EXPECT01', { confirm: true, expect: 'g_someone_else@x.com' });
  assert.equal(r.code, 409);
  assert.equal(r.body.error, 'target_changed');
  assert.equal(posts().length, 0);
  assert.equal(await bal('g_e@x.com'), 0);
  const ok = await link('e@x.com', 'sub_EXPECT01', { confirm: true, expect: 'g_e@x.com' });
  assert.equal(ok.code, 200);
  assert.equal(await bal('g_e@x.com'), 720);
});

test('١٧. الواجهة: التحذيرات (إيميلان مختلفان لا بالحروف وحدها، بريد غير مؤكَّد، باقة تبقى)، والتأكيد يحمل الحساب المعروض، وضغطتان = فحص واحد، والعطب برمزه', async () => {
  const D = dictFor('ar');
  const run = async (dry, answers, more) => {
    const e = uiEnv('ar', answers, [[200, dry]].concat(more || []));
    e.field('adminLinkUserInput', ALYA); e.field('adminLinkSubInput', 'sub_ALYA0001');
    await e.ctx.adminLinkSubscription();
    return e;
  };
  const mm = await run(Object.assign({}, DRY, { customerEmail: 'other@x.com' }), [false]);
  assert.ok(mm.said.find((x) => x[0] === 'confirm')[1].includes(D.ownerLinkSubMismatch), 'تحذير الإيميلين');
  const cs = await run(Object.assign({}, DRY, { customerEmail: 'Aliya.Alshamsi181@iCloud.com' }), [false]);
  assert.ok(!cs.said.find((x) => x[0] === 'confirm')[1].includes(D.ownerLinkSubMismatch), 'الحروف وحدها ليست اختلافًا');
  const un = await run(Object.assign({}, DRY, { accountEmailVerified: false }), [false]);
  assert.ok(un.said.find((x) => x[0] === 'confirm')[1].includes(D.ownerLinkSubUnverified));
  const kp = await run(Object.assign({}, DRY, { keepPlan: true, accountPlan: 'pro' }), [false]);
  assert.ok(kp.said.find((x) => x[0] === 'confirm')[1].includes('pro'));
  const go = await run(DRY, [true], [[200, Object.assign({}, DRY, { granted: 2, pointsAdded: 720 })]]);
  assert.equal(go.sent[1].expect, GKEY, 'التنفيذ على الحساب المعروض');
  assert.equal(go.sent[1].confirm, true);
  assert.equal(go.sent[0].expect, undefined);

  const slow = uiEnv('ar', [false, false], [[200, DRY], [200, DRY]]);
  slow.field('adminLinkUserInput', ALYA); slow.field('adminLinkSubInput', 'sub_ALYA0001');
  await Promise.all([slow.ctx.adminLinkSubscription(), slow.ctx.adminLinkSubscription()]);
  assert.equal(slow.sent.length, 1, 'ضغطتان: فحص واحد');

  const err = uiEnv('ar', [], [[502, { error: 'stripe_error', at: 'invoices', code: 500 }]]);
  err.field('adminLinkUserInput', ALYA); err.field('adminLinkSubInput', 'sub_ALYA0001');
  await err.ctx.adminLinkSubscription();
  const msg = err.said.find((x) => x[0] === 'alert')[1];
  assert.ok(msg.includes('stripe_error') && msg.includes('500') && msg.includes('invoices'), msg);

  const sk = uiEnv('ar', [], [[200, Object.assign({}, DRY, { linkedTo: GKEY, toGrant: 0, points: 0, payments: [{ state: 'already' }, { state: 'refunded' }] })]]);
  sk.field('adminLinkUserInput', ALYA); sk.field('adminLinkSubInput', 'sub_ALYA0001');
  await sk.ctx.adminLinkSubscription();
  assert.equal(sk.said.filter((x) => x[0] === 'confirm').length, 0);
  const skm = sk.said.find((x) => x[0] === 'alert')[1];
  assert.ok(!skm.includes(D.ownerLinkSubNothing) && skm.includes('1'), 'لا «كلّها مضافة» وفيها مستردّة');
});
