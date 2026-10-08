// tests/owner-solo.test.cjs — v-owner-solo (أمر المالك ٨ أكتوبر: «أيّ واحد أختاره يكون نفسه، وإذا ما فيه رصيد يكتبلي»).
// للمالك: المزوّد المختار وحده يجيب. فشله قبل أوّل حرف (رصيد/مفتاح/ضغط) = رسالة باسم الحساب والموديل والسبب، ولا مزوّد آخر
// مكانه — لا سلسلة v-owner-swap (كلود ثمّ GPT ثمّ Gemini ثمّ DeepSeek)، ولا السلسلة المجّانيّة، ولا فريق الأدوات في المتصفّح،
// ولا احتياط المسار القديم. يبقى المزوّد نفسه على طريق آخر (كلود المباشر ← كلود عبر الوسيط). وKimi في المسار القديم
// («صلّح/خطأ» ودور الاستئذان) كان يُرمى فيجيب كلود — صار يمرّ بالخادم لـKimi نفسه. غير المالك كما كان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'owner-solo-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
let usageUser = 'omran';
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const anthCredit = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }), { status: 400 });
const orCredit = () => new Response(JSON.stringify({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } }), { status: 402 });

async function run(user, body, route) {
  usageUser = user;
  const calls = [];
  const out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    return route(String(url), b);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, text: events.map((e) => e.delta || '').join('') };
}
const isAnth = (u) => /api\.anthropic\.com/.test(u);
const isOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);
const orModels = (calls) => calls.filter((c) => isOR(c.url)).map((c) => c.body && c.body.model);
const ask = (q) => [{ role: 'user', content: q }];

test('١. المالك على Gemini بلا رصيد عند الوسيط → رسالة باسم الحساب والسبب، ولا كلود ولا GPT ولا DeepSeek مكانه', async () => {
  const r = await run('omran', { provider: 'gemini', messages: ask('اشرح لي الفرق بين الضريبة والرسوم') },
    (u) => (isOR(u) ? orCredit() : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
  assert.deepEqual(orModels(r.calls), ['google/gemini-3.8-flash'], 'Gemini وحده: ' + orModels(r.calls).join(','));
  assert.ok(!r.calls.some((c) => isAnth(c.url)), 'لا كلود مباشر');
  assert.equal(r.text, '', 'لا ردّ من مزوّد آخر');
  const stop = r.events.find((e) => e.ownerStop === true);
  assert.ok(stop, 'حدث التوقّف للمالك');
  assert.equal(stop.error, 'ما عندي رصيد', 'الرسالة وحدها بلا نصّ تقنيّ');
});

test('٢. المالك على كلود: المباشر بلا رصيد ← كلود عبر الوسيط (المزوّد نفسه) بلا رصيد ← السببان، ولا مزوّد آخر', async () => {
  const r = await run('omran', { provider: 'claude', messages: ask('اقرأ ملفّ مها في الجيت هوب') },
    (u) => (isAnth(u) ? anthCredit() : isOR(u) ? orCredit() : new Response('{}', { status: 404 })));
  const models = orModels(r.calls);
  assert.equal(models.length, 1, 'محاولة واحدة عبر الوسيط: ' + models.join(','));
  assert.match(models[0], /^anthropic\/claude/, 'كلود نفسه');
  const stop = r.events.find((e) => e.ownerStop === true);
  assert.ok(stop);
  assert.equal(stop.error, 'ما عندي رصيد');
  assert.equal(r.text, '');
});

test('٣. المالك على كلود: المباشر بلا رصيد والوسيط يجيب → كلود نفسه يجيب، والردّ وحده بلا سطر سبب تحته', async () => {
  const r = await run('omran', { provider: 'claude', messages: ask('سؤال') },
    (u) => (isAnth(u) ? anthCredit() : isOR(u) ? sse('ردّ كلود.') : new Response('{}', { status: 404 })));
  assert.equal(r.text, 'ردّ كلود.', 'المحادثة فقط — لا «🔧 للمالك فقط…»');
  assert.ok(!r.events.some((e) => e.ownerStop));
});

test('٤. المالك على Kimi: مفتاح Moonshot المباشر 402 ← Kimi عبر الوسيط 402 ← رسالة، ولا كلود ولا غيره', async () => {
  process.env.KIMI_API_KEY = 'test-kimi-key';
  try {
    const r = await run('omran', { provider: 'kimi', messages: ask('سؤال') },
      (u) => (/api\.moonshot\.ai/.test(u) ? new Response(JSON.stringify({ error: { message: 'Your account is suspended due to insufficient balance', type: 'exceeded_current_quota_error' } }), { status: 402 })
        : isOR(u) ? orCredit() : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
    assert.ok(r.calls.some((c) => /api\.moonshot\.ai/.test(c.url)), 'Moonshot جُرّب');
    assert.deepEqual(orModels(r.calls), ['moonshotai/kimi-k3'], 'Kimi وحده عبر الوسيط — بالموديل المختار نفسه (كان kimi-k2)');
    assert.ok(!r.calls.some((c) => isAnth(c.url)));
    const stop = r.events.find((e) => e.ownerStop === true);
    assert.ok(stop);
    assert.equal(stop.error, 'ما عندي رصيد');
  } finally { delete process.env.KIMI_API_KEY; }
});

test('٥. غير المالك (VIP) كما كان: لا حدث توقّف ولا رسالة المالك', async () => {
  const r = await run('vipuser', { provider: 'openai', messages: ask('سؤال') },
    (u) => (isOR(u) ? orCredit() : new Response('{}', { status: 404 })));
  assert.ok(!r.events.some((e) => e.ownerStop), 'لا ownerStop');
  assert.ok(!/ما عندي رصيد/.test(JSON.stringify(r.events)));
});

// ── العميل ──
const checkout = read('js/app-06-checkout.js');
function loadFallback(ctx) {
  const a = checkout.indexOf('var __FALLBACK_IDLE_MS');
  const b = checkout.indexOf('// ⚠️ ٦ أغسطس — سجل الأخطاء الحقيقي');
  assert.ok(a > 0 && b > a);
  vm.runInNewContext(checkout.slice(a, b) + '\nthis.fb = callAIWithFallback;', ctx);
  return ctx.fb;
}
function clientCtx(answers, chatAnswers) {
  const tried = [], viaChat = [];
  const ctx = {
    tried, viaChat, localStorage: { getItem: () => 'deepseek' }, FUNCTIONAL_GROUPS: {}, AUTO_FALLBACK_ORDER: ['claude', 'gemini', 'openai', 'groq'],
    TOOL_PROVIDERS: ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter', 'kimi'],
    window: { callChatWithTools: async (msgs, od, prov, o) => { viaChat.push({ prov, msgs, opts: o }); const a = (chatAnswers || {})[prov]; if (a instanceof Error) throw a; return { reply: a || ('من ' + prov) }; } },
    functionalLabel: (k) => k, t: (k) => ({ quotaError: 'Rate limit or quota reached' }[k] || k), __swallow() {}, console,
    isRefusalReply: (s) => /^آسف/.test(String(s)), setInterval, clearInterval, Date, Promise, Error, String, Number,
    callProviderAI: async (k) => { tried.push(k); const a = answers[k]; if (a instanceof Error) throw a; return a; },
  };
  return ctx;
}

test('٦. المسار القديم للمالك (solo): مزوّد مسار الأدوات يمرّ بالخادم لمزوّده نفسه، وPerplexity وحده برسالة قصيرة؛ وغير المالك كما كان', async () => {
  // DeepSeek/Mistral/Gemini… → الخادم (callChatWithTools) بمزوّده، بلا رسالة النظام الثابتة الأولى، ولا مسار /api/<مزوّد> القديم
  let ctx = clientCtx({ deepseek: 'من المسار القديم' });
  const msgs = [{ role: 'system', content: 'ثابت' }, { role: 'system', content: 'تعليمة الاستئذان' }, { role: 'user', content: 'صلّح الخطأ' }];
  const r0 = await loadFallback(ctx)(msgs, null, ['deepseek'], { solo: true });
  assert.equal(r0.reply, 'من deepseek'); assert.equal(r0.providerKey, 'deepseek');
  assert.deepEqual(ctx.tried, [], 'لا مسار قديم');
  assert.deepEqual(ctx.viaChat[0].msgs.map((m) => m.content), ['تعليمة الاستئذان', 'صلّح الخطأ']);
  for (const p of ['gemini', 'mistral', 'cohere', 'openrouter', 'openai', 'claude', 'groq']) {
    ctx = clientCtx({}); await loadFallback(ctx)(msgs, null, [p], { solo: true });
    assert.deepEqual(ctx.viaChat.map((c) => c.prov), [p], p + ' عبر الخادم'); assert.deepEqual(ctx.tried, []);
  }
  // فشل الخادم بلا ownerStop (مثل «chat 500: …») = رسالة قصيرة بالرقم، ولا مزوّد بعده
  ctx = clientCtx({}, { mistral: new Error('chat 500: boom') });
  await assert.rejects(loadFallback(ctx)(msgs, null, ['mistral'], { solo: true }), (e) => e.message === 'ما قدرت أردّ الحين — خطأ 500');
  assert.deepEqual(ctx.viaChat.map((c) => c.prov), ['mistral']);
  const stop = Object.assign(new Error('ما عندي رصيد'), { ownerStop: true });
  ctx = clientCtx({}, { gemini: stop });
  await assert.rejects(loadFallback(ctx)(msgs, null, ['gemini'], { solo: true }), (e) => e.message === 'ما عندي رصيد');

  // Perplexity (خارج مسار الأدوات): 402 = «ما عندي رصيد»؛ 429 برسالة مترجمة فيها quota ليس رصيدًا؛ ردّ الرفض يبقى له
  const e402 = Object.assign(new Error('HTTP 402'), { status: 402, upstreamText: 'Insufficient Balance' });
  ctx = clientCtx({ perplexity: e402, claude: 'من كلود' });
  await assert.rejects(loadFallback(ctx)([], null, ['perplexity'], { solo: true }), (e) => e.message === 'ما عندي رصيد');
  assert.deepEqual(ctx.tried, ['perplexity']);
  const e429 = Object.assign(new Error('Rate limit or quota reached'), { status: 429, upstreamText: 'rate limited' });
  ctx = clientCtx({ perplexity: e429 });
  await assert.rejects(loadFallback(ctx)([], null, ['perplexity'], { solo: true }), (e) => e.message === 'ما قدرت أردّ الحين — خطأ 429');
  ctx = clientCtx({ perplexity: 'آسف لا أستطيع', claude: 'من كلود' });
  const r = await loadFallback(ctx)([], null, ['perplexity'], { solo: true });
  assert.equal(r.providerKey, 'perplexity'); assert.deepEqual(ctx.tried, ['perplexity']);

  // غير المالك (بلا solo): المسار القديم والاحتياط كما كانا
  ctx = clientCtx({ deepseek: e402, claude: 'من كلود' });
  const r2 = await loadFallback(ctx)([], null, ['deepseek', 'claude']);
  assert.equal(r2.reply, 'من كلود', 'غير المالك: الاحتياط كما كان');
  assert.deepEqual(ctx.tried, ['deepseek', 'claude']); assert.deepEqual(ctx.viaChat, []);
});

test('٧. Kimi في المسار القديم يمرّ بالخادم لـKimi نفسه (بلا رسالة النظام الثابتة الأولى) — لا رمي يسلّم الدور لكلود', async () => {
  const a = checkout.indexOf('async function callProviderAI');
  const b = checkout.indexOf('async function callAI(messages)');
  const seen = [];
  const ctx = { localStorage: { getItem: () => 'kimi' }, window: { callChatWithTools: async (msgs, od, prov) => { seen.push({ msgs, prov }); return { reply: 'من Kimi' }; } } };
  vm.runInNewContext(checkout.slice(a, b) + '\nthis.cp = callProviderAI;', ctx);
  const msgs = [{ role: 'system', content: 'ثابت' }, { role: 'system', content: 'تعليمة الاستئذان' }, { role: 'user', content: 'صلّح الخطأ' }];
  assert.equal(await ctx.cp('kimi', msgs, null), 'من Kimi');
  assert.equal(seen.length, 1); assert.equal(seen[0].prov, 'kimi');
  assert.deepEqual(seen[0].msgs.map((m) => m.content), ['تعليمة الاستئذان', 'صلّح الخطأ']);
});

test('٨. الأسلاك: العميل يرمي فشل المالك فورًا، بلا فريق أدوات بديل ولا سلسلة قديمة — في الأجزاء والحزمة', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("catch(e){ if(e && e.ownerStop) throw e;"), f + ': رمي التوقّف');
    assert.ok(s.includes("if(!__ct && !__ownerFree && !(imageAttachments.length && __effProv === 'claude')){"), f + ': لا فريق بديل للمالك');
    assert.ok(s.includes('await callAIWithFallback(apiMessages, onDelta, __ownerFree ? [__effProv] : __teamOrder, { solo: __ownerFree, toolsErr: __ownerFree ? __ctErr : null })'), f + ': المسار القديم وحده، وفشل الأدوات لا يُعاد');
  }
  for (const f of ['js/app-18-chat-tools.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes('if (ev.error && ev.ownerStop === true) __ownerStop = true;'), f);
    assert.ok(s.includes('if (__ownerStop) __er.ownerStop = true; if (__planLimit) __er.planLimit = true; throw __er;'), f);
  }
});

test('٩. Grok على «مرحبا»: «Reasoning is mandatory» ← إعادة بلا أيّ حقل إطفاء فيجيب Grok نفسه، ولا تُرسل له الحقول بعدها', async () => {
  const MAND = () => new Response(JSON.stringify({ error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled.', code: 400 } }), { status: 400 });
  const quiet = (b) => !!(b && (b.thinking || b.reasoning));
  const route = (u, b) => (isOR(u) ? (quiet(b) ? MAND() : sse('هلا والله.')) : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 }));
  const r = await run('omran', { provider: 'openrouter', model: 'x-ai/grok-4.6', messages: ask('مرحبا') }, route);
  assert.equal(r.text, 'هلا والله.', 'Grok نفسه أجاب: ' + JSON.stringify(r.events.slice(-3)));
  assert.ok(!r.calls.some((c) => isAnth(c.url)), 'لا كلود');
  assert.ok(r.calls.filter((c) => isOR(c.url)).every((c) => c.body.model === 'x-ai/grok-4.6'), 'Grok وحده');
  const r2 = await run('omran', { provider: 'openrouter', model: 'x-ai/grok-4.6', messages: ask('مرحبا') }, route);
  assert.equal(r2.text, 'هلا والله.');
  assert.equal(r2.calls.filter((c) => isOR(c.url)).length, 1, 'الرسالة التالية طلب واحد بلا حقول إطفاء');
});

test('١٠. الواجهة: لا شارة موديل/توكنات فوق ردّ المحادثة للمالك — تبقى للوكيل و«اسأل الكل»', () => {
  for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes('if(isAskAllReply || (__ownerBadge && __plbl && m.agentBadge)) div.appendChild(label);'), f);
  }
});

// ── فحص المزوّدين العشرة (٨ أكتوبر): كلّ مزوّد يردّ عن نفسه في كلّ مسار — للمالك وحده ──
test('١١. Groq: رفض Groq نفسه (402) يتوقّف بـ«ما عندي رصيد» — لا Llama عبر الوسيط عند مضيف غير Groq', async () => {
  process.env.GROQ_API_KEY = 'test-groq';
  try {
    const r = await run('omran', { provider: 'groq', messages: ask('سؤال') },
      (u) => (/api\.groq\.com/.test(u) ? new Response(JSON.stringify({ error: { message: 'Insufficient balance' } }), { status: 402 }) : isOR(u) ? sse('من الوسيط') : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
    assert.ok(r.calls.some((c) => /api\.groq\.com/.test(c.url)));
    assert.ok(!r.calls.some((c) => isOR(c.url) || isAnth(c.url)), 'لا وسيط ولا كلود');
    assert.equal(r.events.find((e) => e.ownerStop).error, 'ما عندي رصيد');
  } finally { delete process.env.GROQ_API_KEY; }
});

test('١٢. GPT: سقوط المفتاح المباشر يكمل عند الوسيط بالموديل المختار نفسه (Astra لا Sol)، وسبب المباشر لا يُمحى', async () => {
  process.env.OPENAI_API_KEY = 'test-openai';
  try {
    const quota = () => new Response(JSON.stringify({ error: { message: 'You exceeded your current quota', type: 'insufficient_quota' } }), { status: 429 });
    const r = await run('omran', { provider: 'openai', model: 'openai/gpt-6-astra', messages: ask('سؤال') },
      (u) => (/api\.openai\.com/.test(u) ? quota() : isOR(u) ? sse('من GPT عند الوسيط') : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
    assert.deepEqual(orModels(r.calls), ['openai/gpt-6-astra'], 'الموديل المختار نفسه');
    assert.match(r.text, /من GPT عند الوسيط/);
    // المباشر بلا رصيد ثمّ الوسيط بخطأ غير الرصيد: السبب الأوّل (الرصيد) يبقى
    const r2 = await run('omran', { provider: 'openai', model: 'openai/gpt-6-astra', messages: ask('سؤال') },
      (u) => (/api\.openai\.com/.test(u) ? quota() : isOR(u) ? new Response('{"error":{"message":"upstream down"}}', { status: 503 }) : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
    assert.equal(r2.events.find((e) => e.ownerStop).error, 'ما عندي رصيد');
    assert.ok(!r2.calls.some((c) => isAnth(c.url)));
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('١٣. صفّ الوسيط العامّ: Grok المرفوض (404 نصّ) لا يجيب عنه كلود — يتوقّف بسببه', async () => {
  const r = await run('omran', { provider: 'openrouter', model: 'x-ai/grok-4.20', messages: ask('سؤال') },
    (u, b) => (isOR(u) ? (b.model === 'x-ai/grok-4.20' ? new Response('{"error":{"message":"No endpoints found for x-ai/grok-4.20"}}', { status: 404 }) : sse('من ' + b.model)) : new Response('{}', { status: 404 })));
  assert.deepEqual(orModels(r.calls), ['x-ai/grok-4.20'], 'لا anthropic/claude-sonnet-5 بعده');
  assert.equal(r.events.find((e) => e.ownerStop).error, 'ما قدرت أردّ الحين — خطأ 404');
});

test('١٤. مزوّد بلا طريق له أو غير معروف للخادم: لا يجيب كلود صامتًا عنه — للمالك وحده', async () => {
  const saveOR = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const r = await run('omran', { provider: 'deepseek', messages: ask('سؤال') }, (u) => (isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
    assert.equal(r.calls.length, 0, 'لا كلود عن DeepSeek');
    assert.ok(r.events.some((e) => e.ownerStop === true));
  } finally { process.env.OPENROUTER_API_KEY = saveOR; }
  const p = await run('omran', { provider: 'perplexity', messages: ask('سؤال') }, (u) => (isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
  assert.equal(p.calls.length, 0, 'لا كلود باسم Perplexity');
  assert.ok(p.events.some((e) => e.ownerStop === true));
});

test('١٥. الواجهة: طلب بناء فيه «إصلاح/خطأ» لا يُسلَّم لكلود عند المالك (اسأل الكل الصريح باقٍ)، وDeepSeek لا يرجع GPT عند الفتح', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes("const askAll = !!customProviders || __askAllExplicit || (!(typeof omranOwnerUi === 'function' && omranOwnerUi())"), f);
  }
  const ui = read('js/app-05-ui.js');
  const line = ui.split('\n').find((l) => l.includes("=== 'deepseek') localStorage.setItem('aiapp_provider', 'openai')"));
  for (const [owner, want] of [[true, 'deepseek'], [false, 'openai']]) {
    const store = new Map([['aiapp_provider', 'deepseek']]);
    vm.runInNewContext(line, { omranOwnerUi: () => owner, __swallow() {}, localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) } });
    assert.equal(store.get('aiapp_provider'), want, owner ? 'المالك يبقى على DeepSeek' : 'غيره كما كان');
  }
  assert.ok(read('js/app-06-checkout.js').includes("if (typeof omranOwnerUi === 'function' && omranOwnerUi()) return; // v-owner-solo"), 'الإعدادات لا تكتب فوق اختيار الوسيط');
});

test('١٦. القائمة تسمّي ما يجيب فعلًا: Groq = GPT-OSS 120B (والمحفوظ المتقاعد يرجع له)، وSonar Reasoning Pro؛ ومعرّف Perplexity القديم يُرحَّل', () => {
  const m = read('js/modes.js');
  assert.match(m, /key:'groq',[^\n]*def:'openai\/gpt-oss-120b',\s*models:\[\['openai\/gpt-oss-120b','GPT-OSS 120B'\]\]/);
  assert.ok(!/'Llama 4 Maverick'/.test(m.slice(m.indexOf('var PROVS = ['), m.indexOf('function curProv'))), 'لا تسمية Maverick في القائمة');
  assert.match(m, /\['sonar-reasoning-pro','Sonar Reasoning Pro'\]/);
  const i = m.indexOf('function curModelId'); const fn = m.slice(i, m.indexOf('\n', i));
  const ctx = { localStorage: { getItem: () => 'meta-llama/llama-4-maverick' } };
  vm.runInNewContext(fn + '\nthis.cm = curModelId;', ctx);
  assert.equal(ctx.cm({ key: 'groq', or: true, direct: true, store: 's', def: 'openai/gpt-oss-120b', models: [] }), 'openai/gpt-oss-120b');
  // سطر الترحيل في callPerplexity يُشغَّل كما هو: القديم يصير sonar ويُحفظ، والحيّ لا يُمسّ
  const line = read('js/app-06-checkout.js').split('\n').find((l) => l.includes("model = 'sonar'; try{ localStorage.setItem('aiapp_perplexity_model', model)"));
  assert.ok(line, 'سطر الترحيل');
  for (const [id, want] of [['llama-3.1-sonar-small-128k-online', 'sonar'], ['pplx-70b-online', 'sonar'], ['sonar-medium-online', 'sonar'], ['sonar', 'sonar'], ['sonar-pro', 'sonar-pro'], ['sonar-reasoning-pro', 'sonar-reasoning-pro'], ['sonar-deep-research', 'sonar-deep-research']]) {
    const saved = [];
    const ctx = { model: id, omranOwnerUi: () => true, __swallow() {}, localStorage: { setItem: (k, v) => saved.push(v) } };
    vm.runInNewContext('var model = this.model;\n' + line + '\nthis.out = model;', ctx);
    assert.equal(ctx.out, want, id);
  }
  assert.match(read('index.html'), /\/js\/modes\.js\?v=m081026a/);
});

// ── مراجعة مستقلّة (١٦ وكيلًا) على التعديل نفسه: أخطاء أكّدها مشكّك ثانٍ ──
test('١٧. إصلاح المالك يرى كود مشروعه: أوّل رسالة assistant (الكود) لا تُقصّ، والمسار القديم المحوَّل بلا أدوات — للمالك وحده', async () => {
  const CODE = '```html\n<button id="go">اذهب</button><!--CODE-MARK-->\n```';
  const msgs = [{ role: 'assistant', content: CODE }, { role: 'user', content: 'سوّ لي زر' }, { role: 'assistant', content: 'تمّ.' }, { role: 'user', content: 'الزر ما يشتغل صلّحه' }];
  const route = (u) => (isOR(u) || isAnth(u) ? sse('هذا الإصلاح.') : new Response('{}', { status: 404 }));
  const r = await run('omran', { provider: 'deepseek', noTools: true, messages: msgs }, route);
  const up = r.calls.find((c) => isOR(c.url));
  const flat = JSON.stringify(up.body.messages);
  assert.ok(flat.includes('CODE-MARK'), 'الكود يصل الموديل');
  assert.equal(up.body.messages[0].role, 'user'); assert.match(JSON.stringify(up.body.messages[0]), /هذا مشروعي الحالي/);
  assert.equal(up.body.tools, undefined, 'بلا أدوات كالمسار القديم');
  // الطريق العاديّ للمالك (بلا noTools) يحمل الكود أيضًا الآن، ومعه أدواته
  const n = await run('omran', { provider: 'deepseek', messages: msgs }, route);
  const nb = n.calls.find((c) => isOR(c.url)).body;
  assert.ok(JSON.stringify(nb.messages).includes('CODE-MARK')); assert.ok(Array.isArray(nb.tools) && nb.tools.length);
  // غير المالك: noTools لا يغيّر شيئًا
  const v = await run('vipuser', { provider: 'openai', noTools: true, messages: msgs }, route);
  assert.ok(Array.isArray(v.calls.find((c) => isOR(c.url)).body.tools));
});

test('١٨. GPT: الموديل المختار غير موجود عند الوسيط بعد سقوط المباشر ← افتراضيّ GPT نفسه بإعلان، لا «ما عندي رصيد» كاذب', async () => {
  process.env.OPENAI_API_KEY = 'test-openai';
  try {
    const r = await run('omran', { provider: 'openai', model: 'openai/gpt-6-astra', messages: ask('سؤال') },
      (u, b) => (/api\.openai\.com/.test(u) ? new Response('{"error":{"message":"quota","type":"insufficient_quota"}}', { status: 429 })
        : isOR(u) ? (b.model === 'openai/gpt-6-astra' ? new Response('{"error":{"message":"No endpoints found for openai/gpt-6-astra"}}', { status: 404 }) : sse('من GPT الافتراضيّ'))
        : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
    assert.deepEqual(orModels(r.calls), ['openai/gpt-6-astra', 'openai/gpt-6-sol']);
    assert.match(r.text, /من GPT الافتراضيّ/);
    assert.ok(r.events.some((e) => e.k === 'stModelFallback' && /عند الوسيط/.test(e.status)));
    assert.ok(!r.calls.some((c) => isAnth(c.url)));
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('١٩. Kimi K2.6 مع صورة بعد سقوط Moonshot: يبقى K2.6 (يرى الصور) لا يُفرض K3', () => {
  const { visionPlan } = require(rp('api/_lib/owner-vision.js'));
  assert.equal(visionPlan('kimi', 'or', 'moonshotai/kimi-k2.6', 'moonshotai/kimi-k2').model, 'moonshotai/kimi-k2.6');
  assert.equal(visionPlan('kimi', 'or', 'moonshotai/kimi-k3', 'moonshotai/kimi-k2').model, 'moonshotai/kimi-k3');
  assert.equal(visionPlan('kimi', 'or', 'moonshotai/kimi-k2', 'moonshotai/kimi-k2').model, 'moonshotai/kimi-k3', 'K2 النصّيّ = K3 الذي يرى كما كان');
});

test('٢٠. العميل: فشل مسار الأدوات للمالك لا يُعاد بطلب ثانٍ لمزوّده (لا تفويض/رفع مكرّر)، والمحوَّل يطلب بلا أدوات', async () => {
  let ctx = clientCtx({});
  await assert.rejects(loadFallback(ctx)([{ role: 'user', content: 'فوّض' }], null, ['claude'], { solo: true, toolsErr: new Error('chat: empty reply') }), (e) => e.message === 'ما قدرت أردّ الحين');
  assert.deepEqual(ctx.viaChat, [], 'لا طلب ثانٍ'); assert.deepEqual(ctx.tried, []);
  ctx = clientCtx({});
  await loadFallback(ctx)([{ role: 'user', content: 'صلّح' }], null, ['mistral'], { solo: true });
  assert.equal(ctx.viaChat[0].opts && ctx.viaChat[0].opts.noTools, true);
  for (const f of ['js/app-18-chat-tools.js', 'js/app.bundle.js']) assert.ok(read(f).includes('noTools: (opts && opts.noTools) ? true : undefined'), f);
  assert.match(read('package.json'), /node tests\/owner-swap\.test\.cjs && node tests\/owner-solo\.test\.cjs/, 'يعمل في CI أمرًا مستقلًّا');
});

// ── v-owner-identity (المالك: «ولا واحد يردّ … باسمه… شو عرّفني أنّ المزوّدين بأصلهم») ──
const sysText = (b) => (Array.isArray(b.system) ? b.system.map((x) => x.text).join('') : String(b.system || ''));
test('٢١. كلّ مزوّد يعرف اسمه الحقيقيّ عند المالك ولا قاعدة إخفاء — وغير المالك كما كان؛ والكاش باقٍ', async () => {
  const cases = [['deepseek', '', /أنت DeepSeek من شركة DeepSeek \(الموديل: deepseek\/deepseek-v4-pro\)/], ['mistral', '', /أنت Mistral من Mistral AI/], ['openrouter', 'x-ai/grok-4.6', /أنت Grok من xAI \(الموديل: x-ai\/grok-4\.6\)/], ['claude', '', /أنت Claude من Anthropic/]];
  for (const [prov, model, re] of cases) {
    const r = await run('omran', { provider: prov, model, messages: ask('من أنت؟') }, (u) => (isOR(u) || isAnth(u) ? sse('هلا.') : new Response('{}', { status: 404 })));
    const b = r.calls.find((c) => isOR(c.url) || isAnth(c.url)).body;
    const t = sysText(b);
    assert.match(t, re, prov);
    assert.match(t, /فأجب بصدق باسمك الحقيقيّ/, prov);
    assert.ok(!/أنت «عمران»/.test(t) && !/لا تُذكر للمستخدم أبدًا/.test(t) && !/لا تذكر مزوّد النموذج/.test(t), prov + ': لا إخفاء');
    if (Array.isArray(b.system)) assert.ok(b.system[0].cache_control && /أنت /.test(b.system[0].text), prov + ': الثابت المخزَّن يبقى بادئة');
  }
  const v = await run('vipuser', { provider: 'openai', messages: ask('من أنت؟') }, (u) => (isOR(u) ? sse('هلا.') : new Response('{}', { status: 404 })));
  const vt = sysText(v.calls.find((c) => isOR(c.url)).body);
  assert.match(vt, /أنت «عمران»/); assert.match(vt, /لا تُذكر للمستخدم أبدًا/); assert.ok(!/باسمك الحقيقيّ/.test(vt), 'غير المالك كما كان');
});

test('٢٢. دليل المالك: الموديل كما أعلنه المزوّد نفسه في ردّه يصل الواجهة ويظهر فوق الردّ (بلا توكنات)', async () => {
  const served = (model) => new Response([
    { type: 'message_start', message: { model, usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'أنا DeepSeek.' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  ].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200 });
  const r = await run('omran', { provider: 'deepseek', messages: ask('من أنت؟') }, (u) => (isOR(u) ? served('deepseek/deepseek-v4-pro-20260901') : new Response('{}', { status: 404 })));
  assert.equal(r.events.find((e) => e.served).served, 'deepseek/deepseek-v4-pro-20260901', 'من ردّ المزوّد لا من اختيارنا');
  const v = await run('vipuser', { provider: 'openai', messages: ask('من أنت؟') }, (u) => (isOR(u) ? served('openai/gpt-6-sol') : new Response('{}', { status: 404 })));
  assert.ok(!v.events.some((e) => e.served), 'لغير المالك لا شيء');
  for (const f of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) assert.ok(read(f).includes("else if(__ownerBadge && m.served && !isAskAllReply){ label.textContent = (m.providerKey && typeof functionalLabel === 'function' ? functionalLabel(m.providerKey) : '') + ' · ' + m.served; div.appendChild(label); }"), f);
  for (const f of ['js/app-18-chat-tools.js', 'js/app.bundle.js']) assert.ok(read(f).includes("if (typeof ev.served === 'string' && ev.served) __served = ev.served;"), f);
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) assert.ok(read(f).includes('served: __ctServed || undefined, /* v-owner-identity'), f);
});
