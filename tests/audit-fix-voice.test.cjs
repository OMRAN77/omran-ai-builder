'use strict';
/* v-audit-voice — دفعة «الصوت ومها» من فحص التطبيق كلّه (الكود الحقيقيّ في vm، بلا شبكة ولا مفاتيح):
   cli-voice-4  نقرتان سريعتان على المايك (الرئيسيّ والصغير) لا تتركان مايكًا مفتوحًا ولا مسجّلًا يتيمًا.
   cli-voice-5  حلقة مها الأساسيّة برقم جيل: مكالمة أُنهيت ثمّ فُتحت لا تنطق ردّها القديم ولا تسرق مايك الجديدة.
   cli-voice-7  كشف لغة القراءة: الروسيّة والصينيّة والمالايالاميّة بكتابتها، واللاتينيّ بلغة الواجهة، وصوت الجهاز بالـ١٤ لغة.
   cli-voice-8  أخطاء التفريغ نصّ مترجم من الحالة والرمز — لا نصّ الخادم الخامّ (عربيّ لكلّ اللغات، اسم مزوّد).
   cli-voice-9  شريط المكالمة: تحذير المايك وسطر السقوط للأساسيّ مترجمان، ولا تحذير ومها تتكلّم. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const cut = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, 'المقطع: ' + a); return s.slice(i, j); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const ARABIC = /[؀-ۿ]/;

const EN = {
  micNotSupported: 'This browser does not support voice input. Try Chrome on Android or desktop.',
  svcPaused: 'This service is temporarily unavailable — please try again shortly.',
  portraitLimitReached: 'You reached the daily limit for this feature, try again tomorrow',
  mahaSttError: 'Voice conversion error, try again',
  mahaLowMic: "I couldn't hear you, check your mic and speak louder",
  mahaListening: 'Listening...', mahaThinking: 'Thinking...', mahaSpeaking: 'Speaking...', mahaTryAgain: 'Try again',
  mahaNoSpeech: "I didn't catch that, try again", mahaConnectionError: 'Connection failed, try again', mahaAskRepeat: 'Say that again?',
};
// t الحقيقيّ يعيد المفتاح نفسه حين لا يجده — المفاتيح الجديدة لا تصل القاموس إلّا مركزيًّا، فيلزم احتياط في الكود
const tOf = (dict) => (k) => (k in dict ? dict[k] : k);

/* ───────── عالم app-07-voice.js كاملًا ───────── */
function voiceWorld(o = {}) {
  const els = {};
  const mkEl = (id) => {
    const cls = new Set();
    return {
      id, value: '', attrs: {}, onclick: null,
      classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); } },
      getAttribute(k) { return this.attrs[k]; }, dispatchEvent() {}, focus() {},
      closest(sel) { return sel === '.mini-mic-btn' && this.mini ? this : null; },
    };
  };
  const $ = (sel) => (els[sel] = els[sel] || mkEl(sel.replace('#', '')));
  const streams = [], recorders = [], alerts = [], bodies = [];
  let clickHandler = null;
  class FakeRecorder {
    constructor(stream, opts) { this.stream = stream; this.mimeType = (opts && opts.mimeType) || 'audio/webm'; this.state = 'inactive'; this.n = recorders.push(this); }
    static isTypeSupported(c) { return c === 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      setImmediate(() => { if (this.ondataavailable) this.ondataavailable({ data: new Blob(['R' + this.n + ':' + 'x'.repeat(700)]) }); if (this.onstop) this.onstop(); });
    }
  }
  class FakeReader { readAsDataURL(b) { b.arrayBuffer().then((buf) => { this.result = 'data:audio/webm;base64,' + Buffer.from(buf).toString('base64'); this.onloadend(); }); } }
  const ctx = {
    $, alert: (m) => alerts.push(String(m)), t: tOf(o.dict || EN), lang: o.lang || 'en', __swallow() {}, console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { querySelectorAll: () => [], getElementById: (id) => $('#' + id), addEventListener: (ev, fn) => { if (ev === 'click') clickHandler = fn; } },
    navigator: { mediaDevices: { getUserMedia: async () => { await sleep(o.gumMs || 30); const s = { stopped: 0, getTracks: () => [{ stop: () => { s.stopped++; } }] }; streams.push(s); return s; } } },
    MediaRecorder: FakeRecorder, FileReader: FakeReader, Blob, AbortSignal, Event: class { constructor(t) { this.type = t; } },
    fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return o.stt ? o.stt() : { ok: true, status: 200, json: async () => ({ text: 'hello' }) }; },
    authGet: () => 'tok', setTimeout, clearTimeout, Promise, JSON, String, Date, Math, Object, Array, Number, Buffer,
  };
  ctx.window = { MediaRecorder: FakeRecorder, getGuestId: () => 'g1' };
  vm.createContext(ctx);
  vm.runInContext(read('js/app-07-voice.js') + '\nthis.api = { btnMic };', ctx);
  return { ctx, els, streams, recorders, alerts, bodies, api: ctx.api, click: (btn) => clickHandler({ target: btn }), mkEl };
}
const live = (w) => w.streams.filter((s) => !s.stopped).length;
const rec = (w) => w.recorders.filter((r) => r.state === 'recording').length;

test('cli-voice-4 أ. زرّ المايك الرئيسيّ: نقرتان قبل أن يصل إذن المايك = مسار واحد، وبعد الإيقاف لا مايك مفتوح ولا مسجّل يتيم', async () => {
  const w = voiceWorld({ gumMs: 40 });
  w.api.btnMic.onclick();
  w.api.btnMic.onclick(); // النقرة الثانية من نقرة مزدوجة أثناء فتح المايك
  await sleep(80);
  assert.equal(w.streams.length, 1, 'getUserMedia مرّة واحدة — كانت مرّتين');
  assert.equal(rec(w), 1);
  w.api.btnMic.onclick(); // إيقاف وتفريغ
  await sleep(40); await flush();
  assert.equal(live(w), 0, 'كلّ مسارات المايك موقوفة — كان الأوّل يبقى مضاءً حتّى إعادة التحميل');
  assert.equal(rec(w), 0, 'لا مسجّل في حالة recording');
  assert.equal(w.bodies.length, 1, 'تفريغ واحد');
  const audio = Buffer.from(w.bodies[0].audioBase64, 'base64').toString();
  assert.equal((audio.match(/R\d+:/g) || []).length, 1, 'التسجيل من مسجّل واحد لا خليط');
});

test('cli-voice-4 ب. نقرة إيقاف ثانية أثناء انتظار المسجّل لا تكرّر التفريغ ولا تعلّق الأوّل', async () => {
  const w = voiceWorld({ gumMs: 5 });
  w.api.btnMic.onclick();
  await sleep(20);
  w.api.btnMic.onclick();
  w.api.btnMic.onclick();
  await sleep(30); await flush();
  assert.equal(w.bodies.length, 1);
  assert.equal(live(w), 0);
});

test('cli-voice-4 ج. أزرار المايك الصغيرة: نقرتان سريعتان على الزرّ نفسه = مسار واحد، وكلّه يُطفأ بعد الإيقاف', async () => {
  const w = voiceWorld({ gumMs: 40 });
  const btn = w.mkEl('miniBtn'); btn.mini = true; btn.attrs['data-target'] = 'fieldX';
  w.click(btn); w.click(btn);
  await sleep(80);
  assert.equal(w.streams.length, 1, 'getUserMedia مرّة واحدة للهدف — كانت مرّتين وminiMicStates يُستبدل');
  assert.ok(btn.classList.contains('recording'));
  w.click(btn);
  await sleep(30); await flush();
  assert.equal(live(w), 0, 'لا مايك مفتوح');
  assert.equal(rec(w), 0);
  assert.equal(w.bodies.length, 1);
});

/* ───────── cli-voice-8: نصّ خطأ التفريغ ───────── */
const SERVER_402 = 'وصلت للحد اليومي المجاني (20 رسالة) لهذا المزوّد. جرّب مزودًا آخر بمفتاحك الخاص أو انتظر الغد.';
const resp = (status, body) => () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function micOnce(o) {
  const w = voiceWorld(Object.assign({ gumMs: 2 }, o));
  w.api.btnMic.onclick();
  await sleep(10);
  w.api.btnMic.onclick();
  await sleep(30); await flush(10);
  return w;
}
async function miniOnce(o) {
  const w = voiceWorld(Object.assign({ gumMs: 2 }, o));
  const btn = w.mkEl('miniBtn'); btn.mini = true; btn.attrs['data-target'] = 'fieldX';
  w.click(btn); await sleep(10); w.click(btn);
  await sleep(30); await flush(10);
  return w;
}

test('cli-voice-8 أ. المايك الرئيسيّ والصغير: 402 حدّ اليوم بلغة الواجهة — لا نصّ الخادم العربيّ («المزوّد»، «مفتاحك الخاص»)', async () => {
  for (const run of [micOnce, miniOnce]) {
    const w = await run({ stt: resp(402, { error: SERVER_402 }) });
    assert.deepEqual(w.alerts, [EN.portraitLimitReached], run.name + ': ' + w.alerts[0]);
  }
});

test('cli-voice-8 ب. 401 = «انتهت جلستك» مترجم (احتياط إنجليزيّ قبل وصول المفتاح)، و500 بلا اسم مزوّد، وunavailable كما كان', async () => {
  for (const run of [micOnce, miniOnce]) {
    const a = await run({ stt: resp(401, { error: 'الجلسة منتهية، الرجاء تسجيل الدخول من جديد' }) });
    assert.equal(a.alerts.length, 1);
    assert.ok(!ARABIC.test(a.alerts[0]) && /sign in/i.test(a.alerts[0]), run.name + ': ' + a.alerts[0]);
    const withKey = await run({ stt: resp(401, { error: 'auth_required' }), dict: Object.assign({}, EN, { axVoiceSessionEnded: 'SESSION-ENDED' }) });
    assert.deepEqual(withKey.alerts, ['SESSION-ENDED'], 'المفتاح الجديد حين يصل القاموس');
    const b = await run({ stt: resp(500, { error: 'Server is missing GROQ_API_KEY' }) });
    assert.deepEqual(b.alerts, [EN.mahaSttError], run.name + ': ' + b.alerts[0]);
    const c = await run({ stt: resp(503, { error: 'unavailable' }) });
    assert.deepEqual(c.alerts, [EN.svcPaused]);
  }
});

test('cli-voice-8 ج. عطل الشبكة أو المهلة = «تعذّر تحويل الصوت» لا «المتصفّح لا يدعم إدخال الصوت»', async () => {
  for (const run of [micOnce, miniOnce]) {
    const w = await run({ stt: () => { throw Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }); } });
    assert.deepEqual(w.alerts, [EN.mahaSttError], run.name);
  }
});

test('cli-voice-8 د. الخادم (stt.js): 401 و402 و500 رموز ثابتة بلا عربيّ ولا اسم مزوّد', async () => {
  const rp = (f) => require.resolve(path.join(root, f));
  const run = async (usage, env) => {
    require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true,
      exports: { checkAndConsume: async () => usage, DAILY_LIMIT: 20, clientIp: () => '127.0.0.1' } };
    delete require.cache[rp('api/_lib/stt.js')];
    const handler = require(rp('api/_lib/stt.js'));
    const saved = process.env.GROQ_API_KEY;
    if (env && 'GROQ_API_KEY' in env) { if (env.GROQ_API_KEY == null) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = env.GROQ_API_KEY; }
    const res = { code: 0, j: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(j) { this.j = j; return this; }, end() { return this; }, send(x) { this.j = x; return this; } };
    try { await handler({ method: 'POST', headers: {}, socket: {}, body: { audioBase64: 'eA==', mimeType: 'audio/webm', token: 't' } }, res); }
    finally { if (saved === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = saved; }
    return res;
  };
  const lim = await run({ allowed: false, reason: 'limit' }, { GROQ_API_KEY: 'k' });
  assert.equal(lim.code, 402);
  assert.equal(lim.j.error, 'daily_limit');
  const auth = await run({ allowed: false, reason: 'auth' }, { GROQ_API_KEY: 'k' });
  assert.equal(auth.code, 401);
  assert.equal(auth.j.error, 'auth_required');
  const nokey = await run({ allowed: true }, { GROQ_API_KEY: null });
  assert.equal(nokey.j.error, 'unavailable');
  for (const r of [lim, auth, nokey]) assert.ok(!ARABIC.test(JSON.stringify(r.j)) && !/groq/i.test(JSON.stringify(r.j)), JSON.stringify(r.j));
  delete require.cache[rp('api/_lib/_usage.js')];
});

/* ───────── عالم مها: الحلقة وبداية المكالمة والنطق ───────── */
const MAHA = read('js/app-08-maha.js');
function mahaWorld(o = {}) {
  const states = [], spoken = [], providers = [];
  let releaseAI = null;
  const label = { textContent: '' };
  const ctx = {
    mahaCallActive: false, mahaCallGen: 0, mahaState: 'idle', mahaLastActivity: 0, mahaHistory: [], mahaLowMicStreak: 0, mahaLastPeakRms: 0.5,
    mahaLangLocked: false, mahaLangCandidate: null, mahaReplyLang: 'en', mahaIntroduced: true, mahaPrevCallAgoMs: 1, mahaDetectedGender: 'female',
    mahaLastImageBase64: null, mahaLastTextLayer: null, mahaCallMode: 'assistant', mahaAllPitchSamples: [], AUTO_FALLBACK_ORDER: ['groq'],
    MAHA_SYSTEM_PROMPT_TEMPLATE: 'You are {{NAME}} {{GENDER_DESC}}',
    mahaOrbEl: null, mahaWaveEl: null, mahaCallScreenEl: null, mahaStateLabelEl: label, btnMahaEl: null,
    t: tOf(o.dict || EN), lang: o.lang || 'en', __swallow() {}, console: { log() {}, warn() {}, error() {} }, alert() {},
    localStorage: { getItem: (k) => (k === 'aiapp_lang' ? (o.lang || 'en') : null), setItem() {} },
    navigator: { mediaDevices: { getUserMedia() {} } },
    window: { MediaRecorder: function () {}, getGuestId: () => 'g' },
    document: { getElementById: () => null, body: { classList: { toggle() {}, add() {}, remove() {} } } },
    authGet: () => 'tok', blobToBase64: async () => 'eA==', AbortSignal, Intl, Date, JSON, Math, Promise, String,
    setTimeout: (fn) => setImmediate(fn),
    mahaRecordUntilSilence: async () => { await sleep(1); return { size: 5000, type: 'audio/webm' }; },
    fetch: async () => ({ ok: true, status: 200, json: async () => (o.sttBody || { text: 'what time is it', language: 'en' }) }),
    mahaNeedsImage: () => false, mahaMaybeSearch: async () => null, mahaAppBrief: () => '', omranOwnerUi: () => false,
    callProviderAI: (p) => new Promise((r) => { providers.push(p); releaseAI = r; }),
    mahaSpeak: async (text) => { spoken.push(text); await sleep(1); },
    // بداية المكالمة
    mahaEnsureVoiceChosen: async () => {}, mahaMicPreflight: async () => null, stopAllSpeaking() {}, mahaReadVoiceGender: () => 'female',
    mahaReadPrevCallAgo: () => 1, mahaAvatarDisplay() {}, mahaUpdatePersonaUI() {}, mahaHideComposer() {}, mahaStartCloseWatch() {},
    mahaStartRealtimeCall: o.rt || (async () => {}), mahaShowModeTag() {}, mahaMarkCallAt() {}, mahaRtTrace() {}, mahaEndRealtimeCall() {},
    mahaEndCall() { ctx.mahaCallActive = false; }, mahaOpenPlans() {},
  };
  ctx.mahaSetState = (s, custom) => { ctx.mahaState = s; states.push([s, custom]); };
  vm.createContext(ctx);
  // مساعدا الترجمة ونصّ فشل التفريغ يعيشان في app-07 (قبل app-08 في الحزمة) — يُحمَّلان معهما
  const helpers = read('js/app-07-voice.js').includes('function voiceTr(') ? cut(read('js/app-07-voice.js'), 'function voiceTr(', 'function blobToBase64(') : '';
  vm.runInContext(helpers + cut(MAHA, 'async function mahaCallLoop(){', '// 💰 عداد نقاط مها') + cut(MAHA, 'async function mahaStartCallInner(mode){', '// وسم تشخيصي صغير'), ctx);
  return { ctx, states, spoken, providers, release: (r) => releaseAI(r), label };
}

test('cli-voice-5 أ. إنهاء المكالمة الأساسيّة أثناء انتظار الردّ ثمّ فتحها: الحلقة القديمة لا تنطق ولا تكتب في تاريخ الجديدة ولا تكمل', async () => {
  const w = mahaWorld({ rt: async () => {} }); // المكالمة الجديدة فائقة (HD) — لا حلقة جديدة
  w.ctx.mahaCallActive = true;
  const oldLoop = w.ctx.mahaCallLoop();
  await sleep(10); await flush();
  assert.equal(w.providers.length, 1, 'الحلقة القديمة تنتظر ردّ النموذج');
  w.ctx.mahaCallActive = false; // mahaEndCall (أيّ لمسة)
  await w.ctx.mahaStartCallInner('assistant'); // «م» من جديد
  assert.equal(w.ctx.mahaCallActive, true);
  assert.equal(w.ctx.mahaHistory.length, 0, 'تاريخ المكالمة الجديدة فارغ');
  w.release('old reply to previous call');
  await oldLoop;
  assert.deepEqual(w.spoken, [], 'كانت تنطق ردّ السؤال السابق في المكالمة الجديدة');
  assert.equal(w.ctx.mahaHistory.length, 0, 'لا ردّ قديم في التاريخ الجديد');
  assert.equal(w.providers.length, 1, 'لا أدوار تسجيل وردّ بعدها بجانب المسار الجديد');
});

test('cli-voice-5 ب. الحلقة نفسها بلا إنهاء تكمل كما كانت (ردّ ينطق ثمّ دور جديد)', async () => {
  const w = mahaWorld();
  w.ctx.mahaCallActive = true;
  w.ctx.mahaCallGen = 7;
  const loop = w.ctx.mahaCallLoop();
  await sleep(10); await flush();
  w.release('hi there');
  await sleep(10); await flush();
  assert.deepEqual(w.spoken, ['hi there']);
  assert.ok(w.ctx.mahaHistory.some((m) => m.role === 'assistant' && m.content === 'hi there'), 'الردّ في التاريخ');
  assert.equal(w.providers.length, 2, 'الدور التالي بدأ');
  w.ctx.mahaCallActive = false;
  w.release('bye');
  await loop;
});

test('cli-voice-5 ج. mahaRecordUntilSilence: مايك مكالمة قديمة يصل بعد بدء الجديدة يُطفأ ولا يستبدل مايك الجديدة', async () => {
  const gums = [];
  const streams = [];
  class Rec { constructor(s) { this.stream = s; this.state = 'inactive'; } static isTypeSupported() { return true; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; setImmediate(() => this.onstop && this.onstop()); } }
  class Ctx { createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { fftSize: 0, getByteTimeDomainData() {} }; } close() { this.closed = true; } }
  const ctx = {
    mahaCallActive: true, mahaCallGen: 1, mahaStream: null, mahaMediaRecorder: null, mahaChunks: [], mahaAudioCtx: null, mahaAnalyser: null, mahaVadRaf: null,
    mahaOrbEl: null, mahaLastActivity: 0, mahaLastPeakRms: 0, __swallow() {}, Date, Math, Promise, Blob,
    mahaGetUserMediaRetry: () => new Promise((r) => gums.push(() => { const s = { stopped: 0, getTracks: () => [{ stop: () => { s.stopped++; } }] }; streams.push(s); r(s); })),
    MediaRecorder: Rec, window: { MediaRecorder: Rec, AudioContext: Ctx }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  };
  vm.createContext(ctx);
  vm.runInContext(cut(MAHA, 'function mahaStopVad(){', '// Simple, well-known autocorrelation') + cut(MAHA, 'async function mahaRecordUntilSilence(', '// Heuristic: does this turn need live'), ctx);
  const oldTurn = ctx.mahaRecordUntilSilence(1); // المكالمة الأولى تنتظر إذن المايك (بلوتوث/ويندوز بطيء)
  await flush();
  ctx.mahaCallActive = false; // أُنهيت
  ctx.mahaCallGen = 2; ctx.mahaCallActive = true; // وفُتحت مكالمة أساسيّة جديدة
  ctx.mahaRecordUntilSilence(2);
  await flush();
  gums[1](); await flush(); // مايك الجديدة وصل
  const fresh = streams[0];
  assert.equal(ctx.mahaStream, fresh);
  gums[0](); await flush(); // ثمّ وصل مايك القديمة متأخّرًا
  assert.equal(ctx.mahaStream, fresh, 'مايك المكالمة الجديدة باقٍ — كان يُستبدل');
  assert.equal(streams[1].stopped, 1, 'مايك المكالمة القديمة أُطفئ فورًا');
  assert.equal(fresh.stopped, 0);
  assert.equal(await oldTurn, null, 'الدور القديم بلا تسجيل');
});

test('cli-voice-5 د. mahaSpeak: صوت ردّ وصل بعد بدء مكالمة جديدة لا يُشغَّل فيها', async () => {
  let release;
  const plays = [];
  const audio = { play: async () => { plays.push(audio.src); }, pause() {} };
  const ctx = {
    mahaCallActive: true, mahaCallGen: 1, mahaDetectedGender: 'female', mahaReplyLang: 'en', mahaAudioEl: audio, mahaCurrentAudio: null,
    ttsAuthToken: () => '', ttsGuestId: () => '', URL: { createObjectURL: () => 'blob:1', revokeObjectURL() {} }, __swallow() {}, window: {},
    fetch: () => new Promise((r) => { release = r; }), mahaSetState() {}, mahaStartInterruptListener() {}, mahaStopInterruptListener() {}, setTimeout: (f) => setImmediate(f), Math, String, Promise, JSON,
  };
  vm.createContext(ctx);
  vm.runInContext(cut(MAHA, 'async function mahaSpeak(', '// Records the mic and uses volume-based'), ctx);
  const p = ctx.mahaSpeak('old reply', 1);
  await flush();
  ctx.mahaCallActive = false; ctx.mahaCallGen = 2; ctx.mahaCallActive = true; // إنهاء ثمّ فتح
  release({ ok: true, blob: async () => 'mp3' });
  await flush();
  assert.deepEqual(plays, [], 'كان يُشغَّل الردّ القديم في المكالمة الجديدة');
  await p; // ويُحسم وعده فلا تعلق الحلقة
  // الحالة العاديّة كما كانت
  const q = ctx.mahaSpeak('fresh reply', 2);
  await flush();
  release({ ok: true, blob: async () => 'mp3' });
  await flush();
  assert.deepEqual(plays, ['blob:1']);
  audio.onended(); await q;
});

test('cli-voice-5 هـ. mahaHandleRtFunctionCall: نتيجة أداة مكالمة قديمة لا تُرسل لقناة المكالمة الجديدة', async () => {
  let release;
  const sent1 = [], sent2 = [];
  const dc1 = { readyState: 'open', send: (x) => sent1.push(x) };
  const dc2 = { readyState: 'open', send: (x) => sent2.push(x) };
  const ctx = {
    mahaRtDc: dc1, mahaSetState() {}, mahaAppGate: () => null, mahaLastImageBase64: null, MAHA_IMG_PAUSED: 'p',
    mahaGenerateOrEditImage: () => new Promise((r) => { release = r; }), console: { error() {} }, JSON,
  };
  vm.createContext(ctx);
  vm.runInContext(cut(MAHA, 'async function mahaHandleRtFunctionCall(ev){', '// Like mahaMaybeSearch'), ctx);
  const p = ctx.mahaHandleRtFunctionCall({ name: 'generate_image', arguments: '{"prompt":"x"}', call_id: 'old' });
  await flush();
  ctx.mahaRtDc = dc2; // أُنهيت المكالمة وفُتحت فائقة جديدة أثناء توليد الصورة
  release({ ok: true });
  await p;
  assert.deepEqual(sent2, [], 'كانت ترسل function_call_output وresponse.create للجلسة الجديدة فتردّ مها بلا سؤال');
  assert.deepEqual(sent1, []);
});

/* ───────── cli-voice-9: شريط المكالمة ───────── */
function meterWorld(o = {}) {
  let now = 1000, raf = null, level = 0;
  const label = { textContent: '' };
  const els = { mahaMicMeter: { style: {} }, mahaMicMeterFill: { style: {} }, mahaStateLabel: label };
  class AC { createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { fftSize: 0, frequencyBinCount: 8, getByteTimeDomainData: (b) => { b.fill(128 + level); } }; } close() { return Promise.resolve(); } }
  const ctx = {
    mahaState: o.state || 'listening', mahaLastActivity: 0, mahaRtPlaying: !!o.playing, mahaOrbEl: null, mahaWaveEl: null, mahaStateLabelEl: label,
    MAHA_MIC_GAP_MS: 250, MAHA_REAL_SPEECH_LVL: 8, mahaMicLastTick: 0, mahaMicGapAt: -Infinity, mahaMicVoiced: [],
    t: tOf(o.dict || EN), __swallow(e) { throw e; }, mahaStopMicMeter() {}, AudioContext: AC, window: { AudioContext: AC },
    document: { getElementById: (id) => els[id] || null }, performance: { now: () => now }, Date: { now: () => now }, Math, Uint8Array,
    requestAnimationFrame: (fn) => { raf = fn; return 1; },
  };
  vm.createContext(ctx);
  vm.runInContext(cut(MAHA, 'function mahaSetState(state, customLabel){', 'function mahaStopVad(){') + cut(MAHA, 'let mahaMicMeterCtx = null', 'function mahaStopMicMeter(){'), ctx);
  ctx.mahaStartMicMeter({});
  const run = (ms, lvl) => { level = lvl; const end = now + ms; while (now < end) { now += 100; raf(); } };
  return { ctx, label, run };
}

test('cli-voice-9 أ. تحذير المايك بعد سكوت ٧ث بلغة الواجهة (mahaLowMic القائم بالـ١٤ لغة) — لا العربيّة الثابتة', () => {
  const w = meterWorld();
  w.ctx.mahaSetState('listening');
  w.run(8000, 0);
  assert.ok(!ARABIC.test(w.label.textContent), 'كان: ' + w.label.textContent);
  assert.ok(w.label.textContent.includes(EN.mahaLowMic), w.label.textContent);
});

test('cli-voice-9 ب. لا تحذير ومها تتكلّم (إلغاء الصدى يجعل المايك صامتًا) ولا وهي تفكّر — والعدّ يبدأ من رجوع الاستماع', () => {
  const w = meterWorld({ playing: true });
  w.ctx.mahaSetState('speaking');
  w.run(9000, 0);
  assert.equal(w.label.textContent, EN.mahaSpeaking, 'كان يكتب «صوتك ما يوصل» والمايك سليم');
  w.ctx.mahaSetState('thinking');
  w.ctx.mahaRtPlaying = false;
  w.run(9000, 0);
  assert.equal(w.label.textContent, EN.mahaThinking);
  w.ctx.mahaSetState('listening');
  w.run(3000, 0);
  assert.equal(w.label.textContent, EN.mahaListening, 'السكوت يُعدّ من رجوع الاستماع لا من بداية ردّها');
});

test('cli-voice-9 ج. حين يتكلّم المستخدم بعد التحذير يعود سطر الحالة «أستمع» — لا يُمسح السطر كلّه', () => {
  const w = meterWorld();
  w.ctx.mahaSetState('listening');
  w.run(8000, 0);
  assert.ok(w.label.textContent.includes(EN.mahaLowMic));
  w.run(200, 60);
  assert.equal(w.label.textContent, EN.mahaListening, 'كان يصير فارغًا');
});

test('cli-voice-9 د. السقوط للوضع الأساسيّ: سطر الحالة مترجم (احتياط إنجليزيّ/عربيّ قبل وصول المفتاح) — لا عربيّ ثابت لكلّ اللغات', async () => {
  const fail = async () => { throw new Error('Realtime setup failed'); };
  const en = mahaWorld({ rt: fail, lang: 'en' });
  await en.ctx.mahaStartCallInner('assistant');
  const note = (w) => w.states.filter(([s, c]) => s === 'thinking' && c).map(([, c]) => c).at(-1);
  assert.ok(!ARABIC.test(note(en)), 'كان: ' + note(en));
  assert.match(note(en), /basic/i);
  const fr = mahaWorld({ rt: fail, lang: 'fr', dict: Object.assign({}, EN, { axVoiceBasicFallback: 'FR-BASIC' }) });
  await fr.ctx.mahaStartCallInner('assistant');
  assert.equal(note(fr), 'FR-BASIC', 'المفتاح الجديد حين يصل القاموس');
  const ar = mahaWorld({ rt: fail, lang: 'ar', dict: {} });
  await ar.ctx.mahaStartCallInner('assistant');
  assert.ok(ARABIC.test(note(ar)), 'العربيّة لمستخدمها');
});

test('cli-voice-8 هـ. مها الأساسيّة: فشل التفريغ نصّ مترجم بلا تفاصيل الخادم بين قوسين', async () => {
  for (const [status, body, want] of [[402, { error: SERVER_402 }, EN.portraitLimitReached], [500, { error: 'Proxy error: fetch failed' }, EN.mahaSttError], [503, { error: 'unavailable' }, EN.svcPaused]]) {
    const w = mahaWorld();
    w.ctx.fetch = async () => ({ ok: false, status, json: async () => body });
    w.ctx.mahaCallActive = true;
    const loop = w.ctx.mahaCallLoop();
    await sleep(10); await flush();
    w.ctx.mahaCallActive = false;
    await loop;
    const err = w.states.find(([s]) => s === 'error');
    assert.ok(err, 'سطر خطأ');
    assert.equal(err[1], want, status + ': ' + err[1]);
  }
});

/* ───────── cli-voice-7: لغة القراءة ───────── */
const TTS = read('js/app-02-tts.js');
function detectWith(uiLang) {
  const ctx = { lang: uiLang };
  vm.createContext(ctx);
  vm.runInContext(cut(TTS, 'function detectSpeechLang(text){', '/* v-tts-free'), ctx);
  return ctx.detectSpeechLang;
}

test('cli-voice-7 أ. كشف الكتابة: الروسيّة ru والصينيّة zh والمالايالاميّة ml — كانت كلّها en', () => {
  for (const ui of ['ar', 'en', 'ru', 'zh', 'ml']) {
    const d = detectWith(ui);
    assert.equal(d('Привет! Как я могу помочь вам сегодня?'), 'ru', ui);
    assert.equal(d('你好！我今天能帮你什么？'), 'zh', ui);
    assert.equal(d('നമസ്കാരം! ഇന്ന് ഞാൻ എങ്ങനെ സഹായിക്കാം?'), 'ml', ui);
  }
});

test('cli-voice-7 ب. اللاتينيّ بلغة الواجهة اللاتينيّة: es وtr وid وfil تصل صحيحة (كانت fr أو en)، والتركيّة بحروفها حتّى بواجهة أخرى', () => {
  assert.equal(detectWith('es')('Hola, la mejor manera de aprender es practicar'), 'es');
  assert.equal(detectWith('tr')('Merhaba! Çok güzel bir gün'), 'tr');
  assert.equal(detectWith('en')('Merhaba! Size nasıl yardımcı olabilirim? Çok güzel'), 'tr');
  assert.equal(detectWith('id')('Halo, apa kabar? Saya bisa membantu Anda hari ini'), 'id');
  assert.equal(detectWith('fil')('Kumusta! Paano kita matutulungan ngayon?'), 'fil');
  assert.equal(detectWith('en')('¿Hola, cómo estás? Mañana nos vemos'), 'es');
});

test('cli-voice-7 ج. ما كان صحيحًا باقٍ: العربيّة والأردو والهنديّة والنيباليّة والبنغاليّة والفرنسيّة والإنجليزيّة', () => {
  for (const ui of ['ar', 'en', 'ur', 'hi']) {
    const d = detectWith(ui);
    assert.equal(d('مرحبا، كيف حالك؟'), 'ar');
    assert.equal(d('آپ کیسے ہیں؟ میں ٹھیک ہوں'), 'ur');
    assert.equal(d('नमस्ते, आप कैसे हैं?'), 'hi');
    assert.equal(d('তুমি কেমন আছো?'), 'bn');
  }
  assert.equal(detectWith('ar')('Bonjour, comment allez-vous ? Merci beaucoup'), 'fr');
  assert.equal(detectWith('ar')('Hello there, how are you doing today?'), 'en');
  assert.equal(detectWith('en')('Hello there, how are you doing today?'), 'en');
  assert.equal(detectWith('fr')('Bonjour, comment allez-vous ?'), 'fr');
});

test('cli-voice-7 د. صوت الجهاز الاحتياطيّ يأخذ وسم اللغة الصحيح للّغات الأربع عشرة (كان خمسًا فيقرأ الروسيّ بـen-US)', async () => {
  const a = TTS.indexOf('function detectSpeechLang(');
  const b = TTS.indexOf('function speakText(');
  const run = async (text, ui) => {
    const spoken = [];
    const ctx = {
      window: { speechSynthesis: { getVoices: () => [], speak: (u) => { if (u.volume !== 0) spoken.push(u); }, cancel() {} } },
      Audio: class { play() { return Promise.resolve(); } pause() {} addEventListener() {} },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
      localStorage: { getItem: (k) => (k === 'aiapp_voice_gender' ? 'female' : null), setItem() {} },
      fetch: async () => ({ ok: false, status: 429, json: async () => ({ error: 'refused' }) }),
      URL: { createObjectURL: () => 'blob:1' }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
      lang: ui, navigator: {}, alert() {}, console: { warn() {}, error() {}, log() {} }, __swallow() {},
    };
    vm.runInNewContext(TTS.slice(a, b) + '\nthis.api = { speakSmart };', ctx);
    await ctx.api.speakSmart(text, null, null, true);
    await flush();
    return spoken[0] && spoken[0].lang;
  };
  assert.equal(await run('Привет! Как дела?', 'ru'), 'ru-RU');
  assert.equal(await run('你好，今天怎么样？', 'zh'), 'zh-CN');
  assert.equal(await run('Hola, ¿cómo estás hoy?', 'es'), 'es-ES');
  assert.equal(await run('Merhaba, bugün nasılsın?', 'tr'), 'tr-TR');
  assert.equal(await run('Halo, apa kabar hari ini?', 'id'), 'id-ID');
  assert.equal(await run('Kumusta ka ngayong araw?', 'fil'), 'fil-PH');
  assert.equal(await run('സുഖമാണോ?', 'ml'), 'ml-IN');
  assert.equal(await run('তুমি কেমন আছো?', 'bn'), 'bn-BD');
  assert.equal(await run('مرحبا، كيف حالك؟', 'ar'), 'ar-SA', 'العربيّ كما كان');
});
