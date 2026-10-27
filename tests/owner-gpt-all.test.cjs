'use strict';
/* v-owner-gpt-all (أمر عمران ١٠ أكتوبر: «بعد ما تخلص الانثروبك ابدأ في GPT — كلهم نفس الموضوع»): للمالك وحده — موديلات OpenAI
   النشطة من صفحاتها الرسميّة (الرئيسيّة Astra · 6.1 Sol · 6 Luna ثمّ «نماذج أخرى») و«الجهد» بالمستويات نفسها مقيّدًا بما يقبله كلّ
   موديل: المسار المباشر (/v1/responses) reasoning.effort، والوسيط output_config.effort. غير المالك بايتًا بايتًا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'owner-gpt-all-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'CHAT_OPENAI_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_IMAGE_MODEL', 'CHAT_IMAGE_EFFORT', 'KIMI_API_KEY', 'MOONSHOT_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
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
const anthText = (t) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
]);
const oaResp = (t, model) => new Response([
  { type: 'response.created', response: { model } },
  { type: 'response.output_text.delta', output_index: 0, delta: t },
  { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200 });
const err400 = (message) => new Response(JSON.stringify({ error: { message, type: 'invalid_request_error' } }), { status: 400 });
const ask = (t) => [{ role: 'user', content: t }];
const HARD = 'اكتب لي خطة مشروع كاملة';

function reset() { ot.__deadEffort.clear(); od.__quickRejected.clear(); chat.__orQuick.level = 2; for (const k of [...db.keys()]) if (/deadpick/.test(k)) db.delete(k); }
async function run(user, extra, script) {
  usageUser = user;
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    const step = script ? script[Math.min(i++, script.length - 1)] : null;
    if (step) return step();
    return /api\.openai\.com/.test(String(url)) ? oaResp('تم', 'x') : anthText('تم');
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user), provider: 'openai' }, extra) };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events };
}
const withDirect = async (fn) => { process.env.OPENAI_API_KEY = 'sk-openai-test'; try { return await fn(); } finally { delete process.env.OPENAI_API_KEY; } };

test('١. الوحدة gptEffortFields: مستويات كلّ موديل من صفحاته الرسميّة، Max ← Extra حيث لا Max، والسقف على المباشر وحده', () => {
  reset();
  const F = ot.gptEffortFields;
  assert.deepEqual(F('gpt-6-astra', 'max'), { output_config: { effort: 'max' }, max_tokens: 64000 });
  assert.deepEqual(F('openai/gpt-6.1-sol', 'xhigh'), { output_config: { effort: 'xhigh' }, max_tokens: 64000 }, 'صيغة الوسيط تُطبَّع');
  assert.deepEqual(F('gpt-6-luna', 'high'), { output_config: { effort: 'high' }, max_tokens: 32000 });
  for (const lvl of ['low', 'medium']) assert.deepEqual(F('gpt-6-sol', lvl), { output_config: { effort: lvl } });
  for (const id of ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.2']) assert.deepEqual(F(id, 'max'), { output_config: { effort: 'xhigh' }, max_tokens: 64000 }, id + ': بلا max');
  for (const id of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) assert.deepEqual(F(id, 'max').output_config, { effort: 'max' }, id);
  assert.deepEqual(F('openai/gpt-6-astra', 'max', true), { output_config: { effort: 'max' } }, 'الوسيط: سقفه ١٦٠٠٠');
  for (const bad of ['', null, 'none', 'minimal', 'ultra']) assert.equal(F('gpt-6-astra', bad), null, String(bad));
  for (const id of ['gpt-4.1', 'gpt-5', 'o3', 'claude-opus-5-5']) assert.equal(F(id, 'high'), null, id + ': خارج الجدول');
  ot.forgetEffort('gpt-6-astra');
  assert.equal(F('gpt-6-astra', 'high'), null, 'المرفوض لا يُرسل ثانيةً');
  reset();
  // سلّم «بلا تفكير» التلقائيّ: Astra و6.1 Sol يبدآن من low (none عندهما 400 موثَّق)، والبقيّة كما كانت
  const qb = (m) => od.toResponsesBody({ model: m, messages: ask('x'), thinking: { type: 'disabled' } }).reasoning;
  assert.deepEqual(qb('gpt-6-astra'), { effort: 'low' });
  assert.deepEqual(qb('gpt-6.1-sol'), { effort: 'low' });
  assert.deepEqual(qb('gpt-6-sol'), { effort: 'none' });
  assert.deepEqual(qb('gpt-5'), { effort: 'none' }, 'خارج الجدول: السلّم القديم');
});

test('٢. المباشر (/v1/responses): جهد المالك reasoning.effort ويغلب التلقائيّ، بسقفه، وMax ← Extra على GPT-5.5', async () => {
  reset();
  await withDirect(async () => {
    let r = await run('omran', { model: 'openai/gpt-6-astra', messages: ask('السلام'), effort: 'max' });
    assert.equal(r.calls[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(r.calls[0].body.model, 'gpt-6-astra');
    assert.deepEqual(r.calls[0].body.reasoning, { effort: 'max', summary: 'auto' }, 'التحيّة بجهد المالك لا السلّم، والملخّص للعرض');
    assert.equal(r.calls[0].body.max_output_tokens, 128000); // v-owner-cap-open
    r = await run('omran', { model: 'openai/gpt-5.5', messages: ask(HARD), effort: 'max' });
    assert.deepEqual(r.calls[0].body.reasoning, { effort: 'xhigh', summary: 'auto' });
    r = await run('omran', { model: 'openai/gpt-6.1-sol', messages: ask(HARD), effort: 'high' });
    assert.deepEqual(r.calls[0].body.reasoning, { effort: 'high', summary: 'auto' });
    assert.equal(r.calls[0].body.max_output_tokens, 128000, 'v-owner-cap-open: سقف المالك يغلب سقف الجهد ٣٢ ألفًا');
    // تلقائي: الصعب بلا reasoning وسقف المالك المفتوح
    r = await run('omran', { model: 'openai/gpt-6-astra', messages: ask(HARD) });
    assert.deepEqual(r.calls[0].body.reasoning, { summary: 'auto' }, 'بلا جهد مفروض، والملخّص للعرض');
    assert.equal(r.calls[0].body.max_output_tokens, 128000); // v-owner-cap-open
  });
  reset();
});

test('٣. المباشر: جهد المالك المرفوض (400) = إعادة واحدة بلا reasoning — لا يقفز إلى none، ولا يلمس سلّم التحيّة', async () => {
  reset();
  await withDirect(async () => {
    const r = await run('omran', { model: 'openai/gpt-6-luna', messages: ask(HARD), effort: 'max' }, [() => err400("Unsupported value: 'reasoning.effort' does not support 'max' with this model."), () => oaResp('تم', 'gpt-6-luna')]);
    assert.equal(r.calls.length, 2);
    assert.deepEqual(r.calls[0].body.reasoning, { effort: 'max', summary: 'auto' });
    assert.equal(r.calls[1].body.reasoning, undefined, 'افتراضيّ الموديل، لا none');
    assert.ok(!r.events.some((e) => e.k === 'stModelFallback'));
    assert.ok(ot.__deadEffort.has('gpt-6-luna'), 'يُذكر');
    assert.equal(od.__quickRejected.size, 0, 'سلّم التحيّة لم يُمسّ');
  });
  reset();
});

test('٤. الوسيط: output_config.effort بلا حقول الإطفاء، والسقف ١٦٠٠٠', async () => {
  reset();
  const r = await run('omran', { model: 'openai/gpt-6-astra', messages: ask('السلام'), effort: 'xhigh' });
  assert.equal(r.calls[0].url, 'https://openrouter.ai/api/v1/messages');
  assert.equal(r.calls[0].body.model, 'openai/gpt-6-astra');
  assert.deepEqual(r.calls[0].body.output_config, { effort: 'xhigh' });
  assert.equal(r.calls[0].body.thinking, undefined, 'لا thinking:disabled (يُبطل الجهد عند الوسيط)');
  assert.equal(r.calls[0].body.reasoning, undefined);
  assert.equal(r.calls[0].body.max_tokens, 128000, 'سقف التفكير والردّ على الوسيط أيضًا (مراجعة · v-owner-cap-open)');
  reset();
});

test('٥. غير المالك: موديل وجهد مرسَلان يُتجاهلان — الطلب نفسه بايتًا بايتًا', async () => {
  reset();
  const norm = (b) => JSON.stringify(b).replace(/\d{1,2}:\d{2}/g, 'HH:MM');
  for (const q of [ask('السلام'), ask(HARD)]) {
    const a = await run('someone', { messages: q });
    const b = await run('someone', { messages: q, model: 'openai/gpt-6-astra', effort: 'max' });
    assert.ok(a.calls.length >= 1 && b.calls.length === a.calls.length);
    assert.equal(norm(b.calls[0].body), norm(a.calls[0].body));
    assert.equal(b.calls[0].body.output_config, undefined);
    assert.ok(!/gpt-6-astra/.test(JSON.stringify(b.calls[0].body)));
  }
  reset();
});

test('٦. العميل: app-29 جهد GPT للمالك وحده ومقيّد بالموديل، وapp-18 يرسله مع GPT', async () => {
  function ctxFor(user, store, gptModel) {
    const ls = { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const ctx = { localStorage: ls, document: { readyState: 'complete', addEventListener() {}, getElementById: () => null }, omranOwnerUi: () => user === 'omran', omranModelFor: (k) => (k === 'openai' ? gptModel : '') };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/app-29-claude-model.js'), ctx);
    return ctx;
  }
  const store = { aiapp_owner_opus55_v1: '1' };
  let w = ctxFor('omran', store, 'openai/gpt-6-astra');
  assert.equal(w.gptEffortGet(), '', 'تلقائيّ افتراضيًّا');
  w.gptEffortSet('max');
  assert.equal(w.gptEffortGet(), 'max');
  w = ctxFor('omran', store, 'openai/gpt-5.5');
  assert.equal(w.gptEffortGet(), 'xhigh', 'GPT-5.5 بلا Max');
  w = ctxFor('omran', store, 'openai/gpt-4.1');
  assert.equal(w.gptEffortGet(), '', 'موديل بلا جهد معروف');
  w = ctxFor('someone', store, 'openai/gpt-6-astra');
  assert.equal(w.gptEffortGet(), '', 'غير المالك');
  assert.equal(w.claudeEffortGet(), '', 'وجهد كلود منفصل');
  // app-18: الحقل مع GPT من gptEffortGet، ومع مزوّد آخر لا شيء
  const core = read('js/app-18-chat-tools.js');
  const app18Core = core.slice(0, core.indexOf('// v478:'));
  async function body(provider) {
    let sent = null;
    const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => '', claudeEffortGet: () => 'low', gptEffortGet: () => 'xhigh', omranModelFor: () => 'openai/gpt-6-astra' },
      fetch: async (u, init) => { sent = init.body; return new Response('data: {"done":true}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } }); },
      TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
    vm.runInNewContext(app18Core, ctx);
    try { await ctx.window.callChatWithTools([{ role: 'user', content: 'x' }], null, provider); } catch (e) { /* الردّ المزيّف قصير — يكفينا الجسم */ }
    return JSON.parse(sent);
  }
  assert.equal((await body('openai')).effort, 'xhigh');
  assert.equal((await body('claude')).effort, 'low');
  assert.equal((await body('gemini')).effort, undefined);
});

test('٧. modes.js: صفّ GPT بمجموعتيه وصفّ جهده، والقائمة الحيّة لا تستبدله، وافتراضيّ غير المالك كما كان', () => {
  const m = read('js/modes.js');
  const i = m.indexOf('var PROVS = ['), j = m.indexOf('\n      ];', i);
  const PROVS = new Function('return ' + m.slice(i + 'var PROVS = '.length, j + '\n      ]'.length))();
  const g = PROVS.find((p) => p.key === 'openai');
  assert.equal(g.def, 'openai/gpt-6-sol', 'افتراضيّ السهم = OR_MODELS.openai كما كان');
  // أمر المالك ١١ أكتوبر «Astra»: افتراضيّ المالك وحده GPT-6 Astra (odef)؛ غير المالك def كما كان، وافتراضيّ المالك الميّت يُثبَّت def
  assert.equal(g.odef, 'openai/gpt-6-astra');
  const sl = m.slice(i, m.indexOf('var ROW =', i));
  for (const [own, want] of [[true, 'openai/gpt-6-astra'], [false, 'openai/gpt-6-sol']]) {
    const st = {};
    const ls2 = { getItem: (k) => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); }, removeItem: (k) => { delete st[k]; } };
    const win = {};
    new Function('localStorage', 'AR', 't', 'window', 'omranOwnerUi', 'refresh', sl)(ls2, true, (k) => k, win, () => own, () => {});
    assert.equal(win.omranModelFor('openai'), want, own ? 'المالك' : 'غير المالك');
    if (own) {
      assert.equal(win.omranForgetModel('openai', 'openai/gpt-6-astra'), true);
      assert.equal(st.aiapp_model, 'openai/gpt-6-sol', 'Astra ميّت على المفتاح = يُثبَّت الافتراضيّ العامّ فلا يتكرّر الفشل');
      assert.equal(win.omranModelFor('openai'), 'openai/gpt-6-sol');
    }
  }
  assert.ok(m.includes("if(!localStorage.getItem('aiapp_owner_astra_v1')){ localStorage.removeItem('aiapp_model'); localStorage.setItem('aiapp_owner_astra_v1', '1'); }"), 'ترحيل مرّة واحدة على جهاز المالك');
  assert.equal(g.effort, true);
  assert.deepEqual(g.models.filter((x) => x[2] !== 1).map((x) => x[1]), ['GPT-6 Astra', 'GPT-6.1 Sol', 'GPT-6 Luna']);
  assert.deepEqual(g.models.filter((x) => x[2] === 1).map((x) => x[0]), ['openai/gpt-6-sol', 'openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna', 'openai/gpt-5.5', 'openai/gpt-5.4', 'openai/gpt-5.4-mini', 'openai/gpt-5.2']);
  for (const [id] of g.models) assert.ok(ot.gptEfforts(id), id + ' في جدول الخادم');
  const a = m.indexOf('      var ROW = '), b = m.indexOf('      /* v-cc-remove', a);
  const html = new Function('PROVS', 'AR', 't', m.slice(a, b) + '; return provsHTML();')(PROVS, true, (k) => k);
  const box = html.slice(html.indexOf('class="omProvModels" data-for="openai"'), html.indexOf('class="omProvHead" data-prov="gemini"'));
  assert.ok(/class="omEffortHead" data-for="openai"/.test(box) && /class="omEffortBox" data-for="openai" hidden/.test(box));
  assert.ok(/class="omProvMore" data-for="openai" hidden/.test(box));
  assert.ok(m.includes('if(!p.or || p.effort || !L || !L.length) continue;'), 'القائمة الحيّة لا تمسح المجموعات');
  // مراجعة: اختيار محفوظ من القائمة الحيّة القديمة خارج المنسّقة يظهر في «نماذج أخرى» باسمه (يُعلَّم ويُعاد اختياره)
  const store = { aiapp_provider: 'openai', aiapp_model: 'openai/gpt-6-sol-pro' };
  const ls = { getItem: (k) => (k in store ? store[k] : null) };
  const name = new Function('localStorage', 'AR', 't', 'window', m.slice(i, m.indexOf('var ROW =', i)) + '; return curProvName;')(ls, true, (k) => k, {});
  assert.equal(name(), 'gpt-6-sol-pro', 'باسمه لا «GPT» وحده');
  assert.ok(m.includes("var setFn = (efor === 'openai') ? window.gptEffortSet : window.claudeEffortSet;"), 'كلّ صفّ جهد يحفظ لمزوّده');
  assert.ok(read('index.html').includes('/js/modes.js?v=m211026'));
  assert.ok(read('js/app.bundle.js').includes('window.gptEffortGet = gptEffortGet;'), 'الحزمة أُعيد بناؤها');
});
