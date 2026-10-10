'use strict';
/* api/_lib/live-fresh.js — v-live-fresh (المالك أوّل أكتوبر ٢٠٢٦: «اريد المعلومات التواريخ الجديدة… ما اريد انا ابحث
   اليوم ويعطيني تاريخ قديم»).

   قبل هذا: قيد الحداثة لا يعمل إلّا لكلمات الأخبار («خبر، اليوم، أحدث…»)، وما سواها يبحث في كلّ الأزمنة؛ واستعلام
   النموذج نفسه قد يحمل سنة من ذاكرته («سعر الذهب 2024») فيجرّ نتائج تلك السنة مهما قيّدنا.
   هنا ثلاثة أشياء صغيرة:
   ١) نافذة زمنيّة لكلّ بحث: الأخبار أسبوع (كما كانت)، العروض شهر، وكلّ ما سواها آخر سنة — إلّا إذا سأل المستخدم
      نفسه عن الماضي (سنة قديمة في كلامه أو «الماضي/السابق/زمان») فلا قيد.
   ٢) سنة قديمة في استعلام النموذج لم يذكرها المستخدم تُحذف، فيبحث المحرّك عن الأحدث بدل سنة ذاكرة النموذج.
   ٣) سطر للنموذج مع كلّ نتيجة: تاريخ اليوم، ونافذة البحث، وأن يقدّم الأحدث بتاريخه ولا يقدّم القديم كأنّه جديد. */

/** الأرقام العربيّة والفارسيّة إلى لاتينيّة — «٢٠٢٤» و«2024» سنة واحدة */
function normDigits(s) {
  return String(s || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0));
}
function yearsIn(s) {
  return (normDigits(s).match(/(?<!\d)(?:19|20)\d{2}(?!\d)/g) || []).map(Number);
}

const PAST_RE = /الماضي|الماضية|السابق|السابقة|زمان|قبل\s+(?:\d+|سنة|سنتين|سنوات|عام|عامين|أعوام|قرن)|last year|in the past|history of|historical/i;

/** هل يسأل المستخدم نفسه عن الماضي؟ سنة قبل هذه السنة في كلامه، أو كلمة ماضٍ صريحة */
function asksPast(userText, now) {
  const y = (now || new Date()).getUTCFullYear();
  const t = String(userText || '');
  return yearsIn(t).some((v) => v < y) || PAST_RE.test(t);
}

/** نصّ آخر n رسائل للمستخدم (نصّ عاديّ أو كتل text) — منه نعرف السنة التي ذكرها هو لا النموذج */
function userTextOf(messages, n) {
  return (Array.isArray(messages) ? messages : []).filter((m) => m && m.role === 'user').slice(-(n || 3))
    .map((m) => (typeof m.content === 'string' ? m.content
      : (Array.isArray(m.content) ? m.content.filter((b) => b && b.type === 'text').map((b) => String(b.text || '')).join(' ') : '')))
    .join('\n');
}

/** نافذة البحث: 'week' | 'month' | 'year' | '' (بلا قيد). الأخبار تبقى أسبوعًا كما كانت (v-fresh-news). */
function searchWindow(opts) {
  const o = opts || {};
  if (o.fresh) return 'week';
  if (asksPast(o.userText, o.now)) return '';
  if (o.deals) return 'month';
  return 'year';
}

/** يحذف من استعلام النموذج سنوات الأعوام الثلاثة الماضية التي لم يذكرها المستخدم (مع «في عام/in» قبلها) */
function stripStaleYears(query, userText, now) {
  const y = (now || new Date()).getUTCFullYear();
  const said = new Set(yearsIn(userText));
  const q = normDigits(query);
  const out = q.replace(/(?:\b(?:in|for|of)\s+|(?:في\s+)?(?:عام|سنة|لعام|لسنة)\s+)?(?<!\d)(20\d{2})(?!\d)/gi, (full, yr) => {
    const v = Number(yr);
    return (v >= y - 3 && v < y && !said.has(v)) ? ' ' : full;
  }).replace(/\s{2,}/g, ' ').trim();
  return out || String(query || '');
}

/** تاريخ اليوم YYYY-MM-DD بمنطقة جهاز المستخدم (كما في nowNote)، وإلّا UTC */
function todayIn(tz, now) {
  const d = now || new Date();
  const zone = (typeof tz === 'string' && /^[A-Za-z_]+\/[A-Za-z_\/+\-0-9]+$/.test(tz)) ? tz : '';
  if (zone) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch (e) { /* منطقة لا يعرفها Intl — UTC أدناه */ }
  }
  return d.toISOString().slice(0, 10);
}

const WIN_AR = { week: 'آخر أسبوع', month: 'آخر شهر', year: 'آخر سنة' };
/** سطر الحداثة الذي يرافق نتيجة البحث إلى النموذج — يصل المالك الخامّ أيضًا لأنّه داخل نتيجة الأداة لا في النظام */
function freshNote(win, tz, now) {
  const today = todayIn(tz, now);
  if (!win) return '\n\n[التاريخ]: اليوم ' + today + '. اذكر تاريخ كلّ معلومة بجانبها متى ظهر.';
  return '\n\n[الحداثة — إلزاميّ]: اليوم ' + today + '، والبحث مقيّد بـ' + WIN_AR[win] + '. '
    + 'قدّم أحدث معلومة أوّلًا واذكر تاريخها بجانبها متى ظهر. لا تقدّم معلومة قديمة كأنّها جديدة؛ '
    + 'وإن لم تجد إلّا قديمًا فقل صراحةً «أحدث ما وجدته بتاريخ كذا».';
}

/* أسماء النافذة لكلّ مزوّد: Tavily time_range وPerplexity search_recency_filter يقبلان الكلمة نفسها؛ Google بالرمز */
const GOOGLE_RESTRICT = { week: 'w1', month: 'm1', year: 'y1' };

module.exports = { normDigits, yearsIn, asksPast, userTextOf, searchWindow, stripStaleYears, todayIn, freshNote, GOOGLE_RESTRICT, PAST_RE };
