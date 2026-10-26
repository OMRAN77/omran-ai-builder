// tests/audit-fix-auth.test.cjs — v-audit-auth: عيوب الدخول والحسابات المثبتة في فحص التطبيق كلّه (مجموعة auth).
// على معالج auth الحقيقيّ وكولباك Google الحقيقيّ وoauth-claim وphone-link الحقيقيّة؛ Redis في الذاكرة، وGoogle وResend مستبدَلان.
// كلّ اختبار يبدأ بمعرّف بنده (srv-auth-N) ويفشل على 8bb1010 للسبب الذي يصفه البند.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'audit-fix-auth-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.RESEND_API_KEY = 're_test';
process.env.SITE_URL = 'https://example.test';
delete process.env.OAUTH_CLAIM_NET_BIND;
delete process.env.ALLOW_EMAIL_AUTOLINK;
delete process.env.AUTH_MAIL_DAY_CAP;
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const kvImpl = {
  kvGetJSON: async (k) => { if (!store.has(k)) return null; try { return JSON.parse(store.get(k)); } catch (e) { return null; } },
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
  kvPipeline: async (cmds) => cmds.map(() => null),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });
mock('api/_lib/_vip.js', { isVip: async () => false });

let profile = { email: 'gina@gmail.com', name: 'Gina' };
const mails = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200 });
  if (/oauth2\.googleapis\.com\/token/.test(u)) return json({ access_token: 'at' });
  if (/oauth2\/v3\/userinfo/.test(u)) return json({ email: profile.email, email_verified: true, name: profile.name });
  if (/api\.resend\.com\/emails/.test(u)) { const b = JSON.parse(String(opts.body)); mails.push({ to: b.to[0], subject: b.subject, html: b.html }); return json({ id: 'm' + mails.length }); }
  return json({}, 404);
};

const auth = require(rp('api/_lib/auth.js'));
const googleCb = require(rp('api/_lib/auth-google-callback.js'));
const oauthClaim = require(rp('api/_lib/oauth-claim.js'));
const phoneLink = require(rp('api/_lib/phone-link.js'));

let ipSeq = 0;
const freshIp = () => '10.' + (Math.floor(++ipSeq / 250) % 250) + '.' + (ipSeq % 250) + '.7';
const call = (body, ip) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  auth({ method: 'POST', headers: ip ? { 'x-forwarded-for': ip } : {}, query: {}, body }, res);
});
const STATE = (n) => (n.toString(16).padStart(2, '0')).repeat(16);
// دخول Google من الويب: الجلسة تُقرأ من الإيداع تحت state (قائم قبل الإصلاح وبعده) لا من الرابط.
async function googleLogin(email, state, ip) {
  profile = { email, name: email.split('@')[0].replace(/^./, (c) => c.toUpperCase()) };
  const r = { writeHead(c, h) { this.code = c; this.headers = h; }, end() {} };
  await googleCb({ query: { code: 'c', state }, headers: { 'x-forwarded-for': ip || '10.200.0.1' } }, r);
  const dep = store.has('db/oauth-claim/' + state) ? JSON.parse(store.get('db/oauth-claim/' + state)) : null;
  return { code: r.code, location: (r.headers || {}).Location || '', token: dep && dep.token, dep };
}
const claimCall = (body, ip) => new Promise((resolve) => {
  const res = { _s: 200, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); } };
  oauthClaim({ method: 'POST', headers: { 'x-forwarded-for': ip }, body }, res);
});
async function otpLogin(email, ip) {
  const rq = await call({ action: 'email-otp-request', email }, ip);
  assert.equal(rq.status, 200, 'طلب الرمز: ' + JSON.stringify(rq.body));
  const rec = JSON.parse(store.get('db/otp/' + email));
  return call({ action: 'email-otp-verify', email, otp: rec.otp }, ip);
}
// بريد مؤكَّد على حساب بكلمة مرور بمسار «حسابي» الحقيقيّ (رمز التغيير)
async function confirmEmail(user, token, email, ip) {
  const a = await call({ action: 'email-otp-request', purpose: 'change', token, email }, ip);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const otp = JSON.parse(store.get('db/otp-change/' + encodeURIComponent(user))).otp;
  const b = await call({ action: 'email-otp-verify', purpose: 'change', token, email, otp }, ip);
  assert.equal(b.status, 200, JSON.stringify(b.body));
}
async function signup(name, pass, ip) {
  const r = await call({ action: 'signup', username: name, password: pass }, ip || freshIp());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

test('srv-auth-2: حساب Google غيّر اسمه يدخل بزرّ Google إلى حسابه نفسه — لا حساب فارغ فوق الشاهد ولا ينقطع movedTo', async () => {
  store.clear();
  const first = await googleLogin('gina@gmail.com', STATE(1));
  assert.equal(auth.verifyToken(first.token), 'g_gina@gmail.com');
  // «حفظ» في «حسابي» على الاسم المعبّأ (Gina) يكفي لتغيير المفتاح
  const mv = await call({ action: 'changeUsername', token: first.token, newUsername: 'Gina' });
  assert.equal(mv.status, 200, JSON.stringify(mv.body));
  const live = await auth.getUser('gina'); live.points = 999; live.plan = 'pro'; await auth.putUser('gina', live);
  const again = await googleLogin('gina@gmail.com', STATE(2));
  assert.equal(again.code, 302);
  assert.equal(auth.verifyToken(again.token), 'gina', 'الرمز لحسابه الحقيقيّ الذي غيّر اسمه');
  assert.deepEqual(await auth.getUser('g_gina@gmail.com'), { deleted: true, movedTo: 'gina' }, 'الشاهد باقٍ كما هو — الشحن يتبعه');
  assert.equal((await auth.getUser('gina')).points, 999);
  assert.equal(again.dep.user, 'Gina');
});

test('srv-auth-2: شاهد يقود إلى حساب بريده غير بريد Google لا يُكتب فوقه (account_conflict)، والحذف الحقيقيّ بعد التغيير يبقى كما كان', async () => {
  store.clear();
  const f = await googleLogin('omar@gmail.com', STATE(3));
  assert.equal((await call({ action: 'changeUsername', token: f.token, newUsername: 'omar77' })).status, 200);
  const u = await auth.getUser('omar77'); u.email = 'other@mail.com'; u.verifiedEmail = 'other@mail.com'; await auth.putUser('omar77', u);
  const r = await googleLogin('omar@gmail.com', STATE(4));
  assert.match(r.location, /gerror=account_conflict/, r.location);
  assert.deepEqual(await auth.getUser('g_omar@gmail.com'), { deleted: true, movedTo: 'omar77' });
  // حذف حقيقيّ في آخر السلسلة: الكولباك ينشئ حسابًا جديدًا كما كان (قرار الحذف)
  const f2 = await googleLogin('sara@gmail.com', STATE(5));
  assert.equal((await call({ action: 'changeUsername', token: f2.token, newUsername: 'sara9' })).status, 200);
  await auth.putUser('sara9', { deleted: true, deletedAt: Date.now(), selfDeleted: true });
  const r2 = await googleLogin('sara@gmail.com', STATE(6));
  assert.equal(auth.verifyToken(r2.token), 'g_sara@gmail.com');
  assert.equal((await auth.getUser('g_sara@gmail.com')).googleAuth, true);
});

test('srv-auth-4: الدخول برمز البريد يصل حساب Google بالبريد نفسه، والحساب الذي غيّر اسمه، ولا يتكرّر الحساب الجديد بعد تغيير البريد', async () => {
  store.clear();
  // (أ) حساب Google بلا فهرس بريد
  await googleLogin('gina@gmail.com', STATE(7));
  const a = await otpLogin('gina@gmail.com', freshIp());
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(auth.verifyToken(a.body.token), 'g_gina@gmail.com', 'حسابه لا gina_xxxxxx جديد');
  assert.equal(a.body.isNew, false);
  // (ج) حساب أكّد بريده ثمّ غيّر اسمه
  const lt = await signup('layla', 'layla-pass-1');
  await confirmEmail('layla', lt, 'layla@mail.com', freshIp());
  const mv = await call({ action: 'changeUsername', token: lt, newUsername: 'layla2' });
  assert.equal(mv.status, 200);
  const c1 = await otpLogin('layla@mail.com', freshIp());
  assert.equal(auth.verifyToken(c1.body.token), 'layla2', JSON.stringify(c1.body));
  // (ب) بريد تغيّر: القديم حرّ، والحساب الجديد له واحد لا جديد في كلّ دخول
  const ot = await signup('olda', 'olda-pass-12');
  await confirmEmail('olda', ot, 'old@mail.com', freshIp());
  await confirmEmail('olda', ot, 'new@mail.com', freshIp());
  const idx = JSON.parse(store.get('db/email-index/old@mail.com') || 'null');
  assert.ok(!idx || idx.username !== 'olda', 'فهرس البريد القديم لا يبقى على الحساب بعد تغييره');
  const b1 = await otpLogin('old@mail.com', freshIp());
  const b2 = await otpLogin('old@mail.com', freshIp());
  assert.equal(b1.status, 200); assert.equal(b2.status, 200);
  assert.equal(auth.verifyToken(b2.body.token), auth.verifyToken(b1.body.token), 'الدخول الثاني يصل الحساب نفسه');
  assert.equal(b2.body.isNew, false);
});

test('srv-auth-5: بعد تغيير الاسم يعمل الدخول بالإيميل والاسترجاع بالإيميل وبالهاتف', async () => {
  store.clear(); mails.length = 0;
  const t = await signup('laylab', 'laylab-pass-1');
  await confirmEmail('laylab', t, 'laylab@mail.com', freshIp());
  const u = await auth.getUser('laylab'); u.phone = '+971500000001'; await auth.putUser('laylab', u);
  store.set('db/phone-index/+971500000001', JSON.stringify({ username: 'laylab', at: Date.now() }));
  assert.equal((await call({ action: 'changeUsername', token: t, newUsername: 'laylab2' })).status, 200);
  const li = await call({ action: 'login', username: 'laylab@mail.com', password: 'laylab-pass-1' }, freshIp());
  assert.equal(li.status, 200, 'الدخول بالإيميل وكلمة المرور الصحيحة: ' + JSON.stringify(li.body));
  assert.equal(auth.verifyToken(li.body.token), 'laylab2');
  mails.length = 0;
  const fp = await call({ action: 'forgotPassword', email: 'laylab@mail.com' }, freshIp());
  assert.equal(fp.status, 200);
  assert.equal(mails.filter((m) => m.to === 'laylab@mail.com').length, 1, 'رسالة الاسترجاع وصلت');
  const owner = await phoneLink.phoneOwner('+971500000001');
  assert.ok(owner, 'الاسترجاع بالهاتف يجد صاحبه');
  assert.equal(owner.key, 'laylab2');
});

test('srv-auth-7: «نسيت كلمة المرور» باسم المستخدم محدود — لا إغراق لصندوق الضحيّة ولا إبطال متواصل لرابطها', async () => {
  store.clear(); mails.length = 0;
  const t = await signup('victim7', 'victim7-pass');
  await confirmEmail('victim7', t, 'victim7@mail.com', freshIp());
  mails.length = 0;
  const res = [];
  for (let i = 0; i < 6; i++) res.push((await call({ action: 'forgotPassword', username: 'victim7' }, freshIp())).status);
  assert.equal(mails.filter((m) => m.to === 'victim7@mail.com').length, 3, 'ثلاث رسائل في ربع الساعة كفرع الإيميل: ' + res.join(','));
  assert.equal(res.filter((s) => s === 429).length, 3);
  // الفرعان يتشاركان العدّاد: بعد الثلاث بالاسم يقف فرع الإيميل للبريد نفسه
  assert.equal((await call({ action: 'forgotPassword', email: 'victim7@mail.com' }, freshIp())).status, 429);
  // حدّ للشبكة الواحدة عبر الأسماء
  const net = freshIp();
  const st = [];
  for (let i = 0; i < 35; i++) st.push((await call({ action: 'forgotPassword', username: 'nobody' + i }, net)).status);
  assert.ok(st.includes(429), 'شبكة واحدة لا تستطلع بلا حدّ: ' + st.join(','));
  assert.equal(st.filter((x) => x !== 429).length, 30, 'ثلاثون في ربع الساعة لكلّ شبكة');
});

test('srv-auth-8: تغيير كلمة المرور أو استعادتها يُبطل الجلسات القديمة — verify لا يجدّد الرمز القديم، والجهاز نفسه يأخذ رمزًا جديدًا', async () => {
  store.clear(); mails.length = 0;
  const t0 = await signup('sami8', 'sami8-pass-1');
  const leaked = (await call({ action: 'login', username: 'sami8', password: 'sami8-pass-1' }, freshIp())).body.token;
  const cp = await call({ action: 'changePassword', token: t0, currentPassword: 'sami8-pass-1', newPassword: 'sami8-pass-2' });
  assert.equal(cp.status, 200);
  assert.ok(cp.body.token, 'الجهاز الذي غيّر كلمة المرور يبقى داخلًا برمز جديد');
  const old = await call({ action: 'verify', token: leaked }, freshIp());
  assert.equal(old.status, 401, 'الرمز القديم لا يُجدَّد: ' + JSON.stringify(old.body));
  assert.equal((await call({ action: 'verify', token: t0 }, freshIp())).status, 401);
  const ok = await call({ action: 'verify', token: cp.body.token }, freshIp());
  assert.equal(ok.status, 200);
  assert.equal(auth.verifyToken(ok.body.token), 'sami8');
  assert.equal((await call({ action: 'verify', token: ok.body.token }, freshIp())).status, 200, 'الرمز المجدَّد صالح');
  // الرمز القديم لا يغيّر الاسم ولا يربط بريدًا
  assert.equal((await call({ action: 'changeUsername', token: leaked, newUsername: 'thief8' })).status, 401);
  assert.equal(await auth.getUser('thief8', 1), null);
  // الاسترجاع بالرابط كذلك
  await confirmEmail('sami8', ok.body.token, 'sami8@mail.com', freshIp());
  const before = ok.body.token;
  mails.length = 0;
  assert.equal((await call({ action: 'forgotPassword', username: 'sami8' }, freshIp())).status, 200);
  const rt = decodeURIComponent(/resetToken=([^&"]+)/.exec(mails[0].html)[1]);
  const rs = await call({ action: 'resetWithToken', username: 'sami8', resetToken: rt, newPassword: 'sami8-pass-3' }, freshIp());
  assert.equal(rs.status, 200);
  assert.equal((await call({ action: 'verify', token: before }, freshIp())).status, 401);
  assert.equal((await call({ action: 'verify', token: rs.body.token }, freshIp())).status, 200);
});

test('srv-auth-9: طلب رمز البريد محدود لكلّ شبكة، وسقف يوميّ عامّ لرسائل المصادقة', async () => {
  store.clear(); mails.length = 0;
  const net = freshIp();
  const st = [];
  for (let i = 0; i < 40; i++) st.push((await call({ action: 'email-otp-request', email: 'spam' + i + '@mail.com' }, net)).status);
  assert.ok(st.includes(429), 'شبكة واحدة لا ترسل لآلاف العناوين: ' + st.join(','));
  assert.equal(mails.length, 30, 'ثلاثون رسالة في ربع الساعة لكلّ شبكة (مكتب بعشرين موظّفًا يمرّ — otp-lockout ٦)');
  store.clear(); mails.length = 0;
  process.env.AUTH_MAIL_DAY_CAP = '4';
  try {
    for (let i = 0; i < 7; i++) await call({ action: 'email-otp-request', email: 'far' + i + '@mail.com' }, freshIp());
    assert.equal(mails.length, 4, 'السقف العامّ يوقف الإرسال من شبكات متفرّقة');
  } finally { delete process.env.AUTH_MAIL_DAY_CAP; }
});

test('srv-auth-10: رمز الجلسة لا يمرّ في رابط الصفحة بعد دخول Google على الويب — يُستلم بـoauth-claim برمز استلام لمرّة واحدة', async () => {
  store.clear();
  const st = STATE(9);
  const r = await googleLogin('web@gmail.com', st, '10.50.0.1');
  assert.equal(r.code, 302);
  const loc = new URL(r.location);
  assert.equal(loc.searchParams.get('gtoken'), null, 'لا رمز جلسة في الرابط: ' + r.location);
  assert.ok(!r.location.includes(r.token), 'نصّ الرمز غائب عن الرابط');
  const claim = loc.searchParams.get('gclaim');
  assert.match(String(claim), /^[0-9a-f]{32}$/);
  assert.equal(loc.searchParams.get('gstate'), st);
  // رمز الاستلام وحده لا يكفي لغير الإيداع، ومن غير الشبكة بلا رمز الاستلام لا جلسة
  const wrong = await claimCall({ state: st, claim: 'ab'.repeat(16) }, '10.99.0.1');
  assert.equal(wrong.body.token, undefined, 'رمز استلام خاطئ من شبكة أخرى لا يسلّم جلسة');
  // إيداع جديد، ثمّ المتصفّح نفسه (Private Relay = شبكة أخرى) برمز الاستلام
  const r2 = await googleLogin('web@gmail.com', STATE(10), '10.50.0.1');
  const c2 = new URL(r2.location).searchParams.get('gclaim');
  const got = await claimCall({ state: STATE(10), claim: c2 }, '10.77.0.1');
  assert.equal(got.status, 200);
  assert.equal(auth.verifyToken(got.body.token), 'g_web@gmail.com');
  assert.equal((await claimCall({ state: STATE(10), claim: c2 }, '10.77.0.1')).status, 404, 'استلام واحد');
});

// العميل: checkGoogleAuthUrl وجسر oauthClaimBridge الحقيقيّان في vm، وoauth-claim الحقيقيّ خلف fetch.
function clientBlocks() {
  const src = fs.readFileSync(path.join(root, 'js/app-01-boot-auth.js'), 'utf8');
  const block = (head) => { const i = src.indexOf(head); assert.ok(i > 0, 'مفقود: ' + head); return src.slice(i, src.indexOf('\n  })();', i) + 8); };
  const pre = (src.match(/^ {2}let __oauthPick = .*$/m) || [''])[0];
  return pre + '\n' + block('  (function checkGoogleAuthUrl(){') + '\n' + block('  (function oauthClaimBridge(){');
}
async function runClient(q, lsInit, ssInit) {
  const ls = new Map(lsInit), ss = new Map(ssInit);
  const seen = { set: {}, authed: null, errors: [], claimed: 0 };
  const pending = [];
  const history = { replaceState() {} };
  const ctx = {
    console, URLSearchParams, JSON, Date, Number, String, Promise, Array, AbortSignal,
    setTimeout: (f) => { pending.push(f); return 1; }, setInterval: () => 1, clearInterval() {},
    window: { location: { search: q, origin: 'https://example.test', pathname: '/' }, addEventListener() {}, history },
    history, document: { title: '', addEventListener() {}, visibilityState: 'visible' },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) },
    noteSession() {}, alert: (m) => seen.errors.push('alert'), __swallow() {},
    authSet: (k, v) => { seen.set[k] = v; }, authGet: (k) => seen.set[k] || null,
    onAuthed: (u) => { seen.authed = u; }, showGoogleAuthError: (e) => seen.errors.push(e),
    fetch: async (url, opts) => {
      assert.match(String(url), /action=oauth-claim/);
      const out = await claimCall(JSON.parse(opts.body), '10.61.0.9'); // شبكة أخرى (Private Relay)
      if (out.body && out.body.token) seen.claimed++;
      return { ok: out.status >= 200 && out.status < 300, json: async () => out.body };
    },
  };
  vm.runInNewContext(clientBlocks(), ctx);
  for (let i = 0; i < 20; i++) { await new Promise((z) => setImmediate(z)); while (pending.length) pending.shift()(); }
  return seen;
}
test('srv-auth-10: العميل يكمل دخول Google على الويب برمز الاستلام ولو تغيّرت الشبكة، ويرفض state غريبة', async () => {
  store.clear();
  const st = STATE(11);
  const r = await googleLogin('client@gmail.com', st, '10.60.0.1');
  const q = new URL(r.location).search;
  const seen = await runClient(q, [['aiapp_oauth_pending', st + ':' + Date.now()]], [['aiapp_oauth_state', st]]);
  assert.deepEqual(seen.errors, []);
  assert.equal(seen.claimed, 1, 'الجلسة وصلت بـoauth-claim لا من الرابط');
  assert.equal(seen.authed, 'Client');
  assert.equal(auth.verifyToken(seen.set.aiapp_auth_token), 'g_client@gmail.com');
  // state لم يبدأها هذا التبويب (رابط مهاجم): رفض كما كان، ولا استلام
  const r2 = await googleLogin('client@gmail.com', STATE(12), '10.60.0.1');
  const bad = await runClient(new URL(r2.location).search, [], [['aiapp_oauth_state', STATE(13)]]);
  assert.deepEqual(bad.errors, ['alert']);
  assert.equal(bad.claimed, 0);
  assert.equal(bad.authed, null);
  assert.ok(store.has('db/oauth-claim/' + STATE(12)), 'الإيداع لم يُستلم');
});

test('srv-auth-11: تخمين رمز البريد عبر رموز متتالية يقف عند حدّ للبريد نفسه — والشبكة المعروفة لصاحبه تدخل', async () => {
  store.clear();
  const t = await signup('target11', 'target11-pass');
  await confirmEmail('target11', t, 'target11@mail.com', freshIp());
  let evaluated = 0, blocked = 0;
  for (let round = 0; round < 6; round++) {
    for (const k of [...store.keys()]) if (k.startsWith('db/rl/otp-rate/')) store.delete(k); // كأنّ خمس دقائق مضت
    const rq = await call({ action: 'email-otp-request', email: 'target11@mail.com' }, freshIp());
    assert.equal(rq.status, 200, JSON.stringify(rq.body));
    const real = JSON.parse(store.get('db/otp/target11@mail.com')).otp;
    const wrongCode = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await call({ action: 'email-otp-verify', email: 'target11@mail.com', otp: wrongCode }, freshIp());
      if (r.status === 429) blocked++; else evaluated++;
    }
  }
  assert.ok(evaluated <= 20, 'تخمينات قُيّمت: ' + evaluated);
  assert.ok(blocked > 0);
  for (const k of [...store.keys()]) if (k.startsWith('db/rl/otp-rate/')) store.delete(k);
  await call({ action: 'email-otp-request', email: 'target11@mail.com' }, freshIp());
  const real = JSON.parse(store.get('db/otp/target11@mail.com')).otp;
  const stranger = await call({ action: 'email-otp-verify', email: 'target11@mail.com', otp: real }, freshIp());
  assert.equal(stranger.status, 429, 'الرمز الصحيح من شبكة غريبة أثناء الهجوم لا يُقيَّم: ' + JSON.stringify(stranger.body));
  const home = '10.123.0.5';
  await auth.markKnownNet('target11', { headers: { 'x-forwarded-for': home } });
  const mine = await call({ action: 'email-otp-verify', email: 'target11@mail.com', otp: real }, home);
  assert.equal(mine.status, 200, 'صاحب الحساب من شبكته المعروفة: ' + JSON.stringify(mine.body));
  assert.equal(auth.verifyToken(mine.body.token), 'target11');
});

test('srv-auth-13: أخطاء auth برمز ثابت، والاحتياط إنجليزيّ لكلّ لغة غير العربيّة', async () => {
  store.clear();
  await signup('nadia13', 'nadia13-pass');
  const AR = /[؀-ۿ]/;
  const cases = [
    [{ action: 'login', username: 'nadia13', password: 'wrong-pass-1', lang: 'fr' }, 'bad_credentials'],
    [{ action: 'signup', username: 'nadia13', password: 'other-pass-1', lang: 'ur' }, 'name_taken'],
    [{ action: 'signup', username: 'admin', password: 'other-pass-1', lang: 'es' }, 'name_reserved'],
    [{ action: 'signup', username: 'ab', password: 'x', lang: 'tr' }, 'signup_short'],
    [{ action: 'verify', token: 'bad.token', lang: 'zh' }, 'session'],
    [{ action: 'changePassword', token: auth.makeToken('nadia13'), currentPassword: 'nope-nope-1', newPassword: 'new-pass-123', lang: 'ru' }, 'pw_wrong'],
    [{ action: 'forgotPassword', username: 'ghost13', lang: 'hi' }, 'not_found'],
    [{ action: 'forgotPassword', username: 'nadia13', lang: 'bn' }, 'no_recovery'],
    [{ action: 'resetWithToken', username: 'nadia13', resetToken: 'x', newPassword: 'new-pass-123', lang: 'id' }, 'reset_bad'],
    [{ action: 'email-otp-verify', email: 'n@mail.com', otp: '123456', lang: 'fil' }, 'bad_otp'],
  ];
  for (const [body, code] of cases) {
    const r = await call(body, freshIp());
    assert.equal(r.body.code, code, body.action + ': ' + JSON.stringify(r.body));
    assert.ok(!AR.test(String(r.body.error)), body.lang + ' لا يرى العربيّة: ' + r.body.error);
  }
  const ar = await call({ action: 'login', username: 'nadia13', password: 'wrong-pass-1', lang: 'ar' }, freshIp());
  assert.ok(AR.test(ar.body.error), 'العربيّة كما هي');
  const none = await call({ action: 'login', username: 'nadia13', password: 'wrong-pass-1' }, freshIp());
  assert.ok(AR.test(none.body.error), 'بلا lang = العربيّة كما كانت');
});

test('srv-auth-13: الواجهة تترجم رمز الخطأ بلغتها قبل العرض (axAuthL10n)، ونصّ الخادم احتياط', () => {
  const src = fs.readFileSync(path.join(root, 'js/app-01-boot-auth.js'), 'utf8');
  const i = src.indexOf('  function axAuthL10n(d){');
  assert.ok(i > 0, 'المترجم موجود');
  const fn = src.slice(i, src.indexOf('\n  }\n', i) + 4);
  const map = (src.match(/^ {2}const AX_AUTH_KEYS = \{[\s\S]*?\};$/m) || [''])[0];
  assert.ok(map, 'خريطة الرموز');
  const dict = { axAuthBadCredentials: 'Identifiants incorrects', acctEmailTooMany: 'Trop de tentatives — réessayez dans {minutes} min', axAuthForgotSentTo: 'Lien envoyé à {email}',
    axAuthMailFailed: 'Échec de l’envoi', axAuthMailOff: 'Service d’e-mail non configuré' };
  const ctx = { curT: () => dict, __swallow() {}, window: {} };
  vm.runInNewContext(map + '\n' + fn + '\nthis.L = axAuthL10n;', ctx);
  assert.equal(ctx.L({ error: 'اسم المستخدم أو الإيميل أو كلمة المرور غير صحيحة', code: 'bad_credentials' }).error, 'Identifiants incorrects');
  assert.equal(ctx.L({ error: 'x', code: 'too_many', minutes: 7 }).error, 'Trop de tentatives — réessayez dans 7 min');
  assert.equal(ctx.L({ ok: true, message: 'm', code: 'forgot_sent_to', masked: 'la***@mail.com' }).message, 'Lien envoyé à la***@mail.com');
  assert.equal(ctx.L({ error: 'Account not found', code: 'not_found' }).error, 'Account not found', 'بلا مفتاح في القاموس = نصّ الخادم');
  assert.equal(ctx.L({ error: 'plain' }).error, 'plain');
  // مراجعة: mail_off تشخيص «خدمة البريد غير مهيأة» المقصود — لا يذوب في «تعذّر الإرسال» العامّة بأيّ لغة
  assert.equal(ctx.L({ error: 'x', code: 'mail_failed' }).error, 'Échec de l’envoi');
  assert.equal(ctx.L({ error: 'Mail service is not configured — contact the app admin', code: 'mail_off' }).error, 'Service d’e-mail non configuré');
  delete dict.axAuthMailOff;
  assert.equal(ctx.L({ error: 'Mail service is not configured — contact the app admin', code: 'mail_off' }).error, 'Mail service is not configured — contact the app admin', 'mail_off بلا مفتاحه = نصّ الخادم لا الرسالة العامّة');
  // كلّ ردّ auth يُعرض نصّه يمرّ بالمترجم
  for (const head of ["body: JSON.stringify({ action: 'forgotPassword'", "body: JSON.stringify({ action: 'resetWithToken'", "body: JSON.stringify({ action: mode, username, password",
    "body: JSON.stringify({ action: 'setAvatar'", "body: JSON.stringify({ action: 'changeUsername'", "body: JSON.stringify({ action: 'changePassword'"]) {
    const j = src.indexOf(head);
    assert.ok(j > 0, head);
    assert.ok(/axAuthL10n(\(| : \(x\) => x\)\()await res\.json\(\)\)/.test(src.slice(j, j + 400)), head);
  }
  assert.ok(/action: 'resetWithToken', username, resetToken: window\.__pendingResetToken, newPassword: password, lang:/.test(src), 'طلب الاسترجاع يرسل لغته');
  assert.ok(/action: 'changePassword', token, currentPassword: curPass, newPassword: newPass, lang:/.test(src), 'تغيير كلمة المرور يرسل لغته');
  assert.ok(src.includes("if(data.token) authSet('aiapp_auth_token', data.token); // v-audit-auth (srv-auth-8)"), 'الجهاز نفسه يحفظ رمزه الجديد بعد تغيير كلمة المرور');
  const otp = src.slice(src.indexOf('(function emailOtpSystem(){'));
  assert.equal((otp.match(/window\.axAuthL10n \? window\.axAuthL10n\(await r\.json\(\)\)/g) || []).length, 2, 'رمز البريد: الطلب والتحقّق');
});
