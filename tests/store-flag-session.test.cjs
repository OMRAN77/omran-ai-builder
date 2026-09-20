// v-store-flag-session (١٨ سبتمبر ٢٠٢٦): علم حزمة هواوي (?store=huawei) يُحفظ في sessionStorage لا localStorage
// فلا يلتصق بالمتصفّح العاديّ ويخفي الأسهم والشريط إلى الأبد؛ والعلم القديم العالق يُمسح.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('selfdiag.js: العلم في sessionStorage، والقديم في localStorage يُمسح، والفرع يقرأ sessionStorage', () => {
  const sd = read('js/selfdiag.js');
  assert.ok(sd.includes("if(sp) sessionStorage.setItem('aiapp_store', String(sp).slice(0, 20));"), 'الحفظ في sessionStorage');
  assert.ok(sd.includes("try{ localStorage.removeItem('aiapp_store'); }catch(e){ /* guard-ok */ }"), 'مسح العلم القديم');
  assert.ok(sd.includes("if((sessionStorage.getItem('aiapp_store') || '') === 'huawei'){"), 'الفرع يقرأ sessionStorage');
  assert.ok(!sd.includes("localStorage.setItem('aiapp_store'"), 'لا حفظ دائم للعلم');
  // جولة الأدوات (مرّة واحدة) تبقى دائمة كما كانت
  assert.ok(sd.includes("localStorage.getItem('aiapp_store_tour')") && sd.includes("localStorage.setItem('aiapp_store_tour', '1')"));
  // ترتيب الفرع: العلم → store-safe → تبديل البيان (كما يثبته tests/store-huawei.test.cjs)
  assert.ok(sd.indexOf("sessionStorage.getItem('aiapp_store')") < sd.indexOf("classList.add('store-safe')"));
  assert.ok(sd.indexOf("classList.add('store-safe')") < sd.indexOf('/manifest-huawei.json'));
});

test('index.html: وسم selfdiag رُفع فلا يبقى متصفّح على النسخة الملتصقة', () => {
  assert.ok(read('index.html').includes('/js/selfdiag.js?v=hw-twa-2'));
});

test('tokens.css: الإخفاء تحت store-safe يشمل الزرّ والشريط والنافذة (السبب الذي بدا كحذف)', () => {
  const css = read('css/tokens.css');
  assert.match(css, /html\.store-safe #stockTicker,\nhtml\.store-safe #btnStocks,\nhtml\.store-safe #stocksModal,\nhtml\.store-safe #aboutStocksCard\{display:none !important;\}/);
});
