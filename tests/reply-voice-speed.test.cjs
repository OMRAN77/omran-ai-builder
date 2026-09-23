'use strict';
/* v-reply-voice-speed (طلب المالك ٢٢ سبتمبر): «الصوت الي موجود فيه خاصيّة بطيء وسريع والخ… أريدهم لمها والصوت الي عند
   المحادثة في الردود». سرعة الإعدادات كانت تصل مها وحدها: «استمع» على الردود وقراءتها التلقائيّة وزرّ «تجربة الصوت»
   (كلّها speakSmart ← fetchCloudSpeech) لم تكن ترسلها. وفي مكالمة مها المباشرة كانت تعليمة نبرة فقط ومعامل السرعة
   ثابتًا 1.05 — الآن المعامل الموثّق audio.output.speed يتبع الدرجة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

function slice(src, startMark, endMark) {
  const i = src.indexOf(startMark);
  assert.ok(i >= 0, startMark);
  const j = src.indexOf(endMark, i);
  assert.ok(j > i, endMark);
  return src.slice(i, j);
}

test('١. ttsSpeedSetting: عاديّ افتراضيًّا، يقرأ الدرجات الأربع، ويرفض الدخيل والتخزين المعطّل', () => {
  const src = read('js/app-02-tts.js');
  const chunk = slice(src, 'function ttsSpeedSetting(){', 'async function fetchCloudSpeech(');
  const store = {};
  const ctx = { localStorage: { getItem: (k) => (k in store ? store[k] : null) } };
  vm.runInNewContext(chunk + '\nthis.f = ttsSpeedSetting;', ctx);
  assert.equal(ctx.f(), 'normal');
  for (const v of ['slow', 'normal', 'fast', 'xfast']) { store.aiapp_maha_voice_speed = v; assert.equal(ctx.f(), v); }
  store.aiapp_maha_voice_speed = 'turbo';
  assert.equal(ctx.f(), 'normal');
  const broken = { localStorage: { getItem() { throw new Error('blocked'); } } };
  vm.runInNewContext(chunk + '\nthis.f = ttsSpeedSetting;', broken);
  assert.equal(broken.f(), 'normal', 'تخزين محجوب لا يكسر القراءة');
});

test('٢. صوت الردود (fetchCloudSpeech) يرسل السرعة مع الجنس — هو نفسه ما يستعمله «استمع» والقراءة التلقائيّة و«تجربة الصوت»', async () => {
  const src = read('js/app-02-tts.js');
  const chunk = slice(src, 'function ttsSpeedSetting(){', '// Splits text into speakable chunks');
  const store = { aiapp_maha_voice_speed: 'slow', aiapp_voice_gender: 'female' };
  const calls = [];
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    detectSpeechLang: () => 'ar',
    fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, blob: async () => 'b' }; },
    URL: { createObjectURL: () => 'blob:x' },
    __swallow() {},
  };
  vm.runInNewContext(chunk + '\nthis.f = fetchCloudSpeech;', ctx);
  await ctx.f('مرحبا');
  assert.equal(calls[0].url, '/api/tts');
  assert.equal(calls[0].body.speed, 'slow');
  assert.equal(calls[0].body.gender, 'female');
  store.aiapp_maha_voice_speed = 'xfast';
  await ctx.f('مرحبا');
  assert.equal(calls[1].body.speed, 'xfast');
  // المستدعون الثلاثة يمرّون بـspeakSmart (← fetchCloudSpeech) فلا يحتاج أيّ منهم تعديلًا
  assert.ok(read('js/app-07-voice.js').includes('speakSmart(testTextByLang[lang] || testTextByLang.en, null, null, true);'), 'تجربة الصوت');
  assert.ok(read('js/app-04-i18n-state.js').includes('speakSmart(m.content, null,'), 'استمع');
  assert.ok(read('js/app-09-attach.js').includes('speakSmart(lastMsg.content, null, null, false, wordEls);'), 'القراءة التلقائيّة');
});

test('٣. صوت الجهاز الاحتياطيّ بالسرعة نفسها، والحزمة مطابقة', () => {
  for (const f of ['js/app-02-tts.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes("utter.rate = ({ slow: 0.8, normal: 1, fast: 1.2, xfast: 1.4 })[ttsSpeedSetting()] || 1;"), f); // v-voice-speed-range
    assert.ok(s.includes('text: String(text).slice(0, 4000), speed: ttsSpeedSetting() })'), f);
  }
});

test('٤. مكالمة مها المباشرة: معامل السرعة الحقيقيّ يتبع الدرجة، ووضع البنّاء الصوتيّ لا يتأثّر', async () => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'voice-speed-secret';
  process.env.OPENAI_API_KEY = 'sk-test';
  require.cache[rp('api/_lib/_usage.js')] = { id: rp('api/_lib/_usage.js'), filename: rp('api/_lib/_usage.js'), loaded: true, exports: {
    checkAndConsume: async () => ({ allowed: true }), DAILY_LIMIT: 5, clientIp: () => '127.0.0.1',
  } };
  require.cache[rp('api/_lib/points.js')] = { id: rp('api/_lib/points.js'), filename: rp('api/_lib/points.js'), loaded: true, exports: {
    verifyPointsToken: () => 'omran', isOwnerUsername: () => true, readPoints: async () => null, COSTS: { maha_minute: 10 },
  } };
  delete require.cache[rp('api/_lib/realtime-session.js')];
  const handler = require(rp('api/_lib/realtime-session.js'));
  const save = global.fetch;
  const bodies = [];
  global.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ value: 'ek_test' }), { status: 200 }); };
  const run = async (body) => {
    const res = { code: 0, j: null, setHeader() { return res; }, status(c) { res.code = c; return res; }, json(j) { res.j = j; return res; }, send() { return res; }, end() { return res; } };
    await handler({ method: 'POST', headers: {}, socket: {}, body: Object.assign({ token: 't' }, body) }, res);
    assert.equal(res.code, 200, JSON.stringify(res.j));
    return bodies[bodies.length - 1].session;
  };
  try {
    const want = { slow: 0.8, normal: 1.0, fast: 1.2, xfast: 1.4 }; // v-voice-speed-range
    for (const [v, speed] of Object.entries(want)) {
      const s = await run({ voiceSpeed: v });
      assert.equal(s.audio.output.speed, speed, v);
    }
    assert.equal((await run({ voiceSpeed: 'bogus' })).audio.output.speed, 1.0, 'قيمة دخيلة = العاديّ');
    assert.equal((await run({})).audio.output.speed, 1.0, 'بلا قيمة = العاديّ (1.0 كالمحادثة الصوتيّة المعتادة)');
    assert.equal((await run({ mode: 'builder', voiceSpeed: 'xfast' })).audio.output.speed, undefined, 'البنّاء بلا معامل كما كان');
  } finally {
    global.fetch = save;
    delete require.cache[rp('api/_lib/_usage.js')];
    delete require.cache[rp('api/_lib/points.js')];
    delete require.cache[rp('api/_lib/realtime-session.js')];
  }
});
