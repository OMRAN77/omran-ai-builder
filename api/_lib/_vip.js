// قائمة VIP — «مالكٌ بالإنابة» في الحدود وحدها.
//
// المالك معفى من كل عدّاد (see _usage.js / points.js). هذه القائمة تمنح
// نفس الإعفاء لأسماء يختارها المالك يدويًّا، بلا أن يصير أحدهم مالكًا:
// لا لوحة تحكّم، ولا بوّابة _owner.js، ولا صلاحية على أحد. الحدّ فقط.
//
// المفتاح في Redis: vip_users → مصفوفة نصوص منسّقة (صغيرة، بلا فراغ)،
// كلٌّ منها اسم مستخدم أو إيميل.
//
// قاعدتان تحكمان هذا الملفّ:
//   ١) isVip لا ترمي أبدًا. عطبٌ في Redis يجب أن يعني «ليس VIP»، لا أن
//      يُسقط طلب المستخدم — الحدّ يُطبَّق عندها كما كان قبل هذه الميزة.
//   ٢) لا نداء Redis على كل طلب. الطريق الساخن (checkAndConsume) يمرّ من
//      هنا مرّتين في كل رسالة، فذاكرة ٣٠ ثانية داخل العملية تكفي: أسوأ
//      حالة أن إضافةً تتأخّر نصف دقيقة على نسخة لامدا لم تُبطَّل ذاكرتها.
const { kvGetJSON, kvPutJSON } = require('./kv.js');

const VIP_KEY = 'vip_users';
const CACHE_MS = 30000;
const MAX_ID_LEN = 190;

let cache = null;       // آخر قائمة قُرئت
let cacheAt = 0;        // متى قُرئت (Date.now)

// تنسيق موحّد: ما يُخزَّن وما يُقارَن يمرّان من هنا معًا، وإلّا صار
// "Omran@x.com " و"omran@x.com" مدخلين مختلفين في القائمة نفسها.
function normalizeId(id) {
  if (typeof id !== 'string') return '';
  return id.trim().toLowerCase().slice(0, MAX_ID_LEN);
}

function invalidateCache() {
  cache = null;
  cacheAt = 0;
}

// يقرأ القائمة من Redis (أو من الذاكرة إن كانت طازجة). لا يرمي.
async function getVipList(opts) {
  const fresh = opts && opts.fresh;
  if (!fresh && cache && (Date.now() - cacheAt) < CACHE_MS) return cache;
  try {
    const raw = await kvGetJSON(VIP_KEY);
    const list = Array.isArray(raw) ? raw.map(normalizeId).filter(Boolean) : [];
    cache = list;
    cacheAt = Date.now();
    return list;
  } catch (e) {
    // Redis غائب أو مقطوع: نرجع آخر نسخة معروفة إن وُجدت، وإلّا قائمة
    // فارغة. لا استثناء يخرج من هنا — انظر القاعدة (١) أعلى الملفّ.
    return cache || [];
  }
}

async function addVip(id) {
  const clean = normalizeId(id);
  if (!clean) return await getVipList({ fresh: true });
  const list = await getVipList({ fresh: true });
  if (list.indexOf(clean) === -1) {
    const next = list.concat([clean]);
    await kvPutJSON(VIP_KEY, next);
    invalidateCache();
    cache = next;
    cacheAt = Date.now();
    return next;
  }
  return list;
}

async function removeVip(id) {
  const clean = normalizeId(id);
  const list = await getVipList({ fresh: true });
  const next = list.filter((x) => x !== clean);
  if (next.length !== list.length) {
    await kvPutJSON(VIP_KEY, next);
    invalidateCache();
    cache = next;
    cacheAt = Date.now();
  }
  return next;
}

// هل هذا المنادي VIP؟ يقبل اسم مستخدم أو إيميل أو مصفوفة من الاثنين،
// فتُطابَق أيّ هويّة تكون في يد الطريق الساخن أصلًا — بلا قراءة سجلّ
// مستخدم إضافيّة (تلك قراءة تُدفع في كل رسالة، ولا تستحقّ).
async function isVip(identifier) {
  try {
    const ids = (Array.isArray(identifier) ? identifier : [identifier])
      .map(normalizeId)
      .filter(Boolean);
    if (!ids.length) return false;
    const list = await getVipList();
    if (!list.length) return false;
    return ids.some((x) => list.indexOf(x) !== -1);
  } catch (e) {
    return false; // القاعدة (١): لا يُحجب طلبٌ بسبب عطب في هذه القائمة.
  }
}

// v-vip-verified: بريدٌ ثبت للتوّ لصاحبه (رمز «حسابي»، حساب أنشأه رمز البريد، دخول Google). إن كان في القائمة إيميلًا خامًا —
// أضافه المالك ولا مؤكَّد يحمله يومها (vip.js لا يحوّل إيميلًا إلّا إلى حساب أثبته) — يُضاف اسم الحساب بجانبه، كما كان سيحدث لو
// كان مؤكَّدًا لحظة الإضافة. الإيميل الخام يبقى: لا يطابق إلّا اسمًا قديمًا هو نفسه (قبل v-name-no-at — قرار المالك: لا يُمسّ)، ونزعه
// كان يسحب VIP ذلك الحساب بنقاطه وسجلّه وينقله إلى حساب جديد فارغ (مراجعة النقض). مرّة واحدة لكلّ إيميل (db/vip-promoted/):
// وإلّا كلّ حساب يثبت البريد نفسه (حسابات صاحبه، أو من يعطيه الرمز) يأخذ VIP بلا عدد، وما يزيله المالك يعود مع الدخول التالي.
// المالك يعيد الفرصة بإضافة الإيميل من جديد (vip.js). لا يرمي (القاعدة ١).
const MAX_LIST = 500;
function promotedKey(email) { return 'db/vip-promoted/' + encodeURIComponent(email); }
async function promoteVerifiedEmail(email, username) {
  try {
    const e = normalizeId(email);
    const u = normalizeId(username);
    if (!e || !u || e.indexOf('@') === -1) return false;
    const list = await getVipList({ fresh: true });
    if (list.indexOf(e) === -1 || list.indexOf(u) !== -1 || list.length >= MAX_LIST) return false;
    if (!(await require('./kv.js').kvSetIfAbsent(promotedKey(e), u))) return false;
    const next = list.concat([u]);
    await kvPutJSON(VIP_KEY, next);
    invalidateCache();
    cache = next;
    cacheAt = Date.now();
    return true;
  } catch (err) {
    return false;
  }
}

// v-lock-acct (srv-auth-12، باب المال بموافقة المالك ٢٧ أكتوبر): تغيير الاسم (auth.js changeUsername) — مدخل الاسم القديم يصير
// الجديد في كتابة واحدة، فلا يسقط الإعفاء ولا يبقى مدخلان لحساب واحد. القراءة صارمة: عطب Redis = لا كتابة فوق قائمة لم تُقرأ (المالك
// قد يكون أضاف أحدًا للتوّ). مدخل فيه @ يبقى (قد يكون إيميلًا خامًا أضافه المالك لصاحبه — v-vip-verified) ويُضاف الاسم الجديد بجانبه.
// v-lock-acct (srv-auth-12، المراجعة): ما عدا مفتاح Google ‏g_<البريد> — هو اسم حساب (vip.js يحوّل إيميل المالك إليه) لا إيميل خام؛
// بقاؤه كان يُبقي الاسم الميّت، ويعيد VIP بالرجوع إليه (ownGoogleKey) بعد أن يزيل المالك الاسم الجديد.
// يرمي العطب لمناديه الوحيد (moveVip في auth.js) فيسجّله ولا يُفشل التغيير — كان يُبتلع هنا فيسقط VIP بلا سطر في السجلّ.
async function renameVip(oldId, newId) {
  const o = normalizeId(oldId);
  const nw = normalizeId(newId);
  if (!o || !nw || o === nw) return false;
  const raw = await kvGetJSON(VIP_KEY, { strict: true });
  const list = Array.isArray(raw) ? raw.map(normalizeId).filter(Boolean) : [];
  if (list.indexOf(o) === -1) return false;
  const rawEmail = o.indexOf('@') !== -1 && !/^g_/.test(o);
  const next = list.filter((x) => x !== o || rawEmail);
  if (next.indexOf(nw) === -1) next.push(nw);
  await kvPutJSON(VIP_KEY, next);
  invalidateCache();
  cache = next;
  cacheAt = Date.now();
  return true;
}

module.exports = { getVipList, addVip, removeVip, isVip, normalizeId, invalidateCache, promoteVerifiedEmail, promotedKey, renameVip, VIP_KEY };
