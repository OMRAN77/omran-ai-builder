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
  assert.match(stop.error, /^OpenRouter · google\/gemini-3\.8-flash — لا رصيد كافٍ \(Insufficient credits/);
  assert.match(stop.error, /لم يُجب مزوّد آخر مكانه\.$/);
  assert.ok(!/test-openrouter-key/.test(stop.error), 'لا مفتاح في الرسالة');
});

test('٢. المالك على كلود: المباشر بلا رصيد ← كلود عبر الوسيط (المزوّد نفسه) بلا رصيد ← السببان، ولا مزوّد آخر', async () => {
  const r = await run('omran', { provider: 'claude', messages: ask('اقرأ ملفّ مها في الجيت هوب') },
    (u) => (isAnth(u) ? anthCredit() : isOR(u) ? orCredit() : new Response('{}', { status: 404 })));
  const models = orModels(r.calls);
  assert.equal(models.length, 1, 'محاولة واحدة عبر الوسيط: ' + models.join(','));
  assert.match(models[0], /^anthropic\/claude/, 'كلود نفسه');
  const stop = r.events.find((e) => e.ownerStop === true);
  assert.ok(stop);
  assert.match(stop.error, /^Anthropic · \S+ — لا رصيد كافٍ \(Your credit balance is too low[^)]*\)\nثمّ OpenRouter · anthropic\/claude\S* — لا رصيد كافٍ/);
  assert.equal(r.text, '');
});

test('٣. المالك على كلود: المباشر بلا رصيد والوسيط يجيب → كلود نفسه يجيب وسطر السبب تحته (كما كان)', async () => {
  const r = await run('omran', { provider: 'claude', messages: ask('سؤال') },
    (u) => (isAnth(u) ? anthCredit() : isOR(u) ? sse('ردّ كلود.') : new Response('{}', { status: 404 })));
  assert.match(r.text, /ردّ كلود\./);
  assert.match(r.text, /أجاب بدله: OpenRouter · anthropic\/claude/);
  assert.ok(!r.events.some((e) => e.ownerStop));
});

test('٤. المالك على Kimi: مفتاح Moonshot المباشر 402 ← Kimi عبر الوسيط 402 ← رسالة، ولا كلود ولا غيره', async () => {
  process.env.KIMI_API_KEY = 'test-kimi-key';
  try {
    const r = await run('omran', { provider: 'kimi', messages: ask('سؤال') },
      (u) => (/api\.moonshot\.ai/.test(u) ? new Response(JSON.stringify({ error: { message: 'Your account is suspended due to insufficient balance', type: 'exceeded_current_quota_error' } }), { status: 402 })
        : isOR(u) ? orCredit() : isAnth(u) ? sse('من كلود') : new Response('{}', { status: 404 })));
    assert.ok(r.calls.some((c) => /api\.moonshot\.ai/.test(c.url)), 'Moonshot جُرّب');
    assert.deepEqual(orModels(r.calls), ['moonshotai/kimi-k2'], 'Kimi وحده عبر الوسيط');
    assert.ok(!r.calls.some((c) => isAnth(c.url)));
    const stop = r.events.find((e) => e.ownerStop === true);
    assert.ok(stop);
    assert.match(stop.error, /^OpenRouter · moonshotai\/kimi-k2 — لا رصيد كافٍ/);
  } finally { delete process.env.KIMI_API_KEY; }
});

test('٥. غير المالك (VIP) كما كان: لا حدث توقّف ولا رسالة المالك', async () => {
  const r = await run('vipuser', { provider: 'openai', messages: ask('سؤال') },
    (u) => (isOR(u) ? orCredit() : new Response('{}', { status: 404 })));
  assert.ok(!r.events.some((e) => e.ownerStop), 'لا ownerStop');
  assert.ok(!/لم يُجب مزوّد آخر/.test(JSON.stringify(r.events)));
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
function clientCtx(answers) {
  const tried = [];
  const ctx = {
    tried, window: {}, localStorage: { getItem: () => 'deepseek' }, FUNCTIONAL_GROUPS: {}, AUTO_FALLBACK_ORDER: ['claude', 'gemini', 'openai', 'groq'],
    functionalLabel: (k) => ({ deepseek: 'DeepSeek', claude: 'Claude' }[k] || k), t: (k) => k, __swallow() {}, console,
    isRefusalReply: (s) => /^آسف/.test(String(s)), setInterval, clearInterval, Date, Promise, Error, String,
    callProviderAI: async (k) => { tried.push(k); const a = answers[k]; if (a instanceof Error) throw a; return a; },
  };
  return ctx;
}

test('٦. المسار القديم: المالك (solo) مزوّده وحده — فشله باسمه وسببه، وردّ الرفض يبقى له؛ وغير المالك يتحوّل كما كان', async () => {
  const e402 = Object.assign(new Error('HTTP 402'), { status: 402, upstreamText: 'Insufficient Balance' });
  let ctx = clientCtx({ deepseek: e402, claude: 'من كلود' });
  await assert.rejects(loadFallback(ctx)([], null, ['deepseek'], { solo: true }), (e) => {
    assert.match(e.message, /^DeepSeek — HTTP 402 — Insufficient Balance\nلم يُجب مزوّد آخر مكانه\.$/); return true; });
  assert.deepEqual(ctx.tried, ['deepseek']);

  ctx = clientCtx({ deepseek: 'آسف لا أستطيع', claude: 'من كلود' });
  const r = await loadFallback(ctx)([], null, ['deepseek'], { solo: true });
  assert.equal(r.providerKey, 'deepseek'); assert.deepEqual(ctx.tried, ['deepseek']);

  const stop = Object.assign(new Error('OpenRouter · x — لا رصيد كافٍ\nلم يُجب مزوّد آخر مكانه.'), { ownerStop: true });
  ctx = clientCtx({ deepseek: stop });
  await assert.rejects(loadFallback(ctx)([], null, ['deepseek'], { solo: true }), (e) => e.message === stop.message);

  ctx = clientCtx({ deepseek: e402, claude: 'من كلود' });
  const r2 = await loadFallback(ctx)([], null, ['deepseek', 'claude']);
  assert.equal(r2.reply, 'من كلود', 'غير المالك: الاحتياط كما كان');
  assert.deepEqual(ctx.tried, ['deepseek', 'claude']);
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
    assert.ok(s.includes('await callAIWithFallback(apiMessages, onDelta, __ownerFree ? [__effProv] : __teamOrder, { solo: __ownerFree })'), f + ': المسار القديم وحده');
  }
  for (const f of ['js/app-18-chat-tools.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes('if (ev.error && ev.ownerStop === true) __ownerStop = true;'), f);
    assert.ok(s.includes('if (__ownerStop) __er.ownerStop = true; if (__planLimit) __er.planLimit = true; throw __er;'), f);
  }
});
