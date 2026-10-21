'use strict';
/* v-maha-first-audio (بلاغ المالك ٢١ أكتوبر «مها أوّل ما تنفتح المكالمة ما تتكلّم، وتبدأ تتكلّم من ثاني ردّ»): عنصر صوت المكالمة يُنشأ
   ويُشغَّل داخل ضغطة الزرّ نفسها ويبقى للمكالمة كلّها (وإعادة الاتّصال)، وplay() صريح بعد srcObject مع إعادة محاولة، والتحيّة لا تُرسل
   قبل أن يشتغل الصوت فعلًا — مرّة واحدة. الدوالّ الحقيقيّة تُشغَّل في vm مع عنصر صوت يطبّق قاعدة آيفون الصارمة: play() لا ينجح
   إلّا لعنصر شُغِّل مرّة داخل ضغطة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SRC = read('js/app-08-maha.js');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return s.slice(i, j + b.length); };
const HELPERS = between(SRC, 'const MAHA_RT_SILENT_WAV = ', "__swallow(err, 'maha:rt-note'); }\n}");
const GREET = between(SRC, "if(!preBufSent && !mahaRtReconnecting && mahaCallMode !== 'builder'){", "__swallow(e, 'maha:greet'); }\n        });\n      }");
const flush = () => new Promise((r) => setImmediate(r));

// عنصر صوت بقاعدة WebKit على آيفون: play() داخل ضغطة يفكّ قفل العنصر نفسه؛ خارجها يُرفض ما دام مقفولًا
function sandbox() {
  const env = { gesture: false, now: 0, timers: [], store: {}, created: [] };
  class FakeAudio {
    constructor() { this.attrs = {}; this.on = {}; this.paused = true; this.srcObject = null; this.src = ''; this.autoplay = false; this.unlocked = false; this.plays = []; this.failNext = 0; env.created.push(this); }
    setAttribute(k, v) { this.attrs[k] = v; }
    removeAttribute(k) { delete this.attrs[k]; if (k === 'src') this.src = ''; }
    addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }
    emit(t) { (this.on[t] || []).forEach((f) => f()); }
    play() {
      this.plays.push({ gesture: env.gesture, stream: this.srcObject });
      if (env.gesture) this.unlocked = true;
      if (!this.unlocked || this.failNext > 0) {
        if (this.failNext > 0) this.failNext--;
        return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
      }
      this.paused = false;
      setImmediate(() => this.emit('playing'));
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  const ctx = {
    document: { createElement: (t) => { assert.equal(t, 'audio'); return new FakeAudio(); } },
    performance: { now: () => env.now },
    localStorage: { setItem: (k, v) => { if (env.storageBroken) throw new Error('quota'); env.store[k] = v; } },
    setTimeout: (fn, ms) => { env.timers.push({ fn, ms }); return env.timers.length; },
    clearTimeout: (id) => { if (id && env.timers[id - 1]) env.timers[id - 1].fn = null; },
    __swallow() {}, JSON, Math, Promise, String, Error,
  };
  vm.createContext(ctx);
  vm.runInContext('let mahaRtAudioEl = null, mahaRtDc = null; var mahaCallActive = true, preBufSent = false, mahaRtReconnecting = false, mahaCallMode = "assistant", lang = "ar";\n' + HELPERS
    + '\nglobalThis.api = { get el(){ return mahaRtAudioEl; }, get ok(){ return mahaRtAudioOk; }, get responded(){ return mahaRtResponded; }, get log(){ return mahaRtLog; },'
    + ' setDc(d){ mahaRtDc = d; }, mahaRtBeginCall, mahaRtEnsureAudioEl, mahaRtPlay, mahaRtWhenAudio, mahaRtSetAudioOk, mahaRtNoteEvent, mahaRtTrace };', ctx);
  const runTimers = async () => { const due = env.timers.filter((t) => t.fn).map((t) => ({ ms: t.ms, fn: t.fn })); env.timers.forEach((t) => { t.fn = null; }); due.forEach((t) => t.fn()); await flush(); return due.map((t) => t.ms); };
  // الضغطة: الجزء المتزامن من mahaStartCall وحده داخل الإيماءة
  const click = () => { env.gesture = true; try { ctx.api.mahaRtBeginCall(); } finally { env.gesture = false; } };
  return { env, ctx, api: ctx.api, runTimers, click };
}

test('١. داخل الضغطة يُنشأ العنصر بـplaysinline ويُشغَّل صمتًا، فـplay() بعد المجرى (بعد كلّ الانتظارات) ينجح من أوّل مرّة', async () => {
  const s = sandbox();
  s.click();
  const el = s.api.el;
  assert.ok(el, 'العنصر أُنشئ داخل الضغطة');
  assert.equal(el.attrs.playsinline, '');
  assert.equal(el.attrs['webkit-playsinline'], '');
  assert.equal(el.autoplay, true);
  assert.equal(el.plays.length, 1);
  assert.equal(el.plays[0].gesture, true, 'play() نُودي داخل الضغطة');
  assert.match(el.src, /^data:audio\/wav;base64,/);
  await flush();
  const stream = { id: 'remote' };
  el.srcObject = stream; // ontrack — بعد الجلسة والمايك والعرض، خارج الضغطة
  s.api.mahaRtPlay(el, stream);
  await flush();
  assert.equal(el.plays[1].gesture, false);
  assert.equal(el.plays[1].stream, stream, 'play() صريح بعد srcObject');
  assert.equal(s.api.ok, true, 'الصوت مؤكَّد');
  assert.ok(s.api.log.some((l) => / play ok #1$/.test(l)));
  // بلا تفعيل داخل الضغطة (ما كان قبل الإصلاح: عنصر جديد بعد await) القاعدة نفسها ترفض — هذا ما يحميه التفعيل
  const bare = sandbox();
  const el2 = bare.api.mahaRtEnsureAudioEl();
  el2.srcObject = stream;
  bare.api.mahaRtPlay(el2, stream);
  await flush();
  assert.equal(bare.api.ok, false);
  assert.ok(bare.api.log.some((l) => / play fail #1 NotAllowedError$/.test(l)), 'الفشل مسجَّل في الأثر');
});

test('٢. عنصر واحد للمكالمة كلّها: إعادة الاتّصال والمكالمة التالية تعيدان العنصر نفسه المفعَّل — لا عنصر ثانٍ ولا صوت مكرّر', async () => {
  const s = sandbox();
  s.click();
  const el = s.api.el;
  assert.equal(s.api.mahaRtEnsureAudioEl(), el, 'إعادة الاتّصال (بلا ضغطة) تأخذ العنصر نفسه');
  s.click();
  assert.equal(s.api.el, el, 'المكالمة التالية: العنصر نفسه');
  assert.equal(s.env.created.length, 1, 'عنصر واحد فقط طوال الوقت');
  const stream = { id: 'r2' };
  el.srcObject = stream;
  el.src = ''; // srcObject يغلب src
  s.click();
  assert.equal(el.plays.length, 2, 'ضغطة أثناء مكالمة جارية لا تقطع مجراها بصمت');
});

test('٣. play() يُرفض مرّتين ← إعادة بعد ٢٥٠ ثمّ ٥٠٠م.ث، والتحيّة تنتظر حتّى يشتغل ثمّ تُرسل مرّة واحدة فقط', async () => {
  const s = sandbox();
  s.click();
  await flush();
  const el = s.api.el, stream = { id: 'r' };
  el.failNext = 2;
  el.srcObject = stream;
  s.api.mahaRtPlay(el, stream);
  await flush();
  let greets = 0;
  s.api.mahaRtWhenAudio(() => { greets++; });
  assert.equal(greets, 0, 'لا تحيّة والصوت لم يشتغل');
  assert.deepEqual(await s.runTimers(), [250]);
  assert.equal(greets, 0);
  assert.deepEqual(await s.runTimers(), [500]);
  await flush();
  assert.equal(s.api.ok, true);
  assert.equal(greets, 1, 'التحيّة بعد أن اشتغل الصوت');
  el.emit('playing');
  s.api.mahaRtSetAudioOk();
  assert.equal(greets, 1, 'لا تحيّة ثانية مع حدث playing');
  // مقاطعة من النظام وسط المكالمة: يُعاد التشغيل، والتحيّة لا تتكرّر
  el.paused = true;
  el.emit('pause');
  await flush();
  assert.equal(s.api.ok, true, 'عاد يشتغل');
  assert.equal(greets, 1);
  assert.ok(s.api.log.some((l) => / pause$/.test(l)));
  // كلّ نجاح يعيد العدّاد: مقاطعات كثيرة في مكالمة طويلة لا تستنفد المحاولات
  for (let i = 0; i < 8; i++) { el.paused = true; el.emit('pause'); await flush(); }
  assert.ok(s.api.log.some((l) => / play ok #1$/.test(l)) && !s.api.log.some((l) => / play ok #[7-9]$/.test(l)), 'العدّاد يبدأ من ١ بعد كلّ نجاح');
  el.failNext = 1;
  el.paused = true;
  el.emit('pause');
  await flush();
  assert.deepEqual(await s.runTimers(), [250], 'بعد ثماني مقاطعات ما زالت الإعادة متاحة');
  assert.equal(s.api.ok, true);
});

test('٤. لا عاصفة محاولات: ستّ محاولات بتباعد ثمّ يتوقّف؛ ولا محاولة بعد إنهاء المكالمة، ولا تشغيل لمجرى قديم', async () => {
  const s = sandbox();
  const el = s.api.mahaRtEnsureAudioEl(); // بلا ضغطة: يُرفض دائمًا
  const stream = { id: 'r' };
  el.srcObject = stream;
  s.api.mahaRtPlay(el, stream);
  await flush();
  const waits = [];
  for (let i = 0; i < 8; i++) waits.push(...await s.runTimers());
  assert.deepEqual(waits, [250, 500, 1000, 2000, 4000]);
  assert.equal(el.plays.length, 6);
  const s2 = sandbox();
  const el2 = s2.api.mahaRtEnsureAudioEl();
  el2.srcObject = stream;
  s2.ctx.mahaCallActive = false;
  s2.api.mahaRtPlay(el2, stream);
  await flush();
  assert.deepEqual(await s2.runTimers(), [], 'المكالمة انتهت: لا إعادة');
  el2.srcObject = { id: 'new' };
  s2.api.mahaRtPlay(el2, stream);
  assert.equal(el2.plays.length, 1, 'مجرى جلسة سابقة لا يُشغَّل');
});

test('٥. كتلة التحيّة الحقيقيّة: تنتظر الصوت، وتُرسل مرّة واحدة، ولا تُرسل إن ردّ الخادم قبلها أو تغيّرت الجلسة', async () => {
  const run = (prep) => {
    const s = sandbox();
    const sent = [];
    const dc = { readyState: 'open', send: (m) => sent.push(JSON.parse(m)) };
    s.ctx.dc = dc;
    s.api.setDc(dc);
    if (prep) prep(s, dc);
    vm.runInContext(GREET, s.ctx);
    return { s, sent, dc };
  };
  const a = run();
  assert.equal(a.sent.length, 0, 'الصوت لم يشتغل بعد');
  assert.ok(a.s.api.log.some((l) => / greet waits audio$/.test(l)));
  a.s.api.mahaRtSetAudioOk();
  assert.equal(a.sent.length, 1);
  assert.equal(a.sent[0].type, 'response.create');
  assert.match(a.sent[0].response.instructions, /greet the user warmly in ONE short natural sentence/);
  a.s.api.mahaRtSetAudioOk();
  assert.equal(a.sent.length, 1, 'لا تحيّة مرّتين');
  assert.ok(a.s.api.log.some((l) => / greet sent$/.test(l)));
  const b = run((s) => s.api.mahaRtSetAudioOk());
  assert.equal(b.sent.length, 1, 'الصوت يشتغل قبل الجاهزية (الحالة المعتادة) ← التحيّة فورًا بلا تأخير');
  const c = run();
  c.s.api.mahaRtNoteEvent({ data: JSON.stringify({ type: 'response.created' }) }); // المستخدم تكلّم والخادم ردّ قبل أن يشتغل الصوت
  c.s.api.mahaRtSetAudioOk();
  assert.equal(c.sent.length, 0, 'ردّه هو الأوّل — لا تحيّة فوقه');
  assert.ok(c.s.api.log.some((l) => / greet skipped$/.test(l)));
  const d = run();
  d.s.api.setDc({ readyState: 'open', send() { throw new Error('جلسة أخرى'); } });
  d.s.api.mahaRtSetAudioOk();
  assert.equal(d.sent.length, 0, 'إعادة اتّصال/جلسة جديدة لا تأخذ تحيّة الجلسة الميتة');
});

test('٦. الأثر: أحداث الجلسة المهمّة وحالة response.done وسببها، بلا أحداث النصّ المتدفّق، بحدّ ٨٠ سطرًا، ولا يرمي', () => {
  const s = sandbox();
  s.click();
  s.env.now = 1234;
  const note = (o) => s.api.mahaRtNoteEvent({ data: JSON.stringify(o) });
  note({ type: 'session.created' });
  note({ type: 'response.output_audio_transcript.delta', delta: 'نصّ' });
  note({ type: 'input_audio_buffer.speech_started' });
  note({ type: 'output_audio_buffer.cleared' });
  note({ type: 'response.done', response: { status: 'cancelled', status_details: { reason: 'turn_detected' } } });
  s.api.mahaRtNoteEvent({ data: 'ليس JSON' });
  assert.equal(s.api.responded, false);
  note({ type: 'response.created' });
  assert.equal(s.api.responded, true);
  const log = Array.from(s.api.log); // مصفوفة من عالم vm — نسخة بنموذج هذا العالم للمقارنة
  assert.deepEqual(log.slice(-5), ['1234 session.created', '1234 input_audio_buffer.speech_started', '1234 output_audio_buffer.cleared', '1234 response.done cancelled:turn_detected', '1234 response.created']);
  assert.ok(!log.some((l) => /delta|نصّ/.test(l)), 'لا كلام في الأثر');
  const saved = JSON.parse(s.env.store.aiapp_maha_rt_trace);
  assert.deepEqual(saved.log, log);
  for (let i = 0; i < 200; i++) s.api.mahaRtTrace('x' + i);
  assert.equal(s.api.log.length, 80);
  s.env.storageBroken = true;
  s.api.log.length = 10;
  assert.doesNotThrow(() => s.api.mahaRtTrace('y'));
  s.click();
  assert.equal(s.api.log.length, 1, 'مكالمة جديدة = أثر جديد يبدأ من الضغطة');
  assert.match(s.api.log[0], /^0 prime play\(\)$/);
});

test('٧. الصمت المستعمل للتفعيل ملفّ WAV صالح (الـmp3 القديم يرفضه كروم NotSupportedError)', () => {
  const m = /const MAHA_RT_SILENT_WAV = 'data:audio\/wav;base64,([^']+)'/.exec(SRC);
  assert.ok(m);
  const b = Buffer.from(m[1], 'base64');
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WAVE');
  assert.equal(b.toString('ascii', 12, 16), 'fmt ');
  assert.equal(b.readUInt16LE(20), 1, 'PCM');
  assert.equal(b.readUInt32LE(4), b.length - 8);
  assert.equal(b.toString('ascii', 36, 40), 'data');
  assert.equal(b.readUInt32LE(40), b.length - 44);
});

test('٨. الربط في المصدر والحزمة: التفعيل قبل أيّ await، لا new Audio() بعد الانتظارات، ontrack بحارس الجلسة ثمّ play() صريح، والإنهاء لا يرمي العنصر', () => {
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    const start = between(s, 'async function mahaStartCall(mode){', "\n}\n");
    const prime = start.indexOf('mahaRtBeginCall();');
    assert.ok(prime > 0 && prime < start.indexOf('await '), f + ': داخل الضغطة قبل أوّل await');
    assert.ok(prime > start.indexOf('callAgentBusy'), f + ': لا تفعيل لمكالمة مرفوضة');
    const rt = between(s, 'async function mahaStartRealtimeCall(){', 'const dc = pc.createDataChannel');
    assert.ok(!/new Audio\(\)/.test(rt), f + ': لا عنصر جديد بعد الانتظارات');
    const reset = rt.indexOf('mahaRtResponded = false;');
    assert.ok(reset > 0 && reset < rt.indexOf('await fetch('), f + ': كلّ مكالمة تبدأ بلا «ردّ سابق» — وإلّا لا تحيّة بعد أوّل مكالمة');
    const guard = rt.indexOf('if(pc !== mahaRtPc) return;');
    const so = rt.indexOf('mahaRtAudioEl.srcObject = e.streams[0];');
    const play = rt.indexOf('mahaRtPlay(mahaRtAudioEl, e.streams[0]);');
    assert.ok(rt.indexOf('mahaRtEnsureAudioEl();') > 0 && guard > 0 && so > guard && play > so, f + ': ontrack');
    assert.ok(s.includes("dc.addEventListener('message', mahaRtNoteEvent);"), f + ': الأثر يسمع الجلسة');
    const end = between(s, 'function mahaEndRealtimeCall(){', '\n}\n');
    assert.ok(!end.includes('mahaRtAudioEl = null'), f + ': العنصر المفعَّل يبقى');
    assert.ok(end.includes('mahaRtAudioEl.srcObject = null;') && end.includes('mahaRtOnAudioOk = null;'), f + ': يُفرغ وتسقط تحيّة معلّقة');
    const ready = s.indexOf('mahaRtReady = true;', s.indexOf('const preBufSent = mahaFlushPreBuffer(dc);'));
    assert.ok(s.indexOf('mahaRtWhenAudio(() => {', ready) > ready, f + ': التحيّة عبر انتظار الصوت');
  }
  for (const f of ['js/app-01-boot-auth.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes("JSON.parse(get('aiapp_maha_rt_trace') || 'null')"), f + ': لوحة ?diag=1 تعرض أثر آخر مكالمة');
  }
});
