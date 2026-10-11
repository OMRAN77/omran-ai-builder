'use strict';
/* v-video-enhance-pro (طلب المالك ١٠ أكتوبر، بعد تجربة «حسّن الفيديو» المجّانيّ على الجهاز: «مش قوي بما فيه الكفاية… مش الجودة
   المطلوبة» ثمّ «اريده في التطبيق»): «تحسين احترافي» — ترميم الفيديو عند مزوّد خارجيّ، بالنقاط. المسار المجّانيّ يبقى على جهاز
   المستخدم ولا يمرّ من هنا أبدًا. هذه الدالّة تخصم نقاط المستخدم وتصرف مال المالك عند المزوّد، فكلّ خطوة فيها مرتّبة على ذلك:
     info   ← GET بلا خصم ولا نداء مزوّد: هل الميزة مفتوحة لهذا الحساب، وسعر الثانية، ومهمّته الجارية أو الأخيرة إن وُجدت.
     start  ← الحجم والنوع والمدّة من المتصفّح؛ يرفض مبكّرًا (الحجم، الصيغة، المدّة، الرصيد، حدّ اليوم) ثمّ يصدر هدف رفع خامًا
              عند المزوّد يرفع إليه المتصفّح مباشرة.
     run    ← بلا confirmed: ينسخ الخادم البايتات مرّة إلى هدف ثانٍ «مثبّت» لا يغادر رابط الكتابة فيه الخادم، ويقيس النسخة
              المثبّتة وحدها (ما يكتب فيه المتصفّح لا يُحاسَب عليه ولا يُرسل)، ثمّ يعرض التكلفة بلا خصم.
              مع confirmed: حجز من سقف اليوم ← خصم النقاط ← إرسال. بعد الخصم لا رجوع للتسعير: نجاح، أو ردّ النقاط مرّة واحدة.
     status ← استطلاع صاحب المهمّة وحده؛ التسوية كسولة (عند الاستطلاع) وبمطالبة ذرّيّة: ردّ واحد أو قياس واحد لتكلفتنا.
   السعر بالثانية من جدول واحد يربط المحرّك بسعره (TIERS): سعر المزوّد يتبع اسم النموذج داخل الطلب لا عنوان الخدمة، فلا يُبدَّل
   أحدهما بلا الآخر. الحمايات: مفتاح إيقاف، سقف صرف يوميّ يُحجز قبل الخصم ويُصحَّح بالتكلفة الحقيقيّة عند التسليم، خُمس السقف لغير
   المشتركين، قاطع دائم إن فاقت مهمّة تقديرها ثلاث مرّات، عشر رفعات يوميًّا، ومهمّة واحدة جارية للحساب.
   المفتاح يُقرأ داخل المعالج لا في نطاق الوحدة، ولا اسم مزوّد ولا رابط ولا مفتاح في أيّ ردّ أو سجلّ (__diag للمالك وحده). */
const crypto = require('node:crypto');
const pointsLib = require('./points.js');
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel, kvPipeline } = require('./kv.js');
const { sessionUser, tokenOf } = require('./_session.js');

// الطبقة = عنوان الخدمة + النموذج + إطارات لكلّ رصيد مزوّد (حتّى 1080p، وفوقه) + نقاط الثانية + أقلّ ثوانٍ تُحاسَب. قرار مالك.
const TIERS = {
  fast:    { endpoint: 'topaz/upscale/video/generative', model: 'Starlight Fast 2',      fpc: 52.0833, fpc4k: 23.8357, pps: 9,  minSec: 3 },
  precise: { endpoint: 'topaz/upscale/video/precision',  model: 'Proteus',               fpc: 237,     fpc4k: 59,      pps: 2,  minSec: 10 },
  max:     { endpoint: 'topaz/upscale/video/generative', model: 'Starlight Precise 2.6', fpc: 26.0417, fpc4k: 11.9179, pps: 17, minSec: 2 },
};
const CREDIT_CENTS = 10; // سعر رصيد المزوّد بالسنت — يُقرَّب للأعلى مرّة لكلّ مهمّة
const MAX_SEC = 30;
const GRACE = 0.1;
const MAX_SAMPLES = 1600; // أكبر جدول عيّنات مقبول في الملفّ: ٣٠٫١ث × ٥٠ حزمة صوت/ث = ١٥٠٥، والفيديو النزيه ≤ ٩٢٠ إطارًا
const MAX_BOXES = 256;   // صناديق المستوى الواحد: الملفّ الحقيقيّ فيه بضعة صناديق
const MAX_BYTES = 80 * 1024 * 1024;
const DAILY = 10;        // رفعات الحساب في اليوم
const FREE_SHARE = 0.2;  // حصّة غير المشتركين من سقف اليوم
const RAW_TTL = 1800;    // الهدف الخام ومهمّته قبل التسعير
const PIN_TTL = 3600;    // النسخة المثبّتة عند المزوّد
const QUOTE_TTL = 900;   // صلاحيّة عرض التكلفة
const PAID_TTL = 604800; // المهمّة بعد الخصم: ٧ أيّام
const FAILED_TTL = 86400;
const OUT_SEC = 172800;  // النتيجة تبقى يومين من بدء التشغيل
const HARD_MS = 6 * 3600 * 1000;
const ORPHAN_MS = 330000; // «مدفوع» بلا طلب عند المزوّد بعد هذا = يتيم يُردّ (مهلة الدالّة ٣٠٠ث)
const CLAIM_TTL = 691200; // مطالبة التسوية: ٨ أيّام — أطول من سجلّ المهمّة
const MEAS_LOCK_SEC = 280;
const RUN_LOCK_SEC = 300;
const POLL_SEC = 3;
const MAX_TRIES = 12;
const QUEUE = 'https://queue.fal.run/';
const INITIATE = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
const METADATA = 'https://fal.run/fal-ai/ffmpeg-api/metadata';
const MIME = { 'video/mp4': 'mp4', 'video/x-m4v': 'm4v', 'video/quicktime': 'mov' };
const EXT = { mp4: 'mp4', m4v: 'm4v', mov: 'mov' };

const enc = (u) => encodeURIComponent(String(u || '').toLowerCase());
const jobKey = (id) => 'venh:' + id;
const measKey = (id) => 'venh:meas:' + id;
const pinKey = (u) => 'venh:pin:' + enc(u);
const runKey = (id) => 'venh:run:' + id;
const pollKey = (id) => 'venh:poll:' + id;
const openKey = (u) => 'venh:open:' + enc(u);
const lastKey = (u) => 'venh:last:' + enc(u);
const claimKey = (id) => 'venh:settled:' + id;
const spentKey = (day) => 'venh:spent:' + day;
const freeKey = (day) => 'venh:spentfree:' + day;
const TRIP_KEY = 'venh:trip';

const fail = (res, status, code, extra) => res.status(status).json(Object.assign({ ok: false, error: code }, extra || {}));
const running = (id, extra) => Object.assign({ ok: true, state: 'running', id }, extra || {});
const msgOf = (e) => String((e && e.message) || e || 'unknown').replace(/\s+/g, ' ').slice(0, 200);
const pos = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const qOk = (u) => typeof u === 'string' && u.startsWith(QUEUE);
const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');
const falKey = () => String(process.env.FAL_KEY || '').trim();

// ── البيئة: تُقرأ عند النداء (الطبقة والسقف والمفتاح تتبدّل بلا إعادة تحميل الوحدة) ──
function tierKey() {
  const k = String(process.env.VIDEO_ENHANCE_TIER || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TIERS, k) ? k : 'fast';
}
/** off = لا أحد · on = الجميع · غير ذلك (ومنه غير المضبوط) = المالك وحده. */
function mode() {
  const m = String(process.env.VIDEO_ENHANCE || '').trim().toLowerCase();
  return m === 'off' || m === 'on' ? m : 'owner';
}
/** سقف الصرف اليوميّ بالسنت؛ الصفر مقبول ويغلق. */
function capCents() {
  const raw = process.env.VIDEO_ENHANCE_CAP_CENTS === undefined ? '' : String(process.env.VIDEO_ENHANCE_CAP_CENTS).trim();
  return raw === '' ? 1000 : (Number.isFinite(+raw) && +raw >= 0 ? +raw : 1000);
}
function tallOk(key) {
  return String(process.env.VIDEO_ENHANCE_TALL_OK || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(key);
}

// ── التسعير: دوالّ صرفة يثبتها الاختبار على كلّ مدّة وعدد إطارات ──
/** الثواني المحاسَبة: الأطول من المدّة ومن الإطارات على ٣٠ (المزوّد يحاسب بالإطار)، بسماح عُشر ثانية، ولا تنزل عن حدّ الطبقة. */
function billedSec(t, dur, frames) {
  return Math.max(t.minSec, Math.ceil(Math.max(Number(dur) || 0, (Number(frames) || 0) / 30) - GRACE));
}
/** معامل التكبير بمنزلتين للأسفل: حتّى 1920×1080 عرضيًّا، أو بأيّ اتّجاه حين يُسمح بالمخرج الطوليّ. أقلّ من ١ = مرفوض. */
function factorFor(w, h, tallAllowed) {
  const v = tallAllowed ? Math.min(4, 1080 / Math.min(w, h), 1920 / Math.max(w, h)) : Math.min(4, 1920 / w, 1080 / h);
  return Math.floor(v * 100) / 100;
}
const fitsWide = (w, h) => w <= 1920 && h <= 1080;
const fitsAny = (w, h) => Math.min(w, h) <= 1080 && Math.max(w, h) <= 1920;
/** إطارات لكلّ رصيد للمخرج W×H: جدول 1080p للعرضيّ (وللطوليّ حين تحقّق المالك من الطبقة)، وإلّا جدول 4K — الأغلى، احتياطًا. */
function fpcFor(key, W, H) {
  const t = TIERS[key] || TIERS.fast;
  return (fitsWide(W, H) || (tallOk(key) && fitsAny(W, H))) ? t.fpc : t.fpc4k;
}
/** تكلفتنا عند المزوّد بالسنت لمخرج بهذه الإطارات والأبعاد. */
function providerCents(key, frames, W, H) {
  return CREDIT_CENTS * Math.ceil((Number(frames) || 0) / fpcFor(key, W, H));
}

/* MP4/MOV غير مجزّأ فقط: الملفّ المجزّأ (moof/mvex) تقرأ أداة القياس منه مدّة والنموذج يعالج غيرها. نمشي على الصناديق العليا
   (حجم ٣٢ بت + نوع ٤ أحرف؛ الحجم ١ = حجم ٦٤ بت يتبع؛ الحجم ٠ = إلى آخر الملفّ): أوّلها ftyp، وفيها moov، ولا moof، ولا mvex
   داخل moov. صندوق يتجاوز آخر الملفّ = ملفّ مشوّه مرفوض، وأكثر من ٢٥٦ صندوقًا في مستوى واحد كذلك (ملفّ من ملايين الصناديق
   الصغيرة كان يحجز غيغابايت من الذاكرة قبل أيّ فحص آخر).
   ثمّ حدّ من بايتات الملفّ نفسه لما قد يعالجه المزوّد — السعر والحجز من أداة قياسه وحدها، وأداة القياس والنموذج قد يقرآن ملفًّا
   مصنوعًا قراءتين (مسارا فيديو، جدولا عيّنات، رأس مضغوط): كلّ جدول أحجام عيّنات (stsz/stz2) يجده قارئ خارج mdat يعلن ≤ ١٦٠٠
   عيّنة، ولا رأس مضغوط (cmov يخفي كلّ الجداول) ولا moof مدفون. بحث بالبايت لا مشي على البنية: لا نحاكي قارئًا بعينه (أيّ مسار
   هو «الفيديو»، وأيّ جدول يغلب حين يتكرّر). ما لا يغطّيه: عيّنات قليلة بطوابع زمن ممطوطة أو قائمة تحرير تكرّرها — PITFALLS. */
function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return false;
  const walk = (from, to) => {
    const out = [];
    let p = from;
    while (p + 8 <= to) {
      if (out.length >= MAX_BOXES) return null;
      let size = buf.readUInt32BE(p);
      let head = 8;
      const type = buf.toString('latin1', p + 4, p + 8);
      if (size === 1) {
        if (p + 16 > to) return null;
        size = buf.readUInt32BE(p + 8) * 4294967296 + buf.readUInt32BE(p + 12);
        head = 16;
      } else if (size === 0) size = to - p;
      if (size < head || p + size > to) return null;
      out.push({ type, from: p + head, to: p + size });
      p += size;
    }
    return out;
  };
  const top = walk(0, buf.length);
  if (!top || !top.length || top[0].type !== 'ftyp') return false;
  if (top.some((b) => b.type === 'moof')) return false;
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) return false;
  const kids = walk(moov.from, moov.to);
  if (!kids || kids.some((b) => b.type === 'mvex')) return false;
  for (const b of top) {
    if (b.type === 'mdat') continue;
    const part = buf.subarray(b.from, b.to);
    if (part.indexOf('cmov', 0, 'latin1') !== -1 || part.indexOf('moof', 0, 'latin1') !== -1) return false;
    for (const tag of ['stsz', 'stz2']) {
      let n = 0;
      for (let p = part.indexOf(tag, 0, 'latin1'); p !== -1; p = part.indexOf(tag, p + 4, 'latin1')) {
        const at = p + (p >= 4 && part.readUInt32BE(p - 4) === 1 ? 20 : 12); // عدد العيّنات بعد النوع بـ١٢ بايتًا؛ رأس ٦٤ بت يزيحه ٨
        if (++n > 64 || at + 4 > part.length || part.readUInt32BE(at) > MAX_SAMPLES) return false;
      }
    }
  }
  return true;
}

function containerOf(mime, name) {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  // خصائص الجدول نفسه فقط: «constructor» و«__proto__» من العميل كانتا تمرّان من Object.prototype فيصدر هدف رفع لاسم مرفوض.
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : '');
  const ext = own(MIME, m) || own(EXT, String((/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1] || '').toLowerCase());
  return ext ? { ext, ctype: ext === 'mov' ? 'video/quicktime' : 'video/mp4' } : null;
}

// ── التسجيل: كلّ رابط يصير [url] والمفتاح لا يُكتب أبدًا ──
function clean(s) {
  let t = String(s || '').replace(/https?:\/\/[^\s\x22\x27<>)\]}]+/gi, '[url]');
  const k = falKey();
  if (k) t = t.split(k).join('[key]');
  return t.slice(0, 400);
}
async function note(user, detail) {
  const d = clean(detail);
  console.error('[video-enhance] ' + d);
  try { await require('./log-error.js').logErrorAndFlush('video-enhance', new Error(d), { action: 'video-enhance', user: String(user || '').slice(0, 40) }); } catch (e) { /* guard-ok — التسجيل تحسين لا شرط */ }
}
async function upText(step, r) {
  let msg = '';
  try {
    const raw = await r.text();
    try { const d = JSON.parse(raw); const x = d && (d.detail || d.error || d.message); msg = typeof x === 'string' ? x : (x ? JSON.stringify(x) : raw); } catch (e2) { msg = raw; }
  } catch (e) { msg = ''; }
  return step + ' ' + r.status + (msg ? ': ' + String(msg).replace(/\s+/g, ' ').slice(0, 200) : '');
}
/* رصيد المزوّد عندنا خلص أو حسابنا موقوف — ليس خطأ المستخدم: «متوقّف مؤقّتًا» لا «أعد المحاولة» (نمط video-watch). نصّ المزوّد
   الحرفيّ غير مؤكَّد قبل أوّل تشغيل حقيقيّ، فالقائمة تبدأ من نصوص video-watch وتزيد صيغ الرصيد والإيقاف المعروفة. */
const OUTAGE_RE = / 402\b|prepay|billing|credits? (?:are |is )?(?:depleted|exhausted)|exhausted balance|insufficient (?:balance|credits?|funds)|user is locked/i;
async function failUp(res, user, detail, extra) {
  const d = clean(detail);
  await note(user, d);
  const outage = OUTAGE_RE.test(String(detail || ''));
  return fail(res, outage ? 503 : 502, outage ? 'unavailable' : 'failed', Object.assign({}, extra || {}, pointsLib.isOwnerUsername(user) ? { __diag: d } : {}));
}

// ── البوّابة: للبدء والتشغيل فقط — الاستطلاع لا يمرّ بها، فالمهمّة الجارية تُسوّى ولو أُوقفت الميزة ──
async function tripped() {
  try {
    const t = await kvGetRaw(TRIP_KEY);
    return !!t && String(t) !== String(process.env.VIDEO_ENHANCE_UNTRIP || '').trim();
  } catch (e) { return true; } // تعذّر القراءة = مقطوع (لا فتح للصرف على عمًى)
}
async function gate(user) {
  const m = mode();
  if (m === 'off' || capCents() <= 0) return false; // مفتاحا الإيقاف — للمالك أيضًا
  if (user && pointsLib.isOwnerUsername(user)) return true;
  return m === 'on' && !(await tripped());
}
async function isFree(user) {
  if (pointsLib.isOwnerUsername(user)) return true;
  try { return !!(await require('./_vip.js').isVip(user)); } catch (e) { return false; }
}

// ── المهمّة ──
const saveJob = (id, j, ttl) => kvSetRaw(jobKey(id), JSON.stringify(j), ttl);
/** { j } لصاحبها، أو { err: [حالة، رمز] }. تعذّر القراءة = retry لا not_found: خطأ عابر لا يُضيع مهمّة مدفوعة. */
async function readJob(id, user) {
  if (!/^[a-f0-9]{24}$/.test(String(id || ''))) return { err: [404, 'not_found'] };
  let raw;
  try { raw = await kvGetRaw(jobKey(id)); } catch (e) { return { err: [503, 'retry'] }; }
  let j = null;
  try { j = raw ? JSON.parse(raw) : null; } catch (e) { j = null; } // سجلّ مشوّه = لا مهمّة
  if (!j || typeof j !== 'object' || typeof j.u !== 'string') return { err: [404, 'not_found'] };
  if (j.u !== user) {
    // غيّر اسمه بعد أن بدأ: المهمّة تتبعه إن كان الاسم القديم في سجلّه — وإلّا فهي لغيره (404 لا 403: لا تأكيد وجود).
    let rec = null;
    try { rec = await require('./auth.js').getUserOnce(user); } catch (e) { rec = null; }
    const prev = rec && Array.isArray(rec.prevUsernames) ? rec.prevUsernames.map((x) => String(x).toLowerCase()) : [];
    if (!prev.includes(j.u.toLowerCase())) return { err: [404, 'not_found'] };
  }
  return { j };
}
/** الاسم الحيّ للحساب: يتبع شواهد تغيير الاسم {deleted, movedTo} (٣٢ قفزة كالشحن)؛ أيّ خطأ = الاسم كما هو. */
async function liveName(u) {
  try {
    const { getUserOnce } = require('./auth.js');
    let name = String(u || '');
    let rec = await getUserOnce(name);
    for (let i = 0; i < 32 && rec && rec.deleted && rec.movedTo; i++) { name = String(rec.movedTo); rec = await getUserOnce(name); }
    return name || u;
  } catch (e) { return u; }
}

/** عرض التكلفة من القياس المحفوظ والطبقة الحاليّة — يُحسب عند كلّ نداء ولا يُحفظ. */
async function quoteOf(id, j, user) {
  const tk = tierKey();
  const t = TIERS[tk];
  const m = j.m || {};
  const owner = pointsLib.isOwnerUsername(user);
  const free = await isFree(user);
  const sec = billedSec(t, m.dur, m.frames);
  const factor = factorFor(m.w, m.h, owner || tallOk(tk));
  const est = providerCents(tk, m.frames, Math.round(m.w * factor), Math.round(m.h * factor));
  const cost = free ? 0 : t.pps * sec;
  let points = null;
  if (!free) { const rec = await pointsLib.readPoints(user); points = rec ? Number(rec.points) || 0 : 0; }
  const out = { ok: true, quote: true, id, sec, cost, points };
  if (owner) out.__diag = 'est ' + est + 'c ' + tk + ' ' + m.w + 'x' + m.h + ' f' + m.frames + ' x' + factor;
  return { out, tk, sec, cost, factor, est };
}

// ── المزوّد ──
/** هدف رفع عند المزوّد بعمر محدّد واسم عشوائيّ. { up, file } أو { status, detail }؛ يرمي عند انقطاع الشبكة. */
async function initiate(key, ext, ctype, ttlSec) {
  const life = JSON.stringify({ expiration_duration_seconds: ttlSec });
  const r = await fetch(INITIATE, {
    method: 'POST',
    // التوثيق يسمّي الترويسة بالاسم الثاني والعميل الرسميّ بالأوّل — نرسل الاثنتين.
    headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json', 'X-Fal-Object-Lifecycle': life, 'X-Fal-Object-Lifecycle-Preference': life },
    body: JSON.stringify({ file_name: 'v-' + crypto.randomBytes(8).toString('hex') + '.' + ext, content_type: ctype }),
  });
  if (!r.ok) return { status: r.status, detail: await upText('initiate', r) };
  const d = await r.json().catch(() => ({}));
  if (!d || !isHttps(d.upload_url) || !isHttps(d.file_url)) return { status: 502, detail: 'initiate: no upload target' };
  return { up: d.upload_url, file: d.file_url };
}
/** قياس وسيط عند المزوّد: { ok, m:{dur,frames,w,h} } بالقيم كما هي (قد تنقص)، أو { ok:false, status }. يرمي عند الانقطاع والمهلة. */
async function measure(key, url, ms) {
  const r = await fetch(METADATA, {
    method: 'POST',
    headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_url: url, extract_frames: false }),
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) return { ok: false, status: r.status };
  const d = await r.json();
  const md = (d && d.media) || {};
  const rs = md.resolution || {};
  return { ok: true, m: { dur: md.duration, frames: md.frame_count, w: rs.width, h: rs.height } };
}
const discard = async (r) => { try { if (r && r.body) await r.body.cancel(); } catch (e) { /* guard-ok — إغلاق الجسم أفضل جهد */ } };
const measured = (m) => !!m && pos(m.dur) && pos(m.frames) && pos(m.w) && pos(m.h);
/** يقرأ الجسم قطعًا ويعدّ: null حين يتجاوز السقف (ويقطع القراءة). يرمي عند انقطاع الشبكة. */
async function readCapped(r, max) {
  if (!r.body || typeof r.body.getReader !== 'function') {
    const all = Buffer.from(await r.arrayBuffer());
    return all.length > max ? null : all;
  }
  const rd = r.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await rd.cancel(); } catch (e) { /* guard-ok — قطع القراءة أفضل جهد */ } return null; }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(chunks, n);
}
/** يرسل المهمّة لطابور المزوّد. { req:{id,s,r,c} } أو { fail:{why,detail,status,definitive} } — لا يرمي.
    definitive = رفض 4xx صريح (لم تُقبل قطعًا)؛ المهلة والانقطاع و5xx قد تكون قُبلت. */
async function submit(key, j) {
  const t = TIERS[j.tier];
  let r;
  try {
    r = await fetch(QUEUE + t.endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Key ' + key, 'Content-Type': 'application/json',
        'X-Fal-Object-Lifecycle-Preference': JSON.stringify({ expiration_duration_seconds: OUT_SEC }),
        'X-Fal-Request-Start-Timeout': '600', 'X-Fal-No-Retry': '1', 'x-app-fal-disable-fallback': 'true',
      },
      // النموذج والمعامل والترميز صريحة دائمًا: الافتراضيّ على العنوان نفسه نموذج أغلى، و×٢ يحوّل 1080p إلى 4K، وH.265 لا يشتغل في المتصفّح.
      body: JSON.stringify({ video_url: j.pin, model: t.model, upscale_factor: j.factor, H264_output: true }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) { return { fail: { why: 'submit', detail: 'submit: ' + msgOf(e), status: 0, definitive: false } }; }
  if (!r.ok) return { fail: { why: 'submit', detail: await upText('submit', r), status: r.status, definitive: r.status >= 400 && r.status < 500 } };
  const d = await r.json().catch(() => ({}));
  const rid = String((d && d.request_id) || '');
  if (!/^[\w-]{8,80}$/.test(rid)) return { fail: { why: 'submit', detail: 'submit ' + r.status + ': no request id', status: r.status, definitive: false } };
  // روابط المزوّد تُستعمل فقط إن كانت على طابوره — وإلّا تُبنى من المعرّف (المفتاح لا يُرسل لمضيف آخر).
  const base = QUEUE + t.endpoint + '/requests/' + rid;
  return { req: { id: rid, s: qOk(d.status_url) ? d.status_url : base + '/status', r: qOk(d.response_url) ? d.response_url : base, c: qOk(d.cancel_url) ? d.cancel_url : base + '/cancel' } };
}

// ── السقف اليوميّ ──
async function releaseCap(day, cents, nosub) {
  try { await kvPipeline([['DECRBY', spentKey(day), String(cents)]].concat(nosub ? [['DECRBY', freeKey(day), String(cents)]] : [])); }
  catch (e) { console.error('[video-enhance] cap release failed (reservation kept): ' + msgOf(e)); }
}

// ── التسوية ──
const slotUser = (j) => j.ou || j.u;
// رابط الطلب عند المزوّد من المعرّف (بديل الروابط المحفوظة). طبقة حُذفت من الجدول لا تعلّق تسوية مهمّة مدفوعة.
const reqBase = (j) => QUEUE + (TIERS[j.tier] || TIERS.fast).endpoint + '/requests/' + j.req.id;
async function closeSlot(id, j) { // الخانة تُفكّ (إن كانت ما زالت لهذه المهمّة) ومؤشّر «الأخيرة» يُكتب — أفضل جهد، لا يقلبان نتيجة التسوية
  try { if (String((await kvGetRaw(openKey(slotUser(j)))) || '') === id) await kvDel(openKey(slotUser(j))); }
  catch (e) { console.warn('[video-enhance] slot not released (cleared at the next start): ' + msgOf(e)); }
  try { await kvSetRaw(lastKey(slotUser(j)), id, OUT_SEC); } catch (e) { console.warn('[video-enhance] last pointer not saved: ' + msgOf(e)); }
}
const donePayload = (id, j) => (Date.now() - (Number(j.runAt) || 0) > OUT_SEC * 1000
  ? { ok: true, state: 'gone', id }
  : { ok: true, state: 'done', id, url: j.out, sec: j.sec, cost: j.paid });

async function finishFailed(id, j, why, detail, quiet) {
  j.st = 'failed'; j.refunded = j.paid; j.why = why;
  // السجلّ «فاشل» هو ما يمنع ردًّا ثانيًا في الاستطلاع التالي — محاولتان قبل أن نكتفي بالمطالبة.
  try { await saveJob(id, j, FAILED_TTL); } catch (e) {
    try { await saveJob(id, j, FAILED_TTL); } catch (e2) { console.error('[video-enhance] failed state not saved for ' + id + ': ' + msgOf(e2)); }
  }
  await closeSlot(id, j);
  if (!quiet) await note(j.u, 'job ' + id + ' failed (' + why + '), refunded ' + j.paid + ', reserved ' + j.cap + 'c: ' + detail);
  return { ok: true, state: 'failed', id, refunded: j.paid };
}
/* مسار الفشل: مطالبة ذرّيّة ثمّ ردّ النقاط مرّة واحدة. صاحب المطالبة يردّ ويختمها «0d» في نداء Redis واحد (القيد والختم معًا:
   ردّ وقع وختمه لم يُكتب كان يُقرأ بعد دقيقتين «انقطع قبل الردّ» فيُردّ ثانيةً)؛ من لم ينلها يقرأ قيمتها:
   «0d» = رُدّت (يُكمل السجلّ بلا ردّ ثانٍ) · «0:وقت» حديثة = ردّ جارٍ · قديمة = انقطع صاحبها قبل القيد فتُحذف ليُعاد · «1» = سُلّمت.
   ردّ لم يُعرف مصيره (ضاع جواب النداء) لا تُفكّ مطالبته على عمًى: تُقرأ أوّلًا — «0d» = وقع القيد. حجز السقف يبقى (المزوّد قد يكون حاسبنا). */
async function failJob(id, j, why, detail) {
  const claim = claimKey(id);
  const now = Date.now();
  if (await kvSetIfAbsent(claim, '0:' + now, CLAIM_TTL)) {
    let ok = false;
    try { ok = await pointsLib.refundPointsOnly(await liveName(j.u), j.paid, [claim, '0d', CLAIM_TTL]); } catch (e) { ok = false; }
    if (!ok) {
      let v = '';
      try { v = String((await kvGetRaw(claim)) || ''); } catch (e) {
        // لا يُعرف هل وقع القيد: المطالبة تبقى كما هي — «0d» يُكمل السجلّ في استطلاع تالٍ، و«0:وقت» تُفكّ بقاعدة الدقيقتين.
        console.error('[video-enhance] refund outcome unknown for ' + id + ' (claim unreadable): ' + msgOf(e));
        return running(id);
      }
      if (v === '0d') return finishFailed(id, j, why, detail); // القيد والختم وقعا وضاع الجواب وحده
      await kvDel(claim); // لم يقع القيد: المطالبة تُفكّ ليعيد الاستطلاع التالي الردّ
      try { await saveJob(id, j, PAID_TTL); } catch (e) { /* guard-ok — السجلّ المدفوع باقٍ على حاله إن كان محفوظًا */ }
      await note(j.u, 'job ' + id + ' refund-failed (' + why + '), ' + j.paid + ' points still owed: ' + detail);
      return running(id);
    }
    try { await kvSetRaw(claim, '0d', CLAIM_TTL); } catch (e) {
      try { await kvSetRaw(claim, '0d', CLAIM_TTL); } catch (e2) { console.error('[video-enhance] refund mark not saved for ' + id + ': ' + msgOf(e2)); }
    }
    return finishFailed(id, j, why, detail);
  }
  const v = String((await kvGetRaw(claim)) || '');
  if (v === '0d') return finishFailed(id, j, why, detail, true); // رُدّت وسُجّلت عند صاحب المطالبة — يُكمل السجلّ فقط
  if (v === '1') {
    const again = await readJob(id, j.u);
    return again.j && again.j.st === 'done' ? donePayload(id, again.j) : running(id);
  }
  if (v.startsWith('0:') && now - Number(v.slice(2)) >= 120000) await kvDel(claim);
  return running(id);
}

/* مسار النجاح: صاحب المطالبة يقيس المخرج (تكلفتنا الحقيقيّة) ويصحّح عدّاد اليوم ويسجّل التكلفة مرّة واحدة. الفيديو يُسلَّم دائمًا:
   حجبه لا يوفّر شيئًا بعد أن حاسبنا المزوّد. مهمّة فاقت تقديرها ثلاث مرّات وثلاثة دولارات تقطع الميزة عن غير المالك. */
async function succeed(id, j, url, key) {
  const claim = claimKey(id);
  if (await kvSetIfAbsent(claim, '1', CLAIM_TTL)) {
    let real = 0;
    try {
      const o = await measure(key, url, 30000);
      if (o.ok && measured(o.m)) real = providerCents(j.tier, o.m.frames, o.m.w, o.m.h);
    } catch (e) { real = 0; } // قياس المخرج تحسين: تعذّره = نعتمد التقدير
    // بلا قياس لا تصحيح للعدّاد ولا قاطع — المالك يجب أن يعرف أنّ هذه المهمّة سُلّمت بتقديرها وحده.
    if (!real) await note(j.u, 'job ' + id + ' delivered unreconciled (output not measured), estimate ' + j.cap + 'c, request ' + j.req.id);
    if (real > j.cap) {
      try { await kvPipeline([['INCRBY', spentKey(j.capDay), String(real - j.cap)], ['EXPIRE', spentKey(j.capDay), String(OUT_SEC)]]); }
      catch (e) { console.error('[video-enhance] cap not reconciled for ' + id + ': ' + msgOf(e)); }
    }
    if (real >= 3 * j.cap && real - j.cap >= 300) {
      const code = new Date().toISOString();
      try { await kvSetRaw(TRIP_KEY, code, 2592000); } catch (e) { console.error('[video-enhance] trip not saved: ' + msgOf(e)); }
      await note(j.u, 'TRIPPED by job ' + id + ': real ' + real + 'c vs estimate ' + j.cap + 'c. Closed for non-owners; to reopen set VIDEO_ENHANCE_UNTRIP=' + code);
    } else if (real > 1.25 * j.cap) {
      await note(j.u, 'job ' + id + ' cost ' + real + 'c vs estimate ' + j.cap + 'c (' + j.tier + ')');
    }
    try { await require('./cost-meter.js').addCost(j.u, (real || j.cap) / 100, 'media'); } catch (e) { /* guard-ok — القياس لا يوقف خدمة */ }
  } else {
    const v = String((await kvGetRaw(claim)) || '');
    if (v.startsWith('0')) return failJob(id, j, 'settled', 'result arrived after the refund'); // رُدّت قبل وصول النتيجة — لا تسليم فوق ردّ
  }
  // ناتج مدفوع — بروكسي التنزيل لا يعدّه على سقف الوسائط. قبل أيّ جواب يحمل الرابط، ولمن لم ينل المطالبة أيضًا: استطلاع ثانٍ
  // (نافذة أخرى) كان يستلم الرابط وصاحب المطالبة ما زال يقيس المخرج، فيُعدّ تنزيله وسيطًا خارجيًّا. ليس في رأس الدالّة: مهمّة
  // رُدّت قبل وصول نتيجتها لا يُعلَّم رابطها.
  await require('./our-media.js').rememberOurMedia([url]);
  const now = Date.now();
  j.st = 'done'; j.out = url; j.doneAt = now;
  await saveJob(id, j, Math.max(3600, OUT_SEC - Math.floor((now - j.runAt) / 1000)));
  await closeSlot(id, j);
  return donePayload(id, j);
}

/* بعد ٦ ساعات: محاولة إلغاء (أفضل جهد). النقاط تُردّ فقط حين يقول المزوّد إنّ الطلب ما زال مفتوحًا فأُلغي (202) أو لا يعرفه (404)
   — ردّ يُسجَّل خسارةً محتملة — أو حين تمضي نافذة الناتج (٤٨ ساعة من البدء) بلا نتيجة. كلّ جواب آخر («اكتملت أصلًا» 400، 5xx، 429،
   401 بمفتاح بُدّل، انقطاع) ليس دليل فشل: المهمّة تبقى جارية والاستطلاع التالي يجلب النتيجة. التسوية كسولة والواجهة تدعو المستخدم
   للعودة لاحقًا، فأوّل استطلاع بعد ٧ ساعات مسار عاديّ — وخطأ عابر واحد فيه كان يردّ نقاط مهمّة اكتملت ودفعنا ثمنها.
   لا إلغاء قبل ٦ ساعات: مهلة البدء عند المزوّد (٦٠٠ث) تُفشل ما لم يبدأ، والمزوّد يبلّغ. */
async function deadline(id, j, key, extra) {
  const now = Date.now();
  if (!(now - j.runAt > HARD_MS)) return running(id, extra);
  let open = false;
  try {
    const cr = await fetch(qOk(j.req.c) ? j.req.c : reqBase(j) + '/cancel', { method: 'PUT', headers: { Authorization: 'Key ' + key } });
    open = cr.status === 202 || cr.status === 404;
    await discard(cr);
  } catch (e) { open = false; } // الإلغاء أفضل جهد، وتعذّره لا يقول شيئًا عن المهمّة
  if (!open && now - j.runAt < OUT_SEC * 1000) return running(id, extra);
  return failJob(id, j, 'deadline', 'no result after ' + Math.round((now - j.runAt) / 60000) + ' min — possible loss, request ' + j.req.id);
}

/** يدفع مهمّة مدفوعة أو جارية خطوة: يتيم، استطلاع، جلب النتيجة، ثمّ التسوية. يرجع جسم الردّ. */
async function advance(id, j, key) {
  if (!j.req) {
    if (Date.now() - (Number(j.paidAt) || 0) < ORPHAN_MS) return running(id);
    return failJob(id, j, 'orphan', 'paid without a provider request');
  }
  if (!(await kvSetIfAbsent(pollKey(id), '1', POLL_SEC))) return running(id); // استطلاعان متقاربان = نداء مزوّد واحد
  const auth = { headers: { Authorization: 'Key ' + key } };
  const base = reqBase(j);
  let sd = null;
  try {
    const st = await fetch(qOk(j.req.s) ? j.req.s : base + '/status', auth);
    if (st.ok) sd = await st.json();
  } catch (e) { sd = null; } // تعثّر الاستطلاع ليس فشل المهمّة
  if (!sd) return deadline(id, j, key);
  if (sd.status !== 'COMPLETED') return deadline(id, j, key, { queue: sd.queue_position == null ? null : sd.queue_position });
  // المهمّة الفاشلة عند مزوّد الطابور تعود «COMPLETED» مع حقل خطأ — يُفحص قبل الجلب.
  if (sd.error || sd.error_type) return failJob(id, j, 'provider', 'completed with error: ' + msgOf(sd.error_type || sd.error));
  let rr = null;
  let raw = '';
  try {
    rr = await fetch(qOk(j.req.r) ? j.req.r : base, auth);
    raw = await rr.text();
  } catch (e) { return deadline(id, j, key); } // تعثّر جلب النتيجة ليس فشل المهمّة — ردّ النقاط عنده يدفّعنا ثمن مهمّة اكتملت؛ المهلة تحدّه بنافذة الناتج
  let rd = null;
  try { rd = JSON.parse(raw); } catch (e) { rd = null; } // جسم بلا JSON = لا رابط ولا خطأ مُعلن
  const url = rd && rd.video && rd.video.url;
  if (rr.ok && isHttps(url)) return succeed(id, j, url, key);
  const declared = !!rd && (rd.error_type || rd.detail);
  // 429 عابر مهما حمل جسمه (حدّ طلبات لا خطأ مهمّة)؛ و5xx العاري كذلك.
  if (rr.status !== 429 && (rr.ok || declared)) return failJob(id, j, 'result', 'result ' + rr.status + ': ' + (declared ? msgOf(typeof declared === 'string' ? declared : JSON.stringify(declared)) : 'no video url'));
  return deadline(id, j, key);
}

/* خانة «مهمّة واحدة جارية للحساب»: تُرجع معرّف المهمّة إن بقيت جارية بعد دفعها خطوة، وإلّا تفكّ الخانة الميّتة. خانة تشير
   إلى مهمّة لم تُدفع بعد وقفل تأكيدها مأخوذ = تأكيد جارٍ الآن (بين أخذ الخانة وحفظ «مدفوع») فلا تُفكّ من تحته. */
async function settleOpen(user, key) {
  const slot = openKey(user);
  const id = String((await kvGetRaw(slot)) || '');
  if (!id) return '';
  let j = null;
  try { const raw = await kvGetRaw(jobKey(id)); j = raw ? JSON.parse(raw) : null; } catch (e) { if (!(e instanceof SyntaxError)) throw e; j = null; }
  if (j && (j.st === 'paid' || j.st === 'running')) return (await advance(id, j, key)).state === 'running' ? id : '';
  if (j && j.st === 'quoted' && (await kvGetRaw(runKey(id)))) return id;
  await kvDel(slot);
  return '';
}

/** جسم ردّ الحالة لمهمّة مقروءة. */
async function statusOf(id, j, user, key) {
  if (j.st === 'paid' || j.st === 'running') return advance(id, j, key);
  if (j.st === 'done') return donePayload(id, j);
  if (j.st === 'failed') return { ok: true, state: 'failed', id, refunded: Number(j.refunded) || 0 };
  if (j.st === 'quoted') return Object.assign((await quoteOf(id, j, user)).out, { state: 'quoted' });
  return { ok: true, state: 'upload', id };
}
/** يجيب بحالة المهمّة. خطأ عابر (Redis أو المزوّد) = «أعد» دائمًا: مهمّة مدفوعة لا يُقال عنها «فشلت بلا خصم». */
async function sendState(res, id, j, user, key) {
  let out;
  try { out = await statusOf(id, j, user, key); } catch (e) {
    console.error('[video-enhance] state of ' + id + ' unreadable: ' + clean(msgOf(e)));
    return fail(res, 503, 'retry');
  }
  return res.status(200).json(out);
}

// ── الخطوات ──
async function info(req, res, key) {
  const user = sessionUser(tokenOf(req)) || '';
  const t = TIERS[tierKey()];
  let on = false;
  try { on = !!key && (await gate(user)); } catch (e) { on = false; }
  let job = null;
  if (user) {
    // تُرجَع ولو كانت الميزة مغلقة الآن: مهمّة جارية تُسوّى بعد إطفاء المفتاح.
    try { job = (await kvGetRaw(openKey(user))) || (await kvGetRaw(lastKey(user))) || null; } catch (e) { job = null; }
  }
  // tall: هل يُقبل لهذا الحساب مقطع أعلى من 1080 (المالك، أو طبقة تحقّق المالك من سعرها) — الواجهة ترفض غيره قبل الرفع.
  const tall = pointsLib.isOwnerUsername(user) || tallOk(tierKey());
  return res.status(200).json({ ok: true, on, rate: t.pps, minSec: t.minSec, maxSec: MAX_SEC, maxMB: MAX_BYTES / 1048576, tall, job });
}

async function start(req, res, body, user, key) {
  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0) return fail(res, 400, 'bad_request');
  if (size > MAX_BYTES) return fail(res, 413, 'too_big');
  const c = containerOf(body.mime, body.name);
  if (!c) return fail(res, 415, 'format');
  const dur = Math.max(0, Number(body.durationSec) || 0); // إرشاديّة — الحكم للقياس على النسخة المثبّتة
  if (dur > MAX_SEC + GRACE) return fail(res, 413, 'too_long');
  if (!(await gate(user))) return fail(res, 503, 'unavailable');
  const busy = await settleOpen(user, key);
  if (busy) return fail(res, 409, 'busy', { job: busy });
  // الرصيد قبل الرفع لا بعده (الخصم الفعليّ عند التأكيد بالمدّة المقيسة).
  if (!(await isFree(user))) {
    const t = TIERS[tierKey()];
    const need = t.pps * Math.max(t.minSec, Math.ceil(dur - GRACE));
    const rec = await pointsLib.readPoints(user);
    const have = rec ? Number(rec.points) || 0 : 0;
    if (have < need) return fail(res, 402, 'points_insufficient', { needed: need, points: have });
  }
  // حدّ اليوم: 429 limit دائمًا — لا daily_limit_reached ولا 402/403، فبوّابة الباقات لا تعرض ترقية لحدّ لا تفكّه ترقية.
  const usage = require('./_usage.js');
  const ip = usage.clientIp(req);
  const q = await usage.checkAndConsumeCustom(body.token, null, ip, 'video-enhance', DAILY);
  if (!q.allowed) return q.banned ? fail(res, 403, 'banned') : fail(res, q.reason === 'limit' ? 429 : 401, q.reason === 'limit' ? 'limit' : 'auth');
  let id = '';
  let target = null;
  try {
    target = await initiate(key, c.ext, c.ctype, RAW_TTL);
    if (target.up) {
      id = crypto.randomBytes(12).toString('hex');
      await saveJob(id, { u: user, st: 'upload', at: Date.now(), raw: target.file, ctype: c.ctype, ext: c.ext, size }, RAW_TTL);
    }
  } catch (e) { target = { detail: 'start: ' + msgOf(e) }; id = ''; }
  if (!id) {
    await usage.refundCustom(body.token, null, ip, 'video-enhance'); // لم يُدفع شيء بعد — الرفعة تعود لحدّ اليوم
    return failUp(res, user, target.detail || 'start: no upload target');
  }
  // المتصفّح يرفع بهذا النوع حرفيًّا؛ رابط القراءة يبقى في الخادم.
  return res.status(200).json({ ok: true, id, upload: target.up, mime: c.ctype });
}

/* التثبيت والقياس: من حالة «رفع» وحدها وتحت قفل، والكتابة الوحيدة الناجحة هي «مسعَّر». الرفض يحذف المهمّة بلا خصم.
   النسخ (ملفّ حتّى ٨٠ م.ب في الذاكرة مرّتين) تحت قفل ثانٍ للحساب: نسخة واحدة في المرّة — حساب واحد كان يشغّل رفعاته العشر معًا
   بلا نقطة واحدة. يؤخذ قبل عدّ المحاولة: انتظار نسخة الحساب الأخرى لا يأكل محاولات المهمّة. */
async function pinAndQuote(res, user, key, id) {
  if (!(await kvSetIfAbsent(measKey(id), '1', MEAS_LOCK_SEC))) return fail(res, 503, 'retry');
  let held = false;
  try {
    const t0 = Date.now();
    const got = await readJob(id, user); // تحت القفل: نداء سابق ربّما سعّرها أو أُكّدت في الأثناء — لا كتابة فوق سجلّ أحدث
    if (got.err) return fail(res, got.err[0], got.err[1]);
    const j = got.j;
    if (j.st === 'quoted') return res.status(200).json((await quoteOf(id, j, user)).out);
    if (j.st !== 'upload') return sendState(res, id, j, user, key);
    const drop = async (status, code) => { await kvDel(jobKey(id)); return fail(res, status, code); };
    const left = () => Math.max(60, RAW_TTL - Math.floor((Date.now() - j.at) / 1000));
    if (!j.pin) {
      if (!(await kvSetIfAbsent(pinKey(user), id, MEAS_LOCK_SEC))) return fail(res, 503, 'retry');
      held = true;
    }
    j.tries = (Number(j.tries) || 0) + 1;
    if (j.tries > MAX_TRIES) return drop(409, 'not_uploaded');
    await saveJob(id, j, left());

    if (!j.pin) {
      let r;
      try { r = await fetch(j.raw, { signal: AbortSignal.timeout(60000) }); } catch (e) { return fail(res, 503, 'retry'); }
      if (r.status === 403 || r.status === 404) { await discard(r); return fail(res, 409, 'not_uploaded'); }
      if (!r.ok) { await discard(r); return fail(res, 503, 'retry'); }
      if (Number(r.headers.get('content-length')) > MAX_BYTES) { await discard(r); return drop(413, 'too_big'); }
      let buf;
      try { buf = await readCapped(r, MAX_BYTES); } catch (e) { return fail(res, 503, 'retry'); }
      if (!buf) return drop(413, 'too_big');
      if (!sniff(buf)) return drop(415, 'format');
      let pin;
      try { pin = await initiate(key, j.ext, j.ctype, PIN_TTL); } catch (e) { return fail(res, 503, 'retry'); }
      if (!pin.up) return pin.status >= 400 && pin.status < 500 ? failUp(res, user, 'pin ' + pin.detail) : fail(res, 503, 'retry');
      let pr;
      try { pr = await fetch(pin.up, { method: 'PUT', headers: { 'Content-Type': j.ctype }, body: buf, signal: AbortSignal.timeout(90000) }); } catch (e) { return fail(res, 503, 'retry'); }
      if (!pr.ok) return pr.status >= 400 && pr.status < 500 ? failUp(res, user, await upText('pin-put', pr)) : fail(res, 503, 'retry');
      // رابط الكتابة في النسخة المثبّتة لا يُحفظ ولا يُرجَع ولا يُسجَّل؛ والهدف الخام يُنسى.
      j.pin = pin.file; j.raw = null;
      await saveJob(id, j, left());
      if (Date.now() - t0 > 150000) return fail(res, 503, 'retry'); // النداء التالي يقيس فقط
    }

    let o;
    try { o = await measure(key, j.pin, 60000); } catch (e) { o = { ok: false, status: 0 }; }
    if (!o.ok) { console.warn('[video-enhance] measure failed (' + o.status + ') for ' + id); return fail(res, 503, 'retry'); }
    const m = o.m;
    if (!measured(m)) return drop(415, 'format'); // لا تقدير بديل: بلا عدد إطارات لا سعر
    if (m.dur > MAX_SEC + GRACE) return drop(413, 'too_long');
    if (m.frames > 30.5 * m.dur + 2) return drop(422, 'fps');
    if (!(factorFor(m.w, m.h, pointsLib.isOwnerUsername(user) || tallOk(tierKey())) >= 1)) return drop(422, 'resolution');
    j.m = { dur: m.dur, frames: m.frames, w: m.w, h: m.h }; j.st = 'quoted'; j.qAt = Date.now();
    await saveJob(id, j, QUOTE_TTL);
    return res.status(200).json((await quoteOf(id, j, user)).out);
  } finally {
    if (held) await kvDel(pinKey(user));
    await kvDel(measKey(id));
  }
}

/* بعد الخصم: فشل الإرسال (أو حفظ «مدفوع») ينهي المهمّة — ردّ واحد بالمطالبة نفسها التي يستعملها الاستطلاع، ولا إرسال ثانٍ.
   حجز السقف يُفكّ فقط حين رفض المزوّد صراحةً (4xx)؛ المهلة والانقطاع و5xx قد تكون قُبلت فيبقى. لا يرمي. */
async function undoPaid(res, user, id, j, f) {
  let out = null;
  try { out = await failJob(id, j, f.why, f.detail); } catch (e) {
    try { await saveJob(id, j, PAID_TTL); } catch (e2) { /* guard-ok — قاعدة اليتيم تردّ إن كان السجلّ المدفوع محفوظًا */ }
    await note(user, 'job ' + id + ' undo interrupted, ' + j.paid + ' points pending refund: ' + msgOf(e));
  }
  if (!out || out.state !== 'failed') return res.status(200).json(running(id)); // الردّ لم يقع بعد — قاعدة اليتيم تعيده
  if (f.definitive) await releaseCap(j.capDay, j.cap, j.nosub);
  const outage = f.status === 429 || OUTAGE_RE.test(f.detail);
  return fail(res, outage ? 503 : 502, outage ? 'unavailable' : 'failed', Object.assign({ refunded: j.paid }, pointsLib.isOwnerUsername(user) ? { __diag: clean(f.detail) } : {}));
}

async function confirm(res, body, user, key, id, first) {
  if (!(await gate(user))) return fail(res, 503, 'unavailable');
  const q = await quoteOf(id, first, user);
  if (!(q.factor >= 1)) { await kvDel(jobKey(id)); return fail(res, 422, 'resolution'); } // إذن المخرج الطوليّ سُحب بعد العرض
  // التكلفة التي وافق عليها المستخدم يجب أن تطابق الحاليّة (الطبقة قد تبدّلت): عرض جديد بلا خصم.
  if (Number(body.cost) !== q.cost) return res.status(200).json(Object.assign(q.out, { changed: true }));
  const other = await settleOpen(user, key); // قبل أيّ قفل
  if (other) return fail(res, 409, 'busy', { job: other });
  // الرصيد يُقرأ قبل أيّ حجز (بعد settleOpen: ردّ وقع للتوّ يُحسب): حساب لا يملك الثمن كان يحجز من سقف اليوم ثمّ يُرفض، فيغلق
  // الميزة على غيره طوال نداءاته بلا نقطة. قراءة فقط — الحكم عند السباق يبقى لـspendPoints.
  if (q.cost > 0) {
    const rec = await pointsLib.readPoints(user);
    const have = rec ? Number(rec.points) || 0 : 0;
    if (have < q.cost) return fail(res, 402, 'points_insufficient', { needed: q.cost, points: have });
  }
  if (!(await kvSetIfAbsent(runKey(id), '1', RUN_LOCK_SEC))) return fail(res, 409, 'busy', { job: id });
  try {
    const got = await readJob(id, user);
    if (got.err) return fail(res, got.err[0], got.err[1]);
    const j = got.j;
    if (j.st !== 'quoted') return sendState(res, id, j, user, key);
    const slot = openKey(user);
    if (!(await kvSetIfAbsent(slot, id, PAID_TTL))) return fail(res, 409, 'busy', { job: String((await kvGetRaw(slot)) || id) });

    // ١) حجز من سقف اليوم قبل الخصم. غير المشترك يُحجز له أيضًا من خُمسه. ما زاد يُردّ والخانة تُفكّ.
    const day = new Date().toISOString().slice(0, 10);
    const cap = capCents();
    const nosub = !(await require('./_qualityGate.js').allowHigh(user));
    let over = true;
    try {
      const cmds = [['INCRBY', spentKey(day), String(q.est)], ['EXPIRE', spentKey(day), String(OUT_SEC)]];
      if (nosub) cmds.push(['INCRBY', freeKey(day), String(q.est)], ['EXPIRE', freeKey(day), String(OUT_SEC)]);
      const r = await kvPipeline(cmds);
      const total = r[0] == null ? NaN : Number(r[0]);
      const free = !nosub ? 0 : (r[2] == null ? NaN : Number(r[2]));
      if (!Number.isFinite(total) || !Number.isFinite(free)) throw new Error('cap counter unreadable');
      over = total > cap || (nosub && free > Math.floor(cap * FREE_SHARE));
      if (over) await releaseCap(day, q.est, nosub);
    } catch (e) {
      console.error('[video-enhance] cap reservation failed: ' + msgOf(e)); // تعذّر العدّ = لا صرف على عمًى
      over = true;
    }
    if (over) { await kvDel(slot); return fail(res, 503, 'unavailable'); }

    // ٢) النقاط — بالنقاط وحدها: السبب خارج جدول الوسائط فلا يُصرف من رصيد اشتراك.
    let pay = null;
    try { pay = await pointsLib.spendPoints(user, q.cost, 'video_enhance'); } catch (e) { pay = { ok: false, reason: 'error' }; }
    if (pay.ok && !pay.owner && !(q.cost > 0)) pay = { ok: false, reason: 'changed' }; // الإعفاء سقط بين العرض والخصم — لا مهمّة بلا ثمن
    if (!pay.ok) {
      await releaseCap(day, q.est, nosub);
      await kvDel(slot);
      if (pay.banned) return fail(res, 403, 'banned');
      if (pay.reason === 'insufficient') return fail(res, 402, 'points_insufficient', { needed: q.cost, points: Number(pay.points) || 0 });
      return fail(res, 503, 'unavailable');
    }

    // ٣) من هنا لا رجوع إلى «مسعَّر»: «مدفوع» يُحفظ قبل الإرسال فلا إرسال ثانٍ أبدًا، والطبقة تُجمَّد في السجلّ.
    Object.assign(j, { st: 'paid', paid: pay.owner ? 0 : q.cost, paidAt: Date.now(), tier: q.tk, sec: q.sec, cost: q.cost, factor: q.factor, cap: q.est, capDay: day, nosub, ou: user });
    let sub = null;
    try {
      await saveJob(id, j, PAID_TTL);
      sub = await submit(key, j);
    } catch (e) { sub = { fail: { why: 'paid-save', detail: 'paid: ' + msgOf(e), status: 0, definitive: false } }; }
    if (sub.fail) return await undoPaid(res, user, id, j, sub.fail);
    j.st = 'running'; j.req = sub.req; j.runAt = Date.now();
    try { await saveJob(id, j, PAID_TTL); } catch (e) {
      try { await saveJob(id, j, PAID_TTL); } catch (e2) {
        // السجلّ بقي «مدفوعًا» بلا طلب: قاعدة اليتيم ستردّ النقاط والنتيجة لن تُجلب أبدًا — نحاول إلغاء الطلب وهو في الطابور (يُحذف
        // هناك قبل أن يُعالَج ويُحاسَب). أفضل جهد: تعذّره يترك كلّ شيء كما كان.
        let cx = 'error';
        try {
          const cr = await fetch(sub.req.c, { method: 'PUT', headers: { Authorization: 'Key ' + key }, signal: AbortSignal.timeout(10000) });
          cx = String(cr.status);
          await discard(cr);
        } catch (e3) { cx = 'error'; }
        await note(user, 'job ' + id + ' accepted as request ' + sub.req.id + ' but not saved as running (cancel ' + cx + '): ' + msgOf(e2));
      }
    }
    return res.status(200).json({ ok: true, state: 'running', id, cost: j.paid, points: Number.isFinite(pay.points) ? pay.points : null });
  } finally {
    await kvDel(runKey(id));
  }
}

async function run(req, res, body, user, key) {
  const got = await readJob(body.id, user);
  if (got.err) return fail(res, got.err[0], got.err[1]);
  const id = String(body.id);
  const j = got.j;
  // ما بعد الخصم يُجاب كالاستطلاع تمامًا (ولو أُوقفت الميزة): تأكيد مكرَّر لا يخصم ولا يرسل ثانيةً.
  if (j.st !== 'upload' && j.st !== 'quoted') return sendState(res, id, j, user, key);
  if (j.st === 'quoted' && body.confirmed === true) return confirm(res, body, user, key, id, j);
  if (!(await gate(user))) return fail(res, 503, 'unavailable');
  if (j.st === 'upload') return pinAndQuote(res, user, key, id);
  const q = await quoteOf(id, j, user);
  if (!(q.factor >= 1)) { await kvDel(jobKey(id)); return fail(res, 422, 'resolution'); }
  return res.status(200).json(q.out);
}

async function status(req, res, body, user, key) {
  const got = await readJob(body.id, user);
  if (got.err) return fail(res, got.err[0], got.err[1]);
  return sendState(res, String(body.id), got.j, user, key);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const step = String((req.query && req.query.step) || '');
  const key = falKey();
  // info تُقرأ بـGET عند فتح التبويب (أيّ POST إلى هذا الموجّه يفتح شريط طلب الإشعارات في الواجهة) والرمز من الترويسة.
  if (step === 'info') return info(req, res, key);
  if (req.method !== 'POST') return fail(res, 405, 'method');
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  // الهويّة من رمز جلسة حقيقيّ وحده (exp صارم) — لا اسم مستخدم ولا رابط فيديو من العميل.
  const user = sessionUser(body.token);
  if (!user) return fail(res, 401, 'auth');
  if (!key) return fail(res, 503, 'unavailable');
  try {
    if (step === 'status') return await status(req, res, body, user, key);
    if (step === 'start') return await start(req, res, body, user, key);
    if (step === 'run') return await run(req, res, body, user, key);
    return fail(res, 400, 'bad_request');
  } catch (e) {
    // لا يصل هنا شيء بعد الخصم: ما بعده داخل confirm لا يرمي، وحالة مهمّة مدفوعة تُجاب بـsendState («أعد» لا «فشل»).
    if (step === 'status') { console.error('[video-enhance] status error: ' + clean(msgOf(e))); return fail(res, 503, 'retry'); }
    return failUp(res, user, step + ': ' + msgOf(e));
  }
};
Object.assign(module.exports, {
  TIERS, CREDIT_CENTS, MAX_SEC, GRACE, MAX_SAMPLES, MAX_BYTES, DAILY, FREE_SHARE, RAW_TTL, PIN_TTL, QUOTE_TTL, OUT_SEC, HARD_MS, ORPHAN_MS,
  tierKey, mode, capCents, tallOk, billedSec, factorFor, fpcFor, providerCents, sniff, containerOf,
});
