// tests/review-r2.test.cjs — المراجعة المعاكسة الثابتة على دمج v-atomic-quota · v-video-open-lock · v-share-guard · v-open-tools-cap.
// كلّها أُثبتت أو قُرئت من الكود، وكلّ حالة هنا تفشل على الكود السابق:
//   (أ) v-dl-ours: بروكسي التنزيل يعدّ نواتجنا المدفوعة على سقف الـ٢٠، والفرع الاقتصاديّ يرمي «download failed 429» فيختفي الفيديو.
//   (ب) الحافظ الموحّد عند 401/429 يفتح proxied(url) (JSON خامّ) — والضيف لا يحفظ صورة خارجيّة.
//   (ج) v-dl-ticket: رمز الجلسة (٣٠ يومًا) في روابط البروكسي يتسرّب — الجلب بترويسة Authorization، والرابط بتذكرة قصيرة.
//   (د) v-balance-enough: الفحص المسبق لغير المالك «يكفي دائمًا».
//   (هـ) v-refund-custom: الحصّة تُستهلك قبل النداء ولا تُردّ عند الفشل.
//   (و) v-sig-bytes: توقيع Veo بحرف متعدّد البايتات يرمي (502 بدل 401).
//   (ز) v-share-owner: البريد (مفتاح حساب Google) يُعرض علنًا اسمًا للناشر.
//   (ح) v-media-save: الحفظ والتنزيل يُعدّان من سقف المشاركة.
//   (ط) v-share-validate: المشروع الفارغ أو الكبير يحرق حصّة.
// المعالجات والوحدات الحقيقيّة؛ Redis والشبكة وحدهما محاكيان، والواجهة تُشغَّل في vm بـDOM مزيّف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.AUTH_SECRET = 'review-r2-test-secret-' + 'y'.repeat(24);
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
delete process.env.OWNER_USERNAMES; delete process.env.OWNER_USERNAME;
Object.assign(process.env, { RUNWAY_API_KEY: 'rw-test', MINIMAX_API_KEY: 'mm-test', FAL_KEY: 'fal-test', GEMINI_API_KEY: 'gm-test', TAVILY_API_KEY: 'tv-test' });
delete process.env.OPENAI_API_KEY; delete process.env.GOOGLE_SEARCH_API_KEY; delete process.env.GOOGLE_SEARCH_CX;
delete process.env.PEXELS_API_KEY; delete process.env.UNSPLASH_ACCESS_KEY;

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const ttl = new Map();
let storeDown = false; // kvSetIfAbsent يرمي (القاعدة ممتلئة)
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return store.get(k); } },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v, t) => { store.set(k, String(v)); if (t) ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { if (storeDown) throw new Error('OOM command not allowed'); if (store.has(k)) return false; store.set(k, String(v)); if (t) ttl.set(k, t); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix)),
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });
/* v-quality-gate: الترقية للمشتركين والمالك فقط — مستخدمو هذه الاختبارات يُعامَلون مشتركين (الحارس نفسه في quality-gate.test.cjs) */
let QUALITY_OK = true;
mock('api/_lib/_qualityGate.js', { allowHigh: async () => QUALITY_OK, gateQuality: async (u, q) => q });

const auth = require(rp('api/_lib/auth.js'));
const usage = require(rp('api/_lib/_usage.js'));
const session = require(rp('api/_lib/_session.js'));
const videoDownload = require(rp('api/video-download.js'));
const videoStatus = require(rp('api/_lib/video-status.js'));
const minimaxStatus = require(rp('api/_lib/minimax-status.js'));
const actorStatus = require(rp('api/_lib/actor-status.js'));
const veoDownload = require(rp('api/_lib/veo-download.js'));
const balance = require(rp('api/_lib/video-balance.js'));
const upscale = require(rp('api/_lib/video-upscale-create.js'));
const share = require(rp('api/_lib/share.js'));
const img = require(rp('api/_lib/img-share.js'));
const pdf = require(rp('api/_lib/pdf-share.js'));
const file = require(rp('api/_lib/file-share.js'));
const ideas = require(rp('api/_lib/design-ideas.js'));
const designSuggest = require(rp('api/_lib/design-suggest.js'));
const fashionSuggest = require(rp('api/_lib/fashion-suggest.js'));
const studioSuggest = require(rp('api/_lib/studio-suggest.js'));

const today = () => new Date().toISOString().slice(0, 10);
const tally = (u, b) => usage.todayCount(u, b);
async function user(name, extra) { await auth.putUser(name, Object.assign({ username: name, points: 1000, createdAt: Date.now() }, extra || {})); return auth.makeToken(name); }

function resObj() {
  return {
    code: 200, body: null, headers: {}, chunks: [], headersSent: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, status(c) { this.code = c; return this; },
    json(v) { this.body = v; return this; }, send(v) { this.body = v; return this; },
    write(b) { this.headersSent = true; this.chunks.push(Buffer.from(b)); return true; }, once() {}, end() { return this; },
  };
}
async function run(handler, req) { const r = resObj(); await handler(Object.assign({ headers: {}, query: {} }, req), r); return r; }

// ── الشبكة: مزوّدو الفيديو، ومضيف الوسائط الذي يجلبه البروكسي ──
const upstream = { mode: 'ok', calls: [] }; // ما يردّه مضيف الوسائط: ok · 404 · html
const RUNWAY_OUT = 'https://dnznrvs05pmza.cloudfront.net/out/paid.mp4?_jwt=1';
const MINIMAX_OUT = 'https://cdn.minimax.example/out/eco.mp4?Expires=1';
const ACTOR_OUT = 'https://v3.fal.media/files/out/actor.mp4';
let runwayUpscale = 200;
let geminiOk = true;
let orgStatus = 200; // v-balance-unknown: ردّ /v1/organization (429/5xx = لم يُجب أحد)
let tavilyStatus = 200; // v-ideas-paid: 432 = نفاد حصّة Tavily
let tavilyEvery = 0, tavilyCalls = 0; // v-ideas-paid-count: كلّ N-ـيّ نداء Tavily يردّ 429 (فشل جزئيّ يحدثه المهاجم بتجاوز المعدّل)
let googleStatus = 200; // 403 = نفاد حصّة Google
global.fetch = async (url, init) => {
  const u = String(url);
  if (/\/v1\/tasks\//.test(u)) return new Response(JSON.stringify({ id: 'T9', status: 'SUCCEEDED', output: [RUNWAY_OUT] }), { status: 200 });
  if (/\/v1\/video_upscale$/.test(u)) return new Response(JSON.stringify(runwayUpscale === 200 ? { id: 'UP9' } : { error: 'rejected' }), { status: runwayUpscale });
  if (/\/v1\/organization$/.test(u)) { balanceCalls++; return orgStatus === 200 ? new Response(JSON.stringify({ creditBalance: 120 }), { status: 200 }) : new Response('{"error":"busy"}', { status: orgStatus }); }
  if (/\/v1\/query\/video_generation/.test(u)) return new Response(JSON.stringify({ status: 'Success', file_id: 'F1', base_resp: { status_code: 0 } }), { status: 200 });
  if (/\/v1\/files\/retrieve/.test(u)) return new Response(JSON.stringify({ file: { download_url: MINIMAX_OUT } }), { status: 200 });
  if (/queue\.fal\.run\/.*\/status$/.test(u)) return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
  if (/queue\.fal\.run\//.test(u)) return new Response(JSON.stringify({ video: { url: ACTOR_OUT } }), { status: 200 });
  if (/api\.tavily\.com/.test(u) && tavilyEvery && (++tavilyCalls % tavilyEvery === 0)) return new Response('{"detail":"rate"}', { status: 429 });
  if (/api\.tavily\.com/.test(u)) return tavilyStatus === 200 ? new Response(JSON.stringify({ images: [] }), { status: 200 }) : new Response('{"detail":"quota"}', { status: tavilyStatus });
  if (/www\.googleapis\.com\/customsearch/.test(u)) return googleStatus === 200 ? new Response(JSON.stringify({ items: [] }), { status: 200 }) : new Response('{"error":{}}', { status: googleStatus });
  if (/api\.openverse\.org/.test(u)) return new Response(JSON.stringify({ results: [] }), { status: 200 });
  if (/generativelanguage\.googleapis\.com/.test(u)) {
    if (!geminiOk) return new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"title":"t","description":"d","clothing":"c","colors":"x","accessories":"y","matchPercent":90}]' }] } }] }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};
let balanceCalls = 0;

const ip = { 'x-forwarded-for': '203.0.113.50' };
async function dl(query, headers) {
  const r = resObj();
  videoDownload.__deps.lookup = async (host) => [{ address: host === 'intranet.example' ? '10.0.0.7' : '93.184.216.34', family: 4 }];
  videoDownload.__deps.fetchFn = async (u) => {
    upstream.calls.push(String(u));
    if (upstream.mode === '404') return new Response('nope', { status: 404 });
    if (upstream.mode === 'html') return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    if (upstream.mode === 'redirect-private') return new Response(null, { status: 302, headers: { location: 'http://10.0.0.7/admin' } });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  };
  try { await videoDownload({ method: 'GET', headers: Object.assign({}, ip, headers || {}), query }, r); } finally { videoDownload.__deps.lookup = undefined; videoDownload.__deps.fetchFn = undefined; }
  return r;
}
const bearer = (tk) => ({ authorization: 'Bearer ' + tk });

// ─────────────────────────────── (أ) نواتجنا لا تُعدّ ───────────────────────────────
test('أ. نواتج خادمنا (Runway · الاقتصاديّ · الممثّل) تُحفظ بلا عدّ بعد امتلاء سقف الوسائط الخارجيّة', async () => {
  const tk = await user('payer-a');
  for (let i = 0; i < videoDownload.DOWNLOAD_DAILY; i++) assert.equal((await dl({ url: 'https://img.example/p' + i + '.jpg' }, bearer(tk))).code, 200, 'خارجيّ ' + (i + 1));
  assert.equal((await dl({ url: 'https://img.example/over.jpg' }, bearer(tk))).code, 429, 'السقف الخارجيّ كما كان');
  for (const u of [RUNWAY_OUT, MINIMAX_OUT, ACTOR_OUT]) assert.equal((await dl({ url: u }, bearer(tk))).code, 429, 'قبل أن يسلّمه خادمنا: وسيط عاديّ');
  assert.equal((await run(videoStatus, { method: 'GET', query: { id: '0:T9' } })).body.status, 'SUCCEEDED');
  assert.equal((await run(minimaxStatus, { method: 'GET', query: { task_id: 'mm-task-1' } })).body.status, 'SUCCEEDED');
  assert.equal((await run(actorStatus, { method: 'GET', query: { id: 'actor-req-0001' } })).body.status, 'SUCCEEDED');
  for (const u of [RUNWAY_OUT, MINIMAX_OUT, ACTOR_OUT]) {
    const r = await dl({ url: u }, bearer(tk));
    assert.equal(r.code, 200, 'ناتج مدفوع يُحفظ: ' + u);
    assert.deepEqual(Buffer.concat(r.chunks), Buffer.from([1, 2, 3]));
  }
  assert.equal(await tally('payer-a', 'video-download'), videoDownload.DOWNLOAD_DAILY, 'لم يُعدّ منها شيء');
  assert.equal((await dl({ url: RUNWAY_OUT }, bearer(await user('banned-a', { banned: true })))).code, 403, 'المحظور مرفوض ولو كان ناتجنا');
  assert.equal((await dl({ url: RUNWAY_OUT })).code, 401, 'الجلسة شرط كما كانت');
});

test('أ-ب. الواجهة: فشل البروكسي في الفرع الاقتصاديّ والممثّل يعرض الرابط الخامّ ولا يرمي', () => {
  const v = read('js/app-11-video.js');
  const mm = v.slice(v.indexOf("if(creationMode === 'minimax'){"), v.indexOf("if(creationMode === 'veo' || creationMode === 'actor'){"));
  assert.ok(mm.length > 500);
  assert.doesNotMatch(mm, /throw new Error\('download failed/, 'كان يرمي فلا يظهر الفيديو المدفوع');
  assert.match(mm, /try\{ vurl = URL\.createObjectURL\(await proxyBlob\(videoUrl\)\); \}catch\(e\)\{ vurl = videoUrl; \}/);
  const ac = v.slice(v.indexOf("if(creationMode === 'veo' || creationMode === 'actor'){"), v.indexOf('if(!acData.fallback)'));
  assert.doesNotMatch(ac, /throw new Error\('download failed/);
  assert.match(ac, /catch\(e\)\{ avurl = actorUrl; \}/);
});

// ─────────────────────────────── (ج) لا جلسة في الروابط ───────────────────────────────
test('ج. البروكسي يقبل ترويسة Bearer، وتذكرة التنزيل: لرابط واحد وساعة واحدة، لا تُقرأ ولا تصلح جلسة', async () => {
  const tk = await user('g_ticket@gmail.com', { email: 'ticket@gmail.com', googleAuth: true });
  const URL1 = 'https://cdn.example/clip-1.mp4';
  assert.equal((await dl({ url: URL1, action: 'ticket' })).code, 401, 'الإصدار بجلسة فقط');
  const m = await dl({ url: URL1, action: 'ticket' }, bearer(tk));
  assert.equal(m.code, 200);
  assert.equal(m.body.ttl, 3600);
  const t = m.body.ticket;
  assert.match(t, /^[A-Za-z0-9_-]{60,400}$/);
  assert.ok(!/ticket|gmail|g_/.test(Buffer.from(t, 'base64url').toString('latin1')), 'الحساب (بريد Google) لا يُقرأ من الرابط');
  assert.equal(session.sessionUser(t), null, 'ليست رمز جلسة');
  assert.equal(await tally('g_ticket@gmail.com', 'video-download'), 1, 'العدّ عند الإصدار، مرّة');
  upstream.calls.length = 0;
  for (let i = 0; i < 3; i++) assert.equal((await dl({ url: URL1, dt: t })).code, 200, 'الرابط بلا جلسة يعمل (منزّل النظام يعيد)');
  assert.equal(upstream.calls.length, 3);
  assert.equal(await tally('g_ticket@gmail.com', 'video-download'), 1, 'التنزيل بالتذكرة لا يُعدّ ثانية');
  assert.equal((await dl({ url: 'https://cdn.example/other.mp4', dt: t })).code, 401, 'التذكرة لرابطها وحده');
  assert.equal((await dl({ url: URL1, dt: t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA') })).code, 401, 'تذكرة معدّلة');
  assert.equal((await dl({ url: URL1, dt: t, action: 'ticket' })).code, 401, 'تذكرة لا تصدر تذكرة');
  const realNow = Date.now;
  Date.now = () => realNow() + 61 * 60 * 1000;
  try { assert.equal((await dl({ url: URL1, dt: t })).code, 401, 'بعد ساعة تنتهي'); } finally { Date.now = realNow; }
  assert.equal((await dl({ url: 'https://cdn.example/h.mp4' }, bearer(tk))).code, 200, 'الجلب بالترويسة كافٍ');
});

test('ج-ب. الواجهة: لا &token= في أيّ رابط بروكسي، والجلب في صانع الفيديو بترويسة Authorization', () => {
  const v = read('js/app-11-video.js');
  const s = read('js/app-05-save-media.js');
  for (const [f, src] of [['app-11-video', v], ['app-05-save-media', s]]) assert.doesNotMatch(src, /'&token=' \+ encodeURIComponent/, f);
  const i = v.indexOf('function proxyVideoUrl(url){');
  assert.match(v.slice(i, i + 900), /function proxyFetch\(url\)\{[\s\S]*?headers: \{ Authorization: 'Bearer ' \+ tk \}/);
  assert.doesNotMatch(v, /fetchFile\(proxyVideoUrl\(/, 'دمج المشاهد يجلب بالترويسة لا برابط');
  assert.match(v, /const vres = await proxyFetch\(finalSrc\);/, 'فرع Runway');
});

// ─────────────────────── (ب)+(ج) الحافظ الموحّد يعمل فعلًا (vm بـDOM مزيّف) ───────────────────────
function saver(opts) {
  const o = opts || {};
  const calls = { fetch: [], open: [], sheet: [], clicks: [], toast: [] };
  const doc = {
    addEventListener() {}, body: { appendChild() {} },
    createElement: () => ({ dataset: {}, click() { calls.clicks.push(this.href); }, remove() {}, setAttribute() {} }),
  };
  const ctx = {
    location: { href: 'https://app.example/', origin: 'https://app.example' },
    navigator: { userAgent: o.mobile ? 'Mozilla/5.0 (Linux; Android 14) Mobile' : 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0, platform: 'Win32' },
    document: doc, URL: Object.assign(function (u, b) { return new URL(u, b); }, { createObjectURL: () => 'blob:local', revokeObjectURL() {} }),
    Blob, File, atob, setTimeout: () => 0, encodeURIComponent, Number, String, Date, Error, JSON, Uint8Array, console,
    authGet: (k) => (k === 'aiapp_auth_token' ? (o.token || '') : ''),
    fetch: async (u, init) => {
      calls.fetch.push({ url: String(u), auth: (init && init.headers && init.headers.Authorization) || '' });
      return o.route(String(u), init);
    },
    open: (u) => { calls.open.push(String(u)); return {}; },
    omranPdfReadySheet: (link) => { calls.sheet.push(String(link)); return true; },
    settingsToast: (m) => calls.toast.push(m), t: (k) => (k === 'portraitLimitReached' ? 'LIMIT-TEXT' : k),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-05-save-media.js'), ctx);
  return { save: ctx.omranSaveMedia, calls };
}
const okBlob = () => ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }), json: async () => ({}) });
const fail = (status) => () => ({ ok: false, status, blob: async () => new Blob(['{"error":"x"}']), json: async () => ({ error: 'x' }) });

test('ب. فشل البروكسي (401 للضيف · 429 للسقف) يفتح الرابط الأصليّ لا ردّ JSON، والجلب بالترويسة لا بالرابط', async () => {
  const RAW = 'https://img.example/photo.png?x=1';
  for (const [token, status] of [['', 401], ['tok-abc', 429]]) {
    const { save, calls } = saver({ token, route: fail(status) });
    assert.equal(await save(RAW, 'p.png'), true);
    assert.deepEqual(calls.open, [RAW], 'كان يفتح /api/video-download… فيظهر JSON خامّ');
    assert.ok(calls.fetch.every((f) => !/token=/.test(f.url)), 'لا رمز في الرابط');
    if (token) assert.ok(calls.fetch.some((f) => f.auth === 'Bearer tok-abc'), 'الرمز في الترويسة');
  }
  const ok = saver({ token: 'tok-abc', route: okBlob });
  assert.equal(await ok.save(RAW, 'p.png'), true);
  assert.deepEqual(ok.calls.open, [], 'النجاح ينزّل ملفًّا كما كان');
  assert.deepEqual(ok.calls.clicks, ['blob:local']);
});

test('ب-ج. ورقة الجوّال: رابط زرّ «تحميل» يُفكّ إلى الوسيط، والورقة بتذكرة تنزيل لا بجلسة — وتعذّرها = الرابط الأصليّ', async () => {
  const RAW = 'https://dnznrvs05pmza.cloudfront.net/out/v.mp4?_jwt=abc';
  const href = '/api/video-download?url=' + encodeURIComponent(RAW); // ما يضعه صانع الفيديو في زرّ التحميل
  const good = saver({ mobile: true, token: 'tok-abc', route: (u) => (/action=ticket/.test(u) ? { ok: true, status: 200, json: async () => ({ ticket: 'TKT_1', ttl: 3600 }) } : okBlob()) });
  assert.equal(await good.save(href, 'omran-ai-video.mp4'), true);
  assert.equal(good.calls.sheet.length, 1);
  const link = new URL(good.calls.sheet[0], 'https://app.example');
  assert.equal(link.pathname, '/api/video-download');
  assert.equal(link.searchParams.get('url'), RAW);
  assert.equal(link.searchParams.get('dt'), 'TKT_1');
  assert.equal(link.searchParams.get('token'), null, 'لا جلسة في رابط يُفتح خارج التطبيق');
  assert.deepEqual(good.calls.fetch.map((f) => [/action=ticket/.test(f.url), f.auth]), [[true, 'Bearer tok-abc']]);
  const limited = saver({ mobile: true, token: 'tok-abc', route: fail(429) });
  await limited.save(href, 'omran-ai-video.mp4');
  assert.deepEqual(limited.calls.sheet, [RAW], 'السقف: الرابط الأصليّ لا رابط JSON');
  const guest = saver({ mobile: true, token: '', route: fail(401) });
  await guest.save(href, 'omran-ai-video.mp4');
  assert.deepEqual(guest.calls.sheet, [RAW]);
  assert.equal(guest.calls.fetch.length, 0, 'بلا جلسة لا طلب تذكرة');
});

// ─────────────────────────────── (د) هل يكفي الرصيد؟ ───────────────────────────────
test('د. الرصيد: جلسة غير المالك تسأل «هل يكفي؟» فتأخذ {enough} وحده؛ الزائر 403 بلا نداء؛ والمالك يرى الرقم', async () => {
  balanceCalls = 0;
  let r = await run(balance, { method: 'GET', query: { needed: '50' } });
  assert.equal(r.code, 403);
  assert.equal(balanceCalls, 0);
  const tk = await user('normal-d');
  r = await run(balance, { method: 'GET', query: { needed: '100' }, headers: bearer(tk) });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body, { enough: true }, 'لا رصيد ولا عدد مفاتيح');
  r = await run(balance, { method: 'GET', query: { needed: '150' }, headers: bearer(tk) });
  assert.deepEqual(r.body, { enough: false });
  assert.equal(balanceCalls, 1, 'غير المالك من ذاكرة ٦٠ ثانية — لا نداء للمزوّد مع كلّ طلب');
  r = await run(balance, { method: 'GET', query: {}, headers: bearer(tk) });
  assert.equal(r.code, 403, 'بلا needed كما كان');
  r = await run(balance, { method: 'GET', query: { token: auth.makeToken('omran') } });
  assert.deepEqual([r.code, r.body.credits], [200, 120]);
});

test('د-ج. v-balance-unknown: لم يُجب أيّ مفتاح (429/5xx) ← لا يُخزَّن صفرًا، وغير المالك يمرّ (أفضل جهد) والمالك credits:-1؛ والمجهول يُخزَّن ٣٠ث (المراجعة الثالثة)', async () => {
  const realNow = Date.now;
  let shift = 61 * 1000; // ذاكرة الستّين ثانية من (د) انتهت
  Date.now = () => realNow() + shift;
  try {
    const tk = await user('normal-dc');
    for (const st of [429, 503]) {
      orgStatus = st;
      balanceCalls = 0;
      try {
        let r = await run(balance, { method: 'GET', query: { needed: '50' }, headers: bearer(tk) });
        assert.deepEqual([r.code, r.body], [200, { enough: true }], st + ': كان {enough:false} فتفشل كلّ الأفلام');
        for (let i = 0; i < 5; i++) {
          r = await run(balance, { method: 'GET', query: { needed: '50' }, headers: bearer(tk) });
          assert.deepEqual(r.body, { enough: true });
        }
        assert.equal(balanceCalls, 1, st + ': المجهول يُخزَّن ٣٠ث — كان كلّ طلب ينادي مفاتيح المالك كلّها فيبقيها مقيَّدة بالمعدّل');
        r = await run(balance, { method: 'GET', query: { token: auth.makeToken('omran') } });
        assert.equal(r.body.credits, -1, st + ': المالك يرى «تعذّرت القراءة» لا صفرًا');
      } finally { orgStatus = 200; }
      shift += 31 * 1000; // انتهت ذاكرة المجهول
    }
    const r = await run(balance, { method: 'GET', query: { needed: '150' }, headers: bearer(tk) });
    assert.deepEqual(r.body, { enough: false }, 'عادت القراءة بعد ٣٠ث: الرصيد الحقيقيّ (١٢٠) يحكم');
  } finally { Date.now = realNow; }
});

test('د-ب. الواجهة: غير المالك لا يمرّ «يكفي دائمًا» — يسأل بجلسته، ورسالته بلا اسم مزوّد، والتفصيل للمالك', () => {
  const v = read('js/app-11-video.js');
  const i = v.indexOf('async function ensureRunwayCredits(needed){');
  const body = v.slice(i, v.indexOf('/* Helper: generate ONE scene via Google Veo 3', i));
  assert.doesNotMatch(body, /if\(!isOwnerAccount\(\)\) return true;/, 'كان يرجع true لغير المالك بلا فحص');
  assert.match(body, /action=video-balance&needed=' \+ encodeURIComponent\(needed\), \{ headers: \{ Authorization: 'Bearer ' \+ tk \} \}/);
  const nonOwner = body.slice(body.indexOf('if(!owner){'), body.indexOf('return true;', body.indexOf('if(!owner){')));
  assert.match(nonOwner, /d\.enough === false/);
  assert.doesNotMatch(nonOwner, /Runway|runwayml/i, 'لا اسم مزوّد لغير المالك');
  assert.match(body.slice(body.indexOf('return true;', body.indexOf('if(!owner){'))), /رصيد Runway غير كافي/, 'التفصيل للمالك كما كان');
});

// ─────────────────────────────── (هـ) ردّ الحصّة عند الفشل ───────────────────────────────
test('هـ. التنزيل: المضيف المحجوب قبل أيّ طلب خارجيّ يُردّ؛ 404 والصفحة غير الوسيطة والتحويل المحجوب بعد الجلب تُعدّ', async () => {
  const tk = await user('refund-dl');
  upstream.calls.length = 0;
  assert.equal((await dl({ url: 'https://intranet.example/x.mp4' }, bearer(tk))).code, 403);
  assert.equal(upstream.calls.length, 0, 'حُجب قبل أيّ طلب خارجيّ');
  assert.equal(await tally('refund-dl', 'video-download'), 0, 'لا طلب خارجيّ = يُردّ (وعلامة «عُدّ اليوم» تُمحى)');
  assert.equal((await dl({ url: 'https://intranet.example/x.mp4' }, bearer(tk))).code, 403);
  assert.equal(await tally('refund-dl', 'video-download'), 0);
  upstream.mode = '404';
  try { assert.equal((await dl({ url: 'https://cdn.example/missing.mp4' }, bearer(tk))).code, 404); } finally { upstream.mode = 'ok'; }
  upstream.mode = 'html';
  try { assert.equal((await dl({ url: 'https://cdn.example/page' }, bearer(tk))).code, 415); } finally { upstream.mode = 'ok'; }
  upstream.mode = 'redirect-private';
  try { assert.equal((await dl({ url: 'https://cdn.example/bounce' }, bearer(tk))).code, 403); } finally { upstream.mode = 'ok'; }
  assert.equal(await tally('refund-dl', 'video-download'), 3, 'كلّ واحد منها طلب خارجيّ وقع — يُعدّ');
  assert.equal((await dl({ url: 'https://cdn.example/missing.mp4' }, bearer(tk))).code, 200);
  assert.equal(await tally('refund-dl', 'video-download'), 3, 'الرابط نفسه في يومه وسيط واحد');
});

test('هـ-هـ. v-dl-refund-scope: صفحات غير وسيطة بلا حدّ كانت مجّانيّة — بعد ٢٠ يُرفض الحادي والعشرون 429 بلا جلب خارجيّ', async () => {
  const tk = await user('html-proxy');
  upstream.calls.length = 0;
  upstream.mode = 'html';
  try {
    for (let i = 0; i < videoDownload.DOWNLOAD_DAILY; i++) assert.equal((await dl({ url: 'https://cdn.example/page-' + i }, bearer(tk))).code, 415, 'صفحة ' + (i + 1));
    assert.equal(upstream.calls.length, videoDownload.DOWNLOAD_DAILY);
    const over = await dl({ url: 'https://cdn.example/page-over' }, bearer(tk));
    assert.equal(over.code, 429, 'كانت كلّها تُردّ فلا يحدّ السقف الجلب الخارجيّ');
    assert.equal(upstream.calls.length, videoDownload.DOWNLOAD_DAILY, 'المرفوض لا يجلب');
  } finally { upstream.mode = 'ok'; }
  upstream.mode = '404';
  try { assert.equal((await dl({ url: 'https://cdn.example/gone-x' }, bearer(await user('html-proxy-2')))).code, 404); } finally { upstream.mode = 'ok'; }
  assert.equal(await tally('html-proxy-2', 'video-download'), 1, '404 من مضيف خارجيّ يُعدّ');
});

test('هـ-ب. ترقية الجودة: رفض Runway أو مفتاح غائب يردّ الترقية المعدودة', async () => {
  const tk = await user('refund-up');
  await upscale.rememberOutputs([RUNWAY_OUT]);
  runwayUpscale = 400;
  try {
    for (let i = 0; i < 5; i++) assert.equal((await run(upscale, { method: 'POST', headers: ip, body: { token: tk, videoUrl: RUNWAY_OUT } })).code, 400);
  } finally { runwayUpscale = 200; }
  assert.equal(await tally('refund-up', 'video-upscale'), 0, 'كانت ثلاث رفضات تُغلق اليوم');
  const key = process.env.RUNWAY_API_KEY;
  delete process.env.RUNWAY_API_KEY;
  try { assert.equal((await run(upscale, { method: 'POST', headers: ip, body: { token: tk, videoUrl: RUNWAY_OUT } })).code, 500); } finally { process.env.RUNWAY_API_KEY = key; }
  assert.equal(await tally('refund-up', 'video-upscale'), 0);
  assert.equal((await run(upscale, { method: 'POST', headers: ip, body: { token: tk, videoUrl: RUNWAY_OUT } })).code, 200);
  assert.equal(await tally('refund-up', 'video-upscale'), 1);
});

test('هـ-ج. المشاركة: store_failed (القاعدة ممتلئة) يردّ حصّة الصورة وPDF والملفّ', async () => {
  const tk = await user('refund-share');
  const B64 = Buffer.from('omran').toString('base64');
  const PDF = Buffer.from('%PDF-1.4 x').toString('base64');
  storeDown = true;
  try {
    for (const [h, body, bucket] of [[img, { data: B64 }, 'share-img'], [pdf, { data: PDF, name: 'a.pdf' }, 'share-pdf'], [file, { data: B64, name: 'a.txt', mime: 'text/plain' }, 'share-file']]) {
      const r = await run(h, { method: 'POST', body: Object.assign({ token: tk }, body) });
      assert.deepEqual([r.code, r.body.error], [500, 'store_failed'], bucket);
      assert.equal(await tally('refund-share', bucket), 0, bucket + ': الحصّة رجعت');
    }
  } finally { storeDown = false; }
});

// المزوّدان المدفوعان (Tavily وGoogle) فشلا معًا (حصّة نفدت) ← يُردّ؛ وردّ 200 فارغ من أيّهما خدم الطلب (ودُفع) ← يُعدّ.
async function withPaid(tv, gg, fn) {
  const keep = [process.env.GOOGLE_SEARCH_API_KEY, process.env.GOOGLE_SEARCH_CX];
  process.env.GOOGLE_SEARCH_API_KEY = 'g-test'; process.env.GOOGLE_SEARCH_CX = 'cx-test';
  tavilyStatus = tv; googleStatus = gg;
  try { return await fn(); } finally {
    tavilyStatus = 200; googleStatus = 200;
    if (keep[0] === undefined) delete process.env.GOOGLE_SEARCH_API_KEY; else process.env.GOOGLE_SEARCH_API_KEY = keep[0];
    if (keep[1] === undefined) delete process.env.GOOGLE_SEARCH_CX; else process.env.GOOGLE_SEARCH_CX = keep[1];
  }
}

test('هـ-د. معرض الأفكار حين يفشل المزوّدان المدفوعان (432/403) والاقتراحات عند فشل النموذج (والبديل) تردّ الحصّة', async () => {
  const tk = await user('refund-ideas');
  const r = await withPaid(432, 403, () => run(ideas, { method: 'POST', headers: ip, body: { token: tk, q: 'majlis lounge ' + Date.now() } }));
  assert.equal(r.body.error, 'provider');
  assert.deepEqual([r.body.detail.tavily, r.body.detail.google], [432, 403]);
  assert.equal(await tally('refund-ideas', 'design-ideas'), 0);
  const cx = await withPaid(432, 403, () => run(ideas, { method: 'POST', headers: ip, body: { token: tk, mode: 'construction', type: 'villa', q: 'x' + Date.now() } }));
  assert.equal(cx.body.error, 'provider');
  assert.equal(await tally('refund-ideas', 'design-ideas'), 0, 'وضع المقاولات أيضًا');
  tavilyStatus = 432;
  try {
    const noGoogle = await run(ideas, { method: 'POST', headers: ip, body: { token: tk, q: 'tavily down ' + Date.now() } }); // Google بلا مفتاح
    assert.equal(noGoogle.body.error, 'provider');
  } finally { tavilyStatus = 200; }
  assert.equal(await tally('refund-ideas', 'design-ideas'), 0, 'Tavily فشل وGoogle بلا مفتاح: لم يخدم مدفوع');
  geminiOk = false;
  try {
    for (const [h, b, bucket] of [[designSuggest, { imageBase64: 'QUJD' }, 'design-suggest'], [fashionSuggest, { description: 'casual' }, 'fashion-suggest'], [studioSuggest, { imageBase64: 'QUJD' }, 'studio-suggest']]) {
      const out = await run(h, { method: 'POST', headers: ip, body: Object.assign({ token: tk }, b) });
      assert.equal(out.code, 503, bucket);
      assert.equal(await tally('refund-ideas', bucket), 0, bucket + ': كانت تُعدّ والنموذج لم يُجب');
    }
  } finally { geminiOk = true; }
  const ok = await run(designSuggest, { method: 'POST', headers: ip, body: { token: tk, imageBase64: 'QUJD' } });
  assert.equal(ok.code, 200);
  assert.equal(await tally('refund-ideas', 'design-suggest'), 1, 'النجاح يُعدّ كما كان');
});

test('هـ-د-ج. v-ideas-paid-count: سبعة ردود Tavily مدفوعة و٤٢٩ واحد وGoogle 403 تُعدّ — كان علم المزوّد يأخذ رمز الفشل فيُردّ العدّ', async () => {
  const tk = await user('ideas-partial');
  tavilyEvery = 8; tavilyCalls = 0;
  try {
    for (let i = 0; i < 3; i++) {
      const r = await withPaid(200, 403, () => run(ideas, { method: 'POST', headers: ip, body: { token: tk, q: 'partial ' + i + ' ' + Date.now() } }));
      assert.equal(r.body.error, 'provider');
      assert.ok(r.body.detail.paid > 0, 'ردود مدفوعة ناجحة: ' + JSON.stringify(r.body.detail));
    }
  } finally { tavilyEvery = 0; }
  assert.equal(await tally('ideas-partial', 'design-ideas'), 3, 'كلّها تُعدّ — مزوّد مدفوع خدم الطلب');
});

test('هـ-د-ب. v-ideas-paid: نتيجة فارغة من مزوّد مدفوع ناجح (200) تُعدّ — كان أيّ نصّ بلا معنى يطلق ١٦ Tavily و٤ Google بلا حدّ', async () => {
  const tk = await user('ideas-empty');
  for (const [tv, gg, why] of [[200, 200, 'الاثنان 200 فارغان'], [200, 403, 'Tavily 200 فارغ وGoogle 403'], [432, 200, 'Google 200 فارغ وTavily 432']]) {
    const before = await tally('ideas-empty', 'design-ideas');
    const r = await withPaid(tv, gg, () => run(ideas, { method: 'POST', headers: ip, body: { token: tk, q: 'qwzx ' + why + Date.now() } }));
    assert.equal(r.body.error, 'provider', why);
    assert.equal(await tally('ideas-empty', 'design-ideas'), before + 1, why + ': كان يُردّ');
  }
  const t200 = await run(ideas, { method: 'POST', headers: ip, body: { token: tk, q: 'tavily only ' + Date.now() } }); // Google بلا مفتاح، Tavily 200 فارغ
  assert.equal(t200.body.error, 'provider');
  assert.equal(await tally('ideas-empty', 'design-ideas'), 4);
  for (let i = 4; i < 30; i++) await run(ideas, { method: 'POST', headers: ip, body: { token: tk, q: 'junk ' + i + ' ' + Date.now() } });
  const over = await run(ideas, { method: 'POST', headers: ip, body: { token: tk, q: 'junk over ' + Date.now() } });
  assert.deepEqual([over.code, over.body.error], [429, 'daily_limit_reached'], 'السقف يحدّ الاستعلامات الفارغة');
});

// ─────────────────────────────── (و) توقيع Veo بالبايتات ───────────────────────────────
test('و. توقيع Veo بحرف متعدّد البايتات بالطول نفسه = 401 لا 502', async () => {
  const uri = 'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media';
  for (const sig of ['é'.repeat(32), 'ك'.repeat(32), '😀'.repeat(16)]) {
    const r = await run(veoDownload, { method: 'GET', query: { uri, sig } });
    assert.equal(r.code, 401, JSON.stringify(sig.slice(0, 2)));
    assert.equal(r.body.error, 'auth_required');
  }
});

// ─────────────────────────────── (ز)+(ط) المشاركة ───────────────────────────────
test('ز. ناشر بحساب Google: الاسم المعروض من سجلّه لا البريد، والمفتاح في owner لا يخرج، والحذف لصاحبها وحده', async () => {
  const key = 'g_sara.private@gmail.com';
  const tk = await user(key, { username: 'Sara G', email: 'sara.private@gmail.com', googleAuth: true });
  const r = await run(share, { method: 'POST', body: { token: tk, title: 'app', code: '<p>x</p>', isPublic: true } });
  assert.equal(r.code, 200);
  const rec = JSON.parse(store.get('db/shares/' + r.body.id + '.json'));
  assert.equal(rec.username, 'Sara G', 'كان البريد كاملًا');
  assert.equal(rec.owner, key);
  const idx = [...store.keys()].filter((k) => k.startsWith('db/explore/')).map((k) => JSON.parse(store.get(k))).find((x) => x.id === r.body.id);
  assert.equal(idx.username, 'Sara G');
  assert.ok(!JSON.stringify(idx).includes('@'), 'فهرس «استكشف» بلا بريد');
  const pub = await run(share, { method: 'GET', query: { id: r.body.id } });
  assert.equal(pub.body.username, 'Sara G');
  assert.equal(pub.body.owner, undefined, 'المفتاح لا يخرج في الردّ العامّ');
  assert.ok(!JSON.stringify(pub.body).includes('sara.private'));
  const ex = await run(share, { method: 'GET', query: { explore: '1' } });
  assert.ok(!JSON.stringify(ex.body).includes('@'));
  assert.equal((await run(share, { method: 'DELETE', query: { id: r.body.id }, headers: bearer(await user('Sara G')) })).code, 403, 'من يحمل الاسم المعروض لا يحذف');
  assert.equal((await run(share, { method: 'DELETE', query: { id: r.body.id }, headers: bearer(tk) })).code, 200, 'صاحبها بمفتاحه');
});

test('ز-ب. لا يُعرض أبدًا اسم يبدأ بـg_ أو فيه @ — اسم سجلّ فيه بريد، وحساب بلا سجلّ، ونشر الوكيل بالمفتاح', async () => {
  const t1 = await user('g_noname@gmail.com', { username: 'me@mail.com', googleAuth: true });
  let r = await run(share, { method: 'POST', body: { token: t1, code: 'x' } });
  assert.equal(JSON.parse(store.get('db/shares/' + r.body.id + '.json')).username, 'زائر');
  r = await run(share, { method: 'POST', body: { token: auth.makeToken('g_ghost@gmail.com'), code: 'x' } });
  assert.equal(JSON.parse(store.get('db/shares/' + r.body.id + '.json')).username, 'زائر');
  const made = await share.createShare({ code: 'y', username: 'g_agent@gmail.com' });
  assert.equal(JSON.parse(store.get('db/shares/' + made.id + '.json')).username, 'زائر', 'مسار الوكيل (createShare) أيضًا');
  // سجلّ قديم مخزَّن بالبريد قبل الإصلاح لا يُعرض به
  store.set('db/shares/legacy1.json', JSON.stringify({ id: 'legacy1', code: 'z', username: 'g_old@gmail.com', createdAt: 1 }));
  assert.equal((await run(share, { method: 'GET', query: { id: 'legacy1' } })).body.username, 'زائر');
});

test('ز-ج. v-agent-publish-owner: مشاركة نشرها الوكيل لحساب Google يحذفها صاحبها بمفتاحه (200) لا غيره (403)، وباسمه المعروض', async () => {
  const { doPublish } = require(rp('api/_lib/agent.js')).__test;
  const key = 'g_agent.owner@gmail.com';
  const tk = await user(key, { username: 'Agent Owner', email: 'agent.owner@gmail.com', googleAuth: true });
  const out = await doPublish({ title: 'app', to_explore: true }, '<!DOCTYPE html><p>' + 'x'.repeat(300) + '</p>', key, 'app.example');
  const id = (String(out).match(/\/p\.html\?id=([a-f0-9]+)/) || [])[1];
  assert.ok(id, out);
  const rec = JSON.parse(store.get('db/shares/' + id + '.json'));
  assert.equal(rec.owner, key, 'كان بلا owner');
  assert.equal(rec.username, 'Agent Owner', 'كان «زائر»');
  assert.ok(!JSON.stringify((await run(share, { method: 'GET', query: { id } })).body).includes('@'), 'لا بريد في الردّ العامّ');
  assert.equal((await run(share, { method: 'DELETE', query: { id }, headers: bearer(await user('someone-else')) })).code, 403, 'غير صاحبها');
  assert.equal((await run(share, { method: 'DELETE', query: { id }, headers: bearer(await user('زائر')) })).code, 403, 'ولا من اسمه «زائر»');
  assert.equal((await run(share, { method: 'DELETE', query: { id }, headers: bearer(tk) })).code, 200, 'صاحبها الحقيقيّ كان يأخذ 403');
});

test('ط. المشروع الفارغ والأكبر من الحدّ يُرفضان قبل البوّابة فلا يحرقان حصّة اليوم', async () => {
  const tk = await user('validator');
  for (let i = 0; i < 31; i++) assert.equal((await run(share, { method: 'POST', body: { token: tk, code: '   ' } })).code, 400);
  const big = await run(share, { method: 'POST', body: { token: tk, code: 'x'.repeat(2 * 1024 * 1024 + 1) } });
  assert.deepEqual([big.code, big.body.error], [413, 'code_too_large']);
  assert.equal(await tally('validator', 'share'), 0);
  assert.equal((await run(share, { method: 'POST', body: { token: tk, code: 'ok' } })).code, 200);
  assert.equal((await run(share, { method: 'POST', body: { code: '' } })).code, 400, 'الفارغ بلا رمز يُرفض فارغًا');
});

// ─────────────────────────────── (ح) الحفظ والتنزيل في سلّته ───────────────────────────────
test('ح. purpose:download يُعدّ في سلّة التنزيل (الصور ١٠٠ يوميًّا) بعمر ساعة، ولا يمسّ سقف المشاركة', async () => {
  const tk = await user('saver');
  const B64 = Buffer.from('omran-save').toString('base64');
  for (let i = 0; i < 40; i++) {
    const r = await run(img, { method: 'POST', body: { token: tk, data: B64, purpose: 'download' } });
    assert.equal(r.code, 200, 'تنزيل ' + (i + 1) + ' (سقف المشاركة ٣٠)');
    if (i === 0) assert.equal(ttl.get('db/img/' + r.body.id), 3600, 'ساعة لا ٧ أيّام');
  }
  const p = await run(pdf, { method: 'POST', body: { token: tk, data: Buffer.from('%PDF-1.4 s').toString('base64'), name: 's.pdf', purpose: 'download' } });
  assert.equal(ttl.get('db/pdf/' + p.body.id), 3600);
  const f = await run(file, { method: 'POST', body: { token: tk, data: B64, name: 's.txt', mime: 'text/plain', purpose: 'download' } });
  assert.equal(ttl.get('db/file/' + f.body.id), 3600);
  assert.deepEqual([await tally('saver', 'media-save-img'), await tally('saver', 'media-save-pdf'), await tally('saver', 'media-save-file')], [40, 1, 1]);
  assert.equal(await tally('saver', 'share-img'), 0, 'سقف المشاركة سليم');
  const sh = await run(img, { method: 'POST', body: { token: tk, data: B64 } });
  assert.equal(sh.code, 200);
  assert.equal(ttl.get('db/img/' + sh.body.id), 7 * 86400, 'المشاركة بعمرها كما كانت');
  for (let i = 40; i < 100; i++) await run(img, { method: 'POST', body: { token: tk, data: B64, purpose: 'download' } });
  const over = await run(img, { method: 'POST', body: { token: tk, data: B64, purpose: 'download' } });
  assert.deepEqual([over.code, over.body.error], [429, 'daily_limit']);
});

test('ح-ج. v-media-save-split: لكلّ نقطة سقفها — الملفّ (≈٥ م.ب) ١٠ والـPDF ٢٠ يوميًّا، لا ١٠٠ مشتركة تملأ Redis دفعة واحدة', async () => {
  const tk = await user('bulk-saver');
  const B64 = Buffer.from('omran-bulk').toString('base64');
  const PDF = Buffer.from('%PDF-1.4 bulk').toString('base64');
  for (let i = 0; i < 10; i++) assert.equal((await run(file, { method: 'POST', body: { token: tk, data: B64, name: 'f.txt', mime: 'text/plain', purpose: 'download' } })).code, 200, 'ملفّ ' + (i + 1));
  const f11 = await run(file, { method: 'POST', body: { token: tk, data: B64, name: 'f.txt', mime: 'text/plain', purpose: 'download' } });
  assert.deepEqual([f11.code, f11.body.error, f11.body.limit], [429, 'daily_limit', 10], 'كان يمرّ حتّى ١٠٠ (٥٠٠ م.ب)');
  for (let i = 0; i < 20; i++) assert.equal((await run(pdf, { method: 'POST', body: { token: tk, data: PDF, name: 'p.pdf', purpose: 'download' } })).code, 200, 'PDF ' + (i + 1));
  const p21 = await run(pdf, { method: 'POST', body: { token: tk, data: PDF, name: 'p.pdf', purpose: 'download' } });
  assert.deepEqual([p21.code, p21.body.limit], [429, 20]);
  const im = await run(img, { method: 'POST', body: { token: tk, data: B64, purpose: 'download' } });
  assert.equal(im.code, 200, 'نفاد الملفّات لا يمسّ حفظ الصور');
  assert.equal(ttl.get('db/img/' + im.body.id), 3600);
  assert.equal((await run(file, { method: 'POST', body: { token: tk, data: B64, name: 's.txt', mime: 'text/plain' } })).code, 200, 'المشاركة في سلّتها كما كانت');
  const usageMod = require(rp('api/_lib/_usage.js'));
  for (const b of ['media-save-img', 'media-save-pdf', 'media-save-file']) assert.ok(usageMod.MOVE_BUCKETS.includes(b), b + ' تنتقل مع تغيير الاسم');
});

test('ح-ب. الواجهة: مسارات الحفظ ترسل purpose:download، والمشاركة لا، و429 بنصّ الحدّ القائم', () => {
  const sm = read('js/app-05-save-media.js');
  const up = sm.slice(sm.indexOf("fetch('/api/media?action=img'"), sm.indexOf("fetch('/api/media?action=img'") + 500);
  assert.match(up, /purpose: 'download'/);
  assert.match(sm, /r\.status === 429\) limitNote\(\)/);
  assert.match(sm, /t\('portraitLimitReached'\)/);
  const ui = read('js/app-05-ui.js');
  const link = ui.slice(ui.indexOf('async function omranBlobToServerLink'), ui.indexOf('async function omranBlobToServerLink') + 1600);
  assert.match(link, /purpose: 'download'/);
  assert.match(link, /r\.status === 429 [^\n]*portraitLimitReached/);
  const is = read('js/app-05-img-save.js');
  assert.match(is, /await uploadImage\(blob, name, mode === 'share' \? '' : 'download'\)/, 'زرّ المشاركة يبقى رابط مشاركة');
  assert.match(is, /if\(r\.status === 429\) throw new Error\(gtx\('portraitLimitReached'/);
  for (const f of ['js/app-09-attach.js', 'js/app-10-features.js']) assert.doesNotMatch(read(f), /purpose: 'download'/, f + ': مشاركة لا تنزيل');
  // النصّ القائم موجود باللغات كلّها
  for (const f of fs.readdirSync(path.join(root, 'i18n')).filter((x) => x !== 'ad-studio.js')) assert.match(read('i18n/' + f), /portraitLimitReached/, f);
});

// ─────────────── (ح) ورقة الصورة الجاهزة: رابط «تحميل» يعيش ساعة فلا يُشارَك على واتساب ───────────────
function imgSaver() {
  const made = [];
  const el = (tag) => {
    const e = { tag, dataset: {}, style: {}, children: [], attrs: {}, href: '', textContent: '',
      appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      remove() {}, click() {} };
    made.push(e);
    return e;
  };
  const posts = [];
  const ctx = {
    location: { origin: 'https://app.example' },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/124.0 Mobile' },
    document: { createElement: el, getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { appendChild() {} } },
    FileReader: function () { this.readAsDataURL = (b) => { b.arrayBuffer().then((ab) => { this.result = 'data:' + b.type + ';base64,' + Buffer.from(ab).toString('base64'); this.onload(); }); }; },
    fetch: async (u, init) => { posts.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: 'img1' }) }; },
    authGet: () => 'tok-abc', localStorage: { getItem: () => 'ar' },
    Blob, File, URL, atob, encodeURIComponent, setTimeout: () => 0, String, Number, Math, Date, Error, JSON, Uint8Array, Promise, console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/app-05-img-save.js'), ctx);
  return { save: ctx.omranSaveImage, made, posts };
}

test('ح-د. v-save-no-wa: ورقة الحفظ (رابط ساعة) بلا زرّ واتساب — من يستلمه بعد ساعة يجد 404؛ وورقة المشاركة (٧ أيّام) تبقيه', async () => {
  const png = () => new Blob([Buffer.from('omran-png')], { type: 'image/png' });
  const s = imgSaver();
  assert.equal(await s.save(png(), 'a.png', 'save'), true);
  assert.equal(s.posts[0].purpose, 'download');
  const hrefs = s.made.map((e) => String(e.href || ''));
  assert.ok(hrefs.some((h) => h.includes('/i/img1.raw.png?dl=1')), 'زرّ «تحميل» كما كان');
  assert.ok(!hrefs.some((h) => /wa\.me/.test(h)), 'كان يشارك رابطًا يموت بعد ساعة');
  const sh = imgSaver();
  assert.equal(await sh.save(png(), 'b.png', 'share'), true);
  assert.equal(sh.posts[0].purpose, undefined, 'المشاركة في سلّتها وعمرها');
  assert.ok(sh.made.some((e) => /^https:\/\/wa\.me\/\?text=/.test(String(e.href || ''))), 'زرّ واتساب في المشاركة كما كان');
});
