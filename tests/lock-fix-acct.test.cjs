// tests/lock-fix-acct.test.cjs — v-lock-acct (باب بيانات المستخدمين والمال، موافقة المالك ٢٧ أكتوبر: «صلح الخطير وابدا فيهم كلهم»).
// حذف الحساب وVIP على المعالجات الحقيقيّة (auth، auth-google-callback، account-delete، share، _vip)؛ Redis وحده في الذاكرة،
// والبريد وGoogle وStripe مزيّفة (لا نداء حقيقيّ ولا إنفاق).
//   srv-auth-1     حذف الحساب يطابق المشاركات بمالكها (owner) لا بالاسم المعروض في «استكشف» — فلا يمحو مشاركات غيره.
//   pages-static-3 ويمحو مشاركاته كلّها: العامّة لحساب Google (اسمه المعروض غير مفتاحه)، والخاصّة، وما نشره قبل تغيير اسمه.
//   srv-auth-3     حساب Google وحساب «رمز البريد» يحذفان نفسيهما: الاسم المعروض يكفي تأكيدًا، ولا كلمة مرور لم يضعها صاحبها.
//   srv-auth-12    VIP يتبع الحساب عند تغيير اسمه.
// المراجعة العدائيّة (lock-fix/acct-r): عطل نقل عابر في قراءة مشاركة له = لا حذف (kv.js الحقيقيّ)؛ من وضع كلمته بالاسترجاع قبل العلامة
// تُطلب منه؛ مفتاح Google في VIP ينتقل ولا يرجع بالعودة إليه؛ عطب قائمة VIP عند التغيير يُسجَّل.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

process.env.AUTH_SECRET = 'lock-acct-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
process.env.RESEND_API_KEY = 're_test_dummy';
process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';
process.env.SITE_URL = 'https://example.test';
process.env.OMRAN_TEST_FAST_SLEEP = '1';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
const fail = { list: null, vipWrite: false, vipRead: false }; // أعطال مزروعة
const kvImpl = {
  // vipRead: عطل نقل في القراءة الصارمة (kv.js الحقيقيّ يرميه مع { strict: true } ويبتلعه بدونه)
  kvGetJSON: async (k, opts) => { if (fail.vipRead && k === 'vip_users' && opts && opts.strict) throw new Error('kv down'); try { return store.has(k) ? JSON.parse(store.get(k)) : null; } catch (e) { return null; } },
  kvPutJSON: async (k, v) => { if (fail.vipWrite && k === 'vip_users') throw new Error('kv down'); store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvIncrBy: async (k, n) => { const v = Number(store.get(k) || 0) + Number(n); store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => { if (fail.list && p.startsWith(fail.list)) throw new Error('scan down'); return [...store.keys()].filter((k) => k.startsWith(p)); },
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
const logs = []; // وسوم logError — عطب لا يُبتلع بصمت
mock('api/_lib/log-error.js', { logError: (tag) => { logs.push(String(tag)); }, logErrorAndFlush: async () => {} });
const renewCalls = [];
mock('api/_lib/create-checkout-session.js', { autoRenewToggle: async (req, res) => { renewCalls.push(req.body.on); res.status(200).json({ ok: true, subs: 0, on: false }); } });

const mail = {};
let googleProfile = null;
// Upstash مزيّف خلف kv.js الحقيقيّ (اختبارات المراجعة وحدها — الباقي على المخزن أعلاه): GET لمفتاح في upFailGet يُردّ ٤٢٩
const upstash = new Map();
const upFailGet = new Set();
function upstashReply(args) {
  const [cmd, k] = args;
  if (cmd === 'GET' && upFailGet.has(k)) return new Response(JSON.stringify({ error: 'ERR max requests limit exceeded' }), { status: 429 });
  let result = null;
  if (cmd === 'GET') result = upstash.has(k) ? upstash.get(k) : null;
  else if (cmd === 'SET') { upstash.set(k, String(args[2])); result = 'OK'; }
  else if (cmd === 'DEL') result = upstash.delete(k) ? 1 : 0;
  else if (cmd === 'INCR') { result = Number(upstash.get(k) || 0) + 1; upstash.set(k, String(result)); }
  else if (cmd === 'EXPIRE') result = 1;
  else if (cmd === 'SCAN') { const pre = String(args[3]).slice(0, -1).replace(/\\(.)/g, '$1'); result = ['0', [...upstash.keys()].filter((x) => x.startsWith(pre))]; }
  return new Response(JSON.stringify({ result }), { status: 200 });
}
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('https://redis.invalid')) return upstashReply(JSON.parse(opts.body));
  if (/resend\.com/.test(u)) {
    const b = JSON.parse(opts.body);
    const mm = String(b.html).match(/>(\d{6})</);
    mail[b.to[0]] = { code: mm && mm[1] };
    return new Response('{"id":"m"}', { status: 200 });
  }
  if (u.includes('oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'at' }) };
  if (u.includes('googleapis.com/oauth2/v3/userinfo')) return { ok: true, json: async () => googleProfile };
  return new Response('{}', { status: 404 });
};

const auth = require(rp('api/_lib/auth.js'));
const googleCb = require(rp('api/_lib/auth-google-callback.js'));
const { createShare, displayNameOf } = require(rp('api/_lib/share.js'));
const vipList = require(rp('api/_lib/_vip.js'));
const { deleteAccount } = require(rp('api/_lib/account-delete.js'));
const vipApi = require(rp('api/_lib/vip.js'));
// kv.js الحقيقيّ (لا المزيّف أعلاه) — يُحمَّل مرّة ثمّ يُعاد المزيّف إلى مكانه
const realKv = (() => { const f = rp('api/_lib/kv.js'); const saved = require.cache[f]; delete require.cache[f]; try { return require(f); } finally { require.cache[f] = saved; } })();

let ipN = 10;
const call = (body) => new Promise((resolve) => {
  const res = { _s: 200, setHeader() {}, status(c) { this._s = c; return this; }, json(b) { resolve({ status: this._s, body: b }); }, end() { resolve({ status: this._s }); } };
  Promise.resolve(auth({ method: 'POST', headers: { 'x-forwarded-for': '10.0.' + (ipN++ % 250) + '.1' }, query: {}, body }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
});
const user = (k) => auth.getUser(k, 1);
async function signup(name, pw) {
  const r = await call({ action: 'signup', username: name, password: pw || 'pass-' + name + '-1234' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}
async function googleLogin(email, name) {
  googleProfile = { email, email_verified: true, name, picture: null };
  const res = { code: 0, writeHead(c) { this.code = c; }, end() {}, setHeader() {}, status(c) { this.code = c; return this; }, json() {} };
  await googleCb({ query: { code: 'c', state: crypto.randomBytes(8).toString('hex') + '-app' }, headers: {} }, res);
  assert.equal(res.code, 302);
  const key = 'g_' + email;
  const rec = await user(key);
  assert.ok(rec && rec.googleAuth === true && rec.salt && rec.hash, 'سجلّ الكولباك الحقيقيّ: googleAuth وكلمة مرور عشوائيّة لا يعرفها صاحبها');
  return { key, token: auth.makeToken(key, rec.sv), shown: rec.username };
}
async function otpLogin(email) {
  assert.equal((await call({ action: 'email-otp-request', email, lang: 'ar' })).status, 200);
  const r = await call({ action: 'email-otp-verify', email, otp: mail[email].code, lang: 'ar' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const key = String(r.body.username).toLowerCase();
  const rec = await user(key);
  assert.ok(rec && rec.otpOnly === true && rec.salt && rec.hash, 'سجلّ رمز البريد الحقيقيّ: otpOnly وكلمة مرور عشوائيّة');
  return { key, token: r.body.token, shown: r.body.username };
}
async function share(ownerKey, isPublic) {
  const made = await createShare({ title: 't', code: '<p>' + ownerKey + '</p>', owner: ownerKey, username: await displayNameOf(ownerKey), isPublic });
  assert.ok(made.id);
  return made.id;
}
const shareKey = (id) => 'db/shares/' + id + '.json';
const exploreKeys = (id) => [...store.keys()].filter((k) => k.startsWith('db/explore/') && k.endsWith('_' + id + '.json'));
const del = (token, confirmUsername, password) => call({ action: 'deleteAccount', token, confirmUsername, password: password || '' });

// ─── srv-auth-1 ───────────────────────────────────────────────────────────────────────────────
test('srv-auth-1: حساب مجّانيّ باسم «Mohammed Ali» يحذف نفسه فلا تُمسّ مشاركة حساب Google الذي يحمل الاسم المعروض نفسه', async () => {
  const victim = await googleLogin('mo.victim@gmail.com', 'Mohammed Ali');
  const vid = await share(victim.key, true);
  assert.equal(exploreKeys(vid).length, 1);
  assert.equal(JSON.parse(store.get(exploreKeys(vid)[0])).username, 'Mohammed Ali', 'الفهرس يحمل الاسم المعروض');
  const tok = await signup('Mohammed Ali');
  const r = await del(tok, 'Mohammed Ali', 'pass-Mohammed Ali-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(store.has(shareKey(vid)), 'مشاركة الضحيّة باقية في db/shares');
  assert.equal(exploreKeys(vid).length, 1, 'ومدخلها في «استكشف» باقٍ');
});

test('srv-auth-1: حذف الحساب «sara» لا يمسّ مشاركات حساب Google اسمه المعروض «Sara»', async () => {
  const g = await googleLogin('sara.g@gmail.com', 'Sara');
  const gid = await share(g.key, true);
  const tok = await signup('sara');
  const own = await share('sara', true);
  const r = await del(tok, 'sara', 'pass-sara-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(store.has(shareKey(gid)) && exploreKeys(gid).length === 1, 'مشاركة Sara الأخرى باقية');
  assert.ok(!store.has(shareKey(own)) && exploreKeys(own).length === 0, 'ومشاركته هو مُحيت');
});

test('srv-auth-1: حساب «زائر» يحذف نفسه فلا يمحو مشاركات الاسم الافتراضيّ (ضيف الوكيل وحساب Google اسمه المعروض بريد)', async () => {
  const guest = await createShare({ title: 'g', code: '<p>guest</p>', owner: '', username: '', isPublic: true }); // نشر الوكيل لضيف: بلا owner
  const g = await googleLogin('anon.g@gmail.com', 'anon@mail.com'); // اسم فيه @ = يُعرض «زائر»
  const gid = await share(g.key, true);
  assert.equal(JSON.parse(store.get(shareKey(gid))).username, 'زائر');
  const tok = await signup('زائر');
  const r = await del(tok, 'زائر', 'pass-زائر-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(store.has(shareKey(guest.id)) && exploreKeys(guest.id).length === 1, 'مشاركة الضيف باقية');
  assert.ok(store.has(shareKey(gid)) && exploreKeys(gid).length === 1, 'ومشاركة حساب Google باقية');
});

test('srv-auth-1: سجلّ قديم بلا owner يُطابَق بمفتاح الحساب كما يفعل حذف المشاركة الواحدة — لا بالاسم المعروض في الفهرس', async () => {
  store.set('db/shares/legacy1.json', JSON.stringify({ id: 'legacy1', title: 't', code: 'x', username: 'olduser', createdAt: 5, public: true }));
  store.set('db/explore/5_legacy1.json', JSON.stringify({ id: 'legacy1', title: 't', username: 'olduser', createdAt: 5 }));
  store.set('db/shares/legacy2.json', JSON.stringify({ id: 'legacy2', title: 't', code: 'x', username: 'Olduser', createdAt: 6, public: true })); // اسم كتبه العميل قبل v-share-guard
  store.set('db/explore/6_legacy2.json', JSON.stringify({ id: 'legacy2', title: 't', username: 'Olduser', createdAt: 6 }));
  const tok = await signup('olduser');
  assert.equal((await del(tok, 'olduser', 'pass-olduser-1234')).status, 200);
  assert.ok(!store.has('db/shares/legacy1.json') && !store.has('db/explore/5_legacy1.json'), 'سجلّه القديم بمفتاحه مُحي');
  assert.ok(store.has('db/shares/legacy2.json') && store.has('db/explore/6_legacy2.json'), 'اسم لا يطابق المفتاح حرفيًّا لا يُنسب إليه');
});

test('srv-auth-1: تعذّر مسح المشاركات = لا حذف (لا إيقاف تجديد ولا محو) — و«تم حذف حسابك» لا تخرج والمشاركات باقية', async () => {
  const tok = await signup('scanfail');
  const sid = await share('scanfail', true);
  store.set('chats:scanfail', 'keep');
  const before = renewCalls.length;
  fail.list = 'db/shares/';
  let r;
  try { r = await del(tok, 'scanfail', 'pass-scanfail-1234'); } finally { fail.list = null; }
  assert.notEqual(r.status, 200);
  assert.equal(r.body.ok, false);
  assert.equal(renewCalls.length, before, 'التجديد لم يُمسّ');
  assert.ok(store.has('chats:scanfail') && store.has(shareKey(sid)) && !(await user('scanfail')).deleted, 'لم يُحذف شيء');
  assert.equal((await del(tok, 'scanfail', 'pass-scanfail-1234')).status, 200, 'إعادة المحاولة تنجح');
  assert.ok(!store.has(shareKey(sid)));
});

// ─── pages-static-3 ───────────────────────────────────────────────────────────────────────────
test('pages-static-3: حساب Google (g_<البريد> واسمه «Ahmed Ali») يحذف نفسه فتُمحى مشاركته العامّة من «استكشف» وdb/shares، والخاصّة أيضًا', async () => {
  const g = await googleLogin('ahmed@gmail.com', 'Ahmed Ali');
  // صاحبه وضع كلمة مرور بالاسترجاع (resetWithToken الحقيقيّ) — فيحذف بها حتّى على الأساس، والسؤال هنا عن المشاركات وحدها
  const rt = 'rt-ahmed';
  const rec = await user(g.key);
  rec.resetTokenHash = crypto.createHash('sha256').update(rt).digest('hex');
  rec.resetTokenExpiry = Date.now() + 60000;
  await auth.putUser(g.key, rec);
  const reset = await call({ action: 'resetWithToken', username: g.key, resetToken: rt, newPassword: 'ahmed-new-pass-1' });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  const pub = await share(g.key, true);
  const priv = await share(g.key, false);
  const other = await share('someone_else', true);
  const r = await del(reset.body.token, g.key, 'ahmed-new-pass-1');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!store.has(shareKey(pub)) && exploreKeys(pub).length === 0, 'العامّة مُحيت من الفهرس والسجلّ');
  assert.ok(!store.has(shareKey(priv)), 'والخاصّة مُحيت');
  assert.ok(store.has(shareKey(other)) && exploreKeys(other).length === 1, 'وغيره لم يُمسّ');
});

test('pages-static-3: مشاركة خاصّة لحساب بكلمة مرور تُمحى مع الحساب', async () => {
  const tok = await signup('privy');
  const priv = await share('privy', false);
  assert.equal(exploreKeys(priv).length, 0, 'الخاصّة بلا مدخل في «استكشف»');
  assert.equal((await del(tok, 'privy', 'pass-privy-1234')).status, 200);
  assert.ok(!store.has(shareKey(priv)), 'المشاركة الخاصّة باقية بعد «تم حذف حسابك»');
});

test('pages-static-3: ما نشره قبل تغيير اسمه (owner = الاسم القديم) يُمحى — والاسم القديم الذي لا يقود إليه لا يُنسب إليه', async () => {
  const tok0 = await signup('renamer');
  const before = await share('renamer', true);
  const r1 = await call({ action: 'changeUsername', token: tok0, newUsername: 'renamer2' });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const after = await share('renamer2', true);
  // prevUsernames مزوَّر يدّعي اسمًا حيًّا لغيره: شاهده لا يقود إليه فلا تُمسّ مشاركاته
  const tokV = await signup('victim77');
  const vshare = await share('victim77', true);
  const rec = await user('renamer2');
  rec.prevUsernames = (rec.prevUsernames || []).concat(['victim77']);
  await auth.putUser('renamer2', rec);
  const r = await del(r1.body.token, 'renamer2', 'pass-renamer-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!store.has(shareKey(before)) && exploreKeys(before).length === 0, 'مشاركة الاسم القديم مُحيت');
  assert.ok(!store.has(shareKey(after)) && exploreKeys(after).length === 0);
  assert.ok(store.has(shareKey(vshare)) && exploreKeys(vshare).length === 1, 'مشاركة حساب حيّ آخر باقية');
  assert.ok(tokV);
});

// ─── srv-auth-3 ───────────────────────────────────────────────────────────────────────────────
test('srv-auth-3: حساب Google من الكولباك الحقيقيّ يحذف نفسه بالاسم المعروض الذي تقارنه الواجهة، بلا كلمة مرور', async () => {
  const g = await googleLogin('gina@gmail.com', 'Gina Smith');
  assert.equal(g.shown, 'Gina Smith', 'aiapp_username في الواجهة = الاسم المعروض');
  store.set('chats:' + encodeURIComponent(g.key), 'x');
  const r = await del(g.token, 'Gina Smith', '');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.deepEqual(Object.keys(await user(g.key)).sort(), ['deleted', 'deletedAt', 'selfDeleted'], 'شاهد بلا بيانات');
  assert.ok(!store.has('chats:' + encodeURIComponent(g.key)));
});

test('srv-auth-3: حساب Google يحذف نفسه بمفتاحه أيضًا، واسم خاطئ يبقى مرفوضًا', async () => {
  const g = await googleLogin('gkey@gmail.com', 'G Key');
  assert.equal((await del(g.token, 'G Kei', '')).body.code, 'name_mismatch');
  assert.equal((await del(g.token, 'g_gkey@gmail.com', '')).status, 200);
});

test('srv-auth-3: حساب أنشأه رمز البريد (otpOnly) يحذف نفسه باسمه بلا كلمة مرور', async () => {
  const o = await otpLogin('otpuser@mail.com');
  const r = await del(o.token, o.shown, '');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await user(o.key)).deleted, true);
});

test('srv-auth-3: حساب Google غيّر اسمه (googleAuth ينتقل) يحذف نفسه بلا كلمة مرور', async () => {
  const g = await googleLogin('mover@gmail.com', 'Mover');
  const rn = await call({ action: 'changeUsername', token: g.token, newUsername: 'mover_new' });
  assert.equal(rn.status, 200, JSON.stringify(rn.body));
  assert.equal((await del(rn.body.token, 'mover_new', '')).status, 200);
});

test('srv-auth-3: من وضع كلمة مرور بنفسه (استرجاع) تُطلب منه — والمحاولات الخاطئة لها حدّها؛ وحساب كلمة المرور كما كان', async () => {
  const o = await otpLogin('setpw@mail.com');
  const rec = await user(o.key);
  rec.resetTokenHash = crypto.createHash('sha256').update('rt2').digest('hex');
  rec.resetTokenExpiry = Date.now() + 60000;
  await auth.putUser(o.key, rec);
  const reset = await call({ action: 'resetWithToken', username: o.key, resetToken: 'rt2', newPassword: 'otp-own-pass-1' });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await user(o.key)).passwordSet, true, 'العلامة تُضبط عند الاسترجاع');
  assert.equal((await del(reset.body.token, o.shown, '')).body.code, 'wrong_password');
  assert.equal((await del(reset.body.token, o.shown, 'otp-own-pass-1')).status, 200);
  // حساب قديم (قبل العلامة) غيّر كلمته بعد إصدار الجلسات (sv > 0): كلمة المرور مطلوبة أيضًا
  const g = await googleLogin('legacy.pw@gmail.com', 'Legacy');
  const lr = await user(g.key);
  lr.sv = 1;
  await auth.putUser(g.key, lr);
  assert.equal((await del(auth.makeToken(g.key, 1), 'Legacy', '')).body.code, 'wrong_password');
  // حساب التسجيل بكلمة مرور: كما كان
  const tok = await signup('pwuser');
  assert.equal((await del(tok, 'pwuser', '')).body.code, 'wrong_password');
  assert.equal((await del(tok, 'pwuser', 'pass-pwuser-1234')).status, 200);
});

// المراجعة: sv وpasswordSet لم يبلغا الإنتاج — السجلّ الذي وضع صاحبه كلمته بـresetWithToken على main يحمل resetTokenHash: null وحده
async function resetOnMain(key, pw) {
  const rec = await user(key);
  const { salt, hash } = auth.hashPassword(pw);
  Object.assign(rec, { salt, hash, resetTokenHash: null, resetTokenExpiry: null }); // ما يكتبه resetWithToken على main حرفيًّا
  delete rec.passwordSet; delete rec.sv;
  await auth.putUser(key, rec);
  return auth.makeToken(key);
}
test('srv-auth-3 (المراجعة): حساب Google ورمز البريد وضع صاحبه كلمته بالاسترجاع قبل العلامة (resetTokenHash: null، بلا sv) — رمز الجلسة والاسم لا يكفيان', async () => {
  const g = await googleLogin('reset.before@gmail.com', 'Gina Reset');
  const gt = await resetOnMain(g.key, 'gina-chosen-pass-1');
  const gr = await del(gt, 'Gina Reset', '');
  assert.equal(gr.body.code, 'wrong_password', JSON.stringify(gr.body));
  assert.ok(!(await user(g.key)).deleted, 'لم يُحذف');
  assert.equal((await del(gt, 'Gina Reset', 'gina-chosen-pass-1')).status, 200, 'بكلمته يحذف نفسه بالاسم المعروض');
  const o = await otpLogin('otp.reset.before@mail.com');
  const ot = await resetOnMain(o.key, 'otp-chosen-pass-1');
  assert.equal((await del(ot, o.shown, '')).body.code, 'wrong_password');
  assert.equal((await del(ot, o.shown, 'otp-chosen-pass-1')).status, 200);
});

test('srv-auth-3: changePassword يضبط العلامة أيضًا', async () => {
  const tok = await signup('chpw');
  const r = await call({ action: 'changePassword', token: tok, currentPassword: 'pass-chpw-1234', newPassword: 'chpw-new-pass-1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await user('chpw')).passwordSet, true);
});

// ─── srv-auth-12 ──────────────────────────────────────────────────────────────────────────────
async function addVip(id) { vipList.invalidateCache(); return vipList.addVip(id); }
const list = async () => (await vipList.getVipList({ fresh: true })).slice().sort();

test('srv-auth-12: VIP أضافه المالك باسمه يبقى VIP بعد تغيير الاسم — والقائمة تحمل الاسم الحاليّ', async () => {
  store.set('vip_users', JSON.stringify(['someone@x.com', 'other_vip']));
  vipList.invalidateCache();
  const tok = await signup('vipper');
  await addVip('vipper');
  const r = await call({ action: 'changeUsername', token: tok, newUsername: 'Vipper2' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await vipList.isVip('vipper2'), true, 'الاسم الجديد VIP');
  assert.deepEqual(await list(), ['other_vip', 'someone@x.com', 'vipper2'], 'الاسم القديم لا يبقى مدخلًا ثانيًا، وغيره لم يُمسّ');
  // الرجوع إلى الاسم القديم (سلسلة الشواهد) يعيده
  const back = await call({ action: 'changeUsername', token: r.body.token, newUsername: 'vipper' });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(await vipList.isVip('vipper'), true);
  assert.deepEqual(await list(), ['other_vip', 'someone@x.com', 'vipper']);
});

test('srv-auth-12: تغيير اسم غير VIP لا يمنح VIP ولا يمسّ القائمة', async () => {
  store.set('vip_users', JSON.stringify(['other_vip']));
  vipList.invalidateCache();
  const tok = await signup('plainuser');
  const r = await call({ action: 'changeUsername', token: tok, newUsername: 'plainuser2' });
  assert.equal(r.status, 200);
  assert.equal(await vipList.isVip('plainuser2'), false);
  assert.deepEqual(await list(), ['other_vip']);
});

test('srv-auth-12: تغييران متوازيان لاسم VIP واحد: واحد ينجح (قفل التغيير) والقائمة تحمل اسمًا واحدًا لا اثنين', async () => {
  store.set('vip_users', JSON.stringify([]));
  vipList.invalidateCache();
  const tok = await signup('racer');
  await addVip('racer');
  const [a, b] = await Promise.all([
    call({ action: 'changeUsername', token: tok, newUsername: 'racer_a' }),
    call({ action: 'changeUsername', token: tok, newUsername: 'racer_b' }),
  ]);
  const ok = [a, b].filter((x) => x.status === 200);
  assert.equal(ok.length, 1, JSON.stringify([a.status, b.status]));
  const won = ok[0].body.username.toLowerCase();
  assert.deepEqual(await list(), [won], 'مدخل واحد للحساب الحيّ');
});

test('srv-auth-12: حسابا VIP مختلفان يغيّران اسميهما معًا: لا يضيع أحدهما (قراءة القائمة ثمّ كتابتها على سلسلة واحدة)', async () => {
  store.set('vip_users', JSON.stringify([]));
  vipList.invalidateCache();
  const t1 = await signup('pair_one');
  const t2 = await signup('pair_two');
  await addVip('pair_one');
  await addVip('pair_two');
  const [a, b] = await Promise.all([
    call({ action: 'changeUsername', token: t1, newUsername: 'pair_one_x' }),
    call({ action: 'changeUsername', token: t2, newUsername: 'pair_two_x' }),
  ]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual(await list(), ['pair_one_x', 'pair_two_x']);
  // إعادة التغيير نفسه (ردّ معاد بعد النجاح): الاسم الحاليّ هو نفسه — لا مدخل ثانٍ
  const again = await call({ action: 'changeUsername', token: a.body.token, newUsername: 'pair_one_x' });
  assert.equal(again.status, 200);
  assert.deepEqual(await list(), ['pair_one_x', 'pair_two_x']);
});

test('srv-auth-12: عطل كتابة القائمة لا يُفشل تغيير الاسم (التغيير تمّ ولا رجعة فيه) ولا يمنح أحدًا VIP', async () => {
  store.set('vip_users', JSON.stringify([]));
  vipList.invalidateCache();
  const tok = await signup('vipfail');
  await addVip('vipfail');
  logs.length = 0;
  fail.vipWrite = true;
  let r;
  try { r = await call({ action: 'changeUsername', token: tok, newUsername: 'vipfail2' }); } finally { fail.vipWrite = false; }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await user('vipfail2')).username, 'vipfail2');
  assert.ok(logs.some((t) => /vip/.test(t)), 'عطب الكتابة يُسجَّل: ' + JSON.stringify(logs));
  assert.deepEqual(JSON.parse(store.get('vip_users')), ['vipfail'], 'القائمة كما كانت — لا كتابة نصفيّة');
});

test('srv-auth-12 (المراجعة): VIP حساب Google (أضافه المالك بإيميله فصار g_<البريد>) يتبعه — ولا يرجع بالعودة إلى مفتاح Google بعد أن يزيله المالك', async () => {
  store.set('vip_users', JSON.stringify(['someone@x.com']));
  vipList.invalidateCache();
  const OWNER = auth.makeToken('omran');
  const vip = (method, query, body) => new Promise((resolve) => {
    const res = { statusCode: 0, setHeader() {}, end(b) { resolve({ status: this.statusCode, body: JSON.parse(b || '{}') }); } };
    Promise.resolve(vipApi({ method, headers: {}, query: query || {}, body: body || {} }, res)).catch((e) => resolve({ status: 'throw', body: String(e) }));
  });
  const g = await googleLogin('gina.vip@gmail.com', 'Gina Vip');
  const add = await vip('POST', {}, { token: OWNER, id: 'gina.vip@gmail.com' });
  assert.equal(add.body.id, 'g_gina.vip@gmail.com', 'vip.js يحوّل الإيميل إلى مفتاح حساب Google');
  const r = await call({ action: 'changeUsername', token: g.token, newUsername: 'gina' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await vipList.isVip('gina'), true);
  assert.deepEqual(await list(), ['gina', 'someone@x.com'], 'مفتاح Google الميّت لا يبقى — والإيميل الخام لغيره باقٍ');
  // المالك يسحب VIP بالاسم الذي تعرضه القائمة
  assert.equal((await vip('DELETE', { token: OWNER, id: 'gina' })).status, 200);
  const back = await call({ action: 'changeUsername', token: r.body.token, newUsername: 'g_gina.vip@gmail.com' });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  vipList.invalidateCache();
  assert.equal(await vipList.isVip('g_gina.vip@gmail.com'), false, 'الرجوع إلى مفتاح Google لا يعيد ما سحبه المالك');
  assert.deepEqual(await list(), ['someone@x.com']);
});

test('srv-auth-12 (المراجعة): تعذّر قراءة القائمة الصارمة عند تغيير اسم VIP يُسجَّل — لا يسقط بصمت — ولا كتابة فوقها', async () => {
  store.set('vip_users', JSON.stringify(['vipread', 'other_vip']));
  vipList.invalidateCache();
  const tok = await signup('vipread');
  logs.length = 0;
  fail.vipRead = true;
  let r;
  try { r = await call({ action: 'changeUsername', token: tok, newUsername: 'vipread2' }); } finally { fail.vipRead = false; }
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(logs.some((t) => /vip/.test(t)), 'سطر في السجلّ: ' + JSON.stringify(logs));
  assert.deepEqual(JSON.parse(store.get('vip_users')), ['vipread', 'other_vip'], 'لا كتابة فوق قائمة لم تُقرأ');
});

// ─── المخزن المزيّف المباشر (account-delete.js وحده) ────────────────────────────────────────────
test('srv-auth-3 · srv-auth-1: deleteAccount مباشرةً — الاسم المعروض يطابق، وحساب كلمة المرور بلا كلمة مرفوض قبل أيّ محو', async () => {
  const kv = new Map();
  kv.set('db/shares/z.json', JSON.stringify({ id: 'z', owner: 'g_z@x.com', username: 'Zed', createdAt: 9, public: true }));
  kv.set('db/explore/9_z.json', JSON.stringify({ id: 'z', username: 'Zed', createdAt: 9 }));
  const users = new Map([['g_z@x.com', { username: 'Zed', email: 'z@x.com', googleAuth: true, salt: 'r', hash: 'ab' }], ['zed', { username: 'zed', salt: 's', hash: 'cd' }]]);
  const o = {
    kv: {
      kvGetRaw: async (k) => (kv.has(k) ? kv.get(k) : null),
      kvGetJSON: async (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null),
      kvDel: async (k) => { kv.delete(k); },
      kvList: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
      kvIncr: async () => 1, kvExpire: async () => {},
    },
    auth: { getUser: async (u) => (users.has(u) ? JSON.parse(JSON.stringify(users.get(u))) : null), putUser: async (u, r) => { users.set(u, r); } },
    autoRenewToggle: async (req, res) => res.status(200).json({ ok: true }),
  };
  assert.equal((await deleteAccount({ username: 'zed', token: 't', confirmUsername: 'zed', password: '' }, o)).body.code, 'wrong_password');
  assert.ok(kv.has('db/shares/z.json'));
  const r = await deleteAccount({ username: 'g_z@x.com', token: 't', confirmUsername: 'ZED ', password: '' }, o);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!kv.has('db/shares/z.json') && !kv.has('db/explore/9_z.json'));
});

test('pages-static-3 (المراجعة): عطل نقل عابر (٤٢٩ حدّ الطلبات) في قراءة مشاركة له = لا حذف (503 retry) — بـkv.js الحقيقيّ؛ والسجلّ التالف وحده يُتخطّى', async () => {
  upstash.clear();
  upFailGet.clear();
  const { salt, hash } = auth.hashPassword('sharer-pass-1');
  const users = new Map([['sharer', { username: 'sharer', salt, hash }]]);
  upstash.set('db/shares/s1.json', JSON.stringify({ id: 's1', title: 't', code: 'x', owner: 'sharer', username: 'sharer', createdAt: 1, public: true }));
  upstash.set('db/explore/1_s1.json', JSON.stringify({ id: 's1', title: 't', username: 'sharer', createdAt: 1 }));
  upstash.set('db/shares/o1.json', JSON.stringify({ id: 'o1', title: 't', code: 'x', owner: 'other', username: 'other', createdAt: 2, public: true }));
  upstash.set('db/shares/bad.json', '{not json'); // سجلّ تالف لغيره
  upstash.set('chats:sharer', '"keep"');
  const renew = [];
  const o = {
    kv: realKv,
    auth: { getUser: async (u) => (users.has(u) ? JSON.parse(JSON.stringify(users.get(u))) : null), putUser: async (u, r) => { users.set(u, r); } },
    autoRenewToggle: async (req, res) => { renew.push(req.body.on); res.status(200).json({ ok: true }); },
  };
  const input = { username: 'sharer', token: 't', confirmUsername: 'sharer', password: 'sharer-pass-1' };
  upFailGet.add('db/shares/s1.json');
  let r;
  try { r = await deleteAccount(input, o); } finally { upFailGet.clear(); }
  assert.notEqual(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, false);
  assert.equal(r.body.code, 'retry');
  assert.equal(renew.length, 0, 'التجديد لم يُمسّ');
  assert.ok(upstash.has('db/shares/s1.json') && upstash.has('db/explore/1_s1.json') && upstash.has('chats:sharer'), 'لم يُحذف شيء');
  assert.ok(!users.get('sharer').deleted, 'والحساب حيّ — يعيد المحاولة بجلسته');
  const r2 = await deleteAccount(input, o);
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.ok(!upstash.has('db/shares/s1.json') && !upstash.has('db/explore/1_s1.json') && !upstash.has('chats:sharer'), 'إعادة المحاولة تمحو مشاركته');
  assert.ok(upstash.has('db/shares/o1.json') && upstash.has('db/shares/bad.json'), 'مشاركة غيره والسجلّ التالف لم يُمسّا');
  assert.equal(users.get('sharer').deleted, true);
});
