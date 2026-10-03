'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
process.env.AUTH_SECRET = 'chat-route-credentials-test';
const usage = { allowed: true, username: 'omran' };
require.cache[rp('api/_lib/_usage.js')] = { exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => usage,
  todayCount: async () => 0, bumpCount: async () => {},
} };
require.cache[rp('api/_lib/_knowledge.js')] = { exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { exports: { fetchPlaces: async () => [] } };
require.cache[rp('api/_lib/kv.js')] = { exports: { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {} } };
const tier = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));
const realTier = tier.resolveTier;
function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const anth = () => new Response([
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'جواب' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
].map((x) => 'data: ' + JSON.stringify(x) + '\n\n').join(''), { status: 200 });
const oa = () => new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'جواب' } }] }) + '\n\ndata: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { status: 200 });
const responses = () => new Response([
  { type: 'response.created', response: { model: 'gpt-test' } },
  { type: 'response.output_text.delta', output_index: 0, delta: 'جواب' },
  { type: 'response.completed', response: { status: 'completed' } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''));
async function ask({ keys = {}, provider = 'claude', who = 'omran', account = { tier: 'owner', subscriber: true }, allowed = true, image = false, upstream }) {
  for (const k of ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'MISTRAL_API_KEY']) delete process.env[k];
  Object.assign(process.env, keys);
  usage.allowed = allowed; usage.reason = allowed ? '' : 'auth';
  usage.tier = account.tier; usage.subscriber = !!account.subscriber;
  tier.resolveTier = async () => account;
  const calls = [];
  const prev = global.fetch;
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body), headers: opts.headers });
    return upstream ? upstream(String(url)) : /api\.openai\.com\/v1\/responses/.test(String(url)) ? responses() : /api\.groq|googleapis/.test(String(url)) ? oa() : anth();
  };
  let text = ''; let jsonCalls = 0; let flushed = false;
  const res = { setHeader() {}, status() { return this; }, flushHeaders() { flushed = true; },
    json() { jsonCalls++; }, write(x) { text += x; }, end() {}, flush() {} };
  const content = image ? [{ type: 'text', text: 'اقرأ الصورة' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] : 'مرحبا';
  try { await chat({ method: 'POST', headers: {}, body: { token: token(who), provider, messages: [{ role: 'user', content }] } }, res); }
  finally { global.fetch = prev; tier.resolveTier = realTier; }
  return { calls, text, jsonCalls, flushed };
}
test('owner-only direct credentials work without Anthropic/OpenRouter', async () => {
  for (const [provider, key, url] of [['openai', 'OPENAI_API_KEY', /api\.openai\.com/], ['groq', 'GROQ_API_KEY', /api\.groq\.com/]]) {
    const r = await ask({ provider, keys: { [key]: 'test-key' } });
    assert.match(r.calls[0].url, url);
    assert.match(r.text, /جواب/);
    assert.equal(r.jsonCalls, 0);
  }
});
test('owner OpenAI without its key or OpenRouter retains explicit Anthropic fallback', async () => {
  const r = await ask({ provider: 'openai', keys: { ANTHROPIC_API_KEY: 'anth-key' } });
  assert.equal(r.calls.length, 1);
  assert.match(r.calls[0].url, /api\.anthropic\.com/);
  assert.match(r.calls[0].body.model, /^claude-/);
  assert.equal(r.calls[0].headers['x-api-key'], 'anth-key');
  assert.match(r.text, /جواب/);
});
test('paid direct and free chain use their actual keys without Anthropic', async () => {
  const paid = await ask({ who: 'sara', account: { tier: 'sub', plan: 'basic', subscriber: true }, keys: { GROQ_API_KEY: 'test-key' } });
  assert.ok(paid.calls.length, paid.text);
  assert.match(paid.calls[0].url, /api\.groq\.com/);
  const free = await ask({ who: 'sara', account: { tier: 'free', subscriber: false }, keys: { GEMINI_API_KEY: 'test-key' } });
  assert.ok(free.calls.length, free.text);
  assert.match(free.calls[0].url, /googleapis/);
  assert.match(free.text, /جواب/);
});
test('denied usage and missing credentials never fetch; post-flush errors remain SSE', async () => {
  let r = await ask({ keys: { OPENROUTER_API_KEY: 'test-key' }, allowed: false });
  assert.equal(r.calls.length, 0); assert.match(r.text, /الجلسة منتهية/);
  r = await ask({});
  assert.equal(r.calls.length, 0); assert.match(r.text, /missing|مشغول|غير متاح/i);
  assert.equal(r.jsonCalls, 0); assert.equal(r.flushed, true);
  r = await ask({ who: 'sara', account: { tier: 'free', subscriber: false } });
  assert.equal(r.calls.length, 0); assert.match(r.text, /missing provider API keys/);
});
test('free image on blind-only key fails explicitly; Gemini-only free image retains pixels', async () => {
  const account = { tier: 'free', subscriber: false };
  const blind = await ask({ who: 'sara', account, image: true, keys: { GROQ_API_KEY: 'q' } });
  assert.equal(blind.calls.length, 0);
  assert.match(blind.text, new RegExp(tier.FREE_TEXT.imageBusy));
  const vision = await ask({ who: 'sara', account, image: true, keys: { GEMINI_API_KEY: 'g' } });
  assert.match(vision.calls[0].url, /googleapis/);
  assert.equal(vision.calls[0].body.messages.at(-1).content[1].image_url.url, 'data:image/png;base64,AAAA');
});
test('paid image excludes DeepSeek/Groq fallbacks even when Gemini fails', async () => {
  const account = { tier: 'sub', plan: 'basic', subscriber: true };
  // v-img-why: نماذج OpenRouter المجّانيّة التي ترى تدخل دور الصورة (وحدها) — النيّة نفسها: لا Groq ولا DeepSeek ولا نموذج أعمى
  const VISION = tier.FREE_PROVIDER_SPECS.openrouter.visionModels;
  const seesOnly = (calls) => calls.every((x) => /googleapis/.test(x.url)
    || (/openrouter\.ai/.test(x.url) && VISION.includes(x.body.model) && x.body.messages.at(-1).content.some((c) => c.type === 'image_url')));
  const noVision = await ask({ who: 'sara', account, image: true, keys: { GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'or' } });
  assert.ok(noVision.calls.length && seesOnly(noVision.calls), JSON.stringify(noVision.calls.map((x) => x.url + ' ' + x.body.model)));
  assert.ok(!noVision.calls.some((x) => /groq|deepseek/i.test(x.url + ' ' + x.body.model)));
  assert.match(noVision.text, new RegExp(tier.FREE_TEXT.imageBusy));
  const r = await ask({ who: 'sara', account, image: true,
    keys: { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'or' },
    upstream: () => new Response('quota', { status: 429 }) });
  assert.ok(r.calls.length);
  assert.ok(seesOnly(r.calls), JSON.stringify(r.calls.map((x) => x.url + ' ' + x.body.model)));
  assert.ok(/googleapis/.test(r.calls[0].url), 'Gemini أوّلًا');
  assert.ok(!r.calls.some((x) => /groq|deepseek/i.test(x.url + ' ' + x.body.model)));
  assert.match(r.text, new RegExp(tier.FREE_TEXT.imageBusy));
});
test('owner Groq image cannot be routed to text-only direct model', async () => {
  const noVision = await ask({ provider: 'groq', image: true, keys: { GROQ_API_KEY: 'q' } });
  assert.equal(noVision.calls.length, 0);
  assert.match(noVision.text, new RegExp(tier.FREE_TEXT.imageBusy));
  const hasVision = await ask({ provider: 'groq', image: true, keys: { GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'or' } });
  assert.match(hasVision.calls[0].url, /openrouter\.ai/);
  assert.match(hasVision.calls[0].body.model, /anthropic\//);
  assert.equal(hasVision.calls[0].body.messages.at(-1).content[1].source.data, 'AAAA');
});
test('malformed direct tool arguments produce SSE error, no tool invocation or normal done', async () => {
  const bad = () => new Response([
    { model: 'test', choices: [{ delta: { tool_calls: [{ index: 0, id: 'call1', type: 'function', function: { name: 'run_js', arguments: '{"code":' } }] } }] },
    { model: 'test', choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ].map((ev) => 'data: ' + JSON.stringify(ev) + '\n\n').join('') + 'data: [DONE]\n\n');
  const r = await ask({ keys: { GROQ_API_KEY: 'q' }, provider: 'groq', upstream: bad });
  assert.equal(r.calls.length, 1, 'no next upstream tool turn');
  assert.match(r.text, /OA_STREAM_PROTOCOL_ERROR/);
  assert.doesNotMatch(r.text, /"done":true|يشغّل كودًا/);
  assert.equal(r.jsonCalls, 0);
});