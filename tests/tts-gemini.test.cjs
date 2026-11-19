'use strict';
/* v-tts-gemini (المالك ٩ نوفمبر: «ابدأ… وحطهم في التطبيق»):
   - المحرّك الثاني (أيّ صوت غير maha) كان OpenAI ‏/v1/audio/speech، ونماذجه تُحذف من الـAPI في ٦ يناير ٢٠٢٧.
   - الآن Gemini 3.8 Flash TTS بالحصّة والسقف والتبريد التي لصوت مها، واسم صوت OpenAI ← صوت Gemini بالجنس نفسه.
   - «instructions» أسلوب الإلقاء، وأيّ تعثّر = صوت Azure بجنس الصوت، لا صمت.
   - مستدعيا التطبيق (ملخّص الإيميل وتأكيد تبويب الصوت) صارا بصوت مها نفسه. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const G = require(rp('api/_lib/gemini-tts.js'));
const T = G.__test;

const ENV_KEYS = ['GEMINI_API_KEY', 'MAHA_VOICE', 'MAHA_VOICE_CAP_CENTS', 'AZURE_SPEECH_KEY', 'AZURE_SPEECH_KEY_FREE', 'AZURE_SPEECH_REGION', 'AZURE_SPEECH_REGION_FREE', 'OPENAI_API_KEY', 'OM_VOICES_REPLY'];

function wav(samples, rate, fill) {
  const pcm = Buffer.alloc(samples * 2, fill == null ? 7 : fill);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate || 24000, 24); h.writeUInt32LE((rate || 24000) * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const geminiOk = (samples, rate, fill) => new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: wav(samples || 24000, rate, fill).toString('base64') }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const geminiErr = (status, message) => new Response(JSON.stringify({ error: { code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } });
const azureOk = () => new Response(new Uint8Array([0xff, 0xf3, 1, 2]).buffer, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
const azureDown = () => new Response('quota', { status: 429 });

function fakeKv() {
  const m = new Map(), ttl = new Map();
  return {
    m, ttl,
    async kvGetRaw(k) { return m.has(k) ? m.get(k) : null; },
    async kvSetRaw(k, v, s) { m.set(k, v); ttl.set(k, s); return true; },
    async kvIncrBy(k, n) { const v = Number(m.get(k) || 0) + n; m.set(k, v); return v; },
    async kvDecrBy(k, n) { const v = Number(m.get(k) || 0) - n; m.set(k, v); return v; },
    async kvExpire(k, s) { ttl.set(k, s); return true; },
  };
}
function fakeRes() {
  const r = { code: 0, body: null, headers: {}, writes: [], ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.write = (c) => { r.writes.push(Buffer.from(c)); return true; };
  r.flushHeaders = () => {};
  r.end = () => { r.ended = true; return r; };
  return r;
}

const NARRATOR = 'أنت راوٍ وثائقيّ عربيّ لقصص الأنبياء. اقرأ النصّ كما هو بصوتٍ وقورٍ واضح.';
const LINE = 'ثُمَّ خَلَقَ اللهُ آدَمَ عليه السلام، قال رسولُ الله صلّى الله عليه وسلّم:';

async function runTts(o) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { GEMINI_API_KEY: 'g-k', AZURE_SPEECH_KEY_FREE: 'free-k', OPENAI_API_KEY: 'oa-k' }, o.env || {});
  for (const k of Object.keys(o.env || {})) if (o.env[k] === undefined) delete process.env[k];
  const kv = o.kv || fakeKv();
  const logs = [];
  const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
  stub('api/_lib/_usage.js', { checkAndConsumeCustom: async () => ({ allowed: true }), clientIp: () => '127.0.0.1' });
  stub('api/_lib/kv.js', kv);
  stub('api/_lib/log-error.js', { logError: (scope, err, meta) => logs.push({ scope, why: err && err.message, meta }), logErrorAndFlush: async () => {} });
  delete require.cache[rp('api/_lib/tts.js')];
  delete require.cache[rp('api/_lib/gemini-tts.js')];
  const handler = require(rp('api/_lib/tts.js'));
  const calls = [];
  const savedFetch = global.fetch;
  let n = 0;
  global.fetch = async (url, init) => {
    const u = String(url);
    const call = { url: u, gemini: /generativelanguage\.googleapis\.com/.test(u), azure: /tts\.speech\.microsoft\.com/.test(u), openai: /api\.openai\.com/.test(u), headers: (init && init.headers) || {}, body: init && init.body };
    if (call.gemini) call.json = JSON.parse(init.body);
    calls.push(call);
    return o.respond(call, ++n);
  };
  try {
    const res = fakeRes();
    const body = Object.assign({ voice: 'onyx', text: LINE, lang: 'ar', gender: 'male' }, o.body || {});
    await handler({ method: 'POST', headers: {}, socket: {}, body }, res);
    return { res, calls, logs, kv };
  } finally {
    global.fetch = savedFetch;
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    for (const f of ['api/_lib/_usage.js', 'api/_lib/kv.js', 'api/_lib/log-error.js', 'api/_lib/tts.js', 'api/_lib/gemini-tts.js']) delete require.cache[rp(f)];
  }
}
const byGemini = (c) => c.filter((x) => x.gemini);
const byAzure = (c) => c.filter((x) => x.azure);
const ok = (c) => (c.gemini ? geminiOk() : azureOk());

test('١. راوي «قصص الأنبياء» (onyx + instructions) من Gemini: Charon والأسلوب كما أُرسل والنصّ حرفيًّا، WAV، ولا OpenAI ولا Azure', async () => {
  const { res, calls } = await runTts({ body: { instructions: '  ' + NARRATOR + '  ' }, respond: ok });
  assert.equal(res.code, 200);
  assert.equal(calls.filter((c) => c.openai).length, 0, 'لا OpenAI');
  assert.equal(byAzure(calls).length, 0, 'لا Azure');
  const g = byGemini(calls);
  assert.equal(g.length, 1);
  assert.equal(g[0].headers['x-goog-api-key'], 'g-k');
  assert.equal(g[0].json.model, 'gemini-3.8-flash-tts');
  assert.equal(g[0].json.generation_config.speech_config[0].voice, 'Charon');
  assert.equal(g[0].json.input[0].content[0].annotations[0].style, NARRATOR, 'تعليمات الأداء = أسلوب الإلقاء');
  assert.equal(g[0].json.input[0].content[0].text, LINE, 'التشكيل كما هو');
  assert.equal(g[0].json.store, false, 'لا يُحفظ عند المزوّد');
  assert.equal(res.headers['Content-Type'], 'audio/wav');
  assert.equal(res.headers['X-TTS-Tier'], 'gemini');
  assert.equal(res.body.toString('ascii', 0, 4), 'RIFF');
  assert.equal(res.body.readUInt32LE(40), 48000, 'PCM كما وصل');
});

test('٢. خريطة الأصوات: أصوات OpenAI الرجاليّة ← Charon أو Orus، والنسائيّة ← Kore، واسم صوت Gemini يُقبل بلا حساسية للحالة', async () => {
  for (const v of ['onyx', 'cedar', 'echo', 'fable']) assert.deepEqual(G.genericVoice(v), { voice: 'Charon', male: true }, v);
  for (const v of ['ash', 'verse', 'ballad']) assert.deepEqual(G.genericVoice(v), { voice: 'Orus', male: true }, v + ': قارئ الحديث غير الراوي');
  for (const v of ['nova', 'marin', 'coral', 'shimmer', 'alloy', 'sage']) assert.deepEqual(G.genericVoice(v, 'male'), { voice: 'Kore', male: false }, v + ': الصوت يحدّد الجنس');
  assert.deepEqual(G.genericVoice('sadaltager'), { voice: 'Sadaltager', male: true });
  assert.deepEqual(G.genericVoice(' ZEPHYR '), { voice: 'Zephyr', male: false });
  assert.deepEqual(G.genericVoice('', 'male'), { voice: 'Charon', male: true }, 'الغائب بالجنس');
  assert.deepEqual(G.genericVoice('toString'), { voice: 'Kore', male: false }, 'لا مفاتيح موروثة');
  assert.deepEqual(G.genericVoice(undefined), { voice: 'Kore', male: false });
  assert.equal(new Set(T.GEMINI_MALE.concat(T.GEMINI_FEMALE)).size, 30, 'الأصوات الثلاثون الموثَّقة، بلا تكرار');
  for (const v of Object.values(T.OPENAI_VOICES)) assert.ok(T.GEMINI_MALE.concat(T.GEMINI_FEMALE).includes(v), v);
  const ash = await runTts({ body: { voice: 'ash' }, respond: ok });
  assert.equal(byGemini(ash.calls)[0].json.generation_config.speech_config[0].voice, 'Orus');
  const direct = await runTts({ body: { voice: 'Algenib', gender: 'female' }, respond: ok });
  assert.equal(byGemini(direct.calls)[0].json.generation_config.speech_config[0].voice, 'Algenib');
});

test('٣. الأسلوب: بلا تعليمات أسلوب محايد، وبطيء/سريع/سريع جدًّا كلمات أداء بعده، والعاديّ والمجهول بلا زيادة، و٦٠٠ حرف حدًّا', async () => {
  assert.equal(G.genericStyle(), T.GENERIC_STYLE);
  assert.equal(G.genericStyle('', 'slow'), T.GENERIC_STYLE + ' Speak a little slowly.');
  assert.equal(G.genericStyle('Energetic ad narrator.', 'fast'), 'Energetic ad narrator. Speak a little faster than usual.');
  assert.equal(G.genericStyle('Energetic ad narrator.', 'xfast'), 'Energetic ad narrator. Speak quickly.');
  assert.equal(G.genericStyle('A\n\n  B', 'normal'), 'A B');
  assert.equal(G.genericStyle('x', 'warp'), 'x');
  assert.equal(G.genericStyle('y'.repeat(900)).length, T.STYLE_MAX);
  assert.equal(G.genericStyle('hasOwnProperty', 'hasOwnProperty'), 'hasOwnProperty');
  const slow = await runTts({ body: { speed: 'slow' }, respond: ok });
  assert.equal(byGemini(slow.calls)[0].json.input[0].content[0].annotations[0].style, T.GENERIC_STYLE + ' Speak a little slowly.');
});

test('٤. لا صمت: فشل Gemini (المفتاح، حدّ اليوم، المهلة، بلا مفتاح) ← Azure بجنس الصوت المطلوب ولغة النصّ، ويُسجَّل الفشل', async () => {
  const timeout = () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
  const cases = [
    { body: { voice: 'onyx' }, respond: (c) => (c.gemini ? geminiErr(403, 'API key not valid') : azureOk()), voice: 'ar-AE-HamdanNeural', logged: true },
    { body: { voice: 'nova', gender: 'male' }, respond: (c) => (c.gemini ? timeout() : azureOk()), voice: 'ar-AE-FatimaNeural', logged: true },
    { body: { voice: 'ash', lang: 'en', text: 'Hello there.' }, respond: (c) => (c.gemini ? geminiErr(500, 'x') : azureOk()), voice: 'en-US-AndrewMultilingualNeural', logged: true },
    { body: { voice: 'coral', lang: 'en', text: 'Hello there.' }, env: { GEMINI_API_KEY: undefined }, respond: ok, voice: 'en-US-JennyMultilingualNeural', logged: false },
  ];
  for (const k of cases) {
    const { res, calls, logs } = await runTts(k);
    const az = byAzure(calls);
    assert.equal(az.length, 1, k.voice);
    assert.ok(String(az[0].body).includes('<voice name="' + k.voice + '">'), k.voice + ': ' + az[0].body);
    assert.equal(res.code, 200);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.equal(res.headers['X-TTS-Tier'], 'free');
    assert.equal(calls.filter((c) => c.openai).length, 0, 'لا OpenAI');
    assert.equal(logs.length, k.logged ? 1 : 0, k.voice + ' سجلّ');
    if (k.logged) assert.equal(logs[0].scope, 'tts/voice', 'سجلّ المحرّك الثاني باسمه');
  }
  const daily = await runTts({ respond: (c) => (c.gemini ? geminiErr(429, 'Quota exceeded for metric: generate_requests_per_model_per_day, limit: 100') : azureOk()) });
  assert.equal(byGemini(daily.calls).length, 1, 'لا إعادة لحدّ اليوم');
  assert.ok(daily.kv.m.get(T.COOL_KEY), 'حدّ اليوم يبرّد المسارين');
});

test('٥. الحصّة مشتركة مع صوت مها: المبرَّد لا يُنادى، والسقف يُحسب للمسارين معًا، وMAHA_VOICE=azure لصوت مها وحده، والسقف ٠ يغلق الاثنين', async () => {
  const kv = fakeKv();
  kv.m.set(T.COOL_KEY, 'http_429');
  const cooled = await runTts({ kv, respond: ok });
  assert.equal(byGemini(cooled.calls).length, 0, 'تبريد صوت مها يسري هنا');
  assert.equal(byAzure(cooled.calls).length, 1);

  const shared = fakeKv();
  const text = 'جملة عربيّة قصيرة فيها إن شاء الله.';
  const capCents = String(Math.ceil(T.centsPerChar() * text.length * 1.5 * 100) / 100); // يكفي طلبًا واحدًا لا اثنين
  const maha = await runTts({ kv: shared, env: { MAHA_VOICE_CAP_CENTS: capCents }, body: { voice: 'maha', gender: 'female', text }, respond: ok });
  assert.equal(byGemini(maha.calls).length, 1, 'صوت مها أخذ السقف');
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(Number(shared.m.get(T.spentKey(day))), text.length);
  const second = await runTts({ kv: shared, env: { MAHA_VOICE_CAP_CENTS: capCents }, body: { text }, respond: ok });
  assert.equal(byGemini(second.calls).length, 0, 'المحرّك الثاني بعد السقف المشترك');
  assert.equal(byAzure(second.calls).length, 1);

  const own = fakeKv();
  const narr = await runTts({ kv: own, env: { MAHA_VOICE: 'azure' }, respond: ok });
  assert.equal(byGemini(narr.calls).length, 1, 'مفتاح إطفاء صوت مها لا يطفئ الراوي');
  assert.equal(Number(own.m.get(T.spentKey(day))), LINE.length, 'حروف المحرّك الثاني في العدّاد نفسه');
  const zero = await runTts({ env: { MAHA_VOICE_CAP_CENTS: '0' }, respond: ok });
  assert.equal(byGemini(zero.calls).length, 0);
  assert.equal(byAzure(zero.calls).length, 1);
});

test('٦. لا OpenAI ولو أرسل المستدعي model أو apiKey قديمين، وفشل الاثنين ٥٠٢ بلا اسم مزوّد', async () => {
  const legacy = await runTts({ body: { model: 'tts-1', apiKey: 'client-key' }, respond: ok });
  assert.equal(legacy.calls.filter((c) => c.openai).length, 0);
  assert.equal(legacy.res.headers['X-TTS-Tier'], 'gemini');
  for (const env of [{}, { AZURE_SPEECH_KEY_FREE: undefined }]) {
    const { res, calls } = await runTts({ env, respond: (c) => (c.gemini ? geminiErr(403, 'denied') : azureDown()) });
    assert.equal(res.code, 502);
    assert.deepEqual(res.body, { error: 'tts_unavailable' });
    assert.doesNotMatch(JSON.stringify(res.body), /openai|azure|gemini|google|microsoft/i);
    assert.equal(calls.filter((c) => c.openai).length, 0);
  }
  const paid = await runTts({ env: { AZURE_SPEECH_KEY: 'paid-k' }, respond: (c, n) => (c.gemini ? geminiErr(403, 'denied') : (n === 2 ? azureDown() : azureOk())) });
  assert.equal(paid.res.headers['X-TTS-Tier'], 'paid', 'المجّانيّ ثمّ المدفوع إن وُجد');
});

test('٧. النصّ الطويل أجزاء ≤٩٠٠ حرف بالصوت والأسلوب نفسيهما في ملفّ واحد، والملفّ فوق ٣٫٥ م.ب يُبثّ على دفعات', async () => {
  const text = Array.from({ length: 30 }, (_, i) => 'هذه الجملة رقم ' + (i + 1) + ' من سرد الحلقة، وفيها بسم الله والحمد لله.').join(' ');
  const parts = T.splitText(text);
  assert.ok(parts.length >= 2);
  const { res, calls } = await runTts({ body: { text, instructions: NARRATOR }, respond: (c) => (c.gemini ? geminiOk(3000) : azureOk()) });
  const g = byGemini(calls);
  assert.equal(g.length, parts.length);
  assert.ok(g.every((c) => c.json.generation_config.speech_config[0].voice === 'Charon' && c.json.input[0].content[0].annotations[0].style === NARRATOR));
  assert.equal(res.body.readUInt32LE(40), parts.length * 6000);
  const big = await runTts({ respond: (c) => (c.gemini ? geminiOk(1900000) : azureOk()) });
  assert.ok(big.res.body === null, 'لا send للملفّ الكبير');
  assert.ok(big.res.writes.length >= 8 && big.res.writes.every((w) => w.length <= 512 * 1024));
  assert.equal(Buffer.concat(big.res.writes).length, 44 + 1900000 * 2);
  assert.ok(big.res.ended);
  assert.equal(big.res.headers['X-TTS-Tier'], 'gemini');
});

test('٨. صوت مها لا يتغيّر: speakMaha يتجاهل voiceName/styleText، وفرع maha بصوت Kore وأسلوبه المعتمد', async () => {
  const kv = fakeKv();
  const seen = [];
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'g-k';
  try {
    const r = await G.speakMaha({ text: 'إن شاء الله.', gender: 'female', voiceName: 'Puck', styleText: 'shout', kv, fetchImpl: async (u, init) => { seen.push(JSON.parse(init.body)); return geminiOk(); } });
    assert.ok(r && r.wav);
  } finally { if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved; }
  assert.equal(seen[0].generation_config.speech_config[0].voice, 'Kore');
  assert.equal(seen[0].input[0].content[0].annotations[0].style, T.styleFor('ae', 'normal'));
  const maha = await runTts({ body: { voice: 'maha', gender: 'male', text: 'إن شاء الله.' }, respond: ok });
  assert.equal(byGemini(maha.calls)[0].json.generation_config.speech_config[0].voice, 'Charon');
  assert.equal(byGemini(maha.calls)[0].json.input[0].content[0].annotations[0].style, T.styleFor('ae', 'normal'));
});

/* ---------------- العميل ---------------- */
test('٩. كلّ مستدعي /api/tts في التطبيق بصوت مها — لا «nova» ولا صوت آخر في الواجهة', () => {
  const files = fs.readdirSync(path.join(root, 'js')).filter((f) => /^(app-\d+-.*|video|video-edit|partials-.*)\.js$/.test(f)).map((f) => 'js/' + f);
  let n = 0;
  for (const f of files) {
    const src = read(f);
    const re = /fetch\(\s*'\/api\/(?:tts|media\?action=tts)'/g;
    let m;
    while ((m = re.exec(src))) {
      n++;
      const call = src.slice(m.index, m.index + 900);
      assert.match(call, /voice\s*:\s*'maha'/, f + ': ' + call.slice(0, 200));
    }
  }
  assert.ok(n >= 11, 'المستدعون كلّهم فُحصوا: ' + n);
  assert.ok(!read('js/app-07-voice.js').includes('aiapp_cloud_voice_name'), 'لا اسم صوت قديم في تبويب الصوت');
});

test('١٠. تأكيد تبويب الصوت يرسل مها بجنس الإعدادات ولهجتها ولغة النصّ والحساب', async () => {
  const src = read('js/app-07-voice.js');
  const a = src.indexOf('async function voiceTabSpeak(');
  const b = src.indexOf('\n}\n', a) + 2;
  const app02 = read('js/app-02-tts.js');
  const helpers = app02.slice(app02.indexOf('function ttsSpeedSetting('), app02.indexOf('async function fetchCloudSpeech('));
  const bodies = [];
  const store = { aiapp_voice_gender: 'male', aiapp_voice_dialect: 'om', aiapp_auth_token: 'tok-tab' };
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    authGet: (k) => store[k] || null,
    window: { getGuestId: () => 'g_test_guest_1' },
    fetch: async (url, init) => { if (url === '/api/tts') bodies.push(JSON.parse(init.body)); return { ok: false, status: 502 }; },
    detectSpeechLang: (t) => (/[a-z]/i.test(t) ? 'en' : 'ar'),
    btnVoiceTabMic: null,
    __swallow() {},
  };
  vm.runInNewContext(helpers + src.slice(a, b) + '\nthis.run = voiceTabSpeak;', ctx);
  await ctx.run('تمّ إنشاء الصورة');
  assert.deepEqual(bodies[0], { voice: 'maha', gender: 'male', lang: 'ar', dialect: 'om', text: 'تمّ إنشاء الصورة', token: 'tok-tab', guestId: 'g_test_guest_1' });
  store.aiapp_voice_gender = null; store.aiapp_voice_dialect = 'zz';
  await ctx.run('Done');
  assert.equal(bodies[1].gender, 'female');
  assert.equal(bodies[1].lang, 'en');
  assert.equal(bodies[1].dialect, 'ae', 'لهجة تالفة = الإماراتيّ');
});

test('١١. ملخّص الإيميل بالصوت: مها بالحساب والإعدادات، والفشل رسالة مترجمة لا نصّ الخادم', () => {
  const src = read('js/app-12-studios.js');
  const a = src.indexOf("if(voiceBtn) voiceBtn.addEventListener('click'");
  const block = src.slice(a, src.indexOf('btnOpen.addEventListener', a));
  assert.ok(a > 0 && block.length > 200);
  assert.ok(block.includes("body: JSON.stringify({ voice: 'maha', gender: localStorage.getItem('aiapp_voice_gender') || 'female', lang: en() ? 'en' : 'ar', dialect: ttsDialectSetting(), token: ttsAuthToken(), guestId: ttsGuestId(), text: text.slice(0, 4000) })"));
  assert.ok(block.includes("throw new Error(resp.status === 402 ? 'daily_limit_reached' : resp.status === 401 ? 'auth_required' : 'tts_failed')"));
  assert.ok(block.includes("setStatus(__studioErrMsg(e, 'svcPaused'))"));
  assert.ok(!/voice: 'nova'|j\.error|tr\.error/.test(block), 'لا صوت قديم ولا نصّ خطأ الخادم');
  // الرموز الثلاثة تصير مفاتيح مترجمة، والنصّ الخامّ للمالك وحده
  const f0 = src.indexOf('const __STUDIO_ERR_FB = {');
  const f1 = src.indexOf('\n}\n', src.indexOf('function __studioErrMsg(')) + 2;
  const keys = [];
  const ctx = { window: { t: (k) => { keys.push(k); return 'T:' + k; } }, omranOwnerUi: () => false };
  vm.runInNewContext(src.slice(f0, f1) + '\nthis.msg = __studioErrMsg;', ctx);
  assert.equal(ctx.msg(new Error('daily_limit_reached'), 'svcPaused'), '❌ T:portraitLimitReached');
  assert.equal(ctx.msg(new Error('auth_required'), 'svcPaused'), '❌ T:portraitNeedLogin');
  assert.equal(ctx.msg(new Error('tts_failed'), 'svcPaused'), '❌ T:svcPaused');
  assert.equal(ctx.msg(new Error('Azure TTS error: 401'), 'svcPaused'), '❌ T:svcPaused', 'نصّ تقنيّ لا يصل المستخدم');
});

test('١٢. السكربت الإعلانيّ يقبل WAV من Gemini وحده، ولا يرسل اسم نموذج قديم', () => {
  const s = read('scripts/maha-narration.mjs');
  assert.ok(!s.includes("model: 'gpt-4o-mini-tts'"));
  assert.match(s, /tier === 'gemini' && isWav/);
  assert.match(s, /'narration\/' \+ name \+ '\.wav'/);
});
