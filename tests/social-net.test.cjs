// tests/social-net.test.cjs — v-social-net (المالك ٢٧ نوفمبر: «سوهم كلهم الحين… linkedin زيد… بالمجان»): نشر مباشر مجّانيّ إلى LinkedIn
// ويوتيوب وتيك توك تحت لوحة «انشر في حساباتي» نفسها. الشبكة وRedis محاكيان — لا ربط ولا رفع حقيقيّ: ساكت بلا مفاتيح، ربط بحالة
// المالك، توكن مشفَّر، رفع المنصّات معًا وبقفل (ومن خلفيّة نداء النشر)، LinkedIn ينشر بعد المعالجة، يوتيوب «private» حين يقفله، تيك توك في صندوقه
// «inbox»، تجديد التوكن، وانتهاء LinkedIn ← «يحتاج ربط»؛ ولا توكن في ردّ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

for (const k of ['OWNER_USERNAMES', 'OWNER_USERNAME', 'SITE_URL', 'META_APP_ID', 'META_APP_SECRET', 'UPLOAD_POST_API_KEY', 'LINKEDIN_VERSION',
  'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_DIRECT_POST']) delete process.env[k];
process.env.AUTH_SECRET = 'social-net-test-secret';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const J = (x) => JSON.parse(JSON.stringify(x));
const con = [];
for (const m of ['log', 'warn', 'error']) console[m] = (...a) => { con.push(a.map(String).join(' ')); };

const kv = new Map(), ttl = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
  kvSetRaw: async (k, v, t) => { kv.set(k, String(v)); ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { if (kv.has(k)) return false; kv.set(k, String(v)); ttl.set(k, t); return true; },
  kvDel: async (k) => { kv.delete(k); ttl.delete(k); },
} };

const calls = [];
let routes = {};
global.fetch = async (url, opts) => {
  const o = opts || {};
  calls.push({ url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body });
  const hit = Object.keys(routes).filter((p) => String(url).includes(p)).sort((a, b) => b.length - a.length)[0];
  if (!hit) throw new Error('unexpected fetch ' + url);
  const r = typeof routes[hit] === 'function' ? routes[hit](String(url), o) : routes[hit];
  const h = r.headers || {};
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => (r.raw || JSON.stringify(r.body === undefined ? null : r.body)), headers: { get: (k) => h[String(k).toLowerCase()] || null },
    arrayBuffer: async () => { const b = r.bytes || Buffer.alloc(0); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } };
};

const sp = require(rp('api/_lib/social-publish.js'));
const token = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
async function call(op, body, method, query) {
  const out = { status: 0, body: null, headers: {} };
  const res = { setHeader: (k, v) => { out.headers[k] = v; }, status(c) { out.status = c; return this; }, json(b) { out.body = J(b); return this; }, end() { return this; } };
  await sp({ method: method || 'POST', query: Object.assign({ action: 'social-publish', op }, query || {}), headers: {}, body: body || {} }, res);
  return out;
}
const owner = () => ({ token: token('omran') });
const SITE = 'https://omran-ai-builder.vercel.app';
const keysOn = () => Object.assign(process.env, {
  LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret-x', YOUTUBE_CLIENT_ID: 'yt-id', YOUTUBE_CLIENT_SECRET: 'yt-secret-x',
  TIKTOK_CLIENT_KEY: 'tt-key', TIKTOK_CLIENT_SECRET: 'tt-secret-x',
});
const SECRETS = /li-secret-x|yt-secret-x|tt-secret-x|LI-ACCESS|YT-ACCESS|YT-REFRESH|TT-ACCESS|TT-REFRESH|googleapis|linkedin\.com\/rest|tiktokapis/;
const leaks = (o) => assert.doesNotMatch(JSON.stringify(o), SECRETS, 'تسريب: ' + JSON.stringify(o));
const params = (c) => new URLSearchParams(c.method === 'GET' ? c.url.split('?')[1] : String(c.body));
const stateOf = (url) => new URL(url).searchParams.get('state');

test('١. ساكت بلا مفاتيح: لا LinkedIn ولا ربط، والطريق القديم كما هو', async () => {
  calls.length = 0;
  const r = await call('accounts', owner());
  assert.deepEqual([r.status, r.body.error], [503, 'no_key']);
  assert.equal((await call('net-cb', {}, 'GET', { state: 'a'.repeat(32), code: 'x' })).status, 405);
  assert.equal(calls.length, 0);
});

test('٢. «اربط» لكلّ منصّة: المالك وحده، رابط صفحة ربطها بمعاملاتها، ورجوع بلا استعلام إلى ‎/api/social-cb', async () => {
  keysOn();
  assert.equal((await call('net-connect', { platform: 'linkedin' })).status, 401);
  assert.equal((await call('net-connect', { token: token('ali'), platform: 'linkedin' })).status, 403);
  assert.equal((await call('net-connect', Object.assign(owner(), { platform: 'x' }))).body.error, 'bad_platform');
  const liR = (await call('net-connect', Object.assign(owner(), { platform: 'linkedin' }))).body;
  assert.equal(liR.host, 'www.linkedin.com', 'الموقع المسموح مع الرابط');
  const li = new URL(liR.url);
  assert.equal(li.origin + li.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.deepEqual([li.searchParams.get('client_id'), li.searchParams.get('scope'), li.searchParams.get('redirect_uri')], ['li-id', 'openid profile w_member_social', SITE + '/api/social-cb']);
  const yt = new URL((await call('net-connect', Object.assign(owner(), { platform: 'youtube' }))).body.url);
  assert.equal(yt.origin, 'https://accounts.google.com');
  assert.deepEqual([yt.searchParams.get('scope'), yt.searchParams.get('access_type'), yt.searchParams.get('prompt')], ['https://www.googleapis.com/auth/youtube.upload', 'offline', 'consent']);
  const tt = new URL((await call('net-connect', Object.assign(owner(), { platform: 'tiktok' }))).body.url);
  assert.equal(tt.origin + tt.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.deepEqual([tt.searchParams.get('client_key'), tt.searchParams.get('scope'), tt.searchParams.get('client_id')], ['tt-key', 'user.info.basic,video.upload', null], 'v-tiktok-scope: بلا موافقة تيك توك لا تُطلب video.publish (يرفض الصفحة كلّها)');
  process.env.TIKTOK_DIRECT_POST = '1';
  assert.equal(new URL((await call('net-connect', Object.assign(owner(), { platform: 'tiktok' }))).body.url).searchParams.get('scope'), 'user.info.basic,video.upload,video.publish', 'بعد الموافقة: TIKTOK_DIRECT_POST=1');
  delete process.env.TIKTOK_DIRECT_POST;
  const st = stateOf(tt.toString());
  assert.deepEqual([JSON.parse(kv.get('socnet:state:' + st)), ttl.get('socnet:state:' + st)], [{ u: 'omran', p: 'tiktok' }, 600]);
  const v = JSON.parse(require('node:fs').readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(v.rewrites.some((x) => x.source === '/api/social-cb' && x.destination === '/api/media?action=social-publish&op=net-cb'), 'إعادة كتابة الرجوع');
});

const tokenRoutes = () => ({
  'www.linkedin.com/oauth/v2/accessToken': { status: 200, body: { access_token: 'LI-ACCESS', expires_in: 5184000 } },
  'api.linkedin.com/v2/userinfo': { status: 200, body: { sub: 'abc123', name: 'Omran' } },
  'oauth2.googleapis.com/token': (u, o) => (params({ method: 'POST', body: o.body }).get('grant_type') === 'refresh_token'
    ? { status: 200, body: { access_token: 'YT-ACCESS-2', expires_in: 3600 } }
    : { status: 200, body: { access_token: 'YT-ACCESS', refresh_token: 'YT-REFRESH', expires_in: 3600 } }),
  'open.tiktokapis.com/v2/oauth/token/': { status: 200, body: { access_token: 'TT-ACCESS', refresh_token: 'TT-REFRESH', open_id: 'tt-open', expires_in: 86400, scope: 'user.info.basic,video.upload,video.publish' } },
  // v-tiktok-direct: افتراضيًّا إعدادات الحساب مرفوضة ← الصندوق (الاحتياط)؛ اختبار ٩ يفتح النشر المباشر
  'open.tiktokapis.com/v2/post/publish/creator_info/query/': { status: 403, body: { data: {}, error: { code: 'scope_not_authorized', message: 'no' } } },
});
async function link(p) {
  const st = stateOf((await call('net-connect', Object.assign(owner(), { platform: p }))).body.url);
  return call('net-cb', {}, 'GET', { state: st, code: 'CODE-' + p });
}

test('٣. رجوع المنصّة: الرمز ← التوكن (+ معرّف العضو في LinkedIn) مشفَّر، والحالة مرّة، والفشل رمزه بخطوته، ويوتيوب بلا refresh مرفوض', async () => {
  keysOn();
  routes = tokenRoutes();
  calls.length = 0;
  for (const p of ['linkedin', 'youtube', 'tiktok']) {
    const r = await link(p);
    assert.equal(r.headers.Location, SITE + '/?socpub=' + p + '-ok', p);
    const raw = kv.get('socnet:cred:' + p);
    assert.ok(raw && !/ACCESS|REFRESH|abc123/.test(raw), p + ': مشفَّر');
  }
  const li = calls.find((c) => c.url.includes('linkedin.com/oauth/v2/accessToken'));
  assert.deepEqual([params(li).get('code'), params(li).get('redirect_uri'), params(li).get('client_secret')], ['CODE-linkedin', SITE + '/api/social-cb', 'li-secret-x']);
  const tt = calls.find((c) => c.url.includes('tiktokapis.com/v2/oauth/token/'));
  assert.deepEqual([params(tt).get('client_key'), params(tt).get('client_id')], ['tt-key', null]);
  // حالة مستعملة، وغير المالك، والرفض، وفشل التبديل، ويوتيوب بلا refresh
  assert.equal((await call('net-cb', {}, 'GET', { state: 'f'.repeat(32), code: 'x' })).headers.Location, SITE + '/?socpub=fail');
  const st = stateOf((await call('net-connect', Object.assign(owner(), { platform: 'linkedin' }))).body.url);
  assert.equal((await call('net-cb', {}, 'GET', { state: st, error: 'user_cancelled_login' })).headers.Location, SITE + '/?socpub=linkedin-denied');
  routes['www.linkedin.com/oauth/v2/accessToken'] = { status: 400, body: { error: 'invalid_grant', error_description: 'bad' } };
  assert.equal((await link('linkedin')).headers.Location, SITE + '/?socpub=linkedin-fail-token-e400-invalid_grant');
  kv.delete('socnet:cred:youtube');
  routes['oauth2.googleapis.com/token'] = { status: 200, body: { access_token: 'YT-ACCESS', expires_in: 3600 } };
  assert.equal((await link('youtube')).headers.Location, SITE + '/?socpub=youtube-fail-norefresh');
  assert.ok(!con.join('\n').match(SECRETS), 'لا توكن ولا سرّ في السجلّ');
});

test('٤. الحسابات: المربوط مباشرة ✓، وغير المربوط «يحتاج ربط» قابل للضغط وسببه جنبه، وLinkedIn المنتهي يُعاد ربطه', async () => {
  keysOn();
  routes = tokenRoutes();
  for (const p of ['linkedin', 'youtube', 'tiktok']) await link(p);
  let r = await call('accounts', owner());
  assert.deepEqual([r.body.on, r.body.connect], [['tiktok', 'youtube', 'linkedin'], []]);
  leaks(r.body);
  kv.delete('socnet:cred:youtube');
  kv.set('socnet:last:youtube', JSON.stringify({ why: 'fail-norefresh', at: 1 }));
  const c = JSON.parse(require(rp('api/_lib/_emailCrypto.js')).decrypt(kv.get('socnet:cred:linkedin')));
  kv.set('socnet:cred:linkedin', require(rp('api/_lib/_emailCrypto.js')).encrypt(JSON.stringify(Object.assign(c, { exp: Date.now() - 1000 }))));
  r = await call('accounts', owner());
  assert.deepEqual([r.body.on, r.body.reauth, r.body.connect, r.body.whyBy], [['tiktok'], ['youtube', 'linkedin'], ['youtube', 'linkedin'], { youtube: 'fail-norefresh', linkedin: 'expired' }]);
});

const VID = 'd'.repeat(24);
const FILE = 'https://v3.fal.media/files/om-net.mp4';
const BYTES = Buffer.alloc(12 * 1024 * 1024 + 5, 7); // ١٢ م.ب: قطعة واحدة لتيك توك (≤ ٦٤ م.ب)، وجزآن لLinkedIn
test('٥. النشر ثمّ المتابعة: «في الطابور» عند النشر، رفع المنصّات معًا في أوّل سؤال وبقفل، LinkedIn بعد المعالجة، يوتيوب private، تيك توك inbox', async () => {
  keysOn();
  routes = tokenRoutes();
  for (const p of ['linkedin', 'youtube', 'tiktok']) await link(p);
  kv.set('socpub:file:' + VID, FILE);
  let liStatus = 'PROCESSING', ytPuts = 0, liPosts = 0;
  Object.assign(routes, {
    'v3.fal.media/files/om-net.mp4': { status: 200, bytes: BYTES },
    'api.linkedin.com/rest/videos?action=initializeUpload': { status: 200, body: { value: { video: 'urn:li:video:V1', uploadToken: '', uploadInstructions: [
      { uploadUrl: 'https://upload.li.example/p1', firstByte: 0, lastByte: 4194303 }, { uploadUrl: 'https://upload.li.example/p2', firstByte: 4194304, lastByte: BYTES.length - 1 }] } } },
    'upload.li.example/p1': { status: 200, headers: { etag: 'E1' } },
    'upload.li.example/p2': { status: 200, headers: { etag: 'E2' } },
    'api.linkedin.com/rest/videos?action=finalizeUpload': { status: 200 },
    'api.linkedin.com/rest/videos/urn': () => ({ status: 200, body: { status: liStatus } }),
    'api.linkedin.com/rest/posts': () => { liPosts++; return { status: 201, headers: { 'x-restli-id': 'urn:li:share:777' } }; },
    'www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable': { status: 200, headers: { location: 'https://upload.yt.example/session1' } },
    'upload.yt.example/session1': () => { ytPuts++; return { status: 200, body: { id: 'YTID1', status: { uploadStatus: 'uploaded', privacyStatus: 'private' } } }; },
    'open.tiktokapis.com/v2/post/publish/inbox/video/init/': { status: 200, body: { data: { publish_id: 'PUB1', upload_url: 'https://upload.tt.example/u1' }, error: { code: 'ok' } } },
    'upload.tt.example/u1': { status: 201 },
    'open.tiktokapis.com/v2/post/publish/status/fetch/': { status: 200, body: { data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } } },
  });
  calls.length = 0;
  const pub = await call('publish', Object.assign(owner(), { id: VID, caption: 'سطر أوّل\nوصف #omai (جديد)', platforms: ['linkedin', 'youtube', 'tiktok'] }));
  assert.equal(pub.status, 200); leaks(pub.body);
  const req = pub.body.request;
  assert.match(req, /^sd-d{24}-[0-9a-f]{8}$/);
  assert.equal(calls.length, 0, 'النشر لا يرفع شيئًا — الرفع في المتابعة');
  const st = () => call('status', Object.assign(owner(), { request: req }));
  // السؤال ١: سؤالان متزامنان — v-socnet-fast: المنصّات الثلاث تُرفع معًا (تيك توك لا ينتظر دوره)، ولا منصّة تُرفع مرّتين،
  // والفيديو يُحمَّل مرّة لكلّ نداء رافع لا مرّة لكلّ منصّة، ولا يمحو أحدهما تقدّم الآخر
  calls.length = 0;
  const [a, b] = await Promise.all([st(), st()]);
  assert.equal(calls.filter((c) => c.url.includes('initializeUpload')).length, 1, 'LinkedIn مرّة');
  assert.equal(ytPuts, 1, 'يوتيوب مرّة');
  assert.equal(calls.filter((c) => c.url.includes('inbox/video/init')).length, 1, 'تيك توك مرّة ومن أوّل سؤال');
  assert.ok(calls.filter((c) => c.url.includes('om-net.mp4')).length <= 2, 'الفيديو مشترك بين المنصّات');
  const ttInit = JSON.parse(calls.find((c) => c.url.includes('inbox/video/init')).body);
  assert.deepEqual(ttInit.source_info, { source: 'FILE_UPLOAD', video_size: BYTES.length, chunk_size: BYTES.length, total_chunk_count: 1 }, 'v-tiktok-init: حتّى ٦٤ م.ب قطعة واحدة بحجم الفيديو');
  assert.equal(calls.find((c) => c.url.includes('upload.tt.example')).headers['Content-Range'], 'bytes 0-' + (BYTES.length - 1) + '/' + BYTES.length);
  const p2 = calls.find((c) => c.url.endsWith('/p2'));
  assert.equal(p2.body.length, BYTES.length - 4194304, 'الجزء الثاني بحدوده');
  const fin = JSON.parse(calls.find((c) => c.url.includes('finalizeUpload')).body);
  assert.deepEqual(fin.finalizeUploadRequest.uploadedPartIds, ['E1', 'E2']);
  assert.equal(calls.find((c) => c.url.includes('initializeUpload')).headers['LinkedIn-Version'], '202606');
  const init = calls.find((c) => c.url.includes('uploadType=resumable'));
  assert.equal(init.headers['X-Upload-Content-Length'], String(BYTES.length));
  assert.deepEqual(JSON.parse(init.body).status, { privacyStatus: 'public', selfDeclaredMadeForKids: false });
  assert.ok([a, b].every((x) => x.body.state === 'wait'));
  // السؤال ٢: التقدّم محفوظ رغم التزامن — يوتيوب private، LinkedIn يعالج، تيك توك في الصندوق، ولا إعادة رفع
  calls.length = 0;
  let r = await st();
  assert.deepEqual(r.body.results.find((x) => x.platform === 'youtube'), { platform: 'youtube', state: 'ok', url: 'https://youtu.be/YTID1', error: 'private' });
  assert.equal(calls.filter((c) => c.url.includes('initializeUpload') || c.url.includes('upload.yt.example') || c.url.includes('inbox/video/init')).length, 0, 'لا إعادة رفع');
  assert.deepEqual(r.body.results.find((x) => x.platform === 'tiktok'), { platform: 'tiktok', state: 'ok', url: '', error: 'inbox' });
  // السؤال ٣: LinkedIn متاح ← منشور بنصّ مهرَّب؛ تيك توك في الصندوق ← inbox
  liStatus = 'AVAILABLE';
  calls.length = 0;
  r = await st();
  const post = JSON.parse(calls.find((c) => c.url.includes('/rest/posts')).body);
  assert.deepEqual([post.author, post.visibility, post.content.media.id, post.commentary], ['urn:li:person:abc123', 'PUBLIC', 'urn:li:video:V1', 'سطر أوّل\nوصف \\#omai \\(جديد\\)']);
  assert.equal(r.body.state, 'done');
  assert.deepEqual(r.body.results, [
    { platform: 'linkedin', state: 'ok', url: 'https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A777/', error: '' },
    { platform: 'youtube', state: 'ok', url: 'https://youtu.be/YTID1', error: 'private' },
    { platform: 'tiktok', state: 'ok', url: '', error: 'inbox' }]);
  r = await st();
  assert.equal(liPosts, 1, 'منشور LinkedIn واحد');
  leaks(r.body);
});

test('٦. التوكن: يوتيوب المنتهي يتجدّد قبل الرفع، والتجديد المرفوض ← «يحتاج ربط»؛ والملفّ الأكبر من ٢٥٦ م.ب مرفوض بلا رفع', async () => {
  keysOn();
  routes = tokenRoutes();
  await link('youtube');
  const enc = require(rp('api/_lib/_emailCrypto.js'));
  const old = JSON.parse(enc.decrypt(kv.get('socnet:cred:youtube')));
  kv.set('socnet:cred:youtube', enc.encrypt(JSON.stringify(Object.assign(old, { exp: Date.now() - 1000 }))));
  const tk = await require(rp('api/_lib/social-net.js')).token('youtube');
  assert.equal(tk.access, 'YT-ACCESS-2', 'تجدّد');
  kv.set('socnet:cred:youtube', enc.encrypt(JSON.stringify(Object.assign(old, { exp: Date.now() - 1000 }))));
  routes['oauth2.googleapis.com/token'] = { status: 400, body: { error: 'invalid_grant' } };
  assert.equal(await require(rp('api/_lib/social-net.js')).token('youtube'), null);
  assert.equal(kv.get('socnet:bad:youtube'), '1');
  assert.deepEqual((await call('accounts', owner())).body.whyBy.youtube, 'expired');
  // ملفّ كبير
  kv.delete('socnet:bad:youtube');
  routes = tokenRoutes(); await link('youtube');
  const V2 = 'e'.repeat(24);
  kv.set('socpub:file:' + V2, 'https://v3.fal.media/files/big.mp4');
  routes['v3.fal.media/files/big.mp4'] = { status: 200, bytes: Buffer.alloc(257 * 1024 * 1024) };
  const pub = await call('publish', Object.assign(owner(), { id: V2, caption: 'x', platforms: ['youtube'] }));
  calls.length = 0;
  const r = await call('status', Object.assign(owner(), { request: pub.body.request }));
  assert.deepEqual(r.body.results, [{ platform: 'youtube', state: 'fail', url: '', error: 'too_big' }]);
  assert.equal(calls.some((c) => c.url.includes('googleapis.com/upload')), false);
  assert.equal(kv.has('socdir:sent:' + V2 + ':youtube'), false, 'الفشل يحرّر المنصّة');
});

test('٧. v-tiktok-init: رفض التهيئة يسجّل نصّ المنصّة والأحجام في سجلّ الخادم (بلا توكن)، وفوق ٦٤ م.ب قطع ١٠ م.ب والأخيرة تأخذ الباقي', async () => {
  keysOn();
  routes = tokenRoutes();
  await link('tiktok');
  const TT = (id, bytes, init) => {
    kv.set('socpub:file:' + id, 'https://v3.fal.media/files/' + id + '.mp4');
    routes['v3.fal.media/files/' + id + '.mp4'] = { status: 200, bytes };
    routes['open.tiktokapis.com/v2/post/publish/inbox/video/init/'] = init;
  };
  const go = async (id) => {
    const pub = await call('publish', Object.assign(owner(), { id, caption: 'x', platforms: ['tiktok'] }));
    calls.length = 0; con.length = 0;
    return call('status', Object.assign(owner(), { request: pub.body.request }));
  };
  // رفض: الرمز للّوحة كما كان، والنصّ والأحجام للسجلّ
  const A = '1'.repeat(24), small = Buffer.alloc(3 * 1024 * 1024 + 1, 1);
  TT(A, small, { status: 400, body: { data: {}, error: { code: 'invalid_params', message: 'The chunk size is invalid see https://developers.example/doc', log_id: 'L1' } } });
  let r = await go(A);
  assert.deepEqual(r.body.results, [{ platform: 'tiktok', state: 'fail', url: '', error: 'init-e400-invalid_params' }]);
  const line = con.find((l) => l.startsWith('[social-net] init tiktok'));
  assert.match(line, new RegExp('^\\[social-net\\] init tiktok: e400-invalid_params The chunk size is invalid see <url> size=' + small.length + ' chunk=' + small.length + ' n=1$'));
  assert.ok(!/TT-ACCESS|tt-secret-x/.test(con.join('\n')), 'بلا توكن ولا سرّ');
  assert.equal(calls.some((c) => c.url.includes('upload.tt.example')), false, 'لا رفع بعد رفض التهيئة');
  // ٧٥ م.ب + ٧ بايت: ٧ قطع — ستّ بعشرة ميغا والأخيرة تأخذ الباقي
  const B = '2'.repeat(24), big = Buffer.alloc(75 * 1024 * 1024 + 7, 2), C10 = 10 * 1024 * 1024;
  TT(B, big, { status: 200, body: { data: { publish_id: 'PUB7', upload_url: 'https://upload.tt.example/u7' }, error: { code: 'ok' } } });
  routes['upload.tt.example/u7'] = { status: 206 };
  r = await go(B);
  assert.equal(r.body.results[0].state, 'wait');
  assert.deepEqual(JSON.parse(calls.find((c) => c.url.includes('inbox/video/init')).body).source_info, { source: 'FILE_UPLOAD', video_size: big.length, chunk_size: C10, total_chunk_count: 7 });
  const puts = calls.filter((c) => c.url.includes('upload.tt.example/u7')).map((c) => c.headers['Content-Range']);
  assert.equal(puts.length, 7);
  assert.deepEqual([puts[0], puts[5], puts[6]], ['bytes 0-' + (C10 - 1) + '/' + big.length, 'bytes ' + 5 * C10 + '-' + (6 * C10 - 1) + '/' + big.length, 'bytes ' + 6 * C10 + '-' + (big.length - 1) + '/' + big.length]);
  // ٦٤ م.ب بالضبط: قطعة واحدة
  const C = '3'.repeat(24), edge = Buffer.alloc(64 * 1024 * 1024, 3);
  TT(C, edge, { status: 200, body: { data: { publish_id: 'PUB8', upload_url: 'https://upload.tt.example/u7' }, error: { code: 'ok' } } });
  await go(C);
  assert.deepEqual(JSON.parse(calls.find((c) => c.url.includes('inbox/video/init')).body).source_info, { source: 'FILE_UPLOAD', video_size: edge.length, chunk_size: edge.length, total_chunk_count: 1 });
});

test('٨. v-socnet-fast: الرفع يبدأ في خلفيّة نداء النشر نفسه — قبل أيّ سؤال من اللوحة، ولو سُكّرت', async () => {
  keysOn();
  routes = tokenRoutes();
  await link('tiktok');
  const id = '4'.repeat(24);
  kv.set('socpub:file:' + id, 'https://v3.fal.media/files/' + id + '.mp4');
  Object.assign(routes, {
    ['v3.fal.media/files/' + id + '.mp4']: { status: 200, bytes: Buffer.alloc(2 * 1024 * 1024, 4) },
    'open.tiktokapis.com/v2/post/publish/inbox/video/init/': { status: 200, body: { data: { publish_id: 'PUB9', upload_url: 'https://upload.tt.example/u9' }, error: { code: 'ok' } } },
    'upload.tt.example/u9': { status: 201 },
    'open.tiktokapis.com/v2/post/publish/status/fetch/': { status: 200, body: { data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } } },
  });
  const sd = require(rp('api/_lib/social-direct.js'));
  const bg = [];
  sd._seam.waitUntil = (p) => bg.push(p);
  try {
    calls.length = 0;
    const pub = await call('publish', Object.assign(owner(), { id, caption: 'x', platforms: ['tiktok'] }));
    assert.equal(pub.status, 200); leaks(pub.body);
    assert.equal(bg.length, 1, 'وعد واحد في الخلفيّة');
    await Promise.all(bg);
    assert.equal(calls.filter((c) => c.url.includes('inbox/video/init')).length, 1, 'رُفع بلا سؤال من اللوحة');
    assert.equal(calls.filter((c) => c.url.includes('upload.tt.example/u9')).length, 1);
    calls.length = 0;
    const r = await call('status', Object.assign(owner(), { request: pub.body.request }));
    assert.equal(calls.filter((c) => c.url.includes('inbox/video/init')).length, 0, 'السؤال لا يعيد الرفع');
    assert.deepEqual(r.body.results, [{ platform: 'tiktok', state: 'ok', url: '', error: 'inbox' }]);
  } finally { sd._seam.waitUntil = null; }
});

test('٩. v-tiktok-direct: نشر مباشر بلا صندوق — علنيّ برابطه، وغير المدقّق يُعاد «أنا فقط» (private)، والربط القديم بلا الصلاحيّة يحتاج ربط', async () => {
  keysOn();
  routes = tokenRoutes();
  await link('tiktok');
  const enc = require(rp('api/_lib/_emailCrypto.js'));
  const go = async (id, initFn) => {
    kv.set('socpub:file:' + id, 'https://v3.fal.media/files/' + id + '.mp4');
    Object.assign(routes, {
      ['v3.fal.media/files/' + id + '.mp4']: { status: 200, bytes: Buffer.alloc(1024 * 1024, 5) },
      'open.tiktokapis.com/v2/post/publish/creator_info/query/': { status: 200, body: { data: { creator_username: 'omran.ai', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], comment_disabled: true, duet_disabled: false, stitch_disabled: false }, error: { code: 'ok' } } },
      'open.tiktokapis.com/v2/post/publish/video/init/': initFn,
      'upload.tt.example/d1': { status: 201 },
      'open.tiktokapis.com/v2/post/publish/status/fetch/': { status: 200, raw: '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7300000000000000001]},"error":{"code":"ok"}}' }, // رقم ٦٤ بت كما ترسله المنصّة
    });
    const pub = await call('publish', Object.assign(owner(), { id, caption: 'فيديو جديد #omai', platforms: ['tiktok'] }));
    calls.length = 0;
    await call('status', Object.assign(owner(), { request: pub.body.request }));
    const inits = calls.filter((c) => c.url.includes('/v2/post/publish/video/init/')).map((c) => JSON.parse(c.body));
    const r = await call('status', Object.assign(owner(), { request: pub.body.request }));
    return { inits, r };
  };
  const ok = { status: 200, body: { data: { publish_id: 'PD1', upload_url: 'https://upload.tt.example/d1' }, error: { code: 'ok' } } };
  // علنيّ: إعدادات الحساب محترمة (التعليقات المقفلة تبقى مقفلة) والرابط باسم الحساب
  let { inits, r } = await go('5'.repeat(24), ok);
  assert.equal(inits.length, 1);
  assert.deepEqual(inits[0].post_info, { title: 'فيديو جديد #omai', privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: true, disable_stitch: false, video_cover_timestamp_ms: 1000 });
  assert.equal(calls.some((c) => c.url.includes('inbox/video/init')), false, 'لا صندوق');
  assert.deepEqual(r.body.results, [{ platform: 'tiktok', state: 'ok', url: 'https://www.tiktok.com/@omran.ai/video/7300000000000000001', error: '' }]);
  leaks(r.body);
  // غير مدقّق: العلنيّ مرفوض ← «أنا فقط» ويظهر private
  ({ inits, r } = await go('6'.repeat(24), (u, o) => (JSON.parse(o.body).post_info.privacy_level === 'SELF_ONLY' ? ok
    : { status: 403, body: { data: {}, error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'x' } } })));
  assert.deepEqual(inits.map((x) => x.post_info.privacy_level), ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']);
  assert.equal(r.body.results[0].state, 'ok');
  assert.equal(r.body.results[0].error, 'private');
  // ربط بلا الصلاحيّة: v-tiktok-scope — يبقى موصولًا (ينشر للصندوق) ما لم يُفعَّل TIKTOK_DIRECT_POST، ومعه «يحتاج ربط» بسببه
  const old = JSON.parse(enc.decrypt(kv.get('socnet:cred:tiktok'))); delete old.scope;
  kv.set('socnet:cred:tiktok', enc.encrypt(JSON.stringify(old)));
  let acc = (await call('accounts', owner())).body;
  assert.ok(acc.on.includes('tiktok') && !acc.connect.includes('tiktok'), 'الربط القديم لا ينكسر');
  process.env.TIKTOK_DIRECT_POST = '1';
  try {
    acc = (await call('accounts', owner())).body;
    assert.ok(acc.connect.includes('tiktok'));
    assert.equal(acc.whyBy.tiktok, 'need-publish');
  } finally { delete process.env.TIKTOK_DIRECT_POST; }
});
