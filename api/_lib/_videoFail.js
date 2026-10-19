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

function startFail(status, tech) {
  const st = Number(status) || 0;
  if (st === 429 || st >= 500) return { code: st, body: { error: TEMP, retryable: true } };
  if (st === 401 || st === 403 || st === 404 || OURS_RE.test(String(tech || ''))) return { code: 502, body: { error: OURS, retryable: false } };
  return { code: st || 502, body: { error: BAD, retryable: false } };
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
  if (st === 429 || st >= 500 || st === 401 || st === 402 || st === 403 || st === 404 || OURS_RE.test(String(tech || ''))) {
    return { code: 503, body: { error: 'unavailable' } };
  }
  return { code: 502, body: { error: 'failed' } };
}

module.exports = { startFail, toolFail, TEMP, OURS, BAD };
