'use strict';
/* v-talk-room-plan (قرار المالك — باب المال بموافقته على هذا البند وحده): خطّة «غرفة الربع».
   • مجّانًا: صاحب الغرفة المسجَّل له ٣٦٠٠ ثانية فتح غرفة في اليوم (يوم دبي: منتصف الليل UTC+4)، وأربعة في الغرفة على الأكثر.
   • الاشتراك: ٣٧ نقطة من رصيد نقاطه داخل التطبيق (لا Stripe ولا PayPal) = عشرة في الغرفة وبلا حدّ وقت لثلاثين يومًا.
   • التجديد التلقائيّ مفعّل افتراضيًّا: يخصم ٣٧ مرّة أخرى، كسولًا — أوّل تقييم للخطّة (plan/open/نبضة keep) بعد انتهاء المدّة،
     والمدّة الجديدة من لحظتها (لا خصم عن شهور لم تُستعمل). رصيد لا يكفي = ينتهي الاشتراك ويُطفأ تجديده (لا رصيد سالب ولا خصم جزئيّ،
     ولا خصم مفاجئ لاحقًا حين يشحن نقاطًا لغرض آخر). يطفئه صاحبه ويشغّله.
   • الضيوف لا يدفعون ولا حساب لهم. المالك وVIP بلا حدّ ولا خصم — يُفحصان قبل أيّ أمر تخزين أو نقاط.
   الخصم بـspendPoints وحده (DECRBY ذرّيّ مع تراجع)، تحت قفل talk/sub/lock/<user> (SET NX EX 20) حول كلّ قراءة-قرار-خصم-كتابة.
   خصمٌ نجح وكتابة الاشتراك فشلت ⇒ refundPointsOnly بختم مرّة واحدة. السعر هنا وحده (لا في COSTS ولا UNIT_COST).

   عبر act في talk-room.js (POST /api/system?action=room):
     plan      { token }               -> { plan:'own'|'sub'|'free', cap, left, sub:{active,until,auto}|null, cost }
     sub-buy   { token, confirmed? }   -> 428 عرض السعر | 409 active|busy | 402 points_insufficient | شكل plan + { charged, points }
     sub-auto  { token, on }           -> شكل plan (بلا خصم)
   لا طباعة هنا (لا اسم ولا رصيد في السجلّ). */

const FREE_SECONDS = 3600, FREE_CAP = 4, SUB_CAP = 10, SUB_COST = 37, SUB_DAYS = 30, SPEND_REASON = 'talk_room_sub';
const FREE_TTL = 172800, LOCK_TTL = 20, REFUND_MARK_TTL = 86400, PAID_TTL = 3600, TICK_MAX = 60, DAY_MS = 86400000, DUBAI_MS = 4 * 3600000;
const RENAME_WAIT_TRIES = 24, RENAME_WAIT_MS = 250;      // تغيير الاسم ينتظر تجديدًا جاريًا حتّى ٦ ثوانٍ (مرآة الصرف تنتظر قفل الحساب ٢ ثانية)
const OPS = ['plan', 'sub-buy', 'sub-auto'];

const norm = (u) => String(u == null ? '' : u).trim().toLowerCase();
const enc = (u) => encodeURIComponent(norm(u));
const subKey = (u) => 'talk/sub/' + enc(u);
const lockKey = (u) => 'talk/sub/lock/' + enc(u);
const freeKey = (u, day) => 'talk/free/' + enc(u) + '/' + day;
const refundKey = (u, at) => 'talk/sub/refund/' + enc(u) + '/' + at;
/* ختم المدّة (المراجعة المعاكسة): خصمٌ واحد لكلّ حالٍ سابقة (until القديم، أو 0 بلا اشتراك). القفل وحده عمره ٢٠ ثانية — خصمٌ أبطأ منها
   (مرآة الصرف، مهلة شبكة) كان يترك القفل يسقط فيقرأ ثانٍ الاشتراك المنتهي نفسه ويخصم ثانيةً. SET NX هنا ذرّيّ فلا يمرّ إلّا واحد. */
const paidKey = (u, prior) => 'talk/sub/paid/' + enc(u) + '/' + prior;
/** يوم دبي (UTC+4 بلا توقيت صيفيّ): YYYY-MM-DD من (الآن + ٤ ساعات) بتوقيت UTC. */
const dubaiDay = (now) => new Date(Number(now) + DUBAI_MS).toISOString().slice(0, 10);

const nowOf = (o) => { const n = o && (typeof o.now === 'function' ? o.now() : o.now); return Number(n) > 0 ? Number(n) : Date.now(); };
const pointsOf = (o) => (o && o.points) || require('./points.js');
async function isOwn(me, o) {
  const owner = (o && o.isOwner) || require('./_owner.js').isOwnerName;
  if (await owner(me)) return true;      // المالك أوّلًا: بلا أيّ قراءة
  const vip = (o && o.isVip) || require('./_vip.js').isVip;
  return !!(await vip(me));
}

function readSub(raw) {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && typeof s === 'object' && Number.isFinite(Number(s.until)) ? { until: Number(s.until), auto: s.auto !== false, at: Number(s.at) || 0 } : null;
  } catch (e) { return null; /* سجلّ تالف = لا اشتراك (لا خصم عليه) */ }
}
const view = (sub, now) => (sub ? { active: now <= sub.until, until: sub.until, auto: !!sub.auto } : null);
const shape = (pl) => ({ plan: pl.plan, cap: pl.cap, left: pl.left, sub: pl.sub, cost: SUB_COST });

async function unlock(K, me) {
  try { await K.kvPipeline([['DEL', lockKey(me)]]); } catch (e) { require('./_swallow.js').swallow({ message: 'lock release failed' }, 'talk-plan:unlock'); /* القفل يسقط وحده بعد ٢٠ ثانية */ }
}

/** يردّ ٣٧ نقطة مرّة واحدة (ختم بوقت الخصم). يرجع true حين عادت. */
async function refund(o, me, at) {
  try { return !!(await pointsOf(o).refundPointsOnly(me, SUB_COST, [refundKey(me, at), '1', REFUND_MARK_TTL])); } catch (e) { return false; /* الردّ يُبلَّغ فشله للمتّصل */ }
}
async function unmark(K, mark) {
  try { await K.kvDel(mark); } catch (e) { require('./_swallow.js').swallow({ message: 'paid mark release failed' }, 'talk-plan:unmark'); /* يسقط وحده بعد ساعة */ }
}
/** يكتب الاشتراك بعد خصمه. كتابةٌ رمت ثمّ وُجدت قد وقعت (ضاع جوابها) = نجحت: ردّ النقاط عندها يمنح الاشتراك بلا خصم. */
async function save(K, me, next) {
  try { await K.kvSetRaw(subKey(me), JSON.stringify(next)); return true; } catch (e) {
    try {
      const got = readSub(await K.kvGetRaw(subKey(me), { strict: true }));
      return !!got && got.until === next.until && got.at === next.at;
    } catch (e2) { return false; /* لا يُعرف مصيرها: يُردّ كما في العقد */ }
  }
}

/* التجديد الكسول تحت القفل. يرجع { sub } (الحال بعده) مع: renewed (خُصم وكُتب) | lapsed (الرصيد لا يكفي) | retry (القفل مشغول،
   تغيير اسم، عطل — لا تغيير ويُعاد في التقييم التالي) | own (صار مالكًا/VIP: لا خصم). */
async function renewLocked(K, me, o, now) {
  if (!(await K.kvSetIfAbsent(lockKey(me), String(now), LOCK_TTL))) {
    return { sub: readSub(await K.kvGetRaw(subKey(me))), retry: true };      // غيره يقرّر الآن: لا خصم، الحال كما هو
  }
  try {
    const sub = readSub(await K.kvGetRaw(subKey(me), { strict: true }));      // قراءة ثانية داخل القفل
    if (!sub || !sub.auto || now <= sub.until) return { sub };
    const mark = paidKey(me, sub.until);
    if (!(await K.kvSetIfAbsent(mark, String(now), PAID_TTL))) return { sub, retry: true };      // تجديد هذه المدّة جرى أو يجري (قفل سقط وسطه)
    const pay = await pointsOf(o).spendPoints(me, SUB_COST, SPEND_REASON);
    if (!pay || !pay.ok) {
      await unmark(K, mark);      // لم يُخصم شيء
      if (pay && pay.reason === 'insufficient') {
        const lapsed = { until: sub.until, auto: false, at: sub.at };
        try { await K.kvSetRaw(subKey(me), JSON.stringify(lapsed)); } catch (e) { return { sub, retry: true }; /* لم يُخصم شيء؛ يُعاد لاحقًا */ }
        return { sub: lapsed, lapsed: true };
      }
      if (pay && pay.banned) return { sub };      // موقوف: لا خصم ولا تمديد — الغرفة تصير مجّانيّة (لا اشتراك بلا حدّ يُعاد تقييمه كلّ نبضة)، والسجلّ كما هو
      return { sub, retry: true };
    }
    if (pay.owner) { await unmark(K, mark); return { sub, own: true }; }
    const next = { until: now + SUB_DAYS * DAY_MS, auto: true, at: now };
    if (!(await save(K, me, next))) {
      if (await refund(o, me, now)) await unmark(K, mark);      // لم يُردّ: يبقى الختم فلا يُخصم لهذه المدّة ثانيةً قبل ساعة
      return { sub, retry: true };
    }
    return { sub: next, renewed: true, points: pay.points };
  } finally { await unlock(K, me); }
}

/** خطّة صاحب الغرفة الآن (مع التجديد الكسول): { plan, cap, left, sub, until?, lapsed?, retry? }. المالك وVIP بلا أيّ أمر تخزين. */
async function evaluate(K, who, o, now) {
  const me = norm(who);
  if (await isOwn(me, o)) return { plan: 'own', cap: SUB_CAP, left: null, sub: null };
  let sub = readSub(await K.kvGetRaw(subKey(me)));
  let r = {};
  if (sub && sub.auto && now > sub.until) { r = await renewLocked(K, me, o, now); sub = r.sub; }
  if (r.own) return { plan: 'own', cap: SUB_CAP, left: null, sub: null };
  if (sub && now <= sub.until) return { plan: 'sub', cap: SUB_CAP, left: null, sub: view(sub, now), until: sub.until, renewed: !!r.renewed };
  const used = Math.max(0, Math.trunc(Number(await K.kvGetRaw(freeKey(me, dubaiDay(now)))) || 0));
  return { plan: 'free', cap: FREE_CAP, left: Math.max(0, FREE_SECONDS - used), sub: view(sub, now), lapsed: !!r.lapsed, retry: !!r.retry };
}

/** ثواني اليوم المجّانيّة الباقية لصاحب غرفة مجّانيّة (لعمر بيانات TURN). */
async function freeLeft(K, who, now) {
  const used = Math.max(0, Math.trunc(Number(await K.kvGetRaw(freeKey(who, dubaiDay(now)))) || 0));
  return Math.max(0, FREE_SECONDS - used);
}

/* نبضة keep لغرفة (كلّ ~١٤ ثانية من صفحة صاحبها). يرجع null لغرفة المالك/VIP أو القديمة (الأوامر كما كانت)، وإلّا
   { room: السجلّ الجديد (يُكتب SET XX بعمر الغرفة بدل EXPIRE), day?, delta?, reply: حقول إضافيّة للردّ }. */
async function keepPlan(K, room, o, now) {
  if (!room || !room.u) return null;
  if (room.p === 'free') {
    const delta = Math.min(TICK_MAX, Math.max(0, Math.round((now - (Number(room.m) || now)) / 1000)));
    return { room: Object.assign({}, room, { m: now }), day: freeKey(room.u, dubaiDay(now)), delta, reply: {} };
  }
  if (room.p === 'sub') {
    if (now <= Number(room.e)) return null;      // ساري: الأوامر كما كانت
    const pl = await evaluate(K, room.u, o, now);      // مفتاح الغرفة ربطه open بصاحبها: التجديد له
    if (pl.plan === 'sub') return { room: Object.assign({}, room, { e: pl.until }), reply: {} };
    if (pl.plan === 'own') return { room: Object.assign({}, room, { p: 'own', c: SUB_CAP }), reply: {} };
    if (pl.retry) return null;      // لم يُحسم (قفل، تغيير اسم، عطل): يبقى اشتراكًا ويُعاد في النبضة التالية
    const next = Object.assign({}, room, { p: 'free', c: FREE_CAP, m: now });
    delete next.e;
    return { room: next, reply: { plan: 'free', cap: FREE_CAP, left: pl.left } };      // انتهى: عدّ مجّانيّ من الآن، لا طرد لأحد
  }
  return null;
}

/** عمليّات الخطّة. يرجع { status, json } أو null إن لم تكن منها. o: { points, isOwner, isVip, now } للاختبار. */
async function planAct(b, ip, K, who, o) {
  const op = String((b && b.op) || '');
  if (!OPS.includes(op)) return null;
  const bad = (error, status = 400, extra) => ({ status, json: Object.assign({ error }, extra || {}) });
  if (!who) return bad('login', 401);
  const me = norm(who), now = nowOf(o);

  if (op === 'plan') return { status: 200, json: shape(await evaluate(K, me, o, now)) };

  if (op === 'sub-buy') {
    if (await isOwn(me, o)) return { status: 200, json: Object.assign(shape({ plan: 'own', cap: SUB_CAP, left: null, sub: null }), { charged: 0 }) };
    const cur = readSub(await K.kvGetRaw(subKey(me)));
    if (cur && now <= cur.until) return bad('active', 409);      // لا خصم مرّتين
    if (!(b && b.confirmed === true)) {      // عرض السعر أوّلًا: لا خصم بلا تأكيد صريح (طريقة requireConfirmation في points.js)
      let points = null;
      try { const rec = await pointsOf(o).readPoints(me); points = rec ? rec.points : 0; } catch (e) { points = null; /* الرصيد للعرض فقط */ }
      return bad('confirm_required', 428, { needsConfirmation: true, cost: SUB_COST, points });
    }
    if (!(await K.kvSetIfAbsent(lockKey(me), String(now), LOCK_TTL))) return bad('busy', 409);
    try {
      const sub = readSub(await K.kvGetRaw(subKey(me), { strict: true }));
      if (sub && now <= sub.until) return bad('active', 409);
      const mark = paidKey(me, sub ? sub.until : 0);
      if (!(await K.kvSetIfAbsent(mark, String(now), PAID_TTL))) return bad('busy', 409);      // شراء أو تجديد من الحال نفسها جرى أو يجري
      const pay = await pointsOf(o).spendPoints(me, SUB_COST, SPEND_REASON);
      if (!pay || !pay.ok) {
        await unmark(K, mark);      // لم يُخصم شيء: يعيد الشراء بعد الشحن
        if (pay && pay.reason === 'insufficient') return bad('points_insufficient', 402, { needed: SUB_COST, points: Math.max(0, Number(pay.points) || 0) });
        if (pay && pay.banned) return bad('banned', 403);
        if (pay && pay.reason === 'renaming') return bad('renaming', 409);
        return bad('retry', 503);
      }
      if (pay.owner) { await unmark(K, mark); return { status: 200, json: Object.assign(shape({ plan: 'own', cap: SUB_CAP, left: null, sub: null }), { charged: 0 }) }; }
      const next = { until: now + SUB_DAYS * DAY_MS, auto: true, at: now };
      if (!(await save(K, me, next))) {
        const refunded = await refund(o, me, now);
        if (refunded) await unmark(K, mark);      // لم يُردّ: يبقى الختم فلا يُخصم ثانيةً قبل ساعة
        return bad('store', 503, { refunded });
      }
      return { status: 200, json: Object.assign(shape({ plan: 'sub', cap: SUB_CAP, left: null, sub: view(next, now) }), { charged: SUB_COST, points: pay.points }) };
    } finally { await unlock(K, me); }
  }

  // sub-auto: تشغيل التجديد وإطفاؤه — بلا خصم
  if (typeof b.on !== 'boolean') return bad('on');
  if (await isOwn(me, o)) return { status: 200, json: shape({ plan: 'own', cap: SUB_CAP, left: null, sub: null }) };
  if (!(await K.kvSetIfAbsent(lockKey(me), String(now), LOCK_TTL))) return bad('busy', 409);      // لا يكتب فوق تجديد يجري
  try {
    const sub = readSub(await K.kvGetRaw(subKey(me), { strict: true }));
    if (!sub) return bad('no-sub', 404);
    if (b.on && now > sub.until) return bad('expired', 409);      // تشغيله على منتهٍ كان سيخصم بلا تأكيد: الشراء من جديد
    if (sub.auto !== b.on) await K.kvSetRaw(subKey(me), JSON.stringify({ until: sub.until, auto: b.on, at: sub.at }));
  } finally { await unlock(K, me); }
  return { status: 200, json: shape(await evaluate(K, me, o, now)) };
}

/** تغيير الاسم (auth.js moveLiveCounters): الاشتراك وثواني اليوم المستعملة تتبع الحساب. يرمي عند العطل (يسجّله المتّصل). */
async function moveOnRename(oldKey, newKey, kv, now) {
  const K = kv || require('./kv.js');
  if (norm(oldKey) === norm(newKey)) return;
  /* المراجعة المعاكسة: تجديدٌ بالاسم القديم خصم ولم يكتب بعد (مرآة الصرف تنتظر قفل الحساب الذي يمسكه التغيير) كان يكتب اشتراكه المدفوع
     تحت الاسم الميّت بعد النقل، فيبقى المنقول منتهيًا ويُخصم ثانيةً بالاسم الجديد. ننتظر قفله (محدودًا) ونمسكه طوال النقل. */
  let held = false;
  for (let i = 0; i <= RENAME_WAIT_TRIES && !(held = await K.kvSetIfAbsent(lockKey(oldKey), 'rename', LOCK_TTL)); i++) if (i < RENAME_WAIT_TRIES) await new Promise((r) => setTimeout(r, RENAME_WAIT_MS));
  try { await moveNow(K, oldKey, newKey, now); } finally { if (held) await unlock(K, oldKey); }      // بعده لا اشتراك بالقديم: تجديدٌ به لا يجد ما يخصم له
}
async function moveNow(K, oldKey, newKey, now) {
  const old = readSub(await K.kvGetRaw(subKey(oldKey), { strict: true }));
  if (old) {
    const had = readSub(await K.kvGetRaw(subKey(newKey), { strict: true }));
    if (!had || had.until < old.until) await K.kvSetRaw(subKey(newKey), JSON.stringify(old));
    await K.kvDel(subKey(oldKey), { strict: true });
  }
  /* ثواني اليوم: الجديد = ما استُعمل بالقديم (كتابة لا إضافة: العودة لاسمٍ سابق اليوم تجد عليه «ممتلئًا» أدناه)، والقديم يُملأ لا يُحذف —
     غرفة مجّانيّة فُتحت بالقديم تعدّ عليه (room.u) فكانت تبدأ من صفر: ساعة ثانية بتغيير الاسم. الآن تنتهي في نبضتها التالية. */
  const day = dubaiDay(Number(now) || Date.now());
  const used = Math.max(0, Math.trunc(Number(await K.kvGetRaw(freeKey(oldKey, day), { strict: true }))) || 0);
  await K.kvSetRaw(freeKey(newKey, day), String(Math.min(FREE_SECONDS, used)), FREE_TTL);
  await K.kvSetRaw(freeKey(oldKey, day), String(FREE_SECONDS), FREE_TTL);
}

module.exports = {
  planAct, evaluate, keepPlan, freeLeft, moveOnRename, dubaiDay, nowOf, norm, subKey, freeKey, lockKey,
  FREE_SECONDS, FREE_CAP, SUB_CAP, SUB_COST, SUB_DAYS, SPEND_REASON, FREE_TTL,
};
