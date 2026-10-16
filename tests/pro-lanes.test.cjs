'use strict';
// v-pro-lanes (لقطة مشترك Pro ٧٥ ١٦ أكتوبر: «أسعار السياكل» ← «ما قدرت أجيب أسعار» بلا بحث، و«الكينج يكتب…»):
// المعالج الحقيقيّ api/_lib/chat.js لدور مشترك Pro، بمزوّدات مزيّفة تفرض قيود المزوّد الموثّقة.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
process.env.AUTH_SECRET = 'pro-lanes-test';
for (const k of ['MISTRAL_API_KEY', 'CHAT_CLAUDE_MODEL', 'TAVILY_API_KEY', 'BRAVE_API_KEY', 'SERPER_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];
Object.assign(process.env, { OPENROUTER_API_KEY: 'or-test', ANTHROPIC_API_KEY: 'ant-test', GROQ_API_KEY: 'gq-test', OPENAI_API_KEY: 'oa-test', GEMINI_API_KEY: 'gm-test' });
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const alerts = [];
stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {}, kvSetIfAbsent: async (k) => { alerts.push(k); return false; } });
const meter = { counts: {}, took: [], gave: [] };
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: 'pro-user', subscriber: true, tier: 'sub' }),
  todayCount: async (u, b) => meter.counts[b] || 0, bumpCount: async () => {},
  takeMeter: async (u, b, cap) => { if ((meter.counts[b] || 0) >= cap) return false; meter.counts[b] = (meter.counts[b] || 0) + 1; meter.took.push(b); return true; },
  giveMeter: async (u, b) => { meter.gave.push(b); meter.counts[b] = Math.max(0, (meter.counts[b] || 0) - 1); },
});
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
const tierLib = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));
const od = require(rp('api/_lib/oa-direct.js'));

function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (lines) => new Response(lines.map((l) => 'data: ' + (typeof l === 'string' ? l : JSON.stringify(l)) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const err = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const who = (u) => /generativelanguage/.test(u) ? 'gemini' : /api\.openai\.com\/v1\/responses/.test(u) ? 'luna' : /api\.anthropic\.com/.test(u) ? 'haiku' : /api\.groq\.com/.test(u) ? 'groq' : /openrouter\.ai/.test(u) ? 'or' : 'other';
const TS_MSG = 'Function call is missing a thought_signature in functionCall parts. This is required for tools to work correctly.';
// Gemini 3: أوّل نداء أداة في كلّ رسالة مساعد من الدور الحاليّ يحمل التوقيع كما وصل (tool_calls[0].extra_content.google.thought_signature).
function geminiSigCheck(body, want) {
  for (const m of body.messages || []) {
    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || !m.tool_calls.length) continue;
    const g = m.tool_calls[0].extra_content && m.tool_calls[0].extra_content.google;
    if (!g || !g.thought_signature || (want && g.thought_signature !== want)) return err(400, [{ error: { code: 400, message: TS_MSG, status: 'INVALID_ARGUMENT' } }]);
  }
  for (const t of body.tools || []) for (const p of Object.values((t.function.parameters || {}).properties || {})) {
    if (Array.isArray(p.enum) && p.enum.some((v) => typeof v !== 'string')) return err(400, [{ error: { code: 400, message: 'Invalid value at enum (TYPE_STRING), 4', status: 'INVALID_ARGUMENT' } }]);
  }
  return null;
}
const gemTool = (finish, sig = 'SIG-A') => sse([{ choices: [{ delta: { role: 'assistant', tool_calls: [{ id: 'function-call-1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: 'bicycle prices UAE' }) }, extra_content: { google: { thought_signature: sig } } }] }, finish_reason: finish, index: 0 }], model: 'gemini-3.8-flash' }, '[DONE]']);
const gemText = (t) => sse([{ choices: [{ delta: { role: 'assistant', content: t }, index: 0 }], model: 'gemini-3.8-flash' }, { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] }, '[DONE]']);
const lunaText = (t) => sse([{ type: 'response.created', response: { model: 'gpt-6-luna' } }, { type: 'response.output_text.delta', output_index: 0, delta: t }, { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 1, output_tokens: 1 } } }]);
const lunaQuota = () => sse([{ type: 'response.created', response: { model: 'gpt-6-luna' } }, { type: 'error', error: { type: 'insufficient_quota', code: 'insufficient_quota', message: 'You exceeded your current quota.' } }]);
const haikuText = (t) => sse([{ type: 'message_start', message: { model: 'claude-haiku-5-5', usage: { input_tokens: 1 } } }, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }]);

async function run(handlers, text) {
  const calls = []; const n = {}; const prev = global.fetch; const realTier = tierLib.resolveTier;
  global.fetch = async (url, init) => {
    const u = String(url); const p = who(u); n[p] = (n[p] || 0) + 1;
    let body = null; try { body = JSON.parse(init.body); } catch (e) { body = null; }
    calls.push({ p, n: n[p], body });
    const h = handlers[p];
    return h ? h(body, n[p]) : new Response('{}', { status: 404 });
  };
  tierLib.resolveTier = async () => ({ tier: 'sub', plan: 'pro', cap: 100, subscriber: true });
  meter.took.length = 0; meter.gave.length = 0; meter.counts = {}; alerts.length = 0;
  let out = '';
  const res = { headersSent: false, writableEnded: false, setHeader() {}, status() { return this; }, flushHeaders() {}, json(v) { out += 'JSON ' + JSON.stringify(v); }, write(c) { out += String(c || ''); return true; }, end() { this.writableEnded = true; }, on() {}, once() {}, removeListener() {} };
  const logs = []; const ce = console.error; const cw = console.warn;
  console.error = (...a) => { logs.push(a.join(' ')); }; console.warn = () => {};
  try { await chat({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: text || 'كم أسعار السياكل الحين في الإمارات؟' }], token: token('pro-user'), provider: 'claude', tz: 'Asia/Dubai' } }, res); }
  finally { global.fetch = prev; tierLib.resolveTier = realTier; console.error = ce; console.warn = cw; }
  const events = out.split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  const said = events.map((e) => e.delta || '').join('');
  return { calls, events, said, errors: events.filter((e) => e.error), lanes: calls.map((c) => c.p).filter((p) => p !== 'other'), logs, meter: { took: meter.took.slice(), gave: meter.gave.slice() } };
}

test('١ توقيع Gemini 3 يعود مع نداء الأداة: البحث يكمل على Gemini نفسه بلا 400 ولا مسار آخر', async () => {
  const r = await run({ gemini: async (b, n) => geminiSigCheck(b, 'SIG-A') || (n === 1 ? gemTool('tool_calls') : gemText('أسعار السياكل من ٤٩٩ درهم')) });
  assert.deepEqual(r.lanes, ['gemini', 'gemini'], 'خطوتان على Gemini — لا Luna ولا Haiku');
  assert.equal(r.calls.filter((c) => c.p === 'gemini')[1].body.messages.find((m) => m.tool_calls).tool_calls[0].extra_content.google.thought_signature, 'SIG-A');
  assert.match(r.said, /٤٩٩ درهم/);
  assert.equal(r.errors.length, 0);
  assert.ok(r.events.some((e) => e.k === 'stSearch'), 'البحث جرى');
  assert.deepEqual(r.meter, { took: ['plan-gemini'], gave: [] }, 'Gemini خدم الدور = المقياس محسوب');
});

test('١ب نداء أداة مع finish_reason «stop» (عنوان Google المتوافق) يُنفَّذ — لا فقاعة فارغة', async () => {
  const r = await run({ gemini: async (b, n) => geminiSigCheck(b, 'SIG-A') || (n === 1 ? gemTool('stop') : gemText('جواب بعد البحث')) });
  assert.deepEqual(r.lanes, ['gemini', 'gemini']);
  assert.match(r.said, /جواب بعد البحث/);
});

test('٢ المحوّل: enum أرقام ← الوصف لـGemini وحده، والتوقيع البديل لنداء بلا توقيعه، ومعرّف مكرّر لا يأخذ توقيع غيره', async () => {
  const tools = [{ name: 'generate_video', description: 'v', input_schema: { type: 'object', properties: { durationSeconds: { type: 'integer', enum: [4, 5, 6], description: 'المدة' }, ratio: { type: 'string', enum: ['a', 'b'] } } } }];
  const ab = (msgs) => ({ model: 'gemini-3.8-flash', messages: msgs || [{ role: 'user', content: 'x' }], tools });
  const g = od.toOpenAIBody(ab(), 'gemini');
  const d = g.tools[0].function.parameters.properties.durationSeconds;
  assert.equal(d.enum, undefined); assert.equal(d.type, 'integer'); assert.match(d.description, /المدة \(4, 5, 6\)/);
  assert.deepEqual(g.tools[0].function.parameters.properties.ratio.enum, ['a', 'b'], 'enum النصوص كما هو');
  assert.deepEqual(od.toOpenAIBody(ab(), 'openai').tools[0].function.parameters.properties.durationSeconds.enum, [4, 5, 6], 'غير Gemini لا يُمسّ');
  assert.deepEqual(tools[0].input_schema.properties.durationSeconds.enum, [4, 5, 6], 'المخطّط الأصليّ لا يتغيّر');
  const step = [{ role: 'user', content: 'x' }, { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'web_search', input: {} }, { type: 'tool_use', id: 'c2', name: 'web_search', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'r' }, { type: 'tool_result', tool_use_id: 'c2', content: 'r' }] }];
  const tc = (body) => body.messages.find((m) => m.tool_calls).tool_calls;
  const sigs = new Map([['c1', { sig: 'REAL', model: 'gemini-3.8-flash' }], ['c2', { sig: '', model: 'gemini-3.8-flash' }]]);
  assert.equal(tc(od.toOpenAIBody(ab(step), 'gemini', sigs))[0].extra_content.google.thought_signature, 'REAL');
  assert.equal(tc(od.toOpenAIBody(ab(step), 'gemini', sigs))[1].extra_content, undefined, 'النداء الموازي بلا توقيع كما وصل');
  assert.equal(tc(od.toOpenAIBody(Object.assign(ab(step), { model: 'gemini-flash-latest' }), 'gemini', sigs))[0].extra_content.google.thought_signature, od.GEM_SKIP_SIG, 'توقيع موديل آخر لا يُرسل');
  assert.equal(tc(od.toOpenAIBody(ab(step), 'gemini', new Map()))[0].extra_content.google.thought_signature, od.GEM_SKIP_SIG, 'نداء لم يولّده Gemini (مسار سابق في الدور)');
  assert.equal(tc(od.toOpenAIBody(ab(step), 'groq', sigs))[0].extra_content, undefined, 'غير Gemini بلا حقل جديد');
  const m = new Map();
  for (const sig of ['S1', 'S2']) {
    const txt = await new Response(od.toAnthropicStream(gemTool('tool_calls', sig).body, 'gemini-3.8-flash', m)).text();
    if (sig === 'S2') assert.match(txt, /"id":"function-call-1_2"/, 'المعرّف المكرّر في الخطوة الثانية صار فريدًا');
  }
  assert.deepEqual([...m.keys()], ['function-call-1', 'function-call-1_2']);
  assert.equal(m.get('function-call-1').sig, 'S1', 'توقيع الخطوة الأولى لم يُكتب فوقه');
  assert.equal(m.get('function-call-1_2').sig, 'S2', 'توقيع الخطوة الثانية على معرّفها الفريد');
  const two = [{ role: 'user', content: 'x' }];
  for (const id of ['function-call-1', 'function-call-1_2']) two.push({ role: 'assistant', content: [{ type: 'tool_use', id, name: 'web_search', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'r' }] });
  assert.deepEqual(od.toOpenAIBody(ab(two), 'gemini', m).messages.filter((x) => x.tool_calls).map((x) => x.tool_calls[0].extra_content.google.thought_signature), ['S1', 'S2'], 'كلّ خطوة تعود بتوقيعها');
});

test('٣ Luna ينفد رصيدها داخل البثّ ← Haiku يجيب، لا «chat error»، والمالك يُشعَر بالرصيد', async () => {
  const r = await run({ gemini: async () => err(429, [{ error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }]), luna: async () => lunaQuota(), haiku: async () => haikuText('جواب Haiku') });
  assert.deepEqual(r.lanes, ['gemini', 'luna', 'haiku']);
  assert.match(r.said, /جواب Haiku/);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.ok(alerts.includes(require(rp('api/_lib/_owner-alert.js')).ALERT_KEY), 'إشعار الرصيد للمالك');
  assert.deepEqual(r.meter, { took: ['plan-gemini'], gave: ['plan-gemini'] });
});

test('٤ Gemini يفشل داخل البثّ في الخطوة الأولى ← المسار التالي، وحجز مقياسه يُردّ', async () => {
  const r = await run({ gemini: async () => sse([{ error: { code: 503, message: 'The model is overloaded.' } }]), luna: async () => lunaText('جواب Luna') });
  assert.deepEqual(r.lanes, ['gemini', 'luna']);
  assert.match(r.said, /جواب Luna/);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.meter, { took: ['plan-gemini'], gave: ['plan-gemini'] }, 'دور لم يخدمه Gemini لا يُحسب من حدّه اليوميّ');
});

test('٥ مهلة أوّل بايت (نداء يُرمى) ← المسار التالي لا «chat error»', async () => {
  const r = await run({ gemini: async () => { const e = new Error('Upstream request timed out after 30000ms.'); e.name = 'UpstreamTimeoutError'; throw e; }, luna: async () => lunaText('جواب بعد المهلة') });
  assert.deepEqual(r.lanes, ['gemini', 'luna']);
  assert.match(r.said, /جواب بعد المهلة/);
  assert.equal(r.errors.length, 0);
});

test('٦ ردّ ٢٠٠ فارغ بلا نداء ← المسار التالي لا فقاعة فارغة', async () => {
  const r = await run({ gemini: async () => sse([{ choices: [{ delta: {}, finish_reason: 'other', index: 0 }] }, '[DONE]']), luna: async () => lunaText('جواب كامل') });
  assert.deepEqual(r.lanes, ['gemini', 'luna']);
  assert.match(r.said, /جواب كامل/);
});

test('٧ كلّ مسارات الباقة فشلت ← الاحتياط يجيب بصمت للمشترك، وسطر chat/plan-silent-fallback للمالك', async () => {
  const fail = async () => err(500, { error: { message: 'boom' } });
  const free = async (b) => (b && !b.tools) ? gemText('جواب الاحتياط') : fail();
  const r = await run({ gemini: free, luna: fail, haiku: fail, groq: free, or: fail });
  assert.match(r.said, /جواب الاحتياط/);
  assert.equal(r.errors.length, 0);
  assert.ok(r.logs.some((l) => /chat\/plan-silent-fallback/.test(l) && /pro: 500/.test(l)), r.logs.join('\n').slice(0, 600));
  assert.doesNotMatch(r.said, /Gemini|GPT|Groq|Claude|Haiku|Luna/i, 'لا اسم مزوّد في نصّ المشترك');
});

test('٨ خطأ بعد أن بدأ النصّ لا يُعاد على مسار آخر (لا جواب مكرّر)، وسطر chat/plan-error للمالك', async () => {
  // النصّ يصل أوّلًا ثمّ الخطأ بعد لحظة (كما على الشبكة) — دفعة واحدة تُسقط النصّ المصفوف مع controller.error فلا يصل المستخدم أصلًا.
  const late = () => { const enc = new TextEncoder(); const ln = (o) => enc.encode('data: ' + JSON.stringify(o) + '\n\n'); return new Response(new ReadableStream({ async start(c) { c.enqueue(ln({ type: 'response.created', response: { model: 'gpt-6-luna' } })); c.enqueue(ln({ type: 'response.output_text.delta', output_index: 0, delta: 'نصف جواب' })); await new Promise((r) => setTimeout(r, 30)); c.enqueue(ln({ type: 'error', error: { type: 'server_error', message: 'x' } })); c.close(); } }), { status: 200 }); };
  const r = await run({ gemini: async () => err(429, [{ error: { code: 429, message: 'exhausted' } }]), luna: async () => late(), haiku: async () => haikuText('مكرّر') });
  assert.ok(!r.lanes.includes('haiku'), 'Haiku لا يُنادى بعد نصّ وصل المستخدم');
  assert.match(r.said, /نصف جواب/);
  assert.doesNotMatch(r.said, /مكرّر/);
  assert.ok(r.logs.some((l) => /chat\/plan-error/.test(l)), 'دور المشترك الساقط يترك أثرًا للمالك');
});

test('٩ حدّ طلبات Gemini (429 RESOURCE_EXHAUSTED بنصّ «billing») ليس رصيدًا: لا إشعار «الرصيد نفد» قبل البثّ ولا داخله', async () => {
  const rl = [{ error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.', status: 'RESOURCE_EXHAUSTED' } }];
  let r = await run({ gemini: async () => err(429, rl), luna: async () => lunaText('جواب بالأدوات') });
  assert.deepEqual(r.lanes, ['gemini', 'luna']); assert.match(r.said, /جواب بالأدوات/);
  assert.deepEqual(alerts, [], 'لا مفتاح إشعار رصيد لحدّ طلبات');
  r = await run({ gemini: async () => sse([{ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).' } }]), luna: async () => lunaText('جواب ثانٍ') });
  assert.deepEqual(r.lanes, ['gemini', 'luna']); assert.match(r.said, /جواب ثانٍ/);
  assert.deepEqual(alerts, [], 'حدّ الطلبات داخل البثّ ليس 402');
});

test('١٠ الرفض وحجب الرقابة لا يُعرضان على مسار آخر', async () => {
  const refusal = () => sse([{ type: 'message_start', message: { model: 'claude-haiku-5-5', usage: { input_tokens: 1 } } }, { type: 'message_delta', delta: { stop_reason: 'refusal' } }, { type: 'message_stop' }]);
  const busy = async () => err(429, { error: { message: 'Rate limit reached', type: 'rate_limit_exceeded' } });
  let r = await run({ gemini: busy, luna: busy, haiku: async () => refusal(), groq: async () => gemText('امتثل'), or: async () => gemText('امتثل') });
  assert.ok(!r.lanes.includes('groq') && !r.lanes.includes('or'), 'رفض Haiku لا يصل Groq ولا الاحتياط: ' + r.lanes.join(','));
  assert.doesNotMatch(r.said, /امتثل/);
  r = await run({ gemini: async () => sse([{ choices: [{ delta: {}, finish_reason: 'content_filter', index: 0 }] }, '[DONE]']), luna: async () => lunaText('امتثل') });
  assert.deepEqual(r.lanes, ['gemini'], 'حجب Gemini لا يصل Luna');
});
