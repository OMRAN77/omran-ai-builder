'use strict';
/* v-site-guide3 — تشغيل حقيقيّ لمعالج المحادثة: ما يصل المزوّد فعلًا في دور الإرشاد وغيره، للمالك (خام) ولغيره. */
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
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000, m: 1 })).toString('base64url');
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
  { model: model || 'meta-llama/llama-4-maverick-17b-128e-instruct', choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] },
  { model: model || 'meta-llama/llama-4-maverick-17b-128e-instruct', choices: [{ index: 0, delta: { content: text } }] },
  { model: model || 'meta-llama/llama-4-maverick-17b-128e-instruct', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], x_groq: { usage: { prompt_tokens: 50, completion_tokens: 3 } } },
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


const sysOf = (call) => {
  const b = call.body;
  if (typeof b.system === 'string') return b.system;
  if (Array.isArray(b.system)) return b.system.map((x) => x.text || '').join('\n');
  if (Array.isArray(b.messages)) return b.messages.filter((m) => m.role === 'system').map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
  return '';
};
const MARK = '[الإرشاد بين المواقع والصفحات';

for (const provider of ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere']) {
  test('المالك (خام) عبر ' + provider + ': دور الإرشاد يحمل القاعدة وحدها والأدوات، وغيره خام تمامًا', async () => {
    const r1 = await run({ user: 'omran', provider, messages: ask('وين ألقى تجديد الإقامة في موقع الهجرة؟'), script: [anthropicText('تمام'), oaText('تمام')] });
    assert.ok(r1.calls.length >= 1, 'وصل المزوّد');
    const s1 = sysOf(r1.calls[0]);
    assert.ok(s1.includes(MARK), 'القاعدة في النظام: ' + s1.slice(0, 80));
    assert.ok(s1.length < 2500, 'القاعدة وحدها لا طبقة التطبيق: ' + s1.length);
    const tools = r1.calls[0].body.tools || [];
    const names = tools.map((x) => x.name || (x.function && x.function.name));
    assert.ok(names.includes('web_search') && names.includes('fetch_page'), 'البحث وقراءة الصفحة متاحان: ' + names.join(','));
    const r2 = await run({ user: 'omran', provider, messages: ask('اكتب قصيدة قصيرة عن البحر'), script: [anthropicText('تمام'), oaText('تمام')] });
    assert.ok(!sysOf(r2.calls[0]).includes(MARK), 'غير الإرشاد: بلا القاعدة');
  });
}

test('مستخدم عاديّ: القاعدة في نظامه مرّة واحدة — ولا تتكرّر إن أرسلها العميل', async () => {
  const r1 = await run({ user: 'ali', provider: 'openai', messages: ask('كيف أجدد رخصة القيادة؟'), script: [anthropicText('تمام'), oaText('تمام')] });
  const s1 = sysOf(r1.calls[0]);
  assert.equal(s1.split(MARK).length - 1, 1, 'مرّة واحدة');
  const g = require('../api/_lib/site-guide.js');
  const r2 = await run({ user: 'ali', provider: 'openai', messages: [{ role: 'system', content: g.SITE_GUIDE_NOTE.trim() }].concat(ask('كيف أجدد رخصة القيادة؟')), script: [anthropicText('تمام'), oaText('تمام')] });
  assert.equal(sysOf(r2.calls[0]).split(MARK).length - 1, 1, 'نسخة العميل لا تُكرَّر');
});
