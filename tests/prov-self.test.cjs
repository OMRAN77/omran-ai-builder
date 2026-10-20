// tests/prov-self.test.cjs — v-prov-self (المالك ١١ أكتوبر: «كلّ واحد ونفسه… من غير لفّ ودوران… ما أريد كلمة ما أقدر»).
// الفحص الشامل لكلّ المزوّدين (Playwright بخادم وهميّ، ١٠ مزوّدين × ٦ أفعال): المحادثة وGitHub كلّ واحد بنفسه، لكن
//  (١) تعديل الصورة و«ارسم» يذهبان من الواجهة مباشرةً إلى /api/maha-image لكلّ مزوّد والشريحة تقول اسم المختار (لقطة Groq «غير الاشكال»)،
//  (٢) الوكيل Claude دائمًا مهما اختار، ويهبط بصمت إلى DeepSeek/Mistral/Groq بلا أدوات إن فشل Claude،
//  (٣) مصنّف خفيّ (Gemini Flash) يُنادى على كلّ رسالة فيها كلمة وسائط.
// الآن للمالك: الطلب يصل المزوّد المختار فيرسم/يعدّل بأداته (GPT ← GPT Image، Gemini ← Gemini Image)، والوكيل مع Claude وحده،
// ولا هبوط صامت — والمستخدمون كما كانوا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OWNER_AGENT_CLAUDE = 'on'; // v-agent-claude-off: الاختبار يفحص الوكيل وهو شغّال
process.env.AUTH_SECRET = 'prov-self-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
process.env.MISTRAL_API_KEY = 'test-mistral-key';
process.env.GROQ_API_KEY = 'test-groq-key';
delete process.env.OPENROUTER_API_KEY;

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
const store = new Map();
stub('api/_lib/kv.js', { kvPutJSON: async (k, v) => { store.set(k, v); }, kvGetJSON: async (k) => (store.has(k) ? store.get(k) : null), kvDel: async (k) => { store.delete(k); }, kvExpire: async () => {}, kvIncr: async () => 1, kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [], kvGetRaw: async () => null, kvSetRaw: async () => {} });
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: 'omran' }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const agent = require(rp('api/_lib/agent.js'));

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
async function agentFails(status, body, orResp) {
  const calls = [];
  const save = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (/api\.anthropic\.com\/v1\/messages/.test(u)) return new Response(JSON.stringify(body), { status });
    if (orResp && /openrouter\.ai/.test(u)) return orResp();
    // لو هبط بصمت لوجد هؤلاء يجيبون
    return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'أنا البديل' } }] }) + '\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  let written = '';
  const req = { method: 'POST', headers: { host: 'x' }, body: { messages: [{ role: 'user', content: 'مرحبا' }], token: token('omran') } };
  const res = { setHeader() {}, status() { return this; }, json(v) { written += 'data: ' + JSON.stringify(v) + '\n'; return this; }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await agent(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, text: events.filter((e) => e.delta).map((e) => e.delta).join(''), errors: events.filter((e) => e.error).map((e) => e.error) };
}

test('agent (real handler): Claude fails for the owner → no silent DeepSeek/Mistral/Groq without tools; one short reason line', async () => {
  const a = await agentFails(402, { error: { type: 'billing_error', message: 'Your credit balance is too low' } });
  assert.ok(!a.calls.some((u) => /deepseek|mistral|groq/.test(u)), 'لا هبوط: ' + a.calls.join(' '));
  assert.equal(a.text, '', 'لا «أنا البديل»');
  assert.deepEqual(a.errors, ['ما عندي رصيد — Anthropic']);
  const b = await agentFails(500, { error: { type: 'api_error', message: 'boom' } });
  assert.ok(!b.calls.some((u) => /deepseek|mistral|groq/.test(u)));
  assert.equal(b.errors.length, 1);
  assert.match(b.errors[0], /^ما قدرت أردّ الحين — خطأ 5\d\d$/);
  const src = read('api/_lib/agent.js');
  assert.match(src, /for \(const fb of \(isOwner\(runUser\) \? \[\] : fallbacks\)\)/, 'غير المالك (لا وصول له اليوم) كما كان');
});

test('client: for the owner with a tool provider, no media path runs before the provider — no hidden classifier, no direct edit/draw/video/talking character', () => {
  for (const f of ['js/app-09-attach.js', 'js/app.bundle.js']) {
    const s = read(f);
    const i = s.indexOf('const __ownerProvTurn = (function(){');
    assert.ok(i > 0, f);
    const def = s.slice(i, s.indexOf('})();', i) + 5);
    assert.match(def, /omranOwnerUi\(\)\)\) return false;/, 'المالك وحده');
    assert.match(def, /if\(\(window\.__omMode && window\.__omMode !== 'web' && window\.__omMode !== 'think'\) \|\| window\.__chatToolsOn === false\) return false;/, 'أوضاع المحرّكات في «+» وClaude Code والأدوات المطفأة كما كانت؛ «بحث الويب» و«التفكير» لا تطفئه (v-owner-solo-all)');
    assert.match(def, /if\(window\.__agentModeOn === true && __p === 'claude'\) return false;/, 'وكيل Claude كما كان');
    assert.match(def, /TOOL_PROVIDERS\.indexOf\(__p\) === -1\) return false;/, 'مزوّد بلا أدوات (Perplexity) كما كان');
    assert.match(def, /__imgFormatIntent\(text\)\) return false;/, 'تحويل الصيغة المحلّيّ باقٍ');
    // قبل المصنّف: لا نداء media-intent
    const gate = s.slice(i, s.indexOf('window.__mediaGate = __mediaLane;', i));
    assert.match(gate, /if\(__ownerProvTurn\) __mediaLane = 'none';\n\s+else if\(text && !__mediaHasImg && __MEDIA_WORD_RE\.test\(text\)\)\{/);
    assert.ok(s.includes("const __blockAutoImage = !!(__ownerProvTurn /* v-prov-self */ || (__pastedLike && !__srcImg && !__explicitImgReq));"), f + ': كلّ فروع التعديل/الرسم/الإعلان التلقائيّة');
    assert.ok(s.includes('const __talkCharIntent = !__ownerProvTurn /* v-prov-self */ &&'), f + ': الشخصيّة المتكلّمة');
    assert.ok(s.includes("if(window.__agentModeOn && !imageAttachments.length && (localStorage.getItem('aiapp_provider') || 'openai') === 'claude'){"), f + ': الوكيل مع Claude وحده');
  }
});

test('client tools: an image the provider draws/edits runs on its own company engine (GPT → GPT Image, Gemini → Gemini Image), the rest on the usual chain', () => {
  const src = read('js/app-17-agent-tools.js');
  assert.equal((src.match(/forceEngine: provEngine\(\),/g) || []).length, 2, 'الرسم والتعديل كلاهما');
  const i = src.indexOf('function provEngine() {');
  const fnSrc = src.slice(i, src.indexOf('\n  }\n', i) + 4);
  const ls = { v: 'openai' };
  const ctx = vm.createContext({ omranOwnerUi: () => true, localStorage: { getItem: () => ls.v } });
  vm.runInContext(fnSrc, ctx);
  const eng = (p) => { ls.v = p; return ctx.provEngine(); };
  assert.equal(eng('openai'), 'gpt');
  assert.equal(eng('gemini'), 'nano');
  for (const p of ['claude', 'groq', 'deepseek', 'mistral', 'cohere', 'kimi', 'openrouter']) assert.equal(eng(p), undefined, p);
  ctx.omranDefaultProv = () => 'openrouter'; // v-owner-solo-all: جهاز جديد بلا اختيار = افتراضيّ المالك (كروك) لا GPT Image الخام
  assert.equal(eng(null), undefined, 'بلا اختيار مخزَّن: سلسلة المحرّكات المعتادة');
  ctx.omranOwnerUi = () => false;
  assert.equal(eng('openai'), undefined, 'غير المالك: لا شيء (والخادم يرفضه لغيره أصلًا)');
  assert.match(read('api/_lib/maha-image.js'), /const __optForceEngine = \(__isOwnerReq && \(body\.forceEngine === 'nano' \|\| body\.forceEngine === 'gpt'\)\) \? body\.forceEngine : '';/);
});

test('chip and work note: the agent label only with Claude; the provider draws itself and names the engine', () => {
  assert.match(read('js/modes.js'), /\(window\.__agentModeOn === true && curProv\(\) === 'claude'\)[^?]*\? agentLabel\(\) : curProvName\(\);/);
  assert.ok(read('index.html').includes('/js/modes.js?v=m171026b'), 'وسم modes.js مرفوع');
  const GE = require(rp('api/_lib/github-edit.js'));
  assert.match(GE.WORK_NOTE, /- أنت من يرسم ويعدّل الصور حين تُطلب: بأداتَي generate_image وedit_image بنفسك، بلا «ما أقدر» ولا تحويل لغيرك؛ واذكر في سطر المحرّك/);
});

test('v-credit-who: Claude المباشر يسقط بغير رصيد ثمّ الوسيط بلا رصيد = «OpenRouter · Anthropic خطأ 529» — سبب المباشر لا يُمحى', async () => {
  process.env.OPENROUTER_API_KEY = 'test-or-key';
  try {
    const orNoCredit = () => new Response(JSON.stringify({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } }), { status: 402 });
    const a = await agentFails(529, { error: { type: 'overloaded_error', message: 'Overloaded' } }, orNoCredit);
    assert.ok(a.calls.some((u) => /openrouter\.ai/.test(u)), 'جرّب الوسيط');
    assert.deepEqual(a.errors, ['ما عندي رصيد — OpenRouter · Anthropic خطأ 529']);
    const b = await agentFails(400, { error: { type: 'billing_error', message: 'Your credit balance is too low' } }, orNoCredit);
    assert.deepEqual(b.errors, ['ما عندي رصيد — Anthropic و OpenRouter']);
  } finally { delete process.env.OPENROUTER_API_KEY; }
});
