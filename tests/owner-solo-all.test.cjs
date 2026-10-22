// v-owner-solo-all (المالك ١٤ أكتوبر: «Perplexity انا الي اريدهم كل المزودين مش هذا فقط» · «كودي مايتدخّل — كل واحد بروحه»):
// فحص قراءة فقط وجد مواضع تسحب شغل مزوّد المالك المختار منه — تسليم لنسخة مزوّد آخر، إصلاح خفيّ بسلسلة فيها كلود، تبديل كلام
// المالك قبل بوّابة «ادمج»، ردود جاهزة بدل المزوّد، وأدوات جانبيّة على كلود دائمًا. هنا كلّ واحد منها: المالك يرى مزوّده يعمل بنفسه،
// وغير المالك كما كان. الأبواب المقفلة (المال، «ادمج»، الحذف، المفاتيح) لا تُمسّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

delete process.env.CODE_DELEGATE_ENABLED;
const D = require('../api/_lib/agent-delegate.js');

function gh() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
    if (/\/issues$/.test(String(url))) return new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    if (/\/dispatches$/.test(String(url))) return new Response(null, { status: 204 });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, opts: { fetchImpl, env: { GITHUB_TOKEN: 'tok', GITHUB_DEFAULT_REPO: 'o/r' } } };
}
const TASK = { task: 'أصلح تمرير المحادثة في js/app-09-attach.js حين يصل ردّ طويل' };

test('١. التفويض لنسخة المزوّد نفسه وحدها: مزوّد بلا نسخة كود ينفّذ بأدواته، ولا تسليم لمزوّد آخر — بلا أيّ نداء', async () => {
  for (const prov of ['deepseek', 'openai', 'gemini', 'mistral', 'groq', 'cohere', 'openrouter']) {
    const n = gh();
    const r = await D.startTask(TASK, Object.assign({ prov }, n.opts));
    assert.equal(r.error, D.SELF_ONLY_REFUSAL, prov);
    assert.equal(n.calls.length, 0, prov + ': لا مسألة ولا تشغيل');
  }
  const k = gh();
  const kc = await D.startTask(Object.assign({ engine: 'claude' }, TASK), Object.assign({ prov: 'kimi' }, k.opts));
  assert.equal(kc.error, D.SELF_ONLY_REFUSAL, 'Kimi لا يسلّم لكودي');
  assert.equal(k.calls.length, 0);

  const kk = gh();
  const ok = await D.startTask(TASK, Object.assign({ prov: 'kimi' }, kk.opts));
  assert.equal(ok.engine, 'kimi', 'Kimi ← Kimi Code (نسخته) حتّى بلا engine');
  assert.ok(kk.calls.some((c) => /kimi-agent\.yml\/dispatches$/.test(c.url)));

  const cl = gh();
  const off = await D.startTask(TASK, Object.assign({ prov: 'claude' }, cl.opts));
  assert.match(off.error, /موقوف بأمر المالك/, 'Claude ← Claude Code موقوف كما في v-cc-off');
  assert.equal(cl.calls.length, 0);

  assert.ok(!/خلّ كودي يسويها|Claude Code/.test(D.DELEGATE_REFUSAL), 'الرفض لا يعلّم المزوّد اسم كودي');
  assert.match(D.START_TOOL.input_schema.properties.engine.description, /لا تفويض لمزوّد آخر/);
  assert.ok(read('api/_lib/chat.js').includes('__dl.startTask(input, { prov: reqProv || prov'), 'المحادثة تمرّر مزوّد المالك');
});

test('٢. تعليمات المزوّدين لا تدلّهم على كودي ولا تقول «يدمج تلقائيًّا» ولا «Claude للكود»', () => {
  const PL = require('../api/_lib/provider-level.js');
  const GE = require('../api/_lib/github-edit.js');
  const K = read('api/_lib/_knowledge.js');
  assert.ok(!/Claude Code بطلبه|check_code_task/.test(PL.OWNER_METHOD));
  assert.ok(!/check_code_task لسجلّ المهمّة|Claude Code \(delegate_code_task\) ليس طريقك/.test(GE.WORK_NOTE));
  assert.match(GE.WORK_NOTE, /ولا يقبله إلّا لنسختك أنت — لا لمزوّد آخر/);
  assert.ok(!/يدمج طلبه تلقائيًّا|Claude للكود والبناء|على رصيد Anthropic\) لا يُستدعى/.test(K));
  assert.match(K, /الكود والبناء يعملهما المزوّد الذي اختاره عمران بنفسه/);
  assert.ok(JSON.parse(read('package.json')).scripts.test.includes('node tests/owner-solo-all.test.cjs'));
});

const vm = require('node:vm');
const A6 = read('js/app-06-checkout.js');
const A9 = read('js/app-09-attach.js');
const BUNDLE = read('js/app.bundle.js');
function loadFallback(ctx) {
  const a = A6.indexOf('var __FALLBACK_IDLE_MS');
  const b = A6.indexOf('// ⚠️ ٦ أغسطس — سجل الأخطاء الحقيقي');
  assert.ok(a > 0 && b > a);
  vm.runInNewContext(A6.slice(a, b) + '\nthis.fb = callAIWithFallback;', ctx);
  return ctx.fb;
}
function clientCtx(owner, sel, answers) {
  const tried = [], viaChat = [];
  const ctx = {
    tried, viaChat, localStorage: { getItem: () => sel }, FUNCTIONAL_GROUPS: { gemini: ['gemini', 'groq'], openai: ['openai', 'perplexity'] }, AUTO_FALLBACK_ORDER: ['claude', 'gemini', 'openai', 'groq'],
    TOOL_PROVIDERS: ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter', 'kimi'],
    omranOwnerUi: () => owner,
    window: { callChatWithTools: async (msgs, od, prov) => { viaChat.push({ prov, msgs }); return { reply: (answers || {})[prov] || ('من ' + prov) }; } },
    functionalLabel: (k) => k, t: (k) => k, __swallow() {}, console,
    isRefusalReply: (s) => /^آسف/.test(String(s)), setInterval, clearInterval, Date, Promise, Error, String, Number,
    callProviderAI: async (k) => { tried.push(k); return (answers || {})[k] || ('قديم ' + k); },
  };
  return ctx;
}

test('٣. المستدعون بلا solo (البناء بالصوت، فاحص التطبيق، الاستوديوهات): للمالك مزوّده وحده بتعليمات المهمّة، بلا سلسلة ولا تحويل بعد رفض', async () => {
  const msgs = [{ role: 'system', content: 'قواعد المهمّة' }, { role: 'user', content: 'ابنِ' }];
  let ctx = clientCtx(true, 'deepseek', { deepseek: 'آسف، لا أستطيع' });
  const r = await loadFallback(ctx)(msgs, null);
  assert.equal(r.providerKey, 'deepseek');
  assert.equal(r.reply, 'آسف، لا أستطيع', 'ردّه يرجع كما هو — لا تحويل صامت لكلود');
  assert.deepEqual(ctx.viaChat.map((c) => c.prov), ['deepseek']);
  assert.deepEqual(ctx.viaChat[0].msgs.map((m) => m.content), ['قواعد المهمّة', 'ابنِ'], 'تعليمات المستدعي تبقى');
  assert.deepEqual(ctx.tried, []);
  ctx = clientCtx(true, 'gemini');
  await loadFallback(ctx)(msgs, null);
  assert.deepEqual(ctx.viaChat.map((c) => c.prov), ['gemini'], 'Gemini وحده بلا Groq');
  ctx = clientCtx(false, 'deepseek', { deepseek: 'آسف، لا أستطيع', claude: 'من كلود' });
  const o = await loadFallback(ctx)(msgs, null);
  assert.equal(o.providerKey, 'claude', 'غير المالك: السلسلة والتحويل بعد الرفض كما كانا');
  assert.deepEqual(ctx.viaChat, []);
});

test('٤. الإصلاح الذاتيّ: للمالك لا يُرسل كود مزوّده لمزوّد آخر بالخفاء — غيره كما كان', async () => {
  const a = A6.indexOf('async function selfHealCode(');
  const src = A6.slice(a, A6.indexOf('\n}\n', a) + 3);
  const run = async (owner) => {
    let calls = 0;
    const ctx = { OMRAN_HEAL_MAX: 45000, omranOwnerUi: () => owner, console, __swallow() {},
      testCodeInSandbox: async () => ['ReferenceError: x is not defined'],
      callAIWithFallback: async () => { calls++; return { reply: '```html\n<html><body>مصلَّح من غيره ...........</body></html>\n```' }; },
      extractReply: (r) => ({ code: (String(r).match(/```html\n([\s\S]*?)```/) || [])[1] || '' }) };
    vm.runInNewContext(src + '\nthis.h = selfHealCode;', ctx);
    const code = '<html><body><script>x()</script> كود المزوّد</body></html>';
    return { out: await ctx.h(code, 'html'), calls, code };
  };
  const own = await run(true);
  assert.equal(own.out, own.code); assert.equal(own.calls, 0);
  const other = await run(false);
  assert.ok(other.calls >= 1 && other.out !== other.code, 'غير المالك: الإصلاح الذاتيّ كما كان');
  assert.ok(BUNDLE.includes("if(typeof omranOwnerUi === 'function' && omranOwnerUi()) return code;"));
});

test('٥. «نعم ادمج» بعد «أدمج وأنشر؟»: كلام المالك يصل الخادم كما كتبه (بوّابة «ادمج» تقرؤه) — لا طلب بناء قديم مكانه', () => {
  const OWN = "!(typeof omranOwnerUi === 'function' && omranOwnerUi())";
  for (const f of [A9, BUNDLE]) {
    assert.ok(f.includes('if(__offerApproved && text && !__isFullBuildReq && ' + OWN + ' /* v-owner-solo-all'), 'موافقة العرض: كلامه لا يُبدَّل');
    assert.ok(f.includes('omranOwnerUi() && (__offerApproved /* v-owner-solo-all: موافقته على عرض بناء — بلا تبديل كلامه */ || __isFullBuildReq'), 'وتبقى إشارة اعتماد الكود مشروعًا');
    assert.ok(f.includes('if(!__pend && !__offerApproved && text && !__isFullBuildReq && ' + OWN + ' && GATE_APPROVE_RE.test(text)){'), 'شبكة الأمان');
    assert.ok(f.includes('} else if(__pend && text && !__isFullBuildReq && ' + OWN + ' && GATE_APPROVE_RE.test(text)){'), 'طلب معلّق قديم');
  }
  // الخادم: البوّابة نفسها لم تتغيّر — تقرأ آخر رسالة المالك
  assert.match(read('api/_lib/chat.js'), /ownerSaidMerge\(lastUserText\)/);
});

test('٦. الردود الجاهزة والاختصارات لا تجيب مكان مزوّد المالك: PDF على تطبيقه، الطوابع، «رجّع» بلا صورة، «عدّل» وحدها، دليل المواقع، السجلّ الملصوق', () => {
  for (const f of [A9, BUNDLE]) {
    assert.ok(f.includes('!cur.awaitingAdMode && !(__ownerProvTurn && omranOwnerAppNoun(text)) /* v-owner-solo-all'), 'PDF');
    assert.ok(f.includes('} else if(text && !__ownerProvTurn /* v-owner-solo-all: مزوّد المالك يرسمها'), 'الطوابع');
    assert.ok(f.includes('(!__ownerProvTurn || omranOwnerUndoIsImage(cur.messages)) /* v-owner-solo-all */ && __undoRe.test(text)'), 'التراجع');
    assert.ok(f.includes('if(!__ownerProvTurn /* v-owner-solo-all: مزوّده يسأل بنفسه */ && /^'), 'عدّل الخط');
    assert.ok(f.includes('if(!__ownerProvTurn /* v-owner-solo-all */ && /^\\s*(?:تعديل|عدل|عدّل|edit)'), '«تعديل» وحدها');
    assert.ok(f.includes('if(__pastedDoc && !(__ownerProvTurn && cur.code)'), 'السجلّ الملصوق');
    assert.ok(f.includes('OMRAN_SITE_GUIDE_RE.test(text) && !(__ownerProvTurn && (__ownerAppPlace || cur.code));'), 'دليل المواقع');
  }
  const a = A9.indexOf('function omranOwnerUndoIsImage(');
  const src = A9.slice(a, A9.indexOf('\nfunction omranPrevTurnHadImage', a)) + A9.slice(A9.indexOf('function omranPrevTurnHadImage('), A9.indexOf('\n}\n', A9.indexOf('function omranPrevTurnHadImage(')) + 3);
  const ctx = { __swallow() {} };
  vm.runInNewContext(src + '\n' + fnSrc(A9, 'function omranOwnerAppNoun(') + '\nthis.u = omranOwnerUndoIsImage; this.n = omranOwnerAppNoun;', ctx);
  for (const q of ['أبي التطبيق يصدّر الفواتير PDF', 'ممكن تضيف زر تحميل PDF في الإعدادات', 'حط زر PDF في القائمة']) assert.equal(ctx.n(q), true, 'طلب على تطبيقه: ' + q);
  for (const q of ['حط الرد في PDF', 'حوّل الرد PDF', 'سو لي PDF من الجواب']) assert.equal(ctx.n(q), false, 'تصدير الردّ يبقى محلّيًّا: ' + q);
  const img = { role: 'assistant', content: '', attachments: [{ isImage: true }] };
  assert.equal(ctx.u([{ role: 'user', content: 'ارسم' }, img, { role: 'user', content: 'رجّعها' }]), true, 'صورة مرفقة في الدور السابق');
  assert.equal(ctx.u([{ role: 'user', content: 'ارسم' }, { role: 'assistant', content: 'هذي رسمتي __IMG_3__' }]), true, 'رسمة مزوّده برمزها');
  assert.equal(ctx.u([img, { role: 'user', content: 'عدّل الكود' }, { role: 'assistant', content: 'رفعت طلب السحب #12' }]), false, '«رجّع الكود زي أول» بعد دور كود يصل مزوّده');
});

function fnSrc(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, 'غير موجود: ' + head);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error('غير مغلق: ' + head);
}
const TP = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'groq', 'cohere', 'openrouter', 'kimi'];

test('٧. الأدوات الجانبيّة على مزوّد المالك المختار: إصلاح الكود، «ورّني وأبنيه»، احتياط مها — وغير المالك كما كان', async () => {
  // نافذة إصلاح الكود
  const A24 = read('js/app-24-codefix.js');
  const ctx = { omranOwnerUi: () => true, localStorage: { getItem: () => 'deepseek' }, TOOL_PROVIDERS: TP, window: { omranModelFor: (p) => p + '/m1', claudeModelGet: () => 'claude-opus-5-5' } };
  vm.runInNewContext(fnSrc(A24, 'function ownerRoute()') + '\nthis.r = ownerRoute;', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.r())), { provider: 'deepseek', model: 'deepseek/m1' });
  ctx.omranOwnerUi = () => false;
  assert.equal(ctx.r(), null, 'غير المالك: كلود كما كان');
  assert.ok(A24.includes("provider: own ? own.provider : 'claude',") && A24.includes('if (own) { payload.noTools = true; if (own.model) payload.model = own.model; }'), 'بلا أدوات: عقد الرقع @@ كما هو');

  // «ورّني وأبنيه»: القراءة بالصورة والبناء عبر مزوّده بلا أدوات
  const A16 = read('js/app-16-snapbuild.js');
  const calls = [];
  const c16 = { omranOwnerUi: () => true, localStorage: { getItem: () => 'gemini' }, TOOL_PROVIDERS: TP, textFrom: () => 'من كلود',
    window: { callChatWithTools: async (msgs, od, prov, o) => { calls.push({ msgs, prov, o }); return { reply: '{"title":"x"}' }; } },
    claudeProxyRequest: async () => { calls.push({ proxy: true }); return { json: async () => ({}) }; } };
  vm.runInNewContext(fnSrc(A16, 'function ownerProv()') + '\n' + fnSrc(A16, 'function askText(') + '\nthis.ask = askText;', c16);
  const rd = await c16.ask('اقرأ', 'أعد JSON', [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } }]);
  assert.equal(rd.text, '{"title":"x"}');
  assert.equal(calls[0].prov, 'gemini'); assert.equal(calls[0].o.noTools, true);
  assert.equal(calls[0].msgs[0].role, 'system');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].msgs[1].images)), [{ dataUrl: 'data:image/png;base64,QUJD', mime: 'image/png' }]);
  c16.omranOwnerUi = () => false;
  await c16.ask(null, 'ابنِ', null);
  assert.ok(calls[1].proxy, 'غير المالك: وسيط كلود كما كان');

  // احتياط مها
  const maha = "filter(p => p !== 'claude' || !(typeof omranOwnerUi === 'function' && omranOwnerUi()) || (localStorage.getItem('aiapp_provider')";
  assert.ok(read('js/app-08-maha.js').includes(maha) && BUNDLE.includes(maha));
  for (const f of ['js/app-24-codefix.js', 'js/app-16-snapbuild.js']) assert.ok(BUNDLE.includes(read(f).slice(read(f).indexOf('v-owner-solo-all'), read(f).indexOf('v-owner-solo-all') + 60)), f + ' في الحزمة');
});

test('٨. تقييم الكود للمالك على مزوّده عبر الوسيط بمعرّفه (أو افتراضيّه = OR_MODELS في chat.js)؛ بلا مفتاح الوسيط خطأ صريح لا كلود؛ غيره كما كان', async () => {
  const CA = require('../api/_lib/code-analyze.js').__test;
  // الافتراضيّات مرآة OR_MODELS في chat.js
  const chat = read('api/_lib/chat.js');
  const block = chat.slice(chat.indexOf('const OR_MODELS = {'), chat.indexOf('};', chat.indexOf('const OR_MODELS = {')));
  for (const [k, v] of Object.entries(CA.OWNER_OR_DEFAULTS)) assert.ok(new RegExp('\\n  ' + k + ": '" + v.replace(/[.\/]/g, '\\$&') + "'").test(block), k + ' = OR_MODELS.' + k);
  const sse = 'data: ' + JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'تقرير' } }) + '\n\ndata: ' + JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + '\n\n';
  const run = async (o) => {
    const sent = [];
    const fetchImpl = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(sse, { status: 200 }); };
    let out, err;
    try { out = await CA.callPro({ system: 's', user: 'u' }, Object.assign({ fetchImpl }, o)); } catch (e) { err = e; }
    return { sent, out, err };
  };
  const g = await run({ ownerProv: 'gemini', ownerModel: 'google/gemini-3.8-pro', env: { OPENROUTER_API_KEY: 'or', ANTHROPIC_API_KEY: 'an' } });
  assert.match(g.sent[0].url, /openrouter\.ai\/api\/v1\/messages$/);
  assert.equal(g.sent[0].body.model, 'google/gemini-3.8-pro', 'معرّفه المختار');
  assert.equal(g.sent[0].body.thinking, undefined); assert.equal(g.sent[0].body.output_config, undefined);
  const k = await run({ ownerProv: 'kimi', ownerModel: 'kimi-k3', env: { OPENROUTER_API_KEY: 'or' } });
  assert.equal(k.sent[0].body.model, 'moonshotai/kimi-k3', 'معرّف مباشر بلا بادئة = افتراضيّه عند الوسيط');
  const none = await run({ ownerProv: 'gemini', env: { ANTHROPIC_API_KEY: 'an' } });
  assert.match(String(none.err && none.err.message), /لا طريق لهذا المزوّد/);
  assert.equal(none.sent.length, 0, 'لا كلود مكانه');
  const cl = await run({ ownerProv: 'claude', env: { ANTHROPIC_API_KEY: 'an' } });
  assert.match(cl.sent[0].url, /api\.anthropic\.com/); assert.equal(cl.sent[0].body.model, CA.DEFAULT_MODEL, 'كلود المختار كما كان');
  const other = await run({ env: { ANTHROPIC_API_KEY: 'an' } });
  assert.equal(other.sent[0].body.model, CA.DEFAULT_MODEL);
  assert.ok(read('api/_lib/code-analyze.js').includes("owner ? { ownerProv: String(body.provider || ''), ownerModel: String(body.model || '') } : {}"), 'الحقلان للمالك وحده');
  assert.ok(read('js/app-27-codescore.js').includes('payload.provider = sel;'));
});

test('٩. الفيديو المرفق للمالك: محرّك المشاهدة يشاهد، ومزوّده يجيب سؤاله من نتيجتها وسطر الخصم باقٍ؛ فشل مزوّده = نتيجة المشاهدة', async () => {
  const A32 = read('js/app-32-video-watch.js');
  const calls = [];
  const ctx = { omranOwnerUi: () => true, localStorage: { getItem: () => 'kimi' }, TOOL_PROVIDERS: TP, t: (k) => k, __swallow() {}, String,
    window: { callChatWithTools: async (msgs, od, prov, o) => { calls.push({ msgs, prov, o }); return { reply: 'جواب Kimi' }; } } };
  vm.runInNewContext(fnSrc(A32, 'function ownerProv()') + '\n' + fnSrc(A32, 'async function ownerAnswer(') + '\nthis.a = ownerAnswer;', ctx);
  const cur = { messages: [{ role: 'user', content: 'سؤال قديم' }, { role: 'assistant', content: 'جواب' }, { role: 'user', content: 'وش في الفيديو؟' }] };
  const out = await ctx.a(cur, 'وش في الفيديو؟', { result: 'رجل يمشي في السوق', tail: '\n\n(خُصم ٥)' });
  assert.equal(out, 'جواب Kimi\n\n(خُصم ٥)');
  assert.equal(calls[0].prov, 'kimi'); assert.equal(calls[0].o.noTools, true);
  assert.ok(calls[0].msgs.some((m) => m.role === 'system' && /رجل يمشي في السوق/.test(m.content)), 'نتيجة المشاهدة تصله');
  assert.equal(calls[0].msgs[calls[0].msgs.length - 1].content, 'وش في الفيديو؟');
  ctx.omranOwnerUi = () => false;
  assert.equal(await ctx.a(cur, 'x', { result: 'r', tail: '' }), '', 'غير المالك: جواب المحرّك كما كان');
  assert.ok(A32.includes("if(lastWatch){ try{ reply = (await ownerAnswer(cur, text, lastWatch)) || reply; }"));
});

test('١٠. Gemini المختار يرسم بـGoogle وحده: «خطّ صحيح» لا يذهب لـGPT، وفشل Google = ردّ صريح — لا GPT ولا مجّانيّ بالخفاء', async () => {
  const rp = (f) => require.resolve(path.join(root, f));
  process.env.GEMINI_API_KEY = 'test-gemini'; process.env.OPENAI_API_KEY = 'test-openai'; process.env.IMAGE_FREE_FALLBACK = 'on';
  process.env.IMAGE_UPSCALE = 'off'; process.env.IMAGE_CARDS = 'off';
  const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
  stub('api/_lib/kv.js', { kvGetJSON: async () => null, kvSetIfAbsent: async () => true, kvIncr: async () => 1, kvDecrBy: async () => 0 });
  stub('api/_lib/_usage.js', { DAILY_LIMIT: 20, clientIp: () => null, checkAndConsume: async () => ({ allowed: true }) });
  stub('api/_lib/points.js', { COSTS: { image: 20, image_creative: 35, image_4k: 30 }, verifyPointsToken: (t) => (t === 'owner' ? 'omran' : null), isOwnerUsername: (u) => u === 'omran', spendPoints: async () => ({ ok: true, owner: true }), refundPoints: async () => {} });
  stub('api/_lib/_mediaPlans.js', { imageQuality: async () => null });
  stub('api/_lib/abuse-guard.js', { imageHourlyGuard: async () => ({ ok: true }) });
  stub('api/_lib/tier.js', { resolveTier: async () => ({ tier: 'free' }) });
  stub('api/_lib/log-error.js', { logErrorAndFlush: async () => {}, logError() {} });
  delete require.cache[rp('api/_lib/maha-image.js')];
  const handler = require(rp('api/_lib/maha-image.js'));
  const run = async (prompt, forceEngine) => {
    const calls = [];
    const save = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      calls.push(u.includes('openai') ? 'openai' : u.includes('pollinations') ? 'free' : 'google');
      return Response.json({ error: { message: 'internal' } }, { status: 500 });
    };
    let status = 0, json = null;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(v) { json = v; return this; }, end() { return this; } };
    try { await handler({ method: 'POST', headers: {}, body: { prompt, userText: prompt, token: 'owner', forceEngine } }, res); } finally { global.fetch = save; }
    return { calls, status, json };
  };
  const nano = await run('بوستر بخط صحيح مكتوب عليه عمران', 'nano');
  assert.ok(nano.calls.length > 0 && nano.calls.every((c) => c === 'google'), 'Google وحده: ' + nano.calls.join(','));
  assert.ok(nano.status >= 500 && nano.json && nano.json.error, 'فشل صريح بسببه (المالك غير مخصوم أصلًا — لا استرداد يلزم)');
  const unforced = await run('بوستر بخط صحيح مكتوب عليه عمران', undefined);
  assert.ok(unforced.calls.includes('openai'), 'بلا اختيار: السلسلة المعتادة (GPT للنصّ) كما كانت');
  delete process.env.IMAGE_FREE_FALLBACK;
});

test('١١. Groq المجّانيّ: طلب فيديو يُبقي أداة الفيديو في الجسم المقصوص إن اتّسعت (كانت تسقط فيقول «ما أقدر»)', () => {
  const OD = require('../api/_lib/oa-direct.js');
  const sys = 'أنت موديل يعمل على خوادم Groq.\nأسلوب.\n\n' + 'أ'.repeat(16000) + '\n\n[هويّتك]: موديل على Groq.';
  const fn = (name, n) => ({ type: 'function', function: { name, description: 'd'.repeat(n), parameters: { type: 'object', properties: {} } } });
  const tools = [fn('web_search', 900), fn('read_github', 1700), fn('generate_image', 600), fn('generate_video', 700), fn('edit_github', 1500)];
  const body = (text) => ({ model: 'qwen/qwen3.6-27b', stream: true, max_completion_tokens: 16000, tools, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }] });
  const T = (b) => Math.ceil((JSON.stringify(b.messages).length + JSON.stringify(b.tools).length) / 3);
  const fit = (text, limit) => { const b = body(text); return OD.fitGroqTpm(b, 'on tokens per minute (TPM): Limit ' + limit + ', Requested ' + (T(b) + 16000) + ', please reduce'); };
  const names = (b) => (b.tools || []).map((x) => x.function.name).sort();
  assert.deepEqual(names(fit('سوّ لي فيديو قطة تمشي', 8000)), ['generate_video']);
  assert.equal(fit('مرحبا', 8000).tools, undefined, 'التحيّة كما كانت');
  assert.deepEqual(names(fit('ارسم قطة على البحر', 8000)), ['generate_image'], 'الرسم كما كان');
});

test('١٢. الرؤية والقراءة: مزوّد على موديل رؤيته أصلًا يرى صور المستودع بلا تبديل، ونسخة المالك من read_github تعرف التزامًا واحدًا بفرقه', () => {
  const V = require('../api/_lib/owner-vision.js');
  assert.deepEqual(V.visionPlan('groq', 'direct', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'), { model: 'qwen/qwen3.8-27b', def: 'openai/gpt-oss-120b', forced: false });
  assert.equal(V.visionPlan('groq', 'direct', 'openai/gpt-oss-120b', 'openai/gpt-oss-120b').forced, true, 'gpt-oss نصّيّ: التبديل كما كان');
  assert.equal(V.visionPlan('deepseek', 'or', 'deepseek/deepseek-v4-pro', 'x').forced, true);
  const PL = require('../api/_lib/provider-level.js');
  const t = { name: 'read_github', description: 'd', input_schema: { type: 'object', properties: { what: { type: 'string', enum: ['auto', 'commits'], description: 'w' } } } };
  assert.deepEqual(PL.ownerReadTool(t).input_schema.properties.what.enum, ['auto', 'commits', 'commit', 'map']); // v-codemap: + map
  assert.deepEqual(t.input_schema.properties.what.enum, ['auto', 'commits'], 'المشتركة لغير المالك كما هي (كاشهم)');
});
