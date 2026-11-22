// tests/freeze-banner-bg.test.cjs — v-freeze-bg (لقطة عمران ٤ نوفمبر: بانر «التطبيق يستجيب ببطء» فوق محادثة عن إكسل — النافذة كانت
// خلف إكسل). المسبار (.shots/freeze-banner/probe.mjs، Chromium): الصفحة مخفيّة + ٨ث انشغال ← البانر، مع أنّ المستخدم لم يرَ تجمّدًا.
// هنا كاشف التجمّد نفسه (app-10-features) بعامل وساعة ومستند مزيّفين: لا يُحسب إلّا ما جرى والصفحة ظاهرة، وتوقّف العامل نفسه
// (نوم الجهاز) ليس تجمّدًا، والتجمّد الحقيقيّ والصفحة ظاهرة يُظهر البانر كما كان، ومهلة الإقلاع باقية.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-10-features.js'), 'utf8');
const s = SRC.indexOf('// --- Freeze detector');
const e = SRC.indexOf('// --- AppGallery 7.5', s);
const CODE = SRC.slice(s, e);

function world() {
  let now = 1000000;
  const listeners = {};
  const winListeners = {};
  const banner = { style: { display: 'none' } };
  let worker = null;
  let saved = 0;
  const doc = { hidden: false, addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); } };
  const ctx = {
    Date: { now: () => now },
    document: doc,
    window: { Worker: function () {}, addEventListener: (k, f) => { (winListeners[k] = winListeners[k] || []).push(f); } },
    Worker: function () { worker = this; this.terminate = () => {}; },
    Blob: function () {}, URL: { createObjectURL: () => 'blob:x' },
    $: (sel) => (sel === '#freezeBanner' ? banner : { onclick: null }),
    saveState: () => { saved++; }, __swallow() {},
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  return {
    banner, get saved() { return saved; },
    at(ms) { now = ms; },
    get now() { return now; },
    beat(sentAt, deliveredAt) { now = deliveredAt; worker.onmessage({ data: sentAt }); },
    hide() { doc.hidden = true; (listeners.visibilitychange || []).forEach((f) => f()); },
    show() { doc.hidden = false; (listeners.visibilitychange || []).forEach((f) => f()); },
  };
}
const BOOT = 1000000;
const AFTER_BOOT = BOOT + 20000;

test('١. تجمّد حقيقيّ والصفحة ظاهرة (نبضتان متأخّرتان ٧ث) ← البانر كما كان، بلا إعادة حفظ لحظة التجمّد (v-freeze-fix)', () => {
  const w = world();
  w.beat(AFTER_BOOT, AFTER_BOOT + 50);
  w.beat(AFTER_BOOT + 1000, AFTER_BOOT + 8000);
  w.beat(AFTER_BOOT + 2000, AFTER_BOOT + 8010);
  assert.equal(w.banner.style.display, 'flex');
  // v-freeze-fix: كان saveState() هنا يعيد الرفع والحفظ الكامل فوق التجمّد (تجمّد ثانٍ ١٤ث) — الحفظ المجمّع والخروج يحفظان العمل
  assert.equal(w.saved, 0);
});

test('٢. الصفحة مخفيّة (خلف نافذة أخرى) والانشغال نفسه ← لا بانر', () => {
  const w = world();
  w.beat(AFTER_BOOT, AFTER_BOOT + 50);
  w.at(AFTER_BOOT + 500); w.hide();
  w.beat(AFTER_BOOT + 1000, AFTER_BOOT + 8000);
  w.beat(AFTER_BOOT + 2000, AFTER_BOOT + 8010);
  assert.equal(w.banner.style.display, 'none');
});

test('٣. رجعت الصفحة والنبضات المتأخّرة من وقت الخفاء تصل بعد الظهور ← لا بانر', () => {
  const w = world();
  w.beat(AFTER_BOOT, AFTER_BOOT + 50);
  w.at(AFTER_BOOT + 500); w.hide();
  w.at(AFTER_BOOT + 8000); w.show();
  w.beat(AFTER_BOOT + 1000, AFTER_BOOT + 8005);
  w.beat(AFTER_BOOT + 2000, AFTER_BOOT + 8010);
  w.beat(AFTER_BOOT + 3000, AFTER_BOOT + 8015);
  assert.equal(w.banner.style.display, 'none', 'نبضات من قبل الظهور لا تُحسب');
  // وبعد الظهور، تجمّد حقيقيّ جديد يُحسب (العامل ينبض كلّ ثانية بلا انقطاع؛ النبضات تصل متأخّرة دفعة واحدة)
  for (let t = 4000; t <= 8000; t += 1000) w.beat(AFTER_BOOT + t, AFTER_BOOT + 8020 + t / 1000);
  w.beat(AFTER_BOOT + 9000, AFTER_BOOT + 16000);
  w.beat(AFTER_BOOT + 10000, AFTER_BOOT + 16010);
  assert.equal(w.banner.style.display, 'flex');
});

test('٤. العامل نفسه توقّف (نوم الجهاز: فجوة دقيقة بين نبضتين) ← لا بانر', () => {
  const w = world();
  w.beat(AFTER_BOOT, AFTER_BOOT + 50);
  w.beat(AFTER_BOOT + 60000, AFTER_BOOT + 67000);
  w.beat(AFTER_BOOT + 60500, AFTER_BOOT + 67010);
  assert.equal(w.banner.style.display, 'none');
});

test('٥. مهلة الإقلاع (١٨ث) باقية: تأخّر أثناء الإقلاع لا يُحسب', () => {
  const w = world();
  w.beat(BOOT + 1000, BOOT + 8000);
  w.beat(BOOT + 2000, BOOT + 8010);
  assert.equal(w.banner.style.display, 'none');
});
