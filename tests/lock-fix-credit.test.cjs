// tests/lock-fix-credit.test.cjs — v-lock-credit (باب المال بموافقة المالك ٢٧ أكتوبر: «صلح الخطير وابدا فيهم كلهم»).
//
//   srv-money-2  الشحن مرّة واحدة حتّى لو فشلت كتابة سجلّ الحساب بعد زيادة العدّاد: كان catch يفكّ حجز الدفعة بعد أن زاد الرصيد،
//                فتشحن إعادة Stripe/PayPal أو تحقّق العميل مرّة ثانية (دفعة pack700 واحدة = ١٤٠٠ نقطة).
//   srv-money-6  ويب هوك PayPal ‏PAYMENT.CAPTURE.COMPLETED يشحن الالتقاط المعلَّق حين يكتمل — كان يُتجاهل، فلا يُشحن إلّا من متصفّح
//                الدافع خلال ٧ أيّام.
//   x-build-1    مرآة صرف النقاط (mirrorToUser) تكتب السجلّ تحت قفل الحساب: كتابةٌ قديمة لا تعيد باقة مسحوبة مهما تأخّرت (كان
//                اختبار pay-refund ٢٥ يتقلّب لأنّ مهلة (د) زمن حقيقيّ والتأخير المحاكى بعدد الدورات).
//
// على المعالجات الحقيقيّة (api/webhook.js موقَّعًا، create-checkout-session، paypal-order، points، pay-refund) بـKV في الذاكرة
// وشبكة مزيّفة مثبّتة مرّة للملفّ كلّه — لا نداء حقيقيّ لـStripe ولا PayPal.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');

process.env.AUTH_SECRET = 'lock-fix-credit-secret';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_lock_credit_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_lock_credit';
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_SECRET = 'sec';
process.env.PAYPAL_MODE = 'sandbox';
process.env.PAYPAL_WEBHOOK_ID = 'WH-ID-LOCK-CREDIT';

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV في الذاكرة مع حقن الأعطال ──
const kv = new Map();
const users = new Map();
// putAfterIncr: عدد كتابات سجلّ الحساب التي تفشل بعد INCRBY ناجح على عدّاد نقاط · putAfterBudget: بعد كتابة رصيد وسائط
// incr: فشل INCRBY التالي (قبل أيّ أثر) · putArm: الكتابات الفاشلة المسلّحة الآن
const fail = { putAfterIncr: 0, putAfterBudget: 0, putArm: 0, incr: 0, mark: 0 }; // mark: فشل كتابة علامة الإكمال التالية
const gate = { put: null };     // x-build-1: كتابة سجلّ تُمسك حتّى يُفتح لها
const lockSeen = { key: '', fn: null }; // x-build-1: أوّل محاولة فاشلة لأخذ قفل حساب
const imm = () => new Promise((r) => setImmediate(r));
const kvApi = {
  kvGetRaw: async (k) => { await imm(); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v) => {
    await imm();
    if (fail.mark > 0 && /^paid-credit:/.test(k)) { fail.mark--; throw new Error('Upstash error: fetch failed'); }
    kv.set(k, String(v));
    if (fail.putAfterBudget > 0 && /^media:/.test(k)) { fail.putArm = fail.putAfterBudget; fail.putAfterBudget = 0; }
  },
  kvSetIfAbsent: async (k, v) => {
    await imm();
    if (kv.has(k)) { if (lockSeen.fn && k === lockSeen.key) { const f = lockSeen.fn; lockSeen.fn = null; f(); } return false; }
    kv.set(k, String(v)); return true;
  },
  kvIncrBy: async (k, n) => {
    await imm();
    if (fail.incr > 0) { fail.incr--; throw new Error('ERR DB capacity quota exceeded'); }
    const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v));
    if (fail.putAfterIncr > 0 && /^points:/.test(k)) { fail.putArm = fail.putAfterIncr; fail.putAfterIncr = 0; }
    return v;
  },
  kvDecrBy: async (k, n) => { await imm(); const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null),
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvExpire: async () => {}, kvIncr: async (k) => kvApi.kvIncrBy(k, 1), kvList: async () => [],
  kvPipeline: async (cmds) => { const out = []; for (const c of cmds) { if (c[0] === 'INCRBY') out.push(await kvApi.kvIncrBy(c[1], c[2])); else { kv.set(c[1], String(c[2])); out.push('OK'); } } return out; },
};
mock('api/_lib/kv.js', kvApi);
mock('api/_lib/auth.js', {
  getUser: async (u) => { await imm(); return users.has(u) ? structuredClone(users.get(u)) : null; },
  putUser: async (u, rec) => {
    const v = structuredClone(rec); // يُسلسَل وقت النداء
    await imm();
    if (fail.putArm > 0) { fail.putArm--; throw new Error('Upstash error: fetch failed'); }
    if (gate.put && gate.put.u === u) { const g = gate.put; gate.put = null; await g.hold(); }
    users.set(u, v);
  },
  isBanned: async () => false,
  verifyToken: (t) => (typeof t === 'string' && t.startsWith('T:') ? t.slice(2) : null),
});
mock('api/_lib/_vip.js', { isVip: async () => false });
const logged = [];
mock('api/_lib/log-error.js', { logError: (scope, e) => { logged.push({ scope, msg: e && e.message }); }, logErrorAndFlush: async (scope, e) => { logged.push({ scope, msg: e && e.message }); } });
const alerts = [];
mock('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { alerts.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });

// ── شبكة مزيّفة واحدة للملفّ ──
const net = { sessions: {}, sessionList: [], pi: {}, orders: {}, captures: {}, orderFail: 0, verify: 'SUCCESS' };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
global.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname === 'api.stripe.com') {
    const p = u.pathname.replace(/^\/v1\//, '');
    let m;
    if (p === 'checkout/sessions') {
      const pi = u.searchParams.get('payment_intent');
      return reply(200, { data: net.sessionList.filter((s) => pi && s.payment_intent === pi) });
    }
    if ((m = p.match(/^checkout\/sessions\/(.+)$/))) { const s = net.sessions[decodeURIComponent(m[1])]; return s ? reply(200, s) : reply(404, { error: { message: 'No such session' } }); }
    if ((m = p.match(/^payment_intents\/(.+)$/))) { const x = net.pi[decodeURIComponent(m[1])]; return x ? reply(200, x) : reply(404, { error: { message: 'No such payment_intent' } }); }
    if (p === 'invoice_payments') return reply(200, { data: [] });
    return reply(404, { error: { message: 'unknown' } });
  }
  if (/paypal\.com$/.test(u.hostname)) {
    if (u.pathname === '/v1/oauth2/token') return reply(200, { access_token: 'A' });
    if (u.pathname === '/v1/notifications/verify-webhook-signature') return reply(200, { verification_status: net.verify });
    let m;
    if ((m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/))) {
      if (net.orderFail > 0) { net.orderFail--; return reply(503, { message: 'Service Unavailable' }); }
      const o = net.orders[decodeURIComponent(m[1])];
      return o ? reply(200, structuredClone(o)) : reply(404, { message: 'not found' });
    }
    if ((m = u.pathname.match(/^\/v2\/payments\/captures\/([^/]+)$/))) { const c = net.captures[decodeURIComponent(m[1])]; return c ? reply(200, c) : reply(404, { message: 'not found' }); }
    return reply(404, { message: 'unknown' });
  }
  return reply(404, {});
};

const webhook = require(rp('api/webhook.js'));
const checkout = require(rp('api/_lib/create-checkout-session.js'));
const paypal = require(rp('api/_lib/paypal-order.js'));
const points = require(rp('api/_lib/points.js'));
const tier = require(rp('api/_lib/tier.js'));
const media = require(rp('api/_lib/_mediaPlans.js'));

const bal = async (u) => (await points.readPoints(u)).points;
const fresh = (u, rec) => { users.set(u, Object.assign({ username: u, points: 70 }, rec || {})); kv.delete('points:' + u); };
const mkRes = () => ({ code: 200, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { if (b !== undefined) this.body = b; return this; } });
const nowSec = () => Math.floor(Date.now() / 1000);
let seq = 0;

async function hook(event, opts) {
  const o = opts || {};
  const raw = Buffer.from(JSON.stringify(event));
  const req = Readable.from([raw]);
  req.method = 'POST';
  req.query = o.src ? { src: o.src } : {};
  const t = nowSec();
  req.headers = o.headers || { 'stripe-signature': 't=' + t + ',v1=' + crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(t + '.' + raw.toString('utf8')).digest('hex') };
  const res = mkRes();
  await webhook(req, res);
  return res;
}
const evt = (type, object) => ({ id: 'evt_' + (++seq), type, data: { object } });
const paidSession = (id, username, plan, pi, amount) => evt('checkout.session.completed', { id, payment_status: 'paid', payment_intent: pi, amount_total: amount, currency: 'usd', created: nowSec(), metadata: { username, plan } });
const refundOf = (chargeId, pi, amount, refunded) => evt('charge.refunded', { id: chargeId, object: 'charge', payment_intent: pi, amount, amount_refunded: refunded, refunded: refunded >= amount, currency: 'usd', created: nowSec() });
async function buy(u, plan, n, amount) { const r = await hook(paidSession('cs_' + n, u, plan, 'pi_' + n, amount)); assert.equal(r.code, 200); }
async function verify(sessionId, user) {
  const r = mkRes();
  await checkout({ method: 'POST', query: { action: 'verify-checkout' }, body: { session_id: sessionId, token: 'T:' + user } }, r);
  return r;
}
const pp = async (body) => { const r = mkRes(); await paypal({ method: 'POST', body }, r); return r; };
const ppHead = () => ({ 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1', 'paypal-transmission-id': 'tx-' + (++seq), 'paypal-transmission-sig': 'sig', 'paypal-transmission-time': new Date().toISOString() });
const ppOrder = (id, cap, ref, plan, value, capStatus) => ({ id, status: 'COMPLETED', create_time: new Date().toISOString(), purchase_units: [Object.assign(ref === undefined ? {} : { reference_id: ref }, { custom_id: plan, payments: { captures: [{ id: cap, custom_id: plan, amount: { value, currency_code: 'USD' }, status: capStatus || 'COMPLETED', create_time: new Date().toISOString() }] } })] });
const setCap = (orderId, status) => { net.orders[orderId].purchase_units[0].payments.captures[0].status = status; };
const ppCompleted = (orderId, cap, value) => ({ id: 'WH-C' + (++seq), event_type: 'PAYMENT.CAPTURE.COMPLETED', resource_type: 'capture', resource: { id: cap, status: 'COMPLETED', amount: { value, currency_code: 'USD' }, supplementary_data: { related_ids: { order_id: orderId } }, links: [{ rel: 'self', href: 'https://api.sandbox.paypal.com/v2/payments/captures/' + cap }, { rel: 'up', href: 'https://api.sandbox.paypal.com/v2/checkout/orders/' + orderId }] } });
const ppRefund = (cap, value, total) => ({ id: 'WH-R' + (++seq), event_type: 'PAYMENT.CAPTURE.REFUNDED', resource_type: 'refund', resource: { id: 'RF' + seq, status: 'COMPLETED', amount: { value, currency_code: 'USD' }, seller_payable_breakdown: { total_refunded_amount: { value: total, currency_code: 'USD' } }, links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/' + cap }] } });
const disarm = () => { fail.putAfterIncr = 0; fail.putAfterBudget = 0; fail.putArm = 0; fail.incr = 0; fail.mark = 0; };

// ───────────────────────── srv-money-2 ─────────────────────────

test('srv-money-2 · ١. فشل كتابة السجلّ بعد زيادة العدّاد (pack700): الويب هوك non-2xx، وإعادة Stripe لا تشحن ثانيةً (كانت ١٤٠٠)', async () => {
  fresh('lc1');
  const e = paidSession('cs_lc1', 'lc1', 'pack700', 'pi_lc1', 2499);
  fail.putAfterIncr = 1;
  let r1;
  try { r1 = await hook(e); } finally { disarm(); }
  assert.ok(r1.code >= 500, 'non-2xx فيعيد Stripe — ' + r1.code);
  assert.equal(await bal('lc1'), 770, 'شُحنت مرّة');
  assert.equal(kv.has('paid:lastStripeSessionId:cs_lc1'), true, 'الحجز باقٍ بعد الأثر');
  const r2 = await hook(e);
  assert.equal(r2.code, 200);
  assert.equal(await bal('lc1'), 770, 'الإعادة لا تشحن ثانيةً');
  assert.equal(users.get('lc1').lastStripeSessionId, 'cs_lc1', 'الإعادة أكملت السجلّ');
  assert.equal(users.get('lc1').points, 770, 'ومرآته');
  assert.ok(kv.has('payrec:cs_lc1'), 'وسجلّ المنح (يقرؤه الاسترداد)');
  for (let i = 0; i < 3; i++) assert.equal((await hook(e)).code, 200);
  assert.equal(await bal('lc1'), 770);
});

test('srv-money-2 · ٢. باقة Pro: الإعادة تكمل الباقة بلا نقاط ثانية — بالتناوب مع تحقّق العميل وبعشرة متزامنة', async () => {
  fresh('lc2');
  net.sessions.cs_lc2 = { id: 'cs_lc2', payment_status: 'paid', payment_intent: 'pi_lc2', amount_total: 2000, currency: 'usd', created: nowSec(), metadata: { username: 'lc2', plan: 'pro' } };
  fail.putAfterIncr = 1;
  let v1;
  try { v1 = await verify('cs_lc2', 'lc2'); } finally { disarm(); }
  assert.ok(v1.code >= 500, 'العميل يرى الفشل فيعيد — ' + v1.code);
  assert.equal(await bal('lc2'), 990);
  assert.equal(tier.planActive(users.get('lc2')), false, 'السجلّ لم يُكتب بعد');
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? verify('cs_lc2', 'lc2') : hook(paidSession('cs_lc2', 'lc2', 'pro', 'pi_lc2', 2000)))));
  assert.deepEqual([...new Set(rs.map((x) => x.code))], [200]);
  assert.equal(await bal('lc2'), 990, '٧٠ + ٩٢٠ مرّة واحدة');
  const u = users.get('lc2');
  assert.equal(u.plan, 'pro');
  assert.equal(u.planPayId, 'cs_lc2');
  assert.equal(tier.planActive(u), true, 'الباقة المدفوعة وصلت');
  assert.equal(rs.filter((x) => x.body && x.body.pointsAdded > 0).length <= 1, true, 'ردّ واحد على الأكثر يعلن نقاطًا مضافة');
});

test('srv-money-2 · ٣. فشل دائم في كتابة السجلّ: كلّ إعادة non-2xx ولا نقطة زائدة، وحين يعود التخزين تكتمل مرّة واحدة', async () => {
  fresh('lc3');
  const e = paidSession('cs_lc3', 'lc3', 'basic', 'pi_lc3', 1000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  for (let i = 0; i < 4; i++) {
    fail.putArm = 1; // التخزين ما زال يرفض الكتابة
    let r;
    try { r = await hook(e); } finally { disarm(); }
    assert.ok(r.code >= 500, 'لا 2xx قبل أن يُكتب السجلّ — ' + r.code);
    assert.equal(await bal('lc3'), 430, 'لا شحن ثانٍ في المحاولة ' + (i + 1));
  }
  assert.equal((await hook(e)).code, 200);
  assert.equal(await bal('lc3'), 430);
  assert.equal(users.get('lc3').plan, 'basic');
  assert.equal(kv.has('paid-credit:lastStripeSessionId:cs_lc3'), false, 'علامة الإكمال تُمحى بعده');
});

test('srv-money-2 · ٤. الفشل قبل أيّ أثر (INCRBY نفسه) يفكّ الحجز كما كان: الإعادة تشحن مرّة واحدة', async () => {
  fresh('lc4');
  const e = paidSession('cs_lc4', 'lc4', 'pack100', 'pi_lc4', 499);
  fail.incr = 1;
  let r;
  try { r = await hook(e); } finally { disarm(); }
  assert.ok(r.code >= 500);
  assert.equal(await bal('lc4'), 70, 'لم يُشحن شيء');
  assert.equal(kv.has('paid:lastStripeSessionId:cs_lc4'), false, 'الحجز فُكّ');
  assert.equal((await hook(e)).code, 200);
  assert.equal((await hook(e)).code, 200);
  assert.equal(await bal('lc4'), 170);
});

test('srv-money-2 · ٥. استرداد كامل يصل بين الفشل والإعادة: لا تُسلَّم الباقة بعده، وتُسحب النقاط التي شُحنت (كانت تبقى ٩٩٠)', async () => {
  fresh('lc5');
  const e = paidSession('cs_lc5', 'lc5', 'pro', 'pi_lc5', 2000);
  net.sessionList.push({ id: 'cs_lc5', payment_intent: 'pi_lc5', metadata: { username: 'lc5', plan: 'pro' } });
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(await bal('lc5'), 990);
  const rf = await hook(refundOf('ch_lc5', 'pi_lc5', 2000, 2000));
  assert.equal(rf.code, 200);
  assert.equal(await bal('lc5'), 70, 'الحجز دليل الشحن فتُسحب نقاطه');
  assert.equal((await hook(e)).code, 200, 'إعادة حدث الدفع');
  assert.equal(tier.planActive(users.get('lc5')), false, 'لا باقة بعد الاسترداد');
  assert.equal(await bal('lc5'), 70);
  assert.equal(kv.has('paid-credit:lastStripeSessionId:cs_lc5'), false);
});

// ٦ و٧ مرّتين: بساعة عاديّة، وبساعة مجمّدة (كلّ المنح في الملّي ثانية نفسها) — الإكمال لا يعتمد ترتيب الأوقات.
const frozenClock = async (fn) => { const realNow = Date.now, t = realNow(); Date.now = () => t; try { await fn(); } finally { Date.now = realNow; } };
async function newerPurchaseCase(u) {
  fresh(u);
  const old = paidSession('cs_' + u + 'a', u, 'basic', 'pi_' + u + 'a', 1000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(old)).code >= 500); } finally { disarm(); }
  await buy(u, 'max', u + 'b', 10000);
  assert.equal(users.get(u).plan, 'max');
  assert.equal((await hook(old)).code, 200);
  const x = users.get(u);
  assert.equal(x.plan, 'max', 'الباقة الأحدث باقية');
  assert.equal(x.planPayId, 'cs_' + u + 'b');
  assert.equal(await bal(u), 70 + 360 + 3200);
  assert.ok(kv.has('payrec:cs_' + u + 'a'), 'سجلّ منح الأقدم يُكتب (استرداده يسحب نقاطه)');
}
test('srv-money-2 · ٦. شراء أحدث بين الفشل والإعادة: الإكمال لا ينزل الباقة الأحدث ولا يشحن ثانيةً', async () => {
  await newerPurchaseCase('lc6');
  await frozenClock(() => newerPurchaseCase('lc6f'));
});

async function mediaRefillCase(u) {
  fresh(u);
  await buy(u, 'media_basic', u + 'a', 1021);
  const e = paidSession('cs_' + u + 'b', u, 'media_pro', 'pi_' + u + 'b', 2042);
  fail.putAfterBudget = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(Number(kv.get('media:mix:' + u)), 2500, 'الرصيد مُلئ');
  const sp = await points.spendPoints(u, 175, 'veo_video'); // يُصرف من الرصيد الجديد تحت الفترة السابقة السارية
  assert.equal(sp.ok, true);
  assert.equal(sp.pool, 'mix');
  assert.equal(Number(kv.get('media:mix:' + u)), 2060);
  assert.equal((await hook(e)).code, 200);
  assert.equal(Number(kv.get('media:mix:' + u)), 2060, 'لا ملء ثانٍ');
  const m = users.get(u).media.mix;
  assert.equal(m.plan, 'media_pro', 'الفترة المدفوعة تُكتب فوق سابقتها');
  assert.equal(m.payId, 'cs_' + u + 'b');
  assert.equal(await bal(u), 70);
}
test('srv-money-2 · ٧. باقة الوسائط: فشل السجلّ بعد ملء الرصيد لا يعيد ملأه في الإعادة (ما صُرف بينهما لا يرجع)', async () => {
  await mediaRefillCase('lc7');
  await frozenClock(() => mediaRefillCase('lc7f'));
});

test('srv-money-2 · ٨. PayPal: الالتقاط شحن ثمّ فشل السجلّ ← credited:false، وclaim يكمله مرّة واحدة (كان يشحن ثانيةً)', async () => {
  fresh('lc8');
  net.orders.PL8 = ppOrder('PL8', 'CAPL8', 'lc8', 'pack700', '24.99');
  logged.length = 0;
  fail.putAfterIncr = 1;
  let c;
  try { c = await pp({ action: 'capture', orderId: 'PL8', token: 'T:lc8' }); } finally { disarm(); }
  assert.equal(c.body.credited, false);
  assert.ok(logged.some((l) => l.scope === 'paypal:credit'), 'في سجلّ أخطاء المالك');
  assert.equal(await bal('lc8'), 770);
  const cs = await Promise.all([1, 2, 3].map(() => pp({ action: 'claim', orderId: 'PL8', token: 'T:lc8' })));
  assert.ok(cs.every((x) => x.body.credited === true));
  assert.equal(await bal('lc8'), 770, 'لا شحن ثانٍ');
  assert.equal(users.get('lc8').lastPaypalOrderId, 'PL8');
  assert.deepEqual(JSON.parse(kv.get('payrec:PL8')).refs, ['CAPL8'], 'رقم الالتقاط مربوط فيعرفه الاسترداد');
});

test('srv-money-2 · ٩. حتّى علامة الإكمال لم تُكتب (التخزين معطَّل): الحجز باقٍ فلا شحن ثانٍ، والمالك يُنبَّه في سجلّ أخطائه', async () => {
  fresh('lc9');
  const e = paidSession('cs_lc9', 'lc9', 'pack300', 'pi_lc9', 1299);
  logged.length = 0;
  fail.putAfterIncr = 1; fail.mark = 1;
  let r;
  try { r = await hook(e); } finally { disarm(); }
  assert.ok(r.code >= 500);
  assert.ok(logged.some((l) => l.scope === 'checkout:credit-mark'), 'تنبيه المالك ليكمل السجلّ يدويًّا');
  for (let i = 0; i < 3; i++) assert.equal((await hook(e)).code, 200);
  assert.equal(await bal('lc9'), 370, 'شحنة واحدة — لا فكّ للحجز بعد الأثر');
});

test('srv-money-2 · ١٠. استرداد بعد الإكمال يسحب الباقة ونقاطها بسجلّ المنح الذي كتبه الإكمال، وإعادة حدث الدفع بعده لا تعيدها', async () => {
  fresh('lc10');
  const e = paidSession('cs_lc10', 'lc10', 'pro', 'pi_lc10', 2000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal((await hook(e)).code, 200);
  assert.equal(tier.planActive(users.get('lc10')), true);
  assert.equal((await hook(refundOf('ch_lc10', 'pi_lc10', 2000, 2000))).code, 200);
  assert.equal(tier.planActive(users.get('lc10')), false);
  assert.equal(await bal('lc10'), 70);
  assert.equal((await hook(e)).code, 200);
  assert.equal(tier.planActive(users.get('lc10')), false, 'لا باقة بعد الاسترداد');
  assert.equal(await bal('lc10'), 70);
});

// ───────────────────────── srv-money-6 ─────────────────────────

test('srv-money-6 · ١. التقاط معلَّق ثمّ PAYMENT.CAPTURE.COMPLETED موقَّع: يُشحن الحساب من الخادم (كان يُتجاهل)', async () => {
  fresh('pc1');
  net.orders.PP1 = ppOrder('PP1', 'CAPP1', 'pc1', 'pro', '20.00', 'PENDING');
  const c = await pp({ action: 'capture', orderId: 'PP1', token: 'T:pc1' });
  assert.equal(c.body.credited, false);
  assert.equal(c.body.reason, 'capture_pending');
  assert.equal(await bal('pc1'), 70);
  setCap('PP1', 'COMPLETED');
  const r = await hook(ppCompleted('PP1', 'CAPP1', '20.00'), { src: 'paypal', headers: ppHead() });
  assert.equal(r.code, 200);
  assert.equal(await bal('pc1'), 990, 'شُحن بلا متصفّح الدافع');
  assert.equal(users.get('pc1').plan, 'pro');
  assert.equal(tier.planActive(users.get('pc1')), true);
  assert.deepEqual(JSON.parse(kv.get('payrec:PP1')).refs, ['CAPP1'], 'رقم الالتقاط في سجلّ المنح');
});

test('srv-money-6 · ٢. إعادة الحدث ومعها claim العميل متزامنَين: شحنة واحدة', async () => {
  fresh('pc2');
  net.orders.PP2 = ppOrder('PP2', 'CAPP2', 'pc2', 'pack300', '12.99', 'PENDING');
  await pp({ action: 'capture', orderId: 'PP2', token: 'T:pc2' });
  setCap('PP2', 'COMPLETED');
  const ev = ppCompleted('PP2', 'CAPP2', '12.99');
  const rs = await Promise.all([
    hook(ev, { src: 'paypal', headers: ppHead() }), pp({ action: 'claim', orderId: 'PP2', token: 'T:pc2' }),
    hook(ev, { src: 'paypal', headers: ppHead() }), pp({ action: 'claim', orderId: 'PP2', token: 'T:pc2' }),
    hook(ppCompleted('PP2', 'CAPP2', '12.99'), { src: 'paypal', headers: ppHead() }),
  ]);
  assert.deepEqual([...new Set(rs.map((x) => x.code))], [200]);
  assert.equal(await bal('pc2'), 370, '٧٠ + ٣٠٠ مرّة واحدة');
  assert.equal((await hook(ev, { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc2'), 370);
});

test('srv-money-6 · ٣. الحدث يسبق الطلب (الالتقاط ما زال PENDING عند PayPal): 503 فيُعاد، ولا شحن حتّى يكتمل', async () => {
  fresh('pc3');
  net.orders.PP3 = ppOrder('PP3', 'CAPP3', 'pc3', 'basic', '10.00', 'PENDING');
  const ev = ppCompleted('PP3', 'CAPP3', '10.00');
  const r1 = await hook(ev, { src: 'paypal', headers: ppHead() });
  assert.equal(r1.code, 503);
  assert.equal(await bal('pc3'), 70);
  net.orderFail = 1; // عطل PayPal العابر عند جلب الطلب: non-2xx لا «تمّ»
  const r2 = await hook(ev, { src: 'paypal', headers: ppHead() });
  assert.ok(r2.code >= 500, 'عطل عابر يُعاد — ' + r2.code);
  assert.equal(await bal('pc3'), 70);
  setCap('PP3', 'COMPLETED');
  assert.equal((await hook(ev, { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc3'), 430);
});

test('srv-money-6 · ٤. لا شحن بعد الاسترداد: التقاط مستردّ، أو حجز مسحوب قبل الشحن، أو طلب قديم بلا صاحب، أو مبلغ لا يطابق خطّة', async () => {
  fresh('pc4');
  net.orders.PP4 = ppOrder('PP4', 'CAPP4', 'pc4', 'pro', '20.00', 'REFUNDED');
  assert.equal((await hook(ppCompleted('PP4', 'CAPP4', '20.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc4'), 70, 'الالتقاط مستردّ عند PayPal');
  // استرداد كامل وصل قبل الشحن: الحجز يُشغَل بعلامة السحب، فحدث الاكتمال المتأخّر (وطلبٌ ما زال يُقرأ COMPLETED) لا يشحن
  fresh('pc5');
  net.orders.PP5 = ppOrder('PP5', 'CAPP5', 'pc5', 'pro', '20.00', 'COMPLETED');
  net.captures.CAPP5 = { id: 'CAPP5', amount: { value: '20.00', currency_code: 'USD' }, create_time: new Date().toISOString(), supplementary_data: { related_ids: { order_id: 'PP5' } } };
  assert.equal((await hook(ppRefund('CAPP5', '20.00', '20.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.match(String(kv.get('paid:lastPaypalOrderId:PP5')), /^!revoked:/);
  assert.equal((await hook(ppCompleted('PP5', 'CAPP5', '20.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc5'), 70);
  assert.equal(tier.planActive(users.get('pc5')), false);
  // طلب من قبل مسار reference_id (بلا صاحب ولا حجز ذرّيّ مضمون): لا يُشحن من الويب هوك، كـclaim
  fresh('pc6');
  net.orders.PP6 = ppOrder('PP6', 'CAPP6', undefined, 'pack100', '4.99', 'COMPLETED');
  assert.equal((await hook(ppCompleted('PP6', 'CAPP6', '4.99'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc6'), 70);
  // مبلغ بلا خطّة: لا شحن، وتنبيه للمالك (مال سُحب بلا خدمة)
  fresh('pc7');
  net.orders.PP7 = ppOrder('PP7', 'CAPP7', 'pc7', 'pro', '19.00', 'COMPLETED');
  logged.length = 0;
  assert.equal((await hook(ppCompleted('PP7', 'CAPP7', '19.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc7'), 70);
  assert.ok(logged.some((l) => /^paypal:/.test(l.scope) && /no_plan/.test(l.msg)), 'في سجلّ أخطاء المالك');
});

test('srv-money-6 · ٥. توقيع غير صالح لا يشحن، وفشل الشحن بعد التحقّق non-2xx فيُعاد ويشحن مرّة واحدة', async () => {
  fresh('pc8');
  net.orders.PP8 = ppOrder('PP8', 'CAPP8', 'pc8', 'pack700', '24.99', 'COMPLETED');
  const ev = ppCompleted('PP8', 'CAPP8', '24.99');
  net.verify = 'FAILURE';
  try { assert.ok((await hook(ev, { src: 'paypal', headers: ppHead() })).code >= 400); } finally { net.verify = 'SUCCESS'; }
  assert.equal(await bal('pc8'), 70);
  fail.putAfterIncr = 1;
  let r;
  try { r = await hook(ev, { src: 'paypal', headers: ppHead() }); } finally { disarm(); }
  assert.ok(r.code >= 500, 'لا 200 قبل أن يُكتب السجلّ — ' + r.code);
  assert.equal(await bal('pc8'), 770);
  assert.equal((await hook(ev, { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal((await hook(ev, { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc8'), 770, 'مرّة واحدة');
  assert.equal(users.get('pc8').lastPaypalOrderId, 'PP8');
});

// ───────────────────────── x-build-1 ─────────────────────────

// كتابة المرآة تُمسك حتّى ينتهي السحب (الكود السابق: القفل لا يمسّها فينتهي السحب و(د) بعد مهلتها) أو حتّى يُرى السحب ينتظر قفل
// الحساب (الإصلاح: المرآة تحمله) — ترتيب حتميّ بلا ساعة ولا مهلة، فكتابةٌ «أبطأ من مهلة (د)» تُختبر على كلّ جهاز.
async function heldMirrorRace(u, refundEvent) {
  let reached, open;
  const atGate = new Promise((r) => { reached = r; });
  const released = new Promise((r) => { open = r; });
  gate.put = { u, hold: () => { reached(); return released; } };
  const spend = points.spendPoints(u, 10, 'chat');
  await atGate; // المرآة قرأت السجلّ (الباقة سارية) وكتابته في الطريق
  let waiting;
  const lockWait = new Promise((r) => { waiting = r; });
  Object.assign(lockSeen, { key: 'db/acct-lock/' + u, fn: waiting });
  const refund = hook(refundEvent);
  await Promise.race([refund, lockWait]);
  lockSeen.fn = null;
  open();
  const [r, s] = await Promise.all([refund, spend]);
  return { r, s };
}

test('x-build-1 · ١. كتابة مرآة الصرف أبطأ من مهلة (د): لا تعيد باقة المحادثة المسحوبة (كانت تعود والحدث «تمّ»)', async () => {
  fresh('mx1');
  await buy('mx1', 'pro', 'mx1', 2000);
  const { r, s } = await heldMirrorRace('mx1', refundOf('ch_mx1', 'pi_mx1', 2000, 2000));
  assert.equal(r.code, 200);
  assert.equal(s.ok, true);
  assert.equal(tier.planActive(users.get('mx1')), false, 'الباقة المسحوبة لا تعود');
  assert.equal(await bal('mx1'), 60);
});

test('x-build-1 · ٢. والوسائط: باقة الفيديو المسحوبة لا تعيدها مرآة صرف متأخّرة', async () => {
  fresh('mx2');
  await buy('mx2', 'vid_pro', 'mx2', 2042);
  const { r } = await heldMirrorRace('mx2', refundOf('ch_mx2', 'pi_mx2', 2042, 2042));
  assert.equal(r.code, 200);
  assert.equal(media.mediaActive(users.get('mx2'), 'video'), false);
  assert.equal(await bal('mx2'), 60);
});

test('x-build-1 · ٣. قفل الحساب مشغول بعمليّة دفع: الصرف ينجح بلا انتظار ٨ ثوانٍ، ولا يكتب السجلّ تحت قفل غيره', async () => {
  fresh('mx3');
  await buy('mx3', 'pack100', 'mx3', 499);
  const before = users.get('mx3').points;
  kv.set('db/acct-lock/mx3', '1'); // منح أو سحب على الحساب لم ينتهِ
  const realNow = Date.now, realTimeout = global.setTimeout;
  let skew = 0;
  Date.now = () => realNow() + skew;
  global.setTimeout = (fn, ms, ...a) => { skew += Math.max(0, Number(ms) || 0); return realTimeout(fn, 0, ...a); };
  let s;
  try { s = await points.spendPoints('mx3', 10, 'chat'); } finally { Date.now = realNow; global.setTimeout = realTimeout; kv.delete('db/acct-lock/mx3'); }
  assert.equal(s.ok, true);
  assert.equal(s.points, 160);
  assert.ok(skew < 8000, 'المسار الساخن لا ينتظر مهلة الدفع كاملة — ' + skew);
  assert.equal(users.get('mx3').points, before, 'لا كتابة لسجلّ الحساب وقفله بيد غيره');
  assert.equal(await bal('mx3'), 160, 'العدّاد الحيّ هو المرجع');
  await points.spendPoints('mx3', 10, 'chat');
  assert.equal(users.get('mx3').points, 150, 'بعد فكّ القفل تعود المرآة');
});

test('x-build-1 · ٤. صرف وردّ متزامنان كثيرًا: العدّاد صحيح والمرآة تنتهي على قيمته الأخيرة', async () => {
  fresh('mx4');
  await buy('mx4', 'pack300', 'mx4', 1299);
  await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 3 === 2 ? points.refundPoints('mx4', 5, { ok: true, spent: 5 }) : points.spendPoints('mx4', 5, 'chat'))));
  assert.equal(await bal('mx4'), 370 - 8 * 5 + 4 * 5);
  assert.equal(users.get('mx4').points, 350, 'السجلّ = العدّاد بعد آخر كاتب');
  assert.equal(kv.has('db/acct-lock/mx4'), false, 'القفل فُكّ');
});
