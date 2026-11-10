// tests/no-empty-catch.test.cjs — v-swallow-catches (فحص Desloppify ٨ نوفمبر ٢٠٢٦: «Empty catch — swallows errors silently» ٩٨٥ موضعًا،
// ٣٧٩ منها في أجزاء الحزمة js/app-NN). كلّ catch فيها صار يسجّل عبر __swallow (تحذير في الطرفية، ٣ مرّات لكلّ موضع، لا يرمي ولا
// يغيّر مسار التنفيذ)، بصيغة محروسة `typeof __swallow === 'function' && …` لأنّ بعض الكتل تُشغَّل في بيئة بلا الحزمة.
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

test('١. لا catch فارغًا في أجزاء الحزمة ولا الملفّات المنفصلة في js/ (ما عدا تعريف __swallow والمكتبات)', () => {
  // v-standalone-swallow: الملفّات المنفصلة (video وselfdiag وmodes وmedia-notify وpartials…) بالصيغة المحروسة نفسها
  const parts = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && f !== 'app-00-swallow.js' && !/app\.bundle|\.min\./.test(f));
  assert.ok(parts.length > 70);
  const bad = [];
  for (const f of parts) {
    const ast = acorn.parse(read('js/' + f), { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
    visit(ast, (n) => { if (n.type === 'CatchClause' && n.param && !n.body.body.length) bad.push(f + ':' + n.loc.start.line); });
  }
  assert.deepEqual(bad, [], 'catch فارغ');
});

test('٢. الصيغة المحروسة لا ترمي بلا __swallow، وتسجّل حين يوجد — والسياق ليس مسارًا حرجًا فلا يُرسَل للخادم', () => {
  const src = "try{ throw new Error('x'); }catch(e){ typeof __swallow === 'function' && __swallow(e, 'app-09-attach:216'); }";
  assert.doesNotThrow(() => vm.runInNewContext(src, {}), 'بيئة بلا الحزمة');
  const seen = [];
  vm.runInNewContext(src, { __swallow: (e, ctx) => seen.push([e.message, ctx]) });
  assert.deepEqual(seen, [['x', 'app-09-attach:216']]);
  const CRITICAL = new RegExp(/var CRITICAL = \/(.+)\/;/.exec(read('js/app-00-swallow.js'))[1]);
  assert.equal(CRITICAL.test('app-09-attach:216'), false, 'لا تقرير للخادم من هذه المواضع');
});
