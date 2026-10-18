// tests/google-cards.test.cjs — v-google-cards (مواصفات المالك ١٨ أكتوبر: «البحث في المحادثة يصير مثل المنتجات في جوجل، وبشكل عام بدون ما
// يعتمد على كلمات معيّنة… كلّ بطاقة لازم فيها صورة… السعر من صفحة المتجر وإلّا السعر في الموقع… البديل لازم يجيب صور بعد… جرّب ثياب مخوّر،
// رنجات سياكل، جوال للتصوير»): (١) قراءة صفحة المتجر (og وJSON-LD) بالجالب الآمن. (٢) الإثراء: صورة لكلّ بطاقة، وسعر المتجر المنظّم أو لا
// سعر، وبلا صورة تسقط، والعنوان الخاصّ والتحويل إليه لا يُقرآن. (٣) المرشّح واسع والحكم من بيانات المتجر المنظّمة. (٤) المعالج الحقيقيّ:
// الطلبات الثلاثة بلا «بكم» ← بطاقات بصورها وأسعارها، المقالات تسقط، والأفكار رقائق تحت البطاقات؛ وسعر الذهب وسؤال الشرح بحث ويب؛
// وبحثان متوازيان = مجموعة واحدة؛ وجوجل معطّل ← البديل بصور. (٥) الواجهة و١٤ لغة. نتائج البحث وصفحات المتاجر هنا محاكاة — لا شبكة ولا DNS.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'google-cards-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.GOOGLE_SEARCH_API_KEY = 'g-key';
process.env.GOOGLE_SEARCH_CX = 'g-cx';
process.env.TAVILY_API_KEY = 'test-tavily';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'GOOGLE_PLACES_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const db = new Map();
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {} });
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: 'sub-user' }),
  checkAndConsumeCustom: async () => ({ allowed: true, username: 'sub-user', remaining: 9 }),
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
const realSearch = require(rp('api/_lib/search.js'));
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: realSearch.regionOf, hasRegion: realSearch.hasRegion });
/* DNS محاكى للجالب الآمن نفسه (لا شبكة): evil.example.ae يُحلّ إلى عنوان خاصّ، والباقي عامّ */
const realSafe = require(rp('api/_lib/safe-url.js'));
const fakeLookup = async (host) => [{ address: /evil\.example\.ae$/.test(host) ? '10.0.0.5' : '93.184.216.34', family: 4 }];
stub('api/_lib/safe-url.js', Object.assign({}, realSafe, { fetchPublicUrl: (u, init, opt) => realSafe.fetchPublicUrl(u, init, Object.assign({}, opt, { lookup: fakeLookup })) }));
const CS = require(rp('api/_lib/cards-search.js'));
const chat = require(rp('api/_lib/chat.js'));

const html = (head) => '<!doctype html><html><head>' + head + '</head><body>…</body></html>';
const ld = (o) => '<script type="application/ld+json">' + JSON.stringify(o) + '</script>';
const htmlRes = (s) => new Response(s, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

test('١. صفحة المتجر: صورة المنتج وسعره المنظّم من JSON-LD ثمّ وسوم og/product، والروابط النسبيّة تُحلّ، وhttp لا', () => {
  let m = CS.pageMetaFrom(html('<meta content="https://cdn.x.ae/og.jpg" property="og:image">' + ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Product', image: ['/img/p.jpg'], offers: { '@type': 'Offer', price: '1450.00', priceCurrency: 'aed' } }] })), 'https://shop.x.ae/p/1');
  assert.deepEqual(m, { image: 'https://shop.x.ae/img/p.jpg', price: 'AED 1,450.00', product: true, article: false }, 'JSON-LD المنتج أوّلًا');
  m = CS.pageMetaFrom(html(ld([{ '@type': ['Product'], image: { url: 'https://cdn.y.com/a.png' }, offers: [{ '@type': 'AggregateOffer', lowPrice: 99, priceCurrency: 'AED' }] }])), 'https://y.com/p');
  assert.deepEqual(m, { image: 'https://cdn.y.com/a.png', price: 'AED 99', product: true, article: false }, 'مصفوفة وAggregateOffer');
  m = CS.pageMetaFrom(html('<meta property="og:image" content="//img.z.ae/a&amp;b.jpg"><meta property="product:price:amount" content="2,499"><meta property="product:price:currency" content="AED">'), 'https://z.ae/p');
  assert.deepEqual(m, { image: 'https://img.z.ae/a&b.jpg', price: 'AED 2,499', product: true, article: false }, 'وسوم og وproduct');
  m = CS.pageMetaFrom(html('<meta name="twitter:image" content="https://t.q.com/t.jpg"><script type="application/ld+json">{broken</script>'), 'https://q.com');
  assert.deepEqual(m, { image: 'https://t.q.com/t.jpg', price: '', product: false, article: false }, 'JSON-LD مكسور يُتجاهل، وبلا سعر = فارغ، ومقال ليس متجرًا');
  m = CS.pageMetaFrom(html('<link rel="image_src" href="/s.jpg"><meta property="product:price:amount" content="0">'), 'https://w.com/x');
  assert.deepEqual(m, { image: 'https://w.com/s.jpg', price: '', product: false, article: false }, 'سعر صفر ليس سعرًا');
  assert.deepEqual(CS.pageMetaFrom(html('<meta property="og:image" content="http://insecure.com/a.jpg">'), 'https://a.com'), { image: '', price: '', product: false, article: false });
  m = CS.pageMetaFrom(html('<meta property="og:type" content="article"><meta property="og:image" content="https://n.com/a.jpg">'), 'https://n.com/x');
  assert.equal(m.article, true, 'og:type article = مقالة');
  m = CS.pageMetaFrom(html(ld({ '@type': 'NewsArticle', image: 'https://n.com/b.jpg' })), 'https://n.com/y');
  assert.deepEqual([m.article, m.product], [true, false], 'خبر JSON-LD');
  m = CS.pageMetaFrom(html('<meta property="og:type" content="article">' + ld({ '@type': 'Product', offers: { price: 5, priceCurrency: 'AED' } })), 'https://n.com/z');
  assert.deepEqual([m.article, m.product], [false, true], 'صفحة منتج فيها og:type article تبقى منتجًا');
  for (const u of ['http://a.com', 'https://127.0.0.1/x', 'https://localhost/x', 'https://[::1]/x', 'https://metadata.internal/x', 'https://intranet/x', 'nope']) assert.equal(CS.safePageUrl(u), '', u);
  assert.equal(CS.safePageUrl('https://www.amazon.ae/dp/1'), 'https://www.amazon.ae/dp/1');
});

test('٢. الإثراء: الناقص فقط يُقرأ، والسعر النصّيّ يُستبدل بسعر المتجر أو يُفرَّغ، وبلا صورة تسقط، والعنوان الخاصّ والتحويل إليه لا يُقرآن', async () => {
  const fetched = [];
  const pages = {
    'https://b.ae/p': html('<meta property="og:image" content="https://b.ae/b.jpg">' + ld({ '@type': 'Product', offers: { price: 320, priceCurrency: 'AED' } })),
    'https://c.ae/p': html('<meta property="og:image" content="https://c.ae/c.jpg">'),
    'https://evil.example.ae/p': html('<meta property="og:image" content="https://evil.example.ae/secret.jpg">'),
  };
  const fetchImpl = async (u) => {
    fetched.push(String(u));
    if (String(u) === 'https://redir.example.ae/p') return new Response('', { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data/' } });
    if (/169\.254|127\.0\.0\.1/.test(String(u))) return htmlRes(html('<meta property="og:image" content="https://leak.example/x.jpg">'));
    return pages[u] ? htmlRes(pages[u]) : new Response('no', { status: 404 });
  };
  const items = [
    { title: 'A', url: 'https://a.ae/p', site: 'a.ae', image: 'https://a.ae/a.jpg', price: 'AED 189', priceFrom: 'schema', shop: true },
    { title: 'B', url: 'https://b.ae/p', site: 'b.ae', image: '', price: '350 درهم', priceFrom: 'text', shop: false },
    { title: 'C', url: 'https://c.ae/p', site: 'c.ae', image: 'https://c.ae/thumb.jpg', price: '', priceFrom: '', shop: false },
    { title: 'D', url: 'https://d.com/x', site: 'd.com', image: '', price: '', priceFrom: '' },
    { title: 'E', url: 'https://evil.example.ae/p', site: 'evil.example.ae', image: '', price: '', priceFrom: '' },
    { title: 'F', url: 'https://redir.example.ae/p', site: 'redir.example.ae', image: '', price: '', priceFrom: '' },
  ];
  const out = await CS.enrichCards(items, { fetch: fetchImpl });
  assert.deepEqual(out.map((c) => [c.title, c.image, c.price, !!c.shop]), [['A', 'https://a.ae/a.jpg', 'AED 189', true], ['B', 'https://b.ae/b.jpg', 'AED 320', true], ['C', 'https://c.ae/thumb.jpg', '', false]]);
  assert.ok(!fetched.includes('https://a.ae/p'), 'بطاقة كاملة لا تُقرأ صفحتها');
  assert.ok(!fetched.includes('https://evil.example.ae/p'), 'اسم يُحلّ إلى عنوان خاصّ لا يُطلب');
  assert.ok(!fetched.some((u) => /169\.254/.test(u)), 'التحويل إلى عنوان خاصّ لا يُتبع');
  const txt = CS.cardsText(out, 'q', { converted: true });
  assert.match(txt, /\n3\. C — السعر في الموقع — c\.ae/, 'بلا سعر = «السعر في الموقع» للموديل');
  assert.match(txt, /ولا تذكر سعرًا غير المكتوب هنا/);
  assert.match(txt, /\[\[OPT\]\]فكرة١\|فكرة٢\|فكرة٣\[\[\/OPT\]\]/, 'الأفكار القريبة أزرار في التحويل');
  assert.doesNotMatch(CS.cardsText(out, 'q'), /\[\[OPT\]\]/, 'وفي show_cards الرقائق من الموديل');
});

test('٣. المرشّح واسع بلا كلمات «بكم/للبيع»، والحكم من بيانات المتجر المنظّمة لا من سعر المقتطف، والأفكار تُرفع', () => {
  for (const s of ['ثياب مخوّر', 'رنجات سياكل', 'جوال للتصوير', 'وش أفضل جوال؟', 'عندكم عطر عود؟', 'كم سعر آيفون ١٧', 'من وين أشتري ثياب مخوّر', 'هل في جوال زين للتصوير؟',
    'how much is the iPhone 17 Pro', 'أبي جوال زين للتصوير الليلي والفيديو ميزانيتي ٢٠٠٠ درهم']) assert.equal(CS.pickAsk(s), true, s);
  for (const s of ['كيف أطبخ مندي', 'من هو ميسي', 'لماذا السماء زرقاء', 'اشرح لي الذكاء الاصطناعي', 'how to cook rice', '']) assert.equal(CS.pickAsk(s), false, s);
  assert.equal(CS.shoppingLike([{ shop: true }, { shop: true }, { shop: false }]), true);
  assert.equal(CS.shoppingLike([{ shop: true }, { shop: false }, { shop: false }]), false, 'مقالات = بحث ويب');
  assert.deepEqual(CS.liftIdeas('لقيت لك.\n[[OPT]]أبيض|أسود|مقاس كبير[[/OPT]]\nتبغى لون معيّن؟'), { chips: ['أبيض', 'أسود', 'مقاس كبير'], text: 'لقيت لك.\n\nتبغى لون معيّن؟' });
  assert.deepEqual(CS.liftIdeas('بلا أفكار'), { chips: [], text: 'بلا أفكار' });
});

// ── المعالج الحقيقيّ ──
function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const toolsTurn = (calls) => sse([{ type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } }].concat(...calls.map(([name, input], i) => [
  { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: 'tu' + i, name, input: {} } },
  { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: i },
])).concat([{ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } }]));
const toolTurn = (name, input) => toolsTurn([[name, input]]);
const textTurn = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
/* لكلّ طلب: متجر كامل (صورة وعرض في pagemap)، ومتجر بلا صورة وسعره نصّ (صفحته منتج بصورة وسعر منظّم)، ومتجر بصورة ومنتج بلا سعر،
   ومراجعة بصورة بلا بيانات متجر (صفحتها ٤٠٤)، ومقال بلا صورة — المتوقّع ثلاث بطاقات: سعر المتجر، و«السعر في الموقع» للثالثة، والمراجعة والمقال يسقطان */
const SAMPLES = {
  'ثياب مخوّر': ['ثوب مخوّر نسائي مطرّز', 'مخوّر إماراتي فاخر', 'مخوّر بنات صيفي', 'أجمل تصاميم المخوّر هذا الموسم', 'تاريخ المخوّر في الإمارات'],
  'رنجات سياكل': ['رنجات سياكل كربون 700c', 'رنجات سياكل ألمنيوم', 'رنجات سياكل جبليّة 29', 'مراجعة: أفضل رنجات سياكل', 'كيف تختار رنجات سياكل'],
  'جوال للتصوير': ['جوال للتصوير بكاميرا 200 ميغابكسل', 'جوال للتصوير الليلي', 'جوال للتصوير والفيديو 8K', 'أفضل 10 جوال للتصوير - مراجعة', 'جوال للتصوير — ويكيبيديا'],
};
const PAGES = {};
const GOLD = { items: [
  { title: 'سعر الذهب اليوم في دبي', link: 'https://www.goldpriceuae.com/', snippet: 'عيار 24 AED 312.50 للغرام', pagemap: { cse_image: [{ src: 'https://www.goldpriceuae.com/logo.png' }] } },
  { title: 'Gold rate Dubai — Khaleej Times', link: 'https://www.khaleejtimes.com/gold-forex', snippet: '24K AED 312.50, 22K AED 289.25', pagemap: { cse_image: [{ src: 'https://www.khaleejtimes.com/kt.jpg' }] } },
  { title: 'Live gold price UAE', link: 'https://www.livepriceofgold.com/uae', snippet: 'Gold price per gram AED 312', pagemap: { cse_image: [{ src: 'https://www.livepriceofgold.com/g.png' }] } },
] };
/* خيارات يسمّيها المزوّد («أفضل X»): لكلّ خيار خبر بصورة (يسقط) ثمّ صفحة وكيل بعرض وصورة؛ وخيار نتائجه أخبار فقط يسقط كلّه */
const OPTIONS = ['Alpha 5', 'Bravo Arrizo', 'Charlie Emgrand', 'Ghost Model'];
function optionResults(name) {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const news = { title: name + ' sales jump — Finance news', link: 'https://finance.example.com/' + slug, snippet: name + ' investments boost', pagemap: { newsarticle: [{ headline: 'x' }], cse_image: [{ src: 'https://finance.example.com/' + slug + '.jpg' }] } };
  if (name === 'Ghost Model') return { items: [news] };
  return { items: [news, { title: name + ' 2026 — dealer UAE', link: 'https://dealer-' + slug + '.ae/' + slug, snippet: name + ' from the dealer', pagemap: { cse_image: [{ src: 'https://dealer-' + slug + '.ae/' + slug + '.jpg' }], offer: [{ price: '45000', pricecurrency: 'AED' }] } }] };
}
/* طرازات بأرقام: صفحة طراز آخر من الماركة نفسها بعرض أوّلًا (تُرفض)، ثمّ صفحة الوكيل للطراز نفسه */
const CARS = {
  'MG 5': [
    { title: 'MG ZS 2026 price in UAE — dealer', link: 'https://dealer.ae/mg-zs', snippet: 'MG ZS', pagemap: { cse_image: [{ src: 'https://dealer.ae/mg-zs.jpg' }], offer: [{ price: '62000', pricecurrency: 'AED' }] } },
    { title: 'MG5 2026 | MG Motor UAE', link: 'https://mgmotor.ae/mg5', snippet: 'official', pagemap: { cse_image: [{ src: 'https://mgmotor.ae/mg5.jpg' }] } },
    { title: 'MG 5 2026 for sale — dealer', link: 'https://dealer.ae/mg-5', snippet: 'MG 5', pagemap: { cse_image: [{ src: 'https://dealer.ae/mg-5.jpg' }], offer: [{ price: '52000', pricecurrency: 'AED' }] } },
  ],
  'Chery Arrizo 6': [
    { title: 'Chery Arrizo 8 price UAE', link: 'https://dealer.ae/arrizo-8', snippet: 'Arrizo 8', pagemap: { cse_image: [{ src: 'https://dealer.ae/arrizo-8.jpg' }], offer: [{ price: '88000', pricecurrency: 'AED' }] } },
    { title: 'Chery Arrizo 6 2026 price UAE', link: 'https://chery.ae/arrizo-6', snippet: 'Arrizo 6', pagemap: { cse_image: [{ src: 'https://chery.ae/arrizo-6.jpg' }], offer: [{ price: '58000', pricecurrency: 'AED' }] } },
  ],
  'Geely Emgrand': [
    { title: 'Geely Emgrand 2026 — Geely UAE', link: 'https://geely.ae/emgrand', snippet: 'Emgrand', pagemap: { cse_image: [{ src: 'https://geely.ae/emgrand.jpg' }], offer: [{ price: '55000', pricecurrency: 'AED' }] } },
  ],
};
function cseFor(q) {
  const car = Object.keys(CARS).find((n) => String(q).indexOf(n + ' ') === 0);
  if (car) return { items: CARS[car] };
  const opt = OPTIONS.find((n) => String(q).indexOf(n) >= 0);
  if (opt) return optionResults(opt);
  if (/store item A/.test(String(q))) return { items: [
    { title: 'Chinese investments boost store item A makers', link: 'https://finance.yahoo.com/news/x', snippet: 'news about store item A', pagemap: { newsarticle: [{ headline: 'x' }], cse_image: [{ src: 'https://s.yimg.com/x.jpg' }] } },
    { title: 'Store item A', link: 'https://store-a.ae/p', snippet: 'item', pagemap: { cse_image: [{ src: 'https://store-a.ae/p.jpg' }], offer: [{ price: '99', pricecurrency: 'AED' }] } },
  ] };
  if (/ذهب|gold/i.test(String(q))) return GOLD;
  const key = Object.keys(SAMPLES).find((k) => String(q).indexOf(k) >= 0);
  if (!key) return { items: [{ title: 'مقال عام عن ' + q, link: 'https://wiki.example.org/a', snippet: 'شرح ' + q, pagemap: {} }, { title: q + ' — مدوّنة', link: 'https://blog.example.org/b', snippet: 'مقال عن ' + q, pagemap: {} }] };
  const slug = encodeURIComponent(key).slice(0, 18).replace(/%/g, '');
  const t = SAMPLES[key];
  PAGES['https://www.noon.com/uae-ar/' + slug + '-2'] = html('<meta property="og:image" content="https://f.nooncdn.com/' + slug + '-2.jpg">' + ld({ '@type': 'Product', name: t[1], offers: { '@type': 'Offer', price: '320', priceCurrency: 'AED' } }));
  PAGES['https://shop.example.ae/' + slug + '-3'] = html('<title>' + t[2] + '</title>');
  return { items: [
    { title: t[0], link: 'https://www.amazon.ae/dp/' + slug + '-1', snippet: t[0] + ' — شحن مجّانيّ', pagemap: { cse_image: [{ src: 'https://m.media-amazon.com/' + slug + '-1.jpg' }], offer: [{ price: '189', pricecurrency: 'AED' }] } },
    { title: t[1], link: 'https://www.noon.com/uae-ar/' + slug + '-2', snippet: t[1] + ' بسعر 350 درهم', pagemap: {} },
    { title: t[2], link: 'https://shop.example.ae/' + slug + '-3', snippet: t[2], pagemap: { product: [{ name: t[2] }], cse_thumbnail: [{ src: 'https://encrypted-tbn0.gstatic.com/' + slug + '-3' }] } },
    { title: t[3], link: 'https://www.arageek.com/' + slug + '-4', snippet: t[3] + ' من 1,999 درهم', pagemap: { cse_image: [{ src: 'https://www.arageek.com/' + slug + '-4.jpg' }] } },
    { title: t[4], link: 'https://blog.example.com/' + slug + '-5', snippet: t[4], pagemap: {} },
  ] };
}
const TAVILY = (q) => ({ results: [
  { url: 'https://www.noon.com/uae-ar/tv-1', title: q + ' — نون', content: q + ' بسعر AED 899' },
  { url: 'https://www.sharafdg.com/tv-2', title: q + ' — شرف دي جي', content: q + ' AED 1,099 توصيل مجّانيّ' },
  { url: 'https://news.example.com/tv-3', title: 'مقال: ' + q, content: 'شرح' },
] });
PAGES['https://www.noon.com/uae-ar/tv-1'] = html('<meta property="og:image" content="https://f.nooncdn.com/tv-1.jpg">' + ld({ '@type': 'Product', offers: { price: '879', priceCurrency: 'AED' } }));
PAGES['https://www.sharafdg.com/tv-2'] = html('<meta property="og:type" content="product"><meta property="og:image" content="https://sdg.com/tv-2.jpg">');
PAGES['https://news.example.com/tv-3'] = html('<meta property="og:image" content="https://news.example.com/n.jpg">');

async function ask(question, turns, opt) {
  const o = opt || {};
  const log = { model: [], google: [], tavily: 0, pages: [] };
  const saved = global.fetch;
  let turn = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/openrouter\.ai/.test(u)) { log.model.push(JSON.parse(init.body)); const t = turns[Math.min(turn++, turns.length - 1)]; return t(); }
    if (/customsearch/.test(u)) { log.google.push(u); if (o.cseDown) return new Response('{"error":{"code":429}}', { status: 429 }); return new Response(JSON.stringify(cseFor(new URL(u).searchParams.get('q'))), { status: 200 }); }
    if (/api\.tavily\.com/.test(u)) { log.tavily++; let q = ''; try { q = JSON.parse(init.body).query; } catch (e) { q = ''; } return new Response(JSON.stringify(TAVILY(q)), { status: 200 }); }
    if (PAGES[u]) { log.pages.push(u); return htmlRes(PAGES[u]); }
    return new Response('{}', { status: 404 });
  };
  let written = '';
  const req = { method: 'POST', headers: o.headers || {}, body: { messages: [{ role: 'user', content: question }], token: token('sub-user'), provider: 'deepseek' } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saved; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  const second = log.model[1];
  const trs = second ? second.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((c) => c && c.type === 'tool_result') : [];
  return { log, events, toolResult: trs[0] ? String(trs[0].content) : '', toolResults: trs.map((c) => String(c.content)) };
}

for (const q of Object.keys(SAMPLES)) {
  test('٤. «' + q + '» بلا «بكم» والمزوّد اختار web_search ← بطاقات بصورها وأسعارها، والمراجعة تسقط، والأفكار رقائق تحت البطاقات', async () => {
    const reply = 'لقيت لك خيارات من متاجر الإمارات.\n[[OPT]]أبيض|أسود|مقاس كبير[[/OPT]]\nتبغى لون معيّن؟';
    const r = await ask(q, [() => toolTurn('web_search', { query: q }), () => textTurn(reply)]);
    const sys = JSON.stringify(r.log.model[0].system || '');
    assert.ok(sys.includes('ولو بلا «بكم» أو «أسعار» أو «للبيع»'), 'القاعدة في نظام دور الأدوات');
    const evs = r.events.filter((e) => e.cards);
    assert.ok(evs.length, 'حدث بطاقات: ' + r.toolResult.slice(0, 120));
    const items = evs[0].cards.items;
    assert.deepEqual(items.map((c) => c.site), ['amazon.ae', 'noon.com', 'shop.example.ae'], 'المراجعة (بصورة بلا متجر) والمقال سقطا');
    assert.ok(items.every((c) => /^https:\/\//.test(c.image)), 'كلّ بطاقة بصورة');
    assert.deepEqual(items.map((c) => c.price), ['AED 189', 'AED 320', ''], 'سعر المتجر (لا ٣٥٠ من المقتطف)، والثالثة «السعر في الموقع» في الواجهة');
    assert.equal(items[1].image.indexOf('https://f.nooncdn.com/'), 0, 'صورة الثانية من og:image صفحتها');
    assert.match(r.toolResult, /^\[عُرضت للمستخدم 3 بطاقات/, 'الموديل يستلم البطاقات لا نتائج الويب');
    assert.match(r.toolResult, /السعر في الموقع/);
    assert.match(r.toolResult, /\[\[OPT\]\]فكرة١/);
    assert.match(r.toolResult, /رشّح الأفضل واحدًا برقمه واسمه وسببه ورابطه/);
    assert.equal(r.log.google.length, 1, 'نداء جوجل واحد — بلا بحث ويب بعده');
    assert.equal(r.events.filter((e) => Array.isArray(e.sources)).length, 1, 'المصادر مرّة واحدة');
    // الأفكار القريبة: الحدث الأخير (يحفظه العميل) يحملها رقائق تحت البطاقات، والتصحيح يرفعها من النصّ فيبقى سطر ثمّ السؤال
    const last = evs[evs.length - 1];
    assert.deepEqual(last.cards.chips, ['أبيض', 'أسود', 'مقاس كبير']);
    assert.deepEqual(last.cards.items.map((c) => c.site), ['amazon.ae', 'noon.com', 'shop.example.ae'], 'البطاقات نفسها');
    const patch = r.events.filter((e) => typeof e.patch === 'string').pop();
    assert.ok(patch && !/\[\[OPT\]\]/.test(patch.patch) && /تبغى لون معيّن؟/.test(patch.patch), 'النصّ بلا كتلة الأفكار: ' + (patch && patch.patch));
  });
}

test('٥. سعر الذهب (مقتطفات بأسعار بلا متجر) وسؤال الشرح ونتائج المقالات: بحث ويب كما كان بلا بطاقات', async () => {
  let r = await ask('سعر الذهب في دبي', [() => toolTurn('web_search', { query: 'gold price Dubai' }), () => textTurn('سعر غرام ٢٤ اليوم…')]);
  assert.ok(!r.events.some((e) => e.cards), 'سعر الذهب ليس متجرًا');
  assert.match(r.toolResult, /312/, 'الموديل يستلم السعر من الويب');
  r = await ask('كيف أطبخ مندي؟', [() => toolTurn('web_search', { query: 'طريقة المندي' }), () => textTurn('هذي الطريقة.')]);
  assert.ok(!r.events.some((e) => e.cards), 'لا بطاقات لسؤال شرح');
  r = await ask('دقات قلب النملة', [() => toolTurn('web_search', { query: 'دقات قلب النملة' }), () => textTurn('هذي المعلومة.')]);
  assert.ok(!r.events.some((e) => e.cards), 'نتائج مقالات = بحث الويب');
});

test('٦. بحثان متوازيان في الخطوة نفسها، أو show_cards معه: مجموعة بطاقات واحدة، والثاني بحث ويب', async () => {
  let r = await ask('جوال للتصوير', [() => toolsTurn([['web_search', { query: 'جوال للتصوير' }], ['web_search', { query: 'جوال للتصوير الليلي' }]]), () => textTurn('تم')]);
  assert.equal(r.events.filter((e) => e.cards).length, 1, 'حدث بطاقات واحد');
  assert.equal(r.toolResults.filter((t) => /^\[عُرضت للمستخدم/.test(t)).length, 1, 'نتيجة بطاقات واحدة للموديل');
  r = await ask('جوال للتصوير', [() => toolsTurn([['show_cards', { query: 'جوال للتصوير', chips: ['ليلي'], kind: 'product' }], ['web_search', { query: 'جوال للتصوير' }]]), () => textTurn('تم')]);
  const evs = r.events.filter((e) => e.cards);
  assert.equal(evs.length, 1, 'show_cards وحدها');
  assert.deepEqual(evs[0].cards.chips, ['ليلي']);
});

test('٧. جوجل معطّل (٤٢٩) ← البديل يجيب بطاقات بصور من صفحات المتاجر، لا مواقع فقط — في التحويل وفي show_cards', async () => {
  let r = await ask('شاشة تلفزيون 65', [() => toolTurn('web_search', { query: 'شاشة تلفزيون 65' }), () => textTurn('تم')], { cseDown: true });
  let ev = r.events.find((e) => e.cards);
  assert.ok(ev, 'بطاقات من البديل');
  assert.deepEqual(ev.cards.items.map((c) => [c.site, c.image, c.price]), [['noon.com', 'https://f.nooncdn.com/tv-1.jpg', 'AED 879'], ['sharafdg.com', 'https://sdg.com/tv-2.jpg', '']], 'المقال (صورة بلا متجر) سقط');
  assert.ok(r.log.tavily >= 1);
  r = await ask('أبغى شاشة', [() => toolTurn('show_cards', { query: 'شاشة تلفزيون 65', chips: ['55 بوصة', '75 بوصة'], kind: 'product' }), () => textTurn('تم')], { cseDown: true });
  ev = r.events.find((e) => e.cards);
  assert.ok(ev && ev.cards.items.length >= 2 && ev.cards.items.every((c) => /^https:\/\//.test(c.image)), 'show_cards كذلك بصور');
  assert.deepEqual(ev.cards.chips, ['55 بوصة', '75 بوصة']);
});

test('٨أ. «أفضل X» (لقطة المالك): المزوّد يسمّي الخيارات في items ← بطاقة لكلّ خيار بصورته وسعر وكيله، والخبر يسقط، وخيار بلا متجر ولا صورة يسقط', async () => {
  const r = await ask('أفضل خيار اقتصادي', [() => toolTurn('show_cards', { query: 'best economical option UAE', items: OPTIONS, kind: 'product' }), () => textTurn('هذي الخيارات. تبغى أيّ ميزانيّة؟')]);
  const ev = r.events.find((e) => e.cards);
  assert.ok(ev, 'حدث بطاقات');
  assert.deepEqual(ev.cards.items.map((c) => [c.title, c.site, c.price]), [['Alpha 5', 'dealer-alpha-5.ae', 'AED 45000'], ['Bravo Arrizo', 'dealer-bravo-arrizo.ae', 'AED 45000'], ['Charlie Emgrand', 'dealer-charlie-emgrand.ae', 'AED 45000']], 'بطاقة لكلّ خيار باسمه، لا خبر ياهو');
  assert.ok(ev.cards.items.every((c) => /^https:\/\/dealer-/.test(c.image)), 'صورة الخيار نفسه');
  assert.equal(r.log.google.length, 4, 'بحث لكلّ خيار (بالتوازي)');
  assert.ok(r.log.google.every((u) => /price/.test(decodeURIComponent(u))), 'بحث الخيار عن سعره');
  assert.match(r.toolResult, /^\[عُرضت للمستخدم 3 بطاقات/);
  assert.match(r.toolResult, /\n1\. Alpha 5 — AED 45000 — dealer-alpha-5\.ae/);
  const sys = JSON.stringify(r.log.model[0].system || '');
  assert.ok(sys.includes('ومرّرها في items') && sys.includes('ولا web_search قبلها ولا بعدها في الردّ نفسه'), 'القاعدة: خيارات بأسمائها وجولة واحدة');
  assert.ok(CS.TOOL.input_schema.properties.items && /بطاقة لكلّ خيار/.test(CS.TOOL.input_schema.properties.items.description));
});

test('٨ج. جملة المالك حرفيًّا «أفضل سيارة صينية اقتصادية» من الإمارات: البحث في الإمارات لا الصين، وبطاقة لكلّ طراز بوكيله', async () => {
  const r = await ask('أفضل سيارة صينية اقتصادية', [() => toolTurn('show_cards', { query: 'best economical Chinese car UAE', items: ['MG 5', 'Chery Arrizo 6', 'Geely Emgrand'], kind: 'product' }), () => textTurn('هذي الخيارات.')], { headers: { 'x-vercel-ip-country': 'AE' } });
  const qs = r.log.google.map((u) => new URL(u));
  assert.equal(qs.length, 3);
  assert.ok(qs.every((u) => u.searchParams.get('gl') === 'ae' && u.searchParams.get('cr') === 'countryAE'), '«صينية» صفة منشأ لا مكان');
  assert.ok(qs.every((u) => /United Arab Emirates$/.test(u.searchParams.get('q')) && !/China/.test(u.searchParams.get('q'))));
  assert.deepEqual(qs.map((u) => u.searchParams.get('q')), ['MG 5 price United Arab Emirates', 'Chery Arrizo 6 price United Arab Emirates', 'Geely Emgrand price United Arab Emirates'], 'كلّ خيار باسمه وحده');
  const ev = r.events.find((e) => e.cards);
  assert.deepEqual(ev.cards.items.map((c) => [c.title, c.url, c.price]), [
    ['MG 5', 'https://dealer.ae/mg-5', 'AED 52000'], ['Chery Arrizo 6', 'https://chery.ae/arrizo-6', 'AED 58000'], ['Geely Emgrand', 'https://geely.ae/emgrand', 'AED 55000']],
    'MG ZS وArrizo 8 رُفضا (طراز آخر)، والوكيل بعرضه قبل صفحة الشركة');
});

test('٨د. المقارنة: عبارة كلّ خيار بلا أسماء الآخرين، والمطابقة الصارمة، وصفحة اختارها خيار سابق ← مرشّح الخيار التالي', async () => {
  const qs = [];
  const fetchImpl = async (u) => {
    u = String(u);
    if (/customsearch/.test(u)) { const q = new URL(u).searchParams.get('q'); qs.push(q);
      const shared = { title: 'Alpha One and Alpha Two deals', link: 'https://shared.ae/alpha', snippet: 'both', pagemap: { cse_image: [{ src: 'https://shared.ae/a.jpg' }], offer: [{ price: '10', pricecurrency: 'AED' }] } };
      const own = (n) => ({ title: n + ' official', link: 'https://own.ae/' + n.replace(/\s+/g, '-').toLowerCase(), snippet: n, pagemap: { cse_image: [{ src: 'https://own.ae/x.jpg' }], offer: [{ price: '20', pricecurrency: 'AED' }] } });
      return new Response(JSON.stringify({ items: [shared, own(/Alpha One/.test(q) ? 'Alpha One' : 'Alpha Two')] }), { status: 200 }); }
    return new Response('', { status: 404 });
  };
  const r = await CS.searchCards('x', { ask: 'قارن بين Alpha One و Alpha Two', country: 'AE', enrich: true, items: ['Alpha One', 'Alpha Two'], kind: 'product', fetch: fetchImpl, env: { GOOGLE_SEARCH_API_KEY: 'k', GOOGLE_SEARCH_CX: 'c' } });
  assert.deepEqual(qs.sort(), ['Alpha One price United Arab Emirates', 'Alpha Two price United Arab Emirates'], 'لا أسماء الخيارات الأخرى في العبارة');
  assert.deepEqual(r.items.map((c) => [c.title, c.url]), [['Alpha One', 'https://shared.ae/alpha'], ['Alpha Two', 'https://own.ae/alpha-two']], 'الثاني أخذ مرشّحه التالي');
  for (const [n, t, u, ok] of [['MG 5', 'MG5 2026 | MG Motor', 'https://mgmotor.ae/mg5', true], ['MG 5', 'MG ZS 2026', 'https://dealer.ae/mg-zs', false], ['iPhone 17', 'Apple iPhone 16 Pro Max', 'https://x.ae/iphone-16', false],
    ['iPhone 17', 'Apple iPhone 17 Pro 256GB', 'https://x.ae/p', true], ['Chery Tiggo 4 Pro', 'Chery Arrizo 8', 'https://x.ae/a8', false], ['عطر عود ملكي', 'عطر العود الملكي 100 مل', 'https://x.ae/o', true]])
    assert.equal(CS.__nameMatches(n, { title: t, url: u }), ok, n + ' ← ' + t);
  for (const [a, cc] of [['أفضل سيارة صينية اقتصادية', 'AE'], ['best Japanese car', 'AE'], ['أفضل جوال كوري', 'AE'], ['ساعات في اليابان', 'JP'], ['cars in Germany', 'DE'], ['كوريا الجنوبية', 'KR']])
    assert.equal(CS.placeOf(a, '', 'AE'), cc, a);
});

test('٨هـ. بحث محوَّل ثمّ show_cards بخيارات في خطوة لاحقة: بطاقات show_cards تبقى، ولا يُعاد حدث التحويل القديم في آخر الدور', async () => {
  const r = await ask('جوال للتصوير', [() => toolTurn('web_search', { query: 'جوال للتصوير' }), () => toolTurn('show_cards', { query: 'x', items: ['Alpha 5', 'Bravo Arrizo'], kind: 'product' }), () => textTurn('خيارات.\n[[OPT]]أ|ب[[/OPT]]\nسؤال؟')]);
  const evs = r.events.filter((e) => e.cards);
  assert.equal(evs.length, 2, 'التحويل ثمّ show_cards — بلا إعادة');
  assert.deepEqual(evs[evs.length - 1].cards.items.map((c) => c.title), ['Alpha 5', 'Bravo Arrizo'], 'الأخير (يحفظه العميل) بطاقات الخيارات');
});

test('٨و. المراجعة الخامسة: مكان المتابعة من عبارة المزوّد، والسابقة مع صفة المنشأ، والطراز الأعلى لا يسرق صفحة الأدنى، والملتصق والمفصول، والرجوع للبحث العامّ، واسم فيه مكان', async () => {
  for (const [a, q, cc] of [['أفضل سيارات يابانية وكورية اقتصادية', '', 'AE'], ['سيارة صينية ويابانية', '', 'AE'], ['أبغى سيارة بالصيني', '', 'AE'], ['وكوريا', '', 'KR'], ['بتركيا', '', 'TR'],
    ['فنادق ٥ نجوم', 'best 5 star hotels Paris', 'FR'], ['عطر عماني', '', 'AE']]) assert.equal(CS.placeOf(a, q, 'AE'), cc, a + ' | ' + q);
  for (const [n, t, ok] of [['MG5', 'MG 5 2026 price UAE', true], ['Galaxy Z Fold7', 'Samsung Galaxy Z Fold 7 512GB', true], ['Lexus ES350', 'Lexus ES 350 2026', true], ['iPhone ١٧', 'Apple iPhone 17 256GB', true], ['Citroën C4', 'Citroen C4 2026', true], ['MG5', 'MG ZS 2026', false]])
    assert.equal(CS.__nameMatches(n, { title: t, url: 'https://x.ae/p' }), ok, n + ' ← ' + t);
  const log = [];
  const page = (title, link, price) => ({ title, link, snippet: title, pagemap: { cse_image: [{ src: link + '.jpg' }], offer: [{ price, pricecurrency: 'AED' }] } });
  const env = { GOOGLE_SEARCH_API_KEY: 'k', GOOGLE_SEARCH_CX: 'c' };
  const fetchImpl = async (u) => {
    u = String(u); if (!/customsearch/.test(u)) return new Response('', { status: 404 });
    const p = new URL(u).searchParams, q = p.get('q'); log.push({ q, gl: p.get('gl') });
    let items = [];
    if (/^iPhone 17 Pro Max /.test(q)) items = [page('Apple iPhone 17 Pro Max 256GB', 'https://sharafdg.com/iphone-17-pro-max', '5099')];
    else if (/^iPhone 17 /.test(q)) items = [page('Apple iPhone 17 Pro Max 256GB', 'https://sharafdg.com/iphone-17-pro-max', '5099'), page('Apple iPhone 17 256GB', 'https://noon.com/iphone-17', '3399')];
    else if (/Le Bristol|Ritz Paris/.test(q)) items = [page(q.split(' ')[0] + ' ' + q.split(' ')[1] + ' Paris hotel', 'https://' + q.split(' ')[1].toLowerCase() + '.fr/hotel', '1200')];
    else if (/Qatar Airways/.test(q)) items = [page('Qatar Airways — book flights from Doha', 'https://qatarairways.com/en-ae', '900')];
    else items = [page('Toyota Corolla economy car 2026', 'https://toyota.ae/corolla', '72000'), page('Nissan Sunny economy car 2026', 'https://nissan.ae/sunny', '59000')];
    return new Response(JSON.stringify({ items }), { status: 200 });
  };
  let r = await CS.searchCards('iPhone 17 vs Pro Max UAE', { ask: 'قارن', country: 'AE', enrich: true, items: ['iPhone 17', 'iPhone 17 Pro Max'], fetch: fetchImpl, env });
  assert.deepEqual(r.items.map((c) => [c.title, c.url, c.price]), [['iPhone 17', 'https://noon.com/iphone-17', 'AED 3399'], ['iPhone 17 Pro Max', 'https://sharafdg.com/iphone-17-pro-max', 'AED 5099']], 'الطراز الأعلى لا يسرق صفحة الأدنى');
  log.length = 0;
  r = await CS.searchCards('best 5 star hotels Paris', { ask: 'فنادق ٥ نجوم', country: 'AE', enrich: true, items: ['Le Bristol', 'Ritz Paris'], kind: 'place', fetch: fetchImpl, env });
  assert.ok(log.length === 2 && log.every((x) => x.gl === 'fr' && !/price/.test(x.q)), 'المتابعة بالرقاقة تبقى في باريس، وبلا price للأماكن: ' + JSON.stringify(log));
  assert.equal(r.items.length, 2);
  r = await CS.searchCards('economy car UAE', { ask: 'وش أفضل سيارة اقتصادية؟', country: 'AE', enrich: true, items: ['تويوتا كورولا', 'نيسان صني'], fetch: fetchImpl, env });
  assert.deepEqual(r.items.map((c) => c.site), ['toyota.ae', 'nissan.ae'], 'أسماء عربيّة لا تطابق صفحات إنجليزيّة ← البحث العامّ بعبارة المزوّد لا صفر');
  r = await CS.searchCards('airlines', { ask: 'أفضل طيران', country: 'AE', enrich: true, items: ['Qatar Airways', 'Le Bristol Paris'], kind: 'service', fetch: fetchImpl, env });
  assert.ok(r.items.some((c) => c.title === 'Qatar Airways'), 'اسم فيه مكان لا يُرفض بمكان التسوّق');
});

test('٨ب. المسار العامّ: نتيجة خبر أو مقالة بصورة لا تصير بطاقة (خبر ياهو في لقطة المالك)', async () => {
  const r = await ask('أبغى خيارات', [() => toolTurn('show_cards', { query: 'store item A', kind: 'product' }), () => textTurn('تم')]);
  const ev = r.events.find((e) => e.cards);
  assert.deepEqual(ev.cards.items.map((c) => c.site), ['store-a.ae'], 'الخبر سقط والمتجر بقي');
});

// ── الواجهة ──
class Txt { constructor(t){ this.nodeType = 3; this.textContent = t; this.parentNode = null; this.className = ''; } }
class El {
  constructor(tag){ this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.className = ''; this.style = {}; this._attrs = {}; this._ev = {};
    this.classList = { add: (c) => { this.className = (this.className + ' ' + c).trim(); }, remove(){}, toggle(){}, contains(){ return false; } }; }
  appendChild(n){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n){ const i = this.childNodes.indexOf(n); if(i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  get textContent(){ return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v){ this.childNodes = []; if(v !== '' && v != null) this.appendChild(new Txt(String(v))); }
  setAttribute(k, v){ this._attrs[k] = v; } getAttribute(k){ return this._attrs[k]; }
  addEventListener(k, f){ this._ev[k] = f; }
}
const all = (n, f, out = []) => { (n.childNodes || []).forEach((c) => { if (f(c)) out.push(c); all(c, f, out); }); return out; };
function loadApp37(){
  const head = new El('head');
  const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t), getElementById: (id) => all(head, (n) => n.id === id)[0] || null, head, body: new El('body') };
  const ctx = { document, t: (k) => k, omranSendOption(){}, omranSrcChip: (u, l) => { const a = new El('a'); a.className = 'md-src'; a.textContent = l; return a; } };
  ctx.window = ctx;
  vm.runInNewContext(read('js/app-37-cards.js'), ctx);
  return ctx;
}

test('٨. الواجهة: لا بطاقة بلا صورة، وصورة لم تُحمَّل تُسقط بطاقتها، وبلا سعر «السعر في الموقع»، والأفكار بعد البطاقات', () => {
  const c = loadApp37();
  const items = [
    { title: 'A', url: 'https://a.ae/1', site: 'a.ae', image: 'https://a.ae/a.jpg', price: 'AED 189' },
    { title: 'B', url: 'https://b.ae/2', site: 'b.ae', image: 'https://b.ae/b.jpg', price: '' },
    { title: 'C', url: 'https://c.ae/3', site: 'c.ae', image: '', price: 'AED 5' },
  ];
  const w = c.window.omranRenderCards({ kind: 'product', chips: ['أبيض', 'مقاس كبير'], items });
  const grid = w.childNodes.find((n) => /omCards/.test(n.className));
  assert.equal(grid.childNodes.length, 2, 'بلا صورة لا بطاقة');
  assert.equal(w.childNodes.indexOf(grid), 0, 'البطاقات أوّلًا');
  assert.ok(/omCardChips/.test(w.childNodes[1].className), 'الأفكار القريبة بعدها');
  const prices = all(grid, (n) => /omCardPrice/.test(n.className)).map((n) => [n.className, n.textContent]);
  assert.deepEqual(prices, [['omCardPrice', 'AED 189'], ['omCardPrice omCardPriceSite', 'السعر في الموقع']]);
  const img = all(grid.childNodes[0], (n) => n.tagName === 'IMG')[0];
  img._ev.error();
  assert.equal(grid.childNodes.length, 1, 'صورة لم تُحمَّل = البطاقة تسقط لا أيقونة الموقع');
  const L = c.window.omranRenderCards({ kind: 'listing', items });
  const lg = L.childNodes.find((n) => /omCards/.test(n.className));
  assert.equal(lg.childNodes.length, 2, 'والصفوف كذلك');
  assert.ok(all(lg, (n) => /omCardPriceSite/.test(n.className) && n.textContent === 'السعر في الموقع').length === 1);
  const css = all(c.document.head, (n) => n.id === 'omranCardsCss')[0].textContent;
  assert.ok(css.includes('.msg .omCardPrice.omCardPriceSite') && !/overflow-x\s*:\s*auto/.test(css));
});

test('٩. «السعر في الموقع» بالـ١٤ لغة ووسم اللغات رُفع، والقاعدة في وصف الأداة بلا أسماء أصناف', () => {
  const i18n = read('js/app-03-i18n-data.js');
  assert.equal((i18n.match(/(^|[\s{,])cardsPriceSite:/g) || []).length, 2, 'ar وen');
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) assert.ok(read('i18n/' + lg + '.js').includes('"cardsPriceSite"'), lg);
  const v = /i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(read('js/app-04-i18n-state.js'));
  assert.ok(v && Number(v[1]) >= 751, 'وسم ملفّات اللغات');
  assert.ok(read('js/app-37-cards.js').includes("tt('cardsPriceSite', 'السعر في الموقع')"));
  assert.ok(CS.TOOL.description.includes('ولو لم يقل «بكم» أو «أسعار» أو «للبيع»'));
  assert.doesNotMatch(read('api/_lib/cards-search.js'), /سيكل|سيارة/, 'بلا أسماء أصناف');
  const b = read('js/app.bundle.js');
  for (const k of ["tt('cardsPriceSite', 'السعر في الموقع')", 'function dropOnError(']) assert.ok(b.includes(k), 'الحزمة: ' + k);
});
