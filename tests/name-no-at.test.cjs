// tests/name-no-at.test.cjs — v-name-no-at (أمر المالك ١٨ أكتوبر: «صلّح ثغرة VIP: امنع حرف @ في اسم المستخدم عند التسجيل
// الجديد. الحسابات القديمة لا تلمسها»): قائمة VIP تقبل إيميلًا، وإن لم يكن له حساب بعد يبقى فيها نصًّا خامًا، وكلّ خصم
// يطابق VIP بالاسم — فمن سجّل اسمه بذلك الإيميل صار VIP كاملًا. الاسم الجديد (تسجيل أو تغيير اسم) بلا @، والقديم كما هو.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'test-secret-name-no-at';
process.env.UPSTASH_REDIS_REST_URL = 'http://local-test';
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
const auth = require('../api/_lib/auth.js');

async function call(body) {
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  await auth({ method: 'POST', headers: {}, body }, res);
  return res;
}

test('١. التسجيل الجديد: اسم فيه @ مرفوض برسالة واضحة ولا يُنشأ حساب — والاسم العاديّ كما كان', async () => {
  for (const name of ['friend@gmail.com', 'a@b', '@vip', 'xy@']) {
    const r = await call({ action: 'signup', username: name, password: 'pass12345' });
    assert.equal(r.code, 400, name);
    assert.match(r.body.error, /@/);
    assert.equal(await auth.getUser(name.toLowerCase(), 1), null, name + ': لا حساب');
  }
  const en = await call({ action: 'signup', username: 'z@z.com', password: 'pass12345', lang: 'en' });
  assert.equal(en.code, 400);
  const ok = await call({ action: 'signup', username: 'friend', password: 'pass12345' });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  // مساحة Google باقية على ردّها القائم (٤٠٩ «محجوز» — name-reuse ٤)
  assert.equal((await call({ action: 'signup', username: 'g_victim@gmail.com', password: 'pass12345' })).code, 409);
});

test('٢. تغيير الاسم: الجديد بلا @، والحساب لا يتغيّر — وحساب قديم اسمه فيه @ يدخل ويغيّر اسمه إلى اسم بلا @', async () => {
  await call({ action: 'signup', username: 'mona', password: 'pass12345' });
  const bad = await call({ action: 'changeUsername', token: auth.makeToken('mona'), newUsername: 'mona@vip.com' });
  assert.equal(bad.code, 400, JSON.stringify(bad.body));
  assert.ok(await auth.getUser('mona'), 'الحساب باسمه');
  assert.equal(await auth.getUser('mona@vip.com', 1), null);
  // حساب قديم (قبل القاعدة) اسمه فيه @: يُصنع في المخزن مباشرة — لا يُمسّ
  await call({ action: 'signup', username: 'oldtmp', password: 'pass12345' });
  const rec = await auth.getUser('oldtmp');
  await auth.putUser('old@name.com', Object.assign({}, rec, { username: 'old@name.com' }));
  const login = await call({ action: 'login', username: 'old@name.com', password: 'pass12345' });
  assert.equal(login.code, 200, 'الحساب القديم يدخل كما كان');
  assert.equal(auth.verifyToken(login.body.token), 'old@name.com');
  const same = await call({ action: 'changeUsername', token: login.body.token, newUsername: 'old@name.com' });
  assert.equal(same.code, 200, 'إبقاء الاسم القائم كما هو مسموح');
  // يغيّر اسمه إلى اسم بلا @ ثمّ يرجع إلى اسمه القديم — العودة إلى اسمك (سلسلة شواهده، v-name-reuse) لا تُمنع
  const away = await call({ action: 'changeUsername', token: login.body.token, newUsername: 'oldnew' });
  assert.equal(away.code, 200, JSON.stringify(away.body));
  const back = await call({ action: 'changeUsername', token: away.body.token, newUsername: 'old@name.com' });
  assert.equal(back.code, 200, 'العودة إلى الاسم القديم: ' + JSON.stringify(back.body));
  assert.equal(auth.verifyToken(back.body.token), 'old@name.com');
  // وغريب لا يأخذ اسمًا فيه @ ولو كان شاغرًا
  await call({ action: 'signup', username: 'stranger', password: 'pass12345' });
  const s = await call({ action: 'changeUsername', token: auth.makeToken('stranger'), newUsername: 'free@slot.com' });
  assert.equal(s.code, 400);
  assert.equal(s.body.code, 'name_at', 'رمز تعرض به الواجهة الرسالة بلغتها');
});

test('٣. المصدر: الفحص في المسارين بعد الحجز وقبل البحث عن الاسم', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', '_lib', 'auth.js'), 'utf8');
  const signup = src.slice(src.indexOf("if (action === 'signup') {"), src.indexOf("const existing = await getUser(key);"));
  assert.ok(signup.includes("if (key.includes('@')) { // v-name-no-at"));
  const rename = src.slice(src.indexOf("if (action === 'changeUsername') {"), src.indexOf('const now = Date.now();', src.indexOf("if (action === 'changeUsername') {")));
  const at = rename.indexOf("if (newKey.includes('@') && !isGoogleKey(newKey) && !ownPrev) {");
  assert.ok(at > 0 && rename.indexOf('if (newKey === oldKey) {') < at && rename.indexOf('const ownPrev = ') < at, 'الاسم القائم والعودة إلى اسمك يمرّان قبل الفحص');
});

test('٤. الرسالة بلغة الواجهة الـ١٤ (قاعدة المالك): رمز name_at من الخادم، ومفتاح nameNoAt في القاموسين والـ١٢ ملفًّا، والواجهة تعرضه', () => {
  const fs = require('fs'), path = require('path');
  const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.equal((rd('js/app-03-i18n-data.js').match(/nameNoAt: '[^']*@[^']*'/g) || []).length, 2, 'العربيّة والإنجليزيّة');
  for (const lg of ['fr', 'es', 'tr', 'ru', 'zh', 'hi', 'ur', 'bn', 'ne', 'ml', 'id', 'fil']) assert.match(rd('i18n/' + lg + '.js'), /"?nameNoAt"?: "[^"]*@[^"]*"/, lg);
  const cl = rd('js/app-01-boot-auth.js');
  assert.ok(cl.includes("errBox.textContent = (data.code === 'name_at' && curT().nameNoAt) || (data.code === 'email_unverified' && curT().authEmailUnverified) || data.error"), 'التسجيل'); // v-unverified-email: ورسالة الإيميل غير المؤكَّد بجانبها
  assert.ok(cl.includes("acctUsernameMsg.textContent = (data.code === 'name_at' && t2.nameNoAt) || data.error || t2.acctGenericError;"), 'تغيير الاسم');
  const v = Number((rd('js/app-04-i18n-state.js').match(/sc\.src = 'i18n\/' \+ lg \+ '\.js\?v=(\d+)'/) || [])[1]);
  assert.ok(v >= 751, 'وسم ملفّات اللغات رُفع: ' + v);
});
