// tests/no-dead-code.test.cjs — v-dead-code (فحص Desloppify ٨ نوفمبر ٢٠٢٦: «Unreachable code after return»): أربع ميزات
// موقوفة بـreturn في أوّلها بقي جسمها في الحزمة — مواضيع الذاكرة (v368)، منتقي الصوت الأوّل (v-maha-solo)، تلميح زرّ الكود،
// تحويل اللهجة للنطق (v248). حُذفت، وهذا الاختبار يمنع عودة كود لا يصله التنفيذ في أجزاء الواجهة والخادم.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
// جمل بعد return/throw في الكتلة نفسها — تعريف الدالّة مستثنى لأنّه يُرفع فيُنادى من فوق
function deadAfterReturn(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
  const out = [];
  visit(ast, (n) => {
    const body = n.type === 'BlockStatement' || n.type === 'Program' ? n.body : (n.type === 'SwitchCase' ? n.consequent : null);
    if (!body) return;
    for (let i = 0; i < body.length - 1; i++) {
      if (body[i].type !== 'ReturnStatement' && body[i].type !== 'ThrowStatement') continue;
      const rest = body.slice(i + 1).filter((s) => s.type !== 'FunctionDeclaration' && s.type !== 'EmptyStatement');
      if (rest.length) out.push(rest[0].loc.start.line);
      break;
    }
  });
  return out;
}

test('١. لا كود بعد return في أجزاء الواجهة (js/app-NN) ولا الجزئيّات ولا الخادم (api)', () => {
  const files = [
    ...fs.readdirSync(path.join(root, 'js')).filter((f) => /^app-\d\d-.*\.js$/.test(f) || /^partials-.*\.js$/.test(f)).map((f) => 'js/' + f),
    ...fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).map((f) => 'api/' + f),
    ...fs.readdirSync(path.join(root, 'api/_lib')).filter((f) => f.endsWith('.js')).map((f) => 'api/_lib/' + f),
  ];
  assert.ok(files.length > 100, 'الملفّات المفحوصة: ' + files.length);
  const bad = [];
  for (const f of files) for (const line of deadAfterReturn(read(f))) bad.push(f + ':' + line);
  assert.deepEqual(bad, [], 'كود لا يصله التنفيذ');
});

test('٢. الفاحص يمسك الحالة ويستثني تعريف الدالّة المرفوع', () => {
  assert.deepEqual(deadAfterReturn('function a(){ return 1; const x = 2; }'), [1]);
  assert.deepEqual(deadAfterReturn('function a(){ return b(); function b(){ return 1; } }'), []);
  assert.deepEqual(deadAfterReturn('function a(x){ if(x) return 1; return 2; }'), []);
});

test('٣. الميزات الموقوفة تبقى موقوفة بلا جسم: الدوالّ تُرجع مباشرة، والتلميح محذوف', () => {
  assert.match(read('js/app-01-boot-auth.js'), /function memoryTopicsBlock\(\)\{\n    return ''; [^\n]*\n  \}/);
  assert.match(read('js/app-02-tts.js'), /async function applyDialectForSpeech\(text\)\{\n(  \/\/[^\n]*\n)*  return text;\n\}/);
  assert.match(read('js/app-08-maha.js'), /return resolve\('female'\);\n  \}\);\n\}/);
  const a10 = read('js/app-10-features.js');
  assert.ok(!a10.includes('initCodeHint') && !a10.includes('aiapp_seen_code_hint'));
  assert.ok(!read('js/app-08-maha.js').includes('voicePickFirstRun'));
});
