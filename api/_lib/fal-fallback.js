'use strict';
/* v-fal-backup (أمر المالك ٣ نوفمبر ٢٠٢٦: «تنبيه قبل ما يخلص الرصيد، أو مزوّد احتياطي — موجود خارجي وصله»): نفاد رصيد
   Gemini المسبق (402، أو 429 «Your prepayment credits are depleted») كان يُسقط كلّ الصور والفيديو مرّة واحدة. هنا الاحتياط
   المشترك: النموذج نفسه عند fal (Nano Banana Pro / Nano Banana 2 / Nano Banana، وGemini Omni Flash للفيديو) بمفتاح FAL_KEY
   الموجود، فلا يحسّ المستخدم بشيء؛ وإشعار للمالك مرّة كلّ ٦ ساعات لكلّ حال.
   - الشرط: رصيد/فوترة فقط (402 أو نصّ الرصيد) — لا زحام 429 العاديّ («Resource has been exhausted (e.g. check quota)») ولا مفتاح مرفوض.
   - علم قصير «Gemini خارج الرصيد» (٥ دقائق): الطلبات التالية تذهب إلى fal مباشرة بلا نداء فاشل قبلها.
   - سقف يوميّ للصرف عند fal (FAL_BACKUP_CAP_CENTS، ٢٠٠٠ = ٢٠$ افتراضًا، يوم UTC): نفس المفتاح يدفع الممثّل والتحسين والتبديل،
     فالاحتياط لا يأكل رصيدها بلا حدّ. الحجز ذرّيّ قبل النداء، ويُردّ إن لم يُنتج fal شيئًا.
   - FAL_BACKUP=off يطفئه كلّه. لا اسم مزوّد في أيّ ردّ يصل المستخدم: الناتج يُعامَل كناتج Gemini. */

const SYNC = 'https://fal.run/';
const QUEUE = 'https://queue.fal.run/';
const OUT_KEY = 'db/fal-backup/gemini-out';
const OUT_TTL_S = 300;
const SPENT_TTL_S = 3 * 86400;
const spentKey = (day) => 'db/fal-backup/spent/' + day;

function falKey() { return String(process.env.FAL_KEY || '').trim(); }
function enabled() {
  return !!falKey() && String(process.env.FAL_BACKUP || 'on').trim().toLowerCase() !== 'off';
}
function capCents() {
  const raw = String(process.env.FAL_BACKUP_CAP_CENTS == null ? '' : process.env.FAL_BACKUP_CAP_CENTS).trim();
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && n >= 0 ? n : 2000;
}

/* رصيد Gemini خلص؟ 402، أو نصّ الرصيد المسبق/الفوترة الموقوفة بأيّ حالة. «billing details» في رسالة حصّة 429 العابرة لا تكفي. */
const GEMINI_OUT_RE = /prepay|credits? (?:are |is |have been )?(?:depleted|exhausted|run out)|out of credits?|exhausted balance|insufficient (?:balance|credits?|funds)|billing[_ ](?:disabled|not enabled|account (?:is )?(?:disabled|closed|suspended))/i;
function geminiCreditOut(status, text) {
  return Number(status) === 402 || GEMINI_OUT_RE.test(String(text || ''));
}
/* fal نفسه موقوف (رصيده أو مفتاحه) — لا زحامه (429/5xx) */
const FAL_OUT_RE = /exhausted balance|user is locked|insufficient (?:balance|credits?|funds)|payment required|billing/i;
function falCreditOut(status, text) {
  const s = Number(status) || 0;
  return s === 401 || s === 402 || s === 403 || FAL_OUT_RE.test(String(text || ''));
}

function kvOf(o) { return (o && o.kv) || require('./kv.js'); }
function clean(s) {
  let t = String(s || '').replace(/https?:\/\/[^\s"'<>)\]}]+/gi, '[url]').replace(/data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g, '[data]');
  const k = falKey();
  if (k) t = t.split(k).join('[key]');
  return t.slice(0, 300);
}

/* ───── علم «Gemini خارج الرصيد» ───── */
async function markGeminiOut(o) {
  if (!enabled()) return; /* بلا احتياط: لا علم، والمسار القديم حرفيًّا */
  try { await kvOf(o).kvSetRaw(OUT_KEY, String(Date.now()), OUT_TTL_S); } catch (e) { /* guard-ok — العلم اختصار لا شرط */ }
}
/* تجربة المالك وحده (أمره ٤ نوفمبر «أضفها+ادمج»): FAL_BACKUP_TEST_UNTIL وقت ISO — حتّى ينتهي تتخطّى طلبات المالك Gemini
   إلى fal بلا إشعار «Gemini خلص»، والباقون كما هم. ينتهي وحده بلا نشر جديد. المالك = جلسة موقَّعة من الجسم أو ?token أو Bearer. */
function ownerTestOn() {
  const t = Date.parse(String(process.env.FAL_BACKUP_TEST_UNTIL || '').trim());
  return Number.isFinite(t) && Date.now() < t;
}
function ownerTesting() {
  if (!ownerTestOn()) return false;
  try {
    const req = require('./_errors.js').currentReq();
    if (!req) return false;
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const s = require('./_session.js');
    const u = s.sessionUser(s.tokenOf({ body, query: req.query, headers: req.headers }));
    return !!u && require('./_owner.js').isOwnerName(u);
  } catch (e) { return false; }
}
async function geminiOutRecently(o) {
  if (!enabled()) return false;
  if (ownerTesting()) return true;
  try { return !!(await kvOf(o).kvGetRaw(OUT_KEY)); } catch (e) { return false; }
}

/* ───── السعر بالسنت (صفحات fal، ٣ نوفمبر ٢٠٢٦) — للسقف وحده ───── */
function imageCents(model, resolution) {
  if (/nano-banana-pro/.test(model)) return resolution === '4K' ? 30 : 15;
  if (/nano-banana-2/.test(model)) return ({ '0.5K': 6, '1K': 8, '2K': 12, '4K': 16 })[resolution] || 8;
  return 4;
}
function videoCents(seconds) { return Math.ceil(12.5 * Math.max(3, Math.min(10, Number(seconds) || 8))); }

async function reserve(cents, o) {
  const kv = kvOf(o);
  const day = new Date().toISOString().slice(0, 10);
  try {
    const spent = Number(await kv.kvIncrBy(spentKey(day), cents));
    if (kv.kvExpire) await kv.kvExpire(spentKey(day), SPENT_TTL_S);
    if (!Number.isFinite(spent) || spent > capCents()) {
      try { await kv.kvDecrBy(spentKey(day), cents); } catch (e) { /* guard-ok — الحجز يسقط بانتهاء اليوم */ }
      return null;
    }
    return { day, cents };
  } catch (e) {
    console.error('[fal-backup] cap: ' + clean(e && e.message));
    return null; /* تعذّر العدّ = لا صرف على عمًى */
  }
}
async function release(held, o) {
  if (!held) return;
  try { await kvOf(o).kvDecrBy(spentKey(held.day), held.cents); } catch (e) { console.error('[fal-backup] refund: ' + clean(e && e.message)); }
}

/* ───── إشعار المالك: مرّة كلّ ٦ ساعات لكلّ حال، بلا انتظار طويل (المهلة ثانيتان) ───── */
async function notify(kind, o) {
  try {
    const p = require('./_owner-alert.js').alertOwnerMedia(kind, o && o.alertOpts);
    await Promise.race([p, new Promise((r) => setTimeout(r, 2000))]);
  } catch (e) { /* guard-ok — الإشعار تحسين لا شرط */ }
}
/* سبب رفض fal: الحالة ونوع الخطأ ورسالته القصيرة — لا الجسم كلّه (قد يعيد نصّ المستخدم في السجلّ والإشعار) */
function falWhy(status, raw) {
  let why = '';
  try {
    const j = JSON.parse(raw);
    const d = j && (j.detail != null ? j.detail : j.error);
    if (Array.isArray(d)) why = d.map((x) => (x && (x.type || x.msg)) || '').filter(Boolean).slice(0, 3).join(',');
    else if (typeof d === 'string') why = d;
    if (j && j.error_type) why = j.error_type + (why ? ' ' + why : '');
  } catch (e) { why = ''; }
  return String(status) + (why ? ' ' + String(why).slice(0, 100) : '');
}
async function logFail(where, detail) {
  const d = clean(detail);
  console.error('[fal-backup] ' + where + ': ' + d);
  try { require('./log-error.js').logError('fal-backup/' + where, new Error(d)); } catch (e) { /* guard-ok — السجلّ تحسين */ }
}

/* ───── الصور ───── */
const RATIOS = new Set(['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '4:1', '1:4', '8:1', '1:8']);
function imageModelFor(geminiModel, hasImages) {
  const m = String(geminiModel || '');
  const base = /2\.5-flash-image/.test(m) ? 'fal-ai/nano-banana'
    : (/flash-image/.test(m) ? 'fal-ai/nano-banana-2' : 'fal-ai/nano-banana-pro');
  return hasImages ? base + '/edit' : base;
}

/* جسم طلب Gemini (contents/parts + generationConfig + systemInstruction) ← مدخل fal. الأجزاء تُسطَّح بترتيبها: كلّ صورة تأخذ
   علامة «[image N]» في موضعها من النصّ فيبقى العنوان («Photo 1 of 2») ملاصقًا لصورته، والدور model («ناتجك السابق») يُذكر. */
function inputFromGemini(geminiModel, body) {
  const b = body || {};
  const texts = [];
  const images = [];
  for (const c of (Array.isArray(b.contents) ? b.contents : [])) {
    const parts = (c && Array.isArray(c.parts)) ? c.parts : [];
    const model = c && c.role === 'model';
    for (const p of parts) {
      if (!p) continue;
      if (typeof p.text === 'string' && p.text.trim()) texts.push((model ? 'Your previous reply: ' : '') + p.text.trim());
      const d = p.inlineData || p.inline_data;
      if (d && d.data && images.length < 14) {
        images.push('data:' + (d.mimeType || d.mime_type || 'image/png') + ';base64,' + d.data);
        texts.push((model ? 'Your previous result: ' : '') + '[image ' + images.length + ']');
      }
    }
  }
  const model = imageModelFor(geminiModel, images.length > 0);
  const gc = b.generationConfig || {};
  const ic = gc.imageConfig || {};
  let prompt = texts.join('\n').trim();
  if (prompt.length < 3) prompt = 'Edit the image as requested.';
  /* JPEG لا PNG: صورة 2K بصيغة PNG ~٤–٨ ميغا base64 تقارب سقف ردّ الدالّة (٤٫٥ ميغا) */
  const input = { prompt: prompt.slice(0, 50000), num_images: 1, sync_mode: true, output_format: 'jpeg' };
  if (images.length) input.image_urls = images;
  const lite = model.indexOf('fal-ai/nano-banana/') === 0 || model === 'fal-ai/nano-banana';
  const ar = String(ic.aspectRatio || '');
  if (RATIOS.has(ar) && !(lite && /^(?:4:1|1:4|8:1|1:8)$/.test(ar))) input.aspect_ratio = ar;
  else input.aspect_ratio = images.length ? 'auto' : '1:1';
  if (!lite) {
    const res = String(ic.imageSize || '').toUpperCase();
    input.resolution = ({ '1K': '1K', '2K': '2K', '4K': '4K' })[res] || '1K';
    if (Number.isFinite(gc.temperature)) input.temperature = gc.temperature;
    const sys = b.systemInstruction || b.system_instruction;
    const sysText = sys && Array.isArray(sys.parts) ? sys.parts.map((p) => (p && p.text) || '').join('\n').trim() : '';
    if (sysText) input.system_prompt = sysText.slice(0, 20000);
  }
  return { model, input };
}

async function outToB64(url, f, signal) {
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url);
  if (m) return { b64: m[2], mime: m[1] };
  if (!/^https:\/\/[\w.-]+\.fal\.(?:media|run|ai)\//.test(url)) return null;
  const r = await f(url, { signal });
  if (!r.ok) return null;
  return { b64: Buffer.from(await r.arrayBuffer()).toString('base64'), mime: r.headers.get('content-type') || 'image/png' };
}

/* الاحتياط نفسه: جسم Gemini كما هو ← { b64, mime, engine:'fal' } أو { error, status }. لا يرمي أبدًا. */
async function imageFromGemini(geminiModel, body, opts) {
  const o = opts || {};
  const where = o.where || 'image';
  if (!enabled()) return { error: 'fal_off' };
  const { model, input } = inputFromGemini(geminiModel, body);
  const held = await reserve(imageCents(model, input.resolution), o);
  if (!held) { await notify('cap', o); await logFail(where, 'daily cap reached or cap store down'); return { error: 'fal_cap' }; }
  const f = o.fetchImpl || fetch;
  const signal = AbortSignal.timeout(Math.max(5000, Number(o.timeoutMs) || 150000));
  const testing = ownerTesting(); /* تجربة المالك: لا إشعار «Gemini خلص» — Gemini سليم */
  const alerted = testing ? Promise.resolve() : notify('gemini-out', o);
  try {
    const r = await f(SYNC + model, {
      method: 'POST',
      headers: { Authorization: 'Key ' + falKey(), 'Content-Type': 'application/json', 'X-Fal-Request-Start-Timeout': '30' },
      body: JSON.stringify(input),
      signal,
    });
    const raw = await r.text().catch(() => '');
    if (!r.ok) {
      /* 4xx = رفضٌ قبل التشغيل فيُردّ الحجز؛ 5xx والمهلة قد تُحاسَب فتبقى محسوبة */
      if (r.status < 500) await release(held, o);
      await logFail(where, 'fal ' + falWhy(r.status, raw));
      if (falCreditOut(r.status, raw)) await notify('fal-out', o);
      await alerted;
      return { error: 'fal_failed', status: r.status };
    }
    let j = null;
    try { j = JSON.parse(raw); } catch (e) { j = null; }
    const url = String((j && j.images && j.images[0] && j.images[0].url) || '');
    const out = url ? await outToB64(url, f, signal) : null;
    await alerted;
    if (!out || !out.b64) {
      if (raw) await release(held, o); /* قراءة مقطوعة بالمهلة = ربّما حوسبت */
      await logFail(where, 'fal empty ' + falWhy(r.status, raw));
      return { error: 'fal_empty' };
    }
    if (testing) console.log('[fal-backup] owner-test ' + where + ' image ok via ' + model);
    return { b64: out.b64, mime: out.mime, engine: 'fal' };
  } catch (e) {
    /* المهلة أو الانقطاع بعد الإرسال: قد يُحاسَب عند fal — الحجز يبقى محسوبًا */
    await logFail(where, 'fal ' + (e && e.name) + ' ' + (e && e.message));
    await alerted;
    return { error: 'fal_failed' };
  }
}

/* اختصار لنقطة نداء واحدة: رجع Gemini بخطأ رصيد؟ ← العلم + fal. غير ذلك null (المسار القديم يكمل كما هو). */
async function rescueImage(status, text, geminiModel, body, opts) {
  if (!enabled() || !geminiCreditOut(status, text)) return null;
  await markGeminiOut(opts);
  const r = await imageFromGemini(geminiModel, body, opts);
  return r && r.b64 ? r : null;
}

/* ───── الفيديو: Gemini Omni Flash عند fal بالطابور، ورقم العمليّة bk/<id> يمرّ بمسار veo-status نفسه ─────
   البادئة محايدة: الرقم يصل نصّ أداة الوكيل في المحادثة، فلا اسم مزوّد فيه */
const VIDEO_OP_PREFIX = 'bk/';
const VIDEO_MODELS = {
  text: 'google/gemini-omni-flash',
  image: 'google/gemini-omni-flash/image-to-video',
  refs: 'google/gemini-omni-flash/reference-to-video',
};
const qOk = (u) => typeof u === 'string' && u.indexOf(QUEUE) === 0;
function videoInput(o) {
  const dur = Math.round(Math.max(3, Math.min(10, Number(o.durationSec) || 8)));
  const input = { prompt: String(o.prompt || '').trim().slice(0, 20000) || 'A short cinematic video.', aspect_ratio: o.portrait ? '9:16' : '16:9', duration: dur };
  let model = VIDEO_MODELS.text;
  const refs = (Array.isArray(o.refs) ? o.refs : []).filter((r) => r && r.b64).slice(0, 10);
  if (refs.length) {
    model = VIDEO_MODELS.refs;
    input.image_urls = refs.map((r) => 'data:' + (r.mime || 'image/jpeg') + ';base64,' + r.b64);
  } else if (o.image && o.image.b64) {
    model = VIDEO_MODELS.image;
    input.image_url = 'data:' + (o.image.mime || 'image/jpeg') + ';base64,' + o.image.b64;
  }
  return { model, input, seconds: dur };
}
/* بدء فيديو احتياطيّ ← { op, rec } أو { error, status } */
async function startVideo(spec, opts) {
  const o = opts || {};
  const where = o.where || 'video';
  if (!enabled()) return { error: 'fal_off' };
  const { model, input, seconds } = videoInput(spec || {});
  const held = await reserve(videoCents(seconds), o);
  if (!held) { await notify('cap', o); await logFail(where, 'daily cap reached or cap store down'); return { error: 'fal_cap' }; }
  const f = o.fetchImpl || fetch;
  const testing = ownerTesting(); /* تجربة المالك: لا إشعار «Gemini خلص» — Gemini سليم */
  const alerted = testing ? Promise.resolve() : notify('gemini-out', o);
  try {
    const r = await f(QUEUE + model, {
      method: 'POST',
      headers: {
        Authorization: 'Key ' + falKey(), 'Content-Type': 'application/json',
        'X-Fal-Request-Start-Timeout': '600',
        'X-Fal-Object-Lifecycle-Preference': JSON.stringify({ expiration_duration_seconds: 7 * 86400 }),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(25000),
    });
    const raw = await r.text().catch(() => '');
    let d = null;
    try { d = JSON.parse(raw); } catch (e) { d = null; }
    if (!r.ok || !d || !d.request_id) {
      await release(held, o);
      await logFail(where, 'fal submit ' + falWhy(r.status, raw));
      if (falCreditOut(r.status, raw)) await notify('fal-out', o);
      await alerted;
      return { error: 'fal_failed', status: r.status };
    }
    const id = String(d.request_id).replace(/[^\w-]/g, '');
    const base = QUEUE + model.split('/').slice(0, 2).join('/') + '/requests/' + id;
    const rec = { p: 'fal', m: model, id, s: qOk(d.status_url) ? d.status_url : base + '/status', r: qOk(d.response_url) ? d.response_url : base, at: Date.now() };
    await alerted;
    if (testing) console.log('[fal-backup] owner-test ' + where + ' video started via ' + model);
    return { op: VIDEO_OP_PREFIX + id, rec };
  } catch (e) {
    await logFail(where, 'fal submit ' + (e && e.name) + ' ' + (e && e.message));
    await alerted;
    return { error: 'fal_failed' };
  }
}
/* متابعة مرّة واحدة ← { state: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'OUTAGE' | 'TRANSIENT', url?, why? } */
async function pollVideo(rec, opts) {
  const o = opts || {};
  const f = o.fetchImpl || fetch;
  if (!rec || !qOk(rec.s) || !qOk(rec.r)) return { state: 'FAILED', why: 'bad-record' };
  const auth = { Authorization: 'Key ' + falKey() };
  try {
    const s = await f(rec.s, { headers: auth, signal: AbortSignal.timeout(15000) });
    if (!s.ok) {
      const t = await s.text().catch(() => '');
      if (falCreditOut(s.status, t)) return { state: 'OUTAGE', why: clean(t) };
      return (s.status === 429 || s.status >= 500) ? { state: 'TRANSIENT' } : { state: 'FAILED', why: 'status ' + s.status };
    }
    const sd = await s.json().catch(() => ({}));
    if (sd.status !== 'COMPLETED') return { state: 'RUNNING' };
    if (sd.error || sd.error_type) return { state: 'FAILED', why: clean(sd.error || sd.error_type) };
    const rr = await f(rec.r, { headers: auth, signal: AbortSignal.timeout(15000) });
    const rt = await rr.text().catch(() => '');
    if (!rr.ok) {
      if (rr.status === 429 || rr.status >= 500) return { state: 'TRANSIENT' };
      if (falCreditOut(rr.status, rt)) return { state: 'OUTAGE', why: clean(rt) };
      return { state: 'FAILED', why: clean(rt) || 'result ' + rr.status };
    }
    let rd = null;
    try { rd = JSON.parse(rt); } catch (e) { rd = null; }
    const url = String((rd && rd.video && rd.video.url) || '');
    if (!/^https:\/\//.test(url)) return { state: 'FAILED', why: clean((rd && (rd.error || rd.detail)) || 'no video') };
    return { state: 'SUCCEEDED', url };
  } catch (e) {
    return { state: 'TRANSIENT', why: clean(e && e.message) };
  }
}

module.exports = {
  enabled, capCents, ownerTesting, geminiCreditOut, falCreditOut, markGeminiOut, geminiOutRecently,
  imageModelFor, inputFromGemini, imageFromGemini, rescueImage, imageCents,
  videoInput, startVideo, pollVideo, videoCents, VIDEO_MODELS, VIDEO_OP_PREFIX,
  OUT_KEY, spentKey,
};
