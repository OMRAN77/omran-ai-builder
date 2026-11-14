'use strict';
/* v-ml-voice (المالك ١٤ نوفمبر ٢٠٢٦، فيديو om ai الترويجيّ بالإنجليزيّ والمالايالام): صوت التطبيق كان يربط
   المالايالام ('ml') بصوت Azure إنجليزيّ (en-US المتعدّد اللغات) في مساري مها والصوت العامّ — مقيس حيًّا على
   الإنتاج: كلّ النداءات ترجع tier=free (Azure، وGemini معطّل اليوم) بصوت en-US، فيُنطَق النصّ المالايالاميّ غلط
   (عيّنة أنثى ٤ كيلوبايت = فشلت فعليًّا). الآن المسارَان يستعملان صوت Azure المالايالاميّ الأصليّ ml-IN:
   Sobhana (أنثى) وMidhun (ذكر). الفحص على SSML الخارج لا على نداء حيّ (MAHA_VOICE=azure يُطفئ Gemini). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const rp = (f) => require.resolve(path.join(__dirname, '..', f));

const ENV = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_KEY_FREE', 'AZURE_SPEECH_REGION', 'AZURE_SPEECH_REGION_FREE', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'MAHA_VOICE'];

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

/* يشغّل معالج tts.js على جسم واحد ويعيد SSML المرسَل إلى Azure. MAHA_VOICE=azure يُطفئ Gemini
   فيكون المسار حتميًّا Azure، والمفتاح المجّانيّ وحده يكفي. */
async function ssmlFor(body) {
  const saved = {};
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.AZURE_SPEECH_KEY_FREE = 'free-k';
  process.env.MAHA_VOICE = 'azure';
  require.cache[rp('api/_lib/_usage.js')] = {
    id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true,
    exports: { checkAndConsumeCustom: async () => ({ allowed: true }), clientIp: () => '127.0.0.1' },
  };
  delete require.cache[rp('api/_lib/tts.js')];
  const handler = require(rp('api/_lib/tts.js'));
  let ssml = '';
  const savedFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (/tts\.speech\.microsoft\.com/.test(String(url))) ssml = String((init && init.body) || '');
    return new Response(new Uint8Array([0xff, 0xf3, 1, 2]).buffer, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  };
  try {
    const res = fakeRes();
    await handler({ method: 'POST', headers: {}, socket: {}, body }, res);
    return { ssml, res };
  } finally {
    global.fetch = savedFetch;
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    delete require.cache[rp('api/_lib/_usage.js')];
    delete require.cache[rp('api/_lib/tts.js')];
  }
}

const ML = 'വസ്ത്രങ്ങൾ, അലങ്കാരം, വീഡിയോ.';

test('١. مها + مالايالام أنثى ← صوت ml-IN الأصليّ (Sobhana)، لا إنجليزيّ', async () => {
  const { ssml, res } = await ssmlFor({ voice: 'maha', text: ML, lang: 'ml', gender: 'female' });
  assert.equal(res.code, 200);
  assert.match(ssml, /xml:lang="ml-IN"/, 'locale مالايالاميّ');
  assert.match(ssml, /name="ml-IN-SobhanaNeural"/, 'صوت أنثى مالايالاميّ');
  assert.doesNotMatch(ssml, /en-US-/, 'لا صوت إنجليزيّ على نصّ مالايالاميّ');
});

test('٢. مها + مالايالام ذكر ← Midhun', async () => {
  const { ssml } = await ssmlFor({ voice: 'maha', text: ML, lang: 'ml', gender: 'male' });
  assert.match(ssml, /name="ml-IN-MidhunNeural"/);
  assert.doesNotMatch(ssml, /en-US-/);
});

test('٣. الصوت العامّ (بلا Gemini) + مالايالام ← ml-IN كذلك', async () => {
  const { ssml } = await ssmlFor({ voice: 'onyx', text: ML, lang: 'ml', gender: 'male' });
  assert.match(ssml, /xml:lang="ml-IN"/);
  assert.match(ssml, /name="ml-IN-MidhunNeural"/);
  assert.doesNotMatch(ssml, /en-US-/);
});

test('٤. الصوت العامّ (صوت أنثى nova) يكتشف المالايالام من النصّ ولو غابت lang', async () => {
  const { ssml } = await ssmlFor({ voice: 'nova', text: ML }); // nova ← صوت أنثى، بلا lang
  assert.match(ssml, /xml:lang="ml-IN"/);
  assert.match(ssml, /name="ml-IN-SobhanaNeural"/);
});

test('٥. بلا انحدار: الإنجليزيّ يبقى en-US والعربيّ ar-AE', async () => {
  const en = await ssmlFor({ voice: 'maha', text: 'Hello there, this is a test.', lang: 'en', gender: 'female' });
  assert.match(en.ssml, /name="en-US-JennyMultilingualNeural"/);
  const ar = await ssmlFor({ voice: 'maha', text: 'مرحبًا، هذا اختبار.', lang: 'ar', gender: 'male' });
  assert.match(ar.ssml, /name="ar-AE-HamdanNeural"/);
});
