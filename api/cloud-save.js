// الحفظ في الحساب («حسابي») لعالم المكعبات: العالم المحفوظ يُرفع إلى الموقع فيُكمَل من متصفّح أو جهاز ثانٍ.
// الحساب رمز واحد يُعطى للّاعب مرّة (مثل K7QM-2XPA-9DTR): هو اسمه وسرّه معًا، فلا بريد ولا كلمة سرّ ولا بيانات شخصيّة.
// لا يُخزَّن الرمز نفسه بل بصمته (SHA-256)، فمن يقرأ المخزن لا يقدر يدخل حساب أحد.
//
// POST /api/cloud-save   { op, ... }
//   new   {}                              -> { code }                         حساب جديد
//   info  { code }                        -> { worlds: { kawkab: at, ... } }  وقت آخر حفظ لكلّ عالم
//   put   { code, world, at, data }       -> { ok: true, at }                 data: الحفظ مضغوطًا نصًّا (يصنعه العميل)
//   get   { code, world }                 -> { at, data } | { none: true }
//
// الحدود: الحفظ الواحد ≤ MAX_DATA حرف، ويبقى سنة من آخر استعمال للحساب. الإنشاء والرفع محدودان لكلّ عنوان في الدقيقة.
const crypto = require('crypto');

const WORLDS = ['kawkab', 'waha', 'dhalam', 'barari', 'dino'];
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';           // بلا 0/O و1/I/L: يُقرأ ويُكتب بلا لبس
const MAX_DATA = 700000, KEEP = 365 * 86400, PER_MINUTE = { new: 3, put: 20, get: 30, info: 30 };
const normCode = (v) => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const isCode = (c) => c.length === 12 && [...c].every((ch) => ALPHA.includes(ch));
const show = (c) => c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8);
const tag = (c) => crypto.createHash('sha256').update('bw-cloud|' + c).digest('hex').slice(0, 32);
const acctKey = (t) => 'save/acct/' + t;
const dataKey = (t, w) => 'save/w/' + t + '/' + w;

async function overRate(K, ip, what) {
  if (!ip) return false;
  try {
    const key = 'rl:cloud-save:' + what + ':' + ip + ':' + Math.floor(Date.now() / 60000);
    const n = Number(await K.kvIncr(key));
    if (n === 1) await K.kvExpire(key, 120);
    return n > PER_MINUTE[what];
  } catch (e) { return false; /* عطل العدّاد لا يمنع الحفظ — الحدّ حماية لا بوّابة */ }
}

/** One operation. K is the KV module (./_kv.js; the tests pass an in-memory one). Returns { status, json }. */
async function act(body, ip, K) {
  const b = body && typeof body === 'object' ? body : {};
  const op = String(b.op || '');
  const bad = (error, status = 400) => ({ status, json: { error } });
  if (!PER_MINUTE[op]) return bad('op');
  if (await overRate(K, ip, op)) return bad('slow-down', 429);

  if (op === 'new') {
    for (let i = 0; i < 6; i++) {
      let c = '';
      for (let j = 0; j < 12; j++) c += ALPHA[crypto.randomInt(ALPHA.length)];
      if (await K.kvSetIfAbsent(acctKey(tag(c)), JSON.stringify({ t: Date.now() }), KEEP)) return { status: 200, json: { code: show(c) } };
    }
    return bad('full', 503);
  }

  const c = normCode(b.code);
  if (!isCode(c)) return bad('code');
  const t = tag(c);
  if (!(await K.kvGetRaw(acctKey(t)))) return bad('no-account', 404);

  if (op === 'info') {
    const out = await K.kvPipeline(WORLDS.map((w) => ['GET', dataKey(t, w) + '/at']));
    const worlds = {};
    WORLDS.forEach((w, i) => { const at = Number(out[i]); if (at > 0) worlds[w] = at; });
    return { status: 200, json: { worlds } };
  }
  if (!WORLDS.includes(b.world)) return bad('world');
  if (op === 'get') {
    const [data, at] = await K.kvPipeline([['GET', dataKey(t, b.world)], ['GET', dataKey(t, b.world) + '/at'], ['EXPIRE', acctKey(t), String(KEEP)]]);
    return { status: 200, json: data ? { at: Number(at) || 0, data } : { none: true } };
  }
  // put
  const data = typeof b.data === 'string' ? b.data : '';
  if (!/^[gj]:/.test(data) || data.length < 10) return bad('data');
  if (data.length > MAX_DATA) return bad('too-big', 413);
  const at = Math.min(Date.now() + 60000, Math.max(0, Math.trunc(Number(b.at) || Date.now())));
  await K.kvPipeline([
    ['SET', dataKey(t, b.world), data, 'EX', String(KEEP)],
    ['SET', dataKey(t, b.world) + '/at', String(at), 'EX', String(KEEP)],
    ['EXPIRE', acctKey(t), String(KEEP)],
  ]);
  return { status: 200, json: { ok: true, at } };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body = req.body;
  if (typeof body === 'string') { if (body.length > MAX_DATA + 2000) { res.status(413).json({ error: 'too-big' }); return; } try { body = JSON.parse(body); } catch (e) { body = null; } }
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const out = await act(body, ip, require('./_kv.js'));
    res.status(out.status).json(out.json);
  } catch (e) {
    // المخزن غير متاح: الحفظ في المتصفّح يبقى كما هو، والعميل يقول للّاعب إنّ الحساب ما يرد الحين
    res.status(503).json({ error: 'store' });
  }
};
module.exports.act = act;
module.exports.MAX_DATA = MAX_DATA;
