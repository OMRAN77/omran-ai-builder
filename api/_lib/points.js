// نظام النقاط الموحد — المحفظة الرقمية للتطبيق.
// النقاط = عملة موحدة تُصرف على: مها الصوتية (10 نقاط/دقيقة)،
// فيديو Runway (60 نقطة)، فيديو Veo 3 (400 نقطة)، توليد صورة (10 نقاط).
// هدية الترحيب عند التسجيل = 70 نقطة (تكفي: فيديو واحد + صورة واحدة).
// المالك (omran) = بلا حدود، لا يُخصم منه شيء أبدًا.
const crypto = require('crypto');
const { getUser, putUser } = require('./auth.js');

const AUTH_SECRET = process.env.AUTH_SECRET || 'fallback-dev-secret-change-me';
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'omran').trim().toLowerCase();

// أسعار الخدمات بالنقاط — المرجع الوحيد في كل الخادم.
const COSTS = {
  maha_minute: 10,   // دقيقة مكالمة مع مها
  runway_video: 60,  // فيديو Runway ‏10 ثواني
  veo_video: 400,    // فيديو Veo 3 ‏8 ثواني (بالصوت)
  image: 10,         // توليد/تعديل صورة
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
  if (typeof user.points !== 'number' || !Number.isFinite(user.points)) {
    user.points = WELCOME_POINTS;
    user.welcomeGift = true;
    try { await putUser(username, user); } catch (e) { /* best-effort */ }
  }
  return { user, points: Math.max(0, Math.floor(user.points)) };
}

// يخصم نقاطًا من رصيد المستخدم. المالك لا يُخصم منه.
// يرجع { ok:true, points } أو { ok:false, reason:'insufficient'|'auth', points }.
async function spendPoints(username, amount, reason) {
  if (!username) return { ok: false, reason: 'auth', points: 0 };
  if (isOwner(username)) return { ok: true, points: Infinity, owner: true };
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if (amt === 0) return { ok: true, points: 0 };
  const rec = await readPoints(username);
  if (!rec) return { ok: false, reason: 'auth', points: 0 };
  if (rec.points < amt) return { ok: false, reason: 'insufficient', points: rec.points, needed: amt };
  rec.user.points = rec.points - amt;
  await putUser(username, rec.user);
  return { ok: true, points: rec.user.points, spent: amt, reason };
}

// يعيد نقاطًا للمستخدم (استرجاع عند فشل توليد بعد الخصم).
async function refundPoints(username, amount) {
  if (!username || isOwner(username)) return;
  try {
    const rec = await readPoints(username);
    if (!rec) return;
    rec.user.points = rec.points + Math.max(0, Math.floor(Number(amount) || 0));
    await putUser(username, rec.user);
  } catch (e) { /* best-effort */ }
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
