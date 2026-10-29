// v-maha-ae-lexicon (المالك ٢٩ أكتوبر: «ليش ما تطوّرهم باللهجة الإماراتية، وهم عندهم المعلومات والصوت الجميل» ثمّ «نبدأ»):
// قاموس نطق إماراتيّ قبل صوتي مها وعبدالله، و«استمع» للمالك بهما (الصوتان المدرَّبان بـOM_VOICES_REPLY=1 فقط).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const root = path.join(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const ae = require(rp('api/_lib/ae-lexicon.js'));

test('القاموس: الكلمة كاملة بحركاتها، والعبارة قبل كلماتها، والحرف السابق يبقى، والنصّ غير العربيّ كما هو', () => {
  assert.equal(ae.apply('الحين خلصت الشغل، وايد زين.'), 'الْحِين خلصت الشغل، وَايِد زَيْن.');
  assert.equal(ae.apply('كل شي تمام'), 'كِلّ شَي تمام', 'العبارة لا «كل» وحدها');
  assert.equal(ae.apply('وشو تبي؟ فبعدين'), 'وشُو تَبِي؟ فبَعْدِين');
  assert.equal(ae.apply('Hello شو 3'), 'Hello شُو 3');
  assert.equal(ae.apply('الشوكة والشويب'), 'الشوكة والشويب', 'لا يلمس كلمة أطول فيها الحروف نفسها');
});

test('القاموس: كلمات لها معنى فصيح بنطق آخر لا تُمسّ، وتطبيقه مرّتين مثل مرّة', () => {
  const msa = 'حدّ السير يوم الحق كل يوم';
  assert.equal(ae.apply(msa), msa);
  const once = ae.apply('اللي سويته اليوم ما حد سواه قبل، عادي شوي شوي.');
  assert.equal(ae.apply(once), once);
  assert.match(once, /مَا حَدْ/);
  for (const r of ae.RULES) assert.ok(!/^(حد|سير|يوم|حق|كل|قال)$/.test(r.from), 'كلمة فصيحة شائعة وحدها: ' + r.from);
});

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
async function withTts(env, username, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsumeCustom: async () => ({ allowed: true, username }), clientIp: () => '127.0.0.1',
  } };
  for (const f of ['api/_lib/tts.js', 'api/_lib/om-voices.js']) delete require.cache[rp(f)];
  const handler = require(rp('api/_lib/tts.js'));
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init && init.body });
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(24), Buffer.from('data'), Buffer.alloc(4)]);
    return new Response(String(url).includes('microsoft.com') ? new Uint8Array([1, 2, 3]) : wav, { status: 200 });
  };
  try {
    const speak = async (body) => { const res = fakeRes(); await handler({ method: 'POST', body, headers: {}, socket: {} }, res); return res; };
    return await fn(speak, calls);
  } finally {
    global.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require.cache[rp('api/_lib/_usage.js')]; delete require.cache[rp('api/_lib/tts.js')];
  }
}
const ENV = { AZURE_SPEECH_KEY_FREE: 'free-key', AZURE_SPEECH_KEY: undefined, OM_VOICES_KEY: 'k', OM_VOICES_REPLY: undefined, OM_VOICES_URL: 'https://voices.test', OWNER_USERNAMES: undefined, OWNER_USERNAME: undefined };

test('مها وعبدالله: العربيّ يصل الصوت بالقاموس (والرمز & محميّ)، والإنجليزيّ كما هو', () => withTts(ENV, 'someone', async (speak, calls) => {
  await speak({ text: 'الحين وايد زين & شو', voice: 'maha', lang: 'ar', gender: 'male' });
  assert.match(calls[0].body, /<voice name="ar-AE-HamdanNeural">/);
  assert.ok(calls[0].body.includes('الْحِين وَايِد زَيْن &amp; شُو'));
  await speak({ text: 'hello شو', voice: 'maha', lang: 'en' });
  assert.ok(calls[1].body.includes('>hello شو<'), 'غير العربيّ بلا قاموس');
}));

test('«استمع» للمالك صار بمها وعبدالله بالقاموس؛ OM_VOICES_REPLY=1 يعيد الصوتين المدرَّبين', async () => {
  await withTts(ENV, 'omran', async (speak, calls) => {
    const r = await speak({ text: 'شو تبي الحين؟', voice: 'maha', src: 'reply', lang: 'ar', gender: 'female' });
    assert.equal(r.code, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /tts\.speech\.microsoft\.com/);
    assert.match(calls[0].body, /ar-AE-FatimaNeural[\s\S]*شُو تَبِي الْحِين؟/);
  });
  await withTts({ ...ENV, OM_VOICES_REPLY: '1' }, 'omran', async (speak, calls) => {
    const r = await speak({ text: 'شو تبي الحين؟', voice: 'maha', src: 'reply', lang: 'ar', gender: 'female' });
    assert.equal(r.code, 200);
    assert.ok(calls.every((c) => c.url.startsWith('https://voices.test/')));
  });
});
