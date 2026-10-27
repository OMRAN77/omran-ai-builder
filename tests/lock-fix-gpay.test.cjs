// tests/lock-fix-gpay.test.cjs — v-lock-gpay (باب المال، موافقة المالك ٢٧ أكتوبر «صلح الخطير وابدا فيهم كلهم»):
// Apple Pay / Google Pay تُحصَّل ولا تُشحن إن تعثّر طلب التحقّق الوحيد.
//   srv-money-1  الويب هوك يشحن payment_intent.succeeded (والحجز الذرّيّ يمنع الازدواج مع التحقّق من العميل)
//   cli-money-1  رقم العمليّة يُحفظ قبل التأكيد ويُعاد تحقّقه حتّى يُشحن، و«وصلنا دفعك» لا «حاول مرة أخرى»
//   cli-money-5  صفحة نجاح Stripe لا تقول «حاول مرة أخرى» ولا تمسح الجلسة المعلّقة قبل الشحن، وردّ التقاط PayPal الضائع
//   cli-money-9  الضغط أثناء فحص التوفّر «جارٍ التجهيز» لا «غير متوفر»، وإعداد نافذة أقدم لا يكتب فوق أحدث
// الخادم: api/webhook.js موقَّعًا وcreate-checkout-session الحقيقيّان بـKV في الذاكرة وشبكة Stripe مزيّفة مثبّتة مرّة للملفّ
// (فخّ v-maha-server-bill). العميل: أجزاء js/app-06-checkout.js الحقيقيّة في vm بـDOM مزيّف، وطلباته تصل المعالجات الحقيقيّة نفسها.
// لا نداء دفع حقيقيّ ولا شبكة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');

process.env.AUTH_SECRET = 'lock-gpay-test-secret';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_lock_gpay_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_lock_gpay';
process.env.OMRAN_TEST_FAST_SLEEP = '1'; // getUser الحقيقيّ (مسار عطل القراءة أدناه) بلا انتظار ١٫٨ ثانية

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV وسجلّات الحسابات في الذاكرة، مع حقن أعطال ──
const kv = new Map();
const users = new Map();
// get: فشل قراءة الحساب التالية (عطل KV يدوم أطول من محاولات getUser الأربع) · put: فشل كتابته (لم تصل) · putLanded: وصلت ثمّ رمت
// (مهلة بعد الكتابة) · getAfterPut: تفشل القراءة التي تلي فشل الكتابة (وصلت أو لم تصل)
const fail = { get: 0, put: 0, putLanded: 0, getAfterPut: 0 };
let userReadOutage = false; // عطل قراءة سجلّات الحسابات في KV — يراه getUser الحقيقيّ
const imm = () => new Promise((r) => setImmediate(r));
const kvApi = {
  kvGetRaw: async (k) => { await imm(); return kv.has(k) ? String(kv.get(k)) : null; },
  kvSetRaw: async (k, v) => { await imm(); kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await imm(); if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { await imm(); const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await imm(); const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async (k) => { if (userReadOutage && String(k).startsWith('db/users/')) throw new Error('ERR DB read failed'); return kv.has(k) ? JSON.parse(kv.get(k)) : null; },
  kvPutJSON: async (k, v) => { kv.set(k, JSON.stringify(v)); },
  kvExpire: async () => {}, kvIncr: async (k) => kvApi.kvIncrBy(k, 1), kvList: async () => [], kvPipeline: async () => [],
};
mock('api/_lib/kv.js', kvApi);
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
/* v-lock-gpay (المراجعة المعاكسة): عطل القراءة يمرّ بـgetUser الحقيقيّ من auth.js — getUserOnce يبتلع عطل KV ويعيد null بعد أربع
   محاولات، لا يرمي. المحاكاة السابقة كانت ترمي فأخفت أنّ grantLocked يعامل «لا يُعرف» معاملة «لم يُحفظ». */
const realAuth = require(rp('api/_lib/auth.js'));
delete require.cache[rp('api/_lib/auth.js')];
async function realGetUserDuringOutage(u) {
  userReadOutage = true;
  try { return await realAuth.getUser(u); } finally { userReadOutage = false; }
}
const writes = []; // كلّ كتابة سجلّ حساب وصلت
const armGetAfterPut = () => { if (fail.getAfterPut > 0) { fail.get = fail.getAfterPut; fail.getAfterPut = 0; } };
mock('api/_lib/auth.js', {
  getUser: async (u) => { await imm(); if (fail.get > 0) { fail.get--; return realGetUserDuringOutage(u); } return users.has(u) ? structuredClone(users.get(u)) : null; },
  putUser: async (u, rec) => {
    await imm();
    if (fail.putLanded > 0) { fail.putLanded--; users.set(u, structuredClone(rec)); writes.push(u); armGetAfterPut(); throw new Error('ETIMEDOUT after write'); }
    if (fail.put > 0) { fail.put--; armGetAfterPut(); throw new Error('ERR DB capacity quota exceeded'); }
    users.set(u, structuredClone(rec)); writes.push(u);
  },
  isBanned: async () => false,
  verifyToken: (t) => (typeof t === 'string' && t.startsWith('T:') ? t.slice(2) : null),
});
mock('api/_lib/_vip.js', { isVip: async () => false });
const alertsToOwner = [];
mock('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { alertsToOwner.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });

// ── شبكة Stripe مزيّفة واحدة للملفّ ──
const nowSec = () => Math.floor(Date.now() / 1000);
const net = { pi: {}, sessions: {}, seq: 0, calls: [] };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
global.fetch = async (url, init) => {
  const u = new URL(String(url));
  const method = (init && init.method) || 'GET';
  net.calls.push(method + ' ' + u.pathname);
  if (u.hostname !== 'api.stripe.com') return reply(404, {});
  const p = u.pathname.replace(/^\/v1\//, '');
  let m;
  if (p === 'payment_intents' && method === 'POST') {
    const q = new URLSearchParams(String((init && init.body) || ''));
    const id = 'pi_w' + (++net.seq);
    net.pi[id] = { id, object: 'payment_intent', status: 'requires_payment_method', amount: Number(q.get('amount')), currency: q.get('currency'), created: nowSec(),
      metadata: { plan: q.get('metadata[plan]'), username: q.get('metadata[username]') }, latest_charge: 'ch_' + id };
    return reply(200, { id, client_secret: id + '_secret_x' });
  }
  if ((m = p.match(/^payment_intents\/([^/]+)$/))) { const x = net.pi[decodeURIComponent(m[1])]; return x ? reply(200, x) : reply(404, { error: { message: 'No such payment_intent' } }); }
  if ((m = p.match(/^checkout\/sessions\/([^/]+)$/))) { const x = net.sessions[decodeURIComponent(m[1])]; return x ? reply(200, x) : reply(404, { error: { message: 'No such session' } }); }
  if (p === 'checkout/sessions' || p === 'invoice_payments') return reply(200, { data: [] });
  return reply(404, { error: { message: 'unknown' } });
};

const webhook = require(rp('api/webhook.js'));
const checkout = require(rp('api/_lib/create-checkout-session.js'));
const points = require(rp('api/_lib/points.js'));

const bal = async (u) => (await points.readPoints(u)).points;
const fresh = (u) => { users.set(u, { username: u, points: 70 }); kv.delete('points:' + u); };
const mkRes = () => ({ code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { if (b !== undefined) this.body = b; return this; } });

async function hook(event) {
  const raw = Buffer.from(JSON.stringify(event));
  const req = Readable.from([raw]);
  req.method = 'POST';
  req.query = {};
  const t = nowSec();
  req.headers = { 'stripe-signature': 't=' + t + ',v1=' + crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(t + '.' + raw.toString('utf8')).digest('hex') };
  const res = mkRes();
  await webhook(req, res);
  return res;
}
async function server(action, body) {
  const res = mkRes();
  await checkout({ method: 'POST', query: { action }, body, headers: {} }, res);
  return res;
}
let evSeq = 0;
const evt = (type, object) => ({ id: 'evt_g' + (++evSeq), type, data: { object } });
// عمليّة محفظة مدفوعة كما ينشئها createPaymentIntent ثمّ تؤكّدها الورقة
function paidPi(username, plan, amount) {
  const id = 'pi_w' + (++net.seq);
  net.pi[id] = { id, object: 'payment_intent', status: 'succeeded', amount, amount_received: amount, currency: 'usd', created: nowSec(), metadata: { plan, username }, latest_charge: 'ch_' + id };
  return net.pi[id];
}
const piEvent = (pi) => evt('payment_intent.succeeded', structuredClone(pi));
const verifyPi = (u, id) => server('verify-payment-intent', { payment_intent_id: id, token: 'T:' + u });

// عطلٌ محقون لم يُستهلك لا يتسرّب إلى الاختبار التالي
test.beforeEach(() => { Object.assign(fail, { get: 0, put: 0, putLanded: 0, getAfterPut: 0 }); });

// ───────────────────────── srv-money-1: الويب هوك ─────────────────────────

test('srv-money-1: حدث payment_intent.succeeded موقَّع يشحن الباقة والنقاط وسجلّ المنح (كان 200 بلا شحن)', async () => {
  fresh('rana');
  const pi = paidPi('rana', 'pro', 2000);
  const r = await hook(piEvent(pi));
  assert.equal(r.code, 200);
  assert.equal(users.get('rana').plan, 'pro', 'الباقة مُنحت من الخادم بلا المتصفّح');
  assert.equal(users.get('rana').lastStripePaymentIntentId, pi.id, 'الحقل نفسه الذي يكتبه التحقّق من العميل');
  assert.equal(await bal('rana'), 70 + 920);
  const rec = JSON.parse(kv.get('payrec:' + pi.id) || 'null');
  assert.ok(rec && rec.plan === 'pro' && rec.refs.includes('ch_' + pi.id), 'سجلّ المنح برقم الدفعة — الاسترداد يجده');
  assert.equal(kv.get('paid:lastStripePaymentIntentId:' + pi.id), 'rana', 'الحجز الذرّيّ نفسه (v-pay-once)');
});

test('srv-money-1: إعادة الحدث، والتحقّق من العميل قبله أو بعده، لا تشحن مرّتين', async () => {
  fresh('salem');
  const a = paidPi('salem', 'pro', 2000);
  assert.equal((await hook(piEvent(a))).code, 200);
  const v = await verifyPi('salem', a.id);
  assert.equal(v.code, 200);
  assert.equal(v.body.alreadyGranted, true);
  assert.equal((await hook(piEvent(a))).code, 200, 'الحدث المعاد 200 (الأثر تمّ) فلا يعيده Stripe');
  assert.equal(await bal('salem'), 70 + 920);
  // بالعكس: التحقّق أوّلًا ثمّ الحدث
  const b = paidPi('salem', 'pack100', 499);
  assert.equal((await verifyPi('salem', b.id)).body.pointsAdded, 100);
  assert.equal((await hook(piEvent(b))).code, 200);
  // وبالتناوب (فخّ v-pay-once: حارس يتذكّر آخر قيمة وحدها)
  for (const x of [a, b, a, b]) { await hook(piEvent(x)); await verifyPi('salem', x.id); }
  assert.equal(await bal('salem'), 70 + 920 + 100);
});

test('srv-money-1: الويب هوك وخمسة تحقّقات من العميل معًا (Promise.all) = شحنة واحدة، وكلّ ردّ ناجح', async () => {
  fresh('noor');
  const pi = paidPi('noor', 'max', 10000);
  const out = await Promise.all([hook(piEvent(pi)), verifyPi('noor', pi.id), hook(piEvent(pi)), verifyPi('noor', pi.id), verifyPi('noor', pi.id), verifyPi('noor', pi.id), verifyPi('noor', pi.id)]);
  assert.deepEqual(out.map((r) => r.code), [200, 200, 200, 200, 200, 200, 200]);
  assert.equal(out.filter((r) => r.body && r.body.pointsAdded === 3200).length, 1, 'منحٌ واحد، والبقيّة «سبق الشحن»');
  assert.equal(await bal('noor'), 70 + 3200);
});

test('srv-money-1: استرداد كامل يصل قبل الحدث ⇒ لا شحن بعده من الويب هوك ولا من التحقّق', async () => {
  fresh('huda');
  const pi = paidPi('huda', 'pro', 2000);
  const ref = await hook(evt('charge.refunded', { id: pi.latest_charge, object: 'charge', payment_intent: pi.id, amount: 2000, amount_refunded: 2000, refunded: true, currency: 'usd', created: nowSec() }));
  assert.equal(ref.code, 200);
  assert.match(String(kv.get('paid:lastStripePaymentIntentId:' + pi.id)), /^!revoked:/, 'حجز السحب قبل الشحن (v-pay-refund)');
  assert.equal((await hook(piEvent(pi))).code, 200);
  await verifyPi('huda', pi.id);
  assert.equal(users.get('huda').plan, undefined, 'لا باقة بعد استرداد');
  assert.equal(await bal('huda'), 70, 'لا نقاط بعد استرداد');
});

test('srv-money-1: عمليّة بلا metadata (صفحة Stripe/التجديد) أو غير مكتملة لا تُشحن؛ والجلسة تُشحن مرّة', async () => {
  fresh('omar');
  const sessionPi = { id: 'pi_cs_1', object: 'payment_intent', status: 'succeeded', amount: 2000, amount_received: 2000, currency: 'usd', metadata: {}, latest_charge: 'ch_cs_1' };
  assert.equal((await hook(evt('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_cs_1', amount_total: 2000, currency: 'usd', created: nowSec(), metadata: { username: 'omar', plan: 'pro' } }))).code, 200);
  assert.equal((await hook(piEvent(sessionPi))).code, 200);
  assert.equal(await bal('omar'), 70 + 920, 'الجلسة وحدها شحنت — عمليّتها بلا metadata');
  const pending = paidPi('omar', 'pro', 2000);
  pending.status = 'processing';
  assert.equal((await hook(piEvent(pending))).code, 200);
  const unknownPlan = paidPi('omar', 'gold', 2000);
  assert.equal((await hook(piEvent(unknownPlan))).code, 200);
  assert.equal(await bal('omar'), 70 + 920, 'غير المكتملة والخطّة المجهولة لا تُشحن');
});

test('srv-money-1: عطل قراءة الحساب قبل الأثر (getUser الحقيقيّ يعيد null فيصير المنح 404) ⇒ 500 فيعيد Stripe، لا 200 بلا شحن', async () => {
  // المقدّمة التي تبني عليها المحاكاة: getUser في الإنتاج لا يرمي عند عطل KV — يعيد null بعد محاولاته الأربع
  fail.get = 1;
  assert.equal(await require(rp('api/_lib/auth.js')).getUser('nobody-outage'), null, 'auth.js: عطل القراءة = null لا رمي');
  fresh('lama');
  const pi = paidPi('lama', 'pro', 2000);
  fail.get = 2; // القراءة قبل قفل الحساب وبعده (liveAccount مرّتين)
  const r1 = await hook(piEvent(pi));
  assert.equal(r1.code, 500, 'non-2xx: الأثر لم يتمّ — كان 200 {received:true} فلا يعيد Stripe أبدًا');
  assert.equal(kv.has('paid:lastStripePaymentIntentId:' + pi.id), false, 'لا حجز قبل الأثر');
  assert.equal(await bal('lama'), 70);
  assert.equal(users.get('lama').plan, undefined);
  assert.equal((await hook(piEvent(pi))).code, 200, 'إعادة Stripe تشحن');
  assert.equal((await hook(piEvent(pi))).code, 200);
  assert.equal(await bal('lama'), 70 + 920, 'مرّة واحدة');
  assert.equal(users.get('lama').plan, 'pro');
  // عطل عابر قبل القفل وحده: القراءة داخل القفل تنجح فيُشحن من أوّل مرّة
  fresh('lama2');
  const p2 = paidPi('lama2', 'pack100', 499);
  fail.get = 1;
  assert.equal((await hook(piEvent(p2))).code, 200);
  assert.equal((await hook(piEvent(p2))).code, 200);
  assert.equal(await bal('lama2'), 70 + 100);
});

test('srv-money-1: فشل حفظ الحساب بعد إضافة النقاط — الإعادة (تحقّق معلّق أو ويب هوك) لا تضاعفها', async () => {
  // (أ) الحفظ لم يصل: تُردّ النقاط ويُفكّ الحجز، فالإعادة تشحن الباقة والنقاط مرّة (كان الحجز يُفكّ والنقاط باقية ⇒ ١٬٨٤٠)
  fresh('dana');
  const a = paidPi('dana', 'pro', 2000);
  fail.put = 1;
  assert.equal((await verifyPi('dana', a.id)).code, 500);
  assert.equal(await bal('dana'), 70, 'النقاط رُدّت');
  assert.equal(kv.has('paid:lastStripePaymentIntentId:' + a.id), false, 'ولا أثر باقٍ فالحجز مفكوك');
  assert.equal((await verifyPi('dana', a.id)).code, 200);
  assert.equal((await hook(piEvent(a))).code, 200);
  assert.equal(await bal('dana'), 70 + 920, 'شحنة واحدة لا اثنتان');
  assert.equal(users.get('dana').plan, 'pro');
  // والويب هوك أوّلًا: 500 فيعيد Stripe، والإعادة تشحن مرّة
  fresh('dana2');
  const a2 = paidPi('dana2', 'pack700', 2499);
  fail.put = 1;
  assert.equal((await hook(piEvent(a2))).code, 500);
  assert.equal((await hook(piEvent(a2))).code, 200);
  await verifyPi('dana2', a2.id);
  assert.equal(await bal('dana2'), 70 + 700);
  // (ب) الحفظ وصل ثمّ رمى: الشحنة تمّت، يبقى الحجز، والإعادة «سبق الشحن»
  fresh('maha');
  const b = paidPi('maha', 'pro', 2000);
  fail.putLanded = 1;
  assert.equal((await verifyPi('maha', b.id)).code, 500);
  assert.equal((await hook(piEvent(b))).code, 200);
  assert.equal((await verifyPi('maha', b.id)).body.alreadyGranted, true);
  assert.equal(await bal('maha'), 70 + 920);
  assert.equal(users.get('maha').plan, 'pro');
  // (ج) لا يُعرف (قراءة الحساب تفشل أيضًا): يبقى الحجز — لا شحنة ثانية أبدًا (الباقة قد تنقص: موثَّق للمالك)
  fresh('reem');
  const c = paidPi('reem', 'pro', 2000);
  fail.put = 1; fail.getAfterPut = 1;
  assert.equal((await verifyPi('reem', c.id)).code, 500);
  assert.equal(kv.get('paid:lastStripePaymentIntentId:' + c.id), 'reem', 'الحجز باقٍ');
  for (let i = 0; i < 3; i++) { await hook(piEvent(c)); await verifyPi('reem', c.id); }
  assert.equal(await bal('reem'), 70 + 920, 'أُضيفت مرّة ولم تتكرّر');
});

test('srv-money-1: الحفظ وصل ثمّ رمى، والقراءة بعده تعثّرت (null) ⇒ لا ردّ للنقاط ولا فكّ للحجز — الباقة ونقاطها معًا', async () => {
  /* المراجعة المعاكسة: «لا يُعرف» كان يُعامَل «لم يُحفظ» — تُردّ النقاط ويُفكّ الحجز، ثمّ كلّ إعادة تقف عند
     user.lastStripePaymentIntentId === الرقم («سبق الشحن») فيبقى Pro بـ٧٠ نقطة وقد دفع ثمن ٩٢٠. */
  // (أ) الويب هوك أوّلًا
  fresh('aziz');
  const a = paidPi('aziz', 'pro', 2000);
  fail.putLanded = 1; fail.getAfterPut = 1;
  assert.equal((await hook(piEvent(a))).code, 500, 'الرمي بعد الأثر يبقى non-2xx — والإعادة آمنة لأنّ الحجز باقٍ');
  assert.equal(await bal('aziz'), 70 + 920, 'النقاط لم تُردّ');
  assert.equal(kv.get('paid:lastStripePaymentIntentId:' + a.id), 'aziz', 'الحجز باقٍ');
  assert.equal(users.get('aziz').plan, 'pro');
  assert.equal((await hook(piEvent(a))).code, 200);
  const va = await verifyPi('aziz', a.id);
  assert.equal(va.body.alreadyGranted, true);
  assert.equal(va.body.balance, await bal('aziz'), '«سبق الشحن» برصيدٍ يطابق الحقيقيّ');
  assert.equal(await bal('aziz'), 70 + 920);
  // (ب) تحقّق المحفظة المعلّق أوّلًا (سيناريو المراجعة نفسه)، ثمّ إعادة الويب هوك والتحقّق مرارًا
  fresh('basma');
  const b = paidPi('basma', 'pro', 2000);
  fail.putLanded = 1; fail.getAfterPut = 1;
  assert.equal((await verifyPi('basma', b.id)).code, 500);
  for (let i = 0; i < 3; i++) { assert.equal((await hook(piEvent(b))).code, 200); await verifyPi('basma', b.id); }
  const vb = await verifyPi('basma', b.id);
  assert.equal(vb.body.alreadyGranted, true);
  assert.equal(await bal('basma'), 70 + 920, 'كان ٧٠ بعد الردّ الخاطئ');
  assert.equal(vb.body.balance, 70 + 920);
  assert.equal(users.get('basma').plan, 'pro');
  assert.equal(users.get('basma').lastStripePaymentIntentId, b.id);
});

// ───────────────────────── العميل: أجزاء app-06 الحقيقيّة في vm ─────────────────────────

const A06 = fs.readFileSync(path.join(root, 'js/app-06-checkout.js'), 'utf8');
const part = (from, to) => { const s = A06.indexOf(from); const e = A06.indexOf(to, s + 1); assert.ok(s >= 0 && e > s, 'الجزء: ' + from); return A06.slice(s, e); };
const SRC = {
  head: part('let checkoutCurrentPlan = null;', '// Must match api/_lib/create-checkout-session.js'),
  prices: part('const CHECKOUT_PLAN_AMOUNTS', '// v-fair-video: نقاط كلّ رزمة'),
  wallet: part('async function ensureStripeJs(){', '// ===== PayPal ====='),
  paypal: part('// ===== PayPal =====', 'async function startPaypalCheckout(){'),
  redirect: part('(function handleCheckoutRedirectResult(){', '/* v-ios-bridge: العودة من دفع'),
  bridge: part('(function checkoutClaimBridge(){', 'const btnExportProjectsEl'),
};
const wrapRes = (r) => ({ ok: r.code >= 200 && r.code < 300, status: r.code, json: async () => r.body });
const until = async (cond, n) => { for (let i = 0; i < (n || 5000) && !cond(); i++) await imm(); };
const drain = async () => { for (let i = 0; i < 400; i++) await imm(); };

function client(opts) {
  const o = opts || {};
  const store = new Map(Object.entries(o.storage || {}));
  const listeners = {};
  const fire = (type) => (listeners[type] || []).slice().forEach((fn) => fn());
  const els = { checkoutStatusMsg: { style: {}, textContent: '' }, paypalButtonContainer: { innerHTML: '' }, paypalFallbackBtn: { style: {} } };
  const env = { calls: [], alerts: [], els, store, fire, shown: [], completes: [], prs: [], closed: 0, intercept: o.intercept || null, paypal: o.paypal || null };
  const win = {
    location: { search: o.search || '', pathname: '/' },
    history: { replaceState: (s, ti, url) => { win.location.search = String(url).includes('?') ? String(url).slice(String(url).indexOf('?')) : ''; } },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    Stripe: () => env.stripe,
    paypal: { Buttons: (cfg) => { env.pp = cfg; return { render() {} }; } },
  };
  env.canMake = o.canMake || (async () => ({ googlePay: true, applePay: false }));
  env.confirm = o.confirm || (async (secret) => { const id = secret.split('_secret')[0]; net.pi[id].status = 'succeeded'; net.pi[id].amount_received = net.pi[id].amount; return { paymentIntent: { id, status: 'succeeded' } }; });
  env.stripe = {
    paymentRequest: (cfg) => { const pr = { cfg, handlers: {}, on(ty, fn) { this.handlers[ty] = fn; }, canMakePayment: () => env.canMake(pr), show() { env.shown.push(pr); } }; env.prs.push(pr); return pr; },
    confirmCardPayment: (secret, data, extra) => env.confirm(secret, data, extra),
  };
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url), 'https://app.test');
    const action = u.searchParams.get('action');
    const body = init && init.body ? JSON.parse(init.body) : {};
    env.calls.push(action + (body.action ? ':' + body.action : ''));
    const x = env.intercept && env.intercept(action, body);
    if (x === 'net') throw new TypeError('Failed to fetch');
    if (x) return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => x.body };
    if (action === 'paypal-client-id') return { ok: true, status: 200, json: async () => ({ configured: true, clientId: 'cid' }) };
    if (action === 'paypal-order' && env.paypal) { const y = env.paypal(body); if (y === 'net') throw new TypeError('Failed to fetch'); return { ok: y.status >= 200 && y.status < 300, status: y.status, json: async () => y.body }; }
    if (['create-payment-intent', 'verify-payment-intent', 'verify-checkout'].includes(action)) return wrapRes(await server(action, body));
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const ctx = {
    window: win, console, URL, URLSearchParams,
    document: { getElementById: (id) => els[id] || null, addEventListener: (type, fn) => { (listeners['doc:' + type] = listeners['doc:' + type] || []).push(fn); }, visibilityState: 'visible', head: { appendChild() {} } },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } },
    setTimeout: (fn) => { setImmediate(fn); return 1; }, setInterval: () => 1, clearInterval: () => {},
    alert: (m) => env.alerts.push(m),
    t: o.t || ((k) => 'T:' + k), lang: o.lang || 'en',
    authGet: (k) => (k === 'aiapp_auth_token' ? (o.token !== undefined ? o.token : 'T:' + (o.user || 'rana')) : ''),
    __swallow: () => {},
    fetch: fetchImpl,
    closeCheckout: () => { env.closed++; },
    refreshPointsWallet: () => {},
    STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
  };
  vm.createContext(ctx);
  vm.runInContext(SRC.head + '\n' + SRC.prices + '\nstripeJsLoaded = true; paypalSdkLoaded = true;\n' + SRC.wallet + '\n' + SRC.paypal, ctx);
  env.ctx = ctx;
  env.get = (expr) => vm.runInContext(expr, ctx);
  env.boot = () => vm.runInContext((o.redirect ? SRC.redirect + '\n' : '') + SRC.bridge, ctx); // كتحميل الصفحة
  env.ev = () => ({ paymentMethod: { id: 'pm_card_x' }, complete: (s) => env.completes.push(s) });
  env.pay = (plan) => env.get('handleWalletPaymentMethod')(env.ev(), plan || 'pro', 'usd');
  env.status = () => els.checkoutStatusMsg.textContent;
  env.pending = () => JSON.parse(store.get('aiapp_pi_pending') || '[]').map((x) => x.id);
  return env;
}
const lastPi = () => 'pi_w' + net.seq;
const verifies = (env) => env.calls.filter((c) => c === 'verify-payment-intent').length;

// ───────────────────────── cli-money-1 ─────────────────────────

test('cli-money-1: «تمّ» في الورقة ثمّ فشل التحقّق (500): الرقم محفوظ، والرسالة «وصلنا دفعك» لا «حاول مرة أخرى»، ثمّ العودة تشحنه مرّة', async () => {
  fresh('rana');
  const env = client({ user: 'rana' });
  fail.put = 4; // التحقّق الأوّل وإعاداته الثلاث داخل النافذة: كتابة KV الخادم معطوبة (500، والنقاط تُردّ والحجز يُفكّ)
  await env.pay('pro');
  const id = lastPi();
  assert.deepEqual(env.completes, ['success'], 'الورقة قالت «تمّ» — المبلغ مسحوب');
  assert.equal(net.pi[id].status, 'succeeded');
  assert.equal(env.status(), 'T:checkoutPaidPending', 'لا checkoutError ولا نصّ الخادم «أعد المحاولة»');
  assert.deepEqual(env.pending(), [id], 'رقم العمليّة محفوظ للعودة');
  assert.equal(await bal('rana'), 70, 'لم يُشحن بعد');
  assert.equal(verifies(env), 4, 'تحقّق ثمّ ثلاث إعادات داخل النافذة');
  // يعود للتطبيق: التحقّق المعلّق يشحن، يُمسح الرقم، ورسالة نجاح واحدة
  env.boot();
  await until(() => env.alerts.length > 0);
  assert.deepEqual(env.alerts, ['T:checkoutSuccessMsg']);
  assert.deepEqual(env.pending(), []);
  assert.equal(await bal('rana'), 70 + 920);
  assert.equal(users.get('rana').plan, 'pro');
  const n = verifies(env);
  env.fire('focus'); env.fire('doc:visibilitychange');
  await drain();
  assert.equal(verifies(env), n, 'لا تحقّق بعد الشحن');
  assert.equal((await hook(piEvent(net.pi[id]))).code, 200, 'والويب هوك بعده «سبق الشحن»');
  assert.equal(await bal('rana'), 70 + 920);
  assert.equal(env.alerts.length, 1);
});

test('cli-money-1: انقطاع الشبكة بعد «تمّ»: «وصلنا دفعك» والرقم معلّق؛ والويب هوك يشحن ثمّ العودة تمسحه بلا شحنة ثانية', async () => {
  fresh('salem');
  const env = client({ user: 'salem', intercept: (action) => (action === 'verify-payment-intent' ? 'net' : null) });
  await env.pay('pack300');
  const id = lastPi();
  assert.equal(env.status(), 'T:checkoutPaidPending');
  assert.deepEqual(env.pending(), [id]);
  assert.equal((await hook(piEvent(net.pi[id]))).code, 200, 'الخادم يشحن وحده (srv-money-1)');
  assert.equal(await bal('salem'), 70 + 300);
  env.intercept = null; // رجعت الشبكة
  env.boot();
  await until(() => env.alerts.length > 0);
  assert.deepEqual(env.alerts, ['T:checkoutSuccessMsg'], 'سبق الشحن = نجاح للمستخدم الذي قيل له «معلّق»');
  assert.deepEqual(env.pending(), []);
  assert.equal(await bal('salem'), 70 + 300);
});

test('cli-money-1: التحقّق ينجح في الإعادة الثانية داخل النافذة: «تمّ» والرقم يُمسح والنافذة تُغلق، شحنة واحدة', async () => {
  fresh('noor');
  const env = client({ user: 'noor' });
  fail.get = 3; // قراءة الحساب معطوبة في التحقّق الأوّل (getUser الحقيقيّ null ⇒ 404) — 404 لا يُسقط الرقم المعلّق
  // (+١: فحص «الباقة الأدنى» قبل الدفع، v-lock-subs srv-money-4، يقرأ الحساب مرّة في create-payment-intent ولا يمنع الشراء عند عطب القراءة)
  await env.pay('pro');
  assert.equal(env.status(), 'T:checkoutSuccessMsg');
  assert.equal(verifies(env), 2, 'الأوّل 404 والإعادة الثانية شحنت');
  assert.deepEqual(env.pending(), []);
  await drain();
  assert.equal(env.closed, 1);
  assert.equal(await bal('noor'), 70 + 920);
});

test('cli-money-1: رفض البطاقة الصريح لا يترك رقمًا معلّقًا، والرسالة كما كانت؛ وعطل التأكيد المجهول يبقيه', async () => {
  fresh('huda');
  const env = client({ user: 'huda', confirm: async () => ({ error: { type: 'card_error', code: 'card_declined' } }) });
  await env.pay('pro');
  assert.deepEqual(env.completes, ['fail']);
  assert.equal(env.status(), 'T:checkoutError', 'لم يُسحب شيء — «حاول مرة أخرى» صحيحة هنا');
  assert.deepEqual(env.pending(), []);
  assert.equal(verifies(env), 0);
  const env2 = client({ user: 'huda', confirm: async () => ({ error: { type: 'api_connection_error' } }) });
  await env2.pay('pro');
  assert.deepEqual(env2.pending(), [lastPi()], 'لا يُعرف إن سُحب — يبقى معلّقًا (الخادم يردّ 402 ما لم يكتمل)');
  env2.boot();
  await drain();
  assert.deepEqual(env2.alerts, []);
  assert.deepEqual(env2.pending(), [lastPi()], '402 = لم يكتمل بعد، يبقى');
  assert.equal(await bal('huda'), 70);
});

test('cli-money-1: العودة للتطبيق أثناء تحقّق النافذة (focus عند إغلاق الورقة) لا تتحقّق معها — رسالة نجاح واحدة', async () => {
  fresh('lama');
  let env = null;
  env = client({ user: 'lama', confirm: async (secret) => {
    const id = secret.split('_secret')[0];
    net.pi[id].status = 'succeeded';
    env.fire('focus'); env.fire('doc:visibilitychange'); // تُغلق ورقة Google Pay فيعود التركيز للصفحة
    return { paymentIntent: { id, status: 'succeeded' } };
  } });
  env.boot();
  await env.pay('pro');
  await drain();
  assert.equal(env.status(), 'T:checkoutSuccessMsg');
  assert.deepEqual(env.alerts, [], 'لا تنبيه ثانٍ من مسار العودة');
  assert.equal(verifies(env), 1, 'تحقّق واحد');
  assert.equal(await bal('lama'), 70 + 920);
});

test('cli-money-1: المعلّق بنافذة الخادم (٧٢ ساعة) وبحدّ خمسة؛ ورقم لحساب آخر (403) يُترك', async () => {
  fresh('omar');
  const old = Date.now() - 73 * 3600 * 1000;
  const env = client({ user: 'omar', storage: { aiapp_pi_pending: JSON.stringify([{ id: 'pi_old', ts: old }]) } });
  env.boot();
  await drain();
  assert.equal(verifies(env), 0, 'الأقدم من ٧٢ ساعة لا يُطلب (الخادم يردّه 410)');
  const add = env.get('walletPiAdd');
  for (let i = 1; i <= 7; i++) add('pi_n' + i);
  assert.deepEqual(env.pending(), ['pi_n3', 'pi_n4', 'pi_n5', 'pi_n6', 'pi_n7']);
  const other = paidPi('someone', 'pro', 2000);
  fresh('someone');
  const env2 = client({ user: 'omar', storage: { aiapp_pi_pending: JSON.stringify([{ id: other.id, ts: Date.now() }]) } });
  env2.boot();
  await drain();
  assert.deepEqual(env2.pending(), [], '403 ليست لهذا الحساب — لا إلحاح');
  assert.equal(await bal('omar'), 70);
});

// ───────────────────────── cli-money-5 ─────────────────────────

function paidSession(username, plan) {
  const id = 'cs_g' + (++net.seq);
  net.sessions[id] = { id, payment_status: 'paid', payment_intent: 'pi_of_' + id, amount_total: 2000, currency: 'usd', created: nowSec(), metadata: { username, plan } };
  return id;
}

test('cli-money-5: صفحة نجاح Stripe في Safari الغلاف (بلا رمز ⇒ 401): «وصلنا دفعك» لا «حدث خطأ ما، حاول مرة أخرى»', async () => {
  fresh('dana');
  const sid = paidSession('dana', 'pro');
  const env = client({ token: '', redirect: true, search: '?checkout=success&plan=pro&session_id=' + sid });
  env.boot();
  env.fire('DOMContentLoaded');
  await until(() => env.alerts.length > 0);
  assert.deepEqual(env.alerts, ['T:checkoutPaidPending']);
  assert.equal(env.ctx.window.location.search, '', 'الرابط ينظَّف كما كان');
});

test('cli-money-5: فشل عابر في صفحة النجاح: الجلسة تبقى معلّقة فيكملها claim عند العودة — شحنة واحدة ورسالتان صادقتان', async () => {
  fresh('maha');
  const sid = paidSession('maha', 'pro');
  const env = client({ user: 'maha', redirect: true, search: '?checkout=success&plan=pro&session_id=' + sid,
    storage: { aiapp_ck_pending: sid + ':' + Date.now() }, intercept: (action) => (action === 'verify-checkout' ? 'net' : null) });
  env.boot();
  env.fire('DOMContentLoaded');
  await until(() => env.alerts.length > 0);
  assert.deepEqual(env.alerts, ['T:checkoutPaidPending']);
  assert.match(String(env.store.get('aiapp_ck_pending')), new RegExp('^' + sid + ':'), 'لم تُمسح قبل الشحن');
  env.intercept = null;
  env.fire('focus');
  await until(() => env.alerts.length > 1);
  assert.deepEqual(env.alerts, ['T:checkoutPaidPending', 'T:checkoutSuccessMsg']);
  assert.equal(env.store.has('aiapp_ck_pending'), false);
  assert.equal(await bal('maha'), 70 + 920);
});

test('cli-money-5: نجاح التحقّق في صفحة النجاح: رسالة واحدة وتحقّق واحد (claim لا يتحقّق معها) والجلسة تُمسح', async () => {
  fresh('reem');
  const sid = paidSession('reem', 'pro');
  const env = client({ user: 'reem', redirect: true, search: '?checkout=success&plan=pro&session_id=' + sid, storage: { aiapp_ck_pending: sid + ':' + Date.now() } });
  env.boot();
  env.fire('focus');
  env.fire('DOMContentLoaded');
  await until(() => env.alerts.length > 0);
  await drain();
  assert.deepEqual(env.alerts, ['T:checkoutSuccessMsg']);
  assert.equal(env.calls.filter((c) => c === 'verify-checkout:verify-checkout').length, 1);
  assert.equal(env.store.has('aiapp_ck_pending'), false);
  assert.equal(await bal('reem'), 70 + 920);
  // جلسة لحساب آخر (403): لا «حاول مرة أخرى» ولا إلحاح — الويب هوك يشحن صاحبها
  const sid2 = paidSession('someone2', 'pro');
  const env2 = client({ user: 'reem', redirect: true, search: '?checkout=success&session_id=' + sid2 });
  env2.boot();
  env2.fire('DOMContentLoaded');
  await until(() => env2.alerts.length > 0);
  assert.deepEqual(env2.alerts, ['T:checkoutPaidPending']);
  assert.equal(env2.store.has('aiapp_ck_pending'), false);
  // الإلغاء كما كان
  const env3 = client({ user: 'reem', redirect: true, search: '?checkout=cancel', storage: { aiapp_ck_pending: 'cs_x:' + Date.now() } });
  env3.boot();
  env3.fire('DOMContentLoaded');
  await until(() => env3.alerts.length > 0);
  assert.deepEqual(env3.alerts, ['T:checkoutCancelMsg']);
  assert.equal(env3.store.has('aiapp_ck_pending'), false);
});

test('cli-money-5: PayPal — ردّ الالتقاط الضائع: مُلتقط ⇒ «تمّ»؛ لم يُلتقط ⇒ الخطأ كما كان؛ لا يُعرف ⇒ معلّق و«نتأكّد» لا «حاول مرة أخرى»', async () => {
  const run = async (claimReply) => {
    const env = client({ user: 'rana', paypal: (b) => (b.action === 'capture' ? 'net' : claimReply) });
    await env.get('loadPaypalButtons')();
    assert.ok(env.pp && typeof env.pp.onApprove === 'function');
    await env.pp.onApprove({ orderID: 'ORD1' });
    await drain();
    return env;
  };
  let env = await run({ status: 200, body: { credited: true, status: 'COMPLETED' } });
  assert.equal(env.status(), 'T:checkoutSuccessMsg');
  assert.equal(env.store.has('aiapp_pp_pending'), false);
  env = await run({ status: 409, body: { credited: false, reason: 'not_completed', status: 'APPROVED' } });
  assert.equal(env.status(), 'T:checkoutError', 'لم يُسحب شيء: الإعادة صحيحة');
  assert.equal(env.store.has('aiapp_pp_pending'), false);
  env = await run({ status: 502, body: { error: 'PayPal order lookup error' } });
  assert.equal(env.status(), 'T:axLkGpayPayCheck');
  assert.match(String(env.store.get('aiapp_pp_pending')), /^ORD1:/, 'claimPaypal يكمله عند العودة');
  assert.equal(env.calls.filter((c) => c === 'paypal-order:claim').length, 3);
  // بلا ترجمة بعد (المفتاح يُدمج مركزيًّا): النصّ الاحتياطيّ بالعربيّة والإنجليزيّة، لا اسم المفتاح
  for (const [lg, re] of [['ar', /لا تدفع مرّة ثانية/], ['en', /do not pay again/]]) {
    const e = client({ user: 'rana', t: (k) => k, lang: lg, paypal: (b) => (b.action === 'capture' ? 'net' : { status: 502, body: {} }) });
    await e.get('loadPaypalButtons')();
    await e.pp.onApprove({ orderID: 'ORD2' });
    assert.match(e.status(), re);
  }
});

// ───────────────────────── cli-money-9 ─────────────────────────

const deferred = () => { let resolve; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; };

test('cli-money-9: الضغط على Google Pay أثناء فحص التوفّر «جارٍ التجهيز» لا «غير متوفر»، وبعده تُفتح الورقة', async () => {
  const d = deferred();
  const env = client({ canMake: () => d.p });
  const setup = env.get('setupWalletPaymentRequest')('pro');
  await drain();
  env.get('clickGooglePay')();
  assert.equal(env.status(), 'T:axLkGpayPreparing');
  assert.equal(env.shown.length, 0);
  d.resolve({ googlePay: true, applePay: false });
  await setup;
  env.get('clickGooglePay')();
  assert.equal(env.shown.length, 1, 'المتاح يُفتح بعد انتهاء الفحص');
  // فحص ينتهي بلا محفظة: «غير متوفر» كما كان
  const env2 = client({ canMake: async () => null });
  await env2.get('setupWalletPaymentRequest')('pro');
  env2.get('clickGooglePay')();
  assert.equal(env2.status(), 'T:checkoutWalletUnavailable');
  // بلا ترجمة بعد: النصّ الاحتياطيّ لا اسم المفتاح
  const d3 = deferred();
  const env3 = client({ t: (k) => k, lang: 'ar', canMake: () => d3.p });
  env3.get('setupWalletPaymentRequest')('pro');
  await drain();
  env3.get('clickGooglePay')();
  assert.match(env3.status(), /جارٍ تجهيز الدفع/);
  d3.resolve(null);
});

test('cli-money-9: فتح باقة A ثمّ B بسرعة: إعداد A المتأخّر لا يكتب فوق B — الورقة بمبلغ B وتمنح B', async () => {
  const dA = deferred(), dB = deferred();
  let n = 0;
  const env = client({ canMake: () => (n++ === 0 ? dA.p : dB.p) });
  const a = env.get('setupWalletPaymentRequest')('basic');
  await drain();
  const b = env.get('setupWalletPaymentRequest')('max');
  await drain();
  dB.resolve({ googlePay: true });
  await b;
  dA.resolve({ googlePay: true });
  await a;
  const cur = env.get('currentPaymentRequest');
  assert.equal(cur.cfg.total.amount, 10000, 'مبلغ Max لا Plus');
  assert.equal(typeof env.prs[0].handlers.paymentmethod, 'undefined', 'ورقة A لا تُربط بمنح');
  env.get('clickGooglePay')();
  assert.equal(env.shown[0], env.prs[1]);
  assert.equal(env.get('walletSetupPending'), false);
});
