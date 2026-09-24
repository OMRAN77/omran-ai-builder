'use strict';
/* v-oa-responses — لقطة «فحص النظام» (المالك ٢٣ سبتمبر ٢٣:٤٢): «Function tools with reasoning_effort are not supported
   for gpt-5.6-terra in /v1/chat/completions» (×8) و«The model `gpt-6-luna-pro` does not exist or you do not have access
   to it» (×4)، ثمّ 402/429 رصيد الوسيط. الجذر: مسار GPT المباشر للمالك يرسل الأدوات إلى /v1/chat/completions،
   وموديلات GPT الجديدة تفكّر افتراضيًّا ولا تقبل الأدوات مع التفكير إلّا في /v1/responses — فكلّ سؤال فيه أدوات
   (أغلب الأسئلة) يسقط 400 ثمّ يهبط للوسيط الذي نفد رصيده ثمّ للسلسلة المجّانيّة. وقائمة موديلات GPT في السهم كانت
   من كتالوج الوسيط لا من مفتاح المالك، فظهر فيها موديل لا يملكه المفتاح.
   هنا خادم OpenAI مزيّف يتصرّف كالحقيقيّ: chat/completions + أدوات = 400 بالنصّ نفسه، وresponses يبثّ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'oa-responses-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.TAVILY_API_KEY;
delete process.env.CHAT_OPENAI_MODEL;

const root = path.resolve(__dirname, '..');
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
  checkAndConsume: async () => ({ allowed: true, username: 'omran' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
const chat = require(rp('api/_lib/chat.js'));
const od = require(rp('api/_lib/oa-direct.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
const ask = (t) => [{ role: 'user', content: t }];
/* بثّ /v1/responses كما يرسله الخادم: سطر event ثمّ سطر data لكلّ حدث */
const rsse = (events) => new Response(events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const rText = (text, model) => rsse([
  { type: 'response.created', response: { id: 'resp_1', model: model || 'gpt-5.6-terra', status: 'in_progress' } },
  { type: 'response.output_item.added', output_index: 0, item: { id: 'rs_1', type: 'reasoning', summary: [] } },
  { type: 'response.output_item.done', output_index: 0, item: { id: 'rs_1', type: 'reasoning', summary: [] } },
  { type: 'response.output_item.added', output_index: 1, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } },
  { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, content_index: 0, delta: text.slice(0, 3) },
  { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, content_index: 0, delta: text.slice(3) },
  { type: 'response.output_item.done', output_index: 1, item: { id: 'msg_1', type: 'message' } },
  { type: 'response.completed', response: { id: 'resp_1', model: model || 'gpt-5.6-terra', status: 'completed', usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 20 }, output_tokens: 9 } } },
]);
const rCall = (callId, name, args) => rsse([
  { type: 'response.created', response: { id: 'resp_0', model: 'gpt-5.6-terra', status: 'in_progress' } },
  { type: 'response.output_item.added', output_index: 0, item: { id: 'fc_1', type: 'function_call', call_id: callId, name, arguments: '' } },
  { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: args.slice(0, 5) },
  { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: args.slice(5) },
  { type: 'response.output_item.done', output_index: 0, item: { id: 'fc_1', type: 'function_call', call_id: callId, name, arguments: args } },
  { type: 'response.completed', response: { id: 'resp_0', model: 'gpt-5.6-terra', status: 'completed', usage: { input_tokens: 80, output_tokens: 12 } } },
]);
const TERRA_400 = JSON.stringify({ error: { message: 'Function tools with reasoning_effort are not supported for gpt-5.6-terra in /v1/chat/completions. Please use /v1/responses instead.', type: 'invalid_request_error', param: 'reasoning_effort', code: null } });
const OR_402 = JSON.stringify({ type: 'error', error: { type: 'billing_error', message: 'This request would exceed your available credit' } });

/* خادم مزيّف يوجّه حسب العنوان — يتصرّف كالحقيقيّ في الحالتين */
async function run({ provider, model, messages, responses, chatCompletions }) {
  const calls = [];
  const save = global.fetch;
  let ri = 0;
  global.fetch = async (url, options) => {
    const u = String(url);
    const body = options && options.body ? JSON.parse(options.body) : null;
    calls.push({ url: u, headers: (options && options.headers) || {}, body });
    if (u === 'https://api.openai.com/v1/chat/completions') {
      if (chatCompletions) return chatCompletions(body);
      if (body && Array.isArray(body.tools) && body.tools.length && /gpt-5\.6-terra/.test(body.model)) return new Response(TERRA_400, { status: 400 });
      return new Response('data: ' + JSON.stringify({ model: body.model, choices: [{ index: 0, delta: { content: 'من المسار القديم' } }] }) + '\n\ndata: ' + JSON.stringify({ model: body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { status: 200 });
    }
    if (u === 'https://api.openai.com/v1/responses') {
      const step = responses[Math.min(ri++, responses.length - 1)];
      return typeof step === 'function' ? step(body) : step;
    }
    if (/openrouter\.ai/.test(u)) return new Response(OR_402, { status: 402 });
    return new Response('{"error":"unexpected ' + u + '"}', { status: 500 });
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: { messages, token: token('omran'), provider, model } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events, text: events.filter((e) => e.delta).map((e) => e.delta).join('') };
}

test('١. العطل نفسه: سؤال بأدوات على GPT المباشر يصل عبر /v1/responses — لا 400، لا وسيط، لا سطر «غير متاح»', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try {
    const r = await run({ provider: 'openai', messages: ask('ابحث لي عن آخر أخبار الذكاء الاصطناعي'), responses: [() => rText('هذا جواب GPT')] });
    assert.equal(r.calls[0].url, 'https://api.openai.com/v1/responses', 'الطلب الأوّل إلى responses');
    assert.equal(r.calls[0].headers.Authorization, 'Bearer sk-openai-test');
    assert.equal(r.calls[0].body.model, 'gpt-5.6-terra');
    assert.ok(Array.isArray(r.calls[0].body.tools) && r.calls[0].body.tools.length > 3, 'الأدوات عابرة');
    assert.ok(!r.calls.some((c) => /chat\/completions|openrouter/.test(c.url)), 'لا مسار قديم ولا وسيط');
    assert.ok(!r.events.some((e) => e.k === 'stModelFallback'), 'لا سطر «غير متاح»');
    assert.equal(r.text, 'هذا جواب GPT');
    assert.ok(r.events.some((e) => typeof e.modelLabel === 'string' && e.modelLabel.includes('جديد')), 'الشارة بعدّادها');
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('٢. جولة أداة كاملة عبر responses: النداء يعود function_call + function_call_output بنفس call_id', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try {
    const r = await run({ provider: 'openai', messages: ask('ابحث عن عمران وش هو'), responses: [
      () => rCall('call_77', 'web_search', '{"query":"عمران"}'),
      (body) => {
        const items = body.input;
        const fc = items.find((x) => x.type === 'function_call');
        const out = items.find((x) => x.type === 'function_call_output');
        assert.deepEqual(fc, { type: 'function_call', call_id: 'call_77', name: 'web_search', arguments: '{"query":"عمران"}' }, 'بلا معرّف fc_ (لا يُطلب معه عنصر التفكير)');
        assert.equal(out.call_id, 'call_77');
        assert.ok(typeof out.output === 'string' && out.output.length > 0);
        assert.ok(items.indexOf(fc) < items.indexOf(out), 'النداء قبل نتيجته');
        return rText('عمران تطبيق');
      },
    ] });
    assert.equal(r.calls.filter((c) => c.url === 'https://api.openai.com/v1/responses').length, 2);
    assert.equal(r.text, 'عمران تطبيق');
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('٣. تحويل الجسم: تعليمات، مدخلات، صورة، أدوات مسطّحة غير صارمة، سقف الخرج، بلا تخزين ولا حقول أنثروبيك', () => {
  const b = od.toResponsesBody({
    model: 'gpt-5.6-terra', max_tokens: 16000, stream: true,
    system: [{ type: 'text', text: 'نظام', cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'صف هذه' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] },
      { role: 'assistant', content: [{ type: 'text', text: 'أبحث' }, { type: 'tool_use', id: 'call_1', name: 'web_search', input: { query: 'q' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: [{ type: 'text', text: 'نتيجة' }] }] },
      { role: 'assistant', content: 'تمّ' },
    ],
    tools: [{ name: 'web_search', description: 'd', input_schema: { type: 'object', properties: { query: { type: 'string' } } } }],
    thinking: { type: 'disabled' }, output_config: { effort: 'low' },
  });
  assert.equal(b.instructions, 'نظام');
  assert.deepEqual(b.input, [
    { role: 'user', content: [{ type: 'input_text', text: 'صف هذه' }, { type: 'input_image', image_url: 'data:image/png;base64,AAAA' }] },
    { role: 'assistant', content: 'أبحث' },
    { type: 'function_call', call_id: 'call_1', name: 'web_search', arguments: '{"query":"q"}' },
    { type: 'function_call_output', call_id: 'call_1', output: 'نتيجة' },
    { role: 'assistant', content: 'تمّ' },
  ]);
  assert.deepEqual(b.tools, [{ type: 'function', name: 'web_search', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } } }, strict: false }]);
  assert.equal(b.max_output_tokens, 16000);
  assert.equal(b.stream, true);
  assert.equal(b.store, false, 'لا تُخزَّن محادثات المالك عند المزوّد');
  for (const k of ['max_tokens', 'messages', 'system', 'thinking', 'output_config', 'reasoning', 'reasoning_effort']) assert.equal(b[k], undefined, k);
});

test('٤. تحويل البثّ: نصّ، نداء أداة مقطّع أو كامل عند done، العدّاد، وسبب التوقّف (أداة/طول/نهاية)', async () => {
  const read = async (resp) => (await new Response(od.responsesToAnthropicStream(resp.body, 'fb')).text()).split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  let evs = await read(rText('مرحبا بك'));
  assert.equal(evs[0].type, 'message_start');
  assert.equal(evs[0].message.model, 'gpt-5.6-terra');
  assert.equal(evs.filter((e) => e.type === 'content_block_delta').map((e) => e.delta.text).join(''), 'مرحبا بك');
  assert.deepEqual(evs.filter((e) => e.type === 'message_start')[1].message, { usage: { input_tokens: 100, cache_read_input_tokens: 20 } });
  let md = evs.find((e) => e.type === 'message_delta');
  assert.equal(md.delta.stop_reason, 'end_turn');
  assert.equal(md.usage.output_tokens, 9);
  assert.equal(evs[evs.length - 1].type, 'message_stop');

  evs = await read(rCall('call_9', 'run_js', '{"code":"1+1"}'));
  const ts = evs.find((e) => e.type === 'content_block_start' && e.content_block.type === 'tool_use');
  assert.deepEqual([ts.content_block.id, ts.content_block.name], ['call_9', 'run_js']);
  assert.deepEqual(JSON.parse(evs.filter((e) => e.delta && e.delta.type === 'input_json_delta').map((e) => e.delta.partial_json).join('')), { code: '1+1' }, 'الوسائط مرّة واحدة لا مكرّرة');
  assert.equal(evs.find((e) => e.type === 'message_delta').delta.stop_reason, 'tool_use');

  evs = await read(rsse([
    { type: 'response.output_item.added', output_index: 0, item: { id: 'fc_2', type: 'function_call', call_id: 'call_2', name: 'web_search', arguments: '' } },
    { type: 'response.output_item.done', output_index: 0, item: { id: 'fc_2', type: 'function_call', call_id: 'call_2', name: 'web_search', arguments: '{"query":"x"}' } },
    { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 5, output_tokens: 2 } } },
  ]));
  assert.deepEqual(JSON.parse(evs.filter((e) => e.delta && e.delta.type === 'input_json_delta').map((e) => e.delta.partial_json).join('')), { query: 'x' }, 'وسائط بلا دلتا تصل من done');
  assert.equal(evs[0].message.model, 'fb', 'بلا response.created = الموديل الاحتياطيّ');

  evs = await read(rsse([
    { type: 'response.output_text.delta', output_index: 0, delta: 'نصّ مقطو' },
    { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 5, output_tokens: 99 } } },
  ]));
  assert.equal(evs.find((e) => e.type === 'message_delta').delta.stop_reason, 'max_tokens');
});

test('٥. موديل اختاره المالك ولا يملكه المفتاح (404 عبر responses) → الافتراضيّ بسطر حالة، والافتراضيّ يعمل', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try {
    const r = await run({ provider: 'openai', model: 'openai/gpt-6-luna-pro', messages: ask('سؤال'), responses: [
      (body) => { assert.equal(body.model, 'gpt-6-luna-pro'); return new Response(JSON.stringify({ error: { message: 'The model `gpt-6-luna-pro` does not exist or you do not have access to it.', type: 'invalid_request_error', code: 'model_not_found' } }), { status: 404 }); },
      (body) => { assert.equal(body.model, 'gpt-5.6-terra'); return rText('من الافتراضيّ'); },
    ] });
    const fb = r.events.find((e) => e.k === 'stModelFallback' && /gpt-6-luna-pro/.test(e.status));
    assert.ok(fb, 'سطر الرجوع');
    assert.equal(fb.deadModel, 'openai/gpt-6-luna-pro', 'المعرّف كما أرسله العميل — ليمسحه من اختياره');
    assert.equal(fb.prov, 'openai');
    assert.ok(!r.calls.some((c) => /chat\/completions|openrouter/.test(c.url)), 'موديل غير متاح لا يُجرَّب على المسار القديم');
    assert.equal(r.text, 'من الافتراضيّ');
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('٦. responses رفض الطلب لسبب غير الموديل → المسار القديم chat/completions كما كان (لا أسوأ من قبل)', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try {
    const r = await run({ provider: 'openai', model: 'openai/gpt-4.1', messages: ask('هلا'), responses: [() => new Response(JSON.stringify({ error: { message: "Invalid value: 'input_text'.", type: 'invalid_request_error' } }), { status: 400 })] });
    const urls = r.calls.map((c) => c.url);
    assert.equal(urls[0], 'https://api.openai.com/v1/responses');
    assert.equal(urls[1], 'https://api.openai.com/v1/chat/completions');
    assert.equal(r.calls[1].body.model, 'gpt-4.1');
    assert.equal(r.text, 'من المسار القديم', 'وصل الردّ من المسار القديم');
    assert.ok(!r.calls.some((c) => /openrouter/.test(c.url)), 'بلا وسيط');
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('٧. Groq لا يتغيّر: chat/completions بمفتاحه كما كان', async () => {
  process.env.GROQ_API_KEY = 'gsk-test';
  try {
    assert.equal(od.directRoute('groq').responsesUrl, undefined);
    assert.equal(od.directRoute('groq').url, 'https://api.groq.com/openai/v1/chat/completions');
  } finally { delete process.env.GROQ_API_KEY; }
  assert.equal(od.directRoute('openai', { OPENAI_API_KEY: 'k' }).responsesUrl, 'https://api.openai.com/v1/responses');
});

test('٨. قائمة GPT في السهم من OpenAI نفسه بمفتاح المالك: محادثة فقط، بلا مؤرَّخ، الأحدث أوّلًا، ببادئة الوسيط', async () => {
  const pm = require(rp('api/_lib/provider-models.js'));
  const rows = [
    { id: 'gpt-5.6-terra', created: 50 }, { id: 'gpt-5.6-terra-2026-07-01', created: 51 }, { id: 'gpt-image-2', created: 60 },
    { id: 'gpt-realtime-2', created: 61 }, { id: 'o5-mini', created: 40 }, { id: 'text-embedding-4', created: 70 },
    { id: 'gpt-4o-mini-tts', created: 30 }, { id: 'gpt-4.1', created: 20 }, { id: 'gpt-4o-search-preview', created: 35 },
    { id: 'gpt-3.5-turbo-1106', created: 5 }, { id: 'davinci-002', created: 1 },
  ];
  assert.deepEqual(pm.parseOpenAIModels({ data: rows }), [['openai/gpt-5.6-terra', 'gpt-5.6-terra'], ['openai/o5-mini', 'o5-mini'], ['openai/gpt-4.1', 'gpt-4.1']]);
  assert.deepEqual(pm.parseOpenAIModels(null), []);
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  const seen = [];
  const fetchStub = async (url, o) => {
    seen.push([String(url), (o && o.headers && o.headers.Authorization) || '']);
    if (/openrouter\.ai/.test(url)) return { ok: true, json: async () => ({ data: [{ id: 'openai/gpt-6-luna-pro', name: 'OpenAI: GPT-6 Luna Pro', created: 99 }, { id: 'google/gemini-3.5-flash', name: 'Google: Gemini 3.5 Flash', created: 5 }] }) };
    if (url === 'https://api.openai.com/v1/models') return { ok: true, json: async () => ({ data: rows }) };
    return { ok: false, json: async () => ({}) };
  };
  try {
    const out = await pm.loadModels({ fetch: fetchStub, noKv: true });
    assert.ok(!out.models.openai.some((m) => /luna/.test(m[0])), 'لا موديل لا يملكه المفتاح');
    assert.equal(out.models.openai[0][0], 'openai/gpt-5.6-terra');
    assert.deepEqual(out.models.gemini, [['google/gemini-3.5-flash', 'Gemini 3.5 Flash']], 'البقيّة من الوسيط كما كانت');
    assert.ok(seen.some(([u, a]) => u === 'https://api.openai.com/v1/models' && a === 'Bearer sk-openai-test'));
  } finally { delete process.env.OPENAI_API_KEY; }
  assert.ok(require('fs').readFileSync(rp('api/_lib/provider-models.js'), 'utf8').includes("const KV_KEY = 'provmodels:v3';"), 'المخزَّن القديم (وفيه luna) يسقط فورًا');
});

test('٩. العميل: الموديل المرفوض يُمسح من الاختيار المحفوظ لذلك المزوّد وحده، واختيار صالح آخر لا يُمسّ', () => {
  const fs = require('fs');
  const modes = fs.readFileSync(path.join(root, 'js/modes.js'), 'utf8');
  const provs = modes.slice(modes.indexOf('var PROVS = ['), modes.indexOf('];', modes.indexOf('var PROVS = [')) + 2);
  const provOf = modes.slice(modes.indexOf('function provOf(k)'), modes.indexOf('\n', modes.indexOf('function provOf(k)')));
  const fgStart = modes.indexOf('window.omranForgetModel = function(k, id){');
  const fg = modes.slice(fgStart, modes.indexOf('\n      };', fgStart) + 9);
  const store = new Map([['aiapp_model', 'openai/gpt-6-luna-pro'], ['aiapp_gemini_model', 'google/gemini-3.5-flash']]);
  const localStorage = { getItem: (k) => store.has(k) ? store.get(k) : null, removeItem: (k) => store.delete(k) };
  const window = {};
  let refreshed = 0;
  new Function('window', 'localStorage', 'AR', 'refresh', provs + provOf + fg)(window, localStorage, true, () => { refreshed++; });
  assert.equal(window.omranForgetModel('openai', 'openai/gpt-4.1'), false, 'معرّف غير المحفوظ لا يمسح شيئًا');
  assert.equal(store.get('aiapp_model'), 'openai/gpt-6-luna-pro');
  assert.equal(window.omranForgetModel('openai', 'openai/gpt-6-luna-pro'), true);
  assert.equal(store.has('aiapp_model'), false, 'مُسح فعاد للافتراضيّ');
  assert.equal(store.get('aiapp_gemini_model'), 'google/gemini-3.5-flash', 'مزوّد آخر لا يُمسّ');
  assert.equal(refreshed, 1, 'الشريط يُحدَّث');
  const tools = fs.readFileSync(path.join(root, 'js/app-18-chat-tools.js'), 'utf8');
  assert.ok(tools.includes("if (ev.deadModel && window.omranForgetModel) { try { window.omranForgetModel(ev.prov || provider || 'claude', ev.deadModel); }"), 'العميل يمسح عند سطر الرجوع');
  assert.ok(fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8').includes('window.omranForgetModel(ev.prov'), 'في الحزمة');
  assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('js/modes.js?v=m240924b'), 'وسم كاش modes رُفع');
});

test('١٠. رصيد نفد: سجلّ المالك يسمّي الحساب الذي رفض والموديل (OpenAI المباشر ثمّ OpenRouter) بدل JSON بلا اسم', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  db.delete('db/server-errors/log.json');
  try {
    await run({ provider: 'openai', messages: ask('سؤال عن الرصيد'), responses: [() => new Response(JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } }), { status: 429 })] });
    const log = db.get('db/server-errors/log.json') || [];
    const direct = log.find((e) => e.route === 'swallowed:chat/direct-fail-429');
    const final = log.find((e) => e.route === 'swallowed:chat/upstream-fail');
    assert.ok(direct && direct.message.startsWith('OpenAI مباشر · gpt-5.6-terra: '), direct && direct.message);
    assert.ok(/insufficient_quota/.test(direct.message), 'نصّ المزوّد باقٍ بعد الاسم');
    assert.ok(final && final.message.startsWith('402 OpenRouter · openai/gpt-5.6-terra: '), final && final.message);
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('١١. 400 يذكر «model» لسبب غير وجوده (نافذة السياق) → رجوع للافتراضيّ كما كان، لكن بلا مسح اختيار المالك', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  try {
    const CTX = () => new Response(JSON.stringify({ error: { message: "This model's maximum context length is 128000 tokens.", type: 'invalid_request_error', param: 'model' } }), { status: 400 });
    const r = await run({ provider: 'openai', model: 'openai/gpt-4.1', messages: ask('سؤال'),
      chatCompletions: () => CTX(),
      responses: [(body) => body.model === 'gpt-4.1' ? CTX() : rText('من الافتراضيّ')] });
    const fb = r.events.find((e) => e.k === 'stModelFallback');
    assert.ok(fb, 'رجوع للافتراضيّ كما كان');
    assert.equal(fb.deadModel, undefined, 'لا يُمسح اختيار صالح بسبب السياق');
    assert.equal(r.text, 'من الافتراضيّ');
  } finally { delete process.env.OPENAI_API_KEY; }
});
