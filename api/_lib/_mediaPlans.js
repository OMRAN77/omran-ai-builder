// v-media-plans (قرار المالك ٢٥ سبتمبر ٢٠٢٦): اشتراك للصور وحدها واشتراك للفيديو وحده،
// بنفس أسعار المحادثة بالدرهم (٣٧٫٥ · ٧٥ · ٣٧٥). كلّ اشتراك رصيد شهريّ بالفلس من
// تكلفتنا الفعليّة، منفصل عن النقاط وعن باقة المحادثة: لا يمسّ user.plan ولا رصيد النقاط،
// فمشترك الصور لا يأخذ فيديو ولا محادثة المشتركين، والعكس.
// v-media-merge (قرار المالك ٨ أكتوبر ٢٠٢٦، باب المال بموافقته على البند وحده: «اعتمد البديل ونفّذ الدمج»): الصور والفيديو
// صارا باقة واحدة (media_*، خانة 'mix') برصيد واحد يصرف منه أيّ صورة أو فيديو بتكلفته في UNIT_COST. الرصيد = ثلث السعر بالدرهم
// (قاعدة «كلّ خدمة ٣ أضعاف تكلفتها»): ١٢٥٠ · ٢٥٠٠ · ١٢٥٠٠ فلس. img_*/vid_* توقّف بيعها (retired) — لا جلسة دفع جديدة لها — لكنّها
// تبقى هنا: تجديد اشتراك قائم أو جلسة بدأت قبل النشر يُمنح كما كان (لا مال بلا منح)، والقائمة تكمل نافذتها ويُصرف منها أوّلًا.
const { kvGetRaw, kvSetRaw, kvIncrBy, kvDecrBy } = require('./kv.js');

const MEDIA_WINDOW_DAYS = 35;
const MEDIA_WINDOW_MS = MEDIA_WINDOW_DAYS * 86400000;

// الرصيد بالفلس = تكلفتنا المسموحة بعد ربح المالك ورسوم الدفع:
// صور: ٣٧٫٥ ← ربح ~٢٠ · ٧٥ ← ~٤١ · ٣٧٥ ← ~١٦٠ درهم (المالك: «قلّل الربح وزِد الصور»).
// فيديو: ٣٧٫٥ ← ~٢٣ · ٧٥ ← ~٤٨ · ٣٧٥ ← ~٢٠٠ درهم (v-fair-video).
// المبالغ بالدولار مطابقة للدرهم (÷٣٫٦٧٢٥) ومميّزة عن باقات المحادثة لأنّ PayPal يطابق بالمبلغ.
const MEDIA_PLANS = {
  img_basic: { media: 'image', retired: true, amount: 1021, paypal: '10.21', budget: 1531, name: 'صور — 37.5 درهم / Images — 37.5 AED' },
  // v-fair-video (قرار المالك ٥ أكتوبر): الوسطى ضعف الأساسيّة بضعف السعر (كانت ٧٤ صورة مقابل ٦١) — ربحها ~٤١ درهم لا ~٥٣.
  img_pro: { media: 'image', retired: true, amount: 2042, paypal: '20.42', budget: 3050, name: 'صور — 75 درهم / Images — 75 AED' },
  img_max: { media: 'image', retired: true, amount: 10211, paypal: '102.11', budget: 20302, name: 'صور — 375 درهم / Images — 375 AED' },
  // v-fair-video: اشتراك الفيديو وحده كان يعطي اقتصاديًّا أقلّ من Plus (٧ مقابل ٩) — الأساسيّ ١١ والوسطى ٢٣ (ربح ~٢٣ · ~٤٨ درهم).
  vid_basic: { media: 'video', retired: true, amount: 1021, paypal: '10.21', budget: 1200, name: 'فيديو — 37.5 درهم / Video — 37.5 AED' },
  vid_pro: { media: 'video', retired: true, amount: 2042, paypal: '20.42', budget: 2400, name: 'فيديو — 75 درهم / Video — 75 AED' },
  vid_max: { media: 'video', retired: true, amount: 10211, paypal: '102.11', budget: 16280, name: 'فيديو — 375 درهم / Video — 375 AED' },
  // v-maha-plans: دقائق مها الصوتيّة (المالك: «خلّ الناس تستفيد») — ربح ~١٠ · ~٢١ · ~١٠٠ درهم ⇒ ٤٦ · ٩٢ · ٤٧٨ دقيقة.
  maha_basic: { media: 'maha', amount: 1021, paypal: '10.21', budget: 2530, name: 'مها — 37.5 درهم / Maha — 37.5 AED' },
  maha_pro: { media: 'maha', amount: 2042, paypal: '20.42', budget: 5060, name: 'مها — 75 درهم / Maha — 75 AED' }, // v-fair-video: ٩٢ دقيقة (ربح ~٢١ درهم)
  maha_max: { media: 'maha', amount: 10211, paypal: '102.11', budget: 26290, name: 'مها — 375 درهم / Maha — 375 AED' },
  // v-media-merge: الصور والفيديو برصيد واحد — يكفي تقريبًا ٥٠ صورة عاديّة (٢٥ فلسًا) أو ١٢ فيديو اقتصاديًّا (١٠٣) · ١٠٠ أو ٢٤ · ٥٠٠ أو ١٢١.
  // الهامش في أسوأ حالة (كلّ الرصيد مصروف) ≈ ٦١–٦٣٪ بعد رسوم الدفع.
  media_basic: { media: 'mix', amount: 1021, paypal: '10.21', budget: 1250, name: 'صور وفيديو — 37.5 درهم / Images & Video — 37.5 AED' },
  media_pro: { media: 'mix', amount: 2042, paypal: '20.42', budget: 2500, name: 'صور وفيديو — 75 درهم / Images & Video — 75 AED' },
  media_max: { media: 'mix', amount: 10211, paypal: '102.11', budget: 12500, name: 'صور وفيديو — 375 درهم / Images & Video — 375 AED' },
};

// خانات الرصيد على سجلّ الحساب (user.media[kind] ومفتاح media:<kind>:<الاسم>) — تغيير الاسم ونهايات الاشتراكات تمرّ عليها كلّها.
const MEDIA_KINDS = ['image', 'video', 'maha', 'mix'];
// من أين تُصرف كلّ عمليّة وبأيّ ترتيب: باقة نوعها القديمة (img_/vid_) حتّى تنفد أو تنتهي نافذتها، ثمّ المدموجة، ثمّ النقاط (points.js).
const SPEND_POOLS = { image: ['image', 'mix'], video: ['video', 'mix'], maha: ['maha'] };
// ما تغطّيه كلّ خانة من أنواع العمليّات (لعدّ «يكفي كم» في الحالة).
const COVERS = { image: ['image'], video: ['video'], maha: ['maha'], mix: ['image', 'video'] };

// حدّ المكالمة الواحدة لمشترك مها بالدقائق — مكالمة منسيّة مفتوحة لا تأكل رصيد الشهر.
const MAHA_CALL_CAP_MIN = 10;

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
  maha_minute: 55,    // دقيقة مكالمة مها على المحرّك الصوتيّ الكامل
};

function mediaOf(reason) {
  const r = String(reason || '');
  if (!UNIT_COST[r]) return null;
  if (r === 'maha_minute') return 'maha';
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

// يأخذ fils من رصيد خانة واحدة إن كفى: الباقي بعده، أو null (لا رصيد/لا يكفي/عطب) فيجرّب المتّصل الخانة التالية.
async function takeBudget(username, kind, fils) {
  const key = budgetKey(username, kind);
  let raw = null;
  try { raw = await kvGetRaw(key); } catch (e) { return null; }
  if (raw === null || raw === undefined || String(raw) === '' || Number(raw) < fils) return null;
  let after;
  try { after = Number(await kvDecrBy(key, fils)); } catch (e) { return null; }
  if (!(after >= 0)) {
    try { await kvIncrBy(key, fils); } catch (e) { console.error('[media] rollback failed:', e && e.message); }
    return null;
  }
  return after;
}

/**
 * يخصم العمليّة من رصيد الاشتراك إن كان ساريًا ويكفي. null = لا اشتراك/لا يكفي
 * فيكمل المتّصل على النقاط كما كان. v-media-merge: الخانات بترتيب SPEND_POOLS — باقة النوع القديمة ثمّ المدموجة؛
 * media = نوع العمليّة (image/video/maha) كما كان (maha-image يقرأه)، وpool = الخانة التي صُرف منها.
 */
async function trySpendMedia(username, pts, reason, opts) {
  const kind = mediaOf(reason);
  if (!kind || !username) return null;
  const o = opts || {};
  let user = null;
  try { user = await (o.getUser || require('./auth.js').getUser)(username); } catch (e) { user = null; }
  const fils = UNIT_COST[reason];
  for (const pool of SPEND_POOLS[kind]) {
    if (!mediaActive(user, pool, o.now)) continue;
    const after = await takeBudget(username, pool, fils);
    if (after === null) continue;
    // دقيقة مها مضت فعلًا فلا تُستردّ، ولا تذكرة لها كي لا يطابقها استرجاع ١٥ نقطة من خدمة أخرى.
    if (kind !== 'maha') {
      const list = await readTickets(username);
      list.push({ p: Math.floor(Number(pts) || 0), f: fils, k: pool }); // k = الخانة: الاسترجاع يعود إليها
      await writeTickets(username, list);
    }
    return { media: kind, pool, fils, left: after };
  }
  return null;
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

// v-maha-server-bill: دقيقة الافتتاح دُفعت من رصيد مها ثمّ لم تُفتح الجلسة عند المزوّد — تعود إلى رصيدها نفسه.
async function refundMahaMinute(username) {
  await kvIncrBy(budgetKey(username, 'maha'), UNIT_COST.maha_minute);
}

const QUALITIES = ['normal', 'high'];
const HIGH_ASK_RE = /(?:جود[ةه]\s*عالي[ةه]|عالي[ةه]\s*الجود[ةه]|\bhigh[-\s]?quality\b|\bHD\b)/i;
// الكتابة داخل الصورة تذهب لمسار النصّ الأغلى، فتُحسب عالية دائمًا.
const TEXT_ASK_RE = /(?:اكتب|أكتب|كتاب[ةه]|نصّ?|خطّ?\s|اسم|حرف|\bwrite\b|\btext\b|\bwords?\b)/i;

// v-media-merge: الجودة لمشترك الصور القديمة أو المدموجة — الخانة التي يُصرف منها أوّلًا تحكم، والإعداد يُكتب على كلّ خانة سارية.
const imageSlots = (user, now) => SPEND_POOLS.image.filter((k) => mediaActive(user, k, now));

/** جودة صورة مشترك الصور: «عاديّة» افتراضيًّا، و«جودة عالية» في الطلب أو الإعداد تجعلها عالية. null = ليس مشتركًا. */
async function imageQuality(username, text, opts) {
  const o = opts || {};
  let user = null;
  try { user = await (o.getUser || require('./auth.js').getUser)(username); } catch (e) { user = null; }
  const slot = imageSlots(user, o.now)[0];
  if (!slot) return null;
  if (HIGH_ASK_RE.test(String(text || '')) || TEXT_ASK_RE.test(String(text || ''))) return 'high';
  return user.media[slot].quality === 'high' ? 'high' : 'normal';
}

async function setImageQuality(username, quality) {
  if (!QUALITIES.includes(quality)) return false;
  const { getUser, putUser } = require('./auth.js');
  const user = await getUser(username);
  const slots = imageSlots(user);
  if (!slots.length) return false;
  for (const k of slots) user.media[k].quality = quality;
  await putUser(username, user);
  return true;
}

/** الرصيد المتبقّي وعدد ما يكفيه من كلّ نوع — للواجهة. */
async function mediaStatus(username, opts) {
  const o = opts || {};
  let user = null;
  try { user = await (o.getUser || require('./auth.js').getUser)(username); } catch (e) { user = null; }
  const out = {};
  for (const kind of MEDIA_KINDS) {
    if (!mediaActive(user, kind, o.now)) continue;
    let left = 0;
    try { left = Math.max(0, Number(await kvGetRaw(budgetKey(username, kind))) || 0); } catch (e) { left = 0; }
    const counts = {};
    for (const r of Object.keys(UNIT_COST)) if (COVERS[kind].includes(mediaOf(r)) && r !== 'image_creative') counts[r] = Math.floor(left / UNIT_COST[r]);
    out[kind] = { plan: user.media[kind].plan, left, counts };
    if (COVERS[kind].includes('image')) out[kind].quality = user.media[kind].quality === 'high' ? 'high' : 'normal';
  }
  return out;
}

module.exports = {
  MEDIA_PLANS, UNIT_COST, MEDIA_WINDOW_DAYS, MAHA_CALL_CAP_MIN, MEDIA_KINDS, SPEND_POOLS,
  mediaOf, mediaActive, grantMedia, trySpendMedia, refundMedia, refundMahaMinute, mediaStatus, imageQuality, setImageQuality,
};
