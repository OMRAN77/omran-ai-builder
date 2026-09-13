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

const IDS = ['claude-fable-5-1', 'claude-fable-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

test('١. القائمة: التسعة من لقطة المالك، ولكلّ منها صيغة وسيط بادئتها anthropic/', () => {
  assert.deepEqual(Object.keys(CLAUDE_MODELS), IDS);
  for (const id of IDS) {
    assert.ok(CLAUDE_MODELS[id].label, id);
    assert.ok(CLAUDE_MODELS[id].or.startsWith('anthropic/claude-'), id);
  }
  assert.equal(CLAUDE_MODELS['claude-opus-4-8'].or, 'anthropic/claude-opus-4.8', 'نقطة في الإصدار الفرعيّ كما في عرف OpenRouter');
  assert.equal(CLAUDE_MODELS['claude-sonnet-5'].or, 'anthropic/claude-sonnet-5');
});

test('٢. pickClaudeModel: المباشر يمرّر المعرّف، الوسيط يحوّله، وغير المعروف = الافتراضيّ', () => {
  assert.deepEqual(pickClaudeModel('claude-opus-5', false, 'claude-sonnet-5'), { model: 'claude-opus-5', picked: true, id: 'claude-opus-5', label: 'Opus 5' });
  assert.deepEqual(pickClaudeModel(' Claude-Haiku-4-5 ', true, 'anthropic/claude-sonnet-5'), { model: 'anthropic/claude-haiku-4.5', picked: true, id: 'claude-haiku-4-5', label: 'Haiku 4.5' });
  for (const bad of ['', null, undefined, 'gpt-5', 'claude-3-5-sonnet-latest', 'anthropic/claude-opus-5', '__proto__', 'constructor']) {
    assert.deepEqual(pickClaudeModel(bad, false, 'claude-sonnet-5'), { model: 'claude-sonnet-5', picked: false, id: '', label: '' }, String(bad));
  }
});

test('٣. الخادم: body.model على مسار كلود فقط، رجوع للافتراضيّ عند رفض النموذج، وحدث من يجيب', () => {
  const s = read('api/_lib/chat.js');
  assert.ok(s.includes("const { streamFreeChain, isModelErrorStatus } = require('./free-chain.js');"));
  assert.ok(s.includes("const __pick = prov === 'claude' ? pickClaudeModel(body && body.model, viaOR, DEFAULT_MODEL)"));
  assert.ok(s.includes('let CHAT_MODEL = __pick.model;'));
  assert.ok(s.includes("send({ modelId: __pick.picked ? __pick.id : '', modelLabel: __pick.picked ? __pick.label : '' });"));
  assert.ok(s.includes('if (!upstream.ok && __pick.picked && CHAT_MODEL !== DEFAULT_MODEL) {'));
  assert.ok(s.includes('if (isModelErrorStatus(upstream.status, __mt)) {'));
  assert.ok(s.includes("k: 'stModelFallback', p: { model: __pick.label }"));
  assert.ok(s.includes('CHAT_MODEL = DEFAULT_MODEL;'));
  assert.ok(s.includes('if (__imgCfg) __imgCfg = imageTurnConfig(process.env, viaOR, CHAT_MODEL);'), 'دور الصورة يتبع النموذج بعد الرجوع');
  assert.ok(s.includes('let __imgCfg = lastUserHasImage'));
  // الرجوع يسبق الفشل النهائيّ (الاحتياط) ويأتي بعد إعادة دور الصورة
  const imgRetry = s.indexOf("upstream = await callUpstream(false);\n      }\n      // v-claude-models");
  const fallback = s.indexOf('if (!upstream.ok && __pick.picked && CHAT_MODEL !== DEFAULT_MODEL) {');
  const finalFail = s.indexOf("await logErrorAndFlush('chat/upstream-fail'");
  assert.ok(imgRetry > 0 && fallback > imgRetry && finalFail > fallback);
});

test('٤. الواجهة: القائمة في الإعدادات بالمعرّفات نفسها، الحفظ المحلّيّ، والإرسال مع كلّ رسالة', () => {
  const p = read('js/partials-settings.js');
  const sel = p.slice(p.indexOf('<select id="claudeModel">'), p.indexOf('</select>', p.indexOf('<select id="claudeModel">')));
  assert.ok(sel.includes('<option value="">'), 'خيار الافتراضيّ');
  for (const id of IDS) assert.ok(sel.includes('<option value="' + id + '">'), id);
  assert.ok(p.includes('id="claudeModelHint"'));
  assert.ok(p.includes('data-i18n="claudeModelPick"'), 'مفتاح ترجمة مستقلّ — claudeModelLabel محجوز لبطاقة مفتاح المستخدم');
  const a29 = read('js/app-29-claude-model.js');
  assert.ok(a29.includes("var KEY = 'aiapp_claude_model';"));
  for (const id of IDS) assert.ok(a29.includes("'" + id + "'"), 'app-29 ' + id);
  assert.ok(a29.includes('window.claudeModelGet = get;'));
  assert.ok(a29.includes("el.id !== 'claudeModel'"));
  const a18 = read('js/app-18-chat-tools.js');
  assert.ok(a18.includes("model: (function () { try { return ((provider || 'claude') === 'claude' && window.claudeModelGet) ? window.claudeModelGet() : ''; }"));
  assert.ok(a18.includes("if (typeof ev.modelLabel === 'string') __model = ev.modelLabel;"));
  assert.ok(a18.includes('model: __model || undefined'));
  const i18n = read('js/app-03-i18n-data.js');
  assert.equal((i18n.match(/claudeModelPick:/g) || []).length, 2, 'عربيّ وإنجليزيّ');
  assert.equal((i18n.match(/stModelFallback:/g) || []).length, 2);
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=654'), 'كسر كاش الجزء بعد تغييره');
});

test('٥. Haiku 4.5 بلا effort في دور الصورة، والجيل الحاليّ معه', () => {
  assert.deepEqual(imageTurnConfig({}, false, 'claude-haiku-4-5'), { model: 'claude-haiku-4-5', output_config: null });
  assert.deepEqual(imageTurnConfig({}, false, 'claude-fable-5-1'), { model: 'claude-fable-5-1', output_config: { effort: 'high' } });
  assert.deepEqual(imageTurnConfig({}, false, 'claude-opus-4-6'), { model: 'claude-opus-4-6', output_config: { effort: 'high' } });
});

test('٦. طلب المحادثة بلا thinking ولا temperature — فالقائمة كلّها تمرّ بالطلب نفسه', () => {
  const s = read('api/_lib/chat.js');
  const i = s.indexOf('const callUpstream = (withImg) => fetch(CHAT_URL');
  const req = s.slice(i, s.indexOf('let upstream = await callUpstream(true);', i));
  assert.ok(req.length > 0);
  assert.ok(!/thinking|temperature|top_p|top_k/.test(req), 'Fable يرفض temperature، وHaiku يرفض adaptive');
});
