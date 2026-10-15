'use strict';
/* v-claude-full (عمران ١٥ أكتوبر: «الانثروبك عندي ضعيف جدًّا… فرق شاسع بينه وبين الأصلي»): ما كان يُضعف كلود في محادثة المالك
   (قيس بالمعالج الحقيقيّ): السؤال العاديّ بجهد low، وسقف بحثين مع «الجواب من البحث لا من علمك»، وسجلّ المحادثات المعمّمة بأمر
   «اعتمدها كما هي» فتصير ردود المزوّدين الأضعف حقائق عنده. لكلود وحده: جهده الافتراضيّ، وحتّى ٦ بحوث تكمّل علمه، ورأس سجلّ يطلب
   التحقّق. المجاملة فوريّة كما كانت، والمنتقي يغلب، وبقيّة المزوّدين وغير المالك كما كانوا حرفيًّا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'claude-full-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'CHAT_CLAUDE_MODEL', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'TAVILY_API_KEY', 'CHAT_PROMPT_CACHE']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
const stub = (f, e) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports: e }; };
stub('api/_lib/kv.js', {
  kvGetJSON: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null), kvPutJSON: async (k, v) => { db.set(k, structuredClone(v)); },
  kvDel: async (k) => { db.delete(k); }, kvExpire: async () => {}, kvGetRaw: async () => null, kvSetRaw: async () => {}, kvIncr: async () => 1,
  kvIncrBy: async () => 1, kvDecrBy: async () => 0, kvSetIfAbsent: async () => true, kvList: async () => [],
});
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [], isPlacesAsk: () => false, regionOf: () => '' });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const PS = require(rp('api/_lib/prov-self.js'));
const { ownerIdentity, searchCap, CLAUDE_SEARCH_NOTE } = chat.__imgWhy;

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sse = (evs) => new Response(evs.map((c) => 'event: ' + c.type + '\ndata: ' + JSON.stringify(c) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } };
const text = (t) => sse([start, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }]);
const searches = (n) => { const evs = [start]; for (let i = 0; i < n; i++) evs.push({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: 'tu_' + i, name: 'web_search', input: {} } }, { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ query: 'gold price ' + i }) } }, { type: 'content_block_stop', index: i }); evs.push({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }); return sse(evs); };
const sysOf = (b) => (Array.isArray(b.system) ? b.system.map((x) => x.text).join('\n') : String(b.system || ''));

async function run(body, script) {
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (!/api\.anthropic\.com/.test(u)) return new Response('{}', { status: 404 });
    calls.push({ url: u, body: JSON.parse(init.body) });
    return script[Math.min(i++, script.length - 1)]();
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token('omran'), provider: 'claude', tz: 'Asia/Dubai' }, body) };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  return calls;
}
const ask = (t) => [{ role: 'user', content: t }];

test('٠. (قبل أيّ دور يملأ ذاكرة السجلّ المؤقّتة) سجلّ المحادثات المعمّمة: لكلود رأس يطلب التحقّق بلا «اعتمدها كما هي»، ولغيره الرأس القديم؛ المحتوى نفسه', async () => {
  db.set('db/owner-gen.json', { items: [{ id: 'g1', text: 'المالك: سؤال قديم\n\nردّ مزوّد آخر قديم', at: 1, by: 'groq' }] });
  const cl = await PS.systemBlocks(true, 'claude', { messages: ask('سؤال جديد'), lastUserText: 'سؤال جديد' });
  const gq = await PS.systemBlocks(true, 'groq', { messages: ask('سؤال جديد'), lastUserText: 'سؤال جديد' });
  assert.ok(cl.includes(PS.GEN_HEAD_CLAUDE) && !cl.includes('اعتمدها كما هي') && cl.includes('ردّ مزوّد آخر قديم'));
  assert.ok(PS.GEN_HEAD_CLAUDE.includes('سجلّ سابق للاطّلاع لا طلبات قائمة') && PS.GEN_HEAD_CLAUDE.includes('تتحقّق'));
  assert.ok(gq.includes(PS.GEN_HEAD) && gq.includes('ردّ مزوّد آخر قديم'), 'غير كلود كما كان');
});

test('١. السؤال العاديّ لكلّ موديلات كلود بلا low (جهد Anthropic الافتراضيّ)، والتفكير ظاهر؛ والمجاملة فوريّة؛ والمنتقي يغلب', async () => {
  for (const model of ['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'claude-haiku-5-5']) {
    const [c] = await run({ model, messages: ask('ليش أسعار الذهب ترتفع لما الدولار يضعف؟') }, [() => text('لأنّ…')]);
    assert.equal(c.body.model, model);
    assert.equal(c.body.output_config, undefined, 'لا low · ' + model);
    assert.deepEqual(c.body.thinking, { type: 'adaptive', display: 'summarized' }, 'التفكير ظاهر · ' + model);
  }
  let [c] = await run({ model: 'claude-opus-5-5', messages: ask('السلام') }, [() => text('وعليكم السلام')]);
  assert.deepEqual(c.body.output_config, { effort: 'low' }, 'المجاملة فوريّة كما كانت');
  [c] = await run({ model: 'claude-opus-5-5', effort: 'medium', messages: ask('ليش السماء زرقاء؟') }, [() => text('لأنّ…')]);
  assert.deepEqual(c.body.output_config, { effort: 'medium' }, 'اختيار المنتقي يغلب');
});

test('٢. نظام كلود: البحث يكمّل علمه بلا سقف البحثين — وبقيّة المزوّدين كما كانوا حرفيًّا', async () => {
  const [c] = await run({ model: 'claude-opus-5-5', messages: ask('ليش أسعار الذهب ترتفع؟') }, [() => text('…')]);
  const sys = sysOf(c.body);
  assert.ok(!sys.includes('بحثان'), 'لا «بحثان» في نظام كلود');
  assert.ok(sys.includes(CLAUDE_SEARCH_NOTE) && sys.includes('(متى وكيف: في وصف الأداة؛ بقدر ما يحتاج السؤال)'));
  const src = 'web_search (متى وكيف: في وصف الأداة؛ بحثان كحد أقصى في الرد) … تعديل نصّ المستخدم. بحثان كحدّ أقصى في الردّ.';
  for (const p of ['gemini', 'openai', 'groq', 'openrouter', 'deepseek']) assert.equal(ownerIdentity(src, p, 'm'), src, 'كما كان · ' + p);
  assert.equal(searchCap(true, 'claude'), 6);
  assert.equal(searchCap(true, 'groq'), 2, 'غير كلود بحثان');
  assert.equal(searchCap(false, 'claude'), 2, 'غير المالك بحثان');
});

test('٣. سقف البحث لكلود المالك ٦ في الردّ — السابع وحده يُرفض', async () => {
  const calls = await run({ model: 'claude-opus-5-5', messages: ask('وش آخر أخبار سعر الذهب؟') }, [() => searches(7), () => text('الجواب')]);
  assert.equal(calls.length, 2);
  const tr = calls[1].body.messages[calls[1].body.messages.length - 1].content.filter((b) => b && b.type === 'tool_result');
  assert.equal(tr.length, 7);
  const capped = tr.filter((b) => /بلغتَ سقف البحث/.test(JSON.stringify(b.content)));
  assert.equal(capped.length, 1, 'السابع وحده');
  assert.ok(/6 بحوث/.test(JSON.stringify(capped[0].content)));
});
