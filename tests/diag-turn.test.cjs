// tests/diag-turn.test.cjs — v-chat-sys-msg (تدقيق ١٨–١٩ أكتوبر، g05 stamps وchat-pdf-export وtalking-character، وg03 chat-error-messages).
// العرض: «إلغاء» في نافذة الطوابع أو الشخصيّة الناطقة، و«حطه في PDF» بعد نجاح التصدير، تنتهي بلا ردّ مقصودًا — فتعدّها كتلة finally
// «ردًّا غائبًا» وتدفع «🔧 تشخيص الرد الغائب: المزوّد: …» (عربيّ في الإنجليزيّ، واسم مزوّد يراه المستخدم)، ثمّ يصير السطر نفسه
// مصدر PDF التالي. ورسالة الانقطاع لغير المالك تحمل «المسار الأوّل (العميق): Failed to fetch» الخامّ.
// الآن: المخارج المحلّيّة تعلّم __run.localDone فلا تشخيص، والسطر للمالك وحده، وحلقة مصدر PDF تتخطّاه، وسطر المسار الأوّل برمز
// الحالة وحده («خطأ 503») — خطأ الشبكة وما بلا رمز إلى سجلّ الأخطاء.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const a9 = fs.readFileSync(path.join(root, 'js/app-09-attach.js'), 'utf8');
const fnSrc = (sig) => { const s = a9.indexOf(sig); assert.ok(s >= 0, sig + ' في app-09'); return a9.slice(s, a9.indexOf('\n}\n', s) + 3); };
const between = (a, b) => { const i = a9.indexOf(a); assert.ok(i >= 0, a); const j = a9.indexOf(b, i + a.length); assert.ok(j > i, b); return a9.slice(i, j); };
const coreStart = a9.indexOf('async function __sendPromptCore(');
const core = a9.slice(coreStart, a9.indexOf("\nlocalStorage.removeItem('autoSpeakReplies');", coreStart)); // __friendlyErr تصريح داخليّ في العمود الأوّل

function diag({ owner, last, run, text }) {
  const ctx = {
    window: { __diagTurn: { t0: Date.now() - 3000, provider: 'p', path: 'tools', replyLen: -1, err: '', toolsErr: '' } },
    omranOwnerUi: () => owner, isPureGreeting: (s) => s === 'مرحبا', isCasualCheckIn: () => false,
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc('function omranDiagTurnMsg(') + '\nthis.f = omranDiagTurnMsg;', ctx);
  const cur = { messages: [{ role: 'user', content: text || 'سؤال' }].concat(last ? [last] : []) };
  return ctx.f(cur, text || 'سؤال', run || {});
}

test('١. سطر التشخيص للمالك وحده، ولا بعد مخرج محلّيّ مقصود ولا مهلة ولا ردّ ظاهر ولا تحيّة', () => {
  const m = diag({ owner: true });
  assert.ok(m && m._diag === true && m.role === 'assistant', 'المالك بلا ردّ: السطر كما كان');
  assert.match(m.content, /^🔧 تشخيص الرد الغائب:\n• المزوّد: p\n• المسار: tools\n/);
  assert.equal(diag({ owner: false }), null, 'غير المالك: لا اسم مزوّد ولا نصّ تقنيّ عربيّ');
  assert.equal(diag({ owner: true, run: { localDone: true } }), null, 'الإلغاء وتصدير PDF');
  assert.equal(diag({ owner: true, run: { timedOut: true } }), null);
  assert.equal(diag({ owner: true, last: { role: 'assistant', content: 'جواب' } }), null);
  assert.equal(diag({ owner: true, text: 'مرحبا' }), null);
});

test('٢. finally يمرّ بالمساعد، والمخارج المحلّيّة الأربعة تعلّم localDone', () => {
  assert.match(core, /var __dgm = omranDiagTurnMsg\(cur, text, __run\);\n\s*if\(__dgm\)\{ cur\.messages\.push\(__dgm\); renderAll\(__keepReaderPosition\); \}/);
  assert.ok(!core.includes("'🔧 تشخيص الرد الغائب:"), 'النصّ خرج من __sendPromptCore');
  // بلا سطر تشخيص لا يتغيّر شيء في المحادثة (بصمة الرسم نفسها فيُتخطّى الرسم) — فقاعة «يعمل…» تُزال صراحةً
  assert.match(core, /if\(__dgm\)\{[^\n]*\}\n\s*else if\(thinkingDiv\.isConnected\) thinkingDiv\.remove\(\);/);
  assert.match(core, /exportTextAsPdf\(__pdfSrc\); __run\.localDone = true;/, 'تصدير PDF');
  assert.match(core, /if\(!__stHint\)\{ __run\.localDone = true; thinkingDiv\.remove\(\);/, 'إلغاء الطوابع');
  assert.match(core, /if\(__pick === null\)\{ __run\.localDone = true; thinkingDiv && thinkingDiv\.remove\(\); return; \}/, 'إلغاء اختيار الشخصيّة');
  assert.match(core, /if\(__tcChoice === null\)\{ __run\.localDone = true; thinkingDiv && thinkingDiv\.remove\(\); return; \}/, 'إلغاء إعدادات الشخصيّة');
});

test('٣. حلقة مصدر PDF تتخطّى سطر التشخيص ورسائل التطبيق', () => {
  const loop = between('      let __pdfSrc = null;', '      if(__pdfSrc){');
  const ctx = { cur: { messages: [
    { role: 'user', content: 'اكتب مقالًا' },
    { role: 'assistant', content: 'مقال طويل عن تاريخ دبي من قرية صيد إلى مدينة عالميّة، بفقرات كثيرة وتفاصيل.' },
    { role: 'user', content: 'حطه في PDF' },
    { role: 'assistant', _diag: true, content: '🔧 تشخيص الرد الغائب:\n• المزوّد: —\n• المسار: —\n• طول الرد المُستلَم: لم يصل' },
    { role: 'assistant', _sys: 'err', content: '⚠️ انقطع الاتصال لحظة أثناء الرد 📡 — أعد إرسال سؤالك وسيصلك الجواب.' },
  ] } };
  vm.createContext(ctx);
  vm.runInContext(loop + '\nthis.src = __pdfSrc;', ctx);
  assert.match(ctx.src, /^مقال طويل/);
});

// الفرع الأخير من catch كما هو، بمساعدَيه الحقيقيّين
function errBubble(toolsErr, owner, lng) {
  const logged = [];
  const blk = between("      var __primaryErr = '';", '  }finally{').replace(/\n\s*\}\s*$/, '');
  const ctx = {
    window: { __diagTurn: { toolsErr, toolsProv: 'openai' } }, lang: lng || 'ar', cur: { messages: [] }, err: new Error('Failed to fetch'),
    omranOwnerUi: () => owner, functionalLabel: () => 'العميق', __friendlyErr: () => 'انقطع الاتصال لحظة أثناء الرد 📡 — أعد إرسال سؤالك وسيصلك الجواب.',
    console: { error: (...a) => logged.push(a.join(' ')), warn() {}, log() {} }, String, Array,
  };
  vm.createContext(ctx);
  vm.runInContext(fnSrc('function omranPrimaryErrLine(') + fnSrc('function omranPrimaryErrShown(') + blk, ctx);
  return { msg: ctx.cur.messages[0], logged };
}

test('٤. سطر «المسار الأوّل» برمز الحالة وحده؛ خطأ الشبكة وما بلا رمز إلى سجلّ الأخطاء', () => {
  const net = errBubble('TypeError: Failed to fetch', false);
  assert.ok(!/Failed to fetch|المسار الأوّل/.test(net.msg.content), net.msg.content);
  assert.equal(net.msg._sys, 'err');
  assert.ok(net.logged.some((l) => l.includes('Failed to fetch')), 'النصّ التقنيّ في سجلّ الأخطاء');
  for (const raw of ['Load failed', 'NetworkError when attempting to fetch resource.', 'AbortError: The user aborted a request.', 'Error: stalled'])
    assert.ok(!errBubble(raw, false).msg.content.includes('المسار الأوّل'), raw);
  const s503 = errBubble('Error: chat 503', false);
  assert.match(s503.msg.content, /\nالمسار الأوّل \(العميق\): خطأ 503$/, 'الرمز الوظيفيّ يبقى لغير المالك');
  assert.ok(!errBubble('Error: chat 503', true).msg.content.includes('المسار الأوّل'), 'المالك بلا سطر كما كان (v-owner-solo)');
});
