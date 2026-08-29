// Vercel Serverless Function: OWNER-ONLY user management actions.
// Requires a valid session token belonging to OWNER_USERNAME. Regular users
// get 403 no matter what they send. Actions: ban, unban, delete, message.
const crypto = require('crypto');
const { getUser, putUser, userPath } = require('./auth.js');
const { kvDel, kvList } = require('./kv.js');

const AUTH_SECRET = require('./_secrets.js').AUTH_SECRET;
// v-owner-core: قائمة المالك الموحّدة — ‹omran› مدمج دائمًا والبيئة تضيف لا تستبدل.
const { isOwnerName } = require('./_owner.js');

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

// getUser/putUser now come from auth.js, which stores/reads user records
// encrypted at rest (AES-256-GCM) instead of as raw JSON.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!process.env.UPSTASH_REDIS_REST_URL) { res.status(500).json({ error: 'Server is missing UPSTASH_REDIS_REST_URL' }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') body = JSON.parse(body || '{}');
    const { token, action, targetUsername, text } = body;

    const requester = verifyToken(token);
    if (!isOwnerName(requester)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    // v-purge-checks: تنظيف حسابات الفحص الآلية (zzcheck…) دفعة واحدة — كانت
    // تُحذف يدويًّا واحدًا واحدًا وتراكم منها ٧٠+. للمالك فقط، والبادئة
    // مثبّتة في الكود فلا تطال أي حساب حقيقي، وتُحذف نقاطها معها.
    if (action === 'purge-checks') {
      const PREFIX = 'db/users/zzcheck';
      const keys = await kvList(PREFIX);
      let removed = 0;
      for (const k of keys) {
        const uname = decodeURIComponent(String(k).slice('db/users/'.length).replace(/\.json$/, ''));
        if (!/^zzcheck[0-9a-f]{4,}$/i.test(uname)) continue; // صيغة المولّدات حصرًا
        await kvDel(k);
        await kvDel('points:' + encodeURIComponent(uname));
        removed++;
      }
      res.status(200).json({ ok: true, removed, note: 'حُذفت حسابات الفحص zzcheck ونقاطها نهائيًّا' });
      return;
    }

    if (!targetUsername || typeof targetUsername !== 'string') {
      res.status(400).json({ error: 'missing targetUsername' });
      return;
    }
    const key = targetUsername.trim().toLowerCase();
    if (isOwnerName(key)) {
      res.status(400).json({ error: 'cannot act on the owner account' });
      return;
    }

    // سجلّ لا يفكّه أيّ مفتاح (كُتب بسرّ ضاع) يرمي الآن بدل أن يتنكّر في هيئة
    // «غير موجود». هنا بالذات يُفتح المخرج الوحيد منه: المالك يحذفه حذفًا
    // مباشرًا من المخزن — بلا قراءة — فيتحرّر الاسم ويُنشأ من جديد. حدث فعلًا:
    // حساب المالك القديم وحساب جوجل المرتبط به بقيا مقفلين بلا أيّ سبيل،
    // لأنّ delete القديم كان يقرأ السجلّ أوّلًا ليكتب فيه deleted:true.
    let user = null, sealed = false;
    try { user = await getUser(key); }
    catch (e) {
      if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') sealed = true;
      else throw e;
    }
    if (sealed) {
      if (action === 'delete') {
        await kvDel(userPath(key));
        res.status(200).json({ ok: true, purged: true, note: 'سجلّ مقفل بسرّ قديم — حُذف نهائيًّا وتحرّر الاسم' });
        return;
      }
      res.status(409).json({ error: 'sealed_record', message: 'السجلّ مقفل بسرّ قديم ولا يُقرأ — لا يصحّ عليه إلا الحذف (أو استرجاعه بـ AUTH_SECRET_PREVIOUS)' });
      return;
    }
    if (!user) {
      res.status(404).json({ error: 'user not found' });
      return;
    }

    if (action === 'ban') {
      user.banned = true;
      await putUser(key, user);
      res.status(200).json({ ok: true, banned: true });
      return;
    }
    if (action === 'unban') {
      user.banned = false;
      await putUser(key, user);
      res.status(200).json({ ok: true, banned: false });
      return;
    }
    if (action === 'delete') {
      user.deleted = true;
      user.pendingMessage = null;
      await putUser(key, user);
      res.status(200).json({ ok: true, deleted: true });
      return;
    }
    if (action === 'message') {
      if (!text || !String(text).trim()) {
        res.status(400).json({ error: 'empty message' });
        return;
      }
      user.pendingMessage = { text: String(text).trim(), at: Date.now() };
      await putUser(key, user);
      res.status(200).json({ ok: true, sent: true });
      return;
    }

    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: String(e && e.message || e) });
  }
};
