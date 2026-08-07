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

module.exports = { getVipList, addVip, removeVip, isVip, normalizeId, invalidateCache, VIP_KEY };
