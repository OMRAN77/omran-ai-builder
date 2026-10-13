// tests/chat-thinking-replay.test.cjs — v-claude-code-level D1 (المالك ١٠ أكتوبر: «ما يفكّر… Grok أقوى»):
// كتل التفكير بين جولات الأدوات في المحادثة — منقولة من agent.js (v-agent-deep، اختبارا agent-deep ٤ و٦). كانت تُحذف قبل
// الجولة التالية فتبدأ كلّ أداة بلا تفكير ما قبلها. الآن تعود للمالك كما وصلت وبترتيبها وتوقيعها على أنثروبيك المباشر (غير المالك
// كما كان بايتًا بايتًا: الإعادة تُفوتَر مدخلًا، فتعميمها إنفاق ينتظر موافقة المالك)، وتُنزع عند
// كلّ تعديل للتاريخ أو تبديل مسار/موديل، و400 التوقيع = نزع وإعادة واحدة. يشغّل chat.js الحقيقيّ بـfetch مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'chat-thinking-replay-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS', 'CHAT_PROMPT_CACHE']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
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
  takeMeter: async () => true, giveMeter: async () => {},
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
let readBody = 'FILE x.js\n1| //';
require(rp('api/_lib/github-read.js')).readGithub = async () => readBody;
const logged = [];
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async (scope) => { logged.push(scope); }; le.logError = () => {};
const tierLib = require(rp('api/_lib/tier.js'));
const chat = require(rp('api/_lib/chat.js'));
const OL = require(rp('api/_lib/owner-loop.js'));
const { CARRY_NOTE } = require(rp('api/_lib/owner-carry.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sseResp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = (model) => ({ type: 'message_start', message: { model: model || 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 0 } } });
// جولة: تفكير ملخّص (نصّه بالدلتا وتوقيعه بـsignature_delta) ثمّ تفكير محجوب ثمّ أداة — كما يبثّها أنثروبيك.
const thinkTool = (sig, tool, input, opts) => {
  const o = opts || {};
  const evs = [start(o.model),
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: o.summary || '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: sig } },
    { type: 'content_block_stop', index: 0 }];
  let i = 1;
  if (o.redacted) { evs.push({ type: 'content_block_start', index: i, content_block: { type: 'redacted_thinking', data: o.redacted } }, { type: 'content_block_stop', index: i }); i++; }
  evs.push({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: o.id || ('tu_' + sig), name: tool, input: {} } },
    { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: i },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } });
  return sseResp(evs);
};
const thinkText = (sig, text) => sseResp([start(),
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: sig } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }]);
const text = (t, model) => sseResp([start(model), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }]);
const err = (status, message) => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }), { status, headers: { 'Content-Type': 'application/json' } });
const SIG400 = 'messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.';
const isAnth = (u) => /api\.anthropic\.com/.test(u);
const isOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);
const isUp = (u) => isAnth(u) || isOR(u);
const thinkBlocks = (body) => (body.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b && (b.type === 'thinking' || b.type === 'redacted_thinking'));
const blocksOf = (body, type) => (body.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b && b.type === type);

async function run(user, body, route) {
  usageUser = user; logged.length = 0;
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    return route(String(url), b, calls.filter((c) => isUp(c.url)).length);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls: calls.filter((c) => isUp(c.url)), events, text: events.map((e) => e.delta || '').join('') };
}
const Q = [{ role: 'user', content: 'وين الخلل في دالّة foo في مستودعي؟' }];
// غير المالك الذي يصل كلود فعلًا: مشترك Max — دور الكود على Sonnet 5 المباشر، والدردشة على Haiku 4.5 (tier.js PLAN_ROUTING).
async function asMax(fn) {
  const real = tierLib.resolveTier;
  tierLib.resolveTier = async () => ({ tier: 'sub', plan: 'max', cap: 250, subscriber: true });
  try { return await fn(); } finally { tierLib.resolveTier = real; }
}
const READ = { url: 'OMRAN77/omran-ai-builder', query: 'foo' };

test('١. الجولة الثانية تعيد التفكير كما وصل: الملخّص وتوقيعه SIG-1 والمحجوب وبترتيبها، والنظام والأدوات ثابتان والعرض ملخّص', async () => {
  const r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: Q }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
    : n === 1 ? thinkTool('SIG-1', 'read_github', READ, { summary: '**أبحث عن foo**\nثمّ أقرأ الملفّ', redacted: 'RED-1', id: 'tu1' }) : text('الخلل في x.js:1')));
  assert.equal(r.calls.length, 2);
  const msgs = r.calls[1].body.messages;
  const asst = msgs[msgs.length - 2];
  assert.equal(asst.role, 'assistant');
  assert.deepEqual(asst.content.map((x) => x.type), ['thinking', 'redacted_thinking', 'tool_use'], 'الترتيب كما وصل');
  assert.deepEqual(asst.content[0], { type: 'thinking', thinking: '**أبحث عن foo**\nثمّ أقرأ الملفّ', signature: 'SIG-1' }, 'بلا تعديل — نصّه وتوقيعه');
  assert.deepEqual(asst.content[1], { type: 'redacted_thinking', data: 'RED-1' });
  assert.equal(msgs[msgs.length - 1].content[0].tool_use_id, 'tu1');
  for (const c of r.calls) assert.deepEqual(c.body.thinking, { type: 'adaptive', display: 'summarized' }, 'العرض الملخّص للمالك على Opus 5.5');
  assert.equal(JSON.stringify(r.calls[0].body.system), JSON.stringify(r.calls[1].body.system), 'system ثابت بين الجولتين');
  assert.equal(JSON.stringify(r.calls[0].body.tools), JSON.stringify(r.calls[1].body.tools), 'tools ثابتة بين الجولتين');
  assert.ok(r.events.some((e) => e.status === '↳ 💭 أبحث عن foo'), 'ملخّص التفكير سطر ↳ في سجلّ الردّ');
  const talk = r.events.find((e) => e.think && e.think.s);
  assert.ok(talk && talk.think.s.includes('أبحث عن foo') && talk.think.s.includes('ثمّ أقرأ الملفّ'), 'الملخّص كاملًا يبقى في الفقاعة');
  assert.equal(r.text, 'الخلل في x.js:1');
});

test('٢. المالك وحده: مشترك Max في دور كود (Sonnet 5 المباشر) لا يعيد التفكير — جولته الثانية كما كانت، بلا حقل thinking ولا سطر ↳ 💭', async () => {
  await asMax(async () => {
    const r = await run('maxuser', { provider: 'claude', messages: [{ role: 'user', content: 'اكتب كود بايثون يحسب المتوسّط، وابحث عن تطبيق عمران' }] }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
      : n === 1 ? thinkTool('SIG-V', 'web_search', { query: 'omran app' }, { model: 'claude-sonnet-5', summary: 'ملخّص' }) : text('أقدر أساعدك.', 'claude-sonnet-5')));
    assert.equal(r.calls.length, 2);
    assert.ok(r.calls.every((c) => isAnth(c.url) && c.body.model === 'claude-sonnet-5'));
    assert.deepEqual(thinkBlocks(r.calls[1].body), [], 'غير المالك: لا كتلة تفكير معادة (لا إدخال مُفوتَر جديد)');
    const msgs = r.calls[1].body.messages;
    assert.deepEqual(msgs[msgs.length - 2].content.map((x) => x.type), ['tool_use'], 'ردّ الجولة كما كان قبل D1: الأداة وحدها');
    assert.ok(r.calls.every((c) => c.body.thinking === undefined), 'غير المالك: لا حقل thinking');
    assert.ok(!r.events.some((e) => /^↳ 💭/.test(e.status || '')) && !r.events.some((e) => e.think), 'غير المالك بلا تفكير ظاهر');
  });
});

test('٣. التبديل إلى الوسيط (401 على المفتاح المباشر في الجولة الثانية) ← تُنزع كتل التفكير، ونداء الأداة ونتيجته باقيان', async () => {
  const r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: Q }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
    : n === 1 ? thinkTool('SIG-1', 'read_github', READ, { id: 'tu1', redacted: 'RED-1' })
      : isAnth(u) ? err(401, 'invalid x-api-key') : text('أكملت عبر الوسيط.', 'anthropic/claude-opus-5.5')));
  const or = r.calls.find((c) => isOR(c.url));
  assert.ok(or, 'نداء الوسيط حصل');
  assert.equal(or.body.model, 'anthropic/claude-opus-5.5');
  assert.equal(thinkBlocks(r.calls[1].body).length, 2, 'المباشر حملها');
  assert.deepEqual(thinkBlocks(or.body), [], 'توقيعات المباشر لا تصل الوسيط');
  assert.equal(or.body.thinking, undefined, 'لا عرض ملخّص على الوسيط');
  assert.deepEqual(blocksOf(or.body, 'tool_use').map((x) => x.id), ['tu1']);
  assert.deepEqual(blocksOf(or.body, 'tool_result').map((x) => x.tool_use_id), ['tu1']);
  assert.equal(r.text, 'أكملت عبر الوسيط.');
});

test('٤. تبديل الموديل (المختار رُفض «does not have access» في الجولة الثانية ← Haiku) ← تُنزع كتل التفكير', async () => {
  OL.__deadPicks.clear(); db.clear();
  try {
    const r = await run('omran', { provider: 'claude', model: 'claude-fable-5-1', messages: Q }, (u, b, n) => (!isAnth(u) ? new Response('{}', { status: 404 })
      : n === 1 ? thinkTool('SIG-F', 'read_github', READ, { id: 'tu1', model: 'claude-fable-5-1' })
        : b.model === 'claude-fable-5-1' ? err(400, 'This organization does not have access to model claude-fable-5-1.') : text('جواب Haiku', 'claude-haiku-4-5')));
    const haiku = r.calls.filter((c) => c.body.model === 'claude-haiku-4-5');
    assert.equal(haiku.length, 1);
    assert.deepEqual(thinkBlocks(r.calls[1].body).map((x) => x.signature), ['SIG-F'], 'Fable نفسه حملها في جولته الثانية');
    assert.deepEqual(thinkBlocks(haiku[0].body), [], 'كتلة Fable لا تُعاد على موديل آخر');
    assert.equal(haiku[0].body.thinking, undefined);
    assert.deepEqual(blocksOf(haiku[0].body, 'tool_use').map((x) => x.id), ['tu1']);
    assert.equal(r.text, 'جواب Haiku');
  } finally { OL.__deadPicks.clear(); db.clear(); }
});

test('٥. تجاوز نافذة السياق في الخطوة ٣ (قصّ C7) ← الإعادة بلا أيّ كتلة تفكير، والنتائج الأقدم مقصوصة', { timeout: 20000 }, async () => {
  readBody = 'FILE big.js\n' + 'س'.repeat(5000);
  try {
    let overflowed = false;
    const r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: Q }, (u, b, n) => {
      if (!isAnth(u)) return new Response('{}', { status: 404 });
      if (n <= 2) return thinkTool('SIG-' + n, 'read_github', { url: 'OMRAN77/omran-ai-builder', path: 'f' + n + '.js' }, { id: 'tu' + n });
      if (!overflowed) { overflowed = true; return err(400, 'prompt is too long: 250000 tokens > 200000 maximum'); }
      return text('قرأت الملفّين.');
    });
    assert.equal(r.calls.length, 4);
    assert.deepEqual(thinkBlocks(r.calls[2].body).map((x) => x.signature), ['SIG-1', 'SIG-2'], 'قبل التجاوز: الجولتان بتفكيرهما');
    assert.deepEqual(thinkBlocks(r.calls[3].body), [], 'تاريخ عُدّل = لا كتلة تفكير بعده');
    const results = blocksOf(r.calls[3].body, 'tool_result');
    assert.ok(/قُصّ لتجاوز نافذة السياق/.test(results[0].content) && results[1].content.length > 5000);
    assert.equal(r.text, 'قرأت الملفّين.');
  } finally { readBody = 'FILE x.js\n1| //'; }
});

test('٦. owner-carry: خطّة بلا تنفيذ تُعاد للحلقة ومعها تفكير جولتها كما وصل', async () => {
  const PLAN = 'أحدّد العنصر في الكود من نص اللقطة قبل أي حذف.أقرأ العلامات والأنماط اللي ترسم هالبلوك قبل أي حذف. أتتبع كل مراجعها قبل الحذف.';
  const r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'احذف قائمة المشاريع من الواجهة' }] },
    (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 }) : n === 1 ? thinkText('SIG-C', PLAN) : text('حذفتها.')));
  assert.equal(r.calls.length, 2);
  const msgs = r.calls[1].body.messages;
  assert.equal(msgs[msgs.length - 1].content[0].text, CARRY_NOTE);
  assert.deepEqual(msgs[msgs.length - 2].content, [{ type: 'thinking', thinking: '', signature: 'SIG-C' }, { type: 'text', text: PLAN }], 'الجولة كما وصلت');
});

test('٧. 400 يذكر التوقيع ← تُنزع كلّ كتل التفكير وإعادة واحدة، والتشغيل يكمل؛ ولا دوران إن رُفضت الإعادة', async () => {
  let r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: Q }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
    : n === 1 ? thinkTool('SIG-1', 'read_github', READ, { id: 'tu1', redacted: 'RED-1' }) : n === 2 ? err(400, SIG400) : text('كمّلت')));
  assert.equal(r.calls.length, 3);
  assert.equal(thinkBlocks(r.calls[1].body).length, 2, 'الطلب الأوّل يحملها');
  assert.deepEqual(thinkBlocks(r.calls[2].body), [], 'الإعادة بلاها');
  assert.deepEqual(blocksOf(r.calls[2].body, 'tool_use').map((x) => x.id), ['tu1'], 'نداء الأداة ونتيجته باقيان');
  assert.ok(isAnth(r.calls[2].url) && r.calls[2].body.model === 'claude-opus-5-5', 'المسار والموديل نفسهما');
  assert.ok(logged.includes('chat/thinking-replay'));
  assert.ok(r.events.some((e) => e.status === '↳ ⚠️ رُفض تفكير الجولات السابقة (400) — نُزع وأُعيد الطلب بدونه'), 'السبب سطر في سجلّ الردّ لا صمت');
  assert.equal(r.text, 'كمّلت');
  // الإعادة نفسها رُفضت: لا إعادة ثالثة على المباشر — السلسلة القائمة (الوسيط) تكمل
  r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: Q }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
    : n === 1 ? thinkTool('SIG-1', 'read_github', READ, { id: 'tu1' }) : isAnth(u) ? err(400, SIG400) : text('من الوسيط')));
  assert.equal(r.calls.filter((c) => isAnth(c.url)).length, 3, 'الأصل + الجولة الثانية + إعادة واحدة');
  assert.deepEqual(thinkBlocks(r.calls.find((c) => isOR(c.url)).body), []);
  assert.equal(r.text, 'من الوسيط');
});

test('٨. Grok (الوسيط): كتل تفكيره لا تُعاد، ولا حقل عرض في طلبه', async () => {
  const r = await run('omran', { provider: 'openrouter', model: 'x-ai/grok-4.6', messages: Q }, (u, b, n) => (!isOR(u) ? new Response('{}', { status: 404 })
    : n === 1 ? thinkTool('GROK-SIG', 'read_github', READ, { id: 'tu1', model: 'x-ai/grok-4.6', summary: 'reasoning' }) : text('جواب Grok', 'x-ai/grok-4.6')));
  assert.equal(r.calls.length, 2);
  assert.ok(r.calls.every((c) => isOR(c.url) && c.body.model === 'x-ai/grok-4.6'));
  assert.deepEqual(thinkBlocks(r.calls[1].body), []);
  assert.deepEqual(blocksOf(r.calls[1].body, 'tool_use').map((x) => x.id), ['tu1']);
  assert.ok(r.calls.every((c) => c.body.thinking && c.body.thinking.type === 'adaptive' && !c.body.thinking.display), 'الوسيط: تكيّفيّ بلا عرض أنثروبيك');
  assert.ok(r.events.some((e) => e.status === '↳ 💭 reasoning'), 'ما يصل من تفكير المزوّد نفسه يظهر للمالك سطرًا (v-owner-think-all)');
  assert.ok(r.events.some((e) => e.think && e.think.s === 'reasoning'), 'الملخّص يبقى في الفقاعة');
});

test('٩. Haiku 4.5 لا يصله adaptive ولا effort أبدًا (المالك سؤالًا وتحيّةً، واختيارًا صريحًا، وغير المالك)، ولا عرض في المجاملة الفوريّة', async () => {
  // v-owner-claude-all: المالك بلا اختيار صار Opus 5.5 — Haiku 4.5 للمالك اختيارًا صريحًا (سؤالًا وتحيّةً وبجهد مختار يُتجاهَل)
  const cases = [['omran', { model: 'claude-haiku-4-5', effort: 'max' }, Q], ['omran', { model: 'claude-haiku-4-5' }, [{ role: 'user', content: 'السلام' }]], ['omran', { model: 'claude-haiku-4-5' }, Q], ['maxuser', {}, [{ role: 'user', content: 'وش أفضل وقت للمشي؟' }]]];
  for (const [user, extra, messages] of cases) {
    const r = await (user === 'maxuser' ? asMax : (f) => f())(() => run(user, Object.assign({ provider: 'claude', messages }, extra), (u, b, n) => (!isAnth(u) ? new Response('{}', { status: 404 })
      : n === 1 ? thinkTool('SIG-H', user === 'omran' ? 'read_github' : 'web_search', user === 'omran' ? READ : { query: 'omran app' }, { id: 'tu1', model: 'claude-haiku-4-5' }) : text('تم', 'claude-haiku-4-5'))));
    assert.ok(r.calls.length >= 1, user);
    for (const c of r.calls) {
      assert.equal(c.body.model, 'claude-haiku-4-5');
      assert.equal(c.body.thinking, undefined, user + ': لا thinking');
      assert.equal(c.body.output_config, undefined, user + ': لا effort');
    }
  }
  const q = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'السلام' }] }, () => text('وعليكم السلام'));
  assert.equal(q.calls[0].body.thinking, undefined, 'المجاملة الفوريّة (v-owner-auto) بلا عرض');
  assert.deepEqual(q.calls[0].body.output_config, { effort: 'low' });
});

test('١٠. الوحدة: 400 العرض بلا كتل ← يُطفأ العرض وإعادة واحدة؛ 400 آخر يمرّ بنصّه؛ markLastForCache لا يعلّم كتلة تفكير', async () => {
  const t = OL.thinkState(true, true);
  const convo = [{ role: 'user', content: 'x' }];
  const b = OL.think({ model: 'claude-sonnet-5', messages: convo, system: 's', tools: [] }, t, convo, 'a');
  assert.deepEqual(b.thinking, { type: 'adaptive', display: 'summarized' });
  let again = 0; const said = [];
  await OL.think400(err(400, 'thinking.display: Extra inputs are not permitted'), t, convo, async () => { again++; return text('ok'); }, (e) => said.push(e.status));
  assert.equal(again, 1); assert.equal(t.noDisplay, true);
  assert.deepEqual(said, ['↳ ⚠️ ملخّص التفكير غير متاح هنا (400) — يكمل بدونه'], 'إطفاء العرض سطر للمالك');
  assert.equal(OL.think({ model: 'claude-sonnet-5', messages: convo }, t, convo, 'a').thinking, undefined, 'العرض لا يعود في الدور');
  const other = await OL.think400(err(400, 'prompt is too long'), t, convo, async () => { again++; return null; });
  assert.equal(again, 1); assert.equal(await other.text(), JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long' } }));
  const { markLastForCache } = chat.__cache;
  const th = [{ role: 'user', content: 'q' }, { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'S' }] }];
  assert.equal(markLastForCache(th), th, 'كتلة التفكير تبقى بايتًا بايتًا بلا cache_control');
  assert.equal(OL.thinkState(false, true).show, false, 'العرض للمالك وحده');
});

test('١١. إكمال C2 (القطع لطوله): الجولة المقطوعة تعود بتفكيرها الموقَّع ثمّ نصّها، ثمّ تنبيه الإكمال، والنصّ يكتمل', async () => {
  const cut = (sig, t) => sseResp([start(),
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: sig } }, { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 5 } }]);
  const r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: Q }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 })
    : n === 1 ? cut('SIG-M', 'abc') : text('def')));
  assert.equal(r.calls.length, 2);
  const msgs = r.calls[1].body.messages;
  assert.deepEqual(msgs[msgs.length - 2], { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'SIG-M' }, { type: 'text', text: 'abc' }] });
  assert.equal(msgs[msgs.length - 1].content[0].text, OL.CONTINUE_NOTE);
  assert.equal(r.text, 'abcdef');
});

test('١٢. نصّ فراغ بين كتلتي تفكير (يُسقطه المرشّح) ← ما بعده من تفكير الرسالة لا يُعاد، وما قبله يبقى؛ وasSent بالقاعدة نفسها', async () => {
  const r = await run('omran', { provider: 'claude', model: 'claude-opus-5-5', messages: Q }, (u, b, n) => (!isUp(u) ? new Response('{}', { status: 404 }) : n === 1 ? sseResp([start(),
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG-A' } }, { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '\n\n' } }, { type: 'content_block_stop', index: 1 },
    { type: 'content_block_start', index: 2, content_block: { type: 'thinking', thinking: '', signature: '' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'signature_delta', signature: 'SIG-B' } }, { type: 'content_block_stop', index: 2 },
    { type: 'content_block_start', index: 3, content_block: { type: 'tool_use', id: 'tu1', name: 'read_github', input: {} } },
    { type: 'content_block_delta', index: 3, delta: { type: 'input_json_delta', partial_json: JSON.stringify(READ) } }, { type: 'content_block_stop', index: 3 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } }]) : text('ok')));
  assert.equal(r.calls.length, 2);
  const msgs = r.calls[1].body.messages;
  assert.deepEqual(msgs[msgs.length - 2].content.map((x) => x.type + ':' + (x.signature || x.id || '')), ['thinking:SIG-A', 'tool_use:tu1'], 'SIG-B تغيّر ما قبله فلا يُعاد');
  const t = OL.thinkState(true, false); t.direct = true;
  const th = (sig) => ({ type: 'thinking', thinking: '', signature: sig });
  assert.deepEqual(OL.asSent(t, [th('A'), { type: 'tool_use', id: 'x', inputJson: '{' }, th('B'), { type: 'text', text: 'نصّ' }], null),
    [{ type: 'thinking', thinking: '', signature: 'A' }, { type: 'text', text: 'نصّ' }], 'أداة مقطوعة أُسقطت = التفكير بعدها لا يُعاد');
  assert.deepEqual(OL.asSent(t, [{ type: 'text', text: ' ' }, th('A'), { type: 'text', text: 'نصّ' }], 'plain'), 'plain', 'فراغ قبل أوّل تفكير = لا تفكير يُعاد');
});

test('١٣. 400 عن حقول الجهد/التفكير بلا عرض (المجاملة الفوريّة) يمرّ لمعالجه ولا يُنزع التفكير؛ وغير المالك لا يمرّ بـthink400 أصلًا', async () => {
  const blocksConvo = () => [{ role: 'user', content: 'q' }, { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'S' }, { type: 'tool_use', id: 't', name: 'x', input: {} }] }];
  const quick = OL.thinkState(true, false);
  let convo = blocksConvo(), again = 0;
  const up = await OL.think400(err(400, 'output_config.effort: thinking effort low is not supported for this request'), quick, convo, async () => { again++; return null; });
  assert.equal(again, 0, 'لا إعادة مهدرة'); assert.equal(up.status, 400);
  assert.ok(/output_config\.effort/.test(await up.text()), 'النصّ يصل معالج v-owner-auto كما هو');
  assert.equal(OL.hasThink(convo), true, 'تفكير الدور باقٍ');
  await OL.think400(err(400, SIG400), quick, convo, async () => { again++; return text('ok'); });
  assert.equal(again, 1); assert.equal(OL.hasThink(convo), false, 'رفض عن كتلة في الرسائل = نزع وإعادة');
  const guest = OL.thinkState(false, true); guest.direct = true;
  convo = blocksConvo();
  const raw = err(400, SIG400);
  assert.equal(await OL.think400(raw, guest, convo, async () => { again++; return null; }), raw, 'غير المالك: الاستجابة نفسها');
  assert.equal(again, 1); assert.equal(OL.hasThink(convo), true);
  assert.equal(OL.thinkOut(guest, { type: 'thinking', thinking: '', signature: 'S' }), null, 'غير المالك: لا إعادة');
});

test('١٤. كلام المزوّد مع نفسه للمالك على كل مزوّد وسيط غير كلود: تكيّفيّ بلا display، والملخّص في think.s، والتحيّة بلاه', async () => {
  for (const prov of ['openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'kimi']) {
    const r = await run('omran', { provider: prov, messages: Q }, (u, b, n) => (!isOR(u) ? new Response('{}', { status: 404 })
      : n === 1 ? thinkTool('S', 'read_github', READ, { id: 'tu1', model: b.model, summary: 'أراجع المسألة' }) : text('تم', b.model)));
    assert.ok(r.calls.length >= 1 && r.calls.every((c) => isOR(c.url) && c.body.thinking && c.body.thinking.type === 'adaptive' && !c.body.thinking.display), prov + ' ' + JSON.stringify(r.calls[0] && r.calls[0].body.thinking));
    assert.ok(r.events.some((e) => e.think && e.think.s.includes('أراجع المسألة')), prov);
    assert.equal(r.text, 'تم');
  }
  const grok = await run('omran', { provider: 'openrouter', model: 'x-ai/grok-4.6', messages: Q }, (u, b, n) => (!isOR(u) ? new Response('{}', { status: 404 })
    : n === 1 ? thinkTool('S', 'read_github', READ, { id: 'tu1', model: 'x-ai/grok-4.6', summary: 'أراجع المسألة' }) : text('تم', 'x-ai/grok-4.6')));
  assert.ok(grok.calls.every((c) => c.body.model === 'x-ai/grok-4.6' && c.body.thinking.type === 'adaptive' && !c.body.thinking.display));
  const hi = await run('omran', { provider: 'deepseek', messages: [{ role: 'user', content: 'السلام' }] }, (u) => (!isOR(u) ? new Response('{}', { status: 404 }) : text('وعليكم')));
  assert.deepEqual(hi.calls[0].body.thinking, { type: 'disabled' }, 'التحيّة فوريّة');
  assert.ok(!hi.events.some((e) => e.think));
  const coHi = await run('omran', { provider: 'cohere', messages: [{ role: 'user', content: 'السلام' }] }, (u) => (!isOR(u) ? new Response('{}', { status: 404 }) : text('وعليكم')));
  assert.equal(coHi.calls[0].body.thinking, undefined, 'Cohere في التحيّة بلا حقل إطفاء ولا تكيّفيّ');
  assert.equal(coHi.calls[0].body.reasoning, undefined);
});

test('١٥. وسيط يرفض thinking التكيّفيّ ← إعادة واحدة بلا الحقل والجواب يصل، بلا سطر إطفاء العرض', async () => {
  const r = await run('omran', { provider: 'mistral', messages: Q }, (u, b) => {
    if (!isOR(u)) return new Response('{}', { status: 404 });
    if (b.thinking) return err(400, 'thinking is not supported for this model');
    return text('تم');
  });
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[0].body.thinking.type, 'adaptive');
  assert.equal(r.calls[1].body.thinking, undefined);
  assert.equal(r.text, 'تم');
  assert.ok(!r.events.some((e) => /ملخّص التفكير غير متاح/.test(e.status || '')));
});
