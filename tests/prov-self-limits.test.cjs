// tests/prov-self-limits.test.cjs — v-prov-self (٣): حدود المزوّدين بأقصى ما يقدرون، بلا «ما أقدر» وبلا كذب.
//  (١) GPT يرجع 429 ومعه retry-after ٢٥ ث: مسار responses كان يُسقط الترويسات فتعيد C4 بعد ٠٫٨ ث و٢ ث — ثلاثة نداءات ضائعة (الفحص الشامل).
//  (٢) Groq المجّانيّ: الجسم المقصوص كان بلا أدوات كلّها — الآن تبقى أداتا الصور مع طلب رسم/صورة، والبحث مع سؤال معلومة، إن اتّسعت.
//  (٣) Perplexity (بلا أدوات): صورة المالك من محرّك الصور والشريحة «Perplexity» — سطر تحت الصورة يقول أيّ محرّك رسمها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'prov-self-limits-secret';
process.env.OPENAI_API_KEY = 'test-oai-key';
process.env.OPENROUTER_API_KEY = 'test-or-key';
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'CHAT_OPENAI_MODEL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? db.get(k) : null), kvPutJSON: async (k, v) => { db.set(k, v); }, kvDel: async () => {}, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [] });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }) });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const OD = require(rp('api/_lib/oa-direct.js'));
const tok = () => { const p = Buffer.from(JSON.stringify({ u: 'omran', exp: Date.now() + 6e5 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };

test('GPT 429 with retry-after 25 s: the direct call is not retried at 0.8 s and 2 s (was three calls), and no other provider answers; a short retry-after is honored once in-call (v-direct-429)', async () => {
  const OD = require('../api/_lib/oa-direct.js');
  const calls = [];
  const save = global.fetch;
  const saveMax = OD.__cfg.waitMax;
  OD.__cfg.waitMax = 10; // موعد ٢٥ ث أبعد من حدّ النوم داخل النداء — كما لو كان ٤٠ ث على ٦٠ ث
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (/api\.openai\.com\/v1\/responses/.test(u)) return new Response(JSON.stringify({ error: { type: 'rate_limit_error', message: 'Rate limit reached. Please try again in 25s.' } }), { status: 429, headers: { 'retry-after': '25' } });
    return new Response(JSON.stringify({ error: { message: 'second refused' } }), { status: 500 });
  };
  const req = { method: 'POST', headers: {}, body: { token: tok(), provider: 'openai', model: 'openai/gpt-6-astra', messages: [{ role: 'user', content: 'مرحبا' }] } };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; OD.__cfg.waitMax = saveMax; }
  assert.equal(calls.filter((u) => /api\.openai\.com\/v1\/responses/.test(u)).length, 1, 'نداء مباشر واحد: ' + calls.join(' '));
  assert.ok(calls.every((u) => /openai\.com|openrouter\.ai\/api\/v1\/messages/.test(u)), 'GPT نفسه (مباشر ثمّ عبر الوسيط بالموديل نفسه) لا غيره');
  // v-direct-429: موعد قصير (٠٫٢ ث) يُنتظر مرّة داخل النداء ويُعاد النداء نفسه — لا ٠٫٨ ث ولا ٢ ث
  const route = OD.directRoute('openai', { OPENAI_API_KEY: 'ok' });
  let n = 0; const t0 = Date.now();
  const r = await OD.directFetch(route, { model: 'gpt-6-astra', max_tokens: 50, system: 's', messages: [{ role: 'user', content: 'x' }] }, { fetchImpl: async () => (++n === 1
    ? new Response(JSON.stringify({ error: { type: 'rate_limit_error', message: 'Rate limit reached.' } }), { status: 429, headers: { 'retry-after': '0.2' } })
    : new Response('data: ' + JSON.stringify({ type: 'response.created', response: { model: 'gpt-6-astra' } }) + '\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })) });
  assert.equal(r.ok, true); assert.equal(n, 2); assert.ok(Date.now() - t0 >= 200, 'انتظر الموعد نفسه');
  assert.match(read('api/_lib/oa-direct.js'), /rl = \{ ok: false, status: r\.status, model: rb\.model, api: 'responses', text: async \(\) => t, headers: r\.headers \|\| null \};/);
});

test('free Groq: the reduced body keeps the image tools for a drawing/image turn and web search for a question — and none for a greeting', () => {
  // مدخل أكبر من الحدّ نفسه (كالمالك: نظام ١٨ ألف حرف) — فلا يكفي «السقف وحده» ويُقصّ الجسم
  const sys = 'أنت موديل يعمل على خوادم Groq.\nأسلوب.\n\n' + 'أ'.repeat(16000) + '\n\n[هويّتك]: موديل على Groq.';
  const fn = (name, n) => ({ type: 'function', function: { name, description: 'd'.repeat(n), parameters: { type: 'object', properties: {} } } });
  const tools = [fn('web_search', 900), fn('read_github', 1700), fn('generate_image', 600), fn('edit_image', 1300), fn('edit_github', 1500)];
  const body = (text) => ({ model: 'qwen/qwen3.8-27b', stream: true, max_completion_tokens: 16000, tools, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }] });
  const T = (b) => Math.ceil((JSON.stringify(b.messages).length + (b.tools ? JSON.stringify(b.tools).length : 0)) / 3);
  const fit = (text, limit, owner) => { const b = body(text); return OD.fitGroqTpm(b, 'on tokens per minute (TPM): Limit ' + limit + ', Requested ' + (T(b) + 16000) + ', please reduce', owner); };
  const names = (b) => (b.tools || []).map((x) => x.function.name).sort();
  const draw = fit('ارسم قطة على البحر', 8000, true);
  assert.deepEqual(names(draw), ['edit_image', 'generate_image'], 'أداتا الصور فقط');
  assert.match(draw.messages[0].content, /بأدوات محدودة لضيق حدّ مفتاح Groq في الدقيقة: generate_image، edit_image فقط/, 'المالك: السبب باسمه');
  // v-plan-models: لغير المالك الأدوات نفسها، والملاحظة محايدة بلا اسم مزوّد (قاعدة المالك)
  const drawUser = fit('ارسم قطة على البحر', 8000);
  assert.deepEqual(names(drawUser), ['edit_image', 'generate_image'], 'غير المالك: الأداتان نفسهما');
  const noteUser = drawUser.messages[0].content.slice(drawUser.messages[0].content.lastIndexOf('[هذا الدور'));
  assert.match(noteUser, /^\[هذا الدور بأدوات محدودة لضيق السياق المتاح الآن: generate_image، edit_image فقط/);
  assert.ok(!/Groq|عمران/.test(noteUser), 'لا اسم مزوّد ولا «عمران» في ملاحظة غير المالك');
  assert.deepEqual(names(fit('كم سعر الذهب اليوم؟', 8000)), ['web_search']);
  const hi = fit('مرحبا', 8000);
  assert.equal(hi.tools, undefined, 'التحيّة بلا أدوات');
  assert.match(hi.messages[0].content, /هذا الدور بلا أدوات/);
  // حدّ أضيق لا يتّسع للأداتين: تسقط من الآخر حتّى تتّسع، ثمّ بلا أدوات
  const tight = fit('ارسم قطة', 2000);
  assert.ok(!tight.tools || tight.tools.length < 2, 'تسقط ما لا يتّسع');
  // صورة base64 مرفقة تُعدّ ألف توكن لا عشرات الآلاف — فيبقى الجسم ممكنًا
  const img = { model: 'q', stream: true, max_completion_tokens: 16000, tools, messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: 'غير الاشكال' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(200000) } }] }] };
  const imgFit = OD.fitGroqTpm(img, 'on tokens per minute (TPM): Limit 8000, Requested 24000, please reduce');
  assert.ok(imgFit, 'جسم بصورة يتّسع');
  assert.deepEqual(names(imgFit), ['edit_image', 'generate_image'], 'صورة مرفقة = أداتا الصور');
});

test('Perplexity (no tools): the owner\'s image says which engine drew it, in a line under the image — and nothing for tool providers or users', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.equal((s.match(/\{ const __nt = __omranNoToolsImgNote\(__(?:g)?[dD]ata\.engine\); if\(__nt\) cur\.messages\.push\(\{ role: 'assistant', content: __nt \}\); \}/g) || []).length, 2, f + ': التعديل والرسم، رسالة بعد الصورة');
  }
  const src = read('js/app-09-attach.js');
  const i = src.indexOf('function __omranNoToolsImgNote(engine){');
  const fnSrc = src.slice(i, src.indexOf('\n}\n', i) + 2);
  const st = { user: 'omran', prov: 'perplexity' };
  const ctx = vm.createContext({ authGet: () => st.user, localStorage: { getItem: () => st.prov }, TOOL_PROVIDERS: ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter', 'kimi'], __swallow: () => {} });
  vm.runInContext(fnSrc, ctx);
  assert.equal(ctx.__omranNoToolsImgNote('gemini-nano-banana'), '🎨 Gemini Image');
  assert.equal(ctx.__omranNoToolsImgNote('openai'), '🎨 GPT Image');
  assert.equal(ctx.__omranNoToolsImgNote('pollinations-free'), '🎨 Pollinations');
  st.prov = 'groq';
  assert.equal(ctx.__omranNoToolsImgNote('openai'), '', 'مزوّد بالأدوات يرسم بنفسه (v-prov-self ١)');
  st.prov = 'perplexity'; st.user = 'someone';
  assert.equal(ctx.__omranNoToolsImgNote('openai'), '', 'غير المالك: لا اسم مزوّد');
});
