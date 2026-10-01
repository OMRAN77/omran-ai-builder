'use strict';
/* v-maha-firstreply (المالك ١ أكتوبر: «افحص مها… أريدها دقّة الصوت، ومع المرّة الثانية تستجيب»):
   أوّل جملة تُقال أثناء تجهيز المكالمة تُحفظ وتُرسل عند الجاهزية (v-maha-firstword) بـappend+commit،
   لكن الجلسة صارت create_response:false (v-maha-realtime-vad) فلا ردّ إلّا بطلب صريح من العميل،
   والطلب كان يأتي فقط مع speech_stopped — فتُسلَّم الجملة الأولى بلا جواب حتّى يعيدها المستخدم.
   هنا تُشغَّل دوالّ app-08 الحقيقيّة في vm بقناة بيانات وساعة مزيّفتين. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/app-08-maha.js'), 'utf8');
const slice = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

function sandbox(){
  const timers = [];
  const ctx = {
    timers, sent: [], stopped: 0,
    mahaPreBufChunks: [], mahaRtReady: true, mahaCallActive: true,
    setTimeout: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimeout: (t) => { if(t) t.live = false; },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    console: { warn(){}, error(){} },
    __swallow(){},
  };
  ctx.mahaStopPreBuffer = () => { ctx.stopped++; ctx.mahaPreBufChunks = []; };
  ctx.dc = { readyState: 'open', send: (m) => ctx.sent.push(JSON.parse(m).type) };
  vm.createContext(ctx);
  vm.runInContext('var mahaRtDc = dc; let mahaRtResponseWatchdog = null;\n'
    + slice('function mahaClearRtResponseWatchdog(){', '/* v283:')
    + slice('function mahaFlushPreBuffer(dc){', '// نغمة استعداد')
    + '\nthis.flush = mahaFlushPreBuffer; this.arm = mahaArmRtResponseWatchdog; this.clear = mahaClearRtResponseWatchdog;', ctx);
  ctx.run = () => { for(const t of timers.splice(0)) if(t.live) t.fn(); };
  return ctx;
}
const speech = () => ({ hasSpeech: true, pcm: new Int16Array(4800) });

test('١. الجملة الأولى المخزّنة ثمّ صمت ← ردّ واحد بعد مهلة قصيرة (كانت بلا ردّ)', () => {
  const c = sandbox();
  c.mahaPreBufChunks = [speech(), speech()];
  const sent = c.flush(c.dc);
  assert.equal(sent, true, 'الإفراغ يخبر أنّه أرسل كلامًا');
  assert.deepEqual(c.sent, ['input_audio_buffer.append', 'input_audio_buffer.commit']);
  // مسار mahaStartRealtimeCall بعد الجاهزية
  if(sent) c.arm(900);
  assert.equal(c.timers.at(-1).ms, 900);
  c.run();
  assert.deepEqual(c.sent.slice(2), ['response.create'], 'طلب ردّ واحد على الجملة الأولى');
});

test('٢. المستخدم يكمل جملته في المايك الحيّ ← لا ردّ وسطها؛ speech_started يلغي الحارس', () => {
  const c = sandbox();
  c.mahaPreBufChunks = [speech()];
  if(c.flush(c.dc)) c.arm(900);
  // معالج speech_started في app-08: يلغي ثمّ يضع شبكة أمان ٢٠ث
  c.clear(); c.arm(20000);
  const live = c.timers.filter((t) => t.live);
  assert.deepEqual(live.map((t) => t.ms), [20000], 'حارس الـ900 أُلغي');
  // speech_stopped: ردّ واحد على الكلّ (المخزَّن + الحيّ)
  c.clear(); c.arm(350); c.run();
  assert.equal(c.sent.filter((x) => x === 'response.create').length, 1);
});

test('٣. صمت أثناء التجهيز ← لا إرسال ولا commit ولا ردّ زائد', () => {
  const c = sandbox();
  c.mahaPreBufChunks = [{ hasSpeech: false, pcm: new Int16Array(4800) }];
  assert.equal(c.flush(c.dc), false);
  assert.deepEqual(c.sent, []);
  assert.equal(c.stopped, 1, 'المسجّل المؤقّت يُوقف دائمًا');
});

test('٤. التوصيل في المكالمة: الحارس يُسلَّح بعد الجاهزية لا قبلها (وإلّا يلغيه شرط mahaRtReady)', () => {
  const call = src.slice(src.indexOf('async function mahaStartRealtimeCall(){'));
  const f = call.indexOf('const preBufSent = mahaFlushPreBuffer(dc);');
  const ready = call.indexOf('mahaRtReady = true;', f);
  const arm = call.indexOf('if(preBufSent) mahaArmRtResponseWatchdog(900);', f);
  assert.ok(f > 0 && ready > f && arm > ready, 'إفراغ ← جاهزية ← حارس الردّ');
  assert.match(src, /if\(!mahaRtReady \|\| !mahaCallActive \|\| mahaRtDc !== dc/, 'الحارس لا يعمل قبل الجاهزية');
});

test('٥. جلسة المكالمة بلا تفريغ غير مستعمل (gpt-live-transcribe لا يدعم server_vad المستعمل هنا)', () => {
  const rt = fs.readFileSync(path.join(root, 'api/_lib/realtime-session.js'), 'utf8');
  assert.doesNotMatch(rt, /transcription: \{ model:/);
  assert.match(rt, /create_response: false/, 'الردّ بطلب العميل كما هو');
  assert.match(rt, /type: 'server_vad',/);
  const clientUses = fs.readdirSync(path.join(root, 'js')).filter((f) => /^app-\d\d-.*\.js$/.test(f))
    .some((f) => /input_audio_transcription/.test(fs.readFileSync(path.join(root, 'js', f), 'utf8')));
  assert.equal(clientUses, false, 'لا مستقبل لأحداث التفريغ في العميل — حذفه لا يُفقد شيئًا');
  assert.ok(fs.readFileSync(path.join(root, 'js/app.bundle.js'), 'utf8').includes('if(preBufSent) mahaArmRtResponseWatchdog(900);'), 'الحزمة أُعيد بناؤها');
});
