'use strict';
/* أوامر المالك ٢١ أكتوبر بعد #1207 — اختبار لكلّ نقطة، والكود الحقيقيّ من app-08 يُشغَّل في vm:
   ١) v-maha-unlock-wav: صوت التفعيل في mahaUnlockAudio كان mp3 مبتورًا لا يُفكّ → WAV صالح.
   ٢) v-maha-start-seq: نغمة الجاهزية لا يلقطها المايك — لا نغمة إن كانت مها ستتكلّم، وإلّا تُعزف والمايك مقفل ثمّ يُفتح.
   ٣) v-maha-first-heard: أوّل ردّ أُلغي قبل أن يُسمع ولا ردّ بعده ولا كلام جارٍ → يُطلب مرّة واحدة (التحيّة، أو ردّ على كلام حقيقيّ).
   ٤) كلام التجهيز يأخذ ردًّا مسموعًا من أوّل مرّة: الطلب بعد أن يشتغل الصوت، ويُراقَب كأوّل ردّ.
   الشرط: أوّل ردّ ينسمع دايمًا، بدون تحيّة مرّتين ولا صوت مكرّر. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-08-maha.js');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return s.slice(i, j + b.length); };
const flush = () => new Promise((r) => setImmediate(r));

// ───────── ١) صوت التفعيل ─────────
test('١. mahaUnlockAudio يشغّل صمت WAV صالحًا داخل الضغطة — لا mp3 مبتور في المصدر ولا الحزمة', () => {
  const block = between(SRC, 'const MAHA_SILENT_WAV = ', "__swallow(e, 'maha:goldwave-prime'); } // v-maha-goldwave\n}");
  const el = { src: '', plays: 0, play() { this.plays++; return Promise.resolve(); } };
  const ctx = { mahaAudioEl: el, window: {}, __swallow() {} };
  vm.createContext(ctx);
  vm.runInContext(block + '\nmahaUnlockAudio();', ctx);
  assert.equal(el.plays, 1);
  assert.match(el.src, /^data:audio\/wav;base64,/);
  const b = Buffer.from(el.src.split(',')[1], 'base64');
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(b.readUInt16LE(20), 1, 'PCM');
  assert.equal(b.readUInt32LE(40), b.length - 44, 'طول البيانات مطابق (الـmp3 القديم كان مبتورًا)');
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    assert.ok(!read(f).includes('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0U'), f + ': الـmp3 المبتور زال');
    assert.ok(read(f).includes('mahaAudioEl.src = MAHA_SILENT_WAV;') && read(f).includes('el.src = MAHA_SILENT_WAV;'), f + ': التفعيلان من الصمت نفسه');
  }
});

// ───────── ٢) تسلسل بداية المكالمة: الكتلة الحقيقيّة من الإفراغ حتّى التحيّة ─────────
// تُستخرج عند كلّ اختبار لا عند التحميل — فيفشل كلّ بند وحده على كود قديم
const SEQ = () => between(SRC, 'const preBufSent = mahaFlushPreBuffer(dc);', "__swallow(e, 'maha:greet'); }\n        });\n      }");
async function runSeq(o = {}) {
  const log = [];
  const track = { _on: false };
  Object.defineProperty(track, 'enabled', { get() { return this._on; }, set(v) { this._on = v; log.push(['mic', v]); } });
  const dc = { readyState: 'open', send: (m) => { const j = JSON.parse(m); log.push(['send', j.type, !!(j.response && j.response.instructions)]); } };
  const ctx = {
    dc, mahaRtDc: dc, inputTrack: track, lang: 'ar', __swallow() {},
    preBufArg: !!o.preBuf, mahaRtReconnecting: !!o.reconnect, mahaCallMode: o.builder ? 'builder' : 'assistant',
    mahaRtCancelled: false, mahaRtReady: false, mahaRtAudioOk: true, mahaRtResponded: !!o.responded, mahaRtResponseWatchdog: o.watchdog || null, mahaRtFirst: null, MAHA_BEEP_CLEAR_MS: BEEP_CLEAR,
    mahaFlushPreBuffer: () => { log.push(['flush']); return !!o.preBuf; },
    mahaPlayReadyBeep: () => { log.push(['beep', track.enabled]); if (o.cancelDuringBeep) ctx.mahaRtCancelled = true; return o.beepMs === undefined ? BEEP_CLEAR : o.beepMs; },
    setTimeout: (fn, ms) => { log.push(['wait', ms]); if (o.cancelAfterMic && track.enabled) ctx.mahaRtCancelled = true; setImmediate(fn); return 1; },
    mahaRtTrace() {}, mahaSetState() {},
    mahaRtFirstStart: (d, real) => { log.push(['watch', real]); ctx.mahaRtFirst = { dc: d, greetMsg: '' }; },
    mahaRtWhenAudio: (fn) => { if (o.audioLater) { ctx.later = fn; log.push(['wait-audio']); } else fn(); },
    mahaArmRtResponseWatchdog: (ms) => log.push(['arm', ms]),
  };
  vm.createContext(ctx);
  let err = null;
  try { await vm.runInContext('(async () => {\n' + SEQ() + '\n})()', ctx); } catch (e) { err = e; }
  return { log, ctx, err };
}
const idx = (log, k) => log.findIndex((e) => e[0] === k);
const BEEP_CLEAR = Number((/const MAHA_BEEP_CLEAR_MS = (\d+);/.exec(SRC) || [])[1]);

test('٢أ. مكالمة مها: لا نغمة إطلاقًا (التحيّة هي الإشارة)، المايك يُفتح، والتحيّة مرّة واحدة وتُحفظ لإعادتها', async () => {
  const { log, ctx } = await runSeq();
  assert.equal(idx(log, 'beep'), -1, 'لا نغمة قبل التحيّة يسمعها كشف الكلام');
  assert.ok(idx(log, 'mic') > idx(log, 'flush'));
  assert.deepEqual(log.filter((e) => e[0] === 'send'), [['send', 'response.create', true]], 'تحيّة واحدة');
  assert.deepEqual(log.find((e) => e[0] === 'watch'), ['watch', false]);
  assert.ok(ctx.mahaRtFirst.greetMsg.includes('greet the user warmly'), 'نصّ التحيّة محفوظ للإعادة');
  assert.equal(ctx.mahaRtReady, true);
});

test('٢ب. البنّاء وإعادة الاتّصال: النغمة تُعزف والمايك مقفل، ثمّ انتظار ذيلها ٢٥٠م.ث، ثمّ يُفتح — ولا تحيّة ولا مراقبة', async () => {
  for (const o of [{ builder: true }, { reconnect: true }]) {
    const { log } = await runSeq(o);
    const beep = log.find((e) => e[0] === 'beep');
    assert.ok(beep, JSON.stringify(o));
    assert.equal(beep[1], false, 'المايك مقفل لحظة النغمة');
    const b = idx(log, 'beep'), w = log.findIndex((e, i) => i > b && e[0] === 'wait' && e[1] === 250), m = idx(log, 'mic');
    assert.ok(idx(log, 'flush') < b && b < w && w < m, 'إفراغ ← نغمة ← ذيلها ← فتح المايك: ' + JSON.stringify(log));
    assert.equal(log.filter((e) => e[0] === 'send').length, 0, 'لا تحيّة');
    assert.equal(idx(log, 'watch'), -1);
  }
});

test('٢ج. انتهت المكالمة أثناء النغمة ← لا يُفتح المايك ولا تُعلن جاهزيّة (لا تُحيا جلسة ميتة)', async () => {
  const { log, ctx, err } = await runSeq({ builder: true, cancelDuringBeep: true });
  assert.match(String(err && err.message), /cancelled/);
  assert.equal(idx(log, 'mic'), -1);
  assert.equal(ctx.mahaRtReady, false);
});

test('٢و. انتهت المكالمة في مهلة ما بعد فتح المايك ← لا جاهزيّة ولا مراقبة ولا طلب معلّق يبقى لمكالمة تالية', async () => {
  for (const o of [{}, { preBuf: true, audioLater: true }]) {
    const { log, ctx, err } = await runSeq(Object.assign({ cancelAfterMic: true }, o));
    assert.match(String(err && err.message), /cancelled/, JSON.stringify(o));
    assert.equal(ctx.mahaRtReady, false);
    assert.equal(idx(log, 'watch'), -1);
    assert.equal(idx(log, 'wait-audio'), -1, 'لا شيء في خانة «حين يشتغل الصوت»');
    assert.equal(log.filter((e) => e[0] === 'send').length, 0);
  }
});

test('٤أ. كلام التجهيز: لا نغمة ولا تحيّة، والطلب ينتظر أن يشتغل الصوت، وأوّل ردّ يُراقَب ككلام حقيقيّ', async () => {
  const { log, ctx } = await runSeq({ preBuf: true, audioLater: true });
  assert.equal(idx(log, 'beep'), -1, 'لا نغمة تقطع ردّها');
  assert.equal(log.filter((e) => e[0] === 'send').length, 0, 'لا تحيّة');
  assert.deepEqual(log.find((e) => e[0] === 'watch'), ['watch', true]);
  assert.equal(idx(log, 'arm'), -1, 'لا طلب والصوت لم يشتغل');
  ctx.later();
  assert.deepEqual(log.at(-1), ['arm', 900], 'بعد أن يشتغل: الحارس نفسه (٩٠٠م.ث)');
});

// ───────── ٣ و٤) مراقبة أوّل ردّ: الدوالّ الحقيقيّة بساعة ومؤقّتات مزيّفة ─────────
const WAV = () => (/const MAHA_SILENT_WAV = '([^']+)';/.exec(SRC) || [])[1] || '';
const HELPERS = () => between(SRC, 'let mahaRtAudioOk = false', "__swallow(err, 'maha:rt-note'); }\n}");
// حارس ردّ العميل الحقيقيّ (يُسلَّح عند speech_stopped بعد ٠٫٣٥/١٫٥ث) — هو أوّل من يطلب ردًّا بعد قطع التحيّة
const WATCHDOG = () => between(SRC, 'let mahaRtResponseWatchdog = null;', '"misc:app-08-maha#rt-response-watchdog"); }\n    }, delayMs);\n    }');
const GREET = JSON.stringify({ type: 'response.create', response: { instructions: 'greet the user warmly' } });
function watcher({ real = false, greet = true, audioOk = true } = {}) {
  const env = { now: 0, timers: [], sent: [] };
  const dc = { readyState: 'open', send: (m) => env.sent.push(m) };
  const ctx = {
    document: { createElement: () => ({ setAttribute() {}, addEventListener() {} }), visibilityState: 'visible' },
    performance: { now: () => env.now },
    localStorage: { setItem() {} },
    setTimeout: (fn, ms) => { env.timers.push({ fn, ms }); return env.timers.length; },
    clearTimeout: (id) => { if (id && env.timers[id - 1]) env.timers[id - 1].fn = null; },
    __swallow() {}, JSON, Math, Promise, String, Error,
  };
  vm.createContext(ctx);
  vm.runInContext('const MAHA_SILENT_WAV = ' + JSON.stringify(WAV()) + '; let mahaRtAudioEl = null, mahaRtDc = null, mahaRtPlaying = false; var mahaCallActive = true, mahaRtReady = true; let mahaMicMeterCtx = { state: "running" }, mahaMicMeterRaf = 1;\n' + HELPERS()
    + '\n' + WATCHDOG()
    + '\nglobalThis.api = { setDc(d){ mahaRtDc = d; }, setPlaying(v){ mahaRtPlaying = v; }, setVoice(ms, at){ mahaMicVoiced.push([at === undefined ? performance.now() : at, ms]); }, meterDead(){ mahaMicMeterCtx = null; }, gap(){ mahaMicGapAt = performance.now(); }, tick(){ mahaMicLastTick = performance.now(); }, get first(){ return mahaRtFirst; }, get log(){ return mahaRtLog; },'
    + ' mahaRtFirstStart, mahaRtFirstStop, mahaRtSetAudioOk, mahaRtNoteEvent, arm: mahaArmRtResponseWatchdog, clearArm: mahaClearRtResponseWatchdog };', ctx);
  const api = ctx.api;
  api.setDc(dc);
  if (audioOk) api.mahaRtSetAudioOk();
  api.mahaRtFirstStart(dc, real);
  if (greet) { dc.send(GREET); api.first.greetMsg = GREET; env.sent.length = 0; } // التحيّة أُرسلت عند الجاهزية
  env.ticking = true;
  const ev = (o, at) => { if (typeof at === 'number') env.now = at; if (env.ticking) api.tick(); api.mahaRtNoteEvent({ data: JSON.stringify(o) }); };
  const live = () => env.timers.filter((t) => t.fn).map((t) => t.ms);
  // كلّ المؤقّتات الحيّة الآن، بترتيب تسليحها؛ ما أُلغي أثناء الجولة لا يعمل (كالمتصفّح)، وما سُلِّح أثناءها ينتظر الجولة التالية
  const fire = () => { let n = 0; for (const t of env.timers.filter((x) => x.fn)) { const f = t.fn; if (!f) continue; t.fn = null; f(); n++; } return n; };
  const types = () => env.sent.map((m) => { const j = JSON.parse(m); return j.response && j.response.instructions ? 'greet' : j.type; });
  return { env, api, ev, live, fire, types, ctx };
}
const created = (id) => ({ type: 'response.created', response: { id } });
const done = (id, status = 'completed', reason) => ({ type: 'response.done', response: { id, status, status_details: reason ? { reason } : undefined } });

test('٣أ. التحيّة قُطعت قبل صوتها بصدى/ضجيج قصير ولا ردّ بعدها ← تُعاد مرّة واحدة بالطلب نفسه بعد ١٫٨ث، ثمّ لا شيء', () => {
  const w = watcher();
  w.ev(created('r1'), 0);
  w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 1000 }, 100);
  w.ev(done('r1', 'cancelled', 'turn_detected'), 120);
  assert.deepEqual(w.live(), [], 'كلام جارٍ — لا مؤقّت قبل speech_stopped');
  w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 1150 }, 260);
  assert.deepEqual(w.live(), [1800]);
  w.fire();
  assert.deepEqual(w.types(), ['greet'], 'التحيّة نفسها مرّة واحدة');
  assert.equal(w.env.sent[0], GREET);
  assert.ok(w.api.log.some((l) => / recover greet$/.test(l)));
  // التحيّة المعادة تُسمع
  w.ev(created('r2'), 2200);
  w.ev({ type: 'output_audio_buffer.started', response_id: 'r2' }, 2500);
  w.ev(done('r2'), 2600);
  w.ev({ type: 'output_audio_buffer.stopped', response_id: 'r2' }, 4000);
  assert.equal(w.api.first.heard, true);
  assert.ok(w.api.log.some((l) => / first heard$/.test(l)));
  w.ev(created('r3'), 5000);
  w.ev(done('r3', 'cancelled'), 5100);
  w.fire();
  assert.equal(w.env.sent.length, 1, 'لا تحيّة مرّتين');
});

test('٣ب. الوضع الطبيعيّ: الخادم ردّ آليًّا على ضجيج قطع التحيّة ← يُلغى ردّه قبل صوته، والتحيّة بعد انتهائه — مرّة، بلا صوتين', () => {
  const w = watcher();
  w.ev(created('r1'), 0);
  w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, 50);
  w.ev(done('r1', 'cancelled', 'turn_detected'), 60);
  w.api.setVoice(40); // ومضة في المايك لا كلام
  w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 2200 }, 300); // مدّة الخادم تشمل الحشو والصمت — لا يُحكم بها
  w.ev(created('r2'), 700); // create_response:true — ردّ الخادم على الضجيج
  assert.deepEqual(w.env.sent.map((m) => JSON.parse(m)), [{ type: 'response.cancel', response_id: 'r2' }, { type: 'output_audio_buffer.clear' }], 'يُلغى ردّ الضجيج فورًا ويُمسح ما تولّد منه (WebRTC)');
  assert.deepEqual(w.live(), [], 'لا مؤقّت ولا حارس بعده');
  w.ev({ type: 'output_audio_buffer.started', response_id: 'r2' }, 750); // لو تسرّب شيء منه لا يُحسب «مسموعًا»
  assert.equal(w.api.first.started, 0);
  w.ev(done('r2', 'cancelled', 'client_cancelled'), 760);
  assert.deepEqual(w.types(), ['response.cancel', 'output_audio_buffer.clear', 'greet'], 'التحيّة بعد انتهاء المُلغى — لا ردّان نشطان');
  assert.equal(w.env.sent[2], GREET);
  w.ev(created('r3'), 850);
  w.ev({ type: 'output_audio_buffer.started', response_id: 'r3' }, 1100);
  w.ev({ type: 'output_audio_buffer.stopped', response_id: 'r3' }, 2600);
  assert.equal(w.api.first.heard, true);
  w.fire();
  assert.equal(w.env.sent.length, 3, 'إلغاء ومسح وتحيّة واحدة فقط');
  assert.ok(w.api.log.some((l) => / recover greet \(swap\)$/.test(l)) && w.api.log.some((l) => / greet resent$/.test(l)));
});

test('٣ب٢. كلام حقيقيّ قطع التحيّة والخادم ردّ عليه ← ردّه يبقى (لا إلغاء ولا تحيّة)، وهو أوّل ما يُسمع؛ ومؤشّر لا يعمل = كلام حقيقيّ', () => {
  for (const dead of [false, true]) {
    const w = watcher();
    if (dead) w.api.meterDead(); else w.api.setVoice(0);
    w.ev(created('r1'), 0);
    w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, 50);
    w.ev(done('r1', 'cancelled', 'turn_detected'), 60);
    if (!dead) w.api.setVoice(700);
    w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 2900 }, 1300);
    w.ev(created('r2'), 1400);
    assert.deepEqual(w.env.sent, [], 'dead=' + dead + ': لا إلغاء لردّ على كلام فعليّ');
    assert.deepEqual(w.live(), []);
    w.ev({ type: 'output_audio_buffer.started', response_id: 'r2' }, 1700);
    w.ev({ type: 'output_audio_buffer.stopped', response_id: 'r2' }, 3500);
    assert.equal(w.api.first.heard, true);
  }
});

test('٣ي. الكلام يُقاس من قبل وصول speech_started بـ٤٠٠م.ث (الحدث يتأخّر عن بدء الكلام): «هلا» قصيرة كاملة قبل الحدث = كلام حقيقيّ', () => {
  const run = (voiceAt, startedAt) => {
    const w = watcher();
    w.ev(created('r1'), 0);
    w.api.setVoice(350, voiceAt); // «هلا» كلّها قبل أن يصل الحدث
    w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, startedAt);
    w.ev(done('r1', 'cancelled', 'turn_detected'), startedAt + 10);
    w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 2400 }, startedAt + 150);
    return w.api.first.real;
  };
  assert.equal(run(100, 400), true, 'صوت قبل الحدث بـ٣٠٠م.ث يُحسب');
  assert.equal(run(100, 900), false, 'صوت قبل الحدث بـ٨٠٠م.ث (قبل النافذة) لا يُحسب');
});

test('٣ك. المؤشّر لا يقيس ← كلام حقيقيّ دائمًا (لا يُلغى ردّ على كلام فعليّ): صفحة مخفيّة، أو حلقة توقّفت لحظة أثناء الكلام، أو لم تدر للتوّ', () => {
  const run = (spoil) => {
    const w = watcher();
    w.ev(created('r1'), 0);
    w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, 50);
    w.ev(done('r1', 'cancelled', 'turn_detected'), 60);
    spoil(w);
    w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 2400 }, 900);
    w.ev(created('r2'), 1000);
    return { real: w.api.first.real, sent: w.env.sent.length };
  };
  assert.deepEqual(run(() => {}), { real: false, sent: 2 }, 'المرجع: مؤشّر حيّ بلا صوت = ضجيج ← إلغاء ومسح');
  assert.deepEqual(run((w) => { w.ctx.document.visibilityState = 'hidden'; }), { real: true, sent: 0 }, 'صفحة مخفيّة');
  assert.deepEqual(run((w) => { w.env.now = 500; w.api.gap(); }), { real: true, sent: 0 }, 'فجوة إطارات أثناء الكلام');
  assert.deepEqual(run((w) => { w.env.ticking = false; w.env.now = 600; w.api.tick(); }), { real: true, sent: 0 }, 'آخر إطار قبل ٣٠٠م.ث من speech_stopped');
});

test('٣ل. كلام جديد بدأ بين إلغاء ردّ الضجيج وانتهائه ← لا تحيّة فوقه؛ الإعادة تعود محفوظة ويحكم ما بعده (ضجيج ← تبديل ثانٍ، كلام ← ردّه يبقى)', () => {
  for (const realAfter of [false, true]) {
    const w = watcher();
    w.ev(created('r1'), 0);
    w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, 50);
    w.ev(done('r1', 'cancelled', 'turn_detected'), 60);
    w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 2200 }, 300);
    w.ev(created('r2'), 700);
    w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 3000 }, 720); // بدأ يتكلّم
    w.ev(done('r2', 'cancelled', 'client_cancelled'), 760);
    assert.deepEqual(w.types(), ['response.cancel', 'output_audio_buffer.clear'], 'لا تحيّة وهو يتكلّم');
    assert.ok(w.api.log.some((l) => l.endsWith(' swap held (speaking)')));
    if (realAfter) w.api.setVoice(900);
    w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 5000 }, 1900);
    w.ev(created('r3'), 2000);
    if (realAfter) {
      assert.deepEqual(w.types(), ['response.cancel', 'output_audio_buffer.clear'], 'ردّ على كلامه الحقيقيّ يبقى');
      w.ev({ type: 'output_audio_buffer.started', response_id: 'r3' }, 2300);
      w.ev({ type: 'output_audio_buffer.stopped', response_id: 'r3' }, 4000);
      assert.equal(w.api.first.heard, true);
    } else {
      w.ev(done('r3', 'cancelled', 'client_cancelled'), 2050);
      assert.deepEqual(w.types(), ['response.cancel', 'output_audio_buffer.clear', 'response.cancel', 'output_audio_buffer.clear', 'greet'], 'تبديل ثانٍ ثمّ تحيّة واحدة');
    }
  }
});

test('٣م. صوت الردّ بدأ قبل أن يشتغل العنصر ثمّ اشتغل وسمع منه ٥٠٠م.ث فأكثر ← سُمع (لا إعادة تكرّر كلامًا سُمع)؛ أقلّ من ذلك ← لم يُسمع', () => {
  const run = (okAt, stopAt) => {
    const w = watcher({ audioOk: false });
    w.ev(created('r1'), 0);
    w.ev({ type: 'output_audio_buffer.started', response_id: 'r1' }, 100);
    w.env.now = okAt;
    w.api.mahaRtSetAudioOk();
    w.ev(done('r1'), okAt + 10);
    w.ev({ type: 'output_audio_buffer.stopped', response_id: 'r1' }, stopAt);
    return w.api.first.heard;
  };
  assert.equal(run(200, 1600), true, 'اشتغل بعد ١٠٠م.ث وسُمع ١٫٤ث');
  assert.equal(run(1300, 1600), false, 'اشتغل في آخر ٣٠٠م.ث فقط');
});

test('٣ج. سُمعت: انتهى صوتها، أو قوطعت بعد ٥٠٠م.ث (المستخدم سمع وقاطع) ← لا إعادة', () => {
  const a = watcher();
  a.ev(created('r1'), 0);
  a.ev({ type: 'output_audio_buffer.started', response_id: 'r1' }, 300);
  a.ev(done('r1'), 400);
  a.ev({ type: 'output_audio_buffer.stopped', response_id: 'r1' }, 2300);
  assert.equal(a.api.first.heard, true);
  const b = watcher();
  b.ev(created('r1'), 0);
  b.ev({ type: 'output_audio_buffer.started', response_id: 'r1' }, 300);
  b.ev({ type: 'output_audio_buffer.cleared', response_id: 'r1' }, 1200);
  b.ev(done('r1', 'cancelled', 'turn_detected'), 1210);
  assert.equal(b.api.first.heard, true);
  assert.equal(b.fire(), 0);
  assert.deepEqual(b.env.sent, []);
});

test('٣د. قُطعت في أوّل صوتها (٢٠٠م.ث، صدى بدايتها) ← لم تُسمع ← إعادة مرّة؛ وبدأ صوتها والعنصر لم يشتغل ← لم تُسمع', () => {
  const a = watcher();
  a.ev(created('r1'), 0);
  a.ev({ type: 'output_audio_buffer.started', response_id: 'r1' }, 300);
  a.ev({ type: 'output_audio_buffer.cleared', response_id: 'r1' }, 500);
  a.ev(done('r1', 'cancelled', 'turn_detected'), 510);
  assert.deepEqual(a.live(), [1800]);
  a.fire();
  assert.deepEqual(a.types(), ['greet']);
  const b = watcher({ audioOk: false });
  b.ev(created('r1'), 0);
  b.ev({ type: 'output_audio_buffer.started', response_id: 'r1' }, 300);
  b.ev(done('r1'), 400);
  b.ev({ type: 'output_audio_buffer.stopped', response_id: 'r1' }, 2000);
  assert.equal(b.api.first.heard, false, 'صوت أُرسل إلى عنصر متوقّف لا يُعدّ مسموعًا');
  b.fire();
  assert.deepEqual(b.env.sent, [], 'لا طلب والعنصر لم يشتغل — يُؤجَّل');
  b.api.mahaRtSetAudioOk();
  b.fire();
  assert.deepEqual(b.types(), ['greet'], 'بعد أن يشتغل: مرّة واحدة');
});

test('٣هـ. كلام حقيقيّ من المستخدم (٤٠٠م.ث فأكثر ومايكه يصل) ولم يأتِ ردّ ← ردّ عاديّ على كلامه لا تحيّة', () => {
  const w = watcher();
  w.ev(created('r1'), 0);
  w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, 10);
  w.ev(done('r1', 'cancelled', 'turn_detected'), 20);
  w.api.setVoice(650); // ٦٥٠م.ث صوت فعليّ في المايك
  w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 900 }, 950);
  w.fire();
  assert.deepEqual(w.types(), ['response.create'], 'ردّ على كلامه، بلا تعليمات تحيّة');
  // مدّة طويلة لكن المايك لا يصل (صدى بعد إلغائه) ← ليس كلامًا حقيقيًّا ← التحيّة
  const e = watcher();
  e.ev(created('r1'), 0);
  e.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, 10);
  e.ev(done('r1', 'cancelled'), 20);
  e.api.setVoice(40); // ومضة لا كلام
  e.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 900 }, 950);
  e.fire();
  assert.deepEqual(e.types(), ['greet']);
});

test('٣و. ردّ واحد في كلّ لحظة: صوت يُشغَّل عند حلول المؤقّت ← لا طلب الآن؛ وإنهاء المكالمة يلغي الإعادة', () => {
  const w = watcher();
  w.ev(created('r1'), 0);
  w.ev(done('r1', 'failed'), 100);
  w.api.setPlaying(true);
  w.fire();
  assert.deepEqual(w.env.sent, [], 'لا طلب وصوت يُشغَّل');
  assert.deepEqual(w.live(), [1800], 'يُعاد التسليح');
  w.api.setPlaying(false);
  w.fire();
  assert.deepEqual(w.types(), ['greet']);
  const s = watcher();
  s.ev(created('r1'), 0);
  s.ev(done('r1', 'cancelled'), 100);
  s.api.mahaRtFirstStop();
  s.fire();
  assert.deepEqual(s.env.sent, [], 'جلسة انتهت');
  const d = watcher();
  d.ev(created('r1'), 0);
  d.ev(done('r1', 'cancelled'), 100);
  d.api.setDc({ readyState: 'open', send() { throw new Error('جلسة أخرى'); } });
  d.fire();
  assert.deepEqual(d.env.sent, [], 'إعادة اتّصال: لا طلب على قناة أخرى');
});

test('٣ز. المسار الحقيقيّ بعد القطع: حارس العميل (١٫٥ث بعد speech_stopped) يأخذ الإعادة — التحيّة لا ردّ على الصدى، وطلب واحد فقط', () => {
  const w = watcher();
  w.ev(created('r1'), 0);
  w.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 1000 }, 80);
  w.ev(done('r1', 'cancelled', 'turn_detected'), 100);
  w.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 1140 }, 230);
  w.api.arm(1500); // ما يفعله مستمع speech_stopped في الوضع الطبيعيّ
  assert.deepEqual(w.live().sort(), [1500, 1800]);
  const t1500 = w.env.timers.find((t) => t.fn && t.ms === 1500);
  t1500.fn(); t1500.fn = null;
  assert.deepEqual(w.types(), ['greet'], 'الحارس أرسل التحيّة نفسها بدل ردّ على الصدى');
  w.fire();
  assert.equal(w.env.sent.length, 1, 'مؤقّت المراقبة لا يرسل ثانية');
  // دور لاحق عاديّ: الحارس يطلب ردًّا عاديًّا كما كان
  w.api.arm(1500);
  w.fire();
  assert.deepEqual(w.types(), ['greet', 'response.create']);
  // كلام حقيقيّ قطعها: الحارس يطلب ردًّا على كلامه (مرّة) ولا تحيّة بعدها
  const r = watcher();
  r.ev(created('r1'), 0);
  r.ev({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 }, 50);
  r.ev(done('r1', 'cancelled', 'turn_detected'), 60);
  r.api.setVoice(800);
  r.ev({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 1200 }, 1250);
  r.api.arm(1500);
  r.fire();
  assert.deepEqual(r.types(), ['response.create']);
  assert.ok(r.api.log.some((l) => / recover reply$/.test(l)));
});

test('٣ح. أوّل ردّ استدعى أداة (بحث/رسم) بلا صوت ← ليس «غير مسموع»: لا طلب ثانٍ والأداة تعمل؛ جوابها بعد النتيجة يُراقَب هو', () => {
  const w = watcher({ real: true, greet: false });
  w.ev(created('r1'), 0);
  w.ev({ type: 'response.function_call_arguments.done', response_id: 'r1', name: 'search_web' }, 300);
  w.ev({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ type: 'function_call', name: 'search_web' }] } }, 320);
  assert.deepEqual(w.live(), [], 'لا مؤقّت');
  w.api.arm(1500);
  w.fire();
  assert.deepEqual(w.types(), ['response.create'], 'الحارس العاديّ وحده (لا إعادة مستهلكة)');
  assert.equal(w.api.first.recovered, false, 'الإعادة الوحيدة ما زالت محفوظة لجواب الأداة');
  // نتيجة الأداة تصل ثمّ جوابها — يُقطع قبل صوته ← إعادته مرّة
  w.env.sent.length = 0;
  w.ev(created('r2'), 9000);
  w.ev(done('r2', 'cancelled', 'turn_detected'), 9100);
  w.fire();
  assert.deepEqual(w.types(), ['response.create']);
  // جملة انتظار قصيرة قبل الأداة («لحظة أبحث») قُطعت في أوّلها — بأيّ ترتيب للأحداث: لا إعادة والأداة تعمل
  for (const toolFirst of [true, false]) {
    const c = watcher({ real: true, greet: false });
    c.ev(created('r1'), 0);
    c.ev({ type: 'output_audio_buffer.started', response_id: 'r1' }, 100);
    if (toolFirst) c.ev({ type: 'response.function_call_arguments.done', response_id: 'r1' }, 200);
    c.ev({ type: 'output_audio_buffer.cleared', response_id: 'r1' }, 250);
    if (!toolFirst) c.ev({ type: 'response.function_call_arguments.done', response_id: 'r1' }, 260);
    c.ev({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ type: 'message' }, { type: 'function_call' }] } }, 300);
    assert.deepEqual(c.live(), [], 'toolFirst=' + toolFirst);
    assert.equal(c.fire(), 0);
    assert.deepEqual(c.env.sent, []);
  }
  // وبلا حدث الوسائط: response.done بمخرَج function_call وحده يكفي
  const b = watcher();
  b.ev(created('r1'), 0);
  b.ev({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ type: 'function_call' }] } }, 200);
  assert.deepEqual(b.live(), []);
  assert.equal(b.fire(), 0);
});

test('٣ط. الإعادة مرّة واحدة في المكالمة بالضبط: المعادة قُطعت أيضًا ← لا ثالثة، والحارس بعدها يطلب ردًّا عاديًّا لا تحيّة', () => {
  const w = watcher();
  w.ev(created('r1'), 0);
  w.ev(done('r1', 'cancelled'), 100);
  w.fire();
  assert.deepEqual(w.types(), ['greet']);
  w.ev(created('r2'), 2000);
  w.ev(done('r2', 'cancelled'), 2100); // المعادة أُلغيت قبل صوتها أيضًا
  assert.deepEqual(w.live(), [], 'لا مؤقّت ثانٍ');
  w.api.arm(350);
  w.fire();
  assert.deepEqual(w.types(), ['greet', 'response.create'], 'لا تحيّة ثانية أبدًا');
  assert.equal(w.api.log.filter((l) => / recover /.test(l)).length, 1);
});

test('٢د. النغمة: الانتظار قبل فتح المايك يشمل تأخّر الإخراج، ولا نغمة من سياق غير شغّال (كانت تُعزف لاحقًا والمايك مفتوح)', () => {
  const block = between(SRC, 'const MAHA_BEEP_CLEAR_MS = ', '"ui:app-08-maha#ready-beep"); return 0; }\n}');
  assert.ok(BEEP_CLEAR > 120, 'الحدّ الأدنى أطول من النغمة نفسها (١٢٠م.ث)');
  const run = (ctxState) => {
    const made = [];
    const node = () => ({ connect() {}, frequency: {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, start() { made.push('start'); }, stop() {} });
    const c = { mahaMicMeterCtx: ctxState && Object.assign({ currentTime: 0, destination: {}, createOscillator: node, createGain: node }, ctxState), __swallow() {}, Math };
    vm.createContext(c);
    const ms = vm.runInContext(block + '\nmahaPlayReadyBeep();', c);
    return { ms, made };
  };
  assert.deepEqual(run({ state: 'running' }), { ms: BEEP_CLEAR, made: ['start'] });
  assert.equal(run({ state: 'running', baseLatency: 0.01, outputLatency: 0.25 }).ms, 120 + 260 + 130, 'بلوتوث: ١٢٠ + تأخّر الإخراج + ١٣٠');
  for (const st of [{ state: 'suspended' }, { state: 'closed' }, null]) {
    const r = run(st);
    assert.equal(r.ms, 0, JSON.stringify(st));
    assert.deepEqual(r.made, [], 'لا نغمة');
  }
});

test('٢هـ. التسلسل ينتظر ما تُرجعه النغمة (٤٧٠م.ث مع بلوتوث) قبل فتح المايك، ولا انتظار إن لم تُعزف', async () => {
  const a = await runSeq({ builder: true, beepMs: 470 });
  const b = idx(a.log, 'beep');
  assert.deepEqual(a.log[b + 1], ['wait', 470]);
  assert.ok(idx(a.log, 'mic') > b + 1);
  const z = await runSeq({ builder: true, beepMs: 0 });
  assert.deepEqual(z.log.slice(idx(z.log, 'beep') + 1, idx(z.log, 'mic')), [], 'سياق غير شغّال: لا نغمة ولا انتظار');
});

test('٤ج. طلب ردّ كلام التجهيز المؤجَّل لا يُضاف فوق ردّ موجود ولا فوق حارس قائم ولا لجلسة أخرى', async () => {
  for (const o of [{ responded: true }, { watchdog: { pending: true } }]) {
    const { log, ctx } = await runSeq(Object.assign({ preBuf: true, audioLater: true }, o));
    ctx.later();
    assert.equal(idx(log, 'arm'), -1, JSON.stringify(o));
  }
  const { log, ctx } = await runSeq({ preBuf: true, audioLater: true });
  ctx.mahaRtDc = { other: true };
  ctx.later();
  assert.equal(idx(log, 'arm'), -1, 'جلسة أخرى');
});

test('٤ب. ردّها على كلام التجهيز أُلغي قبل صوته ولا ردّ بعده ← يُطلب ردّ عاديّ مرّة (لا تحيّة)، ثمّ يُسمع', () => {
  const w = watcher({ real: true, greet: false });
  w.ev(created('r1'), 0);
  w.ev(done('r1', 'cancelled', 'turn_detected'), 200);
  w.fire();
  assert.deepEqual(w.types(), ['response.create']);
  w.ev(created('r2'), 2200);
  w.ev({ type: 'output_audio_buffer.started', response_id: 'r2' }, 2400);
  w.ev({ type: 'output_audio_buffer.stopped', response_id: 'r2' }, 4000);
  assert.equal(w.api.first.heard, true);
  w.ev(created('r3'), 5000);
  w.ev(done('r3', 'cancelled'), 5100);
  w.fire();
  assert.equal(w.env.sent.length, 1, 'مرّة واحدة في المكالمة');
});

test('٥. الربط في المصدر والحزمة: المراقبة تسمع كلّ حدث، وتبدأ عند الجاهزية، وتتوقّف بالإنهاء، ومستوى المايك يُقاس', () => {
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes('if(t) mahaRtFirstOn(ev); // v-maha-first-heard'), f);
    assert.ok(s.includes("if(!mahaRtReconnecting && mahaCallMode !== 'builder') mahaRtFirstStart(dc, preBufSent);"), f);
    assert.ok(between(s, 'function mahaEndRealtimeCall(){', '\n}\n').includes('mahaRtFirstStop();'), f);
    assert.ok(s.includes('if(lvl > MAHA_REAL_SPEECH_LVL && mahaMicLastTick) mahaMicVoiced.push([tickAt, Math.min(100, tickAt - mahaMicLastTick)]);'), f + ': مؤشّر المايك يسجّل الإطارات المصوَّتة');
    assert.ok(s.includes('if(mahaMicLastTick && tickAt - mahaMicLastTick > MAHA_MIC_GAP_MS) mahaMicGapAt = tickAt;'), f + ': وفجوات القياس');
    // لا نغمة بعد الجاهزية (والمايك مفتوح) في أيّ موضع من الدالّة
    const call = between(s, 'async function mahaStartRealtimeCall(){', '\n}\n');
    assert.equal(call.indexOf('mahaPlayReadyBeep(', call.indexOf('mahaRtReady = true;')), -1, f + ': لا نغمة بعد فتح المايك');
    assert.ok(call.indexOf('mahaPlayReadyBeep(') < call.indexOf('if(inputTrack) inputTrack.enabled = true;', call.indexOf('const preBufSent')), f);
    assert.ok(s.includes('if(preBufSent) mahaRtWhenAudio(() => { if(dc === mahaRtDc && !mahaRtResponded && !mahaRtResponseWatchdog) mahaArmRtResponseWatchdog(900); });'), f);
    assert.ok(s.includes("dc.addEventListener('message', mahaRtNoteEvent);"), f);
  }
});
