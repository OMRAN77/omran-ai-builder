// v-blockworld-net: غرف اللعب الجماعيّ في «عالم المكعبات» (/blockworld/).
// اللاعبون يتّصلون ببعضهم مباشرة (WebRTC)؛ هذا الملفّ وسيط التعارف فقط: صاحب الغرفة يفتحها فيأخذ كودًا من
// أربعة أرقام، والضيف يرسل «عرضه» بالكود، وصاحب الغرفة يقبله بـ«جواب» أو يرفضه. لا شيء من اللعب يمرّ من هنا.
//
// POST /api/system?action=play-room   { op, ... }
//   open    { world }                       -> { code, key }            key سرّ صاحب الغرفة
//   pending { code, key, keep? }            -> { joins: [{ id, name, offer }] }   (تُسحب مرّة واحدة)
//   join    { code, world, name, offer }    -> { id } | { error: 'no-room' | 'world' (+world) | 'busy' }
//   answer  { code, id }                    -> { wait: true } | { answer } | { denied: true }
//   admit   { code, key, id, answer }       -> { ok: true }
//   deny    { code, key, id }               -> { ok: true }
//   close   { code, key }                   -> { ok: true }
//
// التخزين: مفاتيح قصيرة العمر في Redis (ربع ساعة للغرفة، ثلاث دقائق للجواب) — لا حساب ولا بيانات مستخدم.
// العرض والجواب يحملان عناوين شبكة اللاعبين (هكذا يعمل WebRTC)، ولذلك يُمحيان بانتهاء العمر ولا يُسجَّلان.
// الأوامر قليلة عمدًا (حدّ الباقة المجانيّة): سحب الطلبات أمر واحد، وسؤال الضيف عن الجواب أمر واحد.
const crypto = require('crypto');

const ROOM_TTL = 900, OUT_TTL = 180, MAX_SDP = 16000, MAX_PENDING = 8, PER_MINUTE = 12;
const WORLDS = new Set(['kawkab', 'waha', 'dhalam']);
const roomKey = (code) => 'play/room/' + code;
const inKey = (code) => 'play/room/' + code + '/in';
const outKey = (code, id) => 'play/room/' + code + '/out/' + id;

const isCode = (v) => typeof v === 'string' && /^\d{4}$/.test(v);
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{12}$/.test(v);
const isSdp = (v) => typeof v === 'string' && v.length > 20 && v.length <= MAX_SDP && v.startsWith('v=0');
const cleanName = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, 16) || 'لاعب';
function sameKey(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** Fixed-window limit per address for the two calls that create something (a room, a join request). */
async function overRate(K, ip, what) {
  if (!ip) return false;
  try {
    const key = 'rl:play-room:' + what + ':' + ip + ':' + Math.floor(Date.now() / 60000);
    const n = Number(await K.kvIncr(key));
    if (n === 1) await K.kvExpire(key, 120);
    return n > PER_MINUTE;
  } catch (e) { return false; /* عطل العدّاد لا يمنع اللعب — الحدّ حماية لا بوّابة */ }
}

async function readRoom(K, code) {
  const raw = await K.kvGetRaw(roomKey(code));
  if (!raw) return null;
  try { const r = JSON.parse(raw); return r && typeof r === 'object' ? r : null; } catch (e) { return null; }
}

/**
 * One operation. K is the KV module (./kv.js; the tests pass an in-memory one).
 * Returns { status, json }.
 */
async function act(body, ip, K) {
  const b = body && typeof body === 'object' ? body : {};
  const op = String(b.op || '');
  const bad = (error, status = 400, extra) => ({ status, json: { error, ...(extra || {}) } });

  if (op === 'open') {
    if (!WORLDS.has(b.world)) return bad('world');
    if (await overRate(K, ip, 'open')) return bad('slow-down', 429);
    const key = crypto.randomBytes(12).toString('hex');
    for (let i = 0; i < 8; i++) {
      const code = String(1000 + crypto.randomInt(9000));
      if (await K.kvSetIfAbsent(roomKey(code), JSON.stringify({ k: key, w: b.world, t: Date.now() }), ROOM_TTL)) return { status: 200, json: { code, key } };
    }
    return bad('full', 503);
  }

  if (!isCode(b.code)) return bad('code');
  const code = b.code;

  if (op === 'answer') {
    if (!isId(b.id)) return bad('id');
    const raw = await K.kvGetRaw(outKey(code, b.id));
    if (!raw) return { status: 200, json: { wait: true } };
    try { const r = JSON.parse(raw); return { status: 200, json: r.denied ? { denied: true } : { answer: String(r.answer || '') } }; } catch (e) { return { status: 200, json: { wait: true } }; }
  }

  if (op === 'join') {
    if (!isSdp(b.offer)) return bad('offer');
    if (await overRate(K, ip, 'join')) return bad('slow-down', 429);
    const room = await readRoom(K, code);
    if (!room) return bad('no-room', 404);
    if (room.w !== b.world) return bad('world', 409, { world: room.w });
    const id = crypto.randomBytes(6).toString('hex');
    const out = await K.kvPipeline([['RPUSH', inKey(code), JSON.stringify({ id, name: cleanName(b.name), offer: b.offer })], ['EXPIRE', inKey(code), String(ROOM_TTL)]]);
    if (Number(out && out[0]) > MAX_PENDING) { await K.kvPipeline([['RPOP', inKey(code)]]); return bad('busy', 429); }
    return { status: 200, json: { id } };
  }

  // everything below is the host's, and needs the room's key
  const room = await readRoom(K, code);
  if (!room) return bad('no-room', 404);
  if (!sameKey(room.k, b.key)) return bad('key', 403);

  if (op === 'pending') {
    const cmds = [['LPOP', inKey(code), String(MAX_PENDING)]];
    if (b.keep) cmds.push(['EXPIRE', roomKey(code), String(ROOM_TTL)]);
    const out = await K.kvPipeline(cmds);
    const joins = [];
    for (const raw of Array.isArray(out && out[0]) ? out[0] : []) { try { const j = JSON.parse(raw); if (j && isId(j.id) && isSdp(j.offer)) joins.push({ id: j.id, name: cleanName(j.name), offer: j.offer }); } catch (e) { require('./_swallow.js').swallow('bad join record', '_lib/play-room:pending'); /* سطر تالف يُتجاوز؛ يُسجَّل بنصّ ثابت لا برسالة الخطأ (قد تقتبس من السطر، وفيه عناوين اللاعب) */ } }
    return { status: 200, json: { joins } };
  }
  if (op === 'admit') {
    if (!isId(b.id)) return bad('id');
    if (!isSdp(b.answer)) return bad('answer');
    await K.kvSetRaw(outKey(code, b.id), JSON.stringify({ answer: b.answer }), OUT_TTL);
    return { status: 200, json: { ok: true } };
  }
  if (op === 'deny') {
    if (!isId(b.id)) return bad('id');
    await K.kvSetRaw(outKey(code, b.id), JSON.stringify({ denied: true }), OUT_TTL);
    return { status: 200, json: { ok: true } };
  }
  if (op === 'close') {
    await K.kvPipeline([['DEL', roomKey(code)], ['DEL', inKey(code)]]);
    return { status: 200, json: { ok: true } };
  }
  return bad('op');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body = req.body;
  if (typeof body === 'string') { if (body.length > 40000) { res.status(413).json({ error: 'too-big' }); return; } try { body = JSON.parse(body); } catch (e) { body = null; } }
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const out = await act(body, ip, require('./kv.js'));
    res.status(out.status).json(out.json);
  } catch (e) {
    // التخزين غير متاح: اللعب الفرديّ لا يتأثّر، والعميل يقول للّاعب إنّ الغرف متوقّفة الآن
    res.status(503).json({ error: 'store' });
  }
};
module.exports.act = act;
module.exports.MAX_PENDING = MAX_PENDING;
