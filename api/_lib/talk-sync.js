'use strict';
/* v-talk-contacts-sync (موافقة المالك: «الأرقام تخرج من الجهاز بصمات SHA-256 للمطابقة فقط، والخادم لا يحفظها؛ الأسماء لا تخرج أبدًا»):
   مزامنة جهات اتّصال الهاتف في «غرفة الربع». الخادم لا يرى رقمًا ولا اسمًا:
     • التطبيق (Chrome TWA) يقرأ جهات الهاتف، يشفّرها على الجهاز بمفتاح لا يصل الخادم (يبقى في جزء الرابط #)، ويرفعها هنا
       مرّة بتذكرة قصيرة العمر؛ الصفحة تسحبها مرّة فتُمحى. ما يُحفظ هنا نصّ مشفّر لا يُقرأ، ثلاث دقائق على الأكثر.
     • الصفحة تطبّع الأرقام وتبصمها ثمّ تسأل «من منهم على التطبيق؟» (match): الجواب بصمات المطابقين ورموز اتّصال مشفّرة —
       لا اسم حساب ولا شيء عن غير المطابقين.
     • الاتّصال بالرمز (ring بالحقل callee في talk-contacts.js): الرمز مربوط بالمتّصل، وصاحب الرقم يُعاد فحصه عند كلّ مكالمة.
   الفهرس db/phone-hash/<بصمة> = { username } يُكتب مع db/phone-index في phone-link.js ويُمحى مع حذف الحساب.
   لا طباعة لبصمة ولا رقم ولا نصّ مشفّر: لا console، والمبتلع برسالة ثابتة فقط.

   عبر act في talk-room.js (POST /api/system?action=room):
     sync-ticket          { token }              -> { id }                  جلسة؛ ١٠ في الساعة لكلّ حساب
     sync-put             { id, blob }           -> { ok }                  بلا جلسة (من التطبيق)، بالتذكرة وحدها
     sync-get             { token, id }          -> { wait } | { blob }     صاحب التذكرة وحده، ويُمحى عند القراءة
     match                { token, hashes }      -> { matches: [{ h, t }] } ١–٥٠٠ بصمة، وسقف يوميّ ١٠٠٠٠ لكلّ حساب
     phone-hash-backfill  { token }              -> { scanned, written }    المالك وحده: يبني الفهرس للأرقام المربوطة قبله */
const crypto = require('crypto');

const TICKET_TTL = 600, BLOB_TTL = 180, TICKETS_PER_HOUR = 10;
const MAX_HASHES = 500, HASHES_PER_DAY = 10000;      // مزامنتان كاملتان في اليوم لهاتف فيه ٣٠٠٠ رقم (حدّ التطبيق) وهامش
const CALLEE_TTL_MS = 30 * 86400 * 1000;
const OPS = ['sync-ticket', 'sync-put', 'sync-get', 'match', 'phone-hash-backfill'];

const ticketKey = (id) => 'talk/sync/' + id;
const hashKey = (h) => 'db/phone-hash/' + h;
const isTicketId = (v) => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
const isBlob = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{24,110000}$/.test(v);
const isHash = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const norm = (u) => String(u == null ? '' : u).trim().toLowerCase();
const phoneHash = (p) => require('./phone-link.js').phoneHash(p);
function readTicket(raw) {
  if (!raw) return null;
  try { const t = JSON.parse(raw); return t && typeof t === 'object' ? t : null; } catch (e) { return null; /* سجلّ تالف = لا تذكرة */ }
}

/* رمز المتّصَل به: AES-256-GCM بمفتاح مشتقّ من AUTH_SECRET بوسم خاصّ (طريقة mintTicket في api/video-download.js) — فلا يصلح جلسة،
   ولا يُقرأ ما فيه (اسم الحساب لا يصل الصفحة). مربوط بالمتّصل وبالبصمة، ومدّته ٣٠ يومًا. السرّ يُقرأ عند النداء. */
function calleeKey() { return crypto.createHmac('sha256', require('./_secrets.js').AUTH_SECRET).update('talk-callee/v1').digest(); }
function mintCallee(callee, caller, h, now) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', calleeKey(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify({ c: norm(callee), b: norm(caller), h, e: (Number(now) || Date.now()) + CALLEE_TTL_MS }), 'utf8'), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64url');
}
/** { c, h } من رمز صالح لهذا المتّصل، وإلّا null — لا يرمي. */
function openCallee(token, caller, now) {
  try {
    if (typeof token !== 'string' || token.length > 1024) return null;
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', calleeKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(raw.length - 16));
    const data = JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8'));
    if (!data || typeof data.c !== 'string' || !data.c || !isHash(data.h) || data.b !== norm(caller) || !(Number(data.e) > (Number(now) || Date.now()))) return null;
    return { c: data.c, h: data.h };
  } catch (e) {
    return null; // رمز مشوّه أو مزوّر أو منتهٍ
  }
}

/* قراءة واحدة صارمة (getUserSure في auth.js): null = السجلّ غائب فعلًا — بلا إعادة getUser الأربع ونومها ١٫٨ ثانية لكلّ بصمة قديمة
   تشير إلى سجلّ ممحوّ — وعطل المخزن يرمي فيصل 503 store في talk-room.js، لا «ليس على التطبيق» فتمحو الصفحة رمز صديقه.
   المختوم (لا مفتاح يفكّه، وقد سجّله getUserOnce) لا يُقرأ أبدًا فيُعدّ غائبًا: رميه كان سيُسقط كلّ مزامنة فيها رقمه. */
async function readUser(auth, key) {
  try { return await auth.getUserSure(key); } catch (e) { if (e && e.code === 'USER_RECORD_UNDECRYPTABLE') return null; throw e; }
}

/** الحساب الحيّ (يتبع شاهد تغيير الاسم كـphoneOwner) الذي رقمه الآن بهذه البصمة، وإلّا null. يرمي عند عطل المخزن. */
async function liveOwner(auth, username, h) {
  let key = norm(username);
  if (!key) return null;
  let user = await readUser(auth, key);
  for (let i = 0; i < 32 && user && user.deleted && user.movedTo; i++) {
    key = norm(user.movedTo);
    user = await readUser(auth, key);
  }
  return user && !user.deleted && user.phone && phoneHash(user.phone) === h ? key : null;
}

/** ring بالرمز: الحساب المتّصَل به إن كان الرمز لهذا المتّصل وما زال صاحب الرقم حيًّا يملكه، وإلّا null.
    null = رمز غير صالح أو حساب ثبت غيابه أو تغيّر رقمه فقط؛ عطل المخزن يرمي (503 store). */
async function calleeFor(token, caller, auth, now) {
  const t = openCallee(token, caller, now);
  if (!t) return null;
  return liveOwner(auth, t.c, t.h);
}

/** One sync operation. Returns { status, json }, or null when op is not a sync op. o: { auth, overRate(what), now } */
async function syncAct(b, ip, K, who, o) {
  const op = String((b && b.op) || '');
  if (!OPS.includes(op)) return null;
  const opt = o || {};
  const bad = (error, status = 400) => ({ status, json: { error } });
  const auth = opt.auth || require('./auth.js');

  if (op === 'sync-put') {      // من التطبيق بلا جلسة: التذكرة هي الإذن
    if (!isTicketId(b.id)) return bad('id');
    if (!isBlob(b.blob)) return bad('blob');
    if (opt.overRate && await opt.overRate('sync')) return bad('slow-down', 429);
    const t = readTicket(await K.kvGetRaw(ticketKey(b.id)));      // عطل المخزن يرمي (503 store) لا «لا تذكرة»
    if (!t || t.s !== 0 || typeof t.u !== 'string') return bad('no-ticket', 404);
    await K.kvSetRaw(ticketKey(b.id), JSON.stringify({ u: t.u, s: 1, b: b.blob }), BLOB_TTL);
    return { status: 200, json: { ok: true } };
  }

  if (!who) return bad('login', 401);
  const me = norm(who);

  if (op === 'sync-ticket') {
    const rl = 'rl:talk-sync:ticket:' + me + ':' + Math.floor(Date.now() / 3600000);
    const n = Number(await K.kvIncr(rl)); if (n === 1) await K.kvExpire(rl, 7200);
    if (n > TICKETS_PER_HOUR) return bad('slow-down', 429);
    const id = crypto.randomBytes(16).toString('hex');
    await K.kvSetRaw(ticketKey(id), JSON.stringify({ u: me, s: 0 }), TICKET_TTL);
    return { status: 200, json: { id } };
  }

  if (op === 'sync-get') {
    if (!isTicketId(b.id)) return bad('no-ticket', 404);
    const t = readTicket(await K.kvGetRaw(ticketKey(b.id)));
    if (!t || t.u !== me) return bad('no-ticket', 404);
    if (t.s !== 1 || typeof t.b !== 'string') return { status: 200, json: { wait: true } };
    await K.kvPipeline([['DEL', ticketKey(b.id)]]);      // قراءة واحدة: لا يبقى في الخادم شيء
    return { status: 200, json: { blob: t.b } };
  }

  if (op === 'match') {
    const list = b.hashes;
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_HASHES || !list.every(isHash)) return bad('hashes');
    const hashes = [...new Set(list)];
    const day = 'rl:talk-sync:match:' + me + ':' + new Date().toISOString().slice(0, 10);
    const used = Number(await K.kvIncrBy(day, hashes.length));
    if (used === hashes.length) await K.kvExpire(day, 2 * 86400);
    if (used > HASHES_PER_DAY) {      // منع مسح الأرقام لمعرفة من على التطبيق
      await K.kvDecrBy(day, hashes.length);      // المرفوض لا يُحسب: دفعة رُفضت لا تقفل الحساب بقيّة اليوم، وما بقي يصلح لدفعة أصغر
      return bad('slow-down', 429);
    }
    const out = await K.kvPipeline([['MGET', ...hashes.map(hashKey)]]);
    const vals = Array.isArray(out && out[0]) ? out[0] : [];
    const hits = [];
    hashes.forEach((h, i) => {
      let v = null;
      try { v = vals[i] ? JSON.parse(vals[i]) : null; } catch (e) { v = null; /* مدخل تالف لا يطابق */ }
      if (v && typeof v.username === 'string' && v.username) hits.push({ h, u: v.username });
    });
    const matches = [];
    for (let i = 0; i < hits.length; i += 16) {
      const chunk = hits.slice(i, i + 16);
      const keys = await Promise.all(chunk.map((x) => liveOwner(auth, x.u, x.h)));      // عطل المخزن يرمي (503) — لا يُعدّ «ليس على التطبيق»
      chunk.forEach((x, j) => { if (keys[j] && keys[j] !== me) matches.push({ h: x.h, t: mintCallee(keys[j], me, x.h, opt.now) }); });
    }
    return { status: 200, json: { matches } };
  }

  // phone-hash-backfill — المالك وحده (isOwnerName كما في admin-actions.js)
  if (!require('./_owner.js').isOwnerName(me)) return bad('owner', 403);
  const keys = await K.kvList('db/phone-index/');
  let written = 0;
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const got = await K.kvPipeline([['MGET', ...chunk]]);
    const vals = Array.isArray(got && got[0]) ? got[0] : [];
    const sets = [];
    chunk.forEach((k, j) => {
      let v = null;
      try { v = vals[j] ? JSON.parse(vals[j]) : null; } catch (e) { v = null; /* مدخل تالف يُتخطّى */ }
      const phone = k.slice('db/phone-index/'.length);
      if (v && typeof v.username === 'string' && v.username && /^\+[1-9]\d{7,14}$/.test(phone)) sets.push(['SET', hashKey(phoneHash(phone)), JSON.stringify({ username: norm(v.username) }), 'NX']);
    });
    if (sets.length) written += (await K.kvPipeline(sets)).filter((r) => r === 'OK').length;
  }
  return { status: 200, json: { scanned: keys.length, written } };
}

module.exports = { syncAct, calleeFor, mintCallee, openCallee, liveOwner, phoneHash, MAX_HASHES, HASHES_PER_DAY, TICKET_TTL, BLOB_TTL };
