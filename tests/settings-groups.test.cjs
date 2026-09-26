'use strict';
/* v-settings-groups (أمر المالك ٢٦ سبتمبر بلقطة إعدادات ChatGPT): رأس بصورة الحساب واسمه، بطاقة «الترقية»
   لغير المشترك، ومجموعات بعناوين. ترتيب المجموعات نفسه في settings-tidy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const app05 = read('js/app-05-ui.js');
const partial = read('js/partials-settings.js');

function profile({ user, plan, avatar }){
  const src = app05.slice(app05.indexOf('function stripUiEmoji'), app05.indexOf('function showSettingsHome'))
    .replace(/^const SETTINGS_NAV_ICONS[\s\S]*?\n\};\n/m, '').replace(/^\(function\(\)\{\n  const av = [\s\S]*$/m, '');
  const els = {};
  const mk = (id) => (els[id] = els[id] || { id, style: {}, textContent: '', src: '', removeAttribute(a){ this[a] = ''; } });
  const document = { getElementById: mk, querySelector: () => mk('edit') };
  const localStorage = { getItem: (k) => (k === 'aiapp_avatar' ? (avatar || null) : null) };
  new Function('document', 'authGet', 'window', 't', 'localStorage', '__swallow', src + '\nrenderSettingsProfile();')(
    document, (k) => (k === 'aiapp_auth_token' ? (user ? 'tok' : '') : user), { __omranPlan: plan }, (k) => k, localStorage, () => {});
  return els;
}

test('١. الرأس: الاسم والأحرف الأولى أو الصورة، وزرّ الدخول للضيف', () => {
  const m = profile({ user: 'ma', plan: 'free' });
  assert.equal(m.setProfileName.textContent, 'ma');
  assert.equal(m.setProfileInitials.textContent, 'MA');
  assert.equal(m.setProfileImg.style.display, 'none');
  assert.equal(m.setProfileLogin.style.display, 'none');
  const withPic = profile({ user: 'ma', plan: 'free', avatar: 'data:image/png;base64,xx' });
  assert.equal(withPic.setProfileImg.style.display, 'block');
  assert.equal(withPic.setProfileInitials.textContent, '');
  const guest = profile({ user: '', plan: 'guest' });
  assert.equal(guest.setProfileLogin.style.display, '');
  assert.equal(guest.edit.style.display, 'none', 'قلم تغيير الصورة للمسجَّل فقط');
});

test('٢. بطاقة الترقية لغير المشترك فقط', () => {
  for (const plan of ['free', 'guest', '', undefined]) assert.equal(profile({ user: 'ali', plan }).settingsUpgradeCard.style.display, 'flex', String(plan));
  for (const plan of ['basic', 'pro', 'max', 'vip', 'owner']) assert.equal(profile({ user: 'ali', plan }).settingsUpgradeCard.style.display, 'none', plan);
  assert.equal(profile({ user: 'omran', plan: 'free' }).settingsUpgradeCard.style.display, 'none', 'المالك');
});

test('٣. البنية: الرأس والبطاقة قبل القائمة، والنسخة داخل «عن البرنامج»، وربط الأزرار', () => {
  const home = partial.slice(partial.indexOf('<div id="settingsHomeView">'), partial.indexOf('<div id="settingsPageHeader"'));
  const order = ['id="settingsProfile"', 'id="settingsUpgradeCard"', 'id="settingsNavList"'].map((k) => home.indexOf(k));
  assert.ok(order.every((i, j) => i > 0 && (j === 0 || i > order[j - 1])), String(order));
  assert.ok(!home.includes('appVersionLabel'), 'سطر النسخة خرج من الصفحة الأولى');
  const about = partial.slice(partial.indexOf('<div id="aboutSection"'), partial.indexOf('<div id="ownerSection"'));
  assert.ok(about.includes('id="appVersionLabel"'));
  assert.match(app05, /if\(up\) up\.onclick = \(\) => showSettingsPage\('pricingSection'\);/);
  assert.match(app05, /const inp = document\.getElementById\('acctAvatarInput'\); if\(inp\) inp\.click\(\);/);
  assert.match(app05, /if\(prevPlan !== window\.__omranPlan && typeof renderSettingsNavList === 'function'\) renderSettingsNavList\(\);/, 'الباقة تصل بعد الفتح فتُحدَّث القيمة والبطاقة');
  assert.doesNotMatch(app05, /settingsLabelWidth/, 'ترتيب الطول أُلغي');
  const css = read('css/tokens.css');
  for (const c of ['.setProfile{', '.setUpgrade{', '.settingsNavGroupTitle{', '.settingsNavGroup{', '.settingsNavValue{']) assert.ok(css.includes(c), c);
  const html = read('index.html');
  assert.ok(html.includes('css/tokens.css?v=723') && html.includes('/js/partials-settings.js?v=672'));
});

test('٤. النصوص بالـ١٤ لغة، وبلا اسم مزوّد', () => {
  const keys = ['setGrpPersonal', 'setGrpAccount', 'setGrpAppearance', 'setGrpGeneral', 'setEmailRow', 'setNoEmail', 'setPlanFree', 'setUpgradeTitle', 'setUpgradeSub', 'setUpgradeBtn', 'setChangePhoto'];
  const data = read('js/app-03-i18n-data.js');
  for (const k of keys) assert.equal((data.match(new RegExp('\\b' + k + ': "[^"]+"', 'g')) || []).length, 2, k);
  assert.ok(data.includes('setUpgradeTitle: "أنجز المزيد مع Om ai"'));
  for (const lg of ['bn', 'es', 'fil', 'fr', 'hi', 'id', 'ml', 'ne', 'ru', 'tr', 'ur', 'zh']) {
    const s = read('i18n/' + lg + '.js');
    for (const k of keys) {
      const m = s.match(new RegExp('"?' + k + '"?:\\s*"([^"]+)"'));
      assert.ok(m, lg + ': ' + k);
      assert.doesNotMatch(m[1], /ChatGPT|Claude|Gemini|GPT|Groq|كلود|جيمناي/i, lg + ': ' + k);
    }
  }
  assert.match(read('js/app-04-i18n-state.js'), /i18n\/' \+ lg \+ '\.js\?v=695'/);
});
