'use strict';
/* cards-search.js — v-cards (أمر المالك ١٢ أكتوبر، لقطات جوجل وChatGPT: «اذا اريد اطالب اي شي تطلعي نفس هذي الأفكار — شي نظامي…
   نماذج وعقب يعطيني المواقع… وآخر شي التتبع على نفس الموضوع ويعطيه الأفضل»): طلب عامّ («أبغى رنقات ENVE بكم»، «بذور زراعة»، «جوّال
   بالتقسيط») لا يُجاب سردًا، بل بطاقات منظّمة (صورة · عنوان · سعر · متجر · رابط) تُبثّ للعميل حدثًا `cards`، ومواقعها حدث `sources`
   القائم، واقتراحات قريبة (رقائق) يختارها الموديل، ثمّ سؤال متابعة واحد على الموضوع نفسه وترشيح الأفضل (تعليمة CARDS_NOTE في chat.js).
   v-cards-place (المالك ١٣ أكتوبر): البحث والرقاقات على نفس المطلوب في نفس المكان الذي طلبه (أو دولة تسوّقه) — بلا قائمة أصناف.
   المصدر: Google Custom Search بحقل pagemap (الصورة والسعر)، وTavily احتياطًا بلا صور. لا مفتاح جديد. */

const TOOL = {
  name: 'show_cards',
  description: 'اعرض للمستخدم خيارات منظّمة في بطاقات (صورة · اسم · سعر · متجر · رابط) تُرسم له تلقائيًّا. استعملها بدل web_search كلّما طلب شيئًا عامًّا ليختار منه: منتجًا أو سلعة («أبغى رنقات كربون بكم»، «بذور زراعة»، «جوّال بالتقسيط»)، أو خدمة أو محلًّا أو موقعًا أو مكانًا أو خطّة أو «أفضل X». مرّة واحدة في الردّ. query = المطلوب كما قاله + مكانه: إن سمّى بلدًا أو مدينة فهما، وإلّا دولة تسوّقه. بالإنجليزيّة للمنتجات والخدمات، وبالعربيّة إن كان الطلب محلّيًّا صرفًا. لا توسّع لصنف آخر. chips: ٣–٦ فروقات لنفس المطلوب في نفس المكان (سعر · مقاس · لون · طراز) بلغة المستخدم — لا منتج آخر ولا بلد آخر. بعد البطاقات لا تعِد سردها نصًّا: سطر أو سطران، ثمّ سؤال متابعة واحد يضيّق نفس المطلوب، وعند جوابه رشّح الأفضل واحدًا بسبب ورابط.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'عبارة البحث: المطلوب كما طُلب وفي مكانه' },
      chips: { type: 'array', items: { type: 'string' }, description: '٣–٦ فروقات لنفس المطلوب في نفس المكان' },
      kind: { type: 'string', enum: ['product', 'service', 'place', 'site', 'other'], description: 'نوع المطلوب' },
    },
    required: ['query'],
  },
};

const CSE_URL = 'https://www.googleapis.com/customsearch/v1';
const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_CARDS = 8;
const FETCH_CAP = 10;
// سعر داخل نصّ: «AED 1,299» · «1,299 درهم» · «$49.99» · «SAR 120» · «1.5k د.إ»
const PRICE_RE = /(?:(?:AED|SAR|QAR|KWD|OMR|BHD|USD|EUR|GBP|EGP|Dhs?|Rs\.?|د\.?\s?إ|ر\.?\s?س|ر\.?\s?ق|د\.?\s?ك|ج\.?\s?م|\$|€|£)\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:AED|SAR|QAR|KWD|OMR|BHD|USD|EUR|GBP|EGP|Dhs?|درهم|دراهم|ريال|دينار|جنيه|دولار|يورو|د\.?\s?إ|ر\.?\s?س|ر\.?\s?ق|د\.?\s?ك|ج\.?\s?م|\$|€|£))/i;
const PLACE_STOP = /^(the|and|for|with|from|price|prices|buy|best|shop|store|sale|in|of|to|a|an|or|on|at|uae|usa|uk|us)$/i;
const SHOP_TLD = new Set('ae sa eg kw qa bh om jo lb us uk de fr it es nl se no dk pl ru tr in pk jp kr cn au nz za ca br'.split(' '));

function clean(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n || 200); }
function hostOf(url) { try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function httpsOnly(u) { const s = clean(u, 2000); return /^https?:\/\//i.test(s) ? s : ''; }
function priceIn(text) { const m = PRICE_RE.exec(String(text || '')); return m ? clean(m[0], 32) : ''; }
function geo() {
  const s = require('./search.js');
  return {
    regionOf: typeof s.regionOf === 'function' ? s.regionOf : function () { return ''; },
    hasRegion: typeof s.hasRegion === 'function' ? s.hasRegion : function (t, cc) { return typeof s.regionOf === 'function' && s.regionOf(t) === cc; },
  };
}
function ccOf(v) { const c = String(v || '').trim().toUpperCase(); return /^[A-Z]{2}$/.test(c) ? c : ''; }
function placeLabel(cc) {
  const c = ccOf(cc); if (!c) return '';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c) || ''; } catch (e) { return ''; }
}
function glOf(cc) { const c = ccOf(cc); return !c ? '' : (c === 'GB' ? 'uk' : c.toLowerCase()); }
function crOf(cc) { const c = ccOf(cc); return c ? 'country' + c : ''; }
function placeOf(ask, query, country) {
  const g = geo();
  return g.regionOf(ask) || g.regionOf(query) || ccOf(country);
}
function pinQuery(query, o) {
  const ask = clean(o && o.ask, 300);
  let q = clean(query, 300);
  if (!q) return '';
  const latin = (ask.match(/[A-Za-z][A-Za-z0-9+\-.]{1,}/g) || []).filter((w) => w.length >= 2 && !PLACE_STOP.test(w));
  for (let i = latin.length - 1; i >= 0; i--) {
    const w = latin[i];
    const re = new RegExp('(?:^|[^A-Za-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^A-Za-z0-9]|$)', 'i');
    if (!re.test(q)) q = w + ' ' + q;
  }
  const cc = placeOf(ask, q, o && o.country);
  const lab = placeLabel(cc);
  if (lab && !geo().regionOf(q) && !new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(q)) q = q + ' ' + lab;
  else if (lab && geo().regionOf(ask) && geo().regionOf(q) && geo().regionOf(ask) !== geo().regionOf(q) && !new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(q)) q = q + ' ' + lab;
  return clean(q, 380);
}
function tldCc(url) {
  let host = '';
  try { host = new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return '';
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (['com', 'co', 'net', 'org', 'gov'].includes(prev) && SHOP_TLD.has(last)) return last === 'uk' ? 'GB' : last.toUpperCase();
  if (last === 'uk') return 'GB';
  if (SHOP_TLD.has(last)) return last.toUpperCase();
  return '';
}
function placeOk(text, cc) {
  if (!ccOf(cc)) return true;
  const g = geo();
  const blob = String(text || '');
  if (g.hasRegion(blob, cc)) return true;
  const other = g.regionOf(blob);
  if (other && other !== cc) return false;
  return true;
}
function contentTerms(q, cc) {
  let s = String(q || '');
  const lab = placeLabel(cc);
  if (lab) s = s.replace(new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  return s.split(/[^\p{L}\p{N}+.-]+/u).filter((w) => w.length >= 3 && !PLACE_STOP.test(w));
}
function onTopic(card, terms) {
  if (!terms.length) return true;
  const blob = ((card.title || '') + ' ' + (card.snippet || '') + ' ' + (card.url || '')).toLowerCase();
  return terms.some((t) => blob.includes(t.toLowerCase()));
}
function keepOnRequest(items, query, cc) {
  const terms = contentTerms(query, cc);
  return (items || []).filter((c) => {
    if (!c) return false;
    const blob = [c.title, c.snippet, c.site, c.url].filter(Boolean).join(' ');
    if (!placeOk(blob, cc)) return false;
    const hostCc = tldCc(c.url);
    if (hostCc && ccOf(cc) && hostCc !== ccOf(cc)) return false;
    if (!onTopic(c, terms)) return false;
    return true;
  });
}
function scopeChips(chips, cc) {
  return (chips || []).filter((s) => placeOk(s, cc));
}

/* صورة النتيجة من pagemap بترتيب الثقة: صورة الصفحة الكبيرة، ثمّ og:image، ثمّ صورة المنتج، ثمّ المصغّرة (آخرها لأنّها صغيرة) */
function imageOf(pm) {
  const p = pm || {};
  const first = (arr, key) => (Array.isArray(arr) && arr[0] && arr[0][key]) ? httpsOnly(arr[0][key]) : '';
  return first(p.cse_image, 'src') || first(p.metatags, 'og:image') || first(p.product, 'image') || first(p.cse_thumbnail, 'src') || '';
}
/* السعر من pagemap (offer / product / metatags) ثمّ من العنوان والمقتطف */
function priceOf(pm, title, snippet) {
  const p = pm || {};
  const o = Array.isArray(p.offer) && p.offer[0] ? p.offer[0] : null;
  if (o && o.price) return clean((o.pricecurrency ? o.pricecurrency + ' ' : '') + o.price, 32);
  const m = Array.isArray(p.metatags) && p.metatags[0] ? p.metatags[0] : {};
  const amt = m['product:price:amount'] || m['og:price:amount'] || '';
  if (amt) return clean((m['product:price:currency'] || m['og:price:currency'] || '') + ' ' + amt, 32);
  return priceIn(title) || priceIn(snippet);
}

function cardFromGoogle(it) {
  const url = httpsOnly(it && it.link);
  if (!url) return null;
  const title = clean(it.title, 110);
  const snippet = clean(it.snippet, 180);
  return { title: title || hostOf(url), url, site: hostOf(url), image: imageOf(it.pagemap), price: priceOf(it.pagemap, title, snippet), snippet };
}
function cardFromTavily(x) {
  const url = httpsOnly(x && x.url);
  if (!url) return null;
  const title = clean(x.title, 110), snippet = clean(x.content, 180);
  return { title: title || hostOf(url), url, site: hostOf(url), image: '', price: priceIn(title) || priceIn(x.content), snippet };
}
function dedupe(cards, cap) {
  const max = cap || MAX_CARDS;
  const seen = new Set(), out = [];
  for (const c of cards) { if (!c || seen.has(c.url)) continue; seen.add(c.url); out.push(c); if (out.length >= max) break; }
  return out;
}

async function googleCards(query, o) {
  const k = clean(o.env.GOOGLE_SEARCH_API_KEY, 200), cx = clean(o.env.GOOGLE_SEARCH_CX, 200);
  if (!k || !cx) return null;
  let url = CSE_URL + '?key=' + encodeURIComponent(k) + '&cx=' + encodeURIComponent(cx) + '&num=10';
  if (o.gl) url += '&gl=' + encodeURIComponent(o.gl);
  if (o.cr) url += '&cr=' + encodeURIComponent(o.cr);
  url += '&q=' + encodeURIComponent(clean(query, 300));
  const r = await o.fetch(url, { signal: AbortSignal.timeout(o.timeoutMs) });
  if (!r || !r.ok) return null;
  let d = null; try { d = await r.json(); } catch (e) { return null; }
  return dedupe(((d && d.items) || []).map(cardFromGoogle), FETCH_CAP);
}
async function tavilyCards(query, o) {
  const key = clean(o.env.TAVILY_API_KEY, 200);
  if (!key) return null;
  const r = await o.fetch(TAVILY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs),
    body: JSON.stringify({ api_key: key, query: clean(query, 380), max_results: 10, search_depth: 'basic' }) });
  if (!r || !r.ok) return null;
  let d = null; try { d = await r.json(); } catch (e) { return null; }
  return dedupe(((d && d.results) || []).map(cardFromTavily), FETCH_CAP);
}

/* البحث المنظّم: Google أوّلًا (صور وأسعار)، فإن غاب مفتاحه أو خلت نتائجه فـTavily. يرجع { items, sites } — items فارغة = لا بطاقات. */
async function searchCards(query, opts) {
  const o = Object.assign({ env: process.env, fetch: globalThis.fetch, timeoutMs: 12000 }, opts || {});
  const pinned = pinQuery(query, o);
  const cc = placeOf(o.ask, pinned, o.country);
  o.gl = glOf(cc); o.cr = crOf(cc);
  let items = null;
  try { items = await googleCards(pinned, o); } catch (e) { items = null; }
  if (!items || !items.length) { try { items = await tavilyCards(pinned, o); } catch (e) { items = null; } }
  items = keepOnRequest(items || [], pinned, cc).slice(0, MAX_CARDS);
  const seen = new Set(), sites = [];
  for (const c of items) { if (c.site && !seen.has(c.site)) { seen.add(c.site); sites.push({ url: c.url, title: c.site }); } }
  return { items, sites };
}

/* ما يصل الموديل: قائمة مرقّمة مضغوطة بالأرقام نفسها التي يراها المستخدم على البطاقات (يرشّح برقم البطاقة) */
function cardsText(items, query) {
  if (!items || !items.length) return 'لا نتائج منظّمة لـ«' + clean(query, 80) + '» — جرّب web_search بصياغة أخرى، أو أجب نصًّا.';
  const lines = items.map((c, i) => (i + 1) + '. ' + c.title + (c.price ? ' — ' + c.price : '') + ' — ' + c.site + '\n' + c.url + (c.snippet ? '\n' + c.snippet : ''));
  return '[عُرضت للمستخدم ' + items.length + ' بطاقات منظّمة (صورة · اسم · سعر · متجر · رابط) بهذه الأرقام — لا تعِد سردها نصًّا]\n\n'
    + lines.join('\n\n') + '\n\nالآن: سطر أو سطران عن ما وجدت، ثمّ سؤال متابعة واحد فقط يضيّق نفس المطلوب في نفس المكان (الميزانيّة، المقاس، اللون، الطراز). حين يجيب: رشّح الأفضل واحدًا برقمه واسمه وسببه ورابطه.';
}

/* حمولة الحدث للعميل — بلا حقول زائدة، والرقائق نصوص قصيرة ≤ ٦ */
function cardsEvent(query, input, items, scope) {
  const cc = placeOf(scope && scope.ask, query, scope && scope.country);
  const chips = scopeChips((Array.isArray(input && input.chips) ? input.chips : []).map((s) => clean(s, 40)).filter(Boolean), cc).slice(0, 6);
  return { cards: { q: clean(query, 120), kind: clean(input && input.kind, 12) || 'other', chips, items: items.map((c) => ({ title: c.title, url: c.url, site: c.site, image: c.image || '', price: c.price || '', snippet: c.snippet || '' })) } };
}

module.exports = { TOOL, searchCards, cardsText, cardsEvent, pinQuery, placeOf, keepOnRequest, scopeChips, PRICE_RE, __imageOf: imageOf, __priceOf: priceOf };
