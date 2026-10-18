'use strict';
/* cards-search.js — v-cards (أمر المالك ١٢ أكتوبر، لقطات جوجل وChatGPT: «اذا اريد اطالب اي شي تطلعي نفس هذي الأفكار — شي نظامي…
   نماذج وعقب يعطيني المواقع… وآخر شي التتبع على نفس الموضوع ويعطيه الأفضل»): طلب عامّ («أبغى رنقات ENVE بكم»، «بذور زراعة»، «جوّال
   بالتقسيط») لا يُجاب سردًا، بل بطاقات منظّمة (صورة · عنوان · سعر · متجر · رابط) تُبثّ للعميل حدثًا `cards`، ومواقعها حدث `sources`
   القائم، واقتراحات قريبة (رقائق) يختارها الموديل، ثمّ سؤال متابعة واحد على الموضوع نفسه وترشيح الأفضل (تعليمة CARDS_NOTE في chat.js).
   v-cards-place (المالك ١٣ أكتوبر): البحث والرقاقات على نفس المطلوب في نفس المكان الذي طلبه (أو دولة تسوّقه) — بلا قائمة أصناف.
   المصدر: Google Custom Search بحقل pagemap (الصورة والسعر)، وTavily احتياطًا بلا صور. لا مفتاح جديد. */

const TOOL = {
  name: 'show_cards',
  description: 'اعرض للمستخدم خيارات منظّمة في بطاقات (صورة · اسم · سعر · متجر · رابط) تُرسم له تلقائيًّا. استعملها بدل web_search كلّما طلب شيئًا عامًّا ليختار منه: منتجًا أو سلعة («أبغى رنقات كربون بكم»، «بذور زراعة»، «جوّال بالتقسيط»)، أو خدمة أو محلًّا أو موقعًا أو مكانًا أو خطّة أو «أفضل X» — بأيّ صيغة، ولو لم يقل «بكم» أو «أسعار» أو «للبيع»: اسم شيء يُشترى أو يُختار يكفي («ثياب مخوّر»، «جوال للتصوير»). وإن كان «أفضل X» أو توصية فاختر أنت ٣–٦ خيارات بأسمائها في items (بطاقة لكلّ خيار). مرّة واحدة في الردّ، ولا web_search قبلها ولا بعدها في الردّ نفسه. query = المطلوب كما قاله + مكانه: إن سمّى بلدًا أو مدينة فهما، وإلّا دولة تسوّقه. بالإنجليزيّة للمنتجات والخدمات، وبالعربيّة إن كان الطلب محلّيًّا صرفًا. لا توسّع لصنف آخر. chips: ٣–٦ فروقات لنفس المطلوب في نفس المكان (سعر · مقاس · لون · طراز) بلغة المستخدم — لا منتج آخر ولا بلد آخر. بعد البطاقات لا تعِد سردها نصًّا: سطر أو سطران، ثمّ سؤال متابعة واحد يضيّق نفس المطلوب، وعند جوابه رشّح الأفضل واحدًا بسبب ورابط.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'عبارة البحث: المطلوب كما طُلب وفي مكانه' },
      chips: { type: 'array', items: { type: 'string' }, description: '٣–٦ فروقات لنفس المطلوب في نفس المكان' },
      items: { type: 'array', items: { type: 'string' }, description: 'لـ«أفضل X» أو توصية أو مقارنة: ٣–٦ خيارات تختارها أنت بأسمائها الدقيقة الرسميّة كما يكتبها المتجر (بالإنجليزيّة للطرازات والمنتجات: «MG 5»، «iPhone 17 Pro»؛ ومحلّ أو خدمة باسمه) — بطاقة لكلّ خيار بصورته وسعره ورابطه. للطلب العامّ اتركها فارغة.' }, // v-google-cards
      kind: { type: 'string', enum: ['product', 'service', 'place', 'site', 'listing', 'other'], description: 'نوع المطلوب — listing لإعلانات البيع والإيجار: تُرسم صفوفًا، الصورة بجانب العنوان والوصف والسعر ورابط الإعلانات' }, // v-reply-blocks
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
/* v-google-cards (مراجعة: «أفضل … صينية اقتصادية» بُحثت في الصين فسقط كلّ وكيل إماراتيّ): صفة المنشأ ليست مكان التسوّق — «صينية،
   يابانية، كورية، ألمانية، Japanese…» تُحذف قبل كشف المكان، والاسم يبقى مكانًا («الصين، كوريا، ألمانيا، Germany»). */
/* سابقة واحدة مسموحة («وكورية»، «بالصيني»، «للصينيين»)، والاسم بعدها حرف لا يكون صفة («وكوريا»، «والصين» تبقى أماكن) */
const ORIGIN_ADJ_AR = /(^|[^ء-ي])(?:[وفبك]?(?:ال)?|لل)(?:إيطالي|ايطالي|فرنسي|صيني|ياباني|هندي|تركي|لبناني|مكسيكي|تايلندي|تايلاندي|كوري|إسباني|اسباني|يوناني|مغربي|أمريكي|امريكي|إيراني|ايراني|فيتنامي|إندونيسي|اندونيسي|ألماني|الماني|بريطاني|إنجليزي|انجليزي|سويسري|أوروبي|اوروبي|روسي|برازيلي|كندي|أسترالي|استرالي|هولندي|سويدي|ماليزي|باكستاني|مصري|أردني|اردني|سوري|عراقي|كويتي|قطري|بحريني|عماني|إماراتي|اماراتي)(?:ّ?ة|ه|ين|ون|ات|تين)?(?![ء-ي])/g;
const ORIGIN_ADJ_EN = /\b(?:japanese|korean|german|american|italian|french|turkish|indian|british|english|chinese|spanish|mexican|thai|swiss|european|russian|brazilian|canadian|australian|dutch|swedish|malaysian|pakistani|egyptian|emirati|omani|kuwaiti|qatari|bahraini)s?\b/gi;
function placeRegion(text) {
  return geo().regionOf(String(text || '').replace(ORIGIN_ADJ_AR, '$1 ').replace(ORIGIN_ADJ_EN, ' '));
}
function placeOf(ask, query, country) {
  return placeRegion(ask) || placeRegion(query) || ccOf(country);
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
  if (lab && !placeRegion(q) && !new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(q)) q = q + ' ' + lab;
  else if (lab && placeRegion(ask) && placeRegion(q) && placeRegion(ask) !== placeRegion(q) && !new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(q)) q = q + ' ' + lab;
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
  const other = placeRegion(blob); // «Chery Arrizo 6 — Chinese sedan» ليس صفحة من الصين
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
/* السعر من pagemap (offer / product / metatags) ثمّ من العنوان والمقتطف. from: schema = بيانات المتجر المنظّمة، text = نصّ */
function priceInfo(pm, title, snippet) {
  const p = pm || {};
  const o = Array.isArray(p.offer) && p.offer[0] ? p.offer[0] : null;
  if (o && o.price) return { price: clean((o.pricecurrency ? o.pricecurrency + ' ' : '') + o.price, 32), from: 'schema' };
  const m = Array.isArray(p.metatags) && p.metatags[0] ? p.metatags[0] : {};
  const amt = m['product:price:amount'] || m['og:price:amount'] || '';
  if (amt) return { price: clean((m['product:price:currency'] || m['og:price:currency'] || '') + ' ' + amt, 32), from: 'schema' };
  const t = priceIn(title) || priceIn(snippet);
  return { price: t, from: t ? 'text' : '' };
}
function priceOf(pm, title, snippet) { return priceInfo(pm, title, snippet).price; }
/* علامة متجر في النتيجة (لا في كلام المستخدم): بيانات منتج/عرض منظّمة أو سعر منظّم أو og:type منتج — لا سعر المقتطف (صفحة سعر الذهب
   أو الصرف فيها «AED 312.50» وليست متجرًا) */
function shopSignal(pm, pr) {
  const p = pm || {};
  const m = Array.isArray(p.metatags) && p.metatags[0] ? p.metatags[0] : {};
  return !!(pr.from === 'schema' || (Array.isArray(p.product) && p.product.length) || (Array.isArray(p.offer) && p.offer.length) || /product/i.test(String(m['og:type'] || '')));
}

/* v-google-cards (لقطة المالك: طلب «أفضل X اقتصاديّ» ← بطاقة خبر من ياهو فاينانس): مقالة أو خبر أو تدوينة ليست خيارًا يُختار —
   من بنية الصفحة (pagemap/og:type) لا من كلماتها. صفحة منتج فيها مراجعات تبقى منتجًا. */
function articleSignal(pm, shop) {
  if (shop) return false;
  const p = pm || {};
  const m = Array.isArray(p.metatags) && p.metatags[0] ? p.metatags[0] : {};
  return ['newsarticle', 'article', 'blogposting', 'reportagenewsarticle'].some((k) => Array.isArray(p[k]) && p[k].length) || /^article$/i.test(String(m['og:type'] || '').trim());
}
function cardFromGoogle(it) {
  const url = httpsOnly(it && it.link);
  if (!url) return null;
  const title = clean(it.title, 110);
  const snippet = clean(it.snippet, 180);
  const pr = priceInfo(it.pagemap, title, snippet);
  const shop = shopSignal(it.pagemap, pr);
  return { title: title || hostOf(url), url, site: hostOf(url), image: imageOf(it.pagemap), price: pr.price, priceFrom: pr.from, shop, article: articleSignal(it.pagemap, shop), src: 'g', snippet };
}
function cardFromTavily(x) {
  const url = httpsOnly(x && x.url);
  if (!url) return null;
  const title = clean(x.title, 110), snippet = clean(x.content, 180);
  const price = priceIn(title) || priceIn(x.content);
  return { title: title || hostOf(url), url, site: hostOf(url), image: '', price, priceFrom: price ? 'text' : '', shop: false, src: 't', snippet }; // علامة المتجر من صفحته بعد قراءتها
}

/* ── v-google-cards (مواصفات المالك ١٨ أكتوبر: «البحث في المحادثة يصير مثل المنتجات في جوجل… كلّ بطاقة لازم فيها صورة… السعر من صفحة
   المتجر وإلّا السعر في الموقع… البديل لازم يجيب صور بعد»): صفحة المتجر نفسها تُقرأ (وسوم og وJSON-LD) لكلّ بطاقة بلا صورة أو بلا سعر
   منظّم. بطاقة بلا صورة أبدًا تسقط، والسعر النصّيّ من المقتطف لا يُعتمد (قد يكون لمنتج آخر في الصفحة) — إمّا سعر المتجر المنظّم وإمّا لا سعر. ── */
const PAGE_TIMEOUT_MS = 2500;
const PAGE_MAX_BYTES = 600000;
const PAGE_UA = 'Mozilla/5.0 (compatible; OmranLinkPreview/1.0; +https://omran-ai-builder.vercel.app)';
/* لا عناوين داخليّة: الرابط من نتائج البحث، لكنّ الخادم لا يطلب IP خامًا ولا localhost (SSRF) */
function safePageUrl(u) {
  let x = null;
  try { x = new URL(String(u)); } catch (e) { return ''; }
  if (x.protocol !== 'https:') return '';
  const h = x.hostname.toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.indexOf(':') >= 0 || h.indexOf('.') < 0) return '';
  return x.href;
}
function decodeEnt(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
}
/* وسوم <meta>: property/name/itemprop ← content (أوّل قيمة لكلّ مفتاح) */
function metaMap(html) {
  const out = {};
  const tagRe = /<meta\b[^>]*>/gi, attrRe = /([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;
  let t;
  while ((t = tagRe.exec(html))) {
    const a = {}; let m;
    attrRe.lastIndex = 0;
    while ((m = attrRe.exec(t[0]))) a[m[1].toLowerCase()] = decodeEnt(m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]));
    const k = String(a.property || a.name || a.itemprop || '').toLowerCase();
    if (k && a.content != null && out[k] == null) out[k] = a.content.trim();
  }
  return out;
}
/* كائنات JSON-LD مسطّحة (@graph والمصفوفات) */
function ldObjects(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const walk = (v, d) => { if (!v || d > 6) return; if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; } if (typeof v !== 'object') return; out.push(v); if (v['@graph']) walk(v['@graph'], d + 1); };
  while ((m = re.exec(html))) { try { walk(JSON.parse(m[1].trim()), 0); } catch (e) { /* JSON-LD مكسور في صفحة المتجر — يُتجاهل كأنّه غير موجود */ } }
  return out;
}
const isType = (o, t) => { const v = o && o['@type']; return Array.isArray(v) ? v.some((x) => String(x).toLowerCase() === t) : String(v || '').toLowerCase() === t; };
function fmtAmount(a) {
  const s = String(a == null ? '' : a).trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(s)) return clean(a, 24);
  const n = Number(s);
  return n.toLocaleString('en-US', { minimumFractionDigits: /\.\d/.test(s) ? 2 : 0, maximumFractionDigits: 2 });
}
function ldImage(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return ldImage(v[0]);
  return String(v.url || v.contentUrl || '');
}
/* صورة المنتج وسعره المنظّم من HTML صفحة المتجر (base لحلّ الروابط النسبيّة) */
function pageMetaFrom(html, base) {
  const meta = metaMap(html), ld = ldObjects(html);
  const product = ld.filter((o) => isType(o, 'product'))[0] || null;
  let img = (product && ldImage(product.image)) || meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'] || meta.image || '';
  if (!img) { const l = /<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i.exec(html); const h = l && /href\s*=\s*["']([^"']+)["']/i.exec(l[0]); img = h ? decodeEnt(h[1]) : ''; }
  let image = '';
  try { image = img ? new URL(img, base).href : ''; } catch (e) { image = ''; }
  if (!/^https:\/\//i.test(image)) image = '';
  let amount = '', cur = '';
  const offers = product && product.offers ? [].concat(product.offers) : ld.filter((o) => isType(o, 'offer') || isType(o, 'aggregateoffer'));
  for (const o of offers) {
    if (!o || typeof o !== 'object') continue;
    const sp = o.priceSpecification && !Array.isArray(o.priceSpecification) ? o.priceSpecification : null;
    const a = o.price != null ? o.price : (o.lowPrice != null ? o.lowPrice : (sp && sp.price != null ? sp.price : ''));
    if (a !== '' && a != null && Number(String(a).replace(/,/g, '')) > 0) { amount = a; cur = o.priceCurrency || (sp && sp.priceCurrency) || ''; break; }
  }
  if (!amount) {
    amount = meta['product:price:amount'] || meta['og:price:amount'] || meta.price || '';
    cur = meta['product:price:currency'] || meta['og:price:currency'] || meta.pricecurrency || '';
    if (!(Number(String(amount).replace(/,/g, '')) > 0)) amount = '';
  }
  const isProduct = !!(product || amount || /product/i.test(String(meta['og:type'] || '')));
  const isArticle = !isProduct && (ld.some((o) => ['article', 'newsarticle', 'blogposting', 'reportagenewsarticle'].some((t) => isType(o, t))) || /^article$/i.test(String(meta['og:type'] || '').trim()));
  return { image, price: amount ? clean((cur ? String(cur).toUpperCase() + ' ' : '') + fmtAmount(amount), 32) : '',
    product: isProduct, article: isArticle }; // صفحة منتج أو سعر منظّم = متجر؛ مقالة/خبر = ليست خيارًا
}
/* قراءة صفحة المتجر: HTML فقط، بسقف وقت وحجم؛ أيّ فشل = لا شيء (البطاقة تُقرّر بما عندها) */
async function pageMeta(url, o) {
  const u = safePageUrl(url);
  if (!u) return {};
  /* الجالب الآمن (safe-url): يحلّ الاسم ويرفض العنوان الخاصّ في كلّ تحويل — صفحة تحوّل إلى 169.254.x أو 127.0.0.1 لا تُقرأ */
  const r = await require('./safe-url.js').fetchPublicUrl(u, { headers: { 'User-Agent': PAGE_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ar,en;q=0.8' }, signal: AbortSignal.timeout(o.pageTimeoutMs || PAGE_TIMEOUT_MS) },
    Object.assign({ maxRedirects: 3 }, o.fetch ? { fetchFn: o.fetch } : {}, o.lookup ? { lookup: o.lookup } : {}));
  if (!r || !r.ok) return {};
  const ct = String((r.headers && r.headers.get && r.headers.get('content-type')) || '');
  if (ct && !/html/i.test(ct)) return {};
  let html = '';
  if (r.body && typeof r.body.getReader === 'function') {
    const rd = r.body.getReader(), dec = new TextDecoder();
    let n = 0;
    for (;;) { const c = await rd.read(); if (c.done) break; n += c.value.length; html += dec.decode(c.value, { stream: true }); if (n >= PAGE_MAX_BYTES) { try { rd.cancel(); } catch (e) { /* القطع عند السقف — ما قُرئ يكفي */ } break; } }
  } else html = String(await r.text()).slice(0, PAGE_MAX_BYTES);
  return pageMetaFrom(html, r.url || u);
}
/* الإثراء: صفحة كلّ بطاقة بلا صورة أو بلا سعر منظّم تُقرأ بالتوازي. بعدها: بلا صورة = تسقط، والسعر النصّيّ يُستبدل بسعر الصفحة أو يُفرَّغ */
async function enrichCards(items, opts) {
  const o = Object.assign({ fetch: globalThis.fetch }, opts || {});
  const list = (items || []).filter(Boolean);
  await Promise.all(list.map(async (c) => {
    const needImg = !c.image, needPrice = c.priceFrom !== 'schema';
    if (!needImg && !needPrice) return;
    let m = {};
    try { m = await pageMeta(c.url, o); } catch (e) { m = {}; }
    if (needImg && m.image) c.image = m.image;
    if (needPrice) { c.price = m.price || ''; c.priceFrom = m.price ? 'page' : ''; }
    if (m.product) c.shop = true;
    if (m.article && !c.shop) c.article = true;
  }));
  return list.filter((c) => !!c.image && !c.article).slice(0, MAX_CARDS); // بلا صورة أو مقالة/خبر = لا بطاقة
}
/* نتائج متجر لا مقالات: نتيجتان فأكثر فيهما علامة متجر */
function shoppingLike(items) {
  return (items || []).filter((c) => c && c.shop).length >= 2;
}
function sitesOf(items) {
  const seen = new Set(), sites = [];
  for (const c of items || []) { if (c.site && !seen.has(c.site)) { seen.add(c.site); sites.push({ url: c.url, title: c.site }); } }
  return sites;
}
/* مرشّح للبطاقات: طلب قصير (٨ كلمات فأقلّ) لا يبدأ بسؤال شرح أو سبب أو وقت أو شخص («كيف/ليش/متى/مين/هل/اشرح…»). «وش أفضل جوال؟»
   و«عندكم عطر عود؟» مرشّحة. الحكم الأخير لنتائج البحث (shoppingLike) لا لكلمات المستخدم — بلا «بكم» ولا «للبيع» ولا قائمة أصناف. */
/* «من وين أشتري…» ليست «من هو»، و«how much» ليست «how to»، و«هل في…» طلب — الحكم الحقيقيّ للنتائج المنظّمة، فالمرشّح واسع */
const ASK_START = /^\s*(?:و|ف)?(?:كيف|ليش|ليه|لماذا|لم|متى|من(?!\s+(?:وين|أين|اين|فين))|مين|منو|اشرح|عرّف|عرف|ترجم|اكتب|لخّص|لخص|how(?!\s+(?:much|many))|why|when|who|explain|translate|write)(?=$|[\s،,.:؛؟?!])/i;
function pickAsk(text) {
  const t = clean(text, 400);
  if (!t || t.length > 200 || ASK_START.test(t)) return false;
  return t.split(/\s+/).filter(Boolean).length <= 16;
}
/* v-google-cards: أوّل كتلة [[OPT]]…[[/OPT]] في ردّ التحويل = الأفكار القريبة ← رقائق تحت البطاقات (قبل النصّ والسؤال)، وتُرفع من النصّ */
function liftIdeas(text) {
  const s = String(text == null ? '' : text);
  const m = /\[\[OPT\]\]([\s\S]*?)\[\[\/OPT\]\]/.exec(s);
  if (!m) return { chips: [], text: s };
  const chips = m[1].split('|').map((x) => clean(x, 40)).filter(Boolean).slice(0, 6);
  if (chips.length < 2) return { chips: [], text: s };
  const out = (s.slice(0, m.index).replace(/[ \t]+$/, '') + '\n' + s.slice(m.index + m[0].length).replace(/^[ \t]+/, '')).replace(/\n{3,}/g, '\n\n').trim();
  return { chips, text: out };
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
/* v-google-cards (المالك: «اريد بحث شامل… المستخدم ما يفكّر»): «أفضل X» أو توصية = المزوّد يختار الخيارات بأسمائها (items)، والخادم
   يبحث عن كلّ خيار وحده بالتوازي فتكون بطاقة لكلّ خيار بصورته وسعر متجره ورابطه — بحث عامّ بعبارة واحدة يرجع مقالات لا خيارات.
   لكلّ خيار: نتائجه على اسمه وفي مكانه، بلا مقالات، المتجر أوّلًا، وأوّل ثلاثة تُقرأ صفحاتها عند الحاجة؛ خيار بلا صورة يسقط. */
const MAX_ITEMS = 6;
/* كلمات الاسم بعد التطبيع (حركات، همزات، تاء مربوطة، «ال») — لمطابقة الخيار بصفحته */
function normWords(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase() // é→e (التركيب يعيد همزات العربيّة)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6F0))
    .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .split(/[^a-z0-9ء-ي]+/).filter(Boolean).map((w) => (/^ال[ء-ي]{2,}/.test(w) ? w.slice(2) : w));
}
const ITEM_STOP = new Set(['the', 'and', 'with', 'for', 'new', 'price', 'prices', 'buy', 'في', 'من', 'مع', 'على', 'سعر', 'افضل']);
/* كلمات الطراز الأعلى: صفحة «iPhone 17 Pro Max» ليست «iPhone 17» حين توجد صفحة بلا زيادة */
const VARIANT_WORDS = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'fe', 'edge', 'cross', 'neo', 'air', 'برو', 'ماكس', 'بلس', 'ترا', 'الترا', 'ميني', 'لايت']);
/* الصفحة للخيار نفسه: كلّ كلمة مميّزة من اسمه في عنوانها أو رابطها، والرقم رقمًا كاملًا («MG 5» لا «MG ZS»، «Arrizo 6» لا «Arrizo 8»).
   الملتصق والمفصول سواء: «MG 5» ↔ «MG5»، «Fold7» ↔ «Fold 7». */
function nameMatches(name, c) {
  const req = normWords(name).filter((w) => !ITEM_STOP.has(w));
  if (!req.length) return true;
  let url = String(c && c.url || '');
  try { url = decodeURIComponent(url); } catch (e) { /* رابط بترميز مكسور — يُقارَن كما هو */ }
  const set = new Set(normWords(String(c && c.title || '') + ' ' + url));
  const found = req.map((w) => {
    if (set.has(w)) return true;
    const m = /^([a-z]+)(\d+[a-z]*)$/.exec(w) || /^(\d+)([a-z]+)$/.exec(w);
    return !!(m && set.has(m[1]) && set.has(m[2]));
  });
  for (let i = 0; i + 1 < req.length; i++) if (!(found[i] && found[i + 1]) && set.has(req[i] + req[i + 1])) { found[i] = true; found[i + 1] = true; }
  return found.every(Boolean);
}
function variantExtras(name, c) {
  const req = new Set(normWords(name));
  return normWords(c && c.title).filter((w) => VARIANT_WORDS.has(w) && !req.has(w)).length;
}
async function searchItemCards(names, o) {
  const list = Array.from(new Set((names || []).map((n) => clean(n, 80)).filter(Boolean))).slice(0, MAX_ITEMS);
  const priced = !/^(place|site)$/i.test(String(o.kind || '').trim());
  /* المكان مرّة واحدة من نصّ المستخدم أو دولته (لا من صفة المنشأ)، وعبارة كلّ خيار اسمه وحده + مكانه — لا أسماء الخيارات الأخرى */
  const cc = placeOf(o.ask, o.query, o.country); // عبارة المزوّد تحمل المكان في المتابعة (رقاقة «فنادق ٥ نجوم» بعد «فنادق باريس»)
  const label = placeLabel(cc);
  const oo = Object.assign({}, o, { gl: glOf(cc), cr: crOf(cc) });
  const per = await Promise.all(list.map(async (name) => {
    const q = clean(name + (priced ? ' price' : '') + (label && !placeRegion(name) ? ' ' + label : ''), 300);
    let found = null;
    try { found = await googleCards(q, oo); } catch (e) { found = null; }
    if (!found || !found.length) { try { found = await tavilyCards(q, oo); } catch (e) { found = null; } }
    /* اسم فيه مكان («Qatar Airways»، «Paris Gallery») لا يُرفض بمكان التسوّق — gl/cr يكفيان */
    const base = placeRegion(name) ? (found || []).filter(Boolean) : keepOnRequest(found || [], '', cc);
    const rank = (a, b) => (variantExtras(name, a) - variantExtras(name, b)) || ((b.shop ? 1 : 0) - (a.shop ? 1 : 0));
    const cands = base.filter((c) => !c.article && nameMatches(name, c)).sort(rank);
    const ok = (await enrichCards(cands.slice(0, 3), oo)).sort(rank);
    return { name, ok };
  }));
  /* صفحة اختارها خيار سابق ← الخيار يأخذ مرشّحه التالي، لا يسقط */
  const used = new Set(), items = [];
  for (const p of per) {
    const best = p.ok.find((c) => !used.has(c.url));
    if (!best) continue;
    used.add(best.url);
    items.push(Object.assign({}, best, { title: p.name, snippet: best.title }));
  }
  return { items, sites: sitesOf(items) };
}

async function searchCards(query, opts) {
  const o = Object.assign({ env: process.env, fetch: globalThis.fetch, timeoutMs: 12000 }, opts || {});
  if (Array.isArray(o.items) && o.items.filter((n) => clean(n, 80)).length >= 2) { // v-google-cards: بطاقة لكلّ خيار
    const r = await searchItemCards(o.items, Object.assign({}, o, { query }));
    if (r.items.length) return r; // لا خيار طابق صفحته (أسماء بلغة غير لغة المتاجر) ← البحث العامّ بعبارة المزوّد لا صفر بطاقات
  }
  const pinned = pinQuery(query, o);
  const cc = placeOf(o.ask, pinned, o.country);
  o.gl = glOf(cc); o.cr = crOf(cc);
  let items = null;
  try { items = await googleCards(pinned, o); } catch (e) { items = null; }
  if (!items || !items.length) { try { items = await tavilyCards(pinned, o); } catch (e) { items = null; } }
  items = keepOnRequest(items || [], pinned, cc);
  /* v-google-cards: الإثراء قبل القصّ — بطاقة تسقط بلا صورة فتأخذ مكانها التالية (جوجل يرجع ١٠ والبطاقات ٨) */
  items = o.enrich ? await enrichCards(items, o) : items.slice(0, MAX_CARDS);
  return { items, sites: sitesOf(items) };
}

/* ما يصل الموديل: قائمة مرقّمة مضغوطة بالأرقام نفسها التي يراها المستخدم على البطاقات (يرشّح برقم البطاقة).
   v-google-cards: بلا سعر = «السعر في الموقع» (لا يخترع الموديل سعرًا)؛ وفي التحويل من web_search لا رقائق من الموديل، فالأفكار القريبة
   يكتبها هو أزرارًا [[OPT]]. */
function cardsText(items, query, opts) {
  if (!items || !items.length) return 'لا نتائج منظّمة لـ«' + clean(query, 80) + '» — جرّب web_search بصياغة أخرى، أو أجب نصًّا.';
  const lines = items.map((c, i) => (i + 1) + '. ' + c.title + ' — ' + (c.price || 'السعر في الموقع') + ' — ' + c.site + '\n' + c.url + (c.snippet ? '\n' + c.snippet : ''));
  const ideas = opts && opts.converted
    ? 'سطر واحد عمّا وجدت، ثمّ أفكار قريبة من نفس المطلوب (٣–٥: لون، مقاس، سعر، طراز) أزرارًا بهذه الصيغة حرفيًّا [[OPT]]فكرة١|فكرة٢|فكرة٣[[/OPT]]، ثمّ '
    : 'سطر أو سطران عن ما وجدت، ثمّ ';
  return '[عُرضت للمستخدم ' + items.length + ' بطاقات منظّمة (صورة · اسم · سعر · متجر · رابط) بهذه الأرقام — لا تعِد سردها نصًّا، ولا تذكر سعرًا غير المكتوب هنا]\n\n'
    + lines.join('\n\n') + '\n\nالآن: ' + ideas + 'سؤال متابعة واحد فقط يضيّق نفس المطلوب في نفس المكان (الميزانيّة، المقاس، اللون، الطراز). حين يجيب: رشّح الأفضل واحدًا برقمه واسمه وسببه ورابطه.';
}

/* v-google-cards: web_search لطلب يُختار منه ← بطاقات. المرشّح من نصّ المستخدم (pickAsk)، والحكم من النتائج نفسها (shoppingLike):
   مقالات بلا متجر = يكمل بحث الويب كما كان. بطاقتان حقيقيّتان (بصورة) فأكثر وإلّا بحث الويب. يرجع نصّ الموديل أو null. */
async function pickAsCards(query, opts) {
  const o = opts || {};
  if (!pickAsk(o.ask)) return null;
  const io = {}; // مفتاح بقيمة undefined في Object.assign يمحو الافتراضيّ (fetch العامّ) — يُمرَّر الموجود فقط
  if (o.env) io.env = o.env;
  if (o.fetch) io.fetch = o.fetch;
  if (o.lookup) io.lookup = o.lookup;
  const raw = await searchCards(query, Object.assign({ ask: o.ask, country: o.country }, io));
  /* نتائج جوجل تحمل بيانات المتجر المنظّمة فيُحكم قبل قراءة الصفحات؛ البديل (Tavily) بلا بيانات فتُقرأ صفحاته أوّلًا ثمّ يُحكم */
  const fromGoogle = raw.items.some((c) => c.src === 'g');
  if (fromGoogle && !shoppingLike(raw.items)) return null;
  const items = (await enrichCards(raw.items, io)).filter((c) => c.shop); // المقالات والمراجعات وويكيبيديا ليست بطاقات منتج
  if (!shoppingLike(items)) return null;
  return { text: cardsText(items, query, { converted: true }), ev: cardsEvent(query, { kind: 'product' }, items, { ask: o.ask, country: o.country }), sites: sitesOf(items) };
}

/* حمولة الحدث للعميل — بلا حقول زائدة، والرقائق نصوص قصيرة ≤ ٦ */
function cardsEvent(query, input, items, scope) {
  const cc = placeOf(scope && scope.ask, query, scope && scope.country);
  const chips = scopeChips((Array.isArray(input && input.chips) ? input.chips : []).map((s) => clean(s, 40)).filter(Boolean), cc).slice(0, 6);
  return { cards: { q: clean(query, 120), kind: clean(input && input.kind, 12) || 'other', chips, items: items.map((c) => ({ title: c.title, url: c.url, site: c.site, image: c.image || '', price: c.price || '', snippet: c.snippet || '' })) } };
}

module.exports = { TOOL, searchCards, cardsText, cardsEvent, pinQuery, placeOf, keepOnRequest, scopeChips, PRICE_RE, __imageOf: imageOf, __priceOf: priceOf,
  enrichCards, pageMetaFrom, safePageUrl, shoppingLike, sitesOf, pickAsk, pickAsCards, liftIdeas, __nameMatches: nameMatches }; // v-google-cards
