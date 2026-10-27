// api/_lib/image-hold.js — v-maha-img-hold (تدقيق ١٨ أكتوبر + أمر المالك ٢٠ أكتوبر، الدفعة ١ «الفلوس»):
// «مها تخصم ٢٠ نقطة وتضيع الصورة إذا سكّرت: لا تثبّت الخصم إلا بعد ما توصل الصورة وتنحفظ، وإذا ضاعت ترجع النقاط تلقائي».
//
// الجذر: صورة مكالمة مها تُخصم في maha-image.js قبل التوليد، ثمّ تُرسل في ردّ قد لا يصل (أُغلق التبويب، انقطعت الشبكة)،
// والعميل كان يعرضها داخل شاشة المكالمة وحدها — بعد الإغلاق لا يراها أحد. الخادم لا يعرف هل وصلت.
//
// الحلّ: تذكرة حجز. ردّ الصورة الناجح لطلب يحمل `hold` (مكالمة مها وحدها) يسجّل ما خُصم {المبلغ · نوع الخصم} باسم
// المستخدم، والعميل بعد أن يحفظ الصورة في المحادثة يرسل `image-ack` فتُمحى التذكرة ويثبت الخصم. تذكرة بلا تأكيد بعد
// HOLD_STALE_MS تُردّ نقاطها تلقائيًّا عند أوّل قراءة لرصيد صاحبها (/api/points balance — تقرؤه الواجهة عند كلّ فتح).
// «مرّة واحدة» محروسة بـSET NX على مفتاح تسوية لكلّ تذكرة (كـvideo-job.js): تأكيد وتسوية متزامنان لا يردّان مرّتين.
// حارس إساءة: من يحجب التأكيد عمدًا يأخذ الصورة ويستردّ — فالردّ التلقائيّ REFUND_DAY_MAX مرّات في اليوم لكلّ حساب،
// وما زاد يثبت خصمه (حجوز العميل وحدها؛ تذاكر الخادم بعلامتها t لها حدّ احتياطيّ أوسع منفصل SRV_REFUND_DAY_MAX — v-lock-quotab). عطب KV لا يوقف شيئًا: الحجز أفضل جهد، وأسوأ حالاته سلوك ما قبل هذا الملفّ (خصم ثابت).
const crypto = require('crypto');

const HOLD_STALE_MS = 5 * 60 * 1000; // الصورة تصل بعد ثوانٍ من الردّ؛ خمس دقائق بلا تأكيد = لم تصل
const TTL_SEC = 2 * 86400;
const MAX_HOLDS = 20;
const REFUND_DAY_MAX = 3;
/* v-lock-quotab (srv-images-2): حدّ احتياطيّ لتذاكر الخادم وحدها، منفصل عن سقف حجوز العميل. تذكرة الخادم لا يبقيها العميل مفتوحة، لكن عطب KV
   في closeTicket لحظة التسليم يتركها مفتوحة بعد أن وصلت الصورة — فلا يُردّ ذلك بلا حدّ. واسع (عشرون دالّة قُتلت في يوم = ١٠٠ دقيقة انتظار). */
const SRV_REFUND_DAY_MAX = 20;
/* v-lock-quotab (srv-images-2): مفتاح التسوية يعيش TTL_SEC، والقائمة تتجدّد مع كلّ تذكرة جديدة. كتابة متزامنة للقائمة (openTicket أو الكنس:
   قراءة قبل حسم تذكرة وكتابة بعده) تعيد إليها تذكرة محسومة؛ وبعد انقضاء مفتاحها كان الكنس يأخذه من جديد فيردّ صورة وصلت أو يردّ مرّة ثانية.
   المفتاح لا يُكتب قبل فتح التذكرة (at − TICKET_GRACE_MS) فلا ينقضي قبل أن يبلغ عمرها TTL − TICKET_GRACE_MS، وهذا الحدّ أبكر منه: ما بلغه
   يُسقط بلا ردّ (كانقضاء القائمة نفسها). */
const SETTLE_KEY_SAFE_MS = TTL_SEC * 1000 - HOLD_STALE_MS;

function cleanId(id) {
  const s = String(id == null ? '' : id);
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : '';
}
function userPart(username) {
  return encodeURIComponent(String(username || '').trim().toLowerCase());
}
function listKey(username) {
  return 'imghold:' + userPart(username);
}
function doneKey(username, id) {
  return 'imghold:done:' + crypto.createHash('sha1').update(userPart(username) + '|' + id).digest('hex');
}
function dayKey(username, now, srv) {
  return 'imghold:' + (srv ? 'srvrefunds:' : 'refunds:') + userPart(username) + ':' + new Date(now).toISOString().slice(0, 10);
}

async function readList(kv, username) {
  const v = await kv.kvGetJSON(listKey(username));
  return Array.isArray(v) ? v.filter((h) => h && cleanId(h.id)) : [];
}
async function writeList(kv, username, list) {
  if (list.length) await kv.kvSetRaw(listKey(username), JSON.stringify(list.slice(-MAX_HOLDS)), TTL_SEC);
  else await kv.kvDel(listKey(username));
}

/** يسجّل ما خُصم على صورة أُرسلت ولم يُؤكَّد وصولها بعد. pay = نتيجة spendPoints نفسها (نوع الخصم). */
async function holdImage(username, id, cost, pay, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const hid = cleanId(id);
  const c = Math.max(0, Math.floor(Number(cost) || 0));
  if (!username || !hid || !c) return false;
  if (pay && pay.owner) return false; // المالك وVIP لم يُخصم منهما شيء
  const p = pay && typeof pay === 'object' ? pay : null;
  const h = Object.assign({ id: hid, c, at: Number(opt.now) || Date.now() },
    p ? { k: p.planVideo ? 'v' : (p.media ? 'm' : 'p') } : {}, p && p.media && p.pool ? { pl: String(p.pool) } : {},
    opt.srv ? { t: 1 } : {}); /* v-lock-quotab (srv-images-2): علامة تذكرة الخادم يكتبها openTicket وحده — لا من المعرّف (العميل يرسل أيّ معرّف في hold) */
  try {
    const list = (await readList(kv, username)).filter((x) => x.id !== hid);
    list.push(h);
    await writeList(kv, username, list);
    return true;
  } catch (e) {
    console.error('[image-hold] write failed: ' + (e && e.message));
    return false;
  }
}

/** من maha-image قبل ردّ الصورة: معرّف الطلب إن حُجز خصمه، وإلّا undefined (لا معرّف، لا خصم، أو عطب — فيثبت الخصم كما كان). لا يرمي. */
async function holdFromRequest(rawId, username, cost, pay, o) {
  const hid = cleanId(rawId);
  if (!hid || !username) return undefined;
  try { return (await holdImage(username, hid, cost, pay, o)) ? hid : undefined; } catch (e) { return undefined; }
}

/** العميل حفظ الصورة: يثبت الخصم (تُمحى التذكرة). يرجع null إن لا تذكرة أو سوّاها نداء آخر قبله. */
async function ackImage(username, id, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const hid = cleanId(id);
  if (!username || !hid) return null;
  let list;
  try { list = await readList(kv, username); } catch (e) { return null; }
  if (!list.some((x) => x.id === hid)) return null;
  let mine = false;
  try { mine = await kv.kvSetIfAbsent(doneKey(username, hid), '1', TTL_SEC); } catch (e) { return null; }
  if (!mine) return null;
  try { await writeList(kv, username, (await readList(kv, username)).filter((x) => x.id !== hid)); } catch (e) { /* guard-ok — التذكرة محسومة بمفتاح التسوية؛ القائمة تسقط بعد يومين */ }
  return { committed: true };
}

/** يردّ نقاط كلّ تذكرة تجاوزت HOLD_STALE_MS بلا تأكيد. يرجع {refunded: عدد, points: مجموع}. */
async function settleStale(username, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const now = Number(opt.now) || Date.now();
  const out = { refunded: 0, points: 0 };
  if (!username) return out;
  let list;
  try { list = await readList(kv, username); } catch (e) { return out; }
  const expired = list.filter((h) => now - Number(h.at || 0) >= SETTLE_KEY_SAFE_MS); // v-lock-quotab (srv-images-2): قد انقضى مفتاح تسويتها — تُسقط بلا ردّ
  const stale = list.filter((h) => { const age = now - Number(h.at || 0); return age >= HOLD_STALE_MS && age < SETTLE_KEY_SAFE_MS; });
  if (!stale.length && !expired.length) return out;
  const points = opt.points || require('./points.js');
  const settled = new Set(expired.map((h) => h.id));
  for (const h of stale) {
    let mine = false;
    try { mine = await kv.kvSetIfAbsent(doneKey(username, h.id), '0', TTL_SEC); } catch (e) { continue; }
    settled.add(h.id);
    if (!mine) continue; // أكّدها العميل أو سوّاها نداء آخر
    /* v-lock-quotab (srv-images-2): السقف لمن يحجب التأكيد عمدًا — حجوز العميل وحدها. تذكرة الخادم تغلقها الدالّة قبل ردّ الصورة، فبقاؤها
       مفتوحة = قُتلت الدالّة ولم تصل الصورة؛ لا يملك العميل إبقاءها، فلا تأكل من سقف حجوزه («إذا ما وصلت، النقاط ترجع») ولها حدّها الاحتياطيّ. */
    const cap = h.t ? SRV_REFUND_DAY_MAX : REFUND_DAY_MAX;
    let n = 1;
    try { n = Number(await kv.kvIncr(dayKey(username, now, h.t))); if (n === 1) await kv.kvExpire(dayKey(username, now, h.t), 2 * 86400); } catch (e) { n = 1; }
    if (n > cap) { console.warn('[image-hold] daily auto-refund cap reached — charge kept'); continue; }
    const how = h.k ? { planVideo: h.k === 'v', media: h.k === 'm', pool: h.pl || '' } : undefined;
    try { await points.refundPoints(username, h.c, how); out.refunded++; out.points += h.c; } catch (e) { console.error('[image-hold] refund failed: ' + (e && e.message)); }
  }
  try { await writeList(kv, username, (await readList(kv, username)).filter((x) => !settled.has(x.id))); } catch (e) { /* guard-ok — المحسوم لا يُردّ ثانية (مفتاح التسوية) */ }
  return out;
}

/* v-img-deadline-refund (أمر المالك ٢١ أكتوبر: «صورة مها اللي تطوّل أكثر من 300 ثانية: إذا ما وصلت، النقاط ترجع»): الدالّة تُقتل عند ٣٠٠ث
   (سلسلة المحرّكات قد تطول) فلا يصل catch ولا ردّ النقاط. تذكرة خادم تُفتح عند الخصم وتُغلق عند التسليم أو الردّ المباشر؛ ما بقي مفتوحًا
   = قُتلت الدالّة ولم تصل الصورة → يردّها settleStale عند أوّل قراءة رصيد. ساعتها تبدأ بعد عمر الدالّة كلّه (TICKET_GRACE_MS) فلا تُردّ صورة
   ما زالت تُرسم. «مرّة واحدة» بمفتاح التسوية نفسه: الإغلاق يأخذه قبل الردّ المباشر، فلا يردّ الكنس والدالّة معًا. */
const TICKET_GRACE_MS = 60 * 1000;
/** يفتح (أو يحدّث بمعرّفه) تذكرة خصم صورة على الخادم. يرجع معرّفها، أو undefined (لا خصم، مالك/VIP، أو عطب — فيبقى الردّ المباشر وحده). */
async function openTicket(username, cost, pay, id, o) {
  const tid = cleanId(id) || ('srv' + crypto.randomBytes(9).toString('hex'));
  const at = (Number(o && o.now) || Date.now()) + TICKET_GRACE_MS;
  try { return (await holdImage(username, tid, cost, pay, Object.assign({}, o, { now: at, srv: true }))) ? tid : undefined; } catch (e) { return undefined; }
}
/** يغلق تذكرة الخادم: true = القرار للدالّة (أخذت مفتاح التسوية، أو لا تذكرة) فتردّ هي إن فشلت؛ false = سوّاها الكنس قبلها أو تعذّر الحسم
    فلا تردّ هي (تبقى التذكرة للكنس) — فلا تُردّ النقاط مرّتين. */
async function closeTicket(username, id, o) {
  const opt = o || {};
  const kv = opt.kv || require('./kv.js');
  const hid = cleanId(id);
  if (!username || !hid) return true;
  let mine = false;
  try { mine = await kv.kvSetIfAbsent(doneKey(username, hid), '1', TTL_SEC); } catch (e) { return false; }
  if (mine) { try { await writeList(kv, username, (await readList(kv, username)).filter((x) => x.id !== hid)); } catch (e) { /* guard-ok — محسومة بمفتاح التسوية */ } }
  return !!mine;
}

module.exports = { HOLD_STALE_MS, REFUND_DAY_MAX, SRV_REFUND_DAY_MAX, TICKET_GRACE_MS, cleanId, holdImage, holdFromRequest, ackImage, settleStale, openTicket, closeTicket };
