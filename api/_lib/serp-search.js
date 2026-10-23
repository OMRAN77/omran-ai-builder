'use strict';
/* serp-search.js — v-serp-cards (تحضير ١٨ أكتوبر ٢٠٢٦، بلا اشتراك ولا إنفاق): جوجل يوقف Custom Search JSON API في ١ يناير ٢٠٢٧،
   وعليه تقوم بطاقات المحادثة (cards-search.js) وخطوة «google» في سلسلة البحث الحيّ (chat.js liveSearch). هذا محوّل واحد لنتائج جوجل
   نفسها من ثلاثة مزوّدين — أوّل مفتاح موجود يعمل: SERPER_API_KEY ثمّ SEARCHAPI_API_KEY ثمّ SERPAPI_API_KEY. بلا أيّ منها يرجع null
   في كلّ دالّة فلا يتغيّر شيء (جوجل الحاليّ ثمّ Tavily كما كانا). الاشتراك إنفاق: المفتاح يضيفه المالك وحده بعد موافقته.
   الشكل الموحّد لكلّ مزوّد: organic → [{ title, link, snippet, date }]، وshopping (Serper وحده، وبـCARDS_SHOPPING=on) →
   [{ title, link, source, price, image }]. نتائج التسوّق عند SearchApi وSerpApi روابطها صفحات جوجل لا المتجر (توثيقهما)، فلا تسوّق لهما.
   لا يرمي أبدًا: أيّ فشل شبكة أو HTTP أو JSON = null، فالسلسلة تنتقل للتالي. ولا يطبع المفتاح ولا يضعه في رابط Serper/SearchApi. */

const SERPER_URL = 'https://google.serper.dev';
const SEARCHAPI_URL = 'https://www.searchapi.io/api/v1/search';
const SERPAPI_URL = 'https://serpapi.com/search.json';
/* نافذة الحداثة (winOf في chat.js: week · month · year) بصيغة كلّ مزوّد */
const TBS = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' };
const PERIOD = { day: 'last_day', week: 'last_week', month: 'last_month', year: 'last_year' };

function clean(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n || 200); }
function keyOf(env, name) { return clean(env && env[name], 300); }
function providerOf(env) {
  const e = env || process.env;
  if (keyOf(e, 'SERPER_API_KEY')) return 'serper';
  if (keyOf(e, 'SEARCHAPI_API_KEY')) return 'searchapi';
  if (keyOf(e, 'SERPAPI_API_KEY')) return 'serpapi';
  return '';
}
function shoppingOn(env) {
  const e = env || process.env;
  return providerOf(e) === 'serper' && /^(on|1|true)$/i.test(clean(e.CARDS_SHOPPING, 8));
}
/* gl جوجل: حرفان صغيران، وبريطانيا uk كما في Custom Search */
function glOf(v) { const g = clean(v, 4).toLowerCase(); return /^[a-z]{2}$/.test(g) ? (g === 'gb' ? 'uk' : g) : ''; }

async function getJSON(url, init, o) {
  const f = (o && o.fetch) || globalThis.fetch;
  try {
    const r = await f(url, Object.assign({ signal: AbortSignal.timeout((o && o.timeoutMs) || 12000) }, init));
    if (!r || !r.ok) { console.warn('[serp] HTTP ' + (r && r.status)); return null; }
    return await r.json();
  } catch (e) { console.warn('[serp] ' + (e && e.name)); return null; } // شبكة أو مهلة أو JSON مكسور = التالي في السلسلة
}
function normOrganic(arr) {
  return (Array.isArray(arr) ? arr : []).map((x) => (x && x.link ? { title: clean(x.title, 200), link: clean(x.link, 2000), snippet: clean(x.snippet, 400), date: clean(x.date, 40) } : null)).filter(Boolean);
}

/* نتائج الويب العضويّة (١٠ نتائج = نداء واحد عند كلّ مزوّد). o: { env, fetch, gl, win, timeoutMs } */
async function organic(query, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const q = clean(query, 300);
  const p = providerOf(env);
  if (!q || !p) return null;
  const gl = glOf(o.gl), w = clean(o.win, 8);
  if (p === 'serper') {
    const body = Object.assign({ q, num: 10 }, gl ? { gl } : {}, TBS[w] ? { tbs: TBS[w] } : {});
    const d = await getJSON(SERPER_URL + '/search', { method: 'POST', headers: { 'X-API-KEY': keyOf(env, 'SERPER_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, o);
    return d ? normOrganic(d.organic) : null;
  }
  if (p === 'searchapi') {
    const url = SEARCHAPI_URL + '?engine=google&q=' + encodeURIComponent(q) + (gl ? '&gl=' + gl : '') + (PERIOD[w] ? '&time_period=' + PERIOD[w] : '');
    const d = await getJSON(url, { headers: { Authorization: 'Bearer ' + keyOf(env, 'SEARCHAPI_API_KEY') } }, o);
    return d ? normOrganic(d.organic_results) : null;
  }
  /* SerpApi: المفتاح معامل في الرابط وحده (لا ترويسة في توثيقه) — الرابط لا يُطبع هنا */
  const url = SERPAPI_URL + '?engine=google&q=' + encodeURIComponent(q) + (gl ? '&gl=' + gl : '') + (TBS[w] ? '&tbs=' + encodeURIComponent(TBS[w]) : '') + '&api_key=' + encodeURIComponent(keyOf(env, 'SERPAPI_API_KEY'));
  const d = await getJSON(url, {}, o);
  return d ? normOrganic(d.organic_results) : null;
}

/* نتائج التسوّق (Serper /shopping = رصيدان): اسم المنتج وسعره بعملة البلد وصورته ومتجره ورابطه. null إن لم يُفعَّل */
async function shopping(query, opts) {
  const o = opts || {};
  const env = o.env || process.env;
  const q = clean(query, 300);
  if (!q || !shoppingOn(env)) return null;
  const gl = glOf(o.gl);
  const d = await getJSON(SERPER_URL + '/shopping', { method: 'POST', headers: { 'X-API-KEY': keyOf(env, 'SERPER_API_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ q }, gl ? { gl } : {})) }, o);
  if (!d) return null;
  return (Array.isArray(d.shopping) ? d.shopping : []).map((x) => (x && x.link ? { title: clean(x.title, 200), link: clean(x.link, 2000), source: clean(x.source, 80), price: clean(x.price, 40), image: clean(x.imageUrl, 2000) } : null)).filter(Boolean);
}

/* خطوة البحث الحيّ (مكان gcseSearch قبله): ستّ نتائج مرقّمة بالصيغة نفسها، والمصدر باسم وظيفيّ (قد ينقله الموديل للمستخدم) */
async function liveText(query, opts) {
  const items = await organic(query, opts);
  if (!items || !items.length) return null;
  return items.slice(0, 6).map((x, i) => (i + 1) + '. ' + x.title + (x.date ? ' (نُشر: ' + x.date + ')' : '') + '\n' + x.link + '\n' + x.snippet.slice(0, 300)).join('\n\n')
    + '\n\nالمصدر: بحث الويب.';
}

module.exports = { providerOf, shoppingOn, organic, shopping, liveText, __glOf: glOf };
