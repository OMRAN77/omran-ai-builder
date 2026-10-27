// tests/lock-fix-subs.test.cjs — v-lock-subs (موافقة المالك ٢٧ أكتوبر ٢٠٢٦ على بنود الأبواب المقفلة: «صلح الخطير وابدا فيهم كلهم»).
// مجموعة «الاشتراكات والباقات»:
//   srv-money-3  تغيير الباقة بتجديد تلقائيّ كان ينشئ اشتراكًا ثانيًا في Stripe ولا يلغي الأوّل (خصمان شهريّان والباقة تتقلّب).
//   srv-money-4  شراء باقة أدنى كان يُسقط باقة أعلى سارية فورًا بلا تعويض (المحادثة، ورصيد الوسائط).
//   srv-money-5  إيقاف التجديد وحذف الحساب كانا لا يريان إلّا الاشتراكات active (past_due يبقى يُعاد سحبه)، ودفعة الحساب المحذوف بلا تنبيه.
//   cli-money-10 زرّ التجديد يقول «مفعّل — يتجدّد اشتراكك» ولا اشتراك متجدّد (الشراء بغير البطاقة دفعة لشهر).
//   cli-money-6  شريط «اشتراكك ينتهي — جدّد» كان يدعو مشترك مها و«صور وفيديو» لشراء يصفّر رصيده المتبقّي.
// على المعالجات الحقيقيّة (api/webhook.js موقَّعًا، create-checkout-session، paypal-order، account-delete، auth، points، pay-refund) بـKV في
// الذاكرة وشبكة مزيّفة (Stripe وPayPal) مثبّتة مرّة للملفّ كلّه، وأجزاء الواجهة في vm/Function. لا نداء حقيقيّ لأيّ مزوّد.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'lock-fix-subs-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_lock_subs_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_lock_subs';
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_SECRET = 'sec';
process.env.PAYPAL_MODE = 'sandbox';
delete process.env.PAYPAL_WEBHOOK_ID;

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV في الذاكرة ──
const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
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

// ── شبكة مزيّفة واحدة: Stripe (الجلسات، العمليّات، الاشتراكات وبحثها كما يبحث Stripe) وPayPal ──
const net = { subs: {}, sessions: {}, orders: {}, pis: {}, calls: [], seq: 0, failDelete: 0, failSearch: 0, searchLag: new Set() };
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
      if (net.failSearch > 0) { net.failSearch--; return reply(500, { error: { message: 'search down' } }); }
      const q = u.searchParams.get('query') || '';
      const nm = q.match(/metadata\['username'\]:'((?:[^'\\]|\\.)*)'/);
      const st = q.match(/status:'(\w+)'/); // Stripe يطابق الحالة إن ذُكرت — كما يفعل البحث الحقيقيّ
      // searchLag: البحث يتأخّر عن الكتابة (اشتراك أُنشئ للتوّ لا يظهر بعد) — القراءة بالرقم تراه
      const data = Object.values(net.subs).filter((s) => nm && s.metadata.username === unq(nm[1]) && (!st || s.status === st[1]) && !net.searchLag.has(s.id));
      return reply(200, { object: 'search_result', data: data.slice(0, Number(u.searchParams.get('limit')) || 10).map((s) => structuredClone(s)), has_more: false, next_page: null });
    }
    if ((m = p.match(/^subscriptions\/([^/]+)$/))) {
      const s = net.subs[decodeURIComponent(m[1])];
      if (!s) return reply(404, { error: { code: 'resource_missing', message: 'No such subscription' } });
      if (method === 'DELETE') {
        if (net.failDelete > 0) { net.failDelete--; return reply(500, { error: { message: 'api_error' } }); }
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
  return reply(404, {});
};

const auth = require(rp('api/_lib/auth.js'));
const checkout = require(rp('api/_lib/create-checkout-session.js'));
const paypal = require(rp('api/_lib/paypal-order.js'));
const webhook = require(rp('api/webhook.js'));
const { deleteAccount } = require(rp('api/_lib/account-delete.js'));
const tier = require(rp('api/_lib/tier.js'));
const points = require(rp('api/_lib/points.js'));
const planVideos = require(rp('api/_lib/_planVideos.js'));

const DAY = 86400000;
const nowSec = () => Math.floor(Date.now() / 1000);
const mkRes = () => ({ code: 200, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { if (b !== undefined) this.body = b; return this; } });
async function call(handler, req) { const res = mkRes(); await handler(Object.assign({ method: 'POST', headers: {}, query: {} }, req), res); return res; }
const stripe = (action, body) => call(checkout, { query: action ? { action } : {}, body });
const pp = (body) => call(paypal, { body });
const tok = (u) => auth.makeToken(u);
async function fresh(u, rec) { await auth.putUser(u, Object.assign({ username: u, points: 70, createdAt: Date.now() - 90 * DAY }, rec || {})); store.set('points:' + u, String((rec && rec.points) || 70)); }
const user = (u) => auth.getUser(u);
const pts = (u) => Number(store.get('points:' + u));
// created بترتيب الإنشاء (كما في Stripe): الأحدث يبقى (v-lock-subs، srv-money-3)
let subSeq = 0;
const sub = (id, username, plan, status, extra) => { net.subs[id] = Object.assign({ id, object: 'subscription', status, created: nowSec() - 100000 + (++subSeq), cancel_at_period_end: false, metadata: { username, plan }, items: { data: [{ current_period_end: nowSec() + 20 * 86400 }] } }, extra || {}); return net.subs[id]; };
const callsTo = (re, method) => net.calls.filter((c) => re.test(c.url) && (!method || c.method === method));
let evSeq = 0;
const evt = (type, object) => ({ id: 'evt_ls_' + (++evSeq), type, data: { object } });
const paidSession = (id, username, plan, amount, extra) => evt('checkout.session.completed', Object.assign({ id, object: 'checkout.session', payment_status: 'paid', mode: 'payment', payment_intent: 'pi_' + id, amount_total: amount, currency: 'usd', created: nowSec(), metadata: { username, plan } }, extra || {}));
const subSession = (id, username, plan, amount, subId) => paidSession(id, username, plan, amount, { mode: 'subscription', payment_intent: null, invoice: 'in_' + id, subscription: subId });
const renewal = (id, username, plan, amount, subId) => evt('invoice.paid', { id, object: 'invoice', billing_reason: 'subscription_cycle', subscription: subId, payment_intent: 'pi_' + id, amount_paid: amount, currency: 'usd', subscription_details: { metadata: { username, plan } } });
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

// ───────────────────────── srv-money-3: اشتراك ثانٍ عند تغيير الباقة ─────────────────────────

test('srv-money-3 ١. ترقية Pro ← Max بتجديد تلقائيّ: اشتراك Pro القديم يُلغى فورًا (لا خصمان شهريّان)، ولا يُمسّ Max ولا خانة أخرى ولا حساب آخر، والإعادة لا تحييه', async () => {
  await fresh('sara', { plan: 'pro', planUpdatedAt: Date.now() - 5 * DAY, planPayId: 'cs_sara_old' });
  sub('sub_sara_pro', 'sara', 'pro', 'active');
  sub('sub_sara_maha', 'sara', 'maha_basic', 'active'); // خانة مها
  sub('sub_sara_img', 'sara', 'img_basic', 'active');   // باقة صور قديمة (خانتها image، لا تُنقل — قرار v-media-merge)
  sub('sub_sara2_pro', 'sara2', 'pro', 'active');       // حساب آخر باسم قريب
  sub('sub_sara_max', 'sara', 'max', 'active');         // الاشتراك الجديد نفسه
  const r = await hook(subSession('cs_sara_max', 'sara', 'max', 10000, 'sub_sara_max'));
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(net.subs.sub_sara_pro.status, 'canceled', 'Pro القديم أُلغي — كان يبقى يُخصم ٢٠$ كلّ شهر مع ١٠٠$');
  assert.ok(callsTo(/\/v1\/subscriptions\/sub_sara_pro$/, 'DELETE').length >= 1, 'إلغاء فوريّ لا cancel_at_period_end (زرّ «أعد التجديد» كان سيحييه)');
  for (const id of ['sub_sara_max', 'sub_sara_maha', 'sub_sara_img', 'sub_sara2_pro']) assert.equal(net.subs[id].status, 'active', id + ' لا يُمسّ');
  const u = await user('sara');
  assert.deepEqual([u.plan, u.planPayId], ['max', 'cs_sara_max']);
  assert.equal(pts('sara'), 70 + 3200);
  // «أعد التجديد» بعدها لا يجد Pro القديم ليعيده
  const on = mkRes();
  await checkout.autoRenewToggle({ body: { token: tok('sara'), on: true } }, on);
  assert.equal(on.code, 200);
  assert.equal(net.subs.sub_sara_pro.status, 'canceled');
  assert.ok(!callsTo(/\/v1\/subscriptions\/sub_sara_pro$/, 'POST').length, 'لا تعديل على الملغى');
});

test('srv-money-3 ٢. إعادة الحدث وتزامن العودة مع الويب هوك: منح واحد (لا نقاط مضاعفة) وإلغاء واحد فعّال، وكلّ الردود ناجحة', async () => {
  await fresh('rami', { plan: 'basic', planUpdatedAt: Date.now() - 3 * DAY, planPayId: 'cs_rami_b' });
  sub('sub_rami_basic', 'rami', 'basic', 'active');
  sub('sub_rami_pro', 'rami', 'pro', 'active');
  const ev = subSession('cs_rami_pro', 'rami', 'pro', 2000, 'sub_rami_pro');
  net.sessions.cs_rami_pro = Object.assign({}, ev.data.object);
  const [a, b, c] = await Promise.all([
    hook(ev),
    stripe('verify-checkout', { session_id: 'cs_rami_pro', token: tok('rami') }),
    hook(ev),
  ]);
  assert.deepEqual([a.code, b.code, c.code], [200, 200, 200], JSON.stringify([a.body, b.body, c.body]));
  assert.equal(pts('rami'), 70 + 920, 'منح واحد');
  assert.equal(net.subs.sub_rami_basic.status, 'canceled');
  assert.equal(net.subs.sub_rami_pro.status, 'active');
  const again = await hook(ev);
  assert.equal(again.code, 200, 'إعادة بعد الإلغاء (الملغى قبلنا) = تمّ');
  assert.equal(pts('rami'), 70 + 920);
});

test('srv-money-3 ٣. تعذّر الإلغاء = 500 فيعيد Stripe الحدث (المنح لا يتكرّر)، والإعادة تكمل الإلغاء؛ ومسار العودة لا يفشل بعطل البحث', async () => {
  await fresh('huda', { plan: 'pro', planUpdatedAt: Date.now() - 2 * DAY });
  sub('sub_huda_pro', 'huda', 'pro', 'active');
  sub('sub_huda_max', 'huda', 'max', 'active');
  const ev = subSession('cs_huda_max', 'huda', 'max', 10000, 'sub_huda_max');
  net.failDelete = 1;
  const r1 = await hook(ev);
  assert.equal(r1.code, 500, 'الأثر لم يكتمل — لا 2xx');
  assert.equal(pts('huda'), 70 + 3200, 'المنح تمّ مرّة');
  assert.equal(net.subs.sub_huda_pro.status, 'active');
  const r2 = await hook(ev);
  assert.equal(r2.code, 200);
  assert.equal(net.subs.sub_huda_pro.status, 'canceled');
  assert.equal(pts('huda'), 70 + 3200, 'الإعادة لا تمنح ثانية');
  // العودة من الدفع (verify-checkout) بعطل بحث: المنح يصل، والإلغاء يتركه للويب هوك
  await fresh('hind', { plan: 'pro', planUpdatedAt: Date.now() - 2 * DAY });
  sub('sub_hind_pro', 'hind', 'pro', 'active');
  sub('sub_hind_max', 'hind', 'max', 'active');
  net.sessions.cs_hind_max = { id: 'cs_hind_max', payment_status: 'paid', mode: 'subscription', subscription: 'sub_hind_max', amount_total: 10000, currency: 'usd', created: nowSec(), metadata: { username: 'hind', plan: 'max' } };
  net.failSearch = 1;
  const v = await stripe('verify-checkout', { session_id: 'cs_hind_max', token: tok('hind') });
  assert.equal(v.code, 200, JSON.stringify(v.body));
  assert.equal(v.body.ok, true);
  assert.equal((await user('hind')).plan, 'max');
  assert.equal(net.failSearch, 0, 'البحث جُرّب فعلًا وتعطّل');
  assert.equal(net.subs.sub_hind_pro.status, 'active', 'يبقى للويب هوك');
  // بلا عطل: العودة نفسها تلغي القديم
  await fresh('hiba', { plan: 'pro', planUpdatedAt: Date.now() - 2 * DAY });
  sub('sub_hiba_pro', 'hiba', 'pro', 'active');
  sub('sub_hiba_max', 'hiba', 'max', 'active');
  net.sessions.cs_hiba_max = { id: 'cs_hiba_max', payment_status: 'paid', mode: 'subscription', subscription: 'sub_hiba_max', amount_total: 10000, currency: 'usd', created: nowSec(), metadata: { username: 'hiba', plan: 'max' } };
  assert.equal((await stripe('verify-checkout', { session_id: 'cs_hiba_max', token: tok('hiba') })).code, 200);
  assert.equal(net.subs.sub_hiba_pro.status, 'canceled');
});

test('srv-money-3 ٤. خانة الوسائط وحدها: اشتراك «صور وفيديو» جديد يلغي القديم من نوعه لا المحادثة ولا الصور القديمة، والدفعة لمرّة واحدة لا تلغي شيئًا', async () => {
  await fresh('noor');
  sub('sub_noor_mb', 'noor', 'media_basic', 'past_due');
  sub('sub_noor_chat', 'noor', 'pro', 'active');
  sub('sub_noor_img', 'noor', 'img_pro', 'active');
  sub('sub_noor_mp', 'noor', 'media_pro', 'active');
  assert.equal((await hook(subSession('cs_noor_mp', 'noor', 'media_pro', 2042, 'sub_noor_mp'))).code, 200);
  assert.equal(net.subs.sub_noor_mb.status, 'canceled', 'past_due من الخانة نفسها يُلغى أيضًا (كان سيُعاد سحبه)');
  for (const id of ['sub_noor_chat', 'sub_noor_img', 'sub_noor_mp']) assert.equal(net.subs[id].status, 'active', id);
  await fresh('nada');
  sub('sub_nada_pro', 'nada', 'pro', 'active');
  assert.equal((await hook(paidSession('cs_nada_max1', 'nada', 'max', 10000))).code, 200);
  assert.equal(net.subs.sub_nada_pro.status, 'active', 'شراء لمرّة واحدة لا يغيّر اشتراكًا قائمًا');
});

// المراجعة المعاكسة: المسار يجري أيضًا على حدث معاد أو متأخّر وعلى العودة لجلسة قديمة — الأحدث وحده يبقى في كلّ ترتيب وصول
test('srv-money-3 ٥. حدث جلسة Pro القديمة يُعاد أو يصل متأخّرًا بعد الترقية (ATK1): لا يلغي Max الأحدث، ولا منح ثانٍ، وMax وحده يتجدّد', async () => {
  await fresh('omar');
  sub('sub_omar_pro', 'omar', 'pro', 'active');
  const proEv = subSession('cs_omar_pro', 'omar', 'pro', 2000, 'sub_omar_pro');
  assert.equal((await hook(proEv)).code, 200);
  sub('sub_omar_max', 'omar', 'max', 'active');
  assert.equal((await hook(subSession('cs_omar_max', 'omar', 'max', 10000, 'sub_omar_max'))).code, 200);
  assert.equal(net.subs.sub_omar_pro.status, 'canceled', 'الترقية تلغي القديم');
  // Stripe يعيد حدث جلسة Pro (إعادة بعد 500/BUSY سابق، أو تسليم بغير ترتيب)
  const again = await hook(proEv);
  assert.equal(again.code, 200, JSON.stringify(again.body));
  assert.equal(net.subs.sub_omar_max.status, 'active', 'كان: الإعادة تلغي Max فلا اشتراك يتجدّد');
  assert.equal(callsTo(/\/v1\/subscriptions\/sub_omar_max$/, 'DELETE').length, 0, 'لا محاولة إلغاء للأحدث');
  assert.equal(pts('omar'), 70 + 920 + 3200, 'ولا منح ثانٍ');
  let u = await user('omar');
  assert.deepEqual([u.plan, u.planPayId], ['max', 'cs_omar_max']);
  // أوّل وصول لحدث Pro بعد حدث Max: يُمنح مرّة (نقاطه، وMax باقية) ولا يلغي Max
  await fresh('omar2');
  sub('sub_omar2_pro', 'omar2', 'pro', 'active');
  sub('sub_omar2_max', 'omar2', 'max', 'active');
  assert.equal((await hook(subSession('cs_omar2_max', 'omar2', 'max', 10000, 'sub_omar2_max'))).code, 200);
  assert.equal(net.subs.sub_omar2_pro.status, 'canceled');
  assert.equal((await hook(subSession('cs_omar2_pro', 'omar2', 'pro', 2000, 'sub_omar2_pro'))).code, 200);
  assert.equal(net.subs.sub_omar2_max.status, 'active', 'كان: حدث Pro المتأخّر يلغي Max');
  u = await user('omar2');
  assert.deepEqual([u.plan, u.planPayId], ['max', 'cs_omar2_max']);
  assert.equal(pts('omar2'), 70 + 3200 + 920);
});

test('srv-money-3 ٦. العودة لجلسة Pro القديمة خلال ٧٢ ساعة بعد الترقية (ATK1b): 200 «سبق المنح» وMax لا يُلغى', async () => {
  await fresh('lina');
  sub('sub_lina_pro', 'lina', 'pro', 'active');
  net.sessions.cs_lina_pro = { id: 'cs_lina_pro', payment_status: 'paid', mode: 'subscription', subscription: 'sub_lina_pro', invoice: 'in_cs_lina_pro', amount_total: 2000, currency: 'usd', created: nowSec() - 3600, metadata: { username: 'lina', plan: 'pro' } };
  assert.equal((await stripe('verify-checkout', { session_id: 'cs_lina_pro', token: tok('lina') })).code, 200);
  sub('sub_lina_max', 'lina', 'max', 'active');
  assert.equal((await hook(subSession('cs_lina_max', 'lina', 'max', 10000, 'sub_lina_max'))).code, 200);
  assert.equal(net.subs.sub_lina_pro.status, 'canceled', 'الترقية تلغي القديم');
  const v = await stripe('verify-checkout', { session_id: 'cs_lina_pro', token: tok('lina') });
  assert.equal(v.code, 200, JSON.stringify(v.body));
  assert.equal(v.body.alreadyGranted, true);
  assert.equal(net.subs.sub_lina_max.status, 'active', 'كان: العودة للجلسة القديمة تلغي Max');
  assert.equal(pts('lina'), 70 + 920 + 3200);
  assert.equal((await user('lina')).plan, 'max');
});

test('srv-money-3 ٧. تبويبان دفعا Pro ثمّ Max (ATK2): الأحدث وحده يبقى في كلّ ترتيب وصول وفي التزامن — لا يلغي كلٌّ منهما الآخر؛ والبحث المتأخّر عن الكتابة لا يمنع إلغاء الأقدم', async () => {
  const run = async (u, order) => {
    await fresh(u);
    sub('sub_' + u + '_pro', u, 'pro', 'active');
    sub('sub_' + u + '_max', u, 'max', 'active'); // دُفع ثانيًا فأُنشئ بعده
    const evs = { pro: subSession('cs_' + u + '_pro', u, 'pro', 2000, 'sub_' + u + '_pro'), max: subSession('cs_' + u + '_max', u, 'max', 10000, 'sub_' + u + '_max') };
    if (order === 'both') assert.deepEqual((await Promise.all([hook(evs.pro), hook(evs.max), hook(evs.pro)])).map((r) => r.code), [200, 200, 200]);
    else for (const k of order) assert.equal((await hook(evs[k])).code, 200, u + ' ' + k);
    assert.deepEqual([net.subs['sub_' + u + '_pro'].status, net.subs['sub_' + u + '_max'].status], ['canceled', 'active'], u + ': كان الاثنان يُلغيان فلا اشتراك يتجدّد');
    assert.equal(pts(u), 70 + 920 + 3200, u + ': كلّ دفعة مرّة');
    assert.equal((await user(u)).plan, 'max', u);
  };
  await run('tabs1', ['pro', 'max']);
  await run('tabs2', ['max', 'pro']);
  await run('tabs3', 'both');
  // البحث لا يرى الاشتراك الجديد بعد: يُقرأ برقمه فيُلغى الأقدم كما يجب (لا يُترك خصمان شهريّان)
  await fresh('lag');
  sub('sub_lag_pro', 'lag', 'pro', 'active');
  sub('sub_lag_max', 'lag', 'max', 'active');
  net.searchLag.add('sub_lag_max');
  assert.equal((await hook(subSession('cs_lag_max', 'lag', 'max', 10000, 'sub_lag_max'))).code, 200);
  net.searchLag.delete('sub_lag_max');
  assert.deepEqual([net.subs.sub_lag_pro.status, net.subs.sub_lag_max.status], ['canceled', 'active']);
});

// ───────────────────────── srv-money-4: الأدنى لا يُسقط الأعلى السارية ─────────────────────────

test('srv-money-4 ١. قبل الدفع: Plus/Pro فوق Max سارية ← 409 lower_plan بلا جلسة دفع في البطاقة وApple/Google Pay وPayPal؛ والترقية والباقة نفسها والرزم والمنتهية تمرّ', async () => {
  await fresh('maxi', { plan: 'max', planUpdatedAt: Date.now() - 4 * DAY, planPayId: 'cs_maxi' });
  for (const plan of ['basic', 'pro']) {
    const before = callsTo(/checkout\/sessions$/, 'POST').length;
    const r = await stripe('', { plan, token: tok('maxi'), autoRenew: true });
    assert.equal(r.code, 409, plan + ' ' + JSON.stringify(r.body));
    assert.equal(r.body.code, 'lower_plan');
    assert.ok(Number(r.body.until) > Date.now(), 'حتّى متى تسري الأعلى');
    assert.equal(callsTo(/checkout\/sessions$/, 'POST').length, before, 'لا جلسة دفع');
  }
  const pi = await stripe('create-payment-intent', { plan: 'basic', token: tok('maxi') });
  assert.deepEqual([pi.code, pi.body.code], [409, 'lower_plan']);
  assert.equal(callsTo(/payment_intents$/, 'POST').length, 0);
  const po = await pp({ action: 'create', plan: 'pro', token: tok('maxi') });
  assert.deepEqual([po.code, po.body.code], [409, 'lower_plan']);
  assert.equal(callsTo(/\/v2\/checkout\/orders$/, 'POST').length, 0, 'لا طلب PayPal');
  for (const plan of ['max', 'pack100']) assert.equal((await stripe('', { plan, token: tok('maxi') })).code, 200, plan);
  await fresh('oldmax', { plan: 'max', planUpdatedAt: Date.now() - 40 * DAY });
  assert.equal((await stripe('', { plan: 'basic', token: tok('oldmax') })).code, 200, 'Max منتهية: Plus تُشترى');
  await fresh('plus1', { plan: 'basic', planUpdatedAt: Date.now() - DAY });
  assert.equal((await stripe('', { plan: 'pro', token: tok('plus1') })).code, 200, 'الترقية كما كانت');
  assert.equal((await pp({ action: 'create', plan: 'max', token: tok('plus1') })).code, 200);
});

test('srv-money-4 ٢. دفعة أدنى وصلت والأعلى سارية (جلسة قديمة، طلب PayPal من المتصفّح، تجديد اشتراك قديم): Max تبقى بتاريخها ودفعتها، ونقاط الأدنى تُضاف مرّة وفترتها تُحفظ بعد Max، واستردادها يسحب نقاطها وفترتها', async () => {
  const at = Date.now() - 4 * DAY;
  await fresh('salem', { plan: 'max', planUpdatedAt: at, planPayId: 'cs_salem_max' });
  const r = await hook(paidSession('cs_salem_plus', 'salem', 'basic', 1000));
  assert.equal(r.code, 200);
  let u = await user('salem');
  assert.deepEqual([u.plan, u.planUpdatedAt, u.planPayId], ['max', at, 'cs_salem_max'], 'كان plan=basic وسقفه ٢٥٠ ← ٥٠ فورًا');
  assert.equal(pts('salem'), 70 + 360);
  assert.equal((await hook(paidSession('cs_salem_plus', 'salem', 'basic', 1000))).code, 200);
  assert.equal(pts('salem'), 70 + 360, 'إعادة الحدث لا تضاعف');
  assert.equal((u.planNext || []).length, 1, 'فترة Plus محفوظة بعد Max (كانت تُرمى)');
  assert.deepEqual([u.planNext[0].plan, u.planNext[0].payId], ['basic', 'cs_salem_plus']);
  assert.equal(((await user('salem')).planNext || []).length, 1, 'إعادة الحدث لا تضيف فترة ثانية');
  const rec = JSON.parse(store.get('payrec:cs_salem_plus'));
  assert.deepEqual([rec.plan, rec.points, rec.at, rec.prev], ['basic', 360, u.planNext[0].at, null], 'سجلّ المنح: نقاطها وفترتها في planNext');
  // الاسترداد الكامل لدفعة Plus: نقاطها وحدها، وMax باقية
  const refund = await hook(evt('charge.refunded', { id: 'ch_salem_plus', object: 'charge', payment_intent: 'pi_cs_salem_plus', amount: 1000, amount_refunded: 1000, refunded: true, currency: 'usd', created: nowSec() }));
  assert.equal(refund.code, 200, JSON.stringify(refund.body));
  u = await user('salem');
  assert.deepEqual([u.plan, u.planPayId], ['max', 'cs_salem_max']);
  assert.equal(pts('salem'), 70, 'لا منتج بعد استرداد ثمنه');
  assert.equal(u.planNext, undefined, 'فترة Plus المستردّة لا تسري بعد Max');
  assert.equal(tier.chatPeriod(u, at + 36 * DAY), null);
  // PayPal يُلتقط في المتصفّح بطلب لم يمرّ بـcreate
  await fresh('sama', { plan: 'max', planUpdatedAt: at, planPayId: 'cs_sama_max' });
  net.orders.PP_sama = { id: 'PP_sama', status: 'COMPLETED', purchase_units: [{ reference_id: 'sama', custom_id: 'pro', payments: { captures: [{ id: 'CAP_sama', status: 'COMPLETED', amount: { value: '20.00', currency_code: 'USD' }, custom_id: 'pro' }] } }] };
  const cap = await pp({ action: 'capture', orderId: 'PP_sama', token: tok('sama') });
  assert.equal(cap.body.credited, true, JSON.stringify(cap.body));
  assert.equal((await user('sama')).plan, 'max');
  assert.equal(pts('sama'), 70 + 920);
});

test('srv-money-4 ٣. التقلّب: تجديد اشتراك Pro قديم بعد شراء Max لا ينزل بالمشترك إلى Pro (نقاطه تصل)، وبعد انتهاء Max يعود التجديد كما كان', async () => {
  const at = Date.now() - 2 * DAY;
  await fresh('ziad', { plan: 'max', planUpdatedAt: at, planPayId: 'cs_ziad_max' });
  assert.equal((await hook(renewal('in_ziad_pro1', 'ziad', 'pro', 2000, 'sub_ziad_pro'))).code, 200);
  let u = await user('ziad');
  assert.deepEqual([u.plan, u.planUpdatedAt], ['max', at], 'كان: تجديد Pro القديم يكتب plan=pro');
  assert.equal(pts('ziad'), 70 + 920);
  // Max انتهت نافذتها: التجديد يمنح باقته كالمعتاد
  u.planUpdatedAt = Date.now() - 40 * DAY;
  await auth.putUser('ziad', u);
  assert.equal((await hook(renewal('in_ziad_pro2', 'ziad', 'pro', 2000, 'sub_ziad_pro'))).code, 200);
  u = await user('ziad');
  assert.deepEqual([u.plan, u.planPayId], ['pro', 'in_ziad_pro2']);
});

test('srv-money-4 ٤. الوسائط: باقة أدنى فوق أعلى سارية برصيد ← 409 (كانت تصفّر ١٢٥٠٠ إلى ١٢٥٠)؛ الأعلى الفارغة والباقة نفسها والأعلى تمرّ، ومها كذلك', async () => {
  const m = (plan, ago) => ({ plan, at: Date.now() - ago * DAY });
  await fresh('mira', { media: { mix: m('media_max', 3), maha: m('maha_pro', 3) } });
  store.set('media:mix:mira', '5000');
  store.set('media:maha:mira', '900');
  for (const plan of ['media_basic', 'media_pro', 'maha_basic']) {
    const r = await stripe('', { plan, token: tok('mira') });
    assert.deepEqual([r.code, r.body.code], [409, 'lower_plan'], plan);
  }
  assert.equal((await stripe('create-payment-intent', { plan: 'media_basic', token: tok('mira') })).code, 409);
  assert.equal((await pp({ action: 'create', plan: 'media_pro', token: tok('mira') })).code, 409);
  for (const plan of ['media_max', 'maha_pro', 'maha_max', 'basic']) assert.equal((await stripe('', { plan, token: tok('mira') })).code, 200, plan);
  store.set('media:mix:mira', '0');
  assert.equal((await stripe('', { plan: 'media_basic', token: tok('mira') })).code, 200, 'الأعلى فارغة: لا شيء يُخسر');
  assert.equal(Number(store.get('media:mix:mira')), 0, 'الفحص لا يكتب شيئًا');
});

test('srv-money-4 ٦. ثوابت المال للمنح تحت الأعلى: دفعتان أدنى متزامنتان مع إعادتهما = كلّ واحدة مرّة، وإعادة حدث الاسترداد لا تسحب ثانية', async () => {
  const at = Date.now() - DAY;
  await fresh('kareem', { plan: 'max', planUpdatedAt: at, planPayId: 'cs_kareem_max' });
  const a = paidSession('cs_kareem_b', 'kareem', 'basic', 1000);
  const b = paidSession('cs_kareem_p', 'kareem', 'pro', 2000);
  const rs = await Promise.all([hook(a), hook(b), hook(a), hook(b)]);
  assert.deepEqual(rs.map((r) => r.code), [200, 200, 200, 200]);
  assert.equal(pts('kareem'), 70 + 360 + 920, 'كلّ دفعة مرّة');
  const u = await user('kareem');
  assert.deepEqual([u.plan, u.planUpdatedAt, u.planPayId], ['max', at, 'cs_kareem_max']);
  const ref = evt('charge.refunded', { id: 'ch_kareem_p', object: 'charge', payment_intent: 'pi_cs_kareem_p', amount: 2000, amount_refunded: 2000, refunded: true, currency: 'usd', created: nowSec() });
  assert.equal((await hook(ref)).code, 200);
  assert.equal((await hook(ref)).code, 200);
  assert.equal(pts('kareem'), 70 + 360, 'سحب نقاط Pro مرّة واحدة');
  assert.equal((await user('kareem')).plan, 'max');
});

// المراجعة المعاكسة: فترة الأدنى «المحفوظة» كانت تُرمى — فحين تنتهي الأعلى يسقط إلى المجّانيّ وهو يدفع الأدنى
const tierAt = async (u, now) => { const x = await tier.resolveTier(u, { now, noCache: true }); return [x.tier, x.plan, x.cap]; };

test('srv-money-4 ٧. جلسة اشتراك Plus قديمة دُفعت وMax سارية باشتراكها (ATK3): Plus الأحدث وحده يتجدّد، وMax تكمل أيّامها ثمّ تسري فترة Plus المدفوعة بلا يوم مجّانيّ', async () => {
  const at = Date.now() - 3 * DAY;
  await fresh('yara', { plan: 'max', planUpdatedAt: at, planPayId: 'cs_yara_max' });
  sub('sub_yara_max', 'yara', 'max', 'active');
  sub('sub_yara_plus', 'yara', 'basic', 'active'); // جلسة فُتحت قبل Max ودُفعت الآن
  assert.equal((await hook(subSession('cs_yara_plus', 'yara', 'basic', 1000, 'sub_yara_plus'))).code, 200);
  const u = await user('yara');
  assert.deepEqual([u.plan, u.planUpdatedAt, u.planPayId], ['max', at, 'cs_yara_max'], 'Max لا تسقط');
  assert.deepEqual([net.subs.sub_yara_max.status, net.subs.sub_yara_plus.status], ['canceled', 'active'], 'لا خصمان شهريّان: الأحدث يبقى');
  assert.equal(pts('yara'), 70 + 360);
  assert.deepEqual(await tierAt('yara', at + 34 * DAY), ['sub', 'max', 250]);
  assert.deepEqual(await tierAt('yara', at + 36 * DAY), ['sub', 'basic', 50], 'كان: مجّانيّ حتّى تجديد Plus وهو يدفعه');
});

test('srv-money-4 ٨. مشترك Plus بالبطاقة يرقّي لمرّة إلى Max بـApple/Google Pay أو PayPal ثمّ يصل تجديد Plus وMax سارية (ATK10): Max تكمل أيّامها ثمّ يبقى مشتركًا Plus بفترة ذلك التجديد لا مجّانيًّا وهو يدفع؛ والتجديد التالي واسترداده وتغيير الاسم كالمعتاد', async () => {
  for (const via of ['wallet', 'paypal']) {
    const u0 = 'pl' + via;
    await fresh(u0, { plan: 'basic', planUpdatedAt: Date.now() - 20 * DAY, planPayId: 'in_' + u0 + '_0' });
    sub('sub_' + u0, u0, 'basic', 'active');
    if (via === 'wallet') {
      net.pis['pi_' + u0] = { id: 'pi_' + u0, object: 'payment_intent', status: 'succeeded', amount: 10000, amount_received: 10000, currency: 'usd', created: nowSec(), latest_charge: 'ch_' + u0, metadata: { username: u0, plan: 'max' } };
      const v = await stripe('verify-payment-intent', { payment_intent_id: 'pi_' + u0, token: tok(u0) });
      assert.equal(v.code, 200, JSON.stringify(v.body));
    } else {
      net.orders['PP_' + u0] = { id: 'PP_' + u0, status: 'COMPLETED', create_time: new Date().toISOString(), purchase_units: [{ reference_id: u0, custom_id: 'max', payments: { captures: [{ id: 'CAP_' + u0, status: 'COMPLETED', amount: { value: '100.00', currency_code: 'USD' }, custom_id: 'max' }] } }] };
      const c = await pp({ action: 'capture', orderId: 'PP_' + u0, token: tok(u0) });
      assert.equal(c.body.credited, true, JSON.stringify(c.body));
    }
    let u = await user(u0);
    assert.equal(u.plan, 'max', via);
    assert.equal(net.subs['sub_' + u0].status, 'active', 'الشراء لمرّة لا يلغي اشتراك Plus');
    // Max اشتُريت قبل ١٠ أيّام، وتجديد Plus الشهريّ يصل اليوم وهي سارية (ويُعاد)
    const maxAt = Date.now() - 10 * DAY;
    u.planUpdatedAt = maxAt;
    await auth.putUser(u0, u);
    const ren = renewal('in_' + u0 + '_1', u0, 'basic', 1000, 'sub_' + u0);
    assert.deepEqual((await Promise.all([hook(ren), hook(ren)])).map((r) => r.code), [200, 200]);
    u = await user(u0);
    assert.deepEqual([u.plan, u.planUpdatedAt], ['max', maxAt], 'Max تكمل أيّامها المدفوعة');
    assert.equal(pts(u0), 70 + 3200 + 360, 'نقاط التجديد مرّة');
    const maxEnds = maxAt + 35 * DAY;
    assert.deepEqual(await tierAt(u0, maxEnds - DAY), ['sub', 'max', 250]);
    assert.deepEqual(await tierAt(u0, maxEnds + DAY), ['sub', 'basic', 50], 'كان: مجّانيّ حتّى تجديد Plus التالي (~٣٠ يومًا) وهو يدفع Plus');
    assert.deepEqual(await tierAt(u0, Date.now() + 36 * DAY), ['free', null, 20], 'فترة التجديد ٣٥ يومًا من وصوله لا أكثر');
    assert.deepEqual(points.subsOf(await user(u0), maxEnds + DAY).filter((s) => s.kind === 'chat').map((s) => [s.plan, s.active]), [['basic', true]], 'لا «انتهى اشتراكك» وهو مشترك');
    assert.equal((await planVideos.planVideoStatus(u0, { now: maxEnds + DAY })).total, 1, 'فيديو Plus لفترة التجديد');

    if (via === 'paypal') {
      // تغيير الاسم ينقل عدّاد فيديوهات فترة التجديد المحفوظة أيضًا (كان يبدأ صفرًا بالاسم الجديد)
      const at1 = u.planNext[0].at;
      store.set('planvid:' + u0 + ':' + at1, '1');
      const r = await call(auth, { body: { action: 'changeUsername', token: tok(u0), newUsername: u0 + 'x' } });
      assert.equal(r.code, 200, JSON.stringify(r.body));
      assert.equal(store.get('planvid:' + u0 + 'x:' + at1), '1', 'لا فيديو باقة جديد بالاسم الجديد');
      assert.equal(store.has('planvid:' + u0 + ':' + at1), false);
      continue;
    }
    // التجديد التالي بعد انتهاء Max يفتح فترة Plus رئيسيّة، وفترة التجديد السابق (المدفوعة) هي ما يعود إن استُردّ الجديد
    const nextAt = Date.now() - 30 * DAY;
    u.planUpdatedAt = Date.now() - 36 * DAY;
    u.planNext[0].at = nextAt;
    await auth.putUser(u0, u);
    assert.equal((await hook(renewal('in_' + u0 + '_2', u0, 'basic', 1000, 'sub_' + u0))).code, 200);
    u = await user(u0);
    assert.deepEqual([u.plan, u.planPayId, u.planNext], ['basic', 'in_' + u0 + '_2', undefined], 'الفترة المحفوظة صارت سابقة الجديدة');
    const ref = evt('charge.refunded', { id: 'ch_' + u0 + '_2', object: 'charge', payment_intent: 'pi_in_' + u0 + '_2', amount: 1000, amount_refunded: 1000, refunded: true, currency: 'usd', created: nowSec() });
    assert.equal((await hook(ref)).code, 200);
    assert.equal((await hook(ref)).code, 200, 'إعادة حدث الاسترداد');
    u = await user(u0);
    assert.deepEqual([u.plan, u.planUpdatedAt, u.planPayId], ['basic', nextAt, 'in_' + u0 + '_1'], 'تعود فترة التجديد السابق المدفوعة');
    assert.equal(pts(u0), 70 + 3200 + 360, 'نقاط التجديد المستردّ سُحبت مرّة');
  }
});

test('srv-money-5 ٤. حدث الحساب المحذوف يصل مرّتين معًا: تنبيه واحد وإلغاء فعّال واحد، وكلاهما 200', async () => {
  await auth.putUser('ghost2', { deleted: true, deletedAt: Date.now(), selfDeleted: true });
  sub('sub_ghost3', 'ghost2', 'basic', 'active');
  const before = alerts.length;
  const ev = renewal('in_ghost2_1', 'ghost2', 'basic', 1000, 'sub_ghost3');
  const rs = await Promise.all([hook(ev), hook(ev)]);
  assert.deepEqual(rs.map((r) => r.code), [200, 200]);
  assert.equal(alerts.length, before + 1);
  assert.equal(net.subs.sub_ghost3.status, 'canceled');
});

// ── أجزاء الواجهة (app-06) في Function: النصّ من الملفّ نفسه ──
const A6 = read('js/app-06-checkout.js');
function slice(src, from, to) { const a = src.indexOf(from); const b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); }
function el(id) { return { id, style: {}, dataset: {}, textContent: '', parentElement: null, querySelector: () => null, children: [], appendChild(c) { c.parentElement = this; this.children.push(c); } }; }

function checkoutUi(opts) {
  const o = opts || {};
  const els = { checkoutModalOverlay: el('checkoutModalOverlay'), checkoutPlanLabel: el('checkoutPlanLabel'), checkoutStatusMsg: el('checkoutStatusMsg') };
  const body = el('body');
  const document = { body, getElementById: (id) => els[id] || null };
  const window = Object.assign({ location: { origin: 'https://o.test', href: '' } }, o.window || {});
  const toasts = [], fetched = [];
  const fetch = async (url, init) => { fetched.push({ url, body: init && init.body }); const r = (o.replies || {})[String(url).split('?action=')[1]] || { status: 200, body: {} }; return { ok: r.status < 300, status: r.status, json: async () => r.body }; };
  // openCheckout حتّى البطاقة: يشمل closeCheckout وفحص الباقة الأدنى بعده (كما يقطعه checkout-back)
  const src = slice(A6, 'function openCheckout(plan){', 'async function startStripeCheckout(){')
    + slice(A6, 'async function startStripeCheckout(){', 'window.startStripeCheckout = startStripeCheckout;')
    + slice(A6, 'async function handleWalletPaymentMethod(', 'function showWalletUnavailableMsg(){')
    + slice(A6, 'async function loadPaypalButtons(){', 'async function startPaypalCheckout(){');
  const names = ['authGet', 'document', 'window', 'settingsToast', 't', 'omranIOSStoreApp', 'checkoutCurrency', 'checkoutPriceText', 'PACK_POINTS', 'navigator',
    'setupWalletPaymentRequest', 'fetch', 'autoRenewPref', 'localStorage', '__swallow', 'ensureStripeJs', 'refreshPointsWallet', 'paypalClaim', 'showSettingsPage'];
  const vals = [() => 'tok', document, window, (m) => toasts.push(m), (k) => k, () => false, () => 'usd', () => '$10', { pack100: 100 }, { userAgent: 'x', platform: 'x' },
    async () => {}, fetch, () => false, { setItem() {}, getItem: () => null, removeItem() {} }, () => {}, async () => ({}), () => {}, async () => 'retry', () => {}];
  // eslint-disable-next-line no-new-func
  const api = new Function(...names, 'let checkoutCurrentPlan = null; let paypalSdkLoaded = true; let paypalLoadSeq = 0; /* v-lock-ckui (cli-money-11) */\n' + src
    + '\nreturn { openCheckout, startStripeCheckout, handleWalletPaymentMethod, loadPaypalButtons, setPlan: (p) => { checkoutCurrentPlan = p; } };')(...vals);
  return Object.assign(api, { els, toasts, fetched, window });
}

test('srv-money-4 ٥. الواجهة: «اشترك الآن» على باقة أدنى من الحاليّة لا يفتح الدفع بل يقول لماذا (axLkSubsLowerPlan)، وردّ الخادم lower_plan يُترجم في البطاقة والمحفظة وPayPal', async () => {
  let ui = checkoutUi({ window: { __omranPlan: 'max' } });
  ui.openCheckout('basic');
  assert.notEqual(ui.els.checkoutModalOverlay.style.display, 'flex', 'كان يفتح نافذة دفع تُسقط Max');
  assert.deepEqual(ui.toasts, ['axLkSubsLowerPlan']);
  // من داخل الإعدادات (نافذة showModal): التوست يُرسم تحتها فلا يُرى — السبب في سطر «لماذا» داخل قسم الباقات
  const why = [];
  ui = checkoutUi({ window: { __omranPlan: 'pro', __omranPlansGate: { showWhy: (s) => why.push(s) } } });
  ui.els.settingsDialog = Object.assign(el('settingsDialog'), { open: true });
  ui.openCheckout('basic');
  assert.deepEqual([why, ui.toasts, ui.els.checkoutModalOverlay.style.display], [['axLkSubsLowerPlan'], [], undefined]);
  for (const p of ['max', 'pack100', 'maha_basic']) { ui = checkoutUi({ window: { __omranPlan: 'max' } }); ui.openCheckout(p); assert.equal(ui.els.checkoutModalOverlay.style.display, 'flex', p); }
  ui = checkoutUi({ window: { __omranPlan: 'basic' } }); ui.openCheckout('pro'); assert.equal(ui.els.checkoutModalOverlay.style.display, 'flex', 'الترقية');
  ui = checkoutUi({ window: { __omranPlan: 'max', __omranMediaStatus: { mix: { plan: 'media_max', left: 100 } } } });
  ui.openCheckout('media_basic');
  assert.notEqual(ui.els.checkoutModalOverlay.style.display, 'flex', 'رصيد «صور وفيديو» الأعلى كان سيُصفَّر');
  ui = checkoutUi({ window: { __omranMediaStatus: { mix: { plan: 'media_max', left: 0 } } } });
  ui.openCheckout('media_basic');
  assert.equal(ui.els.checkoutModalOverlay.style.display, 'flex', 'الأعلى فارغة');
  // ردّ الخادم (الواجهة لم تعرف الباقة بعد): رمز ثابت ← نصّ مترجم، لا نصّ الخادم الخامّ
  const lower = { status: 409, body: { code: 'lower_plan', error: 'RAW SERVER TEXT' } };
  ui = checkoutUi({ replies: { 'create-checkout-session': lower } });
  ui.setPlan('basic');
  await ui.startStripeCheckout();
  assert.equal(ui.els.checkoutStatusMsg.textContent, 'axLkSubsLowerPlan');
  ui = checkoutUi({ replies: { 'create-payment-intent': lower } });
  const ev = { done: null, complete(s) { this.done = s; }, paymentMethod: { id: 'pm' } };
  await ui.handleWalletPaymentMethod(ev, 'basic', 'usd');
  assert.deepEqual([ev.done, ui.els.checkoutStatusMsg.textContent], ['fail', 'axLkSubsLowerPlan']);
  let cfg = null;
  ui = checkoutUi({ window: { paypal: { Buttons: (c) => { cfg = c; return { render() {} }; } } }, replies: { 'paypal-client-id': { status: 200, body: { configured: true, clientId: 'c' } }, 'paypal-order': lower } });
  ui.els.paypalButtonContainer = el('paypalButtonContainer');
  await ui.loadPaypalButtons();
  assert.ok(cfg, 'أزرار PayPal');
  await cfg.createOrder().then(() => assert.fail('createOrder يرمي'), () => {});
  cfg.onError();
  assert.equal(ui.els.checkoutStatusMsg.textContent, 'axLkSubsLowerPlan');
  // ومعرفة رصيد الوسائط تأتي من ردّ الرصيد نفسه
  assert.match(slice(A6, 'async function refreshPointsWallet(){', 'window.refreshPointsWallet = refreshPointsWallet;'), /window\.__omranMediaStatus = d\.media \|\| \{\};/);
});

// ───────────────────────── srv-money-5: past_due والحذف والدفعة اليتيمة ─────────────────────────

test('srv-money-5 ١. إيقاف التجديد يرى past_due وunpaid: يُلغيان فورًا (لا يُعاد سحب فترة لم تُدفع)، والنشط عند نهاية الشهر المدفوع، والملغى لا يُمسّ، والحالة تعدّها', async () => {
  await fresh('tala');
  sub('sub_tala_a', 'tala', 'pro', 'active');
  sub('sub_tala_b', 'tala', 'media_max', 'past_due');
  sub('sub_tala_c', 'tala', 'basic', 'canceled');
  sub('sub_tala_d', 'tala', 'maha_pro', 'unpaid');
  const st = mkRes();
  await checkout.autoRenewToggle({ body: { token: tok('tala') } }, st);
  assert.equal(st.code, 200);
  assert.equal(st.body.subs, 3, 'past_due وunpaid من اشتراكاته (كان ٠ لهما فيبدو الزرّ مطفأً)');
  assert.equal(st.body.on, true);
  const off = mkRes();
  await checkout.autoRenewToggle({ body: { token: tok('tala'), on: false } }, off);
  assert.equal(off.code, 200, JSON.stringify(off.body));
  assert.equal(net.subs.sub_tala_a.cancel_at_period_end, true);
  assert.equal(net.subs.sub_tala_a.status, 'active', 'النشط يكمل شهره المدفوع');
  assert.deepEqual([net.subs.sub_tala_b.status, net.subs.sub_tala_d.status], ['canceled', 'canceled']);
  assert.ok(!callsTo(/sub_tala_c$/).length, 'الملغى لا يُلمس');
  assert.equal(off.body.periodEnd, net.subs.sub_tala_a.items.data[0].current_period_end, 'نهاية الشهر المدفوع من النشط وحده');
});

test('srv-money-5 ٢. حذف الحساب يلغي كلّ اشتراكاته فورًا (نشطًا وpast_due) قبل المحو، وتعذّر الإلغاء = لا حذف', async () => {
  const o = { kv: kvImpl, auth: { getUser: auth.getUser, putUser: auth.putUser }, now: Date.now() };
  await fresh('dana', { email: 'dana@x.test', googleAuth: true });
  sub('sub_dana_a', 'dana', 'max', 'active');
  sub('sub_dana_b', 'dana', 'maha_basic', 'past_due');
  net.failDelete = 1;
  let r = await deleteAccount({ username: 'dana', token: tok('dana'), confirmUsername: 'dana' }, o);
  assert.deepEqual([r.status, r.body.code], [502, 'billing']);
  assert.ok(!(await user('dana')).deleted, 'لم يُحذف شيء');
  assert.ok(store.has('points:dana'));
  r = await deleteAccount({ username: 'dana', token: tok('dana'), confirmUsername: 'dana' }, o);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([net.subs.sub_dana_a.status, net.subs.sub_dana_b.status], ['canceled', 'canceled'], 'كان past_due يُسحب بعد الحذف بلا منح');
  assert.ok(!callsTo(/sub_dana_a$/, 'POST').length, 'إلغاء فوريّ لا cancel_at_period_end');
  assert.equal((await user('dana')).deleted, true);
});

test('srv-money-5 ٣. تجديد أو جلسة مدفوعة لحساب محذوف: تنبيه للمالك مرّة واحدة ليردّ المبلغ، وإلغاء الاشتراك فورًا؛ تعذّر الإلغاء = 500 فيُعاد', async () => {
  await auth.putUser('ghost', { deleted: true, deletedAt: Date.now(), selfDeleted: true });
  sub('sub_ghost', 'ghost', 'pro', 'past_due');
  const before = alerts.length;
  net.failDelete = 1;
  const ev = renewal('in_ghost_1', 'ghost', 'pro', 2000, 'sub_ghost');
  const r1 = await hook(ev);
  assert.equal(r1.code, 500, 'الاشتراك ما زال حيًّا — يُعاد الحدث');
  assert.equal(alerts.length, before + 1, 'تنبيه المالك');
  assert.match(alerts[alerts.length - 1].title + ' ' + alerts[alerts.length - 1].body, /ghost/);
  assert.match(alerts[alerts.length - 1].body, /in_ghost_1/);
  const r2 = await hook(ev);
  assert.equal(r2.code, 200);
  assert.equal(net.subs.sub_ghost.status, 'canceled');
  assert.equal(alerts.length, before + 1, 'الإعادة لا تنبّه ثانية');
  assert.equal(store.has('points:ghost'), false, 'لا منح لحساب محذوف');
  // جلسة اشتراك اكتملت بعد الحذف
  sub('sub_ghost2', 'ghost', 'max', 'active');
  const r3 = await hook(subSession('cs_ghost_max', 'ghost', 'max', 10000, 'sub_ghost2'));
  assert.equal(r3.code, 200);
  assert.equal(net.subs.sub_ghost2.status, 'canceled');
  assert.equal(alerts.length, before + 2);
});

// ───────────────────────── cli-money-10: نصّ زرّ التجديد ─────────────────────────

function renewUi(pref, reply) {
  const els = { chkAutoRenew: Object.assign(el('chkAutoRenew'), { checked: false, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } }), autoRenewHint: el('autoRenewHint') };
  const ls = new Map([['aiapp_autorenew', pref]]);
  const ctx = {
    document: { getElementById: (id) => els[id] || null }, localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) },
    t: (k) => k, authGet: () => 'tok', __swallow: () => {}, settingsToast: () => {}, lang: 'ar', Date,
    fetch: async () => ({ ok: true, status: 200, json: async () => reply }),
  };
  vm.createContext(ctx);
  vm.runInContext(A6.slice(A6.indexOf('function autoRenewPref(){')) + '\nthis.syncAutoRenewUI = syncAutoRenewUI;', ctx);
  return { ctx, els, ls };
}

test('cli-money-10 ١. التفضيل «مفعّل» ولا اشتراك متجدّد (اشترى بغير البطاقة): النصّ يقول إنّ التجديد للشراء القادم بالبطاقة لا «يتجدّد اشتراكك»', async () => {
  let u = renewUi('1', { ok: true, subs: 0, on: false, periodEnd: 0 });
  await u.ctx.syncAutoRenewUI();
  assert.equal(u.els.chkAutoRenew.checked, true, 'التفضيل للشراء القادم باقٍ');
  assert.equal(u.els.autoRenewHint.textContent, 'axLkSubsRenewCardOnly', 'كان autoRenewOnHint «يتجدّد اشتراكك» وهو لا يتجدّد');
  u = renewUi('1', { ok: true, subs: 1, on: true, periodEnd: 1 });
  await u.ctx.syncAutoRenewUI();
  assert.equal(u.els.autoRenewHint.textContent, 'autoRenewOnHint', 'اشتراك يتجدّد فعلًا');
  u = renewUi('0', { ok: true, subs: 0, on: false, periodEnd: 0 });
  await u.ctx.syncAutoRenewUI();
  assert.equal(u.els.autoRenewHint.textContent, 'autoRenewOffHint');
  // التفعيل باليد ولا اشتراك: النصّ نفسه
  u = renewUi('0', { ok: true, subs: 0, on: true, periodEnd: 0 });
  u.els.chkAutoRenew.checked = true;
  await u.els.chkAutoRenew.listeners.change();
  assert.equal(u.ls.get('aiapp_autorenew'), '1');
  assert.equal(u.els.autoRenewHint.textContent, 'axLkSubsRenewCardOnly');
});

// ───────────────────────── cli-money-6: شريط «ينتهي — جدّد» ورصيد الوسائط ─────────────────────────

function gate(reply) {
  const appended = [];
  const mk = (tag) => ({ tag, style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); }, remove() {} });
  const body = { appendChild: (c) => appended.push(c) };
  const ctx = {
    window: {}, document: { body, getElementById: (id) => appended.find((x) => x.id === id) || null, createElement: mk }, location: { href: 'https://o.test/', origin: 'https://o.test' }, URL,
    localStorage: { getItem: () => null, setItem: () => {} }, lang: 'ar', console, Date, Object, Array, String, Number, Promise, JSON, setTimeout,
    t: (k) => k, authGet: () => 'tok', __swallow: () => {},
  };
  ctx.window.fetch = async () => ({ status: 200, ok: true, clone() { return this; }, json: async () => reply || {} });
  vm.createContext(ctx);
  vm.runInContext(read('js/app-33-plans-gate.js'), ctx);
  return { g: ctx.window.__omranPlansGate, ctx, appended };
}
const flush = () => new Promise((r) => setTimeout(r, 5));

test('cli-money-6 ١. «قارب الانتهاء» لا يُعرض لمها و«صور وفيديو» ما دام في رصيدهما شيء (الشراء يعيد الملء فيضيع المتبقّي)، ويُعرض حين يفرغ؛ والمحادثة والمنتهي كما كانا', async () => {
  const now = Date.now();
  const soon = (kind, plan) => ({ kind, plan, endsAt: now + DAY, active: true });
  const pick = (subs, media) => { const n = gate().g.pickNotice(subs, now, media); return n && [n.s.kind, n.state]; };
  assert.equal(pick([soon('mix', 'media_max')], { mix: { plan: 'media_max', left: 500 } }), null, 'كان «جدّد» يصفّر ٥٠٠ فلس');
  assert.equal(pick([soon('maha', 'maha_max')], { maha: { plan: 'maha_max', left: 11000 } }), null, 'دقائق مها المتبقّية');
  assert.deepEqual(pick([soon('mix', 'media_max')], { mix: { plan: 'media_max', left: 0 } }), ['mix', 'expiring'], 'فارغ: لا خسارة');
  assert.deepEqual(pick([soon('chat', 'pro')], { mix: { left: 900 } }), ['chat', 'expiring'], 'نقاط المحادثة تُضاف لا تُستبدل');
  assert.deepEqual(pick([{ kind: 'mix', plan: 'media_max', endsAt: now - DAY, active: false }], { mix: { left: 0 } }), ['mix', 'expired']);
  assert.deepEqual(pick([soon('maha', 'maha_basic'), soon('chat', 'basic')], { maha: { left: 100 } }), ['chat', 'expiring']);
  assert.deepEqual(pick([soon('mix', 'media_basic')]), ['mix', 'expiring'], 'بلا معرفة الرصيد كما كان');
  // ردّ الرصيد نفسه يحمل الرصيد: لا شريط
  const now2 = Date.now();
  let G = gate({ ok: true, authed: true, subs: [{ kind: 'maha', plan: 'maha_max', endsAt: now2 + DAY, active: true }], media: { maha: { plan: 'maha_max', left: 2000 } } });
  await G.ctx.window.fetch('/api/points', { method: 'POST' });
  await flush();
  assert.equal(G.appended.filter((x) => x.id === 'plansNoticeBar').length, 0, 'لا دعوة لشراء يمحو الرصيد');
  G = gate({ ok: true, authed: true, subs: [{ kind: 'maha', plan: 'maha_max', endsAt: now2 + DAY, active: true }], media: { maha: { plan: 'maha_max', left: 0 } } });
  await G.ctx.window.fetch('/api/points', { method: 'POST' });
  await flush();
  assert.equal(G.appended.filter((x) => x.id === 'plansNoticeBar').length, 1, 'فارغ: الشريط كما كان');
});
