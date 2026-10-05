// tests/pay-once.test.cjs — فحص الاشتراكات (٥ أكتوبر ٢٠٢٦، قرار المالك «ابدأ ١ ٢ ٣»):
//   v-pay-once    كلّ رقم دفعة يُشحن مرّة وحدة (حجز ذرّيّ SET NX) — كان يتذكّر آخر دفعة وحدها وبلا قفل:
//                 دفعتان بالتناوب تُشحنان بلا نهاية، وعشرة تحقّقات متزامنة لدفعة واحدة تُشحن عشر مرّات.
//   v-pay-seed    الشراء قبل أوّل صرف يبذر الرصيد من سجلّ الحساب لا من صفر (كان ٧٠ + ١٠٠ = ١٠٠).
//   v-paypal-honest  لا التقاط بلا حساب، وفشل الشحن بعد السحب يُسجَّل ويُردّ credited:false، وclaim يعيده مرّة.
//   v-rename-move  التجديد يتبع الحساب بعد تغيير اسمه، وإيقاف التجديد يجد الاشتراك بالاسم السابق.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

process.env.AUTH_SECRET = 'pay-once-test-secret';
const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };

const kv = new Map();
const users = new Map();
let failIncr = 0;
const kvApi = {
  kvGetRaw: async (k) => (kv.has(k) ? String(kv.get(k)) : null),
  kvSetRaw: async (k, v) => { kv.set(k, String(v)); },
  kvSetIfAbsent: async (k, v) => { await new Promise((r) => setImmediate(r)); if (kv.has(k)) return false; kv.set(k, String(v)); return true; },
  kvIncrBy: async (k, n) => { if (failIncr > 0) { failIncr--; throw new Error('ERR DB capacity quota exceeded'); } const v = Number(kv.get(k) || 0) + Number(n); kv.set(k, String(v)); return v; },
  kvDecrBy: async (k, n) => { const v = Number(kv.get(k) || 0) - Number(n); kv.set(k, String(v)); return v; },
  kvDel: async (k) => { kv.delete(k); },
  kvGetJSON: async () => null, kvPutJSON: async () => {}, kvExpire: async () => {},
};
mock('api/_lib/kv.js', kvApi);
mock('api/_lib/auth.js', {
  getUser: async (u) => { await new Promise((r) => setImmediate(r)); return users.has(u) ? structuredClone(users.get(u)) : null; },
  putUser: async (u, rec) => { users.set(u, structuredClone(rec)); },
  isBanned: async () => false,
  verifyToken: (t) => (typeof t === 'string' && t.startsWith('T:') ? t.slice(2) : null),
});
mock('api/_lib/_vip.js', { isVip: async () => false });
const logged = [];
mock('api/_lib/log-error.js', { logError: (scope, e, meta) => { logged.push({ scope, msg: e && e.message, meta }); } });

const checkout = require(rp('api/_lib/create-checkout-session.js'));
const paypal = require(rp('api/_lib/paypal-order.js'));
const points = require(rp('api/_lib/points.js'));

const bal = async (u) => (await points.readPoints(u)).points;
const fresh = (u, rec) => { users.set(u, Object.assign({ username: u, points: 70 }, rec || {})); kv.delete('points:' + u); };
function res() {
  const r = { code: 200, body: null, setHeader() { return r; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end() { return r; }, send(b) { r.body = b; return r; } };
  return r;
}
const now = () => Math.floor(Date.now() / 1000);
const SESS = {};
async function verify(sessionId, user) {
  const save = global.fetch;
  global.fetch = async (url) => {
    const id = decodeURIComponent(String(url).split('/').pop());
    const s = SESS[id];
    return { ok: !!s, json: async () => s || { error: { message: 'No such session' } } };
  };
  try {
    const r = res();
    await checkout({ method: 'POST', query: { action: 'verify-checkout' }, body: { session_id: sessionId, token: 'T:' + user } }, r);
    return r;
  } finally { global.fetch = save; }
}
process.env.STRIPE_SECRET_KEY = 'sk_test_x';

test('١. دفعتان حقيقيّتان تُعادان بالتناوب: كلّ دفعة تُشحن مرّة وحدة (كانت بلا نهاية)', async () => {
  fresh('eve');
  for (const id of ['cs_a', 'cs_b']) SESS[id] = { id, payment_status: 'paid', created: now(), metadata: { username: 'eve', plan: 'pack100' } };
  await verify('cs_a', 'eve'); await verify('cs_b', 'eve');
  assert.equal(await bal('eve'), 270, '٧٠ ترحيب + ٢٠٠');
  for (let i = 0; i < 10; i++) {
    const r = await verify(i % 2 ? 'cs_b' : 'cs_a', 'eve');
    assert.equal(r.code, 200);
    assert.equal(r.body.alreadyGranted, true);
  }
  assert.equal(await bal('eve'), 270, 'الإعادة بالتناوب لا تضيف شيئًا');
});

test('٢. عشرة تحقّقات متزامنة لدفعة واحدة تُشحن مرّة وحدة (كانت عشر مرّات)', async () => {
  fresh('zed');
  SESS.cs_c = { id: 'cs_c', payment_status: 'paid', created: now(), metadata: { username: 'zed', plan: 'pack100' } };
  const rs = await Promise.all(Array.from({ length: 10 }, () => verify('cs_c', 'zed')));
  assert.equal(rs.filter((r) => r.body && r.body.pointsAdded > 0).length, 1);
  assert.equal(await bal('zed'), 170);
});

test('٣. فشل الشحن بعد الحجز يفكّه — المحاولة التالية (الويب هوك يعيد) تشحن مرّة', async () => {
  fresh('kim');
  SESS.cs_d = { id: 'cs_d', payment_status: 'paid', created: now(), metadata: { username: 'kim', plan: 'pack100' } };
  failIncr = 1;
  const r1 = await verify('cs_d', 'kim');
  assert.equal(r1.code, 500);
  assert.equal(kv.has('paid:lastStripeSessionId:cs_d'), false, 'الحجز فُكّ');
  const r2 = await verify('cs_d', 'kim');
  assert.equal(r2.body.pointsAdded, 100);
  assert.equal(await bal('kim'), 170);
});

test('٤. التحقّق من العميل لدفعة أقدم من ٧٢ ساعة ← 410 بلا شحن؛ الويب هوك (موقَّع) بلا حدّ', async () => {
  fresh('old1');
  SESS.cs_old = { id: 'cs_old', payment_status: 'paid', created: now() - 4 * 86400, metadata: { username: 'old1', plan: 'pack100' } };
  const r = await verify('cs_old', 'old1');
  assert.equal(r.code, 410);
  assert.equal(await bal('old1'), 70);
  const g = await checkout.grantPlanToUser('old1', 'pack100', 'lastStripeSessionId', 'cs_old');
  assert.equal(g.pointsAdded, 100, 'مسار الويب هوك يشحن');
});

test('٥. الشراء قبل أوّل صرف لا يمسح الرصيد: ٧٠ + ١٠٠ = ١٧٠، وحساب قديم ٥٠٠ + Pro = ١٬٤٢٠', async () => {
  fresh('newbie');
  await checkout.grantPlanToUser('newbie', 'pack100', 'lastStripeSessionId', 'cs_n1');
  assert.equal(await bal('newbie'), 170);
  fresh('oldie', { points: 500 });
  await checkout.grantPlanToUser('oldie', 'pro', 'lastStripeSessionId', 'cs_n2');
  assert.equal(await bal('oldie'), 1420);
  assert.equal(users.get('oldie').plan, 'pro');
});

test('٦. التجديد بالاسم القديم يشحن الحساب بعد تغيير اسمه (كان يُخصم ولا يُشحن لأحد)', async () => {
  users.set('oldname', { deleted: true, movedTo: 'newname' });
  fresh('newname', { prevUsernames: ['oldname'] });
  const g = await checkout.grantPlanToUser('oldname', 'basic', 'lastStripeInvoiceId', 'in_1');
  assert.equal(g.ok, true);
  assert.equal(g.pointsAdded, 360);
  assert.equal(users.get('newname').plan, 'basic');
  assert.equal(await bal('newname'), 430);
  // وجلسة دفع بدأت بالاسم القديم تُقبل لصاحبها الجديد، وتُرفض لغيره
  SESS.cs_mv = { id: 'cs_mv', payment_status: 'paid', created: now(), metadata: { username: 'oldname', plan: 'pack100' } };
  fresh('stranger');
  assert.equal((await verify('cs_mv', 'stranger')).code, 403);
  assert.equal((await verify('cs_mv', 'newname')).body.pointsAdded, 100);
});

test('٧. إيقاف التجديد يجد الاشتراك بالاسم السابق أيضًا', async () => {
  const searches = [];
  const fetchImpl = async (url, init) => {
    if (/subscriptions\/search/.test(url)) {
      const q = decodeURIComponent(String(url).split('query=')[1]);
      searches.push(q);
      const data = /'oldname'/.test(q) ? [{ id: 'sub_1', metadata: { username: 'oldname' }, current_period_end: 1, cancel_at_period_end: false }] : [];
      return { ok: true, json: async () => ({ data }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const r = res();
  await checkout.autoRenewToggle({ body: { token: 'T:newname' } }, r, fetchImpl);
  assert.equal(r.body.subs, 1);
  assert.equal(searches.length, 2, 'الاسم الحاليّ ثمّ السابق');
});

// ── PayPal ──
process.env.PAYPAL_CLIENT_ID = 'cid'; process.env.PAYPAL_SECRET = 'sec';
async function pp(body, orders) {
  const calls = [];
  const save = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    let b = null; try { b = init && init.body ? JSON.parse(init.body) : null; } catch (e) { b = String(init.body); } // طلب الرمز form-encoded
    calls.push({ u, body: b });
    if (u.endsWith('/v1/oauth2/token')) return { ok: true, json: async () => ({ access_token: 'A' }) };
    if (/\/v2\/checkout\/orders$/.test(u)) return { ok: true, json: async () => ({ id: 'ORD_NEW' }) };
    const id = decodeURIComponent(u.split('/v2/checkout/orders/')[1].split('/')[0]);
    const o = orders[id];
    return { ok: !!o, status: o ? 200 : 404, json: async () => o || { message: 'not found' } };
  };
  try { const r = res(); await paypal({ method: 'POST', body }, r); return { r, calls }; } finally { global.fetch = save; }
}
const order = (id, plan, amount, ref) => ({ id, status: 'COMPLETED', purchase_units: [{ reference_id: ref, payments: { captures: [{ custom_id: plan, amount: { value: amount }, status: 'COMPLETED' }] } }] });

test('٨. PayPal: الطلب يُربط بصاحبه، ولا التقاط بلا حساب صالح (لا يُسحب مال لا يُشحن)', async () => {
  const c = await pp({ action: 'create', plan: 'pack100', token: 'T:sam' }, {});
  const sent = c.calls.find((x) => /\/v2\/checkout\/orders$/.test(x.u)).body;
  assert.equal(sent.purchase_units[0].reference_id, 'sam');
  const n = await pp({ action: 'capture', orderId: 'O1' }, { O1: order('O1', 'pack100', '4.99', 'sam') });
  assert.equal(n.r.code, 401);
  assert.equal(n.calls.some((x) => /\/capture$/.test(x.u)), false, 'لم يُلتقط');
});

test('٩. PayPal: فشل الشحن بعد السحب يُسجَّل ويُردّ credited:false، وclaim يعيده مرّة وحدة', async () => {
  fresh('sam');
  logged.length = 0;
  failIncr = 1;
  const o = { O2: order('O2', 'pro', '20.00', 'sam') };
  const cap = await pp({ action: 'capture', orderId: 'O2', token: 'T:sam' }, o);
  assert.equal(cap.r.code, 200);
  assert.equal(cap.r.body.status, 'COMPLETED');
  assert.equal(cap.r.body.credited, false);
  assert.ok(logged.some((l) => l.scope === 'paypal:credit'), 'سُجّل في سجلّ أخطاء المالك');
  const c1 = await pp({ action: 'claim', orderId: 'O2', token: 'T:sam' }, o);
  assert.equal(c1.r.body.credited, true);
  assert.equal(c1.r.body.pointsAdded, 920);
  const c2 = await pp({ action: 'claim', orderId: 'O2', token: 'T:sam' }, o);
  assert.equal(c2.r.body.credited, true);
  assert.equal(c2.r.body.pointsAdded, 0, 'لا يُشحن مرّتين');
  assert.equal(await bal('sam'), 990);
});

test('١٠. PayPal: حساب آخر يعرف رقم الطلب لا يشحنه لنفسه، وطلب لم يكتمل أو قديم بلا صاحب = 409', async () => {
  fresh('mallory');
  const o = { O3: order('O3', 'pack100', '4.99', 'sam'), O4: Object.assign(order('O4', 'pack100', '4.99', 'mallory'), { status: 'APPROVED' }) };
  const c = await pp({ action: 'claim', orderId: 'O3', token: 'T:mallory' }, o);
  assert.equal(c.r.body.credited, false);
  assert.equal(c.r.body.reason, 'not_owner');
  assert.equal(await bal('mallory'), 70);
  assert.equal((await pp({ action: 'claim', orderId: 'O4', token: 'T:mallory' }, o)).r.code, 409);
  // طلب من قبل هذا المسار (بلا reference_id) شُحن بالمسار القديم بلا حجز ذرّيّ — لا يُعاد من أيّ حساب
  o.O5 = order('O5', 'pack100', '4.99', undefined);
  const legacy = await pp({ action: 'claim', orderId: 'O5', token: 'T:mallory' }, o);
  assert.equal(legacy.r.code, 409);
  assert.equal(legacy.r.body.reason, 'legacy');
  assert.equal(await bal('mallory'), 70, 'لا شحن ثانٍ لطلب قديم');
});

test('١١. الواجهة: «تمّ» بالشحن لا بحالة الدفع، وإعادة claim، والطلب المعلّق يُستكمل عند العودة، ونصّ صادق بالـ١٤', () => {
  const fs = require('node:fs');
  const a6 = fs.readFileSync(path.join(root, 'js/app-06-checkout.js'), 'utf8');
  assert.match(a6, /let credited = capData\.credited === true;/);
  assert.match(a6, /credited = await paypalClaim\(data\.orderID\) === 'ok';/);
  assert.match(a6, /localStorage\.setItem\('aiapp_pp_pending'/);
  assert.match(a6, /statusMsg\.textContent = t\('checkoutPaidPending'\);/);
  assert.doesNotMatch(a6, /capData\.status === 'COMPLETED' \|\| capData\.status === 'APPROVED'/, 'APPROVED ليس دفعًا');
  assert.match(a6, /window\.addEventListener\('focus', \(\) => \{ claim\(\); claimPaypal\(\); \}\);/);
  const vm = require('node:vm');
  for (const l of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const ctx = { I18N: { [l]: {} }, window: {} }; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, 'i18n/' + l + '.js'), 'utf8'), ctx);
    assert.ok(String(ctx.I18N[l].checkoutPaidPending || '').length > 20, l);
  }
  const a3 = fs.readFileSync(path.join(root, 'js/app-03-i18n-data.js'), 'utf8');
  assert.equal((a3.match(/checkoutPaidPending: '/g) || []).length, 2, 'العربيّة والإنجليزيّة');
});
