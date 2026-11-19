// tests/server-swallow.test.cjs — v-server-swallow (فحص Desloppify: ٢٨٨ catch فارغًا في الخادم). كلّ catch في api يسجّل عبر _swallow.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const visit = (n, fn) => {
  if (!n || typeof n.type !== 'string') return;
  fn(n);
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, fn));
    else if (v && typeof v.type === 'string') visit(v, fn);
  }
};

test('١. لا catch فارغًا في api/*.js ولا api/_lib/*.js (ما عدا المسجّل نفسه)', () => {
  const files = [
    ...fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).map((f) => 'api/' + f),
    ...fs.readdirSync(path.join(root, 'api/_lib')).filter((f) => f.endsWith('.js') && f !== '_swallow.js').map((f) => 'api/_lib/' + f),
  ];
  const bad = [];
  for (const f of files) {
    const ast = acorn.parse(read(f), { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true });
    visit(ast, (n) => { if (n.type === 'CatchClause' && n.param && !n.body.body.length) bad.push(f + ':' + n.loc.start.line); });
  }
  assert.deepEqual(bad, [], 'catch فارغ');
});

test('٢. المسجّل: ثلاث مرّات لكلّ موضع، لا يرمي ولو كان الخطأ غريبًا، ولا يقرأ أسرارًا', () => {
  const lib = require(path.join(root, 'api/_lib/_swallow.js'));
  const warn = console.warn; const out = [];
  console.warn = (m) => out.push(String(m));
  try {
    for (let i = 0; i < 5; i++) lib.swallow(new Error('boom'), 'chat:671');
    lib.swallow(null, 'x:1'); lib.swallow({ get message() { throw new Error('evil'); } }, 'y:2');
  } finally { console.warn = warn; }
  assert.equal(out.filter((m) => m.includes('chat:671')).length, 3);
  assert.ok(out.some((m) => m === '[swallowed] x:1: null'));
  assert.doesNotMatch(read('api/_lib/_swallow.js'), /process\.env|_secrets|kv\.js|fetch\(/);
});

test('٣. الصيغة المحروسة لا ترمي في vm بلا require', () => {
  const src = "try{ throw new Error('x'); }catch(e){ typeof require === 'function' && require('./_swallow.js').swallow(e, 'chat:1'); }";
  assert.doesNotThrow(() => vm.runInNewContext(src, {}));
});
