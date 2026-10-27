'use strict';
/* v-scroll-free (المالك ١٣ أكتوبر: «حرية الحركة داخل المحادثة يعني اذا فيه محادثة تنزل معها ونفس الوقت اقدر احركها»): البثّ يلاحق
   الأسفل، والمستخدم يحرّك القائمة في الوقت نفسه بلا شدّ. قرار الملاحقة في js/app-40-chat-follow.js (حالة تغيّرها حركة المستخدم)،
   وsmartScrollBottom/anchorLastUserMsgTop/زرّ ↓ (app-02) تُشغَّل كما هي في vm على قائمة مزيّفة بساعة نتحكّم بها. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function fnSrc(src, name) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const fn = ast.body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === name);
  assert.ok(fn, name);
  return src.slice(fn.start, fn.end);
}

/* قائمة رسائل مزيّفة: scrollTop مقيّد كالمتصفّح، وكلّ تغيّر فيه يطلق scroll (متزامنًا هنا للتبسيط). */
function makeWorld(contentH = 3000) {
  const L = {}; const on = (map) => (type, fn) => { (map[type] = map[type] || []).push(fn); };
  const winL = {}; const docL = {};
  let clock = 1000000;
  const el = {
    clientHeight: 600, _h: contentH, _top: 0, writes: 0,
    get scrollHeight() { return this._h; },
    get scrollTop() { return this._top; },
    set scrollTop(v) { this._setTop(v); this.writes++; },
    _setTop(v) { const nt = Math.max(0, Math.min(v, this._h - this.clientHeight)); if (nt !== this._top) { this._top = nt; fire(L, 'scroll', {}); } },
    addEventListener: on(L),
    scrollTo(o) { this.scrollTop = o.top; },
  };
  const fire = (map, type, e) => (map[type] || []).forEach((f) => f(e));
  el._top = Math.max(0, contentH - el.clientHeight);
  const btn = { classList: { toggle() {} } };
  const ctx = {
    console, Date: { now: () => clock },
    document: { getElementById: (id) => (id === 'messages' ? el : null), addEventListener: on(docL), documentElement: { classList: { contains: () => false } } },
    $: (s) => (s === '#messages' ? el : s === '#chatJumpBottom' ? btn : null), __swallow() {}, setTimeout: () => 0,
  };
  ctx.window = ctx; ctx.addEventListener = on(winL);
  vm.runInNewContext(read('js/app-40-chat-follow.js'), ctx);
  const tts = read('js/app-02-tts.js');
  vm.runInNewContext('const messagesEl = $("#messages");\n' + ['anchorLastUserMsgTop', 'chatIsNearBottom', 'syncChatJumpButton', 'smartScrollBottom'].map((n) => fnSrc(tts, n)).join('\n')
    + '\nconst chatJumpBottomBtn = $("#chatJumpBottom");\n' + tts.slice(tts.indexOf('if(chatJumpBottomBtn){'), tts.indexOf('}\n', tts.indexOf('chatJumpBottomBtn.onclick')) + 2)
    + '\nthis.smart = smartScrollBottom; this.anchor = anchorLastUserMsgTop; this.jump = chatJumpBottomBtn.onclick;', ctx);
  const w = {
    el, ctx, F: ctx.omranChatFollow,
    tick(grow = 40) { el._h += grow; ctx.smart(); },            // نبضة بثّ: الردّ يكبر ثمّ المسار يقرّر
    user(dy) { el._setTop(el._top + dy); },                   // المستخدم يحرّك القائمة (لا يُحسب كتابة منّا)
    wheel(dy) { fire(L, 'wheel', { deltaY: dy }); w.user(dy); },
    touch(type) { fire(L, type, { touches: [{ clientY: 300 }] }); },
    key(k, tag = 'BODY') { fire(docL, 'keydown', { key: k, target: { tagName: tag } }); },
    wait(ms) { clock += ms; },
    gap() { return el._h - el._top - el.clientHeight; },
  };
  return w;
}

test('١. يلاحق: البثّ ينزل مع الردّ ما دام المستخدم لم يتحرّك', () => {
  const w = makeWorld();
  for (let i = 0; i < 20; i++) w.tick();
  assert.equal(w.gap(), 0);
  assert.equal(w.el.writes, 20);
});

test('٢. عجلة للأعلى أثناء البثّ: يتحرّر فورًا، ولا كتابة بعدها مهما طال الردّ', () => {
  const w = makeWorld();
  w.tick(); w.wheel(-120);
  const top = w.el.scrollTop, writes = w.el.writes;
  for (let i = 0; i < 30; i++) { w.wait(50); w.tick(); }
  assert.equal(w.el.scrollTop, top, 'مكان القراءة ثابت');
  assert.equal(w.el.writes, writes, 'لا كتابة واحدة');
  assert.equal(w.F._state().stick, false);
});

test('٣. سحب بطيء بالإصبع (٢px لكلّ نبضة — كان يُشدّ للأسفل كلّ مرّة): لا كتابة والإصبع على الشاشة، ويبقى حيث تركه', () => {
  const w = makeWorld();
  w.tick();
  const writes = w.el.writes;
  w.touch('touchstart');
  for (let i = 0; i < 40; i++) { w.touch('touchmove'); w.user(-2); w.tick(); w.wait(30); }
  assert.equal(w.el.writes, writes, 'لا كتابة فوق الإصبع');
  assert.equal(w.F._state().stick, false, 'السحب للأعلى حرّر الملاحقة');
  w.touch('touchend');
  const top = w.el.scrollTop;
  for (let i = 0; i < 30; i++) { w.wait(100); w.tick(); }
  assert.equal(w.el.scrollTop, top, 'بعد رفع الإصبع والانزلاق لا يُقذف للأسفل');
});

test('٤. الإصبع على الشاشة وهو في الأسفل: لا كتابة حتّى يرفعه، ثمّ مهلة الانزلاق، ثمّ يلاحق من جديد', () => {
  const w = makeWorld();
  w.touch('touchstart'); w.touch('touchmove');
  const writes = w.el.writes;
  w.tick(); w.tick();
  assert.equal(w.el.writes, writes, 'لا كتابة والإصبع ممسك');
  w.touch('touchend');
  w.wait(300); w.tick();
  assert.equal(w.el.writes, writes, 'لا كتابة خلال مهلة الانزلاق');
  w.wait(500); w.tick();
  assert.equal(w.gap(), 0, 'بعد المهلة يلاحق: كان في الأسفل ولم يصعد');
});

test('٥. رجع بنفسه للأسفل (عجلة أو إصبع أو مفتاح End) → يلاحق من جديد بلا زرّ', () => {
  const w = makeWorld();
  w.wheel(-400);
  for (let i = 0; i < 5; i++) w.tick();
  assert.ok(w.gap() > 400);
  w.wait(1000); w.wheel(w.gap()); // نزل حتّى الأسفل
  assert.equal(w.F._state().stick, true);
  w.wait(500); w.tick();
  assert.equal(w.gap(), 0, 'الملاحقة رجعت');
  // بالإصبع: صعد ثمّ نزل حتّى الأسفل والإصبع ممسك
  w.touch('touchstart'); w.touch('touchmove'); w.user(-300);
  assert.equal(w.F._state().stick, false);
  w.touch('touchmove'); w.user(1000);
  w.touch('touchend'); w.wait(800); w.tick();
  assert.equal(w.gap(), 0, 'نزل بإصبعه للأسفل فرجعت الملاحقة');
});

test('٦. لا تحرير كاذب: عجلة داخل صندوق كود (القائمة لم تتحرّك)، تقلّص المحتوى، محادثة قصيرة لا تتمرّر', () => {
  const w = makeWorld();
  w.wheel(0); // عجلة على عنصر داخليّ: القائمة لا تتحرّك
  w.wait(450); w.tick();
  assert.equal(w.gap(), 0, 'العجلة الداخليّة لم توقف الملاحقة');
  w.wheel(0); // وتقلّص المحتوى خلال مهلة العجلة: المتصفّح يقيّد scrollTop للأعلى بلا حركة من المستخدم
  w.el._h -= 200; w.el._setTop(w.el._top);
  assert.equal(w.F._state().stick, true, 'التقلّص ليس صعودًا');
  w.wait(450); w.tick();
  assert.equal(w.gap(), 0, 'التقلّص ليس حركة مستخدم');
  const s = makeWorld(300); // أقصر من الشاشة
  s.wheel(-120); s.touch('touchstart'); s.touch('touchmove'); s.touch('touchend');
  s.wait(1000);
  for (let i = 0; i < 20; i++) s.tick(); // الردّ يطول حتّى يتجاوز الشاشة
  assert.equal(s.gap(), 0, 'محادثة قصيرة: السحب بلا حركة لا يحرّر');
});

test('٧. إرسال رسالة وزرّ ↓ يعيدان الملاحقة؛ ومفتاح ↑ في حقل الكتابة لا يمسّها', () => {
  const w = makeWorld();
  w.wheel(-500); w.wait(1000); w.tick();
  assert.ok(w.gap() > 0);
  w.ctx.jump();
  assert.equal(w.gap(), 0); w.tick(); assert.equal(w.gap(), 0, 'الزرّ أعاد الملاحقة');
  w.wheel(-500); w.wait(1000);
  w.ctx.anchor();
  w.tick();
  assert.equal(w.gap(), 0, 'الإرسال أعاد الملاحقة');
  w.key('ArrowUp', 'TEXTAREA'); w.user(-50);
  assert.equal(w.F._state().stick, true, 'التنقّل داخل حقل الكتابة ليس تمريرًا للقائمة');
  w.user(50);
  w.key('PageUp'); w.user(-500);
  assert.equal(w.F._state().stick, false, 'PageUp خارج الحقول يحرّر');
});

test('٨. إعادة رسم القائمة: محادثة أخرى تُفتح من الأسفل، والمحادثة نفسها تحترم موضع القارئ', () => {
  const w = makeWorld();
  assert.equal(w.F.forRender('a'), true);
  w.wheel(-500); w.wait(1000);
  assert.equal(w.F.forRender('a'), false, 'يقرأ في الأعلى: الرسم يحفظ موضعه');
  assert.equal(w.F.forRender('b'), true, 'محادثة أخرى: من الأسفل');
});

test('٩. التوصيل: كلّ مسارات البثّ تمرّ بقرار واحد، والقديم المبنيّ على ٤٠px بين نبضتين أُزيل', () => {
  const core = read('js/app-09-attach.js');
  const live = core.slice(core.indexOf('const __liveRender = () => {'), core.indexOf('};', core.indexOf('const __liveRender = () => {')));
  assert.ok(live.includes('smartScrollBottom();'), 'البثّ الرئيسيّ');
  assert.ok(!/userBroke|lastAutoTop/.test(core), 'الكشف القديم أُزيل');
  assert.ok(!/chatIsNearBottom\(\)\) messagesEl\.scrollTop = messagesEl\.scrollHeight/.test(core + read('js/app-29-cc.js')), 'الوكيل والجسر بلا قرار خاصّ');
  assert.equal((core.match(/smartScrollBottom\(\); \/\/ v-scroll-free/g) || []).length, 3, 'كلام الوكيل وخطواته وصندوق العمل');
  assert.ok(read('js/app-29-cc.js').includes('try{ smartScrollBottom(); }'), 'جسر Claude Code');
  assert.ok(fnSrc(core, 'omranShowThink').includes('smartScrollBottom()'), 'صندوق العمل يكبر قبل الكلام');
  assert.ok(read('js/app-04-i18n-state.js').includes('window.omranChatFollow.forRender(__cInit && __cInit.id)'), 'renderMessages');
  assert.ok(read('.vercelignore').split('\n').includes('js/app-40-chat-follow.js'), 'الجزء خارج النشر الخام');
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('window.omranChatFollow = {'), 'الحزمة مبنيّة من الأجزاء');
  assert.ok(bundle.indexOf('function smartScrollBottom(') < bundle.indexOf('window.omranChatFollow = {'), 'ترتيب الأجزاء: app-02 قبل app-40 (الدالّة تقرأه وقت النداء)');
});

test('١٠. نهاية الردّ لا تقذف القارئ: الرسائل تُرسم كاملة لحظة استعادة الموضع (content-visibility كان يقدّرها ١٦٠px فيُقصّ إلى ٠)', () => {
  const src = read('js/app-04-i18n-state.js');
  const rm = fnSrc(src, 'renderMessages');
  const at = rm.indexOf("const __cvAll = document.documentElement.classList.contains('cv-ok') ? Array.from(messagesEl.querySelectorAll('.msg')) : [];");
  assert.ok(at > 0, 'على cv-ok وحده');
  const restore = rm.indexOf('messagesEl.scrollTop = prevScrollTop;');
  const bottom = rm.indexOf('messagesEl.scrollTop = messagesEl.scrollHeight;');
  assert.ok(at < bottom && at < restore, 'قبل الكتابتين: الأسفل والموضع المحفوظ');
  assert.ok(rm.includes("__cvAll.forEach(__m => { __m.style.contentVisibility = 'visible'; });"));
  assert.ok(rm.includes("requestAnimationFrame(() => requestAnimationFrame(() => __cvAll.forEach(__m => { if(__m.style.contentVisibility === 'visible') __m.style.contentVisibility = ''; })))"), 'تعود القاعدة بعد أن تُحفظ الأحجام (auto)');
  assert.ok(read('css/tokens.css').includes('html.cv-ok .msg{content-visibility:auto; contain-intrinsic-size:auto 160px;}'), 'القاعدة التي تحفظ الحجم الأخير باقية كما هي');
});
