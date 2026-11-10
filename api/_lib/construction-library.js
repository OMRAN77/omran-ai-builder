// Vercel Serverless Function: browse previously-generated construction
// designs saved to the shared library (see _constructionLibrary.js), so
// users can reuse a similar existing design instead of generating a new one.
const { listDesigns } = require('./_constructionLibrary');
const { sessionUser } = require('./_session.js');
const { kvIncr, kvExpire } = require('./kv.js');

/* v-audit-stud2 (srv-studios-2-2): كان بلا جلسة ولا حدّ — أيّ زائر يكرّر الطلب فيستنزف طلبات KV ونقله المشتركين. الآن جلسة صالحة
   وسقف يوميّ لكلّ حساب (INCR على مفتاح مؤرَّخ بانتهاء). عطب العدّاد = سماح (حماية من الإساءة لا بوّابة دفع). */
const LIB_VIEWS_DAILY = 40;
async function underDailyCap(username) {
  const key = 'db/construction-library-views/' + encodeURIComponent(String(username).toLowerCase()) + '/' + new Date().toISOString().slice(0, 10);
  try {
    const n = Number(await kvIncr(key));
    if (n === 1) await kvExpire(key, 172800);
    return n <= LIB_VIEWS_DAILY;
  } catch (e) {
    console.warn('[construction-library] view meter unavailable: ' + (e && e.message));
    return true;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { buildingType, floors, area, lang } = body;
    const username = sessionUser(body.token);
    if (!username) { res.status(401).json({ error: 'auth_required' }); return; }
    if (!(await underDailyCap(username))) { res.status(429).json({ error: 'daily_limit_reached' }); return; }
    const items = await listDesigns({ buildingType, floors, area, lang, limit: 12 }); // v-cx-lib: مخطّطات لغة الطالب وحدها
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
module.exports.LIB_VIEWS_DAILY = LIB_VIEWS_DAILY;
