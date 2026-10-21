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
/* ═════════════ الإضافات ═════════════ */
function plusWindow(extra) {
  const window = {};
  const D = extra && extra.D;
  const ctx = Object.assign({ window, localStorage: { getItem: () => null, setItem() {} }, document: D ? Object.assign({ head: { appendChild() {} }, createElement: () => ({}) }, D.document) : { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}) },
    Math, Date, JSON, Object, Array, String, Number, isNaN, Infinity, __swallow() {} }, extra && extra.ctx);
  vm.runInNewContext(plus, ctx);
  return window;
}
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

