'use strict';
/* cards-search.js — v-cards (أمر المالك ١٢ أكتوبر، لقطات جوجل وChatGPT: «اذا اريد اطالب اي شي تطلعي نفس هذي الأفكار — شي نظامي…
   نماذج وعقب يعطيني المواقع… وآخر شي التتبع على نفس الموضوع ويعطيه الأفضل»): طلب عامّ («أبغى رنقات ENVE بكم»، «بذور زراعة»، «جوّال
   بالتقسيط») لا يُجاب سردًا، بل بطاقات منظّمة (صورة · عنوان · سعر · متجر · رابط) تُبثّ للعميل حدثًا `cards`، ومواقعها حدث `sources`
   القائم، واقتراحات قريبة (رقائق) يختارها الموديل، ثمّ سؤال متابعة واحد على الموضوع نفسه وترشيح الأفضل (تعليمة CARDS_NOTE في chat.js).
   المصدر: Google Custom Search بحقل pagemap (الصورة والسعر)، وTavily احتياطًا بلا صور. لا مفتاح جديد. */

const TOOL = {
  name: 'show_cards',
  description: 'اعرض للمستخدم خيارات منظّمة في بطاقات (صورة · اسم · سعر · متجر · رابط) تُرسم له تلقائيًّا. استعملها بدل web_search كلّما طلب شيئًا عامًّا ليختار منه: منتجًا أو سلعة («أبغى رنقات كربون بكم»، «بذور زراعة»، «جوّال بالتقسيط»)، أو خدمة أو محلًّا أو موقعًا أو مكانًا أو خطّة أو «أفضل X». مرّة واحدة في الردّ. query بالإنجليزيّة مع اسم المدينة/الدولة للمنتجات والخدمات (مثال: "ENVE carbon road wheels price UAE")، وبالعربيّة إن كان الطلب محلّيًّا صرفًا. chips: ٣–٦ اقتراحات قصيرة قريبة من الطلب بلغة المستخدم (يضغطها ليبحث بها). بعد البطاقات لا تعِد سردها نصًّا: سطر أو سطران، ثمّ سؤال متابعة واحد يضيّق الاختيار، وعند جوابه رشّح الأفضل واحدًا بسبب ورابط.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'عبارة البحث' },
      chips: { type: 'array', items: { type: 'string' }, description: '٣–٦ اقتراحات قريبة قصيرة بلغة المستخدم' },
      kind: { type: 'string', enum: ['product', 'service', 'place', 'site', 'other'], description: 'نوع المطلوب' },
    },
    required: ['query'],
  },
};

const CSE_URL = 'https://www.googleapis.com/customsearch/v1';
const TAVILY_URL = 'https://api.tavily.com/search';
const MAX_CARDS = 8;
// سعر داخل نصّ: «AED 1,299» · «1,299 درهم» · «$49.99» · «SAR 120» · «1.5k د.إ»
const PRICE_RE = /(?:(?:AED|SAR|QAR|KWD|OMR|BHD|USD|EUR|GBP|EGP|Dhs?|Rs\.?|د\.?\s?إ|ر\.?\s?س|ر\.?\s?ق|د\.?\s?ك|ج\.?\s?م|\$|€|£)\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:AED|SAR|QAR|KWD|OMR|BHD|USD|EUR|GBP|EGP|Dhs?|درهم|دراهم|ريال|دينار|جنيه|دولار|يورو|د\.?\s?إ|ر\.?\s?س|ر\.?\s?ق|د\.?\s?ك|ج\.?\s?م|\$|€|£))/i;

function clean(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n || 200); }
function hostOf(url) { try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function httpsOnly(u) { const s = clean(u, 2000); return /^https?:\/\//i.test(s) ? s : ''; }
function priceIn(text) { const m = PRICE_RE.exec(String(text || '')); return m ? clean(m[0], 32) : ''; }

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
function dedupe(cards) {
  const seen = new Set(), out = [];
  for (const c of cards) { if (!c || seen.has(c.url)) continue; seen.add(c.url); out.push(c); if (out.length >= MAX_CARDS) break; }
  return out;
}

async function googleCards(query, o) {
  const k = clean(o.env.GOOGLE_SEARCH_API_KEY, 200), cx = clean(o.env.GOOGLE_SEARCH_CX, 200);
  if (!k || !cx) return null;
  const url = CSE_URL + '?key=' + encodeURIComponent(k) + '&cx=' + encodeURIComponent(cx) + '&num=10&q=' + encodeURIComponent(clean(query, 300));
  const r = await o.fetch(url, { signal: AbortSignal.timeout(o.timeoutMs) });
  if (!r || !r.ok) return null;
  let d = null; try { d = await r.json(); } catch (e) { return null; }
  return dedupe(((d && d.items) || []).map(cardFromGoogle));
}
async function tavilyCards(query, o) {
  const key = clean(o.env.TAVILY_API_KEY, 200);
  if (!key) return null;
  const r = await o.fetch(TAVILY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs),
    body: JSON.stringify({ api_key: key, query: clean(query, 380), max_results: 10, search_depth: 'basic' }) });
  if (!r || !r.ok) return null;
  let d = null; try { d = await r.json(); } catch (e) { return null; }
  return dedupe(((d && d.results) || []).map(cardFromTavily));
}

/* البحث المنظّم: Google أوّلًا (صور وأسعار)، فإن غاب مفتاحه أو خلت نتائجه فـTavily. يرجع { items, sites } — items فارغة = لا بطاقات. */
async function searchCards(query, opts) {
  const o = Object.assign({ env: process.env, fetch: globalThis.fetch, timeoutMs: 12000 }, opts || {});
  let items = null;
  try { items = await googleCards(query, o); } catch (e) { items = null; }
  if (!items || !items.length) { try { items = await tavilyCards(query, o); } catch (e) { items = null; } }
  items = items || [];
  const seen = new Set(), sites = [];
  for (const c of items) { if (c.site && !seen.has(c.site)) { seen.add(c.site); sites.push({ url: c.url, title: c.site }); } }
  return { items, sites };
}

/* ما يصل الموديل: قائمة مرقّمة مضغوطة بالأرقام نفسها التي يراها المستخدم على البطاقات (يرشّح برقم البطاقة) */
function cardsText(items, query) {
  if (!items || !items.length) return 'لا نتائج منظّمة لـ«' + clean(query, 80) + '» — جرّب web_search بصياغة أخرى، أو أجب نصًّا.';
  const lines = items.map((c, i) => (i + 1) + '. ' + c.title + (c.price ? ' — ' + c.price : '') + ' — ' + c.site + '\n' + c.url + (c.snippet ? '\n' + c.snippet : ''));
  return '[عُرضت للمستخدم ' + items.length + ' بطاقات منظّمة (صورة · اسم · سعر · متجر · رابط) بهذه الأرقام — لا تعِد سردها نصًّا]\n\n'
    + lines.join('\n\n') + '\n\nالآن: سطر أو سطران عن ما وجدت، ثمّ سؤال متابعة واحد فقط يضيّق الاختيار (الميزانيّة، المقاس، المدينة، الغرض…). حين يجيب: رشّح الأفضل واحدًا برقمه واسمه وسببه ورابطه.';
}

/* حمولة الحدث للعميل — بلا حقول زائدة، والرقائق نصوص قصيرة ≤ ٦ */
function cardsEvent(query, input, items) {
  const chips = (Array.isArray(input && input.chips) ? input.chips : []).map((s) => clean(s, 40)).filter(Boolean).slice(0, 6);
  return { cards: { q: clean(query, 120), kind: clean(input && input.kind, 12) || 'other', chips, items: items.map((c) => ({ title: c.title, url: c.url, site: c.site, image: c.image || '', price: c.price || '', snippet: c.snippet || '' })) } };
}

module.exports = { TOOL, searchCards, cardsText, cardsEvent, PRICE_RE, __imageOf: imageOf, __priceOf: priceOf };
