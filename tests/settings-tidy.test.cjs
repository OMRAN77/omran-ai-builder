'use strict';
/* v-settings-tidy (أمر المالك ٢٣ سبتمبر): «الوكيل» حُذف من الإعدادات (نصّ بلا زرّ — التشغيل من قائمة «@»)،
   «إحصائياتي» صارت «مشاريعي والنسخ الاحتياطي» (فائدتها التصدير والاستيراد)، والصفوف مرتّبة بعرض عنوانها:
   الأقصر فوق والأطول تحت، و«صفحة المالك» أوّلًا للمالك. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');
const app05 = read('js/app-05-ui.js');

const LABELS = {
  ownerSection: '👑 صفحة المالك', langSection: '🌐 اللغة', accountSection: '👤 حسابي', statsSection: '📊 مشاريعي والنسخ الاحتياطي',
  apiKeysSection: '🔑 مفاتيح API لمزوّدي الخدمة', themeSection: '🎨 تخصيص الألوان والمظهر', fontFamilySection: 'نوع الخط',
  fontSizeSection: 'حجم الخط', notifSection: '🔔 التنبيهات', voiceSection: 'الصوت', toneSection: 'التعليمات المخصّصة',
  memorySection: 'ذاكرتي', pricingSection: '💳 الباقات والنقاط', aboutSection: 'ℹ️ عن البرنامج والفيديوهات التعريفية',
};

function render(user, extra){
  const src = app05.slice(app05.indexOf('function stripUiEmoji'), app05.indexOf('function showSettingsHome'));
  const pre = app05.slice(app05.indexOf('const SETTINGS_NAV_IDS'), app05.indexOf('const SETTINGS_NAV_ICONS'));
  const out = [];
  const el = (x) => Object.assign({ style: {}, dataset: {}, classList: { add(){}, remove(){} }, textContent: '' }, x);
  const list = el({ set innerHTML(v){ out.length = 0; }, appendChild(n){ out.push(n); } });
  const document = {
    getElementById: (id) => id === 'settingsNavList' ? list : (LABELS[id] ? {} : null),
    querySelector: (q) => { const id = q.slice(1, q.indexOf(' ')); return LABELS[id] ? { textContent: LABELS[id] } : null; },
    createElement: () => { const kids = []; const r = el({ innerHTML: '', kids, appendChild(c){ kids.push(c); } }); r.querySelector = (sel) => { r[sel] = r[sel] || el({}); return r[sel]; }; return r; },
  };
  const w = Object.assign({}, extra || {});
  new Function('document', 'authGet', 'window', 't', 'fetch', '__swallow', pre + 'const SETTINGS_NAV_ICONS = {};\n' +
    src.replace(/^const SETTINGS_NAV_ICONS[\s\S]*?\n\};\n/m, '').replace(/^\(function\(\)\{[\s\S]*$/m, '') + '\nrenderSettingsNavList();')(document, (k) => (k === 'aiapp_auth_token' ? (user ? 'tok' : '') : user), w, (k) => 'T:' + k, () => new Promise(() => {}), () => {});
  // [{ title, rows:[{ label, value, sub }] }] — صفّ المالك مجموعة بلا عنوان
  const groups = []; let title = null;
  for(const n of out){
    if(n.className === 'settingsNavGroupTitle'){ title = n.textContent; continue; }
    groups.push({ title, rows: n.kids.map(r => ({ sid: r.dataset.sid, label: r['.settingsNavText'].textContent, value: r['.settingsNavValue'].textContent, sub: r['.settingsNavSub'].textContent, cls: r.className })) });
    title = null;
  }
  return groups;
}

test('١. «الوكيل» خارج الإعدادات، والعنوان الجديد بالـ١٤ لغة', () => {
  assert.doesNotMatch(app05, /'agentSection'/);
  assert.doesNotMatch(read('js/partials-settings.js'), /id="agentSection"/);
  assert.match(read('js/partials-settings.js'), /data-i18n="statsSectionTitle">📊 مشاريعي والنسخ الاحتياطي</);
  assert.equal((read('js/app-03-i18n-data.js').match(/statsSectionTitle: '(مشاريعي والنسخ الاحتياطي|My projects & backup)'/g) || []).length, 2);
  for(const lg of ['bn','es','fil','fr','hi','id','ml','ne','ru','tr','ur','zh']){
    assert.doesNotMatch(read('i18n/' + lg + '.js'), /"?statsSectionTitle"?: "(Mes statistiques|Mis estadísticas|My stats|我的统计数据|Моя статистика)"/, lg);
  }
});

test('٢. v-settings-groups (أمر المالك ٢٦ سبتمبر) نسخ ترتيب الطول: مجموعات بعناوين، و«صفحة المالك» أوّلًا للمالك وحده', () => {
  const owner = render('omran');
  assert.equal(owner[0].title, null);
  assert.deepEqual(owner[0].rows.map(r => r.label), ['صفحة المالك']);
  assert.match(owner[0].rows[0].cls, /settingsNavOwner/);
  const rest = owner.slice(1);
  assert.deepEqual(rest.map(g => g.title), ['T:setGrpPersonal', 'T:setGrpAccount', 'T:setGrpAppearance', 'T:setGrpGeneral']);
  assert.deepEqual(rest.map(g => g.rows.map(r => r.sid)), [
    ['toneSection', 'memorySection', 'voiceSection'],
    ['settingsEmailRow', 'pricingSection', 'accountSection', 'statsSection'],
    ['themeSection', 'fontFamilySection', 'fontSizeSection', 'langSection'],
    ['notifSection', 'apiKeysSection', 'aboutSection'],
  ]);
  const acct = rest[1].rows;
  assert.equal(acct[0].label, 'T:setEmailRow');
  assert.equal(acct[0].sub, 'T:setNoEmail', 'قبل وصول الإيميل');
  assert.equal(acct[1].value, 'VIP', 'المالك');
  const all = rest.flatMap(g => g.rows.map(r => r.sid)).filter(s => s !== 'settingsEmailRow');
  assert.equal(all.length, 13, 'كلّ الأقسام الـ١٣ موجودة');
});

test('٣. غير المالك: بلا صفّ المالك، وقيمة الاشتراك من الباقة، والضيف بلا صفّ الإيميل', () => {
  const free = render('ali', { __omranPlan: 'free', __setEmail: 'ali@x.com', __setEmailFor: 'tok' });
  assert.equal(free.length, 4);
  assert.equal(free[1].rows[0].sub, 'ali@x.com');
  assert.equal(free[1].rows[1].value, 'T:setPlanFree');
  assert.equal(render('ali', { __omranPlan: 'basic' })[1].rows[1].value, 'Plus');
  assert.equal(render('ali', { __omranPlan: 'max' })[1].rows[1].value, 'Max');
  const guest = render('');
  assert.deepEqual(guest[1].rows.map(r => r.sid), ['pricingSection', 'accountSection', 'statsSection']);
});
