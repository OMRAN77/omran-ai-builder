// tests/lock-fix-credit.test.cjs — v-lock-credit (باب المال بموافقة المالك ٢٧ أكتوبر: «صلح الخطير وابدا فيهم كلهم»).
//
//   srv-money-2  الشحن مرّة واحدة حتّى لو فشلت كتابة سجلّ الحساب بعد زيادة العدّاد: كان catch يفكّ حجز الدفعة بعد أن زاد الرصيد،
//                فتشحن إعادة Stripe/PayPal أو تحقّق العميل مرّة ثانية (دفعة pack700 واحدة = ١٤٠٠ نقطة).
//   srv-money-6  ويب هوك PayPal ‏PAYMENT.CAPTURE.COMPLETED يشحن الالتقاط المعلَّق حين يكتمل — كان يُتجاهل، فلا يُشحن إلّا من متصفّح
//                الدافع خلال ٧ أيّام.
//   x-build-1    مرآة صرف النقاط (mirrorToUser) تكتب السجلّ تحت قفل الحساب: كتابةٌ قديمة لا تعيد باقة مسحوبة مهما تأخّرت (كان
//                اختبار pay-refund ٢٥ يتقلّب لأنّ مهلة (د) زمن حقيقيّ والتأخير المحاكى بعدد الدورات).
//   التوحيد      قاعدة واحدة لفشلٍ بعد أثرٍ لا يُعاد مع v-lock-gpay (Apple/Google Pay بالويب هوك والتحقّق المعلّق) وv-lock-subs (الأعلى السارية
//                لا تنزل بأدنى، وإلغاء الاشتراك الأقدم): المحفظة، الأدنى تحت الأعلى، الأعلى بعد أدنى اشتُري في النافذة، السجلّ الواصل ثمّ
//                الرمي، الاسترداد الجزئيّ في النافذة، PayPal، الاشتراك الجديد، والحساب المحذوف قبل الإعادة.
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
const ttl = new Map(); // مهلة كلّ مفتاح كما طُلبت (الحجز وعلامة الإكمال)
const users = new Map();
// putAfterIncr: عدد كتابات سجلّ الحساب التي تفشل بعد INCRBY ناجح على عدّاد نقاط · putAfterBudget: بعد كتابة رصيد وسائط
// incr: فشل INCRBY التالي (قبل أيّ أثر) · putArm: الكتابات الفاشلة المسلّحة الآن
const fail = { putAfterIncr: 0, putAfterBudget: 0, putArm: 0, incr: 0, mark: 0, landAfterIncr: 0, landArm: 0 }; // mark: فشل كتابة علامة الإكمال التالية
// landAfterIncr (التوحيد مع v-lock-gpay): كتابة السجلّ التي تلي INCRBY تصل ثمّ ترمي (مهلة بعد الكتابة) · landArm: المسلّحة الآن
const gate = { put: null };     // x-build-1: كتابة سجلّ تُمسك حتّى يُفتح لها
const lockSeen = { key: '', fn: null }; // x-build-1: أوّل محاولة فاشلة لأخذ قفل حساب
const imm = () => new Promise((r) => setImmediate(r));
const kvApi = {
  kvGetRaw: async (k) => { await imm(); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v, t) => {
    await imm();
    if (fail.mark > 0 && /^paid-credit:/.test(k)) { fail.mark--; throw new Error('Upstash error: fetch failed'); }
    kv.set(k, String(v)); ttl.set(k, t);
    if (fail.putAfterBudget > 0 && /^media:/.test(k)) { fail.putArm = fail.putAfterBudget; fail.putAfterBudget = 0; }
  },
  kvSetIfAbsent: async (k, v, t) => {
    await imm();
    if (kv.has(k)) { if (lockSeen.fn && k === lockSeen.key) { const f = lockSeen.fn; lockSeen.fn = null; f(); } return false; }
    kv.set(k, String(v)); ttl.set(k, t); return true;
  },
  kvIncrBy: async (k, n) => {
    await imm();
    if (fail.incr > 0) { fail.incr--; throw new Error('ERR DB capacity quota exceeded'); }
    const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v));
    if (fail.putAfterIncr > 0 && /^points:/.test(k)) { fail.putArm = fail.putAfterIncr; fail.putAfterIncr = 0; }
    if (fail.landAfterIncr > 0 && /^points:/.test(k)) { fail.landArm = fail.landAfterIncr; fail.landAfterIncr = 0; }
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
    if (fail.landArm > 0) { fail.landArm--; users.set(u, v); throw new Error('ETIMEDOUT after write'); }
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
const net = { sessions: {}, sessionList: [], pi: {}, orders: {}, captures: {}, orderFail: 0, verify: 'SUCCESS', nextOrder: '', subs: {}, cancels: [] };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
global.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.hostname === 'api.stripe.com') {
    const p = u.pathname.replace(/^\/v1\//, '');
    let m;
    if (p === 'checkout/sessions') {
      const pi = u.searchParams.get('payment_intent');
      return reply(200, { data: net.sessionList.filter((s) => pi && s.payment_intent === pi) });
    }
    if ((m = p.match(/^checkout\/sessions\/(.+)$/))) { const s = net.sessions[decodeURIComponent(m[1])]; return s ? reply(200, s) : reply(404, { error: { message: 'No such session' } }); }
    // اشتراكات Stripe (التوحيد مع v-lock-subs srv-money-3): البحث بالاسم، والقراءة والإلغاء بالرقم
    if (p === 'subscriptions/search') {
      const nm = (u.searchParams.get('query') || '').match(/metadata\['username'\]:'([^']*)'/);
      return reply(200, { data: Object.values(net.subs).filter((s) => nm && s.metadata.username === nm[1]).map((s) => structuredClone(s)), has_more: false });
    }
    if ((m = p.match(/^subscriptions\/(.+)$/))) {
      const s = net.subs[decodeURIComponent(m[1])];
      if (!s) return reply(404, { error: { message: 'No such subscription' } });
      if (opts && opts.method === 'DELETE') { s.status = 'canceled'; net.cancels.push(s.id); }
      return reply(200, structuredClone(s));
    }
    if ((m = p.match(/^payment_intents\/(.+)$/))) { const x = net.pi[decodeURIComponent(m[1])]; return x ? reply(200, x) : reply(404, { error: { message: 'No such payment_intent' } }); }
    if (p === 'invoice_payments') return reply(200, { data: [] });
    return reply(404, { error: { message: 'unknown' } });
  }
  if (/paypal\.com$/.test(u.hostname)) {
    if (u.pathname === '/v1/oauth2/token') return reply(200, { access_token: 'A' });
    if (u.pathname === '/v1/notifications/verify-webhook-signature') return reply(200, { verification_status: net.verify });
    if (u.pathname === '/v2/checkout/orders' && opts && opts.method === 'POST') return reply(201, { id: net.nextOrder || ('PPX' + (++seq)), status: 'CREATED' }); // action 'create'
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
// طلب أنشأه خادمنا ('create' برمز صاحبه) ثمّ دفعه — ويب هوك الاكتمال لا يشحن غيره (srv-money-6). ref: reference_id إن غيّره المشتري بعد الإنشاء.
async function ourOrder(id, cap, user, plan, value, capStatus, ref) {
  net.nextOrder = id;
  let r;
  try { r = await pp({ action: 'create', plan, token: 'T:' + user }); } finally { net.nextOrder = ''; }
  assert.equal(r.code, 200);
  assert.equal(r.body.id, id);
  net.orders[id] = ppOrder(id, cap, ref === undefined ? user : ref, plan, value, capStatus);
}
const ppCompleted = (orderId, cap, value) => ({ id: 'WH-C' + (++seq), event_type: 'PAYMENT.CAPTURE.COMPLETED', resource_type: 'capture', resource: { id: cap, status: 'COMPLETED', amount: { value, currency_code: 'USD' }, supplementary_data: { related_ids: { order_id: orderId } }, links: [{ rel: 'self', href: 'https://api.sandbox.paypal.com/v2/payments/captures/' + cap }, { rel: 'up', href: 'https://api.sandbox.paypal.com/v2/checkout/orders/' + orderId }] } });
const ppRefund = (cap, value, total) => ({ id: 'WH-R' + (++seq), event_type: 'PAYMENT.CAPTURE.REFUNDED', resource_type: 'refund', resource: { id: 'RF' + seq, status: 'COMPLETED', amount: { value, currency_code: 'USD' }, seller_payable_breakdown: { total_refunded_amount: { value: total, currency_code: 'USD' } }, links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/' + cap }] } });
const disarm = () => { fail.putAfterIncr = 0; fail.putAfterBudget = 0; fail.putArm = 0; fail.incr = 0; fail.mark = 0; fail.landAfterIncr = 0; fail.landArm = 0; };

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

// ── المراجعة المعاكسة لـsrv-money-2: استرداد يصل في النافذة بين «شُحن» و«كُتب السجلّ» ──

test('srv-money-2 · ١١. استرداد جزئيّ بين الفشل والإعادة: الباقة المدفوعة تُسلَّم ويُسحب نصف نقاطها وحده (كانت لا تُسلَّم أبدًا)', async () => {
  fresh('lc11');
  const e = paidSession('cs_lc11', 'lc11', 'pro', 'pi_lc11', 2000);
  net.sessionList.push({ id: 'cs_lc11', payment_intent: 'pi_lc11', metadata: { username: 'lc11', plan: 'pro' } });
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(await bal('lc11'), 990);
  const half = refundOf('ch_lc11', 'pi_lc11', 2000, 1000);
  assert.equal((await hook(half)).code, 200);
  assert.equal(await bal('lc11'), 530, 'نصف نقاط الدفعة: ٩٩٠ − ٤٦٠');
  assert.equal((await hook(half)).code, 200, 'إعادة حدث الاسترداد');
  assert.equal(await bal('lc11'), 530, 'لا سحب ثانٍ');
  assert.equal((await hook(e)).code, 200, 'إعادة حدث الدفع');
  const u = users.get('lc11');
  assert.equal(u.plan, 'pro', 'دفع نصف المبلغ فبقيت باقته');
  assert.equal(u.planPayId, 'cs_lc11');
  assert.equal(u.lastStripeSessionId, 'cs_lc11');
  assert.equal(tier.planActive(u), true);
  assert.equal(await bal('lc11'), 530, 'ولا نقاط ثانية');
  assert.equal(kv.has('paid-credit:lastStripeSessionId:cs_lc11'), false, 'علامة الإكمال تُمحى');
  assert.equal((await hook(refundOf('ch_lc11', 'pi_lc11', 2000, 2000))).code, 200, 'ثمّ يُستردّ الباقي');
  assert.equal(tier.planActive(users.get('lc11')), false, 'الاسترداد الكامل يسحب الباقة');
  assert.equal(await bal('lc11'), 70, 'والباقي ٤٦٠ لا ٩٢٠');
});

test('srv-money-2 · ١٢. سجلّ منحٍ قديم (legacy) بسحبٍ جزئيّ لا يمنع الإكمال، والإكمال لا يمحو علامة سحبه', async () => {
  fresh('lc12');
  const e = paidSession('cs_lc12', 'lc12', 'pro', 'pi_lc12', 2000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  // كما يبنيه مسار الاسترداد القديم من الحجز دليلًا (stripeLegacy/legacyRecord) ثمّ يسحب نصفه: ٤٦٠ نقطة
  const rv = { fraction: 0.5, refunded: 0.5, disputed: false, points: 460, budget: 0, plan: false, ids: ['stripe:evt_lc12half'], reason: 'refund', at: Date.now() };
  kv.set('payrec:cs_lc12', JSON.stringify({ v: 1, legacy: true, id: 'cs_lc12', field: 'lastStripeSessionId', username: 'lc12', plan: 'pro', points: 920, media: null, at: null, approxAt: Date.now(), amount: 2000, currency: 'usd', refs: ['pi_lc12', 'ch_lc12'], grantedAt: null, revoked: rv }));
  kv.set('payref:pi_lc12', 'cs_lc12');
  kv.set('payref:ch_lc12', 'cs_lc12');
  kv.set('points:lc12', String(990 - 460));
  assert.equal((await hook(e)).code, 200);
  const u = users.get('lc12');
  assert.equal(u.plan, 'pro', 'الباقة تُسلَّم بعد سحبٍ جزئيّ');
  assert.equal(u.planPayId, 'cs_lc12');
  assert.equal(tier.planActive(u), true);
  assert.equal(await bal('lc12'), 530, 'بلا نقاط ثانية');
  assert.equal(JSON.parse(kv.get('payrec:cs_lc12')).revoked.points, 460, 'علامة السحب باقية في السجلّ');
  assert.equal((await hook(refundOf('ch_lc12', 'pi_lc12', 2000, 2000))).code, 200);
  assert.equal(tier.planActive(users.get('lc12')), false);
  assert.equal(await bal('lc12'), 70, 'الاسترداد الباقي يأخذ ٤٦٠ لا ٩٢٠');
});

test('srv-money-2 · ١٣. استرداد فترة الوسائط السابقة بين الفشل والإعادة: الباقة الجديدة تُسلَّم برصيدها (كانت بلا رصيد) وبوقتها الأصليّ', async () => {
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  try {
    fresh('lc13');
    await buy('lc13', 'media_basic', 'lc13a', 1021);
    t += 60000;
    const t0 = t;
    const e = paidSession('cs_lc13b', 'lc13', 'media_pro', 'pi_lc13b', 2042);
    fail.putAfterBudget = 1;
    try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
    assert.equal(Number(kv.get('media:mix:lc13')), 2500, 'الرصيد مُلئ');
    t += 3600000;
    assert.equal((await hook(refundOf('ch_lc13a', 'pi_lc13a', 1021, 1021))).code, 200, 'استرداد الفترة السابقة كاملة');
    assert.equal(kv.has('media:mix:lc13'), false, 'سحبُها محا الرصيد');
    assert.equal((await hook(e)).code, 200, 'إعادة حدث الدفع');
    const m = users.get('lc13').media.mix;
    assert.equal(m.plan, 'media_pro');
    assert.equal(m.payId, 'cs_lc13b');
    assert.equal(m.at, t0, 'بوقت المنح الأصليّ — لا منح ثانٍ يمدّ الفترة');
    assert.equal(media.mediaActive(users.get('lc13'), 'mix'), true);
    assert.equal(Number(kv.get('media:mix:lc13')), 2500, 'الباقة المدفوعة برصيدها');
    const left = Number(ttl.get('media:mix:lc13'));
    assert.ok(left <= media.MEDIA_WINDOW_DAYS * 86400 - 3600 && left > media.MEDIA_WINDOW_DAYS * 86400 - 3700, 'نافذة الرصيد من وقت المنح — ' + left);
  } finally { Date.now = realNow; }
});

test('srv-money-2 · ١٤. الوسائط: استرداد الدفعة الجديدة بين الفشل والإعادة يأخذ ما ملأته — كاملًا تعود السابقة برصيدها، وجزئيًّا نصفه والباقة تُسلَّم', async () => {
  fresh('lc14');
  await buy('lc14', 'media_basic', 'lc14a', 1021);
  assert.equal((await points.spendPoints('lc14', 175, 'veo_video')).ok, true);
  assert.equal(Number(kv.get('media:mix:lc14')), 810, 'بقي من الفترة السابقة ٨١٠');
  const e = paidSession('cs_lc14b', 'lc14', 'media_pro', 'pi_lc14b', 2042);
  net.sessionList.push({ id: 'cs_lc14b', payment_intent: 'pi_lc14b', metadata: { username: 'lc14', plan: 'media_pro' } });
  fail.putAfterBudget = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(Number(kv.get('media:mix:lc14')), 2500);
  assert.equal((await hook(refundOf('ch_lc14b', 'pi_lc14b', 2042, 2042))).code, 200);
  assert.equal(Number(kv.get('media:mix:lc14')), 810, 'الرصيد المملوء يُؤخذ ويعود رصيد الفترة السابقة كما كان (كان يبقى ٢٥٠٠)');
  assert.equal((await hook(e)).code, 200, 'إعادة حدث الدفع');
  let m = users.get('lc14').media.mix;
  assert.equal(m.plan, 'media_basic', 'لا تُسلَّم الباقة المستردّة');
  assert.equal(m.payId, 'cs_lc14a');
  assert.equal(Number(kv.get('media:mix:lc14')), 810);

  fresh('lc14p');
  await buy('lc14p', 'media_basic', 'lc14pa', 1021);
  const e2 = paidSession('cs_lc14pb', 'lc14p', 'media_pro', 'pi_lc14pb', 2042);
  net.sessionList.push({ id: 'cs_lc14pb', payment_intent: 'pi_lc14pb', metadata: { username: 'lc14p', plan: 'media_pro' } });
  fail.putAfterBudget = 1;
  try { assert.ok((await hook(e2)).code >= 500); } finally { disarm(); }
  assert.equal((await hook(refundOf('ch_lc14pb', 'pi_lc14pb', 2042, 1021))).code, 200);
  assert.equal(Number(kv.get('media:mix:lc14p')), 1250, 'نصف رصيد الباقة المستردّ نصفها');
  assert.equal((await hook(e2)).code, 200);
  m = users.get('lc14p').media.mix;
  assert.equal(m.plan, 'media_pro', 'دفع نصفها فبقيت');
  assert.equal(m.payId, 'cs_lc14pb');
  assert.equal(Number(kv.get('media:mix:lc14p')), 1250, 'ولا ملء ثانٍ');
});

test('srv-money-2 · ١٥. علامة الإكمال تعيش ما عاش الحجز (كانت تنتهي صامتة بعد ٤ أيّام)، والمالك يُبلَّغ بالإكمال المعلَّق', async () => {
  fresh('lc15');
  logged.length = 0;
  const e = paidSession('cs_lc15', 'lc15', 'basic', 'pi_lc15', 1000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  const mark = 'paid-credit:lastStripeSessionId:cs_lc15';
  assert.ok(kv.has(mark));
  assert.ok(Number(ttl.get(mark)) >= Number(ttl.get('paid:lastStripeSessionId:cs_lc15')), 'لا تنتهي قبل الحجز — ' + ttl.get(mark));
  assert.ok(logged.some((l) => l.scope === 'checkout:credit-pending'), 'سطر للمالك: دفعة شُحنت وسجلّها معلَّق');
  assert.equal((await hook(e)).code, 200);
  assert.equal(users.get('lc15').plan, 'basic');
  assert.equal(await bal('lc15'), 430);
});

// ───────────────────────── srv-money-6 ─────────────────────────

test('srv-money-6 · ١. التقاط معلَّق ثمّ PAYMENT.CAPTURE.COMPLETED موقَّع: يُشحن الحساب من الخادم (كان يُتجاهل)', async () => {
  fresh('pc1');
  await ourOrder('PP1', 'CAPP1', 'pc1', 'pro', '20.00', 'PENDING');
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
  await ourOrder('PP2', 'CAPP2', 'pc2', 'pack300', '12.99', 'PENDING');
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
  await ourOrder('PP3', 'CAPP3', 'pc3', 'basic', '10.00', 'PENDING');
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
  await ourOrder('PP4', 'CAPP4', 'pc4', 'pro', '20.00', 'REFUNDED');
  assert.equal((await hook(ppCompleted('PP4', 'CAPP4', '20.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc4'), 70, 'الالتقاط مستردّ عند PayPal');
  // استرداد كامل وصل قبل الشحن: الحجز يُشغَل بعلامة السحب، فحدث الاكتمال المتأخّر (وطلبٌ ما زال يُقرأ COMPLETED) لا يشحن
  fresh('pc5');
  await ourOrder('PP5', 'CAPP5', 'pc5', 'pro', '20.00', 'COMPLETED');
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
  await ourOrder('PP7', 'CAPP7', 'pc7', 'pro', '19.00', 'COMPLETED');
  logged.length = 0;
  assert.equal((await hook(ppCompleted('PP7', 'CAPP7', '19.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc7'), 70);
  assert.ok(logged.some((l) => /^paypal:/.test(l.scope) && /no_plan/.test(l.msg)), 'في سجلّ أخطاء المالك');
});

test('srv-money-6 · ٥. توقيع غير صالح لا يشحن، وفشل الشحن بعد التحقّق non-2xx فيُعاد ويشحن مرّة واحدة', async () => {
  fresh('pc8');
  await ourOrder('PP8', 'CAPP8', 'pc8', 'pack700', '24.99', 'COMPLETED');
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

test('srv-money-6 · ٦. طلب لم يُنشئه خادمنا لصاحبه (reference_id يكتبه المشتري): الاكتمال لا يشحن الحساب المذكور فيه — لا تنزيل باقة ولا مسح رصيد', async () => {
  fresh('vic');
  await buy('vic', 'max', 'vic1', 10000);
  await buy('vic', 'media_max', 'vic2', 10211);
  assert.equal(Number(kv.get('media:mix:vic')), 12500);
  logged.length = 0;
  // المهاجم ينشئ الطلب ويلتقطه من حزمة PayPal في متصفّحه بالمعرّف العامّ، وreference_id اسم الضحيّة
  net.orders.EV1 = ppOrder('EV1', 'CAPEV1', 'vic', 'basic', '10.00', 'COMPLETED');
  net.orders.EV2 = ppOrder('EV2', 'CAPEV2', 'vic', 'media_basic', '10.21', 'COMPLETED');
  // أو يُنشئه خادمنا له ثمّ يغيّر reference_id إلى الضحيّة
  await ourOrder('EV3', 'CAPEV3', 'atk', 'basic', '10.00', 'COMPLETED', 'vic');
  for (const [o, c, v] of [['EV1', 'CAPEV1', '10.00'], ['EV2', 'CAPEV2', '10.21'], ['EV3', 'CAPEV3', '10.00']]) {
    assert.equal((await hook(ppCompleted(o, c, v), { src: 'paypal', headers: ppHead() })).code, 200, o + ': لا يُعاد');
  }
  const u = users.get('vic');
  assert.equal(u.plan, 'max', 'باقة الضحيّة باقية (كانت تصير basic)');
  assert.equal(u.planPayId, 'cs_vic1');
  assert.equal(u.media.mix.plan, 'media_max');
  assert.equal(Number(kv.get('media:mix:vic')), 12500, 'رصيدها باقٍ (كان يصير ١٢٥٠)');
  assert.equal(await bal('vic'), 70 + 3200);
  assert.equal(logged.filter((l) => l.scope === 'paypal:capture-completed' && /not_our_order/.test(l.msg)).length, 3, 'سطر للمالك لكلّ طلب');
  // وطلب خادمنا لصاحبه يُشحن حين يكتمل التقاطه المعلَّق
  fresh('pc9');
  await ourOrder('PP9', 'CAPP9', 'pc9', 'pro', '20.00', 'PENDING');
  assert.equal((await pp({ action: 'capture', orderId: 'PP9', token: 'T:pc9' })).body.reason, 'capture_pending');
  setCap('PP9', 'COMPLETED');
  assert.equal((await hook(ppCompleted('PP9', 'CAPP9', '20.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  assert.equal(await bal('pc9'), 990);
  assert.equal(users.get('pc9').plan, 'pro');
});

// ───────────────────────── التوحيد مع v-lock-gpay وv-lock-subs ─────────────────────────
// القاعدة الواحدة: بعد الأثر لا فكّ للحجز ولا ردّ للنقاط؛ علامة إكمال تحمل وقت الأثر والفترة السابقة وقرار الخانة، وأيّ إعادة تكمل.

const DAY = 86400000;
const walletPi = (u, plan, amount) => { const id = 'pi_w' + u; net.pi[id] = { id, object: 'payment_intent', status: 'succeeded', amount, amount_received: amount, currency: 'usd', created: nowSec(), metadata: { plan, username: u }, latest_charge: 'ch_w' + u }; return net.pi[id]; };
const piEvt = (pi) => evt('payment_intent.succeeded', structuredClone(pi));
async function verifyPi(id, user) {
  const r = mkRes();
  await checkout({ method: 'POST', query: { action: 'verify-payment-intent' }, body: { payment_intent_id: id, token: 'T:' + user } }, r);
  return r;
}
const markOf = (field, id) => kv.get('paid-credit:' + field + ':' + id);
const recOf = (id) => JSON.parse(kv.get('payrec:' + id) || 'null');
const sessionFor = (id, u, plan, amount) => { net.sessions[id] = { id, payment_status: 'paid', payment_intent: 'pi_' + id.slice(3), amount_total: amount, currency: 'usd', created: nowSec(), metadata: { username: u, plan } }; };

test('توحيد · ١. Apple/Google Pay: فشل السجلّ بعد الشحن، ثمّ الويب هوك والتحقّق المعلّق متزامنَين ومُعادَين — إكمالٌ واحد وشحنة واحدة، والاسترداد يجد سجلّه', async () => {
  fresh('gw1');
  const pi = walletPi('gw1', 'pro', 2000);
  fail.putAfterIncr = 1;
  let v1;
  try { v1 = await verifyPi(pi.id, 'gw1'); } finally { disarm(); }
  assert.ok(v1.code >= 500, 'العميل يُبقي الرقم معلّقًا ويعيد (cli-money-1) — ' + v1.code);
  assert.equal(await bal('gw1'), 990);
  assert.equal(kv.get('paid:lastStripePaymentIntentId:' + pi.id), 'gw1', 'الحجز باقٍ بعد الأثر — لا ردّ ولا فكّ (كان v-lock-gpay يردّ النقاط ويفكّ)');
  assert.ok(markOf('lastStripePaymentIntentId', pi.id), 'علامة الإكمال');
  const rs = await Promise.all([hook(piEvt(pi)), verifyPi(pi.id, 'gw1'), hook(piEvt(pi)), verifyPi(pi.id, 'gw1'), verifyPi(pi.id, 'gw1')]);
  assert.deepEqual([...new Set(rs.map((x) => x.code))], [200]);
  assert.ok(rs.filter((x) => x.body && x.body.completed).length <= 1, 'إكمال واحد على الأكثر يُعلَن');
  const u = users.get('gw1');
  assert.equal(u.plan, 'pro');
  assert.equal(u.planPayId, pi.id);
  assert.equal(u.lastStripePaymentIntentId, pi.id);
  assert.equal(await bal('gw1'), 990, '٧٠ + ٩٢٠ مرّة');
  assert.deepEqual(recOf(pi.id).refs, [pi.latest_charge], 'سجلّ المنح برقم الشحنة');
  assert.equal(markOf('lastStripePaymentIntentId', pi.id), undefined, 'العلامة تُمحى');
  for (let i = 0; i < 2; i++) {
    assert.equal((await hook(piEvt(pi))).code, 200);
    assert.equal((await verifyPi(pi.id, 'gw1')).body.alreadyGranted, true);
  }
  assert.equal(await bal('gw1'), 990);
  assert.equal((await hook(refundOf(pi.latest_charge, pi.id, 2000, 2000))).code, 200);
  assert.equal(tier.planActive(users.get('gw1')), false);
  assert.equal(await bal('gw1'), 70);
});

async function keptLowerCase(u) {
  fresh(u);
  await buy(u, 'max', u + 'm', 10000);
  const maxAt = users.get(u).planUpdatedAt;
  const sid = 'cs_' + u + 'p';
  const e = paidSession(sid, u, 'basic', 'pi_' + u + 'p', 1000);
  sessionFor(sid, u, 'basic', 1000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(await bal(u), 70 + 3200 + 360, 'نقاط Plus مرّة');
  const w = JSON.parse(markOf('lastStripeSessionId', sid));
  assert.equal(w.kept, true, 'العلامة تحمل قرار الخانة وقت المنح (أدنى تحت أعلى)');
  const rs = await Promise.all([hook(e), verify(sid, u), hook(e), verify(sid, u)]);
  assert.deepEqual([...new Set(rs.map((x) => x.code))], [200]);
  const x = users.get(u);
  assert.equal(x.plan, 'max', 'Max باقية (كان الإكمال يكتب Plus رئيسيّةً فينزل السقف)');
  assert.equal(x.planPayId, 'cs_' + u + 'm');
  assert.equal(x.planUpdatedAt, maxAt, 'بتاريخها');
  assert.deepEqual(x.planNext, [{ plan: 'basic', at: w.at, payId: sid }], 'فترة Plus في planNext مرّة واحدة بوقت المنح الأصليّ');
  assert.equal(tier.chatPeriod(x).plan, 'max');
  assert.equal(await bal(u), 70 + 3200 + 360, 'ولا نقاط ثانية');
  const rec = recOf(sid);
  assert.equal(rec.at, w.at, 'سجلّ المنح بوقت فترة planNext (keptAt)');
  assert.equal(rec.prev, null, 'لم يحلّ محلّ شيء');
  assert.equal((await hook(refundOf('ch_' + u + 'p', 'pi_' + u + 'p', 1000, 1000))).code, 200, 'استرداد Plus كاملًا');
  const y = users.get(u);
  assert.equal(y.plan, 'max', 'Max لا تُمسّ');
  assert.equal(y.planNext, undefined, 'فترة Plus خرجت');
  assert.equal(await bal(u), 70 + 3200);
}
test('توحيد · ٢. أدنى تحت أعلى سارية + فشل بعد الشحن + إعادة متزامنة (srv-money-4 × srv-money-2): Max تبقى، وPlus في planNext بوقته، واستردادها يسحبها هي', async () => {
  await keptLowerCase('kp1');
  await frozenClock(() => keptLowerCase('kp1f'));
});

test('توحيد · ٢ب. انتهت الأعلى بين الفشل والإعادة: الإكمال لا يكتب الأدنى رئيسيّةً، وفترته تسري بوقت دفعه (tier.chatPeriod)', async () => {
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  try {
    fresh('kx', { plan: 'max', planUpdatedAt: t - 34.5 * DAY, planPayId: 'cs_kx_old' });
    const e = paidSession('cs_kxp', 'kx', 'pro', 'pi_kxp', 2000);
    fail.putAfterIncr = 1;
    try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
    const w = JSON.parse(markOf('lastStripeSessionId', 'cs_kxp'));
    assert.equal(w.kept, true);
    assert.equal(w.at, t);
    t += DAY; // Max انتهت قبل الإعادة
    assert.equal((await hook(e)).code, 200);
    const x = users.get('kx');
    assert.equal(x.plan, 'max', 'الرئيسيّة كما هي');
    assert.equal(x.planPayId, 'cs_kx_old');
    assert.deepEqual(x.planNext, [{ plan: 'pro', at: w.at, payId: 'cs_kxp' }]);
    const cp = tier.chatPeriod(x);
    assert.equal(cp.plan, 'pro', 'Pro المدفوعة سارية');
    assert.equal(cp.at, w.at, 'من وقت دفعها لا من وقت الإعادة');
    assert.equal(await bal('kx'), 70 + 920);
  } finally { Date.now = realNow; }
});

test('توحيد · ٢ج. تجديد اشتراك Pro قديم بعد شراء Max وفشل السجلّ بعد الشحن (invoice.paid): الإعادة تكمله تحت Max، واسترداده يسحب فترته ونقاطه وحدها', async () => {
  fresh('rn');
  await buy('rn', 'max', 'rnm', 10000);
  const e = evt('invoice.paid', { id: 'in_rn1', object: 'invoice', billing_reason: 'subscription_cycle', subscription: 'sub_rn_pro', payment_intent: 'pi_rn1', charge: 'ch_rn1', amount_paid: 2000, currency: 'usd', subscription_details: { metadata: { username: 'rn', plan: 'pro' } } });
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(JSON.parse(markOf('lastStripeInvoiceId', 'in_rn1')).kept, true);
  assert.equal((await hook(e)).code, 200);
  assert.equal((await hook(e)).code, 200);
  const x = users.get('rn');
  assert.equal(x.plan, 'max', 'التجديد القديم لا يقلب المشترك إلى Pro (srv-money-3/4)');
  assert.equal(x.planPayId, 'cs_rnm');
  assert.deepEqual(x.planNext.map((n) => [n.plan, n.payId]), [['pro', 'in_rn1']]);
  assert.equal(x.lastStripeInvoiceId, 'in_rn1');
  assert.equal(await bal('rn'), 70 + 3200 + 920, 'نقاط التجديد مرّة');
  assert.equal((await hook(refundOf('ch_rn1', 'pi_rn1', 2000, 2000))).code, 200);
  const y = users.get('rn');
  assert.equal(y.plan, 'max');
  assert.equal(y.planNext, undefined);
  assert.equal(await bal('rn'), 70 + 3200);
});

async function upgradeThenLowerCase(u) {
  fresh(u);
  const eMax = paidSession('cs_' + u + 'M', u, 'max', 'pi_' + u + 'M', 10000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(eMax)).code >= 500); } finally { disarm(); }
  const tMax = JSON.parse(markOf('lastStripeSessionId', 'cs_' + u + 'M')).at;
  await buy(u, 'basic', u + 'P', 1000); // Plus يُشترى في النافذة — السجلّ لا يعرف Max بعد فلا شيء يمنعه
  assert.equal(users.get(u).plan, 'basic');
  const tP = users.get(u).planUpdatedAt;
  assert.equal((await hook(eMax)).code, 200);
  const x = users.get(u);
  assert.equal(x.plan, 'max', 'Max المدفوعة تُسلَّم (كانت تُترك تحت Plus الأحدث)');
  assert.equal(x.planPayId, 'cs_' + u + 'M');
  assert.equal(x.planUpdatedAt, tMax, 'بوقتها الأصليّ');
  assert.deepEqual(x.planNext, [{ plan: 'basic', at: tP, payId: 'cs_' + u + 'P' }], 'وPlus محفوظة بعدها كما لو كُتب المنح في وقته');
  assert.equal(tier.chatPeriod(x).plan, 'max');
  assert.equal(await bal(u), 70 + 3200 + 360);
}
test('توحيد · ٣. الأعلى فشل بعد الشحن ثمّ اشتُري أدنى قبل الإعادة: الأعلى رئيسيّة والأدنى في planNext، واسترداد كلٍّ منهما يسحبه هو', async () => {
  await upgradeThenLowerCase('sw1');
  assert.equal((await hook(refundOf('ch_sw1P', 'pi_sw1P', 1000, 1000))).code, 200, 'استرداد Plus');
  let x = users.get('sw1');
  assert.equal(x.plan, 'max');
  assert.equal(x.planNext, undefined, 'Plus خرجت من planNext');
  assert.equal(await bal('sw1'), 70 + 3200);
  await frozenClock(() => upgradeThenLowerCase('sw2'));
  assert.equal((await hook(refundOf('ch_sw2M', 'pi_sw2M', 10000, 10000))).code, 200, 'استرداد Max');
  x = users.get('sw2');
  assert.equal(x.plan, null, 'Max سُحبت');
  assert.equal(tier.chatPeriod(x).plan, 'basic', 'وPlus المدفوعة باقية');
  assert.equal(await bal('sw2'), 70 + 360);
});

test('توحيد · ٤. استرداد جزئيّ في النافذة لأدنى تحت أعلى: يُكمل المنح في planNext أوّلًا ثمّ يأخذ نصف نقاطه، والباقي يسحب فترته وحدها', async () => {
  fresh('kh');
  await buy('kh', 'max', 'khm', 10000);
  const e = paidSession('cs_khp', 'kh', 'pro', 'pi_khp', 2000);
  net.sessionList.push({ id: 'cs_khp', payment_intent: 'pi_khp', metadata: { username: 'kh', plan: 'pro' } });
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(await bal('kh'), 70 + 3200 + 920);
  assert.equal((await hook(refundOf('ch_khp', 'pi_khp', 2000, 1000))).code, 200);
  assert.equal(await bal('kh'), 70 + 3200 + 460, 'نصف نقاط الدفعة');
  let x = users.get('kh');
  assert.equal(x.plan, 'max', 'الإكمال قبل السحب لم ينزل Max');
  assert.deepEqual(x.planNext.map((n) => n.payId), ['cs_khp']);
  assert.equal(markOf('lastStripeSessionId', 'cs_khp'), undefined, 'الاسترداد أكمل فمُحيت العلامة');
  assert.equal((await hook(e)).code, 200, 'إعادة حدث الدفع');
  assert.equal(await bal('kh'), 70 + 3200 + 460, 'لا نقاط ثانية');
  assert.deepEqual(users.get('kh').planNext.map((n) => n.payId), ['cs_khp'], 'ولا فترة ثانية');
  assert.equal((await hook(refundOf('ch_khp', 'pi_khp', 2000, 2000))).code, 200);
  x = users.get('kh');
  assert.equal(x.plan, 'max');
  assert.equal(x.planPayId, 'cs_khm');
  assert.equal(x.planNext, undefined);
  assert.equal(await bal('kh'), 70 + 3200, 'الباقي ٤٦٠ لا ٩٢٠');
});

test('توحيد · ٥. ترقية وصل سجلّها ثمّ رمت كتابته (مهلة بعد الكتابة، فخّ v-lock-gpay): الإعادة تكمل سجلّ المنح بسابقته، فالاسترداد الكامل يعيد الباقة السابقة', async () => {
  fresh('ld');
  await buy('ld', 'pro', 'ldp', 2000);
  const proAt = users.get('ld').planUpdatedAt;
  const e = paidSession('cs_ldm', 'ld', 'max', 'pi_ldm', 10000);
  fail.landAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(users.get('ld').plan, 'max', 'السجلّ وصل');
  assert.equal(kv.has('payrec:cs_ldm'), false, 'وسجلّ المنح لم يُكتب');
  assert.ok(markOf('lastStripeSessionId', 'cs_ldm'));
  assert.equal((await hook(e)).code, 200);
  assert.equal(recOf('cs_ldm').prev.planPayId, 'cs_ldp', 'الإعادة كتبت سجلّ المنح بسابقته (كان «سبق الشحن» بلا سجلّ)');
  assert.equal(markOf('lastStripeSessionId', 'cs_ldm'), undefined);
  assert.equal(await bal('ld'), 70 + 920 + 3200, 'بلا شحن ثانٍ');
  assert.equal((await hook(refundOf('ch_ldm', 'pi_ldm', 10000, 10000))).code, 200);
  const x = users.get('ld');
  assert.equal(x.plan, 'pro', 'Pro المدفوعة عادت');
  assert.equal(x.planPayId, 'cs_ldp');
  assert.equal(x.planUpdatedAt, proAt);
  assert.equal(await bal('ld'), 70 + 920);
});

test('توحيد · ٦. PayPal: طلب Plus أنشأه خادمنا قبل الترقية إلى Max، اكتمل التقاطه وفشل السجلّ بعد الشحن — الويب هوك وclaim يكملانه تحت Max مرّة واحدة', async () => {
  fresh('pk');
  await ourOrder('PK1', 'CAPK1', 'pk', 'basic', '10.00', 'COMPLETED');
  await buy('pk', 'max', 'pkm', 10000);
  const ev = ppCompleted('PK1', 'CAPK1', '10.00');
  fail.putAfterIncr = 1;
  let r;
  try { r = await hook(ev, { src: 'paypal', headers: ppHead() }); } finally { disarm(); }
  assert.ok(r.code >= 500, 'لا 200 قبل أن يُكتب السجلّ — ' + r.code);
  assert.equal(await bal('pk'), 70 + 3200 + 360);
  const rs = await Promise.all([
    hook(ev, { src: 'paypal', headers: ppHead() }), pp({ action: 'claim', orderId: 'PK1', token: 'T:pk' }),
    hook(ev, { src: 'paypal', headers: ppHead() }), pp({ action: 'claim', orderId: 'PK1', token: 'T:pk' }),
  ]);
  assert.deepEqual([...new Set(rs.map((x) => x.code))], [200]);
  const x = users.get('pk');
  assert.equal(x.plan, 'max', 'لا تنزيل باقة');
  assert.equal(x.planPayId, 'cs_pkm');
  assert.deepEqual(x.planNext.map((n) => n.payId), ['PK1'], 'فترة Plus بعد Max');
  assert.equal(await bal('pk'), 70 + 3200 + 360, 'شحنة واحدة');
  assert.deepEqual(recOf('PK1').refs, ['CAPK1'], 'رقم الالتقاط مربوط فيعرفه الاسترداد');
});

test('توحيد · ٧. اشتراك Max جديد فوق اشتراك Pro قديم، وفشل السجلّ بعد الشحن (srv-money-3): لا إلغاء قبل اكتمال المنح، والإعادة تكمل ثمّ تلغي الأقدم مرّة', async () => {
  fresh('sb');
  net.subs.sub_sb_old = { id: 'sub_sb_old', status: 'active', created: nowSec() - 1000, metadata: { username: 'sb', plan: 'pro' } };
  net.subs.sub_sb_new = { id: 'sub_sb_new', status: 'active', created: nowSec(), metadata: { username: 'sb', plan: 'max' } };
  const e = evt('checkout.session.completed', { id: 'cs_sbn', payment_status: 'paid', mode: 'subscription', subscription: 'sub_sb_new', invoice: 'in_sbn', amount_total: 10000, currency: 'usd', created: nowSec(), metadata: { username: 'sb', plan: 'max' } });
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  assert.equal(net.subs.sub_sb_old.status, 'active', 'لا إلغاء قبل أن تُسلَّم الباقة الجديدة');
  assert.equal((await hook(e)).code, 200);
  assert.equal(users.get('sb').plan, 'max');
  assert.equal(net.subs.sub_sb_old.status, 'canceled', 'الإعادة أكملت ثمّ ألغت الأقدم');
  assert.equal(net.subs.sub_sb_new.status, 'active');
  assert.equal((await hook(e)).code, 200);
  assert.deepEqual(net.cancels.filter((x) => x === 'sub_sb_old'), ['sub_sb_old'], 'إلغاء واحد');
  assert.equal(await bal('sb'), 70 + 3200);
});

test('توحيد · ٨. حُذف الحساب بين الفشل والإعادة (srv-money-5): الإعادة تنبّه المالك ليردّ المبلغ مرّة ولا تشحن ثانيةً', async () => {
  fresh('dl');
  const e = paidSession('cs_dl', 'dl', 'pro', 'pi_dl', 2000);
  fail.putAfterIncr = 1;
  try { assert.ok((await hook(e)).code >= 500); } finally { disarm(); }
  users.set('dl', { username: 'dl', deleted: true, deletedAt: Date.now(), selfDeleted: true });
  alerts.length = 0;
  assert.equal((await hook(e)).code, 200);
  assert.equal((await hook(e)).code, 200);
  assert.equal(alerts.filter((a) => /محذوف/.test(String(a.title))).length, 1, 'تنبيه واحد للمالك');
  assert.equal(Number(kv.get('points:dl')), 990, 'لا شحن ثانٍ');
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
