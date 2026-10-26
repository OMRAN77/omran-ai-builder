'use strict';
// v-video-names (مراجعة باب المال الثانية، ١٦ أكتوبر): تصنيف رفض المزوّد عند بدء الفيديو — ثلاثة لا اثنان، بلا اسم مزوّد.
//  - ٤٢٩ و٥xx: مؤقّت يُعاد (retryable).
//  - ٤٠١/٤٠٣/٤٠٤ أو نصّ مفتاح/صلاحيّة/فوترة/نموذج: عطب عندنا (المفتاح أو النموذج أو رصيد المزوّد) لا ذنب المستخدم — «غيّر الوصف»
//    كان يلومه على ما لا يملكه، و٤٠١ الممرَّر كان يفتح «سجّل الدخول» في الترندات؛ فيُردّ ٥٠٢.
//  - ما بقي من 4xx: رفضٌ للطلب نفسه (وصف أو صورة) فلا يُعاد كما هو.
// النصّ التقنيّ للسجلّ عند المتّصل؛ هنا للتصنيف وحده.
const TEMP = 'تعذّر بدء الفيديو مؤقتًا — أعد المحاولة بعد لحظات.';
const OURS = 'تعذّر توليد الفيديو الآن. أعد المحاولة لاحقًا.';
const BAD = 'تعذّر بدء الفيديو بهذا الطلب — غيّر الوصف أو الصورة وأعد المحاولة.';
const OURS_RE = /api[ _-]?key|unauthori[sz]ed|permission|forbidden|billing|credits?\b|insufficient balance|deprecated|unknown model|invalid model|model\b.{0,60}?\b(?:not (?:found|available|supported)|unavailable)/i;

/* v-credit-out (أمر المالك ٢١ أكتوبر: «إذا رصيد مزوّد الصور أو الفيديو خلصان، المستخدم يشوف رسالة واضحة «الخدمة متوقفة مؤقتاً» وما تنخصم
   منه ولا نقطة»): نفاد رصيد المزوّد يأتي أحيانًا ٤٢٩ («Your prepayment credits are depleted») فكان يُقرأ زحامًا «أعد المحاولة بعد لحظات»
   فيعيد العميل ويخصم ويردّ مرّة بعد مرّة. نصّ الرصيد/الفوترة يُفحص أوّلًا أيًّا كانت الحالة، و٤٠١/٤٠٢/٤٠٣ عطب عندنا لا يحلّه الانتظار.
   «quota» وحدها لا تكفي: «Resource has been exhausted (e.g. check quota)» زحام عابر عند المزوّد. */
const CREDIT_RE = /prepay|billing|api[ _-]?key (?:not valid|invalid|expired)|(?:invalid|incorrect) api[ _-]?key|credits? (?:are |is |have been )?(?:depleted|exhausted|run out)|out of credits?|exhausted balance|insufficient[ _](?:balance|credits?|funds|quota)|exceeded your current quota|user is locked/i;
function isOutage(status, tech) {
  const st = Number(status) || 0;
  return st === 401 || st === 402 || st === 403 || CREDIT_RE.test(String(tech || ''));
}

/* v-credit-out: العطب عندنا (رصيد المزوّد، المفتاح، الصلاحيّة، النموذج) رمز unavailable بـ503 لا نصّ عربيّ ثابت — فيعرض العميل
   «الخدمة متوقّفة مؤقّتًا» بلغة واجهته (svcPaused) ولا يعيد (retryable:false)؛ كان OURS عربيًّا في كلّ اللغات ولا يقول «متوقّفة». */
function startFail(status, tech) {
  const st = Number(status) || 0;
  const busy = st === 429 || st >= 500;
  if (isOutage(st, tech) || st === 404 || (!busy && OURS_RE.test(String(tech || '')))) return { code: 503, body: { error: 'unavailable', retryable: false } };
  /* v-vid-codes (تدقيق ١٨ أكتوبر: الواجهة الإنجليزيّة تعرض «❌ Error: تعذّر بدء الفيديو…» عربيًّا): رمز في error يترجمه العميل (vidBusy · vidRejected،
     ١٤ لغة) والنصّ العربيّ نفسه في message_ar لمن يقرؤه. */
  if (busy) return { code: st, body: { error: 'video_busy', message_ar: TEMP, retryable: true } };
  return { code: st || 502, body: { error: 'video_rejected', message_ar: BAD, retryable: false } };
}

/* v-provider-fail (تدقيق ١٨–١٩ أكتوبر: «Your prepayment credits are depleted. Please go to AI Studio…» بروابط فوترة المزوّد ظهر
   للمستخدم في «نفس المكتوب بس مرتب» و«اقترح لي ستايل»): أدوات القراءة والاقتراح كانت تمرّر error.message المزوّد وحالته كما هما.
   رمزٌ لا نصّ، والعميل يعرض نصّ واجهته:
   - زحام (٤٢٩/٥xx) أو عطب عندنا (٤٠١/٤٠٢/٤٠٣/٤٠٤ أو نصّ مفتاح/صلاحيّة/فوترة/رصيد/نموذج) = unavailable بـ503 — لا ذنب للمستخدم
     ولا يصلحه اشتراكه، و402 لا يُمرَّر (رصيد مزوّدنا ليس رصيد المستخدم — PITFALLS v-plans-gate).
   - ما بقي من 4xx = failed بـ502: رفضٌ للطلب نفسه (صورة لا تُقرأ…).
   النصّ التقنيّ للسجلّ عند المتّصل؛ هنا للتصنيف وحده. */
function toolFail(status, tech) {
  const st = Number(status) || 0;
  if (st === 429 || st >= 500 || isOutage(st, tech) || st === 404 || OURS_RE.test(String(tech || ''))) {
    return { code: 503, body: { error: 'unavailable' } };
  }
  return { code: 502, body: { error: 'failed' } };
}

/* v-audit-prov (srv-providers-5): روابط المحادثة المباشرة القديمة (/api/gemini · groq · mistral · cohere · deepseek · perplexity ·
   openrouter · openai · claude) كانت تمرّر جسم خطأ المزوّد خامًا («Gemini (400): …» برقم مشروع جوجل، «The model `openai/gpt-oss-20b` …»)،
   والعميل يعرضه في سطر الحالة والفقاعة لكلّ مستخدم — قاعدة المالك: لا اسم مزوّد ولا موديل في نصّ يراه المستخدم.
   لغير المالك رمز بلا نصّ، والحالة نفسها لأنّ احتياط العميل يقرّر بها (429 «انتهت مؤقتًا»، 5xx تحويل):
   - خطأ النموذج (free-chain.isModelError) = model_not_found — به يهبط دور صورة Groq إلى «الوصف ثمّ النصّ» في العميل.
   - عطب عندنا (٤٠١/٤٠٢/٤٠٣ أو نصّ رصيد/مفتاح — isOutage) = unavailable بـ503: 402 رصيد مزوّدنا كان يُقرأ «وصلت حدّك اليوميّ»
     و401 «مفتاحك غير صحيح» للمستخدم (رصيد مزوّدنا ليس رصيد المستخدم — PITFALLS).
   - ما بقي = upstream_error بحالته.
   النصّ التقنيّ للسجلّ، والمالك يراه كما هو للتشخيص. */
function chatFail(res, tag, status, tech, owner) {
  const st = Number(status) || 502;
  const raw = String(tech || '');
  if (owner) { res.status(st).setHeader('Content-Type', 'application/json').send(raw || '{"error":"provider_failed"}'); return; }
  console.error('[' + tag + '] upstream ' + st + ': ' + raw.slice(0, 300));
  if (require('./free-chain.js').isModelErrorStatus(st, raw)) { res.status(st).json({ error: 'provider_failed', code: 'model_not_found' }); return; }
  if (isOutage(st, raw)) { res.status(503).json({ error: 'provider_failed', code: 'unavailable' }); return; }
  res.status(st).json({ error: 'provider_failed', code: 'upstream_error' });
}

module.exports = { startFail, toolFail, chatFail, isOutage, TEMP, OURS, BAD };
