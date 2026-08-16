// Vercel Serverless Function: creates & captures PayPal orders using the
// PayPal REST API directly (no SDK dependency). Uses PAYPAL_CLIENT_ID +
// PAYPAL_SECRET env vars. Auto-detects sandbox vs live based on key type is
// not reliable, so we use PAYPAL_MODE env var ('sandbox' default, or 'live').
//
// The 'capture' action below also updates the caller's stored `plan`
// server-side once PayPal itself confirms the capture is COMPLETED, instead
// of leaving plan upgrades entirely to frontend logic. Requires an optional
// `token` in the request body (today's frontend doesn't send one yet — see
// the account-update section below for the backward-compatible behavior
// when it's missing).
const { verifyToken, getUser, putUser } = require('./auth.js');

const PLANS = {
  basic: { amount: '10.00', name: 'خطة 10$ - 300 رسالة شهريًا / Basic Plan' },
  pro: { amount: '20.00', name: 'خطة 20$ - رسائل غير محدودة / Pro Plan' },
  max: { amount: '100.00', name: 'خطة Max 100$ - 5000 نقطة / Max Plan' },
};

function baseUrl() {
  return (process.env.PAYPAL_MODE !== 'sandbox')
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getAccessToken() {
  // Values pasted into dashboards often arrive with stray whitespace, line
  // breaks, or wrapping quotes — clean them instead of failing auth silently.
  const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
  const clientId = clean(process.env.PAYPAL_CLIENT_ID);
  const secret = clean(process.env.PAYPAL_SECRET);
  if (!clientId || !secret) return null;
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const r = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await r.json();
  return data.access_token || null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { action } = body;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      res.status(500).json({ error: 'الدفع عبر PayPal غير مفعّل بعد / PayPal not configured yet' });
      return;
    }

    if (action === 'create') {
      const planInfo = PLANS[body.plan];
      if (!planInfo) { res.status(400).json({ error: 'Invalid plan' }); return; }

      const r = await fetch(`${baseUrl()}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            description: planInfo.name,
            amount: { currency_code: 'USD', value: planInfo.amount },
          }],
        }),
      });
      const data = await r.json();
      if (!r.ok) { res.status(500).json({ error: data.message || 'PayPal error' }); return; }
      res.status(200).json({ id: data.id });
      return;
    }

    if (action === 'capture') {
      const { orderId, token } = body;
      if (!orderId) { res.status(400).json({ error: 'Missing orderId' }); return; }
      const r = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await r.json();
      if (!r.ok) { res.status(500).json({ error: data.message || 'PayPal capture error' }); return; }

      // Server-side plan grant: only once PayPal itself reports the capture
      // as COMPLETED (never trust the frontend's own success handling for
      // this). The plan is derived from the actually-captured amount
      // (matched against PLANS) rather than trusting a client-supplied plan
      // name, so a tampered request can't claim a cheaper/free plan.
      let planGranted = null;
      if (data.status === 'COMPLETED') {
        try {
          const capture = data.purchase_units
            && data.purchase_units[0]
            && data.purchase_units[0].payments
            && data.purchase_units[0].payments.captures
            && data.purchase_units[0].payments.captures[0];
          const amountValue = capture && capture.amount && capture.amount.value;
          const matchedPlan = Object.keys(PLANS).find((p) => PLANS[p].amount === amountValue);
          const username = verifyToken(token);
          if (username && matchedPlan) {
            const user = await getUser(username);
            if (user && !user.deleted) {
              user.plan = matchedPlan;
              user.planUpdatedAt = Date.now();
              user.lastPaypalOrderId = data.id;
              await putUser(username, user);
              planGranted = matchedPlan;
            }
          }
          // If no token was sent (current frontend) or it didn't verify, the
          // PayPal payment itself still succeeded/was captured — we simply
          // can't attach it to an account yet. Frontend should start sending
          // `token` with the capture call so planGranted comes back non-null.
        } catch (e) { /* best-effort account update; capture itself already succeeded with PayPal */ }
      }

      res.status(200).json({ status: data.status, id: data.id, planGranted });
      return;
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
