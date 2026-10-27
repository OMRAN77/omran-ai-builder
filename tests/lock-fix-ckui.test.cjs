'use strict';
/* v-lock-ckui (باب المال بموافقة المالك ٢٧ أكتوبر: «صلح الخطير وابدا فيهم كلهم») — مسارات واجهة الدفع:
   cli-money-3  غلاف آبل: window.open(…,'noopener') يعيد null دائمًا (المواصفة) فيجري التحويل الاحتياطيّ بعده — صفحة الدفع مرّتين.
                وكاباسيتور يسلّم window.open لسفاري ويعيد null عمدًا، فالنتيجة نفسها هناك.
   cli-money-4  غلاف آبل: نافذة الدفع لا تظهر، فأيّ خطأ (401 · 500 · شبكة) يُكتب في statusMsg مخفيّ — الزرّ يصمت. والنقر المكرّر = جلستان.
   cli-money-8  علم ?store=apple: selfdiag.js ينقله إلى sessionStorage ويمسح localStorage، وomranIOSStoreApp يقرأ localStorage وحده.
   cli-money-11 تعثّر تحميل PayPal (شبكة/حاجب) يُظهر «الدفع غير مفعّل من الإدارة بعد».
   cli-money-7  فاصلة منقوطة بعد APP_CAPABILITY_RULE تجعل ثمانية أسطر بعدها عبارة ميّتة (+ أحاديّة تُحسب وتُرمى).
   كلّ شيء بلا شبكة: الدوالّ الحقيقيّة من المصدر في vm، وwindow.open وfetch وStripe/PayPal مزيّفة. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const A06 = read('js/app-06-checkout.js');
const SELFDIAG = read('js/selfdiag.js');

function slice(src, a, b) {
  const s = src.indexOf(a);
  const e = src.indexOf(b, s + a.length);
  assert.ok(s >= 0 && e > s, 'تعذّر استخراج ' + a);
  return src.slice(s, e);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36';

function mkStore(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

/* بيئة الدفع: omranIOSStoreApp + openCheckout + closeCheckout + startStripeCheckout من المصدر نفسه.
   opener: 'browser' متصفّح يفتح النوافذ بالمواصفة (noopener/noreferrer ⇒ null) ·
           'capacitor' غلاف كاباسيتور (يسلّم الرابط لسفاري، يعيد null، والتطبيق يذهب للخلفيّة بعد ~٤٠٠م‌ث) ·
           'blocked' النافذة ممنوعة فعلًا (لا فتح، null، والتطبيق يبقى ظاهرًا). */
function loadCheckout({ ua = IPHONE, opener = 'browser', capacitor = false, session = {}, local = {}, responses = [] } = {}) {
  const log = { fetch: [], opened: [], alerts: [], closes: 0, swallow: [], pendingAtOpen: [] };
  const els = {};
  const mk = (id) => (els[id] = els[id] || { id, style: {}, textContent: '', dataset: {}, parentElement: null, querySelector: () => null });
  ['checkoutModalOverlay', 'checkoutPlanLabel', 'checkoutStatusMsg', 'settingsDialog'].forEach(mk);
  const listeners = { doc: {}, win: {} };
  const on = (bag) => (ev, fn) => { (bag[ev] = bag[ev] || []).push(fn); };
  const off = (bag) => (ev, fn) => { bag[ev] = (bag[ev] || []).filter((f) => f !== fn); };
  const fire = (bag, ev) => (bag[ev] || []).slice().forEach((f) => f({ type: ev }));
  const document = {
    visibilityState: 'visible',
    body: { appendChild: (c) => { c.parentElement = document.body; } },
    getElementById: (id) => els[id] || null,
    addEventListener: on(listeners.doc), removeEventListener: off(listeners.doc),
  };
  const ctx = {
    console, Promise, JSON, Date, Math, Number, String, RegExp, Object, Array, Error, URLSearchParams,
    document,
    navigator: { userAgent: ua, platform: /iPhone/.test(ua) ? 'iPhone' : 'Linux', maxTouchPoints: 5 },
    location: { href: 'https://app.test/', origin: 'https://app.test', search: '' },
    localStorage: mkStore(local), sessionStorage: mkStore(session),
    // المهل مصغّرة ١٠٠ مرّة بالترتيب نفسه — الاختبار لا ينتظر ثوانيَ حقيقيّة.
    setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, (Number(ms) || 0) / 100)),
    clearTimeout: (h) => clearTimeout(h),
    addEventListener: on(listeners.win), removeEventListener: off(listeners.win),
    alert: (m) => log.alerts.push(m),
    authGet: (k) => (k === 'aiapp_auth_token' ? 'tok' : ''),
    autoRenewPref: () => false, checkoutCurrency: () => 'usd', checkoutPriceText: () => '$10', PACK_POINTS: {},
    t: (k) => k, settingsToast: () => {},
    loadPaypalButtons: () => {}, setupWalletPaymentRequest: () => {},
    __swallow: (e, tag) => log.swallow.push(tag),
    fetch: async (url, opts) => {
      log.fetch.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
      const r = responses.length ? responses.shift() : { status: 200, body: { url: 'https://checkout.stripe.com/c/pay/cs_1', id: 'cs_1' } };
      if (r.throws) throw new Error('network down');
      if (r.wait) await sleep(r.wait);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
    },
  };
  ctx.window = ctx;
  if (capacitor) ctx.Capacitor = { isNativePlatform: () => true };
  ctx.open = (url, target, features) => {
    log.pendingAtOpen.push(ctx.localStorage.getItem('aiapp_ck_pending'));
    if (opener === 'blocked') return null;
    log.opened.push({ url, target, features });
    if (opener === 'capacitor') {
      // UIApplication.shared.open ثمّ createWebViewWith ⇒ nil: سفاري يتقدّم والتطبيق يذهب للخلفيّة.
      setTimeout(() => { document.visibilityState = 'hidden'; fire(listeners.doc, 'visibilitychange'); }, 4);
      return null;
    }
    if (/noopener|noreferrer/.test(String(features || ''))) return null; // المواصفة: النافذة فُتحت لكنّ القيمة null
    const w = { opener: ctx, closed: false };
    log.lastWin = w;
    return w;
  };
  vm.createContext(ctx);
  const code = 'var checkoutCurrentPlan = null;\n'
    + slice(A06, 'function omranIOSStoreApp(){', '// ===== Apple Pay / Google Pay');
  vm.runInContext(code, ctx);
  const realClose = ctx.closeCheckout;
  ctx.closeCheckout = function () { log.closes++; return realClose.apply(this, arguments); };
  return { ctx, log, els, document, listeners };
}

/* ───────────── cli-money-3 ───────────── */

test('cli-money-3: متصفّح يفتح النوافذ داخل غلاف آبل — فتح واحد خارجيّ، بلا تحويل ثانٍ، وopener مقطوع', async () => {
  const { ctx, log } = loadCheckout({ opener: 'browser', session: { aiapp_store: 'apple' } });
  ctx.webkit = { messageHandlers: { omranShare: {} } }; // غلاف WKWebView بجسره (يكفي للكشف قبل الإصلاح وبعده)
  ctx.checkoutCurrentPlan = 'basic';
  await ctx.startStripeCheckout();
  assert.equal(log.opened.length, 1, 'فتح خارجيّ واحد');
  assert.doesNotMatch(String(log.opened[0].features || ''), /noopener|noreferrer/, 'بلا noopener — وإلّا عاد null دائمًا');
  assert.equal(ctx.location.href, 'https://app.test/', 'لا تحويل احتياطيّ بعد فتح ناجح (كان يفتح الدفع مرّتين)');
  assert.equal(log.lastWin.opener, null, 'opener يُقطع يدويًّا بدل noopener');
  assert.equal(log.closes, 1, 'النافذة تُغلق بلا وسيط');
});

test('cli-money-3: كاباسيتور يسلّم window.open لسفاري ويعيد null — خروج التطبيق للخلفيّة يكفي، فلا تحويل ثانٍ', async () => {
  const { ctx, log } = loadCheckout({ opener: 'capacitor', capacitor: true });
  ctx.checkoutCurrentPlan = 'pro';
  await ctx.startStripeCheckout();
  assert.equal(log.opened.length, 1, 'فتح واحد في سفاري');
  assert.equal(ctx.location.href, 'https://app.test/', 'لا location.href بعده (كان يفتح سفاري ثانيةً أو الدفع داخل الغلاف)');
  assert.equal(log.closes, 1);
  assert.equal(log.alerts.length, 0);
});

test('cli-money-3: النافذة ممنوعة فعلًا (لا فتح ولا خروج) — التحويل الاحتياطيّ يبقى فلا يضيع الدفع', async () => {
  const { ctx, log } = loadCheckout({ opener: 'blocked', capacitor: true });
  ctx.checkoutCurrentPlan = 'basic';
  await ctx.startStripeCheckout();
  assert.equal(log.opened.length, 0);
  assert.equal(ctx.location.href, 'https://checkout.stripe.com/c/pay/cs_1', 'تحويل واحد بعد المهلة');
});

test('cli-money-3: الويب والمتصفّح العاديّ بلا تغيير — تحويل مباشر بلا window.open', async () => {
  const { ctx, log } = loadCheckout({ ua: ANDROID });
  ctx.checkoutCurrentPlan = 'basic';
  await ctx.startStripeCheckout();
  assert.equal(log.opened.length + log.pendingAtOpen.length, 0, 'لا window.open خارج غلاف آبل');
  assert.equal(ctx.location.href, 'https://checkout.stripe.com/c/pay/cs_1');
});

test('cli-money-3 (مال): رقم الجلسة يُحفظ قبل الفتح الخارجيّ — جسر العودة يتحقّق منه (آمن التكرار في الخادم)', async () => {
  const { ctx, log } = loadCheckout({ opener: 'capacitor', capacitor: true });
  ctx.checkoutCurrentPlan = 'basic';
  await ctx.startStripeCheckout();
  assert.equal(log.pendingAtOpen.length, 1);
  assert.match(String(log.pendingAtOpen[0]), /^cs_1:\d+$/, 'aiapp_ck_pending محفوظ لحظة الفتح');
  assert.equal(log.fetch.length, 1, 'جلسة دفع واحدة');
});

/* ───────────── cli-money-4 ───────────── */

test('cli-money-4: غلاف آبل + 401 (رمز منتهٍ) — تنبيه مترجم يراه المستخدم، لا رسالة في نافذة مخفيّة', async () => {
  const { ctx, log, els } = loadCheckout({ capacitor: true, opener: 'capacitor', responses: [{ status: 401, body: { error: 'سجّل دخولك أوّلًا ثمّ اشترك / Please sign in first, then subscribe' } }] });
  ctx.openCheckout('basic');
  for (let i = 0; i < 20 && !log.alerts.length; i++) await sleep(2);
  assert.notEqual(els.checkoutModalOverlay.style.display, 'flex', 'النافذة الداخليّة لا تظهر في الغلاف (v-ios-external-pay)');
  assert.deepEqual(log.alerts, ['checkoutLoginFirst'], 'تنبيه النظام بمفتاح مترجم');
  assert.equal(log.opened.length, 0);
  assert.equal(ctx.location.href, 'https://app.test/');
});

test('cli-money-4: غلاف آبل + 500 أو انقطاع الشبكة — تنبيه checkoutError، بلا نصّ مزوّد خامّ', async () => {
  for (const r of [{ status: 500, body: { error: 'No such price: price_123 (Stripe)' } }, { throws: true }, { status: 200, body: {} }]) {
    const { ctx, log } = loadCheckout({ capacitor: true, opener: 'capacitor', responses: [r] });
    ctx.checkoutCurrentPlan = 'max';
    await ctx.startStripeCheckout();
    assert.deepEqual(log.alerts, ['checkoutError'], JSON.stringify(r));
    assert.ok(!log.alerts.some((a) => /stripe|price_/i.test(a)), 'لا نصّ خامّ من المزوّد');
  }
});

test('cli-money-4: خارج الغلاف — الخطأ في نافذة الدفع الظاهرة كما كان، بلا تنبيه', async () => {
  const { ctx, log, els } = loadCheckout({ ua: ANDROID, responses: [{ status: 401, body: { error: 'LOGIN' } }] });
  ctx.checkoutCurrentPlan = 'basic';
  await ctx.startStripeCheckout();
  assert.equal(log.alerts.length, 0);
  assert.equal(els.checkoutStatusMsg.textContent, 'LOGIN');
});

test('cli-money-4 (مال): نقرتان متتاليتان أثناء الطلب = جلسة دفع واحدة وفتح واحد، والنقرة بعد الانتهاء تعمل', async () => {
  const { ctx, log } = loadCheckout({ capacitor: true, opener: 'capacitor', responses: [{ status: 200, wait: 15, body: { url: 'https://checkout.stripe.com/c/pay/cs_1', id: 'cs_1' } }] });
  ctx.checkoutCurrentPlan = 'basic';
  const a = ctx.startStripeCheckout();
  const b = ctx.startStripeCheckout();
  const c = ctx.startStripeCheckout();
  await Promise.all([a, b, c]);
  assert.equal(log.fetch.length, 1, 'جلسة Stripe واحدة لا ثلاث');
  assert.equal(log.opened.length, 1, 'سفاري مرّة واحدة');
  assert.equal(ctx.localStorage.getItem('aiapp_ck_pending').split(':')[0], 'cs_1', 'الجلسة المعلّقة هي التي فُتحت');
  // بعد الانتهاء (أو الرجوع من سفاري بلا دفع) نقرة جديدة تبدأ جلسة جديدة
  await ctx.startStripeCheckout();
  assert.equal(log.fetch.length, 2);
});

test('cli-money-4: بعد خطأ تعود النقرة تعمل (لا قفل عالق)', async () => {
  const { ctx, log } = loadCheckout({ capacitor: true, opener: 'capacitor', responses: [{ throws: true }] });
  ctx.checkoutCurrentPlan = 'basic';
  await ctx.startStripeCheckout();
  await ctx.startStripeCheckout();
  assert.equal(log.fetch.length, 2);
  assert.equal(log.opened.length, 1, 'الثانية نجحت وفتحت');
});

/* ───────────── cli-money-8 ───────────── */

function bootWithStoreFlag({ search, ua = IPHONE, staleLocal = null }) {
  const ss = mkStore(); const ls = mkStore(staleLocal ? { aiapp_store: staleLocal } : {});
  const cls = new Set();
  const env = {
    console, URLSearchParams, String,
    location: { search },
    navigator: { userAgent: ua },
    sessionStorage: ss, localStorage: ls,
    document: { documentElement: { classList: { add: (c) => cls.add(c), contains: (c) => cls.has(c) } }, querySelector: () => null, createElement: () => ({}), head: { appendChild() {} }, readyState: 'complete', addEventListener() {}, getElementById: () => null },
    setTimeout: () => 0,
  };
  env.window = env;
  vm.createContext(env);
  // كتلة v-store-safe من selfdiag.js كما تعمل قبل الحزمة (index.html يحمّلها متزامنة)
  vm.runInContext(slice(SELFDIAG, '/* v-store-safe:', '/* v-sat-revert'), env);
  vm.runInContext(slice(A06, 'function omranIOSStoreApp(){', 'function openCheckout(plan){'), env);
  return { env, ss, ls, cls };
}

test('cli-money-8: غلاف آبل يدخل بـ?store=apple بلا جسر — يُكشف بعد أن نقل selfdiag العلم إلى sessionStorage', () => {
  const { env, ss, ls } = bootWithStoreFlag({ search: '?store=apple' });
  assert.equal(ss.getItem('aiapp_store'), 'apple', 'selfdiag حفظ العلم للجلسة');
  assert.equal(ls.getItem('aiapp_store'), null, 'وحذف نسخة localStorage');
  assert.equal(env.omranIOSStoreApp(), true, 'الدفع الخارجيّ يعمل بالعلم (كان false دائمًا)');
});

test('cli-money-8: بلا العلم أو على غير الآيفون أو بعلم هواوي — لا دفع خارجيّ (الويب كما هو)', () => {
  assert.equal(bootWithStoreFlag({ search: '' }).env.omranIOSStoreApp(), false, 'سفاري الآيفون العاديّ');
  assert.equal(bootWithStoreFlag({ search: '?store=apple', ua: ANDROID }).env.omranIOSStoreApp(), false, 'أندرويد بالعلم');
  assert.equal(bootWithStoreFlag({ search: '?store=huawei' }).env.omranIOSStoreApp(), false, 'علم هواوي ليس آبل');
  assert.equal(bootWithStoreFlag({ search: '', staleLocal: 'apple' }).env.omranIOSStoreApp(), false, 'علم قديم عالق في localStorage يُمسح ولا يحبس المتصفّح (v-store-flag-session)');
});

test('cli-money-8: بالعلم وحده يذهب «اشترك» مباشرة للدفع الخارجيّ بلا النافذة الداخليّة', async () => {
  const { ctx, log, els } = loadCheckout({ opener: 'browser', session: { aiapp_store: 'apple' } });
  ctx.openCheckout('pro');
  for (let i = 0; i < 20 && !log.opened.length; i++) await sleep(2);
  assert.notEqual(els.checkoutModalOverlay.style.display, 'flex', 'لا Google Pay/بطاقة داخل الغلاف');
  assert.equal(log.fetch.length, 1);
  assert.equal(log.fetch[0].body.plan, 'pro');
  assert.equal(log.opened.length, 1);
});

/* ───────────── cli-money-11 ───────────── */

function loadPaypal({ idResponses = [], sdk = [] } = {}) {
  const log = { fetch: 0, scripts: 0, rendered: 0, swallow: [] };
  const els = {};
  const mk = (id) => (els[id] = { id, style: {}, textContent: '', innerHTML: '' });
  ['paypalButtonContainer', 'paypalFallbackBtn', 'checkoutStatusMsg'].forEach(mk);
  const DICT = { axLkCkuiPaypalLoadFail: 'PP_LOAD_FAIL' };
  const ctx = {
    console, Promise, JSON, Error, encodeURIComponent, String, Number,
    document: {
      getElementById: (id) => els[id] || null,
      createElement: () => ({}),
      head: { appendChild: (s) => { log.scripts++; const mode = sdk.length ? sdk.shift() : 'ok'; setTimeout(() => { if (mode === 'ok') { ctx.paypal = { Buttons: () => ({ render: () => { log.rendered++; } }) }; s.onload(); } else s.onerror(new Error('blocked')); }, 1); } },
    },
    setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, (Number(ms) || 0) / 100)),
    localStorage: mkStore(),
    authGet: () => 'tok',
    t: (k) => DICT[k] || k,
    __swallow: (e, tag) => log.swallow.push(tag),
    fetch: async (url) => {
      if (/paypal-client-id/.test(url)) {
        log.fetch++;
        const r = idResponses.length ? idResponses.shift() : { status: 200, body: { configured: true, clientId: 'cid' } };
        if (r.throws) throw new Error('network down');
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
      }
      throw new Error('unexpected ' + url);
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('var paypalSdkLoaded = false; var checkoutCurrentPlan = "basic";\n'
    + (A06.includes('let paypalLoadState') ? 'var paypalLoadState = "";\n' : '')
    + slice(A06, 'async function paypalClaim(orderId){', '// Handle Stripe redirect back'), ctx);
  return { ctx, log, els, DICT };
}
const settle = async (log, until) => { for (let i = 0; i < 50 && !until(); i++) await sleep(2); };

test('cli-money-11: PayPal مفعّل وسكربته لا يُحمَّل — الزرّ الاحتياطيّ يقول «تعذّر التحميل» ويعيد المحاولة، لا «غير مفعّل»', async () => {
  const { ctx, log, els } = loadPaypal({ sdk: ['fail', 'ok'] });
  await ctx.loadPaypalButtons();
  assert.equal(els.paypalFallbackBtn.style.display, 'flex', 'الاحتياطيّ ظاهر بعد التعثّر');
  const click = ctx.startPaypalCheckout();
  assert.notEqual(els.checkoutStatusMsg.textContent, 'checkoutNotConfigured', 'ليس «الدفع غير مفعّل من الإدارة»');
  assert.equal(els.checkoutStatusMsg.textContent, 'PP_LOAD_FAIL', 'الرسالة الصادقة لحظة النقر');
  await click;
  await settle(log, () => log.rendered > 0);
  assert.equal(log.fetch, 2, 'إعادة محاولة واحدة');
  assert.equal(log.rendered, 1, 'أزرار PayPal رُسمت بعد نجاح الإعادة');
  assert.equal(els.paypalFallbackBtn.style.display, 'none');
  assert.equal(els.checkoutStatusMsg.textContent, '', 'رسالة التعثّر تُمحى بعد نجاح الإعادة');
});

test('cli-money-11: الإعادة تتعثّر ثانيةً — الاحتياطيّ يعود والرسالة تبقى صادقة، والنقرة التالية تعيد مرّة أخرى', async () => {
  const { ctx, log, els } = loadPaypal({ sdk: ['fail', 'fail', 'ok'] });
  await ctx.loadPaypalButtons();
  await ctx.startPaypalCheckout();
  assert.equal(els.paypalFallbackBtn.style.display, 'flex');
  assert.equal(els.checkoutStatusMsg.textContent, 'PP_LOAD_FAIL');
  await ctx.startPaypalCheckout();
  assert.equal(log.fetch, 3);
  assert.equal(log.rendered, 1);
});

test('cli-money-11: انقطاع جلب paypal-client-id أو ردّ غير 200 = تعثّر تحميل لا «غير مفعّل»', async () => {
  for (const r of [{ throws: true }, { status: 502, body: { error: 'bad gateway' } }]) {
    const { ctx, els } = loadPaypal({ idResponses: [r, r] });
    await ctx.loadPaypalButtons();
    assert.equal(els.paypalFallbackBtn.style.display, 'flex');
    await ctx.startPaypalCheckout();
    assert.equal(els.checkoutStatusMsg.textContent, 'PP_LOAD_FAIL', JSON.stringify(r));
  }
});

test('cli-money-11: غير مفعّل فعلًا (configured:false) — الرسالة كما كانت، بلا إعادة محاولة', async () => {
  const { ctx, log, els } = loadPaypal({ idResponses: [{ status: 200, body: { configured: false } }] });
  await ctx.loadPaypalButtons();
  assert.equal(els.paypalFallbackBtn.style.display, 'flex');
  await ctx.startPaypalCheckout();
  assert.equal(els.checkoutStatusMsg.textContent, 'checkoutNotConfigured');
  await sleep(5);
  assert.equal(log.fetch, 1, 'لا إعادة');
});

test('cli-money-11: نقرات متتالية على الاحتياطيّ أثناء الإعادة = إعادة واحدة وزرّ PayPal واحد', async () => {
  const { ctx, log } = loadPaypal({ sdk: ['fail', 'ok'] });
  await ctx.loadPaypalButtons();
  await Promise.all([ctx.startPaypalCheckout(), ctx.startPaypalCheckout(), ctx.startPaypalCheckout()]);
  await settle(log, () => log.rendered > 0);
  await sleep(5);
  assert.equal(log.fetch, 2, 'إعادة واحدة لا ثلاث');
  assert.equal(log.rendered, 1, 'زرّ PayPal واحد');
});

test('cli-money-11: مفتاح الرسالة غائب من القاموس — يسقط إلى checkoutError لا إلى «غير مفعّل» ولا اسم المفتاح', async () => {
  const { ctx, els, DICT } = loadPaypal({ sdk: ['fail', 'fail'] });
  delete DICT.axLkCkuiPaypalLoadFail;
  await ctx.loadPaypalButtons();
  await ctx.startPaypalCheckout();
  assert.equal(els.checkoutStatusMsg.textContent, 'checkoutError');
});

/* ───────────── cli-money-7 ───────────── */

test('cli-money-7: لا عبارة نصّيّة يتيمة في أعلى أيّ جزء (فاصلة منقوطة تقطع ثابتًا فيُرمى ما بعدها صمتًا)', () => {
  const acorn = require(path.join(ROOT, 'node_modules', 'acorn'));
  const leftmost = (n) => { while (n && n.type === 'BinaryExpression') n = n.left; return n; };
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => /^app-\d+.*\.js$/.test(f) && f !== 'app.bundle.js');
  assert.ok(files.length > 40);
  const orphans = [];
  for (const f of files) {
    const src = read('js/' + f);
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true });
    for (const st of ast.body) {
      if (st.type !== 'ExpressionStatement') continue;
      const e = st.expression, l = leftmost(e);
      if ((e.type === 'BinaryExpression' || e.type === 'UnaryExpression') && l && ((l.type === 'UnaryExpression' && l.operator === '+') || l.type === 'Literal')) {
        orphans.push(f + ':' + src.slice(0, st.start).split('\n').length);
      }
    }
  }
  assert.deepEqual(orphans, [], 'عبارات ميّتة: ' + orphans.join(', '));
});

test('cli-money-7: ما يصل النموذج لم يتغيّر — APP_CAPABILITY_RULE نفسه، وموضعاه في رسالة النظام كما هما', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(slice(A06, '// ✅ v303:', '// تنظيف نص المحادثة') + '\nthis.__r = APP_CAPABILITY_RULE;', ctx);
  const r = ctx.__r;
  assert.ok(r.startsWith('\nAPP CAPABILITY RULE (mandatory): This app AUTOMATICALLY generates real images'));
  assert.ok(r.endsWith('that IS full approval of your last proposal — execute it completely and immediately, never ask what they mean.'));
  assert.equal((r.match(/RULE \(mandatory/g) || []).length, 1, 'قاعدة واحدة كما كانت تصل فعلًا');
  assert.ok(read('js/app-09-attach.js').includes('NO_FAKE_EDIT_RULE + CHAT_STYLE_RULE + APP_CAPABILITY_RULE;'));
  assert.ok(read('js/app-07-voice.js').includes('NO_FAKE_EDIT_RULE + CHAT_STYLE_RULE + APP_CAPABILITY_RULE;'));
});
