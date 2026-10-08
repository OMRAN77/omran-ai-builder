// tests/media-merge.test.cjs — v-media-merge (قرار المالك ٨ أكتوبر ٢٠٢٦، باب المال بموافقته على البندين وحدهما):
// «إذا دمجت الصور مع الفيديو باقة واحدة هل هذا رأي طيب» ← «هذي الأرقام كبيرة وكم فايدة المالك» ←
// «نعم اعتمد البديل ونفّذ الدمج وثاني شي شيل أرقام الفيديوات والصور في الباقات الثانية».
//
// (١) باقة «صور وفيديو» واحدة (media_*، خانة 'mix') بالأسعار نفسها ($10.21 · $20.42 · $102.11 / ٣٧٫٥ · ٧٥ · ٣٧٥ د.إ) ورصيد = ثلث
//     السعر بالدرهم (١٢٥٠ · ٢٥٠٠ · ١٢٥٠٠ فلس) يصرف منه أيّ صورة أو فيديو بتكلفته؛ img_/vid_ لا تُباع جديدةً، والقائم منها يُصرف أوّلًا
//     ويُجدَّد ويُمنح كما كان. (٢) بطاقات المجّانيّ وPlus وPro وMax بلا أعداد صور/فيديو (الاستحقاقات في الخادم كما هي).
//
// على المعالجات الحقيقيّة (auth.js بتغيير الاسم، create-checkout-session بجلسة Stripe وApple/Google Pay، api/webhook.js موقَّعًا،
// paypal-order، points، _mediaPlans، pay-refund) بـKV في الذاكرة وشبكة مزيّفة مثبّتة مرّة للملفّ كلّه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');

process.env.AUTH_SECRET = 'media-merge-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_media_merge_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_media_merge';
process.env.PAYPAL_CLIENT_ID = 'cid';
process.env.PAYPAL_SECRET = 'sec';
process.env.PAYPAL_MODE = 'sandbox';
delete process.env.PAYPAL_WEBHOOK_ID;

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// ── KV في الذاكرة (كـrename-move: auth.js الحقيقيّ يقرأ ويكتب السجلّ هنا) ──
const store = new Map();
const ttl = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v, t) => { store.set(k, String(v)); if (t) ttl.set(k, t); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); ttl.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'EXPIRE') { ttl.set(k, Number(a)); return 1; }
    if (op === 'DEL') { store.delete(k); return 1; }
    return null;
  }),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });
const alerts = [];
mock('api/_lib/_owner-alert.js', { pushToOwners: async (p) => { alerts.push(p); return { sent: 1 }; }, alertOwnerError: async () => ({}), alertOwnerCredit: async () => ({}), isCreditFailure: () => false });

// ── شبكة مزيّفة واحدة: Stripe (إنشاء الجلسة والعمليّة، والتحقّق) وPayPal (الرمز، الإنشاء، الالتقاط) ──
const net = { pi: {}, sessions: {}, orders: {}, calls: [], seq: 0 };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
global.fetch = async (url, init) => {
  const u = new URL(String(url));
  const method = (init && init.method) || 'GET';
  const body = init && init.body ? String(init.body) : '';
  net.calls.push({ url: String(url), method, body, headers: (init && init.headers) || {} });
  if (u.hostname === 'api.stripe.com') {
    const p = u.pathname.replace(/^\/v1\//, '');
    let m;
    if (method === 'POST' && p === 'checkout/sessions') return reply(200, { id: 'cs_new_' + (++net.seq), url: 'https://checkout.stripe.test/x' });
    if (method === 'POST' && p === 'payment_intents') return reply(200, { id: 'pi_new_' + (++net.seq), client_secret: 's' });
    if ((m = p.match(/^payment_intents\/(.+)$/))) return net.pi[m[1]] ? reply(200, net.pi[m[1]]) : reply(404, { error: { message: 'No such payment_intent' } });
    if ((m = p.match(/^checkout\/sessions\/(.+)$/))) return net.sessions[m[1]] ? reply(200, net.sessions[m[1]]) : reply(404, { error: { message: 'No such session' } });
    if (p === 'checkout/sessions') return reply(200, { data: [] });
    return reply(404, { error: { message: 'unknown' } });
  }
  if (/paypal\.com$/.test(u.hostname)) {
    if (u.pathname === '/v1/oauth2/token') return reply(200, { access_token: 'A' });
    if (method === 'POST' && u.pathname === '/v2/checkout/orders') return reply(201, { id: 'PP_' + (++net.seq) });
    const cm = u.pathname.match(/^\/v2\/payments\/captures\/([^/]+)$/); // مسار الاسترداد البديل (paypalLegacy)
    if (cm) { const c = (net.captures || {})[decodeURIComponent(cm[1])]; return c ? reply(200, c) : reply(404, { message: 'not found' }); }
    const m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
    if (m) { const o = net.orders[decodeURIComponent(m[1])]; return o ? reply(200, o) : reply(404, { message: 'not found' }); }
    return reply(404, { message: 'unknown' });
  }
  return reply(404, {});
};

const auth = require(rp('api/_lib/auth.js'));
const media = require(rp('api/_lib/_mediaPlans.js'));
const points = require(rp('api/_lib/points.js'));
const checkout = require(rp('api/_lib/create-checkout-session.js'));
const paypal = require(rp('api/_lib/paypal-order.js'));
const webhook = require(rp('api/webhook.js'));
const tier = require(rp('api/_lib/tier.js'));

const DAY = 86400000;
const nowSec = () => Math.floor(Date.now() / 1000);
const mkRes = () => ({ code: 200, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end(b) { if (b !== undefined) this.body = b; return this; } });
async function call(handler, req) { const res = mkRes(); await handler(Object.assign({ method: 'POST', headers: {}, query: {} }, req), res); return res; }
const stripe = (action, body) => call(checkout, { query: action ? { action } : {}, body });
const pp = (body) => call(paypal, { body });
const authCall = (body) => call(auth, { body });
const tok = (u) => auth.makeToken(u);
async function fresh(u, rec) { await auth.putUser(u, Object.assign({ username: u, points: 70, createdAt: Date.now() }, rec || {})); store.set('points:' + u, String((rec && rec.points) || 70)); }
const mixLeft = (u) => Number(store.get('media:mix:' + u));
const user = (u) => auth.getUser(u);
let evSeq = 0;
const evt = (type, object) => ({ id: 'evt_mm_' + (++evSeq), type, data: { object } });
const paidSession = (id, username, plan, pi, amount, extra) => evt('checkout.session.completed', Object.assign({ id, payment_status: 'paid', payment_intent: pi, amount_total: amount, currency: 'usd', created: nowSec(), metadata: { username, plan } }, extra || {}));
const refundOf = (chargeId, pi, amount, refunded) => evt('charge.refunded', { id: chargeId, object: 'charge', payment_intent: pi, amount, amount_refunded: refunded, refunded: refunded >= amount, currency: 'usd', created: nowSec() });
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
async function buy(u, plan, n, amount) { const r = await hook(paidSession('cs_' + n, u, plan, 'pi_' + n, amount)); assert.equal(r.code, 200, JSON.stringify(r.body)); }

// ───────────────────────── الخادم ─────────────────────────

test('١. الباقات الثلاث: بالأسعار نفسها، ورصيدها ثلث السعر بالدرهم، وأمثلتها ٥٠/١٢ · ١٠٠/٢٤ · ٥٠٠/١٢١، والهامش ≥ ٦٠٪ بعد رسوم الدفع', () => {
  const P = media.MEDIA_PLANS;
  const keys = ['media_basic', 'media_pro', 'media_max'];
  for (const k of keys) {
    assert.equal(P[k].media, 'mix', k);
    assert.ok(!P[k].retired, k + ' تُباع');
    assert.equal(checkout.PLANS[k].points, 0, k + ': بلا نقاط');
    assert.equal(checkout.PLANS[k].media, 'mix');
    assert.equal(P[k].budget * 3, checkout.priceFor(k, 'aed').amount, k + ': الرصيد = ثلث السعر بالدرهم (كلّ خدمة ٣ أضعاف تكلفتها)');
    const aed = checkout.priceFor(k, 'aed').amount / 100;
    const fees = aed * 0.029 + 0.3 * 3.6725; // Stripe ٢٫٩٪ + ٠٫٣٠$
    assert.ok((aed - fees - P[k].budget / 100) / aed >= 0.6, k + ': هامش أسوأ حالة');
  }
  assert.deepEqual(keys.map((k) => [P[k].amount, P[k].paypal, P[k].budget]), [[1021, '10.21', 1250], [2042, '20.42', 2500], [10211, '102.11', 12500]]);
  assert.deepEqual(keys.map((k) => checkout.priceFor(k, 'aed').amount), [3750, 7500, 37500]);
  assert.deepEqual(keys.map((k) => [Math.floor(P[k].budget / media.UNIT_COST.image_normal), Math.floor(P[k].budget / media.UNIT_COST.minimax_video)]), [[50, 12], [100, 24], [500, 121]]);
  for (const k of ['img_basic', 'img_pro', 'img_max', 'vid_basic', 'vid_pro', 'vid_max']) { assert.equal(P[k].retired, true, k + ' متوقّفة'); assert.equal(checkout.PLANS[k].retired, true, k); }
  for (const k of ['maha_basic', 'maha_pro', 'maha_max']) assert.ok(!P[k].retired, 'مها لا تُمسّ: ' + k);
  assert.ok(media.MEDIA_KINDS.includes('mix'));
});

test('٢. الشراء: بالدولار (صفحة Stripe) وبالدرهم (Stripe وApple/Google Pay) وPayPal يمنح ١٢٥٠ · ٢٥٠٠ · ١٢٥٠٠ ولا يمسّ النقاط ولا باقة المحادثة', async () => {
  await fresh('dana');
  let r = await stripe('', { plan: 'media_basic', token: tok('dana') });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  let p = new URLSearchParams(net.calls[net.calls.length - 1].body);
  assert.deepEqual([p.get('line_items[0][price_data][currency]'), p.get('line_items[0][price_data][unit_amount]'), p.get('metadata[plan]')], ['usd', '1021', 'media_basic']);
  await buy('dana', 'media_basic', 'd1', 1021);
  assert.equal(mixLeft('dana'), 1250);
  let u = await user('dana');
  assert.equal(u.media.mix.plan, 'media_basic');
  assert.equal(store.get('points:dana'), '70', 'النقاط كما هي');
  assert.equal(tier.planActive(u), false, 'لا باقة محادثة');

  await fresh('reem');
  r = await stripe('', { plan: 'media_pro', token: tok('reem'), currency: 'aed', autoRenew: true });
  p = new URLSearchParams(net.calls[net.calls.length - 1].body);
  assert.deepEqual([p.get('mode'), p.get('line_items[0][price_data][currency]'), p.get('line_items[0][price_data][unit_amount]'), p.get('subscription_data[metadata][plan]')], ['subscription', 'aed', '7500', 'media_pro']);
  await hook(paidSession('cs_rm', 'reem', 'media_pro', 'pi_rm', 7500, { currency: 'aed' }));
  assert.equal(mixLeft('reem'), 2500);
  r = await stripe('create-payment-intent', { plan: 'media_max', token: tok('reem'), currency: 'aed' });
  assert.equal(r.code, 200);
  p = new URLSearchParams(net.calls[net.calls.length - 1].body);
  assert.deepEqual([p.get('currency'), p.get('amount'), p.get('metadata[plan]')], ['aed', '37500', 'media_max']);
  net.pi.pi_rmax = { id: 'pi_rmax', status: 'succeeded', amount: 37500, amount_received: 37500, currency: 'aed', created: nowSec(), latest_charge: 'ch_rmax', metadata: { username: 'reem', plan: 'media_max' } };
  r = await stripe('verify-payment-intent', { payment_intent_id: 'pi_rmax', token: tok('reem') });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.mediaPlan, 'media_max');
  assert.equal(mixLeft('reem'), 12500, 'الكبرى تملأ الرصيد (التجديد يعيد الملء ولا يُرحَّل)');

  await fresh('sami');
  r = await pp({ action: 'create', plan: 'media_pro', token: tok('sami') });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const order = JSON.parse(net.calls[net.calls.length - 1].body).purchase_units[0];
  assert.deepEqual([order.custom_id, order.amount.value, order.amount.currency_code, order.reference_id], ['media_pro', '20.42', 'USD', 'sami']);
  net.orders[r.body.id] = { id: r.body.id, status: 'COMPLETED', purchase_units: [{ reference_id: 'sami', custom_id: 'media_pro', payments: { captures: [{ id: 'CAP_s', amount: { value: '20.42' }, custom_id: 'media_pro' }] } }] };
  r = await pp({ action: 'capture', orderId: r.body.id, token: tok('sami') });
  assert.equal(r.body.credited, true, JSON.stringify(r.body));
  assert.equal(r.body.planGranted, 'media_pro');
  assert.equal(mixLeft('sami'), 2500);
});

test('٣. الصرف: الصورة والفيديو من الرصيد نفسه بتكلفتهما، والاسترجاع يعود إليه، والنفاد يكمل من النقاط', async () => {
  await fresh('lama', { points: 500 });
  await buy('lama', 'media_basic', 'l1', 1021);
  let pay = await points.spendPoints('lama', 20, 'image_normal');
  assert.deepEqual([pay.ok, pay.media, pay.pool, pay.mediaLeft], [true, 'image', 'mix', 1225], 'media يبقى نوع العمليّة (maha-image يقرأه)');
  pay = await points.spendPoints('lama', points.COSTS.image, 'image');
  assert.equal(mixLeft('lama'), 1175, 'العالية ٥٠');
  pay = await points.spendPoints('lama', points.COSTS.minimax_video, 'minimax_video');
  assert.deepEqual([pay.media, pay.pool], ['video', 'mix']);
  assert.equal(mixLeft('lama'), 1072);
  pay = await points.spendPoints('lama', points.COSTS.veo_video, 'veo_video');
  assert.equal(mixLeft('lama'), 632);
  assert.equal(store.get('points:lama'), '500', 'النقاط لم تُمسّ');
  await points.refundPoints('lama', points.COSTS.veo_video);
  assert.equal(mixLeft('lama'), 1072, 'فشل الفيديو يعيده للرصيد المدموج');
  assert.equal(store.get('points:lama'), '500');
  store.set('media:mix:lama', '100');
  pay = await points.spendPoints('lama', points.COSTS.omni_video, 'omni_video');
  assert.equal(pay.ok, true);
  assert.equal(pay.media, undefined, 'الرصيد لا يكفي ← النقاط');
  assert.equal(store.get('points:lama'), String(500 - points.COSTS.omni_video));
  assert.equal(mixLeft('lama'), 100);
  pay = await points.spendPoints('lama', points.COSTS.maha_minute, 'maha_minute');
  assert.equal(pay.media, undefined, 'دقيقة مها لا تُصرف من رصيد الصور والفيديو');
});

test('٤. مشترك img_ القائم: يُصرف من باقته أوّلًا ثمّ المدموجة، والفيديو من المدموجة، وانتهاء نافذته يحوّل كلّ شيء إليها', async () => {
  await fresh('huda', { points: 300 });
  await buy('huda', 'img_basic', 'h0', 1021); // جلسة بدأت قبل الإيقاف — الويب هوك يمنحها كما كان
  await buy('huda', 'media_basic', 'h1', 1021);
  assert.equal(Number(store.get('media:image:huda')), 1531);
  let pay = await points.spendPoints('huda', 20, 'image_normal');
  assert.deepEqual([pay.media, pay.pool], ['image', 'image']);
  assert.equal(Number(store.get('media:image:huda')), 1506);
  assert.equal(mixLeft('huda'), 1250, 'المدموجة لم تُمسّ ما دامت القديمة تكفي');
  pay = await points.spendPoints('huda', points.COSTS.minimax_video, 'minimax_video');
  assert.deepEqual([pay.media, pay.pool], ['video', 'mix'], 'لا باقة فيديو قديمة ← المدموجة');
  assert.equal(mixLeft('huda'), 1147);
  store.set('media:image:huda', '30');
  pay = await points.spendPoints('huda', points.COSTS.image, 'image');
  assert.deepEqual([pay.pool, pay.mediaLeft], ['mix', 1097], 'القديمة لا تكفي الصورة العالية ← المدموجة');
  await points.refundPoints('huda', points.COSTS.image);
  assert.equal(mixLeft('huda'), 1147, 'الاسترجاع يعود للخانة التي صُرف منها');
  assert.equal(store.get('media:image:huda'), '30');
  const st = await media.mediaStatus('huda');
  assert.deepEqual(Object.keys(st), ['image', 'mix']);
  assert.deepEqual(st.mix.counts, { image_normal: 45, image: 22, image_4k: 13, image_upscale: 114, minimax_video: 11, runway_video: 6, omni_video: 3, veo_video: 2 });
  const u = await user('huda');
  u.media.image.at = Date.now() - 36 * DAY; // نافذة الصور القديمة انتهت
  await auth.putUser('huda', u);
  store.set('media:image:huda', '1000');
  pay = await points.spendPoints('huda', 20, 'image_normal');
  assert.equal(pay.pool, 'mix', 'المنتهية لا يُصرف منها');
  assert.equal(store.get('points:huda'), '300');
});

test('٥. img_/vid_ لا تُباع جديدةً (Stripe وApple/Google Pay وPayPal)، وتجديد قائم وجلسة سابقة والتقاط طلب سابق يُمنح كما كان', async () => {
  await fresh('omar');
  const before = net.calls.length;
  for (const [action, body] of [['', { plan: 'img_basic', token: tok('omar') }], ['', { plan: 'vid_pro', token: tok('omar'), autoRenew: true, currency: 'aed' }], ['create-payment-intent', { plan: 'img_pro', token: tok('omar') }]]) {
    const r = await stripe(action, body);
    assert.equal(r.code, 410, body.plan + ' ' + JSON.stringify(r.body));
    assert.equal(r.body.retired, true);
    assert.match(r.body.error, /صور وفيديو/);
  }
  const r0 = await pp({ action: 'create', plan: 'vid_basic', token: tok('omar') });
  assert.equal(r0.code, 410);
  assert.equal(net.calls.slice(before).filter((c) => c.method === 'POST' && /checkout\/sessions|payment_intents|\/v2\/checkout\/orders/.test(c.url)).length, 0, 'لا جلسة ولا طلب دفع أُنشئ');
  // تجديد شهريّ لاشتراك img_pro قائم في Stripe
  let r = await hook(evt('invoice.paid', { id: 'in_om2', billing_reason: 'subscription_cycle', payment_intent: 'pi_om2', amount_paid: 2042, currency: 'usd', subscription_details: { metadata: { username: 'omar', plan: 'img_pro' } } }));
  assert.equal(r.code, 200);
  assert.equal((await user('omar')).media.image.plan, 'img_pro');
  assert.equal(Number(store.get('media:image:omar')), 3050, 'التجديد يُمنح كما كان');
  // جلسة vid_basic بدأت قبل النشر وعاد صاحبها بعده
  net.sessions.cs_old = { id: 'cs_old', payment_status: 'paid', amount_total: 1021, currency: 'usd', created: nowSec() - 3600, payment_intent: 'pi_old', metadata: { username: 'omar', plan: 'vid_basic' } };
  r = await stripe('verify-checkout', { session_id: 'cs_old', token: tok('omar') });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(Number(store.get('media:video:omar')), 1200);
  // طلب PayPal لـimg_basic أُنشئ قبل النشر
  net.orders.PP_old = { id: 'PP_old', status: 'COMPLETED', create_time: '2026-10-01T09:00:00Z', purchase_units: [{ reference_id: 'omar', custom_id: 'img_basic', payments: { captures: [{ id: 'CAP_old', amount: { value: '10.21' }, custom_id: 'img_basic' }] } }] };
  await fresh('omar2');
  net.orders.PP_old.purchase_units[0].reference_id = 'omar2';
  r = await pp({ action: 'capture', orderId: 'PP_old', token: tok('omar2') });
  assert.equal(r.body.credited, true, JSON.stringify(r.body));
  assert.equal(Number(store.get('media:image:omar2')), 1531);
});

test('٦. الاسترداد والاعتراض على المدموجة: الجزئيّ بالتناسب، والكامل يسحبها، واسترداد الترقية يعيد السابقة برصيدها، والاعتراض سحب كامل وتنبيه', async () => {
  await fresh('noor');
  await buy('noor', 'media_pro', 'n1', 2042);
  assert.equal(mixLeft('noor'), 2500);
  await hook(refundOf('ch_n1', 'pi_n1', 2042, 1021));
  assert.equal((await media.mediaStatus('noor')).mix.left, 1250, 'النصف');
  await hook(refundOf('ch_n1', 'pi_n1', 2042, 2042));
  assert.deepEqual(await media.mediaStatus('noor'), {}, 'الباقة سُحبت');
  assert.equal(store.has('media:mix:noor'), false);
  assert.equal(store.get('points:noor'), '70', 'باقة الوسائط بلا نقاط');

  await fresh('jana');
  await buy('jana', 'media_basic', 'j1', 1021);
  await points.spendPoints('jana', points.COSTS.minimax_video, 'minimax_video');
  assert.equal(mixLeft('jana'), 1147);
  await buy('jana', 'media_pro', 'j2', 2042);
  assert.equal(mixLeft('jana'), 2500);
  await hook(refundOf('ch_j2', 'pi_j2', 2042, 2042));
  const st = await media.mediaStatus('jana');
  assert.deepEqual([st.mix.plan, st.mix.left], ['media_basic', 1147], 'السابقة تعود برصيدها وقت الترقية');

  await fresh('ziad');
  await buy('ziad', 'media_max', 'z1', 10211);
  alerts.length = 0;
  const r = await hook(evt('charge.dispute.created', { id: 'dp_z1', object: 'dispute', charge: 'ch_z1', payment_intent: 'pi_z1', amount: 500, currency: 'usd', reason: 'fraudulent', created: nowSec() }));
  assert.equal(r.code, 200);
  assert.deepEqual(await media.mediaStatus('ziad'), {}, 'اعتراض بأيّ مبلغ = سحب كامل');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].body, /ziad/);
});

test('٧. قفل الحساب: شراء المدموجة وباقة المحادثة معًا لا يكتب أحدهما فوق الآخر', async () => {
  await fresh('badr');
  await Promise.all([buy('badr', 'media_basic', 'b1', 1021), buy('badr', 'pro', 'b2', 2000)]);
  const u = await user('badr');
  assert.equal(u.media && u.media.mix && u.media.mix.plan, 'media_basic');
  assert.equal(u.plan, 'pro');
  assert.equal(mixLeft('badr'), 1250);
});

test('٨. تغيير الاسم ينقل رصيد المدموجة بما بقي من نافذته، ولا يبقى منه شيء تحت الاسم القديم', async () => {
  await fresh('cara');
  await buy('cara', 'media_basic', 'c1', 1021);
  const u = await user('cara');
  u.media.mix.at = Date.now() - 2 * DAY;
  await auth.putUser('cara', u);
  store.set('media:mix:cara', '900');
  const r = await authCall({ action: 'changeUsername', token: tok('cara'), newUsername: 'cara2' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(store.get('media:mix:cara2'), '900');
  assert.ok(ttl.get('media:mix:cara2') > 32 * 86400 && ttl.get('media:mix:cara2') <= 33 * 86400, 'بما بقي من النافذة');
  assert.equal(store.has('media:mix:cara'), false);
  assert.equal((await points.spendPoints('cara2', 20, 'image_normal')).pool, 'mix', 'يصرف من رصيده تحت الاسم الجديد');
});

test('٩. جودة الصور لمشترك المدموجة: الإعداد يُقبل (والمعالج)، والطلب «جودة عالية» عالية، والحالة تحملها', async () => {
  await fresh('rana');
  await buy('rana', 'media_pro', 'ra1', 2042);
  assert.equal(await media.imageQuality('rana', 'ارسم قطة'), 'normal');
  assert.equal(await media.imageQuality('rana', 'ارسم قطة بجودة عالية'), 'high');
  const r = await call(points, { body: { action: 'media-quality', token: tok('rana'), quality: 'high' } });
  assert.deepEqual([r.code, r.body.ok], [200, true]);
  assert.equal(await media.imageQuality('rana', 'ارسم قطة'), 'high');
  assert.equal((await media.mediaStatus('rana')).mix.quality, 'high');
  await fresh('sara');
  const no = await call(points, { body: { action: 'media-quality', token: tok('sara'), quality: 'high' } });
  assert.equal(no.code, 400, 'غير المشترك');
  assert.equal(await media.imageQuality('sara', 'x'), null);
  // صاحب الصور القديمة والمدموجة معًا: الإعداد على الخانتين
  await fresh('mona');
  await buy('mona', 'img_basic', 'mo0', 1021);
  await buy('mona', 'media_basic', 'mo1', 1021);
  assert.equal(await media.setImageQuality('mona', 'high'), true);
  const u = await user('mona');
  assert.deepEqual([u.media.image.quality, u.media.mix.quality], ['high', 'high']);
});

test('١٠. ردّ الرصيد: subs يحمل المدموجة بنهايتها، وmedia يحمل رصيدها وأعدادها', async () => {
  await fresh('yara');
  await buy('yara', 'media_basic', 'y1', 1021);
  const r = await call(points, { body: { action: 'balance', token: tok('yara') } });
  assert.equal(r.code, 200);
  const s = r.body.subs.find((x) => x.kind === 'mix');
  assert.ok(s, JSON.stringify(r.body.subs));
  assert.deepEqual([s.plan, s.active], ['media_basic', true]);
  assert.ok(Math.abs(s.endsAt - (Date.now() + 35 * DAY)) < 60000);
  assert.deepEqual([r.body.media.mix.left, r.body.media.mix.counts.image_normal, r.body.media.mix.counts.minimax_video], [1250, 50, 12]);
  const now = Date.now();
  assert.deepEqual(points.subsOf({ media: { mix: { plan: 'media_pro', at: now - 36 * DAY } } }, now).map((x) => [x.kind, x.active]), [['mix', false]], 'المنتهية تُرسل للتنبيه');
});

// ───────────────────────── الواجهة ─────────────────────────

const LANGS = ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'];
function dicts() {
  const a3 = read('js/app-03-i18n-data.js');
  const out = { ar: {}, en: {} };
  // العربيّة والإنجليزيّة: القاموسان الأساسيّان (قيم بين علامتي اقتباس مفردتين) ثمّ أسطر Object.assign بصيغة JSON
  const enAt = a3.indexOf('\n  en: {');
  const endAt = a3.indexOf('};window.I18N = I18N;');
  for (const [l, from, to] of [['ar', 0, enAt], ['en', enAt, endAt]]) {
    for (const m of a3.slice(from, to).matchAll(/\b([A-Za-z0-9_]+):\s*'((?:[^'\\]|\\.)*)'/g)) out[l][m[1]] = m[2];
  }
  for (const m of a3.slice(endAt).matchAll(/Object\.assign\(I18N\.(ar|en), (\{[^\n]*\})\);/g)) { try { Object.assign(out[m[1]], JSON.parse(m[2])); } catch (e) { /* سطر ليس JSON خالصًا — لا يخصّ هذا الاختبار */ } }
  for (const l of LANGS) {
    const ctx = { I18N: { [l]: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('i18n/' + l + '.js'), ctx);
    out[l] = ctx.I18N[l];
  }
  return out;
}
const nums = (s) => (String(s).match(/\d+/g) || []).map(Number).sort((a, b) => a - b);

test('١١. بطاقات المجّانيّ وPlus وPro وMax بلا أيّ عدد صور أو فيديو بالـ١٤ لغة (الرسائل ودقائق الصوت وحدها أرقام)، والطبقتان متطابقتان', () => {
  const D = dicts();
  assert.equal(Object.keys(D).length, 14);
  const allowed = { planFreeFeats: [4, 20], planPlusFeats: [24, 50], planProFeats: [61, 100], planMaxFeats: [213, 250] };
  const items = { planFreeFeats: ['plFreeImgs'], planPlusFeats: ['plStImgs', 'plStVideos'], planProFeats: ['plProMedia'], planMaxFeats: ['plMaxMedia'] };
  for (const [l, d] of Object.entries(D)) {
    for (const [feats, want] of Object.entries(allowed)) {
      assert.ok(d[feats], l + ' ' + feats);
      assert.deepEqual(nums(d[feats]), want, l + ' ' + feats + ': ' + d[feats]);
      for (const k of items[feats]) {
        assert.ok(d[k], l + ' ' + k);
        assert.doesNotMatch(d[k], /[0-9٠-٩]/, l + ' ' + k + ': ' + d[k]);
        assert.ok(d[feats].includes('<li>' + d[k] + '</li>'), l + ': ' + feats + ' يحمل ' + k);
      }
    }
  }
  const ps = read('js/partials-settings.js');
  const chat = ps.slice(ps.indexOf('<div class="priceTab" data-tab="chat">'), ps.indexOf('<div class="priceTab" data-tab="media"'));
  for (const id of ['plFreeImgs', 'plStImgs', 'plStVideos', 'plProMedia', 'plMaxMedia']) {
    const m = chat.match(new RegExp('<li data-i18n="' + id + '">([^<]*)</li>'));
    assert.ok(m, id);
    assert.doesNotMatch(m[1], /\d/, 'النصّ الثابت: ' + id);
  }
  assert.deepEqual(nums(chat.replace(/<[^>]+>/g, ' ').replace(/data-usd="[^"]*"/g, '')), [0, 4, 10, 20, 20, 24, 50, 61, 70, 100, 100, 213, 250, 360, 920, 3, 200].sort((a, b) => a - b), 'أسعار ونقاط ورسائل ودقائق صوت فقط');
  assert.deepEqual(require(rp('api/_lib/_planVideos.js')).PLAN_VIDEOS, { basic: 1, pro: 2, max: 3 }, 'الاستحقاقات في الخادم كما هي');
});

test('١٢. قسم «صور وفيديو»: ثلاث بطاقات بالسعر ورصيد واحد وأمثلة تقريبيّة بالـ١٤ لغة، وأربعة أقسام، ولا بيع لـimg_/vid_ في الواجهة', () => {
  const D = dicts();
  const KEYS = ['priceTabMedia', 'mixPlanName', 'mixPlansDesc', 'mixOneBalance', 'mixApprox1', 'mixApprox2', 'mixApprox3', 'mixNoChat', 'mixLeft'];
  const BAD = /gemini|google|openai|gpt|claude|anthropic|runway|veo|minimax|hailuo|omni|nano|جيمناي|جيميني|[​-‏‪-‮⁦-⁩﻿]/i;
  for (const [l, d] of Object.entries(D)) {
    for (const k of KEYS) { assert.ok(d[k], l + ' ' + k); assert.doesNotMatch(d[k], BAD, l + ' ' + k); }
    assert.deepEqual(nums(d.mixApprox1), [12, 50], l);
    assert.deepEqual(nums(d.mixApprox2), [24, 100], l);
    assert.deepEqual(nums(d.mixApprox3), [121, 500], l);
    assert.doesNotMatch(d.mixOneBalance + d.mixPlansDesc + d.mixPlanName, /\d/, l);
  }
  const ps = read('js/partials-settings.js');
  const tabs = [...ps.matchAll(/class="priceTabBtn[^"]*" data-tab="(\w+)" onclick="showPriceTab\('(\w+)'\)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tabs, [['chat', 'chat'], ['media', 'media'], ['maha', 'maha'], ['pts', 'pts']]);
  assert.match(ps, /id="priceTabs" role="tablist" style="display:grid; grid-template-columns:repeat\(4,1fr\);/);
  const sec = ps.slice(ps.indexOf('<div class="priceTab" data-tab="media"'), ps.indexOf('<div class="priceTab" data-tab="maha"'));
  for (const [plan, usd, n] of [['media_basic', '10.21', 1], ['media_pro', '20.42', 2], ['media_max', '102.11', 3]]) {
    const i = sec.indexOf("openCheckout('" + plan + "')");
    assert.ok(i > 0, plan);
    const card = sec.slice(sec.lastIndexOf('<div class="pcard', i), i);
    assert.ok(card.includes('data-usd="' + usd + '"'), plan + ' السعر');
    assert.ok(card.includes('data-i18n="mixOneBalance"') && card.includes('data-i18n="mixApprox' + n + '"') && card.includes('data-i18n="mixPlanName"'), plan + ' النصوص');
  }
  for (const id of ['mediaPlanStatus', 'mediaQualityBox', 'mixPlansDesc']) assert.ok(sec.includes(id), id + ' في القسم المدموج');
  assert.doesNotMatch(ps, /openCheckout\('(?:img|vid)_/, 'لا زرّ بيع لـimg_/vid_');
  assert.doesNotMatch(sec, /Veo|Runway|Omni|MiniMax|Gemini|GPT|Nano/i);
  const a6 = read('js/app-06-checkout.js');
  for (const t of ['CHECKOUT_PLAN_AMOUNTS', 'CHECKOUT_AED_FILS']) {
    const line = a6.split('\n').find((x) => x.startsWith('const ' + t)).split('};')[0];
    assert.match(line, /media_basic: (1021|3750), media_pro: (2042|7500), media_max: (10211|37500)/, t);
    assert.doesNotMatch(line, /img_|vid_/, t + ': img_/vid_ خرجت من مرآة البيع');
  }
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=693'));
  assert.ok(read('js/app-04-i18n-state.js').includes("'i18n/' + lg + '.js?v=726'"));
});

test('١٣. الواجهة في vm: showPriceTab يفتح المدموج من img/vid/image/video، والحالة تعرض رصيد المدموجة ومتبقّي القديمة، والجودة لمشترك المدموجة', () => {
  const a6 = read('js/app-06-checkout.js');
  const el = (tab) => ({ tab, style: { display: 'x' }, cls: new Set(), attrs: {}, getAttribute(k) { return k === 'data-tab' ? tab : null; }, setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle(c, on) { /* يكفي العرض */ } } });
  const panes = ['chat', 'media', 'maha', 'pts'].map(el);
  const btns = ['chat', 'media', 'maha', 'pts'].map(el);
  const doc = { querySelectorAll: (q) => (q.includes('.priceTabBtn') ? btns : panes) };
  const showSrc = a6.slice(a6.indexOf('function showPriceTab(tab){'), a6.indexOf('window.showPriceTab = showPriceTab;'));
  const show = new Function('document', showSrc + '; return showPriceTab;')(doc);
  const shown = () => panes.filter((p) => p.style.display === '').map((p) => p.tab);
  for (const t of ['img', 'vid', 'image', 'video', 'mix', 'media']) { show(t); assert.deepEqual(shown(), ['media'], t); }
  show('maha'); assert.deepEqual(shown(), ['maha']);
  show('constructor'); assert.deepEqual(shown(), ['chat'], 'قسم مجهول ← المحادثة');

  const box = { style: {}, innerHTML: '' };
  const qbtns = [{ q: 'normal' }, { q: 'high' }].map((x) => ({ style: {}, getAttribute: () => x.q, setAttribute(k, v) { this[k] = v; } }));
  const qb = { style: {}, querySelectorAll: () => qbtns };
  const T = { mixLeft: 'MIX', mediaLeftImg: 'IMG', mediaLeftVid: 'VID', mediaImgPlain: 'صورة', mediaOr: 'أو', mediaVidEco: 'اقتصادي', mediaVidCine: 'سينمائيّ', mediaHighEq: 'EQ' };
  const rSrc = a6.slice(a6.indexOf('function renderMediaPlanStatus('), a6.indexOf('async function setMediaQuality('));
  const render = new Function('document', 't', rSrc + '; return renderMediaPlanStatus;')({ getElementById: (id) => ({ mediaPlanStatus: box, mediaQualityBox: qb })[id] || null }, (k) => T[k] || k);
  render({ mix: { left: 1250, counts: { image_normal: 50, minimax_video: 12 }, quality: 'high' }, video: { counts: { minimax_video: 3, omni_video: 1 } } });
  assert.equal(box.style.display, 'block');
  assert.ok(box.innerHTML.includes('MIX: <b>50</b> صورة أو <b>12</b> اقتصادي'), box.innerHTML);
  assert.ok(box.innerHTML.includes('VID: <b>3</b>'), 'متبقّي الفيديو القديم في القسم نفسه');
  assert.equal(qb.style.display, 'block', 'صندوق الجودة لمشترك المدموجة');
  assert.equal(qbtns[1]['aria-pressed'], 'true');
  render({});
  assert.deepEqual([box.style.display, qb.style.display], ['none', 'none']);
  assert.match(a6, /const __mp = \/\^\(img\|vid\|maha\|media\)_\(basic\|pro\|max\)\$\/\.exec/);
  assert.match(a6, /media: 'mixPlanName'/);
});

test('١٤. فتح الباقات: جدار الصور والفيديو وتنبيه انتهاء الصور/الفيديو/المدموجة يفتح قسم «صور وفيديو»، واسم المدموجة في الشريط', async () => {
  const src = read('js/app-33-plans-gate.js');
  const log = [];
  const store2 = new Map();
  const ctx = {
    window: {}, document: { body: null, getElementById: () => null, createElement: () => ({}) }, location: { href: 'https://o.test/', origin: 'https://o.test' }, URL,
    localStorage: { getItem: (k) => (store2.has(k) ? store2.get(k) : null), setItem: (k, v) => store2.set(k, v) },
    lang: 'ar', console, Date, Object, Array, String, Number, Promise, JSON, setTimeout,
    t: (k) => ({ priceTabMedia: '🖼️ صور وفيديو' })[k] || k, authGet: () => 'tok',
    showSettingsPage: () => log.push('page'), showPriceTab: (tab) => log.push('tab:' + tab), stripUiEmoji: (s) => String(s).replace(/[^\p{L}\p{N}\s]/gu, '').trim(), __swallow: () => {},
  };
  ctx.window.fetch = async () => ({ status: 200, ok: true, clone() { return this; }, json: async () => ({}) });
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const g = ctx.window.__omranPlansGate;
  for (const u of ['/api/maha-image', '/api/video?action=veo-create', '/api/video-create', '/api/upscale']) assert.equal(g.tabFor(u, 'points'), 'media', u);
  assert.equal(g.tabFor('/api/realtime-session', 'points'), 'maha', 'مها لا تُمسّ');
  const now = Date.now();
  for (const kind of ['mix', 'image', 'video']) {
    const n = g.pickNotice([{ kind, plan: 'x', endsAt: now - DAY, active: false }], now);
    assert.ok(n && n.s.kind === kind, kind + ' يُنبَّه به');
  }
  assert.match(src, /var TAB_OF_KIND = \{ chat: 'chat', mix: 'media', image: 'media', video: 'media', maha: 'maha' \};/);
  assert.match(src, /mix: 'priceTabMedia'/);
  ctx.window.omranOpenPlans('expired', 'image');
  assert.deepEqual(log, ['page', 'tab:image'], 'القسم القديم يمرّ إلى showPriceTab الذي يفتح المدموج (١٣)');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("var TAB_OF_KIND = { chat: 'chat', mix: 'media', image: 'media', video: 'media', maha: 'maha' };") && bundle.includes("const k0 = ({ img: 'media', vid: 'media'"), 'الحزمة مبنيّة');
});

// ───────────────────────── إصلاح المراجعة المعاكسة ─────────────────────────

test('١٥. PayPal: طلب img_/vid_ أُنشئ بعد الإيقاف خارج create (حزمة PayPal في المتصفّح بالمعرّف العامّ) يُمنح المدموجة بمبلغه — بالالتقاط وبـclaim', async () => {
  const order = (id, ref, plan, value, extra) => Object.assign({ id, status: 'COMPLETED', purchase_units: [{ reference_id: ref, custom_id: plan, payments: { captures: [{ id: 'CAP_' + id, amount: { value }, custom_id: plan }] } }] }, extra || {});
  // الالتقاط من معالجنا: كان يمنح img_max (٢٠٣٠٢ فلس صور) بدل ما يُباع اليوم بالمبلغ نفسه (media_max ١٢٥٠٠)
  await fresh('eve');
  net.orders.PP_hack = order('PP_hack', 'eve', 'img_max', '102.11', { create_time: new Date().toISOString() });
  let r = await pp({ action: 'capture', orderId: 'PP_hack', token: tok('eve') });
  assert.deepEqual([r.body.credited, r.body.planGranted], [true, 'media_max'], JSON.stringify(r.body));
  assert.equal(mixLeft('eve'), 12500);
  assert.equal(store.has('media:image:eve'), false, 'لا رصيد صور قديم');
  const cap = net.calls.filter((c) => /\/v2\/checkout\/orders\/PP_hack\/capture$/.test(c.url)).pop();
  assert.equal(cap.headers.Prefer, 'return=representation', 'الالتقاط يطلب الطلب كاملًا بوقت إنشائه');
  // التُقط في المتصفّح ثمّ طُلب شحنه بـclaim
  await fresh('eve2');
  net.orders.PP_hack2 = order('PP_hack2', 'eve2', 'vid_max', '102.11', { create_time: new Date(Date.now() - 60000).toISOString() });
  r = await pp({ action: 'claim', orderId: 'PP_hack2', token: tok('eve2') });
  assert.deepEqual([r.body.credited, r.body.planGranted], [true, 'media_max'], JSON.stringify(r.body));
  assert.equal(mixLeft('eve2'), 12500);
  assert.equal(store.has('media:video:eve2'), false, 'كان ١٦٢٨٠ فلس فيديو');
  // ردّ بلا وقت إنشاء لا يُفترض قديمًا
  await fresh('eve3');
  net.orders.PP_hack3 = order('PP_hack3', 'eve3', 'vid_basic', '10.21');
  r = await pp({ action: 'capture', orderId: 'PP_hack3', token: tok('eve3') });
  assert.deepEqual([r.body.planGranted, mixLeft('eve3')], ['media_basic', 1250]);
  // المنح سُجّل بالمدموجة: الاسترداد الكامل يسحبها هي
  assert.equal((await user('eve3')).media.mix.plan, 'media_basic');
  // وطلب أُنشئ قبل الإيقاف يبقى كما كان (٥)، وطلب المدموجة نفسها لا يتغيّر (٢)
  await fresh('eve4');
  net.orders.PP_pre = order('PP_pre', 'eve4', 'vid_pro', '20.42', { create_time: '2026-10-08T10:00:00Z' });
  r = await pp({ action: 'capture', orderId: 'PP_pre', token: tok('eve4') });
  assert.deepEqual([r.body.planGranted, Number(store.get('media:video:eve4'))], ['vid_pro', 2400]);
  assert.equal(paypal.RETIRED_SINCE, Date.parse('2026-10-08T16:31:39Z'), 'وقت الإيقاف = التزام v-media-merge');
});

function gate() {
  const ctx = {
    window: {}, document: { body: null, getElementById: () => null, createElement: () => ({}) }, location: { href: 'https://o.test/', origin: 'https://o.test' }, URL,
    localStorage: { getItem: () => null, setItem: () => {} }, lang: 'ar', console, Date, Object, Array, String, Number, Promise, JSON, setTimeout,
    t: (k) => k, authGet: () => 'tok', __swallow: () => {},
  };
  ctx.window.fetch = async () => ({ status: 200, ok: true, clone() { return this; }, json: async () => ({}) });
  vm.createContext(ctx);
  vm.runInContext(read('js/app-33-plans-gate.js'), ctx);
  return ctx.window.__omranPlansGate;
}

test('١٦. شريط الانتهاء: صور/فيديو قديمة انتهت أو قاربت والمدموجة سارية ← لا تنبيه («جدّد» كان يبيعه ما يملكه ويصفّر رصيده)، وبلا مدموجة سارية كما كان', () => {
  const now = Date.now();
  const kinds = (list) => { const n = gate().pickNotice(list, now); return n && [n.s.kind, n.state]; };
  const mixOn = { kind: 'mix', plan: 'media_max', endsAt: now + 20 * DAY, active: true };
  const imgOff = { kind: 'image', plan: 'img_basic', endsAt: now - DAY, active: false };
  const vidSoon = { kind: 'video', plan: 'vid_pro', endsAt: now + DAY, active: true };
  assert.equal(kinds([imgOff, mixOn]), null, 'الصور القديمة انتهت والمدموجة تغطّيها');
  assert.equal(kinds([vidSoon, mixOn]), null, 'الفيديو القديم قارب والمدموجة تغطّيه');
  assert.equal(kinds([mixOn, imgOff, vidSoon]), null);
  assert.deepEqual(kinds([imgOff, { kind: 'mix', plan: 'media_basic', endsAt: now + DAY, active: true }]), ['mix', 'expiring'], 'المدموجة نفسها قاربت ← تنبيهها');
  assert.deepEqual(kinds([imgOff, { kind: 'mix', plan: 'media_basic', endsAt: now - 2 * DAY, active: false }]), ['mix', 'expired'], 'المدموجة منتهية ← كما كان');
  assert.deepEqual(kinds([imgOff]), ['image', 'expired'], 'بلا مدموجة ← كما كان');
  assert.deepEqual(kinds([vidSoon]), ['video', 'expiring']);
  assert.deepEqual(kinds([{ kind: 'chat', plan: 'pro', endsAt: now - DAY, active: false }, mixOn]), ['chat', 'expired'], 'المحادثة لا تتأثّر');
  assert.deepEqual(kinds([{ kind: 'maha', plan: 'maha_basic', endsAt: now + DAY, active: true }, mixOn]), ['maha', 'expiring'], 'مها لا تتأثّر');
  assert.ok(read('js/app.bundle.js').includes(read('js/app-33-plans-gate.js').trim().split('\n').find((l) => /mixOn/.test(l)).trim()), 'الحزمة مبنيّة');
});

test('١٧. وسم الصورة لمشترك «صور وفيديو» يسمّي رصيده المدموج لا «اشتراك الصور»', () => {
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /__mediaLeft = pay\.mediaLeft; __mediaPool = pay\.pool \|\| ''; \}/);
  assert.match(mi, /mediaTag: __mediaQuality \? \{ q: __mediaQuality, left: Math\.floor\(__mediaLeft \/ 25\), pool: __mediaPool \}/);
  const a9 = read('js/app-09-attach.js');
  const src = a9.slice(a9.indexOf('function __imgEngineLine('), a9.indexOf('async function omModeGenerateImage('));
  const T = { mixLeft: 'MIX', mediaLeftImg: 'IMG', mediaQNormal: 'N', mediaQHigh: 'H', mediaImgPlain: 'صورة' };
  const line = new Function('t', 'authGet', src + '; return __imgEngineLine;')((k) => T[k] || k, () => 'rana');
  assert.equal(line('', { mediaTag: { q: 'normal', left: 49, pool: 'mix' } }), '\n\n🏷️ ⚡ N · MIX: 49 صورة');
  assert.equal(line('', { mediaTag: { q: 'high', left: 10, pool: 'image' } }), '\n\n🏷️ 💎 H · IMG: 10 صورة');
  assert.equal(line('', { mediaTag: { q: 'high', left: 10 } }), '\n\n🏷️ 💎 H · IMG: 10 صورة', 'ردّ بلا pool كما كان');
  assert.ok(read('js/app.bundle.js').includes("t(mt.pool === 'mix' ? 'mixLeft' : 'mediaLeftImg')"), 'الحزمة مبنيّة');
});

test('١٨. استرداد PayPal لطلب img_ بعد الإيقاف ضاع سجلّ منحه: المسار البديل يبني السجلّ بالمدموجة الممنوحة فيسحبها (كان custom_id الخامّ img_max فلا يُسحب شيء)', async () => {
  const pr = require(rp('api/_lib/pay-refund.js'));
  await fresh('eve9');
  net.orders.PP_lost = { id: 'PP_lost', status: 'COMPLETED', create_time: new Date().toISOString(), purchase_units: [{ reference_id: 'eve9', custom_id: 'img_max', payments: { captures: [{ id: 'CAP_lost', amount: { value: '102.11' }, custom_id: 'img_max' }] } }] };
  const r = await pp({ action: 'capture', orderId: 'PP_lost', token: tok('eve9') });
  assert.equal(r.body.planGranted, 'media_max');
  assert.equal(mixLeft('eve9'), 12500);
  for (const k of [...store.keys()]) if (/^(payrec|payref):/.test(k) && /PP_lost|CAP_lost/.test(k)) store.delete(k); // تعذّر recordGrant («لا يرمي»)
  net.captures = Object.assign(net.captures || {}, { CAP_lost: { id: 'CAP_lost', create_time: new Date().toISOString(), amount: { currency_code: 'USD', value: '102.11' }, supplementary_data: { related_ids: { order_id: 'PP_lost' } } } });
  const out = await pr.paypalEvent({ id: 'WH-lost', event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'RF_lost', amount: { currency_code: 'USD', value: '102.11' }, seller_payable_breakdown: { total_refunded_amount: { currency_code: 'USD', value: '102.11' } }, links: [{ rel: 'up', href: 'https://api-m.paypal.com/v2/payments/captures/CAP_lost' }] } });
  assert.equal(out.status, 'done', JSON.stringify(out));
  assert.ok(!(mixLeft('eve9') > 0), 'رصيد المدموجة سُحب: ' + mixLeft('eve9'));
  assert.equal(media.mediaActive(await user('eve9'), 'mix'), false, 'الباقة سقطت');
});

test('١٩. v-paypal-currency: طلب بعملة غير الدولار وبالرقم نفسه لا يُمنح أيّ باقة (كان ١٠٢٫١١ بيزو يمنح الكبرى)، والدولار كما كان', async () => {
  const order = (id, ref, plan, value, cur) => ({ id, status: 'COMPLETED', create_time: new Date().toISOString(), purchase_units: [{ reference_id: ref, custom_id: plan, payments: { captures: [{ id: 'CAP_' + id, amount: { currency_code: cur, value }, custom_id: plan }] } }] });
  for (const [id, plan, value, cur] of [['PP_php', 'media_max', '102.11', 'PHP'], ['PP_php2', undefined, '100.00', 'php'], ['PP_inr', 'media_basic', '10.21', 'INR']]) {
    const u = 'cur_' + id.toLowerCase();
    await fresh(u);
    net.orders[id] = order(id, u, plan, value, cur);
    for (const action of ['capture', 'claim']) {
      const r = await pp({ action, orderId: id, token: tok(u) });
      assert.notEqual(r.body.credited, true, id + ' ' + action + ': ' + JSON.stringify(r.body));
    }
    const rec = await user(u);
    assert.equal(rec.plan, undefined, id + ': لا باقة محادثة');
    assert.equal(store.has('media:mix:' + u), false, id + ': لا رصيد وسائط');
    assert.equal(Number(store.get('points:' + u)), 70, id + ': لا نقاط');
  }
  await fresh('cur_usd');
  net.orders.PP_usd = order('PP_usd', 'cur_usd', 'media_max', '102.11', 'USD');
  const ok = await pp({ action: 'capture', orderId: 'PP_usd', token: tok('cur_usd') });
  assert.deepEqual([ok.body.credited, ok.body.planGranted], [true, 'media_max']);
  assert.equal(mixLeft('cur_usd'), 12500);
});
