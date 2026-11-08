// tests/lock-r2.test.cjs — v-lock-r2: جولة المراجعة الثانية لبنود الأبواب المقفلة (موافقة المالك ٢٧ أكتوبر ٢٠٢٦: «صلح الخطير وابدا فيهم كلهم»).
// ستّ ملاحظات من تقاطع المجموعات (subs × credit × gpay × shell × acct)، لكلّ واحدة حالة تفشل على e8199f99:
//   r2-1  عطل قراءة سجلّ الحساب (getUser يعيد null) كان يُعامَل «حسابًا محذوفًا»: إلغاء الاشتراك الحيّ وتنبيه «ردّ المبلغ» و200 — والدفعة لا تُشحن أبدًا.
//   r2-2  دفعة محفظة (Apple/Google Pay) لحساب محذوف فعلًا: 500 ثلاثة أيّام ثمّ تُسقَط بلا تنبيه — والمال مأخوذ.
//   r2-3  منحٌ أدنى محفوظ تحت أعلى سارية (kept) كان يلغي اشتراك الأعلى بـsupersedeSubs.
//   r2-4  التقاط PayPal متأخّر لطلب وسائط أدنى يمحو رصيد باقة وسائط أعلى سارية.
//   r2-5  مشترك يُدعى «جدّد» قبل الانتهاء ولا طريق شراء: بطاقته معطّلة والأدنى ممنوع.
//   r2-6  حساب Google/رمز البريد وضع صاحبه كلمة مرور ثمّ أعاد forgotPassword أو رابط المالك كتابة resetTokenHash: يُحذف بالجلسة والاسم وحدهما.
// على المعالجات الحقيقيّة بـKV في الذاكرة وشبكة مزيّفة (Stripe وPayPal) — لا نداء حقيقيّ لأيّ مزوّد.
// الجولة الثانية للمراجعة (lock-r2/fix-b) — عدسات بيانات المستخدمين والواجهة وثوابت المال على 9cead158، كلّ حالة باسم معرّفها:
//   userdata-1  حذف حساب غيّر اسمه يترك بيانات أسمائه السابقة وفهارس بريده وهاتفه.
//   userdata-2  قراءة شاهد اسم سابق تتعثّر ⇒ مشاركاته باسمه السابق تُعدّ لغيره ويخرج «تم» وهي منشورة للأبد.
//   userdata-3  اشتراك اشتُري باسم قبل أكثر من ثلاثة تغييرات لا يُلغى بحذف الحساب.
//   userdata-4  جلسة مسروقة وحدها تنقل بريد حساب بكلمة مرور (أو تربط هاتفًا) ثمّ تستعيد كلمته وتحذفه.
//   userdata-6  حذف «bob» يمحو مسوّدات بريد الحساب الحيّ «bob:work».
//   client-ux-1 جسر محرّر المخطّطات يسأل «تخصم ٢٠ نقطة» من المالك والضيف وهما لا يُخصم منهما.
//   client-ux-2 ضغطة واجهة ثانية أثناء توليد الأولى تضيع بلا أثر.
//   client-ux-3 «ممكن ترسم لي…» و«تقدر تسوي لي صورة…» لم تعد تطلب صورة في مها الأساسيّ.
//   money-invariants-7 حجز الدفعة (SET NX) لا يُقرأ ردّه أو يضيع بعد الكتابة ⇒ «سبق الشحن» 2xx والدفعة لم تُشحن.
//   money-invariants-8 تغيير الاسم بلا قفل الحساب ⇒ منحٌ أو مرآة تكتب السجلّ القديم فوق شاهد الاسم.
//   money-invariants-9 ردّ نقاط بالاسم السابق (فيديو فشل، حجز صورة مها) يصل عدّادًا يتيمًا لا الحساب.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const acorn = require('acorn');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'lock-r2-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_lock_r2_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_lock_r2';
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_SECRET = 'sec';
process.env.PAYPAL_MODE = 'sandbox';
delete process.env.PAYPAL_WEBHOOK_ID;
process.env.RESEND_API_KEY = 'test-mail-key'; // البريد نفسه لا يُرسل: الشبكة المزيّفة تردّ 404 لغير Stripe/PayPal

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV في الذاكرة. failUserReads: عطل Upstash عابر على سجلّات الحسابات وحدها — kv.js الحقيقيّ: بلا strict يعود null، وstrict يرمي ──
const store = new Map();
// userPut: كتابات سجلّ الحساب التالية تفشل (بعد أثرٍ تمّ). readKeys: مفاتيح بعينها تتعثّر قراءتها (بلا strict ⇒ null، وstrict يرمي — kv.js الحقيقيّ).
// claimSet: حجز الدفعة التالي (paid:… NX) — 'unreadable' كُتب وردّه 200 لا يُقرأ (kv.js: بلا strict ⇒ false، وstrict يرمي)، 'lost' كُتب ثمّ رمى، 'before' رمى بلا كتابة.
const fail = { userReads: false, userPut: 0, readKeys: new Set(), claimSet: null };
const hooks = { get: null }; // تُنتظر قبل كلّ kvGetRaw — لفرض تداخل (money-invariants-8)
const kvImpl = {
  kvGetJSON: async (k, o) => { if ((fail.userReads && /^db\/users\//.test(k)) || fail.readKeys.has(k)) { if (o && o.strict) throw new Error('upstash timeout'); return null; } return (store.has(k) ? JSON.parse(store.get(k)) : null); },
  kvPutJSON: async (k, v) => { if (fail.userPut > 0 && /^db\/users\//.test(k)) { fail.userPut--; throw new Error('upstash write failed'); } store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { if (hooks.get) await hooks.get(k); return (store.has(k) ? String(store.get(k)) : null); },
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v, ttl, o) => {
    if (fail.claimSet && /^paid:/.test(k)) {
      const f = fail.claimSet;
      fail.claimSet = null;
      if (f === 'before') throw new Error('fetch failed');
      if (!store.has(k)) store.set(k, String(v));
      if (f === 'lost') throw new Error('ETIMEDOUT after write');
      if (o && o.strict) throw new Error('Upstash error: unreadable reply');
      return false; // kv.js بلا strict: data = null ⇒ result null ⇒ ليس 'OK'
    }
    if (store.has(k)) return false; store.set(k, String(v)); return true;
  },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'DEL') { store.delete(k); return 1; }
    return 1;
  }),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
const logged = [];
mock('api/_lib/log-error.js', { logError: (scope, e) => { logged.push({ scope, msg: e && e.message }); }, logErrorAndFlush: async (scope, e) => { logged.push({ scope, msg: e && e.message }); } });
mock('api/_lib/_vip.js', { isVip: async () => false });
const alerts = [];
mock('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { alerts.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });

// ── شبكة مزيّفة واحدة: Stripe (الجلسات، العمليّات، الاشتراكات وبحثها) وPayPal ──
const net = { subs: {}, sessions: {}, orders: {}, pis: {}, calls: [], seq: 0 };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const unq = (s) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
global.fetch = async (url, init) => {
  const u = new URL(String(url));
  const method = (init && init.method) || 'GET';
  const body = init && init.body ? String(init.body) : '';
  net.calls.push({ url: String(url), method, body });
  if (u.hostname === 'api.stripe.com') {
    const p = u.pathname.replace(/^\/v1\//, '');
    let m;
    if (p === 'subscriptions/search') {
      const q = u.searchParams.get('query') || '';
      const nm = q.match(/metadata\['username'\]:'((?:[^'\\]|\\.)*)'/);
      const data = Object.values(net.subs).filter((s) => nm && s.metadata.username === unq(nm[1]));
      return reply(200, { object: 'search_result', data: data.map((s) => structuredClone(s)), has_more: false, next_page: null });
    }
    if ((m = p.match(/^subscriptions\/([^/]+)$/))) {
      const s = net.subs[decodeURIComponent(m[1])];
      if (!s) return reply(404, { error: { code: 'resource_missing', message: 'No such subscription' } });
      if (method === 'DELETE') {
        if (s.status === 'canceled') return reply(400, { error: { message: 'This subscription has already been canceled' } });
        s.status = 'canceled';
        return reply(200, structuredClone(s));
      }
      if (method === 'POST') {
        const b = new URLSearchParams(body);
        if (b.has('cancel_at_period_end')) s.cancel_at_period_end = b.get('cancel_at_period_end') === 'true';
        return reply(200, structuredClone(s));
      }
      return reply(200, structuredClone(s));
    }
    if (method === 'POST' && p === 'checkout/sessions') return reply(200, { id: 'cs_new_' + (++net.seq), url: 'https://checkout.stripe.test/x' });
    if (method === 'POST' && p === 'payment_intents') return reply(200, { id: 'pi_new_' + (++net.seq), client_secret: 's' });
    if ((m = p.match(/^payment_intents\/(.+)$/))) return net.pis[m[1]] ? reply(200, net.pis[m[1]]) : reply(404, { error: { message: 'No such payment_intent' } });
    if ((m = p.match(/^checkout\/sessions\/(.+)$/))) return net.sessions[m[1]] ? reply(200, net.sessions[m[1]]) : reply(404, { error: { message: 'No such session' } });
    return reply(404, { error: { message: 'unknown' } });
  }
  if (/paypal\.com$/.test(u.hostname)) {
    if (u.pathname === '/v1/oauth2/token') return reply(200, { access_token: 'A' });
    if (method === 'POST' && u.pathname === '/v2/checkout/orders') return reply(201, { id: 'PP_' + (++net.seq) });
    const m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
    if (m) { const o = net.orders[decodeURIComponent(m[1])]; return o ? reply(200, o) : reply(404, { message: 'not found' }); }
    return reply(404, { message: 'unknown' });
  }
  if (u.hostname === 'redis.invalid' && net.upstash) return net.upstash(JSON.parse(body || '[]')); // money-invariants-7: kv.js الحقيقيّ
  if (u.hostname === 'api.resend.com') { // userdata-4: البريد يُلتقط (الرمز والرابط) ولا يُرسل
    const b = JSON.parse(body || '{}');
    const html = String(b.html || '');
    const code = html.match(/>(\d{6})</);
    mail[String((b.to || [])[0] || '')] = { code: code && code[1], html };
    return reply(200, { id: 'm' });
  }
  return reply(404, {}); // غير ذلك: لا يُرسل شيء
};
const mail = {};

const auth = require(rp('api/_lib/auth.js'));
const checkout = require(rp('api/_lib/create-checkout-session.js'));
const paypal = require(rp('api/_lib/paypal-order.js'));
const webhook = require(rp('api/webhook.js'));
const adminActions = require(rp('api/_lib/admin-actions.js'));
const { deleteAccount, needsPassword } = require(rp('api/_lib/account-delete.js'));
const tier = require(rp('api/_lib/tier.js'));

const DAY = 86400000;
const nowSec = () => Math.floor(Date.now() / 1000);
const mkRes = () => ({ code: 200, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { if (b !== undefined) this.body = b; return this; }, writeHead(c) { this.code = c; } });
async function call(handler, req) { const res = mkRes(); await handler(Object.assign({ method: 'POST', headers: {}, query: {} }, req), res); return res; }
const stripe = (action, body) => call(checkout, { query: action ? { action } : {}, body });
const pp = (body) => call(paypal, { body });
const tok = (u) => auth.makeToken(u);
async function fresh(u, rec) { await auth.putUser(u, Object.assign({ username: u, points: 70, createdAt: Date.now() - 90 * DAY }, rec || {})); store.set('points:' + u, String((rec && rec.points) || 70)); }
const user = (u) => auth.getUser(u);
const pts = (u) => Number(store.get('points:' + u));
let subSeq = 0;
const sub = (id, username, plan, status) => { net.subs[id] = { id, object: 'subscription', status, created: nowSec() - 100000 + (++subSeq), cancel_at_period_end: false, metadata: { username, plan }, items: { data: [{ current_period_end: nowSec() + 20 * 86400 }] } }; return net.subs[id]; };
let evSeq = 0;
const evt = (type, object) => ({ id: 'evt_r2_' + (++evSeq), type, data: { object } });
const paidSession = (id, username, plan, amount, extra) => evt('checkout.session.completed', Object.assign({ id, object: 'checkout.session', payment_status: 'paid', mode: 'payment', payment_intent: 'pi_' + id, amount_total: amount, currency: 'usd', created: nowSec(), metadata: { username, plan } }, extra || {}));
const subSession = (id, username, plan, amount, subId) => paidSession(id, username, plan, amount, { mode: 'subscription', payment_intent: null, invoice: 'in_' + id, subscription: subId });
const renewal = (id, username, plan, amount, subId) => evt('invoice.paid', { id, object: 'invoice', billing_reason: 'subscription_cycle', subscription: subId, payment_intent: 'pi_' + id, amount_paid: amount, currency: 'usd', subscription_details: { metadata: { username, plan } } });
const walletPi = (id, username, plan, amount) => evt('payment_intent.succeeded', { id, object: 'payment_intent', status: 'succeeded', amount, amount_received: amount, currency: 'usd', latest_charge: 'ch_' + id, metadata: { username, plan } });
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
async function duringOutage(fn) { fail.userReads = true; try { return await fn(); } finally { fail.userReads = false; } }
const orphanAlerts = () => alerts.filter((a) => /محذوف/.test(String(a.title)));
// طلب PayPal أنشأه خادمنا لصاحبه (علامة ppo) واكتمل التقاطه
function ppOrder(id, cap, ref, plan, value) {
  store.set('ppo:' + id, ref);
  net.orders[id] = { id, status: 'COMPLETED', create_time: new Date().toISOString(), purchase_units: [{ reference_id: ref, custom_id: plan, payments: { captures: [{ id: cap, status: 'COMPLETED', custom_id: plan, amount: { value, currency_code: 'USD' } }] } }] };
}
const capEvent = (orderId, cap) => ({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: cap, supplementary_data: { related_ids: { order_id: orderId } } } });

// ───────────────────────── r2-1: «لا يُقرأ» ليس «محذوفًا» ─────────────────────────

test('r2-1: تجديد اشتراك (invoice.paid) في عطل قراءة الحساب ⇒ non-2xx فيُعاد — لا إلغاء للاشتراك الحيّ ولا تنبيه «ردّ المبلغ»، والإعادة تشحن', async () => {
  await fresh('nora', { plan: 'pro', planUpdatedAt: Date.now() - 31 * DAY, planPayId: 'cs_nora_first' });
  sub('sub_nora_pro', 'nora', 'pro', 'active');
  const before = orphanAlerts().length;
  const ev = renewal('in_nora_2', 'nora', 'pro', 2000, 'sub_nora_pro');
  const r = await duringOutage(() => hook(ev));
  assert.ok(r.code >= 500, 'كان 200 فلا يعيد Stripe أبدًا — ' + r.code);
  assert.equal(net.subs.sub_nora_pro.status, 'active', 'كان يُلغى فورًا (DELETE) والحساب حيّ');
  assert.equal(orphanAlerts().length, before, 'لا تنبيه «دفعة لحساب محذوف» كاذب');
  assert.equal(store.has('payorphan:in_nora_2'), false);
  assert.equal(store.has('paid:lastStripeInvoiceId:in_nora_2'), false, 'لا حجز قبل الأثر');
  const r2 = await hook(ev);
  assert.equal(r2.code, 200, JSON.stringify(r2.body));
  assert.equal(pts('nora'), 70 + 920, 'الإعادة بعد العطل تشحن مرّة');
  const u = await user('nora');
  assert.equal(u.plan, 'pro');
  assert.equal(u.planPayId, 'in_nora_2');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(pts('nora'), 70 + 920);
});

test('r2-1: جلسة اشتراك جديد (checkout.session.completed) في عطل القراءة ⇒ non-2xx والاشتراك حيّ، والإعادة تمنح', async () => {
  await fresh('omar', {});
  sub('sub_omar_max', 'omar', 'max', 'active');
  const ev = subSession('cs_omar_max', 'omar', 'max', 10000, 'sub_omar_max');
  const r = await duringOutage(() => hook(ev));
  assert.ok(r.code >= 500, String(r.code));
  assert.equal(net.subs.sub_omar_max.status, 'active');
  assert.equal(store.has('payorphan:cs_omar_max'), false);
  assert.equal((await hook(ev)).code, 200);
  assert.equal((await user('omar')).plan, 'max');
  assert.equal(pts('omar'), 70 + 3200);
});

test('r2-1: اكتمال التقاط PayPal (الويب هوك) في عطل القراءة يرمي (500 فيعيد PayPal) لا «account» و200؛ والإعادة تشحن', async () => {
  await fresh('yara', {});
  ppOrder('ORD_Y', 'CAP_Y', 'yara', 'pro', '20.00');
  let r = null, err = null;
  await duringOutage(async () => { try { r = await paypal.captureCompleted(capEvent('ORD_Y', 'CAP_Y')); } catch (e) { err = e; } });
  assert.ok(err || (r && r.retry), 'كان { status: "account" } فيردّ الويب هوك 200 ولا يُشحن أبدًا — ' + JSON.stringify(r));
  assert.equal(store.has('paid:lastPaypalOrderId:ORD_Y'), false, 'لا حجز قبل الأثر');
  r = await paypal.captureCompleted(capEvent('ORD_Y', 'CAP_Y'));
  assert.equal(r.status, 'credited');
  assert.equal(pts('yara'), 70 + 920);
  assert.equal((await user('yara')).plan, 'pro');
});

test('r2-1: دفعة المحفظة في عطل القراءة كما كانت (500 ولا تنبيه)، والإعادة تشحن', async () => {
  await fresh('lina', {});
  const ev = walletPi('pi_lina', 'lina', 'pro', 2000);
  const before = orphanAlerts().length;
  const r = await duringOutage(() => hook(ev));
  assert.equal(r.code, 500);
  assert.equal(orphanAlerts().length, before);
  assert.equal((await hook(ev)).code, 200);
  assert.equal(pts('lina'), 70 + 920);
});

// ───────────────────────── r2-2: المحذوف فعلًا يُعامَل واحدًا في المسارات الثلاثة ─────────────────────────

test('r2-2: دفعة محفظة (payment_intent.succeeded) لحساب محذوف ⇒ تنبيه المالك مرّة ليردّ المبلغ و200 — لا 500 ثلاثة أيّام ثمّ إسقاط صامت', async () => {
  await auth.putUser('gone1', { deleted: true, deletedAt: Date.now(), selfDeleted: true });
  const before = orphanAlerts().length;
  const ev = walletPi('pi_gone1', 'gone1', 'max', 10000);
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await hook(ev)).code);
  assert.deepEqual(codes, [200, 200, 200], 'كان 500 في كلّ إعادة');
  assert.equal(orphanAlerts().length, before + 1, 'تنبيه واحد للمالك');
  const a = orphanAlerts().pop();
  assert.match(a.body, /gone1/);
  assert.match(a.body, /pi_gone1/);
  assert.match(a.body, /100\.00 USD/, 'بمبلغ العمليّة');
  assert.equal(store.has('payorphan:pi_gone1'), true);
  assert.equal(store.has('points:gone1'), false, 'لا منح لمحذوف');
});

test('r2-2: اكتمال التقاط PayPal لحساب محذوف ⇒ التنبيه نفسه مرّة (لا سطر سجلّ وحده)، والويب هوك لا يُعاد', async () => {
  await auth.putUser('gone2', { deleted: true, deletedAt: Date.now(), selfDeleted: true });
  ppOrder('ORD_G2', 'CAP_G2', 'gone2', 'pro', '20.00');
  const before = orphanAlerts().length;
  const r1 = await paypal.captureCompleted(capEvent('ORD_G2', 'CAP_G2'));
  const r2 = await paypal.captureCompleted(capEvent('ORD_G2', 'CAP_G2'));
  assert.ok(!r1.retry && !r2.retry, 'لا إعادة لما لا يُشحن أبدًا');
  assert.equal(orphanAlerts().length, before + 1, 'كان سطرًا في سجلّ الأخطاء وحده (paypal:capture-completed account)');
  const a = orphanAlerts().pop();
  assert.match(a.body, /gone2/);
  assert.match(a.body, /ORD_G2/);
  assert.match(a.body, /20\.00 USD/);
  assert.equal(store.has('points:gone2'), false);
});

// ───────────────────────── r2-3: المحفوظ تحت الأعلى لا يلغي اشتراك الأعلى ─────────────────────────

test('r2-3: جلسة اشتراك Plus قديمة تكتمل فوق اشتراك Max حيّ ⇒ Max يبقى يتجدّد وPlus (الزائد) يُلغى وفترته في planNext — في الويب هوك وإعادته', async () => {
  await fresh('dana', { plan: 'max', planUpdatedAt: Date.now() - 2 * DAY, planPayId: 'cs_dana_max' });
  sub('sub_dana_max', 'dana', 'max', 'active');
  sub('sub_dana_plus', 'dana', 'basic', 'active'); // أحدث: أُنشئ من تبويب قديم
  const ev = subSession('cs_dana_plus', 'dana', 'basic', 1000, 'sub_dana_plus');
  const r = await hook(ev);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(net.subs.sub_dana_max.status, 'active', 'كان يُلغى: يسقط إلى Plus بعد نهاية الفترة نهائيًّا');
  assert.equal(net.subs.sub_dana_plus.status, 'canceled', 'لا خصمان شهريّان: الأدنى المحفوظ هو الزائد');
  const u = await user('dana');
  assert.equal(tier.chatPeriod(u).plan, 'max');
  assert.ok(Array.isArray(u.planNext) && u.planNext.some((n) => n.plan === 'basic' && n.payId === 'cs_dana_plus'), JSON.stringify(u.planNext));
  assert.equal(pts('dana'), 70 + 360);
  assert.equal((await hook(ev)).code, 200, 'إعادة الحدث («سبق المنح») لا تلغي Max أيضًا');
  assert.equal(net.subs.sub_dana_max.status, 'active');
  assert.equal(pts('dana'), 70 + 360);
});

test('r2-3: الأعلى دفعة لشهر بلا اشتراك ⇒ اشتراك الأدنى المحفوظ يبقى يتجدّد بعدها (لا شيء يُلغى)', async () => {
  await fresh('mona', { plan: 'max', planUpdatedAt: Date.now() - 2 * DAY, planPayId: 'pi_mona_max' });
  sub('sub_mona_pro', 'mona', 'pro', 'active');
  assert.equal((await hook(subSession('cs_mona_pro', 'mona', 'pro', 2000, 'sub_mona_pro'))).code, 200);
  assert.equal(net.subs.sub_mona_pro.status, 'active');
  assert.equal(tier.chatPeriod(await user('mona')).plan, 'max');
});

test('r2-3: العودة من الدفع (verify-checkout) لجلسة أدنى محفوظة لا تلغي الأعلى، ثمّ الويب هوك («سبق المنح») لا يلغيه', async () => {
  await fresh('dina', { plan: 'max', planUpdatedAt: Date.now() - 1 * DAY, planPayId: 'cs_dina_max' });
  sub('sub_dina_max', 'dina', 'max', 'active');
  sub('sub_dina_pro', 'dina', 'pro', 'active');
  const ev = subSession('cs_dina_pro', 'dina', 'pro', 2000, 'sub_dina_pro');
  net.sessions.cs_dina_pro = Object.assign({}, ev.data.object);
  const v = await stripe('verify-checkout', { session_id: 'cs_dina_pro', token: tok('dina') });
  assert.equal(v.code, 200, JSON.stringify(v.body));
  assert.equal(net.subs.sub_dina_max.status, 'active');
  assert.equal(net.subs.sub_dina_pro.status, 'canceled');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(net.subs.sub_dina_max.status, 'active', 'المنح «سبق» بلا kept — والقرار من حالة الحساب');
  assert.equal(tier.chatPeriod(await user('dina')).plan, 'max');
});

test('r2-3: الترقية كما كانت — اشتراك Max جديد يلغي Plus الأقدم', async () => {
  await fresh('rawa', { plan: 'basic', planUpdatedAt: Date.now() - 3 * DAY, planPayId: 'cs_rawa_b' });
  sub('sub_rawa_basic', 'rawa', 'basic', 'active');
  sub('sub_rawa_max', 'rawa', 'max', 'active');
  assert.equal((await hook(subSession('cs_rawa_max', 'rawa', 'max', 10000, 'sub_rawa_max'))).code, 200);
  assert.equal(net.subs.sub_rawa_basic.status, 'canceled');
  assert.equal(net.subs.sub_rawa_max.status, 'active');
  assert.equal((await user('rawa')).plan, 'max');
});

// ───────────────────────── r2-4: التقاط متأخّر لوسائط أدنى لا يمحو رصيد الأعلى ─────────────────────────

test('r2-4: طلب PayPal media_basic معلَّق ثمّ media_max بالبطاقة، ثمّ اكتمال الالتقاط ⇒ الأعلى ورصيدها باقيان ورصيد الأدنى يُضاف', async () => {
  await fresh('rana', {});
  const cr = await pp({ action: 'create', plan: 'media_basic', token: tok('rana') });
  assert.equal(cr.code, 200, JSON.stringify(cr.body));
  const orderId = cr.body.id;
  assert.equal((await hook(paidSession('cs_rana_mm', 'rana', 'media_max', 10211))).code, 200);
  store.set('media:mix:rana', '9000'); // صرف جزءًا من ١٢٥٠٠
  const u1 = await user('rana');
  assert.equal(u1.media.mix.plan, 'media_max');
  const blocked = await pp({ action: 'create', plan: 'media_basic', token: tok('rana') });
  assert.equal(blocked.code, 409, 'طلب أدنى جديد ممنوع (v-lock-subs)');
  net.orders[orderId] = { id: orderId, status: 'COMPLETED', create_time: new Date().toISOString(), purchase_units: [{ reference_id: 'rana', custom_id: 'media_basic', payments: { captures: [{ id: 'CAP_R', status: 'COMPLETED', custom_id: 'media_basic', amount: { value: '10.21', currency_code: 'USD' } }] } }] };
  const r = await paypal.captureCompleted(capEvent(orderId, 'CAP_R'));
  assert.equal(r.status, 'credited', JSON.stringify(r));
  const u2 = await user('rana');
  assert.equal(u2.media.mix.plan, 'media_max', 'كانت media_basic');
  assert.equal(u2.media.mix.at, u1.media.mix.at, 'نافذة الأعلى كما هي');
  assert.equal(u2.media.mix.payId, 'cs_rana_mm');
  assert.equal(store.get('media:mix:rana'), String(9000 + 1250), 'كان ١٢٥٠: المتبقّي ٩٠٠٠ مُحي');
  assert.equal((await paypal.captureCompleted(capEvent(orderId, 'CAP_R'))).status, 'already');
  assert.equal(store.get('media:mix:rana'), String(9000 + 1250), 'مرّة واحدة');
});

test('r2-4: جلسة Stripe قديمة لوسائط أدنى بالطريقة نفسها؛ واستردادها كاملًا يأخذ ما أضافته وحده والأعلى باقية', async () => {
  await fresh('sama', {});
  assert.equal((await hook(paidSession('cs_sama_mm', 'sama', 'media_max', 10211))).code, 200);
  store.set('media:mix:sama', '5000');
  assert.equal((await hook(paidSession('cs_sama_mb', 'sama', 'media_basic', 1021))).code, 200);
  let u = await user('sama');
  assert.equal(u.media.mix.plan, 'media_max');
  assert.equal(store.get('media:mix:sama'), String(5000 + 1250));
  const refund = evt('charge.refunded', { id: 'ch_sama_mb', object: 'charge', payment_intent: 'pi_cs_sama_mb', amount: 1021, amount_refunded: 1021, refunded: true, currency: 'usd' });
  assert.equal((await hook(refund)).code, 200);
  u = await user('sama');
  assert.equal(u.media.mix.plan, 'media_max', 'استرداد الأدنى لا يُسقط الأعلى');
  assert.equal(store.get('media:mix:sama'), '5000', 'ما أضافته الدفعة المستردّة يُسحب');
});

test('r2-4 · r2-3: اشتراك media_basic من جلسة قديمة فوق اشتراك media_max حيّ برصيد ⇒ الرصيد يُضاف، واشتراك الأعلى يبقى والأدنى الزائد يُلغى', async () => {
  await fresh('lama', {});
  sub('sub_lama_mm', 'lama', 'media_max', 'active');
  assert.equal((await hook(subSession('cs_lama_mm', 'lama', 'media_max', 10211, 'sub_lama_mm'))).code, 200);
  store.set('media:mix:lama', '7000');
  sub('sub_lama_mb', 'lama', 'media_basic', 'active');
  assert.equal((await hook(subSession('cs_lama_mb', 'lama', 'media_basic', 1021, 'sub_lama_mb'))).code, 200);
  const u = await user('lama');
  assert.equal(u.media.mix.plan, 'media_max');
  assert.equal(store.get('media:mix:lama'), String(7000 + 1250));
  assert.equal(net.subs.sub_lama_mm.status, 'active', 'الأعلى لا يُلغى');
  assert.equal(net.subs.sub_lama_mb.status, 'canceled', 'لا خصمان شهريّان');
});

test('r2-4: فشل كتابة السجلّ بعد إضافة الرصيد ⇒ الحجز باقٍ وعلامة الإكمال، والإعادة تكمل بلا إضافة ثانية ولا إعادة ملء (v-lock-credit)', async () => {
  await fresh('nada', {});
  assert.equal((await hook(paidSession('cs_nada_mm', 'nada', 'media_max', 10211))).code, 200);
  store.set('media:mix:nada', '6000');
  const ev = paidSession('cs_nada_mb', 'nada', 'media_basic', 1021);
  fail.userPut = 1;
  const r1 = await hook(ev);
  fail.userPut = 0;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal(store.get('media:mix:nada'), String(6000 + 1250), 'الأثر تمّ مرّة');
  assert.equal(store.has('paid-credit:lastStripeSessionId:cs_nada_mb'), true, 'علامة الإكمال');
  assert.equal((await hook(ev)).code, 200);
  assert.equal((await hook(ev)).code, 200);
  const u = await user('nada');
  assert.equal(u.media.mix.plan, 'media_max', 'الإكمال لا يكتب الأدنى فترةً');
  assert.equal(u.media.mix.payId, 'cs_nada_mm');
  assert.equal(store.get('media:mix:nada'), String(6000 + 1250), 'لا إضافة ثانية ولا إعادة ملء ١٢٥٠');
  assert.equal(store.has('paid-credit:lastStripeSessionId:cs_nada_mb'), false);
  const rec = JSON.parse(store.get('payrec:cs_nada_mb'));
  assert.equal(rec.topUp, true, 'سجلّ المنح يعرف أنّها إضافة');
});

test('r2-4: رصيد الأعلى فارغ ⇒ الأدنى يحلّ محلّها كما كان (لا خسارة)', async () => {
  await fresh('huda2', {});
  assert.equal((await hook(paidSession('cs_huda2_mm', 'huda2', 'media_max', 10211))).code, 200);
  store.set('media:mix:huda2', '0');
  assert.equal((await hook(paidSession('cs_huda2_mb', 'huda2', 'media_basic', 1021))).code, 200);
  const u = await user('huda2');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(store.get('media:mix:huda2'), '1250');
});

// ───────────────────────── r2-5: «جدّد» يقود إلى طريق شراء ─────────────────────────

function fnSrc(src, names) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  const out = [];
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'FunctionDeclaration' && n.id && names.includes(n.id.name)) out.push(src.slice(n.start, n.end));
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast);
  return out.join('\n');
}
const CHECKOUT_SRC = read('js/app-06-checkout.js');
const PARTIAL = read('js/partials-settings.js');
function planButtons() {
  const i = PARTIAL.indexOf('<div class="priceTab" data-tab="chat">'), j = PARTIAL.indexOf('<!-- v-autorenew-toggle', i);
  assert.ok(i > 0 && j > i);
  return [...PARTIAL.slice(i, j).matchAll(/<button ([^>]*)>([^<]*)<\/button>/g)].map((m) => {
    const attrs = new Map([...m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((x) => [x[1], x[2] === undefined ? '' : x[2]]));
    let cls = String(attrs.get('class') || '');
    return { dataset: {}, style: {}, disabled: false, textContent: m[2], get className() { return cls; }, set className(v) { cls = v; }, getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)) };
  });
}
async function pricing(balance) {
  const btns = planButtons();
  const sb = {
    console, __swallow() {}, t: (k) => 'T:' + k, authGet: () => 'tok',
    document: { getElementById: (id) => ({ pricingWalletRow: { style: {} }, pricingWalletValue: {} })[id] || null, querySelectorAll: (s) => (/pricingSection/.test(s) && /chat/.test(s) && /pbtn/.test(s) ? btns : []) },
    fetch: async () => ({ json: async () => balance }),
    applyPlanGate: (d) => { sb.__omranPlan = (d.tier === 'sub' ? String(d.plan || '').toLowerCase() : '') || d.tier; },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fnSrc(CHECKOUT_SRC, ['refreshPointsWallet', 'renderMediaPlanStatus', 'pricingMarkCurrentPlan', 'checkoutLowerThanCurrent']) + '\nconst CHECKOUT_PLAN_RANK = { basic: 1, pro: 2, max: 3 };', sb);
  await sb.refreshPointsWallet();
  const [free, plus, pro, max] = btns;
  return { sb, free, plus, pro, max, key: (b) => b.getAttribute('data-i18n') };
}
const maxSub = (days) => ({ ok: true, authed: true, points: 400, tier: 'sub', plan: 'max', media: {}, subs: [{ kind: 'chat', plan: 'max', endsAt: Date.now() + days * DAY, active: true }] });

test('r2-5: مشترك Max قبل الانتهاء بيومين (التنبيه يقول «جدّد») ⇒ بطاقته «جدّد» وتعمل، والأدنى ما زالت ممنوعة', async () => {
  const w = await pricing(maxSub(2));
  assert.equal(w.max.disabled, false, 'كانت «باقتك الحالية» معطّلة: لا شيء يُشترى');
  assert.equal(w.key(w.max), 'plansRenew');
  assert.equal(w.max.textContent, 'T:plansRenew');
  assert.equal(w.max.getAttribute('onclick'), "openCheckout('max')", 'مسار الدفع نفسه');
  assert.equal(w.sb.checkoutLowerThanCurrent('pro'), true, 'لا يُفتح الأدنى من جديد');
  assert.equal(w.sb.checkoutLowerThanCurrent('basic'), true);
  assert.equal(w.sb.checkoutLowerThanCurrent('max'), false);
  // والخادم يقبل الباقة نفسها ويرفض الأدنى
  await fresh('maxu', { plan: 'max', planUpdatedAt: Date.now() - 33 * DAY, planPayId: 'pi_old' });
  assert.equal((await stripe('', { plan: 'max', token: tok('maxu'), origin: 'https://x' })).code, 200);
  assert.equal((await stripe('', { plan: 'pro', token: tok('maxu'), origin: 'https://x' })).code, 409);
});

test('r2-5: بعيدًا عن الانتهاء تبقى «باقتك الحالية» معطّلة (لا دعوة لشراء الباقة نفسها مبكّرًا)، وتعود حين تتغيّر الحالة', async () => {
  const w = await pricing(maxSub(20));
  assert.equal(w.max.disabled, true);
  assert.equal(w.key(w.max), 'planCurrentBtn');
  w.sb.fetch = async () => ({ json: async () => maxSub(1) });
  await w.sb.refreshPointsWallet();
  assert.equal(w.max.disabled, false);
  assert.equal(w.key(w.max), 'plansRenew');
  w.sb.fetch = async () => ({ json: async () => ({ ok: true, authed: true, points: 70, tier: 'free', plan: null, subs: [] }) });
  await w.sb.refreshPointsWallet();
  assert.equal(w.key(w.max), 'pricingSubscribeBtn', 'زرّ Max يعود كما كان');
  assert.equal(w.max.disabled, false);
  assert.equal(w.key(w.free), 'planCurrentBtn');
});

// ───────────────────────── r2-6: علامة كلمة المرور لا تمحوها كتابة رمز استرجاع ─────────────────────────

const del = (u, confirm, password) => deleteAccount({ username: u, token: tok(u), confirmUsername: confirm, password });
async function googleWithOwnPassword(email, shown, pw) {
  const key = 'g_' + email;
  const { salt, hash } = auth.hashPassword(pw);
  // ما يكتبه resetWithToken على main حرفيًّا لحساب Google وضع صاحبه كلمته قبل العلامة: resetTokenHash: null، بلا sv ولا passwordSet
  await auth.putUser(key, { username: shown, email, verifiedEmail: email, googleAuth: true, salt, hash, resetTokenHash: null, resetTokenExpiry: null, createdAt: Date.now() - 40 * DAY });
  return key;
}

test('r2-6: حساب Google وضع كلمته بالاسترجاع، ثمّ forgotPassword باسمه (بلا كلمة مرور) ⇒ الحذف ما زال يطلبها', async () => {
  const key = await googleWithOwnPassword('rg@x.com', 'Rana G', 'rana-chosen-pass-1');
  assert.equal((await del(key, 'Rana G', '')).body.code, 'wrong_password', 'قبل: محميّ');
  await call(auth, { body: { action: 'forgotPassword', username: key } });
  const rec = await user(key);
  assert.equal(typeof rec.resetTokenHash, 'string', 'forgotPassword أعاد كتابة resetTokenHash');
  const r = await del(key, 'Rana G', '');
  assert.equal(r.body.code, 'wrong_password', 'كان 200: رمز الجلسة والاسم وحدهما يحذفان الحساب — ' + JSON.stringify(r.body));
  assert.ok(!(await user(key)).deleted);
  assert.equal((await del(key, 'Rana G', 'rana-chosen-pass-1')).status, 200, 'بكلمته يحذف نفسه');
});

test('r2-6: ورابط الاسترجاع من المالك (admin reset-link) كذلك', async () => {
  const key = await googleWithOwnPassword('rl@x.com', 'Reem L', 'reem-chosen-pass-1');
  const r0 = await call(adminActions, { body: { token: tok('omran'), action: 'reset-link', targetUsername: key } });
  assert.equal(r0.code, 200, JSON.stringify(r0.body));
  assert.equal(typeof (await user(key)).resetTokenHash, 'string');
  assert.equal((await del(key, 'Reem L', '')).body.code, 'wrong_password', 'كان 200');
});

test('r2-6: العلامة صريحة في كلّ مكان تُوضع فيه كلمة مرور، وغيابها = تُطلب؛ وحسابات Google/رمز البريد الجديدة بلا كلمة تبقى تحذف نفسها', () => {
  const h = { salt: 's', hash: 'h' };
  // وُضعت كلمة: التسجيل وchangePassword وresetWithToken (passwordSet: true)، أو sv > 0
  assert.equal(needsPassword(Object.assign({ passwordSet: true, googleAuth: true }, h)), true);
  assert.equal(needsPassword(Object.assign({ sv: 2, otpOnly: true }, h)), true);
  // Google/رمز البريد منذ الإنشاء بلا كلمة (passwordSet: false يكتبه الكولباك ورمز البريد) — ولو أُصدر رمز استرجاع لم يُستعمل
  assert.equal(needsPassword(Object.assign({ passwordSet: false, googleAuth: true }, h)), false);
  assert.equal(needsPassword(Object.assign({ passwordSet: false, otpOnly: true, resetTokenHash: 'abc' }, h)), false);
  // سجلّ قديم بلا العلامة: لم يُصدَر له رمز استرجاع قطّ ⇒ لا طريق لكلمة يعرفها صاحبه (changePassword يطلب الحاليّة العشوائيّة)
  assert.equal(needsPassword(Object.assign({ googleAuth: true }, h)), false);
  // سجلّ قديم صدر له رمز (null بعد الاسترجاع، أو نصّ كتبه طلب جديد) ⇒ لا يُعرف ⇒ تُطلب
  assert.equal(needsPassword(Object.assign({ googleAuth: true, resetTokenHash: null }, h)), true);
  assert.equal(needsPassword(Object.assign({ googleAuth: true, resetTokenHash: 'abc' }, h)), true);
  assert.equal(needsPassword(Object.assign({ otpOnly: true, resetTokenHash: 'abc' }, h)), true);
  // حساب التسجيل: دائمًا
  assert.equal(needsPassword(Object.assign({}, h)), true);
  // والكتّاب: التسجيل وكولباك Google ورمز البريد يكتبون العلامة صراحة
  const authSrc = read('api/_lib/auth.js');
  const signup = authSrc.slice(authSrc.indexOf("if (action === 'signup')"), authSrc.indexOf('await putUser(key, user); // v-signup-no-email'));
  assert.match(signup, /passwordSet:\s*true/, 'التسجيل');
  const otp = authSrc.slice(authSrc.indexOf('otpOnly: true,') - 600, authSrc.indexOf('otpOnly: true,') + 60);
  assert.match(otp, /passwordSet:\s*false/, 'رمز البريد');
  const cb = read('api/_lib/auth-google-callback.js');
  const cbRec = cb.slice(cb.indexOf('googleAuth: true,') - 400, cb.indexOf('googleAuth: true,') + 200);
  assert.match(cbRec, /passwordSet:\s*false/, 'كولباك Google');
});

test('r2-6: التسجيل الحقيقيّ يكتب passwordSet: true', async () => {
  const r = await call(auth, { body: { action: 'signup', username: 'r2signup', password: 'r2-signup-pass-1' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal((await user('r2signup')).passwordSet, true);
});

// ═════════════════════════ جولة المراجعة الثانية (lock-r2/fix-b): عدسات بيانات المستخدمين والواجهة وثوابت المال ═════════════════════════

const rename = (from, to, token) => call(auth, { body: { action: 'changeUsername', token: token || tok(from), newUsername: to } });
async function signupU(name, pw) {
  const r = await call(auth, { body: { action: 'signup', username: name, password: pw } });
  assert.equal(r.code, 200, name + ' ' + JSON.stringify(r.body));
  return r.body.token;
}
async function freshWindow(k) { const u = await user(k); u.renameLog = []; await auth.putUser(k, u); } // حدّ التغييرين في ٢٤ ساعة — للاختبار وحده

// ───────────────────────── userdata-1: حذف حساب غيّر اسمه يمحو ما تحت أسمائه السابقة ─────────────────────────

test('userdata-1: حساب غيّر اسمه ثمّ حذف نفسه ⇒ محادثاته وذاكرته وتذكيراته واشتراك إشعاراته تحت اسمه السابق تُمحى، وفهرسا بريده وهاتفه أيضًا', async () => {
  await signupU('lina1', 'lina1-pass-1234');
  const oldData = ['chats:lina1', 'chats_deleted:lina1', 'db/memory/lina1.json', 'db/living/lina1.json', 'db/reminders/lina1.json', 'db/push-subs/lina1.json', 'db/stocks/pf/lina1.json', 'db/agentrun/lina1.json', 'emaildraft:lina1:m1', 'planvid:lina1:123'];
  for (const k of oldData) store.set(k, JSON.stringify({ secret: 'lina1' }));
  const rec = await user('lina1');
  rec.email = 'lina1@mail.test'; rec.verifiedEmail = 'lina1@mail.test'; rec.phone = '+971500000071';
  await auth.putUser('lina1', rec);
  store.set('db/email-index/lina1@mail.test', JSON.stringify({ username: 'lina1', at: Date.now() })); // كما يكتبه email-otp-verify
  store.set('db/phone-index/+971500000071', JSON.stringify({ username: 'lina1', at: Date.now() })); // كما يكتبه ربط الهاتف
  store.set('chats:other1', JSON.stringify([{ id: 'x' }])); // حساب آخر حيّ
  assert.equal((await rename('lina1', 'lina1_new')).code, 200);
  store.set('chats:lina1_new', JSON.stringify([{ id: 'new' }]));
  const r = await del('lina1_new', 'lina1_new', 'lina1-pass-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok((await user('lina1_new')).deleted);
  const left = oldData.filter((k) => store.has(k));
  assert.deepEqual(left, [], 'كانت تبقى تحت الاسم السابق بعد «تم حذف حسابك»');
  assert.equal(store.has('db/email-index/lina1@mail.test'), false, 'فهرس البريد (فيه البريد نفسه) كان يبقى يشير إلى الاسم السابق');
  assert.equal(store.has('db/phone-index/+971500000071'), false, 'وفهرس الهاتف');
  assert.equal(store.has('chats:lina1_new'), false);
  assert.equal(store.get('chats:other1'), JSON.stringify([{ id: 'x' }]), 'لا يمسّ حسابًا آخر');
});

// ───────────────────────── userdata-2: عطل قراءة شاهد الاسم السابق لا يُقرأ «ليس له» ─────────────────────────

test('userdata-2: قراءة شاهد الاسم السابق تتعثّر ⇒ لا «تم» ومشاركته العامّة باقية (retry)، والإعادة تحذفها', async () => {
  const { createShare } = require(rp('api/_lib/share.js'));
  await signupU('pub2old', 'pub2-pass-1234');
  const made = await createShare({ title: 't', code: '<p>pub2</p>', owner: 'pub2old', username: 'pub2old', isPublic: true });
  assert.ok(made && made.id);
  const shareKey = 'db/shares/' + made.id + '.json';
  const explore = () => [...store.keys()].filter((k) => k.startsWith('db/explore/') && k.endsWith('_' + made.id + '.json'));
  assert.ok(store.has(shareKey));
  assert.equal((await rename('pub2old', 'pub2new')).code, 200);
  fail.readKeys.add('db/users/pub2old.json'); // عطل نقل على شاهد الاسم السابق وحده (٤٢٩ أو مهلة)
  let r;
  try { r = await del('pub2new', 'pub2new', 'pub2-pass-1234'); } finally { fail.readKeys.clear(); }
  assert.notEqual(r.status, 200, 'كان 200 «تم» والمشاركة منشورة للأبد (الجلسة ماتت فلا يحذفها share.js)');
  assert.equal(r.body.code, 'retry');
  assert.ok(store.has(shareKey), 'لا أثر قبل أن تُعرف مشاركاته');
  assert.ok(!(await user('pub2new')).deleted);
  r = await del('pub2new', 'pub2new', 'pub2-pass-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(store.has(shareKey), false);
  assert.deepEqual(explore(), []);
});

// ───────────────────────── userdata-3: كلّ أسمائه المثبتة تُبحث اشتراكاتها عند الحذف ─────────────────────────

test('userdata-3: اشتراك Max اشتُري باسمه قبل أربعة تغييرات ⇒ حذف الحساب يلغيه فورًا (كان يُخصم حتّى التجديد)', async () => {
  await signupU('subs3a', 'subs3-pass-1234');
  sub('sub_subs3', 'subs3a', 'max', 'active');
  let cur = 'subs3a';
  for (const nx of ['subs3b', 'subs3c', 'subs3d', 'subs3e']) {
    await freshWindow(cur);
    assert.equal((await rename(cur, nx)).code, 200, nx);
    cur = nx;
  }
  const r = await del(cur, cur, 'subs3-pass-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(net.subs.sub_subs3.status, 'canceled', 'كان يبحث بالاسم الحاليّ وآخر ثلاثة أسماء وحدها');
});

test('userdata-3: الأسماء من حذف الحساب وحده (req.names) لا من جسم الطلب — جسمٌ فيه names لا يمسّ اشتراك غيره', async () => {
  await fresh('own3', {});
  sub('sub_victim3', 'victim3', 'max', 'active');
  const res = mkRes();
  await checkout.autoRenewToggle({ body: { token: tok('own3'), on: false, names: ['victim3'] } }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(net.subs.sub_victim3.status, 'active');
  assert.equal(net.subs.sub_victim3.cancel_at_period_end, false);
});

// ───────────────────────── userdata-4: الجلسة وحدها لا تعيد ربط قنوات الاسترجاع لحساب بكلمة مرور ─────────────────────────

test('userdata-4: جلسة مسروقة لحساب بكلمة مرور لا تنقل بريده ولا تربط هاتفًا بلا كلمته (ثمّ استرجاع ثمّ حذف)', async () => {
  const stolen = await signupU('victim4', 'victim4-pass-99');
  const ask = (extra) => call(auth, { body: Object.assign({ action: 'email-otp-request', purpose: 'change', token: stolen, email: 'attacker4@evil.test', lang: 'en' }, extra || {}) });
  let r = await ask();
  assert.equal(r.code, 401, 'كان 200: الرمز يصل بريد المهاجم ثمّ forgotPassword ثمّ resetWithToken ثمّ الحذف — ' + JSON.stringify(r.body));
  assert.equal(r.body.code, 'password_required');
  assert.equal(mail['attacker4@evil.test'], undefined, 'لا رمز يُرسل');
  r = await ask({ password: 'guess-1234' });
  assert.equal(r.code, 401);
  assert.equal(r.body.code, 'wrong_password');
  r = await call(auth, { body: { action: 'phone-link-start', token: stolen, channel: 'telegram' } });
  assert.equal(r.code, 401, 'ربط الهاتف ثمّ الاسترجاع به — ' + JSON.stringify(r.body));
  assert.equal(r.body.code, 'password_required');
  // صاحب الحساب بكلمته: كما كان
  r = await ask({ password: 'victim4-pass-99' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  r = await call(auth, { body: { action: 'email-otp-verify', purpose: 'change', token: stolen, email: 'attacker4@evil.test', otp: mail['attacker4@evil.test'].code, lang: 'en' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  r = await call(auth, { body: { action: 'phone-link-start', token: stolen, channel: 'telegram', password: 'victim4-pass-99' } });
  assert.notEqual(r.body && r.body.code, 'password_required');
  assert.notEqual(r.body && r.body.code, 'wrong_password');
});

test('userdata-4: حساب Google بلا كلمة وضعها صاحبها يغيّر بريده بجلسته كما كان (لا كلمة لم يضعها)', async () => {
  const { salt, hash } = auth.hashPassword(crypto.randomBytes(16).toString('hex'));
  await auth.putUser('g_gg4@x.com', { username: 'GG Four', email: 'gg4@x.com', verifiedEmail: 'gg4@x.com', googleAuth: true, passwordSet: false, salt, hash, createdAt: Date.now() - 9 * DAY });
  const r = await call(auth, { body: { action: 'email-otp-request', purpose: 'change', token: tok('g_gg4@x.com'), email: 'gg4.new@x.com', lang: 'en' } });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.ok(mail['gg4.new@x.com'] && mail['gg4.new@x.com'].code);
});

// ───────────────────────── userdata-6: مسوّدات حساب اسمه يبدأ باسم المحذوف و«:» ─────────────────────────

test('userdata-6: حذف «bob6» لا يمحو مسوّدات بريد الحساب الحيّ «bob6:work»، ويمحو مسوّداته هو', async () => {
  await signupU('bob6:work', 'bobw-pass-1234');
  store.set('emaildraft:bob6:work:18c2f0aa', JSON.stringify({ subject: 'draft of bob6:work' }));
  await signupU('bob6', 'bob6-pass-1234');
  store.set('emaildraft:bob6:abc123', JSON.stringify({ subject: 'draft of bob6' }));
  const r = await del('bob6', 'bob6', 'bob6-pass-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(store.has('emaildraft:bob6:abc123'), false);
  assert.ok(store.has('emaildraft:bob6:work:18c2f0aa'), 'كانت تُمحى: البادئة emaildraft:bob6: تطابق مسوّدات bob6:work');
  assert.ok(!(await user('bob6:work')).deleted);
});

// ───────────────────────── money-invariants-7: حجز الدفعة لا يبقى وحده ولا يُقال «سبق الشحن» على ردّ لا يُقرأ ─────────────────────────

test('money-invariants-7: ردّ حجز الدفعة 200 لا يُقرأ (والحجز كُتب) ⇒ الجلسة تُشحن مرّة — لا «سبق الشحن» 2xx بلا شيء', async () => {
  await fresh('ua7', {});
  fail.claimSet = 'unreadable';
  const ev = paidSession('cs_ua7', 'ua7', 'pro', 2000);
  const r = await hook(ev);
  fail.claimSet = null;
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(pts('ua7'), 70 + 920, 'كان ٧٠: «سبق الشحن» والباقة لم تُسلَّم');
  assert.equal((await user('ua7')).plan, 'pro');
  assert.equal((await hook(ev)).code, 200);
  net.sessions.cs_ua7 = Object.assign({}, ev.data.object);
  const v = await stripe('verify-checkout', { session_id: 'cs_ua7', token: tok('ua7') });
  assert.equal(v.code, 200);
  assert.equal(pts('ua7'), 70 + 920, 'مرّة واحدة');
});

test('money-invariants-7: الحجز وصل وضاع ردّه (ETIMEDOUT) لدفعة محفظة ⇒ تُشحن مرّة، والإعادة لا تضاعف', async () => {
  await fresh('ub7', {});
  fail.claimSet = 'lost';
  const ev = walletPi('pi_ub7', 'ub7', 'max', 10000);
  const r1 = await hook(ev);
  fail.claimSet = null;
  const r2 = await hook(ev);
  assert.equal(r2.code, 200);
  assert.ok(r1.code === 200 || r1.code >= 500, String(r1.code));
  assert.equal(pts('ub7'), 70 + 3200, 'كان ٧٠ والإعادة «سبق الشحن» (claim=ub7 بلا علامة)');
  assert.equal((await user('ub7')).plan, 'max');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(pts('ub7'), 70 + 3200);
});

test('money-invariants-7: الحجز لم يُكتب (عطل قبل الكتابة) ⇒ non-2xx بلا حجز، والإعادة تشحن', async () => {
  await fresh('uc7', {});
  fail.claimSet = 'before';
  const ev = paidSession('cs_uc7', 'uc7', 'pro', 2000);
  const r1 = await hook(ev);
  fail.claimSet = null;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal(store.has('paid:lastStripeSessionId:cs_uc7'), false);
  assert.equal(pts('uc7'), 70);
  assert.equal((await hook(ev)).code, 200);
  assert.equal(pts('uc7'), 70 + 920);
});

test('money-invariants-7: دفعة مُنحت سابقًا ثمّ أُعيدت وردّ الحجز لا يُقرأ ⇒ لا شحن ثانٍ (الحجز القائم يُقرأ قبل الكتابة)', async () => {
  await fresh('ud7', {});
  const evA = paidSession('cs_ud7a', 'ud7', 'pack700', 500);
  assert.equal((await hook(evA)).code, 200);
  assert.equal((await hook(paidSession('cs_ud7b', 'ud7', 'pack700', 500))).code, 200); // الحقل على الحساب صار رقم الدفعة الثانية
  const before = pts('ud7');
  fail.claimSet = 'unreadable';
  let r;
  try { r = await hook(evA); } finally { fail.claimSet = null; }
  assert.equal(r.code, 200);
  assert.equal(pts('ud7'), before, 'لا شحن ثانٍ لدفعة حجزها قائم');
});

test('money-invariants-7: kv.js الحقيقيّ — SET NX بردّ 200 لا يُقرأ: strict يرمي، وبلا strict false كما كان', async () => {
  const f = rp('api/_lib/kv.js');
  const saved = require.cache[f];
  delete require.cache[f];
  let realKv;
  try { realKv = require(f); } finally { require.cache[f] = saved; }
  net.upstash = () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  try {
    assert.equal(await realKv.kvSetIfAbsent('paid:x:1', 'u', 10), false, 'بلا strict كما كان');
    await assert.rejects(() => realKv.kvSetIfAbsent('paid:x:1', 'u', 10, { strict: true }), /unreadable/);
    net.upstash = () => reply(200, { result: null });
    assert.equal(await realKv.kvSetIfAbsent('paid:x:1', 'u', 10, { strict: true }), false, 'مشغول = false');
    net.upstash = () => reply(200, { result: 'OK' });
    assert.equal(await realKv.kvSetIfAbsent('paid:x:1', 'u', 10, { strict: true }), true);
  } finally { net.upstash = null; }
});

// ───────────────────────── money-invariants-8: تغيير الاسم يأخذ قفل الحساب ─────────────────────────

// يبدأ تغيير الاسم لحظة القراءة المختارة داخل قفل الحساب، وينتظر حتّى يكتمل أو ٣٠٠ms (فلا ينتظره إن كان هو ينتظر القفل نفسه)
function raceRename(name, to, fire) {
  let p = null, done = false;
  hooks.get = async (k) => {
    if (p || !fire(k) || !store.has('db/acct-lock/' + name)) return;
    p = rename(name, to).then((x) => { done = true; return x; });
    const until = Date.now() + 300;
    while (!done && Date.now() < until) await new Promise((r) => setTimeout(r, 5));
  };
  return { renamed: () => p };
}

test('money-invariants-8: تغيير الاسم أثناء منحٍ يمسك قفل الحساب ينتظره ⇒ الباقة ونقاطها على الاسم الجديد، والقديم شاهد لا حساب حيّ', async () => {
  await fresh('renold8', {});
  const race = raceRename('renold8', 'rennew8', (k) => k === 'points:renold8');
  let r;
  try { r = await hook(paidSession('cs_ren8', 'renold8', 'pro', 2000)); } finally { hooks.get = null; }
  const rn = await race.renamed();
  assert.ok(rn, 'التغيير بدأ داخل المنح');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(rn.code, 200, JSON.stringify(rn.body));
  const oldRec = await auth.getUser('renold8', 1);
  assert.equal(oldRec.deleted, true, 'كان المنح يكتب السجلّ القديم فوق الشاهد: الاسم الميّت حيّ بالباقة');
  assert.equal(oldRec.movedTo, 'rennew8');
  const nu = await user('rennew8');
  assert.equal(nu.plan, 'pro', 'الباقة المدفوعة على الحساب الحيّ');
  assert.equal(pts('rennew8'), 70 + 920);
  assert.equal(store.has('points:renold8'), false);
});

test('money-invariants-8: مرآة صرف النقاط أثناء تغيير الاسم لا تُحيي الاسم القديم', async () => {
  const points = require(rp('api/_lib/points.js'));
  await fresh('mold8', { points: 500 });
  const race = raceRename('mold8', 'mnew8', (k) => k === 'points:mold8');
  let s;
  try { s = await points.spendPoints('mold8', 15, 'chat'); } finally { hooks.get = null; }
  const rn = await race.renamed();
  assert.ok(s && s.ok, JSON.stringify(s));
  assert.ok(rn, 'التغيير بدأ داخل المرآة');
  assert.equal(rn.code, 200, JSON.stringify(rn.body));
  const oldRec = await auth.getUser('mold8', 1);
  assert.equal(oldRec.deleted, true, 'كانت المرآة تكتب السجلّ القديم فوق الشاهد');
  assert.equal(pts('mnew8'), 485);
  assert.equal(store.has('points:mold8'), false);
});

// ───────────────────────── money-invariants-9: الردّ بالاسم السابق يصل الحساب الحيّ ─────────────────────────

test('money-invariants-9: فيديو مدفوع ثمّ تغيير الاسم ثمّ فشل المزوّد ⇒ النقاط تعود للاسم الجديد لا لعدّاد يتيم', async () => {
  const points = require(rp('api/_lib/points.js'));
  const vj = require(rp('api/_lib/video-job.js'));
  await fresh('vold9', { points: 500 });
  const pay = await points.spendPoints('vold9', 120, 'omni_video');
  assert.ok(pay.ok, JSON.stringify(pay));
  assert.ok(await vj.rememberVideoJob('omni/op-r2-9', { username: 'vold9', cost: 120, pay }));
  assert.equal((await rename('vold9', 'vnew9')).code, 200);
  assert.equal(pts('vnew9'), 380);
  const s = await vj.settleVideoJob('omni/op-r2-9', false);
  assert.ok(s && s.refunded, JSON.stringify(s));
  assert.equal(pts('vnew9'), 500, 'كان ٣٨٠ والـ١٢٠ في points:vold9 اليتيم');
  assert.equal(store.has('points:vold9'), false);
});

test('money-invariants-9: حجز صورة مها بالاسم السابق يُكنس ويُردّ بعد تغيير الاسم', async () => {
  const points = require(rp('api/_lib/points.js'));
  const hold = require(rp('api/_lib/image-hold.js'));
  await fresh('hold9', { points: 500 });
  const pay = await points.spendPoints('hold9', 20, 'image');
  assert.ok(pay.ok);
  assert.equal(await hold.holdFromRequest('hold-r2nine01', 'hold9', 20, pay), 'hold-r2nine01');
  assert.equal((await rename('hold9', 'holdnew9')).code, 200);
  const sw = await hold.settleStale('holdnew9', { now: Date.now() + 10 * 60000 });
  assert.equal(sw.refunded, 1, 'كان {refunded:0}: القائمة بقيت تحت الاسم القديم ولا يكنسها شيء — ' + JSON.stringify(sw));
  assert.equal(pts('holdnew9'), 500);
});

// ───────────────────────── client-ux-1 · client-ux-2: جسر محرّر المخطّطات ─────────────────────────

const FLOOR_SRC = read('js/app-15-floorplan.js');
const FLOOR_AST = acorn.parse(FLOOR_SRC, { ecmaVersion: 'latest', sourceType: 'script' });
// الجسر: IIFE التكامل في نافذة التطبيق (يستمع لـ{__omranView} من إطار المعاينة)
const BRIDGE_SRC = (() => {
  const st = FLOOR_AST.body.find((n) => n.type === 'ExpressionStatement' && FLOOR_SRC.slice(n.start, n.end).includes('__omranView !== 1'));
  assert.ok(st, 'IIFE الجسر');
  return FLOOR_SRC.slice(st.start, st.end);
})();
// عميل المحرّر: النصّ الذي يُحقن في إطار المعاينة (EDITOR_CLIENT)
const EDITOR_CLIENT_SRC = (() => {
  let out = null;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || out) return;
    if (n.type === 'VariableDeclarator' && n.id && n.id.name === 'EDITOR_CLIENT' && n.init && n.init.type === 'Literal') { out = n.init.value; return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(FLOOR_AST);
  assert.ok(out, 'EDITOR_CLIENT');
  return out;
})();

async function bridgeWorld(o) {
  const asked = [], replies = [], posts = [];
  const frame = { postMessage: (m) => replies.push(m) };
  let listener = null;
  const sb = {
    console, __swallow() {},
    t: (k) => (k === 'spendConfirm' ? 'هذه العملية تخصم {n} نقطة. أكمل؟' : k),
    confirm: (m) => { asked.push(m); return true; },
    authGet: (k) => (k === 'aiapp_auth_token' ? (o.token || '') : (k === 'aiapp_username' ? (o.username || '') : '')),
    omranOwnerUi: () => o.username === 'omran',
    fetch: async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ imageBase64: 'QUFB', mimeType: 'image/png' }) }; },
    document: { getElementById: (id) => (id === 'previewFrame' ? { contentWindow: frame } : null) },
  };
  sb.window = sb;
  Object.assign(sb, {
    omranFloorplan: { facadePrompt: () => 'villa facade, modern' },
    addEventListener: (type, fn) => { if (type === 'message') listener = fn; },
    omranLoadCosts: () => ({ image: 20, image_4k: 60 }),
    getGuestId: () => 'guest_abc123',
    __pointsBalance: o.balance,
  });
  vm.createContext(sb);
  vm.runInContext(BRIDGE_SRC, sb);
  assert.ok(listener, 'الجسر يستمع');
  return {
    asked, replies, posts,
    async view(id) {
      listener({ data: { __omranView: 1, id, view: 'front', spec: {} }, source: frame });
      for (let i = 0; i < 50 && !replies.some((r) => r.id === id); i++) await new Promise((r) => setImmediate(r));
      return replies.find((r) => r.id === id);
    },
  };
}

test('client-ux-1: جسر المخطّطات لا يسأل «تخصم ٢٠ نقطة» المالكَ ولا VIP ولا الضيف (لا خصم عليهم)، ويسأل صاحب النقاط كما كان', async () => {
  const owner = await bridgeWorld({ token: 'tok', username: 'omran', balance: Infinity });
  assert.equal((await owner.view(1)).ok, true);
  assert.deepEqual(owner.asked, [], 'كان المالك يُسأل عند كلّ ضغطة');
  const vip = await bridgeWorld({ token: 'tok', username: 'vipu', balance: Infinity });
  assert.equal((await vip.view(1)).ok, true);
  assert.deepEqual(vip.asked, []);
  const guest = await bridgeWorld({ token: '', username: '', balance: undefined });
  assert.equal((await guest.view(1)).ok, true);
  assert.deepEqual(guest.asked, [], 'الضيف: صورته التجريبيّة بلا نقاط');
  const paid = await bridgeWorld({ token: 'tok', username: 'sara', balance: 300 });
  assert.equal((await paid.view(1)).ok, true);
  assert.deepEqual(paid.asked, ['هذه العملية تخصم 20 نقطة. أكمل؟'], 'من يُخصم منه يُسأل بالسعر');
  assert.equal(paid.posts.length, 1);
});

test('client-ux-1: حارس الحلقة باقٍ — طلب ثانٍ أثناء الأوّل يُرفض بلا توليد ثانٍ حتّى للمالك', async () => {
  const w = await bridgeWorld({ token: 'tok', username: 'omran', balance: Infinity });
  const first = w.view(1);
  const second = await w.view(2);
  assert.equal(second.cancelled, true);
  assert.equal((await first).ok, true);
  assert.equal(w.posts.length, 1);
});

function editorWorld() {
  const sent = [], listeners = {};
  const el = (tag) => ({
    tag, style: {}, dataset: {}, innerHTML: '', textContent: '', children: [], disabled: false,
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, setPointerCapture() {}, closest: () => null,
  });
  const byId = {};
  const btns = ['front', 'majlis', 'hall'].map((v) => { const b = el('button'); b.dataset.view = v; b.textContent = v; b.className = 'ov-btn'; return b; });
  const sb = {
    console,
    document: {
      readyState: 'complete', body: { clientWidth: 900 },
      getElementById: (id) => (byId[id] || (byId[id] = el('div'))),
      createElement: el,
      querySelectorAll: (s) => (s === '.ov-btn' ? btns : []),
      addEventListener() {},
    },
    parent: { postMessage: (m) => sent.push(m) },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((x) => x !== fn); },
    __omranSpec: { plotWidth: 15, floors: [{ name: 'طابق 1', rooms: [{ name: 'مجلس', w: 5, h: 4 }] }] },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(EDITOR_CLIENT_SRC, sb);
  return { btns, sent, reply: (m) => (listeners.message || []).slice().forEach((fn) => fn({ data: Object.assign({ __omranViewOut: 1 }, m) })) };
}

test('client-ux-2: أثناء توليد واجهة تُعطَّل أزرار الواجهات كلّها (لا ضغطة تضيع بلا أثر)، وتعود بعد الردّ', () => {
  const w = editorWorld();
  const [front, majlis, hall] = w.btns;
  front.onclick();
  assert.equal(w.sent.length, 1);
  assert.equal(front.disabled, true);
  assert.equal(majlis.disabled, true, 'كان «المجلس» يبقى مفعّلًا فيُرفض طلبه (cancelled) ويعود بلا صورة ولا رسالة');
  assert.equal(hall.disabled, true);
  w.reply({ id: w.sent[0].id, ok: false, cancelled: true, error: '' });
  assert.deepEqual(w.btns.map((b) => b.disabled), [false, false, false]);
  assert.equal(front.textContent, 'front', 'نصّ الزرّ يعود');
  majlis.onclick();
  assert.equal(w.sent.length, 2);
  assert.equal(w.sent[1].view, 'majlis');
});

// ───────────────────────── client-ux-3: صيغة الطلب المؤدّبة في مها الأساسيّ ─────────────────────────

function mahaImageFn() {
  const src = read('js/app-08-maha.js');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const want = (name) => /^MAHA_IMG|^MAHA_IMAGE_|^mahaImgRe$|^mahaLastImageBase64$|^mahaImgThisCall$/.test(name);
  const parts = [];
  for (const n of ast.body) {
    if (n.type === 'VariableDeclaration' && n.declarations.every((d) => d.id && want(d.id.name))) parts.push(src.slice(n.start, n.end));
    if (n.type === 'FunctionDeclaration' && (n.id.name === 'mahaImgHit' || n.id.name === 'mahaNeedsImage')) parts.push(src.slice(n.start, n.end));
  }
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(parts.join('\n') + '\nthis.mahaNeedsImage = mahaNeedsImage;', sb);
  return sb.mahaNeedsImage;
}

test('client-ux-3: «ممكن ترسم لي قطة» و«تقدر تسوي لي صورة قطة؟» وأخواتها طلب صورة — والنفي و«كيف» وسؤال القدرة ليست طلبًا', () => {
  const needs = mahaImageFn();
  const IS = ['ممكن ترسم لي قطة', 'تقدرين ترسمين لي بيت؟', 'تقدر تسوي لي صورة قطة؟', 'ممكن تسوين لي صورة بحر', 'تصمم لي شعار لمطعمي؟', 'نبي صورة لقطة', 'ودي صورة لقطة',
    'تكفى ترسم لنا جمل', 'مها، ممكن ترسمها؟', 'لو سمحت تصممين لي لوجو', 'ارسم لي قطة', 'can you draw me a horse'];
  for (const s of IS) assert.equal(needs(s), true, 'كان ردًّا نصّيًّا: ' + s);
  const NOT = ['تقدر ترسم؟', 'كيف ترسم قطة؟', 'انت ترسم كويس', 'ما نبي صورة', 'ودي الصورة لأمي', 'حاب الصورة مرة', 'ما تسوي لي صورة', 'الرسمي', 'اشرح لي الموضوع بصورة مبسطة', 'متى تولد القطة'];
  for (const s of NOT) assert.equal(needs(s), false, 'ليس طلب صورة: ' + s);
});

// ───────────────────────── userdata-4 (الواجهة): خانة كلمة المرور عند طلبها ─────────────────────────

test('userdata-4 (الواجهة): «حسابي» يُظهر خانة كلمة المرور عند password_required ويرسلها مع المحاولة التالية — للبريد والهاتف', () => {
  const src = read('js/app-01-boot-auth.js');
  const i = src.indexOf('function acctPassBox(');
  assert.ok(i > 0, 'خانة كلمة المرور تُبنى عند الطلب');
  const box = src.slice(i, src.indexOf('\n  }\n', i));
  assert.match(box, /type = 'password'/);
  assert.match(box, /autocomplete', 'current-password'/);
  assert.match(box, /acctCurrentPasswordLabel/, 'بنصّ قائم بالـ١٤ لغة');
  const email = src.slice(src.indexOf('acctEmailSaveBtn.onclick'), src.indexOf('v-unverified-email (أمر المالك ١٨ أكتوبر'));
  assert.match(email, /password_required/);
  assert.match(email, /acctPassVal\('acctEmailPass'\) \? \{ password: acctPassVal\('acctEmailPass'\) \}/, 'الطلب يحمل الكلمة إن كُتبت');
  const phone = src.slice(src.indexOf('async function phoneFlow('), src.indexOf('acctEmailSaveBtn.onclick'));
  assert.match(phone, /body\.password = pw/);
  assert.match(phone, /e\.code === 'password_required'/);
  assert.match(phone, /acctDeleteWrongPass/);
});
