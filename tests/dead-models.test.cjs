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
