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
  assert.deepEqual(yes.sent[0][1], { token: 'tok', action: 'reset-link', targetUsername: 'alya', exact: true }); // v-owner-reset-records: زرّ الصفّ اسمٌ بعينه
  const p = yes.said.find((x) => x[0] === 'prompt');
  assert.ok(p, 'نافذة الرابط');
  assert.equal(p[2], 'https://x.test/?resetToken=ab&ru=alya');
  assert.match(p[1], /valid 30 min/);
});

/* ---------- v-owner-reset-find: الحساب الأقدم من أحدث ٦٠ تسجيلًا — بالإيميل من خانة البحث ---------- */
test('٥. بالإيميل: يُحوَّل إلى حسابه بفهرس البريد ويعمل الرابط، وحساب Google يُقال ولا رمز، والغائب ٤٠٤', async () => {
  /* v-owner-reset-records (المراجعة المستقلّة): الفهرس يعطي رابطًا لبريد مؤكَّد على الحساب — غير المؤكَّد (التسجيل قبل ١٨ أكتوبر قبل
     بريد غيره) اسمٌ محتمل للمالك بلا رمز، وباسمه يأخذ الرابط بعد أن يتحقّق */
  await auth.putUser('alya_unv', { username: 'alya_unv', email: 'aliya.unv@icloud.com', hash: 'h', salt: 's' });
  store.set('db/email-index/aliya.unv@icloud.com', JSON.stringify({ username: 'alya_unv' }));
  const unv = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'aliya.unv@icloud.com' });
  assert.equal(unv.code, 404, JSON.stringify(unv.body)); assert.equal(unv.body.candidates[0], 'alya_unv');
  assert.ok(!(await auth.getUser('alya_unv')).resetTokenHash, 'غير المؤكَّد لا رمز له');
  assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'alya_unv' })).code, 200, 'وباسمه يأخذ الرابط');
  await auth.putUser('alya_old', { username: 'alya_old', email: 'aliya.test@icloud.com', verifiedEmail: 'aliya.test@icloud.com', hash: 'h', salt: 's' });
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
    await auth.putUser('alya_old', { username: 'alya_old', email: 'indexed@x.com', verifiedEmail: 'indexed@x.com', hash: 'h', salt: 's' });
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

/* ---------- v-owner-reset-records: المالك بعد #1303 (Stripe كلّه بلا دفعة بإيميلها) ← «سوّها»: كلّ السجلّات، والاسم، وPayPal — قراءة فقط ---------- */
const paymentsOff = () => { delete process.env.STRIPE_SECRET_KEY; delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_SECRET; };

test('١١. كلّ السجلّات: المؤكَّد بلا فهرس = رابط، وغير المؤكَّد واسم رمز البريد والاسم القريب = أسماء بلا رابط، والفهرس على بريد آخر لا يُتبع، والمختوم يُعدّ، والاسم القديم يُتبع', async () => {
  paymentsOff();
  const realWarn = console.warn;
  const warns = [];
  console.warn = (...a) => { warns.push(a.join(' ')); };
  try {
    // ١) بريد مؤكَّد على حسابه ولا فهرس له ← رابط (via record) يعمل
    await auth.putUser('amy_v', { username: 'amy_v', email: 'amy.v@x.com', verifiedEmail: 'amy.v@x.com', hash: 'h', salt: 's' });
    const r = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'Amy.V@X.com' });
    assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.username, 'amy_v'); assert.equal(r.body.via, 'record');
    assert.equal((await callAuth({ action: 'resetWithToken', username: 'amy_v', resetToken: new URL(r.body.link).searchParams.get('resetToken'), newPassword: 'NewPass123' })).code, 200);
    // ٢) صندوق Gmail ربطه صاحبه بـOAuth (وبريد الحساب فارغ) ← إثبات قويّ
    await auth.putUser('gm_user', { username: 'gm_user', email: null, emailAssist: { gmailAddress: 'Gm.User@Gmail.com' }, hash: 'h', salt: 's' });
    const gm = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'gm.user@gmail.com', dryRun: true });
    assert.equal(gm.code, 200, JSON.stringify(gm.body)); assert.equal(gm.body.username, 'gm_user'); assert.ok(!(await auth.getUser('gm_user')).resetTokenHash, 'الفحص لا يكتب');
    // ٣) علياء: لا فهرس ولا دفع — بريد مكتوب بلا تأكيد، واسم رمز البريد، واسم قريب = أسماء للمالك بالترتيب، بلا رمز لأحد
    await auth.putUser('aliyaalshams_1a2b3c', { username: 'aliyaalshams_1a2b3c', email: null, otpOnly: true, hash: 'h', salt: 's', createdAt: 2 });
    await auth.putUser('aliya_rose', { username: 'Aliya_Rose', email: null, hash: 'h', salt: 's', createdAt: 3 });
    await auth.putUser('planted', { username: 'planted', email: 'aliya.alshamsi181@icloud.com', hash: 'h', salt: 's', createdAt: 1 });
    await auth.putUser('aliya_gone', { username: 'aliya_gone', email: 'aliya.alshamsi181@icloud.com', verifiedEmail: 'aliya.alshamsi181@icloud.com', deleted: true });
    await auth.putUser('boss', { username: 'boss', email: 'aliya.alshamsi181@icloud.com', verifiedEmail: 'aliya.alshamsi181@icloud.com', hash: 'h', salt: 's' });
    store.set('db/users/sealed_one.json', JSON.stringify({ enc: 1, iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', data: 'AAAA' }));
    warns.length = 0;
    const al = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'aliya.alshamsi181@icloud.com' });
    assert.equal(al.code, 404, JSON.stringify(al.body));
    assert.deepEqual(al.body.candidates.slice(0, 3), ['planted', 'aliyaalshams_1a2b3c', 'aliya_rose'], JSON.stringify(al.body.candidates));
    assert.ok(!al.body.candidates.includes('aliya_gone') && !al.body.candidates.includes('boss'), 'لا محذوف ولا المالك');
    for (const k of ['planted', 'aliyaalshams_1a2b3c', 'aliya_rose']) assert.ok(!(await auth.getUser(k)).resetTokenHash, 'لا رمز لـ' + k);
    assert.ok(al.body.records.sealed >= 1 && al.body.records.partial === true, 'المختوم يُعدّ: ' + JSON.stringify(al.body.records));
    assert.equal(al.body.paypal.off, true, 'بلا مفاتيح PayPal لا بحث');
    assert.ok(warns.some((w) => /reset-link records \{/.test(w)), warns.join(' | '));
    assert.ok(!warns.some((w) => /@|aliya|planted|rose/i.test(w)), 'السجلّ بلا بريد ولا اسم: ' + warns.join(' | '));
    store.delete('db/users/sealed_one.json');
    // ٣ب) مرشَّح ضعيف واحد (بريد مكتوب بلا تأكيد) ← اسمه للمالك، لا رابط ولو كان وحيدًا
    await auth.putUser('solo_u', { username: 'solo_u', email: 'solo@x.com', hash: 'h', salt: 's' });
    const solo = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'solo@x.com' });
    assert.equal(solo.code, 404, JSON.stringify(solo.body)); assert.deepEqual(solo.body.candidates, ['solo_u']);
    assert.ok(!(await auth.getUser('solo_u')).resetTokenHash, 'المرشَّح الوحيد الضعيف لا رابط له');
    // ٤) بريد مؤكَّد على حسابين ← ٤٠٩ (kind record) بلا رمز
    await auth.putUser('twin_a', { username: 'twin_a', email: 'twin@x.com', verifiedEmail: 'twin@x.com', hash: 'h', salt: 's' });
    await auth.putUser('twin_b', { username: 'twin_b', email: 'twin@x.com', verifiedEmail: 'twin@x.com', hash: 'h', salt: 's' });
    const tw = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'twin@x.com' });
    assert.equal(tw.code, 409); assert.equal(tw.body.kind, 'record'); assert.deepEqual([...tw.body.candidates].sort(), ['twin_a', 'twin_b']);
    assert.ok(!(await auth.getUser('twin_a')).resetTokenHash && !(await auth.getUser('twin_b')).resetTokenHash);
    // ٥) فهرس يشير إلى حساب تغيّر بريده ← لا يُتبع ولا رمز له
    await auth.putUser('oldie', { username: 'oldie', email: 'new@x.com', verifiedEmail: 'new@x.com', hash: 'h', salt: 's' });
    store.set('db/email-index/stale@x.com', JSON.stringify({ username: 'oldie' }));
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'stale@x.com' })).code, 404);
    assert.ok(!(await auth.getUser('oldie')).resetTokenHash, 'الفهرس القديم لا يعطي رابطًا لحساب آخر');
    // ٦) بالاسم: نصّ بلا @ لا حساب له بالضبط ← أسماء فيها النصّ (والعربيّ)، والمحذوف خارجها، والقصير جدًّا لا شيء
    await auth.putUser('عليا_٩', { username: 'عليا_٩', hash: 'h', salt: 's' });
    const nm = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'Aliya' });
    assert.equal(nm.code, 404);
    assert.ok(nm.body.candidates.includes('aliya_rose') && nm.body.candidates.includes('aliyaalshams_1a2b3c') && !nm.body.candidates.includes('aliya_gone'), JSON.stringify(nm.body.candidates));
    assert.deepEqual((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'عليا' })).body.candidates, ['عليا_٩']);
    assert.deepEqual((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'al' })).body.candidates, []);
    // ٧) اسم قديم تغيّر ← حسابه الحيّ؛ واسم قديم يقود إلى المالك ← ٤٠٠
    await auth.putUser('rose_old', { username: 'rose_old', deleted: true, movedTo: 'aliya_rose' });
    const mv = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'rose_old', dryRun: true });
    assert.equal(mv.code, 200, JSON.stringify(mv.body)); assert.equal(mv.body.username, 'aliya_rose');
    await auth.putUser('boss_old', { username: 'boss_old', deleted: true, movedTo: 'boss' });
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'boss_old' })).code, 400);
  } finally { console.warn = realWarn; }
});

const ppMock = (handler) => async (url, init) => {
  const u = new URL(String(url));
  if (u.origin !== 'https://api-m.paypal.com') throw new Error('نداء غير PayPal: ' + u);
  if (u.pathname === '/v1/oauth2/token') return { ok: true, status: 200, json: async () => ({ access_token: 'tok_test', scope: 'openid' }) };
  return handler(u, init);
};
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, name) => ({ ok: false, status, json: async () => ({ name: name || 'X' }) });

test('١٢. PayPal بطلباتنا: حجز الشحن وآخر طلب في السجلّ ← بريد الدافع من الطلب، والاسم من عندنا لا من reference_id، والملغى لا يُقرأ، والبحث الكامل المقفل يقف من أوّل نداء', async () => {
  paymentsOff();
  process.env.PAYPAL_CLIENT_ID = 'id_test'; process.env.PAYPAL_SECRET = 'sec_test';
  const realFetch = global.fetch, realWarn = console.warn;
  const calls = [], warns = [];
  const orders = {
    ORD1: { id: 'ORD1', payer: { email_address: 'Pay.Pal@X.com' }, purchase_units: [{ reference_id: 'someone_else' }] },
    ORD2: { id: 'ORD2', payer: { email_address: 'revoked@x.com' }, purchase_units: [{ reference_id: 'rv_user' }] },
    ORD3: { id: 'ORD3', payer: { email_address: 'old.payer@x.com' }, purchase_units: [{ reference_id: 'default' }] },
  };
  global.fetch = ppMock(async (u, init) => {
    calls.push({ path: u.pathname, method: (init && init.method) || 'GET' });
    const m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
    if (m) return orders[m[1]] ? ok(orders[m[1]]) : fail(404, 'RESOURCE_NOT_FOUND');
    if (u.pathname === '/v1/reporting/transactions') return fail(403, 'NOT_AUTHORIZED');
    return fail(404);
  });
  console.warn = (...a) => { warns.push(a.join(' ')); };
  try {
    for (const k of ['pp_user', 'rv_user', 'someone_else']) await auth.putUser(k, { username: k, email: null, hash: 'h', salt: 's' });
    await auth.putUser('pp_old', { username: 'pp_old', email: null, lastPaypalOrderId: 'ORD3', hash: 'h', salt: 's' });
    store.set('paid:lastPaypalOrderId:ORD1', 'pp_user');
    store.set('paid:lastPaypalOrderId:ORD2', '!revoked:evt_1');
    store.set('paid:lastPaypalOrderId:ORD_GONE', 'pp_user'); // طلب لا يعود من PayPal (٤٠٤): ليس عطبًا
    // ١) حجز الشحن ← الاسم من الحجز (pp_user) لا من reference_id
    const a = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'pay.pal@x.com' });
    assert.equal(a.code, 200, JSON.stringify(a.body)); assert.equal(a.body.username, 'pp_user'); assert.equal(a.body.via, 'paypal');
    // ٢) آخر طلب في السجلّ — و«default» في الطلب لا يهمّ
    const b = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'Old.Payer@X.com', dryRun: true });
    assert.equal(b.code, 200, JSON.stringify(b.body)); assert.equal(b.body.username, 'pp_old'); assert.equal(b.body.via, 'paypal');
    assert.equal(b.body.paypal.ordersMatched, 1); assert.equal(b.body.paypal.errors, 0, '٤٠٤ طلب قديم ليس عطبًا: ' + JSON.stringify(b.body.paypal));
    // ٣) حجز ملغى ← لا يُقرأ طلبه؛ والبحث الكامل مقفل (٤٠٣) ← denied ويقف من أوّل نداء
    calls.length = 0;
    const c = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'revoked@x.com' });
    assert.equal(c.code, 404); assert.equal(c.body.paypal.denied, true);
    assert.ok(!calls.some((x) => x.path === '/v2/checkout/orders/ORD2'), 'الملغى لا يُقرأ');
    assert.equal(calls.filter((x) => x.path === '/v1/reporting/transactions').length, 1, 'المقفل يقف من أوّل نداء');
    assert.ok(!(await auth.getUser('rv_user')).resetTokenHash);
    // ٤) قراءة فقط، والسجلّ بلا بريد ولا اسم ولا رقم
    assert.ok(calls.every((x) => x.method === 'GET'), JSON.stringify(calls));
    assert.ok(!warns.some((w) => /@|pp_user|pp_old|ORD\d|ORD_GONE/.test(w)), warns.join(' | '));
  } finally {
    delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_SECRET;
    global.fetch = realFetch; console.warn = realWarn;
    for (const k of ['ORD1', 'ORD2', 'ORD_GONE']) store.delete('paid:lastPaypalOrderId:' + k);
  }
});

test('١٣. Transaction Search: نوافذ ٣٠ يومًا بتاريخ Z حتّى بدء PayPal، والدفعة لنا مرّة واحدة، والاسم بدليل منح لا reference_id وحده ولا «default»', async () => {
  paymentsOff();
  process.env.PAYPAL_CLIENT_ID = 'id_test'; process.env.PAYPAL_SECRET = 'sec_test';
  const realFetch = global.fetch;
  const windows = [];
  const tx = (email, id, code, value) => ({ transaction_info: { transaction_id: id, transaction_event_code: code, transaction_amount: { value: String(value), currency_code: 'USD' } }, payer_info: { email_address: email } });
  const caps = { CAP_OK: 'ORD_OK', CAP_SPOOF: 'ORD_SPOOF', CAP_DEF: 'ORD_DEF' };
  const refs = { ORD_OK: 'ref_user', ORD_SPOOF: 'victim', ORD_DEF: 'default' };
  const paidAt = Date.now() - 40 * 86400000; // الدفعات في النافذة الثانية من كلّ بحث
  global.fetch = ppMock(async (u) => {
    if (u.pathname === '/v1/reporting/transactions') {
      const ws = u.searchParams.get('start_date'), we = u.searchParams.get('end_date');
      windows.push([ws, we, u.searchParams.get('fields'), u.searchParams.get('page_size')]);
      return ok({ transaction_details: (Date.parse(ws) <= paidAt && paidAt < Date.parse(we)) ? [
        tx('Search.Payer@X.com', 'CAP_OK', 'T0006', 10), tx('search.payer@x.com', 'CAP_OK', 'T0006', 10), // مكرّر
        tx('search.payer@x.com', 'REF_1', 'T1107', -10), // استرداد
        tx('search.payer@x.com', 'OUT_1', 'T0000', -15), // دفعة صادرة منّا إلى البريد نفسه — ليست دفعة لنا
        tx('spoof@x.com', 'CAP_SPOOF', 'T0006', 20), tx('def@x.com', 'CAP_DEF', 'T0006', 5),
      ] : [], total_pages: 1, page: 1 });
    }
    let m = u.pathname.match(/^\/v2\/payments\/captures\/([^/]+)$/);
    if (m) return caps[m[1]] ? ok({ id: m[1], supplementary_data: { related_ids: { order_id: caps[m[1]] } } }) : fail(404);
    m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
    if (m && refs[m[1]]) return ok({ id: m[1], payer: { email_address: 'other@x.com' }, purchase_units: [{ reference_id: refs[m[1]] }] });
    return fail(404);
  });
  try {
    await auth.putUser('ref_user', { username: 'ref_user', email: null, lastPaypalOrderId: 'ORD_OK', hash: 'h', salt: 's' });
    await auth.putUser('victim', { username: 'victim', email: null, lastPaypalOrderId: 'ORD_REAL', hash: 'h', salt: 's' });
    await auth.putUser('default', { username: 'default', email: null, hash: 'h', salt: 's' });
    // ١) الدفعة (مكرّرة في التقرير) ← الالتقاط ← الطلب ← آخر طلب شُحن لحساب ref_user
    const a = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'search.payer@x.com', dryRun: true });
    assert.equal(a.code, 200, JSON.stringify(a.body)); assert.equal(a.body.username, 'ref_user'); assert.equal(a.body.paypal.matched, 1, 'المكرّر والاسترداد لا يُعدّان');
    const { PAYPAL_FROM } = require('../api/_lib/owner-lookup.js');
    assert.ok(windows.length >= 2);
    for (const [s, e, fields, size] of windows) {
      assert.match(s, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/); assert.match(e, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      assert.ok(Date.parse(e) - Date.parse(s) <= 31 * 86400000 && Date.parse(e) > Date.parse(s), s + ' → ' + e);
      assert.equal(fields, 'transaction_info,payer_info'); assert.equal(size, '500');
    }
    assert.equal(Date.parse(windows[windows.length - 1][0]), PAYPAL_FROM, 'آخر نافذة تبدأ من بدء PayPal في التطبيق');
    assert.ok(Math.abs(Date.parse(windows[0][1]) - Date.now()) < 60000, 'أوّل نافذة تنتهي الآن');
    // ٢) reference_id لحساب آخر بلا دليل منح ← لا اسم ولا رمز؛ و«default» ليس اسمًا وإن وُجد حساب بهذا الاسم
    const s = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'spoof@x.com' });
    assert.equal(s.code, 404); assert.equal(s.body.paypal.unnamed, 1); assert.ok(!(await auth.getUser('victim')).resetTokenHash);
    const d = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'def@x.com' });
    assert.equal(d.code, 404); assert.ok(!(await auth.getUser('default')).resetTokenHash);
    // ٣) دليل المنح بلا مسح السجلّات (o.orders فارغ): reference_id يُقبل إذا كان آخر طلب شُحن لذلك الحساب هو هذا الطلب
    const lookup = require('../api/_lib/owner-lookup.js');
    const got = await lookup.paypalAccountsFor(['search.payer@x.com'], auth.liveAccount, { diag: {}, kv: { kvList: async () => [], kvGetRaw: async () => null }, payRefund: { findRec: async () => null } });
    assert.deepEqual(got, ['ref_user']);
  } finally {
    delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_SECRET;
    global.fetch = realFetch;
  }
});

test('١٤. الواجهة: أسماء محتملة بلا رابط، وأين بحثت، وبحث PayPal المقفل، و٤٠٩ السجلّات، والزرّ ينشغل أثناء البحث', async () => {
  const mk = (body, status, lang) => {
    const e = env(lang || 'ar', true);
    const real = e.ctx.fetch;
    e.ctx.fetch = async (url, init) => { await real(url, init); return { ok: status < 400, status, json: async () => body }; };
    return e;
  };
  const maybe = mk({ error: 'user not found', candidates: ['planted', 'aliya_rose'], records: { records: 9 }, paypal: { denied: true } }, 404);
  await maybe.ctx.adminResetLink('aliya.alshamsi181@icloud.com');
  const a = maybe.said.find((x) => x[0] === 'alert');
  assert.ok(a && a[1].includes('حسابات محتملة') && a[1].includes('planted') && a[1].includes('aliya_rose') && a[1].includes('Transaction search'), JSON.stringify(maybe.said));
  assert.ok(!maybe.said.some((x) => x[0] === 'prompt'), 'لا رابط');
  const none = mk({ error: 'user not found', candidates: [], records: { records: 9 }, paypal: { denied: false } }, 404, 'en');
  await none.ctx.adminResetLink('x@y.com');
  const b = none.said.find((x) => x[0] === 'alert');
  assert.ok(/No account with this email or username/.test(b[1]) && /Ask the person for their username/.test(b[1]) && !/Transaction search/.test(b[1]), b[1]);
  const plain = mk({ error: 'user not found' }, 404);
  await plain.ctx.adminResetLink('someone');
  assert.ok(!plain.said.find((x) => x[0] === 'alert')[1].includes('دوّرت'), 'بحث الاسم لا يقول «دوّرت في Stripe…»');
  const rec409 = mk({ error: 'multiple accounts', kind: 'record', candidates: ['twin_a', 'twin_b'] }, 409);
  await rec409.ctx.adminResetLink('twin@x.com');
  const c = rec409.said.find((x) => x[0] === 'alert');
  assert.ok(c && c[1].includes('أكثر من حساب أثبت هذا الإيميل') && c[1].includes('twin_b') && !c[1].includes('دفع بهذا الإيميل'), JSON.stringify(rec409.said));
  // الزرّ جار الخانة ينشغل أثناء البحث ثمّ يعود
  const busy = env('ar', true);
  const row = busy.ctx.document.createElement('div');
  const input = busy.ctx.document.createElement('input'); input.id = 'adminResetInput'; input.value = 'x@y.com';
  const btn = busy.ctx.document.createElement('button');
  row.appendChild(input); row.appendChild(btn); busy.ctx.document.body.appendChild(row);
  let during = null;
  busy.ctx.fetch = async () => { during = { disabled: btn.disabled, busy: btn.getAttribute('aria-busy') }; return { ok: false, status: 404, json: async () => ({ error: 'user not found' }) }; };
  await busy.ctx.adminResetLinkFind();
  assert.deepEqual(during, { disabled: true, busy: 'true' });
  assert.equal(btn.disabled, false); assert.equal(btn.getAttribute('aria-busy'), null);
});

/* ---------- v-owner-reset-records: ملاحظات المراجعة المستقلّة (كلّها مثبتة بمحاكاة، ومصلحة) ---------- */
test('١٥. المراجعة المستقلّة: الزرع لا يسبق صاحب البريد، والاسم «@» ليس دليلًا، والإثبات قبل الدفع، وهويّة Google وحدها جوابها Google، والمختوم لا يُسقط البحث، والاسم المُعاد لا يأخذ رابط الدافع، والفحص لا يعيد التشفير', async () => {
  paymentsOff();
  const realFetch = global.fetch, realWarn = console.warn;
  console.warn = () => {};
  try {
    // ١) فهرس كتبه زارع (بريد غير مؤكَّد) وصاحب البريد دخل بـGoogle ← جواب Google، ولا رمز للزارع
    await auth.putUser('planter1', { username: 'planter1', email: 'victim.one@gmail.com', hash: 'h', salt: 's' });
    store.set('db/email-index/victim.one@gmail.com', JSON.stringify({ username: 'planter1' }));
    await auth.putUser('g_victim.one@gmail.com', { username: 'Victim', email: 'victim.one@gmail.com', verifiedEmail: 'victim.one@gmail.com', googleAuth: true });
    const v = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'victim.one@gmail.com' });
    assert.deepEqual(v.body, { ok: false, google: true, username: 'g_victim.one@gmail.com' });
    assert.ok(!(await auth.getUser('planter1')).resetTokenHash, 'لا رمز للزارع');
    // ٢) اسم مستخدم هو البريد نفسه (قديم، بلا بريد) وصاحب البريد المؤكَّد حساب آخر ← الرابط للمؤكَّد
    await auth.putUser('sara.k@outlook.com', { username: 'sara.k@outlook.com', email: null, hash: 'h', salt: 's' });
    await auth.putUser('sara_k', { username: 'sara_k', email: 'sara.k@outlook.com', verifiedEmail: 'sara.k@outlook.com', hash: 'h', salt: 's' });
    const sk = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'sara.k@outlook.com', dryRun: true });
    assert.equal(sk.code, 200, JSON.stringify(sk.body)); assert.equal(sk.body.username, 'sara_k'); assert.equal(sk.body.via, 'record');
    // ٣) الإثبات قبل الدفع: Gmail ربطه حساب، وStripe فيه دفعة لحساب آخر بالبريد نفسه ← المُثبِت، ولا نداء Stripe
    process.env.STRIPE_SECRET_KEY = 'sk_test_order';
    const stripeCalls = [];
    global.fetch = async (url) => { stripeCalls.push(String(url)); return { ok: true, status: 200, json: async () => ({ data: [{ id: 'cs_x', payment_status: 'paid', customer_details: { email: 'nora.h@gmail.com' }, metadata: { username: 'payer_a' } }], has_more: false }) }; };
    await auth.putUser('payer_a', { username: 'payer_a', email: null, hash: 'h', salt: 's' });
    await auth.putUser('nora_mail', { username: 'nora_mail', email: null, emailAssist: { gmailAddress: 'nora.h@gmail.com' }, hash: 'h', salt: 's' });
    const no = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nora.h@gmail.com', dryRun: true });
    assert.equal(no.body.username, 'nora_mail', JSON.stringify(no.body)); assert.equal(stripeCalls.length, 0, 'المُثبِت قبل الدفع');
    delete process.env.STRIPE_SECRET_KEY; global.fetch = realFetch;
    // ٤) حساب Google بهويّة أخرى ربط Gmail شخصيًّا ← رابط (لا «ادخل بـGoogle بهذا البريد» الذي يُنشئ حسابًا فارغًا)
    await auth.putUser('huda', { username: 'huda', email: 'work@company.com', verifiedEmail: 'work@company.com', googleAuth: true, prevUsernames: ['g_work@company.com'], emailAssist: { gmailAddress: 'huda.personal@gmail.com' }, hash: 'h', salt: 's' });
    const hu = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'huda.personal@gmail.com', dryRun: true });
    assert.equal(hu.code, 200, JSON.stringify(hu.body)); assert.equal(hu.body.dryRun, true); assert.equal(hu.body.username, 'huda');
    // ٥) PayPal: دافعٌ سجلّه مختوم لا يُسقط البحث (كان ٥٠٠) ← الدافع الحيّ
    process.env.PAYPAL_CLIENT_ID = 'id_test'; process.env.PAYPAL_SECRET = 'sec_test';
    const orders = { ORD_S: { payer: { email_address: 'payer.t@x.com' }, create_time: '2026-09-01T10:00:00Z' }, ORD_L: { payer: { email_address: 'payer.t@x.com' }, create_time: '2026-09-02T10:00:00Z' },
      ORD_R: { payer: { email_address: 'old.reused@x.com' }, create_time: '2026-08-01T10:00:00Z' } };
    global.fetch = ppMock(async (u) => {
      const m = u.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
      if (m) return orders[m[1]] ? ok(Object.assign({ id: m[1] }, orders[m[1]])) : fail(404);
      if (u.pathname === '/v1/reporting/transactions') return fail(403, 'NOT_AUTHORIZED');
      return fail(404);
    });
    store.set('db/users/sealed_pp.json', JSON.stringify({ enc: 1, iv: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', data: 'AAAA' }));
    await auth.putUser('live_pp', { username: 'live_pp', email: null, hash: 'h', salt: 's', createdAt: Date.parse('2026-08-15T00:00:00Z') });
    store.set('paid:lastPaypalOrderId:ORD_S', 'sealed_pp');
    store.set('paid:lastPaypalOrderId:ORD_L', 'live_pp');
    const pt = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'payer.t@x.com', dryRun: true });
    assert.equal(pt.code, 200, JSON.stringify(pt.body)); assert.equal(pt.body.username, 'live_pp'); assert.ok(pt.body.paypal.errors >= 1);
    // ٦) اسم حُرّر بعد الدفع وسجّله غيره ← لا رابط له
    await auth.putUser('reused', { username: 'reused', email: null, hash: 'h', salt: 's', createdAt: Date.parse('2026-10-25T00:00:00Z') });
    store.set('paid:lastPaypalOrderId:ORD_R', 'reused');
    const ru = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'old.reused@x.com' });
    assert.equal(ru.code, 404, JSON.stringify(ru.body)); assert.equal(ru.body.paypal.reused, 1); assert.ok(!(await auth.getUser('reused')).resetTokenHash);
    // ٧) مفاتيح PayPal موجودة ولا رمز ← عطب (البحث لم يكتمل)، لا «غير مفعّل»
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'invalid_client' }) });
    const tk = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody.tk@x.com' });
    assert.equal(tk.code, 404); assert.equal(tk.body.paypal.off, false); assert.equal(tk.body.paypal.errors, 1); assert.equal(tk.body.complete, false);
    for (const k of ['ORD_S', 'ORD_L', 'ORD_R']) store.delete('paid:lastPaypalOrderId:' + k);
    store.delete('db/users/sealed_pp.json');
    delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_SECRET; global.fetch = realFetch;
    // ٨) الفحص لا يعيد تشفير سجلّ بالسرّ السابق (كان getUserOnce يكتبه)، والرابط الحقيقيّ يكتب بالسرّ الحاليّ
    const cur = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'سرّ-قديم';
    await auth.putUser('rekey_me', { username: 'rekey_me', email: 'rekey@x.com', verifiedEmail: 'rekey@x.com', hash: 'h', salt: 's' });
    process.env.AUTH_SECRET = cur; process.env.AUTH_SECRET_PREVIOUS = 'سرّ-قديم';
    try {
      const before = store.get('db/users/rekey_me.json');
      const dr = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'rekey@x.com', dryRun: true });
      assert.equal(dr.code, 200, JSON.stringify(dr.body)); assert.equal(dr.body.username, 'rekey_me');
      assert.equal(store.get('db/users/rekey_me.json'), before, 'الفحص لم يكتب السجلّ');
      const real = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'rekey_me' });
      assert.equal(real.code, 200); assert.notEqual(store.get('db/users/rekey_me.json'), before, 'الرابط يكتب الرمز');
    } finally { delete process.env.AUTH_SECRET_PREVIOUS; }
  } finally {
    delete process.env.STRIPE_SECRET_KEY; delete process.env.PAYPAL_CLIENT_ID; delete process.env.PAYPAL_SECRET;
    global.fetch = realFetch; console.warn = realWarn;
  }
});

test('١٥ب. مراجعة الخصوصيّة: اسم «@» قديم بلا منافس يبقى حسابه، وزرّ الجدول اسمٌ بعينه، وعلامات الاتّجاه المخفيّة تُشال، وPayPal غير المربوط بحثٌ لم يكتمل', async () => {
  paymentsOff();
  const realWarn = console.warn, realFetchB = global.fetch;
  console.warn = () => {};
  try {
    // ١) اسم مستخدم هو بريد (قديم، بلا بريد مؤكَّد) ولا أحد غيره يدّعي البريد ← هو الحساب (والمالك يراه في الفحص قبل التأكيد)
    await auth.putUser('legacy.at@x.com', { username: 'legacy.at@x.com', email: null, hash: 'h', salt: 's' });
    const lg = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'legacy.at@x.com', dryRun: true });
    assert.equal(lg.code, 200, JSON.stringify(lg.body)); assert.equal(lg.body.username, 'legacy.at@x.com'); assert.equal(lg.body.via, 'name');
    // ٢) ومع منافس يدّعي البريد بلا إثبات ← أسماء لا رابط
    await auth.putUser('rival_c', { username: 'rival_c', email: 'legacy.at@x.com', hash: 'h', salt: 's' });
    const rv = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'legacy.at@x.com' });
    assert.equal(rv.code, 404, JSON.stringify(rv.body)); assert.ok(rv.body.candidates.includes('legacy.at@x.com') && rv.body.candidates.includes('rival_c'));
    // ٣) زرّ الجدول (exact) يعطي الحساب نفسه ولو كان غيره أثبت البريد (sara_k من ١٥)
    const ex = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'sara.k@outlook.com', exact: true, dryRun: true });
    assert.equal(ex.code, 200, JSON.stringify(ex.body)); assert.equal(ex.body.username, 'sara.k@outlook.com');
    // ٤) علامات الاتّجاه المخفيّة (من تنبيه الأسماء أو محادثة عربيّة) لا تُضيّع الحساب
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: '⁨aliya_rose⁩', dryRun: true })).body.username, 'aliya_rose');
    assert.equal((await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: '‏amy.v@x.com', dryRun: true })).body.username, 'amy_v');
    // ٥) بلا مفاتيح PayPal (ولا Stripe) ← البحث لم يكتمل، لا «دوّرت في كلّ شيء»
    const off = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody.off@x.com' });
    assert.equal(off.code, 404); assert.equal(off.body.paypal.off, true); assert.equal(off.body.complete, false);
    // ٦) Stripe مربوط وبحث كاملًا، وPayPal وحده غير مربوط ← ما زال «لم يكتمل»
    process.env.STRIPE_SECRET_KEY = 'sk_test_off';
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: [], has_more: false }) });
    const ppOff = await callAdmin({ token: ownerToken(), action: 'reset-link', targetUsername: 'nobody.off@x.com' });
    assert.equal(ppOff.code, 404); assert.ok(!ppOff.body.diag.off && !ppOff.body.diag.partial, JSON.stringify(ppOff.body.diag));
    assert.equal(ppOff.body.paypal.off, true); assert.equal(ppOff.body.complete, false, 'PayPal غير المربوط ليس «بحثت فيه»');
  } finally { console.warn = realWarn; delete process.env.STRIPE_SECRET_KEY; global.fetch = realFetchB; }
});

test('١٦. الواجهة: خانة البحث تفحص أوّلًا بلا كتابة وتؤكّد على الاسم الذي وُجد، والرفض لا يُنشئ رابطًا، والبحث غير المكتمل يقول ذلك', async () => {
  const flow = (answer, first) => {
    const e = env('ar', answer);
    const row = e.ctx.document.createElement('div');
    const input = e.ctx.document.createElement('input'); input.id = 'adminResetInput'; input.value = ' Aliya@iCloud.com ';
    row.appendChild(input); row.appendChild(e.ctx.document.createElement('button')); e.ctx.document.body.appendChild(row);
    e.ctx.fetch = async (url, init) => {
      const body = JSON.parse(init.body); e.sent.push([String(url), body]);
      return body.dryRun ? (first || { ok: true, status: 200, json: async () => ({ ok: true, dryRun: true, username: 'alya_old', via: 'record' }) })
        : { ok: true, status: 200, json: async () => ({ ok: true, link: 'https://x.test/?resetToken=cd&ru=alya_old', minutes: 30, username: 'alya_old' }) };
    };
    return e;
  };
  const yes = flow(true);
  await yes.ctx.adminResetLinkFind();
  assert.deepEqual(yes.sent.map((x) => [x[1].targetUsername, !!x[1].dryRun]), [['Aliya@iCloud.com', true], ['alya_old', false]], 'فحص ثمّ رابط باسم الحساب نفسه');
  const c = yes.said.find((x) => x[0] === 'confirm');
  assert.ok(c && c[1].includes('alya_old') && c[1].includes('Aliya@iCloud.com'), 'التأكيد يذكر الحساب الذي وُجد: ' + (c && c[1]));
  assert.ok(yes.said.some((x) => x[0] === 'prompt' && x[2].includes('ru=alya_old')));
  const no = flow(false);
  await no.ctx.adminResetLinkFind();
  assert.equal(no.sent.length, 1, 'الرفض بعد الفحص لا يطلب رابطًا'); assert.ok(!no.said.some((x) => x[0] === 'prompt'));
  const part = flow(true, { ok: false, status: 404, json: async () => ({ error: 'user not found', candidates: [], records: { records: 3 }, complete: false, paypal: { denied: false } }) });
  await part.ctx.adminResetLinkFind();
  const a = part.said.find((x) => x[0] === 'alert');
  assert.ok(a && a[1].includes('ما اكتمل البحث') && !a[1].includes('دوّرت في'), a && a[1]);
  assert.equal(part.sent.length, 1);
  // اسم بلا @ ← «أسماء قريبة» لا «يثبت هذا الإيميل»؛ ورفض الخادم بنصّ مترجم، وصفحة خطأ نصّيّة لا ترمي
  const mk2 = (body, status, text) => { const e = env('ar', true); e.ctx.fetch = async () => ({ ok: status < 400, status, json: async () => { if (text) throw new SyntaxError('Unexpected token'); return body; } }); return e; };
  const nm = mk2({ error: 'user not found', candidates: ['aliya_rose'] }, 404);
  await nm.ctx.adminResetLink('aliya');
  assert.ok(nm.said.find((x) => x[0] === 'alert')[1].includes('ما في حساب بهذا الاسم بالضبط'));
  const fb = mk2({ error: 'forbidden' }, 403);
  await fb.ctx.adminResetLink('x');
  assert.ok(fb.said.find((x) => x[0] === 'alert')[1].includes('غير مصرح'));
  const tx = mk2(null, 504, true);
  await tx.ctx.adminResetLink('x');
  const t = tx.said.find((x) => x[0] === 'alert')[1];
  assert.ok(t.includes('فشل') && t.includes('HTTP 504') && !/Unexpected|SyntaxError/.test(t), t);
});
