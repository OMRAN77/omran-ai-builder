// tests/stocks-fullscreen.test.cjs — v-stocks-full-restore (تدقيق ١٨–١٩ أكتوبر، g10 stocks-fullscreen): الخروج من «وضع شاشة البورصة»
// يحوّل الصفحة الكاملة إلى صندوق ٥٦٠px بزوايا ١٦ وحشوة ٢٠: فرع الخروج يعيد أنماط نافذة v384 القديمة (قبل v-stocks-fullpage).
// الآن تُحفظ أنماط ما قبل الدخول وتُعاد كما هي، والخروج من ملء الشاشة بـEsc (fullscreenchange) يعيدها أيضًا.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, A13 } = require('./_stocks-vm.cjs');

const snap = (h) => { const p = h.$('stocksPage').style; return { maxWidth: p.maxWidth, maxHeight: p.maxHeight, height: p.height, borderRadius: p.borderRadius, pad: h.$('stocksModal').style.padding }; };

test('نقرتان: الدخول ثمّ الخروج يعيدان الصفحة الكاملة كما كانت', async () => {
  const h = boot({ lang: 'ar' });
  const before = snap(h);
  const btn = h.$('stocksFullBtn');
  btn.click(); await h.flush();
  assert.equal(h.$('stocksPage').style.height, '100vh', 'الدخول كما كان');
  assert.equal(btn.textContent, '🗗');
  btn.click(); await h.flush();
  assert.deepEqual(snap(h), before);
  assert.equal(btn.textContent, '🖥️');
  assert.equal(h.doc.fullscreenElement, null);
});

test('الخروج من ملء الشاشة بـEsc يعيد الأنماط والزرّ (fullscreenchange)', async () => {
  const h = boot({ lang: 'ar' });
  const before = snap(h);
  const btn = h.$('stocksFullBtn');
  btn.click(); await h.flush();
  assert.ok(h.doc.fullscreenElement, 'دخل ملء الشاشة');
  h.doc.exitFullscreen(); await h.flush(); // Esc من المتصفّح
  assert.deepEqual(snap(h), before);
  assert.equal(btn.textContent, '🖥️');
  btn.click(); await h.flush();
  assert.equal(h.$('stocksPage').style.height, '100vh', 'النقرة التالية تدخل من جديد لا تخرج');
});

test('لا أثر لأنماط النافذة القديمة في المصدر', () => {
  const s = A13.slice(A13.indexOf('/* ----- Fullscreen market-screen mode'), A13.indexOf('const origLoad = loadSymbol;'));
  assert.doesNotMatch(s, /560px|90vh|'16px'|'20px'/);
});
