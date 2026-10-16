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

module.exports = { startFail, TEMP, OURS, BAD };
