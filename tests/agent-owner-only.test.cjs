'use strict';
/* v-agent-owner-only (تدقيق المال ١١ أكتوبر): الواجهة تخفي الوكيل عن غير المالك، والخادم كان يفحص الباقة وحدها — فالمشترك يأخذ
   تشغيلًا كاملًا (حتّى ٣٠ نداء نموذج بجهد عالٍ + بحث ويب) بحصّة رسالة واحدة، وVIP بلا سقف. الآن /api/ai?action=agent للمالك وحده
   (ownerList: المدمج + أسماء البيئة) من الرمز الموقَّع وحده — قبل checkAndConsume والدفتر وأيّ fetch، وفي مسار الاستئناف runState.
   /api/agent-tool-result لا يُبوَّب: المحادثة الرئيسيّة تستعمله لكلّ مستخدم، والضيف أيضًا.
   المعالج الحقيقيّ وauth/_usage/tier الحقيقيّة؛ Redis وقائمة VIP والشبكة وحدها محاكاة. كلّ الطلبات من عنوان IP واحد (مكتب واحد). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.OWNER_AGENT_CLAUDE = 'on'; // v-agent-claude-off: الاختبار يفحص الوكيل وهو شغّال
process.env.AUTH_SECRET = 'agent-owner-only-test-secret-' + 'q'.repeat(24);
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.TAVILY_API_KEY = 'test-tavily-key';
process.env.OWNER_USERNAMES = 'omran2'; // مالك من البيئة: يثبت أنّ البوّابة تقرأ ownerList لا اسمًا مكتوبًا
delete process.env.OWNER_USERNAME;
for (const k of ['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'GROQ_API_KEY']) delete process.env[k];

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

// Redis في الذاكرة — وكلّ نداء له يُسجَّل، فيُثبت أنّ الرفض لا يلمس KV أصلًا (لا سلّة IP ولا حصّة ولا دفتر).
const store = new Map();
const kvCalls = [];
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return store.get(k); } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async () => [],
  kvPipeline: async (c) => c.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, {
  get: (t, p) => {
    if (typeof p !== 'string' || p === 'then' || p === '__esModule') return undefined;
    const f = t[p] || (async () => null);
    return (...a) => { kvCalls.push(p + ' ' + String(a[0])); return f(...a); };
  },
}));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
const VIPS = new Set(['vipguy']);
mock('api/_lib/_vip.js', { isVip: async (u) => VIPS.has(String(u || '').toLowerCase()) });
mock('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });

const auth = require(rp('api/_lib/auth.js'));
const usage = require(rp('api/_lib/_usage.js'));
const tier = require(rp('api/_lib/tier.js'));
const agent = require(rp('api/_lib/agent.js'));
const toolResult = require(rp('api/_lib/agent-tool-result.js'));

const OFFICE_IP = '203.0.113.7';
const MSGS = [{ role: 'user', content: 'ابحث لي عن أسعار الذهب' }];
const sse = (evs) => new Response(evs.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const answer = () => sse([
  { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تمّ' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
]);

function expiredToken(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() - 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}

async function hit(body) {
  const calls = { anthropic: [], tavily: 0, other: [] };
  kvCalls.length = 0;
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/api\.anthropic\.com\/v1\/messages/.test(u)) { calls.anthropic.push(JSON.parse(init.body)); return answer(); }
    if (/api\.tavily\.com/.test(u)) { calls.tavily++; return new Response(JSON.stringify({ results: [] }), { status: 200 }); }
    calls.other.push(u);
    return new Response('{}', { status: 404 });
  };
  const r = { code: 0, body: null, out: '', setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; },
    write(c) { this.out += String(c || ''); return true; }, end() {}, flush() {}, flushHeaders() {} };
  try {
    await agent({ method: 'POST', headers: { 'x-forwarded-for': OFFICE_IP, host: 'x' }, query: { action: 'agent' }, body }, r);
  } finally { global.fetch = save; }
  const events = r.out.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { code: r.code, body: r.body, events, calls, kv: kvCalls.slice() };
}

function assertRefused(r, code, label) {
  assert.equal(r.code, code, label + ': الرمز');
  assert.equal(r.calls.anthropic.length, 0, label + ': لا نداء نموذج');
  assert.equal(r.calls.tavily, 0, label + ': لا بحث ويب');
  assert.deepEqual(r.calls.other, [], label + ': لا fetch آخر');
  assert.deepEqual(r.kv, [], label + ': لا لمس لـKV (لا حصّة ولا سلّة IP ولا دفتر)');
  assert.equal(r.events.length, 0, label + ': لا بثّ');
}

const NOW = Date.now();
test.before(async () => {
  await auth.putUser('sara', { username: 'sara', createdAt: NOW - 86400000 * 10, plan: 'basic', planUpdatedAt: NOW });
  await auth.putUser('free1', { username: 'free1', createdAt: NOW - 86400000 * 10 });
  await auth.putUser('vipguy', { username: 'vipguy', createdAt: NOW - 86400000 * 10 });
});

test('١. الضيف (بلا رمز): ٤٠١ بنصّ الجلسة القائم — لا نموذج ولا سلّة guestip_', async () => {
  const r = await hit({ messages: MSGS, guestId: 'guest123456' });
  assertRefused(r, 401, 'ضيف');
  assert.match(r.body.error, /الجلسة/);
  assert.ok(![...store.keys()].some((k) => k.startsWith('guestip_')), 'لا سلّة IP للمكتب');
});

test('٢. حساب مجّانيّ: ٤٠٣ owner_only بلا أيّ عدّ', async () => {
  const r = await hit({ messages: MSGS, token: auth.makeToken('free1') });
  assertRefused(r, 403, 'مجّانيّ');
  assert.deepEqual(r.body, { error: 'owner_only' });
  assert.equal(await usage.todayCount('free1', 'chat'), 0);
});

test('٣. مشترك (basic): ٤٠٣ owner_only — حصّة الباقة لا تُمسّ ولا نداء نموذج', async () => {
  assert.equal((await tier.resolveTier('sara', { noCache: true })).subscriber, true, 'الإعداد: سارة مشتركة فعلًا');
  const r = await hit({ messages: MSGS, token: auth.makeToken('sara') });
  assertRefused(r, 403, 'مشترك');
  assert.deepEqual(r.body, { error: 'owner_only' });
  assert.equal(await usage.todayCount('sara', 'plan'), 0, 'سلّة plan كما هي');
});

test('٤. VIP: ٤٠٣ owner_only — كان بلا سقف', async () => {
  assert.equal((await tier.resolveTier('vipguy', { noCache: true })).tier, 'vip', 'الإعداد: VIP فعلًا');
  const r = await hit({ messages: MSGS, token: auth.makeToken('vipguy') });
  assertRefused(r, 403, 'VIP');
  assert.deepEqual(r.body, { error: 'owner_only' });
});

test('٥. المالك المدمج (omran): المسار كما هو — بثّ ٢٠٠، xhigh و٦٤ ألفًا، ختام done، ودفتره يُكتب', async () => {
  store.delete('db/agentrun/omran.json');
  const r = await hit({ messages: MSGS, token: auth.makeToken('omran') });
  assert.equal(r.code, 200);
  assert.equal(r.body, null, 'بثّ لا JSON');
  assert.ok(r.calls.anthropic.length >= 1, 'نداء النموذج حاصل');
  assert.deepEqual(r.calls.anthropic[0].output_config, { effort: 'xhigh' });
  assert.equal(r.calls.anthropic[0].max_tokens, 64000);
  assert.ok(r.events.some((e) => e.done === true), 'ختام done');
  assert.ok(r.events.some((e) => e.delta === 'تمّ'), 'الردّ يصل');
  assert.ok(store.has('db/agentrun/omran.json'), 'الدفتر مكتوب');
});

test('٦. مالك من البيئة (OWNER_USERNAMES=omran2): ٢٠٠ — البوّابة تقرأ ownerList', async () => {
  const r = await hit({ messages: MSGS, token: auth.makeToken('omran2') });
  assert.equal(r.code, 200);
  assert.ok(r.calls.anthropic.length >= 1);
  assert.ok(r.events.some((e) => e.done === true));
});

test('٧. رمز المالك منتهٍ أو مزوَّر: ٤٠١ بنصّ الجلسة — لا رسالة «حدّ الباقة» المضلّلة', async () => {
  const exp = await hit({ messages: MSGS, token: expiredToken('omran') });
  assertRefused(exp, 401, 'منتهٍ');
  assert.match(exp.body.error, /الجلسة/);
  const good = auth.makeToken('omran');
  const forged = good.slice(0, good.lastIndexOf('.') + 1) + 'x'.repeat(43);
  const fr = await hit({ messages: MSGS, token: forged });
  assertRefused(fr, 401, 'مزوَّر');
});

test('٧ب. المالك بلا رسائل: ٤٠٠ كما كان؛ وغير المالك بلا رسائل: ٤٠٣ (البوّابة قبل فحص الرسائل)', async () => {
  const o = await hit({ token: auth.makeToken('omran') });
  assert.equal(o.code, 400);
  assert.deepEqual(o.body, { error: 'Missing messages' });
  const s = await hit({ token: auth.makeToken('sara') });
  assertRefused(s, 403, 'مشترك بلا رسائل');
});

test('٨. runState: بلا رمز ٤٠١ auth_required؛ غير المالك ٤٠٣ ولا دفتر يعود؛ المالك دفتره', async () => {
  store.set('db/agentrun/sara.json', JSON.stringify({ runId: 'rsara', text: 'سرّ سارة' }));
  store.set('db/agentrun/omran.json', JSON.stringify({ runId: 'romran', text: 'عمل المالك' }));
  const none = await hit({ runState: true });
  assert.equal(none.code, 401);
  assert.deepEqual(none.body, { error: 'auth_required' });
  const sara = await hit({ runState: true, token: auth.makeToken('sara') });
  assertRefused(sara, 403, 'runState غير المالك');
  assert.deepEqual(sara.body, { error: 'owner_only' }, 'لا run في الردّ');
  const own = await hit({ runState: true, token: auth.makeToken('omran') });
  assert.equal(own.code, 200);
  assert.equal(own.body.run.runId, 'romran');
});

test('٩. /api/agent-tool-result مفتوح كما هو (المحادثة تستعمله للجميع، والضيف بلا رمز)', async () => {
  const call = async (body) => {
    const r = { code: 0, body: null, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, setHeader() {}, end() {} };
    await toolResult({ method: 'POST', headers: {}, body }, r);
    return r;
  };
  store.set('agent/wait/c123abc', JSON.stringify({ at: Date.now() }));
  const ok = await call({ id: 'c123abc', output: '{"lat":24.4}' });
  assert.equal(ok.code, 200);
  assert.deepEqual(ok.body, { ok: true });
  assert.ok(store.has('agent/tool/c123abc'), 'الناتج مكتوب لنداء الخادم المنتظر');
  const unknown = await call({ id: 'c999zzz', output: 'x' });
  assert.equal(unknown.code, 403);
  assert.deepEqual(unknown.body, { error: 'no pending call' });
});

test('١٠. الترتيب في المصدر: isOwner(caller) قبل checkAndConsume، وisOwner(who) داخل كتلة runState', () => {
  const src = fs.readFileSync(rp('api/_lib/agent.js'), 'utf8');
  const gate = src.indexOf('if (!isOwner(caller))');
  const quota = src.indexOf("checkAndConsume(token, guestId, 'agent'");
  const journalCall = src.indexOf('await journal(runUser, run)');
  assert.ok(gate > 0 && quota > 0 && gate < quota, 'البوّابة قبل الحصّة');
  assert.ok(gate < journalCall, 'البوّابة قبل الدفتر');
  const rs = src.indexOf('if (body.runState) {');
  const rsEnd = src.indexOf('\n  }\n', rs);
  const inRs = src.indexOf('if (!isOwner(who))', rs);
  assert.ok(rs > 0 && inRs > rs && inRs < rsEnd, 'بوّابة runState داخل كتلتها');
  assert.ok(rsEnd < gate, 'كتلة runState قبل البوّابة الرئيسيّة');
});
