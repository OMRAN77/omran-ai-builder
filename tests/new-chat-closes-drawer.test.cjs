// tests/new-chat-closes-drawer.test.cjs — v-new-chat-drawer (تدقيق ١٨ أكتوبر: g02 new-chat، جوّال).
// «محادثة جديدة» في الجوّال كانت تنشئ المحادثة وتترك الدرج مفتوحًا فوقها، والفارغة لا تضيف صفًّا (v-hide-empty-proj)
// فلا يتغيّر شيء على الشاشة. اختيار صفّ من القائمة يغلق الدرج عند ≤860 (app-10)، وإجراء مها new_chat كذلك.
// الإصلاح: آخر معالج #btnNew يغلق الدرج بالشرط نفسه؛ الحاسوب كما هو.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-05-ui.js'), 'utf8');

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

function runAt(width) {
  const i = SRC.indexOf("$('#btnNew').onclick = () => {");
  const body = sliceBlock(SRC, SRC.indexOf('() => {', i));
  let closed = 0, saved = 0;
  const ctx = {
    state: { projects: [], currentId: null },
    window: { innerWidth: width },
    t: (k) => k, saveState() { saved++; }, renderAll() {}, mahaClearImageRef() {},
    closeDrawers() { closed++; },
  };
  vm.createContext(ctx);
  vm.runInContext('(' + body + ')', ctx)();
  return { closed, saved, state: ctx.state };
}

test('١. جوّال (390): «محادثة جديدة» تنشئ المحادثة وتغلق الدرج مرّة', () => {
  const r = runAt(390);
  assert.equal(r.state.projects.length, 1);
  assert.equal(r.state.currentId, r.state.projects[0].id);
  assert.equal(r.saved, 1);
  assert.equal(r.closed, 1, 'الدرج يُغلق فتظهر المحادثة الجديدة');
});

test('٢. الحاسوب (1440): لا تُغلق الشريط الجانبيّ', () => {
  assert.equal(runAt(1440).closed, 0);
  assert.equal(runAt(860).closed, 1, 'الحدّ نفسه الذي يغلق به اختيار الصفّ (≤860)');
});
