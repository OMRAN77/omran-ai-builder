// ملاحظات اللاعبين وبلاغاتهم عن الأخطاء (من قائمة Esc في اللعبة).
//
// POST /api/feedback   { rating: 1..5, chips: ['fbChipBug']?, note, lang }   -> { ok: true }
// GET  /api/feedback?key=<BLOCKWORLD_ADMIN_KEY>                              -> { notes: [...] }   لصاحب اللعبة وحده
//
// تُحفظ آخر ٢٠٠ ملاحظة في قائمة Redis واحدة. لا اسم ولا حساب ولا عنوان شبكة يُخزَّن مع الملاحظة.
// القراءة تحتاج المفتاح الذي يضعه المالك في متغيّر البيئة BLOCKWORLD_ADMIN_KEY؛ بلا المتغيّر لا قراءة أبدًا.
const crypto = require('crypto');

const LIST = 'play/feedback', MAX_NOTES = 200, PER_MINUTE = 6;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, n);

/** One request. K is the KV module (./_kv.js; the tests pass an in-memory one). Returns { status, json }. */
async function act(method, body, query, ip, K, adminKey) {
  if (method === 'GET') {
    const given = Buffer.from(String((query && query.key) || '')), want = Buffer.from(String(adminKey || ''));
    if (!want.length || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return { status: 401, json: { error: 'unauthorized' } };
    const out = await K.kvPipeline([['LRANGE', LIST, '0', String(MAX_NOTES - 1)]]);
    const notes = [];
    for (const raw of Array.isArray(out[0]) ? out[0] : []) { try { notes.push(JSON.parse(raw)); } catch (e) { /* سطر تالف يُتجاوز */ } }
    return { status: 200, json: { notes } };
  }
  if (method !== 'POST') return { status: 405, json: { error: 'method' } };
  const b = body && typeof body === 'object' ? body : {};
  const rating = Math.max(0, Math.min(5, parseInt(b.rating, 10) || 0)), note = clean(b.note, 1000).trim();
  if (!rating) return { status: 400, json: { error: 'no rating' } };
  if (note.length < 3) return { status: 400, json: { error: 'no note' } };
  if (ip) {      // a few a minute from one address is plenty
    const key = 'rl:feedback:' + ip + ':' + Math.floor(Date.now() / 60000), n = Number(await K.kvIncr(key));
    if (n === 1) await K.kvExpire(key, 120);
    if (n > PER_MINUTE) return { status: 429, json: { error: 'slow-down' } };
  }
  const bug = Array.isArray(b.chips) && b.chips.includes('fbChipBug');
  const row = { rating, bug, note, lang: clean(b.lang, 8).replace(/[^\w-]/g, ''), ts: new Date().toISOString() };
  await K.kvPipeline([['LPUSH', LIST, JSON.stringify(row)], ['LTRIM', LIST, '0', String(MAX_NOTES - 1)]]);
  return { status: 200, json: { ok: true } };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  let body = req.body;
  if (typeof body === 'string') { if (body.length > 8000) { res.status(413).json({ error: 'too-big' }); return; } try { body = JSON.parse(body); } catch (e) { body = null; } }
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const out = await act(req.method, body, req.query || {}, ip, require('./_kv.js'), process.env.BLOCKWORLD_ADMIN_KEY);
    res.status(out.status).json(out.json);
  } catch (e) {
    // التخزين غير متاح: اللعبة تقول للّاعب إنّ الإرسال لم ينجح
    res.status(503).json({ error: 'store' });
  }
};
module.exports.act = act;
