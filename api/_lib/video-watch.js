'use strict';
/* v-video-watch (طلب المالك ٥ أكتوبر: «يشوف الفيديو مع الصوت نفس الوقت»، «بدون أيّ أزرار»، «الدقّة العالية»): فيديو يرفقه
   المستخدم في المحادثة مع سؤاله — المحرّك يشاهد الإطارات (إطار كلّ ثانية) ويسمع الصوت كاملًا في طلب واحد، ويجيب بالتوقيت.
   التخزين Blob موقوف في المشروع (blob-client-upload.js) وحدّ الجسم في Vercel ٤٫٥MB، فالرفع قطعٌ صغيرة عبر هذه الدالّة إلى
   جلسة رفع قابلة للاستئناف عند المزوّد — رابطها لا يغادر الخادم (يُحفظ في Redis باسم المهمّة ساعة واحدة).
   ثلاث خطوات قصيرة، كلّ نداء تحت مهلة الدالّة:
     start ← الحجم والنوع والمدّة من المتصفّح؛ يرفض مبكّرًا (الحجم، المدّة، الصيغة، الرصيد) ويفتح جلسة الرفع.
     chunk ← قطعة base64 بإزاحتها (مضاعف ٢٥٦ ك.ب كما يشترط الرفع المستأنف)؛ الأخيرة تُنهي الرفع.
     run   ← قبل جاهزيّة الملفّ يردّ pending (المتصفّح يعيد)، ثمّ المدّة الحقيقيّة من المزوّد، فالخصم (نقطة + نقطتان لكلّ دقيقة
             بدأت)، فالتحليل بالدقّة العالية، والاسترداد عند الفشل. النتيجة تُحفظ في المهمّة — إعادة الطلب بعد انقطاع لا تخصم
             مرّتين — وقفل ذرّيّ يمنع تشغيلين متزامنين للمهمّة نفسها. رسائل الخطأ بلا اسم مزوّد (قاعدة المالك). */
const crypto = require('node:crypto');
const pointsLib = require('./points.js');
const { kvGetJSON, kvSetRaw, kvSetIfAbsent, kvDel } = require('./kv.js');

const BASE = 'https://generativelanguage.googleapis.com';
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_SEC = 600;
const CHUNK = 10 * 256 * 1024; // 2.5MB: مضاعف ٢٥٦ ك.ب، وbase64 ≈ ٣٫٥MB تحت حدّ الجسم
const JOB_TTL = 3600;
const RUN_LOCK_SEC = 300;
const GEN_TIMEOUT_MS = 240000; // التحليل غير المتدفّق لا يرسل رأسًا قبل اكتماله — مهلة الثلاثين ثانية العامّة تقطعه
const MIME = {
  'video/mp4': 'video/mp4', 'video/x-m4v': 'video/mp4', 'video/quicktime': 'video/mov', 'video/mov': 'video/mov',
  'video/webm': 'video/webm', 'video/mpeg': 'video/mpeg', 'video/mpg': 'video/mpg', 'video/3gpp': 'video/3gpp',
  'video/x-msvideo': 'video/avi', 'video/avi': 'video/avi', 'video/x-flv': 'video/x-flv', 'video/x-ms-wmv': 'video/wmv', 'video/wmv': 'video/wmv',
};
const EXT = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mov', webm: 'video/webm', mpeg: 'video/mpeg', mpg: 'video/mpg', '3gp': 'video/3gpp', avi: 'video/avi', flv: 'video/x-flv', wmv: 'video/wmv' };
const LANG_NAME = { ar: 'Arabic', en: 'English', bn: 'Bengali', es: 'Spanish', fil: 'Filipino', fr: 'French', hi: 'Hindi', id: 'Indonesian', ml: 'Malayalam', ne: 'Nepali', ru: 'Russian', tr: 'Turkish', ur: 'Urdu', zh: 'Chinese' };

const jobKey = (id) => 'vwatch:' + id;
const lockKey = (id) => 'vwatch:run:' + id;
const model = () => String(process.env.GEMINI_WATCH_MODEL || 'gemini-flash-latest').trim();
const fail = (res, status, code, extra) => res.status(status).json(Object.assign({ ok: false, error: code }, extra || {}));

// نقطة للفيديو + نقطتان لكلّ دقيقة بدأت (COSTS في points.js — قرار المالك).
function costFor(sec) {
  const C = pointsLib.COSTS;
  return C.video_watch_base + C.video_watch_min * Math.max(1, Math.ceil(Math.max(0, Number(sec) || 0) / 60));
}
function mimeOf(type, name) {
  const t = String(type || '').toLowerCase().split(';')[0].trim();
  if (MIME[t]) return MIME[t];
  const ext = (/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1];
  return EXT[String(ext || '').toLowerCase()] || '';
}
function instruction(question, lang) {
  const q = String(question || '').trim().slice(0, 2000);
  return [
    'You are given a video WITH its audio track: you see the frames and hear the sound together.',
    'Do what the user asks about this video. Rules:',
    '1. Reply in the same language as the user\'s request; if the request is empty, reply in ' + (LANG_NAME[lang] || 'Arabic') + '.',
    '2. Refer to moments with MM:SS timestamps.',
    '3. If the request is general or empty: describe what happens in order with timestamps, transcribe the spoken words faithfully in their original language, and mention notable non-speech sounds and music.',
    '4. Base everything on what is actually seen and heard; say plainly when something is unclear or inaudible.',
    '5. Never name any AI model, provider or company.',
    'User request: ' + (q ? '"""' + q + '"""' : '(none — give the full description)'),
  ].join('\n');
}
async function readJob(id, user) {
  if (!/^[a-f0-9]{24}$/.test(String(id || ''))) return null;
  const j = await kvGetJSON(jobKey(id));
  return j && j.u === user ? j : null;
}
const saveJob = (id, j) => kvSetRaw(jobKey(id), JSON.stringify(j), JOB_TTL);
async function dropFile(key, j) { // أفضل جهد — الملفّ عند المزوّد ينتهي وحده بعد يومين
  if (!j || !j.file || !/^files\/[a-z0-9-]+$/i.test(j.file.name)) return;
  try { await fetch(BASE + '/v1beta/' + j.file.name, { method: 'DELETE', headers: { 'x-goog-api-key': key } }); } catch (e) { /* guard-ok — التنظيف لا يُسقط الردّ */ }
}
async function isFree(user) {
  if (pointsLib.isOwnerUsername(user)) return true;
  try { return !!(await require('./_vip.js').isVip(user)); } catch (e) { return false; }
}
/* v-video-watch-diag (لقطة المالك ٩:٢٤: «تعذّر تحليل الفيديو» لفيديو ٨ ثوانٍ بلا أيّ سبب — والإنتاج والمزوّد محجوبان عن بيئة
   الإصلاح): السبب الحقيقيّ — المرحلة وحالة المزوّد ونصّ خطئه — يُسجَّل في سجلّ أخطاء المالك (منتظَرًا: العامل يتجمّد بعد الردّ)،
   ويُرسل في __diag للمالك وحده فتعرضه الواجهة له بين قوسين (نمط maha-image). */
async function upstreamText(step, r) {
  let msg = '';
  try {
    const raw = await r.text();
    try { const e = JSON.parse(raw).error; msg = (e && (e.message || e.status)) || raw; } catch (e2) { msg = raw; }
  } catch (e) { msg = ''; }
  return step + ' ' + r.status + (msg ? ': ' + String(msg).replace(/\s+/g, ' ').slice(0, 200) : '');
}
async function failUp(res, user, detail, extra) {
  try { await require('./log-error.js').logErrorAndFlush('video-watch', new Error(detail), { action: 'video-watch', user: String(user || '').slice(0, 40) }); } catch (e) { /* guard-ok — التسجيل تحسين لا شرط */ }
  return fail(res, 502, 'failed', Object.assign({}, extra || {}, pointsLib.isOwnerUsername(user) ? { __diag: detail } : {}));
}

async function start(req, res, body, user, key) {
  const size = Math.floor(Number(body.size) || 0);
  if (!(size > 0)) return fail(res, 400, 'bad_request');
  if (size > MAX_BYTES) return fail(res, 413, 'too_big');
  const mime = mimeOf(body.mime, body.name);
  if (!mime) return fail(res, 415, 'format');
  const dur = Math.max(0, Number(body.durationSec) || 0);
  if (dur > MAX_SEC + 2) return fail(res, 413, 'too_long');
  // الرصيد قبل رفع ١٠٠ ميغابايت لا بعده (الخصم الفعليّ في run بالمدّة الحقيقيّة).
  if (!(await isFree(user))) {
    const need = costFor(dur);
    const rec = await pointsLib.readPoints(user);
    const have = rec ? Number(rec.points) || 0 : 0;
    if (have < need) return fail(res, 402, 'points_insufficient', { needed: need, points: have });
  }
  const r = await fetch(BASE + '/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'chat-video' } }),
  });
  const url = r.ok ? r.headers.get('x-goog-upload-url') : '';
  if (!url) return failUp(res, user, r.ok ? 'start: no upload url' : await upstreamText('start', r));
  const gran = Number(r.headers.get('x-goog-upload-chunk-granularity')) || 0; // للتشخيص إن رُفضت قطعة
  const id = crypto.randomBytes(12).toString('hex');
  await saveJob(id, { u: user, url, size, mime, off: 0, dur, gran, at: Date.now() });
  return res.status(200).json({ ok: true, id, chunk: CHUNK });
}

async function chunk(req, res, body, user, key) {
  const j = await readJob(body.id, user);
  if (!j) return fail(res, 404, 'not_found');
  if (j.file) return res.status(200).json({ ok: true, offset: j.size, done: true });
  const off = Math.floor(Number(body.offset));
  if (off !== j.off) return fail(res, 409, 'offset', { expected: j.off });
  const buf = Buffer.from(String(body.data || ''), 'base64');
  const last = off + buf.length === j.size;
  if (!buf.length || buf.length > CHUNK || off + buf.length > j.size || (!last && buf.length !== CHUNK)) return fail(res, 400, 'bad_request');
  const r = await fetch(j.url, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload', 'X-Goog-Upload-Offset': String(off) },
    body: buf,
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) return failUp(res, user, (await upstreamText('chunk@' + off + '/' + j.size, r)) + (j.gran ? ' gran=' + j.gran : ''));
  j.off = off + buf.length;
  if (last) {
    const d = await r.json().catch(() => ({}));
    const f = d && d.file;
    if (!f || !/^files\/[a-z0-9-]+$/i.test(String(f.name || '')) || !f.uri) return failUp(res, user, 'finalize: no file (' + JSON.stringify(d).slice(0, 160) + ')');
    j.file = { name: f.name, uri: f.uri, mime: f.mimeType || j.mime };
  }
  await saveJob(body.id, j);
  return res.status(200).json({ ok: true, offset: j.off, done: last });
}

async function run(req, res, body, user, key) {
  const id = body.id;
  const j = await readJob(id, user);
  if (!j) return fail(res, 404, 'not_found');
  if (j.result) return res.status(200).json(Object.assign({ ok: true, cached: true }, j.result));
  if (!j.file) return fail(res, 409, 'not_uploaded');
  const fr = await fetch(BASE + '/v1beta/' + j.file.name, { headers: { 'x-goog-api-key': key } });
  if (!fr.ok) return failUp(res, user, await upstreamText('file', fr));
  const meta = await fr.json().catch(() => ({}));
  if (meta.state === 'PROCESSING') return res.status(200).json({ ok: true, pending: true });
  if (meta.state !== 'ACTIVE') {
    await dropFile(key, j); await kvDel(jobKey(id));
    return failUp(res, user, 'file state ' + meta.state + (meta.error && meta.error.message ? ': ' + String(meta.error.message).slice(0, 200) : ''));
  }
  const real = parseFloat(String((meta.videoMetadata && meta.videoMetadata.videoDuration) || '').replace(/s$/, ''));
  const sec = Number.isFinite(real) && real > 0 ? real : j.dur;
  if (sec > MAX_SEC + 2) { await dropFile(key, j); await kvDel(jobKey(id)); return fail(res, 413, 'too_long'); }
  if (!(await kvSetIfAbsent(lockKey(id), '1', RUN_LOCK_SEC))) return fail(res, 409, 'busy');

  const cost = costFor(sec);
  // «مدفوع» يُحفظ في المهمّة قبل التحليل: لو انقطعت الدالّة بعد الخصم وقبل الردّ فالإعادة تحلّل بلا خصم ثانٍ.
  let pay = { ok: true, points: null };
  let charged = Number.isFinite(j.paid) ? j.paid : null;
  if (charged === null) {
    pay = await pointsLib.spendPoints(user, cost, 'video_watch');
    if (!pay.ok) { await kvDel(lockKey(id)); return fail(res, 402, 'points_insufficient', { needed: cost, points: pay.points || 0 }); }
    charged = pay.owner ? 0 : cost;
    j.paid = charged;
    await saveJob(id, j);
  }
  try {
    const t0 = Date.now(); // المحاولتان معًا تحت GEN_TIMEOUT_MS — الدالّة تُقتل عند ٣٠٠ث قبل أن تردّ النقاط
    const gen = (cfg) => fetch(BASE + '/v1beta/models/' + encodeURIComponent(model()) + ':generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(Math.max(1000, GEN_TIMEOUT_MS - (Date.now() - t0))),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ file_data: { file_uri: j.file.uri, mime_type: j.file.mime } }, { text: instruction(body.prompt, body.lang) }] }],
        generationConfig: cfg,
      }),
    });
    // الدقّة العالية بقرار المالك؛ ميزانيّة تفكير صغيرة وسقف واسع — التفكير الافتراضيّ يلتهم السقف فيرجع فارغًا (v-flash-nothink).
    let g = await gen({ mediaResolution: 'MEDIA_RESOLUTION_HIGH', temperature: 0.4, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 1024 } });
    let note = '';
    // إعداد مرفوض (400: الدقّة أو التفكير) أو ضغط عابر (429/5xx، نمط maha-image): محاولة واحدة بالإعداد الافتراضيّ قبل الحكم
    // بالفشل، والسبب الأوّل للمالك.
    if ((g.status === 400 || g.status === 429 || g.status >= 500) && Date.now() - t0 < GEN_TIMEOUT_MS / 2) {
      note = await upstreamText('gen-high', g);
      if (g.status !== 400) await new Promise((r) => setTimeout(r, 2000));
      g = await gen({ maxOutputTokens: 8192 });
    }
    const d = await g.json().catch(() => ({}));
    const c0 = d.candidates && d.candidates[0];
    const parts = (g.ok && c0 && c0.content && c0.content.parts) || [];
    const text = parts.map((p) => (p && !p.thought && p.text) || '').join('').trim();
    if (!text) {
      const why = (d.error && d.error.message) || (c0 && c0.finishReason) || (d.promptFeedback && d.promptFeedback.blockReason) || 'empty';
      throw Object.assign(new Error('gen'), { diag: (note ? note + ' | ' : '') + 'gen ' + g.status + ': ' + String(why).replace(/\s+/g, ' ').slice(0, 200) });
    }
    try { // v-cost-meter: تكلفتنا الحقيقيّة من توكنات الطلب (الدخل والخرج والتفكير)
      const u = d.usageMetadata || {};
      const cm = require('./cost-meter.js');
      await cm.addCost(user, cm.tokenCostUsd(model(), { input: u.promptTokenCount, output: (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0) }), 'media');
    } catch (e) { /* guard-ok — القياس لا يوقف خدمة */ }
    j.result = { result: text, cost: charged, sec: Math.round(sec), points: Number.isFinite(pay.points) ? pay.points : null };
    await saveJob(id, j);
    await dropFile(key, j);
    const fb = note && pointsLib.isOwnerUsername(user) ? { __diag: 'fallback: ' + note } : {};
    return res.status(200).json(Object.assign({ ok: true }, j.result, fb));
  } catch (e) {
    console.error('[video-watch] analysis failed:', e && (e.diag || e.message));
    if (charged) { try { await pointsLib.refundPoints(user, charged); } catch (e2) { console.error('[video-watch] refund failed:', e2 && e2.message); } }
    j.paid = null; // رُدّ — المحاولة التالية تخصم من جديد
    try { await saveJob(id, j); } catch (e3) { /* guard-ok — المهمّة تنتهي وحدها بعد ساعة */ }
    await kvDel(lockKey(id));
    return failUp(res, user, e.diag || ('gen: ' + (e && e.message)), { refunded: charged });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method' }); return; }
  let body = req.body;
  if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(500).json({ ok: false, error: 'not_configured' }); return; }
  // الهويّة من التوكن الموقَّع وحده — لا اسم مستخدم من العميل.
  const user = pointsLib.verifyPointsToken(body.token);
  if (!user) { res.status(401).json({ ok: false, error: 'auth' }); return; }
  const step = String((req.query && req.query.step) || body.step || '');
  try {
    if (step === 'start') return await start(req, res, body, user, key);
    if (step === 'chunk') return await chunk(req, res, body, user, key);
    if (step === 'run') return await run(req, res, body, user, key);
    return fail(res, 400, 'bad_request');
  } catch (e) {
    console.error('[video-watch] ' + step + ' error:', e && e.message);
    return failUp(res, user, step + ': ' + String((e && e.message) || e).slice(0, 200));
  }
};
module.exports.costFor = costFor;
module.exports.mimeOf = mimeOf;
module.exports.instruction = instruction;
module.exports.CHUNK = CHUNK;
module.exports.MAX_BYTES = MAX_BYTES;
module.exports.MAX_SEC = MAX_SEC;
