// tests/serp-cards.test.cjs — v-serp-cards (تحضير بديل بحث جوجل قبل توقّفه في ١ يناير ٢٠٢٧، بلا اشتراك ولا إنفاق): محوّل واحد
// (api/_lib/serp-search.js) لثلاثة مزوّدين بمفاتيحهم. يثبت: (١) بلا مفتاح لا نداء ولا تغيير. (٢–٤) شكل طلب كلّ مزوّد (gl، المفتاح في
// الترويسة لا الرابط حيث يمكن) وتحويل نتائجه إلى حقول البطاقة، والصورة والسعر من صفحة المتجر، والمقالة تسقط. (٥) الترتيب والسقوط إلى
// جوجل ثمّ Tavily. (٦) التسوّق خلف CARDS_SHOPPING: سعر المتجر بعملة البلد، ورابط جوجل لا يصير بطاقة. (٧) «أفضل X» بلا تسوّق.
// (٨) التحويل من web_search. (٩–١٠) خطوة البحث الحيّ ونافذة الحداثة، ولا اسم مزوّد ولا مفتاح في النصّ والسجلّ. كلّ الشبكة محاكاة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'serp-cards-secret';
for (const k of ['SERPER_API_KEY', 'SEARCHAPI_API_KEY', 'SERPAPI_API_KEY', 'CARDS_SHOPPING', 'PERPLEXITY_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX', 'TAVILY_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {} });
const realSearch = require(rp('api/_lib/search.js'));
stub('api/_lib/search.js', Object.assign({}, realSearch, { fetchPlaces: async () => [], isPlacesAsk: () => false }));
const realSafe = require(rp('api/_lib/safe-url.js'));
const fakeLookup = async () => [{ address: '93.184.216.34', family: 4 }];
stub('api/_lib/safe-url.js', Object.assign({}, realSafe, { fetchPublicUrl: (u, init, opt) => realSafe.fetchPublicUrl(u, init, Object.assign({}, opt, { lookup: fakeLookup })) }));
const S = require(rp('api/_lib/serp-search.js'));
const CS = require(rp('api/_lib/cards-search.js'));

const KEY = 'serp-test-key-SECRET';
const AMZ = 'https://www.amazon.ae/dp/X1', NOON = 'https://www.noon.com/uae-en/air-max-90/', BLOG = 'https://blog.example.com/best';
const html = (head) => '<!doctype html><html><head>' + head + '</head><body>…</body></html>';
const ld = (o) => '<script type="application/ld+json">' + JSON.stringify(o) + '</script>';
const PAGES = {
  [AMZ]: html(ld({ '@type': 'Product', image: 'https://m.media-amazon.com/images/I/x1.jpg', offers: { '@type': 'Offer', price: '189', priceCurrency: 'AED' } })),
  [NOON]: html('<meta property="og:image" content="https://f.nooncdn.com/p/n1.jpg"><meta property="product:price:amount" content="320"><meta property="product:price:currency" content="AED">'),
  [BLOG]: html('<meta property="og:type" content="article"><meta property="og:image" content="https://blog.example.com/a.jpg">'),
  'https://shop.example.ae/alpha-one': html(ld({ '@type': 'Product', image: 'https://shop.example.ae/1.jpg', offers: { price: 100, priceCurrency: 'AED' } })),
  'https://shop.example.ae/alpha-two': html(ld({ '@type': 'Product', image: 'https://shop.example.ae/2.jpg', offers: { price: 200, priceCurrency: 'AED' } })),
};
const ORG = [
  { position: 1, title: 'Nike Air Max 90 Men — Amazon.ae', link: AMZ, snippet: 'AED 350 was, now on sale' },
  { position: 2, title: 'Nike Air Max 90 | noon UAE', link: NOON, snippet: 'Shop Nike Air Max 90 online' },
  { position: 3, title: 'Best Nike sneakers 2026', link: BLOG, snippet: 'Our review of Nike runners' },
];
const SHOP = [
  { position: 1, title: 'Nike Air Max 90 Men', source: 'Amazon.ae', link: AMZ, price: 'AED 199.00', imageUrl: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:a1' },
  { position: 2, title: 'Nike Air Max 90', source: 'Google', link: 'https://www.google.com/shopping/product/123?gl=ae', price: 'AED 210.00', imageUrl: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:g1' },
  { position: 3, title: 'Nike Air Max 90 White', source: 'Sun & Sand Sports', link: 'https://en-ae.sssports.com/air-max-90.html', price: 'AED 549.00', imageUrl: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:s1' },
  { position: 4, title: 'Nike Air Max 90 Kids', source: 'Shop X', link: 'https://shopx.ae/nike-90', price: 'AED 99.00', imageUrl: 'data:image/webp;base64,AAAA' },
];
const CSE = { items: [{ link: AMZ, title: 'Nike Air Max 90 Men — Amazon.ae', snippet: 'x', pagemap: { cse_image: [{ src: 'https://m.media-amazon.com/images/I/x1.jpg' }], offer: [{ price: '189', pricecurrency: 'AED' }] } },
  { link: NOON, title: 'Nike Air Max 90 | noon UAE', snippet: 'y', pagemap: { cse_image: [{ src: 'https://f.nooncdn.com/p/n1.jpg' }], product: [{ name: 'n' }] } }] };
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } });

/* محاكاة الشبكة كلّها: كلّ مزوّد يُسجَّل بطلبه، وصفحات المتاجر من PAGES */
function net(o) {
  const opt = o || {};
  const log = { serper: [], shopping: [], searchapi: [], serpapi: [], google: [], tavily: 0, pages: [] };
  const fetch = async (url, init) => {
    const u = String(url);
    if (u === 'https://google.serper.dev/search') { log.serper.push({ body: JSON.parse(init.body), headers: init.headers, url: u }); if (opt.serperStatus) return json({}, opt.serperStatus); return json({ organic: opt.organic || ORG, credits: 1 }); }
    if (u === 'https://google.serper.dev/shopping') { log.shopping.push({ body: JSON.parse(init.body), headers: init.headers }); return json({ shopping: opt.shop || SHOP, credits: 2 }); }
    if (u.startsWith('https://www.searchapi.io/api/v1/search')) { log.searchapi.push({ url: u, headers: init.headers }); return json({ organic_results: opt.organic || ORG }); }
    if (u.startsWith('https://serpapi.com/search.json')) { log.serpapi.push({ url: u }); return json({ organic_results: opt.organic || ORG }); }
    if (/customsearch/.test(u)) { log.google.push(u); return json(opt.cse || CSE); }
    if (/api\.tavily\.com/.test(u)) { log.tavily++; return json({ results: [] }); }
    if (/(^https:\/\/www\.googleapis|perplexity|wikipedia)/.test(u)) return json({}, 404);
    const page = String(u).split('#')[0];
    if (PAGES[page]) { log.pages.push(page); return new Response(PAGES[page], { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    return new Response('nope', { status: 404, headers: { 'Content-Type': 'text/html' } });
  };
  return { log, fetch };
}
const ASK = 'ابغى نايك اير ماكس 90';
const QUERY = 'Nike Air Max 90';
const search = (env, n, extra) => CS.searchCards(QUERY, Object.assign({ ask: ASK, country: 'AE', enrich: true, env, fetch: n.fetch }, extra || {}));

test('١. بلا أيّ مفتاح بديل: لا نداء لأيّ مزوّد بديل، وجوجل كما كان', async () => {
  assert.equal(S.providerOf({}), '');
  const n = net();
  assert.equal(await S.organic('x', { env: {}, fetch: n.fetch }), null);
  assert.equal(await S.shopping('x', { env: { CARDS_SHOPPING: 'on' }, fetch: n.fetch }), null);
  assert.equal(await S.liveText('x', { env: {}, fetch: n.fetch }), null);
  const r = await search({ GOOGLE_SEARCH_API_KEY: 'g', GOOGLE_SEARCH_CX: 'c', CARDS_SHOPPING: 'on' }, n, { kind: 'product' });
  assert.equal(n.log.serper.length + n.log.shopping.length + n.log.searchapi.length + n.log.serpapi.length, 0, 'لا نداء بديل');
  assert.equal(n.log.google.length, 1, 'جوجل نداء واحد');
  assert.deepEqual(r.items.map((c) => c.site), ['amazon.ae', 'noon.com']);
});

test('٢. Serper: POST بالمفتاح في الترويسة وgl=ae وعشر نتائج، والبطاقة من صفحة المتجر (صورة وسعر منظّم)، والمقالة تسقط، وجوجل لا يُنادى', async () => {
  const n = net();
  const r = await search({ SERPER_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'g', GOOGLE_SEARCH_CX: 'c' }, n);
  assert.equal(n.log.serper.length, 1);
  const call = n.log.serper[0];
  assert.equal(call.headers['X-API-KEY'], KEY);
  assert.ok(!call.url.includes(KEY), 'المفتاح ليس في الرابط');
  assert.equal(call.body.gl, 'ae');
  assert.equal(call.body.num, 10);
  assert.match(call.body.q, /^Nike Air Max 90 United Arab Emirates$/, 'عبارة البحث كما يبنيها pinQuery لجوجل');
  assert.equal(n.log.google.length, 0, 'البديل بمفتاحه أوّلًا');
  assert.deepEqual(r.items.map((c) => c.site), ['amazon.ae', 'noon.com'], 'المقالة (og:type article) سقطت');
  assert.deepEqual(r.items.map((c) => c.price), ['AED 189', 'AED 320'], 'سعر المتجر المنظّم لا «AED 350» من المقتطف');
  assert.deepEqual(r.items.map((c) => c.image), ['https://m.media-amazon.com/images/I/x1.jpg', 'https://f.nooncdn.com/p/n1.jpg']);
  const ev = CS.cardsEvent(QUERY, { kind: 'product' }, r.items, { ask: ASK, country: 'AE' });
  assert.deepEqual(Object.keys(ev.cards.items[0]).sort(), ['image', 'price', 'site', 'snippet', 'title', 'url'], 'حقول البطاقة نفسها للعميل');
});

test('٣. SearchApi: GET بـengine=google وgl=ae والمفتاح Bearer لا في الرابط، والتحويل نفسه', async () => {
  const n = net();
  const r = await search({ SEARCHAPI_API_KEY: KEY }, n);
  assert.equal(n.log.searchapi.length, 1);
  const u = new URL(n.log.searchapi[0].url);
  assert.equal(u.searchParams.get('engine'), 'google');
  assert.equal(u.searchParams.get('gl'), 'ae');
  assert.equal(n.log.searchapi[0].headers.Authorization, 'Bearer ' + KEY);
  assert.ok(!n.log.searchapi[0].url.includes(KEY));
  assert.deepEqual(r.items.map((c) => [c.site, c.price]), [['amazon.ae', 'AED 189'], ['noon.com', 'AED 320']]);
});

test('٤. SerpApi: GET search.json بـengine=google وgl=ae (المفتاح معامل كما في توثيقه)، والتحويل نفسه', async () => {
  const n = net();
  const r = await search({ SERPAPI_API_KEY: KEY }, n);
  assert.equal(n.log.serpapi.length, 1);
  const u = new URL(n.log.serpapi[0].url);
  assert.equal(u.searchParams.get('engine'), 'google');
  assert.equal(u.searchParams.get('gl'), 'ae');
  assert.equal(u.searchParams.get('api_key'), KEY);
  assert.deepEqual(r.items.map((c) => [c.site, c.price]), [['amazon.ae', 'AED 189'], ['noon.com', 'AED 320']]);
});

test('٥. الترتيب والسقوط: Serper قبل الآخرَين؛ فشله أو خلوّه ← جوجل؛ والكلّ فاشل ← Tavily؛ ولا مفتاح في السجلّ', async () => {
  const warns = [];
  const keep = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try {
    let n = net();
    await search({ SERPER_API_KEY: KEY, SEARCHAPI_API_KEY: 'k2', SERPAPI_API_KEY: 'k3' }, n);
    assert.deepEqual([n.log.serper.length, n.log.searchapi.length, n.log.serpapi.length], [1, 0, 0], 'أوّل مفتاح موجود وحده');
    n = net({ serperStatus: 500 });
    let r = await search({ SERPER_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'g', GOOGLE_SEARCH_CX: 'c' }, n);
    assert.equal(n.log.google.length, 1, 'فشل البديل ← جوجل');
    assert.deepEqual(r.items.map((c) => c.site), ['amazon.ae', 'noon.com']);
    n = net({ organic: [] });
    await search({ SERPER_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'g', GOOGLE_SEARCH_CX: 'c' }, n);
    assert.equal(n.log.google.length, 1, 'خلوّه ← جوجل');
    n = net({ serperStatus: 429 });
    r = await search({ SERPER_API_KEY: KEY, TAVILY_API_KEY: 't' }, n);
    assert.equal(n.log.tavily, 1, 'بلا جوجل ← Tavily');
    assert.deepEqual(r.items, []);
    assert.equal(await S.organic('x', { env: { SERPER_API_KEY: KEY }, fetch: async () => { throw new Error('ECONNRESET ' + KEY); } }), null, 'رمي الشبكة = null لا استثناء');
  } finally { console.warn = keep; }
  assert.ok(warns.length >= 2 && warns.every((w) => !w.includes(KEY)), 'السجلّ بلا مفتاح: ' + warns.join(' | '));
});

test('٦. التسوّق (CARDS_SHOPPING=on، Serper، منتج): سعر المتجر بعملة البلد يبقى، صورة الصفحة ثمّ المصغّرة، ورابط جوجل والصورة base64 بلا صفحة لا يصيران بطاقة', async () => {
  const env = { SERPER_API_KEY: KEY, CARDS_SHOPPING: 'on' };
  let n = net();
  let r = await search(env, n, { kind: 'product' });
  assert.equal(n.log.shopping.length, 1);
  assert.deepEqual(n.log.shopping[0].body, { q: 'Nike Air Max 90 United Arab Emirates', gl: 'ae' });
  assert.equal(n.log.serper.length, 0, 'متجران فأكثر برابطهما = لا بحث عضويّ بعده');
  assert.deepEqual(r.items.map((c) => c.site), ['amazon.ae', 'en-ae.sssports.com'], 'رابط google.com سقط، وShop X بلا صورة سقطت');
  assert.deepEqual(r.items.map((c) => c.price), ['AED 199.00', 'AED 549.00'], 'سعر نتيجة التسوّق لا يُستبدل');
  assert.deepEqual(r.items.map((c) => c.image), ['https://m.media-amazon.com/images/I/x1.jpg', 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:s1'], 'صورة الصفحة أوّلًا، والمصغّرة حين لا تُقرأ الصفحة');
  assert.ok(!JSON.stringify(CS.cardsEvent(QUERY, {}, r.items, {})).match(/google\.com|"thumb"/), 'لا رابط جوجل ولا حقل داخليّ للعميل');
  // روابط التسوّق كلّها صفحات جوجل ← البحث العضويّ
  n = net({ shop: SHOP.map((x) => Object.assign({}, x, { link: 'https://www.google.ae/shopping/product/' + x.position })) });
  r = await search(env, n, { kind: 'product' });
  assert.deepEqual([n.log.shopping.length, n.log.serper.length], [1, 1]);
  assert.deepEqual(r.items.map((c) => c.site), ['amazon.ae', 'noon.com']);
  // بلا العلم، أو لغير المنتج، أو لمزوّد آخر: لا تسوّق
  for (const [e, kind] of [[{ SERPER_API_KEY: KEY }, 'product'], [env, 'service'], [{ SEARCHAPI_API_KEY: KEY, CARDS_SHOPPING: 'on' }, 'product']]) {
    n = net();
    await search(e, n, { kind });
    assert.equal(n.log.shopping.length, 0, JSON.stringify([Object.keys(e), kind]));
  }
});

test('٧. «أفضل X» (items): بحث عضويّ واحد لكلّ خيار باسمه ومكانه، بلا تسوّق ولو فُعّل — حدّ الستّة بحوث', async () => {
  const organic = [{ title: 'Alpha One — Shop AE', link: 'https://shop.example.ae/alpha-one', snippet: 'Alpha One' }, { title: 'Alpha Two — Shop AE', link: 'https://shop.example.ae/alpha-two', snippet: 'Alpha Two' }];
  const n = net({ organic });
  const r = await CS.searchCards('x', { ask: 'قارن بين Alpha One و Alpha Two', country: 'AE', enrich: true, items: ['Alpha One', 'Alpha Two'], kind: 'product', fetch: n.fetch, env: { SERPER_API_KEY: KEY, CARDS_SHOPPING: 'on' } });
  assert.equal(n.log.shopping.length, 0);
  assert.deepEqual(n.log.serper.map((c) => c.body.q).sort(), ['Alpha One price United Arab Emirates', 'Alpha Two price United Arab Emirates']);
  assert.deepEqual(r.items.map((c) => [c.title, c.price]), [['Alpha One', 'AED 100'], ['Alpha Two', 'AED 200']]);
});

test('٨. التحويل من web_search (pickAsCards بالبيئة الحقيقيّة): صفحات متاجر ← بطاقات؛ مقالات فقط ← بحث الويب كما كان؛ والتسوّق لا يحكم', async () => {
  const saved = global.fetch;
  process.env.SERPER_API_KEY = KEY;
  process.env.CARDS_SHOPPING = 'on';
  try {
    let n = net();
    global.fetch = n.fetch;
    const pc = await CS.pickAsCards(QUERY, { ask: ASK, country: 'AE' });
    assert.ok(pc, 'بطاقات');
    assert.deepEqual(pc.ev.cards.items.map((c) => c.site), ['amazon.ae', 'noon.com']);
    assert.equal(n.log.serper.length, 1);
    assert.equal(n.log.shopping.length, 0, 'لـ«سعر الذهب» نتائج تسوّق أيضًا — الحكم لبنية الصفحات (v-google-cards)');
    n = net({ organic: [ORG[2], { title: 'Nike history', link: 'https://blog.example.com/history', snippet: 'Nike' }] });
    global.fetch = n.fetch;
    assert.equal(await CS.pickAsCards(QUERY, { ask: ASK, country: 'AE' }), null, 'لا متجر = بحث الويب');
  } finally { global.fetch = saved; delete process.env.SERPER_API_KEY; delete process.env.CARDS_SHOPPING; }
});

test('٩. نصّ البحث الحيّ: ستّ نتائج مرقّمة بتاريخها، ونافذة الحداثة بصيغة كلّ مزوّد، والمصدر باسم وظيفيّ', async () => {
  const organic = Array.from({ length: 8 }, (_, i) => ({ title: 'Result ' + (i + 1), link: 'https://site' + i + '.ae/p', snippet: 'snippet ' + i, date: i === 0 ? '2 days ago' : undefined }));
  let n = net({ organic });
  const t = await S.liveText('أخبار الذهب', { env: { SERPER_API_KEY: KEY }, fetch: n.fetch, win: 'week', gl: 'AE' });
  assert.deepEqual(n.log.serper[0].body, { q: 'أخبار الذهب', num: 10, gl: 'ae', tbs: 'qdr:w' });
  assert.match(t, /^1\. Result 1 \(نُشر: 2 days ago\)\nhttps:\/\/site0\.ae\/p\nsnippet 0\n\n2\. Result 2\n/);
  assert.ok(t.includes('6. Result 6') && !t.includes('7. Result 7'), 'ستّ نتائج كخطوة جوجل');
  assert.ok(t.endsWith('\n\nالمصدر: بحث الويب.'));
  assert.doesNotMatch(t, /google|serper|searchapi|serpapi|جوجل/i, 'لا اسم مزوّد');
  n = net({ organic });
  await S.liveText('x', { env: { SEARCHAPI_API_KEY: KEY }, fetch: n.fetch, win: 'month', gl: 'GB' });
  assert.match(n.log.searchapi[0].url, /&gl=uk&time_period=last_month$/);
  n = net({ organic });
  await S.liveText('x', { env: { SERPAPI_API_KEY: KEY }, fetch: n.fetch, win: 'year' });
  assert.match(n.log.serpapi[0].url, /&tbs=qdr%3Ay&api_key=/);
  assert.equal(await S.liveText('x', { env: { SERPER_API_KEY: KEY }, fetch: net({ serperStatus: 403 }).fetch }), null, 'فشل = null');
});

test('١٠. سلسلة البحث الحيّ الحقيقيّة (chat.js): البديل بمفتاحه مكان جوجل، وبلاه أو بفشله جوجل كما كان — في العروض وغيرها', async () => {
  const chat = require(rp('api/_lib/chat.js'));
  const src = read('api/_lib/chat.js');
  const steps = src.split('\n').filter((l) => /\['google', /.test(l));
  assert.equal(steps.length, 2, 'خطوتا جوجل (العروض وغيرها)');
  assert.ok(steps.every((l) => /require\('\.\/serp-search\.js'\)\.liveText\(.*\)\) \|\| gcseSearch\(/.test(l)), 'البديل قبل gcseSearch في السطر نفسه');
  const saved = global.fetch;
  const q = 'laptop for university students';
  process.env.GOOGLE_SEARCH_API_KEY = 'g'; process.env.GOOGLE_SEARCH_CX = 'c';
  try {
    process.env.SERPER_API_KEY = KEY;
    let n = net();
    global.fetch = n.fetch;
    let out = await chat.__vsearch.tavilySearch(q, null, false, 'AE', '', undefined, false, false);
    assert.match(out, /^1\. Nike Air Max 90 Men — Amazon\.ae\n/);
    assert.match(out, /المصدر: بحث الويب\./);
    assert.equal(n.log.serper[0].body.gl, 'ae');
    assert.equal(n.log.google.length, 0, 'جوجل لا يُنادى');
    n = net({ serperStatus: 500 });
    global.fetch = n.fetch;
    out = await chat.__vsearch.tavilySearch(q, null, false, 'AE', '', undefined, false, false);
    assert.equal(n.log.google.length, 1, 'فشل البديل ← جوجل في الخطوة نفسها');
    delete process.env.SERPER_API_KEY;
    n = net();
    global.fetch = n.fetch;
    await chat.__vsearch.tavilySearch(q, null, false, 'AE', '', undefined, false, false);
    assert.deepEqual([n.log.serper.length, n.log.google.length], [0, 1], 'بلا مفتاح: كما كان');
  } finally { global.fetch = saved; for (const k of ['SERPER_API_KEY', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX']) delete process.env[k]; }
});

test('١١. التوثيق: المفاتيح الأربعة في فهرس البيئة بلا قيمة، ومدخل القرار في رأس السجلّ', () => {
  const SPEC = require(rp('api/_lib/env.js')).SPEC;
  for (const k of ['SERPER_API_KEY', 'SEARCHAPI_API_KEY', 'SERPAPI_API_KEY', 'CARDS_SHOPPING']) assert.equal(SPEC[k] && SPEC[k][0], 'tunable', k + ': له بديل آمن (السلسلة كما كانت)');
  /* السجلّ ينمو من رأسه، فنافذة «أوّل ١٢٠٠٠ حرف» تُسقط أيّ مدخل جديد (v-decor-hover-flash) — المدخل بعنوانه في السجلّ */
  assert.match(read('knowledge/DECISIONS.md'), /^## [^\n]*v-serp-cards/m);
});
