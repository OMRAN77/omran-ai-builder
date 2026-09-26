// v-chat-github-read (١٩ سبتمبر ٢٠٢٦): «أعطِ المزوّدين كلّهم صلاحيّة قراءة GitHub فقط» — أداة read_github
// (قراءة فقط) في أدوات المحادثة فتصل كلّ مزوّد يمرّ بمسار الأدوات؛ غير المالك بلا مفتاح، ولا write_github هنا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'chat-github-read-test-secret';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const db = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetJSON: async (key) => db.has(key) ? structuredClone(db.get(key)) : null,
  kvPutJSON: async (key, value) => { db.set(key, structuredClone(value)); },
  kvDel: async (key) => { db.delete(key); },
  kvExpire: async () => {},
} };
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async (token) => ({ allowed: true, username: 'gh-user' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };
// قارئ GitHub مزيّف: لا شبكة؛ نسجّل ما طُلب وبأيّ صلاحيّة.
const ghCalls = [];
require.cache[rp('api/_lib/github-read.js')] = { id: rp('api/_lib/github-read.js'), filename: rp('api/_lib/github-read.js'), loaded: true, exports: {
  readGithub: async (input, opts) => { ghCalls.push({ input, opts }); return '📄 README.md (٣ أسطر)\n1 | # عمران AI\n2 | تطبيق\n3 | نهاية'; },
} };
const chat = require(rp('api/_lib/chat.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000, m: 1 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function sse(events) {
  return new Response(events.map((e) => 'data: ' + JSON.stringify(e) + '\n').join('') + '\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
const toolTurnStream = (input) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu-1', name: 'read_github' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
]);
const textStream = (text) => sse([
  { type: 'message_start', message: { model: 'x', usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
]);

async function ask(provider, user, ghInput) {
  const bodies = [];
  const saveFetch = global.fetch;
  global.fetch = async (url, options) => {
    bodies.push({ url: String(url), body: JSON.parse(options.body) });
    return bodies.length === 1 ? toolTurnStream(ghInput) : textStream('قرأتُ الملفّ: عنوانه «عمران AI».');
  };
  let written = '';
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'اقرأ لي ملفّ README في https://github.com/OMRAN77/omran-ai-builder وقل لي عنوانه' }], token: token(user), provider } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write(c) { written += String(c || ''); }, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; }
  return { bodies, written };
}

test('١. الأداة معرّفة لكلّ مسار الأدوات، قراءة فقط، والنظام يوجّه إليها بدل fetch_page', () => {
  const s = read('api/_lib/chat.js');
  const tools = s.slice(s.indexOf('\nconst TOOLS = ['), s.indexOf('\nconst TOOLS_NOTE'));
  assert.ok(tools.includes("name: 'read_github'"), 'الأداة في TOOLS');
  assert.ok(tools.includes("required: [], /* v-github-default-repo"), 'الرابط اختياريّ: بلا url = مستودع التطبيق للمالك');
  assert.ok(!tools.includes("name: 'write_github'"), 'لا كتابة في أدوات المحادثة');
  assert.ok(!s.includes("name: 'write_github'") && !s.includes("cb.name === 'write_github'"), 'لا write_github في المحادثة إطلاقًا — تعريفًا ولا تنفيذًا');
  assert.ok(s.includes("'• read_github — أي رابط github.com"), 'ملاحظة الأدوات توجّه إليها');
  assert.ok(s.includes("cb.name === 'read_github') send({ status: '🐙 يقرأ من GitHub…', k: 'stFetchPage' })"), 'سطر الحالة بمفتاح ترجمة قائم');
  assert.ok(s.includes("else if (cb.name === 'read_github') {") && s.includes("if (!__ownerReq) {"), 'التنفيذ: بوابة المالك أوّل شيء');
  assert.ok(s.includes("result = await require('./github-read.js').readGithub(input, prov === 'claude' ? { deep: true } : undefined);"), 'v-claude-deep-github: عمق إضافيّ على مسار كلود للمالك');
  assert.ok(!/^const .*require\('\.\/github-read\.js'\)/m.test(s), 'لا تحميل للقارئ في نطاق الوحدة');
});

test('٢. غير المالك (على أيّ مزوّد، كلود ضمنًا): read_github ممنوعة كليًّا — بلا نداء شبكة (v-github-owner-only)', async () => {
  for (const prov of ['claude', 'deepseek', 'openai']) {
    ghCalls.length = 0;
    const r = await ask(prov, 'gh-user', { url: 'https://github.com/OMRAN77/omran-ai-builder', path: 'README.md' });
    assert.equal(ghCalls.length, 0, prov + ': لا نداء شبكة لغير المالك');
    const tr = r.bodies[1].body.messages.at(-1).content.find((b) => b.type === 'tool_result');
    assert.match(String(tr.content), /غير متاحة/, prov);
    assert.doesNotMatch(String(tr.content), /كلود|claude|Claude/i, prov + ': لا اسم مزوّد أو نموذج');
  }
});

test('٣. المالك على كلود: القراءة بمفتاحه (بلا anonymous) مع العمق الإضافيّ', async () => {
  ghCalls.length = 0;
  const saveOwners = process.env.OWNER_USERNAMES;
  process.env.OWNER_USERNAMES = 'gh-owner';
  try {
    const r = await ask('claude', 'gh-owner', { url: 'OMRAN77/omran-ai-builder', what: 'commits', limit: 5 });
    assert.equal(ghCalls.length, 1);
    assert.deepEqual(ghCalls[0].opts, { deep: true });
    assert.equal(ghCalls[0].input.what, 'commits');
    assert.equal(r.bodies.length, 2);
  } finally {
    if (saveOwners === undefined) delete process.env.OWNER_USERNAMES; else process.env.OWNER_USERNAMES = saveOwners;
  }
});

test('٣ب. المالك على غير كلود: القراءة بمفتاحه بلا عمق إضافيّ (بلا تغيير عن السابق)', async () => {
  ghCalls.length = 0;
  const saveOwners = process.env.OWNER_USERNAMES;
  process.env.OWNER_USERNAMES = 'gh-owner';
  try {
    const r = await ask('openai', 'gh-owner', { url: 'OMRAN77/omran-ai-builder', what: 'commits', limit: 5 });
    assert.equal(ghCalls.length, 1);
    assert.equal(ghCalls[0].opts, undefined);
    assert.equal(ghCalls[0].input.what, 'commits');
    assert.equal(r.bodies.length, 2);
  } finally {
    if (saveOwners === undefined) delete process.env.OWNER_USERNAMES; else process.env.OWNER_USERNAMES = saveOwners;
  }
});

test('٥. v-cohere-tools: Cohere يمرّ بمسار الأدوات عبر الوسيط فيحمل read_github (كان مباشرًا بلا أدوات)؛ التنفيذ الآن ممنوع لغير المالك', async () => {
  for (const f of ['js/app-06-checkout.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes("const TOOL_PROVIDERS = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere'];"), f + ': Cohere في قائمة مسار الأدوات');
  }
  ghCalls.length = 0;
  const r = await ask('cohere', 'gh-user', { url: 'https://github.com/OMRAN77/omran-ai-builder' });
  assert.match(r.bodies[0].url, /openrouter\.ai\/api\/v1\/messages/);
  assert.equal(r.bodies[0].body.model, 'cohere/command-a');
  assert.ok(r.bodies[0].body.tools.some((t) => t.name === 'read_github'), 'الأداة تصل Cohere (تُعرَّف له، والتنفيذ وحده يُمنع)');
  assert.equal(ghCalls.length, 0, 'v-github-owner-only: غير المالك بلا نداء شبكة');
});

test('٦. v-github-default-repo: بلا رابط — المالك يقرأ مستودع التطبيق؛ غير المالك ممنوع قبل حتّى فحص الرابط', async () => {
  const s = read('api/_lib/chat.js');
  const tools = s.slice(s.indexOf('\nconst TOOLS = ['), s.indexOf('\nconst TOOLS_NOTE'));
  const gh = tools.slice(tools.indexOf("name: 'read_github'")); // آخر أداة في القائمة (fetch_page قبلها يشترط url)
  assert.ok(!gh.includes("required: ['url']"), 'الرابط لم يعد إلزاميًّا');
  assert.ok(gh.includes('فاستدعِ الأداة بلا url'), 'الوصف يوجّه إلى الاستدعاء لا الشرح العامّ');
  // غير المالك بلا رابط: لا نداء للقارئ — يُمنع قبل حتّى فحص الرابط، على أيّ مزوّد
  for (const prov of ['deepseek', 'claude']) {
    ghCalls.length = 0;
    const r = await ask(prov, 'gh-user', {});
    assert.equal(ghCalls.length, 0, prov + ': لا نداء بلا رابط لغير المالك');
    const tr = r.bodies[1].body.messages.at(-1).content.find((b) => b.type === 'tool_result');
    assert.match(String(tr.content), /غير متاحة/, prov);
  }
  // المالك بلا رابط: مستودع التطبيق (الافتراضيّ ثمّ من البيئة)
  const saveOwners = process.env.OWNER_USERNAMES; const saveRepo = process.env.GITHUB_DEFAULT_REPO;
  process.env.OWNER_USERNAMES = 'gh-owner'; delete process.env.GITHUB_DEFAULT_REPO;
  try {
    ghCalls.length = 0;
    await ask('openai', 'gh-owner', {});
    assert.equal(ghCalls.length, 1);
    assert.equal(ghCalls[0].input.url, 'OMRAN77/omran-ai-builder');
    assert.equal(ghCalls[0].opts, undefined);
    process.env.GITHUB_DEFAULT_REPO = 'OMRAN77/other-repo';
    ghCalls.length = 0;
    await ask('openai', 'gh-owner', { path: 'README.md' });
    assert.equal(ghCalls[0].input.url, 'OMRAN77/other-repo');
    assert.equal(ghCalls[0].input.path, 'README.md');
  } finally {
    if (saveOwners === undefined) delete process.env.OWNER_USERNAMES; else process.env.OWNER_USERNAMES = saveOwners;
    if (saveRepo === undefined) delete process.env.GITHUB_DEFAULT_REPO; else process.env.GITHUB_DEFAULT_REPO = saveRepo;
  }
  // رابط صريح يبقى كما هو للمالك
  process.env.OWNER_USERNAMES = 'gh-owner';
  try { ghCalls.length = 0; await ask('openai', 'gh-owner', { url: 'https://github.com/x/y' }); assert.equal(ghCalls[0].input.url, 'https://github.com/x/y'); }
  finally { if (saveOwners === undefined) delete process.env.OWNER_USERNAMES; else process.env.OWNER_USERNAMES = saveOwners; }
});

test('٤. سطر الأثر يستعمل مفاتيح الترجمة القائمة (لا نصّ واجهة جديد بالـ١٤ لغة)', () => {
  const s = read('api/_lib/chat.js');
  const i = s.indexOf("if (name === 'read_github') {");
  const seg = s.slice(i, s.indexOf("if (name === 'run_js') {", i));
  assert.ok(seg.includes("'trFetchFail'") && seg.includes("'trFetch'"), 'المفتاحان القائمان');
  assert.ok(!/stGithub|trGithub/.test(s), 'لا مفتاح ترجمة جديد');
});
