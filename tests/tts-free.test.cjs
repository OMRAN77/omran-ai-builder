'use strict';
/* v-tts-free (المالك ٢٣ سبتمبر: «افضل صوت يقرى لي… المتحدث في التطبيق بالمجان»):
   أفضل صوت عربيّ للقراءة هو صوت فاطمة/حمدان الإماراتيّ نفسه، ومجّانًا رسميًّا بباقة Azure المجّانيّة F0
   (٥٠٠ ألف حرف شهريًّا، ٢٠ طلبًا في الدقيقة، لا تُحاسِب أبدًا). المفتاح المجّانيّ AZURE_SPEECH_KEY_FREE يُجرَّب
   أوّلًا، والمدفوع بعده بالصوت نفسه، والمجّانيّ وحده لا يهبط لمحرّك مدفوع. وفي العميل: مقاطع أكبر (حدّ الدقيقة
   وحصّة اليوم)، ورفض الخادم = بقيّة الردّ بأفضل صوت في الجهاز بدل الصمت، والإيقاف يوقف فعلًا. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

/* ---------------- الخادم: api/_lib/tts.js ---------------- */
const ENV_KEYS = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_KEY_FREE', 'AZURE_SPEECH_REGION', 'AZURE_SPEECH_REGION_FREE', 'OPENAI_API_KEY'];

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

async function runTts(env, respond) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsumeCustom: async () => ({ allowed: true }), clientIp: () => '127.0.0.1',
  } };
  delete require.cache[rp('api/_lib/tts.js')];
  const handler = require(rp('api/_lib/tts.js'));
  const calls = [];
  const savedFetch = global.fetch;
  global.fetch = async (url, init) => {
    const h = (init && init.headers) || {};
    const call = { url: String(url), key: h['Ocp-Apim-Subscription-Key'] || '', openai: /api\.openai\.com/.test(String(url)) };
    calls.push(call);
    return respond(call, calls.length);
  };
  try {
    const res = fakeRes();
    await handler({ method: 'POST', headers: {}, socket: {}, body: { voice: 'maha', text: 'مرحبًا، هذا اختبار للصوت.', lang: 'ar', gender: 'female' } }, res);
    return { res, calls };
  } finally {
    global.fetch = savedFetch;
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    delete require.cache[rp('api/_lib/_usage.js')];
    delete require.cache[rp('api/_lib/tts.js')];
  }
}
const audioOk = () => new Response(new Uint8Array([0xff, 0xf3, 1, 2]).buffer, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
const refused = (status) => new Response('quota exceeded', { status });

test('١. المفتاح المجّانيّ أوّلًا — صوت فاطمة نفسه بلا كلفة، ولا يُلمس المدفوع', async () => {
  const { res, calls } = await runTts({ AZURE_SPEECH_KEY_FREE: 'free-k', AZURE_SPEECH_KEY: 'paid-k', OPENAI_API_KEY: 'oa' }, () => audioOk());
  assert.equal(res.code, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'free-k');
  assert.match(calls[0].url, /^https:\/\/uaenorth\.tts\.speech\.microsoft\.com\//);
  assert.equal(res.headers['X-TTS-Tier'], 'free');
});

test('٢. الحدّ المجّانيّ انتهى (429) — المدفوع يكمل بالصوت نفسه، لا OpenAI', async () => {
  const { res, calls } = await runTts({ AZURE_SPEECH_KEY_FREE: 'free-k', AZURE_SPEECH_KEY: 'paid-k', OPENAI_API_KEY: 'oa' },
    (c) => (c.key === 'free-k' ? refused(429) : audioOk()));
  assert.equal(res.code, 200);
  assert.deepEqual(calls.map((c) => c.key), ['free-k', 'paid-k']);
  assert.ok(!calls.some((c) => c.openai), 'لا محرّك آخر');
  assert.equal(res.headers['X-TTS-Tier'], 'paid');
});

test('٣. المفتاح المجّانيّ وحده = مجّانيّ فقط: انتهاء الحدّ لا يهبط لـOpenAI المدفوع، ويعيد الرفض للعميل', async () => {
  const { res, calls } = await runTts({ AZURE_SPEECH_KEY_FREE: 'free-k', OPENAI_API_KEY: 'oa' }, () => refused(429));
  assert.equal(calls.length, 1);
  assert.ok(!calls.some((c) => c.openai), 'لا إنفاق');
  assert.equal(res.code, 429);
  assert.ok(res.body && res.body.error);
});

test('٤. الإعداد الحاليّ (المدفوع وحده) كما هو: عطل Azure = OpenAI احتياطًا', async () => {
  const { res, calls } = await runTts({ AZURE_SPEECH_KEY: 'paid-k', OPENAI_API_KEY: 'oa' }, (c) => (c.openai ? audioOk() : refused(500)));
  assert.equal(res.code, 200);
  assert.deepEqual(calls.map((c) => (c.openai ? 'openai' : c.key)), ['paid-k', 'openai']);
  assert.equal(res.headers['X-TTS-Tier'], 'fallback');
  const none = await runTts({ OPENAI_API_KEY: 'oa' }, () => audioOk());
  assert.equal(none.res.code, 500, 'بلا أيّ مفتاح Azure كما كان');
  assert.equal(none.calls.length, 0);
});

test('٥. منطقة المفتاح المجّانيّ مستقلّة، وتعثّر الشبكة فيه ينتقل للمدفوع', async () => {
  const { res, calls } = await runTts({ AZURE_SPEECH_KEY_FREE: 'free-k', AZURE_SPEECH_REGION_FREE: 'westeurope', AZURE_SPEECH_KEY: 'paid-k', AZURE_SPEECH_REGION: 'uaenorth' },
    (c) => { if (c.key === 'free-k') throw new Error('ECONNRESET'); return audioOk(); });
  assert.equal(res.code, 200);
  assert.match(calls[0].url, /^https:\/\/westeurope\./);
  assert.match(calls[1].url, /^https:\/\/uaenorth\./);
  assert.equal(res.headers['X-TTS-Tier'], 'paid');
});

/* ---------------- العميل: js/app-02-tts.js ---------------- */
function loadClient(opts) {
  const o = opts || {};
  const src = read('js/app-02-tts.js');
  const a = src.indexOf('function detectSpeechLang(');
  const b = src.indexOf('function speakText(');
  assert.ok(a > 0 && b > a, 'المقطع موجود');
  const spoken = [];
  const unlocks = [];
  const plays = [];
  const audios = [];
  const store = Object.assign({ aiapp_voice_gender: 'female' }, o.store || {});
  const synth = {
    getVoices: () => o.voices || [],
    speak(u) { (u.volume === 0 ? unlocks : spoken).push(u); },
    cancel() { spoken.canceled = (spoken.canceled || 0) + 1; },
  };
  class FakeAudio {
    constructor() { this.src = ''; this.paused = true; audios.push(this); }
    play() { if (!/^data:audio\/wav/.test(this.src)) plays.push(this.src); this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
    addEventListener() {}
  }
  let n = 0;
  const ctx = {
    window: o.noDevice ? {} : { speechSynthesis: synth },
    Audio: FakeAudio,
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    fetch: o.fetch,
    URL: { createObjectURL: () => 'blob:' + (++n) },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    lang: 'ar',
    navigator: o.navigator || {},
    alert() {},
    console: { warn() {}, error() {}, log() {} },
    __swallow() {},
  };
  vm.runInNewContext(src.slice(a, b) + '\nthis.api = { speakSmart, stopAllSpeaking, splitTextForTTS, pickVoice };', ctx);
  return { api: ctx.api, spoken, unlocks, plays, audios };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const okResp = () => ({ ok: true, status: 200, blob: async () => 'mp3' });
const refusedResp = (status) => ({ ok: false, status, json: async () => ({ error: 'refused' }) });

test('٦. المقاطع: الأوّل قصير (يبدأ الصوت فورًا) وما بعده جمل مجموعة — ردّ من ٢٠ سطرًا قصيرًا لم يعد ٢٠ طلبًا', () => {
  const { api } = loadClient({ fetch: async () => okResp() });
  const lines = Array.from({ length: 20 }, (_, i) => 'هذه جملة قصيرة رقم ' + (i + 1) + ' في الردّ.');
  const text = lines.join('\n');
  const chunks = api.splitTextForTTS(text);
  assert.equal(chunks[0].text, lines[0], 'المقطع الأوّل جملة واحدة كما كان');
  assert.ok(chunks.length <= 6, 'عدد الطلبات ' + chunks.length);
  const words = text.split(/\s+/).filter(Boolean);
  let next = 0;
  for (const c of chunks) {
    assert.equal(c.wordStart, next, 'متّصلة بلا فجوة');
    assert.equal(c.text, words.slice(c.wordStart, c.wordStart + c.wordCount).join(' '));
    assert.ok(c.text.length <= 420, 'سقف المقطع ' + c.text.length);
    next += c.wordCount;
  }
  assert.equal(next, words.length, 'كلّ الكلمات مقروءة بترتيبها');
  assert.equal(api.splitTextForTTS('').length, 0);
});

test('٧. رفض الخادم من أوّل مقطع (حدّ مجّانيّ/حصّة اليوم) — الردّ كلّه بصوت الجهاز بدل الصمت', async () => {
  const text = 'مرحبًا، هذا ردّ قصير. وهذه جملة ثانية فيه للتجربة.';
  const { api, spoken, unlocks, plays } = loadClient({ fetch: async () => refusedResp(429) });
  let started = 0, ended = 0;
  const p = api.speakSmart(text, () => { started++; }, () => { ended++; }, true);
  assert.equal(unlocks.length, 1, 'صوت الجهاز يُفتح داخل الضغطة نفسها (قبل أيّ انتظار) — شرط آيفون');
  await p;
  await tick();
  assert.equal(plays.length, 0);
  assert.equal(spoken.length, 1, 'صوت الجهاز قرأ');
  assert.equal(spoken[0].text, text);
  assert.equal(spoken[0].lang, 'ar-SA');
  assert.equal(started, 1);
  spoken[0].onend();
  assert.equal(ended, 1);
  await api.speakSmart('جملة أخرى للتجربة.', null, null, false);
  assert.equal(unlocks.length, 1, 'الفتح الصامت مرّة واحدة فقط');
});

test('٨. رفض في منتصف الردّ — بقيّته فقط بصوت الجهاز من أوّل كلمة لم تُقرأ', async () => {
  const first = 'هذه الجملة الأولى في الردّ.';
  const rest = Array.from({ length: 12 }, (_, i) => 'وهذه جملة تالية رقم ' + (i + 1) + ' تكمل الكلام.').join(' ');
  const text = first + ' ' + rest;
  let calls = 0;
  const { api, spoken, plays, audios } = loadClient({ fetch: async () => (++calls === 1 ? okResp() : refusedResp(429)) });
  let started = 0;
  await api.speakSmart(text, () => { started++; }, null, false);
  assert.equal(plays.length, 1, 'المقطع الأوّل بالصوت السحابيّ');
  const audio = audios.find((x) => x.onended);
  audio.onended();
  await tick(); await tick();
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, rest, 'البقيّة بلا تكرار ولا نقص');
  assert.equal(started, 1, 'onStart مرّة واحدة');
});

test('٩. الإيقاف أثناء جلب المقطع يوقف فعلًا — لا صوت يبدأ بعد «إيقاف»', async () => {
  let release;
  const { api, spoken, plays } = loadClient({ fetch: () => new Promise((r) => { release = r; }) });
  const p = api.speakSmart('جملة تُقرأ ثمّ يوقفها المستخدم قبل وصول الصوت.', null, null, false);
  await tick();
  api.stopAllSpeaking();
  release(okResp());
  await p; await tick();
  assert.equal(plays.length, 0, 'لا تشغيل بعد الإيقاف');
  assert.equal(spoken.length, 0, 'ولا صوت جهاز');
});

test('١٠. بلا صوت جهاز أصلًا: الرفض يتخطّى المقطع كما كان (لا انهيار)', async () => {
  const { api, plays } = loadClient({ noDevice: true, fetch: async () => refusedResp(402) });
  let ended = 0;
  await api.speakSmart('جملة واحدة للتجربة هنا.', null, () => { ended++; }, false);
  await tick();
  assert.equal(plays.length, 0);
  assert.equal(ended, 1);
});

test('١١. أفضل صوت في الجهاز: الطبيعيّ أوّلًا والخليجيّ قبل غيره، والجنس يُحترم، و«Female» ليس رجلًا', () => {
  const voices = [
    { name: 'Microsoft Hoda - Arabic (Egypt)', lang: 'ar-EG', localService: true },
    { name: 'Microsoft Naayf - Arabic (Saudi Arabia)', lang: 'ar-SA', localService: true },
    { name: 'Microsoft Zariyah Online (Natural) - Arabic (Saudi Arabia)', lang: 'ar-SA', localService: false },
    { name: 'Microsoft Fatima Online (Natural) - Arabic (United Arab Emirates)', lang: 'ar-AE', localService: false },
    { name: 'Microsoft Hamdan Online (Natural) - Arabic (United Arab Emirates)', lang: 'ar-AE', localService: false },
    { name: 'Google UK English Female', lang: 'en-GB', localService: false },
    { name: 'Google UK English Male', lang: 'en-GB', localService: false },
  ];
  assert.equal(loadClient({ voices, store: { aiapp_voice_gender: 'female' } }).api.pickVoice('ar').name, voices[3].name);
  assert.equal(loadClient({ voices, store: { aiapp_voice_gender: 'male' } }).api.pickVoice('ar').name, voices[4].name);
  assert.equal(loadClient({ voices, store: { aiapp_voice_gender: 'male' } }).api.pickVoice('en').name, 'Google UK English Male');
  const plain = [voices[0], voices[1]];
  assert.equal(loadClient({ voices: plain, store: { aiapp_voice_gender: 'male' } }).api.pickVoice('ar').name, voices[1].name, 'نايف رجل');
  assert.equal(loadClient({ voices: plain, store: { aiapp_voice_name: voices[0].name } }).api.pickVoice('ar').name, voices[0].name, 'اختيار صريح محفوظ يبقى أوّلًا');
  assert.equal(loadClient({ voices: [] }).api.pickVoice('ar'), null);
});

test('١٢. القراءة التلقائيّة (خارج الضغطة) لا تستهلك الفتح الصامت — تبقيه لأوّل ضغطة «استمع»', async () => {
  const activation = { isActive: false };
  const { api, unlocks } = loadClient({ navigator: { userActivation: activation }, fetch: async () => okResp() });
  await api.speakSmart('ردّ يُقرأ تلقائيًّا بعد اكتماله.', null, null, false);
  assert.equal(unlocks.length, 0, 'خارج الضغطة لا فتح');
  activation.isActive = true;
  await api.speakSmart('ضغطة استمع من المستخدم.', null, null, false);
  assert.equal(unlocks.length, 1, 'داخل الضغطة يُفتح');
  await api.speakSmart('ضغطة ثانية.', null, null, false);
  assert.equal(unlocks.length, 1, 'مرّة واحدة');
});

test('١٣. الحزمة مطابقة: المقاطع والهبوط لصوت الجهاز والإيقاف فيها', () => {
  const b = read('js/app.bundle.js');
  for (const s of ['function deviceVoiceScore(v){', 'currentCloudToken = null; // v-tts-free', 'const speakOnDevice = (fromWord, alreadyStarted) => {', 'const minLen = chunks.length ? 160 : 20;', 'let deviceSpeechUnlocked = false;']) {
    assert.ok(b.includes(s), s);
  }
});
