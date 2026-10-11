// tests/stop-grace.test.cjs — v-stop-grace: نقرة ثانية على موضع الإرسال لا توقف الردّ قبل أن يبدأ.
// لقطة المالك ١٠ أكتوبر: «تم إيقاف الرد قبل اكتماله» + شارة «تم إيقاف الرد» بلا ضغط إيقاف مقصود. أُعيد إنتاجها
// محلّيًّا بـPlaywright: زرّ الإيقاف يحلّ محلّ زرّ الإرسال في الموضع نفسه لحظة الإرسال، فنقرة ثانية بعد ١٥٠ مل
// (نقرة مزدوجة أو نقرة تأكيد) تصل الإيقاف وتقطع الطلب قبل أوّل حرف.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const voice = read('js/app-07-voice.js');
const attach = read('js/app-09-attach.js');

/* يستخرج معالج زرّ الإيقاف كما هو في المصدر ويشغّله في سياق معزول ببدائل للعناصر العامّة. */
function runStopClick({ startedAt, now, controller }) {
  const h0 = voice.indexOf('function __omranShownRunStartedAt(){');
  const i = voice.indexOf('btnStop.onclick = () => {');
  assert.ok(h0 > 0 && i > h0, 'دالّة وقت البدء ومعالج زرّ الإيقاف موجودان');
  const j = voice.indexOf('\n};', i);
  const handler = voice.slice(h0, j + 3);
  const grace = Number((voice.match(/const __OMRAN_STOP_GRACE_MS = (\d+);/) || [])[1]);
  assert.ok(grace > 0, 'مهلة السماح معرَّفة');
  const calls = { speak: 0 };
  const ctx = {
    btnStop: {},
    stopAllSpeaking: () => { calls.speak++; },
    isListening: false,
    recognizer: null,
    genAbortController: controller,
    state: { currentId: 'p1' },
    __omranRuns: startedAt ? { p1: { pid: 'p1', ctl: controller, t0: startedAt } } : {},
    __swallow: () => {},
    __OMRAN_STOP_GRACE_MS: grace,
    Date: { now: () => now },
  };
  vm.createContext(ctx);
  vm.runInContext(handler, ctx);
  ctx.btnStop.onclick();
  return { calls, grace };
}
const spyController = () => { const c = { aborted: 0, abort() { this.aborted++; } }; return c; };

test('a second click within the grace window (double-click / nervous re-click) does not abort the request', () => {
  const c = spyController();
  const { calls, grace } = runStopClick({ startedAt: 10000, now: 10150, controller: c });
  assert.equal(c.aborted, 0, 'لا إيقاف خلال مهلة السماح');
  assert.equal(calls.speak, 1, 'إسكات النطق يبقى كما كان');
  assert.ok(grace >= 700 && grace <= 1500, 'المهلة قصيرة: تغطّي النقرة المزدوجة ولا تؤخّر إيقافًا مقصودًا (' + grace + ')');
});

test('a click after the grace window still stops the request as before', () => {
  const c = spyController();
  runStopClick({ startedAt: 10000, now: 11500, controller: c });
  assert.equal(c.aborted, 1, 'الإيقاف يعمل بعد المهلة');
});

test('no recorded start (watchdog not armed) keeps the old immediate stop; no controller = nothing to abort', () => {
  const c = spyController();
  runStopClick({ startedAt: 0, now: 10050, controller: c });
  assert.equal(c.aborted, 1, 'بلا وقت بدء مسجَّل: السلوك القديم');
  assert.doesNotThrow(() => runStopClick({ startedAt: 10000, now: 10050, controller: null }), 'بلا طلب جارٍ لا يرمي');
});

test('the start time is recorded the moment the stop button takes the send button\'s place', () => {
  // v-parallel-chats: كلّ محادثة لها تشغيلها؛ البدء يسجّل t0 ثمّ يضيء الإيقاف ويعكس genAbortController للمحادثة المعروضة
  assert.ok(attach.includes("var r = { pid: String(pid), ctl: ctl, t0: Date.now(),"), 'التشغيل يسجّل وقت بدئه');
  assert.ok(/function __omranRunStart\(pid, ctl\)\{[\s\S]{0,400}__omranSyncRunView\(\);/.test(attach), 'البدء يزامن الواجهة (إضاءة الإيقاف)');
  assert.ok(attach.includes('genAbortController = r ? r.ctl : null;') && attach.includes("if(stop) stop.classList.add('live');"), 'المرآة والإضاءة للمحادثة المعروضة');
  assert.ok(/var __omranRuns = \{\};/.test(attach), 'سجلّ التشغيلات عامّ في الحزمة فيقرؤه المعالج');
  // تشغيل في محادثة أخرى لا يمنح مهلة سماح لمتحكّم المحادثة المعروضة
  const c = spyController();
  const other = { aborted: 0, abort() { this.aborted++; } };
  const i0 = voice.indexOf('function __omranShownRunStartedAt(){'), j0 = voice.indexOf('\n};', voice.indexOf('btnStop.onclick = () => {'));
  const ctx = { btnStop: {}, stopAllSpeaking() {}, isListening: false, recognizer: null, genAbortController: c, state: { currentId: 'p1' },
    __omranRuns: { p1: { ctl: other, t0: 10000 } }, __swallow() {}, __OMRAN_STOP_GRACE_MS: 1000, Date: { now: () => 10100 } };
  vm.createContext(ctx); vm.runInContext(voice.slice(i0, j0 + 3), ctx); ctx.btnStop.onclick();
  assert.equal(c.aborted, 1, 'متحكّم لا يطابق تشغيل المحادثة المعروضة = إيقاف فوريّ كما كان');
  const tokens = read('css/tokens.css');
  assert.ok(tokens.includes('#btnStop.live + #btnSend{display:none;}'), 'سبب الفخّ: زرّ الإيقاف يحلّ محلّ الإرسال في الموضع نفسه');
});
