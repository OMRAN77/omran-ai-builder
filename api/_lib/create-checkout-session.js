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
// التجديد: «بطاقة» دفعة لشهر افتراضيًّا (mode=payment)، واشتراك متجدّد لمن فعّل autoRenew؛ فواتير التجديد يشحنها
// الويب هوك (api/webhook.js، invoice.paid) بـgrantPlanToUser نفسها. Apple Pay / Google Pay دفعة واحدة (PaymentIntent).
const { verifyToken, getUser, putUser } = require('./auth.js');
const { kvIncrBy, kvSetIfAbsent, kvDel } = require('./kv.js');
const { MEDIA_PLANS, grantMedia } = require('./_mediaPlans.js');

const PLANS = {
  // v-plans-2026-09 (قرار المالك ١٢ سبتمبر): الباقات الأكبر تأخذ سعر نقطة أفضل
  // (كانت الثلاث بنفس السعر فلا حافز للترقية). يجب أن تطابق paypal-order.js
  // وبطاقات partials-settings.js وpricing.html.
  // v-plan-routing (قرار المالك ٢٠ سبتمبر): Plus ٣٦٠ · Pro ٩٢٠ · Max ٣٬٢٠٠ نقطة شهريًّا.
  basic: { amount: 1000, points: 360, name: 'Plus — 360 نقطة / Plus — 360 pts' },
  pro: { amount: 2000, points: 920, name: 'Pro — 920 نقطة / Pro — 920 pts' },
  max: { amount: 10000, points: 3200, name: 'Max — 3,200 نقطة / Max — 3,200 pts' },
  // رزم شحن النقاط (pack:true): دفعة واحدة (mode=payment لا اشتراك)، تُضيف نقاطًا ولا تغيّر الباقة.
  // يجب أن تطابق paypal-order.js والأسعار على أزرار «باقات النقاط» في الإعدادات.
  pack100: { amount: 499, points: 100, pack: true, name: '100 نقطة / 100 pts' },
  pack300: { amount: 1299, points: 300, pack: true, name: '300 نقطة / 300 pts' },
  pack700: { amount: 2499, points: 700, pack: true, name: '700 نقطة / 700 pts' },
  // v-fair-video (قرار المالك ٥ أكتوبر): الرزمة الكبرى كانت أغلى للنقطة من ٧٠٠ — ١٬٠٥٠ بالسعر نفسه (المفتاح pack900 باقٍ لجلسات الطريق).
  pack900: { amount: 3499, points: 1050, pack: true, name: '1,050 نقطة / 1,050 pts' },
};
// v-media-plans: اشتراكات الصور/الفيديو — شهريّة، بلا نقاط ولا تغيير للباقة (رصيدها منفصل في _mediaPlans.js).
for (const [k, p] of Object.entries(MEDIA_PLANS)) PLANS[k] = { amount: p.amount, points: 0, media: p.media, name: p.name };

/* v-aed-checkout (طلب المالك ٥ أكتوبر، «الدرهم فقط»): الأسعار تُعرض بعملة البلد (js/currency.js) والدفع كان بالدولار
   وحده — فالمشترك في الإمارات يرى ٣٧٫٥ د.إ وتخصم بطاقته ١٠$ برسوم تحويل. الآن يدفع بالدرهم السعر المعروض نفسه بالفلس
   (pretty(usd × 3.6725) — يثبّت التطابقَ tests/aed-checkout.test.cjs)؛ بقيّة الدول بالدولار كما كانت. العميل يختار العملة لا
   المبلغ، وأيّ عملة أخرى = الدولار. PayPal بالدولار دائمًا (لا يدعم الدرهم). */
const AED_FILS = { basic: 3750, pro: 7500, max: 37500, pack100: 1900, pack300: 4800, pack700: 9500, pack900: 13000 };
const MEDIA_AED_FILS = { basic: 3750, pro: 7500, max: 37500 }; // img_/vid_/maha_ بنفس أسعار المحادثة بالدرهم
function priceFor(plan, currency) { // plan معروف في PLANS (يتحقّق منه المستدعي)
  const aed = PLANS[plan].media ? MEDIA_AED_FILS[String(plan).split('_')[1]] : AED_FILS[plan];
  if (String(currency || '').toLowerCase() === 'aed' && aed > 0) return { currency: 'aed', amount: aed };
  return { currency: 'usd', amount: PLANS[plan].amount };
}

const LOGIN_FIRST = 'سجّل دخولك أوّلًا ثمّ اشترك / Please sign in first, then subscribe';

/* v-pay-once (فحص الاشتراكات ٥ أكتوبر): «أمان التكرار» كان يتذكّر آخر دفعة وحدها وبلا قفل — دفعتان حقيقيّتان
   تُعادان بالتناوب (A، B، A…) تُشحنان بلا نهاية، وعشرة طلبات تحقّق متزامنة لدفعة واحدة تُشحن عشر مرّات (أُثبت محلّيًّا).
   الآن كلّ رقم دفعة يُحجز حجزًا ذرّيًّا (SET NX) قبل الشحن: أوّل نداء يشحن وكلّ ما بعده «سبق الشحن» — في التحقّق
   والويب هوك وApple/Google Pay وPayPal معًا. فشل الشحن بعد الحجز يفكّه، فتعيد المحاولة (الويب هوك يعيد ثلاثة أيّام). */
const CLAIM_TTL_SEC = 400 * 86400;
const claimKey = (field, id) => 'paid:' + field + ':' + String(id).slice(0, 200);
// التحقّق من العميل (العودة وجسر الآيفون) لدفعة حديثة فقط: ما سبق الحجز الذرّيّ لا يُعاد بعد النشر؛ الويب هوك (الموقَّع) بلا حدّ.
const VERIFY_WINDOW_SEC = 72 * 3600;
const tooOld = (created) => Number(created) > 0 && (Date.now() / 1000 - Number(created)) > VERIFY_WINDOW_SEC;

/* v-rename-move: الاشتراك المتجدّد والجلسة يحملان الاسم وقت الشراء؛ بعد تغيير الاسم يصير السجلّ القديم
   { deleted, movedTo } فكان التجديد يُخصم ولا يُشحن لأحد. الشحن يتبع السجلّ الجديد. */
async function liveAccount(username) {
  let name = String(username || '');
  let user = await getUser(name);
  // ٣٢ قفزة كسلسلة الشواهد في auth.js (tombstoneLeadsTo): بخمس كان حساب غيّر اسمه ست مرّات يُحلّ إلى شاهد، فيرمي withAccount BUSY للأبد.
  for (let i = 0; i < 32 && user && user.deleted && user.movedTo; i++) { name = String(user.movedTo); user = await getUser(name); }
  return { name, user };
}
/* v-acct-lock (المراجعة المعاكسة الثالثة لـv-pay-refund): سجلّ الحساب يُكتب كاملًا من قراءة سابقة (KV بلا CAS)، فسحبان معًا على
   خانتين (باقة المحادثة وباقة الفيديو، أو باقة ورزمة نقاط) أو منحٌ مع سحب على الحساب نفسه يكتب أحدهما نسخته القديمة فوق ما كتبه
   الآخر — فتعود فترة مسحوبة أو يضيع شراء جديد. المنح (grantPlanToUser) والسحب (pay-refund.js) يأخذان قفلًا للحساب ويقرآن داخله
   نسخة طازجة فيعدّلان ما يملكانه وحده. لم يُنل القفل في ~٨ ثوانٍ ⇒ رمي قبل أيّ أثر (non-2xx فيعيد المرسل). صرف النقاط لا يأخذه
   (المسار الساخن)؛ نافذته تُضيَّق في pay-refund.js. */
const ACCT_LOCK_TTL_SEC = 20;
const ACCT_LOCK_WAIT_MS = 8000;
const BUSY = 'الحساب مشغول بعمليّة دفع أخرى، أعد المحاولة بعد لحظات / Account busy with another payment, please retry in a moment';
const acctLockKey = (name) => 'db/acct-lock/' + encodeURIComponent(String(name || '').trim().toLowerCase());
async function withAccount(username, fn) {
  const name = (await liveAccount(username)).name;
  const key = acctLockKey(name);
  const until = Date.now() + ACCT_LOCK_WAIT_MS;
  for (let wait = 40; !(await kvSetIfAbsent(key, '1', ACCT_LOCK_TTL_SEC)); wait = Math.min(400, Math.round(wait * 1.5))) {
    if (Date.now() + wait > until) throw new Error(BUSY);
    await new Promise((r) => setTimeout(r, wait + Math.floor(Math.random() * wait)));
  }
  try {
    const acct = await liveAccount(name); // طازجة داخل القفل
    if (acct.name !== name) throw new Error(BUSY); // غيّر اسمه بين القراءة والقفل: الإعادة تقفل اسمه الجديد
    return await fn(acct.name, acct.user);
  } finally { await kvDel(key); } // kvDel لا يرمي: بعد أثرٍ تمّ لا يُفشل فكُّ القفل العمليّة
}

// هل كان هذا الحساب يحمل ذلك الاسم قبل تغييره؟ (جلسة دفع بدأت قبل تغيير الاسم بلحظات، أو اشتراك قديم)
async function wasNamed(username, oldName) {
  if (!username || !oldName) return false;
  try { const u = await getUser(username); return !!(u && Array.isArray(u.prevUsernames) && u.prevUsernames.includes(String(oldName))); } catch (e) { return false; }
}

/* v-pay-refund: سجلّ ما منحته الدفعة برقمها وأرقامها الأخرى (meta.refs: payment_intent/invoice/charge) ومبلغها — يقرؤه
   الاسترداد والاعتراض البنكيّ (pay-refund.js) ليسحب ما منحته هي بالضبط. بعد نجاح المنح وأفضل جهد: لا يرمي، فلا يُفشل منحًا تمّ. */
async function noteGrant(username, plan, sourceField, sourceId, meta, user, prev) {
  if (!sourceId) return;
  const p = PLANS[plan];
  const m = meta || {};
  const at = p.media ? (user.media && user.media[p.media] && user.media[p.media].at) : (p.pack ? null : user.planUpdatedAt);
  await require('./pay-refund.js').recordGrant({
    id: String(sourceId), field: sourceField || null, username, plan, points: p.points, media: p.media || null, at: Number(at) || null,
    amount: Number(m.amount) > 0 ? Math.round(Number(m.amount)) : null, currency: m.currency ? String(m.currency).toLowerCase() : null,
    refs: Array.isArray(m.refs) ? m.refs : [],
    prev: prev || null, // الفترة التي حلّت هذه الدفعة محلّها — تعود إن استُردّت هذه كاملة وتلك سارية غير مسحوبة
  });
}

// Shared "the payment definitely happened, now grant it" logic used by both
// the Stripe Checkout Session flow (verifyCheckout) and the Apple Pay /
// Google Pay PaymentIntent flow (verifyPaymentIntent), so both stay
// consistent and a fix to one doesn't silently miss the other.
// meta (اختياريّ، v-pay-refund): { refs, amount, currency } لسجلّ المنح — لا يغيّر المنح نفسه.
// v-acct-lock: تحت قفل الحساب وعلى نسخته الطازجة — سحبٌ متزامن لا يكتب فوق هذا المنح ولا هذا فوقه.
async function grantPlanToUser(username, plan, sourceField, sourceId, meta) {
  return withAccount(username, (name, user) => grantLocked(name, user, plan, sourceField, sourceId, meta));
}
async function grantLocked(username, user, plan, sourceField, sourceId, meta) {
  if (!user || user.deleted) return { error: 'تعذر العثور على الحساب / Could not find the account', status: 404 };

  // أمان التكرار: نفس الجلسة/العملية لا تضيف النقاط مرتين — كان الحقل يُخزَّن
  // بلا فحص، فتكرار التحقق (تحديث صفحة النجاح، أو جسر الآيفون) كان يضاعفها.
  const already = { ok: true, plan, pointsAdded: 0, alreadyGranted: true, balance: Number(user.points || 0) };
  if (sourceField && sourceId && user[sourceField] === sourceId) return already;
  const claim = (sourceField && sourceId) ? claimKey(sourceField, sourceId) : null;
  if (claim && !(await kvSetIfAbsent(claim, username, CLAIM_TTL_SEC))) return already; // v-pay-once

  try {
    const prev = await require('./pay-refund.js').priorOf(user, username, PLANS[plan]); // v-pay-refund: قبل أن تُستبدل الفترة. لا يرمي
    if (PLANS[plan].media) {
      if (sourceField) user[sourceField] = sourceId;
      const g = await grantMedia(user, username, plan);
      if (g && sourceId) user.media[g.media].payId = String(sourceId); // v-pay-refund: الدفعة التي فتحت فترة الباقة — استردادها وحده يسحبها
      await putUser(username, user);
      await noteGrant(username, plan, sourceField, sourceId, meta, user, prev); // v-pay-refund
      return { ok: true, plan: user.plan || null, media: g.media, mediaPlan: plan, pointsAdded: 0, balance: Number(user.points || 0) };
    }

    // v-plan-routing: رزمة نقاط لا تمسّ الباقة ولا تاريخ تجديدها — النقاط فقط.
    if (!PLANS[plan].pack) { user.plan = plan; user.planUpdatedAt = Date.now(); }
    if (!PLANS[plan].pack) user.planPayId = sourceId ? String(sourceId) : undefined; // v-pay-refund: كالسطر أعلاه للوسائط
    if (sourceField) user[sourceField] = sourceId;

    // إضافة النقاط للرصيد — نفس مفتاح الرصيد الحيّ المستخدم في points.js
    // (اسم المستخدم بأحرف صغيرة ومقصوص لضمان مطابقة نفس المفتاح دائمًا).
    // v-pay-seed: عدّاد غائب = أوّل لمسة للمحفظة؛ يُبذر من سجلّ الحساب (هديّة الترحيب أو رصيد ما قبل المحفظة الذرّيّة)
    // لا من صفر — كان الشراء قبل أوّل صرف يمسح الرصيد (٧٠ + ١٠٠ = ١٠٠، و٥٠٠ + Pro = ٩٢٠؛ أُثبت محلّيًّا).
    // داخل الدالّة: points.js يقرأ AUTH_SECRET عند تحميله، والويب هوك يُحمَّل في بيئة عارية.
    await require('./points.js').ensureBalance(username);
    const balanceKey = 'points:' + encodeURIComponent(String(username).trim().toLowerCase());
    const newBalance = await kvIncrBy(balanceKey, PLANS[plan].points);
    user.points = Number(newBalance);

    await putUser(username, user);
    await noteGrant(username, plan, sourceField, sourceId, meta, user, prev); // v-pay-refund
    return { ok: true, plan: PLANS[plan].pack ? (user.plan || null) : plan, pack: !!PLANS[plan].pack, pointsAdded: PLANS[plan].points, balance: Number(newBalance) };
  } catch (e) {
    if (claim) await kvDel(claim); // لم يكتمل الشحن — يُفكّ الحجز فتنجح المحاولة التالية
    throw e;
  }
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
    const { plan, origin, token, autoRenew, currency } = body;
    const planInfo = PLANS[plan];
    if (!planInfo) { res.status(400).json({ error: 'Invalid plan' }); return; }

    // v-checkout-login: دفعة بلا حساب تُخصم ولا تُنسب لأحد (الويب هوك يتجاهلها) — لا جلسة دفع بلا دخول.
    const username = verifyToken(token);
    if (!username) { res.status(401).json({ error: LOGIN_FIRST }); return; }

    // v-checkout-autorenew: يدويّ (payment) لشهر واحد افتراضيًّا — الباقة تسقط بعد ٣٥ يومًا (tier.js)؛
    // الاشتراك الشهريّ المتجدّد لمن فعّل autoRenew صراحةً. رزمة النقاط دفعة واحدة دائمًا.
    const recurring = !planInfo.pack && autoRenew === true;
    const base = origin || 'https://omran-ai-builder.vercel.app';
    const params = new URLSearchParams();
    params.append('mode', recurring ? 'subscription' : 'payment');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][quantity]', '1');
    const price = priceFor(plan, currency); // v-aed-checkout — التجديد الشهريّ بالعملة نفسها
    params.append('line_items[0][price_data][currency]', price.currency);
    params.append('line_items[0][price_data][unit_amount]', String(price.amount));
    if (recurring) params.append('line_items[0][price_data][recurring][interval]', 'month');
    params.append('line_items[0][price_data][product_data][name]', planInfo.name);
    params.append('metadata[plan]', plan);
    params.append('metadata[username]', username);
    // v-webhook: نفس البيانات على الاشتراك نفسه — فتحملها فواتير التجديد
    // الشهري ويعرف الويب هوك لمن يضيف نقاط كل شهر (كان التجديد بلا شحن).
    if (recurring) {
      params.append('subscription_data[metadata][plan]', plan);
      params.append('subscription_data[metadata][username]', username);
    }
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

    const payer = data.metadata && data.metadata.username;
    if (payer && payer !== username && !(await wasNamed(username, payer))) {
      res.status(403).json({ error: 'هذه الجلسة لا تخص هذا الحساب / This session does not belong to this account' });
      return;
    }
    if (tooOld(data.created)) { // v-pay-once
      res.status(410).json({ error: 'هذه دفعة قديمة لا تُشحن من هنا — إن لم تصلك نقاطها راسلنا / This payment is too old to claim here — contact us if it was not credited' });
      return;
    }

    const plan = data.metadata && data.metadata.plan;
    if (!plan || !PLANS[plan]) {
      res.status(400).json({ error: 'Invalid or missing plan in session metadata' });
      return;
    }

    const grant = await grantPlanToUser(username, plan, 'lastStripeSessionId', session_id,
      { refs: [data.payment_intent, data.invoice], amount: data.amount_total, currency: data.currency }); // v-pay-refund
    if (grant.error) { res.status(grant.status || 500).json({ error: grant.error }); return; }
    res.status(200).json(grant);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

// ===== Apple Pay / Google Pay via Stripe Payment Request Button API =====
// These create a plain one-time PaymentIntent (NOT a subscription — see the
// KNOWN LIMITATION note at the top of this file) for the plan's amount (USD, or
// AED for the UAE — v-aed-checkout), so the frontend's Payment Request Button
// can confirm it directly on-page without a redirect.
async function createPaymentIntent(req, res) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      res.status(500).json({ error: 'الدفع غير مفعّل بعد (STRIPE_SECRET_KEY مفقود) / Payment not configured yet' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { plan, token, currency } = body;
    const planInfo = PLANS[plan];
    if (!planInfo) { res.status(400).json({ error: 'Invalid plan' }); return; }

    const username = verifyToken(token);
    if (!username) { res.status(401).json({ error: LOGIN_FIRST }); return; }

    const price = priceFor(plan, currency); // v-aed-checkout — نفس مبلغ ورقة Apple/Google Pay في العميل
    const params = new URLSearchParams();
    params.append('amount', String(price.amount));
    params.append('currency', price.currency);
    params.append('payment_method_types[0]', 'card');
    params.append('description', planInfo.name);
    params.append('metadata[plan]', plan);
    params.append('metadata[username]', username);

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

    const payer = data.metadata && data.metadata.username;
    if (payer && payer !== username && !(await wasNamed(username, payer))) {
      res.status(403).json({ error: 'هذه العملية لا تخص هذا الحساب / This payment does not belong to this account' });
      return;
    }
    if (tooOld(data.created)) { // v-pay-once
      res.status(410).json({ error: 'هذه دفعة قديمة لا تُشحن من هنا — إن لم تصلك نقاطها راسلنا / This payment is too old to claim here — contact us if it was not credited' });
      return;
    }

    const plan = data.metadata && data.metadata.plan;
    if (!plan || !PLANS[plan]) {
      res.status(400).json({ error: 'Invalid or missing plan in payment metadata' });
      return;
    }

    const grant = await grantPlanToUser(username, plan, 'lastStripePaymentIntentId', payment_intent_id,
      { refs: [data.latest_charge], amount: data.amount_received || data.amount, currency: data.currency }); // v-pay-refund
    if (grant.error) { res.status(grant.status || 500).json({ error: grant.error }); return; }
    res.status(200).json(grant);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
}

/* v-autorenew-toggle (المالك ٢ أكتوبر «في الاشتراكات زرّ يلغي الاشتراك الشهريّ — خصم شهريّ ولا عاديّ — يفتح ويغلق في
   أوّل الصفحة»): الاشتراك المتجدّد كان يُلغى من لوحة Stripe وحدها. هنا: بلا on = حالة اشتراكات الحساب المتجدّدة؛
   on=false = إيقاف التجديد عند نهاية الشهر المدفوع (cancel_at_period_end، بلا استرجاع ولا قطع)؛ on=true = إعادته قبل نهايته.
   الاشتراكات تُعرف بـmetadata.username التي يضعها createCheckoutSession — فلا يلمس الحساب إلّا اشتراكاته. */
function subPeriodEnd(sub) {
  const top = Number(sub && sub.current_period_end) || 0;
  const items = (sub && sub.items && Array.isArray(sub.items.data)) ? sub.items.data : [];
  return items.reduce((m, it) => Math.max(m, Number(it && it.current_period_end) || 0), top); // الإصدارات الأحدث تضعه على البند
}
async function autoRenewToggle(req, res, fetchImpl) {
  const f = fetchImpl || fetch;
  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const username = verifyToken(body.token);
    if (!username) { res.status(401).json({ error: LOGIN_FIRST }); return; }
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) { res.status(200).json({ ok: true, subs: 0, configured: false }); return; }
    const auth = { Authorization: 'Bearer ' + secretKey };
    // v-rename-move: الاشتراك يحمل الاسم وقت الشراء — بعد تغيير الاسم يُبحث بالأسماء السابقة أيضًا، وإلّا لم يجد المشترك
    // اشتراكه ليوقفه وبقي يُخصم كلّ شهر.
    let prev = [];
    try { const u = await getUser(username); prev = (u && Array.isArray(u.prevUsernames)) ? u.prevUsernames.slice(-3) : []; } catch (e) { prev = []; }
    const names = [username].concat(prev.filter((n) => n && n !== username));
    const seen = new Set();
    const subs = [];
    for (const name of names) {
      const q = "metadata['username']:'" + String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "' AND status:'active'";
      const sr = await f('https://api.stripe.com/v1/subscriptions/search?limit=10&query=' + encodeURIComponent(q), { headers: auth });
      const sd = await sr.json().catch(() => ({}));
      if (!sr.ok) { res.status(502).json({ error: (sd.error && sd.error.message) || 'stripe search failed' }); return; }
      for (const x of (Array.isArray(sd.data) ? sd.data : [])) {
        if (x && x.metadata && x.metadata.username === name && !seen.has(x.id)) { seen.add(x.id); subs.push(x); }
      }
    }
    let periodEnd = subs.reduce((m, x) => Math.max(m, subPeriodEnd(x)), 0);
    if (typeof body.on !== 'boolean') {
      res.status(200).json({ ok: true, subs: subs.length, on: subs.some((x) => !x.cancel_at_period_end), periodEnd });
      return;
    }
    for (const x of subs) {
      const ur = await f('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(x.id), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, auth),
        body: new URLSearchParams({ cancel_at_period_end: body.on ? 'false' : 'true' }).toString(),
      });
      if (!ur.ok) { const ud = await ur.json().catch(() => ({})); res.status(502).json({ error: (ud.error && ud.error.message) || 'stripe update failed' }); return; }
    }
    res.status(200).json({ ok: true, subs: subs.length, on: body.on, periodEnd });
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
  if (routedAction === 'auto-renew') return autoRenewToggle(req, res);
  return createCheckoutSession(req, res);
};

// v-webhook: يستعملهما ويب هوك سترايب (api/webhook.js) — نفس منطق المنح
// وأمان التكرار، فلا ازدواج بين مسار العودة والويب هوك.
module.exports.grantPlanToUser = grantPlanToUser;
module.exports.wasNamed = wasNamed; // v-rename-move — PayPal يربط الطلب بالحساب بالاسم نفسه
module.exports.PLANS = PLANS;
module.exports.priceFor = priceFor; // v-aed-checkout — للاختبار
module.exports.autoRenewToggle = autoRenewToggle; // v-autorenew-toggle — للاختبار
// v-pay-refund: الاسترداد يتبع الحساب بعد تغيير اسمه، ويعرف الدفعة القديمة الممنوحة بحجزها.
module.exports.liveAccount = liveAccount;
module.exports.claimKey = claimKey;
module.exports.withAccount = withAccount; // v-acct-lock — السحب يأخذ قفل الحساب نفسه
