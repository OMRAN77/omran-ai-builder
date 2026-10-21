// tests/plan-routing.test.cjs — v-plan-routing (٢٠ سبتمبر ٢٠٢٦): جدول الباقات النهائيّ (قرار المالك بعد جلسة الأرباح):
// مجّاني ٥ رسائل على Groq · Plus ٥٠ (DeepSeek) · Pro ١٠٠ (DeepSeek + Haiku للدور القويّ) · Max ٢٥٠ (Haiku + Sonnet)،
// التقاط داخل الباقة قبل السلسلة المجّانيّة، النقاط ٣٦٠/٩٢٠/٣٬٢٠٠، رزم الشحن حقيقيّة، حدّ ٢٠ صورة/ساعة وفيديو/٣ دقائق،
// ومنتقي المزوّد لمن باقته تسمح فقط، ونصوص الباقات في ١٤ لغة.
// v-plan-models (قرار المالك ١٦ أكتوبر ٢٠٢٦): الجدول الآن Plus ‏Luna + Haiku 5.5 بلا مقياس · Pro ‏Gemini 3.8 Flash بحدّ ٤٠ ثمّ موديلات Plus،
// والكود والحساب Mistral Large 3 · Max ‏Sol + Sonnet 5.5 بحدّ مشترك ١٠٠ ثمّ Gemini Flash · الصور Gemini. الالتقاط: باقي موديلات الوظيفة
// غير المقيسة ثمّ Groq ثمّ Gemini؛ وموديل المسار بلا مفتاحه المباشر = الموديل نفسه عبر الوسيط.
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
  // subscriber كما يعيده _usage.js الحقيقيّ (!!tier.subscriber) — احتياط المشترك الأخير يقرؤه (v-plan-models: PAID_NOTE)
  checkAndConsume: async (tok, gid, bucket, ip, o) => { consumed.push(bucket); return { allowed: true, username: 'plan-user', subscriber: !!(o && o.tier && o.tier.subscriber) }; },
  todayCount: async (u, bucket) => counts[bucket] || 0,
  bumpCount: async (u, bucket) => { bumped.push(bucket); },
  // v-meter-atomic: الحجز الذرّيّ — fillOnTake يحاكي طلبًا متزامنًا ملأ المقياس بين القراءة والحجز
  takeMeter: async (u, bucket, cap) => { if (fillOnTake.includes(bucket)) counts[bucket] = cap; if ((counts[bucket] || 0) >= cap) return false; counts[bucket] = (counts[bucket] || 0) + 1; bumped.push(bucket); return true; },
  giveMeter: async (u, bucket) => { given.push(bucket); counts[bucket] = Math.max(0, (counts[bucket] || 0) - 1); },
} };
let counts = {};
let fillOnTake = [];
const consumed = [];
const bumped = [];
const given = [];
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const tierLib = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));

// ── (١) الجدول نفسه ──
test('١. الأسقف الافتراضيّة والسلسلة المجّانيّة تبدأ بـGroq، وجدول الوظائف (v-plan-jobs · v-plan-models)', () => {
  assert.deepEqual(tierLib.caps({}), { guest: 0, free: 20, basic: 50, pro: 100, max: 250 }); // v-free-20
  assert.deepEqual(tierLib.DEFAULT_CHAIN, ['groq', 'gemini', 'mistral', 'openrouter']);
  assert.equal(tierLib.freeChain({ GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' })[0].id, 'groq', 'Groq أوّلًا');
  assert.equal(tierLib.FREE_PROVIDER_SPECS.groq.models[0], 'openai/gpt-oss-20b', 'v-plan-models: المجّانيّ على Groq gpt-oss-20b أوّلًا');
  assert.match(tierLib.FREE_TEXT.guestLimit, /20 رسالة يوميًّا/);
  const pr = tierLib.PLAN_ROUTING;
  assert.deepEqual(Object.keys(pr), ['basic', 'pro', 'max']);
  const jobs = (k) => [pr[k].chat, pr[k].code, pr[k].math, pr[k].image];
  assert.deepEqual(jobs('basic'), [['luna', 'haiku55'], ['haiku55', 'luna'], ['luna', 'haiku55'], ['gemini']], 'Plus: Luna وHaiku 5.5');
  assert.deepEqual(jobs('pro'), [['flash40', 'luna', 'haiku55'], ['large3', 'haiku55', 'luna'], ['large3', 'luna'], ['gemini']], 'Pro: Gemini Flash بحدّ ثمّ موديلات Plus، والكود والحساب Mistral Large 3');
  assert.deepEqual(jobs('max'), [['sol', 'flash', 'luna'], ['sonnet55', 'flash', 'haiku55'], ['sol', 'flash'], ['gemini']], 'Max: Sol وSonnet 5.5 ثمّ Gemini Flash');
  for (const k of ['basic', 'pro', 'max']) assert.deepEqual(pr[k].allowed, [], k + ': بلا منتقي');
  assert.deepEqual(pr.basic.meters, {}, 'Plus بلا مقياس');
  assert.deepEqual(pr.pro.meters, { gemini: ['SUB_GEMINI_PRO', 40] });
  assert.deepEqual(pr.max.meters, { premium: ['SUB_PREMIUM_MAX', 100] }, 'Sol وSonnet 5.5 بحدّ يوميّ مشترك');
  // كلّ مسار في الجدول معرَّف، وكلّ مسار مقيس له سقف في باقته (مقياس بلا سقف = مسار مغلق بصمت)
  for (const [k, r] of Object.entries(pr)) for (const job of ['chat', 'code', 'math', 'image']) for (const n of r[job]) {
    assert.ok(tierLib.LANES[n], k + '.' + job + ': ' + n);
    if (tierLib.LANES[n].meter) assert.ok(r.meters[tierLib.LANES[n].meter], k + ': سقف مقياس ' + n);
  }
  assert.ok(!pr.max.allowed.includes('openai') && !pr.max.allowed.includes('perplexity'), 'Max بلا GPT في المنتقي');
  assert.deepEqual(tierLib.LANES.groq, { prov: 'groq', direct: true });
  assert.deepEqual(tierLib.LANES.gemini, { prov: 'gemini', direct: true });
  assert.deepEqual(tierLib.LANES.luna, { prov: 'openai', model: 'gpt-6-luna', direct: true });
  assert.deepEqual(tierLib.LANES.haiku55, { prov: 'claude', model: 'claude-haiku-5-5' });
  assert.deepEqual(tierLib.LANES.flash40, { prov: 'gemini', model: 'gemini-3.8-flash', direct: true, meter: 'gemini' });
  assert.deepEqual(tierLib.LANES.flash, { prov: 'gemini', model: 'gemini-3.8-flash', direct: true });
  assert.deepEqual(tierLib.LANES.large3, { prov: 'mistral', model: 'mistralai/mistral-large-2512' });
  assert.deepEqual(tierLib.LANES.sol, { prov: 'openai', model: 'gpt-6-sol', direct: true, meter: 'premium' });
  assert.deepEqual(tierLib.LANES.sonnet55, { prov: 'claude', model: 'claude-sonnet-5-5', meter: 'premium' });
});

test('٢. isStrongTurn وturnJob: دردشة · كود · رياضيّات/ملفّ طويل · صورة', () => {
  for (const s of ['هلا كيف الحال', 'اشرح لي الذكاء الاصطناعي باختصار', 'شو أفضل مطعم في دبي', 'ترجم لي هذي الجملة']) { assert.equal(tierLib.isStrongTurn(s), false, s); assert.equal(tierLib.turnJob(s), 'chat', s); }
  for (const s of ['اكتب لي كود بايثون يقرأ ملف', 'ابني لي موقع لمطعم', 'عدّل الكود', 'عندي bug في الدالة', 'شرح ```js\nlet a=1\n```']) assert.equal(tierLib.turnJob(s), 'code', s);
  for (const s of ['احسب لي ضريبة 5% على 2000', 'حلّ المعادلة x^2 - 4 = 0', 'Please solve this equation', 'What is the derivative of x^3', 'ن'.repeat(600)]) assert.equal(tierLib.turnJob(s), 'math', s);
  assert.equal(tierLib.turnJob('هلا', true), 'image');
  assert.equal(tierLib.isStrongTurn(''), false); assert.equal(tierLib.isStrongTurn(null), false);
});

test('٣. planRoute: كلّ وظيفة لموديلها، حدود المقاييس اليوميّة، المنتقي لا يغيّر أيّ باقة (v-providers-owner)، والالتقاط بلا مسار مقيس', async () => {
  const sub = (plan) => ({ tier: 'sub', plan, subscriber: true, cap: 1 });
  for (const t of [null, { tier: 'owner', subscriber: true }, { tier: 'vip', subscriber: true }, { tier: 'free', subscriber: false }, { tier: 'guest', subscriber: false }, { tier: 'sub', plan: 'gold', subscriber: true }]) assert.equal(tierLib.planRoute(t, 'claude', 'اكتب كود'), null);
  const fb = (r) => r.fallback.map((f) => f.prov + (f.model ? ':' + f.model : '')).join('>');
  const pick = (r) => [r.job, r.prov, r.model, r.direct, r.meter, fb(r)];
  const LUNA = 'openai:gpt-6-luna', H55 = 'claude:claude-haiku-5-5', FLASH = 'gemini:gemini-3.8-flash';
  // Plus: ‏Luna للدردشة والحساب، Haiku 5.5 للكود — بلا مقياس
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), 'openai', 'هلا', {}, {})), ['chat', 'openai', 'gpt-6-luna', true, '', H55 + '>groq>gemini']);
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), 'claude', 'هلا', {}, {})), ['chat', 'openai', 'gpt-6-luna', true, '', H55 + '>groq>gemini'], 'المنتقي لا يغيّر Plus');
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), '', 'اكتب كود بايثون', {}, {})), ['code', 'claude', 'claude-haiku-5-5', false, '', LUNA + '>groq>gemini']);
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), '', 'اكتب كود بايثون', { haiku: 999, sonnet: 999, gemini: 999, premium: 999 }, {})), ['code', 'claude', 'claude-haiku-5-5', false, '', LUNA + '>groq>gemini'], 'Plus بلا مقياس: لا عدّاد يغيّر مساره');
  assert.deepEqual(pick(tierLib.planRoute(sub('basic'), '', 'احسب لي الفائدة المركبة', {}, {})), ['math', 'openai', 'gpt-6-luna', true, '', H55 + '>groq>gemini']);
  // Pro: ‏Gemini 3.8 Flash بحدّ ٤٠ ثمّ موديلات Plus؛ الكود والحساب Mistral Large 3 عبر الوسيط
  assert.deepEqual(pick(tierLib.planRoute(sub('pro'), '', 'هلا', { gemini: 39 }, {})), ['chat', 'gemini', 'gemini-3.8-flash', true, 'gemini', LUNA + '>' + H55 + '>groq>gemini']);
  assert.equal(tierLib.planRoute(sub('pro'), '', 'هلا', {}, {}).meterCap, 40);
  assert.deepEqual(pick(tierLib.planRoute(sub('pro'), '', 'هلا', { gemini: 40 }, {})), ['chat', 'openai', 'gpt-6-luna', true, '', H55 + '>groq>gemini'], 'بعد ٤٠ Gemini → Luna');
  const proEnv = tierLib.planRoute(sub('pro'), '', 'هلا', { gemini: 40 }, { SUB_GEMINI_PRO: '60' });
  assert.deepEqual([proEnv.prov, proEnv.model, proEnv.meterCap], ['gemini', 'gemini-3.8-flash', 60], 'الحدّ من البيئة');
  assert.deepEqual(pick(tierLib.planRoute(sub('pro'), '', 'اكتب كود بايثون', {}, {})), ['code', 'mistral', 'mistralai/mistral-large-2512', false, '', H55 + '>' + LUNA + '>groq>gemini']);
  assert.deepEqual(pick(tierLib.planRoute(sub('pro'), '', 'احسب لي الفائدة المركبة', {}, {})), ['math', 'mistral', 'mistralai/mistral-large-2512', false, '', LUNA + '>groq>gemini']);
  assert.deepEqual(pick(tierLib.planRoute(sub('pro'), '', 'شو هذا', {}, {}, true)), ['image', 'gemini', '', true, '', 'groq'], 'الصورة Gemini (Groq الأعمى يُرشَّح في chat.js)');
  assert.equal(tierLib.planRoute(sub('pro'), 'deepseek', 'هلا', {}, {}).model, 'gemini-3.8-flash', 'المنتقي لا يغيّر Pro');
  assert.equal(tierLib.planRoute(sub('pro'), 'gemini', 'هلا', { gemini: 40 }, {}).model, 'gpt-6-luna', 'اختيار Gemini لا يعبر حدّه');
  // Max: ‏Sol للدردشة والحساب وSonnet 5.5 للكود بحدّ مشترك ١٠٠، ثمّ Gemini Flash
  assert.deepEqual(pick(tierLib.planRoute(sub('max'), '', 'هلا', { premium: 99 }, {})), ['chat', 'openai', 'gpt-6-sol', true, 'premium', FLASH + '>' + LUNA + '>groq>gemini']);
  assert.equal(tierLib.planRoute(sub('max'), '', 'هلا', {}, {}).meterCap, 100);
  assert.deepEqual(pick(tierLib.planRoute(sub('max'), '', 'هلا', { premium: 100 }, {})), ['chat', 'gemini', 'gemini-3.8-flash', true, '', LUNA + '>groq>gemini'], 'بعد ١٠٠ → Gemini Flash');
  assert.deepEqual(pick(tierLib.planRoute(sub('max'), '', 'ابني لي صفحة', {}, {})), ['code', 'claude', 'claude-sonnet-5-5', false, 'premium', FLASH + '>' + H55 + '>groq>gemini']);
  assert.deepEqual(pick(tierLib.planRoute(sub('max'), '', 'ابني لي صفحة', { premium: 100 }, {})), ['code', 'gemini', 'gemini-3.8-flash', true, '', H55 + '>groq>gemini'], 'الحدّ مشترك: بعد ١٠٠ Sol/Sonnet → Gemini Flash');
  assert.deepEqual(pick(tierLib.planRoute(sub('max'), '', 'احسب لي الفائدة المركبة', {}, {})), ['math', 'openai', 'gpt-6-sol', true, 'premium', FLASH + '>groq>gemini']);
  assert.deepEqual(pick(tierLib.planRoute(sub('max'), '', 'احسب لي الفائدة المركبة', { premium: 100 }, {})), ['math', 'gemini', 'gemini-3.8-flash', true, '', 'groq>gemini']);
  assert.equal(tierLib.planRoute(sub('max'), '', 'ابني لي صفحة', { premium: 100 }, { SUB_PREMIUM_MAX: '150' }).model, 'claude-sonnet-5-5', 'الحدّ من البيئة');
  assert.equal(tierLib.planRoute(sub('max'), 'deepseek', 'هلا', {}, {}).model, 'gpt-6-sol', 'v-providers-owner: اختيار Max القديم المحفوظ لا يغيّر جدوله');
  assert.equal(tierLib.planRoute(sub('max'), 'claude', 'هلا', {}, {}).model, 'gpt-6-sol', 'كلود من المنتقي لا يقلب دردشة Max');
  assert.equal(tierLib.planRoute(sub('max'), 'openai', 'هلا', { premium: 100 }, {}).model, 'gemini-3.8-flash', 'اختيار GPT لا يعبر الحدّ المشترك');
  assert.equal(tierLib.planRoute(sub('max'), 'claude', 'هلا', { premium: 100 }, {}).prov, 'gemini', 'اختيار كلود يخضع للحدّ المشترك');
  assert.equal(tierLib.planRoute(sub('max'), 'deepseek', 'اكتب كود', {}, {}).model, 'claude-sonnet-5-5', 'الكود يغلب المنتقي');
  // كلّ باقة وكلّ وظيفة: سلّة واحدة، والالتقاط بلا مسار مقيس (لا حجز له) ولا تكرار، وذيله Groq ثمّ Gemini
  for (const p of ['basic', 'pro', 'max']) for (const [s, img] of [['هلا'], ['اكتب كود بايثون'], ['احسب لي الفائدة المركبة'], ['شو هذا', true]]) for (const used of [{}, { gemini: 999, premium: 999 }]) {
    const r = tierLib.planRoute(sub(p), '', s, used, {}, img);
    const at = p + '/' + r.job + '/' + JSON.stringify(used);
    assert.equal(r.bucket, 'plan', at);
    assert.ok(r.fallback.every((f) => !f.meter), at + ': الالتقاط بلا مسار مقيس');
    const keys = [r.prov + '|' + r.model].concat(r.fallback.map((f) => f.prov + '|' + (f.model || '')));
    assert.equal(new Set(keys).size, keys.length, at + ': بلا تكرار');
    const tail = ['groq', 'gemini'].filter((x) => !(r.prov === x && !r.model));
    assert.deepEqual(r.fallback.slice(-tail.length).map((f) => f.prov + (f.model ? ':' + f.model : '')), tail, at + ': ذيل الالتقاط');
    if (r.meter) assert.ok((Number(used[r.meter]) || 0) < r.meterCap, at + ': مسار مقيس ممتلئ لا يُختار');
  }
  // planUsedCounts: عدّادات 'plan-<المقياس>' لمقاييس الباقة وحدها
  const reads = [];
  const tc = async (u, b) => { reads.push(u + ':' + b); return ({ 'plan-gemini': 7, 'plan-premium': 3, 'plan-haiku': 50 })[b] || 0; };
  assert.deepEqual(await tierLib.planUsedCounts('sara', 'pro', tc), { gemini: 7 });
  assert.deepEqual(await tierLib.planUsedCounts('sara', 'MAX', tc), { premium: 3 });
  assert.deepEqual(await tierLib.planUsedCounts('sara', 'basic', tc), {});
  assert.deepEqual(await tierLib.planUsedCounts('sara', 'gold', tc), {});
  assert.deepEqual(reads, ['sara:plan-gemini', 'sara:plan-premium'], 'لا قراءة لعدّاد خارج الباقة');
  assert.equal(tierLib.planRoute(sub('pro'), '', 'هلا', await tierLib.planUsedCounts('sara', 'pro', async () => 40), {}).model, 'gpt-6-luna', 'العدّاد المقروء يحكم المسار');
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
// v-plan-models: ‏Luna/Sol على مفتاح OpenAI المباشر تذهب إلى /v1/responses (أحداث response.*)
function respStream(text) {
  const evs = [{ type: 'response.created', response: { model: 'm' } }, { type: 'response.output_text.delta', output_index: 0, delta: text || 'تم' }, { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 1 } } }];
  return new Response(evs.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
const DIRECT_RE = /api\.groq\.com|generativelanguage\.googleapis\.com/;
const RESP_RE = /api\.openai\.com\/v1\/responses/;
const CHAT_RE = /openrouter\.ai\/api\/v1\/(?:messages|chat)|api\.anthropic\.com|api\.groq\.com\/openai\/v1\/chat|generativelanguage\.googleapis\.com\/v1beta\/openai\/chat|api\.openai\.com\/v1\/responses/;
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
    if (step === 'ok') return RESP_RE.test(u) ? respStream() : DIRECT_RE.test(u) ? oaStream() : streamResponse();
    if (step && typeof step === 'object') return new Response(step.body, { status: step.status }); // { status, body }: فشل بحالة محدّدة (429…)
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
    try { await fn(); } finally { delete process.env.GROQ_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; counts = {}; fillOnTake = []; }
  };
}

test('٤. الخادم: كلّ وظيفة لموديلها بمفاتيحه، والمقياس يُحجز لمساره، والسقف في سلّة واحدة، والمالك لا يُمسّ', withKeys(async () => {
  chat.__orQuick.level = 2;
  consumed.length = 0; bumped.length = 0;
  const models = (r) => r.bodies.map((b) => b.body.model);
  let r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies.length, 1);
  assert.match(r.bodies[0].url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions/, 'دردشة Pro = Gemini المباشر');
  assert.equal(r.bodies[0].body.model, 'gemini-3.8-flash', 'موديل المسار لا افتراضيّ المزوّد');
  assert.match(r.written, /"delta":"تم"/);
  assert.deepEqual([consumed.at(-1), bumped], ['plan', ['plan-gemini']], 'سلّة واحدة، ومقياس Gemini يُحجز لمساره');
  bumped.length = 0;
  r = await ask(SUB('pro'), 'claude', 'اكتب لي كود جافاسكربت يطبع هلا');
  assert.match(r.bodies[0].url, /openrouter\.ai\/api\/v1\/messages/);
  assert.deepEqual(models(r), ['mistralai/mistral-large-2512'], 'كود Pro = Mistral Large 3 عبر الوسيط (slug المسار)');
  assert.deepEqual([consumed.at(-1), bumped], ['plan', []], 'Mistral بلا مقياس');
  counts = { 'plan-gemini': 40 };
  r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.deepEqual(models(r), ['openai/gpt-6-luna'], 'بعد حدّ Gemini → Luna (بلا مفتاح OpenAI: الموديل نفسه عبر الوسيط)');
  assert.match(r.bodies[0].url, /openrouter\.ai/);
  assert.deepEqual(bumped, [], 'لا حجز فوق الحدّ');
  counts = {};
  r = await ask(SUB('basic'), 'openai', 'احسب لي الفائدة المركبة على 1000');
  assert.deepEqual(models(r), ['openai/gpt-6-luna'], 'حساب Plus = Luna');
  r = await ask(SUB('basic'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.deepEqual(models(r), ['openai/gpt-6-luna'], 'دردشة Plus = Luna ولو اختار كلود');
  r = await ask(SUB('basic'), 'claude', 'اكتب لي كود جافاسكربت يطبع هلا');
  assert.deepEqual(models(r), ['anthropic/claude-haiku-5.5'], 'كود Plus = Haiku 5.5');
  assert.deepEqual(bumped, [], 'Plus بلا مقياس');
  r = await ask(SUB('basic'), '', 'شو في الصورة', null, { image: true });
  assert.match(r.bodies[0].url, /generativelanguage\.googleapis\.com/, 'الصورة = Gemini المباشر');
  assert.ok(JSON.stringify(r.bodies[0].body.messages).includes('image_url'), 'الصورة تصل');
  r = await ask(SUB('max'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.deepEqual(models(r), ['openai/gpt-6-sol'], 'دردشة Max = Sol');
  assert.deepEqual(bumped, ['plan-premium'], 'الحدّ المشترك يُحجز');
  r = await ask(SUB('max'), 'gemini', 'ابني لي صفحة هبوط لمطعم');
  assert.deepEqual(models(r), ['anthropic/claude-sonnet-5.5'], 'الكود في Max = Sonnet 5.5 ولو اختار مزوّدًا آخر');
  assert.deepEqual(bumped, ['plan-premium', 'plan-premium'], 'Sol وSonnet من الحدّ نفسه');
  r = await ask(SUB('max'), 'deepseek', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.deepEqual(models(r), ['openai/gpt-6-sol'], 'منتقي Max لا يغيّر جدوله');
  counts = { 'plan-premium': 100 }; bumped.length = 0;
  r = await ask(SUB('max'), 'claude', 'ابني لي صفحة هبوط لمطعم');
  assert.match(r.bodies[0].url, /generativelanguage\.googleapis\.com/);
  assert.deepEqual([models(r), bumped], [['gemini-3.8-flash'], []], 'بعد الحدّ المشترك → Gemini Flash المباشر بلا حجز');
  counts = {};
  r = await ask({ tier: 'owner', plan: null, cap: Infinity, subscriber: true }, 'claude', 'اكتب لي كود');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-haiku-4.5', 'المالك على افتراضيّه');
  assert.equal(consumed.at(-1), 'claude', 'المالك خارج سلّة الباقة');
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  try {
    r = await ask(SUB('max'), 'claude', 'اكتب كود بايثون');
    assert.match(r.bodies[0].url, /api\.anthropic\.com/);
    assert.equal(r.bodies[0].body.model, 'claude-sonnet-5-5');
    r = await ask(SUB('basic'), 'claude', 'اكتب كود بايثون');
    assert.match(r.bodies[0].url, /api\.anthropic\.com/);
    assert.equal(r.bodies[0].body.model, 'claude-haiku-5-5');
  } finally { delete process.env.ANTHROPIC_API_KEY; }
  process.env.OPENAI_API_KEY = 'oa-test'; bumped.length = 0;
  try {
    r = await ask(SUB('max'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
    assert.deepEqual([r.bodies.length, r.bodies[0].url, r.bodies[0].body.model], [1, 'https://api.openai.com/v1/responses', 'gpt-6-sol'], 'Sol على مفتاح OpenAI المباشر');
    assert.match(r.written, /"delta":"تم"/);
    assert.deepEqual(bumped, ['plan-premium']);
    r = await ask(SUB('basic'), '', 'هلا');
    assert.deepEqual([r.bodies[0].url, r.bodies[0].body.model], ['https://api.openai.com/v1/responses', 'gpt-6-luna'], 'Luna على المفتاح المباشر');
  } finally { delete process.env.OPENAI_API_KEY; }
}));

test('٥. الخادم: تعطّل موديل الوظيفة قبل أوّل حرف → باقي موديلات الوظيفة ثمّ Groq ثمّ Gemini بصمت، ثمّ السلسلة المجّانيّة', withKeys(async () => {
  chat.__orQuick.level = 2;
  bumped.length = 0; given.length = 0;
  const models = (r) => r.bodies.map((b) => b.body.model);
  let r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار', ['{"error":"insufficient credits"}', 'ok']);
  assert.deepEqual(models(r), ['gemini-3.8-flash', 'openai/gpt-6-luna']);
  assert.deepEqual([bumped, given], [['plan-gemini'], ['plan-gemini']], 'v-meter-atomic: Gemini لم يخدم — حجزه يُردّ');
  assert.match(r.written, /"delta":"تم"/);
  assert.doesNotMatch(r.written, /"error"|Gemini|GPT|OpenAI|Luna/, 'بصمت وبلا اسم مزوّد');
  bumped.length = 0; given.length = 0;
  r = await ask(SUB('max'), '', 'ابني لي صفحة هبوط لمطعم', ['boom', 'ok']);
  assert.deepEqual(models(r), ['anthropic/claude-sonnet-5.5', 'gemini-3.8-flash']);
  assert.deepEqual([bumped, given], [['plan-premium'], ['plan-premium']], 'Sonnet لم يخدم — الحدّ المشترك يُردّ');
  assert.match(r.written, /"delta":"تم"/);
  bumped.length = 0; given.length = 0;
  r = await ask(SUB('pro'), 'claude', 'اكتب كود بايثون', ['{"error":"insufficient credits"}', 'ok']);
  assert.deepEqual(models(r), ['mistralai/mistral-large-2512', 'anthropic/claude-haiku-5.5'], 'كود Pro: Mistral ثمّ Haiku 5.5');
  assert.deepEqual([bumped, given], [[], []], 'بلا مقياس لا حجز ولا ردّ');
  r = await ask(SUB('basic'), '', 'هلا', ['boom', 'boom', 'ok']);
  assert.deepEqual(models(r), ['openai/gpt-6-luna', 'anthropic/claude-haiku-5.5', 'openai/gpt-oss-120b']);
  assert.match(r.bodies[2].url, /api\.groq\.com/, 'ثمّ Groq المباشر');
  assert.match(r.written, /"delta":"تم"/);
  // v-plan-models: حدود Groq لكلّ موديل — 429 على موديل يجرّب التالي قبل أن يخرج من Groq
  const busy = { status: 429, body: '{"error":{"message":"Rate limit reached for model on tokens per day (TPD)","type":"tokens","code":"rate_limit_exceeded"}}' };
  r = await ask(SUB('basic'), '', 'هلا', ['boom', 'boom', busy, 'ok']);
  assert.deepEqual(models(r), ['openai/gpt-6-luna', 'anthropic/claude-haiku-5.5', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'], 'Groq المزدحم → موديل Groq التالي');
  assert.ok(r.bodies.slice(2).every((b) => /api\.groq\.com/.test(b.url)), 'داخل Groq');
  assert.match(r.written, /"delta":"تم"/);
  r = await ask(SUB('basic'), '', 'هلا', ['boom', 'boom', 'boom', 'ok']);
  assert.deepEqual(models(r), ['openai/gpt-6-luna', 'anthropic/claude-haiku-5.5', 'openai/gpt-oss-120b', 'gemini-flash-latest'], 'ثمّ Gemini');
  assert.match(r.bodies[3].url, /generativelanguage\.googleapis\.com/);
  assert.match(r.written, /"delta":"تم"/);
}));

test('٥-ج. v-meter-atomic: مقياس امتلأ بين القراءة والحجز (طلب متزامن) → المسار التالي بلا عبور الحدّ، والسلّة نفسها', withKeys(async () => {
  chat.__orQuick.level = 2;
  consumed.length = 0; bumped.length = 0; given.length = 0;
  const models = (r) => r.bodies.map((b) => b.body.model);
  fillOnTake = ['plan-gemini'];
  let r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.deepEqual(models(r), ['openai/gpt-6-luna'], 'لا نداء Gemini Flash فوق حدّه');
  assert.equal(counts['plan-gemini'], 40, 'المقياس عند حدّه لا فوقه');
  assert.deepEqual([consumed, bumped, given], [['plan'], [], []], 'حصّة واحدة في سلّة الباقة، ولا حجز ولا ردّ');
  // Max: الحدّ المشترك امتلأ للتوّ ← Gemini Flash (بلا مقياس) يخدم الكود والدردشة، ولا حجز
  counts = {}; fillOnTake = ['plan-premium']; consumed.length = 0;
  r = await ask(SUB('max'), 'claude', 'ابني لي صفحة هبوط لمطعم');
  assert.deepEqual(models(r), ['gemini-3.8-flash'], 'لا نداء Sonnet فوق حدّه');
  assert.match(r.bodies[0].url, /generativelanguage\.googleapis\.com/);
  assert.deepEqual([consumed, bumped, given], [['plan'], [], []]);
  assert.equal(counts['plan-premium'], 100);
  counts = {}; fillOnTake = ['plan-premium'];
  r = await ask(SUB('max'), '', 'هلا');
  assert.deepEqual(models(r), ['gemini-3.8-flash'], 'لا نداء Sol فوق حدّه');
  assert.deepEqual([bumped, given, counts['plan-premium']], [[], [], 100]);
}));

test('٥-ب. بلا مفاتيح مباشرة: Groq وGemini العامّان يُتخطّيان (لا انقلاب صامت)، وموديل المسار نفسه عبر الوسيط، والكلّ معطّل → السلسلة المجّانيّة', async () => {
  chat.__orQuick.level = 2;
  bumped.length = 0;
  const models = (r) => r.bodies.map((b) => b.body.model);
  try {
    let r = await ask(SUB('basic'), '', 'هلا', ['boom']);
    assert.deepEqual(models(r).slice(0, 2), ['openai/gpt-6-luna', 'anthropic/claude-haiku-5.5'], 'بلا مفتاح OpenAI → Luna نفسها عبر الوسيط ثمّ Haiku 5.5');
    assert.ok(r.bodies.every((b) => !DIRECT_RE.test(b.url)), 'لا نداء Groq/Gemini بلا مفتاح');
    assert.ok(r.bodies.length > 2, 'ثمّ السلسلة المجّانيّة');
    assert.match(r.written, /"fallback":true/, 'الفشل النهائيّ كما كان (v-king-fallback)');
    const fc = JSON.stringify(r.bodies.slice(2).map((b) => b.body));
    assert.ok(fc.includes('[تنبيه — إلزامي]'), 'v-plan-models: احتياط المشترك بالملاحظة المحايدة');
    assert.ok(!fc.includes('النسخة الاحترافية'), 'v-plan-models: لا «النسخة الاحترافيّة» لمن يدفع');
    // Gemini 3.8 Flash وSol بلا مفتاحيهما → الموديل نفسه عبر الوسيط، والمقياس يُحجز كما هو
    r = await ask(SUB('pro'), '', 'هلا');
    assert.match(r.bodies[0].url, /openrouter\.ai/);
    assert.deepEqual([models(r), bumped], [['google/gemini-3.8-flash'], ['plan-gemini']]);
    r = await ask(SUB('max'), '', 'هلا');
    assert.deepEqual([models(r), bumped], [['openai/gpt-6-sol'], ['plan-gemini', 'plan-premium']]);
  } finally { counts = {}; fillOnTake = []; }
});

test('٦. البنية: التوجيه قبل فحص الحصّة، والالتقاط قبل الهبوط المجّانيّ، والمباشر للمالك Groq/GPT فقط', () => {
  const s = read('api/_lib/chat.js');
  const route = s.indexOf('__planRoute = tierLib.planRoute(__tier, reqProv, lastUserText, ');
  const consume = s.indexOf("const usage = await checkAndConsume(token, guestId, (__tier && !__tier.subscriber) ? 'chat' : ((__planRoute && __planRoute.bucket) || prov)");
  const lastUser = s.indexOf('const lastUserAny = messages.slice().reverse().find(');
  assert.ok(route > 0 && lastUser > 0 && lastUser < route && route < consume, 'الرسالة الأخيرة → التوجيه → الحصّة');
  const bump = s.indexOf("if (await takeMeter(__planUser, __mb, __planRoute.meterCap))"); // v-meter-atomic: حجز ذرّيّ لا فحص ثمّ زيادة
  assert.ok(bump > consume, 'حدّ كلود يُحجز بعد قبول الحصّة');
  assert.ok(!/bumpCount\(/.test(s), 'لا زيادة بعد الفحص في chat.js');
  const loop = s.indexOf('while (!upstream.ok && !anyText && __planFallbacks.length) {');
  const finalFail = s.indexOf('if (!upstream.ok) {\n        const errText = (await upstream.text()).slice(0, 300);');
  const quick400 = s.indexOf("await logErrorAndFlush('chat/or-quick-400'");
  assert.ok(loop > 0 && quick400 < loop && loop < finalFail, 'الالتقاط بعد إعادة الحقول السريعة وقبل الفشل النهائيّ');
  assert.ok(s.includes('const applyRoute = (p, model, direct, forceOR) => {')); // v-owner-swap: كلود عبر الوسيط حين يفشل مفتاحه المباشر
  for (const v of ['let prov', 'let viaOR', 'let apiKey', 'let CHAT_URL', 'let DEFAULT_MODEL']) assert.ok(s.includes(v + ' '), v);
  assert.ok(s.includes("callUpstream = (withImg) => __upFetch(CHAT_URL"), 'callUpstream يقرأ العنوان لحظة النداء');
  // v-gemini-direct: Gemini على مفتاح Google للمالك كـGPT/Groq/Kimi · v-pplx-agent: وPerplexity (Agent API)
  assert.ok(s.includes("let __direct = (__ownerReq && (prov === 'groq' || prov === 'openai' || prov === 'kimi' /* v-kimi */ || prov === 'gemini' /* v-gemini-direct */ || reqProv === 'perplexity'))"), 'Gemini في مسار المالك المباشر');
  assert.ok(s.includes('if (!upstream.ok && __direct && __ownerReq && !anyText'), 'سطر «النموذج غير متاح» للمالك وحده');
});

// ── (٣) النقاط والأسعار ──
test('٧. الأسعار: صورة ٢٠ · إبداعيّة ٣٥ · Runway ٥٥ · Veo ٢٧٥ · مها ١٥؛ الفرق الإبداعيّ يُخصم بعد التصنيف ويُردّ كاملًا', () => {
  const { COSTS } = require('../api/_lib/points.js');
  assert.deepEqual([COSTS.image, COSTS.image_creative, COSTS.image_4k, COSTS.runway_video, COSTS.veo_video, COSTS.maha_minute], [20, 35, 30, 55, 175, 15]); // v-fair-video: Veo 275→175
  assert.equal(COSTS.omni_video, 120, 'v-fair-video: السينمائيّ 350→120 (≈ ٣ أضعاف تكلفته كبقيّة الخدمات)');
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
    pack100: { amount: 499, points: 100, pack: true }, pack300: { amount: 1299, points: 300, pack: true }, pack700: { amount: 2499, points: 700, pack: true }, pack900: { amount: 3499, points: 1050, pack: true }, // v-fair-video: ١٬٠٥٠ بالسعر نفسه
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
  // v-paypal-honest: PayPal يشحن بـgrantPlanToUser نفسها (الرزمة لا تمسّ الباقة هناك — مُختبَر أعلاه في ccs).
  assert.match(pp, /grantPlanToUser\(username, m\.plan, 'lastPaypalOrderId', order\.id\)/);
  // العميل: الأزرار الأربعة تفتح نافذة الدفع بنفس الأسعار المعروضة
  const a6 = read('js/app-06-checkout.js');
  assert.match(a6, /const CHECKOUT_PLAN_AMOUNTS = \{ basic: 1000, pro: 2000, max: 10000, pack100: 499, pack300: 1299, pack700: 2499, pack900: 3499(, maha_basic: 1021[^}]*)? \};/); // v-media-plans: اشتراكات الوسائط بعد الرزم (v-media-merge: مها و«صور وفيديو»؛ img_/vid_ خرجت)
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
    assert.match(s, new RegExp("if \\(!pay\\.owner\\) \\{\\n\\s+const __vl = await require\\('\\./abuse-guard\\.js'\\)\\.videoLock\\(\\w+\\);\\n\\s+if \\(!__vl\\.ok\\) \\{\\n\\s+await pointsLib\\.refundPoints\\(\\w+, pointsLib\\.COSTS\\." + cost + ", pay\\); chargedUser = null;[^\\n]*\\n\\s+res\\.status\\(429\\)\\.json\\(\\{ error: 'video_cooldown'"), f);
    assert.match(s, /if \(videoLocked\) await require\('\.\/abuse-guard\.js'\)\.releaseVideoLock\(videoLocked\);/, f + ': الفكّ عند الفشل');
  }
});

// ── (٥) الواجهة ──
test('١٠. منتقي المزوّد: يظهر للمالك وحده (v-providers-owner)؛ VIP وكلّ الباقات والمجّانيّ والضيف مقفول (الخادم يوجّه)', () => {
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
  assert.equal(locked({ tier: 'vip' }), true, 'v-providers-owner: VIP بلا منتقٍ');
  assert.equal(locked({ tier: 'sub', plan: 'max' }), true, 'v-providers-owner: Max بلا منتقٍ');
  assert.equal(locked({ tier: 'sub', plan: 'pro' }), true);
  assert.equal(locked({ tier: 'sub', plan: 'basic' }), true);
  assert.equal(locked({ tier: 'free' }), true);
  assert.equal(locked({ authed: false, remaining: {} }), true, 'ضيف بلا جلسة');
  assert.equal(ctx.window.__omranPlan, 'guest');
  ctx.applyPlanGate({ tier: 'owner' }); assert.equal(cls.has('plan-locked'), false);
  ctx.applyPlanGate({ remaining: {} }); assert.equal(cls.has('plan-locked'), false, 'بلا طبقة لا تغيير');
  const html = read('index.html');
  assert.ok(html.includes('html.plan-locked #provDropdownBtn, html.plan-locked #provDropdownPanel, html.plan-locked #providerStripMobile{ display:none !important; }'));
  assert.ok(html.includes('/js/partials-settings.js?v=703'), 'وسم الملفّ المنفصل ارتفع'); // v-maha-voice-speed: 660
  assert.ok(Number((read('js/app-04-i18n-state.js').match(/i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]) >= 674, 'وسم ملفّات اللغات ارتفع (نصوص الباقات) — ٦٧٤ فأعلى، كلّ مفتاح جديد يرفعه');
});

test('١١. نصوص الباقات الجديدة في ١٤ لغة، وبلا اسم موديل في وصف النقاط', () => {
  const val = (src, key) => [...src.matchAll(new RegExp('(?:^|[\\s,{])' + key + '\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', 'g'))].map((m) => m[1]);
  const files = ['js/app-03-i18n-data.js'].concat(['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].map((l) => 'i18n/' + l + '.js'));
  const expect = { planFreeFeats: [/20/, /4/, /class=\\?"off\\?"/], planPlusFeats: [/50/, /24/], planProFeats: [/100/, /61/], planMaxFeats: [/250/, /213/], plFreeMsgs: [/20/], plStMsgs: [/50/], plProMsgs: [/100/], plMaxAllPro: [/250/], plStVideos: [/^["'][^0-9]+["']$/], plProMedia: [/^["'][^0-9]+["']$/], plMaxMedia: [/^["'][^0-9]+["']$/], pricingPointsDesc: [/15/, /20/, /35/, /55/, /175/, /120/] }; // v-fair-video؛ v-media-merge (قرار المالك ٨ أكتوبر): الصور والفيديو في البطاقات بلا أعداد — media-merge.test ١١
  for (const f of files) {
    const src = read(f);
    const n = f.startsWith('i18n/') ? 1 : 2;
    for (const [k, res] of Object.entries(expect)) {
      const vs = val(src, k);
      assert.equal(vs.length, n, f + ': ' + k);
      for (const v of vs) { for (const re of res) assert.match(v, re, f + ': ' + k); assert.doesNotMatch(v, /Veo|Runway|Gemini|Claude|GPT/i, f + ': ' + k + ' بلا اسم موديل'); }
      if (/Feats$/.test(k)) for (const v of vs) assert.doesNotMatch(k === 'planFreeFeats' ? v.replace(/^["']<li>[^<]*<\/li>/, '') : v, /\b(?:20|300|400|460|500|7000|1200)\b/, f + ': ' + k + ' رقم قديم'); // v-free-first-day: ٢٠ أوّل يوم مقصودة
    }
  }
  const ps = read('js/partials-settings.js');
  for (const s of ['<b>360</b>', '<b>920</b>', '<b>3,200</b>', '20 رسالة يوميًّا', '50 رسالة يوميًا', '100 رسالة يوميًا', '250 رسالة يوميًا', 'صورة إبداعية: 35', 'فيديو: 55', 'فيديو بالصوت: 175', 'فيديو سينمائي: 120']) assert.ok(ps.includes(s), 'partials-settings: ' + s); // v-fair-video
  for (const s of ['<b>500</b>', '<b>1,200</b>', '<b>7,000</b>', '10 رسائل يوميًا', 'احترافية يوميًا', 'Veo 3']) assert.ok(!ps.includes(s), 'partials-settings stale: ' + s);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'pricing.html')), 'v-cleanup: صفحة الأسعار اليتيمة حُذفت بموافقة المالك — بطاقات الإعدادات هي المرجع');
  assert.ok(read('js/app.bundle.js').includes('function applyPlanGate(d){'), 'الحزمة مبنيّة');
});

test('١٢. توثيق البيئة: الأسقف الجديدة وترتيب السلسلة في env.js و.env.example', () => {
  const env = read('api/_lib/env.js');
  assert.ok(env.includes("'بديل: ٢٠ — رسائل المسجَّل المجاني يوميًّا") && env.includes("'بديل: ١٠٠ — سقف حماية باقة برو") && env.includes("'بديل: ٢٥٠ — سقف حماية باقة ماكس") && env.includes('groq,gemini,mistral,openrouter'));
  const ex = read('.env.example');
  assert.ok(ex.includes('# FREE_DAILY=20 ') && ex.includes('# SUB_DAILY_PRO=100 ') && ex.includes('# SUB_DAILY_MAX=250 ') && ex.includes('# FREE_CHAIN=groq,gemini,mistral,openrouter'));
});
