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
  checkAndConsume: async () => ({ allowed: true, username: 'plan-user' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const tierLib = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));

// ── (١) الجدول نفسه ──
test('١. الأسقف الافتراضيّة الجديدة والسلسلة المجّانيّة تبدأ بـGroq', () => {
  assert.deepEqual(tierLib.caps({}), { guest: 3, free: 5, basic: 50, pro: 100, max: 250 });
  assert.deepEqual(tierLib.DEFAULT_CHAIN, ['groq', 'gemini', 'mistral', 'openrouter']);
  assert.equal(tierLib.freeChain({ GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' })[0].id, 'groq', 'Groq أوّلًا');
  assert.match(tierLib.FREE_TEXT.guestLimit, /5 رسائل/);
  const pr = tierLib.PLAN_ROUTING;
  assert.deepEqual(Object.keys(pr), ['basic', 'pro', 'max']);
  assert.equal(pr.basic.chat.prov, 'deepseek'); assert.equal(pr.basic.strong.prov, 'deepseek');
  assert.equal(pr.pro.chat.prov, 'deepseek'); assert.deepEqual(pr.pro.strong, { prov: 'claude', model: 'claude-haiku-4-5' });
  assert.deepEqual(pr.max.chat, { prov: 'claude', model: 'claude-haiku-4-5' }); assert.deepEqual(pr.max.strong, { prov: 'claude', model: 'claude-sonnet-5' });
  assert.ok(pr.max.allowed.includes('openai') && pr.max.allowed.includes('claude') && !pr.pro.allowed.includes('openai') && !pr.basic.allowed.includes('claude'));
});

test('٢. isStrongTurn: برمجة/بناء/رياضيات/كتلة كود/نصّ طويل = قويّ؛ الدردشة لا', () => {
  for (const s of ['هلا كيف الحال', 'اشرح لي الذكاء الاصطناعي باختصار', 'شو أفضل مطعم في دبي', 'ترجم لي هذي الجملة']) assert.equal(tierLib.isStrongTurn(s), false, s);
  for (const s of ['اكتب لي كود بايثون يقرأ ملف', 'ابني لي موقع لمطعم', 'احسب لي ضريبة 5% على 2000', 'حلّ المعادلة x^2 - 4 = 0', 'عدّل الكود', 'عندي bug في الدالة', 'شرح ```js\nlet a=1\n```', 'Please solve this equation', 'What is the derivative of x^3']) assert.equal(tierLib.isStrongTurn(s), true, s);
  assert.equal(tierLib.isStrongTurn('ن'.repeat(600)), true, 'نصّ طويل = ملفّ');
  assert.equal(tierLib.isStrongTurn(''), false); assert.equal(tierLib.isStrongTurn(null), false);
});

test('٣. planRoute: لكلّ باقة مزوّدها، الدور القويّ يصعّد، المطلوب يُقبل إن كان مسموحًا، والالتقاط بلا المختار', () => {
  const sub = (plan) => ({ tier: 'sub', plan, subscriber: true, cap: 1 });
  for (const t of [null, { tier: 'owner', subscriber: true }, { tier: 'vip', subscriber: true }, { tier: 'free', subscriber: false }, { tier: 'guest', subscriber: false }, { tier: 'sub', plan: 'gold', subscriber: true }]) assert.equal(tierLib.planRoute(t, 'claude', 'اكتب كود'), null);
  assert.deepEqual(tierLib.planRoute(sub('basic'), 'claude', 'هلا'), { plan: 'basic', strong: false, prov: 'deepseek', model: '', fallback: [{ prov: 'groq' }], allowed: ['deepseek', 'groq'] });
  assert.equal(tierLib.planRoute(sub('basic'), 'openai', 'هلا').prov, 'deepseek', 'غير مسموح → افتراضيّ الباقة');
  assert.deepEqual(tierLib.planRoute(sub('basic'), 'groq', 'هلا').fallback, [], 'المطلوب المسموح يُقبل ولا يُكرَّر في الالتقاط');
  assert.equal(tierLib.planRoute(sub('basic'), 'groq', 'اكتب كود').prov, 'deepseek', 'الدور القويّ يغلب المطلوب');
  const pro = tierLib.planRoute(sub('pro'), 'claude', 'هلا');
  assert.deepEqual([pro.prov, pro.model, pro.fallback], ['deepseek', '', [{ prov: 'gemini' }]]);
  const proStrong = tierLib.planRoute(sub('PRO'), '', 'ابني لي تطبيق');
  assert.deepEqual([proStrong.prov, proStrong.model, proStrong.strong, proStrong.fallback], ['claude', 'claude-haiku-4-5', true, [{ prov: 'gemini' }, { prov: 'deepseek' }]]);
  const max = tierLib.planRoute(sub('max'), '', 'هلا');
  assert.deepEqual([max.prov, max.model, max.fallback], ['claude', 'claude-haiku-4-5', [{ prov: 'openai' }, { prov: 'gemini' }, { prov: 'deepseek' }]]);
  assert.deepEqual(tierLib.planRoute(sub('max'), '', 'احسب لي الفائدة المركبة').model, 'claude-sonnet-5');
  const maxGpt = tierLib.planRoute(sub('max'), 'openai', 'هلا');
  assert.deepEqual([maxGpt.prov, maxGpt.model, maxGpt.fallback], ['openai', '', [{ prov: 'gemini' }, { prov: 'deepseek' }]]);
  assert.equal(tierLib.planRoute(sub('max'), 'openai', 'اكتب كود').model, 'claude-sonnet-5', 'الدور القويّ في Max = Sonnet ولو اختار GPT');
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
const realResolve = tierLib.resolveTier;
async function ask(tier, provider, text, script) {
  const bodies = [];
  const saveFetch = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    const b = options && options.body ? JSON.parse(options.body) : null;
    bodies.push({ url: String(url), body: b });
    const step = (script || ['ok'])[Math.min(i++, (script || ['ok']).length - 1)];
    if (step === 'ok') return streamResponse();
    return new Response(step, { status: 500 });
  };
  tierLib.resolveTier = async () => tier;
  let written = '';
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: text }], token: token('plan-user'), provider } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; tierLib.resolveTier = realResolve; }
  return { bodies, written };
}
const SUB = (plan) => ({ tier: 'sub', plan, cap: 100, subscriber: true });

test('٤. الخادم: Pro دردشة → DeepSeek، Pro دور قويّ → Haiku، Max → Haiku/Sonnet، Plus يطلب GPT → DeepSeek، المالك لا يُمسّ', async () => {
  chat.__orQuick.level = 2;
  let r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies.length, 1);
  assert.match(r.bodies[0].url, /openrouter\.ai\/api\/v1\/messages/);
  assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v3.2');
  assert.match(r.written, /"delta":"تم"/);
  r = await ask(SUB('pro'), 'claude', 'اكتب لي كود جافاسكربت يطبع هلا');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-haiku-4.5', 'الدور القويّ في Pro = Haiku عبر الوسيط');
  r = await ask(SUB('max'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-haiku-4.5');
  r = await ask(SUB('max'), 'gemini', 'ابني لي صفحة هبوط لمطعم');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-sonnet-5', 'الدور القويّ في Max = Sonnet ولو اختار مزوّدًا آخر');
  r = await ask(SUB('max'), 'openai', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies[0].body.model, 'openai/gpt-5.6-terra', 'Max يقدر يختار GPT للدردشة');
  r = await ask(SUB('basic'), 'openai', 'اشرح لي الذكاء الاصطناعي باختصار');
  assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v3.2', 'Plus يطلب GPT → DeepSeek');
  r = await ask({ tier: 'owner', plan: null, cap: Infinity, subscriber: true }, 'claude', 'اكتب لي كود');
  assert.equal(r.bodies[0].body.model, 'anthropic/claude-sonnet-5', 'المالك على افتراضيّه');
  // مفتاح أنثروبيك حاضر → كلود مباشر بالاسم المباشر، وDeepSeek يبقى عبر الوسيط
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  try {
    r = await ask(SUB('max'), 'claude', 'احسب لي الفائدة المركبة على 1000');
    assert.match(r.bodies[0].url, /api\.anthropic\.com/);
    assert.equal(r.bodies[0].body.model, 'claude-sonnet-5');
    r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار');
    assert.match(r.bodies[0].url, /openrouter\.ai/);
    assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v3.2');
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test('٥. الخادم: تعطّل مزوّد الباقة قبل أوّل حرف → التالي في سلسلة الباقة بصمت، ثمّ السلسلة المجّانيّة', async () => {
  chat.__orQuick.level = 2;
  let r = await ask(SUB('pro'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار', ['{"error":"insufficient credits"}', 'ok']);
  assert.equal(r.bodies.length, 2);
  assert.equal(r.bodies[0].body.model, 'deepseek/deepseek-v3.2');
  assert.equal(r.bodies[1].body.model, 'google/gemini-3.5-flash', 'الالتقاط داخل الباقة');
  assert.match(r.written, /"delta":"تم"/);
  assert.doesNotMatch(r.written, /"error"/, 'بصمت');
  r = await ask(SUB('max'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار', ['boom', 'boom', 'ok']);
  assert.deepEqual(r.bodies.slice(0, 3).map((b) => b.body.model), ['anthropic/claude-haiku-4.5', 'openai/gpt-5.6-terra', 'google/gemini-3.5-flash']);
  assert.match(r.written, /"delta":"تم"/);
  // الكلّ معطّل → السلسلة المجّانيّة (OpenRouter المجّانيّ هنا) ثمّ رسالة الانشغال بلا خطأ خام
  r = await ask(SUB('basic'), 'claude', 'اشرح لي الذكاء الاصطناعي باختصار', ['boom']);
  assert.deepEqual(r.bodies.slice(0, 2).map((b) => b.body.model), ['deepseek/deepseek-v3.2', 'meta-llama/llama-4-maverick']);
  assert.ok(r.bodies.length > 2, 'ثمّ السلسلة المجّانيّة');
  assert.match(r.written, /"fallback":true/, 'الفشل النهائيّ كما كان (v-king-fallback): العميل يلتقط');
});

test('٦. البنية: التوجيه قبل فحص الحصّة، والالتقاط قبل الهبوط المجّانيّ، والحقول let لا const', () => {
  const s = read('api/_lib/chat.js');
  const route = s.indexOf('__planRoute = tierLib.planRoute(__tier, reqProv, lastUserText);');
  const consume = s.indexOf("const usage = await checkAndConsume(token, guestId, (__tier && !__tier.subscriber) ? 'chat' : prov");
  const lastUser = s.indexOf('const lastUserAny = messages.slice().reverse().find(');
  assert.ok(route > 0 && lastUser > 0 && lastUser < route && route < consume, 'الرسالة الأخيرة → التوجيه → الحصّة');
  const loop = s.indexOf('while (!upstream.ok && !anyText && __planFallbacks.length) {');
  const finalFail = s.indexOf('if (!upstream.ok) {\n        const errText = (await upstream.text()).slice(0, 300);');
  const quick400 = s.indexOf("await logErrorAndFlush('chat/or-quick-400'");
  assert.ok(loop > 0 && quick400 < loop && loop < finalFail, 'الالتقاط بعد إعادة الحقول السريعة وقبل الفشل النهائيّ');
  assert.ok(s.includes('const applyRoute = (p, model) => {'));
  for (const v of ['let prov', 'let viaOR', 'let apiKey', 'let CHAT_URL', 'let DEFAULT_MODEL']) assert.ok(s.includes(v + ' '), v);
  assert.ok(s.includes("callUpstream = (withImg) => __upFetch(CHAT_URL"), 'callUpstream يقرأ العنوان لحظة النداء');
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
  assert.match(ccs, /params\.append\('mode', planInfo\.pack \? 'payment' : 'subscription'\);/);
  assert.match(ccs, /if \(!planInfo\.pack\) params\.append\('line_items\[0\]\[price_data\]\[recurring\]\[interval\]', 'month'\);/);
  const pp = read('api/_lib/paypal-order.js');
  assert.match(pp, /if \(!PLANS\[matchedPlan\]\.pack\) \{ user\.plan = matchedPlan; user\.planUpdatedAt = Date\.now\(\); \}/);
  // العميل: الأزرار الأربعة تفتح نافذة الدفع بنفس الأسعار المعروضة
  const a6 = read('js/app-06-checkout.js');
  assert.match(a6, /const CHECKOUT_PLAN_AMOUNTS = \{ basic: 1000, pro: 2000, max: 10000, pack100: 499, pack300: 1299, pack700: 2499, pack900: 3499 \};/);
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
  assert.ok(html.includes('/js/partials-settings.js?v=660'), 'وسم الملفّ المنفصل ارتفع'); // v-maha-voice-speed: 660
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
