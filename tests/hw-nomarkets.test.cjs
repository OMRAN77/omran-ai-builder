'use strict';
/* v-hw-nomarkets (رفض هواوي ٢٩ سبتمبر، القاعدة 11.4؛ قرار المالك ٢ أكتوبر «شيلها من هواوي فقط وخلّها لي المالك والتطبيقات
   الأخرى»): داخل حزمة هواوي تُخفى الأسواق لكلّ حساب غير المالك؛ الموقع وحساب المالك بلا تغيير. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/selfdiag.js'), 'utf8');
const block = src.slice(src.indexOf('/* v-store-safe: رفض AppGallery'), src.indexOf('/* v-sat-revert'));

function run(search, user) {
  const cls = new Set(), appended = [];
  const store = (init) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const ctx = {
    location: { search }, URLSearchParams,
    sessionStorage: store({}), localStorage: store(Object.assign({ aiapp_store_tour: '1' }, user ? { aiapp_username: user } : {})),
    setTimeout() {},
    document: { readyState: 'complete', documentElement: { classList: { add: (c) => cls.add(c), contains: (c) => cls.has(c) }, appendChild: (x) => appended.push(x) }, head: { appendChild: (x) => appended.push(x) }, querySelector: () => null, createElement: () => ({}) },
  };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return { cls, appended };
}

test('١. حزمة هواوي بلا حساب أو بحساب آخر = الأسواق مخفيّة (المراجع لا يراها)', () => {
  for (const u of [null, 'sara', 'reviewer1']) {
    const r = run('?store=huawei', u);
    assert.ok(r.cls.has('store-safe') && r.cls.has('store-nomarkets'), String(u));
    const css = r.appended.find((x) => x.id === 'hwNoMarketsCss').textContent;
    for (const id of ['#stockTicker', '#stockTickerToggle', '#btnStocks', '#stocksModal', '#aboutStocksCard']) assert.ok(css.includes('html.store-nomarkets ' + id), id);
  }
});

test('٢. حساب المالك داخل هواوي، والموقع للجميع = الأسواق كما هي', () => {
  const owner = run('?store=huawei', 'Omran');
  assert.ok(owner.cls.has('store-safe') && !owner.cls.has('store-nomarkets'));
  const web = run('', 'sara');
  assert.ok(!web.cls.has('store-safe') && !web.cls.has('store-nomarkets'));
});

test('٣. لا نداء أسعار تحت الإخفاء، والملاحظات للمراجع صادقة، ووسم selfdiag مرفوع', () => {
  const s13 = fs.readFileSync(path.join(root, 'js/app-13-stocks-init.js'), 'utf8');
  assert.ok(s13.includes("if(document.documentElement.classList.contains('store-nomarkets')) return;"));
  assert.ok(s13.indexOf("contains('store-nomarkets')") < s13.indexOf("fetch('/api/tools?action=stocks'"));
  assert.match(fs.readFileSync(path.join(root, 'store/huawei/REVIEW-NOTES.md'), 'utf8'), /all market screens \(stock ticker, stock market, currency\/forex rates\) are removed from this package/);
  assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('/js/selfdiag.js?v=hw-twa-8'));
});
