// call-relay/lib.mjs — v-call-agent: المنطق النقيّ لمرحّل المكالمات الهاتفيّة.
//
// المالك: «الوكيل يتّصل بالعيادة أو الصالون ويحجز عنّي». Vercel يبني موجز المكالمة وجلسة الصوت الحيّ، ثمّ يطلب من
// هذا المرحّل (Railway) طلبًا موقّعًا؛ المرحّل يطلب الرقم عبر Twilio، وحين يردّ الطرف الآخر يفتح Twilio مقبس Media
// Streams هنا فنصله بجلسة الصوت الحيّ (G.711 μ-law في الاتّجاهين، بلا تحويل). لا تسجيل صوت في أيّ مكان: يبقى فقط
// الحال، ونصّ قصير، والنتيجة المنظّمة — ٢٤ ساعة ثمّ تُحذف.
//
// هنا كلّ ما يُختبر بلا ws ولا شبكة (tests/call-relay.test.cjs): توقيع Vercel↔المرحّل، توقيع Twilio، TwiML،
// مخزن الحالة، ترجمة الأحداث بين الطرفين، الرقم (التحقّق والإخفاء)، وتنقية السجلّ من الأسرار.
'use strict';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, rename, readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export const LIMITS = {
  skewMs: 60 * 1000,              // نافذة الطابع الزمنيّ لطلبات Vercel (± ٦٠ ث)
  ttlMs: 24 * 3600 * 1000,        // عمر سجلّ المكالمة على القرص وفي الذاكرة
  minSecret: 24,                  // أقصر سرّ مقبول (كالجسر)
  minSec: 30, maxSec: 900, defaultSec: 240,   // حدود مدّة المكالمة (TimeLimit)
  ringSec: 30,                    // مهلة الرنين قبل «لا ردّ»
  bodyBytes: 32 * 1024,           // جسم POST /call (الجلسة كاملة مع التعليمات ≈ ٥ ك.ب في أقصاها)؛ يُفحص قبل القراءة
  formBytes: 16 * 1024,           // جسم ردّ حالة Twilio (≈ ٢ ك.ب)
  twilioMs: 8000,                 // مهلة طلب Twilio REST — أقلّ بوضوح من انتظار Vercel لنا (١٥ ث)
  transcriptLines: 80, lineChars: 400, outcomeChars: 600, reasonChars: 200,
  maxActive: 3,                   // مكالمات متزامنة على المرحّل كلّه (Vercel يقصرها على واحدة لكلّ مستخدم)
  openerMs: 2500,                 // صمت الطرف الآخر بعد الردّ ⇒ الوكيل يبدأ بجملة الإفصاح
  startTimeoutMs: 5000,           // مقبس بلا رسالة start صالحة يُغلق
  agentConnectMs: 10000,          // جلسة الصوت الحيّ لم تفتح ⇒ إنهاء المكالمة
  hardStopExtraMs: 10000,         // إيقاف صارم بعد maxSec + ١٠ ث من بدء البثّ
  endGraceMs: 3000,               // بعد نهاية صوت الوداع المقدّرة (إن لم تعد العلامة)
  endCapMs: 15000,                // أقصى انتظار بعد end_call
  markHangupMs: 300,              // بعد عودة آخر علامة تشغيل
  finalizeMs: 20000,              // لم يصل ردّ «completed» من Twilio ⇒ نختم الحال بأنفسنا
  preOpenFrames: 100,             // ≈ ثانيتان من صوت الطرف الآخر قبل جاهزيّة الجلسة
  callSafetyExtraMs: 120000,      // صمّام أمان للمكالمة كلّها: maxSec + دقيقتان من إنشائها
  idleMs: 40000,                  // بعد الردّ: لا كلام من الطرف الآخر ولا صوت من الوكيل ٤٠ ث ⇒ وداع مهذّب وإنهاء (no_answer)
  dubaiOpenHour: 8, dubaiCloseHour: 22,
};

export const STATES = ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled'];
export const TERMINAL = new Set(['completed', 'busy', 'no-answer', 'failed', 'canceled']);
const RANK = { queued: 0, ringing: 1, 'in-progress': 2 };
const rank = (s) => (TERMINAL.has(s) ? 3 : (s in RANK ? RANK[s] : -1));

export const OUTCOME_STATUS = ['booked', 'not_available', 'needs_user', 'declined', 'no_answer', 'failed'];
export const CALL_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
export function parseJson(text) {
  if (text == null || text === '') return null;
  try { return JSON.parse(String(text)); } catch (e) { return null; } /* رسالة ليست JSON = تُتجاهل */
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a == null ? '' : a)), y = Buffer.from(String(b == null ? '' : b));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/* ───────── توقيع Vercel → المرحّل (نسخته التوأم في api/_lib على Vercel؛ المرحّل لا يقرأ api/_lib) ─────────
   x-call-ts: <ms>   ·   x-call-sig: hex(HMAC-SHA256(CALL_RELAY_SECRET, ts + '.' + METHOD + ' ' + PATH + '.' + rawBody))
   PATH = مسار الطلب بلا استعلام (‎/call‎، ‎/call/<id>‎، ‎/call/<id>/cancel‎)، وrawBody = بايتات الجسم كما أُرسلت ('' لـGET). */
export function relaySignature(secret, ts, method, path, rawBody) {
  return createHmac('sha256', String(secret))
    .update(String(ts) + '.' + String(method || '').toUpperCase() + ' ' + String(path || '') + '.')
    .update(rawBody == null ? '' : rawBody)
    .digest('hex');
}
export function signRelayHeaders(secret, method, path, rawBody, now) {
  const ts = String(Math.round(now == null ? Date.now() : now));
  return { 'x-call-ts': ts, 'x-call-sig': relaySignature(secret, ts, method, path, rawBody) };
}
/** فحص الرؤوس وحدها (السرّ مضبوط، الطابع والتوقيع بصيغتهما، الطابع داخل النافذة) — يُستدعى قبل قراءة الجسم، فطلب
    بلا توقيع أو قديم يُرفض دون أن يُحجز له بايت في الذاكرة. {ok:true} أو {ok:false, why: not_configured|missing|expired} */
export function precheckRelay(o) {
  const secret = String((o && o.secret) || '');
  if (secret.length < LIMITS.minSecret) return { ok: false, why: 'not_configured' };
  const ts = String((o && o.ts) || '');
  const sig = String((o && o.sig) || '');
  if (!/^\d{10,16}$/.test(ts) || !/^[0-9a-fA-F]{64}$/.test(sig)) return { ok: false, why: 'missing' };
  const now = o.now == null ? Date.now() : o.now;
  if (Math.abs(now - Number(ts)) > (o.skewMs || LIMITS.skewMs)) return { ok: false, why: 'expired' };
  return { ok: true };
}
/** {ok:true} أو {ok:false, why: not_configured|missing|expired|signature} */
export function verifyRelay(o) {
  const pre = precheckRelay(o);
  if (!pre.ok) return pre;
  const secret = String(o.secret), ts = String(o.ts), sig = String(o.sig).toLowerCase();
  const want = Buffer.from(relaySignature(secret, ts, o.method, o.path, o.rawBody), 'hex');
  const got = Buffer.from(sig, 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, why: 'signature' };
  return { ok: true };
}

/* ───────── توقيع Twilio (X-Twilio-Signature) ─────────
   base64(HMAC-SHA1(AUTH_TOKEN, fullUrl + لكلّ مفتاح بترتيب حرفيّ: المفتاح + القيمة)). المفاتيح المكرّرة تُرتَّب قيمها.
   fullUrl = العنوان الذي طلبه Twilio حرفيًّا (StatusCallback الذي أعطيناه)، لا Host الوكيل الداخليّ. */
function formEntries(params) {
  if (!params) return [];
  if (params instanceof URLSearchParams) return [...params.entries()];
  return Object.entries(params).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, String(x)]) : [[k, String(v)]]));
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function twilioSignature(authToken, url, params) {
  const list = formEntries(params).sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
  let data = String(url);
  for (const [k, v] of list) data += k + v;
  return createHmac('sha1', String(authToken)).update(data, 'utf8').digest('base64');
}
/** Twilio قد يوقّع العنوان بالمنفذ الافتراضيّ (:443) أو بدونه — نقبل الصيغتين ولا شيء غيرهما. */
function urlVariants(raw) {
  const out = new Set([String(raw)]);
  try {
    const u = new URL(String(raw));
    const secure = u.protocol === 'https:' || u.protocol === 'wss:';
    const def = secure ? '443' : '80';
    if (!u.port) {
      out.add(u.protocol + '//' + u.hostname + u.pathname + u.search);
      out.add(u.protocol + '//' + u.hostname + ':' + def + u.pathname + u.search);
    }
  } catch (e) { /* عنوان غير صالح: الصيغة الحرفيّة وحدها */ }
  return [...out];
}
export function verifyTwilio(authToken, header, url, params) {
  if (!authToken || !header) return false;
  for (const u of urlVariants(url)) if (safeEqual(twilioSignature(authToken, u, params), String(header))) return true;
  return false;
}

/* ───────── TwiML وعناوين المرحّل ─────────
   Twilio يرفض الاستعلام في عنوان <Stream> (الخطأ 31920) ⇒ رقم المكالمة في المسار، والرمز في <Parameter>. */
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export function streamTwiml({ wsUrl, token }) {
  return '<Response><Connect><Stream url="' + xml(wsUrl) + '"><Parameter name="t" value="' + xml(token) + '"/></Stream></Connect></Response>';
}
export function streamUrl(publicUrl, callId) {
  const u = new URL(publicUrl);
  return (u.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + u.host + '/stream/' + encodeURIComponent(callId);
}
export function statusUrl(publicUrl, callId) {
  return new URL(publicUrl).origin + '/twilio/status/' + encodeURIComponent(callId);
}

/* ───────── الرقم: الإمارات وحدها ─────────
   +971 ثمّ ٨–٩ أرقام وطنيّة؛ محجوب: الطوارئ، الأرقام القصيرة، وما يبدأ بـ600/800/900. الموبايل = 50/52/54/55/56/58. */
const EMERGENCY = new Set(['999', '998', '997', '996', '991', '112', '911']);
export function checkUaePhone(e164) {
  const s = String(e164 == null ? '' : e164).trim();
  const m = /^\+971(\d{8,9})$/.exec(s);
  if (!m) return { ok: false, why: 'format' };
  const n = m[1];
  if (n[0] === '0') return { ok: false, why: 'format' };
  if (EMERGENCY.has(n) || /^(?:600|800|900)/.test(n)) return { ok: false, why: 'blocked' };
  return { ok: true, e164: s, national: n, kind: /^5[024568]/.test(n) ? 'mobile' : 'landline' };
}
/** ‎+971 50 *** 1234‎ — لا يُكتب الرقم كاملًا في سجلّ ولا في ملفّ حالة. */
export function maskPhone(e164) {
  const s = String(e164 == null ? '' : e164).trim();
  const m = /^\+971(\d{8,9})$/.exec(s);
  if (m) {
    const n = m[1];
    return '+971 ' + n.slice(0, /^5/.test(n) ? 2 : 1) + ' *** ' + n.slice(-4);
  }
  return s.length > 6 ? s.slice(0, 4) + ' *** ' + s.slice(-2) : (s ? '***' : '');
}

/* ───────── تنقية السجلّ ───────── */
export function createRedactor(initial) {
  const set = new Set();
  const add = (s) => { const v = String(s == null ? '' : s); if (v.length >= 6) set.add(v); };
  for (const s of initial || []) add(s);
  const redact = (text) => {
    let out = String(text == null ? '' : text);
    for (const s of [...set].sort((a, b) => b.length - a.length)) if (out.includes(s)) out = out.split(s).join('***');
    return out
      .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***')
      .replace(/\bAC[0-9a-fA-F]{32}\b/g, 'AC***')
      .replace(/\+971\d{8,9}(?!\d)/g, (p) => maskPhone(p));
  };
  redact.add = add;
  redact.remove = (s) => set.delete(String(s == null ? '' : s));
  return redact;
}

/* ───────── الإعداد ───────── */
const trim = (v) => String(v == null ? '' : v).trim();
export function configFromEnv(env) {
  const e = env || {};
  const pub = trim(e.PUBLIC_URL) || (trim(e.RAILWAY_PUBLIC_DOMAIN) ? 'https://' + trim(e.RAILWAY_PUBLIC_DOMAIN) : '');
  let publicUrl = '';
  try {
    const u = new URL(pub);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) publicUrl = u.origin;
  } catch (err) { /* عنوان غير صالح = غير مضبوط، و/health يقولها */ }
  return {
    port: Number(e.PORT) || 8080,
    openaiKey: trim(e.OPENAI_API_KEY),
    twilioSid: trim(e.TWILIO_ACCOUNT_SID),
    twilioToken: trim(e.TWILIO_AUTH_TOKEN),
    twilioFrom: trim(e.TWILIO_FROM),
    secret: trim(e.CALL_RELAY_SECRET),
    publicUrl,
    model: trim(e.CALL_MODEL) || 'gpt-realtime-2.1',
    voice: trim(e.CALL_VOICE) || 'cedar',
    stateDir: trim(e.CALL_STATE_DIR) || '/tmp/calls',
  };
}
/** ما الجاهز وما الناقص — أسماء متغيّرات فقط، لا قيمة. */
export function readiness(cfg) {
  const c = cfg || {};
  const fromOk = /^\+\d{8,15}$/.test(String(c.twilioFrom || ''));
  const signing = String(c.secret || '').length >= LIMITS.minSecret;
  const missing = [];
  if (!c.openaiKey) missing.push('OPENAI_API_KEY');
  if (!c.twilioSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!c.twilioToken) missing.push('TWILIO_AUTH_TOKEN');
  if (!fromOk) missing.push('TWILIO_FROM');
  if (!c.publicUrl) missing.push('PUBLIC_URL');
  if (!signing) missing.push('CALL_RELAY_SECRET');
  return { openai: !!c.openaiKey, twilio: !!(c.twilioSid && c.twilioToken && fromOk), publicUrl: !!c.publicUrl, signing, missing };
}
export function clampSec(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return LIMITS.defaultSec;
  return Math.max(LIMITS.minSec, Math.min(LIMITS.maxSec, n));
}
/** المكالمات الحقيقيّة ٠٨:٠٠–٢٢:٠٠ بتوقيت دبي (UTC+4 بلا توقيت صيفيّ) — حارس ثانٍ بعد Vercel. */
export function withinDubaiHours(nowMs) {
  const h = (new Date(nowMs).getUTCHours() + 4) % 24;
  return h >= LIMITS.dubaiOpenHour && h < LIMITS.dubaiCloseHour;
}

/* ───────── الجلسة ─────────
   Vercel مصدر الحقيقة الوحيد للجلسة (التعليمات، الأدوات، الصوت، اكتشاف الدور). المرحّل يفرض فقط ما يفرضه الخطّ
   الهاتفيّ: صيغة audio/pcmu في الاتّجاهين، ويملأ الصوت إن غاب. النموذج يُنقل إلى عنوان المقبس ويُحذف من session.update. */
export function prepareSession(session, defaults) {
  const d = defaults || {};
  const s = JSON.parse(JSON.stringify(session && typeof session === 'object' ? session : {}));
  const model = typeof s.model === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(s.model) ? s.model : (d.model || 'gpt-realtime-2.1');
  delete s.model;
  s.type = 'realtime';
  if (!s.audio || typeof s.audio !== 'object') s.audio = {};
  if (!s.audio.input || typeof s.audio.input !== 'object') s.audio.input = {};
  if (!s.audio.output || typeof s.audio.output !== 'object') s.audio.output = {};
  s.audio.input.format = { type: 'audio/pcmu' };
  s.audio.output.format = { type: 'audio/pcmu' };
  if (!s.audio.output.voice && d.voice) s.audio.output.voice = d.voice;
  return { model, session: s };
}

/* ───────── أحداث Twilio Media Streams ───────── */
export function twilioEvent(text) {
  const m = parseJson(text);
  if (!m || typeof m.event !== 'string') return { kind: 'invalid' };
  switch (m.event) {
    case 'connected': return { kind: 'connected' };
    case 'start': {
      const st = m.start || {};
      return { kind: 'start', streamSid: String(st.streamSid || m.streamSid || ''), callSid: String(st.callSid || ''), token: String((st.customParameters || {}).t || '') };
    }
    case 'media': {
      const md = m.media || {};
      if (md.track && md.track !== 'inbound') return { kind: 'other', event: 'media' };
      return typeof md.payload === 'string' && md.payload ? { kind: 'media', payload: md.payload } : { kind: 'other', event: 'media' };
    }
    case 'mark': return { kind: 'mark', name: String((m.mark || {}).name || '') };
    case 'stop': return { kind: 'stop' };
    default: return { kind: 'other', event: m.event };
  }
}
export const twilioMedia = (streamSid, payload) => ({ event: 'media', streamSid, media: { payload } });
export const twilioClear = (streamSid) => ({ event: 'clear', streamSid });
export const twilioMark = (streamSid, name) => ({ event: 'mark', streamSid, mark: { name } });

/* ───────── أحداث جلسة الصوت الحيّ (أسماء GA، مع أسماء النسخة التجريبيّة احتياطًا) ───────── */
const AUDIO_DELTA = new Set(['response.output_audio.delta', 'response.audio.delta']);
const AUDIO_DONE = new Set(['response.output_audio.done', 'response.audio.done']);
const AGENT_TEXT = new Set(['response.output_audio_transcript.done', 'response.audio_transcript.done']);
export function agentEvent(text) {
  const ev = parseJson(text);
  if (!ev || typeof ev.type !== 'string') return { kind: 'invalid' };
  const t = ev.type;
  if (AUDIO_DELTA.has(t)) return typeof ev.delta === 'string' && ev.delta ? { kind: 'audio', delta: ev.delta, itemId: String(ev.item_id || ''), responseId: String(ev.response_id || '') } : { kind: 'other', type: t };
  if (AUDIO_DONE.has(t)) return { kind: 'audio_done' };
  if (t === 'input_audio_buffer.speech_started') return { kind: 'speech_started' };
  if (AGENT_TEXT.has(t)) return { kind: 'agent_text', text: String(ev.transcript || ''), itemId: String(ev.item_id || ''), responseId: String(ev.response_id || '') };
  if (t === 'conversation.item.input_audio_transcription.completed') return { kind: 'callee_text', text: String(ev.transcript || '') };
  if (t === 'response.output_item.added' || t === 'response.output_item.done') {
    const it = ev.item || {};
    return it.type === 'function_call' ? { kind: 'tool_item', name: String(it.name || ''), callId: String(it.call_id || '') } : { kind: 'other', type: t };
  }
  if (t === 'response.function_call_arguments.done') {
    const args = parseJson(ev.arguments);
    return { kind: 'tool', name: String(ev.name || ''), callId: String(ev.call_id || ''), args: args && typeof args === 'object' ? args : {} };
  }
  if (t === 'response.created') return { kind: 'response_created', id: String((ev.response || {}).id || '') };
  if (t === 'response.done') return { kind: 'response_done', status: String((ev.response || {}).status || ''), id: String((ev.response || {}).id || '') };
  if (t === 'session.created' || t === 'session.updated') return { kind: 'session', type: t };
  if (t === 'error') { const e = ev.error || {}; return { kind: 'error', code: String(e.code || e.type || ''), message: String(e.message || '') }; }
  return { kind: 'other', type: t };
}
export const appendAudio = (payload) => ({ type: 'input_audio_buffer.append', audio: payload });
export const toolOutput = (callId, obj) => ({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(obj) } });
/** مدّة مقطع μ-law ‏8 كيلوهرتز بالملّي ثانية: بايت لكلّ عيّنة، ٨ عيّنات لكلّ م.ث. */
export function pcmuMs(b64) {
  const s = String(b64 || '');
  if (!s) return 0;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad) / 8;
}
export function cleanOutcome(args) {
  const a = args && typeof args === 'object' ? args : {};
  return {
    status: OUTCOME_STATUS.includes(a.status) ? a.status : 'needs_user',
    summary: clip(a.summary, LIMITS.outcomeChars),
    confirmed_details: clip(a.confirmed_details, LIMITS.outcomeChars),
    follow_up: clip(a.follow_up, LIMITS.outcomeChars),
  };
}

/* ───────── نتيجة لم يسجّلها الوكيل (العقد v2) ─────────
   كلّ مكالمة انتهت لها نتيجة: إن أُغلق الخطّ قبل report_outcome (أغلق الطرف الآخر، انتهى الوقت، انقطعت الخدمة) تُبنى
   من سبب النهاية. لم يردّ أحد (مشغول، لا ردّ، انتهت أو أُلغيت قبل الردّ، أو سكوت بعد الردّ) ⇒ no_answer؛ وما عدا ذلك
   ⇒ failed (ومنه فشل الطلب نفسه: المكالمة لم تخرج أصلًا، فليست «لم يردّوا»). الملخّص جملة عربيّة قصيرة بلا اسم مزوّد. */
const ENDED_SUMMARY = {
  busy: 'الخطّ مشغول ولم يردّ أحد.',
  'no-answer': 'رنّ الهاتف ولم يردّ أحد.',
  canceled_early: 'أُلغيت المكالمة قبل أن يردّ أحد.',
  unanswered: 'انتهت المكالمة قبل أن يردّ أحد.',
  no_speech: 'ردّ الخطّ ثمّ لم يتكلّم أحد، فأنهى الوكيل المكالمة بلطف.',
  canceled: 'أُلغيت المكالمة أثناءها قبل أن تُسجَّل نتيجة.',
  hung_up: 'أغلق الطرف الآخر الخطّ قبل أن تُسجَّل نتيجة؛ راجع نصّ المكالمة.',
  time: 'انتهى وقت المكالمة قبل أن تُسجَّل نتيجة؛ راجع نصّ المكالمة.',
  agent: 'انقطعت خدمة الصوت أثناء المكالمة.',
  restart: 'أُعيد تشغيل خدمة الاتّصال فانقطعت المكالمة.',
  dial: 'تعذّر إجراء المكالمة عبر شبكة الهاتف.',
  unreachable: 'تعذّر الوصول إلى الرقم.',
  other: 'انتهت المكالمة دون أن تُسجَّل نتيجة؛ راجع نصّ المكالمة.',
};
export function fallbackOutcome(call) {
  const c = call || {};
  const why = String(c.endReason || '');
  const answered = !!c.answeredAt;
  const out = (status, key) => ({ status, summary: ENDED_SUMMARY[key], confirmed_details: '', follow_up: '' });
  if (why === 'no_speech') return out('no_answer', 'no_speech');
  if (c.state === 'busy' || c.state === 'no-answer') return out('no_answer', c.state);
  if (why === 'relay_restart') return out('failed', 'restart');
  if (/^twilio_/.test(why)) return out('failed', 'dial');
  if (c.state === 'canceled') return answered ? out('failed', 'canceled') : out('no_answer', 'canceled_early');
  if (!answered) return c.state === 'failed' ? out('failed', 'unreachable') : out('no_answer', 'unanswered');
  if (/^(line_|call_)/.test(why)) return out('failed', 'hung_up');
  if (why === 'max_duration' || why === 'safety_timeout') return out('failed', 'time');
  if (/^agent_/.test(why)) return out('failed', 'agent');
  return out('failed', 'other');
}

/* ───────── سجلّ المكالمة ─────────
   لا رمز البثّ ولا الجلسة ولا الرقم الكامل هنا: هذا ما يُكتب على القرص ويُقرأ في GET /call/<id>. */
export function newCall({ callId, phoneMasked, kind, maxSec, now }) {
  return {
    callId, phoneMasked: phoneMasked || '', kind: kind || '', maxSec: maxSec || LIMITS.defaultSec,
    state: 'queued', createdAt: now, updatedAt: now, answeredAt: 0, endedAt: 0, durationSec: null,
    callSid: '', transcript: [], outcome: null, endReason: '', agentReason: '', hangupRequested: false, cancelRequested: false,
  };
}
export function twilioStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'initiated') return 'queued';
  return STATES.includes(v) ? v : '';
}
/** ينقل الحال إلى الأمام فقط (ردود Twilio قد تصل بغير ترتيبها)، والنهائيّة نهائيّة. يعيد true إن تغيّرت. */
export function applyState(call, status, now) {
  const next = twilioStatus(status);
  if (!next || TERMINAL.has(call.state) || next === call.state || rank(next) < rank(call.state)) return false;
  call.state = next;
  if (next === 'in-progress' && !call.answeredAt) call.answeredAt = now;
  if (TERMINAL.has(next)) call.endedAt = now;
  call.updatedAt = now;
  return true;
}
export function publicView(call, now) {
  const dur = call.durationSec != null
    ? call.durationSec
    : (call.answeredAt ? Math.max(0, Math.round(((call.endedAt || now) - call.answeredAt) / 1000)) : 0);
  const ended = TERMINAL.has(call.state);
  return {
    state: call.state,
    durationSec: dur,
    transcript: (call.transcript || []).map((l) => ({ who: l.who, text: l.text })),
    /* المنتهية بلا report_outcome تُبنى نتيجتها من سبب النهاية عند القراءة — فتشمل كلّ طرق النهاية، ومنها ما خُتم بعد إعادة التشغيل */
    outcome: call.outcome ? Object.assign({}, call.outcome) : (ended ? fallbackOutcome(call) : null),
    ended,
    endReason: call.endReason || '',
  };
}

/* ───────── المخزن: ذاكرة + ملفّات JSON تحت CALL_STATE_DIR (٢٤ ساعة) ───────── */
export function createStore(opts) {
  const o = Object.assign({ dir: '', now: Date.now, ttlMs: LIMITS.ttlMs, log: () => 0 }, opts || {});
  const mem = new Map();
  let chain = Promise.resolve();
  let disk = !!o.dir;
  const file = (id) => join(o.dir, id + '.json');
  async function rmQuiet(p) {
    try { await unlink(p); } catch (e) { /* محذوف أصلًا */ }
  }
  function persist(call) {
    if (!disk) return;
    const id = call.callId;
    const body = JSON.stringify(call);   // لقطة الآن: تعديل لاحق لا يغيّر ما في الطابور
    chain = chain.then(async () => {
      if (!disk) return;
      try {
        await mkdir(o.dir, { recursive: true });
        const tmp = file(id) + '.tmp';
        await writeFile(tmp, body);
        await rename(tmp, file(id));
      } catch (e) {
        disk = false;
        o.log('state dir not writable, memory only: ' + clip(e && e.message, 120));
      }
    });
  }
  return {
    get: (id) => mem.get(String(id)) || null,
    put(call) { mem.set(call.callId, call); persist(call); return call; },
    all: () => [...mem.values()],
    active() { let n = 0; for (const c of mem.values()) if (!TERMINAL.has(c.state)) n++; return n; },
    flush: () => chain,
    /** عند الإقلاع: ما دون ٢٤ ساعة يعود، وما لم ينتهِ صار «failed» (المقبس مات مع العمليّة)، والأقدم يُحذف. */
    async load() {
      if (!o.dir) return 0;
      let names = [];
      try { names = await readdir(o.dir); } catch (e) { return 0; /* أوّل إقلاع: لا مجلّد بعد */ }
      const t = o.now();
      let n = 0;
      for (const name of names) {
        if (!/^[A-Za-z0-9_-]{6,64}\.json$/.test(name)) continue;
        let c = null;
        try { c = JSON.parse(await readFile(join(o.dir, name), 'utf8')); } catch (e) { c = null; /* ملفّ تالف يُحذف أدناه */ }
        if (!c || typeof c.callId !== 'string' || !(t - Number(c.createdAt) < o.ttlMs)) { await rmQuiet(join(o.dir, name)); continue; }
        if (!TERMINAL.has(c.state)) {
          c.state = 'failed'; c.endedAt = t; c.updatedAt = t; c.endReason = c.endReason || 'relay_restart';
          mem.set(c.callId, c); persist(c);
        } else mem.set(c.callId, c);
        n++;
      }
      return n;
    },
    async sweep() {
      const t = o.now();
      let n = 0;
      for (const [id, c] of mem) {
        if (t - Number(c.createdAt) < o.ttlMs) continue;
        mem.delete(id); n++;
        /* الحذف في طابور الكتابة نفسه: كتابة سابقة لم تنتهِ (حال «failed» بعد الإقلاع) كانت تعيد الملفّ بعد حذفه */
        if (o.dir) { const p = file(id); chain = chain.then(() => rmQuiet(p)); }
      }
      return n;
    },
  };
}
