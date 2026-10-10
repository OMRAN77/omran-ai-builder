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
// decr: فشل DECRBY التالي · userAfterDecr: رقم قراءة سجلّ الحساب التي تفشل بعد DECRBY الناجح التالي · set: { re, n } فشل الكتابة لمفتاح يطابق
const fail = { decr: 0, userAfterDecr: 0, userArm: 0, set: null };
// تأخير KV عشوائيّ ببذرة ثابتة (السباق في ٢١): كلّ نداء ينتظر ٠..max دورة إضافيّة، وكتابة سجلّ الحساب بنسبة tail تصل بعد
// ‎long..2·long‎ دورة (ذيل زمن الاستجابة: كتابة في الطريق بينما أنهى الطرف الآخر عمله كلّه)
const jitter = { rnd: null, max: 0, tail: 0, long: 0 };
const watch = { put: null }; // كلّ كتابة لسجلّ الحساب لحظة وصولها (٢٢–٢٤)
const mulberry32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const imm = () => new Promise((r) => setImmediate(r));
const tick = async () => { await imm(); if (jitter.rnd) for (let n = Math.floor(jitter.rnd() * (jitter.max + 1)); n > 0; n--) await imm(); };
const lag = async () => { await tick(); if (jitter.rnd() < jitter.tail) for (let n = jitter.long + Math.floor(jitter.rnd() * jitter.long); n > 0; n--) await imm(); };
const kvApi = {
  kvGetRaw: async (k) => { await tick(); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v) => { await tick(); if (fail.set && fail.set.n > 0 && fail.set.re.test(k)) { fail.set.n--; throw new Error('ERR DB capacity quota exceeded'); } kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await tick(); if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => {
    await tick();
    if (fail.decr > 0) { fail.decr--; throw new Error('ERR DB capacity quota exceeded'); }
    const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v));
    if (fail.userAfterDecr > 0) { fail.userArm = fail.userAfterDecr; fail.userAfterDecr = 0; }
    return v;
  },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null),
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvExpire: async () => {}, kvIncr: async (k) => kvApi.kvIncrBy(k, 1), kvList: async () => [],
};
mock('api/_lib/kv.js', kvApi);
mock('api/_lib/auth.js', {
  getUser: async (u) => { await tick(); if (fail.userArm > 0 && --fail.userArm === 0) throw new Error('ERR DB capacity quota exceeded'); return users.has(u) ? structuredClone(users.get(u)) : null; },
  putUser: async (u, rec) => { const v = structuredClone(rec); if (jitter.rnd) await lag(); users.set(u, v); if (watch.put) watch.put(u, v); }, // يُسلسَل وقت النداء ويصل متأخّرًا
  isBanned: async () => false,
  verifyToken: (t) => (typeof t === 'string' && t.startsWith('T:') ? t.slice(2) : null),
});
mock('api/_lib/_vip.js', { isVip: async () => false });
const logged = [];
mock('api/_lib/log-error.js', { logError: (scope, e) => { logged.push({ scope, msg: e && e.message }); }, logErrorAndFlush: async (scope, e) => { logged.push({ scope, msg: e && e.message }); } });
const alerts = [];
mock('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { alerts.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });

// ── شبكة مزيّفة واحدة للملفّ: Stripe API (للدفعات القديمة بلا سجلّ) وPayPal (الرمز والالتقاط والتحقّق من التوقيع) ──
const net = { pi: {}, sessions: [], invoices: {}, charges: {}, orders: {}, captures: {}, invoicePayments: {}, ipFail: 0, verify: 'SUCCESS', calls: [] };
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
    if (p === 'invoice_payments') {
      if (net.ipFail > 0) { net.ipFail--; return reply(500, { error: { type: 'api_error', message: 'An unknown error occurred' } }); }
      const ip = net.invoicePayments[u.searchParams.get('payment[payment_intent]')];
      return reply(200, { data: ip ? [ip] : [] });
    }
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

// ── المراجعة المعاكسة لـv-pay-refund: خمس ملاحظات أُثبتت بالتشغيل، لكلّ واحدة اختبار ──
const ppHead = () => ({ 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1', 'paypal-transmission-id': 'tx-' + (++seq), 'paypal-transmission-sig': 'sig', 'paypal-transmission-time': new Date().toISOString() });
const ppOrder = (id, cap, ref, plan, value) => ({ id, status: 'COMPLETED', purchase_units: [{ reference_id: ref, payments: { captures: [{ id: cap, custom_id: plan, amount: { value, currency_code: 'USD' }, status: 'COMPLETED', create_time: new Date().toISOString() }] } }] });
const ppRefund = (cap, value, total) => ({ id: 'WH-R' + (++seq), event_type: 'PAYMENT.CAPTURE.REFUNDED', resource_type: 'refund', resource: { id: 'RF' + seq, status: 'COMPLETED', amount: { value, currency_code: 'USD' }, seller_payable_breakdown: { total_refunded_amount: { value: total, currency_code: 'USD' } }, links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/' + cap }] } });
const ppDispute = (cap, value) => ({ id: 'WH-D' + (++seq), event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { dispute_id: 'PP-D-' + seq, reason: 'UNAUTHORISED', dispute_amount: { value, currency_code: 'USD' }, disputed_transactions: [{ seller_transaction_id: cap }] } });
const dispute = (n, amount) => evt('charge.dispute.created', { id: 'dp_' + n, object: 'dispute', charge: 'ch_' + n, payment_intent: 'pi_' + n, amount, currency: 'usd', reason: 'fraudulent', status: 'needs_response', created: nowSec() });

test('١٣. اعتراض على الباقي بعد استرداد جزئيّ يسحب الكلّ — Stripe وPayPal، وبأيّ ترتيب وصلا (الاعتراض سحب كامل: ٢٠)', async () => {
  fresh('dana'); // كان: استرداد ٥٠٪ ثمّ اعتراض بـ١٠٠٠ = أكبرهما ٥٠٪ — العميل استردّ كلّ المبلغ والباقة باقية
  await buy('dana', 'pro', 'da1', 2000);
  await hook(refundOf('ch_da1', 'pi_da1', 2000, 1000));
  assert.equal(await bal('dana'), 530);
  assert.equal(tier.planActive(users.get('dana')), true);
  assert.equal((await hook(dispute('da1', 1000))).code, 200);
  assert.equal(tier.planActive(users.get('dana')), false, 'الباقي اعتُرض عليه: المبلغ كلّه عاد للعميل');
  assert.equal(await bal('dana'), 70);
  fresh('dima'); // الترتيب المعكوس: الاعتراض على الباقي يصل قبل حدث استرداد سابق تأخّر — يسحب الكلّ وحده، والاسترداد بعده لا شيء
  await buy('dima', 'pro', 'di1', 2000);
  await hook(dispute('di1', 1000));
  assert.equal(tier.planActive(users.get('dima')), false);
  assert.equal(await bal('dima'), 70);
  await hook(refundOf('ch_di1', 'pi_di1', 2000, 1000));
  assert.equal(tier.planActive(users.get('dima')), false);
  assert.equal(await bal('dima'), 70);
  fresh('pala'); // PayPal: استرداد ١٠$ من ٢٠$ ثمّ اعتراض على الـ١٠$ الباقية
  net.orders.PO3 = ppOrder('PO3', 'CAP3', 'pala', 'pro', '20.00');
  await paypal({ method: 'POST', body: { action: 'capture', orderId: 'PO3', token: 'T:pala' } }, mkRes());
  assert.equal(await bal('pala'), 990);
  process.env.PAYPAL_WEBHOOK_ID = 'WH-ID-TEST';
  try {
    assert.equal((await hook(ppRefund('CAP3', '10.00', '10.00'), { src: 'paypal', headers: ppHead() })).code, 200);
    assert.equal(await bal('pala'), 530);
    assert.equal(tier.planActive(users.get('pala')), true);
    assert.equal((await hook(ppDispute('CAP3', '10.00'), { src: 'paypal', headers: ppHead() })).code, 200);
    assert.equal(tier.planActive(users.get('pala')), false);
    assert.equal(await bal('pala'), 70);
  } finally { delete process.env.PAYPAL_WEBHOOK_ID; }
});

test('١٤. استرداد دفعة حلّت محلّ فترة دفعة أخرى ما زالت مدفوعة: تعود تلك الفترة (المكرّرة والترقية والوسائط)، لا فترة دفعة مسحوبة ولا منتهية', async () => {
  fresh('duha'); // دفعتان Pro مكرّرتان: كان استرداد الثانية يُسقط الباقة وأيّام الأولى مدفوعة
  await buy('duha', 'pro', 'du1', 2000);
  const first = users.get('duha').planUpdatedAt;
  await buy('duha', 'pro', 'du2', 2000);
  assert.equal(await bal('duha'), 1910);
  await hook(refundOf('ch_du2', 'pi_du2', 2000, 2000));
  let u = users.get('duha');
  assert.equal(u.plan, 'pro');
  assert.equal(u.planPayId, 'cs_du1');
  assert.equal(u.planUpdatedAt, first);
  assert.equal(tier.planActive(u), true, 'أيّام الدفعة الأولى باقية');
  assert.equal(await bal('duha'), 990);
  await hook(refundOf('ch_du1', 'pi_du1', 2000, 2000)); // ثمّ الأولى: لا شيء قبلها
  assert.equal(tier.planActive(users.get('duha')), false);
  assert.equal(await bal('duha'), 70);
  fresh('ghaith'); // ترقية Plus ← Pro ثمّ استرداد Pro: Plus بفترتها لا null
  await buy('ghaith', 'basic', 'gh1', 1000);
  await buy('ghaith', 'pro', 'gh2', 2000);
  await hook(refundOf('ch_gh2', 'pi_gh2', 2000, 2000));
  u = users.get('ghaith');
  assert.equal(u.plan, 'basic');
  assert.equal(u.planPayId, 'cs_gh1');
  assert.equal(tier.planActive(u), true);
  assert.equal(await bal('ghaith'), 430);
  fresh('hala'); // السابقة استُردّت: لا تعود
  await buy('hala', 'basic', 'ha1', 1000);
  await buy('hala', 'pro', 'ha2', 2000);
  await hook(refundOf('ch_ha1', 'pi_ha1', 1000, 1000));
  assert.equal(users.get('hala').plan, 'pro', 'القديمة: نقاطها فقط');
  await hook(refundOf('ch_ha2', 'pi_ha2', 2000, 2000));
  assert.equal(tier.planActive(users.get('hala')), false, 'لا تُعاد فترة دفعة مسحوبة');
  assert.equal(await bal('hala'), 70);
  fresh('iman'); // نافذة السابقة انتهت: لا تعود
  await buy('iman', 'basic', 'im1', 1000);
  users.set('iman', Object.assign(users.get('iman'), { planUpdatedAt: Date.now() - 36 * 86400000 }));
  await buy('iman', 'pro', 'im2', 2000);
  await hook(refundOf('ch_im2', 'pi_im2', 2000, 2000));
  assert.equal(tier.planActive(users.get('iman')), false);
  fresh('jana'); // باقة الفيديو: استرداد الترقية يعيد الأساسيّة ورصيدها وقت الترقية (كان: delete user.media.video)
  await buy('jana', 'vid_basic', 'ja1', 1021);
  assert.equal((await points.spendPoints('jana', 15, 'minimax_video')).media, 'video');
  assert.equal((await media.mediaStatus('jana')).video.left, 1097);
  await buy('jana', 'vid_pro', 'ja2', 2042);
  assert.equal((await media.mediaStatus('jana')).video.left, 2400);
  await hook(refundOf('ch_ja2', 'pi_ja2', 2042, 2042));
  const st = await media.mediaStatus('jana');
  assert.equal(st.video && st.video.plan, 'vid_basic');
  assert.equal(st.video.left, 1097);
  assert.equal(users.get('jana').media.video.payId, 'cs_ja1');
});

test('١٥. استرداد كامل أو اعتراض يصل قبل الشحن: الدفعة تُحجز مسحوبة فلا يشحنها التحقّق ولا الويب هوك بعده', async () => {
  fresh('qadi'); // Apple/Google Pay: الـPaymentIntent يبقى succeeded بعد الاعتراض، والتحقّق من العميل مفتوح ٧٢ ساعة
  net.pi.pi_q1 = { id: 'pi_q1', object: 'payment_intent', status: 'succeeded', amount: 2000, amount_received: 2000, currency: 'usd', created: nowSec(), latest_charge: 'ch_q1', metadata: { username: 'qadi', plan: 'pro' } };
  net.charges.ch_q1 = { id: 'ch_q1', payment_intent: 'pi_q1', amount: 2000, currency: 'usd', created: nowSec() };
  alerts.length = 0;
  const d = dispute('q1', 2000);
  assert.equal((await hook(d)).code, 200);
  const res = mkRes();
  await checkout({ method: 'POST', query: { action: 'verify-payment-intent' }, body: { payment_intent_id: 'pi_q1', token: 'T:qadi' } }, res);
  assert.equal(res.body.pointsAdded, 0, 'كان: 200 {plan:pro, pointsAdded:920}');
  assert.equal(users.get('qadi').plan, undefined);
  assert.equal(await bal('qadi'), 70);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /مُنع شحنها/, 'المالك يعرف أنّ الدفعة حُجزت مسحوبة');
  assert.equal((await hook(d)).code, 200, 'إعادة الحدث بعد الحجز');
  assert.equal(kv.has('payrec:pi_q1'), false, 'الحجز ليس دليل منح: لا سجلّ باسم «!revoked»');
  fresh('rami'); // استرداد كامل لجلسة قبل أن يصل حدث دفعها
  net.sessions.push({ id: 'cs_q2', payment_intent: 'pi_q2', metadata: { username: 'rami', plan: 'basic' } });
  assert.equal((await hook(refundOf('ch_q2', 'pi_q2', 1000, 1000))).code, 200);
  assert.equal((await hook(paidSession('cs_q2', 'rami', 'basic', 'pi_q2', 1000))).code, 200);
  assert.equal(users.get('rami').plan, undefined);
  assert.equal(await bal('rami'), 70);
  fresh('sana'); // PayPal: التُقط ولم يُشحن (فشل عابر)، ثمّ استُردّ كاملًا — الطلب يبقى COMPLETED فكان «claim» يشحنه
  net.orders.PO4 = ppOrder('PO4', 'CAP4', 'sana', 'pro', '20.00');
  net.captures.CAP4 = { id: 'CAP4', status: 'REFUNDED', amount: { value: '20.00', currency_code: 'USD' }, create_time: new Date().toISOString(), supplementary_data: { related_ids: { order_id: 'PO4' } } };
  process.env.PAYPAL_WEBHOOK_ID = 'WH-ID-TEST';
  try {
    assert.equal((await hook(ppRefund('CAP4', '20.00', '20.00'), { src: 'paypal', headers: ppHead() })).code, 200);
  } finally { delete process.env.PAYPAL_WEBHOOK_ID; }
  const claim = mkRes();
  await paypal({ method: 'POST', body: { action: 'claim', orderId: 'PO4', token: 'T:sana' } }, claim);
  assert.equal(claim.body.pointsAdded, 0);
  assert.equal(users.get('sana').plan, undefined);
  assert.equal(await bal('sana'), 70);
});

test('١٦. عطل Stripe العابر أثناء تعرّف دفعة بلا سجلّ = 500 فيعيد Stripe (لا «لا سجلّ» و200)، والتنبيه يُحفظ في سجلّ أخطاء المالك', async () => {
  fresh('kamal');
  assert.equal((await hook(paidSession('cs_k1', 'kamal', 'pro', null, 2000, { mode: 'subscription', invoice: 'in_k1', subscription: 'sub_k1' }))).code, 200);
  kv.delete('payrec:cs_k1'); kv.delete('payref:in_k1'); // مُنحت قبل v-pay-refund
  const k = users.get('kamal'); delete k.planPayId; users.set('kamal', k);
  net.invoices.in_k1 = { id: 'in_k1', billing_reason: 'subscription_create', parent: { subscription_details: { subscription: 'sub_k1', metadata: { username: 'kamal', plan: 'pro' } } } };
  net.sessions.push({ id: 'cs_k1', subscription: 'sub_k1', metadata: { username: 'kamal', plan: 'pro' } });
  net.invoicePayments.pi_k1 = { invoice: 'in_k1' };
  net.ipFail = 1;
  const e = refundOf('ch_k1', 'pi_k1', 2000, 2000); // شكل basil: الشحنة بلا invoice، فتُعرف من invoice_payments
  let r = await hook(e);
  assert.ok(r.code >= 500, 'non-2xx فيعيد Stripe — ' + r.code);
  assert.equal(users.get('kamal').plan, 'pro');
  r = await hook(e);
  assert.equal(r.code, 200);
  assert.equal(tier.planActive(users.get('kamal')), false);
  assert.equal(await bal('kamal'), 70);
  logged.length = 0;
  assert.equal((await hook(refundOf('ch_k9', 'pi_k9', 500, 500))).code, 200);
  assert.ok(logged.some((l) => l.scope === 'pay-refund:owner-alert' && /بلا سجلّ/.test(l.msg)), 'التنبيه في سجلّ الأخطاء لا في console وحده');
});

test('١٧. كتابة متزامنة لسجلّ الحساب (مرآة صرف النقاط) قرأت قبل السحب لا تُرجع الباقة المسحوبة — المحادثة والوسائط', async () => {
  // كلّ حساب يبدأ صرفه بعد السحب بعدد خطوات مختلف — يغطّي نافذة القراءة ثمّ الكتابة
  const chat = Array.from({ length: 40 }, (_, i) => 'race' + i);
  const vid = Array.from({ length: 40 }, (_, i) => 'mrace' + i);
  for (const [i, u] of chat.entries()) { fresh(u); await buy(u, 'pro', 'rc' + i, 2000); }
  for (const [i, u] of vid.entries()) { fresh(u); await buy(u, 'vid_pro', 'mr' + i, 2042); }
  const race = async (u, i, n, amount) => {
    const refund = hook(refundOf('ch_' + n + i, 'pi_' + n + i, amount, amount));
    for (let t = 0; t < i; t++) await tick();
    const spend = points.spendPoints(u, 10, 'chat');
    await Promise.all([refund, spend]);
  };
  await Promise.all(chat.map((u, i) => race(u, i, 'rc', 2000)).concat(vid.map((u, i) => race(u, i, 'mr', 2042))));
  const back = chat.filter((u) => tier.planActive(users.get(u))).concat(vid.filter((u) => media.mediaActive(users.get(u), 'video')));
  assert.deepEqual(back, [], 'حسابات رجعت لها الباقة: ' + back.length + ' من ' + (chat.length + vid.length));
  for (const u of chat) assert.equal(await bal(u), 60);
  for (const u of vid) assert.equal(await bal(u), 60);
});

// ── المراجعة المعاكسة الثانية: أربع ملاحظات أُثبتت بالتشغيل على الإصلاحات السابقة، لكلّ واحدة اختبار ──
const ppReverse = (cap, value) => ({ id: 'WH-V' + (++seq), event_type: 'PAYMENT.CAPTURE.REVERSED', resource_type: 'refund', resource: { id: 'RV' + seq, status: 'COMPLETED', amount: { value, currency_code: 'USD' }, links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/' + cap }] } });
const disarm = () => { fail.userAfterDecr = 0; fail.userArm = 0; fail.set = null; };

test('١٨. بعد نجاح خصم النقاط لا شيء يرمي: فشل قراءة سجلّ الحساب بعده لا يعيد الحدث فيُخصم مرّتين من نقاط دفعة أخرى', async () => {
  fresh('kfa'); // كان: 500 والعلامة ممسوحة، فالإعادة تخصم نقاط pack700 ثانية من نقاط pack300 ← ٠ لا ٣٧٠
  await buy('kfa', 'pack700', 'kf1', 2499);
  await buy('kfa', 'pack300', 'kf2', 1299);
  assert.equal(await bal('kfa'), 1070);
  const e = refundOf('ch_kf1', 'pi_kf1', 2499, 2499);
  fail.userAfterDecr = 2; // الأولى مرآة السجلّ (أفضل جهد)، والثانية إعادة القراءة (ج)
  let r;
  try { r = await hook(e); } finally { disarm(); }
  assert.equal(r.code, 200);
  assert.equal(await bal('kfa'), 370);
  assert.equal((await hook(e)).code, 200);
  assert.equal(await bal('kfa'), 370, 'نقاط pack300 لا تُمسّ');
  fresh('kfb'); // باقة المحادثة: إعادة القراءة (ج) تجري فعلًا بعد الخصم
  await buy('kfb', 'pro', 'kf3', 2000);
  await buy('kfb', 'pack300', 'kf4', 1299);
  assert.equal(await bal('kfb'), 1290);
  const e2 = refundOf('ch_kf3', 'pi_kf3', 2000, 2000);
  logged.length = 0;
  fail.userAfterDecr = 2;
  try { r = await hook(e2); } finally { disarm(); }
  assert.equal(r.code, 200, 'لا 500 بعد خصم تمّ');
  assert.equal(tier.planActive(users.get('kfb')), false);
  assert.equal(await bal('kfb'), 370);
  assert.ok(logged.some((l) => /^pay-refund:/.test(l.scope) && /quota/.test(l.msg)), 'الفشل في سجلّ أخطاء المالك');
  assert.equal((await hook(e2)).code, 200);
  assert.equal(await bal('kfb'), 370, 'مرّة وحدة');
});

test('١٩. استرداد ترقية الوسائط وفشل كتابة رصيد الفترة العائدة: الإعادة تصلحه، لا يبقى رصيد الباقة المستردّة تحت الأدنى', async () => {
  fresh('kfc'); // كان: الفترة السابقة تُكتب أوّلًا ثمّ يفشل رصيدها ← الإعادة لا تطابق فيبقى ٢٤٠٠ تحت vid_basic (رصيدها ١٢٠٠)
  await buy('kfc', 'vid_basic', 'kf5', 1021);
  await buy('kfc', 'vid_pro', 'kf6', 2042);
  assert.equal((await media.mediaStatus('kfc')).video.left, 2400);
  const e = refundOf('ch_kf6', 'pi_kf6', 2042, 2042);
  fail.set = { re: /^media:video:kfc$/, n: 1 };
  let r;
  try { r = await hook(e); } finally { disarm(); }
  assert.ok(r.code >= 500, 'non-2xx فيعيد Stripe — ' + r.code);
  assert.equal((await hook(e)).code, 200);
  const st = await media.mediaStatus('kfc');
  assert.equal(st.video && st.video.plan, 'vid_basic');
  assert.equal(st.video.left, 1200);
  assert.equal(users.get('kfc').media.video.payId, 'cs_kf5');
  assert.equal((await hook(e)).code, 200);
  assert.equal((await media.mediaStatus('kfc')).video.left, 1200);
});

test('٢٠. الاعتراض البنكيّ سحب كامل بغضّ النظر عن مبلغه (قرار المالك: نفس السحب + تنبيه)، ولا يُجمع مع ردّ المال نفسه', async () => {
  fresh('kfd'); // Stripe: استفسار/اعتراض على نصف المبلغ — كان ٥٣٠ والباقة باقية، ثمّ ردّ النصف نفسه يُحسب مرّتين فتسقط
  await buy('kfd', 'pro', 'kf7', 2000);
  alerts.length = 0;
  const d = evt('charge.dispute.created', { id: 'dp_kf7', object: 'dispute', charge: 'ch_kf7', payment_intent: 'pi_kf7', amount: 1000, currency: 'usd', reason: 'general', status: 'warning_needs_response', created: nowSec() });
  assert.equal((await hook(d)).code, 200);
  assert.equal(tier.planActive(users.get('kfd')), false, 'الاعتراض يسحب الباقة');
  assert.equal(await bal('kfd'), 70, 'ونقاطها كلّها');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /kfd/);
  assert.equal((await hook(refundOf('ch_kf7', 'pi_kf7', 2000, 1000))).code, 200);
  assert.equal(await bal('kfd'), 70, 'لا سحب ثانٍ');
  process.env.PAYPAL_WEBHOOK_ID = 'WH-ID-TEST';
  try {
    fresh('kfe'); // PayPal: اعتراض ١٠$ من ٢٠$ ثمّ استرداد ١٠$ — كان ٥٣٠ ثمّ ٧٠
    net.orders.PO5 = ppOrder('PO5', 'CAP5', 'kfe', 'pro', '20.00');
    await paypal({ method: 'POST', body: { action: 'capture', orderId: 'PO5', token: 'T:kfe' } }, mkRes());
    assert.equal(await bal('kfe'), 990);
    assert.equal((await hook(ppDispute('CAP5', '10.00'), { src: 'paypal', headers: ppHead() })).code, 200);
    assert.equal(tier.planActive(users.get('kfe')), false);
    assert.equal(await bal('kfe'), 70);
    assert.equal((await hook(ppRefund('CAP5', '10.00', '10.00'), { src: 'paypal', headers: ppHead() })).code, 200);
    assert.equal(await bal('kfe'), 70);
    fresh('kfg'); // انعكاس جزئيّ (اعتراض عبر البطاقة) = سحب كامل كذلك
    net.orders.PO6 = ppOrder('PO6', 'CAP6', 'kfg', 'basic', '10.00');
    await paypal({ method: 'POST', body: { action: 'capture', orderId: 'PO6', token: 'T:kfg' } }, mkRes());
    assert.equal(await bal('kfg'), 430);
    assert.equal((await hook(ppReverse('CAP6', '5.00'), { src: 'paypal', headers: ppHead() })).code, 200);
    assert.equal(tier.planActive(users.get('kfg')), false);
    assert.equal(await bal('kfg'), 70);
  } finally { delete process.env.PAYPAL_WEBHOOK_ID; }
});

test('٢١. سحب الدفعتين معًا (Plus ثمّ Pro، والوسائط) بتأخير KV عشوائيّ: لا تعود فترة دفعة مسحوبة كاملًا', async () => {
  // كان: سحب الأحدث يقرأ سجلّ الأقدم قبل أن يُعلَّم ثمّ يكتب فترته بعد أن أنهى سحبُ الأقدم إعادة القراءة (ج) — بذرة ثابتة
  const chat = Array.from({ length: 300 }, (_, i) => 'rra' + i);
  const vid = Array.from({ length: 100 }, (_, i) => 'rva' + i);
  for (const [i, u] of chat.entries()) { fresh(u); await buy(u, 'basic', 'xa' + i, 1000); await buy(u, 'pro', 'xb' + i, 2000); }
  for (const [i, u] of vid.entries()) { fresh(u); await buy(u, 'vid_basic', 'ya' + i, 1021); await buy(u, 'vid_pro', 'yb' + i, 2042); }
  Object.assign(jitter, { rnd: mulberry32(20261008), max: 3, tail: 0.1, long: 100 }); // قبل الإصلاح: ٦–١٧ حسابًا من ٤٠٠ في كلّ بذرة جُرّبت
  let codes;
  try {
    codes = await Promise.all(chat.flatMap((u, i) => [hook(refundOf('ch_xa' + i, 'pi_xa' + i, 1000, 1000)), hook(refundOf('ch_xb' + i, 'pi_xb' + i, 2000, 2000))])
      .concat(vid.flatMap((u, i) => [hook(refundOf('ch_ya' + i, 'pi_ya' + i, 1021, 1021)), hook(refundOf('ch_yb' + i, 'pi_yb' + i, 2042, 2042))])));
  } finally { jitter.rnd = null; }
  assert.deepEqual([...new Set(codes.map((x) => x.code))], [200]);
  const back = chat.filter((u) => tier.planActive(users.get(u))).concat(vid.filter((u) => media.mediaActive(users.get(u), 'video')));
  assert.deepEqual(back, [], 'حسابات بقيت لها فترة دفعة مسحوبة كاملًا: ' + back.length + ' من ' + (chat.length + vid.length));
  for (const u of chat) assert.equal(await bal(u), 70);
});

// ── المراجعة المعاكسة الثالثة: كلّ كاتب يكتب سجلّ الحساب كاملًا من قراءة سابقة (KV بلا CAS) — قفل الحساب (v-acct-lock) ──
// بتأخير KV ببذرة ثابتة كالاختبار ٢١. الأرقام «قبل» من تشغيل هذه الاختبارات نفسها على الكود السابق.
const jittered = async (seed, jobs) => {
  Object.assign(jitter, { rnd: mulberry32(seed), max: 3, tail: 0.1, long: 100 });
  try { return await Promise.all(jobs()); } finally { jitter.rnd = null; }
};
const codesOf = (rs) => [...new Set(rs.filter((x) => x && typeof x.code === 'number').map((x) => x.code))];
// كتابةٌ تعيد فترةً أزالتها كتابةٌ سابقة وسجلّ دفعتها مسحوب كاملًا — تُعدّ لحظة وصولها، قبل أن تصلحها (د) بعد مهلتها.
// قفل الحساب يمنعها من أصلها (كلّ كاتب يقرأ طازجًا تحت القفل)؛ (د) وحدها تصلح النتيجة بعدها ولا تمنعها، فلا تكفي النتيجة النهائيّة شاهدًا.
const revokedFully = (pid) => { const r = kv.get('payrec:' + pid); return !!(r && (JSON.parse(r).revoked || {}).plan); };
const slotsOf = (v) => [['chat', v.planPayId], ['video', v.media && v.media.video && v.media.video.payId], ['image', v.media && v.media.image && v.media.image.payId]];
async function resurrections(run) {
  const last = new Map(), gone = new Set(), hits = new Set();
  for (const [u, v] of users) for (const [slot, pid] of slotsOf(v)) last.set(u + '|' + slot, pid || null); // الحال قبل السباق
  watch.put = (u, v) => {
    for (const [slot, pid] of slotsOf(v)) {
      const k = u + '|' + slot;
      const prev = last.get(k);
      last.set(k, pid || null);
      if (pid && gone.has(k + '|' + pid)) hits.add(u);
      if (prev && prev !== pid && revokedFully(prev)) gone.add(k + '|' + prev);
    }
  };
  try { return { out: await run(), hits: [...hits] }; } finally { watch.put = null; }
}

test('٢٢. سحب باقتين على خانتين مختلفتين معًا (المحادثة والفيديو، والصور والفيديو): لا تعود إحداهما', async () => {
  // كان: كلّ سحب يكتب السجلّ كاملًا من قراءته و(ج) لا تفحص إلّا خانتها — فسحب المحادثة يعيد باقة الفيديو المسحوبة معه والعكس
  const cv = Array.from({ length: 200 }, (_, i) => 'xcv' + i);
  const iv = Array.from({ length: 100 }, (_, i) => 'xiv' + i);
  for (const u of cv) { fresh(u); await buy(u, 'pro', u + 'c', 2000); await buy(u, 'vid_pro', u + 'v', 2042); }
  for (const u of iv) { fresh(u); await buy(u, 'img_basic', u + 'i', 1021); await buy(u, 'vid_pro', u + 'v', 2042); }
  const { out: rs, hits } = await resurrections(() => jittered(20261008, () => cv.flatMap((u) => [hook(refundOf('ch_' + u + 'c', 'pi_' + u + 'c', 2000, 2000)), hook(refundOf('ch_' + u + 'v', 'pi_' + u + 'v', 2042, 2042))])
    .concat(iv.flatMap((u) => [hook(refundOf('ch_' + u + 'i', 'pi_' + u + 'i', 1021, 1021)), hook(refundOf('ch_' + u + 'v', 'pi_' + u + 'v', 2042, 2042))]))));
  assert.deepEqual(codesOf(rs), [200]);
  assert.deepEqual(hits, [], 'كتابة أعادت فترة مسحوبة: ' + hits.length);
  const back = cv.filter((u) => tier.planActive(users.get(u)) || media.mediaActive(users.get(u), 'video'))
    .concat(iv.filter((u) => media.mediaActive(users.get(u), 'image') || media.mediaActive(users.get(u), 'video')));
  assert.deepEqual(back, [], 'حسابات عادت لها باقة مسحوبة: ' + back.length + ' من ' + (cv.length + iv.length)); // قبل: ١٤٩ كتابة، و٦٠ حسابًا في النهاية
  for (const u of cv) assert.equal(await bal(u), 70);
});

test('٢٣. سحب رزمة نقاط أو استرداد جزئيّ مع سحب كامل لباقة على الحساب نفسه: مرآة النقاط لا تعيد الفترة المسحوبة', async () => {
  // كان: مرآة النقاط في السحب تكتب السجلّ كاملًا من قراءة سبقت السحب الكامل الآخر، ولا تجري بعدها (ج)
  const A = Array.from({ length: 300 }, (_, i) => 'xpa' + i); // pro كامل + pack300 كامل
  const B = Array.from({ length: 200 }, (_, i) => 'xpb' + i); // pro كامل + pack300 نصفه
  const C = Array.from({ length: 200 }, (_, i) => 'xpc' + i); // vid_pro كامل + pack300 نصفه
  for (const u of A.concat(B)) { fresh(u); await buy(u, 'pro', u + 'c', 2000); await buy(u, 'pack300', u + 'k', 1299); }
  for (const u of C) { fresh(u); await buy(u, 'vid_pro', u + 'v', 2042); await buy(u, 'pack300', u + 'k', 1299); }
  const { out: rs, hits } = await resurrections(() => jittered(20261008, () => [
    ...A.flatMap((u) => [hook(refundOf('ch_' + u + 'c', 'pi_' + u + 'c', 2000, 2000)), hook(refundOf('ch_' + u + 'k', 'pi_' + u + 'k', 1299, 1299))]),
    ...B.flatMap((u) => [hook(refundOf('ch_' + u + 'c', 'pi_' + u + 'c', 2000, 2000)), hook(refundOf('ch_' + u + 'k', 'pi_' + u + 'k', 1299, 650))]),
    ...C.flatMap((u) => [hook(refundOf('ch_' + u + 'v', 'pi_' + u + 'v', 2042, 2042)), hook(refundOf('ch_' + u + 'k', 'pi_' + u + 'k', 1299, 650))]),
  ]));
  assert.deepEqual(codesOf(rs), [200]);
  assert.deepEqual(hits, [], 'كتابة أعادت فترة مسحوبة: ' + hits.length);
  const back = A.concat(B).filter((u) => tier.planActive(users.get(u))).concat(C.filter((u) => media.mediaActive(users.get(u), 'video')));
  assert.deepEqual(back, [], 'حسابات عادت لها باقة مسحوبة: ' + back.length + ' من ' + (A.length + B.length + C.length)); // قبل: ٢٥ كتابة، و٦ حسابات في النهاية
  for (const u of A) assert.equal(await bal(u), 70);
  for (const u of B.concat(C)) assert.equal(await bal(u), 220, '٣٠٠ × ٥٠٪ = ١٥٠ من الرزمة');
});

test('٢٤. شراء جديد يُمنح مع سحب كامل لفترة حاليّة على الحساب نفسه: لا يضيع المنح ولا رصيده', async () => {
  // كان: السحب يكتب نسخته القديمة من السجلّ فوق المنح الجديد — الباقة المشتراة للتوّ تختفي ونقاطها في العدّاد بلا باقة
  const A = Array.from({ length: 150 }, (_, i) => 'xga' + i); // Plus ← Pro، استرداد Pro مع شراء Max
  const B = Array.from({ length: 150 }, (_, i) => 'xgb' + i); // Pro، استرداده مع شراء Max
  const V = Array.from({ length: 150 }, (_, i) => 'xgv' + i); // vid_basic ← vid_pro، استرداد vid_pro مع شراء vid_max
  for (const u of A) { fresh(u); await buy(u, 'basic', u + '1', 1000); await buy(u, 'pro', u + '2', 2000); }
  for (const u of B) { fresh(u); await buy(u, 'pro', u + '1', 2000); }
  for (const u of V) { fresh(u); await buy(u, 'vid_basic', u + '1', 1021); await buy(u, 'vid_pro', u + '2', 2042); }
  const rs = await jittered(20261008, () => [
    ...A.flatMap((u) => [hook(refundOf('ch_' + u + '2', 'pi_' + u + '2', 2000, 2000)), hook(paidSession('cs_' + u + '3', u, 'max', 'pi_' + u + '3', 10000))]),
    ...B.flatMap((u) => [hook(refundOf('ch_' + u + '1', 'pi_' + u + '1', 2000, 2000)), hook(paidSession('cs_' + u + '2', u, 'max', 'pi_' + u + '2', 10000))]),
    ...V.flatMap((u) => [hook(refundOf('ch_' + u + '2', 'pi_' + u + '2', 2042, 2042)), hook(paidSession('cs_' + u + '3', u, 'vid_max', 'pi_' + u + '3', 10211))]),
  ]);
  assert.deepEqual(codesOf(rs), [200]);
  const lost = A.filter((u) => users.get(u).plan !== 'max' || users.get(u).planPayId !== 'cs_' + u + '3')
    .concat(B.filter((u) => users.get(u).plan !== 'max' || users.get(u).planPayId !== 'cs_' + u + '2'))
    .concat(V.filter((u) => { const m = users.get(u).media && users.get(u).media.video; return !(m && m.plan === 'vid_max' && m.payId === 'cs_' + u + '3'); }));
  assert.deepEqual(lost, [], 'شراء ضاع: ' + lost.length + ' من ' + (A.length + B.length + V.length)); // قبل: ٢٠
  for (const u of A) assert.equal(await bal(u), 3630, '٧٠ + ٣٦٠ + ٣٢٠٠');
  for (const u of B) assert.equal(await bal(u), 3270);
  for (const u of V) assert.equal(Number(kv.get('media:video:' + u)), media.MEDIA_PLANS.vid_max.budget);
});

test('٢٥. صرف نقاط متزامن مع سحب كامل (مرآته تقرأ قبل السحب وتكتب بعده): (د) تسحب الفترة العائدة — المحادثة والوسائط', async () => {
  // كان: كتابة المرآة القديمة تصل بعد (ج) فتعود الفترة المسحوبة والحدث «تمّ». تضييق لا سدّ: كتابةٌ أبطأ من مهلة (د) تبقى ممكنة
  const C = Array.from({ length: 200 }, (_, i) => 'xsc' + i);
  const V = Array.from({ length: 200 }, (_, i) => 'xsv' + i);
  for (const u of C) { fresh(u); await buy(u, 'pro', u + 'c', 2000); }
  for (const u of V) { fresh(u); await buy(u, 'vid_pro', u + 'v', 2042); }
  const rs = await jittered(20261008, () => C.flatMap((u) => [hook(refundOf('ch_' + u + 'c', 'pi_' + u + 'c', 2000, 2000)), points.spendPoints(u, 10, 'chat')])
    .concat(V.flatMap((u) => [hook(refundOf('ch_' + u + 'v', 'pi_' + u + 'v', 2042, 2042)), points.spendPoints(u, 10, 'chat')])));
  assert.deepEqual(codesOf(rs), [200]);
  const back = C.filter((u) => tier.planActive(users.get(u))).concat(V.filter((u) => media.mediaActive(users.get(u), 'video')));
  assert.deepEqual(back, [], 'حسابات عادت لها باقة مسحوبة: ' + back.length + ' من ' + (C.length + V.length)); // قبل: ٦٨
  for (const u of C.concat(V)) assert.equal(await bal(u), 60);
});

test('٢٦. فشل السحب قبل أيّ خصم وفشل فكّ علامته: المالك يُنبَّه بالحساب والدفعة ورقم الحدث (كان logError وحده)', async () => {
  fresh('kfh'); // العلامة باقية فكلّ إعادة «dup» تردّ 200 بلا سحب — لا يُعاد وحده، فلا بدّ أن يعرف المالك ليسحبه يدويًّا
  await buy('kfh', 'pack700', 'kf8', 2499);
  const e = refundOf('ch_kf8', 'pi_kf8', 2499, 2499);
  let n = 0;
  fail.decr = 1; // الأثر يفشل قبل الخصم
  fail.set = { re: { test: (k) => k === 'payrec:cs_kf8' && ++n === 2 }, n: 1 }; // الكتابة الأولى العلامة، والثانية فكّها
  alerts.length = 0;
  let r;
  try { r = await hook(e); } finally { disarm(); fail.decr = 0; }
  assert.ok(r.code >= 500, 'non-2xx — ' + r.code);
  assert.equal(await bal('kfh'), 770, 'لم يُسحب شيء');
  assert.equal(alerts.length, 1, 'تنبيه واحد للمالك');
  assert.match(alerts[0].title, /يدويًّا/);
  for (const s of ['kfh', 'pack700', 'cs_kf8', 'stripe:' + e.id]) assert.ok(alerts[0].body.includes(s), 'التنبيه فيه ' + s + ' — ' + alerts[0].body);
});

test('٢٧. قفل الحساب مشغول ~٨ ثوانٍ: السحب والمنح يرميان قبل أيّ أثر (non-2xx فيعيد المرسل)، والإعادة بعد فكّه تكمل', async () => {
  fresh('kfi');
  await buy('kfi', 'pro', 'kf9', 2000);
  kv.set('db/acct-lock/kfi', '1'); // عمليّة أخرى على الحساب لم تنتهِ
  // ساعة مزيّفة: كلّ انتظار يمرّ فورًا ويقدّم الساعة بمدّته — فلا ٨ ثوانٍ حقيقيّة لكلّ نداء
  const realNow = Date.now, realTimeout = global.setTimeout;
  let skew = 0;
  Date.now = () => realNow() + skew;
  global.setTimeout = (fn, ms, ...a) => { skew += Math.max(0, Number(ms) || 0); return realTimeout(fn, 0, ...a); };
  let r1, g1;
  try {
    r1 = await hook(refundOf('ch_kf9', 'pi_kf9', 2000, 2000));
    g1 = await hook(paidSession('cs_kf10', 'kfi', 'pack300', 'pi_kf10', 1299));
  } finally { Date.now = realNow; global.setTimeout = realTimeout; }
  assert.ok(skew >= 8000, 'انتظر القفل ~٨ ثوانٍ — ' + skew);
  assert.ok(r1.code >= 500, 'السحب non-2xx — ' + r1.code);
  assert.ok(g1.code >= 500, 'المنح non-2xx — ' + g1.code);
  assert.equal(users.get('kfi').plan, 'pro');
  assert.equal(tier.planActive(users.get('kfi')), true, 'لا أثر');
  assert.equal(await bal('kfi'), 990);
  assert.equal(JSON.parse(kv.get('payrec:cs_kf9')).revoked, undefined, 'علامة الحدث فُكّت فيُعاد');
  assert.equal(kv.has('paid:lastStripeSessionId:cs_kf10'), false, 'حجز الدفعة لم يُؤخذ فتُشحن في الإعادة');
  kv.delete('db/acct-lock/kfi');
  assert.equal((await hook(refundOf('ch_kf9', 'pi_kf9', 2000, 2000))).code, 200);
  assert.equal(tier.planActive(users.get('kfi')), false);
  assert.equal(await bal('kfi'), 70);
  assert.equal((await hook(paidSession('cs_kf10', 'kfi', 'pack300', 'pi_kf10', 1299))).code, 200);
  assert.equal(await bal('kfi'), 370);
  assert.equal(kv.has('db/acct-lock/kfi'), false, 'القفل فُكّ');
});

test('٢٨. حساب غيّر اسمه سبع مرّات بعد الدفع: الاسترداد يسحب من حسابه الحاليّ (كان BUSY أبديًّا: liveAccount بخمس قفزات)', async () => {
  fresh('rn6');
  await buy('rn6', 'pro', 'r6', 2000);
  let prev = 'rn6';
  for (let i = 1; i <= 7; i++) {
    const next = 'rn6_' + i;
    const rec = users.get(prev);
    users.set(next, Object.assign({}, rec, { username: next }));
    users.set(prev, { deleted: true, movedTo: next });
    kv.set('points:' + next, kv.get('points:' + prev)); kv.delete('points:' + prev);
    prev = next;
  }
  const r = await hook(refundOf('ch_r6', 'pi_r6', 2000, 2000));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(tier.planActive(users.get('rn6_7')), false);
  assert.equal(await bal('rn6_7'), 70);
});
