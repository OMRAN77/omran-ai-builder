// tests/claude-models.test.cjs — v-claude-models: «ممكن تضيف هذيل كلهم» — اختيار نموذج كلود
// من الإعدادات. يثبت: (١) القائمة الحصريّة والتحويل لصيغة الوسيط، (٢) طلب خارج القائمة = الافتراضيّ،
// (٣) الخادم يقرأ body.model على مسار كلود ويرجع للافتراضيّ عند رفض النموذج ويبثّ من يجيب،
// (٤) الواجهة: القائمة في الإعدادات بالمعرّفات نفسها، والحفظ المحلّيّ، والإرسال مع كلّ رسالة،
// (٥) Haiku بلا effort في دور الصورة، (٦) لا thinking ولا temperature في طلب المحادثة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-models';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const chat = require('../api/_lib/chat.js');
const { CLAUDE_MODELS, pickClaudeModel } = chat.__vmodels;
const { imageTurnConfig } = chat.__vimg;

// v-models-family (أمر عمران ١٥ سبتمبر): عائلة كلود ٥ كاملة في منتقي السهم للمالك.
// v-models-latest (٢٥ سبتمبر): Opus 5 ← Opus 5.5.
const IDS = ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'];

test('١. القائمة: عائلة كلود ٥ كاملة، ولكلّ منها صيغة وسيط بادئتها anthropic/', () => {
  assert.deepEqual(Object.keys(CLAUDE_MODELS), IDS);
  for (const id of IDS) {
    assert.ok(CLAUDE_MODELS[id].label, id);
    assert.ok(CLAUDE_MODELS[id].or.startsWith('anthropic/claude-'), id);
  }
  assert.equal(CLAUDE_MODELS['claude-opus-5-5'].or, 'anthropic/claude-opus-5.5');
  assert.equal(CLAUDE_MODELS['claude-sonnet-5'].or, 'anthropic/claude-sonnet-5');
  assert.equal(CLAUDE_MODELS['claude-haiku-4-5'].or, 'anthropic/claude-haiku-4.5');
  assert.equal(CLAUDE_MODELS['claude-fable-5-1'].or, 'anthropic/claude-fable-5.1');
});

test('٢. pickClaudeModel: المباشر يمرّر المعرّف، الوسيط يحوّله، وغير المعروف = الافتراضيّ', () => {
  assert.deepEqual(pickClaudeModel('claude-opus-5-5', false, 'claude-sonnet-5'), { model: 'claude-opus-5-5', picked: true, id: 'claude-opus-5-5', label: 'Opus 5.5' });
  // اختيار محفوظ قديم (Opus 5) يُرقّى إلى 5.5 لا يرجع صامتًا للافتراضيّ
  assert.deepEqual(pickClaudeModel('claude-opus-5', true, 'anthropic/claude-sonnet-5'), { model: 'anthropic/claude-opus-5.5', picked: true, id: 'claude-opus-5-5', label: 'Opus 5.5' });
  assert.deepEqual(pickClaudeModel(' Claude-Sonnet-5 ', true, 'anthropic/claude-sonnet-5'), { model: 'anthropic/claude-sonnet-5', picked: true, id: 'claude-sonnet-5', label: 'Sonnet 5' });
  assert.deepEqual(pickClaudeModel('claude-haiku-4-5', false, 'claude-sonnet-5'), { model: 'claude-haiku-4-5', picked: true, id: 'claude-haiku-4-5', label: 'Haiku 4.5' });
  assert.deepEqual(pickClaudeModel('claude-fable-5-1', true, 'anthropic/claude-sonnet-5'), { model: 'anthropic/claude-fable-5.1', picked: true, id: 'claude-fable-5-1', label: 'Fable 5.1' });
  // خارج العائلة (أجيال سابقة أو مزوّد آخر أو مفاتيح خطرة) = الافتراضيّ
  for (const bad of ['', null, undefined, 'gpt-5', 'claude-opus-4-8', 'anthropic/claude-opus-5.5', '__proto__', 'constructor']) {
    assert.deepEqual(pickClaudeModel(bad, false, 'claude-sonnet-5'), { model: 'claude-sonnet-5', picked: false, id: '', label: '' }, String(bad));
  }
});

test('٣. الخادم: body.model على مسار كلود فقط، رجوع للافتراضيّ عند رفض النموذج، وحدث من يجيب', () => {
  const s = read('api/_lib/chat.js');
  assert.ok(s.includes("const { streamFreeChain, isModelErrorStatus } = require('./free-chain.js');"));
  // v-models-owner: اختيار الموديل للمالك وحده — غير المالك على الافتراضيّ.
  assert.ok(s.includes("require('./_owner.js').isOwnerName"), 'بوّابة المالك لاختيار الموديل');
  assert.ok(s.includes("const __pick = (prov === 'claude' && __ownerReq) ? pickClaudeModel(body && body.model, viaOR, DEFAULT_MODEL)"));
  assert.ok(s.includes('let CHAT_MODEL = __pick.model;'));
  assert.ok(s.includes("send({ modelId: __pick.picked ? __pick.id : '', modelLabel: __pick.picked ? __pick.label : '' });"));
  assert.ok(s.includes('if (!upstream.ok && __pick.picked && CHAT_MODEL !== DEFAULT_MODEL) {'));
  assert.ok(s.includes('if (isModelErrorStatus(upstream.status, __mt)) {'));
  assert.ok(s.includes("k: 'stModelFallback', p: { model: __pick.label }"));
  assert.ok(s.includes('CHAT_MODEL = DEFAULT_MODEL;'));
  assert.ok(s.includes('if (__imgCfg) __imgCfg = imageTurnConfig(process.env, viaOR, CHAT_MODEL);'), 'دور الصورة يتبع النموذج بعد الرجوع');
  assert.ok(s.includes('let __imgCfg = (lastUserHasImage && !__direct)'));
  // الرجوع يسبق الفشل النهائيّ (الاحتياط) ويأتي بعد إعادة دور الصورة
  const imgRetry = s.indexOf("upstream = await callUpstream(false);\n      }\n      // v-claude-models");
  const fallback = s.indexOf('if (!upstream.ok && __pick.picked && CHAT_MODEL !== DEFAULT_MODEL) {');
  const finalFail = s.indexOf("await logErrorAndFlush('chat/upstream-fail'");
  assert.ok(imgRetry > 0 && fallback > imgRetry && finalFail > fallback);
});

test('٤. الواجهة: مبدّل النموذج في قائمة «+» (للمالك) لا في الإعدادات، والحفظ المحلّيّ والإرسال', () => {
  // v-models-two: منتقي النماذج حُذف من الإعدادات ونُقل إلى قائمة «+».
  const p = read('js/partials-settings.js');
  assert.ok(!p.includes('<select id="claudeModel">'), 'منتقي الإعدادات حُذف');
  const modes = read('js/modes.js');
  // v-model-chip: الاختيار مؤشّر أسفل الصندوق لا بند في «+».
  assert.ok(modes.includes("wrap.id = 'omModelWrap'") && modes.includes("chip.id = 'omModelChip'"), 'مؤشّر النموذج أسفل الصندوق');
  assert.ok(!modes.includes('model:true'), 'بند «النموذج» أُزيل من قائمة «+»');
  assert.ok(modes.includes("localStorage.setItem('aiapp_agent_model'"), 'المبدّل يضبط موديل الوكيل أيضًا');
  assert.ok(modes.includes("localStorage.setItem('aiapp_claude_model'"), 'والمحادثة');
  const a29 = read('js/app-29-claude-model.js');
  assert.ok(a29.includes("var KEY = 'aiapp_claude_model';"));
  for (const id of IDS) assert.ok(a29.includes("'" + id + "'"), 'app-29 ' + id);
  assert.ok(a29.includes('window.claudeModelGet = get;'));
  assert.ok(a29.includes("el.id !== 'claudeModel'"));
  const a18 = read('js/app-18-chat-tools.js');
  // v-provider-models: لبقيّة المزوّدين معرّف OpenRouter من شريط السهم (omranModelFor)؛ كلود كما كان.
  assert.ok(a18.includes("model: (function () { try { return ((provider || 'claude') === 'claude' && window.claudeModelGet) ? window.claudeModelGet() : (window.omranModelFor ? window.omranModelFor(provider || 'claude') : ''); }"));
  assert.ok(a18.includes("if (typeof ev.modelLabel === 'string') __model = ev.modelLabel;"));
  assert.ok(a18.includes('model: __model || undefined'));
  const i18n = read('js/app-03-i18n-data.js');
  assert.equal((i18n.match(/claudeModelPick:/g) || []).length, 2, 'عربيّ وإنجليزيّ');
  assert.equal((i18n.match(/stModelFallback:/g) || []).length, 2);
  // v-custom-instructions: رُفع إلى 657 بعد إضافة حقل التعليمات المخصّصة للقسم؛ v-plan-routing: 659
  // (بطاقات الباقات)؛ v-maha-voice-speed: 660 (أزرار سرعة صوت مها في قسم الصوت).
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=675'), 'كسر كاش الجزء بعد تغييره');
});

test('٥. Haiku 4.5 بلا effort في دور الصورة، والجيل الحاليّ معه', () => {
  assert.deepEqual(imageTurnConfig({}, false, 'claude-haiku-4-5'), { model: 'claude-haiku-4-5', output_config: null });
  assert.deepEqual(imageTurnConfig({}, false, 'claude-fable-5-1'), { model: 'claude-fable-5-1', output_config: { effort: 'high' } });
  assert.deepEqual(imageTurnConfig({}, false, 'claude-opus-4-6'), { model: 'claude-opus-4-6', output_config: { effort: 'high' } });
});

test('٦. طلب المحادثة بلا thinking ولا temperature — فالقائمة كلّها تمرّ بالطلب نفسه', () => {
  const s = read('api/_lib/chat.js');
  const i = s.indexOf('const callUpstream = (withImg) => __upFetch(CHAT_URL');
  const req = s.slice(i, s.indexOf('let upstream = await callUpstream(true);', i));
  assert.ok(req.length > 0);
  assert.ok(!/thinking|temperature|top_p|top_k/.test(req), 'Fable يرفض temperature، وHaiku يرفض adaptive');
});

// v-chat-economy (أمر المالك ٢٣ سبتمبر «كلاود الرئيسي للمحادثات يكون الاقتصادي»): الافتراضيّ Haiku 4.5
// على الخطّين (المباشر والوسيط)، وفي منتقي المالك وتلميحه — Sonnet لم يعد يُوصف بالافتراضيّ.
test('٧. الافتراضيّ الاقتصاديّ: Haiku 4.5 في الخادم والمنتقي والتلميح', () => {
  const s = read('api/_lib/chat.js');
  assert.equal((s.match(/process\.env\.CHAT_CLAUDE_MODEL \|\| 'claude-haiku-4-5'/g) || []).length, 2, 'الخطّ المباشر ومسار الباقة');
  assert.ok(!/process\.env\.CHAT_CLAUDE_MODEL \|\| 'claude-sonnet-5'/.test(s), 'لا بقايا Sonnet افتراضيًّا');
  assert.match(s, /\n  claude: 'anthropic\/claude-haiku-4\.5',/, 'الوسيط: OR_MODELS.claude');
  assert.equal(CLAUDE_MODELS['claude-haiku-4-5'].or, 'anthropic/claude-haiku-4.5', 'صيغة الوسيط نفسها في القائمة');
  const modes = read('js/modes.js');
  assert.ok(modes.includes("store:'aiapp_claude_model',     def:'claude-haiku-4-5',"), 'منتقي المالك: الافتراضيّ Haiku');
  const picker = read('js/app-29-claude-model.js');
  assert.ok(picker.includes("'': ['الافتراضيّ: Haiku 4.5"), 'التلميح بلا اختيار');
  assert.ok(/'claude-haiku-4-5': \['[^']*هو الافتراضيّ/.test(picker) && !/'claude-sonnet-5': \['[^']*الافتراضيّ/.test(picker), 'وصف الافتراضيّ انتقل لـHaiku');
  assert.ok(read('index.html').includes('js/modes.js?v=m250925b'), 'وسم كاش modes رُفع');
});
