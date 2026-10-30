// v-el-voices (المالك ٢٩ أكتوبر: «كلهم اللي أريدهم» في مكتبة ElevenLabs، ثمّ «لا تنسى… أصوات لمحرّكات الفيديوهات بعد»):
// «استمع» وتعليق الفيديو للمالك بالصوتين اللذين اختارهما متى وُجد ELEVENLABS_API_KEY؛ بدونه أو لغيره لا شيء يتغيّر.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const MALE = 'lXwVtAOOlP0Qf7aXOebM';
const FEMALE = '4uJbyDJGijiDphW2T3vP';

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

// the real handler; usage says who is asking, and every outside call is recorded and answered by `answer`
async function withTts(env, username, answer, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsumeCustom: async () => ({ allowed: true, username }), clientIp: () => '127.0.0.1',
  } };
  for (const f of ['api/_lib/tts.js', 'api/_lib/el-voices.js', 'api/_lib/om-voices.js']) delete require.cache[rp(f)];
  const handler = require(rp('api/_lib/tts.js'));
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { calls.push({ url: String(url), init }); return answer(String(url), init, calls.length); };
  const errLog = console.error;
  console.error = () => {};
  try {
    const speak = async (body) => { const res = fakeRes(); await handler({ method: 'POST', body, headers: {}, socket: {} }, res); return res; };
    return await fn(speak, calls);
  } finally {
    global.fetch = realFetch;
    console.error = errLog;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require.cache[rp('api/_lib/_usage.js')]; delete require.cache[rp('api/_lib/tts.js')];
  }
}
const MP3 = new Uint8Array(400).fill(7);
const ok = () => new Response(MP3, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
const ENV = { ELEVENLABS_API_KEY: 'el-test-key', EL_VOICE_MALE: undefined, EL_VOICE_FEMALE: undefined, EL_MODEL: undefined,
  AZURE_SPEECH_KEY_FREE: 'free-key', AZURE_SPEECH_KEY: undefined, OM_VOICES_KEY: undefined, OWNER_USERNAMES: undefined, OWNER_USERNAME: undefined };
const isEl = (c) => c.url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/');

test('المالك: «استمع» والفيديو بصوتيه (رجل وامرأة) والموديل الأحدث والمفتاح في رأسه، وMP3 يرجع كما هو', () =>
  withTts(ENV, 'omran', ok, async (speak, calls) => {
    let r = await speak({ text: 'هلا والله', voice: 'maha', src: 'reply', lang: 'ar', gender: 'male', speed: 'fast' });
    assert.equal(r.code, 200);
    assert.equal(r.headers['Content-Type'], 'audio/mpeg');
    assert.equal(Buffer.from(r.body).length, 400);
    assert.ok(calls[0].url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/' + MALE + '?'));
    assert.equal(calls[0].init.headers['xi-api-key'], 'el-test-key');
    assert.deepEqual(JSON.parse(calls[0].init.body), { text: 'هلا والله', model_id: 'eleven_v4', voice_settings: { speed: 1.1 } });
    r = await speak({ text: 'مرحبا', voice: 'maha', src: 'video', lang: 'ar', gender: 'female' });
    assert.equal(r.code, 200);
    assert.ok(calls[1].url.includes('/' + FEMALE + '?'), 'الفيديو بصوت المرأة');
    assert.deepEqual(JSON.parse(calls[1].init.body), { text: 'مرحبا', model_id: 'eleven_v4' }, 'السرعة العاديّة بلا إعدادات');
    assert.equal(calls.length, 2);
  }));

test('لا يتغيّر شي: بلا مفتاح، أو لغير المالك، أو مكالمة مها (بلا src) — يبقى صوت مها', async () => {
  const azure = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  for (const [env, user, src] of [[{ ...ENV, ELEVENLABS_API_KEY: undefined }, 'omran', 'reply'], [ENV, 'someone', 'reply'], [ENV, 'omran', undefined]]) {
    await withTts(env, user, azure, async (speak, calls) => {
      const r = await speak({ text: 'هلا', voice: 'maha', src, lang: 'ar', gender: 'female' });
      assert.equal(r.code, 200);
      assert.ok(!calls.some(isEl), JSON.stringify([user, src]));
      assert.ok(calls[0].url.includes('tts.speech.microsoft.com'));
    });
  }
});

test('نفاد الرصيد أو حساب مجّانيّ: «استمع» ⇐ 429 om-quota بلا صوت بديل، والفيديو يكمل بمها', async () => {
  const quota = (url) => (url.includes('elevenlabs') ? new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 })
    : new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  await withTts(ENV, 'omran', quota, async (speak, calls) => {
    const r = await speak({ text: 'هلا', voice: 'maha', src: 'reply', lang: 'ar' });
    assert.equal(r.code, 429);
    assert.deepEqual(r.body, { error: 'om-quota', code: 'om_quota' });
    assert.equal(calls.length, 1, 'لا مها بعده');
  });
  const free = (url) => (url.includes('elevenlabs') ? new Response('{"detail":{"status":"payment_required","message":"Free users cannot use library voices via the API"}}', { status: 402 })
    : new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  await withTts(ENV, 'omran', free, async (speak, calls) => {
    const r = await speak({ text: 'هلا', voice: 'maha', src: 'video', lang: 'ar' });
    assert.equal(r.code, 200, 'الفيديو ما يطلع صامت');
    assert.ok(isEl(calls[0]) && calls[1].url.includes('tts.speech.microsoft.com'));
  });
  await withTts(ENV, 'omran', (url) => (url.includes('elevenlabs') ? new Response('boom', { status: 500 }) : new Response(new Uint8Array([1]), { status: 200 })), async (speak) => {
    const r = await speak({ text: 'هلا', voice: 'maha', src: 'reply', lang: 'ar' });
    assert.equal(r.code, 502);
    assert.equal(r.body.code, 'om_failed');
  });
});

test('الموديل الأحدث مرفوض باسمه ⇐ مرّة ثانية بالمتعدّد اللغات، ومتغيّرات البيئة تغلب الرقمين', async () => {
  const answer = (url, init, n) => (n === 1 ? new Response('{"detail":"model eleven_v4 not found"}', { status: 400 }) : ok());
  await withTts(ENV, 'omran', answer, async (speak, calls) => {
    const r = await speak({ text: 'هلا', voice: 'maha', src: 'reply', lang: 'ar', gender: 'male' });
    assert.equal(r.code, 200);
    assert.equal(JSON.parse(calls[1].init.body).model_id, 'eleven_multilingual_v2');
  });
  await withTts({ ...ENV, EL_VOICE_MALE: 'abc123', EL_MODEL: 'eleven_v3' }, 'omran', ok, async (speak, calls) => {
    await speak({ text: 'هلا', voice: 'maha', src: 'reply', lang: 'ar', gender: 'male' });
    assert.ok(calls[0].url.includes('/abc123?'));
    assert.equal(JSON.parse(calls[0].init.body).model_id, 'eleven_v3');
  });
});

test('العميل: كلّ طلبات تعليق الفيديو ترسل src video، والوسمان مرفوعان، ولا مفتاح في أيّ ملفّ', () => {
  const v11 = read('js/app-11-video.js');
  assert.equal((v11.match(/voice: 'maha', src: 'video', lang: bT\('ar','en'\)/g) || []).length, 5);
  assert.ok(!/voice: 'maha', lang: bT\('ar','en'\)/.test(v11), 'ما بقي طلب فيديو بلا src');
  assert.match(read('js/video.js'), /voice:'maha',src:'video',lang:lang,gender:speaker/);
  assert.match(read('js/video-edit.js'), /voice: 'maha', src: 'video', gender: K\('ttsGender'\)\.value/);
  const html = read('index.html');
  assert.ok(Number((/\/js\/video\.js\?v=(\d+)"/.exec(html) || [])[1]) >= 464);
  assert.ok(Number((/\/js\/video-edit\.js\?v=(\d+)"/.exec(html) || [])[1]) >= 10);
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("voice: 'maha', src: 'video', lang: bT('ar','en')"), 'الحزمة مطابقة');
  for (const f of ['api/_lib/el-voices.js', 'js/app-11-video.js', 'js/video.js']) assert.ok(!/sk_[A-Za-z0-9]{20,}/.test(read(f)), f);
});

test('النصّ إلى ElevenLabs منظّف من التنسيق، بلا تبديلات نطق Azure: «هلا والله» و«عبدالله» كما كُتبا', () =>
  withTts(ENV, 'omran', ok, async (speak, calls) => {
    await speak({ text: '**هلا والله**، أنا عبدالله 👍', voice: 'maha', src: 'reply', lang: 'ar', gender: 'male' });
    assert.equal(JSON.parse(calls[0].init.body).text, 'هلا والله، أنا عبدالله');
  }));
