'use strict';
/* v-maha-long-reply (المالك ٣ أكتوبر: «مها الصوتيه تتحدث وبعد اقل من دقيقة يسكر مفتاح مها»):
   مراقبة السكوت (v-maha-band، ٢٠ث) كانت تُنهي المكالمة ومها تتكلّم:
   ١) response.done يصل حين ينتهي التوليد — قبل انتهاء تشغيل الصوت بكثير — فكانت الحالة تعود «انتظار»
      ومها ما زالت تتكلّم، فبعد ٢٠ث من بدء كلامها تُقفل المكالمة في منتصف الجملة.
   ٢) النشاط كان يُسجَّل عند دخول «تتكلّم» لا عند الخروج منها — فردّ أطول من ٢٠ث يُقفل لحظة انتهائه.
   الآن: الانتظار بعد انتهاء التشغيل فعلًا (output_audio_buffer.stopped/cleared)، والمهلة من لحظة دخول الانتظار. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function sim(file) {
  const src = read(file);
  const setState = src.slice(src.indexOf('function mahaSetState(state, customLabel){'), src.indexOf('\n}\n', src.indexOf('function mahaSetState(state, customLabel){')) + 3);
  const watch = src.slice(src.indexOf('const MAHA_SILENCE_END_MS = 20000;'), src.indexOf('function mahaEndCall(){'));
  const a = src.indexOf("dc.addEventListener('message', (e) => {");
  const listener = src.slice(a, src.indexOf('const offer = await pc.createOffer();', a));
  let now = 1000;
  const intervals = [];
  const ctx = {
    mahaCallActive: true, mahaCallMode: 'assistant', mahaState: 'idle', mahaLastActivity: 0, mahaRtNatural: true, mahaRtPlaying: false, ended: 0,
    mahaOrbEl: null, mahaWaveEl: null, mahaStateLabelEl: null, t: (k) => k,
    Date: { now: () => now },
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: (f) => { intervals.push(f); return intervals.length; }, clearInterval: () => { intervals.length = 0; },
    rtSessionReadySeen: false, resolveRtSessionReady() {}, mahaClearRtResponseWatchdog() {}, mahaArmRtResponseWatchdog() {}, mahaHandleRtFunctionCall() {},
    console: { error() {} },
    dc: { addEventListener(type, fn) { ctx.on = fn; } },
  };
  vm.createContext(ctx);
  vm.runInContext(setState + watch + listener + '\nfunction mahaEndCall(){ ended++; mahaCallActive = false; mahaStopCloseWatch(); }', ctx);
  vm.runInContext('mahaStartCloseWatch();', ctx);
  const fire = (type) => ctx.on({ data: JSON.stringify({ type }) });
  const advanceTo = (t) => { while (now < t) { now += 1000; intervals.slice().forEach((f) => f()); } };
  return { ctx, fire, advanceTo, state: () => vm.runInContext('mahaState', ctx), ended: () => vm.runInContext('ended', ctx) };
}

for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
  test(f + ': ردّ طويل (٣٥ث) لا يُقفل في منتصفه ولا لحظة انتهائه — والسكوت بعده يُقفل بعد ٢٠ث كما كان', () => {
    const s = sim(f);
    s.fire('input_audio_buffer.speech_started');
    s.advanceTo(3000); s.fire('input_audio_buffer.speech_stopped');
    s.fire('response.created');
    s.advanceTo(3500); s.fire('output_audio_buffer.started');
    s.advanceTo(6000); s.fire('response.done'); // التوليد انتهى، والصوت ما زال يُشغَّل
    assert.equal(s.state(), 'speaking', 'response.done لا يقطع «تتكلّم» والصوت شغّال');
    s.advanceTo(40000);
    assert.equal(s.ended(), 0, 'مها تتكلّم ٣٥ث — المكالمة باقية');
    s.fire('output_audio_buffer.stopped');
    assert.equal(s.state(), 'listening');
    s.advanceTo(45000);
    assert.equal(s.ended(), 0, 'لا إقفال لحظة انتهاء ردّها الطويل');
    s.advanceTo(62000);
    assert.equal(s.ended(), 1, 'سكوت ٢٠ث بعد ردّها = إقفال (v-maha-band كما هو)');
  });

  test(f + ': المقاطعة (cleared) تعيد الانتظار، وresponse.done بلا صوت (ردّ أداة) يعيده كما كان', () => {
    const s = sim(f);
    s.fire('output_audio_buffer.started');
    s.fire('output_audio_buffer.cleared');
    assert.equal(s.state(), 'listening', 'قاطعها المستخدم');
    s.fire('response.created');
    s.fire('response.done');
    assert.equal(s.state(), 'listening', 'ردّ بلا صوت لا يعلق في «تفكّر»');
  });
}
