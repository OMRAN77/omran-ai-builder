// tests/owner-only-providers.test.cjs — v-owner-only-providers (٢٦ سبتمبر ٢٠٢٦):
// التحقق من قصر قائمة المزودين على المالك فقط وإخفائها عن المشتركين والضيوف.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. بوّابة المزودين applyPlanGate: تفتح للمالك فقط وتُقفل لجميع المشتركين والضيوف', () => {
  const a5 = read('js/app-05-ui.js');
  const i = a5.indexOf('function applyPlanGate(d){');
  const j = a5.indexOf('window.applyPlanGate = applyPlanGate;', i);
  assert.ok(i > 0 && j > i, 'applyPlanGate موجودة في app-05-ui.js');

  const cls = new Set();
  const ctx = {
    window: {},
    document: {
      documentElement: {
        classList: {
          toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); },
          contains: (c) => cls.has(c),
        },
      },
    },
    __swallow: () => {},
  };
  vm.runInNewContext(a5.slice(i, j), ctx);
  const locked = (d) => { ctx.applyPlanGate(d); return cls.has('plan-locked'); };

  // المالك فقط غير مقفل (القائمة تظهر له)
  assert.equal(locked({ tier: 'owner' }), false, 'المالك تظهر له قائمة المزودين');

  // المشتركون بجميع باقاتهم مقفلون (القائمة محجوبة عنهم)
  assert.equal(locked({ tier: 'sub', plan: 'max' }), true, 'مشترك Max محجوبة عنه القائمة');
  assert.equal(locked({ tier: 'sub', plan: 'pro' }), true, 'مشترك Pro محجوبة عنه القائمة');
  assert.equal(locked({ tier: 'sub', plan: 'plus' }), true, 'مشترك Plus محجوبة عنه القائمة');
  assert.equal(locked({ tier: 'sub', plan: 'basic' }), true, 'مشترك Basic محجوبة عنه القائمة');

  // VIP والمجاني والضيف مقفلون
  assert.equal(locked({ tier: 'vip' }), true, 'حساب VIP محجوبة عنه القائمة');
  assert.equal(locked({ tier: 'free' }), true, 'المستخدم المجاني محجوبة عنه القائمة');
  assert.equal(locked({ authed: false, remaining: {} }), true, 'الضيف محجوبة عنه القائمة');

  // بلا بيانات طبقة لا تغيير
  ctx.applyPlanGate({ tier: 'owner' });
  assert.equal(cls.has('plan-locked'), false);
  ctx.applyPlanGate({ remaining: {} });
  assert.equal(cls.has('plan-locked'), false, 'بلا tier لا يُغيّر الفئة');
});

test('٢. قواعد CSS لإخفاء عناصر المزودين في index.html و redesign.css', () => {
  const html = read('index.html');
  assert.ok(
    html.includes('html.plan-locked #provDropdownBtn, html.plan-locked #provDropdownPanel, html.plan-locked #providerStripMobile, html.plan-locked #omBottomBar{ display:none !important; }'),
    'قاعدة إخفاء جميع عناصر المزودين للمقفلين موجودة في index.html'
  );

  const redesign = read('css/redesign.css');
  // التأكد من عدم استخدام !important على display:flex لشريط omBottomBar حتى لا يكسر إخفاءه لغير المالك
  assert.doesNotMatch(
    redesign,
    /#inputbar > #omBottomBar\{\s*[^}]*display:\s*flex\s*!important/i,
    'omBottomBar لا يستخدم display:flex !important كي لا يُجبر على الظهور لغير المالك'
  );
});

test('٣. الحزمة متزامنة وتتضمن منطق البوابة المحدث', () => {
  const bundle = read('js/app.bundle.js');
  assert.ok(bundle.includes('function applyPlanGate(d){'), 'الحزمة تتضمن applyPlanGate');
  assert.ok(bundle.includes("const open = tier === 'owner';"), 'الحزمة تتضمن شرط قصر المزودين على المالك فقط');
});
