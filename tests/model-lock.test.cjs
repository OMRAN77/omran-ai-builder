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
  pro: { allowed: true, username: 'pro1', tier: 'sub', subscriber: true, plan: 'pro' },
  max: { allowed: true, username: 'max1', tier: 'sub', subscriber: true, plan: 'max' },
  legacy: { allowed: true, username: 'leg', tier: 'sub', subscriber: true, plan: 'legacy' }, // اشتراك بباقة لا جدول لها = لا كلود
  owner: { allowed: true, username: 'omran', tier: 'owner', subscriber: true },
};
const counts = {};
const buckets = [];
mock('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async (token, gid, provider, ip, opts) => { buckets.push({ provider, chatBucket: !!(opts && opts.chatBucket) }); return WHO[token]; },
  todayCount: async (u, b) => counts[u + ':' + b] || 0,
  bumpCount: async (u, b) => { counts[u + ':' + b] = (counts[u + ':' + b] || 0) + 1; },
  // v-meter-atomic: حجز ذرّيّ — fillOnTake يحاكي طلبًا متزامنًا ملأ المقياس بين القراءة والحجز
  takeMeter: async (u, b, cap) => { const k = u + ':' + b; taken.push(k); if (fillOnTake.includes(b)) counts[k] = cap; if ((counts[k] || 0) >= cap) return false; counts[k] = (counts[k] || 0) + 1; return true; },
  giveMeter: async (u, b) => { const k = u + ':' + b; given.push(k); counts[k] = Math.max(0, (counts[k] || 0) - 1); },
});
let fillOnTake = [];
const given = [];
const taken = []; // كلّ محاولة حجز (مقبولة أو مرفوضة)
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
  assert.equal(guardModel('openrouter', 'anthropic/claude-opus-4.6', false), 'google/gemma-4-31b-it:free'); // v-plan-models: أوّل :free الحيّ
  assert.equal(guardModel('openrouter', 'qwen/qwen3-235b-a22b:free', false), 'qwen/qwen3-235b-a22b:free');
  assert.equal(guardModel('openrouter', 'z-ai/glm-5.2:free', false), 'z-ai/glm-5.2:free');
  assert.equal(guardModel('openrouter', 'nvidia/nemotron-3-ultra-550b-a55b:free', false), 'nvidia/nemotron-3-ultra-550b-a55b:free');
  assert.equal(guardModel('openrouter', 'z-ai/glm-5.2', false), 'google/gemma-4-31b-it:free', 'النسخة المدفوعة (بلا :free) لا تمرّ');
  assert.equal(guardModel('openrouter', 'anthropic/claude-opus-4.6', true), 'anthropic/claude-opus-4.6');
  assert.equal(guardModel('gemini', 'gemini-3.1-pro-preview', false), 'gemini-flash-latest');
  assert.equal(guardModel('gemini', 'gemini-2.5-flash-image', false), 'gemini-flash-latest', 'لا نماذج صور ببلاش');
  assert.equal(guardModel('gemini', 'gemini-3-flash-preview', false), 'gemini-3-flash-preview');
  assert.equal(guardModel('mistral', 'mistral-large-latest', false), 'mistral-small-latest');
  assert.equal(guardModel('perplexity', 'sonar-deep-research', false), 'sonar');
  assert.equal(guardModel('groq', 'openai/gpt-oss-120b', false), 'openai/gpt-oss-120b');
  assert.equal(guardModel('groq', 'openai/gpt-oss-20b', false), 'openai/gpt-oss-20b');
  assert.equal(guardModel('groq', 'some/expensive-model', false), '', 'الفارغ = مرشّحو Groq المعروفون');
});

test('٢. /api/openrouter: المجّانيّ يطلب Opus ← نموذج :free، والمالك يصل ما طلب', async () => {
  let r = await hit('openrouter.js', { token: 'free', model: 'anthropic/claude-opus-4.6' });
  assert.equal(r.sent[0].body.model, 'google/gemma-4-31b-it:free');
  r = await hit('openrouter.js', { token: 'owner', model: 'anthropic/claude-opus-4.6' });
  assert.equal(r.sent[0].body.model, 'anthropic/claude-opus-4.6');
});

test('٣. /api/gemini: المجّانيّ يطلب Pro أو نموذج صور ← فلاش', async () => {
  for (const m of ['gemini-3.1-pro-preview', 'gemini-2.5-flash-image']) {
    const r = await hit('gemini.js', { token: 'free', model: m, contents: [{ role: 'user', parts: [{ text: 'هلا' }] }] });
    assert.match(r.sent[0].url, /models\/gemini-flash-latest:/, m);
  }
});

test('٤. /api/claude (v-plan-models): Plus ‏Haiku 5.5 بلا مقياس، Pro (كوده Mistral) ‏Haiku 5.5، Max ‏Sonnet 5.5 بحدّه ثمّ Haiku 5.5، وباقة بلا كلود 402 بلا نداء؛ المالك كما طلب', async () => {
  let r = await hit('claude.js', { token: 'plus', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-haiku-5-5');
  assert.equal(r.sent[0].body.max_tokens, 16000);
  assert.deepEqual(taken, [], 'Plus بلا مقياس للموديل — سقفه سلّة الباقة وحدها');
  counts['pam:plan-haiku'] = 5; // المقياس القديم (٥ Haiku) لم يعد يقفل Plus
  r = await hit('claude.js', { token: 'plus', model: 'claude-opus-5' });
  assert.equal(r.res.code, 200);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].body.model, 'claude-haiku-5-5', 'لا نموذج العميل (Opus) ولا 402');
  r = await hit('claude.js', { token: 'pro', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-haiku-5-5', 'كود Pro على Mistral Large 3 — هذا الرابط كلود وحده فأوّل كلود في الوظيفة');
  assert.equal(r.sent[0].body.max_tokens, 16000);
  assert.deepEqual(taken, [], 'Haiku 5.5 في Pro بلا مقياس — لا يُحجز مقياس Gemini');
  r = await hit('claude.js', { token: 'max', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-sonnet-5-5');
  assert.equal(counts['max1:plan-premium'], 1, 'يُعدّ في حدّ Max المميّز اليوميّ (Sol وSonnet 5.5 معًا)');
  counts['max1:plan-premium'] = 100;
  r = await hit('claude.js', { token: 'max', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-haiku-5-5', 'بعد ١٠٠ مميّز ← Haiku 5.5');
  assert.equal(counts['max1:plan-premium'], 100, 'لا حجز فوق الحدّ');
  r = await hit('claude.js', { token: 'legacy', model: 'claude-opus-5' });
  assert.equal(r.res.code, 402);
  assert.equal(r.res.j.reason, 'engine_limit');
  assert.equal(r.sent.length, 0, 'لا كلود في جدول الباقة = لا نداء');
  r = await hit('claude.js', { token: 'owner', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-opus-5');
  assert.equal(r.sent[0].body.max_tokens, 32000);
});

test('٤-ب. v-meter-atomic: /api/claude — مقياس امتلأ للتوّ يُعيد التوجيه (Sonnet 5.5 ← Haiku 5.5)، والمسار بلا مقياس لا يحجز، وفشل المزوّد يردّ الحجز', async () => {
  for (const k of Object.keys(counts)) delete counts[k];
  taken.length = 0;
  fillOnTake = ['plan-premium'];
  let r = await hit('claude.js', { token: 'max', model: 'claude-opus-5' });
  assert.equal(r.sent[0].body.model, 'claude-haiku-5-5', 'المميّز امتلأ بين القراءة والحجز');
  assert.deepEqual(taken, ['max1:plan-premium'], 'حجز واحد رُفض ثمّ Haiku 5.5 بلا حجز');
  assert.deepEqual(counts, { 'max1:plan-premium': 100 }, 'لا عدّاد فوق الحدّ');
  fillOnTake = ['plan-haiku', 'plan-premium', 'plan-gemini'];
  taken.length = 0;
  r = await hit('claude.js', { token: 'plus', model: 'x' });
  assert.equal(r.sent[0].body.model, 'claude-haiku-5-5', 'Plus بلا مقياس — لا شيء يمتلئ');
  assert.deepEqual(taken, [], 'لا takeMeter لمسار بلا مقياس');
  fillOnTake = [];
  for (const k of Object.keys(counts)) delete counts[k];
  assert.deepEqual(given, [], 'ما خدمه المزوّد لا يُردّ');
  const realFetch = global.fetch;
  global.fetch = async () => new Response('{"error":"overloaded"}', { status: 400 });
  try { r = await hit('claude.js', { token: 'max', model: 'x' }); } finally { global.fetch = realFetch; }
  assert.equal(r.res.code, 400);
  assert.deepEqual([given, counts['max1:plan-premium']], [['max1:plan-premium'], 0], 'لم يخدم المزوّد — الحجز رُدّ');
  global.fetch = async () => new Response('{"error":"overloaded"}', { status: 400 });
  try { r = await hit('claude.js', { token: 'plus', model: 'x' }); } finally { global.fetch = realFetch; }
  assert.equal(r.res.code, 400);
  assert.deepEqual(given, ['max1:plan-premium'], 'بلا حجز لا ردّ');
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
