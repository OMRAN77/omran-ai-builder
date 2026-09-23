'use strict';
/* v-tts-account (المالك ٢٣ سبتمبر: «ابدا فيهم كلهم» — بعد: «القراءة محسوبة على عنوان الإنترنت، ٦٠ طلبًا في اليوم،
   وأنت نفسك محدود بها»): صوت القراءة («استمع»، القراءة التلقائيّة، «تجربة الصوت»)، ومها الأساسيّ، وتأكيد تبويب الصوت
   كانت تطلب /api/tts بلا token ولا guestId، فيعدّها الخادم على عنوان IP: المالك يُحدّ كأيّ ضيف، ومن يتشاركون IP
   (شبكة الجوّال، البيت) يتشاركون الستّين. الآن ترسل الحساب: المالك وVIP بلا حدّ، وكلّ حساب حصّته، والضيف على IP كما كان. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));

/* ---------- العميل: كلّ نداءات صوت القراءة ترسل الحساب ---------- */
function captureTtsBody(file, startMark, endMark, call, extra) {
  const src = read(file);
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a);
  assert.ok(a >= 0 && b > a, file + ': ' + startMark);
  const end = endMark === '\n}\n' ? b + 2 : b; // القوس الأخير من الدالّة
  // مساعدا الحساب يعيشان في app-02 (قبل app-07/08 في الحزمة) — يُحمَّلان مع مقاطع الملفّات الأخرى
  const app02 = read('js/app-02-tts.js');
  const h0 = app02.indexOf('function ttsAuthToken(');
  const h1 = app02.indexOf('async function fetchCloudSpeech(');
  const helpers = (file !== 'js/app-02-tts.js' && h0 > 0 && h1 > h0) ? app02.slice(h0, h1) : '';
  const bodies = [];
  const ctx = Object.assign({
    localStorage: { getItem: () => null },
    fetch: async (url, init) => { if (url === '/api/tts') bodies.push(JSON.parse(init.body)); return { ok: false, status: 402, json: async () => ({}) }; },
    URL: { createObjectURL: () => 'blob:x' },
    detectSpeechLang: () => 'ar',
    __swallow() {},
  }, extra || {});
  vm.runInNewContext(helpers + src.slice(a, end) + '\nthis.run = ' + call + ';', ctx);
  return { ctx, bodies };
}
const withAuth = (tok) => ({
  authGet: (k) => (k === 'aiapp_auth_token' ? tok : null),
  window: { getGuestId: () => 'g_test_guest_1' },
});

test('١. صوت القراءة (fetchCloudSpeech) يرسل الحساب ومعرّف الضيف مع السرعة والجنس كما كانا', async () => {
  const { ctx, bodies } = captureTtsBody('js/app-02-tts.js', 'function ttsSpeedSetting(){', '// Splits text into speakable chunks',
    '(t) => fetchCloudSpeech(t).catch(() => {})', withAuth('tok-user'));
  await ctx.run('مرحبا');
  assert.equal(bodies[0].token, 'tok-user');
  assert.equal(bodies[0].guestId, 'g_test_guest_1');
  assert.equal(bodies[0].voice, 'maha');
  assert.equal(bodies[0].speed, 'normal');
  // بلا وحدة الدخول (أو قبل تحميلها): لا انهيار، ويُعدّ ضيفًا كما كان
  const bare = captureTtsBody('js/app-02-tts.js', 'function ttsSpeedSetting(){', '// Splits text into speakable chunks',
    '(t) => fetchCloudSpeech(t).catch(() => {})');
  await bare.ctx.run('مرحبا');
  assert.equal(bare.bodies[0].token, '');
  assert.equal(bare.bodies[0].guestId, '');
});

test('٢. مها الأساسيّ (mahaSpeak) وتأكيد تبويب الصوت (voiceTabSpeak) يرسلان الحساب', async () => {
  const maha = captureTtsBody('js/app-08-maha.js', 'async function mahaSpeak(', '\n}\n', 'mahaSpeak',
    Object.assign(withAuth('tok-maha'), { mahaDetectedGender: 'female', mahaReplyLang: 'ar', mahaReadVoiceSpeed: () => 'normal', mahaSetState() {}, setTimeout: (f) => f() }));
  await maha.ctx.run('أهلًا');
  assert.equal(maha.bodies[0].token, 'tok-maha');
  assert.equal(maha.bodies[0].guestId, 'g_test_guest_1');
  assert.equal(maha.bodies[0].voice, 'maha');
  const tab = captureTtsBody('js/app-07-voice.js', 'async function voiceTabSpeak(', '\n}\n', 'voiceTabSpeak',
    Object.assign(withAuth('tok-tab'), { btnVoiceTabMic: null }));
  await tab.ctx.run('تمّ');
  assert.equal(tab.bodies[0].token, 'tok-tab');
  assert.equal(tab.bodies[0].guestId, 'g_test_guest_1');
});

/* ---------- الخادم: العدّ الحقيقيّ (_usage.js) بمخزن في الذاكرة ---------- */
function memKv() {
  const m = new Map();
  const num = (k) => Number(m.get(k)) || 0;
  return {
    kvGetJSON: async (k) => (m.has(k) ? m.get(k) : null),
    kvPutJSON: async (k, v) => { m.set(k, v); return true; },
    kvDel: async (k) => { m.delete(k); return true; },
    kvList: async () => [],
    kvIncr: async (k) => { m.set(k, num(k) + 1); return num(k); },
    kvIncrBy: async (k, by) => { m.set(k, num(k) + by); return num(k); },
    kvDecrBy: async (k, by) => { m.set(k, num(k) - by); return num(k); },
    kvExpire: async () => true,
    kvSetIfAbsent: async (k, v) => { if (m.has(k)) return false; m.set(k, v); return true; },
    kvGetRaw: async (k) => (m.has(k) ? String(m.get(k)) : null),
    kvSetRaw: async (k, v) => { m.set(k, v); return true; },
  };
}
const FRESH = ['api/_lib/tts.js', 'api/_lib/_usage.js', 'api/_lib/auth.js', 'api/_lib/_vip.js', 'api/_lib/tier.js'];
async function withServer(fn) {
  const savedEnv = { AUTH_SECRET: process.env.AUTH_SECRET, AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY, AZURE_SPEECH_KEY_FREE: process.env.AZURE_SPEECH_KEY_FREE };
  process.env.AUTH_SECRET = 'tts-account-test-secret';
  process.env.AZURE_SPEECH_KEY = 'paid-k';
  delete process.env.AZURE_SPEECH_KEY_FREE;
  for (const f of FRESH) delete require.cache[rp(f)];
  require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: memKv() };
  const savedFetch = global.fetch;
  global.fetch = async () => new Response(new Uint8Array([0xff, 0xf3, 1]).buffer, { status: 200 });
  const handler = require(rp('api/_lib/tts.js'));
  const { makeToken } = require(rp('api/_lib/auth.js'));
  const call = async (body, ip) => {
    const res = { code: 0, setHeader() { return res; }, status(c) { res.code = c; return res; }, json() { return res; }, send() { return res; }, end() { return res; } };
    await handler({ method: 'POST', headers: { 'x-forwarded-for': ip }, socket: {}, body: Object.assign({ voice: 'maha', text: 'مرحبا', lang: 'ar' }, body) }, res);
    return res.code;
  };
  try { await fn({ call, makeToken }); } finally {
    global.fetch = savedFetch;
    for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    delete require.cache[rp('api/_lib/kv.js')];
    for (const f of FRESH) delete require.cache[rp(f)];
  }
}
const times = async (n, f) => { const out = []; for (let i = 0; i < n; i++) out.push(await f(i)); return out; };

test('٣. المالك بلا حدّ في صوت القراءة، والضيف على IP كما كان', async () => {
  await withServer(async ({ call, makeToken }) => {
    const owner = await times(75, () => call({ token: makeToken('omran') }, '10.0.0.1'));
    assert.ok(owner.every((c) => c === 200), 'المالك: ' + owner.filter((c) => c !== 200).length + ' مرفوض');
    // ما كان يحدث: التطبيق لا يرسل الحساب، فالمالك نفسه ضيف على عنوانه ويُرفض بعد ٦٠
    const ownerBefore = await times(61, () => call({}, '10.0.0.9'));
    assert.equal(ownerBefore[60], 402, 'قبل الإصلاح: بلا token = حصّة العنوان');
    const guest = await times(61, () => call({}, '10.0.0.2'));
    assert.equal(guest.filter((c) => c === 200).length, 60, 'الضيف ٦٠ على عنوانه');
    assert.equal(guest[60], 402);
    assert.equal(await call({}, '10.0.0.3'), 200, 'عنوان آخر حصّته مستقلّة');
  });
});

test('٤. كلّ حساب حصّته مهما تغيّر عنوانه، وحسابان على IP واحد لا يتشاركان الستّين', async () => {
  await withServer(async ({ call, makeToken }) => {
    const a = makeToken('zz_reader_a');
    const b = makeToken('zz_reader_b');
    const aRuns = await times(61, (i) => call({ token: a }, '10.1.0.' + (i % 5)));
    assert.equal(aRuns.filter((c) => c === 200).length, 60, 'الحساب ٦٠ حتّى لو تنقّل بين الشبكات');
    assert.equal(aRuns[60], 402);
    const bRuns = await times(60, () => call({ token: b }, '10.1.0.1'));
    assert.ok(bRuns.every((c) => c === 200), 'حساب ثانٍ على IP الأوّل نفسه لا يُحرم');
  });
});

test('٥. الحزمة مطابقة', () => {
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes("body: JSON.stringify({ voice: 'maha', gender, lang: detected, token: ttsAuthToken(), guestId: ttsGuestId(), text: String(text).slice(0, 4000), speed: ttsSpeedSetting() })"));
  assert.ok(bundle.includes('speed: mahaReadVoiceSpeed(), token: ttsAuthToken(), guestId: ttsGuestId() })'));
});
