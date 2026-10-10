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
  const i = voice.indexOf('btnStop.onclick = () => {');
  assert.ok(i > 0, 'معالج زرّ الإيقاف موجود');
  const j = voice.indexOf('\n};', i);
  const handler = voice.slice(i, j + 3);
  const grace = Number((voice.match(/const __OMRAN_STOP_GRACE_MS = (\d+);/) || [])[1]);
  assert.ok(grace > 0, 'مهلة السماح معرَّفة');
  const calls = { speak: 0 };
  const ctx = {
    btnStop: {},
    stopAllSpeaking: () => { calls.speak++; },
    isListening: false,
    recognizer: null,
    genAbortController: controller,
    __omranReqStartedAt: startedAt,
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
  assert.ok(attach.includes("  genAbortController = new AbortController();\n  btnStop.classList.add('live');\n  __omranArmWatchdog();"), 'الحارس يُسلَّح (ويسجّل وقت البدء) مع إضاءة زرّ الإيقاف');
  assert.ok(attach.includes('__omranReqStartedAt = Date.now();'), 'وقت البدء يُسجَّل في تسليح الحارس');
  assert.ok(/var __omranWdTimer = null, __omranWdWake = null, __omranReqStartedAt = 0;/.test(attach), 'المتغيّر عامّ في الحزمة فيقرؤه المعالج');
  const tokens = read('css/tokens.css');
  assert.ok(tokens.includes('#btnStop.live + #btnSend{display:none;}'), 'سبب الفخّ: زرّ الإيقاف يحلّ محلّ الإرسال في الموضع نفسه');
});
