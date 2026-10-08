// tests/pay-refund.test.cjs — v-pay-refund (قرار المالك ٨ أكتوبر ٢٠٢٦، باب المال بموافقته على البند وحده:
// «لمّا يسترجع مشترك فلوسه أو يفتح اعتراضًا في البنك: سحب الباقة والنقاط»).
//
// على المعالجات الحقيقيّة (api/webhook.js موقَّعًا، grantPlanToUser، paypal-order، points، tier، _planVideos، _mediaPlans)
// بـKV في الذاكرة وشبكة مزيّفة مثبّتة مرّة للملفّ كلّه (فخّ v-maha-server-bill: تبديلها لكلّ نداء يتسرّب مع Promise.all).
// كان الويب هوك يعالج checkout.session.completed وinvoice.paid وحدهما: الاسترداد والاعتراض يُردّ عليهما 200 ولا يُسحب شيء.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');

process.env.AUTH_SECRET = 'pay-refund-test-secret';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_pay_refund_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_refund';
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_SECRET = 'sec';
process.env.PAYPAL_MODE = 'sandbox';
delete process.env.PAYPAL_WEBHOOK_ID;

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV في الذاكرة، مع حقن أعطال الكتابة ──
const kv = new Map();
const users = new Map();
const fail = { decr: 0 };
const tick = () => new Promise((r) => setImmediate(r));
const kvApi = {
  kvGetRaw: async (k) => { await tick(); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await tick(); if (fail.decr > 0) { fail.decr--; throw new Error('ERR DB capacity quota exceeded'); } const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null),
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvExpire: async () => {}, kvIncr: async (k) => kvApi.kvIncrBy(k, 1), kvList: async () => [],
};
mock('api/_lib/kv.js', kvApi);
mock('api/_lib/auth.js', {
  getUser: async (u) => { await tick(); return users.has(u) ? structuredClone(users.get(u)) : null; },
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: (t) => (typeof t === 'string' && t.startsWith('T:') ? t.slice(2) : null),
});
mock('api/_lib/_vip.js', { isVip: async () => false });
const logged = [];
mock('api/_lib/log-error.js', { logError: (scope, e) => { logged.push({ scope, msg: e && e.message }); }, logErrorAndFlush: async (scope, e) => { logged.push({ scope, msg: e && e.message }); } });
const alerts = [];
mock('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { alerts.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });

// ── شبكة مزيّفة واحدة للملفّ: Stripe API (للدفعات القديمة بلا سجلّ) وPayPal (الرمز والالتقاط والتحقّق من التوقيع) ──
const net = { pi: {}, sessions: [], invoices: {}, charges: {}, orders: {}, captures: {}, verify: 'SUCCESS', calls: [] };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
global.fetch = async (url, init) => {
  const u = new URL(String(url));
  net.calls.push({ url: String(url), method: (init && init.method) || 'GET', body: init && init.body ? String(init.body) : '' });
  if (u.hostname === 'api.stripe.com') {
    const p = u.pathname.replace(/^\/v1\//, '');
    let m;
    if ((m = p.match(/^payment_intents\/(.+)$/))) return net.pi[m[1]] ? reply(200, net.pi[m[1]]) : reply(404, { error: { message: 'No such payment_intent' } });
    if (p === 'checkout/sessions') {
      const pi = u.searchParams.get('payment_intent'), sub = u.searchParams.get('subscription');
      return reply(200, { data: net.sessions.filter((s) => (pi && s.payment_intent === pi) || (sub && s.subscription === sub)) });
    }
    if ((m = p.match(/^invoices\/(.+)$/))) return net.invoices[m[1]] ? reply(200, net.invoices[m[1]]) : reply(404, { error: { message: 'No such invoice' } });
    if ((m = p.match(/^charges\/(.+)$/))) return net.charges[m[1]] ? reply(200, net.charges[m[1]]) : reply(404, { error: { message: 'No such charge' } });
    if (p === 'invoice_payments') return reply(200, { data: [] });
    return reply(404, { error: { message: 'unknown' } });
  }
  if (/paypal\.com$/.test(u.hostname)) {
    if (u.pathname === '/v1/oauth2/token') return reply(200, { access_token: 'A' });
    if (u.pathname === '/v1/notifications/verify-webhook-signature') return reply(200, { verification_status: net.verify });
    let m;
    if ((m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/))) { const o = net.orders[decodeURIComponent(m[1])]; return o ? reply(200, o) : reply(404, { message: 'not found' }); }
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
const planVideos = require(rp('api/_lib/_planVideos.js'));
const media = require(rp('api/_lib/_mediaPlans.js'));

const bal = async (u) => (await points.readPoints(u)).points;
const fresh = (u, rec) => { users.set(u, Object.assign({ username: u, points: 70 }, rec || {})); kv.delete('points:' + u); };
const mkRes = () => ({ code: 200, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { if (b !== undefined) this.body = b; return this; } });
const nowSec = () => Math.floor(Date.now() / 1000);

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
let seq = 0;
const evt = (type, object) => ({ id: 'evt_' + (++seq), type, data: { object } });
const paidSession = (id, username, plan, pi, amount, extra) => evt('checkout.session.completed', Object.assign({ id, payment_status: 'paid', payment_intent: pi, amount_total: amount, currency: 'usd', created: nowSec(), metadata: { username, plan } }, extra || {}));
const refundOf = (chargeId, pi, amount, refunded, extra) => evt('charge.refunded', Object.assign({ id: chargeId, object: 'charge', payment_intent: pi, amount, amount_refunded: refunded, refunded: refunded >= amount, currency: 'usd', created: nowSec() }, extra || {}));
async function buy(u, plan, n, amount) {
  const r = await hook(paidSession('cs_' + n, u, plan, 'pi_' + n, amount));
  assert.equal(r.code, 200);
}

test('١. استرداد كامل لـPro: الباقة تسقط وفيديوهات الفترة معها، والنقاط تعود لما قبل الدفعة (كان 200 بلا سحب)', async () => {
  fresh('rana');
  await buy('rana', 'pro', 'r1', 2000);
  assert.equal(users.get('rana').plan, 'pro');
  assert.equal(await bal('rana'), 990);
  assert.equal((await planVideos.planVideoStatus('rana')).total, 2);
  const r = await hook(refundOf('ch_r1', 'pi_r1', 2000, 2000));
  assert.equal(r.code, 200);
  assert.equal(tier.planActive(users.get('rana')), false, 'الباقة سُحبت');
  assert.equal(await planVideos.planVideoStatus('rana'), null, 'فيديوهات الباقة للفترة سُحبت');
  assert.equal(await bal('rana'), 70, 'نقاط الدفعة سُحبت وبقيت هديّة الترحيب');
});

test('٢. صُرف جزء من نقاط الدفعة: الاسترداد لا يُنزل الرصيد تحت الصفر', async () => {
  fresh('badr');
  await buy('badr', 'pack700', 'b1', 2499);
  assert.equal(await bal('badr'), 770);
  assert.equal((await points.spendPoints('badr', 700, 'image')).ok, true);
  assert.equal(await bal('badr'), 70);
  const r = await hook(refundOf('ch_b1', 'pi_b1', 2499, 2499));
  assert.equal(r.code, 200);
  assert.equal(Number(kv.get('points:badr')), 0, 'صفر لا ‎-630');
  assert.equal(await bal('badr'), 0);
});

test('٣. استرداد جزئيّ بالتناسب: ٢٥٪ من Max = ٨٠٠ نقطة والباقة باقية، ثمّ إكماله لـ١٠٠٪ يسحب الباقي والباقة', async () => {
  fresh('salem');
  await buy('salem', 'max', 's1', 10000);
  assert.equal(await bal('salem'), 3270);
  let r = await hook(refundOf('ch_s1', 'pi_s1', 10000, 2500));
  assert.equal(r.code, 200);
  assert.equal(await bal('salem'), 2470, '٣٢٠٠ × ٢٥٪ = ٨٠٠');
  assert.equal(tier.planActive(users.get('salem')), true, 'الجزئيّ لا يسحب الباقة');
  r = await hook(refundOf('ch_s1', 'pi_s1', 10000, 10000)); // Stripe يرسل المبلغ المسترد تراكميًّا
  assert.equal(r.code, 200);
  assert.equal(await bal('salem'), 70, 'الباقي ٢٤٠٠ لا ٣٢٠٠ مرّة ثانية');
  assert.equal(tier.planActive(users.get('salem')), false);
});

test('٤. اعتراض بنكيّ: نفس السحب، وتنبيه للمالك فيه الحساب والدفعة', async () => {
  fresh('huda');
  await buy('huda', 'basic', 'h1', 1000);
  assert.equal(await bal('huda'), 430);
  alerts.length = 0;
  const r = await hook(evt('charge.dispute.created', { id: 'dp_h1', object: 'dispute', charge: 'ch_h1', payment_intent: 'pi_h1', amount: 1000, currency: 'usd', reason: 'fraudulent', status: 'needs_response', created: nowSec() }));
  assert.equal(r.code, 200);
  assert.equal(tier.planActive(users.get('huda')), false);
  assert.equal(await bal('huda'), 70);
  assert.equal(alerts.length, 1, 'تنبيه واحد للمالك');
  assert.match(alerts[0].title + ' ' + alerts[0].body, /اعتراض/);
  assert.match(alerts[0].body, /huda/);
});

test('٥. إعادة الحدث نفسه (وتزامنه) لا تسحب مرّتين، واعتراض بعد استرداد كامل لا يسحب شيئًا جديدًا', async () => {
  fresh('omar');
  await buy('omar', 'pro', 'o1', 2000);
  const half = refundOf('ch_o1', 'pi_o1', 2000, 1000);
  await hook(half);
  const again = await hook(half);
  assert.equal(again.code, 200);
  assert.equal(await bal('omar'), 530, '٩٩٠ − ٤٦٠ مرّة وحدة');
  const full = refundOf('ch_o1', 'pi_o1', 2000, 2000);
  const rs = await Promise.all([hook(full), hook(full), hook(full)]);
  for (const x of rs) assert.ok(x.code === 200 || x.code === 503, 'نجاح أو «أعد لاحقًا» — ' + x.code);
  for (const x of rs.filter((y) => y.code === 503)) assert.equal((await hook(full)).code, 200, 'الإعادة بعد القفل تنجح بلا سحب');
  assert.equal(await bal('omar'), 70);
  assert.equal((await hook(full)).code, 200);
  alerts.length = 0;
  await hook(evt('charge.dispute.created', { id: 'dp_o1', charge: 'ch_o1', payment_intent: 'pi_o1', amount: 2000, currency: 'usd' }));
  assert.equal(await bal('omar'), 70, 'لا سحب ثانٍ لما سُحب');
  assert.equal(alerts.length, 1, 'المالك يُنبَّه بالاعتراض على أيّ حال');
});

test('٦. حساب غيّر اسمه بعد الدفع: السحب من حسابه الجديد، والاسم القديم لا يُبعث', async () => {
  fresh('oldn');
  await buy('oldn', 'pro', 'n1', 2000);
  const rec = users.get('oldn');
  users.set('newn', Object.assign({}, rec, { username: 'newn', prevUsernames: ['oldn'] }));
  users.set('oldn', { deleted: true, movedTo: 'newn' });
  kv.set('points:newn', kv.get('points:oldn')); kv.delete('points:oldn');
  const r = await hook(refundOf('ch_n1', 'pi_n1', 2000, 2000));
  assert.equal(r.code, 200);
  assert.equal(tier.planActive(users.get('newn')), false);
  assert.equal(await bal('newn'), 70);
  assert.equal(kv.has('points:oldn'), false, 'لا عدّاد تحت الاسم القديم');
  assert.equal(users.get('oldn').deleted, true);
});

test('٧. إلغاء الاشتراك (حذفه أو إيقاف تجديده) لا يسحب شيئًا: الفترة المدفوعة تكمل', async () => {
  fresh('lina');
  const r0 = await hook(paidSession('cs_l1', 'lina', 'pro', null, 2000, { mode: 'subscription', invoice: 'in_l1', subscription: 'sub_l1' }));
  assert.equal(r0.code, 200);
  for (const e of [
    evt('customer.subscription.updated', { id: 'sub_l1', status: 'active', cancel_at_period_end: true, metadata: { username: 'lina', plan: 'pro' } }),
    evt('customer.subscription.deleted', { id: 'sub_l1', status: 'canceled', metadata: { username: 'lina', plan: 'pro' } }),
  ]) assert.equal((await hook(e)).code, 200);
  assert.equal(tier.planActive(users.get('lina')), true);
  assert.equal(users.get('lina').plan, 'pro');
  assert.equal(await bal('lina'), 990);
});

test('٨. فشل الكتابة أثناء السحب يعيد non-2xx (فيعيد Stripe)، والإعادة تسحب مرّة وحدة', async () => {
  fresh('ziad');
  await buy('ziad', 'pro', 'z1', 2000);
  const e = refundOf('ch_z1', 'pi_z1', 2000, 2000);
  fail.decr = 1;
  const r1 = await hook(e);
  assert.ok(r1.code >= 500, 'non-2xx — ' + r1.code);
  assert.equal(await bal('ziad'), 990, 'لم يُسحب شيء');
  const r2 = await hook(e);
  assert.equal(r2.code, 200);
  assert.equal(await bal('ziad'), 70);
  assert.equal((await hook(e)).code, 200);
  assert.equal(await bal('ziad'), 70, 'مرّة وحدة');
  assert.equal(tier.planActive(users.get('ziad')), false);
});

test('٩. باقة الفيديو: الجزئيّ يُنقص رصيدها بالتناسب، والكامل يسحبها ورصيدها', async () => {
  fresh('noor');
  await buy('noor', 'vid_pro', 'v1', 2042);
  assert.equal((await media.mediaStatus('noor')).video.left, 2400);
  await hook(refundOf('ch_v1', 'pi_v1', 2042, 1021));
  assert.equal((await media.mediaStatus('noor')).video.left, 1200, 'النصف');
  await hook(refundOf('ch_v1', 'pi_v1', 2042, 2042));
  assert.deepEqual(await media.mediaStatus('noor'), {}, 'الباقة سُحبت');
  assert.equal(await bal('noor'), 70, 'النقاط لا تُمسّ — باقة الوسائط بلا نقاط');
});

test('١٠. التجديد الشهريّ: استرداد دفعة قديمة يسحب نقاطها فقط (الفترة الحاليّة من دفعة أحدث)، واسترداد التجديد يسحب الباقة', async () => {
  fresh('sami');
  await hook(paidSession('cs_sa', 'sami', 'pro', null, 2000, { mode: 'subscription', invoice: 'in_sa1', subscription: 'sub_sa' }));
  users.set('sami', Object.assign(users.get('sami'), { planUpdatedAt: Date.now() - 31 * 86400000 }));
  const renew = await hook(evt('invoice.paid', { id: 'in_sa2', billing_reason: 'subscription_cycle', payment_intent: 'pi_sa2', amount_paid: 2000, currency: 'usd', subscription_details: { metadata: { username: 'sami', plan: 'pro' } } }));
  assert.equal(renew.code, 200);
  assert.equal(await bal('sami'), 1910);
  // الدفعة الأولى تُعرف برقم فاتورتها (charge.invoice) — مسجَّل عند المنح من الجلسة
  await hook(refundOf('ch_sa1', 'pi_sa1', 2000, 2000, { invoice: 'in_sa1' }));
  assert.equal(await bal('sami'), 990);
  assert.equal(tier.planActive(users.get('sami')), true, 'فترة التجديد الحاليّة لا تسقط باسترداد دفعة قديمة');
  await hook(refundOf('ch_sa2', 'pi_sa2', 2000, 2000));
  assert.equal(await bal('sami'), 70);
  assert.equal(tier.planActive(users.get('sami')), false);
});

test('١١. دفعة قديمة بلا سجلّ منح: تُعرف من Stripe ومن حجز الدفعة فتُسحب؛ وبلا دليل منح = تنبيه المالك بلا سحب', async () => {
  fresh('yara');
  await buy('yara', 'pro', 'y1', 2000);
  for (const k of [...kv.keys()]) if (/^pay(rec|ref):/.test(k)) kv.delete(k); // كأنّها مُنحت قبل هذا التعديل
  const y = users.get('yara'); delete y.planPayId; users.set('yara', y); // ولا رقم دفعة على الحساب: الفترة تُعرف بقربها من وقت الدفع
  assert.ok(kv.has('paid:lastStripeSessionId:cs_y1'), 'حجز v-pay-once موجود = دليل المنح');
  net.sessions.push({ id: 'cs_y1', payment_intent: 'pi_y1', metadata: { username: 'yara', plan: 'pro' } });
  let r = await hook(refundOf('ch_y1', 'pi_y1', 2000, 2000));
  assert.equal(r.code, 200);
  assert.equal(tier.planActive(users.get('yara')), false);
  assert.equal(await bal('yara'), 70);
  // جلسة بالبيانات نفسها لم تُشحن قطّ (لا حجز ولا أثر على الحساب): لا يُسحب ما لم يُمنح
  fresh('tala', { points: 500 });
  net.sessions.push({ id: 'cs_t1', payment_intent: 'pi_t1', metadata: { username: 'tala', plan: 'pro' } });
  alerts.length = 0;
  r = await hook(refundOf('ch_t1', 'pi_t1', 2000, 2000));
  assert.equal(r.code, 200, 'لا إعادة بلا نهاية لحدث لا يُحلّ');
  assert.equal(await bal('tala'), 500);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /لم يُسحب/);
});

test('١٢. PayPal: بلا PAYPAL_WEBHOOK_ID أو بتوقيع غير صالح = رفض بلا أثر؛ الاسترداد والاعتراض الموقَّعان يسحبان', async () => {
  fresh('pia');
  const order = (id, cap, ref, plan, value) => ({ id, status: 'COMPLETED', purchase_units: [{ reference_id: ref, payments: { captures: [{ id: cap, custom_id: plan, amount: { value, currency_code: 'USD' }, status: 'COMPLETED', create_time: new Date().toISOString() }] } }] });
  net.orders.PO1 = order('PO1', 'CAP1', 'pia', 'pro', '20.00');
  const res = mkRes();
  await paypal({ method: 'POST', body: { action: 'capture', orderId: 'PO1', token: 'T:pia' } }, res);
  assert.equal(res.body.credited, true);
  assert.equal(await bal('pia'), 990);
  const refund = { id: 'WH-R1', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource_type: 'refund', resource: { id: 'RF1', status: 'COMPLETED', amount: { value: '20.00', currency_code: 'USD' }, seller_payable_breakdown: { total_refunded_amount: { value: '20.00', currency_code: 'USD' } }, links: [{ rel: 'self', href: 'https://api.sandbox.paypal.com/v2/payments/refunds/RF1' }, { rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAP1' }] } };
  const ppHeaders = { 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1', 'paypal-transmission-id': 'tx-1', 'paypal-transmission-sig': 'sig', 'paypal-transmission-time': new Date().toISOString() };
  let r = await hook(refund, { src: 'paypal', headers: ppHeaders });
  assert.equal(r.code, 503, 'بلا معرّف الويب هوك يفشل مغلقًا');
  process.env.PAYPAL_WEBHOOK_ID = 'WH-ID-TEST';
  net.verify = 'FAILURE';
  r = await hook(refund, { src: 'paypal', headers: ppHeaders });
  assert.ok(r.code >= 400 && r.code < 500, 'توقيع غير صالح — ' + r.code);
  assert.equal(await bal('pia'), 990, 'بلا أثر');
  net.verify = 'SUCCESS';
  net.calls.length = 0;
  r = await hook(refund, { src: 'paypal', headers: ppHeaders });
  assert.equal(r.code, 200);
  const v = net.calls.find((c) => /verify-webhook-signature$/.test(c.url));
  const vb = JSON.parse(v.body);
  assert.equal(vb.webhook_id, 'WH-ID-TEST');
  assert.equal(vb.transmission_id, 'tx-1');
  assert.deepEqual(vb.webhook_event, refund, 'الحدث الخامّ نفسه');
  assert.equal(tier.planActive(users.get('pia')), false);
  assert.equal(await bal('pia'), 70);
  const claim = mkRes(); // الطلب يبقى COMPLETED بعد الاسترداد: «claim» لا يعيد الشحن ولا يمحو علامة السحب
  await paypal({ method: 'POST', body: { action: 'claim', orderId: 'PO1', token: 'T:pia' } }, claim);
  assert.equal(claim.body.pointsAdded, 0);
  assert.ok(JSON.parse(kv.get('payrec:PO1')).revoked.ids.length >= 1, 'العلامة باقية');
  assert.equal((await hook(refund, { src: 'paypal', headers: ppHeaders })).code, 200);
  assert.equal(await bal('pia'), 70, 'الإعادة لا تسحب مرّتين');
  // اعتراض PayPal على التقاط آخر
  fresh('ward');
  net.orders.PO2 = order('PO2', 'CAP2', 'ward', 'basic', '10.00');
  await paypal({ method: 'POST', body: { action: 'capture', orderId: 'PO2', token: 'T:ward' } }, mkRes());
  assert.equal(await bal('ward'), 430);
  alerts.length = 0;
  r = await hook({ id: 'WH-D1', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { dispute_id: 'PP-D-1', reason: 'UNAUTHORISED', dispute_amount: { value: '10.00', currency_code: 'USD' }, disputed_transactions: [{ seller_transaction_id: 'CAP2' }] } }, { src: 'paypal', headers: ppHeaders });
  assert.equal(r.code, 200);
  assert.equal(tier.planActive(users.get('ward')), false);
  assert.equal(await bal('ward'), 70);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /ward/);
  delete process.env.PAYPAL_WEBHOOK_ID;
});
