'use strict';
/* v-allah-tafkhim (المالك ٨ نوفمبر: «كلمة الله وليست الاه… تكون مضخمه يليق باسم الله»، وبعد سماع العيّنة ٩ نوفمبر:
   «ابدأ لكلّ الكلام»):
   - أصوات Azure الرجاليّة الستّة تنطق «الله» مرقّقة في كلّ موضع: F2 بين ١٥٠٠ و١٧٠٠ هرتز، مثل «إله».
   - صوت فاطمة («مها») يرقّق «الله أكبر».
   - هنا صوت Gemini 3.8 Flash TTS لكلّ الكلام العربيّ بصوتَي مها وعبدالله. بلا تعليمات يفخّم بعد الفتح والضمّ وفي الابتداء،
     ويرقّق بعد الكسر («بسمِ الله»، «الحمدُ لله»).
   - قياس ٩ نوفمبر لهذه الإعدادات نفسها:
     - المفخّم: ٩١١–١١٢٩ هرتز للرجل، و١١٦٢–١٣٤٢ للمرأة.
     - بعد الكسر: ١٣٤٨–١٤٢٦ للرجل، و١٧٤٠–١٨١٤ للمرأة.
   - النموذج والصوتان (Charon لعبدالله، Kore لمها) وأسلوب الإلقاء هي العيّنة التي سمعها المالك ووافق عليها، حرفيًّا.
   - أيّ تعثّر (المفتاح، الرصيد، حدّ الطلبات، المهلة، صوت فارغ) يعيد null، فيكمل المستدعي بصوت Azure القديم. لا صمت أبدًا.
   - حدّ الطلبات اليوميّ (١٠٠ لكلّ نموذج في الطبقة الأولى) أو نفاد الرصيد يضع علم تبريد في KV، فلا يدفع كلّ طلب انتظارًا
     قبل البديل. والفشل يُسجَّل في سجلّ الأخطاء: سقوط صامت على بديل يخفي موت المزوّد (PITFALLS).
   - سقف صرف يوميّ (MAHA_VOICE_CAP_CENTS، والافتراض ٣٠٠ = ٣$، يوم UTC) بحجز ذرّيّ للحروف قبل النداء، يُردّ عند الفشل.
   - MAHA_VOICE=azure يطفئ المسار كلّه. */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.8-flash-tts';
const VOICES = { male: 'Charon', female: 'Kore' };
const DIALECTS = { ae: 'Emirati', om: 'Omani', sa: 'Saudi', kw: 'Kuwaiti', qa: 'Qatari', bh: 'Bahraini' };
/* السرعة في Gemini كلمات في الأسلوب لا معامل رقميّ (التوثيق: «speaking slowly / rapidly» على مستوى الدور) */
const PACE = {
  slow: 'calm and clear, speaking a little slowly.',
  normal: 'calm, clear, everyday pace.',
  fast: 'clear, speaking a little faster than usual.',
  xfast: 'clear, speaking quickly.',
};
/* ───── v-tts-gemini: المحرّك الثاني — أيّ صوت غير maha (speakVoice تحت) ─────
   - كان OpenAI ‏/v1/audio/speech، وOpenAI تحذف نماذجه كلّها من الـAPI في ٦ يناير ٢٠٢٧.
   - اسم صوت OpenAI القديم يُترجَم إلى صوت Gemini بالجنس نفسه، واسم صوت Gemini يُقبل كما هو بلا حساسية لحالة الأحرف.
   - onyx/cedar/echo/fable ← Charon. قيس ٩ نوفمبر على سطور «قصص الأنبياء»: «الله» مفخّمة (١٠٠٠–١١١٧ هرتز)، ومرقّقة بعد الكسر (١٤٠٣–١٤١٤).
   - ash/verse/ballad ← Orus، صوت رجل ثانٍ، فيبقى قارئ الحديث غير الراوي. لم يُقَس بعد.
   - الأصوات النسائيّة ← Kore.
   - أسلوب الإلقاء من «instructions» المستدعي، والسرعة كلمات في الأسلوب. */
const OPENAI_VOICES = {
  onyx: 'Charon', cedar: 'Charon', echo: 'Charon', fable: 'Charon',
  ash: 'Orus', verse: 'Orus', ballad: 'Orus',
  nova: 'Kore', marin: 'Kore', coral: 'Kore', shimmer: 'Kore', alloy: 'Kore', sage: 'Kore',
};
const GEMINI_MALE = ['Puck', 'Charon', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Algenib', 'Rasalgethi', 'Alnilam', 'Schedar', 'Achird', 'Zubenelgenubi', 'Sadachbia', 'Sadaltager'];
const GEMINI_FEMALE = ['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'];
const GENERIC_STYLE = 'Clear, natural and warm delivery.';
const GENERIC_PACE = { slow: 'Speak a little slowly.', fast: 'Speak a little faster than usual.', xfast: 'Speak quickly.' };
const STYLE_MAX = 600;
const PART_MAX = 900;          /* حروف الطلب الواحد: ما جرّبه مخرج التطبيق (MAX_VOICE_CHARS)، نحو ٨٠ ثانية صوت */
const PARALLEL = 2;            /* أجزاء النصّ الطويل (تعليق الفيديو) معًا — حدّ الطلبات في الدقيقة صغير */
const COOL_KEY = 'db/maha-voice/cool';
const SPENT_TTL_S = 3 * 86400;
const spentKey = (day) => 'db/maha-voice/chars/' + day;

function styleFor(dialect, speed) {
  const d = Object.prototype.hasOwnProperty.call(DIALECTS, dialect) ? DIALECTS[dialect] : DIALECTS.ae;
  const p = Object.prototype.hasOwnProperty.call(PACE, speed) ? PACE[speed] : PACE.normal;
  return 'Warm, friendly and natural conversational ' + d + ' Gulf Arabic, like a helpful assistant chatting with a friend; ' + p;
}
function voiceFor(gender) { return gender === 'male' ? VOICES.male : VOICES.female; }
/** اسم صوت الطلب ← {voice: صوت Gemini, male}. المجهول أو الغائب بالجنس المرسل: رجل ← Charon، وإلّا Kore. */
function genericVoice(name, gender) {
  const n = String(name || '').trim().toLowerCase();
  const direct = GEMINI_MALE.concat(GEMINI_FEMALE).find((v) => v.toLowerCase() === n);
  const voice = direct || (Object.prototype.hasOwnProperty.call(OPENAI_VOICES, n) ? OPENAI_VOICES[n] : voiceFor(gender));
  return { voice, male: GEMINI_MALE.includes(voice) };
}
/** أسلوب المحرّك الثاني: «instructions» المستدعي (≤٦٠٠ حرف) أو أسلوب محايد، ثمّ كلمات السرعة إن طُلبت غير العاديّة. */
function genericStyle(instructions, speed) {
  const own = String(instructions || '').replace(/\s+/g, ' ').trim().slice(0, STYLE_MAX);
  const pace = Object.prototype.hasOwnProperty.call(GENERIC_PACE, speed) ? GENERIC_PACE[speed] : '';
  return (own || GENERIC_STYLE) + (pace ? ' ' + pace : '');
}
function apiKey() { return String(process.env.GEMINI_API_KEY || '').trim(); }
function enabled() { return !!apiKey() && String(process.env.MAHA_VOICE || '').trim().toLowerCase() !== 'azure'; }
function capCents() {
  const raw = String(process.env.MAHA_VOICE_CAP_CENTS == null ? '' : process.env.MAHA_VOICE_CAP_CENTS).trim();
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && n >= 0 ? n : 300;
}
/* كلفة الحرف بالسنت للسقف وحده (صفحة الأسعار ٨ نوفمبر): ٢٥ token لكلّ ثانية صوت، ‎$9 للمليون حتّى ٣١ ديسمبر ٢٠٢٦ و‎$18 من
   ١ يناير ٢٠٢٧. عشرة حروف في الثانية تقدير محافظ (المقيس ١١–١٢ بالسرعة العاديّة). */
function centsPerChar(now) {
  const usdPerMillion = (now || Date.now()) < Date.UTC(2027, 0, 1) ? 9 : 18;
  return (25 / 10) * usdPerMillion / 1e6 * 100;
}
function capChars(now) { return Math.floor(capCents() / centsPerChar(now)); }

/** أجزاء بحدود الجمل، كلّ جزء ≤ max حرف. الجملة الأطول تُقطع عند الفاصلة ثمّ عند المسافة، ولا تُقطع كلمة. */
function splitText(text, max) {
  const lim = max || PART_MAX;
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  if (s.length <= lim) return [s];
  const pieces = [];
  const push = (p) => {
    let rest = p.trim();
    while (rest.length > lim) {
      const win = rest.slice(0, lim + 1);
      let cut = Math.max(win.lastIndexOf('، '), win.lastIndexOf(', '), win.lastIndexOf('؛ '));
      if (cut > lim / 3) cut += 1; else cut = win.lastIndexOf(' ');
      if (cut <= 0) cut = lim;
      pieces.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) pieces.push(rest);
  };
  /* القطع عند علامة وقف تليها مسافة فقط: «3.5» لا تنكسر، والجمع بمسافة واحدة يعيد النصّ كما هو */
  for (const sent of s.split(/(?<=[.!?؟۔])\s+/)) push(sent);
  const parts = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + 1 + p.length > lim) { parts.push(cur); cur = p; } else cur = cur ? cur + ' ' + p : p;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** الصوت من ردّ interactions: آخر محتوى صوتيّ في خطوات model_output (وأشكال أقدم احتياطًا)، base64 أو ''. */
function pickAudio(d) {
  let hit = '';
  for (const st of ((d && d.steps) || [])) {
    if (!st || st.type !== 'model_output') continue;
    for (const c of (st.content || [])) if (c && c.type === 'audio' && typeof c.data === 'string' && c.data.length > 100) hit = c.data;
  }
  if (!hit && d && d.output_audio && typeof d.output_audio.data === 'string') hit = d.output_audio.data;
  if (!hit) for (const p of ((((d && d.candidates) || [])[0] || {}).content || {}).parts || []) if (p && p.inlineData && typeof p.inlineData.data === 'string') hit = p.inlineData.data;
  return hit;
}
/** PCM من WAV (يُقرأ فصلا fmt وdata، لا افتراض ٤٤ بايتًا)، أو PCM خام ٢٤ كيلوهرتز أحاديّ ١٦ بت كما يرسله البثّ. */
function pcmOf(buf) {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    let rate = 24000, channels = 1, bits = 16, off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString('ascii', off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === 'fmt ' && off + 24 <= buf.length) {
        channels = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); bits = buf.readUInt16LE(off + 22);
      } else if (id === 'data') {
        const end = Math.min(buf.length, off + 8 + size);
        return channels === 1 && bits === 16 ? { pcm: buf.subarray(off + 8, end), rate } : null;
      }
      off += 8 + size + (size % 2);
    }
    return null;
  }
  return { pcm: buf.subarray(0, buf.length - (buf.length % 2)), rate: 24000 };
}
function wavOf(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/* ───── التبريد: حدّ اليوم أو الرصيد أو المفتاح — الطلبات التالية إلى Azure مباشرة ───── */
/* نفاد الرصيد بتعبير احتياط fal نفسه: «billing details» في رسالة حصّة 429 العابرة لا تكفي */
function creditOut(status, text) { return require('./fal-fallback.js').geminiCreditOut(status, text); }
const DAILY_RE = /PerDay|per[ _]day|daily/i;
function secondsToPacificMidnight(now) {
  /* منتصف ليل المحيط الهادئ = ٠٨:٠٠ UTC شتاءً (٠٧:٠٠ صيفًا: نعود متأخّرين ساعة، لا أبكر) */
  const d = new Date(now || Date.now());
  let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0);
  if (next <= d.getTime()) next += 86400000;
  return Math.max(600, Math.round((next - d.getTime()) / 1000));
}
/** كم ثانية يُبرَّد المسار بعد هذا الفشل (٠ = عابر، لا تبريد). */
function coolFor(status, text, now) {
  const s = Number(status) || 0, t = String(text || '');
  if (creditOut(s, t)) return 1800;
  if (s === 429 && DAILY_RE.test(t)) return secondsToPacificMidnight(now);
  if (s === 429) return 60;
  if (s === 401 || s === 403 || s === 404) return 1800; /* المفتاح أو النموذج — لا 400: قد يخصّ نصًّا واحدًا */
  return 0;
}

function kvOf(o) { return (o && o.kv) || require('./kv.js'); }
async function cooling(o) {
  try { return !!(await kvOf(o).kvGetRaw(COOL_KEY)); } catch (e) { return false; } /* تعذّر القراءة: نجرّب، والسقف يحرس الصرف */
}
async function cool(seconds, why, o) {
  if (!(seconds > 0)) return;
  try { await kvOf(o).kvSetRaw(COOL_KEY, String(why || 'x').slice(0, 40), seconds); } catch (e) { /* guard-ok — العلم اختصار لا شرط */ }
}
async function reserve(chars, o) {
  const kv = kvOf(o);
  const day = new Date((o && o.now) || Date.now()).toISOString().slice(0, 10);
  try {
    const spent = Number(await kv.kvIncrBy(spentKey(day), chars));
    if (kv.kvExpire) await kv.kvExpire(spentKey(day), SPENT_TTL_S);
    if (!Number.isFinite(spent) || spent > capChars(o && o.now)) {
      try { await kv.kvDecrBy(spentKey(day), chars); } catch (e) { /* guard-ok — الحجز يسقط بانتهاء اليوم */ }
      return null;
    }
    return { day, chars };
  } catch (e) {
    return null; /* تعذّر العدّ = لا صرف على عمًى (كاحتياط fal) */
  }
}
async function release(held, o) {
  if (!held) return;
  try { await kvOf(o).kvDecrBy(spentKey(held.day), held.chars); } catch (e) { /* guard-ok — الحجز يسقط بانتهاء اليوم */ }
}
function report(why, meta, scope) {
  const where = scope || 'tts/maha-voice';
  try { require('./log-error.js').logError(where, new Error(why), meta); } catch (e) { console.error('[' + where + '] ' + why); }
}

/** جزء واحد ← {ok, pcm, rate} أو {ok:false, status, why, text}. زحام 429 العابر أو 5xx يُعاد مرّة بعد ثانية. */
async function synthPart(text, opts) {
  const o = opts || {};
  const fetchImpl = o.fetchImpl || fetch;
  const body = JSON.stringify({
    model: MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: o.styleText || styleFor(o.dialect, o.speed) }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: o.voiceName || voiceFor(o.gender) }] }, /* voiceName/styleText للمحرّك الثاني وحده */
    store: false, /* لا يُحفظ الطلب عند المزوّد */
  });
  const timeoutMs = Math.min(45000, 8000 + 50 * text.length);
  let last = { ok: false, status: 0, why: 'network', text: '' };
  for (let attempt = 0; attempt < 2; attempt++) {
    let r = null, d = null;
    try {
      r = await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.key }, body, signal: AbortSignal.timeout(timeoutMs) });
      d = await r.json().catch(() => null);
    } catch (e) {
      return { ok: false, status: 0, why: /timeout|abort/i.test(String(e && (e.name || e.message))) ? 'timeout' : 'network', text: '' };
    }
    if (r.ok) {
      const b64 = pickAudio(d);
      const got = b64 ? pcmOf(Buffer.from(b64, 'base64')) : null;
      if (got && got.pcm.length > 2400) return { ok: true, pcm: got.pcm, rate: got.rate };
      return { ok: false, status: 502, why: 'no_audio', text: '' };
    }
    const errText = JSON.stringify((d && d.error) || d || '').slice(0, 600);
    last = { ok: false, status: r.status, why: 'http_' + r.status, text: errText };
    /* زحام الدقيقة أو 5xx يُعاد مرّة؛ حدّ اليوم والرصيد لا يُعادان (الإعادة ضياع وقت) */
    const transient = (r.status === 429 && !DAILY_RE.test(errText) && !creditOut(429, errText)) || r.status >= 500;
    if (!transient || attempt === 1) break;
    await new Promise((res) => setTimeout(res, o.retryMs == null ? 1000 : o.retryMs));
  }
  return last;
}

/**
 * نصّ عربيّ ← WAV بصوت مها/عبدالله، أو null والمستدعي يكمل بصوت Azure.
 * opts: {text, gender, dialect, speed, fetchImpl, kv, now, retryMs}
 */
async function speakMaha(opts) {
  if (!enabled()) return null;
  /* الصوتان والأسلوب المعتمدة وحدها: لا voiceName ولا styleText من المستدعي */
  return speakWith(Object.assign({}, opts || {}, { voiceName: '', styleText: '' }), 'tts/maha-voice');
}

/**
 * v-tts-gemini — المحرّك الثاني: نصّ بأيّ لغة ← WAV بصوت Gemini وأسلوب يحدّدهما المستدعي، أو null والمستدعي يكمل بصوت Azure.
 * - الحصّة والسقف اليوميّ والتبريد هي نفسها التي لصوت مها، فطلبات المسارين تُحسب معًا.
 * - MAHA_VOICE=azure يخصّ صوت مها وحده، والسقف ٠ يغلق المسارين.
 * opts: {text, voiceName, styleText, fetchImpl, kv, now, retryMs}
 */
async function speakVoice(opts) {
  const o = opts || {};
  if (!apiKey() || !o.voiceName || !o.styleText) return null;
  return speakWith(o, 'tts/voice');
}

async function speakWith(o, scope) {
  const parts = splitText(o.text);
  if (!parts.length) return null;
  if (await cooling(o)) return null;
  const chars = parts.reduce((n, p) => n + p.length, 0);
  const held = await reserve(chars, o);
  if (!held) return null;
  const key = apiKey();
  const out = new Array(parts.length);
  let failed = null, next = 0;
  const worker = async () => {
    while (!failed && next < parts.length) {
      const i = next++;
      const r = await synthPart(parts[i], Object.assign({}, o, { key }));
      if (!r.ok) { failed = r; return; }
      out[i] = r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, parts.length) }, worker));
  if (!failed && out.some((r) => !r || r.rate !== out[0].rate)) failed = { status: 502, why: 'mixed_rate', text: '' };
  if (failed) {
    await release(held, o);
    const secs = coolFor(failed.status, failed.text, o.now);
    await cool(secs, failed.why, o);
    report(failed.why, { status: failed.status, parts: parts.length, chars, cool: secs, msg: String(failed.text || '').slice(0, 160) }, scope);
    return null;
  }
  return { wav: wavOf(Buffer.concat(out.map((r) => r.pcm)), out[0].rate), parts: parts.length, model: MODEL };
}

module.exports = { speakMaha, speakVoice, enabled, genericVoice, genericStyle };
module.exports.__test = { styleFor, voiceFor, splitText, pickAudio, pcmOf, wavOf, coolFor, capChars, centsPerChar, secondsToPacificMidnight, MODEL, VOICES, PART_MAX, COOL_KEY, spentKey,
  OPENAI_VOICES, GEMINI_MALE, GEMINI_FEMALE, GENERIC_STYLE, GENERIC_PACE, STYLE_MAX };
