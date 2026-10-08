'use strict';
/* v-autorenew-toggle (المالك ٢ أكتوبر «في الاشتراكات زرّ يلغي الاشتراك الشهريّ — خصم شهريّ ولا عاديّ — يفتح ويغلق في أوّل
   الصفحة»): الخادم يوقف/يعيد تجديد اشتراكات الحساب نفسه فقط عند نهاية الشهر المدفوع؛ والعميل زرّ أعلى الصفحة بـ١٤ لغة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.AUTH_SECRET = 'autorenew-test-secret';
process.env.STRIPE_SECRET_KEY = 'test-stripe-key';
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { autoRenewToggle } = require('../api/_lib/create-checkout-session.js');

function token(u) {
  const payload = Buffer.from(JSON.stringify({ u, exp: Date.now() + 60_000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url');
}
const SUBS = [
  { id: 'sub_a', metadata: { username: 'sara' }, cancel_at_period_end: false, items: { data: [{ current_period_end: 1790000000 }] } },
  { id: 'sub_x', metadata: { username: 'sara2' }, cancel_at_period_end: false, current_period_end: 1800000000 },
];
async function call(body, stripe) {
  const calls = [];
  const f = async (url, opt) => {
    calls.push({ url: String(url), method: (opt && opt.method) || 'GET', body: opt && opt.body ? String(opt.body) : '' });
    if (/subscriptions\/search/.test(url)) return new Response(JSON.stringify({ data: stripe === 'none' ? [] : SUBS }), { status: stripe === 'fail' ? 400 : 200 });
    return new Response(JSON.stringify({ id: 'sub_a' }), { status: 200 });
  };
  const out = { status: 200, json: null };
  const res = { status(c) { out.status = c; return this; }, json(v) { out.json = v; } };
  await autoRenewToggle({ body }, res, f);
  return Object.assign(out, { calls });
}

test('١. بلا دخول = 401 بلا نداء لسترايب', async () => {
  const r = await call({});
  assert.equal(r.status, 401);
  assert.equal(r.calls.length, 0);
});

test('٢. الحالة: اشتراكات الحساب نفسه وحده (لا sara2)، ونهاية الشهر المدفوع من البند', async () => {
  const r = await call({ token: token('sara') });
  assert.deepEqual(r.json, { ok: true, subs: 1, on: true, periodEnd: 1790000000 });
  assert.match(decodeURIComponent(r.calls[0].url), /metadata\['username'\]:'sara' AND status:'active'/);
  assert.equal(r.calls.length, 1, 'الحالة لا تعدّل شيئًا');
});

test('٣. الإيقاف = cancel_at_period_end=true على اشتراكه (لا قطع ولا استرجاع)، والإعادة = false', async () => {
  const off = await call({ token: token('sara'), on: false });
  assert.equal(off.status, 200);
  const upd = off.calls.filter((c) => c.method === 'POST');
  assert.equal(upd.length, 1);
  assert.match(upd[0].url, /\/v1\/subscriptions\/sub_a$/);
  assert.equal(upd[0].body, 'cancel_at_period_end=true');
  assert.ok(!off.calls.some((c) => /sub_x/.test(c.url)), 'اشتراك غيره لا يُلمس');
  const on = await call({ token: token('sara'), on: true });
  assert.equal(on.calls.find((c) => c.method === 'POST').body, 'cancel_at_period_end=false');
  assert.ok(!off.calls.some((c) => /DELETE|refund/i.test(c.method + c.url)), 'لا إلغاء فوريّ ولا استرجاع');
});

test('٤. بلا اشتراك = subs 0 بلا تعديل؛ عطل سترايب = 502؛ بلا مفتاح = configured:false', async () => {
  const none = await call({ token: token('sara'), on: false }, 'none');
  assert.deepEqual(none.json, { ok: true, subs: 0, on: false, periodEnd: 0 });
  assert.equal((await call({ token: token('sara') }, 'fail')).status, 502);
  const k = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
  try { assert.equal((await call({ token: token('sara') })).json.configured, false); } finally { process.env.STRIPE_SECRET_KEY = k; }
});

test('٥. العميل: الزرّ آخر «خطط الأسعار»، يتبعه الشراء الجديد، ومربوط بالموجّه، والنصوص بالـ١٤ لغة', () => {
  const part = read('js/partials-settings.js');
  const sec = part.indexOf('id="pricingSectionContent"');
  // المالك بعدها: «خلّها آخر شي» — آخر القسم قبل روابط الشروط، ببطاقة الخطوط نفسها (ftCard)
  const at = part.indexOf('id="chkAutoRenew"', sec);
  assert.ok(sec > 0 && at > part.indexOf('id="pricingWalletRow"', sec) && at < part.indexOf('data-i18n="termsLink"', sec), 'آخر القسم');
  assert.match(part, /<label id="autoRenewRow" class="ftCard"/);
  for (const f of ['js/app-06-checkout.js', 'js/app.bundle.js']) {
    const s = read(f);
    assert.ok(s.includes('if (arBox) arBox.checked = autoRenewPref();'), f);
    assert.ok(s.includes("fetch('/api/account?action=auto-renew'"), f);
    assert.ok(s.includes('try { syncAutoRenewUI(); }'), f);
  }
  assert.ok(read('api/account.js').includes("case 'auto-renew': return require('./_lib/create-checkout-session.js');"));
  const keys = ['autoRenewLabel', 'autoRenewOnHint', 'autoRenewOffHint', 'autoRenewStopped', 'autoRenewResumed', 'autoRenewFailed'];
  const core = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.equal((core.match(new RegExp('\\b' + k + ': ', 'g')) || []).length, 2, k);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const s = read('i18n/' + lg + '.js');
    for (const k of keys) assert.ok(new RegExp('"?' + k + '"?: "').test(s), lg + ':' + k);
    assert.match(s, /"?autoRenewStopped"?: "[^"]*\{date\}/, lg);
  }
  assert.ok(read('index.html').includes('/js/partials-settings.js?v=692'));
});
