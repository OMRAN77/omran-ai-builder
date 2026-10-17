'use strict';
/* v-owner-light (المالك ١٣ أكتوبر: «اريد سرعة التفكير في الردود العاديه — افهم شو الي اريده بالضبط»، واختار أن يبقى البحث في كلّ
   سؤال): دور المالك ثلاث درجات — quick المجاملة فوريّة (v-owner-auto)، وdeep الشغل الثقيل بتفكير الموديل الكامل، وlight الردّ العاديّ
   يفكّر ويظهر تفكيره لكن بالجهد الأدنى (كروك high — v-grok-high-feed). المعالج الحقيقيّ (api/_lib/chat.js) بمزوّد مزيّف يسجّل كلّ طلب: كروك على الوسيط، وGPT
   المباشر، وكلود المباشر؛ ورفض الجهد يُعاد بلاه ويُذكر، و400 توقيع التفكير لا يُتّهم به الجهد. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'owner-light-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'CHAT_OPENAI_MODEL', 'CHAT_CLAUDE_MODEL', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'TAVILY_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {},
});
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'omran' }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const ot = require(rp('api/_lib/owner-think.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (chunks) => new Response(chunks.map((c) => 'data: ' + JSON.stringify(c) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const anthropicText = (text) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const oaResp = (text) => new Response([
  { type: 'response.created', response: { model: 'gpt-6-astra' } },
  { type: 'response.output_text.delta', output_index: 0, delta: text },
  { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200 });
const err400 = (message) => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }), { status: 400 });

async function run({ provider, model, text, effort, script }) {
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    const u = String(url);
    if (!/openrouter\.ai|api\.anthropic\.com|api\.openai\.com/.test(u)) return new Response('{}', { status: 404 });
    calls.push({ url: u, body: JSON.parse(options.body) });
    const step = script[Math.min(i++, script.length - 1)];
    return step();
  };
  const out = [];
  const req = { method: 'POST', headers: {}, body: Object.assign({ messages: [{ role: 'user', content: text }], token: token('omran'), provider, model }, effort ? { effort } : {}) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flush() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  return { calls };
}

test('١. الدرجات: المجاملة فوريّة، والردّ العاديّ light، والشغل الثقيل deep (كود، تحليل، طلب شغل على التطبيق، متابعة كود، صورة)', () => {
  for (const s of ['السلام', 'شكرًا', 'هلا والله', 'تمام']) assert.equal(ot.ownerThinkLevel(s, {}), 'quick', s);
  for (const s of ['ليش السماء زرقاء', 'كم سعر الذهب اليوم', 'وش رأيك في فيلم الأمس', 'عطني معلومات عن الامارات العربية والسعوديه', 'ترجم لي هذي الجملة', 'من هو الشيخ زايد'])
    assert.equal(ot.ownerThinkLevel(s, {}), 'light', s);
  for (const s of ['حلّل لي هذا التقرير', 'قارن بين آيفون وسامسونج', 'اعمل لي موقع لمطعمي', 'فيه bug في الكود', 'صلّح البطاقات', 'عدّل الزرّ في الصفحة', 'ادمج وانشر', 'كمّل', 'سطر\n'.repeat(8)])
    assert.equal(ot.ownerThinkLevel(s, {}), 'deep', s.slice(0, 20));
  assert.equal(ot.ownerThinkLevel('وش هذا', { image: true }), 'deep', 'الصورة');
  assert.equal(ot.ownerThinkLevel('طيب وبعدين؟', { history: [{ role: 'assistant', content: '```js\nx\n```' }] }), 'deep', 'متابعة محادثة كود');
  assert.equal(ot.ownerThinks('ليش السماء زرقاء', {}), true, 'light يفكّر ويظهر تفكيره (v-owner-think-all باقٍ)');
});

test('٢. حقول الجهد الأدنى لكلّ مزوّد: GPT وكلود بدوالّهما، والوسيط output_config.effort، وكروك high، وCohere والمباشر لغير GPT وHaiku 4.5 بلا شيء', () => {
  ot.__deadEffort.clear();
  assert.deepEqual(ot.lightEffortFields('openai', 'gpt-6-astra', false, {}, false), { output_config: { effort: 'low' } });
  assert.deepEqual(ot.lightEffortFields('openai', 'openai/gpt-6-astra', true, null, false), { output_config: { effort: 'low' } });
  assert.deepEqual(ot.lightEffortFields('claude', 'claude-opus-5-5', false, null, false), { output_config: { effort: 'low' } });
  assert.equal(ot.lightEffortFields('claude', 'claude-haiku-4-5', false, null, false), null, 'Haiku 4.5 يرفض الجهد');
  assert.deepEqual(ot.lightEffortFields('openrouter', 'x-ai/grok-4.6', true, null, false), { output_config: { effort: 'high' } }, 'كروك عبر الوسيط — v-grok-high-feed');
  assert.deepEqual(ot.lightEffortFields('openrouter', 'x-ai/grok-4.20', true, null, false), { output_config: { effort: 'high' } }, 'كروك 4.20 كذلك');
  assert.deepEqual(ot.lightEffortFields('openrouter', 'qwen/qwen3.6-27b', true, null, false), { output_config: { effort: 'low' } }, 'Qwen على صفّ الوسيط يبقى low');
  assert.deepEqual(ot.lightEffortFields('gemini', 'google/gemini-3.8-flash', true, null, false), { output_config: { effort: 'low' } });
  assert.equal(ot.lightEffortFields('cohere', 'cohere/command-a', true, null, false), null, 'v-cohere-reasoning');
  assert.equal(ot.lightEffortFields('groq', 'openai/gpt-oss-120b', false, { prov: 'groq' }, false), null, 'المباشر لغير GPT كما كان');
  ot.forgetEffort('x-ai/grok-4.6');
  assert.equal(ot.lightEffortFields('openrouter', 'x-ai/grok-4.6', true, null, false), null, 'الرفض المحفوظ لا يُعاد');
  ot.__deadEffort.clear();
});

test('٣. كروك (الوسيط): السؤال العاديّ بجهد high وتفكيره ظاهر (تكيّفيّ)، والتحليل بتفكيره الكامل بلا جهد', async () => {
  ot.__deadEffort.clear();
  let r = await run({ provider: 'openrouter', model: 'x-ai/grok-4.6', text: 'ليش السماء زرقاء؟', script: [() => anthropicText('لأنّ…')] });
  assert.match(r.calls[0].url, /openrouter\.ai/);
  assert.equal(r.calls[0].body.model, 'x-ai/grok-4.6');
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'high' });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'adaptive' }, 'التفكير ظاهر للمالك (v-think-talk-all)');
  r = await run({ provider: 'openrouter', model: 'x-ai/grok-4.6', text: 'حلّل لي هذا التقرير بالتفصيل', script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.output_config, undefined, 'الثقيل بجهد الموديل الكامل');
  assert.deepEqual(r.calls[0].body.thinking, { type: 'adaptive' });
  r = await run({ provider: 'openrouter', model: 'qwen/qwen3.6-27b', text: 'ليش السماء زرقاء؟', script: [() => anthropicText('لأنّ…')] });
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'low' }, 'Qwen في الدور العاديّ يبقى low');
});

test('٤. كروك يرفض الجهد (400) ← إعادة فوريّة بالموديل نفسه بلاه، ويُذكَر فلا يتكرّر', async () => {
  ot.__deadEffort.clear();
  try {
    let r = await run({ provider: 'openrouter', model: 'x-ai/grok-4.6', text: 'وش رأيك في فيلم الأمس؟',
      script: [() => err400('reasoning effort is not supported for this model'), () => anthropicText('رأيي…')] });
    assert.equal(r.calls.length, 2);
    assert.deepEqual(r.calls[0].body.output_config, { effort: 'high' });
    assert.equal(r.calls[1].body.output_config, undefined);
    assert.equal(r.calls[1].body.model, 'x-ai/grok-4.6', 'لا هبوط لموديل آخر');
    r = await run({ provider: 'openrouter', model: 'x-ai/grok-4.6', text: 'وش رأيك في فيلم الأمس؟', script: [() => anthropicText('تم')] });
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].body.output_config, undefined, 'الرفض محفوظ');
  } finally { ot.__deadEffort.clear(); }
});

test('٥. GPT-6 Astra المباشر: السؤال العاديّ reasoning low مع الملخّص (التفكير ظاهر)، والكود بافتراضيّه، وجهد المنتقي يغلب', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  ot.__deadEffort.clear();
  try {
    let r = await run({ provider: 'openai', model: 'openai/gpt-6-astra', text: 'كم سعر الذهب اليوم؟', script: [() => oaResp('السعر…')] });
    assert.equal(r.calls[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(r.calls[0].body.reasoning.effort, 'low');
    assert.ok(r.calls[0].body.reasoning.summary, 'الملخّص يُطلب: التفكير ظاهر');
    r = await run({ provider: 'openai', model: 'openai/gpt-6-astra', text: 'فيه bug في الكود هذا', script: [() => oaResp('تم')] });
    assert.equal(r.calls[0].body.reasoning.effort, undefined, 'الثقيل بافتراضيّ الموديل');
    r = await run({ provider: 'openai', model: 'openai/gpt-6-astra', text: 'كم سعر الذهب اليوم؟', effort: 'high', script: [() => oaResp('تم')] });
    assert.equal(r.calls[0].body.reasoning.effort, 'high', 'اختيار المالك من المنتقي يغلب');
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('٦. كلود المباشر (Opus 5.5): السؤال العاديّ low مع عرض التفكير، والثقيل بلا جهد، والتحيّة فوريّة كما كانت', async () => {
  ot.__deadEffort.clear();
  let r = await run({ provider: 'claude', model: 'claude-opus-5-5', text: 'ليش السماء زرقاء؟', script: [() => anthropicText('لأنّ…')] });
  assert.equal(r.calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'low' });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'adaptive', display: 'summarized' }, 'التفكير ظاهر');
  r = await run({ provider: 'claude', model: 'claude-opus-5-5', text: 'اعمل لي موقع لمطعمي', script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.output_config, undefined);
  r = await run({ provider: 'claude', model: 'claude-opus-5-5', text: 'السلام', script: [() => anthropicText('وعليكم السلام')] });
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'low' });
  assert.equal(r.calls[0].body.thinking, undefined, 'المجاملة بلا عرض (v-owner-auto)');
});
