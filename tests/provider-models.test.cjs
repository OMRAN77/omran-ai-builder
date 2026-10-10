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
  for (let i = 0; i < 12; i++) data.push({ id: 'openai/m' + i, name: 'OpenAI: M' + i, created: 1000 + i, architecture: { output_modalities: ['text'] }, supported_parameters: ['tools', 'temperature'] });
  data.push({ id: 'openai/free:free', name: 'x', created: 9999 });
  data.push({ id: 'openai/img', name: 'OpenAI: Img', created: 9998, architecture: { output_modalities: ['image'] } });
  data.push({ id: 'google/gemini-3.5-flash', name: 'Google: Gemini 3.5 Flash', created: 5, supported_parameters: ['tools'] });
  data.push({ id: 'anthropic/claude-sonnet-5', name: 'Anthropic: Claude Sonnet 5', created: 5, supported_parameters: ['tools'] });
  data.push({ id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', created: 5, supported_parameters: ['tools'] });
  const out = pm.parseModels({ data });
  assert.equal(out.openai.length, 8);
  assert.deepEqual(out.openai[0], ['openai/m11', 'M11']);
  assert.ok(!out.openai.some((r) => r[0].indexOf(':') !== -1 || r[0] === 'openai/img'));
  assert.deepEqual(out.gemini, [['google/gemini-3.5-flash', 'Gemini 3.5 Flash']]);
  assert.deepEqual(out.groq, [['meta-llama/llama-4-maverick', 'Llama 4 Maverick']]);
  assert.equal(out.claude, undefined, 'كلود على قائمته الثابتة (المسار المباشر)');
  assert.deepEqual(pm.parseModels(null), {});
});

test('٢ب. v-prov-tools-filter: القائمة الحيّة تعرض فقط ما يدعم tools — وPerplexity مستثنى', () => {
  const data = [
    { id: 'cohere/command-a-plus', name: 'Cohere: Command A+', created: 10, supported_parameters: ['tools', 'temperature'] },
    { id: 'cohere/command-a', name: 'Cohere: Command A', created: 9, supported_parameters: ['temperature'] },
    { id: 'cohere/legacy-nofield', name: 'Cohere: Legacy', created: 8 },
    { id: 'perplexity/sonar', name: 'Perplexity: Sonar', created: 10, supported_parameters: ['temperature'] },
    { id: 'perplexity/sonar-pro', name: 'Perplexity: Sonar Pro', created: 9 },
  ];
  const out = pm.parseModels({ data });
  assert.deepEqual(out.cohere, [['cohere/command-a-plus', 'Command A+']], 'بلا tools = خارج القائمة (والمفقود الحقل كذلك)');
  assert.deepEqual(out.perplexity, [['perplexity/sonar', 'Sonar'], ['perplexity/sonar-pro', 'Sonar Pro']], 'Perplexity بلا فلترة — مساره بلا أدوات أصلًا');
  assert.match(read('api/_lib/provider-models.js'), /provmodels:v4/, 'مفتاح الكاش رُفع ليُسقط القوائم غير المفلترة');
});

test('٣. loadModels: الشبكة مرّة ثمّ الذاكرة؛ والمعالج يرفض غير المالك', async () => {
  let calls = 0;
  const fetchStub = async () => { calls++; return { ok: true, json: async () => ({ data: [{ id: 'openai/gpt-5.6-terra', name: 'OpenAI: GPT-5.6 Terra', created: 1, supported_parameters: ['tools'] }] }) }; };
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
  // v-owner-solo: افتراضيّ Groq في السهم = افتراضيّ Groq المباشر (الذي يجيب فعلًا عند Groq)، لا Llama 4 Maverick الذي أوقفه Groq
  assert.equal(require('../api/_lib/oa-direct.js').directModel('groq', '', {}).def, 'openai/gpt-oss-120b');
  assert.match(modes, /key:'groq',[^\n]*or:true,[^\n]*def:'openai\/gpt-oss-120b'/);
  for (const k of ['openai', 'gemini', 'deepseek', 'mistral', 'cohere']) {
    assert.ok(orDefaults[k], 'OR_MODELS ' + k);
    const re = new RegExp("key:'" + k + "',[^\\n]*or:true,[^\\n]*def:'" + orDefaults[k].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'");
    assert.match(modes, re, 'افتراضيّ السهم لـ' + k + ' = ' + orDefaults[k]);
  }
  assert.ok(modes.includes("['openai/gpt-6-astra','GPT-6 Astra']") && modes.includes("['openai/gpt-6-sol','GPT-6 Sol']") && modes.includes("['openai/gpt-6-luna','GPT-6 Luna']"), 'احتياط منتقي OpenAI يطابق الموديلات الرسميّة');
  assert.ok(modes.includes("window.omranModelFor = function(k){"), 'مزوّد الموديل للعميل');
  assert.ok(modes.includes("fetch('/api/ai?action=models'"), 'القائمة الحيّة');
  assert.ok(modes.includes("if(pv.or && !pv.direct && v && v.indexOf('/') === -1) v = '';"), 'معرّف قديم بلا بادئة = الافتراضيّ (إلّا Groq المباشر — v-owner-direct)');
  for (const f of ['js/app-18-chat-tools.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes("window.claudeModelGet() : (window.omranModelFor ? window.omranModelFor(provider || 'claude') : '');"), f);
  }
  assert.ok(read('index.html').includes('js/modes.js?v=m101026a'), 'وسم كاش modes رُفع');
});

test('٦. v-cohere-prefix (الخادم): تجريد بادئة الوسيط + قائمة مسحوبات مصحّحة رسميًّا + شبكة أمان', () => {
  const co = read('api/_lib/cohere.js');
  // البادئة تُجرَد قبل الفحص والإرسال — «cohere/command-r-08-2024» لم تعد تصل api.cohere.com حرفيًّا
  assert.match(co, /if \(model\.toLowerCase\(\)\.indexOf\('cohere\/'\) === 0\) model = model\.slice\(7\);/);
  // قائمة المسحوبات على دورة حياة Cohere الرسميّة: 03-2024/04-2024 والمستعارات — لا لقطتا 08-2024 (Live)
  assert.match(co, /'command-r-03-2024'/, 'النسخة المسحوبة فعلًا موجودة');
  assert.match(co, /'command-r-plus-04-2024'/, 'نسخة R+ المسحوبة فعلًا');
  assert.ok(!/'command-r-08-2024'/.test(co), 'command-r-08-2024 حيّ رسميًّا — لا يُرقَّى ولا يُحجب');
  assert.ok(!/'command-r-plus-08-2024'/.test(co), 'command-r-plus-08-2024 حيّ رسميًّا كذلك');
  // شبكة الأمان: أيّ 404/400 على موديل مختار غير افتراضيّ = رجوع للافتراضيّ قبل إظهار الخطأ
  assert.match(co, /upstream\.status === 404 \|\| upstream\.status === 400\) && model !== COHERE_DEFAULT && model !== COHERE_PREV/);
});

test('٧. v-cohere-prefix (العميل): normalizeCohereModel يجرّد البادئة ويصحّح المسحوبات', () => {
  const src = read('js/app-06-checkout.js');
  const start = src.indexOf('const COHERE_RETIRED_SET');
  const end = src.indexOf('async function callCohere');
  assert.ok(start !== -1 && end > start, 'كتلة التطبيع موجودة');
  const vm = require('vm');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end), sandbox);
  const norm = sandbox.normalizeCohereModel;
  assert.equal(typeof norm, 'function');
  assert.equal(norm('cohere/command-r-08-2024'), 'command-r-08-2024', 'البادئة تُجرَد واللقطة الحيّة تمرّ كما هي');
  assert.equal(norm('command-r-plus-08-2024'), 'command-r-plus-08-2024', 'لقطة R+ الحيّة لا تُرقَّى');
  assert.equal(norm('cohere/command-r'), 'command-a-03-2025', 'المستعار المسحوب يُرقَّى');
  assert.equal(norm('command-r-03-2024'), 'command-a-03-2025', 'النسخة المسحوبة ١٥ سبتمبر ٢٠٢٥');
  assert.equal(norm('cohere/command-light'), 'command-a-03-2025');
  assert.equal(norm(''), 'command-a-03-2025', 'بلا محفوظ = الافتراضيّ');
  // شبكة الأمان: 404 على مختار محفوظ = مسح + إعادة بالافتراضيّ مرّة واحدة
  assert.match(src, /if\(!res\.ok && res\.status === 404 && model !== COHERE_SAFE_MODEL\)/);
  assert.match(src, /localStorage\.removeItem\('aiapp_cohere_model'\)/);
});

test('٨. الحزمة المبنيّة تحوي إصلاحات Cohere (npm run bundle شُغّل)', () => {
  const bundle = read('js/app.bundle.js');
  assert.match(bundle, /COHERE_RETIRED_SET/, 'تطبيع العميل في الحزمة');
  assert.match(bundle, /command-r-03-2024/, 'القائمة المصحّحة في الحزمة');
});

test('٩. v-cohere-prefix (العميل) يعمل فعلًا: المعرّف المجرّد يُرسل والاختيار الحيّ لا يُمحى، والمسحوب يُستبدل، و404 = إعادة واحدة بالافتراضيّ', async () => {
  const src = read('js/app-06-checkout.js');
  const block = src.slice(src.indexOf('const COHERE_RETIRED_SET'), src.indexOf('async function fetchClaudeModelList'));
  const vm = require('vm');
  async function call(stored, statuses) {
    const store = new Map(stored == null ? [] : [['aiapp_cohere_model', stored]]);
    const sent = [];
    const ctx = {
      localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
      fetch: async (u, init) => { const b = JSON.parse(init.body); sent.push(b.model); const st = statuses.shift() || 200; return st === 200 ? new Response(JSON.stringify({ choices: [{ message: { content: 'من ' + b.model } }] }), { status: 200 }) : new Response('{"message":"model not found"}', { status: st }); },
      authGet: () => '', window: { getGuestId: () => 'g' }, stripToPlainMessages: (m) => m, __swallow() {}, Response, JSON, String,
      throwProviderError: (st, t) => { const e = new Error('HTTP ' + st); e.status = st; throw e; },
    };
    vm.createContext(ctx);
    vm.runInContext(block + '\nthis.callCohere = callCohere;', ctx);
    const reply = await ctx.callCohere([{ role: 'user', content: 'هلا' }], null);
    return { reply, sent, stored: store.get('aiapp_cohere_model') };
  }
  const live = await call('cohere/command-r7b-12-2024', [200]);
  assert.deepEqual(live.sent, ['command-r7b-12-2024'], 'البادئة تُجرَد قبل الإرسال');
  assert.equal(live.stored, 'cohere/command-r7b-12-2024', 'اختيار القائمة يبقى ببادئته');
  const snap = await call('command-r-08-2024', [200]);
  assert.deepEqual(snap.sent, ['command-r-08-2024'], 'لقطة 08-2024 الحيّة لا تُرقَّى');
  const old = await call('command-r', [200]);
  assert.deepEqual(old.sent, ['command-a-03-2025']); assert.equal(old.stored, 'command-a-03-2025', 'المسحوب يُستبدل في التخزين');
  const gone = await call('cohere/command-x-gone', [404, 200]);
  assert.deepEqual(gone.sent, ['command-x-gone', 'command-a-03-2025'], 'إعادة واحدة بالافتراضيّ');
  assert.equal(gone.stored, undefined, 'المختار المرفوض يُمسح'); assert.equal(gone.reply, 'من command-a-03-2025');
  await assert.rejects(call(null, [404, 404]), (e) => e.status === 404, 'الافتراضيّ المرفوض لا يُعاد بلا نهاية');
});
