'use strict';
/* v-talk-room (المالك ٢٣ نوفمبر: «اريده اتصال نفس الي في اللعبه» ← «نفس الطريقة الي في اللعبه مافيها اي تكلفه»): «غرفة الربع».
   ناس يكلّمون بعض (صوت وكتابة ووجوه) من صفحة ‎/room‎. المتصفّحات تتّصل ببعض مباشرة (WebRTC)، وهذا الملفّ وسيط التعارف فقط —
   نقل حرفيّ لطريقة «عالم المكعبات» (api/play-room.js هناك): صاحب الغرفة يفتحها فيأخذ كودًا من أربعة أرقام، والضيف يرسل «عرضه»
   بالكود، وصاحب الغرفة يقبله بـ«جواب» أو يرفضه. لا صوت ولا كتابة تمرّ من هنا، فلا كلفة غير أوامر تخزين قليلة.

   POST /api/system?action=room   { op, ... }
     open    { token, name? }                -> { code, key }                 فتح غرفة يحتاج حسابًا (key سرّ صاحب الغرفة)
     peek    { code }                        -> { name } | 404 no-room        اسم صاحب الغرفة لصفحة الضيف
     join    { code, name, offer }           -> { id } | no-room | busy       الضيف بلا حساب: الكود هو الدعوة، وصاحب الغرفة يقرّر
     answer  { code, id }                    -> { wait } | { answer } | { denied }
     pending { code, key, keep? }            -> { joins: [{ id, name, offer }] }   (تُسحب مرّة واحدة)
     admit   { code, key, id, answer }       -> { ok }
     deny    { code, key, id }               -> { ok }
     close   { code, key }                   -> { ok }

   التخزين: مفاتيح قصيرة العمر (ربع ساعة للغرفة تتجدّد مع الاستقبال، ثلاث دقائق للجواب). العرض والجواب يحملان عناوين شبكة
   الطرفين (هكذا يعمل WebRTC)، فيُمحيان بانتهاء العمر ولا يُطبعان أبدًا. الأوامر قليلة عمدًا (حدّ الباقة المجانيّة). */
const crypto = require('crypto');

const ROOM_TTL = 900, OUT_TTL = 180, MAX_SDP = 16000, MAX_PENDING = 8, PER_MINUTE = 12;
const roomKey = (code) => 'talk/room/' + code;
const inKey = (code) => 'talk/room/' + code + '/in';
const outKey = (code, id) => 'talk/room/' + code + '/out/' + id;

const isCode = (v) => typeof v === 'string' && /^\d{4}$/.test(v);
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{12}$/.test(v);
const isSdp = (v) => typeof v === 'string' && v.length > 20 && v.length <= MAX_SDP && v.startsWith('v=0');
const cleanName = (v, d = 'ضيف') => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>&"'`]/g, '').trim().slice(0, 24) || d;
function sameKey(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

async function overRate(K, ip, what) {
  if (!ip) return false;
  try {
    const key = 'rl:talk-room:' + what + ':' + ip + ':' + Math.floor(Date.now() / 60000);
    const n = Number(await K.kvIncr(key));
    if (n === 1) await K.kvExpire(key, 120);
    return n > PER_MINUTE;
  } catch (e) { return false; /* عطل العدّاد لا يمنع الكلام — الحدّ حماية لا بوّابة */ }
}

async function readRoom(K, code) {
  const raw = await K.kvGetRaw(roomKey(code));
  if (!raw) return null;
  try { const r = JSON.parse(raw); return r && typeof r === 'object' ? r : null; } catch (e) { return null; }
}

/** One operation. K: the KV module; who: the signed-in user or null. Returns { status, json }. */
async function act(body, ip, K, who) {
  const b = body && typeof body === 'object' ? body : {};
  const op = String(b.op || '');
  const bad = (error, status = 400) => ({ status, json: { error } });

  if (op === 'open') {
    if (!who) return bad('login', 401);
    if (await overRate(K, ip, 'open')) return bad('slow-down', 429);
    const key = crypto.randomBytes(12).toString('hex');
    for (let i = 0; i < 8; i++) {
      const code = String(1000 + crypto.randomInt(9000));
      if (await K.kvSetIfAbsent(roomKey(code), JSON.stringify({ k: key, n: cleanName(b.name, cleanName(who, 'صاحب الغرفة')), t: Date.now() }), ROOM_TTL)) return { status: 200, json: { code, key } };
    }
    return bad('full', 503);
  }

  if (!isCode(b.code)) return bad('code');
  const code = b.code;

  if (op === 'peek') {
    if (await overRate(K, ip, 'peek')) return bad('slow-down', 429);
    const room = await readRoom(K, code);
    return room ? { status: 200, json: { name: cleanName(room.n, 'صاحب الغرفة') } } : bad('no-room', 404);
  }
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
    const id = crypto.randomBytes(6).toString('hex');
    const out = await K.kvPipeline([['RPUSH', inKey(code), JSON.stringify({ id, name: cleanName(b.name), offer: b.offer })], ['EXPIRE', inKey(code), String(ROOM_TTL)]]);
    if (Number(out && out[0]) > MAX_PENDING) { await K.kvPipeline([['RPOP', inKey(code)]]); return bad('busy', 429); }
    return { status: 200, json: { id } };
  }

  // the host's, with the room's key
  const room = await readRoom(K, code);
  if (!room) return bad('no-room', 404);
  if (!sameKey(room.k, b.key)) return bad('key', 403);
  if (op === 'pending') {
    const cmds = [['LPOP', inKey(code), String(MAX_PENDING)]];
    if (b.keep) cmds.push(['EXPIRE', roomKey(code), String(ROOM_TTL)]);
    const out = await K.kvPipeline(cmds);
    const joins = [];
    for (const raw of Array.isArray(out && out[0]) ? out[0] : []) { try { const j = JSON.parse(raw); if (j && isId(j.id) && isSdp(j.offer)) joins.push({ id: j.id, name: cleanName(j.name), offer: j.offer }); } catch (e) { require('./_swallow.js').swallow({ message: 'bad pending line' }, 'talk-room:pending'); /* سطر تالف يُتجاوز؛ رسالته لا تُطبع: قد تقتبس العرض وفيه عناوين شبكة الضيف */ } }
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
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body = req.body;
  if (typeof body === 'string') { if (body.length > 40000) { res.status(413).json({ error: 'too-big' }); return; } try { body = JSON.parse(body); } catch (e) { body = null; } }
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { sessionUser } = require('./_session.js');
    const who = body && body.op === 'open' ? sessionUser(body.token) : null;
    const out = await act(body, ip, require('./kv.js'), who);
    res.status(out.status).json(out.json);
  } catch (e) {
    res.status(503).json({ error: 'store' }); // المخزن غير متاح — لا تُطبع رسالة الخطأ: قد تقتبس العرض وفيه عناوين الشبكة
  }
};
module.exports.act = act;
module.exports.MAX_PENDING = MAX_PENDING;
