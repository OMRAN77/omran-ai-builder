// v-media-plans (قرار المالك ٢٥ سبتمبر ٢٠٢٦): اشتراك للصور وحدها واشتراك للفيديو وحده،
// بنفس أسعار المحادثة بالدرهم (٣٧٫٥ · ٧٥ · ٣٧٥). كلّ اشتراك رصيد شهريّ بالفلس من
// تكلفتنا الفعليّة، منفصل عن النقاط وعن باقة المحادثة: لا يمسّ user.plan ولا رصيد النقاط،
// فمشترك الصور لا يأخذ فيديو ولا محادثة المشتركين، والعكس.
const { kvGetRaw, kvSetRaw, kvIncrBy, kvDecrBy } = require('./kv.js');

const MEDIA_WINDOW_DAYS = 35;
const MEDIA_WINDOW_MS = MEDIA_WINDOW_DAYS * 86400000;

// الرصيد بالفلس = تكلفتنا المسموحة بعد ربح المالك ورسوم الدفع:
// صور: ٣٧٫٥ ← ربح ~٢٠ · ٧٥ ← ~٥٣ · ٣٧٥ ← ~١٦٠ درهم (المالك: «قلّل الربح وزِد الصور»).
// فيديو: ٣٧٫٥ ← ~٢٨ · ٧٥ ← ~٦٢ · ٣٧٥ ← ~٢٠٠ درهم.
// المبالغ بالدولار مطابقة للدرهم (÷٣٫٦٧٢٥) ومميّزة عن باقات المحادثة لأنّ PayPal يطابق بالمبلغ.
const MEDIA_PLANS = {
  img_basic: { media: 'image', amount: 1021, paypal: '10.21', budget: 1531, name: 'صور — 37.5 درهم / Images — 37.5 AED' },
  img_pro: { media: 'image', amount: 2042, paypal: '20.42', budget: 1872, name: 'صور — 75 درهم / Images — 75 AED' },
  img_max: { media: 'image', amount: 10211, paypal: '102.11', budget: 20302, name: 'صور — 375 درهم / Images — 375 AED' },
  vid_basic: { media: 'video', amount: 1021, paypal: '10.21', budget: 736, name: 'فيديو — 37.5 درهم / Video — 37.5 AED' },
  vid_pro: { media: 'video', amount: 2042, paypal: '20.42', budget: 927, name: 'فيديو — 75 درهم / Video — 75 AED' },
  vid_max: { media: 'video', amount: 10211, paypal: '102.11', budget: 16280, name: 'فيديو — 375 درهم / Video — 375 AED' },
};

// تكلفة كلّ عمليّة علينا بالفلس — يُخصم من رصيد الاشتراك بدل النقاط.
const UNIT_COST = {
  image_normal: 25,   // صورة عاديّة (المحرّك السريع)
  image: 50,          // صورة عالية (المحرّك الأساسيّ) = صورتان عاديّتان
  image_4k: 88,
  image_creative: 49, // فرق الإبداعيّ فوق الصورة (أفضل-من-٢)
  image_upscale: 10,
  minimax_video: 103, // اقتصادي
  runway_video: 184,  // فيديو AI
  omni_video: 294,    // سينمائيّ
  veo_video: 440,     // Veo
};

function mediaOf(reason) {
  const r = String(reason || '');
  if (!UNIT_COST[r]) return null;
  return /_video$/.test(r) ? 'video' : 'image';
}

const norm = (u) => encodeURIComponent(String(u || '').trim().toLowerCase());
const budgetKey = (username, kind) => 'media:' + kind + ':' + norm(username);
const ticketsKey = (username) => 'media:tix:' + norm(username);

function mediaActive(user, kind, now) {
  if (!user || user.deleted || !user.media || !user.media[kind]) return false;
  const m = user.media[kind];
  if (!MEDIA_PLANS[m.plan] || MEDIA_PLANS[m.plan].media !== kind) return false;
  const at = Number(m.at || 0);
  const t = typeof now === 'number' ? now : Date.now();
  return at > 0 && t - at <= MEDIA_WINDOW_MS && at <= t + 60000;
}

/** يسجّل الاشتراك على سجلّ الحساب ويملأ رصيد الشهر (التجديد يعيد الملء، لا يُرحَّل). */
async function grantMedia(user, username, planKey, now) {
  const p = MEDIA_PLANS[planKey];
  if (!p) return null;
  user.media = Object.assign({}, user.media || {});
  user.media[p.media] = { plan: planKey, at: typeof now === 'number' ? now : Date.now() };
  await kvSetRaw(budgetKey(username, p.media), p.budget, MEDIA_WINDOW_DAYS * 86400);
  return { media: p.media, budget: p.budget };
}

async function readTickets(username) {
  try {
    const raw = await kvGetRaw(ticketsKey(username));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

async function writeTickets(username, list) {
  try { await kvSetRaw(ticketsKey(username), JSON.stringify(list.slice(-20)), 3600); } catch (e) { console.warn('[media] tickets write failed:', e && e.message); }
}

/**
 * يخصم العمليّة من رصيد الاشتراك إن كان ساريًا ويكفي. null = لا اشتراك/لا يكفي
 * فيكمل المتّصل على النقاط كما كان.
 */
async function trySpendMedia(username, pts, reason, opts) {
  const kind = mediaOf(reason);
  if (!kind || !username) return null;
  const o = opts || {};
  let user = null;
  try { user = await (o.getUser || require('./auth.js').getUser)(username); } catch (e) { user = null; }
  if (!mediaActive(user, kind, o.now)) return null;
  const key = budgetKey(username, kind);
  const fils = UNIT_COST[reason];
  let raw = null;
  try { raw = await kvGetRaw(key); } catch (e) { return null; }
  if (raw === null || raw === undefined || String(raw) === '' || Number(raw) < fils) return null;
  let after;
  try { after = Number(await kvDecrBy(key, fils)); } catch (e) { return null; }
  if (!(after >= 0)) {
    try { await kvIncrBy(key, fils); } catch (e) { console.error('[media] rollback failed:', e && e.message); }
    return null;
  }
  const list = await readTickets(username);
  list.push({ p: Math.floor(Number(pts) || 0), f: fils, k: kind });
  await writeTickets(username, list);
  return { media: kind, fils, left: after };
}

/**
 * الاسترجاع يمرّ بالمبلغ بالنقاط فقط (المتّصلون لا يعرفون المصدر)، فنطابقه مع آخر
 * خصومات الاشتراك ونعيدها إليه. يرجع ما تبقّى ليُعاد نقاطًا.
 */
async function refundMedia(username, pts) {
  let left = Math.floor(Number(pts) || 0);
  if (!username || left <= 0) return left;
  const list = await readTickets(username);
  if (!list.length) return left;
  const keep = [];
  const back = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (left > 0 && t && t.p > 0 && t.p <= left) { back.push(t); left -= t.p; }
    else keep.unshift(t);
  }
  if (!back.length) return Math.floor(Number(pts) || 0);
  for (const t of back) {
    try { await kvIncrBy(budgetKey(username, t.k), t.f); } catch (e) { console.error('[media] refund failed:', e && e.message); }
  }
  await writeTickets(username, keep);
  return left;
}

const QUALITIES = ['normal', 'high'];
const HIGH_ASK_RE = /(?:جود[ةه]\s*عالي[ةه]|عالي[ةه]\s*الجود[ةه]|\bhigh[-\s]?quality\b|\bHD\b)/i;
// الكتابة داخل الصورة تذهب لمسار النصّ الأغلى، فتُحسب عالية دائمًا.
const TEXT_ASK_RE = /(?:اكتب|أكتب|كتاب[ةه]|نصّ?|خطّ?\s|اسم|حرف|\bwrite\b|\btext\b|\bwords?\b)/i;

/** جودة صورة مشترك الصور: «عاديّة» افتراضيًّا، و«جودة عالية» في الطلب أو الإعداد تجعلها عالية. null = ليس مشتركًا. */
async function imageQuality(username, text, opts) {
  const o = opts || {};
  let user = null;
  try { user = await (o.getUser || require('./auth.js').getUser)(username); } catch (e) { user = null; }
  if (!mediaActive(user, 'image', o.now)) return null;
  if (HIGH_ASK_RE.test(String(text || '')) || TEXT_ASK_RE.test(String(text || ''))) return 'high';
  return user.media.image.quality === 'high' ? 'high' : 'normal';
}

async function setImageQuality(username, quality) {
  if (!QUALITIES.includes(quality)) return false;
  const { getUser, putUser } = require('./auth.js');
  const user = await getUser(username);
  if (!mediaActive(user, 'image')) return false;
  user.media.image.quality = quality;
  await putUser(username, user);
  return true;
}

/** الرصيد المتبقّي وعدد ما يكفيه من كلّ نوع — للواجهة. */
async function mediaStatus(username, opts) {
  const o = opts || {};
  let user = null;
  try { user = await (o.getUser || require('./auth.js').getUser)(username); } catch (e) { user = null; }
  const out = {};
  for (const kind of ['image', 'video']) {
    if (!mediaActive(user, kind, o.now)) continue;
    let left = 0;
    try { left = Math.max(0, Number(await kvGetRaw(budgetKey(username, kind))) || 0); } catch (e) { left = 0; }
    const counts = {};
    for (const r of Object.keys(UNIT_COST)) if (mediaOf(r) === kind && r !== 'image_creative') counts[r] = Math.floor(left / UNIT_COST[r]);
    out[kind] = { plan: user.media[kind].plan, left, counts };
    if (kind === 'image') out.image.quality = user.media.image.quality === 'high' ? 'high' : 'normal';
  }
  return out;
}

module.exports = {
  MEDIA_PLANS, UNIT_COST, MEDIA_WINDOW_DAYS,
  mediaOf, mediaActive, grantMedia, trySpendMedia, refundMedia, mediaStatus, imageQuality, setImageQuality,
};
