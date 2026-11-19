'use strict';
/* v-allah-tafkhim (المالك ٨ نوفمبر: «كلمة الله وليست الاه… تكون مضخمه يليق باسم الله»؛ ٩ نوفمبر بعد سماع العيّنة: «ابدأ لكلّ الكلام»):
   الكلام العربيّ كلّه بصوتَي مها وعبدالله من api/_lib/gemini-tts.js، بالإعدادات التي سمعها المالك حرفيًّا. أيّ تعثّر = صوت Azure القديم كما
   كان (لا صمت)، وحدّ اليوم والرصيد يبرّدان المسار، والسقف اليوميّ يحرس الصرف. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const G = require(rp('api/_lib/gemini-tts.js')).__test;

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

function fakeKv(opts) {
  const o = opts || {};
  const m = new Map(), ttl = new Map();
  return {
    m, ttl,
    async kvGetRaw(k) { return m.has(k) ? m.get(k) : null; },
    async kvSetRaw(k, v, s) { m.set(k, v); ttl.set(k, s); return true; },
    async kvIncrBy(k, n) { if (o.broken) throw new Error('kv down'); const v = Number(m.get(k) || 0) + n; m.set(k, v); return v; },
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

async function runTts(o) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, { GEMINI_API_KEY: 'g-k', AZURE_SPEECH_KEY_FREE: 'free-k' }, o.env || {});
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
    const call = { url: u, gemini: /generativelanguage\.googleapis\.com/.test(u), azure: /tts\.speech\.microsoft\.com/.test(u), headers: (init && init.headers) || {}, body: init && init.body };
    if (call.gemini) call.json = JSON.parse(init.body);
    calls.push(call);
    return o.respond(call, ++n);
  };
  try {
    const res = fakeRes();
    const body = Object.assign({ voice: 'maha', text: 'إن شاء الله نبدأ اليوم، والحمد لله.', lang: 'ar', gender: 'female' }, o.body || {});
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
const APPROVED_STYLE = 'Warm, friendly and natural conversational Emirati Gulf Arabic, like a helpful assistant chatting with a friend; calm, clear, everyday pace.';

test('١. الكلام العربيّ بالصوت الجديد: Kore لمها وCharon لعبدالله، بالنموذج والأسلوب اللذين سمعهما المالك حرفيًّا — بلا Azure', async () => {
  for (const [gender, voice] of [['female', 'Kore'], ['male', 'Charon']]) {
    const { res, calls } = await runTts({ body: { gender }, respond: (c) => (c.gemini ? geminiOk(24000) : azureOk()) });
    assert.equal(res.code, 200);
    assert.equal(byAzure(calls).length, 0, 'لا Azure');
    const g = byGemini(calls);
    assert.equal(g.length, 1);
    assert.equal(g[0].headers['x-goog-api-key'], 'g-k');
    assert.equal(g[0].json.model, 'gemini-3.8-flash-tts');
    assert.equal(g[0].json.generation_config.speech_config[0].voice, voice);
    assert.equal(g[0].json.input[0].content[0].annotations[0].style, APPROVED_STYLE);
    assert.equal(g[0].json.store, false, 'لا يُحفظ عند المزوّد');
    assert.equal(res.headers['Content-Type'], 'audio/wav');
    assert.equal(res.headers['X-TTS-Tier'], 'gemini');
    const out = res.body;
    assert.equal(out.toString('ascii', 0, 4), 'RIFF');
    assert.equal(out.readUInt32LE(24), 24000);
    assert.equal(out.readUInt32LE(40), 48000, 'PCM كما وصل');
  }
});

test('٢. النصّ: «هلا والله» تبقى في الصوت الجديد و«عبدالله» بفاصله والتنسيق محذوف؛ وفي احتياط Azure «مرحبا» كما كانت', async () => {
  const text = 'هلا والله، أنا عبدالله. **إن شاء الله** نخلّصها 😀';
  const ok = await runTts({ body: { text }, respond: (c) => (c.gemini ? geminiOk() : azureOk()) });
  assert.equal(byGemini(ok.calls)[0].json.input[0].content[0].text, 'هلا والله، أنا عبد الله. إن شاء الله نخلّصها');
  const down = await runTts({ body: { text }, respond: (c) => (c.gemini ? geminiErr(403, 'API key not valid') : azureOk()) });
  const ssml = String(byAzure(down.calls)[0].body);
  assert.match(ssml, /مرحبا، أنا عبد الله\. إن شاء الله نخلّصها/);
  assert.doesNotMatch(ssml, /هلا والله/);
  assert.equal(down.res.headers['Content-Type'], 'audio/mpeg');
});

test('٣. اللهجة والسرعة في الأسلوب: سعوديّ/عمانيّ…، والمجهول إماراتيّ؛ بطيء/سريع جدًّا كلمات أداء', async () => {
  const style = async (body) => byGemini((await runTts({ body, respond: (c) => (c.gemini ? geminiOk() : azureOk()) })).calls)[0].json.input[0].content[0].annotations[0].style;
  assert.match(await style({ dialect: 'sa' }), /conversational Saudi Gulf Arabic/);
  assert.match(await style({ dialect: 'om', speed: 'slow' }), /Omani Gulf Arabic.*speaking a little slowly\.$/);
  assert.match(await style({ dialect: 'kw', speed: 'xfast' }), /Kuwaiti.*speaking quickly\.$/);
  assert.equal(await style({ dialect: 'zz', speed: 'warp' }), APPROVED_STYLE);
  assert.equal(G.styleFor('qa', 'fast'), 'Warm, friendly and natural conversational Qatari Gulf Arabic, like a helpful assistant chatting with a friend; clear, speaking a little faster than usual.');
  assert.match(G.styleFor('bh'), /Bahraini/);
});

test('٤. غير العربيّ، وبلا مفتاح، وMAHA_VOICE=azure: صوت Azure وحده كما كان حرفيًّا', async () => {
  for (const o of [{ body: { lang: 'en', text: 'Hello there.' } }, { env: { GEMINI_API_KEY: undefined } }, { env: { MAHA_VOICE: 'azure' } }]) {
    const { res, calls } = await runTts(Object.assign({ respond: (c) => (c.gemini ? geminiOk() : azureOk()) }, o));
    assert.equal(byGemini(calls).length, 0, JSON.stringify(o));
    assert.equal(byAzure(calls).length, 1);
    assert.equal(res.headers['X-TTS-Tier'], 'free');
  }
});

test('٥. حدّ اليوم (429 per day): لا إعادة، تبريد حتّى منتصف ليل المحيط الهادئ، والطلب التالي إلى Azure مباشرة — ويُسجَّل', async () => {
  const kv = fakeKv();
  const daily = () => geminiErr(429, 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 100');
  const first = await runTts({ kv, respond: (c) => (c.gemini ? daily() : azureOk()) });
  assert.equal(byGemini(first.calls).length, 1, 'لا إعادة لحدّ اليوم');
  assert.equal(first.res.headers['Content-Type'], 'audio/mpeg', 'الصوت لم ينقطع');
  assert.ok(kv.m.get(G.COOL_KEY), 'علم التبريد');
  assert.ok(kv.ttl.get(G.COOL_KEY) >= 600 && kv.ttl.get(G.COOL_KEY) <= 86400);
  assert.equal(first.logs.length, 1);
  assert.equal(first.logs[0].scope, 'tts/maha-voice');
  const second = await runTts({ kv, respond: (c) => (c.gemini ? geminiOk() : azureOk()) });
  assert.equal(byGemini(second.calls).length, 0, 'المبرَّد لا يُنادى');
  assert.equal(byAzure(second.calls).length, 1);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(Number(kv.m.get(G.spentKey(day)) || 0), 0, 'الحجز رُدّ بعد الفشل');
});

test('٦. التبريد بحسب السبب: الرصيد ٣٠ دقيقة، المفتاح/النموذج ٣٠ دقيقة، زحام الدقيقة ٦٠ ثانية، و400 أو 5xx بلا تبريد', () => {
  assert.equal(G.coolFor(402, ''), 1800);
  assert.equal(G.coolFor(429, 'Your prepayment credits are depleted'), 1800);
  assert.equal(G.coolFor(403, 'API key not valid'), 1800);
  assert.equal(G.coolFor(404, 'model not found'), 1800);
  assert.equal(G.coolFor(429, 'Resource has been exhausted (e.g. check quota). Please check your plan and billing details.'), 60, '«billing details» العابرة ليست نفاد رصيد');
  assert.equal(G.coolFor(400, 'bad text'), 0);
  assert.equal(G.coolFor(503, 'overloaded'), 0);
  assert.equal(G.secondsToPacificMidnight(Date.parse('2026-11-09T07:00:00Z')), 3600);
  assert.equal(G.secondsToPacificMidnight(Date.parse('2026-11-09T08:00:00Z')), 86400);
});

test('٧. زحام عابر (429 الدقيقة أو 5xx) يُعاد مرّة ثمّ يخدم الصوت الجديد؛ وفشلان = Azure', async () => {
  const once = await runTts({ respond: (c, n) => (c.gemini ? (n === 1 ? geminiErr(429, 'Resource has been exhausted') : geminiOk()) : azureOk()) });
  assert.equal(byGemini(once.calls).length, 2);
  assert.equal(once.res.headers['X-TTS-Tier'], 'gemini');
  const twice = await runTts({ respond: (c) => (c.gemini ? geminiErr(503, 'overloaded') : azureOk()) });
  assert.equal(byGemini(twice.calls).length, 2);
  assert.equal(byAzure(twice.calls).length, 1);
  assert.equal(twice.res.headers['Content-Type'], 'audio/mpeg');
});

test('٨. مهلة/شبكة/صوت فارغ/ردّ مكسور = Azure بلا صمت', async () => {
  const timeout = () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
  for (const respond of [
    (c) => (c.gemini ? timeout() : azureOk()),
    (c) => { if (c.gemini) throw new Error('ECONNRESET'); return azureOk(); },
    (c) => (c.gemini ? new Response(JSON.stringify({ steps: [] }), { status: 200 }) : azureOk()),
    (c) => (c.gemini ? new Response('<html>', { status: 200 }) : azureOk()),
  ]) {
    const { res, calls, logs } = await runTts({ respond });
    assert.equal(byAzure(calls).length, 1);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.equal(logs.length, 1, 'كلّ سقوط يُرى في السجلّ');
  }
});

test('٩. السقف اليوميّ: ٠ يغلقه، والحروف فوق السقف إلى Azure، وتعذّر العدّ لا يصرف على عمًى', async () => {
  const zero = await runTts({ env: { MAHA_VOICE_CAP_CENTS: '0' }, respond: (c) => (c.gemini ? geminiOk() : azureOk()) });
  assert.equal(byGemini(zero.calls).length, 0);
  const kv = fakeKv();
  const text = 'جملة عربيّة قصيرة فيها إن شاء الله.';
  const capCents = String(Math.ceil(G.centsPerChar() * text.length * 1.5 * 100) / 100); // يكفي طلبًا واحدًا لا اثنين
  const a = await runTts({ kv, env: { MAHA_VOICE_CAP_CENTS: capCents }, body: { text }, respond: (c) => (c.gemini ? geminiOk() : azureOk()) });
  assert.equal(byGemini(a.calls).length, 1);
  const b = await runTts({ kv, env: { MAHA_VOICE_CAP_CENTS: capCents }, body: { text }, respond: (c) => (c.gemini ? geminiOk() : azureOk()) });
  assert.equal(byGemini(b.calls).length, 0, 'بعد السقف');
  assert.equal(byAzure(b.calls).length, 1);
  const broken = await runTts({ kv: fakeKv({ broken: true }), respond: (c) => (c.gemini ? geminiOk() : azureOk()) });
  assert.equal(byGemini(broken.calls).length, 0);
  assert.equal(byAzure(broken.calls).length, 1);
  assert.ok(Math.abs(G.centsPerChar(Date.parse('2026-12-31T23:00:00Z')) - 0.00225) < 1e-12, '‎$9 للمليون حتّى آخر ٢٠٢٦');
  assert.ok(Math.abs(G.centsPerChar(Date.parse('2027-01-01T00:00:00Z')) - 0.0045) < 1e-12, '‎$18 من ٢٠٢٧');
  assert.equal(G.capChars(Date.parse('2026-11-09T00:00:00Z')), 133333, '٣$ ≈ ١٣٣ ألف حرف في اليوم (نحو ٣٫٧ ساعة)');
});

test('١٠. النصّ الطويل (تعليق فيديو): أجزاء ≤٩٠٠ حرف بحدود الجمل بترتيبها، كلّ كلمة مرّة، «3.5» لا تنكسر، والصوت متّصل', async () => {
  const sents = Array.from({ length: 40 }, (_, i) => 'هذه الجملة رقم ' + (i + 1) + ' من التعليق، وفيها إن شاء الله والحمد لله و3.5 مليون.');
  const text = sents.join(' ');
  const parts = G.splitText(text);
  assert.ok(parts.length >= 3, 'أجزاء ' + parts.length);
  for (const p of parts) assert.ok(p.length <= 900 && /[.]$/.test(p), p.length + ' ' + p.slice(-10));
  assert.equal(parts.join(' '), text, 'كلّ الكلام بترتيبه بلا زيادة ولا نقص');
  assert.ok(!parts.some((p) => /3\. 5|^5 مليون/.test(p)));
  assert.deepEqual(G.splitText('قصير.'), ['قصير.']);
  assert.deepEqual(G.splitText('  '), []);
  const long = G.splitText('كلمة '.repeat(400).trim());
  assert.ok(long.every((p) => p.length <= 900) && long.join(' ') === 'كلمة '.repeat(400).trim(), 'جملة بلا وقف تُقطع عند المسافة');
  const seen = [];
  const { res, calls } = await runTts({ body: { text }, respond: (c) => {
    if (!c.gemini) return azureOk();
    const t = c.json.input[0].content[0].text; seen.push(t);
    return geminiOk(3000, 24000, parts.indexOf(t) + 1); // PCM كلّ جزء ببايت رقمه
  } });
  assert.equal(byGemini(calls).length, parts.length);
  assert.deepEqual([...seen].sort(), [...parts].sort());
  const pcm = res.body.subarray(44);
  assert.equal(res.body.readUInt32LE(40), parts.length * 6000, 'PCM الأجزاء كلّها في ملفّ واحد');
  parts.forEach((_, i) => assert.equal(pcm[i * 6000], i + 1, 'الجزء ' + (i + 1) + ' في مكانه'));
});

test('١١. الملفّ فوق ٣٫٥ م.ب يُبثّ على دفعات (حدّ ٤٫٥ م.ب لا يسري على المبثوث)، والقصير دفعة واحدة', async () => {
  const big = await runTts({ respond: (c) => (c.gemini ? geminiOk(1900000) : azureOk()) });
  assert.ok(big.res.body === null, 'لا send للملفّ الكبير'); // لا assert.equal على Buffer كبير: رسالة الفشل تطبعه كلّه فيعلق الاختبار
  assert.ok(big.res.writes.length >= 8 && big.res.writes.every((w) => w.length <= 512 * 1024));
  assert.equal(Buffer.concat(big.res.writes).length, 44 + 1900000 * 2);
  assert.ok(big.res.ended);
  const small = await runTts({ respond: (c) => (c.gemini ? geminiOk(24000) : azureOk()) });
  assert.equal(small.res.writes.length, 0);
  assert.ok(Buffer.isBuffer(small.res.body));
});

test('١١ب. نصّ فوق ٤٠٠٠ حرف يُقصّ قبل الحجز والنداء كمسار Azure', async () => {
  const seen = [];
  await runTts({ body: { text: 'كلمة '.repeat(3000).trim() }, respond: (c) => { if (c.gemini) { seen.push(c.json.input[0].content[0].text); return geminiOk(3000); } return azureOk(); } });
  assert.ok(seen.length >= 5);
  assert.ok(seen.join(' ').length <= 4000, 'المقروء ' + seen.join(' ').length);
});

test('١٢. قراءة WAV بفصولها لا بإزاحة ٤٤ ثابتة، وPCM الخام ٢٤ كيلوهرتز، ورفض غير الأحاديّ، وشكل candidates القديم', () => {
  assert.equal(G.pickAudio({ candidates: [{ content: { parts: [{ inlineData: { data: 'QUJD' } }] } }] }), 'QUJD');
  assert.equal(G.pickAudio(null), '');
  const w = wav(10);
  const withList = Buffer.concat([w.subarray(0, 36), Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('abcd'), w.subarray(36)]);
  assert.equal(G.pcmOf(withList).pcm.length, 20);
  assert.equal(G.pcmOf(Buffer.alloc(101)).pcm.length, 100);
  const stereo = Buffer.from(w); stereo.writeUInt16LE(2, 22);
  assert.equal(G.pcmOf(stereo), null);
  assert.equal(G.wavOf(Buffer.alloc(8), 16000).readUInt32LE(24), 16000);
});

test('١٣. الإعدادات المعتمدة ثابتة، والمسار مسجَّل في سجلّ المتغيّرات', () => {
  assert.equal(G.MODEL, 'gemini-3.8-flash-tts');
  assert.deepEqual(G.VOICES, { male: 'Charon', female: 'Kore' });
  assert.equal(G.styleFor('ae', 'normal'), APPROVED_STYLE);
  const env = fs.readFileSync(path.join(root, 'api/_lib/env.js'), 'utf8');
  assert.match(env, /MAHA_VOICE:/);
  assert.match(env, /MAHA_VOICE_CAP_CENTS:/);
  const src = fs.readFileSync(path.join(root, 'api/_lib/tts.js'), 'utf8');
  assert.ok(src.indexOf("require('./gemini-tts.js')") < src.indexOf('const azAccounts = []'), 'الصوت الجديد قبل Azure');
});
