// tests/plan-routing.test.cjs — v-plan-routing (٢٠ سبتمبر ٢٠٢٦): جدول الباقات النهائيّ (قرار المالك بعد جلسة الأرباح):
// مجّاني ٥ رسائل على Groq · Plus ٥٠ (DeepSeek) · Pro ١٠٠ (DeepSeek + Haiku للدور القويّ) · Max ٢٥٠ (Haiku + Sonnet)،
// التقاط داخل الباقة قبل السلسلة المجّانيّة، النقاط ٣٦٠/٩٢٠/٣٬٢٠٠، رزم الشحن حقيقيّة، حدّ ٢٠ صورة/ساعة وفيديو/٣ دقائق،
// ومنتقي المزوّد لمن باقته تسمح فقط، ونصوص الباقات في ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'plan-routing-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.MISTRAL_API_KEY;
delete process.env.CHAT_CLAUDE_MODEL;

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (key) => db.has(key) ? structuredClone(db.get(key)) : null,
  kvPutJSON: async (key, value) => { db.set(key, structuredClone(value)); },
  kvDel: async (key) => { db.delete(key); },
  kvExpire: async () => {},
} };
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async (tok, gid, bucket) => { consumed.push(bucket); return { allowed: true, username: 'plan-user' }; },
  todayCount: async (u, bucket) => counts[bucket] || 0,
  bumpCount: async (u, bucket) => { bumped.push(bucket); },
} };
let counts = {};
const consumed = [];
const bumped = [];
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const tierLib = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));

// ── (١) الجدول نفسه ──
test('١. الأسقف الافتراضيّة والسلسلة المجّانيّة تبدأ بـGroq، وجدول الوظائف (v-plan-jobs)', () => {
  assert.deepEqual(tierLib.caps({}), { guest: 3, free: 5, basic: 50, pro: 100, max: 250 });
  assert.deepEqual(tierLib.DEFAULT_CHAIN, ['groq', 'gemini', 'mistral', 'openrouter']);
  assert.equal(tierLib.freeChain({ GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' })[0].id, 'groq', 'Groq أوّلًا');
  assert.match(tierLib.FREE_TEXT.guestLimit, /5 رسائل/);
  const pr = tierLib.PLAN_ROUTING;
  assert.deepEqual(Object.keys(pr), ['basic', 'pro', 'max']);
  for (const k of ['basic', 'pro']) {
    assert.deepEqual([pr[k].chat, pr[k].code, pr[k].math, pr[k].image], [['groq'], ['haiku', 'deepseek'], ['deepseek'], ['gemini']], k);
    assert.deepEqual(pr[k].allowed, [], k + ': بلا منتقي');
  }
  assert.deepEqual(pr.basic.meters, { haiku: ['SUB_HAIKU_BASIC', 5] });
  assert.deepEqual(pr.pro.meters, { haiku: ['SUB_HAIKU_PRO', 10] });
  assert.deepEqual(pr.max.meters, { haiku: ['SUB_HAIKU_MAX', 150], sonnet: ['SUB_SONNET_MAX', 30] });
  assert.deepEqual([pr.max.chat, pr.max.code], [['haiku', 'groq'], ['sonnet', 'haiku', 'deepseek']]);
  assert.ok(!pr.max.allowed.includes('openai') && !pr.max.allowed.includes('perplexity'), 'Max بلا GPT في المنتقي');
  assert.deepEqual(tierLib.LANES.groq, { prov: 'groq', direct: true });
  assert.deepEqual(tierLib.LANES.gemini, { prov: 'gemini', direct: true });
});

test('٢. isStrongTurn وturnJob: دردشة · كود · رياضيّات/ملفّ طويل · صورة', () => {
  for (const s of ['هلا كيف الحال', 'اشرح لي الذكاء الاصطناعي باختصار', 'شو أفضل مطعم في دبي', 'ترجم لي هذي الجملة']) { assert.equal(tierLib.isStrongTurn(s), false, s); assert.equal(tierLib.turnJob(s), 'chat', s); }
  for (const s of ['اكتب لي كود بايثون يقرأ ملف', 'ابني لي موقع لمطعم', 'عدّل الكود', 'عندي bug في الدالة', 'شرح ```js\nlet a=1\n```']) assert.equal(tierLib.turnJob(s), 'code', s);
  for (const s of ['احسب لي ضريبة 5% على 2000', 'حلّ المعادلة x^2 - 4 = 0', 'Please solve this equation', 'What is the derivative of x^3', 'ن'.repeat(600)]) assert.equal(tierLib.turnJob(s), 'math', s);
  assert.equal(tierLib.turnJob('هلا', true), 'image');
  assert.equal(tierLib.isStrongTurn(''), false); assert.equal(tierLib.isStrongTurn(null), false);
});

test('٣. planRoute: كلّ وظيفة لمزوّدها، حدود كلود اليوميّة، المنتقي لـMax وحده، والالتقاط بلا كلود', () => {
  const sub = (plan) => ({ tier: 'sub', plan, subscriber: true, cap: 1 });
  for (const t of [null, { tier: 'owner', subscriber: true }, { tier: 'vip', subscriber: true }, { tier: 'free', subscriber: false }, { tier: 'guest', subscriber: false }, { tier: 'sub', plan: 'gold', subscriber: true }]) assert.equal(tierLib.planRoute(t, 'claude', 'اكتب كود'), null);
  const pick = (r) => [r.job, r.prov, r.model, r.direct, r.fallback.map((f) => f.prov).join('>')];
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), 'openai', 'هلا', {}, {})), ['chat', 'groq', '', true, 'gemini>deepseek']);
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), '', 'اكتب كود بايثون', { haiku: 4 }, {})), ['code', 'claude', 'claude-haiku-4-5', false, 'gemini>deepseek>groq']);
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), '', 'اكتب كود بايثون', { haiku: 5 }, {})), ['code', 'deepseek', '', false, 'gemini>groq'], 'بعد ٥ Haiku → DeepSeek');
  assert.equal(tierLib.planRoute(sub('pro'), '', 'اكتب كود بايثون', { haiku: 9 }, {}).model, 'claude-haiku-4-5');
  assert.equal(tierLib.planRoute(sub('pro'), '', 'اكتب كود بايثون', { haiku: 10 }, {}).prov, 'deepseek');
  assert.equal(tierLib.planRoute(sub('pro'), '', 'اكتب كود بايثون', { haiku: 10 }, { SUB_HAIKU_PRO: '20' }).prov, 'claude', 'الحدّ من البيئة');
  assert.deepEqual(pick(tierLib.planRoute(sub('pro'), '', 'احسب لي الفائدة المركبة', {}, {})), ['math', 'deepseek', '', false, 'gemini>groq']);
  assert.deepEqual(pick(tierLib.planRoute(sub('pro'), '', 'شو هذا', {}, {}, true)), ['image', 'gemini', '', true, 'deepseek>groq']);
  assert.equal(tierLib.planRoute(sub('pro'), 'deepseek', 'هلا', {}, {}).prov, 'groq', 'المنتقي لا يغيّر Pro');
  assert.equal(tierLib.planRoute(sub('max'), '', 'هلا', { haiku: 149 }, {}).model, 'claude-haiku-4-5');
  assert.equal(tierLib.planRoute(sub('max'), '', 'هلا', { haiku: 150 }, {}).prov, 'groq', 'بعد ١٥٠ Haiku → Groq');
  assert.equal(tierLib.planRoute(sub('max'), '', 'ابني لي صفحة', {}, {}).model, 'claude-sonnet-5');
  assert.equal(tierLib.planRoute(sub('max'), '', 'ابني لي صفحة', { sonnet: 30 }, {}).model, 'claude-haiku-4-5', 'بعد ٣٠ Sonnet → Haiku');
  assert.equal(tierLib.planRoute(sub('max'), '', 'ابني لي صفحة', { sonnet: 30, haiku: 150 }, {}).prov, 'deepseek');
  assert.equal(tierLib.planRoute(sub('max'), 'deepseek', 'هلا', {}, {}).prov, 'deepseek', 'Max يختار للدردشة');
  assert.equal(tierLib.planRoute(sub('max'), 'openai', 'هلا', {}, {}).model, 'claude-haiku-4-5', 'GPT غير مسموح → افتراضيّ Max');
  assert.equal(tierLib.planRoute(sub('max'), 'claude', 'هلا', { haiku: 150 }, {}).prov, 'groq', 'اختيار كلود يخضع لحدّ Haiku');
  assert.equal(tierLib.planRoute(sub('max'), 'deepseek', 'اكتب كود', {}, {}).model, 'claude-sonnet-5', 'الكود يغلب المنتقي');
  for (const p of ['basic', 'pro', 'max']) assert.equal(tierLib.planRoute(sub(p), '', 'هلا', {}, {}).bucket, 'plan');
});

// ── (٢) chat.js: التوجيه الفعليّ والالتقاط ──
function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function streamResponse(text) {
  const events = [
    { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text || 'تم' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
  ];
  return new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
function oaStream(text) {
  const sse = 'data: ' + JSON.stringify({ model: 'm', choices: [{ delta: { content: text || 'تم' } }] }) + '\n\n'
    + 'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n';
  return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
const DIRECT_RE = /api\.groq\.com|generativelanguage\.googleapis\.com/;
const CHAT_RE = /openrouter\.ai\/api\/v1\/(?:messages|chat)|api\.anthropic\.com|api\.groq\.com\/openai\/v1\/chat|generativelanguage\.googleapis\.com\/v1beta\/openai\/chat/;
const realResolve = tierLib.resolveTier;
async function ask(tier, provider, text, script, extra) {
  const bodies = [];
  const saveFetch = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    const u = String(url);
    const b = options && options.body ? JSON.parse(options.body) : null;
    if (!CHAT_RE.test(u)) return new Response('{}', { status: 404 });
    bodies.push({ url: u, body: b });
    const step = (script || ['ok'])[Math.min(i++, (script || ['ok']).length - 1)];
    if (step === 'ok') return DIRECT_RE.test(u) ? oaStream() : streamResponse();
    return new Response(step, { status: 500 });
  };
  tierLib.resolveTier = async () => tier;
  let written = '';
  const content = (extra && extra.image) ? [{ type: 'text', text }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }] : text;
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content }], token: token('plan-user'), provider } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; tierLib.resolveTier = realResolve; }
  return { bodies, written };
}
const SUB = (plan) => ({ tier: 'sub', plan, cap: 100, subscriber: true });
function withKeys(fn) {
  return async () => {
    process.env.GROQ_API_KEY = 'q-test'; process.env.GEMINI_API_KEY = 'g-test';
    try { await fn(); } finally { delete process.env.GROQ_API_KEY; delete process.env.GEMINI_API_KEY; counts = {}; }
  };
}

test('٤. الخادم: كلّ وظيفة لمزوّدها بمفاتيحه، وحدّ كلود يُعدّ، والسقف في سلّة واحدة، والمالك لا يُمسّ', withKeys(async () => {
  chat.__orQuick.level = 2;
  consumed.length = 0; bumped.length = 0;
  let r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies.length, 1);
  assert.match(r.bodies[0].url, /api\.groq\.com\/openai\/v1\/chat\/completions/, 'دردشة Pro = Groq المباشر');
  assert.equal(r.bodies[0].body.model, 'openai/gpt-oss-120b');
  assert.match(r.written, /"delta":"تم"/);
  assert.deepEqual([consumed.at(-1), bumped.length], ['plan', 0], 'سلّة واحدة، ولا عدّ لكلود');
  r = await ask(SUB('pro'), 'claude', 'اكتب لي كود جافاسكربت يطبع هلا');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-haiku-4.5', 'كود Pro = Haiku');
  assert.deepEqual(bumped, ['plan-haiku']);
  counts = { 'plan-haiku': 10 };
  r = await ask(SUB('pro'), 'claude', 'اكتب لي كود جافاسكربت يطبع هلا');
  assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v4-pro', 'بعد حدّ Haiku → DeepSeek');
  counts = {};
  r = await ask(SUB('basic'), 'openai', 'احسب لي الفائدة المركبة على 1000');
  assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v4-pro', 'الحساب = DeepSeek');
  r = await ask(SUB('basic'), '', 'شو في الصورة', null, { image: true });
  assert.match(r.bodies[0].url, /generativelanguage\.googleapis\.com/, 'الصورة = Gemini المباشر');
  assert.ok(JSON.stringify(r.bodies[0].body.messages).includes('image_url'), 'الصورة تصل');
  r = await ask(SUB('max'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-haiku-4.5');
  r = await ask(SUB('max'), 'gemini', 'ابني لي صفحة هبوط لمطعم');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-sonnet-5', 'الكود في Max = Sonnet ولو اختار مزوّدًا آخر');
  r = await ask(SUB('max'), 'openai', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-haiku-4.5', 'Max لا يختار GPT');
  r = await ask({ tier: 'owner', plan: null, cap: Infinity, subscriber: true }, 'claude', 'اكتب لي كود');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-haiku-4.5', 'المالك على افتراضيّه');
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  try {
    r = await ask(SUB('max'), 'claude', 'اكتب كود بايثون');
    assert.match(r.bodies[0].url, /api\.anthropic\.com/);
    assert.equal(r.bodies[0].body.model, 'claude-sonnet-5');
  } finally { delete process.env.ANTHROPIC_API_KEY; }
}));

test('٥. الخادم: تعطّل مزوّد الوظيفة قبل أوّل حرف → Gemini ثمّ DeepSeek ثمّ Groq بصمت، ثمّ السلسلة المجّانيّة', withKeys(async () => {
  chat.__orQuick.level = 2;
  let r = await ask(SUB('pro'), 'claude', 'اكتب كود بايثون', ['{"error":"insufficient credits"}', 'ok']);
  assert.deepEqual(r.bodies.map((b) => b.body.model), ['anthropic/claude-haiku-4.5', 'gemini-flash-latest']);
  assert.match(r.written, /"delta":"تم"/);
  assert.doesNotMatch(r.written, /"error"|Gemini/, 'بصمت وبلا اسم مزوّد');
  r = await ask(SUB('basic'), '', 'هلا', ['boom', 'boom', 'ok']);
  assert.deepEqual(r.bodies.map((b) => b.body.model), ['openai/gpt-oss-120b', 'gemini-flash-latest', 'deepseek/deepseek-v4-pro']);
  assert.match(r.written, /"delta":"تم"/);
}));

test('٥-ب. بلا مفاتيح مباشرة: Groq وGemini يُتخطّيان (لا انقلاب صامت)، والكلّ معطّل → السلسلة المجّانيّة', async () => {
  chat.__orQuick.level = 2;
  let r = await ask(SUB('basic'), '', 'هلا', ['boom']);
  assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v4-pro', 'بلا مفتاح Groq/Gemini → DeepSeek عبر الوسيط');
  assert.ok(r.bodies.length > 1, 'ثمّ السلسلة المجّانيّة');
  assert.match(r.written, /"fallback":true/, 'الفشل النهائيّ كما كان (v-king-fallback)');
});

test('٦. البنية: التوجيه قبل فحص الحصّة، والالتقاط قبل الهبوط المجّانيّ، والمباشر للمالك Groq/GPT فقط', () => {
  const s = read('api/_lib/chat.js');
  const route = s.indexOf('__planRoute = tierLib.planRoute(__tier, reqProv, lastUserText, ');
  const consume = s.indexOf("const usage = await checkAndConsume(token, guestId, (__tier && !__tier.subscriber) ? 'chat' : ((__planRoute && __planRoute.bucket) || prov)");
  const lastUser = s.indexOf('const lastUserAny = messages.slice().reverse().find(');
  assert.ok(route > 0 && lastUser > 0 && lastUser < route && route < consume, 'الرسالة الأخيرة → التوجيه → الحصّة');
  const bump = s.indexOf("await bumpCount(__planUser, 'plan-' + __planRoute.meter)");
  assert.ok(bump > consume, 'حدّ كلود يُعدّ بعد قبول الحصّة');
  const loop = s.indexOf('while (!upstream.ok && !anyText && __planFallbacks.length) {');
  const finalFail = s.indexOf('if (!upstream.ok) {\n        const errText = (await upstream.text()).slice(0, 300);');
  const quick400 = s.indexOf("await logErrorAndFlush('chat/or-quick-400'");
  assert.ok(loop > 0 && quick400 < loop && loop < finalFail, 'الالتقاط بعد إعادة الحقول السريعة وقبل الفشل النهائيّ');
  assert.ok(s.includes('const applyRoute = (p, model, direct) => {'));
  for (const v of ['let prov', 'let viaOR', 'let apiKey', 'let CHAT_URL', 'let DEFAULT_MODEL']) assert.ok(s.includes(v + ' '), v);
  assert.ok(s.includes("callUpstream = (withImg) => __upFetch(CHAT_URL"), 'callUpstream يقرأ العنوان لحظة النداء');
  assert.ok(s.includes("let __direct = (__ownerReq && (prov === 'groq' || prov === 'openai'))"), 'Gemini ليس في مسار المالك المباشر');
  assert.ok(s.includes('if (!upstream.ok && __direct && __ownerReq && !anyText'), 'سطر «النموذج غير متاح» للمالك وحده');
});

// ── (٣) النقاط والأسعار ──
test('٧. الأسعار: صورة ٢٠ · إبداعيّة ٣٥ · Runway ٥٥ · Veo ٢٧٥ · مها ١٥؛ الفرق الإبداعيّ يُخصم بعد التصنيف ويُردّ كاملًا', () => {
  const { COSTS } = require('../api/_lib/points.js');
  assert.deepEqual([COSTS.image, COSTS.image_creative, COSTS.image_4k, COSTS.runway_video, COSTS.veo_video, COSTS.maha_minute], [20, 35, 30, 55, 275, 15]);
  const mi = read('api/_lib/maha-image.js');
  const creative = mi.indexOf('if (isCreativeEdit && mahaImgCharged && !__pureRaw) {');
  assert.ok(creative > mi.indexOf('const isCreativeEdit = '), 'بعد معرفة النيّة');
  assert.match(mi, /const __extra = Math\.max\(0, pointsLib\.COSTS\.image_creative - mahaImgChargedAmount\);/);
  assert.match(mi, /if \(!__xp\.ok\) \{\n\s+await refundImageCharge\(\);\n\s+res\.status\(402\)\.json\(\{ error: 'points_insufficient', needed: pointsLib\.COSTS\.image_creative/);
  assert.match(mi, /if \(!__xp\.owner\) mahaImgChargedAmount \+= __extra;/, 'الردّ يعيد الأساس والفرق معًا');
  const pts = read('api/_lib/points.js');
  assert.match(pts, /tier: \(__t && __t\.tier\) \|\| 'free',\n\s+plan: \(__t && __t\.plan\) \|\| null,/, 'الرصيد يحمل الباقة');
});

test('٨. الباقات ٣٦٠/٩٢٠/٣٬٢٠٠ متطابقة في Stripe وPayPal، والرزم دفعة واحدة تضيف نقاطًا ولا تغيّر الباقة', () => {
  const parse = (src) => { const out = {}; const re = /(\w+): \{ amount: '?([\d.]+)'?, points: (\d+)(, pack: true)?/g; let m; while ((m = re.exec(src))) out[m[1]] = { amount: Number(m[2]), points: Number(m[3]), pack: !!m[4] }; return out; };
  const stripe = parse(read('api/_lib/create-checkout-session.js'));
  const paypal = parse(read('api/_lib/paypal-order.js'));
  assert.deepEqual(stripe, {
    basic: { amount: 1000, points: 360, pack: false }, pro: { amount: 2000, points: 920, pack: false }, max: { amount: 10000, points: 3200, pack: false },
    pack100: { amount: 499, points: 100, pack: true }, pack300: { amount: 1299, points: 300, pack: true }, pack700: { amount: 2499, points: 700, pack: true }, pack900: { amount: 3499, points: 900, pack: true },
  });
  assert.deepEqual(Object.keys(paypal), Object.keys(stripe));
  for (const k of Object.keys(stripe)) { assert.equal(paypal[k].points, stripe[k].points, k); assert.equal(Math.round(paypal[k].amount * 100), stripe[k].amount, k + ' المبلغ'); assert.equal(paypal[k].pack, stripe[k].pack, k); }
  const amounts = Object.values(paypal).map((p) => p.amount);
  assert.equal(new Set(amounts).size, amounts.length, 'المبالغ مميّزة — الالتقاط يطابق بالمبلغ');
  const ccs = read('api/_lib/create-checkout-session.js');
  assert.match(ccs, /if \(!PLANS\[plan\]\.pack\) \{ user\.plan = plan; user\.planUpdatedAt = Date\.now\(\); \}/);
  // v-checkout-autorenew: الرزمة لا تتجدّد أبدًا، والباقة تتجدّد باختيار صريح فقط (checkout-login يفحص السلوك).
  assert.match(ccs, /const recurring = !planInfo\.pack && autoRenew === true;/);
  assert.match(ccs, /params\.append\('mode', recurring \? 'subscription' : 'payment'\);/);
  assert.match(ccs, /if \(recurring\) params\.append\('line_items\[0\]\[price_data\]\[recurring\]\[interval\]', 'month'\);/);
  const pp = read('api/_lib/paypal-order.js');
  assert.match(pp, /if \(!PLANS\[matchedPlan\]\.pack\) \{ user\.plan = matchedPlan; user\.planUpdatedAt = Date\.now\(\); \}/);
  // العميل: الأزرار الأربعة تفتح نافذة الدفع بنفس الأسعار المعروضة
  const a6 = read('js/app-06-checkout.js');
  assert.match(a6, /const CHECKOUT_PLAN_AMOUNTS = \{ basic: 1000, pro: 2000, max: 10000, pack100: 499, pack300: 1299, pack700: 2499, pack900: 3499(, img_basic: 1021[^}]*)? \};/); // v-media-plans: اشتراكات الصور/الفيديو بعد الرزم
  assert.match(a6, /if\(n > 0 && CHECKOUT_PLAN_AMOUNTS\['pack' \+ n\]\)\{ openCheckout\('pack' \+ n\); return; \}/);
  const ps = read('js/partials-settings.js');
  for (const [n, usd] of [[100, '4.99'], [300, '12.99'], [700, '24.99'], [900, '34.99']]) assert.ok(ps.includes('onclick="buyPointsPack(' + n + ')"') && ps.includes('data-usd="' + usd + '"'), 'زرّ ' + n);
});

// ── (٤) حدود الإساءة ──
function fakeKv() {
  const m = new Map();
  return {
    m,
    kvIncr: async (k) => { m.set(k, (m.get(k) || 0) + 1); return m.get(k); },
    kvDecrBy: async (k, n) => { m.set(k, (m.get(k) || 0) - n); return m.get(k); },
    kvExpire: async () => {},
    kvSetIfAbsent: async (k, v) => { if (m.has(k)) return false; m.set(k, v); return true; },
    kvDel: async (k) => { m.delete(k); },
  };
}
test('٩. abuse-guard: ٢٠ صورة في الساعة ثمّ 429 حتّى الساعة التالية؛ فيديو واحد كلّ ٣ دقائق ويُفكّ عند فشل المزوّد؛ عطب KV = سماح', async () => {
  const g = require('../api/_lib/abuse-guard.js');
  assert.equal(g.IMAGE_HOURLY_MAX, 20); assert.equal(g.VIDEO_COOLDOWN_SEC, 180);
  const kv = fakeKv();
  const now = 1_800_000_000_000;
  for (let i = 1; i <= 20; i++) assert.equal((await g.imageHourlyGuard('Sara', { kv, now })).ok, true, 'صورة ' + i);
  const r = await g.imageHourlyGuard('sara ', { kv, now: now + 60_000 });
  assert.equal(r.ok, false); assert.equal(r.reason, 'image_hourly_limit'); assert.ok(r.retryAfter > 0 && r.retryAfter <= 3600);
  assert.equal([...kv.m.values()][0], 20, 'الرفض لا يعدّ');
  assert.equal((await g.imageHourlyGuard('sara', { kv, now: now + 3_600_000 })).ok, true, 'ساعة جديدة');
  assert.equal((await g.imageHourlyGuard('', { kv, now })).ok, true);
  assert.equal((await g.videoLock('Sara', { kv })).ok, true);
  const v = await g.videoLock('sara', { kv });
  assert.deepEqual([v.ok, v.reason, v.retryAfter], [false, 'video_cooldown', 180]);
  await g.releaseVideoLock('SARA', { kv });
  assert.equal((await g.videoLock('sara', { kv })).ok, true, 'فشل المزوّد يفكّ القفل');
  const broken = { kvIncr: async () => { throw new Error('redis down'); }, kvSetIfAbsent: async () => { throw new Error('redis down'); } };
  assert.equal((await g.imageHourlyGuard('sara', { kv: broken })).ok, true);
  assert.equal((await g.videoLock('sara', { kv: broken })).ok, true);
  // التوصيل: بعد الخصم ولغير المالك/VIP (pay.owner)، ويُردّ الخصم عند الرفض
  const mi = read('api/_lib/maha-image.js');
  assert.match(mi, /mahaImgChargedAmount = __imgCost;\n\s+\/\/ v-plan-routing[^\n]*\n\s+if \(!pay\.owner\) \{\n\s+const __hg = await require\('\.\/abuse-guard\.js'\)\.imageHourlyGuard\(mahaImgUser\);\n\s+if \(!__hg\.ok\) \{\n\s+await refundImageCharge\(\);\n\s+res\.status\(429\)\.json\(\{ error: 'image_hourly_limit'/);
  for (const [f, cost] of [['video-create', 'runway_video'], ['veo-create', 'veo_video']]) {
    const s = read('api/_lib/' + f + '.js');
    assert.match(s, new RegExp("if \\(!pay\\.owner\\) \\{\\n\\s+const __vl = await require\\('\\./abuse-guard\\.js'\\)\\.videoLock\\(\\w+\\);\\n\\s+if \\(!__vl\\.ok\\) \\{\\n\\s+await pointsLib\\.refundPoints\\(\\w+, pointsLib\\.COSTS\\." + cost + "\\);\\n\\s+res\\.status\\(429\\)\\.json\\(\\{ error: 'video_cooldown'"), f);
    assert.match(s, /if \(videoLocked\) await require\('\.\/abuse-guard\.js'\)\.releaseVideoLock\(videoLocked\);/, f + ': الفكّ عند الفشل');
  }
});

// ── (٥) الواجهة ──
test('١٠. منتقي المزوّد: يظهر للمالك وVIP وMax فقط؛ المجّانيّ/الضيف/Plus/Pro مقفول (الخادم يوجّه)', () => {
  const a5 = read('js/app-05-ui.js');
  const i = a5.indexOf('function applyPlanGate(d){');
  const j = a5.indexOf('window.applyPlanGate = applyPlanGate;', i);
  assert.ok(i > 0 && j > i);
  assert.ok(a5.includes('applyPlanGate(data); // v-plan-routing'), 'تُستدعى بنتيجة usage-status');
  assert.ok(read('js/app-06-checkout.js').includes("if(typeof applyPlanGate === 'function') applyPlanGate(d);"), 'وبنتيجة الرصيد');
  const cls = new Set();
  const ctx = { window: {}, document: { documentElement: { classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } } }, __swallow: () => {} };
  vm.runInNewContext(a5.slice(i, j), ctx);
  const locked = (d) => { ctx.applyPlanGate(d); return cls.has('plan-locked'); };
  assert.equal(locked({ tier: 'owner' }), false);
  assert.equal(locked({ tier: 'vip' }), false);
  assert.equal(locked({ tier: 'sub', plan: 'max' }), false);
  assert.equal(locked({ tier: 'sub', plan: 'pro' }), true);
  assert.equal(locked({ tier: 'sub', plan: 'basic' }), true);
  assert.equal(locked({ tier: 'free' }), true);
  assert.equal(locked({ authed: false, remaining: {} }), true, 'ضيف بلا جلسة');
  assert.equal(ctx.window.__omranPlan, 'guest');
  ctx.applyPlanGate({ tier: 'sub', plan: 'max' }); assert.equal(cls.has('plan-locked'), false);
  ctx.applyPlanGate({ remaining: {} }); assert.equal(cls.has('plan-locked'), false, 'بلا طبقة لا تغيير');
  const html = read('index.html');
  assert.ok(html.includes('html.plan-locked #provDropdownBtn, html.plan-locked #provDropdownPanel, html.plan-locked #providerStripMobile{ display:none !important; }'));
  assert.ok(html.includes('/js/partials-settings.js?v=670'), 'وسم الملفّ المنفصل ارتفع'); // v-maha-voice-speed: 660
  assert.ok(Number((read('js/app-04-i18n-state.js').match(/i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]) >= 674, 'وسم ملفّات اللغات ارتفع (نصوص الباقات) — ٦٧٤ فأعلى، كلّ مفتاح جديد يرفعه');
});

test('١١. نصوص الباقات الجديدة في ١٤ لغة، وبلا اسم موديل في وصف النقاط', () => {
  const val = (src, key) => [...src.matchAll(new RegExp('(?:^|[\\s,{])' + key + '\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', 'g'))].map((m) => m[1]);
  const files = ['js/app-03-i18n-data.js'].concat(['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].map((l) => 'i18n/' + l + '.js'));
  const expect = { planFreeFeats: [/5/, /4/, /3/, /class=\\?"off\\?"/], planPlusFeats: [/50/, /24/, /15/, /1/], planProFeats: [/100/, /61/, /40/, /2/], planMaxFeats: [/250/, /213/, /150/, /3/], plFreeMsgs: [/5/], plStMsgs: [/50/], plProMsgs: [/100/], plMaxAllPro: [/250/], plStVideos: [/1|واحد/], plProMedia: [/40/, /2/], plMaxMedia: [/150/, /3/], pricingPointsDesc: [/15/, /20/, /35/, /55/, /275/] };
  for (const f of files) {
    const src = read(f);
    const n = f.startsWith('i18n/') ? 1 : 2;
    for (const [k, res] of Object.entries(expect)) {
      const vs = val(src, k);
      assert.equal(vs.length, n, f + ': ' + k);
      for (const v of vs) { for (const re of res) assert.match(v, re, f + ': ' + k); assert.doesNotMatch(v, /Veo|Runway|Gemini|Claude|GPT/i, f + ': ' + k + ' بلا اسم موديل'); }
      if (/Feats$/.test(k)) for (const v of vs) assert.doesNotMatch(v, /\b(?:20|300|400|460|500|7000|1200)\b/, f + ': ' + k + ' رقم قديم');
    }
  }
  const ps = read('js/partials-settings.js');
  for (const s of ['<b>360</b>', '<b>920</b>', '<b>3,200</b>', '5 رسائل يوميًا', '50 رسالة يوميًا', '100 رسالة يوميًا', '250 رسالة يوميًا', 'صورة إبداعية: 35', 'فيديو: 55', 'فيديو سينمائي: 275']) assert.ok(ps.includes(s), 'partials-settings: ' + s);
  for (const s of ['<b>500</b>', '<b>1,200</b>', '<b>7,000</b>', '10 رسائل يوميًا', 'احترافية يوميًا', 'Veo 3']) assert.ok(!ps.includes(s), 'partials-settings stale: ' + s);
  const ph = read('pricing.html');
  for (const s of ['<b>360</b>', '<b>920</b>', '<b>3,200</b>', '5 رسائل يوميًا', '<div class="val">35</div>', '<div class="val">55</div>', '<div class="val">275</div>', '<th>300 نقطة</th>', 'loc(12.99,x)']) assert.ok(ph.includes(s), 'pricing.html: ' + s);
  for (const s of ['<b>500</b>', '<b>1,200</b>', '<b>7,000</b>', '10 رسائل يوميًا', '<div class="val">60</div>', '<div class="val">400</div>']) assert.ok(!ph.includes(s), 'pricing.html stale: ' + s);
  assert.ok(read('js/app.bundle.js').includes('function applyPlanGate(d){'), 'الحزمة مبنيّة');
});

test('١٢. توثيق البيئة: الأسقف الجديدة وترتيب السلسلة في env.js و.env.example', () => {
  const env = read('api/_lib/env.js');
  assert.ok(env.includes("'بديل: ٥ — رسائل المسجَّل المجاني يوميًّا") && env.includes("'بديل: ١٠٠ — سقف حماية باقة برو") && env.includes("'بديل: ٢٥٠ — سقف حماية باقة ماكس") && env.includes('groq,gemini,mistral,openrouter'));
  const ex = read('.env.example');
  assert.ok(ex.includes('# FREE_DAILY=5 ') && ex.includes('# SUB_DAILY_PRO=100 ') && ex.includes('# SUB_DAILY_MAX=250 ') && ex.includes('# FREE_CHAIN=groq,gemini,mistral,openrouter'));
});
