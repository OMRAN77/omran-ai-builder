// tests/chat-wait-status.test.cjs — v-chat-wait (تدقيق ١٨–١٩ أكتوبر، g03 composer-send وchat-status-bar وcomposer-stop، وg05 chat-image-text-overlay).
// العرض: سؤال عاديّ يظهر له «جارٍ البناء...» ثابتًا حتّى يردّ الخادم (شريط الحالة لا يرسم بلا خطوة)، ثمّ «✓ موضوع جديد» بلا حركة
// كأنّ العمل انتهى (الملخّص آخر خطوة ولو انتهت)، وعلى الجوّال تكبر الفقاعة بعد تثبيت المحادثة فتختفي تحت صندوق الكتابة.
// وبعد «كبّر الخط» تكبر الصورة الجديدة بعد فكّ ترميزها فتنقصّ تحت الصندوق، وfinally يقيس بعد نموّها فيظنّ القارئ صعد.
// الآن: خطوة «يعمل…» فوريّة (مسار البناء «جارٍ البناء...»)، والملخّص آخر خطوة جارية والباقي في السجلّ، وكلّ رسم يلحق الأسفل
// بقرار الملاحقة نفسه، وصورة المساعد تلحق الأسفل عند تحميلها، وfinally يأخذ قرار الملاحقة (omranChatFollow) لا القياس.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const a9 = read('js/app-09-attach.js');
const a4 = read('js/app-04-i18n-state.js');
const fnSrc = (src, sig) => { const s = src.indexOf(sig); assert.ok(s >= 0, sig); return src.slice(s, src.indexOf('\n}\n', s) + 3); };

class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.classes = new Set(); this._text = ''; this.open = false; this.isConnected = true; }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return Array.from(this.classes).join(' '); }
  get classList() { const c = this.classes; return { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x) }; }
  set innerHTML(v) { this.children = []; this._text = ''; }
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  all() { return this.children.reduce((a, c) => a.concat([c], c.all()), []); }
  querySelector(sel) { const cls = sel.replace(/^\./, ''); return this.all().find((n) => n.classes.has(cls)) || null; }
}

function makeEnv() {
  const calls = { scroll: 0 };
  const ctx = { document: { createElement: (t) => new El(t) }, smartScrollBottom: () => { calls.scroll++; } };
  vm.createContext(ctx);
  vm.runInContext(fnSrc(a9, 'function makeChatStatus(el){') + '\nthis.makeChatStatus = makeChatStatus;', ctx);
  const el = new El('div');
  const st = ctx.makeChatStatus(el);
  const summary = () => el.all().find((n) => n.tagName === 'SUMMARY');
  const history = () => el.all().filter((n) => n.classes.has('chat-status-row')).map((r) => r.className.replace('chat-status-row ', '') + ':' + r.textContent);
  return { el, st, calls, summary, history };
}

test('١. خطوة «يعمل…» الفوريّة ترسم الشريط بشرارته ونقاطه قبل أيّ حدث من الخادم', () => {
  const e = makeEnv();
  e.st.phase('✦', 'يعمل…');
  assert.ok(e.el.querySelector('.chat-status-fold'), 'الشريط مرسوم');
  assert.ok(e.summary().classes.has('is-running'), 'الملخّص جارٍ');
  assert.ok(e.el.querySelector('.chat-status-dots'), 'نقاط الكتابة');
  assert.match(e.summary().textContent, /يعمل…/);
});

test('٢. خطوة منتهية بعد «يعمل…» («✓ موضوع جديد») لا تحلّ محلّ الملخّص الجاري — تدخل السجلّ', () => {
  const e = makeEnv();
  e.st.phase('✦', 'يعمل…');
  e.st.step('🧭', 'موضوع جديد').done();
  assert.match(e.summary().textContent, /^✦يعمل…/, 'الملخّص «يعمل…» لا «✓ موضوع جديد»');
  assert.ok(e.summary().classes.has('is-running') && e.el.querySelector('.chat-status-dots'), 'بحركته');
  assert.deepEqual(e.history(), ['done:✓موضوع جديد']);
});

test('٣. خطوة الخادم الجارية تصير الملخّص و«يعمل…» في السجلّ، وحين تنتهي يعود «يعمل…» جاريًا ما دام الطلب قائمًا', () => {
  const e = makeEnv();
  e.st.phase('✦', 'يعمل…');
  const s = e.st.step('•', 'يقرأ سؤالك…');
  assert.match(e.summary().textContent, /يقرأ سؤالك…/);
  assert.ok(e.history().some((h) => h.endsWith('يعمل…')), 'يعمل… في السجلّ');
  s.done();
  assert.match(e.summary().textContent, /يعمل…/);
  assert.deepEqual(e.history(), ['done:✓يقرأ سؤالك…']);
  // مرحلة جديدة (المزوّد يكتب) تُنهي «يعمل…» وإن لم تكن آخر خطوة
  e.st.phase('💭', 'السريع يكتب…');
  assert.match(e.summary().textContent, /السريع يكتب…/);
  assert.ok(e.history().includes('done:✓يعمل…'), e.history().join(' | '));
});

test('٤. فكّ الشريط لا يترك خطوة جارية خلفه (لا نقاط ثابتة فوق الردّ)', () => {
  const e = makeEnv();
  e.st.phase('✦', 'يعمل…');
  e.st.step('🧭', 'موضوع جديد').done();
  e.st.step('•', 'يبحث…');
  e.st.release();
  assert.ok(!e.summary().classes.has('is-running'), 'لا ملخّص جارٍ');
  assert.equal(e.el.querySelector('.chat-status-dots'), null, 'لا نقاط');
  assert.equal(e.st.isReleased(), true);
});

test('٥. كلّ رسم يلحق الأسفل بقرار الملاحقة (smartScrollBottom) والفقاعة معروضة، ولا يلمس شيئًا وهي في محادثة أخرى', () => {
  const e = makeEnv();
  e.st.phase('✦', 'يعمل…');
  e.st.step('🧭', 'موضوع جديد').done();
  assert.equal(e.calls.scroll, 3, 'phase + step + done');
  e.el.isConnected = false;
  e.st.phase('💭', 'يكتب…');
  e.st.note('⚠️', 'تعثّر');
  assert.equal(e.calls.scroll, 3, 'فقاعة غير معروضة لا تحرّك المحادثة المعروضة');
});

test('٦. __sendPromptCore: «يعمل…» فور إنشاء الشريط بدل «جارٍ البناء...» الثابت، والبناء وحده «جارٍ البناء...»', () => {
  const s = a9.indexOf('async function __sendPromptCore(');
  const core = a9.slice(s, a9.indexOf("\nlocalStorage.removeItem('autoSpeakReplies');", s)); // __friendlyErr تصريح داخليّ في العمود الأوّل
  assert.ok(!core.includes("thinkingDiv.textContent = t('building');"), 'لا نصّ «جارٍ البناء...» لكلّ رسالة');
  assert.match(core, /const chatStatus = makeChatStatus\(thinkingDiv\); chatStatus\.phase\('✦', t\('cwWorking'\)\);/);
  const ask = core.indexOf('const askAll = ');
  assert.ok(ask > 0);
  // بعد askAll مباشرةً وخارج مقطع التوجيه الذي تقتطعه اختبارات أخرى (حتّى «// آخر نص كامل وصل من البث»)
  const after = core.slice(ask, core.indexOf('\n', core.indexOf('let __lastStreamPartial', ask)) + 1);
  assert.match(after, /\n  let __lastStreamPartial[^\n]*\n$/);
  assert.match(core.slice(ask, ask + after.length + 200), /let __lastStreamPartial[^\n]*\n\s*if\(askAll\) chatStatus\.phase\('✦', t\('building'\)\);/);
});

test('٧. صورة المساعد الجديدة تلحق الأسفل عند تحميلها إن كان القارئ ملاحِقًا، ولا تشدّ من صعد', () => {
  const line = a4.split('\n').find((l) => l.includes("img.classList.add('genImg')"));
  assert.ok(line, 'سطر genImg');
  const run = (follow) => {
    const handlers = {};
    const img = { isConnected: true, classList: { add() {} }, addEventListener: (ev, fn) => { handlers[ev] = fn; } };
    const messagesEl = { scrollTop: 100, scrollHeight: 900 };
    // smartScrollBottom(true) كما في app-02: يكتب الأسفل ويزامن زرّ ↓
    const ctx = { m: { role: 'assistant' }, a: {}, img, messagesEl, window: { omranChatFollow: { follow: () => follow } }, smartScrollBottom: (near) => { if(near === true) messagesEl.scrollTop = messagesEl.scrollHeight; }, __swallow(e) { throw e; } };
    vm.createContext(ctx);
    vm.runInContext(line, ctx);
    assert.equal(typeof handlers.load, 'function', 'مستمع load على genImg');
    messagesEl.scrollHeight = 1300; // الصورة كبرت بعد فكّ ترميزها
    handlers.load();
    return messagesEl.scrollTop;
  };
  assert.equal(run(true), 1300, 'الملاحِق يرى الصورة كاملة');
  assert.equal(run(false), 100, 'من صعد يبقى مكانه');
});

test('٨. finally يحفظ موضع القارئ بقرار الملاحقة (omranChatFollow) لا بقياس الفجوة بعد نموّ الصورة', () => {
  const line = a9.split('\n').find((l) => l.includes('const __keepReaderPosition = '));
  assert.ok(line, 'سطر __keepReaderPosition');
  const run = (mobile, follow, gapNear) => {
    const ctx = {
      document: { documentElement: { classList: { contains: (c) => c === 'mobile-ui' && mobile } } },
      window: follow === null ? {} : { omranChatFollow: { follow: () => follow } },
      chatIsNearBottom: () => gapNear,
    };
    vm.createContext(ctx);
    vm.runInContext(line.replace('const __keepReaderPosition', 'this.k'), ctx);
    return ctx.k;
  };
  assert.equal(run(false, true, false), false, 'ملاحِق والفجوة كبرت بالصورة (٣٢٤px) ← يلحق الأسفل');
  assert.equal(run(false, false, true), true, 'صعد بنفسه ← يبقى موضعه');
  assert.equal(run(true, false, false), false, 'الجوّال كما كان');
  assert.equal(run(false, null, false), true, 'بلا وحدة الملاحقة: القياس القديم');
});
