// نقطة نهاية «صلاحيات VIP» — للمالك وحده.
//
// كل طريقة (GET · POST · DELETE) تمرّ من isOwner(req) في _owner.js: نفس
// البوّابة المُختبَرة في tests/owner-gate.test.cjs (رمز جلسة موقَّع أو
// MONITOR_KEY، ومقارنة ثابتة الزمن). إخفاء القسم في الواجهة ليس حراسة —
// الحراسة هنا وحدها.
//
//   GET    /api/vip?token=…            → { list:[…] }
//   POST   /api/vip   {token,id}       → { ok:true, list:[…] }
//   DELETE /api/vip?token=…&id=…       → { ok:true, list:[…] }
//
// الحذف يقبل id من سلسلة الاستعلام أيضًا: بعض العملاء (وfetch نفسه في
// متصفّحات قديمة) لا يرسل جسمًا مع DELETE، فكان الطلب يصل بلا معرّف.
const { isOwner } = require('./_owner.js');
const { getVipList, addVip, removeVip, normalizeId } = require('./_vip.js');

const MAX_ID_LEN = 190;
const MAX_LIST = 500;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

// جسم الطلب يصل مُحلَّلًا على Vercel، ونصًّا في بعض المسارات المحلّية.
function readBody(req) {
  let body = req && req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch (e) {
      return {}; // جسم غير صالح = بلا معرّف، والتحقّق أدناه يردّه برسالة واضحة.
    }
  }
  return typeof body === 'object' ? body : {};
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { send(res, 204, {}); return; }

    if (!isOwner(req)) {
      send(res, 403, { error: 'غير مصرح' });
      return;
    }

    const method = String(req.method || 'GET').toUpperCase();
    const body = readBody(req);
    const query = (req && req.query) || {};

    if (method === 'GET') {
      const list = await getVipList({ fresh: true });
      send(res, 200, { ok: true, list });
      return;
    }

    if (method === 'POST') {
      const rawId = body.id != null ? body.id : query.id;
      if (typeof rawId !== 'string' || !rawId.trim()) {
        send(res, 400, { error: 'المعرّف مطلوب' });
        return;
      }
      if (rawId.length > MAX_ID_LEN) {
        send(res, 400, { error: 'المعرّف طويل جدًا' });
        return;
      }
      const current = await getVipList({ fresh: true });
      if (current.length >= MAX_LIST) {
        send(res, 400, { error: 'القائمة ممتلئة' });
        return;
      }
      // إيميل؟ نحوّله إلى اسم الحساب هنا — مرّة واحدة، خارج الطريق الساخن.
      // الطريق الساخن لا يملك إلا اسم المستخدم، فإيميلٌ مخزَّن كما هو لن
      // يُطابِق شيئًا أبدًا. إن تعذّر التحويل نخزّن الإيميل كما جاء.
      const id = await resolveToUsername(normalizeId(rawId));
      const list = await addVip(id);
      send(res, 200, { ok: true, id, list });
      return;
    }

    if (method === 'DELETE') {
      const rawId = body.id != null ? body.id : query.id;
      if (typeof rawId !== 'string' || !rawId.trim()) {
        send(res, 400, { error: 'المعرّف مطلوب' });
        return;
      }
      const list = await removeVip(rawId);
      send(res, 200, { ok: true, list });
      return;
    }

    send(res, 405, { error: 'طريقة غير مسموحة' });
  } catch (e) {
    send(res, 500, { error: 'server_error', message: String((e && e.message) || e) });
  }
};

// يبحث عن حساب يحمل هذا الإيميل ويعيد اسمه. مسحٌ كامل للحسابات — مقبول
// لأنّه يجري في نقرة المالك وحدها (نفس ما تفعله admin-stats.js)، ومسقوف
// حتى لا يتحوّل إلى طلب لا ينتهي إن كبر عدد الحسابات.
const SCAN_CAP = 400;
async function resolveToUsername(id) {
  if (!id || id.indexOf('@') === -1) return id;
  try {
    const { kvList } = require('./kv.js');
    const { getUserOnce } = require('./auth.js');
    const keys = (await kvList('db/users/')).slice(0, SCAN_CAP);
    const names = keys.map((k) => decodeURIComponent(String(k).replace(/^db\/users\//, '').replace(/\.json$/, ''))).filter(Boolean);
    const recs = await Promise.all(names.map(async (n) => {
      const rec = await getUserOnce(n).catch(() => null);
      return { name: n, email: rec && rec.email ? String(rec.email).trim().toLowerCase() : null };
    }));
    const hit = recs.find((r) => r.email === id);
    return hit ? normalizeId(hit.name) : id;
  } catch (e) {
    return id; // تعذّر البحث: نخزّن الإيميل كما هو بدل أن تفشل الإضافة.
  }
}
