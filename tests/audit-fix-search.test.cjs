// tests/audit-fix-search.test.cjs — v-audit-search: دفعة «البحث والأسهم والبريد» من فحص التطبيق كلّه (أكتوبر ٢٠٢٦).
// srv-search-1 لوحة ترتيب المحفظة كانت ترسل مفتاح الحساب (g_<البريد> لحسابات جوجل) لكلّ المستخدمين.
// srv-search-3 كاشف «سؤال أماكن» يطابق أجزاء كلمات (أسباب/سباق/إسبانيا/مولود/دكتوراه/small/Spanish).
// srv-search-5 «تجاهل هذا المرسل» وعلامة (me) بالاحتواء: ali@gmail.com يُخفي mohammedali@gmail.com.
// srv-search-6 ربط Gmail يُقبل بصلاحيّات ناقصة، والإرسال الناقص يرجع نصّ جوجل الخامّ بلا إعادة ربط.
// srv-search-7 نصوص الخادم وتنبيه الربط عربيّة/إنجليزيّة ثابتة (أو خامّة) لواجهة من ١٤ لغة.
// srv-search-8 شرح الأسهم ودرسها لسبع لغات فقط، والعميل يقصّ fil إلى fi، وأخطاء الصفقة عربيّة ثابتة.
// cli-tools-7 تقرير مشروع البناء (PDF) dir=rtl وlang=ar وعناوين عربيّة لكلّ اللغات.
// المعالجات الحقيقيّة بـKV في الذاكرة والشبكة محاكاة؛ والواجهة في vm (‎_stocks-vm‎ للأسهم والمقاولات، ودوم مصغّر للبريد).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

process.env.AUTH_SECRET = 'audit-fix-search-secret';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
process.env.TWELVEDATA_API_KEY = 'td-test';
process.env.OPENAI_API_KEY = 'oa-test';
for (const k of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'FINNHUB_API_KEY', 'UPSTASH_REDIS_REST_URL', 'TAVILY_API_KEY', 'OWNER_USERNAMES']) delete process.env[k];

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
let planGate = { allowed: true };
mock('api/_lib/_planCap.js', { checkAndConsumePlanCustom: async () => planGate, planScaledLimit: () => 0, planLimitInfo: async () => ({}), GIFT_BUCKETS: [] });
const cheapPrompts = [];
mock('api/_lib/free-chain.js', { completeFreeChain: async (o) => { cheapPrompts.push(o.messages[0].content); return { ok: true, text: 'lesson' }; } });
mock('api/_lib/email-link-ticket.js', { takeTicket: async (state) => (state === 'tk-bob' ? 'bob' : null), isTicket: () => true });

const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } });
let route = () => null;
global.fetch = async (url, opts) => (await route(String(url), opts || {})) || json({}, 404);

const auth = require(rp('api/_lib/auth.js'));
const { encrypt } = require(rp('api/_lib/_emailCrypto.js'));
const stocks = require(rp('api/_lib/stocks.js'));
const emailList = require(rp('api/_lib/email-list.js'));
const emailCb = require(rp('api/_lib/email-callback.js'));
const emailSend = require(rp('api/_lib/email-send.js'));
const { isPlacesAsk } = require(rp('api/_lib/search.js'));

const mkRes = () => {
  const r = { code: 0, j: null, headers: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (j) => { r.j = j; return r; };
  r.setHeader = () => r; r.end = () => r;
  r.writeHead = (c, h) => { r.code = c; r.headers = h; };
  return r;
};
async function call(handler, body, extra) {
  const r = mkRes();
  await handler(Object.assign({ method: 'POST', body, headers: { host: 'example.test' } }, extra || {}), r);
  return r;
}

/* ---------------- srv-search-1 ---------------- */
test('srv-search-1 لوحة الترتيب: لا مفتاح حساب ولا بريد ولا رقم هاتف في top — اسم مقنَّع وعلم me لصاحب الطلب', async () => {
  store.set('db/stocks/pf-board.json', JSON.stringify({
    'g_ahmed.private@gmail.com': { plPct: 12.5, equity: 112500, t: 1 },
    'sara': { plPct: 3, equity: 103000, t: 2 },
    '0501234567': { plPct: 1, equity: 101000, t: 3 },
    'old@hotmail.com': { plPct: -2, equity: 98000, t: 4 },
  }));
  const r = await call(stocks, { mode: 'pf-get', token: auth.makeToken('omar') });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  const bd = r.j.board;
  const s = JSON.stringify(bd);
  assert.doesNotMatch(s, /@|gmail|hotmail|g_ahmed|0501234567/, 'لا بريد ولا مفتاح g_ ولا هاتف: ' + s);
  assert.ok(bd.top.every((x) => !Object.prototype.hasOwnProperty.call(x, 'user')), 'مفتاح الحساب لا يُرسل');
  assert.equal(bd.top[0].name, 'ah***');
  assert.equal(bd.top.find((x) => x.name === 'sara').me, undefined);
  const mine = bd.top.filter((x) => x.me);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].name, 'omar');
  assert.equal(bd.rank, bd.top.findIndex((x) => x.me) + 1, 'المركز كما هو');
  assert.equal(bd.total, 5);
});

/* ---------------- srv-search-3 ---------------- */
test('srv-search-3 كاشف الأماكن بكلمات كاملة: أسئلة المعرفة ليست أماكن، وأسئلة الأماكن (بالسوابق واللواحق) كما كانت', () => {
  const NOT = ['ما أسباب الصداع المستمر', 'نتائج سباق الفورمولا', 'تعلم السباحة للمبتدئين', 'عدد سكان إسبانيا', 'تأشيرة إسبانيا للمقيمين',
    'اسماء مولود جديد', 'سعر جهاز محمول', 'شروط الدكتوراه في الخارج', 'ورشة عمل عن التسويق', 'small business ideas', 'Spanish verbs',
    'space exploration news', 'parking rules', 'clinical trials results', 'gymnastics olympics'];
  for (const q of NOT) assert.equal(isPlacesAsk(q), false, 'ليس سؤال أماكن: ' + q);
  const YES = ['سبا في دبي', 'مول قريب مني', 'أفضل المطاعم في عجمان', 'مطاعم مندي في عجمان', 'وين أروح بالمول', 'صالونات تجميل في الشارقة',
    'دكتورة نساء في دبي', 'كوفي في العين', 'عروض للمطاعم', 'والمولات المفتوحة', 'مطعم؟', 'ورشة سيارات في القوز', 'مولات دبي', 'صيدلية قريبة',
    'spa in dubai', 'best restaurants in Abu Dhabi', 'malls near me', 'gym near me', 'pharmacy open now', 'فندق في دبي'];
  for (const q of YES) assert.equal(isPlacesAsk(q), true, 'سؤال أماكن: ' + q);
  // الكاشف نفسه في مسار البحث (search.js isPlaces) — لا نسخة ثانية تبقى بلا حدود
  const src = read('api/_lib/search.js');
  assert.equal(src.split('const PLACES_RE = ').length, 2, 'تعريف واحد');
  assert.match(src, /const isPlaces = !domains && \(PLACES_RE\.test\(query\)/);
});

/* ---------------- البريد: مساعدات ---------------- */
const b64u = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const MSG = (id, threadId, from, text) => ({ id, threadId, snippet: text.slice(0, 30),
  payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: from }, { name: 'Subject', value: 'S-' + id }, { name: 'Date', value: 'Mon, 13 Oct 2026' }], body: { data: b64u(text) } } });
async function seedMail(name, extra) {
  await auth.putUser(name, { username: name, createdAt: Date.now(), points: 0, emailAssist: Object.assign({ connected: true, gmailAddress: name + '@gmail.com', refreshTokenEnc: encrypt('rt'), ignoreList: [], styleProfile: { text: '- warm', at: Date.now() } }, extra || {}) });
}
function gmailRoute(o) {
  const msgs = o.msgs || [];
  return (u, opts) => {
    if (/oauth2\.googleapis\.com\/token/.test(u)) return json({ access_token: 'at' });
    if (/api\.openai\.com/.test(u)) { (o.ai || []).push(JSON.parse(opts.body)); return json({ choices: [{ message: { content: JSON.stringify({ priority: 'normal', lang: 'en', draft: 'Hi', meeting_title: '', meeting_start: '', meeting_minutes: 60, translation: '', draft_gloss: '' }) } }] }); }
    if (/labelIds=SENT/.test(u)) return json({ messages: [] });
    if (/users\/me\/messages\?/.test(u)) {
      if (o.listFail) return json(o.listFail.body, o.listFail.status);
      const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '');
      const box = o.byQuery ? (o.byQuery(q) || []) : msgs;
      return json({ messages: box.map((m) => ({ id: m.id, threadId: m.threadId })) });
    }
    if (/threads\/T1\?/.test(u)) return json({ id: 'T1', messages: o.thread || [] });
    const m = u.match(/messages\/(\w+)\?/);
    if (m) return json(msgs.concat(o.thread || []).find((x) => x.id === m[1]) || {}, 200);
    if (/messages\/send/.test(u)) return o.send ? json(o.send.body, o.send.status) : json({ id: 'sent' });
    return null;
  };
}

/* ---------------- srv-search-5 ---------------- */
test('srv-search-5 تجاهل المرسل بالعنوان كاملًا: ali@gmail.com لا يُخفي mohammedali@ ولا khalidali@، و«@نطاق» صريح يطابق النطاق وحده', async () => {
  await seedMail('alice', { ignoreList: ['ali@gmail.com', '@spam.com'] });
  const msgs = [
    MSG('m1', 'A1', 'Ali <ali@gmail.com>', 'hi'),
    MSG('m2', 'A2', 'Mohammed <mohammedali@gmail.com>', 'hi'),
    MSG('m3', 'A3', 'khalidali@gmail.com', 'hi'),
    MSG('m4', 'A4', '"ALI" <ALI@Gmail.com>', 'hi'),
    MSG('m5', 'A5', 'Sara <sara@x.com>', 'hi'),
    MSG('m6', 'A6', 'Promo <deals@spam.com>', 'hi'),
    MSG('m7', 'A7', 'Real <me@notspam.com>', 'hi'),
  ];
  route = gmailRoute({ msgs });
  const r = await call(emailList, { token: auth.makeToken('alice'), lang: 'ar', tz: 'Asia/Dubai' });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.emails.map((e) => e.id).sort(), ['m2', 'm3', 'm5', 'm7']);
});

test('srv-search-5 علامة (me) في سياق المحادثة بالعنوان نفسه، لا بالاحتواء', async () => {
  await seedMail('ali', { gmailAddress: 'ali@gmail.com' });
  const ai = [];
  const thread = [
    MSG('t1', 'T1', 'Mo <mohammedali@gmail.com>', 'Can you send the file?'),
    MSG('t2', 'T1', 'Ali <ali@gmail.com>', 'Sure, tomorrow.'),
    MSG('t3', 'T1', 'Mo <mohammedali@gmail.com>', 'Thanks, and the price?'),
  ];
  route = gmailRoute({ thread, ai });
  const r = await call(emailList, { token: auth.makeToken('ali'), lang: 'en', tz: 'Asia/Dubai', draftFor: 't3', threadId: 'T1' });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  const u = ai[ai.length - 1].messages[1].content;
  assert.match(u, /From: Ali <ali@gmail\.com> \(me\)/);
  assert.doesNotMatch(u, /mohammedali@gmail\.com> \(me\)/, 'الطرف الآخر ليس المستخدم: ' + u);
});

/* ---------------- srv-search-6 ---------------- */
async function linkWith(scope) {
  await auth.putUser('bob', { username: 'bob', createdAt: Date.now(), points: 0 });
  route = (u, opts) => {
    if (/oauth2\.googleapis\.com\/token/.test(u)) return json(Object.assign({ access_token: 'at', refresh_token: 'rt-bob' }, scope === undefined ? {} : { scope }));
    if (/gmail\/v1\/users\/me\/profile/.test(u)) return json({ emailAddress: 'bob@gmail.com' });
    return null;
  };
  const r = mkRes();
  await emailCb({ query: { code: 'c', state: 'tk-bob' }, headers: { host: 'example.test' } }, r);
  return { loc: r.headers && r.headers.Location, user: await auth.getUser('bob') };
}
const G = 'https://www.googleapis.com/auth/';

test('srv-search-6 الموافقة الجزئيّة: بلا القراءة أو بلا الإرسال = missing_scopes ولا ربط؛ كاملة = ربط ويُحفظ ما مُنح', async () => {
  for (const scope of [G + 'calendar.events', G + 'gmail.readonly ' + G + 'calendar.events', G + 'gmail.send']) {
    const { loc, user } = await linkWith(scope);
    assert.equal(loc, 'https://example.test/?emailerror=missing_scopes', scope);
    assert.ok(!user.emailAssist || !user.emailAssist.connected, 'لا ربط بصلاحيّات ناقصة: ' + scope);
  }
  const full = G + 'gmail.readonly ' + G + 'gmail.send ' + G + 'calendar.events';
  const ok = await linkWith(full);
  assert.equal(ok.loc, 'https://example.test/?emailconnected=1');
  assert.equal(ok.user.emailAssist.connected, true);
  assert.deepEqual(ok.user.emailAssist.scopes, full.split(' '));
  const noCal = await linkWith(G + 'gmail.readonly ' + G + 'gmail.send');
  assert.equal(noCal.loc, 'https://example.test/?emailconnected=1', 'التقويم اختياريّ (له إعادة ربط خاصّة)');
});

test('srv-search-6 صلاحيّة ناقصة على حساب مربوط قبلًا: الإرسال والقائمة needsReauth برمز، بلا نصّ جوجل الخامّ', async () => {
  await seedMail('carol');
  const RAW = 'Request had insufficient authentication scopes.';
  route = gmailRoute({ send: { status: 403, body: { error: { code: 403, message: RAW, status: 'PERMISSION_DENIED' } } } });
  const s = await call(emailSend, { token: auth.makeToken('carol'), to: 'x@y.z', text: 'hi', subject: 's' });
  assert.equal(s.code, 403);
  assert.equal(s.j.needsReauth, true);
  assert.equal(s.j.code, 'needs_reauth');
  assert.doesNotMatch(JSON.stringify(s.j), /insufficient/i);
  route = gmailRoute({ listFail: { status: 403, body: { error: { code: 403, message: RAW } } } });
  const l = await call(emailList, { token: auth.makeToken('carol'), lang: 'ar' });
  assert.equal(l.j.needsReauth, true);
  assert.equal(l.j.code, 'needs_reauth');
  assert.doesNotMatch(JSON.stringify(l.j), /insufficient|Gmail:/i);
});

/* ---------------- srv-search-7 (الخادم) ---------------- */
test('srv-search-7 الخادم يرسل رموزًا لا جملًا: نطاق القائمة، والجلسة، وGmail API المعطّل بلا رابط الكونسول لغير المالك', async () => {
  await seedMail('dina');
  const old = [MSG('o1', 'O1', 'Sam <sam@x.com>', 'old mail')];
  route = gmailRoute({ msgs: old, byQuery: (q) => (/newer_than:7d/.test(q) ? [] : old) });
  const r = await call(emailList, { token: auth.makeToken('dina'), lang: 'fr' });
  assert.equal(r.code, 200, JSON.stringify(r.j));
  assert.equal(r.j.scope, 'wide30');
  assert.doesNotMatch(JSON.stringify(r.j), /No primary mail|لا رسائل أساسية/, 'لا جملة عربيّة/إنجليزيّة ثابتة لواجهة فرنسيّة');
  route = gmailRoute({ byQuery: (q) => (/newer_than:30d/.test(q) || /newer_than:7d/.test(q) ? [] : old), msgs: old });
  assert.equal((await call(emailList, { token: auth.makeToken('dina'), lang: 'ml' })).j.scope, 'latest');
  route = gmailRoute({ byQuery: () => [] });
  assert.equal((await call(emailList, { token: auth.makeToken('dina'), lang: 'zh' })).j.scope, 'empty');

  const e401 = await call(emailList, { token: 'bad', lang: 'fr' });
  assert.equal(e401.code, 401);
  assert.equal(e401.j.code, 'session_expired');

  route = gmailRoute({ listFail: { status: 403, body: { error: { code: 403, message: 'Gmail API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com' } } } });
  const dis = await call(emailList, { token: auth.makeToken('dina'), lang: 'fr' });
  assert.equal(dis.code, 502);
  assert.equal(dis.j.code, 'gmail_api_disabled');
  assert.doesNotMatch(JSON.stringify(dis.j), /console|https?:|غير مفعّل/, 'الرابط للمالك وحده: ' + JSON.stringify(dis.j));
});

/* ---------------- srv-search-8 (الخادم) ---------------- */
test('srv-search-8 الدرس والتحليل بلغة الواجهة لكلّ اللغات الأربع عشرة (es/tr/ru/id/fil/ml/zh كانت عربيّة)', async () => {
  process.env.ANTHROPIC_API_KEY = 'a-test';
  route = (u) => {
    if (/api\.twelvedata\.com\/quote/.test(u)) return json({ symbol: 'AAPL', name: 'Apple', close: '100', change: '1', percent_change: '1', high: '101', low: '99', previous_close: '99', volume: '10', currency: 'USD', is_market_open: true });
    if (/api\.twelvedata\.com\/time_series/.test(u)) return json({ values: [] });
    return null;
  };
  const WANT = { es: 'Spanish', tr: 'Turkish', ru: 'Russian', id: 'Indonesian', fil: 'Filipino', ml: 'Malayalam', zh: 'Chinese', ur: 'Urdu', fr: 'French', en: 'English', ar: 'Arabic' };
  try {
    for (const [lg, name] of Object.entries(WANT)) {
      cheapPrompts.length = 0;
      const l = await call(stocks, { mode: 'learn', topic: 'RSI', symbol: 'AAPL', lang: lg, token: 't' });
      assert.equal(l.code, 200, lg + ' ' + JSON.stringify(l.j));
      assert.match(cheapPrompts[0], new RegExp('Reply in ' + name + '\\b'), 'درس ' + lg);
      cheapPrompts.length = 0;
      const a = await call(stocks, { mode: 'analyze', symbol: 'AAPL', lang: lg, token: 't' });
      assert.equal(a.code, 200, lg + ' ' + JSON.stringify(a.j));
      assert.match(cheapPrompts[0], new RegExp('Reply in ' + name + '\\b'), 'تحليل ' + lg);
    }
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test('srv-search-8 أخطاء الصفقة رموز بأرقامها حقولًا لا جمل عربيّة', async () => {
  route = (u) => (/api\.twelvedata\.com\/quote/.test(u) ? json({ symbol: 'MSFT', close: '100' }) : null);
  const tok = auth.makeToken('trader');
  store.delete('db/stocks/pf/trader.json');
  let r = await call(stocks, { mode: 'pf-trade', side: 'buy', tradeSymbol: 'MSFT', qty: 5000, token: tok });
  assert.equal(r.code, 400);
  assert.deepEqual(r.j, { error: 'insufficient_cash', cash: 100000, cost: 500000 });
  r = await call(stocks, { mode: 'pf-trade', side: 'sell', tradeSymbol: 'MSFT', qty: 3, token: tok });
  assert.deepEqual(r.j, { error: 'not_enough_shares', have: 0, symbol: 'MSFT' });
  r = await call(stocks, { mode: 'pf-trade', side: 'buy', tradeSymbol: '', qty: 3, token: tok });
  assert.deepEqual(r.j, { error: 'bad_trade' });
  planGate = { allowed: false, limit: 40 };
  try {
    r = await call(stocks, { mode: 'pf-trade', side: 'buy', tradeSymbol: 'MSFT', qty: 1, token: tok });
    assert.equal(r.code, 402);
    assert.deepEqual(r.j, { error: 'trade_limit', limit: 40 });
  } finally { planGate = { allowed: true }; }
  assert.doesNotMatch(read('api/_lib/stocks.js'), /رصيدك الافتراضي لا يكفي|ما تملك هذه الكمية|وصلت لحد الصفقات/);
});

/* ---------------- الواجهة: الأسهم والمقاولات ---------------- */
const { boot } = require('./_stocks-vm.cjs');
const AR = /[؀-ۿ]/;
const L = '⁦', P = '⁩';
const plain = (s) => s.split(L).join('').split(P).join('');
const PF = { ok: true, portfolio: { cash: 100000, equity: 100000, pl: 0, plPct: 0, positions: [], trades: [] },
  board: { top: [{ rank: 1, name: 'ah***', plPct: 12.5 }, { rank: 2, name: 'omar', plPct: 0, me: true }], rank: 2, total: 2 } };

test('srv-search-1 الواجهة: اللوحة تعرض الاسم المقنَّع، وسطر صاحب الحساب عريض', async () => {
  const h = boot({ lang: 'en', route: (m) => (m === 'pf-get' ? PF : {}) });
  h.ctx.__stkShowTab('pf'); await h.flush();
  const html = h.$('stockPfWrap').innerHTML;
  assert.ok(html.includes('>\u2068ah***\u2069</span>'), 'معزول FSI: ' + html.slice(html.indexOf('🏆')));
  assert.ok(html.includes('font-weight:700;">\u2068omar\u2069</span>'), 'سطري معلَّم');
  assert.ok(!html.includes('undefined'));
});

async function pfFail(lang, body, tOverride) {
  const h = boot({ lang, route: (m) => (m === 'pf-get' ? PF : m === 'pf-trade' ? { status: body.error === 'trade_limit' ? 402 : 400, body } : {}) });
  if (tOverride) { const orig = h.ctx.t; h.ctx.t = (k) => (tOverride[k] !== undefined ? tOverride[k] : orig(k)); }
  h.ctx.__stkShowTab('pf'); await h.flush();
  h.$('pfSym').value = 'MSFT'; h.$('pfQty').value = '5000';
  h.$('pfBuy').click(); await h.flush();
  return h.$('pfMsg').textContent;
}

test('srv-search-8 الواجهة: أخطاء الصفقة بلغة الواجهة وأرقامها معزولة، والمفتاح الجديد يُستعمل متى وصل القاموس', async () => {
  const NO_CASH = { error: 'insufficient_cash', cash: 100000, cost: 500000 };
  const en = await pfFail('en', NO_CASH);
  assert.doesNotMatch(en, AR, en);
  assert.equal(plain(en), '⚠️ Not enough virtual cash: you have $100,000 and this trade needs $500,000');
  assert.ok(en.includes(L + '$100,000' + P), 'الرقم معزول LTR');
  const ar = await pfFail('ar', NO_CASH);
  assert.equal(plain(ar), '⚠️ رصيدك الافتراضي لا يكفي: عندك $100,000 والصفقة تحتاج $500,000');
  const fr = await pfFail('fr', NO_CASH, { axSearchPfNoCash: 'FR {cash} / {cost}' });
  assert.equal(plain(fr), '⚠️ FR $100,000 / $500,000');
  const sh = await pfFail('en', { error: 'not_enough_shares', have: 2, symbol: 'MSFT' });
  assert.equal(plain(sh), "⚠️ You don't own that many — you have 2 shares of MSFT");
  const lim = await pfFail('en', { error: 'trade_limit', limit: 40 });
  assert.equal(plain(lim), "⚠️ You've reached today's trade limit (40) — come back tomorrow 🌙");
  const bad = await pfFail('en', { error: 'bad_trade' });
  assert.equal(bad, '⚠️ Enter a stock symbol and quantity first');
  for (const s of [en, sh, lim, bad]) assert.doesNotMatch(s, /insufficient_cash|not_enough_shares|trade_limit|bad_trade/);
});

test('srv-search-8 الواجهة: الدرس والتحليل يرسلان رمز اللغة كاملًا (fil لا fi)', async () => {
  const h = boot({ lang: 'fil', route: (m) => (m === 'learn' ? { lesson: 'x' } : {}) });
  h.$('stockLearnChips').children[0].click(); await h.flush();
  const req = h.sent.find((s) => s.body.mode === 'learn');
  assert.equal(req.body.lang, 'fil');
  assert.doesNotMatch(read('js/app-13-stocks-init.js'), /mode:'(?:analyze|learn)'[^\n]*\.slice\(0,2\)|const lang = \(localStorage\.getItem\('aiapp_lang'\)\|\|'ar'\)\.slice\(0,2\);/);
});

const PLAN_EN = '### Areas\n**Total: 400 m²**\n- Hall: 60 m²';
async function cxReport(lang, opts) {
  const o = opts || {};
  const h = boot({ lang, part: 'construction', route: (u) => (/construction-create/.test(u) ? { planText: PLAN_EN, remaining: 5, dailyLimit: 6, boq: [['Item', 'Qty'], ['Cement', '10']] } : {}) });
  if (o.t) { const orig = h.ctx.t; h.ctx.t = (k) => (o.t[k] !== undefined ? o.t[k] : orig(k)); }
  if (o.optText) { h.$('constructionType').options[0].text = o.optText[0]; h.$('constructionStyle').options[0].text = o.optText[1]; }
  h.$('constructionPlot').value = '500';
  const exp = [];
  if (o.inApp) { h.ctx.omranLikelyApp = () => true; h.ctx.omranExportHtmlAsPdfFile = async (html, op) => { exp.push({ html, op }); }; }
  h.$('constructionRunBtn').onclick(); await h.flush();
  await h.$('constructionPdfBtn').onclick();
  return { doc: h.opened[0] ? h.opened[0].html : '', exp };
}

test('cli-tools-7 تقرير البناء بلغة الواجهة واتّجاهها: الإنجليزيّة ltr بلا حرف عربيّ، والعربيّة rtl كما كانت', async () => {
  const en = await cxReport('en', { optText: ['🏡 Residential villa', '✨ Modern'] });
  assert.match(en.doc, /^<!doctype html><html dir="ltr" lang="en">/);
  assert.doesNotMatch(en.doc, AR, 'لا عربيّ في تقرير إنجليزيّ: ' + (en.doc.match(/.{30}[؀-ۿ]+.{30}/) || [''])[0]);
  assert.match(en.doc, /<title>Construction project report<\/title>/);
  assert.match(en.doc, /Number of floors: 1/);
  assert.match(en.doc, /300 m² built/);
  assert.match(en.doc, /500 m² plot/);
  assert.match(en.doc, /th,td\{[^}]*text-align:start/);
  const ar = await cxReport('ar');
  assert.match(ar.doc, /^<!doctype html><html dir="rtl" lang="ar">/);
  assert.match(ar.doc, /<title>تقرير مشروع البناء<\/title>/);
  assert.match(ar.doc, /عدد الأدوار: 1/);
  assert.match(ar.doc, /300 م² بناء/);
});

test('cli-tools-7 المفاتيح الجديدة تُستعمل متى وصل القاموس، والتصدير داخل التطبيق باتّجاه اللغة', async () => {
  const fr = await cxReport('fr', { inApp: true, t: { axSearchCxReportTitle: 'Rapport FR', axSearchCxFooter: 'Pied FR', axSearchCxDetails: '📋 Détails FR', axSearchCxBoq: '📊 Quantités FR', axSearchCxBuiltArea: '{n} m² FR', axSearchCxPlotArea: '{n} m² terrain' } });
  assert.equal(fr.exp.length, 1, 'تصدير الملفّ داخل التطبيق');
  assert.equal(fr.exp[0].op.rtl, false);
  const h = fr.exp[0].html;
  for (const s of ['Rapport FR', 'Pied FR', 'Détails FR', 'Quantités FR', '300 m² FR', '500 m² terrain']) assert.ok(h.includes(s), s);
  const ur = await cxReport('ur', { inApp: true });
  assert.equal(ur.exp[0].op.rtl, true, 'الأردو rtl');
});

/* ---------------- الواجهة: البريد ---------------- */
function attrsOf(html, cls) {
  const m = html.match(new RegExp('<(\\w+)([^>]*\\bclass="[^"]*\\b' + cls + '\\b[^"]*"[^>]*)>'));
  if (!m) return null;
  const a = { tag: m[1] };
  for (const x of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) a[x[1]] = x[2];
  return a;
}
function el(tag) {
  const e = {
    tagName: tag, style: {}, textContent: '', value: '', placeholder: '', disabled: false, children: [], listeners: {}, _html: '', _q: {}, _attrs: {},
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    click() { for (const f of this.listeners.click || []) f({ target: this }); },
    appendChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); this.children.push(c); return c; },
    contains(x) { return !!x && (x === this || this.children.some((c) => c === x || (c.contains && c.contains(x)))); },
    remove() { this.removed = true; }, getAttribute(k) { return this._attrs[k]; }, setAttribute(k, v) { this._attrs[k] = String(v); },
    querySelector(sel) {
      if (this._q[sel]) return this._q[sel];
      const a = attrsOf(this._html, sel.replace(/^\./, ''));
      if (!a) return null;
      const c = el(a.tag); c._attrs = a; this._q[sel] = c; return c;
    },
  };
  Object.defineProperty(e, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this._q = {}; this.children = []; } });
  return e;
}
function runMailUi(handler, search) {
  const ids = {};
  const byId = (s) => (ids[s] = ids[s] || el('div'));
  const ST = read('js/app-12-studios.js');
  const block = ST.slice(ST.indexOf('/* ---------- 📧 AI Email Assistant'));
  const st = { aiapp_auth_token: 'tok', aiapp_lang: 'ar' };
  const sent = [];
  const alerts = [];
  const ctx = {
    console, Promise, JSON, String, Number, Object, Array, Error, Intl, RegExp, URLSearchParams, setTimeout, clearTimeout,
    $: (s) => byId(s), document: { createElement: (t) => el(t), title: '', activeElement: null },
    localStorage: { getItem: (k) => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); } },
    t: (k) => 'T:' + k, lang: 'fr', __swallow() {}, alert: (m) => alerts.push(String(m)),
    window: { location: { search: search || '', origin: 'https://x', pathname: '/' }, history: { replaceState() {} } },
    fetch: async (u, o) => {
      const body = o && o.body ? JSON.parse(o.body) : null;
      sent.push({ u: String(u), body });
      const r = (await handler(String(u), body)) || {};
      return r.__status ? json(r.body, r.__status) : json(r);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return { ids, sent, alerts };
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms || 60));

test('srv-search-7 الواجهة: نطاق القائمة وأخطاء الخادم تُترجم من الرمز، بلا جملة الخادم ولا نصّه الخامّ', async () => {
  let ui = runMailUi(async (u) => (/email-list/.test(u) ? { ok: true, scope: 'wide30', emails: [] } : {}));
  ui.ids['#btnEmailAssist'].click(); await settle();
  assert.equal(ui.ids['#emailAssistStatus'].textContent, 'T:axSearchEmScope30');
  for (const [code, key] of [['latest', 'axSearchEmScopeLatest'], ['empty', 'axSearchEmScopeEmpty']]) {
    ui = runMailUi(async (u) => (/email-list/.test(u) ? { ok: true, scope: code, emails: [] } : {}));
    ui.ids['#btnEmailAssist'].click(); await settle();
    assert.equal(ui.ids['#emailAssistStatus'].textContent, 'T:' + key);
  }
  ui = runMailUi(async (u) => (/email-list/.test(u) ? { __status: 401, body: { error: 'الجلسة منتهية، سجل الدخول من جديد', code: 'session_expired' } } : {}));
  ui.ids['#btnEmailAssist'].click(); await settle();
  assert.equal(ui.ids['#emailAssistStatus'].textContent, 'T:emailAsst_errorT:axSearchSessionExpired');
  ui = runMailUi(async (u) => (/email-list/.test(u) ? { __status: 502, body: { error: 'gmail_api_disabled', code: 'gmail_api_disabled' } } : {}));
  ui.ids['#btnEmailAssist'].click(); await settle();
  assert.equal(ui.ids['#emailAssistStatus'].textContent, 'T:emailAsst_errorT:svcPaused');

  // الإرسال: رمز الجلسة المنتهية مترجم لا الجملة العربيّة
  ui = runMailUi(async (u) => {
    if (/email-list/.test(u)) return { ok: true, emails: [{ id: 'm1', threadId: 't1', from: 'a@b.c', subject: 's', snippet: '', priority: 'normal', lang: 'en', draft: 'Hi', cached: true }] };
    if (/email-send/.test(u)) return { __status: 401, body: { error: 'الجلسة منتهية، سجل الدخول من جديد', code: 'session_expired' } };
    return {};
  });
  ui.ids['#btnEmailAssist'].click(); await settle();
  const card = ui.ids['#emailAssistList'].children[0];
  card.querySelector('.emailSendBtn').click(); await settle();
  assert.equal(card.querySelector('.emailCardStatus').textContent, 'T:emailAsst_errorT:axSearchSessionExpired');
});

test('srv-search-6 الواجهة: needsReauth من القائمة أو الإرسال يُظهر صندوق إعادة الربط', async () => {
  let ui = runMailUi(async (u) => (/email-list/.test(u) ? { __status: 403, body: { error: 'needs_reauth', code: 'needs_reauth', needsReauth: true } } : {}));
  ui.ids['#btnEmailAssist'].click(); await settle();
  assert.equal(ui.ids['#emailAssistConnectBox'].style.display, 'block');
  assert.equal(ui.ids['#emailAssistStatus'].textContent, 'T:emailAsst_notConnected');
  ui = runMailUi(async (u) => {
    if (/email-list/.test(u)) return { ok: true, emails: [{ id: 'm1', threadId: 't1', from: 'a@b.c', subject: 's', snippet: '', priority: 'normal', lang: 'en', draft: 'Hi', cached: true }] };
    if (/email-send/.test(u)) return { __status: 403, body: { error: 'needs_reauth', code: 'needs_reauth', needsReauth: true } };
    return {};
  });
  ui.ids['#btnEmailAssist'].click(); await settle();
  assert.notEqual(ui.ids['#emailAssistConnectBox'].style.display, 'block');
  const card = ui.ids['#emailAssistList'].children[0];
  card.querySelector('.emailSendBtn').click(); await settle();
  assert.equal(card.querySelector('.emailCardStatus').textContent, 'T:emailAsst_errorT:emailAsst_notConnected');
  assert.equal(ui.ids['#emailAssistConnectBox'].style.display, 'block', 'زرّ الربط ظاهر لإعادة الربط');
});

test('srv-search-7 تنبيه فشل الربط مترجم لكلّ رمز، بلا الرمز الخامّ', async () => {
  const cases = { access_denied: 'axSearchEmLinkDenied', missing_scopes: 'axSearchEmLinkScopes', session_expired: 'axSearchEmLinkFailed', network_changed: 'axSearchEmLinkFailed', server_error: 'axSearchEmLinkFailed' };
  for (const [code, key] of Object.entries(cases)) {
    const ui = runMailUi(async () => ({}), '?emailerror=' + code);
    await settle(400);
    assert.deepEqual(ui.alerts, ['⚠️ T:' + key], code);
  }
});
