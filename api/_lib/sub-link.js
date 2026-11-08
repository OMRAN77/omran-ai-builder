'use strict';
/* api/_lib/sub-link.js — v-owner-link-sub (المالك ٨ نوفمبر ٢٠٢٦، بعد أن دخلت علياء بحساب Google: «لكن ليس الاشتراك»،
   وقبلها «انخصم مرّتين منها»؛ المال باب مقفل — الربط بطلبه على البند نفسه، وتنفيذه بتأكيده في لوحة المالك).

   اشتراك Stripe بدأ قبل v-checkout-login (٢٥ سبتمبر) بلا دخول، فلا metadata.username عليه ولا على جلسته: الويب هوك تجاهل دفعتيه
   (checkout.session.completed وinvoice.paid يشترطان الاسم) وسيتجاهل كلّ تجديد بعدهما — المشتركة تدفع كلّ شهر ولا يصلها شيء.
   هنا المالك يربطه بحساب صاحبه:
   ١. القراءة (GET وحده): الاشتراك وخطّته (metadata.plan)، وعميله وبريده، وجلسة الدفع الأولى، والفواتير المدفوعة، وحالة كلّ دفعة من
      شحنتها (مستردّة؟ عليها اعتراض؟) — بشكلَي Stripe: payment_intent/charge على الفاتورة، أو invoice_payments (basil).
   ٢. الفحص (بلا confirm): الحساب وبريده، وبريد Stripe، والدفعات التي ستُضاف وما يُترك — بلا أيّ كتابة.
   ٣. التنفيذ (confirm:true): metadata[username] على الاشتراك أوّلًا (فالتجديد التالي يُشحن وحده بالويب هوك نفسه)، ثمّ كلّ دفعة
      بـgrantPlanToUser بمفتاح الويب هوك نفسه — lastStripeSessionId للجلسة الأولى وlastStripeInvoiceId للتجديد — وأرقامها (refs):
      فالضغط مرّتين أو إعادة الحدث لا تشحن ثانيةً (v-pay-once)، والاسترداد والاعتراض بعدها يجدان سجلّ المنح ويسحبانه (v-pay-refund).
   اشتراك مربوط بحساب حيّ آخر = ٤٠٩ بلا كتابة. عطب Stripe = ٥٠٢ قبل أيّ أثر. دفعة مستردّة أو عليها اعتراض أو لم تُعرف شحنتها لا تُضاف.
   السجلّ بلا بريد. المفتاح يُقرأ عند النداء (نقاط الدخول تُحمَّل في بيئة عارية). */

const STRIPE_API = 'https://api.stripe.com/v1/';
const SUB_RE = /^sub_[A-Za-z0-9]{6,}$/;
const INVOICE_PAGES = 5;
const NO_META_WRITE = new Set(['canceled', 'incomplete_expired']); // لا تجديد بعدهما، وStripe يرفض تعديل الملغى
const idOf = (x) => (typeof x === 'string' ? x : (x && typeof x.id === 'string' ? x.id : ''));

class StripeFail extends Error {
  constructor(where, code) { super('stripe ' + code + ' ' + where); this.where = where; this.code = code; }
}

/* GET/POST خام كبقيّة المشروع. ٤٠٤ = null (لا يوجد)، وأيّ عطب آخر (رفض، مهلة، جسم لا يُقرأ) يرمي StripeFail — لا يُقرأ «لا دفعات». */
function stripeClient(fetchImpl) {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) return null;
  const f = fetchImpl || fetch;
  const call = async (method, path, form) => {
    const where = path.split('?')[0].replace(/\/[A-Za-z]+_[A-Za-z0-9]+/g, '/:id'); // المسار بلا أرقام في السجلّ
    let r;
    try {
      const headers = { Authorization: 'Bearer ' + secret };
      if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      r = await f(STRIPE_API + path, { method, headers, body: form || undefined, signal: AbortSignal.timeout(8000) });
    } catch (e) { throw new StripeFail(where, String((e && e.name) || 'network')); }
    const d = await r.json().catch(() => null);
    if (r.ok && d && typeof d === 'object') return d;
    if (r.status === 404) return null;
    throw new StripeFail(where, r.status);
  };
  return { get: (p) => call('GET', p), post: (p, form) => call('POST', p, form) };
}

// فاتورة ← اشتراكها بالشكلين (قبل basil: subscription؛ basil: parent.subscription_details.subscription)
const invoiceSub = (inv) => idOf(inv && inv.subscription)
  || idOf(inv && inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription);

/* دفعة الفاتورة وشحنتها: أرقامها لسجلّ المنح (الاسترداد يصل برقم الشحنة أو النيّة)، وهل استُردّت أو اعتُرض عليها.
   known=false: لم تُعرف شحنة (دفع خارج Stripe، أو رصيد) — لا تُضاف دفعة لا تُعرف حالتها. */
async function paymentOf(get, inv) {
  let pi = idOf(inv.payment_intent);
  let ch = idOf(inv.charge);
  if (!pi && !ch) { // basil: الفاتورة بلا payment_intent/charge — دفعاتها في invoice_payments
    const ip = await get('invoice_payments?limit=10&invoice=' + encodeURIComponent(inv.id));
    for (const x of (ip && Array.isArray(ip.data) ? ip.data : [])) {
      if (!x || (x.status && x.status !== 'paid')) continue;
      const p = x.payment || {};
      if (!pi) pi = idOf(p.payment_intent);
      if (!ch) ch = idOf(p.charge);
    }
  }
  let charge = null;
  if (ch) charge = await get('charges/' + encodeURIComponent(ch));
  else if (pi) {
    const p = await get('payment_intents/' + encodeURIComponent(pi) + '?expand[]=latest_charge');
    const lc = p && p.latest_charge;
    if (lc && typeof lc === 'object') charge = lc;
    else if (typeof lc === 'string' && lc) charge = await get('charges/' + encodeURIComponent(lc));
    if (charge && !ch) ch = idOf(charge);
  }
  if (charge && !pi) pi = idOf(charge.payment_intent);
  return {
    pi, ch, known: !!charge,
    refunded: !!(charge && (charge.refunded === true || Number(charge.amount_refunded) > 0)),
    disputed: !!(charge && charge.disputed === true),
  };
}

/* القراءة كلّها: الاشتراك، والربط الحاليّ، وبريد العميل، والدفعات المرشّحة بحالاتها. ترمي StripeFail عند العطب. */
async function survey(get, subId) {
  const { PLANS, claimKey } = require('./create-checkout-session.js');
  const sub = await get('subscriptions/' + encodeURIComponent(subId));
  if (!sub || (sub.object && sub.object !== 'subscription') || (sub.id && sub.id !== subId)) return { error: 'no_sub' };
  const md = sub.metadata || {};
  const plan = String(md.plan || '').trim();
  if (!PLANS[plan] || PLANS[plan].pack) return { error: 'no_plan', plan };

  const linkedTo = String(md.username || '').trim().toLowerCase();
  let linkedLive = '';
  if (linkedTo) {
    const a = await require('./auth.js').liveAccount(linkedTo);
    if (a && a.user && !a.user.deleted) linkedLive = a.key;
  }

  let customerEmail = '';
  const cus = idOf(sub.customer);
  if (cus) {
    const c = await get('customers/' + encodeURIComponent(cus));
    if (c && !c.deleted && c.email) customerEmail = String(c.email);
  }

  // جلسة الدفع الأولى (التي كان يشحنها checkout.session.completed): مكتملة ومدفوعة ولهذا الاشتراك نفسه
  const ss = await get('checkout/sessions?limit=10&subscription=' + encodeURIComponent(subId));
  const session = (ss && Array.isArray(ss.data) ? ss.data : [])
    .find((s) => s && s.status === 'complete' && s.payment_status === 'paid' && (!s.subscription || idOf(s.subscription) === subId)) || null;
  if (!customerEmail && session) customerEmail = String((session.customer_details && session.customer_details.email) || session.customer_email || '');

  // الفواتير المدفوعة لهذا الاشتراك وحده (مرشِّح تجاهله Stripe لا يُدخل فاتورة اشتراك آخر)
  const invoices = [];
  let after = '';
  for (let page = 0; page < INVOICE_PAGES; page++) {
    const d = await get('invoices?limit=100&status=paid&subscription=' + encodeURIComponent(subId) + (after ? '&starting_after=' + encodeURIComponent(after) : ''));
    const rows = d && Array.isArray(d.data) ? d.data : [];
    for (const inv of rows) if (inv && inv.id && invoiceSub(inv) === subId && inv.status !== 'void') invoices.push(inv);
    if (!d || !d.has_more || !rows.length) break;
    after = idOf(rows[rows.length - 1]);
    if (!after) break;
  }
  const paidAmt = (i) => Number(i.amount_paid) > 0;
  const relevant = invoices.filter((i) => paidAmt(i) && (i.billing_reason === 'subscription_create' || i.billing_reason === 'subscription_cycle'));
  const pays = new Map();
  for (const i of relevant) pays.set(i.id, await paymentOf(get, i)); // واحدة بعد الأخرى: نداءات قليلة، ولا ضغط على حدّ Stripe

  const cands = [];
  const first = relevant.find((i) => i.billing_reason === 'subscription_create') || null;
  if (session) {
    const pay = first ? pays.get(first.id) : null;
    cands.push({
      kind: 'first', field: 'lastStripeSessionId', id: String(session.id), created: Number(session.created) || (first ? Number(first.created) : 0) || 0,
      amount: Number(session.amount_total) > 0 ? Number(session.amount_total) : (first ? Number(first.amount_paid) : 0),
      currency: String(session.currency || (first && first.currency) || '').toLowerCase(),
      refs: [idOf(session.payment_intent), idOf(session.invoice), first && first.id, pay && pay.pi, pay && pay.ch].filter(Boolean), pay,
    });
  } else if (first) { // اشتراك بلا جلسة دفع: فاتورته الأولى لم يشحنها شيء — تُضاف برقمها
    const pay = pays.get(first.id);
    cands.push({ kind: 'first', field: 'lastStripeInvoiceId', id: first.id, created: Number(first.created) || 0, amount: Number(first.amount_paid), currency: String(first.currency || '').toLowerCase(), refs: [pay.pi, pay.ch].filter(Boolean), pay });
  }
  for (const i of relevant) {
    if (i.billing_reason !== 'subscription_cycle') continue;
    const pay = pays.get(i.id);
    cands.push({ kind: 'renewal', field: 'lastStripeInvoiceId', id: i.id, created: Number(i.created) || 0, amount: Number(i.amount_paid), currency: String(i.currency || '').toLowerCase(), refs: [pay.pi, pay.ch].filter(Boolean), pay });
  }
  cands.sort((a, b) => a.created - b.created);

  const { kvGetRaw } = require('./kv.js');
  for (const c of cands) {
    if (!c.pay || !c.pay.known) c.state = 'unverified';
    else if (c.pay.refunded || c.pay.disputed) c.state = 'refunded';
    else {
      const claimed = await kvGetRaw(claimKey(c.field, c.id)); // حجز v-pay-once: شُحنت من قبل، أو سُحب حجزها قبل شحنها
      c.state = claimed ? (String(claimed).startsWith('!revoked:') ? 'blocked' : 'already') : 'grant';
    }
  }
  const planLabel = String(PLANS[plan].name || plan).split(' / ').pop();
  return { sub: { id: subId, status: String(sub.status || ''), plan, planLabel, linkedTo, linkedLive }, customerEmail, cands, points: PLANS[plan].points };
}

/* البريد ← حسابه (الفهرس، ثمّ Google بمفتاحه أو اسمه المستعار)؛ الاسم ← حسابه الحيّ إن غيّر اسمه. */
async function resolveAccount(target) {
  const auth = require('./auth.js');
  const key = String(target || '').trim().toLowerCase();
  if (!key) return null;
  if (key.includes('@')) {
    const found = await auth.resolveLoginUser(key);
    if (found && found.user && !found.user.deleted) return { key: found.key, user: found.user };
    const g = await auth.googleAccountFor(key);
    if (g && g.user && !g.user.deleted) return { key: g.key, user: g.user };
    return null;
  }
  const a = await auth.liveAccount(key);
  return (a && a.user && !a.user.deleted) ? { key: a.key, user: a.user } : null;
}

/** { target, subscriptionId, confirm } ← { status, body }. بلا confirm:true فحصٌ لا يكتب شيئًا. */
async function linkSub(input, opts) {
  const o = opts || {};
  const subId = String((input && input.subscriptionId) || '').trim();
  if (!SUB_RE.test(subId)) return { status: 400, body: { error: 'bad_subscription_id' } };
  const acct = await resolveAccount(input && input.target);
  if (!acct) return { status: 404, body: { error: 'user not found' } };
  if (require('./_owner.js').isOwnerName(acct.key)) return { status: 400, body: { error: 'cannot act on the owner account' } };
  const client = stripeClient(o.fetchImpl);
  if (!client) return { status: 503, body: { error: 'stripe_not_configured' } };

  let sv;
  try { sv = await survey(client.get, subId); }
  catch (e) {
    if (!(e instanceof StripeFail)) throw e;
    console.warn('[sub-link] read failed ' + e.where + ' ' + e.code);
    return { status: 502, body: { error: 'stripe_error', at: e.where, code: e.code } };
  }
  if (sv.error === 'no_sub') return { status: 404, body: { error: 'subscription not found' } };
  if (sv.error === 'no_plan') return { status: 422, body: { error: 'subscription has no known plan', plan: sv.plan || null } };
  if (sv.sub.linkedLive && sv.sub.linkedLive !== acct.key) return { status: 409, body: { error: 'linked_other', username: sv.sub.linkedLive } };

  const grants = sv.cands.filter((c) => c.state === 'grant');
  const summary = {
    username: acct.key,
    accountEmail: String(acct.user.email || (acct.key.startsWith('g_') ? acct.key.slice(2) : '')),
    customerEmail: sv.customerEmail,
    subscription: subId, status: sv.sub.status, plan: sv.sub.plan, planLabel: sv.sub.planLabel,
    linkedTo: sv.sub.linkedLive || null,
    previous: (sv.sub.linkedTo && !sv.sub.linkedLive) ? sv.sub.linkedTo : null, // اسم على الاشتراك لا حساب حيّ له
    payments: sv.cands.map((c) => ({ id: c.id, kind: c.kind, amount: c.amount, currency: c.currency, created: c.created, state: c.state })),
    toGrant: grants.length, points: grants.length * sv.points,
  };
  if (!(input && input.confirm === true)) return { status: 200, body: Object.assign({ ok: true, dryRun: true }, summary) };

  // ١) الاسم على الاشتراك أوّلًا: فشلُه يوقف كلّ شيء قبل أيّ منح، والضغط ثانيةً يكمل (المنح بعده لا يتكرّر)
  const writeMeta = sv.sub.linkedLive !== acct.key && !NO_META_WRITE.has(sv.sub.status);
  if (writeMeta) {
    try {
      const r = await client.post('subscriptions/' + encodeURIComponent(subId), 'metadata[username]=' + encodeURIComponent(acct.key));
      if (!r) throw new StripeFail('subscriptions/:id', 404);
    } catch (e) {
      if (!(e instanceof StripeFail)) throw e;
      console.warn('[sub-link] metadata write failed ' + e.code);
      return { status: 502, body: Object.assign({ error: 'stripe_write_failed', code: e.code }, summary) };
    }
  }

  // ٢) الدفعات بالترتيب، بمفتاح الويب هوك نفسه وأرقامها — منحٌ رمى أو رفض يوقف ما بعده، والضغط ثانيةً يكمل الباقي
  const { grantPlanToUser } = require('./create-checkout-session.js');
  let granted = 0, pointsAdded = 0, balance = null, failed = null;
  for (const c of grants) {
    try {
      const g = await grantPlanToUser(acct.key, sv.sub.plan, c.field, c.id, { refs: c.refs, amount: c.amount, currency: c.currency });
      if (g && g.error) { failed = String(g.error); break; }
      if (g && !g.alreadyGranted) { granted++; pointsAdded += Number(g.pointsAdded) || 0; }
      if (g && g.balance !== undefined) balance = g.balance;
    } catch (e) { failed = String((e && e.message) || e); break; }
  }
  console.log('[sub-link] ' + subId + ' → ' + (writeMeta ? 'linked' : 'kept') + ' +' + pointsAdded + ' (' + granted + '/' + grants.length + ')' + (failed ? ' FAILED' : ''));
  const out = Object.assign({ ok: !failed, linked: writeMeta || sv.sub.linkedLive === acct.key, granted, pointsAdded, balance }, summary);
  if (failed) Object.assign(out, { error: 'partial', detail: failed });
  return { status: failed ? 500 : 200, body: out };
}

module.exports = { linkSub, SUB_RE, _survey: survey, _paymentOf: paymentOf };
