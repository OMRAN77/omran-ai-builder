// v-checkout-login + v-checkout-autorenew: لا دفع بلا حساب، والتجديد الشهريّ التلقائيّ اختيار صريح.
// المالك دفع من هاتف غير مسجّل فخُصم المبلغ ولم يصل لأيّ حساب (الويب هوك يتجاهل جلسة بلا username).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'checkout-login-test-secret';
process.env.STRIPE_SECRET_KEY = 'test-stripe-key';
process.env.PAYPAL_CLIENT_ID = 'test-paypal-id';
process.env.PAYPAL_SECRET = 'test-paypal-secret';

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checkout = require('../api/_lib/create-checkout-session.js');
const paypal = require('../api/_lib/paypal-order.js');

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000, m: 1 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}

async function call(handler, action, body) {
  const calls = [];
  const saveFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options && options.body ? String(options.body) : '' });
    if (/oauth2\/token/.test(String(url))) return new Response(JSON.stringify({ access_token: 'x' }), { status: 200 });
    if (/stripe\.com\/v1\/checkout\/sessions/.test(String(url))) return new Response(JSON.stringify({ id: 'cs_1', url: 'https://pay' }), { status: 200 });
    if (/stripe\.com\/v1\/payment_intents/.test(String(url))) return new Response(JSON.stringify({ id: 'pi_1', client_secret: 's' }), { status: 200 });
    if (/checkout\/orders/.test(String(url))) return new Response(JSON.stringify({ id: 'ord_1' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const out = { status: 200, json: null };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(v) { out.json = v; }, end() {} };
  try { await handler({ method: 'POST', headers: {}, query: action ? { action } : {}, body }, res); }
  finally { global.fetch = saveFetch; }
  return { ...out, calls };
}
const stripeParams = (r) => new URLSearchParams(r.calls.find((c) => /stripe\.com/.test(c.url)).body);

test('جلسة Stripe بلا دخول = 401 ولا نداء لـStripe', async () => {
  for (const tk of [undefined, '', 'garbage.token']) {
    const r = await call(checkout, 'create-checkout-session', { plan: 'pro', token: tk });
    assert.equal(r.status, 401);
    assert.equal(r.calls.length, 0, 'لا جلسة دفع تُنشأ');
  }
});

test('الافتراضيّ يدويّ: دفعة واحدة بلا تجديد ومنسوبة للحساب', async () => {
  const r = await call(checkout, 'create-checkout-session', { plan: 'pro', token: token('omar') });
  assert.equal(r.status, 200);
  const p = stripeParams(r);
  assert.equal(p.get('mode'), 'payment');
  assert.equal(p.get('line_items[0][price_data][recurring][interval]'), null);
  assert.equal(p.get('subscription_data[metadata][plan]'), null);
  assert.equal(p.get('metadata[username]'), 'omar');
  assert.equal(p.get('metadata[plan]'), 'pro');
});

test('autoRenew=true وحده يصنع اشتراكًا شهريًّا يحمل الحساب لفواتير التجديد', async () => {
  const r = await call(checkout, 'create-checkout-session', { plan: 'img_pro', token: token('omar'), autoRenew: true });
  const p = stripeParams(r);
  assert.equal(p.get('mode'), 'subscription');
  assert.equal(p.get('line_items[0][price_data][recurring][interval]'), 'month');
  assert.equal(p.get('subscription_data[metadata][username]'), 'omar');
  assert.equal(p.get('subscription_data[metadata][plan]'), 'img_pro');
  const loose = await call(checkout, 'create-checkout-session', { plan: 'pro', token: token('omar'), autoRenew: 'true' });
  assert.equal(stripeParams(loose).get('mode'), 'payment', 'قيمة غير true الصريحة لا تفعّل التجديد');
});

test('رزمة النقاط دفعة واحدة دائمًا ولو طُلب التجديد', async () => {
  const r = await call(checkout, 'create-checkout-session', { plan: 'pack300', token: token('omar'), autoRenew: true });
  assert.equal(stripeParams(r).get('mode'), 'payment');
});

test('Apple/Google Pay بلا دخول = 401 ولا نيّة دفع', async () => {
  const r = await call(checkout, 'create-payment-intent', { plan: 'basic' });
  assert.equal(r.status, 401);
  assert.equal(r.calls.length, 0);
  const ok = await call(checkout, 'create-payment-intent', { plan: 'basic', token: token('omar') });
  assert.equal(ok.status, 200);
  assert.equal(stripeParams(ok).get('metadata[username]'), 'omar');
});

test('PayPal create بلا دخول = 401 ولا طلب دفع', async () => {
  const r = await call(paypal, '', { action: 'create', plan: 'pro' });
  assert.equal(r.status, 401);
  assert.ok(!r.calls.some((c) => /checkout\/orders/.test(c.url)), 'لا طلب PayPal');
  const ok = await call(paypal, '', { action: 'create', plan: 'pro', token: token('omar') });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.id, 'ord_1');
});

test('العميل: الزائر يُحوَّل للتسجيل بدل نافذة الدفع، والخطّة تُحفظ للعودة', () => {
  const src = read('js/app-06-checkout.js');
  const m = /function openCheckout\(plan\)\{[\s\S]*?\n\}\nwindow\.openCheckout/.exec(src);
  assert.ok(m, 'openCheckout موجودة');
  const fn = m[0].replace(/\nwindow\.openCheckout$/, '');
  let loginReason = null, overlayShown = false;
  const ctx = {
    window: { requireLogin: (r) => { loginReason = r; } },
    authGet: () => '',
    document: { getElementById: (id) => (id === 'checkoutModalOverlay' ? { style: { set display(v) { overlayShown = true; } } } : null) },
    settingsToast() {}, t: (k) => k, omranIOSStoreApp: () => false,
  };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nopenCheckout("max");', ctx);
  assert.equal(loginReason, 'checkout');
  assert.equal(ctx.window.__pendingCheckoutPlan, 'max');
  assert.equal(overlayShown, false, 'لا نافذة دفع للزائر');

  const auth = read('js/app-01-boot-auth.js');
  assert.match(auth, /reason === 'checkout'\)\{ setMode\('signup'\); errBox\.textContent = curT\(\)\.checkoutLoginFirst/);
  assert.match(auth, /__pendingCheckoutPlan[\s\S]{0,200}window\.openCheckout\(pendingPlan\)/, 'يعود لنافذة الدفع بعد الدخول');
});

test('العميل: البطاقة ترسل اختيار التجديد، وPayPal يرسل التوكن', () => {
  const src = read('js/app-06-checkout.js');
  assert.match(src, /autoRenew: !!\(document\.getElementById\('checkoutAutoRenew'\) \|\| \{\}\)\.checked/);
  assert.match(src, /action: 'create', plan: checkoutCurrentPlan, token: authGet\('aiapp_auth_token'\)/);
  assert.match(src, /if \(arBox\) arBox\.checked = false;/, 'كلّ فتح يبدأ يدويًّا');
  assert.match(src, /arRow\.style\.display = \/\^pack\\d\+\$\/\.test/, 'الخيار مخفيّ لرزم النقاط');
});

test('نافذة الدفع: زرّ صغير للتجديد التلقائيّ، غير مفعّل افتراضيًّا', () => {
  const html = read('js/partials-settings.js');
  const row = /<label id="checkoutAutoRenewRow"[\s\S]*?<\/label>/.exec(html);
  assert.ok(row, 'الصفّ موجود');
  assert.match(row[0], /<input type="checkbox" id="checkoutAutoRenew"/);
  assert.doesNotMatch(row[0], /\bchecked\b/);
  assert.match(row[0], /data-i18n="checkoutAutoRenew"/);
  assert.ok(html.indexOf('checkoutAutoRenewRow') > html.indexOf('startStripeCheckout()'), 'تحت زرّ البطاقة');
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=675'));
  assert.ok(read('js/app-04-i18n-state.js').includes(".js?v=698'"));
});

test('النصّان الجديدان في ١٤ لغة بلا اسم مزوّد', () => {
  const data = read('js/app-03-i18n-data.js');
  for (const k of ['checkoutLoginFirst', 'checkoutAutoRenew']) {
    assert.equal((data.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k + ' في العربيّة والإنجليزيّة');
    for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
      const line = read('i18n/' + lg + '.js').split('\n').find((l) => new RegExp('"?' + k + '"?:').test(l));
      assert.ok(line, k + ' في ' + lg);
      assert.doesNotMatch(line, /stripe|paypal|claude|gemini|openai|gpt/i);
    }
  }
});
