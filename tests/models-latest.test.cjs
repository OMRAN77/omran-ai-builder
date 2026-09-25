'use strict';
/* v-models-latest (أمر المالك ٢٥ سبتمبر ٢٠٢٦ «رقّهم كلّهم لآخر الإصدارات»):
   ١) مهامّ OpenAI الخفيفة على الأحدث بقائمة مرشّحين وجسم يناسب الموديل المفكّر (_oa-light).
   ٢) لا موديل موقوف/يُوقف قريبًا مثبّتًا في نداء: gpt-image-1 (٢٣ أكتوبر)، gemini-2.5-flash-image (٢ أكتوبر)،
      llama-3.1-8b-instant وMaverick على Groq (موقوفان)، gpt-4o-mini/gpt-4.1-mini في المهامّ الخفيفة.
   ٣) كلود: Opus 5 ← Opus 5.5 (الوكيل، تحليل الكود، المنتقي، والاختيار المحفوظ القديم يُرقّى). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-models-latest';
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const L = require('../api/_lib/_oa-light.js');

test('١. shapeBody: الموديل المفكّر بلا temperature وبهامش تفكير وجهد منخفض؛ gpt-4* بجسمه كما هو', () => {
  const p = { messages: [{ role: 'user', content: 'x' }], temperature: 0.8, max_tokens: 100, response_format: { type: 'json_object' } };
  const b = L.shapeBody('gpt-6-luna', p);
  assert.equal(b.model, 'gpt-6-luna');
  assert.equal(b.temperature, undefined);
  assert.equal(b.max_tokens, undefined);
  assert.ok(b.max_completion_tokens > 100, 'التفكير يُحسب من السقف — ١٠٠ وحدها ترجع نصًّا فارغًا');
  assert.equal(b.reasoning_effort, 'low');
  assert.deepEqual(b.response_format, { type: 'json_object' });
  assert.deepEqual(L.shapeBody('gpt-4.1-mini', p), Object.assign({}, p, { model: 'gpt-4.1-mini' }));
  assert.equal(p.temperature, 0.8, 'الأصل لا يتغيّر');
  assert.equal(L.OA_LIGHT_MODELS[0], 'gpt-6-luna');
});

function fakeFetch(script) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const step = script[calls.length - 1];
    return step(body);
  };
  return { f, calls };
}
const ok = (t) => new Response(JSON.stringify({ choices: [{ message: { content: t } }] }), { status: 200 });

test('٢. oaLightFetch: موديل لا يملكه المفتاح = التالي؛ حقل مرفوض = يُحذف ويُعاد؛ الرصيد/المفتاح يظهران كما هما', async () => {
  let { f, calls } = fakeFetch([
    () => new Response('{"error":{"message":"The model `gpt-6-luna` does not exist or you do not have access to it."}}', { status: 404 }),
    () => ok('من gpt-5-mini'),
  ]);
  let r = await L.oaLightFetch('k', { messages: [], max_tokens: 50, temperature: 0.3 }, { fetchImpl: f });
  assert.equal(r.status, 200);
  assert.deepEqual(calls.map((c) => c.model), ['gpt-6-luna', 'gpt-5-mini']);
  assert.equal((await r.json()).choices[0].message.content, 'من gpt-5-mini');

  ({ f, calls } = fakeFetch([
    () => new Response('{"error":{"message":"Unsupported value: \'reasoning_effort\' does not support \'low\' with this model."}}', { status: 400 }),
    (b) => { assert.equal(b.reasoning_effort, undefined); return ok('تمام'); },
  ]));
  r = await L.oaLightFetch('k', { messages: [] }, { fetchImpl: f });
  assert.equal(r.status, 200);
  assert.deepEqual(calls.map((c) => c.model), ['gpt-6-luna', 'gpt-6-luna'], 'الموديل نفسه بعد حذف الحقل');

  ({ f, calls } = fakeFetch([() => new Response('{"error":{"message":"You exceeded your current quota"}}', { status: 429 })]));
  r = await L.oaLightFetch('k', { messages: [] }, { fetchImpl: f });
  assert.equal(r.status, 429, 'نفاد الرصيد لا يُخفى بموديل آخر');
  assert.equal(calls.length, 1);

  ({ f, calls } = fakeFetch([
    () => new Response('{"error":{"message":"model not found"}}', { status: 404 }),
    () => new Response('{"error":{"message":"model not found"}}', { status: 404 }),
    () => new Response('{"error":{"message":"model not found"}}', { status: 404 }),
  ]));
  r = await L.oaLightFetch('k', { messages: [] }, { fetchImpl: f });
  assert.equal(r.status, 404);
  assert.match(await r.text(), /model not found/, 'آخر خطأ يصل كما هو');
});

test('٣. المهامّ الخفيفة تمرّ بـ_oa-light، ولا gpt-4o-mini/gpt-4.1-mini مثبّتًا في نداء', () => {
  const files = ['api/_lib/memory.js', 'api/_lib/construction-create.js', 'api/_lib/email-list.js', 'api/_lib/video-script.js',
    'api/_lib/fashion-suggest.js', 'api/_lib/prayer-plan.js', 'api/video-prompt.js', 'api/edu.js', 'api/_lib/openai.js'];
  for (const f of files) {
    const s = read(f);
    assert.ok(s.includes('oaLightFetch('), f + ' يستعمل oaLightFetch');
    assert.ok(!/model:\s*'gpt-4o-mini'|model:\s*'gpt-4\.1-mini'/.test(s), f + ' ما زال يثبّت موديلًا قديمًا');
  }
  assert.ok(read('api/_lib/openrouter.js').includes("model || 'openai/gpt-6-luna'"));
});

test('٤. لا موديل موقوف أو يُوقف قريبًا في نداء صور أو بحث', () => {
  const dir = path.join(root, 'api/_lib');
  for (const f of fs.readdirSync(dir)) {
    if (!/\.js$/.test(f)) continue;
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/append\('model', 'gpt-image-1'\)|model: 'gpt-image-1'/.test(s), f + ': gpt-image-1 يُوقف ٢٣ أكتوبر ٢٠٢٦');
    assert.ok(!/model: 'llama-3\.1-8b-instant'|, 'llama-3\.1-8b-instant'\)/.test(s), f + ': llama-3.1-8b-instant موقوف على Groq');
  }
  for (const f of ['design-create', 'studio-create', 'portrait-style', 'fashion-create', 'face-lock']) {
    const s = read('api/_lib/' + f + '.js');
    assert.ok(s.includes("append('model', 'gpt-image-2')"), f);
    assert.ok(!s.includes("append('input_fidelity'"), f + ': gpt-image-2 يرفض input_fidelity بـ400');
  }
  assert.ok(read('api/_lib/studio-create.js').includes("images.length > 1 ? 'image[]' : 'image'"), 'عدّة صور على gpt-image-2 = image[]');
  assert.ok(read('api/_lib/image-merge.js').includes("process.env.IMAGE_EDIT_MODEL || 'gemini-3.1-flash-image'"), 'نانو ٢٫٥ يُوقف ٢ أكتوبر');
  const mi = read('api/_lib/maha-image.js');
  assert.ok(mi.includes("(__optForceEngine === 'nano') ? 'gemini-3.1-flash-image'"));
  assert.ok(mi.includes('const nanoPrimary = /flash-image/.test(primaryModel);'), 'نانو ٢ بالصيغة النظيفة نفسها (بلا imageConfig)');
  assert.ok(mi.includes(".filter(function (m) { return m !== primaryModel; });"), 'إنقاذ نانو لا يعيد الموديل الذي فشل عليه «نانو خام»');
  const sr = read('api/_lib/search.js');
  assert.ok(sr.includes("'openai/gpt-oss-20b'"), 'بديل Groq الرسميّ');
  assert.ok(sr.includes("max_tokens: reasoning ? 400 : 3"), 'gpt-oss يفكّر — ٣ رموز كانت سترجع فارغًا');
});

test('٥. Groq: افتراضيّ السهم يُترجم لـgpt-oss-120b، والسلسلة تبدأ بالحيّ', () => {
  const od = require('../api/_lib/oa-direct.js');
  assert.equal(od.GROQ_ALIAS['meta-llama/llama-4-maverick'], 'openai/gpt-oss-120b');
  const tier = require('../api/_lib/tier.js');
  const groq = tier.freeChain({ GROQ_API_KEY: 'k', FREE_CHAIN: 'groq' }).find((s) => s.id === 'groq');
  assert.deepEqual(groq.models.slice(0, 2), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
});

test('٦. Cohere: الافتراضيّ Command A+ مع رجوع إلى Command A إن لم يصله المفتاح', () => {
  const s = read('api/_lib/cohere.js');
  assert.ok(s.includes("const COHERE_DEFAULT = 'command-a-plus-05-2026';"));
  assert.ok(s.includes("if ((upstream.status === 404 || upstream.status === 400) && model === COHERE_DEFAULT) { model = COHERE_PREV; upstream = await doFetch(messages); }"));
});

test('٧. كلود: Opus 5.5 في الوكيل وتحليل الكود والمنتقي، والاختيار القديم يُرقّى', () => {
  const agent = read('api/_lib/agent.js');
  assert.ok(agent.includes("const AGENT_DEFAULT = 'claude-opus-5-5';"));
  assert.ok(agent.includes("output_config: { effort: 'high' }"), 'افتراضيّ 5.5 medium — نُبقي عمق Opus 5');
  assert.equal(require('../api/_lib/code-analyze.js').__test.DEFAULT_MODEL, 'claude-opus-5-5');
  const chat = require('../api/_lib/chat.js');
  const { pickClaudeModel } = chat.__vmodels;
  assert.equal(pickClaudeModel('claude-opus-5', false, 'x').model, 'claude-opus-5-5');
  const m = read('js/app-29-claude-model.js');
  assert.ok(m.includes("var UPGRADES = { 'claude-opus-5': 'claude-opus-5-5' };"));
  assert.ok(read('js/app.bundle.js').includes("var UPGRADES = { 'claude-opus-5': 'claude-opus-5-5' };"), 'الحزمة أُعيد بناؤها');
  assert.ok(read('js/modes.js').includes("['claude-opus-5-5','Opus 5.5']"));
  assert.ok(read('index.html').includes('js/modes.js?v=m250925b') && read('index.html').includes('js/partials-settings.js?v=670'), 'وسوم الكاش رُفعت');
  assert.ok(read('js/app-10-features.js').includes("'anthropic/claude-opus-5': 'anthropic/claude-opus-5.5',"), 'اختيار الوسيط المحفوظ يهاجر');
});
