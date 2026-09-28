'use strict';
/* v-owner-auto (المالك ٢٨ سبتمبر: «في المواقع الرسميّة لمح البصر، وعندي السلام ياخذ ٣ إلى ٧ ثواني والردود أكثر»،
   واختار «تلقائي مثل الرسمي»): منذ v-owner-reason كلّ مزوّد يفكّر قبل كلّ ردّ للمالك. الآن الدور الصعب (كود، بناء،
   رياضيّات، تحليل، نصّ طويل، صورة، متابعة محادثة كود) يفكّر كما كان، والكلام العاديّ بلا تفكير:
   الوسيط بحقول v-chat-fast، وGPT المباشر بأدنى جهد تفكير يقبله الموديل، وكلود المباشر بجهد low.
   المعالج الحقيقيّ (api/_lib/chat.js) يعمل هنا بمزوّد مزيّف يسجّل كلّ طلب. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'owner-auto-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.CHAT_OPENAI_MODEL;
delete process.env.CHAT_CLAUDE_MODEL;

const root = path.resolve(__dirname, '..');
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
const ot = require(rp('api/_lib/owner-think.js'));
const od = require(rp('api/_lib/oa-direct.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
const sse = (chunks) => new Response(chunks.map((c) => 'data: ' + JSON.stringify(c) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const anthropicText = (text) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const oaResp = (text, model) => new Response([
  { type: 'response.created', response: { model } },
  { type: 'response.output_text.delta', output_index: 0, delta: text },
  { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200 });
const err400 = (message) => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }), { status: 400 });

async function run({ user, provider, messages, model, script }) {
  usageUser = user;
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
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
const badge = (r) => (r.events.filter((e) => typeof e.modelLabel === 'string' && e.modelLabel).pop() || {}).modelLabel || '';

test('١. الحكم: الكلام العاديّ فوريّ، والصعب يفكّر', () => {
  const quick = ['السلام', 'السلام عليكم', 'هلا والله', 'كيف حالك', 'شكرًا', 'اشرح لي الذكاء الاصطناعي باختصار', 'كم سعر الذهب اليوم', 'ترجم لي هذي الجملة', 'وش رأيك في فيلم الأمس'];
  for (const s of quick) assert.equal(ot.ownerThinks(s, {}), false, s);
  const hard = ['حلّل لي هذا التقرير', 'قارن بين آيفون وسامسونج', 'اشرح بالتفصيل كيف يعمل المحرّك', 'اكتب لي خطة تسويق لمطعمي',
    'احسب الضريبة على ٥٠٠٠', 'اعمل لي موقع لمطعمي', 'فيه bug في الكود', '```js\nlet x = 1\n```', 'ن'.repeat(600), 'سطر\n'.repeat(8), 'analyze this', 'compare these'];
  for (const s of hard) assert.equal(ot.ownerThinks(s, {}), true, s.slice(0, 30));
  assert.equal(ot.ownerThinks('وش هذا', { image: true }), true, 'الصورة تحليل');
  assert.equal(ot.ownerThinks('السلام', { image: true, greeting: true }), true, 'تحيّة مع صورة ليست تحيّة');
});

test('٢. متابعة محادثة كود تفكّر، والتحيّة وسطها تبقى فوريّة', () => {
  const history = [{ role: 'user', content: 'سوّ لي زرّ' }, { role: 'assistant', content: 'تفضّل:\n```html\n<button>x</button>\n```' }, { role: 'user', content: 'كمّل' }];
  assert.equal(ot.ownerThinks('كمّل', { history }), true);
  assert.equal(ot.ownerThinks('السلام', { history, greeting: true }), false);
  const chatty = [{ role: 'user', content: 'هلا' }, { role: 'assistant', content: 'هلا فيك' }, { role: 'user', content: 'كمّل' }];
  assert.equal(ot.ownerThinks('كمّل', { history: chatty }), false);
  assert.equal(ot.lastReplyHasCode([{ role: 'assistant', content: [{ type: 'text', text: '<!DOCTYPE html>' }] }]), true, 'محتوى كتل');
});

test('٣. الوسيط (DeepSeek): «السلام» بلا تفكير وشارة ⚡، والتحليل يفكّر وشارة 🧠، وغير المالك كما كان', async () => {
  chat.__orQuick.level = 2;
  let r = await run({ user: 'omran', provider: 'deepseek', messages: ask('السلام'), script: [() => anthropicText('وعليكم السلام')] });
  assert.match(r.calls[0].url, /openrouter\.ai/);
  assert.deepEqual(r.calls[0].body.thinking, { type: 'disabled' });
  assert.deepEqual(r.calls[0].body.reasoning, { enabled: false });
  assert.match(badge(r), / · ⚡$/);
  r = await run({ user: 'omran', provider: 'deepseek', messages: ask('قارن بين الخطّتين بالتفصيل'), script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.thinking, undefined);
  assert.equal(r.calls[0].body.reasoning, undefined);
  assert.match(badge(r), / · 🧠$/);
  r = await run({ user: 'someone', provider: 'deepseek', messages: ask('قارن بين الخطّتين بالتفصيل'), script: [() => anthropicText('تم')] });
  assert.deepEqual(r.calls[0].body.thinking, { type: 'disabled' }, 'غير المالك: v-chat-fast كما هو');
  assert.equal(badge(r), '', 'لا شارة لغير المالك');
});

test('٤. الوسيط يرفض حقلًا لدور المالك الفوريّ → إعادة فوريّة بدونه، بلا سطر «النموذج غير متاح»', async () => {
  chat.__orQuick.level = 2;
  try {
    const r = await run({ user: 'omran', provider: 'deepseek', messages: ask('هلا'), script: [() => err400('reasoning is not supported for this model'), () => anthropicText('هلا فيك')] });
    assert.equal(r.calls.length, 2);
    assert.deepEqual(r.calls[1].body.thinking, { type: 'disabled' }, 'reasoning وحده يسقط');
    assert.equal(r.calls[1].body.reasoning, undefined);
    assert.equal(r.text, 'هلا فيك');
    assert.ok(!r.events.some((e) => e.k === 'stModelFallback'));
  } finally { chat.__orQuick.level = 2; }
});

test('٥. كلود المباشر: Sonnet 5 بجهد low في الكلام العاديّ وبلا حقل thinking، والصعب والافتراضيّ Haiku وغير المالك بلا جهد', async () => {
  let r = await run({ user: 'omran', provider: 'claude', model: 'claude-sonnet-5', messages: ask('السلام'), script: [() => anthropicText('وعليكم السلام')] });
  assert.equal(r.calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(r.calls[0].body.model, 'claude-sonnet-5');
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'low' });
  assert.equal(r.calls[0].body.thinking, undefined, 'Opus 5.5 وFable 5.1 يرفضان disabled — الجهد وحده');
  r = await run({ user: 'omran', provider: 'claude', model: 'claude-opus-5-5', messages: ask('وش أخبارك'), script: [() => anthropicText('تم')] });
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'low' });
  r = await run({ user: 'omran', provider: 'claude', model: 'claude-sonnet-5', messages: ask('احسب الفائدة المركّبة على ١٠ آلاف'), script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.output_config, undefined);
  r = await run({ user: 'omran', provider: 'claude', messages: ask('السلام'), script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.model, 'claude-haiku-4-5');
  assert.equal(r.calls[0].body.output_config, undefined, 'Haiku 4.5 لا يفكّر ويرفض effort');
  r = await run({ user: 'someone', provider: 'claude', model: 'claude-sonnet-5', messages: ask('السلام'), script: [() => anthropicText('تم')] });
  assert.equal(r.calls[0].body.output_config, undefined);
});

test('٦. كلود يرفض الجهد → إعادة فوريّة بالموديل نفسه بلا جهد، ويُذكَر فلا يتكرّر الرفض', async () => {
  ot.__deadEffort.clear();
  try {
    let r = await run({ user: 'omran', provider: 'claude', model: 'claude-fable-5-1', messages: ask('هلا'),
      script: [() => err400('output_config.effort: not supported for this model'), () => anthropicText('هلا فيك')] });
    assert.equal(r.calls.length, 2);
    assert.deepEqual(r.calls[0].body.output_config, { effort: 'low' });
    assert.equal(r.calls[1].body.output_config, undefined);
    assert.equal(r.calls[1].body.model, 'claude-fable-5-1', 'الموديل المختار لا يسقط للافتراضيّ');
    assert.ok(!r.events.some((e) => e.k === 'stModelFallback'));
    assert.equal(r.text, 'هلا فيك');
    r = await run({ user: 'omran', provider: 'claude', model: 'claude-fable-5-1', messages: ask('هلا'), script: [() => anthropicText('تم')] });
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].body.output_config, undefined, 'الرفض محفوظ');
  } finally { ot.__deadEffort.clear(); }
});

test('٧. GPT المباشر: «السلام» بأدنى جهد تفكير، والسلّم none → minimal عند الرفض ويُذكَر، والصعب بلا reasoning', async () => {
  process.env.OPENAI_API_KEY = 'sk-openai-test';
  od.__quickRejected.clear();
  try {
    let r = await run({ user: 'omran', provider: 'openai', messages: ask('السلام'), script: [() => oaResp('وعليكم السلام', 'gpt-6-sol')] });
    assert.equal(r.calls[0].url, 'https://api.openai.com/v1/responses');
    assert.deepEqual(r.calls[0].body.reasoning, { effort: 'none' });
    assert.equal(r.calls[0].body.thinking, undefined);
    assert.equal(r.text, 'وعليكم السلام');
    r = await run({ user: 'omran', provider: 'openai', model: 'openai/gpt-5', messages: ask('هلا'),
      script: [() => err400("Unsupported value: 'reasoning.effort' does not support 'none' with this model."), () => oaResp('هلا', 'gpt-5')] });
    assert.equal(r.calls.length, 2);
    assert.deepEqual(r.calls[1].body.reasoning, { effort: 'minimal' });
    assert.equal(r.calls[1].url, 'https://api.openai.com/v1/responses', 'لا هبوط إلى chat/completions');
    r = await run({ user: 'omran', provider: 'openai', model: 'openai/gpt-5', messages: ask('هلا'), script: [() => oaResp('هلا', 'gpt-5')] });
    assert.deepEqual(r.calls[0].body.reasoning, { effort: 'minimal' }, 'الدرجة المقبولة محفوظة');
    r = await run({ user: 'omran', provider: 'openai', messages: ask('اكتب لي خطة مشروع كاملة'), script: [() => oaResp('تم', 'gpt-6-sol')] });
    assert.equal(r.calls[0].body.reasoning, undefined, 'الصعب يفكّر بإعداده الافتراضيّ');
  } finally { delete process.env.OPENAI_API_KEY; od.__quickRejected.clear(); }
});

test('٨. GPT يرفض كلّ درجات السلّم → الطلب بلا reasoning كما قبل الإصلاح', async () => {
  const calls = [];
  const f = async (url, o) => { const b = JSON.parse(o.body); calls.push(b); return b.reasoning ? err400('reasoning.effort is not supported with this model') : oaResp('تم', 'gpt-4.1'); };
  od.__quickRejected.clear();
  try {
    const route = { prov: 'openai', url: 'https://api.openai.com/v1/chat/completions', responsesUrl: 'https://api.openai.com/v1/responses', key: 'k', label: 'OpenAI' };
    const r = await od.directFetch(route, { model: 'gpt-4.1', max_tokens: 100, messages: ask('هلا'), thinking: { type: 'disabled' } }, { fetchImpl: f });
    assert.equal(r.ok, true);
    assert.deepEqual(calls.map((b) => b.reasoning && b.reasoning.effort), ['none', 'minimal', 'low', undefined]);
  } finally { od.__quickRejected.clear(); }
});
