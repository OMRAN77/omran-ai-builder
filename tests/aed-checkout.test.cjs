// tests/aed-checkout.test.cjs — v-aed-checkout (طلب المالك ٥ أكتوبر، «الدرهم فقط»): الأسعار تُعرض بعملة البلد
// (js/currency.js) والدفع كان بالدولار وحده — المشترك في الإمارات يرى ٣٧٫٥ د.إ وتخصم بطاقته ١٠$ برسوم تحويل.
// الآن من عملته المعروضة درهم يدفع بالدرهم السعر المعروض نفسه (Stripe والتجديد وApple/Google Pay)، وغيره بالدولار كما كان.
// العميل يختار العملة لا المبلغ؛ PayPal بالدولار دائمًا (لا يدعم الدرهم).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'aed-checkout-test-secret';
process.env.STRIPE_SECRET_KEY = 'test-stripe-key';

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checkout = require('../api/_lib/create-checkout-session.js');
const { PLANS, priceFor } = checkout;

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
async function call(action, body) {
  const calls = [];
  const saveFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options && options.body ? String(options.body) : '' });
    if (/checkout\/sessions/.test(String(url))) return new Response(JSON.stringify({ id: 'cs_1', url: 'https://pay' }), { status: 200 });
    if (/payment_intents/.test(String(url))) return new Response(JSON.stringify({ id: 'pi_1', client_secret: 's' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const out = { status: 200, json: null };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(v) { out.json = v; }, end() {} };
  try { await checkout({ method: 'POST', headers: {}, query: { action }, body }, res); } finally { global.fetch = saveFetch; }
  return Object.assign(out, { params: calls.length ? new URLSearchParams(calls[0].body) : null });
}
// محرّك العرض نفسه (js/currency.js) — ما يراه المشترك في بطاقات الأسعار.
function displayEngine() {
  const ctx = { window: {}, document: {} };
  vm.createContext(ctx);
  vm.runInContext(read('js/currency.js'), ctx);
  return ctx.window.OmranCur;
}

test('١. سعر الدرهم لكلّ خطّة = المعروض في بطاقة الإمارات بالضبط (pretty(usd × 3.6725))', () => {
  const C = displayEngine();
  const ae = C.list.find((x) => x.c === 'AE');
  assert.equal(ae.cc, 'AED');
  for (const plan of Object.keys(PLANS)) {
    const shown = C.pretty((PLANS[plan].amount / 100) * ae.r);
    assert.deepEqual(priceFor(plan, 'aed'), { currency: 'aed', amount: Math.round(shown * 100) }, plan);
  }
  assert.deepEqual([priceFor('basic', 'aed').amount, priceFor('pro', 'aed').amount, priceFor('max', 'aed').amount], [3750, 7500, 37500]);
  assert.deepEqual(['pack100', 'pack300', 'pack700', 'pack900'].map((p) => priceFor(p, 'aed').amount), [1900, 4800, 9500, 13000]);
});

test('٢. غير الدرهم = الدولار كما كان (أيّ قيمة أخرى، أو بلا عملة)', () => {
  for (const cur of [undefined, '', 'usd', 'USD', 'eur', 'sar', 'aed;drop', {}, 5]) {
    assert.deepEqual(priceFor('pro', cur), { currency: 'usd', amount: 2000 }, String(cur));
  }
  assert.deepEqual(priceFor('pro', 'AED'), { currency: 'aed', amount: 7500 }, 'الحالة لا تهمّ');
});

test('٣. صفحة Stripe بالدرهم للدفعة والاشتراك المتجدّد، والمبلغ من الخادم لا من العميل', async () => {
  let r = await call('create-checkout-session', { plan: 'basic', token: token('reem'), currency: 'aed', amount: 1, unit_amount: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.params.get('line_items[0][price_data][currency]'), 'aed');
  assert.equal(r.params.get('line_items[0][price_data][unit_amount]'), '3750');
  r = await call('create-checkout-session', { plan: 'max', token: token('reem'), currency: 'aed', autoRenew: true });
  assert.equal(r.params.get('mode'), 'subscription');
  assert.equal(r.params.get('line_items[0][price_data][currency]'), 'aed', 'التجديد الشهريّ بالدرهم أيضًا');
  assert.equal(r.params.get('line_items[0][price_data][unit_amount]'), '37500');
  assert.equal(r.params.get('metadata[plan]'), 'max', 'الويب هوك يشحن بالخطّة لا بالمبلغ');
  r = await call('create-checkout-session', { plan: 'pro', token: token('sam') });
  assert.equal(r.params.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(r.params.get('line_items[0][price_data][unit_amount]'), '2000');
});

test('٤. Apple/Google Pay: العمليّة في الخادم بالدرهم والمبلغ نفسه، وبلا عملة بالدولار', async () => {
  let r = await call('create-payment-intent', { plan: 'media_pro', token: token('reem'), currency: 'aed' }); // v-media-merge: img_ توقّف بيعها
  assert.equal(r.status, 200);
  assert.deepEqual([r.params.get('currency'), r.params.get('amount')], ['aed', '7500']);
  r = await call('create-payment-intent', { plan: 'pack900', token: token('reem') });
  assert.deepEqual([r.params.get('currency'), r.params.get('amount')], ['usd', '3499']);
});

// ── الواجهة ──
const a6 = read('js/app-06-checkout.js');
function clientFns(extra) {
  const ctx = Object.assign({ window: {}, __swallow: () => {} }, extra || {});
  vm.createContext(ctx);
  const start = a6.indexOf('const CHECKOUT_PLAN_AMOUNTS');
  const end = a6.indexOf('// v-fair-video: نقاط كلّ رزمة');
  vm.runInContext(a6.slice(start, end) + '\nthis.CHECKOUT_PLAN_AMOUNTS = CHECKOUT_PLAN_AMOUNTS; this.CHECKOUT_AED_FILS = CHECKOUT_AED_FILS; this.checkoutCurrency = checkoutCurrency; this.checkoutPriceText = checkoutPriceText;', ctx);
  return ctx;
}

test('٥. جدول العميل يطابق الخادم لكلّ خطّة (ورقة Apple/Google Pay تقول ما يخصمه الخادم)', () => {
  const c = clientFns();
  const sold = Object.keys(PLANS).filter((p) => !PLANS[p].retired); // v-media-merge: img_/vid_ لا تُباع — خرجت من مرآة العميل
  assert.deepEqual(Object.keys(c.CHECKOUT_AED_FILS).sort(), sold.sort());
  assert.deepEqual(Object.keys(c.CHECKOUT_PLAN_AMOUNTS).sort(), sold.sort());
  for (const plan of sold) {
    assert.equal(c.CHECKOUT_AED_FILS[plan], priceFor(plan, 'aed').amount, plan);
    assert.equal(c.CHECKOUT_PLAN_AMOUNTS[plan], priceFor(plan, 'usd').amount, plan);
  }
});

test('٦. عملة الدفع = العملة المعروضة: درهم ← aed، غيره ← usd، وبلا منتقٍ من كشف الدولة', () => {
  const cur = (cc) => ({ cur: () => ({ cc }) });
  assert.equal(clientFns({ window: { OmranCur: cur('AED') } }).checkoutCurrency(), 'aed');
  assert.equal(clientFns({ window: { OmranCur: cur('SAR') } }).checkoutCurrency(), 'usd');
  assert.equal(clientFns({ window: { OmranCur: cur('USD') } }).checkoutCurrency(), 'usd');
  assert.equal(clientFns({ window: { OmranGeo: { country: () => 'AE' } } }).checkoutCurrency(), 'aed');
  assert.equal(clientFns({ window: { OmranGeo: { country: () => 'KW' } } }).checkoutCurrency(), 'usd');
  assert.equal(clientFns().checkoutCurrency(), 'usd', 'بلا معرفة = الدولار كما كان');
  assert.equal(clientFns({ window: { OmranCur: { cur: () => { throw new Error('x'); } } } }).checkoutCurrency(), 'usd');
  const c = clientFns();
  assert.equal(c.checkoutPriceText('pro', 'aed'), '75 AED');
  assert.equal(c.checkoutPriceText('basic', 'aed'), '37.5 AED');
  assert.equal(c.checkoutPriceText('media_basic', 'usd'), '$10.21'); // v-media-merge
});

test('٧. نافذة الدفع تقول الدرهم لمن يدفع به — «$20» يصير «75 AED» في نصوص الباقات بالـ١٤ لغة', () => {
  const m = /__planTxt\.replace\((\/.+?\/), checkoutPriceText/.exec(a6);
  assert.ok(m, 'الاستبدال موجود في openCheckout');
  const re = vm.runInNewContext(m[1]);
  const c = clientFns();
  const want = { checkoutPlanLabelBasic: ['basic', '37.5 AED'], checkoutPlanLabelPro: ['pro', '75 AED'], checkoutPlanLabelMax: ['max', '375 AED'] };
  const dicts = {};
  const a3 = read('js/app-03-i18n-data.js'); // العربيّة والإنجليزيّة: كلّ نصّ وحده
  for (const k of Object.keys(want)) for (const mm of a3.matchAll(new RegExp('\\b' + k + ":\\s*'([^']*)'", 'g'))) dicts['app03@' + mm.index] = { [k]: mm[1] };
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [l]: {} }, window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('i18n/' + l + '.js'), ctx);
    dicts[l] = ctx.I18N[l];
  }
  let n = 0;
  for (const [lang, d] of Object.entries(dicts)) for (const [k, [plan, aed]] of Object.entries(want)) {
    if (!d[k]) continue;
    const out = d[k].replace(re, c.checkoutPriceText(plan, 'aed'));
    assert.ok(out.includes(aed) && !out.includes('$'), lang + ' ' + k + ': ' + out);
    n++;
  }
  assert.ok(n >= 14 * 3, 'كلّ اللغات: ' + n);
});

test('٨. الأسلاك: Stripe وورقة المحفظة والعمليّة بالعملة نفسها، وPayPal بالدولار، والحزمة مبنيّة', () => {
  assert.match(a6, /autoRenew: !!\(document\.getElementById\('checkoutAutoRenew'\) \|\| \{\}\)\.checked, currency: checkoutCurrency\(\) \}/);
  const wallet = a6.slice(a6.indexOf('async function setupWalletPaymentRequest('), a6.indexOf('async function handleWalletPaymentMethod('));
  assert.match(wallet, /const amount = cur === 'aed' \? CHECKOUT_AED_FILS\[plan\] : CHECKOUT_PLAN_AMOUNTS\[plan\];/);
  assert.match(wallet, /currency: cur,/);
  assert.match(wallet, /handleWalletPaymentMethod\(ev, plan, cur\)/);
  assert.match(a6, /JSON\.stringify\(\{ plan, token: authGet\('aiapp_auth_token'\), currency: currency \|\| 'usd' \}\)/);
  assert.match(a6, /currency=USD&intent=capture/, 'PayPal بالدولار — لا يدعم الدرهم');
  assert.match(read('api/_lib/paypal-order.js'), /currency_code: 'USD'/);
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('function checkoutCurrency(){') && bundle.includes('const CHECKOUT_AED_FILS = '), 'الحزمة مبنيّة');
});
