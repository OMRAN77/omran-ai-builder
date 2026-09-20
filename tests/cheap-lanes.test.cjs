// v-cheap-lanes (١٨ سبتمبر ٢٠٢٦): المسارات العامّة بلا اشتراك (تيليجرام، الأسهم) تذهب أوّلًا
// للسلسلة الرخيصة بترتيبها، والمحرّك الاحترافيّ احتياطًا أخيرًا فقط.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const fc = require('../api/_lib/free-chain.js');

function completion(text) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('completeFreeChain: بترتيب السلسلة، والفاشل يُتخطّى، وأوّل نصّ يُرجَع مع مزوّده', async () => {
  // الترتيب صريح: الاختبار عن التخطّي لا عن الافتراضيّ (v-plan-routing جعل Groq أوّلًا).
  const env = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', MISTRAL_API_KEY: 'm', FREE_CHAIN: 'gemini,groq,mistral' };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (/googleapis/.test(url)) return new Response('quota', { status: 429 });
    return completion('  درس عن السوق  ');
  };
  const r = await fc.completeFreeChain({ messages: [{ role: 'user', content: 'علّمني' }], max_tokens: 500, env, fetchImpl, now: 1000 });
  assert.equal(r.ok, true); assert.equal(r.provider, 'groq'); assert.equal(r.text, 'درس عن السوق');
  assert.equal(r.model, 'openai/gpt-oss-120b');
  assert.match(calls[0], /googleapis/); assert.match(calls[1], /groq/);
  assert.ok(!calls.some((u) => /anthropic/.test(u)), 'لا نداء للمحرّك الاحترافيّ');
  assert.match(r.errors[0], /^gemini: http 429/);
  fc.__workingModel.clear();
});

test('completeFreeChain: الكلّ فاشل → ok:false بأسباب بلا مفاتيح؛ وبلا مفاتيح أصلًا → ok:false فورًا', async () => {
  const env = { GROQ_API_KEY: 'q' };
  const fetchImpl = async () => new Response('key sk-abcdefghijklmnopqrstuvwxyz0123 bad', { status: 401 });
  const r = await fc.completeFreeChain({ messages: [{ role: 'user', content: 'x' }], env, fetchImpl });
  assert.equal(r.ok, false); assert.equal(r.text, '');
  assert.match(r.errors[0], /^groq: http 401/);
  assert.doesNotMatch(r.errors.join(' '), /sk-abcdefghijklmnopqrstuvwxyz0123/, 'لا مفتاح في التشخيص');
  let called = 0;
  const none = await fc.completeFreeChain({ messages: [{ role: 'user', content: 'x' }], env: {}, fetchImpl: async () => { called++; return completion('x'); } });
  assert.equal(none.ok, false); assert.equal(called, 0);
  fc.__workingModel.clear();
});

test('completeFreeChain: requireVision يقصر السلسلة على من يرى', async () => {
  const env = { GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g', FREE_CHAIN: 'groq,gemini' };
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return completion('رأيت'); };
  const r = await fc.completeFreeChain({ messages: [{ role: 'user', content: 'x' }], env, fetchImpl, requireVision: true });
  assert.equal(r.provider, 'gemini'); assert.equal(calls.length, 1);
  fc.__workingModel.clear();
});

test('telegram.js: السلسلة الرخيصة قبل المحرّك الاحترافيّ، وهو احتياط فقط', () => {
  const src = read('api/telegram.js');
  const cheap = src.indexOf("completeFreeChain({ messages: [{ role: 'system', content: SYSTEM }].concat(hist), max_tokens: 1500 })");
  const claude = src.indexOf("if (!out) out = await callClaude('claude-sonnet-5');");
  assert.ok(cheap > 0 && claude > cheap, 'الرخيص أوّلًا ثمّ الاحترافيّ عند الفشل فقط');
  assert.equal((src.match(/callClaude\('claude-sonnet-5'\)/g) || []).length, 1);
});

test('stocks.js: learn وanalyze يجرّبان السلسلة الرخيصة أوّلًا ويرجعان بلا claudeError عند نجاحها', () => {
  const src = read('api/_lib/stocks.js');
  assert.match(src, /async function cheapText\(prompt, maxTokens\)/);
  assert.match(src, /const cheapLesson = await cheapText\(prompt, 1600\);\n\s+if \(cheapLesson\) \{ res\.status\(200\)\.json\(\{ live, lesson: cheapLesson \}\); return; \}\n\s+let ar = await callClaude\('claude-sonnet-5'\);/);
  assert.match(src, /const cheapAnalysis = await cheapText\(prompt, 1500\);\n\s+if \(cheapAnalysis\) \{ res\.status\(200\)\.json\(\{ facts, analysis: cheapAnalysis \}\); return; \}\n\s+let ar = await callClaude\('claude-sonnet-5'\);/);
});
