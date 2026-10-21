'use strict';
/* v-edu-hub-polish — تدقيق ١٨–١٩ أكتوبر، قسم التعليم:
   الصانع القديم يعرض أسماء أصوات المزوّد (Onyx/Nova/Alloy)، وعنوانه «التعليم» مكرّر، وEsc لا يعمل بعد الكتابة داخل إطاره،
   والمركز يُغلق قبل فتحه فيرجعك Esc إلى الأدوات؛ شارة السلسلة رقم وحده، وسهم الرجوع يشير يسارًا في العربيّ، والحقل الناقص
   لا يتلوّن، وملخّص الدرس العربيّ LTR في الإنجليزيّ و«---» نصّ، وبطاقات المراجعة 8/9، وشرح الاختبار مقلوب و«Basiclevel»
   و«·3/1»، وزرّ «محادثة جديدة» لا يظهر بعد أوّل سؤال، ولوحة الألعاب بالإنجليزيّ، وتواريخ خطّة الامتحان ناقصة يومًا.
   هنا تُشغَّل الدوالّ الحقيقيّة من الملفّات في vm بأسطح وهميّة صغيرة، لا وجود نصّها فقط. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const R = (p) => path.join(__dirname, '..', p);
const read = (p) => fs.readFileSync(R(p), 'utf8');
const edu = read('js/edu.js'), old = read('edu-old/index.html'), app10 = read('js/app-10-features.js');
const modulesCss = read('css/modules.css'), noLines = read('css/بلا-خطوط.css'), clean36 = read('js/app-36-clean-ui.js');
const plus = read('js/edu-plus.js'), algo = read('js/edu-algo.js');

function blockAt(src, i) {
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('لم يُغلق');
}
function extract(src, head) { const i = src.indexOf(head); assert.ok(i >= 0, 'موجود: ' + head); return blockAt(src, i); }
/* تنظيف الإيموجي الحقيقيّ من app-36 (كما في clean-ui.test) */
const emoSrc = clean36.match(/new RegExp\('((?:[^'\\]|\\.)*)', 'gu'\)/);
const EMO = new RegExp(emoSrc[1].replace(/\\\\/g, '\\'), 'gu');
const clean = (s) => String(s).replace(EMO, '').replace(/[ \t]{2,}/g, ' ').trim();

/* ── عنصر وهميّ: عناصر تُعرف بمعرّفاتها حين تظهر في innerHTML مرسوم ── */
function fakeDom() {
  const els = {}, holders = [];
  function el(id) {
    if (!els[id]) els[id] = { id, style: {}, attrs: {}, classList: { add() {}, toggle() {}, remove() {} }, value: '', disabled: false,
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
      addEventListener() {}, insertAdjacentHTML(_, h) { this.innerHTML = (this.innerHTML || '') + h; }, scrollTop: 0, scrollHeight: 0, textContent: '', innerHTML: '' };
    return els[id];
  }
  function holder() {
    const h = { _html: '', opts: [], style: {}, children: [], appendChild(c) { this.children.push(c); }, insertBefore(c) { this.children.unshift(c); }, firstChild: null,
      querySelectorAll(sel) { return sel === '.eduQOpt' ? this.opts : (sel === '[data-chip]' ? this.chips : []); } };
    Object.defineProperty(h, 'innerHTML', { get() { return this._html; }, set(v) {
      this._html = String(v); this.children = [];
      this.opts = []; const re = /class="eduQOpt" data-idx="(\d+)"/g; let m;
      while ((m = re.exec(this._html))) { const idx = m[1]; this.opts.push({ classList: { add() {} }, style: {}, getAttribute: () => idx }); }
      this.chips = []; const rc = /data-chip="(\d+)"/g; while ((m = rc.exec(this._html))) { const ci = m[1]; this.chips.push({ getAttribute: () => ci }); }
    } });
    holders.push(h); return h;
  }
  const document = {
    getElementById(id) {
      const seen = holders.some((h) => h._html.includes('id="' + id + '"')) || Object.values(els).some((e) => String(e.innerHTML).includes('id="' + id + '"'));
      return seen ? el(id) : null;
    },
    createElement() { return el('__new' + Math.random()); },
  };
  return { document, el, holder, els };
}

/* ═════════════ الصانع القديم ═════════════ */
test('١. الصانع القديم: لا أسماء أصوات المزوّد في الـ١٤ قاموسًا ولا في الخيارات الافتراضيّة، والقيم باقية', () => {
  assert.ok(!/\((?:Onyx|Nova|Alloy)\)/.test(old), 'لا «(Onyx)» ولا «(Nova)» ولا «(Alloy)»');
  ['onyx', 'nova', 'alloy'].forEach((v) => assert.ok(old.includes('value="' + v + '"'), 'القيمة باقية: ' + v));
  assert.equal((old.match(/voiceMale:'[^']+'/g) || []).length, 14, 'الأصوات في الـ١٤ لغة');
  assert.match(old, /voiceMale:'ذكر', voiceFemale:'أنثى', voiceNeutral:'محايد'/);
});

test('٢. Esc داخل إطار الصانع القديم يبلّغ التطبيق ليغلقه (السحب كان وحده يصل)', () => {
  const scripts = old.match(/<script>([\s\S]*?)<\/script>/g).map((s) => s.replace(/^<script>|<\/script>$/g, ''));
  const sw = scripts.find((s) => s.includes('omranSwipeBack'));
  assert.ok(sw, 'كتلة السحب موجودة');
  const L = {}, posted = [];
  const ctx = { document: { addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, body: { style: {} }, activeElement: null },
    window: { parent: { postMessage(m, o) { posted.push([m, o]); } }, innerWidth: 360 }, getComputedStyle: () => ({}), setTimeout, Date };
  vm.runInNewContext(sw, ctx);
  assert.ok(L.keydown && L.keydown.length, 'مستمع keydown');
  L.keydown.forEach((f) => f({ key: 'a', defaultPrevented: false }));
  assert.equal(posted.length, 0, 'حرف عاديّ لا يغلق');
  L.keydown.forEach((f) => f({ key: 'Escape', defaultPrevented: false }));
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [[{ omranSwipeBack: 1 }, '*']]);
});

test('٣. عنوان نافذة الصانع القديم = اسم صفّه المترجم في المركز (لا «التعليم» مكرّرًا)، ولا تكتبه الترجمة فوقه', () => {
  const i = app10.indexOf('/* ---------- 🎓 Omran Edu (educational video builder');
  assert.ok(i >= 0);
  const iife = blockAt(app10, app10.indexOf('(function(){', i)) + ')();';
  function run(withRow) {
    const h3 = { textContent: '🎓 التعليم', attrs: { 'data-i18n': 'omranEduModalTitle' }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; } };
    const modal = { style: {}, addEventListener() {}, querySelector: (s) => (s === 'h3' ? h3 : null) };
    const frame = { src: 'about:blank' };
    const map = { '#btnOmranEdu': { addEventListener() {} }, '#omranEduModal': modal, '#omranEduFrame': frame, '#omranEduCloseBtn': { addEventListener() {} }, '#headerMenuDropdown': null };
    const row = { textContent: '🎬 صانع الفيديو والشرائح التعليميّة' };
    const window = { innerWidth: 1280 };
    vm.runInNewContext(iife, { $: (s) => map[s], window, document: { querySelector: (s) => (withRow && s === '#eduOldEduRow .eduLessonTitle' ? row : null) } });
    window.openOmranEduModal();
    return { h3, modal, frame };
  }
  const a = run(true);
  assert.equal(a.h3.textContent, '🎬 صانع الفيديو والشرائح التعليميّة');
  assert.equal(a.h3.attrs['data-i18n'], undefined, 'applyLanguage لا يعيده «التعليم»');
  assert.equal(a.modal.style.display, 'flex');
  assert.match(a.frame.src, /^\/edu-old\/index\.html\?v=/);
  const b = run(false);
  assert.equal(b.h3.textContent, '🎓 التعليم', 'بلا صفّ (فتح مباشر) يبقى كما هو');
});

test('٤. صفّ الصانع القديم يفتحه فوق المركز (لا يغلق المركز)، فـEsc والسحب والرجوع تغلقه وحده', () => {
  const m = edu.match(/if\(oldRow\) oldRow\.onclick=function\(\)\{[^\n]*\};/);
  assert.ok(m, 'معالج الصفّ');
  assert.ok(!m[0].includes('closeModal()'), 'لا يغلق المركز');
  const hubZ = +modulesCss.match(/#eduHubModal\{[^}]*z-index:(\d+)/)[1];
  const oldModal = { style: {} }; let closed = 0, opened = 0;
  const ctx = { oldRow: {}, closeModal() { closed++; }, document: { getElementById: (id) => (id === 'omranEduModal' ? oldModal : null) }, window: { openOmranEduModal() { opened++; } } };
  vm.runInNewContext(m[0], ctx);
  ctx.oldRow.onclick();
  assert.equal(closed, 0); assert.equal(opened, 1);
  assert.ok(+oldModal.style.zIndex > hubZ, 'فوق المركز: ' + oldModal.style.zIndex + ' > ' + hubZ);
  /* topTool في app-05 يختار الأعلى طبقة — فالصانع القديم أوّلًا */
  assert.match(read('js/app-05-swipe-back.js'), /if\(z > bz \|\| \(z === bz && later\)\)/);
});

/* ═════════════ المركز ═════════════ */
function streakCtx(langCode, st) {
  const chunk = edu.slice(edu.indexOf("var LS_GUEST="), edu.indexOf('/* ---------- data layer'));
  const badge = { style: {}, attrs: {}, textContent: '', title: '', setAttribute(k, v) { this.attrs[k] = v; } };
  const store = { aiapp_lang: langCode, eduHubStreak: JSON.stringify(st) };
  const ctx = { lang: langCode, window: {}, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem(k, v) { store[k] = v; } }, sessionStorage: { getItem: () => null },
    document: { getElementById: (id) => (id === 'eduStreakBadge' ? badge : null) }, __swallow() {} };
  vm.runInNewContext(chunk + ';this.renderStreak=renderStreak;', ctx);
  ctx.renderStreak();
  return badge;
}
test('٥. شارة السلسلة: الرقم مع كلمته بعد نزع الإيموجي، وعنوان ووصف للقارئ', () => {
  const today = new Date().toISOString().slice(0, 10);
  const ar3 = streakCtx('ar', { streak: 3, lastActive: today });
  assert.equal(clean(ar3.textContent), '3 أيام', 'كان «3» وحده بعد نزع 🔥');
  assert.ok(ar3.attrs['aria-label'] && /\p{L}/u.test(ar3.attrs['aria-label']));
  assert.equal(ar3.title, ar3.attrs['aria-label']);
  assert.equal(clean(streakCtx('ar', { streak: 1, lastActive: today }).textContent), '1 يوم');
  assert.equal(clean(streakCtx('ar', { streak: 12, lastActive: today }).textContent), '12 يوم');
  const en = streakCtx('en', { streak: 3, lastActive: today });
  assert.equal(clean(en.textContent), '3 day(s)');
  assert.equal(en.attrs['aria-label'], 'day streak');
  assert.equal(streakCtx('ar', { streak: 0, lastActive: today }).style.display, 'none');
});

test('٦. سهم الرجوع في رأس التعليم ينعكس في العربيّ (كسهم الصفّ في الملفّ نفسه)', () => {
  assert.match(modulesCss, /#eduHubModal\[dir="rtl"\]\s+#eduBackBtn\s+svg\s*\{\s*transform:\s*scaleX\(-1\);?\s*\}/);
  assert.ok(edu.includes("modal.setAttribute('dir',isRTL()?'rtl':'ltr')"), 'المركز يأخذ اتّجاه اللغة');
});

/* أولويّة المحدِّد (معرّفات، أصناف/سمات/أشباه، عناصر) — :not/:is بأعلى معاملاتها */
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
function spec(sel) {
  const v = [0, 0, 0];
  let s = sel.replace(/:(not|is|where)\(((?:[^()]|\([^()]*\))*)\)/g, (m0, fn, args) => {
    if (fn !== 'where') { const best = splitTop(args).map(spec).sort(cmp).pop(); v[0] += best[0]; v[1] += best[1]; v[2] += best[2]; }
    return ' ';
  });
  s = s.replace(/\[[^\]]*\]/g, () => { v[1]++; return ' '; });
  s = s.replace(/#[\w-]+/g, () => { v[0]++; return ' '; });
  s = s.replace(/\.[\w-]+/g, () => { v[1]++; return ' '; });
  s = s.replace(/::[\w-]+/g, () => { v[2]++; return ' '; });
  s = s.replace(/:[\w-]+/g, () => { v[1]++; return ' '; });
  (s.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).forEach(() => { v[2]++; });
  return v;
}
function rules(css) {
  const out = []; css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^{}]*)\}/g, (m0, sel, body) => { out.push({ sels: splitTop(sel.trim()), body }); return ''; });
  return out;
}
test('٧. الحقل الناقص في نموذج الرفع يتلوّن بالأحمر رغم الحدّ الشبح (v-no-lines-2)', () => {
  let st = null;
  vm.runInNewContext(extract(edu, 'function eduUpCss()') + ';eduUpCss();', { document: { getElementById: () => null, createElement: () => ({}), head: { appendChild(x) { st = x; } } } });
  assert.ok(st && st.textContent);
  const ghost = rules(noLines).filter((r) => /border-color:rgba\(0,0,0,\.06\) !important/.test(r.body)).flatMap((r) => r.sels).filter((s) => /\.om3-line/.test(s));
  assert.ok(ghost.length >= 2, 'قواعد الحدّ الشبح');
  const ghostMax = ghost.map(spec).sort(cmp).pop();
  ['eduUpFld', 'eduUpDrop'].forEach((cls) => {
    const red = rules(st.textContent).filter((r) => /border-color:#f87171\s*!important/.test(r.body)).flatMap((r) => r.sels).filter((s) => s.includes('.' + cls + '.bad'));
    assert.ok(red.length, cls + ': قاعدة حمراء بـ!important');
    const best = red.map(spec).sort(cmp).pop();
    assert.ok(cmp(best, ghostMax) > 0, cls + ': ' + best + ' تغلب ' + ghostMax);
  });
});

/* ═════════════ الدرس ═════════════ */
const mdCtx = {};
vm.runInNewContext(extract(edu, 'function esc(s)') + '\n' + edu.slice(edu.indexOf('var MATH_SYM='), edu.indexOf('function mathHtml(')) + extract(edu, 'function mathHtml(src)') + '\n' + extract(edu, 'function md(src)') + ';this.md=md;', mdCtx);
const md = mdCtx.md;
test('٨. الملخّص: كلّ كتلة باتّجاه نصّها (العربيّ يمين في الواجهة الإنجليزيّة)، والكود يبقى LTR', () => {
  assert.ok(md('**التمثيل الضوئي** عملية.').includes('<p dir="auto"><b>التمثيل الضوئي</b> عملية.</p>'));
  const l = md('- أ\n- ب\n1. ج');
  assert.ok(l.includes('<ul dir="auto"><li>أ</li><li>ب</li></ul>') && l.includes('<ol dir="auto"><li>ج</li></ol>'), l);
  /* dir="auto" يتخطّى الأبناء ذوي dir: لو حمل كلّ li dir لصارت القائمة LTR والنقاط خارج العمود (رأيناه في لقطة) */
  assert.ok(!/<li dir=/.test(l), 'العناصر بلا dir فتأخذ اتّجاه قائمتها');
  assert.ok(md('## عنوان').includes('<h4 dir="auto">عنوان</h4>'));
  assert.ok(md('> ملاحظة').includes('<blockquote dir="auto">ملاحظة</blockquote>'));
  assert.ok(md('```js\nx=1\n```').includes('<pre class="eduCode" dir="ltr">'));
  assert.ok(md('a `x` b').includes('<code dir="ltr">x</code>'));
});
test('٩. «---» في الملخّص وردّ المعلّم فراغ لا نصّ ولا خطّ (v-no-lines)', () => {
  ['---', '***', '___', '-----'].forEach((hr) => {
    const out = md('أ\n' + hr + '\nب');
    assert.ok(!out.includes(hr) && !/<hr/i.test(out), hr + ' ← ' + out);
    assert.ok(out.includes('<p dir="auto">أ</p>') && out.includes('<p dir="auto">ب</p>') && out.includes('eduGap'), out);
  });
  assert.ok(md('- عنصر').includes('<li>عنصر</li>'), 'القائمة بشرطة واحدة باقية');
});

test('١٠. بطاقات المراجعة: «أراجعه» لا تغيّر الدرس ولا الإجماليّ (كان 8/9 والدرس ٨)', () => {
  const D = fakeDom(), pane = D.holder();
  const saved = [];
  const ctx = { document: D.document, T: (k) => k, esc: (s) => String(s), saveProgress: (id, f) => saved.push(f), eduRegenQuestions() { throw new Error('لا'); }, window: {}, __swallow() {} };
  vm.runInNewContext(extract(edu, 'function renderCards(pane,lesson)') + ';this.renderCards=renderCards;', ctx);
  const cards = []; for (let i = 1; i <= 8; i++) cards.push({ q: 'q' + i, a: 'a' + i });
  const lesson = { id: 'L', flashcards: cards };
  ctx.renderCards(pane, lesson);
  D.el('eduRev').onclick();
  for (let k = 0; k < 20 && !pane.innerHTML.includes('eduScoreBig'); k++) D.el('eduKnow').onclick();
  assert.equal(lesson.flashcards.length, 8, 'الدرس نفسه لم يتغيّر');
  assert.ok(pane.innerHTML.includes('>8/8<'), pane.innerHTML);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.pop())), { cardsKnown: 8 });
  D.el('eduCardsAgain').onclick();
  assert.ok(pane.innerHTML.includes('>1 / 8<'), 'الإعادة من البطاقات الثماني: ' + pane.innerHTML.slice(0, 120));
});

function quizCtx(langEn) {
  const D = fakeDom(), pane = D.holder();
  const ctx = { document: D.document, T: (k) => k, esc: (s) => String(s), eduL: (ar, en) => (langEn ? en : ar), saveProgress() {}, eduRegenQuestions() {}, api: () => new Promise(() => {}), prompt: () => null, window: {}, __swallow() {} };
  vm.runInNewContext(extract(edu, 'function renderQuiz(pane,lesson)') + '\n' + extract(edu, 'function renderWritten(pane,lesson,written)') + ';this.renderQuiz=renderQuiz;', ctx);
  const lesson = { id: 'L', quiz: [{ q: 'أين؟', options: ['أ', 'ب', 'ج', 'د'], correct: 1, level: 'basic', explain: 'في البلاستيدات.', section: 'التمثيل الضوئي' }],
    written: [{ q: 'س١' }, { q: 'س٢' }, { q: 'س٣' }] };
  ctx.renderQuiz(pane, lesson);
  return { D, pane };
}
test('١١. شرح الاختبار: كلّ سطر باتّجاه نصّه، والقسم معزول، و«Review: » بمسافتها', () => {
  const { D, pane } = quizCtx(true);
  pane.opts[0].onclick();
  const ex = D.el('eduExpl').innerHTML;
  assert.equal((ex.match(/<div dir="auto">/g) || []).length, 2, ex);
  assert.ok(ex.includes('Review: <b><bdi>التمثيل الضوئي</bdi></b>'), ex);
  assert.ok(!ex.includes('<br>'), 'سطران مستقلّان لا <br>');
});
test('١٢. نتيجة الاختبار «Basic level.» بمسافة، والعربيّ كما هو', () => {
  const en = quizCtx(true); en.pane.opts[0].onclick(); en.D.el('eduNextQ').onclick();
  assert.match(en.pane.innerHTML, /<b>Basic<\/b> level\./);
  const ar = quizCtx(false); ar.pane.opts[0].onclick(); ar.D.el('eduNextQ').onclick();
  assert.match(ar.pane.innerHTML, /<b>أساسي<\/b>\./);
});
test('١٣. عدّاد الأسئلة المقاليّة رقمان فقط (كان «· ✍️» فتبقى نقطة يتيمة بعد نزع الإيموجي)', () => {
  const { D, pane } = quizCtx(false); pane.opts[0].onclick(); D.el('eduNextQ').onclick(); D.el('eduWritten').onclick();
  const m = pane.innerHTML.match(/^<div style="[^"]*">([^<]*)<\/div>/);
  assert.ok(m, pane.innerHTML.slice(0, 160));
  assert.equal(clean(m[1]), '1 / 3');
  assert.equal(m[1], '1 / 3');
});

/* ═════════════ الإضافات ═════════════ */
function plusWindow(extra) {
  const window = {};
  const D = extra && extra.D;
  const ctx = Object.assign({ window, localStorage: { getItem: () => null, setItem() {} }, document: D ? Object.assign({ head: { appendChild() {} }, createElement: () => ({}) }, D.document) : { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}) },
    Math, Date, JSON, Object, Array, String, Number, isNaN, Infinity, __swallow() {} }, extra && extra.ctx);
  vm.runInNewContext(plus, ctx);
  return window;
}
test('١٤. المعلّم: زرّ «محادثة جديدة» يظهر بعد أوّل سؤال بلا رجوع للتبويب، ويختفي بعد المسح', async () => {
  const D = fakeDom(), pane = D.holder();
  const w = plusWindow({ D });
  let resolveApi;
  w.__eduCore = { eduL: (a) => a, md: (s) => s, appLang: () => 'ar', nativeLang: () => 'ar', api: () => new Promise((r) => { resolveApi = r; }) };
  w.__eduPlus.tutor(pane, { id: 'T1', title: 't', summary: 's' });
  assert.ok(pane.innerHTML.includes('id="eduTutorClear"'), 'الزرّ موجود دائمًا');
  const clr = D.el('eduTutorClear');
  assert.equal(clr.style.display, 'none', 'مخفيّ والمحادثة فارغة');
  D.el('eduTutorIn').value = 'سؤال';
  D.el('eduTutorSend').onclick();
  resolveApi({ reply: 'جواب' });
  await new Promise((r) => setImmediate(r));
  assert.notEqual(clr.style.display, 'none', 'ظهر بعد الردّ');
  clr.onclick();
  assert.equal(D.el('eduTutorClear').style.display, 'none');
});

const LANGS11 = ['fr', 'hi', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];
test('١٥. لوحة ألعاب الخوارزميّات: لا نصّ إنجليزيّ خارج L()، وكلّ مفتاح مترجم للّغات الـ١١ الأخرى', () => {
  const Lcall = /\bL\('((?:[^'\\]|\\.)*)',\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\)/g;
  const stripped = algo.replace(/\/\*[\s\S]*?\*\//g, '').replace(Lcall, 'L()');
  ['px above ground', 'no path!', "' steps'", 'positions evaluated for the last move', 'waiting for your move', 'same seed → same numbers → same map', "'frame #", "'swap ", 'distance = ', ' win · ', ' draw · ', " loss'"].forEach((p) => {
    assert.ok(!stripped.includes(p), 'خارج L(): ' + p);
  });
  const XL2 = plusWindow().__EDU_XL2;
  const s = edu.indexOf('var EDU_XL = {'), e = edu.indexOf('\n};', s);
  const XL = vm.runInNewContext('(' + edu.slice(s + 12, e + 2) + ')');
  let m, n = 0; const miss = [];
  while ((m = Lcall.exec(algo))) { n++; const k = m[1].replace(/\\'/g, "'"); const t = XL2[k] || XL[k]; const lack = LANGS11.filter((l) => !(t && t[l])); if (lack.length) miss.push(k + ' ← ' + lack.join(',')); }
  assert.ok(n > 54, 'نصوص اللوحة صارت داخل L(): ' + n);
  assert.deepEqual(miss, []);
  /* العربيّ داخل اللوحة LTR معزول (FSI…PDI) */
  assert.match(algo, /function fsi\(s\)\{ return '\\u2068' \+ s \+ '\\u2069'; \}/);
});

test('١٦. خطّة الامتحان بتاريخ الجهاز المحلّيّ (الإمارات +4: كانت تبدأ أمس)', () => {
  const code = `
    const fs=require('fs'),vm=require('vm');const w={};
    vm.runInNewContext(fs.readFileSync(${JSON.stringify(R('js/edu-plus.js'))},'utf8'),{window:w,localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:()=>null,head:{appendChild(){}},createElement:()=>({})},Math,Date,JSON,Object,Array,String,Number,isNaN,Infinity,__swallow(){}});
    const p=w.__eduPlus.lib.buildExamPlan([{id:'a'},{id:'b'}],new Date('2026-10-22T00:00:00').getTime(),new Date('2026-10-19T02:11:00').getTime());
    process.stdout.write(JSON.stringify(p.map(d=>d.date)));`;
  ['Asia/Dubai', 'UTC', 'America/New_York'].forEach((tz) => {
    const out = execFileSync(process.execPath, ['-e', code], { env: Object.assign({}, process.env, { TZ: tz }) }).toString();
    assert.deepEqual(JSON.parse(out), ['2026-10-19', '2026-10-20', '2026-10-21'], tz);
  });
  /* «اليوم» وحدّ التاريخ الأدنى بالمحلّيّ أيضًا */
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(plus), 'لا تاريخ UTC في edu-plus');
});
