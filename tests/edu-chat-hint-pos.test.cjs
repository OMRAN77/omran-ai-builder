'use strict';
/* v-edu-hint-place (تدقيق ١٨–١٩ أكتوبر، g03 edu-chat-hint):
   - الحاسوب: #eduChatHint (fixed، inset-inline:14px، margin:auto) كان يتوسّط النافذة كلّها فيقطع الفاصل بين لوحة
     المعاينة والمحادثة. الآن left/right من مستطيل #chatcol فيتوسّط العمود بـmargin:auto نفسه، ويُعاد القياس مع resize.
   - الجوّال: bottom:110px ثابت والصندوق يبدأ على ١٣١px من الأسفل، فالبطاقة فوق الصندوق وزرّ الإرسال ١٢ ثانية.
     الآن bottom من المساعد المشترك window.__omranAboveComposer، وتُخفى حين يبدأ المستخدم الكتابة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const EDU = fs.readFileSync(path.join(ROOT, 'js/edu.js'), 'utf8');
const BLOCK = (EDU.match(/\/\* chat smart hint \(purely additive listener\) \*\/\ntry\{[\s\S]*?\}catch\(e\)\{ __swallow\(e, "misc:index#14"\); \}/) || [''])[0];

function world(opts) {
  const o = Object.assign({ mobile: false, innerWidth: 1440, innerHeight: 900 }, opts);
  const docL = {}; const winL = {};
  const classes = new Set();
  const mk = (id) => ({ id, style: {}, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, onclick: null });
  const hint = mk('eduChatHint');
  hint.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) };
  const els = { eduChatHint: hint, eduChatHintTxt: mk('eduChatHintTxt'), eduChatHintBtn: mk('eduChatHintBtn') };
  if (o.chatcol) els.chatcol = { getBoundingClientRect: () => o.chatcol };
  const prompt = mk('prompt'); prompt.value = '';
  els.prompt = prompt;
  const document = {
    documentElement: { classList: { contains: (c) => (c === 'mobile-ui' ? o.mobile : false) } },
    getElementById: (id) => els[id] || null,
    addEventListener: (t, fn) => { (docL[t] = docL[t] || []).push(fn); },
  };
  const ctx = {
    document, innerWidth: o.innerWidth, innerHeight: o.innerHeight,
    addEventListener: (t, fn) => { (winL[t] = winL[t] || []).push(fn); },
    setTimeout: () => 0, __swallow() {},
    T: (k) => k, eduL: (a) => a, isRTL: () => true, openModal() {},
  };
  ctx.window = ctx;
  if (o.above) ctx.window.__omranAboveComposer = o.above;
  const ros = [];
  if (o.ro) ctx.ResizeObserver = function (fn) { const me = { fn, targets: [] }; ros.push(me); this.observe = (t) => me.targets.push(t); this.disconnect = () => {}; };
  vm.runInNewContext(BLOCK, ctx);
  const send = (txt) => {
    prompt.value = txt;
    (docL.keydown || []).forEach((f) => f({ key: 'Enter', shiftKey: false, target: prompt }));
  };
  return { hint, classes, send, docL, winL, ctx, prompt, o, ros, els };
}

test('١. الحاسوب: التلميح يتوسّط #chatcol لا النافذة (left/right من مستطيل العمود)', () => {
  assert.ok(BLOCK, 'كتلة التلميح في edu.js');
  const w = world({ chatcol: { left: 596, right: 1280, width: 684, top: 0, bottom: 900 } });
  w.send('لخص المحاضرة');
  assert.ok(w.classes.has('show'), 'التلميح ظهر');
  assert.equal(w.hint.style.left, '610px', '596 + 14');
  assert.equal(w.hint.style.right, '174px', '1440 − 1280 + 14');
  assert.ok(!w.hint.style.bottom, 'bottom على الحاسوب يبقى من CSS (v399: 275px)');
});

test('٢. الحاسوب: إعادة القياس مع resize ما دام ظاهرًا', () => {
  const w = world({ chatcol: { left: 596, right: 1280, width: 684 } });
  w.send('quiz me');
  assert.ok((w.winL.resize || []).length, 'مستمع resize');
  w.o.chatcol.left = 400; w.o.chatcol.right = 1170;
  w.ctx.innerWidth = 1440;
  w.winL.resize.forEach((f) => f());
  assert.equal(w.hint.style.left, '414px');
  assert.equal(w.hint.style.right, '284px');
});

test('٢ب. الحاسوب: الإرسال يضيّق العمود بعد ظهور التلميح (تتّسع لوحة المعاينة) ← مراقب حجم #chatcol يعيد التوسيط', () => {
  const w = world({ ro: true, chatcol: { left: 400, right: 1170, width: 770 } });
  w.send('لخص المحاضرة');
  assert.equal(w.hint.style.left, '414px');
  assert.equal(w.ros.length, 1, 'مراقب حجم واحد');
  assert.equal(w.ros[0].targets[0], w.els.chatcol, 'يراقب #chatcol');
  w.o.chatcol.left = 596; w.o.chatcol.right = 1154;
  w.ros[0].fn([]);
  assert.equal(w.hint.style.left, '610px');
  assert.equal(w.hint.style.right, '300px');
});

test('٣. الجوّال: أسفل البطاقة فوق أعلى الصندوق (bottom ≥ 139px على 844 والصندوق عند 713)، بلا left/right', () => {
  const w = world({ mobile: true, innerWidth: 390, innerHeight: 844, chatcol: { left: 0, right: 390, width: 390 }, above: (gap) => ({ bottom: 844 - 713 + gap, left: 11, width: 358, cx: 190 }) });
  w.send('عندي واجب');
  assert.ok(w.classes.has('show'));
  assert.ok(parseFloat(w.hint.style.bottom) >= 139, 'bottom=' + w.hint.style.bottom);
  assert.ok(!w.hint.style.left && !w.hint.style.right, 'الجوّال يبقى بـinset-inline من CSS');
});

test('٤. الجوّال: الكتابة في الصندوق تُخفي التلميح', () => {
  const w = world({ mobile: true, innerWidth: 390, innerHeight: 844, above: () => ({ bottom: 141, left: 11, width: 358, cx: 190 }) });
  w.send('لخص الدرس');
  assert.ok(w.classes.has('show'));
  w.prompt.value = '';
  (w.docL.input || []).forEach((f) => f({ target: w.prompt }));
  assert.ok(w.classes.has('show'), 'تفريغ الصندوق بعد الإرسال لا يُخفيه');
  w.prompt.value = 'ا';
  (w.docL.input || []).forEach((f) => f({ target: w.prompt }));
  assert.ok(!w.classes.has('show'), 'بدء الكتابة أخفاه');
});
