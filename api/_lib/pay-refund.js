'use strict';
// api/_lib/pay-refund.js — v-pay-refund (قرار المالك ٨ أكتوبر ٢٠٢٦، باب المال بموافقته على البند وحده:
// «لمّا يسترجع مشترك فلوسه أو يفتح اعتراضًا في البنك: سحب الباقة والنقاط»).
//
// كان الويب هوك يعالج الدفع وحده: الاسترداد والاعتراض البنكيّ يُردّ عليهما 200 فيبقى المال مستردًّا والباقة والنقاط عند صاحبها.
//
// ١. سجلّ المنح: كلّ منح ناجح (grantPlanToUser) يُسجَّل برقم دفعته `payrec:<رقم>` — الحساب وقتها، والخطّة، ونقاطها، ونوع
//    باقة الوسائط، ووقت الفترة التي فتحها (planUpdatedAt أو media.at)، والمبلغ — وبمؤشّرات `payref:<رقم آخر>` لأرقامها الأخرى
//    (payment_intent/charge/invoice في Stripe، ورقم الالتقاط في PayPal) لأنّ الاسترداد يصل برقم غير رقم الجلسة.
// ٢. السحب: بنسبة المبلغ المسترد تراكميًّا (Stripe يرسل amount_refunded تراكميًّا): النقاط بالنسبة نفسها ولا تنزل تحت الصفر،
//    ورصيد باقة الوسائط بالنسبة نفسها؛ وعند بلوغ المبلغ كاملًا تُسحب الباقة نفسها إن كانت فترتها الحاليّة من هذه الدفعة
//    (فيديوهات الباقة تتبع سريانها في _planVideos.js فتسقط معها). دفعة أقدم حلّت محلّها دفعة أحدث: نقاطها فقط.
//    والدفعة التي حلّت محلّ فترة دفعة أخرى (مكرّرة، أو ترقية) تعيد تلك الفترة إن بقيت نافذتها ولم تُسحب (prev في السجلّ).
//    الاعتراض البنكيّ (Stripe charge.dispute.created، PayPal CUSTOMER.DISPUTE.CREATED وPAYMENT.CAPTURE.REVERSED) سحب كامل
//    بغضّ النظر عن مبلغه — قرار المالك «نفس السحب» مع تنبيه، ويعيد يدويًّا إن ربح الاعتراض. النسبة = disputed ? 1 : المسترد.
//    ولا تبقى على الحساب فترةٌ دفعتُها مسحوبة كاملًا (سحب دفعتين متتاليتين معًا: إعادة القراءة (ج) في applyRevoke).
// ٣. مرّة واحدة: قفل SET NX على الدفعة أثناء السحب، ورقم كلّ حدث يُحفظ في السجلّ قبل الأثر (إعادة الحدث = لا شيء)،
//    والنسبة تراكميّة (اعتراض بعد استرداد كامل لا يسحب ثانية). فشل الأثر يعيد العلامة ويرمي ⇒ non-2xx فيعيد المرسل؛
//    إلّا بعد خصمٍ ناجح: لا شيء بعده يرمي (الإعادة تخصم ثانية من نقاط دفعات أخرى)، بل يُسجَّل للمالك.
// ٤. الإلغاء لا يسحب شيئًا: الفترة المدفوعة تكمل وتنتهي وحدها بنافذة الـ٣٥ يومًا (tier.js).
// ٥. دفعة قديمة بلا سجلّ: تُستخرج خطّتها وصاحبها من Stripe/PayPal، ولا يُسحب إلّا بدليل منح (حجز v-pay-once أو أثر الدفعة على
//    الحساب)؛ وإلّا تنبيه للمالك بلا سحب — لا يُسحب ما لم يُثبت أنّه مُنح. واسترداد كامل أو اعتراض لدفعة لم تُشحن بعد يُشغل
//    حجزها بعلامة السحب فلا يشحنها شيء بعده. عطل Stripe/PayPal العابر يرمي (500 فيُعاد الحدث) لا «لا سجلّ».
// ٦. v-acct-lock: السحب كلّه (والمنح في grantPlanToUser) تحت قفل الحساب على نسخته الطازجة — كلّ كاتب يكتب السجلّ كاملًا (KV بلا
//    CAS)، فسحبان على خانتين أو سحب مع منح كان أحدهما يعيد ما كتبه الآخر. صرف النقاط خارج القفل: (د) في applyRevoke تضيّق نافذته.
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel, kvIncrBy, kvDecrBy } = require('./kv.js');
const { MEDIA_PLANS, MEDIA_WINDOW_DAYS } = require('./_mediaPlans.js');

const REC_TTL_SEC = 400 * 86400; // كحجز الدفعة (CLAIM_TTL_SEC): الاعتراض البنكيّ قد يصل بعد أشهر
const LOCK_TTL_SEC = 120;
const LEGACY_WINDOW_MS = 4 * 86400000; // منحٌ قديم بلا وقت مسجَّل: الويب هوك يعيد ثلاثة أيّام بعد الدفع
const ALERT_TIMEOUT_MS = 3000;
const SETTLE_MS = 300; // (د) في applyRevoke: مهلة وصول كتابة مرآةٍ بدأت قبل السحب
const CHAT_PLANS = ['basic', 'pro', 'max'];
const REVOKED_CLAIM = '!revoked:'; // قيمة حجز v-pay-once لدفعة سُحبت قبل شحنها — ليست اسم حساب ولا دليل منح

const cut = (id) => String(id).slice(0, 200);
const recKey = (id) => 'payrec:' + cut(id);
const refKey = (id) => 'payref:' + cut(id);
const lockKey = (id) => 'payrev:lock:' + cut(id);
const norm = (u) => encodeURIComponent(String(u || '').trim().toLowerCase());
const pointsKey = (u) => 'points:' + norm(u);         // نفس balanceKey في points.js
const budgetKey = (u, kind) => 'media:' + kind + ':' + norm(u); // نفس _mediaPlans.js
const idOf = (x) => (typeof x === 'string' ? x : (x && typeof x.id === 'string' ? x.id : ''));
const cents = (m) => { const v = Number(m && m.value); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0; };
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function logError(scope, e, meta) {
  try { require('./log-error.js').logError(scope, e, meta); } catch (e2) { /* guard-ok — التسجيل تحسين لا شرط */ }
}

// ───────────────────────── سجلّ المنح ─────────────────────────

/** يسجّل ما منحته دفعة. أفضل جهد: لا يرمي أبدًا — منحٌ تمّ لا يُفشله سجلّه (وبلا سجلّ يبقى مسار الدفعات القديمة). */
async function recordGrant(rec) {
  try {
    if (!rec || !rec.id) return;
    const refs = [...new Set((rec.refs || []).map(idOf).filter((r) => r && r !== rec.id))];
    const out = Object.assign({ v: 1 }, rec, { id: String(rec.id), refs, grantedAt: Date.now() });
    await kvSetRaw(recKey(out.id), JSON.stringify(out), REC_TTL_SEC);
    for (const r of refs) await kvSetRaw(refKey(r), out.id, REC_TTL_SEC);
  } catch (e) { logError('pay-refund:record', e, { id: cut(rec && rec.id).slice(0, 40) }); }
}

/** يضيف أرقامًا أخرى (ومبلغًا) لسجلّ منحٍ قائم — لمسار يعرفها بعد المنح (PayPal: رقم الالتقاط). لا يرمي. */
async function linkGrant(id, extra) {
  try {
    const x = extra || {};
    const rec = await readRec(id);
    if (!rec) return;
    const had = rec.refs || [];
    const refs = [...new Set(had.concat((x.refs || []).map(idOf)).filter((r) => r && r !== rec.id))];
    const addAmount = !(rec.amount > 0) && Number(x.amount) > 0;
    if (!addAmount && refs.length === had.length) return; // لا جديد: لا كتابة (لا تُمحى علامة سحب قائمة)
    if (addAmount) { rec.amount = Math.round(Number(x.amount)); rec.currency = x.currency ? String(x.currency).toLowerCase() : rec.currency; }
    rec.refs = refs;
    await kvSetRaw(recKey(rec.id), JSON.stringify(rec), REC_TTL_SEC);
    for (const r of refs) await kvSetRaw(refKey(r), rec.id, REC_TTL_SEC);
  } catch (e) { logError('pay-refund:link', e, { id: cut(id).slice(0, 40) }); }
}

/** الفترة التي ستحلّ هذه الدفعة محلّها (قبل المنح) — تُحفظ في سجلّها (prev) فتعود إن سُحبت هي كاملة. للوسائط مع رصيدها وقتها. لا يرمي. */
async function priorOf(user, username, p) {
  try {
    if (!user || !p || p.pack) return null;
    if (p.media) {
      const m = user.media && user.media[p.media];
      if (!m || !m.plan) return null;
      return Object.assign({}, m, { budget: Math.max(0, Number(await kvGetRaw(budgetKey(username, p.media))) || 0) });
    }
    return user.plan ? { plan: String(user.plan), planUpdatedAt: Number(user.planUpdatedAt) || null, planPayId: user.planPayId ? String(user.planPayId) : null } : null;
  } catch (e) { logError('pay-refund:prior', e); return null; }
}

// القراءة ترمي عند عطب KV (لا «لا سجلّ» كاذبة تُسقط حدثًا مدفوعًا) — المستدعي يردّ 500 فيعيد المرسل.
async function readRec(id) {
  const raw = await kvGetRaw(recKey(id));
  if (raw === null || raw === undefined || raw === '') return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function findRec(ids) {
  for (const id of [...new Set((ids || []).map(idOf).filter(Boolean))]) {
    const direct = await readRec(id);
    if (direct) return { id: String(direct.id || id), rec: direct };
    const ptr = await kvGetRaw(refKey(id));
    if (ptr) { const rec = await readRec(ptr); if (rec) return { id: String(ptr), rec }; }
  }
  return null;
}

// ───────────────────────── السحب ─────────────────────────

// خصم لا يُنزل العدّاد تحت الصفر: يأخذ الموجود فقط، وصرفٌ متزامن سبقه يُعاد فرقه. بعد نجاح DECRBY لا يرمي
// (رميٌ بعده يعيد الحدث فيُخصم مرّتين).
async function floorDecr(key, n) {
  const want0 = Math.max(0, Math.floor(Number(n) || 0));
  if (!want0) return 0;
  const before = Number(await kvGetRaw(key)) || 0;
  const want = Math.min(want0, Math.max(0, before));
  if (!want) return 0;
  const after = Number(await kvDecrBy(key, want));
  if (after < 0) {
    try { await kvIncrBy(key, -after); } catch (e) { logError('pay-refund:floor', e, { key: key.slice(0, 40) }); }
    return want + after;
  }
  return want;
}

// هل الفترة الحاليّة من هذه الدفعة؟ برقم الدفعة التي فتحتها (planPayId / media[kind].payId منذ v-pay-refund)، وإلّا (حساب
// مُنح قبله) بوقتها المسجَّل بالضبط، أو (سجلّ قديم بلا وقت) بقربها من وقت الدفع.
function sameGrant(at, rec, payId) {
  if (payId) return String(payId) === String(rec.id);
  const a = Number(at) || 0;
  if (!(a > 0)) return false;
  if (Number(rec.at) > 0) return a === Number(rec.at);
  return Number(rec.approxAt) > 0 && Math.abs(a - Number(rec.approxAt)) <= LEGACY_WINDOW_MS;
}

// الفترة التي تعود حين تُسحب الدفعة rec كاملة: سابقتها (prev) إن بقيت نافذتها (٣٥ يومًا) ولم تُسحب دفعتها كاملة، وإلّا سابقة تلك.
// فترة بلا رقم دفعة (مُنحت قبل v-pay-refund) لا تعود: لا يُعرف أسُحبت أم لا. يرجع { p, frac } (frac: ما استُردّ من دفعتها).
async function priorPeriod(rec) {
  const { planActive } = require('./tier.js');
  const { mediaActive } = require('./_mediaPlans.js');
  let p = rec.prev;
  for (let i = 0; p && i < 5; i++) {
    const live = rec.media ? mediaActive({ media: { [rec.media]: p } }, rec.media) : planActive({ plan: p.plan, planUpdatedAt: p.planUpdatedAt });
    const payId = rec.media ? p.payId : p.planPayId;
    if (!live || !payId) return null;
    const r = await readRec(payId);
    if (!(r && r.revoked && r.revoked.plan)) return { p, frac: r && r.revoked ? clamp01(Number(r.revoked.fraction) || 0) : 0 };
    p = r.prev;
  }
  return null;
}

// هل الفترة الحاليّة على u (فترة المحادثة، أو باقة الوسائط من نوع r) من الدفعة r؟
function holds(u, r) {
  if (r.media) { const x = u.media && u.media[r.media]; return !!(x && x.plan === r.plan && sameGrant(x.at, r, x.payId)); }
  return CHAT_PLANS.includes(r.plan) && String(u.plan || '') === r.plan && sameGrant(u.planUpdatedAt, r, u.planPayId);
}

// الدفعة التي فتحت الفترة الحاليّة في خانة rec إن كان سجلّها مسحوبًا كاملًا (revoked.plan) — فترة لا يجوز أن تبقى على الحساب.
async function revokedHolder(u, rec) {
  const pid = rec.media ? (u.media && u.media[rec.media] && u.media[rec.media].payId) : u.planPayId;
  if (!pid || String(pid) === String(rec.id)) return null;
  const r = await readRec(pid);
  return r && r.revoked && r.revoked.plan && (r.media || null) === (rec.media || null) && holds(u, r) ? r : null;
}

// يسحب فترة الدفعة r من u ويضع مكانها سابقتها الصالحة (priorPeriod، تُقرأ ساعتها) أو لا شيء. يرجع خطّة الفترة العائدة.
// رصيد الوسائط يُكتب قبل سجلّ الحساب: إن فشل أحدهما بقيت فترة r فتطابقها الإعادة وتكمل (كان السجلّ أوّلًا، ففشلُ الرصيد بعده
// يترك رصيد الباقة المستردّة كاملًا تحت الباقة الأدنى ولا تطابق الإعادة شيئًا). رصيد العائدة: ما بقي لها وقت حلّت r محلّها،
// ولا يزيد على ما لم يُستردّ من دفعتها.
async function dropPeriod(name, u, r) {
  const prior = await priorPeriod(r);
  const back = prior ? Object.assign({}, prior.p) : null;
  if (back) delete back.budget;
  if (r.media) {
    u.media = Object.assign({}, u.media);
    if (back) u.media[r.media] = back; else delete u.media[r.media];
    if (back) {
      const mp = MEDIA_PLANS[back.plan];
      const left = Math.min(Math.max(0, Number(prior.p.budget) || 0), mp ? Math.round(mp.budget * (1 - prior.frac)) : 0);
      const ttl = Math.max(60, Math.ceil((Number(back.at) + MEDIA_WINDOW_DAYS * 86400000 - Date.now()) / 1000));
      await kvSetRaw(budgetKey(name, r.media), left, ttl);
    } else await kvDel(budgetKey(name, r.media));
  } else if (back) { u.plan = back.plan; u.planUpdatedAt = back.planUpdatedAt; u.planPayId = back.planPayId; } else { u.plan = null; delete u.planUpdatedAt; delete u.planPayId; }
  await require('./auth.js').putUser(name, u);
  return back ? back.plan : null;
}

async function applyRevoke(rec, step) {
  const { withAccount } = require('./create-checkout-session.js');
  const { getUser, putUser } = require('./auth.js');
  const out = { account: null, planRevoked: false, mediaRevoked: false, pointsTaken: 0, budgetTaken: 0, restored: null };
  const slot = rec.media ? 'mediaRevoked' : 'planRevoked';
  const periods = step.full && !!(rec.media || CHAT_PLANS.includes(rec.plan)); // باقة النقاط لا فترة لها
  const took = () => out.pointsTaken > 0 || out.budgetTaken > 0;

  // (ج) سجلّ الحساب قراءة ثمّ كتابة: كتابة متزامنة قرأته قبل السحب (مرآة صرف النقاط) تعيد فترة هذه الدفعة بعده، والحدث معلَّم
  //     «تمّ» فلا يُعاد. ويسحب دفعتين متتاليتين معًا: سحبُ الأحدث يقرأ سجلّ الأقدم قبل أن يُعلَّم فيعيد فترتها بعد أن أنهى سحبُها
  //     هذه الحلقة. يُقرأ ثانية (حتّى ٣ مرّات): فترة هذه الدفعة إن عادت، أو فترة دفعة سجلّها مسحوب كاملًا، تُسحب مع إعادة سابقتها
  //     الصالحة. بعد خصمٍ ناجح لا ترمي (الإعادة تخصم ثانية من نقاط دفعات أخرى) بل تُسجَّل للمالك؛ وبلا خصم (باقة وسائط) الإعادة
  //     آمنة فترمي.
  const recheck = async (name, scope) => {
    try {
      for (let i = 0; i < 3; i++) {
        const u = await getUser(name);
        if (!u || u.deleted) break;
        const r = holds(u, rec) ? rec : await revokedHolder(u, rec);
        if (!r) break;
        out.restored = await dropPeriod(name, u, r);
        out[slot] = true;
      }
    } catch (e) {
      if (!took()) throw e;
      logError(scope, e, { id: cut(rec.id).slice(0, 40) });
    }
  };

  // v-acct-lock: المراحل كلّها تحت قفل الحساب (withAccount في create-checkout-session.js) وعلى نسخته الطازجة — سحبٌ آخر
  // (خانة أخرى، أو رزمة نقاط، أو جزئيّ) ومنحٌ جديد لا يكتبان نسختهما القديمة فوق هذا السحب ولا هذا فوقهما. لم يُنل القفل ⇒
  // رمي قبل أيّ أثر فيعيد المرسل الحدث. v-rename-move: الحساب بعد تغيير اسمه.
  await withAccount(rec.username, async (name, user) => {
    if (!user || user.deleted) return;
    out.account = name;
    const mediaCurrent = !!(rec.media && holds(user, rec));

    // (أ) الباقة نفسها عند بلوغ المبلغ كاملًا — يتكرّر بلا أثر (بعد السحب لا تطابق الفترة)، فيُعاد بأمان بعد فشل لاحق
    //     وبعد كتابة متزامنة. الفترة التي حلّت هذه الدفعة محلّها تعود إن بقيت سارية غير مسحوبة (priorPeriod)، وإلّا لا باقة.
    if (periods && holds(user, rec)) {
      out.restored = await dropPeriod(name, user, rec);
      out[slot] = true;
    }

    // (ب) عدّاد واحد غير متكرّر الأثر: رصيد الوسائط (باقة الوسائط بلا نقاط) أو النقاط.
    if (rec.media) {
      if (!out.mediaRevoked && mediaCurrent && step.budget > 0) out.budgetTaken = await floorDecr(budgetKey(name, rec.media), step.budget);
    } else if (step.points > 0) {
      await require('./points.js').ensureBalance(name); // عدّاد غائب يُبذر من السجلّ (v-pay-seed)
      out.pointsTaken = await floorDecr(pointsKey(name), step.points);
      try { // مرآة السجلّ — أفضل جهد كـmirrorToUser
        const u = await getUser(name);
        if (u && !u.deleted) { u.points = Math.max(0, Number(await kvGetRaw(pointsKey(name))) || 0); await putUser(name, u); }
      } catch (e) { logError('pay-refund:mirror', e); }
    }

    if (periods) await recheck(name, 'pay-refund:recheck');
  });

  // (د) صرف النقاط لا يأخذ قفل الحساب (المسار الساخن): مرآته (mirrorToUser) تقرأ السجلّ ثمّ تكتبه كاملًا، فقراءةٌ سبقت السحب
  //     تصل كتابتها بعد (ج) فتعود الفترة المسحوبة والحدث «تمّ». تضييق النافذة: (ج) مرّة أخيرة تحت القفل بعد مهلة قصيرة تكفي
  //     لوصول كتابةٍ بدأت قبل السحب (قراءة + كتابة KV). لا يسدّها كلّها: كتابةٌ أبطأ من المهلة تبقى ممكنة.
  if (periods && out[slot] && out.account) {
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    try {
      await withAccount(out.account, (name, u) => (u && !u.deleted ? recheck(name, 'pay-refund:settle') : null));
    } catch (e) { // القفل مشغول ~٨ ثوانٍ: كـ(ج) — بعد خصمٍ لا يُرمى
      if (!took()) throw e;
      logError('pay-refund:settle', e, { id: cut(rec.id).slice(0, 40) });
    }
  }
  return out;
}

/**
 * يسحب ما منحته الدفعة recId حتّى النسبة التراكميّة. ev = { key, reason, dispute, fraction }: الاعتراض البنكيّ (dispute) سحب كامل
 * بغضّ النظر عن مبلغه (قرار المالك: «نفس السحب» + تنبيه؛ يعيد يدويًّا إن ربح الاعتراض)، والاسترداد وحده بنسبته التراكميّة
 * fraction(rv, { refunded }) بأكبر ما وصل — الإعادة وتبدّل الترتيب لا يغيّران شيئًا. النسبة = disputed ? 1 : refunded.
 * كان الاعتراض يُجمع مع الاسترداد بنسبته، فاعتراضٌ جزئيّ يُحلّ بردّ المال نفسه يُحسب مرّتين (اعتراض ١٠$ ثمّ ردّها = ١٠٠٪).
 * يرجع { status: 'revoked'|'partial'|'none'|'dup'|'busy'|'unknown', ... } ويرمي عند فشل الأثر قبل الخصم (فيُعاد الحدث).
 */
async function revoke(recId, ev) {
  if (!(await kvSetIfAbsent(lockKey(recId), ev.key, LOCK_TTL_SEC))) return { status: 'busy', retry: true };
  try {
    const rec = await readRec(recId);
    if (!rec) return { status: 'unknown' };
    const rv = Object.assign({ fraction: 0, points: 0, budget: 0, plan: false, ids: [] }, rec.revoked || {});
    if (rv.ids.includes(ev.key)) return { status: 'dup', rec };
    const was = clamp01(Number(rv.refunded != null ? rv.refunded : rv.fraction) || 0);
    const refunded = ev.dispute ? was : clamp01(Math.max(was, Number(ev.fraction(rv, { refunded: was })) || 0));
    const disputed = !!rv.disputed || !!ev.dispute;
    const f = disputed ? 1 : clamp01(Math.max(Number(rv.fraction) || 0, refunded));
    const full = f >= 0.9999;
    const mp = rec.media ? MEDIA_PLANS[rec.plan] : null;
    const tPoints = full ? Number(rec.points) || 0 : Math.round((Number(rec.points) || 0) * f);
    const tBudget = mp ? (full ? mp.budget : Math.round(mp.budget * f)) : 0;
    const next = {
      fraction: f, refunded, disputed, points: Math.max(rv.points, tPoints), budget: Math.max(rv.budget, tBudget), plan: rv.plan || full,
      ids: rv.ids.concat(ev.key).slice(-20), reason: ev.reason, at: Date.now(),
    };
    const step = { full: full && !rv.plan, points: next.points - rv.points, budget: next.budget - rv.budget };
    // العلامة قبل الأثر: إن مات الطلب بعد الخصم فالإعادة ترى الحدث مسجَّلًا ولا تخصم ثانية.
    await kvSetRaw(recKey(recId), JSON.stringify(Object.assign({}, rec, { revoked: next })), REC_TTL_SEC);
    let out;
    try {
      out = await applyRevoke(rec, step);
    } catch (e) {
      try { await kvSetRaw(recKey(recId), JSON.stringify(rec), REC_TTL_SEC); } catch (e2) {
        // العلامة باقية: كلّ إعادة لهذا الحدث «dup» تردّ 200 بلا سحب — لا يُعاد وحده، فالمالك يُنبَّه به ليسحبه يدويًّا.
        logError('pay-refund:unmark', e2, { id: cut(recId).slice(0, 40) });
        await alertOwner('⚠️ سحب فشل ولن يُعاد وحده — اسحبه يدويًّا', (rec.username || '?') + ' · ' + rec.plan + ' · ' + ev.reason + ' · الدفعة ' + cut(recId).slice(0, 50)
          + ' · الحدث ' + cut(ev.key).slice(0, 70) + ' · ' + String((e && e.message) || e).slice(0, 50));
      }
      throw e;
    }
    const status = (step.full || step.points > 0 || step.budget > 0) ? (full ? 'revoked' : 'partial') : 'none';
    console.log('[pay-refund] ' + ev.reason + ' ' + cut(recId) + ' → ' + status + ' ' + JSON.stringify(out));
    return Object.assign({ status, fraction: f, rec }, out);
  } finally {
    await kvDel(lockKey(recId));
  }
}

// ───────────────────────── تنبيه المالك ─────────────────────────

async function alertOwner(title, body) {
  console.warn('[pay-refund] ' + title + ' — ' + body);
  logError('pay-refund:owner-alert', new Error(title + ' — ' + body)); // سجلّ أخطاء المالك: بلا VAPID لا يصل الدفع ويضيع التنبيه
  await new Promise((resolve) => {
    const t = setTimeout(resolve, ALERT_TIMEOUT_MS); // serverless يجمّد العامل بعد الردّ — يُنتظر بمهلة قصيرة
    Promise.resolve()
      .then(() => require('./_owner-alert.js').pushToOwners({ title, body: String(body).slice(0, 220), url: '/' }))
      .then(() => { clearTimeout(t); resolve(); }, (e) => { clearTimeout(t); logError('pay-refund:alert', e); resolve(); });
  });
}

const money = (amount, currency) => (Number(amount) > 0 ? (Number(amount) / 100).toFixed(2) + ' ' + String(currency || '').toUpperCase() : '?');
function describe(r, src, payId) {
  const rec = r && r.rec;
  const who = (r && r.account) || (rec && rec.username) || '?';
  const plan = rec ? rec.plan : '?';
  const back = r && r.restored ? ' (عادت فترة ' + r.restored + ' السابقة)' : '';
  const took = r ? [r.planRevoked ? 'الباقة' + back : '', r.mediaRevoked ? 'باقة ' + rec.media + back : '', r.pointsTaken ? r.pointsTaken + ' نقطة' : '', r.budgetTaken ? r.budgetTaken + ' من رصيد ' + rec.media : ''].filter(Boolean).join(' + ') : '';
  return who + ' · ' + plan + ' · ' + src + ' ' + cut(payId).slice(0, 40) + (took ? ' — سُحب: ' + took : ' — لا شيء جديد يُسحب');
}

// ───────────────────────── Stripe ─────────────────────────

// ردّ نهائيّ «لا يوجد/طلب لا يصحّ» = لا سجلّ؛ أيّ فشل آخر (429، 5xx، صلاحيّة) عابر يرمي — كان يُعامَل كلّه «لا سجلّ» ⇒ 200 بلا سحب.
const gone = (status) => status === 400 || status === 404 || status === 422;

function stripeGetter(fetchImpl) {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  const f = fetchImpl || fetch;
  return async (p) => {
    const r = await f('https://api.stripe.com/v1/' + p, { headers: { Authorization: 'Bearer ' + key } });
    const d = await r.json().catch(() => null);
    if (r.ok) return d;
    if (gone(r.status)) return null;
    throw new Error('stripe ' + r.status + ' ' + p.split('?')[0].split('/')[0]); // عطل عابر (429/5xx…): 500 فيعيد Stripe الحدث، لا «لا سجلّ»
  };
}

// دليل المنح لدفعة بلا سجلّ: حجزها الذرّيّ (v-pay-once، قيمته اسم الحساب وقت الشحن) أو أثرها على الحساب.
async function grantEvidence(field, id, metaUser) {
  const { claimKey, liveAccount } = require('./create-checkout-session.js');
  const claimed = await kvGetRaw(claimKey(field, id));
  if (claimed) return String(claimed).startsWith(REVOKED_CLAIM) ? '' : String(claimed); // حجز سحبٍ قبل الشحن ليس منحًا
  if (!metaUser) return '';
  const a = await liveAccount(metaUser);
  return (a.user && !a.user.deleted && a.user[field] === id) ? a.name : '';
}

async function legacyRecord(cand, extra) {
  const { PLANS } = require('./create-checkout-session.js');
  const username = await grantEvidence(cand.field, cand.id, cand.md && cand.md.username);
  if (!username) return null;
  const plan = cand.md.plan;
  const rec = {
    v: 1, legacy: true, id: String(cand.id), field: cand.field, username, plan, points: PLANS[plan].points, media: PLANS[plan].media || null,
    at: null, approxAt: Number(extra.approxAt) || null, amount: Number(extra.amount) > 0 ? Number(extra.amount) : null,
    currency: extra.currency ? String(extra.currency).toLowerCase() : null, refs: [...new Set((extra.refs || []).map(idOf).filter((r) => r && r !== cand.id))], grantedAt: null,
  };
  // SET NX: حدثان متزامنان لدفعة قديمة لا يمحو أحدهما علامة سحب الآخر.
  await kvSetIfAbsent(recKey(rec.id), JSON.stringify(rec), REC_TTL_SEC);
  for (const r of rec.refs) await kvSetRaw(refKey(r), rec.id, REC_TTL_SEC);
  const now = await readRec(rec.id);
  return now ? { id: rec.id, rec: now } : null;
}

// دفعة عُرفت ولا دليل على شحنها، وقد استُردّت كاملة أو اعتُرض عليها: كان يُردّ 200 بلا أثر فيشحنها ما يأتي بعده (التحقّق من
// العميل ٧٢ ساعة — الـPaymentIntent يبقى succeeded، أو حدث الدفع يُعاد). الآن يُشغل حجزها (v-pay-once) بعلامة السحب، فيرى كلّ شحن
// بعدها «سبق الشحن». حجزٌ سبقنا إليه شحنٌ متزامن ⇒ retry: يُعاد الحدث فيجد سجلّ ذلك المنح ويسحبه.
async function blockGrant(cand, ctx) {
  const { claimKey } = require('./create-checkout-session.js');
  const key = claimKey(cand.field, cand.id);
  if (await kvSetIfAbsent(key, REVOKED_CLAIM + ctx.evKey, REC_TTL_SEC)) { ctx.blocked = true; return; }
  if (String((await kvGetRaw(key)) || '').startsWith(REVOKED_CLAIM)) ctx.blocked = true;
  else ctx.retry = true;
}

// دفعة Stripe بلا سجلّ منح (مُنحت قبل v-pay-refund، أو تعذّر سجلّها): الخطّة والحساب من بيانات Stripe نفسها.
async function stripeLegacy(obj, dispute, o, ctx) {
  const get = stripeGetter(o.fetchImpl);
  if (!get) return null;
  const { PLANS } = require('./create-checkout-session.js');
  const ok = (md) => !!(md && md.username && PLANS[md.plan]);
  const charge = dispute ? ((idOf(obj.charge) && await get('charges/' + encodeURIComponent(idOf(obj.charge)))) || { id: idOf(obj.charge), payment_intent: obj.payment_intent }) : obj;
  const pi = idOf(charge.payment_intent) || idOf(obj.payment_intent);
  let invoice = idOf(charge.invoice);
  let cand = null;
  if (pi) {
    const p = await get('payment_intents/' + encodeURIComponent(pi)); // Apple/Google Pay: الخطّة على الـPaymentIntent نفسه
    if (p) { if (!invoice) invoice = idOf(p.invoice); if (ok(p.metadata)) cand = { field: 'lastStripePaymentIntentId', id: pi, md: p.metadata }; }
    if (!cand) {
      const s = await get('checkout/sessions?limit=1&payment_intent=' + encodeURIComponent(pi));
      const x = s && Array.isArray(s.data) && s.data[0];
      if (x && ok(x.metadata)) cand = { field: 'lastStripeSessionId', id: x.id, md: x.metadata };
    }
    if (!cand && !invoice) { // إصدارات Stripe الأحدث: الفاتورة لا تظهر على الدفعة — تُعرف من invoice_payments
      const ip = await get('invoice_payments?limit=1&payment[type]=payment_intent&payment[payment_intent]=' + encodeURIComponent(pi));
      const x = ip && Array.isArray(ip.data) && ip.data[0];
      invoice = x ? idOf(x.invoice) : '';
    }
  }
  if (!cand && invoice) {
    const hit = await findRec([invoice]); // تجديدٌ سُجّل برقم فاتورته
    if (hit) return hit;
    const inv = await get('invoices/' + encodeURIComponent(invoice));
    if (inv) {
      const parent = (inv.parent && inv.parent.subscription_details) || {};
      const md = (inv.subscription_details && inv.subscription_details.metadata) || (inv.lines && inv.lines.data && inv.lines.data[0] && inv.lines.data[0].metadata) || parent.metadata || {};
      if (inv.billing_reason === 'subscription_cycle' && ok(md)) cand = { field: 'lastStripeInvoiceId', id: inv.id, md };
      else if (inv.billing_reason === 'subscription_create') { // الفاتورة الأولى شُحنت بحدث الجلسة
        const sub = idOf(inv.subscription) || idOf(parent.subscription);
        const s = sub ? await get('checkout/sessions?limit=1&subscription=' + encodeURIComponent(sub)) : null;
        const x = s && Array.isArray(s.data) && s.data[0];
        if (x && ok(x.metadata)) cand = { field: 'lastStripeSessionId', id: x.id, md: x.metadata };
      }
    }
  }
  if (!cand) return null;
  const hit = await findRec([cand.id]);
  if (hit) return hit;
  const found = await legacyRecord(cand, { approxAt: (Number(charge.created) || 0) * 1000, amount: charge.amount, currency: charge.currency, refs: [pi, charge.id, invoice] });
  if (!found && ctx.block) await blockGrant(cand, ctx);
  return found;
}

/** charge.refunded وcharge.dispute.created. يرجع { retry:true } حين يجب أن يعيد Stripe لاحقًا، ويرمي عند فشل الأثر. */
async function stripeEvent(event, opts) {
  const o = opts || {};
  const obj = (event && event.data && event.data.object) || {};
  const dispute = event.type === 'charge.dispute.created';
  const evKey = 'stripe:' + (event.id || (obj.id + ':' + (obj.amount_refunded || obj.amount)));
  const ids = dispute ? [obj.payment_intent, obj.charge] : [obj.payment_intent, obj.id, obj.invoice];
  const payId = idOf(dispute ? obj.charge : obj.id) || idOf(obj.payment_intent);
  const ctx = { evKey, block: dispute || obj.refunded === true || (Number(obj.amount) > 0 && Number(obj.amount_refunded) >= Number(obj.amount)) };
  const found = (await findRec(ids)) || (await stripeLegacy(obj, dispute, o, ctx));
  if (!found) {
    if (ctx.retry) return { status: 'busy', retry: true };
    await alertOwner(dispute ? '⚠️ اعتراض بنكيّ على دفعة بلا سجلّ' : '↩️ استرداد لدفعة بلا سجلّ', 'Stripe ' + cut(payId).slice(0, 40) + ' · ' + money(dispute ? obj.amount : obj.amount_refunded, obj.currency)
      + (ctx.blocked ? ' — لم يُسحب شيء (لا دليل على شحنها) ومُنع شحنها بعد الآن' : ' — لم يُسحب شيء، راجعها يدويًّا'));
    return { status: ctx.blocked ? 'blocked' : 'unknown' };
  }
  const fraction = () => (obj.refunded === true ? 1 : (Number(obj.amount) > 0 ? (Number(obj.amount_refunded) || 0) / Number(obj.amount) : 0));
  const r = await revoke(found.id, { key: evKey, reason: dispute ? 'dispute' : 'refund', dispute, fraction });
  if (dispute && r.status !== 'dup' && r.status !== 'busy') {
    await alertOwner('⚠️ اعتراض بنكيّ على دفعة', describe(r, 'Stripe', payId) + ' · ' + money(obj.amount, obj.currency) + (obj.reason ? ' · ' + String(obj.reason).slice(0, 40) : ''));
  }
  return r;
}

// ───────────────────────── PayPal ─────────────────────────

/** التحقّق الرسميّ من توقيع PayPal (verify-webhook-signature). يفشل مغلقًا: أيّ رأس ناقص أو عطب = false. */
async function verifyPaypalSig(raw, headers, webhookId, opts) {
  const o = opts || {};
  const h = (k) => String((headers && headers[k]) || '').trim();
  const fields = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
  if (!webhookId || fields.some((k) => !h(k))) return false;
  try {
    JSON.parse(raw); // يُضمّ خامًّا كما وصل (إعادة التسلسل قد تغيّر البايتات فيفشل التحقّق)، فيجب أن يكون JSON صالحًا
    const pp = require('./paypal-order.js');
    const token = await pp.getAccessToken();
    if (!token) return false;
    const body = '{"auth_algo":' + JSON.stringify(h('paypal-auth-algo')) + ',"cert_url":' + JSON.stringify(h('paypal-cert-url'))
      + ',"transmission_id":' + JSON.stringify(h('paypal-transmission-id')) + ',"transmission_sig":' + JSON.stringify(h('paypal-transmission-sig'))
      + ',"transmission_time":' + JSON.stringify(h('paypal-transmission-time')) + ',"webhook_id":' + JSON.stringify(String(webhookId))
      + ',"webhook_event":' + raw + '}';
    const r = await (o.fetchImpl || fetch)(pp.baseUrl() + '/v1/notifications/verify-webhook-signature', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body,
    });
    const d = await r.json().catch(() => ({}));
    return !!(r.ok && d && d.verification_status === 'SUCCESS');
  } catch (e) {
    logError('pay-refund:paypal-verify', e);
    return false;
  }
}

// رقم الالتقاط من مورد الاسترداد/الانعكاس (رابط up إلى ‎/v2/payments/captures/{id}‎).
function captureOf(resource) {
  for (const l of (resource && Array.isArray(resource.links) ? resource.links : [])) {
    const m = String((l && l.href) || '').match(/\/v2\/payments\/captures\/([^/?#]+)$/);
    if (m) return decodeURIComponent(m[1]);
  }
  return '';
}

// التقاط PayPal بلا سجلّ منح: الطلب من الالتقاط، والخطّة وصاحبها من الطلب نفسه (matchOrder كالشحن).
async function paypalLegacy(captureId, ctx) {
  const pp = require('./paypal-order.js');
  const token = await pp.getAccessToken();
  if (!token) throw new Error('paypal token unavailable'); // التوقيع تحقّق بالرمز نفسه للتوّ: غيابه الآن عطل عابر يُعاد
  const get = async (p) => {
    const r = await fetch(pp.baseUrl() + p, { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json().catch(() => null);
    if (r.ok) return d;
    if (gone(r.status)) return null;
    throw new Error('paypal ' + r.status); // كـstripeGetter: العطل العابر يعيد الحدث لا يُسقطه
  };
  const cap = await get('/v2/payments/captures/' + encodeURIComponent(captureId));
  const orderId = cap && cap.supplementary_data && cap.supplementary_data.related_ids && cap.supplementary_data.related_ids.order_id;
  if (!orderId) return null;
  const hit = await findRec([orderId]);
  if (hit) return hit;
  const order = await get('/v2/checkout/orders/' + encodeURIComponent(orderId));
  const m = order ? pp.matchOrder(order) : null;
  if (!m || !m.plan) return null;
  // v-media-merge (المراجعة المعاكسة): طلب img_/vid_ بعد الإيقاف مُنح media_<الدرجة> (grantablePlan) — يُبنى سجلّه بالخطّة الممنوحة لا custom_id الخامّ.
  const cand = { field: 'lastPaypalOrderId', id: orderId, md: { username: m.ref, plan: pp.grantablePlan(m.plan, order) } };
  const found = await legacyRecord(cand, { approxAt: Date.parse(cap.create_time) || 0, amount: cents(cap.amount), currency: 'usd', refs: [captureId] });
  if (!found && ctx.block(cents(cap.amount))) await blockGrant(cand, ctx); // الطلب يبقى COMPLETED بعد الاسترداد: claim كان سيشحنه
  return found;
}

/** PAYMENT.CAPTURE.REFUNDED وPAYMENT.CAPTURE.REVERSED وCUSTOMER.DISPUTE.CREATED (بعد التحقّق من التوقيع). */
async function paypalEvent(event) {
  const type = String((event && event.event_type) || '');
  const res = (event && event.resource) || {};
  const isDispute = type === 'CUSTOMER.DISPUTE.CREATED';
  const reversed = type === 'PAYMENT.CAPTURE.REVERSED'; // انعكاس = الاعتراض عبر البنك/البطاقة
  if (!isDispute && !reversed && type !== 'PAYMENT.CAPTURE.REFUNDED') return { status: 'ignored' };
  const caps = isDispute
    ? [...new Set((Array.isArray(res.disputed_transactions) ? res.disputed_transactions : []).map((t) => t && t.seller_transaction_id).filter(Boolean))]
    : [captureOf(res)].filter(Boolean);
  const evKey = 'paypal:' + (event.id || res.id || res.dispute_id);
  let retry = false;
  const results = [];
  if (!caps.length) caps.push('');
  const amt = isDispute ? cents(res.dispute_amount) : cents(res.amount);
  const total = cents(res.seller_payable_breakdown && res.seller_payable_breakdown.total_refunded_amount); // تراكميّ
  const disputed = isDispute || reversed; // الاعتراض وانعكاسه: سحب كامل بغضّ النظر عن المبلغ (revoke)
  for (const cap of caps) {
    const ctx = { evKey: evKey + ':' + cap, block: (base) => disputed || !base || !(total > 0 || amt > 0) || (total > 0 ? total : amt) >= base };
    const found = cap ? ((await findRec([cap])) || (await paypalLegacy(cap, ctx))) : null;
    if (!found) {
      if (ctx.retry) { retry = true; results.push({ status: 'busy', retry: true }); continue; }
      await alertOwner(disputed ? '⚠️ اعتراض على دفعة PayPal بلا سجلّ' : '↩️ استرداد PayPal لدفعة بلا سجلّ', 'PayPal ' + (cap || res.dispute_id || res.id || '?') + ' · ' + money(amt, 'usd')
        + (ctx.blocked ? ' — لم يُسحب شيء (لا دليل على شحنها) ومُنع شحنها بعد الآن' : ' — لم يُسحب شيء، راجعها يدويًّا'));
      results.push({ status: ctx.blocked ? 'blocked' : 'unknown' });
      continue;
    }
    const base = Number(found.rec.amount) || 0;
    const fraction = (rv, parts) => {
      if (!base) return 1;
      if (total > 0) return total / base;
      return parts.refunded + (amt > 0 ? amt / base : 1);
    };
    const r = await revoke(found.id, { key: evKey + ':' + cap, reason: disputed ? 'dispute' : 'refund', dispute: disputed, fraction });
    if (r.retry) retry = true;
    if (disputed && r.status !== 'dup' && r.status !== 'busy') {
      await alertOwner(reversed ? '⚠️ انعكاس دفعة PayPal (اعتراض بنكيّ)' : '⚠️ اعتراض على دفعة PayPal', describe(r, 'PayPal', cap) + ' · ' + money(amt, 'usd') + (res.reason ? ' · ' + String(res.reason).slice(0, 40) : ''));
    }
    results.push(r);
  }
  return { status: 'done', retry, results };
}

module.exports = { recordGrant, linkGrant, priorOf, findRec, revoke, stripeEvent, paypalEvent, verifyPaypalSig, captureOf, REC_TTL_SEC };
