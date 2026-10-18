// tests/serp-modules.test.cjs — v-serp-modules (Custom Search يتوقّف ١ يناير ٢٠٢٧، بلا اشتراك ولا إنفاق): محوّل v-serp-cards نفسه
// (api/_lib/serp-search.js) أمام نداءات Custom Search الباقية — design-ideas (صور)، live-social (site:)، search.js (الحسابات والويب
// وشريط الصور). يثبت: (١) بلا مفتاح بديل النداءات الخمسة حرفيًّا كما كانت وبترتيبها، ولا نداء لبديل. (٢–٤) صور البديل بـSafeSearch
// (SearchApi ثمّ SerpApi؛ Serper بلا صور)، والعدّ والفشل في حالة design-ideas. (٥) التواصل بـsite: والنافذة. (٦–٧) search.js: الويب
// ونافذة اليوم، والحسابات، وشريط الصور، ولا اسم مزوّد ولا مفتاح في الردّ. الشبكة كلّها محاكاة، والمعالجات حقيقيّة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ALL = ['SERPER_API_KEY', 'SEARCHAPI_API_KEY', 'SERPAPI_API_KEY', 'CARDS_SHOPPING', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_CX', 'TAVILY_API_KEY',
  'PERPLEXITY_API_KEY', 'PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY', 'COHERE_API_KEY', 'GOOGLE_PLACES_API_KEY'];
for (const k of ALL) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const refunds = [];
stub('api/_lib/kv.js', { kvGetRaw: async () => null, kvSetRaw: async () => {}, kvGetJSON: async () => null, kvPutJSON: async () => {} });
stub('api/_lib/_usage.js', { checkAndConsumeCustom: async () => ({ allowed: true, remaining: 9 }), refundCustom: async (...a) => { refunds.push(a); }, clientIp: () => '203.0.113.9' });
stub('api/_lib/_planCap.js', { checkAndConsumePlanCustom: async () => ({ allowed: true }) });
stub('api/_lib/auth.js', { verifyToken: (t) => (t === 'tk' ? { u: 'dana' } : null) });
const S = require(rp('api/_lib/serp-search.js'));
const ideas = require(rp('api/_lib/design-ideas.js'));
const ls = require(rp('api/_lib/live-social.js'));
const search = require(rp('api/_lib/search.js'));

const KEY = 'serp-modules-KEY-SECRET';
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } });
const enc = encodeURIComponent;
const CSE = 'https://www.googleapis.com/customsearch/v1';
const SOCIAL_Q = (q) => q + ' (site:youtube.com OR site:reddit.com OR site:instagram.com OR site:tiktok.com OR site:x.com OR site:facebook.com OR site:snapchat.com OR site:linkedin.com OR site:threads.net OR site:quora.com)';

/* الشبكة: كلّ نداء يُسجَّل، والردّ من «المشهد» الحاليّ */
let calls = [];
let scene = {};
globalThis.fetch = async (url, init) => {
  const u = String(url);
  let body = null;
  try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = init.body; }
  const c = { u, body, headers: (init && init.headers) || {}, method: (init && init.method) || 'GET' };
  calls.push(c);
  const kind = u === 'https://google.serper.dev/search' ? 'serper' : u.startsWith('https://www.searchapi.io/') ? 'searchapi'
    : u.startsWith('https://serpapi.com/') ? 'serpapi' : u.startsWith(CSE) ? 'cse' : u.startsWith('https://api.tavily.com/') ? 'tavily'
      : u.startsWith('https://api.openverse.org/') ? 'openverse' : 'other';
  if (scene[kind]) return scene[kind](c);
  if (kind === 'tavily') return json({ results: [], images: [] });
  if (kind === 'openverse') return json({ results: [] });
  return json({}, 404);
};
const kinds = () => calls.map((c) => (c.u.startsWith(CSE) ? 'cse' : new URL(c.u).hostname));
async function withEnv(env, fn) {
  const keep = {};
  for (const k of ALL) { keep[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  calls = []; refunds.length = 0;
  try { return await fn(); } finally {
    scene = {};
    for (const k of ALL) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  }
}
function run(handler, body, headers) {
  return new Promise((resolve, reject) => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
      json(o) { resolve({ code: this.code, body: o }); return this; }, end() { resolve({ code: this.code, body: null }); return this; } };
    Promise.resolve(handler({ method: 'POST', headers: headers || {}, body }, res)).catch(reject);
  });
}
/* صور مختلفة لكلّ استعلام: الرابط يحمل بصمة الاستعلام ورقمًا */
const imgsFor = (q, n, f) => Array.from({ length: n }, (_, i) => f('https://img.example.com/' + require('node:crypto').createHash('sha1').update(String(q)).digest('hex').slice(0, 12) + '/' + i + '.jpg', i));
const qOf = (u) => new URL(u).searchParams.get('q');

test('١. بلا مفتاح بديل: نداءات Custom Search الخمسة حرفيًّا كما كانت وبترتيبها، ولا نداء لأيّ بديل', async () => {
  const GK = 'gk', GCX = 'cx';
  await withEnv({ GOOGLE_SEARCH_API_KEY: GK, GOOGLE_SEARCH_CX: GCX, TAVILY_API_KEY: 'tv' }, async () => {
    // design-ideas: أربعة استعلامات صور بـsafe=active وnum=10
    scene.cse = (c) => json({ items: imgsFor(qOf(c.u), 10, (link) => ({ link })) });
    const r = await run(ideas, { token: 'tk', place: 'majlis' });
    assert.equal(r.code, 200);
    assert.equal(r.body.source, 'google');
    const gq = ['arabic majlis interior design ideas ', 'arabic majlis interior design inspiration', 'مجلس عربي ديكور تصميم', 'arabic majlis luxury interior photos'];
    assert.deepEqual(calls.map((c) => c.u), gq.map((q) => CSE + '?key=' + GK + '&cx=' + GCX + '&searchType=image&num=10&safe=active&q=' + enc(q.replace(/\s+/g, ' ').trim())));
  });
  await withEnv({ GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx' }, async () => {
    // live-social: site: ونافذة السنة بـdateRestrict
    const seen = [];
    const out = await ls.viaGoogle('gold', async (u) => { seen.push(String(u)); return json({ items: [{ link: 'https://www.instagram.com/p/1', title: 'gold shop', snippet: 'x' }] }); }, 'year');
    assert.deepEqual(seen, [CSE + '?key=gk&cx=cx&num=8&q=' + enc(SOCIAL_Q('gold')) + '&dateRestrict=y1']);
    assert.match(out, /^1\. \[Instagram\] gold shop\nhttps:\/\/www\.instagram\.com\/p\/1\nx$/);
    assert.equal(calls.length, 0, 'لا نداء بالجلب العامّ');
  });
  await withEnv({ GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    // search.js: الويب (num=3) ثمّ الحسابات (site:) ثمّ شريط الصور — بالترتيب نفسه
    scene.cse = (c) => (/searchType=image/.test(c.u) ? json({ items: [{ link: 'https://i.example.com/a.jpg' }, { link: 'http://i.example.com/b.jpg' }] })
      : json({ items: [{ link: 'https://web.example.com/a', title: 'A', snippet: 'sa' }] }));
    const r = await run(search, { query: 'tesla model y', images: true });
    assert.equal(r.code, 200);
    const cse = calls.filter((c) => c.u.startsWith(CSE)).map((c) => c.u);
    assert.deepEqual(cse, [
      CSE + '?key=gk&cx=cx&q=' + enc('tesla model y') + '&num=3',
      CSE + '?key=gk&cx=cx&q=' + enc('tesla model y instagram tiktok youtube official account site:instagram.com OR site:tiktok.com') + '&num=8',
      CSE + '?key=gk&cx=cx&q=' + enc('tesla model y') + '&searchType=image&num=4&safe=active',
    ]);
    assert.deepEqual(kinds().slice(0, 3), ['api.tavily.com', 'cse', 'api.tavily.com'], 'نداء الويب في اللحظة نفسها (بين Tavily والحسابات)');
    assert.deepEqual(r.body.google, [{ title: 'A', url: 'https://web.example.com/a', content: 'sa' }]);
    assert.deepEqual(r.body.images, ['https://i.example.com/a.jpg']);
    calls = [];
    await run(search, { query: 'tesla model y', latestNews: true });
    assert.deepEqual(calls.filter((c) => c.u.startsWith(CSE)).map((c) => c.u), [CSE + '?key=gk&cx=cx&q=' + enc('tesla model y') + '&num=3&dateRestrict=d1&sort=date']);
  });
  await withEnv({ TAVILY_API_KEY: 'tv' }, async () => {
    // بلا أيّ مفتاح Google: لا نداء جوجل ولا بديل، وdetail كما كان
    scene.tavily = () => json({ detail: 'quota' }, 432);
    const r = await run(ideas, { token: 'tk', q: 'qx-' + Date.now() });
    assert.equal(r.body.error, 'provider');
    assert.equal(r.body.detail.google, 'off');
    assert.ok(!kinds().some((k) => /serper|searchapi|serpapi|cse/.test(k)), kinds().join(','));
  });
});

test('٢. صور البديل لمعرض الأفكار: SearchApi بـsafe=active والمفتاح في الترويسة، ولا Custom Search ولا Tavily حين تكفي', async () => {
  await withEnv({ SEARCHAPI_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    scene.searchapi = (c) => json({ images: imgsFor(qOf(c.u), 30, (link, i) => ({ position: i + 1, title: 't' + i, thumbnail: link + '?th', original: { link, width: 1600, height: 1000 }, source: { name: 's', link: 'https://page.example.com/' + i } })) });
    const r = await run(ideas, { token: 'tk', place: 'kitchen' });
    assert.equal(r.code, 200);
    assert.deepEqual(kinds(), ['www.searchapi.io', 'www.searchapi.io', 'www.searchapi.io', 'www.searchapi.io']);
    for (const c of calls) {
      const u = new URL(c.u);
      assert.equal(u.pathname, '/api/v1/search');
      assert.equal(u.searchParams.get('engine'), 'google_images');
      assert.equal(u.searchParams.get('safe'), 'active', 'SafeSearch مفروض');
      assert.equal(c.headers.Authorization, 'Bearer ' + KEY);
      assert.ok(!c.u.includes(KEY), 'لا مفتاح في الرابط');
    }
    assert.equal(r.body.count, 40, 'عشر صور لكلّ استعلام كما كان Custom Search');
    assert.ok(r.body.images.every((u) => /^https:\/\/img\.example\.com\/.+\.jpg$/.test(u)), 'الصورة الأصليّة لا المصغّرة');
    assert.equal(r.body.source, 'google');
    assert.ok(!/serper|searchapi|serpapi/i.test(JSON.stringify(r.body)), 'لا اسم مزوّد في الردّ');
  });
  // بلا Tavily وبلا Custom Search: البديل وحده يكفي ليعمل المعرض (hasGoogle)
  await withEnv({ SEARCHAPI_API_KEY: KEY }, async () => {
    scene.searchapi = (c) => json({ images: imgsFor(qOf(c.u), 12, (link) => ({ original: { link } })) });
    const r = await run(ideas, { token: 'tk', q: 'only-alt-' + Date.now() });
    assert.equal(r.code, 200);
    assert.equal(r.body.count, 40);
  });
});

test('٣. حالة design-ideas: فشل البديل في googleFail/googleErr، وردّه الناجح الفارغ مدفوع يُعدّ ثمّ Custom Search كما كان', async () => {
  // فشل البديل (402) وTavily (432) وبلا Custom Search: الرمز في detail.google، ولا مدفوع خدم فتُردّ الحصّة
  await withEnv({ SEARCHAPI_API_KEY: KEY, TAVILY_API_KEY: 'tv' }, async () => {
    scene.searchapi = () => json({ error: 'credits' }, 402);
    scene.tavily = () => json({ detail: 'quota' }, 432);
    const r = await run(ideas, { token: 'tk', q: 'fail-' + Date.now() });
    assert.equal(r.body.error, 'provider');
    assert.equal(r.body.detail.google, 402);
    assert.equal(r.body.detail.paid, 0);
    assert.equal(refunds.length, 1, 'لم يخدم مدفوع: الحصّة تُردّ');
  });
  // شبكة: 'net' كما كان googleErr
  await withEnv({ SERPAPI_API_KEY: KEY, TAVILY_API_KEY: 'tv' }, async () => {
    scene.serpapi = () => { throw new TypeError('fetch failed'); };
    scene.tavily = () => json({ detail: 'quota' }, 432);
    const r = await run(ideas, { token: 'tk', q: 'net-' + Date.now() });
    assert.equal(r.body.detail.google, 'net');
  });
  // ردّ ناجح بلا صور: يُعدّ مدفوعًا (لا ردّ للحصّة)، ثمّ Custom Search للاستعلامات نفسها
  await withEnv({ SEARCHAPI_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    scene.searchapi = () => json({ images: [] });
    scene.cse = (c) => json({ items: imgsFor(qOf(c.u), 10, (link) => ({ link })) });
    const r = await run(ideas, { token: 'tk', q: 'empty-alt-' + Date.now() });
    assert.equal(r.code, 200);
    assert.deepEqual(kinds(), ['www.searchapi.io', 'www.searchapi.io', 'www.searchapi.io', 'www.searchapi.io', 'cse', 'cse', 'cse', 'cse']);
    assert.equal(r.body.count, 40);
  });
  await withEnv({ SEARCHAPI_API_KEY: KEY, TAVILY_API_KEY: 'tv' }, async () => {
    scene.searchapi = () => json({ images: [] });
    const r = await run(ideas, { token: 'tk', q: 'empty-paid-' + Date.now() });
    assert.equal(r.body.error, 'provider');
    assert.ok(r.body.detail.paid >= 4, JSON.stringify(r.body.detail));
    assert.equal(refunds.length, 0, 'مزوّد مدفوع خدم الطلب: لا ردّ (v-ideas-paid)');
  });
});

test('٤. images: SerpApi بـsafe=active والمفتاح معامل، SearchApi يسبقه، وSerper بلا صور (لا SafeSearch موثّق)', async () => {
  const log = [];
  const f = async (u, init) => { log.push({ u: String(u), init }); return json({ images_results: [{ position: 1, original: 'https://o.example.com/1.jpg', thumbnail: 'https://t.example.com/1', title: 'One', link: 'https://p.example.com/1', source: 'P' }, { title: 'no image' }] }); };
  const out = await S.images('majlis', { env: { SERPAPI_API_KEY: KEY }, fetch: f });
  assert.deepEqual(out, [{ image: 'https://o.example.com/1.jpg', thumb: 'https://t.example.com/1', title: 'One', page: 'https://p.example.com/1' }]);
  const u = new URL(log[0].u);
  assert.equal(u.origin + u.pathname, 'https://serpapi.com/search.json');
  assert.deepEqual([u.searchParams.get('engine'), u.searchParams.get('safe'), u.searchParams.get('q'), u.searchParams.get('api_key')], ['google_images', 'active', 'majlis', KEY]);
  assert.equal(S.imagesProviderOf({ SEARCHAPI_API_KEY: 'a', SERPAPI_API_KEY: 'b', SERPER_API_KEY: 'c' }), 'searchapi');
  assert.equal(S.imagesProviderOf({ SERPAPI_API_KEY: 'b', SERPER_API_KEY: 'c' }), 'serpapi');
  assert.equal(S.imagesProviderOf({ SERPER_API_KEY: 'c' }), '');
  log.length = 0;
  assert.equal(await S.images('majlis', { env: { SERPER_API_KEY: KEY }, fetch: f }), null);
  assert.equal(await S.images('majlis', { env: {}, fetch: f }), null);
  assert.equal(log.length, 0, 'لا نداء');
  // num يقصّ، وonFail يأخذ الرمز
  const many = async () => json({ images: imgsFor('x', 30, (link) => ({ original: { link } })) });
  assert.equal((await S.images('x', { env: { SEARCHAPI_API_KEY: KEY }, fetch: many, num: 4 })).length, 4);
  const fails = [];
  assert.equal(await S.images('x', { env: { SEARCHAPI_API_KEY: KEY }, fetch: async () => json({}, 429), onFail: (s) => fails.push(s) }), null);
  assert.equal(await S.organic('x', { env: { SERPER_API_KEY: KEY }, fetch: async () => { throw new Error('down'); }, onFail: (s) => fails.push(s) }), null);
  assert.deepEqual(fails, [429, 'net']);
  // Serper وحده مع Custom Search: معرض الأفكار يبقى على Custom Search حرفيًّا
  await withEnv({ SERPER_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    scene.cse = (c) => json({ items: imgsFor(qOf(c.u), 10, (link) => ({ link })) });
    const r = await run(ideas, { token: 'tk', q: 'serper-only-' + Date.now() });
    assert.equal(r.code, 200);
    assert.deepEqual(kinds(), ['cse', 'cse', 'cse', 'cse']);
    assert.ok(calls.every((c) => /&searchType=image&num=10&safe=active&q=/.test(c.u)));
  });
});

test('٥. التواصل: البديل بالاستعلام نفسه (site:) والنافذة بصيغته، ولا Custom Search؛ وبلا منشور اجتماعيّ منه فـCustom Search', async () => {
  await withEnv({ SERPER_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx' }, async () => {
    const log = [];
    const f = async (u, init) => {
      log.push({ u: String(u), body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
      if (String(u).startsWith(CSE)) return json({ items: [{ link: 'https://www.reddit.com/r/gold/1', title: 'from cse', snippet: 'c' }] });
      return json({ organic: [{ title: 'gold shop', link: 'https://www.instagram.com/p/1', snippet: 'x', date: '2026-09-28' }, { title: 'news', link: 'https://news.example.com/a', snippet: 'n' }] });
    };
    const out = await ls.viaGoogle('gold', f, 'year');
    assert.equal(log.length, 1);
    assert.equal(log[0].u, 'https://google.serper.dev/search');
    assert.deepEqual(log[0].body, { q: SOCIAL_Q('gold'), num: 10, tbs: 'qdr:y' });
    assert.equal(log[0].headers['X-API-KEY'], KEY);
    assert.equal(out, '1. [Instagram] gold shop (2026-09-28)\nhttps://www.instagram.com/p/1\nx', 'غير الاجتماعيّ يسقط كما كان');
    log.length = 0;
    await ls.viaGoogle('gold', f, 'month');
    assert.equal(log[0].body.tbs, 'qdr:m');
    log.length = 0;
    await ls.viaGoogle('gold', f, '');
    assert.equal(log[0].body.tbs, undefined, 'بلا نافذة لا قيد');
    // البديل بلا منشور اجتماعيّ: Custom Search كما كان
    log.length = 0;
    const f2 = async (u, init) => (String(u).startsWith(CSE) ? f(u, init) : (log.push({ u: String(u) }), json({ organic: [{ title: 'n', link: 'https://news.example.com/a', snippet: 'n' }] })));
    const out2 = await ls.viaGoogle('gold', f2, 'week');
    assert.deepEqual(log.map((x) => x.u.startsWith(CSE) ? 'cse' : 'serper'), ['serper', 'cse']);
    assert.match(log[1].u, /&dateRestrict=w1$/);
    assert.match(out2, /\[Reddit\] from cse/);
    // سؤال طويل: البديل يقصّ السؤال ويُبقي قيد المنصّات كاملًا (سقفه ٣٠٠ حرف)، وCustom Search كما كان
    const seenL = [];
    const fL = async (u, init) => { seenL.push({ u: String(u), body: init && init.body ? JSON.parse(init.body) : null }); return String(u).startsWith(CSE) ? json({ items: [] }) : json({ organic: [] }); };
    const long = 'كم سعر الذهب اليوم في دبي '.repeat(10).trim();
    assert.ok(long.length > 240);
    await ls.viaGoogle(long, fL, '');
    assert.equal(seenL[0].u, 'https://google.serper.dev/search');
    assert.ok(seenL[0].body.q.length <= 300 && seenL[0].body.q.endsWith(SOCIAL_Q('').trim()), seenL[0].body.q);
    assert.ok(seenL[0].body.q.startsWith('كم سعر الذهب اليوم في دبي'));
    assert.equal(seenL[1].u, CSE + '?key=gk&cx=cx&num=8&q=' + enc(SOCIAL_Q(long.slice(0, 240))));
    // في السلسلة الحقيقيّة: لا اسم مزوّد في النصّ
    const s = await ls.socialSearch('gold', { chain: [ls.viaGoogle], fetchImpl: f });
    assert.ok(!/serper|searchapi|serpapi|google/i.test(s), s);
  });
});

test('٦. search.js بمفتاح Serper: الويب والحسابات من البديل (نافذة يوم لآخر الأخبار)، وشريط الصور على Custom Search إذ لا صور لـSerper', async () => {
  await withEnv({ SERPER_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    scene.serper = (c) => (/site:instagram\.com/.test(c.body.q)
      ? json({ organic: [{ title: 'Tesla (@teslamotors) • Instagram', link: 'https://www.instagram.com/teslamotors/', snippet: 's' }] })
      : json({ organic: [{ title: 'Model Y', link: 'https://www.tesla.com/modely', snippet: 'Electric SUV', date: '2 days ago' }, { title: 'G', link: 'https://news.google.com/x', snippet: 'removed' }] }));
    scene.cse = (c) => (/searchType=image/.test(c.u) ? json({ items: [{ link: 'https://i.example.com/a.jpg' }] }) : json({ items: [{ link: 'https://cse.example.com/', title: 'CSE', snippet: 'c' }] }));
    const r = await run(search, { query: 'tesla model y', images: true });
    assert.equal(r.code, 200);
    const serper = calls.filter((c) => c.u === 'https://google.serper.dev/search');
    assert.deepEqual(serper.map((c) => c.body), [{ q: 'tesla model y', num: 10 }, { q: 'tesla model y instagram tiktok youtube official account site:instagram.com OR site:tiktok.com', num: 10 }]);
    assert.deepEqual(calls.filter((c) => c.u.startsWith(CSE)).map((c) => c.u), [CSE + '?key=gk&cx=cx&q=' + enc('tesla model y') + '&searchType=image&num=4&safe=active'], 'الصور وحدها على Custom Search');
    assert.deepEqual(r.body.google, [{ title: 'Model Y', url: 'https://www.tesla.com/modely', content: 'Electric SUV' }], 'المصدر المحذوف لا يمرّ من البديل أيضًا');
    assert.deepEqual(r.body.social.map((s) => s.title), ['إنستغرام · @teslamotors']);
    assert.deepEqual(r.body.images, ['https://i.example.com/a.jpg']);
    assert.ok(!/serper|searchapi|serpapi/i.test(JSON.stringify(r.body)), 'لا اسم مزوّد في الردّ');
    assert.ok(!calls.some((c) => c.u.includes(KEY)), 'لا مفتاح في أيّ رابط');
    calls = [];
    await run(search, { query: 'tesla model y', latestNews: true });
    assert.deepEqual(calls.filter((c) => c.u === 'https://google.serper.dev/search').map((c) => c.body), [{ q: 'tesla model y', num: 10, tbs: 'qdr:d' }], 'dateRestrict=d1 ← نافذة يوم');
    assert.ok(!calls.some((c) => c.u.startsWith(CSE)), 'لا Custom Search حين يجيب البديل');
  });
  // البديل فارغ: Custom Search كما كان
  await withEnv({ SERPER_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    scene.serper = () => json({ organic: [] });
    scene.cse = () => json({ items: [{ link: 'https://cse.example.com/', title: 'CSE', snippet: 'c' }] });
    const r = await run(search, { query: 'tesla model y' });
    assert.deepEqual(r.body.google, [{ title: 'CSE', url: 'https://cse.example.com/', content: 'c' }]);
    assert.deepEqual(calls.filter((c) => c.u.startsWith(CSE)).map((c) => c.u).sort(), [
      CSE + '?key=gk&cx=cx&q=' + enc('tesla model y') + '&num=3',
      CSE + '?key=gk&cx=cx&q=' + enc('tesla model y instagram tiktok youtube official account site:instagram.com OR site:tiktok.com') + '&num=8',
    ].sort());
  });
});

test('٧. شريط صور search.js بمفتاح صور: البديل بـSafeSearch، والصورة https وحدها، وبلا صورة منه فـCustom Search', async () => {
  await withEnv({ SEARCHAPI_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    scene.searchapi = (c) => (new URL(c.u).searchParams.get('engine') === 'google_images'
      ? json({ images: [{ original: { link: 'http://plain.example.com/0.jpg' } }, ...imgsFor('t', 6, (link) => ({ original: { link }, thumbnail: link + '?th' }))] })
      : json({ organic_results: [{ title: 'W', link: 'https://w.example.com/', snippet: 'w' }] }));
    const r = await run(search, { query: 'tesla model y', images: true });
    assert.equal(r.code, 200);
    const img = calls.filter((c) => c.u.includes('engine=google_images'));
    assert.equal(img.length, 1);
    assert.equal(new URL(img[0].u).searchParams.get('safe'), 'active');
    assert.equal(new URL(img[0].u).searchParams.get('q'), 'tesla model y');
    assert.deepEqual(r.body.images, imgsFor('t', 4, (link) => link), 'أربع https والصورة الأصليّة');
    assert.ok(!calls.some((c) => c.u.startsWith(CSE)), 'لا Custom Search: الويب والحسابات والصور من البديل');
  });
  await withEnv({ SEARCHAPI_API_KEY: KEY, GOOGLE_SEARCH_API_KEY: 'gk', GOOGLE_SEARCH_CX: 'cx', TAVILY_API_KEY: 'tv' }, async () => {
    scene.searchapi = (c) => (new URL(c.u).searchParams.get('engine') === 'google_images' ? json({ images: [] }, 500) : json({ organic_results: [] }));
    scene.cse = (c) => (/searchType=image/.test(c.u) ? json({ items: [{ link: 'https://i.example.com/a.jpg' }] }) : json({ items: [] }));
    const r = await run(search, { query: 'tesla model y', images: true });
    assert.deepEqual(r.body.images, ['https://i.example.com/a.jpg']);
  });
  // مفتاح صور وحده بلا Custom Search: الشريط يعمل
  await withEnv({ SERPAPI_API_KEY: KEY, TAVILY_API_KEY: 'tv' }, async () => {
    scene.serpapi = (c) => (new URL(c.u).searchParams.get('engine') === 'google_images'
      ? json({ images_results: [{ original: 'https://o.example.com/1.jpg', link: 'https://p.example.com/1' }] }) : json({ organic_results: [] }));
    const r = await run(search, { query: 'tesla model y', images: true });
    assert.deepEqual(r.body.images, ['https://o.example.com/1.jpg']);
  });
});
