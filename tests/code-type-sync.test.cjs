'use strict';
/* v-py-sync (تدقيق ١٨ أكتوبر، g06/work-tabs): مشروع بايثون مرفوع يُفتح من جهاز آخر صفحةَ HTML بلا «تشغيل الكود» —
   الخادم (api/_lib/chats.js slimProjects) لا يحفظ codeType، فيصل المشروع بلا نوع ويرسمه renderCodeAndPreview HTML.
   القرار (عميل فقط، بلا لمس سجلّات الخادم): __chatsMergeServer يستنتج النوع لمشروع بلا codeType بقاعدة زرّ «تشغيل»
   (btnRunCode): لا يبدأ بـ«<» وفيه import/def/print — فيصير python. وما سواه يبقى كما كان (بلا نوع = HTML).
   الدالّة الحقيقيّة تُنفَّذ هنا في vm من الجزء ومن الحزمة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
function fnSrc(src, head) {
  const a = src.indexOf(head);
  assert.ok(a >= 0, head);
  let d = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
  return src.slice(a, i + 1);
}

function merger(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return function run(projects, server) {
    const calls = { saveState: 0, renderAll: 0 };
    const ctx = {
      localStorage: { getItem: () => null, setItem() {} },
      state: { projects, currentId: projects[0] ? projects[0].id : null },
      __swallow(e) { throw e; }, console,
      saveState() { calls.saveState++; }, renderHistory() {}, renderAll() { calls.renderAll++; }, buildChatList() {},
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc(src, 'function chatsDeletedIds(){') + '\n' + fnSrc(src, 'function __chatsMergeServer(server, deletedIds){'), ctx);
    ctx.__server = JSON.parse(JSON.stringify(server));
    const changed = vm.runInContext('__chatsMergeServer(__server, [])', ctx);
    return { changed, calls, projects: ctx.state.projects };
  };
}

const PY = "import math\nprint('hi', math.pi)";
const msg = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i }));

for (const file of ['js/app-04-i18n-state.js', 'js/app.bundle.js']) {
  const run = merger(file);

  test(file + ': ١. مشروع بايثون جديد من الخادم بلا codeType يصل python', () => {
    const r = run([{ id: 'p_1790000000001', title: 'محلّيّ', messages: msg(1), code: '' }],
      [{ id: 'p_1790000000002', title: 'من الجوّال', provider: '', messages: msg(1), code: PY, updatedAt: 5 }]);
    const p = r.projects.find((x) => x.id === 'p_1790000000002');
    assert.equal(p.codeType, 'python');
    assert.equal(p.code, PY, 'الكود نفسه بلا تغيير');
  });

  test(file + ': ٢. مشروع محلّيّ بلا كود يأخذ كود الخادم ونوعه المستنتج', () => {
    const r = run([{ id: 'p_1790000000003', title: 'x', messages: msg(2), code: '' }],
      [{ id: 'p_1790000000003', title: 'x', messages: msg(2), code: "def f():\n    return 1\nprint(f())" }]);
    assert.equal(r.projects[0].codeType, 'python');
  });

  test(file + ': ٣. مشروع دُمج قبل الإصلاح (كود بايثون بلا نوع) يُصحَّح ويُعاد رسمه مرّة واحدة', () => {
    const local = [{ id: 'p_1790000000004', title: 'x', messages: msg(2), code: "print('x')" }];
    const r = run(local, [{ id: 'p_1790000000004', title: 'x', messages: msg(2), code: "print('x')" }]);
    assert.equal(r.projects[0].codeType, 'python');
    assert.equal(r.changed, true, 'تغيّر النوع = تغيير يستحقّ الحفظ وإعادة الرسم');
    assert.ok(r.calls.saveState >= 1 && r.calls.renderAll >= 1);
    const again = run(r.projects, [{ id: 'p_1790000000004', title: 'x', messages: msg(2), code: "print('x')" }]);
    assert.equal(again.changed, false, 'لا وميض في الدورات التالية');
  });

  test(file + ': ٤. HTML ونوع محفوظ أصلًا لا يُمسّان', () => {
    const r = run([
      { id: 'p_1790000000005', title: 'h', messages: msg(1), code: '' },
      { id: 'p_1790000000006', title: 'h2', messages: msg(1), code: "print('looks py')", codeType: 'html' },
    ], [
      { id: 'p_1790000000005', title: 'h', messages: msg(1), code: '<!doctype html><script>print()</script>' },
      { id: 'p_1790000000006', title: 'h2', messages: msg(1), code: "print('looks py')" },
      { id: 'p_1790000000007', title: 'n', messages: msg(1), code: '<html><body>import x</body></html>' },
    ]);
    const by = Object.fromEntries(r.projects.map((p) => [p.id, p]));
    assert.notEqual(by.p_1790000000005.codeType, 'python', 'كود يبدأ بـ< = HTML');
    assert.equal(by.p_1790000000006.codeType, 'html', 'نوع محفوظ محلّيًّا لا يُستبدل');
    assert.notEqual(by.p_1790000000007.codeType, 'python');
  });
}

test('٥. القاعدة نفسها التي يقرّر بها زرّ «تشغيل»، والمزامنة لا تضيف codeType لما يُرفع (الخادم يُسقطه)', () => {
  const a4 = fs.readFileSync(path.join(ROOT, 'js/app-04-i18n-state.js'), 'utf8');
  const a6 = fs.readFileSync(path.join(ROOT, 'js/app-06-checkout.js'), 'utf8');
  assert.match(a6, /const looksPy = !\/\^\\s\*<\/\.test\(src\) && \/\(\^\|\\n\)\\s\*\(import \|def \|print\\\(\)\/\.test\(src\);/);
  const merge = fnSrc(a4, 'function __chatsMergeServer(server, deletedIds){');
  assert.ok(merge.includes("!/^\\s*</.test(") && merge.includes("/(^|\\n)\\s*(import |def |print\\()/.test("), 'قاعدة btnRunCode داخل الدمج');
  assert.ok(!/codeType/.test(fnSrc(a4, 'function chatsSlimForServer(){')), 'نسخة الرفع كما هي (مزامنة النوع عبر الخادم خارج هذا الإصلاح)');
});
