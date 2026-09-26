// tests/account-guard.test.cjs — v-account-guard (طلب المالك ٢٦ سبتمبر: «حماية الحساب أوّل شي»):
// حدّ محاولات رمز الإيميل، القفل على (الحساب + الشبكة)، جلسة ٢٤ ساعة تتجدّد وتُبطَل،
// «الخروج من كلّ الأجهزة»، والتحقّق بخطوتين — اختياريّ للجميع وإلزاميّ للمالك في كلّ بوّابة.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

process.env.AUTH_SECRET = 'test-secret-account-guard';
process.env.UPSTASH_REDIS_REST_URL = 'http://local-test';
process.env.RESEND_API_KEY = 'test-resend';
delete process.env.OWNER_MFA_OFF;
const store = new Map();
const kvPath = require.resolve('../api/_lib/kv.js');
require.cache[kvPath] = { id: kvPath, filename: kvPath, loaded: true, exports: {
  kvGetJSON: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvDel: async (k) => { store.delete(k); },
  kvList: async () => [...store.keys()],
  kvIncr: async () => 1, kvExpire: async () => {}, kvIncrBy: async () => 1,
  kvDecrBy: async () => 1, kvSetIfAbsent: async () => true,
  kvGetRaw: async (k) => store.get(k) || null, kvSetRaw: async (k, v) => store.set(k, v),
} };
const realFetch = global.fetch;
global.fetch = async (url, opts) => (String(url).includes('resend.com') ? { ok: true, status: 200, json: async () => ({}) } : realFetch(url, opts));

const auth = require('../api/_lib/auth.js');
const session = require('../api/_lib/session.js');
const totp = require('../api/_lib/totp.js');
const { isOwner } = require('../api/_lib/_owner.js');

async function call(body, ip) {
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await auth({ method: 'POST', headers: { 'x-forwarded-for': ip || '1.1.1.1' }, body }, res);
  return res;
}
const nowCode = (secret) => totp.hotp(secret, Math.floor(Date.now() / 30000));
const nextCode = (secret) => totp.hotp(secret, Math.floor(Date.now() / 30000) + 1);
const payloadOf = (t) => JSON.parse(Buffer.from(String(t).split('.')[0], 'base64url').toString());

test('totp: متجه RFC 6238 المرجعيّ (SHA1، ٥٩ ثانية → 287082)', () => {
  const secret = totp.b32encode(Buffer.from('12345678901234567890'));
  assert.equal(totp.hotp(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totp.verifyTotp(secret, '287082', null, 59 * 1000), 1);
  assert.equal(totp.verifyTotp(secret, '287082', 1, 59 * 1000), null, 'الرمز نفسه لا يُعاد');
  assert.equal(totp.verifyTotp(secret, '12345', null, 59 * 1000), null);
});

test('رمز الإيميل: خمس محاولات خاطئة تُسقطه ولو جاء الصحيح بعدها', async () => {
  const email = 'otp@example.com';
  assert.equal((await call({ action: 'email-otp-request', email })).code, 200);
  const real = JSON.parse(store.get('db/otp/' + email)).otp;
  const wrong = real === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.equal((await call({ action: 'email-otp-verify', email, otp: wrong })).code, 401);
  const fifth = await call({ action: 'email-otp-verify', email, otp: wrong, lang: 'en' });
  assert.match(fifth.body.error, /request a new code/);
  assert.equal((await call({ action: 'email-otp-verify', email, otp: real })).code, 401, 'الرمز الصحيح سقط');
});

test('القفل على (الحساب + الشبكة): المهاجم يُقفل وصاحب الحساب يدخل من شبكته', async () => {
  assert.equal((await call({ action: 'signup', username: 'victim', password: 'rightpass1' })).code, 200);
  for (let i = 0; i < 6; i++) assert.equal((await call({ action: 'login', username: 'victim', password: 'nope-' + i }, '6.6.6.6')).code, 401);
  assert.equal((await call({ action: 'login', username: 'victim', password: 'rightpass1' }, '6.6.6.6')).code, 429, 'شبكة المهاجم مقفلة');
  const mine = await call({ action: 'login', username: 'victim', password: 'rightpass1' }, '2.2.2.2');
  assert.equal(mine.code, 200, 'صاحب الحساب غير مقفل');
  assert.ok(mine.body.token);
});

test('سقف الحساب كلّه: ٥٠ خطأً من شبكات كثيرة يقفل الحساب ربع ساعة', async () => {
  await call({ action: 'signup', username: 'target50', password: 'rightpass1' });
  for (let i = 0; i < 50; i++) await call({ action: 'login', username: 'target50', password: 'x' + i }, '9.9.' + Math.floor(i / 5) + '.' + i);
  assert.equal((await call({ action: 'login', username: 'target50', password: 'rightpass1' }, '3.3.3.3')).code, 429);
});

test('الجلسة: ٢٤ ساعة، تتجدّد حتّى ٣٠ يومًا، وتغيير كلمة المرور يُبطل الأجهزة الأخرى', async () => {
  const su = await call({ action: 'signup', username: 'sessy', password: 'firstpass1' });
  const tokA = su.body.token;
  const p = payloadOf(tokA);
  assert.ok(p.exp - Date.now() <= session.ACCESS_MS && p.exp - Date.now() > session.ACCESS_MS - 5000);
  assert.ok(p.rx - Date.now() > 29 * 24 * 3600 * 1000);
  const tokB = (await call({ action: 'login', username: 'sessy', password: 'firstpass1' })).body.token;

  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 2 * 24 * 3600 * 1000;
    assert.equal(auth.verifyToken(tokA), null, 'انتهت ساعاته على البوّابات');
    const refreshed = await call({ action: 'verify', token: tokA });
    assert.equal(refreshed.code, 200, 'لكنّه يتجدّد عبر verify');
    assert.equal(auth.verifyToken(refreshed.body.token), 'sessy');
  } finally { Date.now = realNow; }

  const cp = await call({ action: 'changePassword', token: tokA, currentPassword: 'firstpass1', newPassword: 'secondpass2' });
  assert.equal(cp.code, 200);
  assert.ok(cp.body.token, 'هذا الجهاز يأخذ رمزًا جديدًا');
  const deadB = await call({ action: 'verify', token: tokB });
  assert.equal(deadB.code, 401, 'الجهاز الآخر خرج');
  assert.equal(deadB.body.revoked, true);
  assert.equal((await call({ action: 'verify', token: cp.body.token })).code, 200);
});

test('الخروج من كلّ الأجهزة', async () => {
  await call({ action: 'signup', username: 'many', password: 'manypass1' });
  const t1 = (await call({ action: 'login', username: 'many', password: 'manypass1' })).body.token;
  const t2 = (await call({ action: 'login', username: 'many', password: 'manypass1' })).body.token;
  const out = await call({ action: 'logoutAll', token: t1 });
  assert.equal(out.code, 200);
  assert.equal((await call({ action: 'verify', token: t2 })).code, 401);
  assert.equal((await call({ action: 'verify', token: t1 })).code, 401, 'الرمز القديم لهذا الجهاز أيضًا');
  assert.equal((await call({ action: 'verify', token: out.body.token })).code, 200, 'والجديد يعمل');
});

test('التحقّق بخطوتين الاختياريّ: تفعيل بكلمة المرور، دخول برمز، منع الإعادة، حدّ الخطأ، رمز احتياطيّ مرّة واحدة', async () => {
  const su = await call({ action: 'signup', username: 'mfauser', password: 'mfapass12' });
  const noPass = await call({ action: 'mfa-setup-start', token: su.body.token });
  assert.equal(noPass.code, 401, 'الجلسة وحدها لا تكفي للتفعيل');
  assert.equal(noPass.body.needPassword, true);
  const start = await call({ action: 'mfa-setup-start', token: su.body.token, currentPassword: 'mfapass12' });
  assert.equal(start.code, 200);
  assert.match(start.body.uri, /^otpauth:\/\/totp\/.+secret=[A-Z2-7]+/);
  assert.match(start.body.qr, /^data:image\/gif;base64,/);
  const secret = start.body.secret;
  assert.equal((await call({ action: 'mfa-setup-confirm', token: su.body.token, code: '000000' === nowCode(secret) ? '111111' : '000000' })).code, 401);
  const conf = await call({ action: 'mfa-setup-confirm', token: su.body.token, code: nowCode(secret) });
  assert.equal(conf.code, 200, JSON.stringify(conf.body));
  assert.equal(conf.body.backupCodes.length, 8);
  assert.equal((await call({ action: 'verify', token: su.body.token })).code, 401, 'التفعيل يُخرج الجلسات السابقة');
  assert.equal((await call({ action: 'mfa-status', token: conf.body.token })).body.on, true);

  const login = await call({ action: 'login', username: 'mfauser', password: 'mfapass12' });
  assert.equal(login.code, 200);
  assert.equal(login.body.token, undefined, 'لا جلسة قبل الخطوة الثانية');
  assert.equal(login.body.mfa, 'code');
  assert.equal(session.verifySession(login.body.ticket), null, 'البطاقة ليست جلسة');
  assert.equal((await call({ action: 'mfa-login', ticket: login.body.ticket, code: nowCode(secret) })).code, 401, 'رمز التأكيد نفسه لا يُعاد');
  const ok = await call({ action: 'mfa-login', ticket: login.body.ticket, code: nextCode(secret) });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.equal(auth.verifyToken(ok.body.token), 'mfauser');

  const backup = conf.body.backupCodes[0];
  const t2 = (await call({ action: 'login', username: 'mfauser', password: 'mfapass12' })).body.ticket;
  const viaBackup = await call({ action: 'mfa-login', ticket: t2, code: backup.toLowerCase() });
  assert.equal(viaBackup.code, 200);
  assert.equal(viaBackup.body.backupLeft, 7);
  const t3 = (await call({ action: 'login', username: 'mfauser', password: 'mfapass12' })).body.ticket;
  assert.equal((await call({ action: 'mfa-login', ticket: t3, code: backup })).code, 401, 'الاحتياطيّ مرّة واحدة');
  for (let i = 0; i < 3; i++) await call({ action: 'mfa-login', ticket: t3, code: '12345' + i });
  assert.equal((await call({ action: 'mfa-login', ticket: t3, code: 'ZZZZZ-ZZZZZ' })).code, 401);
  assert.equal((await call({ action: 'mfa-login', ticket: t3, code: nextCode(secret) })).code, 429, 'خمسة أخطاء تقفل الخطوة الثانية');

  const other = conf.body.backupCodes[1];
  const u = await auth.getUser('mfauser');
  u.mfaLockUntil = 0; await auth.putUser('mfauser', u);
  const dis = await call({ action: 'mfa-disable', token: viaBackup.body.token, code: other });
  assert.equal(dis.code, 200);
  const plain = await call({ action: 'login', username: 'mfauser', password: 'mfapass12' });
  assert.ok(plain.body.token, 'بعد الإيقاف دخول عاديّ');
});

test('المالك: الخطوة الثانية إلزاميّة في الدخول وفي كلّ بوّابة، ومخرج الطوارئ OWNER_MFA_OFF', async () => {
  const { salt, hash } = auth.hashPassword('ownerpass1');
  await auth.putUser('omran', { username: 'omran', salt, hash, createdAt: Date.now() });
  assert.equal(auth.verifyToken(auth.makeToken('omran')), null, 'جلسة مالك بلا m مرفوضة');
  assert.equal(isOwner({ query: { token: auth.makeToken('omran') } }), false);
  assert.equal(isOwner({ query: { token: auth.makeToken('omran', { m: 1 }) } }), true);

  const login = await call({ action: 'login', username: 'omran', password: 'ownerpass1' });
  assert.equal(login.body.mfa, 'setup', 'المالك بلا تفعيل يُوجَّه للإعداد');
  assert.equal(login.body.token, undefined);
  assert.equal((await call({ action: 'mfa-login', ticket: login.body.ticket, code: '123456' })).code, 401, 'بطاقة الإعداد لا تصلح للدخول');
  const start = await call({ action: 'mfa-setup-start', ticket: login.body.ticket });
  assert.equal(start.code, 200);
  const conf = await call({ action: 'mfa-setup-confirm', ticket: login.body.ticket, code: nowCode(start.body.secret) });
  assert.equal(conf.code, 200);
  assert.equal(isOwner({ body: { token: conf.body.token } }), true, 'بعد الإعداد جلسة مالك كاملة');
  const again = await call({ action: 'login', username: 'omran', password: 'ownerpass1' });
  assert.equal(again.body.mfa, 'code');
  assert.equal((await call({ action: 'mfa-disable', token: conf.body.token, code: conf.body.backupCodes[0] })).code, 403, 'لا إيقاف للمالك');

  const refreshed = await call({ action: 'verify', token: conf.body.token });
  assert.equal(payloadOf(refreshed.body.token).m, 1, 'التجديد يحفظ العلامة');

  const reset = await call({ action: 'reset', username: 'omran', recoveryCode: 'NOPE-NOPE', newPassword: 'whatever12' });
  assert.equal(reset.code, 401);

  process.env.OWNER_MFA_OFF = '1';
  try {
    assert.equal(auth.verifyToken(auth.makeToken('omran')), 'omran', 'مخرج الطوارئ');
  } finally { delete process.env.OWNER_MFA_OFF; }
});

test('مسارات الدخول الأخرى تمرّ بالخطوة الثانية: رابط الاسترجاع، رمز الاسترجاع، رمز الإيميل، جوجل', async () => {
  const src = read('api/_lib/auth.js');
  for (const a of ['reset', 'resetWithToken', 'login', 'email-otp-verify']) {
    const block = src.split("if (action === '" + a + "')")[1].split('\n    if (action === ')[0];
    assert.match(block, /loginResult\(/, a + ' يمرّ بـloginResult');
    assert.doesNotMatch(block, /token: makeToken\(/, a + ' لا يختم جلسة مباشرة');
  }
  const g = read('api/_lib/auth-google-callback.js');
  assert.match(g, /loginResult\(key, user\)/);
  assert.match(g, /gmfa: lr\.mfa, gticket: lr\.ticket/);
  assert.doesNotMatch(g, /makeToken/);
  assert.match(read('api/_lib/oauth-claim.js'), /ticket: rec\.ticket/);
});

test('لا نسخة فحص رموز خارج session.js: كلّ verifyToken ينادي الفحص الموحّد', () => {
  const dir = path.join(root, 'api/_lib');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'session.js')) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(s, /if \(data\.exp < Date\.now\(\)\) return null;/, f + ' ما زال ينسخ فحص الرمز');
  }
  assert.match(read('api/_lib/_owner.js'), /require\('\.\/session\.js'\)\.verifySession\(token\)/);
});

test('العميل: شاشة الخطوة الثانية، تجديد الجلسة، وأزرار الأمان بـ١٤ لغة', () => {
  const mfa = read('js/app-01-mfa.js');
  for (const a of ['mfa-login', 'mfa-setup-start', 'mfa-setup-confirm', 'mfa-disable', 'mfa-status', 'logoutAll', "action: 'verify'"]) assert.ok(mfa.includes(a), a);
  const boot = read('js/app-01-boot-auth.js');
  assert.ok((boot.match(/omranMfa\.start\(/g) || []).length >= 6, 'كلّ مسارات الدخول في العميل تمرّ بالخطوة الثانية');
  assert.match(boot, /params\.get\('gticket'\)/);
  assert.match(read('js/partials-settings.js'), /id="acctSecurityBox"/);
  const keys = ['mfaTitle', 'mfaExplain', 'mfaCodePrompt', 'mfaSetupScan', 'mfaOwnerRequired', 'mfaBackupTitle', 'mfaEnableBtn', 'mfaDisableBtn', 'logoutAllBtn'];
  const base = read('js/app-03-i18n-data.js');
  const has = (src, k) => (src.match(new RegExp('["\']?\\b' + k + '["\']?\\s*:', 'g')) || []).length;
  for (const k of keys) assert.equal(has(base, k), 2, 'ar و en: ' + k);
  const langs = fs.readdirSync(path.join(root, 'i18n')).filter((f) => /^[a-z]{2,3}\.js$/.test(f));
  assert.equal(langs.length, 12);
  for (const f of langs) {
    const s = read('i18n/' + f);
    for (const k of keys) assert.ok(has(s, k) >= 1, f + ': ' + k);
  }
});
