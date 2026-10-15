// tests/owner-resume.test.cjs — v-owner-resume (لقطة المالك ١٣ أكتوبر، GPT-6 Astra وبطاقات الأزياء: «شوف شو مشكلته مب قادر يكمل» ثمّ
// «تقدر تعدل عليه»): المزوّد قرأ حتّى انتهت ميزانيّة الدور (١٢ خطوة أو ٤ دقائق)، فأُجبر على الختام بلا أدوات وكتب «ما رفعت تعديل للحين:
// انتهت مهلة الأدوات بعد القراءة». ثمّ «كمل» وصلته كلمة وحدها بلا سياق المهمّة ولا تنبيه، فأعاد وصف اللقطة بلا أداة واحدة.
// الآن: (١) الختام بالميزانيّة يُلحق سطرًا ثابتًا من الخادم «⏸️ … اكتب «كمل» ويكمل من حيث وقف» (لا يُلحق إن رُفع تعديل)؛ (٢) «كمل»
// بعد ردّ فيه ذلك السطر تحمل تنبيه «أكمل المهمّة نفسها بأدواتك من حيث وقفت»؛ (٣) وإن ختم دور الإكمال بنصّ بلا أداة يُعاد للحلقة مرّة
// بتنبيه «نفّذ الآن». المسار: المالك على GPT-6 Astra بمفتاح OpenAI المباشر (/v1/responses) — api/_lib/chat.js الحقيقيّ بـfetch مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'owner-resume-test-secret';
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
stub('api/_lib/_usage.js', {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {},
  checkAndConsume: async () => ({ allowed: true, username: 'omran', tier: 'owner', subscriber: true }),
});
stub('api/_lib/_vip.js', { isVip: async () => false });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const toolLog = [];
require(rp('api/_lib/github-read.js')).readGithub = async (input) => { toolLog.push(input); return 'FILE ' + (input.path || '') + '\n1| // محتوى'; };
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const GE = require(rp('api/_lib/github-edit.js'));
const edits = [];
GE.editFiles = async (input) => { edits.push(input); return { repo: 'OMRAN77/omran-ai-builder', branch: 'omran-agent/fix', commit: 'abcdef1234567', commitUrl: 'https://github.com/OMRAN77/omran-ai-builder/commit/abcdef1', files: 1, prUrl: 'https://github.com/OMRAN77/omran-ai-builder/pull/88', prNumber: 88 }; };
const chat = require(rp('api/_lib/chat.js'));
const ol = require(rp('api/_lib/owner-loop.js'));
const { CARRY_NOTE } = require(rp('api/_lib/owner-carry.js'));

function token(u) {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 600000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
}
// بثّ /v1/responses كما يرسله OpenAI: نصّ، أو استدعاء دالّة واحد
const resp = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const done = { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } };
const R = {
  text: (t) => resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } }, { type: 'response.output_text.delta', output_index: 0, delta: t }, done]),
  call: (name, input) => {
    const id = 'call_' + Math.random().toString(36).slice(2, 8), args = JSON.stringify(input);
    return resp([{ type: 'response.created', response: { model: 'gpt-6-astra' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
      { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: id, name, arguments: args, status: 'completed' } }, done]);
  },
  read: (p) => R.call('read_github', { url: 'OMRAN77/omran-ai-builder', path: p }),
};
const EDIT = { repo: 'OMRAN77/omran-ai-builder', edits: [{ path: 'js/app-13-stocks-init.js', old: 'a', new: 'b' }], message: 'تصحيح' };
async function run(messages, route) {
  toolLog.length = 0;
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; }
    calls.push({ url: String(url), body: b });
    if (!/api\.openai\.com\/v1\/responses/.test(String(url))) return new Response('{}', { status: 404 });
    return route(b, calls.length);
  };
  const req = { method: 'POST', headers: {}, body: { token: token('omran'), provider: 'openai', model: 'openai/gpt-6-astra', messages } };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const raw = out.join('');
  const events = raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls: calls.filter((c) => /api\.openai\.com\/v1\/responses/.test(c.url)), events, raw, text: events.map((e) => e.delta || '').join('') };
}
// العميل الحقيقيّ (app-18) يستهلك البثّ نفسه فيُحفظ الردّ كما يراه المالك
const app18 = fs.readFileSync(path.join(root, 'js/app-18-chat-tools.js'), 'utf8');
async function client(raw) {
  const ctx = { window: { authGet: () => 'tok', claudeModelGet: () => '' }, fetch: async () => new Response(raw, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    TextDecoder, setTimeout, clearTimeout, Promise, Error, String, JSON, Date, Array, Math, console, Intl, Object, Number, RegExp };
  vm.runInNewContext(app18.slice(0, app18.indexOf('// v478:')), ctx);
  return (await ctx.window.callChatWithTools([{ role: 'user', content: 'x' }], null, 'openai')).reply;
}
const lastUserText = (b) => { const it = (b.input || []).filter((m) => m && m.role === 'user').pop(); if (!it) return ''; return typeof it.content === 'string' ? it.content : (it.content || []).map((c) => c.text || '').join('\n'); };
const ASK = 'بطاقات الأزياء: «عماني بكمة» و«بشت وشماغ» صورهم نسائيّة و«قفطان إماراتي مطرز» صورته رجل — صلّحها وخلّ الأسماء';
const SUMMARY = 'ما رفعت تعديل للحين: انتهت مهلة الأدوات بعد القراءة.';
const withEnv = async (fn) => { process.env.OPENAI_API_KEY = 'sk-openai-test'; process.env.CHAT_MAX_STEPS = '4'; try { return await fn(); } finally { delete process.env.OPENAI_API_KEY; delete process.env.CHAT_MAX_STEPS; } };

test('١. الدور الأوّل: طلب تعديل — ختام الميزانيّة يُبقي الأدوات (لا tool_choice none) بتنبيه التنفيذ، وتحت الملخّص سطر «كمل»', async () => {
  await withEnv(async () => {
    const r = await run([{ role: 'user', content: ASK }], (b) => (lastUserText(b).includes('نفّذ التعديل الآن') ? R.text(SUMMARY) : R.read('js/app-13-stocks-init.js')));
    assert.equal(r.calls.length, 4, 'أربع خطوات: ثلاث قراءات ثمّ الختام');
    assert.equal(r.calls[3].body.tool_choice, undefined, 'ختام التعديل يُبقي الأدوات على المسار المباشر');
    assert.ok(lastUserText(r.calls[3].body).includes(ol.FINAL_EDIT_NOTE), 'تنبيه التنفيذ لا الملخّص');
    assert.equal(toolLog.length, 3);
    assert.ok(r.text.startsWith(SUMMARY), r.text);
    assert.ok(r.text.includes(ol.RESUME_KEY), 'سطر الإكمال تحت الملخّص: ' + r.text);
    assert.ok((await client(r.raw)).includes(ol.RESUME_KEY), 'العميل يحفظه في الردّ فيصل الدور التالي في التاريخ');
  });
});

test('٢. «كمل» بعد ردّ قطعته الميزانيّة: تنبيه «أكمل المهمّة نفسها بأدواتك» في رسالة المالك، والأدوات كما هي', async () => {
  await withEnv(async () => {
    const hist = [{ role: 'user', content: ASK }, { role: 'assistant', content: SUMMARY + ol.resumeMark() }, { role: 'user', content: 'كمل' }];
    const r = await run(hist, (b, n) => (n === 1 ? R.read('js/app-13-stocks-init.js') : R.text('رفعت التعديل.')));
    const first = r.calls[0].body;
    assert.ok(lastUserText(first).includes(ol.RESUME_NOTE), 'التنبيه وصل: ' + lastUserText(first).slice(0, 300));
    assert.ok(Array.isArray(first.tools) && first.tools.some((t) => t.name === 'read_github'), 'الأدوات حاضرة');
    assert.equal(first.tool_choice, undefined);
  });
});

test('٣. دور الإكمال ختم بنصّ بلا أداة واحدة (ما حدث في اللقطة) ← يُعاد للحلقة مرّة بتنبيه «نفّذ الآن»', async () => {
  await withEnv(async () => {
    const hist = [{ role: 'user', content: ASK }, { role: 'assistant', content: SUMMARY + ol.resumeMark() }, { role: 'user', content: 'كمّل' }];
    const r = await run(hist, (b, n) => (n === 1 ? R.text('هذي بطاقات الأزياء… تحقّقت من اللقطة فقط؛ ما تغيّر شي في التطبيق.') : n === 2 ? R.read('js/app-13-stocks-init.js') : R.text('تمّ.')));
    assert.ok(r.calls.length >= 2, 'أُعيد للحلقة');
    assert.ok(JSON.stringify(r.calls[1].body.input).includes(CARRY_NOTE.slice(0, 60)), 'تنبيه التنفيذ في الجولة الثانية');
    assert.equal(toolLog.length, 1, 'نفّذ بأداة بعد التنبيه');
  });
});

test('٤. لا تنبيه بلا سببه: «كمل» بعد ردّ عاديّ، أو طلب جديد بعد ردّ قطعته الميزانيّة، أو دور عاديّ بلا ختام', async () => {
  await withEnv(async () => {
    let r = await run([{ role: 'user', content: ASK }, { role: 'assistant', content: 'جواب كامل.' }, { role: 'user', content: 'كمل' }], () => R.text('تمام.'));
    assert.ok(!lastUserText(r.calls[0].body).includes(ol.RESUME_NOTE), 'ردّ عاديّ قبلها');
    r = await run([{ role: 'user', content: ASK }, { role: 'assistant', content: SUMMARY + ol.resumeMark() }, { role: 'user', content: 'اشرح لي ملفّ الأزياء' }], () => R.text('شرح.'));
    assert.ok(!lastUserText(r.calls[0].body).includes(ol.RESUME_NOTE), 'طلب جديد');
    r = await run([{ role: 'user', content: 'السلام عليكم' }], () => R.text('وعليكم السلام'));
    assert.equal(r.text, 'وعليكم السلام', 'لا سطر إكمال في دور انتهى بنفسه');
  });
});

test('٥. كلمات الإكمال: الصيغ الخليجيّة القصيرة وحدها، لا جملة فيها طلب آخر', () => {
  for (const t of ['كمل', 'كمّل', 'اكمل', 'أكمل', 'كملها', 'كمّلها', 'تابع', 'واصل', 'يلا كمل', 'طيب كمل', 'كمل الشغل', 'كمل المهمه', 'كمل التعديل', 'كمل التعديلات', 'كمل من حيث وقف', 'كمل.', 'continue', 'كمل\n\n[مرفقات: a.png]']) assert.ok(ol.isResume(t), t);
  for (const t of ['كمل الصورة بالأزرق وغيّر الخلفية', 'شو صار؟', 'اكمل قراءة الكتاب لي من الصفحة ٣', '']) assert.ok(!ol.isResume(t), t);
});

test('٦. لا سطر إكمال إن رُفع تعديل في الدور، وسبب الخروج بالمهلة يحمله أيضًا', () => {
  const src = fs.readFileSync(path.join(root, 'api/_lib/chat.js'), 'utf8');
  assert.ok(src.includes('if (__ownerReq && __olS.nudged && !__ownerOps.prs) { const __rm = __ol.resumeMark(); send({ delta: __rm }); fullText += __rm; }'), 'الشرط: ختام بالتنبيه وبلا رفعة ناجحة (v-turn-close: المحاولة الفاشلة لا تُعدّ)');
  assert.ok(/انتهت مهلة الردّ \(240 ث\) قبل الجواب النهائيّ/.test(ol.exitText({ t0: Date.now() - 300000, MAX_MS: 240000, MAX_STEPS: 12, steps: 5 })));
  assert.ok(ol.exitText({ t0: Date.now(), MAX_MS: 240000, MAX_STEPS: 12, steps: 12 }).includes(ol.RESUME_KEY));
  assert.ok(ol.FINAL_NOTE.startsWith('[تنبيه النظام — ليس من المالك]: انتهت ميزانيّة الأدوات'), 'بداية التنبيه كما كانت');
  assert.ok(/ما بقي/.test(ol.FINAL_NOTE), 'الختام يطلب ما بقي بالتحديد كي يكمل منه الدور التالي');
});

test('٧. ختام طلب التعديل: أداة edit_github تُنفَّذ (كانت تُرفض في afterStream)، ولا سبب توقّف بعد الرفعة', async () => {
  await withEnv(async () => {
    edits.length = 0;
    const r = await run([{ role: 'user', content: ASK }], (b) => (lastUserText(b).includes('نفّذ التعديل الآن') ? R.call('edit_github', EDIT) : R.read('js/app-13-stocks-init.js')));
    assert.equal(edits.length, 1, 'نُفّذ التعديل في خطوة الختام');
    assert.ok(!r.events.some((e) => e.ownerStop), 'رفعة = لا «انتهت الميزانيّة»');
    assert.ok(r.text.includes('أدمج وأنشر؟'), 'السؤال بعد الرفعة: ' + r.text);
  });
});

test('٨. إعادة الطلب نفسه بعد سطر «كمل» تحمل تنبيه الإكمال (ثلاث محاولات كانت تصل بلاه)', async () => {
  await withEnv(async () => {
    const hist = [{ role: 'user', content: ASK }, { role: 'assistant', content: SUMMARY + ol.resumeMark() }, { role: 'user', content: ASK }];
    const r = await run(hist, (b, n) => (n === 1 ? R.read('js/app-13-stocks-init.js') : R.text('رفعت التعديل.')));
    assert.ok(lastUserText(r.calls[0].body).includes(ol.RESUME_NOTE), 'التنبيه مع إعادة الطلب: ' + lastUserText(r.calls[0].body).slice(0, 300));
  });
});

test('٩. beginStep/shape/afterStream: طلب تعديل يُبقي الأدوات ويُنفِّذها؛ السؤال يبقى tool_choice none', () => {
  const convo = [{ role: 'user', content: [{ type: 'text', text: 'x' }] }];
  const s = ol.state(true);
  ol.beginStep(s, { steps: 12, MAX_STEPS: 12, t0: Date.now(), MAX_MS: 240000, convo, tools: true, editAsk: true, pushed: false });
  assert.equal(s.editClose, true);
  assert.ok(convo[0].content.some((c) => c.text === ol.FINAL_EDIT_NOTE), 'تنبيه التنفيذ');
  assert.equal(ol.shape({ tools: [{ name: 'edit_github' }] }, s, true).tool_choice, undefined, 'لا none');
  assert.equal(ol.afterStream(s, { stopReason: 'tool_use', blocks: [{ type: 'tool_use', name: 'edit_github' }], steps: 12, MAX_STEPS: 12, t0: Date.now(), MAX_MS: 240000 }), null, 'الأداة تُنفَّذ');
  const q = [{ role: 'user', content: [{ type: 'text', text: 'q' }] }];
  const s2 = ol.state(true);
  ol.beginStep(s2, { steps: 12, MAX_STEPS: 12, t0: Date.now(), MAX_MS: 240000, convo: q, tools: true, editAsk: false, pushed: false });
  assert.equal(s2.editClose, false);
  assert.equal(ol.shape({ tools: [{ name: 'read_github' }] }, s2, true).tool_choice.type, 'none');
  assert.equal(ol.afterStream(s2, { stopReason: 'tool_use', blocks: [{ type: 'tool_use' }], steps: 12, MAX_STEPS: 12, t0: Date.now(), MAX_MS: 240000 }).kind, 'stop');
});
