// tests/video-open-lock.test.cjs — v-video-open-lock (طلب المالك «ابدا فيهم كلهم» بعد تدقيق: «مفتوحة على مفاتيحك بلا حدّ»):
// ستّ نقاط فيديو كانت تشغّل مفاتيح المالك أو تكشف رصيده بلا ربط بحساب. يثبّت على المعالجات الحقيقيّة (auth/points/_usage/
// _videoUsage/abuse-guard/video-job حقيقيّة؛ Redis في الذاكرة والشبكة مزيّفة):
//   ١) video-prompt: جلسة + سقف ٣٠ يوميًّا قبل نموذج الرؤية؛ والواجهة ترسل الرمز.
//   ٢) actor-create: الهويّة والحظر والتأكيد والرصيد قبل صوت Azure المدفوع، والطويل يُرفض قبل التوليد، وعطب الصوت يردّ الخصم.
//   ٣) video-upscale-create: رمز جلسة لا تذكرة، فحص الحظر، سقف ٣ يوميًّا، ومخرجات Runway التي سلّمها خادمنا وحدها.
//   ٤) veo-download: ملفّ مولَّد وحده (لا أيّ مسار GET في المضيف)، وبإذن: جلسة أو توقيع الخادم الذي يضعه veo-status.
//   ٥) video-download: جلسة + سقف ٢٠ وسيطًا يوميًّا (الرابط الواحد مرّة)، والواجهة تضع الرمز في رابط البروكسي.
//   ٦) video-balance: للمالك وحده، وسطر الرصيد في الواجهة للمالك وحده.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'video-open-lock-test-secret-' + 'x'.repeat(32);
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
delete process.env.OWNER_USERNAMES; delete process.env.OWNER_USERNAME;
Object.assign(process.env, {
  OPENAI_API_KEY: 'oa-test', GEMINI_API_KEY: 'gm-test', RUNWAY_API_KEY: 'rw-test', FAL_KEY: 'fal-test',
  AZURE_SPEECH_KEY_FREE: 'az-free', AZURE_SPEECH_REGION: 'uaenorth',
});
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; const v = store.get(k); try { return JSON.parse(v); } catch (e) { return v; } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

const auth = require(rp('api/_lib/auth.js'));
const points = require(rp('api/_lib/points.js'));
const videoPrompt = require(rp('api/video-prompt.js'));
const videoDownload = require(rp('api/video-download.js'));
const actorCreate = require(rp('api/_lib/actor-create.js'));
const upscale = require(rp('api/_lib/video-upscale-create.js'));
const videoStatus = require(rp('api/_lib/video-status.js'));
const veoStatus = require(rp('api/_lib/veo-status.js'));
const veoDownload = require(rp('api/_lib/veo-download.js'));
const balance = require(rp('api/_lib/video-balance.js'));

// تذكرة مهمّة البناء بشكلها الحرفيّ (construction-create.signJob): موقّعة بالسرّ نفسه وبلا exp
function ticketFor(u) {
  const payload = Buffer.from(JSON.stringify({ u, p: ['plan'], h: 'h', r: 1, n: crypto.randomBytes(12).toString('hex'), e: Date.now() + 900000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
async function user(name, extra) { await auth.putUser(name, Object.assign({ username: name, points: 1000, createdAt: Date.now() }, extra || {})); return auth.makeToken(name); }

function resObj() {
  return {
    code: 200, body: null, headers: {}, chunks: [], headersSent: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.code = c; return this; },
    json(v) { this.body = v; return this; }, write(b) { this.headersSent = true; this.chunks.push(Buffer.from(b)); return true; },
    once() {}, end() { return this; },
  };
}
const calls = [];
function net(route) {
  calls.length = 0;
  global.fetch = async (url, init) => { const u = String(url); calls.push({ url: u, init }); return route(u, init); };
}
const hits = (re) => calls.filter((c) => re.test(c.url)).length;
const ip = { 'x-forwarded-for': '203.0.113.9' };

// ─────────────────────────────── ١) video-prompt ───────────────────────────────
const oaOk = () => new Response(JSON.stringify({ choices: [{ message: { content: 'Cinematic desert at dusk, slow pan' } }] }), { status: 200 });
async function prompt(body) { const r = resObj(); await videoPrompt({ method: 'POST', headers: ip, body: Object.assign({ imageBase64: 'QUJD', mime: 'image/png' }, body) }, r); return r; }

test('١. وصف الفيديو: بلا جلسة أو بتذكرة = 401 بلا نداء نموذج؛ الجلسة تمرّ حتّى ٣٠ ثمّ 429؛ المحظور 403؛ المالك بلا سقف', async () => {
  net(oaOk);
  let r = await prompt({});
  assert.equal(r.code, 401); assert.equal(r.body.error, 'auth_required');
  await user('ticketman');
  r = await prompt({ token: ticketFor('ticketman') });
  assert.equal(r.code, 401, 'تذكرة البناء ليست جلسة');
  assert.equal(hits(/openai/), 0, 'لا نداء مدفوع قبل الهويّة');

  const tk = await user('pp');
  for (let i = 0; i < videoPrompt.VIDEO_PROMPT_DAILY; i++) {
    r = await prompt({ token: tk });
    assert.equal(r.code, 200, 'نداء ' + (i + 1)); assert.equal(r.body.prompt, 'Cinematic desert at dusk, slow pan');
  }
  assert.equal(hits(/openai/), 30);
  r = await prompt({ token: tk });
  assert.equal(r.code, 429); assert.equal(r.body.error, 'daily_limit_reached');
  assert.equal(hits(/openai/), 30, 'الحادي والثلاثون لا يصل النموذج');

  r = await prompt({ token: await user('banned-pp', { banned: true }) });
  assert.equal(r.code, 403);
  const own = await user('omran');
  for (let i = 0; i < 31; i++) r = await prompt({ token: own });
  assert.equal(r.code, 200, 'المالك معفى');
});

test('١ب. الواجهة ترسل الرمز إلى وصف الفيديو', () => {
  const s = read('js/app-09-attach.js');
  const i = s.indexOf("fetch('/api/video-prompt'");
  assert.ok(i > 0);
  assert.match(s.slice(i, i + 400), /token: authGet\('aiapp_auth_token'\)/);
});

// ─────────────────────────────── ٢) actor-create ───────────────────────────────
const balanceAtVoice = []; // الرصيد الحيّ لحظة نداء الصوت المدفوع — يثبت أنّ الخصم سبقه
function actorNet(azureStatus) {
  balanceAtVoice.length = 0;
  net((u) => {
    if (/tts\.speech\.microsoft\.com/.test(u)) {
      balanceAtVoice.push(store.has('points:payer2') ? Number(store.get('points:payer2')) : null);
      return new Response(new Uint8Array(6000 * 4), { status: azureStatus || 200 });
    }
    if (/queue\.fal\.run/.test(u)) return new Response(JSON.stringify({ request_id: 'req-1' }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
}
async function actor(body) { const r = resObj(); await actorCreate({ method: 'POST', body: Object.assign({ speech: 'هلا والله حياكم', imageBase64: 'SEVSTw==' }, body) }, r); return r; }

test('٢. الممثّل: بلا رمز/بلا تأكيد/رصيد ناقص/محظور = رفض **قبل** صوت Azure المدفوع', async () => {
  actorNet();
  let r = await actor({});
  assert.equal(r.code, 401);
  const payer = await user('payer', { points: 1000 });
  r = await actor({ token: payer });
  assert.equal(r.code, 428, 'التأكيد قبل أيّ شيء مدفوع');
  r = await actor({ token: await user('poor', { points: 10 }), confirmed: true });
  assert.equal(r.code, 402);
  r = await actor({ token: await user('bad', { points: 1000, banned: true }), confirmed: true });
  assert.equal(r.code, 403); assert.equal(r.body.error, 'banned');
  assert.equal(hits(/microsoft/), 0, 'كان الصوت المدفوع يُولَّد لكلّ هذه قبل الفحص');
  assert.equal(hits(/fal\.run/), 0);
});

test('٢ب. الكلام الأطول من الحدّ يُرفض قبل التوليد: فوق ٣٠٠ حرف (كان يُقصّ بصمت)، وما لا يتّسع له سقف الثواني', async () => {
  actorNet();
  const own = auth.makeToken('omran');
  let r = await actor({ token: own, speech: 'ك'.repeat(actorCreate.SPEECH_MAX + 1) });
  assert.equal(r.code, 400); assert.match(r.body.error, /طويل/);
  process.env.ACTOR_MAX_SEC = '5';
  try {
    r = await actor({ token: own, speech: 'هلا والله '.repeat(12) }); // ٩٦ حرفًا ≥ ٦ ثوانٍ حتّى بأسرع نطق
    assert.equal(r.code, 400); assert.match(r.body.error, /5 ثانية/);
  } finally { delete process.env.ACTOR_MAX_SEC; }
  assert.equal(hits(/microsoft/), 0, 'لا صوت مدفوع لكلام مرفوض');
  assert.equal(actorCreate.minSecondsOf('هَلا وَالله!  '), actorCreate.minSecondsOf('هلا والله'), 'التشكيل والمسافات والعلامات لا تُحسب');
});

test('٢ج. الدافع: يُخصم ثمّ يُولَّد الصوت؛ تعذّر الصوت = ردّ النقاط وفكّ القفل وfallback؛ والنجاح يسلّم التذكرة', async () => {
  const payer = await user('payer2', { points: 1000 });
  actorNet(500);
  let r = await actor({ token: payer, confirmed: true });
  assert.equal(r.code, 503); assert.equal(r.body.fallback, true);
  assert.equal(hits(/microsoft/), 1);
  assert.deepEqual(balanceAtVoice, [1000 - points.COSTS.veo_video], 'الخصم قبل الصوت المدفوع لا بعده');
  assert.equal((await points.readPoints('payer2')).points, 1000, 'الخصم مردود كاملًا');
  assert.equal([...store.keys()].some((k) => /^abuse:video:/.test(k) && /payer2/.test(k)), false, 'القفل مفكوك');
  actorNet();
  r = await actor({ token: payer, confirmed: true });
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.id, 'req-1');
  assert.equal((await points.readPoints('payer2')).points, 1000 - points.COSTS.veo_video);
  assert.ok(store.has('abuse:video:payer2'), 'القفل يُؤخذ فعلًا (فحص الفكّ أعلاه ليس فارغًا)');
  assert.equal(hits(/fal\.run/), 1);
});

// ─────────────────────────── ٣) video-upscale-create ───────────────────────────
const RUNWAY_OUT = 'https://dnznrvs05pmza.cloudfront.net/out/abc.mp4?_jwt=1';
function runwayNet() {
  net((u) => {
    if (/\/v1\/tasks\//.test(u)) return new Response(JSON.stringify({ id: 'T1', status: 'SUCCEEDED', output: [RUNWAY_OUT] }), { status: 200 });
    if (/\/v1\/video_upscale$/.test(u)) return new Response(JSON.stringify({ id: 'UP1' }), { status: 200 });
    return new Response('{}', { status: 404 });
  });
}
async function up(body) { const r = resObj(); await upscale({ method: 'POST', headers: ip, body: Object.assign({ videoUrl: RUNWAY_OUT, resolution: '4k' }, body) }, r); return r; }

test('٣. ترقية الجودة: التذكرة ليست جلسة، ورابط من خارج مخرجاتنا مرفوض، وسقف ٣ يوميًّا، والمحظور مرفوض — كلّها بلا نداء Runway', async () => {
  runwayNet();
  const tk = await user('upper');
  let r = await up({ token: ticketFor('upper') });
  assert.equal(r.code, 401, 'تذكرة البناء كانت تمرّ رمزًا لا ينتهي');
  r = await up({ token: tk, videoUrl: 'https://example.com/my-own-film.mp4' });
  assert.equal(r.code, 400); assert.equal(r.body.error, 'unknown_video');
  r = await up({ token: tk });
  assert.equal(r.code, 400, 'قبل أن يسلّمه خادمنا ليس من مخرجاتنا');
  assert.equal(hits(/video_upscale/), 0);

  // خادمنا يسلّم الناتج (استطلاع المهمّة) فيُسجَّل
  const sr = resObj();
  await videoStatus({ method: 'GET', query: { id: '0:T1' } }, sr);
  assert.equal(sr.body.status, 'SUCCEEDED');
  for (let i = 0; i < upscale.UPSCALE_DAILY; i++) { r = await up({ token: tk }); assert.equal(r.code, 200, 'ترقية ' + (i + 1)); }
  r = await up({ token: tk });
  assert.equal(r.code, 429); assert.equal(r.body.error, 'daily_limit_reached');
  assert.equal(hits(/video_upscale/), 3);
  r = await up({ token: await user('bad-up', { banned: true }) });
  assert.equal(r.code, 403);
  r = await up({ token: auth.makeToken('omran') });
  assert.equal(r.code, 200, 'المالك معفى من السقف');
});

// ─────────────────────────────── ٤) veo-download ───────────────────────────────
const FILE = 'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media';
async function veoGet(query) {
  const r = resObj();
  veoDownload.__deps.lookup = async () => [{ address: '142.250.1.1', family: 4 }];
  veoDownload.__deps.fetchFn = async (u, init) => { calls.push({ url: String(u), init }); return new Response(new Uint8Array([7, 7, 7]), { status: 200, headers: { 'content-type': 'video/mp4' } }); };
  try { await veoDownload({ method: 'GET', query, headers: {} }, r); } finally { veoDownload.__deps.lookup = undefined; veoDownload.__deps.fetchFn = undefined; }
  return r;
}

test('٤. تنزيل Veo: أيّ مسار غير ملفّ مولَّد = 400 بلا نداء بمفتاحنا؛ الملفّ بلا إذن = 401', async () => {
  calls.length = 0;
  const tk = await user('veo-user');
  for (const uri of [
    'https://generativelanguage.googleapis.com/v1beta/files',
    'https://generativelanguage.googleapis.com/v1beta/models',
    'https://generativelanguage.googleapis.com/v1beta/models/veo-3/operations/x',
    'https://generativelanguage.googleapis.com/v1beta/files/abc123?pageSize=100',
    'https://generativelanguage.googleapis.com/v1beta/files/abc123/../../models',
    'https://evil.example/v1beta/files/abc123:download?alt=media',
    'http://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media',
  ]) {
    const r = await veoGet({ uri, token: tk });
    assert.equal(r.code, 400, uri);
  }
  const r = await veoGet({ uri: FILE });
  assert.equal(r.code, 401, 'بلا جلسة ولا توقيع');
  assert.equal((await veoGet({ uri: FILE, sig: 'A'.repeat(32) })).code, 401, 'توقيع مزوّر');
  assert.equal(calls.length, 0, 'لا نداء بمفتاح المالك');
});

test('٤ب. veo-status يسلّم رابطًا موقّعًا يعمل بلا جلسة (للـ<video> وسجلّ المحادثة)، والجلسة تكفي أيضًا؛ والطلب رابط تنزيل قانونيّ', async () => {
  net(() => new Response(JSON.stringify({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: FILE } }] } } }), { status: 200 }));
  const sr = resObj();
  await veoStatus({ query: { op: 'models/veo-3.0-generate-001/operations/op1' } }, sr);
  assert.equal(sr.body.status, 'SUCCEEDED');
  const link = new URL(sr.body.output[0], 'https://app.example');
  assert.equal(link.searchParams.get('action'), 'veo-download');
  assert.ok(link.searchParams.get('sig'), 'الرابط موقّع');
  calls.length = 0;
  let r = await veoGet({ uri: link.searchParams.get('uri'), sig: link.searchParams.get('sig') });
  assert.equal(r.code, 200);
  assert.deepEqual(Buffer.concat(r.chunks), Buffer.from([7, 7, 7]));
  assert.equal(calls[0].url, FILE);
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'gm-test');
  assert.equal((await veoGet({ uri: link.searchParams.get('uri').replace('abc123', 'other9'), sig: link.searchParams.get('sig') })).code, 401, 'التوقيع لملفّه وحده');
  calls.length = 0;
  r = await veoGet({ uri: 'https://generativelanguage.googleapis.com/v1beta/files/v1', token: await user('veo-user2') });
  assert.equal(r.code, 200, 'الجلسة إذن كافٍ');
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/files/v1:download?alt=media', 'يُطلب المحتوى لا البيانات الوصفيّة');
});

// ─────────────────────────────── ٥) video-download ─────────────────────────────
async function dl(url, token) {
  const r = resObj();
  videoDownload.__deps.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  videoDownload.__deps.fetchFn = async (u) => { calls.push({ url: String(u) }); return new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'video/mp4' } }); };
  try { await videoDownload({ method: 'GET', headers: ip, query: token ? { url, token } : { url } }, r); } finally { videoDownload.__deps.lookup = undefined; videoDownload.__deps.fetchFn = undefined; }
  return r;
}

test('٥. بروكسي التنزيل: بلا جلسة أو بتذكرة = 401 بلا جلب؛ الرابط الواحد يُعدّ مرّة؛ ٢٠ وسيطًا ثمّ 429؛ المحظور 403', async () => {
  calls.length = 0;
  assert.equal((await dl('https://cdn.example/a.mp4')).code, 401);
  await user('dlt');
  assert.equal((await dl('https://cdn.example/a.mp4', ticketFor('dlt'))).code, 401);
  assert.equal(calls.length, 0);
  const tk = await user('dler');
  for (let k = 0; k < 3; k++) assert.equal((await dl('https://cdn.example/same.mp4', tk)).code, 200, 'جلب ثمّ «تحميل» ثمّ إعادة المنزّل = وسيط واحد');
  for (let i = 1; i < videoDownload.DOWNLOAD_DAILY; i++) assert.equal((await dl('https://cdn.example/v' + i + '.mp4', tk)).code, 200, 'وسيط ' + (i + 1));
  const before = calls.length;
  const r = await dl('https://cdn.example/over.mp4', tk);
  assert.equal(r.code, 429); assert.equal(r.body.error, 'daily_limit_reached');
  assert.equal(calls.length, before, 'الحادي والعشرون لا يُجلب');
  assert.equal((await dl('https://cdn.example/same.mp4', tk)).code, 200, 'ما عُدّ اليوم يبقى متاحًا');
  assert.equal((await dl('https://cdn.example/a.mp4', await user('bad-dl', { banned: true }))).code, 403);
});

test('٥ب. الواجهة ترسل الجلسة إلى البروكسي (صانع الفيديو والحافظ الموحّد)، ولا تحفظ ردّ خطأ ملفًّا', () => {
  // v-dl-ticket (المراجعة المعاكسة): الرمز صار في ترويسة Authorization لا في الرابط — tests/review-r2.test.cjs (ج)
  const v = read('js/app-11-video.js');
  const i = v.indexOf('function proxyVideoUrl(url){');
  assert.match(v.slice(i, i + 900), /fetch\(proxyVideoUrl\(url\), tk \? \{ headers: \{ Authorization: 'Bearer ' \+ tk \} \} : undefined\)/);
  const s = read('js/app-05-save-media.js');
  const j = s.indexOf('async function proxiedBlob(url){');
  assert.match(s.slice(j, j + 400), /headers: \{ Authorization: 'Bearer ' \+ tk \}/);
  assert.ok(!/await \(await fetch\(proxied\(url\)\)\)\.blob\(\)/.test(s), 'ردّ 401/429 كان يُحفظ ملفًّا باسم صورة');
  assert.match(s, /if\(!r\.ok\) throw new Error\('proxy ' \+ r\.status\);/);
});

// ─────────────────────────────── ٦) video-balance ──────────────────────────────
test('٦. رصيد المزوّد: الزائر والمستخدم العاديّ 403 بلا نداء؛ المالك يراه؛ والسطر في الواجهة للمالك وحده', async () => {
  net(() => new Response(JSON.stringify({ creditBalance: 1234 }), { status: 200 }));
  let r = resObj(); await balance({ method: 'GET', query: {}, headers: {} }, r);
  assert.equal(r.code, 403);
  r = resObj(); await balance({ method: 'GET', query: { token: await user('normal') }, headers: {} }, r);
  assert.equal(r.code, 403); assert.equal(r.body.keys, undefined, 'لا عدد مفاتيح');
  assert.equal(hits(/organization/), 0);
  r = resObj(); await balance({ method: 'GET', query: { token: auth.makeToken('omran') }, headers: {} }, r);
  assert.equal(r.code, 200); assert.equal(r.body.credits, 1234);
  const v = read('js/app-11-video.js');
  const i = v.indexOf('async function ensureRunwayCredits(needed){');
  const body = v.slice(i, i + 2400);
  // v-balance-enough (المراجعة المعاكسة): غير المالك يسأل «هل يكفي؟» بجلسته فيأخذ {enough} وحده — tests/review-r2.test.cjs (د)
  assert.match(body, /owner\s+\? await fetch\('\/api\/video\?action=video-balance&token=' \+ \(typeof ownerToken === 'function' \? ownerToken\(\) : ''\)\)/, 'الرقم للمالك وحده');
  assert.ok(body.indexOf('if(!owner){') < body.indexOf('رصيد Runway'), 'سطر المزوّد بعد خروج غير المالك');
});
