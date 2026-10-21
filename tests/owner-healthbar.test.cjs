'use strict';
/* tests/owner-healthbar.test.cjs — v-ownerbar-pill (تدقيق ١٨ أكتوبر، لقطات ٠٠١ و٠٠٨ و٠٤٢ و٠٥٢).
   العرض: تنبيه المالك التلقائيّ شريط بعرض الشاشة تحت الرأس (z ٩٩٩٩٩، نصّ pre-wrap بثلاثة أخطاء خامّة) يغطّي صفّ «إبداع»
   في الأدوات و«محادثة جديدة» والبحث وزرّ إغلاق الشريط، ويأخذ ربع شاشة الجوّال، وهو عربيّ بـdirection:rtl مفروض في الإنجليزيّ.
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

test('١. كبسولة مضغوطة أسفل الطرف لا شريط بعرض الشاشة تحت الرأس، وبلا اتّجاه مفروض، والمعرّف كما هو', async () => {
  const { bar } = await runBar('en');
  const c = css(bar);
  assert.match(c, /position:fixed/);
  assert.match(c, /bottom:12px/);
  assert.match(c, /inset-inline-end:12px/);
  assert.doesNotMatch(c, /(^|;)top:/, 'لا top: تحت الرأس');
  assert.doesNotMatch(c, /left:0;right:0/);
  assert.doesNotMatch(c, /direction:rtl/);
  assert.doesNotMatch(c, /white-space:pre-wrap/, 'الكبسولة نفسها لا تحمل النصّ الطويل');
  const head = bar.children[0];
  const mh = /min-height:(\d+)px/.exec(css(head));
  assert.ok(mh && Number(mh[1]) <= 40, 'ارتفاع المطويّ ≤ 40px: ' + css(head));
  assert.match(css(head), /white-space:nowrap/);
});

test('٢. التفاصيل الخامّة (v-err-build) مخفيّة حتّى النقر، وفي لوحة بسقف 40vh تُمرَّر، والنقر الثاني يطويها، و✕ يزيلها', async () => {
  const { bar, document } = await runBar('en');
  const [head, det] = bar.children;
  assert.equal(det.hidden, true, 'مطويّة أوّلًا');
  assert.match(css(det), /max-height:40vh/);
  assert.match(css(det), /overflow:auto/);
  const t = allText(det);
  assert.match(t, /TypeError: Cannot read properties of undefined \(reading x\) — app\.bundle\.js:1201 \(x2\)/);
  assert.match(t, /Script error\./);
  head.click();
  assert.equal(det.hidden, false, 'النقر يفتحها');
  head.click();
  assert.equal(det.hidden, true, 'والثاني يطويها');
  const x = head.children.find((c) => c.tagName === 'BUTTON');
  x.click();
  assert.equal(document.getElementById('ownerHealthBar'), null, '✕ يزيل الكبسولة');
});

test('٣. بالإنجليزيّة: لا عربيّ خارج الحمولات المعزولة، والعنوان «System notes (3)» ورابط فحص النظام', async () => {
  const { bar } = await runBar('en');
  const head = bar.children[0];
  assert.equal(head.children[0].textContent, '🩺 System notes (3)');
  const t = allText(bar);
  assert.ok(!AR_RE.test(visibleOutsideIso(t)), visibleOutsideIso(t));
  assert.match(t, /The database \(Redis\) is not responding — Reason: \u2066ECONNRESET\u2069/);
  assert.match(t, /Missing keys: \u2066GEMINI_API_KEY\u2069/);
  assert.match(t, /Errors logged from users: 3/);
  assert.match(t, /Open system check/);
  const ar = await runBar('ar');
  assert.equal(ar.bar.children[0].children[0].textContent, '🩺 ملاحظات النظام (3)');
});

test('٤. الجوّال: الكبسولة فوق صندوق الكتابة لا فوق شريط التنقّل والصندوق', async () => {
  const { bar } = await runBar('ar', { mobile: true, composerTop: 700, innerHeight: 860 });
  assert.match(css(bar), /bottom:170px/);
  assert.match(css(bar), /max-width:min\(360px,calc\(100vw - 24px\)\)/);
});
