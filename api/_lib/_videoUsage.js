// Shared helper for the AI Video Maker feature (Runway / Veo 3), which runs on
// the site owner's own API key and costs real money per second of video
// generated. Because of that cost, video generation REQUIRES a logged-in
// account (no guest/anonymous access) and is capped to a small number of
// videos per day per account. Usage is stored as one small JSON record per
// user (db/video-usage/<username>.json), separate from chat usage in
// db/usage/, and resets automatically each day (UTC).
const crypto = require('crypto');
// v-atomic-quota: العدّ في _dailyQuota.js — حجز ذرّيّ قبل التوليد يُردّ إن فشل (كان قراءة JSON ثمّ كتابة).
const quotaTally = require('./_dailyQuota.js');
const { isBanned } = require('./auth.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;

// During the free testing phase, keep this small: each generated video
// (a few seconds at Gen-4/Veo 3 pricing) costs the owner real money.
const VIDEO_DAILY_LIMIT = 3;

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

// Verifies the session token and checks whether the user is still under the
// daily video quota, WITHOUT consuming any allowance yet. Video generation
// has no guest/anonymous mode — an account is required. Returns:
//   { allowed: true,  username, remaining }
//   { allowed: false, reason: 'auth' | 'limit', username }
// v-atomic-quota: مع res (ردّ طلب التوليد) يحجز مقعدًا ذرّيًّا يُردّ قبل خروج الردّ ما لم يُستهلك؛ بلا res قراءة مجرّدة.
async function checkVideoQuota(token, res) {
  const username = verifyToken(token);
  if (!username) {
    return { allowed: false, reason: 'auth', username: null };
  }
  // Suspended accounts hold a valid token for up to 30 days; the ban
  // has to bite on the paths that actually spend money, not just login.
  if (await isBanned(username)) return { allowed: false, reason: 'auth', banned: true, username };
  if (isOwner(username)) {
    return { allowed: true, username, remaining: Infinity };
  }
  return quotaTally.check('video', username, VIDEO_DAILY_LIMIT, res);
}

// Actually consumes one video generation from today's allowance. Only call
// this AFTER the upstream provider (Runway/Veo 3) has confirmed the task
// actually started — a failed/rejected request (e.g. insufficient provider
// credits, bad prompt) must never burn a user's daily quota.
async function consumeVideo(username) {
  return quotaTally.consume('video', username, VIDEO_DAILY_LIMIT);
}

// v-video-refund: فشل المزوّد **بعد** قبوله المهمّة يعيد حصّة اليوم — الخصم أعلاه معناه
// «بدأ التوليد»، والفشل (فلتر أمان أو عطب عند المزوّد) ليس من المستخدم فلا يُحاسَب عليه.
// لا ينزل تحت صفر ولا يمسّ عدّاد يوم آخر. v-atomic-quota: إنقاص ذرّيّ لعدّاد اليوم (كان قراءة ثمّ كتابة).
async function releaseVideo(username) {
  if (!username) return;
  await quotaTally.giveBack('video', username);
}

// The one account allowed to bypass the daily quota for the "long video"
// (multi-minute, many-scene) feature, since that feature can burn a large
// number of scenes in a single run. Everyone else still goes through the
// normal small daily limit above. Set via Vercel env var; falls back to the
// owner's own username so this works even before the env var is configured.
// v-owner-core: قائمة المالك الموحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
function isOwner(username) {
  return require('./_owner.js').isOwnerName(username);
}

// Verifies the session token and confirms the account is the designated
// owner account, WITHOUT touching the daily quota at all. Used only by the
// "long video" (multi-scene) feature, which is restricted to this one
// account so nobody else can rack up real charges on the owner's API keys.
function checkOwnerBypass(token) {
  const username = verifyToken(token);
  if (!username) return { allowed: false, reason: 'auth', username: null };
  if (!isOwner(username)) return { allowed: false, reason: 'forbidden', username };
  return { allowed: true, username };
}

module.exports = { checkVideoQuota, consumeVideo, releaseVideo, VIDEO_DAILY_LIMIT, isOwner, checkOwnerBypass };
