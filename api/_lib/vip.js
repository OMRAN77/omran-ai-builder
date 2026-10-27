// نقطة نهاية «صلاحيات VIP» — للمالك وحده.
//
// كل طريقة (GET · POST · DELETE) تمرّ من isOwner(req) في _owner.js: نفس
// البوّابة المُختبَرة في tests/owner-gate.test.cjs (رمز جلسة موقَّع أو
// MONITOR_KEY، ومقارنة ثابتة الزمن). إخفاء القسم في الواجهة ليس حراسة —
// الحراسة هنا وحدها.
//
//   GET    /api/vip?token=…            → { list:[…] }
//   GET    /api/vip?token=…&audit=1    → { list, audit:{rows,scanned} } — جلسة المالك وحدها (v-vip-verified)
//   POST   /api/vip   {token,id}       → { ok:true, list:[…] }
//   DELETE /api/vip?token=…&id=…       → { ok:true, list:[…] }
//
// الحذف يقبل id من سلسلة الاستعلام أيضًا: بعض العملاء (وfetch نفسه في
// متصفّحات قديمة) لا يرسل جسمًا مع DELETE، فكان الطلب يصل بلا معرّف.
const { isOwner, isOwnerName } = require('./_owner.js');
const { sessionUser } = require('./_session.js');
const { getVipList, addVip, removeVip, normalizeId, promotedKey } = require('./_vip.js');

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
      // v-vip-verified: الجرد فيه إيميلات المستخدمين — لجلسة المالك وحدها، لا MONITOR_KEY: المفتاح تحمله ورك فلوهات في مستودع
      // علنيّ، وسجلّاتها علنيّة.
      if (String(query.audit || '') === '1') {
        if (!isOwnerName(sessionUser(query.token || body.token))) { send(res, 403, { error: 'غير مصرح' }); return; }
        send(res, 200, { ok: true, list, audit: await auditVip(list) });
        return;
      }
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
      // v-vip-verified: لا يتحوّل إلّا إلى حساب أثبت البريد؛ وإلّا يبقى خامًا (pending) حتّى يثبته صاحبه (_vip.promoteVerifiedEmail).
      const raw = normalizeId(rawId);
      // إضافة الإيميل من جديد تعيد فرصة الترقية مرّة (_vip.promoteVerifiedEmail يرقّي أوّل من يثبته فقط)
      if (raw.indexOf('@') !== -1) { try { await require('./kv.js').kvDel(promotedKey(raw)); } catch (e) { /* عطب KV: تبقى العلامة، والإضافة تمضي */ } }
      const id = await resolveToUsername(raw);
      const list = await addVip(id);
      send(res, 200, { ok: true, id, list, pending: id === raw && raw.indexOf('@') !== -1 });
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

// يبحث عن حساب يحمل هذا الإيميل ويعيد اسمه.
// v-vip-verified (أمر المالك ١٨ أكتوبر: «VIP بالإيميل ما ينعطى إلا لإيميل متحقّق منه»): كان يأخذ أوّل سجلّ بريده المحفوظ يساوي
// الإيميل — والبريد يُكتب بلا تحقّق (setEmail القديم، التسجيل من الـAPI)، والحساب المحذوف يُحسب، والمسح مسقوف بـ٤٠٠ مفتاح من
// SCAN غير مرتَّب فقد يفوته صاحبه ويلتقط غيره. الآن: حساب Google بمفتاحه g_<البريد> (هويّة تثبتها Google، أو حساب دمجه المالك
// فيه بـdb/alias)، وإلّا حساب ختم البريد (auth.emailVerifiedFor) — والمسح كامل كما admin-stats (نقرة المالك وحدها).
async function resolveToUsername(id) {
  if (!id || id.indexOf('@') === -1) return id;
  try {
    return (await verifiedHolder(id)) || id;
  } catch (e) {
    return id; // تعذّر البحث: نخزّن الإيميل كما هو بدل أن تفشل الإضافة — والخام لا يعطي أحدًا شيئًا.
  }
}

async function verifiedHolder(email, users) {
  const { getUserOnce, emailVerifiedFor } = require('./auth.js');
  const { kvGetJSON } = require('./kv.js');
  const gKey = 'g_' + email;
  const alias = await kvGetJSON('db/alias/' + gKey).catch(() => null);
  const primary = alias && alias.primary ? normalizeId(String(alias.primary)) : '';
  if (primary) {
    const p = await getUserOnce(primary).catch(() => null);
    if (p && !p.deleted) return primary;
  }
  const g = await getUserOnce(gKey).catch(() => null);
  if (g && !g.deleted && g.googleAuth === true) return gKey;
  const hit = (users || (await scanUsers())).find((r) => r.rec && r.rec.email === email && emailVerifiedFor(r.name, r.rec));
  return hit ? hit.name : null;
}

async function scanUsers() {
  const { kvList } = require('./kv.js');
  const { getUserOnce } = require('./auth.js');
  const keys = await kvList('db/users/');
  const names = keys.map((k) => decodeURIComponent(String(k).replace(/^db\/users\//, '').replace(/\.json$/, ''))).filter(Boolean);
  const out = [];
  for (let i = 0; i < names.length; i += 25) {
    out.push(...(await Promise.all(names.slice(i, i + 25).map(async (n) => ({ name: normalizeId(n), rec: await getUserOnce(n).catch(() => null) })))));
  }
  return out;
}

// v-vip-verified: «أرسل لي قائمة الحسابات اللي عندها الحين إيميل من قائمة VIP وهي غير متحقّق منها». ثلاثة أنواع:
//   email       يحمل إيميلًا في القائمة (خامًا) بلا تأكيد — لا يأخذ VIP بعد اليوم حتّى يؤكّده.
//   legacy-name اسمه نفسه إيميل في القائمة (حساب قبل v-name-no-at) — VIP بالاسم كما كان، وإيميله غير مؤكَّد.
//   vip-name    في القائمة باسمه وإيميله غير مؤكَّد — ربّما أُضيف بإيميله قبل اليوم (كان يتحوّل بلا تحقّق)؛ المالك يقرّر.
// لا حذف ولا تعديل لأيّ حساب أو مدخل: جرد يُعرض في لوحة المالك فقط.
async function auditVip(list) {
  const { emailVerifiedFor } = require('./auth.js');
  const users = await scanUsers();
  const byName = new Map(users.map((r) => [r.name, r.rec]));
  const live = (rec) => rec && !rec.deleted;
  const rows = [];
  for (const entry of list) {
    if (entry.indexOf('@') !== -1 && entry.indexOf('g_') !== 0) {
      for (const r of users) {
        if (live(r.rec) && r.rec.email === entry && !emailVerifiedFor(r.name, r.rec)) rows.push({ username: r.name, email: entry, kind: 'email' });
      }
      const legacy = byName.get(entry);
      if (live(legacy) && !(legacy.email === entry && emailVerifiedFor(entry, legacy))) rows.push({ username: entry, email: legacy.email || null, kind: 'legacy-name' });
    } else {
      const rec = byName.get(entry);
      if (live(rec) && rec.email && !emailVerifiedFor(entry, rec)) rows.push({ username: entry, email: rec.email, kind: 'vip-name' });
    }
  }
  return { rows, scanned: users.length };
}
