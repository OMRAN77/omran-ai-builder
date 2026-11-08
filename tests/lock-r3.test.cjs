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
// userPutLost (r3-rv5): كتابات السجلّ التالية تصل ثمّ يضيع ردّها. strictGet (r3-rv5): re — أوّل قراءة لمفتاح يطابقه تتعطّل (الصارمة ترمي).
const store = new Map();
const ttl = new Map();
const fail = { userReads: false, userPut: 0, userPutLost: 0, setNX: null, pipeLost: null, strictGet: null };
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
  kvPutJSON: async (k, v) => { if (fail.userPut > 0 && /^db\/users\//.test(k)) { fail.userPut--; throw new Error('upstash write failed'); } store.set(k, JSON.stringify(v)); if (fail.userPutLost > 0 && /^db\/users\//.test(k)) { fail.userPutLost--; throw new Error('ETIMEDOUT after write'); } },
  kvGetRaw: async (k, o) => { if (hooks.get) await hooks.get(k); if (fail.strictGet && fail.strictGet.test(k)) { fail.strictGet = null; if (o && o.strict) throw new Error('upstash timeout'); return null; } return (store.has(k) ? String(store.get(k)) : null); },
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

// ───────────────────────── r3-rv: المراجعة العدائيّة لجولة r3 — رصيدٌ يُكتب قبل السجلّ يُملأ مرّة واحدة ─────────────────────────
// سريان المؤجَّلة (activateDue) وعودة الفترة السابقة باسترداد (dropPeriod) يكتبان الرصيد ثمّ سجلّ الحساب؛ فشلُ السجلّ يترك الحالة القديمة
// فكانت الإعادة (القراءة التالية، أو إعادة حدث السحب، أو إكمال المنح) تملأ ثانيةً: دفعة media_basic واحدة = ٢٥٠٠ فلس.
const mix = (u) => Number(store.get('media:mix:' + u) || 0);
async function spendAll(u) { let n = 0; for (;;) { const s = await media.trySpendMedia(u, 5, 'image_normal'); if (!s) break; n += s.fils; } return n; }

test('r3-rv1: سريان المؤجَّلة ثمّ فشل كتابة السجلّ (settleNext) ⇒ رصيد media_basic مرّة واحدة، والقراءة التالية تكمل السجلّ بلا ملء (كان ٢٥٠٠ من دفعة واحدة)', async () => {
  await maxThenBasic('rv1', 300);
  store.set('media:mix:rv1', '0'); // نفد رصيد الأعلى ⇒ حلّ وقت المؤجَّلة
  fail.userPut = 1;
  const first = await media.trySpendMedia('rv1', 5, 'image_normal');
  fail.userPut = 0;
  assert.equal((await user('rv1')).media.mix.plan, 'media_max', 'كتابة السجلّ فشلت');
  const st = await media.mediaStatus('rv1');
  let u = await user('rv1');
  assert.equal(u.media.mix.plan, 'media_basic', 'القراءة التالية تكمل السريان (كانت الأعلى حتّى ينفد الرصيد)');
  assert.equal(u.media.mix.payId, 'cs_rv1_mb');
  assert.equal(u.mediaNext, undefined);
  assert.equal(st.mix.left, 1250 - (first ? first.fils : 0), 'لا ملء ثانٍ');
  let total = (first ? first.fils : 0) + await spendAll('rv1');
  u = await user('rv1');
  u.media.mix.at = Date.now() - 36 * DAY; // انتهت media_basic
  await auth.putUser('rv1', u);
  total += await spendAll('rv1');
  assert.equal(total, 1250, 'دفعة media_basic واحدة أعطت ' + total);
});

test('r3-rv1: ردّ طلب السريان يضيع بعد تنفيذه ⇒ الرصيد مرّة واحدة (علامة السريان مع الرصيد في طلب واحد) (ثابت)', async () => {
  await maxThenBasic('rv1p', 300);
  store.set('media:mix:rv1p', '0');
  fail.pipeLost = /^media-on:/;
  const first = await media.trySpendMedia('rv1p', 5, 'image_normal');
  assert.equal(fail.pipeLost, null, 'ضاع ردّ طلب السريان بعد تنفيذه');
  assert.equal((await user('rv1p')).media.mix.plan, 'media_max', 'والسجلّ لم يُكتب');
  let total = (first ? first.fils : 0) + await spendAll('rv1p');
  const u = await user('rv1p');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(u.mediaNext, undefined);
  u.media.mix.at = Date.now() - 36 * DAY;
  await auth.putUser('rv1p', u);
  total += await spendAll('rv1p');
  assert.equal(total, 1250, 'دفعة media_basic واحدة أعطت ' + total);
});

test('r3-rv2: استرداد الأعلى يُسري المؤجَّلة ثمّ تفشل كتابة السجلّ (dropPeriod) ⇒ 500، والإعادة لا تملأ ثانيةً (كان ٢٥٠٠)', async () => {
  await maxThenBasic('rv2', 9000);
  const ev = refundOf('cs_rv2_mm', 10211, 10211);
  fail.userPut = 1;
  const r1 = await hook(ev);
  fail.userPut = 0;
  assert.ok(r1.code >= 500, String(r1.code));
  const s1 = await spendAll('rv2');
  assert.equal((await hook(ev)).code, 200);
  const s2 = await spendAll('rv2');
  const u = await user('rv2');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(u.media.mix.payId, 'cs_rv2_mb');
  assert.equal(s1 + s2, 1250, 'media_max مستردّة ودفعة media_basic واحدة أعطت ' + (s1 + s2));
});

test('r3-rv2: والإعادة قبل أيّ صرف ⇒ media_basic برصيدها كما مُلئ مرّة ونافذتها كاملة (ثابت)', async () => {
  await maxThenBasic('rv2b', 9000);
  const ev = refundOf('cs_rv2b_mm', 10211, 10211);
  fail.userPut = 1;
  assert.ok((await hook(ev)).code >= 500);
  fail.userPut = 0;
  assert.equal((await hook(ev)).code, 200);
  const u = await user('rv2b');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(mix('rv2b'), 1250);
  assert.ok(mixLeftDays(u) > 34.9);
  assert.equal(await spendAll('rv2b'), 1250);
});

test('r3-rv3: منح مؤجَّلة وصلت كتابته وضاع ردّه، ثمّ سرت واستُهلكت وحلّ محلّها أعلى ⇒ إعادة الحدث لا تعيدها إلى الانتظار (كان ١٢٥٠ + ١٢٥٠)', async () => {
  await fresh('rv3', {});
  assert.equal((await hook(paidSession('cs_rv3_mm', 'rv3', 'media_max', 10211))).code, 200);
  store.set('media:mix:rv3', '6000');
  const ev = paidSession('cs_rv3_mb', 'rv3', 'media_basic', 1021);
  const origSet = store.set;
  let once = true;
  store.set = function (k, v) { origSet.call(store, k, v); if (once && k === 'db/users/rv3.json') { once = false; throw new Error('ETIMEDOUT after write'); } return store; };
  let r1;
  try { r1 = await hook(ev); } finally { store.set = origSet; }
  assert.ok(r1.code >= 500, String(r1.code));
  assert.ok(store.has('paid-credit:lastStripeSessionId:cs_rv3_mb'), 'علامة الإكمال');
  assert.equal((await hook(refundOf('cs_rv3_mm', 10211, 10211))).code, 200); // استرداد الأعلى ⇒ تسري media_basic
  let u = await user('rv3');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(await spendAll('rv3'), 1250);
  assert.equal((await hook(paidSession('cs_rv3_mp', 'rv3', 'media_pro', 2042))).code, 200); // ترقية
  assert.equal((await hook(ev)).code, 200); // إعادة Stripe لحدث media_basic
  u = await user('rv3');
  assert.equal(u.media.mix.plan, 'media_pro', 'الأحدث لا تُمسّ');
  assert.equal((u.mediaNext || []).filter((x) => x.payId === 'cs_rv3_mb').length, 0, 'لا تعود إلى الانتظار: ' + JSON.stringify(u.mediaNext));
  assert.equal(store.has('paid-credit:lastStripeSessionId:cs_rv3_mb'), false, 'اكتمل الإكمال');
  u.media.mix.at = Date.now() - 36 * DAY; // انتهت media_pro
  await auth.putUser('rv3', u);
  assert.equal(await spendAll('rv3'), 0, 'media_basic دُفعت مرّة واستُهلكت مرّة');
});

test('r3-rv4: استرداد ترقية يعيد رصيد الفترة السابقة ثمّ تفشل كتابة السجلّ ⇒ 500، والإعادة لا تعيد الرصيد ثانيةً (كان ٢٠٠٠ من ١٠٠٠)', async () => {
  await fresh('rv4', {});
  assert.equal((await hook(paidSession('cs_rv4_mb', 'rv4', 'media_basic', 1021))).code, 200);
  store.set('media:mix:rv4', '1000');
  assert.equal((await hook(paidSession('cs_rv4_mm', 'rv4', 'media_max', 10211))).code, 200); // ترقية، السابقة media_basic بـ١٠٠٠
  const ev = refundOf('cs_rv4_mm', 10211, 10211);
  fail.userPut = 1;
  const r1 = await hook(ev);
  fail.userPut = 0;
  assert.ok(r1.code >= 500, String(r1.code));
  const s1 = await spendAll('rv4');
  assert.equal((await hook(ev)).code, 200);
  const s2 = await spendAll('rv4');
  const u = await user('rv4');
  assert.equal(u.media.mix.plan, 'media_basic', 'عادت الفترة السابقة');
  assert.equal(u.media.mix.payId, 'cs_rv4_mb');
  assert.equal(s1 + s2, 1000, 'ما بقي من media_basic (١٠٠٠) أعطى ' + (s1 + s2));
});

// ───────────── r3-rv2-*: المراجعة العدائيّة الثانية لـ547e2f68 — سريانٌ لم يصل سجلّه كان يُكمَل عند قراءة الوسائط التالية وحدها ─────────────
// بعد سريان مؤجَّلة (الرصيد + العلامة media-on) وفشل كتابة السجلّ: KV فيه رصيد media_basic والسجلّ ما زال media_max والمؤجَّلة في الانتظار.
// كلّ كاتب يأخذ قفل الحساب قبل القراءة التالية (منح، استرداد، تغيير اسم) كان يعمل على السجلّ القديم، والإكمال المتأخّر يكتب فوق فترة أحدث.
// الإصلاح (v-r3 r3-rv2-stale): withAccount يكمل ما سرى (علامته قائمة) مرّة واحدة قبل أيّ كاتب، بلا ملء ثانٍ (_mediaPlans completeActivated).
// x1: نفد رصيد media_max ⇒ أوّل صرف يُسري media_basic المؤجَّلة ثمّ تفشل كتابة السجلّ مرّة واحدة.
async function x1(u) {
  await maxThenBasic(u, 300);
  store.set('media:mix:' + u, '0');
  fail.userPut = 1;
  const s = await media.trySpendMedia(u, 5, 'image_normal');
  fail.userPut = 0;
  const v = await user(u);
  assert.equal(v.media.mix.plan, 'media_max', 'حالة x1: السجلّ لم يُكتب');
  assert.equal((v.mediaNext || []).length, 1);
  assert.ok(store.has('media-on:cs_' + u + '_mb'), 'علامة السريان');
  return s ? s.fils : 0;
}
// ضابط بلا عطل: السريان نفسه وكتابة السجلّ نجحت
async function x1ok(u) {
  await maxThenBasic(u, 300);
  store.set('media:mix:' + u, '0');
  const s = await media.trySpendMedia(u, 5, 'image_normal');
  assert.equal((await user(u)).media.mix.plan, 'media_basic');
  return s ? s.fils : 0;
}

test('r3-rv2-G0 (ضابط): بلا عطل — استرداد media_basic كاملًا بعد سريانها ⇒ لا يبقى شيء يُصرف', async () => {
  await x1ok('g0');
  assert.equal((await hook(refundOf('cs_g0_mb', 1021, 1021))).code, 200);
  assert.equal(await spendAll('g0'), 0);
});
test('r3-rv2-G: حالة x1 ثمّ استرداد media_basic كاملًا قبل أيّ قراءة ⇒ لا يبقى من رصيدها شيء (كان يُصرف كاملًا تحت media_max)', async () => {
  await x1('g1');
  assert.equal((await hook(refundOf('cs_g1_mb', 1021, 1021))).code, 200);
  const spent = await spendAll('g1');
  assert.equal(spent, 0, 'media_basic مستردّة كاملًا ومع ذلك صُرف منها ' + spent + ' فلسًا');
});
test('r3-rv2-G-half: حالة x1 ثمّ استرداد نصف media_basic قبل أيّ قراءة ⇒ ينقص رصيدها النصف (كان يبقى كاملًا)', async () => {
  const f = await x1('gh1');
  assert.equal((await hook(refundOf('cs_gh1_mb', 1021, 511))).code, 200);
  const spent = await spendAll('gh1');
  const want = 1250 - Math.round(1250 * 511 / 1021) - f;
  assert.ok(spent <= want, 'نصف media_basic مستردّ ومع ذلك صُرف ' + spent + ' (المستحقّ ' + want + ')');
});

test('r3-rv2-B0 (ضابط): بلا عطل — استرداد نصف media_max بعد سريان media_basic ⇒ رصيد media_basic لا يُمسّ', async () => {
  const f = await x1ok('b0');
  assert.equal((await hook(refundOf('cs_b0_mm', 10211, 5106))).code, 200);
  assert.equal(await spendAll('b0'), 1250 - f);
});
test('r3-rv2-B: حالة x1 ثمّ استرداد نصف media_max قبل أيّ قراءة ⇒ رصيد media_basic غير المستردّة لا يُمسّ (كان يُؤخذ كلّه)', async () => {
  const f = await x1('b1');
  assert.equal((await hook(refundOf('cs_b1_mm', 10211, 5106))).code, 200);
  const left = await spendAll('b1');
  assert.equal(left, 1250 - f, 'media_basic غير مستردّة وبقي منها ' + left + ' من ' + (1250 - f));
});

test('r3-rv2-A0 (ضابط): بلا عطل — media_max جديدة بعد سريان media_basic ثمّ استردادها كاملًا ⇒ يعود ما بقي من media_basic وحده', async () => {
  const f = await x1ok('a0');
  assert.equal((await hook(paidSession('cs_a0_mm2', 'a0', 'media_max', 10211))).code, 200);
  await media.mediaStatus('a0');
  assert.equal((await user('a0')).media.mix.payId, 'cs_a0_mm2');
  assert.equal((await hook(refundOf('cs_a0_mm2', 10211, 10211))).code, 200);
  assert.equal(await spendAll('a0'), 1250 - f);
});
test('r3-rv2-A: حالة x1 ثمّ media_max جديدة قبل أيّ قراءة ⇒ القراءة لا تكتب media_basic فوق فترتها، واستردادها كاملًا يسحبها (كان ١٢٥٠٠ تبقى)', async () => {
  const f = await x1('a1');
  assert.equal((await hook(paidSession('cs_a1_mm2', 'a1', 'media_max', 10211))).code, 200);
  await media.mediaStatus('a1'); // أيّ قراءة وسائط
  const u = await user('a1');
  assert.equal(u.media.mix.payId, 'cs_a1_mm2', 'الفترة بعد القراءة ' + JSON.stringify(u.media.mix));
  assert.equal(u.mediaNext, undefined);
  assert.equal((await hook(refundOf('cs_a1_mm2', 10211, 10211))).code, 200);
  const spent = await spendAll('a1');
  assert.equal(spent, 1250 - f, 'media_max الثانية مستردّة كاملًا وصُرف بعدها ' + spent + ' (يعود ما بقي من media_basic وحده)');
});
test('r3-rv2-A-sub: media_max اشتراكًا + media_basic مؤجَّلة، حالة x1، ثمّ تجديد media_max قبل أيّ قراءة ⇒ استرداد التجديد كاملًا يسحبه', async () => {
  await fresh('as1', {});
  sub('sub_as1_mm', 'as1', 'media_max', 'active');
  assert.equal((await hook(subSession('cs_as1_mm', 'as1', 'media_max', 10211, 'sub_as1_mm'))).code, 200);
  store.set('media:mix:as1', '300');
  assert.equal((await hook(paidSession('cs_as1_mb', 'as1', 'media_basic', 1021))).code, 200);
  store.set('media:mix:as1', '0');
  fail.userPut = 1;
  const s = await media.trySpendMedia('as1', 5, 'image_normal');
  fail.userPut = 0;
  const f = s ? s.fils : 0;
  assert.equal((await user('as1')).media.mix.plan, 'media_max');
  assert.equal((await hook(renewal('in_as1_mm2', 'as1', 'media_max', 10211, 'sub_as1_mm'))).code, 200);
  await media.mediaStatus('as1');
  const u = await user('as1');
  assert.equal(u.media.mix.payId, 'in_as1_mm2', 'بعد القراءة ' + JSON.stringify(u.media.mix));
  assert.equal((await hook(refundOf('in_as1_mm2', 10211, 10211))).code, 200);
  const spent = await spendAll('as1');
  assert.ok(spent <= 1250 - f, 'التجديد مستردّ كاملًا وصُرف بعده ' + spent);
});
test('r3-rv2-A-x2: استرداد media_max يُسري media_basic وتفشل كتابة السجلّ (500)، ثمّ media_max جديدة قبل إعادة Stripe ⇒ استردادها كاملًا يسحبها', async () => {
  await maxThenBasic('ax2', 9000);
  const ev = refundOf('cs_ax2_mm', 10211, 10211);
  fail.userPut = 1;
  const r1 = await hook(ev);
  fail.userPut = 0;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal((await hook(paidSession('cs_ax2_mm2', 'ax2', 'media_max', 10211))).code, 200);
  assert.equal((await hook(ev)).code, 200); // إعادة Stripe لاسترداد الأولى
  await media.mediaStatus('ax2');
  const u = await user('ax2');
  assert.equal(u.media.mix.payId, 'cs_ax2_mm2', 'بعد القراءة ' + JSON.stringify(u.media.mix));
  assert.equal((await hook(refundOf('cs_ax2_mm2', 10211, 10211))).code, 200);
  const spent = await spendAll('ax2');
  assert.ok(spent <= 1250, 'media_max الثانية مستردّة كاملًا وصُرف بعدها ' + spent);
});
test('r3-rv2-A-x2r: كـA-x2 ويُقارَن ما يعود بعد استرداد media_max الثانية بضابط بلا عطل (١٢٥٠ — كان ١٢٥٠٠)', async () => {
  for (const [u, faulty] of [['ax2c', false], ['ax2f', true]]) {
    await maxThenBasic(u, 9000);
    const ev = refundOf('cs_' + u + '_mm', 10211, 10211);
    if (faulty) fail.userPut = 1;
    const r1 = await hook(ev);
    fail.userPut = 0;
    if (r1.code !== 200) assert.equal(faulty, true);
    assert.equal((await hook(paidSession('cs_' + u + '_mm2', u, 'media_max', 10211))).code, 200);
    if (r1.code !== 200) assert.equal((await hook(ev)).code, 200);
    assert.equal((await hook(refundOf('cs_' + u + '_mm2', 10211, 10211))).code, 200);
  }
  const c = await spendAll('ax2c');
  const f = await spendAll('ax2f');
  assert.equal(c, 1250);
  assert.equal(f, c, 'بلا عطل يعود ' + c + '، ومع عطل كتابة واحد ' + f);
});

test('r3-rv2-RN-exp: نافذة media_max انتهت ⇒ سريان media_basic ثمّ تفشل كتابة السجلّ، ثمّ تغيير الاسم قبل أيّ قراءة ⇒ رصيدها ينتقل إلى الاسم الجديد (كان يبقى تحت القديم)', async () => {
  await maxThenBasic('rx1', 300);
  const u0 = await user('rx1');
  u0.media.mix.at = Date.now() - 36 * DAY; // انتهت الأعلى ⇒ حلّ وقت المؤجَّلة
  await auth.putUser('rx1', u0);
  fail.userPut = 1;
  const s = await media.trySpendMedia('rx1', 5, 'image_normal');
  fail.userPut = 0;
  const f = s ? s.fils : 0;
  assert.equal((await user('rx1')).media.mix.plan, 'media_max', 'السجلّ لم يُكتب');
  const r = await rename('rx1', 'rx1new');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  let total = f + await spendAll('rx1new');
  const u = await user('rx1new');
  const label = JSON.stringify(u.media && u.media.mix);
  if (u.media && u.media.mix) { u.media.mix.at = Date.now() - 36 * DAY; await auth.putUser('rx1new', u); }
  total += await spendAll('rx1new');
  assert.equal(total, 1250, 'دفعة media_basic واحدة أعطت ' + total + ' (السجلّ ' + label + '، وتحت الاسم القديم ' + store.get('media:mix:rx1') + ')');
  assert.equal(store.has('media:mix:rx1'), false, 'لا شيء تحت الاسم القديم');
});

// الإكمال المركزيّ نفسه
test('r3-rv2-lock: حالة x1 ثمّ منح باقة محادثة (كاتب آخر تحت قفل الحساب) ⇒ يكمل سجلّ media_basic بلا ملء ثانٍ', async () => {
  const f = await x1('lk1');
  assert.equal(mix('lk1'), 1250 - f);
  assert.equal((await hook(paidSession('cs_lk1_basic', 'lk1', 'basic', 1000))).code, 200);
  const u = await user('lk1');
  assert.equal(u.plan, 'basic');
  assert.equal(u.media.mix.plan, 'media_basic', 'أكمله قفل الحساب لا القراءة التالية');
  assert.equal(u.media.mix.payId, 'cs_lk1_mb');
  assert.equal(u.media.mix.at, Number(store.get('media-on:cs_lk1_mb')), 'بوقت سريانه الأوّل');
  assert.equal(u.mediaNext, undefined);
  assert.equal(mix('lk1'), 1250 - f, 'لا ملء ثانٍ');
});
test('r3-rv2-lock: حالة x1 وفشل كتابة الإكمال تحت القفل ⇒ الاسترداد 500 بلا أثر، والإعادة تسحب media_basic مرّة', async () => {
  const f = await x1('lk2');
  const ev = refundOf('cs_lk2_mb', 1021, 1021);
  fail.userPut = 1;
  const r1 = await hook(ev);
  fail.userPut = 0;
  assert.ok(r1.code >= 500, String(r1.code));
  const v = await user('lk2');
  assert.equal(v.media.mix.plan, 'media_max', 'لا أثر');
  assert.equal((v.mediaNext || []).length, 1);
  assert.equal(mix('lk2'), 1250 - f, 'الرصيد لم يُمسّ');
  assert.equal(JSON.parse(store.get('payrec:cs_lk2_mb')).revoked, undefined, 'الحدث غير معلَّم «تمّ»');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(await spendAll('lk2'), 0);
});
test('r3-rv2-lock: حساب بلا مؤجَّلة ⇒ قفل الحساب لا يقرأ علامات السريان (لا كلفة على الكلّ) (ثابت)', async () => {
  await fresh('lk3', {});
  const seen = [];
  hooks.get = async (k) => { seen.push(k); };
  try { assert.equal((await hook(paidSession('cs_lk3_mm', 'lk3', 'media_max', 10211))).code, 200); } finally { hooks.get = null; }
  assert.equal(seen.filter((k) => /^media-on:/.test(k)).length, 0, JSON.stringify(seen));
});

// ثوابت يجب أن تصمد
test('r3-rv2: حالة x1 ثمّ تغيير الاسم ⇒ media_basic بالاسم الجديد بلا ملء والمجموع ١٢٥٠ (ثابت)', async () => {
  const f = await x1('rn1');
  const r = await rename('rn1', 'rn1new');
  assert.equal(r.code, 200, JSON.stringify(r.body));
  let total = f + await spendAll('rn1new');
  const u = await user('rn1new');
  assert.equal(u.media.mix.plan, 'media_basic');
  u.media.mix.at = Date.now() - 36 * DAY;
  await auth.putUser('rn1new', u);
  total += await spendAll('rn1new');
  assert.equal(total, 1250);
});
test('r3-rv2: خمس قراءات متزامنة عند حلول المؤجَّلة ⇒ تسري مرّة واحدة والمجموع ١٢٥٠ (ثابت)', async () => {
  await maxThenBasic('par1', 300);
  store.set('media:mix:par1', '0');
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => media.trySpendMedia('par1', 5, 'image_normal')));
  let total = rs.reduce((a, s) => a + (s ? s.fils : 0), 0) + await spendAll('par1');
  const u = await user('par1');
  assert.equal(u.media.mix.plan, 'media_basic');
  u.media.mix.at = Date.now() - 36 * DAY;
  await auth.putUser('par1', u);
  total += await spendAll('par1');
  assert.equal(total, 1250);
});
test('r3-rv2: استرداد الأعلى والأدنى المؤجَّل متزامنين ⇒ لا شيء يبقى (ثابت)', async () => {
  await maxThenBasic('cc1', 6000);
  const [r1, r2] = await Promise.all([hook(refundOf('cs_cc1_mm', 10211, 10211)), hook(refundOf('cs_cc1_mb', 1021, 1021))]);
  if (r1.code !== 200) assert.equal((await hook(refundOf('cs_cc1_mm', 10211, 10211))).code, 200);
  if (r2.code !== 200) assert.equal((await hook(refundOf('cs_cc1_mb', 1021, 1021))).code, 200);
  assert.equal(await spendAll('cc1'), 0);
  assert.equal((await user('cc1')).mediaNext, undefined);
});
test('r3-rv2: منح الأدنى واسترداد الأعلى متزامنين ⇒ الأدنى برصيده مرّة واحدة (ثابت)', async () => {
  await fresh('cc2', {});
  assert.equal((await hook(paidSession('cs_cc2_mm', 'cc2', 'media_max', 10211))).code, 200);
  store.set('media:mix:cc2', '6000');
  const evG = paidSession('cs_cc2_mb', 'cc2', 'media_basic', 1021);
  const evR = refundOf('cs_cc2_mm', 10211, 10211);
  const [g, r] = await Promise.all([hook(evG), hook(evR)]);
  if (g.code !== 200) assert.equal((await hook(evG)).code, 200);
  if (r.code !== 200) assert.equal((await hook(evR)).code, 200);
  let total = await spendAll('cc2');
  const u = await user('cc2');
  assert.equal(u.media.mix.plan, 'media_basic');
  u.media.mix.at = Date.now() - 36 * DAY;
  await auth.putUser('cc2', u);
  total += await spendAll('cc2');
  assert.equal(total, 1250);
});

// ───────────── r3-rv5-*: مراجعة lock-r3/money-c — توأم نصف الحالة في جهة السحب لم يشمله الإكمال المركزيّ ─────────────
// استرداد كامل للدفعة X (media_max فوق media_pro P) يعيد رصيد P بـfillOnce('media-back:X') ثمّ تفشل كتابة السجلّ: revoke يفكّ علامته ويردّ 500.
// حتّى إعادة Stripe يبقى السجلّ على X المستردّة ورصيد P في العدّاد، وcompleteActivated يكمل علامات 'media-on:' وحدها — فكلّ كاتب تحت قفل الحساب
// قبل الإعادة يعمل على X القديمة، والإعادة تجد علامة الإعادة فلا تملأ. R1b تراجعٌ عن 36e1841b (هناك كانت الإعادة تملأ ثانية).
// الإصلاح (v-r3 r4-back): withAccount يكمل السحب أيضًا قبل أيّ كاتب (pay-refund completeDropped) — فترةٌ لدفعتها علامة إعادة = سُحبت ولم يصل سجلّها.
async function proThenMax(u, proLeft) {
  await fresh(u, {});
  assert.equal((await hook(paidSession('cs_' + u + '_mp', u, 'media_pro', 2042))).code, 200);
  store.set('media:mix:' + u, String(proLeft));
  assert.equal((await hook(paidSession('cs_' + u + '_mm', u, 'media_max', 10211))).code, 200);
  assert.equal((await user(u)).media.mix.payId, 'cs_' + u + '_mm');
}
// نصف الحالة: الاسترداد الكامل لـmedia_max يعيد رصيد media_pro وتفشل كتابة السجلّ مرّة واحدة ⇒ 500
async function halfDropped(u, ev) {
  fail.userPut = 1;
  const r = await hook(ev);
  fail.userPut = 0;
  assert.ok(r.code >= 500, 'المحاولة الأولى تفشل: ' + r.code);
  const v = await user(u);
  assert.equal(v.media.mix.payId, 'cs_' + u + '_mm', 'نصف الحالة: السجلّ ما زال على media_max المستردّة');
  assert.equal(mix(u), 2000, 'ورصيد media_pro العائد في العدّاد');
  assert.ok(store.has('media-back:cs_' + u + '_mm'), 'وعلامة الإعادة قائمة');
  assert.equal(JSON.parse(store.get('payrec:cs_' + u + '_mm')).revoked, undefined, 'والحدث غير معلَّم «تمّ»');
}
// R1: يصرف رصيد media_pro العائد تحت media_max القديمة، ثمّ media_max جديدة قبل الإعادة، ثمّ استردادها كاملًا. faulty = نصف الحالة في الاسترداد الأوّل
async function rv5R1(u, faulty) {
  await proThenMax(u, 2000);
  const ev = refundOf('cs_' + u + '_mm', 10211, 10211);
  if (faulty) await halfDropped(u, ev); else assert.equal((await hook(ev)).code, 200);
  let total = await spendAll(u);
  assert.equal((await hook(paidSession('cs_' + u + '_mm2', u, 'media_max', 10211))).code, 200);
  if (faulty) assert.equal((await hook(ev)).code, 200); // إعادة Stripe للاسترداد الأوّل
  assert.equal((await hook(refundOf('cs_' + u + '_mm2', 10211, 10211))).code, 200);
  total += await spendAll(u);
  return total;
}
test('r3-rv5-R1: نصف حالة استرداد media_max، صرفُ ما عاد من media_pro، ثمّ media_max جديدة قبل الإعادة واستردادها كاملًا ⇒ ما بقي من media_pro مرّة واحدة (كان ٤٠٠٠ من ٢٠٠٠)', async () => {
  const c = await rv5R1('rv5r1c', false);
  const f = await rv5R1('rv5r1f', true);
  assert.equal(c, 2000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + ' فلسًا من media_pro؛ وفشل كتابة واحد أعطى ' + f);
  assert.equal(JSON.parse(store.get('payrec:cs_rv5r1f_mm2')).prev.payId, 'cs_rv5r1f_mp', 'سابقة media_max الجديدة media_pro لا المستردّة');
});
// R1b: الاسترداد الكامل يصل قبل النصف وتفشل كتابته، ثمّ يصل حدث النصف قبل الإعادة
async function rv5R1b(u, faulty) {
  await proThenMax(u, 2000);
  const eFull = refundOf('cs_' + u + '_mm', 10211, 10211);
  const eHalf = refundOf('cs_' + u + '_mm', 10211, 5106);
  if (faulty) await halfDropped(u, eFull); else assert.equal((await hook(eFull)).code, 200);
  assert.equal((await hook(eHalf)).code, 200);
  if (faulty) assert.equal((await hook(eFull)).code, 200); // إعادة Stripe للحدث الكامل
  return spendAll(u);
}
test('r3-rv5-R1b: الاسترداد الكامل لـmedia_max قبل حدث النصف وتفشل كتابته ⇒ ما بقي من media_pro (غير المستردّة) باقٍ (كان ٠ — تراجعٌ عن 36e1841b)', async () => {
  const c = await rv5R1b('rv5r1bc', false);
  const f = await rv5R1b('rv5r1bf', true);
  assert.equal(c, 2000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + ' فلسًا من media_pro؛ وفشل كتابة واحد ترك ' + f);
  assert.equal((await user('rv5r1bf')).media.mix.payId, 'cs_rv5r1bf_mp');
});
// R1c: نصف الحالة، ثمّ استرداد نصف media_pro العائدة قبل الإعادة
async function rv5R1c(u, faulty) {
  await proThenMax(u, 2000);
  const ev = refundOf('cs_' + u + '_mm', 10211, 10211);
  if (faulty) await halfDropped(u, ev); else assert.equal((await hook(ev)).code, 200);
  assert.equal((await hook(refundOf('cs_' + u + '_mp', 2042, 1021))).code, 200); // نصف media_pro مستردّ
  if (faulty) assert.equal((await hook(ev)).code, 200);
  return spendAll(u);
}
test('r3-rv5-R1c: نصف حالة استرداد media_max، ثمّ استرداد نصف media_pro قبل الإعادة ⇒ يؤخذ النصف المستردّ (كان يبقى ٢٠٠٠)', async () => {
  const c = await rv5R1c('rv5r1cc', false);
  const f = await rv5R1c('rv5r1cf', true);
  assert.equal(c, 750, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + ' فلسًا؛ وفشل كتابة واحد ترك ' + f);
});
// R11: media_pro اشتراكًا وmedia_max دفعة فوقه؛ نصف حالة استرداد media_max، ثمّ يتجدّد media_pro قبل الإعادة
async function rv5R11(u, faulty) {
  await fresh(u, {});
  sub('sub_' + u + '_mp', u, 'media_pro', 'active');
  assert.equal((await hook(subSession('cs_' + u + '_mp', u, 'media_pro', 2042, 'sub_' + u + '_mp'))).code, 200);
  store.set('media:mix:' + u, '2000');
  assert.equal((await hook(paidSession('cs_' + u + '_mm', u, 'media_max', 10211))).code, 200);
  const ev = refundOf('cs_' + u + '_mm', 10211, 10211);
  if (faulty) await halfDropped(u, ev); else assert.equal((await hook(ev)).code, 200);
  assert.equal((await hook(renewal('in_' + u + '_mp2', u, 'media_pro', 2042, 'sub_' + u + '_mp'))).code, 200);
  if (faulty) assert.equal((await hook(ev)).code, 200);
  let total = await spendAll(u);
  for (let k = 0; k < 3; k++) { // تنتهي كلّ نافذة فتسري أيّ مؤجَّلة
    const x = await user(u);
    if (!x.media || !x.media.mix) break;
    x.media.mix.at = Date.now() - 36 * DAY;
    await auth.putUser(u, x);
    total += await spendAll(u);
  }
  return total;
}
test('r3-rv5-R11: نصف حالة استرداد media_max، ثمّ يتجدّد اشتراك media_pro قبل الإعادة ⇒ كما بلا عطل (كان التجديد يُؤجَّل تحت المستردّة: ٤٥٠٠ بدل ٢٥٠٠)', async () => {
  const c = await rv5R11('rv5r11c', false);
  const f = await rv5R11('rv5r11f', true);
  assert.equal(c, 2500, 'ضابط بلا عطل: التجديد يملأ الشهر من جديد');
  assert.equal(f, c, 'ضابط ' + c + ' فلسًا؛ وفشل كتابة واحد أعطى ' + f);
});

// الإكمال المركزيّ نفسه
test('r3-rv5-lock: نصف الحالة ثمّ منح باقة محادثة (كاتب آخر تحت قفل الحساب) ⇒ يكمل سجلّ media_pro بلا ملء ثانٍ، والإعادة تعلّم الحدث فقط', async () => {
  await proThenMax('rv5lk1', 2000);
  const ev = refundOf('cs_rv5lk1_mm', 10211, 10211);
  await halfDropped('rv5lk1', ev);
  store.set('media:mix:rv5lk1', '1500'); // صُرف ٥٠٠ تحت media_max القديمة
  assert.equal((await hook(paidSession('cs_rv5lk1_basic', 'rv5lk1', 'basic', 1000))).code, 200);
  const u = await user('rv5lk1');
  assert.equal(u.plan, 'basic');
  assert.equal(u.media.mix.payId, 'cs_rv5lk1_mp', 'أكمله قفل الحساب لا إعادة Stripe');
  assert.equal(u.media.mix.plan, 'media_pro');
  assert.equal(mix('rv5lk1'), 1500, 'لا ملء ثانٍ');
  assert.equal((await hook(ev)).code, 200);
  assert.equal(JSON.parse(store.get('payrec:cs_rv5lk1_mm')).revoked.plan, true, 'الإعادة تعلّم الحدث «تمّ»');
  assert.equal(await spendAll('rv5lk1'), 1500);
});
test('r3-rv5-lock: نصف الحالة وفشل كتابة الإكمال تحت القفل ⇒ استرداد نصف media_max ‏500 بلا أثر، والإعادتان تتركان media_pro سليمة', async () => {
  await proThenMax('rv5lk2', 2000);
  const eFull = refundOf('cs_rv5lk2_mm', 10211, 10211);
  const eHalf = refundOf('cs_rv5lk2_mm', 10211, 5106);
  await halfDropped('rv5lk2', eFull);
  fail.userPut = 1;
  const r1 = await hook(eHalf);
  fail.userPut = 0;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal((await user('rv5lk2')).media.mix.payId, 'cs_rv5lk2_mm', 'لا أثر');
  assert.equal(mix('rv5lk2'), 2000, 'الرصيد لم يُمسّ');
  assert.equal(JSON.parse(store.get('payrec:cs_rv5lk2_mm')).revoked, undefined, 'الحدث غير معلَّم «تمّ»');
  assert.equal((await hook(eHalf)).code, 200);
  assert.equal((await hook(eFull)).code, 200);
  assert.equal((await user('rv5lk2')).media.mix.payId, 'cs_rv5lk2_mp');
  assert.equal(await spendAll('rv5lk2'), 2000);
});
test('r3-rv5-lock: نصف الحالة وعطل قراءة علامة الإعادة تحت القفل ⇒ 500 بلا أثر، والإعادة تكمل مرّة', async () => {
  await proThenMax('rv5lk3', 2000);
  const eFull = refundOf('cs_rv5lk3_mm', 10211, 10211);
  const eHalf = refundOf('cs_rv5lk3_mm', 10211, 5106);
  await halfDropped('rv5lk3', eFull);
  fail.strictGet = /^media-back:/;
  const r1 = await hook(eHalf);
  fail.strictGet = null;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal(mix('rv5lk3'), 2000, 'لا أثر');
  assert.equal((await hook(eHalf)).code, 200);
  assert.equal((await hook(eFull)).code, 200);
  assert.equal(await spendAll('rv5lk3'), 2000);
});
test('r3-rv5-lock: حساب بلا باقة وسائط ⇒ قفل الحساب لا يقرأ علامات الإعادة (لا كلفة على الكلّ)', async () => {
  await fresh('rv5lk4', {});
  const seen = [];
  hooks.get = async (k) => { seen.push(k); };
  try { assert.equal((await hook(paidSession('cs_rv5lk4_basic', 'rv5lk4', 'basic', 1000))).code, 200); } finally { hooks.get = null; }
  assert.equal(seen.filter((k) => /^media-back:/.test(k)).length, 0, JSON.stringify(seen));
});

// ثوابت يجب أن تصمد (عائلة المؤجَّلة ونصف الحالة)
test('r3-rv5-R2b: استرداد media_max (بلا سابقة) يُسري media_basic المؤجَّلة وتفشل الكتابة، ثمّ حدث النصف قبل الإعادة ⇒ media_basic سليمة (ثابت)', async () => {
  const run = async (u, faulty) => {
    await maxThenBasic(u, 9000);
    const eFull = refundOf('cs_' + u + '_mm', 10211, 10211);
    const eHalf = refundOf('cs_' + u + '_mm', 10211, 5106);
    if (faulty) fail.userPut = 1;
    const r = await hook(eFull);
    fail.userPut = 0;
    if (faulty) assert.ok(r.code >= 500, String(r.code)); else assert.equal(r.code, 200);
    assert.equal((await hook(eHalf)).code, 200);
    if (faulty) assert.equal((await hook(eFull)).code, 200);
    return spendAll(u);
  };
  const c = await run('rv5r2bc', false);
  const f = await run('rv5r2bf', true);
  assert.equal(c, 1250);
  assert.equal(f, c, 'ضابط ' + c + '؛ بعطل ' + f);
});
test('r3-rv5-R1r: نصف الحالة ثمّ تغيير الاسم قبل الإعادة ⇒ ما بقي من media_pro مرّة واحدة ولا شيء تحت الاسم القديم (ثابت)', async () => {
  await proThenMax('rv5r1r', 2000);
  const ev = refundOf('cs_rv5r1r_mm', 10211, 10211);
  await halfDropped('rv5r1r', ev);
  const rn = await rename('rv5r1r', 'rv5r1rnew');
  assert.equal(rn.code, 200, JSON.stringify(rn.body));
  assert.equal((await hook(ev)).code, 200);
  assert.equal(await spendAll('rv5r1rnew'), 2000);
  assert.equal(store.has('media:mix:rv5r1r'), false);
});
test('r3-rv5-R4: كتابة سجلّ السريان تصل ويضيع ردّها ⇒ استرداد media_basic يأخذها مرّة (ثابت)', async () => {
  await maxThenBasic('rv5r4', 300);
  store.set('media:mix:rv5r4', '0');
  fail.userPutLost = 1;
  await media.trySpendMedia('rv5r4', 5, 'image_normal');
  fail.userPutLost = 0;
  assert.equal((await user('rv5r4')).media.mix.plan, 'media_basic');
  assert.equal((await hook(refundOf('cs_rv5r4_mb', 1021, 1021))).code, 200);
  assert.equal(await spendAll('rv5r4'), 0);
});
test('r3-rv5-R5: ردّ طلب السريان يضيع بعد تنفيذه، ثمّ media_max جديدة واستردادها كاملًا ⇒ يعود ما بقي من media_basic وحده (ثابت)', async () => {
  await maxThenBasic('rv5r5', 300);
  store.set('media:mix:rv5r5', '0');
  fail.pipeLost = /^media-on:/;
  const s = await media.trySpendMedia('rv5r5', 5, 'image_normal');
  fail.pipeLost = null;
  const f = s ? s.fils : 0;
  assert.equal((await user('rv5r5')).media.mix.plan, 'media_max', 'السجلّ لم يُكتب');
  assert.ok(store.has('media-on:cs_rv5r5_mb'));
  assert.equal((await hook(paidSession('cs_rv5r5_mm2', 'rv5r5', 'media_max', 10211))).code, 200);
  assert.equal((await hook(refundOf('cs_rv5r5_mm2', 10211, 10211))).code, 200);
  const spent = await spendAll('rv5r5');
  assert.equal(spent + f, 1250, 'صُرف ' + spent + ' + ' + f);
});
test('r3-rv5-R7: حالة x1 وعطل قراءة علامة السريان تحت القفل ⇒ الاسترداد 500 بلا أثر، والإعادة تسحب media_basic مرّة (ثابت)', async () => {
  await x1('rv5r7');
  const ev = refundOf('cs_rv5r7_mb', 1021, 1021);
  fail.strictGet = /^media-on:/;
  const r1 = await hook(ev);
  fail.strictGet = null;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal((await hook(ev)).code, 200);
  assert.equal(await spendAll('rv5r7'), 0);
});

// ───────────── r3-rv6-*: مراجعة lock-r3/money-d — الإكمال المركزيّ يعيد اختيار الفترة التي يعيدها السحب ─────────────
// سلسلة ثلاث فترات: media_pro P (بقي ٢٠٠٠) ⊂ media_max X (بقي ٩٠٠٠، سابقتها P) ⊂ media_max Y (سابقتها X). استرداد Y كاملًا يعيد رصيد X بـfillOnce
// ('media-back:Y') ثمّ تفشل كتابة السجلّ (نصف حالة). يُستردّ X كاملًا (أو يُعترض عليه) قبل إعادة Y: كان completeDropped(Y) يعيد حساب السابقة،
// فيتخطّى X المسحوبة إلى P، والعلامة تمنع الملء — فيبقى رصيد X (٩٠٠٠) تحت P، وسحبُ X لا يجد فترته. تراجعٌ عن 36e1841b (هناك ٢٠٠٠).
// الإصلاح (v-r3 r4-target): العلامة تحمل رقم الفترة التي أعادها الملء الأوّل، والإكمال يعيدها هي (periodOf في سلسلة سوابق Y) بلا ملء، ثمّ يسحبها سحبُها.
async function chain3(u, pLeft, xLeft) {
  await fresh(u, {});
  assert.equal((await hook(paidSession('cs_' + u + '_p', u, 'media_pro', 2042))).code, 200);
  store.set('media:mix:' + u, String(pLeft));
  assert.equal((await hook(paidSession('cs_' + u + '_x', u, 'media_max', 10211))).code, 200);
  store.set('media:mix:' + u, String(xLeft));
  assert.equal((await hook(paidSession('cs_' + u + '_y', u, 'media_max', 10211))).code, 200);
  assert.equal((await user(u)).media.mix.payId, 'cs_' + u + '_y');
}
// نصف حالة استرداد Y: 500، والسجلّ ما زال على Y، ورصيد X العائد في العدّاد
async function halfY(u, eY) {
  fail.userPut = 1;
  const r = await hook(eY);
  fail.userPut = 0;
  assert.ok(r.code >= 500, 'المحاولة الأولى تفشل: ' + r.code);
  assert.equal((await user(u)).media.mix.payId, 'cs_' + u + '_y', 'نصف الحالة: السجلّ ما زال على Y');
  assert.equal(mix(u), 9000, 'ورصيد X العائد في العدّاد');
}
const yFull = (u) => refundOf('cs_' + u + '_y', 10211, 10211);
const xFull = (u) => refundOf('cs_' + u + '_x', 10211, 10211);
const xDispute = (u) => evt('charge.dispute.created', { id: 'dp_' + u, object: 'dispute', charge: 'ch_cs_' + u + '_x', payment_intent: 'pi_cs_' + u + '_x', amount: 10211, currency: 'usd', reason: 'fraudulent' });
async function rv6A1(u, faulty, xEv) {
  await chain3(u, 2000, 9000);
  const eY = yFull(u);
  if (faulty) await halfY(u, eY); else assert.equal((await hook(eY)).code, 200);
  assert.equal((await hook(xEv(u))).code, 200);
  if (faulty) assert.equal((await hook(eY)).code, 200); // إعادة Stripe لاسترداد Y
  return spendAll(u);
}
test('r3-rv6-A1: نصف حالة استرداد Y (عاد رصيد X)، ثمّ استرداد X كاملًا قبل إعادة Y ⇒ ما بقي من P وحده (كان ٩٠٠٠ — تراجعٌ عن 36e1841b)', async () => {
  const c = await rv6A1('rv6a1c', false, xFull);
  const f = await rv6A1('rv6a1f', true, xFull);
  assert.equal(c, 2000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد ترك ' + f + ' (رصيد X المستردّة كاملًا باقٍ تحت P)');
  assert.equal(store.get('media-back:cs_rv6a1f_y'), 'cs_rv6a1f_x', 'علامة الإعادة تحمل الفترة التي أعادها الملء الأوّل');
  assert.equal((await user('rv6a1f')).media.mix.payId, 'cs_rv6a1f_p');
});
test('r3-rv6-A1d: نفسه والاعتراض البنكيّ على X بدل استردادها ⇒ ما بقي من P وحده (كان ٩٠٠٠)', async () => {
  const c = await rv6A1('rv6a1dc', false, xDispute);
  const f = await rv6A1('rv6a1df', true, xDispute);
  assert.equal(c, 2000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد ترك ' + f);
});
async function rv6A2(u, faulty) {
  await chain3(u, 2000, 9000);
  const eY = yFull(u);
  if (faulty) await halfY(u, eY); else assert.equal((await hook(eY)).code, 200);
  let n = 0;
  for (let i = 0; i < 120; i++) { const s = await media.trySpendMedia(u, 5, 'image_normal'); if (!s) break; n += s.fils; } // ٣٠٠٠ من رصيد X العائد
  assert.equal((await hook(xFull(u))).code, 200);
  if (faulty) assert.equal((await hook(eY)).code, 200);
  return n + await spendAll(u);
}
test('r3-rv6-A2: كـA1 مع صرف ٣٠٠٠ من رصيد X العائد قبل استردادها ⇒ ٣٠٠٠ + ما بقي من P (كان ٩٠٠٠)', async () => {
  const c = await rv6A2('rv6a2c', false);
  const f = await rv6A2('rv6a2f', true);
  assert.equal(c, 5000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد أعطى ' + f);
});
async function rv6A8(u, faulty) {
  await chain3(u, 2000, 9000);
  const eY = yFull(u);
  if (faulty) await halfY(u, eY); else assert.equal((await hook(eY)).code, 200);
  const [r1, r2] = await Promise.all([hook(xFull(u)), hook(paidSession('cs_' + u + '_z', u, 'media_max', 10211))]);
  assert.equal(r1.code, 200);
  assert.equal(r2.code, 200);
  assert.equal((await hook(refundOf('cs_' + u + '_z', 10211, 10211))).code, 200);
  if (faulty) assert.equal((await hook(eY)).code, 200);
  return spendAll(u);
}
test('r3-rv6-A8: نصف حالة استرداد Y، ثمّ استرداد X ومنح media_max جديدة Z معًا، ثمّ استرداد Z كاملًا ⇒ ما بقي من P (كان ٢٥٠٠)', async () => {
  const c = await rv6A8('rv6a8c', false);
  const f = await rv6A8('rv6a8f', true);
  assert.equal(c, 2000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد أعطى ' + f);
});
// ثابتان: البديلان المرفوضان (إعادة الملء حين تتغيّر الفترة، أو ربط الملء بسجلّ الفترة المعادة) يكسران أحدهما
async function rv6A3(u, faulty) {
  await chain3(u, 2000, 9000);
  const eY = yFull(u);
  if (faulty) fail.userPut = 1;
  await hook(eY);
  fail.userPut = 0;
  let n = await spendAll(u); // رصيد X العائد يُصرف (٩٠٠٠)
  if (faulty) fail.userPut = 1;
  const rx = await hook(xFull(u));
  fail.userPut = 0;
  if (faulty) assert.ok(rx.code >= 500, String(rx.code)); else assert.equal(rx.code, 200);
  assert.equal((await hook(paidSession('cs_' + u + '_basic', u, 'basic', 1000))).code, 200); // كاتب آخر تحت القفل
  n += await spendAll(u);
  if (faulty) { assert.equal((await hook(xFull(u))).code, 200); assert.equal((await hook(eY)).code, 200); }
  return n + await spendAll(u);
}
test('r3-rv6-A3 (عطلان): نصف حالة Y، صرف رصيد X، فشل كتابة إكمال استرداد X، ثمّ كاتب آخر قبل إعادته ⇒ ٩٠٠٠ + ٢٠٠٠ لا أكثر (ثابت)', async () => {
  const c = await rv6A3('rv6a3c', false);
  const f = await rv6A3('rv6a3f', true);
  assert.equal(c, 11000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ بعطلين ' + f);
});
async function rv6A7(u, faulty) {
  await fresh(u, {});
  assert.equal((await hook(paidSession('cs_' + u + '_x', u, 'media_max', 10211))).code, 200);
  store.set('media:mix:' + u, '9000');
  const ux = await user(u); ux.media.mix.at = Date.now() - 2 * DAY; await auth.putUser(u, ux); // أوقات مميّزة (لا تتساوى بالملّي ثانية)
  assert.equal((await hook(paidSession('cs_' + u + '_y', u, 'media_max', 10211))).code, 200);
  store.set('media:mix:' + u, '8000');
  const uy = await user(u); uy.media.mix.at = Date.now() - DAY; await auth.putUser(u, uy);
  const gz = paidSession('cs_' + u + '_z', u, 'media_max', 10211);
  if (faulty) fail.userPut = 1;
  const r = await hook(gz);
  fail.userPut = 0;
  if (faulty) assert.ok(r.code >= 500, String(r.code)); else assert.equal(r.code, 200);
  assert.equal((await hook(refundOf('cs_' + u + '_y', 10211, 10211))).code, 200);
  if (faulty) assert.equal((await hook(gz)).code, 200);
  assert.equal((await user(u)).media.mix.payId, 'cs_' + u + '_z');
  assert.equal((await hook(refundOf('cs_' + u + '_z', 10211, 10211))).code, 200);
  return spendAll(u);
}
test('r3-rv6-A7: منح Z معلَّق فوق Y، ثمّ استرداد Y كاملًا، ثمّ إكمال Z، ثمّ استرداد Z كاملًا ⇒ ما بقي من X (٩٠٠٠) لا رصيد Z (ثابت)', async () => {
  const c = await rv6A7('rv6a7c', false);
  const f = await rv6A7('rv6a7f', true);
  assert.equal(c, 9000, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ بعطل ' + f);
});

// ───────────── r3-rv6-G*: مسح الصنف — توأم media-on وmedia-back في المنح: رصيدٌ مُلئ وسجلّ لم يُكتب ─────────────
// منح وسائط غير مؤجَّل (grantMedia) يملأ الرصيد ثمّ يكتب السجلّ؛ فشلُ الكتابة يُبقي الحجز وعلامة الإكمال، والسجلّ على الفترة السابقة P ورصيدُ المنح
// في العدّاد حتّى إعادة الحدث. كلّ كاتب تحت قفل الحساب قبلها يعمل على P: انتهت نافذتها أو سُحبت ⇒ تسري المؤجَّلة تحتها فوق الرصيد المملوء، ثمّ
// يرى الإكمال فترةً «أحدث» فلا تُسلَّم media_max المدفوعة أبدًا (G1 · G2 — تراجعٌ عن 36e1841b بالتأجيل). وقديمًا: سحب P كاملًا يعيد سابقتها ثمّ يعيد
// الإكمال الملء (G3: ١٧٥٠٠ من ١٢٥٠٠)، ونصفها يأخذ من رصيد المنح (G4). الإصلاح: مؤشّر للحساب يُكتب مع علامة الإكمال، وwithAccount يكمل المنح أوّلًا.
const swPayRefund = require(rp('api/_lib/pay-refund.js'));
async function swExpireCur(u) { // تنتهي كلّ نافذة حاليّة فتسري أيّ مؤجَّلة، ويُصرف كلّ شيء
  let total = await spendAll(u);
  for (let k = 0; k < 3; k++) {
    const x = await user(u);
    if (!x.media || !x.media.mix) break;
    x.media.mix.at = Date.now() - 36 * DAY;
    await auth.putUser(u, x);
    total += await spendAll(u);
  }
  return total;
}
// نصف حالة المنح: media_max m2 فوق media_max P (بقي ٩٠٠٠) ومعها media_basic مؤجَّلة؛ الرصيد مُلئ والسجلّ لم يُكتب
async function grantHalf(u, g) {
  fail.userPut = 1;
  const r = await hook(g);
  fail.userPut = 0;
  assert.ok(r.code >= 500, 'المحاولة الأولى تفشل: ' + r.code);
  const v = await user(u);
  assert.equal(v.media.mix.payId, 'cs_' + u + '_p', 'نصف الحالة: السجلّ ما زال على P');
  assert.equal(mix(u), 12500, 'ورصيد المنح في العدّاد');
  assert.ok(store.has('paid-credit:lastStripeSessionId:cs_' + u + '_m2'), 'وعلامة الإكمال');
}
async function rv6G(u, faulty, kill, deferred) {
  await fresh(u, {});
  assert.equal((await hook(paidSession('cs_' + u + '_p', u, 'media_max', 10211))).code, 200);
  store.set('media:mix:' + u, '9000');
  if (deferred) assert.equal((await hook(paidSession('cs_' + u + '_b', u, 'media_basic', 1021))).code, 200);
  const g = paidSession('cs_' + u + '_m2', u, 'media_max', 10211);
  if (faulty) await grantHalf(u, g); else assert.equal((await hook(g)).code, 200);
  await kill(u);
  if (faulty) assert.equal((await hook(g)).code, 200); // إعادة حدث الدفع
  return swExpireCur(u);
}
const killRefundP = async (u) => { assert.equal((await hook(refundOf('cs_' + u + '_p', 10211, 10211))).code, 200); };
const killExpireP = async (u) => { // تنتهي نافذة P (إن كانت الحاليّة على السجلّ) ثمّ قراءة وسائط
  const v = await user(u);
  if (v.media.mix.payId === 'cs_' + u + '_p') { v.media.mix.at = Date.now() - 36 * DAY; await auth.putUser(u, v); }
  await media.mediaStatus(u);
};
test('r3-rv6-G1: منح media_max فوق P ومؤجَّلة يفشل سجلّه، ثمّ استرداد P كاملًا قبل الإعادة ⇒ المنح يُسلَّم ثمّ المؤجَّلة (كان ١٢٥٠ بدل ١٣٧٥٠ — تراجعٌ عن 36e1841b)', async () => {
  const c = await rv6G('rv6g1c', false, killRefundP, true);
  const f = await rv6G('rv6g1f', true, killRefundP, true);
  assert.equal(c, 13750, 'ضابط بلا عطل: media_max ثمّ media_basic المؤجَّلة');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد أعطى ' + f + ' (media_max المدفوعة لم تُسلَّم)');
});
test('r3-rv6-G2: نفسه وتنتهي نافذة P قبل الإعادة (قراءة تُسري المؤجَّلة) ⇒ كما بلا عطل (كان ١٢٥٠ بدل ١٣٧٥٠)', async () => {
  const c = await rv6G('rv6g2c', false, killExpireP, true);
  const f = await rv6G('rv6g2f', true, killExpireP, true);
  assert.equal(c, 13750, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد أعطى ' + f);
});
// G3: P سابقتها Q (media_pro ٢٠٠٠)؛ صرف ٣٠٠٠ في نصف الحالة، ثمّ استرداد P كاملًا، ثمّ صرف، ثمّ الإعادة
async function rv6G3(u, faulty) {
  await fresh(u, {});
  assert.equal((await hook(paidSession('cs_' + u + '_q', u, 'media_pro', 2042))).code, 200);
  store.set('media:mix:' + u, '2000');
  assert.equal((await hook(paidSession('cs_' + u + '_p', u, 'media_max', 10211))).code, 200);
  store.set('media:mix:' + u, '9000');
  const g = paidSession('cs_' + u + '_m2', u, 'media_max', 10211);
  if (faulty) await grantHalf(u, g); else assert.equal((await hook(g)).code, 200);
  let n = 0;
  for (let i = 0; i < 120; i++) { const s = await media.trySpendMedia(u, 5, 'image_normal'); if (!s) break; n += s.fils; }
  assert.equal((await hook(refundOf('cs_' + u + '_p', 10211, 10211))).code, 200);
  n += await spendAll(u);
  if (faulty) assert.equal((await hook(g)).code, 200);
  return n + await swExpireCur(u);
}
test('r3-rv6-G3: نصف حالة المنح، صرف، ثمّ استرداد P كاملًا (تعود Q) قبل الإعادة ⇒ رصيد المنح مرّة واحدة (كان ١٧٥٠٠ من ١٢٥٠٠ — قديم في 36e1841b)', async () => {
  const c = await rv6G3('rv6g3c', false);
  const f = await rv6G3('rv6g3f', true);
  assert.equal(c, 12500, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد أعطى ' + f);
});
test('r3-rv6-G4: نصف حالة المنح ثمّ استرداد نصف P قبل الإعادة ⇒ رصيد المنح لا يُمسّ (كان يُؤخذ نصف P منه — قديم في 36e1841b)', async () => {
  const half = async (u) => { assert.equal((await hook(refundOf('cs_' + u + '_p', 10211, 5106))).code, 200); };
  const c = await rv6G('rv6g4c', false, half, false);
  const f = await rv6G('rv6g4f', true, half, false);
  assert.equal(c, 12500, 'ضابط بلا عطل');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد أعطى ' + f);
});

// الإكمال المركزيّ نفسه
test('r3-rv6-G-lock: نصف حالة المنح ثمّ منح باقة محادثة (كاتب آخر تحت القفل) ⇒ يكمل media_max بوقتها وبلا ملء ثانٍ، والإعادة «سبق المنح»', async () => {
  await fresh('rv6gl1', {});
  assert.equal((await hook(paidSession('cs_rv6gl1_p', 'rv6gl1', 'media_max', 10211))).code, 200);
  store.set('media:mix:rv6gl1', '9000');
  const g = paidSession('cs_rv6gl1_m2', 'rv6gl1', 'media_max', 10211);
  await grantHalf('rv6gl1', g);
  const at = JSON.parse(store.get('paid-credit:lastStripeSessionId:cs_rv6gl1_m2')).at;
  store.set('media:mix:rv6gl1', '12000'); // صُرف ٥٠٠ تحت P القديمة
  assert.equal((await hook(paidSession('cs_rv6gl1_basic', 'rv6gl1', 'basic', 1000))).code, 200);
  const u = await user('rv6gl1');
  assert.equal(u.plan, 'basic');
  assert.equal(u.media.mix.payId, 'cs_rv6gl1_m2', 'أكمله قفل الحساب لا إعادة الحدث');
  assert.equal(u.media.mix.at, at, 'بوقت المنح الأصليّ');
  assert.equal(mix('rv6gl1'), 12000, 'لا ملء ثانٍ');
  assert.equal(store.has('paid-credit:lastStripeSessionId:cs_rv6gl1_m2'), false, 'العلامة مُحيت');
  assert.equal(store.has('paid-credit-acct:rv6gl1'), false, 'والمؤشّر');
  const rec = JSON.parse(store.get('payrec:cs_rv6gl1_m2'));
  assert.equal(rec.prev.payId, 'cs_rv6gl1_p', 'سجلّ المنح بسابقته');
  assert.ok(rec.refs.includes('pi_cs_rv6gl1_m2'), 'وبأرقام دفعته من العلامة');
  const r = await hook(g);
  assert.equal(r.code, 200);
  assert.equal(mix('rv6gl1'), 12000);
});
test('r3-rv6-G-lock: نصف حالة المنح وعطل قراءة المؤشّر تحت القفل ⇒ الكاتب 500 بلا أثر، والإعادة تكمل مرّة', async () => {
  await fresh('rv6gl2', {});
  assert.equal((await hook(paidSession('cs_rv6gl2_p', 'rv6gl2', 'media_max', 10211))).code, 200);
  store.set('media:mix:rv6gl2', '9000');
  const g = paidSession('cs_rv6gl2_m2', 'rv6gl2', 'media_max', 10211);
  await grantHalf('rv6gl2', g);
  const ev = refundOf('cs_rv6gl2_p', 10211, 5106);
  fail.strictGet = /^paid-credit-acct:/;
  const r1 = await hook(ev);
  fail.strictGet = null;
  assert.ok(r1.code >= 500, String(r1.code));
  assert.equal(mix('rv6gl2'), 12500, 'لا أثر');
  assert.equal(JSON.parse(store.get('payrec:cs_rv6gl2_p')).revoked, undefined, 'الحدث غير معلَّم «تمّ»');
  assert.equal((await hook(ev)).code, 200);
  assert.equal((await user('rv6gl2')).media.mix.payId, 'cs_rv6gl2_m2');
  assert.equal(mix('rv6gl2'), 12500, 'نصف P المستردّ لا يُؤخذ من رصيد المنح');
  assert.equal((await hook(g)).code, 200);
  assert.equal(await spendAll('rv6gl2'), 12500);
});
test('r3-rv6-G-lock: صرف النقاط (المسار الساخن) لحساب بلا خانة وسائط ⇒ مرآته تحت القفل لا تقرأ مؤشّر المنح المعلَّق (لا كلفة على الكلّ)', async () => {
  await fresh('rv6gl3', { points: 200 });
  const seen = [];
  hooks.get = async (k) => { seen.push(k); };
  try { assert.equal((await points.spendPoints('rv6gl3', 20, 'image')).ok, true); } finally { hooks.get = null; }
  assert.ok(seen.some((k) => /^points:/.test(k)), 'المرآة جرت: ' + JSON.stringify(seen));
  assert.equal(seen.filter((k) => /^paid-credit-acct:/.test(k)).length, 0, JSON.stringify(seen));
  assert.equal(pts('rv6gl3'), 180);
});
test('r3-rv6-G-lock: PayPal — منح وسائط ملتقَط لم يصل سجلّه يكمله القفل برقم الالتقاط ومبلغه ⇒ استرداد نصفه يأخذ النصف لا الباقة كلّها', async () => {
  await fresh('rv6gl4', {});
  assert.equal((await hook(paidSession('cs_rv6gl4_p', 'rv6gl4', 'media_max', 10211))).code, 200);
  store.set('media:mix:rv6gl4', '9000');
  ppOrder('ORD-RV6GL4', 'CAP-RV6GL4', 'rv6gl4', 'media_max', '102.11');
  fail.userPut = 1;
  let first;
  try { first = await paypal.captureCompleted(capEvent('ORD-RV6GL4', 'CAP-RV6GL4')); } catch (e) { first = { threw: e.message }; } finally { fail.userPut = 0; }
  assert.ok(first.threw, 'المحاولة الأولى ترمي (500 فيعيد PayPal): ' + JSON.stringify(first));
  assert.equal((await hook(paidSession('cs_rv6gl4_basic', 'rv6gl4', 'basic', 1000))).code, 200); // كاتب آخر يكمل المنح
  assert.equal((await user('rv6gl4')).media.mix.payId, 'ORD-RV6GL4');
  assert.equal((await paypal.captureCompleted(capEvent('ORD-RV6GL4', 'CAP-RV6GL4'))).status, 'already');
  const rec = JSON.parse(store.get('payrec:ORD-RV6GL4'));
  assert.equal(rec.amount, 10211, 'المبلغ في سجلّ المنح');
  assert.equal(store.get('payref:CAP-RV6GL4'), 'ORD-RV6GL4', 'ورقم الالتقاط');
  const r = await swPayRefund.paypalEvent({ id: 'WH-RV6GL4', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'RF-RV6GL4', amount: { value: '51.05', currency_code: 'USD' }, seller_payable_breakdown: { total_refunded_amount: { value: '51.05', currency_code: 'USD' } }, links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAP-RV6GL4' }] } });
  assert.equal(r.results[0].status, 'partial', JSON.stringify(r.results[0]));
  assert.equal((await user('rv6gl4')).media.mix.payId, 'ORD-RV6GL4', 'الباقة باقية');
  assert.equal(mix('rv6gl4'), 12500 - 6249, 'نصف رصيدها');
});
// ثوابت
test('r3-rv6-G5: ردّ كتابة سجلّ المنح يضيع (وصلت)، ثمّ استرداد P كاملًا قبل الإعادة ⇒ كما بلا عطل (ثابت)', async () => {
  const lost = async (u, faulty) => {
    await fresh(u, {});
    assert.equal((await hook(paidSession('cs_' + u + '_p', u, 'media_max', 10211))).code, 200);
    store.set('media:mix:' + u, '9000');
    assert.equal((await hook(paidSession('cs_' + u + '_b', u, 'media_basic', 1021))).code, 200);
    const g = paidSession('cs_' + u + '_m2', u, 'media_max', 10211);
    if (faulty) fail.userPutLost = 1;
    const r = await hook(g);
    fail.userPutLost = 0;
    if (faulty) assert.ok(r.code >= 500, String(r.code)); else assert.equal(r.code, 200);
    await killRefundP(u);
    if (faulty) assert.equal((await hook(g)).code, 200);
    return swExpireCur(u);
  };
  const c = await lost('rv6g5c', false);
  const f = await lost('rv6g5f', true);
  assert.equal(c, 13750);
  assert.equal(f, c, 'ضابط ' + c + '؛ بعطل ' + f);
});
test('r3-rv6-G6: نصف حالة المنح، ثمّ تغيير الاسم، ثمّ استرداد P كاملًا ⇒ المنح والمؤجَّلة تحت الاسم الجديد كما بلا عطل (ثابت)', async () => {
  const run = async (u, faulty) => {
    await fresh(u, {});
    assert.equal((await hook(paidSession('cs_' + u + '_p', u, 'media_max', 10211))).code, 200);
    store.set('media:mix:' + u, '9000');
    assert.equal((await hook(paidSession('cs_' + u + '_b', u, 'media_basic', 1021))).code, 200);
    const g = paidSession('cs_' + u + '_m2', u, 'media_max', 10211);
    if (faulty) await grantHalf(u, g); else assert.equal((await hook(g)).code, 200);
    const rn = await rename(u, u + 'n');
    assert.equal(rn.code, 200, JSON.stringify(rn.body));
    await killRefundP(u + 'n');
    if (faulty) assert.equal((await hook(g)).code, 200);
    return { spent: await swExpireCur(u + 'n'), old: store.has('media:mix:' + u) };
  };
  const c = await run('rv6g6c', false);
  const f = await run('rv6g6f', true);
  assert.deepEqual(c, { spent: 13750, old: false });
  assert.deepEqual(f, c);
});
// قديمان في 36e1841b والحساب بلا خانة وسائط بعد (أوّل شراء): كاتبُ دفعٍ أو تغيير اسم يأخذ القفل بانتظاره الكامل يكمل المنح أيضًا
test('r3-rv6-G7: أوّل media_max يفشل سجلّه، ثمّ تغيير الاسم قبل الإعادة ⇒ رصيدها ينتقل إلى الاسم الجديد (كان يبقى تحت القديم فتُسلَّم بلا رصيد — قديم في 36e1841b)', async () => {
  const run = async (u, faulty) => {
    await fresh(u, {});
    const g = paidSession('cs_' + u + '_m2', u, 'media_max', 10211);
    if (faulty) fail.userPut = 1;
    const r = await hook(g);
    fail.userPut = 0;
    if (faulty) assert.ok(r.code >= 500, String(r.code)); else assert.equal(r.code, 200);
    const rn = await rename(u, u + 'n');
    assert.equal(rn.code, 200, JSON.stringify(rn.body));
    if (faulty) assert.equal((await hook(g)).code, 200);
    return { spent: await swExpireCur(u + 'n'), old: store.has('media:mix:' + u) };
  };
  const c = await run('rv6g7c', false);
  const f = await run('rv6g7f', true);
  assert.deepEqual(c, { spent: 12500, old: false }, 'ضابط بلا عطل');
  assert.deepEqual(f, c, 'ضابط ' + JSON.stringify(c) + '؛ وفشل كتابة واحد أعطى ' + JSON.stringify(f));
});
test('r3-rv6-G8: أوّل media_max يفشل سجلّه، ثمّ تصل media_basic قبل الإعادة ⇒ تُؤجَّل تحت media_max كما بلا عطل (كان رصيد media_max يُمحى — قديم في 36e1841b)', async () => {
  const run = async (u, faulty) => {
    await fresh(u, {});
    const g = paidSession('cs_' + u + '_m2', u, 'media_max', 10211);
    if (faulty) fail.userPut = 1;
    const r = await hook(g);
    fail.userPut = 0;
    if (faulty) assert.ok(r.code >= 500, String(r.code)); else assert.equal(r.code, 200);
    assert.equal((await hook(paidSession('cs_' + u + '_b', u, 'media_basic', 1021))).code, 200);
    if (faulty) assert.equal((await hook(g)).code, 200);
    return swExpireCur(u);
  };
  const c = await run('rv6g8c', false);
  const f = await run('rv6g8f', true);
  assert.equal(c, 13750, 'ضابط بلا عطل: media_max ثمّ media_basic المؤجَّلة');
  assert.equal(f, c, 'ضابط ' + c + '؛ وفشل كتابة واحد أعطى ' + f);
});

// مسح الصنف — تغيير الاسم: التحضير (r3-4) يكتب نقاط الاسم الجديد '0' قبل سجلّه
test('r3-rv6-RN0: تغيير اسم يفشل بكتابة السجلّ الجديد ⇒ لا عدّاد يتيم، ومن يسجّل ذلك الاسم بعدُ يأخذ هديّة ترحيبه (كان صفرًا — تراجعٌ عن 36e1841b)', async () => {
  await fresh('rv6rn0', { points: 300 });
  fail.userPut = 1;
  const rn = await rename('rv6rn0', 'rv6rn0new');
  fail.userPut = 0;
  assert.ok(rn.code >= 500, String(rn.code));
  assert.equal(store.has('points:rv6rn0new'), false, 'الصفر اليتيم مُحي');
  assert.equal(pts('rv6rn0'), 300, 'الاسم القديم ورصيده لم يُمسّا');
  await auth.putUser('rv6rn0new', { username: 'rv6rn0new', points: 70, welcomeGift: true, createdAt: Date.now() }); // تسجيلٌ لاحق لغيره
  assert.equal((await points.readPoints('rv6rn0new')).points, 70);
  const ok = await rename('rv6rn0', 'rv6rn0b'); // والتغيير يعمل بعدها
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.equal(pts('rv6rn0b'), 300);
});
test('r3-rv6-RN0: وصلت كتابة السجلّ الجديد وضاع ردّها ⇒ يبقى الصفر فلا تُبذر نقاط النسخة من مرآة السجلّ (ثابت)', async () => {
  await fresh('rv6rn1', { points: 300 });
  fail.userPutLost = 1;
  const rn = await rename('rv6rn1', 'rv6rn1new');
  fail.userPutLost = 0;
  assert.ok(rn.code >= 500, String(rn.code));
  assert.equal(store.get('points:rv6rn1new'), '0');
  assert.equal((await points.readPoints('rv6rn1new')).points, 0, 'النسخة لا تأخذ نقاطًا من المرآة');
  assert.equal(pts('rv6rn1'), 300);
});
