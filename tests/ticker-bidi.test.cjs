// tests/ticker-bidi.test.cjs — v-ticker-bidi (تدقيق ١٨–١٩ أكتوبر، g10 stock-ticker): عناصر الذهب في الشريط بترتيب معكوس
// (أونصة الذهب قبل عيار 24) و«(%0.26)» مقلوبة. الشريط #stockTicker dir=ltr وعناصره spans بلا عزل، فتتّحد تسميات الذهب العربيّة
// المتتالية والفاصل «|» المحايد بينها في مقطع RTL واحد ويُقلب ترتيبها. الآن: كلّ عنصر dir=auto (معزول)، والسعر والنسبة معزولان LTR.
// renderTicker الحقيقيّ يُشغَّل في vm عبر __tickerStart بعد فتح الشريط وببيانات ذهب وهميّة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./_stocks-vm.cjs');

const GOLD = { ozUsd: 4166.1, change: 10.8, changePct: 0.26, gram24: 450.91, gram22: 413.33, gram21: 394.55, gram18: 338.18, ozAed: 15300 };
async function tickerHtml(lang, items) {
  const h = boot({ lang, storage: { tickerCollapsed: '0' }, route: (m) => (m === 'ticker' ? { items: items || [] } : m === 'gold' ? GOLD : {}) });
  h.ctx.__tickerStart();
  await h.flush();
  return h.$('stockTickerTrack').innerHTML;
}
const items = (html) => html.split('<span data-tsym=').slice(1);

test('كلّ عنصر في الشريط معزول dir="auto" فلا يتّحد مع جيرانه', async () => {
  const html = await tickerHtml('ar', [{ symbol: 'AAPL', price: 343.46, change: -6.72, changePct: -1.92 }]);
  const its = items(html);
  assert.ok(its.length >= 10, 'العناصر مكرّرة للّفّة: ' + its.length);
  for (const it of its) assert.match(it.slice(0, it.indexOf('>')), /\sdir="auto"/, 'عنصر بلا dir=auto: ' + it.slice(0, 80));
});

test('ترتيب الذهب في DOM: عيار 24 ثمّ 22 ثمّ 21 ثمّ 18 ثمّ الأونصة', async () => {
  const html = await tickerHtml('ar');
  const once = items(html).slice(0, 5).map((s) => s.replace(/<[^>]*>/g, ''));
  assert.match(once[0], /عيار 24/); assert.match(once[1], /عيار 22/); assert.match(once[2], /عيار 21/); assert.match(once[3], /عيار 18/);
  assert.match(once[4], /أونصة الذهب/);
});

test('السعر والنسبة معزولان LTR: «(0.26%)» لا تنقلب بجانب «درهم»', async () => {
  const html = await tickerHtml('ar');
  const oz = items(html)[4];
  assert.match(oz, /<bdi dir="ltr">15,300<\/bdi> درهم/, 'سعر الأونصة معزول قبل الوحدة');
  assert.match(oz, /<bdi dir="ltr">\(0\.26%\)<\/bdi>/, 'النسبة بقوسيها معزولة');
  const g24 = items(html)[0];
  assert.match(g24, /<bdi dir="ltr">450\.91<\/bdi> درهم/);
  assert.doesNotMatch(g24, /%/, 'عيارات الغرام بلا نسبة كما كانت');
});

test('الإنجليزيّة كما هي: AAPL والذهب بأسمائها وعزل الأرقام', async () => {
  const html = await tickerHtml('en', [{ symbol: 'AAPL', price: 343.46, change: -6.72, changePct: -1.92 }]);
  const its = items(html);
  assert.match(its[0], /^"AAPL"/);
  assert.match(its[0], /▼ <bdi dir="ltr">343\.46<\/bdi> <bdi dir="ltr">\(-1\.92%\)<\/bdi>/);
  assert.match(its[1], /Gold 24K/);
});
