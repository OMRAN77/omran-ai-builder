// tests/stats-visible-projects.test.cjs — v-stats-visible (تدقيق ١٨ أكتوبر: g02 new-chat، g12 stats-section).
// ١) «عدد المشاريع» كان يعدّ المصفوفة الخامّ، ومنها المحادثات الفارغة التي يخفيها v-hide-empty-proj من القائمة
//    (١٠ مقابل ٧ ظاهرة). صار يعدّ بشرط القائمة نفسه (__projVisible).
// ٢) «Favorite provider» بالإنجليزيّ قيمته «العميق»: التسمية المحفوظة بلغة وقت الإرسال. صار يُحلّ من providerKey
//    بلغة الواجهة كما يفعل عرض الرسالة (v-prov-status-i18n)، والرسائل القديمة بلا مفتاح تبقى بتسميتها.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const A05 = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');
const A04 = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');

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

const EMPTY = (id) => ({ id, title: 'مشروع جديد', messages: [], code: '' });
const CASES = [
  EMPTY('p_1'),
  { id: 'p_2', title: 'سؤال', messages: [{ role: 'user', content: 'هلا' }], code: '' },
  { id: 'p_3', title: 'صفحة', messages: [], code: '<html></html>' },
  { id: 'p_4', title: 'مشروع جديد' },
  null,
];

function run(projects, fl) {
  const els = {};
  const ctx = {
    state: { projects },
    $: (sel) => (els[sel] = els[sel] || { textContent: '' }),
    functionalLabel: fl || ((k) => 'EN:' + k),
  };
  vm.createContext(ctx);
  vm.runInContext(sliceBlock(A04, A04.indexOf('function __projVisible(')) + '\n' + sliceBlock(A05, A05.indexOf('function renderStats(')) + '\nrenderStats();', ctx);
  return { count: els['#statProjectsCount'].textContent, fav: els['#statFavProvider'].textContent, msgs: els['#statMessagesCount'].textContent };
}

test('١. __projVisible هو شرط قائمة المشاريع نفسه (v-hide-empty-proj) — لا ينحرف عنه', () => {
  const m = /const __histSorted = \[\.\.\.state\.projects\]\.filter\((p => .*?)\)\.sort\(/.exec(A04);
  assert.ok(m, 'شرط القائمة');
  const ctx = {};
  vm.createContext(ctx);
  const listKeep = vm.runInContext('(' + m[1] + ')', ctx);
  vm.runInContext(sliceBlock(A04, A04.indexOf('function __projVisible(')), ctx);
  for (const p of CASES) assert.equal(!!ctx.__projVisible(p), !!listKeep(p), JSON.stringify(p));
});

test('٢. «عدد المشاريع» يعدّ الظاهر في القائمة فقط: [فارغ، فيه رسالة، كود فقط، فارغ] = 2', () => {
  const r = run([EMPTY('p_1'), CASES[1], CASES[2], EMPTY('p_4')]);
  assert.equal(r.count, '2');
  assert.equal(r.msgs, '1', 'عدّ الرسائل كما كان');
});

test('٣. المزوّد المفضّل يُحلّ من providerKey بلغة الواجهة، والقديم بلا مفتاح بتسميته المحفوظة', () => {
  const msg = (lbl, key) => Object.assign({ role: 'assistant', content: 'x', providerLabel: lbl }, key ? { providerKey: key } : {});
  let r = run([{ id: 'p_1', title: 't', messages: [{ role: 'user', content: 'q' }, msg('العميق', 'openai'), msg('🔄 العميق', 'openai'), msg('Legacy')] }]);
  assert.equal(r.fav, 'EN:openai', 'لا «العميق» عربيّة في الواجهة الإنجليزيّة');
  r = run([{ id: 'p_1', title: 't', messages: [msg('🔄 السريع'), msg('السريع')] }]);
  assert.equal(r.fav, 'السريع', 'رسائل قديمة بلا مفتاح: التسمية كما حُفظت بلا 🔄');
  // مفاتيح مختلفة باسم وظيفيّ واحد تُعدّ معًا كما يراها المستخدم: ٣ «Deep» (openai/perplexity/deepseek) تغلب ٢ gemini
  r = run([{ id: 'p_1', title: 't', messages: [msg('السريع', 'gemini'), msg('السريع', 'gemini'), msg('العميق', 'openai'), msg('العميق', 'perplexity'), msg('العميق', 'deepseek')] }],
    (k) => ({ openai: 'Deep', perplexity: 'Deep', deepseek: 'Deep', gemini: 'Fast' })[k]);
  assert.equal(r.fav, 'Deep', 'لو عُدّ بالمفتاح لغلب gemini ×٢ كلّ مفتاح ×١');
  r = run([EMPTY('p_1')]);
  assert.equal(r.fav, '—', 'بلا ردود: شرطة');
});
