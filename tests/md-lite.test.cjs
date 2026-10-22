// tests/md-lite.test.cjs — من حزمة a10 في فرع ten-a (الدفعة ٤: الماركداون وحده؛ رأس «عدد الأدوار» خارجها) — v-md-lite (تدقيق ١٨–١٩ أكتوبر، g10 stocks-analyze/learn وconstruction-generate/exports):
// ردود التحليل والدرس ونصّ «التفاصيل والتكلفة» ماركداون كانت تُوضع textContent فيظهر ### و** و--- خامًا، وعلامات ** المحايدة
// تقلب «RSI 14 = 61.2» في السطر العربيّ؛ وتقرير PDF يطبع esc(planText) داخل <pre> ورأسه «1 أدوار».
// الآن __omMdLite (DocumentFragment آمن: النصّ نصّ دائمًا) و__omMdLiteHtml للتقرير (يُهرَّب أوّلًا)، ورأس التقرير «عدد الأدوار: N».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./_stocks-vm.cjs');

const MD = '### 📊 نظرة عامة\n**RSI 14 = 61.2**\n---\n- **الدعم:** 338.9\n<img src=x onerror=alert(1)>\n\nسطر عاديّ';
const walk = (n, out) => { (n.childNodes || []).forEach((c) => { out.push(c); walk(c, out); }); return out; };

test('__omMdLite: بلا ### ولا ** ولا --- نصًّا، والعريض <b> والفاصل <hr> والنقطة •، والوسم الخبيث نصّ لا عنصر', () => {
  const h = boot({ lang: 'ar' });
  assert.equal(typeof h.ctx.__omMdLite, 'function');
  const frag = h.ctx.__omMdLite(MD);
  const host = h.doc.createElement('div');
  host.appendChild(frag);
  const nodes = walk(host, []);
  const txt = host.textContent;
  assert.doesNotMatch(txt, /###|\*\*|---/);
  assert.match(txt, /📊 نظرة عامة\nRSI 14 = 61\.2/);
  assert.match(txt, /• الدعم: 338\.9/);
  assert.match(txt, /<img src=x onerror=alert\(1\)>/, 'الوسم يبقى نصًّا ظاهرًا');
  assert.ok(!nodes.some((n) => n.tagName === 'IMG'), 'لا عنصر img');
  const bolds = nodes.filter((n) => n.tagName === 'B').map((b) => b.textContent);
  assert.ok(bolds.includes('📊 نظرة عامة') && bolds.includes('RSI 14 = 61.2') && bolds.includes('الدعم:'), bolds.join(' | '));
  assert.equal(nodes.filter((n) => n.tagName === 'HR').length, 1);
  assert.match(txt, /338\.9\n<img/, 'السطور بفواصلها (الحاوية pre-wrap)');
  assert.match(txt, /\n\nسطر عاديّ$/, 'السطر الفارغ يبقى');
});

test('__omMdLite: مسافة الطرف بجانب العريض عقدة وحدها (منظِّف الإيموجي يقصّ أطراف العقدة التي فيها إيموجي)', () => {
  const h = boot({ lang: 'ar' });
  const host = h.doc.createElement('div');
  host.appendChild(h.ctx.__omMdLite('**الدعم:** 338.9 📈 ثمّ **المقاومة:** 350'));
  const kids = host.childNodes;
  const i = kids.findIndex((n) => n.tagName === 'B');
  assert.equal(kids[i + 1].nodeType, 3);
  assert.equal(kids[i + 1].textContent, ' ', 'المسافة بعد العريض عقدة وحدها');
  assert.equal(kids[i + 2].textContent, '338.9 📈 ثمّ');
  assert.equal(kids[i + 3].textContent, ' ', 'والمسافة قبل العريض التالي');
});

test('__omMdLiteHtml: يُهرَّب أوّلًا ثمّ <b>/<hr>، بلا ### ولا **', () => {
  const h = boot({ lang: 'ar' });
  const html = h.ctx.__omMdLiteHtml(MD);
  assert.doesNotMatch(html, /###|\*\*|---/);
  assert.match(html, /<b>📊 نظرة عامة<\/b>\n<b>RSI 14 = 61\.2<\/b><hr>• <b>الدعم:<\/b> 338\.9\n&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('التحليل: الردّ يُرسم بالمساعد لا textContent خامًا', async () => {
  const h = boot({ lang: 'ar', route: (m) => (m === 'quote' ? { symbol: 'AAPL', price: 1, change: 1, changePct: 1 } : m === 'series' ? { values: [{ t: 'a', c: 1 }, { t: 'b', c: 2 }] } : m === 'analyze' ? { analysis: MD } : {}) });
  h.$('stockSymbolInput').value = 'AAPL'; h.$('stockLoadBtn').click(); await h.flush();
  h.$('stockAnalyzeBtn').click(); await h.flush();
  const el = h.$('stockAnalysis');
  assert.doesNotMatch(el.textContent, /###|\*\*|---/);
  assert.ok(walk(el, []).some((n) => n.tagName === 'B'));
});

test('الدرس (الحيّ وفي المحفظة): بلا ### ولا ** ولا ---', async () => {
  const h = boot({ lang: 'ar', route: (m) => (m === 'learn' ? { lesson: MD } : m === 'pf-get' ? { portfolio: { cash: 1, equity: 1, pl: 0, plPct: 0, positions: [{ symbol: 'AAPL', qty: 1, price: 2, pl: 0, plPct: 0 }], trades: [] }, board: { top: [] } } : {}) });
  h.ctx.__stkShowTab('learn');
  h.$('stockLearnChips').children[0].click(); await h.flush();
  assert.doesNotMatch(h.$('stockLesson').textContent, /###|\*\*|---/);
  assert.match(h.$('stockLesson').textContent, /RSI 14 = 61\.2/);
  h.ctx.__stkShowTab('pf'); await h.flush();
  h.$('stockPfWrap').querySelector('[data-pfwhy]').click(); await h.flush();
  const box = h.$('pfLesson');
  assert.doesNotMatch(box.textContent, /###|\*\*|---/);
  assert.match(box.textContent, /RSI 14 = 61\.2/);
});

const PLAN = '### 📐 المساحات\n**الإجمالي: 400 م²**\n- صالة: 60 م²\n---\n### 💰 التكلفة';
async function construct(floors) {
  const h = boot({ lang: 'ar', part: 'construction', floors, route: (u) => (/construction-create/.test(u) ? { planText: PLAN, remaining: 5, dailyLimit: 6 } : {}) });
  h.$('constructionRunBtn').onclick();
  await h.flush();
  return h;
}

test('المقاولات: «التفاصيل والتكلفة» بلا ### ولا **', async () => {
  const h = await construct('2');
  const el = h.$('constructionPlanText');
  assert.equal(el.style.display, 'block');
  assert.doesNotMatch(el.textContent, /###|\*\*|---/);
  assert.match(el.textContent, /الإجمالي: 400 م²/);
});

test('تقرير PDF: الخطّة منسّقة (بلا ### ولا ** ولا <pre> خامّ)', async () => {
  const h = await construct('1');
  await h.$('constructionPdfBtn').onclick();
  assert.equal(h.opened.length, 1, 'نافذة التقرير فُتحت');
  const doc = h.opened[0].html;
  const body = doc.slice(doc.indexOf('<body>'));
  assert.doesNotMatch(body, /###|\*\*/);
  assert.match(body, /<b>📐 المساحات<\/b>/);
  assert.match(body, /<hr>/);
});
