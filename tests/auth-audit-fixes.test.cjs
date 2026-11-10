// tests/auth-audit-fixes.test.cjs — فحص الدخول من أ إلى ي (المالك ١٠ نوفمبر ٢٠٢٦: «شوفلي… طريقة تسجيل الدخول» ثمّ «أبدأ»):
// v-acct-delete-nopw: حساب Google أو رمز البريد كما يكتبه الخادم فعلًا (salt/hash لكلمة عشوائيّة) يحذف حسابه بالاسم وحده.
// v-auth-absent: السجلّ الغائب يُقرأ مرّة واحدة بلا انتظار في التسجيل والدخول بالإيميل، وعطب القراءة لا يُقرأ «الاسم حرّ».
// v-recovery-hint: مشترك بلا إيميل ولا هاتف يُقال له «أضف إيميلك» عند الدخول وعند الفتح.
// على المعالجات الحقيقيّة (auth، account-delete)؛ Redis في الذاكرة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

process.env.AUTH_SECRET = 'auth-audit-fixes-test-secret';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
delete process.env.RESEND_API_KEY;
delete process.env.OWNER_NOTIFY_EMAIL;
delete process.env.OMRAN_TEST_FAST_SLEEP; // الانتظار الحقيقيّ: الاختبار يقيس أنّه لم يقع
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const store = new Map();
let userReads = 0;
let failUserReads = false;
const kvImpl = {
  kvGetJSON: async (k, opts) => {
    if (String(k).startsWith('db/users/')) {
      userReads++;
      if (failUserReads) { if (opts && opts.strict) throw new Error('Upstash error: HTTP 500'); return null; }
    }
    return store.has(k) ? JSON.parse(store.get(k)) : null;
  },
  kvPutJSON: async (k, v) => { store.set(k, JSON.stringify(v)); },
  kvGetRaw: async (k) => (store.has(k) ? String(store.get(k)) : null),
  kvSetRaw: async (k, v) => { store.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { if (store.has(k)) return false; store.set(k, String(v)); return true; },
  kvIncr: async (k) => { const v = Number(store.get(k) || 0) + 1; store.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(store.get(k) || 0) - Number(n); store.set(k, String(v)); return v; },
  kvDel: async (k) => { store.delete(k); },
  kvExpire: async () => {},
  kvList: async (p) => [...store.keys()].filter((k) => k.startsWith(p)),
};
mock('api/_lib/kv.js', new Proxy(kvImpl, { get: (t, p) => t[p] || (async () => null) }));
mock('api/_lib/log-error.js', { logError: () => {}, logErrorAndFlush: async () => {} });

const auth = require(path.join(root, 'api/_lib/auth.js'));
const { deleteAccount } = require(path.join(root, 'api/_lib/account-delete.js'));

function call(body) {
  return new Promise((resolve, reject) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ status: this.code, body: j }); return this; }, end() { resolve({ status: this.code, body: null }); } };
    Promise.resolve(auth({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' }, query: {}, body }, res)).catch(reject);
  });
}
// كما يكتب الكولباك (randomPasswordHash) ورمز البريد (hashPassword لكلمة عشوائيّة): الحساب يحمل salt/hash دائمًا
function randomPw() { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(crypto.randomBytes(32).toString('hex'), salt, 64).toString('hex') }; }
const delOpt = { autoRenewToggle: async (req, res) => res.status(200).json({ ok: true }) };

test('١. حساب Google وحساب رمز البريد (بـsalt/hash عشوائيَّين) يحذفان حسابهما بالاسم وحده', async () => {
  await auth.putUser('g_a@x.com', Object.assign({ username: 'A', email: 'a@x.com', googleAuth: true }, randomPw()));
  await auth.putUser('noor_1a2b3c', Object.assign({ username: 'noor_1a2b3c', email: 'n@x.com', otpOnly: true }, randomPw()));
  const g = await deleteAccount({ username: 'g_a@x.com', token: 't', confirmUsername: 'g_a@x.com', password: '' }, delOpt);
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const o = await deleteAccount({ username: 'noor_1a2b3c', token: 't', confirmUsername: 'noor_1a2b3c', password: '' }, delOpt);
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.equal((await auth.getUserOnce('g_a@x.com')).deleted, true);
  assert.equal((await auth.getUserOnce('noor_1a2b3c')).deleted, true);
});

test('٢. حساب بكلمة مرور يعرفها صاحبه ما زال يُطلب منه — ومنه حساب الرمز الذي وضع كلمة برابط الاسترجاع (pwSet)', async () => {
  const r = await call({ action: 'signup', username: 'salem', password: 'secret-pass-1' });
  assert.equal(r.status, 200);
  assert.equal((await deleteAccount({ username: 'salem', token: 't', confirmUsername: 'salem', password: '' }, delOpt)).body.code, 'wrong_password');
  // حساب رمز بريد يستعيد برابط: resetWithToken يختم pwSet
  const rt = 'a'.repeat(48);
  await auth.putUser('mona_aaaaaa', Object.assign({ username: 'mona_aaaaaa', email: 'm@x.com', otpOnly: true, resetTokenHash: crypto.createHash('sha256').update(rt).digest('hex'), resetTokenExpiry: Date.now() + 60000 }, randomPw()));
  assert.equal((await call({ action: 'resetWithToken', username: 'mona_aaaaaa', resetToken: rt, newPassword: 'new-secret-9' })).status, 200);
  assert.equal((await auth.getUserOnce('mona_aaaaaa')).pwSet, true);
  assert.equal((await deleteAccount({ username: 'mona_aaaaaa', token: 't', confirmUsername: 'mona_aaaaaa', password: '' }, delOpt)).body.code, 'wrong_password');
  assert.equal((await deleteAccount({ username: 'mona_aaaaaa', token: 't', confirmUsername: 'mona_aaaaaa', password: 'new-secret-9' }, delOpt)).status, 200);
});

test('٣. السجلّ الغائب: قراءة واحدة بلا انتظار ١٫٨ ثانية — التسجيل، والدخول بالإيميل، واسم غير موجود', async () => {
  let t = Date.now(); userReads = 0;
  assert.equal((await call({ action: 'signup', username: 'fresh_name', password: 'secret-pass-1' })).status, 200);
  assert.equal(userReads, 1, 'التسجيل يقرأ الاسم مرّة');
  assert.ok(Date.now() - t < 1200, 'التسجيل بلا انتظار: ' + (Date.now() - t));
  t = Date.now(); userReads = 0;
  assert.equal((await call({ action: 'login', username: 'nobody@example.com', password: 'whatever-1' })).status, 401);
  assert.equal(userReads, 1, 'الدخول بالإيميل يقرأ الإيميل اسمًا مرّة');
  assert.ok(Date.now() - t < 1200, 'الدخول بالإيميل بلا انتظار: ' + (Date.now() - t));
  t = Date.now();
  assert.equal((await call({ action: 'login', username: 'no_such_user', password: 'whatever-1' })).body.code, 'bad_credentials');
  assert.ok(Date.now() - t < 1200, 'اسم غير موجود بلا انتظار: ' + (Date.now() - t));
});

test('٤. عطب قراءة السجلّ ليس «الاسم حرّ»: التسجيل ٥٠٠ ولا يُكتب فوق حساب قائم، والدخول ٥٠٠ لا «كلمة خاطئة»', async () => {
  assert.equal((await call({ action: 'signup', username: 'owned', password: 'first-pass-1' })).status, 200);
  const before = store.get('db/users/owned.json');
  failUserReads = true;
  try {
    assert.equal((await call({ action: 'signup', username: 'owned', password: 'attacker-pass-1' })).status, 500);
    assert.equal((await call({ action: 'login', username: 'owned', password: 'first-pass-1' })).status, 500);
  } finally { failUserReads = false; }
  assert.equal(store.get('db/users/owned.json'), before, 'السجلّ كما هو');
  assert.equal((await call({ action: 'login', username: 'owned', password: 'first-pass-1' })).status, 200);
});

test('٥. «أضف إيميلك»: للمشترك بلا إيميل ولا هاتف وحده — مع الدخول ومع التحقّق عند الفتح', async () => {
  const now = Date.now();
  const base = { username: 'x', salt: 's', hash: 'h' };
  assert.equal(auth.needsRecovery(Object.assign({}, base, { plan: 'pro', planUpdatedAt: now - 86400000 })), true, 'باقة سارية');
  assert.equal(auth.needsRecovery(Object.assign({}, base, { media: { video: { at: now - 86400000 } } })), true, 'اشتراك وسائط سارٍ');
  assert.equal(auth.needsRecovery(base), false, 'غير مشترك');
  assert.equal(auth.needsRecovery(Object.assign({}, base, { plan: 'pro', planUpdatedAt: now - 60 * 86400000 })), false, 'باقة منتهية');
  assert.equal(auth.needsRecovery(Object.assign({}, base, { plan: 'pro', planUpdatedAt: now, email: 'a@x.com' })), false, 'عنده إيميل');
  assert.equal(auth.needsRecovery(Object.assign({}, base, { plan: 'pro', planUpdatedAt: now, phone: '+971500000000' })), false, 'عنده هاتف');
  assert.equal(auth.needsRecovery(Object.assign({}, base, { plan: 'pro', planUpdatedAt: now, googleAuth: true })), false, 'دخوله بـGoogle — لا كلمة تُنسى');
  assert.equal(auth.needsRecovery(null), false);

  assert.equal((await call({ action: 'signup', username: 'payer', password: 'secret-pass-1' })).status, 200);
  let login = await call({ action: 'login', username: 'payer', password: 'secret-pass-1' });
  assert.equal(login.body.addRecovery, false, 'قبل الاشتراك لا تنبيه');
  const u = await auth.getUserOnce('payer');
  await auth.putUser('payer', Object.assign(u, { plan: 'basic', planUpdatedAt: now }));
  login = await call({ action: 'login', username: 'payer', password: 'secret-pass-1' });
  assert.equal(login.body.addRecovery, true, 'الدخول');
  const verify = await call({ action: 'verify', token: login.body.token });
  assert.equal(verify.status, 200);
  assert.equal(verify.body.addRecovery, true, 'التحقّق عند الفتح');
});

test('٦. الواجهة: الشريط موصول بالدخول والفتح ويزول بالخروج والتأكيد، ونصّه بالـ١٤ لغة بلا اسم مزوّد', () => {
  const boot = read('js/app-01-boot-auth.js');
  assert.equal((boot.match(/recoveryAlert\(data\.addRecovery\)/g) || []).length, 2, 'بعد الدخول وعند الفتح');
  assert.ok(boot.includes('recoveryAlert(false); // v-recovery-hint\n'), 'الخروج يزيله');
  assert.ok(/emailConfirmAlert\(null\);[^\n]*\n\s*recoveryAlert\(false\); \/\/ v-recovery-hint: صار/.test(boot), 'تأكيد الإيميل يزيله');
  assert.ok(/function recoveryAlert\(on\)[\s\S]*?showSettingsPage\('accountSection'\)[\s\S]*?acctToggleRow\('acctRowEmail'/.test(boot), 'الزرّ يفتح خانة الإيميل في «حسابي»');
  assert.ok(boot.includes("txt.setAttribute('data-i18n', 'recoveryHintTitle')") && boot.includes("add.setAttribute('data-i18n', 'recoveryHintAdd')"), 'يُترجم مع تغيّر اللغة');
  const data = read('js/app-03-i18n-data.js');
  const all = [];
  for (const k of ['recoveryHintTitle', 'recoveryHintAdd']) {
    assert.equal((data.match(new RegExp('\\b' + k + ': \'[^\']+\'', 'g')) || []).length, 2, k + ' عربيّ وإنجليزيّ');
    all.push(...data.match(new RegExp('\\b' + k + ': \'[^\']+\'', 'g')));
    for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
      const m = new RegExp('"?' + k + '"?\\s*:\\s*"[^"]+"').exec(read('i18n/' + lg + '.js'));
      assert.ok(m, lg + ' ← ' + k);
      all.push(m[0]);
    }
  }
  assert.ok(!/claude|gemini|groq|gpt|openai|anthropic|google|stripe/i.test(all.join(' ')), 'بلا اسم مزوّد');
  const tag = Number((read('js/app-04-i18n-state.js').match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(tag >= 794, 'وسم ملفّات اللغات ' + tag);
  // الخادم: الحذف بلا كلمة مرور مشروط بطريقة الدخول لا بغياب hash، والكولباك يقرأ قراءة صارمة واحدة
  assert.ok(read('api/_lib/account-delete.js').includes('if (user.hash && user.salt && !noPassword) {'));
  assert.ok(read('api/_lib/auth-google-callback.js').includes('user = await getUserSure(key);'));
});
