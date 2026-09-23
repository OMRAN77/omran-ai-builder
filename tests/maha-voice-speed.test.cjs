// v-maha-voice-speed (طلب المالك: «صوت مها بطيء سريع سريع جدًا... تحطف في الإعدادات في الصوت») —
// أربع درجات لسرعة كلام مها، مطبَّقة في الوضعين: الأساسيّ عبر معامل TTS native حقيقيّ
// (Azure SSML prosody rate% أو speed الرقميّ لـOpenAI)، والفائق (Realtime) عبر تعليمة
// نصّية صريحة في instructions (لا حقل غير موثَّق في audio.output — قد يرفض الجلسة كليًّا).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mahaSrc = read('js/app-08-maha.js');
const settingsSrc = read('js/partials-settings.js');
const ttsSrc = read('api/_lib/tts.js');
const rtSrc = read('api/_lib/realtime-session.js');

test('واجهة الإعدادات: أربعة أزرار سرعة بمفاتيح i18n صحيحة داخل قسم الصوت', () => {
  const start = settingsSrc.indexOf('id="voiceSpeedBtns"');
  assert.ok(start > 0, 'صفّ أزرار السرعة موجود');
  const end = settingsSrc.indexOf('btnTestVoice', start);
  const block = settingsSrc.slice(start, end);
  for (const [speed, key] of [['slow', 'voiceSpeedSlow'], ['normal', 'voiceSpeedNormal'], ['fast', 'voiceSpeedFast'], ['xfast', 'voiceSpeedXFast']]) {
    assert.match(block, new RegExp('data-speed="' + speed + '"[^>]*>.*?data-i18n="' + key + '"', 's'), speed + ' موجود بمفتاحه الصحيح');
  }
  assert.match(settingsSrc.slice(0, start), /data-i18n="voiceSpeedLabel"/, 'تسمية القسم موجودة قبل الأزرار');
});

test('كل الـ١٤ لغة تعرّف المفاتيح الخمسة (لا لغة ناقصة)', () => {
  const KEYS = ['voiceSpeedLabel', 'voiceSpeedSlow', 'voiceSpeedNormal', 'voiceSpeedFast', 'voiceSpeedXFast'];
  const i18nSrc = read('js/app-03-i18n-data.js');
  // ar وen في نفس الملفّ — نتحقّق من وجود كل مفتاح مرّتين على الأقلّ (مرّة لكلّ لغة)
  for (const k of KEYS) {
    const count = (i18nSrc.match(new RegExp(k + ':', 'g')) || []).length;
    assert.ok(count >= 2, k + ' يجب أن يظهر في ar وen معًا (وجد ' + count + ')');
  }
  const dir = path.join(root, 'i18n');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'ad-studio.js');
  assert.ok(files.length >= 12, 'توقّعت ١٢ ملفّ لغة على الأقلّ');
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const k of KEYS) {
      assert.match(src, new RegExp('"?' + k + '"?\\s*:'), f + ' ينقصه المفتاح ' + k);
    }
  }
});

test('mahaReadVoiceSpeed: افتراضي normal، يقرأ المحفوظ، ويرفض أي قيمة دخيلة', () => {
  const start = mahaSrc.indexOf('const MAHA_VOICE_SPEEDS');
  const end = mahaSrc.indexOf('\n}\n', mahaSrc.indexOf('function mahaReadVoiceSpeed(')) + 3;
  assert.ok(start > 0 && end > start, 'المقطع موجود');
  const chunk = mahaSrc.slice(start, end);
  const store = {};
  const ctx = { localStorage: { getItem: (k) => (k in store ? store[k] : null) } };
  vm.runInNewContext(chunk + '\nthis.read = mahaReadVoiceSpeed;', ctx);
  assert.equal(ctx.read(), 'normal', 'بلا تخزين = normal');
  store.aiapp_maha_voice_speed = 'fast';
  assert.equal(ctx.read(), 'fast');
  store.aiapp_maha_voice_speed = 'not-a-real-speed';
  assert.equal(ctx.read(), 'normal', 'قيمة تالفة تسقط على normal لا تُمرَّر كما هي');
});

test('mahaSpeak (الأساسيّ) يرسل speed ضمن جسم /api/tts', () => {
  const start = mahaSrc.indexOf('async function mahaSpeak(');
  const body = mahaSrc.slice(start, start + 400);
  assert.match(body, /speed:\s*mahaReadVoiceSpeed\(\)/, 'الحقل يُرسَل مع كل طلب نطق');
});

test('mahaStartRealtimeCall يرسل voiceSpeed ضمن جسم /api/realtime-session', () => {
  const start = mahaSrc.indexOf('async function mahaStartRealtimeCall(');
  const body = mahaSrc.slice(start, start + 700);
  assert.match(body, /voiceSpeed:\s*mahaReadVoiceSpeed\(\)/, 'الحقل يُرسَل عند طلب الجلسة الفائقة');
});

test('api/_lib/tts.js: خريطة السرعة الأربع صحيحة (Azure % وOpenAI رقمي)، وvoice آخر بلا speed لا ينكسر', async () => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret';
  const rp = (f) => require.resolve(path.join(root, f));
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsumeCustom: async () => ({ allowed: true }), clientIp: () => '127.0.0.1',
  } };
  delete require.cache[rp('api/_lib/tts.js')];
  const handler = require(rp('api/_lib/tts.js'));
  const calls = [];
  const savedFetch = global.fetch;
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'k';
  global.fetch = async (url, init) => {
    calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
    return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
  };
  try {
    for (const [speed, openaiSpeed] of [['slow', 0.8], ['normal', 1], ['fast', 1.2], ['xfast', 1.4], [undefined, 1]]) { // v-voice-speed-range: مدى يُسمع
      calls.length = 0;
      const res = fakeRes();
      await handler({ method: 'POST', body: { text: 'hi', voice: 'onyx', speed }, headers: {}, socket: {} }, res);
      assert.equal(res.code, 200, 'speed=' + speed);
      assert.equal(calls[0].body.speed, openaiSpeed, 'معامل OpenAI الرقميّ لـ' + speed);
    }
  } finally {
    global.fetch = savedFetch; process.env.OPENAI_API_KEY = savedKey;
    delete require.cache[rp('api/_lib/_usage.js')]; delete require.cache[rp('api/_lib/tts.js')];
  }
});

function fakeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

test('realtime-session.js: تعليمة السرعة تُضاف لوضع assistant فقط، وnormal بلا أثر إطلاقًا', () => {
  assert.match(rtSrc, /const voiceSpeed = \['slow', 'fast', 'xfast'\]\.includes\(body\.voiceSpeed\) \? body\.voiceSpeed : 'normal';/);
  assert.match(rtSrc, /VOICE_SPEED_INSTRUCTIONS\[voiceSpeed\] \|\| ''/, "normal (أو قيمة غير معروفة) يعطي نصًّا فارغًا");
  assert.match(rtSrc, /\(mode === 'builder' \? '' : voiceSpeedInstruction\)/, 'تبويب البنّاء الصوتي لا يتأثر — سرعة مها إعداد خاصّ بشخصيتها');
  for (const kw of ['slow', 'fast', 'xfast']) {
    assert.match(rtSrc, new RegExp("VOICE_SPEED_INSTRUCTIONS = \\{[\\s\\S]*" + kw + ":"), kw + ' له نصّ تعليمة');
  }
  // v-maha-pace: تعليمات لطيفة فوق المعامل الحقيقيّ — لا مبالغة تكسر الإيقاع، وسطر إيقاع طبيعيّ دائم
  assert.ok(!/auctioneer|rapid-fire|notably slower/.test(rtSrc), 'لا «مزاد» ولا «أبطأ بوضوح»');
  assert.ok(rtSrc.includes('"PACE: speak at a steady, natural conversational pace, like a calm phone call - never rushed, never dragged, with clear articulation.",'));
});

console.log('✓ maha-voice-speed: أربع درجات لسرعة مها من الإعدادات، مطبَّقة في الأساسيّ (TTS حقيقي) والفائق (تعليمة إيقاع)');
