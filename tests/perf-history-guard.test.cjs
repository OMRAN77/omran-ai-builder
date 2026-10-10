// tests/perf-history-guard.test.cjs — v-perf-history-guard (المالك ٢٩ سبتمبر: «الشاشة تتأخر وتعلّق»).
// renderHistory() في js/app-04-i18n-state.js كانت تبني <iframe> جديدة لكلّ محادثة محفوظة فيها كود،
// بلا حدّ أعلى، وتُعاد كاملةً بعد كلّ رسالة وكلّ نبضة مزامنة حيّة (٢٠ث) حتّى لو لم يتغيّر شيء.
// الإصلاح: بصمة تغيّر تتخطّى الرسم المطابق (بنمط v-render-guard القائم في renderMessages)،
// ونافذة عرض (٣٠ الأحدث، مع ضمان بقاء المحادثة المفتوحة ظاهرة دائمًا حتى لو كانت أقدم).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SRC = fs.readFileSync('js/app-04-i18n-state.js', 'utf8');
const FN_RE = /function renderHistory\(\)\{[\s\S]*?\n\}\n\n\/\/ v202:/;

function mockEl(){
  const node = { className: '', style: {}, dataset: {}, title: '', type: '', textContent: '', onclick: null, children: [], attrs: {} };
  node.appendChild = (c) => { node.children.push(c); return c; };
  node.setAttribute = (k, v) => { node.attrs[k] = v; };
  node.querySelector = (q) => node.children.find((c) => c.__tag === q) || null; // v-perf-hist-lazy
  Object.defineProperty(node, 'innerHTML', { get(){ return node.__html || ''; }, set(v){ node.__html = v; if(v === '') node.children = []; } });
  Object.defineProperty(node, 'childElementCount', { get(){ return node.children.length; } });
  return node;
}

function buildCtx({ projects, currentId, showAll }){
  const historyEl = mockEl();
  const ls = new Map([['aiapp_provider', 'openai'], ['aiapp_lang', 'ar']]);
  const state = { projects, currentId: currentId || null };
  const ctx = {
    historyEl,
    state,
    saveState(){},
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    document: { createElement: (tag) => { const e = mockEl(); e.__tag = tag; return e; } },
    window: {},
    openHistItemMenu(){}, renderAll(){}, mahaClearImageRef(){}, updateProviderQuickBarActive: undefined,
    __swallow(){},
    setTimeout(){}, // v-hist-autoload: بلا IntersectionObserver هنا يُؤجَّل الكشف — الاختبار يستدعيه يدويًّا
  };
  ctx.window.__histShowAll = !!showAll;
  vm.createContext(ctx);
  return ctx;
}

function extractFn(){
  const m = FN_RE.exec(SRC);
  assert.ok(m, 'renderHistory() لم تُستخرَج — راجع الرابط في الاختبار');
  // v-perf-hist-lazy: المعاينة الكسولة دالّة مساعدة قبلها — بلا IntersectionObserver هنا تُبنى فورًا كما كانت
  const i = SRC.indexOf('let __histThumbIO = null;'), j = SRC.indexOf('function renderHistory(){');
  assert.ok(i > 0 && j > i, 'المساعد قبل renderHistory');
  return SRC.slice(i, j) + m[0].replace(/\n\/\/ v202:$/, '');
}

function proj(n, opts){
  return Object.assign({ id: 'p_' + String(1700000000 + n).padStart(13, '0'), title: 'محادثة ' + n, provider: 'openai' }, opts);
}

test('١. بصمة التغيّر: رسم ثانٍ مطابق لا يمسح القائمة ولا يعيد بناءها', () => {
  const ctx = buildCtx({ projects: [proj(1), proj(2)], currentId: 'p_' + String(1700000002).padStart(13, '0') });
  vm.runInContext(extractFn() + '\nrenderHistory();', ctx);
  const firstChildren = ctx.historyEl.children;
  assert.equal(firstChildren.length, 2, 'محادثتان تُرسمان');
  vm.runInContext('renderHistory();', ctx);
  assert.equal(ctx.historyEl.children, firstChildren, 'نفس المصفوفة — لم تُمسح القائمة (innerHTML="" لم يُستدعَ)');
});

test('٢. تغيّر فعليّ (عنوان محادثة) يبطل البصمة ويعيد الرسم', () => {
  const projects = [proj(1), proj(2)];
  const ctx = buildCtx({ projects });
  vm.runInContext(extractFn() + '\nrenderHistory();', ctx);
  const before = ctx.historyEl.children;
  projects[0].title = 'اسم جديد';
  vm.runInContext('renderHistory();', ctx);
  assert.notEqual(ctx.historyEl.children, before, 'مصفوفة جديدة — أُعيد الرسم فعلًا');
  assert.equal(ctx.historyEl.children.length, 2);
});

test('٣. نافذة العرض: ٣٥ محادثة → ٣٠ فقط + علامة آخر القائمة (بلا زرّ) تكشف الباقي — v-hist-autoload', () => {
  const projects = Array.from({ length: 35 }, (_, i) => proj(i));
  const ctx = buildCtx({ projects });
  vm.runInContext(extractFn() + '\nrenderHistory();', ctx);
  const rows = ctx.historyEl.children.filter((c) => c.dataset && c.dataset.pid);
  assert.equal(rows.length, 30, 'الأحدث ٣٠ فقط تُبنى (لا ٣٥ iframe/صفّ)');
  assert.ok(!ctx.historyEl.children.some((c) => /عرض محادثات أقدم/.test(c.textContent)), 'لا زرّ «عرض محادثات أقدم» (طلب المالك)');
  const sentinel = ctx.historyEl.children.at(-1);
  assert.equal(sentinel.className, 'hist-more-sentinel', 'علامة غير مرئيّة في آخر القائمة');
  assert.equal(sentinel.textContent, '');
  sentinel.__reveal(); // ما يفعله IntersectionObserver حين يصل التمرير آخر القائمة
  assert.equal(ctx.window.__histShowAll, true, 'الوصول للآخر يكشف الكلّ');
  const rows2 = ctx.historyEl.children.filter((c) => c.dataset && c.dataset.pid);
  assert.equal(rows2.length, 35, 'بعد الوصول: كلّ المحادثات الـ٣٥');
  assert.ok(!ctx.historyEl.children.some((c) => c.className === 'hist-more-sentinel'), 'لا علامة بعد كشف الكلّ');
});

test('٤. محادثة مفتوحة أقدم من النافذة تبقى ظاهرة رغم ذلك (لا تختفي عن قائمتها)', () => {
  const projects = Array.from({ length: 40 }, (_, i) => proj(i));
  const oldestId = projects[39].id; // الأقدم زمنيًّا (الفهرس الأصغر p_...+n) — سيكون آخر الترتيب التنازليّ
  const ctx = buildCtx({ projects, currentId: oldestId });
  vm.runInContext(extractFn() + '\nrenderHistory();', ctx);
  const rows = ctx.historyEl.children.filter((c) => c.dataset && c.dataset.pid);
  assert.ok(rows.some((c) => c.dataset.pid === oldestId), 'المحادثة المفتوحة ظاهرة رغم كونها أقدم من نافذة الـ٣٠');
  assert.ok(rows.find((c) => c.dataset.pid === oldestId).className.includes('active'), 'ومُعلَّمة نشطة');
});

test('٥. لا حدّ أعلى قديم: بلا الإصلاح كانت ٣٥ محادثة تبني ٣٥ صفًّا/iframe في كلّ نداء — الاختبار ٣ يفشل على الكود السابق', () => {
  // توثيقيّ: يثبت أنّ الثابت الجديد موجود فعلًا في المصدر (لا الحزمة القديمة المرقَّعة).
  assert.match(SRC, /const __HIST_WINDOW = 30;/);
  assert.match(SRC, /window\.__renderHistSig/);
});
