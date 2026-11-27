// tests/socpub-paused.test.cjs — v-socpub-paused: خدمة النشر أوقفت الحساب (٤٠٢ — دفعة لم تمرّ) فبقيت منصّاتها ✓ في اللوحة وكلّ نشر
// لها «ما قدر ينشر (publish 402 …)»، ولأنّها «موصولة» هناك لم يظهر مدخل ربطها المباشر. الآن: ٤٠٢ يعلّم الخدمة موقوفة يومًا، فمنصّاتها
// «تحتاج ربط» ومدخل المباشر يظهر لما له ربط مباشر — ويوتيوب يستعمل عميل «الدخول بحساب Google» القائم إن لم يُضبط مفتاحاه.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

for (const k of ['OWNER_USERNAMES', 'OWNER_USERNAME', 'UPLOAD_POST_USER', 'META_APP_ID', 'META_APP_SECRET', 'FAL_KEY', 'CC_BRIDGE_URL', 'CC_BRIDGE_SECRET',
  'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete process.env[k];
process.env.AUTH_SECRET = 'socpub-paused-test-secret';
process.env.UPLOAD_POST_API_KEY = 'up-test-key-55aa';
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
let upload = { status: 402, body: { success: false, message: 'Upload-Post: uploads for this account are paused because the subscription payment (24.00 USD) failed. Pay here: https://invoice.example/i/1' } };
const USERS = { status: 200, body: { success: true, profiles: [{ username: 'omranaibuilder', social_accounts: {
  tiktok: { username: 'o' }, youtube: { username: 'om' }, twitter: { username: 'omai' }, threads: { handle: '@o', reauth_required: true },
} }] } };
global.fetch = async (url, opts) => {
  const u = String(url);
  calls.push({ url: u, method: (opts && opts.method) || 'GET' });
  if (u.includes('/uploadposts/users')) return { ok: true, status: 200, json: async () => USERS.body };
  if (/\/api\/upload$/.test(u)) return { ok: upload.status >= 200 && upload.status < 300, status: upload.status, json: async () => upload.body };
  throw new Error('unexpected fetch ' + u);
};
const sp = require(rp('api/_lib/social-publish.js'));
const token = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
async function call(op, body) {
  const out = { status: 0, body: null };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(b) { out.body = J(b); return this; }, end() { return this; } };
  await sp({ method: 'POST', query: { action: 'social-publish', op }, headers: {}, body: Object.assign({ token: token('omran') }, body || {}) }, res);
  return out;
}
const F = 'f'.repeat(24);
const file = () => kv.set('socpub:file:' + F, 'https://files.example/v.mp4');
const pub = (plats, vid) => call('publish', { id: F, vid: vid || F, caption: 'om ai', platforms: plats });
const google = () => { process.env.GOOGLE_CLIENT_ID = 'g-signin-id.apps.example'; process.env.GOOGLE_CLIENT_SECRET = 'g-signin-secret-x'; };

test('١. بلا ربط مباشر: ٤٠٢ من الخدمة يعلّمها موقوفة يومًا — منصّاتها تنتقل من ✓ إلى «تحتاج ربط»، ونشر تقبله يعيدها', async () => {
  file();
  let a = await call('accounts');
  assert.deepEqual([a.body.on, a.body.reauth, a.body.paused], [['tiktok', 'youtube', 'x'], ['threads'], undefined]);
  const r = await pub(['tiktok', 'youtube', 'x']);
  assert.deepEqual([r.status, r.body.error, r.body.status], [502, 'publish', 402]);
  assert.deepEqual([kv.get('socpub:paused'), ttl.get('socpub:paused')], ['1', 86400]);
  a = await call('accounts');
  assert.deepEqual([a.body.on, a.body.reauth.slice().sort(), a.body.paused], [[], ['threads', 'tiktok', 'x', 'youtube'], true]);
  // رفض آخر (حدّ الشهر ٤٢٩، صيغة ٤٠٠) لا يعلّمها
  kv.delete('socpub:paused');
  for (const st of [429, 400, 403]) { upload = { status: st, body: { message: 'no' } }; await pub(['x'], String(st).padStart(24, '0').replace(/[^0-9a-f]/g, '0')); assert.equal(kv.has('socpub:paused'), false, String(st)); }
  // قبلت الخدمة = عادت
  kv.set('socpub:paused', '1');
  upload = { status: 200, body: { success: true, request_id: 'rq-1' } };
  const ok = await pub(['x'], 'a'.repeat(24));
  assert.deepEqual([ok.status, ok.body.ok], [200, true]);
  assert.equal(kv.has('socpub:paused'), false, 'النشر المقبول يمحو العلامة');
  assert.deepEqual((await call('accounts')).body.on, ['tiktok', 'youtube', 'x']);
});

test('٢. يوتيوب بعميل «الدخول بحساب Google» القائم: موقوفة ← يوتيوب «يحتاج ربط» قابل للضغط بسببه، ورابط ربطه بمعرّف العميل القائم', async () => {
  google();
  kv.delete('socpub:paused');
  let a = await call('accounts');
  assert.deepEqual([a.body.on, a.body.connect], [['tiktok', 'youtube', 'x'], []], 'الخدمة شغّالة: ما عندها يبقى ✓ ولا مدخل ربط (v-social-direct-keep)');
  kv.set('socpub:paused', '1');
  a = await call('accounts');
  assert.deepEqual([a.body.on, a.body.reauth, a.body.connect, a.body.whyBy], [[], ['tiktok', 'youtube', 'x', 'threads'], ['youtube'], { youtube: 'paused-402' }]);
  const c = await call('net-connect', { platform: 'youtube' });
  const u = new URL(c.body.url);
  assert.deepEqual([c.status, c.body.host, u.searchParams.get('client_id'), u.searchParams.get('redirect_uri'), u.searchParams.get('scope')],
    [200, 'accounts.google.com', 'g-signin-id.apps.example', 'https://omran-ai-builder.vercel.app/api/social-cb', 'https://www.googleapis.com/auth/youtube.upload']);
  assert.ok(!JSON.stringify(c.body).includes('g-signin-secret-x'), 'السرّ لا يعود');
  assert.equal((await call('net-connect', { platform: 'tiktok' })).status, 400, 'تيك توك بلا مفاتيحه لا ربط له');
});

test('٣. زوج المفاتيح لا يُخلط: مفتاحا يوتيوب الخاصّان يغلبان، ونصف زوج لا يُكمَّل من الآخر، وبلا شيء لا ربط', async () => {
  const N = require(rp('api/_lib/social-net.js'));
  const idOf = async () => { const c = await call('net-connect', { platform: 'youtube' }); return c.status === 200 ? new URL(c.body.url).searchParams.get('client_id') : c.status; };
  process.env.YOUTUBE_CLIENT_ID = 'yt-own-id'; process.env.YOUTUBE_CLIENT_SECRET = 'yt-own-secret';
  assert.equal(await idOf(), 'yt-own-id');
  delete process.env.YOUTUBE_CLIENT_SECRET;
  assert.equal(await idOf(), 'g-signin-id.apps.example', 'نصف زوج يوتيوب ← الزوج البديل كاملًا');
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal(N.configured('youtube'), false, 'نصفان من زوجين لا يكوّنان زوجًا');
  delete process.env.YOUTUBE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_ID;
  assert.deepEqual([N.configured('youtube'), N.any()], [false, false]);
  assert.ok(con.every((l) => !/g-signin-secret-x|yt-own-secret|up-test-key-55aa/.test(l)), 'لا سرّ في السجلّ');
});
