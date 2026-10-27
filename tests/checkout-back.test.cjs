'use strict';
/* v-checkout-back (تدقيق ١٨ أكتوبر، g12/checkout-overlay): نافذة الدفع تُغلق الإعدادات قبل أن تظهر (طبقة showModal تجعل
   الصفحة خامدة)، و✕ كان يُخفي النافذة وحدها فيجد المستخدم نفسه في الرئيسيّة لا في الباقات التي جاء منها.
   القرار: openCheckout يحفظ أنّ الإعدادات كانت مفتوحة (ومن بوّابة الباقات أم لا)، وcloseCheckout(true) — من ✕ وحده —
   يعيد فتحها على «الباقات والنقاط». مسارات النجاح وiOS والمهلات تنادي closeCheckout() بلا وسيط فلا تعيد شيئًا.
   باب المال: لا سعر ولا خطّة ولا نداء دفع يتغيّر — تنقّل فقط. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const A06 = read('js/app-06-checkout.js');
const PS = read('js/partials-settings.js');

function load({ settingsOpen = true, deepLink = false } = {}) {
  const s = A06.indexOf('function openCheckout(plan){');
  const e = A06.indexOf('async function startStripeCheckout(){');
  assert.ok(s > 0 && e > s, 'openCheckout وcloseCheckout بحدودهما');
  const log = [];
  const mk = (id) => ({ id, style: {}, textContent: '', parentElement: null, dataset: {}, querySelector: () => null });
  const els = { checkoutModalOverlay: mk('checkoutModalOverlay'), checkoutPlanLabel: mk('checkoutPlanLabel'), checkoutStatusMsg: mk('checkoutStatusMsg'), settingsDialog: mk('settingsDialog'), btnSettings: mk('btnSettings') };
  const sd = els.settingsDialog;
  sd.open = settingsOpen;
  if (deepLink) sd.dataset.deepLink = '1';
  sd.close = () => { sd.open = false; log.push('sd.close'); delete sd.dataset.deepLink; /* حدث close يمسح العلم (app-33) */ };
  els.btnSettings.click = () => { log.push('btnSettings'); sd.open = true; delete sd.dataset.deepLink; /* زرّ الإعدادات يمسح العلم (app-33) */ };
  const body = { appendChild: (c) => { c.parentElement = body; } };
  const ctx = {
    window: {}, document: { body, getElementById: (id) => els[id] || null },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 13)', platform: 'Linux', maxTouchPoints: 5 },
    authGet: (k) => (k === 'aiapp_auth_token' ? 'tok' : ''),
    omranIOSStoreApp: () => false, checkoutCurrency: () => 'usd', checkoutPriceText: () => '$10', PACK_POINTS: {},
    t: (k) => k, settingsToast: () => {}, loadPaypalButtons: () => log.push('paypal'), setupWalletPaymentRequest: () => log.push('wallet'),
    showSettingsPage: (sid) => log.push('page:' + sid),
    __swallow: (err, tag) => log.push('swallow:' + tag),
    checkoutCurrentPlan: null,
  };
  vm.createContext(ctx);
  vm.runInContext('var checkoutCurrentPlan = null;\n' + A06.slice(s, e), ctx);
  return { ctx, log, els, sd };
}

test('١. ✕ بعد فتح الدفع من الباقات: تعود الإعدادات على «الباقات والنقاط»', () => {
  const { ctx, log, els } = load();
  ctx.openCheckout('basic');
  assert.equal(els.checkoutModalOverlay.style.display, 'flex');
  assert.ok(log.includes('sd.close'), 'الإعدادات تُغلق قبل النافذة كما كانت');
  log.length = 0;
  ctx.closeCheckout(true);
  assert.equal(els.checkoutModalOverlay.style.display, 'none');
  assert.deepEqual(log, ['btnSettings', 'page:pricingSection']);
});

test('٢. من بوّابة الباقات (علم deepLink): الرجوع يُبقي العلم فيغلق سهمُ الرجوع الإعداداتِ إلى المحادثة', () => {
  const { ctx, log, sd } = load({ deepLink: true });
  ctx.openCheckout('pro');
  assert.equal(sd.dataset.deepLink, undefined, 'إغلاق الإعدادات مسح العلم');
  ctx.closeCheckout(true);
  assert.deepEqual(log.slice(-2), ['btnSettings', 'page:pricingSection']);
  assert.equal(sd.dataset.deepLink, '1', 'العلم يعود بعد فتح الإعدادات');
});

test('٣. بلا وسيط (النجاح · iOS · المهلات) أو بوسيط غير true: لا إعادة فتح، والعلم يُمسح', () => {
  for (const arg of [undefined, 0, 5, 'x']) {
    const { ctx, log } = load();
    ctx.openCheckout('basic');
    log.length = 0;
    if (arg === undefined) ctx.closeCheckout(); else ctx.closeCheckout(arg);
    assert.deepEqual(log, [], String(arg));
    ctx.closeCheckout(true);
    assert.deepEqual(log, [], 'الإغلاق الأوّل مسح المصدر: ' + String(arg));
  }
});

test('٤. فُتح الدفع والإعدادات مغلقة: ✕ لا يفتحها', () => {
  const { ctx, log } = load({ settingsOpen: false });
  ctx.openCheckout('basic');
  log.length = 0;
  ctx.closeCheckout(true);
  assert.deepEqual(log, []);
});

test('٥. ✕ وحده ينادي closeCheckout(true)؛ بقيّة النداءات كما كانت، ولا نداء دفع تغيّر', () => {
  assert.ok(/<button type="button" onclick="closeCheckout\(true\)"[^>]*>✕<\/button>/.test(PS), '✕ ينادي closeCheckout(true)');
  const code = (A06 + PS).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, ''); // التعليقات خارج العدّ
  const all = code.match(/closeCheckout\([^)]*\)/g) || [];
  assert.equal(all.filter((c) => c === 'closeCheckout(true)').length, 1, 'نداء true واحد: ✕');
  assert.equal((A06.match(/setTimeout\(closeCheckout, 2500\)/g) || []).length, 3, 'مهل النجاح بلا وسيط (v-lock-gpay: +التقاط PayPal الضائع حين يؤكّده claim)');
  assert.ok(A06.includes('if (w){ closeCheckout(); return; }'), 'مسار iOS بلا وسيط');
});
