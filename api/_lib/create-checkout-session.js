// Vercel Serverless Function: creates a Stripe Checkout Session (hosted page) for
// Visa/Mastercard subscription payments, AND creates/verifies one-time Stripe
// PaymentIntents used by the in-modal Apple Pay / Google Pay buttons (Stripe
// Payment Request Button API). Uses STRIPE_SECRET_KEY env var.
// Works in TEST mode with a test key (sk_test_...) and in LIVE mode with a live
// key (sk_live_...) with ZERO code changes — just swap the env var when the
// business license is ready.
//
// IMPORTANT: creating a Checkout Session (or PaymentIntent) only starts the
// payment flow — it is NOT proof anything was actually paid. The frontend
// used to grant the plan client-side purely by reading `?checkout=success&plan=pro`
// back off the redirect URL, which anyone could fake by typing that URL
// directly. The `verify-checkout` / `verify-payment-intent` actions below
// close that hole: they call Stripe's server API to confirm the payment
// actually completed before ever touching the user's stored `plan`.
//
// KNOWN LIMITATION (flagged in the payment audit, not fixed here — needs a
// product decision): the "بطاقة" button below creates a real recurring
// Stripe *subscription* (mode: 'subscription'), so Stripe will keep billing
// the card every month — but this app has no Stripe webhook listening for
// `invoice.paid` on renewal, so only the FIRST successful checkout grants
// points/plan. Renewals are not currently re-credited automatically. The
// Apple Pay / Google Pay path added here is intentionally a plain one-time
// PaymentIntent (not a subscription) for the same reason: Payment Request
// Button does not create Stripe subscriptions on its own without an
// additional SetupIntent + server-side subscription-creation step. Fixing
// true recurring re-crediting requires a Stripe webhook endpoint verified
// with STRIPE_WEBHOOK_SECRET — see PAYMENT-AUDIT-REPORT.md.
const { verifyToken, getUser, putUser } = require('./auth.js');
const { kvIncrBy, kvGetRaw, kvSetIfAbsent } = require('./kv.js');

const PLANS = {
  basic: { amount: 1000, points: 500, name: 'عادية — 500 نقطة / Basic — 500 pts' },
  pro: { amount: 2000, points: 1000, name: 'متوسطة — 1,000 نقطة / Pro — 1,000 pts' },
  max: { amount: 10000, points: 5000, name: 'كبيرة — 5,000 نقطة / Premium — 5,000 pts' },
};

// Shared "the payment definitely happened, now grant it" logic used by both
// the Stripe Checkout Session flow (verifyCheckout) and the Apple Pay /
// Google Pay PaymentIntent flow (verifyPaymentIntent), so both stay
// consistent and a fix to one doesn't silently miss the other.
async function grantPlanToUser(username, plan, sourceField, sourceId) {
  const user = await getUser(username);
  if (!user || user.deleted) return { error: 'تعذر العثور على الحساب / Could not find the account', status: 404 };

  // أمان التكرار: نفس الجلسة/العملية لا تضيف النقاط مرتين — كان الحقل يُخزَّن
  // بلا فحص، فتكرار التحقق (تحديث صفحة النجاح، أو جسر الآيفون) كان يضاعفها.
  if (sourceField && sourceId && user[sourceField] === sourceId) {
    return { ok: true, plan, pointsAdded: 0, alreadyGranted: true, balance: Number(user.points || 0) };
  }

  user.plan = plan;
  user.planUpdatedAt = Date.now();
  if (sourceField) user[sourceField] = sourceId;

  // إضافة النقاط للرصيد — نفس مفتاح الرصيد الحيّ المستخدم في points.js
  // (اسم المستخدم بأحرف صغيرة ومقصوص لضمان مطابقة نفس المفتاح دائمًا).
  const balanceKey = 'points:' + encodeURIComponent(String(username).trim().toLowerCase());
  const raw = await kvGetRaw(balanceKey);
  if (raw === null || raw === undefined || String(raw) === '') {
    await kvSetIfAbsent(balanceKey, 0);
  }
  const newBalance = await kvIncrBy(balanceKey, PLANS[plan].points);
  user.points = Number(newBalance);

  await putUser(username, user);
  return { ok: true, plan, pointsAdded: PLANS[plan].points, balance: Number(newBalance) };
}

async function createCheckoutSession(req, res) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      res.status(500).json({ error: 'الدفع غير مفعّل بعد (STRIPE_SECRET_KEY مفقود) / Payment not configured yet' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { plan, origin, token } = body;
    const planInfo = PLANS[plan];
    if (!planInfo) { res.status(400).json({ error: 'Invalid plan' }); return; }

    const username = verifyToken(token);

    const base = origin || 'https://omran-ai-builder.vercel.app';
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', String(planInfo.amount));
    params.append('line_items[0][price_data][recurring][interval]', 'month');
    params.append('line_items[0][price_data][product_data][name]', planInfo.name);
    params.append('metadata[plan]', plan);
    if (username) params.append('metadata[username]', username);
    // v-webhook: نفس البيانات على الاشتراك نفسه — فتحملها فواتير التجديد
    // الشهري ويعرف الويب هوك لمن يضيف نقاط كل شهر (كان التجديد بلا شحن).
    params.append('subscription_data[metadata][plan]', plan);
    if (username) params.append('subscription_data[metadata][username]', username);
    params.append('success_url', `${base}/?checkout=success&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`);
    params.append('cancel_url', `${base}/?checkout=cancel`);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(500).json({ error: data.error?.message || 'Stripe error' });
      return;
    }

    // id يُحفظ في العميل قبل التحويل — فعلى آيفون المثبَّت (حيث يهبط نجاح
    // الدفع في ورقة متصفح منفصلة بلا توكن) يتحقّق التطبيق بنفسه عند العودة.
    res.status(200).json({ url: data.url, id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

async function verifyCheckout(req, res) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      res.status(500).json({ error: 'الدفع غير مفعّل بعد (STRIPE_SECRET_KEY مفقود) / Payment not configured yet' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { session_id, token } = body;
    if (!session_id) { res.status(400).json({ error: 'Missing session_id' }); return; }

    const username = verifyToken(token);
    if (!username) {
      res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      return;
    }

    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(500).json({ error: data.error?.message || 'Stripe error' });
      return;
    }

    if (data.payment_status !== 'paid') {
      res.status(402).json({ ok: false, error: 'الدفع لم يكتمل بعد / Payment not completed yet' });
      return;
    }

    if (data.metadata && data.metadata.username && data.metadata.username !== username) {
      res.status(403).json({ error: 'هذه الجلسة لا تخص هذا الحساب / This session does not belong to this account' });
      return;
    }

    const plan = data.metadata && data.metadata.plan;
    if (!plan || !PLANS[plan]) {
      res.status(400).json({ error: 'Invalid or missing plan in session metadata' });
      return;
    }

    const grant = await grantPlanToUser(username, plan, 'lastStripeSessionId', session_id);
    if (grant.error) { res.status(grant.status || 500).json({ error: grant.error }); return; }
    res.status(200).json(grant);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

// ===== Apple Pay / Google Pay via Stripe Payment Request Button API =====
// These create a plain one-time PaymentIntent (NOT a subscription — see the
// KNOWN LIMITATION note at the top of this file) for the same USD amount as
// the plan, so the frontend's Payment Request Button can confirm it directly
// on-page without a redirect.
async function createPaymentIntent(req, res) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      res.status(500).json({ error: 'الدفع غير مفعّل بعد (STRIPE_SECRET_KEY مفقود) / Payment not configured yet' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { plan, token } = body;
    const planInfo = PLANS[plan];
    if (!planInfo) { res.status(400).json({ error: 'Invalid plan' }); return; }

    const username = verifyToken(token);

    const params = new URLSearchParams();
    params.append('amount', String(planInfo.amount));
    params.append('currency', 'usd');
    params.append('payment_method_types[0]', 'card');
    params.append('description', planInfo.name);
    params.append('metadata[plan]', plan);
    if (username) params.append('metadata[username]', username);

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(500).json({ error: data.error?.message || 'Stripe error' });
      return;
    }

    res.status(200).json({ id: data.id, clientSecret: data.client_secret });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

async function verifyPaymentIntent(req, res) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      res.status(500).json({ error: 'الدفع غير مفعّل بعد (STRIPE_SECRET_KEY مفقود) / Payment not configured yet' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { payment_intent_id, token } = body;
    if (!payment_intent_id) { res.status(400).json({ error: 'Missing payment_intent_id' }); return; }

    const username = verifyToken(token);
    if (!username) {
      res.status(401).json({ error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' });
      return;
    }

    const stripeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(payment_intent_id)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      res.status(500).json({ error: data.error?.message || 'Stripe error' });
      return;
    }

    if (data.status !== 'succeeded') {
      res.status(402).json({ ok: false, error: 'الدفع لم يكتمل بعد / Payment not completed yet' });
      return;
    }

    if (data.metadata && data.metadata.username && data.metadata.username !== username) {
      res.status(403).json({ error: 'هذه العملية لا تخص هذا الحساب / This payment does not belong to this account' });
      return;
    }

    const plan = data.metadata && data.metadata.plan;
    if (!plan || !PLANS[plan]) {
      res.status(400).json({ error: 'Invalid or missing plan in payment metadata' });
      return;
    }

    const grant = await grantPlanToUser(username, plan, 'lastStripePaymentIntentId', payment_intent_id);
    if (grant.error) { res.status(grant.status || 500).json({ error: grant.error }); return; }
    res.status(200).json(grant);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const routedAction = (req.query && req.query.action) || '';
  if (routedAction === 'verify-checkout') return verifyCheckout(req, res);
  if (routedAction === 'create-payment-intent') return createPaymentIntent(req, res);
  if (routedAction === 'verify-payment-intent') return verifyPaymentIntent(req, res);
  return createCheckoutSession(req, res);
};

// v-webhook: يستعملهما ويب هوك سترايب (api/webhook.js) — نفس منطق المنح
// وأمان التكرار، فلا ازدواج بين مسار العودة والويب هوك.
module.exports.grantPlanToUser = grantPlanToUser;
module.exports.PLANS = PLANS;
