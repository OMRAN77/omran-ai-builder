// tests/hist-search-empty.test.cjs — v-hist-search-empty (تدقيق ١٨ أكتوبر: g02 sidebar-search).
// ١) بحث بلا نتائج كان يعرض قائمة فارغة بلا كلمة: filterProjects يخفي الصفوف ولا يعدّ الظاهر. صار يُظهر سطرًا
//    واحدًا #histSearchEmpty بنصّ projSearchEmpty (١٤ لغة) ويخفيه مع التطابق أو البحث الفارغ.
// ٢) renderHistory يعيد بناء الصفوف ظاهرة فيضيع الفلتر (نبضة المزامنة، أو علامة «الأقدم» حين تختفي كلّ صفوف النافذة).
//    صار يُعاد الفلتر في آخره عبر window.__histReFilter.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const A05 = read('js/app-05-ui.js');
const A04 = read('js/app-04-i18n-state.js');
const LANGS = ['fr', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'es', 'ml'];

function sliceBlock(src, start) {
  assert.ok(start >= 0, 'التوقيع موجود');
  let depth = 0, q = null;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('كتلة غير متوازنة');
}

function el(id, extra) {
  const e = Object.assign({ id: id || '', style: {}, dataset: {}, children: [], className: '', textContent: '', value: '', listeners: {} }, extra || {});
  e.addEventListener = (k, f) => { (e.listeners[k] = e.listeners[k] || []).push(f); };
  e.focus = () => {};
  return e;
}
function row(pid, title) {
  const r = el('', { className: 'hist-item' });
  r.dataset.pid = pid;
  r.querySelector = (q) => (q === '.hist-title' ? { textContent: title } : null);
  return r;
}

function setup() {
  const sidebar = el('sidebar');
  const history = el('history');
  history.parentNode = sidebar;
  const byId = {};
  ['btnProjMenuToggle', 'projMenuPanel', 'projMenuChevron', 'btnProjSearch', 'projSearchInput', 'btnNew', 'btnDeleteAll'].forEach((id) => { byId[id] = el(id); });
  byId.history = history;
  sidebar.insertBefore = (node, ref) => { assert.equal(ref, history, 'السطر يُدرج قبل القائمة مباشرة'); node.parentNode = sidebar; byId[node.id] = node; return node; };
  let lang = 'ar';
  const ctx = {
    state: { projects: [
      { id: 'p1', title: 'وصفة كبسة', messages: [{ role: 'user', content: 'كيف أطبخ كبسة' }] },
      { id: 'p2', title: 'خطة سفر', messages: [{ role: 'user', content: 'سفر إلى صلالة' }] },
    ] },
    t: (k) => lang + ':' + k,
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: () => el(''),
      querySelectorAll: (sel) => (sel === '#history .hist-item' ? history.children.filter((c) => c.className === 'hist-item') : []),
      querySelector: (sel) => (sel === '#history .hist-more-sentinel' ? history.children.find((c) => c.className === 'hist-more-sentinel') || null : null),
    },
    window: {},
    __swallow() {},
    Set, Array, String,
  };
  ctx.setLang = (l) => { lang = l; };
  vm.createContext(ctx);
  const start = A05.indexOf('(function(){', A05.indexOf('v214: قائمة المشاريع المطوية'));
  vm.runInContext(sliceBlock(A05, start) + ')();', ctx);
  const input = byId.projSearchInput;
  return {
    ctx, history, byId,
    rows(list) { history.children = list.map(([pid, t]) => row(pid, t)); },
    type(v) { input.value = v; (input.listeners.input || []).forEach((f) => f()); },
    shown() { return history.children.filter((c) => c.className === 'hist-item' && c.style.display !== 'none').length; },
    empty() { return byId.histSearchEmpty || null; },
  };
}

test('١. بحث بلا نتائج يُظهر سطر «لا توجد محادثات» المترجم، والتطابق أو البحث الفارغ يخفيه', () => {
  const s = setup();
  s.rows([['p1', 'وصفة كبسة'], ['p2', 'خطة سفر']]);
  s.type('zzqqxx');
  assert.equal(s.shown(), 0);
  const em = s.empty();
  assert.ok(em, '#histSearchEmpty أُنشئ');
  assert.equal(em.textContent, 'ar:projSearchEmpty');
  assert.notEqual(em.style.display, 'none', 'ظاهر');
  s.type('صلالة');
  assert.equal(s.shown(), 1, 'البحث في المحتوى كما كان');
  assert.equal(s.empty().style.display, 'none', 'مع تطابق يُخفى');
  s.type('zz');
  assert.notEqual(s.empty().style.display, 'none');
  s.type('');
  assert.equal(s.shown(), 2);
  assert.equal(s.empty().style.display, 'none', 'بحث فارغ: يُخفى');
});

test('٢. إعادة رسم القائمة لا تُضيّع الفلتر: __histReFilter يعيده على الصفوف الجديدة، وrenderHistory يناديه', () => {
  const s = setup();
  s.rows([['p1', 'وصفة كبسة'], ['p2', 'خطة سفر']]);
  s.type('كبسة');
  assert.equal(s.shown(), 1);
  s.rows([['p1', 'وصفة كبسة'], ['p2', 'خطة سفر'], ['p3', 'جديد']]); // renderHistory: صفوف جديدة ظاهرة
  assert.equal(s.shown(), 3);
  assert.equal(typeof s.ctx.window.__histReFilter, 'function', 'مُعرَّف للقائمة');
  s.ctx.window.__histReFilter();
  assert.equal(s.shown(), 1, 'الفلتر رجع');
  const rh = sliceBlock(A04, A04.indexOf('function renderHistory(){'));
  assert.match(rh, /window\.__histReFilter\(\)/, 'renderHistory ينادي __histReFilter بعد البناء');
  assert.ok(rh.lastIndexOf('__histReFilter') > rh.indexOf('historyEl.appendChild(div)'), 'بعد بناء الصفوف');
});

test('٣. الأقدم لم تُرسم بعد (علامة النافذة موجودة): لا رسالة فراغ قبل أوانها', () => {
  const s = setup();
  s.rows([['p1', 'وصفة كبسة']]);
  const sentinel = el('', { className: 'hist-more-sentinel' });
  s.history.children.push(sentinel);
  s.type('zzqqxx');
  assert.ok(!s.empty() || s.empty().style.display === 'none', 'العلامة ستكشف الأقدم ثمّ يُعاد الفلتر');
  s.history.children = s.history.children.filter((c) => c !== sentinel);
  s.ctx.window.__histReFilter();
  assert.notEqual(s.empty().style.display, 'none', 'بعد كشف الكلّ بلا تطابق: تظهر');
});

test('٤. تبديل اللغة يحدّث نصّ السطر', () => {
  const s = setup();
  s.rows([['p1', 'وصفة كبسة']]);
  s.type('zzqqxx');
  s.ctx.setLang('en');
  s.ctx.window.__refreshProjMenuLabels();
  assert.equal(s.empty().textContent, 'en:projSearchEmpty');
});

test('٥. projSearchEmpty بالـ١٤ لغة، مترجم، وبلا أسماء مزوّدين', () => {
  const ctx = { $: () => null, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const a3 = read('js/app-03-i18n-data.js').replace(/^const (codeEl|previewFrame|emptyState|historyEl) = .*$/mg, '');
  vm.runInContext(a3 + '\n;this.I18N = I18N;', ctx);
  for (const l of LANGS) vm.runInContext(read('i18n/' + l + '.js'), ctx);
  const I = ctx.I18N;
  const PROV = /Claude|Gemini|GPT|OpenAI|Groq|Grok|Anthropic|Perplexity|Mistral|DeepSeek|Kimi|كلود|جيمناي|غروق/i;
  const en = String(I.en.projSearchEmpty || '');
  assert.ok(en.trim(), 'en');
  for (const l of ['ar', 'en'].concat(LANGS)) {
    const v = String((I[l] || {}).projSearchEmpty || '');
    assert.ok(v.trim(), l + ': موجود في قاموسه نفسه');
    assert.ok(!PROV.test(v), l + ': بلا اسم مزوّد');
    if (l !== 'en') assert.notEqual(v, en, l + ': مترجم لا إنجليزيّ');
  }
});
