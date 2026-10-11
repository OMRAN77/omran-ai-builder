// tests/token-counters.test.cjs — v-tokens-meter (التقييم ١١ أكتوبر: نسبة قراءة الكاش لا تُقاس في الإنتاج؛ حالات الصفر وجدها مسبار التدقيق وحده).
// القرار: عدّادات يوم × مسار × موديل (دخل، قراءة كاش، كتابة كاش، خرج، أدوار) في طلب Redis المجمّع نفسه الذي يسجّل التكلفة، وتقرير للمالك.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'token-counters-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.OWNER_USERNAMES = 'meter-owner';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CHAT_PROMPT_CACHE;
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const hashes = new Map(); // مفتاح ← {حقل: عدد}
const calls = []; // كلّ نداء kvPipeline
let failPipeline = false;
const kv = {
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvDel: async () => {}, kvExpire: async () => {},
  kvList: async (prefix) => [...hashes.keys()].filter((k) => k.startsWith(prefix)),
  kvPipeline: async (cmds) => {
    if (failPipeline) throw new Error('Upstash pipeline error: HTTP 500');
    calls.push(cmds);
    return cmds.map(([op, k, f, n]) => {
      if (op === 'HINCRBY') { const h = hashes.get(k) || {}; h[f] = (h[f] || 0) + Number(n); hashes.set(k, h); return h[f]; }
      if (op === 'HGETALL') { const h = hashes.get(k) || {}; return Object.entries(h).flatMap(([a, b]) => [a, String(b)]); }
      return 1;
    });
  },
};
stub('api/_lib/kv.js', kv);
let curUser = 'sub1';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: curUser }) });
stub('api/_lib/search.js', { fetchPlaces: async () => [] });
const cm = require(rp('api/_lib/cost-meter.js'));
const chat = require(rp('api/_lib/chat.js'));
const day = new Date().toISOString().slice(0, 10);
const month = day.slice(0, 7);

test('١. دور مدفوع ودور مجّانيّ: التكلفة والتوكنات في نداء kvPipeline واحد لكلّ دور، بمفتاح اليوم والمسار والموديل', async () => {
  calls.length = 0; hashes.clear();
  await cm.meterTurn('sub1', 0.002, 'chat', { lane: 'paid', model: 'claude-haiku-4-5', input: 300, cacheRead: 4700, cacheWrite: 50, output: 120 });
  await cm.meterTurn('free1', 0.0001, 'chat', { lane: 'free', model: 'openai/gpt-oss-120b', input: 6000, output: 90 });
  assert.equal(calls.length, 2, 'نداء واحد لكلّ دور');
  const ops = calls[0].map((c) => c[0] + ':' + c[1]);
  assert.ok(ops.includes('INCRBY:cost:' + month + ':sub1:chat'), 'التكلفة كما كانت');
  const pk = 'tok:' + day + ':paid:claude-haiku-4-5';
  assert.ok(ops.includes('HINCRBY:' + pk) && ops.includes('EXPIRE:' + pk), 'التوكنات في النداء نفسه بمدّة');
  assert.deepEqual(hashes.get(pk), { in: 300, cr: 4700, cw: 50, out: 120, turns: 1 });
  assert.deepEqual(hashes.get('tok:' + day + ':free:' + encodeURIComponent('openai/gpt-oss-120b')), { in: 6000, out: 90, turns: 1 });
  // المالك والزائر: توكنات بلا تكلفة
  await cm.meterTurn('', 0.5, 'chat', { lane: 'owner', model: 'claude-opus-5-5', input: 10, cacheRead: 900, output: 5 });
  assert.deepEqual(calls[2].map((c) => c[0]), ['HINCRBY', 'HINCRBY', 'HINCRBY', 'HINCRBY', 'EXPIRE']);
  // فشل Redis لا يرمي (القياس لا يوقف ردًّا)
  failPipeline = true;
  await assert.doesNotReject(cm.meterTurn('sub1', 1, 'chat', { lane: 'paid', model: 'm', input: 1 }));
  failPipeline = false;
});

test('٢. التقرير: مجموع آخر الأيّام لكلّ مسار ونسبة القراءة من كلّ الدخل، والأيّام الأقدم خارجه', async () => {
  hashes.clear();
  const now = Date.now();
  await cm.meterTurn('a', 0, 'chat', { lane: 'paid', model: 'claude-haiku-4-5', input: 100, cacheRead: 800, cacheWrite: 100, output: 50 }, { now });
  await cm.meterTurn('b', 0, 'chat', { lane: 'paid', model: 'claude-haiku-4-5', input: 100, cacheRead: 800, cacheWrite: 100, output: 50 }, { now: now - 86400000 });
  await cm.meterTurn('c', 0, 'chat', { lane: 'paid', model: 'claude-haiku-4-5', input: 999, output: 1 }, { now: now - 20 * 86400000 });
  await cm.meterTurn('', 0, 'chat', { lane: 'owner', model: 'claude-opus-5-5', input: 50, cacheRead: 950, output: 9 }, { now });
  const r = await cm.tokenReport(7, { kv, now });
  const paid = r.byLane.find((l) => l.lane === 'paid'), owner = r.byLane.find((l) => l.lane === 'owner');
  assert.deepEqual([paid.turns, paid.input, paid.cacheRead, paid.cacheWrite, paid.output], [2, 200, 1600, 200, 100], 'آخر ٧ أيّام فقط');
  assert.equal(paid.readPct, 80, 'القراءة ١٦٠٠ من ٢٠٠٠');
  assert.equal(owner.readPct, 95);
  assert.equal(r.rows.find((x) => x.lane === 'paid').model, 'claude-haiku-4-5');
});

const token = (u) => { const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url'); return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url'); };
const reply = () => new Response([
  { type: 'message_start', message: { model: 'claude-haiku-4-5-test', usage: { input_tokens: 310, cache_read_input_tokens: 4720, cache_creation_input_tokens: 60, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تمام' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } },
].map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
async function turn(user) {
  curUser = user;
  const save = global.fetch;
  global.fetch = async (url, init) => { let b = {}; try { b = JSON.parse(init.body); } catch (e) { /* نداء جانبيّ */ } return b.max_tokens ? reply() : new Response('{}'); };
  const res = { setHeader() {}, status() { return this; }, json() { return this; }, write() { return true; }, end() { this.writableEnded = true; }, on() {}, flushHeaders() {} };
  try { await chat({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'اشرح لي الذكاء الاصطناعي' }], token: token(user), provider: 'claude', tz: 'Asia/Dubai' } }, res); }
  finally { global.fetch = save; }
}

test('٣. المعالج الحقيقيّ: نهاية الدور = نداء Redis واحد فيه التكلفة والتوكنات كما أعلنها المزوّد؛ والمالك توكنات بلا تكلفة', async () => {
  calls.length = 0; hashes.clear();
  await turn('sub1');
  const metered = calls.filter((c) => c.some((x) => x[0] === 'HINCRBY'));
  assert.equal(metered.length, 1, 'نداء واحد');
  const ops = metered[0].map((c) => c[0] + ':' + c[1].split(':')[0]);
  assert.ok(ops.includes('INCRBY:cost') && ops.includes('HINCRBY:tok'), 'التكلفة والتوكنات معًا');
  assert.deepEqual(hashes.get('tok:' + day + ':paid:claude-haiku-4-5-test'), { in: 310, cr: 4720, cw: 60, out: 42, turns: 1 });
  calls.length = 0;
  await turn('meter-owner');
  const own = calls.filter((c) => c.some((x) => x[0] === 'HINCRBY'));
  assert.equal(own.length, 1);
  assert.ok(!own[0].some((x) => x[0] === 'INCRBY'), 'المالك لا تكلفة عليه (كما كان)');
  assert.ok(own[0].some((x) => x[1] === 'tok:' + day + ':owner:claude-haiku-4-5-test'), 'مسار المالك');
});

test('٤. التقرير للمالك وحده بجانب تقرير التكلفة، وفي لوحته سطر لكلّ مسار', () => {
  const h = read('api/_lib/health.js');
  assert.ok(h.indexOf('tokens = await __cm.tokenReport(7)') > h.indexOf('if (!isOwner(req))'), 'بعد بوّابة المالك');
  assert.match(h, /res\.status\(200\)\.json\(\{ ok: true, costs: await __cm\.monthReport\(req\.query\.month\), tokens \}\);/);
  const b = read('js/app.bundle.js');
  assert.ok(b.includes("const tk = d.tokens, kt = (n) =>") && b.includes("'🔢 التوكنات آخر '"), 'لوحة المالك تعرض المسارات');
  const cl = read('api/_lib/claude.js');
  assert.equal((cl.match(/cm\.meterTurn\(meterUser, cm\.tokenCostUsd\(useModel, tu\), 'chat', Object\.assign\(\{ lane: 'pro', model: useModel \}, tu\)\)/g) || []).length, 2, 'الردّ الاحترافيّ (متدفّق وغير متدفّق)');
});
