// tests/chat-owner-errors.test.cjs — v-claude-code-level C3–C8 (المالك ١٠ أكتوبر: «ما يعطيني شي»):
// أعطال حلقة المالك كانت تُبلع أو تنتهي بلا سبب. هنا بالمعالج الحقيقيّ chat.js وfetch مزيّف، وcallChatWithTools الحقيقيّ (app-18) في vm:
//   C3 خطأ بعد التمهيد: الوسيط يكمل المحادثة نفسها بفاصل، وبلا وسيط يظهر السبب تحت التمهيد (كان يُبلع).
//   C4 529 على المفتاح المباشر: إعادة النداء نفسه بانتظار يحترم retry-after قبل أيّ سلسلة.
//   C5 مزوّد صامت: مهلة حتّى الترويسة لكلّ نداء ثمّ خمول، تقطع النداء، الوسيط مرّة، ثمّ سبب «ما ردّ خلال N ث»؛ والنبض يتوقّف؛
//      ولا مهلة تتجاوز حدّ الدالّة؛ وردّ كامل (stop_reason وصل) بقي مقبسه مفتوحًا ليس صمتًا.
//   C6 الرفض لا يُعاد للحلقة ويظهر بفئته؛ والردّ الفارغ بسببه.
//   C7 تجاوز السياق بعد الخطوة الأولى: نتائج الأدوات الأقدم تُقصّ والأخيرة كاملة.
//   C8 موديل «does not have access» يُذكَر فلا يُدفع نداء فاشل أوّلًا في الرسالة التالية.
// وغير المالك كما كان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'chat-owner-errors-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const RUN_CAP_MS = 15000; // دور علّق (نبض حيّ بلا نهاية) يفشل بسبب ظاهر بدل أن يبقي العمليّة حيّة
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
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
let readBody = 'FILE js/app-05-ui.js\n1| // محتوى';
require(rp('api/_lib/github-read.js')).readGithub = async () => readBody;
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const { CARRY_NOTE } = require(rp('api/_lib/owner-carry.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const enc = (evs) => evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join('');
const sseResp = (evs) => new Response(enc(evs), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'claude-x', usage: { input_tokens: 10, output_tokens: 0 } } });
const textBlock = (i, text) => [{ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: i }];
const toolEvs = (name, input, pre) => [start()].concat(pre ? textBlock(0, pre) : [], [
  { type: 'content_block_start', index: pre ? 1 : 0, content_block: { type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input: {} } },
  { type: 'content_block_delta', index: pre ? 1 : 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: pre ? 1 : 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }]);
const T = {
  text: (text, reason, details) => sseResp([start()].concat(textBlock(0, text), [{ type: 'message_delta', delta: Object.assign({ stop_reason: reason || 'end_turn' }, details ? { stop_details: details } : {}), usage: { output_tokens: 5 } }])),
  empty: () => sseResp([start(), { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } }]),
  tool: (name, input, pre) => sseResp(toolEvs(name, input, pre)),
  err: (status, type, message, headers) => new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: headers || {} }),
  orErr: (status, message) => new Response(JSON.stringify({ error: { message, code: status } }), { status }),
  // بثّ يقبل (٢٠٠) ثمّ يسكت — بعد أحداث اختياريّة
  stall: (evs) => new Response(new ReadableStream({ start(c) { if (evs) c.enqueue(new TextEncoder().encode(enc(evs))); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
};
const isAnth = (u) => /api\.anthropic\.com/.test(u);
const isOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);
const READ = { url: 'OMRAN77/omran-ai-builder', path: 'js/app-05-ui.js' };
const Q = [{ role: 'user', content: 'اقرأ ملف js/app-05-ui.js في مستودعي وقل لي وش فيه' }];

async function run(user, body, route) {
  usageUser = user;
  const calls = [], out = [], intervals = new Set();
  const save = global.fetch, si = global.setInterval, ci = global.clearInterval;
  global.setInterval = (...a) => { const h = si(...a); intervals.add(h); return h; };
  global.clearInterval = (h) => { intervals.delete(h); return ci(h); };
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b, signal: init && init.signal });
    return route(String(url), b, calls.filter((c) => isAnth(c.url)).length, init);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  let ended = false;
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() { ended = true; }, flushHeaders() {} };
  const t0 = Date.now();
  let hang = null, live = 0;
  try {
    await Promise.race([chat(req, res), new Promise((_, rej) => { hang = setTimeout(() => rej(new Error('chat() علّق أكثر من ' + RUN_CAP_MS + ' م.ث')), RUN_CAP_MS); })]);
  } finally {
    clearTimeout(hang); global.fetch = save; global.setInterval = si; global.clearInterval = ci;
    live = intervals.size; intervals.forEach((h) => ci(h));
  }
  const raw = out.join('');
  const events = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, raw, ended, liveIntervals: live, ms: Date.now() - t0, text: events.map((e) => e.delta || '').join('') };
}
const app18 = fs.readFileSync(path.join(root, 'js/app-18-chat-tools.js'), 'utf8');
const app18Core = app18.slice(0, app18.indexOf('// v478:'));
async function client(raw) {
  const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => '' }, fetch: async () => new Response(raw, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
  vm.runInNewContext(app18Core, ctx);
  try { return { reply: (await ctx.window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'claude')).reply }; }
  catch (e) { return { error: e.message, ownerStop: !!e.ownerStop }; }
}
const withoutOR = async (fn) => { const k = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY; try { return await fn(); } finally { process.env.OPENROUTER_API_KEY = k; } };
const busy = () => T.err(529, 'overloaded_error', 'Overloaded', { 'retry-after': '0' });

test('١. C3+C4: تمهيد ثمّ 529 في الخطوة ٢ ← إعادتان على المفتاح المباشر ثمّ الوسيط يكمل المحادثة نفسها بفاصل', { timeout: 20000 }, async () => {
  const r = await run('omran', { provider: 'claude', messages: Q }, (u, b, n) => (isAnth(u) ? (n === 1 ? T.tool('read_github', READ, 'خلني أقرأ الملف أوّلًا.') : busy())
    : isOR(u) ? T.text('من الوسيط: الملفّ فيه دوال الواجهة.') : new Response('{}', { status: 404 })));
  assert.equal(r.calls.filter((c) => isAnth(c.url)).length, 4, 'الخطوة ١ + النداء وإعادتان');
  const or = r.calls.filter((c) => isOR(c.url));
  assert.equal(or.length, 1, 'الوسيط مرّة');
  assert.ok(JSON.stringify(or[0].body.messages).includes('tool_result'), 'المحادثة نفسها بنتيجة القراءة');
  assert.equal(r.text, 'خلني أقرأ الملف أوّلًا.\n\nمن الوسيط: الملفّ فيه دوال الواجهة.');
  assert.ok(r.events.some((e) => /المزوّد مشغول \(529\)/.test(e.status || '')), 'سطر الإعادة');
  assert.ok(r.events.some((e) => /^⚠️ Anthropic · .+ · 529 — أكمل عبر الوسيط بالموديل نفسه\.$/.test(e.status || '')), 'التبديل بعد التمهيد معلَن كتبديل الصمت');
});

test('٢. C3: تمهيد ثمّ 529 بلا وسيط ← السبب تحت التمهيد عند المالك (كان يُبلع)', { timeout: 20000 }, async () => {
  const r = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u, b, n) => (isAnth(u) ? (n === 1 ? T.tool('read_github', READ, 'خلني أقرأ الملف أوّلًا.') : busy()) : new Response('{}', { status: 404 }))));
  const stop = r.events.find((e) => e.ownerStop);
  assert.ok(stop && stop.error === 'ما قدرت أردّ الحين — خطأ 529: Overloaded' /* v-why: سبب المزوّد بعد الرقم */, JSON.stringify(stop));
  assert.equal((await client(r.raw)).reply, 'خلني أقرأ الملف أوّلًا.\n\n⚠️ ما قدرت أردّ الحين — خطأ 529: Overloaded');
});

test('٣. C4: 529 ثمّ نجاح ← الموديل نفسه بلا وسيط؛ وretry-after أكبر من السقف (٨ ث) = لا انتظار بل السلسلة', { timeout: 20000 }, async () => {
  const r = await run('omran', { provider: 'claude', model: 'claude-sonnet-5', messages: Q }, (u, b, n) => (isAnth(u) ? (n === 1 ? busy() : T.text('جواب بعد الإعادة.')) : isOR(u) ? T.text('من الوسيط') : new Response('{}', { status: 404 })));
  const anth = r.calls.filter((c) => isAnth(c.url));
  assert.equal(anth.length, 2); assert.equal(anth[0].body.model, anth[1].body.model, 'الموديل نفسه');
  assert.equal(r.calls.filter((c) => isOR(c.url)).length, 0, 'لا وسيط');
  assert.equal(r.text, 'جواب بعد الإعادة.');
  const r2 = await run('omran', { provider: 'claude', messages: Q }, (u) => (isAnth(u) ? T.err(529, 'overloaded_error', 'Overloaded', { 'retry-after': '30' }) : isOR(u) ? T.text('من الوسيط') : new Response('{}', { status: 404 })));
  assert.equal(r2.calls.filter((c) => isAnth(c.url)).length, 1, 'لا إعادة فوق السقف');
  assert.ok(r2.ms < 5000, 'لا انتظار ٣٠ ث');
  assert.equal(r2.text, 'من الوسيط');
});

test('٤. C6: رفض المزوّد ← لا تنبيه «نفّذ الآن» على الجزء المرفوض، والسبب بفئته', { timeout: 20000 }, async () => {
  const r = await run('omran', { provider: 'claude', messages: [{ role: 'user', content: 'احذف قائمة المشاريع من الواجهة' }] },
    (u) => (isAnth(u) ? T.text('سأقرأ الملفّ ثمّ أحذف القائمة وأتتبّع مراجعها', 'refusal', { type: 'refusal', category: 'cyber' }) : new Response('{}', { status: 404 })));
  assert.equal(r.calls.filter((c) => isAnth(c.url)).length, 1, 'لا إعادة للحلقة');
  assert.ok(!r.calls.some((c) => JSON.stringify(c.body || {}).includes(CARRY_NOTE)));
  const stop = r.events.find((e) => e.ownerStop);
  assert.equal(stop && stop.error, 'رفض المزوّد الطلب (cyber)');
  assert.equal((await client(r.raw)).reply, 'سأقرأ الملفّ ثمّ أحذف القائمة وأتتبّع مراجعها\n\n⚠️ رفض المزوّد الطلب (cyber)');
});

test('٤-ب. v-refusal-why: رفض بفئة reasoning_extraction (لقطة المالك ١٢ أكتوبر، Fable 5.1) ← معناها بالعربيّة وشرح المزوّد إن أرسله، وبلا شرح الفئة ومعناها', { timeout: 20000 }, async () => {
  const ask = (details) => run('omran', { provider: 'claude', model: 'claude-fable-5-1', messages: [{ role: 'user', content: 'لا الكتابة الي فوق المحادثة فكر لمدة الوقت' }] },
    (u) => (isAnth(u) ? T.text('', 'refusal', details) : new Response('{}', { status: 404 })));
  const r = await ask({ type: 'refusal', category: 'reasoning_extraction', explanation: 'The request asks the model to reveal  its internal\nreasoning.' });
  assert.equal(r.calls.filter((c) => isAnth(c.url)).length, 2, 'إعادة واحدة على الموديل نفسه بلا عرض التفكير (v-refusal-retry) — ثمّ السبب، ولا وسيط');
  const stop = r.events.find((e) => e.ownerStop);
  assert.equal(stop && stop.error, 'رفض المزوّد الطلب (reasoning_extraction — فُهم السؤال طلبًا لكشف تفكيره الداخليّ — اسأل عن الجواب لا عمّا فكّر فيه) — The request asks the model to reveal its internal reasoning.');
  const c = await client(r.raw);
  assert.deepEqual({ error: c.error, ownerStop: c.ownerStop }, { error: stop.error, ownerStop: true }, 'العميل يعرض السبب كما هو');
  const r2 = await ask({ type: 'refusal', category: 'reasoning_extraction' });
  assert.equal(r2.events.find((e) => e.ownerStop).error, 'رفض المزوّد الطلب (reasoning_extraction — فُهم السؤال طلبًا لكشف تفكيره الداخليّ — اسأل عن الجواب لا عمّا فكّر فيه)', 'الشرح ليس مضمونًا');
  const r3 = await ask({ type: 'refusal', category: null });
  assert.equal(r3.events.find((e) => e.ownerStop).error, 'رفض المزوّد الطلب', 'فئة null حالة صالحة (التوثيق)');
});

test('٥. C6: end_turn فارغ ← «رجع الردّ فارغًا» بدل «chat: empty reply»', { timeout: 20000 }, async () => {
  const r = await run('omran', { provider: 'claude', messages: Q }, (u) => (isAnth(u) ? T.empty() : new Response('{}', { status: 404 })));
  const c = await client(r.raw);
  assert.equal(c.ownerStop, true); assert.equal(c.error, 'رجع الردّ فارغًا');
});

test('٦. C5: ٢٠٠ ثمّ صمت (الترويسة وصلت ولا بايت بعدها) ← القطع بمهلة الخمول، والوسيط مرّة يجيب، والنبض متوقّف', { timeout: 20000 }, async () => {
  process.env.CHAT_STALL_FIRST_MS = '400'; process.env.CHAT_STALL_IDLE_MS = '400';
  try {
    const r = await run('omran', { provider: 'claude', messages: Q }, (u) => (isAnth(u) ? T.stall() : isOR(u) ? T.text('من الوسيط بعد الصمت.') : new Response('{}', { status: 404 })));
    const anth = r.calls.find((c) => isAnth(c.url));
    assert.ok(anth.signal && anth.signal.aborted, 'نداء المالك يحمل إشارة قطع وقُطع');
    assert.ok(r.events.some((e) => /المزوّد ما ردّ خلال 1 ث — أكمل عبر الوسيط/.test(e.status || '')));
    assert.equal(r.text, 'من الوسيط بعد الصمت.');
    assert.equal(r.liveIntervals, 0, 'لا نبض باقٍ بعد القطع');
    assert.ok(r.ended);
  } finally { delete process.env.CHAT_STALL_FIRST_MS; delete process.env.CHAT_STALL_IDLE_MS; }
});

test('٧. C5: صمت بلا وسيط ← السبب للمالك؛ وصمت في منتصف الردّ ← السبب تحت النصّ', { timeout: 20000 }, async () => {
  process.env.CHAT_STALL_FIRST_MS = '400'; process.env.CHAT_STALL_IDLE_MS = '400';
  try {
    const r = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u) => (isAnth(u) ? T.stall() : new Response('{}', { status: 404 }))));
    const c = await client(r.raw);
    assert.equal(c.ownerStop, true); assert.equal(c.error, 'المزوّد ما ردّ خلال 1 ث');
    assert.equal(r.liveIntervals, 0);
    const r2 = await run('omran', { provider: 'claude', messages: Q }, (u) => (isAnth(u) ? T.stall([start()].concat([textBlock(0, 'بدأت الجواب')[0], textBlock(0, 'بدأت الجواب')[1]])) : isOR(u) ? T.text('لا يُنادى') : new Response('{}', { status: 404 })));
    assert.equal(r2.calls.filter((x) => isOR(x.url)).length, 0, 'بعد نصّ في الخطوة نفسها لا تبديل');
    assert.equal((await client(r2.raw)).reply, 'بدأت الجواب\n\n⚠️ المزوّد ما ردّ خلال 1 ث');
    assert.equal(r2.liveIntervals, 0);
  } finally { delete process.env.CHAT_STALL_FIRST_MS; delete process.env.CHAT_STALL_IDLE_MS; }
});

test('٨. C7: تجاوز نافذة السياق في الخطوة ٣ ← إعادة بنتائج الأدوات الأقدم مقصوصة والأخيرة كاملة', { timeout: 20000 }, async () => {
  readBody = 'FILE big.js\n' + 'س'.repeat(5000);
  try {
    let overflowed = false;
    const r = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u, b, n) => {
      if (!isAnth(u)) return new Response('{}', { status: 404 });
      if (n <= 2) return T.tool('read_github', { url: 'OMRAN77/omran-ai-builder', path: 'f' + n + '.js' });
      if (!overflowed) { overflowed = true; return T.err(400, 'invalid_request_error', 'prompt is too long: 250000 tokens > 200000 maximum'); }
      return T.text('قرأت الملفّين.');
    }));
    const anth = r.calls.filter((c) => isAnth(c.url));
    assert.equal(anth.length, 4, 'إعادة واحدة بعد التجاوز');
    const results = anth[3].body.messages.filter((m) => m.role === 'user' && Array.isArray(m.content)).flatMap((m) => m.content.filter((x) => x.type === 'tool_result'));
    assert.equal(results.length, 2);
    assert.ok(results[0].content.length < 1700 && /قُصّ لتجاوز نافذة السياق/.test(results[0].content), 'الأقدم مقصوصة');
    assert.ok(results[1].content.length > 5000, 'الأخيرة كاملة');
    assert.equal(r.text, 'قرأت الملفّين.');
  } finally { readBody = 'FILE js/app-05-ui.js\n1| // محتوى'; }
});

test('٩. C8: «does not have access» على اختيار المالك ← الرسالة التالية تبدأ بالافتراضيّ بلا نداء فاشل', { timeout: 20000 }, async () => {
  const route = (u, b) => (isAnth(u) ? (b.model === 'claude-fable-5-1' ? T.err(400, 'invalid_request_error', 'This organization does not have access to model claude-fable-5-1 under its current data retention settings.') : T.text('جواب من ' + b.model)) : new Response('{}', { status: 404 }));
  const r1 = await run('omran', { provider: 'claude', model: 'claude-fable-5-1', messages: Q }, route);
  assert.deepEqual(r1.calls.filter((c) => isAnth(c.url)).map((c) => c.body.model), ['claude-fable-5-1', 'claude-haiku-4-5'], 'الاحتياط كما كان');
  const r2 = await run('omran', { provider: 'claude', model: 'claude-fable-5-1', messages: Q }, route);
  assert.deepEqual(r2.calls.filter((c) => isAnth(c.url)).map((c) => c.body.model), ['claude-haiku-4-5'], 'لا نداء فاشل أوّلًا');
  assert.ok(r2.events.some((e) => e.k === 'stModelFallback'), 'السطر نفسه للمالك');
  assert.equal(r2.text, 'جواب من claude-haiku-4-5');
});

test('١٠. غير المالك كما كان: لا إعادة ولا وسيط بعد التمهيد ولا سبب توقّف، والرفض بلا سطر', { timeout: 20000 }, async () => {
  const up = (u) => isAnth(u) || isOR(u);
  let n = 0;
  const r = await run('vipuser', { provider: 'claude', messages: [{ role: 'user', content: 'ابحث لي عن سعر الذهب اليوم' }] }, (u) => {
    if (!up(u)) return new Response('<html></html>', { status: 200 });
    n++; return n === 1 ? T.tool('fetch_page', { url: 'https://example.com/gold' }, 'أتحقّق لك.') : busy();
  });
  assert.equal(r.calls.filter((c) => up(c.url)).length, 2, 'لا إعادة');
  assert.ok(!r.events.some((e) => e.ownerStop));
  const err = r.events.find((e) => e.error);
  assert.ok(err && /chat upstream 529/.test(err.error) && err.fallback === false, JSON.stringify(err));
  assert.equal((await client(r.raw)).reply, 'أتحقّق لك.', 'العميل كما كان: النصّ وحده');
  const r2 = await run('vipuser', { provider: 'claude', messages: [{ role: 'user', content: 'اكتب قصيدة' }] }, (u) => (up(u) ? T.text('مقطع', 'refusal', { type: 'refusal', category: 'cyber' }) : new Response('{}', { status: 404 })));
  assert.ok(!r2.events.some((e) => e.ownerStop)); assert.ok(r2.events.some((e) => e.done));
});

test('١١. C5 على المسار المباشر (oa-direct): تفكير المزوّد الصامت يصل الحارس تعليقَ SSE (كلّ ٥ ث على الأكثر) ولا يغيّر الأحداث', async () => {
  const od = require(rp('api/_lib/oa-direct.js'));
  const realNow = Date.now; let skew = 0;
  const chunks = [
    'data: ' + JSON.stringify({ type: 'response.created', response: { model: 'gpt-x' } }) + '\n\n',
    'data: ' + JSON.stringify({ type: 'response.reasoning_summary_text.delta', delta: 'يفكّر' }) + '\n\n',
    'data: ' + JSON.stringify({ type: 'response.reasoning_summary_text.delta', delta: 'ما زال' }) + '\n\n',
    'data: ' + JSON.stringify({ type: 'response.output_text.delta', delta: 'الجواب' }) + '\n\n',
    'data: ' + JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 2 } } }) + '\n\n',
  ];
  let i = 0;
  const up = new ReadableStream({ pull(c) { if (i >= chunks.length) { c.close(); return; } skew += 6000; c.enqueue(new TextEncoder().encode(chunks[i++])); } });
  Date.now = () => realNow() + skew;
  let txt;
  try { txt = await new Response(od.responsesToAnthropicStream(up, 'fb')).text(); } finally { Date.now = realNow; }
  assert.ok((txt.match(/^: up$/gm) || []).length >= 2, 'تعليقات حياة أثناء التفكير');
  const evs = txt.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  assert.equal(evs.filter((e) => e.delta && e.delta.type === 'thinking_delta').map((e) => e.delta.thinking).join(''), 'يفكّرما زال', 'الملخّص كتلة تفكير');
  assert.equal(evs.filter((e) => e.type === 'content_block_delta').map((e) => e.delta.text).join(''), 'الجواب', 'الجواب منفصل عن الملخّص');
  assert.equal(evs[evs.length - 1].type, 'message_stop');
});

test('١٢. C5 قبل الترويسة: طلب معلّق يُقطع بالإشارة ← فشل صريح يمرّ بالسلسلة (الوسيط) أو سبب المهلة بلا وسيط، بلا إعادات «مشغول»', { timeout: 20000 }, async () => {
  process.env.CHAT_STALL_FIRST_MS = '400';
  // fetch بسلوك المتصفّح/undici: لا ترويسة أبدًا، ويرفض AbortError حين تُقطع الإشارة
  const hang = (signal) => new Promise((resolve, reject) => { if (signal) signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  // مؤقّتات الحارس unref (لا تُبقي الدالّة حيّة)؛ في الإنتاج يبقيها مقبس الطلب المعلّق — هنا مؤقّت يقوم مقامه
  const socket = setInterval(() => {}, 1000);
  try {
    const r = await run('omran', { provider: 'claude', messages: Q }, (u, b, n, init) => (isAnth(u) ? hang(init && init.signal) : isOR(u) ? T.text('من الوسيط بعد التعليق.') : new Response('{}', { status: 404 })));
    assert.equal(r.calls.filter((c) => isAnth(c.url)).length, 1, 'لا إعادة «مشغول» لطلب صامت');
    assert.equal(r.text, 'من الوسيط بعد التعليق.');
    const iStall = r.events.findIndex((e) => e.status === '⏳ المزوّد ما ردّ خلال 1 ث…'), iText = r.events.findIndex((e) => e.delta);
    assert.ok(iStall !== -1 && iStall < iText, 'سطر حالة فور القطع قبل الترويسة (يصفّر حارس العميل أثناء نداء الاحتياط)');
    const r2 = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u, b, n, init) => (isAnth(u) ? hang(init && init.signal) : new Response('{}', { status: 404 }))));
    const c = await client(r2.raw);
    assert.equal(c.ownerStop, true); assert.equal(c.error, 'المزوّد ما ردّ خلال 1 ث');
    assert.equal(r2.liveIntervals, 0);
  } finally { clearInterval(socket); delete process.env.CHAT_STALL_FIRST_MS; }
});

test('١٣. C5: ردّ كامل (end_turn + message_stop) والمقبس بقي مفتوحًا ← الجواب كما هو بلا سطر صمت', { timeout: 20000 }, async () => {
  process.env.CHAT_STALL_IDLE_MS = '400';
  try {
    const evs = [start()].concat(textBlock(0, 'الجواب كامل.'), [{ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }, { type: 'message_stop' }]);
    const r = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u) => (isAnth(u) ? T.stall(evs) : new Response('{}', { status: 404 }))));
    assert.ok(!r.events.some((e) => e.ownerStop), JSON.stringify(r.events.filter((e) => e.error)));
    assert.ok(r.events.some((e) => e.done), 'نهاية عاديّة');
    assert.equal((await client(r.raw)).reply, 'الجواب كامل.');
    assert.equal(r.liveIntervals, 0);
  } finally { delete process.env.CHAT_STALL_IDLE_MS; }
});

test('١٤. C5: tool_use كامل (stop_reason وصل) والمقبس بقي مفتوحًا ← الأداة تُنفَّذ والدور يكمل', { timeout: 20000 }, async () => {
  process.env.CHAT_STALL_IDLE_MS = '400';
  try {
    const r = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u, b, n) => (!isAnth(u) ? new Response('{}', { status: 404 })
      : n === 1 ? T.stall(toolEvs('read_github', READ, 'أقرأ.').concat([{ type: 'message_stop' }])) : T.text('تمّ: فيه دوال الواجهة.'))));
    const anth = r.calls.filter((c) => isAnth(c.url));
    assert.equal(anth.length, 2, 'الخطوة الثانية بعد الأداة');
    assert.ok(JSON.stringify(anth[1].body.messages).includes('tool_result'), 'نتيجة القراءة في الخطوة الثانية');
    assert.ok(!r.events.some((e) => e.ownerStop));
    assert.equal(r.text, 'أقرأ.تمّ: فيه دوال الواجهة.');
  } finally { delete process.env.CHAT_STALL_IDLE_MS; }
});

test('١٥. C5: لكلّ نداء مهلته — إعادة «مشغول» بعد ٣٠٠ م.ث لا ترث ما بقي من مهلة النداء الأوّل', { timeout: 20000 }, async () => {
  process.env.CHAT_STALL_FIRST_MS = '400';
  const later = (ms, signal, fn) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(fn()), ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
  });
  try {
    const r = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u, b, n, init) => (!isAnth(u) ? new Response('{}', { status: 404 })
      : later(300, init && init.signal, () => (n === 1 ? busy() : T.text('جواب بعد الإعادة.'))))));
    assert.equal(r.calls.filter((c) => isAnth(c.url)).length, 2);
    assert.ok(!r.events.some((e) => e.ownerStop), JSON.stringify(r.events.filter((e) => e.error)));
    assert.equal(r.text, 'جواب بعد الإعادة.');
  } finally { delete process.env.CHAT_STALL_FIRST_MS; }
});

test('١٦. C5: لا مهلة تتجاوز حدّ الدالّة (٣٠٠ ث) — خطوة تبدأ عند ٢٨٩٫٧ ث تُقطع قبله بسببها', { timeout: 20000 }, async () => {
  process.env.CHAT_MAX_MS = '600000';
  const realNow = Date.now; let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const r = await withoutOR(() => run('omran', { provider: 'claude', messages: Q }, (u, b, n) => {
      if (!isAnth(u)) return new Response('{}', { status: 404 });
      if (n === 1) { skew += 289700; return T.tool('read_github', READ); }
      return T.stall();
    }));
    const c = await client(r.raw);
    assert.equal(c.ownerStop, true);
    assert.equal(c.error, 'اقترب حدّ وقت الخادم (300 ث) والمزوّد لم يكمل');
    assert.ok(r.ms - 289700 < 5000, 'لا انتظار ٧٥ ث (' + (r.ms - 289700) + ' م.ث)');
  } finally { Date.now = realNow; delete process.env.CHAT_MAX_MS; }
});

test('١٧. C5: المهلة حتّى الترويسة ٧٥ ث على كلّ المسارات (العميل يستسلم عند ٩٠ ث بلا نبض)، والخمول بعدها ١٥٠ ث للمباشر و٦٠ لغيره', () => {
  const ol = require(rp('api/_lib/owner-loop.js'));
  const s = ol.state(true);
  ol.beginStep(s, { steps: 1, MAX_STEPS: 12, t0: Date.now(), MAX_MS: 240000, convo: [], tools: true });
  try {
    ol.signal(s, true);
    assert.equal(s.tFirst._idleTimeout, 75000, 'المباشر قبل الترويسة');
    ol.got(s, { ok: true });
    assert.equal(s.tFirst, null); assert.equal(s.tIdle._idleTimeout, 150000, 'المباشر بعد الترويسة');
    ol.signal(s, false);
    assert.equal(s.tFirst._idleTimeout, 75000);
    ol.got(s, { ok: true });
    assert.equal(s.tIdle._idleTimeout, 60000);
    ol.got(s, { ok: false, status: 529 });
    assert.equal(s.tIdle, null, 'فشل = لا حارس على جسم الخطأ');
    assert.equal(ol.signal(ol.state(false), true), undefined, 'غير المالك: لا إشارة ولا مؤقّت');
  } finally { ol.stop(s); }
});

test('١٨. C8: رفض «does not have access» على دور صورة لا يُذكَر (موديل لا يرى الصور ليس ميّتًا — v-owner-vision) ← الرسالة النصّيّة التالية تجرّبه', { timeout: 20000 }, async () => {
  const ol = require(rp('api/_lib/owner-loop.js'));
  ol.__deadPicks.clear(); for (const k of [...db.keys()]) if (k.startsWith('chat/deadpick/')) db.delete(k); // مستقلّ عن ٩
  const IMG = [{ role: 'user', content: [{ type: 'text', text: 'وش في الصورة؟' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] }];
  const route = (u, b) => (isAnth(u) ? (b.model === 'claude-fable-5-1' && JSON.stringify(b.messages).includes('"image"') ? T.err(400, 'invalid_request_error', 'This organization does not have access to model claude-fable-5-1 with image input.') : T.text('جواب من ' + b.model)) : new Response('{}', { status: 404 }));
  const r1 = await run('omran', { provider: 'claude', model: 'claude-fable-5-1', messages: IMG }, route);
  assert.equal(r1.calls.filter((c) => isAnth(c.url))[0].body.model, 'claude-fable-5-1');
  assert.ok(r1.events.some((e) => e.k === 'stModelFallback') && r1.text === 'جواب من claude-haiku-4-5', 'دور الصورة نفسه يهبط للافتراضيّ كما كان');
  const r2 = await run('omran', { provider: 'claude', model: 'claude-fable-5-1', messages: Q }, route);
  assert.equal(r2.calls.filter((c) => isAnth(c.url))[0].body.model, 'claude-fable-5-1', 'الاختيار نفسه أوّلًا في دور بلا صورة');
  assert.equal(r2.text, 'جواب من claude-fable-5-1');
});
