'use strict';
/* v-owner-reset-records — خانة «رابط استرجاع الحساب» عند المالك: بعد فهرس البريد وGoogle وStripe (admin-actions.js).
   العرض (٨ نوفمبر): بعد #1303 مسح Stripe كلّه (٦ جلسات و١١ شحنة، بلا عطب) ولا دفعة بإيميل علياء — فالمالك وافق («سوّها») على بحثين
   آخرين، قراءة فقط، وكلاهما باب مقفل: بيانات المستخدمين (كلّ السجلّات) والمال (PayPal).

   recordAccountsFor: مسح كلّ سجلّات الحسابات كما تفعل الإحصاءات، بلا كتابة — getUserOnce وemailVerifiedFor وحدهما (لا emailProven ولا
   resolveLoginUser ولا settleUnverifiedEmail: تكتب). الإثبات درجتان:
   • قويّ (رابط إن كان حسابًا واحدًا): بريده مؤكَّد عليه (verifiedEmail = email، أو مفتاح g_<البريد> بدخول Google)، أو صندوق Gmail ربطه
     صاحبه بـOAuth (emailAssist.gmailAddress)، أو g_<البريد> في أسمائه السابقة مع googleAuth.
   • ضعيف (اسم يُعرض للمالك، لا رابط أبدًا): بريد مكتوب بلا تأكيد — كان التسجيل حتّى ١٨ أكتوبر يقبل أيّ بريد بلا إثبات، وزرع بعضهم بريد
     غيره (v-signup-no-email)؛ بريد أُكّد قديمًا ثمّ تغيّر؛ اسم أنشأه رمز البريد من مقدّمته (<مقدّمة>_<٦ ست عشريّة>)؛ اسم فيه كلمة من البريد.
   سجلّ مختوم بسرّ قديم أو لا يُقرأ يُعدّ ويجعل المسح partial. المحذوف وشاهد تغيير الاسم لا يُعرضان (الحيّ يُمسح باسمه الجديد).
   الأعداد في diag بلا بريد ولا اسم. */

const RECORD_BATCH = 25;
const RECORD_SCAN_MS = 60000;
const WEAK_MAX = 10;

const low = (x) => String(x == null ? '' : x).trim().toLowerCase();

/* مقدّمة اسم حساب رمز البريد — كـauth.js otpNamePrefix حرفيًّا */
function otpNamePrefix(email) {
  return String(email).split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'user';
}

/* كلمات الاسم من مقدّمة البريد: «aliya.alshamsi181» ← aliya وalshamsi (أربعة أحرف فأكثر — «ali» تطابق نصف الحسابات) */
function nameHints(email) {
  const local = low(email).split('@')[0];
  return [...new Set(local.split(/[^a-z]+/).filter((t) => t.length >= 4))];
}

async function recordAccountsFor(typed, opts) {
  const o = opts || {};
  const diag = o.diag || {};
  Object.assign(diag, { records: 0, sealed: 0, unread: 0, deleted: 0, strong: 0, weak: 0, partial: false });
  const email = low(typed);
  /* paypalOrders: آخر طلب PayPal شُحن لكلّ حساب (user.lastPaypalOrderId — يكتبه الخادم عند الشحن منذ البداية) ← لبحث PayPal بعده */
  const out = { strong: [], weak: [], paypalOrders: new Map() };
  if (!email.includes('@')) return out;
  const kv = o.kv || require('./kv.js');
  const auth = o.auth || require('./auth.js');
  const isOwner = o.isOwner || require('./_owner.js').isOwnerName;
  const scanMs = Number(o.scanMs) > 0 ? Number(o.scanMs) : RECORD_SCAN_MS;
  const prefix = otpNamePrefix(email);
  const otpName = new RegExp('^' + prefix + '_[0-9a-f]{6}$');
  const hints = nameHints(email);
  const weakRank = { unverified: 0, old: 1, 'otp-name': 2, name: 3 };
  const add = (list, key, why, rec) => {
    const hit = list.find((x) => x.key === key);
    if (hit) { if (list === out.weak && weakRank[why] < weakRank[hit.why]) hit.why = why; return; }
    list.push({ key, why, google: rec.googleAuth === true, at: Number(rec.createdAt) || 0 });
  };
  let keys = [];
  try { keys = (await kv.kvList('db/users/')).filter((k) => String(k).startsWith('db/users/')); }
  catch (e) { diag.unread++; diag.partial = true; console.warn('[owner-lookup] records list ' + String((e && e.name) || 'error')); return out; }
  const started = Date.now();
  for (let i = 0; i < keys.length; i += RECORD_BATCH) {
    if (Date.now() - started > scanMs) { diag.partial = true; break; }
    await Promise.all(keys.slice(i, i + RECORD_BATCH).map(async (k) => {
      let key = '';
      try { key = low(decodeURIComponent(String(k).replace(/^db\/users\//, '').replace(/\.json$/, ''))); }
      catch (e) { diag.unread++; diag.partial = true; return; } /* مفتاح لا يُفكّ ترميزه — يُعدّ ولا يُسقط المسح */
      if (!key) return;
      let rec = null;
      try { rec = await auth.getUserOnce(key); }
      catch (e) {
        if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') diag.sealed++; else diag.unread++;
        diag.partial = true;
        return;
      }
      if (!rec || typeof rec !== 'object') { diag.unread++; diag.partial = true; return; } /* مُدرَج ولا يُقرأ: عطب قراءة لا «لا أحد» */
      diag.records++;
      if (rec.deleted) { diag.deleted++; return; }
      if (isOwner(key)) return;
      if (typeof rec.lastPaypalOrderId === 'string' && rec.lastPaypalOrderId) out.paypalOrders.set(rec.lastPaypalOrderId, key);
      const mail = low(rec.email);
      const gmail = low(rec.emailAssist && rec.emailAssist.gmailAddress);
      const prev = Array.isArray(rec.prevUsernames) ? rec.prevUsernames.map(low) : [];
      if ((mail === email && auth.emailVerifiedFor(key, rec)) || gmail === email
          || (rec.googleAuth === true && (key === 'g_' + email || prev.includes('g_' + email)))) {
        add(out.strong, key, mail === email ? 'verified' : (gmail === email ? 'gmail' : 'google'), rec);
        return;
      }
      if (mail === email || low(rec.emailUnverified && rec.emailUnverified.email) === email) { add(out.weak, key, 'unverified', rec); return; }
      if (low(rec.verifiedEmail) === email) { add(out.weak, key, 'old', rec); return; }
      if (otpName.test(key)) { add(out.weak, key, 'otp-name', rec); return; }
      const shown = low(rec.username);
      if (hints.some((t) => key.includes(t) || shown.includes(t))) add(out.weak, key, 'name', rec);
    }));
  }
  out.weak.sort((a, b) => (weakRank[a.why] - weakRank[b.why]) || (b.at - a.at));
  diag.strong = out.strong.length;
  diag.weak = out.weak.length;
  out.weak = out.weak.slice(0, WEAK_MAX);
  return out;
}

/* اسم كتبه المالك ولا حساب بالنصّ نفسه ← أسماء فيها هذا النصّ (٣ أحرف فأكثر، والعربيّ كذلك: المفاتيح تُفكّ من الترميز)، من قائمة المفاتيح
   بلا فكّ تشفير؛ ثمّ يُقرأ ما طابق وحده ليُترك المحذوف ويُتبع الاسم المغيَّر إلى حسابه الحيّ. أسماء للمالك يسأل عنها، لا رابط. */
async function nameAccountsFor(text, opts) {
  const o = opts || {};
  const q = low(text);
  if (q.length < 3) return [];
  const kv = o.kv || require('./kv.js');
  const auth = o.auth || require('./auth.js');
  const isOwner = o.isOwner || require('./_owner.js').isOwnerName;
  let keys = [];
  try { keys = (await kv.kvList('db/users/')).filter((k) => String(k).startsWith('db/users/')); }
  catch (e) { console.warn('[owner-lookup] names list ' + String((e && e.name) || 'error')); return []; }
  const hits = [];
  for (const k of keys) {
    let key = '';
    try { key = low(decodeURIComponent(String(k).replace(/^db\/users\//, '').replace(/\.json$/, ''))); }
    catch (e) { continue; } /* مفتاح لا يُفكّ ترميزه لا يُعرض */
    if (key && key.includes(q) && !isOwner(key)) hits.push(key);
  }
  const out = [];
  for (const k of hits.slice(0, 40)) {
    try {
      const live = await auth.liveAccount(k, 1);
      if (live.user && !live.user.deleted && !isOwner(live.key) && !out.includes(live.key)) out.push(live.key);
    } catch (e) { /* سجلّ مختوم أو عطب قراءة: يُترك من القائمة، والباقي يُعرض */ }
    if (out.length >= WEAK_MAX) break;
  }
  return out;
}

/* paypalAccountsFor: دافعو PayPal ببريد الدافع، قراءة فقط. لا بحث بالبريد في واجهات PayPal إلّا Transaction Search، فطريقان:
   أ) طلباتنا أوّلًا — بلا صلاحيّة جديدة ولا تأخير: كلّ طلب شُحن له حساب، من حجز الشحن paid:lastPaypalOrderId:<الطلب> (قيمته اسم الحساب،
      يكتبه الخادم عند الشحن، منذ ٥ أكتوبر) ومن آخر طلب في كلّ سجلّ (o.orders من مسح السجلّات). GET الطلب ← payer.email_address (بريد دخول
      PayPal — الدفع بالبطاقة بلا حساب معطَّل) يُطابَق بلا حالة أحرف، والاسم من الحجز أو السجلّ لا من الطلب.
   ب) إن لم يُطلع (أ) حسابًا حيًّا: Transaction Search — ميزة تُفعَّل في تطبيق PayPal (وقد تتأخّر ساعات)، وبدونها ٤٠٣ ← denied يقول للمالك
      ما يفعّله. نوافذ ٣٠ يومًا (RFC 3339 بـZ) من الأحدث إلى بدء PayPal في التطبيق؛ دفعة لنا (T00…، مبلغ موجب) ببريد الدافع ← الالتقاط ← سجلّ
      المنح أو حجز طلبه ← وإلّا reference_id بدليل منح (آخر طلب شُحن لذلك الحساب هو هذا الطلب): reference_id وحده يزوَّر من المتصفّح بالمعرّف
      العامّ، و«default» لطلبات ما قبل ٥ أكتوبر ليس اسمًا.
   كلّ عطب يُعدّ ويُكمل، والمهلة تجعله partial، والسجلّ بالمسار وحده (لا بريد ولا اسم ولا رقم). */
const PAYPAL_FROM = Date.UTC(2026, 6, 1); // PayPal في التطبيق منذ ١٩ يوليو ٢٠٢٦ (1b938aff)
const PAYPAL_WINDOW_MS = 30 * 86400000; // الحدّ عندهم ٣١ يومًا
const PAYPAL_PAGES = 10;
const PAYPAL_ORDERS_MS = 30000;
const PAYPAL_SCAN_MS = 45000;
const PAYPAL_CLAIM = 'paid:lastPaypalOrderId:'; // claimKey في create-checkout-session.js
const REVOKED_CLAIM = '!revoked:'; // pay-refund.js: حجز دفعة سُحبت قبل شحنها — ليس اسم حساب
const ppDate = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function paypalAccountsFor(emails, follow, opts) {
  const o = opts || {};
  const diag = o.diag || {};
  Object.assign(diag, { orders: 0, ordersRead: 0, ordersMatched: 0, windows: 0, txns: 0, matched: 0, unnamed: 0, names: 0, live: 0, errors: 0, denied: false, off: false, partial: false });
  const want = new Set((emails || []).map(low).filter((e) => e.includes('@')));
  if (!want.size) return [];
  const kv = o.kv || require('./kv.js');
  const pp = o.paypal || require('./paypal-order.js');
  const f = o.fetchImpl || fetch;
  const scanMs = Number(o.scanMs) > 0 ? Number(o.scanMs) : PAYPAL_SCAN_MS;
  let token = null;
  try {
    /* getAccessToken بلا مهلة (مسار الدفع) — هنا ١٠ ث حدًّا كي لا يعلق زرّ المالك */
    let timer = null;
    const limit = new Promise((resolve, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), 10000); });
    if (timer && typeof timer.unref === 'function') timer.unref();
    token = await Promise.race([pp.getAccessToken(), limit]);
    clearTimeout(timer);
  } catch (e) { diag.errors++; console.warn('[owner-lookup] paypal token ' + String((e && e.name) || 'error')); }
  if (!token) { diag.off = true; return []; } /* بلا مفاتيح PayPal أو رفضها: لا بحث */
  const base = pp.baseUrl();
  /* search: ٤٠١/٤٠٣ من Transaction Search وحده = الميزة غير مفعّلة؛ missingOk: طلب قديم لا يعود (٤٠٤) ليس عطبًا */
  const get = async (path, how) => {
    const where = '[owner-lookup] paypal ' + path.split('?')[0].replace(/\/[^/]+$/, (m) => (m === '/transactions' ? m : '/:id')); /* بلا بريد ولا اسم ولا رقم */
    try {
      const r = await f(base + path, { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json().catch(() => null);
      if (r.ok && d && typeof d === 'object') return d;
      if (how === 'missingOk' && r.status === 404) return null;
      if (how === 'search' && (r.status === 401 || r.status === 403)) diag.denied = true;
      console.warn(where + ' HTTP ' + r.status + (d && d.name ? ' ' + String(d.name).replace(/[^A-Z_]/g, '').slice(0, 40) : ''));
    } catch (e) { console.warn(where + ' ' + String((e && e.name) || 'error')); }
    diag.errors++;
    return null;
  };
  const names = [];
  const add = (u) => {
    const n = low(u);
    if (!n || n === 'default') return false;
    if (!names.includes(n)) names.push(n);
    return true;
  };
  const live = [];
  const followed = new Set();
  const found = async () => {
    for (const u of names) {
      if (followed.has(u)) continue;
      followed.add(u);
      const hit = await follow(u);
      if (hit && hit.user && !hit.user.deleted && !live.includes(hit.key)) live.push(hit.key);
    }
    return live.length > 0;
  };
  const claimOf = async (orderId) => {
    try {
      const v = String((await kv.kvGetRaw(PAYPAL_CLAIM + String(orderId).slice(0, 200))) || '');
      return v && !v.startsWith(REVOKED_CLAIM) ? v : '';
    } catch (e) { diag.errors++; return ''; } /* عطب قراءة الحجز: الطلب يُقرأ من طريق آخر */
  };

  // أ) طلباتنا المشحونة
  const orders = new Map();
  if (o.orders) for (const [id, u] of o.orders) if (id && u) orders.set(String(id), String(u));
  try {
    for (const k of (await kv.kvList(PAYPAL_CLAIM)).filter((x) => String(x).startsWith(PAYPAL_CLAIM))) {
      const id = String(k).slice(PAYPAL_CLAIM.length);
      if (!id || orders.has(id)) continue;
      const u = await claimOf(id);
      if (u) orders.set(id, u);
    }
  } catch (e) { diag.errors++; diag.partial = true; console.warn('[owner-lookup] paypal claims ' + String((e && e.name) || 'error')); }
  diag.orders = orders.size;
  const ids = [...orders.keys()];
  const t0 = Date.now();
  for (let i = 0; i < ids.length; i += 5) {
    if (Date.now() - t0 > PAYPAL_ORDERS_MS) { diag.partial = true; break; }
    await Promise.all(ids.slice(i, i + 5).map(async (id) => {
      const order = await get('/v2/checkout/orders/' + encodeURIComponent(id), 'missingOk');
      if (!order) return;
      diag.ordersRead++;
      if (!want.has(low(order.payer && order.payer.email_address))) return;
      diag.ordersMatched++;
      add(orders.get(id));
    }));
  }

  // ب) Transaction Search
  if (!(await found())) {
    let pay = null;
    try { pay = o.payRefund || require('./pay-refund.js'); } catch (e) { pay = null; } /* بلا سجلّ المنح: بالحجز ودليل المنح */
    const fromRec = async (id) => {
      if (!pay || typeof pay.findRec !== 'function') return false;
      try { const hit = await pay.findRec([id]); return !!(hit && hit.rec && add(hit.rec.username)); }
      catch (e) { diag.errors++; return false; } /* عطب قراءة السجلّ: نكمل */
    };
    const ownerOf = async (captureId) => {
      if (await fromRec(captureId)) return true;
      const cap = await get('/v2/payments/captures/' + encodeURIComponent(captureId), 'missingOk');
      const orderId = cap && cap.supplementary_data && cap.supplementary_data.related_ids && cap.supplementary_data.related_ids.order_id;
      if (!orderId) return false;
      if (add(orders.get(orderId)) || add(await claimOf(orderId)) || (await fromRec(orderId))) return true;
      const order = await get('/v2/checkout/orders/' + encodeURIComponent(orderId), 'missingOk');
      const pu = order && Array.isArray(order.purchase_units) ? order.purchase_units[0] : null;
      const ref = low(pu && pu.reference_id);
      if (!ref || ref === 'default') return false;
      try {
        const a = await follow(ref);
        if (a && a.user && !a.user.deleted && a.user.lastPaypalOrderId === orderId) return add(ref);
      } catch (e) { diag.errors++; } /* حساب لا يُقرأ: لا دليل منح */
      return false;
    };
    const seen = new Set();
    const t1 = Date.now();
    const now = typeof o.now === 'function' ? o.now() : Date.now();
    windows: for (let end = now; end > PAYPAL_FROM; end -= PAYPAL_WINDOW_MS) {
      const start = Math.max(PAYPAL_FROM, end - PAYPAL_WINDOW_MS);
      for (let page = 1; page <= PAYPAL_PAGES; page++) {
        if (Date.now() - t1 > scanMs) { diag.partial = true; break windows; }
        const d = await get('/v1/reporting/transactions?start_date=' + encodeURIComponent(ppDate(start)) + '&end_date=' + encodeURIComponent(ppDate(end))
          + '&fields=transaction_info,payer_info&page_size=500&page=' + page, 'search');
        if (!d) { diag.partial = true; if (diag.denied) break windows; break; }
        if (page === 1) diag.windows++;
        for (const t of (Array.isArray(d.transaction_details) ? d.transaction_details : [])) {
          diag.txns++;
          const ti = (t && t.transaction_info) || {};
          if (!want.has(low(t && t.payer_info && t.payer_info.email_address))) continue;
          /* دفعة لنا (T00…، مبلغ موجب) لا استرداد ولا عكس ولا حجز اعتراض، ومرّة لكلّ رقم */
          if (!/^T00/.test(String(ti.transaction_event_code || '')) || !(Number(ti.transaction_amount && ti.transaction_amount.value) > 0) || !ti.transaction_id) continue;
          const tid = String(ti.transaction_id);
          if (seen.has(tid)) continue;
          seen.add(tid);
          diag.matched++;
          if (!(await ownerOf(tid))) diag.unnamed++;
        }
        if (!(Number(d.total_pages) > page)) break;
        if (page === PAYPAL_PAGES) diag.partial = true;
      }
    }
    await found();
  }
  diag.names = names.length;
  diag.live = live.length;
  return live;
}

module.exports = { recordAccountsFor, nameAccountsFor, paypalAccountsFor, nameHints, otpNamePrefix, RECORD_SCAN_MS, PAYPAL_FROM };
