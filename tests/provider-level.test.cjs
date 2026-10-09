// v-provider-level (المالك ٩ أكتوبر: «افحص المزوّدين كلّهم… كلّ واحد تزوّده بمعلومات قويّة، يعني توصله إلى مستواه»):
// كلّ مزوّد عند المالك يأخذ بعد سطر هويّته ملفّ عائلته (قوّته · كيف يصل لأعلى مستواه · ما يعوّضه)، والصغير قواعد تعويض،
// داخل الكتلة الثابتة المخزَّنة فالكاش يبقى؛ وغير المالك كما كان. يشغّل api/_lib/chat.js الحقيقيّ بـfetch مزيّف.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'provider-level-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
const db = new Map();
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
let usageUser = 'omran';
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const anthCredit = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }), { status: 400 });
const orCredit = () => new Response(JSON.stringify({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } }), { status: 402 });

async function run(user, body, route) {
  usageUser = user;
  const calls = [];
  const out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    return route(String(url), b);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, text: events.map((e) => e.delta || '').join('') };
}
const isAnth = (u) => /api\.anthropic\.com/.test(u);
const isOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);
const orModels = (calls) => calls.filter((c) => isOR(c.url)).map((c) => c.body && c.body.model);
const ask = (q) => [{ role: 'user', content: q }];

const sysText = (b) => (Array.isArray(b.system) ? b.system.map((x) => x.text).join('') : String(b.system || ''));
const { levelNote, familyOf } = require(rp('api/_lib/provider-level.js'));

test('١. العائلة من معرّف الموديل لا من اسم المزوّد وحده (Groq = GPT-OSS، صفّ الوسيط = شركة الموديل)', () => {
  const cases = [
    ['claude', 'claude-opus-5-5', 'claude'], ['claude', 'anthropic/claude-haiku-4.5', 'claude'], ['openai', 'gpt-6-sol', 'gpt'],
    ['groq', 'openai/gpt-oss-120b', 'gpt-oss'], ['groq', 'meta-llama/llama-4-maverick', 'llama'], ['gemini', 'google/gemini-3.8-flash', 'gemini'],
    ['deepseek', 'deepseek/deepseek-v4-pro', 'deepseek'], ['mistral', 'mistralai/ministral-14b-2512', 'mistral'], ['cohere', 'cohere/command-a', 'cohere'],
    ['kimi', 'kimi-k3', 'kimi'], ['openrouter', 'x-ai/grok-4.6', 'grok'], ['openrouter', 'qwen/qwen3-max', 'qwen'], ['openrouter', 'anthropic/claude-sonnet-5', 'claude'],
    ['deepseek', '', 'deepseek'],
  ];
  for (const [p, m, k] of cases) assert.equal((familyOf(p, m) || {}).key, k, p + ' ' + m);
  assert.equal(levelNote('openrouter', 'unknown/xyz'), '', 'عائلة مجهولة: المنهج العامّ وحده');
  assert.match(levelNote('deepseek', 'deepseek/deepseek-v4-pro'), /الموديلات المتاحة في هذا التطبيق الآن[^\n]*Fable 5\.1[^\n]*GPT-6[^\n]*Kimi K3/, 'الواقع الحاليّ من التطبيق');
});

test('٢. الموديل الصغير يأخذ قواعد التعويض والكبير لا', () => {
  for (const m of ['claude-haiku-4-5', 'mistralai/ministral-14b-2512', 'openai/gpt-oss-20b', 'gpt-5-mini', 'google/gemini-2.5-flash-lite', 'mistralai/mistral-small-3.2'])
    assert.match(levelNote('', m), /أنت موديل خفيف وسريع/, m);
  for (const m of ['claude-opus-5-5', 'openai/gpt-oss-120b', 'deepseek/deepseek-v4-pro', 'google/gemini-3.8-flash', 'kimi-k3', 'x-ai/grok-4.6', 'mistralai/mistral-medium-3-5'])
    assert.ok(!/موديل خفيف/.test(levelNote('', m)), m);
});

test('٣. المالك: كلّ مزوّد يصله ملفّ مستواه بعد هويّته داخل الكتلة الثابتة المخزَّنة — وغير المالك كما كان', async () => {
  const cases = [['claude', '', /قوّتك: التحليل العميق/], ['deepseek', '', /هذه ساحتك: في أيّ مسألة منطق/], ['mistral', 'mistralai/ministral-14b-2512', /أنت موديل خفيف وسريع/],
    ['cohere', '', /هذه ساحتك: ابحث، اقرأ أقوى مصدر/], ['gemini', '', /سياق طويل جدًّا/], ['openai', '', /تميل إلى الإطالة/], ['openrouter', 'x-ai/grok-4.6', /صراحة ومباشرة/]];
  for (const [prov, model, re] of cases) {
    const r = await run('omran', { provider: prov, model, messages: ask('حلّل لي هذا') }, (u) => (isOR(u) || isAnth(u) ? sse('تمام.') : new Response('{}', { status: 404 })));
    const b = r.calls.find((c) => isOR(c.url) || isAnth(c.url)).body;
    const t = sysText(b);
    assert.match(t, /\[مستواك — اعرف نفسك واعمل في أعلى قدرتك\]/, prov);
    assert.match(t, re, prov);
    assert.ok(t.indexOf('[مستواك') > t.indexOf('باسمك الحقيقيّ'), prov + ': بعد سطر الهويّة');
    if (Array.isArray(b.system)) { assert.ok(b.system[0].cache_control, prov); assert.match(b.system[0].text, /\[مستواك/, prov + ': في الثابت المخزَّن (الكاش يبقى)'); }
  }
  const v = await run('vipuser', { provider: 'openai', messages: ask('حلّل لي هذا') }, (u) => (isOR(u) ? sse('تمام.') : new Response('{}', { status: 404 })));
  assert.ok(!/\[مستواك/.test(sysText(v.calls.find((c) => isOR(c.url)).body)), 'غير المالك كما كان');
});
