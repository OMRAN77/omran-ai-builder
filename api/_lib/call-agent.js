'use strict';
/* v-call-agent (المالك ١٧ أكتوبر: «الوكيل الي يشغل عندك ويخذ المواعيد ويتصل» — «اول شي سوها اجرب انا كيف بتكون… لاتوقف لين ماتخلص»):
   الوكيل يتّصل بمحلّ (عيادة، صالون، مطعم) نيابةً عن المستخدم ليحجز موعدًا. للمالك وحده الآن، والفتح للمستخدمين قراره بعد التجربة.
   - propose_call (أداة المحادثة للمالك): اقتراح محفوظ في KV ‏call/prop/<id> ‏(٣٠ دقيقة) وكرت «اتّصال» — لا اتّصال بلا ضغطة.
   - call-session: تجربة داخل المتصفّح — الوكيل «يتّصل» بالمالك وهو يمثّل دور المحلّ (Realtime WebRTC كمها، جلسة منفصلة عنها).
   - call-start / call-status / call-cancel: اتّصال حقيقيّ عبر خدمة call-relay (Railway) ← Twilio ↔ Realtime. بلا مفاتيحها: relay_not_configured.
   السعران (لغير المالك عند الفتح): ٥٠ نقطة/دقيقة للأرضيّ و٤٥ للموبايل، بالدقيقة المبدوءة — خارج COSTS عمدًا (consume يقبل أيّ قيمة فيها).
   القانون: أوّل ما يقوله الوكيل أنّه مساعد آليّ يتّصل نيابةً عن فلان وأنّ المكالمة لا تُسجَّل، ويستأذن؛ لا تسجيل صوت في أيّ مكان؛
   الرقم من نصّ المستخدم أو من بحث الأماكن في الخادم وحده، إماراتيّ، بلا طوارئ ولا أرقام خاصّة. الأسرار تُقرأ داخل المعالج لا في نطاق الوحدة. */
const crypto = require('crypto');

const MODEL = 'gpt-realtime-2.1';
const MAX_MIN = 4;
const CALL_PTS_PER_MIN = { landline: 50, mobile: 45 };
const PROP_TTL_SEC = 1800;
const REC_TTL_SEC = 86400;
const HOURS = { from: 8, to: 22 }; // بتوقيت دبي — لا اتّصال حقيقيّ بمحلّ قبل الثامنة صباحًا ولا بعد العاشرة ليلًا

/* الأرقام العربيّة والفارسيّة إلى لاتينيّة، ثمّ الأرقام وحدها مع + في أوّلها إن وُجد. */
function asciiDigits(s) {
  return String(s == null ? '' : s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/* رقم إماراتيّ ← { e164, national, kind } أو { error }. الموبايل 5[024568]xxxxxxx، والأرضيّ [2-9]xxxxxxx (ثمانية).
   ممنوع: الطوارئ والأرقام القصيرة، و600/800/900 (خدمات وموحّدة ومجّانيّة ومدفوعة — لا تُطلب من خارج الدولة أو كلفتها مجهولة). */
const EMERGENCY = new Set(['999', '998', '997', '996', '991', '901', '112', '911']);
function normPhone(raw) {
  const s = asciiDigits(raw).replace(/[\s\-().‎‏‪-‮]/g, '');
  if (!s) return { error: 'no_phone' };
  const d = s.replace(/^\+/, '').replace(/^00/, '');
  if (!/^\d+$/.test(d)) return { error: 'bad_phone' };
  if (EMERGENCY.has(d) || d.length < 7) return { error: 'blocked' };
  if (/^(600|800|900)/.test(d.replace(/^971/, '').replace(/^0/, ''))) return { error: 'blocked' };
  let nat = '';
  if (/^971\d{8,9}$/.test(d)) nat = d.slice(3);
  else if (/^0\d{8,9}$/.test(d)) nat = d.slice(1);
  else if (/^[2-9]\d{7,8}$/.test(d) && !s.startsWith('+')) nat = d;
  else return { error: 'bad_phone' };
  if (/^5[024568]\d{7}$/.test(nat)) return { e164: '+971' + nat, national: nat, kind: 'mobile' };
  if (/^[2-9]\d{7}$/.test(nat) && !/^5/.test(nat)) return { e164: '+971' + nat, national: nat, kind: 'landline' };
  return { error: 'bad_phone' };
}

/* «+971 50 *** 4567» — الرقم كاملًا لا يدخل الكرت المحفوظ في المحادثة (ولا مزامنتها). */
function maskPhone(e164) {
  const m = /^\+971(\d{1,2})(\d+)(\d{4})$/.exec(String(e164 || ''));
  if (!m) return '';
  const area = /^5/.test(m[1]) ? m[1] : m[1].slice(0, 1);
  return '+971 ' + area + ' *** ' + m[3];
}

/* كلّ رقم إماراتيّ صالح مكتوب في نصّ المستخدم — مصدر الرقم المقبول من المحادثة (لا من صفحة ولا من اختراع النموذج). */
function phonesInText(text) {
  const out = new Set();
  const t = asciiDigits(text);
  const re = /(?:\+|00)?\d[\d\s\-().]{6,18}\d/g;
  let m;
  while ((m = re.exec(t))) { const p = normPhone(m[0]); if (p.e164) out.add(p.e164); }
  return out;
}

/* نصّ قصير آمن داخل التعليمات: بلا أسطر ولا محارف تحكّم ولا أقواس زاويّة، بطول محدود. */
function clean(s, n) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}

function quote(kind, maxMin) {
  const per = CALL_PTS_PER_MIN[kind] || CALL_PTS_PER_MIN.landline;
  const min = Math.max(1, Math.min(MAX_MIN, Math.floor(Number(maxMin) || MAX_MIN)));
  return { ptsPerMin: per, maxMin: min, maxPts: per * min };
}

/* الدقيقة المبدوءة تُحسب — ومكالمة لم يُرَدّ عليها (صفر ثانية) لا شيء. */
function chargeFor(kind, durationSec) {
  const sec = Math.max(0, Math.floor(Number(durationSec) || 0));
  if (!sec) return 0;
  return Math.ceil(sec / 60) * (CALL_PTS_PER_MIN[kind] || CALL_PTS_PER_MIN.landline);
}

/* ساعة دبي الآن (٠–٢٣) — بلا مكتبة. */
function dubaiHour(now) {
  const h = new Date((typeof now === 'number' ? now : Date.now()) + 4 * 3600000).getUTCHours();
  return h;
}
function withinHours(now) { const h = dubaiHour(now); return h >= HOURS.from && h < HOURS.to; }

const REPORT_TOOL = {
  type: 'function',
  name: 'report_outcome',
  description: 'Record the result of the call for the user. Call it once, right before ending the call.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['booked', 'not_available', 'needs_user', 'declined', 'no_answer', 'failed'] },
      summary: { type: 'string', description: 'One or two sentences for the user, in the user language (Arabic by default).' },
      confirmed_details: { type: 'string', description: 'Exact booked day/date/time/name, or the alternatives offered. Empty if none.' },
      follow_up: { type: 'string', description: 'What the user still needs to do or answer. Empty if nothing.' },
    },
    required: ['status', 'summary'],
  },
};
const END_TOOL = {
  type: 'function',
  name: 'end_call',
  description: 'Hang up. Use only after saying goodbye and after report_outcome.',
  parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
};

/* التعليمات: هويّة آليّة معلنة، الهدف وحده، لا اختراع، ثمّ النتيجة والإنهاء. التجربة تقول للنموذج إنّ الطرف الآخر يمثّل الدور. */
function buildInstructions(brief, transport, now) {
  const b = brief || {};
  const who = clean(b.callerName, 40) || 'the user';
  const biz = clean(b.business, 80) || 'the business';
  const goal = clean(b.goal, 300);
  const details = clean(b.details, 500);
  const t = new Date((typeof now === 'number' ? now : Date.now()) + 4 * 3600000);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const nowLine = 'CURRENT DATE/TIME (Asia/Dubai): ' + days[t.getUTCDay()] + ' ' + t.toISOString().slice(0, 10) + ' ' + t.toISOString().slice(11, 16) + '.';
  return [
    '# Role',
    'You are an automated phone assistant from the app «عمران AI», placing a call ON BEHALF OF ' + who + ' to ' + biz + '. You are an AI and you always say so.',
    '# Goal',
    goal || 'Book an appointment.',
    details ? ('Details from ' + who + ': ' + details) : '',
    '# Opening (mandatory)',
    'When the other side answers (or after a short silence), your FIRST words are, in Gulf Arabic (or in the language they answered with):',
    '«السلام عليكم، معك مساعد آلي من تطبيق عمران AI، أتّصل نيابةً عن ' + who + ' بخصوص حجز موعد. المكالمة تُعالَج آليًّا ولا تُسجَّل. تسمح لي أكمل؟»',
    'If they refuse, are annoyed, or ask not to be called: apologise briefly, say goodbye, call report_outcome with status "declined", then end_call.',
    '# Rules',
    '- Never claim to be human. If asked, say you are an automated assistant calling for ' + who + '.',
    '- Use ONLY the facts above. Never invent names, phone numbers, ID or insurance numbers, prices, or medical details. If asked something you do not know, say ' + who + ' will confirm it, and put it in follow_up.',
    '- Ask for the slot that matches the goal. If it is not available, collect up to two alternatives and do NOT accept anything the goal does not allow; report them.',
    '- Before ending, repeat the final details (day, date, time, and the name the booking is under) and wait for confirmation.',
    '- Short, polite, natural turns; one question at a time; speak the language and dialect the other side uses.',
    '- Voicemail, a phone menu you cannot use, or no one speaking: report_outcome with "no_answer" or "needs_user", then end_call.',
    '- Share no personal data beyond the name ' + who + ' and the details above.',
    '- When finished: a short goodbye, then report_outcome (summary and confirmed_details in Arabic), then end_call.',
    transport === 'webrtc' ? '# Rehearsal\nThis is a rehearsal inside the app: the person on the line is role-playing ' + biz + '. Behave exactly as on a real call.' : '',
    nowLine,
  ].filter(Boolean).join('\n');
}

/* جلسة Realtime واحدة للطريقين: WebRTC (التجربة) بالصوت الذي يتفاوض عليه المتصفّح، والهاتف بـG.711 μ-law كما يرسله Twilio. */
function buildSession(brief, transport, now) {
  const phone = transport === 'phone';
  const input = { turn_detection: { type: 'semantic_vad', eagerness: 'medium', create_response: true, interrupt_response: true } };
  const output = { voice: 'cedar' };
  if (phone) { input.format = { type: 'audio/pcmu' }; output.format = { type: 'audio/pcmu' }; }
  else input.noise_reduction = { type: 'near_field' };
  return {
    type: 'realtime',
    model: MODEL,
    instructions: buildInstructions(brief, phone ? 'phone' : 'webrtc', now),
    audio: { input, output },
    tools: [REPORT_TOOL, END_TOOL],
    tool_choice: 'auto',
  };
}

/* توقيع Vercel ← الخدمة: HMAC-SHA256(السرّ، ts.METHOD PATH.body) — نسخة توأم في call-relay/lib.mjs (الخدمة لا تقرأ api/_lib). */
function signRelay(secret, method, pathname, body, ts) {
  return crypto.createHmac('sha256', String(secret)).update(String(ts) + '.' + String(method).toUpperCase() + ' ' + String(pathname) + '.' + String(body || '')).digest('hex');
}
async function relayFetch(env, method, pathname, bodyObj, fetchImpl) {
  const base = String(env.CALL_RELAY_URL || '').replace(/\/+$/, '');
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const ts = String(Date.now());
  const r = await (fetchImpl || fetch)(base + pathname, {
    method,
    headers: Object.assign({ 'x-call-ts': ts, 'x-call-sig': signRelay(env.CALL_RELAY_SECRET, method, pathname, body, ts) }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body || undefined,
    signal: AbortSignal.timeout(15000),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; } // جسم ليس JSON = فشل الخدمة يُعامل بحالته
  return { status: r.status, ok: r.ok, json: j };
}

/* رقم المحلّ من بحث الأماكن في الخادم (الحقل نفسه في Places — لا من صفحة ويب). أفضل جهد: فشله = لا رقم، والتجربة تبقى ممكنة. */
async function lookupPhone(key, business, lang, fetchImpl) {
  if (!key || !business) return null;
  try {
    const r = await (fetchImpl || fetch)('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.internationalPhoneNumber,places.nationalPhoneNumber' },
      body: JSON.stringify({ textQuery: String(business).slice(0, 200), languageCode: lang === 'ar' ? 'ar' : 'en', maxResultCount: 3, regionCode: 'AE' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    for (const p of (Array.isArray(j.places) ? j.places : [])) {
      const ph = normPhone(p.internationalPhoneNumber || p.nationalPhoneNumber || '');
      if (ph.e164) return { name: (p.displayName && p.displayName.text) || '', e164: ph.e164, kind: ph.kind };
    }
  } catch (e) { return null; } // الشبكة أو المهلة — بلا رقم
  return null;
}

const TOOL = {
  name: 'propose_call',
  description: 'OWNER ONLY. Prepare a phone call where an automated voice assistant calls a business (clinic, salon, restaurant…) on the user\'s behalf to book or ask. '
    + 'This does NOT call anyone: it shows the user a call card; the call starts only when the user taps it (a rehearsal where the assistant calls the user, or a real call). '
    + 'Fill goal precisely (what, which day/time, for whom, flexibility). phone: only a number the user typed in this conversation; otherwise leave it empty and the server looks up the business number. '
    + 'After the tool returns, write ONE short line saying the card is ready and nothing was dialled yet. Never say a call happened or a booking was made.',
  input_schema: {
    type: 'object',
    properties: {
      business: { type: 'string', description: 'Business name (and area if known), e.g. "عيادة ابتسامة لطبّ الأسنان - البرشاء".' },
      phone: { type: 'string', description: 'UAE number the user typed, or empty.' },
      goal: { type: 'string', description: 'The exact request, e.g. "حجز تنظيف أسنان يوم الأحد بعد العصر، أيّ وقت بين ٤ و٧".' },
      details: { type: 'string', description: 'Extra facts the user gave that the business may ask (name for the booking, number of people…). Empty if none.' },
      caller_name: { type: 'string', description: 'Name the booking is under, as the user gave it. Empty to use the account name.' },
    },
    required: ['business', 'goal'],
  },
};

/* تنفيذ الأداة في دور المحادثة: يرجع { result: نصّ للنموذج، event: حدث كرت أو null }. لا يتّصل بأحد. */
async function proposeCall(input, ctx) {
  const c = ctx || {};
  if (!c.owner) return { result: 'الاتّصال نيابةً عن المستخدم متاح للمالك وحده الآن. أخبر المستخدم بلطف أنّه غير متاح له بعد.', event: null };
  const inp = input || {};
  const business = clean(inp.business, 80);
  const goal = clean(inp.goal, 300);
  if (!business || !goal) return { result: '✗ ينقص اسم المحلّ أو المطلوب بدقّة — اسأل المستخدم عنه في سطر واحد.', event: null };
  let phone = { error: 'no_phone' };
  let from = '';
  const typed = phonesInText(c.lastUserText || '');
  if (inp.phone) {
    const p = normPhone(inp.phone);
    if (p.error === 'blocked') return { result: '✗ هذا الرقم ممنوع للاتّصال الآليّ (طوارئ أو رقم خاصّ). أخبر المستخدم.', event: null };
    if (p.e164 && typed.has(p.e164)) { phone = p; from = 'user'; }
  }
  if (!phone.e164) {
    const found = await lookupPhone(c.placesKey, business, c.lang, c.fetch);
    if (found) { phone = { e164: found.e164, kind: found.kind }; from = 'places'; }
  }
  const id = 'cp' + crypto.randomBytes(9).toString('hex');
  const q = quote(phone.kind || 'landline', MAX_MIN);
  const prop = {
    id, owner: String(c.user || ''), business, phone: phone.e164 || '', kind: phone.kind || '', from,
    goal, details: clean(inp.details, 500), callerName: clean(inp.caller_name, 40) || clean(c.user, 40),
    lang: c.lang || 'ar', maxMin: q.maxMin, createdAt: Date.now(),
  };
  await c.kv.kvSetRaw('call/prop/' + id, JSON.stringify(prop), PROP_TTL_SEC);
  const event = { cards: { kind: 'call', q: business, chips: [], items: [], call: {
    id, business, phoneMasked: maskPhone(prop.phone), kind: prop.kind, goal, maxMin: q.maxMin,
    ptsPerMin: q.ptsPerMin, prices: CALL_PTS_PER_MIN, phoneReady: !!prop.phone,
  } } };
  const result = prop.phone
    ? '✓ ظهر للمالك كرت اتّصال بـ«' + business + '» (' + maskPhone(prop.phone) + '). لم يُتّصل بأحد: الاتّصال يبدأ حين يضغط «جرّب عليّ» (تجربة يمثّل فيها دور المحلّ) أو «اتّصل فعليًّا». اكتب سطرًا واحدًا بهذا وانتظر.'
    : '✓ ظهر للمالك كرت اتّصال بـ«' + business + '» للتجربة فقط: لم أجد رقمًا موثوقًا للمحلّ. لم يُتّصل بأحد. اكتب سطرًا واحدًا: التجربة جاهزة، وللاتّصال الفعليّ يرسل رقم المحلّ في رسالة.';
  return { result, event };
}

/* ── المعالج: /api/system?action=call-session|call-start|call-status|call-cancel ── */
function send(res, status, obj) { res.status(status).json(obj); }

async function loadJSON(kv, key) {
  try { const raw = await kv.kvGetRaw(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } // مفتاح مفقود أو تالف = لا شيء
}

async function handler(req, res, deps) {
  const d = deps || {};
  const kv = d.kv || require('./kv.js');
  const env = d.env || process.env;
  const fetchImpl = d.fetch || fetch;
  const now = typeof d.now === 'number' ? d.now : Date.now();
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const action = String((req.query && req.query.action) || '');
  const { sessionUser, tokenOf } = require('./_session.js');
  const user = sessionUser(tokenOf(req));
  if (!user) return send(res, 401, { error: 'auth' });
  if (!require('./_owner.js').isOwnerName(user)) return send(res, 403, { error: 'owner_only' });

  if (action === 'call-session' || action === 'call-start') {
    const prop = await loadJSON(kv, 'call/prop/' + String(body.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 40));
    if (!prop || prop.owner !== user) return send(res, 404, { error: 'proposal_not_found' });
    if (action === 'call-session') {
      const key = env.OPENAI_API_KEY;
      if (!key) return send(res, 500, { error: 'no_key' });
      const session = buildSession(prop, 'webrtc', now);
      const r = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, expires_after: { anchor: 'created_at', seconds: 60 } }),
      });
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; } // جسم الخطأ قد لا يكون JSON
      if (!r.ok || !j || !j.value) return send(res, 502, { error: 'upstream', status: r.status });
      return send(res, 200, { clientSecret: j.value, model: MODEL, maxSec: prop.maxMin * 60, brief: { business: prop.business, goal: prop.goal, callerName: prop.callerName } });
    }
    if (!env.CALL_RELAY_URL || !env.CALL_RELAY_SECRET) return send(res, 503, { error: 'relay_not_configured' });
    if (!prop.phone) return send(res, 400, { error: 'no_phone' });
    const ph = normPhone(prop.phone);
    if (!ph.e164) return send(res, 400, { error: 'bad_phone' });
    if (!withinHours(now)) return send(res, 403, { error: 'outside_hours', from: HOURS.from, to: HOURS.to });
    const maxSec = prop.maxMin * 60;
    const lock = await kv.kvSetIfAbsent('call/active/' + user, '1', maxSec + 120);
    if (!lock) return send(res, 409, { error: 'busy' });
    const callId = 'cl' + crypto.randomBytes(9).toString('hex');
    let r;
    try { r = await relayFetch(env, 'POST', '/call', { callId, to: ph.e164, maxSec, session: buildSession(prop, 'phone', now) }, fetchImpl); }
    catch (e) { r = { ok: false, status: 0, json: null }; } // الخدمة لا تجيب — يُفكّ القفل تحت
    if (!r.ok) { await kv.kvDel('call/active/' + user); return send(res, 502, { error: 'relay_error', status: r.status }); }
    await kv.kvSetRaw('call/rec/' + callId, JSON.stringify({ callId, user, propId: prop.id, kind: ph.kind, business: prop.business, startedAt: now }), REC_TTL_SEC);
    return send(res, 200, { callId, state: (r.json && r.json.state) || 'queued' });
  }

  if (action === 'call-status' || action === 'call-cancel') {
    const callId = String(body.callId || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
    const rec = await loadJSON(kv, 'call/rec/' + callId);
    if (!rec || rec.user !== user) return send(res, 404, { error: 'call_not_found' });
    if (!env.CALL_RELAY_URL || !env.CALL_RELAY_SECRET) return send(res, 503, { error: 'relay_not_configured' });
    if (action === 'call-cancel') {
      let r;
      try { r = await relayFetch(env, 'POST', '/call/' + callId + '/cancel', {}, fetchImpl); } catch (e) { r = { ok: false, status: 0 }; } // الخدمة لا تجيب
      return send(res, r.ok ? 200 : 502, r.ok ? { ok: true } : { error: 'relay_error', status: r.status });
    }
    let r;
    try { r = await relayFetch(env, 'GET', '/call/' + callId, null, fetchImpl); } catch (e) { r = { ok: false, status: 0, json: null }; } // مهلة أو شبكة
    if (!r.ok || !r.json) return send(res, 502, { error: 'relay_error', status: r.status });
    const s = r.json;
    const out = {
      state: String(s.state || 'queued'), durationSec: Math.max(0, Math.floor(Number(s.durationSec) || 0)),
      transcript: Array.isArray(s.transcript) ? s.transcript.slice(-60).map((x) => ({ who: x && x.who === 'callee' ? 'callee' : 'agent', text: clean(x && x.text, 400) })) : [],
      outcome: s.outcome && typeof s.outcome === 'object' ? { status: clean(s.outcome.status, 20), summary: clean(s.outcome.summary, 600), confirmed_details: clean(s.outcome.confirmed_details, 400), follow_up: clean(s.outcome.follow_up, 400) } : null,
      ended: !!s.ended,
    };
    if (out.ended) await kv.kvDel('call/active/' + user);
    return send(res, 200, out);
  }
  return send(res, 400, { error: 'action' });
}

module.exports = (req, res) => handler(req, res);
Object.assign(module.exports, {
  handler, TOOL, proposeCall, normPhone, maskPhone, phonesInText, quote, chargeFor, withinHours, buildInstructions, buildSession,
  signRelay, lookupPhone, CALL_PTS_PER_MIN, MAX_MIN, MODEL,
});
