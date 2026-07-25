// Vercel Serverless Function: creates a Stripe Checkout Session (hosted page) for
// Visa/Mastercard subscription payments. Uses STRIPE_SECRET_KEY env var.
// Works in TEST mode with a test key (sk_test_...) and in LIVE mode with a live
// key (sk_live_...) with ZERO code changes — just swap the env var when the
// business license is ready.
//
// IMPORTANT: creating a Checkout Session only starts the payment flow — it is
// NOT proof anything was actually paid. The frontend used to grant the plan
// client-side purely by reading `?checkout=success&plan=pro` back off the
// redirect URL, which anyone could fake by typing that URL directly. The
// `verify-checkout` action below closes that hole: it calls Stripe's server
// API to confirm payment_status === 'paid' for the given session_id before
// ever touching the user's stored `plan`.
const { verifyToken, getUser, putUser } = require('./auth.js');

const PLANS = {
  basic: { amount: 500, name: 'خطة 5$ - 300 رسالة شهريًا / Basic Plan - 300 msgs/mo' },
  pro: { amount: 1500, name: 'خطة 15$ - رسائل غير محدودة / Pro Plan - Unlimited msgs' },
};

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

    // Optional: if the caller is logged in and sends their session token, we
    // tag the Stripe session with the username so verify-checkout can
    // double-check the session belongs to the account claiming it. Not
    // required today (current frontend doesn't send a token here yet), so
    // this is purely additive and never blocks session creation.
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

    res.status(200).json({ url: data.url });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

// Server-side payment verification. Input: { session_id, token }. Requires a
// valid logged-in session token (a plan can only be granted to a real
// account — it cannot be applied anonymously). Confirms with Stripe directly
// that the session was actually paid, reads the plan from the session's own
// metadata (set above at creation time, so the client cannot lie about which
// plan was purchased), and only then updates the user record.
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

    // If the session was tagged with a username at creation time, the
    // caller redeeming it must be that same account.
    if (data.metadata && data.metadata.username && data.metadata.username !== username) {
      res.status(403).json({ error: 'هذه الجلسة لا تخص هذا الحساب / This session does not belong to this account' });
      return;
    }

    const plan = data.metadata && data.metadata.plan;
    if (!plan || !PLANS[plan]) {
      res.status(400).json({ error: 'Invalid or missing plan in session metadata' });
      return;
    }

    const user = await getUser(username);
    if (!user || user.deleted) {
      res.status(404).json({ error: 'تعذر العثور على الحساب / Could not find the account' });
      return;
    }
    user.plan = plan;
    user.planUpdatedAt = Date.now();
    user.lastStripeSessionId = session_id;
    await putUser(username, user);

    res.status(200).json({ ok: true, plan });
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
  if (routedAction === 'verify-checkout') {
    return verifyCheckout(req, res);
  }
  return createCheckoutSession(req, res);
};
