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

function render(user){
  const src = app05.slice(app05.indexOf('function stripUiEmoji'), app05.indexOf('function showSettingsHome'));
  const pre = app05.slice(app05.indexOf('const SETTINGS_NAV_IDS'), app05.indexOf('const SETTINGS_NAV_ICONS'));
  const rows = [];
  const el = (x) => Object.assign({ style: {}, classList: { add(){}, remove(){} }, textContent: '' }, x);
  const list = el({ set innerHTML(v){ rows.length = 0; }, appendChild(r){ rows.push(r); } });
  const document = {
    getElementById: (id) => id === 'settingsNavList' ? list : (LABELS[id] ? {} : null),
    querySelector: (q) => { const id = q.slice(1, q.indexOf(' ')); return LABELS[id] ? { textContent: LABELS[id] } : null; },
    createElement: (tag) => { const r = el({ innerHTML: '' }); r.querySelector = () => r; if(tag === 'canvas') r.getContext = () => ({ measureText: (t) => ({ width: t.length * 7 }) }); return r; },
  };
  new Function('document', 'authGet', 'getComputedStyle', 'window', pre + 'const SETTINGS_NAV_ICONS = {};\n' +
    src.replace(/^const SETTINGS_NAV_ICONS[\s\S]*?\n\};\n/m, '') + '\nrenderSettingsNavList();')(document, () => user, () => ({ fontSize: '15px' }), {});
  return rows.map(r => r.textContent);
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

test('٢. الصفوف من الأقصر فوق إلى الأطول تحت، و«صفحة المالك» أوّلًا للمالك وحده', () => {
  const owner = render('omran');
  assert.equal(owner[0], 'صفحة المالك');
  const rest = owner.slice(1);
  for(let i = 1; i < rest.length; i++) assert.ok(rest[i - 1].length <= rest[i].length, rest[i - 1] + ' قبل ' + rest[i]);
  assert.deepEqual(rest.slice(0, 3), ['اللغة', 'حسابي', 'الصوت'], 'التساوي يحفظ الترتيب الأصليّ');
  assert.equal(rest[rest.length - 1], 'عن البرنامج والفيديوهات التعريفية');
  const guest = render('ali');
  assert.deepEqual(guest, rest, 'لغير المالك: نفس الترتيب بلا صفّ المالك');
  assert.equal(guest.length, 13);
});
