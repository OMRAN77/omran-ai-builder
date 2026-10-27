// tests/stocks-chart.test.cjs — v-stocks-chart (تدقيق ١٨–١٩ أكتوبر، g10 stocks-search):
// (١) أرقام محور الأسعار مقصوصة يبين منها رقم واحد: الكانفس يرث rtl فـtextAlign 'start' = اليمين، وfillText(…, 4, …) يرسم
//     النصّ يسار x=4 خارج اللوحة، وأوّل تاريخ يُقصّ إلى «07-01». الآن direction='ltr' وtextAlign='left' صراحةً.
// (٢) أرقام الرسم وتواريخه ~٧px على الجوّال: اللوحة ١٠٠٠×٤٤٠ بخطّ 20px تُعرض بعرض ~٣٣٠. الآن الخطّ لا يقلّ عن 12px معروضة
//     (12 × العرض الداخليّ ÷ المعروض)، والحاسوب كما كان (20px ما دام المعروض ≥ ٦٠٠).
// drawChart الحقيقيّ عبر loadSymbol في vm بكانفس يسجّل نداءات fillText.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./_stocks-vm.cjs');

const VALUES = Array.from({ length: 60 }, (_, i) => ({ t: new Date(Date.UTC(2026, 6, 1) + i * 864e5).toISOString().slice(0, 10), c: 330 + 10 * Math.sin(i / 6) }));
async function draw(chartWidth, lang) {
  const h = boot({ lang: lang || 'ar', chartWidth, route: (m) => (m === 'quote' ? { symbol: 'AAPL', price: 1, change: 1, changePct: 1 } : m === 'series' ? { values: VALUES } : {}) });
  h.$('stockSymbolInput').value = 'AAPL';
  h.$('stockLoadBtn').click();
  await h.flush();
  const c = h.$('stockChart');
  return { calls: c.getContext().calls, chart: c };
}
const px = (font) => Number(String(font).match(/(\d+(?:\.\d+)?)px/)[1]);

test('كلّ نصّ في الرسم ltr ومحاذاته left، وأرقام المحور تبدأ داخل اللوحة', async () => {
  const { calls, chart } = await draw(1000);
  assert.equal(chart.style.display, 'block');
  assert.equal(calls.length, 8, '٥ أرقام محور + ٣ تواريخ');
  for (const c of calls) {
    assert.equal(c.direction, 'ltr', c.t);
    assert.equal(c.textAlign, 'left', c.t);
    assert.ok(c.x >= 0, c.t + ' x=' + c.x);
  }
  const dates = calls.filter((c) => /^\d{4}-\d\d-\d\d$/.test(c.t));
  assert.equal(dates.length, 3);
  assert.ok(dates[2].x + 130 <= 1000, 'آخر تاريخ يتّسع قبل حافّة اللوحة');
});

test('الجوّال (معروض ٣٦٠ من ١٠٠٠): الخطّ ≥ 30px داخليًّا ≈ 12px معروضة، والحاسوب 20px كما كان', async () => {
  const m = await draw(360);
  const fm = px(m.calls[0].font);
  assert.ok(fm >= 30, 'خطّ الجوّال ' + fm);
  assert.ok(fm * 360 / 1000 >= 11.5, 'معروضًا ' + (fm * 360 / 1000).toFixed(1) + 'px');
  const lastDate = m.calls[m.calls.length - 1];
  assert.ok(lastDate.x + fm * 5.6 <= 1000, 'آخر تاريخ بخطّ الجوّال لا يخرج عن اللوحة: x=' + lastDate.x);
  for (const w of [940, 1000, 1240]) {
    const d = await draw(w);
    assert.equal(px(d.calls[0].font), 20, 'الحاسوب ' + w);
  }
});

test('الإنجليزيّة أيضًا ltr/left (لا فرق بين الاتّجاهين)', async () => {
  const { calls } = await draw(1000, 'en');
  assert.ok(calls.every((c) => c.direction === 'ltr' && c.textAlign === 'left'));
});
