// v-pplx-agent (المالك ١٥ أكتوبر: «ابدا في Perplexity» بعد «اريدهم كل المزودين مش هذا فقط»): Perplexity كان الوحيد خارج مسار الأدوات —
// Sonar chat/completions بلا أدوات (وتقاعد ٢٧ سبتمبر ٢٠٢٦). الآن للمالك: Agent API بصيغة OpenAI Responses (/v1/responses) بأدوات دوالّ
// أصليّة عبر oa-direct (مسار GPT نفسه، بلا بروتوكول نصّيّ). رفضُ الموديل للأدوات = جواب صادق بلاها، ولا chat/completions ولا وسيط بعده.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const OD = require('../api/_lib/oa-direct.js');

const sse = (evs) => new Response(evs.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const TOOL = { name: 'read_github', description: 'اقرأ', input_schema: { type: 'object', properties: { url: { type: 'string' } } } };
const AB = { model: 'perplexity/sonar', max_tokens: 2000, system: 'نظام', messages: [{ role: 'user', content: 'اقرأ chat.js' }], tools: [TOOL], thinking: { type: 'disabled' }, stream: true };
async function drain(body) {
  const r = body.getReader(); const dec = new TextDecoder(); let s = '';
  for (;;) { const { done, value } = await r.read(); if (done) break; s += dec.decode(value); }
  return s.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}

test('١. المسار: Agent API بمفتاح Perplexity، والموديل perplexity/sonar (معرّفات Sonar القديمة يرفضها)', () => {
  assert.equal(OD.directRoute('perplexity', {}), null, 'بلا مفتاح = لا طريق');
  const r = OD.directRoute('perplexity', { PERPLEXITY_API_KEY: 'k' });
  assert.equal(r.responsesUrl, 'https://api.perplexity.ai/v1/responses');
  assert.equal(r.noFallback, true);
  assert.equal(OD.directModel('perplexity', '', {}).model, 'perplexity/sonar');
  assert.equal(OD.directModel('perplexity', 'sonar-pro', {}).model, 'perplexity/sonar', 'sonar-pro يرفضه /v1/responses');
  assert.equal(OD.directModel('perplexity', 'perplexity/sonar-reasoning', {}).model, 'perplexity/sonar-reasoning');
  assert.equal(OD.directModel('perplexity', '', { CHAT_PERPLEXITY_MODEL: 'perplexity/x' }).model, 'perplexity/x');
});

test('٢. النداء بأدوات الدوالّ الأصليّة، بلا حقول OpenAI وحده؛ ونداء الأداة يعود tool_use للحلقة', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization });
    return sse([
      { type: 'response.created', response: { model: 'perplexity/sonar' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'c1', name: 'read_github', arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"url":"api/_lib/chat.js"}' },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: 'c1', name: 'read_github', arguments: '{"url":"api/_lib/chat.js"}', status: 'completed' } },
      { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 5 } } },
    ]);
  };
  const route = OD.directRoute('perplexity', { PERPLEXITY_API_KEY: 'pk' });
  const r = await OD.directFetch(route, AB, { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.perplexity.ai/v1/responses');
  assert.equal(sent[0].auth, 'Bearer pk');
  const b = sent[0].body;
  assert.equal(b.model, 'perplexity/sonar');
  assert.deepEqual(b.tools.map((t) => [t.type, t.name]), [['function', 'read_github']], 'أداة دالّة أصليّة');
  assert.equal(b.instructions, 'نظام');
  assert.equal(b.store, undefined); assert.equal(b.reasoning, undefined);
  const evs = await drain(r.body);
  const start = evs.find((e) => e.type === 'content_block_start' && e.content_block.type === 'tool_use');
  assert.equal(start.content_block.name, 'read_github'); assert.equal(start.content_block.id, 'c1');
  assert.equal(evs.find((e) => e.type === 'message_delta').delta.stop_reason, 'tool_use');
});

test('٣. نتيجة الأداة تعود function_call_output بـcall_id نفسه (الحلقة كاملة كـGPT)', () => {
  const body = OD.toResponsesBody({ model: 'perplexity/sonar', messages: [
    { role: 'user', content: 'اقرأ' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'read_github', input: { url: 'x' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'محتوى الملفّ' }] },
  ] });
  assert.deepEqual(body.input[1], { type: 'function_call', call_id: 'c1', name: 'read_github', arguments: '{"url":"x"}' });
  assert.deepEqual(body.input[2], { type: 'function_call_output', call_id: 'c1', output: 'محتوى الملفّ' });
});

test('٤. موديل رفض الأدوات (400) = إعادة واحدة بلاها وبسطر يقوله للموديل؛ وأيّ فشل آخر يعود كما هو — لا chat/completions ولا وسيط', async () => {
  const sent = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    if (++n === 1) return new Response(JSON.stringify({ error: { message: 'Tools are not supported for this model' } }), { status: 400 });
    return sse([{ type: 'response.output_text.delta', delta: 'جواب' }, { type: 'response.completed', response: {} }]);
  };
  const route = OD.directRoute('perplexity', { PERPLEXITY_API_KEY: 'pk' });
  const r = await OD.directFetch(route, AB, { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body.tools, undefined);
  assert.ok(sent[1].body.instructions.endsWith(OD.PPLX_NO_TOOLS), 'الموديل يعرف أنّه بلا أدوات فلا يدّعي تعديلًا');
  const evs = await drain(r.body);
  assert.equal(evs.find((e) => e.type === 'content_block_delta').delta.text, 'جواب');

  const s2 = [];
  const bad = await OD.directFetch(route, AB, { fetchImpl: async (url) => { s2.push(String(url)); return new Response('{"error":{"message":"quota exceeded"}}', { status: 429 }); } });
  assert.equal(bad.ok, false); assert.equal(bad.status, 429);
  assert.ok(s2.every((u) => u === 'https://api.perplexity.ai/v1/responses'), 'لا chat/completions بعدها (تقاعد)');
});

test('٥. الواجهة: Perplexity على مسار الأدوات للمالك وحده؛ وغيره على مساره القديم', () => {
  const A6 = read('js/app-06-checkout.js');
  const a = A6.indexOf('const TOOL_PROVIDERS = [');
  const src = A6.slice(a, A6.indexOf('\n', A6.indexOf('TOOL_PROVIDERS.indexOf = function', a)));
  const run = (owner) => { const ctx = { omranOwnerUi: () => owner }; vm.runInNewContext(src + '\nthis.T = TOOL_PROVIDERS;', ctx); return ctx.T; };
  const own = run(true), other = run(false);
  assert.ok(own.indexOf('perplexity') !== -1, 'المالك');
  assert.equal(own.indexOf('kimi'), 8); assert.equal(own.indexOf('nope'), -1);
  assert.equal(other.indexOf('perplexity'), -1, 'غير المالك كما كان');
  assert.ok(read('js/app.bundle.js').includes("TOOL_PROVIDERS.indexOf = function(p){ const i = Array.prototype.indexOf.call(this, p); return (i === -1 && p === 'perplexity'"));
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/pplx-agent.test.cjs'));
});

test('٦. الرؤية والهويّة والمستوى: صورة المالك تصل Perplexity نفسه، ويعرف نفسه وقوّته وضعفه', () => {
  const V = require('../api/_lib/owner-vision.js');
  assert.deepEqual(V.visionPlan('perplexity', 'direct', 'perplexity/sonar', 'perplexity/sonar'), { model: 'perplexity/sonar', def: 'perplexity/sonar', forced: false });
  assert.ok(read('api/_lib/chat.js').includes("perplexity: 'Sonar من Perplexity'"));
  const PL = require('../api/_lib/provider-level.js');
  assert.equal(PL.familyOf('perplexity', 'perplexity/sonar').key, 'sonar');
  assert.match(PL.levelNote('perplexity', 'perplexity/sonar'), /لا تكتفِ بالبحث ولا بوصف ما «يمكن» فعله/);
});

/* v-pplx-names (لقطة المالك ١٥ أكتوبر: Perplexity Sonar «أدوات قراءة المستودع وتعديله غير متاحة في هذه المحادثة»): Perplexity يحجز أسماء أدواته
   المدمجة (web_search…) ويرفض الطلب كلّه بـ400 فكان v-pplx-agent يعيده بلا أدوات. مزوّد مزيّف يرفض الاسم المحجوز كما يرفضه الحقيقيّ. */
test('٧. الأسماء المحجوزة عند Perplexity تُبدَّل على السلك وتعود في البثّ — الأدوات كلّها تصل ولا إعادة بلا أدوات', async () => {
  const WS = { name: 'web_search', description: 'ابحث', input_schema: { type: 'object', properties: { query: { type: 'string' } } } };
  const body = Object.assign({}, AB, { tools: [WS, TOOL], messages: [
    { role: 'user', content: 'ابحث ثمّ اقرأ' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'c0', name: 'web_search', input: { query: 'x' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c0', content: 'نتائج' }] },
  ] });
  const sent = [];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body); sent.push(b);
    const names = (b.tools || []).map((t) => t.name).concat((b.input || []).filter((i) => i.type === 'function_call').map((i) => i.name));
    const bad = names.find((n) => OD.PPLX_RESERVED.has(n));
    if (bad) return new Response(JSON.stringify({ error: { message: 'invalid tools in request: custom function name "' + bad + '" is reserved' } }), { status: 400 });
    return sse([
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'c1', name: 'app_web_search', arguments: '' } },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: 'c1', name: 'app_web_search', arguments: '{"query":"أرضيات"}', status: 'completed' } },
      { type: 'response.completed', response: {} },
    ]);
  };
  const r = await OD.directFetch(OD.directRoute('perplexity', { PERPLEXITY_API_KEY: 'pk' }), body, { fetchImpl });
  assert.equal(sent.length, 1, 'قُبل من أوّل مرّة — لا إعادة بلا أدوات');
  assert.deepEqual(sent[0].tools.map((t) => t.name), ['app_web_search', 'read_github']);
  assert.equal(sent[0].input.find((i) => i.type === 'function_call').name, 'app_web_search', 'نداء التاريخ بالاسم نفسه');
  assert.ok(!sent[0].instructions.includes(OD.PPLX_NO_TOOLS));
  assert.ok(sent[0].instructions.includes('web_search ← app_web_search'), 'سطر يربط الاسم الأصليّ باسم السلك');
  const evs = await drain(r.body);
  assert.equal(evs.find((e) => e.type === 'content_block_start' && e.content_block.type === 'tool_use').content_block.name, 'web_search', 'الحلقة ترى اسمها');
  // غير Perplexity كما كان: GPT يرسل web_search باسمه
  const g = []; await OD.directFetch(OD.directRoute('openai', { OPENAI_API_KEY: 'k' }), Object.assign({}, body, { model: 'gpt-6-sol' }), { fetchImpl: async (u, i) => { g.push(JSON.parse(i.body)); return sse([{ type: 'response.completed', response: {} }]); } });
  assert.ok(g[0].tools.some((t) => t.name === 'web_search'));
});

test('٨. اسم محجوز جديد لم نعرفه: يُبدَّل ويُعاد الطلب بأدواته مرّة (لا إسقاط الأدوات كلّها)، ويبقى معروفًا للطلبات التالية', async () => {
  const T2 = { name: 'teach_users', description: 'علّم', input_schema: { type: 'object', properties: {} } };
  const sent = [];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body); sent.push(b);
    if ((b.tools || []).some((t) => t.name === 'teach_users')) return new Response(JSON.stringify({ error: { message: 'invalid tools in request: custom function name "teach_users" is reserved' } }), { status: 400 });
    return sse([{ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: 'c9', name: 'app_teach_users', arguments: '{}', status: 'completed' } }, { type: 'response.completed', response: {} }]);
  };
  const route = OD.directRoute('perplexity', { PERPLEXITY_API_KEY: 'pk' });
  try {
    const r = await OD.directFetch(route, Object.assign({}, AB, { tools: [T2, TOOL] }), { fetchImpl });
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[1].tools.map((t) => t.name), ['app_teach_users', 'read_github'], 'الأدوات كلّها في الإعادة');
    assert.ok(!sent[1].instructions.includes(OD.PPLX_NO_TOOLS));
    const evs = await drain(r.body);
    assert.equal(evs.find((e) => e.type === 'content_block_start' && e.content_block.type === 'tool_use').content_block.name, 'teach_users');
    sent.length = 0;
    await OD.directFetch(route, Object.assign({}, AB, { tools: [T2, TOOL] }), { fetchImpl });
    assert.equal(sent.length, 1, 'الطلب التالي بالاسم البديل من أوّل مرّة');
  } finally { OD.PPLX_RESERVED.delete('teach_users'); }
});
