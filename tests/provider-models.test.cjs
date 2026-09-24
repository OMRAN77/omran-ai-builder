'use strict';
/* v-provider-models (أمر المالك ٢٢ سبتمبر «كلّ واحد وموديله بالضبط»): موديلات المزوّدين غير كلود في
   شريط السهم كانت أسماء عرض لا تصل الخادم. الآن قائمة حيّة من OpenRouter، والاختيار يصل chat.js
   ويُقبل للمالك بالبادئة الصحيحة، ورفضه = رجوع للافتراضيّ مع سطر حالة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-provider-models'; // chat.js يرفض التحميل بلا سرّ
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pm = require('../api/_lib/provider-models.js');

test('١. pickProviderModel: معرّف OpenRouter بالبادئة الصحيحة يُقبل، وغيره = الافتراضيّ', () => {
  assert.deepEqual(pm.pickProviderModel('openai', 'openai/gpt-5.6-terra', 'x'), { model: 'openai/gpt-5.6-terra', picked: true, id: 'openai/gpt-5.6-terra', label: 'gpt-5.6-terra' });
  assert.equal(pm.pickProviderModel('gemini', 'google/gemini-3.5-flash', 'x').picked, true);
  assert.equal(pm.pickProviderModel('groq', 'meta-llama/llama-4-maverick', 'x').picked, true);
  const bad = [['openai', 'gpt-6-astra'], ['openai', 'google/gemini-3.5-flash'], ['openai', ''], ['openai', 'openai/../x'], ['openai', 'openai/gpt 5'],
    ['claude', 'anthropic/claude-sonnet-5'], ['nope', 'openai/gpt-5.6-terra'], ['openai', null]];
  for (const [prov, req] of bad) assert.deepEqual(pm.pickProviderModel(prov, req, 'fallback'), { model: 'fallback', picked: false, id: '', label: '' }, prov + ' ' + req);
});

test('٢. parseModels: بالبادئة، الأحدث أوّلًا، بلا متغيّرات ولا صور، ثمانية كحدّ، والاسم بلا «الشركة: »', () => {
  const data = [];
  for (let i = 0; i < 12; i++) data.push({ id: 'openai/m' + i, name: 'OpenAI: M' + i, created: 1000 + i, architecture: { output_modalities: ['text'] } });
  data.push({ id: 'openai/free:free', name: 'x', created: 9999 });
  data.push({ id: 'openai/img', name: 'OpenAI: Img', created: 9998, architecture: { output_modalities: ['image'] } });
  data.push({ id: 'google/gemini-3.5-flash', name: 'Google: Gemini 3.5 Flash', created: 5 });
  data.push({ id: 'anthropic/claude-sonnet-5', name: 'Anthropic: Claude Sonnet 5', created: 5 });
  data.push({ id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', created: 5 });
  const out = pm.parseModels({ data });
  assert.equal(out.openai.length, 8);
  assert.deepEqual(out.openai[0], ['openai/m11', 'M11']);
  assert.ok(!out.openai.some((r) => r[0].indexOf(':') !== -1 || r[0] === 'openai/img'));
  assert.deepEqual(out.gemini, [['google/gemini-3.5-flash', 'Gemini 3.5 Flash']]);
  assert.deepEqual(out.groq, [['meta-llama/llama-4-maverick', 'Llama 4 Maverick']]);
  assert.equal(out.claude, undefined, 'كلود على قائمته الثابتة (المسار المباشر)');
  assert.deepEqual(pm.parseModels(null), {});
});

test('٣. loadModels: الشبكة مرّة ثمّ الذاكرة؛ والمعالج يرفض غير المالك', async () => {
  let calls = 0;
  const fetchStub = async () => { calls++; return { ok: true, json: async () => ({ data: [{ id: 'openai/gpt-5.6-terra', name: 'OpenAI: GPT-5.6 Terra', created: 1 }] }) }; };
  const a = await pm.loadModels({ fetch: fetchStub, noKv: true });
  const b = await pm.loadModels({ fetch: fetchStub, noKv: true });
  assert.equal(calls, 1);
  assert.equal(a.source, 'network');
  assert.equal(b.source, 'memory');
  assert.deepEqual(a.models.openai, [['openai/gpt-5.6-terra', 'GPT-5.6 Terra']]);
  const res = { s: 0, j: null, status(c) { this.s = c; return this; }, json(j) { this.j = j; }, setHeader() {}, end() {} };
  await pm({ method: 'POST', query: {}, body: {} }, res);
  assert.equal(res.s, 403);
  assert.deepEqual(res.j, { error: 'owner_only' });
});

test('٤. الخادم: chat.js يقبل body.model للمالك على وسيط OpenRouter، والمسار يُسجَّل في ai.js، والمباشر يقصّ البادئة', () => {
  const chat = read('api/_lib/chat.js');
  assert.ok(chat.includes("const __pick = (prov === 'claude' && __ownerReq) ? pickClaudeModel(body && body.model, viaOR, DEFAULT_MODEL) : ((__ownerReq && viaOR) ? require('./provider-models.js').pickProviderModel(prov, body && body.model, DEFAULT_MODEL) : { model: DEFAULT_MODEL, picked: false, id: '', label: '' });"));
  // الرجوع للافتراضيّ عند رفض الوسيط — الآليّة نفسها لكلّ موديل مختار (v-claude-models)
  assert.ok(chat.includes('if (!upstream.ok && __pick.picked && CHAT_MODEL !== DEFAULT_MODEL) {'));
  assert.ok(read('api/ai.js').includes("case 'models': return require('./_lib/provider-models.js');"));
  assert.ok(read('api/_lib/openai.js').includes("if (useModel.indexOf('/') !== -1) useModel = useModel.split('/').pop();"));
  // دور الصورة لا يكسر معرّف OpenRouter
  const { imageTurnConfig } = require('../api/_lib/chat.js').__vimg;
  assert.equal(imageTurnConfig({}, true, 'openai/gpt-5.6-terra').model, 'openai/gpt-5.6-terra');
});

test('٥. الواجهة: افتراضيّات السهم = ثوابت الخادم، القائمة الحيّة، والموديل يُرسل لكلّ مزوّد', () => {
  const modes = read('js/modes.js');
  const chat = read('api/_lib/chat.js');
  const orBlock = chat.slice(chat.indexOf('const OR_MODELS = {'), chat.indexOf('};', chat.indexOf('const OR_MODELS = {')));
  const orDefaults = {};
  for (const m of orBlock.matchAll(/^\s+(\w+): '([^']+)'/gm)) orDefaults[m[1]] = m[2];
  for (const k of ['openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere']) {
    assert.ok(orDefaults[k], 'OR_MODELS ' + k);
    const re = new RegExp("key:'" + k + "',[^\\n]*or:true,[^\\n]*def:'" + orDefaults[k].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + "'");
    assert.match(modes, re, 'افتراضيّ السهم لـ' + k + ' = ' + orDefaults[k]);
  }
  assert.ok(!modes.includes("'gpt-6-astra'"), 'الأسماء غير الموصولة أُزيلت');
  assert.ok(modes.includes("window.omranModelFor = function(k){"), 'مزوّد الموديل للعميل');
  assert.ok(modes.includes("fetch('/api/ai?action=models'"), 'القائمة الحيّة');
  assert.ok(modes.includes("if(pv.or && !pv.direct && v && v.indexOf('/') === -1) v = '';"), 'معرّف قديم بلا بادئة = الافتراضيّ (إلّا Groq المباشر — v-owner-direct)');
  for (const f of ['js/app-18-chat-tools.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes("window.claudeModelGet() : (window.omranModelFor ? window.omranModelFor(provider || 'claude') : '');"), f);
  }
  assert.ok(read('index.html').includes('js/modes.js?v=m240924a'), 'وسم كاش modes رُفع');
});
