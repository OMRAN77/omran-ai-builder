// tests/stocks-i18n.test.cjs — v-stocks-i18n + v-stocks-bidi (تدقيق ١٨–١٩ أكتوبر، g10 stocks-global/search/portfolio):
// - شريحتا «🥇 Gold» و«🛢️ Oil» ووحدة «AED/g» إنجليزيّة ثابتة، وتلميح 💼 «محفظتي التعليمية» عربيّ في كلّ اللغات.
// - تفاصيل السهم «O: H: L: Vol:» إنجليزيّة في العربيّ.
// - «$4,166.1/oz ▲ 0.26%» تنقلب إلى «oz ▲0.26%/$4,166.1»، و«▼ -6.72 (-1.92%)» إلى «(1.92%-)6.72- ▼»: عناصر ترث rtl بلا عزل.
// الآن: مفاتيح بالـ١٤ لغة، وأب السعر dir=ltr، والسعر والتغيّر span dir=ltr داخل عموده (يبقى text-align:end للعمود).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, read, LANGS } = require('./_stocks-vm.cjs');

const PC = read('js/partials-core.js');
const KEYS = ['stkGold', 'stkSilver', 'stkOil', 'stkIndices', 'stkCommodities', 'stkForex', 'stkAedPerGram', 'stkOpen', 'stkHigh', 'stkLow', 'stkVol', 'stocksSymbolNotFound', 'stocksPfTitle'];

test('المفاتيح الجديدة بالـ١٤ لغة (ar وen في app-03، والبقيّة في i18n/*.js) وبلا اسم مزوّد', () => {
  const h = boot({ lang: 'ar' });
  const I = h.I18N;
  for (const k of KEYS) {
    assert.ok(I.ar[k] && /[\u0600-\u06FF]/.test(I.ar[k]), 'ar ' + k);
    assert.ok(I.en[k], 'en ' + k);
    for (const l of LANGS) assert.ok(I[l] && I[l][k], l + ' ' + k);
  }
  const all = KEYS.map((k) => [I.ar[k], I.en[k]].concat(LANGS.map((l) => I[l][k]))).flat().join(' ');
  assert.doesNotMatch(all, /twelve ?data|tradingview|finnhub|yahoo/i);
});

test('partials-core: الشريحتان والوحدة وتلميح 💼 بمفاتيح', () => {
  assert.match(PC, /data-tv="OANDA:XAUUSD"[^>]*>🥇 <span data-i18n="stkGold">الذهب<\/span><\/button>/);
  assert.match(PC, /data-tv="TVC:USOIL"[^>]*>🛢️ <span data-i18n="stkOil">النفط<\/span><\/button>/);
  for (const k of ['24', '22', '21']) assert.match(PC, new RegExp('<span>' + k + 'K: <b id="goldG' + k + '"></b> <span data-i18n="stkAedPerGram" style="white-space:nowrap;">درهم/غ</span></span>'));
  assert.doesNotMatch(PC, /AED\/g/);
  assert.match(PC, /<button type="button" class="btn iconBtn" id="stocksPfBtn" title="محفظتي التعليمية" data-i18n-title="stocksPfTitle"/);
});

test('partials-core: أب السعر dir=ltr، والسعر والتغيّر معزولان داخل عمود text-align:end', () => {
  assert.match(PC, /<div dir="ltr"><span id="goldOz"[^>]*><\/span> <span id="goldChg"[^>]*><\/span><\/div>/);
  assert.match(PC, /<div style="text-align:end;">\s*<div style="font-size: var\(--fs-1\); font-weight: var\(--w-bold\);"><span id="stockPrice" dir="ltr"><\/span><\/div>\s*<div style="font-size: var\(--fs-3\);"><span id="stockChange" dir="ltr"><\/span><\/div>/);
});

async function details(lang) {
  const Q = { symbol: 'AAPL', name: 'Apple Inc', price: 343.46, open: 340.1, high: 345.2, low: 338.9, change: -6.72, changePct: -1.92, volume: 51234567 };
  const h = boot({ lang, route: (m) => (m === 'quote' ? Q : m === 'series' ? { values: [{ t: '2026-07-01', c: 1 }, { t: '2026-07-02', c: 2 }] } : {}) });
  h.$('stockSymbolInput').value = 'AAPL';
  h.$('stockLoadBtn').click();
  await h.flush();
  return { h, parts: h.$('stockDetails').children.map((s) => s.textContent) };
}

test('تفاصيل السهم: افتتاح/أعلى/أدنى/الحجم بالعربيّ، وOpen/High/Low/Volume بالإنجليزيّ، والحجم بلا كسور', async () => {
  const ar = (await details('ar')).parts;
  assert.deepEqual(ar, ['افتتاح: 340.1', 'أعلى: 345.2', 'أدنى: 338.9', 'الحجم: 51,234,567']);
  const en = (await details('en')).parts;
  assert.deepEqual(en, ['Open: 340.1', 'High: 345.2', 'Low: 338.9', 'Volume: 51,234,567']);
  const fr = (await details('fr')).parts;
  assert.ok(fr.every((s) => !/^(O|H|L|Vol):/.test(s)), fr.join(' | '));
});

test('السعر والتغيّر نصّهما كما كان («▼ -6.72 (-1.92%)»)', async () => {
  const { h } = await details('ar');
  assert.equal(h.$('stockPrice').textContent, '343.46');
  assert.equal(h.$('stockChange').textContent, '▼ -6.72 (-1.92%)');
});
