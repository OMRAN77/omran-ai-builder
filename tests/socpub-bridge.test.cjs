// tests/socpub-bridge.test.cjs — v-socpub-bridge: مزوّد التخزين المؤقّت رفض (٤٠٣) فلم يبلغ النشر أيّ منصّة — الاحتياط جسر المالك:
// الخادم يصدر تذكرة رفع (HMAC بسرّ الجسر) لاسم عشوائيّ وحجم محدّد، المتصفّح يرفع إلى /pub/<اسم>، والمنصّات تقرأ من الاسم نفسه.
// هنا الجسر الحقيقيّ (cc-bridge/pub.mjs) على منفذ محلّيّ والخادم (social-publish.js) بشبكة وRedis محاكيين.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

for (const k of ['OWNER_USERNAMES', 'OWNER_USERNAME', 'UPLOAD_POST_USER', 'UPLOAD_POST_API_KEY', 'DIRECTOR_BRIDGE_URL', 'META_APP_ID', 'META_APP_SECRET']) delete process.env[k];
process.env.AUTH_SECRET = 'socpub-bridge-test-secret';
const SECRET = 'bridge-secret-7f3a91';
const BRIDGE = 'https://bridge.example';
const FAL = 'fal-test-key-1b2c:dd44';
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rp = (f) => require.resolve(path.join(root, f));
const J = (x) => JSON.parse(JSON.stringify(x));
const P = () => import('../cc-bridge/pub.mjs');

const con = [];
for (const m of ['log', 'warn', 'error']) console[m] = (...a) => { con.push(a.map(String).join(' ')); };

const kv = new Map();
require.cache[rp('api/_lib/kv.js')] = { id: rp('api/_lib/kv.js'), filename: rp('api/_lib/kv.js'), loaded: true, exports: {
  kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvDel: async (k) => { kv.delete(k); },
} };
const calls = [];
let falReply = { status: 403, body: { detail: 'User is locked. Reason: Exhausted balance.' } };
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1:')) return realFetch(url, opts);
  calls.push({ url: u, method: (opts && opts.method) || 'GET' });
  if (!u.includes('rest.fal.ai/storage/upload/initiate')) throw new Error('unexpected fetch ' + u);
  if (falReply === 'NET') throw new TypeError('fetch failed');
  return { ok: falReply.status >= 200 && falReply.status < 300, status: falReply.status, json: async () => falReply.body };
};
const sp = require(rp('api/_lib/social-publish.js'));
const token = (u) => {
  const p = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60000 })).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(p).digest('base64url');
};
async function call(op, body) {
  const out = { status: 0, body: null };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(b) { out.body = J(b); return this; }, end() { return this; } };
  await sp({ method: 'POST', query: { action: 'social-publish', op }, headers: {}, body: body || {} }, res);
  return out;
}
const env = (o) => { for (const k of ['FAL_KEY', 'CC_BRIDGE_URL', 'CC_BRIDGE_SECRET']) { if (o[k]) process.env[k] = o[k]; else delete process.env[k]; } };

// ── جسر حقيقيّ على منفذ محلّيّ ──
async function bridge(cfg) {
  const { createPub } = await P();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'socpub-bridge-'));
  const pub = createPub(Object.assign({ secret: SECRET, dir, corsAllowed: (o) => o === 'https://omran-ai-builder.vercel.app', log() {} }, cfg || {}));
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!(await pub.handle(req, res, url))) { res.writeHead(401); res.end('auth'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { pub, dir, base, close: () => new Promise((r) => { server.close(r); fs.rmSync(dir, { recursive: true, force: true }); }) };
}
const NAME = 'a'.repeat(32) + '.mp4';
const bytes = (n) => Buffer.from(Array.from({ length: n }, (_, i) => i % 251));

test('١. الخادم: المزوّد يرفض (٤٠٣) أو ينقطع أو بلا مفتاحه ← هدف الرفع على الجسر بتذكرة يقبلها الجسر نفسه، والرابط العامّ في KV لا في الردّ', async () => {
  const { verifyUpTicket, NAME_RE } = await P();
  for (const [label, fal, reply] of [['رفض', FAL, { status: 403, body: {} }], ['انقطاع', FAL, 'NET'], ['بلا مفتاح', '', null]]) {
    env({ FAL_KEY: fal, CC_BRIDGE_URL: BRIDGE + '/', CC_BRIDGE_SECRET: SECRET });
    falReply = reply; calls.length = 0; con.length = 0;
    const r = await call('target', { token: token('omran'), type: 'video/mp4', size: 1234 });
    assert.deepEqual([r.status, r.body.ok, r.body.via, r.body.ctype], [200, true, 'bridge', 'video/mp4'], label);
    assert.equal(calls.length, fal ? 1 : 0, label + ': المزوّد يُجرَّب أوّلًا إن وُجد مفتاحه');
    const u = new URL(r.body.up);
    const name = u.pathname.slice(5);
    assert.ok(r.body.up.startsWith(BRIDGE + '/pub/') && NAME_RE.test(name), label + ': اسم عشوائيّ على الجسر');
    const t = verifyUpTicket(u.searchParams.get('t'), SECRET);
    assert.deepEqual([t.ok, t.name, t.size], [true, name, 1234], label + ': التذكرة للاسم والحجم');
    assert.ok(t.exp > Date.now() + 3600e3 && t.exp <= Date.now() + 2 * 3600e3 + 5000, 'عمر التذكرة ساعتان');
    assert.equal(kv.get('socpub:file:' + r.body.id), BRIDGE + '/pub/' + name, label + ': الرابط العامّ في KV');
    assert.ok(!JSON.stringify(r.body).includes(SECRET), 'السرّ لا يعود');
    const line = con.find((l) => l.startsWith('[socpub] op=target'));
    assert.match(line, /^\[socpub\] op=target code=200 ok=true via=bridge$/, label + ': السجلّ يسمّي التخزين بلا رابط ولا تذكرة');
  }
});

test('٢. الخادم: المزوّد يقبل ← لا جسر؛ وبلا جسر يبقى الرفض «storage» برمزه، وبلا شيء «no_storage»؛ وجسر بلا https لا يُعتمد', async () => {
  env({ FAL_KEY: FAL, CC_BRIDGE_URL: BRIDGE, CC_BRIDGE_SECRET: SECRET });
  falReply = { status: 200, body: { upload_url: 'https://up.fal.example/put?sig=1', file_url: 'https://v3.fal.example/f.mp4' } };
  let r = await call('target', { token: token('omran'), type: 'video/mp4', size: 9 });
  assert.deepEqual([r.status, r.body.up, r.body.via], [200, 'https://up.fal.example/put?sig=1', undefined]);
  assert.equal(kv.get('socpub:file:' + r.body.id), 'https://v3.fal.example/f.mp4');
  falReply = { status: 403, body: {} };
  env({ FAL_KEY: FAL });
  r = await call('target', { token: token('omran'), type: 'video/mp4', size: 9 });
  assert.deepEqual([r.status, r.body.error, r.body.status], [502, 'storage', 403]);
  env({ FAL_KEY: FAL, CC_BRIDGE_URL: 'http://bridge.example', CC_BRIDGE_SECRET: SECRET });
  assert.equal((await call('target', { token: token('omran'), type: 'video/mp4', size: 9 })).body.error, 'storage', 'http لا يصلح رابطًا عامًّا');
  env({ FAL_KEY: FAL, CC_BRIDGE_URL: BRIDGE });
  assert.equal((await call('target', { token: token('omran'), type: 'video/mp4', size: 9 })).body.error, 'storage', 'بلا سرّ لا تذكرة');
  env({});
  assert.equal((await call('target', { token: token('omran'), type: 'video/mp4', size: 9 })).body.error, 'no_storage');
  env({ CC_BRIDGE_URL: BRIDGE, CC_BRIDGE_SECRET: SECRET });
  assert.equal((await call('target', { token: token('omran'), type: 'image/png', size: 9 })).body.error, 'bad_type');
  assert.equal((await call('target', { token: token('omran'), type: 'video/mp4', size: 501 * 1048576 })).body.error, 'too_big');
  assert.equal((await call('target', { token: token('someone'), type: 'video/mp4', size: 9 })).status, 403, 'المالك وحده');
});

test('٣. الدورة كاملة: تذكرة الخادم ← رفع المتصفّح إلى الجسر ← المنصّة تقرأ الملفّ نفسه (كاملًا وبالمدى وHEAD)', async () => {
  const b = await bridge();
  try {
    env({ CC_BRIDGE_URL: BRIDGE, CC_BRIDGE_SECRET: SECRET });
    const data = bytes(70000);
    const r = await call('target', { token: token('omran'), type: 'video/quicktime', size: data.length });
    const up = b.base + r.body.up.slice(BRIDGE.length), file = b.base + kv.get('socpub:file:' + r.body.id).slice(BRIDGE.length);
    assert.match(file, /\/pub\/[a-f0-9]{32}\.mov$/);
    assert.equal((await realFetch(file)).status, 404, 'قبل الرفع لا شيء');
    const pre = await realFetch(up, { method: 'OPTIONS', headers: { Origin: 'https://omran-ai-builder.vercel.app', 'Access-Control-Request-Method': 'PUT' } });
    assert.deepEqual([pre.status, pre.headers.get('access-control-allow-origin'), /PUT/.test(pre.headers.get('access-control-allow-methods')), /Content-Type/i.test(pre.headers.get('access-control-allow-headers'))], [204, 'https://omran-ai-builder.vercel.app', true, true]);
    const evil = await realFetch(up, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null, 'أصل غريب بلا إذن');
    const put = await realFetch(up, { method: 'PUT', headers: { 'Content-Type': 'video/quicktime', Origin: 'https://omran-ai-builder.vercel.app' }, body: data });
    assert.deepEqual([put.status, await put.json()], [200, { ok: true }]);
    assert.equal(put.headers.get('access-control-allow-origin'), 'https://omran-ai-builder.vercel.app');
    const get = await realFetch(file);
    assert.deepEqual([get.status, get.headers.get('content-type'), get.headers.get('content-length'), get.headers.get('accept-ranges')], [200, 'video/quicktime', '70000', 'bytes']);
    assert.ok(Buffer.from(await get.arrayBuffer()).equals(data), 'الملفّ كما رُفع');
    const head = await realFetch(file, { method: 'HEAD' });
    assert.deepEqual([head.status, head.headers.get('content-length'), (await head.arrayBuffer()).byteLength], [200, '70000', 0]);
    const rg = await realFetch(file, { headers: { Range: 'bytes=100-299' } });
    assert.deepEqual([rg.status, rg.headers.get('content-range'), rg.headers.get('content-length')], [206, 'bytes 100-299/70000', '200']);
    assert.ok(Buffer.from(await rg.arrayBuffer()).equals(data.subarray(100, 300)));
    const tail = await realFetch(file, { headers: { Range: 'bytes=-50' } });
    assert.deepEqual([tail.status, tail.headers.get('content-range')], [206, 'bytes 69950-69999/70000']);
    const open = await realFetch(file, { headers: { Range: 'bytes=69990-' } });
    assert.deepEqual([open.status, (await open.arrayBuffer()).byteLength], [206, 10]);
    assert.equal((await realFetch(file, { headers: { Range: 'bytes=70000-' } })).status, 416);
    assert.deepEqual(fs.readdirSync(b.dir), [file.split('/').pop()], 'لا ملفّ مؤقّت باقٍ');
  } finally { await b.close(); }
});

test('٤. الجسر يرفض: بلا تذكرة، تذكرة لاسم آخر أو بسرّ آخر أو منتهية أو تذكرة مهمّة، حجم غير المتّفق عليه، اسم غير الصيغة، قرص ممتلئ', async () => {
  const { signUpTicket, verifyUpTicket, parseRange } = await P();
  const R = await import('../cc-bridge/render.mjs');
  const b = await bridge();
  try {
    const data = bytes(5000);
    const put = (name, t, body) => realFetch(b.base + '/pub/' + name + (t ? '?t=' + t : ''), { method: 'PUT', body: body || data }).then(async (x) => [x.status, (await x.json()).error]);
    const good = signUpTicket({ name: NAME, size: 5000 }, SECRET);
    assert.deepEqual(await put(NAME, ''), [401, 'unauthorized']);
    assert.deepEqual(await put('b'.repeat(32) + '.mp4', good), [401, 'unauthorized'], 'تذكرة اسم آخر');
    assert.deepEqual(await put(NAME, signUpTicket({ name: NAME, size: 5000 }, 'other-secret')), [401, 'unauthorized']);
    assert.deepEqual(await put(NAME, signUpTicket({ name: NAME, size: 5000, exp: Date.now() - 1 }, SECRET)), [401, 'unauthorized']);
    assert.equal(verifyUpTicket(R.signJobToken({ user: 'omran', jobId: 'job12345' }, SECRET), SECRET).ok, false, 'رمز مهمّة المخرج ليس تذكرة رفع');
    assert.equal(R.verifyJobToken(good, SECRET).ok, false, 'وتذكرة الرفع ليست رمز مهمّة');
    assert.deepEqual(await put(NAME, good, bytes(4999)), [400, 'size_mismatch']);
    assert.deepEqual(await put(NAME, good, bytes(5001)), [400, 'size_mismatch']);
    assert.deepEqual(await put(NAME, signUpTicket({ name: NAME, size: 600 * 1048576 }, SECRET)), [413, 'too_big']);
    assert.deepEqual(fs.readdirSync(b.dir), [], 'ما رُفض لا يترك أثرًا');
    for (const bad of ['x.mp4', NAME.replace('.mp4', '.exe'), 'A'.repeat(32) + '.mp4', NAME + '/..', '..%2f' + NAME]) {
      const x = await realFetch(b.base + '/pub/' + bad);
      assert.equal(x.status, 404, bad);
    }
    assert.equal((await realFetch(b.base + '/pub/' + NAME, { method: 'DELETE' })).status, 405);
    assert.deepEqual(await put(NAME, good), [200, undefined]);
    assert.deepEqual(await put(NAME, good), [200, undefined], 'إعادة الرفع بالتذكرة نفسها تستبدل الملفّ نفسه');
    assert.deepEqual([parseRange('', 10), parseRange('bytes=0-', 10), parseRange('bytes=2-100', 10), parseRange('bytes=-0', 10), parseRange('bytes=5-2', 10), parseRange('items=0-1', 10)],
      [null, { start: 0, end: 9 }, { start: 2, end: 9 }, false, false, null]);
  } finally { await b.close(); }
  const full = await bridge({ diskFree: async () => 10 * 1048576 });
  try {
    const { signUpTicket: s2 } = await P();
    const x = await realFetch(full.base + '/pub/' + NAME + '?t=' + s2({ name: NAME, size: 5000 }, SECRET), { method: 'PUT', body: bytes(5000) });
    assert.deepEqual([x.status, (await x.json()).error], [507, 'disk_full'], 'قرص بلا هامش');
  } finally { await full.close(); }
});

test('٥. العمر: ما مضى عمره لا يُخدَم ويُمسح عند الرفع التالي — والرفع غير المكتمل معه', async () => {
  const { signUpTicket } = await P();
  const b = await bridge({ ttlMs: 60000 });
  try {
    const old = 'c'.repeat(32) + '.mp4';
    fs.writeFileSync(path.join(b.dir, old), 'x'); fs.writeFileSync(path.join(b.dir, old + '.part'), 'y');
    const past = new Date(Date.now() - 120000);
    fs.utimesSync(path.join(b.dir, old), past, past); fs.utimesSync(path.join(b.dir, old + '.part'), past, past);
    assert.equal((await realFetch(b.base + '/pub/' + old)).status, 404, 'منتهٍ لا يُخدَم');
    const x = await realFetch(b.base + '/pub/' + NAME + '?t=' + signUpTicket({ name: NAME, size: 3 }, SECRET), { method: 'PUT', body: Buffer.from('abc') });
    assert.equal(x.status, 200);
    assert.deepEqual(fs.readdirSync(b.dir), [NAME], 'القديم وجزؤه مُسحا');
    assert.equal(await b.pub.sweep(Date.now() + 61000), 1);
    assert.deepEqual(fs.readdirSync(b.dir), []);
  } finally { await b.close(); }
});

test('٦. الأسلاك: الجسر يخدم /pub قبل فحص السرّ الخام، والملفّ في صورة Docker، والتذكرتان بصيغة واحدة، ولا تذكرة ولا سرّ في سجلّ', async () => {
  const srv = read('cc-bridge/server.mjs');
  assert.match(srv, /import \{ createPub \} from '\.\/pub\.mjs';/);
  assert.match(srv, /const pub = createPub\(\{ secret: SECRET, dir: env\.PUB_DIR \|\| join\(tmpdir\(\), 'omran-pub'\), corsAllowed: renderer\.corsAllowed \}\);/);
  const i = srv.indexOf("if (url.pathname.startsWith('/pub/'))"), a = srv.indexOf('if (!authed(req))');
  assert.ok(i > 0 && i < a, '/pub قبل authed');
  assert.ok(read('cc-bridge/Dockerfile').includes('COPY policy.mjs git.mjs watch.mjs server.mjs render.mjs pub.mjs entrypoint.sh ./'));
  const pub = read('cc-bridge/pub.mjs'), api = read('api/_lib/social-publish.js');
  assert.ok(pub.includes(".update('pub.' + p)") && api.includes(".update('pub.' + p)"), 'التوقيع على البادئة نفسها');
  assert.ok(!/console\.log\([^)]*(ticket|secret|\bt\b)/i.test(pub) && !/c\.log\([^)]*(ticket|secret)/i.test(pub), 'لا تذكرة ولا سرّ في السجلّ');
  assert.ok(con.every((l) => !l.includes(SECRET)), 'ولا في سجلّ الخادم');
});
