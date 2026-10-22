'use strict';
/* v-img-dots-plus (المالك بلقطة «محرّك GPT (خام)» وتحت طلبه سطر «أرسم لك الصورة» وحده: «شوف الشعار الي يرسم غير موجود»):
   مربّع النقاط الذهبيّة (v-img-gold-dots) كان داخل __sendPromptCore فلم تبلغه مسارات «+» (نانو/GPT خام، «إنشاء صورة»)،
   وكانت تدفع رسالة نصّ وترسم القائمة فتسقط فقاعة الانتظار. الدوالّ الحقيقيّة من js/app-09-attach.js تُشغَّل هنا في vm بـDOM مزيّف
   ومولّد مزيّف — كلّ حالة تفشل على الكود السابق. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 'latest', sourceType: 'script' });
const top = (name) => {
  const n = AST.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === name);
  assert.ok(n, 'دالّة مفقودة: ' + name);
  return SRC.slice(n.start, n.end);
};

/* DOM مزيّف بقدر ما تلمسه الدوالّ: عناصر بأبناء وأب، isConnected بالصعود إلى الجذر، وremove */
function makeDom() {
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.parentNode = null; this.innerHTML = ''; this.textContent = ''; this.className = ''; this.id = ''; }
    get isConnected() { let p = this; while (p.parentNode) p = p.parentNode; return p === root; }
    appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; } }
  }
  const root = new El('html');
  const head = root.appendChild(new El('head'));
  const messagesEl = root.appendChild(new El('div'));
  const document = {
    head,
    createElement: (t) => new El(t),
    getElementById: (id) => head.children.find((x) => x.id === id) || null,
  };
  return { document, messagesEl, El };
}

function deferred() { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; }
const okRes = (body) => ({ ok: true, status: 200, json: async () => body });
const flush = () => new Promise((r) => setImmediate(r));
const IMG = { imageBase64: 'QkFTRQ==', mimeType: 'image/png', caption: 'شعار ذهبيّ.' };

function makeEnv(opt = {}) {
  const dom = makeDom();
  const calls = [];
  const pending = [];
  const sb = {
    console, Promise, setTimeout, JSON, String, Array, Object, Math, Error, AbortController,
    lang: 'ar', genAbortController: null, state: { currentId: 'c1' },
    document: dom.document, messagesEl: dom.messagesEl,
    renders: 0,
    renderAll() { sb.renders++; dom.messagesEl.children.slice().forEach((c) => dom.El.prototype.remove.call(c)); }, /* كالعارض: يعيد بناء القائمة فيُسقط فقاعة الانتظار */
    saveState() {}, __swallow() {}, t: (k) => k,
    authGet: (k) => (k === 'aiapp_username' ? (opt.user || 'omran') : ''),
    fetch: (url, init) => { const d = deferred(); calls.push({ url, body: JSON.parse(init.body) }); pending.push(d); return d.p; },
    omranSharpenImage: async (u) => u,
    omranShrinkForEdit: async (b64, mime) => ({ b64, mime }),
    __imgEngineLine: () => '',
    __textPosArg: () => 'auto', __textScale: () => 1,
  };
  sb.window = sb;
  sb.getGuestId = () => 'g';
  if (opt.parse) sb.__parseImageTextSpec = opt.parse;
  vm.createContext(sb);
  vm.runInContext([top('__omranImgDots'), top('__omranImgWait'), top('omModeGenerateImage'), top('omModeRawImage')].concat(opt.extra || []).join('\n'), sb);
  return { sb, dom, calls, pending };
}
function thinking(env) {
  const el = env.dom.document.createElement('div'); el.className = 'msg assistant';
  env.dom.messagesEl.appendChild(el);
  const rm = el.remove.bind(el);
  el.remove = () => { el.__gone = true; rm(); };
  return el;
}
const dotsIn = (el) => (el.innerHTML.match(/class="omDot"/g) || []).length;
const loadingMsgs = (cur) => cur.messages.filter((m) => m._loading || /أرسم لك/.test(String(m.content || '')));

test('١. «محرّك GPT (خام)» بلا صورة: مربّع النقاط في فقاعة الانتظار طول التوليد، لا سطر «أرسم لك الصورة»، ثمّ الصورة تحلّ محلّه', async () => {
  const env = makeEnv();
  const cur = { id: 'c1', messages: [] };
  const th = thinking(env);
  const run = env.sb.omModeRawImage(cur, 'ارسم شعار ذهبي ثلاثي الأبعاد', th, 'gpt', []);
  await flush();
  assert.equal(env.calls.length, 1, 'نداء التوليد خرج');
  assert.equal(env.calls[0].body.forceEngine, 'gpt');
  assert.match(th.innerHTML, /class="omGen"/, 'المربّع مرسوم');
  assert.equal(dotsIn(th), 149, 'الشبكة كاملة ١٥×١٠ ناقص نقطة القوس');
  assert.ok(th.isConnected, 'الفقاعة باقية في المحادثة — لم يُسقطها رسم القائمة');
  assert.equal(loadingMsgs(cur).length, 0, 'بلا رسالة انتظار نصّيّة');
  assert.equal(env.sb.renders, 0, 'لا رسم للقائمة قبل النتيجة');
  assert.ok(env.dom.document.getElementById('omran-imggen-css2'), 'CSS المربّع مركَّب');
  env.pending[0].resolve(okRes(IMG));
  await run;
  assert.equal(cur.messages.length, 2, 'الصورة ثمّ تقريرها');
  assert.ok(cur.messages[0].attachments && cur.messages[0].attachments[0].isImage, 'الصورة أوّلًا');
  assert.equal(cur.messages[1].content, 'شعار ذهبيّ.');
  assert.ok(!th.isConnected && th.__gone, 'المربّع رُفع');
  assert.equal(loadingMsgs(cur).length, 0);
});

test('٢. حالة المالك نفسها: «GPT خام» مع صورتين مرفقتين — المربّع يظهر قبل التصغير والنداء، والدمج كما كان', async () => {
  const env = makeEnv();
  const cur = { id: 'c1', messages: [] };
  const th = thinking(env);
  const atts = [{ dataUrl: 'data:image/png;base64,QUFB', mime: 'image/png' }, { dataUrl: 'data:image/jpeg;base64,QkJC', mime: 'image/jpeg' }];
  const run = env.sb.omModeRawImage(cur, 'غير الشكل كامل شكل 3d واكتب اختيار الملف', th, 'gpt', atts);
  assert.match(th.innerHTML, /class="omGen"/, 'المربّع فورًا (قبل أيّ انتظار)');
  await flush();
  assert.equal(env.calls[0].body.editImageBase64, 'QkJC', 'الصورة الأخيرة هي المصدر');
  assert.equal(env.calls[0].body.extraImages.length, 1, 'والأولى مرجع إضافيّ');
  env.pending[0].resolve({ ok: false, status: 500, json: async () => ({ error: 'تعذّر', __diag: { openai: 'x' } }) });
  await run;
  assert.equal(cur.messages.length, 1);
  assert.match(cur.messages[0].content, /^تعذّر توليد الصورة الآن — تعذّر \[x\]$/, 'الفشل سطر واحد كما كان');
  assert.ok(!th.isConnected, 'والمربّع رُفع');
});

test('٣. فقاعة سقطت قبل النداء تعود للمحادثة المعروضة وحدها (v-parallel-chats)', async () => {
  for (const [shown, want] of [['c1', true], ['c2', false]]) {
    const env = makeEnv();
    env.sb.state.currentId = shown;
    const cur = { id: 'c1', messages: [] };
    const th = thinking(env);
    env.sb.renderAll(); /* رسم سابق أسقط الفقاعة (بلا علامة __gone) */
    assert.ok(!th.isConnected && !th.__gone);
    const run = env.sb.omModeRawImage(cur, 'قطة', th, 'nano', []);
    await flush();
    assert.equal(th.isConnected, want, 'المعروضة ' + shown);
    assert.match(th.innerHTML, /class="omGen"/);
    env.pending[0].resolve(okRes(IMG));
    await run;
  }
});

test('٤. «إنشاء صورة» من «+»: المربّع، والإيقاف سطر «تم إيقاف»، وسؤال النصّ الحرفيّ بلا مربّع ولا نداء', async () => {
  {
    const env = makeEnv();
    const cur = { id: 'c1', messages: [] };
    const th = thinking(env);
    env.sb.__omMode = 'image';
    const run = env.sb.omModeGenerateImage(cur, 'صورة بحر', th);
    await flush();
    assert.match(th.innerHTML, /class="omGen"/);
    assert.equal(loadingMsgs(cur).length, 0);
    env.pending[0].reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await run;
    assert.deepEqual(cur.messages.map((m) => m.content), ['تم إيقاف إنشاء الصورة.']);
    assert.ok(!th.isConnected);
  }
  {
    const env = makeEnv({ parse: () => ({ wantsText: true, exactText: null, autoAuthored: false, visualPrompt: 'x' }) });
    const cur = { id: 'c1', messages: [] };
    const th = thinking(env);
    await env.sb.omModeGenerateImage(cur, 'صورة واكتب عليها', th);
    assert.equal(env.calls.length, 0, 'لا نداء');
    assert.doesNotMatch(th.innerHTML, /omGen/, 'سؤال لا انتظار');
    assert.equal(cur.messages.length, 1);
    assert.match(cur.messages[0].content, /أرسل النص نفسه/);
    assert.ok(!cur.messages[0]._loading);
  }
});

test('٥. بلا فقاعة (نداء بلا عنصر) يبقى سطر «🎨 أرسم لك الصورة…» كما كان', async () => {
  const env = makeEnv();
  const cur = { id: 'c1', messages: [] };
  const run = env.sb.omModeGenerateImage(cur, 'صورة بحر', null);
  await flush();
  assert.equal(cur.messages.length, 1);
  assert.equal(cur.messages[0].content, '🎨 أرسم لك الصورة…');
  assert.ok(cur.messages[0]._loading);
  env.pending[0].resolve(okRes(IMG));
  await run;
  assert.equal(cur.messages.length, 2, 'الرسالة نفسها صارت الصورة، وبعدها التقرير — بلا تكرار');
  assert.ok(cur.messages[0].attachments && !cur.messages[0]._loading);
});

test('٦. المسار العاديّ: __showImgLoading داخل __sendPromptCore غلاف يفكّ شريط الحالة ثمّ يرسم المربّع المشترك لمحادثة طلبه', () => {
  const core = AST.body.find((x) => x.type === 'FunctionDeclaration' && x.id && x.id.name === '__sendPromptCore');
  let fn = null;
  (function walk(n) {
    if (!n || typeof n.type !== 'string' || fn) return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === '__showImgLoading') { fn = n; return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(core);
  assert.ok(fn, '__showImgLoading باقية داخل __sendPromptCore (نداءاتها الاثنا عشر كما هي)');
  const body = SRC.slice(fn.body.start, fn.body.end);
  assert.ok(body.indexOf('_st.release()') > 0 && body.indexOf('__omranImgDots(el, __mine(), ') > body.indexOf('_st.release()'), 'يفكّ الشريط ثمّ يرسم');
  assert.ok(!/omDot|omran-imggen-css2/.test(body), 'الرسم نفسه خرج من الدالّة');
});

/* ── مراجعة عدائيّة (ثلاث ملاحظات حقيقيّة على الالتزام الأوّل) ── */

test('٧. شريط حالة الطلب يُفكّ قبل مسارَي «+» — فلا يكتب chatPhase محادثة أخرى (فيديو جارٍ) فوق المربّع', async () => {
  /* السطر الحقيقيّ في __sendPromptCore: الفكّ ثمّ النداء في العبارة نفسها، للمسارين */
  for (const call of ['await omModeRawImage(cur, text, thinkingDiv,', 'await omModeGenerateImage(cur, apiText, thinkingDiv);']) {
    const line = SRC.split('\n').find((l) => l.includes(call));
    assert.ok(line, call);
    assert.ok(line.indexOf('try{ chatStatus.release(); }') >= 0 && line.indexOf('try{ chatStatus.release(); }') < line.indexOf(call), 'يُفكّ قبل: ' + call);
  }
  /* والأثر بالدوالّ الحقيقيّة: شريط مفكوك بلا خطوات لا يرسم شيئًا، وchatPhase محادثة أخرى يكتب في عنصرها هي */
  const env = makeEnv({ extra: [top('makeChatStatus'), top('chatPhase')] });
  const cur = { id: 'c1', messages: [] };
  const th = thinking(env);
  const A = env.sb.makeChatStatus(th);
  env.sb.__chatStatus = A; /* آخر طلب بدأ = هذه المحادثة */
  A.release(); /* ما يفعله السطر أعلاه */
  const run = env.sb.omModeRawImage(cur, 'قطة', th, 'gpt', []);
  await flush();
  const other = env.dom.document.createElement('div');
  env.sb.chatPhase('🎬', 'جاري إنشاء الفيديو… RUNNING', other); /* حلقة فيديو محادثة أخرى كلّ ٥ ث */
  assert.match(th.innerHTML, /class="omGen"/, 'المربّع باقٍ');
  assert.equal(other.textContent, '🎬 جاري إنشاء الفيديو… RUNNING', 'نصّ الفيديو في محادثته');
  env.pending[0].resolve(okRes(IMG));
  await run;
});

test('٨. رسم كامل للمحادثة نفسها أثناء الانتظار («عرض الرسائل الأقدم»، اللغة) يعيد المربّع، وبعد النتيجة لا يعيده فوقها', async () => {
  const runCode = ['var __OMRAN_WD_HARD_MS = 300000;', 'var __omranRuns = {};', 'var __omranRunViewPid = null, __omranRunViewLive = false;',
    top('__omranRunStart'), top('__omranRunEnd'), top('__omranAbortRun'), top('__omranSyncRunView')];
  const env = makeEnv({ extra: runCode });
  const sb = env.sb;
  sb.clearTimeout = clearTimeout; sb.Date = Date; sb.__omranRestoreSendBtn = () => {};
  env.dom.document.querySelectorAll = () => [];
  const seen = [];
  /* كالعارض الحقيقيّ: الرسم الكامل يفرغ القائمة، وغلاف renderMessages ينادي __omranSyncRunView بعده */
  sb.renderAll = () => { sb.renders++; env.dom.messagesEl.children.slice().forEach((c) => env.dom.El.prototype.remove.call(c)); sb.__omranSyncRunView(); seen.push(th.isConnected); };
  const cur = { id: 'c1', messages: [] };
  const r = sb.__omranRunStart('c1', new AbortController());
  const th = thinking(env);
  r.thinking = th;
  try {
  const run = sb.omModeRawImage(cur, 'قطة', th, 'gpt', []);
  await flush();
  sb.renderAll(); /* «⬆ عرض الرسائل الأقدم» */
  assert.equal(seen[0], true, 'أُعيدت الفقاعة بعد الرسم');
  assert.match(th.innerHTML, /class="omGen"/, 'وفيها المربّع');
  sb.renderAll();
  assert.equal(env.dom.messagesEl.children.filter((c) => c === th).length, 1, 'مرّة واحدة لا نسختان');
  env.pending[0].resolve(okRes(IMG));
  await run;
  assert.equal(seen[seen.length - 1], false, 'رسم النتيجة لا يعيد المربّع فوقها');
  assert.ok(!th.isConnected && th.__gone);
  } finally { sb.__omranRunEnd(r); /* حارس الطلب (٣٠٠ ث) لا يبقي العمليّة حيّة إن فشل شيء */ }
});

test('٩. عنوان المربّع بلغة الواجهة: العربيّة كما هي، وغيرها من مفتاح stGenImage القائم (كان عربيًّا للّغات الـ١٤ كلّها)', () => {
  const tr = { en: '🎨 Drawing an image…', fr: "🎨 Dessin d'une image…", ur: '🎨 تصویر بنا رہا ہوں…' };
  for (const [lg, want, dir] of [['ar', 'جارٍ إنشاء الصورة', 'rtl'], ['en', 'Drawing an image…', 'auto'], ['fr', "Dessin d'une image…", 'auto'], ['ur', 'تصویر بنا رہا ہوں…', 'auto']]) {
    const env = makeEnv();
    env.sb.lang = lg;
    env.sb.t = (k) => (k === 'stGenImage' ? tr[lg] : k);
    const el = env.dom.document.createElement('div');
    env.sb.__omranImgDots(el, false);
    assert.ok(el.innerHTML.includes('aria-label="' + want + '"'), lg + ': aria-label');
    assert.ok(el.innerHTML.includes('<div class="omGenTxt" dir="' + dir + '">' + want + '</div>'), lg + ': العنوان');
    assert.equal(dotsIn(el), 149, lg);
  }
  const d = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-03-i18n-data.js'), 'utf8');
  assert.equal((d.match(/stGenImage:/g) || []).length, 2, 'المفتاح بالعربيّة والإنجليزيّة');
  for (const lg of ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml']) {
    assert.ok(fs.readFileSync(path.join(__dirname, '..', 'i18n', lg + '.js'), 'utf8').includes('"stGenImage"'), 'stGenImage في ' + lg);
  }
});
