// tests/providers-fix.test.cjs — «صلح المزودين كلهم» (المالك ١٥ أكتوبر، بعد لقطات Cohere «خطأ 404» ثمّ «خطأ 400»، وPerplexity بلا أدوات،
// وDeepSeek «أرفع الرقعة…» بلا رفعة). فحص الطلب الحقيقيّ الخارج لكلّ مزوّد من العشرة على قيود واجهته الموثّقة، ثمّ مراجعة ثانية بإعادة
// إنتاج على المعالج الحقيقيّ. هنا ما ثبت وأُصلح (Perplexity في pplx-agent.test):
//   v-why          سبب المزوّد بعد الرقم بدل «خطأ 400» وحده.
//   v-sse-error    خطأ المزوّد داخل البثّ (event: error) كان يُتجاهل فينتهي الدور «ناجحًا» على نصّ ناقص — الآن مسار C9.
//   v-tool-stop    نداء أداة كامل مع end_turn كان يُرمى فيبقى الوعد بلا تنفيذ.
//   v-owner-cap-live + v-live-default  سقف ١٢٨ ألفًا فوق حدّ Cohere/Gemini وبديل الافتراضيّ يتجاوز سلسلة الاسترداد → «خطأ 400».
//   v-groq-final   tool_choice none يجعل Groq يرفض التوليد (tool_use_failed) ويُعلَّم موديله ميّتًا.
//   v-carry-fail + v-edit-refund  التعديل الفاشل محليًّا يأكل سقف الثلاث ويطفئ «نفّذ الآن».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
process.env.AUTH_SECRET = 'providers-fix-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'PERPLEXITY_API_KEY', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS', 'SITE_URL']) delete process.env[k];
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
const logged = [];
le.logErrorAndFlush = async (tag) => { logged.push(tag); }; le.logError = (tag) => { logged.push(tag); };
const GE = require(rp('api/_lib/github-edit.js'));
let edits = [];
let editImpl = async () => ({ repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/floors', commit: 'abcdef1234567', commitUrl: 'https://github.com/OMRAN77/omran-ai-builder/commit/abcdef1', files: 1, prUrl: 'https://github.com/OMRAN77/omran-ai-builder/pull/88', prNumber: 88 });
GE.editFiles = async (input) => { edits.push(input); return editImpl(input); };
const OL = require(rp('api/_lib/owner-loop.js'));
const OD = require(rp('api/_lib/oa-direct.js'));
const PM = require(rp('api/_lib/provider-models.js'));
const chat = require(rp('api/_lib/chat.js'));

function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const enc = (evs) => evs.map((e) => (e.raw ? e.raw : 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n')).join('');
const stream = (evs) => new Response(enc(evs), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'x', usage: { input_tokens: 5, output_tokens: 0 } } });
const text = (i, t) => [{ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: i }];
const tool = (i, name, input, open) => [{ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: 'tu_' + i + Math.random().toString(36).slice(2, 6), name, input: {} } }, { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }].concat(open ? [] : [{ type: 'content_block_stop', index: i }]);
const end = (reason) => [{ type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 4 } }, { type: 'message_stop' }];
const answer = (t) => stream([start()].concat(text(0, t), end('end_turn')));
const isOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);
const isORModels = (u) => /openrouter\.ai\/api\/v1\/models/.test(u);
const EDIT = { repo: 'OMRAN77/omran-ai-builder', edits: [{ path: 'js/design-sels.js', old: 'a', new: 'b' }], message: 'صور الأرضيات' };
const ASK = [{ role: 'user', content: 'الأرضيات في الديكور عدّل التطبيق وحط صورها كاملة' }];

async function run(body, route) {
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => { let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; } calls.push({ url: String(url), body: b }); return route(String(url), b, calls.filter((c) => isOR(c.url) || /groq\.com/.test(c.url)).length); };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat({ method: 'POST', headers: {}, body: Object.assign({ token: token('omran') }, body) }, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, text: events.map((e) => e.delta || '').join(''), errors: events.filter((e) => e.error).map((e) => e.error), statuses: events.filter((e) => e.status).map((e) => e.status) };
}

test('١. v-why: سبب المزوّد بعد الرقم — غلاف الوسيط يُفتح إلى رسالة المزوّد الأصليّة، والمفاتيح تُمحى، والطول مقصوص', () => {
  const orWrap = JSON.stringify({ error: { message: 'Provider returned error', code: 400, metadata: { raw: JSON.stringify({ message: 'max_tokens must be at most 8000' }), provider_name: 'Cohere' } } });
  assert.equal(OL.upstreamWhy(orWrap), 'Cohere: max_tokens must be at most 8000');
  assert.equal(OL.upstreamWhy('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), 'Overloaded');
  assert.equal(OL.upstreamWhy('{"error":{"message":"Incorrect API key provided: sk-proj-abcd****wxyz"}}'), 'Incorrect API key provided: ***');
  assert.equal(OL.upstreamWhy('No endpoints found'), 'No endpoints found');
  assert.equal(OL.upstreamWhy(''), '');
  assert.ok(OL.upstreamWhy('x'.repeat(500)).length <= 160);
  const { ownerStopNote } = chat.__imgWhy;
  assert.equal(ownerStopNote({ status: 400, text: orWrap }), 'ما قدرت أردّ الحين — خطأ 400: Cohere: max_tokens must be at most 8000');
  assert.equal(ownerStopNote({ status: 404, text: '' }), 'ما قدرت أردّ الحين — خطأ 404', 'بلا نصّ = الرقم وحده كما كان');
});

test('٢. v-sse-error: خطأ المزوّد داخل البثّ — قبل أيّ نصّ إعادة مرّة والردّ يصل؛ وبعد نصّ الوعد سبب ظاهر لا ختام «ناجح» صامت', async () => {
  const errEv = { raw: 'event: error\ndata: ' + JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }) + '\n\n' };
  logged.length = 0;
  const a = await run({ provider: 'deepseek', messages: ASK }, (u, b, n) => !isOR(u) ? new Response('{}', { status: 404 }) : n === 1 ? stream([start(), errEv]) : answer('تمّ.'));
  assert.equal(a.text, 'تمّ.');
  assert.ok(a.statuses.some((s) => /انقطع ردّ المزوّد في منتصفه \(overloaded_error\) — أعيد مرّة/.test(s)), a.statuses.join(' | '));
  assert.ok(logged.includes('chat/mid-stream'), 'يُسجَّل');
  const b = await run({ provider: 'deepseek', messages: ASK }, (u) => !isOR(u) ? new Response('{}', { status: 404 }) : stream([start()].concat(text(0, 'أرفع الرقعة: صورة الأرضية تظهر كاملة'), [errEv])));
  assert.ok(b.events.some((e) => e.ownerStop && /انقطع ردّ المزوّد في منتصفه \(overloaded_error\)/.test(e.error)), JSON.stringify(b.errors));
  assert.ok(!b.events.some((e) => e.status && /ينفّذ/.test(e.status)), 'لا «نفّذ الآن» على وعد قطعه المزوّد');
  // أعلى الدفعة {"error":{…}} عند الوسيط بلا event: error
  const c = await run({ provider: 'gemini', messages: ASK }, (u) => !isOR(u) ? new Response('{}', { status: 404 }) : stream([start()].concat(text(0, 'أقرأ'), [{ raw: 'data: ' + JSON.stringify({ error: { message: 'upstream timeout', code: 502, metadata: { error_type: 'provider_timeout' } } }) + '\n\n' }])));
  assert.ok(c.events.some((e) => e.ownerStop && /provider_timeout/.test(e.error)), JSON.stringify(c.errors));
});

test('٣. v-tool-stop: نداء أداة كامل مع end_turn يُنفَّذ (لا يبقى الوعد على الشاشة)؛ والنداء الناقص بلا ختام لا يُنفَّذ أبدًا', async () => {
  edits = []; logged.length = 0;
  const a = await run({ provider: 'deepseek', messages: ASK }, (u, b, n) => !isOR(u) ? new Response('{}', { status: 404 }) : n === 1 ? stream([start()].concat(text(0, 'أرفع الرقعة: '), tool(1, 'edit_github', EDIT), end('end_turn'))) : answer('رفعت: طلب السحب #88.'));
  assert.equal(edits.length, 1, 'التعديل نُفّذ');
  assert.ok(logged.includes('chat/tool-stop'), 'يُسجَّل');
  edits = [];
  const b = await run({ provider: 'deepseek', messages: ASK }, (u, b, n) => !isOR(u) ? new Response('{}', { status: 404 }) : n === 1 ? stream([start()].concat(text(0, 'أرفع: '), tool(1, 'edit_github', EDIT, true))) : answer('تمّ.'));
  assert.equal(edits.length, 0, 'نداء لم تُغلق كتلته لا يُنفَّذ');
  assert.ok(b.statuses.some((s) => /stream_cut|انقطع ردّ المزوّد/.test(s)) || b.errors.length, 'يُعاد أو يظهر سببه');
  assert.equal(OL.toolStop(OL.state(false), 'end_turn', [{ type: 'tool_use', closed: true, name: 'x', inputJson: '{}' }]), 'end_turn', 'غير المالك كما كان');
  assert.equal(OL.toolStop(OL.state(true), 'max_tokens', [{ type: 'tool_use', closed: true, name: 'x', inputJson: '{}' }]), 'max_tokens', 'القطع لطوله كما هو');
});

test('٤. v-owner-cap-live + v-live-default: سقف المالك لا يتجاوز حدّ خرج الموديل المعلَن؛ وبديل الافتراضيّ الميّت يمرّ بسلسلة الاسترداد (400 سقف → إعادة بحدّه)', async () => {
  PM.__resetCache(); db.clear(); delete PM.__live.cohere;
  const LIVE = { data: [
    { id: 'cohere/command-a', name: 'Cohere: Command A', created: 1700000000, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] }, top_provider: { max_completion_tokens: 8000 } },
    { id: 'cohere/command-b-pro', name: 'Cohere: Command B Pro', created: 1760000000, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] }, top_provider: { max_completion_tokens: 32000 } },
  ] };
  await PM.loadModels({ fetch: async () => new Response(JSON.stringify(LIVE), { status: 200 }) });
  const mx = [];
  const route = (u, b) => {
    if (isORModels(u)) return new Response(JSON.stringify(LIVE), { status: 200 });
    if (!isOR(u)) return new Response('{}', { status: 404 });
    mx.push([b.model, b.max_tokens]);
    if (b.model === 'cohere/command-a') return new Response(JSON.stringify({ error: { message: 'No endpoints found for cohere/command-a.', code: 404 } }), { status: 404 });
    if (b.max_tokens > 16000) return new Response(JSON.stringify({ error: { message: 'Provider returned error', code: 400, metadata: { raw: JSON.stringify({ message: 'max_tokens must be at most 16000' }), provider_name: 'Cohere' } } }), { status: 400 });
    return answer('من كوهير');
  };
  const r = await run({ provider: 'cohere', messages: [{ role: 'user', content: 'سؤال' }] }, route);
  assert.equal(mx[0][1], 8000, 'الافتراضيّ بحدّه المعلَن لا ١٢٨ ألفًا');
  assert.deepEqual(mx.slice(1).map((x) => x[0]), ['cohere/command-b-pro', 'cohere/command-b-pro'], 'البديل ثمّ إعادته بالسقف');
  assert.equal(mx[1][1], 32000, 'البديل بحدّه المعلَن');
  assert.equal(mx[2][1], 16000, 'ثمّ بالحدّ من نصّ الرفض');
  assert.equal(r.text, 'من كوهير', 'لا «خطأ 400»');
  delete PM.__live.cohere; PM.__resetCache(); db.clear();
});

test('٥. v-groq-final: Groq بلا tool_choice none في الختام؛ ورفض tool_use_failed ليس موديلًا ميّتًا ويُعاد بدل أن يقف', async () => {
  const body = OD.directRoute('groq', { GROQ_API_KEY: 'g' }) && require(rp('api/_lib/oa-direct.js'));
  assert.ok(body);
  const OA = { model: 'openai/gpt-oss-120b', max_tokens: 100, messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'read_github', description: 'd', input_schema: { type: 'object', properties: {} } }], tool_choice: { type: 'none' } };
  const sent = [];
  await OD.directFetch(OD.directRoute('groq', { GROQ_API_KEY: 'g' }), OA, { fetchImpl: async (u, i) => { sent.push(JSON.parse(i.body)); return new Response('data: ' + JSON.stringify({ model: 'm', choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); } });
  assert.equal(sent[0].tool_choice, undefined, 'Groq بلا tool_choice none');
  const gp = []; await OD.directFetch(OD.directRoute('openai', { OPENAI_API_KEY: 'k' }), Object.assign({}, OA, { model: 'gpt-6-sol' }), { fetchImpl: async (u, i) => { gp.push(JSON.parse(i.body)); return new Response('data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); } });
  assert.ok(gp[0].tool_choice === 'none' || (gp[0].tool_choice && gp[0].tool_choice.type === 'none') || gp[0].tool_choice === undefined, 'غير Groq كما كان');
  const s = OL.state(true);
  const e = new Error('OA_STREAM_PROTOCOL_ERROR: provider error — tool_use_failed: model called a tool'); e.code = 'OA_STREAM_PROTOCOL_ERROR';
  assert.equal(OL.midStream(s, e, { sawText: false }).kind, 'retry');
  assert.equal(OL.midStream(s, e, { sawText: false }).kind, 'retry', 'مرّتان لـtool_use_failed');
});

test('٦. v-edit-refund + v-carry-fail: تعديل فشل محليًّا (النصّ القديم غير موجود) لا يأكل سقف الثلاث — الرابع الصحيح يُرفع؛ و«نفّذ الآن» تبقى بعد الفشل', async () => {
  edits = [];
  let k = 0;
  editImpl = async () => (++k <= 3 ? { error: 'النصّ القديم غير موجود في js/design-sels.js', local: true } : { repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/floors', commit: 'abcdef1234567', commitUrl: 'https://github.com/OMRAN77/omran-ai-builder/commit/abcdef1', files: 1, prUrl: 'https://github.com/OMRAN77/omran-ai-builder/pull/88', prNumber: 88 });
  const steps = [];
  const r = await run({ provider: 'deepseek', messages: ASK }, (u, b, n) => {
    if (!isOR(u)) return new Response('{}', { status: 404 });
    steps.push(n);
    return n <= 4 ? stream([start()].concat(tool(0, 'edit_github', EDIT), end('tool_use'))) : answer('رفعت: طلب السحب #88.');
  });
  assert.equal(edits.length, 4, 'أربع محاولات وصلت التعديل');
  assert.ok(!/ثلاث رفعات في هذا الردّ/.test(JSON.stringify(r.calls.map((c) => c.body && c.body.messages))), 'الرابعة لم تُرفض بالسقف');
  assert.match(r.text, /#88/);
  editImpl = async () => ({ repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/floors', commit: 'abcdef1234567', commitUrl: 'x', files: 1, prUrl: 'https://github.com/OMRAN77/omran-ai-builder/pull/88', prNumber: 88 });
  assert.match(OL.FINAL_EDIT_NOTE, /إلّا إن رجع edit_github «النصّ القديم غير موجود»/);
});
