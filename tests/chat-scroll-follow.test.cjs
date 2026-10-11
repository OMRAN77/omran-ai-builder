'use strict';
/* tests/chat-scroll-follow.test.cjs — v-chat-scroll-follow (طلب المالك ١١ أكتوبر ٢٠٢٦: «إصلاح تمرير
   المحادثة: لا تتبع البثّ، لا تثبت، وتبدو معلّقة»). الجذر: (١) قرار المتابعة في app-09-attach.js كان
   يُحسب من الفجوة بعد إلحاق النصّ الجديد — جزء كبير (جدول/كود) يدفع الفجوة فوق ١٦٠ فيظنّ أنّ المستخدم
   صعد ويتوقّف خطأً؛ (٢) نقص ٤٠ بكسل عن آخر موضع برمجي كان يُحسب نيّة مستخدم رغم أنّ المتصفّح نفسه
   يُعدّل الموضع؛ (٣) المزامنة الدوريّة كانت تعيد بناء القائمة أثناء بثّ جارٍ فتضيع الفقاعة الحيّة.
   هنا: القرار الجديد (chatUserWantsFollow في app-02-tts.js) يعتمد نيّة مستخدم فعليّة وحدها، يُحسب
   قبل الإلحاق، ولا يتأثّر بفرق الموضع؛ والمزامنة تتأجّل أثناء البثّ (window.__omranStreamActive). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* ---------- ١) نيّة المتابعة: app-02-tts.js — chatUserWantsFollow/chatBreakFollow ---------- */
function loadFollow() {
  const a2 = read('js/app-02-tts.js');
  const start = a2.indexOf('/* طلب المالك ١١ أكتوبر ٢٠٢٦ — تثبيت تمرير المحادثة: المتابعة أثناء البثّ');
  const end = a2.indexOf('// أثناء البث نخفي علامات Markdown', start);
  assert.ok(start > 0 && end > start, 'كتلة المتابعة موجودة في app-02-tts.js');
  const src = a2.slice(start, end);

  function makeEl() {
    const handlers = {};
    return {
      _handlers: handlers,
      addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
      fire(type, evt) { (handlers[type] || []).forEach((fn) => fn(evt)); },
      scrollTop: 0, scrollHeight: 1000, clientHeight: 200, children: [],
    };
  }
  const messagesEl = makeEl();
  const doc = { _handlers: {}, addEventListener(type, fn) { (doc._handlers[type] = doc._handlers[type] || []).push(fn); }, fire(type, evt) { (doc._handlers[type] || []).forEach((fn) => fn(evt)); } };
  const ctx = {
    messagesEl, document: doc,
    chatIsNearBottom: (threshold) => (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < (threshold == null ? 160 : threshold),
    __swallow: (e) => { throw e; },
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.__api = { chatUserWantsFollow, chatBreakFollow };', ctx);
  return { ctx, messagesEl, doc, api: ctx.__api };
}

test('المتابعة مفعَّلة افتراضيًّا، وعجلة الفأرة للأعلى توقفها', () => {
  const { messagesEl, api } = loadFollow();
  assert.equal(api.chatUserWantsFollow(), true);
  messagesEl.fire('wheel', { deltaY: -40 });
  assert.equal(api.chatUserWantsFollow(), false, 'عجلة للأعلى = نيّة مستخدم فعليّة');
});

test('تغيّر الموضع وحده بلا نيّة مستخدم لا يوقف المتابعة (لا تُستنتج من فرق الموضع)', () => {
  const { messagesEl, api } = loadFollow();
  // المتصفّح نفسه يحرّك الموضع (تعديل حجم رسالة مؤجَّلة، قفزة content-visibility):
  // لا عجلة ولا لمس ولا مفتاح ولا نقرة — رقم scrollTop يتغيّر وحده عدّة مرّات.
  messagesEl.scrollTop = 900;
  messagesEl.fire('scroll', {});
  messagesEl.scrollTop = 400;
  messagesEl.fire('scroll', {});
  messagesEl.scrollTop = 950; // فجوة = ١٠٠٠-٩٥٠-٢٠٠ = -١٥٠ (قرب الأسفل)
  messagesEl.fire('scroll', {});
  assert.equal(api.chatUserWantsFollow(), true, 'حركة المتصفّح وحدها لا تُعتبر نيّة مستخدم');
});

test('سحب باللمس أو مفتاح التنقّل للأعلى يوقفان المتابعة؛ الكتابة في الصندوق لا تُحسب', () => {
  const { messagesEl, doc, api } = loadFollow();
  messagesEl.fire('touchmove', {});
  assert.equal(api.chatUserWantsFollow(), false, 'touchmove نيّة مستخدم فعليّة');

  const { api: api2, doc: doc2 } = loadFollow();
  doc2.fire('keydown', { key: 'Home', target: { tagName: 'TEXTAREA' } });
  assert.equal(api2.chatUserWantsFollow(), true, 'Home داخل صندوق الكتابة ليس تمريرًا');
  doc2.fire('keydown', { key: 'PageUp', target: { tagName: 'DIV' } });
  assert.equal(api2.chatUserWantsFollow(), false, 'PageUp خارج حقل الكتابة يوقف المتابعة');
});

test('سحب شريط التمرير (نقرة على العنصر نفسه لا رسالة بداخله) يوقف المتابعة', () => {
  const { messagesEl, api } = loadFollow();
  messagesEl.fire('mousedown', { target: { fake: 'child-bubble' } });
  assert.equal(api.chatUserWantsFollow(), true, 'نقرة على رسالة بداخل القائمة ليست سحب شريط');
  messagesEl.fire('mousedown', { target: messagesEl });
  assert.equal(api.chatUserWantsFollow(), false, 'نقرة على العنصر القابل للتمرير نفسه = شريط التمرير');
});

test('العودة قرب الأسفل تُعيد المتابعة تلقائيًّا', () => {
  const { messagesEl, api } = loadFollow();
  messagesEl.fire('wheel', { deltaY: -10 });
  assert.equal(api.chatUserWantsFollow(), false);
  messagesEl.scrollTop = 790; // فجوة ١٠٠٠-٧٩٠-٢٠٠=١٠ < ٣٢
  messagesEl.fire('scroll', {});
  assert.equal(api.chatUserWantsFollow(), true, 'قرب الأسفل ← المتابعة تعود وحدها');
});

/* ---------- ٢) القرار قبل الإلحاق، وجزء كبير لا يوقف المتابعة — app-09-attach.js __liveRender ---------- */
function loadLiveRender(follow) {
  const a9 = read('js/app-09-attach.js');
  const start = a9.indexOf("const __live = { target: ''");
  const end = a9.indexOf('const __liveTimer = () => {', start);
  assert.ok(start > 0 && end > start, 'كتلة __liveRender موجودة');
  const src = a9.slice(start, end);
  const calls = [];
  const messagesEl = { scrollTop: 0, scrollHeight: 100, clientHeight: 100 };
  const thinkingDiv = { id: 'thinking' };
  const ctx = {
    document: { documentElement: { classList: { contains: () => false } } },
    messagesEl, thinkingDiv,
    chatUserWantsFollow: () => { calls.push('decision'); return follow; },
    renderStreamingAssistant: () => { calls.push('render'); messagesEl.scrollHeight = 50000; /* جزء كبير وصل دفعة واحدة */ },
    smartScrollBottom: (f) => calls.push('scroll:' + f),
    __swallow: (e) => { throw e; },
    Date,
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.__live2 = __live; this.__liveRender2 = __liveRender;', ctx);
  ctx.__live2.target = 'نصّ طويل فيه جدول ضخم'; ctx.__live2.shown = ctx.__live2.target.length;
  ctx.__liveRender2();
  return { calls, messagesEl };
}

test('القرار «هل نتابع؟» يُحسب قبل إلحاق النصّ الجديد (سطح المكتب)', () => {
  const { calls } = loadLiveRender(true);
  assert.deepEqual(calls, ['decision', 'render', 'scroll:true'], 'القرار أوّلًا، ثمّ الرسم، ثمّ التمرير');
});

test('جزء كبير يصل دفعة واحدة لا يوقف المتابعة (القرار لا يُعاد حسابه من الفجوة بعد الرسم)', () => {
  const { calls, messagesEl } = loadLiveRender(true);
  assert.ok(messagesEl.scrollHeight > 10000, 'الفجوة بعد الرسم تجاوزت أيّ حدّ قديم (١٦٠) بكثير');
  assert.ok(calls.includes('scroll:true'), 'ومع ذلك المتابعة استمرّت لأنّ القرار سبق الرسم');
});

test('إن قرّر المستخدم عدم المتابعة فلا تمرير — لكنّ الرسم يستمرّ', () => {
  const { calls } = loadLiveRender(false);
  assert.deepEqual(calls, ['decision', 'render'], 'النصّ يُحدَّث دائمًا؛ التمرير وحده يتوقّف');
});

/* ---------- ٣) المزامنة الدوريّة لا تعيد الرسم أثناء البثّ ---------- */
function loadSyncGuard(streaming) {
  const a4 = read('js/app-04-i18n-state.js');
  const line = a4.match(/try\{ if\(typeof renderAll === 'function' && !\(typeof window !== 'undefined' && window\.__omranStreamActive\)\) renderAll\(true\); \}catch\(e\)\{[^}]*\}/);
  assert.ok(line, 'سطر التأجيل أثناء البثّ موجود');
  let called = false;
  const ctx = { window: { __omranStreamActive: streaming }, renderAll: () => { called = true; }, __swallow: () => {} };
  vm.createContext(ctx);
  vm.runInContext(line[0], ctx);
  return called;
}

test('المزامنة لا تعيد رسم المحادثة أثناء بثّ جارٍ، وتعمل طبيعيًّا بعده', () => {
  assert.equal(loadSyncGuard(true), false, 'بثّ جارٍ ← لا إعادة رسم');
  assert.equal(loadSyncGuard(false), true, 'لا بثّ ← إعادة الرسم كالمعتاد');
});

/* ---------- ٤) علم البثّ يُرفع عند البدء ويُطفأ في النهاية ---------- */
test('app-09-attach.js: يرفع علم البثّ قبل نداءات المزوّد ويطفئه في النهاية', () => {
  const a9 = read('js/app-09-attach.js');
  const onIdx = a9.indexOf('window.__omranStreamActive = true;');
  const tryIdx = a9.indexOf('\n  try{', onIdx);
  const offIdx = a9.indexOf('window.__omranStreamActive = false;');
  assert.ok(onIdx > 0 && tryIdx > onIdx && tryIdx - onIdx < 200, 'العلم يُرفع مباشرة قبل try الطلب');
  assert.ok(offIdx > tryIdx, 'العلم يُطفأ في finally بعد try الطلب');
});
