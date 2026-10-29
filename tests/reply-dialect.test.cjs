// v-reply-dialect (المالك ٢٩ أكتوبر «٦ من ١٠ فضيحة… التطبيقات عندهم بلهجتهم العماني والإماراتي والسعودي»، ثمّ «سوّيها»):
// «استمع» وتجربة الصوت يقرآن العربيّ باللهجة المختارة في «الصوت» — أصوات Azure الأصيلة لكلّ بلد، رجل وامرأة.
// الصوتان المدرَّبان بالفصحى (أصوات om) خرجا من «استمع» إلّا بـOM_VOICES_REPLY=1.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

// the real handler with usage stubbed (as the owner) and every outside call recorded
async function withTts(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsumeCustom: async () => ({ allowed: true, username: 'omran' }), clientIp: () => '127.0.0.1',
  } };
  delete require.cache[rp('api/_lib/tts.js')];
  delete require.cache[rp('api/_lib/om-voices.js')];
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
const voiceOf = (ssml) => (/<voice name="([^"]+)"/.exec(ssml) || [])[1];
const localeOf = (ssml) => (/xml:lang="([^"]+)"/.exec(ssml) || [])[1];
const AZ = { AZURE_SPEECH_KEY_FREE: 'free-key', AZURE_SPEECH_KEY: undefined, OM_VOICES_KEY: 'k', OM_VOICES_REPLY: undefined, OWNER_USERNAMES: undefined, OWNER_USERNAME: undefined };

test('الخادم: كلّ لهجة بصوتي بلدها (رجل وامرأة) ولغتها في SSML', () => withTts(AZ, async (speak, calls) => {
  const want = {
    ae: ['ar-AE', 'ar-AE-FatimaNeural', 'ar-AE-HamdanNeural'], om: ['ar-OM', 'ar-OM-AyshaNeural', 'ar-OM-AbdullahNeural'],
    sa: ['ar-SA', 'ar-SA-ZariyahNeural', 'ar-SA-HamedNeural'], kw: ['ar-KW', 'ar-KW-NouraNeural', 'ar-KW-FahedNeural'],
    qa: ['ar-QA', 'ar-QA-AmalNeural', 'ar-QA-MoazNeural'], bh: ['ar-BH', 'ar-BH-LailaNeural', 'ar-BH-AliNeural'],
  };
  for (const [dialect, [locale, female, male]] of Object.entries(want)) {
    for (const [gender, name] of [['female', female], ['male', male]]) {
      calls.length = 0;
      const res = await speak({ text: 'هلا والله', voice: 'maha', src: 'reply', lang: 'ar', gender, dialect });
      assert.equal(res.code, 200, dialect + ' ' + gender);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /tts\.speech\.microsoft\.com/);
      assert.equal(voiceOf(calls[0].body), name);
      assert.equal(localeOf(calls[0].body), locale);
    }
  }
}));

test('الخادم: بلا لهجة أو بقيمة دخيلة = الإماراتيّ كما كان، ولغة غير العربيّة لا تتأثّر', () => withTts(AZ, async (speak, calls) => {
  for (const dialect of [undefined, 'xx', '__proto__', 'constructor']) {
    calls.length = 0;
    await speak({ text: 'هلا', voice: 'maha', lang: 'ar', dialect });
    assert.equal(voiceOf(calls[0].body), 'ar-AE-FatimaNeural', String(dialect));
  }
  calls.length = 0;
  await speak({ text: 'hello', voice: 'maha', src: 'reply', lang: 'en', dialect: 'om' });
  assert.equal(voiceOf(calls[0].body), 'en-US-JennyMultilingualNeural');
  assert.equal(localeOf(calls[0].body), 'en-US');
}));

test('الخادم: «استمع» للمالك صار باللهجة لا بالصوتين المدرَّبين، وOM_VOICES_REPLY=1 يعيدهما', async () => {
  await withTts(AZ, async (speak, calls) => {
    const res = await speak({ text: 'هلا', voice: 'maha', src: 'reply', lang: 'ar', gender: 'male', dialect: 'sa' });
    assert.equal(res.code, 200);
    assert.ok(calls.every((c) => c.url.includes('microsoft.com')), 'لا طلب لموقع الأصوات');
    assert.equal(voiceOf(calls[0].body), 'ar-SA-HamedNeural');
  });
  await withTts({ ...AZ, OM_VOICES_REPLY: '1', OM_VOICES_URL: 'https://voices.test' }, async (speak, calls) => {
    const res = await speak({ text: 'هلا', voice: 'maha', src: 'reply', lang: 'ar', gender: 'male', dialect: 'sa' });
    assert.equal(res.code, 200);
    assert.ok(calls.length >= 1 && calls.every((c) => c.url.startsWith('https://voices.test/')), 'المفتاح يعيد أصوات om');
  });
});

test('العميل: ttsDialectSetting يقرأ المحفوظ ويرفض الدخيل، و«استمع» يرسله', () => {
  const app02 = read('js/app-02-tts.js');
  const start = app02.indexOf('const TTS_DIALECTS');
  const end = app02.indexOf('\n}\n', app02.indexOf('function ttsDialectSetting(')) + 3;
  assert.ok(start > 0 && end > start);
  const store = {};
  const ctx = { localStorage: { getItem: (k) => (k in store ? store[k] : null) } };
  vm.runInNewContext(app02.slice(start, end) + '\nthis.read = ttsDialectSetting;', ctx);
  assert.equal(ctx.read(), 'ae');
  store.aiapp_voice_dialect = 'om';
  assert.equal(ctx.read(), 'om');
  store.aiapp_voice_dialect = 'toString';
  assert.equal(ctx.read(), 'ae');
  const f0 = app02.indexOf('async function fetchCloudSpeech(');
  assert.match(app02.slice(f0, app02.indexOf('\n}\n', f0)), /speed: ttsSpeedSetting\(\), dialect: ttsDialectSetting\(\) \}/);
});

test('الإعدادات: ستّة أزرار لهجة بمفاتيحها في قسم الصوت، تحفظ وتُسمِع وتتزامن عند الفتح، والوسم مرفوع', () => {
  const s = read('js/partials-settings.js');
  const a = s.indexOf('id="voiceDialectBtns"');
  const b = s.indexOf('btnTestVoice', a);
  assert.ok(a > s.indexOf('id="voiceSpeedBtns"') && b > a, 'بعد السرعة وقبل زرّ التجربة');
  const block = s.slice(a, b);
  const server = read('api/_lib/tts.js');
  for (const [d, key] of [['ae', 'voiceDialectAE'], ['om', 'voiceDialectOM'], ['sa', 'voiceDialectSA'], ['kw', 'voiceDialectKW'], ['qa', 'voiceDialectQA'], ['bh', 'voiceDialectBH']]) {
    assert.match(block, new RegExp('data-dialect="' + d + '"><span data-i18n="' + key + '"'), d);
    assert.match(server, new RegExp('\\n\\s+' + d + ": \\['ar-"), 'الخادم يعرف ' + d);
  }
  assert.match(s.slice(0, a), /data-i18n="voiceDialectLabel"/);
  assert.match(s, /#voiceSection \.voiceDialectBtn\.active/, 'إطار المختار الذهبيّ نفسه');
  const app07 = read('js/app-07-voice.js');
  assert.match(app07, /localStorage\.setItem\('aiapp_voice_dialect', b\.dataset\.dialect\);\n    setVoiceDialectUI\(b\.dataset\.dialect\);\n    try\{ speakSmart\(voicePersonaSample/);
  assert.match(read('js/app-06-checkout.js'), /setVoiceDialectUI\(ttsDialectSetting\(\)\)/);
  // الوسمان مرفوعان (رقمًا لا تثبيتًا): الإعدادات بعد ٧٠٧، واللغات بعد ٧٧٨ وسببها في التعليق
  assert.ok(Number((/\/js\/partials-settings\.js\?v=(\d+)"/.exec(read('index.html')) || [])[1]) >= 708);
  const tag = read('js/app-04-i18n-state.js').split('\n').find((l) => l.includes("sc.src = 'i18n/' + lg + '.js?v=")) || '';
  const tm = /\.js\?v=(\d+)';[^\n]*v-reply-dialect \((\d+)\): /.exec(tag);
  assert.ok(tm && Number(tm[1]) >= Number(tm[2]) && Number(tm[2]) >= 779);
});

test('النصوص السبعة بالـ١٤ لغة، والمكالمة ومها الأساسيّ لا يتغيّران', () => {
  const KEYS = ['voiceDialectLabel', 'voiceDialectAE', 'voiceDialectOM', 'voiceDialectSA', 'voiceDialectKW', 'voiceDialectQA', 'voiceDialectBH'];
  const data = read('js/app-03-i18n-data.js');
  for (const k of KEYS) assert.equal((data.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 2, k + ' في ar وen');
  assert.match(data, /voiceDialectOM: 'عماني'/);
  const files = fs.readdirSync(path.join(root, 'i18n')).filter((f) => f !== 'ad-studio.js');
  assert.equal(files.length, 12);
  for (const f of files) for (const k of KEYS) assert.match(read('i18n/' + f), new RegExp('"?' + k + '"?\\s*:\\s*"[^"]+"'), f + ' ' + k);
  for (const f of ['js/app-08-maha.js', 'api/_lib/realtime-session.js']) assert.ok(!/dialect: ttsDialectSetting/.test(read(f)), f);
});
