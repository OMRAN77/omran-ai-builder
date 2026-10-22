// tests/stocks-global.test.cjs — v-stocks-global (تدقيق ١٨–١٩ أكتوبر، g10 stocks-global):
// (١) ودجة «النظرة العامّة» بيضاء وأسعارها رماديّة لا تُقرأ: الإطار شفّاف (isTransparent:true) تحت :root{color-scheme:dark}
//     فيرسم المتصفّح خلفه أبيض. الآن isTransparent:false فترسم الودجة خلفيّتها الداكنة بنفسها مثل #tvChart.
// (٢) تبويبات Indices/Commodities/Forex وأوصاف Gold/Silver/Oil إنجليزيّة، وlocale=ar لا يعرفه TradingView (رمزه ar_AE).
// loadGlobal الحقيقيّ يُشغَّل في vm بفتح النافذة (btnStocks ← تبويب العالميّة).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./_stocks-vm.cjs');

async function openGlobal(lang) {
  const h = boot({ lang, route: (m) => (m === 'gold' ? { ozUsd: 4166.1, change: 10.8, changePct: 0.26, gram24: 450.91, gram22: 413.33, gram21: 394.55 } : {}) });
  h.$('btnStocks').click();
  await h.flush();
  const src = h.$('tvOverview').src;
  return { h, src, ov: JSON.parse(decodeURIComponent(src.split('#')[1])), chart: h.$('tvChart').src };
}

test('الودجة غير شفّافة وثيمها داكن (لا أبيض تحت color-scheme:dark)', async () => {
  const { ov } = await openGlobal('ar');
  assert.equal(ov.isTransparent, false);
  assert.equal(ov.colorTheme, 'dark');
});

test('رمز لغة TradingView: ar_AE بالعربيّة وzh_CN بالصينيّة، وما لا يدعمه en', async () => {
  for (const [l, want] of [['ar', 'ar_AE'], ['zh', 'zh_CN'], ['fr', 'fr'], ['ru', 'ru'], ['hi', 'en'], ['ur', 'en'], ['en', 'en'], ['ml', 'en']]) {
    const { src, ov, chart } = await openGlobal(l);
    assert.equal(ov.locale, want, l + ' داخل الإعداد');
    assert.ok(src.split('#')[0].endsWith('?locale=' + want), l + ' في الرابط: ' + src.split('#')[0]);
    assert.match(chart, new RegExp('&locale=' + want + '&'), l + ' في رسم #tvChart');
  }
});

test('عناوين التبويبات وأوصاف السلع من القاموس (عربيّ بالعربيّ، إنجليزيّ بالإنجليزيّ)', async () => {
  const ar = (await openGlobal('ar')).ov;
  assert.deepEqual(ar.tabs.map((x) => x.title), ['المؤشرات', 'السلع', 'العملات']);
  const comm = ar.tabs[1].symbols.map((s) => s.d);
  assert.deepEqual(comm.slice(0, 3), ['الذهب', 'الفضة', 'النفط WTI']);
  assert.equal(comm[3], 'Brent', 'برنت اسم علم يبقى');
  assert.equal(ar.tabs[0].symbols[0].d, 'Dow Jones', 'أسماء المؤشّرات أعلام تبقى');
  const en = (await openGlobal('en')).ov;
  assert.deepEqual(en.tabs.map((x) => x.title), ['Indices', 'Commodities', 'Forex']);
  assert.deepEqual(en.tabs[1].symbols.slice(0, 3).map((s) => s.d), ['Gold', 'Silver', 'Oil WTI']);
});

test('سعر الأونصة: «$4,166.1/oz» ثمّ «▲ 0.26%» كما كانا (الاتّجاه يعزله الأب dir=ltr في partials-core)', async () => {
  const { h } = await openGlobal('ar');
  assert.equal(h.$('goldOz').textContent, '$4,166.1/oz');
  assert.equal(h.$('goldChg').textContent, '▲ 0.26%');
});
