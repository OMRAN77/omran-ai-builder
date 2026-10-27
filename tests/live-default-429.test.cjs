'use strict';
/* v-live-default + v-direct-429 (لقطتا المالك ١٥ أكتوبر: Cohere «ما قدرت أردّ الحين — خطأ 404» وPerplexity «خطأ 429» على طلب الكود
   نفسه، وطلبه «أريد أن أنسى موضوع هذه الأخطاء»):
   - 404: الافتراضيّ الثابت cohere/command-a لم يعد عند الوسيط. الآن رفض الوسيط للافتراضيّ = أحدث موديل بأدوات لشركته من القائمة الحيّة،
     إعادة واحدة، سطر حالة، ويُذكر للرسائل التالية (بلا جولة 404 ثانية). المختار يدويًّا على مساره القديم.
   - 429: الانتظار كان لـGroq وحده. الآن كلّ مزوّد مباشر على المسارين: موعد قصير من Retry-After أو نصّ الجسم يُنتظر مرّة داخل النداء؛
     بلا موعد = طبقة C4 (owner-loop) تعيد بانتظار ١٫٥ ث ثمّ ٤ ث؛ نصّ عن الرصيد لا يُنتظر عليه؛ وبلا موعد الرسالة بالعربيّ لا «خطأ 429». */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'live-default-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-direct';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
for (const k of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'COHERE_API_KEY', 'CHAT_IMAGE_MODEL', 'PERPLEXITY_API_KEY']) delete process.env[k];

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
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', todayCount: async () => 0, bumpCount: async () => {}, checkAndConsume: async () => ({ allowed: true, username: usageUser, tier: usageUser === 'omran' ? 'owner' : 'vip', subscriber: true }) });
stub('api/_lib/_vip.js', { isVip: async (u) => u === 'vipuser' });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
stub('api/_lib/_owner-alert.js', { alertOwnerCredit: async () => {}, alertOwnerError: async () => {}, isCreditFailure: () => false });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const chat = require(rp('api/_lib/chat.js'));
const PM = require(rp('api/_lib/provider-models.js'));
const OD = require(rp('api/_lib/oa-direct.js'));

function token(u) { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); }
const sse = (text) => new Response([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
].map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
async function run(user, body, route) {
  usageUser = user;
  const calls = [], out = [];
  const save = global.fetch;
  global.fetch = async (url, init) => { let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = null; } calls.push({ url: String(url), body: b }); return route(String(url), b, calls); };
  const req = { method: 'POST', headers: {}, body: Object.assign({ token: token(user) }, body) };
  const res = { setHeader() {}, status() { return this; }, json(v) { out.push(JSON.stringify(v)); return this; }, write(c) { out.push(String(c)); return true; }, end() {}, flushHeaders() {} };
  try { await chat(req, res); } finally { global.fetch = save; }
  const events = out.join('').split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return {}; } });
  return { calls, events, text: events.map((e) => e.delta || '').join(''), errors: events.filter((e) => e.error).map((e) => e.error), statuses: events.filter((e) => e.status).map((e) => e.status) };
}
const isOR = (u) => /openrouter\.ai\/api\/v1\/messages/.test(u);
const isORModels = (u) => /openrouter\.ai\/api\/v1\/models/.test(u);
const orModels = (calls) => calls.filter((c) => isOR(c.url)).map((c) => c.body && c.body.model);
const ask = (q) => [{ role: 'user', content: q }];
const noEndpoints = (m) => new Response(JSON.stringify({ error: { message: 'No endpoints found for ' + m + '.', code: 404 } }), { status: 404 });
const LIVE = { data: [
  { id: 'cohere/command-a', name: 'Cohere: Command A', created: 1700000000, supported_parameters: ['tools'], architecture: { output_modalities: ['text'] } },
  { id: 'cohere/command-b-pro', name: 'Cohere: Command B Pro', created: 1760000000, supported_parameters: ['tools', 'temperature'], architecture: { output_modalities: ['text'] } },
  { id: 'cohere/command-r7b-lite', name: 'Cohere: Command R7B', created: 1770000000, supported_parameters: ['temperature'], architecture: { output_modalities: ['text'] } },
] };

test('١. v-live-default: Cohere الافتراضيّ 404 عند الوسيط → أحدث موديل بأدوات لشركته من القائمة الحيّة، الردّ يصل، سطر حالة؛ والرسالة التالية تبدأ به بلا 404', async () => {
  const route = (u, b) => isORModels(u) ? new Response(JSON.stringify(LIVE), { status: 200 }) : isOR(u) ? (b.model === 'cohere/command-a' ? noEndpoints(b.model) : sse('من كوهير')) : new Response('{}', { status: 404 });
  const r = await run('omran', { provider: 'cohere', messages: ask('الأرضيات في الديكور تقدر تعدل التطبيق') }, route);
  assert.deepEqual(orModels(r.calls), ['cohere/command-a', 'cohere/command-b-pro'], 'الافتراضيّ ثمّ الأحدث بأدوات (لا r7b بلا أدوات)');
  assert.equal(r.text, 'من كوهير');
  assert.deepEqual(r.errors, [], 'لا «خطأ 404»');
  assert.ok(r.statuses.some((s) => /الموديل الافتراضيّ cohere\/command-a لم يعد عند الوسيط — أكمل بأحدث موديل لشركته: cohere\/command-b-pro/.test(s)), r.statuses.join(' | '));
  assert.equal(PM.liveDefaultOf('cohere'), 'cohere/command-b-pro', 'يُذكر في الذاكرة الدافئة');
  const r2 = await run('omran', { provider: 'cohere', messages: ask('كمّل') }, route);
  assert.deepEqual(orModels(r2.calls), ['cohere/command-b-pro'], 'الرسالة التالية تبدأ بالحيّ بلا جولة 404');
  assert.equal(r2.text, 'من كوهير');
  delete PM.__live.cohere;
});

test('٢. v-live-default: بلا قائمة حيّة (الوسيط لا يردّ) يبقى الفشل كما كان للمالك؛ وموديل اختاره بيده له مساره القديم لا هذا', async () => {
  PM.__resetCache(); db.clear(); // القائمة الحيّة من الاختبار السابق في الذاكرة الدافئة وKV
  const r = await run('omran', { provider: 'cohere', messages: ask('سؤال') }, (u, b) => isORModels(u) ? new Response('x', { status: 500 }) : isOR(u) ? noEndpoints(b.model) : new Response('{}', { status: 404 }));
  assert.deepEqual(orModels(r.calls), ['cohere/command-a'], 'نداء واحد — لا بديل');
  assert.equal(r.text, '');
  assert.ok(r.events.some((e) => e.ownerStop === true), 'رسالة الفشل كما كانت');
  assert.equal(PM.liveDefaultOf('cohere'), '');
  assert.equal(await PM.liveDefault('openrouter', 'x', { noKv: true }), '', 'المزوّد العامّ بلا شركة واحدة = لا بديل');
});

test('٣. v-direct-429: المسار المباشر ينتظر موعد Retry-After القصير ويعيد مرّة (Perplexity responses وchat/completions)؛ الرصيد وبلا موعد لا يُنتظران داخل النداء؛ وC4 أطول', async () => {
  {
    const AB = { model: 'perplexity/sonar', max_tokens: 100, system: 's', messages: [{ role: 'user', content: 'x' }] };
    const route = OD.directRoute('perplexity', { PERPLEXITY_API_KEY: 'pk' });
    const ok = () => new Response('data: ' + JSON.stringify({ type: 'response.created', response: { model: 'perplexity/sonar' } }) + '\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    let n = 0; const t0 = Date.now();
    const r = await OD.directFetch(route, AB, { fetchImpl: async () => (++n === 1 ? new Response('{"error":{"message":"Too many requests"}}', { status: 429, headers: { 'Retry-After': '0.2' } }) : ok()) });
    assert.equal(r.ok, true); assert.equal(n, 2, 'إعادة واحدة بعد الانتظار'); assert.ok(Date.now() - t0 >= 200, 'انتظر ما قاله Retry-After');
    n = 0;
    const credit = await OD.directFetch(route, AB, { fetchImpl: async () => { n++; return new Response('{"error":{"message":"quota exceeded"}}', { status: 429 }); } });
    assert.equal(credit.status, 429); assert.equal(n, 1, 'الرصيد/الحصّة ليس عابرًا — لا انتظار');
    n = 0;
    const dry = await OD.directFetch(route, AB, { fetchImpl: async () => { n++; return new Response('{"error":{"message":"Too many requests"}}', { status: 429 }); } });
    assert.equal(dry.status, 429); assert.equal(n, 1, 'بلا موعد: لا انتظار داخل النداء — C4 في owner-loop يعيد بانتظاره');
    n = 0;
    const far = await OD.directFetch(route, AB, { fetchImpl: async () => { n++; return new Response('{"error":{"message":"Too many requests"}}', { status: 429, headers: { 'Retry-After': '120' } }); } });
    assert.equal(far.status, 429); assert.equal(n, 1, 'موعد أبعد من الحدّ: لا نوم — يصل المالك سطرًا');
    // chat/completions (Kimi مباشر) بالآليّة نفسها
    const kr = OD.directRoute('kimi', { KIMI_API_KEY: 'kk' });
    n = 0;
    const k = await OD.directFetch(kr, { model: 'kimi-k3', max_tokens: 100, system: 's', messages: [{ role: 'user', content: 'x' }] }, { fetchImpl: async () => (++n === 1 ? new Response('{"error":{"message":"rate limit"}}', { status: 429, headers: { 'Retry-After': '0.1' } }) : new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'هلا' } }] }) + '\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })) });
    assert.equal(k.ok, true); assert.equal(n, 2);
  }
  assert.equal(OD.__cfg.waitMax, OD.GROQ_WAIT_MAX);
  assert.match(require('node:fs').readFileSync(require('node:path').join(root, 'api/_lib/owner-loop.js'), 'utf8'), /const wait = ra != null \? ra : \[1500, 4000\]\[i\];/, 'C4 بلا موعد: ١٫٥ ث ثمّ ٤ ث');
  assert.equal(OD.retryAfterOf(new Headers({ 'retry-after': '7' }), ''), 7);
  assert.equal(OD.retryAfterOf(null, 'Please try again in 25.7s.'), 25.7, 'نصّ Groq كما كان');
  assert.equal(OD.retryAfterOf(null, '{"retry_after": 12}'), 12);
  assert.equal(OD.retryAfterOf(null, 'Too many requests'), null);
  assert.equal(OD.wait429Ms(null, 'try again in 13m', 0), 0, 'موعد أبعد من الحدّ = لا انتظار (كما كان لـGroq اليوميّ)');
  const { ownerStopNote } = chat.__imgWhy;
  assert.equal(ownerStopNote({ status: 429, text: 'Too many requests' }), 'ما قدرت أردّ الحين — المزوّد وصل حدّ الطلبات (429) حتّى بعد الانتظار؛ جرّب بعد دقيقة');
  assert.equal(ownerStopNote({ status: 429, text: 'try again in 25s' }), 'ما قدرت أردّ الحين — وصلت حدّ المفتاح؛ جرّب بعد 25 ثانية');
  assert.equal(ownerStopNote({ status: 429, text: 'quota exceeded' }), 'ما عندي رصيد');
});
