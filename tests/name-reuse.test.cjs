// tests/name-reuse.test.cjs — v-name-reuse (فحص ربط الأدوات بالاشتراكات ٨ أكتوبر، ثمّ «نعم ابدا»): الاسم الذي تركه صاحبه
// (غيّره أو حذفه المالك) كان يُسجَّل من جديد لشخص آخر — signup وchangeUsername يقبلان السجلّ المحذوف. والرمز يحمل الاسم وحده،
// فرمز صاحب الاسم القديم يصير رمزًا لحساب المسجِّل الجديد والعكس؛ والمسجِّل يرث عدّاد نقاط المحذوف، ويقطع شاهد movedTo
// الذي يتبعه الشحن. وحساب Google مفتاحه g_<البريد>، فمن يسجّل هذا الاسم قبل صاحب البريد يستقبل دخوله بزرّ Google.
// على معالج auth الحقيقيّ وكولباك Google الحقيقيّ وpoints.js الحقيقيّ؛ Redis وحده في الذاكرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'name-reuse-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
  kvPipeline: async (cmds) => cmds.map(([op, k, a]) => {
    if (op === 'GET') return store.has(k) ? store.get(k) : null;
    if (op === 'INCRBY') { const v = Number(store.get(k) || 0) + Number(a); store.set(k, String(v)); return v; }
    if (op === 'DEL') { store.delete(k); return 1; }
    return 1;
  }),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

let profileEmail = 'victim@gmail.com';
global.fetch = async (url) => {
  const u = String(url);
  if (/oauth2\.googleapis\.com\/token/.test(u)) return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
  if (/oauth2\/v3\/userinfo/.test(u)) return new Response(JSON.stringify({ email: profileEmail, email_verified: true, name: 'Victim' }), { status: 200 });
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const points = require(rp('api/_lib/points.js'));
const googleCb = require(rp('api/_lib/auth-google-callback.js'));
const call = (body) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  auth({ method: 'POST', headers: {}, query: {}, body }, res);
});

test('١. اسم غيّره صاحبه لا يأخذه غيره — ورمز جهاز صاحبه القديم لا يصير رمزًا لحساب غريب', async () => {
  await auth.putUser('omar', { username: 'omar', points: 70, plan: 'pro', planUpdatedAt: Date.now(), createdAt: Date.now() });
  const otherDevice = auth.makeToken('omar'); // جهاز صاحب الاسم الثاني، ما زال مسجَّلًا
  const mv = await call({ action: 'changeUsername', token: auth.makeToken('omar'), newUsername: 'omar2' });
  assert.equal(mv.status, 200);
  const grab = await call({ action: 'signup', username: 'Omar', password: 'attacker-pass-1' });
  assert.equal(grab.status, 409, 'الاسم المتروك لا يُسجَّل لغير صاحبه: ' + JSON.stringify(grab.body));
  const tomb = await auth.getUser('omar');
  assert.equal(tomb.deleted, true);
  assert.equal(tomb.movedTo, 'omar2', 'شاهد movedTo باقٍ — الشحن باسم الجلسة القديمة يتبع الحساب');
  assert.equal(tomb.salt, undefined, 'لا كلمة مرور لأحد على الاسم القديم');
  // الرمز القديم لا ينقل حسابًا ميّتًا ولا يتصرّف به
  const ghost = await call({ action: 'changeUsername', token: otherDevice, newUsername: 'omar_x' });
  assert.equal(ghost.status, 404, JSON.stringify(ghost.body));
  assert.equal(await auth.getUser('omar_x', 1), null);
  assert.equal((await auth.getUser('omar2')).plan, 'pro', 'الحساب الحقيقيّ كما هو');
});

test('٢. اسم حذفه المالك لا يُعاد تسجيله — فلا يرث أحدٌ عدّاد نقاطه', async () => {
  await auth.putUser('dana', { username: 'dana', points: 70, createdAt: Date.now() });
  store.set('points:dana', '940');
  const u = await auth.getUser('dana'); u.deleted = true; await auth.putUser('dana', u); // كما يفعل admin-actions delete
  const r = await call({ action: 'signup', username: 'dana', password: 'new-person-1' });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal((await auth.getUser('dana')).deleted, true, 'سجلّ المحذوف لم يُكتب فوقه');
  assert.equal(await points.readPoints('dana'), null, 'لا رصيد يُقرأ لحساب محذوف');
});

test('٣. تغيير الاسم إلى اسم تركه شخص آخر يُرفض، والرجوع إلى اسمك أنت السابق يبقى مسموحًا', async () => {
  await auth.putUser('lina', { username: 'lina', points: 70, createdAt: Date.now() });
  await auth.putUser('sami', { username: 'sami', points: 70, createdAt: Date.now() });
  const a = await call({ action: 'changeUsername', token: auth.makeToken('lina'), newUsername: 'lina_new' });
  assert.equal(a.status, 200);
  const steal = await call({ action: 'changeUsername', token: auth.makeToken('sami'), newUsername: 'LINA' });
  assert.equal(steal.status, 409, JSON.stringify(steal.body));
  assert.equal((await auth.getUser('sami')).username, 'sami');
  const back = await call({ action: 'changeUsername', token: a.body.token, newUsername: 'lina' });
  assert.equal(back.status, 200, 'صاحب الاسم يرجع إليه: ' + JSON.stringify(back.body));
  assert.equal(auth.verifyToken(back.body.token), 'lina');
  assert.equal((await auth.getUser('lina')).deleted, undefined);
});

test('٤. مساحة أسماء Google (g_<البريد>) محجوزة: لا تسجيل ولا تغيير اسم إليها، فدخول صاحب البريد يفتح حسابه هو', async () => {
  const pre = await call({ action: 'signup', username: 'g_Victim@Gmail.com', password: 'attacker-pass-1' });
  assert.equal(pre.status, 409, JSON.stringify(pre.body));
  await auth.putUser('mallory', { username: 'mallory', points: 70, createdAt: Date.now() });
  const mv = await call({ action: 'changeUsername', token: auth.makeToken('mallory'), newUsername: 'g_victim@gmail.com' });
  assert.equal(mv.status, 409, JSON.stringify(mv.body));
  assert.equal(await auth.getUser('g_victim@gmail.com', 1), null);
  // صاحب البريد يدخل بزرّ Google ← حساب جديد له، لا حساب بكلمة مرور يعرفها غيره
  profileEmail = 'victim@gmail.com';
  const r = { writeHead(c, h) { this.c = c; this.h = h; }, end() {} };
  await googleCb({ query: { code: 'c', state: 'ab'.repeat(16) } }, r);
  assert.equal(r.c, 302);
  const acct = await auth.getUser('g_victim@gmail.com');
  assert.equal(acct.googleAuth, true, 'أنشأه الكولباك لصاحب البريد');
  // اسم عاديّ يبدأ بـg_ بلا @ (مثل أسماء الدخول بالرمز) يبقى مسموحًا
  const ok = await call({ action: 'signup', username: 'g_fan', password: 'fan-pass-123' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('٥. الحساب التلقائيّ للدخول بالرمز لا يُنشأ فوق اسم محذوف', async () => {
  await auth.putUser('zed_aabbcc', { username: 'zed_aabbcc', points: 70, createdAt: Date.now(), deleted: true });
  store.set('db/otp/zed@example.com', JSON.stringify({ otp: '123456', exp: Date.now() + 60000 }));
  const orig = crypto.randomBytes;
  const seq = ['aabbcc', 'ddeeff'];
  crypto.randomBytes = (n, ...rest) => (n === 3 && seq.length ? Buffer.from(seq.shift(), 'hex') : orig.call(crypto, n, ...rest));
  let r;
  try { r = await call({ action: 'email-otp-verify', email: 'zed@example.com', otp: '123456' }); }
  finally { crypto.randomBytes = orig; }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.username, 'zed_ddeeff', 'تخطّى الاسم المحذوف');
  assert.equal((await auth.getUser('zed_aabbcc')).deleted, true, 'المحذوف لم يُكتب فوقه');
});

test('٦. الرجوع لاسمك يُثبت بسلسلة الشواهد لا بـprevUsernames: شاهد قديم بلا prevUsernames، وأكثر من عشرة تغييرات', async () => {
  // شاهد من قبل ٥ أكتوبر (لا prevUsernames في الحساب)
  await auth.putUser('ali', { deleted: true, movedTo: 'ali2' });
  await auth.putUser('ali2', { username: 'ali2', points: 70, createdAt: Date.now() });
  const back = await call({ action: 'changeUsername', token: auth.makeToken('ali2'), newUsername: 'ali' });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  // ١١ تغييرًا ثمّ الرجوع للأوّل (prevUsernames مقصوص إلى آخر عشرة)
  await auth.putUser('nam0', { username: 'nam0', points: 70, createdAt: Date.now() });
  let tok = auth.makeToken('nam0');
  for (let i = 1; i <= 11; i++) {
    const r = await call({ action: 'changeUsername', token: tok, newUsername: 'nam' + i });
    assert.equal(r.status, 200); tok = r.body.token;
  }
  const first = await call({ action: 'changeUsername', token: tok, newUsername: 'nam0' });
  assert.equal(first.status, 200, JSON.stringify(first.body));
});

test('٧. اسم في prevUsernames آخرُ من حمله غيرك (بيانات ما قبل الإصلاح) أو حذفه المالك — ليس لك', async () => {
  await auth.putUser('xaa', { username: 'xaa', points: 70, createdAt: Date.now() });
  const x = await call({ action: 'changeUsername', token: auth.makeToken('xaa'), newUsername: 'xbb' });
  assert.equal(x.status, 200);
  // قبل الإصلاح: Y سجّل xaa فوق الشاهد ثمّ غيّره إلى ycc — ورمز جهازه الثاني باسم xaa
  await auth.putUser('xaa', { username: 'xaa', points: 70, email: 'y@private.com', createdAt: Date.now() });
  const y = await call({ action: 'changeUsername', token: auth.makeToken('xaa'), newUsername: 'ycc' });
  assert.equal(y.status, 200);
  const grab = await call({ action: 'changeUsername', token: x.body.token, newUsername: 'xaa' });
  assert.equal(grab.status, 409, 'السلسلة تنتهي عند ycc لا عند xbb: ' + JSON.stringify(grab.body));
  assert.equal((await auth.getUser('xaa')).movedTo, 'ycc', 'شحن Y باسمه القديم ما زال يتبعه');
  // حذف المالك (بلا movedTo) لاسم في تاريخك
  await auth.putUser('kim', { username: 'kim', points: 70, createdAt: Date.now() });
  const k = await call({ action: 'changeUsername', token: auth.makeToken('kim'), newUsername: 'kim2' });
  await auth.putUser('kim', { username: 'kim', deleted: true });
  const kb = await call({ action: 'changeUsername', token: k.body.token, newUsername: 'kim' });
  assert.equal(kb.status, 409, JSON.stringify(kb.body));
});

test('٨. حساب Google يغيّر اسمه ثمّ يرجع إلى مفتاحه g_<بريده> — ولا يرجع إليه غيره', async () => {
  profileEmail = 'owner.g@gmail.com';
  const r = { writeHead(c, h) { this.c = c; this.h = h; }, end() {} };
  await googleCb({ query: { code: 'c', state: 'cd'.repeat(16) } }, r);
  const gk = 'g_owner.g@gmail.com';
  assert.equal((await auth.getUser(gk)).googleAuth, true);
  const away = await call({ action: 'changeUsername', token: auth.makeToken(gk), newUsername: 'gowner' });
  assert.equal(away.status, 200);
  await auth.putUser('stranger', { username: 'stranger', points: 70, createdAt: Date.now() });
  const steal = await call({ action: 'changeUsername', token: auth.makeToken('stranger'), newUsername: gk });
  assert.equal(steal.status, 409, JSON.stringify(steal.body));
  const back = await call({ action: 'changeUsername', token: away.body.token, newUsername: gk });
  assert.equal(back.status, 200, 'صاحب البريد يرجع لمفتاحه: ' + JSON.stringify(back.body));
});

test('٩. سجلّ على g_<البريد> حجزه غير صاحب البريد قبل الإصلاح لا يستقبل دخول Google', async () => {
  await auth.putUser('g_late@gmail.com', { username: 'g_late@gmail.com', salt: 's', hash: 'h', points: 70, createdAt: Date.now() });
  profileEmail = 'late@gmail.com';
  const r = { writeHead(c, h) { this.c = c; this.h = h; }, end() {} };
  await googleCb({ query: { code: 'c', state: 'ef'.repeat(16) } }, r);
  assert.equal(r.c, 302);
  assert.match(r.h.Location, /gerror=account_conflict/);
  assert.doesNotMatch(r.h.Location, /gtoken=/, 'لا رمز لحساب يعرف غيرُك كلمة مروره');
  assert.equal(store.has('db/oauth-claim/' + 'ef'.repeat(16)), false, 'ولا جلسة مودعة لجسر التطبيق');
});
