'use strict';
/* v-owner-cap-open (أمر المالك ١٢ أكتوبر: «اريدك تعطي المزودين تفتح لهم التوكن أكثر ماهم عليه الآن — عندي الحين فقط ٤٠٠ سطر —
   اريد مفتوح بدون مايوقف كل المزودين»): سقف خرج المالك ١٢٨ ألف توكن (أقصى الجيل ٥ من كلود وGPT) على كلّ المسارات (كلود المباشر، الوسيط، Groq/OpenAI المباشر)
   بدل ١٦ ألفًا (≈ ٤٠٠ سطر)، ويغلب سقوف الجهد (٣٢ ألفًا لـGPT high).    رفض السقف الكبير (402 حجز رصيد أو 400 حدّ الموديل) =
   إعادة بسقف أدنى تُذكَر لبقيّة الدور: 402 ← حدّ الرصيد من الرسالة (سقف ١٦ ألفًا) على الوسيط والمباشر وبعد هبوط GPT،
   و400 ← حدّ الموديل من نصّ الرسالة (وبلا رقم ٦٤ ألفًا ثمّ العاديّ). غير المالك ١٦ ألفًا والتحيّة ٣٥٠ كما كانا. المعالج الحقيقيّ أمام مزوّد مزيّف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.OWNER_CLAUDE_CHAT = 'on'; // v-claude-chat-off: ردّ Claude للمالك موقوف افتراضيًّا — هذا الاختبار يفحص مساره حين يُعاد تشغيله
process.env.AUTH_SECRET = 'owner-cap-open-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'CHAT_OPENAI_MODEL', 'CHAT_GROQ_MODEL', 'CHAT_CLAUDE_MODEL', 'CHAT_IMAGE_MODEL', 'CHAT_IMAGE_EFFORT', 'KIMI_API_KEY', 'MOONSHOT_API_KEY']) delete process.env[k];

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
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const le = require(rp('api/_lib/log-error.js'));
le.logErrorAndFlush = async () => {}; le.logError = () => {};
const chat = require(rp('api/_lib/chat.js'));
const ot = require(rp('api/_lib/owner-think.js'));
const OL = require(rp('api/_lib/owner-loop.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (chunks) => new Response(chunks.map((c) => 'data: ' + (typeof c === 'string' ? c : JSON.stringify(c)) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const anth = (t, stop) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: stop || 'end_turn' }, usage: { output_tokens: 1 } },
]);
const groqOk = (t) => sse([{ model: 'm', choices: [{ delta: { content: t } }] }, { model: 'm', choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]']);
const oaResp = (t) => new Response([
  { type: 'response.created', response: { model: 'gpt-6-astra' } },
  { type: 'response.output_text.delta', output_index: 0, delta: t },
  { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 2 } } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200 });
const or402 = () => new Response(JSON.stringify({ error: { message: 'This request requires more credits, or fewer max_tokens. You requested up to 128000 tokens, but can only afford 9000.', code: 402 } }), { status: 402 });
const anth400cap = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: 128000 > 32000, which is the maximum allowed number of output tokens for this model' } }), { status: 400 });
const ask = (t) => [{ role: 'user', content: t }];
const HARD = 'اكتب لي صفحة HTML كاملة لمتجر إلكترونيّ بكلّ الأقسام';

function reset() { ot.__deadEffort.clear(); chat.__orQuick.level = 2; for (const k of [...db.keys()]) if (/deadpick/.test(k)) db.delete(k); if (OL.__deadPicks && OL.__deadPicks.clear) OL.__deadPicks.clear(); }
async function run(user, extra, script) {
  usageUser = user;
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, options) => {
    const u = String(url);
    let b = null; try { b = JSON.parse(options.body); } catch (e) { b = null; }
    calls.push({ url: u, body: b });
    const step = script ? script[Math.min(i++, script.length - 1)] : null;
    if (step) return step();
    if (/api\.groq\.com/.test(u)) return groqOk('تم');
    if (/api\.openai\.com/.test(u)) return oaResp('تم');
    if (/openrouter\.ai|api\.anthropic\.com/.test(u)) return anth('تم');
    return new Response('{}', { status: 404 });
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user), provider: 'claude' }, extra) };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events, text: events.map((e) => e.delta || '').join(''), statuses: events.map((e) => e.status || '').filter(Boolean) };
}
const withoutAnth = async (fn) => { const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; try { return await fn(); } finally { process.env.ANTHROPIC_API_KEY = k; } };
const withEnv = (k, v) => async (fn) => { process.env[k] = v; try { return await fn(); } finally { delete process.env[k]; } };
const up = (r) => r.calls.filter((c) => /anthropic\.com|openrouter\.ai|groq\.com|openai\.com/.test(c.url));

test('١. المالك: ١٢٨ ألفًا على كلود المباشر وعلى الوسيط، للصعب وللتحيّة سواء، وبلا جهد مختار', async () => {
  reset();
  let r = await run('omran', { messages: ask(HARD) });
  assert.equal(up(r)[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(up(r)[0].body.max_tokens, 128000);
  r = await run('omran', { messages: ask('السلام عليكم') });
  assert.equal(up(r)[0].body.max_tokens, 128000, 'تحيّة المالك ليست دورًا صامتًا');
  r = await withoutAnth(() => run('omran', { messages: ask(HARD) }));
  assert.equal(up(r)[0].url, 'https://openrouter.ai/api/v1/messages');
  assert.equal(up(r)[0].body.max_tokens, 128000);
  r = await withoutAnth(() => run('omran', { model: 'claude-opus-4-8', messages: ask(HARD), effort: 'high' }));
  assert.equal(up(r)[0].body.max_tokens, 128000, 'الجهد لا يُنزل السقف');
  assert.equal(r.text, 'تم');
});

test('٢. غير المالك كما كان: ١٦ ألفًا للسؤال و٣٥٠ للتحيّة', async () => {
  reset();
  let r = await run('someone', { messages: ask(HARD) });
  assert.equal(up(r)[0].body.max_tokens, 16000);
  r = await run('someone', { messages: ask('السلام عليكم') });
  assert.equal(up(r)[0].body.max_tokens, 350);
});

test('٣. المسار المباشر: Groq يصله max_completion_tokens ١٢٨ ألفًا، وGPT يصله max_output_tokens ١٢٨ ألفًا حتّى بجهد high (كان ٣٢)', async () => {
  reset();
  let r = await withEnv('GROQ_API_KEY', 'gsk-test')(() => run('omran', { provider: 'groq', model: 'openai/gpt-oss-120b', messages: ask(HARD) }));
  const g = r.calls.filter((c) => /api\.groq\.com/.test(c.url));
  assert.equal(g.length, 1);
  assert.equal(g[0].body.max_completion_tokens, 128000);
  assert.equal(r.text, 'تم');
  r = await withEnv('OPENAI_API_KEY', 'sk-openai-test')(() => run('omran', { provider: 'openai', model: 'openai/gpt-6-astra', messages: ask(HARD), effort: 'high' }));
  const o = r.calls.filter((c) => /api\.openai\.com/.test(c.url));
  assert.equal(o[0].url, 'https://api.openai.com/v1/responses');
  assert.deepEqual(o[0].body.reasoning, { effort: 'high', summary: 'auto' });
  assert.equal(o[0].body.max_output_tokens, 128000);
  r = await withEnv('OPENAI_API_KEY', 'sk-openai-test')(() => run('omran', { provider: 'openai', model: 'openai/gpt-6-astra', messages: ask(HARD) }));
  assert.equal(r.calls.filter((c) => /api\.openai\.com/.test(c.url))[0].body.max_output_tokens, 128000, 'وبلا جهد');
});

test('٤. الوسيط 402 «can only afford 9000» بلا جهد = إعادة بحدّ الرصيد لا ١٦ ألفًا (١٦ كانت تفشل ثانيةً)، ويُذكَر: إكمال المقطوع يبقى على الحدّ', async () => {
  reset();
  const r = await withoutAnth(() => run('omran', { messages: ask(HARD) }, [or402, () => anth('الجزء الأوّل ', 'max_tokens'), () => anth('والثاني.')]));
  assert.deepEqual(up(r).map((c) => c.body.max_tokens), [128000, 9000, 9000]);
  assert.equal(r.statuses.filter((s) => /رصيد الوسيط لا يكفي/.test(s)).length, 1, 'سطر واحد في الدور كلّه');
  assert.equal(r.text, 'الجزء الأوّل والثاني.');
});

test('٥. كلود المباشر 400 «max_tokens: 128000 > 32000 … maximum allowed» = إعادة بحدّ الموديل من الرسالة (٣٢ ألفًا) بالموديل نفسه وسطر السبب', async () => {
  reset();
  const r = await run('omran', { model: 'claude-haiku-4-5', messages: ask(HARD) }, [anth400cap, () => anth('تم')]);
  assert.deepEqual(up(r).map((c) => [c.body.model, c.body.max_tokens]), [['claude-haiku-4-5', 128000], ['claude-haiku-4-5', 32000]]);
  assert.ok(r.statuses.some((s) => /لا يقبل سقف ١٢٨ ألف توكن — أكمل بسقفه ٣٢ ألف توكن/.test(s)), r.statuses.join(' | '));
  assert.ok(!r.events.some((e) => e.k === 'stModelFallback'), 'لا رجوع للافتراضيّ');
  assert.equal(r.text, 'تم');
});

test('٦. 402 بلا ذكر السقف (رصيد منتهٍ) لا يُعاد بالسقف العاديّ — يمرّ لسلسلة الرصيد كما كان', async () => {
  reset();
  const r = await withoutAnth(() => run('omran', { messages: ask(HARD) }, [() => new Response(JSON.stringify({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 } }), { status: 402 })]));
  assert.ok(up(r).every((c) => c.body.max_tokens === 128000), 'لا إعادة بسقف أدنى');
  assert.ok(!r.statuses.some((s) => /رصيد الوسيط لا يكفي حجز/.test(s)));
});

test('٧. 400 على السقف بلا رقم (الوسيط): ١٢٨ ← ٦٤ ← ١٦ ألفًا مرّتين كحدّ، والثالث يمرّ كما هو؛ ورقم أكبر من السقف يُهمَل', async () => {
  reset();
  const noNum = () => new Response(JSON.stringify({ error: { message: 'max_tokens exceeds the limit for this model', code: 400 } }), { status: 400 });
  let r = await withoutAnth(() => run('omran', { messages: ask(HARD) }, [noNum, noNum, () => anth('تم')]));
  assert.deepEqual(up(r).map((c) => c.body.max_tokens), [128000, 64000, 16000]);
  assert.equal(r.text, 'تم');
  r = await withoutAnth(() => run('omran', { messages: ask(HARD) }, [noNum, noNum, noNum, () => anth('تم')]));
  assert.deepEqual(up(r).slice(0, 3).map((c) => c.body.max_tokens), [128000, 64000, 16000], 'مرّتان كحدّ ثمّ لا إعادة بالسقف');
  assert.ok(!up(r).some((c) => c.body.max_tokens < 16000));
  const big = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: 128000 > 200000 context window 1000000' } }), { status: 400 });
  r = await run('omran', { messages: ask(HARD) }, [big, () => anth('تم')]);
  assert.deepEqual(up(r).slice(0, 2).map((c) => c.body.max_tokens), [128000, 64000], 'الأرقام الأكبر من السقف لا تُؤخذ حدًّا');
});

test('٨. GPT المباشر 402 «can only afford» = إعادة بحدّ الرصيد على OpenAI لا «ما عندي رصيد»', async () => {
  reset();
  const r = await withEnv('OPENAI_API_KEY', 'sk-openai-test')(() => run('omran', { provider: 'openai', model: 'openai/gpt-6-astra', messages: ask(HARD) }, [or402, () => oaResp('تم')]));
  const o = r.calls.filter((c) => /api\.openai\.com/.test(c.url));
  assert.deepEqual(o.map((c) => c.body.max_output_tokens), [128000, 9000]);
  assert.ok(r.statuses.some((s) => /حجز سقف ١٢٨ ألف توكن أكبر من المتاح/.test(s)), r.statuses.join(' | '));
  assert.ok(!r.events.some((e) => e.ownerStop && /ما عندي رصيد/.test(e.error || '')));
  assert.equal(r.text, 'تم');
});

test('٩. GPT المباشر يفشل ثمّ الوسيط 402 حجز السقف = إعادة بحدّ الرصيد لا «ما عندي رصيد»', async () => {
  reset();
  const oaFail = () => new Response(JSON.stringify({ error: { message: 'invalid_api_key' } }), { status: 401 });
  const r = await withEnv('OPENAI_API_KEY', 'sk-openai-test')(() => run('omran', { provider: 'openai', model: 'openai/gpt-6-astra', messages: ask(HARD) }, [oaFail, or402, () => anth('تم')]));
  const oa = r.calls.filter((c) => /api\.openai\.com/.test(c.url));
  const gw = r.calls.filter((c) => /openrouter\.ai/.test(c.url));
  assert.equal(oa.length, 1);
  assert.equal(oa[0].body.max_output_tokens, 128000);
  assert.deepEqual(gw.map((c) => c.body.max_tokens), [128000, 9000]);
  assert.ok(!r.events.some((e) => e.ownerStop && /ما عندي رصيد/.test(e.error || '')));
  assert.equal(r.text, 'تم');
});

test('١٠. 402 حجز السقف في ownerStopNote ليس «ما عندي رصيد»؛ نفاد الرصيد يبقى', () => {
  const { ownerStopNote } = chat.__imgWhy;
  assert.equal(ownerStopNote({ status: 402, text: 'You requested up to 128000 tokens, but can only afford 9000.' }), 'ما قدرت أردّ الحين — خطأ 402: You requested up to 128000 tokens, but can only afford 9000.'); // v-why: سبب المزوّد بعد الرقم
  assert.equal(ownerStopNote({ status: 402, text: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits' }), 'ما عندي رصيد');
  assert.equal(ownerStopNote({ status: 402, text: '' }), 'ما عندي رصيد');
  const src = require('node:fs').readFileSync(require('node:path').join(root, 'api/_lib/chat.js'), 'utf8');
  assert.ok(!src.includes('!__direct && __capTries'), 'إعادة السقف لم تعد تتخطّى المسار المباشر');
});
