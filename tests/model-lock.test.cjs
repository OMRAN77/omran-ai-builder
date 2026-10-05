// tests/model-lock.test.cjs — v-model-lock (فحص الاشتراكات ٥ أكتوبر ٢٠٢٦): روابط المزوّدين المباشرة كانت تمرّر اسم النموذج
// الذي يرسله العميل كما هو — حساب مجّانيّ يشغّل أغلى نموذج في OpenRouter على مفتاح المالك (٣٠ ألف توكن)، ومشترك يطلب
// Opus عبر /api/claude بلا خصم، و«ابني» يرسل لكلّ مستخدم إلى Sonnet خارج حدود الباقة. الآن لغير المالك وVIP:
// نموذج من قائمة رخيصة، وكلود بنموذج الباقة وحدودها اليوميّة؛ والحدّ اليوميّ سلّة واحدة (يُختبر في free-20-shared-bucket).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'model-lock-secret';
process.env.OPENROUTER_API_KEY = 'or-test';
process.env.GEMINI_API_KEY = 'g-test';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.OPENAI_API_KEY = 'sk-oa-test';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const WHO = {
  free: { allowed: true, username: 'fay', tier: 'free', subscriber: false, plan: null },
  plus: { allowed: true, username: 'pam', tier: 'sub', subscriber: true, plan: 'basic' },
  max: { allowed: true, username: 'max1', tier: 'sub', subscriber: true, plan: 'max' },
  owner: { allowed: true, username: 'omran', tier: 'owner', subscriber: true },
};
const counts = {};
const buckets = [];
mock('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async (token, gid, provider, ip, opts) => { buckets.push({ provider, chatBucket: !!(opts && opts.chatBucket) }); return WHO[token]; },
  todayCount: async (u, b) => counts[u + ':' + b] || 0,
  bumpCount: async (u, b) => { counts[u + ':' + b] = (counts[u + ':' + b] || 0) + 1; },
});
mock('api/_lib/kv.js', { kvGetRaw: async () => null, kvGetJSON: async () => null, kvPutJSON: async () => {}, kvPipeline: async (c) => c.map(() => null) });

const { guardModel } = require(rp('api/_lib/_model-guard.js'));
let sent = [];
global.fetch = async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : null;
  sent.push({ url: String(url), body });
  if (/anthropic/.test(url)) return new Response(JSON.stringify({ content: [{ type: 'text', text: 'تم' }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  if (/generativelanguage/.test(url)) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'تم' }] } }] }), { status: 200 });
  return new Response(JSON.stringify({ choices: [{ message: { content: 'تم' } }] }), { status: 200 });
};
async function hit(file, body) {
  sent = [];
  const h = require(rp('api/_lib/' + file));
  const res = { code: 200, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send(b) { res.j = b; return res; }, end() { return res; }, write() {}, flushHeaders() {} };
  await h({ method: 'POST', headers: {}, body: Object.assign({ messages: [{ role: 'user', content: 'هلا' }] }, body) }, res);
  return { res, sent };
}

test('١. الحارس: غير المالك يُعاد لنموذج رخيص مسموح، والمالك وVIP كما طلبا', () => {
  assert.equal(guardModel('openrouter', 'anthropic/claude-opus-4.6', false), 'meta-llama/llama-4-maverick:free');
  assert.equal(guardModel('openrouter', 'qwen/qwen3-235b-a22b:free', false), 'qwen/qwen3-235b-a22b:free');
  assert.equal(guardModel('openrouter', 'anthropic/claude-opus-4.6', true), 'anthropic/claude-opus-4.6');
  assert.equal(guardModel('gemini', 'gemini-3.1-pro-preview', false), 'gemini-flash-latest');
  assert.equal(guardModel('gemini', 'gemini-2.5-flash-image', false), 'gemini-flash-latest', 'لا نماذج صور ببلاش');
  assert.equal(guardModel('gemini', 'gemini-3-flash-preview', false), 'gemini-3-flash-preview');
  assert.equal(guardModel('mistral', 'mistral-large-latest', false), 'mistral-small-latest');
  assert.equal(guardModel('perplexity', 'sonar-deep-research', false), 'sonar');
  assert.equal(guardModel('groq', 'openai/gpt-oss-120b', false), 'openai/gpt-oss-120b');
  assert.equal(guardModel('groq', 'some/expensive-model', false), '', 'الفارغ = مرشّحو Groq المعروفون');
});

test('٢. /api/openrouter: المجّانيّ يطلب Opus ← نموذج :free، والمالك يصل ما طلب', async () => {
  let r = await hit('openrouter.js', { token: 'free', model: 'anthropic/claude-opus-4.6' });
  assert.equal(r.sent[0].body.model, 'meta-llama/llama-4-maverick:free');
  r = await hit('openrouter.js', { token: 'owner', model: 'anthropic/claude-opus-4.6' });
  assert.equal(r.sent[0].body.model, 'anthropic/claude-opus-4.6');
});

test('٣. /api/gemini: المجّانيّ يطلب Pro أو نموذج صور ← فلاش', async () => {
  for (const m of ['gemini-3.1-pro-preview', 'gemini-2.5-flash-image']) {
    const r = await hit('gemini.js', { token: 'free', model: m, contents: [{ role: 'user', parts: [{ text: 'هلا' }] }] });
    assert.match(r.sent[0].url, /models\/gemini-flash-latest:/, m);
  }
});

test('٤. /api/claude: Plus ‏Haiku بحدّه، Max ‏Sonnet ثمّ Haiku، وبعد الحدود 402 بلا نداء؛ المالك كما طلب', async () => {
  let r = await hit('claude.js', { token: 'plus', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-haiku-4-5');
  assert.equal(r.sent[0].body.max_tokens, 16000);
  assert.equal(counts['pam:plan-haiku'], 1, 'يُعدّ في حدّ Haiku اليوميّ نفسه');
  counts['pam:plan-haiku'] = 5;
  r = await hit('claude.js', { token: 'plus', model: 'claude-opus-5' });
  assert.equal(r.res.code, 402);
  assert.equal(r.res.j.reason, 'engine_limit');
  assert.equal(r.sent.length, 0, 'لا نداء بعد الحدّ');
  r = await hit('claude.js', { token: 'max', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-sonnet-5');
  counts['max1:plan-sonnet'] = 30;
  r = await hit('claude.js', { token: 'max', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-haiku-4-5', 'بعد ٣٠ Sonnet ← Haiku');
  r = await hit('claude.js', { token: 'owner', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-opus-5');
  assert.equal(r.sent[0].body.max_tokens, 32000);
});

test('٥. /api/openai بلا 👑: اسم النموذج الاحترافيّ لا يتخطّى خصم النقاط — الخفيف الافتراضيّ', async () => {
  const r = await hit('openai.js', { token: 'plus', model: 'gpt-6-astra' });
  assert.ok(r.sent.length >= 1);
  assert.notEqual(r.sent[0].body.model, 'gpt-6-astra');
});

test('٦. الروابط المباشرة والوكيل تُعدّ في سلّة الباقة الواحدة (chatBucket)', async () => {
  buckets.length = 0;
  await hit('claude.js', { token: 'owner', model: 'x' });
  await hit('openai.js', { token: 'owner', model: 'x' });
  assert.ok(buckets.every((b) => b.chatBucket), JSON.stringify(buckets));
  const fs = require('node:fs');
  for (const f of ['deepseek.js', 'cohere.js', 'perplexity.js', 'agent.js']) assert.match(fs.readFileSync(path.join(root, 'api/_lib', f), 'utf8'), /checkAndConsume\(token, guestId, '[\w-]+', clientIp\(req\), \{ chatBucket: true \}\)/, f);
  assert.match(fs.readFileSync(path.join(root, 'api/_lib/_usage.js'), 'utf8'), /const bucketKey = chatBucket \? \(tier\.subscriber \? 'plan' : 'chat'\) : providerKey;/);
});
