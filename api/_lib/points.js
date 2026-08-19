// نظام النقاط الموحد — المحفظة الرقمية للتطبيق.
// النقاط = عملة موحدة تُصرف على: مها الصوتية (10 نقاط/دقيقة)،
// فيديو Runway (60 نقطة)، فيديو Veo 3 (400 نقطة)، توليد صورة (10 نقاط).
// هدية الترحيب عند التسجيل = 70 نقطة (تكفي: فيديو واحد + صورة واحدة).
// المالك (omran) = بلا حدود، لا يُخصم منه شيء أبدًا.
const crypto = require('crypto');
const { getUser, putUser, isBanned } = require('./auth.js');
const { isVip } = require('./_vip.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();

// أسعار الخدمات بالنقاط — المرجع الوحيد في كل الخادم.
const COSTS = {
  maha_minute: 10,   // دقيقة مكالمة مع مها
  runway_video: 60,  // فيديو Runway ‏10 ثواني
  veo_video: 400,    // فيديو Veo 3 ‏8 ثواني (بالصوت)
  image: 10,         // توليد/تعديل صورة
  screen_guide: 5,   // جلسة إرشاد بصريّ — تُخصم مرة واحدة للجلسة كاملة
  premium_claude: 20,  // رد احترافي 👑 Claude Opus 5
  premium_openai: 15,  // رد احترافي 👑 GPT-5.6
  premium_gemini: 12,  // رد احترافي 👑 Gemini 3.1 Pro
};

// خرائط الموديلات البريميوم — المرجع الوحيد في الخادم.
const PREMIUM_MODELS = {
  claude: 'claude-opus-5',
  openai: 'gpt-5.6-terra',
  gemini: 'gemini-3.1-pro-preview',
};
const PREMIUM_COST = {
  claude: 20,
  openai: 15,
  gemini: 12,
};

// هدية الترحيب للمسجلين الجدد (فيديو + صورة مجانًا فعليًا).
const WELCOME_POINTS = 70;

function isOwner(username) {
  return !!username && String(username).trim().toLowerCase() === OWNER_USERNAME;
}

// VIP = نفس معاملة المالك في النقاط بالضبط: لا خصم، لا رصيد، لا حدّ
// (see _lib/_vip.js). المالك يُفحص أوّلًا دائمًا فلا يمسّ Redis، وقائمة
// VIP تُقرأ من ذاكرة ٣٠ ثانية. isVip لا ترمي: عطبٌ فيها = مستخدم عاديّ.

function verifyToken(token) {
  try {
    const [payload, sig] = String(token).split('.');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.u;
  } catch (e) {
    return null;
  }
}

// يقرأ رصيد المستخدم. الحسابات القديمة اللي انفتحت قبل نظام النقاط
// ما عندها حقل points — تُمنح هدية الترحيب 70 نقطة تلقائيًا أول قراءة.
async function readPoints(username) {
  const user = await getUser(username);
  if (!user || user.deleted) return null;
  // The live counter wins when it exists — the record is only a mirror.
  try {
    const raw = await kvGetRaw(balanceKey(username));
    if (raw !== null && raw !== undefined && String(raw) !== '') {
      const live = Number(raw);
      if (Number.isFinite(live)) return { user, points: Math.max(0, Math.floor(live)) };
    }
  } catch (e) { /* fall through to the record */ }
  if (typeof user.points !== 'number' || !Number.isFinite(user.points)) {
    user.points = WELCOME_POINTS;
    user.welcomeGift = true;
    try { await putUser(username, user); } catch (e) { /* best-effort */ }
  }
  return { user, points: Math.max(0, Math.floor(user.points)) };
}

// ---------------------------------------------------------------------------
// المحفظة الذرّية
// ---------------------------------------------------------------------------
// The balance used to live only inside the user record, so spending was
// read → check → write. Ten concurrent requests all read the same number and
// all passed the check, which let a 70-point account start several 400-point
// Veo videos — a real cash cost, not a quota overrun.
//
// The live balance now lives in its own Redis integer and moves with DECRBY,
// which Redis evaluates under its own lock. The user record keeps a mirror so
// nothing else in the app has to change, and so an existing account migrates
// on first touch instead of losing its points.
const { kvIncrBy, kvDecrBy, kvSetIfAbsent, kvGetRaw } = require('./kv.js');

function balanceKey(username) {
  return 'points:' + encodeURIComponent(String(username).trim().toLowerCase());
}

/** Seeds the counter from the user record the first time we see this account. */
async function ensureBalance(username) {
  const key = balanceKey(username);
  const raw = await kvGetRaw(key);
  if (raw !== null && raw !== undefined && String(raw) !== '') return Number(raw);
  const rec = await readPoints(username);
  const seed = rec ? rec.points : 0;
  await kvSetIfAbsent(key, seed);
  const now = await kvGetRaw(key);
  return Number(now == null ? seed : now);
}

/** Keeps the user record in step with the counter. Best-effort by design. */
async function mirrorToUser(username, points) {
  try {
    const rec = await readPoints(username);
    if (!rec) return;
    rec.user.points = Math.max(0, Math.floor(points));
    await putUser(username, rec.user);
  } catch (e) {
    console.warn('[points] mirror failed for ' + username + ':', e && e.message);
  }
}

// يخصم نقاطًا من رصيد المستخدم. المالك لا يُخصم منه.
// يرجع { ok:true, points } أو { ok:false, reason:'insufficient'|'auth', points }.
async function spendPoints(username, amount, reason) {
  if (!username) return { ok: false, reason: 'auth', points: 0 };
  // owner:true للـVIP أيضًا وعن قصد: نداءٌ واحد على الأقل يقرأ هذا الحقل
  // ليقرّر «هل أجدول استرجاعًا؟» (api/_lib/openai.js). VIP لم يُخصم منه
  // شيء، فاسترجاعه كان سيهديه نقاطًا من العدم. الحقل vip يميّز الحالتين.
  if (isOwner(username)) return { ok: true, points: Infinity, owner: true };
  if (await isVip(username)) return { ok: true, points: Infinity, owner: true, vip: true };
  // Suspended account: never let a live token drain the points balance.
  if (await isBanned(username)) return { ok: false, reason: 'auth', banned: true, points: 0 };
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (amt === 0) return { ok: true, points: 0 };

  let before;
  try {
    before = await ensureBalance(username);
  } catch (e) {
    console.error('[points] balance unavailable:', e && e.message);
    return { ok: false, reason: 'auth', points: 0 };
  }
  if (!Number.isFinite(before)) return { ok: false, reason: 'auth', points: 0 };
  if (before < amt) return { ok: false, reason: 'insufficient', points: Math.max(0, before), needed: amt };

  // Deduct first, then look at the result. Losing the race means the balance
  // went negative — we hand the points straight back and refuse, so two callers
  // can never both spend the same last credit.
  let after;
  try {
    after = Number(await kvDecrBy(balanceKey(username), amt));
  } catch (e) {
    console.error('[points] DECRBY failed:', e && e.message);
    return { ok: false, reason: 'auth', points: 0 };
  }
  if (after < 0) {
    try { await kvIncrBy(balanceKey(username), amt); } catch (e) { console.error('[points] rollback failed:', e && e.message); }
    return { ok: false, reason: 'insufficient', points: Math.max(0, after + amt), needed: amt };
  }

  await mirrorToUser(username, after);
  return { ok: true, points: after, spent: amt, reason };
}

// يعيد نقاطًا للمستخدم (استرجاع عند فشل توليد بعد الخصم).
async function refundPoints(username, amount) {
  if (!username || isOwner(username)) return;
  if (await isVip(username)) return; // لم يُخصم منه شيء، فلا شيء يُعاد.
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (!amt) return;
  // Must go through the same atomic counter as the deduction. A read-modify-
  // write refund running next to a concurrent spend would overwrite it and
  // silently hand back points that were legitimately taken.
  try {
    await ensureBalance(username);
    const after = Number(await kvIncrBy(balanceKey(username), amt));
    await mirrorToUser(username, after);
  } catch (e) {
    console.error('[points] refund failed for ' + username + ':', e && e.message);
  }
}

// نفس دوال الخصم لكن عبر التوكن مباشرة (للاستخدام من نقاط النهاية الأخرى).
async function spendByToken(token, amount, reason) {
  const username = verifyToken(token);
  if (!username) return { ok: false, reason: 'auth', points: 0 };
  return spendPoints(username, amount, reason);
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
    const { action, token, amount, reason } = body || {};
    const username = verifyToken(token);

    if (action === 'balance') {
      if (!username) { res.status(200).json({ ok: true, authed: false, points: 0 }); return; }
      if (isOwner(username)) { res.status(200).json({ ok: true, authed: true, owner: true, points: null, unlimited: true, costs: COSTS }); return; }
      // VIP: الواجهة تقرأ unlimited وحده (∞ بدل الرقم)، وowner يبقى false
      // لأنّه ليس مالكًا — لوحة التحكّم لا تُفتح له، الحدّ وحده يسقط.
      if (await isVip(username)) { res.status(200).json({ ok: true, authed: true, owner: false, vip: true, points: null, unlimited: true, costs: COSTS }); return; }
      const rec = await readPoints(username);
      if (!rec) { res.status(200).json({ ok: true, authed: false, points: 0 }); return; }
      res.status(200).json({
        ok: true, authed: true, owner: false,
        points: rec.points,
        mahaTrialUsed: !!rec.user.mahaTrialUsed,
        costs: COSTS,
      });
      return;
    }

    if (action === 'consume') {
      // خصم من العميل (مثال: دقيقة مها أثناء المكالمة). المبالغ المسموحة
      // محصورة بأسعار الخدمات المعروفة فقط — ما نقبل أرقام عشوائية.
      if (!username) { res.status(401).json({ ok: false, reason: 'auth' }); return; }
      const allowed = Object.values(COSTS);
      const amt = Math.floor(Number(amount) || 0);
      if (!allowed.includes(amt)) { res.status(400).json({ ok: false, reason: 'bad_amount' }); return; }
      const result = await spendPoints(username, amt, String(reason || 'client'));
      res.status(200).json(result);
      return;
    }

    if (action === 'maha-trial-used') {
      // تسجيل استهلاك الدقيقة التجريبية المجانية لمها (مرة وحدة بالعمر).
      if (!username) { res.status(401).json({ ok: false, reason: 'auth' }); return; }
      if (!isOwner(username)) {
        const rec = await readPoints(username);
        if (rec && !rec.user.mahaTrialUsed) {
          rec.user.mahaTrialUsed = true;
          await putUser(username, rec.user);
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'points error' });
  }
};

module.exports.COSTS = COSTS;
module.exports.PREMIUM_MODELS = PREMIUM_MODELS;
module.exports.PREMIUM_COST = PREMIUM_COST;
module.exports.WELCOME_POINTS = WELCOME_POINTS;
module.exports.spendPoints = spendPoints;
module.exports.spendByToken = spendByToken;
module.exports.refundPoints = refundPoints;
module.exports.readPoints = readPoints;
module.exports.isOwnerUsername = isOwner;
module.exports.verifyPointsToken = verifyToken;

/**
 * بوابة تأكيد قبل أي عملية تصرف نقاطًا.
 *
 * v204 سجّل الحادثة التي وُجدت هذه من أجلها: مستخدم كتب «أريد فيديو» فقط،
 * فولّد التطبيق مقطعًا عشوائيًا وأحرق 60 نقطة على شيء لم يطلبه أحد.
 *
 * Now that tools are invoked by the model rather than by an explicit button,
 * that mistake gets easier, not harder — so the check lives in the code, not
 * in a model instruction that can be talked around.
 *
 * The caller must send { confirmed: true }. Without it the endpoint returns a
 * price quote and spends nothing.
 */
function requireConfirmation(body, cost, label) {
  const confirmed = !!(body && (body.confirmed === true || body.confirm === true));
  if (confirmed) return null;
  return {
    status: 428,
    payload: {
      error: 'confirm_required',
      needsConfirmation: true,
      cost: cost,
      label: label,
      message_ar: 'هذه العملية تخصم ' + cost + ' نقطة (' + label + '). أكّد للمتابعة.',
    },
  };
}

module.exports.requireConfirmation = requireConfirmation;
