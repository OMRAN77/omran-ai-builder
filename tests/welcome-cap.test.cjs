// tests/welcome-cap.test.cjs — v-welcome-cap (ثغرات الفلوس، موافقة المالك «كلهم»): هديّة الترحيب (٧٠ نقطة) كانت بلا حدّ
// في المسارات الثلاثة لإنشاء الحساب: خمسون تسجيلًا مكتوبًا من عنوان واحد = ٣٥٠٠ نقطة، وحساب Google بلا points فيمنحه
// readPoints ٧٠. الآن الهديّة من حصّة يوميّة لكلّ عنوان (/64 لـIPv6) وللتطبيق كلّه، والتسجيل نفسه لا يُرفض: فوق السقف
// حساب برصيد 0 رقمًا. على معالج auth الحقيقيّ وكولباك Google الحقيقيّ وpoints.js الحقيقيّ؛ Redis وحده في الذاكرة،
// وكلّ أمر فيه يتنازل عن الدور (setImmediate) كنداء الشبكة الحقيقيّ — فيتداخل المتزامن كما في الإنتاج.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'welcome-cap-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
const ENV_KEYS = ['WELCOME_GIFT_PER_IP_DAILY', 'WELCOME_GIFT_DAILY', 'OTP_SIGNUP_GIFT'];
for (const k of ENV_KEYS) delete process.env[k];

// getUser يعيد قراءة السجلّ الغائب أربع مرّات بانتظار ٣٠٠–٩٠٠ مللي (أثر قديم لا عمل له مع Redis)، وكلّ تسجيل جديد
// يمرّ به — فالانتظار هنا فوريّ كي لا يكلّف كلّ تسجيل ثانيتين. (كما في pay-refund.test.cjs)
const realTimeout = global.setTimeout;
global.setTimeout = (fn, ms, ...a) => realTimeout(fn, 0, ...a);

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const ttl = new Map();
let failCounter = null; // (op, key) => true يرمي عطب KV على عدّادات الهديّة وحدها — حفظ الحساب يبقى سليمًا
const tick = () => new Promise((r) => setImmediate(r));
const net = async (op, k) => { await tick(); if (failCounter && String(k).startsWith('db/welcome-gift/') && failCounter(op, k)) throw new Error('Upstash error: down'); };
const kvImpl = {
  kvGetJSON: async (k) => { await tick(); return store.has(k) ? JSON.parse(store.get(k)) : null; },
  kvPutJSON: async (k, v) => { await tick(); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => { await tick(); return store.has(k) ? String(store.get(k)) : null; },
  kvSetRaw: async (k, v, t) => { await tick(); store.set(k, String(v)); if (t) ttl.set(k, t); },
  kvSetIfAbsent: async (k, v, t) => { await net('setnx', k); if (store.has(k)) return false; store.set(k, String(v)); if (t) ttl.set(k, t); return true; },
  kvIncr: async (k) => { await net('incr', k); const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { await net('incrby', k); const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { await net('decrby', k); const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvExpire: async (k, s) => { await tick(); ttl.set(k, Number(s)); },
  kvDel: async (k) => { await tick(); store.delete(k); },
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

let profileEmail = 'a@gmail.com';
global.fetch = async (url) => {
  const u = String(url);
  if (/oauth2\.googleapis\.com\/token/.test(u)) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
  if (/oauth2\/v3\/userinfo/.test(u)) return new Response(JSON.stringify({ email: profileEmail, email_verified: true, name: 'G' }), { status: 200 });
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const points = require(rp('api/_lib/points.js'));
const googleCb = require(rp('api/_lib/auth-google-callback.js'));
const { giftNet } = require(rp('api/_lib/welcome-gift.js'));

const today = () => new Date().toISOString().slice(0, 10);
const ipKey = (net) => 'db/welcome-gift/ip/' + encodeURIComponent(net) + '/' + today();
const allKey = () => 'db/welcome-gift/all/' + today();
const counter = (k) => (store.has(k) ? Number(store.get(k)) : 0);
const counters = () => [...store.entries()].filter(([k]) => k.startsWith('db/welcome-gift/')).sort();

function reset(env) {
  store.clear(); ttl.clear(); failCounter = null;
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env || {});
}
const hdr = (ip) => (ip ? { 'x-forwarded-for': ip + ', 10.0.0.1' } : {});
function fakeRes() {
  const r = { code: 0, body: null, headers: null, setHeader() {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.writeHead = (c, h) => { r.code = c; r.headers = h; };
  return r;
}
async function signup(username, ip, extra) {
  const res = fakeRes();
  await auth({ method: 'POST', headers: hdr(ip), body: Object.assign({ action: 'signup', username, password: 'pass12345' }, extra || {}) }, res);
  return res;
}
async function otpVerify(email, ip) {
  store.set('db/otp/' + email, JSON.stringify({ otp: '123456', exp: Date.now() + 60000 }));
  const res = fakeRes();
  await auth({ method: 'POST', headers: hdr(ip), body: { action: 'email-otp-verify', email, otp: '123456' } }, res);
  return res;
}
async function google(email, ip) {
  profileEmail = email;
  const res = fakeRes();
  const req = { query: { code: 'c', state: 'abcdef0123456789' } };
  if (ip !== undefined) req.headers = hdr(ip);
  await googleCb(req, res);
  return res;
}
const rec = (key) => auth.getUser(key, 1);
const balance = async (key) => (await points.readPoints(key)).points;

test('١. حالة العرض: عشرون تسجيلًا من عنوان المكتب بالقيم الافتراضيّة — كلّهم ٧٠', async () => {
  reset();
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => signup('office' + i, '94.200.1.1')));
  for (const r of res) assert.equal(r.code, 200, JSON.stringify(r.body));
  for (let i = 0; i < 20; i++) {
    const u = await rec('office' + i);
    assert.equal(u.points, 70); assert.equal(u.welcomeGift, true);
    assert.equal(await balance('office' + i), 70);
  }
  assert.equal(counter(ipKey('94.200.1.1')), 20);
  assert.equal(counter(allKey()), 20);
});

test('٢+٣. سقف العنوان ٣: الأوّل والثاني والثالث ٧٠، والرابع والخامس حساب برصيد 0 رقمًا (لا ٧٠ كسولة)، وعنوان آخر ٧٠', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '3' });
  for (let i = 0; i < 5; i++) {
    const r = await signup('farm' + i, '203.0.113.7');
    assert.equal(r.code, 200, 'التسجيل لا يُرفض أبدًا: ' + JSON.stringify(r.body));
    assert.ok(r.body.token, 'جلسة صالحة');
  }
  for (let i = 0; i < 3; i++) {
    const u = await rec('farm' + i);
    assert.equal(u.points, 70); assert.equal(u.welcomeGift, true);
  }
  for (let i = 3; i < 5; i++) {
    const u = await rec('farm' + i);
    assert.equal(typeof u.points, 'number'); assert.equal(u.points, 0); assert.equal(u.welcomeGift, false);
    assert.equal(await balance('farm' + i), 0, 'readPoints لا يمنح ٧٠ لسجلّ رصيده 0');
    assert.equal((await rec('farm' + i)).points, 0, 'والسجلّ باقٍ 0 بعد القراءة');
  }
  assert.equal(counter(ipKey('203.0.113.7')), 3, 'العدّاد على السقف بعد ردّ الزائد');
  const other = await signup('otherip', '198.51.100.9');
  assert.equal(other.code, 200);
  assert.equal((await rec('otherip')).points, 70);
  assert.equal(await balance('otherip'), 70);
});

test('٤. عشرة تسجيلات متزامنة من عنوان واحد على سقف ٣: ثلاث هدايا بالضبط، والعدّاد ٣ بعد الردّ', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '3' });
  const res = await Promise.all(Array.from({ length: 10 }, (_, i) => signup('rush' + i, '203.0.113.50')));
  for (const r of res) assert.equal(r.code, 200);
  let gifted = 0;
  for (let i = 0; i < 10; i++) {
    const u = await rec('rush' + i);
    assert.ok(u.points === 70 || u.points === 0, 'رقم دائمًا: ' + u.points);
    if (u.points === 70) gifted++;
  }
  assert.equal(gifted, 3);
  assert.equal(counter(ipKey('203.0.113.50')), 3);
  assert.equal(counter(allKey()), 3, 'الرفض عند العنوان لا يأكل من القاطع العامّ');
});

test('٥. تسجيل مرفوض (اسم مأخوذ، محجوز، كلمة مرور قصيرة) لا يأكل حصّة — والإيميل في التسجيل يُتجاهل (v-signup-no-email)', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '3' });
  assert.equal((await signup('first', '203.0.113.8', { email: 'first@example.com' })).code, 200);
  const before = JSON.stringify(counters());
  assert.equal((await signup('first', '203.0.113.8')).code, 409, 'اسم مأخوذ');
  assert.equal((await signup('admin', '203.0.113.8')).code, 409, 'اسم محجوز');
  assert.equal((await signup('fourth', '203.0.113.8', { password: 'short' })).code, 400, 'كلمة مرور قصيرة');
  assert.equal(JSON.stringify(counters()), before, 'العدّادات كما هي');
  assert.equal(counter(ipKey('203.0.113.8')), 1);
  // الإيميل في التسجيل لا يُرفض (مكرّرًا أو خاطئًا) ولا يُحفظ: حساب عاديّ يأخذ حصّته كأيّ تسجيل
  assert.equal((await signup('second', '203.0.113.8', { email: 'first@example.com' })).code, 200, 'إيميل غيره يُتجاهل');
  assert.equal((await signup('third', '203.0.113.8', { email: 'not-an-email' })).code, 200, 'إيميل خاطئ يُتجاهل');
  for (const k of ['first', 'second', 'third']) assert.equal((await auth.getUser(k)).email, null, k + ' بلا إيميل');
});

test('٦. القاطع العامّ ٤ بعناوين مختلفة: أربع هدايا بالضبط، والتجاوز يُبقي عدّاد عنوانه (يعدّ التسجيلات — farm-2)؛ وبلا عنوان القاطع وحده', async () => {
  reset({ WELCOME_GIFT_DAILY: '4' });
  const ips = Array.from({ length: 7 }, (_, i) => '198.51.100.' + (10 + i));
  const res = await Promise.all(ips.map((ip, i) => signup('spread' + i, ip)));
  for (const r of res) assert.equal(r.code, 200);
  let gifted = 0;
  for (let i = 0; i < ips.length; i++) {
    const u = await rec('spread' + i);
    if (u.points === 70) { gifted++; assert.equal(counter(ipKey(ips[i])), 1); }
    else { assert.equal(u.points, 0); assert.equal(counter(ipKey(ips[i])), 1, 'رفض القاطع العامّ لا يردّ عدّاد العنوان: سقف الشبكة على تسجيلاتها (farm-2)'); }
  }
  assert.equal(gifted, 4);
  assert.equal(counter(allKey()), 4);

  reset({ WELCOME_GIFT_DAILY: '2' });
  for (let i = 0; i < 3; i++) assert.equal((await signup('noip' + i, '')).code, 200);
  assert.deepEqual([0, 1, 2].map((i) => store.has('db/users/noip' + i + '.json')), [true, true, true]);
  const pts = [];
  for (let i = 0; i < 3; i++) pts.push((await rec('noip' + i)).points);
  assert.deepEqual(pts, [70, 70, 0]);
  assert.deepEqual(counters().map(([k]) => k), [allKey()], 'لا مفتاح عنوان بلا عنوان');
});

test('٧. IPv6: عناوين تدور داخل /64 واحدة شبكة واحدة، و/64 أخرى منفصلة', async () => {
  assert.equal(giftNet('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(giftNet('2001:0DB8:00aa:00bb:1:2:3:4'), '2001:db8:aa:bb::/64');
  assert.equal(giftNet('2001:db8:aa:bb::'), '2001:db8:aa:bb::/64');
  assert.equal(giftNet('[2001:db8:aa:bb::5]:443'), '2001:db8:aa:bb::/64');
  assert.equal(giftNet('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(giftNet('::ffff:94.200.1.1'), '94.200.1.1');
  assert.equal(giftNet('94.200.1.1:5555'), '94.200.1.1');
  assert.equal(giftNet(''), '');

  reset({ WELCOME_GIFT_PER_IP_DAILY: '2' });
  const same = ['2001:db8:aa:bb:1::1', '2001:db8:aa:bb:ffff:2::9', '2001:0db8:00aa:00bb::3', '2001:db8:aa:bb:dead:beef:0:1'];
  for (let i = 0; i < same.length; i++) assert.equal((await signup('v6n' + i, same[i])).code, 200);
  const pts = [];
  for (let i = 0; i < same.length; i++) pts.push((await rec('v6n' + i)).points);
  assert.deepEqual(pts, [70, 70, 0, 0]);
  assert.equal(counter(ipKey('2001:db8:aa:bb::/64')), 2);
  assert.equal((await signup('v6other', '2001:db8:aa:cc::1')).code, 200);
  assert.equal((await rec('v6other')).points, 70, '/64 مختلفة لها حصّتها');
});

test('٨. Google: الحساب الجديد رصيد رقميّ (٧٠ تحت السقف، 0 فوقه) وreadPoints يطابقه، ودخول قائم لا يمسّ العدّادات', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '1' });
  const r1 = await google('one@gmail.com', '94.200.9.9');
  assert.equal(r1.code, 302); assert.match(r1.headers.Location, /gtoken=/);
  const u1 = await rec('g_one@gmail.com');
  assert.equal(u1.points, 70); assert.equal(u1.welcomeGift, true);
  assert.equal(await balance('g_one@gmail.com'), 70);

  const r2 = await google('two@gmail.com', '94.200.9.9');
  assert.equal(r2.code, 302); assert.match(r2.headers.Location, /gtoken=/, 'الحساب يُنشأ فوق السقف');
  const u2 = await rec('g_two@gmail.com');
  assert.equal(typeof u2.points, 'number'); assert.equal(u2.points, 0); assert.equal(u2.welcomeGift, false);
  assert.equal(await balance('g_two@gmail.com'), 0, 'لا ٧٠ كسولة لحساب Google فوق السقف');

  const before = JSON.stringify(counters());
  const again = await google('one@gmail.com', '94.200.9.9');
  assert.equal(again.code, 302); assert.match(again.headers.Location, /gtoken=/);
  assert.equal(JSON.stringify(counters()), before, 'دخول حساب قائم لا يحجز هديّة');
  assert.equal((await rec('g_one@gmail.com')).points, 70);

  // نداء بلا headers (كما في اختبارات الكولباك القائمة) لا ينهار — القاطع العامّ وحده
  const r3 = await google('three@gmail.com');
  assert.equal(r3.code, 302); assert.match(r3.headers.Location, /gtoken=/);
  assert.equal((await rec('g_three@gmail.com')).points, 70);
});

test('٩. الدخول برمز البريد ينشئ حسابًا: فوق السقف 0، وOTP_SIGNUP_GIFT=0 يعطي 0 ولا يمسّ العدّادات', async () => {
  reset({ WELCOME_GIFT_PER_IP_DAILY: '1' });
  const a = await otpVerify('otp1@example.com', '203.0.113.20');
  assert.equal(a.code, 200, JSON.stringify(a.body)); assert.equal(a.body.isNew, true);
  const ua = await rec(a.body.username);
  assert.equal(ua.points, 70); assert.equal(ua.welcomeGift, true);
  const b = await otpVerify('otp2@example.com', '203.0.113.20');
  assert.equal(b.code, 200); assert.equal(b.body.isNew, true);
  const ub = await rec(b.body.username);
  assert.equal(typeof ub.points, 'number'); assert.equal(ub.points, 0); assert.equal(ub.welcomeGift, false);
  assert.equal(await balance(b.body.username), 0);

  reset({ OTP_SIGNUP_GIFT: '0' });
  const c = await otpVerify('otp3@example.com', '203.0.113.21');
  assert.equal(c.code, 200); assert.equal(c.body.isNew, true);
  const uc = await rec(c.body.username);
  assert.equal(uc.points, 0); assert.equal(uc.welcomeGift, false);
  assert.equal(await balance(c.body.username), 0);
  assert.deepEqual(counters(), [], 'هديّة موقوفة لا تحجز شيئًا');
});

test('١٠. عطب KV في العدّادات: التسجيل ينجح (200 لا 500) برصيد 0، ورفض القاطع بعد العنوان يردّ عدّاد العنوان', async () => {
  reset();
  failCounter = () => true;
  const r = await signup('kvdown', '203.0.113.30');
  assert.equal(r.code, 200, JSON.stringify(r.body)); assert.ok(r.body.token);
  const u = await rec('kvdown');
  assert.equal(u.points, 0); assert.equal(u.welcomeGift, false);
  failCounter = null;
  assert.equal(await balance('kvdown'), 0);

  reset();
  failCounter = (op, k) => op === 'incr' && k.startsWith('db/welcome-gift/all/');
  const r2 = await signup('halfdown', '203.0.113.31');
  assert.equal(r2.code, 200);
  assert.equal((await rec('halfdown')).points, 0);
  assert.equal(counter(ipKey('203.0.113.31')), 0, 'حجز العنوان رُدّ');

  reset();
  failCounter = () => true;
  const g = await google('down@gmail.com', '203.0.113.32');
  assert.equal(g.code, 302); assert.match(g.headers.Location, /gtoken=/);
  assert.equal((await rec('g_down@gmail.com')).points, 0);
});

test('١١. مفاتيح العدّادات بتاريخ اليوم (UTC) ومدّتها يومان', async () => {
  reset();
  assert.equal((await signup('ttl1', '94.200.1.2')).code, 200);
  assert.deepEqual(counters().map(([k]) => k).sort(), [allKey(), ipKey('94.200.1.2')].sort());
  assert.match(allKey(), /\/\d{4}-\d{2}-\d{2}$/);
  assert.equal(ttl.get(ipKey('94.200.1.2')), 172800);
  assert.equal(ttl.get(allKey()), 172800);
});

test('١٢. 0 في أيّ متغيّر يوقف الهديّة (والتسجيل باقٍ)، وقيمة غير صالحة ترجع للافتراضيّ', async () => {
  for (const env of [{ WELCOME_GIFT_PER_IP_DAILY: '0' }, { WELCOME_GIFT_DAILY: '0' }]) {
    reset(env);
    const r = await signup('off', '94.200.1.3');
    assert.equal(r.code, 200);
    assert.equal((await rec('off')).points, 0, Object.keys(env)[0]);
    assert.deepEqual(counters(), [], 'موقوفة لا تحجز شيئًا');
  }
  reset({ WELCOME_GIFT_PER_IP_DAILY: 'abc', WELCOME_GIFT_DAILY: '-5' });
  assert.equal((await signup('badenv', '94.200.1.4')).code, 200);
  assert.equal((await rec('badenv')).points, 70);
});
