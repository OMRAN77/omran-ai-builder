// tests/mid-stream.test.cjs — v-claude-code-level C9: بثّ المزوّد انقطع في منتصفه.
//  لقطة المالك ١١ أكتوبر: GPT-6 Astra وصورة و«غير الشكل كامل» ← «⚠️ ما قدرت أردّ الحين» ثلاث مرّات بلا رقم ولا سبب.
//  الجذر المُعاد إنتاجه: oa-direct يرمي OA_STREAM_PROTOCOL_ERROR لحدث response.failed داخل البثّ، فيقفز إلى catch الأعلى في
//  chat.js ← «chat error» بلا ownerStop ← العميل يمحوه إلى الرسالة العارية، ولا إعادة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'mid-stream-secret';
process.env.OPENAI_API_KEY = 'test-oai-key';
process.env.OPENROUTER_API_KEY = 'test-or-key';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'CHAT_OPENAI_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? db.get(k) : null), kvPutJSON: async (k, v) => { db.set(k, v); }, kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [] });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }) });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const logged = [];
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async (where, err) => { logged.push(where + ' ' + (err && err.message)); }; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const OL = require(rp('api/_lib/owner-loop.js'));
const tok = () => { const p = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 6e5 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };

const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e)).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const FAILED = { type: 'response.failed', response: { error: { code: 'server_error', message: 'An error occurred while processing your request.' } } };
const ok = (m) => sse([{ type: 'response.created', response: { model: m } }, { type: 'response.output_text.delta', delta: 'غيّرته كاملًا' }, { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 3 } } }]);
const failNow = (m) => sse([{ type: 'response.created', response: { model: m } }, FAILED]);
// النصّ في دفعة سابقة للفشل (في دفعة واحدة يُسقط خطأ المجرى ما لم يُقرأ منها، فلا يصل العميل شيء وتصحّ الإعادة)
const failAfterText = (m) => { const enc = new TextEncoder(); const line = (e) => enc.encode('data: ' + JSON.stringify(e) + '\n\n'); return new Response(new ReadableStream({ async start(c) { c.enqueue(line({ type: 'response.created', response: { model: m } })); c.enqueue(line({ type: 'response.output_text.delta', delta: 'خلني أشوف الصورة' })); await new Promise((r) => setTimeout(r, 30)); c.enqueue(line(FAILED)); c.close(); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); };
const IMG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function run(replies) {
  const calls = []; const out = []; logged.length = 0;
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url); calls.push(u);
    let b = {}; try { b = JSON.parse(init.body); } catch (e) { b = {}; }
    if (/api\.openai\.com\/v1\/responses/.test(u)) return (replies.shift() || ok)(b.model || 'gpt');
    return new Response(JSON.stringify({ error: { message: 'not this one' } }), { status: 500 });
  };
  const req = { method: 'POST', headers: {}, body: { token: tok(), provider: 'openai', model: 'openai/gpt-6-astra', messages: [{ role: 'user', content: [{ type: 'text', text: 'غير الشكل كامل' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMG } }] }] } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push('data: ' + JSON.stringify(v) + '\n'); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls: calls.filter((u) => /api\.openai\.com\/v1\/responses/.test(u)).length, all: calls, events, text: events.map((e) => e.delta || '').join(''), stop: events.find((e) => e.error) || null, status: events.filter((e) => e.status).map((e) => e.status) };
}

test('GPT stream fails mid-way before any text: the same call is retried once and its answer shown — no bare «ما قدرت أردّ الحين»', async () => {
  const r = await run([failNow, ok]);
  assert.equal(r.calls, 2, 'النداء نفسه مرّة ثانية: ' + r.all.join(' '));
  assert.equal(r.text, 'غيّرته كاملًا');
  assert.equal(r.stop, null, 'لا خطأ بعد إعادة ناجحة');
  assert.ok(r.status.includes('⏳ انقطع ردّ المزوّد في منتصفه (server_error) — أعيد مرّة…'), r.status.join(' | '));
  assert.ok(logged.some((l) => /^chat\/mid-stream .*server_error/.test(l)), 'السبب الكامل في سجلّ الأخطاء');
});

test('fails again: one retry only, then the real reason with ownerStop (the client shows it as-is) — no other provider answers', async () => {
  const r = await run([failNow, failNow, ok]);
  assert.equal(r.calls, 2, 'إعادة واحدة لا أكثر');
  assert.ok(r.all.every((u) => /api\.openai\.com/.test(u)), 'GPT نفسه لا غيره: ' + r.all.join(' '));
  assert.deepEqual({ error: r.stop.error, ownerStop: r.stop.ownerStop }, { error: 'انقطع ردّ المزوّد في منتصفه (server_error)', ownerStop: true });
  assert.ok(!r.events.some((e) => e.error && /^chat error/.test(e.error)), 'لا «chat error» بلا ownerStop');
});

test('fails after text was shown: no retry (the text would repeat) — the reason goes under the text', async () => {
  const r = await run([failAfterText, ok]);
  assert.equal(r.calls, 1);
  assert.equal(r.text, 'خلني أشوف الصورة');
  assert.equal(r.stop.ownerStop, true);
  assert.equal(r.stop.error, 'انقطع ردّ المزوّد في منتصفه (server_error)');
});

test('DeepSeek via the gateway, connection cut mid-stream («terminated»): retried once, then «انقطع ردّ المزوّد في منتصفه (net_cut)» — not a bare message', async () => {
  const save = global.fetch; const calls = []; const out = [];
  const cut = () => { const enc = new TextEncoder(); return new Response(new ReadableStream({ async start(c) { c.enqueue(enc.encode('event: message_start\ndata: ' + JSON.stringify({ type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } }) + '\n\n')); await new Promise((r) => setTimeout(r, 10)); c.error(new TypeError('terminated')); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); };
  const okAnth = () => new Response(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'].map((t) => 'data: ' + JSON.stringify(
    t === 'message_start' ? { type: t, message: { model: 'deepseek', usage: { input_tokens: 1, output_tokens: 0 } } } : t === 'content_block_start' ? { type: t, index: 0, content_block: { type: 'text', text: '' } }
      : t === 'content_block_delta' ? { type: t, index: 0, delta: { type: 'text_delta', text: 'فحصت' } } : t === 'content_block_stop' ? { type: t, index: 0 } : t === 'message_delta' ? { type: t, delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } } : { type: t })).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const go = async (plan) => {
    calls.length = 0; out.length = 0;
    global.fetch = async (url) => { const u = String(url); calls.push(u); return /openrouter\.ai/.test(u) ? (plan.shift() || okAnth)() : new Response('{}', { status: 500 }); };
    const req = { method: 'POST', headers: {}, body: { token: tok(), provider: 'deepseek', messages: [{ role: 'user', content: 'افحص الأمان في التطبيق اذا فيه ثغرات' }] } };
    const res = { setHeader() {}, status() { return this; }, json(v) { out.push('data: ' + JSON.stringify(v) + '\n'); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
    try { await chat(req, res); } finally { global.fetch = save; }
    const ev = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
    return { n: calls.filter((u) => /openrouter\.ai/.test(u)).length, text: ev.map((e) => e.delta || '').join(''), stop: ev.find((e) => e.error) || null };
  };
  const a = await go([cut, okAnth]);
  assert.deepEqual({ n: a.n, text: a.text, stop: a.stop }, { n: 2, text: 'فحصت', stop: null });
  const b = await go([cut, cut, okAnth]);
  assert.equal(b.n, 2);
  assert.deepEqual({ error: b.stop.error, ownerStop: b.stop.ownerStop }, { error: 'انقطع ردّ المزوّد في منتصفه (net_cut)', ownerStop: true });
  // خطأ برمجيّ (TypeError بنصّ آخر) ليس انقطاعًا: لا يُعاد
  assert.equal(OL.midStream(OL.state(true), new TypeError('Cannot read properties of undefined (reading \'x\')'), {}), null);
  assert.equal(OL.midStream(OL.state(true), Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }), {}).kind, 'retry');
});

test('midStream is the owner\'s only, for this error only; codes are short and readable', () => {
  const e = (m) => Object.assign(new Error('OA_STREAM_PROTOCOL_ERROR: ' + m), { code: 'OA_STREAM_PROTOCOL_ERROR' });
  assert.equal(OL.midStream(OL.state(false), e('provider error — server_error: x'), {}), null, 'غير المالك: catch الأعلى كما كان');
  assert.equal(OL.midStream(OL.state(true), new Error('boom'), {}), null, 'خطأ آخر يمضي كما كان');
  assert.equal(OL.midStream(OL.state(false), new TypeError('terminated'), {}), null, 'غير المالك: الانقطاع كما كان');
  assert.equal(OL.midCode('OA_STREAM_PROTOCOL_ERROR: provider error — server_error: An error occurred'), 'server_error');
  assert.equal(OL.midCode('OA_STREAM_PROTOCOL_ERROR: response.incomplete — content_filter'), 'content_filter');
  assert.equal(OL.midCode('OA_STREAM_PROTOCOL_ERROR: stream ended without response terminal event'), 'stream_cut');
  assert.equal(OL.midCode('OA_STREAM_PROTOCOL_ERROR: incomplete function_call arguments'), 'tool_args_cut');
  assert.equal(OL.midCode('OA_STREAM_PROTOCOL_ERROR: incomplete tool arguments JSON'), 'tool_args_cut', 'chat/completions (Groq/Kimi)');
  assert.equal(OL.midCode('OA_STREAM_PROTOCOL_ERROR: stream ended without [DONE] and finish_reason'), 'stream_cut');
  const s = OL.state(true);
  assert.equal(OL.midStream(s, e('provider error — server_error: x'), { sawText: false }).kind, 'retry');
  assert.equal(OL.midStream(s, e('provider error — server_error: x'), { sawText: false }).kind, 'stop', 'مرّة واحدة في الدور');
  assert.equal(OL.midStream(OL.state(true), e('stream ended without response terminal event'), { sawText: true }).msg, 'انقطع ردّ المزوّد في منتصفه (stream_cut)');
  assert.equal(OL.midStream(OL.state(true), e('incomplete function_call arguments'), { sawText: false }).kind, 'stop', 'استدعاء أداة مكسور: لا نداء ثانٍ');
  // أيّ عطل آخر في الخادم: المالك يرى السبب بـownerStop، وغيره «chat error» كما كان
  assert.match(read('api/_lib/chat.js'), /send\(__ownerReq \? \{ error: 'ما قدرت أردّ الحين — عطل في الخادم: ' \+ String\(\(e && e\.message\) \|\| e\)\.slice\(0, 160\), ownerStop: true \} : \{ error: 'chat error: '/);
});

test('client: an owner-solo error without a status keeps a short reason instead of the bare message', async () => {
  const checkout = read('js/app-06-checkout.js');
  const a = checkout.indexOf('var __FALLBACK_IDLE_MS');
  const b = checkout.indexOf('// ⚠️ ٦ أغسطس — سجل الأخطاء الحقيقي');
  assert.ok(a > 0 && b > a);
  const msg = async (err) => {
    const ctx = {
      localStorage: { getItem: () => 'openai' }, FUNCTIONAL_GROUPS: {}, AUTO_FALLBACK_ORDER: ['claude'], TOOL_PROVIDERS: ['claude', 'openai'],
      window: { callChatWithTools: async () => { throw err; } }, functionalLabel: (k) => k, t: (k) => k, __swallow() {}, console,
      isRefusalReply: () => false, setInterval, clearInterval, Date, Promise, Error, String, Number, callProviderAI: async () => 'x',
    };
    vm.runInNewContext(checkout.slice(a, b) + '\nthis.fb = callAIWithFallback;', ctx);
    try { await ctx.fb([{ role: 'user', content: 'غير الشكل كامل' }], null, ['openai'], { solo: true }); } catch (e) { return e.message; }
    return 'no-throw';
  };
  assert.equal(await msg(new Error('chat: empty reply')), 'ما قدرت أردّ الحين — رجع الردّ فارغًا');
  assert.equal(await msg(new Error('chat: stalled — no response')), 'ما قدرت أردّ الحين — ما وصل شي من الخادم');
  assert.equal(await msg(new Error('__chat_no_headers__')), 'ما قدرت أردّ الحين — ما وصل شي من الخادم');
  assert.equal(await msg(new TypeError('Failed to fetch')), 'ما قدرت أردّ الحين — انقطع الاتّصال');
  assert.equal(await msg(new Error('chat error: boom')), 'ما قدرت أردّ الحين — عطل في الخادم: boom');
  assert.equal(await msg(new Error('chat 500: boom')), 'ما قدرت أردّ الحين — خطأ 500', 'الرقم كما كان');
  assert.equal(await msg(Object.assign(new Error('انقطع ردّ المزوّد في منتصفه (server_error)'), { ownerStop: true })), 'انقطع ردّ المزوّد في منتصفه (server_error)', 'سبب الخادم كما هو');
});

/* v-mid-credit (لقطة المالك ١٢ أكتوبر: GPT-6.1 Sol و«السلام عليكم» ← «⚠️ انقطع ردّ المزوّد في منتصفه (insufficient_quota)» مرّتين):
   OpenAI يفتح البثّ (200) ثمّ يرسل حدث خطأ بكود الحصّة. ليس انقطاعًا ولا يُعاد النداء نفسه — يُعاد إلى سلسلة ما قبل البثّ بحالة 402:
   الوسيط للمزوّد نفسه بالموديل نفسه (كما في 429 قبل البثّ)، وإن فشل فـ«ما عندي رصيد» (أمر المالك ٨ أكتوبر). */
const QUOTA = { type: 'response.failed', response: { status: 'failed', error: { code: 'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details.' } } };
const quotaNow = (m) => sse([{ type: 'response.created', response: { model: m } }, QUOTA]);
const anthOk = (text) => new Response(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'].map((t) => 'data: ' + JSON.stringify(
  t === 'message_start' ? { type: t, message: { model: 'openai/gpt-6.1-sol', usage: { input_tokens: 1, output_tokens: 0 } } } : t === 'content_block_start' ? { type: t, index: 0, content_block: { type: 'text', text: '' } }
    : t === 'content_block_delta' ? { type: t, index: 0, delta: { type: 'text_delta', text } } : t === 'content_block_stop' ? { type: t, index: 0 } : t === 'message_delta' ? { type: t, delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } } : { type: t })).join('\n\n') + '\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
async function runQuota(replies, or) {
  const calls = []; const out = []; logged.length = 0;
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url); calls.push(u);
    let b = {}; try { b = JSON.parse(init.body); } catch (e) { b = {}; }
    if (/api\.openai\.com\/v1\/responses/.test(u)) return (replies.shift() || quotaNow)(b.model || 'gpt');
    if (/openrouter\.ai\/api\/v1\/messages/.test(u)) return or ? or(b) : new Response(JSON.stringify({ error: { message: 'Insufficient credits', code: 402 } }), { status: 402 });
    return new Response(JSON.stringify({ error: { message: 'not this one' } }), { status: 500 });
  };
  const req = { method: 'POST', headers: {}, body: { token: tok(), provider: 'openai', model: 'openai/gpt-6.1-sol', messages: [{ role: 'user', content: 'السلام عليكم ورحمة الله' }] } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push('data: ' + JSON.stringify(v) + '\n'); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { oai: calls.filter((u) => /api\.openai\.com/.test(u)).length, or: calls.filter((u) => /openrouter\.ai/.test(u)).length, events, text: events.map((e) => e.delta || '').join(''), stop: events.find((e) => e.error) || null, status: events.filter((e) => e.status).map((e) => e.status) };
}

test('insufficient_quota inside the GPT stream: no retry and no «انقطع» — the gateway continues with the same model, as after a 429 before the stream', async () => {
  const r = await runQuota([quotaNow], () => anthOk('وعليكم السلام'));
  assert.equal(r.oai, 1, 'لا إعادة للنداء نفسه: ' + r.oai);
  assert.equal(r.or, 1, 'الوسيط مرّة');
  assert.equal(r.text, 'وعليكم السلام');
  assert.equal(r.stop, null, 'لا خطأ بعد نجاح الوسيط');
  assert.ok(r.status.some((s) => /^⚠️ نموذج OpenAI · 402 غير متاح على المفتاح الحاليّ — أكمل عبر الوسيط بالموديل نفسه\.$/.test(s)), r.status.join(' | '));
  assert.ok(!r.status.some((s) => /انقطع/.test(s)), 'لا سطر «انقطع»: ' + r.status.join(' | '));
  assert.ok(logged.some((l) => /^chat\/mid-stream .*insufficient_quota/.test(l)) && logged.some((l) => /^chat\/direct-fail-402 /.test(l)), logged.join(' | '));
});

test('insufficient_quota inside the stream and the gateway has no credit either: «ما عندي رصيد» only (owner order of 8 Oct) — not «انقطع ردّ المزوّد في منتصفه (insufficient_quota)»', async () => {
  const r = await runQuota([quotaNow]);
  assert.equal(r.oai, 1);
  assert.equal(r.or, 1);
  assert.deepEqual({ error: r.stop.error, ownerStop: r.stop.ownerStop }, { error: 'ما عندي رصيد — OpenAI مباشر و OpenRouter', ownerStop: true });
  assert.ok(!r.events.some((e) => /انقطع/.test(String(e.error || e.status || ''))), 'لا «انقطع» لا حالةً ولا خطأً');
  // الوحدة: الرصيد داخل البثّ = إعادة إلى السلسلة بحالة 402 مرّة في الدور، وبعدها الرسالة القصيرة
  const e = (m) => Object.assign(new Error('OA_STREAM_PROTOCOL_ERROR: ' + m), { code: 'OA_STREAM_PROTOCOL_ERROR' });
  const s = OL.state(true);
  const q = OL.midStream(s, e('provider error — error: insufficient_quota: You exceeded your current quota, please check your plan and billing details.'), { sawText: false });
  assert.deepEqual({ kind: q.kind, status: q.status }, { kind: 'fail', status: 402 }, JSON.stringify(q));
  assert.deepEqual(OL.midStream(s, e('provider error — insufficient_quota: no credit'), { sawText: true }), { kind: 'stop', msg: 'ما عندي رصيد' }, 'مرّة واحدة في الدور');
  assert.equal(OL.midStream(OL.state(true), e('provider error — server_error: x'), { sawText: false }).kind, 'retry', 'غير الرصيد كما كان');
});
