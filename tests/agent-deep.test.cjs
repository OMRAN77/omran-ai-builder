'use strict';
/* v-agent-deep (طلب المالك ٢٩ سبتمبر: «أريد تقوّي الوكيل يقرأ الجيت هوب — تحليل قويّ — يتعمّق في حلّ المسائل»).
   (١) قارئ GitHub: فرق طلب السحب، والتزام واحد بفرقه — كان يرى أسماء الملفّات وحدها (البحث بـquery جاء من
       v-github-code-search في #833 واختباراته هناك).
   (٢) المعالج الحقيقيّ (api/_lib/agent.js) بمزوّد مزيّف: المالك بجهد xhigh وسقف ٦٤ ألفًا وقراءة GitHub عميقة بلا قصّ
       عند ٨ آلاف؛ كتل التفكير تعود كما هي في الخطوة التالية (كانت تُحذف)؛ ورفض توقيعها = إعادة واحدة بلاها.
       غير المالك كما كان. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

process.env.AUTH_SECRET = 'agent-deep-test-secret';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const GH = require(rp('api/_lib/github-read.js'));

/* ── (١) قارئ GitHub بشبكة مزيّفة ── */
const lookup = async () => [{ address: '140.82.112.3', family: 4 }];
const jsonRes = (obj, status) => ({ ok: !status || status < 400, status: status || 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => obj, text: async () => JSON.stringify(obj) });
function fakeNet(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, accept: init && init.headers && init.headers.Accept });
    for (const [re, res] of routes) if (re.test(u)) return typeof res === 'function' ? res(u) : res;
    return jsonRes({ message: 'Not Found' }, 404);
  };
  return { calls, opts: { fetchImpl, lookup, env: {} } };
}

test('١. الروابط: /commit/<sha> وwhat=commit مع ref — والأشكال القديمة كما هي', () => {
  const c = GH.parseTarget({ url: 'https://github.com/a/b/commit/abc1234def' });
  assert.deepEqual([c.kind, c.ref], ['commit', 'abc1234def']);
  assert.equal(GH.parseTarget({ url: 'a/b', what: 'commit', ref: 'abc1234' }).kind, 'commit');
  assert.equal(GH.parseTarget({ url: 'a/b', what: 'commit' }).kind, 'repo', 'بلا ref لا التزام');
  assert.deepEqual(GH.parseTarget({ url: 'https://github.com/OMRAN77/omran-ai-builder' }), { owner: 'OMRAN77', repo: 'omran-ai-builder', ref: '', path: '', kind: 'repo', number: null, from: 1 });
});

test('٢. التزام واحد بفرقه، وطلب السحب يعرض الفرق نفسه تحت قائمة الملفّات', async () => {
  const net = fakeNet([
    [/\/commits\/abc1234$/, jsonRes({ sha: 'abc1234ffff', author: { login: 'omran' }, commit: { message: 'fix x', author: { date: '2026-09-28T10:00:00Z' } }, stats: { additions: 1, deletions: 1 },
      files: [{ filename: 'x.js', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' }] })],
    [/\/pulls\/5$/, jsonRes({ number: 5, title: 'Fix', state: 'open', user: { login: 'o' }, head: { ref: 'fix', repo: { full_name: 'a/b' } }, base: { ref: 'main' } })],
    [/\/pulls\/5\/files/, jsonRes([{ filename: 'x.js', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' }])],
  ]);
  const c = await GH.readGithub({ url: 'https://github.com/a/b/commit/abc1234' }, net.opts);
  assert.ok(c.startsWith('🔖 التزام abc1234ffff في a/b · omran'));
  assert.ok(c.includes('fix x') && c.includes('- x.js (modified +1/−1)') && c.includes('### x.js\n```diff\n@@ -1 +1 @@\n-a\n+b\n```'));
  const pr = await GH.readGithub({ url: 'https://github.com/a/b/pull/5' }, net.opts);
  assert.ok(pr.includes('- x.js (modified +1/−1)') && pr.includes('الفرق (diff):') && pr.includes('+b'));
});

test('٣. سقف الفرق: العاديّ ١٥٠٠ للملفّ و٦ آلاف للكلّ، والعميق ٦ آلاف و٢٠ ألفًا', () => {
  const big = Array.from({ length: 8 }, (_, i) => ({ filename: 'f' + i + '.js', patch: '+' + 'x'.repeat(5000) }));
  const normal = GH.formatPatches(big, false), deep = GH.formatPatches(big, true);
  assert.ok(normal.length < 7500 && deep.length > normal.length * 2.5 && deep.length < 22000, normal.length + ' / ' + deep.length);
  assert.match(normal, /ملفًّا آخر بلا فرق معروض/);
  assert.equal(GH.formatPatches([{ filename: 'bin.png' }], true), '', 'ملفّ بلا فرق (ثنائيّ) لا يُعرض');
});

/* ── (٢) المعالج الحقيقيّ ── */
const store = new Map();
const stub = (f, exports) => { const p = rp(f); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
stub('api/_lib/kv.js', { kvPutJSON: async (k, v) => { store.set(k, v); }, kvGetJSON: async (k) => (store.has(k) ? store.get(k) : null), kvDel: async (k) => { store.delete(k); }, kvExpire: async () => {}, kvIncr: async () => 1 });
let usageUser = 'omran';
stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => '127.0.0.1', checkAndConsume: async () => ({ allowed: true, username: usageUser }) });
stub('api/_lib/_knowledge.js', { ownerKnowledge: () => '' });
const ghCalls = [];
stub('api/_lib/github-read.js', Object.assign({}, GH, { readGithub: async (input, opts) => { ghCalls.push({ input, opts }); return '📄 x.js\n' + 'س'.repeat(20000); } }));
const agent = require(rp('api/_lib/agent.js'));

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const sse = (events) => new Response(events.map((e) => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const thinkThenSearch = () => sse([
  { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG-abc' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'redacted_thinking', data: 'RED-1' } },
  { type: 'content_block_stop', index: 1 },
  { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu1', name: 'read_github', input: {} } },
  { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"url":"OMRAN77/x","query":"foo"}' } },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } },
]);
const answer = (t) => sse([
  { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
]);

async function run(user, script) {
  usageUser = user;
  ghCalls.length = 0;
  const calls = [];
  const save = global.fetch;
  let i = 0;
  global.fetch = async (url, init) => {
    if (!/api\.anthropic\.com\/v1\/messages/.test(String(url))) return new Response('{}', { status: 404 });
    calls.push(JSON.parse(init.body));
    return script[Math.min(i++, script.length - 1)]();
  };
  let written = '';
  const req = { method: 'POST', headers: { host: 'x' }, body: { messages: [{ role: 'user', content: 'وين الخلل في foo؟' }], token: token(user) } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {}, flush() {} };
  try { await agent(req, res); } finally { global.fetch = save; }
  const events = written.split('\n').filter((l) => l.startsWith('data: ')).map((l) => { try { return JSON.parse(l.slice(6)); } catch (e) { return null; } }).filter(Boolean);
  return { calls, events, text: events.filter((e) => e.delta).map((e) => e.delta).join('') };
}

test('٤. المالك: xhigh و٦٤ ألفًا، GitHub عميق وناتجه كامل، وكتل التفكير تعود كما هي وبترتيبها', async () => {
  const r = await run('omran', [thinkThenSearch, () => answer('الجذر في x.js:10')]);
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.calls[0].output_config, { effort: 'xhigh' });
  assert.equal(r.calls[0].max_tokens, 64000);
  assert.deepEqual(ghCalls[0].opts, { deep: true });
  assert.equal(ghCalls[0].input.query, 'foo');
  const msgs = r.calls[1].messages;
  const asst = msgs[msgs.length - 2], tr = msgs[msgs.length - 1];
  assert.deepEqual(asst.content.map((b) => b.type), ['thinking', 'redacted_thinking', 'tool_use'], 'الترتيب كما وصل');
  assert.deepEqual(asst.content[0], { type: 'thinking', thinking: '', signature: 'SIG-abc' }, 'بلا تعديل — نصّ فارغ وتوقيعه');
  assert.deepEqual(asst.content[1], { type: 'redacted_thinking', data: 'RED-1' });
  assert.ok(tr.content[0].content.length > 20000, 'ناتج القراءة العميقة لا يُقصّ عند ٨ آلاف: ' + tr.content[0].content.length);
  assert.equal(r.text, 'الجذر في x.js:10');
  assert.ok(r.events.some((e) => /بحثتُ في كود OMRAN77\/x عن «foo»/.test(e.status || '')), 'الأثر يذكر البحث');
});

test('٥. غير المالك كما كان: high و٣٢ ألفًا، GitHub بلا مفتاح، والناتج مقصوص عند ٨ آلاف', async () => {
  const r = await run('someone', [thinkThenSearch, () => answer('تم')]);
  assert.deepEqual(r.calls[0].output_config, { effort: 'high' });
  assert.equal(r.calls[0].max_tokens, 32000);
  assert.deepEqual(ghCalls[0].opts, { anonymous: true });
  const msgs = r.calls[1].messages;
  assert.equal(msgs[msgs.length - 1].content[0].content.length, 8000);
});

test('٦. توقيع تفكير مرفوض → تُنزع كتل التفكير وإعادة واحدة، والتشغيل يكمل', async () => {
  const bad = () => new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'messages.1.content.0: Invalid `signature` in `thinking` block.' } }), { status: 400 });
  const r = await run('omran', [thinkThenSearch, bad, () => answer('كمّلت')]);
  assert.equal(r.calls.length, 3);
  assert.ok(r.calls[1].messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'thinking')), 'الطلب الأوّل يحملها');
  assert.ok(!r.calls[2].messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'thinking' || b.type === 'redacted_thinking')), 'الإعادة بلاها');
  assert.ok(r.calls[2].messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use')), 'نداء الأداة ونتيجته باقيان');
  assert.equal(r.text, 'كمّلت');
});

test('٧. تعليمات الوكيل: منهج التعمّق، والبحث قبل القراءة، والطول بقدر الحلّ في التحليل', () => {
  const src = fs.readFileSync(rp('api/_lib/agent.js'), 'utf8');
  assert.match(src, /44-ب\. التعمّق في حلّ المسائل/);
  assert.match(src, /الجذر لا العَرَض: تتبّع السبب حتّى أصله وسمِّه بالملفّ والسطر/);
  assert.match(src, /ولطلب سحب أو التزام اقرأ الفرق \(diff\) نفسه لا أسماء الملفّات وحدها/);
  assert.match(src, /1ب\.[^\n]*الاستثناء: تحليل كود أو مستودع، أو تشخيص عطل، أو حلّ مسألة/);
  assert.match(src, /what: \{ type: 'string', enum: \['auto', 'commits', 'commit'\]/);
});
