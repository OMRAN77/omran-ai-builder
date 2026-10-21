// tests/stocks-fail.test.cjs — v-stocks-fail (تدقيق ١٨–١٩ أكتوبر، g10 stocks-search): رمز خاطئ يعرض خطأ مزوّد الأسعار الخامّ
// «**symbol** or **figi** parameter is missing or invalid … https://twelvedata.com/docs…» باسمه ورابط توثيقه، وزرّ «حلل السهم»
// يبقى ظاهرًا من سهم سابق. الآن: الخادم يرسل رمزًا (404 symbol_not_found، وغيره 503 unavailable) والخامّ للسجلّ،
// والواجهة تعرض stocksSymbolNotFound أو svcPaused بلغتها وتخفي «حلل السهم» عند الفشل.
// المعالج الحقيقيّ؛ KV والشبكة وحدهما محاكيان. والواجهة (api وloadSymbol) في vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rp = (f) => require.resolve(path.join(root, f));
const mock = (f, exports) => { require.cache[rp(f)] = { id: rp(f), filename: rp(f), loaded: true, exports }; };
const logged = [];
mock('api/_lib/kv.js', new Proxy({}, { get: () => async () => null }));
mock('api/_lib/log-error.js', { logError: (scope, err) => { logged.push(scope + ' ' + String(err && err.message || err)); }, logErrorAndFlush: async () => {} });
mock('api/_lib/_planCap.js', { checkAndConsumePlanCustom: async () => ({ allowed: true }) });
mock('api/_lib/free-chain.js', { completeFreeChain: async () => ({ ok: false, errors: ['x'] }) });
delete process.env.FINNHUB_API_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.ANTHROPIC_API_KEY;

const RAW = '**symbol** or **figi** parameter is missing or invalid. Please provide a valid symbol according to API documentation: https://twelvedata.com/docs#reference-data';
const LEAK = /twelve ?data|figi|https?:|TWELVEDATA|ANTHROPIC|api documentation/i;
let tdReply = () => ({ code: 400, message: RAW, status: 'error' });
global.fetch = async (url) => {
  const u = String(url);
  if (/api\.twelvedata\.com/.test(u)) return { ok: true, status: 200, json: async () => tdReply() };
  return { ok: false, status: 404, json: async () => ({}) };
};
const handler = require(rp('api/_lib/stocks.js'));
async function call(body) {
  const res = { statusCode: 0, payload: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; }, end() { return this; } };
  await handler({ method: 'POST', body, headers: {} }, res);
  return res;
}

test('رمز خاطئ: 404 symbol_not_found بلا اسم المزوّد ولا رابطه، والخامّ لا يصل', async () => {
  process.env.TWELVEDATA_API_KEY = 'td-test';
  logged.length = 0;
  for (const body of [{ mode: 'quote', symbol: 'ZZZZ' }, { mode: 'series', symbol: 'ZZZZ', interval: '1h' }]) {
    const r = await call(body);
    assert.equal(r.statusCode, 404, body.mode);
    assert.deepEqual(r.payload, { error: 'symbol_not_found' });
    assert.doesNotMatch(JSON.stringify(r.payload), LEAK);
  }
  tdReply = () => ({ code: 404, message: '**symbol** not found: ZZZZ. Please specify it correctly', status: 'error' });
  const r2 = await call({ mode: 'quote', symbol: 'QQQQQ' });
  assert.equal(r2.statusCode, 404);
});

test('عطل آخر عند المزوّد (حصّة/زحام): 503 unavailable والنصّ الخامّ في السجلّ وحده', async () => {
  process.env.TWELVEDATA_API_KEY = 'td-test';
  logged.length = 0;
  tdReply = () => ({ code: 500, message: 'Internal error at https://twelvedata.com/contact', status: 'error' });
  const r = await call({ mode: 'quote', symbol: 'MSFT1' });
  assert.equal(r.statusCode, 503);
  assert.deepEqual(r.payload, { error: 'unavailable' });
  assert.ok(logged.some((l) => /Internal error/.test(l)), 'الخامّ إلى logError: ' + logged.join(' | '));
});

test('بلا مفتاح الأسعار: 503 unavailable بلا اسم المتغيّر', async () => {
  delete process.env.TWELVEDATA_API_KEY;
  const r = await call({ mode: 'quote', symbol: 'AAPL' });
  assert.equal(r.statusCode, 503);
  assert.deepEqual(r.payload, { error: 'unavailable' });
  assert.doesNotMatch(JSON.stringify(r.payload), LEAK);
  process.env.TWELVEDATA_API_KEY = 'td-test';
});

test('الدرس بلا مفتاح المعلّم: 503 unavailable لا «Server is missing ANTHROPIC_API_KEY»', async () => {
  process.env.TWELVEDATA_API_KEY = 'td-test';
  const r = await call({ mode: 'learn', topic: 'RSI', token: 't' });
  assert.equal(r.statusCode, 503);
  assert.deepEqual(r.payload, { error: 'unavailable' });
});

// ---------- الواجهة ----------
const { boot } = require('./_stocks-vm.cjs');
const Q = { symbol: 'AAPL', name: 'Apple Inc', price: 343.46, open: 1, high: 2, low: 0.5, change: 1, changePct: 0.3, volume: 10 };
const S = { values: [{ t: '2026-07-01', c: 1 }, { t: '2026-07-02', c: 2 }] };
function ui(lang, badStatus, badBody) {
  return boot({ lang, route: (m, b) => {
    if (b.symbol === 'ZZZZ' && m === 'quote') return { status: badStatus, body: badBody };
    if (m === 'quote') return Q;
    if (m === 'series') return S;
    return {};
  } });
}
async function load(h, sym) { h.$('stockSymbolInput').value = sym; h.$('stockLoadBtn').click(); await h.flush(); }

test('الواجهة: رمز خاطئ بعد سهم صحيح ← نصّ المفتاح بلغة الواجهة و«حلل السهم» مخفيّ', async () => {
  for (const [lang, rx] of [['ar', /غير موجود/], ['en', /not found/i]]) {
    const h = ui(lang, 404, { error: 'symbol_not_found' });
    await load(h, 'AAPL');
    assert.equal(h.$('stockAnalyzeWrap').style.display, 'block', 'ظاهر بعد سهم صحيح');
    await load(h, 'ZZZZ');
    const st = h.$('stockStatus');
    assert.equal(st.style.display, 'block');
    assert.match(st.textContent, rx, lang + ': ' + st.textContent);
    assert.doesNotMatch(st.textContent, /symbol_not_found/);
    assert.doesNotMatch(st.textContent, LEAK);
    assert.equal(h.$('stockAnalyzeWrap').style.display, 'none', lang + ': «حلل السهم» مخفيّ بعد الفشل');
    assert.equal(h.$('stockQuoteCard').style.display, 'none');
  }
});

test('الواجهة: unavailable ← svcPaused (لا رمز خامّ)', async () => {
  const h = ui('ar', 503, { error: 'unavailable' });
  await load(h, 'ZZZZ');
  assert.equal(h.$('stockStatus').textContent, '⚠️ ' + h.I18N.ar.svcPaused);
});

test('الواجهة: فشل الدرس لا يعرض نصّ المزوّد (claudeError) بل svcPaused', async () => {
  const h = boot({ lang: 'ar', route: (m) => (m === 'learn' ? { lesson: null, claudeError: 'anthropic: credit balance is too low — https://console.anthropic.com' } : {}) });
  h.ctx.__stkShowTab('learn');
  h.$('stockLearnChips').children[0].click();
  await h.flush();
  const txt = h.$('stockLesson').textContent;
  assert.doesNotMatch(txt, /anthropic|credit|https?:/i, txt);
  assert.equal(txt, '⚠️ ' + h.I18N.ar.svcPaused);
});
