'use strict';
/* v-voice-speed-range (المالك ٢٣ سبتمبر: «الصوت عندي ٤: بطيء وعادي… يعني البطيء جدًّا والسريع جدًّا كأنّه عادي»):
   (١) بعد v-maha-pace صارت الدرجات 0.9/1/1.1/1.2 — جملة «تجربة الصوت» (~٢ث) تختلف بـ٠٫٢ث للبطيء و٠٫٣ث للسريع جدًّا:
   لا تُسمع. قبلها 0.75/1.5 كانت «ما تفهم عليها». المدى الجديد بينهما: 0.8/1/1.2/1.4 — كلّ درجة أبعد من ١٥٪ عن جارتها،
   ولا شيء عند حدَّي الشكوى الأولى. (٢) في مكالمة مها المباشرة كان أيّ رفض أوّل لإنشاء الجلسة (حقل التفريغ، عطل عابر)
   يحذف السرعة قبل الإعادة، فتسير المكالمة على «عاديّ» مهما اختير — الآن يُحذف الحقل الذي يسمّيه الخطأ وحده. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

const WANT = { slow: 0.8, normal: 1, fast: 1.2, xfast: 1.4 };

test('١. المدى يُسمع ولا يتطرّف: كلّ درجة تبعد ١٥٪ على الأقلّ عن جارتها، والطرفان داخل (0.75، 1.5)', () => {
  const order = ['slow', 'normal', 'fast', 'xfast'];
  for (let i = 1; i < order.length; i++) {
    const r = WANT[order[i]] / WANT[order[i - 1]];
    assert.ok(r >= 1.15, order[i - 1] + '→' + order[i] + ' نسبة ' + r.toFixed(3));
  }
  assert.ok(WANT.slow > 0.75 && WANT.xfast < 1.5, 'لا عودة لحدَّي «ما تفهم عليها»');
  // جملة تجربة الصوت العربيّة طويلة بما يكفي ليُسمع الفرق (≥ ٤٠ حرفًا ≈ ٣–٤ ثوانٍ)
  const m = read('js/app-07-voice.js').match(/testTextByLang = \{\s*ar: '([^']+)'/);
  assert.ok(m && m[1].length >= 40, 'جملة التجربة: ' + (m && m[1].length));
});

test('٢. المسارات الأربعة على المدى نفسه: Azure وOpenAI في tts.js، وصوت الجهاز، والمكالمة المباشرة', async () => {
  const ttsSrc = read('api/_lib/tts.js');
  assert.ok(ttsSrc.includes("slow: { azureRate: '-20%', openaiSpeed: 0.8 }"));
  assert.ok(ttsSrc.includes("normal: { azureRate: '0%', openaiSpeed: 1 }"));
  assert.ok(ttsSrc.includes("fast: { azureRate: '+20%', openaiSpeed: 1.2 }"));
  assert.ok(ttsSrc.includes("xfast: { azureRate: '+40%', openaiSpeed: 1.4 }"));
  for (const f of ['js/app-02-tts.js', 'js/app.bundle.js']) {
    assert.ok(read(f).includes('utter.rate = ({ slow: 0.8, normal: 1, fast: 1.2, xfast: 1.4 })[ttsSpeedSetting()] || 1;'), f);
  }
  assert.ok(read('api/_lib/realtime-session.js').includes('const REALTIME_SPEED = { slow: 0.8, normal: 1.0, fast: 1.2, xfast: 1.4 };'));
  // تشغيل tts.js فعلًا: Azure يستلم النسبة في SSML لكلّ درجة
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'speed-range-secret';
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsumeCustom: async () => ({ allowed: true }), clientIp: () => '127.0.0.1',
  } };
  delete require.cache[rp('api/_lib/tts.js')];
  const handler = require(rp('api/_lib/tts.js'));
  const saved = { fetch: global.fetch, key: process.env.AZURE_SPEECH_KEY, free: process.env.AZURE_SPEECH_KEY_FREE };
  process.env.AZURE_SPEECH_KEY = 'k'; delete process.env.AZURE_SPEECH_KEY_FREE;
  const ssml = [];
  global.fetch = async (url, init) => { ssml.push(String(init.body)); return new Response(new Uint8Array([0xff, 0xf3]).buffer, { status: 200 }); };
  try {
    for (const [speed, rate] of [['slow', '-20%'], ['normal', '0%'], ['fast', '+20%'], ['xfast', '+40%']]) {
      const res = { code: 0, setHeader() { return res; }, status(c) { res.code = c; return res; }, json() { return res; }, send() { return res; }, end() { return res; } };
      await handler({ method: 'POST', headers: {}, socket: {}, body: { voice: 'maha', text: 'مرحبا', lang: 'ar', speed } }, res);
      assert.equal(res.code, 200);
      assert.ok(ssml[ssml.length - 1].includes('<prosody rate="' + rate + '"'), speed + ' → ' + rate);
    }
  } finally {
    global.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.AZURE_SPEECH_KEY; else process.env.AZURE_SPEECH_KEY = saved.key;
    if (saved.free !== undefined) process.env.AZURE_SPEECH_KEY_FREE = saved.free;
    delete require.cache[rp('api/_lib/_usage.js')]; delete require.cache[rp('api/_lib/tts.js')];
  }
});

/* ---------- مكالمة مها المباشرة: رفض لا يخصّ السرعة لا يحذفها ---------- */
async function runRealtime(voiceSpeed, respond) {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'speed-range-secret';
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1',
  } };
  require.cache[rp('api/_lib/points.js')] = { id: rp('api/_lib/points.js'), filename: rp('api/_lib/points.js'), loaded: true, exports: {
    verifyPointsToken: () => 'omran', isOwnerUsername: () => true, readPoints: async () => null, COSTS: { maha_minute: 10 },
  } };
  delete require.cache[rp('api/_lib/realtime-session.js')];
  const handler = require(rp('api/_lib/realtime-session.js'));
  const savedFetch = global.fetch;
  const sent = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    return respond(body, sent.length);
  };
  try {
    const res = { code: 0, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send() { return res; }, end() { return res; } };
    await handler({ method: 'POST', headers: {}, socket: {}, body: { token: 't', voiceSpeed } }, res);
    return { res, sent, ok: sent[sent.length - 1] };
  } finally {
    global.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    delete require.cache[rp('api/_lib/_usage.js')];
    delete require.cache[rp('api/_lib/points.js')];
    delete require.cache[rp('api/_lib/realtime-session.js')];
  }
}
const okSession = () => new Response(JSON.stringify({ value: 'ek_test' }), { status: 200 });
const bad = (status, msg, param) => new Response(JSON.stringify({ error: { message: msg, param: param || null } }), { status });

test('٣. رفض حقل التفريغ لا يحذف السرعة: المكالمة تنجح بسرعة «بطيء» كما اختيرت', async () => {
  const { res, ok } = await runRealtime('slow', (b) => (b.session.audio.input.transcription
    ? bad(400, "Invalid value for 'session.audio.input.transcription.model'.", 'session.audio.input.transcription.model')
    : okSession()));
  assert.equal(res.code, 200);
  assert.equal(ok.session.audio.output.speed, 0.8, 'السرعة باقية');
  assert.equal(ok.session.audio.input.transcription, undefined, 'حُذف ما سمّاه الخطأ وحده');
});

test('٤. عطل عابر (500) يُعاد كما هو فتبقى السرعة، ورفض السرعة نفسها يحذفها وحدها', async () => {
  const transient = await runRealtime('xfast', (b, n) => (n === 1 ? bad(500, 'The server had an error') : okSession()));
  assert.equal(transient.res.code, 200);
  assert.equal(transient.ok.session.audio.output.speed, 1.4, 'بعد العطل العابر السرعة كما اختيرت');
  assert.ok(transient.ok.session.audio.input.transcription, 'والتفريغ باقٍ');
  const speedRejected = await runRealtime('fast', (b) => (b.session.audio.output.speed != null
    ? bad(400, "Unknown parameter: 'session.audio.output.speed'.", 'session.audio.output.speed')
    : okSession()));
  assert.equal(speedRejected.res.code, 200, 'المكالمة لا تنكسر');
  assert.equal(speedRejected.ok.session.audio.output.speed, undefined);
  assert.ok(speedRejected.ok.session.audio.input.transcription, 'التفريغ باقٍ');
  // شبكة الأمان القديمة: خطأ عنيد لا يسمّي شيئًا يظلّ ينتهي بجلسة بلا الحقلين الاختياريّين
  const stubborn = await runRealtime('slow', (b) => ((b.session.audio.output.speed != null || b.session.audio.input.transcription)
    ? bad(400, 'Invalid session') : okSession()));
  assert.equal(stubborn.res.code, 200);
});
