// tests/dead-models.test.cjs — v-dead-models (فحص المزوّدين ١٥ أكتوبر على توثيقهم الرسميّ): موديلات أوقفتها شركاتها
// وما زال التطبيق يناديها — كلّ نداء لها 404 أو طلب ضائع قبل البديل:
//   Kimi: kimi-k2.5 (٣١ أغسطس) وسلسلة k2 (٢٥ مايو) في تفويض Kimi Code، وkimi-for-coding ليس على api.moonshot.ai؛
//   Groq: qwen3.6-27b (١٤ سبتمبر) موديل رؤية المالك، وLlama 4 Scout (١٧ يوليو) رؤية الواجهة، وMaverick وllama-3.1-8b في السلسلة؛
//   DeepSeek: deepseek-chat (٢٤ يوليو) افتراضيّ المفتاح الخاصّ؛ Gemini: «gemini-3-flash» لا وجود له؛ Mistral: open-mistral-nemo (٣١ يوليو).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('سلاسل الطبقة المجّانيّة بلا موديل موقوف', () => {
  const tier = require('../api/_lib/tier.js');
  const S = tier.FREE_PROVIDER_SPECS;
  for (const dead of ['meta-llama/llama-4-maverick-17b-128e-instruct', 'llama-3.1-8b-instant']) assert.ok(!S.groq.models.includes(dead), 'Groq: ' + dead);
  assert.deepEqual(S.groq.models.slice(0, 2), ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], 'الحيّ أوّلًا — المجّانيّ على 20b ثمّ 120b (v-plan-models: حدود Groq لكلّ موديل)');
  // v-plan-models: الوسيط المجّانيّ بلا موديل خرج من قائمته (Qwen3-235B أُوقف ٩ أكتوبر، وLlama 4/3.3 وGemma 3 خرجت)
  // وفحص ١٦ أكتوبر الحيّ (v-models-live، كتالوج OpenRouter ٤٦٥ موديلًا): GLM 5.2 وMistral Small 3.2 وQwen2.5-VL المجّانيّة ميّتة
  const orDead = ['qwen/qwen3-235b-a22b:free', 'meta-llama/llama-4-maverick:free', 'meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free', 'z-ai/glm-5.2:free', 'mistralai/mistral-small-3.2-24b-instruct:free', 'qwen/qwen2.5-vl-72b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free'];
  for (const dead of orDead) assert.ok(!S.openrouter.models.includes(dead) && !S.openrouter.visionModels.includes(dead), 'OpenRouter: ' + dead);
  assert.equal(S.openrouter.visionModels[0], 'google/gemma-4-31b-it:free', 'Gemma 4 يرى أوّلًا');
  for (const m of S.openrouter.models) assert.ok(S.openrouter.pick.test(m), 'استكشاف الوسيط يلتقط ' + m);
  assert.ok(S.groq.pick.test('qwen/qwen3.8-27b'), 'استكشاف /models يلتقط Qwen3.8');
  assert.ok(!S.gemini.models.includes('gemini-3-flash'), 'Gemini: معرّف غير موجود');
  assert.equal(S.gemini.models[0], 'gemini-flash-latest');
  assert.ok(S.gemini.models.includes('gemini-3.8-flash'));
  assert.ok(!S.mistral.models.includes('open-mistral-nemo') && !S.mistral.pick.test('open-mistral-nemo'), 'Mistral: Nemo موقوف');
  assert.ok(S.mistral.models.includes('ministral-8b-latest'), 'بديله الرسميّ');
});

test('رؤية Groq: Qwen3.8 27B للمالك وللواجهة', () => {
  const ov = require('../api/_lib/owner-vision.js');
  assert.equal(ov.VISION.groq.direct, 'qwen/qwen3.8-27b');
  const src = read('js/app-06-checkout.js');
  assert.match(src, /const GROQ_VISION_MODEL = 'qwen\/qwen3\.8-27b';/);
  assert.ok(!/llama-4-scout-17b-16e-instruct';/.test(src), 'Scout لا يُنادى');
});

test('DeepSeek بالمفتاح الخاصّ: المحفوظ القديم يُترجم كما في الخادم، لا يُرسل deepseek-chat حرفيًّا', () => {
  const src = read('js/app-06-checkout.js');
  const fn = src.slice(src.indexOf('async function callDeepSeek('), src.indexOf('async function callDeepSeek(') + 1500);
  const m = fn.match(/const __dsSaved = [^\n]+\n\s*const model = ([^\n]+);/);
  assert.ok(m, 'الترجمة قبل أيّ نداء');
  const pick = (saved) => new Function('__dsSaved', 'return ' + m[1])(String(saved || '').toLowerCase());
  assert.equal(pick(''), 'deepseek-flash');
  assert.equal(pick('deepseek-chat'), 'deepseek-flash');
  assert.equal(pick('deepseek-reasoner'), 'deepseek-v4-pro');
  assert.equal(pick('DeepSeek-V4-Pro'), 'deepseek-v4-pro');
  assert.equal(pick('deepseek-v4-flash'), 'deepseek-flash');
  assert.ok(!/\|\| 'deepseek-chat'/.test(src), 'لا افتراضيّ موقوف في الإعدادات');
  assert.ok(read('js/partials-settings.js').includes('placeholder="deepseek-flash"'));
  assert.ok(read('js/partials-settings.js').includes('placeholder="command-a-03-2025"'), 'Cohere: command-r-plus موقوف منذ ١٥ سبتمبر ٢٠٢٥');
  const v = Number((read('index.html').match(/partials-settings\.js\?v=(\d+)/) || [])[1] || 0);
  assert.ok(v > 695, 'كسر كاش الجزء بعد تغييره');
});

test('تفويض Kimi Code: kimi-k3 افتراضيًّا في الأداة والورك فلو', () => {
  const D = require('../api/_lib/agent-delegate.js');
  assert.deepEqual(D.KIMI_MODEL_IDS, ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6']);
  const wf = read('.github/workflows/kimi-agent.yml');
  assert.ok(wf.includes("default: 'kimi-k3'") && !wf.includes("default: 'kimi-k2.5'"));
  assert.ok(wf.includes('KIMI_MODEL_BASE_URL: https://api.moonshot.ai/v1'), 'المنصّة المفتوحة — kimi-for-coding ليس عليها');
});

// v-dead-models-2 (طلب المالك «أبدأ» ١٦ أكتوبر): الأسماء الثلاثة التي بقيت ميّتة في فحص v-models-live على الفرع بعد #1099 —
// وخيار GLM في منتقي OpenRouter الذي لا يقرؤه الفحص (قيم <option> في الجزء لا تُستخرج).
test('الدفعة الثانية: لا Sonnet 4 في العميل، ولا معاينة نانو ٢٫٥، ولا GLM 5.2 في المنتقي — والمحفوظ قديمًا يهاجر', () => {
  const snap = read('js/app-16-snapbuild.js');
  assert.ok(snap.includes("return claudeProxyRequest('claude-sonnet-5', ") && !snap.includes('claude-sonnet-4-20250514'), 'snapbuild بالاسم الذي يترجمه الخادم أصلًا');
  assert.match(read('api/_lib/claude.js'), /useModel === 'claude-sonnet-4-20250514'\) useModel = 'claude-sonnet-5';/, 'الترجمة في الخادم باقية للعميل القديم في الكاش');
  const mi = read('api/_lib/maha-image.js');
  assert.ok(!mi.includes("'gemini-2.5-flash-image-preview'") && mi.includes("'gemini-2.5-flash-image'].filter("), 'خطّ الإنقاذ ٢٫٥ الحيّ وحده');

  const ps = read('js/partials-settings.js');
  assert.ok(!ps.includes('value="z-ai/glm-5.2:free"') && ps.includes('placeholder="claude-sonnet-5"') && !ps.includes('claude-sonnet-4-20250514'));
  const sel = ps.slice(ps.indexOf('<select id="openrouterModelSelect">'), ps.indexOf('</optgroup>', ps.indexOf('<select id="openrouterModelSelect">')));
  const free = [...sel.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  const S = require('../api/_lib/tier.js').FREE_PROVIDER_SPECS.openrouter;
  assert.ok(free.length >= 3);
  for (const m of free) assert.ok(S.models.includes(m), 'خيار المنتقي المجّانيّ من قائمة الوسيط التي يفحصها v-models-live: ' + m);
  const v = Number((read('index.html').match(/partials-settings\.js\?v=(\d+)/) || [])[1] || 0);
  assert.ok(v > 697, 'كسر كاش الجزء بعد تغييره');

  const ft = read('js/app-10-features.js');
  const i = ft.indexOf('(function migrateOpenrouterModel(){'), j = ft.indexOf('})();', i) + 5;
  const run = (saved) => {
    const store = { aiapp_openrouter_model: saved };
    const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, val) => { store[k] = String(val); } };
    new Function('localStorage', '__swallow', ft.slice(i, j))(ls, () => {});
    return store.aiapp_openrouter_model;
  };
  assert.equal(run('z-ai/glm-5.2:free'), 'nvidia/nemotron-3-ultra-550b-a55b:free', 'من اختار GLM 5.2 قديمًا');
  assert.equal(run('mistralai/mistral-7b-instruct:free'), 'nvidia/nemotron-3-ultra-550b-a55b:free', 'الترحيل القديم لا يقود إلى اسم ميّت');
  assert.equal(run('google/gemma-4-31b-it:free'), 'google/gemma-4-31b-it:free', 'الحيّ لا يُمسّ');
});

test('دراسة الإنشاء: نصّها على Flash الحيّ بلا تفكير، واسمه مرئيّ لفحص v-models-live (gemini-2.0-flash كان مخفيًّا داخل الرابط وميّتًا)', () => {
  const src = read('api/_lib/construction-create.js');
  const line = src.split('\n').find((l) => l.includes('const textModel = '));
  assert.ok(line && line.includes("const textModel = 'gemini-flash-latest';") && line.includes("/v1beta/models/' + textModel + ':generateContent?key='"));
  assert.ok(!/gemini-2\.0-flash/.test(src.replace(/\/\/[^\n]*/g, '')), 'لا اسم ميّت في الكود (التعليق وحده يذكره)');
  const body = src.split('\n').find((l) => l.includes('const textReqBody = '));
  const textReqBody = new Function('textPrompt', body.replace(/^\s*const textReqBody = /, 'return ').replace(/;\s*\/\/.*$/, ';'))('خطة');
  assert.deepEqual(textReqBody, { contents: [{ parts: [{ text: 'خطة' }] }], generationConfig: { thinkingConfig: { thinkingBudget: 0 } } });
  const L = require('../scripts/lib/models-live.cjs');
  const { models } = L.extractModels(path.join(__dirname, '..'), require('../scripts/models-live-ignore.json'));
  const at = models.find((m) => m.id === 'gemini-flash-latest');
  assert.ok(at && at.where.some((w) => w.startsWith('api/_lib/construction-create.js:')), 'الفحص يرى موديل الدراسة الآن');
  assert.ok(!models.some((m) => ['gemini-2.0-flash', 'claude-sonnet-4-20250514', 'gemini-2.5-flash-image-preview', 'z-ai/glm-5.2:free'].includes(m.id)), 'الأسماء الأربعة الميّتة لا يناديها الكود');
});
