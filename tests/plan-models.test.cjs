// tests/plan-models.test.cjs — v-plan-models (قرار المالك ١٦ أكتوبر بعد خريطة «من المجّانيّ إلى ٣٧٥»): «Groq gpt-oss-20b خلّه بالمجان، Luna
// وHaiku 5.5 لـ37»، وPro: ‏Gemini 3.8 Flash بحدّ ٤٠ يوميًّا ثمّ موديلات Plus، والكود والملفّ الطويل Mistral Large 3؛ Max: ‏GPT-6 Sol وSonnet 5.5 بحدّ
// ١٠٠ يوميًّا مشترك ثمّ Gemini Flash؛ Groq المجّانيّ ثمّ Gemini احتياط الكلّ. ومعه: بلا «النسخة الاحترافيّة» لمن يدفع، وملاحظة ضيق Groq بلا اسم
// مزوّد لغير المالك، وGroq يجرّب موديله التالي حين يزدحم أحدها، و«الوكيل الذكي» خرج من بطاقة Pro بالـ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const tier = require('../api/_lib/tier.js');
const fc = require('../api/_lib/free-chain.js');
const OD = require('../api/_lib/oa-direct.js');

const sub = (plan) => ({ tier: 'sub', plan, subscriber: true, cap: 100 });
const lane = (r) => [r.job, r.prov, r.model, !!r.direct, r.meter || ''];
const fb = (r) => r.fallback.map((f) => f.prov + ':' + (f.model || '')).join(' > ');

test('الجدول: Plus على Luna وHaiku 5.5 بلا مقاييس', () => {
  assert.deepEqual(lane(tier.planRoute(sub('basic'), 'deepseek', 'هلا كيف الحال', {}, {})), ['chat', 'openai', 'gpt-6-luna', true, '']);
  assert.deepEqual(lane(tier.planRoute(sub('basic'), '', 'اكتب لي كود بايثون', {}, {})), ['code', 'claude', 'claude-haiku-5-5', false, '']);
  assert.deepEqual(lane(tier.planRoute(sub('basic'), '', 'احسب لي الفائدة المركبة', {}, {})), ['math', 'openai', 'gpt-6-luna', true, '']);
  assert.deepEqual(lane(tier.planRoute(sub('basic'), '', 'شو هذا', {}, {}, true)), ['image', 'gemini', '', true, '']);
  assert.equal(fb(tier.planRoute(sub('basic'), '', 'هلا', {}, {})), 'claude:claude-haiku-5-5 > groq: > gemini:', 'الموديل الآخر ثمّ Groq المجّانيّ ثمّ Gemini');
  assert.deepEqual(tier.PLAN_ROUTING.basic.meters, {});
});

test('الجدول: Pro ‏Gemini 3.8 Flash بحدّ ٤٠ ثمّ موديلات Plus، والكود والملفّ الطويل Mistral Large 3', () => {
  assert.deepEqual(lane(tier.planRoute(sub('pro'), '', 'هلا', {}, {})), ['chat', 'gemini', 'gemini-3.8-flash', true, 'gemini']);
  assert.equal(tier.planRoute(sub('pro'), '', 'هلا', {}, {}).meterCap, 40);
  assert.equal(tier.planRoute(sub('pro'), '', 'هلا', {}, { SUB_GEMINI_PRO: '60' }).meterCap, 60, 'الحدّ من البيئة');
  assert.deepEqual(lane(tier.planRoute(sub('pro'), '', 'هلا', { gemini: 40 }, {})), ['chat', 'openai', 'gpt-6-luna', true, ''], 'بعد ٤٠ → Luna');
  assert.equal(fb(tier.planRoute(sub('pro'), '', 'هلا', {}, {})), 'openai:gpt-6-luna > claude:claude-haiku-5-5 > groq: > gemini:');
  assert.deepEqual(lane(tier.planRoute(sub('pro'), '', 'اكتب لي كود بايثون', {}, {})), ['code', 'mistral', 'mistralai/mistral-large-2512', false, '']);
  assert.deepEqual(lane(tier.planRoute(sub('pro'), '', 'ن'.repeat(700), {}, {})), ['math', 'mistral', 'mistralai/mistral-large-2512', false, '']);
  assert.deepEqual(lane(tier.planRoute(sub('pro'), '', 'شو هذا', {}, {}, true)), ['image', 'gemini', '', true, ''], 'الصورة لا تأكل حدّ الأربعين');
});

test('الجدول: Max ‏GPT-6 Sol وSonnet 5.5 بحدّ ١٠٠ مشترك ثمّ Gemini Flash', () => {
  assert.deepEqual(lane(tier.planRoute(sub('max'), 'deepseek', 'هلا', {}, {})), ['chat', 'openai', 'gpt-6-sol', true, 'premium'], 'المنتقي القديم لا يغيّر الجدول');
  assert.deepEqual(lane(tier.planRoute(sub('max'), '', 'ابني لي صفحة هبوط', {}, {})), ['code', 'claude', 'claude-sonnet-5-5', false, 'premium']);
  assert.equal(tier.planRoute(sub('max'), '', 'هلا', {}, {}).meterCap, 100);
  assert.deepEqual(lane(tier.planRoute(sub('max'), '', 'هلا', { premium: 100 }, {})), ['chat', 'gemini', 'gemini-3.8-flash', true, '']);
  assert.deepEqual(lane(tier.planRoute(sub('max'), '', 'ابني لي صفحة هبوط', { premium: 100 }, {})), ['code', 'gemini', 'gemini-3.8-flash', true, '']);
  assert.equal(fb(tier.planRoute(sub('max'), '', 'ابني لي صفحة هبوط', {}, {})), 'gemini:gemini-3.8-flash > claude:claude-haiku-5-5 > groq: > gemini:', 'الاحتياط بلا مقياس — لا يُحجز');
  for (const p of ['basic', 'pro', 'max']) for (const f of tier.planRoute(sub(p), '', 'اكتب كود', {}, {}).fallback) assert.ok(!f.meter, p + ': لا مقياس في الاحتياط');
});

test('planUsedCounts: عدّادات مقاييس الباقة أيًّا كانت', async () => {
  const seen = [];
  const tc = async (u, b) => { seen.push(u + '/' + b); return b === 'plan-gemini' ? 7 : 3; };
  assert.deepEqual(await tier.planUsedCounts('sara', 'pro', tc), { gemini: 7 });
  assert.deepEqual(await tier.planUsedCounts('sara', 'max', tc), { premium: 3 });
  assert.deepEqual(await tier.planUsedCounts('sara', 'basic', tc), {});
  assert.deepEqual(await tier.planUsedCounts('sara', 'gold', tc), {});
  assert.deepEqual(seen, ['sara/plan-gemini', 'sara/plan-premium']);
});

function sse(deltas) { return deltas.map((d) => 'data: ' + JSON.stringify({ choices: [{ delta: { content: d } }] }) + '\n').join('') + 'data: [DONE]\n'; }

test('المجّانيّ على gpt-oss-20b، وازدحام موديل عند Groq يجرّب التالي قبل الخروج منه', async () => {
  fc.__workingModel.clear();
  const env = { GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' };
  assert.equal(tier.freeChain(env)[0].model, 'openai/gpt-oss-20b');
  const calls = [];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body); calls.push((/groq/.test(url) ? 'groq:' : 'gemini:') + b.model);
    if (/groq/.test(url) && b.model === 'openai/gpt-oss-20b') return new Response('{"error":{"message":"Rate limit reached for model openai/gpt-oss-20b ... tokens per day"}}', { status: 429 });
    return new Response(sse(['هلا']), { status: 200 });
  };
  const r = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, env, fetchImpl, log: () => {} });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ['groq:openai/gpt-oss-20b', 'groq:openai/gpt-oss-120b'], 'حدود Groq لكلّ موديل — لا قفز إلى Gemini المدفوع');
  fc.__workingModel.clear();
  const calls2 = [];
  const allBusy = async (url, init) => {
    const b = JSON.parse(init.body); calls2.push(url);
    if (/groq/.test(url)) return new Response('rate limit', { status: 429 });
    return new Response(sse(['تم']), { status: 200 });
  };
  const r2 = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, env, fetchImpl: allBusy, log: () => {} });
  assert.equal(r2.provider, 'gemini');
  assert.ok(!calls2.some((u) => /\/models$/.test(u)), 'كلّها مزدحمة = لا استكشاف /models');
  fc.__workingModel.clear();
});

test('المشترك وVIP في الاحتياط المجّانيّ: بلا «النسخة الاحترافيّة» ولا اشتراك', async () => {
  const sys = async (paid) => {
    let body = null;
    const fetchImpl = async (url, init) => { body = JSON.parse(init.body); return new Response(sse(['تم']), { status: 200 }); };
    await fc.streamFreeChain({ system: 'SYS', paid, convo: [{ role: 'user', content: 'ابحث لي عن أسعار الذهب' }], send: () => {}, env: { GROQ_API_KEY: 'q' }, fetchImpl, log: () => {} });
    fc.__workingModel.clear();
    return body.messages[0].content;
  };
  const free = await sys(false), paid = await sys(true);
  assert.match(free, /النسخة الاحترا/, 'المجّانيّ كما كان');
  assert.doesNotMatch(paid, /النسخة الاحترا|اشترا|ترقي/);
  assert.match(paid, /متعذّرة في هذه اللحظة/);
  assert.ok(read('api/_lib/chat.js').includes('paid: !!(usage && usage.subscriber)'), 'chat.js يمرّر العلامة في احتياط الباقة');
});

test('ملاحظة ضيق Groq: اسم المزوّد و«عمران» للمالك وحده', () => {
  const body = { model: 'openai/gpt-oss-120b', max_completion_tokens: 16000, messages: [{ role: 'system', content: 'هويّة.\n\n' + 'أ'.repeat(12000) }, { role: 'user', content: 'هلا' }], tools: [{ type: 'function', function: { name: 'web_search', description: 'd'.repeat(3000), parameters: { type: 'object', properties: {} } } }] };
  const err = 'Request too large on tokens per minute (TPM): Limit 8000, Requested 22400, please reduce your message size';
  const userFit = OD.fitGroqTpm(body, err, false), ownerFit = OD.fitGroqTpm(body, err, true);
  assert.ok(userFit && ownerFit);
  const sysOf = (b) => b.messages.find((m) => m.role === 'system').content;
  assert.doesNotMatch(sysOf(userFit), /Groq|عمران/, 'لا اسم مزوّد في ردّ يراه المشترك');
  assert.match(sysOf(ownerFit), /Groq/, 'المالك كما كان');
  assert.ok(read('api/_lib/chat.js').includes('owner: __ownerReq /* v-plan-models'), 'chat.js يمرّر من يسأل');
});

test('chat.js: المسار يرسل موديله، وبلا المفتاح المباشر الموديل نفسه عبر الوسيط، والمقياس لأيّ مسار محدود', () => {
  const s = read('api/_lib/chat.js');
  assert.ok(s.includes("CHAT_MODEL = DEFAULT_MODEL = __od.directModel(p, model || '').model;"), 'Luna/Sol/Gemini 3.8 لا افتراضيّ المزوّد');
  assert.ok(s.includes("if (!d) return !!(model && (p === 'openai' || p === 'gemini') && applyRoute(p, (p === 'openai' ? 'openai/' : 'google/') + model, false));"));
  assert.ok(/\(or && p !== 'claude' && \/\^\[a-z0-9-\]\+\\\/\[\\w\.:-\]\+\$\/i\.test\(String\(model \|\| ''\)\)\) \? model : ''/.test(s), 'slug الوسيط (Mistral Large 3)');
  assert.ok(s.includes('__planLane && __planLane.meter) {'), 'حجز المقياس لـGemini وSol لا لكلود وحده');
  assert.ok(s.includes('await tierLib.planUsedCounts(__planUser, __tier.plan, todayCount)'));
  assert.ok(!s.includes("__planLane.prov === 'claude') {"));
});

test('/api/claude القديم: كود Pro وMax بعد حدّه على أوّل كلود في قائمة الوظيفة (Haiku 5.5)، بلا مقياس', () => {
  const s = read('api/_lib/claude.js');
  assert.ok(s.includes("if (route && route.prov !== 'claude') { const c = (route.fallback || []).find((f) => f.prov === 'claude' && f.model); route = c ? Object.assign({}, route, { prov: 'claude', model: c.model, meter: '', meterCap: 0 }) : route; }"));
  const r = tier.planRoute(sub('pro'), 'claude', 'اكتب كود', {}, {});
  assert.equal(r.prov, 'mistral');
  assert.equal(r.fallback.find((f) => f.prov === 'claude').model, 'claude-haiku-5-5');
  const m = tier.planRoute(sub('max'), 'claude', 'اكتب كود', { premium: 100 }, {});
  assert.equal(m.fallback.find((f) => f.prov === 'claude').model, 'claude-haiku-5-5');
});

test('«الوكيل الذكي» خرج من بطاقة Pro بالـ١٤ لغة ومن الجزء، وVِسما الكاش ارتفعا', () => {
  const files = ['js/app-03-i18n-data.js'].concat(['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh'].map((l) => 'i18n/' + l + '.js'));
  const val = (src, key) => [...src.matchAll(new RegExp('(?:^|[\\s,{])' + key + '\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', 'g'))].map((m) => m[1].slice(1, -1).replace(/\\'/g, "'"));
  let n = 0;
  for (const f of files) {
    const src = read(f);
    const agents = val(src, 'plProAgent'), feats = val(src, 'planProFeats');
    assert.ok(agents.length && feats.length, f);
    for (const ft of feats) { n++; for (const a of agents) assert.ok(!ft.includes('<li>' + a + '</li>'), f + ': ' + a); assert.equal((ft.match(/<li>/g) || []).length, 4, f + ': أربع مزايا'); }
  }
  assert.equal(n, 14, 'أربع عشرة لغة');
  assert.ok(!read('js/partials-settings.js').includes('data-i18n="plProAgent"'));
  const sv = Number((read('index.html').match(/partials-settings\.js\?v=(\d+)/) || [])[1] || 0);
  const iv = Number((read('js/app-04-i18n-state.js').match(/'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1] || 0);
  assert.ok(sv > 696 && iv > 744, 'كسر كاش الجزء والترجمات');
});

test('الإكمال غير المتدفّق (الذاكرة وتيليجرام والأسهم): ازدحام 20b عند Groq يجرّب 120b قبل Gemini، وكلّها مزدحمة = لا استكشاف', async () => {
  fc.__workingModel.clear();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body); calls.push((/groq/.test(url) ? 'groq:' : 'other:') + (b.model || url));
    if (/groq/.test(url) && b.model === 'openai/gpt-oss-20b') return new Response('rate limit', { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }), { status: 200 });
  };
  const r = await fc.completeJson('groq', { env: { GROQ_API_KEY: 'q' }, messages: [{ role: 'user', content: 'x' }], fetchImpl });
  assert.equal(r.ok, true);
  assert.deepEqual(calls, ['groq:openai/gpt-oss-20b', 'groq:openai/gpt-oss-120b']);
  fc.__workingModel.clear();
  const urls = [];
  const busy = async (url) => { urls.push(String(url)); return new Response('rate limit', { status: 429 }); };
  const r2 = await fc.completeJson('groq', { env: { GROQ_API_KEY: 'q' }, messages: [{ role: 'user', content: 'x' }], fetchImpl: busy });
  assert.equal(r2.ok, false); assert.equal(r2.status, 429);
  assert.ok(!urls.some((u) => /\/models$/.test(u)), 'لا استكشاف /models');
  fc.__workingModel.clear();
});

test('chat.js: نداءا الاحتياط المجّانيّ للمشترك كلاهما بالملاحظة المحايدة (الدور العاديّ ودور الصورة بلا مسار رؤية)', () => {
  const s = read('api/_lib/chat.js');
  assert.ok(/paid: !__freeLane && !!\(usage && usage\.subscriber\) \/\*[^*]*\*\/, raw: __rawOwner && !__freeLane, convo: __pre\.convo/.test(s), 'نداء دور الصورة بلا مسار رؤية');
  assert.ok(s.includes('paid: !!(usage && usage.subscriber) /* v-plan-models'));
  assert.equal((s.match(/streamFreeChain\(\{/g) || []).length, (s.match(/paid: !/g) || []).length, 'كلّ نداء له العلامة');
});

test('مراجعة النقض: 413 (حدّ الدقيقة لموديل) مثل 429 عند Groq — يجرّب التالي في السلسلة والإكمال', async () => {
  const TPM = '{"error":{"message":"Request too large for model `openai/gpt-oss-20b` on tokens per minute (TPM): Limit 8000, Requested 9100"}}';
  fc.__workingModel.clear();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body); calls.push((/groq/.test(url) ? 'groq:' : 'gemini:') + b.model);
    if (/groq/.test(url) && b.model === 'openai/gpt-oss-20b') return new Response(TPM, { status: 413 });
    return new Response(sse(['هلا']), { status: 200 });
  };
  const r = await fc.streamFreeChain({ system: 'SYS', convo: [{ role: 'user', content: 'هلا' }], send: () => {}, env: { GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' }, fetchImpl, log: () => {} });
  assert.equal(r.provider, 'groq');
  assert.deepEqual(calls, ['groq:openai/gpt-oss-20b', 'groq:openai/gpt-oss-120b']);
  fc.__workingModel.clear();
  const c2 = [];
  const r2 = await fc.completeJson('groq', { env: { GROQ_API_KEY: 'q' }, messages: [{ role: 'user', content: 'x' }], fetchImpl: async (u, init) => { const b = JSON.parse(init.body); c2.push(b.model); return b.model === 'openai/gpt-oss-20b' ? new Response(TPM, { status: 413 }) : new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }); } });
  assert.equal(r2.ok, true); assert.deepEqual(c2, ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);
  fc.__workingModel.clear();
});

test('مراجعة النقض: تغيير الاسم لا يصفّر مقياسَي Pro وMax، والمباشر لا يغيّر ترتيب المجّانيّ', () => {
  const { MOVE_BUCKETS } = require('../api/_lib/_usage.js');
  for (const [plan, r] of Object.entries(tier.PLAN_ROUTING)) for (const m of Object.keys(r.meters)) assert.ok(MOVE_BUCKETS.includes('plan-' + m), plan + ': plan-' + m + ' ينتقل مع الحساب');
  const od = read('api/_lib/oa-direct.js');
  assert.ok(od.includes("rememberWorking('groq-direct', model)") && !od.includes("rememberWorking('groq', model)"));
});

test('مراجعة النقض: Luna/Sol للمشترك بلا تفكير افتراضيّ إلّا الحساب، وموديل الباقة المرفوض عند الوسيط يكمل بمسارها لا بأحدث موديل لشركته', () => {
  const s = read('api/_lib/chat.js');
  assert.ok(s.includes("if (!__ownerReq && __direct && __direct.prov === 'openai' && !(__planRoute && __planRoute.job === 'math')) return { thinking: { type: 'disabled' } };"));
  assert.ok(s.includes('!__liveTried && !__planRoute /* v-plan-models'));
  // الإطفاء يصل /v1/responses سلّمًا (لا تفكير ولا ملخّص) لا حقلًا خامًا
  const rb = OD.toResponsesBody({ model: 'gpt-6-luna', max_tokens: 350, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: 'السلام عليكم' }] });
  assert.ok(rb.reasoning && typeof rb.reasoning.effort === 'string' && rb.reasoning.effort, 'أدنى جهد يقبله الموديل');
  assert.ok(!rb.reasoning.summary, 'بلا ملخّص تفكير');
  assert.equal(rb.max_output_tokens, 350);
});
