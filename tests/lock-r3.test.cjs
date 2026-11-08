// tests/lock-r3.test.cjs — v-r3: جولة المراجعة الثالثة لباب المال (موافقة المالك ٢٧ أكتوبر ٢٠٢٦: «صلح الخطير وابدا فيهم كلهم»).
// مراجعة عدائيّة لجولة v-lock-r2 وجدت ثماني مشكلات، لكلّ واحدة حالة تفشل على 36e1841b (والهجمات A1 · A1b · A2 · A3 · A4 · A5 من سكربت المراجع):
//   r3-1  supersedeSubs: الأعلى دفعة لشهر (لا اشتراك أعلى) ⇒ رجوع قبل حلقة الإلغاء، فيبقى اشتراكان أدنيان حيّان في الخانة (خصمان كلّ شهر).
//   r3-2  دفعة وسائط أدنى تحت أعلى سارية أُضيف رصيدها إلى الأعلى ⇒ استرداد الأعلى (dropPeriod) يمحوها والدفعة غير مستردّة.
//   r3-3  والإضافة تنتهي بنهاية الأعلى ⇒ تجديد Basic وبقي من Max ثلاثة أيّام = ثلاثة أيّام لا شهر.
//   r3-4  ردٌّ يتبع الشاهد إلى الاسم الجديد أثناء نقل العدّادات ⇒ النقل يكتب فوقه (٥٠٠ ← ٣٨٠).
//   r3-5  منحٌ بعد الشاهد يقفل الاسم الجديد (حرّ) ويجري مع النقل ⇒ نقاطه تُكتب فوقها (١٧٠ ← ٧٠)؛ والتغيير لا يمسك قفل الاسم الجديد.
//   r3-6  سجلّ مفقود يقينًا (قراءة صارمة بلا سجلّ) ⇒ BUSY للأبد بلا تنبيه ولا إلغاء اشتراك (كان المسار اليتيم قبل r2-1).
//   r3-7  حجز payorphan في PayPal غير صارم ⇒ ردّ لا يُقرأ = 200 بلا تنبيه (والتوأم في orphanPaid لـStripe).
//   r3-8  سحبٌ والحساب لا يُقرأ (عطل KV) ⇒ يُعلَّم «تمّ» بلا أثر ولا يُعاد.
// على المعالجات الحقيقيّة بـKV في الذاكرة وشبكة مزيّفة (Stripe وPayPal) — لا نداء حقيقيّ لأيّ مزوّد ولا مفتاح مدفوع.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { Readable } = require('node:stream');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'lock-r3-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_lock_r3_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_lock_r3';
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_SECRET = 'sec';
process.env.PAYPAL_MODE = 'sandbox';
delete process.env.PAYPAL_WEBHOOK_ID;

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV في الذاكرة على عقد kv.js الحقيقيّ: بلا strict يعود null/false عند ردّ لا يُقرأ، وstrict يرمي ──
// userReads: عطل Upstash على سجلّات الحسابات وحدها. userPut: كتابات السجلّ التالية تفشل قبل أن تصل.
// setNX: { re, mode } — SET NX التالي على مفتاح يطابق re: 'unreadable' كُتب وردّه لا يُقرأ.
// pipeLost: re — أوّل pipeline يمسّ مفتاحًا يطابقه يُنفَّذ ثمّ يرمي (ضاع الردّ بعد التنفيذ).
const store = new Map();
const ttl = new Map();
const fail = { userReads: false, userPut: 0, setNX: null, pipeLost: null };
const hooks = { get: null }; // تُنتظر قبل كلّ kvGetRaw — لفرض تداخل (r3-4 · r3-5)
const pipeSet = (op, k, a, rest) => {
  if (op === 'GET') return store.has(k) ? store.get(k) : null;
  if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
  if (op === 'DEL') { store.delete(k); ttl.delete(k); return 1; }
  if (op === 'EXPIRE') { ttl.set(k, Number(a)); return 1; }
  if (op === 'SET') { store.set(k, String(a)); if (rest[0] === 'EX') ttl.set(k, Number(rest[1])); return 'OK'; }
  return null;
};
const kvImpl = {
  kvGetJSON: async (k, o) => { if (fail.userReads && /^db\/users\//.test(k)) { if (o && o.strict) throw new Error('upstash timeout'); return null; } return (store.has(k) ? JSON.parse(store.get(k)) : null); },
  kvPutJSON: async (k, v) => { if (fail.userPut > 0 && /^db\/users\//.test(k)) { fail.userPut--; throw new Error('upstash write failed'); } store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { if (hooks.get) await hooks.get(k); return (store.has(k) ? String(store.get(k)) : null); },
  kvSetRaw: async (k, v, t) => { store.set(k, String(v)); if (t) ttl.set(k, Number(t)); },
  kvSetIfAbsent: async (k, v, t, o) => {
    if (fail.setNX && fail.setNX.re.test(k)) {
      const f = fail.setNX;
      fail.setNX = null;
      if (!store.has(k)) store.set(k, String(v));
      if (o && o.strict) throw new Error('Upstash error: unreadable reply');
      return false; // kv.js بلا strict: ردّ لا يُقرأ ⇒ ليس 'OK'
    }
    if (store.has(k)) return false; store.set(k, String(v)); return true;
  },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); ttl.delete(k); },
  kvExpire: async (k, s) => { ttl.set(k, Number(s)); },
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => {
    const out = cmds.map(([op, k, a, ...rest]) => pipeSet(op, k, a, rest));
    if (fail.pipeLost && cmds.some((c) => fail.pipeLost.test(String(c[1])))) { fail.pipeLost = null; throw new Error('ETIMEDOUT after pipeline'); }
    return out;
  },
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
      return reply(200, structuredClone(s));
    }
    if ((m = p.match(/^payment_intents\/(.+)$/))) return net.pis[m[1]] ? reply(200, net.pis[m[1]]) : reply(404, { error: { message: 'No such payment_intent' } });
    if ((m = p.match(/^checkout\/sessions\/(.+)$/))) return net.sessions[m[1]] ? reply(200, net.sessions[m[1]]) : reply(404, { error: { message: 'No such session' } });
    return reply(404, { error: { message: 'unknown' } });
  }
  if (/paypal\.com$/.test(u.hostname)) {
    if (u.pathname === '/v1/oauth2/token') return reply(200, { access_token: 'A' });
    const m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
    if (m) { const o = net.orders[decodeURIComponent(m[1])]; return o ? reply(200, o) : reply(404, { message: 'not found' }); }
    return reply(404, { message: 'unknown' });
  }
  return reply(404, {}); // غير ذلك: لا يُرسل شيء
};

const auth = require(rp('api/_lib/auth.js'));
const paypal = require(rp('api/_lib/paypal-order.js'));
const webhook = require(rp('api/webhook.js'));
const tier = require(rp('api/_lib/tier.js'));
const media = require(rp('api/_lib/_mediaPlans.js'));
const points = require(rp('api/_lib/points.js'));

const DAY = 86400000;
const nowSec = () => Math.floor(Date.now() / 1000);
const mkRes = () => ({ code: 200, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { if (b !== undefined) this.body = b; return this; }, writeHead(c) { this.code = c; } });
async function call(handler, req) { const res = mkRes(); await handler(Object.assign({ method: 'POST', headers: {}, query: {} }, req), res); return res; }
const tok = (u) => auth.makeToken(u);
async function fresh(u, rec) { await auth.putUser(u, Object.assign({ username: u, points: 70, createdAt: Date.now() - 90 * DAY }, rec || {})); store.set('points:' + u, String((rec && rec.points) || 70)); }
const user = (u) => auth.getUser(u);
const pts = (u) => Number(store.get('points:' + u));
let subSeq = 0;
const sub = (id, username, plan, status) => { net.subs[id] = { id, object: 'subscription', status, created: nowSec() - 100000 + (++subSeq), cancel_at_period_end: false, metadata: { username, plan }, items: { data: [{ current_period_end: nowSec() + 20 * 86400 }] } }; return net.subs[id]; };
let evSeq = 0;
const evt = (type, object) => ({ id: 'evt_r3_' + (++evSeq), type, data: { object } });
const paidSession = (id, username, plan, amount, extra) => evt('checkout.session.completed', Object.assign({ id, object: 'checkout.session', payment_status: 'paid', mode: 'payment', payment_intent: 'pi_' + id, amount_total: amount, currency: 'usd', created: nowSec(), metadata: { username, plan } }, extra || {}));
const subSession = (id, username, plan, amount, subId) => paidSession(id, username, plan, amount, { mode: 'subscription', payment_intent: null, invoice: 'in_' + id, subscription: subId });
const renewal = (id, username, plan, amount, subId) => evt('invoice.paid', { id, object: 'invoice', billing_reason: 'subscription_cycle', subscription: subId, payment_intent: 'pi_' + id, amount_paid: amount, currency: 'usd', subscription_details: { metadata: { username, plan } } });
const walletPi = (id, username, plan, amount) => evt('payment_intent.succeeded', { id, object: 'payment_intent', status: 'succeeded', amount, amount_received: amount, currency: 'usd', latest_charge: 'ch_' + id, metadata: { username, plan } });
const refundOf = (sessionId, amount, refunded) => evt('charge.refunded', { id: 'ch_' + sessionId, object: 'charge', payment_intent: 'pi_' + sessionId, amount, amount_refunded: refunded, refunded: refunded >= amount, currency: 'usd' });
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
const orphanAlerts = (who) => alerts.filter((a) => /محذوف/.test(String(a.title)) && String(a.body).startsWith(who + ' '));
function ppOrder(id, cap, ref, plan, value) {
  store.set('ppo:' + id, ref);
  net.orders[id] = { id, status: 'COMPLETED', create_time: new Date().toISOString(), purchase_units: [{ reference_id: ref, custom_id: plan, payments: { captures: [{ id: cap, status: 'COMPLETED', custom_id: plan, amount: { value, currency_code: 'USD' } }] } }] };
}
const capEvent = (orderId, cap) => ({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: cap, supplementary_data: { related_ids: { order_id: orderId } } } });
const rename = (from, to, token) => call(auth, { body: { action: 'changeUsername', token: token || tok(from), newUsername: to } });
const mixLeftDays = (u) => (Number(u.media.mix.at) + 35 * DAY - Date.now()) / DAY;

// ───────────────────────── r3-1: لا اشتراكان حيّان في خانة واحدة ─────────────────────────

test('r3-1: A1 — Max دفعة لشهر + اشتراك Basic أقدم + جلسة Pro قديمة ⇒ اشتراك حيّ واحد في خانة المحادثة (كان Basic وPro معًا)', async () => {
  await fresh('atk1', { plan: 'max', planUpdatedAt: Date.now() - 2 * DAY, planPayId: 'pi_atk1_max' });
  sub('sub_atk1_basic', 'atk1', 'basic', 'active');
  sub('sub_atk1_pro', 'atk1', 'pro', 'active');
  const ev = subSession('cs_atk1_pro', 'atk1', 'pro', 2000, 'sub_atk1_pro');
  const r = await hook(ev);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const live = ['sub_atk1_basic', 'sub_atk1_pro'].filter((id) => net.subs[id].status === 'active');
  assert.deepEqual(live, ['sub_atk1_pro'], 'الأقدم يُلغى والأحدث يبقى يتجدّد بعد الأعلى');
  assert.equal(tier.chatPeriod(await user('atk1')).plan, 'max', 'الأعلى المدفوعة باقية');
  assert.equal((await hook(ev)).code, 200, 'إعادة الحدث');
  assert.equal(net.subs.sub_atk1_pro.status, 'active');
});

test('r3-1: A1b — media_max دفعة لشهر + اشتراك media_basic أقدم + جلسة media_pro قديمة ⇒ اشتراك حيّ واحد في خانة الوسائط', async () => {
  await fresh('atk1b', {});
  assert.equal((await hook(paidSession('cs_atk1b_mm', 'atk1b', 'media_max', 10211))).code, 200);
  store.set('media:mix:atk1b', '8000');
  sub('sub_atk1b_mb', 'atk1b', 'media_basic', 'active');
  sub('sub_atk1b_mp', 'atk1b', 'media_pro', 'active');
  const r = await hook(subSession('cs_atk1b_mp', 'atk1b', 'media_pro', 2042, 'sub_atk1b_mp'));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const live = ['sub_atk1b_mb', 'sub_atk1b_mp'].filter((id) => net.subs[id].status === 'active');
  assert.deepEqual(live, ['sub_atk1b_mp']);
  assert.equal((await user('atk1b')).media.mix.plan, 'media_max');
});

test('r3-1: الأعلى اشتراكًا حيًّا لا يُلغى أبدًا، ويُلغى معه كلّ أدنى زائد في خانته (الجديد والأقدم)', async () => {
  await fresh('hsub1', { plan: 'max', planUpdatedAt: Date.now() - 2 * DAY, planPayId: 'cs_hsub1_max' });
  sub('sub_hsub1_max', 'hsub1', 'max', 'active');
  sub('sub_hsub1_basic', 'hsub1', 'basic', 'active');
  sub('sub_hsub1_pro', 'hsub1', 'pro', 'active');
  assert.equal((await hook(subSession('cs_hsub1_pro', 'hsub1', 'pro', 2000, 'sub_hsub1_pro'))).code, 200);
  assert.equal(net.subs.sub_hsub1_max.status, 'active', 'الأعلى يبقى');
  assert.equal(net.subs.sub_hsub1_pro.status, 'canceled', 'الأدنى الجديد زائد');
  assert.equal(net.subs.sub_hsub1_basic.status, 'canceled', 'كان يبقى: Max وBasic خصمان كلّ شهر');
  const u = await user('hsub1');
  assert.ok(u.planNext.some((x) => x.plan === 'pro' && x.payId === 'cs_hsub1_pro'), 'فترة Pro المدفوعة محفوظة');
});

// ───────────────────────── r3-2: الأدنى المؤجَّل لا يُمحى باسترداد الأعلى ─────────────────────────

async function maxThenBasic(u, left) {
  await fresh(u, {});
  assert.equal((await hook(paidSession('cs_' + u + '_mm', u, 'media_max', 10211))).code, 200);
  store.set('media:mix:' + u, String(left));
  assert.equal((await hook(paidSession('cs_' + u + '_mb', u, 'media_basic', 1021))).code, 200);
}

test('r3-2: A2 — media_max ثمّ media_basic ثمّ استرداد media_max كاملًا ⇒ media_basic المدفوعة تسري برصيدها ونافذتها كاملين (كانت تُمحى)', async () => {
  await maxThenBasic('atk2', 9000);
  let u = await user('atk2');
  assert.equal(u.media.mix.plan, 'media_max', 'الأعلى السارية لا تُمسّ');
  const r = await hook(refundOf('cs_atk2_mm', 10211, 10211));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  u = await user('atk2');
  assert.ok(u.media && u.media.mix, 'كان media={} والدفعة غير مستردّة');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(u.media.mix.payId, 'cs_atk2_mb');
  assert.equal(store.get('media:mix:atk2'), '1250', 'رصيدها كاملًا');
  assert.ok(mixLeftDays(u) > 34.9, 'نافذتها كاملة من لحظة سريانها');
  assert.equal(u.mediaNext, undefined);
});

test('r3-2: والاعتراض البنكيّ على الأعلى كذلك', async () => {
  await maxThenBasic('dsp2', 4000);
  const r = await hook(evt('charge.dispute.created', { id: 'dp_dsp2', object: 'dispute', charge: 'ch_cs_dsp2_mm', payment_intent: 'pi_cs_dsp2_mm', amount: 10211, currency: 'usd', reason: 'fraudulent' }));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const u = await user('dsp2');
  assert.equal(u.media && u.media.mix && u.media.mix.plan, 'media_basic');
  assert.equal(store.get('media:mix:dsp2'), '1250');
});

test('r3-2: استرداد الأدنى المؤجَّل كاملًا يُخرجه وحده — الأعلى ورصيدها لا تُمسّ، ولا يسري بعدها', async () => {
  await maxThenBasic('rfd2', 6000);
  assert.equal((await hook(refundOf('cs_rfd2_mb', 1021, 1021))).code, 200);
  let u = await user('rfd2');
  assert.equal(u.media.mix.plan, 'media_max');
  assert.equal(store.get('media:mix:rfd2'), '6000', 'لا يُؤخذ من رصيد الأعلى');
  assert.equal(u.mediaNext, undefined, 'المؤجَّلة المستردّة خرجت');
  u.media.mix.at = Date.now() - 36 * DAY; // انتهت الأعلى
  await auth.putUser('rfd2', u);
  await media.mediaStatus('rfd2');
  u = await user('rfd2');
  assert.notEqual(u.media.mix.plan, 'media_basic', 'لا تسري دفعة مستردّة');
});

test('r3-2: استرداد نصف المؤجَّلة ⇒ تسري بنصف رصيدها، والإعادة وحدث ثانٍ بالمبلغ نفسه لا يأخذان ثانيةً', async () => {
  await maxThenBasic('half2', 6000);
  const ev = refundOf('cs_half2_mb', 1021, 511);
  assert.equal((await hook(ev)).code, 200);
  assert.equal((await hook(ev)).code, 200, 'إعادة الحدث');
  assert.equal((await hook(refundOf('cs_half2_mb', 1021, 511))).code, 200, 'حدث آخر بالمبلغ التراكميّ نفسه');
  assert.equal(store.get('media:mix:half2'), '6000');
  let u = await user('half2');
  u.media.mix.at = Date.now() - 36 * DAY;
  await auth.putUser('half2', u);
  const st = await media.mediaStatus('half2');
  u = await user('half2');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(st.mix && st.mix.left, 1250 - Math.round(1250 * (511 / 1021)), JSON.stringify(st));
});

// ───────────────────────── r3-3: نافذة الأدنى المدفوعة كاملة ─────────────────────────

test('r3-3: A3 — تجديد media_basic وبقي من media_max ثلاثة أيّام ⇒ الأعلى برصيدها حتّى نهايتها، ثمّ media_basic بنافذة ٣٥ يومًا ورصيدها كاملًا (كانت ٣ أيّام)', async () => {
  await fresh('atk3', {});
  assert.equal((await hook(paidSession('cs_atk3_mm', 'atk3', 'media_max', 10211))).code, 200);
  const u0 = await user('atk3');
  u0.media.mix.at = Date.now() - 32 * DAY; // تنتهي بعد ٣ أيّام (نافذة ٣٥)
  await auth.putUser('atk3', u0);
  store.set('media:mix:atk3', '500');
  sub('sub_atk3_mb', 'atk3', 'media_basic', 'active');
  const r = await hook(renewal('in_atk3_mb', 'atk3', 'media_basic', 1021, 'sub_atk3_mb'));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  let u = await user('atk3');
  assert.equal(u.media.mix.plan, 'media_max');
  assert.equal(u.media.mix.at, u0.media.mix.at);
  assert.equal(store.get('media:mix:atk3'), '500', 'كان ١٧٥٠ ينتهي بعد ثلاثة أيّام مع الأعلى');
  assert.ok(Array.isArray(u.mediaNext) && u.mediaNext.length === 1, JSON.stringify(u.mediaNext));
  assert.equal(u.mediaNext[0].plan, 'media_basic');
  assert.equal(u.mediaNext[0].budget, 1250);
  assert.equal(u.mediaNext[0].payId, 'in_atk3_mb');
  // انتهت نافذة الأعلى: أوّل صرف يُسري المؤجَّلة ويصرف منها
  u.media.mix.at = Date.now() - 36 * DAY;
  await auth.putUser('atk3', u);
  const s = await media.trySpendMedia('atk3', 5, 'image_normal');
  assert.ok(s && s.pool === 'mix', JSON.stringify(s));
  u = await user('atk3');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(u.media.mix.payId, 'in_atk3_mb');
  assert.ok(mixLeftDays(u) > 34.9, 'نافذة كاملة: ' + mixLeftDays(u).toFixed(2));
  assert.equal(store.get('media:mix:atk3'), String(1250 - 25));
  assert.equal(u.mediaNext, undefined);
  assert.equal(net.subs.sub_atk3_mb.status, 'active', 'لا اشتراك أعلى: الأدنى يبقى يتجدّد');
});

test('r3-3: نفد رصيد الأعلى قبل نهاية نافذتها ⇒ المؤجَّلة تسري عند أوّل قراءة (لا انتظار شهر برصيد فارغ)', async () => {
  await maxThenBasic('empt3', 300);
  store.set('media:mix:empt3', '0');
  const st = await media.mediaStatus('empt3');
  const u = await user('empt3');
  assert.equal(u.media.mix.plan, 'media_basic', JSON.stringify(u.media));
  assert.equal(st.mix && st.mix.left, 1250);
});

test('r3-3: بلا أعلى سارية لا تأجيل — المنح كما كان (ثابت)', async () => {
  await fresh('noh3', {});
  assert.equal((await hook(paidSession('cs_noh3_mb', 'noh3', 'media_basic', 1021))).code, 200);
  const u = await user('noh3');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(store.get('media:mix:noh3'), '1250');
  assert.equal(u.mediaNext, undefined);
});

test('r3-3: فشل كتابة السجلّ بعد التأجيل ⇒ علامة الإكمال، والإعادة تكتب المؤجَّلة مرّة واحدة (v-lock-credit)', async () => {
  await fresh('fin3', {});
  assert.equal((await hook(paidSession('cs_fin3_mm', 'fin3', 'media_max', 10211))).code, 200);
  store.set('media:mix:fin3', '6000');
  const ev = paidSession('cs_fin3_mb', 'fin3', 'media_basic', 1021);
  fail.userPut = 1;
  const r1 = await hook(ev);
  fail.userPut = 0;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal(store.has('paid-credit:lastStripeSessionId:cs_fin3_mb'), true, 'علامة الإكمال');
  assert.equal((await hook(ev)).code, 200);
  assert.equal((await hook(ev)).code, 200);
  const u = await user('fin3');
  assert.equal(u.media.mix.plan, 'media_max');
  assert.equal(store.get('media:mix:fin3'), '6000', 'لا إضافة ولا إعادة ملء');
  assert.equal(u.mediaNext.filter((x) => x.payId === 'cs_fin3_mb').length, 1, 'مرّة واحدة');
  assert.equal(store.has('paid-credit:lastStripeSessionId:cs_fin3_mb'), false);
  assert.equal(JSON.parse(store.get('payrec:cs_fin3_mb')).deferred, true);
});

// ───────────────────────── r3-4 · r3-5: تغيير الاسم والردّ والمنح المتزامنان ─────────────────────────

test('r3-4: A5 — ردّ بالاسم القديم بين الشاهد ونقل العدّاد ⇒ لا تضيع النقاط (كان ٣٨٠)', async () => {
  await fresh('atk5old', { points: 500 });
  const pay = await points.spendPoints('atk5old', 120, 'omni_video');
  assert.ok(pay.ok);
  let fired = false;
  hooks.get = async (k) => {
    if (fired || k !== 'points:atk5old') return;
    const old = await auth.getUser('atk5old', 1);
    if (!(old && old.deleted && old.movedTo)) return;
    fired = true;
    const h = hooks.get; hooks.get = null;
    await points.refundPoints('atk5old', 120, pay);
    hooks.get = h;
  };
  let rn;
  try { rn = await rename('atk5old', 'atk5new'); } finally { hooks.get = null; }
  assert.equal(rn.code, 200, JSON.stringify(rn.body));
  assert.ok(fired, 'الردّ وقع داخل النقل');
  assert.equal(pts('atk5new'), 500, 'refund lost');
  assert.equal(store.has('points:atk5old'), false);
});

test('r3-5: A4 — منح يصل بعد الشاهد وقبل نقل العدّاد ⇒ ينتظر قفل الاسم الجديد ونقاطه لا تُكتب فوقها (كان ٧٠)', async () => {
  await fresh('atk4old', {});
  let p = null, done = false, fired = false;
  hooks.get = async (k) => {
    if (fired || k !== 'points:atk4old') return;
    const old = await auth.getUser('atk4old', 1);
    if (!(old && old.deleted && old.movedTo)) return;
    fired = true;
    const h = hooks.get; hooks.get = null;
    p = hook(paidSession('cs_atk4_pack', 'atk4old', 'pack100', 499)).then((x) => { done = true; return x; });
    const until = Date.now() + 1500;
    while (!done && Date.now() < until) await new Promise((r) => setTimeout(r, 5));
    hooks.get = h;
  };
  let rn;
  try { rn = await rename('atk4old', 'atk4new'); } finally { hooks.get = null; }
  assert.equal(rn.code, 200, JSON.stringify(rn.body));
  assert.ok(fired, 'المنح بدأ داخل النقل');
  const g = await p;
  assert.equal(g.code, 200, JSON.stringify(g.body));
  assert.equal(pts('atk4new'), 70 + 100, 'pack points lost to counter overwrite');
  assert.equal((await user('atk4new')).points, 70 + 100, 'المرآة والعدّاد سواء');
});

test('r3-4: النقل يُعاد بأمان — ردّ النقل الضائع بعد تنفيذه لا يجمع مرّتين (علامة التغيير)', async () => {
  const at = Date.now() - 2 * DAY;
  await fresh('idemold', { points: 300, media: { mix: { plan: 'media_pro', at, payId: 'cs_idem' } } });
  store.set('media:mix:idemold', '2000');
  fail.pipeLost = /^points:idemnew$/;
  let rn;
  try { rn = await rename('idemold', 'idemnew'); } finally { fail.pipeLost = null; }
  assert.equal(rn.code, 200, JSON.stringify(rn.body));
  assert.equal(pts('idemnew'), 300, 'لا ٦٠٠');
  assert.equal(store.get('media:mix:idemnew'), '2000');
  assert.equal(store.has('points:idemold'), false);
  assert.equal(store.has('media:mix:idemold'), false);
});

test('r3-5: قفل الاسم الجديد ممسوك ⇒ ٤٢٩ القائم بعد انتظار محدود ولا شيء يُكتب (التغيير يمسك قفل الجديد)', async () => {
  await fresh('lkold', { points: 250 });
  store.set('db/acct-lock/lknew', '1'); // منحٌ أو سحبٌ على الاسم الجديد
  const t0 = Date.now();
  const rn = await rename('lkold', 'lknew');
  assert.equal(rn.code, 429, JSON.stringify(rn.body));
  assert.equal(rn.body.code, 'too_many');
  assert.ok(Date.now() - t0 < 15000);
  const old = await user('lkold');
  assert.ok(old && !old.deleted, 'القديم حيّ كما كان');
  assert.equal(await auth.getUser('lknew', 1), null, 'لا سجلّ جديد');
  assert.equal(pts('lkold'), 250);
  store.delete('db/acct-lock/lknew');
  assert.equal((await rename('lkold', 'lknew')).code, 200, 'بعد فكّ القفل');
  assert.equal(pts('lknew'), 250);
});

test('r3-5: الرجوع إلى اسمك السابق (شاهده يقود إليك) يعمل بقفل الاسم كما هو، والرصيد سليم (ثابت)', async () => {
  await fresh('backa', { points: 90 });
  const r1 = await rename('backa', 'backb');
  assert.equal(r1.code, 200, JSON.stringify(r1.body));
  const r2 = await rename('backb', 'backa', r1.body.token);
  assert.equal(r2.code, 200, JSON.stringify(r2.body));
  assert.equal(pts('backa'), 90);
  assert.equal(store.has('points:backb'), false);
});

// ───────────────────────── r3-6: المفقود يقينًا إلى المسار اليتيم ─────────────────────────

test('r3-6: جلسة اشتراك لاسم لا سجلّ له (قراءة صارمة نجحت) ⇒ تنبيه المالك مرّة وإلغاء الاشتراك و200 (كان BUSY للأبد)', async () => {
  sub('sub_ghost6', 'ghost6', 'pro', 'active');
  const ev = subSession('cs_ghost6', 'ghost6', 'pro', 2000, 'sub_ghost6');
  const r = await hook(ev);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(orphanAlerts('ghost6').length, 1);
  assert.match(orphanAlerts('ghost6')[0].body, /20\.00 USD/);
  assert.equal(net.subs.sub_ghost6.status, 'canceled', 'لا خصم يتكرّر لحساب غير موجود');
  assert.equal((await hook(ev)).code, 200, 'الإعادة');
  assert.equal(orphanAlerts('ghost6').length, 1, 'تنبيه واحد');
  assert.equal(store.has('points:ghost6'), false);
});

test('r3-6: تجديد لشاهد اسمٍ يقود إلى سجلّ مُحي ⇒ المسار اليتيم كذلك', async () => {
  await auth.putUser('purged6a', { deleted: true, movedTo: 'purged6b' }); // purged6b مُحي (لا سجلّ)
  sub('sub_purged6', 'purged6a', 'basic', 'active');
  const r = await hook(renewal('in_purged6', 'purged6a', 'basic', 1000, 'sub_purged6'));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(orphanAlerts('purged6a').length, 1);
  assert.equal(net.subs.sub_purged6.status, 'canceled');
});

test('r3-6: وعطل القراءة ما زال يُعاد — لا تنبيه ولا إلغاء (لا عودة لـr2-1)', async () => {
  await fresh('outage6', { plan: 'pro', planUpdatedAt: Date.now() - 31 * DAY, planPayId: 'cs_outage6_0' });
  sub('sub_outage6', 'outage6', 'pro', 'active');
  const ev = renewal('in_outage6', 'outage6', 'pro', 2000, 'sub_outage6');
  const r = await duringOutage(() => hook(ev));
  assert.ok(r.code >= 500, String(r.code));
  assert.equal(orphanAlerts('outage6').length, 0);
  assert.equal(net.subs.sub_outage6.status, 'active');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(pts('outage6'), 70 + 920);
});

test('r3-6: اكتمال التقاط PayPal لاسم لا سجلّ له ⇒ تنبيه المالك مرّة (account)', async () => {
  ppOrder('ORD-GH6', 'CAP-GH6', 'ghostpp6', 'pro', '20.00');
  const r = await paypal.captureCompleted(capEvent('ORD-GH6', 'CAP-GH6'));
  assert.equal(r.status, 'account', JSON.stringify(r));
  assert.equal(orphanAlerts('ghostpp6').length, 1);
  assert.equal((await paypal.captureCompleted(capEvent('ORD-GH6', 'CAP-GH6'))).status, 'account');
  assert.equal(orphanAlerts('ghostpp6').length, 1);
});

// ───────────────────────── r3-7: حجز التنبيه صارم ─────────────────────────

test('r3-7: PayPal — ردّ حجز payorphan لا يُقرأ ⇒ رمي (500 فيعيد PayPal) لا 200 بلا تنبيه، والإعادة تنبّه مرّة', async () => {
  await auth.putUser('gonepp7', { deleted: true, deletedAt: Date.now() });
  ppOrder('ORD-R7', 'CAP-R7', 'gonepp7', 'max', '100.00');
  fail.setNX = { re: /^payorphan:ORD-R7$/ };
  let first = null;
  try { first = await paypal.captureCompleted(capEvent('ORD-R7', 'CAP-R7')); } catch (e) { first = { threw: e.message }; } finally { fail.setNX = null; }
  assert.ok(first && first.threw, 'كان ' + JSON.stringify(first) + ' بلا تنبيه — PayPal يتوقّف');
  assert.equal(orphanAlerts('gonepp7').length, 0);
  const r = await paypal.captureCompleted(capEvent('ORD-R7', 'CAP-R7'));
  assert.equal(r.status, 'account');
  assert.equal(orphanAlerts('gonepp7').length, 1, 'الحجز كُتب وضاع ردّه — الإعادة تجده «pending» فتنبّه');
  await paypal.captureCompleted(capEvent('ORD-R7', 'CAP-R7'));
  assert.equal(orphanAlerts('gonepp7').length, 1, 'ثمّ لا تكرار');
});

test('r3-7: والتوأم في Stripe (orphanPaid) — دفعة محفظة لحساب محذوف وحجزها لا يُقرأ ⇒ 500 ثمّ تنبيه واحد', async () => {
  await auth.putUser('gonest7', { deleted: true, deletedAt: Date.now() });
  const ev = walletPi('pi_gonest7', 'gonest7', 'pro', 2000);
  fail.setNX = { re: /^payorphan:pi_gonest7$/ };
  let r1;
  try { r1 = await hook(ev); } finally { fail.setNX = null; }
  assert.ok(r1.code >= 500, 'كان ' + r1.code + ' بلا تنبيه');
  assert.equal((await hook(ev)).code, 200);
  assert.equal((await hook(ev)).code, 200);
  assert.equal(orphanAlerts('gonest7').length, 1);
});

// ───────────────────────── r3-8: سحبٌ في عطل القراءة يُعاد ─────────────────────────

test('r3-8: استرداد والحساب لا يُقرأ (عطل KV) ⇒ non-2xx بلا أثر ولا علامة «تمّ»، والإعادة بعد التعافي تسحب مرّة واحدة', async () => {
  await fresh('rfo8', {});
  assert.equal((await hook(paidSession('cs_rfo8', 'rfo8', 'pack300', 1299))).code, 200);
  assert.equal(pts('rfo8'), 370);
  const ev = refundOf('cs_rfo8', 1299, 1299);
  const r1 = await duringOutage(() => hook(ev));
  assert.ok(r1.code >= 500, 'كان ' + r1.code + ' والحدث معلَّم «تمّ» بلا أثر');
  assert.equal(pts('rfo8'), 370);
  assert.equal(JSON.parse(store.get('payrec:cs_rfo8')).revoked, undefined, 'العلامة فُكّت');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(pts('rfo8'), 70, 'سُحبت نقاط الرزمة مرّة');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(pts('rfo8'), 70, 'ولا مرّة ثانية');
});

test('r3-8: حساب مفقود يقينًا لا شيء يُسحب منه — 200 كما كان (ثابت)', async () => {
  await fresh('lost8', {});
  assert.equal((await hook(paidSession('cs_lost8', 'lost8', 'pack100', 499))).code, 200);
  store.delete('db/users/lost8.json');
  assert.equal((await hook(refundOf('cs_lost8', 499, 499))).code, 200);
});
