// tests/plans-close.test.cjs — v-plans-close + v-plans-deeplink (تدقيق ١٨ أكتوبر «صفحة الباقات بالجوّال ما فيها إغلاق، السهم يودّي
// للإعدادات وزرّ الرجوع يطلع من التطبيق»، وأمر المالك ٢٠ أكتوبر، الدفعة ٣: «صفحة الباقات في الجوّال لازم يكون فيها زرّ إغلاق»).
// ✕ في رأس صفحة الباقات على الجوّال وحده يغلق الإعدادات؛ والباقات المفتوحة من البوّابة سهمها يغلقها إلى المحادثة (الفتح باليد كما كان).
// ورجوع أندرويد/المتصفّح يغلق الطبقة (swipe-back-history).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('١. الزرّ في رأس الصفحة بوصف مترجَم، مخفيّ افتراضيًّا', () => {
  const p = read('js/partials-settings.js');
  const hdr = p.slice(p.indexOf('<div id="settingsPageHeader"'), p.indexOf('</div>', p.indexOf('<h3 id="settingsPageTitle"')));
  assert.match(hdr, /<button type="button" id="settingsPageCloseBtn"[^>]*style="display:none;/);
  assert.match(hdr, /data-i18n="\[aria-label\]closeTitle"/);
  assert.match(hdr, /data-i18n-title="closeTitle"/);
});

// showSettingsPage وأزرار الرأس الحقيقيّة من app-05 في vm
function settingsEnv(width) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, style: {}, dataset: {}, classList: { add() {}, remove() {} }, textContent: '', onclick: null });
  ['settingsHomeView', 'settingsPageHeader', 'settingsPageTitle', 'settingsLogoutBtn', 'settingsPageCloseBtn', 'settingsPageBackBtn', 'pricingSectionContent', 'pricingSectionArrow'].forEach(el);
  const log = [];
  const dlg = { dataset: {}, scrollTop: 5, close() { log.push('close'); } };
  const a5 = read('js/app-05-ui.js');
  const s = a5.indexOf('function showSettingsPage(sid){');
  const e = a5.indexOf('// ---- Smart command box');
  const ctx = {
    window: { innerWidth: width }, document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [], querySelector: () => null },
    settingsDialog: dlg, settingsOwnerUi: () => false, SETTINGS_OWNER_ONLY: [], stripUiEmoji: (x) => x, __swallow: () => {},
    showSettingsHome: () => log.push('home'), closeDialogSafe: (d) => d.close(), refreshPointsWallet: () => {}, refreshAcctPoints: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(a5.slice(s, e), ctx);
  return { ctx, els, dlg, log };
}

test('٢. الظهور: صفحة الباقات على الجوّال وحده — لا الحاسوب ولا صفحة أخرى', () => {
  const m = settingsEnv(390);
  m.ctx.showSettingsPage('pricingSection');
  assert.equal(m.els.settingsPageCloseBtn.style.display, 'flex');
  m.ctx.showSettingsPage('accountSection');
  assert.equal(m.els.settingsPageCloseBtn.style.display, 'none');
  const d = settingsEnv(1280);
  d.ctx.showSettingsPage('pricingSection');
  assert.equal(d.els.settingsPageCloseBtn.style.display, 'none', 'الحاسوب كما هو');
});

test('٣. ✕ يغلق الإعدادات مباشرة ويمسح علم الفتح من البوّابة', () => {
  const m = settingsEnv(390);
  m.dlg.dataset.deepLink = '1';
  m.els.settingsPageCloseBtn.onclick();
  assert.deepEqual(m.log, ['close']);
  assert.equal(m.dlg.dataset.deepLink, undefined);
});

test('٤. السهم: من البوّابة يغلق إلى المحادثة، وباليد يرجع لرئيسيّة الإعدادات كما كان', () => {
  const g = settingsEnv(390);
  g.dlg.dataset.deepLink = '1';
  g.els.settingsPageBackBtn.onclick();
  assert.deepEqual(g.log, ['close']);
  const h = settingsEnv(390);
  h.els.settingsPageBackBtn.onclick();
  assert.deepEqual(h.log, ['home']);
});

test('٥. البوّابة تعلّم الفتح، وزرّ الإعدادات والإغلاق يمسحانه (app-33)', () => {
  const a33 = read('js/app-33-plans-gate.js');
  assert.match(a33, /showSettingsPage\('pricingSection'\);\n[^\n]*\n\s*var dl = document\.getElementById\('settingsDialog'\);\n\s*if\(dl && dl\.dataset\) dl\.dataset\.deepLink = '1';/);
  assert.match(a33, /if\(sbtn\) sbtn\.addEventListener\('click', function\(\)\{ showWhy\(''\); clearDeep\(\); \}, true\);/);
  assert.match(a33, /if\(dlg\) dlg\.addEventListener\('close', function\(\)\{ showWhy\(''\); clearDeep\(\); \}\);/);
});
