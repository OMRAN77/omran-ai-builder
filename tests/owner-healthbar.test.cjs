'use strict';
/* tests/owner-healthbar.test.cjs — v-owner-i18n لشريط تنبيه المالك (تدقيق ١٨ أكتوبر، g14 owner-health-bar «التنبيه يبقى عربي في الواجهة الإنجليزية»؛
   الدفعة ٥). الشريط كما في main (fixed تحت الرأس بعرض الشاشة، v-ownerbar-cover) — العنوان والأسطر من القاموس، والاتّجاه اتّجاه الصفحة
   بدل direction:rtl المفروض، والحمولات التقنيّة معزولة. الكبسولة المضغوطة من حزمة ten-a لم تُنقل (ليست ترجمة).
   هنا: autoOwnerHealthCheck الحقيقيّة من app-11 في vm (مؤقّت وهميّ، دوم مصغّر، قاموس اللغة الحقيقيّ). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { tFor, AR_RE, visibleOutsideIso, clientSlice, flush } = require('./_owner-vm.cjs');
const { makeDom } = require('./_mini-dom.cjs');

const HEALTH = {
  redisOk: false, redisWhy: 'ECONNRESET',
  envKeys: { GEMINI_API_KEY: false },
  clientErrors: [
    { message: 'TypeError: Cannot read properties of undefined (reading x)', source: 'https://x/js/app.bundle.js?x=1', line: 1201, count: 2 },
    { message: 'ReferenceError: foo is not defined', source: 'app.bundle.js', line: 88 },
    { message: 'Script error.', count: 5 },
  ],
};
async function runBar(lang, opts) {
  const o = opts || {};
  const { document } = makeDom();
  if (o.mobile) document.documentElement.classList.add('mobile-ui');
  if (o.composerTop) {
    const cb = document.createElement('div'); cb.id = 'composerBox';
    cb.getBoundingClientRect = () => ({ top: o.composerTop, bottom: o.composerTop + 120, height: 120, left: 0, right: 390, width: 390 });
    document.body.appendChild(cb);
  }
  const timers = [];
  const store = {};
  const ctx = {
    document, isOwnerAccount: () => true, ownerToken: () => 'tok', __swallow() {},
    setTimeout: (fn) => { timers.push(fn); return 1; },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    fetch: async () => ({ ok: true, status: 200, json: async () => HEALTH }),
  };
  ctx.window = { t: tFor(lang), innerHeight: o.innerHeight || 900, innerWidth: o.mobile ? 390 : 1280 };
  clientSlice('js/app-11-video.js', '  // 🩺 فحص تلقائي صامت', '  window.runHealthCheck = async function(){', ctx);
  assert.equal(timers.length, 1, 'المؤقّت مضبوط');
  await timers[0]();
  await flush();
  const bar = document.getElementById('ownerHealthBar');
  assert.ok(bar, 'الشريط ظهر');
  return { bar, document };
}
const css = (el) => String((el.style && el.style.cssText) || '');
const allText = (el) => [el.textContent || '', ...el.children.map(allText)].join('\n');

test('١. الشريط كما كان: fixed تحت الرأس بعرض الشاشة، والمعرّف كما هو، وبلا اتّجاه مفروض', async () => {
  const { bar } = await runBar('en');
  const c = css(bar);
  assert.match(c, /position:fixed;top:0px;left:0;right:0;z-index:99999/);
  assert.match(c, /white-space:pre-wrap/);
  assert.doesNotMatch(c, /direction:rtl/, 'الاتّجاه من الصفحة');
  assert.match(c, /padding-inline:14px 44px/);
  const x = bar.children.find((ch) => ch.tagName === 'BUTTON');
  assert.match(css(x), /inset-inline-end:10px/, '✕ في طرف النهاية بالعربيّ والإنجليزيّ');
});

test('٢. بالإنجليزيّة: لا عربيّ خارج الحمولات المعزولة، والعنوان «System notes (3)» والأسطر مترجَمة، وبالعربيّة كما يقول القاموس', async () => {
  const { bar } = await runBar('en');
  const t = bar.textContent;
  assert.match(t, /^🩺 System notes \(3\):\n/);
  assert.ok(!AR_RE.test(visibleOutsideIso(t)), visibleOutsideIso(t));
  assert.match(t, /The database \(Redis\) is not responding — Reason: \u2066ECONNRESET\u2069/);
  assert.match(t, /Missing keys: \u2066GEMINI_API_KEY\u2069/);
  assert.match(t, /Errors logged from users: 3/);
  assert.match(t, /TypeError: Cannot read properties of undefined \(reading x\) — app\.bundle\.js:1201 \(x2\)/, 'v-err-build كما هو');
  const ar = await runBar('ar');
  assert.match(ar.bar.textContent, /^🩺 ملاحظات النظام \(3\):\n/);
});

test('٣. ✕ يزيل الشريط', async () => {
  const { bar, document } = await runBar('en');
  bar.children.find((ch) => ch.tagName === 'BUTTON').click();
  assert.equal(document.getElementById('ownerHealthBar'), null);
});
