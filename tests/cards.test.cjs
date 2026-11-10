// tests/cards.test.cjs — v-cards (أمر المالك ١٢ أكتوبر، لقطات جوجل وChatGPT: «اذا اريد اطالب اي شي تطلعي نفس هذي الأفكار — شي
// نظامي… نماذج وعقب يعطيني المواقع… والتتبع على نفس الموضوع ويعطيه الأفضل»): (١) الوحدة cards-search: بطاقات من pagemap جوجل
// (صورة وسعر) وTavily احتياطًا، ونصّ الموديل، وحمولة الحدث. (٢) المعالج الحقيقيّ: موديل مزيّف يستدعي show_cards ← حدث cards
// وحدث sources للعميل، ونصّ مرقّم للموديل، والسقف يُعدّ كبحث الويب، وتعليمة [البطاقات] في نظام دور الأدوات.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'cards-test-secret';
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
const quota = { calls: [], allow: true };
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: 'sub-user' }),
  checkAndConsumeCustom: async (token, guestId, ip, bucket, limit) => { quota.calls.push({ bucket, limit }); return quota.allow ? { allowed: true, username: 'sub-user', remaining: 9 } : { allowed: false, reason: 'limit' }; },
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
const realSearch = require(rp('api/_lib/search.js'));
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: realSearch.regionOf, hasRegion: realSearch.hasRegion });
const CS = require(rp('api/_lib/cards-search.js'));
const chat = require(rp('api/_lib/chat.js'));

const GOOGLE = { items: [
  { title: 'ENVE SES 4.5 Wheelset | Ventum Middle East', link: 'https://www.ventum.me/products/enve-ses-45', snippet: 'Carbon road wheelset, 1,432 g. AED 12,999 with free shipping in UAE.',
    pagemap: { cse_thumbnail: [{ src: 'https://t.gstatic.com/thumb1.jpg' }], cse_image: [{ src: 'https://www.ventum.me/cdn/ses45.jpg' }], offer: [{ price: '12999', pricecurrency: 'AED' }] } },
  { title: 'ENVE SES 3.4 — Wolfi\'s Bike Shop Dubai', link: 'https://wolfis.ae/enve-ses-34', snippet: 'Lightweight climbing wheels. 9,099 AED.',
    pagemap: { metatags: [{ 'og:image': 'https://wolfis.ae/img/ses34.jpg', 'product:price:amount': '9099', 'product:price:currency': 'AED' }] } },
  { title: 'ENVE SES 4.5 PRO review', link: 'https://www.bikeradar.com/reviews/enve-ses-45-pro', snippet: 'Our verdict on the 17,499 درهم wheelset.', pagemap: {} },
  { title: 'dup', link: 'https://www.ventum.me/products/enve-ses-45', snippet: 'x', pagemap: {} },
  { title: 'no link', snippet: 'x' },
] };

test('١. الوحدة: pagemap جوجل → صورة (cse_image ثمّ og:image) وسعر (offer ثمّ metatags ثمّ النصّ)، بلا تكرار رابط، والمواقع فريدة', async () => {
  const calls = [];
  const fetchImpl = async (u) => { calls.push(String(u)); return new Response(JSON.stringify(GOOGLE), { status: 200 }); };
  const r = await CS.searchCards('ENVE SES wheels price UAE', { fetch: fetchImpl });
  assert.equal(calls.length, 1, 'جوجل وحده كفى');
  assert.match(calls[0], /gl=ae/, 'بحث دولة الطلب');
  assert.match(calls[0], /cr=countryAE/);
  assert.match(calls[0], /q=ENVE%20SES/);
  assert.deepEqual(r.items.map((c) => [c.site, c.image, c.price]), [
    ['ventum.me', 'https://www.ventum.me/cdn/ses45.jpg', 'AED 12999'],
    ['wolfis.ae', 'https://wolfis.ae/img/ses34.jpg', 'AED 9099'],
    ['bikeradar.com', '', '17,499 درهم'],
  ]);
  assert.deepEqual(r.sites.map((s) => s.title), ['ventum.me', 'wolfis.ae', 'bikeradar.com']);
  const txt = CS.cardsText(r.items, 'q');
  assert.match(txt, /^\[عُرضت للمستخدم 3 بطاقات/);
  assert.match(txt, /\n1\. ENVE SES 4\.5 Wheelset \| Ventum Middle East — AED 12999 — ventum\.me\nhttps:\/\/www\.ventum\.me/);
  assert.match(txt, /سؤال متابعة واحد فقط/);
  assert.match(txt, /رشّح الأفضل واحدًا برقمه/);
  const ev = CS.cardsEvent('q', { chips: [' رنقات ألمنيوم ', '', 'ENVE SES 2.3', 'a', 'b', 'c', 'd', 'e'], kind: 'product' }, r.items);
  assert.equal(ev.cards.kind, 'product');
  assert.deepEqual(ev.cards.chips, ['رنقات ألمنيوم', 'ENVE SES 2.3', 'a', 'b', 'c', 'd'], '٦ كحدّ وبلا فراغات');
  assert.deepEqual(Object.keys(ev.cards.items[0]).sort(), ['image', 'price', 'site', 'snippet', 'title', 'url']);
});

test('٢. الوحدة: بلا مفتاح جوجل أو نتائجه فارغة → Tavily بلا صور والسعر من النصّ؛ وبلا شيء → بطاقات فارغة ونصّ «لا نتائج»', async () => {
  const env = { TAVILY_API_KEY: 't' };
  let r = await CS.searchCards('seeds', { env, fetch: async (u) => { assert.match(String(u), /tavily/); return new Response(JSON.stringify({ results: [{ url: 'https://temu.com/seeds', title: 'Tomato seeds 5.40 AED', content: 'c' }] }), { status: 200 }); } });
  assert.deepEqual(r.items.map((c) => [c.site, c.image, c.price]), [['temu.com', '', '5.40 AED']]);
  r = await CS.searchCards('x', { env: { GOOGLE_SEARCH_API_KEY: 'k', GOOGLE_SEARCH_CX: 'c', TAVILY_API_KEY: 't' }, fetch: async (u) => new Response(/customsearch/.test(String(u)) ? '{"items":[]}' : '{"results":[]}', { status: 200 }) });
  assert.deepEqual(r, { items: [], sites: [] });
  assert.match(CS.cardsText([], 'بذور'), /^لا نتائج منظّمة لـ«بذور»/);
  r = await CS.searchCards('x', { env: {}, fetch: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(r, { items: [], sites: [] });
  r = await CS.searchCards('x', { env, fetch: async () => { throw new Error('net'); } });
  assert.deepEqual(r, { items: [], sites: [] }, 'فشل الشبكة = فارغ لا رمية');
});

// ── المعالج الحقيقيّ ──
function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (events) => new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const toolTurn = (name, input) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name, input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } },
]);
const textTurn = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
async function ask(question, turns, google, headers) {
  const log = { model: [], google: [] };
  const saved = global.fetch;
  let turn = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/openrouter\.ai/.test(u)) { log.model.push(JSON.parse(init.body)); const t = turns[Math.min(turn++, turns.length - 1)]; return t(); }
    if (/customsearch/.test(u)) { log.google.push(u); return new Response(JSON.stringify(google || GOOGLE), { status: 200 }); }
    return new Response('{}', { status: 404 });
  };
  let written = '';
  const req = { method: 'POST', headers: headers || {}, body: { messages: [{ role: 'user', content: question }], token: token('sub-user'), provider: 'deepseek' } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saved; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  const second = log.model[1];
  const tr = second && second.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((c) => c && c.type === 'tool_result');
  return { log, events, toolResult: tr ? String(tr.content) : '' };
}

test('٣. المعالج: show_cards ← حدث cards (رقائق وبطاقات) ثمّ sources، والموديل يستلم القائمة المرقّمة وتعليمة السؤال الواحد، والسقف كبحث الويب', async () => {
  quota.calls.length = 0; quota.allow = true;
  const r = await ask('ابغي رنقات انفي سيكل بكم', [() => toolTurn('show_cards', { query: 'ENVE SES wheels price UAE', chips: ['ENVE SES 3.4', 'رنقات كربون أرخص'], kind: 'product' }), () => textTurn('هذي الخيارات. كم ميزانيتك؟')]);
  assert.equal(r.log.model.length, 2);
  assert.ok(r.log.model[0].tools.some((t) => t.name === 'show_cards'), 'المشترك عنده الأداة');
  assert.ok(r.log.model[0].tools.some((t) => t.name === 'web_search'), 'وبحث الويب باقٍ');
  const sys = JSON.stringify(r.log.model[0].system || '');
  assert.match(sys, /\[البطاقات\]: حين يطلب المستخدم شيئًا عامًّا/);
  assert.match(sys, /سؤال متابعة واحد فقط/);
  assert.match(sys, /⭐ الأفضل لك/);
  assert.match(sys, /نفس المطلوب في نفس المكان/);
  assert.match(read('api/_lib/cards-search.js'), /لا توسّع لصنف آخر/);
  assert.doesNotMatch(read('api/_lib/cards-search.js'), /سيكل|سيارة/, 'القاعدة بلا أسماء أصناف');
  assert.equal(r.log.google.length, 1);
  const st = r.events.find((e) => e.k === 'stCards'); assert.ok(st && /🛍️/.test(st.status), 'سطر الحالة بمفتاحه');
  const cards = r.events.find((e) => e.cards);
  assert.ok(cards, 'حدث البطاقات');
  assert.deepEqual(cards.cards.chips, ['ENVE SES 3.4', 'رنقات كربون أرخص']);
  assert.equal(cards.cards.kind, 'product');
  // v-google-cards (مواصفات المالك ١٨ أكتوبر «كلّ بطاقة لازم فيها صورة… وإذا ما لقيت صورة أبداً لا تعرض البطاقة»): bikeradar بلا صورة في
  // pagemap وصفحتها لا تعطي og:image (٤٠٤ هنا) فتسقط — كانت تظهر بأيقونة الموقع
  assert.equal(cards.cards.items.length, 2);
  assert.ok(!cards.cards.items.some((c) => c.site === 'bikeradar.com'), 'بلا صورة = لا بطاقة');
  assert.ok(cards.cards.items.every((c) => /^https:\/\//.test(c.image)), 'كلّ بطاقة بصورة');
  assert.equal(cards.cards.items[0].image, 'https://www.ventum.me/cdn/ses45.jpg');
  assert.equal(cards.cards.items[0].price, 'AED 12999');
  const src = r.events.find((e) => Array.isArray(e.sources));
  assert.deepEqual(src.sources.map((s) => s.title), ['ventum.me', 'wolfis.ae'], 'المواقع حدث المصادر القائم');
  assert.ok(r.events.indexOf(cards) < r.events.indexOf(src), 'البطاقات قبل المواقع');
  assert.match(r.toolResult, /^\[عُرضت للمستخدم 2 بطاقات/);
  assert.match(r.toolResult, /\n2\. ENVE SES 3\.4/);
  const trail = r.events.find((e) => e.k === 'trCards'); assert.ok(trail && trail.p.n === 2 && /ENVE SES wheels/.test(trail.p.q), 'سطر الأثر بعدد البطاقات');
  assert.equal(trail.cmd, 'ENVE SES wheels price UAE', 'تفصيل الأثر يحمل عبارة البحث');
  assert.deepEqual(quota.calls, [{ bucket: 'chat-search', limit: 100 }], 'يُعدّ على حصّة البحث نفسها');
  assert.ok(r.events.some((e) => e.delta === 'هذي الخيارات. كم ميزانيتك؟'));
});

test('٤. المعالج: بلا نتائج = لا حدث cards ولا sources ونصّ صادق للموديل؛ ونفاد الحصّة = نصّها بلا نداء جوجل', async () => {
  quota.calls.length = 0; quota.allow = true;
  let r = await ask('أبغى X', [() => toolTurn('show_cards', { query: 'zzz' }), () => textTurn('تم')], { items: [] });
  assert.ok(!r.events.some((e) => e.cards) && !r.events.some((e) => e.sources), 'لا أحداث فارغة');
  assert.match(r.toolResult, /^لا نتائج منظّمة لـ«zzz»/);
  assert.ok(r.events.some((e) => e.k === 'trCardsNone'));
  quota.calls.length = 0; quota.allow = false;
  r = await ask('أبغى X', [() => toolTurn('show_cards', { query: 'zzz' }), () => textTurn('تم')]);
  assert.equal(r.log.google.length, 0, 'لا نداء بعد الحصّة');
  assert.ok(!r.events.some((e) => e.cards));
  assert.equal(r.toolResult, require(rp('api/_lib/live-social.js')).QUOTA_TEXT);
});

test('٥. العميل: callChatWithTools يرجع cards من البثّ، والواجهة ترسم البطاقات والرقائق من الرسالة المحفوظة', () => {
  const a18 = read('js/app-18-chat-tools.js');
  assert.ok(a18.includes("if (ev.cards && typeof ev.cards === 'object') __cards = ev.cards;"), 'التقاط حدث cards');
  assert.ok(a18.includes('cards: __cards || undefined'), 'يرجع للمُرسِل');
  const a09 = read('js/app-09-attach.js');
  /* v-audit-chatcli (cli-chat-rest-4): البطاقات في متغيّر الطلب لا window.__chatCardsResult العامّ (المحادثات المتوازية) — وبلا سطر جديد في __sendPromptCore (السقّاطة) */
  assert.ok(a09.includes('let __ctLog = null, __ctCards = null;') && a09.includes('__ctCards = __ct.cards || null;'), 'يُمرَّر في متغيّر الطلب');
  assert.ok(a09.includes('cards: __ctCards || undefined'), 'يُحفظ في رسالة طلبه');
  const a04 = read('js/app-04-i18n-state.js');
  assert.ok(a04.includes("if (m.cards && typeof window.omranRenderCards === 'function')"), 'renderMessages يرسم البطاقات');
  const part = read('js/app-37-cards.js');
  assert.ok(part.includes('window.omranRenderCards = function'), 'المكوّن في جزئه');
  assert.ok(part.includes("'omranCardsCss'") && part.includes('.omCards{') && part.includes('grid'), 'شبكة عموديّة لا ماسح أفقيّ (فخّ هواوي v-shelf-nocomposite)');
  assert.ok(!/overflow-x\s*:\s*auto/.test(part), 'لا overflow-x:auto');
  assert.ok(part.includes("tt('cardsOpen', 'افتح')"), 'زرّ الفتح مترجَم (بمفتاحه واحتياط عربيّ)');
  // ١٤ لغة: الحالة والأثر والزرّ
  const keys = ['stCards', 'trCards', 'trCardsNone', 'cardsOpen'];
  const i18n = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.ok(new RegExp('(^|[\\s{,])' + k + ':').test(i18n) && (i18n.match(new RegExp('(^|[\\s{,])' + k + ':', 'g')) || []).length >= 2, k + ' في ar وen');
  for (const lg of ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml']) {
    const f = read('i18n/' + lg + '.js');
    for (const k of keys) assert.ok(f.includes('"' + k + '"'), k + ' في ' + lg);
  }
  const v = /i18n\/' \+ lg \+ '\.js\?v=(\d+)'/.exec(a04);
  assert.ok(v && Number(v[1]) >= 741, 'وسم ملفّات اللغات رُفع');
});

test('٦. المكان من كلام المستخدم يغلب الشبكة: أمريكا تُبحث في أمريكا، وبطاقة أو رقاقة من بلد آخر أو خارج المطلوب تُستبعد', async () => {
  assert.equal(CS.placeOf('كندوه في أمريكا', 'kandura UAE', 'AE'), 'US', 'البلد المسمّى يغلب الشبكة وعبارة الموديل');
  assert.equal(CS.placeOf('كندوه في الإمارات', 'kandura', 'US'), 'AE');
  assert.match(CS.pinQuery('kandura', { ask: 'كندوه في أمريكا', country: 'AE' }), /United States/);
  assert.equal(CS.pinQuery('ENVE SES wheels price UAE', {}), 'ENVE SES wheels price UAE', 'مكان العبارة يكفي فلا يُزاد');
  const kept = CS.keepOnRequest([
    { title: 'White Kandura', url: 'https://shop.example.us/k', snippet: 'New York mens kandura', site: 'shop.example.us' },
    { title: 'Kandura Dubai', url: 'https://store.ae/k', snippet: 'ثوب في دبي', site: 'store.ae' },
    { title: 'Evening gown sale', url: 'https://shop.example.com/g', snippet: 'party dress', site: 'shop.example.com' },
  ], 'kandura United States', 'US');
  assert.deepEqual(kept.map((c) => c.site), ['shop.example.us'], 'يبقى المطلوب في مكانه فقط');
  assert.deepEqual(CS.scopeChips(['أبيض', 'كندوه في الإمارات', 'مقاس كبير'], 'US'), ['أبيض', 'مقاس كبير']);
  quota.calls.length = 0; quota.allow = true;
  const mixed = { items: [
    { title: 'White Kandura USA', link: 'https://shop.example.us/k', snippet: 'New York mens kandura $90', pagemap: { cse_image: [{ src: 'https://shop.example.us/k.jpg' }] } }, // v-google-cards: بطاقة بلا صورة تسقط
    { title: 'Kandura Dubai', link: 'https://store.ae/k', snippet: 'ثوب في دبي AED 200', pagemap: { cse_image: [{ src: 'https://store.ae/k.jpg' }] } },
  ] };
  const r = await ask('كندوه رجالي في أمريكا', [() => toolTurn('show_cards', { query: 'kandura UAE', chips: ['أبيض', 'كندوه في الإمارات'], kind: 'product' }), () => textTurn('كم ميزانيتك؟')], mixed, { 'x-vercel-ip-country': 'AE' });
  assert.match(r.log.google[0], /gl=us/);
  assert.match(r.log.google[0], /cr=countryUS/);
  assert.match(r.log.google[0], /United%20States/);
  const cards = r.events.find((e) => e.cards);
  assert.deepEqual(cards.cards.items.map((c) => c.site), ['shop.example.us']);
  assert.deepEqual(cards.cards.chips, ['أبيض'], 'رقاقة البلد الآخر سقطت');
});
