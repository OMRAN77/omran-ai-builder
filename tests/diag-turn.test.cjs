// tests/diag-turn.test.cjs — v-diag-turn (تدقيق ١٨–١٩ أكتوبر، g05 stamps وchat-pdf-export وtalking-character؛ وأمر المالك ٢٠ أكتوبر، الدفعة ٤:
// «رسالة 🔧 تشخيص الرد الغائب تنضاف بعد إلغاء أو حطّه في PDF»). المخارج المحلّيّة المقصودة تعلّم __run.localDone فلا تشخيص، والسطر للمالك
// وحده (فيه اسم المزوّد ونصّ تقنيّ)، وحلقة مصدر PDF تتخطّاه. مأخوذ من حزمة a3 في فرع ten-a (التشخيص وحده).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const a9 = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-09-attach.js'), 'utf8');
const fnSrc = (sig) => { const s = a9.indexOf(sig); assert.ok(s >= 0, sig); return a9.slice(s, a9.indexOf('\n}\n', s) + 3); };

function diag({ owner, last, run, text }) {
  const ctx = {
    window: { __diagTurn: { t0: Date.now() - 3000, provider: 'p', path: 'tools', replyLen: -1, err: '', toolsErr: '' } },
    omranOwnerUi: () => owner, isPureGreeting: (s) => s === 'مرحبا', isCasualCheckIn: () => false, Math, Date, String,
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc('function omranDiagTurnMsg(') + '\nthis.f = omranDiagTurnMsg;', ctx);
  const cur = { messages: [{ role: 'user', content: text || 'سؤال' }].concat(last ? [last] : []) };
  return ctx.f(cur, text || 'سؤال', run || {});
}

test('١. المستخدم العاديّ لا يرى سطر التشخيص أبدًا (فيه اسم المزوّد ونصّ تقنيّ)', () => {
  assert.equal(diag({ owner: false }), null);
});

test('٢. المالك يراه لدور بلا ردّ — إلّا بعد مخرج محلّيّ مقصود (إلغاء الطوابع أو الشخصيّة، تصدير PDF) أو مهلة أو تحيّة', () => {
  const m = diag({ owner: true });
  assert.ok(m && m._diag && /^🔧 تشخيص الرد الغائب:/.test(m.content));
  assert.equal(diag({ owner: true, run: { localDone: true } }), null);
  assert.equal(diag({ owner: true, run: { timedOut: true } }), null);
  assert.equal(diag({ owner: true, text: 'مرحبا' }), null);
  assert.equal(diag({ owner: true, last: { role: 'assistant', content: 'ردّ' } }), null, 'ردّ ظاهر');
  assert.equal(diag({ owner: true, last: { role: 'assistant', content: '', attachments: [{}] } }), null, 'صورة');
});

test('٣. المخارج الأربعة تعلّم localDone قبل الخروج', () => {
  assert.match(a9, /exportTextAsPdf\(__pdfSrc\); __run\.localDone = true;/);
  assert.match(a9, /if\(!__stHint\)\{ __run\.localDone = true; thinkingDiv\.remove\(\);/);
  assert.match(a9, /if\(__pick === null\)\{ __run\.localDone = true; thinkingDiv && thinkingDiv\.remove\(\); return; \}/);
  assert.match(a9, /if\(__tcChoice === null\)\{ __run\.localDone = true; thinkingDiv && thinkingDiv\.remove\(\); return; \}/);
});

test('٤. الختام يسأل omranDiagTurnMsg (لا بناء مكشوف)، ومصدر PDF يتخطّى سطر التشخيص', () => {
  assert.match(a9, /var __dgm = omranDiagTurnMsg\(cur, text, __run\);\n\s*if\(__dgm\)\{ cur\.messages\.push\(__dgm\); renderAll\(__keepReaderPosition\); \}/);
  assert.equal((a9.match(/'🔧 تشخيص الرد الغائب:\\n'/g) || []).length, 1, 'نصّ السطر في الدالّة وحدها');
  assert.match(a9, /!__m\._loading && !__m\._diag && String\(__m\.content\)\.length > 60/);
});
