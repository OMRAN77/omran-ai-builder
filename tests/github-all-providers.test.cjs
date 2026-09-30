// v-github-all-providers (أمر المالك ٢٩ سبتمبر ٢٠٢٦: «خلّهم نفس ما هم، لكن كلّهم أعطهم صلاحيّة
// يقرون الجيت هوب — فقط للمالك»): العمق في قراءة GitHub كان على مسار كلود حصرًا
// (v-claude-deep-github)، وسقف نتيجة الأداة ٨ آلاف حرف كان يبتر الدفعة العميقة (٢٤ ألفًا) لكلّ
// المزوّدين وكلود ضمنًا — فكان «العمق» اسمًا بلا أثر. هنا: العمق لكلّ مزوّد، والسقف يتّسع
// لقراءة GitHub وللمالك وحده، وبقيّة الأدوات وبقيّة المستخدمين كما كانوا حرفيًّا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'github-all-providers-test-secret';
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
  kvGetJSON: async (key) => (db.has(key) ? structuredClone(db.get(key)) : null),
  kvPutJSON: async (key, value) => { db.set(key, structuredClone(value)); },
  kvDel: async (key) => { db.delete(key); },
  kvExpire: async () => {},
} };
require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
  DAILY_LIMIT: 20, clientIp: () => '127.0.0.1',
  checkAndConsume: async () => ({ allowed: true, username: 'gh-user' }),
} };
require.cache[rp('api/_lib/_knowledge.js')] = { id: rp('api/_lib/_knowledge.js'), filename: rp('api/_lib/_knowledge.js'), loaded: true, exports: { ownerKnowledge: () => '' } };
require.cache[rp('api/_lib/search.js')] = { id: rp('api/_lib/search.js'), filename: rp('api/_lib/search.js'), loaded: true, exports: { fetchPlaces: async () => [] } };

// قارئ GitHub مزيّف: لا شبكة. نسجّل الصلاحيّة المطلوبة، ونرجّع طولًا نتحكّم به لقياس القصّ.
const ghCalls = [];
let ghSize = 60;
require.cache[rp('api/_lib/github-read.js')] = { id: rp('api/_lib/github-read.js'), filename: rp('api/_lib/github-read.js'), loaded: true, exports: {
  readGithub: async (input, opts) => { ghCalls.push({ input, opts }); return 'س'.repeat(ghSize); },
} };
const chat = require(rp('api/_lib/chat.js'));

function token(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 60_000 })).toString('base64url');
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
    return bodies.length === 1 ? toolTurnStream(ghInput) : textStream('قرأتُ.');
  };
  const req = { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'اقرأ ملفّ README في https://github.com/OMRAN77/omran-ai-builder' }], token: token(user), provider } };
  const res = { setHeader() {}, status() { return this; }, json(v) { throw new Error('unexpected json ' + JSON.stringify(v)); }, write() {}, end() {} };
  try { await chat(req, res); } finally { global.fetch = saveFetch; }
  return bodies;
}
function withOwner(fn) {
  return async () => {
    const save = process.env.OWNER_USERNAMES;
    process.env.OWNER_USERNAMES = 'gh-owner';
    try { await fn(); } finally { if (save === undefined) delete process.env.OWNER_USERNAMES; else process.env.OWNER_USERNAMES = save; }
  };
}
const toolResultOf = (bodies) => String(bodies[1].body.messages.at(-1).content.find((b) => b.type === 'tool_result').content);

/* المزوّدون الذين تخدمهم المحادثة فعلًا (OR_MODELS في chat.js) — هم «كلّهم» في أمر المالك.
   v-openrouter-tools: المزوّد العامّ انضمّ إليهم بأمر «سوّه». */
const PROVIDERS = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter'];

test('١. كلّ مزوّد يقرأ GitHub بالعمق نفسه للمالك — لا كلود وحده', withOwner(async () => {
  for (const prov of PROVIDERS) {
    ghCalls.length = 0;
    await ask(prov, 'gh-owner', { url: 'OMRAN77/omran-ai-builder', path: 'api/_lib/chat.js' });
    assert.equal(ghCalls.length, 1, prov + ': نداء واحد للقارئ');
    assert.deepEqual(ghCalls[0].opts, { deep: true }, prov + ': العمق مطلوب');
  }
}));

test('٢. غير المالك على أيّ مزوّد: ممنوع كليًّا — لا قراءة ولا عمق ولا نداء شبكة', async () => {
  for (const prov of PROVIDERS) {
    ghCalls.length = 0;
    const bodies = await ask(prov, 'gh-user', { url: 'OMRAN77/omran-ai-builder' });
    assert.equal(ghCalls.length, 0, prov + ': لا نداء للقارئ');
    assert.match(toolResultOf(bodies), /غير متاحة/, prov);
  }
});

test('٣. الدفعة العميقة تصل النموذج كاملة على مزوّد غير كلود — كانت تُبتر عند ٨ آلاف', withOwner(async () => {
  const save = ghSize;
  ghSize = 24000; // DEEP_CHUNK في github-read.js
  try {
    for (const prov of ['deepseek', 'gemini', 'claude']) {
      ghCalls.length = 0;
      const bodies = await ask(prov, 'gh-owner', { url: 'OMRAN77/omran-ai-builder', path: 'api/_lib/chat.js' });
      assert.equal(toolResultOf(bodies).length, 24000, prov + ': الدفعة كاملة بلا بتر');
    }
  } finally { ghSize = save; }
}));

test('٤. السقف الجديد ٣٠ ألف حرف — ما زاد يُقصّ لا يُرسل بلا حدّ', withOwner(async () => {
  const save = ghSize;
  ghSize = 40000;
  try {
    const bodies = await ask('mistral', 'gh-owner', { url: 'OMRAN77/omran-ai-builder' });
    assert.equal(toolResultOf(bodies).length, 30000);
  } finally { ghSize = save; }
}));

test('٥. الاتّساع لقراءة GitHub وللمالك وحده — بقيّة الأدوات وبقيّة المستخدمين على ٨ آلاف كما كانوا', () => {
  const s = read('api/_lib/chat.js');
  assert.ok(s.includes("const __outMax = (__ownerReq && st.cb.name === 'read_github') ? 30000 : 8000;"),
    'الشرطان معًا: المالك + أداة GitHub؛ وإلّا ٨ آلاف');
  assert.ok(s.includes("content: String(st.result).slice(0, __outMax)"), 'السقف يُطبَّق على نتيجة الأداة');
  assert.ok(s.includes("toolCorpus += ' ' + String(st.result).slice(0, 8000); // v608"),
    'مجمّع المصادر (v608) لم يُمسّ — ٨ آلاف كما كان');
});

test('٦. الثوابت العميقة أوسع من العاديّة، والحصر صار على الطالب لا على المزوّد', () => {
  const g = read('api/_lib/github-read.js');
  const num = (name) => {
    const m = new RegExp('const ' + name + ' = (\\d+)').exec(g);
    assert.ok(m, name + ' معرَّف');
    return Number(m[1]);
  };
  assert.ok(num('DEEP_CHUNK') > num('CHUNK'), 'الدفعة العميقة أكبر');
  assert.ok(num('DEEP_TREE_MAX') > num('TREE_MAX'), 'الشجرة العميقة أوسع');
  assert.ok(num('DEEP_README_MAX') > num('README_MAX'), 'README العميق أطول');
  assert.ok(g.includes('v-github-all-providers'), 'التعليق يوثّق أنّ العمق لم يبقَ حصرًا على كلود');
  assert.ok(!/opts\.deep في chat\.js\. بقيّة المزوّدين على القيم القديمة/.test(g), 'الحصر القديم لم يبقَ موصوفًا');
});

test('٧. الوكيل على القاعدة نفسها (لا يتفرّق السلوك بين المحادثة والوكيل)', () => {
  const a = read('api/_lib/agent.js');
  assert.ok(a.includes("readGithub(input, isOwner(runUser) ? { deep: true } : { anonymous: true })"), 'الوكيل: العمق للمالك');
  assert.match(a, /cb\.name === 'read_github'\) \? 30000 : 8000/, 'الوكيل: السقف الواسع لقراءة GitHub');
});

test('٨. القائمة ثمانية في العميل والحزمة، وOR_MODELS يخدمهم كلّهم؛ Perplexity وحده خارجها (Sonar لا يقبل أدوات)', () => {
  const t = "const TOOL_PROVIDERS = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter'];";
  for (const f of ['js/app-06-checkout.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes(t), f + ': قائمة مسار الأدوات ثمانية');
  }
  const chatSrc = read('api/_lib/chat.js');
  const or = chatSrc.slice(chatSrc.indexOf('const OR_MODELS = {'), chatSrc.indexOf('};', chatSrc.indexOf('const OR_MODELS = {')));
  for (const prov of PROVIDERS) assert.ok(or.includes(prov + ':'), 'OR_MODELS يخدم ' + prov);
  assert.ok(!or.includes('perplexity:'),
    'Perplexity خارج مسار الأدوات: موديلات Sonar لا تقبل أدوات — أيّ إدخال له تغييرٌ مقصود لا صامت');
});

/* v-openrouter-tools (أمر المالك «سوّه»): المزوّد العامّ كان آخر من في منتقي المالك بلا أدوات. */
test('٩. OpenRouter: موديل المالك يصل كما اختاره (أيّ شركة)، والمفتاح والعنوان هما نفسهما — لا كلفة جديدة', withOwner(async () => {
  ghCalls.length = 0;
  const bodies = await ask('openrouter', 'gh-owner', { url: 'OMRAN77/omran-ai-builder', path: 'README.md' });
  assert.match(bodies[0].url, /openrouter\.ai\/api\/v1\/messages/, 'العنوان هو الوسيط نفسه');
  assert.equal(bodies[0].body.model, 'anthropic/claude-sonnet-5', 'الافتراضيّ = افتراضيّ المنتقي');
  assert.ok(bodies[0].body.tools.some((t) => t.name === 'read_github'), 'الأداة تصله');
  assert.deepEqual(ghCalls[0].opts, { deep: true }, 'وبالعمق نفسه');

  const { pickProviderModel } = require(rp('api/_lib/provider-models.js'));
  // المزوّد العامّ ليس شركةً واحدة: أيّ معرّف صالح يُقبل…
  for (const id of ['openai/gpt-6-sol', 'meta-llama/llama-4-maverick', 'anthropic/claude-opus-5.5']) {
    assert.equal(pickProviderModel('openrouter', id, 'ف').model, id, id);
  }
  // …والفاسد يرجع للافتراضيّ بلا خطأ، وبقيّة المزوّدين تبقى محصورة ببادئة شركتها.
  for (const bad of ['', 'بلا-شرطة', 'x/', '/y']) assert.equal(pickProviderModel('openrouter', bad, 'ف').model, 'ف', JSON.stringify(bad));
  assert.equal(pickProviderModel('gemini', 'openai/gpt-6-sol', 'ف').model, 'ف', 'حصر البادئة لبقيّة المزوّدين لم يُمسّ');
}));

test('١٠. OpenRouter في المنتقي: or:true كي يصل اختيار المالك، ووسم الكاش مرفوع', () => {
  const m = read('js/modes.js');
  assert.match(m, /key:'openrouter',[^}]*or:true/, 'or:true على مدخل المزوّد العامّ');
  assert.ok(m.includes("window.omranModelFor = function(k){"), 'الدالّة التي تقرأ الاختيار قائمة');
  const idx = read('index.html');
  const v = /js\/modes\.js\?v=([^"]+)/.exec(idx);
  assert.ok(v, 'وسم modes.js موجود');
  assert.notEqual(v[1], 'm290926a', 'الوسم رُفع — الملفّ يُحمَّل منفصلًا فلا يُخدَم من الكاش القديم');
});
