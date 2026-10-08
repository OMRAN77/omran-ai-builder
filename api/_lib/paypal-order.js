// Vercel Serverless Function: creates & captures PayPal orders using the
// PayPal REST API directly (no SDK dependency). Uses PAYPAL_CLIENT_ID +
// PAYPAL_SECRET env vars, and PAYPAL_MODE ('live' default, or 'sandbox').
//
// 'capture' يشحن الحساب من الخادم حين يعلن PayPal نفسه COMPLETED، بالمبلغ الملتقَط لا باسم خطّة يرسلها العميل،
// وعبر grantPlanToUser نفسها (حجز ذرّيّ لرقم الطلب، وبذر الرصيد من السجلّ، وتتبّع الاسم بعد تغييره).
// v-paypal-honest: فشل الشحن بعد السحب لا يُبلع صامتًا — يُسجَّل ويُردّ credited:false، و'claim' يعيده لطلب مكتمل.
const { verifyToken } = require('./auth.js');
const { MEDIA_PLANS } = require('./_mediaPlans.js');
const { grantPlanToUser, wasNamed, RETIRED } = require('./create-checkout-session.js');

const PLANS = {
  // v-plans-2026-09: يجب أن تطابق create-checkout-session.js (نقاط ومبالغ).
  // v-plan-routing (قرار المالك ٢٠ سبتمبر): Plus ٣٦٠ · Pro ٩٢٠ · Max ٣٬٢٠٠ نقطة شهريًّا.
  basic: { amount: '10.00', points: 360, name: 'Plus — 360 نقطة / Plus — 360 pts' },
  pro: { amount: '20.00', points: 920, name: 'Pro — 920 نقطة / Pro — 920 pts' },
  max: { amount: '100.00', points: 3200, name: 'Max — 3,200 نقطة / Max — 3,200 pts' },
  // رزم شحن النقاط (pack:true): تُضيف نقاطًا فقط ولا تغيّر الباقة ولا تاريخها. المبالغ مميّزة عن الباقات
  // لأنّ الالتقاط يطابق بالمبلغ الملتقَط، ومطابقة لأسعار أزرار «باقات النقاط» في الإعدادات.
  pack100: { amount: '4.99', points: 100, pack: true, name: '100 نقطة / 100 pts' },
  pack300: { amount: '12.99', points: 300, pack: true, name: '300 نقطة / 300 pts' },
  pack700: { amount: '24.99', points: 700, pack: true, name: '700 نقطة / 700 pts' },
  pack900: { amount: '34.99', points: 1050, pack: true, name: '1,050 نقطة / 1,050 pts' }, // v-fair-video
};
// v-media-plans: اشتراكات الصور/الفيديو بمبالغ مميّزة (الالتقاط يطابق بالمبلغ) ورصيد منفصل بلا نقاط.
// الصور والفيديو بنفس المبلغ، فالطلب يحمل الخطّة في custom_id ويُتحقّق أنّ مبلغها هو الملتقَط.
// v-media-merge: img_/vid_ متوقّفة — لا طلب جديد لها، والتقاط طلب أُنشئ قبل الإيقاف (أو claim له) يُمنح كما كان.
for (const [k, p] of Object.entries(MEDIA_PLANS)) PLANS[k] = { amount: p.paypal, points: 0, media: p.media, name: p.name, retired: !!p.retired };
// v-media-merge (المراجعة المعاكسة): create يردّ img_/vid_ بـ410، لكنّ طلب PayPal يُنشأ ويُلتقط أيضًا من حزمة PayPal في المتصفّح
// بالمعرّف العامّ وcustom_id يكتبه المشتري — فطلب لخطّة متوقّفة أُنشئ بعد الإيقاف لم يمرّ بنا. المال سُحب، فيُمنح ما يُباع اليوم
// بالمبلغ نفسه (media_<الدرجة>) لا القديمة (img_max = ٢٠٣٠٢ فلس صور مقابل ١٢٥٠٠). الحدّ = وقت التزام الإيقاف؛ طلب بلا وقت إنشاء لا يُفترض قديمًا.
const RETIRED_SINCE = Date.parse('2026-10-08T16:31:39Z');
function grantablePlan(plan, order) {
  if (!PLANS[plan] || !PLANS[plan].retired || Date.parse(order && order.create_time) < RETIRED_SINCE) return plan;
  return 'media_' + String(plan).split('_')[1];
}

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

// الخطّة من المبلغ الملتقَط فعلًا (custom_id يميّز الصور عن الفيديو بالمبلغ نفسه)، وصاحب الطلب من reference_id.
function matchOrder(order) {
  const pu = (order && order.purchase_units && order.purchase_units[0]) || {};
  const capture = pu.payments && pu.payments.captures && pu.payments.captures[0];
  const amountValue = capture && capture.amount && capture.amount.value;
  const customId = (capture && capture.custom_id) || pu.custom_id;
  const plan = (customId && PLANS[customId] && PLANS[customId].amount === amountValue)
    ? customId
    : Object.keys(PLANS).find((p) => PLANS[p].amount === amountValue && !PLANS[p].media);
  // v-pay-refund: رقم الالتقاط ومبلغه بالسنت — الاسترداد والاعتراض يصلان برقم الالتقاط لا الطلب.
  return { plan: plan || null, ref: String(pu.reference_id || ''), capture: String((capture && capture.id) || ''), cents: Math.round(Number(amountValue) * 100) || 0 };
}

async function creditOrder(order, username) {
  if (!username) return { credited: false, reason: 'auth' };
  const m = matchOrder(order);
  if (!m.plan) return { credited: false, reason: 'no_plan' };
  if (m.ref && m.ref !== username && !(await wasNamed(username, m.ref))) return { credited: false, reason: 'not_owner' };
  m.plan = grantablePlan(m.plan, order);
  const g = await grantPlanToUser(username, m.plan, 'lastPaypalOrderId', order.id);
  if (g.error) return { credited: false, reason: 'account' };
  // v-pay-refund: رقم الالتقاط لسجلّ المنح — للمنح الجديد وحده (claim بعد استرداد لا يعيد كتابة السجلّ وعلامة سحبه). لا يرمي.
  if (m.capture && !g.alreadyGranted) await require('./pay-refund.js').linkGrant(order.id, { refs: [m.capture], amount: m.cents, currency: 'usd' });
  const planGranted = PLANS[m.plan].media ? m.plan : (PLANS[m.plan].pack ? (g.plan || null) : m.plan);
  return { credited: true, planGranted, pointsAdded: g.pointsAdded, balance: g.balance, alreadyGranted: !!g.alreadyGranted };
}

async function safeCredit(order, username) {
  try { return await creditOrder(order, username); } catch (e) {
    // المال سُحب والشحن فشل (مثل امتلاء القاعدة) — لا صمت: سجلّ أخطاء المالك، والعميل يعيد المحاولة بـclaim.
    console.error('[paypal] credit failed after capture', order && order.id, e && e.message);
    try { require('./log-error.js').logError('paypal:credit', e, { orderId: order && order.id, user: username }); } catch (e2) { /* guard-ok — التسجيل تحسين لا شرط */ }
    return { credited: false, reason: 'error' };
  }
}

function creditReply(data, out) {
  return { status: data.status, id: data.id, planGranted: out.planGranted || null, pointsAdded: out.pointsAdded == null ? null : out.pointsAdded,
    balance: out.balance == null ? null : out.balance, credited: !!out.credited, reason: out.credited ? undefined : out.reason };
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
      if (planInfo.retired) { res.status(410).json({ error: RETIRED, retired: true }); return; } // v-media-merge
      // v-checkout-login: طلب بلا حساب يُلتقط ولا يُنسب لأحد — لا طلب دفع بلا دخول.
      const buyer = verifyToken(body.token);
      if (!buyer) { res.status(401).json({ error: 'سجّل دخولك أوّلًا ثمّ اشترك / Please sign in first, then subscribe' }); return; }

      const r = await fetch(`${baseUrl()}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: String(buyer).slice(0, 256), // v-paypal-honest: الطلب لصاحبه — لا يشحنه حساب آخر يعرف رقمه
            description: planInfo.name,
            custom_id: String(body.plan),
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
      // لا التقاط بلا حساب صالح: المال كان يُسحب ثمّ لا يجد لمن يُشحن. بلا التقاط لا يتحرّك مال (الموافقة تنتهي وحدها).
      const username = verifyToken(token);
      if (!username) { res.status(401).json({ error: 'الجلسة منتهية، سجّل الدخول ثمّ أكمل الدفع / Session expired — sign in and finish the payment' }); return; }
      const r = await fetch(`${baseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation', // v-media-merge: الطلب كاملًا بوقت إنشائه (create_time) — grantablePlan
        },
      });
      const data = await r.json();
      if (!r.ok) { res.status(500).json({ error: data.message || 'PayPal capture error' }); return; }
      // الشحن من الخادم حين يعلن PayPal نفسه COMPLETED فقط (لا ثقة بنجاح الواجهة).
      const out = data.status === 'COMPLETED' ? await safeCredit(data, username) : { credited: false, reason: 'not_completed' };
      res.status(200).json(creditReply(data, out));
      return;
    }

    // v-paypal-honest: إعادة شحن طلب سُحب مبلغه ولم يُشحن (فشل عابر بعد الالتقاط). آمنة التكرار بالحجز الذرّيّ لرقم الطلب.
    if (action === 'claim') {
      const { orderId, token } = body;
      const username = verifyToken(token);
      if (!username) { res.status(401).json({ error: 'auth' }); return; }
      if (!orderId) { res.status(400).json({ error: 'Missing orderId' }); return; }
      const r = await fetch(`${baseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { res.status(r.status === 404 ? 404 : 502).json({ error: data.message || 'PayPal order lookup error' }); return; }
      if (data.status !== 'COMPLETED') { res.status(409).json({ status: data.status, credited: false, reason: 'not_completed' }); return; }
      // لطلبات هذا المسار وحدها (تحمل صاحبها في reference_id): الطلب الأقدم بلا صاحب شُحن بالمسار القديم ولا حجز ذرّيًّا
      // له، فإعادته من حساب آخر (أو من الحساب نفسه بعد طلب أحدث) كانت تشحنه مرّة ثانية.
      if (!matchOrder(data).ref) { res.status(409).json({ status: data.status, credited: false, reason: 'legacy' }); return; }
      res.status(200).json(creditReply(data, await safeCredit(data, username)));
      return;
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
};

// v-pay-refund: ويب هوك PayPal (api/webhook.js?src=paypal) يتحقّق من التوقيع برمز الخادم نفسه، ويعرف التقاطًا قديمًا بلا سجلّ بالطلب.
module.exports.getAccessToken = getAccessToken;
module.exports.baseUrl = baseUrl;
module.exports.matchOrder = matchOrder;
module.exports.RETIRED_SINCE = RETIRED_SINCE; // v-media-merge — للاختبار
