// tests/actor-lipsync.test.cjs — v-actor-lipsync (المالك ٢ أكتوبر، لقطة وضع «ممثل يتكلم — لهجة إماراتية»: «الصوت المتحدث ليس
// دقيق في اللهجة الإماراتية والكلام عربي ضعيف جدًّا»؛ ووافق على المحرّك وأضاف FAL_KEY).
// يثبّت على المعالجين الحقيقيّين: الكلام بالحرف بصوت إماراتيّ أصيل (حمدان/فاطمة) قبل أيّ خصم، والوجه (صورة المستخدم كما هي أو
// بورتريه من الوصف)، والمحرّك يستلم الصورة والصوت معًا؛ الخصم والردّ كما في Veo؛ وكلّ عطب قبل الإرسال = fallback بلا خصم؛
// والاستطلاع يسوّي التذكرة. والعميل: المسار الجديد أوّلًا وVeo احتياط، وصوت الممثل رجل/امرأة بالـ١٤ لغة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const stub = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const db = new Map();
stub('api/_lib/kv.js', { kvGetJSON: async (k) => (db.has(k) ? db.get(k) : null), kvPutJSON: async (k, v) => { db.set(k, v); } });
const gateFor = { allowed: true, username: 'omran' };
stub('api/_lib/_videoUsage.js', { checkOwnerBypass: () => gateFor.v || { allowed: true, username: 'omran' } });
const pts = { spent: [], refunded: [] };
stub('api/_lib/points.js', {
  COSTS: { veo_video: 400 },
  verifyPointsToken: () => 'sub-user',
  requireConfirmation: (body) => (body.confirmed ? null : { status: 428, payload: { error: 'confirm_required' } }),
  spendPoints: async (u, c) => { pts.spent.push([u, c]); return { ok: true }; },
  refundPoints: async (u, c) => { pts.refunded.push([u, c]); },
});
const locks = { taken: [], released: [] };
stub('api/_lib/abuse-guard.js', { videoLock: async (u) => { locks.taken.push(u); return { ok: true }; }, releaseVideoLock: async (u) => { locks.released.push(u); } });
const jobs = { remembered: [], settled: [] };
stub('api/_lib/video-job.js', { rememberVideoJob: async (id, j) => { jobs.remembered.push([id, j]); }, settleVideoJob: async (id, ok) => { jobs.settled.push([id, ok]); } });
const images = { calls: [], fail: false };
stub('api/_lib/trend-people.js', {
  aspectOf: (r) => (String(r) === '720:1280' ? '9:16' : '16:9'),
  callImage: async (key, parts, aspect) => { images.calls.push({ parts, aspect }); return images.fail ? { error: 'x' } : { b64: 'UE9SVFJBSVQ=', mime: 'image/png' }; },
});

const create = require(rp('api/_lib/actor-create.js'));
const status = require(rp('api/_lib/actor-status.js'));

function resObj() {
  return { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
}
function env(over) {
  const keys = ['FAL_KEY', 'AZURE_SPEECH_KEY_FREE', 'AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'GEMINI_API_KEY', 'ACTOR_LIPSYNC_MODEL', 'ACTOR_MAX_SEC'];
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, { FAL_KEY: 'fal-test', AZURE_SPEECH_KEY_FREE: 'az-free', GEMINI_API_KEY: 'gm' }, over || {});
}
function reset() { pts.spent.length = 0; pts.refunded.length = 0; locks.taken.length = 0; locks.released.length = 0; jobs.remembered.length = 0; jobs.settled.length = 0; images.calls.length = 0; images.fail = false; db.clear(); gateFor.v = null; }

async function run(body, net) {
  const log = { azure: [], fal: [] };
  const saved = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (/tts\.speech\.microsoft\.com/.test(u)) { log.azure.push({ url: u, init }); const n = (net && net.audioBytes) || 48000; return new Response(new Uint8Array(n), { status: (net && net.azureStatus) || 200 }); }
    if (/queue\.fal\.run/.test(u)) {
      log.fal.push({ url: u, init, body: init && init.body ? JSON.parse(init.body) : null });
      if (net && net.falStatus) return new Response(JSON.stringify({ detail: 'bad' }), { status: net.falStatus });
      return new Response(JSON.stringify({ request_id: 'req-12345678', status_url: 'https://queue.fal.run/fal-ai/bytedance/requests/req-12345678/status', response_url: 'https://queue.fal.run/fal-ai/bytedance/requests/req-12345678' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const res = resObj();
  try { await create({ method: 'POST', body: Object.assign({ speech: 'هلا والله! حياكم في عمران', token: 't' }, body) }, res); } finally { global.fetch = saved; }
  return { res, log };
}

test('١. المالك بلا صورة: صوت حمدان الإماراتيّ بالحرف، بورتريه من الوصف، والمحرّك يستلم الصورة والصوت معًا', async () => {
  env(); reset();
  const { res, log } = await run({ promptText: 'رجل إماراتي في مجلس', ratio: '720:1280' });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { id: 'req-12345678', seconds: 8 });
  assert.equal(log.azure.length, 1);
  assert.match(log.azure[0].url, /^https:\/\/uaenorth\.tts\.speech\.microsoft\.com\/cognitiveservices\/v1$/);
  assert.equal(log.azure[0].init.headers['Ocp-Apim-Subscription-Key'], 'az-free', 'المفتاح المجّانيّ أوّلًا');
  assert.match(log.azure[0].init.body, /<voice name="ar-AE-HamdanNeural">/);
  assert.match(log.azure[0].init.body, /xml:lang="ar-AE"/);
  assert.match(log.azure[0].init.body, /هلا والله! حياكم في عمران/);
  assert.equal(images.calls.length, 1);
  assert.equal(images.calls[0].aspect, '9:16', 'البورتريه بنسبة الفيديو');
  assert.match(images.calls[0].parts[0].text, /رجل إماراتي في مجلس/);
  assert.match(images.calls[0].parts[0].text, /mouth closed/);
  const f = log.fal[0];
  assert.equal(f.url, 'https://queue.fal.run/fal-ai/bytedance/omnihuman/v1.5');
  assert.equal(f.init.headers.Authorization, 'Key fal-test');
  assert.match(f.body.image_url, /^data:image\/png;base64,UE9SVFJBSVQ=$/);
  assert.match(f.body.audio_url, /^data:audio\/mpeg;base64,/);
  assert.equal(f.body.resolution, '720p');
  assert.equal(f.body.prompt, 'رجل إماراتي في مجلس');
  assert.deepEqual(db.get('actor/req/req-12345678').s, 'https://queue.fal.run/fal-ai/bytedance/requests/req-12345678/status');
  assert.equal(pts.spent.length, 0, 'المالك بلا خصم');
  assert.deepEqual(jobs.remembered, [['actor:req-12345678', { username: null, cost: 400, locked: false }]]);
});

test('٢. امرأة + صورة المستخدم: صوت فاطمة، والصورة كما هي بلا إعادة رسم', async () => {
  env(); reset();
  const { res, log } = await run({ voiceGender: 'female', imageBase64: 'SEVSTw==', imageMime: 'image/jpeg' });
  assert.equal(res.code, 200);
  assert.match(log.azure[0].init.body, /<voice name="ar-AE-FatimaNeural">/);
  assert.equal(images.calls.length, 0, 'لا توليد صورة — هويّته كما هي');
  assert.equal(log.fal[0].body.image_url, 'data:image/jpeg;base64,SEVSTw==');
  assert.equal(log.fal[0].body.prompt, undefined, 'بلا وصف = بلا prompt');
});

test('٣. بلا مفتاح المحرّك أو تعذّر الصوت: fallback إلى Veo بلا أيّ خصم ولا نداء محرّك', async () => {
  env({ FAL_KEY: '' }); reset();
  let r = await run({});
  assert.equal(r.res.code, 503); assert.equal(r.res.body.fallback, true);
  assert.equal(r.log.azure.length, 0); assert.equal(r.log.fal.length, 0);
  env(); reset();
  r = await run({}, { azureStatus: 500 });
  assert.equal(r.res.code, 503); assert.equal(r.res.body.fallback, true);
  assert.equal(r.log.fal.length, 0);
  assert.equal(pts.spent.length, 0);
});

test('٤. الكلام الطويل يُرفض قبل الخصم وقبل المحرّك (يُحاسَب بالثانية)', async () => {
  env(); reset();
  const { res, log } = await run({}, { audioBytes: 6000 * 20 });
  assert.equal(res.code, 400);
  assert.match(res.body.error, /طويل \(20 ثانية\).*15 ثانية/);
  assert.equal(log.fal.length, 0); assert.equal(pts.spent.length, 0);
});

test('٥. غير المالك: خصم Veo نفسه وقفله؛ وعطب المحرّك أو البورتريه بعد الخصم = ردّ كامل + fallback', async () => {
  env(); reset(); gateFor.v = { allowed: false, reason: 'forbidden' };
  let r = await run({ confirmed: true }, { falStatus: 500 });
  assert.deepEqual(pts.spent, [['sub-user', 400]]);
  assert.deepEqual(locks.taken, ['sub-user']);
  assert.equal(r.res.code, 503); assert.equal(r.res.body.fallback, true);
  assert.deepEqual(pts.refunded, [['sub-user', 400]]); assert.deepEqual(locks.released, ['sub-user']);
  reset(); gateFor.v = { allowed: false, reason: 'forbidden' }; images.fail = true;
  r = await run({ confirmed: true });
  assert.equal(r.res.body.fallback, true); assert.deepEqual(pts.refunded, [['sub-user', 400]]);
  assert.equal(r.log.fal.length, 0);
  reset(); gateFor.v = { allowed: false, reason: 'forbidden' };
  r = await run({});
  assert.equal(r.res.code, 428, 'التأكيد قبل الخصم كما في Veo'); assert.equal(pts.spent.length, 0);
  reset(); gateFor.v = { allowed: false, reason: 'forbidden' };
  r = await run({ confirmed: true });
  assert.equal(r.res.code, 200);
  assert.deepEqual(jobs.remembered, [['actor:req-12345678', { username: 'sub-user', cost: 400, locked: true }]]);
  assert.equal(pts.refunded.length, 0, 'النجاح لا يردّ — التذكرة تتولّى');
});

async function poll(id, net) {
  const saved = global.fetch;
  const seen = [];
  global.fetch = async (url, init) => { seen.push({ url: String(url), init }); return net(String(url)); };
  const res = resObj();
  try { await status({ query: { id } }, res); } finally { global.fetch = saved; }
  return { res, seen };
}

test('٦. الاستطلاع: قيد العمل، ثمّ الرابط ويسوّي التذكرة نجاحًا، والفشل يردّ الخصم', async () => {
  env(); reset();
  db.set('actor/req/req-12345678', { s: 'https://queue.fal.run/fal-ai/bytedance/requests/req-12345678/status', r: 'https://queue.fal.run/fal-ai/bytedance/requests/req-12345678' });
  let p = await poll('req-12345678', () => new Response(JSON.stringify({ status: 'IN_PROGRESS' }), { status: 200 }));
  assert.equal(p.res.body.status, 'RUNNING');
  assert.equal(p.seen[0].init.headers.Authorization, 'Key fal-test');
  p = await poll('req-12345678', (u) => new Response(JSON.stringify(/\/status$/.test(u) ? { status: 'COMPLETED' } : { video: { url: 'https://v3.fal.media/files/x/actor.mp4' }, duration: 8 }), { status: 200 }));
  assert.deepEqual(p.res.body, { status: 'SUCCEEDED', output: ['https://v3.fal.media/files/x/actor.mp4'] });
  assert.deepEqual(jobs.settled, [['actor:req-12345678', true]]);
  jobs.settled.length = 0;
  p = await poll('req-12345678', (u) => (/\/status$/.test(u) ? new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }) : new Response(JSON.stringify({ detail: [{ msg: 'face not detected' }] }), { status: 422 })));
  assert.equal(p.res.body.status, 'FAILED'); assert.match(p.res.body.failure, /face not detected/);
  assert.deepEqual(jobs.settled, [['actor:req-12345678', false]]);
  p = await poll('../etc', () => new Response('{}'));
  assert.equal(p.res.code, 400, 'معرّف غير صالح');
});

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('٧. العميل: المسار الجديد أوّلًا وVeo احتياط عند fallback وحده، وصوت الممثل يظهر مع الوضع', () => {
  const v = read('js/app-11-video.js');
  const i = v.indexOf("fetch('/api/video?action=actor-create'");
  const j = v.indexOf("if(!acData.fallback) throw new Error(acData.error || ('actor ' + ac.status));");
  const k = v.indexOf("veoPrompt = (text || (filmHeroBase64 ? 'The real person in the reference photo'");
  assert.ok(i > 0 && j > i && k > j, 'actor-create ← (فشل غير احتياطيّ يُرمى) ← Veo');
  assert.match(v, /fetch\('\/api\/video\?action=actor-status&id=' \+ encodeURIComponent\(acData\.id\)\)/);
  assert.match(v, /const actorGender = \(actorVoiceEl && actorVoiceEl\.value === 'female'\) \? 'female' : 'male';/);
  assert.match(v, /actorVoiceRowEl\.style\.display = \(m === 'actor'\) \? 'block' : 'none';/);
  const p = read('js/partials-core.js');
  assert.match(p, /<select id="videoMakerActorVoice"[^>]*>\s*<option value="male" selected data-i18n="videoActorVoiceMale">/);
  assert.match(p, /<option value="female" data-i18n="videoActorVoiceFemale">/);
  assert.ok(!/videoModeActor">[^<]*Veo/.test(p), 'لا اسم محرّك في اسم الوضع');
  assert.ok(read('index.html').includes('/js/partials-core.js?v=654'));
  const b = read('js/app.bundle.js');
  assert.ok(b.includes("fetch('/api/video?action=actor-create'"), 'الحزمة مبنيّة');
  const r = read('api/video.js');
  assert.match(r, /case 'actor-create': return require\('\.\/_lib\/actor-create\.js'\);/);
  assert.match(r, /case 'actor-status': return require\('\.\/_lib\/actor-status\.js'\);/);
});

test('٨. النصوص الجديدة بالـ١٤ لغة، واسم الوضع بلا «Veo» في كلّها', () => {
  const data = read('js/app-03-i18n-data.js');
  assert.equal((data.match(/videoActorVoiceMale/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  const langs = ['fr', 'es', 'hi', 'ur', 'bn', 'ne', 'id', 'fil', 'tr', 'zh', 'ru', 'ml'];
  for (const lg of langs) {
    const s = read('i18n/' + lg + '.js');
    for (const k of ['videoActorVoiceLabel', 'videoActorVoiceMale', 'videoActorVoiceFemale']) assert.match(s, new RegExp('"?' + k + '"?\\s*:\\s*"[^"]+"'), lg + ' ' + k);
    assert.ok(!/videoModeActor"?\s*:\s*"[^"]*Veo/.test(s), lg);
  }
  assert.ok(!/videoModeActor:\s*"[^"]*Veo/.test(data));
  assert.match(read('js/app-04-i18n-state.js'), /i18n\/' \+ lg \+ '\.js\?v=728'/);
});
