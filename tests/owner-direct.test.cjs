'use strict';
/* v-owner-direct + v-owner-memory + v-owner-reason (أمر المالك ٢٢ سبتمبر): «اربط Groq مباشرة بمفتاحه… وGPT. الردود
   ليست حقيقيّة — كلاود في التطبيق يختلف اختلاف كبير… المحادثة شبه ضعيفة، وأريد صلاحيّة كاملة لي».
   (١) Groq وGPT للمالك بمفتاح المزوّد نفسه، بجسر بروتوكول يحفظ حلقة الأدوات؛ فشله = الوسيط مع سطر حالة.
   (٢) المحادثة كاملة للمالك (الخادم والعميل) بدل ١٤ رسالة/٣٢ ألف حرف، مع إعادة مضغوطة عند تجاوز النافذة.
   (٣) لا إطفاء لتفكير موديلات الوسيط للمالك. غير المالك: لا تغيير في أيّ منها. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'owner-direct-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.CHAT_GROQ_MODEL;
delete process.env.CHAT_OPENAI_MODEL;

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
let usageUser = 'omran';
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: usageUser }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const chat = require(rp('api/_lib/chat.js'));
const od = require(rp('api/_lib/oa-direct.js'));
const pm = require(rp('api/_lib/provider-models.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
const sse = (chunks) => new Response(chunks.map((c) => 'data: ' + (typeof c === 'string' ? c : JSON.stringify(c)) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const anthropicText = (text) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const oaText = (text, model) => sse([
  { model: model || 'openai/gpt-oss-120b', choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
  { model: model || 'openai/gpt-oss-120b', choices: [{ index: 0, delta: { content: text } }] },
  { model: model || 'openai/gpt-oss-120b', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], x_groq: { usage: { prompt_tokens: 50, completion_tokens: 3 } } },
  '[DONE]',
]);

async function run({ user, provider, messages, model, script }) {
  usageUser = user;
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers || {}, body: JSON.parse(options.body) });
    const step = script[Math.min(i++, script.length - 1)];
    return typeof step === 'function' ? step() : step;
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: { messages, token: token(user), provider, model } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events, text: events.filter((e) => e.delta).map((e) => e.delta).join('') };
}
const ask = (t) => [{ role: 'user', content: t }];

test('١. الجسر: جسم أنثروبيك ← chat/completions (نظام، نصّ، نداء أداة، نتيجته، أدوات، سقف الخرج)', () => {
  const body = od.toOpenAIBody({
    model: 'm', max_tokens: 16000, stream: true,
    system: [{ type: 'text', text: 'نظام', cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: 'سؤال' },
      { role: 'assistant', content: [{ type: 'text', text: 'أبحث' }, { type: 'tool_use', id: 't1', name: 'web_search', input: { query: 'q' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'نتيجة' }] },
    ],
    tools: [{ name: 'web_search', description: 'd', input_schema: { type: 'object', properties: { query: { type: 'string' } } } }],
    thinking: { type: 'disabled' },
  }, 'groq');
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'نظام' },
    { role: 'user', content: 'سؤال' },
    { role: 'assistant', content: 'أبحث', tool_calls: [{ id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"q"}' } }] },
    { role: 'tool', tool_call_id: 't1', content: 'نتيجة' },
  ]);
  assert.equal(body.max_completion_tokens, 16000);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.thinking, undefined, 'حقول أنثروبيك لا تعبر');
  assert.equal(body.stream_options, undefined, 'Groq بلا stream_options');
  assert.deepEqual(body.tools[0], { type: 'function', function: { name: 'web_search', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } } } } });
  assert.deepEqual(od.toOpenAIBody({ model: 'm', messages: ask('x') }, 'openai').stream_options, { include_usage: true });
});

test('٢. الجسر: بثّ chat/completions ← أحداث أنثروبيك (نصّ ثمّ نداء أداة مقطّع، وسبب التوقّف والعدّاد)', async () => {
  const up = sse([
    { model: 'gpt-x', choices: [{ index: 0, delta: { content: 'لحظة' } }] },
    { model: 'gpt-x', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{"que' } }] } }] },
    { model: 'gpt-x', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"x"}' } }] } }] },
    { model: 'gpt-x', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
    { model: 'gpt-x', choices: [], usage: { prompt_tokens: 100, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 40 } } },
    '[DONE]',
  ]);
  const txt = await new Response(od.toAnthropicStream(up.body, 'fb')).text();
  const evs = txt.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  assert.equal(evs[0].type, 'message_start');
  assert.equal(evs[0].message.model, 'gpt-x');
  assert.deepEqual(evs.find((e) => e.type === 'content_block_delta' && e.delta.type === 'text_delta').delta.text, 'لحظة');
  const ts = evs.find((e) => e.type === 'content_block_start' && e.content_block.type === 'tool_use');
  assert.deepEqual([ts.index, ts.content_block.id, ts.content_block.name], [1, 'c1', 'web_search']);
  const json = evs.filter((e) => e.type === 'content_block_delta' && e.delta.type === 'input_json_delta').map((e) => e.delta.partial_json).join('');
  assert.deepEqual(JSON.parse(json), { query: 'x' });
  const md = evs.find((e) => e.type === 'message_delta');
  assert.equal(md.delta.stop_reason, 'tool_use');
  assert.equal(md.usage.output_tokens, 7);
  const tail = evs.filter((e) => e.type === 'message_start')[1];
  assert.deepEqual(tail.message, { usage: { input_tokens: 60, cache_read_input_tokens: 40 } }, 'المدخل في حدث ثانٍ بلا موديل');
});

test('٣. الموديل المباشر: GPT يقصّ بادئة الوسيط، وافتراضيّ السهم لـGroq = بديل Maverick الرسميّ عند Groq (gpt-oss-120b)', () => {
  assert.deepEqual(od.directModel('openai', 'openai/gpt-5.6-terra', {}), { model: 'gpt-5.6-terra', picked: true, def: 'gpt-5.6-terra' });
  assert.equal(od.directModel('openai', '', {}).picked, false);
  assert.equal(od.directModel('openai', 'google/gemini-3.5-flash', {}).picked, false, 'معرّف شركة أخرى لا يُقبل');
  // v-models-latest: Groq أوقف Maverick (مارس ٢٠٢٦) — افتراضيّ السهم يُترجم لبديله الرسميّ gpt-oss-120b.
  assert.deepEqual(od.directModel('groq', 'meta-llama/llama-4-maverick', {}), { model: 'openai/gpt-oss-120b', picked: false, def: 'openai/gpt-oss-120b' });
  assert.deepEqual(od.directModel('groq', 'qwen/qwen3-32b', {}), { model: 'qwen/qwen3-32b', picked: true, def: 'openai/gpt-oss-120b' });
  assert.equal(od.directModel('groq', 'bad id!', {}).picked, false);
  assert.equal(od.directRoute('groq', {}), null, 'بلا مفتاح = الوسيط');
  assert.equal(od.directRoute('claude', { GROQ_API_KEY: 'k' }), null);
  assert.equal(od.directRoute('groq', { GROQ_API_KEY: 'k' }).url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(od.directRoute('openai', { OPENAI_API_KEY: 'k' }).url, 'https://api.openai.com/v1/chat/completions');
});

test('٤. المالك + مفتاح Groq: الطلب إلى Groq نفسه بمفتاحه، وجولة أداة كاملة عبر الجسر، والردّ يصل', async () => {
  process.env.GROQ_API_KEY = 'gsk-test';
  try {
    const r = await run({ user: 'omran', provider: 'groq', model: 'meta-llama/llama-4-maverick', messages: ask('ابحث عن عمران وش هو'), script: [
      () => sse([
        { model: 'openai/gpt-oss-120b', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'web_search', arguments: '{"query":"عمران"}' } }] } }] },
        { model: 'openai/gpt-oss-120b', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        '[DONE]',
      ]),
      () => oaText('هذا جواب Groq'),
    ] });
    assert.equal(r.calls.length, 2);
    for (const c of r.calls) {
      assert.equal(c.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(c.headers.Authorization, 'Bearer gsk-test');
      assert.equal(c.body.model, 'openai/gpt-oss-120b');
      assert.ok(Array.isArray(c.body.tools) && c.body.tools.some((t) => t.function.name === 'web_search'), 'الأدوات عابرة');
      assert.ok(!c.body.messages.some((m) => m.role === 'system'), 'المالك خام: لا نظام');
    }
    const second = r.calls[1].body.messages;
    assert.deepEqual(second[1].tool_calls[0].function, { name: 'web_search', arguments: '{"query":"عمران"}' });
    assert.equal(second[2].role, 'tool');
    assert.equal(second[2].tool_call_id, 'call_a');
    assert.equal(r.text, 'هذا جواب Groq');
    assert.ok(r.events.some((e) => typeof e.modelLabel === 'string' && e.modelLabel.includes('openai/gpt-oss-120b')), 'الشارة تسمّي ما خدم فعلًا');
  } finally { delete process.env.GROQ_API_KEY; }
});

test('٥. المالك + مفتاح Groq مرفوض (401) → الوسيط للمزوّد نفسه بسطر حالة، لا صمت', async () => {
  process.env.GROQ_API_KEY = 'gsk-bad';
  try {
    const r = await run({ user: 'omran', provider: 'groq', messages: ask('هلا بك'), script: [
      () => new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 }),
      () => anthropicText('من الوسيط'),
    ] });
    assert.equal(r.calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.match(r.calls[1].url, /openrouter\.ai\/api\/v1\/messages/);
    assert.equal(r.calls[1].body.model, 'meta-llama/llama-4-maverick');
    assert.ok(r.events.some((e) => e.k === 'stModelFallback' && /Groq · 401/.test(e.status)));
    assert.equal(r.text, 'من الوسيط');
  } finally { delete process.env.GROQ_API_KEY; }
});

test('٦. موديل Groq الافتراضيّ متقاعد → المرشّح التالي بصمت، ولا يُعاد تجريبه أوّلًا', async () => {
  process.env.GROQ_API_KEY = 'gsk-test';
  od.__deadModels.clear();
  try {
    let r = await run({ user: 'omran', provider: 'groq', messages: ask('سؤال'), script: [
      () => new Response('{"error":{"message":"The model `openai/gpt-oss-120b` does not exist","code":"model_not_found"}}', { status: 404 }),
      () => oaText('تم', 'openai/gpt-oss-20b'),
    ] });
    assert.equal(r.calls.length, 2);
    assert.notEqual(r.calls[1].body.model, r.calls[0].body.model);
    assert.equal(r.text, 'تم');
    r = await run({ user: 'omran', provider: 'groq', messages: ask('سؤال'), script: [() => oaText('ثاني')] });
    assert.notEqual(r.calls[0].body.model, 'openai/gpt-oss-120b', 'المرفوض لا يتصدّر');
  } finally { delete process.env.GROQ_API_KEY; od.__deadModels.clear(); }
});

test('٧. المالك + مفتاح OpenAI: GPT مباشر بمعرّفه عند OpenAI؛ وغير المالك يبقى على الوسيط حتّى مع المفتاحين', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  process.env.GROQ_API_KEY = 'gsk-test';
  try {
    // v-oa-responses: GPT المباشر على /v1/responses (الأدوات مع التفكير لا تُقبل في chat/completions لموديلات GPT الجديدة)
    const oaResp = (text, model) => new Response([
      { type: 'response.created', response: { model } },
      { type: 'response.output_text.delta', output_index: 0, delta: text },
      { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } },
    ].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200 });
    let r = await run({ user: 'omran', provider: 'openai', model: 'openai/gpt-5.6-terra', messages: ask('سؤال'), script: [() => oaResp('من GPT', 'gpt-5.6-terra')] });
    assert.equal(r.calls[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(r.calls[0].headers.Authorization, 'Bearer sk-openai-test');
    assert.equal(r.calls[0].body.model, 'gpt-5.6-terra');
    assert.equal(r.text, 'من GPT');
    for (const provider of ['openai', 'groq']) {
      r = await run({ user: 'someone', provider, messages: ask('سؤال'), script: [() => anthropicText('وسيط')] });
      assert.match(r.calls[0].url, /openrouter\.ai\/api\/v1\/messages/, provider + ': غير المالك على الوسيط');
    }
  } finally { delete process.env.OPENAI_API_KEY; delete process.env.GROQ_API_KEY; }
});

test('٨. تفكير الموديل: للمالك لا حقول إطفاء على الوسيط، وغير المالك عليها كما كان (v-chat-fast)', async () => {
  chat.__orQuick.level = 2;
  let r = await run({ user: 'omran', provider: 'deepseek', messages: ask('اشرح'), script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.thinking, undefined);
  assert.equal(r.calls[0].body.reasoning, undefined);
  r = await run({ user: 'someone', provider: 'deepseek', messages: ask('اشرح'), script: [() => anthropicText('تم')] });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'disabled' });
  assert.deepEqual(r.calls[0].body.reasoning, { enabled: false });
});

function longChat(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ role: i % 2 ? 'assistant' : 'user', content: (i % 2 ? 'جواب ' : 'سؤال ') + i + ' ' + 'ن'.repeat(3000) });
  out.push({ role: 'user', content: 'وش قلت لي في أوّل جواب؟' });
  return out;
}

test('٩. الذاكرة: المالك يرسل المحادثة كلّها؛ غير المالك مضغوط كما كان؛ و«زين» للمالك تحمل التاريخ', async () => {
  const msgs = longChat(40);
  let r = await run({ user: 'omran', provider: 'claude', messages: msgs, script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.messages.length, 41, 'كلّ الرسائل');
  assert.ok(JSON.stringify(r.calls[0].body.messages).includes('سؤال 0 '), 'أوّل رسالة حاضرة');
  r = await run({ user: 'someone', provider: 'claude', messages: msgs, script: [() => anthropicText('تم')] });
  assert.ok(r.calls[0].body.messages.length <= 14, 'غير المالك: ١٤ كحدّ');
  const shortChat = [{ role: 'user', content: 'اكتب لي خطّة' }, { role: 'assistant', content: 'الخطّة: ...' }, { role: 'user', content: 'زين' }];
  r = await run({ user: 'omran', provider: 'claude', messages: shortChat, script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.messages.length, 3);
  assert.equal(r.calls[0].body.max_tokens, 16000);
  r = await run({ user: 'someone', provider: 'claude', messages: shortChat, script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.messages.length, 1, 'غير المالك: التحية معزولة كما كانت');
});

test('١٠. تجاوز نافذة الموديل بسياق المالك الكامل → إعادة واحدة بالمضغوط القديم', async () => {
  const r = await run({ user: 'omran', provider: 'claude', messages: longChat(40), script: [
    () => new Response('{"error":{"message":"prompt is too long: 250000 tokens > 200000 maximum"}}', { status: 400 }),
    () => anthropicText('تم'),
  ] });
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[0].body.messages.length, 41);
  assert.ok(r.calls[1].body.messages.length <= 14);
  assert.equal(r.text, 'تم');
});

test('١١. قائمة Groq في السهم من Groq نفسه: محادثة فقط، الأحدث أوّلًا', () => {
  const out = pm.parseGroqModels({ data: [
    { id: 'whisper-large-v3', created: 9 }, { id: 'playai-tts', created: 9 }, { id: 'meta-llama/llama-guard-4-12b', created: 9 },
    { id: 'groq/compound', created: 9 }, { id: 'old-model', created: 1, active: false },
    { id: 'openai/gpt-oss-120b', created: 5 }, { id: 'llama-3.1-8b-instant', created: 3 }, { id: 'qwen/qwen3-32b', created: 4 },
  ] });
  assert.deepEqual(out, [['openai/gpt-oss-120b', 'openai/gpt-oss-120b'], ['qwen/qwen3-32b', 'qwen/qwen3-32b'], ['llama-3.1-8b-instant', 'llama-3.1-8b-instant']]);
  assert.deepEqual(pm.parseGroqModels(null), []);
  const modes = read('js/modes.js');
  assert.ok(modes.includes("{ key:'groq',       name:'Groq',                     or:true, direct:true,"), 'Groq في السهم مباشر');
  assert.ok(modes.includes("if(pv.or && !pv.direct && v && v.indexOf('/') === -1) v = '';"), 'معرّفات Groq بلا بادئة تبقى');
});

test('١٢. العميل: المالك يرسل المحادثة كاملة بردودها — والباقي كما كان', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("const __ownerCtx = (typeof omranOwnerUi === 'function' && omranOwnerUi());"), f);
    assert.ok(s.includes('const MAX_TURNS = __ownerCtx ? 200 : 24;') && s.includes('const MAX_CHARS = __ownerCtx ? 400000 : 90000;') && s.includes('const MAX_PER_MSG = __ownerCtx ? 60000 : 7000;'), f + ': السقوف');
    assert.ok(s.includes("__ownerCtx ? (cur.code ? 'text' : 'all') : ''"), f + ': الردّ السابق بكوده للمالك ما لم يكن مشروع');
    assert.ok(s.includes('if(!__quietSocialTurn || __ownerCtx){'), f + ': التحية وسط الشغل تحمل التاريخ للمالك');
  }
  const s = read('js/app-09-attach.js');
  const i = s.indexOf('function __stripCodeForHistory(role, s, full){');
  const j = s.indexOf('\n}\n', i);
  const ctx = {};
  vm.runInNewContext(s.slice(i, j + 2) + '\nthis.f = __stripCodeForHistory;', ctx);
  const long = 'أ'.repeat(5000) + '\n```js\nx()\n```';
  assert.equal(ctx.f('assistant', long, 'all'), long, 'المالك بلا مشروع: كما هو');
  assert.equal(ctx.f('assistant', long, 'text').length > 5000, true, 'المالك بمشروع: بلا قصّ ٣٠٠٠');
  assert.ok(!ctx.f('assistant', long, 'text').includes('```'), 'والكود مستبدل (كوده يُرسل منفصلًا)');
  assert.equal(ctx.f('assistant', long, '').length, 3000, 'غير المالك كما كان');
  assert.equal(ctx.f('user', long, ''), long);
});
