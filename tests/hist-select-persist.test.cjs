// tests/hist-select-persist.test.cjs — v-hist-select-persist (تدقيق ١٨ أكتوبر: g01 session-new-toast، g06 work-panel-collapse).
// فتح محادثة قديمة من القائمة ثمّ F5 كان ينتهي بـ«مشروع جديد» فارغ أو بمحادثة غير المختارة: النقرة تغيّر
// state.currentId وترسم، لكنّ aiapp_current_id لا يُكتب إلّا في saveState، والإقلاع يقرؤه (app-04 ~448).
// الإصلاح: النقرة تحفظ المعرّف، وشبكة أمان عند pagehide/الإخفاء تحفظ state.currentId لكلّ مسار يغيّره بلا saveState.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-04-i18n-state.js'), 'utf8');

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

function lsMap(init) {
  const m = new Map(Object.entries(init || {}));
  return { m, api: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } };
}

test('١. النقر على محادثة في القائمة يحفظ aiapp_current_id فورًا (لا ينتظر saveState)', () => {
  const i = SRC.indexOf('titleSpan.onclick = () => {');
  const body = sliceBlock(SRC, SRC.indexOf('() => {', i));
  const ls = lsMap({ aiapp_provider: 'openai', aiapp_current_id: 'p_empty' });
  const p = { id: 'p1', title: 'وصفة', provider: 'openai', messages: [{ role: 'user', content: 'هلا' }] };
  let renders = 0;
  const ctx = {
    p, state: { projects: [p], currentId: 'x' },
    localStorage: ls.api,
    document: { getElementById: () => null, body: { classList: { toggle() {} } } },
    mahaClearImageRef() {}, renderAll() { renders++; },
    omranDefaultProv: () => 'openai', __swallow() {},
  };
  vm.createContext(ctx);
  const fn = vm.runInContext('(' + body + ')', ctx);
  fn();
  assert.equal(ctx.state.currentId, 'p1');
  assert.equal(ls.m.get('aiapp_current_id'), 'p1', 'F5 بعد النقرة يفتح المحادثة نفسها');
  assert.equal(renders, 1);
});

test('٢. شبكة أمان: pagehide والإخفاء يحفظان state.currentId، ولا يمسحان المحفوظ حين لا محادثة', () => {
  const i = SRC.indexOf('function __saveCurIdFlush(');
  const fnSrc = sliceBlock(SRC, i);
  assert.match(SRC, /window\.addEventListener\('pagehide', __saveCurIdFlush\)/, 'مسجّلة على pagehide');
  assert.match(SRC, /visibilityState === 'hidden'\) __saveCurIdFlush\(\)/, 'ومع إخفاء الصفحة (iOS لا يطلق pagehide دائمًا)');
  const ls = lsMap({ aiapp_current_id: 'p_old' });
  const ctx = { state: { projects: [], currentId: 'p_voice' }, localStorage: ls.api, __swallow() {} };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\n__saveCurIdFlush();', ctx);
  assert.equal(ls.m.get('aiapp_current_id'), 'p_voice', 'مسار غيّر المعرّف بلا saveState (صوت/مها/…) يُحفظ عند المغادرة');
  ctx.state.currentId = null;
  vm.runInContext('__saveCurIdFlush();', ctx);
  assert.equal(ls.m.get('aiapp_current_id'), 'p_voice', 'معرّف فارغ لا يمسح المحفوظ');
});
