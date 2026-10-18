// tests/reply-blocks.test.cjs — v-reply-blocks (لقطات المالك ١٧ أكتوبر، ChatGPT: «أرقام مكاتب عقاريّة في الشارقة» بطاقات بالاسم
// والرقم الكبير والمنطقة و«نسخ الرقم»، وجدول بائعين بشارة المصدر جنب كلّ رقم، و«عقارات للبيع» صفوف بصورة بجانب الوصف، و«عطني أرقام
// السيارات للبيع» يسمّي المعنيين ثمّ يجيب): (١) الخادم — طلب أرقام التواصل لا يذهب لمواقع اللوحات ولا للخرائط، ورقم بلا مصدر يُحذف،
// والصيغ في النظام. (٢) الواجهة — سطر [[CONTACT]] بطاقة بالرقم معزولًا LTR وزرّ نسخه وشارة المصدر، ورابط الجدول شارة، وأرقام الخليّة
// معزولة، والسطر الناقص لا يظهر خامًا أثناء البثّ. (٣) بطاقات kind=listing صفوف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'reply-blocks-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.GOOGLE_SEARCH_API_KEY = 'g-key';
process.env.GOOGLE_SEARCH_CX = 'g-cx';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'GOOGLE_PLACES_API_KEY', 'TAVILY_API_KEY']) delete process.env[k];

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
const places = { calls: 0 };
const realSearch = require(rp('api/_lib/search.js'));
stub('api/_lib/search.js', { fetchPlaces: async () => { places.calls++; return []; }, isPlacesAsk: () => true, regionOf: realSearch.regionOf, hasRegion: realSearch.hasRegion });
const RS = require(rp('api/_lib/reply-style.js'));
const CS = require(rp('api/_lib/cards-search.js'));
const chat = require(rp('api/_lib/chat.js'));

test('١. isContactAsk: أرقام التواصل مع جهة نعم، والأرقام المميّزة واللوحات للبيع لا', () => {
  for (const s of ['أرقام تواصل مع معارض السيارات في دبي', 'ارقام هواتف معارض السيارات', 'أرقام مكاتب عقارية في الشارقة', 'ابي ارقام مكاتب تأجير سيارات في عجمان',
    'رقم التواصل مع الشركة', 'رقم اتصال الشركة', 'عطني رقم مطعم بيت المندي', 'ابي اتواصل مع وكيل نيسان', 'تلفون مكتب عقارات', 'contact numbers for car dealers in Dubai', 'whatsapp number of the clinic', 'عطني ارقام هواتفهم', 'أرقام مكاتبهم', 'أرقام للمكاتب العقارية', 'أرقام تواصلهم']) assert.equal(RS.isContactAsk(s), true, s);
  for (const s of ['اريد ارقام للبيع', 'ابي ارقام', 'ارقام سيارات للبيع دبي', 'أرقام هواتف مميزة للبيع', 'رقم جوال مميز', 'كم رقم الطوارئ', 'ارقام الصفحة', 'أبغى رقم دبي 7777', 'أرقام اتصالات مميزة للبيع', 'ارقام محلية مميزة', 'أرقام محلّية مميزة', 'رقم محلي', '', 'هلا']) assert.equal(RS.isContactAsk(s), false, s);
});

test('٢. keepSourcedContacts: الرقم الذي ظهر في نتائج الأدوات يبقى (+971 والصفر المحلّيّ والأرقام الهنديّة سواء)، وغيره سطر بالاسم بلا رقم', () => {
  const corpus = 'Afaq Used Cars — Tel: +971 4 123 4567. Alba Cars ٠٥٠١٢٣٤٥٦٧ … toll free 800 4774';
  const text = 'هذي أرقام المعارض:\n[[CONTACT: Afaq Used Cars | 04 123 4567 | القوز | [Find Glocal](https://findglocal.com/afaq)]]\n'
    + '[[CONTACT: Alba Cars | 050 123 4567 | | https://albacars.ae]]\n[[CONTACT: Fake Motors | 050 999 8888 | ديرة | [x](https://x.com)]]\n'
    + '[[CONTACT: Toll | 800 4774]]\n[[CONTACT: Short | 47]]\n```\n[[CONTACT: Code | 1]]\n```\nتبغى معرضًا معيّنًا؟';
  const out = RS.keepSourcedContacts(text, corpus).split('\n');
  assert.equal(out[1], '[[CONTACT: Afaq Used Cars | 04 123 4567 | القوز | [Find Glocal](https://findglocal.com/afaq)]]');
  assert.equal(out[2], '[[CONTACT: Alba Cars | 050 123 4567 | | https://albacars.ae]]');
  assert.equal(out[3], '• **Fake Motors** — ديرة', 'رقم لم يظهر في النتائج لا يُكتب');
  assert.equal(out[4], '[[CONTACT: Toll | 800 4774]]');
  assert.equal(out[5], '• **Short**');
  assert.equal(out[7], '[[CONTACT: Code | 1]]', 'داخل ``` كما هو');
  assert.equal(RS.keepSourcedContacts('بلا بطاقات', ''), 'بلا بطاقات');
  assert.equal(RS.keepSourcedContacts('[[CONTACT: B | 04 555 4321 / 800 2384 | المجاز]]', 'Tel: 04 555 4321 / 800 2384'), '[[CONTACT: B | 04 555 4321 / 800 2384 | المجاز]]', 'رقمان كلاهما في المصدر');
  assert.equal(RS.keepSourcedContacts('[[CONTACT: B | 04 555 4321 / 050 000 1111 | المجاز]]', 'Tel: 04 555 4321'), '[[CONTACT: B | 04 555 4321 | المجاز]]', 'المخترع منهما يسقط ويبقى الآخر');
  assert.equal(RS.keepSourcedContacts('[[CONTACT: A | 04 123 4567]]', ''), '• **A**', 'بلا بحث = بلا رقم');
  const convo = RS.textOfMessages([{ role: 'assistant', content: '[[CONTACT: A | 04 123 4567]]' }, { role: 'user', content: [{ type: 'text', text: 'وهذا رقمي 050 222 3333' }, { type: 'image' }] }]);
  assert.equal(RS.keepSourcedContacts('[[CONTACT: A | 04 123 4567]]', '' + ' ' + convo), '[[CONTACT: A | 04 123 4567]]', 'رقم ظهر في المحادثة السابقة يبقى في ردّ المتابعة');
  assert.equal(RS.keepSourcedContacts('[[CONTACT: B | 050 222 3333]]', convo), '[[CONTACT: B | 050 222 3333]]', 'ورقم كتبه المستخدم');
});

test('٣. أسلاك الخادم: الصيغ في آخر [البحث]، وطلب التواصل يخرج من مسار اللوحات والخرائط، والتصحيح الختاميّ يحذف الرقم بلا مصدر', () => {
  const src = read('api/_lib/chat.js');
  assert.ok(src.includes("لا تقل «لا أقدر أعرض صورًا أو أسعارًا».' + require('./reply-style.js').REPLY_BLOCKS_NOTE"), 'في آخر SEARCH_RULE_NOTE نفسه');
  assert.ok(src.includes("async function tavilySearch(query, reC, plateAsk, country, city, win, where, contact) {"), 'tavilySearch');
  assert.ok(src.includes("const foreign = isForeignAsk(query), contactAsk = !!contact || require('./reply-style.js').isContactAsk(query);"), 'tavilySearch');
  assert.ok(src.includes("const __ctAsk = !foreignTurn && !!lastUser && require('./reply-style.js').isContactAsk(lastUserText);"), 'طلب المستخدم نفسه يوجّه البحث');
  assert.ok(src.includes('|| WHERE_ASK_RE.test(__sq), __ctAsk),\n'), 'وسيط tavilySearch الثامن');
  assert.ok(src.includes('const __curated = !__ctAsk && isCuratedSearch(__sq, reC, __plateAsk) ||'), 'ولا دمج القائمة المنسّقة');
  assert.ok(src.includes(".replace(/\\[([^\\[\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g, (full, txt, url) => ok(url) ? full : txt)"), 'منقّي الروابط لا يبدأ من [[CONTACT');
  assert.ok(src.includes('if (!foreign && !contactAsk && (plateAsk || NUM_ASK_RE.test(query))) {'), 'لا لوحات');
  assert.ok(src.includes('const rc = (foreign || contactAsk) ? null :'), 'لا عقار منسّق');
  assert.ok(src.includes('if (HOTEL_ASK_RE.test(query) && !contactAsk) return hotelAnswer(query);'), 'لا فنادق منسّقة');
  assert.ok(src.includes('|| contactAsk) ? [] :'), 'لا خرائط');
  assert.ok(src.includes("const foreign = isForeignAsk(query); if (require('./reply-style.js').isContactAsk(query)) return false;"), 'isCuratedSearch');
  assert.ok(src.includes('const __plateAsk = !foreignTurn && !!(lastUser && NUM_ASK_RE.test(lastUserText)) && !__ctAsk;'));
  assert.ok(src.includes("if (!text) return text; text = require('./reply-style.js').keepSourcedContacts(text, corpus + ' ' + require('./reply-style.js').textOfMessages(messages));"), 'داخل stripMemoryUrls (التصحيح الختاميّ) ومعه المحادثة السابقة');
  for (const k of ['[أرقام التواصل]', '[[CONTACT: الاسم | الرقم | المنطقة | [اسم الموقع](رابط المصدر)]]', '[المصدر جنب كلّ صفّ]', 'kind="listing"', '[المعنيان]', '[[OPT]]المعنى الآخر']) assert.ok(RS.REPLY_BLOCKS_NOTE.includes(k), k);
  assert.ok(CS.TOOL.input_schema.properties.kind.enum.includes('listing'));
  assert.equal(CS.cardsEvent('q', { kind: 'listing' }, []).cards.kind, 'listing');
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
const GOOGLE = { items: [
  { title: 'Afaq Used Cars — Al Quoz, Dubai', link: 'https://www.findglocal.com/ae/dubai/afaq-used-cars', snippet: 'Used car showroom in Al Quoz. Call +971 4 123 4567 for prices and availability.' },
  { title: 'Alba Cars Dubai', link: 'https://albacars.ae/contact', snippet: 'Alba Cars showroom, Al Awir. Phone: 050 765 4321.' },
] };
async function ask(question, turns, history) {
  const log = { model: [], google: [] };
  const saved = global.fetch;
  let turn = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/openrouter\.ai/.test(u)) { log.model.push(JSON.parse(init.body)); const t = turns[Math.min(turn++, turns.length - 1)]; return t(); }
    if (/customsearch/.test(u)) { log.google.push(u); return new Response(JSON.stringify(GOOGLE), { status: 200 }); }
    return new Response('{}', { status: 404 });
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: { messages: (history || []).concat([{ role: 'user', content: question }]), token: token('sub-user'), provider: 'deepseek' } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saved; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  const second = log.model[1];
  const tr = second && second.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((c) => c && c.type === 'tool_result');
  return { log, events, toolResult: tr ? String(tr.content) : '' };
}

test('٤. المعالج: «ارقام هواتف معارض السيارات في دبي» يبحث فعلًا (لا مواقع اللوحات السبعة ولا الخرائط)، والرقم المخترع يُحذف في التصحيح الختاميّ', async () => {
  places.calls = 0;
  const reply = 'هذي أرقام معارض مستعمل في دبي:\n'
    + '[[CONTACT: Afaq Used Cars | 04 123 4567 | القوز | [Find Glocal](https://www.findglocal.com/ae/dubai/afaq-used-cars)]]\n'
    + '[[CONTACT: Alba Cars | 050 765 4321 | العوير | [Alba Cars](https://albacars.ae/contact)]]\n'
    + '[[CONTACT: Fake Motors | 050 999 8888 | ديرة | [Fake](https://fake-motors.ae)]]\n'
    + 'تبغى معرضًا معيّنًا؟';
  const r = await ask('ارقام هواتف معارض السيارات في دبي', [() => toolTurn('web_search', { query: 'ارقام هواتف معارض السيارات المستعملة دبي' }), () => textTurn(reply)]);
  assert.equal(r.log.model.length, 2);
  const sys = JSON.stringify(r.log.model[0].system || '');
  assert.ok(sys.includes('[أرقام التواصل]') && sys.includes('[المعنيان]'), 'الصيغ في نظام دور الأدوات');
  assert.ok(!/إكس بليت|xplate\.com/.test(r.toolResult), 'لا مواقع اللوحات: ' + r.toolResult.slice(0, 200));
  assert.match(r.toolResult, /\+971 4 123 4567/, 'نتائج البحث الحقيقيّة وصلت المزوّد');
  assert.equal(places.calls, 0, 'الخرائط أسماء بلا أرقام — لا تُسأل');
  const patch = r.events.filter((e) => typeof e.patch === 'string').pop();
  assert.ok(patch, 'تصحيح ختاميّ');
  assert.ok(patch.patch.includes('[[CONTACT: Afaq Used Cars | 04 123 4567 | القوز | [Find Glocal](https://www.findglocal.com/ae/dubai/afaq-used-cars)]]'));
  assert.ok(patch.patch.includes('[[CONTACT: Alba Cars | 050 765 4321 | العوير | [Alba Cars](https://albacars.ae/contact)]]'));
  assert.ok(patch.patch.includes('• **Fake Motors** — ديرة'));
  assert.ok(!patch.patch.includes('999 8888') && !patch.patch.includes('fake-motors'), 'لا رقم ولا رابط مخترع');
});

test('٥. المعالج: «ارقام سيارات للبيع دبي» يبقى على مسار اللوحات و«عقار للبيع» على قائمة العقار كما كانا؛ و«أرقام مكاتب عقاريّة» بحث حيّ', async () => {
  let r = await ask('ارقام سيارات للبيع دبي', [() => toolTurn('web_search', { query: 'ارقام سيارات للبيع دبي' }), () => textTurn('هذي مواقع اللوحات.')]);
  assert.match(r.toolResult, /إكس بليت/);
  r = await ask('شقق للبيع في الشارقة', [() => toolTurn('web_search', { query: 'شقق للبيع في الشارقة' }), () => textTurn('هذي مواقع العقار.')]);
  assert.match(r.toolResult, /بايوت — /, 'قائمة العقار المنسّقة كما هي');
  r = await ask('أرقام مكاتب عقارية في الشارقة', [() => toolTurn('web_search', { query: 'مكاتب عقارية الشارقة' }), () => textTurn('هذي أرقامهم.')]);
  assert.ok(!/بايوت — /.test(r.toolResult), 'لا قائمة العقار: ' + r.toolResult.slice(0, 160));
  assert.match(r.toolResult, /\+971 4 123 4567/, 'بحث حيّ بأرقامه — ولو بحث المزوّد بلا كلمة «أرقام»، فالطلب طلب المستخدم');
});

test('٥ب. ردّ متابعة بلا بحث يعيد رقمًا من ردّ سابق: يبقى (ليس مخترعًا)، والجديد بلا مصدر يُحذف', async () => {
  const prev = '[[CONTACT: Afaq Used Cars | 04 123 4567 | القوز | [Find Glocal](https://www.findglocal.com/ae/afaq)]]';
  const r = await ask('عطني رقم آفاق بس', [() => textTurn('هذا رقمهم:\n' + prev + '\n[[CONTACT: New Motors | 050 444 5555 | ديرة]]')], [{ role: 'user', content: 'أرقام معارض دبي' }, { role: 'assistant', content: 'هذي:\n' + prev }]);
  const patch = r.events.filter((e) => typeof e.patch === 'string').pop();
  assert.ok(patch, 'تصحيح للرقم الجديد');
  assert.ok(patch.patch.includes('[[CONTACT: Afaq Used Cars | 04 123 4567 | القوز | Find Glocal]]'), 'الرقم السابق باقٍ، ورابط مصدره (ليس في نتائج هذا الدور) اسمٌ بلا رابط والسطر سليم: ' + patch.patch);
  assert.ok(patch.patch.includes('• **New Motors** — ديرة') && !patch.patch.includes('444 5555'));
});

// ── الواجهة ──
class Txt { constructor(t){ this.nodeType = 3; this.textContent = t; this.parentNode = null; this.className = ''; } }
class El {
  constructor(tag){ this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.className = ''; this.style = {}; this._attrs = {}; this._ev = {};
    this.classList = { add: (c) => { this.className = (this.className + ' ' + c).trim(); }, remove: (c) => { this.className = this.className.split(' ').filter((x) => x !== c).join(' '); }, toggle(){}, contains: (c) => this.className.split(' ').includes(c) }; }
  appendChild(n){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  insertBefore(n, ref){ if(n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; const i = this.childNodes.indexOf(ref); if(i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); return n; }
  removeChild(n){ const i = this.childNodes.indexOf(n); if(i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  get textContent(){ return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v){ this.childNodes = []; if(v !== '' && v != null) this.appendChild(new Txt(String(v))); }
  set innerHTML(v){ this.childNodes = []; }
  get innerHTML(){ return this.textContent; }
  setAttribute(k, v){ this._attrs[k] = v; } getAttribute(k){ return this._attrs[k]; }
  querySelectorAll(){ return []; } addEventListener(k, f){ this._ev[k] = f; }
}
const all = (n, f, out = []) => { (n.childNodes || []).forEach((c) => { if (f(c)) out.push(c); all(c, f, out); }); return out; };
const shown = (n) => (n.style && n.style.display === 'none') ? '' : (n.nodeType === 3 ? n.textContent : n.childNodes.map(shown).join(''));
function ctxBase(extra){
  const head = new El('head');
  const document = { createElement: (t) => new El(t), createTextNode: (t) => new Txt(t), getElementById: (id) => all(head, (n) => n.id === id)[0] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener(){}, documentElement: new El('html'), head, body: new El('body'), execCommand: () => true };
  const ctx = Object.assign({ document, navigator: { userAgent: 'node' }, localStorage: { getItem: () => null, setItem(){} }, sessionStorage: { getItem: () => null, setItem(){} },
    $: () => null, __swallow(){}, console, setTimeout, clearTimeout, setInterval, clearInterval, Audio: function(){}, fetch: () => Promise.reject(new Error('x')), t: (k) => k, lang: 'ar',
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: clearTimeout, URL }, extra || {});
  ctx.window = ctx;
  return ctx;
}
function loadApp02(extra){
  const ctx = ctxBase(extra);
  vm.runInNewContext(read('js/app-02-tts.js') + '\n;this.__b = buildSpokenWordSpans; this.__st = renderStreamingAssistant; this.__sp = omranSpeechNoImg; this.__part = omranImgPartial;', ctx);
  return ctx;
}
const CT1 = '[[CONTACT: Sunrise Real Estate | 058 579 3232 | المجاز 2 | [بيوت](https://www.bayut.com/companies/sunrise)]]';
const CT2 = '[[CONTACT: Vision X Nexus | +971 58 583 3846 | المجاز 1 | https://visionx.ae/contact]]';
const CT3 = '[[CONTACT: الفزعة للعقارات | ٠٥٥ ٥٠٠ ٩٩٩٠ | اليرموك]]';
const TABLE = '| المعرض | الرقم | المصدر |\n|---|---|---|\n| Afaq Used Cars | 050 171 7465 | [Find Glocal](https://findglocal.com/afaq) |\n| Alba Cars | 04 377 2503 | **[Alba Cars](https://albacars.ae)** |\n| الدوام 9:00 - 17:00 | 1,000 - 2,000 درهم | +971 4 123 4567 |';
const REPLY = 'هذه أرقام مكاتب عقارية في الشارقة:\n\n' + CT1 + '\n' + CT2 + '\n\n' + CT3 + '\n\nوهذا جدول المعارض:\n\n' + TABLE + '\n\nتبغى منطقة معيّنة؟';

test('٦. الواجهة: أسطر [[CONTACT]] المتتالية شبكة بطاقات واحدة — الاسم، الرقم LTR معزول، المنطقة، زرّ النسخ، شارة المصدر بأيقونته — وكلماتها مخفيّة بعددها ولا تُنطق', () => {
  const c = loadApp02();
  const box = new El('div');
  c.__b(box, REPLY);
  const blocks = box.childNodes.filter((n) => n.className === 'md-contacts');
  assert.equal(blocks.length, 1, 'كتلة واحدة ولو بينها سطر فارغ، وخارج md-line');
  const cards = blocks[0].childNodes.filter((n) => n.className === 'md-ct');
  assert.deepEqual(cards.map((k) => all(k, (n) => n.className === 'md-ct-name')[0].textContent), ['Sunrise Real Estate', 'Vision X Nexus', 'الفزعة للعقارات']);
  const nums = cards.map((k) => all(k, (n) => n.tagName === 'BDI')[0]);
  assert.deepEqual(nums.map((b) => [b.textContent, b._attrs.dir]), [['058 579 3232', 'ltr'], ['+971 58 583 3846', 'ltr'], ['٠٥٥ ٥٠٠ ٩٩٩٠', 'ltr']]);
  assert.deepEqual(cards.map((k) => (all(k, (n) => n.className === 'md-ct-area')[0] || {}).textContent), ['المجاز 2', 'المجاز 1', 'اليرموك']);
  const chip = all(cards[0], (n) => n.className === 'md-src')[0];
  assert.equal(chip.tagName, 'A'); assert.equal(chip.href, 'https://www.bayut.com/companies/sunrise'); assert.equal(chip.textContent, 'بيوت');
  assert.equal(chip.target, '_blank');
  assert.match(all(chip, (n) => n.tagName === 'IMG')[0].src, /favicons\?sz=64&domain=bayut\.com$/);
  assert.equal(all(cards[1], (n) => n.className === 'md-src')[0].textContent, 'visionx.ae', 'رابط بلا اسم = النطاق');
  assert.equal(all(cards[2], (n) => n.className === 'md-src').length, 0, 'بلا مصدر = بلا شارة');
  assert.ok(cards.every((k) => all(k, (n) => n.tagName === 'BUTTON' && n.className === 'md-ct-copy' && n.textContent === 'copyCode').length === 1), 'زرّ النسخ في كلّ بطاقة');
  const hidden = blocks[0].childNodes.filter((n) => n.className === 'tts-word' && n.style.display === 'none').length;
  assert.equal(hidden, [CT1, CT2, CT3].join(' ').match(/\S+/g).length, 'كلمات الأسطر الثلاثة مخفيّة بعددها');
  assert.ok(!/CONTACT|\[\[|\]\]/.test(shown(box)), 'لا صيغة خامّة ظاهرة');
  const box2 = new El('div');
  c.__b(box2, '[[CONTACT: Better Homes | +971 6 555 4321 / 800 2384 | المجاز]]');
  assert.deepEqual(all(box2, (n) => n.tagName === 'BDI').map((b) => b.textContent), ['+971 6 555 4321', '800 2384'], 'كلّ رقم وحده فيلتفّان ولا يخرجان من البطاقة');
  const css = all(c.document.head, (n) => n.id === 'omranBlocksCss')[0].textContent;
  assert.ok(css.includes('html body .msg .md-table a.md-src.md-src,.md-table .md-src{max-width:8.5em;'), 'سقف شارة الجدول يغلب قاعدة الشارة العامّة (0,3,3)');
  assert.ok(css.includes('.md-ct-num{display:flex;flex-wrap:wrap;'));
  const sp = c.__sp(REPLY);
  assert.equal(sp.match(/\S+/g).length, REPLY.match(/\S+/g).length, 'القراءة الصوتيّة بعدد الكلمات نفسه');
  assert.ok(!/CONTACT|Sunrise|bayut/.test(sp), 'ولا تنطق الصيغة');
});

test('٧. الواجهة: زرّ النسخ ينسخ الرقم كما هو ويُظهر «تمّ النسخ»؛ وبلا clipboard يرجع لطريقة textarea', async () => {
  const copied = [], toasts = [];
  const c = loadApp02({ navigator: { userAgent: 'node', clipboard: { writeText: async (v) => { copied.push(v); } } }, settingsToast: (m) => toasts.push(m) });
  const box = new El('div');
  c.__b(box, CT1);
  const btn = all(box, (n) => n.className === 'md-ct-copy')[0];
  btn.onclick({ stopPropagation(){} });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(copied, ['058 579 3232']);
  assert.deepEqual(toasts, ['copiedToast']);
  const c2 = loadApp02({ settingsToast: (m) => toasts.push(m) });
  const box2 = new El('div');
  c2.__b(box2, CT1);
  all(box2, (n) => n.className === 'md-ct-copy')[0].onclick({ stopPropagation(){} });
  assert.equal(toasts.length, 2, 'execCommand احتياطًا');
});

test('٨. الواجهة: رابط خليّة الجدول شارة مصدر (ولو **[…](…)**) بنصّها نفسه، ورقم الهاتف في الخليّة معزول LTR', () => {
  const c = loadApp02();
  const box = new El('div');
  c.__b(box, REPLY);
  const table = all(box, (n) => n.tagName === 'TABLE')[0];
  const chips = all(table, (n) => n.tagName === 'A');
  assert.deepEqual(chips.map((a) => [a.className, a.href, a.textContent]), [['md-src', 'https://findglocal.com/afaq', 'Find Glocal'], ['md-src', 'https://albacars.ae', 'Alba Cars']]);
  assert.ok(chips.every((a) => all(a, (n) => n.tagName === 'IMG').length === 1), 'أيقونة الموقع');
  const ltr = all(table, (n) => n.className === 'md-ltr');
  assert.deepEqual(ltr.map((s) => [s.textContent, s._attrs.dir]), [['050 171 7465', 'ltr'], ['04 377 2503', 'ltr'], ['+971 4 123 4567', 'ltr']], 'الوقت والسعر بفواصل نصّ كما هو');
  assert.ok(!/\*\*|\|/.test(shown(table)), 'لا ** ولا | ظاهرة');
});

test('٩. البثّ: سطر [[CONTACT ناقص لا يظهر خامًا (ولا «[CONTACT» بعد قصّ القوس)، وبعد اكتماله بطاقة', () => {
  const c = loadApp02();
  for (const p of ['[[CONTACT:', '[[C', '[[CONTACT: Afaq | 04 12', '[[CONTACT: Afaq | 04 123 4567 | القوز | [Find](https://findglocal.com/x)']) assert.equal(c.__part(p), true, p);
  assert.equal(c.__part(CT1), false);
  const el = new El('div');
  c.__st(el, 'هذه الأرقام:\n[[CONTACT: Afaq Used Cars | 04 12');
  assert.ok(!/CONTACT|\[/.test(shown(el)), 'ظاهر: ' + shown(el));
  assert.match(shown(el), /هذه الأرقام:/);
  const el2 = new El('div');
  c.__st(el2, 'هذه الأرقام:\n' + CT1);
  assert.equal(all(el2, (n) => n.className === 'md-contacts').length, 1);
  const el3 = new El('div');
  c.__st(el3, 'صور:\n[[IMG: برج خ');
  assert.ok(!/IMG|\[/.test(shown(el3)), 'وسطر الصور كذلك: ' + shown(el3));
});

function loadApp37(){
  const chipCalls = [];
  const ctx = ctxBase({ omranSrcChip: (url, label) => { chipCalls.push([url, label]); const s = new El('a'); s.className = 'md-src'; s.textContent = label; return s; }, omranSendOption(){} });
  vm.runInNewContext(read('js/app-37-cards.js'), ctx);
  return { ctx, chipCalls };
}
const ITEMS = [
  { title: 'Studio for sale in Al Zahia', url: 'https://www.bayut.com/property/1', site: 'bayut.com', image: 'https://images.bayut.com/1.jpg', price: 'AED 480,000', snippet: 'Furnished studio in Uptown Al Zahia, ready to move.' },
  { title: 'Villas for sale in Sharjah', url: 'https://www.propertyfinder.ae/en/buy/sharjah/villas', site: 'propertyfinder.ae', image: 'https://static.propertyfinder.ae/v.jpg', price: '', snippet: '' },
  { title: 'http only', url: 'http://plain.example/x', site: 'plain.example', image: 'https://plain.example/x.jpg', price: '', snippet: '' },
  { title: 'no image', url: 'https://noimg.example.ae/x', site: 'noimg.example.ae', image: '', price: 'AED 1', snippet: '' }, // v-google-cards: بلا صورة لا صفّ
];

test('١٠. بطاقات kind=listing صفوف: صورة (أو أيقونة الموقع) بجانب العنوان والوصف والسعر، ثمّ «افتح ↗» وشارة الموقع؛ والمنتجات كما كانت', () => {
  const { ctx, chipCalls } = loadApp37();
  const w = ctx.window.omranRenderCards({ kind: 'listing', chips: ['شقق', 'فلل'], items: ITEMS });
  const grid = w.childNodes.find((n) => /omCards/.test(n.className));
  assert.equal(grid.className, 'omCards omList');
  const rows = grid.childNodes;
  assert.equal(rows.length, 2, 'رابط http يسقط كما في البطاقات');
  assert.equal(rows[0].className, 'omRow');
  const img0 = all(rows[0], (n) => n.tagName === 'IMG')[0];
  assert.equal(img0.src, 'https://images.bayut.com/1.jpg');
  assert.equal(all(rows[0], (n) => n.className === 'omRowTitle')[0].textContent, 'Studio for sale in Al Zahia');
  assert.equal(all(rows[0], (n) => n.className === 'omRowDesc')[0].textContent, 'Furnished studio in Uptown Al Zahia, ready to move.');
  assert.equal(all(rows[0], (n) => n.className === 'omRowPrice')[0].textContent, 'AED 480,000');
  const open = all(rows[0], (n) => n.className === 'omRowOpen')[0];
  assert.equal(open.textContent, 'افتح ↗'); assert.equal(open.href, 'https://www.bayut.com/property/1'); assert.equal(open.target, '_blank');
  assert.equal(all(rows[1], (n) => /omCardPriceSite/.test(n.className))[0].textContent, 'السعر في الموقع', 'v-google-cards: بلا سعر = «السعر في الموقع»');
  assert.ok(!rows.some((r) => all(r, (n) => n.textContent === 'no image').length), 'v-google-cards: بلا صورة لا صفّ');
  assert.equal(all(rows[1], (n) => n.className === 'omRowDesc').length, 0);
  assert.deepEqual(chipCalls, [['https://www.bayut.com/property/1', 'bayut.com'], ['https://www.propertyfinder.ae/en/buy/sharjah/villas', 'propertyfinder.ae']]);
  const p = ctx.window.omranRenderCards({ kind: 'product', items: ITEMS });
  const pg = p.childNodes.find((n) => /omCards/.test(n.className));
  assert.equal(pg.className, 'omCards');
  assert.ok(pg.childNodes.every((n) => n.className === 'omCard' && n.tagName === 'A'), 'شبكة المنتجات كما هي');
  const css = all(ctx.document.head, (n) => n.id === 'omranCardsCss')[0].textContent;
  assert.ok(css.includes('.omCards.omList{grid-template-columns:minmax(0,1fr)') && !/overflow-x\s*:\s*auto/.test(css), 'عمود واحد بلا تمرير أفقيّ');
});

test('١١. الحزمة فيها الجديد', () => {
  const b = read('js/app.bundle.js');
  for (const k of ['function omranContactsEl(', 'function omranSrcChip(', 'function omranMdText(', 'function omranCopyNum(', "n.className === 'md-contacts'", "cards.kind === 'listing'"]) assert.ok(b.includes(k), k);
});
