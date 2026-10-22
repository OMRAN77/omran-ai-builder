// tests/chat-owner-final.test.cjs — v-claude-code-level C1 (المالك ١٠ أكتوبر: «ولا يبني ولا يقرى… ما يعطيني شي»):
// حلقة أدوات المالك كانت تنتهي بعد ١٢ خطوة أو ٢٤٠ ث بـ{done} بلا حرف، فيرى «ما قدرت أردّ الحين». الآن آخر خطوة (أو آخر دقيقة
// من المهلة) تُرسل بتنبيه «اكتب الجواب الآن» والأدوات كما هي؛ وإن خرجت الحلقة بلا جواب فالسبب للمالك.
// v-prov-close-read: قراءة تتجاوز MAX_MS كانت تقطع قبل الختام — ٢ج/٢د.
// مسار أنثروبيك بلا tool_choice (تغييره يُبطل كاش الرسائل كلّها): الطلب الختاميّ = السابق + إلحاق فقط؛ وأداة طُلبت رغم التنبيه
// لا تُنفَّذ. المسار المباشر (oa-direct) بـtool_choice none.
// يشغّل api/_lib/chat.js الحقيقيّ بـfetch مزيّف (نمط provider-level)، وcallChatWithTools الحقيقيّ (app-18) في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'chat-owner-final-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_MAX_STEPS', 'CHAT_MAX_MS', 'CHAT_STALL_FIRST_MS', 'CHAT_STALL_IDLE_MS']) delete process.env[k];

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
});
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const toolLog = [];
require(rp('api/_lib/github-read.js')).readGithub = async (input) => { toolLog.push(input); return 'FILE ' + (input.path || '') + '\n1| // محتوى'; };
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const oa = require(rp('api/_lib/oa-direct.js'));
const { FINAL_NOTE, resumeMark } = require(rp('api/_lib/owner-loop.js')); // v-owner-resume: تحت ختام الميزانيّة سطر «اكتب «كمل»» من الخادم

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
const sseResp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const start = () => ({ type: 'message_start', message: { model: 'claude-x', usage: { input_tokens: 10, output_tokens: 0 } } });
const T = {
  text: (text) => sseResp([start(), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }, { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }]),
  tool: (name, input) => sseResp([start(), { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } }, { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }]),
};
const isAnth = (u) => /api\.anthropic\.com/.test(u);
const isUp = (u) => isAnth(u) || /openrouter\.ai\/api\/v1\/messages/.test(u);
const isFinal = (b) => JSON.stringify((b && b.messages) || []).includes(FINAL_NOTE.slice(0, 40));
// الكاش: علامات cache_control تتحرّك بين الطلبات وليست تغييرًا في البادئة — تُزال قبل المقارنة
const noCC = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'cache_control' ? undefined : x)));
const lastUserTexts = (b) => { const m = b.messages[b.messages.length - 1]; return Array.isArray(m.content) ? m.content.filter((x) => x.type === 'text').map((x) => x.text) : [m.content]; };

async function run(user, body, route) {
  usageUser = user; toolLog.length = 0;
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    return route(String(url), b, calls.length);
  };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const raw = out.join('');
  const events = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, raw, text: events.map((e) => e.delta || '').join('') };
}
// العميل الحقيقيّ: callChatWithTools من app-18 يستهلك البثّ نفسه
const app18 = fs.readFileSync(path.join(root, 'js/app-18-chat-tools.js'), 'utf8');
const app18Core = app18.slice(0, app18.indexOf('// v478:'));
async function client(raw) {
  const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => '' }, fetch: async () => new Response(raw, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
  vm.runInNewContext(app18Core, ctx);
  try { return { reply: (await ctx.window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'claude')).reply }; }
  catch (e) { return { error: e.message, ownerStop: !!e.ownerStop }; }
}
const Q = [{ role: 'user', content: 'اقرأ ملفّات المحادثة في مستودعي واشرح لي كيف يعمل زرّ الإرسال' }];

test('١. حلقة لا تنتهي: الخطوة ١٦ بالتنبيه والأدوات نفسها بلا tool_choice (الكاش)، والطلب إلحاق بالسابق، والردّ نصّ لا فراغ', async () => {
  const r = await run('omran', { provider: 'claude', messages: Q }, (u, b) => {
    if (!isAnth(u)) return new Response('{}', { status: 404 });
    if (isFinal(b)) return T.text('الجواب الختاميّ ممّا قرأت.');
    return T.tool('read_github', { url: 'OMRAN77/omran-ai-builder', path: 'f' + Math.random() + '.js' });
  });
  const anth = r.calls.filter((c) => isAnth(c.url));
  assert.equal(anth.length, 16, 'الختام في الخطوة ١٦ — v-provider-max (وُجد ' + anth.length + ')');
  const last = anth[anth.length - 1].body;
  assert.equal(last.tool_choice, undefined, 'لا tool_choice على مسار أنثروبيك — تغييره يُبطل كاش الرسائل');
  assert.deepEqual(last.tools.map((t) => t.name), anth[0].body.tools.map((t) => t.name), 'قائمة الأدوات كما هي (كاش الأدوات والنظام)');
  assert.ok(lastUserTexts(last).some((t) => t === FINAL_NOTE), 'التنبيه في آخر رسالة');
  assert.ok(anth.slice(0, -1).every((c) => c.body.tool_choice === undefined && !isFinal(c.body)), 'ما قبل الأخيرة بلا tool_choice ولا تنبيه');
  const prev = noCC(anth[anth.length - 2].body.messages), fin = noCC(last.messages);
  assert.deepEqual(fin.slice(0, prev.length), prev, 'الطلب الختاميّ = السابق + إلحاق (البادئة تُقرأ من الكاش)');
  assert.deepEqual(noCC(last.system), noCC(anth[anth.length - 2].body.system), 'النظام كما هو');
  assert.equal(toolLog.length, 15, 'لا قراءة في الخطوة الختاميّة');
  assert.equal(r.text, 'الجواب الختاميّ ممّا قرأت.' + resumeMark());
  assert.ok(!r.events.some((e) => e.ownerStop), 'لا سبب توقّف — جاء الجواب');
  assert.equal((await client(r.raw)).reply, 'الجواب الختاميّ ممّا قرأت.' + resumeMark());
});

test('٢. مسار الوقت (CHAT_MAX_MS): بعد (المهلة − الهامش) الخطوة التالية ختاميّة قبل حدّ الخطوات', async () => {
  process.env.CHAT_MAX_MS = '20000'; // الهامش ربع المهلة = ٥ ث
  const realNow = Date.now; let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const r = await run('omran', { provider: 'claude', messages: Q }, (u, b) => {
      if (!isAnth(u)) return new Response('{}', { status: 404 });
      skew += 6000; // كلّ خطوة «تأخذ» ٦ ث
      if (isFinal(b)) return T.text('جواب قبل انتهاء المهلة.');
      return T.tool('read_github', { url: 'OMRAN77/omran-ai-builder', path: 'x' + Math.random() + '.js' });
    });
    const anth = r.calls.filter((c) => isAnth(c.url));
    assert.ok(anth.length < 16 && anth.length >= 2, 'الختام بالوقت لا بالخطوات (وُجد ' + anth.length + ')');
    assert.ok(isFinal(anth[anth.length - 1].body) && anth[anth.length - 1].body.tool_choice === undefined);
    assert.equal(r.text, 'جواب قبل انتهاء المهلة.' + resumeMark());
  } finally { Date.now = realNow; delete process.env.CHAT_MAX_MS; }
});

test('٢ب. أداة في خطوة الختام بالوقت ← لا تُنفَّذ ولا خطوة بعدها، والسبب «انتهت مهلة الردّ» تحت ما كُتب', async () => {
  process.env.CHAT_MAX_MS = '20000';
  const realNow = Date.now; let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const r = await run('omran', { provider: 'claude', messages: Q }, (u) => {
      if (!isAnth(u)) return new Response('{}', { status: 404 });
      skew += 6000;
      return T.tool('read_github', { url: 'OMRAN77/omran-ai-builder', path: 'z' + Math.random() + '.js' });
    });
    const anth = r.calls.filter((c) => isAnth(c.url));
    assert.ok(isFinal(anth[anth.length - 1].body), 'آخر نداء هو الختاميّ');
    assert.equal(toolLog.length, anth.length - 1, 'أداة الختام لم تُنفَّذ');
    const stop = r.events.find((e) => e.ownerStop);
    assert.ok(stop && /انتهت مهلة الردّ \(20 ث\) قبل الجواب النهائيّ/.test(stop.error), JSON.stringify(stop));
  } finally { Date.now = realNow; delete process.env.CHAT_MAX_MS; }
});

test('٢ج. أداة تتجاوز المهلة ← خطوة ختام بعدها والجواب يصل (لا قطع بعد القراءة)', async () => {
  process.env.CHAT_MAX_MS = '20000';
  const realNow = Date.now; let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const r = await run('omran', { provider: 'claude', messages: Q }, (u, b) => {
      if (!isAnth(u)) return new Response('{}', { status: 404 });
      if (isFinal(b)) return T.text('الجواب بعد القراءة.');
      skew += 21000;
      return T.tool('read_github', { url: 'OMRAN77/omran-ai-builder', path: 'late.js' });
    });
    const anth = r.calls.filter((c) => isAnth(c.url));
    assert.equal(anth.length, 2, 'نداء قراءة ثمّ ختام (وُجد ' + anth.length + ')');
    assert.ok(isFinal(anth[1].body), 'الثاني ختاميّ رغم تجاوز المهلة');
    assert.equal(toolLog.length, 1, 'القراءة نُفّذت قبل الختام');
    assert.equal(r.text, 'الجواب بعد القراءة.' + resumeMark()); // v-owner-resume: ختام الميزانيّة بلا رفع يلحق سطر «كمل»
    assert.ok(!r.events.some((e) => e.ownerStop), 'الجواب وصل — لا سبب توقّف');
  } finally { Date.now = realNow; delete process.env.CHAT_MAX_MS; }
});

test('٢د. overTime: بعد المهلة ختام واحد إن بقي حدّ الدالّة، وإلّا قطع', () => {
  const ol = require(rp('api/_lib/owner-loop.js'));
  const s = ol.state(true);
  const t0 = Date.now() - 250000;
  assert.equal(ol.overTime(s, { t0, MAX_MS: 240000, steps: 1 }), false, 'يسمح بالختام');
  s.final = true;
  assert.equal(ol.overTime(s, { t0, MAX_MS: 240000, steps: 1 }), true, 'بعد الختام يقطع');
  s.final = false;
  assert.equal(ol.overTime(ol.state(false), { t0, MAX_MS: 240000, steps: 1 }), true, 'غير المالك يقطع');
  assert.equal(ol.overTime(s, { t0, MAX_MS: 240000, steps: 0 }), true, 'بلا خطوة سابقة يقطع');
  assert.equal(ol.overTime(s, { t0: Date.now(), MAX_MS: 240000, steps: 1 }), false, 'قبل المهلة لا قطع');
  assert.equal(ol.overTime(s, { t0: Date.now() - 280000, MAX_MS: 240000, steps: 1 }), true, 'حدّ الدالّة لا يكفي');
});

test('٣. موديل يطلب أداة رغم التنبيه: أداة الخطوة ١٦ لا تُنفَّذ، والسبب ظاهر للمالك (لا «ما قدرت أردّ الحين»)', async () => {
  const r = await run('omran', { provider: 'claude', messages: Q }, (u) => (isAnth(u) ? T.tool('read_github', { url: 'OMRAN77/omran-ai-builder', path: 'y' + Math.random() + '.js' }) : new Response('{}', { status: 404 })));
  assert.equal(r.calls.filter((c) => isAnth(c.url)).length, 16); // v-provider-max: ١٦ خطوة
  assert.equal(toolLog.length, 15, 'أداة الختام لم تُنفَّذ — ١٥ أداة قبل الخطوة ١٦');
  const stop = r.events.find((e) => e.ownerStop);
  assert.ok(stop && /انتهت ميزانيّة الخطوات \(16\)/.test(stop.error), 'السبب: ' + JSON.stringify(stop));
  const c = await client(r.raw);
  assert.equal(c.ownerStop, true); assert.match(c.error, /انتهت ميزانيّة الخطوات/);
});

test('٤. غير المالك كما كان: لا tool_choice ولا تنبيه ولا سبب توقّف', async () => {
  const r = await run('vipuser', { provider: 'claude', messages: [{ role: 'user', content: 'ابحث لي عن أسعار الذهب اليوم' }] }, (u, b) => {
    if (!isUp(u)) return new Response('<html></html>', { status: 200 });
    return T.tool('fetch_page', { url: 'https://example.com/' + Math.random() });
  });
  const anth = r.calls.filter((c) => isUp(c.url)); // VIP يُوجَّه للوسيط (v-providers-owner) — الحلقة نفسها
  assert.ok(anth.length >= 2);
  assert.ok(anth.every((c) => c.body.tool_choice === undefined), 'لا tool_choice لغير المالك');
  assert.ok(anth.every((c) => !JSON.stringify(c.body.messages).includes('انتهت ميزانيّة الأدوات')), 'لا تنبيه');
  assert.ok(!r.events.some((e) => e.ownerStop), 'لا سبب توقّف لغير المالك');
});

test('٥. oa-direct يترجم tool_choice none إلى «none» عند OpenAI (المساران) — ولا يرسله بلا أدوات', () => {
  const ab = { model: 'gpt-x', messages: [{ role: 'user', content: 'س' }], tools: [{ name: 'read_github', description: 'd', input_schema: { type: 'object', properties: {} } }], tool_choice: { type: 'none' } };
  assert.equal(oa.toOpenAIBody(ab, 'openai').tool_choice, 'none');
  assert.equal(oa.toResponsesBody(ab).tool_choice, 'none');
  assert.equal(oa.toOpenAIBody(ab, 'openai').tools.length, 1, 'الأدوات كما هي');
  const noTools = Object.assign({}, ab, { tools: undefined });
  assert.equal(oa.toOpenAIBody(noTools, 'openai').tool_choice, undefined);
  assert.equal(oa.toResponsesBody(noTools).tool_choice, undefined);
  assert.equal(oa.toOpenAIBody(Object.assign({}, ab, { tool_choice: undefined }), 'openai').tool_choice, undefined, 'بلا ختام = كما كان');
});

test('٦. المسار المباشر (Groq عبر oa-direct): الخطوة الختاميّة بتنبيه الختام والأدوات نفسها — بلا tool_choice «none» (v-groq-final: Groq يرفض التوليد به tool_use_failed)', async () => {
  process.env.GROQ_API_KEY = 'gsk-test'; process.env.CHAT_MAX_STEPS = '3';
  const oaSse = (chunks) => new Response(chunks.map((c) => 'data: ' + (typeof c === 'string' ? c : JSON.stringify(c)) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  try {
    const r = await run('omran', { provider: 'groq', messages: Q }, (u, b) => {
      if (!/api\.groq\.com/.test(u)) return new Response('{}', { status: 404 });
      if (JSON.stringify(b.messages).includes('انتهت ميزانيّة الأدوات')) return oaSse([{ model: 'm', choices: [{ index: 0, delta: { content: 'جواب Groq الختاميّ' } }] }, { model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, '[DONE]']);
      return oaSse([{ model: 'm', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c' + Math.random().toString(36).slice(2, 7), type: 'function', function: { name: 'read_github', arguments: JSON.stringify({ url: 'OMRAN77/omran-ai-builder', path: 'g.js' }) } }] } }] },
        { model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }, '[DONE]']);
    });
    const g = r.calls.filter((c) => /api\.groq\.com/.test(c.url));
    assert.equal(g.length, 3);
    assert.equal(g[2].body.tool_choice, undefined, 'Groq بلا tool_choice none (v-groq-final)');
    assert.ok(JSON.stringify(g[2].body.messages).includes('انتهت ميزانيّة الأدوات'), 'تنبيه الختام يكفيه');
    assert.ok(g.slice(0, 2).every((c) => c.body.tool_choice === undefined));
    assert.deepEqual(g[2].body.tools.map((t) => t.function.name), g[0].body.tools.map((t) => t.function.name), 'الأدوات نفسها');
    assert.equal(r.text, 'جواب Groq الختاميّ' + resumeMark());
  } finally { delete process.env.GROQ_API_KEY; delete process.env.CHAT_MAX_STEPS; }
});
