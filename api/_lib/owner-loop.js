'use strict';
/* api/_lib/owner-loop.js — v-claude-code-level (المالك ١٠ أكتوبر: «ولا يبني ولا يقرى… ما يعطيني شي»):
   متانة حلقة الأدوات في chat.js للمالك وحده — كلّ دور ينتهي بجواب أو بسبب ظاهر، لا بصمت.
   chat.js يناديها بأسطر قصيرة (مراسي knowledge/ROUTING.md لا تنزاح)، وغير المالك لا يمرّ هنا (state(false) = لا شيء).
   C1 جواب ختاميّ إلزاميّ: آخر خطوة (أو آخر دقيقة من المهلة) بتنبيه «اكتب الجواب الآن» والأدوات كما هي. على مسار أنثروبيك (المباشر
      والوسيط) بلا tool_choice: تغييره يُبطل كاش الرسائل كلّها (كتابة ×1.25 للتاريخ كلّه بدل قراءة ≤×0.1)، والتنبيه وحده إلحاق بآخر رسالة
      فيبقى المسبوق مقروءًا من الكاش؛ وأداة طُلبت رغم التنبيه لا تُنفَّذ ويظهر السبب. المسار المباشر (oa-direct) بـtool_choice none.
   C2 القطع لطوله: إكمال حتّى مرّتين داخل الوقت؛ استدعاء أداة مقطوع لا يُنفَّذ أبدًا.
   C4 مشغول/حدّ (429/529/5xx) على المفتاح المباشر: إعادة النداء نفسه مرّة أو مرّتين بانتظار يحترم retry-after (سقف ٨ ث).
   C5 مزوّد صامت: لكلّ نداء مهلة حتّى الترويسة (٧٥ ث — العميل بلا نبض قبلها ويستسلم عند ٩٠)، وبعدها مهلة خمول تُصفَّر مع أيّ بايت
      (ping والتعليقات ضمنها)، فيُقطع النداء ولا يبقى النبض يخدع العميل؛ ولا تتجاوز مهلةٌ حدّ الدالّة (٣٠٠ ث في vercel.json).
   C6 الرفض والردّ الفارغ: سبب صريح للمالك، ولا يُعاد ردّ مرفوض إلى الحلقة.
   C7 تجاوز نافذة السياق بعد الخطوة الأولى: تُقصّ نتائج الأدوات الأقدم وتبقى الأخيرة كاملة.
   C8 موديل اختاره المالك ورفضه المفتاح «does not have access»: يُذكَر (الدالّة الدافئة + KV ست ساعات) فلا يُدفع نداء فاشل أوّلًا كلّ رسالة.
   C9 بثّ المزوّد انقطع في منتصفه (خطأ داخل البثّ، بثّ بلا نهاية، أو انقطاع الاتّصال): إعادة النداء نفسه مرّة في الدور قبل أيّ حرف، وبعدها سبب ظاهر بكوده.
   D1 كتل التفكير تعود بين جولات الأدوات كما وصلت (المالك وحده، أنثروبيك المباشر) وتُنزع عند أيّ تعديل للتاريخ — تفصيله عند thinkState.
   لا مفتاح ولا متغيّر سرّيّ يُقرأ هنا؛ مهلتا C5 من CHAT_STALL_FIRST_MS / CHAT_STALL_IDLE_MS لحظة النداء. */

const SYS = '[تنبيه النظام — ليس من المالك]: ';
const FINAL_NOTE = SYS + 'انتهت ميزانيّة الأدوات — اكتب الجواب الآن ممّا قرأت وصرّح بما لم تقرأه.';
const CONTINUE_NOTE = SYS + 'انقطع ردّك لطوله. أكمل من آخر حرف بلا تكرار — بلا مقدّمة ولا إعادة ما كُتب ولا فتح كتلة كود جديدة إن كنت داخل واحدة.';
const TOOL_CUT_NOTE = SYS + 'انقطع استدعاء الأداة لطوله فلم يُنفَّذ — قسّم أو استعمل edit_github برقع صغيرة بدل محتوى الملفّ كاملًا.';
const CUT_STOP = 'انقطع لطوله — اكتب: كمل';
const EMPTY_STOP = 'رجع الردّ فارغًا';
const BUSY = new Set([429, 500, 502, 503, 504, 529]);
const RETRY_CAP_MS = 8000;
const ACCESS_RE = /does not have access|do not have access|not have access to (?:the )?model/i;
const DEAD_TTL_S = 6 * 3600;

// هامش الختام: دقيقة من ٢٤٠ ث، وربع المهلة إن ضُيّقت (CHAT_MAX_MS=20000 ← ٥ ث) كي لا يُجبر الختام من أوّل خطوة.
function margin(maxMs) { return Math.min(60000, Math.floor(Number(maxMs) / 4)); }
function stepText(blocks) { return (blocks || []).filter((b) => b && b.type === 'text').map((b) => b.text || '').join(''); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); } // انتظار الإعادة جزء من الدور (≤ ٨ ث) — ليس unref

function state(on) {
  return { on: !!on, final: false, nudged: false, conts: 0, retryMs: 0, noChoice: false, choice: false, slow: false, t0: 0, send: null, ac: null, reader: null, tFirst: null, tIdle: null, stalled: '', lastStall: '', stopDetails: null, midRetried: false };
}

/* C5: الحارس — لكلّ نداء مؤقّت حتّى الترويسة، وبعدها مؤقّت خمول يُصفَّر مع كلّ دفعة. الانطلاق يلغي القارئ
   أوّلًا (فتعود القراءة المعلّقة done بدل أن ترمي) ثمّ يقطع الطلب. المؤقّتات unref فلا تُبقي الدالّة حيّة. */
function clear(s) { if (s.tFirst) { clearTimeout(s.tFirst); s.tFirst = null; } if (s.tIdle) { clearTimeout(s.tIdle); s.tIdle = null; } }
function timer(ms, fn) { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }
// قبل الترويسة لا نبض للعميل (kaTimer في chat.js يبدأ بعد upstream.ok) وحارسه ٩٠ ث — فالمهلة ٧٥ ث على كلّ المسارات.
function firstMs() { return Math.max(50, Number(process.env.CHAT_STALL_FIRST_MS) || 75000); }
/* بعد الترويسة: المسار المباشر (oa-direct: GPT/Groq/Kimi) قد يفكّر صامتًا بلا نبضات (لا ping ولا تعليق من المزوّد) — خموله أطول. */
function idleMs(s) { return Math.max(50, Number(process.env.CHAT_STALL_IDLE_MS) || (s && s.slow ? 150000 : 60000)); }
// حدّ الدالّة ٣٠٠ ث (vercel.json maxDuration): لا مهلة تتجاوز ٢٩٠ ث من بداية الدور، فيصل السبب قبل أن تُقتل الدالّة.
const FN_BUDGET_MS = 290000;
function budget(s, ms) {
  const left = s.t0 ? s.t0 + FN_BUDGET_MS - Date.now() : Infinity;
  const m = Math.min(ms, Math.max(0, left));
  return { ms: m, why: m < ms ? 'اقترب حدّ وقت الخادم (300 ث) والمزوّد لم يكمل' : '' };
}
function fire(s, b) {
  clear(s);
  s.stalled = b.why || ('المزوّد ما ردّ خلال ' + Math.max(1, Math.round(b.ms / 1000)) + ' ث');
  try { const p = s.reader && s.reader.cancel(new Error('stall')); if (p && p.catch) p.catch((e) => { /* guard-ok — القارئ أُغلق أصلًا */ }); } catch (e) { /* guard-ok — القارئ أُغلق أصلًا */ }
  try { if (s.ac) s.ac.abort(); } catch (e) { /* guard-ok — القطع أفضل جهد */ }
}
function arm(s) {
  clear(s);
  s.stalled = ''; s.reader = null;
  s.ac = (typeof AbortController === 'function') ? new AbortController() : null;
  const b = budget(s, firstMs());
  s.tFirst = timer(b.ms, () => fire(s, b));
}
function poke(s) {
  if (s.tFirst) { clearTimeout(s.tFirst); s.tFirst = null; }
  if (s.tIdle) clearTimeout(s.tIdle);
  const b = budget(s, idleMs(s));
  s.tIdle = timer(b.ms, () => fire(s, b));
}
function stop(s) { if (s && s.on) { clear(s); s.reader = null; } }
// كلّ نداء (الإعادات والاحتياط ضمنها): متحكّم قطع جديد ومؤقّت ترويسة كامل — لا تتقاسم الخطوة مهلة واحدة.
function signal(s, direct) {
  if (!s || !s.on) return undefined;
  s.slow = !!direct;
  arm(s);
  return s.ac ? s.ac.signal : undefined;
}
// وصلت الترويسة: نجاح = مهلة خمول (النبض يبقي العميل حيًّا من الآن)، فشل = لا حارس (جسم الخطأ قصير).
function got(s, r) {
  if (s && s.on && r) { if (r.ok) poke(s); else clear(s); }
  return r;
}

/* C1 + C5: بداية كلّ خطوة. الختام = آخر خطوة أو بعد (المهلة − الهامش)، وفي دور فيه أدوات فقط. التنبيه مرّة واحدة،
   كتلة نصّ بعد نتائج الأدوات في آخر رسالة (ترتيب أنثروبيك: tool_result أوّلًا) ولا يُحذف بعدها — إلحاق لا تعديل للتاريخ. */
function beginStep(s, o) {
  if (!s || !s.on) return;
  s.stopDetails = null; s.t0 = Number(o.t0) || Date.now(); s.send = typeof o.send === 'function' ? o.send : null;
  s.final = !!o.tools && (o.steps >= o.MAX_STEPS || Date.now() - o.t0 > o.MAX_MS - margin(o.MAX_MS));
  if (s.final && !s.nudged && o.steps > 1 && Array.isArray(o.convo) && o.convo.length) {
    const last = o.convo[o.convo.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) { last.content = last.content.concat([{ type: 'text', text: FINAL_NOTE }]); s.nudged = true; }
  }
  clear(s); s.stalled = ''; s.reader = null; // الحارس يُسلَّح مع كلّ نداء (signal)
}

/* C1: الجسم المرسَل — الأدوات نفسها دائمًا (لا حذف أداة). tool_choice none للمسار المباشر (oa-direct) وحده: على مسار أنثروبيك
   تغيير tool_choice يُبطل كاش الرسائل (جدول «ما يُبطل الكاش»: الأدوات والنظام يبقيان، الرسائل لا)، فيكفيه التنبيه. */
function shape(b, s, direct) {
  if (s && s.on) s.choice = false;
  if (s && s.on && s.final && direct && !s.noChoice && Array.isArray(b.tools) && b.tools.length) { b.tool_choice = { type: 'none' }; s.choice = true; }
  return b;
}

/* C5: انقطاع الطلب بالحارس قبل الترويسة = فشل صريح (٥٠٤) يمرّ بسلسلة المالك؛ نداء الاحتياط يسلّح حارسه بنفسه. سطر حالة فورًا:
   قبل الترويسة لا نبض، فبلاه يستسلم حارس العميل (٩٠ ث) أثناء نداء الاحتياط قبل أن يصله الجواب أو السبب. */
function fetchFailed(s, e) {
  if (s && s.on && s.stalled) {
    const why = s.stalled;
    s.lastStall = why;
    clear(s);
    try { if (s.send) s.send({ status: '⏳ ' + why + '…' }); } catch (e2) { /* guard-ok — العميل أغلق المجرى */ }
    return { ok: false, status: 504, headers: null, stall: true, text: async () => 'stall: ' + why };
  }
  throw e;
}

// C5: قراءة البثّ — أيّ بايت يصفّر الحارس؛ وقطع الحارس يعود done فتخرج الحلقة بهدوء.
async function read(reader, s) {
  if (!s || !s.on) return reader.read();
  s.reader = reader;
  if (s.stalled) { try { await reader.cancel(); } catch (e) { /* guard-ok — أُغلق أصلًا */ } return { done: true, value: undefined }; }
  try {
    const r = await reader.read();
    if (!r.done && !s.stalled) poke(s);
    return r;
  } catch (e) {
    if (s.stalled) return { done: true, value: undefined };
    throw e;
  }
}

function retryAfterMs(h) {
  try {
    const v = h && typeof h.get === 'function' ? h.get('retry-after') : null;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : null;
  } catch (e) { return null; }
}
async function bodyText(r) { try { return String(await r.text()).slice(0, 300); } catch (e) { return ''; } }
function synth(r, t) { return { ok: false, status: r.status, headers: r.headers || null, text: async () => t }; }

/* C4 + C1: بعد النداء الأوّل للخطوة. (أ) وسيط/مزوّد رفض tool_choice (400 يذكره) = إعادة بلاه، ويُذكَر للدور.
   (ب) المفتاح المباشر مشغول/حدّ = إعادة النداء نفسه حتّى مرّتين؛ الرصيد/الحصّة لا يُعاد. ما بعدها = السلسلة القائمة. */
async function retryBusy(up, again, s, o) {
  if (!s || !s.on || !up || up.ok) return up;
  let r = up;
  if (r.status === 400 && s.final && s.choice && !s.noChoice) {
    const t = await bodyText(r);
    r = synth(r, t);
    if (/tool_choice/i.test(t)) { s.noChoice = true; r = await again(); if (r.ok) return r; }
  }
  if (!o || !o.direct) return r;
  for (let i = 0; i < 2 && r && !r.ok && !r.stall && BUSY.has(Number(r.status)); i++) { // صمت الحارس ليس «مشغولًا»: لا ٧٥ ث أخرى
    const t = await bodyText(r);
    r = synth(r, t);
    if (/credit|balance|billing|insufficient|quota|payment/i.test(t)) break;
    const ra = retryAfterMs(r.headers);
    const wait = ra != null ? ra : [800, 2000][i];
    if (s.retryMs + wait > RETRY_CAP_MS || Date.now() - o.t0 + wait > o.MAX_MS - margin(o.MAX_MS)) break;
    s.retryMs += wait;
    if (o.send) o.send({ status: '⏳ المزوّد مشغول (' + r.status + ') — يعيد المحاولة…' });
    if (wait) await sleep(wait);
    r = await again();
  }
  return r;
}

/* C2 · C5 · C6 · C1: بعد بثّ الخطوة وقبل تنبيه «نفّذ الآن» (owner-carry) — بالترتيب: صمت المزوّد، الرفض، القطع لطوله،
   أداة في الخطوة الختاميّة، الفراغ. يرجع null (لا شيء) أو { kind: 'stall'|'stop'|'continue'|'note', msg|status }. */
function afterStream(s, o) {
  if (!s || !s.on) return null;
  // الصمت بعد stop_reason (ردّ كامل والمقبس بقي مفتوحًا) ليس صمتًا: القطع أغلقه فقط، والخطوة تمضي كأنّ البثّ انتهى.
  if (s.stalled && !o.stopReason) { s.lastStall = s.stalled; return { kind: 'stall', msg: s.stalled }; }
  s.stalled = '';
  const blocks = o.blocks || [];
  const text = stepText(blocks);
  const hasTool = blocks.some((b) => b && b.type === 'tool_use');
  if (o.stopReason === 'refusal') {
    const cat = s.stopDetails && s.stopDetails.category ? String(s.stopDetails.category).slice(0, 40) : '';
    return { kind: 'stop', msg: 'رفض المزوّد الطلب' + (cat ? ' (' + cat + ')' : '') };
  }
  if (o.stopReason === 'max_tokens') {
    if (s.conts < 2 && o.steps < o.MAX_STEPS && Date.now() - o.t0 < o.MAX_MS - margin(o.MAX_MS)) {
      s.conts++; // D1: تفكير الجولة المقطوعة (الموقَّع) يعود مع الجزء المكتوب — بترتيبه
      o.convo.push({ role: 'assistant', content: asSent(o.think, blocks, [{ type: 'text', text: text.trim() ? text : '…' }]) });
      o.convo.push({ role: 'user', content: [{ type: 'text', text: hasTool ? TOOL_CUT_NOTE : CONTINUE_NOTE }] });
      return { kind: 'continue', status: hasTool ? '✂️ انقطع استدعاء الأداة لطوله — لم يُنفَّذ، يعيد بطريقة أقصر…' : '✍️ انقطع لطوله — يكمل من آخر حرف…' };
    }
    return { kind: 'note', msg: CUT_STOP };
  }
  // C1: أداة طُلبت في الخطوة الختاميّة رغم التنبيه — لا تُنفَّذ (لا خطوة بعدها تقرأ نتيجتها)، والسبب للمالك تحت ما كُتب.
  if (s.final && (o.stopReason === 'tool_use' || hasTool)) return { kind: 'stop', msg: exitText(o) };
  if (o.stopReason !== 'tool_use' && !text.trim() && !hasTool) return { kind: 'stop', msg: EMPTY_STOP };
  return null;
}

/* C9 (لقطة المالك ١١ أكتوبر: GPT وصورة و«غير الشكل كامل» ← «⚠️ ما قدرت أردّ الحين» ثلاث مرّات بلا سبب): خطأ داخل بثّ المسار
   المباشر (oa-direct يرمي OA_STREAM_PROTOCOL_ERROR لحدث error أو response.failed أو بثّ بلا حدث ختام) كان يقفز إلى catch الأعلى
   في chat.js فيصل العميل «chat error» بلا ownerStop: لا إعادة، والعميل يمحو السبب. الآن قبل أيّ حرف في الخطوة = النداء نفسه مرّة
   واحدة في الدور (مثل C4) لفشل المزوّد أو انقطاع بثّه، وبعد حرف أو إعادة فاشلة = توقّف بسبب ظاهر وكود المزوّد. غير هذا الخطأ يمضي كما كان (null). */
function midCode(m) {
  const t = String(m || '');
  const k = /provider error — ([a-z_]{2,40})/.exec(t) || /response\.incomplete — ([a-z_]{2,40})/.exec(t);
  if (k) return k[1];
  if (/without response terminal|without \[DONE\]/.test(t)) return 'stream_cut';
  if (/function_call arguments|tool arguments JSON/.test(t)) return 'tool_args_cut';
  if (/invalid SSE/.test(t)) return 'bad_sse';
  return '';
}
// انقطاع اتّصال المزوّد أثناء القراءة (undici: «terminated» / «other side closed») — لقطة المالك الثانية: DeepSeek عبر الوسيط و«افحص الأمان».
// نصوص الشبكة وحدها: TypeError من كود chat.js نفسه (خطأ برمجيّ) لا يُعاد ولا يُسمّى انقطاعًا.
const NET_RE = /^terminated$|other side closed|socket hang up|fetch failed|ECONNRESET|UND_ERR_SOCKET|network error/i;
function midStream(s, e, o) {
  if (!s || !s.on || !e) return null;
  const net = e.code !== 'OA_STREAM_PROTOCOL_ERROR' && (NET_RE.test(String(e.message || '')) || NET_RE.test(String((e.cause && (e.cause.code || e.cause.message)) || '')));
  if (e.code !== 'OA_STREAM_PROTOCOL_ERROR' && !net) return null;
  const c = net ? 'net_cut' : midCode(e.message);
  const why = 'انقطع ردّ المزوّد في منتصفه' + (c ? ' (' + c + ')' : '');
  if (!(o && o.sawText) && !s.midRetried && c !== 'tool_args_cut' && c !== 'bad_sse') { s.midRetried = true; // استدعاء أداة مكسور أو SSE تالف: لا نداء ثانٍ (chat-route-credentials)
    return { kind: 'retry', status: '⏳ ' + why + ' — أعيد مرّة…' }; }
  return { kind: 'stop', msg: why };
}

// C1: خروج الحلقة بلا جواب ختاميّ (حدّ الخطوات أو المهلة) — السبب للمالك بدل «ما قدرت أردّ الحين». خطوة ختاميّة قبل حدّ الخطوات = ختام بالوقت.
function exitText(o) {
  return ((o.steps != null && o.steps < o.MAX_STEPS) || Date.now() - o.t0 > o.MAX_MS)
    ? 'انتهت مهلة الردّ (' + Math.round(o.MAX_MS / 1000) + ' ث) قبل الجواب النهائيّ'
    : 'انتهت ميزانيّة الخطوات (' + o.MAX_STEPS + ') قبل الجواب النهائيّ';
}
// C5: الفشل النهائيّ بعد انقطاع بالحارس قبل الترويسة — سبب المهلة لا «خطأ 504».
function stallNote(s, last) { return (s && s.on && s.lastStall && last && Number(last.status) === 504) ? s.lastStall : ''; }

/* C7: نتائج الأدوات الأقدم تُقصّ (الأخيرة كاملة)، وكتل التفكير تُحذف من كلّ ردود المساعد — D1: قصّ نتيجة قديمة تعديلٌ
   للتاريخ يُبطل كلّ كتلة تفكير بعده (التفكير المحفوظ: الكتلة مقيّدة بما قبلها بايتًا بايتًا)، وإعادة إحداها = 400؛ فالنزع
   كلّه هو الاسترداد الموثَّق، والنصّ ونداءات الأدوات تبقى. نسخة جديدة، أو null إن لم يبقَ ما يُقصّ. */
const SHRINK_KEEP = 1500;
function shrinkOld(convo) {
  if (!Array.isArray(convo)) return null;
  const isTR = (m) => m && m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b && b.type === 'tool_result');
  let lastTR = -1;
  convo.forEach((m, i) => { if (isTR(m)) lastTR = i; });
  let changed = false;
  const out = convo.map((m, i) => {
    if (isTR(m) && i !== lastTR) {
      const content = m.content.map((b) => {
        if (!b || b.type !== 'tool_result') return b;
        const c = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((x) => (x && x.text) || '').join('\n') : String(b.content || ''));
        if (c.length <= SHRINK_KEEP + 80) return b;
        changed = true;
        return Object.assign({}, b, { content: c.slice(0, SHRINK_KEEP) + '\n…[قُصّ لتجاوز نافذة السياق — أعد القراءة إن احتجته]' });
      });
      return Object.assign({}, m, { content });
    }
    if (m && Array.isArray(m.content) && m.content.some(isThink)) {
      changed = true;
      const content = m.content.filter((b) => !isThink(b));
      return Object.assign({}, m, { content: content.length ? content : [{ type: 'text', text: '…' }] });
    }
    return m;
  });
  return changed ? out : null;
}

/* D1 — كتل التفكير بين جولات الأدوات (منقول من agent.js، v-agent-deep). المالك ١٠ أكتوبر: «ما يفكّر… Grok أقوى» — Opus 5.5
   وSonnet 5 وFable 5.1 يفكّرون في كلّ جولة، وكانت كتلهم تُحذف قبل الجولة التالية فتبدأ كلّ أداة بلا تفكير ما قبلها.
   الآن تُلتقط (thinking/redacted_thinking + thinking_delta + signature_delta) وتعود كما وصلت وبترتيبها — للمالك وحده: الكتلة المعادة
   تُفوتَر مدخلًا (كتابة كاش ×1.25 أوّل مرّة ثمّ قراءة ×0.1)، فتعميمها على غير المالك إنفاق ينتظر موافقته، وطلبه يبقى بايتًا بايتًا
   كما كان — وعلى أنثروبيك المباشر وحده (توقيعاته لا تُقبل عند الوسيط). التفكير المحفوظ: الكتلة مقيّدة بالموديل وبما قبلها (system وtools
   وكلّ رسالة) بايتًا بايتًا، فالمفتاح = المسار|الموديل|بصمة system+tools — تغيّر أحدها (تبديل للوسيط أو لمزوّد أو لموديل، أو
   نظام/أدوات تغيّرت) = تُنزع كلّها قبل الإرسال؛ وكلّ تعديل للتاريخ (قصّ C7، ضغط السياق) ينزعها؛ و400 يذكر التفكير/التوقيع =
   نزع وإعادة واحدة (الاسترداد الموثَّق). العرض الملخّص (display) للمالك وحده في دوره الذي يفكّر فيه، على موديلات المنتقي الأحدث — يغيّر الظهور لا
   الفوترة، ولا ميزانيّة تفكير ولا جهد جديدان (لا إنفاق). وملخّصه يصل سطر «↳ 💭» في سجلّ الردّ. */
const DISPLAY_RE = /^claude-(?:opus-5-5|opus-5|opus-4-[678]|sonnet-5-5|sonnet-5|sonnet-4-6|fable-5-1|fable-5|haiku-5-5)$/; // v-owner-claude-all: منتقي المالك كلّه عدا Haiku 4.5 (لا تفكير تكيّفيّ — 400)
const THINK_SHOWN_MAX = 8;
function isThink(b) { return !!b && (b.type === 'thinking' || b.type === 'redacted_thinking'); }
function hasThink(convo) { return Array.isArray(convo) && convo.some((m) => m && Array.isArray(m.content) && m.content.some(isThink)); }
// owner: سطور «↳ 💭»؛ show: العرض الملخّص — دور المالك الذي يفكّر فيه الموديل (ownerThinks)، لا المجاملة الفوريّة (v-owner-auto).
function thinkState(owner, show) { return { owner: !!owner, show: !!(owner && show), key: '', sent: '', direct: false, disp: false, noDisplay: false, shown: 0 }; }
function fp(system, tools) {
  try { return require('crypto').createHash('sha1').update(JSON.stringify([system == null ? null : system, tools == null ? null : tools])).digest('hex').slice(0, 16); }
  catch (e) { return String(Date.now()); } // بصمة غير محسوبة = مفتاح لا يتطابق → نزع (الآمن)
}
// النزع في المكان (رسائل convo نفسها). كتلة تفكير يتيمة تُستبدل بنصّ قصير كي لا تبقى رسالة فارغة.
function stripThink(convo, t) {
  let n = 0;
  (Array.isArray(convo) ? convo : []).forEach((m) => {
    if (!m || !Array.isArray(m.content) || !m.content.some(isThink)) return;
    const c = m.content.filter((b) => !isThink(b));
    n += m.content.length - c.length;
    m.content = c.length ? c : [{ type: 'text', text: '…' }];
  });
  if (t) t.key = '';
  return n;
}
/* قبل كلّ نداء (جسم الطلب مبنيّ): route = 'a' أنثروبيك المباشر، 'or' الوسيط، 'x' المزوّد المباشر (oa-direct). */
function think(b, t, convo, route) {
  if (!t || !b) return b;
  const model = String(b.model || '');
  t.direct = route === 'a';
  t.sent = route + '|' + model + '|' + fp(b.system, b.tools);
  if (t.key !== t.sent && hasThink(convo)) {
    stripThink(convo, t);
    if (Array.isArray(b.messages) && b.messages !== convo) stripThink(b.messages); // نسخة markLastForCache: آخر رسالة منسوخة
  }
  t.disp = false;
  if (t.show && t.direct && !t.noDisplay && (b.thinking === undefined || (b.thinking && b.thinking.type === 'adaptive' && !b.thinking.display)) && DISPLAY_RE.test(model)) { b.thinking = { type: 'adaptive', display: 'summarized' }; t.disp = true; } // v-owner-claude-all: تكيّفيّ بلا عرض (جهد المالك على 4.x) يأخذ العرض؛ وبعد رفض العرض (noDisplay) يبقى التفكير بلا عرض
  return b;
}
/* 400 يذكر التفكير أو التوقيع (أو العرض) = تُنزع كلّ الكتل وإعادة واحدة؛ والعرض يُطفأ للدور إن لم يكن الرفض عن كتلة في الرسائل
   (حقل thinking نفسه). بلا عرض: النزع لرفضٍ عن كتلة في الرسائل وحده (توقيع أو messages.N) — 400 عن حقول الجهد/التفكير
   (المجاملة الفوريّة v-owner-auto، إعداد الصورة) يمرّ لمعالجه بنصّه ولا يُضيّع تفكير الدور. والسبب سطر «↳» للمالك لا صمت. */
async function think400(up, t, convo, again, send) {
  if (!t || !t.owner || !up || up.ok || Number(up.status) !== 400 || !(t.disp || hasThink(convo))) return up;
  const why = await bodyText(up);
  const blk = /signature|messages\.\d+/i.test(why);
  if (!/thinking|signature|display/i.test(why) || (!t.disp && !blk)) return synth(up, why);
  const n = stripThink(convo, t);
  const off = t.disp && !blk;
  if (off) t.noDisplay = true;
  try { await require('./log-error.js').logErrorAndFlush('chat/thinking-replay', new Error(why || 'upstream 400'), { action: 'thinking-replay', stripped: n }); } catch (e) { /* guard-ok — التسجيل تحسين لا شرط */ }
  try { if (typeof send === 'function' && (n || off)) send({ status: n ? '↳ ⚠️ رُفض تفكير الجولات السابقة (400) — نُزع وأُعيد الطلب بدونه' : '↳ ⚠️ ملخّص التفكير غير متاح هنا (400) — يكمل بدونه' }); } catch (e) { /* guard-ok — العميل أغلق المجرى */ }
  return again();
}
// البثّ: content_block_start ثمّ الدلتا — نصّ التفكير (فارغ بلا display) وتوقيعه كما وصلا.
function thinkOpen(blk, cb) {
  if (!blk || !cb) return;
  if (cb.type === 'thinking') { blk.thinking = cb.thinking || ''; blk.signature = cb.signature || ''; }
  else if (cb.type === 'redacted_thinking') blk.data = cb.data || '';
}
function thinkDelta(blk, d) {
  if (!blk || !d) return false;
  if (d.type === 'thinking_delta') { blk.thinking = (blk.thinking || '') + (d.thinking || ''); return true; }
  if (d.type === 'signature_delta') { blk.signature = (blk.signature || '') + (d.signature || ''); return true; }
  return false;
}
// نهاية كتلة تفكير فيها ملخّص (المالك وحده): سطره الأوّل «↳ 💭 …» — يدخل سجلّ الردّ (__steps في app-18) كسطور الأدوات.
function thinkStop(t, blk, send) {
  if (!t || !t.owner || !blk || blk.type !== 'thinking' || typeof send !== 'function' || t.shown >= THINK_SHOWN_MAX) return;
  const first = String(blk.thinking || '').split('\n').map((x) => x.replace(/[*#_`>]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)[0] || '';
  if (!first) return;
  t.shown++;
  try { send({ status: '↳ 💭 ' + (first.length > 160 ? first.slice(0, 159) + '…' : first) }); } catch (e) { /* guard-ok — العميل أغلق المجرى */ }
}
// ردّ المساعد: كتلة التفكير كما وصلت (undefined = ليست تفكيرًا، null = لا تُعاد: مسار آخر أو بلا توقيع).
function thinkOut(t, cb) {
  if (!isThink(cb)) return undefined;
  if (!t || !t.direct || !t.owner) return null; // غير المالك: تُحذف كما كانت (لا إنفاق جديد)
  if (cb.type === 'thinking') { if (!cb.signature) return null; t.key = t.sent; return { type: 'thinking', thinking: cb.thinking || '', signature: cb.signature }; }
  if (!cb.data) return null;
  t.key = t.sent;
  return { type: 'redacted_thinking', data: cb.data };
}
/* owner-carry وإكمال C2: ردّ الجولة كما وصل (تفكير موقَّع + نصّ بترتيبهما، بلا أدوات) — أو plain كما كان حين لا تفكير يُعاد.
   كتلة أُسقطت (نصّ فراغ، أداة مقطوعة، تفكير بلا توقيع) تغيّر ما قبل كلّ تفكير بعدها في الرسالة: فذاك لا يُعاد (نزع ذيل لا وسط). */
function asSent(t, blocks, plain) {
  const out = [];
  let th = false, cut = false;
  for (const cb of (blocks || [])) {
    if (!cb) continue;
    const k = thinkOut(t, cb);
    if (k && !cut) { out.push(k); th = true; } else if (cb.type === 'text' && cb.text && cb.text.trim()) out.push({ type: 'text', text: cb.text });
    else cut = true;
  }
  if (!th) return plain;
  if (!out.some((b) => b.type === 'text')) out.push({ type: 'text', text: '…' });
  return out;
}

/* ردّ جولة الأدوات (assistantContent في chat.js) قبل ترشيحه: نصّ فراغ يُسقطه المرشّح (أنثروبيك يرفض نصًّا فارغًا) أو كتلة
   لا تُعاد = ما قبل كلّ تفكير بعدها في الرسالة تغيّر، وإعادته 400 على الحسابات المُلزَمة — فيسقط ذاك التفكير معها (نزع ذيل
   الرسالة يُبقي ما قبله صالحًا، والجولات التالية تُبنى على ما أُرسل). غير المالك: كتله null أصلًا، والنتيجة كما كانت. */
function thinkTail(out) {
  let cut = false;
  return (out || []).map((c) => {
    if (isThink(c)) return cut ? null : c;
    if (!c || (c.type === 'text' && !(c.text && c.text.trim()))) cut = true;
    return c;
  });
}

/* C8: موديل مختار رفضه المفتاح بلا صلاحيّة — الدالّة الدافئة أوّلًا ثمّ KV. الاحتياط إلى الافتراضيّ نفسه باقٍ (قرار المالك). */
/* المفتاح = معرّف الموديل كما يُرسَل، وهو خاصّ بالمسار أصلًا (أنثروبيك المباشر «claude-fable-5-1»، الوسيط «anthropic/claude-fable-5.1»
   — CLAUDE_MODELS.or في chat.js)، فرفض حساب لا يُسقط الموديل على حساب آخر. */
const deadPicks = new Map();
function deadKey(model) { return 'chat/deadpick/' + String(model || '').slice(0, 120); }
async function isDeadPick(model) {
  const m = String(model || '');
  if (!m) return false;
  const until = deadPicks.get(m);
  if (until && until > Date.now()) return true;
  try {
    const v = await require('./kv.js').kvGetJSON(deadKey(m));
    if (v && Number(v.until) > Date.now()) { deadPicks.set(m, Number(v.until)); return true; }
  } catch (e) { /* guard-ok — الذاكرة تحسين لا شرط: بلاها يُجرَّب الموديل كما كان */ }
  return false;
}
async function rememberDeadPick(model, status, text, gone) {
  const m = String(model || '');
  if (!m || !(gone || ACCESS_RE.test(String(text || '')))) return false; // v-owner-claude-all: gone = افتراضيّ المالك (Opus 5.5) غير موجود على المفتاح — لا اختيار محفوظ يمسحه العميل، فيُذكر هنا
  const until = Date.now() + DEAD_TTL_S * 1000;
  deadPicks.set(m, until);
  try {
    const kv = require('./kv.js');
    await kv.kvPutJSON(deadKey(m), { until, status: Number(status) || 0 });
    await kv.kvExpire(deadKey(m), DEAD_TTL_S);
  } catch (e) { /* guard-ok — الذاكرة الدافئة تكفي هذه النسخة */ }
  return true;
}

module.exports = {
  state, beginStep, shape, signal, got, fetchFailed, read, stop, retryBusy, afterStream, midStream, midCode, exitText, stallNote, shrinkOld,
  isDeadPick, rememberDeadPick, margin,
  thinkState, think, think400, thinkOpen, thinkDelta, thinkStop, thinkOut, asSent, thinkTail, stripThink, hasThink, isThink, DISPLAY_RE, // D1
  FINAL_NOTE, CONTINUE_NOTE, TOOL_CUT_NOTE, CUT_STOP, EMPTY_STOP, __deadPicks: deadPicks,
};
