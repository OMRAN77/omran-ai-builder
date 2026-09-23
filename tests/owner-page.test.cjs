'use strict';
/* v-owner-page (أمر المالك ٢٣ سبتمبر «رتّبلي صفحة خاصّة لي في الإعدادات، مش نفس اللي الحين في كلّ قسم موجود»):
   الخزنة ولوحة التحكّم كانتا خارج نظام الصفحات فتظهران أسفل كلّ صفحة إعدادات للمالك. صارتا داخل
   صفحة «صفحة المالك» وحدها، وصفّها في القائمة للمالك فقط. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const partial = read('js/partials-settings.js');
const app05 = read('js/app-05-ui.js');

/** نهاية العنصر <div id="…"> المطابقة بعدّ الوسوم. */
function divSpan(html, id){
  const start = html.indexOf('<div id="' + id + '"');
  assert.ok(start >= 0, 'العنصر ' + id);
  const re = /<div\b|<\/div>/g; re.lastIndex = start; let depth = 0, m;
  while((m = re.exec(html))){ depth += m[0] === '</div>' ? -1 : 1; if(depth === 0) return [start, re.lastIndex]; }
  throw new Error('غير مغلق: ' + id);
}

test('١. الخزنة ولوحة التحكّم داخل صفحة المالك وحدها، لا بعد آخر قسم', () => {
  const [s, e] = divSpan(partial, 'ownerSection');
  assert.match(partial.slice(s, s + 120), /class="settingsPageSection"/);
  for(const id of ['vaultSectionWrap', 'adminSectionWrap', 'vaultGhInput', 'adminUsersTable', 'adminHealthBox']){
    const i = partial.indexOf('id="' + id + '"');
    assert.ok(i > s && i < e, id + ' داخل صفحة المالك');
  }
  // البطاقتان بلا رؤوس أكورديون: رؤوس الأقسام تُخفى داخل الصفحة النشطة (.settingsPageActive .settingsSectionHeader)
  const inner = partial.slice(partial.indexOf('id="ownerSectionContent"'), e);
  assert.doesNotMatch(inner, /settingsSectionHeader/);
  assert.match(app05, /'aboutSection','ownerSection'\];/);
  assert.doesNotMatch(app05, /'vaultSection'|'adminSection'/);
});

test('٢. صفّ «صفحة المالك» أوّل القائمة للمالك وحده، والصفحة لا تُفتح لغيره', () => {
  const src = app05.slice(app05.indexOf('// v-owner-page: «صفحة المالك»'), app05.indexOf('window.showSettingsPage = showSettingsPage;'));
  const run = (user) => {
    const rows = []; const shown = [];
    const el = (extra) => Object.assign({ style: {}, classList: { add(){}, remove(){} }, textContent: '' }, extra);
    const list = el({ set innerHTML(v){ rows.length = 0; }, appendChild(r){ rows.push(r); } });
    const document = {
      getElementById: (id) => id === 'settingsNavList' ? list : null,
      querySelector: (q) => ({ textContent: q.includes('ownerSection') ? '👑 صفحة المالك' : q }),
      querySelectorAll: () => [],
      createElement: () => { const r = el({ innerHTML: '' }); r.querySelector = () => r; return r; },
    };
    const g = new Function('document', 'authGet', 'settingsDialog', '__swallow', 'shown', 'window',
      src + '\nshowSettingsHome = function(){ shown.push("home"); };\nrenderSettingsNavList();\nreturn (sid) => { showSettingsPage(sid); return shown.slice(); };');
    return { rows, open: g(document, () => user, null, () => {}, shown, {}) };
  };
  const owner = run('Omran');
  assert.equal(owner.rows.length, 15);
  assert.equal(owner.rows[0].className, 'settingsNavRow settingsNavOwner');
  assert.equal(owner.rows[0].textContent, 'صفحة المالك');
  const guest = run('ali');
  assert.equal(guest.rows.length, 14);
  assert.ok(guest.rows.every(r => !/Owner/.test(r.className)));
  assert.deepEqual(guest.open('ownerSection'), ['home'], 'غير المالك يُعاد للقائمة');
});

test('٣. العنوان بالـ١٤ لغة، والقائمة تُعاد بناؤها مع الدخول والخروج، ووسوم الكاش ارتفعت', () => {
  const data = read('js/app-03-i18n-data.js');
  assert.equal((data.match(/ownerSectionTitle: '👑 /g) || []).length, 2);
  for(const lg of ['bn','es','fil','fr','hi','id','ml','ne','ru','tr','ur','zh']){
    assert.match(read('i18n/' + lg + '.js'), new RegExp('Object\\.assign\\(I18N\\["' + lg + '"\\], \\{"ownerSectionTitle": "👑 '));
  }
  assert.match(read('js/app-01-boot-auth.js'), /if\(typeof renderSettingsNavList === 'function'\) renderSettingsNavList\(\);/);
  const html = read('index.html');
  assert.match(html, /js\/partials-settings\.js\?v=661/);
  assert.match(html, /css\/tokens\.css\?v=721/);
  assert.match(read('js/app-04-i18n-state.js'), /\.js\?v=684'/);
});
