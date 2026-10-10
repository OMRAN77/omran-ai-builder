// tests/parallel-chats.test.cjs — v-parallel-chats (طلب المالك ١٠ أكتوبر: «إذا أفتح محادثة جديدة حتى لو أفتح ١٠
// يكون الشغل يمشي، مش أنتظر المحادثة الأولى»). كان genAbortController متحكّمًا واحدًا لكلّ التطبيق: أيّ طلب جارٍ
// يقفل الإرسال في كلّ المحادثات. الآن سجلّ __omranRuns بطلب لكلّ محادثة، والمرآة genAbortController وزرّا
// الإرسال والإيقاف يتبعون المحادثة المعروضة وحدها. هنا: السجلّ نفسه منفّذًا في vm، وروابط دالّة الإرسال والمزوّدين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const a9 = read('js/app-09-attach.js');

function el(id) {
  const cls = new Set();
  return { id, disabled: false, innerHTML: 'plane', isConnected: false, dataset: {},
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
}
function loadRegistry() {
  const start = a9.indexOf('var __OMRAN_WD_HARD_MS');
  const end = a9.indexOf("__swallow(e, 'misc:wd-vis')", start);
  assert.ok(start > 0 && end > start, 'كتلة السجلّ موجودة');
  const src = a9.slice(start, a9.indexOf('\n', end) + 1);
  const btnSend = el('btnSend'), btnStop = el('btnStop');
  const appended = [];
  const ctx = {
    state: { currentId: 'A' }, genAbortController: null, renderCalls: 0,
    messagesEl: { appendChild: (n) => { appended.push(n); n.isConnected = true; } },
    document: { getElementById: (id) => ({ btnSend, btnStop })[id] || null, querySelectorAll: () => [], addEventListener() {}, visibilityState: 'visible' },
    // مؤقّتات الحارس (٥ دقائق) لا تُبقي عمليّة الاختبار حيّة
    window: {}, setTimeout: (f, ms) => { const t = setTimeout(f, ms); if (t.unref) t.unref(); return t; }, clearTimeout, AbortController, Date, Object, String,
    __swallow: (e) => { throw e; },
  };
  ctx.renderMessages = function () { ctx.renderCalls++; };
  ctx.renderAll = function () { ctx.renderMessages(); };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, btnSend, btnStop, appended };
}

test('طلب محادثة لا يقفل محادثة أخرى: المرآة والزرّان يتبعون المعروضة', () => {
  const { ctx, btnSend, btnStop } = loadRegistry();
  const ctlA = new AbortController();
  const rA = vm.runInContext('__omranRunStart', ctx)('A', ctlA);
  assert.equal(ctx.genAbortController, ctlA, 'المعروضة A تعمل ← المرآة متحكّمها');
  assert.equal(btnSend.disabled, true); assert.equal(btnStop.classList.contains('live'), true);
  // محادثة جديدة B: الإرسال متاح فورًا و A تكمل
  ctx.state.currentId = 'B'; ctx.renderMessages();
  assert.equal(ctx.genAbortController, null, 'B بلا طلب ← لا شيء يمنع الإرسال');
  assert.equal(btnSend.disabled, false); assert.equal(btnSend.innerHTML.includes('svg'), true, 'أيقونة الإرسال رجعت');
  assert.equal(btnStop.classList.contains('live'), false);
  assert.equal(ctlA.signal.aborted, false, 'A لم تُقطع بالانتقال');
  const ctlB = new AbortController();
  const rB = vm.runInContext('__omranRunStart', ctx)('B', ctlB);
  assert.equal(ctx.genAbortController, ctlB);
  // انتهاء A في الخلفيّة لا يفكّ قفل B المعروضة
  vm.runInContext('__omranRunEnd', ctx)(rA);
  assert.equal(ctx.genAbortController, ctlB); assert.equal(btnSend.disabled, true, 'B ما زالت تعمل');
  assert.deepEqual(Object.keys(vm.runInContext('__omranRuns', ctx)), ['B']);
  vm.runInContext('__omranRunEnd', ctx)(rB);
  assert.equal(btnSend.disabled, false); assert.equal(ctx.genAbortController, null);
});

test('الحارس يقطع طلبه وحده، وفقاعة الانتظار تعود عند الرجوع للمحادثة فقط', () => {
  const { ctx, appended } = loadRegistry();
  const start = vm.runInContext('__omranRunStart', ctx);
  const ctlA = new AbortController(), ctlB = new AbortController();
  const rA = start('A', ctlA);
  ctx.state.currentId = 'B'; ctx.renderMessages();
  start('B', ctlB);
  vm.runInContext('__omranAbortRun', ctx)(rA);
  assert.equal(ctlA.signal.aborted, true); assert.equal(rA.timedOut, true);
  assert.equal(ctlB.signal.aborted, false, 'مهلة A لا تمسّ B');
  // فقاعة C: تُعاد عند الرجوع إليها، ولا تُعاد إن أُزيلت عمدًا
  const ctlC = new AbortController();
  ctx.state.currentId = 'C'; ctx.renderMessages();
  const rC = start('C', ctlC);
  rC.thinking = { isConnected: false, __gone: false };
  ctx.renderMessages();
  assert.equal(appended.length, 0, 'لا إعادة بلا انتقال (الفقاعة لا تتكرّر فوق الردّ النهائيّ)');
  ctx.state.currentId = 'B'; ctx.renderMessages();
  ctx.state.currentId = 'C'; ctx.renderMessages();
  assert.equal(appended.length, 1, 'رجع إلى C وهي تعمل ← الفقاعة عادت');
  rC.thinking.isConnected = false; rC.thinking.__gone = true;
  ctx.state.currentId = 'B'; ctx.renderMessages();
  ctx.state.currentId = 'C'; ctx.renderMessages();
  assert.equal(appended.length, 1, 'المزالة عمدًا لا تعود');
});

test('دالّة الإرسال: متحكّم لكلّ طلب، رسم مظلَّل للمحادثة المعروضة، وقفل يُفكّ لمحادثته وحدها', () => {
  const s = a9.indexOf('async function __sendPromptCore(){');
  const core = a9.slice(s, a9.indexOf('refreshProviderQuickBar();\n  }\n}\n', s));
  assert.match(core, /const renderAll = function\(\)\{\n    if\(__mine\(\)\) return __omranRenderAllNow/);
  assert.match(core, /const renderMessages = function\(\)\{ if\(__mine\(\)\) return __omranRenderMessagesNow/);
  assert.match(core, /const __runCtl = new AbortController\(\);\n  const __run = __omranRunStart\(cur\.id, __runCtl\);/);
  assert.doesNotMatch(core, /genAbortController\s*=|genAbortController\.signal/, 'لا كتابة ولا قراءة للمرآة داخل الطلب');
  assert.match(core, /__omranRunEnd\(__run\);/);
  assert.match(core, /if\(__mine\(\)\) messagesEl\.appendChild\(thinkingDiv\);/);
  assert.doesNotMatch(core.slice(core.indexOf('window.__chatStatus = chatStatus;') + 30), /window\.__chatStatus/, 'شريط الحالة شريط هذا الطلب');
  assert.match(core, /if\(__mine\(\)\)\{ promptEl\.value = '';/, 'إيقاف طلب في الخلفيّة لا يمسح ما يُكتب في محادثة أخرى');
  for (const call of ['callChatWithTools(apiMessages.filter(m => m !== __staticSys), __sigFn(onDelta), __effProv)', 'callAIWithFallback(apiMessages, __sigFn(onDelta),'])
    assert.ok(core.includes(call), call);
});

test('المزوّدون ومسار الأدوات يأخذون إشارة طلبهم لا المرآة العامّة', () => {
  const a6 = read('js/app-06-checkout.js');
  assert.match(a6, /function __omranReqSig\(fn, sig\)\{\n  if\(sig\) return sig;\n  if\(fn && fn\.__signal\) return fn\.__signal;/);
  assert.doesNotMatch(a6, /\? genAbortController\.signal : undefined,\n/, 'كلّ fetch يمرّ عبر __omranReqSig');
  assert.match(a6, /__od\.__signal = onDelta && onDelta\.__signal;/);
  const a18 = read('js/app-18-chat-tools.js');
  assert.match(a18, /signal: \(onDelta && onDelta\.__signal\) \|\|/);
  assert.match(a18, /note\(\(typeof tStatus === 'function'\) \? tStatus\(ev\) : ev\.status, onDelta && onDelta\.__status\)/);
  const r = vm.runInNewContext(a6.slice(a6.indexOf('function __omranReqSig'), a6.indexOf('async function callClaude(')) + ';__omranReqSig', { genAbortController: { signal: 'mirror' } });
  assert.equal(r(null, null), 'mirror'); assert.equal(r({ __signal: 'own' }), 'own'); assert.equal(r({ __signal: 'own' }, 'explicit'), 'explicit');
});

test('القائمة تعلّم المحادثة العاملة بنقطة نابضة', () => {
  assert.match(a9, /el\.classList\.toggle\('omRunning', !!__omranRuns\[el\.dataset\.pid\]\)/);
  assert.match(read('css/tokens.css'), /\.hist-item\.omRunning \.hist-title::after\{/);
});
