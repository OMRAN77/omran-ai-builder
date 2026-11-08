'use strict';
/* tests/owner-reset-link.test.cjs — v-owner-reset-link (٧ نوفمبر ٢٠٢٦).
   العرض: مستخدمة نسيت كلمة مرورها، وإيميل الاسترجاع لا يصلها، فأعادت الضغط حتّى «محاولات كثيرة — جرّب بعد ١٥ دقيقة».
   الحلّ: زرّ 🔑 في جدول المستخدمين للمالك ينشئ رابط الاسترجاع نفسه (٣٠ دقيقة) ليسلّمه المالك بيده بعد التحقّق.
   يشغّل admin-actions.js وauth.js الحقيقيّين بمخزن في الذاكرة، ودوالّ لوحة المالك الحقيقيّة من app-01 في vm. */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.OMRAN_TEST_FAST_SLEEP = '1';
process.env.AUTH_SECRET = 'سرّ-اختبار-الاسترجاع';
process.env.OWNER_USERNAME = 'boss';
process.env.UPSTASH_REDIS_REST_URL = 'http://فحص-محلّيّ';

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
const admin = require('../api/_lib/admin-actions.js');
const mkRes = () => {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.end = () => r;
  r.setHeader = () => {};
  return r;
};
const callAdmin = async (body) => { const r = mkRes(); await admin({ method: 'POST', body }, r); return r; };
const callAuth = async (body) => { const r = mkRes(); await auth({ method: 'POST', body, headers: {}, socket: {} }, r); return r; };
const ownerToken = () => auth.makeToken('boss');

test('١. المالك ينشئ رابطًا، وصاحب الحساب يضع به كلمة مرور جديدة، والرابط لا يُستعمل مرّتين', async () => {
  await auth.putUser('alya', { username: 'alya', email: 'alya@example.com', hash: 'h', salt: 's' });
  const r = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'Alya' });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.minutes, 30);
  const u = new URL(r.body.link);
  const rt = u.searchParams.get('resetToken');
  assert.match(rt, /^[0-9a-f]{48}$/);
  assert.equal(u.searchParams.get('ru'), 'alya');
  const saved = await auth.getUser('alya');
  assert.notEqual(saved.resetTokenHash, rt, 'الرمز يُخزَّن مجزَّأً لا خامًا');
  assert.ok(saved.resetTokenExpiry > Date.now() + 29 * 60 * 1000 && saved.resetTokenExpiry <= Date.now() + 30 * 60 * 1000);

  const ok = await callAuth({ action: 'resetWithToken', username: 'alya', resetToken: rt, newPassword: 'NewPass123' });
  assert.equal(ok.code, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.token, 'يدخل مباشرة بجلسة جديدة');
  const again = await callAuth({ action: 'resetWithToken', username: 'alya', resetToken: rt, newPassword: 'Other1234' });
  assert.equal(again.code, 401, 'الرابط لمرّة واحدة');
});

test('٢. رابط جديد يُبطل السابق', async () => {
  await auth.putUser('noor', { username: 'noor', hash: 'h', salt: 's' });
  const a = new URL((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'noor' })).body.link).searchParams.get('resetToken');
  const b = new URL((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'noor' })).body.link).searchParams.get('resetToken');
  assert.notEqual(a, b);
  assert.equal((await callAuth({ action: 'resetWithToken', username: 'noor', resetToken: a, newPassword: 'NewPass123' })).code, 401);
  assert.equal((await callAuth({ action: 'resetWithToken', username: 'noor', resetToken: b, newPassword: 'NewPass123' })).code, 200);
});

test('٣. المالك وحده، ولا للمحذوف ولا للغائب ولا لحساب المالك', async () => {
  await auth.putUser('sara', { username: 'sara', hash: 'h', salt: 's' });
  for (const token of [auth.makeToken('sara'), undefined, 'مزوّر.لا.يفكّ']) {
    const r = await callAdmin({ token, action: 'reset-link', targetUsername: 'sara' });
    assert.ok(r.code === 401 || r.code === 403, 'غير المالك: ' + r.code);
  }
  assert.ok(!(await auth.getUser('sara')).resetTokenHash, 'ولم يُكتب رمز');
  await auth.putUser('gone', { username: 'gone', hash: 'h', salt: 's', deleted: true });
  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'gone' })).code, 404);
  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'لا-أحد' })).code, 404);
  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'boss' })).code, 400);
});

/* ---------- الواجهة: زرّ 🔑 ودالّته الحقيقيّة من app-01 في vm ---------- */
const { dictFor, clientSlice } = require('./_owner-vm.cjs');
const { makeDom } = require('./_mini-dom.cjs');
function env(lang, answer) {
  const { document } = makeDom();
  ['adminStatsBox', 'adminUsersTable', 'adminClaudeDiagBox', 'vipListBox'].forEach((id) => { const e = document.createElement('div'); e.id = id; document.body.appendChild(e); });
  const said = [], sent = [];
  const ctx = {
    document, curT: () => dictFor(lang), authGet: () => 'tok', __swallow() {},
    confirm: (m) => { said.push(['confirm', m]); return answer; }, alert: (m) => said.push(['alert', m]), prompt: (m, v) => { said.push(['prompt', m, v]); return null; },
    fetch: async (url, init) => { sent.push([String(url), JSON.parse(init.body)]); return { ok: true, status: 200, json: async () => ({ ok: true, link: 'https://x.test/?resetToken=ab&ru=alya', minutes: 30 }) }; },
  };
  ctx.window = ctx;
  clientSlice('js/app-01-boot-auth.js', '  /* v-owner-i18n', '  function setAuthToggleUI(loggedIn){', ctx);
  return { ctx, said, sent };
}

test('٤. الزرّ في كلّ صفّ، والرفض لا يرسل شيئًا، والموافقة تعرض الرابط لينسخه', async () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/app-01-boot-auth.js'), 'utf8');
  assert.ok(src.includes(`onclick="adminResetLink(\\'' + safeName + '\\')" title="' + escAdm(ownT('ownerResetTitle'))`), 'زرّ 🔑 بالاسم المهرَّب نفسه');
  const no = env('ar', false);
  await no.ctx.adminResetLink('alya');
  assert.equal(no.sent.length, 0);
  assert.match(no.said[0][1], /تأكّد أوّلًا أنّه صاحب الحساب/);
  const yes = env('en', true);
  await yes.ctx.adminResetLink('alya');
  assert.deepEqual(yes.sent[0][1], { token: 'tok', action: 'reset-link', targetUsername: 'alya' });
  const p = yes.said.find((x) => x[0] === 'prompt');
  assert.ok(p, 'نافذة الرابط');
  assert.equal(p[2], 'https://x.test/?resetToken=ab&ru=alya');
  assert.match(p[1], /valid 30 min/);
});

/* ---------- v-owner-reset-find: الحساب الأقدم من أحدث ٦٠ تسجيلًا — بالإيميل من خانة البحث ---------- */
test('٥. بالإيميل: يُحوَّل إلى حسابه بفهرس البريد ويعمل الرابط، وحساب Google يُقال ولا رمز، والغائب ٤٠٤', async () => {
  await auth.putUser('alya_old', { username: 'alya_old', email: 'aliya.test@icloud.com', hash: 'h', salt: 's' });
  store.set('db/email-index/aliya.test@icloud.com', JSON.stringify({ username: 'alya_old' }));
  const r = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: ' Aliya.Test@iCloud.com ' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.username, 'alya_old');
  const u = new URL(r.body.link);
  assert.equal(u.searchParams.get('ru'), 'alya_old');
  const ok = await callAuth({ action: 'resetWithToken', username: 'alya_old', resetToken: u.searchParams.get('resetToken'), newPassword: 'NewPass123' });
  assert.equal(ok.code, 200);

  await auth.putUser('g_hamad@gmail.com', { username: 'g_hamad@gmail.com', email: 'hamad@gmail.com', hash: 'h', salt: 's' });
  const g = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'hamad@gmail.com' });
  assert.equal(g.code, 200);
  assert.deepEqual(g.body, { ok: false, google: true, username: 'g_hamad@gmail.com' });
  assert.ok(!(await auth.getUser('g_hamad@gmail.com')).resetTokenHash, 'لا رمز لحساب Google');

  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody@x.com' })).code, 404);
  assert.equal((await callAdmin({ token: auth.makeToken('sara'), action: 'reset-link', targetUsername: 'aliya.test@icloud.com' })).code, 403, 'المالك وحده بالإيميل أيضًا');
});

test('٦. الواجهة: خانة البحث فوق الجدول ترسل ما كُتب، وحساب Google والغائب برسائل مترجمة', async () => {
  const partial = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/partials-settings.js'), 'utf8');
  const i = partial.indexOf('id="adminResetInput"'), t = partial.indexOf('id="adminUsersTable"');
  assert.ok(i > 0 && i < t, 'الخانة قبل الجدول');
  assert.match(partial, /onclick="adminResetLinkFind\(\)"[^>]*>🔑 <span data-i18n="ownerResetTitle">/);
  const mk = (body, status) => {
    const e = env('ar', true);
    const input = e.ctx.document.createElement('input'); input.id = 'adminResetInput'; input.value = '  aliya@icloud.com '; e.ctx.document.body.appendChild(input);
    const real = e.ctx.fetch; e.ctx.fetch = async (url, init) => { await real(url, init); return { ok: (status || 200) < 400, status: status || 200, json: async () => body }; };
    return e;
  };
  const ok = mk({ ok: true, link: 'https://x.test/?resetToken=cd&ru=alya_old', minutes: 30, username: 'alya_old' });
  await ok.ctx.adminResetLinkFind();
  assert.equal(ok.sent[0][1].targetUsername, 'aliya@icloud.com');
  const p = ok.said.find((x) => x[0] === 'prompt');
  assert.equal(p[2], 'https://x.test/?resetToken=cd&ru=alya_old');
  assert.match(p[1], /alya_old/);
  const g = mk({ ok: false, google: true, username: 'g_hamad@gmail.com' });
  await g.ctx.adminResetLinkFind();
  assert.ok(g.said.some((x) => x[0] === 'alert' && /Google/.test(x[1]) && /g_hamad@gmail\.com/.test(x[1])));
  assert.ok(!g.said.some((x) => x[0] === 'prompt'));
  const nf = mk({ error: 'user not found' }, 404);
  await nf.ctx.adminResetLinkFind();
  assert.ok(nf.said.some((x) => x[0] === 'alert' && x[1].includes('ما في حساب بهذا الإيميل أو الاسم')));
  const empty = env('ar', true);
  const inp = empty.ctx.document.createElement('input'); inp.id = 'adminResetInput'; inp.value = '   '; empty.ctx.document.body.appendChild(inp);
  await empty.ctx.adminResetLinkFind();
  assert.equal(empty.sent.length, 0, 'الخانة الفارغة لا ترسل');
});

/* ---------- v-owner-reset-stripe: من سجّل بلا إيميل (منذ ١٨ أكتوبر) ودفع به — اسمه من Stripe (قراءة فقط) ---------- */
test('٧. إيميل لا يصل حسابًا ← اسمه من جلسة دفع مكتملة أو اشتراك عميله أو شحنة Google Pay، والرابط يعمل؛ حسابان ٤٠٩؛ الاسم المغيَّر يُتبع؛ الفهرس أوّلًا؛ GET وحده', async () => {
  const realFetch = global.fetch, realWarn = console.warn;
  const calls = [], warns = [];
  let mode = 'ok';
  const sess = (email, username, extra) => Object.assign({ customer_details: { email }, payment_status: 'paid', metadata: { username } }, extra || {});
  global.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ u, method: (init && init.method) || 'GET', auth: init && init.headers && init.headers.Authorization });
    if (!u.startsWith('https://api.stripe.com/v1/')) throw new Error('نداء غير Stripe: ' + u);
    if (mode === 'down') return { ok: false, status: 401, json: async () => ({ error: { message: 'x' } }) };
    const data = [];
    let has_more = false;
    if (u.includes('checkout/sessions')) {
      assert.match(u, /[?&]status=complete/, 'الجلسات المكتملة وحدها');
      if (mode === 'ignored') data.push(sess('someone.else@x.com', 'aliya_old2'));
      if (u.includes(encodeURIComponent('Paid.User@iCloud.com'))) data.push(sess('paid.user@icloud.com', 'Aliya_Old2'), sess('Paid.User@iCloud.com', 'ghost'));
      if (u.includes(encodeURIComponent('gone@x.com'))) data.push(sess('gone@x.com', 'gone_user'));
      if (u.includes(encodeURIComponent('two@x.com'))) data.push(sess('two@x.com', 'acct_b'), sess('two@x.com', 'acct_a'));
      if (u.includes(encodeURIComponent('moved@x.com'))) data.push(sess('moved@x.com', 'old_name'));
      if (u.includes(encodeURIComponent('unpaid@x.com'))) data.push(sess('unpaid@x.com', 'aliya_old2', { payment_status: 'unpaid' }));
    }
    if (u.includes('customers/search') && u.includes(encodeURIComponent("email:'sub@x.com'"))) data.push({ id: 'cus_1', email: 'sub@x.com', metadata: {} }, { id: 'cus_other', email: 'other@x.com', metadata: { username: 'aliya_old2' } });
    if (u.includes('subscriptions?') && u.includes('customer=cus_1')) data.push({ metadata: { username: 'subuser' } });
    if (u.includes('/charges?')) {
      if (!u.includes('starting_after')) { data.push({ id: 'ch_1', paid: true, billing_details: { email: 'other@x.com' }, metadata: { username: 'aliya_old2' } }); has_more = true; }
      else data.push({ id: 'ch_2', paid: true, billing_details: { email: 'Wallet@X.com' }, metadata: { username: 'gpayuser' } }, { id: 'ch_3', paid: false, billing_details: { email: 'wallet@x.com' }, metadata: { username: 'subuser' } });
    }
    return { ok: true, status: 200, json: async () => ({ data, has_more }) };
  };
  console.warn = (...a) => { warns.push(a.join(' ')); };
  process.env.STRIPE_SECRET_KEY = 'sk_test_reset';
  try {
    for (const k of ['aliya_old2', 'subuser', 'gpayuser', 'acct_a', 'acct_b', 'new_name']) await auth.putUser(k, { username: k, email: null, hash: 'h', salt: 's' }); // سجّلوا بلا إيميل
    await auth.putUser('gone_user', { username: 'gone_user', deleted: true });
    await auth.putUser('old_name', { username: 'old_name', deleted: true, movedTo: 'new_name' }); // غيّر اسمه بعد الدفع
    // ١) جلسة دفع مكتملة بالبريد كما كُتب (حروفه الكبيرة) ← الحساب الحيّ الوحيد (ghost غائب)
    const r = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: ' Paid.User@iCloud.com ' });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.username, 'aliya_old2');
    assert.equal(r.body.via, 'stripe');
    const link = new URL(r.body.link);
    assert.equal(link.searchParams.get('ru'), 'aliya_old2');
    const ok = await callAuth({ action: 'resetWithToken', username: 'aliya_old2', resetToken: link.searchParams.get('resetToken'), newPassword: 'NewPass123' });
    assert.equal(ok.code, 200, 'الرابط يعمل');
    // ٢) لا جلسات ← العميل بالبريد (عميل ببريد آخر يُتجاهل) واشتراكه
    const s = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'sub@x.com' });
    assert.equal(s.code, 200); assert.equal(s.body.username, 'subuser');
    // ٣) Google Pay: لا جلسة ولا عميل ← الشحنات المدفوعة (الصفحة الثانية)، والشحنة غير المدفوعة وبريد آخر يُتجاهلان
    const g = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'wallet@x.com' });
    assert.equal(g.code, 200, JSON.stringify(g.body)); assert.equal(g.body.username, 'gpayuser');
    // ٤) حسابان حيّان دفعا بالبريد نفسه ← ٤٠٩ بالمرشّحَين (الأحدث أوّلًا) بلا رابط ولا رمز
    const two = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'two@x.com' });
    assert.equal(two.code, 409); assert.deepEqual(two.body.candidates, ['acct_b', 'acct_a']); assert.ok(!two.body.link);
    assert.ok(!(await auth.getUser('acct_a')).resetTokenHash && !(await auth.getUser('acct_b')).resetTokenHash, 'لا رمز لأيّهما');
    // ٥) غيّر اسمه بعد الدفع ← يُتبع إلى اسمه الجديد
    const mv = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'moved@x.com' });
    assert.equal(mv.code, 200, JSON.stringify(mv.body)); assert.equal(mv.body.username, 'new_name');
    // ٦) جلسة غير مدفوعة، أو اسم لحساب محذوف ← ٤٠٤
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'unpaid@x.com' })).code, 404, 'جلسة لم تكتمل');
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'gone@x.com' })).code, 404);
    // ٧) قراءة فقط: GET بمفتاح Stripe، لا كتابة
    assert.ok(calls.length > 0 && calls.every((c) => c.method === 'GET' && c.auth === 'Bearer sk_test_reset'), JSON.stringify(calls.map((c) => c.method)));
    // ٨) مرشِّح البريد تجاهله Stripe (يعيد جلسات بريد آخر) ← لا رابط لحساب شخص آخر
    mode = 'ignored';
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody.paid@x.com' })).code, 404, 'بريد الجلسة غير البريد المطلوب');
    // ٩) رفض Stripe ← ٤٠٤ بلا رمي، ومسجَّل بلا بريد
    mode = 'down'; warns.length = 0;
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'Paid.User@iCloud.com' })).code, 404);
    assert.ok(warns.some((w) => /reset-link stripe checkout\/sessions HTTP 401/.test(w)), warns.join(' | '));
    assert.ok(!warns.some((w) => /@|aliya|paid\.user/i.test(w)), 'لا بريد ولا اسم في السجلّ');
    mode = 'ok';
    // ١٠) فهرس البريد أوّلًا: بريد مفهرس لا يسأل Stripe
    calls.length = 0;
    store.set('db/email-index/indexed@x.com', JSON.stringify({ username: 'alya_old' }));
    await auth.putUser('alya_old', { username: 'alya_old', email: 'indexed@x.com', hash: 'h', salt: 's' });
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'indexed@x.com' })).body.username, 'alya_old');
    assert.equal(calls.length, 0, 'لا نداء Stripe');
    // ١١) غير المالك ممنوع قبل أيّ نداء
    assert.equal((await callAdmin({ token: auth.makeToken('sara'), action: 'reset-link', targetUsername: 'Paid.User@iCloud.com' })).code, 403);
    assert.equal(calls.length, 0);
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
    global.fetch = realFetch;
    console.warn = realWarn;
  }
  // ١٢) بلا مفتاح Stripe: لا نداء أصلًا و٤٠٤ كما كان
  let any = false;
  global.fetch = async () => { any = true; throw new Error('no'); };
  try { assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'Paid.User@iCloud.com' })).code, 404); assert.equal(any, false); }
  finally { global.fetch = realFetch; }
});

test('٨. الواجهة: ٤٠٩ (أكثر من حساب دفع بالإيميل) ← رسالة مترجمة بالأسماء، بلا نافذة رابط', async () => {
  const e = env('ar', true);
  const real = e.ctx.fetch; e.ctx.fetch = async (url, init) => { await real(url, init); return { ok: false, status: 409, json: async () => ({ error: 'multiple accounts', candidates: ['acct_b', 'acct_a'] }) }; };
  await e.ctx.adminResetLink('two@x.com');
  const a = e.said.find((x) => x[0] === 'alert');
  assert.ok(a && a[1].includes('دفع بهذا الإيميل أكثر من حساب') && a[1].includes('acct_b') && a[1].includes('acct_a'), JSON.stringify(e.said));
  assert.ok(!e.said.some((x) => x[0] === 'prompt'), 'لا رابط');
  const en = env('en', true);
  const real2 = en.ctx.fetch; en.ctx.fetch = async (url, init) => { await real2(url, init); return { ok: false, status: 409, json: async () => ({ candidates: ['x1', 'x2'] }) }; };
  await en.ctx.adminResetLink('two@x.com');
  assert.ok(en.said.some((x) => x[0] === 'alert' && /More than one account paid with this email/.test(x[1]) && /x1/.test(x[1])));
});

/* ---------- v-owner-reset-scan: المالك بعد #1298 — إيميل علياء نفسه ← «ما في حساب» ثانيةً، وStripe ردّ بلا رفض ولم يُطلع اسمًا ---------- */
test('٩. بريد مخزَّن بحروف كبيرة يُوجد بمسح الجلسات، وشحنة صفحة الدفع اسمها من جلستها، والفحص لا يكتب، و٤٠٤ بأعداد بلا بريد، والمسح محدود', async () => {
  const realFetch = global.fetch, realWarn = console.warn;
  const calls = [], warns = [];
  /* Stripe مصغّر: القوائم الأحدث أوّلًا بـlimit وstarting_after وhas_more؛ مرشّح customer_details[email] يطابق البريد بحروفه كما خُزّن
     (كقائمة العملاء الموثَّقة case-sensitive)؛ metadata الجلسة لا تنتقل إلى شحنتها (لا payment_intent_data) */
  const sessions = [], charges = [], intents = {};
  for (let i = 0; i < 140; i++) sessions.push({ id: 'cs_n' + i, payment_status: 'paid', customer_details: { email: 'buyer' + i + '@x.com' }, metadata: { username: 'buyer' + i } });
  sessions.push({ id: 'cs_case', payment_status: 'paid', customer_details: { email: 'Aliya.Case@iCloud.com' }, metadata: { username: 'Case_User' } }); // الصفحة الثانية
  sessions.push({ id: 'cs_page', payment_status: 'paid', payment_intent: 'pi_page', customer_details: { email: 'typed.other@x.com' }, metadata: { username: 'page_user' } });
  for (let i = 0; i < 130; i++) charges.push({ id: 'ch_n' + i, paid: true, payment_intent: 'pi_n' + i, billing_details: { email: 'buyer' + i + '@x.com' }, metadata: {} });
  charges.push({ id: 'ch_page', paid: true, payment_intent: 'pi_page', billing_details: { email: 'Pay.Page@X.com' }, metadata: {} }); // صفحة الدفع: لا اسم على الشحنة
  charges.push({ id: 'ch_rcpt', paid: true, payment_intent: 'pi_rcpt', billing_details: { email: null }, receipt_email: 'receipt@x.com', metadata: { username: 'rcpt_user' } });
  charges.push({ id: 'ch_orphan', paid: true, billing_details: { email: 'orphan@x.com' }, metadata: {} }); // دفعة لا اسم لها في أيّ مكان
  intents.pi_page = { id: 'pi_page', metadata: {} };
  intents.pi_rcpt = { id: 'pi_rcpt', metadata: { username: 'rcpt_user' } };
  let endless = false;
  const page = (arr, q) => {
    const lim = Math.min(Number(q.get('limit')) || 10, 100);
    const start = q.get('starting_after') ? arr.findIndex((x) => x.id === q.get('starting_after')) + 1 : 0;
    return { data: arr.slice(start, start + lim), has_more: start + lim < arr.length };
  };
  const filler = (kind) => Array.from({ length: 100 }, (_, i) => (kind === 'cs'
    ? { id: 'cs_e' + calls.length + '_' + i, payment_status: 'paid', customer_details: { email: 'e@x.com' }, metadata: { username: 'e' } }
    : { id: 'ch_e' + calls.length + '_' + i, paid: true, billing_details: { email: 'e@x.com' }, metadata: {} }));
  global.fetch = async (url, init) => {
    const u = new URL(String(url));
    const q = u.searchParams;
    calls.push({ path: u.pathname, q: u.search, method: (init && init.method) || 'GET' });
    if (u.origin !== 'https://api.stripe.com') throw new Error('نداء غير Stripe: ' + u);
    let body = { data: [] };
    if (u.pathname === '/v1/checkout/sessions') {
      let arr = sessions;
      if (q.get('customer_details[email]') !== null) arr = arr.filter((s) => s.customer_details.email === q.get('customer_details[email]'));
      if (q.get('payment_intent')) arr = arr.filter((s) => s.payment_intent === q.get('payment_intent'));
      body = endless ? { data: filler('cs'), has_more: true } : page(arr, q);
    } else if (u.pathname === '/v1/charges') {
      body = endless ? { data: filler('ch'), has_more: true } : page(charges, q);
    } else if (u.pathname.startsWith('/v1/payment_intents/')) {
      body = intents[decodeURIComponent(u.pathname.split('/').pop())] || {};
    }
    return { ok: true, status: 200, json: async () => body };
  };
  console.warn = (...a) => { warns.push(a.join(' ')); };
  process.env.STRIPE_SECRET_KEY = 'sk_test_scan';
  const fresh = (u) => auth.putUser(u, { username: u, email: null, hash: 'h', salt: 's' });
  try {
    for (const k of ['case_user', 'page_user', 'rcpt_user']) await fresh(k);
    // ١) فحص بلا رمز: يقول الحساب ولا يكتب شيئًا
    const dry = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'aliya.case@icloud.com', dryRun: true });
    assert.equal(dry.code, 200, JSON.stringify(dry.body));
    assert.equal(dry.body.dryRun, true); assert.equal(dry.body.username, 'case_user'); assert.equal(dry.body.via, 'stripe');
    assert.ok(!dry.body.link, 'لا رابط في الفحص');
    assert.ok(!(await auth.getUser('case_user')).resetTokenHash, 'الفحص لا يكتب رمزًا');
    assert.equal(dry.body.diag.sessions, 1); assert.ok(dry.body.diag.scanned > 100, 'وصل الصفحة الثانية: ' + dry.body.diag.scanned);
    // ٢) مرشِّح Stripe لا يصل «Aliya.Case@iCloud.com» بـ«aliya.case@icloud.com» ← مسح الجلسات يجده (الصفحة الثانية)، والرابط يعمل
    calls.length = 0;
    const r = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'aliya.case@icloud.com' });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.username, 'case_user'); assert.equal(r.body.via, 'stripe');
    const link = new URL(r.body.link);
    assert.equal((await callAuth({ action: 'resetWithToken', username: 'case_user', resetToken: link.searchParams.get('resetToken'), newPassword: 'NewPass123' })).code, 200);
    assert.ok(calls.some((c) => c.path === '/v1/checkout/sessions' && /starting_after=cs_n99/.test(c.q)), 'صفحة ثانية من المسح');
    assert.ok(!calls.some((c) => c.path === '/v1/charges'), 'وُجد قبل الشحنات');
    // ٣) شحنة صفحة الدفع بلا metadata (وجلستها ببريد آخر) ← نيّتها بلا اسم ← جلستها بـpayment_intent
    const pg = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'pay.page@x.com' });
    assert.equal(pg.code, 200, JSON.stringify(pg.body)); assert.equal(pg.body.username, 'page_user');
    // ٤) بريد الإيصال وحده (billing_details بلا بريد) ← metadata الشحنة
    const rc = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'receipt@x.com' });
    assert.equal(rc.code, 200, JSON.stringify(rc.body)); assert.equal(rc.body.username, 'rcpt_user');
    // ٥) فحص بعد رابط قائم لا يُبطله
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'receipt@x.com', dryRun: true })).body.dryRun, true);
    assert.equal((await callAuth({ action: 'resetWithToken', username: 'rcpt_user', resetToken: new URL(rc.body.link).searchParams.get('resetToken'), newPassword: 'NewPass123' })).code, 200, 'الرابط السابق باقٍ');
    // ٦) دفعة بالبريد لا اسم لها في أيّ مكان ← ٤٠٤ بأعداد، والسجلّ أعداد بلا بريد ولا اسم
    warns.length = 0;
    const orphan = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'orphan@x.com' });
    assert.equal(orphan.code, 404);
    assert.equal(orphan.body.diag.matched, 1); assert.equal(orphan.body.diag.unnamed, 1); assert.equal(orphan.body.diag.names, 0);
    assert.equal(orphan.body.diag.partial, false); assert.equal(orphan.body.diag.charges, charges.length);
    assert.ok(warns.some((w) => /reset-link stripe none \{/.test(w)), warns.join(' | '));
    assert.ok(!warns.some((w) => /@|orphan|user/i.test(w.replace('[admin-actions] reset-link stripe none', ''))), 'لا بريد ولا اسم في السجلّ: ' + warns.join(' | '));
    // ٧) بريد لم يدفع ← ٤٠٤ وكلّ ما مُسح معدود
    const none = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody@x.com' });
    assert.equal(none.code, 404);
    assert.equal(none.body.diag.scanned, sessions.length); assert.equal(none.body.diag.matched, 0); assert.equal(none.body.diag.sessions, 0);
    // ٨) Stripe بلا نهاية ← المسح يقف عند ١٠ صفحات لكلّ قائمة ويقول «partial»
    endless = true; calls.length = 0;
    const big = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody@x.com' });
    assert.equal(big.code, 404); assert.equal(big.body.diag.partial, true);
    assert.equal(calls.filter((c) => c.path === '/v1/checkout/sessions' && !/customer_details|payment_intent=/.test(decodeURIComponent(c.q))).length, 10);
    assert.equal(calls.filter((c) => c.path === '/v1/charges').length, 10);
    endless = false;
    // ٩) قراءة فقط
    assert.ok(calls.every((c) => c.method === 'GET'));
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
    global.fetch = realFetch;
    console.warn = realWarn;
  }
});

test('١٠. المراجعة المستقلّة: لكلّ مسح ساعته، والعطب يُعدّ ولا يوقف ما بعده، واسم حساب محذوف لا يوقف البحث قبل الحساب الحيّ', async () => {
  const realFetch = global.fetch, realWarn = console.warn, realNow = Date.now;
  const warns = [];
  let fake = realNow();
  let mode = '';
  const wallet = (email, username) => ({ id: 'ch_' + username, paid: true, payment_intent: 'pi_' + username, billing_details: { email }, metadata: { username } });
  global.fetch = async (url) => {
    const u = new URL(String(url));
    const q = u.searchParams;
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    const fail = (status) => ({ ok: false, status, json: async () => ({ error: { message: 'x' } }) });
    const filter = q.get('customer_details[email]');
    if (u.pathname === '/v1/checkout/sessions' && filter !== null) {
      if (mode === 'flaky') { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; }
      if (filter === 'twice@x.com') return ok({ data: [{ id: 'cs_old', payment_status: 'paid', customer_details: { email: 'twice@x.com' }, metadata: { username: 'gone_old' } }], has_more: false });
      return ok({ data: [], has_more: false });
    }
    if (u.pathname === '/v1/checkout/sessions') {
      if (mode === 'slow') { fake += 3000; return ok({ data: Array.from({ length: 100 }, (_, i) => ({ id: 'cs_s' + fake + '_' + i, payment_status: 'paid', customer_details: { email: 's@x.com' }, metadata: { username: 's' } })), has_more: true }); }
      if (mode === 'flaky') return fail(429);
      return ok({ data: [], has_more: false });
    }
    if (u.pathname === '/v1/customers/search') return mode === 'flaky' ? fail(500) : ok({ data: [] });
    if (u.pathname === '/v1/charges') return ok({ data: [wallet('clock@x.com', 'clock_user'), wallet('flaky@x.com', 'flaky_user'), wallet('twice@x.com', 'twice_new')], has_more: false });
    return ok({ data: [] });
  };
  console.warn = (...a) => { warns.push(a.join(' ')); };
  Date.now = () => fake;
  process.env.STRIPE_SECRET_KEY = 'sk_test_review';
  try {
    for (const k of ['clock_user', 'flaky_user', 'twice_new']) await auth.putUser(k, { username: k, email: null, hash: 'h', salt: 's' });
    await auth.putUser('gone_old', { username: 'gone_old', deleted: true }); // حساب قديم حُذف، ثمّ دفعت بالبريد نفسه من حساب جديد
    // ١) مسح جلسات يستنفد مهلته (٣ ث للصفحة، بلا نهاية) ← مسح الشحنات بساعته يجد دافع Apple/Google Pay
    mode = 'slow';
    const c = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'clock@x.com', dryRun: true });
    assert.equal(c.code, 200, JSON.stringify(c.body)); assert.equal(c.body.username, 'clock_user');
    assert.equal(c.body.diag.partial, true, 'مسح الجلسات انقطع بالمهلة'); assert.ok(c.body.diag.charges >= 1, 'ومسح الشحنات جرى');
    // ٢) مهلة نداء، و٤٢٩ صفحة، و٥٠٠ عملاء ← تُعدّ كلّها ويكمل البحث إلى الشحنات
    mode = 'flaky'; warns.length = 0;
    const fl = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'flaky@x.com', dryRun: true });
    assert.equal(fl.code, 200, JSON.stringify(fl.body)); assert.equal(fl.body.username, 'flaky_user');
    assert.ok(fl.body.diag.errors >= 3 && fl.body.diag.partial === true, JSON.stringify(fl.body.diag));
    assert.ok(warns.some((w) => /checkout\/sessions TimeoutError/.test(w)) && warns.some((w) => /HTTP 429/.test(w)) && warns.some((w) => /customers\/search HTTP 500/.test(w)), warns.join(' | '));
    assert.ok(!warns.some((w) => /@|flaky_user/.test(w)), 'السجلّ بلا بريد ولا اسم');
    const none = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody@x.com' });
    assert.equal(none.code, 404); assert.ok(none.body.diag.errors >= 3 && none.body.diag.partial === true, 'الـ٤٠٤ يقول إنّ البحث لم يكتمل');
    // ٣) المرشِّح يجد اسم حساب محذوف ← لا يقف؛ الشحنات تجد الحساب الحيّ بالبريد نفسه
    mode = '';
    const tw = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'twice@x.com', dryRun: true });
    assert.equal(tw.code, 200, JSON.stringify(tw.body)); assert.equal(tw.body.username, 'twice_new');
    assert.equal(tw.body.diag.names, 2); assert.equal(tw.body.diag.live, 1);
  } finally {
    Date.now = realNow;
    delete process.env.STRIPE_SECRET_KEY;
    global.fetch = realFetch;
    console.warn = realWarn;
  }
});
