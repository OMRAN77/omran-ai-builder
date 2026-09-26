'use strict';
/* v-account-tidy (أمر المالك ٢٦ سبتمبر بلقطة «حسابي»): الصفحة فيها الصورة ثمّ اسم المستخدم وكلمة المرور ورابط
   الدعوة وتنظيف التطبيق فقط، بألوان عاديّة ورماديّ عند التمرير. الاسم الذهبيّ والنقاط والإيميل الاحتياطيّ والخروج
   الأحمر خرجت؛ الخروج صار آخر صفّ في قائمة الإعدادات. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('js/partials-settings.js');
const acct = html.slice(html.indexOf('<div id="accountSection"'), html.indexOf('<div id="statsSection"'));

test('١. الترتيب: الصورة ← اسم المستخدم ← كلمة المرور ← الإيميل ← رابط الدعوة ← تنظيف التطبيق', () => {
  const order = ['id="acctAvatarInput"', "'acctRowUser'", "'acctRowPass'", "'acctRowEmail'", "'acctRowRef'", "'acctRowCleanup'"].map((k) => acct.indexOf(k));
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('٢. الاسم الذهبيّ والنقاط والخروج الأحمر خارج الصفحة', () => {
  for (const id of ['acctSignedInAs', 'acctPointsBox', 'acctMediaBox', 'acctPointsLowWarn', 'acctLogoutBtn']) {
    assert.ok(!html.includes('id="' + id + '"'), id);
  }
  assert.match(acct, /id="acctEmail"[\s\S]*id="acctEmailSaveBtn"/, 'خانة الإيميل باقية لمن نسي اسمه (أمر المالك)');
  assert.match(acct, /data-i18n="acctEmailLabel">الإيميل \(لو نسيت اسمك أو كلمة المرور\)</);
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    assert.doesNotMatch(read('i18n/' + lg + '.js'), /acctEmailLabel"?: "📧/, lg);
  }
});

test('٣. ألوان عاديّة: لا أحمر في الصفحة، والصفوف رماديّة عند التمرير', () => {
  assert.doesNotMatch(acct, /#ef4444|239,\s*68,\s*68/);
  assert.equal((acct.match(/class="acctRowBtn"/g) || []).length, 5);
  const css = read('css/tokens.css');
  assert.match(css, /\.acctRowBtn:hover, \.acctRowBtn:active\{ background:rgba\(128,128,128,\.12\) !important; \}/);
  assert.match(css, /\.settingsNavLogout \.settingsNavChevron\{ display:none; \}/);
});

test('٤. الخروج آخر صفّ في الإعدادات للمسجَّل، يغلق الإعدادات ثمّ doLogout', () => {
  const app05 = read('js/app-05-ui.js');
  const body = app05.slice(app05.indexOf('function renderSettingsNavList'), app05.indexOf('function showSettingsHome'));
  assert.ok(body.indexOf("settingsNavRow('settingsLogoutRow'") > body.indexOf('SETTINGS_NAV_GROUPS.forEach'));
  assert.match(body, /if\(logged\)\{[\s\S]*closeDialogSafe\(settingsDialog\)[\s\S]*doLogout\(\)/);
  assert.doesNotMatch(app05, /settingsEmailRow|settingsFetchEmail/);
  const idx = read('index.html');
  assert.ok(idx.includes('css/tokens.css?v=724') && idx.includes('/js/partials-settings.js?v=676'));
});
