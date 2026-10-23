'use strict';
/* v-om-voices-chat (المالك ٢٣ أكتوبر «ابدأ» — قبلها: «أريد في الدردشة هذي الأصوات… ليش تتدخل مها»): «استمع» على ردود
   المحادثة للمالك وحده يقرأ بأصوات «أصوات om» (موقع omran-voices) بدل مها، وعند حدّها اليوميّ رسالة الحدّ لا صوت آخر.
   باقي المستخدمين ومكالمة مها كما هم، ولغة لا ينطقها المحرّك تبقى بمها. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const fresh = () => { delete require.cache[require.resolve(path.join(root, 'api/_lib/om-voices.js'))]; return require(path.join(root, 'api/_lib/om-voices.js')); };

function withEnv(env, fn) {
  const old = {};
  for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } });
}
function wav(samples, rate = 24000) {
  const data = Buffer.alloc(samples * 2, 7);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test('للمالك وحده، وبمفتاح موقع الأصوات، وبلغة ينطقها المحرّك', () =>
  withEnv({ OM_VOICES_KEY: 'عبدالله', OWNER_USERNAMES: undefined, OWNER_USERNAME: undefined }, () => {
    const om = fresh();
    assert.equal(om.enabledFor('omran', 'ar'), true);
    assert.equal(om.enabledFor('omran', 'en'), true);
    assert.equal(om.enabledFor('someone', 'ar'), false, 'مستخدم عاديّ يبقى بمها');
    assert.equal(om.enabledFor(null, 'ar'), false, 'ضيف أو مكالمة بلا حساب');
    assert.equal(om.enabledFor('omran', 'ur'), false, 'الأورديّة لا ينطقها المحرّك ⇐ مها');
  }).then(() => withEnv({ OM_VOICES_KEY: undefined }, () => assert.equal(fresh().enabledFor('omran', 'ar'), false, 'بلا مفتاح = لا شيء يتغيّر'))));

test('المقطع يتقسّم قطعًا ≤ ٢٦٠ حرف بلا ضياع كلمة', () => {
  const om = fresh();
  const text = 'هلا والله، هذي جملة طويلة شوي عشان نجرّب التقسيم. '.repeat(12).trim();
  const p = om.pieces(text);
  assert.ok(p.length >= 2);
  for (const x of p) assert.ok(x.length <= 260, x.length);
  assert.equal(p.join(' '), text.replace(/\s+/g, ' '));
});

test('يرسل لموقع الأصوات بكلمة سرّه مشفّرة والصوت حسب الجنس، ويركّب القطع WAV واحدًا', () =>
  withEnv({ OM_VOICES_KEY: 'عبدالله', OM_VOICES_URL: 'https://voices.test/', OM_VOICES_MALE: 'v5', OM_VOICES_FEMALE: 'v1' }, async () => {
    const om = fresh();
    const real = global.fetch;
    const calls = [];
    global.fetch = async (url, opts) => { calls.push({ url, key: opts.headers['X-Access-Key'], body: JSON.parse(opts.body) }); return new Response(wav(2400)); };
    try {
      const out = await om.speak({ text: 'كلمة '.repeat(80).trim(), lang: 'ar', gender: 'male' });
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url, 'https://voices.test/api/tts');
      assert.equal(calls[0].key, encodeURIComponent('عبدالله'));
      assert.deepEqual(calls[0].body.voice, { donor: 'v5' });
      assert.equal(calls[0].body.lang, 'ar');
      assert.equal(out.toString('ascii', 0, 4), 'RIFF');
      assert.equal(out.readUInt32LE(40), 2400 * 2 * 2 + Math.round(24000 * 0.25) * 2, 'قطعتان ووقفة ربع ثانية');
      await om.speak({ text: 'hello', lang: 'en', gender: 'female' });
      assert.deepEqual(calls[2].body.voice, { donor: 'v1' });
    } finally { global.fetch = real; }
  }));

test('حدّ موقع الأصوات (429) ⇐ om_quota', () =>
  withEnv({ OM_VOICES_KEY: 'k' }, async () => {
    const om = fresh();
    const real = global.fetch;
    global.fetch = async () => new Response('{"code":"quota"}', { status: 429 });
    try { await assert.rejects(om.speak({ text: 'هلا', lang: 'ar' }), (e) => e.code === 'om_quota' && e.message === 'om-quota'); }
    finally { global.fetch = real; }
  }));

test('الخادم: الفرع قبل مها، لردود المحادثة (src reply) فقط، والحدّ 429 om-quota', () => {
  const src = read('api/_lib/tts.js');
  const a = src.indexOf("if (voice === 'maha' && body.src === 'reply')");
  const b = src.indexOf("if (voice === 'maha') {");
  assert.ok(a > 0 && b > a, 'فرع أصوات om قبل مها');
  const branch = src.slice(a, b);
  assert.match(branch, /om\.enabledFor\(usage\.username, lang\)/);
  assert.match(branch, /error: quota \? 'om-quota'/);
});

test('العميل: «استمع» وحده يرسل src reply، وom-quota = رسالة الحدّ المترجمة ويقف بلا صوت بديل', () => {
  const app02 = read('js/app-02-tts.js');
  const f0 = app02.indexOf('async function fetchCloudSpeech(');
  const f1 = app02.indexOf('\n}\n', f0);
  assert.match(app02.slice(f0, f1), /voice: 'maha', src: 'reply'/);
  const q = app02.indexOf("if(e && e.message === 'om-quota')");
  const dev = app02.indexOf("if('speechSynthesis' in window){\n            currentCloudToken = null; currentCloudAudio = null;\n            speakOnDevice(chunks[i].wordStart, started);");
  assert.ok(q > 0 && dev > q, 'رسالة الحدّ قبل صوت الجهاز');
  assert.match(app02.slice(q, dev), /settingsToast\(t\('portraitLimitReached'\)\)/);
  for (const f of ['js/app-08-maha.js', 'js/app-07-voice.js', 'js/app-12-studios.js']) assert.ok(!/src: 'reply'/.test(read(f)), f + ' لا يتغيّر');
  // الرسالة المستعملة موجودة بكلّ لغات الواجهة
  for (const f of fs.readdirSync(path.join(root, 'i18n')).filter((x) => x !== 'ad-studio.js')) assert.match(read('i18n/' + f), /portraitLimitReached/, f);
});
