// tests/models-live.test.cjs — v-models-live: الفحص الدوريّ لأسماء الموديلات في الكود مقابل قوائم المزوّدين الحيّة.
// العرض: الأسماء المكتوبة نصًّا ماتت بصمت (v-dead-models) ولم تُكتشف إلّا بشكوى؛ والفحص القديم (model-probe) يدويّ بقائمة
// مكتوبة باليد تقادمت هي نفسها. الآن: الأسماء من الكود نفسه، والفحص أسبوعيّ، و«ميّت» فقط حين تُجلب كلّ قوائمه المرشّحة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const L = require('../scripts/lib/models-live.cjs');
const ignore = JSON.parse(fs.readFileSync(path.join(root, 'scripts/models-live-ignore.json'), 'utf8'));

test('الاستخراج: السلاسل وحدها، لا التعليقات ولا عناوين العرض ولا الأسماء القديمة في المقارنة وجداول الترحيل', () => {
  const src = [
    "// 'claude-opus-4-1' في تعليق لا يُعدّ",
    "const A = 'claude-opus-5-5';",
    "const B = `gemini-flash-latest`;",
    "const label = 'GPT-5.5';",
    "if (m === 'gemini-1.5-flash') m = 'gemini-3.8-flash';",
    "const remap = { 'openai/gpt-4o': 'openai/gpt-6-sol' };",
    "const pick = ok ? 'mistral-small-latest' : 'x';",
    "const free = 'z-ai/glm-5.2:free';",
  ].join('\n');
  const hits = L.extractFromSource(src, 'x.js');
  const called = hits.filter((h) => !h.legacy).map((h) => h.id);
  const legacy = hits.filter((h) => h.legacy).map((h) => h.id);
  assert.deepEqual(called.sort(), ['claude-opus-5-5', 'gemini-3.8-flash', 'gemini-flash-latest', 'mistral-small-latest', 'openai/gpt-6-sol', 'z-ai/glm-5.2:free'].sort());
  assert.deepEqual(legacy.sort(), ['gemini-1.5-flash', 'openai/gpt-4o'].sort());
  assert.equal(L.familyOf('z-ai/glm-5.2:free').name, 'free', ':free للوسيط وحده');
  assert.deepEqual(L.familyOf('openai/gpt-oss-120b').catalogs, ['openrouter', 'groq']);
});

test('الاستخراج على المستودع نفسه: الأسماء التي ينادَى بها حاضرة، والمتجاهَلة والترحيليّة غائبة، والحزمة المولّدة لا تُقرأ', () => {
  const { models, errors } = L.extractModels(root, ignore);
  assert.deepEqual(errors, [], 'كلّ ملفّ يُحلَّل');
  const ids = new Set(models.map((m) => m.id));
  for (const id of ['claude-opus-5-5', 'gemini-flash-latest', 'x-ai/grok-4.6', 'kimi-k3', 'openai/gpt-oss-120b', 'mistral-small-latest']) assert.ok(ids.has(id), id);
  for (const id of ignore.ids) assert.ok(!ids.has(id), 'متجاهَل: ' + id);
  assert.ok(!ids.has('anthropic/claude-3.5-sonnet'), 'مفتاح جدول ترحيل في app-10 لا يُفحص');
  assert.ok(!L.listSourceFiles(root).includes('js/app.bundle.js'));
  const m = models.find((x) => x.id === 'kimi-k3');
  assert.ok(m.where.length && /:\d+$/.test(m.where[0]), 'الموضع ملفّ:سطر');
});

test('التصنيف: الاسم المستعار يُخدم بلقطة مؤرّخة؛ «ميّت» فقط إن جُلبت كلّ القوائم المرشّحة؛ الناقص «لم يُفحص»', () => {
  const models = [
    { id: 'claude-sonnet-5', family: 'claude', where: ['a:1'] },
    { id: 'claude-opus-3', family: 'claude', where: ['a:2'] },
    { id: 'gemini-3.8-flash', family: 'gemini', where: ['a:3'] },
    { id: 'openai/gpt-oss-120b', family: 'slug', where: ['a:4'] },
    { id: 'qwen/qwen9-1b', family: 'slug', where: ['a:5'] },
    { id: 'z-ai/glm-0:free', family: 'free', where: ['a:6'] },
    { id: 'gpt-6-sol', family: 'openai', where: ['a:7'] },
  ];
  const catalogs = {
    anthropic: new Set(['claude-sonnet-5-20260301', 'claude-opus-5-5']),
    gemini: new Set(['gemini-3.8-flash']),
    openrouter: new Set(['openai/gpt-oss-120b', 'x-ai/grok-4.6']),
    groq: { skipped: 'لا مفتاح GROQ_API_KEY' },
    openai: { error: 'HTTP 401' },
  };
  const r = L.classify(models, catalogs);
  assert.deepEqual(r.live.map((m) => m.id).sort(), ['claude-sonnet-5', 'gemini-3.8-flash', 'openai/gpt-oss-120b']);
  assert.deepEqual(r.dead.map((m) => m.id).sort(), ['claude-opus-3', 'z-ai/glm-0:free']);
  assert.deepEqual(r.unverified.map((m) => m.id).sort(), ['gpt-6-sol', 'qwen/qwen9-1b'], 'Groq بلا مفتاح وOpenAI بخطأ = لم يُفحص، لا ميّت');
  const md = L.report(r, catalogs, []);
  assert.match(md, /`claude-opus-3` — `a:2`/);
  assert.match(md, /⏭️ لا مفتاح GROQ_API_KEY/);
});

test('الجلب: بلا مفتاح يُتخطّى بلا نداء، والمفتاح في الترويسة لا في التقرير، وصفحات Gemini تُتابَع، والعطل لا يُسقط الباقي', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    if (url.startsWith('https://openrouter.ai')) return { ok: true, json: async () => ({ data: [{ id: 'x-ai/grok-4.6' }] }) };
    if (url.includes('generativelanguage') && !url.includes('pageToken')) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-flash-latest' }], nextPageToken: 'P2' }) };
    if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-3.8-flash' }] }) };
    if (url.includes('anthropic')) return { ok: false, status: 401, json: async () => ({}) };
    throw new Error('غير متوقّع ' + url);
  };
  const SECRET = 'test-key-' + 'abc123';
  const c = await L.fetchCatalogs({ GEMINI_API_KEY: SECRET, ANTHROPIC_API_KEY: SECRET }, fake);
  assert.ok(c.openrouter instanceof Set && c.openrouter.has('x-ai/grok-4.6'), 'الوسيط عامّ بلا مفتاح');
  assert.deepEqual([...c.gemini].sort(), ['gemini-3.8-flash', 'gemini-flash-latest'], 'الصفحة الثانية');
  assert.equal(c.anthropic.error, 'HTTP 401');
  assert.match(c.groq.skipped, /GROQ_API_KEY/);
  assert.ok(!calls.some((x) => x.url.includes('groq') || x.url.includes('moonshot')), 'لا نداء بلا مفتاح');
  assert.equal(calls.find((x) => x.url.includes('anthropic')).headers['x-api-key'], SECRET);
  assert.ok(calls.filter((x) => x.url.includes('generativelanguage')).every((x) => !x.url.includes(SECRET)), 'مفتاح Gemini في الترويسة لا في الرابط (لا يظهر في سجلّ)');
  const md = L.report(L.classify([], c), c, []);
  assert.ok(!md.includes(SECRET), 'التقرير بلا مفتاح');
});

test('الورك فلو: أسبوعيّ ويدويّ، صلاحيّات دنيا، المسألة على الفرع الافتراضيّ وحده وبلا تكرار', () => {
  const wf = fs.readFileSync(path.join(root, '.github/workflows/model-probe.yml'), 'utf8');
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* 0'/, 'كلّ أحد');
  assert.match(wf, /permissions:\s*\n\s*contents: read\s*\n\s*issues: write/);
  assert.match(wf, /node scripts\/models-live\.mjs --out report\.md/);
  assert.match(wf, /github\.ref_name == github\.event\.repository\.default_branch/, 'تشغيل فرع لا يفتح مسألة');
  assert.match(wf, /gh issue list --state open/, 'يعلّق على المفتوحة بدل التكرار');
  assert.ok(!/echo[^\n]*secrets\./.test(wf), 'لا مفتاح يُطبع');
});
