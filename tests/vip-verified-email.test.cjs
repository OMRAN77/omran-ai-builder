// tests/vip-verified-email.test.cjs — v-vip-verified (أمر المالك ١٨ أكتوبر): «VIP بالإيميل ما ينعطى إلا لإيميل متحقّق منه،
// يعني جاي من دخول Google (email_verified) أو متأكَّد منه بكود… تغيير الإيميل في «حسابي» ما ينحفظ إلا بعد ما يدخل المستخدم
// الكود… أي إيميل محفوظ وما تحقّقنا منه ما يعطي VIP… لازم يكون في اختبار يثبت إن واحد يحط إيميل VIP بدون تحقّق ما ياخذ VIP».
// على المعالجات الحقيقيّة (auth، auth-google-callback، vip، _vip)؛ Redis وحده في الذاكرة، والبريد وGoogle مزيّفان.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'vip-verified-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.RESEND_API_KEY = 're_test_dummy';
process.env.MONITOR_KEY = 'monitor-key-for-test';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
process.env.OMRAN_TEST_FAST_SLEEP = '1';
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
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const mail = {}; // آخر رمز وصل كلّ بريد، وموضوع رسالته
let googleProfile = null;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (/resend\.com/.test(u)) {
    const b = JSON.parse(opts.body);
    const mm = String(b.html).match(/>(\d{6})</);
    mail[b.to[0]] = { code: mm && mm[1], subject: b.subject, html: b.html };
    return new Response('{"id":"m"}', { status: 200 });
  }
  if (u.includes('oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'at' }) };
  if (u.includes('googleapis.com/oauth2/v3/userinfo')) return { ok: true, json: async () => googleProfile };
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const vipList = require(rp('api/_lib/_vip.js'));
const vipApi = require(rp('api/_lib/vip.js'));
const googleCb = require(rp('api/_lib/auth-google-callback.js'));

const call = (body, ip) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  Promise.resolve(auth({ method: 'POST', headers: { 'x-forwarded-for': ip || '7.7.7.7' }, query: {}, body }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
const vip = (method, query, body) => new Promise((resolve) => {
  const res = { statusCode: 0, setHeader() {}, end(s) { resolve({ status: this.statusCode, body: JSON.parse(s || '{}') }); } };
  Promise.resolve(vipApi({ method, headers: {}, query: query || {}, body: body || {} }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
const OWNER = auth.makeToken('omran');
const addVip = (id) => vip('POST', {}, { token: OWNER, id });
const isVip = (name) => vipList.isVip(name);
const user = (name) => auth.getUser(name, 1);
async function signup(name) {
  const r = await call({ action: 'signup', username: name, password: 'pass12345' });
  assert.equal(r.status, 200, name + ' ' + JSON.stringify(r.body));
  return r.body.token;
}
// حساب قديم بإيميل محفوظ بلا تحقّق — كما كتبه setEmail قبل اليوم.
async function legacyEmail(name, email) {
  const rec = await user(name);
  await auth.putUser(name, Object.assign({}, rec, { email }));
  store.set('db/email-index/' + email, JSON.stringify({ username: name, at: Date.now() }));
}
async function changeEmail(token, email, code) {
  if (code === undefined) {
    const r = await call({ action: 'email-otp-request', purpose: 'change', token, email, lang: 'ar' });
    return r;
  }
  return call({ action: 'email-otp-verify', purpose: 'change', token, email, otp: code, lang: 'ar' });
}

test('١. (طلب المالك) من يحطّ إيميل VIP بدون تحقّق ما ياخذ VIP — لا بالحفظ القديم، ولا بإيميل محفوظ قبل اليوم، ولا برمز خاطئ', async () => {
  const mona = await signup('mona');
  // setEmail القديم لا يحفظ شيئًا بعد اليوم
  const old = await call({ action: 'setEmail', token: mona, email: 'friend@vip.com' });
  assert.equal(old.status, 400);
  assert.equal(old.body.code, 'email_code_required');
  assert.equal((await user('mona')).email, null, 'لم يُحفظ');
  // إيميل محفوظ قبل اليوم بلا تحقّق، ثمّ يضيفه المالك إلى VIP
  await legacyEmail('mona', 'friend@vip.com');
  const add = await addVip('friend@vip.com');
  assert.equal(add.status, 200);
  assert.equal(add.body.id, 'friend@vip.com', 'يبقى إيميلًا خامًا — لا يتحوّل إلى حساب لم يثبته');
  assert.equal(add.body.pending, true);
  assert.equal(await isVip('mona'), false, 'الإيميل غير المؤكَّد لا يعطي VIP');
  assert.equal((await call({ action: 'getProfile', token: mona })).body.emailVerified, false);
  // رمز خاطئ لا يؤكّد ولا يعطي
  assert.equal((await changeEmail(mona, 'friend@vip.com')).status, 200);
  const right = mail['friend@vip.com'].code;
  const wrongCode = String((Number(right) + 1) % 1000000).padStart(6, '0');
  const bad = await changeEmail(mona, 'friend@vip.com', wrongCode);
  assert.equal(bad.status, 401);
  assert.equal(bad.body.code, 'bad_otp');
  assert.equal((await user('mona')).verifiedEmail, undefined);
  assert.equal(await isVip('mona'), false);
});

test('٢. «حسابي»: الرمز على الإيميل الجديد يحفظه مؤكَّدًا — ويُضاف اسم صاحبه بجانب مدخل VIP الخام بهذا الإيميل', async () => {
  const tok = auth.makeToken('mona');
  const r = await changeEmail(tok, 'friend@vip.com');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = mail['friend@vip.com'];
  assert.match(m.subject, /تأكيد الإيميل/, 'صياغة التغيير لا «تسجيل الدخول»');
  assert.doesNotMatch(m.html, /تسجيل الدخول/);
  assert.equal((await user('mona')).verifiedEmail, undefined, 'لا شيء يُحفظ قبل الرمز');
  const ok = await changeEmail(tok, 'friend@vip.com', m.code);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const rec = await user('mona');
  assert.equal(rec.email, 'friend@vip.com');
  assert.equal(rec.verifiedEmail, 'friend@vip.com');
  assert.deepEqual(JSON.parse(store.get('db/email-index/friend@vip.com')).username, 'mona');
  const list = await vipList.getVipList({ fresh: true });
  assert.ok(list.includes('mona') && list.includes('friend@vip.com'), JSON.stringify(list));
  assert.equal(await isVip('mona'), true, 'أثبت الإيميل فأخذ VIP');
  assert.equal((await call({ action: 'getProfile', token: tok })).body.emailVerified, true);
  // الرمز يُحرق بعد استعماله، وطلب رمز لإيميلك المؤكَّد نفسه لا يرسل شيئًا
  assert.equal((await changeEmail(tok, 'friend@vip.com', m.code)).status, 401, 'رمز مستعمل');
  delete mail['friend@vip.com'];
  const again = await changeEmail(tok, 'friend@vip.com');
  assert.equal(again.body.verified, true);
  assert.equal(mail['friend@vip.com'], undefined, 'لا رسالة');
});

test('٣. الرمزان لا يتبادلان: رمز الدخول لا يؤكّد تغييرًا، ورمز التغيير لا يُدخل ولا يُنشئ حسابًا، وبلا جلسة لا شيء', async () => {
  const sara = await signup('sara');
  // رمز دخول لبريد ما
  assert.equal((await call({ action: 'email-otp-request', email: 'sara@home.com', lang: 'ar' })).status, 200);
  const loginCode = mail['sara@home.com'].code;
  assert.equal((await changeEmail(sara, 'sara@home.com', loginCode)).status, 401, 'رمز الدخول لا يؤكّد التغيير');
  // رمز تغيير لبريد آخر لا يُدخل
  assert.equal((await changeEmail(sara, 'sara@work.com')).status, 200);
  const changeCode = mail['sara@work.com'].code;
  const login = await call({ action: 'email-otp-verify', email: 'sara@work.com', otp: changeCode, lang: 'ar' });
  assert.equal(login.status, 401, 'رمز التغيير لا يُدخل ولا يُنشئ حسابًا');
  assert.equal(store.has('db/email-index/sara@work.com'), false);
  // الرمز مربوط بالبريد الذي طُلب له
  assert.equal((await changeEmail(sara, 'other@work.com', changeCode)).status, 401);
  // بلا جلسة
  assert.equal((await call({ action: 'email-otp-request', purpose: 'change', email: 'x@y.com' })).status, 401);
  assert.equal((await call({ action: 'email-otp-verify', purpose: 'change', email: 'x@y.com', otp: '123456' })).status, 401);
  assert.equal((await changeEmail(sara, 'sara@work.com', changeCode)).status, 200, 'الرمز الصحيح ما زال صالحًا');
});

test('٤. من وضع الإيميل بلا تحقّق لا يحجزه: صاحبه يثبته والفهرس ينتقل إليه — وسجلّ الآخر باقٍ كما هو؛ والمؤكَّد عند غيرك ٤٠٩', async () => {
  await signup('squat');
  await legacyEmail('squat', 'nour@mail.com');
  const nour = await signup('nour');
  assert.equal((await changeEmail(nour, 'nour@mail.com')).status, 200);
  assert.equal((await changeEmail(nour, 'nour@mail.com', mail['nour@mail.com'].code)).status, 200);
  assert.equal(JSON.parse(store.get('db/email-index/nour@mail.com')).username, 'nour');
  const sq = await user('squat');
  assert.ok(sq && !sq.deleted && sq.email === 'nour@mail.com' && sq.verifiedEmail === undefined, 'لا حذف ولا تعديل لحساب أحد');
  // الآن هو لنور مؤكَّدًا: غيره لا يطلبه
  const other = await signup('other');
  const r = await changeEmail(other, 'nour@mail.com');
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'email_taken');
  // المالك يضيف الإيميل → يتحوّل إلى نور (المؤكَّد) لا إلى squat
  assert.equal((await addVip('nour@mail.com')).body.id, 'nour');
  assert.equal(await isVip('nour'), true);
  assert.equal(await isVip('squat'), false);
});

test('٥. المالك يضيف إيميلًا: يتحوّل إلى حساب Google بمفتاحه أو حساب مؤكَّد حيّ فقط — لا محذوف، ولا g_ بلا Google', async () => {
  await auth.putUser('g_ali@gmail.com', { username: 'Ali', email: 'ali@gmail.com', googleAuth: true, salt: 's', hash: 'h', createdAt: Date.now() });
  assert.equal((await addVip('ali@gmail.com')).body.id, 'g_ali@gmail.com');
  // مفتاح g_ أخذه حساب بكلمة مرور قبل ٨ أكتوبر (بلا googleAuth) لا يُحسب
  await auth.putUser('g_bob@gmail.com', { username: 'bob', email: 'bob@gmail.com', salt: 's', hash: 'h', createdAt: Date.now() });
  assert.equal((await addVip('bob@gmail.com')).body.id, 'bob@gmail.com');
  assert.equal(await isVip('g_bob@gmail.com'), false);
  // حساب مؤكَّد ثمّ حذفه المالك
  await auth.putUser('gone', { username: 'gone', email: 'gone@mail.com', verifiedEmail: 'gone@mail.com', deleted: true, salt: 's', hash: 'h' });
  assert.equal((await addVip('gone@mail.com')).body.id, 'gone@mail.com');
  // ختم لبريد سابق لا يؤكّد بريدًا كُتب بعده (كتابة قديمة بلا رمز)
  await auth.putUser('stale', { username: 'stale', email: 'new@mail.com', verifiedEmail: 'old@mail.com', salt: 's', hash: 'h' });
  assert.equal((await addVip('new@mail.com')).body.id, 'new@mail.com');
  assert.equal(await isVip('stale'), false);
});

test('٦. دخول Google يختم حساب g_<البريد> ويحوّل مدخل VIP الخام إليه — والاسم المستعار لا يُختم', async () => {
  await addVip('lina@gmail.com'); // قبل أن يكون لها حساب: خام
  googleProfile = { email: 'lina@gmail.com', email_verified: true, name: 'Lina', picture: null };
  const res = { code: 0, writeHead(c) { this.code = c; }, end() {}, setHeader() {}, status(c) { this.code = c; return this; }, json() {} };
  await googleCb({ query: { code: 'c', state: 'st' }, headers: {} }, res);
  assert.equal(res.code, 302);
  const rec = await user('g_lina@gmail.com');
  assert.equal(rec.verifiedEmail, 'lina@gmail.com');
  assert.equal(await isVip('g_lina@gmail.com'), true);
  // حساب Google قديم بلا ختم: يُختم عند دخوله
  await auth.putUser('g_old@gmail.com', { username: 'Old', email: 'old@gmail.com', googleAuth: true, salt: 's', hash: 'h', createdAt: 1 });
  googleProfile = { email: 'old@gmail.com', email_verified: true, name: 'Old', picture: null };
  await googleCb({ query: { code: 'c', state: 'st2' }, headers: {} }, res);
  assert.equal((await user('g_old@gmail.com')).verifiedEmail, 'old@gmail.com');
  // اسم مستعار (دمجه المالك) يصل حسابًا آخر: لا ختم لبريد ذلك الحساب
  await auth.putUser('primary1', { username: 'primary1', email: 'p1@mail.com', salt: 's', hash: 'h' });
  store.set('db/alias/g_al@gmail.com', JSON.stringify({ primary: 'primary1' }));
  googleProfile = { email: 'al@gmail.com', email_verified: true, name: 'Al', picture: null };
  await googleCb({ query: { code: 'c', state: 'st3' }, headers: {} }, res);
  assert.equal((await user('primary1')).verifiedEmail, undefined);
});

test('٧. حساب أنشأه رمز البريد مؤكَّد — والدخول برمز إلى حساب قائم لا يختمه (من وضع بريد غيره يستقبل دخوله)', async () => {
  await addVip('fresh@mail.com');
  assert.equal((await call({ action: 'email-otp-request', email: 'fresh@mail.com', lang: 'ar' })).status, 200);
  const r = await call({ action: 'email-otp-verify', email: 'fresh@mail.com', otp: mail['fresh@mail.com'].code, lang: 'ar' });
  assert.equal(r.status, 200);
  assert.equal(r.body.isNew, true);
  const key = auth.verifyToken(r.body.token);
  assert.equal((await user(key)).verifiedEmail, 'fresh@mail.com');
  assert.equal(await isVip(key), true);
  // حساب قائم بإيميل غير مؤكَّد يستقبل دخول رمز ذلك الإيميل — لا ختم
  await signup('host');
  await legacyEmail('host', 'victim@mail.com');
  assert.equal((await call({ action: 'email-otp-request', email: 'victim@mail.com', lang: 'ar' })).status, 200);
  const l = await call({ action: 'email-otp-verify', email: 'victim@mail.com', otp: mail['victim@mail.com'].code, lang: 'ar' });
  assert.equal(l.status, 200);
  assert.equal(auth.verifyToken(l.body.token), 'host');
  assert.equal((await user('host')).verifiedEmail, undefined);
});

test('٨. الجرد للمالك: من يحمل إيميلًا من القائمة غير مؤكَّد، واسم قديم هو إيميل في القائمة، وVIP بالاسم إيميله غير مؤكَّد — بجلسة المالك وحدها', async () => {
  await signup('holder1');
  await legacyEmail('holder1', 'raw@vip.com');
  await addVip('raw@vip.com');
  const rec = await user('holder1');
  await auth.putUser('old@vip.com', Object.assign({}, rec, { username: 'old@vip.com', email: null })); // حساب قبل v-name-no-at
  await addVip('old@vip.com');
  await signup('named');
  await legacyEmail('named', 'named@mail.com');
  await addVip('named');
  const a = await vip('GET', { token: OWNER, audit: '1' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const rows = a.body.audit.rows;
  const has = (u, kind) => rows.some((r) => r.username === u && r.kind === kind);
  assert.ok(has('holder1', 'email'), JSON.stringify(rows));
  assert.ok(has('old@vip.com', 'legacy-name'), JSON.stringify(rows));
  assert.ok(has('named', 'vip-name'), JSON.stringify(rows));
  assert.ok(!rows.some((r) => r.username === 'mona' || r.username === 'nour'), 'المؤكَّدون ليسوا في الجرد');
  assert.ok(a.body.audit.scanned > 5);
  // MONITOR_KEY (تحمله ورك فلوهات علنيّة) يقرأ القائمة لا الجرد
  assert.equal((await vip('GET', { key: process.env.MONITOR_KEY, audit: '1' })).status, 403);
  const plain = await vip('GET', { key: process.env.MONITOR_KEY });
  assert.equal(plain.status, 200);
  assert.equal(plain.body.audit, undefined);
  // غير المالك لا شيء
  assert.equal((await vip('GET', { token: auth.makeToken('named'), audit: '1' })).status, 403);
  // الجرد لا يحذف ولا يعدّل
  assert.ok((await user('holder1')) && (await user('named')));
});

test('٩. (مراجعة النقض) اسم قديم هو إيميل في القائمة يبقى VIP حين يؤكّد صاحب البريد بريده — الخام لا يُنزع (قرار المالك: القديم لا يُمسّ)', async () => {
  const seed = await user('mona');
  await auth.putUser('sami@mail.com', Object.assign({}, seed, { username: 'sami@mail.com', email: null, verifiedEmail: undefined })); // قبل v-name-no-at
  await addVip('sami@mail.com');
  assert.equal(await isVip('sami@mail.com'), true, 'VIP بالاسم كما كان');
  googleProfile = { email: 'sami@mail.com', email_verified: true, name: 'Sami', picture: null };
  const res = { code: 0, writeHead(c) { this.code = c; }, end() {}, setHeader() {}, status(c) { this.code = c; return this; }, json() {} };
  await googleCb({ query: { code: 'c', state: 'st9' }, headers: {} }, res);
  assert.equal(await isVip('g_sami@mail.com'), true, 'صاحب البريد المؤكَّد');
  assert.equal(await isVip('sami@mail.com'), true, 'والحساب القديم بنقاطه وسجلّه باقٍ VIP');
});

test('١٠. (مراجعة النقض) الحدود: غريبٌ لا يستنفد حصّة صاحب البريد، و«مرتبط بحساب آخر» خلف الحدّ لا سؤالًا بلا حدّ', async () => {
  const stranger = await signup('stranger1');
  for (let i = 0; i < 5; i++) await changeEmail(stranger, 'target@mail.com');
  assert.equal((await changeEmail(stranger, 'target@mail.com')).status, 429, 'الغريب نفسه محدود');
  const owner = await signup('target1');
  assert.equal((await changeEmail(owner, 'target@mail.com')).status, 200, 'صاحب البريد يأخذ رمزه');
  // بريد مؤكَّد عند غيرك: بعد ثلاث محاولات للبريد نفسه من حساب واحد ٤٢٩ لا ٤٠٩ — لا تعداد حسابات بلا حدّ
  const prober = await signup('prober1');
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await changeEmail(prober, 'nour@mail.com')).status);
  assert.deepEqual(codes, [409, 409, 409, 429, 429]);
});

test('١١. (مراجعة النقض) لوحة VIP: المعرّف في data-id لا داخل JS، والجرد بزرّ لا عند كلّ إقلاع', () => {
  const fs = require('fs');
  const cl = fs.readFileSync(path.join(root, 'js', 'app-01-boot-auth.js'), 'utf8');
  assert.ok(cl.includes(`'<button type="button" data-id="' + vipEscape(id) + '" onclick="removeVipUser(this.dataset.id)"`));
  assert.ok(!cl.includes('const safeAttr = '), 'لا تهريب يدويّ لـ« \' » وحده');
  const load = cl.slice(cl.indexOf('window.loadVipList = async function loadVipList(){'), cl.indexOf('function vipAuditButton(){'));
  assert.ok(load.includes('vipAuditButton();') && !load.includes('loadVipAudit();'), 'الجرد يقرأ كلّ الحسابات — بزرّ');
  // vipEscape يهرّب « " » فلا يخرج المعرّف من السمة؛ و« \\ » و« ' » بلا معنى داخلها
  const esc = (s2) => String(s2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const evil = "z\\');alert(1);//\"><img src=x onerror=alert(2)>";
  assert.ok(!/"[^"]*"\s*onerror|<img/.test('data-id="' + esc(evil) + '"'), 'لا خروج من السمة');
});

test('١٢. (مراجعة النقض ٢) الترقية مرّة لكلّ إيميل: حساب ثانٍ يثبت البريد نفسه لا يأخذ VIP، وما يزيله المالك لا يعود بالدخول التالي، وإعادة الإضافة تعيده', async () => {
  // lina رُقّيت في ٦ — حساب ثانٍ لصاحبة البريد نفسها (رمز البريد ينشئ حسابًا جديدًا لا فهرس له؟ الفهرس فارغ لـGoogle) لا يأخذ VIP
  assert.equal((await call({ action: 'email-otp-request', email: 'lina@gmail.com', lang: 'ar' })).status, 200);
  const r = await call({ action: 'email-otp-verify', email: 'lina@gmail.com', otp: mail['lina@gmail.com'].code, lang: 'ar' });
  assert.equal(r.status, 200);
  const second = auth.verifyToken(r.body.token);
  assert.notEqual(second, 'g_lina@gmail.com');
  assert.equal(await isVip(second), false, 'لا VIP بلا عدد من إيميل واحد');
  // المالك يزيل المرقّى — دخول Google التالي لا يعيده
  assert.equal((await vip('DELETE', { token: OWNER, id: 'g_lina@gmail.com' })).status, 200);
  assert.equal(await isVip('g_lina@gmail.com'), false);
  googleProfile = { email: 'lina@gmail.com', email_verified: true, name: 'Lina', picture: null };
  const res = { code: 0, writeHead(c) { this.code = c; }, end() {}, setHeader() {}, status(c) { this.code = c; return this; }, json() {} };
  await googleCb({ query: { code: 'c', state: 'st12' }, headers: {} }, res);
  assert.equal(await isVip('g_lina@gmail.com'), false, 'إزالة المالك نهائيّة');
  // المالك يعيد إضافة الإيميل → حساب Google بمفتاحه
  assert.equal((await addVip('lina@gmail.com')).body.id, 'g_lina@gmail.com');
  assert.equal(await isVip('g_lina@gmail.com'), true);
});

test('١٣. (مراجعة النقض ٢) غرباء يستنفدون السقف العامّ لبريدٍ لا يقفلونه عن الحساب الذي يحمله', async () => {
  const victim = await signup('victim2');
  await legacyEmail('victim2', 'victim2@mail.com');
  for (let i = 0; i < 4; i++) {
    const t = await signup('bomber' + i);
    for (let j = 0; j < 3; j++) await changeEmail(t, 'victim2@mail.com');
  }
  const late = await signup('bomber9');
  assert.equal((await changeEmail(late, 'victim2@mail.com')).status, 429, 'السقف العامّ (١٠ في الساعة) يمنع إغراق الصندوق');
  assert.equal((await changeEmail(victim, 'victim2@mail.com')).status, 200, 'صاحب البريد المحفوظ يأخذ رمزه');
});

test('١٤. (مراجعة النقض ٢) «حسابي»: إعادة فتح الإعدادات لا تعيد الإيميل القديم والرمز معلَّق، وخانة الرمز 000000، وأخطاء الحدّ والجلسة بلغة الواجهة', () => {
  const fs = require('fs');
  const cl = fs.readFileSync(path.join(root, 'js', 'app-01-boot-auth.js'), 'utf8');
  assert.ok(cl.includes("if(acctEmail) acctEmail.value = acctEmailPending || data.email || '';"));
  assert.ok(cl.includes("if(emailKey === acctEmailState.email && acctEmailState.verified){ acctEmailPending = ''; acctEmailCodeBox(false);"));
  assert.ok(cl.includes("box.placeholder = '000000';"));
  assert.ok(cl.includes("too_many: String(t2.acctEmailTooMany || '').replace('{minutes}', String(Number(data.minutes) || 15)),"));
  const d = fs.readFileSync(path.join(root, 'js', 'app-03-i18n-data.js'), 'utf8');
  assert.equal((d.match(/acctEmailTooMany: '[^']*\{minutes\}[^']*'/g) || []).length, 2);
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) {
    const f = fs.readFileSync(path.join(root, 'i18n', lg + '.js'), 'utf8');
    for (const k of ['acctEmailCodeSent', 'acctEmailBadCode', 'acctEmailTaken', 'acctEmailUnverified', 'acctEmailTooMany']) assert.match(f, new RegExp('"?' + k + '"?: "'), lg + ' ' + k);
    assert.match(f, /"?acctEmailCodeSent"?: "[^"]*\{email\}/, lg);
    assert.match(f, /"?acctEmailTooMany"?: "[^"]*\{minutes\}/, lg);
  }
});

test('١٥. (طلب المالك، v-signup-no-email) من يسجّل من الـAPI بإيميل صاحب VIP لا يحجزه ولا يتأكّد على حسابه — صاحبه يؤكّده من حسابه فيأخذ VIP هو', async () => {
  await addVip('vipfriend@mail.com'); // المالك أضاف إيميل صديقه قبل أن يؤكّده
  // الزارع يسجّل بإيميل الصديق مباشرة من الـAPI
  const planter = await call({ action: 'signup', username: 'planter', password: 'pass12345', email: 'vipfriend@mail.com' });
  assert.equal(planter.status, 200);
  assert.equal((await user('planter')).email, null, 'التسجيل لا يحفظ الإيميل');
  assert.equal(store.has('db/email-index/vipfriend@mail.com'), false, 'ولا فهرسه — لا دخول ولا استرجاع بالبريد يصل حساب الزارع');
  assert.equal((await call({ action: 'login', username: 'vipfriend@mail.com', password: 'pass12345' })).status, 401, 'كلمة الزارع لا تفتح بالبريد');
  // دخول برمز البريد قبل أن يؤكّده صاحبه: حساب جديد لصاحب الصندوق — لا حساب الزارع
  assert.equal((await call({ action: 'email-otp-request', email: 'vipfriend@mail.com', lang: 'ar' })).status, 200);
  const otp = await call({ action: 'email-otp-verify', email: 'vipfriend@mail.com', otp: mail['vipfriend@mail.com'].code, lang: 'ar' });
  assert.equal(otp.status, 200);
  assert.notEqual(auth.verifyToken(otp.body.token), 'planter', 'رمز البريد لا يُدخل صاحبه حساب الزارع');
  // الصديق يؤكّد إيميله من حسابه هو في «حسابي»
  const friend = await signup('vipfriend');
  assert.equal((await changeEmail(friend, 'vipfriend@mail.com')).status, 409, 'أكّده للتوّ حساب الرمز (لصاحب الصندوق نفسه): واحد لكلّ بريد');
  // صاحب الصندوق نفسه — حساب الرمز — هو المؤكَّد؛ والزارع لا شيء
  const otpKey = auth.verifyToken(otp.body.token);
  assert.equal((await user(otpKey)).verifiedEmail, 'vipfriend@mail.com');
  assert.equal(await isVip(otpKey), true, 'VIP لمن أثبت الصندوق');
  const p = await user('planter');
  assert.equal(p.email, null);
  assert.equal(p.verifiedEmail, undefined, 'الإيميل لم يتأكّد على حساب الزارع');
  assert.equal(await isVip('planter'), false);
  // ومسار «حسابي» وحده (بلا دخول برمز): زارع ثانٍ، ثمّ صاحب البريد يؤكّده من حسابه
  await addVip('vipfriend2@mail.com');
  assert.equal((await call({ action: 'signup', username: 'planter2', password: 'pass12345', email: 'vipfriend2@mail.com' })).status, 200);
  const friend2 = await signup('vipfriend2');
  assert.equal((await changeEmail(friend2, 'vipfriend2@mail.com')).status, 200);
  assert.equal((await changeEmail(friend2, 'vipfriend2@mail.com', mail['vipfriend2@mail.com'].code)).status, 200);
  assert.equal((await user('vipfriend2')).verifiedEmail, 'vipfriend2@mail.com');
  assert.equal(JSON.parse(store.get('db/email-index/vipfriend2@mail.com')).username, 'vipfriend2');
  assert.equal(await isVip('vipfriend2'), true);
  const p2 = await user('planter2');
  assert.ok(p2.email === null && p2.verifiedEmail === undefined, 'الزارع الثاني بلا إيميل ولا ختم');
  assert.equal(await isVip('planter2'), false);
});
