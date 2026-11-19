'use strict';
/* v-director-erase (طلب المالك ١١ نوفمبر: كتابة محروقة في فيديو مرفوع تُمسح قبل نشره): «امسح اسم أو كتابة» في مخرج التطبيق — المالك
   وحده يرسم مربّعات على لقطة، وخيار «بالذكاء» يرسل شريطًا حولها إلى نموذج ترميم فيديو عند المزوّد بمفتاح FAL_KEY نفسه (سعر ثابت
   ٥ سنتات للطلب أيًّا كان طوله). المتصفّح يقطّع الشريط مقاطع ≤ ١٩٧ إطارًا H.264 ويصنع لكلّ طول قناعًا (الأسود يُمسح، الأبيض يبقى)،
   ويرفع الملفّات مباشرة إلى أهداف مؤقّتة عند مزوّد التخزين (حدّ جسم الدالّة ٤٫٥MB)؛ والخادم يرسل ويتابع:
     start  ← يتحقّق من الملفّات والمقاطع، ويقرأ سقف اليوم (بلا حجز)، ثمّ هدف رفع لكلّ ملفّ؛ روابط القراءة تبقى في KV ولا تُرسل.
     submit ← قفل، ثمّ وجود كلّ ملفّ (بلا صرف)، ثمّ حجز ذرّيّ من سقف اليوم، ثمّ «يُرسل» يُحفظ قبل أيّ إرسال فلا يُعاد الإرسال أبدًا،
              ثمّ المقاطع معًا: مقبول · مرفوض صراحةً (4xx — يُفكّ حجزه) · مجهول (مهلة، 5xx، انقطاع — يبقى حجزه: ربّما قُبل).
     status ← استطلاع المقاطع الجارية (قفل ٣ ث)، والناتج روابط CDN يجلبها المتصفّح عبر /api/video-download؛ مقطع تجاوز ساعة يُلغى.
   بلا نقاط ولا حصّة يوميّة (المالك وحده): السقف اليوميّ VIDEO_ERASE_CAP_CENTS يحمي رصيد المزوّد المشترك مع التحسين والاحتياط والتبديل.
   لا رمز من رموز بوّابة الباقات (app-33) في أيّ ردّ. المفتاح يُقرأ داخل المعالج، ولا مفتاح ولا رابط قراءة في ردّ أو سجلّ. */
const crypto = require('node:crypto');
const { kvGetRaw, kvSetRaw, kvSetIfAbsent, kvDel, kvPipeline } = require('./kv.js');
const { sessionUser, tokenOf } = require('./_session.js');
const { isOwnerName } = require('./_owner.js');

// النموذج وسعره معًا: الطلب بسعر ثابت. المرحلة الثانية تضاعفه (enable_pass2_refinement دائمًا false)، وmask_prompt يضيف نموذج تقطيع
// مدفوعًا (لا يُرسل أبدًا: القناع منّا).
const MODEL = 'fal-ai/void-video-inpainting';
const CENTS = 5;
const QUEUE = 'https://queue.fal.run/';
const APP = MODEL.split('/').slice(0, 2).join('/'); // روابط الحالة والنتيجة والإلغاء على «المالك/التطبيق» وحدهما — بالمسار الفرعيّ 405
const INITIATE = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
const CTYPE = 'video/mp4';
// يصف المشهد بعد المسح لا المسح نفسه (توثيق النموذج)، وبالإنجليزيّة (مرمّز النصّ T5).
const PROMPT = 'The same scene, clean and natural, with no text, captions, subtitles, logos or watermarks anywhere in the frame.';
const MIN_FRAMES = 69;
const MAX_FRAMES = 197; // num_frames الصالحة: ٦٩، ٧٧ … ١٩٧ (8k−3)
const MAX_CHUNKS = 30;  // ١٫٥٠$ للمهمّة على الأكثر
const MAX_FILES = 32;   // المقاطع + قناع لكلّ طول (الواجهة: مقاطع ١٩٧ والأخير أقصر = قناعان)
const MAX_BYTES = 50 * 1024 * 1024;
const FILE_TTL = 10800;  // ملفّات الرفع عند المزوّد ٣ ساعات: سجلّ الرفع ساعتان + مهلة البدء + التشغيل — لا يُحذف مُدخل قبل أن يبدأ مقطعه
const UPLOAD_TTL = 7200; // سجلّ المهمّة قبل الإرسال
const JOB_TTL = 86400;   // بعد الإرسال: يوم
const OUT_TTL = 86400;   // نواتج المقاطع عند المزوّد: يوم
// ربع ساعة للبدء (الطابور خلف حدّ تزامن الحساب، ومنه الإقلاع البارد) + ربع ساعة أقصى تشغيل للنموذج = نصف ساعة، وهي انتظار الواجهة:
// المقطع الذي لم يبدأ يفشل عند المزوّد بلا محاسبة، فلا مقطع مدفوع يكتمل بعد أن تتركه الواجهة.
const START_SEC = 900;
const HOUR_MS = 3600 * 1000;
const ORPHAN_MS = 330000; // «يُرسل» بلا نتيجة محفوظة بعد هذا = انقطع نداء الإرسال (مهلة الدالّة ٣٠٠ث): مقاطعه مجهولة
const RUN_LOCK_SEC = 300;
const POLL_SEC = 3;
const SPENT_TTL = 172800;
const LANES = 8;
const CAP_DEFAULT = 200;
const FINAL = new Set(['done', 'failed', 'rejected', 'unknown']);
const SAFETY_RE = /content[_ ]policy|flagged|nsfw|content checker/i;

const jobKey = (id) => 'verase:' + id;
const runKey = (id) => 'verase:run:' + id;
const pollKey = (id) => 'verase:poll:' + id;
const spentKey = (day) => 'verase:spent:' + day;

const fail = (res, status, error, extra) => res.status(status).json(Object.assign({ ok: false, error }, extra || {}));
const msgOf = (e) => String((e && e.message) || e || 'unknown').replace(/\s+/g, ' ').slice(0, 200);
const isHttps = (u) => typeof u === 'string' && u.startsWith('https://');
const qOk = (u) => typeof u === 'string' && u.startsWith(QUEUE + APP + '/requests/');
const today = () => new Date().toISOString().slice(0, 10);
const falKey = () => String(process.env.FAL_KEY || '').trim();

/** سقف صرف اليوم بالسنت (يوم UTC)؛ الصفر يغلق الميزة (للمالك أيضًا)، وقيمة غير صالحة = البديل. */
function capCents() {
  const raw = process.env.VIDEO_ERASE_CAP_CENTS === undefined ? '' : String(process.env.VIDEO_ERASE_CAP_CENTS).trim();
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : CAP_DEFAULT;
}

/** أصغر عدد إطارات يقبله النموذج ولا يقلّ عن طول المقطع: النافذة لا تقصّ مقطعًا أبدًا (القصير يُكمَّل وتقصّه الواجهة). */
function snap(frames) {
  const f = Math.max(1, Math.min(MAX_FRAMES, Math.ceil(Number(frames) || 1)));
  return f <= MIN_FRAMES ? MIN_FRAMES : MIN_FRAMES + 8 * Math.ceil((f - MIN_FRAMES) / 8);
}

// ── السجلّ: كلّ رابط يصير [url] والمفتاح لا يُكتب أبدًا ──
function clean(s) {
  let t = String(s || '').replace(/https?:\/\/[^\s\x22\x27<>)\]}]+/gi, '[url]').replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, '[data]');
  const k = falKey();
  if (k) t = t.split(k).join('[key]');
  return t.replace(/\s+/g, ' ').trim().slice(0, 400);
}
const diag = (user, text) => (isOwnerName(user) && text ? { __diag: clean(text) } : {});
async function note(user, detail) {
  const d = clean(detail);
  console.error('[video-erase] ' + d);
  try { await require('./log-error.js').logErrorAndFlush('video-erase', new Error(d), { action: 'video-erase', user: String(user || '').slice(0, 40) }); } catch (e) { require('./_swallow.js').swallow(e, '_lib/video-erase:note'); /* guard-ok — التسجيل تحسين لا شرط */ }
}
async function upText(step, r) {
  let msg = '';
  try {
    const raw = await r.text();
    try { const d = JSON.parse(raw); const x = d && (d.detail || d.error || d.message); msg = typeof x === 'string' ? x : (x ? JSON.stringify(x) : raw); } catch (e2) { msg = raw; }
  } catch (e) { msg = ''; }
  return step + ' ' + r.status + (msg ? ': ' + String(msg).replace(/\s+/g, ' ').slice(0, 200) : '');
}
const discard = async (r) => { try { if (r && r.body) await r.body.cancel(); } catch (e) { require('./_swallow.js').swallow(e, '_lib/video-erase:discard'); /* guard-ok — إغلاق الجسم أفضل جهد */ } };

/** fn على كلّ عنصر، حتّى n في المرّة، والنتائج بترتيبها. */
async function lanes(list, n, fn) {
  const out = new Array(list.length);
  let next = 0;
  const lane = async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, lane));
  return out;
}

/* ── الطلب: الملفّات (حجم ونوع) والمقاطع (فهرس الفيديو وفهرس قناعه وعدد إطاراته). كلّ ملفّ مستعمل، ودوره واحد (فيديو أو قناع)،
   ولا مقطع قناعُه نفسُه. { files, chunks:[{v,m,f}] } أو { err:[حالة، رمز، إضافة] }. ── */
function planOf(body) {
  const files = Array.isArray(body.files) ? body.files : null;
  const chunks = Array.isArray(body.chunks) ? body.chunks : null;
  const bad = { err: [400, 'bad_request'] };
  if (!files || !chunks || !files.length || !chunks.length) return bad;
  if (chunks.length > MAX_CHUNKS) return { err: [413, 'too_long', { maxChunks: MAX_CHUNKS }] };
  if (files.length > MAX_FILES) return bad;
  for (const f of files) {
    if (!f || typeof f !== 'object' || !Number.isInteger(f.size) || f.size <= 0) return bad;
    if (f.size > MAX_BYTES) return { err: [413, 'too_big', { maxMB: MAX_BYTES / 1048576 }] };
    if (String(f.type || '').toLowerCase().split(';')[0].trim() !== CTYPE) return { err: [415, 'format'] };
  }
  const role = new Array(files.length).fill('');
  const out = [];
  for (const c of chunks) {
    if (!c || typeof c !== 'object' || ![c.v, c.m, c.frames].every(Number.isInteger)) return bad;
    const { v, m, frames } = c;
    if (v < 0 || m < 0 || v >= files.length || m >= files.length || v === m || frames < 1 || frames > MAX_FRAMES) return bad;
    if ((role[v] && role[v] !== 'v') || (role[m] && role[m] !== 'm')) return bad;
    role[v] = 'v'; role[m] = 'm';
    out.push({ v, m, f: frames });
  }
  if (role.some((r) => !r)) return bad;
  return { files: files.length, chunks: out };
}

// ── المهمّة ──
const saveJob = (id, j, ttl) => kvSetRaw(jobKey(id), JSON.stringify(j), ttl);
/** { j } لصاحبها، أو { err:[حالة، رمز] }. تعذّر القراءة = retry لا not_found: عطل عابر لا يُضيع مهمّة مدفوعة. */
async function readJob(id, user) {
  if (!/^[a-f0-9]{24}$/.test(String(id || ''))) return { err: [404, 'not_found'] };
  let raw;
  try { raw = await kvGetRaw(jobKey(id)); } catch (e) { return { err: [503, 'retry'] }; }
  let j = null;
  try { j = raw ? JSON.parse(raw) : null; } catch (e) { j = null; } // سجلّ مشوّه = لا مهمّة
  if (!j || typeof j !== 'object' || j.u !== user || !Array.isArray(j.files) || !Array.isArray(j.chunks)) return { err: [404, 'not_found'] };
  return { j };
}
/** جسم ردّ الحالة من السجلّ وحده (بلا نداء مزوّد). «يُرسل» = المقاطع في الطريق، وبعد مهلة الدالّة مجهولة. */
function view(id, j) {
  if (j.st === 'upload') return { ok: true, id, state: 'upload', chunks: [], cents: 0 };
  const lost = j.st === 'sending' && Date.now() - (Number(j.sentAt) || 0) > ORPHAN_MS;
  const chunks = j.chunks.map((c, i) => {
    const st = j.st === 'sending' ? (lost ? 'unknown' : 'running') : String(c.st || 'unknown');
    const o = { i, state: st };
    if (st === 'done') o.url = c.url;
    else if (st !== 'running' && c.why) o.why = c.why;
    return o;
  });
  const n = (s) => chunks.filter((c) => c.state === s).length;
  const state = n('running') ? 'running' : (n('done') === chunks.length ? 'done' : (n('done') ? 'partial' : 'failed'));
  return { ok: true, id, state, chunks, cents: Number(j.cents) || 0 };
}

// ── المزوّد ──
/** هدف رفع بعمر محدّد واسم عشوائيّ ← { up, file } أو { status, detail }. لا يرمي. */
async function initiate(key) {
  const life = JSON.stringify({ expiration_duration_seconds: FILE_TTL });
  try {
    const r = await fetch(INITIATE, {
      method: 'POST',
      // التوثيق يسمّي الترويسة بالاسم الثاني والعميل الرسميّ بالأوّل — نرسل الاثنتين (كالتحسين والنشر).
      headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json', 'X-Fal-Object-Lifecycle': life, 'X-Fal-Object-Lifecycle-Preference': life },
      body: JSON.stringify({ file_name: 'er-' + crypto.randomBytes(8).toString('hex') + '.mp4', content_type: CTYPE }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return { status: r.status, detail: await upText('initiate', r) };
    const d = await r.json().catch(() => ({}));
    if (!d || !isHttps(d.upload_url) || !isHttps(d.file_url)) return { status: 502, detail: 'initiate: no upload target' };
    return { up: d.upload_url, file: d.file_url };
  } catch (e) { return { status: 0, detail: 'initiate: ' + msgOf(e) }; }
}
/** هل رُفع الملفّ؟ بايت واحد بلا مفتاح (الملفّ عامّ) ← ok · missing (403/404/416) · retry (غير ذلك). لا يرمي. */
async function present(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15000) });
    await discard(r);
    if (r.status === 403 || r.status === 404 || r.status === 416) return 'missing';
    return r.ok ? 'ok' : 'retry';
  } catch (e) { return 'retry'; } // انقطاع ليس «لم يُرفع»: يُعاد بلا صرف
}
/** سبب قصير ثابت لفشل الإرسال — تفصيل المزوّد للسجلّ و__diag وحدهما. */
function sendWhy(status, detail) {
  if (!status) return /timeout|timed out|abort/i.test(detail) ? 'timeout' : 'network';
  if (status === 429) return 'limit';
  if (require('./fal-fallback.js').falCreditOut(status, detail)) return 'unavailable';
  if (status === 408 || status === 504) return 'timeout';
  return status >= 500 || status < 400 ? 'server' : 'input';
}
/** يرسل مقطعًا لطابور المزوّد ← { req:{id,s,r,c} } أو { fail:{status, detail, definitive} }. لا يرمي.
    definitive = رفض 4xx صريح (لم يُقبل قطعًا)؛ المهلة والانقطاع و5xx و408 قد تكون قُبلت. */
async function send(key, j, c) {
  let r;
  try {
    r = await fetch(QUEUE + MODEL, {
      method: 'POST',
      headers: {
        Authorization: 'Key ' + key, 'Content-Type': 'application/json',
        'X-Fal-Object-Lifecycle-Preference': JSON.stringify({ expiration_duration_seconds: OUT_TTL }),
        'X-Fal-Request-Start-Timeout': String(START_SEC), 'X-Fal-No-Retry': '1', 'x-app-fal-disable-fallback': 'true',
      },
      body: JSON.stringify({ video_url: j.files[c.v], quad_mask_video_url: j.files[c.m], prompt: PROMPT, num_frames: snap(c.f), enable_pass2_refinement: false }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) { return { fail: { status: 0, detail: 'submit: ' + msgOf(e), definitive: false } }; }
  if (!r.ok) return { fail: { status: r.status, detail: await upText('submit', r), definitive: r.status >= 400 && r.status < 500 && r.status !== 408 } };
  const d = await r.json().catch(() => ({}));
  const rid = String((d && d.request_id) || '');
  if (!/^[\w-]{8,80}$/.test(rid)) return { fail: { status: r.status, detail: 'submit ' + r.status + ': no request id', definitive: false } };
  // روابط المزوّد تُستعمل فقط إن كانت على طابوره وبمسار التطبيق — وإلّا تُبنى من المعرّف (المفتاح لا يُرسل لمضيف آخر).
  const base = QUEUE + APP + '/requests/' + rid;
  return { req: { id: rid, s: qOk(d.status_url) ? d.status_url : base + '/status', r: qOk(d.response_url) ? d.response_url : base, c: qOk(d.cancel_url) ? d.cancel_url : base + '/cancel' } };
}
/** إلغاء أفضل جهد ← الحالة أو 0. لا يرمي. */
async function cancel(key, req) {
  try {
    const r = await fetch(qOk(req.c) ? req.c : QUEUE + APP + '/requests/' + req.id + '/cancel', { method: 'PUT', headers: { Authorization: 'Key ' + key }, signal: AbortSignal.timeout(10000) });
    await discard(r);
    return r.status;
  } catch (e) { return 0; } // تعذّر الإلغاء لا يغيّر الحكم: المقطع تجاوز مدّته
}

// ── سقف اليوم ──
async function release(day, cents) {
  if (!(cents > 0)) return;
  try { await kvPipeline([['DECRBY', spentKey(day), String(cents)], ['EXPIRE', spentKey(day), String(SPENT_TTL)]]); }
  catch (e) { console.error('[video-erase] cap release failed (reservation kept): ' + msgOf(e)); }
}

// ── الخطوات ──
async function start(res, body, user, key) {
  const p = planOf(body);
  if (p.err) return fail(res, p.err[0], p.err[1], p.err[2]);
  const cents = p.chunks.length * CENTS;
  const cap = capCents();
  let spent;
  try { spent = Number((await kvGetRaw(spentKey(today()))) || 0); } catch (e) { return fail(res, 503, 'retry'); }
  if (!Number.isFinite(spent)) spent = cap; // عدّاد لا يُقرأ = لا صرف على عمًى
  if (spent + cents > cap) return fail(res, 503, 'cap', { left: Math.max(0, cap - spent) });
  const got = await lanes(new Array(p.files).fill(0), LANES, () => initiate(key));
  const bad = got.find((t) => !t.up);
  if (bad) {
    await note(user, bad.detail);
    if (!bad.status || bad.status === 429 || bad.status >= 500) return fail(res, 503, 'retry', diag(user, bad.detail));
    const out = require('./fal-fallback.js').falCreditOut(bad.status, bad.detail);
    return fail(res, out ? 503 : 502, out ? 'unavailable' : 'failed', diag(user, bad.detail));
  }
  const id = crypto.randomBytes(12).toString('hex');
  try { await saveJob(id, { u: user, st: 'upload', at: Date.now(), files: got.map((t) => t.file), chunks: p.chunks }, UPLOAD_TTL); }
  catch (e) { return fail(res, 503, 'retry'); }
  // المتصفّح يرفع إلى رابط الكتابة بهذا النوع حرفيًّا؛ رابط القراءة يبقى في الخادم.
  return res.status(200).json({ ok: true, id, ups: got.map((t) => ({ put: t.up, ctype: CTYPE })), cents });
}

async function submit(res, body, user, key) {
  const id = String(body.id || '');
  const first = await readJob(id, user);
  if (first.err) return fail(res, first.err[0], first.err[1]);
  if (first.j.st !== 'upload') return res.status(200).json(view(id, first.j)); // أُرسلت: حالتها، ولا إرسال ثانٍ
  let locked = false;
  try { locked = await kvSetIfAbsent(runKey(id), '1', RUN_LOCK_SEC); } catch (e) { return fail(res, 503, 'retry'); }
  if (!locked) return fail(res, 409, 'busy');
  try {
    const got = await readJob(id, user); // تحت القفل: نداء سابق ربّما أرسلها للتوّ — لا كتابة فوق سجلّ أحدث
    if (got.err) return fail(res, got.err[0], got.err[1]);
    const j = got.j;
    if (j.st !== 'upload') return res.status(200).json(view(id, j));

    // ١) كلّ ملفّ رُفع فعلًا — قبل أيّ حجز: مقطع بملفّ غائب يرفضه المزوّد وقد يحاسب عليه.
    const seen = await lanes(j.files, LANES, present);
    const missing = seen.map((s, i) => (s === 'missing' ? i : -1)).filter((i) => i >= 0);
    if (missing.length) return fail(res, 409, 'not_uploaded', { missing });
    if (seen.includes('retry')) return fail(res, 503, 'retry');

    // ٢) حجز ذرّيّ من سقف اليوم: INCRBY ومدّته في نداء واحد، وما زاد على السقف يُردّ. تعذّر العدّ = لا صرف على عمًى.
    const day = today();
    const cents = j.chunks.length * CENTS;
    const cap = capCents();
    let total = NaN;
    try {
      const r = await kvPipeline([['INCRBY', spentKey(day), String(cents)], ['EXPIRE', spentKey(day), String(SPENT_TTL)]]);
      total = r[0] == null ? NaN : Number(r[0]);
    } catch (e) {
      await note(user, 'job ' + id + ' cap reservation failed: ' + msgOf(e));
      return fail(res, 503, 'retry');
    }
    if (!Number.isFinite(total)) return fail(res, 503, 'retry'); // الأمر أخطأ داخل نداء أجاب (null): لم يُزَد شيء
    if (total > cap) { await release(day, cents); return fail(res, 503, 'cap', { left: Math.max(0, cap - (total - cents)) }); }

    // ٣) من هنا لا رجوع إلى «رفع»: «يُرسل» يُحفظ قبل الإرسال، فأيّ نداء بعده (إعادة، نافذة ثانية) يجد الحالة ولا يرسل ثانيةً.
    Object.assign(j, { st: 'sending', sentAt: Date.now(), day, cents });
    try { await saveJob(id, j, JOB_TTL); } catch (e) { await release(day, cents); return fail(res, 503, 'retry'); }

    // ٤) المقاطع معًا. المرفوض صراحةً يُفكّ حجزه، والمجهول يبقى (ربّما قُبل وحوسب).
    const outs = await lanes(j.chunks, LANES, (c) => send(key, j, c));
    const now = Date.now();
    const lines = [];
    let rejected = 0;
    outs.forEach((o, i) => {
      const c = j.chunks[i];
      if (o.req) { Object.assign(c, { st: 'running', req: o.req, at: now }); return; }
      c.st = o.fail.definitive ? 'rejected' : 'unknown';
      c.why = sendWhy(o.fail.status, o.fail.detail);
      if (o.fail.definitive) rejected++;
      lines.push('#' + i + ' ' + c.st + ': ' + o.fail.detail);
    });
    await release(day, rejected * CENTS);
    Object.assign(j, { st: 'sent', cents: cents - rejected * CENTS });
    let saved = false;
    for (let k = 0; k < 2 && !saved; k++) { try { await saveJob(id, j, JOB_TTL); saved = true; } catch (e) { saved = false; } }
    if (!saved) {
      // السجلّ بقي «يُرسل» فلا نتيجة ستُجلب: نلغي ما قُبل وهو في الطابور (لا يُحاسَب ما أُلغي قبل أن يبدأ). أفضل جهد.
      const sent = j.chunks.filter((c) => c.st === 'running');
      const cx = await lanes(sent, LANES, (c) => cancel(key, c.req));
      await note(user, 'job ' + id + ' sent ' + sent.length + ' but not saved (cancel ' + cx.join(',') + ')');
      return fail(res, 503, 'retry', diag(user, 'sent ' + sent.length + ' but not saved'));
    }
    if (lines.length) await note(user, 'job ' + id + ': ' + lines.join(' | '));
    return res.status(200).json(Object.assign(view(id, j), diag(user, lines.join(' | '))));
  } finally {
    await kvDel(runKey(id));
  }
}

async function status(res, body, user, key) {
  const id = String(body.id || '');
  const got = await readJob(id, user);
  if (got.err) return fail(res, got.err[0], got.err[1]);
  const j = got.j;
  const open = j.st === 'sent' ? j.chunks.filter((c) => c.st === 'running') : [];
  if (!open.length) return res.status(200).json(view(id, j));
  let mine = false;
  try { mine = await kvSetIfAbsent(pollKey(id), '1', POLL_SEC); } catch (e) { mine = false; } // تعذّر القفل = الحالة المحفوظة
  if (!mine) return res.status(200).json(view(id, j)); // استطلاعان متقاربان = نداء مزوّد واحد
  const now = Date.now();
  const lines = [];
  const { pollVideo } = require('./fal-fallback.js');
  await lanes(open, LANES, async (c) => {
    const p = await pollVideo(c.req);
    if (p.state === 'SUCCEEDED') { c.st = 'done'; c.url = p.url; return; }
    if (p.state === 'FAILED' || p.state === 'OUTAGE') {
      const w = String(p.why || '');
      c.st = 'failed';
      c.why = p.state === 'OUTAGE' ? 'unavailable' : (SAFETY_RE.test(w) ? 'safety' : (/timeout/i.test(w) ? 'timeout' : 'failed'));
      lines.push('#' + j.chunks.indexOf(c) + ' ' + p.state + ': ' + w);
      return;
    }
    // جارٍ أو تعثّر عابر: الطبيعيّ أن ينتهي في نصف ساعة (مهلة البدء + أقصى تشغيل)، وما تجاوز ساعة يُلغى ويُعدّ فاشلًا.
    if (now - (Number(c.at) || 0) > HOUR_MS) {
      const cx = await cancel(key, c.req);
      c.st = 'failed'; c.why = 'timeout';
      lines.push('#' + j.chunks.indexOf(c) + ' timeout after ' + Math.round((now - c.at) / 60000) + ' min (cancel ' + cx + ')');
    }
  });
  let out = j;
  if (open.some((c) => c.st !== 'running')) {
    // دمج لا كتابة فوق: استطلاع آخر (بعد انتهاء القفل) ربّما حفظ مقاطع منتهية — المنتهي في أيّ نسخة يبقى منتهيًا.
    const fresh = await readJob(id, user);
    if (fresh.j && fresh.j.st === 'sent' && fresh.j.chunks.length === j.chunks.length) {
      out = fresh.j;
      out.chunks = out.chunks.map((c, i) => (FINAL.has(j.chunks[i].st) && !FINAL.has(c.st) ? j.chunks[i] : c));
    }
    try { await saveJob(id, out, JOB_TTL); } catch (e) { console.error('[video-erase] state of ' + id + ' not saved (next poll redoes it): ' + msgOf(e)); }
    if (lines.length) await note(user, 'job ' + id + ': ' + lines.join(' | '));
  }
  return res.status(200).json(Object.assign(view(id, out), diag(user, lines.join(' | '))));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return fail(res, 405, 'method');
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  req.body = body;
  const user = sessionUser(tokenOf(req));
  if (!user) return fail(res, 401, 'auth');
  if (!isOwnerName(user)) return fail(res, 403, 'owner_only');
  const op = String((req.query && req.query.op) || body.op || '');
  if (op !== 'start' && op !== 'submit' && op !== 'status') return fail(res, 400, 'bad_op');
  const key = falKey();
  // بلا مفتاح لا شيء؛ والسقف صفر يغلق الصرف وحده — الاستطلاع يبقى فتُجلب مقاطع دُفع ثمنها.
  if (!key || (op !== 'status' && capCents() <= 0)) return fail(res, 503, 'unavailable');
  try {
    if (op === 'start') return await start(res, body, user, key);
    if (op === 'submit') return await submit(res, body, user, key);
    return await status(res, body, user, key);
  } catch (e) {
    await note(user, op + ': ' + msgOf(e));
    return fail(res, 503, 'retry', diag(user, op + ': ' + msgOf(e)));
  }
};
Object.assign(module.exports, {
  MODEL, CENTS, PROMPT, MIN_FRAMES, MAX_FRAMES, MAX_CHUNKS, MAX_FILES, MAX_BYTES, FILE_TTL, UPLOAD_TTL, JOB_TTL, OUT_TTL, START_SEC, HOUR_MS,
  ORPHAN_MS, CAP_DEFAULT, capCents, snap, planOf,
});
