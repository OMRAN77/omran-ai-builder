// tests/pf-i18n.test.cjs — v-pf-trade-msg + v-pf-bidi (تدقيق ١٨–١٩ أكتوبر، g10 stocks-portfolio):
// - رسالة نجاح الشراء/البيع «✅ تمت: شراء 1 × AAPL بسعر $343.46 — 🎓 درس: …» عربيّة ثابتة في كلّ اللغات (ومخربطة في الإنجليزيّ).
// - المركز «1 shares» بالجمع.
// - «%100» و«(0%) 0+» و«343.46$» و«AAPL @ $343.46 × 1» تنقلب في العربيّ: أرقام بإشاراتها في عناصر ترث rtl بلا عزل.
// الآن: الرسالة بـstT (نمط v-pf-i18n؛ اللغات الاثنتا عشرة من __BI)، والمفرد share، وكلّ مقطع رقميّ بين LRI وPDI (U+2066…U+2069).
// لا <bdi>: منظِّف الإيموجي (v-clean-ui) يقصّ أطراف العقدة النصّيّة المجاورة للوسم فتضيع المسافة («شراء1 × AAPL» في لقطة الحاسوب).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, read, LANGS } = require('./_stocks-vm.cjs');

const L = '\u2066', P = '\u2069';
const iso = (s) => L + s + P;
const plain = (s) => s.split(L).join('').split(P).join('');
const has = (hay, needle, msg) => assert.ok(hay.includes(needle), (msg || 'مفقود') + ': ' + JSON.stringify(needle) + '\n← ' + JSON.stringify(hay.slice(0, 400)));

function pf(trade) {
  return { ok: true, portfolio: { cash: 99313.08, equity: 100000, pl: 0, plPct: 0,
    positions: [{ symbol: 'AAPL', qty: 1, price: 343.46, pl: 0, plPct: 0 }, { symbol: 'MSFT', qty: 3, price: 114.48, pl: 13.44, plPct: 4.07 }],
    trades: (trade ? [trade] : []).concat([{ sym: 'MSFT', side: 'buy', qty: 3, price: 110 }]) },
  board: { top: [{ rank: 1, user: 'omran', plPct: 0 }, { rank: 2, user: 'x', plPct: -1.5 }], rank: 1, total: 2 } };
}
async function trade(lang, side) {
  const h = boot({ lang, route: (m, b) => (m === 'pf-get' ? pf(null) : m === 'pf-trade' ? pf({ sym: b.tradeSymbol, side: b.side, qty: b.qty, price: 343.46 }) : {}) });
  h.ctx.__stkShowTab('pf'); await h.flush();
  h.$('pfSym').value = 'AAPL'; h.$('pfQty').value = '1';
  h.$(side === 'sell' ? 'pfSell' : 'pfBuy').click(); await h.flush();
  return { h, msg: h.$('pfMsg'), wrap: h.$('stockPfWrap') };
}
const AR = /[\u0600-\u06FF]/;

test('الإنجليزيّة: رسالة الشراء والبيع بلا حرف عربيّ، وفيها Bought/Sold والدرس', async () => {
  const b = await trade('en', 'buy');
  const bt = b.msg.textContent;
  assert.doesNotMatch(bt, AR, bt);
  assert.match(plain(bt), /^✅ Bought 1 × AAPL @ \$343\.46 — 🎓 Lesson: /);
  const s = await trade('en', 'sell');
  assert.doesNotMatch(s.msg.textContent, AR);
  assert.match(plain(s.msg.textContent), /^✅ Sold 1 × AAPL @ \$343\.46 — 🎓 Lesson: /);
});

test('العربيّة: النصّ نفسه، والكمّيّة والرمز والسعر معزولة LTR داخل العقدة النصّيّة', async () => {
  const { msg } = await trade('ar', 'buy');
  assert.equal(plain(msg.textContent), '✅ تمت: شراء 1 × AAPL بسعر $343.46 — 🎓 درس: لا تضع كل كاشك في سهم واحد، التنويع يحميك.');
  has(msg.textContent, 'شراء ' + iso('1 × AAPL') + ' بسعر ' + iso('$343.46') + ' — ');
  assert.equal(msg.children.length, 0, 'نصّ لا وسوم (المسافات لا يقصّها منظِّف الإيموجي)');
});

test('الفرنسيّة وبقيّة الاثنتي عشرة: الرسالة من __BI لا إنجليزيّة ولا عربيّة', async () => {
  const { msg } = await trade('fr', 'buy');
  assert.doesNotMatch(msg.textContent, AR);
  assert.doesNotMatch(msg.textContent, /Bought|Lesson/);
  const h = boot({ lang: 'ar' });
  const NEED = ['share', '✅ Bought', '✅ Sold', '✅ Trade done', '🎓 Lesson: don’t put all your cash in one stock — diversifying protects you.', '🎓 Lesson: selling locks in a profit or stops a loss — good decisions follow a plan, not emotion.'];
  for (const l of LANGS) for (const k of NEED) assert.ok(h.ctx.__BI[l] && h.ctx.__BI[l][k], l + ' ← ' + k);
});

test('المفرد والجمع: «1 share ×» و«3 shares ×»', async () => {
  const { wrap } = await trade('en', 'buy');
  has(wrap.innerHTML, '1 share × ' + iso('$343.46'));
  has(wrap.innerHTML, '3 shares × ' + iso('$114.48'));
  assert.ok(!wrap.innerHTML.includes('1 shares'));
});

test('العربيّة: «100٪» والربح/الخسارة والنسب والصفقات معزولة LRI/PDI، ولا <bdi>', async () => {
  const { wrap } = await trade('ar', 'buy');
  const h = wrap.innerHTML;
  has(h, 'أموال افتراضية ' + iso('100٪'));
  has(h, iso('$100,000'));
  has(h, iso('+0 (0%)'));
  has(h, iso('+13 (4.07%)'));
  has(h, iso('-1.5%'));
  has(h, '🟢 شراء ' + iso('1 × AAPL @ $343.46'));
  assert.ok(!h.includes('<bdi'));
});

test('تلميح 💼 بمفتاح stocksPfTitle (لا «محفظتي التعليمية» في الإنجليزيّ)', () => {
  assert.match(read('js/partials-core.js'), /id="stocksPfBtn"[^>]*data-i18n-title="stocksPfTitle"/);
});
