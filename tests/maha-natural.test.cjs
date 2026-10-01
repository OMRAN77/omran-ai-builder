'use strict';
/* v-maha-natural (المالك ١ أكتوبر: «الي عند GPT والي عندي نفس المفتاح… كأنه شخص يكلمني… تقدر تخليني الأقوى»):
   مها كانت تنتظر صمتًا ثابتًا ١١٠٠م.ث ثمّ يطلب العميل الردّ بعد ٣٥٠م.ث، ومخزن تشغيل ٠٫٢٥ث، وتعليمات تفرض
   حشوًا («اممم») وإجابات «كاملة غنيّة» = محاضرة لا مكالمة. الآن: كشف نهاية الجملة بالمعنى والخادم يردّ فورًا،
   والمقاطعة تُسكتها، ومخزن ٠٫١ث، وأسلوب مكالمة قصيرة الأدوار — مع مفتاح طوارئ MAHA_TURN=classic واحتياط
   تلقائيّ للإعداد السابق إن رفضت الواجهة الحقل. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function loadHandler() {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'maha-natural-secret';
  process.env.OPENAI_API_KEY = 'sk-test';
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1',
  } };
  require.cache[rp('api/_lib/points.js')] = { id: rp('api/_lib/points.js'), filename: rp('api/_lib/points.js'), loaded: true, exports: {
    verifyPointsToken: () => 'omran', isOwnerUsername: () => true, readPoints: async () => null, COSTS: { maha_minute: 10 },
  } };
  delete require.cache[rp('api/_lib/realtime-session.js')];
  return require(rp('api/_lib/realtime-session.js'));
}

// reply(session) ← { status, body } لكلّ نداء إلى OpenAI؛ الافتراضيّ قبول.
async function mint(body, reply) {
  const handler = loadHandler();
  const save = global.fetch;
  const sessions = [];
  global.fetch = async (url, init) => {
    const s = JSON.parse(init.body).session;
    sessions.push(s);
    const r = reply ? reply(s) : { status: 200, body: { value: 'ek_test' } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  const res = { code: 0, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send() { return res; }, end() { return res; } };
  try {
    await handler({ method: 'POST', headers: {}, socket: {}, body: Object.assign({ token: 't' }, body) }, res);
  } finally {
    global.fetch = save;
  }
  return { code: res.code, j: res.j, sessions, last: sessions[sessions.length - 1] };
}

test('١. الافتراضيّ: كشف نهاية الجملة بالمعنى، والخادم يردّ فورًا، والمقاطعة تُسكتها — والبنّاء كما هو', async () => {
  delete process.env.MAHA_TURN;
  const r = await mint({});
  assert.equal(r.code, 200);
  assert.deepEqual(r.last.audio.input.turn_detection, { type: 'semantic_vad', eagerness: 'high', create_response: true, interrupt_response: true });
  assert.equal(r.j.turn, 'natural', 'العميل يعرف أنّ الخادم هو من يبدأ الردّ');
  assert.equal(r.sessions.length, 1, 'نداء واحد');
  const b = await mint({ mode: 'builder' });
  assert.deepEqual(b.last.audio.input.turn_detection, { type: 'server_vad', threshold: 0.88, prefix_padding_ms: 300, silence_duration_ms: 800 });
  assert.equal(b.j.turn, 'classic');
});

test('٢. مفتاح الطوارئ MAHA_TURN: classic يعيد الإعداد السابق حرفيًّا، وlow|medium|high يضبط الانتظار', async () => {
  try {
    process.env.MAHA_TURN = 'classic';
    const c = await mint({});
    assert.deepEqual(c.last.audio.input.turn_detection, { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 1000, silence_duration_ms: 1100, create_response: false });
    assert.equal(c.j.turn, 'classic');
    process.env.MAHA_TURN = ' Medium ';
    const m = await mint({});
    assert.equal(m.last.audio.input.turn_detection.eagerness, 'medium');
    process.env.MAHA_TURN = 'bogus';
    assert.equal((await mint({})).last.audio.input.turn_detection.eagerness, 'high', 'قيمة دخيلة = الافتراضيّ');
  } finally { delete process.env.MAHA_TURN; }
});

test('٣. رفض الواجهة لكشف المعنى لا يُسقط المكالمة: الإعداد السابق، والسرعة باقية متى سمّى الخطأ الحقل', async () => {
  delete process.env.MAHA_TURN;
  const named = await mint({ voiceSpeed: 'fast' }, (s) => s.audio.input.turn_detection.type === 'semantic_vad'
    ? { status: 400, body: { error: { message: "Invalid value: 'semantic_vad'. Supported values for session.audio.input.turn_detection.type are 'server_vad'." } } }
    : { status: 200, body: { value: 'ek_test' } });
  assert.equal(named.code, 200);
  assert.equal(named.j.turn, 'classic', 'العميل يعود لحارسه السريع');
  assert.equal(named.sessions.length, 2);
  assert.equal(named.last.audio.input.turn_detection.silence_duration_ms, 1100);
  assert.equal(named.last.audio.output.speed, 1.1, 'السرعة لم تُحذف بلا داعٍ');

  const vague = await mint({}, (s) => s.audio.input.turn_detection.type === 'semantic_vad'
    ? { status: 400, body: { error: { message: 'Invalid request.' } } }
    : { status: 200, body: { value: 'ek_test' } });
  assert.equal(vague.code, 200);
  assert.equal(vague.j.turn, 'classic');
  assert.equal(vague.sessions.length, 3, 'السرعة أوّلًا (المسار القائم)، ثمّ الإعداد السابق');

  const key = await mint({}, () => ({ status: 401, body: { error: { message: 'Incorrect API key' } } }));
  assert.equal(key.code, 401, 'خطأ المفتاح يظهر كما هو');
  assert.ok(key.sessions.every((s) => s.audio.input.turn_detection.type === 'semantic_vad'), 'لا تبديل للإعداد على خطأ مفتاح');
});

test('٤. أسلوب مكالمة لا محاضرة: أدوار قصيرة، تنويع، مقاطعة — والقواعد القائمة باقية، وعبدالله كما هو', async () => {
  delete process.env.MAHA_TURN;
  const f = (await mint({})).last.instructions;
  for (const line of [
    '# Conversation Style - a real person on a phone call',
    'Default turn: 1-3 short spoken sentences, then stop.',
    'INTERRUPTIONS: if the user cuts in while you are talking, stop and respond to what they just said',
    'VARIETY: never repeat the same opener, reaction, or filler twice in a row',
    'offer to continue instead of a long monologue',
  ]) assert.ok(f.includes(line), line);
  assert.ok(!f.includes("('اممم', 'إي', 'تمام')"), 'لا حشو مفروض');
  assert.ok(!f.includes('answer with FULL substance and detail like a knowledgeable expert'), 'لا محاضرة افتراضيّة');
  for (const kept of ['TOP PRIORITY: give ACCURATE', 'FULL BULLETIN RULE', 'HONESTY OF EXECUTION', 'LISTENING: wait for the user to finish', 'EDUCATION MODE', 'PACE: speak at a steady']) {
    assert.ok(f.includes(kept), 'باقٍ: ' + kept);
  }
  const m = (await mint({ voiceGender: 'male' })).last.instructions;
  assert.ok(m.includes('You are "عبدالله" (Abdullah), a warm, smart male voice assistant'));
  assert.ok(!m.includes('You are "Maha"'));
  assert.ok(m.includes('# Conversation Style - a real person on a phone call'));
});

function rtListener(natural) {
  const src = read('js/app-08-maha.js');
  const a = src.indexOf("dc.addEventListener('message', (e) => {");
  const b = src.indexOf('const offer = await pc.createOffer();', a);
  assert.ok(a > 0 && b > a);
  const armed = [];
  const ctx = {
    armed, mahaRtNatural: natural, mahaLastActivity: 0, rtSessionReadySeen: false,
    resolveRtSessionReady() {}, mahaClearRtResponseWatchdog() {}, mahaSetState() {}, mahaHandleRtFunctionCall() {},
    mahaArmRtResponseWatchdog: (ms) => armed.push(ms), console: { error() {} },
    dc: { addEventListener(type, fn) { ctx.on = fn; } },
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b), ctx);
  return { armed, fire: (ev) => ctx.on({ data: JSON.stringify(ev) }) };
}

test('٥. العميل: الخادم يبدأ الردّ فحارس العميل احتياط متأخّر (١٫٥ث)؛ والإعداد السابق على ٣٥٠م.ث كما كان', () => {
  const nat = rtListener(true);
  nat.fire({ type: 'input_audio_buffer.speech_stopped' });
  assert.deepEqual(nat.armed, [1500]);
  const old = rtListener(false);
  old.fire({ type: 'input_audio_buffer.speech_stopped' });
  assert.deepEqual(old.armed, [350]);
  nat.fire({ type: 'input_audio_buffer.speech_started' });
  assert.deepEqual(nat.armed, [1500, 20000], 'شبكة أمان بدء الكلام كما هي');
});

test('٦. العميل: نوع الإنصات يُقرأ من الخادم قبل الاتّصال، ومخزن التشغيل ٠٫٢٥ث (v-voice-stutter) — والحزمة محدَّثة', () => {
  for (const f of ['js/app-08-maha.js', 'js/app.bundle.js']) {
    const s = read(f);
    const call = s.slice(s.indexOf('async function mahaStartRealtimeCall(){'));
    const set = call.indexOf("mahaRtNatural = tokenData.turn === 'natural';");
    assert.ok(set > 0 && set < call.indexOf('new RTCPeerConnection()'), f + ': قبل الاتّصال');
    assert.ok(s.includes("receiver.playoutDelayHint = 0.25; }"), f + ': v-voice-stutter — ٠٫٢٥ث، وأكّده المالك «بعدها كانت أفضل»');
  }
});
